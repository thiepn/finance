import type { LocalReceiptCaptureDraft } from "../domain/receipt-capture.js";

export interface ReceiptCaptureDraftStore {
  put(draft: LocalReceiptCaptureDraft): Promise<void>;
  get(clientCaptureId: string): Promise<LocalReceiptCaptureDraft | null>;
  list(): Promise<readonly LocalReceiptCaptureDraft[]>;
  delete(clientCaptureId: string): Promise<void>;
}

const DB_NAME = "thiepn-finance";
const STORE_NAME = "receipt-captures";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "clientCaptureId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open receipt capture database"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export class IndexedDbReceiptCaptureDraftStore
  implements ReceiptCaptureDraftStore
{
  async put(draft: LocalReceiptCaptureDraft): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(draft);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Draft save failed"));
        tx.onabort = () => reject(tx.error ?? new Error("Draft save aborted"));
      });
    } finally {
      db.close();
    }
  }

  async get(clientCaptureId: string): Promise<LocalReceiptCaptureDraft | null> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const value = await requestResult(
        tx.objectStore(STORE_NAME).get(clientCaptureId),
      );
      return (value as LocalReceiptCaptureDraft | undefined) ?? null;
    } finally {
      db.close();
    }
  }

  async list(): Promise<readonly LocalReceiptCaptureDraft[]> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const values = await requestResult(tx.objectStore(STORE_NAME).getAll());
      return (values as LocalReceiptCaptureDraft[]).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
    } finally {
      db.close();
    }
  }

  async delete(clientCaptureId: string): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(clientCaptureId);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Draft delete failed"));
        tx.onabort = () => reject(tx.error ?? new Error("Draft delete aborted"));
      });
    } finally {
      db.close();
    }
  }
}
