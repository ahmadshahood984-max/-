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
 * Directly writes and persists data to both Firestore and localStorage immediately
 * Guarantees data remains saved even after closing the application, and broadcasts to all clients.
 */
export async function persistDirectToFirestore(key: string, data: any): Promise<boolean> {
  try {
    const valueString = typeof data === 'object' ? JSON.stringify(data) : String(data);
    originalSetItem(key, valueString);
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, {
        detail: { key, value: valueString }
      }));
      broadcastLocalUpdate(key, valueString);
    }

    if (db) {
      const docRef = doc(db, 'school_live_data', key);
      await setDoc(docRef, { data, updatedAt: Date.now() }, { merge: true });
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
 * High-speed parallel force refresh from Firestore.
 * Retrieves all keys concurrently in < 300ms instead of sequential 4s delay.
 */
export async function forceRefreshDataFromFirestore(): Promise<boolean> {
  if (!db) return false;
  try {
    const refreshTasks = SYNC_KEYS.map(async (key) => {
      try {
        const docRef = doc(db, 'school_live_data', key);
        const snap = await getDoc(docRef);
        trackFirestoreRead(1);
        if (snap.exists()) {
          const docData = snap.data();
          if (docData && docData.data !== undefined) {
            let payload = docData.data;
            if (key === 'school_students' && Array.isArray(payload)) {
              payload = sanitizeAndDeduplicateStudents(payload);
            }
            const valueString = typeof payload === 'object' 
              ? JSON.stringify(payload) 
              : String(payload);
            
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
  console.log('Initializing Firebase real-time database synchronization with high-speed listeners...');

  // 1. Intercept localStorage.setItem
  localStorage.setItem = (key: string, value: string) => {
    const prevValue = localStorage.getItem(key);
    originalSetItem(key, value);

    if (SYNC_KEYS.includes(key) && !isRemoteSyncing) {
      if (!initialLoadCompletedKeys.has(key)) {
        // Prevent overwriting remote data with local defaults during startup
        console.log(`[Firestore Sync] Skipping write for ${key} because initial remote load is not yet complete.`);
        return;
      }
      if (prevValue === value) {
        // Skip redundant updates to conserve Firestore write quotas
        return;
      }
      // Sync to Firestore in background
      try {
        let parsedData;
        try {
          parsedData = JSON.parse(value);
        } catch {
          parsedData = value;
        }

        const docRef = doc(db, 'school_live_data', key);
        setDoc(docRef, { data: parsedData, updatedAt: Date.now() }).then(() => {
          trackFirestoreWrite(1);
        }).catch(err => {
          console.error(`Error writing key ${key} to Firestore:`, err);
        });
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
          const valueString = typeof payload === 'object' 
            ? JSON.stringify(payload) 
            : String(payload);
          
          const localVal = localStorage.getItem(key);
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
        // Document does not exist yet in Firestore (e.g. database newly created).
        // Let's seed it with whatever is currently in local storage (or initial data)!
        const localVal = localStorage.getItem(key);
        if (localVal) {
          try {
            let parsedData;
            try {
              parsedData = JSON.parse(localVal);
            } catch {
              parsedData = localVal;
            }
            isRemoteSyncing = true;
            setDoc(docRef, { data: parsedData, updatedAt: Date.now() }).then(() => {
              trackFirestoreWrite(1);
            }).finally(() => {
              isRemoteSyncing = false;
              // Mark as completed even on seeding
              initialLoadCompletedKeys.add(key);
            });
          } catch (e) {
            console.error(`Error seeding key ${key}:`, e);
            initialLoadCompletedKeys.add(key);
          }
        } else {
          // No local value either, just mark as complete
          initialLoadCompletedKeys.add(key);
        }
      }
    }, (error) => {
      // Graceful fallback if transient connection issues occur
      if (error && error.code === 'unavailable') {
        console.warn(`[Firestore Sync] Key ${key} operating in offline cache mode.`);
      } else {
        console.warn(`[Firestore Sync] Key ${key} listener notice:`, error?.message || error);
      }
      // Fallback: allow local writes to proceed so user workflow is never blocked
      initialLoadCompletedKeys.add(key);
    });
  });
}
