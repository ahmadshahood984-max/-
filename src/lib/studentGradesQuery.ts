/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, getDocCacheFirst } from './firebase';
import { 
  doc, 
  setDoc, 
  writeBatch
} from 'firebase/firestore';
import { Grade, SentGradeSheet } from '../types';
import { trackFirestoreRead, trackFirestoreWrite } from './firestoreTracker';
import { isFirestoreQuotaExceeded, markFirestoreQuotaExceeded, isQuotaError } from './quotaManager';
import { enqueuePendingGradeBatch, getPendingGradeBatches, removePendingGradeBatch } from './offlineVault';

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

  if (!db) {
    return getLocalStudentGrades(cleanUserId, fallbackUnifiedNo);
  }

  // If quota circuit-breaker is tripped, allow cache-only reads without hitting server
  const effectiveForceServer = isFirestoreQuotaExceeded() ? false : forceServer;

  try {
    // 1. Direct single-document cache-first read for primary studentId
    const docRef = doc(db, 'students_grades', cleanUserId);
    const { snap, fromCache } = await getDocCacheFirst(docRef, {
      forceServer: effectiveForceServer,
      timeoutMs: 2500
    });

    if (snap && !fromCache) {
      trackFirestoreRead(1, `قراءة درجات طالب (${cleanUserId})`);
    }
    if (snap && snap.exists()) {
      const data = snap.data() as ConsolidatedStudentGradeRecord;
      if (data && data.subjects) {
        const studentGrades = unpackConsolidatedGrades(data);
        mergeStudentGradesIntoLocalStorage(studentGrades);
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
          return altGrades;
        }
      }
    }
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
    } else {
      console.warn('[StudentGrades] Notice retrieving consolidated document:', err?.message || err);
    }
  }

  // Graceful fallback to local storage cache
  return getLocalStudentGrades(cleanUserId, fallbackUnifiedNo);
}

/**
 * Directly fetch the full consolidated record for a student (cache-first by default)
 */
export async function fetchConsolidatedStudentRecord(
  studentId: string,
  fallbackUnifiedNo?: string,
  forceServer: boolean = false
): Promise<ConsolidatedStudentGradeRecord | null> {
  const cleanId = normalizeId(studentId);
  if (!cleanId) return null;

  if (!db) {
    return getLocalConsolidatedRecord(cleanId, fallbackUnifiedNo);
  }

  const effectiveForceServer = isFirestoreQuotaExceeded() ? false : forceServer;

  try {
    const docRef = doc(db, 'students_grades', cleanId);
    const { snap, fromCache } = await getDocCacheFirst(docRef, {
      forceServer: effectiveForceServer,
      timeoutMs: 2500
    });

    if (snap && !fromCache) {
      trackFirestoreRead(1, `قراءة السجل الموحد (${cleanId})`);
    }
    if (snap && snap.exists()) {
      return snap.data() as ConsolidatedStudentGradeRecord;
    }

    if (fallbackUnifiedNo && fallbackUnifiedNo !== cleanId) {
      const altRef = doc(db, 'students_grades', normalizeId(fallbackUnifiedNo));
      const { snap: altSnap, fromCache: altFromCache } = await getDocCacheFirst(altRef, {
        forceServer: effectiveForceServer,
        timeoutMs: 2000
      });
      if (altSnap && !altFromCache) {
        trackFirestoreRead(1, `قراءة السجل الموحد (${fallbackUnifiedNo})`);
      }
      if (altSnap && altSnap.exists()) {
        return altSnap.data() as ConsolidatedStudentGradeRecord;
      }
    }
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
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

    return all.filter(g => {
      const gStudent = normalizeId(g.studentId);
      if (gStudent === targetId) return true;
      if (targetUnified && gStudent === targetUnified) return true;
      return false;
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
  }>
): Promise<boolean> {
  if (!records || records.length === 0 || !db || isFirestoreQuotaExceeded()) return false;

  for (let i = 0; i < records.length; i += 400) {
    const chunk = records.slice(i, i + 400);
    const batch = writeBatch(db);

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
        updatedAt: Date.now()
      };

      batch.set(docRef, payload, { merge: true });
    });

    await batch.commit();
    trackFirestoreWrite(chunk.length, `حفظ دفعة درجات (${chunk.length} طالب)`);
  }
  return true;
}

/**
 * Flushes any consolidated student grade batches saved while offline.
 */
