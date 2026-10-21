/* The app moved to /swipe-drive/. Any copy installed at the old path clears its cache and steps aside. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => /^ct-v/.test(k)).map(k => caches.delete(k))))
  .then(() => self.registration.unregister()).then(() => self.clients.matchAll()).then(cs => cs.forEach(c => c.navigate('../swipe-drive/')))); });
