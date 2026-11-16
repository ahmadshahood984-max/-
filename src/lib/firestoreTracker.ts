/**
 * Centralized Firestore Consumption Tracker
 * Tracks every actual server read, write, and batch operation across ALL user devices
 * and synchronizes atomically with the shared Firestore document: `system_stats/consumption`.
 *
 * Loop-Prevention Guarantees:
 * 1. Flushing deltas to `system_stats/consumption` NEVER calls `trackFirestoreWrite` on itself.
 * 2. Listening to `system_stats/consumption` in the Admin dashboard NEVER triggers a read-back or write-back.
 * 3. Cache hits (`fromCache === true`) NEVER increment server consumption counters.
 */

import { db } from './firebase';
import {
  doc,
  setDoc,
  getDoc,
  increment,
  onSnapshot,
  runTransaction
} from 'firebase/firestore';
import {
  isFirestoreQuotaExceeded,
  markFirestoreQuotaExceeded,
  isQuotaError,
  registerActiveFirestoreListener,
  resetFirestoreQuotaBreaker
} from './quotaManager';

export interface FirestoreMetrics {
  date: string;           // YYYY-MM-DD
  reads: number;          // Local device reads today
  writes: number;         // Local device writes today
  simulatedReads: number; // Kept as 0 for backward-compatibility
  simulatedWrites: number;// Kept as 0 for backward-compatibility
  totalReads: number;     // Global total reads today across ALL devices
  totalWrites: number;    // Global total writes today across ALL devices
  firestoreReads: number; // Central counter from `system_stats/consumption`
  firestoreWrites: number;// Central counter from `system_stats/consumption`
  lastOperation?: string;
  lastUpdatedAt?: number;
  syncedFromCentral?: boolean;
}

const METRICS_KEY = 'school_firestore_metrics';
const METRICS_EVENT = 'school_firestore_metrics_updated';
const CONSUMPTION_COLLECTION = 'system_stats';
const CONSUMPTION_DOC_ID = 'consumption';

// Helper to get current YYYY-MM-DD date in local timezone
export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Pending deltas waiting to be flushed to `system_stats/consumption`
let pendingReads = 0;
let pendingWrites = 0;
let lastOperationLabel = '';
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;
let knownCentralDate: string | null = null;
let hasVerifiedCentralDateThisSession = false;

/**
 * Automatically checks if a new calendar day has started.
 * Resets local daily metrics & circuit breaker automatically without user interaction.
 */
export function checkDailyRollover(): boolean {
  const today = getTodayDateString();
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FirestoreMetrics;
      if (parsed.date !== today) {
        const freshMetrics: FirestoreMetrics = {
          date: today,
          reads: 0,
          writes: 0,
          simulatedReads: 0,
          simulatedWrites: 0,
          totalReads: 0,
          totalWrites: 0,
          firestoreReads: 0,
          firestoreWrites: 0,
          lastOperation: 'تصفير يومي تلقائي',
          lastUpdatedAt: Date.now(),
          syncedFromCentral: false
        };
        knownCentralDate = null;
        hasVerifiedCentralDateThisSession = false;
        saveMetrics(freshMetrics);
        resetFirestoreQuotaBreaker();
        return true;
      }
    } else {
      loadFirestoreMetrics();
      return true;
    }
  } catch (e) {
    console.warn('Notice in checkDailyRollover:', e);
  }
  return false;
}

// Load metrics from LocalStorage with automatic daily rollover detection
export function loadFirestoreMetrics(): FirestoreMetrics {
  const today = getTodayDateString();
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FirestoreMetrics;
      if (parsed.date === today) {
        if (parsed.firestoreReads === undefined) parsed.firestoreReads = 0;
        if (parsed.firestoreWrites === undefined) parsed.firestoreWrites = 0;
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Notice loading firestore metrics:', e);
  }

  const newMetrics: FirestoreMetrics = {
    date: today,
    reads: 0,
    writes: 0,
    simulatedReads: 0,
    simulatedWrites: 0,
    totalReads: 0,
    totalWrites: 0,
    firestoreReads: 0,
    firestoreWrites: 0,
    syncedFromCentral: false
  };
  saveMetrics(newMetrics);
  resetFirestoreQuotaBreaker();
  return newMetrics;
}

