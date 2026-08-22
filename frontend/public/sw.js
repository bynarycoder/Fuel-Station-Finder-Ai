/* Fuel Station Finder AI — service worker (Phase 11 PWA).

Strategy (runtime, careful by design):
  * Navigation requests (HTML documents): NETWORK-FIRST, ALWAYS. The previous
    strategy served the precached "/" cache-first, so phones kept running the
    OLD app bundle after a deploy — the exact reason a deployed location fix
    did not reach users. Fresh HTML always references fresh content-hashed
    JS chunks. Offline, navigations fall back to the cached page, else the
    offline page.
  * /_next/static/* (immutable, content-hashed): cache-first — safe forever.
  * Other same-origin GETs (icons, manifest): stale-while-revalidate.
  * PUBLIC station catalogue API GETs (backend origin, "/stations" list):
    stale-while-revalidate — cached catalogue remains browsable offline and is
    clearly labelled by the OfflineBanner.
  * NEVER cached: /stations/nearby and /stations/search (location-specific —
    a cached response from another city must never be reused), anything with
    an Authorization header, non-GET methods, /admin.
  * CACHE_VERSION is bumped on every behavioral SW change: activate() deletes
    every cache whose name does not start with the current version, wiping
    stale shells AND stale API responses written by older workers.
*/

const CACHE_VERSION = "fsf-v2";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-stations`;

const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      // NOTE: "/" is deliberately NOT precached — a precached HTML shell is
      // served stale after deploys. Only the offline fallback page is.
      .then((cache) => cache.addAll([OFFLINE_URL, "/manifest.webmanifest"]))
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
  // /nearby and /search depend on the caller's location and must always hit
  // the network: reusing another city's response was a production bug.
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

  // 1) Public station catalogue API — stale-while-revalidate (never /nearby).
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

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // 2) Navigations — NETWORK-FIRST so a deploy reaches every device on the
  //    next load. Cached document (then offline page) only when offline.
  if (sameOrigin && request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches
              .open(APP_SHELL_CACHE)
              .then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(OFFLINE_URL);
        }),
    );
    return;
  }

  // 3) Immutable Next.js build assets — content-hashed, cache-first forever.
  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(APP_SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        });
      }),
    );
    return;
  }

  // 4) Other same-origin static assets (icons, manifest) — SWR.
  if (sameOrigin) {
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

  // 5) Cross-origin navigations — network-first, offline page fallback.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
