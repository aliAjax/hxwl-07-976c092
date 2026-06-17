export type NetworkStatus = "online" | "offline";

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

export type SWRegistrationStatus = "unsupported" | "registering" | "registered" | "installing" | "installed" | "waiting" | "updating" | "error";

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

export interface CacheInfo {
  version: string;
  cacheNames: string[];
  totalAssets: number;
  timestamp: number;
}

export interface SWStatus {
  registrationStatus: SWRegistrationStatus;
  isServiceWorkerSupported: boolean;
  isCached: boolean;
  registration: ServiceWorkerRegistration | null;
  activeWorker: ServiceWorker | null;
  waitingWorker: ServiceWorker | null;
  cacheInfo: CacheInfo | null;
  error: string | null;
}

const CACHE_KEY_STATIC = "hxwl-07-static-cache";
const CACHE_KEY_SYNC_QUEUE = "hxwl-07-sync-queue";
const CACHE_KEY_LAST_SYNC = "hxwl-07-last-sync";
const NETWORK_CHECK_INTERVAL = 5000;
const SW_PATH = "/sw.js";

const networkStatusListeners: Set<(status: NetworkStatus) => void> = new Set();
const syncQueueListeners: Set<(queue: SyncOperation[]) => void> = new Set();
const syncStatusListeners: Set<(status: SyncStatus) => void> = new Set();
const swStatusListeners: Set<(status: SWStatus) => void> = new Set();

let currentNetworkStatus: NetworkStatus = navigator.onLine ? "online" : "offline";
let currentSyncStatus: SyncStatus = "idle";
let currentSWStatus: SWStatus = {
  registrationStatus: "unsupported",
  isServiceWorkerSupported: false,
  isCached: false,
  registration: null,
  activeWorker: null,
  waitingWorker: null,
  cacheInfo: null,
  error: null
};

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

export function subscribeSWStatus(listener: (status: SWStatus) => void): () => void {
  swStatusListeners.add(listener);
  listener({ ...currentSWStatus });
  return () => swStatusListeners.delete(listener);
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

function notifySWStatus(partial: Partial<SWStatus>): void {
  currentSWStatus = { ...currentSWStatus, ...partial };
  swStatusListeners.forEach(listener => listener({ ...currentSWStatus }));
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
        broadcastOnlineStatus(true);
      }
    });
  };

  const handleOffline = () => {
    notifyNetworkStatus("offline");
    broadcastOnlineStatus(false);
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
          broadcastOnlineStatus(true);
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

function broadcastOnlineStatus(online: boolean): void {
  if (!currentSWStatus.registration) return;
  currentSWStatus.registration.active?.postMessage({
    type: "ONLINE_STATUS",
    online
  });
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
    registerBackgroundSync();
  }

  return operation;
}

async function registerBackgroundSync(): Promise<void> {
  if (!("SyncManager" in window)) return;
  if (!currentSWStatus.registration) return;

  try {
    const swReg = currentSWStatus.registration as any;
    if (swReg.sync) {
      await swReg.sync.register("sync-queue");
      console.log("[Offline] Background sync registered");
    }
  } catch (error) {
    console.warn("[Offline] Background sync registration failed:", error);
  }
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
    registerBackgroundSync();
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

export function isServiceWorkerSupported(): boolean {
  return "serviceWorker" in navigator && "CacheStorage" in window;
}

export async function registerServiceWorker(): Promise<SWStatus> {
  if (!isServiceWorkerSupported()) {
    const status: SWStatus = {
      ...currentSWStatus,
      registrationStatus: "unsupported",
      isServiceWorkerSupported: false,
      error: "当前浏览器不支持 Service Worker"
    };
    notifySWStatus(status);
    return status;
  }

  try {
    notifySWStatus({ registrationStatus: "registering" });

    const registration = await navigator.serviceWorker.register(SW_PATH, {
      scope: "/",
      updateViaCache: "none"
    });

    const initialStatus: SWStatus = {
      ...currentSWStatus,
      registrationStatus: "registered",
      isServiceWorkerSupported: true,
      registration,
      activeWorker: registration.active,
      waitingWorker: registration.waiting,
      isCached: !!registration.active
    };
    notifySWStatus(initialStatus);

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      notifySWStatus({
        registrationStatus: "installing",
        activeWorker: registration.active,
        waitingWorker: registration.waiting
      });

      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          let status: SWRegistrationStatus = currentSWStatus.registrationStatus;
          if (newWorker.state === "installed") {
            status = registration.active ? "waiting" : "installed";
          } else if (newWorker.state === "activating") {
            status = "updating";
          } else if (newWorker.state === "activated") {
            status = "registered";
          }

          notifySWStatus({
            registrationStatus: status,
            activeWorker: registration.active,
            waitingWorker: registration.waiting,
            isCached: !!registration.active
          });
        });
      }
    });

    if (registration.waiting) {
      notifySWStatus({
        registrationStatus: "waiting",
        waitingWorker: registration.waiting
      });
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      notifySWStatus({
        registrationStatus: "registered",
        activeWorker: registration.active,
        waitingWorker: registration.waiting,
        isCached: true
      });
    });

    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "BACKGROUND_SYNC_TRIGGERED") {
        console.log("[Offline] Background sync triggered");
        attemptAutoSync();
      }
    });

    const cacheInfo = await getCacheInfoFromSW();
    if (cacheInfo) {
      notifySWStatus({ cacheInfo });
    }

    return { ...currentSWStatus };
  } catch (error: any) {
    const errorStatus: SWStatus = {
      ...currentSWStatus,
      registrationStatus: "error",
      isServiceWorkerSupported: true,
      error: error?.message || "Service Worker 注册失败"
    };
    notifySWStatus(errorStatus);
    return errorStatus;
  }
}

