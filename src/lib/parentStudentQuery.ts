/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, doc, limit, query, where, writeBatch } from 'firebase/firestore';
import { db, getDocCacheFirst, getDocsCacheFirst } from './firebase';
import { trackFirestoreRead, trackFirestoreWrite } from './firestoreTracker';
import {
  isFirestoreReadQuotaExceeded,
  isFirestoreWriteQuotaExceeded,
  isQuotaError,
  markFirestoreReadQuotaExceeded,
  markFirestoreWriteQuotaExceeded
} from './quotaManager';
import { isReadCacheFresh, markReadCacheFresh } from './readCache';
import { Student } from '../types';

export const STUDENTS_COLLECTION = 'students';
const DIR_SIGS_STORAGE_KEY = 'school_students_dir_sigs_v1';

const syncedStudentSignatures = new Map<string, string>();
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const raw = window.localStorage.getItem(DIR_SIGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([k, v]) => {
          if (typeof v === 'string') syncedStudentSignatures.set(k, v);
        });
      }
    }
  }
} catch {}

function persistDirectorySignatures(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const out: Record<string, string> = {};
      syncedStudentSignatures.forEach((v, k) => {
        out[k] = v;
      });
      window.localStorage.setItem(DIR_SIGS_STORAGE_KEY, JSON.stringify(out));
    }
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

  const { classMap, teacherMap } = buildLookupMetadata();
  const changedDocs: Array<{ id: string; data: Record<string, any> }> = [];

  for (const st of students) {
    if (!st || !st.id) continue;
    const cleanId = String(st.id).trim();
    if (!cleanId) continue;

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

    const sig = JSON.stringify(payload);
    if (syncedStudentSignatures.get(cleanId) === sig) {
      continue;
    }

    syncedStudentSignatures.set(cleanId, sig);
    changedDocs.push({
      id: cleanId,
      data: {
        ...payload,
        updatedAt: Date.now()
      }
    });
  }

  if (changedDocs.length === 0) return;

  try {
    for (let i = 0; i < changedDocs.length; i += 400) {
      const chunk = changedDocs.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((item) => {
        batch.set(doc(db, STUDENTS_COLLECTION, item.id), item.data, { merge: true });
      });
      await batch.commit();
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
    const q = query(colRef, where(field, 'in', variants), limit(1));
    const { snap, fromCache } = await getDocsCacheFirst(q, {
      forceServer,
      timeoutMs: 3500
    });
    if (snap && !fromCache) {
      trackFirestoreRead(Math.max(1, snap.size), `جلب مستند طالب (${clean})`);
    }
    if (snap && !snap.empty) {
      const docSnap = snap.docs[0];
      const data = docSnap.data() as Student & { className?: string; teacherName?: string };
      return {
        student: { ...data, id: data.id || docSnap.id },
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
