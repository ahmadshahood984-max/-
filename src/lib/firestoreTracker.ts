/**
 * Centralized Firestore Consumption Tracker
 * Accurately mirrors Firebase Console & Spark Plan quota accounting:
 * - Daily Spark quota resets at Midnight Pacific Time (`America/Los_Angeles`).
 * - 7-day rolling UTC daily buckets (`dailyHistory`) match Firebase Console Overview (`آخر 7 أيام`).
 * - Separately tracks Realtime Reads (`onSnapshot` server snapshots) vs Direct Reads, plus Writes.
 * - Counts `system_stats/consumption` own flush reads/writes inline without triggering loops.
 * - Persists pending deltas in localStorage so reloads never drop unflushed writes.
 */

import { db, writeFirestoreDocFast } from './firebase';
import firebaseConfigJson from '../../firebase-applet-config.json';
import {
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  increment,
  onSnapshot,
  runTransaction
} from 'firebase/firestore';
import {
  isFirestoreWriteQuotaExceeded,
  isFirestoreReadQuotaExceeded,
  markFirestoreWriteQuotaExceeded,
  markFirestoreReadQuotaExceeded,
  isQuotaError,
  registerActiveFirestoreListener,
  resetFirestoreQuotaBreaker,
  getFirebaseQuotaDateStr,
  getUtcDateStr
} from './quotaManager';
import { isReadCacheFresh, markReadCacheFresh } from './readCache';
import { clearPendingGradeBatches } from './offlineVault';

export const FIREBASE_PROJECT_ID = firebaseConfigJson.projectId || 'madrasa-international';
export const FIREBASE_DATABASE_ID =
  firebaseConfigJson.firestoreDatabaseId || '(default)';

export const SPARK_DAILY_READ_LIMIT = 50000;
export const SPARK_DAILY_WRITE_LIMIT = 20000;
export const SPARK_DAILY_DELETE_LIMIT = 20000;
export const SPARK_STORAGE_LIMIT_MB = 1024;
export const QUOTA_WARNING_RATIO = 0.8;

export interface DailyUsageBucket {
  reads: number;
  writes: number;
  realtimeReads: number;
}

export interface FirestoreMetrics {
  date: string;                    // Official Firebase Quota Date YYYY-MM-DD (America/Los_Angeles)
  utcDate?: string;                // Current UTC Date YYYY-MM-DD
  reads: number;                   // Local device reads today (PT)
  writes: number;                  // Local device writes today (PT)
  realtimeReads?: number;          // Local device realtime onSnapshot server reads today (PT)
  simulatedReads: number;          // Kept as 0 for backward-compatibility
  simulatedWrites: number;         // Kept as 0 for backward-compatibility
  totalReads: number;              // Global total reads today across ALL devices (PT)
  totalWrites: number;             // Global total writes today across ALL devices (PT)
  totalRealtimeReads?: number;     // Global realtime reads today across ALL devices (PT)
  remainingReads?: number;         // Remaining free daily reads out of 50,000
  remainingWrites?: number;        // Remaining free daily writes out of 20,000
  remainingReadsPercent?: number;  // Remaining free reads %
  remainingWritesPercent?: number; // Remaining free writes %
  firestoreReads: number;          // Central counter reads today from `system_stats/consumption`
  firestoreWrites: number;         // Central counter writes today from `system_stats/consumption`
  firestoreRealtimeReads?: number; // Central counter realtime reads today from `system_stats/consumption`
  reads7d?: number;                // Sum of last 7 UTC days (matches Firebase Console 7d chart)
  writes7d?: number;               // Sum of last 7 UTC days (matches Firebase Console 7d chart)
  realtimeReads7d?: number;        // Sum of last 7 UTC days (matches Firebase Console 7d chart)
  lifetimeReads?: number;          // Cumulative tracked reads across lifetime
  lifetimeWrites?: number;         // Cumulative tracked writes across lifetime
  lifetimeRealtimeReads?: number;  // Cumulative tracked realtime reads across lifetime
  dailyHistory?: Record<string, DailyUsageBucket>; // Keyed by UTC YYYY-MM-DD
  pendingLocalReads?: number;      // Pending local delta awaiting flush
  pendingLocalWrites?: number;     // Pending local delta awaiting flush
  lastOperation?: string;
  lastUpdatedAt?: number;
  syncedFromCentral?: boolean;
}

const METRICS_KEY = 'school_firestore_metrics';
const PENDING_DELTAS_KEY = 'school_firestore_pending_deltas';
const METRICS_EVENT = 'school_firestore_metrics_updated';
const CONSUMPTION_COLLECTION = 'system_stats';
const CONSUMPTION_DOC_ID = 'consumption';

/**
 * Returns today's YYYY-MM-DD in Firebase Spark Plan's official quota timezone (America/Los_Angeles PT).
 */
export function getTodayDateString(): string {
  return getFirebaseQuotaDateStr();
}

/**
 * Returns the last `days` UTC date strings YYYY-MM-DD (oldest -> newest, inclusive of today UTC),
 * matching Firebase Console's 7-day Overview buckets.
 */
export function getRecentUtcDates(days: number = 7): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    result.push(getUtcDateStr(d));
  }
  return result;
}

/**
 * Returns hours and minutes remaining until Firebase Spark daily quota resets (Midnight America/Los_Angeles PT).
 */
export function getTimeUntilFirebaseQuotaReset(now: Date = new Date()): { hours: number; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(now);
    const h = Number(parts.find(p => p.type === 'hour')?.value || 0) % 24;
    const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
    const totalRemainingMinutes = Math.max(0, 24 * 60 - (h * 60 + m));
    return {
      hours: Math.floor(totalRemainingMinutes / 60),
      minutes: totalRemainingMinutes % 60
    };
  } catch {
    return { hours: 0, minutes: 0 };
  }
}

