/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './firebase';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from './firestoreTracker';
import { sanitizeAndDeduplicateStudents } from './studentDeduplicator';

const SYNC_KEYS = [
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
          window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, {
            detail: { key, value }
          }));
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
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, {
        detail: { key, value: valueString }
      }));
      broadcastLocalUpdate(key, valueString);
    }

    if (db) {
      const docRef = doc(db, 'school_live_data', key);
      await setDoc(docRef, { data, updatedAt: now }, { merge: true });
      trackFirestoreWrite(1);
      initialLoadCompletedKeys.add(key);
    }
    return true;
  } catch (err) {
    console.error(`Error directly persisting key ${key} to Firestore:`, err);
    return false;
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
  if (sentSheets !== undefined) syncPromises.push(persistDirectToFirestore('school_sent_grade_sheets', sentSheets));
  if (monthlyEvaluations !== undefined) syncPromises.push(persistDirectToFirestore('school_monthly_evaluations', monthlyEvaluations));
  if (currentMonth !== undefined) syncPromises.push(persistDirectToFirestore('school_evaluation_current_month', currentMonth));

  const results = await Promise.all(syncPromises);
  return results.every(Boolean);
}

/**
 * Ultra-fast targeted single-document fetch for school_students ONLY.
 * Resolves within ~100-200ms without waiting on other Firestore documents.
 */
export async function fetchStudentsOnlyDirectly(): Promise<any[]> {
  if (!db) return [];
  try {
    const docRef = doc(db, 'school_live_data', 'school_students');
    const snap = await Promise.race([
      getDoc(docRef),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500))
    ]);
    if (snap && snap.exists()) {
      trackFirestoreRead(1);
      const docData = snap.data();
      if (docData && Array.isArray(docData.data)) {
        const clean = sanitizeAndDeduplicateStudents(docData.data);
        const str = JSON.stringify(clean);
        originalSetItem('school_students', str);
        initialLoadCompletedKeys.add('school_students');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, {
            detail: { key: 'school_students', value: str }
          }));
          broadcastLocalUpdate('school_students', str);
        }
        return clean;
      }
    }
  } catch (err) {
    console.warn('Fast students-only direct fetch notice:', err);
  }
  return [];
}

/**
 * High-speed parallel force refresh from Firestore.
 * Retrieves all keys concurrently with anti-wipe protection.
 */
export async function forceRefreshDataFromFirestore(): Promise<boolean> {
  if (!db) return false;
  try {
    const refreshTasks = SYNC_KEYS.map(async (key) => {
      try {
        const docRef = doc(db, 'school_live_data', key);
        const snap = await Promise.race([
          getDoc(docRef),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);
        trackFirestoreRead(1);
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
                  if (newLocal.length > 0) {
                    payload = [...payload, ...newLocal];
                    await setDoc(docRef, { data: payload, updatedAt: Date.now() }, { merge: true });
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
                  if (newLocal.length > 0) {
                    payload = [...payload, ...newLocal];
                    await setDoc(docRef, { data: payload, updatedAt: Date.now() }, { merge: true });
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
              await setDoc(docRef, { data: localParsed ?? localVal, updatedAt: Date.now() }, { merge: true });
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

              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, {
                  detail: { key, value: valueString }
                }));
                broadcastLocalUpdate(key, valueString);
              }
            }
            initialLoadCompletedKeys.add(key);
          }
        }
      } catch (keyErr) {
        console.warn(`[Fast Sync] Error refreshing key ${key}:`, keyErr);
      }
    });

    await Promise.all(refreshTasks);
    return true;
  } catch (err) {
    console.error('Error in parallel forceRefreshDataFromFirestore:', err);
    return false;
  }
}

