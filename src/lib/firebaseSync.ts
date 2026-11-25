/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { commitFirestoreBatchViaRest, db, getDocCacheFirst, readDocViaRestApi, writeFirestoreDocFast } from './firebase';
import type { SentGradeSheet } from '../types';
import { collection, doc, documentId, enableNetwork, getDocsFromCache, getDocsFromServer, onSnapshot, query, setDoc, where, writeBatch } from 'firebase/firestore';
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
import { flushPendingGradeBatches } from './studentGradesQuery';
import {
  requestPersistentStorage,
  saveToOfflineVault,
  markVaultKeySynced,
  getAllVaultItems,
  clearEntireOfflineVault,
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
import { seedStudentsDirectorySignatures, syncStudentsDirectoryToFirestore } from './parentStudentQuery';

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
  'school_deleted_evaluation_months',
  'school_deleted_records',
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
  'school_deleted_evaluation_months',
  'school_deleted_records',
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
  'school_deleted_evaluation_months',
  'school_deleted_records',
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
  'school_deleted_evaluation_months',
  'school_deleted_records',
  'school_max_grade_setting',
  'school_custom_max_grade',
  'school_pass_grade_setting',
  'school_custom_pass_grade',
  'school_whatsapp_monthly_template',
  'school_exam_questions'
];

export const EVALUATION_CONFIG_KEYS = [
  'school_evaluation_current_month',
  'school_saved_evaluation_months',
  'school_evaluation_saved_months',
  'school_deleted_evaluation_months',
  'school_deleted_records'
];

export function normalizeEvaluationMonthValue(raw: any): string {
  if (raw === null || raw === undefined) return '';
  let str = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  if (str.startsWith('"') && str.endsWith('"') && str.length >= 2) {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'string') {
        str = parsed.trim();
      }
    } catch {}
  }
  return str;
}

export function getDeletedEvaluationMonthsMap(): Record<string, number> {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem('school_deleted_evaluation_months')
      : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const m = String(k || '').trim();
      const ts = Number(v) || 0;
      if (m && ts > 0) out[m] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

export function getGradeTimestampMs(grade: { updatedAt?: number; date?: string } | null | undefined): number {
  if (!grade) return 0;
  const upd = Number(grade.updatedAt) || 0;
  if (upd > 0) return upd;
  const rawDate = String(grade.date || '').trim();
  if (!rawDate) return 0;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
  if (dateOnly) {
    return Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 23, 59, 59, 999);
  }
  return new Date(rawDate).getTime() || 0;
}

export function unmarkDeletedEvaluationMonth(month: string, options?: { syncToCloud?: boolean }): void {
  const cleanMonth = String(month || '').trim();
  if (!cleanMonth) return;
  const existingDeleted = getDeletedEvaluationMonthsMap();
  if (!existingDeleted[cleanMonth]) return;
  const nextDeleted = { ...existingDeleted };
  delete nextDeleted[cleanMonth];
  const serialized = JSON.stringify(nextDeleted);
  saveSyncedLocalOnly('school_deleted_evaluation_months', serialized);
  safeDispatchStorageUpdate('school_deleted_evaluation_months', serialized);
  if (options?.syncToCloud !== false && !isStudentOrParentPortal()) {
    persistDirectToFirestore('school_deleted_evaluation_months', nextDeleted, { timeoutMs: 3500 }).catch(() => false);
  }
}

export function isItemDeletedByEvaluationMonth(
  month: string | undefined | null,
  itemTs: number,
  deletedMonthsMap: Record<string, number> = getDeletedEvaluationMonthsMap()
): boolean {
  const m = String(month || '').trim();
  if (!m) return false;
  const deletedAt = Number(deletedMonthsMap[m]) || 0;
  if (!deletedAt) return false;
  // If item has no timestamp or was created/sent at or before deletion, treat as deleted
  return itemTs <= 0 || deletedAt >= itemTs;
}

export function filterOutDeletedMonthsFromSheets(
  sheets: SentGradeSheet[],
  deletedMonthsMap: Record<string, number> = getDeletedEvaluationMonthsMap()
): SentGradeSheet[] {
  if (!Array.isArray(sheets)) return [];
  const deletedReportIds = getDeletedEntityIdsSet('gradeReports');
  const hasDeletedMonths = Boolean(deletedMonthsMap && Object.keys(deletedMonthsMap).length > 0);
  const hasDeletedReports = deletedReportIds.size > 0;
  if (!hasDeletedMonths && !hasDeletedReports) return sheets;
  return sheets.filter((sh) => {
    if (!sh) return false;
    const rec = sh as SentGradeSheet & { updatedAt?: number };
    const ts = Number(rec.updatedAt) || (rec.dateSent ? new Date(rec.dateSent).getTime() || 0 : 0);
    if (rec.id && deletedReportIds.has(String(rec.id).trim())) {
      const delTs = Number(getDeletedRecordsMap().gradeReports[String(rec.id).trim()]) || 0;
      if (delTs >= ts) return false;
    }
    return !isItemDeletedByEvaluationMonth(rec.month, ts, deletedMonthsMap);
  });
}

export function isGradeMessageDeletedByMonth(
  content: string | undefined | null,
  dateStr?: string,
  deletedMonthsMap: Record<string, number> = getDeletedEvaluationMonthsMap()
): boolean {
  if (!content || !deletedMonthsMap || Object.keys(deletedMonthsMap).length === 0) return false;
  const msgTs = dateStr ? new Date(dateStr).getTime() || 0 : 0;
  for (const [m, deletedAt] of Object.entries(deletedMonthsMap)) {
    if (!m || !deletedAt) continue;
    if (msgTs > deletedAt) continue;
    if (
      content.includes(`الشهر: [${m}]`) ||
      content.includes(`الشهر: ${m}`) ||
      content.includes(`لشهر (${m})`) ||
      content.includes(`لشهر ${m}`) ||
      content.includes(`شهر ${m}`)
    ) {
      return true;
    }
  }
  return false;
}

let isRemoteSyncing = false;
const initialLoadCompletedKeys = new Set<string>();
const localUpdateTimestamps = new Map<string, number>();

const LOCAL_SYNC_META_KEY = 'school_local_sync_meta';
const DELETED_STUDENTS_KEY = 'school_deleted_student_ids';
const DELETED_RECORDS_KEY = 'school_deleted_records';
const MAX_FIRESTORE_DOC_BYTES = 920 * 1024; // Safety threshold below Firestore 1 MiB limit

export type DeletedEntityCategory = 'classes' | 'teachers' | 'parents' | 'students' | 'grades' | 'gradeReports';
export type DeletedRecordsMap = Record<DeletedEntityCategory, Record<string, number>>;

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
const lastCloudConfirmedValues = new Map<string, string>();
const subscribedRealtimeKeys = new Set<string>();
const allowedRealtimeKeys = new Set<string>();
let collectionListenerAttached = false;
const latestCollectionSnapshots = new Map<string, { data: any; fromCache: boolean }>();
const debouncedCloudWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCED_TYPING_KEYS = new Set<string>(['school_grades', 'school_monthly_evaluations']);
const cleanedRemoteTombstoneSignatures = new Set<string>();

// Real-time Firestore `onSnapshot` listeners for instant PC <-> Phone / Android APK sync
const SYNC_PULSE_DOC_ID = '_sync_pulse';
const PARENT_PULSE_DOC_ID = '_parent_pulse';
const ADMIN_DELTA_SINCE_KEY = 'school_live_delta_since_admin_v1';
const PARENT_PULSE_KEYS_MAP_KEY = 'school_parent_pulse_keys_v1';
let schoolLiveDataColUnsubscribe: (() => void) | null = null;
let schoolLiveDataReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let parentScopedUnsubscribes: Array<() => void> = [];
let parentScopedReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastRealtimeServerEventAt = 0;

let pendingParentPulseKeys: Record<string, number> = {};
let parentPulseWriteTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleParentPulseUpdate(key: string, ts: number): void {
  if (isStudentOrParentPortal() || !PARENT_REALTIME_KEYS.includes(key)) return;
  if (!db || isFirestoreWriteQuotaExceeded()) return;
  pendingParentPulseKeys[key] = Math.max(pendingParentPulseKeys[key] || 0, ts || Date.now());
  if (parentPulseWriteTimer) return;
  parentPulseWriteTimer = setTimeout(() => {
    parentPulseWriteTimer = null;
    if (!db || isFirestoreWriteQuotaExceeded()) {
      pendingParentPulseKeys = {};
      return;
    }
    const keysPatch = { ...pendingParentPulseKeys };
    pendingParentPulseKeys = {};
    const maxTs = Math.max(Date.now(), ...Object.values(keysPatch));
    writeFirestoreDocFast(
      'school_live_data',
      PARENT_PULSE_DOC_ID,
      { updatedAt: maxTs, keys: keysPatch },
      { merge: true, sdkGraceMs: 1500, restTimeoutMs: 6000 }
    )
      .then(() => {
        trackFirestoreWrite(1, 'تحديث نبض إعدادات ولي الأمر');
      })
      .catch(() => {});
  }, 1200);
}

