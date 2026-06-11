/**
 * Service Worker for background sync and offline handling
 */

const CACHE_NAME = "onetrack-v2";
const URLS_TO_CACHE = [
    "/",
    "/index.html",
    "/manifest.webmanifest",
    "/OneTrackLogo.svg",
    "/apple-touch-icon.png",
];

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

self.addEventListener("push", (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        payload = { body: event.data?.text() };
    }

    const title = payload.title || "OneTrack";
    const options = {
        body: payload.body || "",
        icon: payload.icon || "/icons/icon-192.webp",
        badge: payload.badge || "/icons/icon-96.webp",
        data: payload.data || payload,
        tag: payload.tag || payload.type || "onetrack-notification",
        renotify: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const data = event.notification.data || {};
    const referenceTable = String(
        data.referenceTable || data.reference_table || "",
    ).toLowerCase();
    let targetUrl = "/";

    if (referenceTable === "requests" || referenceTable === "jobs") {
        targetUrl = "/requests";
    } else if (referenceTable === "overtime_requests") {
        targetUrl = "/overtime";
    } else if (referenceTable.includes("attendance")) {
        targetUrl = "/admin/attendance";
    } else if (referenceTable.includes("accommodation")) {
        targetUrl = "/admin/accommodation";
    }

    event.waitUntil(
        self.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((clients) => {
                const existingClient = clients.find((client) =>
                    client.url.startsWith(self.location.origin),
                );
                if (existingClient) {
                    existingClient.focus();
                    return existingClient.navigate(targetUrl);
                }
                return self.clients.openWindow(targetUrl);
            }),
    );
});

console.log("[SW] Service Worker loaded");
