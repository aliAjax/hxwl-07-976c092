export type NetworkStatus = "online" | "offline";

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

export type OperationType =
  | "addRecord"
  | "updateRecord"
  | "deleteRecord"
  | "addTemplate"
  | "updateTemplate"
  | "deleteTemplate"
  | "saveReviewNote"
  | "saveReleaseReview"
  | "addDefect"
  | "updateDefect"
  | "deleteDefect"
  | "createDefectFromRecord";

export interface SyncOperation {
  id: string;
  type: OperationType;
  payload: any;
  createdAt: number;
  synced: boolean;
  syncedAt?: number;
  error?: string;
}

const CACHE_KEY_STATIC = "hxwl-07-static-cache";
const CACHE_KEY_SYNC_QUEUE = "hxwl-07-sync-queue";
const CACHE_KEY_LAST_SYNC = "hxwl-07-last-sync";
const NETWORK_CHECK_INTERVAL = 5000;

const networkStatusListeners: Set<(status: NetworkStatus) => void> = new Set();
const syncQueueListeners: Set<(queue: SyncOperation[]) => void> = new Set();
const syncStatusListeners: Set<(status: SyncStatus) => void> = new Set();

let currentNetworkStatus: NetworkStatus = navigator.onLine ? "online" : "offline";
let currentSyncStatus: SyncStatus = "idle";

function getInitialSyncQueue(): SyncOperation[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY_SYNC_QUEUE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(op => !op.synced);
      }
    }
  } catch {}
  return [];
}

let syncQueue: SyncOperation[] = getInitialSyncQueue();

function persistSyncQueue(): void {
  try {
    localStorage.setItem(CACHE_KEY_SYNC_QUEUE, JSON.stringify(syncQueue));
  } catch {}
}

export function getNetworkStatus(): NetworkStatus {
  return currentNetworkStatus;
}

export function getSyncStatus(): SyncStatus {
  return currentSyncStatus;
}

export function getSyncQueue(): SyncOperation[] {
  return [...syncQueue];
}

export function getPendingSyncCount(): number {
  return syncQueue.filter(op => !op.synced).length;
}

export function subscribeNetworkStatus(listener: (status: NetworkStatus) => void): () => void {
  networkStatusListeners.add(listener);
  listener(currentNetworkStatus);
  return () => networkStatusListeners.delete(listener);
}

export function subscribeSyncQueue(listener: (queue: SyncOperation[]) => void): () => void {
  syncQueueListeners.add(listener);
  listener(syncQueue);
  return () => syncQueueListeners.delete(listener);
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  syncStatusListeners.add(listener);
  listener(currentSyncStatus);
  return () => syncStatusListeners.delete(listener);
}

function notifyNetworkStatus(status: NetworkStatus): void {
  currentNetworkStatus = status;
  networkStatusListeners.forEach(listener => listener(status));
}

function notifySyncQueue(): void {
  syncQueueListeners.forEach(listener => listener([...syncQueue]));
}

function notifySyncStatus(status: SyncStatus): void {
  currentSyncStatus = status;
  syncStatusListeners.forEach(listener => listener(status));
}

function checkConnectivity(): Promise<boolean> {
  if (navigator.onLine === false) return Promise.resolve(false);
  return fetch("/", { method: "HEAD", cache: "no-store" })
    .then(() => true)
    .catch(() => navigator.onLine);
}

export function initNetworkMonitoring(): () => void {
  const handleOnline = () => {
    checkConnectivity().then(online => {
      notifyNetworkStatus(online ? "online" : "offline");
      if (online) {
        attemptAutoSync();
      }
    });
  };

  const handleOffline = () => {
    notifyNetworkStatus("offline");
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  const interval = window.setInterval(() => {
    checkConnectivity().then(online => {
      const newStatus: NetworkStatus = online ? "online" : "offline";
      if (newStatus !== currentNetworkStatus) {
        notifyNetworkStatus(newStatus);
        if (online) {
          attemptAutoSync();
        }
      }
    });
  }, NETWORK_CHECK_INTERVAL);

  checkConnectivity().then(online => {
    notifyNetworkStatus(online ? "online" : "offline");
  });

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    window.clearInterval(interval);
  };
}

