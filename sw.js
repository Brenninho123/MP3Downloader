const CACHE_NAME = 'mp3downloader-shell-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './arts/iconYT.png'
];

const RUNTIME_DENYLIST = [
  'api.cobalt.tools',
  'cobalt.api.scrapes.pro',
  'dwnld.nichind.dev',
  'inv.riverside.rocks',
  'invidious.nerdvpn.de',
  'vid.puffyan.us',
  'yt.artemislena.eu',
  'invidious.jing.rocks',
  'youtube.com',
  'ytimg.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

function isRuntimeExcluded(url) {
  return RUNTIME_DENYLIST.some((host) => url.hostname.includes(host));
}

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (isRuntimeExcluded(requestUrl)) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            requestUrl.origin === self.location.origin
          ) {
            const clonedResponse = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clonedResponse);
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
