/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, getDocCacheFirst, writeFirestoreDocFast } from './firebase';
import { collection, doc, getDocFromServer, getDocsFromCache, getDocsFromServer, onSnapshot, setDoc } from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from './firestoreTracker';
import { sanitizeAndDeduplicateStudents } from './studentDeduplicator';
import {
  isFirestoreQuotaExceeded,
  isFirestoreWriteQuotaExceeded,
  isFirestoreReadQuotaExceeded,
  markFirestoreQuotaExceeded,
  markFirestoreWriteQuotaExceeded,
  markFirestoreReadQuotaExceeded,
  isQuotaError
} from './quotaManager';
import {
  startLiveRelayClient,
  fetchLiveRelaySnapshot,
  pushLiveRelayKey,
  reconnectLiveRelayIfNeeded
} from './liveRelayClient';
import { syncSentGradeSheetsToConsolidatedCollection, flushPendingGradeBatches } from './studentGradesQuery';
import {
  requestPersistentStorage,
  saveToOfflineVault,
  markVaultKeySynced,
  getAllVaultItems,
  enqueuePendingNotification,
  getPendingNotifications,
  removePendingNotification
} from './offlineVault';
import {
  DEFAULT_FIRESTORE_CACHE_TTL_MS,
  invalidateReadCache,
  isReadCacheFresh,
  markReadCacheFresh,
  needsInitialSessionServerSync
} from './readCache';
import { syncStudentsDirectoryToFirestore } from './parentStudentQuery';

// Parent Portal must NEVER fetch full school_students, school_grades, school_sent_grade_sheets,
// school_monthly_evaluations, school_attendance, or school_parents lists.
// Single student & grade records are fetched strictly by unifiedNo/studentId via `students` & `students_grades`.
export const PARENT_BLOCKED_BULK_KEYS = new Set<string>([
  'school_students',
  'school_grades',
  'school_sent_grade_sheets',
  'school_monthly_evaluations',
  'school_attendance',
  'school_parents',
  'school_messages',
  'school_director_password'
]);

export const PARENT_STUDENT_KEYS = [
  'school_announcements',
  'school_classes',
  'school_teachers',
  'school_evaluation_current_month',
  'school_blocked_grades',
  'school_custom_subjects',
  'school_active_academic_year',
  'school_seal_and_signatures_config',
  'school_app_icon'
];

export const PARENT_REALTIME_KEYS = [
  'school_teachers',
  'school_classes',
  'school_announcements',
  'school_evaluation_current_month',
  'school_blocked_grades',
  'school_custom_subjects',
  'school_academic_years',
  'school_active_academic_year',
  'school_saved_evaluation_months',
  'school_evaluation_saved_months',
  'school_seal_and_signatures_config',
  'school_app_icon',
  'school_welcome_messages',
  'school_max_grade_setting',
  'school_custom_max_grade',
  'school_pass_grade_setting',
  'school_custom_pass_grade',
  'school_whatsapp_monthly_template'
];

export const PARENT_FAST_LIVE_KEYS = [
  'school_evaluation_current_month',
  'school_evaluation_saved_months',
  'school_saved_evaluation_months',
  'school_announcements',
  'school_classes',
  'school_teachers',
  'school_custom_subjects',
  'school_academic_years',
  'school_active_academic_year',
  'school_max_grade_setting',
  'school_custom_max_grade',
  'school_pass_grade_setting',
  'school_custom_pass_grade',
  'school_blocked_grades',
  'school_seal_and_signatures_config',
  'school_app_icon',
  'school_welcome_messages'
];

