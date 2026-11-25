/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, doc, getDocs, limit, query, where, writeBatch } from 'firebase/firestore';
import { commitFirestoreBatchViaRest, commitFirestoreDeletesViaRest, db, getDocCacheFirst, getDocsCacheFirst } from './firebase';
import { trackFirestoreRead, trackFirestoreWrite } from './firestoreTracker';
import {
  isFirestoreReadQuotaExceeded,
  isFirestoreWriteQuotaExceeded,
  isQuotaError,
  markFirestoreReadQuotaExceeded,
  markFirestoreWriteQuotaExceeded
} from './quotaManager';
import { invalidateReadCache, isReadCacheFresh, markReadCacheFresh } from './readCache';
import { getVaultItem, setVaultItem } from './offlineVault';
import { Student } from '../types';

export const STUDENTS_COLLECTION = 'students';
const DIR_SIGS_STORAGE_KEY = 'school_students_dir_sigs_v1';

// Free browser 5MB localStorage by keeping student directory signatures strictly in IndexedDB Vault
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(DIR_SIGS_STORAGE_KEY);
  }
} catch {}

const syncedStudentSignatures = new Map<string, string>();
let dirSigsHydrated = false;
let dirSigsHydrationPromise: Promise<void> | null = null;

async function ensureDirSigsHydrated(): Promise<void> {
  if (dirSigsHydrated) return;
  if (dirSigsHydrationPromise) return dirSigsHydrationPromise;
  dirSigsHydrationPromise = getVaultItem(DIR_SIGS_STORAGE_KEY)
    .then((raw) => {
      dirSigsHydrated = true;
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([k, v]) => {
          if (typeof v === 'string' && !syncedStudentSignatures.has(k)) {
            syncedStudentSignatures.set(k, v);
          }
        });
      }
    })
    .catch(() => {
      dirSigsHydrated = true;
    });
  return dirSigsHydrationPromise;
}

void ensureDirSigsHydrated();

function persistDirectorySignatures(): void {
  try {
    const out: Record<string, string> = {};
    syncedStudentSignatures.forEach((v, k) => {
      out[k] = v;
    });
    setVaultItem(DIR_SIGS_STORAGE_KEY, JSON.stringify(out)).catch(() => {});
  } catch {}
}

function normalizeDigits(val: unknown): string {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[^\d]/g, '')
    .trim();
}

function sanitizeForFirestoreDoc<T extends Record<string, any>>(obj: T): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function buildLookupMetadata(): {
  classMap: Map<string, { name: string; teacherId?: string }>;
  teacherMap: Map<string, string>;
} {
  const classMap = new Map<string, { name: string; teacherId?: string }>();
  const teacherMap = new Map<string, string>();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const rawClasses = window.localStorage.getItem('school_classes');
      if (rawClasses) {
        const list = JSON.parse(rawClasses);
        if (Array.isArray(list)) {
          list.forEach((c: any) => {
            if (c?.id) classMap.set(String(c.id), { name: c.name || '', teacherId: c.teacherId });
          });
        }
      }
      const rawTeachers = window.localStorage.getItem('school_teachers');
      if (rawTeachers) {
        const list = JSON.parse(rawTeachers);
        if (Array.isArray(list)) {
          list.forEach((t: any) => {
            if (t?.id) teacherMap.set(String(t.id), t.name || '');
          });
        }
      }
    }
  } catch {}
  return { classMap, teacherMap };
}