interface PendingDeltasState {
  quotaDate: string;
  reads: number;
  writes: number;
  realtimeReads: number;
  utcBuckets: Record<string, DailyUsageBucket>;
  lastOperation?: string;
}

function loadPendingDeltas(): PendingDeltasState {
  const quotaDate = getTodayDateString();
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(PENDING_DELTAS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PendingDeltasState;
        if (parsed && typeof parsed === 'object') {
          return {
            quotaDate: parsed.quotaDate || quotaDate,
            reads: Number(parsed.reads) || 0,
            writes: Number(parsed.writes) || 0,
            realtimeReads: Number(parsed.realtimeReads) || 0,
            utcBuckets: parsed.utcBuckets && typeof parsed.utcBuckets === 'object' ? parsed.utcBuckets : {},
            lastOperation: parsed.lastOperation || ''
          };
        }
      }
    }
  } catch {
    // ignore
  }
  return {
    quotaDate,
    reads: 0,
    writes: 0,
    realtimeReads: 0,
    utcBuckets: {},
    lastOperation: ''
  };
}

const ACTIVE_FIREBASE_TARGET_KEY = 'school_active_firebase_target';
try {
  if (typeof localStorage !== 'undefined') {
    const targetSig = `${FIREBASE_PROJECT_ID}:${FIREBASE_DATABASE_ID}`;
    const prevTarget = localStorage.getItem(ACTIVE_FIREBASE_TARGET_KEY);
    if (!prevTarget || prevTarget !== targetSig) {
      localStorage.removeItem(METRICS_KEY);
      localStorage.removeItem(PENDING_DELTAS_KEY);
      localStorage.removeItem('school_consolidated_synced_sigs_v1');
      resetFirestoreQuotaBreaker();
      clearPendingGradeBatches().catch(() => {});
      localStorage.setItem(ACTIVE_FIREBASE_TARGET_KEY, targetSig);
    }
  }
} catch {
  // ignore
}

let pendingState: PendingDeltasState = loadPendingDeltas();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;
let knownCentralDate: string | null = null;
let hasVerifiedCentralDateThisSession = false;

function persistPendingDeltas() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PENDING_DELTAS_KEY, JSON.stringify(pendingState));
    }
  } catch {
    // ignore
  }
}

function pruneOldUtcBuckets(history: Record<string, DailyUsageBucket>, keepDays: number = 14): Record<string, DailyUsageBucket> {
  const validDates = new Set(getRecentUtcDates(keepDays));
  const pruned: Record<string, DailyUsageBucket> = {};
  for (const [utcDay, bucket] of Object.entries(history || {})) {
    if (validDates.has(utcDay) && bucket) {
      pruned[utcDay] = {
        reads: Number(bucket.reads) || 0,
        writes: Number(bucket.writes) || 0,
        realtimeReads: Number(bucket.realtimeReads) || 0
      };
    }
  }
  return pruned;
}

function mergeBuckets(
  base: Record<string, DailyUsageBucket> | undefined,
  delta: Record<string, DailyUsageBucket> | undefined
): Record<string, DailyUsageBucket> {
  const out: Record<string, DailyUsageBucket> = {};
  for (const [d, b] of Object.entries(base || {})) {
    if (!b) continue;
    out[d] = {
      reads: Number(b.reads) || 0,
      writes: Number(b.writes) || 0,
      realtimeReads: Number(b.realtimeReads) || 0
    };
  }
  for (const [d, b] of Object.entries(delta || {})) {
    if (!b) continue;
    const prev = out[d] || { reads: 0, writes: 0, realtimeReads: 0 };
    out[d] = {
      reads: prev.reads + (Number(b.reads) || 0),
      writes: prev.writes + (Number(b.writes) || 0),
      realtimeReads: prev.realtimeReads + (Number(b.realtimeReads) || 0)
    };
  }
  return pruneOldUtcBuckets(out, 14);
}

function compute7dSums(history: Record<string, DailyUsageBucket> | undefined): DailyUsageBucket {
  const recent7 = getRecentUtcDates(7);
  let reads = 0;
  let writes = 0;
  let realtimeReads = 0;
  for (const day of recent7) {
    const b = history?.[day];
    if (b) {
      reads += Number(b.reads) || 0;
      writes += Number(b.writes) || 0;
      realtimeReads += Number(b.realtimeReads) || 0;
    }
  }
  return { reads, writes, realtimeReads };
}

/**
 * Automatically checks if a new official Firebase Spark quota day (America/Los_Angeles PT) has started.
 * Resets daily Spark counters while preserving 7-day UTC history & lifetime totals.
 */
