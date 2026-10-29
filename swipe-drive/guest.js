/* SwipeToDrive guest swipe (from the latest stock email). The link's token is the only key and it lives in the
   URL hash, so it never reaches a server log. This page talks to ONE server function (guest-deck), which only
   returns car cards and records swipes and requests to Dan. No customer details are loaded or shown here. */
(function () {
  var CFG = window.CT_CONFIG || {}, $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var tok = (location.hash.match(/[#&]t=([^&]+)/) || [])[1]; tok = tok ? decodeURIComponent(tok) : '';
  var API = (CFG.SUPABASE_URL || '') + '/functions/v1/guest-deck';
  var S = { cars: [], i: 0, liked: [], wa: '447827138197' };
  function show(id) { ['#g-load', '#g-err', '#g-deck-wrap', '#g-end'].forEach(function (x) { $(x).hidden = x !== id; }); }
  function toast(t) { var e = $('#g-toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, 2600); }
  function call(body) { body.t = tok; return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY || '', Authorization: 'Bearer ' + (CFG.SUPABASE_ANON_KEY || '') }, body: JSON.stringify(body) })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); }); }
  function fail(st) {
    $('#g-err-h').textContent = st === 410 ? 'This link is no longer active' : st === 429 ? 'Give it a moment' : st === 401 ? 'This link did not work' : 'Something went wrong';
    $('#g-err-p').textContent = st === 429 ? 'Too many taps at once. Wait a minute and try again.' : 'Message Dan on WhatsApp and he will send you a fresh link or the cars directly.';
    show('#g-err'); }
  function spec(c) { return (c.kind === 'new_stock' ? ['Brand new', c.colour, c.fuel] : [c.year, c.mileage, c.fuel, c.gearbox]).filter(Boolean).join(' \u00b7 '); }
  function cardHtml(c, under) { return '<div class="g-card' + (under ? ' under' : '') + '" data-reg="' + esc(c.reg) + '"><div class="ph" style="--ph:url(\'' + esc(c.image || 'icons/icon-512.png') + '\')"><img src="' + esc(c.image || 'icons/icon-512.png') + '" alt="" draggable="false"></div>' +
      '<span class="tag l">LIKE</span><span class="tag p">PASS</span>' +
      '<div class="bd">' + (c.kind === 'new_stock' ? '<span class="new">Brand new</span>' : '') + '<h2>' + esc(c.model) + '</h2><div class="sp">' + esc(spec(c)) + '</div><div class="pr">' + esc(c.price || 'Price on request') + '</div></div></div>'; }
  function draw() {
    if (S.i >= S.cars.length) return end();
    $('#g-count').textContent = 'Car ' + (S.i + 1) + ' of ' + S.cars.length;
    var nx = S.cars[S.i + 1]; $('#g-deck').innerHTML = (nx ? cardHtml(nx, true) : '') + cardHtml(S.cars[S.i], false);
    bindDrag($('#g-deck .g-card:not(.under)')); show('#g-deck-wrap'); }
  function decide(liked) { var c = S.cars[S.i]; if (!c) return; var el = $('#g-deck .g-card:not(.under)');
    if (liked && S.liked.indexOf(c.reg) < 0) S.liked.push(c.reg); if (!liked) S.liked = S.liked.filter(function (r) { return r !== c.reg; });
    call({ action: 'swipe', reg: c.reg, liked: liked }).then(function (r) { if (r._status === 410 || r._status === 401) fail(r._status); }).catch(function () {});
    if (el) { el.style.transition = 'transform .25s ease, opacity .25s'; el.style.transform = 'translateX(' + (liked ? 120 : -120) + '%) rotate(' + (liked ? 18 : -18) + 'deg)'; el.style.opacity = '0'; }
    S.i++; nudge(); setTimeout(draw, el ? 230 : 0); }
  function bindDrag(el) { if (!el) return; var x0 = 0, y0 = 0, dx = 0, on = false, moved = false;
    el.addEventListener('pointerdown', function (e) { on = true; moved = false; x0 = e.clientX; y0 = e.clientY; dx = 0; el.setPointerCapture(e.pointerId); el.style.transition = 'none'; });
    el.addEventListener('pointermove', function (e) { if (!on) return; dx = e.clientX - x0; if (Math.abs(dx) > 6 || Math.abs(e.clientY - y0) > 6) moved = true;
      el.style.transform = 'translateX(' + dx + 'px) rotate(' + dx / 18 + 'deg)'; el.querySelector('.tag.l').style.opacity = Math.max(0, Math.min(1, dx / 90)); el.querySelector('.tag.p').style.opacity = Math.max(0, Math.min(1, -dx / 90)); });
    function up() { if (!on) return; on = false; if (dx > 90) return decide(true); if (dx < -90) return decide(false);
      el.style.transition = 'transform .2s'; el.style.transform = ''; el.querySelectorAll('.tag').forEach(function (t) { t.style.opacity = 0; }); if (!moved) details(S.cars[S.i]); }
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', function () { dx = 0; up(); }); }
  function details(c) { if (!c) return; var rows = [['Year', c.year], ['Mileage', c.mileage], ['Fuel', c.fuel], ['Gearbox', c.gearbox], ['Colour', c.colour], ['Body', c.body], ['Power', c.power], ['Seats', c.seats]].filter(function (r) { return r[1]; });
    var ph = (c.images && c.images.length ? c.images : [c.image]).filter(Boolean);
    $('#g-sheet-body').innerHTML = (ph.length ? '<div class="g-photos">' + ph.map(function (u) { return '<div class="g-pf" style="--ph:url(\'' + esc(u) + '\')"><img src="' + esc(u) + '" alt="" loading="lazy"></div>'; }).join('') + '</div>' : '') +
      '<div class="g-det"><h2>' + esc(c.model) + '</h2><div class="pr" style="font-size:22px;font-weight:800">' + esc(c.price || 'Price on request') + '</div>' +
      (c.finance ? '<div class="g-fin"><b>' + esc(c.finance.headline) + '</b><strong>Representative example.</strong> ' + esc(c.finance.example) + (c.finance.legal ? ' ' + esc(c.finance.legal) : '') + '</div>' : '') +
      '<dl>' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' +
      '<button type="button" class="g-btn" id="g-buy">Buy this car</button><p class="g-ok" id="g-buy-msg" role="status"></p>' +
      (c.listing_url ? '<a class="g-btn g-ghost" target="_blank" rel="noopener" href="' + esc(c.listing_url) + '">View on Hedin Automotive</a>' : '') +
      '<div class="g-acts"><button type="button" class="g-round g-pass" id="g-s-pass" aria-label="Pass">&#x2715;</button><button type="button" class="g-round g-like" id="g-s-like" aria-label="Like">&#x2665;</button></div></div>';
    $('#g-sheet').hidden = false;
    $('#g-buy').onclick = function () { var b = this; if (b.getAttribute('data-sure') !== '1') { b.setAttribute('data-sure', '1'); b.textContent = 'Tap again to send to Dan'; return; }
      b.disabled = true; call({ action: 'buy', reg: c.reg }).then(function (r) { if (r.ok) { $('#g-buy-msg').textContent = 'Sent to Dan. He will be in touch to talk it through.'; b.textContent = 'Sent to Dan'; } else { b.disabled = false; b.textContent = 'Buy this car'; b.removeAttribute('data-sure'); toast('That did not send. Try again or WhatsApp Dan.'); } }); };
    $('#g-s-like').onclick = function () { $('#g-sheet').hidden = true; decide(true); }; $('#g-s-pass').onclick = function () { $('#g-sheet').hidden = true; decide(false); }; }
  /* why a chosen model has nothing to show, worked out on the server from real stock; next steps that need no sign in */
  function noStock() { var L = S.notes || [], wa = 'https://wa.me/447827138197';
    var html = L.map(function (x) { var a = [];
      if (x.kind === 'none') { a.push('<a class="g-chip go" href="./">Sign in for alerts</a>'); if (x.new_avail) a.push('<a class="g-chip" href="../find-my-bmw.html">Look at ordering new</a>'); }
      else if (x.kind === 'filter' || x.kind === 'narrow' || x.kind === 'must') a.push('<button type="button" class="g-chip go" data-confirm>Change with Revvy</button>');
      if (x.model) a.push('<a class="g-chip" target="_blank" rel="noopener" href="' + wa + '?text=' + encodeURIComponent('Hi Dan, I am looking for a ' + x.model + '. Can you help?') + '">WhatsApp Dan</a>');
      return '<div class="g-ns-i"><p>' + esc(x.text) + '</p><div class="g-ns-acts">' + a.join('') + '</div></div>'; }).join('');
    ['#g-ns', '#g-ns-end'].forEach(function (id) { var e = $(id); if (e) { e.innerHTML = html; e.hidden = !L.length; } }); }
  function end() { var n = S.liked.length; $('#g-end-p').textContent = n ? 'You liked ' + n + ' ' + (n === 1 ? 'car' : 'cars') + '. Send them to Dan and he will be in touch.' : 'Nothing caught your eye this time? No problem. Dan will keep looking.';
    $('#g-send').hidden = !n; $('#g-send').disabled = false; $('#g-send-msg').textContent = ''; $('#g-wa').href = 'https://wa.me/' + S.wa; show('#g-end');
    if (!S.confirmed && !S.autoChat) { S.autoChat = true; setTimeout(function () { if (!$('#g-end').hidden && $('#g-chat').hidden) confirmChat(); }, 900); } }
  $('#g-send').onclick = function () { var b = this; b.disabled = true; call({ action: 'send', regs: S.liked }).then(function (r) { if (r.ok) { $('#g-send-msg').textContent = 'Sent to Dan. He will be in touch.'; b.textContent = 'Sent'; } else { b.disabled = false; toast('That did not send. Try again or WhatsApp Dan.'); } }); };
  $('#g-again').onclick = function () { S.i = 0; draw(); };
  $('#g-like').onclick = function () { decide(true); }; $('#g-pass').onclick = function () { decide(false); }; $('#g-info').onclick = function () { details(S.cars[S.i]); };
  $('#g-x').onclick = function () { $('#g-sheet').hidden = true; }; $('#g-sheet').onclick = function (e) { if (e.target === this) this.hidden = true; };
  document.addEventListener('keydown', function (e) { if (!$('#g-deck-wrap').hidden && $('#g-sheet').hidden && $('#g-tut').hidden) { if (e.key === 'ArrowRight') decide(true); if (e.key === 'ArrowLeft') decide(false); } });
  /* the brief tutorial: always the first time this link is opened on this device */
  function tutorial(key, then) { var k = 'sdGuestTut:' + key; try { if (localStorage.getItem(k)) return then(); } catch (e) {}
    $('#g-tut').hidden = false; var v = $('#g-tut-v'); try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    $('#g-tut-go').onclick = function () { try { localStorage.setItem(k, '1'); } catch (e) {} try { v.pause(); } catch (e) {} $('#g-tut').hidden = true; then(); }; $('#g-tut-go').focus(); }
  /* Confirm your details with Revvy. Privacy: the link may have been forwarded, so the server only sends masked
     hints (a mobile ending 789, l***@g***.com) and rough preferences. Name and postcode are never shown. */
  var swN = 0, nudged = false;
  function nudge() { swN++; if (swN >= 10 && !nudged && !S.confirmed) { nudged = true; $('#g-nudge').hidden = false; } }
  $('#g-nudge-x').onclick = function () { $('#g-nudge').hidden = true; };
  document.addEventListener('click', function (e) { if (e.target.closest('[data-confirm]')) confirmChat(); });
  $('#g-chat-x').onclick = function () { $('#g-chat').hidden = true; };
  function bot(t) { var m = document.createElement('div'); m.className = 'g-m bot'; m.textContent = t; $('#g-log').appendChild(m); $('#g-log').scrollTop = 1e6; }
  function me(t) { var m = document.createElement('div'); m.className = 'g-m me'; m.textContent = t; $('#g-log').appendChild(m); $('#g-log').scrollTop = 1e6; }
  function chips(list) { var tr = $('#g-tray'); tr.innerHTML = ''; $('#g-in').hidden = true;
    list.forEach(function (c) { var b = document.createElement('button'); b.type = 'button'; b.className = 'g-chip' + (c.go ? ' go' : ''); b.textContent = c.t; b.onclick = function () { tr.innerHTML = ''; me(c.t); c.f(); }; tr.appendChild(b); }); }
  function ask(ph, check, then, skip) { $('#g-tray').innerHTML = ''; var f = $('#g-in'), i = $('#g-inp'); f.hidden = false; i.value = ''; i.placeholder = ph; i.type = ph.indexOf('mail') >= 0 ? 'email' : ph.indexOf('obile') >= 0 ? 'tel' : 'text'; setTimeout(function () { try { i.focus(); } catch (e) {} }, 50);
    if (skip) { var b = document.createElement('button'); b.type = 'button'; b.className = 'g-chip'; b.textContent = 'Skip'; b.onclick = function () { f.hidden = true; $('#g-tray').innerHTML = ''; me('Skip'); then(''); }; $('#g-tray').appendChild(b); }
    f.onsubmit = function (e) { e.preventDefault(); var v = i.value.trim(); if (!v) return; var bad = check(v); if (bad) { bot(bad); return; } f.hidden = true; $('#g-tray').innerHTML = ''; me(v); then(v); }; }
  var okPhone = function (v) { return /^(\+?44|0)7\d{9}$/.test(v.replace(/[\s()-]/g, '')) ? '' : 'That does not look like a UK mobile. Try something like 07700 900123.'; };
  var okEmail = function (v) { return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v) ? '' : 'That email does not look right. Have another go?'; };
  function confirmChat() {
    $('#g-chat').hidden = false; $('#g-log').innerHTML = ''; $('#g-tray').innerHTML = ''; $('#g-nudge').hidden = true;
    var A = {}; bot("Hi, I'm Revvy, Dan's assistant. Let's make sure Dan has the right details so he can send you more cars like these.");
    call({ action: 'hints' }).then(function (h) { if (h._status !== 200) { bot('Sorry, I cannot check your details right now. You can always WhatsApp Dan instead.'); return; }
      function name() { bot("First, what's your first name?"); ask('Your first name', function (v) { return v.length > 40 ? 'Just your first name is fine.' : ''; }, function (v) { A.name = v; phone(); }); }
      function phone() { if (h.has_phone) { bot('Dan has ' + h.phone_hint + ' for you. Is that still right?');
          chips([{ t: 'Yes, that is right', go: 1, f: function () { A.phone_ok = true; email(); } }, { t: 'It has changed', f: function () { bot("What's your new mobile?"); ask('Mobile number', okPhone, function (v) { A.phone = v; email(); }); } }]); }
        else { bot("What's the best mobile for Dan to reach you on?"); ask('Mobile number', okPhone, function (v) { A.phone = v; email(); }, true); } }
      function email() { if (h.has_email) { bot('And Dan has ' + h.email_hint + ' as your email. Still right?');
          chips([{ t: 'Yes, that is right', go: 1, f: function () { A.email_ok = true; prefs(); } }, { t: 'It has changed', f: function () { bot("What's your new email?"); ask('Email address', okEmail, function (v) { A.email = v; prefs(); }); } }]); }
        else { bot('What email should Dan send updates to?'); ask('Email address', okEmail, function (v) { A.email = v; prefs(); }, true); } }
      /* car preferences one by one, with the same tap pickers as the main app. Saved straight to the profile. */
      var V = h.values || {}, O = h.options || {}, P = {}, changed = false;
      var low = function (t) { return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; };
      var lab = function (l, k) { var f = (l || []).filter(function (x) { return (Array.isArray(x) ? x[0] : x) === k; })[0]; return f ? (Array.isArray(f) ? f[1] : f) : k; };
      var names = function (l, ks) { return ks.map(function (k) { return lab(l, k); }).join(', '); };
      function triText(l, on, must, me) { var like = on.filter(function (x) { return must.indexOf(x) < 0; }); return [must.length ? 'Must have ' + names(l, must) : '', like.length ? (must.length ? 'would also like ' : me ? 'Would like ' : '') + names(l, like) : ''].filter(Boolean).join(', and '); }
      function picker(kind, list, on, must, done) { var tr = $('#g-tray'); tr.innerHTML = ''; $('#g-in').hidden = true;
        var g = document.createElement('div'); g.className = 'g-picks' + (kind === 'tri' ? ' tri' : '');
        if (kind === 'tri') { var lg = document.createElement('p'); lg.className = 'g-legend'; lg.textContent = 'Tap once for would like, twice for must have, a third tap clears it.'; tr.appendChild(lg); }
        var st = {}; on.forEach(function (k) { st[k] = 'like'; }); must.forEach(function (k) { st[k] = 'must'; });
        list.forEach(function (x) { var k = Array.isArray(x) ? x[0] : x, b = document.createElement('button'); b.type = 'button'; b.className = 'g-pick'; b.setAttribute('data-k', k); b.innerHTML = '<b></b><i></i>'; b.querySelector('b').textContent = Array.isArray(x) ? x[1] : x;
          function paint() { var v = st[k] || ''; b.setAttribute('data-s', v); b.setAttribute('aria-pressed', v ? 'true' : 'false'); b.querySelector('i').textContent = v === 'must' ? 'Must have' : v === 'like' && kind === 'tri' ? 'Would like' : ''; }
          b.onclick = function () { var v = st[k] || ''; if (kind === 'tri') st[k] = v === '' ? 'like' : v === 'like' ? 'must' : '';
            else if (kind === 'single') { Object.keys(st).forEach(function (z) { st[z] = ''; }); st[k] = 'like'; g.querySelectorAll('.g-pick').forEach(function (z) { z.setAttribute('data-s', ''); z.setAttribute('aria-pressed', 'false'); }); }
            else st[k] = v ? '' : 'like'; paint(); };
          paint(); g.appendChild(b); });
        tr.appendChild(g); var d = document.createElement('button'); d.type = 'button'; d.className = 'g-chip go g-done'; d.textContent = 'Done'; tr.appendChild(d);
        d.onclick = function () { var o = [], m = []; Object.keys(st).forEach(function (k) { if (st[k]) o.push(k); if (st[k] === 'must') m.push(k); }); tr.innerHTML = ''; done(o, m); }; }
      /* every requirement a guest can safely set, one by one, with the shared Revvy walkthrough (revvy-flow.js).
         Budget, contact details, current car and part exchange are never shown or set from a link that could be forwarded. */
      var OK = { models: 1, specs: 1, colours: 1, fuel: 1, body: 1, new_used: 1, mileage_bands: 1, annual_mileage: 1, 'desk.spec_notes': 1 };
      Object.keys(O.desk || {}).forEach(function (k) { OK['desk.' + k] = 1; });
      var FIELDS = window.RevvyFlow.fields({ models: O.models, specs: O.specs, colours: O.colours, desk: O.desk || {} }, { px: false }).filter(function (f) { return OK[f.k]; });
      function prefs() { bot("Now everything you're looking for. I'll go through it one thing at a time, skip anything you like.");
        $('#g-in').hidden = true;
        window.RevvyFlow.run({ log: $('#g-log'), tray: $('#g-tray'), values: V, fields: FIELDS,
          cls: { bot: 'g-m bot', me: 'g-m me', chip: 'g-chip', go: 'go', legend: 'g-legend', picks: 'g-picks', pick: 'g-pick', row: 'g-row', form: 'g-form', input: 'g-inp2', sum: 'g-sum' },
          save: function (p) { Object.assign(P, p); changed = true; return Promise.resolve(); }, open: function () {}, done: function () { extra(); } }); }
      function extra() { bot('Anything else Dan should know? A budget change, your part exchange, anything.'); ask('Optional note', function (v) { return v.length > 500 ? 'A bit shorter please.' : ''; }, function (v) { A.prefs_note = v; A.prefs_ok = !changed && !v; send(); }, true); }
      function send() { bot('Saving that for Dan...'); (changed ? call(Object.assign({ action: 'prefs' }, P)) : Promise.resolve({ ok: true })).then(function (pr) { if (!pr.ok) bot('Your car preferences did not save, sorry. Dan will go through them with you.'); return call(Object.assign({ action: 'confirm' }, A)); }).then(function (r) {
          if (!r.ok) { bot('That did not save, sorry. WhatsApp Dan and he will sort it.'); return; } S.confirmed = true; $('#g-confirm-end').hidden = true;
          bot('All done, thank you. ' + (r.held && r.held.length ? 'Dan will check the new ' + r.held.join(' and ') + ' and update it for you. ' : '') + (changed ? 'Your car preferences are updated. ' : '') + 'Dan will keep sending cars that fit.');
          bot('Want to see your profile and save everything? Sign in or create a free account. Totally optional.');
          var tr = $('#g-tray'); tr.innerHTML = '<a class="g-chip go" href="./">Sign in to SwipeToDrive</a>'; var c = document.createElement('button'); c.type = 'button'; c.className = 'g-chip'; c.textContent = 'Back to the cars'; c.onclick = function () { $('#g-chat').hidden = true; }; tr.appendChild(c); }); }
      name(); }); }
  if (!tok || !CFG.SUPABASE_URL) return fail(401);
  call({ action: 'deck' }).then(function (r) {
    if (r._status !== 200) return fail(r._status);
    S.cars = r.cars || []; S.wa = r.owner_wa || S.wa; S.notes = r.notes || []; noStock(); $('#g-err-wa').href = 'https://wa.me/' + S.wa;
    var sw = r.swiped || {}; S.liked = Object.keys(sw).filter(function (k) { return sw[k] && S.cars.some(function (c) { return c.reg === k; }); });
    tutorial(tok.slice(-12), function () { if (!S.cars.length) return end(); draw(); });
  }).catch(function () { fail(0); });
})();
