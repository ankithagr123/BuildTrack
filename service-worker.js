const CACHE_NAME = 'buildtrack-shell-v6';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './assets/logo.svg',
  './assets/avatar.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './js/data.js',
  './js/app.js',
  './js/dashboard.js',
  './js/projects.js',
  './js/tasks.js',
  './js/labour.js',
  './js/materials.js',
  './js/finance.js',
  './js/progress.js',
  './js/risks.js',
  './js/reports.js',
  './js/settings.js',
  './js/pwa.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('buildtrack-shell-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    // Keep successful CDN responses (for example Chart.js) available after
    // their first online use. Opaque responses are valid cache entries too.
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
          return response;
        } catch (error) {
          return new Response('', { status: 503, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
