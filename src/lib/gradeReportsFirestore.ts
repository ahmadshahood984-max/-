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
  isFirestoreReadQuotaExceeded,
  isFirestoreWriteQuotaExceeded,
  isQuotaError,
  markFirestoreReadQuotaExceeded,
  markFirestoreWriteQuotaExceeded,
  registerActiveFirestoreListener
} from './quotaManager';
import {
  deleteLiveRelayGradeReport,
  fetchLiveRelaySnapshot,
  getCachedRelayGradeReports,
  getDeletedRelayGradeReportIds,
  pushLiveRelayGradeReport,
  subscribeLiveRelayGradeReports
} from './liveRelayClient';

export const GRADE_REPORTS_COLLECTION = 'grade_reports';

export class FirestoreQuotaExceededError extends Error {
  public readonly isQuota = true;
  constructor(message = 'resource-exhausted: Firestore daily quota exceeded') {
    super(message);
    this.name = 'FirestoreQuotaExceededError';
  }
}

export function isFirestoreQuotaError(err: unknown): boolean {
  return Boolean((err as any)?.isQuota) || isQuotaError(err);
}

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

function mergeGradeReportLists(
  primary: SentGradeSheet[],
  secondary: SentGradeSheet[]
): SentGradeSheet[] {
  const deletedIds = getDeletedRelayGradeReportIds();
  const map = new Map<string, SentGradeSheet & { updatedAt?: number }>();

  for (const list of [primary, secondary]) {
    for (const item of list) {
      if (!item || !item.id) continue;
      const itemTs = Number((item as any).updatedAt) || new Date(item.dateSent || 0).getTime() || 0;
      const deletedTs = deletedIds.get(item.id) || 0;
      if (deletedTs > itemTs) continue;

      const existing = map.get(item.id);
      const existingTs = Number(existing?.updatedAt) || (existing ? new Date(existing.dateSent || 0).getTime() || 0 : 0);
      if (!existing || itemTs >= existingTs) {
        map.set(item.id, item as SentGradeSheet & { updatedAt?: number });
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => (new Date(b.dateSent || 0).getTime() || 0) - (new Date(a.dateSent || 0).getTime() || 0)
  );
}

/**
 * Writes a submitted or approved grade report to Firestore (`grade_reports/{sheet.id}`)
 * AND broadcasts via Live Relay so Director/Teacher/Parent receive it instantaneously even if
 * Firestore's daily Spark write quota is exhausted.
 */
export async function submitGradeReportToFirestore(sheet: SentGradeSheet): Promise<SentGradeSheet> {
  const reportId = String(sheet.id || `gs_teacher_${Date.now()}`).trim();
  const reportPath = `${GRADE_REPORTS_COLLECTION}/${reportId}`;
  const payload = sanitizeForFirestore({
    ...sheet,
    id: reportId,
    updatedAt: Date.now()
  }) as SentGradeSheet & { updatedAt: number };

  // Mirror over SSE Live Relay immediately for instant cross-portal delivery
  const relayPromise = pushLiveRelayGradeReport(payload).catch(() => false);

  if (!db) {
    const relayOk = await relayPromise;
    if (relayOk) {
      return Object.assign({}, payload, { __deliveredViaRelay: true });
    }
    throw new Error('لم يتم تهيئة قاعدة بيانات Firestore.');
  }

  if (isFirestoreWriteQuotaExceeded()) {
    const relayOk = await relayPromise;
    if (relayOk) {
      return Object.assign({}, payload, { __deliveredViaRelay: true });
    }
    throw new FirestoreQuotaExceededError();
  }

  try {
    await withFirestoreTimeout(
      setDoc(doc(db, GRADE_REPORTS_COLLECTION, reportId), payload),
      FIRESTORE_WRITE_TIMEOUT_MS,
      reportPath
    );
    trackFirestoreWrite(1, `رفع كشف درجات (${sheet.className || reportId})`);
    await relayPromise;
    return payload;
  } catch (error) {
    if (isQuotaError(error)) {
      markFirestoreWriteQuotaExceeded(error);
      const relayOk = await relayPromise;
      if (relayOk) {
        return Object.assign({}, payload, { __deliveredViaRelay: true });
      }
      throw new FirestoreQuotaExceededError(error instanceof Error ? error.message : String(error));
    }
    const relayOk = await relayPromise;
    if (relayOk) {
      return Object.assign({}, payload, { __deliveredViaRelay: true });
    }
    handleFirestoreError(error, OperationType.WRITE, reportPath);
  }
}

/**
 * Updates an existing grade report in `grade_reports/{sheet.id}` (e.g., when Director approves)
 * and broadcasts over the Live Relay.
 */
export async function updateGradeReportInFirestore(sheet: SentGradeSheet): Promise<SentGradeSheet> {
  const reportId = String(sheet.id || '').trim();
  if (!reportId) {
    throw new Error('معرّف كشف الدرجات مفقود.');
  }
  const reportPath = `${GRADE_REPORTS_COLLECTION}/${reportId}`;
  const payload = sanitizeForFirestore({
    ...sheet,
    id: reportId,
    updatedAt: Date.now()
  }) as SentGradeSheet & { updatedAt: number };

  const relayPromise = pushLiveRelayGradeReport(payload).catch(() => false);

  if (!db) {
    const relayOk = await relayPromise;
    if (relayOk) {
      return Object.assign({}, payload, { __deliveredViaRelay: true });
    }
    throw new Error('لم يتم تهيئة قاعدة بيانات Firestore.');
  }

  if (isFirestoreWriteQuotaExceeded()) {
    const relayOk = await relayPromise;
    if (relayOk) {
      return Object.assign({}, payload, { __deliveredViaRelay: true });
    }
    throw new FirestoreQuotaExceededError();
  }

  try {
    await withFirestoreTimeout(
      setDoc(doc(db, GRADE_REPORTS_COLLECTION, reportId), payload, { merge: true }),
      FIRESTORE_WRITE_TIMEOUT_MS,
      reportPath
    );
    trackFirestoreWrite(1, `اعتماد/تحديث كشف درجات (${sheet.className || reportId})`);
    await relayPromise;
    return payload;
  } catch (error) {
    if (isQuotaError(error)) {
      markFirestoreWriteQuotaExceeded(error);
      const relayOk = await relayPromise;
      if (relayOk) {
        return Object.assign({}, payload, { __deliveredViaRelay: true });
      }
      throw new FirestoreQuotaExceededError(error instanceof Error ? error.message : String(error));
    }
    const relayOk = await relayPromise;
    if (relayOk) {
      return Object.assign({}, payload, { __deliveredViaRelay: true });
    }
    handleFirestoreError(error, OperationType.WRITE, reportPath);
  }
}

/**
 * Deletes a grade report from `grade_reports/{reportId}` in Firestore and Live Relay.
 */
export async function deleteGradeReportFromFirestore(reportId: string): Promise<void> {
  if (!reportId) return;
  const relayPromise = deleteLiveRelayGradeReport(reportId).catch(() => false);
  if (!db) {
    await relayPromise;
    return;
  }
  const reportPath = `${GRADE_REPORTS_COLLECTION}/${reportId}`;
  if (isFirestoreWriteQuotaExceeded()) {
    const relayOk = await relayPromise;
    if (relayOk) return;
    throw new FirestoreQuotaExceededError();
  }

  try {
    await withFirestoreTimeout(
      deleteDoc(doc(db, GRADE_REPORTS_COLLECTION, reportId)),
      FIRESTORE_WRITE_TIMEOUT_MS,
      reportPath
    );
    trackFirestoreWrite(1, `حذف كشف درجات (${reportId})`);
    await relayPromise;
  } catch (error) {
    if (isQuotaError(error)) {
      markFirestoreWriteQuotaExceeded(error);
      const relayOk = await relayPromise;
      if (relayOk) return;
      throw new FirestoreQuotaExceededError(error instanceof Error ? error.message : String(error));
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
 * Fetches all grade reports directly from `grade_reports` on Firestore server AND Live Relay
 * WITHOUT filtering out pending (`submitted`) reports. Never blocked by Firestore write quota!
 */
export async function fetchGradeReportsFromFirestore(): Promise<SentGradeSheet[]> {
  const relayPromise = fetchLiveRelaySnapshot()
    .then((snap) => (snap?.gradeReports ? Object.values(snap.gradeReports) : getCachedRelayGradeReports()))
    .catch(() => getCachedRelayGradeReports());

  if (!db) {
    return await relayPromise;
  }

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

  if (isOffline || isFirestoreReadQuotaExceeded()) {
    const [cached, relayList] = await Promise.all([readCacheFallback(), relayPromise]);
    return mergeGradeReportLists(cached, relayList);
  }

  try {
    const [snap, relayList] = await Promise.all([
      withFirestoreTimeout(getDocsFromServer(colRef), FIRESTORE_READ_TIMEOUT_MS, GRADE_REPORTS_COLLECTION),
      relayPromise
    ]);
    trackFirestoreRead(Math.max(1, snap.size), 'جلب كشوفات الدرجات من السحابة');
    return mergeGradeReportLists(mapSnapshotToGradeReports(snap), relayList);
  } catch (serverErr: any) {
    if (isQuotaError(serverErr)) {
      markFirestoreReadQuotaExceeded(serverErr);
      const [cached, relayList] = await Promise.all([readCacheFallback(), relayPromise]);
      return mergeGradeReportLists(cached, relayList);
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

    const [cached, relayList] = await Promise.all([readCacheFallback(), relayPromise]);
    if (cached.length > 0 || relayList.length > 0 || isTransientTimeoutOrOffline) {
      if (isTransientTimeoutOrOffline) {
        console.warn(`[Firestore Sync] Transient read timeout for ${GRADE_REPORTS_COLLECTION}; using cached/relay data.`);
      }
      return mergeGradeReportLists(cached, relayList);
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
      return mergeGradeReportLists(mapSnapshotToGradeReports(fallbackSnap), relayList);
    } catch (error) {
      if (isQuotaError(error)) {
        markFirestoreReadQuotaExceeded(error);
        return mergeGradeReportLists(await readCacheFallback(), relayList);
      }
      const errMsg = String((error as any)?.message || error || '').toLowerCase();
      if (errMsg.includes('timed out') || errMsg.includes('timeout') || errMsg.includes('offline') || errMsg.includes('unavailable')) {
        console.warn(`[Firestore Sync] ${GRADE_REPORTS_COLLECTION} read deferred to realtime listener.`);
        return relayList;
      }
      handleFirestoreError(error, OperationType.GET, GRADE_REPORTS_COLLECTION);
    }
  }
}

/**
 * Subscribes in real time to ALL documents in `grade_reports` (including `submitted` pending reports)
 * over BOTH Firestore `onSnapshot` (while read quota permits) AND Live Relay SSE pushes.
 */
export function subscribeGradeReportsRealtime(
  onReports: (reports: SentGradeSheet[]) => void,
  onError?: (err: unknown) => void
): () => void {
  let latestFirestoreReports: SentGradeSheet[] = [];
  let latestRelayReports: SentGradeSheet[] = getCachedRelayGradeReports();

  const emitCombined = () => {
    const combined = mergeGradeReportLists(latestFirestoreReports, latestRelayReports);
    if (combined.length > 0) {
      onReports(combined);
    }
  };

  // Subscribe to SSE Live Relay grade report updates regardless of Firestore quota state
  const unsubRelay = subscribeLiveRelayGradeReports(() => {
    latestRelayReports = getCachedRelayGradeReports();
    emitCombined();
  });

  if (latestRelayReports.length > 0) {
    emitCombined();
  }

  let unsubFirestore = () => {};
  if (db && !isFirestoreReadQuotaExceeded()) {
    const colRef = collection(db, GRADE_REPORTS_COLLECTION);
    const rawUnsub = onSnapshot(
      colRef,
      (snap) => {
        if (!snap.metadata?.fromCache) {
          trackFirestoreRead(Math.max(1, snap.size), 'استماع فوري لكشوفات الدرجات', { isRealtime: true });
        }
        latestFirestoreReports = mapSnapshotToGradeReports(snap);
        emitCombined();
      },
      (error) => {
        if (isQuotaError(error)) {
          markFirestoreReadQuotaExceeded(error);
        }
        if (onError) onError(error);
        try {
          handleFirestoreError(error, OperationType.GET, GRADE_REPORTS_COLLECTION);
        } catch {
          // Error already logged cleanly as FirestoreErrorInfo JSON
        }
      }
    );
    unsubFirestore = registerActiveFirestoreListener(rawUnsub);
  }

  return () => {
    unsubRelay();
    unsubFirestore();
  };
}

export { extractFirestoreErrorMessage, isFirestoreQuotaExceeded };
