const SW_VERSION = 'v2';
const STATIC_CACHE = `mp3downloader-static-${SW_VERSION}`;
const RUNTIME_CACHE = `mp3downloader-runtime-${SW_VERSION}`;
const MAX_RUNTIME_ITEMS = 60;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './arts/iconYT.png'
];

const RUNTIME_HOST_DENYLIST = [
  'api.cobalt.tools',
  'cobalt.api.scrapes.pro',
  'dwnld.nichind.dev',
  'api.invidious.io',
  'inv.riverside.rocks',
  'invidious.nerdvpn.de',
  'vid.puffyan.us',
  'yt.artemislena.eu',
  'invidious.jing.rocks'
];

const CACHEABLE_THUMBNAIL_HOSTS = [
  'img.youtube.com',
  'i.ytimg.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const staleKeys = keys.filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE);
      return Promise.all(staleKeys.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
     .then(() => notifyClients({ type: 'SW_ACTIVATED', version: SW_VERSION }))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_RUNTIME_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE));
  }
});

function notifyClients(message) {
  return self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => client.postMessage(message));
  });
}

function isHostDenied(url) {
  return RUNTIME_HOST_DENYLIST.some((host) => url.hostname.includes(host));
}

function isCacheableThumbnail(url) {
  return CACHEABLE_THUMBNAIL_HOSTS.some((host) => url.hostname.includes(host));
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  const overflow = keys.length - maxItems;
  for (let i = 0; i < overflow; i++) {
    await cache.delete(keys[i]);
  }
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (e) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    return caches.match('./index.html');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cachedResponse = await cache.match(request);

  const networkFetch = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        cache.put(request, networkResponse.clone());
        trimCache(RUNTIME_CACHE, MAX_RUNTIME_ITEMS);
      }
      return networkResponse;
    })
    .catch(() => null);

  return cachedResponse || (await networkFetch) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);

  if (isHostDenied(requestUrl)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (requestUrl.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (isCacheableThumbnail(requestUrl)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});