export function checkDailyRollover(): boolean {
  const today = getTodayDateString();
  const utcToday = getUtcDateStr();
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FirestoreMetrics;
      if (parsed.date !== today) {
        const preservedHistory = pruneOldUtcBuckets(parsed.dailyHistory || {}, 14);
        const freshMetrics: FirestoreMetrics = {
          date: today,
          utcDate: utcToday,
          reads: 0,
          writes: 0,
          realtimeReads: 0,
          simulatedReads: 0,
          simulatedWrites: 0,
          totalReads: 0,
          totalWrites: 0,
          totalRealtimeReads: 0,
          firestoreReads: 0,
          firestoreWrites: 0,
          firestoreRealtimeReads: 0,
          lifetimeReads: Number(parsed.lifetimeReads) || 0,
          lifetimeWrites: Number(parsed.lifetimeWrites) || 0,
          lifetimeRealtimeReads: Number(parsed.lifetimeRealtimeReads) || 0,
          dailyHistory: preservedHistory,
          lastOperation: 'تصفير يومي تلقائي (توقيت حصة Firebase PT)',
          lastUpdatedAt: Date.now(),
          syncedFromCentral: false
        };
        if (pendingState.quotaDate !== today) {
          pendingState.quotaDate = today;
          pendingState.reads = 0;
          pendingState.writes = 0;
          pendingState.realtimeReads = 0;
          persistPendingDeltas();
        }
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
  const utcToday = getUtcDateStr();
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FirestoreMetrics;
      if (parsed.date === today) {
        if (parsed.firestoreReads === undefined) parsed.firestoreReads = 0;
        if (parsed.firestoreWrites === undefined) parsed.firestoreWrites = 0;
        if (parsed.firestoreRealtimeReads === undefined) parsed.firestoreRealtimeReads = 0;
        if (parsed.realtimeReads === undefined) parsed.realtimeReads = 0;
        if (!parsed.dailyHistory) parsed.dailyHistory = {};
        parsed.utcDate = utcToday;
        const sums7d = compute7dSums(mergeBuckets(parsed.dailyHistory, pendingState.utcBuckets));
        parsed.reads7d = sums7d.reads;
        parsed.writes7d = sums7d.writes;
        parsed.realtimeReads7d = sums7d.realtimeReads;
        parsed.pendingLocalReads = pendingState.quotaDate === today ? pendingState.reads : 0;
        parsed.pendingLocalWrites = pendingState.quotaDate === today ? pendingState.writes : 0;
        parsed.remainingReads = Math.max(0, SPARK_DAILY_READ_LIMIT - (parsed.totalReads || 0));
        parsed.remainingWrites = Math.max(0, SPARK_DAILY_WRITE_LIMIT - (parsed.totalWrites || 0));
        parsed.remainingReadsPercent = Math.max(0, Math.min(100, (parsed.remainingReads / SPARK_DAILY_READ_LIMIT) * 100));
        parsed.remainingWritesPercent = Math.max(0, Math.min(100, (parsed.remainingWrites / SPARK_DAILY_WRITE_LIMIT) * 100));
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Notice loading firestore metrics:', e);
  }

  let preservedHistory: Record<string, DailyUsageBucket> = {};
  let preservedLifetimeR = 0;
  let preservedLifetimeW = 0;
  let preservedLifetimeRt = 0;
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (raw) {
      const old = JSON.parse(raw) as FirestoreMetrics;
      preservedHistory = pruneOldUtcBuckets(old.dailyHistory || {}, 14);
      preservedLifetimeR = Number(old.lifetimeReads) || 0;
      preservedLifetimeW = Number(old.lifetimeWrites) || 0;
      preservedLifetimeRt = Number(old.lifetimeRealtimeReads) || 0;
    }
  } catch {}

  const newMetrics: FirestoreMetrics = {
    date: today,
    utcDate: utcToday,
    reads: 0,
    writes: 0,
    realtimeReads: 0,
    simulatedReads: 0,
    simulatedWrites: 0,
    totalReads: 0,
    totalWrites: 0,
    totalRealtimeReads: 0,
    firestoreReads: 0,
    firestoreWrites: 0,
    firestoreRealtimeReads: 0,
    lifetimeReads: preservedLifetimeR,
    lifetimeWrites: preservedLifetimeW,
    lifetimeRealtimeReads: preservedLifetimeRt,
    dailyHistory: preservedHistory,
    syncedFromCentral: false
  };
  saveMetrics(newMetrics);
  resetFirestoreQuotaBreaker();
  return newMetrics;
}