function buildStudentDirectoryPayload(
  st: Student,
  classMap: Map<string, { name: string; teacherId?: string }>,
  teacherMap: Map<string, string>
): { id: string; sig: string; payload: Record<string, any> } | null {
  if (!st || !st.id) return null;
  const cleanId = String(st.id).trim();
  if (!cleanId) return null;

  const unified = st.unifiedNo !== undefined && st.unifiedNo !== null ? String(st.unifiedNo).trim() : '';
  const roll = st.rollNo !== undefined && st.rollNo !== null ? String(st.rollNo).trim() : '';
  const clsInfo = st.classId ? classMap.get(String(st.classId)) : undefined;
  const teacherName = clsInfo?.teacherId ? teacherMap.get(String(clsInfo.teacherId)) || '' : '';

  const payload = sanitizeForFirestoreDoc({
    id: cleanId,
    name: st.name || '',
    classId: st.classId || '',
    className: clsInfo?.name || '',
    teacherName,
    parentId: st.parentId || '',
    parentName: st.parentName || '',
    parentPhone: st.parentPhone || '',
    rollNo: roll,
    rollNoNormalized: normalizeDigits(roll),
    unifiedNo: unified,
    unifiedNoNormalized: normalizeDigits(unified),
    nationalId: st.nationalId || '',
    gender: st.gender || 'male',
    dob: st.dob || '',
    shift: st.shift || 'morning',
    serialNo: st.serialNo || '',
    avatar: st.avatar || ''
  });

  return { id: cleanId, sig: JSON.stringify(payload), payload };
}

/**
 * Seeds directory signatures locally from a freshly fetched server `school_students` snapshot
 * so new browsers / APKs do not waste 200+ Firestore writes re-uploading unchanged students on startup.
 */
export async function seedStudentsDirectorySignatures(students: Student[]): Promise<void> {
  if (!Array.isArray(students) || students.length === 0) return;
  await ensureDirSigsHydrated();
  const { classMap, teacherMap } = buildLookupMetadata();
  if (classMap.size === 0) return;

  let changed = false;
  for (const st of students) {
    const built = buildStudentDirectoryPayload(st, classMap, teacherMap);
    if (!built) continue;
    if (!syncedStudentSignatures.has(built.id)) {
      syncedStudentSignatures.set(built.id, built.sig);
      changed = true;
    }
  }
  if (changed) {
    persistDirectorySignatures();
  }
}

/**
 * Mirrors individual student records to `students/{student.id}` so Parent Portal
 * can fetch a SINGLE student document directly by `unifiedNo` (`where`/`doc`)
 * without ever reading the entire `school_students` list.
 * Signature-deduplicated: unchanged students incur 0 Firestore writes.
 */
export async function syncStudentsDirectoryToFirestore(students: Student[]): Promise<void> {
  if (!Array.isArray(students) || students.length === 0) return;
  if (!db || isFirestoreWriteQuotaExceeded()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  await ensureDirSigsHydrated();
  const { classMap, teacherMap } = buildLookupMetadata();
  // Wait until classes are loaded so we never write 184 docs with empty className and overwrite them 1s later
  if (classMap.size === 0) return;

  const changedDocs: Array<{ id: string; sig: string; data: Record<string, any> }> = [];

  for (const st of students) {
    const built = buildStudentDirectoryPayload(st, classMap, teacherMap);
    if (!built) continue;
    if (syncedStudentSignatures.get(built.id) === built.sig) {
      continue;
    }

    changedDocs.push({
      id: built.id,
      sig: built.sig,
      data: {
        ...built.payload,
        updatedAt: Date.now()
      }
    });
  }

  if (changedDocs.length === 0) return;

  try {
    for (let i = 0; i < changedDocs.length; i += 400) {
      if (isFirestoreWriteQuotaExceeded()) break;
      const chunk = changedDocs.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((item) => {
        batch.set(doc(db, STUDENTS_COLLECTION, item.id), item.data, { merge: true });
      });
      let committed = false;
      try {
        await Promise.race([
          batch.commit().then(() => { committed = true; }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('batch_timeout')), 2500))
        ]);
      } catch (err) {
        if (!committed) {
          if (isQuotaError(err)) throw err;
          await commitFirestoreBatchViaRest(
            chunk.map((item) => ({
              collectionName: STUDENTS_COLLECTION,
              docId: item.id,
              data: item.data,
              merge: true
            })),
            9000
          );
        }
      }
      chunk.forEach((item) => {
        syncedStudentSignatures.set(item.id, item.sig);
      });
      trackFirestoreWrite(chunk.length, `تحديث فهرس الطلاب (${chunk.length})`);
    }
    persistDirectorySignatures();
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreWriteQuotaExceeded(err);
    } else {
      console.warn('[ParentStudentQuery] Notice syncing students directory:', err?.message || err);
    }
  }
}

