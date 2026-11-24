/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
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
  apiKey: firebaseConfigJson.apiKey || "AIzaSyAP9pcAzPnD-MtTq3HDJPTIRdeDTOly3H8",
  authDomain: firebaseConfigJson.authDomain || "madrasa-international.firebaseapp.com",
  projectId: firebaseConfigJson.projectId || "madrasa-international",
  storageBucket: firebaseConfigJson.storageBucket || "madrasa-international.firebasestorage.app",
  messagingSenderId: firebaseConfigJson.messagingSenderId || "573753610239",
  appId: firebaseConfigJson.appId || "1:573753610239:web:39c0921354098948ba21ca"
};

const databaseId = firebaseConfigJson.firestoreDatabaseId || "(default)";

// Suppress internal WebChannel / transient polling logs in browser console
try {
  setLogLevel('silent');
} catch {
  // ignore
}

// Purge any corrupted legacy Firestore SDK IndexedDB persistence stores (prevents v12 ca9/b815 watch assertions)
// Durable offline storage is handled safely by `offlineVault.ts` (`school_offline_vault_db`).
if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
  indexedDB.databases()
    .then((dbs) => {
      dbs.forEach((entry) => {
        if (entry?.name && entry.name.startsWith('firestore/')) {
          try {
            indexedDB.deleteDatabase(entry.name);
          } catch {}
        }
      });
    })
    .catch(() => {});
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore with memoryLocalCache + long-polling auto-detection
// to eliminate multi-tab WatchChangeAggregator (ID: ca9 / b815) assertion crashes.
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    localCache: memoryLocalCache()
  }, databaseId);
} catch {
  firestoreInstance = getFirestore(app, databaseId);
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
  // verify actual Firebase configuration reachability via Firestore REST API before logging warning.
  if (lastError instanceof Error && lastError.message.includes('the client is offline')) {
    try {
      const restUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(databaseId)}/documents/test/connection?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
      const res = await fetch(restUrl, { method: 'GET', cache: 'no-store' });
      if (res.status === 200 || res.status === 404 || res.status === 429 || res.status === 403) {
        console.warn('[Firestore] Startup transport check completed via REST (status ' + res.status + ').');
        return;
      }
    } catch {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }
    }
    console.warn('[Firestore] Startup connection check delayed; will rely on live listeners and REST fallback.');
  }
}
testConnection();