function getAdminDeltaSince(): number {
  try {
    const raw = safeGetLocalItem(ADMIN_DELTA_SINCE_KEY);
    const n = Number(raw) || 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function advanceAdminDeltaSince(candidateTs: number): void {
  if (!Number.isFinite(candidateTs) || candidateTs <= 0) return;
  const current = getAdminDeltaSince();
  if (candidateTs > current) {
    const val = String(candidateTs);
    safeSetLocalItem(ADMIN_DELTA_SINCE_KEY, val);
    saveToOfflineVault(ADMIN_DELTA_SINCE_KEY, val, candidateTs, false).catch(() => {});
  }
}

function getParentPulseKeysMap(): Record<string, number> {
  try {
    const raw = safeGetLocalItem(PARENT_PULSE_KEYS_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const ts = Number(v) || 0;
      if (k && ts > 0) out[k] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

function updateParentPulseKeysMap(updates: Record<string, number>): void {
  const entries = Object.entries(updates).filter(([, ts]) => Number(ts) > 0);
  if (entries.length === 0) return;
  const merged = getParentPulseKeysMap();
  let changed = false;
  for (const [k, ts] of entries) {
    if (ts > (merged[k] || 0)) {
      merged[k] = ts;
      changed = true;
    }
  }
  if (!changed) return;
  const serialized = JSON.stringify(merged);
  safeSetLocalItem(PARENT_PULSE_KEYS_MAP_KEY, serialized);
  saveToOfflineVault(PARENT_PULSE_KEYS_MAP_KEY, serialized, Date.now(), false).catch(() => {});
}

export function hasPortalBaselineCache(isParentPortal: boolean = isStudentOrParentPortal()): boolean {
  const hasPublicConfig =
    safeGetLocalItem('school_classes') !== null &&
    safeGetLocalItem('school_evaluation_current_month') !== null &&
    safeGetLocalItem('school_teachers') !== null;
  if (isParentPortal) {
    return hasPublicConfig && Object.keys(getParentPulseKeysMap()).length > 0;
  }
  return (
    hasPublicConfig &&
    safeGetLocalItem('school_students') !== null &&
    getAdminDeltaSince() > 0
  );
}

export function notifyCrossDeviceKeyChanged(_changedKey: string): void {
  // Handled natively by real-time Firestore `onSnapshot` on `school_live_data` and `grade_reports`
  if (typeof window !== 'undefined' && (_changedKey === 'grade_reports' || _changedKey === 'school_sent_grade_sheets')) {
    invalidateReadCache('grade_reports:all');
  }
}

function stopSchoolLiveDataCollectionListener(): void {
  if (schoolLiveDataReconnectTimer) {
    clearTimeout(schoolLiveDataReconnectTimer);
    schoolLiveDataReconnectTimer = null;
  }
  if (schoolLiveDataColUnsubscribe) {
    try {
      schoolLiveDataColUnsubscribe();
    } catch {}
    schoolLiveDataColUnsubscribe = null;
  }
}

function stopParentScopedRealtimeListeners(): void {
  if (parentScopedReconnectTimer) {
    clearTimeout(parentScopedReconnectTimer);
    parentScopedReconnectTimer = null;
  }
  if (parentScopedUnsubscribes.length > 0) {
    parentScopedUnsubscribes.forEach((unsub) => {
      try {
        unsub();
      } catch {}
    });
    parentScopedUnsubscribes = [];
  }
}

function startSchoolLiveDataCollectionListener(): void {
  if (schoolLiveDataColUnsubscribe || !db || isStudentOrParentPortal()) return;
  if (isFirestoreReadQuotaExceeded()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  if (schoolLiveDataReconnectTimer) {
    clearTimeout(schoolLiveDataReconnectTimer);
    schoolLiveDataReconnectTimer = null;
  }

  let isInitialSnapshot = true;
  const adminDeltaSince = getAdminDeltaSince();
  const useDeltaQuery = adminDeltaSince > 0 && hasPortalBaselineCache(false);
  const colRef = collection(db, 'school_live_data');
  const listenTarget = useDeltaQuery
    ? query(colRef, where('updatedAt', '>', Math.max(0, adminDeltaSince - 15000)))
    : colRef;

  try {
    schoolLiveDataColUnsubscribe = onSnapshot(
      listenTarget,
      (snapshot) => {
        const changes = snapshot.docChanges();
        let serverReadsCount = 0;
        let receivedRemoteServerUpdate = false;
        let maxServerUpdatedAt = 0;
        if (!snapshot.metadata?.fromCache) {
          lastRealtimeServerEventAt = Date.now();
        }

        changes.forEach((change) => {
          if (change.type === 'removed') return;
          const key = change.doc.id;
          if (!key || key === SYNC_PULSE_DOC_ID || key === PARENT_PULSE_DOC_ID || !SYNC_KEYS.includes(key)) return;

          const fromCache = !!change.doc.metadata?.fromCache;
          const hasPendingWrites = !!change.doc.metadata?.hasPendingWrites;
          const docData = change.doc.data();
          const docUpdatedAt = Number(docData?.updatedAt) || 0;

          latestCollectionSnapshots.set(key, { data: docData, fromCache });

          if (!fromCache && !hasPendingWrites) {
            serverReadsCount += 1;
            if (docUpdatedAt > maxServerUpdatedAt) {
              maxServerUpdatedAt = docUpdatedAt;
            }
            markReadCacheFresh(`school_live_data:${key}`);
            if (!isInitialSnapshot || useDeltaQuery) {
              receivedRemoteServerUpdate = true;
            }
          }

          processRemoteSnapshotDoc(key, docData, fromCache);
        });

        if (maxServerUpdatedAt > 0) {
          advanceAdminDeltaSince(maxServerUpdatedAt);
        }

        if (serverReadsCount > 0) {
          trackFirestoreRead(
            serverReadsCount,
            useDeltaQuery
              ? `جلب التحديثات الجديدة فقط (${serverReadsCount})`
              : (isInitialSnapshot ? 'مزامنة مبدئية مباشرة' : 'تحديث فوري بين الأجهزة')
          );
        }

        if (receivedRemoteServerUpdate && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('school_live_sync_completed', {
            detail: { ok: true, ts: Date.now(), source: useDeltaQuery ? 'realtime_delta_snapshot' : 'realtime_snapshot' }
          }));
        }

        isInitialSnapshot = false;
      },
      (err) => {
        if (schoolLiveDataColUnsubscribe) {
          try {
            schoolLiveDataColUnsubscribe();
          } catch {}
          schoolLiveDataColUnsubscribe = null;
        }
        if (isQuotaError(err)) {
          markFirestoreReadQuotaExceeded(err);
          return;
        }
        const msg = String((err as any)?.message || err || '').toLowerCase();
        if (msg.includes('permission') || msg.includes('missing or insufficient')) {
          return;
        }
        if (!schoolLiveDataReconnectTimer && typeof window !== 'undefined') {
          schoolLiveDataReconnectTimer = setTimeout(() => {
            schoolLiveDataReconnectTimer = null;
            if (!isStudentOrParentPortal()) {
              startSchoolLiveDataCollectionListener();
            }
          }, 6000);
        }
      }
    );
  } catch {
    schoolLiveDataColUnsubscribe = null;
  }
}

function attachParentScopedChunkListeners(): void {
  if (!db) return;
  const chunks: string[][] = [];
  for (let i = 0; i < PARENT_REALTIME_KEYS.length; i += 30) {
    chunks.push(PARENT_REALTIME_KEYS.slice(i, i + 30));
  }

  chunks.forEach((keyChunk) => {
    let isInitialChunkSnapshot = true;
    const q = query(collection(db, 'school_live_data'), where(documentId(), 'in', keyChunk));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        let serverReadsCount = 0;
        let receivedRemoteUpdate = false;
        const pulseUpdates: Record<string, number> = {};
        if (!snapshot.metadata?.fromCache) {
          lastRealtimeServerEventAt = Date.now();
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') return;
          const key = change.doc.id;
          if (!key || !PARENT_REALTIME_KEYS.includes(key)) return;

          const fromCache = !!change.doc.metadata?.fromCache;
          const hasPendingWrites = !!change.doc.metadata?.hasPendingWrites;
          const docData = change.doc.data();
          const docUpdatedAt = Number(docData?.updatedAt) || Date.now();

          latestCollectionSnapshots.set(key, { data: docData, fromCache });

          if (!fromCache && !hasPendingWrites) {
            serverReadsCount += 1;
            pulseUpdates[key] = docUpdatedAt;
            markReadCacheFresh(`school_live_data:${key}`);
            if (!isInitialChunkSnapshot) {
              receivedRemoteUpdate = true;
            }
          }

          processRemoteSnapshotDoc(key, docData, fromCache);
        });

        if (Object.keys(pulseUpdates).length > 0) {
          updateParentPulseKeysMap(pulseUpdates);
        }

        if (serverReadsCount > 0) {
          trackFirestoreRead(
            serverReadsCount,
            isInitialChunkSnapshot ? 'جلب إعدادات ولي الأمر المبدئية' : 'تحديث فوري لإعدادات المدرسة'
          );
        }

        if (!isInitialChunkSnapshot && receivedRemoteUpdate && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('school_live_sync_completed', {
            detail: { ok: true, ts: Date.now(), source: 'parent_realtime_snapshot' }
          }));
        }

        isInitialChunkSnapshot = false;
      },
      (err) => {
        stopParentScopedRealtimeListeners();
        if (isQuotaError(err)) {
          markFirestoreReadQuotaExceeded(err);
          return;
        }
        const msg = String((err as any)?.message || err || '').toLowerCase();
        if (msg.includes('permission') || msg.includes('missing or insufficient')) {
          return;
        }
        if (!parentScopedReconnectTimer && typeof window !== 'undefined') {
          parentScopedReconnectTimer = setTimeout(() => {
            parentScopedReconnectTimer = null;
            if (isStudentOrParentPortal()) {
              startParentScopedRealtimeListeners();
            }
          }, 6000);
        }
      }
    );
    parentScopedUnsubscribes.push(unsub);
  });
}

function startParentScopedRealtimeListeners(): void {
  if (parentScopedUnsubscribes.length > 0 || !db || !isStudentOrParentPortal()) return;
  if (isFirestoreReadQuotaExceeded()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  if (parentScopedReconnectTimer) {
    clearTimeout(parentScopedReconnectTimer);
    parentScopedReconnectTimer = null;
  }

  try {
    // If parent already has local baseline cache, listen ONLY to the 1-doc `_parent_pulse`
    // and fetch individual config keys ONLY when their timestamp increased.
    if (hasPortalBaselineCache(true)) {
      const pulseRef = doc(db, 'school_live_data', PARENT_PULSE_DOC_ID);
      const unsub = onSnapshot(
        pulseRef,
        async (snap) => {
          if (snap.metadata?.fromCache) return;
          lastRealtimeServerEventAt = Date.now();
          trackFirestoreRead(1, 'فحص نبض التحديثات (مستند واحد)');

          if (!snap.exists()) {
            // Legacy cloud DB without `_parent_pulse` yet: fall back once to scoped chunk listener
            stopParentScopedRealtimeListeners();
            attachParentScopedChunkListeners();
            return;
          }

          const pulseData = snap.data() as { keys?: Record<string, number> };
          const remoteKeysMap = pulseData?.keys && typeof pulseData.keys === 'object' ? pulseData.keys : {};
          const localKeysMap = getParentPulseKeysMap();
          const changedKeys = PARENT_REALTIME_KEYS.filter((k) => {
            if (safeGetLocalItem(k) === null) return true;
            const remoteTs = Number(remoteKeysMap[k]) || 0;
            const localTs = Number(localKeysMap[k]) || 0;
            return remoteTs > localTs;
          });

          if (changedKeys.length === 0) {
            PARENT_REALTIME_KEYS.forEach((k) => {
              initialLoadCompletedKeys.add(k);
              markReadCacheFresh(`school_live_data:${k}`);
            });
            return;
          }

          await forceRefreshDataFromFirestore({
            forceServer: true,
            keys: changedKeys,
            bypassCache: true
          }).catch(() => false);

          const appliedUpdates: Record<string, number> = {};
          changedKeys.forEach((k) => {
            appliedUpdates[k] = Number(remoteKeysMap[k]) || Date.now();
          });
          updateParentPulseKeysMap(appliedUpdates);

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('school_live_sync_completed', {
              detail: { ok: true, ts: Date.now(), source: 'parent_pulse_delta' }
            }));
          }
        },
        (err) => {
          stopParentScopedRealtimeListeners();
          if (isQuotaError(err)) {
            markFirestoreReadQuotaExceeded(err);
            return;
          }
          const msg = String((err as any)?.message || err || '').toLowerCase();
          if (msg.includes('permission') || msg.includes('missing or insufficient')) {
            return;
          }
          if (!parentScopedReconnectTimer && typeof window !== 'undefined') {
            parentScopedReconnectTimer = setTimeout(() => {
              parentScopedReconnectTimer = null;
              if (isStudentOrParentPortal()) {
                startParentScopedRealtimeListeners();
              }
            }, 6000);
          }
        }
      );
      parentScopedUnsubscribes.push(unsub);
      return;
    }

    attachParentScopedChunkListeners();
  } catch {
    stopParentScopedRealtimeListeners();
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
  try {
    safeSetLocalItem(key, value);
  } finally {
    isRemoteSyncing = false;
  }
}

/**
 * Updates localStorage and BroadcastChannel from a Firestore snapshot WITHOUT firing
 * a redundant setDoc writeback to Firestore (CRITICAL QUOTA & SYNC-LOOP RULE).
 */
export function saveSyncedLocalOnly(key: string, value: string): void {
  const existing = safeGetLocalItem(key);
  if (existing === value) return;
  isRemoteSyncing = true;
  try {
    safeSetLocalItem(key, value);
  } finally {
    isRemoteSyncing = false;
  }
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

function pruneNonEssentialLocalCaches(): void {
  const disposableKeys = [
    'school_grade_reports_cache_v1',
    'school_students_dir_sigs_v1',
    'school_whatsapp_sent_records',
    'school_deleted_grade_report_ids_v1'
  ];
  for (const k of disposableKeys) {
    try {
      originalRemoveItem(k);
    } catch {}
  }
}

function safeSetLocalItem(key: string, value: string): void {
  memoryFallbackStore.set(key, value);
  try {
    originalSetItem(key, value);
  } catch (err) {
    // Free duplicate caches and retry once before relying solely on memory + IndexedDB vault
    pruneNonEssentialLocalCaches();
    try {
      originalSetItem(key, value);
      return;
    } catch {
      console.warn(`[Offline Storage] localStorage limit reached for ${key}, preserved in memory & IndexedDB vault.`, err);
    }
  }
}

let inMemorySyncMetaCache: Record<string, LocalKeySyncMeta> | null = null;

function loadLocalSyncMeta(): Record<string, LocalKeySyncMeta> {
  if (inMemorySyncMetaCache) return inMemorySyncMetaCache;
  try {
    const raw = safeGetLocalItem(LOCAL_SYNC_META_KEY);
    if (raw) {
      inMemorySyncMetaCache = JSON.parse(raw) || {};
      return inMemorySyncMetaCache!;
    }
  } catch {}
  inMemorySyncMetaCache = {};
  return inMemorySyncMetaCache;
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
    inMemorySyncMetaCache = all;
    const serialized = JSON.stringify(all);
    safeSetLocalItem(LOCAL_SYNC_META_KEY, serialized);
    saveToOfflineVault(LOCAL_SYNC_META_KEY, serialized, updatedAt, false).catch(() => {});
  } catch {}
  if (!pendingSync) {
    lastSyncedTimestamp = Math.max(lastSyncedTimestamp || 0, updatedAt);
  }
  emitOfflineSyncStatus();
}

const ALL_DELETED_CATEGORIES: DeletedEntityCategory[] = [
  'classes',
  'teachers',
  'parents',
  'students',
  'grades',
  'gradeReports'
];

function createEmptyDeletedRecordsMap(): DeletedRecordsMap {
  return { classes: {}, teachers: {}, parents: {}, students: {}, grades: {}, gradeReports: {} };
}

function normalizeDeletedRecordsMap(raw: any): DeletedRecordsMap {
  const out = createEmptyDeletedRecordsMap();
  if (!raw || typeof raw !== 'object') return out;
  const now = Date.now();
  const maxAge = 30 * 24 * 60 * 60 * 1000;
  ALL_DELETED_CATEGORIES.forEach((cat) => {
    const bucket = raw[cat];
    if (bucket && typeof bucket === 'object' && !Array.isArray(bucket)) {
      const entries = Object.entries(bucket)
        .map(([k, v]) => [String(k || '').trim(), Number(v) || 0] as const)
        .filter(([id, ts]) => Boolean(id) && ts > 0 && now - ts <= maxAge);
      const maxEntries = cat === 'grades' ? 800 : 1200;
      const sliced = entries.length > maxEntries
        ? entries.sort((a, b) => b[1] - a[1]).slice(0, maxEntries)
        : entries;
      for (const [id, ts] of sliced) {
        out[cat][id] = ts;
      }
    }
  });
  return out;
}

export function getDeletedRecordsMap(): DeletedRecordsMap {
  let base = createEmptyDeletedRecordsMap();
  try {
    const raw = safeGetLocalItem(DELETED_RECORDS_KEY);
    if (raw) {
      base = normalizeDeletedRecordsMap(JSON.parse(raw));
    }
  } catch {}
  try {
    const rawLegacyStudents = safeGetLocalItem(DELETED_STUDENTS_KEY);
    if (rawLegacyStudents) {
      const legacyMap = JSON.parse(rawLegacyStudents);
      if (legacyMap && typeof legacyMap === 'object') {
        for (const [k, v] of Object.entries(legacyMap)) {
          const id = String(k || '').trim();
          const ts = Number(v) || 0;
          if (id && ts > 0) {
            base.students[id] = Math.max(base.students[id] || 0, ts);
          }
        }
      }
    }
  } catch {}
  return base;
}

function mergeDeletedRecordsMaps(remoteRaw: any, localRaw: any): DeletedRecordsMap {
  const r = normalizeDeletedRecordsMap(remoteRaw);
  const l = normalizeDeletedRecordsMap(localRaw);
  const out = createEmptyDeletedRecordsMap();
  ALL_DELETED_CATEGORIES.forEach((cat) => {
    out[cat] = { ...r[cat] };
    for (const [id, ts] of Object.entries(l[cat])) {
      out[cat][id] = Math.max(out[cat][id] || 0, ts);
    }
  });
  return out;
}

export function getDeletedEntityIdsSet(category: DeletedEntityCategory): Set<string> {
  const map = getDeletedRecordsMap();
  return new Set(Object.keys(map[category] || {}));
}

export function filterOutDeletedEntities<T extends { id?: any }>(category: DeletedEntityCategory, list: T[], deletedMap?: DeletedRecordsMap): T[] {
  if (!Array.isArray(list)) return [];
  const bucket = (deletedMap || getDeletedRecordsMap())[category];
  if (!bucket || Object.keys(bucket).length === 0) return list;
  return list.filter((item) => {
    if (!item) return false;
    const id = item.id !== undefined && item.id !== null ? String(item.id).trim() : '';
    return !id || !bucket[id];
  });
}

function pruneLocalCoreCollectionsByTombstones(deletedMap: DeletedRecordsMap): void {
  const pairs: Array<[string, DeletedEntityCategory]> = [
    ['school_classes', 'classes'],
    ['school_teachers', 'teachers'],
    ['school_parents', 'parents'],
    ['school_students', 'students'],
    ['school_grades', 'grades'],
    ['school_sent_grade_sheets', 'gradeReports']
  ];
  for (const [storageKey, cat] of pairs) {
    const bucket = deletedMap[cat];
    if (!bucket || Object.keys(bucket).length === 0) continue;
    try {
      const raw = safeGetLocalItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      const filtered = parsed.filter((item: any) => {
        const id = item?.id !== undefined && item?.id !== null ? String(item.id).trim() : '';
        if (!id || !bucket[id]) return true;
        if (cat === 'grades') {
          const itemTs = getGradeTimestampMs(item);
          return itemTs > bucket[id];
        }
        if (cat === 'gradeReports') {
          const itemTs = Number(item?.updatedAt) || (item?.dateSent ? new Date(item.dateSent).getTime() || 0 : 0);
          return itemTs > bucket[id];
        }
        return false;
      });
      if (filtered.length !== parsed.length) {
        const serialized = JSON.stringify(filtered);
        saveSyncedLocalOnly(storageKey, serialized);
        safeDispatchStorageUpdate(storageKey, serialized);
        broadcastLocalUpdate(storageKey, serialized);
      }
    } catch {}
  }
}

/**
 * Records intentionally deleted entity IDs locally and syncs tombstones to Firestore
 * so other browsers / APKs never resurrect deleted classes, teachers, parents, or students.
 */
export function recordDeletedEntityIds(
  category: DeletedEntityCategory,
  ids: string[],
  options?: { syncToCloud?: boolean }
): Promise<boolean> {
  if (!Array.isArray(ids) || ids.length === 0) return Promise.resolve(true);
  try {
    const now = Date.now();
    const map = getDeletedRecordsMap();
    for (const rawId of ids) {
      const id = String(rawId || '').trim();
      if (id) map[category][id] = now;
    }
    const serialized = JSON.stringify(map);
    saveSyncedLocalOnly(DELETED_RECORDS_KEY, serialized);
    safeDispatchStorageUpdate(DELETED_RECORDS_KEY, serialized);

    if (category === 'students') {
      const legacyStudents = JSON.stringify(map.students);
      safeSetLocalItem(DELETED_STUDENTS_KEY, legacyStudents);
      saveToOfflineVault(DELETED_STUDENTS_KEY, legacyStudents, now, false).catch(() => {});
    }

    if (options?.syncToCloud !== false && !isStudentOrParentPortal()) {
      return persistDirectToFirestore(DELETED_RECORDS_KEY, map, { timeoutMs: 3500 }).catch(() => false);
    }
  } catch {}
  return Promise.resolve(false);
}

/**
 * Removes specific IDs from the deleted tombstones map when explicitly restored via backup.
 */
export function unmarkDeletedEntityIds(
  category: DeletedEntityCategory,
  ids: string[],
  options?: { syncToCloud?: boolean }
): void {
  if (!Array.isArray(ids) || ids.length === 0) return;
  try {
    const map = getDeletedRecordsMap();
    let changed = false;
    for (const rawId of ids) {
      const id = String(rawId || '').trim();
      if (id && map[category][id]) {
        delete map[category][id];
        changed = true;
      }
    }
    if (!changed) return;
    const serialized = JSON.stringify(map);
    saveSyncedLocalOnly(DELETED_RECORDS_KEY, serialized);
    safeDispatchStorageUpdate(DELETED_RECORDS_KEY, serialized);
    if (options?.syncToCloud !== false && !isStudentOrParentPortal()) {
      persistDirectToFirestore(DELETED_RECORDS_KEY, map, { timeoutMs: 3500 }).catch(() => {});
    }
  } catch {}
}

/**
 * Records intentionally deleted student IDs so sync merge safeguards never resurrect them.
 */
export function recordDeletedStudentIds(ids: string[]) {
  void recordDeletedEntityIds('students', ids);
}

export function getRecentlyDeletedStudentIds(): Set<string> {
  return getDeletedEntityIdsSet('students');
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
function mergePendingLocalWithRemote(
  key: string,
  remotePayload: any,
  localParsed: any,
  preferLocal: boolean = true
): any {
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
    const deletedMonthsMap = getDeletedEvaluationMonthsMap();
    const combined = preferLocal
      ? [...remotePayload, ...localParsed]
      : [...localParsed, ...remotePayload];
    return filterOutDeletedMonthsFromSheets(
      deduplicateGradeSheetsPreservingTeachers(combined),
      deletedMonthsMap
    );
  }

  if (key === 'school_grades' && Array.isArray(remotePayload) && Array.isArray(localParsed)) {
    const deletedMonthsMap = getDeletedEvaluationMonthsMap();
    const deletedGradeMap = getDeletedRecordsMap().grades;
    const map = new Map<string, any>();
    const gradeKey = (g: any) =>
      `${String(g?.studentId || '').trim()}__${String(g?.subject || '').trim()}__${String(g?.examName || '').trim()}`;
    const isDeleted = (g: any) => {
      const ts = getGradeTimestampMs(g);
      const gid = g?.id ? String(g.id).trim() : '';
      if (gid && deletedGradeMap[gid] && deletedGradeMap[gid] >= ts) {
        return true;
      }
      return isItemDeletedByEvaluationMonth(g?.examName, ts, deletedMonthsMap);
    };
    const upsertGrade = (g: any, isLocalSource: boolean) => {
      if (!g || !g.studentId || !g.subject || isDeleted(g)) return;
      const k = gradeKey(g);
      const existing = map.get(k);
      if (!existing) {
        map.set(k, g);
        return;
      }
      const existingTs = getGradeTimestampMs(existing);
      const candidateTs = getGradeTimestampMs(g);
      if (candidateTs > existingTs) {
        map.set(k, g);
      } else if (candidateTs === existingTs && ((isLocalSource && preferLocal) || (!isLocalSource && !preferLocal))) {
        map.set(k, g);
      }
    };
    remotePayload.forEach((g: any) => upsertGrade(g, false));
    localParsed.forEach((g: any) => upsertGrade(g, true));
    return Array.from(map.values());
  }

  if (key === 'school_monthly_evaluations' && typeof remotePayload === 'object' && typeof localParsed === 'object') {
    const deletedMonthsMap = getDeletedEvaluationMonthsMap();
    const isEvalDeleted = (evalKey: string, val: any) => {
      const m = String(val?.month || '').trim() || (evalKey.includes('_') ? evalKey.slice(evalKey.indexOf('_') + 1).trim() : '');
      const delTs = m ? Number(deletedMonthsMap[m]) || 0 : 0;
      if (!delTs) return false;
      const evalTs = Number(val?.updatedAt) || 0;
      return evalTs <= 0 || delTs >= evalTs;
    };
    const merged: Record<string, any> = {};
    for (const [k, remVal] of Object.entries(remotePayload || {})) {
      if (!isEvalDeleted(k, remVal)) merged[k] = remVal;
    }
    for (const [k, localVal] of Object.entries(localParsed || {})) {
      if (isEvalDeleted(k, localVal)) continue;
      const remVal = merged[k];
      if (remVal && typeof remVal === 'object' && typeof localVal === 'object' && localVal !== null) {
        const remTs = Number((remVal as any).updatedAt) || 0;
        const locTs = Number((localVal as any).updatedAt) || 0;
        const useLocalFirst = locTs > remTs || (locTs === remTs && preferLocal);
        const primary = useLocalFirst ? (localVal as any) : (remVal as any);
        const secondary = useLocalFirst ? (remVal as any) : (localVal as any);
        merged[k] = {
          ...secondary,
          ...primary,
          teacherText: primary.teacherText ?? secondary.teacherText,
          directorText: primary.directorText ?? secondary.directorText
        };
      } else {
        merged[k] = localVal;
      }
    }
    return merged;
  }

  if (key === 'school_deleted_records' && typeof remotePayload === 'object' && typeof localParsed === 'object') {
    return mergeDeletedRecordsMaps(remotePayload, localParsed);
  }

  if (
    (key === 'school_classes' || key === 'school_teachers' || key === 'school_parents') &&
    Array.isArray(remotePayload) &&
    Array.isArray(localParsed)
  ) {
    const cat: DeletedEntityCategory =
      key === 'school_classes' ? 'classes' : key === 'school_teachers' ? 'teachers' : 'parents';
    const deletedSet = getDeletedEntityIdsSet(cat);
    const map = new Map<string, any>();
    remotePayload.forEach((item: any) => {
      if (item && item.id && !deletedSet.has(String(item.id).trim())) {
        map.set(String(item.id), item);
      }
    });
    localParsed.forEach((item: any) => {
      if (item && item.id && !deletedSet.has(String(item.id).trim())) {
        map.set(String(item.id), item);
      }
    });
    return Array.from(map.values());
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
 * while strictly respecting intentional deletions.
 */
function mergeLocalAndRemoteStudents(remoteList: any[], localList: any[], remoteUpdatedAt: number, localMeta: LocalKeySyncMeta): { merged: any[]; didRecoverLocal: boolean } {
  const deletedIds = getDeletedEntityIdsSet('students');
  const cleanRemote = sanitizeAndDeduplicateStudents(
    (Array.isArray(remoteList) ? remoteList : []).filter((s: any) => !s?.id || !deletedIds.has(String(s.id).trim()))
  );
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
    const sid = String(localSt.id).trim();
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
        if (safeGetLocalItem(key) !== value) {
          isRemoteSyncing = true;
          try {
            safeSetLocalItem(key, value);
          } finally {
            isRemoteSyncing = false;
          }
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

    const vaultPriority = (key: string): number => {
      if (key === LOCAL_SYNC_META_KEY) return 0;
      if (key === ADMIN_DELTA_SINCE_KEY || key === PARENT_PULSE_KEYS_MAP_KEY) return 0;
      if (key === DELETED_STUDENTS_KEY) return 1;
      if (key === DELETED_RECORDS_KEY) return 2;
      if (key === 'school_deleted_evaluation_months') return 3;
      return 10;
    };
    const sortedItems = [...items].sort((a, b) => vaultPriority(a?.key || '') - vaultPriority(b?.key || ''));

    let restoredAny = false;
    for (const item of sortedItems) {
      if (!item || !item.key || typeof item.value !== 'string') continue;

      if (item.key === ADMIN_DELTA_SINCE_KEY) {
        const vaultTs = Number(item.value) || 0;
        if (vaultTs > getAdminDeltaSince()) {
          safeSetLocalItem(ADMIN_DELTA_SINCE_KEY, String(vaultTs));
        }
        continue;
      }

      if (item.key === PARENT_PULSE_KEYS_MAP_KEY) {
        try {
          const parsedPulse = JSON.parse(item.value);
          if (parsedPulse && typeof parsedPulse === 'object' && !Array.isArray(parsedPulse)) {
            updateParentPulseKeysMap(parsedPulse as Record<string, number>);
          }
        } catch {}
        continue;
      }

      if (item.key === LOCAL_SYNC_META_KEY) {
        try {
          const parsedVaultMeta = JSON.parse(item.value);
          if (parsedVaultMeta && typeof parsedVaultMeta === 'object') {
            const currentMeta = loadLocalSyncMeta();
            let mergedChanged = false;
            Object.entries(parsedVaultMeta).forEach(([k, v]: [string, any]) => {
              if (!v || typeof v !== 'object') return;
              const cur = currentMeta[k];
              if (!cur || (Number(v.updatedAt) || 0) > (Number(cur.updatedAt) || 0)) {
                currentMeta[k] = v;
                mergedChanged = true;
              }
            });
            if (mergedChanged) {
              inMemorySyncMetaCache = currentMeta;
              safeSetLocalItem(LOCAL_SYNC_META_KEY, JSON.stringify(currentMeta));
            }
          }
        } catch {}
        continue;
      }

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
      // Intentional empty arrays/objects ('[]', '{}') with a local timestamp must NEVER be treated as missing
      const isLocalTrulyMissing = localVal === null || localVal.trim() === '';
      const isLocalUnmarkedEmpty = (localVal === '[]' || localVal === '{}') && localMeta.updatedAt === 0 && !localMeta.pendingSync;
      const vaultHasData = item.value !== '[]' && item.value !== '{}' && item.value.trim() !== '';

      let valueToRestore = item.value;
      if (item.key === DELETED_RECORDS_KEY) {
        try {
          const mergedDeletes = mergeDeletedRecordsMaps(JSON.parse(item.value), getDeletedRecordsMap());
          valueToRestore = JSON.stringify(mergedDeletes);
        } catch {}
      }

      if ((isVaultNewer && localVal !== valueToRestore) || ((isLocalTrulyMissing || isLocalUnmarkedEmpty) && vaultHasData)) {
        isRemoteSyncing = true;
        try {
          safeSetLocalItem(item.key, valueToRestore);
        } finally {
          isRemoteSyncing = false;
        }
        setKeySyncMeta(item.key, item.updatedAt, item.pendingSync);
        safeDispatchStorageUpdate(item.key, valueToRestore);
        restoredAny = true;
      }
    }

    // Ensure any deleted classes/teachers/parents/students/grades in IndexedDB vault are stripped by tombstones
    pruneLocalCoreCollectionsByTombstones(getDeletedRecordsMap());

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
  options?: { timeoutMs?: number; markClearedIfEmpty?: boolean }
): Promise<boolean> {
  try {
    const valueString = key === 'school_evaluation_current_month'
      ? normalizeEvaluationMonthValue(data)
      : (typeof data === 'object' ? JSON.stringify(data) : String(data));
    const now = Date.now();
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const prevMeta = getKeySyncMeta(key);
    const waitTimeoutMs = options?.timeoutMs ?? 6000;

    const allowEmptyPush = initialLoadCompletedKeys.has(key) || Boolean(options?.markClearedIfEmpty);

    // 1. Skip redundant cloud write ONLY if identical value was genuinely confirmed on Firestore cloud
    if (!isOffline && db && !isFirestoreWriteQuotaExceeded() && !prevMeta.pendingSync && lastCloudConfirmedValues.get(key) === valueString) {
      safeSetLocalItem(key, valueString);
      safeDispatchStorageUpdate(key, valueString);
      broadcastLocalUpdate(key, valueString);
      pushLiveRelayKey(key, valueString, now, { allowEmpty: allowEmptyPush }).catch(() => {});
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
      allowEmpty: allowEmptyPush
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
    const writeBody: Record<string, any> = { data: cloudPayload, updatedAt: now };
    if (options?.markClearedIfEmpty && isDataEmpty(data)) {
      writeBody.clearedAt = now;
    }
    inFlightDirectWrites.set(key, valueString);

    const writePromise = writeFirestoreDocFast(
      'school_live_data',
      key,
      writeBody,
      { merge: true, sdkGraceMs: 1500, restTimeoutMs: 7500 }
    )
      .then(() => {
        if (inFlightDirectWrites.get(key) === valueString) {
          inFlightDirectWrites.delete(key);
        }
        if (inFlightWritePromises.get(key)?.promise === writePromise) {
          inFlightWritePromises.delete(key);
        }
        lastSyncedValues.set(key, valueString);
        lastCloudConfirmedValues.set(key, valueString);
        const latestMeta = getKeySyncMeta(key);
        if (latestMeta.updatedAt <= now || safeGetLocalItem(key) === valueString) {
          setKeySyncMeta(key, now, false);
        }
        markVaultKeySynced(key, now).catch(() => {});
        trackFirestoreWrite(1, `حفظ مباشر (${key})`);
        initialLoadCompletedKeys.add(key);
        markReadCacheFresh(`school_live_data:${key}`);
        notifyCrossDeviceKeyChanged(key);
        if (!isStudentOrParentPortal()) {
          advanceAdminDeltaSince(now);
          scheduleParentPulseUpdate(key, now);
        }

        if (key === 'school_students' && Array.isArray(data)) {
          syncStudentsDirectoryToFirestore(data).catch(() => {});
        } else if ((key === 'school_classes' || key === 'school_teachers') && !isStudentOrParentPortal()) {
          try {
            const rawStudents = safeGetLocalItem('school_students');
            if (rawStudents) {
              const parsedStudents = JSON.parse(rawStudents);
              if (Array.isArray(parsedStudents) && parsedStudents.length > 0) {
                syncStudentsDirectoryToFirestore(parsedStudents).catch(() => {});
              }
            }
          } catch {}
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
        if (lastCloudConfirmedValues.get(key) === raw) {
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
          const pendingWriteBody: Record<string, any> = { data: cloudPayload, updatedAt: now };
          if (isDataEmpty(cloudPayload) && initialLoadCompletedKeys.has(key)) {
            pendingWriteBody.clearedAt = now;
          }
          await writeFirestoreDocFast(
            'school_live_data',
            key,
            pendingWriteBody,
            { merge: true, sdkGraceMs: 1500, restTimeoutMs: 7500 }
          );
          if (inFlightDirectWrites.get(key) === raw) {
            inFlightDirectWrites.delete(key);
          }

          lastSyncedValues.set(key, raw);
          lastCloudConfirmedValues.set(key, raw);
          const latestMeta = getKeySyncMeta(key);
          if (latestMeta.updatedAt <= targetUpdatedAt || safeGetLocalItem(key) === raw) {
            setKeySyncMeta(key, now, false);
          }
          await markVaultKeySynced(key, now);
          trackFirestoreWrite(1, `مزامنة معلّقة (${key})`);
          notifyCrossDeviceKeyChanged(key);
          if (!isStudentOrParentPortal()) {
            advanceAdminDeltaSince(now);
            scheduleParentPulseUpdate(key, now);
          }
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
          try {
            safeSetLocalItem('school_students', str);
          } finally {
            isRemoteSyncing = false;
          }
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
      key === 'school_deleted_records' ||
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
            try {
              safeSetLocalItem(key, mergedStr);
            } finally {
              isRemoteSyncing = false;
            }
            safeDispatchStorageUpdate(key, mergedStr);
            broadcastLocalUpdate(key, mergedStr);
          }
          if (!isFirestoreWriteQuotaExceeded() && !fromCache) {
            const now = Math.max(Date.now(), localMeta.updatedAt);
            await setDoc(docRef, { data: prepareFirestorePayload(key, merged), updatedAt: now }, { merge: true });
            setKeySyncMeta(key, now, false);
            trackFirestoreWrite(1, `دمج ورفع تعديل محلي (${key})`);
            notifyCrossDeviceKeyChanged(key);
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
            notifyCrossDeviceKeyChanged(key);
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

    if (key === DELETED_RECORDS_KEY && payload && typeof payload === 'object') {
      const mergedDeletes = mergeDeletedRecordsMaps(payload, getDeletedRecordsMap());
      payload = mergedDeletes;
      pruneLocalCoreCollectionsByTombstones(mergedDeletes);
    }

    const isCollaborativeGradesKey =
      key === 'school_grades' ||
      key === 'school_sent_grade_sheets' ||
      key === 'school_monthly_evaluations';

    let localEffectiveParsed: any = null;
    if (localVal) {
      try {
        localEffectiveParsed = JSON.parse(localVal);
      } catch {
        localEffectiveParsed = localVal;
      }
    }
    if (key === 'school_parents' && Array.isArray(localEffectiveParsed)) {
      localEffectiveParsed = filterOutDeletedEntities('parents', localEffectiveParsed);
    } else if (key === 'school_teachers' && Array.isArray(localEffectiveParsed)) {
      localEffectiveParsed = filterOutDeletedEntities('teachers', localEffectiveParsed);
    } else if (key === 'school_classes' && Array.isArray(localEffectiveParsed)) {
      localEffectiveParsed = filterOutDeletedEntities('classes', localEffectiveParsed);
    } else if (key === 'school_students' && Array.isArray(localEffectiveParsed)) {
      localEffectiveParsed = filterOutDeletedEntities('students', localEffectiveParsed);
    } else if (key === 'school_sent_grade_sheets' && Array.isArray(localEffectiveParsed)) {
      localEffectiveParsed = filterOutDeletedMonthsFromSheets(localEffectiveParsed);
    } else if (key === 'school_grades' && Array.isArray(localEffectiveParsed)) {
      const deletedMonthsMap = getDeletedEvaluationMonthsMap();
      const deletedGradeMap = getDeletedRecordsMap().grades;
      localEffectiveParsed = localEffectiveParsed.filter((g: any) => {
        if (!g) return false;
        const ts = getGradeTimestampMs(g);
        const gid = g.id ? String(g.id).trim() : '';
        if (gid && deletedGradeMap[gid] && deletedGradeMap[gid] >= ts) return false;
        return !isItemDeletedByEvaluationMonth(g.examName, ts, deletedMonthsMap);
      });
    }

    let localHasRealData = false;
    if (localEffectiveParsed !== null && localEffectiveParsed !== undefined) {
      if (typeof localEffectiveParsed === 'string') {
        localHasRealData = localEffectiveParsed.trim().length > 0;
      } else {
        localHasRealData = !isDataEmpty(localEffectiveParsed);
      }
    }

    if (isCollaborativeGradesKey && !isDataEmpty(payload) && localHasRealData && localEffectiveParsed !== null) {
      const preferLocal = localMeta.updatedAt > remoteUpdatedAt;
      payload = mergePendingLocalWithRemote(key, payload, localEffectiveParsed, preferLocal);
    }

    if (key === 'school_sent_grade_sheets' && Array.isArray(payload)) {
      payload = filterOutDeletedMonthsFromSheets(deduplicateGradeSheetsPreservingTeachers(payload));
    }

    if (key === 'school_grades' && Array.isArray(payload)) {
      const deletedMonthsMap = getDeletedEvaluationMonthsMap();
      const deletedGradeMap = getDeletedRecordsMap().grades;
      payload = payload.filter((g: any) => {
        if (!g) return false;
        const ts = getGradeTimestampMs(g);
        const gid = g.id ? String(g.id).trim() : '';
        if (gid && deletedGradeMap[gid] && deletedGradeMap[gid] >= ts) return false;
        return !isItemDeletedByEvaluationMonth(g.examName, ts, deletedMonthsMap);
      });
    }

    if (key === 'school_students' && Array.isArray(payload)) {
      const localList: any[] = Array.isArray(localEffectiveParsed) ? localEffectiveParsed : [];
      const { merged, didRecoverLocal } = mergeLocalAndRemoteStudents(payload, localList, remoteUpdatedAt, localMeta);
      payload = [...merged].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
      if (!isStudentOrParentPortal() && payload.length > 0) {
        if (didRecoverLocal) {
          syncStudentsDirectoryToFirestore(payload).catch(() => {});
        } else {
          // Seed local directory signatures from server snapshot without re-writing 200+ unchanged student docs
          seedStudentsDirectorySignatures(payload).catch(() => {});
        }
      }
      if (didRecoverLocal && !isOffline && !isFirestoreWriteQuotaExceeded()) {
        const now = Date.now();
        await setDoc(docRef, { data: prepareFirestorePayload(key, payload), updatedAt: now }, { merge: true });
        setKeySyncMeta(key, now, false);
        trackFirestoreWrite(1, `دمج واستعادة الطلاب (${key})`);
      }
    }

    let remoteEntitiesStrippedByTombstone = false;
    if (key === 'school_parents' && Array.isArray(payload)) {
      const beforeLen = payload.length;
      payload = filterOutDeletedEntities('parents', payload);
      remoteEntitiesStrippedByTombstone = payload.length < beforeLen;
    }

    if (key === 'school_teachers' && Array.isArray(payload)) {
      const beforeLen = payload.length;
      payload = filterOutDeletedEntities('teachers', payload);
      remoteEntitiesStrippedByTombstone = payload.length < beforeLen;
    }

    if (key === 'school_classes' && Array.isArray(payload)) {
      const beforeLen = payload.length;
      payload = filterOutDeletedEntities('classes', payload);
      remoteEntitiesStrippedByTombstone = payload.length < beforeLen;
    }

    // If Firestore/Relay still contained deleted entities that are already tombstoned in school_deleted_records,
    // purge them from Firestore & Live Relay immediately so other devices never receive the deleted records again.
    if (
      remoteEntitiesStrippedByTombstone &&
      !fromCache &&
      !isOffline &&
      !isFirestoreWriteQuotaExceeded() &&
      !isStudentOrParentPortal() &&
      !localMeta.pendingSync
    ) {
      const cleanStr = JSON.stringify(payload);
      const cleanupSig = `${key}:${remoteUpdatedAt}:${cleanStr.length}`;
      if (!cleanedRemoteTombstoneSignatures.has(cleanupSig)) {
        cleanedRemoteTombstoneSignatures.add(cleanupSig);
        const cleanupNow = Math.max(Date.now(), remoteUpdatedAt + 1);
        const cleanupBody: Record<string, any> = { data: prepareFirestorePayload(key, payload), updatedAt: cleanupNow };
        if (isDataEmpty(payload)) cleanupBody.clearedAt = cleanupNow;
        writeFirestoreDocFast('school_live_data', key, cleanupBody, { merge: true, sdkGraceMs: 1500, restTimeoutMs: 6000 })
          .then(() => {
            trackFirestoreWrite(1, `تنظيف سجلات محذوفة (${key})`);
            pushLiveRelayKey(key, cleanStr, cleanupNow, { allowEmpty: true }).catch(() => {});
          })
          .catch(() => {});
      }
    }

    if (isDataEmpty(payload) && localHasRealData) {
      const protectedCoreKeys =
        key === 'school_students' ||
        key === 'school_teachers' ||
        key === 'school_classes' ||
        key === 'school_parents' ||
        key === 'school_grades' ||
        key === 'school_sent_grade_sheets' ||
        key === 'school_monthly_evaluations';
      const explicitClearedAt = Number(docData.clearedAt) || 0;
      const serverExplicitlyCleared =
        explicitClearedAt > 0 && (localMeta.updatedAt === 0 || explicitClearedAt >= localMeta.updatedAt);
      const serverIsIntentionalDelete =
        !fromCache &&
        !localMeta.pendingSync &&
        !remoteEntitiesStrippedByTombstone &&
        (
          serverExplicitlyCleared ||
          (remoteUpdatedAt > 0 && localMeta.updatedAt === 0) ||
          (localMeta.updatedAt > 0 && remoteUpdatedAt > localMeta.updatedAt + 1500 && !isCollaborativeGradesKey)
        );
      if (!remoteEntitiesStrippedByTombstone && !serverIsIntentionalDelete && (protectedCoreKeys || fromCache || !initialLoadCompletedKeys.has(key) || remoteUpdatedAt <= localMeta.updatedAt)) {
        console.warn(`[Fast Sync] Protected local key ${key} from being wiped out by empty remote.`);
        // Only upload local data back to Firestore if this device genuinely edited it (localMeta.updatedAt > 0),
        // NEVER upload seed/legacy cache (localMeta.updatedAt === 0) over a server document!
        if (!isOffline && !isFirestoreWriteQuotaExceeded() && !isStudentOrParentPortal() && protectedCoreKeys && !localMeta.pendingSync && localMeta.updatedAt > 0 && !fromCache) {
          await setDoc(docRef, { data: prepareFirestorePayload(key, localEffectiveParsed ?? localVal), updatedAt: Date.now() }, { merge: true });
          trackFirestoreWrite(1, `استعادة بيانات (${key})`);
        }
        initialLoadCompletedKeys.add(key);
        return;
      }
    }

    const valueString = key === 'school_evaluation_current_month'
      ? normalizeEvaluationMonthValue(payload)
      : (typeof payload === 'object'
        ? JSON.stringify(payload)
        : String(payload));

    if (localVal !== valueString) {
      isRemoteSyncing = true;
      try {
        safeSetLocalItem(key, valueString);
      } finally {
        isRemoteSyncing = false;
      }
      lastSyncedValues.set(key, valueString);
      if (!fromCache) {
        lastCloudConfirmedValues.set(key, valueString);
      }
      setKeySyncMeta(key, remoteUpdatedAt || Date.now(), false);
      saveToOfflineVault(key, valueString, remoteUpdatedAt || Date.now(), false).catch(() => {});

      safeDispatchStorageUpdate(key, valueString);
      broadcastLocalUpdate(key, valueString);
    } else if (!localMeta.pendingSync) {
      lastSyncedValues.set(key, valueString);
      if (!fromCache) {
        lastCloudConfirmedValues.set(key, valueString);
      }
      if (remoteUpdatedAt > 0) {
        setKeySyncMeta(key, remoteUpdatedAt, false);
      }
    }
    if ((key === 'school_saved_evaluation_months' || key === 'school_evaluation_saved_months') && Array.isArray(payload)) {
      const siblingKey = key === 'school_saved_evaluation_months'
        ? 'school_evaluation_saved_months'
        : 'school_saved_evaluation_months';
      const siblingMeta = getKeySyncMeta(siblingKey);
      if (!siblingMeta.pendingSync && safeGetLocalItem(siblingKey) !== valueString) {
        saveSyncedLocalOnly(siblingKey, valueString);
        safeDispatchStorageUpdate(siblingKey, valueString);
      }
    }
    initialLoadCompletedKeys.add(key);
    if (!fromCache && remoteUpdatedAt > 0) {
      if (isStudentOrParentPortal()) {
        if (PARENT_REALTIME_KEYS.includes(key)) {
          updateParentPulseKeysMap({ [key]: remoteUpdatedAt });
        }
      } else {
        advanceAdminDeltaSince(remoteUpdatedAt);
      }
    }
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
        const prioritySet = new Set(EVALUATION_CONFIG_KEYS);
        const priorityDocs: Array<{ id: string; data: any }> = [];
        const regularDocs: Array<{ id: string; data: any }> = [];
        colSnap.forEach((d) => {
          if (targetKeySet.has(d.id)) {
            if (!fromCache) markReadCacheFresh(`school_live_data:${d.id}`);
            if (prioritySet.has(d.id)) {
              priorityDocs.push({ id: d.id, data: d.data() });
            } else {
              regularDocs.push({ id: d.id, data: d.data() });
            }
          }
        });
        await Promise.all(priorityDocs.map((d) => applyDocPayload(d.id, d.data, fromCache)));
        await Promise.all(regularDocs.map((d) => applyDocPayload(d.id, d.data, fromCache)));
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
        let snapData: any = null;
        let docExists = false;
        let fromCache = false;
        try {
          const res = await getDocCacheFirst(docRef, {
            forceServer: effectiveForceServer,
            timeoutMs: effectiveForceServer ? 4500 : 2500
          });
          if (res.snap) {
            fromCache = res.fromCache;
            docExists = res.snap.exists();
            snapData = docExists ? res.snap.data() : null;
          }
        } catch (sdkErr: any) {
          if (isQuotaError(sdkErr)) throw sdkErr;
          fromCache = true;
        }

        // If forceServer was requested but SDK timed out / fell back to cache (common in Android WebView/VPN), fetch directly via REST
        if (effectiveForceServer && !isOffline && !isFirestoreReadQuotaExceeded() && (fromCache || !docExists)) {
          try {
            const restRes = await readDocViaRestApi('school_live_data', key, 5000);
            if (restRes.exists && restRes.data) {
              docExists = true;
              snapData = restRes.data;
              fromCache = false;
            } else if (!restRes.exists) {
              docExists = false;
              fromCache = false;
            }
          } catch (restErr: any) {
            if (isQuotaError(restErr)) throw restErr;
          }
        }

        if (!fromCache) {
          trackFirestoreRead(1, `مزامنة بيانات (${key})`);
          markReadCacheFresh(`school_live_data:${key}`);
        }
        if (docExists && snapData) {
          await applyDocPayload(key, snapData, fromCache);
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

    // Prioritize tiny critical config keys (like evaluation month) first before large collection payloads
    const evalSet = new Set(EVALUATION_CONFIG_KEYS);
    const prioritizedKeys = [
      ...targetKeys.filter((k) => evalSet.has(k)),
      ...targetKeys.filter((k) => !evalSet.has(k))
    ];

    const CHUNK_SIZE = 6;
    for (let i = 0; i < prioritizedKeys.length; i += CHUNK_SIZE) {
      const batch = prioritizedKeys.slice(i, i + CHUNK_SIZE);
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
  const localVal = safeGetLocalItem(key);
  const isMergeableKey =
    key === 'school_deleted_records' ||
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
  let keepPendingAfterApply = !!localMeta.pendingSync;

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
      if (serverIsClearlyNewer) {
        keepPendingAfterApply = false;
      }
    }
  }

  const isCollaborativeGradesKey =
    key === 'school_grades' ||
    key === 'school_sent_grade_sheets' ||
    key === 'school_monthly_evaluations';

  let localParsedObj: any = null;
  if (localVal) {
    try {
      localParsedObj = JSON.parse(localVal);
    } catch {
      localParsedObj = localVal;
    }
  }
  if (key === 'school_parents' && Array.isArray(localParsedObj)) {
    localParsedObj = filterOutDeletedEntities('parents', localParsedObj);
  } else if (key === 'school_teachers' && Array.isArray(localParsedObj)) {
    localParsedObj = filterOutDeletedEntities('teachers', localParsedObj);
  } else if (key === 'school_classes' && Array.isArray(localParsedObj)) {
    localParsedObj = filterOutDeletedEntities('classes', localParsedObj);
  } else if (key === 'school_students' && Array.isArray(localParsedObj)) {
    localParsedObj = filterOutDeletedEntities('students', localParsedObj);
  } else if (key === 'school_sent_grade_sheets' && Array.isArray(localParsedObj)) {
    localParsedObj = filterOutDeletedMonthsFromSheets(localParsedObj);
  } else if (key === 'school_grades' && Array.isArray(localParsedObj)) {
    const deletedMonthsMap = getDeletedEvaluationMonthsMap();
    const deletedGradeMap = getDeletedRecordsMap().grades;
    localParsedObj = localParsedObj.filter((g: any) => {
      if (!g) return false;
      const ts = getGradeTimestampMs(g);
      const gid = g.id ? String(g.id).trim() : '';
      if (gid && deletedGradeMap[gid] && deletedGradeMap[gid] >= ts) return false;
      return !isItemDeletedByEvaluationMonth(g.examName, ts, deletedMonthsMap);
    });
  }

  let localHasRealData = false;
  if (localParsedObj !== null && localParsedObj !== undefined) {
    if (typeof localParsedObj === 'string') {
      localHasRealData = localParsedObj.trim().length > 0;
    } else {
      localHasRealData = !isDataEmpty(localParsedObj);
    }
  }

  if (key === DELETED_RECORDS_KEY && payload && typeof payload === 'object') {
    const mergedDeletes = mergeDeletedRecordsMaps(payload, getDeletedRecordsMap());
    payload = mergedDeletes;
    pruneLocalCoreCollectionsByTombstones(mergedDeletes);
  }

  if (!localMeta.pendingSync && isCollaborativeGradesKey && !isDataEmpty(payload) && localHasRealData && localParsedObj !== null) {
    const preferLocal = localMeta.updatedAt > remoteUpdatedAt;
    payload = mergePendingLocalWithRemote(key, payload, localParsedObj, preferLocal);
  }

  if (key === 'school_sent_grade_sheets' && Array.isArray(payload)) {
    payload = filterOutDeletedMonthsFromSheets(deduplicateGradeSheetsPreservingTeachers(payload));
  }

  if (key === 'school_grades' && Array.isArray(payload)) {
    const deletedMonthsMap = getDeletedEvaluationMonthsMap();
    const deletedGradeMap = getDeletedRecordsMap().grades;
    payload = payload.filter((g: any) => {
      if (!g) return false;
      const ts = getGradeTimestampMs(g);
      const gid = g.id ? String(g.id).trim() : '';
      if (gid && deletedGradeMap[gid] && deletedGradeMap[gid] >= ts) return false;
      return !isItemDeletedByEvaluationMonth(g.examName, ts, deletedMonthsMap);
    });
  }

  if (key === 'school_students' && Array.isArray(payload)) {
    const localList: any[] = Array.isArray(localParsedObj) ? localParsedObj : [];
    const { merged } = mergeLocalAndRemoteStudents(payload, localList, remoteUpdatedAt, localMeta);
    payload = [...merged].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  }

  let remoteEntitiesStrippedByTombstone = false;
  if (key === 'school_parents' && Array.isArray(payload)) {
    const beforeLen = payload.length;
    payload = filterOutDeletedEntities('parents', payload);
    remoteEntitiesStrippedByTombstone = payload.length < beforeLen;
  }
  if (key === 'school_teachers' && Array.isArray(payload)) {
    const beforeLen = payload.length;
    payload = filterOutDeletedEntities('teachers', payload);
    remoteEntitiesStrippedByTombstone = payload.length < beforeLen;
  }
  if (key === 'school_classes' && Array.isArray(payload)) {
    const beforeLen = payload.length;
    payload = filterOutDeletedEntities('classes', payload);
    remoteEntitiesStrippedByTombstone = payload.length < beforeLen;
  }

  if (
    remoteEntitiesStrippedByTombstone &&
    !fromCache &&
    db &&
    typeof navigator !== 'undefined' &&
    navigator.onLine !== false &&
    !isFirestoreWriteQuotaExceeded() &&
    !isStudentOrParentPortal() &&
    !localMeta.pendingSync
  ) {
    const cleanStr = JSON.stringify(payload);
    const cleanupSig = `${key}:${remoteUpdatedAt}:${cleanStr.length}`;
    if (!cleanedRemoteTombstoneSignatures.has(cleanupSig)) {
      cleanedRemoteTombstoneSignatures.add(cleanupSig);
      const cleanupNow = Math.max(Date.now(), remoteUpdatedAt + 1);
      const cleanupBody: Record<string, any> = { data: prepareFirestorePayload(key, payload), updatedAt: cleanupNow };
      if (isDataEmpty(payload)) cleanupBody.clearedAt = cleanupNow;
      writeFirestoreDocFast('school_live_data', key, cleanupBody, { merge: true, sdkGraceMs: 1500, restTimeoutMs: 6000 })
        .then(() => {
          trackFirestoreWrite(1, `تنظيف سجلات محذوفة (${key})`);
          pushLiveRelayKey(key, cleanStr, cleanupNow, { allowEmpty: true }).catch(() => {});
        })
        .catch(() => {});
    }
  }

  if (isDataEmpty(payload) && localHasRealData) {
    const protectedCoreKeys =
      key === 'school_students' ||
      key === 'school_teachers' ||
      key === 'school_classes' ||
      key === 'school_parents' ||
      key === 'school_grades' ||
      key === 'school_sent_grade_sheets' ||
      key === 'school_monthly_evaluations';
    const explicitClearedAt = Number(docData.clearedAt) || 0;
    const serverExplicitlyCleared =
      explicitClearedAt > 0 && (localMeta.updatedAt === 0 || explicitClearedAt >= localMeta.updatedAt);
    const serverIsIntentionalDelete =
      !fromCache &&
      !localMeta.pendingSync &&
      !remoteEntitiesStrippedByTombstone &&
      (
        serverExplicitlyCleared ||
        (remoteUpdatedAt > 0 && localMeta.updatedAt === 0) ||
        (localMeta.updatedAt > 0 && remoteUpdatedAt > localMeta.updatedAt + 1500 && !isCollaborativeGradesKey)
      );
    if (!remoteEntitiesStrippedByTombstone && !serverIsIntentionalDelete && (protectedCoreKeys || fromCache || !initialLoadCompletedKeys.has(key) || remoteUpdatedAt <= localMeta.updatedAt)) {
      initialLoadCompletedKeys.add(key);
      return;
    }
  }

  const valueString = key === 'school_evaluation_current_month'
    ? normalizeEvaluationMonthValue(payload)
    : (typeof payload === 'object'
      ? JSON.stringify(payload)
      : String(payload));

  if (!keepPendingAfterApply) {
    lastSyncedValues.set(key, valueString);
    if (!fromCache) {
      lastCloudConfirmedValues.set(key, valueString);
    }
  }

  if (localVal !== valueString) {
    isRemoteSyncing = true;
    try {
      safeSetLocalItem(key, valueString);
    } finally {
      isRemoteSyncing = false;
    }
    setKeySyncMeta(key, remoteUpdatedAt || Date.now(), keepPendingAfterApply);
    saveToOfflineVault(key, valueString, remoteUpdatedAt || Date.now(), keepPendingAfterApply).catch(() => {});

    // Dispatch custom window event immediately so React states update without delay
    safeDispatchStorageUpdate(key, valueString);
    broadcastLocalUpdate(key, valueString);
  } else if (keepPendingAfterApply !== !!localMeta.pendingSync) {
    setKeySyncMeta(key, remoteUpdatedAt || Date.now(), keepPendingAfterApply);
  }
  if ((key === 'school_saved_evaluation_months' || key === 'school_evaluation_saved_months') && Array.isArray(payload)) {
    const siblingKey = key === 'school_saved_evaluation_months'
      ? 'school_evaluation_saved_months'
      : 'school_saved_evaluation_months';
    const siblingMeta = getKeySyncMeta(siblingKey);
    if (!siblingMeta.pendingSync && safeGetLocalItem(siblingKey) !== valueString) {
      saveSyncedLocalOnly(siblingKey, valueString);
      safeDispatchStorageUpdate(siblingKey, valueString);
    }
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
  if (isStudentOrParentPortal()) {
    stopSchoolLiveDataCollectionListener();
    startParentScopedRealtimeListeners();
  } else {
    stopParentScopedRealtimeListeners();
    startSchoolLiveDataCollectionListener();
  }
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
 * Ensures full sync key registry and live Firestore collection stream are active for Director/Teacher portals.
 */
export function ensureAllRealtimeListeners() {
  stopParentScopedRealtimeListeners();
  attachRealtimeListenersForKeys(SYNC_KEYS);
  startSchoolLiveDataCollectionListener();
}

/**
 * Ensures Parent/Student scoped public config keys and targeted live stream are active without reading private bulk docs.
 */
export function ensureParentRealtimeListeners() {
  stopSchoolLiveDataCollectionListener();
  attachRealtimeListenersForKeys(PARENT_REALTIME_KEYS);
  startParentScopedRealtimeListeners();
}

let lastLiveServerSyncAt = 0;
let activeLiveSyncPromise: Promise<boolean> | null = null;
let lastEvalMonthConfigSyncAt = 0;
let activeEvalMonthConfigPromise: Promise<boolean> | null = null;

/**
 * Lightweight, ultra-fast server sync for evaluation month & saved months list ONLY (<1KB docs).
 * Uses SDK getDocFromServer with direct REST GET fallback so Android APK / WebView behind VPN
 * always stays matched with the Desktop Director browser immediately on open, resume, or reconnect.
 */
export async function syncEvaluationMonthConfigFromServer(options?: {
  force?: boolean;
  minCooldownMs?: number;
}): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (!db || isFirestoreReadQuotaExceeded()) return false;

  const now = Date.now();
  const cooldown = options?.force ? 0 : (options?.minCooldownMs ?? 4000);
  if (now - lastEvalMonthConfigSyncAt < cooldown) {
    return true;
  }
  if (activeEvalMonthConfigPromise && !options?.force) {
    return activeEvalMonthConfigPromise;
  }

  lastEvalMonthConfigSyncAt = now;
  activeEvalMonthConfigPromise = (async () => {
    let anyChanged = false;
    try {
      if (!isFirestoreWriteQuotaExceeded()) {
        const metaMap = loadLocalSyncMeta();
        const hasPendingEvalKey = EVALUATION_CONFIG_KEYS.some((k) => metaMap[k]?.pendingSync);
        if (hasPendingEvalKey) {
          await flushPendingLocalSyncKeys().catch(() => false);
        }
      }

      await Promise.all(
        EVALUATION_CONFIG_KEYS.map(async (key) => {
          if (isFirestoreReadQuotaExceeded()) return;
          let docData: any = null;
          let fromCache = false;
          try {
            const res = await getDocCacheFirst(doc(db, 'school_live_data', key), {
              forceServer: true,
              timeoutMs: 3000
            });
            if (res.snap && res.snap.exists() && !res.fromCache) {
              docData = res.snap.data();
            } else {
              fromCache = true;
            }
          } catch (sdkErr: any) {
            if (isQuotaError(sdkErr)) {
              markFirestoreReadQuotaExceeded(sdkErr);
              return;
            }
            fromCache = true;
          }

          if (fromCache || !docData) {
            try {
              const restRes = await readDocViaRestApi('school_live_data', key, 4000);
              if (restRes.exists && restRes.data) {
                docData = restRes.data;
              } else {
                return;
              }
            } catch (restErr: any) {
              if (isQuotaError(restErr)) markFirestoreReadQuotaExceeded(restErr);
              return;
            }
          }

          trackFirestoreRead(1, `مزامنة شهر التقييم (${key})`);
          markReadCacheFresh(`school_live_data:${key}`);
          const prevLocal = safeGetLocalItem(key);
          processRemoteSnapshotDoc(key, docData, false);
          if (safeGetLocalItem(key) !== prevLocal) {
            anyChanged = true;
          }
        })
      );

      if (anyChanged && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('school_live_sync_completed', {
          detail: { ok: true, ts: Date.now(), source: 'evaluation_month_sync' }
        }));
      }
      return true;
    } catch {
      return false;
    } finally {
      activeEvalMonthConfigPromise = null;
    }
  })();

  return activeEvalMonthConfigPromise;
}

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

  // Request persistent storage & hydrate IndexedDB cache + delta watermarks BEFORE attaching Firestore delta listeners
  requestPersistentStorage().catch(() => {});
  hydrateFromOfflineVault()
    .catch(() => false)
    .then(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine !== false && !isFirestoreWriteQuotaExceeded()) {
        flushPendingLocalSyncKeys().catch(() => {});
      }

      // Always connect instant Live Relay SSE channel across all three portals (0 Firestore reads!)
      startLiveRelayClient(({ key, value, updatedAt, fromLiveSse }) => {
        applyRelayKeyUpdate(key, value, updatedAt, !!fromLiveSse);
      });

      if (isStudentOrParentPortal()) {
        stopSchoolLiveDataCollectionListener();
        attachRealtimeListenersForKeys(PARENT_REALTIME_KEYS);
        startParentScopedRealtimeListeners();
        return;
      }

      stopParentScopedRealtimeListeners();
      attachRealtimeListenersForKeys(SYNC_KEYS);
      startSchoolLiveDataCollectionListener();
    });
}

export function setupFirebaseSync(options?: { deferNetwork?: boolean }) {
  if (setupInitialized) return;
  setupInitialized = true;

  if (typeof window !== 'undefined') {
    let lastHiddenAt = 0;
    let lastRestoreSyncAt = 0;
    let wentOffline = false;

    const handleForegroundOrNetworkRestore = (source: 'online' | 'resume') => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const now = Date.now();
      if (now - lastRestoreSyncAt < 3000) return;
      lastRestoreSyncAt = now;

      const hiddenDuration = lastHiddenAt > 0 ? now - lastHiddenAt : 0;
      const isLongSleepOrReconnect = source === 'online' || hiddenDuration >= 60000;
      if (source === 'resume') {
        lastHiddenAt = 0;
      }

      if (db && (source === 'online' || wentOffline)) {
        wentOffline = false;
        enableNetwork(db).catch(() => {});
      }

      // Only recycle onSnapshot after genuine offline reconnect or >=60s sleep; restarting onSnapshot already fetches server state
      let recycledListeners = false;
      if (isLongSleepOrReconnect) {
        if (schoolLiveDataColUnsubscribe || parentScopedUnsubscribes.length > 0) {
          stopSchoolLiveDataCollectionListener();
          stopParentScopedRealtimeListeners();
          recycledListeners = true;
        }
      }

      emitOfflineSyncStatus();
      ensureRealtimeSyncHealthy();
      if (!isFirestoreWriteQuotaExceeded()) {
        flushPendingLocalSyncKeys().catch(() => {});
      }
      // Live Relay SSE snapshot is served from local Node memory (0 Firestore reads)
      fetchLiveRelaySnapshot().catch(() => {});

      const listenerIsActive = Boolean(schoolLiveDataColUnsubscribe) || parentScopedUnsubscribes.length > 0;
      if (isLongSleepOrReconnect && !recycledListeners && !listenerIsActive) {
        syncEvaluationMonthConfigFromServer({ minCooldownMs: 60000 }).catch(() => {});
        syncLivePortalDataFromServer({ forceServer: true }).catch(() => {});
      }

      window.dispatchEvent(new CustomEvent('school_app_resumed', {
        detail: { source, forceRefresh: isLongSleepOrReconnect && !listenerIsActive, ts: now }
      }));
    };

    window.addEventListener('online', () => {
      handleForegroundOrNetworkRestore('online');
    });
    window.addEventListener('offline', () => {
      wentOffline = true;
      emitOfflineSyncStatus();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAt = Date.now();
      } else if (document.visibilityState === 'visible') {
        handleForegroundOrNetworkRestore('resume');
      }
    });
    window.addEventListener('pageshow', () => {
      handleForegroundOrNetworkRestore('resume');
    });
    window.addEventListener('focus', () => {
      handleForegroundOrNetworkRestore('resume');
    });

    window.addEventListener('firestore_quota_status_changed', (evt: Event) => {
      const detail = (evt as CustomEvent<{ exceeded?: boolean }>)?.detail;
      if (detail?.exceeded === false && navigator.onLine !== false) {
        flushPendingLocalSyncKeys().catch(() => {});
      }
    });

    // Keep live relay + Firestore listeners healthy while app stays open without idle polling reads
    setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        ensureRealtimeSyncHealthy();
        fetchLiveRelaySnapshot().catch(() => {});
        if (!isFirestoreWriteQuotaExceeded() && getOfflineSyncStatus().pendingCount > 0) {
          flushPendingLocalSyncKeys().catch(() => {});
        }
        // Only fall back to manual config fetch if no Firestore realtime listener is attached
        const hasActiveListener = Boolean(schoolLiveDataColUnsubscribe) || parentScopedUnsubscribes.length > 0;
        if (!hasActiveListener && Date.now() - lastRealtimeServerEventAt > 300000) {
          syncEvaluationMonthConfigFromServer({ minCooldownMs: 300000 }).catch(() => {});
        }
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
            const cloudPayload = prepareFirestorePayload(key, parsedData);
            inFlightDirectWrites.set(key, targetValue);
            const interceptorBody: Record<string, any> = { data: cloudPayload, updatedAt: ts };
            if (isDataEmpty(cloudPayload) && initialLoadCompletedKeys.has(key)) {
              interceptorBody.clearedAt = ts;
            }
            const interceptorPromise = writeFirestoreDocFast(
              'school_live_data',
              key,
              interceptorBody,
              { merge: true, sdkGraceMs: 1500, restTimeoutMs: 7500 }
            ).then(() => {
              if (inFlightDirectWrites.get(key) === targetValue) {
                inFlightDirectWrites.delete(key);
              }
              if (inFlightWritePromises.get(key)?.promise === interceptorPromise) {
                inFlightWritePromises.delete(key);
              }
              lastSyncedValues.set(key, targetValue);
              lastCloudConfirmedValues.set(key, targetValue);
              const latestMeta = getKeySyncMeta(key);
              if (latestMeta.updatedAt <= ts || safeGetLocalItem(key) === targetValue) {
                setKeySyncMeta(key, ts, false);
              }
              markVaultKeySynced(key, ts).catch(() => {});
              trackFirestoreWrite(1, `تحديث تلقائي (${key})`);
              initialLoadCompletedKeys.add(key);
              markReadCacheFresh(`school_live_data:${key}`);
              notifyCrossDeviceKeyChanged(key);
              if (!isStudentOrParentPortal()) {
                advanceAdminDeltaSince(ts);
                scheduleParentPulseUpdate(key, ts);
              }
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
    lastCloudConfirmedValues.delete(key);
    originalRemoveItem(key);
  };

  if (!options?.deferNetwork) {
    startDeferredFirebaseSync();
  }
}

/**
 * Fully resets school_live_data documents in Firestore, Live Relay, IndexedDB Vault, and localStorage
 * for a complete platform reset ("تصفير كامل المنصة") without re-triggering seed data or leaving orphaned docs.
 */
export async function resetAllSchoolLiveDataInCloudAndLocal(emptyDefaults: Record<string, any>): Promise<boolean> {
  const now = Date.now();

  debouncedCloudWriteTimers.forEach((timer) => clearTimeout(timer));
  debouncedCloudWriteTimers.clear();
  inFlightDirectWrites.clear();
  inFlightWritePromises.clear();
  localUpdateTimestamps.clear();

  const keys = Object.keys(emptyDefaults);
  await clearEntireOfflineVault().catch(() => {});

  isRemoteSyncing = true;
  try {
    originalRemoveItem('school_local_sync_meta');
    originalRemoveItem(DELETED_STUDENTS_KEY);
    originalRemoveItem(ADMIN_DELTA_SINCE_KEY);
    originalRemoveItem(PARENT_PULSE_KEYS_MAP_KEY);
    inMemorySyncMetaCache = {};
    lastCloudConfirmedValues.clear();
    keys.forEach((k) => {
      const valStr = typeof emptyDefaults[k] === 'object' ? JSON.stringify(emptyDefaults[k]) : String(emptyDefaults[k]);
      safeSetLocalItem(k, valStr);
      lastSyncedValues.set(k, valStr);
      lastCloudConfirmedValues.set(k, valStr);
      setKeySyncMeta(k, now, false);
      initialLoadCompletedKeys.add(k);
      invalidateReadCache(`school_live_data:${k}`);
      safeDispatchStorageUpdate(k, valStr);
      broadcastLocalUpdate(k, valStr);
    });
    safeSetLocalItem('school_seed_applied_v1', '1');
  } finally {
    isRemoteSyncing = false;
  }

  // Push empty state via Live Relay immediately
  await Promise.allSettled(
    keys.map((k) => {
      const valStr = typeof emptyDefaults[k] === 'object' ? JSON.stringify(emptyDefaults[k]) : String(emptyDefaults[k]);
      return pushLiveRelayKey(k, valStr, now, { allowEmpty: true });
    })
  );

  if (!db || isFirestoreWriteQuotaExceeded() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return false;
  }

  let ok = true;
  for (let i = 0; i < keys.length; i += 400) {
    const chunk = keys.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach((k) => {
      batch.set(doc(db, 'school_live_data', k), { data: emptyDefaults[k], updatedAt: now, clearedAt: now }, { merge: true });
    });
    let committed = false;
    try {
      await Promise.race([
        batch.commit().then(() => { committed = true; }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('batch_timeout')), 3000))
      ]);
    } catch (err: any) {
      if (!committed) {
        if (isQuotaError(err)) {
          markFirestoreWriteQuotaExceeded(err);
          return false;
        }
        try {
          await commitFirestoreBatchViaRest(
            chunk.map((k) => ({
              collectionName: 'school_live_data',
              docId: k,
              data: { data: emptyDefaults[k], updatedAt: now, clearedAt: now },
              merge: true
            })),
            9000
          );
          committed = true;
        } catch (restErr: any) {
          if (isQuotaError(restErr)) markFirestoreWriteQuotaExceeded(restErr);
          ok = false;
        }
      }
    }
    if (committed) {
      trackFirestoreWrite(chunk.length, `تصفير وثائق السحابة (${chunk.length})`);
    }
  }
  return ok;
}

