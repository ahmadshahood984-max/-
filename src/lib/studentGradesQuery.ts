/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { commitFirestoreBatchViaRest, commitFirestoreDeletesViaRest, db, deleteFirestoreDocFast, getDocCacheFirst, writeFirestoreDocFast } from './firebase';
import { 
  collection,
  doc, 
  getDocs,
  setDoc, 
  writeBatch
} from 'firebase/firestore';
import { Grade, SentGradeSheet } from '../types';
import { trackFirestoreRead, trackFirestoreWrite } from './firestoreTracker';
import {
  isFirestoreWriteQuotaExceeded,
  isFirestoreReadQuotaExceeded,
  markFirestoreWriteQuotaExceeded,
  markFirestoreReadQuotaExceeded,
  isQuotaError
} from './quotaManager';
import { enqueuePendingGradeBatch, getPendingGradeBatches, removePendingGradeBatch, removePendingGradeBatchesForStudents, clearPendingGradeBatches, getVaultItem, setVaultItem, removeVaultItem } from './offlineVault';
import { isReadCacheFresh, markReadCacheFresh, invalidateReadCache } from './readCache';

/**
 * Interface for Consolidated Single-Document Student Grades
 * Stored at: `students_grades/{studentId}`
 * Consolidates all 7 subject grades, total, and percentage into ONE single document.
 */
export interface ConsolidatedStudentGradeRecord {
  studentId: string;
  studentName?: string;
  classId?: string;
  className?: string;
  unifiedNo?: string;
  rollNo?: string;
  term?: string;
  evaluationMonth?: string;
  // Map of all 7 subjects (+ any custom subjects)
  subjects: {
    [subjectName: string]: {
      score: number | null;
      maxScore: number;
      examName?: string;
      notes?: string;
      date?: string;
    };
  };
  totalScore: number;
  maxTotalScore: number;
  percentage: number;
  estimation: string; // e.g. "ممتاز", "جيد جداً"
  teacherNotes?: string;
  directorNotes?: string;
  approvedSheets?: SentGradeSheet[];
  updatedAt: number;
}

/**
 * Normalizes identifier string for reliable comparison
 */
function normalizeId(id: string | number | undefined | null): string {
  if (id === undefined || id === null) return '';
  return String(id).trim();
}

/**
 * Calculates total, max, percentage, and qualitative estimation from a subjects map
 */
export function calculateGradesSummary(subjectsMap: ConsolidatedStudentGradeRecord['subjects']): {
  totalScore: number;
  maxTotalScore: number;
  percentage: number;
  estimation: string;
} {
  let total = 0;
  let maxTotal = 0;

  Object.values(subjectsMap || {}).forEach(sub => {
    if (sub && sub.score !== null && !isNaN(Number(sub.score))) {
      total += Number(sub.score);
    }
    maxTotal += Number(sub?.maxScore || 100);
  });

  const percentage = maxTotal > 0 ? Math.round((total / maxTotal) * 100 * 10) / 10 : 0;
  let estimation = 'ضعيف';
  if (percentage >= 90) estimation = 'ممتاز';
  else if (percentage >= 80) estimation = 'جيد جداً';
  else if (percentage >= 70) estimation = 'جيد';
  else if (percentage >= 60) estimation = 'مقبول';

  return {
    totalScore: total,
    maxTotalScore: maxTotal,
    percentage,
    estimation
  };
}

/**
 * Convert a ConsolidatedStudentGradeRecord into standard Grade[] array
 * for seamless backward-compatibility with all existing application views.
 */
export function unpackConsolidatedGrades(rec: ConsolidatedStudentGradeRecord): Grade[] {
  const list: Grade[] = [];
  const sId = rec.studentId;
  const month = rec.evaluationMonth || rec.term || 'general';

  Object.entries(rec.subjects || {}).forEach(([subjectName, s]) => {
    if (!s || s.score === null || s.score === undefined) return;
    list.push({
      id: `${sId}_${subjectName}_${month}`,
      studentId: sId,
      subject: subjectName,
      examName: s.examName || month,
      score: Number(s.score),
      maxScore: Number(s.maxScore) || 100,
      date: s.date || new Date().toISOString().split('T')[0],
      teacherId: 'teacher',
      term: rec.term || month,
      classId: rec.classId,
      notes: s.notes || rec.teacherNotes || ''
    });
  });

  return list;
}

/**
 * Synchronizes an individual grade mutation into the student's consolidated document in Firestore:
 * `students_grades/{studentId}`
 */
export async function syncSingleGradeToFirestore(grade: Grade): Promise<void> {
  const sId = normalizeId(grade.studentId);
  if (!sId) return;

  await saveSingleStudentGradesConsolidated(sId, {
    subjects: {
      [grade.subject]: {
        score: grade.score,
        maxScore: grade.maxScore || 100,
        examName: grade.examName,
        notes: grade.notes
      }
    }
  });
}

/**
 * OPTIMIZED CACHE-FIRST PARENT VIEW:
 * Reads the specific student's SINGLE document via IndexedDB persistentLocalCache first (`0 server reads`).
 * Falls back to `doc(db, "students_grades", studentId)` only on cache miss or when `forceServer = true`.
 */