// Save metrics to LocalStorage and compute accurate non-duplicated totals
export function saveMetrics(metrics: FirestoreMetrics) {
  const centralR = (metrics.firestoreReads || 0) + pendingReads;
  const centralW = (metrics.firestoreWrites || 0) + pendingWrites;
  metrics.totalReads = Math.max(centralR, metrics.reads);
  metrics.totalWrites = Math.max(centralW, metrics.writes);
  try {
    localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
  } catch {
    // ignore quota errors on localStorage
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(METRICS_EVENT, { detail: metrics }));
  }
}

/**
 * Flushes pending read/write deltas atomically to `system_stats/consumption`.
 * Safe against infinite loops: NEVER invokes `trackFirestoreRead` or `trackFirestoreWrite`.
 */
export async function flushConsumptionToFirestore(): Promise<void> {
  if (isFlushing) return;
  if (pendingReads <= 0 && pendingWrites <= 0) return;
  if (!db || isFirestoreQuotaExceeded()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  isFlushing = true;
  const deltaReads = pendingReads;
  const deltaWrites = pendingWrites;
  const opLabel = lastOperationLabel;
  pendingReads = 0;
  pendingWrites = 0;

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const today = getTodayDateString();
  const consumptionRef = doc(db, CONSUMPTION_COLLECTION, CONSUMPTION_DOC_ID);

  try {
    // On first flush of the day/session or when date rolled over, run an atomic transaction
    // so yesterday's counts are cleanly rolled over to 0 before applying today's increments.
    if (!hasVerifiedCentralDateThisSession || (knownCentralDate && knownCentralDate !== today)) {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(consumptionRef);
        const existing = snap.exists() ? snap.data() : null;
        const existingDate = existing?.date;

        if (!existing || existingDate !== today) {
          tx.set(
            consumptionRef,
            {
              date: today,
              reads: deltaReads,
              writes: deltaWrites,
              lifetimeReads: (existing?.lifetimeReads || 0) + deltaReads,
              lifetimeWrites: (existing?.lifetimeWrites || 0) + deltaWrites,
              lastOperation: opLabel || 'operation',
              lastUpdatedAt: Date.now()
            },
            { merge: true }
          );
        } else {
          const updatePayload: Record<string, any> = {
            date: today,
            lastUpdatedAt: Date.now()
          };
          if (opLabel) updatePayload.lastOperation = opLabel;
          if (deltaReads > 0) {
            updatePayload.reads = increment(deltaReads);
            updatePayload.lifetimeReads = increment(deltaReads);
          }
          if (deltaWrites > 0) {
            updatePayload.writes = increment(deltaWrites);
            updatePayload.lifetimeWrites = increment(deltaWrites);
          }
          tx.set(consumptionRef, updatePayload, { merge: true });
        }
      });
      knownCentralDate = today;
      hasVerifiedCentralDateThisSession = true;
    } else {
      // Fast atomic increment without any extra read operation!
      const updatePayload: Record<string, any> = {
        date: today,
        lastUpdatedAt: Date.now()
      };
      if (opLabel) updatePayload.lastOperation = opLabel;
      if (deltaReads > 0) {
        updatePayload.reads = increment(deltaReads);
        updatePayload.lifetimeReads = increment(deltaReads);
      }
      if (deltaWrites > 0) {
        updatePayload.writes = increment(deltaWrites);
        updatePayload.lifetimeWrites = increment(deltaWrites);
      }
      await setDoc(consumptionRef, updatePayload, { merge: true });
    }
  } catch (err: any) {
    // Restore unsent deltas if transient failure so nothing is lost
    pendingReads += deltaReads;
    pendingWrites += deltaWrites;
    if (isQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
    } else {
      console.warn('[Firestore Tracker] Notice flushing central consumption:', err?.message || err);
    }
  } finally {
    isFlushing = false;
  }
}

/**
 * Queues read/write deltas and batches them to `system_stats/consumption`.
 * Batches rapidly occurring SDK operations within a 2-second window (or flushes immediately at >= 10 ops)
 * to preserve write quota while keeping the central dashboard live.
 */
export async function incrementFirestoreUsage(
  reads: number,
  writes: number,
  operationLabel?: string
) {
  if (reads <= 0 && writes <= 0) return;

  pendingReads += Math.max(0, reads);
  pendingWrites += Math.max(0, writes);
  if (operationLabel) {
    lastOperationLabel = operationLabel;
  }

  if (isFirestoreQuotaExceeded()) {
    return;
  }

  if (pendingReads + pendingWrites >= 10) {
    // Flush batch immediately for bulk operations
    flushConsumptionToFirestore().catch(() => {});
    return;
  }

  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushConsumptionToFirestore().catch(() => {});
    }, 2000);
  }
}

