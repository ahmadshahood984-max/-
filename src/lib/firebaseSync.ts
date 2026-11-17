/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, getDocCacheFirst } from './firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from './firestoreTracker';
import { sanitizeAndDeduplicateStudents } from './studentDeduplicator';
import { 
  isFirestoreQuotaExceeded, 
  markFirestoreQuotaExceeded, 
  isQuotaError, 
  registerActiveFirestoreListener 
} from './quotaManager';
import { seedGradesToStudentCollection, syncSentGradeSheetsToConsolidatedCollection, flushPendingGradeBatches } from './studentGradesQuery';
import {
  requestPersistentStorage,
  saveToOfflineVault,
  markVaultKeySynced,
  getAllVaultItems,
  enqueuePendingNotification,
  getPendingNotifications,
  removePendingNotification
} from './offlineVault';

export const PARENT_STUDENT_KEYS = [
  'school_students',
  'school_grades',
  'school_attendance',
  'school_announcements',
  'school_messages',
  'school_excuses',
  'school_classes',
  'school_teachers',
  'school_parents',
  'school_tuitions',
  'school_monthly_evaluations',
  'school_evaluation_current_month',
  'school_blocked_grades',
  'school_custom_subjects',
  'school_active_academic_year',
  'school_seal_and_signatures_config',
  'school_app_icon'
];

export const SYNC_KEYS = [
  'school_teachers',
  'school_classes',
  'school_parents',
  'school_students',
  'school_attendance',
  'school_grades',
  'school_announcements',
  'school_messages',
  'school_excuses',
  'school_director_password',
  'school_tuitions',
  'school_evaluation_current_month',
  'school_monthly_evaluations',
  'school_blocked_grades',
  'school_custom_subjects',
  'school_academic_years',
  'school_active_academic_year',
  'school_apk_mode',
  'school_fcm_config',
  'school_app_icon',
  'school_welcome_messages',
  'school_seal_and_signatures_config',
  'school_sent_grade_sheets',
  'school_saved_evaluation_months',
  'school_whatsapp_monthly_template',
  'school_exam_questions'
];

let isRemoteSyncing = false;
const initialLoadCompletedKeys = new Set<string>();
const localUpdateTimestamps = new Map<string, number>();

const LOCAL_SYNC_META_KEY = 'school_local_sync_meta';
const DELETED_STUDENTS_KEY = 'school_deleted_student_ids';
const MAX_FIRESTORE_DOC_BYTES = 920 * 1024; // Safety threshold below Firestore 1 MiB limit

interface LocalKeySyncMeta {
  updatedAt: number;
  pendingSync?: boolean;
}

// Custom event names
export const STORAGE_UPDATE_EVENT = 'school_storage_update';
export const OFFLINE_SYNC_STATUS_EVENT = 'school_offline_sync_status';

export interface OfflineSyncStatus {
  isOnline: boolean;
  pendingCount: number;
  pendingKeys: string[];
  isFlushing: boolean;
  lastSyncedAt: number | null;
}

let isFlushingNow = false;
let lastSyncedTimestamp: number | null = null;
const memoryFallbackStore = new Map<string, string>();

// Keep reference to original methods
const originalGetItem = localStorage.getItem.bind(localStorage);
const originalSetItem = localStorage.setItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);

function safeGetLocalItem(key: string): string | null {
  try {
    const val = originalGetItem(key);
    if (val !== null) return val;
  } catch {}
  return memoryFallbackStore.get(key) ?? null;
}

function safeSetLocalItem(key: string, value: string): void {
  memoryFallbackStore.set(key, value);
  try {
    originalSetItem(key, value);
  } catch (err) {
    console.warn(`[Offline Storage] localStorage limit reached for ${key}, preserved in memory & IndexedDB vault.`, err);
  }
}

function loadLocalSyncMeta(): Record<string, LocalKeySyncMeta> {
  try {
    const raw = safeGetLocalItem(LOCAL_SYNC_META_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch {}
  return {};
}

export function getOfflineSyncStatus(): OfflineSyncStatus {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  const metaMap = loadLocalSyncMeta();
  const pendingKeys = Object.entries(metaMap)
    .filter(([k, m]) => m?.pendingSync && SYNC_KEYS.includes(k))
    .map(([k]) => k);

  return {
    isOnline,
    pendingCount: pendingKeys.length,
    pendingKeys,
    isFlushing: isFlushingNow,
    lastSyncedAt: lastSyncedTimestamp
  };
}

function emitOfflineSyncStatus() {
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_STATUS_EVENT, {
        detail: getOfflineSyncStatus()
      }));
    }, 0);
  }
}

function getKeySyncMeta(key: string): LocalKeySyncMeta {
  const all = loadLocalSyncMeta();
  const inMem = localUpdateTimestamps.get(key) || 0;
  const stored = all[key] || { updatedAt: 0, pendingSync: false };
  return {
    updatedAt: Math.max(inMem, Number(stored.updatedAt) || 0),
    pendingSync: !!stored.pendingSync
  };
}

