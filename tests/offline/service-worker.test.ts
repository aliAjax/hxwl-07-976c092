// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SW_BASE_ORIGIN = "http://localhost:5107";

interface MockCache {
  name: string;
  entries: Map<string, Response>;
}

interface SWGlobal {
  addEventListener: ReturnType<typeof vi.fn>;
  skipWaiting: ReturnType<typeof vi.fn>;
  clients: {
    claim: ReturnType<typeof vi.fn>;
    matchAll: ReturnType<typeof vi.fn>;
  };
  location: {
    origin: string;
    href: string;
  };
  registration: any;
  caches: CacheStorage;
  console: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  _eventHandlers: Map<string, Set<(event: any) => void>>;
  _caches: Map<string, MockCache>;
}

function createMockCaches(): { caches: CacheStorage; internalCaches: Map<string, MockCache> } {
  const cachesMap = new Map<string, MockCache>();

  const cachesMock: any = {
    open: vi.fn(async (cacheName: string) => {
      if (!cachesMap.has(cacheName)) {
        cachesMap.set(cacheName, {
          name: cacheName,
          entries: new Map(),
        });
      }
      const cache = cachesMap.get(cacheName)!;
      return {
        match: vi.fn(async (request: any) => {
          const url = typeof request === "string" ? request : request.url;
          return cache.entries.get(url);
        }),
        put: vi.fn(async (request: any, response: Response) => {
            const url = typeof request === "string" ? request : request.url;
            cache.entries.set(url, response.clone());
          }),
          add: vi.fn(async (request: any) => {
            const url = typeof request === "string" ? request : request.url;
            const response = new Response(`Mock content for ${url}`, { status: 200 });
            cache.entries.set(url, response);
          }),
          addAll: vi.fn(async (requests: any[]) => {
              for (const req of requests) {
                const url = typeof req === "string" ? req : req.url;
                const fullUrl = url.startsWith("http") ? url : `${SW_BASE_ORIGIN}${url}`;
                const response = new Response(`Mock content for ${fullUrl}`, { status: 200 });
                cache.entries.set(fullUrl, response);
              }
            }),
            delete: vi.fn(async (request: any) => {
              const url = typeof request === "string" ? request : request.url;
              return cache.entries.delete(url);
            }),
            keys: vi.fn(async () => {
                return Array.from(cache.entries.keys()).map(
                  (url) => new Request(url)
                );
              }),
            };
          }),
    match: vi.fn(async (request: any) => {
      const url = typeof request === "string" ? request : request.url;
      for (const cache of cachesMap.values()) {
        const response = cache.entries.get(url);
        if (response) return response;
      }
      return undefined;
    }),
    keys: vi.fn(async () => Array.from(cachesMap.keys())),
    delete: vi.fn(async (cacheName: string) => cachesMap.delete(cacheName)),
    has: vi.fn(async (cacheName: string) => cachesMap.has(cacheName)),
  };

  return { caches: cachesMock, internalCaches: cachesMap };
}

function createMockSWContext(): SWGlobal {
  const { caches: mockCaches, internalCaches } = createMockCaches();
  const eventHandlers = new Map<string, Set<(event: any) => void>>();

  const mockSelf: any = {
    addEventListener: vi.fn((type: string, handler: (event: any) => void) => {
      if (!eventHandlers.has(type)) {
        eventHandlers.set(type, new Set());
      }
      eventHandlers.get(type)!.add(handler);
    }),
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn().mockResolvedValue([]),
    },
    location: {
      origin: SW_BASE_ORIGIN,
      href: `${SW_BASE_ORIGIN}/sw.js`,
    },
    registration: {},
    caches: mockCaches,
    console: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    _eventHandlers: eventHandlers,
    _caches: internalCaches,
  };

  return mockSelf;
}

function loadSWCode(): string {
  const swPath = resolve(__dirname, "../../public/sw.js");
  return readFileSync(swPath, "utf-8");
}

function evaluateSWInContext(mockSelf: SWGlobal): void {
  const swCode = loadSWCode();
  const wrapper = new Function("self", "caches", `
    ${swCode}
  `);
  wrapper(mockSelf, mockSelf.caches);
}

async function triggerInstallEvent(mockSelf: SWGlobal): Promise<void> {
  return new Promise((resolve) => {
    const handlers = mockSelf._eventHandlers.get("install");
    if (!handlers) {
      resolve();
      return;
    }

    const event = {
      waitUntil: vi.fn((promise: Promise<any>) => {
        promise.then(() => resolve()).catch(() => resolve());
      }),
    };

    handlers.forEach((handler) => handler(event));
  });
}

async function triggerActivateEvent(mockSelf: SWGlobal): Promise<void> {
  return new Promise((resolve) => {
    const handlers = mockSelf._eventHandlers.get("activate");
    if (!handlers) {
      resolve();
      return;
    }

    const event = {
      waitUntil: vi.fn((promise: Promise<any>) => {
        promise.then(() => resolve()).catch(() => resolve());
      }),
    };

    handlers.forEach((handler) => handler(event));
  });
}

