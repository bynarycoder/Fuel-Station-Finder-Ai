/* Fuel Station Finder AI — service worker (Phase 11 PWA).

Strategy (runtime, careful by design):
  * Navigation requests: network-first, falling back to the cached offline
    page when the network is unreachable.
  * Same-origin static assets (JS/CSS/images): cache-first with background
    revalidation, so the app shell loads instantly on repeat visits.
  * PUBLIC station API GETs (the backend origin, paths containing
    "/stations"): stale-while-revalidate — cached station catalogue remains
    browsable offline and is clearly labelled by the OfflineBanner.
  * NEVER cached: requests with an Authorization header (auth/admin/reports
    POSTs), non-GET methods, or anything outside the public station paths.
  * Version bump CACHE_VERSION to invalidate old caches on deploy.
*/

const CACHE_VERSION = "fsf-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-stations`;

const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/", "/manifest.webmanifest"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Is this a public stations API request we are allowed to cache? */
function isCacheableStationApi(request) {
  if (request.method !== "GET") return false;
  if (request.headers.get("Authorization")) return false;
  const url = new URL(request.url);
  // Backend origin (configurable) — cache only the public station catalogue.
  return (
    url.origin !== self.location.origin &&
    /\/stations(\/|$|\?)/.test(url.pathname) &&
    !url.pathname.includes("/search") &&
    !url.pathname.includes("/nearby") &&
    !url.pathname.includes("/admin")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GETs.
  if (request.method !== "GET") return;

  // 1) Public station API — stale-while-revalidate.
  if (isCacheableStationApi(request)) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // 2) Same-origin static assets — cache-first with background refresh.
  if (request.url.startsWith(self.location.origin)) {
    // Never cache the offline/admin/auth pages' HTML themselves (auth state).
    const url = new URL(request.url);
    if (
      request.mode === "navigate" &&
      (url.pathname.startsWith("/admin") || url.pathname.startsWith("/about"))
    ) {
      event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
      return;
    }
    event.respondWith(
      caches.open(APP_SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && (response.ok || response.type === "opaque")) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // 3) Navigation (other origins) — network-first, offline page fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    );
  }
});
