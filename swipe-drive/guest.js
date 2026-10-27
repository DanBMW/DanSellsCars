/* Swipe Drive guest swipe (from the latest stock email). The link's token is the only key and it lives in the
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
  function cardHtml(c, under) { return '<div class="g-card' + (under ? ' under' : '') + '" data-reg="' + esc(c.reg) + '"><div class="ph" style="background-image:url(\'' + esc(c.image || 'icons/icon-512.png') + '\')"></div>' +
      (c.kind === 'new_stock' ? '<span class="new">Brand new</span>' : '') + '<span class="tag l">LIKE</span><span class="tag p">PASS</span>' +
      '<div class="bd"><h2>' + esc(c.model) + '</h2><div class="sp">' + esc(spec(c)) + '</div><div class="pr">' + esc(c.price || 'Price on request') + '</div></div></div>'; }
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
    $('#g-sheet-body').innerHTML = (ph.length ? '<div class="g-photos">' + ph.map(function (u) { return '<img src="' + esc(u) + '" alt="" loading="lazy">'; }).join('') + '</div>' : '') +
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
  function end() { var n = S.liked.length; $('#g-end-p').textContent = n ? 'You liked ' + n + ' ' + (n === 1 ? 'car' : 'cars') + '. Send them to Dan and he will be in touch.' : 'Nothing caught your eye this time? No problem. Dan will keep looking.';
    $('#g-send').hidden = !n; $('#g-send').disabled = false; $('#g-send-msg').textContent = ''; $('#g-wa').href = 'https://wa.me/' + S.wa; show('#g-end'); }
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
      function prefs() { var p = h.prefs || {}, bits = [];
        if (p.models_must && p.models_must.length) bits.push('must have: ' + p.models_must.join(', ')); if (p.models_like && p.models_like.length) bits.push((p.models_must && p.models_must.length ? 'would also like: ' : 'models: ') + p.models_like.join(', '));
        bits.push('fuel: ' + p.fuel); if (p.colours && p.colours.length) bits.push('colours: ' + p.colours.join(', ')); if (p.budget) bits.push('budget ' + p.budget);
        bot('Dan has you down for ' + bits.join('; ') + '. Is that still right?');
        chips([{ t: 'Yes, still right', go: 1, f: function () { A.prefs_ok = true; send(); } }, { t: 'Something has changed', f: function () { bot("Tell me what's changed and I'll pass it to Dan."); ask("What's changed", function (v) { return v.length > 500 ? 'A bit shorter please.' : ''; }, function (v) { A.prefs_note = v; send(); }); } }]); }
      function send() { bot('Saving that for Dan...'); call(Object.assign({ action: 'confirm' }, A)).then(function (r) {
          if (!r.ok) { bot('That did not save, sorry. WhatsApp Dan and he will sort it.'); return; } S.confirmed = true; $('#g-confirm-end').hidden = true;
          bot('All done, thank you. ' + (r.held && r.held.length ? 'Dan will check the new ' + r.held.join(' and ') + ' and update it for you. ' : '') + 'Dan will keep sending cars that fit.');
          bot('Want to see your profile and save everything? Sign in or create a free account. Totally optional.');
          var tr = $('#g-tray'); tr.innerHTML = '<a class="g-chip go" href="./">Sign in to Swipe Drive</a>'; var c = document.createElement('button'); c.type = 'button'; c.className = 'g-chip'; c.textContent = 'Back to the cars'; c.onclick = function () { $('#g-chat').hidden = true; }; tr.appendChild(c); }); }
      name(); }); }
  if (!tok || !CFG.SUPABASE_URL) return fail(401);
  call({ action: 'deck' }).then(function (r) {
    if (r._status !== 200) return fail(r._status);
    S.cars = r.cars || []; S.wa = r.owner_wa || S.wa; $('#g-err-wa').href = 'https://wa.me/' + S.wa;
    var sw = r.swiped || {}; S.liked = Object.keys(sw).filter(function (k) { return sw[k] && S.cars.some(function (c) { return c.reg === k; }); });
    tutorial(tok.slice(-12), function () { if (!S.cars.length) return end(); draw(); });
  }).catch(function () { fail(0); });
})();