async function triggerFetchEvent(
  mockSelf: SWGlobal,
  path: string,
  options: { method?: string; isNavigate?: boolean } = {}
): Promise<Response | undefined> {
  return new Promise((resolve, reject) => {
    const handlers = mockSelf._eventHandlers.get("fetch");
    if (!handlers) {
      resolve(undefined);
      return;
    }

    const url = `${SW_BASE_ORIGIN}${path}`;
    const request: any = {
      url,
      method: options.method || "GET",
      mode: options.isNavigate ? "navigate" : "cors",
      destination: options.isNavigate ? "document" : "",
      clone: function() { return { ...this }; },
    };

    let responded = false;
    const event: any = {
      request,
      respondWith: vi.fn((responsePromise: Promise<Response>) => {
        responded = true;
        responsePromise
          .then((response) => resolve(response))
          .catch(reject);
      }),
    };

    handlers.forEach((handler) => handler(event));

    if (!responded) {
      resolve(undefined);
    }
  });
}

async function triggerMessageEvent(mockSelf: SWGlobal, message: any): Promise<any> {
  return new Promise((resolve) => {
    const handlers = mockSelf._eventHandlers.get("message");
    if (!handlers) {
      resolve(null);
      return;
    }

    const port = {
      postMessage: vi.fn((data: any) => {
        resolve(data);
      }),
    };

    const event = {
      data: message,
      ports: [port],
    };

    handlers.forEach((handler) => handler(event));

    setTimeout(() => resolve(null), 100);
  });
}

describe("Service Worker - 安装阶段", () => {
  let mockSelf: SWGlobal;

  beforeEach(() => {
    mockSelf = createMockSWContext();
    evaluateSWInContext(mockSelf);
  });

  it("应注册 install 事件监听器", () => {
    expect(mockSelf.addEventListener).toHaveBeenCalledWith("install", expect.any(Function));
  });

  it("安装时应预缓存核心资源", async () => {
    await triggerInstallEvent(mockSelf);

    const cacheNames = await mockSelf.caches.keys();
    expect(cacheNames.length).toBeGreaterThan(0);

    const mainCacheName = cacheNames.find((n: string) => !n.includes("runtime"));
    expect(mainCacheName).toBeDefined();

    const cache: any = await mockSelf.caches.open(mainCacheName!);
    const keys = await cache.keys();
    expect(keys.length).toBeGreaterThanOrEqual(3);
  });

  it("安装完成后应调用 skipWaiting", async () => {
    await triggerInstallEvent(mockSelf);
    expect(mockSelf.skipWaiting).toHaveBeenCalled();
  });
});

describe("Service Worker - 激活阶段", () => {
  let mockSelf: SWGlobal;

  beforeEach(() => {
    mockSelf = createMockSWContext();
    evaluateSWInContext(mockSelf);
  });

  it("应注册 activate 事件监听器", () => {
    expect(mockSelf.addEventListener).toHaveBeenCalledWith("activate", expect.any(Function));
  });

  it("激活时应清理旧版本缓存", async () => {
    mockSelf._caches.set("hxwl-07-v0", { name: "hxwl-07-v0", entries: new Map() });
    mockSelf._caches.set("old-cache", { name: "old-cache", entries: new Map() });

    await triggerActivateEvent(mockSelf);

    const cacheNames = await mockSelf.caches.keys();
    expect(cacheNames).not.toContain("hxwl-07-v0");
    expect(cacheNames).not.toContain("old-cache");
  });

  it("激活时应调用 clients.claim", async () => {
    await triggerActivateEvent(mockSelf);
    expect(mockSelf.clients.claim).toHaveBeenCalled();
  });
});

describe("Service Worker - 消息处理", () => {
  let mockSelf: SWGlobal;

  beforeEach(() => {
    mockSelf = createMockSWContext();
    evaluateSWInContext(mockSelf);
  });

  it("应注册 message 事件监听器", () => {
    expect(mockSelf.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));
  });

  it("SKIP_WAITING 消息应触发 skipWaiting", () => {
    const handlers = mockSelf._eventHandlers.get("message");
    if (handlers) {
      handlers.forEach((handler) => handler({ data: { type: "SKIP_WAITING" } }));
    }
    expect(mockSelf.skipWaiting).toHaveBeenCalled();
  });

  it("GET_CACHE_INFO 应返回缓存信息", async () => {
    await triggerInstallEvent(mockSelf);

    const result = await triggerMessageEvent(mockSelf, { type: "GET_CACHE_INFO" });

    expect(result).not.toBeNull();
    expect(result.type).toBe("CACHE_INFO");
    expect(result.version).toBeDefined();
    expect(Array.isArray(result.cacheNames)).toBe(true);
    expect(typeof result.totalAssets).toBe("number");
    expect(result.totalAssets).toBeGreaterThan(0);
  });

  it("CLEAR_CACHE 应清除所有缓存", async () => {
    await triggerInstallEvent(mockSelf);

    let cacheNames = await mockSelf.caches.keys();
    expect(cacheNames.length).toBeGreaterThan(0);

    const result = await triggerMessageEvent(mockSelf, { type: "CLEAR_CACHE" });

    expect(result).not.toBeNull();
    expect(result.type).toBe("CACHE_CLEARED");

    cacheNames = await mockSelf.caches.keys();
    expect(cacheNames.length).toBe(0);
  });

  it("PRECACHE 应预缓存资源", async () => {
    const result = await triggerMessageEvent(mockSelf, { type: "PRECACHE" });

    expect(result).not.toBeNull();
    expect(result.type).toBe("PRECACHE_COMPLETE");
    expect(Array.isArray(result.urls)).toBe(true);
    expect(result.urls.length).toBeGreaterThan(0);
  });
});

