/* Snooker Tracker service worker.
   Caches the app shell (this HTML file + its icons) so the browser can
   install it and reopen it offline — the same spirit as the Firestore
   offline persistence already enabled in the app. Live data (players/
   frames/matches) still goes straight to Firestore, which has its own
   offline queue; this worker only shortcuts the shell.

   Strategy: NETWORK-FIRST for the HTML shell (index.html / navigations),
   so a fresh push shows up the very next load instead of needing 1-2 extra
   reloads to "outrun" a stale cache. Falls back to the cached copy only
   when there's genuinely no connection. Icons/manifest rarely change, so
   those stay cache-first for speed. */

const CACHE_NAME = 'snooker-tracker-v2';
const APP_SHELL = [
  './',
  './index.html',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];
const NETWORK_FIRST_PATHS = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === 'navigate';
  const isNetworkFirstAsset = NETWORK_FIRST_PATHS.some((path) => url.pathname.endsWith(path.replace('./', '')) || url.pathname === '/');
  const isShellAsset = APP_SHELL.some((path) => url.pathname.endsWith(path.replace('./', '')));

  if (isNavigation || isNetworkFirstAsset) {
    // Try the network first so a new deploy is visible immediately;
    // only fall back to the cached shell if the network request fails.
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  if (isShellAsset) {
    // Icons/manifest: cache-first is fine, these almost never change.
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
  }
  // Everything else (Firestore, Firebase SDK, fonts) — untouched, straight to network.
});
