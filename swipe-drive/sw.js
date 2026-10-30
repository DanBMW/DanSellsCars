/* SwipeToDrive service worker: caches the app shell, serves offline.html when
   there is no connection, network first for stock data, and handles push. */
const V = 'sd-v50';
const SHELL = ['./', './index.html', './app.css', './app.css?v=41', './app.js', './app.js?v=41', './config.js', './config.js?v=41', './auth-ui.js', './auth-ui.js?v=41', './chat/profile-save.js', './chat/profile-save.js?v=41', './match-core.js', './match-core.js?v=41', './offline.html', './premium.css', './premium.css?v=3', './fonts/inter-var.woff2', './fonts/jbmono-500.woff2', './img/empty.svg', './img/hero-i7-800.webp',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/logo.svg', '../motion.css?v=1', '../motion.js?v=1', '../stock-core.js', '../dsfinance.js', '../dsfinance.js?v=41', '../stock-core.js?v=41', './alert-save.js', './alert-save.js?v=41', './crd.js', './crd.js?v=1', './crd.css', './crd.css?v=1', './nostock-ui.js', './nostock-ui.js?v=41', './revvy-flow.js', './revvy-flow.js?v=41', './revvy.js', './revvy.js?v=41', './crm/hub.css', './crm/hub.css?v=41', './crm/hub.js', './crm/hub.js?v=41', './crm/followups-core.js', './crm/followups-core.js?v=41', './crm/followups-ui.js', './crm/followups-ui.js?v=41', '../product-email.js', '../product-email.js?v=41', '../quote-email.js', '../quote-email.js?v=41'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  /* never touch auth callbacks: let the browser go straight to the network */
  if (/[?&](code|token_hash|error_description)=/.test(r.url)) return;
  /* intro video streams from the network (range requests), never cached */
  if (/\/intro\/.*\.mp4$/.test(u.pathname)) return;
  /* chat and quick lane pages: plain network, so they never replace the cached app shell */
  if (r.mode === 'navigate' && /\/chat\//.test(u.pathname)) return;
  /* guest swipe page from the latest stock email: plain network, never cached, never replaces the app shell */
  if (/\/guest\.(html|js|css)$/.test(u.pathname)) return;
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
    body: d.body || 'Open SwipeToDrive to see it.', icon: 'icons/icon-192.png', badge: 'icons/maskable-192.png',
    image: d.image || undefined, data: { url: d.url || './#matches' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => { for (const c of cs) if ('focus' in c) { c.navigate(url); return c.focus(); } return self.clients.openWindow(url); }));
});