export async function fetchStudentGradesOnDemand(
  currentUserId: string,
  term?: string,
  fallbackUnifiedNo?: string,
  forceServer: boolean = false
): Promise<Grade[]> {
  const cleanUserId = normalizeId(currentUserId);
  if (!cleanUserId) return [];

  const cacheKey = `students_grades_on_demand:${cleanUserId}`;
  if (!forceServer && isReadCacheFresh(cacheKey)) {
    const cachedLocal = getLocalStudentGrades(cleanUserId, fallbackUnifiedNo);
    if (cachedLocal.length > 0) return cachedLocal;
  }

  if (!db) {
    return getLocalStudentGrades(cleanUserId, fallbackUnifiedNo);
  }

  // If read quota circuit-breaker is tripped, allow cache-only reads without hitting server
  const effectiveForceServer = isFirestoreReadQuotaExceeded() ? false : forceServer;

  try {
    // 1. Direct single-document cache-first read for primary studentId
    const docRef = doc(db, 'students_grades', cleanUserId);
    const { snap, fromCache } = await getDocCacheFirst(docRef, {
      forceServer: effectiveForceServer,
      timeoutMs: 2500
    });

    if (snap && !fromCache) {
      trackFirestoreRead(1, `قراءة درجات طالب (${cleanUserId})`);
      markReadCacheFresh(cacheKey);
    }
    if (snap && snap.exists()) {
      const data = snap.data() as ConsolidatedStudentGradeRecord;
      if (data && data.subjects) {
        const studentGrades = unpackConsolidatedGrades(data);
        mergeStudentGradesIntoLocalStorage(studentGrades);
        markReadCacheFresh(cacheKey);
        return studentGrades;
      }
    }

    // 2. Fallback direct single-document cache-first read for fallbackUnifiedNo (if different)
    if (fallbackUnifiedNo && fallbackUnifiedNo !== cleanUserId) {
      const cleanUnified = normalizeId(fallbackUnifiedNo);
      const altRef = doc(db, 'students_grades', cleanUnified);
      const { snap: altSnap, fromCache: altFromCache } = await getDocCacheFirst(altRef, {
        forceServer: effectiveForceServer,
        timeoutMs: 2000
      });

      if (altSnap && !altFromCache) {
        trackFirestoreRead(1, `قراءة درجات طالب (${cleanUnified})`);
      }
      if (altSnap && altSnap.exists()) {
        const data = altSnap.data() as ConsolidatedStudentGradeRecord;
        if (data && data.subjects) {
          const altGrades = unpackConsolidatedGrades(data);
          mergeStudentGradesIntoLocalStorage(altGrades);
          markReadCacheFresh(cacheKey);
          return altGrades;
        }
      }
    }
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreReadQuotaExceeded(err);
    } else {
      console.warn('[StudentGrades] Notice retrieving consolidated document:', err?.message || err);
    }
  }

  // Graceful fallback to local storage cache
  return getLocalStudentGrades(cleanUserId, fallbackUnifiedNo);
}

const consolidatedRecordMemoryCache = new Map<string, ConsolidatedStudentGradeRecord>();
const serverConfirmedMissingStudentIds = new Set<string>();
const CONSOLIDATED_VAULT_PREFIX = 'student_consolidated_cache_v1_';

export async function cacheConsolidatedRecordToVault(rec: ConsolidatedStudentGradeRecord): Promise<void> {
  const cleanId = normalizeId(rec?.studentId);
  if (!cleanId) return;
  consolidatedRecordMemoryCache.set(cleanId, rec);
  serverConfirmedMissingStudentIds.delete(cleanId);
  await setVaultItem(`${CONSOLIDATED_VAULT_PREFIX}${cleanId}`, JSON.stringify(rec)).catch(() => {});
}

export async function removeConsolidatedRecordFromVault(studentId: string): Promise<void> {
  const cleanId = normalizeId(studentId);
  if (!cleanId) return;
  consolidatedRecordMemoryCache.delete(cleanId);
  invalidateReadCache(`students_grades_record:${cleanId}`);
  invalidateReadCache(`students_grades_on_demand:${cleanId}`);
  await removeVaultItem(`${CONSOLIDATED_VAULT_PREFIX}${cleanId}`).catch(() => {});
}

