/* SwipeToDrive premium swipe card: the deck fills the space between the top of the Discover screen and the action buttons,
   and the buttons sit flush on top of the bottom nav, on every phone height, including in app browsers (Instagram,
   Facebook) whose usable height is shorter. Pure layout: it only sets sizes, never touches swipes or saved data. */
(function () {
  var raf = 0, last = '';
  function q(s) { return document.querySelector(s); }
  function vh() { return Math.round(window.innerHeight || document.documentElement.clientHeight || 0); }
  function off() { var b = document.body; if (!b.classList.contains('sd-fit')) return; b.classList.remove('sd-fit', 'sd-flow'); last = ''; }
  function fit() { raf = 0;
    var scr = q('[data-screen=discover]'), deck = q('#deck'), acts = q('#deckActions'), nav = q('#nav'), b = document.body, root = document.documentElement;
    /* How it works moves up into the top bar as a small round button, so nothing sits under the swipe buttons */
    var how = q('#howTo'), bar = q('.ct-top'); if (how && bar && how.parentNode !== bar) { how.setAttribute('aria-label', 'How it works'); bar.appendChild(how); }
    b.classList.toggle('sd-disc', !!(scr && !scr.hidden));
    if (!scr || scr.hidden || !deck || deck.hidden || !acts) { off(); return; }
    var navH = nav && !nav.hidden ? Math.round(nav.getBoundingClientRect().height) : 0;
    b.classList.add('sd-fit');
    var actsH = acts.hidden ? 0 : Math.round(acts.getBoundingClientRect().height);
    var top = Math.round(deck.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0));
    var h = vh() - top - navH - actsH - 4, w = deck.clientWidth || 320;
    /* very tall content above the deck (a no stock notice, say): fall back to a normal scrolling page with the buttons under the card */
    var flow = h < 300; if (flow) h = Math.max(380, Math.round(w * 1.25));
    h = Math.min(h, 820);
    var size = h < 430 ? 'xs' : h < 500 ? 's' : h < 600 ? 'm' : 'l';
    var key = [h, navH, actsH, flow, size].join(); if (key === last) return; last = key;
    b.classList.toggle('sd-flow', flow); deck.setAttribute('data-fit', size);
    root.style.setProperty('--sd-deck-h', h + 'px'); root.style.setProperty('--sd-nav-h', navH + 'px'); root.style.setProperty('--sd-acts-h', actsH + 'px');
  }
  function soon() { if (!raf) raf = requestAnimationFrame(fit); }
  window.sdFit = function () { last = ''; soon(); };
  window.addEventListener('resize', soon); window.addEventListener('orientationchange', soon); window.addEventListener('hashchange', soon); window.addEventListener('load', soon);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', soon);
  if (window.ResizeObserver) { var ro = new ResizeObserver(soon); var hook = function () { ['.ct-top', '#freeBar', '#deckNoStock', '[data-revvy-row]', '#relaxBar', '#nav', '#deckActions'].forEach(function (s) { var e = q(s); if (e) ro.observe(e); }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook(); }
  if (window.MutationObserver) document.addEventListener('DOMContentLoaded', function () { var scr = q('[data-screen=discover]'); if (scr) new MutationObserver(soon).observe(scr, { attributes: true, subtree: true, attributeFilter: ['hidden'] }); var d = q('#deck'); if (d) new MutationObserver(soon).observe(d, { attributes: true, attributeFilter: ['hidden'] }); });
})();
