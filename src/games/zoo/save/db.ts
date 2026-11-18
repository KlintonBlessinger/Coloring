import { loadZooSave, writeZooSave, type SaveBucket, type ZooSave } from './shape';

const DB_NAME = 'little-zookeeper';
const STORE = 'saves';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function browserBucket(): SaveBucket {
  return {
    async get(key) {
      const db = await openDb();
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const request = tx.objectStore(STORE).get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    async set(key, value) {
      const db = await openDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore(STORE).put(value, key);
        });
      } finally {
        db.close();
      }
    },
  };
}

export async function loadProfile(profileId: string): Promise<ZooSave> {
  try {
    return await loadZooSave(profileId, browserBucket());
  } catch {
    return loadZooSave(profileId, { get: async () => undefined, set: async () => undefined });
  }
}

export async function saveProfile(save: ZooSave): Promise<void> {
  try {
    await writeZooSave(save, browserBucket());
  } catch {
    /* The walk keeps going if this device refuses the write. */
  }
}