/**
 * Deletes removed student documents directly from `students/{studentId}` in Firestore
 * using chunked batch deletes (max 400 docs/batch) with REST `:commit` fallback.
 */
export async function deleteStudentsFromDirectoryFirestore(studentIds: string[]): Promise<boolean> {
  const cleanIds = Array.from(new Set((studentIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (cleanIds.length === 0) return true;

  await ensureDirSigsHydrated();
  cleanIds.forEach((id) => {
    syncedStudentSignatures.delete(id);
  });
  singleStudentMemoryCache.clear();
  persistDirectorySignatures();

  if (!db || isFirestoreWriteQuotaExceeded() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return false;
  }

  let ok = true;
  for (let i = 0; i < cleanIds.length; i += 400) {
    const chunk = cleanIds.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach((id) => {
      batch.delete(doc(db, STUDENTS_COLLECTION, id));
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
            chunk.map((id) => ({ collectionName: STUDENTS_COLLECTION, docId: id })),
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
      trackFirestoreWrite(chunk.length, `حذف طلاب من فهرس القاعدة (${chunk.length})`);
    }
  }
  return ok;
}

export async function clearAllStudentsDirectoryCacheAndFirestore(): Promise<boolean> {
  syncedStudentSignatures.clear();
  singleStudentMemoryCache.clear();
  persistDirectorySignatures();

  if (!db || isFirestoreWriteQuotaExceeded() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return false;
  }

  try {
    const snap = await getDocs(collection(db, STUDENTS_COLLECTION));
    if (!snap.empty) {
      trackFirestoreRead(snap.size, `جرد فهرس الطلاب للحذف الشامل (${snap.size})`);
      const ids = snap.docs.map((d) => d.id);
      return await deleteStudentsFromDirectoryFirestore(ids);
    }
    return true;
  } catch (err: any) {
    if (isQuotaError(err)) markFirestoreWriteQuotaExceeded(err);
    return false;
  }
}

export interface SingleStudentFetchResult {
  student: (Student & { className?: string; teacherName?: string }) | null;
  fromCache: boolean;
}

const singleStudentMemoryCache = new Map<string, Student & { className?: string; teacherName?: string }>();

function readSingleStudentFromLocalStorage(variants: string[]): (Student & { className?: string; teacherName?: string }) | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const rawActive = window.localStorage.getItem('parent_portal_active_student_obj');
    if (rawActive) {
      const parsed = JSON.parse(rawActive);
      if (parsed && typeof parsed === 'object') {
        const candidates = [
          String(parsed.id || '').trim(),
          String(parsed.unifiedNo || '').trim(),
          String(parsed.rollNo || '').trim(),
          normalizeDigits(parsed.unifiedNo),
          normalizeDigits(parsed.rollNo)
        ].filter(Boolean);
        if (variants.some((v) => candidates.includes(v))) {
          return parsed;
        }
      }
    }
  } catch {}
  return null;
}

/**
 * STRICT SINGLE-STUDENT QUERY FOR PARENT PORTAL:
 * Fetches ONLY ONE student document matching `rawInput` (Unified Number / Roll No / ID)
 * using Firestore `where(..., limit(1))` / `doc(...)` with a 5-minute TTL cache.
 * NEVER fetches the full `school_students` collection or list.
 */
export async function fetchSingleStudentByUnifiedNo(
  rawInput: string,
  options?: { forceServer?: boolean }
): Promise<SingleStudentFetchResult> {
  const clean = String(rawInput || '').trim();
  if (!clean) return { student: null, fromCache: true };

  const normalizedDigits = normalizeDigits(clean);
  const unpaddedDigits = normalizedDigits ? String(parseInt(normalizedDigits, 10)) : '';
  const variants = Array.from(
    new Set([clean, normalizedDigits, unpaddedDigits].filter((v) => v && v !== 'NaN'))
  ).slice(0, 10);

  const cacheKey = `single_student:${normalizedDigits || clean}`;
  const forceServer = Boolean(options?.forceServer) && !isFirestoreReadQuotaExceeded();

  // 1. Check 5-minute TTL session/local cache first
  if (!forceServer && isReadCacheFresh(cacheKey)) {
    const mem = singleStudentMemoryCache.get(cacheKey);
    if (mem) return { student: mem, fromCache: true };
    const localHit = readSingleStudentFromLocalStorage(variants);
    if (localHit) {
      singleStudentMemoryCache.set(cacheKey, localHit);
      return { student: localHit, fromCache: true };
    }
  }

  if (!db) {
    const localHit = readSingleStudentFromLocalStorage(variants);
    return { student: localHit, fromCache: true };
  }

  const colRef = collection(db, STUDENTS_COLLECTION);

  const runSingleMatchQuery = async (field: string): Promise<{ student: Student | null; fromCache: boolean }> => {
    const q = query(colRef, where(field, 'in', variants), limit(5));
    const { snap, fromCache } = await getDocsCacheFirst(q, {
      forceServer,
      timeoutMs: 3500
    });
    if (snap && !fromCache) {
      trackFirestoreRead(Math.max(1, snap.size), `جلب مستند طالب (${clean})`);
    }
    if (snap && !snap.empty) {
      const candidates = snap.docs.map((docSnap) => {
        const data = docSnap.data() as Student & { className?: string; teacherName?: string; updatedAt?: number };
        return { ...data, id: data.id || docSnap.id };
      });
      candidates.sort((a, b) => {
        const aTime = Number((a as any).updatedAt) || 0;
        const bTime = Number((b as any).updatedAt) || 0;
        if (bTime !== aTime) return bTime - aTime;
        const aClass = a.classId ? 1 : 0;
        const bClass = b.classId ? 1 : 0;
        return bClass - aClass;
      });
      return {
        student: candidates[0],
        fromCache
      };
    }
    return { student: null, fromCache };
  };

  try {
    // Query 1: exact unifiedNo (`where('unifiedNo', 'in', variants), limit(1)`)
    let res = await runSingleMatchQuery('unifiedNo');
    if (!res.student && normalizedDigits) {
      res = await runSingleMatchQuery('unifiedNoNormalized');
    }
    // Query 2: direct document ID (`doc(db, 'students', clean)`)
    if (!res.student) {
      const { snap, fromCache } = await getDocCacheFirst(doc(db, STUDENTS_COLLECTION, clean), {
        forceServer,
        timeoutMs: 2500
      });
      if (snap && !fromCache) {
        trackFirestoreRead(1, `جلب مستند طالب مباشر (${clean})`);
      }
      if (snap && snap.exists()) {
        const data = snap.data() as Student & { className?: string; teacherName?: string };
        res = { student: { ...data, id: data.id || snap.id }, fromCache };
      }
    }
    // Query 3: rollNo (`where('rollNo', 'in', variants), limit(1)`)
    if (!res.student) {
      res = await runSingleMatchQuery('rollNo');
    }

    if (res.student) {
      singleStudentMemoryCache.set(cacheKey, res.student);
      markReadCacheFresh(cacheKey);
      return { student: res.student, fromCache: res.fromCache };
    }
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreReadQuotaExceeded(err);
    } else {
      console.warn('[ParentStudentQuery] Error fetching single student:', err?.message || err);
    }
  }

  return { student: readSingleStudentFromLocalStorage(variants), fromCache: true };
}