export async function flushPendingGradeBatches(): Promise<number> {
  if (!db || isFirestoreQuotaExceeded()) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;

  let flushed = 0;
  try {
    const batches = await getPendingGradeBatches();
    for (const item of batches) {
      if (isFirestoreQuotaExceeded()) break;
      try {
        const ok = await Promise.race([
          commitConsolidatedBatchToFirestore(item.records),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 6000))
        ]);
        if (ok) {
          await removePendingGradeBatch(item.id);
          flushed++;
        }
      } catch (err: any) {
        if (isQuotaError(err)) {
          markFirestoreQuotaExceeded(err);
          break;
        }
      }
    }
  } catch {}
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
  }>
): Promise<boolean> {
  if (!records || records.length === 0) return true;

  const changedRecords = records.filter((rec) => {
    const cleanId = normalizeId(rec.studentId);
    if (!cleanId) return false;
    const sig = computeRecordSignature(rec);
    if (lastSyncedConsolidatedSignatures.get(cleanId) === sig) {
      return false;
    }
    lastSyncedConsolidatedSignatures.set(cleanId, sig);
    lastSyncedConsolidatedSignatures.set(`subjects_${cleanId}`, computeSubjectsSignature(rec.subjects));
    return true;
  });

  if (changedRecords.length === 0) return true;

  const batchId = `gb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await enqueuePendingGradeBatch(batchId, changedRecords);

  if (!db || isFirestoreQuotaExceeded()) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  try {
    const commitPromise = commitConsolidatedBatchToFirestore(changedRecords)
      .then(async (ok) => {
        if (ok) await removePendingGradeBatch(batchId);
        return ok;
      })
      .catch((err: any) => {
        if (isQuotaError(err)) {
          markFirestoreQuotaExceeded(err);
        } else {
          console.warn('[BatchGrades] Notice in batch save (queued offline):', err?.message || err);
        }
        return false;
      });

    // Never hang caller UI if internet drops mid-flight
    await Promise.race([
      commitPromise,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 2000))
    ]);
    return true;
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
    }
    return true;
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

  if (!db || isFirestoreQuotaExceeded()) return true;
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
          markFirestoreQuotaExceeded(err);
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
      markFirestoreQuotaExceeded(err);
    }
    return true;
  }
}

const lastSyncedConsolidatedSignatures = new Map<string, string>();

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
    return JSON.stringify(normalized);
  } catch {
    return String(Date.now());
  }
}

function computeRecordSignature(rec: { subjects: any; teacherNotes?: string; directorNotes?: string; month?: string }): string {
  try {
    return JSON.stringify({
      m: rec.month || '',
      s: computeSubjectsSignature(rec.subjects),
      tn: rec.teacherNotes || '',
      dn: rec.directorNotes || ''
    });
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
    if (db && !isFirestoreQuotaExceeded() && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      commitConsolidatedBatchToFirestore(changedRecords)
        .then(async (ok) => {
          if (ok) await removePendingGradeBatch(batchId);
        })
        .catch(() => {});
    }
  }
}

/**
 * Sync student summaries from SentGradeSheet records into consolidated single-document records,
 * skipping previously synced identical student snapshots to avoid redundant Firestore writes.
 */
export async function syncSentGradeSheetsToConsolidatedCollection(sheets: SentGradeSheet[]): Promise<void> {
  if (!Array.isArray(sheets) || sheets.length === 0) return;

  // STRICT GATE: Only Director-approved/sent grade sheets may be synced to students_grades.
  // Never sync teacher-submitted ('submitted') or draft sheets before the Director approves & sends them.
  const approvedSheets = sheets.filter(
    (s) => s && (s.status === 'approved' || (!s.teacherId && s.status !== 'submitted' && s.status !== 'draft'))
  );
  if (approvedSheets.length === 0) return;

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
  }> = [];

  const orderedSheets = [...approvedSheets].sort((a, b) => {
    return (new Date(a.dateSent || 0).getTime() || 0) - (new Date(b.dateSent || 0).getTime() || 0);
  });

  orderedSheets.forEach(sheet => {
    (sheet.studentsSummary || []).forEach(st => {
      const cleanId = normalizeId(st.studentId);
      if (!cleanId) return;

      const subjectsMap: Record<string, { score: number | null; maxScore: number; examName?: string; notes?: string }> = {};
      (st.scores || []).forEach(sc => {
        subjectsMap[sc.subject] = {
          score: sc.score !== null && sc.score !== undefined ? Number(sc.score) : null,
          maxScore: Number(sc.maxScore) || 100,
          examName: sheet.month,
          notes: ''
        };
      });

      const rec = {
        studentId: cleanId,
        studentName: st.studentName,
        classId: sheet.classId,
        className: sheet.className,
        unifiedNo: st.unifiedNo,
        rollNo: st.rollNo,
        month: sheet.month,
        subjects: subjectsMap,
        teacherNotes: st.teacherNotes,
        directorNotes: st.directorNotes
      };

      const sigKey = `${cleanId}_${sheet.month || ''}`;
      const sig = computeRecordSignature(rec);
      if (lastSyncedConsolidatedSignatures.get(sigKey) !== sig) {
        lastSyncedConsolidatedSignatures.set(sigKey, sig);
        records.push(rec);
      }
    });
  });

  if (records.length > 0) {
    await batchSaveStudentsGradesConsolidated(records);
  }
}

