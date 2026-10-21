/* Car Tinder service worker: caches the app shell, serves offline.html when
   there is no connection, network first for stock data, and handles push. */
const V = 'ct-v3';
const SHELL = ['./', './index.html', './app.css', './app.js', './config.js', './match-core.js', './offline.html',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', '../stock-core.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(x => x.put('./index.html', c)); return res; })
      .catch(() => caches.match('./index.html').then(m => m || caches.match('./offline.html'))));
    return;
  }
  if (/\/lookup\/stock\.json$|MBG\.html$/.test(u.pathname)) {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); return res; }).catch(() => caches.match(r)));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r)));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || 'New match for you', {
    body: d.body || 'Open Car Tinder to see it.', icon: 'icons/icon-192.png', badge: 'icons/maskable-192.png',
    image: d.image || undefined, data: { url: d.url || './#matches' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => { for (const c of cs) if ('focus' in c) { c.navigate(url); return c.focus(); } return self.clients.openWindow(url); }));
});
