/* Snooker Tracker service worker.
   Caches the app shell (this HTML file + its icons) so the browser can
   install it and reopen it instantly even with no signal — the same
   spirit as the Firestore offline persistence already enabled in the app.
   Live data (players/frames/matches) still goes straight to Firestore,
   which has its own offline queue; this worker only shortcuts the shell. */

const CACHE_NAME = 'snooker-tracker-v1';
const APP_SHELL = [
  './',
  './index.html',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

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

/* Cache-first for the app shell itself; everything else (Firestore, fonts,
   the Firebase SDK scripts) just goes to the network as normal — we don't
   want to intercept and stale-cache live data. */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isShellRequest = event.request.mode === 'navigate' ||
    APP_SHELL.some((path) => url.pathname.endsWith(path.replace('./', '')));

  if (!isShellRequest) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => cached);
    })
  );
});