// Log an actual Firestore server Read operation
export function trackFirestoreRead(count: number = 1, operationLabel?: string) {
  if (count <= 0) return;
  const metrics = loadFirestoreMetrics();
  metrics.reads += count;
  if (operationLabel) metrics.lastOperation = operationLabel;
  metrics.lastUpdatedAt = Date.now();
  saveMetrics(metrics);
  incrementFirestoreUsage(count, 0, operationLabel);
}

// Log an actual Firestore server Write operation
export function trackFirestoreWrite(count: number = 1, operationLabel?: string) {
  if (count <= 0) return;
  const metrics = loadFirestoreMetrics();
  metrics.writes += count;
  if (operationLabel) metrics.lastOperation = operationLabel;
  metrics.lastUpdatedAt = Date.now();
  saveMetrics(metrics);
  incrementFirestoreUsage(0, count, operationLabel);
}

// Explicitly log activity operations
export function trackActivityOperation(
  type: 'read' | 'write',
  amount: number = 1,
  operationLabel?: string
) {
  if (type === 'read') {
    trackFirestoreRead(amount, operationLabel);
  } else {
    trackFirestoreWrite(amount, operationLabel);
  }
}

// Background traffic simulation disabled to reflect exact actual operations only
export function simulateBackgroundTraffic() {
  // No-op
}

/**
 * Fetches the live centralized consumption counts directly from `system_stats/consumption` once on load.
 */
export async function fetchCentralizedConsumptionOnce(): Promise<{
  reads: number;
  writes: number;
  date: string;
} | null> {
  if (!db || isFirestoreQuotaExceeded()) return null;
  try {
    const consumptionRef = doc(db, CONSUMPTION_COLLECTION, CONSUMPTION_DOC_ID);
    const snap = await Promise.race([
      getDoc(consumptionRef),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);

    if (snap && snap.exists()) {
      const data = snap.data();
      const today = getTodayDateString();
      const isToday = data?.date === today;
      knownCentralDate = data?.date || null;
      hasVerifiedCentralDateThisSession = true;

      const reads = isToday ? Number(data?.reads || 0) : 0;
      const writes = isToday ? Number(data?.writes || 0) : 0;

      const metrics = loadFirestoreMetrics();
      metrics.firestoreReads = reads;
      metrics.firestoreWrites = writes;
      metrics.lastOperation = data?.lastOperation || metrics.lastOperation;
      metrics.lastUpdatedAt = data?.lastUpdatedAt || Date.now();
      metrics.syncedFromCentral = true;
      saveMetrics(metrics);

      return { reads, writes, date: today };
    }
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
    }
  }
  return null;
}

/**
 * Subscribes the Admin Dashboard in real-time to `system_stats/consumption`.
 * Updates immediately whenever any teacher, parent, or admin device logs reads/writes.
 * NOTE: Does NOT increment `trackFirestoreRead` on its own snapshots to avoid loops.
 */