// Save metrics to LocalStorage and compute accurate non-duplicated totals
export function saveMetrics(metrics: FirestoreMetrics) {
  const today = getTodayDateString();
  const utcToday = getUtcDateStr();
  metrics.utcDate = utcToday;

  const pReads = pendingState.quotaDate === today ? pendingState.reads : 0;
  const pWrites = pendingState.quotaDate === today ? pendingState.writes : 0;
  const pRealtime = pendingState.quotaDate === today ? pendingState.realtimeReads : 0;

  const centralR = (metrics.firestoreReads || 0) + pReads;
  const centralW = (metrics.firestoreWrites || 0) + pWrites;
  const centralRt = (metrics.firestoreRealtimeReads || 0) + pRealtime;

  metrics.totalReads = Math.max(centralR, metrics.reads);
  metrics.totalWrites = Math.max(centralW, metrics.writes);
  metrics.totalRealtimeReads = Math.max(centralRt, metrics.realtimeReads || 0);
  metrics.remainingReads = Math.max(0, SPARK_DAILY_READ_LIMIT - metrics.totalReads);
  metrics.remainingWrites = Math.max(0, SPARK_DAILY_WRITE_LIMIT - metrics.totalWrites);
  metrics.remainingReadsPercent = Math.max(0, Math.min(100, (metrics.remainingReads / SPARK_DAILY_READ_LIMIT) * 100));
  metrics.remainingWritesPercent = Math.max(0, Math.min(100, (metrics.remainingWrites / SPARK_DAILY_WRITE_LIMIT) * 100));

  const combinedHistory = mergeBuckets(metrics.dailyHistory, pendingState.utcBuckets);
  const sums7d = compute7dSums(combinedHistory);
  metrics.reads7d = Math.max(sums7d.reads, metrics.totalReads);
  metrics.writes7d = Math.max(sums7d.writes, metrics.totalWrites);
  metrics.realtimeReads7d = Math.max(sums7d.realtimeReads, metrics.totalRealtimeReads || 0);
  metrics.pendingLocalReads = pReads;
  metrics.pendingLocalWrites = pWrites;

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
 * Adds a real tracked operation delta into local metrics & pending queue without scheduling another flush
 * (used for reading `system_stats/consumption` itself so monitoring never creates self-loops).
 */
function recordSilentSelfRead(count: number, isRealtime: boolean, operationLabel?: string) {
  if (count <= 0) return;
  const today = getTodayDateString();
  const utcToday = getUtcDateStr();

  if (pendingState.quotaDate !== today) {
    pendingState.quotaDate = today;
    pendingState.reads = 0;
    pendingState.writes = 0;
    pendingState.realtimeReads = 0;
  }

  pendingState.reads += count;
  if (isRealtime) pendingState.realtimeReads += count;
  const ub = pendingState.utcBuckets[utcToday] || { reads: 0, writes: 0, realtimeReads: 0 };
  ub.reads += count;
  if (isRealtime) ub.realtimeReads += count;
  pendingState.utcBuckets[utcToday] = ub;
  persistPendingDeltas();

  const metrics = loadFirestoreMetrics();
  metrics.reads += count;
  if (isRealtime) metrics.realtimeReads = (metrics.realtimeReads || 0) + count;
  metrics.lifetimeReads = (metrics.lifetimeReads || 0) + count;
  if (isRealtime) metrics.lifetimeRealtimeReads = (metrics.lifetimeRealtimeReads || 0) + count;
  if (operationLabel) metrics.lastOperation = operationLabel;
  metrics.lastUpdatedAt = Date.now();
  saveMetrics(metrics);
}

/**
 * Flushes pending read/write deltas atomically to `system_stats/consumption`.
 * Inline-accounts for its own transaction read (+1 if tx) and write (+1) directly inside the committed payload
 * so 100% of Firestore traffic is tracked with ZERO infinite loops.
 */
export async function flushConsumptionToFirestore(): Promise<void> {
  if (isFlushing) return;
  const today = getTodayDateString();
  const utcToday = getUtcDateStr();

  // Prune pending reads/writes if from an expired quota day, while still flushing recent UTC buckets if needed
  if (pendingState.quotaDate !== today) {
    pendingState.quotaDate = today;
    pendingState.reads = 0;
    pendingState.writes = 0;
    pendingState.realtimeReads = 0;
  }

  // Only push a central consumption write when actual writes occurred; never burn writes to report reads!
  if (pendingState.writes <= 0) return;
  if (!db || isFirestoreWriteQuotaExceeded()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  isFlushing = true;
  const deltaReads = pendingState.reads;
  const deltaWrites = pendingState.writes;
  const deltaRealtimeReads = pendingState.realtimeReads;
  const deltaUtcBuckets = pendingState.utcBuckets || {};
  const opLabel = pendingState.lastOperation || '';

  // Clear pending immediately before async commit; restored on catch if commit fails
  pendingState = {
    quotaDate: today,
    reads: 0,
    writes: 0,
    realtimeReads: 0,
    utcBuckets: {},
    lastOperation: ''
  };
  persistPendingDeltas();

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const needsTx = !hasVerifiedCentralDateThisSession || (knownCentralDate !== null && knownCentralDate !== today);
  const selfReadCost = needsTx ? 1 : 0;
  const selfWriteCost = 1;

  const effectiveReads = deltaReads + selfReadCost;
  const effectiveWrites = deltaWrites + selfWriteCost;
  const effectiveRealtimeReads = deltaRealtimeReads;

  const finalUtcBuckets = mergeBuckets(deltaUtcBuckets, {
    [utcToday]: { reads: selfReadCost, writes: selfWriteCost, realtimeReads: 0 }
  });

  const consumptionRef = doc(db, CONSUMPTION_COLLECTION, CONSUMPTION_DOC_ID);

  try {
    if (needsTx) {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(consumptionRef);
        const existing = snap.exists() ? snap.data() : null;
        const existingDate = existing?.date;
        const existingHistory = (existing?.dailyHistory || {}) as Record<string, DailyUsageBucket>;
        const mergedHistory = mergeBuckets(existingHistory, finalUtcBuckets);

        if (!existing || !existingDate || existingDate < today) {
          tx.set(
            consumptionRef,
            {
              date: today,
              utcDate: utcToday,
              reads: effectiveReads,
              writes: effectiveWrites,
              realtimeReads: effectiveRealtimeReads,
              lifetimeReads: (Number(existing?.lifetimeReads) || 0) + effectiveReads,
              lifetimeWrites: (Number(existing?.lifetimeWrites) || 0) + effectiveWrites,
              lifetimeRealtimeReads: (Number(existing?.lifetimeRealtimeReads) || 0) + effectiveRealtimeReads,
              dailyHistory: mergedHistory,
              lastOperation: opLabel || 'operation',
              lastUpdatedAt: Date.now()
            },
            { merge: true }
          );
        } else {
          // Existing date is >= today (never overwrite newer date backward)
          const updatePayload: Record<string, any> = {
            date: existingDate,
            utcDate: utcToday,
            dailyHistory: mergedHistory,
            lastUpdatedAt: Date.now(),
            lifetimeReads: increment(effectiveReads),
            lifetimeWrites: increment(effectiveWrites)
          };
          if (effectiveRealtimeReads > 0) {
            updatePayload.lifetimeRealtimeReads = increment(effectiveRealtimeReads);
          }
          if (opLabel) updatePayload.lastOperation = opLabel;
          if (existingDate === today) {
            if (effectiveReads > 0) updatePayload.reads = increment(effectiveReads);
            if (effectiveWrites > 0) updatePayload.writes = increment(effectiveWrites);
            if (effectiveRealtimeReads > 0) updatePayload.realtimeReads = increment(effectiveRealtimeReads);
          }
          tx.set(consumptionRef, updatePayload, { merge: true });
        }
      });
      knownCentralDate = today;
      hasVerifiedCentralDateThisSession = true;
    } else {
      // Fast atomic increment without extra read; update dot-path dailyHistory.${utcDay} atomically
      const updatePayload: Record<string, any> = {
        date: today,
        utcDate: utcToday,
        lastUpdatedAt: Date.now()
      };
      if (opLabel) updatePayload.lastOperation = opLabel;
      if (effectiveReads > 0) {
        updatePayload.reads = increment(effectiveReads);
        updatePayload.lifetimeReads = increment(effectiveReads);
      }
      if (effectiveWrites > 0) {
        updatePayload.writes = increment(effectiveWrites);
        updatePayload.lifetimeWrites = increment(effectiveWrites);
      }
      if (effectiveRealtimeReads > 0) {
        updatePayload.realtimeReads = increment(effectiveRealtimeReads);
        updatePayload.lifetimeRealtimeReads = increment(effectiveRealtimeReads);
      }
      const dailyHistoryPatch: Record<string, Record<string, any>> = {};
      for (const [utcDay, b] of Object.entries(finalUtcBuckets)) {
        const dayPatch: Record<string, any> = {};
        if (b.reads > 0) dayPatch.reads = increment(b.reads);
        if (b.writes > 0) dayPatch.writes = increment(b.writes);
        if (b.realtimeReads > 0) dayPatch.realtimeReads = increment(b.realtimeReads);
        if (Object.keys(dayPatch).length > 0) {
          dailyHistoryPatch[utcDay] = dayPatch;
        }
      }
      if (Object.keys(dailyHistoryPatch).length > 0) {
        updatePayload.dailyHistory = dailyHistoryPatch;
      }
      await setDoc(consumptionRef, updatePayload, { merge: true });
    }

    // Reflect self flush overhead locally (without scheduling another flush)
    const m = loadFirestoreMetrics();
    m.reads += selfReadCost;
    m.writes += selfWriteCost;
    m.lifetimeReads = (m.lifetimeReads || 0) + effectiveReads;
    m.lifetimeWrites = (m.lifetimeWrites || 0) + effectiveWrites;
    m.lifetimeRealtimeReads = (m.lifetimeRealtimeReads || 0) + effectiveRealtimeReads;
    m.dailyHistory = mergeBuckets(m.dailyHistory, finalUtcBuckets);
    saveMetrics(m);
  } catch (err: any) {
    // Restore unsent deltas so nothing is ever lost on transient network errors
    pendingState = {
      quotaDate: today,
      reads: pendingState.reads + deltaReads,
      writes: pendingState.writes + deltaWrites,
      realtimeReads: pendingState.realtimeReads + deltaRealtimeReads,
      utcBuckets: mergeBuckets(pendingState.utcBuckets, deltaUtcBuckets),
      lastOperation: opLabel || pendingState.lastOperation
    };
    persistPendingDeltas();
    if (isQuotaError(err)) {
      markFirestoreWriteQuotaExceeded(err);
    } else {
      console.warn('[Firestore Tracker] Notice flushing central consumption:', err?.message || err);
    }
  } finally {
    isFlushing = false;
  }
}

