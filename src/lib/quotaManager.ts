/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Global Firestore Quota & Circuit-Breaker Manager
// When Firestore free tier daily limit is reached (resource-exhausted),
// this cleanly shuts down active subscriptions and redirects all reads/writes
// to local storage and instant broadcast channels to prevent errors.

let quotaExceeded = false;
const activeListeners = new Set<() => void>();
let warnedOnce = false;

function getTodayDateStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Check if quota was previously exceeded in this session (valid only for today and max 15 minutes)
try {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const saved = sessionStorage.getItem('firestore_quota_exceeded_ts');
    const savedDate = sessionStorage.getItem('firestore_quota_exceeded_date');
    const today = getTodayDateStr();

    if (saved && savedDate === today) {
      const ts = parseInt(saved, 10);
      if (Date.now() - ts < 15 * 60 * 1000) {
        quotaExceeded = true;
      } else {
        sessionStorage.removeItem('firestore_quota_exceeded_ts');
        sessionStorage.removeItem('firestore_quota_exceeded_date');
      }
    } else {
      // New day or missing date: auto-clear
      sessionStorage.removeItem('firestore_quota_exceeded_ts');
      sessionStorage.removeItem('firestore_quota_exceeded_date');
    }
  }
} catch {
  // Ignore sessionStorage errors
}

export function isFirestoreQuotaExceeded(): boolean {
  if (quotaExceeded) {
    // Dynamic check for new day or timeout
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const savedDate = sessionStorage.getItem('firestore_quota_exceeded_date');
        const savedTs = sessionStorage.getItem('firestore_quota_exceeded_ts');
        const today = getTodayDateStr();

        // If day has changed, auto-reset immediately without any user action!
        if (!savedDate || savedDate !== today) {
          resetFirestoreQuotaBreaker();
          return false;
        }

        // If 15 minutes have passed, auto-reset to retest
        if (savedTs && Date.now() - parseInt(savedTs, 10) >= 15 * 60 * 1000) {
          resetFirestoreQuotaBreaker();
          return false;
        }
      }
    } catch {}
  }
  return quotaExceeded;
}

// Manually or programmatically reset circuit-breaker to retest Firestore connection
export function resetFirestoreQuotaBreaker() {
  quotaExceeded = false;
  warnedOnce = false;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem('firestore_quota_exceeded_ts');
      sessionStorage.removeItem('firestore_quota_exceeded_date');
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
    message.includes('quota exceeded')
  );
}

export function markFirestoreQuotaExceeded(error?: any) {
  quotaExceeded = true;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem('firestore_quota_exceeded_ts', Date.now().toString());
      sessionStorage.setItem('firestore_quota_exceeded_date', getTodayDateStr());
    }
  } catch {}

  // Cleanly unsubscribe all active snapshot listeners to stop SDK retry storms
  activeListeners.forEach((unsub) => {
    try {
      unsub();
    } catch {}
  });
  activeListeners.clear();

  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(
      '[Firestore Quota Manager] Firestore daily free tier quota limit reached. Switched gracefully to local storage and offline broadcast mode.',
      error ? (error?.message || error) : ''
    );
  }
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
