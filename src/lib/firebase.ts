/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  memoryLocalCache,
  CACHE_SIZE_UNLIMITED,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  setLogLevel,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
  type Firestore
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfigJson from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey || "AIzaSyDcSshIC_Rs7m8uOF9OkHIJQ--JTifVKUQ",
  authDomain: firebaseConfigJson.authDomain || "aesthetic-night-p8gvj.firebaseapp.com",
  projectId: firebaseConfigJson.projectId || "aesthetic-night-p8gvj",
  storageBucket: firebaseConfigJson.storageBucket || "aesthetic-night-p8gvj.firebasestorage.app",
  messagingSenderId: firebaseConfigJson.messagingSenderId || "600017099331",
  appId: firebaseConfigJson.appId || "1:600017099331:web:23e214f289dbe0ecdc92f6"
};

const databaseId = firebaseConfigJson.firestoreDatabaseId || "ai-studio-c3b19e71-cc85-420b-8314-cb9b70b9467c";

// Suppress internal WebChannel / transient polling logs in browser console
try {
  setLogLevel('silent');
} catch {
  // ignore
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore with forced long polling and unlimited IndexedDB persistent cache
// Student grades and school data are cached locally in the browser across sessions (0 server reads on reopen)
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({
      cacheSizeBytes: CACHE_SIZE_UNLIMITED,
      tabManager: persistentMultipleTabManager()
    })
  }, databaseId);
} catch (cacheErr) {
  console.warn('[Firestore] IndexedDB persistentLocalCache unavailable, falling back to memoryLocalCache:', cacheErr);
  firestoreInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    localCache: memoryLocalCache()
  }, databaseId);
}

export const db = firestoreInstance;

/**
 * Cache-First Document Reader:
 * Reads from IndexedDB persistent local cache FIRST (0 Firestore server reads!).
 * Only queries the Firestore server if the document is not yet cached locally or if `forceServer` is true.
 */
export async function getDocCacheFirst<T = any>(
  docRef: DocumentReference<T>,
  options?: { forceServer?: boolean; timeoutMs?: number }
): Promise<{ snap: DocumentSnapshot<T> | null; fromCache: boolean }> {
  const forceServer = options?.forceServer ?? false;
  const timeoutMs = options?.timeoutMs ?? 2500;

  if (!forceServer) {
    try {
      const cachedSnap = await getDocFromCache(docRef);
      if (cachedSnap && cachedSnap.exists()) {
        return { snap: cachedSnap, fromCache: true };
      }
    } catch {
      // Cache miss (document not yet in local IndexedDB cache) -> fall through to server
    }
  }

  try {
    const serverSnap = await Promise.race([
      getDoc(docRef),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
    ]);
    if (serverSnap) {
      return { snap: serverSnap, fromCache: serverSnap.metadata?.fromCache ?? false };
    }
  } catch (err) {
    // If server fetch fails or times out while forceServer was true, fall back to cache
    if (forceServer) {
      try {
        const fallbackCache = await getDocFromCache(docRef);
        if (fallbackCache && fallbackCache.exists()) {
          return { snap: fallbackCache, fromCache: true };
        }
      } catch {
        // ignore
      }
    }
    throw err;
  }

  return { snap: null, fromCache: false };
}

/**
 * Cache-First Collection/Query Reader:
 * Reads matching documents from IndexedDB persistent cache FIRST (0 Firestore server reads!).
 * Only queries the Firestore server if cache is empty or `forceServer` is true.
 */
export async function getDocsCacheFirst<T = any>(
  q: Query<T>,
  options?: { forceServer?: boolean; timeoutMs?: number }
): Promise<{ snap: QuerySnapshot<T> | null; fromCache: boolean }> {
  const forceServer = options?.forceServer ?? false;
  const timeoutMs = options?.timeoutMs ?? 2500;

  if (!forceServer) {
    try {
      const cachedSnap = await getDocsFromCache(q);
      if (cachedSnap && !cachedSnap.empty) {
        return { snap: cachedSnap, fromCache: true };
      }
    } catch {
      // Cache miss -> fall through to server
    }
  }

  try {
    const serverSnap = await Promise.race([
      getDocs(q),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
    ]);
    if (serverSnap) {
      return { snap: serverSnap, fromCache: serverSnap.metadata?.fromCache ?? false };
    }
  } catch (err) {
    if (forceServer) {
      try {
        const fallbackCache = await getDocsFromCache(q);
        if (fallbackCache && !fallbackCache.empty) {
          return { snap: fallbackCache, fromCache: true };
        }
      } catch {
        // ignore
      }
    }
    throw err;
  }

  return { snap: null, fromCache: false };
}

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Safe export for Messaging (FCM)
export const getMessagingInstance = async () => {
  try {
    const { getMessaging, isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    if (supported) {
      return getMessaging(app);
    }
  } catch (err) {
    console.warn("FCM is not supported in this browser/environment:", err);
  }
  return null;
};