function setKeySyncMeta(key: string, updatedAt: number, pendingSync: boolean) {
  localUpdateTimestamps.set(key, updatedAt);
  try {
    const all = loadLocalSyncMeta();
    all[key] = { updatedAt, pendingSync };
    safeSetLocalItem(LOCAL_SYNC_META_KEY, JSON.stringify(all));
  } catch {}
  if (!pendingSync) {
    lastSyncedTimestamp = Math.max(lastSyncedTimestamp || 0, updatedAt);
  }
  emitOfflineSyncStatus();
}

/**
 * Records intentionally deleted student IDs so sync merge safeguards never resurrect them.
 */
export function recordDeletedStudentIds(ids: string[]) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  try {
    const now = Date.now();
    const raw = safeGetLocalItem(DELETED_STUDENTS_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    // Prune entries older than 30 days
    for (const [k, ts] of Object.entries(map)) {
      if (now - Number(ts) > 30 * 24 * 60 * 60 * 1000) {
        delete map[k];
      }
    }
    for (const id of ids) {
      if (id) map[String(id)] = now;
    }
    const serialized = JSON.stringify(map);
    safeSetLocalItem(DELETED_STUDENTS_KEY, serialized);
    saveToOfflineVault(DELETED_STUDENTS_KEY, serialized, now, false).catch(() => {});
  } catch {}
}

export function getRecentlyDeletedStudentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_STUDENTS_KEY);
    if (!raw) return new Set();
    const map: Record<string, number> = JSON.parse(raw);
    return new Set(Object.keys(map));
  } catch {
    return new Set();
  }
}

/**
 * Safely prepares payload for Firestore's 1 MiB document size limit.
 * If `school_students` exceeds ~920 KB due to inline base64 student photos,
 * strips large base64 photos from the cloud copy while keeping all student records intact.
 */
function prepareFirestorePayload(key: string, data: any): any {
  if (key !== 'school_students' || !Array.isArray(data)) return data;
  try {
    const jsonStr = JSON.stringify(data);
    const byteLen = typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(jsonStr).length
      : jsonStr.length * 2;
    if (byteLen <= MAX_FIRESTORE_DOC_BYTES) return data;

    console.warn(`[Firestore Sync] school_students payload (${Math.round(byteLen / 1024)} KB) nears 1MB limit. Stripping oversized inline photos for cloud sync so student records never fail to save.`);
    return data.map((s: any) => {
      if (s && typeof s.photo === 'string' && s.photo.startsWith('data:image') && s.photo.length > 10000) {
        return { ...s, photo: '' };
      }
      return s;
    });
  } catch {
    return data;
  }
}

/**
 * Merges remote students with any newly added local students that haven't synced or arrived yet,
 * while respecting intentional deletions.
 */
function mergeLocalAndRemoteStudents(remoteList: any[], localList: any[], remoteUpdatedAt: number, localMeta: LocalKeySyncMeta): { merged: any[]; didRecoverLocal: boolean } {
  const deletedIds = getRecentlyDeletedStudentIds();
  const cleanRemote = sanitizeAndDeduplicateStudents(Array.isArray(remoteList) ? remoteList : []);
  if (!Array.isArray(localList) || localList.length === 0) {
    return { merged: cleanRemote, didRecoverLocal: false };
  }

  const remoteIds = new Set(cleanRemote.map(s => String(s.id)));
  const remoteUnified = new Set(
    cleanRemote
      .map(s => String(s.unifiedNo || s.rollNo || '').trim())
      .filter(Boolean)
  );

  const localIsNewer = localMeta.pendingSync || (localMeta.updatedAt > remoteUpdatedAt);
  const toRecover: any[] = [];

  for (const localSt of localList) {
    if (!localSt || !localSt.id) continue;
    const sid = String(localSt.id);
    if (deletedIds.has(sid)) continue;

    const alreadyInRemoteById = remoteIds.has(sid);
    const localUnif = String(localSt.unifiedNo || localSt.rollNo || '').trim();
    const alreadyInRemoteByUnified = localUnif && remoteUnified.has(localUnif);

    if (!alreadyInRemoteById && !alreadyInRemoteByUnified) {
      const createdAt = Number(localSt.createdAt) || 0;
      if (localIsNewer || (createdAt > 0 && createdAt > remoteUpdatedAt)) {
        toRecover.push(localSt);
      }
    }
  }

  if (toRecover.length === 0) {
    return { merged: cleanRemote, didRecoverLocal: false };
  }

  const combined = sanitizeAndDeduplicateStudents([...cleanRemote, ...toRecover]);
  return { merged: combined, didRecoverLocal: true };
}

/**
 * Safely dispatch storage update event asynchronously outside current React call stack
 */