export function enqueueOperation(type: OperationType, payload: any): SyncOperation {
  const operation: SyncOperation = {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    createdAt: Date.now(),
    synced: false
  };

  if (currentNetworkStatus === "online") {
    syncImmediate(operation);
  } else {
    syncQueue.push(operation);
    persistSyncQueue();
    notifySyncQueue();
  }

  return operation;
}

async function syncImmediate(operation: SyncOperation): Promise<void> {
  notifySyncStatus("syncing");
  try {
    await new Promise(resolve => setTimeout(resolve, 200));
    operation.synced = true;
    operation.syncedAt = Date.now();
    localStorage.setItem(CACHE_KEY_LAST_SYNC, String(Date.now()));
    notifySyncStatus("synced");
    setTimeout(() => {
      if (getPendingSyncCount() === 0) {
        notifySyncStatus("idle");
      }
    }, 1500);
  } catch (error: any) {
    operation.error = error?.message || "同步失败";
    syncQueue.push(operation);
    persistSyncQueue();
    notifySyncQueue();
    notifySyncStatus("error");
  }
}

export async function attemptAutoSync(): Promise<void> {
  if (currentNetworkStatus !== "online") return;
  if (getPendingSyncCount() === 0) return;

  notifySyncStatus("syncing");
  let hasError = false;

  for (const op of syncQueue) {
    if (op.synced) continue;
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      op.synced = true;
      op.syncedAt = Date.now();
    } catch (error: any) {
      op.error = error?.message || "同步失败";
      hasError = true;
    }
  }

  syncQueue = syncQueue.filter(op => !op.synced);
  persistSyncQueue();
  notifySyncQueue();
  localStorage.setItem(CACHE_KEY_LAST_SYNC, String(Date.now()));

  if (hasError) {
    notifySyncStatus("error");
  } else {
    notifySyncStatus("synced");
    setTimeout(() => notifySyncStatus("idle"), 1500);
  }
}

export function clearSyncedOperations(): void {
  syncQueue = syncQueue.filter(op => !op.synced);
  persistSyncQueue();
  notifySyncQueue();
}

export function removeFromQueue(operationId: string): void {
  syncQueue = syncQueue.filter(op => op.id !== operationId);
  persistSyncQueue();
  notifySyncQueue();
}

export function getLastSyncTime(): number | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_LAST_SYNC);
    return raw ? parseInt(raw, 10) : null;
  } catch {
    return null;
  }
}

const STATIC_ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/src/main.tsx",
  "/src/App.tsx",
  "/src/styles.css",
  "/src/db.ts",
  "/src/offline.ts"
];

export function cacheStaticAssets(): Promise<void> {
  return new Promise(resolve => {
    try {
      const cacheMeta = {
        cachedAt: Date.now(),
        assets: STATIC_ASSETS_TO_CACHE,
        version: "1.0.0"
      };
      localStorage.setItem(CACHE_KEY_STATIC, JSON.stringify(cacheMeta));
      resolve();
    } catch {
      resolve();
    }
  });
}

export function isStaticCacheAvailable(): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY_STATIC);
    if (!raw) return false;
    const meta = JSON.parse(raw);
    return !!meta.cachedAt;
  } catch {
    return false;
  }
}

export function getStaticCacheInfo(): { cachedAt: number; assets: string[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_STATIC);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const operationLabels: Record<OperationType, string> = {
  addRecord: "新增检查记录",
  updateRecord: "更新检查记录",
  deleteRecord: "删除检查记录",
  addTemplate: "新增模板",
  updateTemplate: "更新模板",
  deleteTemplate: "删除模板",
  saveReviewNote: "保存讲评备注",
  saveReleaseReview: "保存放行复核",
  addDefect: "新增缺陷",
  updateDefect: "更新缺陷",
  deleteDefect: "删除缺陷",
  createDefectFromRecord: "从记录生成缺陷"
};

export function getOperationLabel(type: OperationType): string {
  return operationLabels[type] || type;
}