export const FAST_LIVE_SYNC_KEYS = [
  'school_sent_grade_sheets',
  'school_grades',
  'school_monthly_evaluations',
  'school_evaluation_current_month',
  'school_evaluation_saved_months',
  'school_saved_evaluation_months',
  'school_students',
  'school_classes',
  'school_teachers',
  'school_parents',
  'school_attendance',
  'school_announcements',
  'school_messages',
  'school_excuses',
  'school_tuitions',
  'school_custom_subjects',
  'school_max_grade_setting',
  'school_custom_max_grade',
  'school_pass_grade_setting',
  'school_custom_pass_grade',
  'school_blocked_grades',
  'school_exam_questions',
  'school_director_password',
  'school_seal_and_signatures_config',
  'school_app_icon',
  'school_welcome_messages',
  'school_active_academic_year',
  'school_whatsapp_monthly_template'
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
  'school_evaluation_saved_months',
  'school_max_grade_setting',
  'school_custom_max_grade',
  'school_pass_grade_setting',
  'school_custom_pass_grade',
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
let setupInitialized = false;
let lastSyncedTimestamp: number | null = null;
const memoryFallbackStore = new Map<string, string>();
const inFlightDirectWrites = new Map<string, string>();
const inFlightWritePromises = new Map<string, { value: string; promise: Promise<boolean> }>();
const lastSyncedValues = new Map<string, string>();
const subscribedRealtimeKeys = new Set<string>();
const allowedRealtimeKeys = new Set<string>();
let collectionListenerAttached = false;
const latestCollectionSnapshots = new Map<string, { data: any; fromCache: boolean }>();
const debouncedCloudWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCED_TYPING_KEYS = new Set<string>(['school_grades', 'school_monthly_evaluations']);

// Single-document cross-device Sync Pulse (`school_live_data/_sync_pulse`)
// Gives instant PC <-> Phone live parity for Director & Teacher portals using only 1 tiny signal doc
const SYNC_PULSE_DOC_ID = '_sync_pulse';
const SYNC_DEVICE_TAB_ID = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const appBootTimestamp = Date.now();
const pendingPulseKeys = new Set<string>();
let syncPulseTimer: ReturnType<typeof setTimeout> | null = null;
let syncPulseUnsubscribe: (() => void) | null = null;
let lastHandledPulseNonce = '';
let lastHandledPulseUpdatedAt = 0;

function scheduleCrossDeviceSyncPulse(changedKey: string) {
  if (!changedKey || changedKey === SYNC_PULSE_DOC_ID) return;
  if (!db || isFirestoreWriteQuotaExceeded()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  pendingPulseKeys.add(changedKey);
  if (syncPulseTimer !== null) return;

  syncPulseTimer = setTimeout(() => {
    syncPulseTimer = null;
    if (pendingPulseKeys.size === 0 || !db || isFirestoreWriteQuotaExceeded()) {
      pendingPulseKeys.clear();
      return;
    }
    const keysBatch = Array.from(pendingPulseKeys);
    pendingPulseKeys.clear();

    const now = Date.now();
    const nonce = `${SYNC_DEVICE_TAB_ID}_${now}_${Math.random().toString(36).slice(2, 6)}`;
    lastHandledPulseNonce = nonce;
    lastHandledPulseUpdatedAt = Math.max(lastHandledPulseUpdatedAt, now);

    setDoc(doc(db, 'school_live_data', SYNC_PULSE_DOC_ID), {
      keys: keysBatch,
      updatedAt: now,
      senderId: SYNC_DEVICE_TAB_ID,
      nonce
    }).catch(() => {});
  }, 250);
}

export function notifyCrossDeviceKeyChanged(changedKey: string): void {
  scheduleCrossDeviceSyncPulse(changedKey);
}

function handleIncomingSyncPulseData(pulseData: any, fromCache: boolean): void {
  if (!pulseData || typeof pulseData !== 'object') return;
  if (fromCache) return;
  if (pulseData.senderId === SYNC_DEVICE_TAB_ID) return;

  const nonce = typeof pulseData.nonce === 'string' ? pulseData.nonce : '';
  const updatedAt = Number(pulseData.updatedAt) || 0;
  if (nonce && nonce === lastHandledPulseNonce) return;
  if (!nonce && updatedAt > 0 && updatedAt <= lastHandledPulseUpdatedAt) return;

  // Ignore historical pulses written before this tab booted (initial boot already syncs fresh from server)
  if (lastHandledPulseUpdatedAt === 0 && updatedAt > 0 && updatedAt < appBootTimestamp - 2000) {
    lastHandledPulseNonce = nonce;
    lastHandledPulseUpdatedAt = updatedAt;
    return;
  }

  if (nonce) lastHandledPulseNonce = nonce;
  if (updatedAt > lastHandledPulseUpdatedAt) lastHandledPulseUpdatedAt = updatedAt;

  const rawKeys: string[] = Array.isArray(pulseData.keys) ? pulseData.keys : [];
  const isParent = isStudentOrParentPortal();
  const allowedKeysPool = isParent ? PARENT_REALTIME_KEYS : SYNC_KEYS;
  const syncKeysChanged = rawKeys.filter((k) => allowedKeysPool.includes(k));
  const gradeReportsChanged =
    rawKeys.includes('grade_reports') || rawKeys.includes('school_sent_grade_sheets');

  if (syncKeysChanged.length > 0) {
    syncLivePortalDataFromServer({
      keys: syncKeysChanged,
      bypassCache: true,
      forceServer: true
    }).catch(() => {});
  }

  if (gradeReportsChanged && typeof window !== 'undefined') {
    invalidateReadCache('grade_reports:all');
    window.dispatchEvent(new CustomEvent('school_grade_reports_pulse'));
    if (isParent) {
      window.dispatchEvent(new CustomEvent('school_force_parent_refresh'));
    }
  }
}

function startSyncPulseListener(): void {
  if (syncPulseUnsubscribe || !db || isStudentOrParentPortal()) return;
  if (isFirestoreReadQuotaExceeded()) return;
  try {
    syncPulseUnsubscribe = onSnapshot(
      doc(db, 'school_live_data', SYNC_PULSE_DOC_ID),
      (snap) => {
        if (!snap.exists()) return;
        const fromCache = !!snap.metadata?.fromCache;
        if (!fromCache) {
          trackFirestoreRead(1, 'نبض المزامنة المباشرة بين الأجهزة');
        }
        handleIncomingSyncPulseData(snap.data(), fromCache);
      },
      (err) => {
        if (isQuotaError(err)) {
          markFirestoreReadQuotaExceeded(err);
        }
      }
    );
  } catch {
    // ignore non-critical listener init errors
  }
}

function stopSyncPulseListener(): void {
  if (syncPulseUnsubscribe) {
    try {
      syncPulseUnsubscribe();
    } catch {}
    syncPulseUnsubscribe = null;
  }
}

let lastPulseResumeCheckAt = 0;

async function checkSyncPulseOnResume(): Promise<void> {
  if (!db || isFirestoreReadQuotaExceeded()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const now = Date.now();
  if (now - lastPulseResumeCheckAt < 10000) return;
  lastPulseResumeCheckAt = now;
  try {
    const snap = await Promise.race([
      getDocFromServer(doc(db, 'school_live_data', SYNC_PULSE_DOC_ID)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
    if (snap && snap.exists()) {
      trackFirestoreRead(1, 'فحص تحديثات الأجهزة عند العودة');
      handleIncomingSyncPulseData(snap.data(), false);
    }
  } catch (err: any) {
    if (isQuotaError(err)) markFirestoreReadQuotaExceeded(err);
  }
}

// Keep reference to original methods
const originalGetItem = localStorage.getItem.bind(localStorage);
const originalSetItem = localStorage.setItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);

/**
 * Saves initial seed data strictly locally without triggering an immediate Firestore write
 * so brand-new browsers do not overwrite cloud data or waste writes on startup.
 */
export function saveLocalSeedWithoutCloudWrite(key: string, value: string): void {
  isRemoteSyncing = true;
  safeSetLocalItem(key, value);
  isRemoteSyncing = false;
}

/**
 * Updates localStorage and BroadcastChannel from a Firestore snapshot WITHOUT firing
 * a redundant setDoc writeback to Firestore (CRITICAL QUOTA & SYNC-LOOP RULE).
 */
export function saveSyncedLocalOnly(key: string, value: string): void {
  const existing = safeGetLocalItem(key);
  if (existing === value) return;
  isRemoteSyncing = true;
  safeSetLocalItem(key, value);
  isRemoteSyncing = false;
  lastSyncedValues.set(key, value);
  setKeySyncMeta(key, Date.now(), false);
  saveToOfflineVault(key, value, Date.now(), false).catch(() => {});
  broadcastLocalUpdate(key, value);
}

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
 * Preserves submitted sheets per teacher and approved sheets per class+month without overwriting separate teachers.
 */
export function deduplicateGradeSheetsPreservingTeachers<T extends {
  id?: string;
  classId?: string;
  className?: string;
  month?: string;
  teacherId?: string;
  status?: string;
  dateSent?: string;
  updatedAt?: number;
}>(sheets: T[]): T[] {
  if (!Array.isArray(sheets)) return [];
  const map = new Map<string, T>();
  for (const s of sheets) {
    if (!s) continue;
    const roleTag = s.teacherId ? `t_${s.teacherId}` : (s.status === 'submitted' ? `sub_${s.id || 't'}` : 'director');
    const key = `${s.classId || s.className || 'all'}_${s.month || ''}_${roleTag}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, s);
      continue;
    }
    const tNew = Math.max(new Date(s.dateSent || 0).getTime() || 0, Number(s.updatedAt) || 0);
    const tOld = Math.max(new Date(existing.dateSent || 0).getTime() || 0, Number(existing.updatedAt) || 0);
    if (tNew > tOld) {
      map.set(key, s);
    } else if (tNew === tOld) {
      const existingApproved = existing.status === 'approved';
      const candidateApproved = s.status === 'approved';
      if (candidateApproved || !existingApproved) {
        map.set(key, s);
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => (new Date(b.dateSent || 0).getTime() || 0) - (new Date(a.dateSent || 0).getTime() || 0)
  );
}

function stripUndefinedForFirestore(val: any): any {
  if (val === undefined) return null;
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.filter((x) => x !== undefined).map(stripUndefinedForFirestore);
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      out[k] = stripUndefinedForFirestore(v);
    }
  }
  return out;
}

/**
 * Safely prepares payload for Firestore's 1 MiB document size limit.
 * Strips undefined values and oversized inline base64 photos/videos if payload approaches ~920 KB
 * so records never silently fail to write to Firestore.
 */
function prepareFirestorePayload(key: string, data: any): any {
  try {
    let result = data;
    if (key === 'school_students' && Array.isArray(result)) {
      const jsonStr = JSON.stringify(result);
      const byteLen = typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(jsonStr).length
        : jsonStr.length * 2;
      if (byteLen > MAX_FIRESTORE_DOC_BYTES) {
        console.warn(`[Firestore Sync] school_students payload (${Math.round(byteLen / 1024)} KB) nears 1MB limit. Stripping oversized inline photos for cloud sync.`);
        result = result.map((s: any) => {
          if (s && typeof s.photo === 'string' && s.photo.startsWith('data:image') && s.photo.length > 10000) {
            return { ...s, photo: '' };
          }
          return s;
        });
      }
    } else if (key === 'school_messages' && Array.isArray(result)) {
      const jsonStr = JSON.stringify(result);
      const byteLen = typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(jsonStr).length
        : jsonStr.length * 2;
      if (byteLen > MAX_FIRESTORE_DOC_BYTES) {
        console.warn(`[Firestore Sync] school_messages payload (${Math.round(byteLen / 1024)} KB) nears 1MB limit. Compressing oversized inline media attachments for cloud sync.`);
        result = result.map((m: any) => {
          if (!m || typeof m !== 'object') return m;
          let nextContent = m.content;
          if (typeof nextContent === 'string' && nextContent.length > 30000 && nextContent.includes('data:')) {
            nextContent = nextContent.replace(/data:(image|video)\/[^;\s]+;base64,[A-Za-z0-9+/=]{10000,}/g, '[تم ضغط المرفق للمزامنة السحابية]');
          }
          return { ...m, content: nextContent };
        });
      }
    } else if (key === 'school_sent_grade_sheets' && Array.isArray(result)) {
      result = deduplicateGradeSheetsPreservingTeachers(result);
      let jsonStr = JSON.stringify(result);
      let byteLen = typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(jsonStr).length
        : jsonStr.length * 2;
      if (byteLen > MAX_FIRESTORE_DOC_BYTES) {
        console.warn(`[Firestore Sync] school_sent_grade_sheets payload (${Math.round(byteLen / 1024)} KB) exceeds safe 920 KB limit. Trimming oldest historical sheets for cloud doc (full archive preserved in grade_reports).`);
        const trimmed = [...result];
        while (trimmed.length > 1 && byteLen > MAX_FIRESTORE_DOC_BYTES) {
          trimmed.pop();
          jsonStr = JSON.stringify(trimmed);
          byteLen = typeof TextEncoder !== 'undefined'
            ? new TextEncoder().encode(jsonStr).length
            : jsonStr.length * 2;
        }
        result = trimmed;
      }
    } else if (key === 'school_grades' && Array.isArray(result)) {
      const jsonStr = JSON.stringify(result);
      const byteLen = typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(jsonStr).length
        : jsonStr.length * 2;
      if (byteLen > MAX_FIRESTORE_DOC_BYTES) {
        console.warn(`[Firestore Sync] school_grades payload (${Math.round(byteLen / 1024)} KB) nears 1MB limit. Keeping most recent entries for cloud doc.`);
        const keepCount = Math.max(50, Math.floor(result.length * (MAX_FIRESTORE_DOC_BYTES / byteLen) * 0.9));
        result = result.slice(-keepCount);
      }
    }

    return stripUndefinedForFirestore(result);
  } catch {
    return data;
  }
}

/**
 * Merges incoming remote payload with local data for collaborative collection/map keys
 * when local edits are pending, preventing either device's records from overwriting the other.
 */
function mergePendingLocalWithRemote(key: string, remotePayload: any, localParsed: any): any {
  if (!localParsed) return remotePayload;

  if (key === 'school_messages' && Array.isArray(remotePayload) && Array.isArray(localParsed)) {
    const map = new Map<string, any>();
    remotePayload.forEach((m: any) => {
      if (m && m.id) map.set(String(m.id), m);
    });
    localParsed.forEach((m: any) => {
      if (!m || !m.id) return;
      const id = String(m.id);
      const rem = map.get(id);
      if (rem) {
        map.set(id, { ...rem, ...m, read: Boolean(rem.read || m.read) });
      } else {
        map.set(id, m);
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => (new Date(a.date || 0).getTime() || 0) - (new Date(b.date || 0).getTime() || 0)
    );
  }

  if (key === 'school_sent_grade_sheets' && Array.isArray(remotePayload) && Array.isArray(localParsed)) {
    return deduplicateGradeSheetsPreservingTeachers([...remotePayload, ...localParsed]);
  }

  if (key === 'school_grades' && Array.isArray(remotePayload) && Array.isArray(localParsed)) {
    const map = new Map<string, any>();
    const gradeKey = (g: any) =>
      `${String(g?.studentId || '').trim()}__${String(g?.subject || '').trim()}__${String(g?.examName || '').trim()}`;
    remotePayload.forEach((g: any) => {
      if (g && g.studentId && g.subject) map.set(gradeKey(g), g);
    });
    localParsed.forEach((g: any) => {
      if (g && g.studentId && g.subject) map.set(gradeKey(g), g);
    });
    return Array.from(map.values());
  }

  if (key === 'school_monthly_evaluations' && typeof remotePayload === 'object' && typeof localParsed === 'object') {
    const merged: Record<string, any> = { ...remotePayload };
    for (const [k, localVal] of Object.entries(localParsed)) {
      const remVal = merged[k];
      if (remVal && typeof remVal === 'object' && typeof localVal === 'object' && localVal !== null) {
        merged[k] = {
          ...remVal,
          ...localVal,
          teacherText: (localVal as any).teacherText ?? (remVal as any).teacherText,
          directorText: (localVal as any).directorText ?? (remVal as any).directorText
        };
      } else {
        merged[k] = localVal;
      }
    }
    return merged;
  }

  if (
    (key === 'school_announcements' || key === 'school_excuses' || key === 'school_exam_questions' || key === 'school_attendance') &&
    Array.isArray(remotePayload) &&
    Array.isArray(localParsed)
  ) {
    const map = new Map<string, any>();
    remotePayload.forEach((item: any) => {
      if (item && item.id) map.set(String(item.id), item);
    });
    localParsed.forEach((item: any) => {
      if (item && item.id) map.set(String(item.id), item);
    });
    return Array.from(map.values());
  }

  return localParsed;
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
export async function persistDirectToFirestore(
  key: string,
  data: any,
  options?: { timeoutMs?: number }
): Promise<boolean> {
  try {
    const valueString = typeof data === 'object' ? JSON.stringify(data) : String(data);
    const now = Date.now();
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const prevMeta = getKeySyncMeta(key);
    const waitTimeoutMs = options?.timeoutMs ?? 6000;

    // 1. Skip redundant cloud write ONLY if identical value was already cleanly confirmed synced
    if (!isOffline && db && !isFirestoreWriteQuotaExceeded() && !prevMeta.pendingSync && lastSyncedValues.get(key) === valueString) {
      safeSetLocalItem(key, valueString);
      safeDispatchStorageUpdate(key, valueString);
      broadcastLocalUpdate(key, valueString);
      pushLiveRelayKey(key, valueString, now, { allowEmpty: initialLoadCompletedKeys.has(key) }).catch(() => {});
      return true;
    }

    // 2. Always mark pendingSync=true BEFORE network write so interrupted tabs/reloads NEVER lose updates,
    // and clear pendingSync=false inside .then(...) only after Firestore confirms receipt.
    setKeySyncMeta(key, now, true);
    safeSetLocalItem(key, valueString);
    saveToOfflineVault(key, valueString, now, true).catch(() => {});

    safeDispatchStorageUpdate(key, valueString);
    broadcastLocalUpdate(key, valueString);

    if (isOffline) {
      return false;
    }

    // Always push immediately via server Live Relay so Director/Teacher/Parent browsers sync in <50ms
    const relayPromise = pushLiveRelayKey(key, valueString, now, {
      allowEmpty: initialLoadCompletedKeys.has(key)
    }).catch(() => false);

    if (!db || isFirestoreWriteQuotaExceeded()) {
      return await Promise.race([
        relayPromise,
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), Math.min(waitTimeoutMs, 2000)))
      ]);
    }

    // If identical payload write is already in-flight, await its actual completion (bounded by timeout)
    const existingInFlight = inFlightWritePromises.get(key);
    if (existingInFlight && existingInFlight.value === valueString) {
      return await Promise.race([
        existingInFlight.promise,
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), waitTimeoutMs))
      ]);
    }

    // Cancel any pending debounced keystroke write for this key since we are writing directly right now
    const pendingTimer = debouncedCloudWriteTimers.get(key);
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer);
      debouncedCloudWriteTimers.delete(key);
    }

    const cloudPayload = prepareFirestorePayload(key, data);
    inFlightDirectWrites.set(key, valueString);

    const writePromise = writeFirestoreDocFast(
      'school_live_data',
      key,
      { data: cloudPayload, updatedAt: now },
      { merge: true, sdkGraceMs: 4000, restTimeoutMs: 9000 }
    )
      .then(() => {
        if (inFlightDirectWrites.get(key) === valueString) {
          inFlightDirectWrites.delete(key);
        }
        if (inFlightWritePromises.get(key)?.promise === writePromise) {
          inFlightWritePromises.delete(key);
        }
        lastSyncedValues.set(key, valueString);
        const latestMeta = getKeySyncMeta(key);
        if (latestMeta.updatedAt <= now || safeGetLocalItem(key) === valueString) {
          setKeySyncMeta(key, now, false);
        }
        markVaultKeySynced(key, now).catch(() => {});
        trackFirestoreWrite(1, `حفظ مباشر (${key})`);
        initialLoadCompletedKeys.add(key);
        markReadCacheFresh(`school_live_data:${key}`);
        scheduleCrossDeviceSyncPulse(key);

        if (key === 'school_sent_grade_sheets' && Array.isArray(data)) {
          syncSentGradeSheetsToConsolidatedCollection(data).catch(() => {});
        }
        if (key === 'school_students' && Array.isArray(data)) {
          syncStudentsDirectoryToFirestore(data).catch(() => {});
        }
        return true;
      })
      .catch(async (writeErr: any) => {
        if (inFlightDirectWrites.get(key) === valueString) {
          inFlightDirectWrites.delete(key);
        }
        if (inFlightWritePromises.get(key)?.promise === writePromise) {
          inFlightWritePromises.delete(key);
        }
        if (isQuotaError(writeErr)) {
          markFirestoreWriteQuotaExceeded(writeErr);
        } else {
          console.warn(`Key ${key} direct write notice (will stay protected locally until synced):`, writeErr?.message || writeErr);
        }
        setKeySyncMeta(key, now, true);
        saveToOfflineVault(key, valueString, now, true).catch(() => {});
        return await relayPromise;
      });

    inFlightWritePromises.set(key, { value: valueString, promise: writePromise });

    // Always wait on real Firestore write confirmation (bounded by waitTimeoutMs) so
    // callers know whether cross-browser Firestore sync genuinely succeeded.
    const firestoreOk = await Promise.race([
      writePromise,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), waitTimeoutMs))
    ]);
    if (firestoreOk) {
      await relayPromise;
      return true;
    }
    return await relayPromise;
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreWriteQuotaExceeded(err);
      return false;
    }
    console.warn(`Notice persisting key ${key}:`, err?.message || err);
    return false;
  }
}

/**
 * Safely merges a newly submitted/updated SentGradeSheet with both latest remote Firestore data
 * and local sheets so neither Teacher nor Director ever overwrites another teacher's sheets.
 */
export async function mergeAndPersistSentGradeSheet<T extends {
  id?: string;
  classId?: string;
  className?: string;
  month?: string;
  teacherId?: string;
  status?: string;
  dateSent?: string;
}>(newSheet: T, localFallbackSheets: T[] = []): Promise<{ syncedToCloud: boolean; sheets: T[] }> {
  let localSheets: T[] = Array.isArray(localFallbackSheets) ? [...localFallbackSheets] : [];
  try {
    const raw = safeGetLocalItem('school_sent_grade_sheets');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        localSheets = deduplicateGradeSheetsPreservingTeachers([...parsed, ...localSheets]);
      }
    }
  } catch {}

  let remoteSheets: T[] = [];
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!isOffline && db && !isFirestoreReadQuotaExceeded()) {
    try {
      const { snap, fromCache } = await getDocCacheFirst(doc(db, 'school_live_data', 'school_sent_grade_sheets'), {
        forceServer: true,
        timeoutMs: 1200
      });
      if (snap && snap.exists()) {
        const docData = snap.data();
        if (Array.isArray(docData?.data)) {
          remoteSheets = docData.data as T[];
        }
        if (!fromCache) {
          trackFirestoreRead(1, 'مزامنة كشوفات الدرجات قبل الإرسال');
        }
      }
    } catch (err: any) {
      if (isQuotaError(err)) markFirestoreReadQuotaExceeded(err);
    }
  }

  // Filter out previous sheet for the exact same (month + class + teacher/director role) before inserting newSheet
  const baseMerged = deduplicateGradeSheetsPreservingTeachers([...remoteSheets, ...localSheets]).filter(s => {
    const sameMonth = (s.month || '') === (newSheet.month || '');
    const sameClass = (s.classId || s.className || '') === (newSheet.classId || newSheet.className || '');
    const sameRole = (s.teacherId || '') === (newSheet.teacherId || '');
    return !(sameMonth && sameClass && sameRole);
  });

  const finalSheets = deduplicateGradeSheetsPreservingTeachers([newSheet, ...baseMerged]);
  const syncedToCloud = await persistDirectToFirestore('school_sent_grade_sheets', finalSheets, { timeoutMs: 3000 });
  return { syncedToCloud, sheets: finalSheets };
}

/**
 * Safely merges local grades with latest server grades before persisting, preventing one teacher's
 * save from overwriting another teacher's or class's grades already recorded on the server.
 */
export async function mergeAndPersistGrades<T extends {
  studentId?: string;
  subject?: string;
  examName?: string;
}>(localGrades: T[]): Promise<{ syncedToCloud: boolean; grades: T[] }> {
  let remoteGrades: T[] = [];
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!isOffline && db && !isFirestoreReadQuotaExceeded()) {
    try {
      const { snap, fromCache } = await getDocCacheFirst(doc(db, 'school_live_data', 'school_grades'), {
        forceServer: true,
        timeoutMs: 1200
      });
      if (snap && snap.exists()) {
        const docData = snap.data();
        if (Array.isArray(docData?.data)) {
          remoteGrades = docData.data as T[];
        }
        if (!fromCache) {
          trackFirestoreRead(1, 'مزامنة سجل الدرجات قبل الحفظ');
        }
      }
    } catch (err: any) {
      if (isQuotaError(err)) markFirestoreReadQuotaExceeded(err);
    }
  }

  const merged = mergePendingLocalWithRemote('school_grades', remoteGrades, localGrades) as T[];
  const syncedToCloud = await persistDirectToFirestore('school_grades', merged, { timeoutMs: 3000 });
  return { syncedToCloud, grades: merged };
}

/**
 * Retries pushing any locally modified keys whose Firestore write failed/was offline in parallel.
 */
export async function flushPendingLocalSyncKeys(): Promise<boolean> {
  if (!db || isFirestoreQuotaExceeded() || isFlushingNow) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  const metaMap = loadLocalSyncMeta();
  const pendingEntries = Object.entries(metaMap).filter(
    ([key, meta]) => !!meta?.pendingSync && SYNC_KEYS.includes(key)
  );

  // Even if no kv keys pending, check offline grade batches/notifications silently
  if (pendingEntries.length === 0) {
    await flushPendingGradeBatches();
    await flushPendingNotifications();
    return true;
  }

  isFlushingNow = true;
  emitOfflineSyncStatus();

  try {
    await Promise.all(
      pendingEntries.map(async ([key, meta]) => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        if (isFirestoreQuotaExceeded()) return;

        const raw = safeGetLocalItem(key);
        if (raw === null) {
          // Clear orphaned pending flag so counter can never stay stuck
          setKeySyncMeta(key, Date.now(), false);
          return;
        }

        // If the exact same value is already in-flight or was already synced cleanly, clear pending without resending
        if (inFlightDirectWrites.get(key) === raw) {
          return;
        }
        if (lastSyncedValues.get(key) === raw) {
          const syncedAt = Math.max(Date.now(), Number(meta.updatedAt) || 0);
          setKeySyncMeta(key, syncedAt, false);
          await markVaultKeySynced(key, syncedAt);
          return;
        }

        try {
          let parsed: any = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {}
          const cloudPayload = prepareFirestorePayload(key, parsed);
          const targetUpdatedAt = Number(meta.updatedAt) || 0;
          const now = Math.max(Date.now(), targetUpdatedAt);

          inFlightDirectWrites.set(key, raw);
          await Promise.race([
            setDoc(doc(db, 'school_live_data', key), { data: cloudPayload, updatedAt: now }, { merge: true }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
          ]);
          if (inFlightDirectWrites.get(key) === raw) {
            inFlightDirectWrites.delete(key);
          }

          lastSyncedValues.set(key, raw);
          const latestMeta = getKeySyncMeta(key);
          if (latestMeta.updatedAt <= targetUpdatedAt || safeGetLocalItem(key) === raw) {
            setKeySyncMeta(key, now, false);
          }
          await markVaultKeySynced(key, now);
          trackFirestoreWrite(1, `مزامنة معلّقة (${key})`);
          scheduleCrossDeviceSyncPulse(key);
        } catch (err: any) {
          if (inFlightDirectWrites.get(key) === raw) {
            inFlightDirectWrites.delete(key);
          }
          if (isQuotaError(err)) {
            markFirestoreQuotaExceeded(err);
          }
        }
      })
    );

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
  const effectiveForceServer = isFirestoreReadQuotaExceeded() ? false : forceServer;
  try {
    const docRef = doc(db, 'school_live_data', 'school_students');
    const { snap, fromCache } = await getDocCacheFirst(docRef, {
      forceServer: effectiveForceServer,
      timeoutMs: effectiveForceServer ? 3500 : 1500
    });
    if (snap && !fromCache) {
      trackFirestoreRead(1, 'جلب قائمة الطلاب');
    }
    if (snap && snap.exists()) {
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

        if (didRecoverLocal && !isFirestoreWriteQuotaExceeded() && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
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
      markFirestoreReadQuotaExceeded(err);
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
export async function forceRefreshDataFromFirestore(options?: {
  forceServer?: boolean;
  keys?: string[];
  bypassCache?: boolean;
}): Promise<boolean> {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const bypassCache = Boolean(options?.bypassCache);
  const forceServer = isOffline ? false : (options?.forceServer ?? false);
  const requestedKeys = Array.isArray(options?.keys) && options!.keys.length > 0 ? options!.keys : SYNC_KEYS;
  const isParent = isStudentOrParentPortal();
  const scopedKeys = isParent
    ? requestedKeys.filter((k) => !PARENT_BLOCKED_BULK_KEYS.has(k))
    : requestedKeys;

  // Enforce 5-minute TTL cache per key: skip keys fetched within the last 5 minutes that exist locally
  const targetKeys = bypassCache
    ? scopedKeys
    : scopedKeys.filter((k) => !isReadCacheFresh(`school_live_data:${k}`) || safeGetLocalItem(k) === null);

  if (targetKeys.length === 0) {
    scopedKeys.forEach((k) => initialLoadCompletedKeys.add(k));
    return true;
  }
  if (!db) return false;
  if (forceServer && isFirestoreReadQuotaExceeded()) return false;

  // First restore any large/evicted local data from IndexedDB vault, then flush pending offline changes
  await hydrateFromOfflineVault();
  if (!isOffline) {
    await flushPendingLocalSyncKeys();
  }

  const effectiveForceServer = (isOffline || isFirestoreReadQuotaExceeded()) ? false : forceServer;
  const targetKeySet = new Set(targetKeys);

  const applyDocPayload = async (key: string, docData: any, fromCache: boolean) => {
    if (!docData || docData.data === undefined) return;
    const docRef = doc(db, 'school_live_data', key);
    const remoteUpdatedAt = Number(docData.updatedAt) || 0;
    const localMeta = getKeySyncMeta(key);
    const localVal = localStorage.getItem(key);
    const isMergeableKey =
      key === 'school_messages' ||
      key === 'school_sent_grade_sheets' ||
      key === 'school_grades' ||
      key === 'school_monthly_evaluations' ||
      key === 'school_announcements' ||
      key === 'school_excuses' ||
      key === 'school_exam_questions' ||
      key === 'school_attendance';

    if (fromCache && localVal !== null && localMeta.updatedAt > remoteUpdatedAt) {
      initialLoadCompletedKeys.add(key);
      return;
    }

    if (localMeta.pendingSync && localVal !== null) {
      if (isMergeableKey) {
        try {
          const localParsed = JSON.parse(localVal);
          const merged = mergePendingLocalWithRemote(key, docData.data, localParsed);
          const mergedStr = JSON.stringify(merged);
          if (localVal !== mergedStr) {
            isRemoteSyncing = true;
            safeSetLocalItem(key, mergedStr);
            isRemoteSyncing = false;
            safeDispatchStorageUpdate(key, mergedStr);
            broadcastLocalUpdate(key, mergedStr);
          }
          if (!isFirestoreWriteQuotaExceeded() && !fromCache) {
            const now = Math.max(Date.now(), localMeta.updatedAt);
            await setDoc(docRef, { data: prepareFirestorePayload(key, merged), updatedAt: now }, { merge: true });
            setKeySyncMeta(key, now, false);
            trackFirestoreWrite(1, `دمج ورفع تعديل محلي (${key})`);
            scheduleCrossDeviceSyncPulse(key);
          }
        } catch {}
        initialLoadCompletedKeys.add(key);
        return;
      } else if (fromCache || localMeta.updatedAt >= remoteUpdatedAt) {
        if (!isFirestoreWriteQuotaExceeded() && !fromCache) {
          try {
            const localParsed = JSON.parse(localVal);
            const now = Math.max(Date.now(), localMeta.updatedAt);
            await setDoc(docRef, { data: prepareFirestorePayload(key, localParsed), updatedAt: now }, { merge: true });
            setKeySyncMeta(key, now, false);
            trackFirestoreWrite(1, `رفع تعديل محلي أحدث (${key})`);
            scheduleCrossDeviceSyncPulse(key);
          } catch {}
        }
        initialLoadCompletedKeys.add(key);
        return;
      } else {
        // Server document is strictly newer than stale local pending state — accept server value
        setKeySyncMeta(key, remoteUpdatedAt || Date.now(), false);
      }
    }

    let payload = docData.data;

    if (key === 'school_sent_grade_sheets' && Array.isArray(payload)) {
      payload = deduplicateGradeSheetsPreservingTeachers(payload);
    }

    if (key === 'school_students' && Array.isArray(payload)) {
      let localList: any[] = [];
      try {
        if (localVal) localList = JSON.parse(localVal);
      } catch {}
      const { merged, didRecoverLocal } = mergeLocalAndRemoteStudents(payload, localList, remoteUpdatedAt, localMeta);
      payload = [...merged].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
      if (!isStudentOrParentPortal() && payload.length > 0) {
        syncStudentsDirectoryToFirestore(payload).catch(() => {});
      }
      if (didRecoverLocal && !isOffline && !isFirestoreWriteQuotaExceeded()) {
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
          if (newLocal.length > 0 && !isOffline && !isFirestoreWriteQuotaExceeded()) {
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
          if (newLocal.length > 0 && !isOffline && !isFirestoreWriteQuotaExceeded()) {
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
          if (newLocal.length > 0 && !isOffline && !isFirestoreWriteQuotaExceeded()) {
            payload = [...payload, ...newLocal];
            await setDoc(docRef, { data: payload, updatedAt: Date.now() }, { merge: true });
            trackFirestoreWrite(1, `تحديث الصفوف (${key})`);
          }
        }
      } catch {}
    }

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
      const protectedCoreKeys =
        key === 'school_students' ||
        key === 'school_teachers' ||
        key === 'school_classes' ||
        key === 'school_parents' ||
        key === 'school_grades';
      if (protectedCoreKeys || fromCache || !initialLoadCompletedKeys.has(key) || remoteUpdatedAt <= localMeta.updatedAt) {
        console.warn(`[Fast Sync] Protected local key ${key} from being wiped out by empty remote.`);
        if (!isOffline && !isFirestoreWriteQuotaExceeded() && protectedCoreKeys) {
          await setDoc(docRef, { data: prepareFirestorePayload(key, localParsed ?? localVal), updatedAt: Date.now() }, { merge: true });
          trackFirestoreWrite(1, `استعادة بيانات (${key})`);
        }
        initialLoadCompletedKeys.add(key);
        return;
      }
    }

    const valueString = typeof payload === 'object'
      ? JSON.stringify(payload)
      : String(payload);

    if (localVal !== valueString) {
      isRemoteSyncing = true;
      safeSetLocalItem(key, valueString);
      isRemoteSyncing = false;
      lastSyncedValues.set(key, valueString);
      setKeySyncMeta(key, remoteUpdatedAt || Date.now(), false);
      saveToOfflineVault(key, valueString, remoteUpdatedAt || Date.now(), false).catch(() => {});

      safeDispatchStorageUpdate(key, valueString);
      broadcastLocalUpdate(key, valueString);
    } else if (!localMeta.pendingSync) {
      lastSyncedValues.set(key, valueString);
      if (remoteUpdatedAt > 0) {
        setKeySyncMeta(key, remoteUpdatedAt, false);
      }
    }
    initialLoadCompletedKeys.add(key);
  };

  try {
    // Fast single-round-trip collection fetch ONLY for non-parent portals when > 4 keys are stale
    if (!isParent && targetKeys.length > 4) {
      try {
        const colRef = collection(db, 'school_live_data');
        const colSnap = await Promise.race([
          effectiveForceServer ? getDocsFromServer(colRef) : getDocsFromCache(colRef),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), effectiveForceServer ? 8000 : 2500)
          )
        ]);
        const fromCache = !!colSnap.metadata?.fromCache;
        if (!fromCache && colSnap.size > 0) {
          trackFirestoreRead(colSnap.size, 'مزامنة سريعة عند الطلب');
        }
        const applyTasks: Promise<void>[] = [];
        colSnap.forEach((d) => {
          if (targetKeySet.has(d.id)) {
            if (!fromCache) markReadCacheFresh(`school_live_data:${d.id}`);
            applyTasks.push(applyDocPayload(d.id, d.data(), fromCache));
          }
        });
        await Promise.all(applyTasks);
        if (!fromCache || colSnap.size > 0) {
          targetKeys.forEach((k) => {
            initialLoadCompletedKeys.add(k);
            if (!fromCache) markReadCacheFresh(`school_live_data:${k}`);
          });
          return true;
        }
      } catch (colErr: any) {
        if (isQuotaError(colErr)) {
          markFirestoreReadQuotaExceeded(colErr);
          return false;
        }
        // Fall through to targeted key reads if cache miss or transient collection error
      }
    }

    const refreshSingleKey = async (key: string) => {
      if (effectiveForceServer && isFirestoreReadQuotaExceeded()) return;
      try {
        const docRef = doc(db, 'school_live_data', key);
        const { snap, fromCache } = await getDocCacheFirst(docRef, {
          forceServer: effectiveForceServer,
          timeoutMs: effectiveForceServer ? 8000 : 2500
        });
        if (snap && !fromCache) {
          trackFirestoreRead(1, `مزامنة بيانات (${key})`);
          markReadCacheFresh(`school_live_data:${key}`);
        }
        if (snap && snap.exists()) {
          await applyDocPayload(key, snap.data(), fromCache);
        } else if (!fromCache) {
          initialLoadCompletedKeys.add(key);
          markReadCacheFresh(`school_live_data:${key}`);
        }
      } catch (keyErr: any) {
        if (isQuotaError(keyErr)) {
          markFirestoreReadQuotaExceeded(keyErr);
        } else {
          console.warn(`[Fast Sync] Error refreshing key ${key}:`, keyErr?.message || keyErr);
        }
      }
    };

    const CHUNK_SIZE = 6;
    for (let i = 0; i < targetKeys.length; i += CHUNK_SIZE) {
      const batch = targetKeys.slice(i, i + CHUNK_SIZE);
      await Promise.all(batch.map((k) => refreshSingleKey(k)));
    }
    return true;
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreReadQuotaExceeded(err);
    } else {
      console.warn('Notice in parallel forceRefreshDataFromFirestore:', err?.message || err);
    }
    return false;
  }
}

/**
 * Checks if current browser tab/session belongs to a Student or Parent.
 * Student and Parent sessions listen only to scoped PARENT_REALTIME_KEYS
 * over the shared collection stream so all updates arrive instantly without extra streams.
 */
export function isStudentOrParentPortal(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const portal = params.get('portal');
    if (portal === 'parent' || portal === 'student') return true;
    if (portal === 'director' || portal === 'teacher') return false;
    if (params.get('unified') || params.get('roll') || params.get('student') || params.get('studentId') || params.get('no')) return true;

    const activePortal = localStorage.getItem('school_active_portal');
    if (activePortal === 'parent' || activePortal === 'student') return true;
    return false;
  } catch {
    return false;
  }
}

function processRemoteSnapshotDoc(key: string, docData: any, fromCache: boolean): void {
  if (!docData || docData.data === undefined) {
    initialLoadCompletedKeys.add(key);
    return;
  }

  const remoteUpdatedAt = Number(docData.updatedAt) || 0;
  const localMeta = getKeySyncMeta(key);
  const localVal = localStorage.getItem(key);
  const isMergeableKey =
    key === 'school_messages' ||
    key === 'school_sent_grade_sheets' ||
    key === 'school_grades' ||
    key === 'school_monthly_evaluations' ||
    key === 'school_announcements' ||
    key === 'school_excuses' ||
    key === 'school_exam_questions' ||
    key === 'school_attendance';

  // If snapshot is strictly from local IndexedDB cache and we already have populated local data,
  // never risk overwriting fresh localStorage with older IndexedDB cache
  if (fromCache && localVal && localMeta.updatedAt > 0 && remoteUpdatedAt <= localMeta.updatedAt) {
    initialLoadCompletedKeys.add(key);
    return;
  }

  let payload = docData.data;

  // If local edits are genuinely pending offline sync:
  // - For mergeable keys, merge remote additions WITHOUT losing local pending items!
  // - For non-mergeable keys, allow newer server updates or empty local values through,
  //   while protecting genuinely newer local pending edits until flushed.
  if (localMeta.pendingSync && localVal) {
    if (isMergeableKey) {
      try {
        const localParsed = JSON.parse(localVal);
        payload = mergePendingLocalWithRemote(key, payload, localParsed);
      } catch {
        initialLoadCompletedKeys.add(key);
        return;
      }
    } else {
      const isLocalEmpty = localVal === '[]' || localVal === '{}' || localVal.trim() === '';
      const serverIsClearlyNewer = !fromCache && remoteUpdatedAt > (localMeta.updatedAt + 1500);
      if (!isLocalEmpty && !serverIsClearlyNewer) {
        initialLoadCompletedKeys.add(key);
        return;
      }
    }
  }

  if (key === 'school_sent_grade_sheets' && Array.isArray(payload)) {
    payload = deduplicateGradeSheetsPreservingTeachers(payload);
  }

  if (key === 'school_students' && Array.isArray(payload)) {
    let localList: any[] = [];
    try {
      if (localVal) localList = JSON.parse(localVal);
    } catch {}
    const { merged } = mergeLocalAndRemoteStudents(payload, localList, remoteUpdatedAt, localMeta);
    payload = [...merged].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  }

  // Anti-wipe safeguard: never overwrite real local data with empty remote snapshot
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
    const protectedCoreKeys =
      key === 'school_students' ||
      key === 'school_teachers' ||
      key === 'school_classes' ||
      key === 'school_parents' ||
      key === 'school_grades';
    if (protectedCoreKeys || fromCache || !initialLoadCompletedKeys.has(key) || remoteUpdatedAt <= localMeta.updatedAt) {
      initialLoadCompletedKeys.add(key);
      return;
    }
  }

  const valueString = typeof payload === 'object'
    ? JSON.stringify(payload)
    : String(payload);

  if (!localMeta.pendingSync) {
    lastSyncedValues.set(key, valueString);
  }

  if (localVal !== valueString) {
    isRemoteSyncing = true;
    safeSetLocalItem(key, valueString);
    isRemoteSyncing = false;
    setKeySyncMeta(key, remoteUpdatedAt || Date.now(), !!localMeta.pendingSync);
    saveToOfflineVault(key, valueString, remoteUpdatedAt || Date.now(), !!localMeta.pendingSync).catch(() => {});

    // Dispatch custom window event immediately so React states update without delay
    safeDispatchStorageUpdate(key, valueString);
    broadcastLocalUpdate(key, valueString);
  }
  initialLoadCompletedKeys.add(key);
}

function attachRealtimeListenersForKeys(keysToListen: string[]) {
  // Replaced continuous collection-wide `onSnapshot(collection(db, 'school_live_data'))`
  // with on-demand `getDoc`/`getDocs` (5-minute TTL cache) + ZERO-read SSE Live Relay (`liveRelayClient`).
  // Only mark keys allowed and apply any preloaded snapshots so existing callers remain 100% compatible.
  (Array.isArray(keysToListen) && keysToListen.length > 0 ? keysToListen : SYNC_KEYS).forEach((key) => {
    if (!allowedRealtimeKeys.has(key)) {
      allowedRealtimeKeys.add(key);
      subscribedRealtimeKeys.add(key);
    }
    const cachedDoc = latestCollectionSnapshots.get(key);
    if (cachedDoc) {
      processRemoteSnapshotDoc(key, cachedDoc.data, cachedDoc.fromCache);
    }
    initialLoadCompletedKeys.add(key);
  });
  collectionListenerAttached = true;
}

export function ensureRealtimeSyncHealthy(): void {
  reconnectLiveRelayIfNeeded();
}

function applyRelayKeyUpdate(key: string, valueString: string, updatedAt: number, fromLiveSse: boolean = false): void {
  if (!key || !SYNC_KEYS.includes(key)) return;
  let parsedData: any = valueString;
  try {
    parsedData = JSON.parse(valueString);
  } catch {
    parsedData = valueString;
  }

  const localMeta = getKeySyncMeta(key);
  const localVal = safeGetLocalItem(key);
  if (localVal === valueString) {
    initialLoadCompletedKeys.add(key);
    return;
  }

  // Only skip cold relay snapshot if this device has unpushed local edits OR strictly newer synced data
  if (!fromLiveSse && localVal !== null) {
    if (localMeta.pendingSync) return;
    if (updatedAt > 0 && localMeta.updatedAt > updatedAt + 5000) return;
  }

  processRemoteSnapshotDoc(key, { data: parsedData, updatedAt }, false);
}

/**
 * Ensures full sync key registry is ready when switching into Director or Teacher portals (1-doc pulse listener).
 */
export function ensureAllRealtimeListeners() {
  attachRealtimeListenersForKeys(SYNC_KEYS);
  startSyncPulseListener();
}

/**
 * Ensures Parent/Student public config key registry is ready without attaching bulk listeners or sync pulse.
 */
export function ensureParentRealtimeListeners() {
  stopSyncPulseListener();
  attachRealtimeListenersForKeys(PARENT_REALTIME_KEYS);
}

let lastLiveServerSyncAt = 0;
let activeLiveSyncPromise: Promise<boolean> | null = null;

/**
 * On-demand sync with 5-minute per-key TTL cache + ZERO-read SSE Live Relay.
 * Hits Firestore server immediately on app open (or when > 5 minutes elapsed / `bypassCache: true`),
 * while skipping already-cached keys within the 5-minute window across tab and portal switches.
 */
export async function syncLivePortalDataFromServer(options?: {
  keys?: string[];
  minIntervalMs?: number;
  bypassCache?: boolean;
  forceServer?: boolean;
}): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  ensureRealtimeSyncHealthy();

  const bypassCache = Boolean(options?.bypassCache);
  const ttlMs = options?.minIntervalMs ?? DEFAULT_FIRESTORE_CACHE_TTL_MS;
  const isParent = isStudentOrParentPortal();
  const requestedKeys = options?.keys && options.keys.length > 0
    ? options.keys
    : (isParent ? PARENT_FAST_LIVE_KEYS : FAST_LIVE_SYNC_KEYS);
  const keysToSync = isParent
    ? requestedKeys.filter((k) => !PARENT_BLOCKED_BULK_KEYS.has(k))
    : requestedKeys;

  const hasStaleOrUncachedKey = bypassCache || keysToSync.some(
    (k) => !isReadCacheFresh(`school_live_data:${k}`, ttlMs) || safeGetLocalItem(k) === null
  );

  if (!hasStaleOrUncachedKey) {
    return true;
  }

  if (activeLiveSyncPromise && !bypassCache) {
    return activeLiveSyncPromise;
  }

  if (bypassCache) {
    keysToSync.forEach((k) => invalidateReadCache(`school_live_data:${k}`));
  }

  const hasInitialSync = keysToSync.some((k) => needsInitialSessionServerSync(`school_live_data:${k}`));
  const shouldForceServer = Boolean(options?.forceServer ?? (bypassCache || hasInitialSync || hasStaleOrUncachedKey));

  activeLiveSyncPromise = (async () => {
    try {
      const [firestoreOk, relaySnap] = await Promise.all([
        db && !isFirestoreReadQuotaExceeded()
          ? forceRefreshDataFromFirestore({
              forceServer: shouldForceServer,
              keys: keysToSync,
              bypassCache
            }).catch(() => false)
          : Promise.resolve(false),
        fetchLiveRelaySnapshot().catch(() => null)
      ]);
      const ok = firestoreOk || Boolean(relaySnap);
      lastLiveServerSyncAt = Date.now();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('school_live_sync_completed', { detail: { ok, ts: lastLiveServerSyncAt } }));
      }
      return ok;
    } finally {
      activeLiveSyncPromise = null;
    }
  })();

  return activeLiveSyncPromise;
}

let backgroundSyncStarted = false;

export function startDeferredFirebaseSync() {
  if (backgroundSyncStarted) return;
  backgroundSyncStarted = true;

  // Request persistent storage & hydrate any offline IndexedDB records
  requestPersistentStorage().catch(() => {});
  hydrateFromOfflineVault().then(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine !== false && !isFirestoreWriteQuotaExceeded()) {
      flushPendingLocalSyncKeys().catch(() => {});
    }
  }).catch(() => {});

  // Always connect instant Live Relay SSE channel across all three portals (0 Firestore reads!)
  startLiveRelayClient(({ key, value, updatedAt, fromLiveSse }) => {
    applyRelayKeyUpdate(key, value, updatedAt, !!fromLiveSse);
  });

  if (isStudentOrParentPortal()) {
    stopSyncPulseListener();
    attachRealtimeListenersForKeys(PARENT_REALTIME_KEYS);
    return;
  }

  attachRealtimeListenersForKeys(SYNC_KEYS);
  startSyncPulseListener();
}

export function setupFirebaseSync(options?: { deferNetwork?: boolean }) {
  if (setupInitialized) return;
  setupInitialized = true;

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      emitOfflineSyncStatus();
      ensureRealtimeSyncHealthy();
      syncLivePortalDataFromServer({ minIntervalMs: DEFAULT_FIRESTORE_CACHE_TTL_MS }).catch(() => {});
    });
    window.addEventListener('offline', () => {
      emitOfflineSyncStatus();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        ensureRealtimeSyncHealthy();
        fetchLiveRelaySnapshot().catch(() => {});
        // Check 1-doc sync pulse on resume (1 read) so Director/Teacher sees PC updates immediately even within 5 min
        checkSyncPulseOnResume().catch(() => {});
        // Also sync any keys whose 5-minute TTL expired while app was in background (0 reads if still fresh)
        syncLivePortalDataFromServer({ forceServer: true }).catch(() => {});
        window.dispatchEvent(new CustomEvent('school_app_resumed'));
      }
    });
    // Zero-Firestore-read health watchdog on visible tabs (SSE Live Relay only)
    setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        ensureRealtimeSyncHealthy();
        fetchLiveRelaySnapshot().catch(() => {});
      }
    }, 30000);
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
      // DO NOT push empty defaults to Firestore or Live Relay!
      if (!initialLoadCompletedKeys.has(key) && (value === '[]' || value === '{}' || value.trim() === '')) {
        console.log(`[Firestore Sync] Safeguard: Skipping push of empty default for ${key} during startup.`);
        return;
      }

      // Skip redundant network write if identical value is already in-flight or already synced cleanly
      if (
        inFlightDirectWrites.get(key) === value ||
        ((prevValue === value || lastSyncedValues.get(key) === value) && !prevMeta.pendingSync)
      ) {
        return;
      }

      // Mark pending BEFORE setDoc and clear ONLY inside .then() after cloud confirmation
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setKeySyncMeta(key, now, true);
      saveToOfflineVault(key, value, now, true).catch(() => {});

      // Broadcast to other tabs on the same device immediately
      broadcastLocalUpdate(key, value);

      if (isOffline) {
        return;
      }

      // Push to Firestore + Live Relay server
      const dispatchCloudWrite = (targetValue: string, ts: number) => {
        try {
          if (safeGetLocalItem(key) !== targetValue) return;

          // Always push over instant SSE Live Relay so Teacher/Parent/Director see updates in <50ms
          pushLiveRelayKey(key, targetValue, ts, {
            allowEmpty: initialLoadCompletedKeys.has(key)
          }).catch(() => {});

          let parsedData;
          try {
            parsedData = JSON.parse(targetValue);
          } catch {
            parsedData = targetValue;
          }

          if (db && !isFirestoreWriteQuotaExceeded()) {
            const docRef = doc(db, 'school_live_data', key);
            const cloudPayload = prepareFirestorePayload(key, parsedData);
            inFlightDirectWrites.set(key, targetValue);
            const interceptorPromise = setDoc(docRef, { data: cloudPayload, updatedAt: ts }, { merge: true }).then(() => {
              if (inFlightDirectWrites.get(key) === targetValue) {
                inFlightDirectWrites.delete(key);
              }
              if (inFlightWritePromises.get(key)?.promise === interceptorPromise) {
                inFlightWritePromises.delete(key);
              }
              lastSyncedValues.set(key, targetValue);
              const latestMeta = getKeySyncMeta(key);
              if (latestMeta.updatedAt <= ts || safeGetLocalItem(key) === targetValue) {
                setKeySyncMeta(key, ts, false);
              }
              markVaultKeySynced(key, ts).catch(() => {});
              trackFirestoreWrite(1, `تحديث تلقائي (${key})`);
              initialLoadCompletedKeys.add(key);
              markReadCacheFresh(`school_live_data:${key}`);
              scheduleCrossDeviceSyncPulse(key);
              if (key === 'school_students' && Array.isArray(parsedData)) {
                syncStudentsDirectoryToFirestore(parsedData).catch(() => {});
              }
              return true;
            }).catch(err => {
              if (inFlightDirectWrites.get(key) === targetValue) {
                inFlightDirectWrites.delete(key);
              }
              if (inFlightWritePromises.get(key)?.promise === interceptorPromise) {
                inFlightWritePromises.delete(key);
              }
              if (isQuotaError(err)) {
                markFirestoreWriteQuotaExceeded(err);
              } else {
                console.warn(`Notice writing key ${key} to Firestore (protected locally):`, err?.message || err);
              }
              setKeySyncMeta(key, ts, true);
              saveToOfflineVault(key, targetValue, ts, true).catch(() => {});
              return false;
            });
            inFlightWritePromises.set(key, { value: targetValue, promise: interceptorPromise });
          }
        } catch (err) {
          console.warn(`Notice preparing write for key ${key}:`, err);
        }
      };

      const existingTimer = debouncedCloudWriteTimers.get(key);
      if (existingTimer !== undefined) {
        clearTimeout(existingTimer);
        debouncedCloudWriteTimers.delete(key);
      }

      if (DEBOUNCED_TYPING_KEYS.has(key)) {
        const timer = setTimeout(() => {
          debouncedCloudWriteTimers.delete(key);
          dispatchCloudWrite(value, now);
        }, 250);
        debouncedCloudWriteTimers.set(key, timer);
      } else {
        dispatchCloudWrite(value, now);
      }
    }
  };

  // 2. Intercept localStorage.removeItem
  localStorage.removeItem = (key: string) => {
    memoryFallbackStore.delete(key);
    lastSyncedValues.delete(key);
    originalRemoveItem(key);
  };

  if (!options?.deferNetwork) {
    startDeferredFirebaseSync();
  }
}
