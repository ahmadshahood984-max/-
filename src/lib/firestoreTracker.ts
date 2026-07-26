/**
 * Utility to monitor and track Firestore daily reads and writes.
 * Supports actual operation tracking, localStorage persistence, 
 * real-time sync with Firestore 'system_usage' collection,
 * and background simulation of other active portal users.
 */

import { db } from './firebase';
import { doc, setDoc, increment, onSnapshot } from 'firebase/firestore';

export interface FirestoreMetrics {
  date: string;       // YYYY-MM-DD
  reads: number;
  writes: number;
  simulatedReads: number;
  simulatedWrites: number;
  totalReads: number;
  totalWrites: number;
  // Live Firestore DB values
  firestoreReads: number;
  firestoreWrites: number;
}

const METRICS_KEY = 'school_firestore_metrics';
const METRICS_EVENT = 'school_firestore_metrics_updated';

// Helper to get current YYYY-MM-DD date in local timezone
function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Load metrics from LocalStorage
export function loadFirestoreMetrics(): FirestoreMetrics {
  const today = getTodayDateString();
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FirestoreMetrics;
      // If the log is for today, return it
      if (parsed.date === today) {
        // Ensure firestore values exist
        if (parsed.firestoreReads === undefined) parsed.firestoreReads = 0;
        if (parsed.firestoreWrites === undefined) parsed.firestoreWrites = 0;
        return parsed;
      }
    }
  } catch (e) {
    console.error("Failed to load firestore metrics:", e);
  }

  // Create new blank metric for today
  const newMetrics: FirestoreMetrics = {
    date: today,
    reads: 0,
    writes: 0,
    simulatedReads: 0,
    simulatedWrites: 0,
    totalReads: 0,
    totalWrites: 0,
    firestoreReads: 0,
    firestoreWrites: 0
  };
  saveMetrics(newMetrics);
  return newMetrics;
}

// Save metrics to LocalStorage and dispatch change event
function saveMetrics(metrics: FirestoreMetrics) {
  metrics.totalReads = metrics.reads + metrics.simulatedReads + (metrics.firestoreReads || 0);
  metrics.totalWrites = metrics.writes + metrics.simulatedWrites + (metrics.firestoreWrites || 0);
  localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
  window.dispatchEvent(new CustomEvent(METRICS_EVENT, { detail: metrics }));
}

let pendingReads = 0;
let pendingWrites = 0;
let usageSyncTimer: ReturnType<typeof setTimeout> | null = null;

// Asynchronously and non-blockingly update the 'system_usage' collection in Firestore (batched every 30s)
export async function incrementFirestoreUsage(reads: number, writes: number) {
  pendingReads += reads;
  pendingWrites += writes;

  if (!usageSyncTimer) {
    usageSyncTimer = setTimeout(async () => {
      const toSyncReads = pendingReads;
      const toSyncWrites = pendingWrites;
      pendingReads = 0;
      pendingWrites = 0;
      usageSyncTimer = null;

      if (toSyncReads === 0 && toSyncWrites === 0) return;
      try {
        const today = getTodayDateString();
        const docRef = doc(db, 'system_usage', today);
        const updateData: any = {};
        if (toSyncReads > 0) {
          updateData.daily_read_count = increment(toSyncReads);
        }
        if (toSyncWrites > 0) {
          updateData.daily_write_count = increment(toSyncWrites);
        }
        await setDoc(docRef, updateData, { merge: true });
      } catch (err) {
        console.warn("Could not sync Firestore usage counters (offline or preview mode):", err);
      }
    }, 30000); // Batch every 30 seconds
  }
}

// Track an actual Read operation
export function trackFirestoreRead(count: number = 1) {
  const metrics = loadFirestoreMetrics();
  metrics.reads += count;
  saveMetrics(metrics);
  // Sync to remote Firestore DB
  incrementFirestoreUsage(count, 0);
}

// Track an actual Write operation
export function trackFirestoreWrite(count: number = 1) {
  const metrics = loadFirestoreMetrics();
  metrics.writes += count;
  saveMetrics(metrics);
  // Sync to remote Firestore DB
  incrementFirestoreUsage(0, count);
}

// Explicitly increment counters on activity (such as sending messages or notifications)
export function trackActivityOperation(type: 'read' | 'write', amount: number = 1) {
  if (type === 'read') {
    trackFirestoreRead(amount);
  } else {
    trackFirestoreWrite(amount);
  }
}

// Generate realistic simulated background traffic for standard school portals
// simulating other parents (e.g. 350 active accounts) and teachers sync
export function simulateBackgroundTraffic() {
  const metrics = loadFirestoreMetrics();
  
  // Random reads between 1 and 3
  const randReads = Math.floor(Math.random() * 3) + 1;
  const randWrites = Math.random() < 0.05 ? 1 : 0;

  metrics.simulatedReads += randReads;
  metrics.simulatedWrites += randWrites;

  saveMetrics(metrics);
}

// Subscribe to real-time Firestore DB system_usage count
export function subscribeToFirebaseSystemUsage(callback: (usage: { reads: number; writes: number }) => void) {
  try {
    const today = getTodayDateString();
    const docRef = doc(db, 'system_usage', today);
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const reads = data?.daily_read_count || 0;
        const writes = data?.daily_write_count || 0;
        
        // Update local metrics state to match
        const metrics = loadFirestoreMetrics();
        metrics.firestoreReads = reads;
        metrics.firestoreWrites = writes;
        saveMetrics(metrics);

        callback({ reads, writes });
      } else {
        callback({ reads: 0, writes: 0 });
      }
    }, (error) => {
      console.warn("Error listening to firebase system_usage:", error);
    });
  } catch (e) {
    console.warn("Firestore not initialized for system_usage:", e);
    return () => {};
  }
}

// Auto-start background monitoring safely when imported
if (typeof window !== 'undefined') {
  // Load initial metrics cleanly
  loadFirestoreMetrics();

  // Subscribe to live Firebase system_usage document without background traffic simulation loops
  subscribeToFirebaseSystemUsage(() => {});
}

// Subscribe helper for React components
export function subscribeToFirestoreMetrics(callback: (metrics: FirestoreMetrics) => void) {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<FirestoreMetrics>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    }
  };

  window.addEventListener(METRICS_EVENT, handler);
  // Initial callback
  callback(loadFirestoreMetrics());

  return () => {
    window.removeEventListener(METRICS_EVENT, handler);
  };
}
