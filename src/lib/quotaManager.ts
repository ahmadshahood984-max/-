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
const READ_TS_KEY = 'firestore_read_quota_exceeded_ts';
const READ_DATE_KEY = 'firestore_read_quota_exceeded_date';
const LEGACY_TS_KEY = 'firestore_quota_exceeded_ts';
const LEGACY_DATE_KEY = 'firestore_quota_exceeded_date';
const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;

function restoreQuotaFlag(tsKey: string, dateKey: string): boolean {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const saved = sessionStorage.getItem(tsKey);
      const savedDate = sessionStorage.getItem(dateKey);
      const today = getTodayDateStr();

      if (saved && savedDate === today) {
        const ts = parseInt(saved, 10);
        if (Date.now() - ts < QUOTA_COOLDOWN_MS) {
          return true;
        }
      }
      sessionStorage.removeItem(tsKey);
      sessionStorage.removeItem(dateKey);
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
    try {
      sessionStorage.removeItem(WRITE_TS_KEY);
      sessionStorage.removeItem(WRITE_DATE_KEY);
    } catch {}
  });
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
  if (readQuotaResetTimer) {
    clearTimeout(readQuotaResetTimer);
    readQuotaResetTimer = null;
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem(WRITE_TS_KEY);
      sessionStorage.removeItem(WRITE_DATE_KEY);
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
  const code = error?.code || '';
  const message = String(error?.message || error || '').toLowerCase();
  return (
    code === 'resource-exhausted' ||
    message.includes('quota') ||
    message.includes('limit exceeded') ||
    message.includes('free daily read units') ||
    message.includes('free daily write units') ||
    message.includes('quota exceeded')
  );
}

export function markFirestoreWriteQuotaExceeded(error?: any) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('free daily read units')) {
    markFirestoreReadQuotaExceeded(error);
    return;
  }

  writeQuotaExceeded = true;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem(WRITE_TS_KEY, Date.now().toString());
      sessionStorage.setItem(WRITE_DATE_KEY, getTodayDateStr());
    }
  } catch {}

  // CRITICAL: Do NOT kill active Firestore `onSnapshot` read listeners when only WRITES hit quota.
  if (!warnedWriteOnce) {
    warnedWriteOnce = true;
    console.warn(
      '[Firestore Quota Manager] Firestore daily free write quota reached. Reads remain active and writes are routed through the live server relay + local queue.',
      error ? (error?.message || error) : ''
    );
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firestore_quota_status_changed', { detail: { exceeded: true, type: 'write' } }));
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
