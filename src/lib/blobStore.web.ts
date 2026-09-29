const DB_NAME = 'modo-vault';
const STORE = 'blobs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser blocked local storage, so the vault cannot be saved.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open vault storage.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Vault storage failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Vault storage failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Vault storage was aborted.'));
  });
}

export async function readBlob(name: string): Promise<Uint8Array | null> {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE, 'readonly');
    const result = await requestResult(transaction.objectStore(STORE).get(name));
    await transactionDone(transaction);
    if (!result) return null;
    return result instanceof Uint8Array ? new Uint8Array(result) : new Uint8Array(result as ArrayBuffer);
  } finally {
    db.close();
  }
}

export async function writeBlob(name: string, data: Uint8Array): Promise<void> {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(data, name);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function removeBlob(name: string): Promise<void> {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(name);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function listBlobs(): Promise<string[]> {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE, 'readonly');
    const keys = await requestResult(transaction.objectStore(STORE).getAllKeys());
    await transactionDone(transaction);
    return keys.map((key) => String(key));
  } finally {
    db.close();
  }
}

export async function clearBlobs(): Promise<void> {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).clear();
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}