export async function getCachedConsolidatedRecordFromVault(studentId: string): Promise<ConsolidatedStudentGradeRecord | null> {
  const cleanId = normalizeId(studentId);
  if (!cleanId) return null;
  const mem = consolidatedRecordMemoryCache.get(cleanId);
  if (mem) return mem;
  try {
    const raw = await getVaultItem(`${CONSOLIDATED_VAULT_PREFIX}${cleanId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as ConsolidatedStudentGradeRecord;
      if (parsed && parsed.studentId) {
        consolidatedRecordMemoryCache.set(cleanId, parsed);
        return parsed;
      }
    }
  } catch {}
  return null;
}

export function isConsolidatedRecordConfirmedMissingOnServer(studentId: string): boolean {
  const cleanId = normalizeId(studentId);
  return cleanId ? serverConfirmedMissingStudentIds.has(cleanId) : false;
}

/**
 * Directly fetch the full consolidated record for a student (IndexedDB Vault cache-first by default)
 */
export async function fetchConsolidatedStudentRecord(
  studentId: string,
  fallbackUnifiedNo?: string,
  forceServer: boolean = false
): Promise<ConsolidatedStudentGradeRecord | null> {
  const cleanId = normalizeId(studentId);
  if (!cleanId) return null;

  const cacheKey = `students_grades_record:${cleanId}`;
  if (!forceServer) {
    const mem = consolidatedRecordMemoryCache.get(cleanId);
    if (mem) return mem;
    if (isReadCacheFresh(cacheKey) && serverConfirmedMissingStudentIds.has(cleanId)) return null;
    const vaulted = await getCachedConsolidatedRecordFromVault(cleanId);
    if (vaulted) return vaulted;
  }

  if (!db) {
    return getLocalConsolidatedRecord(cleanId, fallbackUnifiedNo);
  }

  const effectiveForceServer = isFirestoreReadQuotaExceeded() ? false : forceServer;

  try {
    const docRef = doc(db, 'students_grades', cleanId);
    const { snap, fromCache } = await getDocCacheFirst(docRef, {
      forceServer: effectiveForceServer,
      timeoutMs: 2500
    });

    if (snap && !fromCache) {
      trackFirestoreRead(1, `قراءة السجل الموحد (${cleanId})`);
      markReadCacheFresh(cacheKey);
    }
    if (snap && snap.exists()) {
      const rec = snap.data() as ConsolidatedStudentGradeRecord;
      void cacheConsolidatedRecordToVault({ ...rec, studentId: rec.studentId || cleanId });
      markReadCacheFresh(cacheKey);
      return rec;
    }

    let altMissingConfirmed = !fallbackUnifiedNo || normalizeId(fallbackUnifiedNo) === cleanId;
    if (fallbackUnifiedNo && normalizeId(fallbackUnifiedNo) !== cleanId) {
      const altId = normalizeId(fallbackUnifiedNo);
      const altRef = doc(db, 'students_grades', altId);
      const { snap: altSnap, fromCache: altFromCache } = await getDocCacheFirst(altRef, {
        forceServer: effectiveForceServer,
        timeoutMs: 2000
      });
      if (altSnap && !altFromCache) {
        trackFirestoreRead(1, `قراءة السجل الموحد (${fallbackUnifiedNo})`);
      }
      if (altSnap && altSnap.exists()) {
        const rec = altSnap.data() as ConsolidatedStudentGradeRecord;
        void cacheConsolidatedRecordToVault({ ...rec, studentId: rec.studentId || cleanId });
        markReadCacheFresh(cacheKey);
        return rec;
      }
      altMissingConfirmed = Boolean(altSnap && !altFromCache && !altSnap.exists());
    }

    if (snap && !fromCache && !snap.exists() && altMissingConfirmed) {
      consolidatedRecordMemoryCache.delete(cleanId);
      serverConfirmedMissingStudentIds.add(cleanId);
      markReadCacheFresh(cacheKey);
      return null;
    }
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreReadQuotaExceeded(err);
    }
  }

  return getLocalConsolidatedRecord(cleanId, fallbackUnifiedNo);
}

/**
 * Builds a consolidated record from local storage cache
 */
function getLocalConsolidatedRecord(studentId: string, unifiedNo?: string): ConsolidatedStudentGradeRecord | null {
  const grades = getLocalStudentGrades(studentId, unifiedNo);
  if (grades.length === 0) return null;

  const subjectsMap: ConsolidatedStudentGradeRecord['subjects'] = {};
  grades.forEach(g => {
    subjectsMap[g.subject] = {
      score: g.score,
      maxScore: g.maxScore || 100,
      examName: g.examName,
      date: g.date,
      notes: g.notes
    };
  });

  const summary = calculateGradesSummary(subjectsMap);

  return {
    studentId,
    subjects: subjectsMap,
    ...summary,
    updatedAt: Date.now()
  };
}

/**
 * Reads grades for a specific student from local storage
 */
export function getLocalStudentGrades(studentId: string, unifiedNo?: string): Grade[] {
  try {
    const raw = localStorage.getItem('school_grades');
    if (!raw) return [];
    const all: Grade[] = JSON.parse(raw);
    if (!Array.isArray(all)) return [];

    const targetId = normalizeId(studentId);
    const targetUnified = normalizeId(unifiedNo);

    let deletedMonths: Record<string, number> = {};
    try {
      const dmRaw = localStorage.getItem('school_deleted_evaluation_months');
      if (dmRaw) deletedMonths = JSON.parse(dmRaw) || {};
    } catch {}

    return all.filter(g => {
      const gStudent = normalizeId(g.studentId);
      const matchesStudent = gStudent === targetId || (Boolean(targetUnified) && gStudent === targetUnified);
      if (!matchesStudent) return false;
      const m = String(g.examName || '').trim();
      const delTs = m ? Number(deletedMonths[m]) || 0 : 0;
      if (delTs > 0) {
        let gTs = Number((g as any).updatedAt) || 0;
        if (gTs <= 0 && g.date) {
          const dStr = String(g.date).trim();
          const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dStr);
          if (dateOnlyMatch) {
            gTs = Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]), 23, 59, 59, 999);
          } else {
            gTs = new Date(dStr).getTime() || 0;
          }
        }
        if (gTs <= 0 || delTs >= gTs) return false;
      }
      return true;
    });
  } catch {
    return [];
  }
}

/**
 * Merges freshly fetched student grades into localStorage.school_grades safely
 */
function mergeStudentGradesIntoLocalStorage(freshGrades: Grade[]) {
  try {
    const raw = localStorage.getItem('school_grades');
    const existing: Grade[] = raw ? JSON.parse(raw) : [];
    const map = new Map<string, Grade>();

    if (Array.isArray(existing)) {
      existing.forEach(g => {
        const key = `${g.studentId}_${g.subject}_${g.examName || ''}`;
        map.set(key, g);
      });
    }

    freshGrades.forEach(g => {
      const key = `${g.studentId}_${g.subject}_${g.examName || ''}`;
      map.set(key, g);
    });

    const merged = Array.from(map.values());
    localStorage.setItem('school_grades', JSON.stringify(merged));
  } catch (err) {
    console.warn('[StudentGrades] Error merging to local storage:', err);
  }
}

/**
 * Helper to commit a consolidated batch directly to Firestore without queueing again.
 */
async function commitConsolidatedBatchToFirestore(
  records: Array<{
    studentId: string;
    studentName?: string;
    classId?: string;
    className?: string;
    unifiedNo?: string;
    rollNo?: string;
    month?: string;
    subjects: { [subjectName: string]: { score: number | null; maxScore: number; examName?: string; notes?: string } };
    teacherNotes?: string;
    directorNotes?: string;
    approvedSheets?: SentGradeSheet[];
  }>
): Promise<boolean> {
  if (!records || records.length === 0 || !db || isFirestoreWriteQuotaExceeded()) return false;

  for (let i = 0; i < records.length; i += 400) {
    const chunk = records.slice(i, i + 400);
    const batch = writeBatch(db);
    const chunkPayloads: Array<{ cleanId: string; payload: ConsolidatedStudentGradeRecord; merge: boolean }> = [];

    chunk.forEach(rec => {
      const cleanId = normalizeId(rec.studentId);
      if (!cleanId) return;

      const summary = calculateGradesSummary(rec.subjects);

      const docRef = doc(db, 'students_grades', cleanId);
      const payload: ConsolidatedStudentGradeRecord = {
        studentId: cleanId,
        studentName: rec.studentName || '',
        classId: rec.classId || '',
        className: rec.className || '',
        unifiedNo: rec.unifiedNo || '',
        rollNo: rec.rollNo || '',
        evaluationMonth: rec.month || '',
        subjects: rec.subjects || {},
        ...summary,
        teacherNotes: rec.teacherNotes || '',
        directorNotes: rec.directorNotes || '',
        ...(Array.isArray(rec.approvedSheets) ? { approvedSheets: rec.approvedSheets } : {}),
        updatedAt: Date.now()
      };

      const merge = !Array.isArray(rec.approvedSheets);
      chunkPayloads.push({ cleanId, payload, merge });
      if (merge) {
        batch.set(docRef, payload, { merge: true });
      } else {
        batch.set(docRef, payload);
      }
    });

    let sdkBatchSucceeded = false;
    let sdkBatchError: unknown = null;
    const sdkBatchPromise = batch.commit().then(() => {
      sdkBatchSucceeded = true;
    });
    // Prevent unhandled rejection if REST fallback completes first
    sdkBatchPromise.catch(() => {});

    try {
      await Promise.race([
        sdkBatchPromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('batch_timeout')), 2000))
      ]);
    } catch (err) {
      sdkBatchError = err;
    }

    if (!sdkBatchSucceeded) {
      // Never run REST fallback if Firestore already returned a quota/429 or permission error
      const errMsg = String((sdkBatchError as any)?.message || sdkBatchError || '').toLowerCase();
      if (isQuotaError(sdkBatchError) || errMsg.includes('permission') || errMsg.includes('missing or insufficient')) {
        throw sdkBatchError;
      }
      // Single-round-trip Firestore REST :commit for the entire chunk (typically < 500ms)
      await commitFirestoreBatchViaRest(
        chunkPayloads.map(({ cleanId, payload, merge }) => ({
          collectionName: 'students_grades',
          docId: cleanId,
          data: payload,
          merge
        })),
        8500
      );
    }

    trackFirestoreWrite(chunk.length, `حفظ دفعة درجات (${chunk.length} طالب)`);
  }
  return true;
}

let isFlushingGradeBatches = false;

/**
 * Flushes any consolidated student grade batches saved while offline.
 * Deduplicates queued batches by studentId so multiple offline edits only write once per student.
 */
export async function flushPendingGradeBatches(): Promise<number> {
  if (!db || isFirestoreWriteQuotaExceeded() || isFlushingGradeBatches) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;

  isFlushingGradeBatches = true;
  let flushed = 0;
  try {
    const batches = await getPendingGradeBatches();
    if (!batches || batches.length === 0) return 0;

    // Sort oldest -> newest so latest record per student wins
    const sorted = [...batches].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const latestByStudent = new Map<string, typeof batches[number]['records'][number]>();
    const batchIds: string[] = [];

    for (const item of sorted) {
      batchIds.push(item.id);
      for (const rec of item.records || []) {
        const cleanId = normalizeId(rec?.studentId);
        if (cleanId) {
          latestByStudent.set(cleanId, rec);
        }
      }
    }

    const dedupedRecords = Array.from(latestByStudent.values());
    if (dedupedRecords.length === 0) {
      await Promise.all(batchIds.map((id) => removePendingGradeBatch(id)));
      return 0;
    }

    const ok = await commitConsolidatedBatchToFirestore(dedupedRecords);
    if (ok) {
      await Promise.all(batchIds.map((id) => removePendingGradeBatch(id)));
      flushed = batchIds.length;
    }
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreWriteQuotaExceeded(err);
    }
  } finally {
    isFlushingGradeBatches = false;
  }
  return flushed;
}

/**
 * BATCH OPERATIONS:
 * Saves consolidated student grades for multiple students in a single Firestore writeBatch.
 * Safely queues in IndexedDB when offline so nothing blocks and all changes sync on reconnect.
 */
export async function batchSaveStudentsGradesConsolidated(
  records: Array<{
    studentId: string;
    studentName?: string;
    classId?: string;
    className?: string;
    unifiedNo?: string;
    rollNo?: string;
    month?: string;
    subjects: { [subjectName: string]: { score: number | null; maxScore: number; examName?: string; notes?: string } };
    teacherNotes?: string;
    directorNotes?: string;
    approvedSheets?: SentGradeSheet[];
  }>
): Promise<boolean> {
  if (!records || records.length === 0) return true;

  const changedRecords: typeof records = [];
  const pendingSigUpdates: Array<{ cleanId: string; sig: string; subSig: string }> = [];

  records.forEach((rec) => {
    const cleanId = normalizeId(rec.studentId);
    if (!cleanId) return;
    const sig = computeRecordSignature(rec);
    if (lastSyncedConsolidatedSignatures.get(cleanId) === sig) {
      return;
    }
    pendingSigUpdates.push({
      cleanId,
      sig,
      subSig: computeSubjectsSignature(rec.subjects)
    });
    changedRecords.push(rec);
  });

  if (changedRecords.length === 0) return true;

  const batchId = `gb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await enqueuePendingGradeBatch(batchId, changedRecords);

  if (!db || isFirestoreWriteQuotaExceeded()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  try {
    const commitPromise = commitConsolidatedBatchToFirestore(changedRecords)
      .then(async (ok) => {
        if (ok) {
          pendingSigUpdates.forEach(({ cleanId, sig, subSig }) => {
            lastSyncedConsolidatedSignatures.set(cleanId, sig);
            lastSyncedConsolidatedSignatures.set(`subjects_${cleanId}`, subSig);
          });
          persistConsolidatedSignaturesToStorage();
          await removePendingGradeBatch(batchId);
        }
        return ok;
      })
      .catch((err: any) => {
        if (isQuotaError(err)) {
          markFirestoreWriteQuotaExceeded(err);
        } else {
          console.warn('[BatchGrades] Notice in batch save (queued offline):', err?.message || err);
        }
        return false;
      });

    // Wait up to 11s (2s SDK + single REST batch commit) for real Firestore confirmation
    const committed = await Promise.race([
      commitPromise,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 11000))
    ]);
    return committed;
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreWriteQuotaExceeded(err);
    }
    return false;
  }
}