export function safeDispatchStorageUpdate(key: string, value: string) {
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, {
        detail: { key, value }
      }));
    }, 0);
  }
}

// Instant BroadcastChannel for 0ms synchronization between tabs/windows on the same computer or device
let realtimeChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    realtimeChannel = new BroadcastChannel('school_realtime_sync_bus');
    realtimeChannel.onmessage = (event) => {
      if (event?.data?.key && event?.data?.value) {
        const { key, value } = event.data;
        if (localStorage.getItem(key) !== value) {
          isRemoteSyncing = true;
          originalSetItem(key, value);
          isRemoteSyncing = false;
          safeDispatchStorageUpdate(key, value);
        }
      }
    };
  }
} catch {
  // Graceful fallback if BroadcastChannel is unsupported
}

function broadcastLocalUpdate(key: string, value: string) {
  if (realtimeChannel) {
    try {
      realtimeChannel.postMessage({ key, value, ts: Date.now() });
    } catch {}
  }
}

/**
 * Checks whether a given payload is considered empty (null, undefined, empty array, or empty object)
 */
function isDataEmpty(val: any): boolean {
  if (val === null || val === undefined) return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') return Object.keys(val).length === 0;
  if (typeof val === 'string') return val.trim() === '' || val === '[]' || val === '{}';
  return false;
}

/**
 * Restores any missing or newer offline-saved data from IndexedDB vault into localStorage.
 * Protects against localStorage eviction or 5MB quota overflow while offline.
 */
export async function hydrateFromOfflineVault(): Promise<boolean> {
  try {
    const items = await getAllVaultItems();
    if (!items || items.length === 0) return false;

    let restoredAny = false;
    for (const item of items) {
      if (!item || !item.key || typeof item.value !== 'string') continue;

      if (item.key === DELETED_STUDENTS_KEY) {
        const existing = safeGetLocalItem(DELETED_STUDENTS_KEY);
        if (!existing) {
          safeSetLocalItem(DELETED_STUDENTS_KEY, item.value);
        }
        continue;
      }

      if (!SYNC_KEYS.includes(item.key)) continue;

      const localMeta = getKeySyncMeta(item.key);
      const localVal = safeGetLocalItem(item.key);
      const isVaultNewer = item.updatedAt > localMeta.updatedAt;
      const isLocalMissingOrEmpty = localVal === null || localVal === '[]' || localVal === '{}';
      const vaultHasData = item.value !== '[]' && item.value !== '{}' && item.value.trim() !== '';

      if ((isVaultNewer && localVal !== item.value) || (isLocalMissingOrEmpty && vaultHasData)) {
        isRemoteSyncing = true;
        safeSetLocalItem(item.key, item.value);
        isRemoteSyncing = false;
        setKeySyncMeta(item.key, item.updatedAt, item.pendingSync);
        safeDispatchStorageUpdate(item.key, item.value);
        restoredAny = true;
      }
    }

    if (restoredAny) {
      emitOfflineSyncStatus();
    }
    return restoredAny;
  } catch {
    return false;
  }
}

/**
 * Queue a standalone notification document in IndexedDB when offline so it gets pushed to `notifications` collection on reconnect.
 */
export async function queueOfflineNotification(id: string, docData: Record<string, any>): Promise<void> {
  await enqueuePendingNotification(id, docData);
  emitOfflineSyncStatus();
}

async function flushPendingNotifications(): Promise<void> {
  if (!db || isFirestoreQuotaExceeded()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  try {
    const list = await getPendingNotifications();
    for (const item of list) {
      if (isFirestoreQuotaExceeded()) break;
      try {
        await Promise.race([
          setDoc(doc(db, 'notifications', item.id), item.docData, { merge: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);
        await removePendingNotification(item.id);
        trackFirestoreWrite(1, 'مزامنة إشعار مؤجل');
      } catch (err: any) {
        if (isQuotaError(err)) {
          markFirestoreQuotaExceeded(err);
          break;
        }
      }
    }
  } catch {}
}

/**
 * Directly writes and persists data to localStorage + IndexedDB Vault immediately,
 * and syncs to Firestore without ever hanging the UI when internet is disconnected.
 */
export async function persistDirectToFirestore(key: string, data: any): Promise<boolean> {
  try {
    const valueString = typeof data === 'object' ? JSON.stringify(data) : String(data);
    const now = Date.now();

    // 1. Save durably locally BEFORE attempting network (localStorage + memory + IndexedDB)
    setKeySyncMeta(key, now, true);
    safeSetLocalItem(key, valueString);
    saveToOfflineVault(key, valueString, now, true).catch(() => {});

    safeDispatchStorageUpdate(key, valueString);
    broadcastLocalUpdate(key, valueString);

    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isOffline || !db || isFirestoreQuotaExceeded()) {
      return true;
    }

    const docRef = doc(db, 'school_live_data', key);
    const cloudPayload = prepareFirestorePayload(key, data);

    const writePromise = setDoc(docRef, { data: cloudPayload, updatedAt: now }, { merge: true })
      .then(() => {
        // Only clear pendingSync if no newer local write occurred after `now`
        const latestMeta = getKeySyncMeta(key);
        if (latestMeta.updatedAt <= now) {
          setKeySyncMeta(key, now, false);
        }
        markVaultKeySynced(key, now).catch(() => {});
        trackFirestoreWrite(1, `حفظ مباشر (${key})`);
        initialLoadCompletedKeys.add(key);

        if (key === 'school_grades' && Array.isArray(data)) {
          seedGradesToStudentCollection(data).catch(() => {});
        }
        return true;
      })
      .catch((writeErr: any) => {
        if (isQuotaError(writeErr)) {
          markFirestoreQuotaExceeded(writeErr);
        } else {
          console.warn(`Key ${key} direct write notice (will stay protected locally until synced):`, writeErr?.message || writeErr);
        }
        return false;
      });

    // Race with short timeout so slow/dropped networks NEVER freeze the UI
    await Promise.race([
      writePromise,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 1800))
    ]);
    return true;
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
      return true;
    }
    console.warn(`Notice persisting key ${key}:`, err?.message || err);
    return true;
  }
}

