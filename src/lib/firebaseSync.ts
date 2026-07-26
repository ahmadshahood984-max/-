/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from './firestoreTracker';

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
  'school_fcm_config'
];

let isRemoteSyncing = false;
const initialLoadCompletedKeys = new Set<string>();

// Custom event name
export const STORAGE_UPDATE_EVENT = 'school_storage_update';

// Keep reference to original methods
const originalSetItem = localStorage.setItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);

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
          const valueString = typeof docData.data === 'object' 
            ? JSON.stringify(docData.data) 
            : String(docData.data);
          
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
      console.error(`Firestore listener error for key ${key}:`, error);
      // Fallback: let user writes happen if Firestore fails
      initialLoadCompletedKeys.add(key);
    });
  });
}