/**
 * Persists a single student's consolidated grades record to Firestore:
 * `students_grades/{studentId}`
 * Queues cleanly in IndexedDB if offline so edits never get lost or hang UI.
 */
export async function saveSingleStudentGradesConsolidated(
  studentId: string,
  docData: Partial<ConsolidatedStudentGradeRecord>
): Promise<boolean> {
  const cleanId = normalizeId(studentId);
  if (!cleanId) return false;

  const batchId = `gs_${cleanId}_${Date.now()}`;
  if (docData.subjects) {
    await enqueuePendingGradeBatch(batchId, [{
      studentId: cleanId,
      studentName: docData.studentName,
      classId: docData.classId,
      className: docData.className,
      unifiedNo: docData.unifiedNo,
      rollNo: docData.rollNo,
      month: docData.evaluationMonth || docData.term,
      subjects: docData.subjects,
      teacherNotes: docData.teacherNotes,
      directorNotes: docData.directorNotes
    }]);
  }

  if (!db || isFirestoreWriteQuotaExceeded()) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  try {
    const summary = docData.subjects ? calculateGradesSummary(docData.subjects) : undefined;
    const docRef = doc(db, 'students_grades', cleanId);
    const payload = {
      ...docData,
      ...(summary || {}),
      studentId: cleanId,
      updatedAt: Date.now()
    };

    const writePromise = setDoc(docRef, payload, { merge: true })
      .then(async () => {
        trackFirestoreWrite(1, `حفظ درجات طالب (${cleanId})`);
        await removePendingGradeBatch(batchId);
        return true;
      })
      .catch((err: any) => {
        if (isQuotaError(err)) {
          markFirestoreWriteQuotaExceeded(err);
        }
        return false;
      });

    await Promise.race([
      writePromise,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 2000))
    ]);
    return true;
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreWriteQuotaExceeded(err);
    }
    return true;
  }
}

