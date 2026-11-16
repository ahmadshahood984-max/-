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
import { seedGradesToStudentCollection, syncSentGradeSheetsToConsolidatedCollection } from './studentGradesQuery';

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

// Custom event name
export const STORAGE_UPDATE_EVENT = 'school_storage_update';

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

// Keep reference to original methods
const originalSetItem = localStorage.setItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);

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
 * Directly writes and persists data to both Firestore and localStorage immediately
 * Guarantees data remains saved even after closing the application, and broadcasts to all clients.
 */
export async function persistDirectToFirestore(key: string, data: any): Promise<boolean> {
  try {
    const valueString = typeof data === 'object' ? JSON.stringify(data) : String(data);
    const now = Date.now();
    localUpdateTimestamps.set(key, now);

    originalSetItem(key, valueString);
    
    safeDispatchStorageUpdate(key, valueString);
    broadcastLocalUpdate(key, valueString);

    if (db && !isFirestoreQuotaExceeded()) {
      const docRef = doc(db, 'school_live_data', key);
      try {
        await setDoc(docRef, { data, updatedAt: now }, { merge: true });
        trackFirestoreWrite(1, `حفظ مباشر (${key})`);
        initialLoadCompletedKeys.add(key);

        // When grades are persisted, sync to student_grades collection for on-demand student queries
        if (key === 'school_grades' && Array.isArray(data)) {
          seedGradesToStudentCollection(data).catch(() => {});
        }
      } catch (writeErr: any) {
        if (isQuotaError(writeErr)) {
          markFirestoreQuotaExceeded(writeErr);
        } else {
          console.warn(`Key ${key} direct write notice:`, writeErr?.message || writeErr);
        }
      }
    }
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
 * Uses IndexedDB cache first by default (0 server reads on reopen).
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
        const clean = sanitizeAndDeduplicateStudents(docData.data);
        const str = JSON.stringify(clean);
        originalSetItem('school_students', str);
        initialLoadCompletedKeys.add('school_students');
        safeDispatchStorageUpdate('school_students', str);
        broadcastLocalUpdate('school_students', str);
        return clean;
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
 * (0 server reads for already-cached documents) and skips full SYNC_KEYS scan for Student/Parent sessions.
 * Pass `{ forceServer: true }` on manual user sync buttons to fetch fresh server updates.
 */
export async function forceRefreshDataFromFirestore(options?: { forceServer?: boolean }): Promise<boolean> {
  const forceServer = options?.forceServer ?? false;
  if (!db) return false;
  if (forceServer && isFirestoreQuotaExceeded()) return false;

  // CRITICAL QUOTA SAVER: Student/Parent portals never pull all 26 admin keys on startup.
  if (!forceServer && isStudentOrParentPortal()) {
    return true;
  }

  const effectiveForceServer = isFirestoreQuotaExceeded() ? false : forceServer;

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
            let payload = docData.data;
            if (key === 'school_students' && Array.isArray(payload)) {
              payload = sanitizeAndDeduplicateStudents(payload);
            }
            if (key === 'school_teachers' && Array.isArray(payload)) {
              try {
                const localStr = localStorage.getItem('school_teachers');
                const localList = localStr ? JSON.parse(localStr) : null;
                if (Array.isArray(localList) && localList.length > payload.length) {
                  const remoteIds = new Set(payload.map((t: any) => t.id));
                  const newLocal = localList.filter((t: any) => t.id && !remoteIds.has(t.id));
                  if (newLocal.length > 0 && !isFirestoreQuotaExceeded()) {
                    payload = [...payload, ...newLocal];
                    await setDoc(docRef, { data: payload, updatedAt: Date.now() }, { merge: true });
                    trackFirestoreWrite(1, `تحديث المعلمين (${key})`);
                  }
                }
              } catch {}
            }
            if (key === 'school_classes' && Array.isArray(payload)) {
              try {
                const localStr = localStorage.getItem('school_classes');
                const localList = localStr ? JSON.parse(localStr) : null;
                if (Array.isArray(localList) && localList.length > payload.length) {
                  const remoteIds = new Set(payload.map((c: any) => c.id));
                  const newLocal = localList.filter((c: any) => c.id && !remoteIds.has(c.id));
                  if (newLocal.length > 0 && !isFirestoreQuotaExceeded()) {
                    payload = [...payload, ...newLocal];
                    await setDoc(docRef, { data: payload, updatedAt: Date.now() }, { merge: true });
                    trackFirestoreWrite(1, `تحديث الصفوف (${key})`);
                  }
                }
              } catch {}
            }

            // Anti-wipe safeguard: Never overwrite valid local non-empty data with an empty remote document!
            const localVal = localStorage.getItem(key);
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
              if (!isFirestoreQuotaExceeded()) {
                await setDoc(docRef, { data: localParsed ?? localVal, updatedAt: Date.now() }, { merge: true });
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
              originalSetItem(key, valueString);
              isRemoteSyncing = false;

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
  if (isFirestoreQuotaExceeded()) {
    console.log('[Firestore Sync] Quota limit is active; running in pure offline / broadcast local mode.');
    return;
  }

  console.log('Initializing Firebase real-time database synchronization with anti-wipe protection...');

  // 1. Intercept localStorage.setItem
  localStorage.setItem = (key: string, value: string) => {
    const prevValue = localStorage.getItem(key);
    originalSetItem(key, value);

    if (SYNC_KEYS.includes(key) && !isRemoteSyncing) {
      const now = Date.now();
      localUpdateTimestamps.set(key, now);

      // If quota already exceeded, keep tabs synced via BroadcastChannel without remote Firestore call
      if (isFirestoreQuotaExceeded()) {
        broadcastLocalUpdate(key, value);
        return;
      }

      // CRITICAL SAFEGUARD:
      // If the value being written is empty ("[]", "{}", "") and initial remote load hasn't arrived yet,
      // DO NOT push empty defaults to Firestore! This completely prevents uninitialized browser tabs
      // from zeroing the database.
      if (!initialLoadCompletedKeys.has(key) && (value === '[]' || value === '{}' || value.trim() === '')) {
        console.log(`[Firestore Sync] Safeguard: Skipping push of empty default for ${key} during startup.`);
        return;
      }

      if (prevValue === value) {
        // Redundant write, skip network call
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
          setDoc(docRef, { data: parsedData, updatedAt: now }, { merge: true }).then(() => {
            trackFirestoreWrite(1, `تحديث تلقائي (${key})`);
            initialLoadCompletedKeys.add(key);
          }).catch(err => {
            if (isQuotaError(err)) {
              markFirestoreQuotaExceeded(err);
            } else {
              console.warn(`Notice writing key ${key} to Firestore:`, err?.message || err);
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
    originalRemoveItem(key);
  };

  // 3. Set up Firestore Real-time Listeners
  // CRITICAL QUOTA & CONNECTION SAFEGUARD:
  // Completely CANCEL onSnapshot listeners for Student and Parent portals!
  // Students and parents fetch on-demand only (getDocs / getDoc) scoped to their ID.
  // This completely eliminates open real-time connections from students,
  // freeing up Firebase quotas and allowing the Director & Teachers to send and manage grades smoothly.
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
        if (!snapshot.metadata?.fromCache) {
          trackFirestoreRead(1, `استماع فوري (${key})`);
        }
        if (snapshot.exists()) {
          const docData = snapshot.data();
          if (docData && docData.data !== undefined) {
            let payload = docData.data;
            if (key === 'school_students' && Array.isArray(payload)) {
              payload = sanitizeAndDeduplicateStudents(payload);
            }

            const remoteUpdatedAt = Number(docData.updatedAt) || 0;
            const localUpdatedAt = localUpdateTimestamps.get(key) || 0;

            // SAFEGUARD 1: If user recently edited this key locally (< 10s ago) and local is newer than snapshot,
            // do not let the snapshot overwrite the user's current local typing session
            if (localUpdatedAt > remoteUpdatedAt && (Date.now() - localUpdatedAt < 10000)) {
              initialLoadCompletedKeys.add(key);
              return;
            }

            // SAFEGUARD 2: Anti-wipe. If remote snapshot contains empty data (e.g. wiped [] or null),
            // but local storage currently has real populated data, do not overwrite local data.
            // Note: We do NOT write back to Firestore here to avoid ping-pong write loops.
            const localVal = localStorage.getItem(key);
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
              originalSetItem(key, valueString);
              isRemoteSyncing = false;

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
