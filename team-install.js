/* team-install.js - the "Get the Ruxley Team app" card on the team home.
 * Android and desktop Chrome: a real Install button (beforeinstallprompt).
 * iPhone and iPad: Share, then Add to Home Screen, with the steps drawn.
 * Hidden when the page is already running as the installed app, and for 14
 * days after Not now. */
(function () {
  'use strict';
  var KEY = 'teamInstallHideUntil', deferred = null;
  function $(id) { return document.getElementById(id); }
  function installed() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true || /[?&]source=app\b/.test(location.search);
  }
  function hidden() { try { return +localStorage.getItem(KEY) > Date.now(); } catch (e) { return false; } }
  function ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function draw() {
    var c = $('install-card');
    if (!c) return;
    if (installed() || hidden()) { c.hidden = true; return; }
    c.hidden = false;
    $('install-go').hidden = !deferred;
    $('install-ios').hidden = !(ios() && !deferred);
    $('install-other').hidden = !!deferred || ios();
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; draw(); });
  window.addEventListener('appinstalled', function () { deferred = null; try { localStorage.setItem(KEY, String(Date.now() + 3650 * 864e5)); } catch (e) {} draw(); });
  document.addEventListener('DOMContentLoaded', function () {
    if (!$('install-card')) return;
    $('install-go').onclick = function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; draw(); }).catch(function () {});
    };
    $('install-later').onclick = function () { try { localStorage.setItem(KEY, String(Date.now() + 14 * 864e5)); } catch (e) {} draw(); };
    draw();
  });
  window.TeamInstall = { draw: draw, installed: installed };
})();