const CONSOLIDATED_SIGS_STORAGE_KEY = 'school_consolidated_synced_sigs_v1';
const lastSyncedConsolidatedSignatures = new Map<string, string>();
let sigsHydratedFromVault = false;

function compactHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}`;
}

function hydrateSignaturesFromJson(rawSigs: string | null) {
  if (!rawSigs) return;
  try {
    const parsed = JSON.parse(rawSigs);
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([k, v]) => {
        if (typeof v === 'string' && !lastSyncedConsolidatedSignatures.has(k)) {
          lastSyncedConsolidatedSignatures.set(k, v);
        }
      });
    }
  } catch {}
}

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    hydrateSignaturesFromJson(window.localStorage.getItem(CONSOLIDATED_SIGS_STORAGE_KEY));
  }
} catch {}

async function ensureSignaturesHydratedFromVault(): Promise<void> {
  if (sigsHydratedFromVault) return;
  sigsHydratedFromVault = true;
  try {
    const vaultRaw = await getVaultItem(CONSOLIDATED_SIGS_STORAGE_KEY);
    hydrateSignaturesFromJson(vaultRaw);
  } catch {}
}

function persistConsolidatedSignaturesToStorage(): void {
  const obj: Record<string, string> = {};
  lastSyncedConsolidatedSignatures.forEach((v, k) => {
    // Store compact hash values to keep storage footprint tiny (<5KB)
    obj[k] = v.length > 32 ? compactHash(v) : v;
  });
  const serialized = JSON.stringify(obj);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CONSOLIDATED_SIGS_STORAGE_KEY, serialized);
    }
  } catch {}
  setVaultItem(CONSOLIDATED_SIGS_STORAGE_KEY, serialized).catch(() => {});
}

function computeSubjectsSignature(subjects: any): string {
  try {
    const normalized: Record<string, { score: number | null; maxScore: number; examName: string }> = {};
    if (subjects && typeof subjects === 'object') {
      Object.keys(subjects).sort().forEach((k) => {
        const entry = subjects[k];
        if (entry && typeof entry === 'object') {
          normalized[k] = {
            score: entry.score !== null && entry.score !== undefined ? Number(entry.score) : null,
            maxScore: Number(entry.maxScore) || 100,
            examName: String(entry.examName || '')
          };
        }
      });
    }
    return compactHash(JSON.stringify(normalized));
  } catch {
    return String(Date.now());
  }
}

function computeRecordSignature(rec: { subjects: any; teacherNotes?: string; directorNotes?: string; month?: string }): string {
  try {
    return compactHash(JSON.stringify({
      m: rec.month || '',
      s: computeSubjectsSignature(rec.subjects),
      tn: rec.teacherNotes || '',
      dn: rec.directorNotes || ''
    }));
  } catch {
    return String(Date.now());
  }
}

/**
 * Migration helper to batch seed existing Grade[] array into consolidated documents
 * Only writes students whose consolidated subjects actually changed to avoid write amplification.
 */
export async function seedGradesToStudentCollection(grades: Grade[]): Promise<void> {
  if (!Array.isArray(grades) || grades.length === 0) return;

  const studentMap = new Map<string, {
    studentId: string;
    subjects: { [sub: string]: { score: number | null; maxScore: number; examName?: string } };
  }>();

  grades.forEach(g => {
    const sId = normalizeId(g.studentId);
    if (!sId) return;

    if (!studentMap.has(sId)) {
      studentMap.set(sId, { studentId: sId, subjects: {} });
    }
    const rec = studentMap.get(sId)!;
    rec.subjects[g.subject] = {
      score: g.score,
      maxScore: g.maxScore || 100,
      examName: g.examName
    };
  });

  const changedRecords: Array<{
    studentId: string;
    subjects: { [sub: string]: { score: number | null; maxScore: number; examName?: string } };
  }> = [];

  studentMap.forEach((r) => {
    const sig = computeSubjectsSignature(r.subjects);
    if (lastSyncedConsolidatedSignatures.get(`subjects_${r.studentId}`) !== sig) {
      lastSyncedConsolidatedSignatures.set(`subjects_${r.studentId}`, sig);
      changedRecords.push({
        studentId: r.studentId,
        subjects: r.subjects
      });
    }
  });

  if (changedRecords.length > 0) {
    const batchId = `gsd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await enqueuePendingGradeBatch(batchId, changedRecords);
    if (db && !isFirestoreWriteQuotaExceeded() && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      commitConsolidatedBatchToFirestore(changedRecords)
        .then(async (ok) => {
          if (ok) await removePendingGradeBatch(batchId);
        })
        .catch(() => {});
    }
  }
}

