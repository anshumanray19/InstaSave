/* OmniSave service worker — enables installability + basic offline shell.
   Strategy: network-first for the app shell (so code updates always flow),
   falling back to cache when offline. API/proxy requests are never cached. */
const CACHE = 'omnisave-v1';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache API calls, media proxies, or SSE — always go to the network.
  if (url.pathname.startsWith('/api/')) return;
  // Only handle same-origin requests; let the browser deal with the rest (fonts, CDNs).
  if (url.origin !== self.location.origin) return;

  // Network-first: fresh content when online, cached shell when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
  );
});
