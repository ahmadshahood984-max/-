/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Global Firestore Quota & Circuit-Breaker Manager
// Separates READ quota from WRITE quota so that hitting Firestore's daily free-tier
// write limit NEVER disables live reads or real-time `onSnapshot` listeners.

let writeQuotaExceeded = false;
let readQuotaExceeded = false;
const activeListeners = new Set<() => void>();
let warnedWriteOnce = false;
let warnedReadOnce = false;

/**
 * Official Firebase Spark Plan daily quota reset timezone (`America/Los_Angeles` PT).
 */
export function getFirebaseQuotaDateStr(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * UTC calendar date YYYY-MM-DD (matches Firebase Console Overview 7-day chart daily buckets).
 */
export function getUtcDateStr(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDateStr(): string {
  return getFirebaseQuotaDateStr();
}

const WRITE_TS_KEY = 'firestore_write_quota_exceeded_ts';
const WRITE_DATE_KEY = 'firestore_write_quota_exceeded_date';
const WRITE_REASON_KEY = 'firestore_write_quota_exceeded_reason';
const READ_TS_KEY = 'firestore_read_quota_exceeded_ts';
const READ_DATE_KEY = 'firestore_read_quota_exceeded_date';
const LEGACY_TS_KEY = 'firestore_quota_exceeded_ts';
const LEGACY_DATE_KEY = 'firestore_quota_exceeded_date';
// 2-minute cooldown protects against retry storms while allowing fast recovery from transient 429 spikes
const QUOTA_COOLDOWN_MS = 2 * 60 * 1000;

let lastWriteQuotaErrorDetail = '';
let lastWriteQuotaErrorAt: number | null = null;

function restoreQuotaFlag(tsKey: string, dateKey: string): boolean {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const saved = sessionStorage.getItem(tsKey);
      const savedDate = sessionStorage.getItem(dateKey);
      const today = getTodayDateStr();

      if (saved && savedDate === today) {
        const ts = parseInt(saved, 10);
        if (Number.isFinite(ts) && Date.now() - ts < QUOTA_COOLDOWN_MS) {
          if (tsKey === WRITE_TS_KEY) {
            lastWriteQuotaErrorAt = ts;
            lastWriteQuotaErrorDetail = sessionStorage.getItem(WRITE_REASON_KEY) || '';
          }
          return true;
        }
      }
      sessionStorage.removeItem(tsKey);
      sessionStorage.removeItem(dateKey);
      if (tsKey === WRITE_TS_KEY) {
        sessionStorage.removeItem(WRITE_REASON_KEY);
      }
    }
  } catch {
    // Ignore sessionStorage errors
  }
  return false;
}

// Clear legacy shared quota keys on load so previous write-quota sessions never lock out reads
try {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    sessionStorage.removeItem(LEGACY_TS_KEY);
    sessionStorage.removeItem(LEGACY_DATE_KEY);
  }
} catch {}

writeQuotaExceeded = restoreQuotaFlag(WRITE_TS_KEY, WRITE_DATE_KEY);
// Never lock out Firestore reads across page loads or sessions
try {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    sessionStorage.removeItem(READ_TS_KEY);
    sessionStorage.removeItem(READ_DATE_KEY);
  }
} catch {}
readQuotaExceeded = false;
let readQuotaResetTimer: ReturnType<typeof setTimeout> | null = null;

function checkDynamicReset(
  currentFlag: boolean,
  tsKey: string,
  dateKey: string,
  onClear: () => void
): boolean {
  if (!currentFlag) return false;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const savedDate = sessionStorage.getItem(dateKey);
      const savedTs = sessionStorage.getItem(tsKey);
      const today = getTodayDateStr();

      if (!savedDate || savedDate !== today) {
        onClear();
        return false;
      }

      if (savedTs && Date.now() - parseInt(savedTs, 10) >= QUOTA_COOLDOWN_MS) {
        onClear();
        return false;
      }
    }
  } catch {}
  return currentFlag;
}

export function isFirestoreWriteQuotaExceeded(): boolean {
  return checkDynamicReset(writeQuotaExceeded, WRITE_TS_KEY, WRITE_DATE_KEY, () => {
    writeQuotaExceeded = false;
    warnedWriteOnce = false;
    lastWriteQuotaErrorAt = null;
    lastWriteQuotaErrorDetail = '';
    try {
      sessionStorage.removeItem(WRITE_TS_KEY);
      sessionStorage.removeItem(WRITE_DATE_KEY);
      sessionStorage.removeItem(WRITE_REASON_KEY);
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('firestore_quota_status_changed', { detail: { exceeded: false } }));
    }
  });
}

export function getWriteQuotaExceededInfo(): {
  exceeded: boolean;
  reason: string;
  triggeredAt: number | null;
  cooldownRemainingSec: number;
} {
  const exceeded = isFirestoreWriteQuotaExceeded();
  if (!exceeded) {
    return { exceeded: false, reason: '', triggeredAt: null, cooldownRemainingSec: 0 };
  }
  const triggeredAt = lastWriteQuotaErrorAt;
  const elapsed = triggeredAt ? Math.max(0, Date.now() - triggeredAt) : 0;
  const cooldownRemainingSec = Math.max(0, Math.ceil((QUOTA_COOLDOWN_MS - elapsed) / 1000));
  return {
    exceeded: true,
    reason: lastWriteQuotaErrorDetail,
    triggeredAt,
    cooldownRemainingSec
  };
}