/**
 * Retries pushing any locally modified keys whose Firestore write failed/was offline.
 */
export async function flushPendingLocalSyncKeys(): Promise<boolean> {
  if (!db || isFirestoreQuotaExceeded() || isFlushingNow) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  isFlushingNow = true;
  emitOfflineSyncStatus();

  try {
    const metaMap = loadLocalSyncMeta();
    for (const [key, meta] of Object.entries(metaMap)) {
      if (!meta?.pendingSync || !SYNC_KEYS.includes(key)) continue;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      if (isFirestoreQuotaExceeded()) break;

      try {
        const raw = safeGetLocalItem(key);
        if (raw === null) continue;
        let parsed: any = raw;
        try {
          parsed = JSON.parse(raw);
        } catch {}
        const cloudPayload = prepareFirestorePayload(key, parsed);
        const now = Math.max(Date.now(), Number(meta.updatedAt) || 0);

        await Promise.race([
          setDoc(doc(db, 'school_live_data', key), { data: cloudPayload, updatedAt: now }, { merge: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5500))
        ]);

        const latestMeta = getKeySyncMeta(key);
        if (latestMeta.updatedAt <= Number(meta.updatedAt || 0)) {
          setKeySyncMeta(key, now, false);
        }
        await markVaultKeySynced(key, now);
        trackFirestoreWrite(1, `مزامنة معلّقة (${key})`);
      } catch (err: any) {
        if (isQuotaError(err)) {
          markFirestoreQuotaExceeded(err);
          break;
        }
      }
    }

    await flushPendingGradeBatches();
    await flushPendingNotifications();
    return true;
  } finally {
    isFlushingNow = false;
    emitOfflineSyncStatus();
  }
}

/**
 * High-speed batch persist for grade reports, syncing all relevant documents
 * in parallel to Firestore with sub-second latency across computer, mobile, and parent devices.
 */
export async function persistGradeReportBatchDirect({
  grades,
  messages,
  sentSheets,
  monthlyEvaluations,
  currentMonth
}: {
  grades?: any;
  messages?: any;
  sentSheets?: any;
  monthlyEvaluations?: any;
  currentMonth?: string;
}): Promise<boolean> {
  const syncPromises: Promise<boolean>[] = [];
  if (grades !== undefined) syncPromises.push(persistDirectToFirestore('school_grades', grades));
  if (messages !== undefined) syncPromises.push(persistDirectToFirestore('school_messages', messages));
  if (sentSheets !== undefined) {
    syncPromises.push(persistDirectToFirestore('school_sent_grade_sheets', sentSheets));
    if (Array.isArray(sentSheets)) {
      syncSentGradeSheetsToConsolidatedCollection(sentSheets).catch(() => {});
    }
  }
  if (monthlyEvaluations !== undefined) syncPromises.push(persistDirectToFirestore('school_monthly_evaluations', monthlyEvaluations));
  if (currentMonth !== undefined) syncPromises.push(persistDirectToFirestore('school_evaluation_current_month', currentMonth));

  const results = await Promise.all(syncPromises);
  return results.every(Boolean);
}

/**
 * Ultra-fast targeted single-document fetch for school_students ONLY.
 * Uses IndexedDB cache first by default (0 server reads on reopen) and never overwrites newer local students.
 */
