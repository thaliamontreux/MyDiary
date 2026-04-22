const CACHE_NAME = 'mydiary-v2';
const STATIC_ASSETS = ['/', '/index.html', '/src/main.js', '/src/ui.js', '/src/style.css'];

// Network-first for HTML/JS to always get fresh app, cache-first for assets
const NETWORK_FIRST_PATTERNS = [/^\/$/, /\/index\.html$/, /\.js$/, /\.css$/];

function isNetworkFirst(url) {
  return NETWORK_FIRST_PATTERNS.some((p) => p.test(url.pathname));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Force activate new service worker immediately when message received
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;

  // Network-first strategy: try network first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update cache with fresh response
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          throw new Error('Network error and no cache available');
        });
      })
  );
});
