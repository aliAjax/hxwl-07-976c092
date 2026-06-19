// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const CACHE_KEY_SYNC_QUEUE = "hxwl-07-sync-queue";
const CACHE_KEY_STATIC = "hxwl-07-static-cache";
const CACHE_KEY_LAST_SYNC = "hxwl-07-last-sync";

function setupTestEnvironment() {
  if (typeof window !== "undefined") {
    if (!("CacheStorage" in window)) {
      (window as any).CacheStorage = function CacheStorage() {};
    }
    if (!("serviceWorker" in navigator)) {
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          register: vi.fn().mockResolvedValue({}),
          getRegistration: vi.fn().mockResolvedValue(null),
          addEventListener: vi.fn(),
          controller: null,
        },
        writable: true,
        configurable: true,
      });
    }
  }

  const originalBtoa = (globalThis as any).btoa;
  if (originalBtoa) {
    (globalThis as any).btoa = function safeBtoa(str: string) {
      try {
        return originalBtoa(str);
      } catch {
        return Buffer.from(str, "utf-8").toString("base64");
      }
    };
  }
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value: online,
    writable: true,
    configurable: true,
  });
}

async function loadOfflineModule() {
  vi.resetModules();
  return await import("../../src/offline");
}

function dispatchOnlineEvent() {
  window.dispatchEvent(new Event("online"));
}

function dispatchOfflineEvent() {
  window.dispatchEvent(new Event("offline"));
}

describe("离线模块 - 网络状态初始值", () => {
  beforeEach(() => {
    setupTestEnvironment();
    localStorage.clear();
  });

  it("初始在线状态下 getNetworkStatus 返回 online", async () => {
    setOnline(true);
    const offline = await loadOfflineModule();
    expect(offline.getNetworkStatus()).toBe("online");
  });

  it("初始离线状态下 getNetworkStatus 返回 offline", async () => {
    setOnline(false);
    const offline = await loadOfflineModule();
    expect(offline.getNetworkStatus()).toBe("offline");
  });
});

