/* Makes the team pages installable and keeps installed copies current:
   when a new version of the app is published, the page reloads itself once
   (unless someone is typing), so nobody is left on an old copy. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  var had = !!navigator.serviceWorker.controller, reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!had) { had = true; return; }
    if (reloaded) return;
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    reloaded = true; location.reload();
  });
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/team-sw.js', { scope: '/' }).then(function (r) {
      setInterval(function () { r.update().catch(function () {}); }, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) r.update().catch(function () {}); });
    }).catch(function () {});
  });
})();
