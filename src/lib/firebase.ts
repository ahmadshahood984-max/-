/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore,
  getFirestore,
  persistentLocalCache, 
  persistentMultipleTabManager, 
  memoryLocalCache,
  CACHE_SIZE_UNLIMITED,
  doc,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
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

// Initialize Cloud Firestore with auto-detected streaming/long-polling and unlimited IndexedDB persistent cache
// Student grades and school data are cached locally in the browser across sessions (0 server reads on reopen)
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    localCache: persistentLocalCache({
      cacheSizeBytes: CACHE_SIZE_UNLIMITED,
      tabManager: persistentMultipleTabManager()
    })
  }, databaseId);
} catch (cacheErr) {
  console.warn('[Firestore] IndexedDB persistentLocalCache unavailable, falling back to memoryLocalCache:', cacheErr);
  try {
    firestoreInstance = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: memoryLocalCache()
    }, databaseId);
  } catch {
    firestoreInstance = getFirestore(app, databaseId);
  }
}

export const db = firestoreInstance;

// Initialize Firebase Authentication
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function extractFirestoreErrorMessage(error: unknown): string {
  const rawMsg = error instanceof Error ? error.message : String(error || 'Unknown error');
  let detail = rawMsg;
  try {
    const parsed = JSON.parse(rawMsg);
    if (parsed && typeof parsed.error === 'string') {
      detail = parsed.error;
    }
  } catch {
    // not JSON
  }
  const lower = detail.toLowerCase();
  if (lower.includes('permission') || lower.includes('missing or insufficient')) {
    return `Missing or insufficient permissions (${detail})`;
  }
  if (lower.includes('resource-exhausted') || lower.includes('quota')) {
    return `تم تجاوز الحد اليومي لحصة Firestore المجانية (${detail})`;
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return `انتهت مهلة الاتصال بسحابة Firestore — يرجى التحقق من الإنترنت (${detail})`;
  }
  return detail;
}

async function testConnection() {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    window.addEventListener('online', () => {
      testConnection().catch(() => {});
    }, { once: true });
    return;
  }

  const retryDelays = [500, 2000];
  let lastError: unknown = null;

  for (let i = 0; i < retryDelays.length; i++) {
    await new Promise(resolve => setTimeout(resolve, retryDelays[i]));
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      return;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
      if (!msg.includes('the client is offline') && !msg.includes('unavailable')) {
        return;
      }
    }
  }

  // If SDK WebChannel/Long-Polling reported offline transiently during startup,
  // verify actual Firebase configuration reachability via Firestore REST API before logging config error.
  if (lastError instanceof Error && lastError.message.includes('the client is offline')) {
    try {
      const restUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(databaseId)}/documents/test/connection?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
      const res = await fetch(restUrl, { method: 'GET', cache: 'no-store' });
      if (res.status === 200 || res.status === 404) {
        console.warn('[Firestore] Startup transport took extra time while Firebase configuration is valid.');
        return;
      }
    } catch {
      // If offline/unreachable while navigator.onLine is false, do not report config failure
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }
    }
    console.error('Please check your Firebase configuration.');
  }
}
testConnection();

/**
 * Cache-First Document Reader:
 * Reads from IndexedDB persistent local cache FIRST (0 Firestore server reads!).
 * Only queries the Firestore server if the document is not yet cached locally or if `forceServer` is true.
 */
export async function getDocCacheFirst<T = any>(
  docRef: DocumentReference<T>,
  options?: { forceServer?: boolean; timeoutMs?: number }
): Promise<{ snap: DocumentSnapshot<T> | null; fromCache: boolean }> {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const forceServer = isOffline ? false : (options?.forceServer ?? false);
  const timeoutMs = options?.timeoutMs ?? 2500;

  if (!forceServer) {
    try {
      const cachedSnap = await getDocFromCache(docRef);
      if (cachedSnap && cachedSnap.exists()) {
        return { snap: cachedSnap, fromCache: true };
      }
    } catch {
      // Cache miss (document not yet in local IndexedDB cache)
    }
  }

  if (isOffline) {
    return { snap: null, fromCache: true };
  }

  try {
    const fetchPromise = forceServer ? getDocFromServer(docRef) : getDoc(docRef);
    const serverSnap = await Promise.race([
      fetchPromise,
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
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const forceServer = isOffline ? false : (options?.forceServer ?? false);
  const timeoutMs = options?.timeoutMs ?? 2500;

  if (!forceServer) {
    try {
      const cachedSnap = await getDocsFromCache(q);
      if (cachedSnap && !cachedSnap.empty) {
        return { snap: cachedSnap, fromCache: true };
      }
    } catch {
      // Cache miss
    }
  }

  if (isOffline) {
    return { snap: null, fromCache: true };
  }

  try {
    const fetchPromise = forceServer ? getDocsFromServer(q) : getDocs(q);
    const serverSnap = await Promise.race([
      fetchPromise,
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

