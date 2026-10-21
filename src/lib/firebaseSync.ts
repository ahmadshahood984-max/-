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

/**
 * Directly writes and persists data to both Firestore and localStorage immediately
 * Guarantees data remains saved even after closing the application.
 */
export async function persistDirectToFirestore(key: string, data: any): Promise<boolean> {
  try {
    const valueString = typeof data === 'object' ? JSON.stringify(data) : String(data);
    originalSetItem(key, valueString);
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, {
        detail: { key, value: valueString }
      }));
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

export async function forceRefreshDataFromFirestore(): Promise<boolean> {
  if (!db) return false;
  try {
    for (const key of SYNC_KEYS) {
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

          window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, {
            detail: { key, value: valueString }
          }));
        }
      }
    }
    return true;
  } catch (err) {
    console.error('Error force refreshing data from Firestore:', err);
    return false;
  }
}

export function setupFirebaseSync() {
  console.log('Initializing Firebase real-time database synchronization...');

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
