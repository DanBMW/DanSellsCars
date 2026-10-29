/* Android style shell for links.html: ripples, bottom navigation, snackbars, bottom sheets,
   back button and edge swipe back, install prompt. No service worker, nothing cached or stored. */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function svg(d) { return '<svg viewBox="0 0 24 24">' + d + '</svg>'; }
  var IC = { home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>', follow: '<path d="M4 4h16v12H5.2L4 17.2z"/><path d="M8 9h8M8 12h5"/>',
    quote: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>', admin: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    more: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>', lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    install: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>', top: '<path d="M18 15l-6-6-6 6"/>' };

  /* snackbar */
  var snack = document.createElement('div'); snack.className = 'ax-snack'; snack.setAttribute('role', 'status'); snack.setAttribute('aria-live', 'polite'); document.body.appendChild(snack);
  var st = null;
  window.axSnack = function (msg, ms) { snack.textContent = msg; snack.classList.add('show'); clearTimeout(st); st = setTimeout(function () { snack.classList.remove('show'); }, ms || 3200); };

  /* ripple touch feedback */
  var RIP = '.tile,.chip,.ax-nav button,.ax-item,.ax-icon,.panel-back,.btn-open,.btn-copy,.btn-wa,.btn-action-full,.btn-wa-full,.fx-btn,.fx-ghost,.fx-ok,.fx-opt,.fx-var,.fx-chip,.fx-seg button,.fx-who,#unlock-btn';
  document.addEventListener('pointerdown', function (ev) { if (reduce) return; var t = ev.target.closest(RIP); if (!t) return;
    var r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2, s = document.createElement('span'); s.className = 'ax-rip';
    s.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (ev.clientX - r.left - d / 2) + 'px;top:' + (ev.clientY - r.top - d / 2) + 'px';
    if (getComputedStyle(t).position === 'static') t.style.position = 'relative'; t.style.overflow = 'hidden'; t.appendChild(s); setTimeout(function () { s.remove(); }, 600); }, { passive: true });

  /* top app bar: greeting, overflow menu, lift on scroll */
  var bar = document.querySelector('.topbar'), dash = document.getElementById('dash');
  if (bar) { var mb = document.createElement('button'); mb.className = 'ax-icon'; mb.setAttribute('aria-label', 'Menu'); mb.innerHTML = svg(IC.more); mb.onclick = menu; bar.appendChild(mb);
    addEventListener('scroll', function () { bar.classList.toggle('lifted', scrollY > 4); }, { passive: true }); }
  if (dash) { var h = new Date().getHours(), g = document.createElement('div');
    g.innerHTML = '<div class="ax-greet">' + (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + ', Dan</div><div class="ax-greet-sub">' + new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + '</div>';
    dash.insertBefore(g, dash.firstChild); }

  /* install as an app */
  var installEvt = null; addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; });
  addEventListener('appinstalled', function () { installEvt = null; axSnack('Installed. Open Dan Sells from your home screen.'); });

  /* bottom sheet */
  window.axSheet = function (title, items) { var sc = document.createElement('div'); sc.className = 'ax-scrim';
    sc.innerHTML = '<div class="ax-sheet" role="dialog" aria-modal="true"><h3>' + title + '</h3>' + items.map(function (it, i) {
      return '<button class="ax-item" data-i="' + i + '">' + svg(it.icon) + '<span>' + it.label + (it.sub ? '<small>' + it.sub + '</small>' : '') + '</span></button>'; }).join('') + '</div>';
    sc.addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (b) { closeSheet(); items[+b.getAttribute('data-i')].run(); } else if (e.target === sc) closeSheet(); });
    document.body.appendChild(sc); return sc; };
  function menu() { axSheet('Menu', [
      { icon: IC.install, label: 'Install as an app', sub: installEvt ? 'Adds Dan Sells to your home screen' : 'Use your browser menu, then Add to Home screen', run: function () { if (installEvt) { installEvt.prompt(); installEvt = null; } else axSnack('Open the browser menu and choose Add to Home screen.'); } },
      { icon: IC.top, label: 'Back to top', run: function () { scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); } },
      { icon: IC.lock, label: 'Lock', sub: 'Asks for your password again', run: function () { if (window.lockPage) lockPage(); } }]); }
  function openSheet() { return document.querySelector('.ax-scrim,.fx-ov'); }
  function closeSheet() { var s = openSheet(); if (!s) return; if (s.classList.contains('fx-ov')) s.parentNode.innerHTML = ''; else s.remove(); }
  window.axCloseSheet = closeSheet;
  /* a sheet adds a history entry, so back closes the sheet first */
  var sheetOn = false, popping = false;
  new MutationObserver(function () { var on = !!openSheet(); if (on === sheetOn) return; sheetOn = on;
    if (on) history.pushState({ axSheet: 1 }, '', location.href); else if (!popping && history.state && history.state.axSheet) history.back(); popping = false; })
    .observe(document.body, { childList: true, subtree: true });
  addEventListener('popstate', function () { if (sheetOn) { popping = true; closeSheet(); } });
  document.addEventListener('click', function (e) { if (e.target.classList && e.target.classList.contains('fx-ov')) closeSheet(); });
  /* drag a sheet down to close */
  var sy = null, sheetEl = null;
  document.addEventListener('touchstart', function (e) { var s = e.target.closest('.ax-sheet,.fx-dlg'); if (!s || s.scrollTop > 0) return; sheetEl = s; sy = e.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchmove', function (e) { if (sy == null) return; var dy = e.touches[0].clientY - sy; if (dy > 0) sheetEl.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
  document.addEventListener('touchend', function (e) { if (sy == null) return; var dy = e.changedTouches[0].clientY - sy; sy = null;
    if (dy > 110) closeSheet(); else sheetEl.style.transform = ''; }, { passive: true });

  /* bottom navigation */
  var NAV = [['', 'Home', IC.home], ['followups', 'Follow ups', IC.follow], ['quote', 'Quote', IC.quote], ['admin', 'Admin', IC.admin]];
  var nav = document.createElement('nav'); nav.className = 'ax-nav'; nav.setAttribute('aria-label', 'Main');
  nav.innerHTML = NAV.filter(function (n) { return !n[0] || document.getElementById('panel-' + n[0]); })
    .map(function (n) { return '<button data-nav="' + n[0] + '"><span class="ax-pill">' + svg(n[2]) + '</span>' + n[1] + '</button>'; }).join('');
  var content = document.getElementById('content'); content.parentNode.insertBefore(nav, content.nextSibling);
  nav.addEventListener('click', function (e) { var b = e.target.closest('[data-nav]'); if (!b || !window.dashOpen) return; var k = b.getAttribute('data-nav');
    if (k === (window.dashCurrent ? dashCurrent() : '')) scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); else dashOpen(k); });
  function mark(k) { [].forEach.call(nav.children, function (b) { var on = b.getAttribute('data-nav') === k; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); }); }
  document.addEventListener('dash:show', function (e) { closeSheet(); mark(e.detail.key); });
  mark(window.dashCurrent ? dashCurrent() : '');

  /* edge swipe back: drag from the left edge of an open screen */
  var ex = null, ey = 0, panel = null, horiz = false, edge = document.createElement('div'); edge.className = 'ax-edge'; document.body.appendChild(edge);
  document.addEventListener('touchstart', function (e) { var t = e.touches[0]; if (t.clientX > 24 || openSheet()) return; panel = document.querySelector('.panel.open'); if (!panel) return;
    ex = t.clientX; ey = t.clientY; horiz = false; }, { passive: true });
  document.addEventListener('touchmove', function (e) { if (ex == null) return; var t = e.touches[0], dx = t.clientX - ex;
    if (!horiz) { if (Math.abs(t.clientY - ey) > Math.abs(dx)) { ex = null; return; } horiz = dx > 8; }
    if (horiz) { panel.classList.add('ax-drag'); panel.style.transform = 'translateX(' + Math.max(0, dx * .5) + 'px)'; panel.style.opacity = String(1 - Math.min(dx, 300) / 900);
      edge.style.opacity = Math.min(1, dx / 90); edge.style.width = Math.min(28, 6 + dx / 6) + 'px'; } }, { passive: true });
  document.addEventListener('touchend', function (e) { if (ex == null) return; var dx = e.changedTouches[0].clientX - ex; ex = null; edge.style.opacity = 0;
    panel.classList.remove('ax-drag'); panel.classList.add('ax-settle'); var p = panel; setTimeout(function () { p.classList.remove('ax-settle'); }, 260);
    if (horiz && dx > 90) dashOpen(''); else { p.style.transform = ''; p.style.opacity = ''; } }, { passive: true });
})();