function toFirestoreRestValue(val: any): any {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { nullValue: null };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.filter((item) => item !== undefined).map(toFirestoreRestValue)
      }
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreRestValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function writeDocViaRestApi(
  collectionName: string,
  docId: string,
  data: Record<string, any>,
  merge: boolean = false,
  timeoutMs: number = 8000
): Promise<void> {
  const fields: Record<string, any> = {};
  const fieldPaths: string[] = [];
  for (const [k, v] of Object.entries(data || {})) {
    if (v !== undefined) {
      fields[k] = toFirestoreRestValue(v);
      fieldPaths.push(k);
    }
  }
  const encodedPath = `${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`;
  let url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodedPath}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  if (merge && fieldPaths.length > 0) {
    url += '&' + fieldPaths.map((fp) => `updateMask.fieldPaths=${encodeURIComponent(fp)}`).join('&');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
      signal: controller.signal
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      if (res.status === 429 || errText.toLowerCase().includes('quota') || errText.toLowerCase().includes('resource_exhausted')) {
        throw new Error(`resource-exhausted: ${errText}`);
      }
      if (res.status === 403 || errText.toLowerCase().includes('permission')) {
        throw new Error(`permission-denied: ${errText}`);
      }
      throw new Error(`Firestore REST write failed (${res.status}): ${errText}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

function fromFirestoreRestValue(restVal: any): any {
  if (!restVal || typeof restVal !== 'object') return null;
  if ('nullValue' in restVal) return null;
  if ('booleanValue' in restVal) return Boolean(restVal.booleanValue);
  if ('integerValue' in restVal) {
    const n = Number(restVal.integerValue);
    return Number.isSafeInteger(n) ? n : Number(restVal.integerValue);
  }
  if ('doubleValue' in restVal) return Number(restVal.doubleValue);
  if ('stringValue' in restVal) return String(restVal.stringValue);
  if ('timestampValue' in restVal) return String(restVal.timestampValue);
  if ('arrayValue' in restVal) {
    const values = Array.isArray(restVal.arrayValue?.values) ? restVal.arrayValue.values : [];
    return values.map(fromFirestoreRestValue);
  }
  if ('mapValue' in restVal) {
    const fields = restVal.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreRestValue(v);
    }
    return out;
  }
  return null;
}

export async function readDocViaRestApi(
  collectionName: string,
  docId: string,
  timeoutMs: number = 5000
): Promise<{ exists: boolean; data: Record<string, any> | null }> {
  const cleanCollection = collectionName
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const encodedPath = `${cleanCollection}/${encodeURIComponent(docId)}`;
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodedPath}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });
    if (res.status === 404) {
      return { exists: false, data: null };
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      if (res.status === 429 || errText.toLowerCase().includes('quota') || errText.toLowerCase().includes('resource_exhausted')) {
        throw new Error(`resource-exhausted: ${errText}`);
      }
      if (res.status === 403 || errText.toLowerCase().includes('permission')) {
        throw new Error(`permission-denied: ${errText}`);
      }
      throw new Error(`Firestore REST read failed (${res.status}): ${errText}`);
    }
    const json = await res.json();
    const fields = json?.fields;
    if (!fields || typeof fields !== 'object') {
      return { exists: true, data: {} };
    }
    const decoded: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      decoded[k] = fromFirestoreRestValue(v);
    }
    return { exists: true, data: decoded };
  } finally {
    clearTimeout(timer);
  }
}

export async function commitFirestoreBatchViaRest(
  items: Array<{
    collectionName: string;
    docId: string;
    data: Record<string, any>;
    merge?: boolean;
  }>,
  timeoutMs: number = 9000
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) return;
  const writes = items.map(({ collectionName, docId, data, merge }) => {
    const fields: Record<string, any> = {};
    const fieldPaths: string[] = [];
    for (const [k, v] of Object.entries(data || {})) {
      if (v !== undefined) {
        fields[k] = toFirestoreRestValue(v);
        fieldPaths.push(k);
      }
    }
    const cleanCollection = collectionName
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const cleanDocId = encodeURIComponent(docId);
    const name = `projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${cleanCollection}/${cleanDocId}`;
    return {
      update: { name, fields },
      ...(merge && fieldPaths.length > 0 ? { updateMask: { fieldPaths } } : {})
    };
  });

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(databaseId)}/documents:commit?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes }),
      signal: controller.signal
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      if (res.status === 429 || errText.toLowerCase().includes('quota') || errText.toLowerCase().includes('resource_exhausted')) {
        throw new Error(`resource-exhausted: ${errText}`);
      }
      if (res.status === 403 || errText.toLowerCase().includes('permission')) {
        throw new Error(`permission-denied: ${errText}`);
      }
      throw new Error(`Firestore REST batch commit failed (${res.status}): ${errText}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function deleteDocViaRestApi(
  collectionName: string,
  docId: string,
  timeoutMs: number = 8000
): Promise<void> {
  const encodedPath = `${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`;
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodedPath}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      signal: controller.signal
    });
    if (!res.ok && res.status !== 404) {
      const errText = await res.text().catch(() => res.statusText);
      if (res.status === 429 || errText.toLowerCase().includes('quota') || errText.toLowerCase().includes('resource_exhausted')) {
        throw new Error(`resource-exhausted: ${errText}`);
      }
      throw new Error(`Firestore REST delete failed (${res.status}): ${errText}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function commitFirestoreDeletesViaRest(
  items: Array<{
    collectionName: string;
    docId: string;
  }>,
  timeoutMs: number = 9000
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) return;
  const writes = items.map(({ collectionName, docId }) => {
    const cleanCollection = collectionName
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const cleanDocId = encodeURIComponent(docId);
    const name = `projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${cleanCollection}/${cleanDocId}`;
    return { delete: name };
  });

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(databaseId)}/documents:commit?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes }),
      signal: controller.signal
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      if (res.status === 429 || errText.toLowerCase().includes('quota') || errText.toLowerCase().includes('resource_exhausted')) {
        throw new Error(`resource-exhausted: ${errText}`);
      }
      if (res.status === 403 || errText.toLowerCase().includes('permission')) {
        throw new Error(`permission-denied: ${errText}`);
      }
      throw new Error(`Firestore REST batch delete failed (${res.status}): ${errText}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fast document writer: attempts Firestore SDK `setDoc` first, and if the WebChannel stream
 * takes longer than `sdkGraceMs` (default 1500ms), immediately falls back to direct Firestore REST PATCH
 * so grade sheet sends never hang on congested queues or mobile WebView networks.
 */
export async function writeFirestoreDocFast(
  collectionName: string,
  docId: string,
  data: Record<string, any>,
  options?: { merge?: boolean; sdkGraceMs?: number; restTimeoutMs?: number }
): Promise<void> {
  const { setDoc } = await import('firebase/firestore');
  const merge = Boolean(options?.merge);
  const sdkGraceMs = options?.sdkGraceMs ?? 1500;
  const restTimeoutMs = options?.restTimeoutMs ?? 8000;

  const docRef = doc(db, collectionName, docId);
  const sdkPromise = merge
    ? setDoc(docRef, data, { merge: true })
    : setDoc(docRef, data);

  let sdkError: unknown = null;
  const sdkOutcome = await Promise.race([
    sdkPromise.then(() => 'sdk_ok' as const).catch((err) => {
      sdkError = err;
      return 'sdk_err' as const;
    }),
    new Promise<'grace_elapsed'>((resolve) => setTimeout(() => resolve('grace_elapsed'), sdkGraceMs))
  ]);

  if (sdkOutcome === 'sdk_ok') return;
  if (sdkOutcome === 'sdk_err') {
    const msg = String((sdkError as any)?.message || sdkError || '').toLowerCase();
    if (msg.includes('resource-exhausted') || msg.includes('quota') || msg.includes('permission')) {
      throw sdkError;
    }
    // Transient SDK failure — execute direct REST PATCH cleanly
    await writeDocViaRestApi(collectionName, docId, data, merge, restTimeoutMs);
    return;
  }

  // WebChannel took too long — race remaining SDK promise against direct REST PATCH
  const restPromise = writeDocViaRestApi(collectionName, docId, data, merge, restTimeoutMs);
  await Promise.race([
    restPromise,
    sdkPromise.catch(() => restPromise)
  ]);
}

/**
 * Fast document deleter: attempts Firestore SDK `deleteDoc` and falls back to REST DELETE if stalled.
 */
export async function deleteFirestoreDocFast(
  collectionName: string,
  docId: string,
  options?: { sdkGraceMs?: number; restTimeoutMs?: number }
): Promise<void> {
  const { deleteDoc } = await import('firebase/firestore');
  const sdkGraceMs = options?.sdkGraceMs ?? 1500;
  const restTimeoutMs = options?.restTimeoutMs ?? 8000;

  const docRef = doc(db, collectionName, docId);
  const sdkPromise = deleteDoc(docRef);

  let sdkError: unknown = null;
  const sdkOutcome = await Promise.race([
    sdkPromise.then(() => 'sdk_ok' as const).catch((err) => {
      sdkError = err;
      return 'sdk_err' as const;
    }),
    new Promise<'grace_elapsed'>((resolve) => setTimeout(() => resolve('grace_elapsed'), sdkGraceMs))
  ]);

  if (sdkOutcome === 'sdk_ok') return;
  if (sdkOutcome === 'sdk_err') {
    const msg = String((sdkError as any)?.message || sdkError || '').toLowerCase();
    if (msg.includes('resource-exhausted') || msg.includes('quota') || msg.includes('permission')) {
      throw sdkError;
    }
    await deleteDocViaRestApi(collectionName, docId, restTimeoutMs);
    return;
  }

  const restPromise = deleteDocViaRestApi(collectionName, docId, restTimeoutMs);
  await Promise.race([
    restPromise,
    sdkPromise.catch(() => restPromise)
  ]);
}

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