/**
 * Queues read/write deltas durably in localStorage and batches them to `system_stats/consumption`.
 */
export async function incrementFirestoreUsage(
  reads: number,
  writes: number,
  operationLabel?: string,
  realtimeReads: number = 0
) {
  if (reads <= 0 && writes <= 0 && realtimeReads <= 0) return;

  const today = getTodayDateString();
  const utcToday = getUtcDateStr();

  if (pendingState.quotaDate !== today) {
    pendingState.quotaDate = today;
    pendingState.reads = 0;
    pendingState.writes = 0;
    pendingState.realtimeReads = 0;
  }

  const r = Math.max(0, reads);
  const w = Math.max(0, writes);
  const rt = Math.max(0, realtimeReads);

  pendingState.reads += r;
  pendingState.writes += w;
  pendingState.realtimeReads += rt;
  if (operationLabel) pendingState.lastOperation = operationLabel;

  const ub = pendingState.utcBuckets[utcToday] || { reads: 0, writes: 0, realtimeReads: 0 };
  ub.reads += r;
  ub.writes += w;
  ub.realtimeReads += rt;
  pendingState.utcBuckets[utcToday] = ub;

  persistPendingDeltas();

  if (isFirestoreWriteQuotaExceeded()) {
    return;
  }

  // Never burn a Firestore write to report simple reads; accumulate locally and flush in batches with writes
  if (pendingState.writes <= 0) {
    return;
  }

  if (pendingState.writes >= 20) {
    flushConsumptionToFirestore().catch(() => {});
    return;
  }

  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushConsumptionToFirestore().catch(() => {});
    }, 30000);
  }
}

// Log an actual Firestore server Read operation
export function trackFirestoreRead(
  count: number = 1,
  operationLabel?: string,
  options?: { isRealtime?: boolean; silent?: boolean }
) {
  if (count <= 0) return;
  if (options?.silent) {
    recordSilentSelfRead(count, !!options?.isRealtime, operationLabel);
    return;
  }
  const metrics = loadFirestoreMetrics();
  metrics.reads += count;
  if (options?.isRealtime) {
    metrics.realtimeReads = (metrics.realtimeReads || 0) + count;
  }
  if (operationLabel) metrics.lastOperation = operationLabel;
  metrics.lastUpdatedAt = Date.now();
  saveMetrics(metrics);
  incrementFirestoreUsage(count, 0, operationLabel, options?.isRealtime ? count : 0);
}