describe("离线模块 - 网络状态监控", () => {
  beforeEach(() => {
    setupTestEnvironment();
    localStorage.clear();
    setOnline(true);
  });

  it("initNetworkMonitoring 返回清理函数", async () => {
    const offline = await loadOfflineModule();
    const cleanup = offline.initNetworkMonitoring();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("subscribeNetworkStatus 立即回调当前状态", async () => {
    const offline = await loadOfflineModule();
    const listener = vi.fn();

    const unsubscribe = offline.subscribeNetworkStatus(listener);

    expect(listener).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith("online");
    unsubscribe();
  });

  it("离线事件触发后状态更新为 offline", async () => {
    const offline = await loadOfflineModule();
    const cleanup = offline.initNetworkMonitoring();
    const listener = vi.fn();
    offline.subscribeNetworkStatus(listener);

    listener.mockClear();
    dispatchOfflineEvent();

    expect(listener).toHaveBeenCalledWith("offline");
    expect(offline.getNetworkStatus()).toBe("offline");
    cleanup();
  });

  it("在线事件触发后状态更新为 online", async () => {
    setOnline(false);
    const offline = await loadOfflineModule();
    const cleanup = offline.initNetworkMonitoring();
    const listener = vi.fn();
    offline.subscribeNetworkStatus(listener);

    const fetchMock = vi.spyOn(globalThis as any, "fetch").mockResolvedValue({
      ok: true,
    });

    listener.mockClear();
    setOnline(true);
    dispatchOnlineEvent();

    await new Promise((resolve) => setTimeout(resolve, 50));
    await Promise.resolve();

    expect(listener).toHaveBeenCalledWith("online");
    expect(offline.getNetworkStatus()).toBe("online");

    fetchMock.mockRestore();
    cleanup();
  });
});

describe("离线模块 - 同步队列基础操作（离线模式）", () => {
  beforeEach(() => {
    setupTestEnvironment();
    localStorage.clear();
    setOnline(false);
  });

  it("初始同步队列为空", async () => {
    const offline = await loadOfflineModule();
    expect(offline.getSyncQueue()).toEqual([]);
    expect(offline.getPendingSyncCount()).toBe(0);
  });

  it("enqueueOperation 离线时添加到队列", async () => {
    const offline = await loadOfflineModule();

    const op = offline.enqueueOperation("addRecord", {
      id: "rec-1",
      aircraftType: "A320",
      status: "pending",
    });

    expect(op.id).toBeDefined();
    expect(op.type).toBe("addRecord");
    expect(op.synced).toBe(false);
    expect(op.createdAt).toBeGreaterThan(0);

    const queue = offline.getSyncQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe(op.id);
    expect(offline.getPendingSyncCount()).toBe(1);
  });

  it("相同 payload 应去重", async () => {
    const offline = await loadOfflineModule();
    const payload = { id: "rec-1", status: "pending" };

    const op1 = offline.enqueueOperation("updateRecord", payload);
    expect(op1.synced).toBe(false);
    expect(offline.getSyncQueue().length).toBe(1);

    const op2 = offline.enqueueOperation("updateRecord", payload);
    expect(op2.synced).toBe(true);
    expect(offline.getSyncQueue().length).toBe(1);
  });

  it("不同 payload 不应去重", async () => {
    const offline = await loadOfflineModule();

    offline.enqueueOperation("addRecord", { id: "rec-1" });
    offline.enqueueOperation("addRecord", { id: "rec-2" });

    expect(offline.getSyncQueue().length).toBe(2);
  });

  it("不同操作类型相同 payload 不应去重", async () => {
    const offline = await loadOfflineModule();
    const payload = { id: "rec-1" };

    offline.enqueueOperation("addRecord", payload);
    offline.enqueueOperation("updateRecord", payload);

    expect(offline.getSyncQueue().length).toBe(2);
  });

  it("removeFromQueue 移除指定操作", async () => {
    const offline = await loadOfflineModule();

    const op = offline.enqueueOperation("addRecord", { id: "rec-1" });
    expect(offline.getSyncQueue().length).toBe(1);

    offline.removeFromQueue(op.id);
    expect(offline.getSyncQueue().length).toBe(0);
  });

  it("clearSyncedOperations 清除已同步操作", async () => {
    const offline = await loadOfflineModule();

    const op1 = offline.enqueueOperation("addRecord", { id: "rec-1" });
    (op1 as any).synced = true;
    (op1 as any).syncedAt = Date.now();

    offline.clearSyncedOperations();
    expect(offline.getSyncQueue().length).toBe(0);
  });
});

describe("离线模块 - 同步队列持久化", () => {
  beforeEach(() => {
    setupTestEnvironment();
    localStorage.clear();
    setOnline(false);
  });

  it("队列数据持久化到 localStorage", async () => {
    const offline = await loadOfflineModule();

    offline.enqueueOperation("addRecord", { id: "rec-1" });

    const stored = localStorage.getItem(CACHE_KEY_SYNC_QUEUE);
    expect(stored).toBeDefined();
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].type).toBe("addRecord");
  });

  it("从 localStorage 恢复队列", async () => {
    const savedQueue = [
      {
        id: "op-saved-1",
        type: "addRecord",
        payload: { id: "rec-1", status: "pending" },
        createdAt: Date.now() - 1000,
        synced: false,
      },
    ];
    localStorage.setItem(CACHE_KEY_SYNC_QUEUE, JSON.stringify(savedQueue));

    const offline = await loadOfflineModule();

    const queue = offline.getSyncQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe("op-saved-1");
    expect(queue[0].type).toBe("addRecord");
  });

  it("损坏的 localStorage 数据安全回退到空队列", async () => {
    localStorage.setItem(CACHE_KEY_SYNC_QUEUE, "invalid json {{{");

    const offline = await loadOfflineModule();
    expect(offline.getSyncQueue()).toEqual([]);
  });

  it("已同步的操作从恢复队列中过滤", async () => {
    const savedQueue = [
      {
        id: "op-1",
        type: "addRecord",
        payload: { id: "rec-1" },
        createdAt: Date.now(),
        synced: false,
      },
      {
        id: "op-2",
        type: "updateRecord",
        payload: { id: "rec-2" },
        createdAt: Date.now(),
        synced: true,
        syncedAt: Date.now(),
      },
    ];
    localStorage.setItem(CACHE_KEY_SYNC_QUEUE, JSON.stringify(savedQueue));

    const offline = await loadOfflineModule();
    const queue = offline.getSyncQueue();

    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe("op-1");
  });
});

