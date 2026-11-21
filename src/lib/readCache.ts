/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-Session 5-Minute Read TTL Cache Registry
 * - On every fresh app open / page load, starts empty so startup sync hits the cloud immediately.
 * - Within the active session, prevents repeated Firestore server reads across tab switches,
 *   portal switches, and re-renders for at least 5 minutes.
 */

export const DEFAULT_FIRESTORE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes minimum

const LEGACY_STORAGE_KEY = 'school_firestore_read_ttl_v1';
const memoryTimestamps = new Map<string, number>();
const sessionServerSyncedKeys = new Set<string>();

// Clean up any legacy cross-session TTL persistence so reopening the app always syncs immediately
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
} catch {
  // ignore storage errors
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
  sessionServerSyncedKeys.add(cacheKey);
}

export function needsInitialSessionServerSync(cacheKey: string): boolean {
  return !sessionServerSyncedKeys.has(cacheKey);
}

export function markInitialSessionServerSynced(cacheKey: string): void {
  sessionServerSyncedKeys.add(cacheKey);
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
}
