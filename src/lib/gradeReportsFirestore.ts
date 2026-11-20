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
  markFirestoreWriteQuotaExceeded
} from './quotaManager';
import {
  deleteLiveRelayGradeReport,
  fetchLiveRelaySnapshot,
  getCachedRelayGradeReports,
  getDeletedRelayGradeReportIds,
  pushLiveRelayGradeReport,
  subscribeLiveRelayGradeReports
} from './liveRelayClient';
import { isReadCacheFresh, markReadCacheFresh, invalidateReadCache } from './readCache';

export const GRADE_REPORTS_COLLECTION = 'grade_reports';
const GRADE_REPORTS_CACHE_KEY = 'grade_reports:all';
const GRADE_REPORTS_LOCAL_KEY = 'school_grade_reports_cache_v1';

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

  const firestoreWritePromise: Promise<void> = withFirestoreTimeout(
    setDoc(doc(db, GRADE_REPORTS_COLLECTION, reportId), payload),
    FIRESTORE_WRITE_TIMEOUT_MS,
    reportPath
  ).then(() => {
    trackFirestoreWrite(1, `رفع كشف درجات (${sheet.className || reportId})`);
  });

  try {
    await Promise.all([firestoreWritePromise, relayPromise]);
    invalidateReadCache(GRADE_REPORTS_CACHE_KEY);
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
      console.warn(`Firestore submit fell back to relay (${reportPath}):`, error);
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

  const firestoreWritePromise: Promise<void> = withFirestoreTimeout(
    setDoc(doc(db, GRADE_REPORTS_COLLECTION, reportId), payload, { merge: true }),
    FIRESTORE_WRITE_TIMEOUT_MS,
    reportPath
  ).then(() => {
    trackFirestoreWrite(1, `اعتماد/تحديث كشف درجات (${sheet.className || reportId})`);
  });

  try {
    await Promise.all([firestoreWritePromise, relayPromise]);
    invalidateReadCache(GRADE_REPORTS_CACHE_KEY);
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
      console.warn(`Firestore update fell back to relay (${reportPath}):`, error);
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
    invalidateReadCache(GRADE_REPORTS_CACHE_KEY);
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

let activeGradeReportsFetchPromise: Promise<SentGradeSheet[]> | null = null;
let lastGradeReportsFetchResult: SentGradeSheet[] | null = null;

function loadCachedGradeReportsFromLocal(): SentGradeSheet[] {
  if (lastGradeReportsFetchResult && lastGradeReportsFetchResult.length > 0) {
    return lastGradeReportsFetchResult;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(GRADE_REPORTS_LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {}
  return [];
}

function saveCachedGradeReportsToLocal(list: SentGradeSheet[]): void {
  lastGradeReportsFetchResult = list;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(GRADE_REPORTS_LOCAL_KEY, JSON.stringify(list));
    }
  } catch {}
}

/**
 * Fetches grade reports on-demand from `grade_reports` with a strict 5-minute TTL cache
 * plus Live Relay merge. Only hits Firestore server if > 5 minutes elapsed or `force: true`.
 */
export async function fetchGradeReportsFromFirestore(options?: { force?: boolean }): Promise<SentGradeSheet[]> {
  const force = Boolean(options?.force);
  if (!force && activeGradeReportsFetchPromise) {
    return activeGradeReportsFetchPromise;
  }

  // Enforce 5-minute TTL cache across tabs and portal switches
  if (!force && isReadCacheFresh(GRADE_REPORTS_CACHE_KEY)) {
    const cachedList = mergeGradeReportLists(loadCachedGradeReportsFromLocal(), getCachedRelayGradeReports());
    if (cachedList.length > 0) {
      return cachedList;
    }
  }

  const runFetch = (async (): Promise<SentGradeSheet[]> => {
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
        const fromIdb = mapSnapshotToGradeReports(cacheSnap);
        if (fromIdb.length > 0) return fromIdb;
      } catch {}
      return loadCachedGradeReportsFromLocal();
    };

    if (isOffline || isFirestoreReadQuotaExceeded()) {
      const [cached, relayList] = await Promise.all([readCacheFallback(), relayPromise]);
      return mergeGradeReportLists(cached, relayList);
    }

    try {
      const [snap, relayList] = await Promise.all([
        withFirestoreTimeout(
          force ? getDocsFromServer(colRef) : getDocs(colRef),
          FIRESTORE_READ_TIMEOUT_MS,
          GRADE_REPORTS_COLLECTION
        ),
        relayPromise
      ]);
      const fromCache = !!snap.metadata?.fromCache;
      if (!fromCache) {
        trackFirestoreRead(Math.max(1, snap.size), 'جلب كشوفات الدرجات عند الطلب');
        markReadCacheFresh(GRADE_REPORTS_CACHE_KEY);
      }
      const merged = mergeGradeReportLists(mapSnapshotToGradeReports(snap), relayList);
      saveCachedGradeReportsToLocal(merged);
      return merged;
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

      const [cached, relayList] = await Promise.all([readCacheFallback(), relayPromise]);
      return mergeGradeReportLists(cached, relayList);
    }
  })();

  activeGradeReportsFetchPromise = runFetch;
  try {
    return await runFetch;
  } finally {
    if (activeGradeReportsFetchPromise === runFetch) {
      activeGradeReportsFetchPromise = null;
    }
  }
}

/**
 * Subscribes to grade report updates via ZERO-Firestore-read Live Relay SSE
 * and performs at most ONE on-demand cached fetch (5-minute TTL) instead of a continuous
 * collection-wide `onSnapshot` listener.
 */
export function subscribeGradeReportsRealtime(
  onReports: (reports: SentGradeSheet[]) => void,
  onError?: (err: unknown) => void
): () => void {
  let latestFirestoreReports: SentGradeSheet[] = loadCachedGradeReportsFromLocal();
  let latestRelayReports: SentGradeSheet[] = getCachedRelayGradeReports();
  let disposed = false;

  const emitCombined = () => {
    if (disposed) return;
    const combined = mergeGradeReportLists(latestFirestoreReports, latestRelayReports);
    if (combined.length > 0) {
      onReports(combined);
    }
  };

  // Instant zero-read updates via SSE Live Relay
  const unsubRelay = subscribeLiveRelayGradeReports(() => {
    latestRelayReports = getCachedRelayGradeReports();
    emitCombined();
  });

  if (latestFirestoreReports.length > 0 || latestRelayReports.length > 0) {
    emitCombined();
  }

  // On-demand fetch ONLY if 5-minute cache expired (0 reads within 5-minute window)
  fetchGradeReportsFromFirestore({ force: false })
    .then((reports) => {
      if (disposed) return;
      latestFirestoreReports = reports;
      emitCombined();
    })
    .catch((err) => {
      if (onError) onError(err);
    });

  return () => {
    disposed = true;
    unsubRelay();
  };
}

export { extractFirestoreErrorMessage, isFirestoreQuotaExceeded };