// Log an actual Firestore server Write operation
export function trackFirestoreWrite(count: number = 1, operationLabel?: string) {
  if (count <= 0) return;
  const metrics = loadFirestoreMetrics();
  metrics.writes += count;
  if (operationLabel) metrics.lastOperation = operationLabel;
  metrics.lastUpdatedAt = Date.now();
  saveMetrics(metrics);
  incrementFirestoreUsage(0, count, operationLabel, 0);
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

export function simulateBackgroundTraffic() {
  // Disabled intentionally so counters reflect real SDK operations only
}

function applyCentralSnapshotToMetrics(data: Record<string, any> | undefined, isRealtimeEvent: boolean, fromCache: boolean) {
  const today = getTodayDateString();
  const utcToday = getUtcDateStr();

  if (!fromCache) {
    recordSilentSelfRead(
      1,
      isRealtimeEvent,
      isRealtimeEvent ? 'تحديث لحظي للعداد المركزي' : 'قراءة العداد المركزي'
    );
  }

  const centralDate = data?.date || today;
  knownCentralDate = centralDate;
  hasVerifiedCentralDateThisSession = true;

  const isToday = centralDate === today;
  const reads = isToday ? Number(data?.reads || 0) : 0;
  const writes = isToday ? Number(data?.writes || 0) : 0;
  const realtimeReads = isToday ? Number(data?.realtimeReads || 0) : 0;

  const metrics = loadFirestoreMetrics();
  metrics.firestoreReads = reads;
  metrics.firestoreWrites = writes;
  metrics.firestoreRealtimeReads = realtimeReads;
  metrics.lifetimeReads = Number(data?.lifetimeReads ?? metrics.lifetimeReads ?? 0);
  metrics.lifetimeWrites = Number(data?.lifetimeWrites ?? metrics.lifetimeWrites ?? 0);
  metrics.lifetimeRealtimeReads = Number(data?.lifetimeRealtimeReads ?? metrics.lifetimeRealtimeReads ?? 0);
  metrics.dailyHistory = pruneOldUtcBuckets((data?.dailyHistory || metrics.dailyHistory || {}) as Record<string, DailyUsageBucket>, 14);
  metrics.utcDate = utcToday;
  if (data?.lastOperation) metrics.lastOperation = data.lastOperation;
  metrics.lastUpdatedAt = data?.lastUpdatedAt || Date.now();
  metrics.syncedFromCentral = true;
  saveMetrics(metrics);
  return metrics;
}

/**
 * Fetches the live centralized consumption counts directly from `system_stats/consumption`
 * on the active Firestore database (`ai-studio-c3b19e71-cc85-420b-8314-cb9b70b9467c`).
 */
export async function fetchCentralizedConsumptionOnce(forceServer: boolean = false): Promise<{
  reads: number;
  writes: number;
  realtimeReads: number;
  remainingReads: number;
  remainingWrites: number;
  remainingReadsPercent: number;
  remainingWritesPercent: number;
  date: string;
  dbId: string;
  fromCache: boolean;
  lastOperation?: string;
} | null> {
  const cacheKey = 'system_stats:consumption';
  if (!forceServer && isReadCacheFresh(cacheKey)) {
    const cached = loadFirestoreMetrics();
    const remReads = cached.remainingReads ?? Math.max(0, SPARK_DAILY_READ_LIMIT - cached.totalReads);
    const remWrites = cached.remainingWrites ?? Math.max(0, SPARK_DAILY_WRITE_LIMIT - cached.totalWrites);
    return {
      reads: cached.totalReads,
      writes: cached.totalWrites,
      realtimeReads: cached.totalRealtimeReads || 0,
      remainingReads: remReads,
      remainingWrites: remWrites,
      remainingReadsPercent: cached.remainingReadsPercent ?? Math.max(0, (remReads / SPARK_DAILY_READ_LIMIT) * 100),
      remainingWritesPercent: cached.remainingWritesPercent ?? Math.max(0, (remWrites / SPARK_DAILY_WRITE_LIMIT) * 100),
      date: cached.date,
      dbId: FIREBASE_DATABASE_ID,
      fromCache: true,
      lastOperation: cached.lastOperation
    };
  }

  if (!db || isFirestoreReadQuotaExceeded()) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  try {
    // Only flush if real write deltas are pending
    if (pendingState.writes > 0 && !isFirestoreWriteQuotaExceeded()) {
      await flushConsumptionToFirestore().catch(() => {});
    }

    const consumptionRef = doc(db, CONSUMPTION_COLLECTION, CONSUMPTION_DOC_ID);
    const snap = await Promise.race([
      forceServer
        ? getDocFromServer(consumptionRef).catch(() => getDoc(consumptionRef))
        : getDoc(consumptionRef),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
    ]);

    if (snap) {
      const fromCache = !!snap.metadata?.fromCache;
      if (!fromCache) {
        markReadCacheFresh(cacheKey);
      }
      if (snap.exists()) {
        const updated = applyCentralSnapshotToMetrics(snap.data(), false, fromCache);
        const remReads = updated.remainingReads ?? Math.max(0, SPARK_DAILY_READ_LIMIT - updated.totalReads);
        const remWrites = updated.remainingWrites ?? Math.max(0, SPARK_DAILY_WRITE_LIMIT - updated.totalWrites);
        return {
          reads: updated.totalReads,
          writes: updated.totalWrites,
          realtimeReads: updated.totalRealtimeReads || 0,
          remainingReads: remReads,
          remainingWrites: remWrites,
          remainingReadsPercent: updated.remainingReadsPercent ?? Math.max(0, (remReads / SPARK_DAILY_READ_LIMIT) * 100),
          remainingWritesPercent: updated.remainingWritesPercent ?? Math.max(0, (remWrites / SPARK_DAILY_WRITE_LIMIT) * 100),
          date: updated.date,
          dbId: FIREBASE_DATABASE_ID,
          fromCache,
          lastOperation: updated.lastOperation
        };
      } else if (!fromCache) {
        recordSilentSelfRead(1, false, 'تهيئة العداد المركزي');
        knownCentralDate = getTodayDateString();
        hasVerifiedCentralDateThisSession = true;
      }
    }
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreReadQuotaExceeded(err);
    }
  }
  return null;
}

/**
 * Subscribes the Admin Dashboard in real-time to `system_stats/consumption`.
 * Safe against loops: counts incoming server snapshot silently without triggering a write flush.
 */
