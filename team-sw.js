/* Team app service worker. Only the team pages and their files are handled;
   every other request on the site goes straight to the network untouched.
   Network first, so a new push shows up on the next open; the cache is only
   a fallback when there is no signal. Bump VERSION to clear old copies. */
'use strict';
const VERSION = 'team-v1';
const PAGES = ['/team.html', '/shifts.html', '/team-admin.html', '/lockup.html', '/Forecourt.html'];
const FILES = ['/team.css', '/favicon.svg', '/apple-touch-icon.png', '/team-icon-192.png', '/team-icon-512.png', '/team.webmanifest', '/team-pwa.js',
  '/lockup-rota.js', '/shifts-rota.js', '/shifts-app.js', '/team-home.js', '/team-identity.js', '/team-session.js', '/team-admin.js',
  '/staff-gate.js', '/contact.js', '/disclaimer.js', '/forecourt-stock.js', '/scroll-hint.js'];
const MINE = new Set(PAGES.concat(FILES));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PAGES.concat(FILES)).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('team-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin || !MINE.has(u.pathname)) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(u.pathname, copy)); }
    return res;
  }).catch(() => caches.match(u.pathname).then(r => r || Response.error())));
});
