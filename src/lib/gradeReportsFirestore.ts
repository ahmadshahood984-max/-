/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  onSnapshot,
  setDoc,
  type QuerySnapshot
} from 'firebase/firestore';
import {
  db,
  extractFirestoreErrorMessage,
  handleFirestoreError,
  OperationType
} from './firebase';
import { SentGradeSheet } from '../types';
import { trackFirestoreRead, trackFirestoreWrite } from './firestoreTracker';
import {
  isFirestoreQuotaExceeded,
  isQuotaError,
  markFirestoreQuotaExceeded,
  registerActiveFirestoreListener
} from './quotaManager';

export const GRADE_REPORTS_COLLECTION = 'grade_reports';

const FIRESTORE_WRITE_TIMEOUT_MS = 15000;
const FIRESTORE_READ_TIMEOUT_MS = 15000;

async function withFirestoreTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Firestore operation timed out after ${timeoutMs}ms (${label})`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Recursively strips `undefined` values so Firestore setDoc never rejects
 * on optional properties (`Unsupported field value: undefined`).
 */
function sanitizeForFirestore<T>(input: T): T {
  if (input === null || input === undefined) {
    return null as unknown as T;
  }
  if (Array.isArray(input)) {
    return input
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof input === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input as Record<string, any>)) {
      if (v !== undefined) {
        out[k] = sanitizeForFirestore(v);
      }
    }
    return out as T;
  }
  return input;
}

/**
 * Strictly writes a submitted or approved grade report directly to Firestore
 * at `grade_reports/{sheet.id}`. Rejects with structured error details if Firestore
 * denies, times out, or fails the write (never silently falls back to localStorage-only success).
 */
export async function submitGradeReportToFirestore(sheet: SentGradeSheet): Promise<SentGradeSheet> {
  if (!db) {
    throw new Error('لم يتم تهيئة قاعدة بيانات Firestore.');
  }
  const reportId = String(sheet.id || `gs_teacher_${Date.now()}`).trim();
  const reportPath = `${GRADE_REPORTS_COLLECTION}/${reportId}`;
  if (isFirestoreQuotaExceeded()) {
    handleFirestoreError(new Error('resource-exhausted: Firestore daily quota exceeded'), OperationType.WRITE, reportPath);
  }

  const payload = sanitizeForFirestore({
    ...sheet,
    id: reportId,
    updatedAt: Date.now()
  });

  try {
    await withFirestoreTimeout(
      setDoc(doc(db, GRADE_REPORTS_COLLECTION, reportId), payload),
      FIRESTORE_WRITE_TIMEOUT_MS,
      reportPath
    );
    trackFirestoreWrite(1, `رفع كشف درجات (${sheet.className || reportId})`);
    return payload as SentGradeSheet;
  } catch (error) {
    if (isQuotaError(error)) {
      markFirestoreQuotaExceeded(error);
    }
    handleFirestoreError(error, OperationType.WRITE, reportPath);
  }
}

/**
 * Updates an existing grade report in `grade_reports/{sheet.id}` (e.g., when Director approves).
 */
export async function updateGradeReportInFirestore(sheet: SentGradeSheet): Promise<SentGradeSheet> {
  if (!db) {
    throw new Error('لم يتم تهيئة قاعدة بيانات Firestore.');
  }
  const reportId = String(sheet.id || '').trim();
  if (!reportId) {
    throw new Error('معرّف كشف الدرجات مفقود.');
  }
  const reportPath = `${GRADE_REPORTS_COLLECTION}/${reportId}`;
  if (isFirestoreQuotaExceeded()) {
    handleFirestoreError(new Error('resource-exhausted: Firestore daily quota exceeded'), OperationType.WRITE, reportPath);
  }

  const payload = sanitizeForFirestore({
    ...sheet,
    id: reportId,
    updatedAt: Date.now()
  });

  try {
    await withFirestoreTimeout(
      setDoc(doc(db, GRADE_REPORTS_COLLECTION, reportId), payload, { merge: true }),
      FIRESTORE_WRITE_TIMEOUT_MS,
      reportPath
    );
    trackFirestoreWrite(1, `اعتماد/تحديث كشف درجات (${sheet.className || reportId})`);
    return payload as SentGradeSheet;
  } catch (error) {
    if (isQuotaError(error)) {
      markFirestoreQuotaExceeded(error);
    }
    handleFirestoreError(error, OperationType.WRITE, reportPath);
  }
}

/**
 * Deletes a grade report from `grade_reports/{reportId}` in Firestore.
 */
export async function deleteGradeReportFromFirestore(reportId: string): Promise<void> {
  if (!db || !reportId) return;
  const reportPath = `${GRADE_REPORTS_COLLECTION}/${reportId}`;
  if (isFirestoreQuotaExceeded()) {
    handleFirestoreError(new Error('resource-exhausted: Firestore daily quota exceeded'), OperationType.DELETE, reportPath);
  }

  try {
    await withFirestoreTimeout(
      deleteDoc(doc(db, GRADE_REPORTS_COLLECTION, reportId)),
      FIRESTORE_WRITE_TIMEOUT_MS,
      reportPath
    );
    trackFirestoreWrite(1, `حذف كشف درجات (${reportId})`);
  } catch (error) {
    if (isQuotaError(error)) {
      markFirestoreQuotaExceeded(error);
    }
    handleFirestoreError(error, OperationType.DELETE, reportPath);
  }
}

function mapSnapshotToGradeReports(snap: QuerySnapshot): SentGradeSheet[] {
  const list: SentGradeSheet[] = [];
  snap.forEach((d) => {
    const data = d.data() as any;
    if (data && typeof data === 'object') {
      list.push({
        ...data,
        id: data.id || d.id
      } as SentGradeSheet);
    }
  });
  return list.sort(
    (a, b) => (new Date(b.dateSent || 0).getTime() || 0) - (new Date(a.dateSent || 0).getTime() || 0)
  );
}

/**
 * Fetches all grade reports directly from `grade_reports` on the Firestore server
 * WITHOUT filtering out pending (`submitted`) reports.
 */
export async function fetchGradeReportsFromFirestore(): Promise<SentGradeSheet[]> {
  if (!db) return [];
  const colRef = collection(db, GRADE_REPORTS_COLLECTION);
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const readCacheFallback = async (): Promise<SentGradeSheet[]> => {
    try {
      const cacheSnap = await getDocsFromCache(colRef);
      return mapSnapshotToGradeReports(cacheSnap);
    } catch {
      return [];
    }
  };

  if (isOffline || isFirestoreQuotaExceeded()) {
    return readCacheFallback();
  }

  try {
    const snap = await withFirestoreTimeout(
      getDocsFromServer(colRef),
      FIRESTORE_READ_TIMEOUT_MS,
      GRADE_REPORTS_COLLECTION
    );
    trackFirestoreRead(Math.max(1, snap.size), 'جلب كشوفات الدرجات من السحابة');
    return mapSnapshotToGradeReports(snap);
  } catch (serverErr: any) {
    if (isQuotaError(serverErr)) {
      markFirestoreQuotaExceeded(serverErr);
      return readCacheFallback();
    }

    const msg = String(serverErr?.message || serverErr || '').toLowerCase();
    const isPermissionErr = msg.includes('permission') || msg.includes('missing or insufficient');
    if (isPermissionErr) {
      handleFirestoreError(serverErr, OperationType.GET, GRADE_REPORTS_COLLECTION);
    }

    const isTransientTimeoutOrOffline =
      msg.includes('timed out') ||
      msg.includes('timeout') ||
      msg.includes('offline') ||
      msg.includes('unavailable') ||
      msg.includes('network');

    const cached = await readCacheFallback();
    if (cached.length > 0 || isTransientTimeoutOrOffline) {
      if (isTransientTimeoutOrOffline) {
        console.warn(`[Firestore Sync] Transient read timeout for ${GRADE_REPORTS_COLLECTION}; using cached/realtime data.`);
      }
      return cached;
    }

    try {
      const fallbackSnap = await withFirestoreTimeout(
        getDocs(colRef),
        FIRESTORE_READ_TIMEOUT_MS,
        GRADE_REPORTS_COLLECTION
      );
      if (!fallbackSnap.metadata?.fromCache) {
        trackFirestoreRead(Math.max(1, fallbackSnap.size), 'جلب كشوفات الدرجات');
      }
      return mapSnapshotToGradeReports(fallbackSnap);
    } catch (error) {
      if (isQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
        return readCacheFallback();
      }
      const errMsg = String((error as any)?.message || error || '').toLowerCase();
      if (errMsg.includes('timed out') || errMsg.includes('timeout') || errMsg.includes('offline') || errMsg.includes('unavailable')) {
        console.warn(`[Firestore Sync] ${GRADE_REPORTS_COLLECTION} read deferred to realtime listener.`);
        return [];
      }
      handleFirestoreError(error, OperationType.GET, GRADE_REPORTS_COLLECTION);
    }
  }
}

/**
 * Subscribes in real time to ALL documents in `grade_reports` (including `submitted` pending reports)
 * using `onSnapshot` so Director & Teacher dashboards update immediately across browsers.
 */
export function subscribeGradeReportsRealtime(
  onReports: (reports: SentGradeSheet[]) => void,
  onError?: (err: unknown) => void
): () => void {
  if (!db || isFirestoreQuotaExceeded()) return () => {};
  const colRef = collection(db, GRADE_REPORTS_COLLECTION);
  const unsub = onSnapshot(
    colRef,
    (snap) => {
      if (!snap.metadata?.fromCache) {
        trackFirestoreRead(Math.max(1, snap.size), 'استماع فوري لكشوفات الدرجات', { isRealtime: true });
      }
      onReports(mapSnapshotToGradeReports(snap));
    },
    (error) => {
      if (isQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
      }
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.GET, GRADE_REPORTS_COLLECTION);
      } catch {
        // Error already logged cleanly as FirestoreErrorInfo JSON
      }
    }
  );
  return registerActiveFirestoreListener(unsub);
}

export { extractFirestoreErrorMessage };
