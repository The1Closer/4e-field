"use client";

type SyncOperation = {
  id?: number;
  clientOperationId: string;
  operationType: "insert" | "update" | "upsert" | "delete";
  resourceType: string;
  resourceId?: string | null;
  payload: Record<string, unknown>;
  queuedAt: string;
  approximateBytes?: number;
};

const DB_NAME = "field-offline-sync";
const DB_VERSION = 1;
const STORE = "operations";
const MAX_QUEUE_BYTES = 1024 * 1024 * 1024; // 1 GB
const DEFAULT_SYNC_TIMEOUT_MS = 15000;

function estimatePayloadBytes(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

function getDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("by_client_id", "clientOperationId", { unique: true });
        store.createIndex("by_queued_at", "queuedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open offline sync DB."));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await getDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    run(store)
      .then((value) => {
        transaction.oncomplete = () => {
          db.close();
          resolve(value);
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error("Offline sync transaction failed."));
        };
      })
      .catch((error) => {
        db.close();
        reject(error);
      });
  });
}

export async function enqueueSyncOperation(operation: Omit<SyncOperation, "id" | "queuedAt">) {
  const approximateBytes = estimatePayloadBytes(operation);
  const queuedBytes = await getQueuedOperationBytes();
  if (queuedBytes + approximateBytes > MAX_QUEUE_BYTES) {
    throw new Error("Offline queue is full (1 GB limit). Sync now before adding more media.");
  }

  const payload: SyncOperation = {
    ...operation,
    queuedAt: new Date().toISOString(),
    approximateBytes,
  };

  return tx<number>("readwrite", async (store) => {
    return await new Promise<number>((resolve, reject) => {
      const req = store.put(payload);
      req.onsuccess = () => resolve(Number(req.result));
      req.onerror = () => reject(req.error ?? new Error("Could not queue operation."));
    });
  });
}

export async function listSyncOperations() {
  return tx<SyncOperation[]>("readonly", async (store) => {
    return await new Promise<SyncOperation[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result ?? []) as SyncOperation[];
        rows.sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)));
        resolve(rows);
      };
      req.onerror = () => reject(req.error ?? new Error("Could not read queued operations."));
    });
  });
}

export async function clearSyncOperation(id: number) {
  return tx<void>("readwrite", async (store) => {
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("Could not clear queued operation."));
    });
  });
}

export async function countSyncOperations() {
  const rows = await listSyncOperations();
  return rows.length;
}

export async function getQueuedOperationBytes() {
  const rows = await listSyncOperations();
  return rows.reduce((sum, row) => sum + Number(row.approximateBytes ?? estimatePayloadBytes(row)), 0);
}

export async function flushSyncQueue(timeoutMs = DEFAULT_SYNC_TIMEOUT_MS) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { pushed: 0, remaining: await countSyncOperations(), offline: true };
  }

  const queued = await listSyncOperations();
  if (queued.length === 0) {
    return { pushed: 0, remaining: 0 };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch("/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ operations: queued }),
    signal: controller.signal,
  }).finally(() => {
    window.clearTimeout(timeoutId);
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `Sync push failed (${response.status}).`);
  }

  const payload = (await response.json()) as { acceptedClientOperationIds?: string[] };
  const accepted = new Set(payload.acceptedClientOperationIds ?? []);

  for (const item of queued) {
    if (!item.id) continue;
    if (accepted.has(item.clientOperationId)) {
      await clearSyncOperation(item.id);
    }
  }

  return {
    pushed: accepted.size,
    remaining: await countSyncOperations(),
    offline: false,
  };
}

export function setupAutoSync(onError?: (error: Error) => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  let running = false;
  const trigger = async () => {
    if (running) return;
    running = true;
    try {
      await flushSyncQueue();
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error : new Error("Offline sync failed."));
      }
    } finally {
      running = false;
    }
  };

  const onOnline = () => {
    void trigger();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void trigger();
    }
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
