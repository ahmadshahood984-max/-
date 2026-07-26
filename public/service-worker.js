const CACHE_NAME = 'school-pwa-v2';

// Install Event - skip waiting immediately
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// Activate Event - clear ALL old caches immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Always Network-First to guarantee latest code updates
self.addEventListener('fetch', (e) => {
  // Ignore non-GET, firestore, API, or hot-update requests
  if (e.request.method !== 'GET' || e.request.url.includes('firestore.googleapis.com') || e.request.url.includes('/api/')) {
    return;
  }
  
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && e.request.url.startsWith(self.location.origin)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache only when offline
        return caches.match(e.request);
      })
  );
});

