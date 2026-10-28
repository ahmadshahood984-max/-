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

// Check if quota was previously exceeded in this session (valid for 12 hours)
try {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const saved = sessionStorage.getItem('firestore_quota_exceeded_ts');
    if (saved) {
      const ts = parseInt(saved, 10);
      if (Date.now() - ts < 12 * 60 * 60 * 1000) {
        quotaExceeded = true;
      } else {
        sessionStorage.removeItem('firestore_quota_exceeded_ts');
      }
    }
  }
} catch {
  // Ignore sessionStorage errors
}

export function isFirestoreQuotaExceeded(): boolean {
  return quotaExceeded;
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