export function isFirestoreReadQuotaExceeded(): boolean {
  // Never block reads permanently; only brief in-memory backoff during active error bursts
  return readQuotaExceeded;
}

/**
 * Backward-compatible alias for WRITE quota status.
 * Reads remain enabled even when Firestore daily write quota is exhausted.
 */
export function isFirestoreQuotaExceeded(): boolean {
  return isFirestoreWriteQuotaExceeded();
}

// Manually or programmatically reset both circuit-breakers to retest Firestore connection
export function resetFirestoreQuotaBreaker() {
  writeQuotaExceeded = false;
  readQuotaExceeded = false;
  warnedWriteOnce = false;
  warnedReadOnce = false;
  lastWriteQuotaErrorAt = null;
  lastWriteQuotaErrorDetail = '';
  if (readQuotaResetTimer) {
    clearTimeout(readQuotaResetTimer);
    readQuotaResetTimer = null;
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem(WRITE_TS_KEY);
      sessionStorage.removeItem(WRITE_DATE_KEY);
      sessionStorage.removeItem(WRITE_REASON_KEY);
      sessionStorage.removeItem(READ_TS_KEY);
      sessionStorage.removeItem(READ_DATE_KEY);
      sessionStorage.removeItem(LEGACY_TS_KEY);
      sessionStorage.removeItem(LEGACY_DATE_KEY);
    }
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firestore_quota_status_changed', { detail: { exceeded: false } }));
  }
}

export function isQuotaError(error: any): boolean {
  if (!error) return false;
  const name = String(error?.name || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();

  // Never treat browser localStorage / sessionStorage / IndexedDB 5MB storage limit errors as Firestore quota
  if (
    name === 'quotaexceedederror' ||
    message.includes('setting the value of') ||
    message.includes('localstorage') ||
    message.includes('sessionstorage') ||
    message.includes('indexeddb') ||
    message.includes('domexception')
  ) {
    return false;
  }

  return (
    code === 'resource-exhausted' ||
    message.includes('resource-exhausted') ||
    message.includes('resource_exhausted') ||
    message.includes('free daily read units') ||
    message.includes('free daily write units') ||
    message.includes('quota exceeded') ||
    message.includes('quota metric') ||
    message.includes('exceeded its quota')
  );
}

export function markFirestoreWriteQuotaExceeded(error?: any) {
  const rawMsg = error?.message ? String(error.message) : String(error || '');
  const msg = rawMsg.toLowerCase();
  if (msg.includes('free daily read units')) {
    markFirestoreReadQuotaExceeded(error);
    return;
  }

  const now = Date.now();
  writeQuotaExceeded = true;
  lastWriteQuotaErrorAt = now;
  lastWriteQuotaErrorDetail = rawMsg.slice(0, 260);
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem(WRITE_TS_KEY, now.toString());
      sessionStorage.setItem(WRITE_DATE_KEY, getTodayDateStr());
      if (lastWriteQuotaErrorDetail) {
        sessionStorage.setItem(WRITE_REASON_KEY, lastWriteQuotaErrorDetail);
      }
    }
  } catch {}

  // CRITICAL: Do NOT kill active Firestore `onSnapshot` read listeners when only WRITES hit quota.
  if (!warnedWriteOnce) {
    warnedWriteOnce = true;
    console.warn(
      '[Firestore Quota Manager] Firestore write quota/rate-limit notice. Reads remain active and writes are routed through the live server relay + local queue.',
      rawMsg
    );
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firestore_quota_status_changed', { detail: { exceeded: true, type: 'write', reason: lastWriteQuotaErrorDetail } }));
  }
}

export function markFirestoreReadQuotaExceeded(error?: any) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('free daily write units')) {
    markFirestoreWriteQuotaExceeded(error);
    return;
  }

  // Brief 10-second backoff rather than locking out reads for 15 minutes
  readQuotaExceeded = true;
  if (readQuotaResetTimer) {
    clearTimeout(readQuotaResetTimer);
  }
  readQuotaResetTimer = setTimeout(() => {
    readQuotaResetTimer = null;
    readQuotaExceeded = false;
    warnedReadOnce = false;
  }, 10000);

  if (!warnedReadOnce) {
    warnedReadOnce = true;
    console.warn(
      '[Firestore Quota Manager] Temporary read limit notice; serving from live server relay and cache cleanly.',
      error ? (error?.message || error) : ''
    );
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firestore_quota_status_changed', { detail: { exceeded: true, type: 'read' } }));
  }
}

/**
 * Backward-compatible wrapper called on Firestore quota errors in write paths.
 * Never destroys active read listeners.
 */
export function markFirestoreQuotaExceeded(error?: any) {
  markFirestoreWriteQuotaExceeded(error);
}

export function registerActiveFirestoreListener(unsub: () => void): () => void {
  activeListeners.add(unsub);
  return () => {
    activeListeners.delete(unsub);
    try {
      unsub();
    } catch {}
  };
}
