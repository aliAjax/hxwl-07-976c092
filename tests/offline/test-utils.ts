import { beforeEach, vi } from "vitest";

export interface MockCache {
  name: string;
  entries: Map<string, Response>;
}

export interface MockServiceWorker {
  state: string;
  scriptURL: string;
  postMessage: ReturnType<typeof vi.fn>;
}

export interface MockServiceWorkerRegistration {
  active: MockServiceWorker | null;
  waiting: MockServiceWorker | null;
  installing: MockServiceWorker | null;
  scope: string;
  update: ReturnType<typeof vi.fn>;
  unregister: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  sync?: {
    register: ReturnType<typeof vi.fn>;
  };
}

export interface MockBroadcastChannel {
  name: string;
  postMessage: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  _listeners: Map<string, Set<(event: any) => void>>;
  _simulateMessage: (data: any) => void;
}

let mockCaches: Map<string, MockCache> = new Map();
let mockRegistrations: MockServiceWorkerRegistration[] = [];
let mockLocalStorage: Map<string, string> = new Map();
let mockOnline: boolean = true;
let mockBroadcastChannels: MockBroadcastChannel[] = [];

export function resetOfflineMocks() {
  mockCaches.clear();
  mockRegistrations = [];
  mockLocalStorage.clear();
  mockOnline = true;
  mockBroadcastChannels = [];
  vi.clearAllTimers();
}

export function setOnlineStatus(online: boolean) {
  mockOnline = online;
  const event = new Event(online ? "online" : "offline");
  window.dispatchEvent(event);
}

export function getMockCaches(): Map<string, MockCache> {
  return mockCaches;
}

export function getMockLocalStorage(): Map<string, string> {
  return mockLocalStorage;
}

export function getMockRegistrations(): MockServiceWorkerRegistration[] {
  return mockRegistrations;
}

export function createMockResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: init.status || 200,
    statusText: init.statusText || "OK",
    headers: init.headers || {},
  });
}

export function setupOfflineMocks() {
  beforeEach(() => {
    resetOfflineMocks();
    setupMockNavigator();
    setupMockCaches();
    setupMockLocalStorage();
    setupMockBroadcastChannel();
    setupMockFetch();
  });
}

function setupMockNavigator() {
  Object.defineProperty(navigator, "onLine", {
    get: () => mockOnline,
    configurable: true,
  });

  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      register: vi.fn(async (scriptURL: string, options?: RegistrationOptions) => {
        const sw: MockServiceWorker = {
          state: "installing",
          scriptURL,
          postMessage: vi.fn(),
        };

        const registration: MockServiceWorkerRegistration = {
          active: null,
          waiting: null,
          installing: sw,
          scope: options?.scope || "/",
          update: vi.fn().mockResolvedValue(undefined),
          unregister: vi.fn().mockResolvedValue(true),
          addEventListener: vi.fn(),
        };

        mockRegistrations.push(registration);

        queueMicrotask(() => {
          sw.state = "installed";
          const updatefoundListeners = (registration as any)._updatefoundListeners || [];
          updatefoundListeners.forEach((fn: () => void) => fn());
        });

        return registration;
      }),
      getRegistration: vi.fn().mockResolvedValue(null),
      getRegistrations: vi.fn().mockResolvedValue([]),
      addEventListener: vi.fn(),
      controller: null,
    },
    writable: true,
    configurable: true,
  });
}