describe("离线模块 - 操作标签和摘要", () => {
  beforeEach(() => {
    setupTestEnvironment();
    localStorage.clear();
    setOnline(true);
  });

  it("getOperationLabel 返回正确的中文标签", async () => {
    const offline = await loadOfflineModule();

    expect(offline.getOperationLabel("addRecord")).toBe("新增检查记录");
    expect(offline.getOperationLabel("updateRecord")).toBe("更新检查记录");
    expect(offline.getOperationLabel("deleteRecord")).toBe("删除检查记录");
    expect(offline.getOperationLabel("addDefect")).toBe("新增缺陷");
    expect(offline.getOperationLabel("updateDefect")).toBe("更新缺陷");
    expect(offline.getOperationLabel("saveReleaseReview")).toBe("保存放行复核");
    expect(offline.getOperationLabel("saveTrainingComment")).toBe("保存培训讲评");
  });

  it("getOperationSummary 为检查记录生成摘要", async () => {
    const offline = await loadOfflineModule();

    const op = {
      id: "op-1",
      type: "addRecord" as const,
      payload: {
        aircraftType: "A320",
        ataChapter: "ATA 32",
        checkArea: "landing gear",
        status: "pending",
      },
      createdAt: Date.now(),
      synced: false,
    };

    const summary = offline.getOperationSummary(op);
    expect(summary).toContain("A320");
    expect(summary).toContain("landing gear");
  });

  it("getOperationSummary 为缺陷生成摘要", async () => {
    const offline = await loadOfflineModule();

    const op = {
      id: "op-2",
      type: "addDefect" as const,
      payload: {
        aircraftType: "B737",
        defectDesc: "engine noise",
        priority: "high",
      },
      createdAt: Date.now(),
      synced: false,
    };

    const summary = offline.getOperationSummary(op);
    expect(summary).toContain("B737");
    expect(summary).toContain("engine noise");
  });

  it("getOperationSummary 为放行复核生成摘要", async () => {
    const offline = await loadOfflineModule();

    const op = {
      id: "op-3",
      type: "saveReleaseReview" as const,
      payload: {
        recordId: "rec-123",
        status: "passed",
        reviewer: "Zhang",
      },
      createdAt: Date.now(),
      synced: false,
    };

    const summary = offline.getOperationSummary(op);
    expect(summary).toContain("rec-123");
    expect(summary).toContain("放行通过");
    expect(summary).toContain("Zhang");
  });

  it("getSWStatusText 返回正确的状态文本", async () => {
    const offline = await loadOfflineModule();

    expect(offline.getSWStatusText("registered")).toBe("已启用");
    expect(offline.getSWStatusText("installing")).toBe("安装中");
    expect(offline.getSWStatusText("waiting")).toBe("等待更新");
    expect(offline.getSWStatusText("error")).toBe("注册失败");
    expect(offline.getSWStatusText("unsupported")).toBe("不支持");
  });
});

describe("离线模块 - 静态缓存信息", () => {
  beforeEach(() => {
    setupTestEnvironment();
    localStorage.clear();
    setOnline(true);
  });

  it("isStaticCacheAvailable 初始为 false", async () => {
    const offline = await loadOfflineModule();
    expect(offline.isStaticCacheAvailable()).toBe(false);
  });

  it("cacheStaticAssets 在 localStorage 记录缓存元数据", async () => {
    const offline = await loadOfflineModule();

    await offline.cacheStaticAssets();

    const cached = localStorage.getItem(CACHE_KEY_STATIC);
    expect(cached).not.toBeNull();

    const meta = JSON.parse(cached!);
    expect(meta.cachedAt).toBeGreaterThan(0);
    expect(Array.isArray(meta.assets)).toBe(true);
    expect(meta.assets.length).toBeGreaterThan(0);

    expect(offline.isStaticCacheAvailable()).toBe(true);
  });

  it("getStaticCacheInfo 返回缓存信息", async () => {
    const offline = await loadOfflineModule();

    await offline.cacheStaticAssets();

    const info = offline.getStaticCacheInfo();
    expect(info).not.toBeNull();
    expect(info?.cachedAt).toBeGreaterThan(0);
    expect(info?.assets.length).toBeGreaterThan(0);
  });

  it("getLastSyncTime 初始为 null", async () => {
    const offline = await loadOfflineModule();
    expect(offline.getLastSyncTime()).toBeNull();
  });
});

describe("离线模块 - Service Worker 支持检测", () => {
  beforeEach(() => {
    setupTestEnvironment();
    localStorage.clear();
    setOnline(true);
  });

  it("isServiceWorkerSupported 在支持时返回 true", async () => {
    const offline = await loadOfflineModule();
    expect(offline.isServiceWorkerSupported()).toBe(true);
  });
});