let consolidatedSyncChain: Promise<boolean> = Promise.resolve(true);

/**
 * Sync student summaries from SentGradeSheet records into consolidated single-document records,
 * skipping previously synced identical student snapshots to avoid redundant Firestore writes.
 */
export function syncSentGradeSheetsToConsolidatedCollection(
  sheets: SentGradeSheet[],
  options?: { onlyStudentIds?: string[] }
): Promise<boolean> {
  const run = consolidatedSyncChain.then(() =>
    runSyncSentGradeSheetsToConsolidatedCollection(sheets, options)
  );
  consolidatedSyncChain = run.catch(() => false);
  return run;
}

async function runSyncSentGradeSheetsToConsolidatedCollection(
  sheets: SentGradeSheet[],
  options?: { onlyStudentIds?: string[] }
): Promise<boolean> {
  if (!Array.isArray(sheets) || sheets.length === 0) return true;
  await ensureSignaturesHydratedFromVault();
  const scopedIds = options?.onlyStudentIds && options.onlyStudentIds.length > 0
    ? new Set(options.onlyStudentIds.map(normalizeId).filter(Boolean))
    : null;

  // STRICT GATE: Only Director-approved/sent grade sheets may be synced to students_grades.
  // Never sync teacher-submitted ('submitted') or draft sheets before the Director approves & sends them.
  const approvedSheets = sheets.filter(
    (s) => s && (s.status === 'approved' || (!s.teacherId && s.status !== 'submitted' && s.status !== 'draft'))
  );
  if (approvedSheets.length === 0) return true;

  // Sort class-specific sheets before any legacy 'cohort' sheets, newest first, and Director before Teacher
  const orderedSheets = [...approvedSheets].sort((a, b) => {
    const aIsCohort = a.classId === 'cohort' ? 1 : 0;
    const bIsCohort = b.classId === 'cohort' ? 1 : 0;
    if (aIsCohort !== bIsCohort) return aIsCohort - bIsCohort;
    const timeDiff = (new Date(b.dateSent || 0).getTime() || 0) - (new Date(a.dateSent || 0).getTime() || 0);
    if (timeDiff !== 0) return timeDiff;
    const aIsTeacher = a.teacherId ? 1 : 0;
    const bIsTeacher = b.teacherId ? 1 : 0;
    return aIsTeacher - bIsTeacher;
  });

  // Build per-student scoped approved sheets list (max 6 recent entries per student, deduplicated per class+month+role)
  const perStudentApprovedSheets = new Map<string, SentGradeSheet[]>();
  const perStudentSheetKeys = new Map<string, Set<string>>();
  for (const sheet of orderedSheets) {
    const isCohortSheet = sheet.classId === 'cohort';
    const roleTag = sheet.teacherId ? `t_${sheet.teacherId}` : 'director';
    const scopeKey = `${sheet.classId || sheet.className || 'all'}_${String(sheet.month || '').trim()}_${roleTag}`;
    const monthKey = String(sheet.month || '').trim();

    for (const st of sheet.studentsSummary || []) {
      const cleanId = normalizeId(st.studentId);
      if (!cleanId) continue;
      const existing = perStudentApprovedSheets.get(cleanId) || [];
      const seenKeys = perStudentSheetKeys.get(cleanId) || new Set<string>();

      // Skip any legacy cohort sheet if a class-specific sheet already exists for this student & month
      if (isCohortSheet && existing.some((sh) => String(sh.month || '').trim() === monthKey && sh.classId !== 'cohort')) {
        continue;
      }

      if (existing.length < 6 && !seenKeys.has(scopeKey)) {
        seenKeys.add(scopeKey);
        existing.push({
          id: sheet.id,
          title: sheet.title,
          month: sheet.month,
          classId: sheet.classId,
          className: sheet.className,
          cohort: sheet.cohort,
          dateSent: sheet.dateSent,
          sentBy: sheet.sentBy,
          ...(sheet.teacherId ? { teacherId: sheet.teacherId } : {}),
          status: 'approved',
          studentCount: 1,
          studentsSummary: [st]
        });
        perStudentApprovedSheets.set(cleanId, existing);
        perStudentSheetKeys.set(cleanId, seenKeys);
      }
    }
  }

  // Merge one consolidated record per student (preserving newest month's scores across teacher/director sheets)
  const perStudentMerged = new Map<string, {
    studentId: string;
    studentName?: string;
    classId?: string;
    className?: string;
    unifiedNo?: string;
    rollNo?: string;
    month?: string;
    subjects: { [subjectName: string]: { score: number | null; maxScore: number; examName?: string; notes?: string } };
    teacherNotes?: string;
    directorNotes?: string;
    approvedSheets?: SentGradeSheet[];
  }>();

  orderedSheets.forEach((sheet) => {
    const isCohortSheet = sheet.classId === 'cohort';
    (sheet.studentsSummary || []).forEach((st) => {
      const cleanId = normalizeId(st.studentId);
      if (!cleanId) return;

      const existingRec = perStudentMerged.get(cleanId);
      // Only merge subject map for the student's newest month (skip overwriting with older months' subjects)
      if (existingRec && existingRec.month && sheet.month && existingRec.month !== sheet.month) {
        return;
      }
      // Never let a legacy cohort sheet overwrite a class-specific sheet for the same month
      if (isCohortSheet && existingRec && existingRec.classId && existingRec.classId !== 'cohort') {
        return;
      }

      const subjectsMap: Record<string, { score: number | null; maxScore: number; examName?: string; notes?: string }> = existingRec
        ? { ...existingRec.subjects }
        : {};

      (st.scores || []).forEach((sc) => {
        if (!sc || !sc.subject) return;
        const numericScore = sc.score !== null && sc.score !== undefined ? Number(sc.score) : null;
        const prevSub = subjectsMap[sc.subject];
        // Never overwrite an existing numeric score with null
        if (prevSub && prevSub.score !== null && (numericScore === null || Number.isNaN(numericScore))) {
          return;
        }
        subjectsMap[sc.subject] = {
          score: numericScore !== null && !Number.isNaN(numericScore) ? numericScore : null,
          maxScore: Number(sc.maxScore) || prevSub?.maxScore || 100,
          examName: sheet.month,
          notes: ''
        };
      });

      perStudentMerged.set(cleanId, {
        studentId: cleanId,
        studentName: st.studentName || existingRec?.studentName,
        classId: sheet.classId || existingRec?.classId,
        className: sheet.className || existingRec?.className,
        unifiedNo: st.unifiedNo || existingRec?.unifiedNo,
        rollNo: st.rollNo || existingRec?.rollNo,
        month: sheet.month || existingRec?.month,
        subjects: subjectsMap,
        teacherNotes: st.teacherNotes || existingRec?.teacherNotes,
        directorNotes: st.directorNotes || existingRec?.directorNotes,
        approvedSheets: perStudentApprovedSheets.get(cleanId)
      });
    });
  });

  const records: Array<{
    studentId: string;
    studentName?: string;
    classId?: string;
    className?: string;
    unifiedNo?: string;
    rollNo?: string;
    month?: string;
    subjects: { [subjectName: string]: { score: number | null; maxScore: number; examName?: string; notes?: string } };
    teacherNotes?: string;
    directorNotes?: string;
    approvedSheets?: SentGradeSheet[];
  }> = [];
  const pendingSheetSigUpdates: Array<{ sigKey: string; sig: string }> = [];

  perStudentMerged.forEach((rec, cleanId) => {
    if (scopedIds && !scopedIds.has(cleanId)) return;
    const sigKey = `${cleanId}_${rec.month || ''}`;
    const sig = compactHash(computeRecordSignature(rec) + `_sh:${JSON.stringify((rec.approvedSheets || []).map((s) => `${s.id}:${s.status}`))}`);
    if (lastSyncedConsolidatedSignatures.get(sigKey) !== sig) {
      pendingSheetSigUpdates.push({ sigKey, sig });
      records.push(rec);
    }
  });

  if (records.length > 0) {
    const savedOk = await batchSaveStudentsGradesConsolidated(records);
    if (savedOk) {
      pendingSheetSigUpdates.forEach(({ sigKey, sig }) => {
        lastSyncedConsolidatedSignatures.set(sigKey, sig);
      });
      persistConsolidatedSignaturesToStorage();
    }
    return savedOk;
  }
  return true;
}

