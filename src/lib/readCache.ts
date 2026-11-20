/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Persistent 5-Minute Read TTL Cache Registry
 * Prevents repeated Firestore server reads across tab switches, portal switches,
 * window focus events, and reloads within the same 5-minute window.
 */

export const DEFAULT_FIRESTORE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes minimum

const STORAGE_KEY = 'school_firestore_read_ttl_v1';
const memoryTimestamps = new Map<string, number>();

function loadPersistedTimestamps(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const now = Date.now();
      for (const [k, ts] of Object.entries(parsed)) {
        const num = Number(ts);
        if (Number.isFinite(num) && num > 0 && now - num < 60 * 60 * 1000) {
          memoryTimestamps.set(k, num);
        }
      }
    }
  } catch {
    // ignore storage errors
  }
}

loadPersistedTimestamps();

function persistTimestamps(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const obj: Record<string, number> = {};
    const now = Date.now();
    memoryTimestamps.forEach((ts, k) => {
      if (now - ts < 60 * 60 * 1000) {
        obj[k] = ts;
      }
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore storage errors
  }
}

export function isReadCacheFresh(
  cacheKey: string,
  ttlMs: number = DEFAULT_FIRESTORE_CACHE_TTL_MS
): boolean {
  const ts = memoryTimestamps.get(cacheKey);
  if (!ts) return false;
  return Date.now() - ts < ttlMs;
}

export function markReadCacheFresh(cacheKey: string): void {
  memoryTimestamps.set(cacheKey, Date.now());
  persistTimestamps();
}

export function invalidateReadCache(cacheKeyPrefix?: string): void {
  if (!cacheKeyPrefix) {
    memoryTimestamps.clear();
  } else {
    for (const key of Array.from(memoryTimestamps.keys())) {
      if (key === cacheKeyPrefix || key.startsWith(cacheKeyPrefix)) {
        memoryTimestamps.delete(key);
      }
    }
  }
  persistTimestamps();
}