function setupMockCaches() {
  const cachesMock = {
    open: vi.fn(async (cacheName: string) => {
      if (!mockCaches.has(cacheName)) {
        mockCaches.set(cacheName, {
          name: cacheName,
          entries: new Map(),
        });
      }
      const cache = mockCaches.get(cacheName)!;
      return {
        match: vi.fn(async (request: RequestInfo) => {
          const url = typeof request === "string" ? request : request.url;
          return cache.entries.get(url) || undefined;
        }),
        put: vi.fn(async (request: RequestInfo, response: Response) => {
          const url = typeof request === "string" ? request : request.url;
          cache.entries.set(url, response.clone());
        }),
        add: vi.fn(async (request: RequestInfo) => {
          const url = typeof request === "string" ? request : request.url;
          const response = createMockResponse(`Mock content for ${url}`);
          cache.entries.set(url, response);
        }),
        addAll: vi.fn(async (requests: RequestInfo[]) => {
          for (const req of requests) {
            const url = typeof req === "string" ? req : req.url;
            const response = createMockResponse(`Mock content for ${url}`);
            cache.entries.set(url, response);
          }
        }),
        delete: vi.fn(async (request: RequestInfo) => {
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
    match: vi.fn(async (request: RequestInfo) => {
      const url = typeof request === "string" ? request : request.url;
      for (const cache of mockCaches.values()) {
        const response = cache.entries.get(url);
        if (response) return response;
      }
      return undefined;
    }),
    keys: vi.fn(async () => Array.from(mockCaches.keys())),
    delete: vi.fn(async (cacheName: string) => {
      return mockCaches.delete(cacheName);
    }),
    has: vi.fn(async (cacheName: string) => mockCaches.has(cacheName)),
  };

  (window as any).caches = cachesMock;
  (globalThis as any).caches = cachesMock;
}

function setupMockLocalStorage() {
  const localStorageMock = {
    getItem: vi.fn((key: string) => {
      return mockLocalStorage.get(key) || null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      mockLocalStorage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      mockLocalStorage.delete(key);
    }),
    clear: vi.fn(() => {
      mockLocalStorage.clear();
    }),
    key: vi.fn((index: number) => {
      return Array.from(mockLocalStorage.keys())[index] || null;
    }),
    get length() {
      return mockLocalStorage.size;
    },
  };

  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
}

function setupMockBroadcastChannel() {
  (window as any).BroadcastChannel = vi.fn((name: string) => {
    const listeners = new Map<string, Set<(event: any) => void>>();

    const channel: MockBroadcastChannel = {
      name,
      postMessage: vi.fn((data: any) => {
        const messageEvent = { data, source: channel };
        const messageListeners = listeners.get("message");
        if (messageListeners) {
          messageListeners.forEach((fn) => fn(messageEvent));
        }
      }),
      addEventListener: vi.fn((type: string, listener: (event: any) => void) => {
        if (!listeners.has(type)) {
          listeners.set(type, new Set());
        }
        listeners.get(type)!.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: (event: any) => void) => {
        listeners.get(type)?.delete(listener);
      }),
      close: vi.fn(),
      _listeners: listeners,
      _simulateMessage: (data: any) => {
        const messageEvent = { data, source: channel };
        const messageListeners = listeners.get("message");
        if (messageListeners) {
          messageListeners.forEach((fn) => fn(messageEvent));
        }
      },
    };

    mockBroadcastChannels.push(channel);
    return channel;
  });
}

function setupMockFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;

    if (url === "/" || url === "/index.html" || url === "/offline.html" || url === "/sw.js") {
      return createMockResponse(`<html><body>Mock ${url}</body></html>`);
    }

    if (url.startsWith("/api/")) {
      return createMockResponse(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return createMockResponse("Not Found", { status: 404 });
  }));
}

export function simulateSWStateChange(
  registration: MockServiceWorkerRegistration,
  worker: MockServiceWorker,
  newState: string
) {
  worker.state = newState;
  const statechangeListeners = (worker as any)._statechangeListeners || [];
  statechangeListeners.forEach((fn: () => void) => fn());
}

export function activateSW(registration: MockServiceWorkerRegistration) {
  if (registration.installing) {
    registration.active = registration.installing;
    registration.installing = null;
    (registration.active as MockServiceWorker).state = "activated";
    simulateSWStateChange(registration, registration.active, "activated");
  }
}

export function getBroadcastChannel(name: string): MockBroadcastChannel | undefined {
  return mockBroadcastChannels.find((c) => c.name === name);
}

export function simulateStorageEvent(key: string, newValue: string | null) {
  const event = new StorageEvent("storage", {
    key,
    newValue,
    oldValue: null,
    url: window.location.href,
    storageArea: localStorage,
  });
  window.dispatchEvent(event);
}

export async function flushPromisesAndTimers() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.runAllTimers();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