/**
 * After deleting a SentGradeSheet, updates `students_grades/{studentId}` for every affected student:
 * - If the student still has other approved sheets, re-syncs their consolidated record with only remaining sheets.
 * - If the student now has zero remaining approved sheets, deletes their consolidated `students_grades/{studentId}` doc
 *   so deleted grades never remain visible to parents.
 */
export async function resyncAndClearDeletedSheetStudents(
  affectedStudentIds: string[],
  remainingSheets: SentGradeSheet[]
): Promise<boolean> {
  const cleanIds = Array.from(new Set((affectedStudentIds || []).map(normalizeId).filter(Boolean)));
  if (cleanIds.length === 0) return true;

  // Invalidate cached sync signatures, memory & Vault caches for affected students so updates/deletes are never skipped
  cleanIds.forEach((cleanId) => {
    consolidatedRecordMemoryCache.delete(cleanId);
    invalidateReadCache(`students_grades_record:${cleanId}`);
    invalidateReadCache(`students_grades_on_demand:${cleanId}`);
    Array.from(lastSyncedConsolidatedSignatures.keys()).forEach((k) => {
      if (k === cleanId || k === `subjects_${cleanId}` || k.startsWith(`${cleanId}_`)) {
        lastSyncedConsolidatedSignatures.delete(k);
      }
    });
  });
  await Promise.all(cleanIds.map((cleanId) => removeConsolidatedRecordFromVault(cleanId)));
  persistConsolidatedSignaturesToStorage();

  const remainingApproved = (remainingSheets || []).filter(
    (s) => s && (s.status === 'approved' || (!s.teacherId && s.status !== 'submitted' && s.status !== 'draft'))
  );

  const idsStillWithSheets = new Set<string>();
  remainingApproved.forEach((sh) => {
    (sh.studentsSummary || []).forEach((st) => {
      const sid = normalizeId(st.studentId);
      if (sid && cleanIds.includes(sid)) {
        idsStillWithSheets.add(sid);
      }
    });
  });

  const idsToDelete = cleanIds.filter((id) => !idsStillWithSheets.has(id));
  const idsToResync = Array.from(idsStillWithSheets);

  let ok = true;
  if (idsToResync.length > 0) {
    const synced = await syncSentGradeSheetsToConsolidatedCollection(remainingApproved, { onlyStudentIds: idsToResync });
    if (!synced) ok = false;
  }

  if (idsToDelete.length > 0 && db && !isFirestoreWriteQuotaExceeded() && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
    const deletedOk = await batchDeleteFirestoreDocs('students_grades', idsToDelete, 'مسح درجات محذوفة');
    if (deletedOk) {
      idsToDelete.forEach((sid) => serverConfirmedMissingStudentIds.add(sid));
    } else {
      ok = false;
    }
  }

  return ok;
}

/**
 * Deletes multiple Firestore document IDs from a collection in chunked batches (max 400 per batch)
 * with fast single-round-trip REST `:commit` fallback.
 */