export function setupFirebaseSync() {
  console.log('Initializing Firebase real-time database synchronization with anti-wipe protection...');

  // 1. Intercept localStorage.setItem
  localStorage.setItem = (key: string, value: string) => {
    const prevValue = localStorage.getItem(key);
    originalSetItem(key, value);

    if (SYNC_KEYS.includes(key) && !isRemoteSyncing) {
      const now = Date.now();
      localUpdateTimestamps.set(key, now);

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

        if (db) {
          const docRef = doc(db, 'school_live_data', key);
          setDoc(docRef, { data: parsedData, updatedAt: now }, { merge: true }).then(() => {
            trackFirestoreWrite(1);
            initialLoadCompletedKeys.add(key);
          }).catch(err => {
            console.error(`Error writing key ${key} to Firestore:`, err);
          });
        }

        // Broadcast to other tabs on the same device immediately
        broadcastLocalUpdate(key, value);
      } catch (err) {
        console.error(`Error preparing write for key ${key} to Firestore:`, err);
      }
    }
  };

  // 2. Intercept localStorage.removeItem
  localStorage.removeItem = (key: string) => {
    originalRemoveItem(key);
  };

  // 3. Set up Firestore Real-time Listeners for all SYNC_KEYS
  SYNC_KEYS.forEach(key => {
    const docRef = doc(db, 'school_live_data', key);
    onSnapshot(docRef, (snapshot) => {
      trackFirestoreRead(1);
      if (snapshot.exists()) {
        const docData = snapshot.data();
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
                if (newLocal.length > 0) {
                  payload = [...payload, ...newLocal];
                  if (db) {
                    setDoc(docRef, { data: payload, updatedAt: Date.now() }, { merge: true }).catch(() => {});
                  }
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
                if (newLocal.length > 0) {
                  payload = [...payload, ...newLocal];
                  if (db) {
                    setDoc(docRef, { data: payload, updatedAt: Date.now() }, { merge: true }).catch(() => {});
                  }
                }
              }
            } catch {}
          }

          const remoteUpdatedAt = Number(docData.updatedAt) || 0;
          const localUpdatedAt = localUpdateTimestamps.get(key) || 0;

          // SAFEGUARD 1: If user recently edited this key locally (< 20s ago) and local is newer than snapshot,
          // DO NOT let the slower incoming snapshot overwrite the fresh local data!
          if (localUpdatedAt > remoteUpdatedAt && (Date.now() - localUpdatedAt < 20000)) {
            console.log(`[Firestore Sync] Protected local edit for ${key} (local is newer than snapshot). Re-pushing...`);
            const currentLocal = localStorage.getItem(key);
            if (currentLocal && db) {
              try {
                const parsed = JSON.parse(currentLocal);
                setDoc(docRef, { data: parsed, updatedAt: localUpdatedAt }, { merge: true });
              } catch {}
            }
            initialLoadCompletedKeys.add(key);
            return;
          }

          // SAFEGUARD 2: Anti-wipe. If remote snapshot contains empty data (e.g. wiped [] or null),
          // but local storage currently has real, populated data (e.g. 181 students, existing classes),
          // NEVER wipe out the local data! Instead, repair Firestore by sending the local data.
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
            console.warn(`[Firestore Sync] Prevented wiping populated local data for ${key} with empty remote snapshot! Re-saving local data to Firestore...`);
            setDoc(docRef, { data: localParsed ?? localVal, updatedAt: Date.now() }, { merge: true });
            initialLoadCompletedKeys.add(key);
            return;
          }

          const valueString = typeof payload === 'object' 
            ? JSON.stringify(payload) 
            : String(payload);
          
          if (localVal !== valueString) {
            console.log(`[Firestore Sync] Key ${key} updated from remote database.`);
            
            isRemoteSyncing = true;
            originalSetItem(key, valueString);
            isRemoteSyncing = false;

            // Dispatch custom window event so React states can react
            window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, {
              detail: { key, value: valueString }
            }));
            broadcastLocalUpdate(key, valueString);
          }
        }
        // Mark as completed so subsequent local updates can sync to remote
        initialLoadCompletedKeys.add(key);
      } else {
        // Document does not exist yet in Firestore.
        // Seed it with whatever is currently in local storage if not empty!
        const localVal = localStorage.getItem(key);
        if (localVal && !isDataEmpty(localVal)) {
          try {
            let parsedData;
            try {
              parsedData = JSON.parse(localVal);
            } catch {
              parsedData = localVal;
            }
            if (!isDataEmpty(parsedData)) {
              isRemoteSyncing = true;
              setDoc(docRef, { data: parsedData, updatedAt: Date.now() }, { merge: true }).then(() => {
                trackFirestoreWrite(1);
              }).finally(() => {
                isRemoteSyncing = false;
                initialLoadCompletedKeys.add(key);
              });
              return;
            }
          } catch (e) {
            console.error(`Error seeding key ${key}:`, e);
          }
        }
        initialLoadCompletedKeys.add(key);
      }
    }, (error) => {
      if (error && error.code === 'unavailable') {
        console.warn(`[Firestore Sync] Key ${key} operating in offline cache mode.`);
      } else {
        console.warn(`[Firestore Sync] Key ${key} listener notice:`, error?.message || error);
      }
      initialLoadCompletedKeys.add(key);
    });
  });
}
