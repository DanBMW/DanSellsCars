/* Revvy character: animated key fob mascot. Self contained: injects avatars and hooks
   into the match pop up, Book a test drive clicks and deck loading without editing app.js.
   API: window.RevvyChar.make(cls), .set(state, ms) with state idle|wink|heart|thumbs|scan */
(function () {
  var SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 140\" class=\"rvc-svg\" role=\"img\" aria-label=\"Revvy\"><defs><linearGradient id=\"rvcB\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3a3f47\"/><stop offset=\".35\" stop-color=\"#0d0f12\"/><stop offset=\"1\" stop-color=\"#050607\"/></linearGradient><linearGradient id=\"rvcC\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#6d737b\"/><stop offset=\".45\" stop-color=\"#f2f4f6\"/><stop offset=\"1\" stop-color=\"#8a9097\"/></linearGradient><radialGradient id=\"rvcE\" cx=\".45\" cy=\".4\" r=\".6\"><stop offset=\"0\" stop-color=\"#0a1a22\"/><stop offset=\".55\" stop-color=\"#05121a\"/><stop offset=\".72\" stop-color=\"#29e3ff\"/><stop offset=\"1\" stop-color=\"#0aa7c8\"/></radialGradient></defs><g class=\"rvc-fly\"><g class=\"rvc-wing rvc-wl\"><path d=\"M30 58 L4 46 L8 54 L2 58 L10 62 L4 68 L14 70 L30 72Z\" fill=\"url(#rvcC)\" stroke=\"#5b6168\" stroke-width=\"1\"/></g><g class=\"rvc-wing rvc-wr\"><path d=\"M88 58 L116 44 L112 52 L118 57 L110 61 L116 67 L105 70 L88 72Z\" fill=\"url(#rvcC)\" stroke=\"#5b6168\" stroke-width=\"1\"/></g><g class=\"rvc-thumb\"><path d=\"M92 88 q10 -2 12 -10 l2 -10 q3 -3 5 1 l-1 10 h6 q4 1 3 5 l-2 10 q-1 4 -5 4 h-14 q-6 0 -6 -5Z\" fill=\"#1b1e22\" stroke=\"url(#rvcC)\" stroke-width=\"2\"/></g><path d=\"M34 14 Q40 6 54 6 L80 8 Q90 10 90 22 L88 118 Q86 132 70 134 L46 134 Q30 132 28 116 L26 40 Q26 22 34 14Z\" fill=\"url(#rvcC)\"/><path d=\"M40 12 Q46 8 56 8 L80 10 Q88 12 88 22 L86 116 Q84 130 70 132 L60 132 Q50 100 40 60Z\" fill=\"url(#rvcB)\"/><path d=\"M32 22 L38 74\" stroke=\"#6ec6ff\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M38 74 L48 104\" stroke=\"#1c3f94\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M48 104 L58 128\" stroke=\"#e22718\" stroke-width=\"3\" stroke-linecap=\"round\"/><g fill=\"#1a1d21\" stroke=\"#3b4048\" stroke-width=\"1\"><rect x=\"88\" y=\"26\" width=\"7\" height=\"22\" rx=\"2\"/><rect x=\"88\" y=\"52\" width=\"7\" height=\"22\" rx=\"2\"/><rect x=\"87\" y=\"78\" width=\"7\" height=\"22\" rx=\"2\"/></g><path d=\"M44 14 Q60 10 82 14\" stroke=\"#fff\" stroke-opacity=\".25\" stroke-width=\"2\" fill=\"none\"/><g class=\"rvc-eye\"><circle cx=\"64\" cy=\"48\" r=\"17\" fill=\"url(#rvcE)\" class=\"rvc-glow\"/><circle cx=\"64\" cy=\"48\" r=\"7\" fill=\"#03080b\"/><circle cx=\"61\" cy=\"45\" r=\"2.4\" fill=\"#fff\"/><rect class=\"rvc-lid\" x=\"46\" y=\"30\" width=\"36\" height=\"0\" fill=\"#0d0f12\"/></g><path class=\"rvc-wink\" d=\"M54 49 q10 -6 20 0\" stroke=\"#29e3ff\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/><path class=\"rvc-heye\" d=\"M64 60 l-12 -12 a6 6 0 0 1 12 -6 a6 6 0 0 1 12 6Z\" fill=\"#29e3ff\"/><rect class=\"rvc-scan\" x=\"48\" y=\"46\" width=\"32\" height=\"3\" rx=\"1.5\" fill=\"#bff6ff\"/><path class=\"rvc-smile\" d=\"M57 72 q7 6 14 0\" stroke=\"#29e3ff\" stroke-width=\"2.5\" fill=\"none\" stroke-linecap=\"round\"/><path class=\"rvc-heart\" d=\"M79 72 l-4 -4 a2.2 2.2 0 0 1 4 -2.5 a2.2 2.2 0 0 1 4 2.5Z\" fill=\"#ff5aa5\"/></g></svg>";
  function make(cls) { var s = document.createElement('span'); s.className = 'rvc' + (cls ? ' ' + cls : ''); s.setAttribute('data-state', 'idle'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = SVG; return s; }
  var timers = new WeakMap();
  function setEl(el, st, ms) { clearTimeout(timers.get(el)); el.setAttribute('data-state', st); if (ms) timers.set(el, setTimeout(function () { el.setAttribute('data-state', 'idle'); }, ms)); }
  function all() { return document.querySelectorAll('.rvc'); }
  function set(st, ms) { all().forEach(function (el) { setEl(el, st, ms); }); }
  function swapImgs(root) {
    (root || document).querySelectorAll('.ct-revvy > img, .rv-top > img').forEach(function (img) { var r = make(); setEl(r, 'wink', 1400); img.replaceWith(r); });
  }
  function matchHook() {
    var m = document.getElementById('matchModal'); if (!m) return;
    var inner = m.querySelector('.ct-match-in'); var mr = make('rvc-match'); if (inner) inner.insertBefore(mr, inner.firstChild);
    new MutationObserver(function () { if (!m.hidden) setEl(mr, 'heart'); else setEl(mr, 'idle'); }).observe(m, { attributes: true, attributeFilter: ['hidden'] });
  }
  function deckHook() {
    var d = document.getElementById('deck'); if (!d) return;
    function chk() { var empty = !d.children.length, e = document.getElementById('deckEmpty'), ns = document.getElementById('deckNoStock');
      var loading = empty && (!e || e.hidden) && (!ns || ns.hidden);
      all().forEach(function (el) { var s = el.getAttribute('data-state'); if (loading && s === 'idle') setEl(el, 'scan'); else if (!loading && s === 'scan') setEl(el, 'idle'); }); }
    new MutationObserver(chk).observe(d, { childList: true }); chk();
  }
  document.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('a.ct-td, #mmTd'); if (t) set('thumbs', 2600); }, true);
  function init() {
    swapImgs(); matchHook(); deckHook();
    new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1 && n.querySelector) swapImgs(n.parentNode || n); }); }); }).observe(document.body, { childList: true, subtree: true });
  }
  window.RevvyChar = { make: make, set: set, setEl: setEl };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