export function subscribeToFirebaseSystemUsage(
  callback: (usage: { reads: number; writes: number; realtimeReads: number; lastOperation?: string }) => void
) {
  checkDailyRollover();
  const initialMetrics = loadFirestoreMetrics();
  callback({
    reads: initialMetrics.totalReads,
    writes: initialMetrics.totalWrites,
    realtimeReads: initialMetrics.totalRealtimeReads || 0,
    lastOperation: initialMetrics.lastOperation
  });

  const localHandler = (e: Event) => {
    const customEvent = e as CustomEvent<FirestoreMetrics>;
    if (customEvent.detail) {
      callback({
        reads: customEvent.detail.totalReads,
        writes: customEvent.detail.totalWrites,
        realtimeReads: customEvent.detail.totalRealtimeReads || 0,
        lastOperation: customEvent.detail.lastOperation
      });
    }
  };
  window.addEventListener(METRICS_EVENT, localHandler);

  let unsubFirestore: (() => void) | null = null;
  if (db && !isFirestoreReadQuotaExceeded()) {
    try {
      const consumptionRef = doc(db, CONSUMPTION_COLLECTION, CONSUMPTION_DOC_ID);
      const rawUnsub = onSnapshot(
        consumptionRef,
        (snapshot) => {
          const fromCache = !!snapshot.metadata?.fromCache;
          if (snapshot.exists()) {
            const updated = applyCentralSnapshotToMetrics(snapshot.data(), true, fromCache);
            callback({
              reads: updated.totalReads,
              writes: updated.totalWrites,
              realtimeReads: updated.totalRealtimeReads || 0,
              lastOperation: updated.lastOperation
            });
          } else {
            if (!fromCache) recordSilentSelfRead(1, true, 'تحديث لحظي للعداد المركزي');
            knownCentralDate = getTodayDateString();
            hasVerifiedCentralDateThisSession = true;
          }
        },
        (error) => {
          if (isQuotaError(error)) {
            markFirestoreReadQuotaExceeded(error);
          } else {
            console.warn('[Firestore Tracker] Notice listening to system_stats/consumption:', error);
          }
        }
      );
      unsubFirestore = registerActiveFirestoreListener(rawUnsub);
    } catch (err: any) {
      if (isQuotaError(err)) {
        markFirestoreReadQuotaExceeded(err);
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
 * Calibrates central & local counters to match observed Firebase Console metrics for this database
 * (helpful when starting mid-day or reconciling prior pre-tracker history).
 */
export async function calibrateCentralConsumptionBaseline(params: {
  todayReads: number;
  todayWrites: number;
  todayRealtimeReads: number;
  weekReads?: number;
  weekWrites?: number;
  weekRealtimeReads?: number;
}): Promise<boolean> {
  const today = getTodayDateString();
  const utcToday = getUtcDateStr();

  const tReads = Math.max(0, Math.round(params.todayReads || 0));
  const tWrites = Math.max(0, Math.round(params.todayWrites || 0));
  const tRt = Math.max(0, Math.round(params.todayRealtimeReads || 0));

  pendingState = {
    quotaDate: today,
    reads: 0,
    writes: 0,
    realtimeReads: 0,
    utcBuckets: {},
    lastOperation: 'معايرة مع أرقام وحدة تحكم Firebase'
  };
  persistPendingDeltas();

  const existing = loadFirestoreMetrics();
  const nextHistory: Record<string, DailyUsageBucket> = {
    ...(existing.dailyHistory || {}),
    [utcToday]: { reads: tReads, writes: tWrites, realtimeReads: tRt }
  };

  // If 7-day totals are provided from Firebase Console and exceed today's values,
  // place the prior-days remainder into yesterday's UTC bucket so 7-day sum matches Console cleanly.
  if (
    typeof params.weekReads === 'number' ||
    typeof params.weekWrites === 'number' ||
    typeof params.weekRealtimeReads === 'number'
  ) {
    const recent = getRecentUtcDates(7);
    const yesterdayUtc = recent[recent.length - 2] || utcToday;
    const remR = Math.max(0, Math.round((params.weekReads || 0) - tReads));
    const remW = Math.max(0, Math.round((params.weekWrites || 0) - tWrites));
    const remRt = Math.max(0, Math.round((params.weekRealtimeReads || 0) - tRt));
    if (yesterdayUtc !== utcToday) {
      nextHistory[yesterdayUtc] = { reads: remR, writes: remW, realtimeReads: remRt };
    } else {
      nextHistory[utcToday] = {
        reads: tReads + remR,
        writes: tWrites + remW,
        realtimeReads: tRt + remRt
      };
    }
  }

  const pruned = pruneOldUtcBuckets(nextHistory, 14);
  const sums7d = compute7dSums(pruned);

  const calibrated: FirestoreMetrics = {
    ...existing,
    date: today,
    utcDate: utcToday,
    reads: tReads,
    writes: tWrites,
    realtimeReads: tRt,
    firestoreReads: tReads,
    firestoreWrites: tWrites,
    firestoreRealtimeReads: tRt,
    totalReads: tReads,
    totalWrites: tWrites,
    totalRealtimeReads: tRt,
    dailyHistory: pruned,
    reads7d: sums7d.reads,
    writes7d: sums7d.writes,
    realtimeReads7d: sums7d.realtimeReads,
    lifetimeReads: Math.max(existing.lifetimeReads || 0, sums7d.reads),
    lifetimeWrites: Math.max(existing.lifetimeWrites || 0, sums7d.writes),
    lifetimeRealtimeReads: Math.max(existing.lifetimeRealtimeReads || 0, sums7d.realtimeReads),
    lastOperation: 'معايرة متطابقة مع وحدة تحكم Firebase',
    lastUpdatedAt: Date.now(),
    syncedFromCentral: true
  };
  saveMetrics(calibrated);

  if (db && !isFirestoreWriteQuotaExceeded() && navigator.onLine !== false) {
    try {
      const consumptionRef = doc(db, CONSUMPTION_COLLECTION, CONSUMPTION_DOC_ID);
      await setDoc(
        consumptionRef,
        {
          date: today,
          utcDate: utcToday,
          reads: tReads,
          writes: tWrites + 1, // +1 for this calibration write itself
          realtimeReads: tRt,
          dailyHistory: pruned,
          lifetimeReads: calibrated.lifetimeReads,
          lifetimeWrites: (calibrated.lifetimeWrites || 0) + 1,
          lifetimeRealtimeReads: calibrated.lifetimeRealtimeReads,
          lastOperation: 'معايرة متطابقة مع وحدة تحكم Firebase',
          lastUpdatedAt: Date.now()
        },
        { merge: true }
      );
      knownCentralDate = today;
      hasVerifiedCentralDateThisSession = true;
      return true;
    } catch (err: any) {
      if (isQuotaError(err)) markFirestoreWriteQuotaExceeded(err);
    }
  }
  return false;
}

/**
 * Resets today's centralized & local counters (optionally preserves 7-day history unless clearHistory = true).
 */
export async function resetCentralizedFirestoreConsumption(clearHistory: boolean = false): Promise<void> {
  const today = getTodayDateString();
  const utcToday = getUtcDateStr();
  pendingState = {
    quotaDate: today,
    reads: 0,
    writes: 0,
    realtimeReads: 0,
    utcBuckets: {},
    lastOperation: 'تصفير عداد اليوم'
  };
  persistPendingDeltas();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const prev = loadFirestoreMetrics();
  const nextHistory = clearHistory ? {} : pruneOldUtcBuckets(prev.dailyHistory || {}, 14);

  const freshMetrics: FirestoreMetrics = {
    date: today,
    utcDate: utcToday,
    reads: 0,
    writes: 0,
    realtimeReads: 0,
    simulatedReads: 0,
    simulatedWrites: 0,
    totalReads: 0,
    totalWrites: 0,
    totalRealtimeReads: 0,
    firestoreReads: 0,
    firestoreWrites: 0,
    firestoreRealtimeReads: 0,
    lifetimeReads: clearHistory ? 0 : prev.lifetimeReads || 0,
    lifetimeWrites: clearHistory ? 0 : prev.lifetimeWrites || 0,
    lifetimeRealtimeReads: clearHistory ? 0 : prev.lifetimeRealtimeReads || 0,
    dailyHistory: nextHistory,
    lastOperation: 'تصفير عداد اليوم',
    lastUpdatedAt: Date.now(),
    syncedFromCentral: true
  };
  saveMetrics(freshMetrics);

  if (db && !isFirestoreWriteQuotaExceeded()) {
    try {
      const consumptionRef = doc(db, CONSUMPTION_COLLECTION, CONSUMPTION_DOC_ID);
      const payload: Record<string, any> = {
        date: today,
        utcDate: utcToday,
        reads: 0,
        writes: 0,
        realtimeReads: 0,
        lastOperation: 'تصفير عداد اليوم',
        lastUpdatedAt: Date.now()
      };
      if (clearHistory) {
        payload.dailyHistory = {};
        payload.lifetimeReads = 0;
        payload.lifetimeWrites = 0;
        payload.lifetimeRealtimeReads = 0;
      }
      await setDoc(consumptionRef, payload, { merge: true });
      knownCentralDate = today;
      hasVerifiedCentralDateThisSession = true;
    } catch (err: any) {
      if (isQuotaError(err)) {
        markFirestoreWriteQuotaExceeded(err);
      }
    }
  }
}

/**
 * Tests whether Firestore currently accepts a real lightweight write on this database,
 * clearing false-positive or expired write-quota locks automatically.
 */
export async function probeFirestoreWriteAvailability(): Promise<{
  ok: boolean;
  isQuotaError: boolean;
  message: string;
}> {
  if (!db) {
    return { ok: false, isQuotaError: false, message: 'قاعدة بيانات Firestore غير مهيأة.' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, isQuotaError: false, message: 'لا يوجد اتصال بالإنترنت حالياً.' };
  }

  // Temporarily lift the client-side breaker to perform a real 1-doc write probe
  resetFirestoreQuotaBreaker();

  const today = getTodayDateString();
  const utcToday = getUtcDateStr();
  try {
    await Promise.race([
      writeFirestoreDocFast(
        CONSUMPTION_COLLECTION,
        CONSUMPTION_DOC_ID,
        {
          date: today,
          utcDate: utcToday,
          lastProbeAt: Date.now(),
          lastOperation: 'اختبار فحص إمكانية الكتابة السحابية'
        },
        { merge: true, sdkGraceMs: 2500, restTimeoutMs: 5000 }
      ),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ]);

    trackFirestoreWrite(1, 'اختبار فحص الكتابة السحابية (ناجح)');
    return {
      ok: true,
      isQuotaError: false,
      message: '✅ الكتابة على سحابة Firestore متاحة وتعمل بشكل طبيعي الآن.'
    };
  } catch (err: any) {
    const rawMsg = err?.message ? String(err.message) : String(err || '');
    if (isQuotaError(err)) {
      markFirestoreWriteQuotaExceeded(err);
      return {
        ok: false,
        isQuotaError: true,
        message: `⚠️ خادم Firebase لا يزال يرفض الكتابة بسبب حصة المشروع (${FIREBASE_PROJECT_ID}) أو ضغط الكتابة اللحظي: ${rawMsg}`
      };
    }
    return {
      ok: false,
      isQuotaError: false,
      message: `⚠️ تعذّر إتمام اختبار الكتابة (${rawMsg || 'مهلة الشبكة'}).`
    };
  }
}

// Auto-start background monitoring and flush pending deltas on page hide / online
if (typeof window !== 'undefined') {
  loadFirestoreMetrics();
  checkDailyRollover();

  setInterval(checkDailyRollover, 15000);

  window.addEventListener('online', () => {
    flushConsumptionToFirestore().catch(() => {});
  });
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

// Subscribe helper for React components
export function subscribeToFirestoreMetrics(
  callback: (metrics: FirestoreMetrics) => void,
  options?: { syncCentral?: boolean; realtimeCentral?: boolean }
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
    fetchCentralizedConsumptionOnce(false).catch(() => {});
    if (options?.realtimeCentral === true) {
      unsubCentral = subscribeToFirebaseSystemUsage(() => {
        // State updates are broadcast via METRICS_EVENT -> handler above
      });
    }
  }

  return () => {
    window.removeEventListener(METRICS_EVENT, handler);
    if (unsubCentral) unsubCentral();
  };
}