describe("Service Worker - 缓存策略", () => {
  let mockSelf: SWGlobal;

  beforeEach(async () => {
    mockSelf = createMockSWContext();
    evaluateSWInContext(mockSelf);
    await triggerInstallEvent(mockSelf);
    await triggerActivateEvent(mockSelf);
  });

  it("非 GET 请求应直接通过", async () => {
    const result = await triggerFetchEvent(mockSelf, "/api/test", {
      method: "POST",
    });
    expect(result).toBeUndefined();
  });

  it("跨源请求应直接通过", async () => {
    const handlers = mockSelf._eventHandlers.get("fetch");
    expect(handlers).toBeDefined();

    let responded = false;
    const request: any = {
      url: "https://other-domain.com/api/test",
      method: "GET",
      mode: "cors",
      destination: "",
    };
    const event: any = {
      request,
      respondWith: vi.fn(() => { responded = true; }),
    };

    handlers!.forEach((handler) => handler(event));

    expect(responded).toBe(false);
  });

  it("HTML 导航请求应有响应", async () => {
    const response = await triggerFetchEvent(mockSelf, "/", {
      isNavigate: true,
    });

    expect(response).toBeDefined();
    expect(response?.status).toBe(200);
  });

  it("静态资源请求应有响应", async () => {
    const cache: any = await mockSelf.caches.open("hxwl-07-runtime-v1");
    await cache.put(
      `${SW_BASE_ORIGIN}/assets/style.css`,
      new Response(".test { color: red; }", {
        headers: { "Content-Type": "text/css" },
      })
    );

    const response = await triggerFetchEvent(mockSelf, "/assets/style.css");

    expect(response).toBeDefined();
    expect(response?.status).toBe(200);
  });
});

describe("Service Worker - 后台同步", () => {
  let mockSelf: SWGlobal;

  beforeEach(() => {
    mockSelf = createMockSWContext();
    evaluateSWInContext(mockSelf);
  });

  it("应注册 sync 事件监听器", () => {
    expect(mockSelf.addEventListener).toHaveBeenCalledWith("sync", expect.any(Function));
  });

  it("sync-queue 标签应通知客户端", async () => {
    const mockClient = {
      postMessage: vi.fn(),
    };
    mockSelf.clients.matchAll.mockResolvedValue([mockClient]);

    const handlers = mockSelf._eventHandlers.get("sync");
    expect(handlers).toBeDefined();

    const event: any = {
      tag: "sync-queue",
      waitUntil: vi.fn((promise: Promise<any>) => {
        return promise;
      }),
    };

    handlers!.forEach((handler) => handler(event));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockSelf.clients.matchAll).toHaveBeenCalled();
    expect(mockClient.postMessage).toHaveBeenCalledWith({
      type: "BACKGROUND_SYNC_TRIGGERED",
    });
  });
});

describe("Service Worker - 缓存版本管理", () => {
  it("应有明确的缓存版本号", () => {
    const swCode = loadSWCode();
    expect(swCode).toMatch(/CACHE_VERSION\s*=\s*["']/);
    expect(swCode).toMatch(/RUNTIME_CACHE_VERSION\s*=\s*["']/);
  });

  it("应定义预缓存URL列表", () => {
    const swCode = loadSWCode();
    expect(swCode).toMatch(/PRECACHE_URLS/);
    expect(swCode).toMatch(/\/index\.html/);
    expect(swCode).toMatch(/\/offline\.html/);
  });

  it("激活时只保留当前版本缓存", async () => {
    const mockSelf = createMockSWContext();
    evaluateSWInContext(mockSelf);

    const oldVersionCache = "hxwl-07-v0";
    const oldRuntimeCache = "hxwl-07-runtime-v0";
    const unrelatedCache = "some-other-cache";

    mockSelf._caches.set(oldVersionCache, { name: oldVersionCache, entries: new Map() });
    mockSelf._caches.set(oldRuntimeCache, { name: oldRuntimeCache, entries: new Map() });
    mockSelf._caches.set(unrelatedCache, { name: unrelatedCache, entries: new Map() });

    await triggerActivateEvent(mockSelf);

    const cacheNames = await mockSelf.caches.keys();
    expect(cacheNames).not.toContain(oldVersionCache);
    expect(cacheNames).not.toContain(oldRuntimeCache);
    expect(cacheNames).not.toContain(unrelatedCache);
  });
});