describe("离线模块 - 在线同步", () => {
  beforeEach(() => {
    setupTestEnvironment();
    localStorage.clear();
    setOnline(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("在线时 enqueueOperation 立即同步", async () => {
    const offline = await loadOfflineModule();

    const op = offline.enqueueOperation("addRecord", { id: "rec-1" });

    vi.advanceTimersByTime(300);
    await Promise.resolve();
    vi.advanceTimersByTime(2000);

    expect(op.synced).toBe(true);
    expect(op.syncedAt).toBeGreaterThan(0);
  });

  it("在线同步后同步状态为 synced", async () => {
    const offline = await loadOfflineModule();
    const listener = vi.fn();
    offline.subscribeSyncStatus(listener);

    listener.mockClear();
    offline.enqueueOperation("addRecord", { id: "rec-2" });

    vi.advanceTimersByTime(300);
    await Promise.resolve();

    const calls = listener.mock.calls.map((call) => call[0]);
    expect(calls).toContain("syncing");
    expect(calls).toContain("synced");
  });

  it("attemptAutoSync 在离线时不执行", async () => {
    setOnline(false);
    const offline = await loadOfflineModule();

    offline.enqueueOperation("addRecord", { id: "rec-1" });
    const beforeCount = offline.getPendingSyncCount();

    await offline.attemptAutoSync();

    expect(offline.getPendingSyncCount()).toBe(beforeCount);
    expect(beforeCount).toBe(1);
  });

  it("getSyncStatus 初始为 idle", async () => {
    const offline = await loadOfflineModule();
    expect(offline.getSyncStatus()).toBe("idle");
  });
});

describe("离线模块 - 订阅机制", () => {
  beforeEach(() => {
    setupTestEnvironment();
    localStorage.clear();
    setOnline(false);
  });

  it("subscribeSyncQueue 立即回调当前队列", async () => {
    const offline = await loadOfflineModule();
    const listener = vi.fn();

    offline.subscribeSyncQueue(listener);

    expect(listener).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith([]);
  });

  it("队列变化时通知订阅者", async () => {
    const offline = await loadOfflineModule();
    const listener = vi.fn();

    offline.subscribeSyncQueue(listener);
    listener.mockClear();

    offline.enqueueOperation("addRecord", { id: "rec-1" });

    expect(listener).toHaveBeenCalled();
    expect(listener.mock.lastCall?.[0].length).toBe(1);
  });

  it("subscribeSyncStatus 立即回调当前状态", async () => {
    const offline = await loadOfflineModule();
    const listener = vi.fn();

    offline.subscribeSyncStatus(listener);

    expect(listener).toHaveBeenCalledWith("idle");
  });

  it("取消订阅后不再收到通知", async () => {
    const offline = await loadOfflineModule();
    const listener = vi.fn();

    const unsubscribe = offline.subscribeSyncQueue(listener);
    listener.mockClear();
    unsubscribe();

    offline.enqueueOperation("addRecord", { id: "rec-2" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("多个订阅者都收到通知", async () => {
    const offline = await loadOfflineModule();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    offline.subscribeSyncQueue(listener1);
    offline.subscribeSyncQueue(listener2);

    listener1.mockClear();
    listener2.mockClear();

    offline.enqueueOperation("addRecord", { id: "rec-3" });

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
    expect(listener1.mock.lastCall?.[0].length).toBe(1);
    expect(listener2.mock.lastCall?.[0].length).toBe(1);
  });
});

describe("离线模块 - 操作去重", () => {
  beforeEach(() => {
    setupTestEnvironment();
    localStorage.clear();
    setOnline(false);
  });

  it("相同操作ID幂等处理", async () => {
    const offline = await loadOfflineModule();
    const payload1 = { id: "rec-1", _operationId: "op-unique-1", status: "pending" };
    const payload2 = { id: "rec-1", _operationId: "op-unique-1", status: "normal" };

    const op1 = offline.enqueueOperation("updateRecord", payload1);
    const op2 = offline.enqueueOperation("updateRecord", payload2);

    expect(op1.id).toBe(op2.id);
    expect(offline.getSyncQueue().length).toBe(1);
  });

  it("不同操作ID不触发幂等", async () => {
    const offline = await loadOfflineModule();

    const op1 = offline.enqueueOperation("updateRecord", { id: "rec-1", _operationId: "op-1" });
    const op2 = offline.enqueueOperation("updateRecord", { id: "rec-1", _operationId: "op-2" });

    expect(op1.id).not.toBe(op2.id);
  });
});