export function subscribeToFirebaseSystemUsage(
  callback: (usage: { reads: number; writes: number; lastOperation?: string }) => void
) {
  checkDailyRollover();
  const initialMetrics = loadFirestoreMetrics();
  callback({
    reads: initialMetrics.totalReads,
    writes: initialMetrics.totalWrites,
    lastOperation: initialMetrics.lastOperation
  });

  // 1. Listen to local storage updates (instant local responsiveness)
  const localHandler = (e: Event) => {
    const customEvent = e as CustomEvent<FirestoreMetrics>;
    if (customEvent.detail) {
      callback({
        reads: customEvent.detail.totalReads,
        writes: customEvent.detail.totalWrites,
        lastOperation: customEvent.detail.lastOperation
      });
    }
  };
  window.addEventListener(METRICS_EVENT, localHandler);

  // 2. Attach real-time Firestore listener on `system_stats/consumption`
  let unsubFirestore: (() => void) | null = null;
  if (db && !isFirestoreQuotaExceeded()) {
    try {
      const consumptionRef = doc(db, CONSUMPTION_COLLECTION, CONSUMPTION_DOC_ID);
      const rawUnsub = onSnapshot(
        consumptionRef,
        (snapshot) => {
          const today = getTodayDateString();
          if (snapshot.exists()) {
            const data = snapshot.data();
            knownCentralDate = data?.date || null;
            hasVerifiedCentralDateThisSession = true;

            const isToday = data?.date === today;
            const centralReads = isToday ? Number(data?.reads || 0) : 0;
            const centralWrites = isToday ? Number(data?.writes || 0) : 0;

            const metrics = loadFirestoreMetrics();
            metrics.firestoreReads = centralReads;
            metrics.firestoreWrites = centralWrites;
            metrics.lastOperation = data?.lastOperation || metrics.lastOperation;
            metrics.lastUpdatedAt = data?.lastUpdatedAt || Date.now();
            metrics.syncedFromCentral = true;
            saveMetrics(metrics);

            callback({
              reads: metrics.totalReads,
              writes: metrics.totalWrites,
              lastOperation: metrics.lastOperation
            });
          } else {
            knownCentralDate = today;
            hasVerifiedCentralDateThisSession = true;
          }
        },
        (error) => {
          if (isQuotaError(error)) {
            markFirestoreQuotaExceeded(error);
          } else {
            console.warn('[Firestore Tracker] Notice listening to system_stats/consumption:', error);
          }
        }
      );
      unsubFirestore = registerActiveFirestoreListener(rawUnsub);
    } catch (err: any) {
      if (isQuotaError(err)) {
        markFirestoreQuotaExceeded(err);
      }
    }
  }

  return () => {
    window.removeEventListener(METRICS_EVENT, localHandler);
    if (unsubFirestore) {
      try {
        unsubFirestore();
      } catch {
        // ignore
      }
    }
  };
}

/**
 * Resets BOTH the centralized `system_stats/consumption` document and local counters.
 */
export async function resetCentralizedFirestoreConsumption(): Promise<void> {
  const today = getTodayDateString();
  pendingReads = 0;
  pendingWrites = 0;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const freshMetrics: FirestoreMetrics = {
    date: today,
    reads: 0,
    writes: 0,
    simulatedReads: 0,
    simulatedWrites: 0,
    totalReads: 0,
    totalWrites: 0,
    firestoreReads: 0,
    firestoreWrites: 0,
    lastOperation: 'تصفير العداد المركزي',
    lastUpdatedAt: Date.now(),
    syncedFromCentral: true
  };
  saveMetrics(freshMetrics);

  if (db && !isFirestoreQuotaExceeded()) {
    try {
      const consumptionRef = doc(db, CONSUMPTION_COLLECTION, CONSUMPTION_DOC_ID);
      await setDoc(
        consumptionRef,
        {
          date: today,
          reads: 0,
          writes: 0,
          lastOperation: 'تصفير العداد المركزي',
          lastUpdatedAt: Date.now()
        },
        { merge: true }
      );
      knownCentralDate = today;
      hasVerifiedCentralDateThisSession = true;
    } catch (err: any) {
      if (isQuotaError(err)) {
        markFirestoreQuotaExceeded(err);
      }
    }
  }
}

// Auto-start background monitoring and flush pending deltas on page hide
if (typeof window !== 'undefined') {
  loadFirestoreMetrics();
  checkDailyRollover();

  setInterval(checkDailyRollover, 15000);

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkDailyRollover();
    } else if (document.visibilityState === 'hidden') {
      flushConsumptionToFirestore().catch(() => {});
    }
  });
  window.addEventListener('focus', () => {
    checkDailyRollover();
  });
  window.addEventListener('pagehide', () => {
    flushConsumptionToFirestore().catch(() => {});
  });
}

// Subscribe helper for React components (includes live centralized sync when `syncCentral` is true)
export function subscribeToFirestoreMetrics(
  callback: (metrics: FirestoreMetrics) => void,
  options?: { syncCentral?: boolean }
) {
  checkDailyRollover();
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<FirestoreMetrics>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    }
  };

  window.addEventListener(METRICS_EVENT, handler);
  callback(loadFirestoreMetrics());

  let unsubCentral: (() => void) | null = null;
  if (options?.syncCentral) {
    fetchCentralizedConsumptionOnce().catch(() => {});
    unsubCentral = subscribeToFirebaseSystemUsage(() => {
      // state updates are broadcast via METRICS_EVENT -> handler above
    });
  }

  return () => {
    window.removeEventListener(METRICS_EVENT, handler);
    if (unsubCentral) unsubCentral();
  };
}
