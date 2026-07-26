/* Forecourt Empire — service worker.

   Update policy: NETWORK FIRST for everything on this origin.
   An online player always gets the freshest file, so a deploy reaches them on
   their next load with nothing to clear and nothing to tap. The cache exists
   purely as the offline fallback, and is refreshed on every successful fetch.

   Combined with skipWaiting + clients.claim below (and the reload-on-
   controllerchange in index.html), a new build takes over immediately rather
   than sitting in "waiting" until every tab is closed — which is the usual way
   PWAs end up serving month-old code.

   Bump VERSION on any deploy that must invalidate the offline copy. */
var VERSION = 'fe-2026-07-26-c';
var CACHE = 'forecourt-empire-' + VERSION;
var ASSETS = [
  './', './index.html', './style.css',
  './data.js', './engine.js', './scene.js', './juice.js', './minigames.js', './ui.js',
  './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) {
        return Promise.all(ASSETS.map(function (u) {
          return fetch(u, { cache: 'no-store' }).then(function (r) { if (r.ok) return c.put(u, r); });
        }));
      })
      .catch(function () { /* a missing asset must not block the install */ })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE && k.indexOf('forecourt-empire-') === 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // leave third parties alone

  // `cache: 'no-store'` matters: a plain fetch() here is still served by the
  // browser's own HTTP cache, which was quietly handing back the previous build
  // and defeating the whole network-first policy. Go to the network for real.
  var fresh;
  try {
    fresh = fetch(req, { cache: 'no-store' });
  } catch (err) {
    fresh = fetch(req);
  }

  e.respondWith(
    fresh.then(function (res) {
      // keep the offline copy current
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        // an unseen page while offline still gets the app shell
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});

// lets the page ask a waiting worker to take over straight away
self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