export async function batchDeleteFirestoreDocs(
  collectionName: string,
  docIds: string[],
  label: string = 'حذف سجلات'
): Promise<boolean> {
  const cleanIds = Array.from(new Set((docIds || []).map(normalizeId).filter(Boolean)));
  if (cleanIds.length === 0) return true;
  if (!db || isFirestoreWriteQuotaExceeded() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return false;
  }

  let ok = true;
  for (let i = 0; i < cleanIds.length; i += 400) {
    const chunk = cleanIds.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach((id) => {
      batch.delete(doc(db, collectionName, id));
    });

    let committed = false;
    try {
      await Promise.race([
        batch.commit().then(() => { committed = true; }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('batch_timeout')), 2500))
      ]);
    } catch (err: any) {
      if (!committed) {
        if (isQuotaError(err)) {
          markFirestoreWriteQuotaExceeded(err);
          return false;
        }
        try {
          await commitFirestoreDeletesViaRest(
            chunk.map((id) => ({ collectionName, docId: id })),
            9000
          );
          committed = true;
        } catch (restErr: any) {
          if (isQuotaError(restErr)) markFirestoreWriteQuotaExceeded(restErr);
          ok = false;
        }
      }
    }

    if (committed) {
      trackFirestoreWrite(chunk.length, `${label} (${chunk.length})`);
    }
  }
  return ok;
}

/**
 * Batch-deletes consolidated student grade docs (`students_grades/{studentId}`) and clears local caches/queues.
 */
export async function deleteStudentsGradesConsolidatedBulk(studentIds: string[]): Promise<boolean> {
  const cleanIds = Array.from(new Set((studentIds || []).map(normalizeId).filter(Boolean)));
  if (cleanIds.length === 0) return true;

  cleanIds.forEach((cleanId) => {
    consolidatedRecordMemoryCache.delete(cleanId);
    serverConfirmedMissingStudentIds.add(cleanId);
    invalidateReadCache(`students_grades_record:${cleanId}`);
    invalidateReadCache(`students_grades_on_demand:${cleanId}`);
    Array.from(lastSyncedConsolidatedSignatures.keys()).forEach((k) => {
      if (k === cleanId || k === `subjects_${cleanId}` || k.startsWith(`${cleanId}_`)) {
        lastSyncedConsolidatedSignatures.delete(k);
      }
    });
  });
  persistConsolidatedSignaturesToStorage();
  await Promise.all([
    ...cleanIds.map((cleanId) => removeConsolidatedRecordFromVault(cleanId)),
    removePendingGradeBatchesForStudents(cleanIds).catch(() => {})
  ]);

  return await batchDeleteFirestoreDocs('students_grades', cleanIds, 'حذف درجات الطلاب المحذوفين');
}

/**
 * Deletes every document in a Firestore collection using chunked batch deletes (for full platform wipe).
 */
export async function deleteEntireFirestoreCollection(
  collectionName: string,
  label: string = `تصفير ${collectionName}`
): Promise<number> {
  if (!db || isFirestoreWriteQuotaExceeded() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return 0;
  }
  try {
    const snap = await getDocs(collection(db, collectionName));
    if (snap.empty) return 0;
    trackFirestoreRead(snap.size, `جرد ${collectionName} للتصفير (${snap.size})`);
    const ids = snap.docs.map((d) => d.id);
    await batchDeleteFirestoreDocs(collectionName, ids, label);
    return ids.length;
  } catch (err: any) {
    if (isQuotaError(err)) markFirestoreWriteQuotaExceeded(err);
    return 0;
  }
}

export async function clearConsolidatedGradesSignaturesAndPending(): Promise<void> {
  lastSyncedConsolidatedSignatures.clear();
  consolidatedRecordMemoryCache.clear();
  serverConfirmedMissingStudentIds.clear();
  persistConsolidatedSignaturesToStorage();
  await clearPendingGradeBatches().catch(() => {});
}

/**
 * Clears a deleted monthly evaluation (`teacherNotes`/`directorNotes`) from `students_grades/{studentId}`
 * if that student currently has a consolidated document, and invalidates cached signatures.
 */
export async function clearStudentMonthlyEvaluationInConsolidated(
  studentId: string,
  month: string
): Promise<boolean> {
  const cleanId = normalizeId(studentId);
  if (!cleanId) return true;
  consolidatedRecordMemoryCache.delete(cleanId);
  void removeConsolidatedRecordFromVault(cleanId);
  Array.from(lastSyncedConsolidatedSignatures.keys()).forEach((k) => {
    if (k === cleanId || k.startsWith(`${cleanId}_`)) {
      lastSyncedConsolidatedSignatures.delete(k);
    }
  });
  persistConsolidatedSignaturesToStorage();

  if (!db || isFirestoreWriteQuotaExceeded() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return false;
  }

  try {
    const { snap } = await getDocCacheFirst(doc(db, 'students_grades', cleanId), {
      forceServer: true,
      timeoutMs: 3000
    });
    if (!snap || !snap.exists()) return true;
    const data = snap.data() as ConsolidatedStudentGradeRecord;
    const targetMonth = String(month || '').trim();
    const updatedApproved = Array.isArray(data.approvedSheets)
      ? data.approvedSheets.map((sh) => {
          if (targetMonth && String(sh.month || '').trim() !== targetMonth) return sh;
          return {
            ...sh,
            studentsSummary: (sh.studentsSummary || []).map((sm) => ({
              ...sm,
              teacherNotes: '',
              directorNotes: ''
            }))
          };
        })
      : undefined;

    const patch: Record<string, any> = {
      teacherNotes: '',
      directorNotes: '',
      updatedAt: Date.now(),
      ...(updatedApproved ? { approvedSheets: updatedApproved } : {})
    };
    await writeFirestoreDocFast('students_grades', cleanId, patch, { merge: true, sdkGraceMs: 2500, restTimeoutMs: 7000 });
    trackFirestoreWrite(1, `حذف تقييم شهري (${cleanId})`);
    return true;
  } catch (err: any) {
    if (isQuotaError(err)) markFirestoreWriteQuotaExceeded(err);
    return false;
  }
}