export async function fetchStudentsOnlyDirectly(forceServer: boolean = false): Promise<any[]> {
  if (!db) return [];
  const effectiveForceServer = isFirestoreQuotaExceeded() ? false : forceServer;
  try {
    const docRef = doc(db, 'school_live_data', 'school_students');
    const { snap, fromCache } = await getDocCacheFirst(docRef, {
      forceServer: effectiveForceServer,
      timeoutMs: 1500
    });
    if (snap && snap.exists()) {
      if (!fromCache) trackFirestoreRead(1, 'جلب قائمة الطلاب');
      const docData = snap.data();
      if (docData && Array.isArray(docData.data)) {
        const remoteUpdatedAt = Number(docData.updatedAt) || 0;
        const localMeta = getKeySyncMeta('school_students');
        let localList: any[] = [];
        try {
          const raw = localStorage.getItem('school_students');
          if (raw) localList = JSON.parse(raw);
        } catch {}

        // If local data is newer or fromCache returned older data, preserve local list
        if ((localMeta.pendingSync || (remoteUpdatedAt > 0 && localMeta.updatedAt > remoteUpdatedAt)) && Array.isArray(localList) && localList.length > 0) {
          return sanitizeAndDeduplicateStudents(localList);
        }

        const { merged, didRecoverLocal } = mergeLocalAndRemoteStudents(docData.data, localList, remoteUpdatedAt, localMeta);
        const str = JSON.stringify(merged);
        if (safeGetLocalItem('school_students') !== str) {
          isRemoteSyncing = true;
          safeSetLocalItem('school_students', str);
          isRemoteSyncing = false;
          saveToOfflineVault('school_students', str, remoteUpdatedAt || Date.now(), false).catch(() => {});
          safeDispatchStorageUpdate('school_students', str);
          broadcastLocalUpdate('school_students', str);
        }
        initialLoadCompletedKeys.add('school_students');

        if (didRecoverLocal && !isFirestoreQuotaExceeded() && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
          const now = Date.now();
          setKeySyncMeta('school_students', now, true);
          setDoc(docRef, { data: prepareFirestorePayload('school_students', merged), updatedAt: now }, { merge: true })
            .then(() => {
              setKeySyncMeta('school_students', now, false);
              markVaultKeySynced('school_students', now).catch(() => {});
              trackFirestoreWrite(1, 'دمج واستعادة طلاب محليين');
            })
            .catch(() => {});
        }
        return merged;
      }
    }
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
    } else {
      console.warn('Fast students-only direct fetch notice:', err?.message || err);
    }
  }
  return [];
}

/**
 * Parallel refresh from Firestore with Cache-First persistence.
 * When `forceServer` is false (default on app open), reads from IndexedDB persistent cache FIRST
 * (0 server reads for already-cached documents) and protects newer/pending local data from stale overwrites.
 */
