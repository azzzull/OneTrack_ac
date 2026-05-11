/**
 * Service Worker for background sync and offline handling
 */

const CACHE_NAME = "onetrack-v2";
const URLS_TO_CACHE = ["/", "/index.html", "/manifest.json"];

// Install event - cache static assets
self.addEventListener("install", (event) => {
    console.log("[SW] Installing Service Worker");
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log("[SW] Caching assets");
            return cache.addAll(URLS_TO_CACHE);
        }),
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
    console.log("[SW] Activating Service Worker");
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log("[SW] Deleting old cache:", cacheName);
                        return caches.delete(cacheName);
                    }
                }),
            );
        }),
    );
    self.clients.claim();
});

// Fetch event - implement fallback for offline
self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    const requestUrl = new URL(event.request.url);
    const isSameOrigin = requestUrl.origin === self.location.origin;
    const isApiRequest =
        requestUrl.pathname.startsWith("/rest/v1") ||
        requestUrl.pathname.startsWith("/storage/v1") ||
        requestUrl.hostname.includes("supabase");

    if (!isSameOrigin || isApiRequest) {
        // Never cache API or cross-origin requests
        return;
    }

    const isNavigation = event.request.mode === "navigate";

    if (isNavigation) {
        // Network-first for navigation to avoid stale app shell
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put("/", responseToCache);
                    });
                    return response;
                })
                .catch(() => caches.match("/") || caches.match("/index.html")),
        );
        return;
    }

    // Cache-first for static assets
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return fetch(event.request).then((response) => {
                if (
                    !response ||
                    response.status !== 200 ||
                    response.type === "error"
                ) {
                    return response;
                }
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return response;
            });
        }),
    );
});

// Background sync event - retry upload of queued photos
self.addEventListener("sync", (event) => {
    console.log("[SW] Background sync triggered:", event.tag);

    if (event.tag === "sync-offline-uploads") {
        event.waitUntil(
            (async () => {
                try {
                    // Send message to all clients to trigger upload sync
                    const clients = await self.clients.matchAll();
                    clients.forEach((client) => {
                        client.postMessage({
                            type: "SYNC_OFFLINE_UPLOADS",
                            timestamp: Date.now(),
                        });
                    });
                    console.log("[SW] Sync message sent to clients");
                } catch (error) {
                    console.error("[SW] Background sync error:", error);
                    throw error; // Retry sync
                }
            })(),
        );
    }
});

// Listen for messages from clients (foreground pages)
self.addEventListener("message", (event) => {
    console.log("[SW] Message received:", event.data.type);

    if (event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }

    if (event.data.type === "TRIGGER_SYNC") {
        // Trigger background sync for offline uploads
        if (self.registration && self.registration.sync) {
            self.registration.sync.register("sync-offline-uploads");
            console.log("[SW] Sync registration triggered");
        }
    }
});

console.log("[SW] Service Worker loaded");
