/**
 * Traceable Progressive Web App — Production Service Worker
 * 
 * STRICT REALTIME POLICY:
 * This service worker NEVER caches or intercepts WebSocket connections,
 * Socket.io polling, room state, or dynamic collaborative data.
 * All realtime multiplayer traffic bypasses this worker completely.
 */

const CACHE_NAME = 'traceable-shell-v1.0.2';

const STATIC_PRECACHE_ASSETS = [
  './',
  'index.html',
  'style.css',
  'client.js',
  'pwa.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'
];

// 1. Installation — Precache static shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Use individual caching with catch to avoid install failure if an external font is blocked
      for (const asset of STATIC_PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[Traceable SW] Failed to precache asset:', asset, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// 2. Activation — Clean up obsolete caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Traceable SW] Removing obsolete cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch — Safe caching strategy respecting realtime WebSocket multiplayer data
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests; never intercept POST, PUT, DELETE
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Bypass chrome-extension and non-HTTP protocols
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // STRICT BYPASS: NEVER cache Socket.io transport, WebSockets, or live API endpoints
  if (
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/api') ||
    request.headers.get('Upgrade') === 'websocket'
  ) {
    return;
  }

  // Strategy A: HTML Navigation (Network-First with Cache Fallback)
  // Ensures users ALWAYS get latest deployed code on Vercel, but can launch offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('index.html');
          if (fallback) return fallback;
          return caches.match('./');
        })
    );
    return;
  }

  // Strategy B: Static assets, fonts, icons (Stale-While-Revalidate)
  // Provides instant load time while keeping cache fresh in the background
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failure is fine if cachedResponse is available
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Message Handler for manual update triggers
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