export async function forceRefreshDataFromFirestore(options?: { forceServer?: boolean }): Promise<boolean> {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const forceServer = isOffline ? false : (options?.forceServer ?? false);
  if (!db) return false;
  if (forceServer && isFirestoreQuotaExceeded()) return false;

  // CRITICAL QUOTA SAVER: Student/Parent portals never pull all 26 admin keys on startup.
  if (!forceServer && isStudentOrParentPortal()) {
    return true;
  }

  // First restore any large/evicted local data from IndexedDB vault, then flush pending offline changes
  await hydrateFromOfflineVault();
  if (!isOffline) {
    await flushPendingLocalSyncKeys();
  }

  const effectiveForceServer = (isOffline || isFirestoreQuotaExceeded()) ? false : forceServer;

  try {
    const refreshTasks = SYNC_KEYS.map(async (key) => {
      if (effectiveForceServer && isFirestoreQuotaExceeded()) return;
      try {
        const docRef = doc(db, 'school_live_data', key);
        const { snap, fromCache } = await getDocCacheFirst(docRef, {
          forceServer: effectiveForceServer,
          timeoutMs: 5000
        });
        if (snap && !fromCache) {
          trackFirestoreRead(1, `مزامنة بيانات (${key})`);
        }
        if (snap && snap.exists()) {
          const docData = snap.data();
          if (docData && docData.data !== undefined) {
            const remoteUpdatedAt = Number(docData.updatedAt) || 0;
            const localMeta = getKeySyncMeta(key);

            // CRITICAL DATA LOSS GUARD:
            // If local storage has pending unsynced edits, OR local update timestamp is strictly newer than remote,
            // NEVER let an older cache/server snapshot overwrite localStorage!
            const localVal = localStorage.getItem(key);
            if ((localMeta.pendingSync || (remoteUpdatedAt > 0 && localMeta.updatedAt > remoteUpdatedAt) || (fromCache && localMeta.updatedAt > remoteUpdatedAt)) && localVal !== null) {
              initialLoadCompletedKeys.add(key);
              if (localMeta.pendingSync && !isFirestoreQuotaExceeded() && !fromCache) {
                try {
                  const localParsed = JSON.parse(localVal);
                  const now = Math.max(Date.now(), localMeta.updatedAt);
                  await setDoc(docRef, { data: prepareFirestorePayload(key, localParsed), updatedAt: now }, { merge: true });
                  setKeySyncMeta(key, now, false);
                  trackFirestoreWrite(1, `رفع تعديل محلي أحدث (${key})`);
                } catch {}
              }
              return;
            }

            let payload = docData.data;

            if (key === 'school_students' && Array.isArray(payload)) {
              let localList: any[] = [];
              try {
                if (localVal) localList = JSON.parse(localVal);
              } catch {}
              const { merged, didRecoverLocal } = mergeLocalAndRemoteStudents(payload, localList, remoteUpdatedAt, localMeta);
              payload = merged;
              if (didRecoverLocal && !isOffline && !isFirestoreQuotaExceeded()) {
                const now = Date.now();
                await setDoc(docRef, { data: prepareFirestorePayload(key, payload), updatedAt: now }, { merge: true });
                setKeySyncMeta(key, now, false);
                trackFirestoreWrite(1, `دمج واستعادة الطلاب (${key})`);
              }
            }

            if (key === 'school_parents' && Array.isArray(payload)) {
              try {
                const localList = localVal ? JSON.parse(localVal) : null;
                if (Array.isArray(localList) && localList.length > payload.length) {
                  const remoteIds = new Set(payload.map((p: any) => p.id));
                  const newLocal = localList.filter((p: any) => p.id && !remoteIds.has(p.id));
                  if (newLocal.length > 0 && !isOffline && !isFirestoreQuotaExceeded()) {
                    payload = [...payload, ...newLocal];
                    await setDoc(docRef, { data: payload, updatedAt: Date.now() }, { merge: true });
                    trackFirestoreWrite(1, `تحديث أولياء الأمور (${key})`);
                  }
                }
              } catch {}
            }

            if (key === 'school_teachers' && Array.isArray(payload)) {
              try {
                const localList = localVal ? JSON.parse(localVal) : null;
                if (Array.isArray(localList) && localList.length > payload.length) {
                  const remoteIds = new Set(payload.map((t: any) => t.id));
                  const newLocal = localList.filter((t: any) => t.id && !remoteIds.has(t.id));
                  if (newLocal.length > 0 && !isOffline && !isFirestoreQuotaExceeded()) {
                    payload = [...payload, ...newLocal];
                    await setDoc(docRef, { data: payload, updatedAt: Date.now() }, { merge: true });
                    trackFirestoreWrite(1, `تحديث المعلمين (${key})`);
                  }
                }
              } catch {}
            }
            if (key === 'school_classes' && Array.isArray(payload)) {
              try {
                const localList = localVal ? JSON.parse(localVal) : null;
                if (Array.isArray(localList) && localList.length > payload.length) {
                  const remoteIds = new Set(payload.map((c: any) => c.id));
                  const newLocal = localList.filter((c: any) => c.id && !remoteIds.has(c.id));
                  if (newLocal.length > 0 && !isOffline && !isFirestoreQuotaExceeded()) {
                    payload = [...payload, ...newLocal];
                    await setDoc(docRef, { data: payload, updatedAt: Date.now() }, { merge: true });
                    trackFirestoreWrite(1, `تحديث الصفوف (${key})`);
                  }
                }
              } catch {}
            }

            // Anti-wipe safeguard: Never overwrite valid local non-empty data with an empty remote document!
            let localHasRealData = false;
            let localParsed: any = null;
            if (localVal) {
              try {
                localParsed = JSON.parse(localVal);
                if (!isDataEmpty(localParsed)) {
                  localHasRealData = true;
                }
              } catch {
                if (localVal.trim().length > 0) localHasRealData = true;
              }
            }

            if (isDataEmpty(payload) && localHasRealData) {
              console.warn(`[Fast Sync] Protected local key ${key} from being wiped out by empty remote. Re-seeding remote...`);
              if (!isOffline && !isFirestoreQuotaExceeded()) {
                await setDoc(docRef, { data: prepareFirestorePayload(key, localParsed ?? localVal), updatedAt: Date.now() }, { merge: true });
                trackFirestoreWrite(1, `استعادة بيانات (${key})`);
              }
              initialLoadCompletedKeys.add(key);
              return;
            }

            const valueString = typeof payload === 'object' 
              ? JSON.stringify(payload) 
              : String(payload);
            
            if (localVal !== valueString) {
              isRemoteSyncing = true;
              safeSetLocalItem(key, valueString);
              isRemoteSyncing = false;
              saveToOfflineVault(key, valueString, remoteUpdatedAt || Date.now(), false).catch(() => {});

              safeDispatchStorageUpdate(key, valueString);
              broadcastLocalUpdate(key, valueString);
            }
            initialLoadCompletedKeys.add(key);
          }
        }
      } catch (keyErr: any) {
        if (isQuotaError(keyErr)) {
          markFirestoreQuotaExceeded(keyErr);
        } else {
          console.warn(`[Fast Sync] Error refreshing key ${key}:`, keyErr?.message || keyErr);
        }
      }
    });

    await Promise.all(refreshTasks);
    return true;
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
    } else {
      console.warn('Notice in parallel forceRefreshDataFromFirestore:', err?.message || err);
    }
    return false;
  }
}

