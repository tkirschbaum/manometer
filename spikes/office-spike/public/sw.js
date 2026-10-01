/* Phase 0 spike service worker: only registered on demand (T10). Network first,
 * cache fallback, for the spike shell and the Office.js CDN. Tells us whether an
 * add-in page can still start inside PowerPoint when the server is unreachable. */
var CACHE = 'pulse-spike-v1';
var SHELL = ['/index.html', '/spike.js', '/spike.css', '/assets/icon-32.png'];
var fallbacks = 0;
var lastFallback = null;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

function cacheable(url) {
  if (url.hostname === 'appsforoffice.microsoft.com') return true;
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/spike.js' ||
    url.pathname === '/spike.css' ||
    url.pathname.indexOf('/assets/') === 0
  );
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (!cacheable(url)) return;
  event.respondWith(
    fetch(request)
      .then(function (response) {
        if (response.ok || response.type === 'opaque') {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      })
      .catch(function () {
        return caches.match(request, { ignoreSearch: true }).then(function (hit) {
          if (!hit) return Response.error();
          fallbacks += 1;
          lastFallback = { path: url.hostname + url.pathname, at: new Date().toISOString() };
          return hit;
        });
      }),
  );
});

self.addEventListener('message', function (event) {
  if (event.data !== 'status' || !event.ports || !event.ports[0]) return;
  caches
    .open(CACHE)
    .then(function (cache) {
      return cache.keys();
    })
    .then(function (keys) {
      event.ports[0].postMessage({
        fallbacks: fallbacks,
        lastFallback: lastFallback,
        cachedEntries: keys.length,
      });
    });
});
