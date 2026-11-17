/* SwipeToDrive cookie consent. Google Analytics (GA4) is not loaded, and no analytics cookie is set, until the
   visitor taps Accept on a small bar. No thanks, or no answer yet, means nothing loads. The choice is kept on the
   device and can be changed from Cookie settings on the Me screen and the guest menu (window.ctConsent.open()).
   While analytics is off, window.gtag is not defined, so app.js track() and ../analytics.js do nothing. */
(function () {
  'use strict';
  var KEY = 'sd_cookie_consent_v1', GA = 'G-XZL1RF6SV6';
  function get() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function put(v) { try { localStorage.setItem(KEY, v); localStorage.setItem(KEY + '_at', new Date().toISOString()); } catch (e) {} }
  function load() {
    if (window.__sdGa) return; window.__sdGa = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date()); window.gtag('config', GA);
    var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA; document.head.appendChild(s);
  }
  /* turning analytics off after it was on: stop sending and clear the GA cookies this site set */
  function unload() {
    try { window['ga-disable-' + GA] = true; } catch (e) {}
    document.cookie.split(';').forEach(function (c) { var n = c.split('=')[0].trim(); if (/^_ga/.test(n)) {
      document.cookie = n + '=; Max-Age=0; path=/'; document.cookie = n + '=; Max-Age=0; path=/; domain=.' + location.hostname.replace(/^www\./, ''); } });
  }
  var CSS = '.sd-cc{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:45;max-width:520px;margin:0 auto;display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;' +
    'padding:10px 12px;border-radius:14px;background:rgba(16,19,24,.96);border:1px solid rgba(236,233,225,.16);box-shadow:0 10px 30px rgba(0,0,0,.45);color:#cfcabf;font:12.5px/1.4 Inter,system-ui,sans-serif}' +
    '.sd-cc p{margin:0;flex:1 1 200px}.sd-cc a{color:#8fb8ff}.sd-cc .sd-cc-b{display:flex;gap:8px;margin-left:auto}' +
    '.sd-cc button{font:600 12.5px Inter,system-ui,sans-serif;border-radius:999px;padding:8px 14px;min-height:36px;cursor:pointer;border:1px solid rgba(236,233,225,.3);background:transparent;color:#ece9e1}' +
    '.sd-cc button.ok{background:#ece9e1;color:#0a0c0f;border-color:#ece9e1}' +
    'body.ct .sd-cc{bottom:calc(84px + env(safe-area-inset-bottom))}';
  var bar = null;
  function close() { if (bar) { bar.remove(); bar = null; } }
  function open() {
    if (bar) return; if (!document.getElementById('sdCcCss')) { var st = document.createElement('style'); st.id = 'sdCcCss'; st.textContent = CSS; document.head.appendChild(st); }
    bar = document.createElement('div'); bar.className = 'sd-cc'; bar.id = 'cookieBar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Cookie choice');
    var now = get();
    bar.innerHTML = '<p>Can we use analytics cookies to see how SwipeToDrive is used? Nothing is collected unless you accept. <a href="privacy.html">Privacy</a></p>' +
      '<div class="sd-cc-b"><button type="button" data-cc="no">No thanks</button><button type="button" class="ok" data-cc="yes">Accept</button></div>' +
      (now ? '<p style="flex-basis:100%;margin:0;color:#9b978d">Right now: ' + (now === 'yes' ? 'accepted' : 'not accepted') + '.</p>' : '');
    bar.addEventListener('click', function (e) { var b = e.target.closest('[data-cc]'); if (!b) return; var v = b.getAttribute('data-cc'); put(v); close();
      if (v === 'yes') load(); else unload(); });
    document.body.appendChild(bar);
  }
  window.ctConsent = { get: get, open: open, close: close, accepted: function () { return get() === 'yes'; } };
  if (get() === 'yes') load();
  else if (!get()) { if (document.body) open(); else document.addEventListener('DOMContentLoaded', open); }
})();