export async function updateServiceWorker(): Promise<boolean> {
  if (!currentSWStatus.registration) return false;
  try {
    await currentSWStatus.registration.update();
    return true;
  } catch (error) {
    console.warn("[Offline] SW update failed:", error);
    return false;
  }
}

export function activateWaitingWorker(): void {
  if (!currentSWStatus.waitingWorker) return;
  currentSWStatus.waitingWorker.postMessage({ type: "SKIP_WAITING" });
}

function sendMessageToSW<T>(message: any): Promise<T | null> {
  return new Promise((resolve) => {
    if (!currentSWStatus.registration?.active) {
      resolve(null);
      return;
    }

    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    currentSWStatus.registration.active.postMessage(message, [messageChannel.port2]);

    setTimeout(() => resolve(null), 5000);
  });
}

export async function getCacheInfo(): Promise<CacheInfo | null> {
  if (currentSWStatus.cacheInfo) {
    return currentSWStatus.cacheInfo;
  }
  return getCacheInfoFromSW();
}

async function getCacheInfoFromSW(): Promise<CacheInfo | null> {
  if ("caches" in window) {
    try {
      const cacheNames = await caches.keys();
      let totalAssets = 0;
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        totalAssets += keys.length;
      }
      const info: CacheInfo = {
        version: "hxwl-07-v1",
        cacheNames,
        totalAssets,
        timestamp: Date.now()
      };
      notifySWStatus({ cacheInfo: info, isCached: totalAssets > 0 });
      return info;
    } catch (error) {
      console.warn("[Offline] Failed to get cache info:", error);
    }
  }
  return sendMessageToSW<CacheInfo>({ type: "GET_CACHE_INFO" });
}

export async function precacheAssets(): Promise<boolean> {
  const result = await sendMessageToSW<{ type: string }>({ type: "PRECACHE" });
  await getCacheInfoFromSW();
  return result?.type === "PRECACHE_COMPLETE";
}

export async function clearCache(): Promise<boolean> {
  try {
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      notifySWStatus({ cacheInfo: null, isCached: false });
      return true;
    }
    const result = await sendMessageToSW<{ type: string }>({ type: "CLEAR_CACHE" });
    if (result?.type === "CACHE_CLEARED") {
      notifySWStatus({ cacheInfo: null, isCached: false });
      return true;
    }
    return false;
  } catch (error) {
    console.warn("[Offline] Failed to clear cache:", error);
    return false;
  }
}

const STATIC_ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/offline.html",
  "/sw.js"
];

export async function cacheStaticAssets(): Promise<void> {
  try {
    const cacheMeta = {
      cachedAt: Date.now(),
      assets: STATIC_ASSETS_TO_CACHE,
      version: "1.0.0"
    };
    localStorage.setItem(CACHE_KEY_STATIC, JSON.stringify(cacheMeta));

    if ("caches" in window) {
      try {
        const cache = await caches.open("hxwl-07-v1");
        await Promise.all(
          STATIC_ASSETS_TO_CACHE.map(url =>
            cache.add(url).catch(err => console.warn(`[Offline] Failed to cache ${url}:`, err))
          )
        );
        await getCacheInfoFromSW();
      } catch (err) {
        console.warn("[Offline] Cache API failed, fallback to metadata only:", err);
      }
    }
  } catch {}
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

export function getSWStatusText(status: SWRegistrationStatus): string {
  const labels: Record<SWRegistrationStatus, string> = {
    unsupported: "不支持",
    registering: "注册中",
    registered: "已启用",
    installing: "安装中",
    installed: "已安装",
    waiting: "等待更新",
    updating: "更新中",
    error: "注册失败"
  };
  return labels[status] || status;
}

export function openCacheSettings(): void {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) {
        console.log("[Offline] Current SW registration:", reg);
      }
    });
  }
}
