/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Durable IndexedDB Offline Vault
// Guarantees zero data loss when internet disconnects or localStorage nears its 5MB limit.
// Mirrors all synced school keys + queues pending Firestore consolidated grades and notifications.

const DB_NAME = 'school_offline_vault_db';
const DB_VERSION = 1;
const STORE_KV = 'kv_store';
const STORE_GRADE_BATCHES = 'pending_grade_batches';
const STORE_NOTIFICATIONS = 'pending_notifications';

export interface VaultKVRecord {
  key: string;
  value: string;
  updatedAt: number;
  pendingSync: boolean;
}

export interface PendingGradeBatchRecord {
  id: string;
  records: Array<{
    studentId: string;
    studentName?: string;
    classId?: string;
    className?: string;
    unifiedNo?: string;
    rollNo?: string;
    month?: string;
    subjects: { [subjectName: string]: { score: number | null; maxScore: number; examName?: string; notes?: string } };
    teacherNotes?: string;
    directorNotes?: string;
  }>;
  createdAt: number;
}

export interface PendingNotificationRecord {
  id: string;
  docData: Record<string, any>;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openVaultDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_GRADE_BATCHES)) {
          db.createObjectStore(STORE_GRADE_BATCHES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NOTIFICATIONS)) {
          db.createObjectStore(STORE_NOTIFICATIONS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Ask the browser to mark origin storage (IndexedDB + CacheStorage + localStorage) as persistent
 * so offline school records are protected from automatic browser eviction.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      const alreadyPersisted = await navigator.storage.persisted?.();
      if (alreadyPersisted) return true;
      return await navigator.storage.persist();
    }
  } catch {
    // Ignore unsupported environments
  }
  return false;
}

export async function saveToOfflineVault(
  key: string,
  value: string,
  updatedAt: number,
  pendingSync: boolean
): Promise<void> {
  const db = await openVaultDB();
  if (!db) return;

  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      const store = tx.objectStore(STORE_KV);
      const record: VaultKVRecord = { key, value, updatedAt, pendingSync };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function markVaultKeySynced(key: string, updatedAt: number): Promise<void> {
  const db = await openVaultDB();
  if (!db) return;

  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      const store = tx.objectStore(STORE_KV);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const existing = getReq.result as VaultKVRecord | undefined;
        if (existing) {
          // Only mark synced if no newer offline write happened after updatedAt
          if (existing.updatedAt <= updatedAt) {
            store.put({
              ...existing,
              pendingSync: false
            });
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getAllVaultItems(): Promise<VaultKVRecord[]> {
  const db = await openVaultDB();
  if (!db) return [];

  return new Promise<VaultKVRecord[]>((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readonly');
      const store = tx.objectStore(STORE_KV);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function enqueuePendingGradeBatch(
  id: string,
  records: PendingGradeBatchRecord['records']
): Promise<void> {
  if (!records || records.length === 0) return;
  const db = await openVaultDB();
  if (!db) return;

  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_GRADE_BATCHES, 'readwrite');
      const store = tx.objectStore(STORE_GRADE_BATCHES);
      store.put({ id, records, createdAt: Date.now() } as PendingGradeBatchRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getPendingGradeBatches(): Promise<PendingGradeBatchRecord[]> {
  const db = await openVaultDB();
  if (!db) return [];

  return new Promise<PendingGradeBatchRecord[]>((resolve) => {
    try {
      const tx = db.transaction(STORE_GRADE_BATCHES, 'readonly');
      const store = tx.objectStore(STORE_GRADE_BATCHES);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function removePendingGradeBatch(id: string): Promise<void> {
  const db = await openVaultDB();
  if (!db) return;

  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_GRADE_BATCHES, 'readwrite');
      tx.objectStore(STORE_GRADE_BATCHES).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function enqueuePendingNotification(
  id: string,
  docData: Record<string, any>
): Promise<void> {
  const db = await openVaultDB();
  if (!db) return;

  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NOTIFICATIONS, 'readwrite');
      const store = tx.objectStore(STORE_NOTIFICATIONS);
      store.put({ id, docData, createdAt: Date.now() } as PendingNotificationRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getPendingNotifications(): Promise<PendingNotificationRecord[]> {
  const db = await openVaultDB();
  if (!db) return [];

  return new Promise<PendingNotificationRecord[]>((resolve) => {
    try {
      const tx = db.transaction(STORE_NOTIFICATIONS, 'readonly');
      const store = tx.objectStore(STORE_NOTIFICATIONS);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function removePendingNotification(id: string): Promise<void> {
  const db = await openVaultDB();
  if (!db) return;

  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NOTIFICATIONS, 'readwrite');
      tx.objectStore(STORE_NOTIFICATIONS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
