const CACHE_VERSION = "hxwl-07-v1";
const RUNTIME_CACHE_VERSION = "hxwl-07-runtime-v1";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/offline.html"
];

const CACHE_STRATEGIES = {
  STATIC: [
    /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/i,
  ],
  API: [
    /^https?:\/\/[^/]+\/api\//i,
  ]
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log("[SW] Pre-caching core assets:", PRECACHE_URLS);
      return cache.addAll(PRECACHE_URLS).catch((error) => {
        console.warn("[SW] Pre-cache failed (some assets may not be available offline):", error);
        return Promise.all(
          PRECACHE_URLS.map(url => 
            cache.add(url).catch(() => console.warn(`[SW] Skipped: ${url}`))
          )
        );
      });
    }).then(() => {
      console.log("[SW] Installation complete, skipping waiting");
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((cacheName) => {
          const isCurrentVersion = cacheName === CACHE_VERSION;
          const isCurrentRuntime = cacheName === RUNTIME_CACHE_VERSION;
          if (!isCurrentVersion && !isCurrentRuntime) {
            console.log("[SW] Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
          return false;
        }).filter(Boolean)
      );
    }).then(() => {
      console.log("[SW] Activation complete, claiming clients");
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  const isStaticAsset = CACHE_STRATEGIES.STATIC.some(regex => regex.test(request.url));
  const isHTMLRequest = request.mode === "navigate" || request.destination === "document";
  const isSameOrigin = url.origin === self.location.origin;

  if (isHTMLRequest && isSameOrigin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return caches.match("/offline.html");
          });
        })
    );
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          const fetchPromise = fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(RUNTIME_CACHE_VERSION).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          }).catch(() => cachedResponse);
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(RUNTIME_CACHE_VERSION).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {
          return new Response("Offline", { status: 503 });
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
      const responseClone = response.clone();
      caches.open(RUNTIME_CACHE_VERSION).then((cache) => {
        cache.put(request, responseClone);
      });
      return response;
    })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (isHTMLRequest) {
            return caches.match("/offline.html");
          }
          return new Response("Offline", { status: 503 });
        });
      })
  );
});

self.addEventListener("message", (event) => {
  const { type } = event.data;

  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (type === "GET_CACHE_INFO") {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map(name => caches.open(name).then(cache => cache.keys()))
      ).then((results) => {
        const totalAssets = results.reduce((sum, keys) => sum + keys.length, 0);
        event.ports[0].postMessage({
          type: "CACHE_INFO",
          version: CACHE_VERSION,
          cacheNames,
          totalAssets,
          timestamp: Date.now()
        });
      });
    });
    return;
  }

  if (type === "CLEAR_CACHE") {
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.map(name => caches.delete(name)));
    }).then(() => {
      event.ports[0].postMessage({
        type: "CACHE_CLEARED",
        timestamp: Date.now()
      });
    });
    return;
  }

  if (type === "PRECACHE") {
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      event.ports[0].postMessage({
        type: "PRECACHE_COMPLETE",
        urls: PRECACHE_URLS,
        timestamp: Date.now()
      });
    }).catch((error) => {
      event.ports[0].postMessage({
        type: "PRECACHE_FAILED",
        error: String(error),
        timestamp: Date.now()
      });
    });
    return;
  }
});

self.addEventListener("sync", (event) => {
  console.log("[SW] Background sync event:", event.tag);
  if (event.tag === "sync-queue") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "BACKGROUND_SYNC_TRIGGERED" });
        });
        return Promise.resolve();
      })
    );
  }
});

console.log("[SW] Service worker loaded");