/**
 * Checks if current browser tab/session belongs to a Student or Parent.
 * Student and Parent sessions NEVER establish continuous onSnapshot connections,
 * eliminating concurrent connection exhaustion and keeping the system lightning fast for the director.
 */
export function isStudentOrParentPortal(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const portal = params.get('portal');
    if (portal === 'parent' || portal === 'student') return true;
    if (params.get('unified') || params.get('roll') || params.get('student') || params.get('studentId') || params.get('no')) return true;
    
    const activePortal = localStorage.getItem('school_active_portal');
    if (activePortal === 'parent' || activePortal === 'student') return true;
    
    const isTeacher = localStorage.getItem('school_teacher_is_logged_in') === 'true';
    const isDirector = localStorage.getItem('school_director_is_logged_in') === 'true' || activePortal === 'director';
    if (!isTeacher && !isDirector && (localStorage.getItem('parent_portal_student_id') || localStorage.getItem('parent_portal_unified_no'))) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function setupFirebaseSync() {
  console.log('Initializing Firebase real-time database synchronization with durable offline vault protection...');

  // Request persistent storage & hydrate any offline IndexedDB records
  requestPersistentStorage().catch(() => {});
  hydrateFromOfflineVault().catch(() => {});

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      emitOfflineSyncStatus();
      flushPendingLocalSyncKeys().catch(() => {});
    });
    window.addEventListener('offline', () => {
      emitOfflineSyncStatus();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        const status = getOfflineSyncStatus();
        if (status.pendingCount > 0) {
          flushPendingLocalSyncKeys().catch(() => {});
        }
      }
    });

    // Background auto-retry every 20s ONLY when online & pending offline changes exist (0 server reads)
    setInterval(() => {
      if (navigator.onLine !== false && !isFirestoreQuotaExceeded() && !isFlushingNow) {
        const status = getOfflineSyncStatus();
        if (status.pendingCount > 0) {
          flushPendingLocalSyncKeys().catch(() => {});
        }
      }
    }, 20000);
  }

  // Fallback to in-memory vault copy if localStorage ever hits 5MB browser limit
  localStorage.getItem = (key: string): string | null => {
    return safeGetLocalItem(key);
  };

  // 1. Intercept localStorage.setItem
  localStorage.setItem = (key: string, value: string) => {
    const prevValue = safeGetLocalItem(key);
    safeSetLocalItem(key, value);

    if (SYNC_KEYS.includes(key) && !isRemoteSyncing) {
      const now = Date.now();
      const prevMeta = getKeySyncMeta(key);

      // CRITICAL SAFEGUARD:
      // If the value being written is empty ("[]", "{}", "") and initial remote load hasn't arrived yet,
      // DO NOT push empty defaults to Firestore!
      if (!initialLoadCompletedKeys.has(key) && (value === '[]' || value === '{}' || value.trim() === '')) {
        console.log(`[Firestore Sync] Safeguard: Skipping push of empty default for ${key} during startup.`);
        return;
      }

      // If identical string AND there's no pending failed write, skip redundant network write
      if (prevValue === value && !prevMeta.pendingSync) {
        return;
      }

      setKeySyncMeta(key, now, true);
      saveToOfflineVault(key, value, now, true).catch(() => {});

      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (isOffline || isFirestoreQuotaExceeded()) {
        broadcastLocalUpdate(key, value);
        return;
      }

      // Sync immediately to Firestore with merge: true and updatedAt timestamp
      try {
        let parsedData;
        try {
          parsedData = JSON.parse(value);
        } catch {
          parsedData = value;
        }

        if (db && !isFirestoreQuotaExceeded()) {
          const docRef = doc(db, 'school_live_data', key);
          const cloudPayload = prepareFirestorePayload(key, parsedData);
          setDoc(docRef, { data: cloudPayload, updatedAt: now }, { merge: true }).then(() => {
            const latestMeta = getKeySyncMeta(key);
            if (latestMeta.updatedAt <= now) {
              setKeySyncMeta(key, now, false);
            }
            markVaultKeySynced(key, now).catch(() => {});
            trackFirestoreWrite(1, `تحديث تلقائي (${key})`);
            initialLoadCompletedKeys.add(key);
          }).catch(err => {
            if (isQuotaError(err)) {
              markFirestoreQuotaExceeded(err);
            } else {
              console.warn(`Notice writing key ${key} to Firestore (protected locally):`, err?.message || err);
            }
          });
        }

        // Broadcast to other tabs on the same device immediately
        broadcastLocalUpdate(key, value);
      } catch (err) {
        console.warn(`Notice preparing write for key ${key}:`, err);
      }
    }
  };

  // 2. Intercept localStorage.removeItem
  localStorage.removeItem = (key: string) => {
    memoryFallbackStore.delete(key);
    originalRemoveItem(key);
  };

  if (isFirestoreQuotaExceeded()) {
    console.log('[Firestore Sync] Quota limit is active; running in pure offline / broadcast local mode.');
    return;
  }

  // 3. Set up Firestore Real-time Listeners
  if (isStudentOrParentPortal()) {
    console.log('[Firestore Sync] Student/Parent session active: Real-time onSnapshot listeners are CANCELLED to prevent connection exhaustion. Using on-demand getDocs queries.');
    return;
  }

  // Teacher & Director portals maintain real-time sync for immediate grade publishing & school management
  // CRITICAL QUOTA RULE: All snapshot callbacks are strictly READ-ONLY. NEVER call setDoc inside onSnapshot!
  SYNC_KEYS.forEach(key => {
    if (isFirestoreQuotaExceeded()) return;
    try {
      const docRef = doc(db, 'school_live_data', key);
      const unsub = onSnapshot(docRef, (snapshot) => {
        const fromCache = !!snapshot.metadata?.fromCache;
        if (!fromCache) {
          trackFirestoreRead(1, `استماع فوري (${key})`);
        }
        if (snapshot.exists()) {
          const docData = snapshot.data();
          if (docData && docData.data !== undefined) {
            const remoteUpdatedAt = Number(docData.updatedAt) || 0;
            const localMeta = getKeySyncMeta(key);
            const localVal = localStorage.getItem(key);

            // SAFEGUARD 1 (Permanent Timestamp & Pending Guard — never expires after 10s!):
            // If local edits haven't finished syncing OR local timestamp is newer than remote,
            // DO NOT let an older remote/cached snapshot overwrite newer local data!
            if (localMeta.pendingSync || (remoteUpdatedAt > 0 && localMeta.updatedAt > remoteUpdatedAt)) {
              initialLoadCompletedKeys.add(key);
              return;
            }

            // If snapshot is strictly from local IndexedDB cache and we already have populated local data,
            // never risk overwriting fresh localStorage with older IndexedDB cache
            if (fromCache && localVal && localMeta.updatedAt > 0 && remoteUpdatedAt <= localMeta.updatedAt) {
              initialLoadCompletedKeys.add(key);
              return;
            }

            let payload = docData.data;
            if (key === 'school_students' && Array.isArray(payload)) {
              let localList: any[] = [];
              try {
                if (localVal) localList = JSON.parse(localVal);
              } catch {}
              const { merged } = mergeLocalAndRemoteStudents(payload, localList, remoteUpdatedAt, localMeta);
              payload = merged;
            }

            // SAFEGUARD 2: Anti-wipe. If remote snapshot contains empty data (e.g. wiped [] or null),
            // but local storage currently has real populated data, do not overwrite local data.
            let localHasRealData = false;
            if (localVal) {
              try {
                const localParsed = JSON.parse(localVal);
                if (!isDataEmpty(localParsed)) {
                  localHasRealData = true;
                }
              } catch {
                if (localVal.trim().length > 0) localHasRealData = true;
              }
            }

            if (isDataEmpty(payload) && localHasRealData) {
              initialLoadCompletedKeys.add(key);
              return;
            }

            const valueString = typeof payload === 'object' 
              ? JSON.stringify(payload) 
              : String(payload);
            
            if (localVal !== valueString) {
              isRemoteSyncing = true;
              safeSetLocalItem(key, valueString);
              isRemoteSyncing = false;
              saveToOfflineVault(key, valueString, remoteUpdatedAt || Date.now(), false).catch(() => {});

              // Dispatch custom window event safely so React states can react
              safeDispatchStorageUpdate(key, valueString);
              broadcastLocalUpdate(key, valueString);
            }
          }
          initialLoadCompletedKeys.add(key);
        } else {
          // Document does not exist in Firestore. Do not auto-seed inside snapshot callback to prevent loops.
          initialLoadCompletedKeys.add(key);
        }
      }, (error) => {
        if (isQuotaError(error)) {
          markFirestoreQuotaExceeded(error);
          return;
        }
        if (error && error.code === 'unavailable') {
          console.warn(`[Firestore Sync] Key ${key} operating in offline cache mode.`);
        } else {
          console.warn(`[Firestore Sync] Key ${key} listener notice:`, error?.message || error);
        }
        initialLoadCompletedKeys.add(key);
      });

      registerActiveFirestoreListener(unsub);
    } catch (e: any) {
      if (isQuotaError(e)) {
        markFirestoreQuotaExceeded(e);
      }
    }
  });
}
