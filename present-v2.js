/* present-v2.js: the immersive "Present this car" draft for desk mode.
   Only runs when desk.html is opened with ?present=v2; desk.js hands over
   in openPresent() and the live presentation is untouched otherwise.
   Everything shown comes from window.fmbDeskPresentData(), the same slides,
   why lines, facts and finance the live presentation already shows the
   customer. No staff notes, SIV, settlement, equity or over budget figures.
   Nothing is sent anywhere; the customer data stays on this device. */
(function () {
  'use strict';
  if (!/[?&]present=v2\b/.test(location.search)) return;
  var D, ROOT, CH = [], IDX = 0, FOCUS = 0, KBT = null, SPT = null;
  var BOOK = 'https://cal.com/danbmwruxley/bmw-ruxley-appointment-with-dan-in-sales';
  var BROKER = 'Finance is arranged by Stephen James (Automotive) Ltd trading as Hedin Automotive (BMW Ruxley), an Appointed Representative of ITC Compliance Limited (FRN 313486), authorised and regulated by the Financial Conduct Authority. A credit broker, not a lender. Guarantees and indemnities may be required.';
  var TOLD = ['models', 'who', 'life', 'miles', 'people', 'boot', 'charge', 'body', 'fuel', 'mustF', 'wouldF', 'when'];
  function e(s) { return D.esc(s); }
  function num(s) { var n = parseFloat(String(s == null ? '' : s).replace(/[^0-9.]/g, '')); return isFinite(n) ? n : null; }
  function m0(n) { return '\u00a3' + Math.round(n).toLocaleString('en-GB'); }
  function det(c) { return ((D.M.data().det) || {})[c.id] || {}; }

  function told() {
    var out = [];
    TOLD.forEach(function (f) {
      [].forEach.call(document.querySelectorAll('input[name="d_' + f + '"]:checked'), function (i) {
        var l = i.closest('label'); var t = l ? l.textContent.trim() : '';
        if (t && out.indexOf(t) < 0) out.push(t);
      });
    });
    return out;
  }
  /* One flat record per car for the spec and compare chapters. */
  function rec(s) {
    var c = s.r.c, d = s.kind === 'used' ? det(c) : {};
    var f = s.kind === 'used' ? s.r.fin : null;
    return {
      s: s, t: s.kind, name: D.name(s), img: D.pics(c)[0] || c.image || '',
      price: num(c.price_gbp != null ? c.price_gbp : c.price), priceText: c.price || (c.price_gbp ? m0(c.price_gbp) : 'Price on request'),
      monthly: f ? f.monthly : null,
      age: s.kind === 'new' ? 'Brand new' : (c.year ? String(c.year) : null),
      mileage: s.kind === 'new' ? 0 : num(c.mileage),
      ready: s.kind === 'new' ? (D.M.newWhen(c) || null) : (c._home ? 'Here at Ruxley' : 'In the group, I can bring it in'),
      fuel: c.fuel || null, gear: c.gearbox || c.transmission || null, colour: c.colour || null,
      seats: num(c.seats), power: d.power_hp || num(c.power) || null, zero62: c.zero_to_62 || null,
      boot: d.boot_l || null, co2: d.co2_gkm || null, ev: d.ev_miles || null,
      equip: D.kit(s) || []
    };
  }
  var ROWS = [
    ['Cash price', 'price', function (v) { return m0(v); }, 'low'],
    ['Monthly', 'monthly', function (v) { return D.FN.money2(v) + ' a month'; }, 'low'],
    ['Year', 'age'], ['Mileage', 'mileage', function (v) { return v ? v.toLocaleString('en-GB') + ' miles' : 'Delivery miles'; }, 'low'],
    ['Ready', 'ready'], ['Fuel', 'fuel'], ['Gearbox', 'gear'], ['Colour', 'colour'],
    ['Power', 'power', function (v) { return v + ' hp'; }, 'high'],
    ['0 to 62 mph', 'zero62', function (v) { return v + ' seconds'; }, 'low'],
    ['Electric range', 'ev', function (v) { return v + ' miles (official)'; }, 'high'],
    ['Boot', 'boot', function (v) { return v + ' litres'; }, 'high'],
    ['CO2', 'co2', function (v) { return v + ' g/km'; }, 'low'], ['Seats', 'seats']];
  /* Same rule as compare.html: a best mark only against cars that list the
     figure, and the Dan says line never claims a tie. */
  function verdict(c, cs) {
    var o = [], oth = cs.filter(function (x) { return x !== c; });
    if (typeof c.price === 'number' && cs.every(function (x) { return x.price == null || x.price >= c.price; }) && cs.filter(function (x) { return x.price === c.price; }).length === 1) o.push('the lowest cash price here');
    var oc = oth.filter(function (x) { return x.t !== c.t && typeof x.price === 'number'; });
    if (c.t === 'used' && oc.length && c.price) { var d = Math.max.apply(0, oc.map(function (x) { return x.price; })) - c.price; if (d > 0) o.push(m0(d) + ' less than new'); }
    function top(f, low, label) {
      var v = c[f]; if (typeof v !== 'number') return;
      var has = cs.filter(function (x) { return typeof x[f] === 'number'; }); if (has.length < 2) return;
      if (!has.every(function (x) { return low ? x[f] >= v : x[f] <= v; })) return;
      if (has.filter(function (x) { return x[f] === v; }).length > 1) return;
      o.push(label + (has.length < cs.length ? ' of the cars with a figure listed' : ''));
    }
    top('monthly', true, 'the lowest monthly'); top('power', false, 'the most power'); top('boot', false, 'the biggest boot');
    if (!o.length) o.push('a strong all rounder against the others here');
    var s = o.join(', '); return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16); }

  /* ---------- chapters ---------- */
  function heroCh(s) {
    var c = s.r.c, pics = D.pics(c), who = D.first ? 'Picked for ' + D.first : 'Picked for you';
    var kb = pics.length ? pics.map(function (u, k) { return '<img src="' + e(u) + '" alt=""' + (k === 0 ? ' class="on"' : '') + '/>'; }).join('') : '';
    return { id: 'car', label: 'The car', cls: 'p2-hero', html: '<div class="p2-kb">' + (kb || '<div class="p2-nophoto"></div>') + '</div>'
      + '<div class="p2-herocopy"><p class="p2-kick">' + e(who) + '</p><h1>' + e(D.name(s)) + '</h1>'
      + (FOCUS === 0 && D.total ? '<p>Based on everything you\u2019ve told me, out of the ' + e(D.total) + ' cars in our stock, I believe this is the one for you.</p>' : '<p>' + e(s.role === 'new' ? 'Brand new, built for you.' : 'Also worth a look.') + '</p>')
      + '<p class="p2-price">' + e(rec(s).priceText) + '</p></div>' };
  }
  function whyCh(s) {
    var t = told(), w = D.why(s);
    return { id: 'why', label: 'Why it suits you', html: '<p class="p2-kick">Why it suits you</p><h2>You told me what matters. Here is how this car answers it.</h2>'
      + '<div class="p2-two"><div><p class="p2-sub">You told me</p>' + (t.length ? '<ul class="p2-chips">' + t.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul>' : '<p>Tell me a little more and I\u2019ll show you why.</p>') + '</div>'
      + '<div><p class="p2-sub">Why this one</p><ul class="p2-why">' + (w.length ? w.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') : '<li>' + e(D.name(s)) + ' fits the brief you gave me.</li>') + '</ul>' + D.protect(s) + '</div></div>' };
  }
  function mediaCh(s) {
    var c = s.r.c; if (s.kind !== 'used' || !c.reg) return null;
    var p = D.pics(c)[0];
    return { id: 'walk', label: 'Walkaround', media: true, html: '<p class="p2-kick">Walk around it</p><h2>' + e(D.name(s)) + '</h2>'
      + '<div class="p2-media" data-aos-reg="' + e(c.reg) + '" data-aos-src="' + (c._home ? 'forecourt' : 'group') + '">' + (p ? '<img src="' + e(p) + '" alt=""/>' : '') + '</div>'
      + '<p class="p2-hint">Drag to spin it round, or play the walkaround video. If it was not filmed yet, the photographs stay.</p>' };
  }
  function specCh(s) {
    var r = rec(s), kit = r.equip.slice(0, 14);
    var facts = [['Price', r.priceText], ['Year', r.age], ['Mileage', r.t === 'used' && r.mileage != null ? r.mileage.toLocaleString('en-GB') + ' miles' : (r.t === 'new' ? 'Delivery miles' : null)],
      ['Fuel', r.fuel], ['Gearbox', r.gear], ['Colour', r.colour], ['Power', r.power ? r.power + ' hp' : null], ['0 to 62 mph', r.zero62 ? r.zero62 + ' seconds' : null],
      ['Boot', r.boot ? r.boot + ' litres' : null], ['Electric range', r.ev ? r.ev + ' miles (official)' : null], ['Seats', r.seats], ['Ready', r.ready]]
      .filter(function (x) { return x[1] != null && x[1] !== ''; });
    return { id: 'spec', label: 'Key spec', html: '<p class="p2-kick">The key spec</p><h2>' + e(D.name(s)) + '</h2><div class="p2-specgrid"><div><div class="p2-facts">'
      + facts.map(function (x) { return '<div><span>' + e(x[0]) + '</span><b>' + e(x[1]) + '</b></div>'; }).join('') + '</div>' + D.fin(s) + '</div>'
      + '<div>' + (kit.length ? '<p class="p2-sub">Highlights' + (r.equip.length > kit.length ? ', ' + kit.length + ' of ' + r.equip.length : '') + '</p><ul class="p2-kit">' + kit.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul>' : '') + '</div></div>' };
  }
  function cardsCh(id, label, kick, title, list) {
    if (!list.length) return null;
    return { id: id, label: label, html: '<p class="p2-kick">' + e(kick) + '</p><h2>' + e(title) + '</h2><div class="p2-cards">' + list.map(function (x) {
      var r = rec(x.s), c = x.s.r.c;
      var sub = x.s.kind === 'new' ? [c.colour, c.fuel, D.M.newWhen(c)].filter(Boolean).join(', ') : [c.colour, String(c.mileage || '').replace(/\u00a0/g, ' '), r.ready].filter(Boolean).join(', ');
      return '<button type="button" class="p2-card" data-focus="' + x.i + '">' + (r.img ? '<img src="' + e(r.img) + '" alt="" loading="lazy"/>' : '')
        + '<div><em>' + (x.i === FOCUS ? 'Showing now' : 'Tap to explore') + '</em><h3>' + e(r.name) + '</h3><p>' + e(sub) + '</p><p class="p2-cp">' + e(r.priceText) + '</p></div></button>';
    }).join('') + '</div>' };
  }
  function compareCh() {
    var sl = D.slides, pick = sl.filter(function (x) { return x.kind === 'used'; }).slice(0, 3).concat(sl.filter(function (x) { return x.kind === 'new'; }).slice(0, 1));
    if (pick.length < 4) pick = sl.slice(0, 4);
    if (pick.length < 2) return null;
    var cs = pick.map(rec), eqN = cs.map(function (c) { return c.equip.map(norm); });
    var h = '<table class="p2-cmp"><thead><tr><th></th>' + cs.map(function (c) { return '<th>' + (c.img ? '<img src="' + e(c.img) + '" alt=""/>' : '') + '<span class="p2-tag">' + (c.t === 'new' ? 'Brand new' : 'Approved used') + '</span><br/>' + e(c.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
    h += '<tr class="p2-says"><th>Dan says</th>' + cs.map(function (c) { return '<td>' + e(verdict(c, cs)) + '</td>'; }).join('') + '</tr>';
    ROWS.forEach(function (R) {
      var vals = cs.map(function (c) { return c[R[1]]; });
      if (vals.every(function (v) { return v == null || v === ''; })) return;
      var same = vals.every(function (x) { return String(x) === String(vals[0]); });
      var nums = vals.filter(function (x) { return typeof x === 'number'; });
      var t = R[3] && nums.length > 1 ? (R[3] === 'low' ? Math.min.apply(0, nums) : Math.max.apply(0, nums)) : null;
      h += '<tr><th>' + e(R[0]) + '</th>' + cs.map(function (c) {
        var v = c[R[1]], best = t != null && v === t && !same;
        var txt = v == null || v === '' ? (R[1] === 'monthly' && c.t === 'new' ? 'Personalised quote' : 'Not listed') : (R[2] ? R[2](v) : v);
        return '<td' + (best ? ' class="best"' : '') + '>' + e(txt) + '</td>'; }).join('') + '</tr>';
    });
    h += '<tr class="p2-only"><th>Only this car has</th>' + cs.map(function (c, i) {
      var only = c.equip.filter(function (x, j) { var n = eqN[i][j]; return eqN.every(function (L, k) { return k === i || L.indexOf(n) < 0; }); }).slice(0, 5);
      return '<td>' + (only.length ? only.map(e).join('<br/>') : '') + '</td>'; }).join('') + '</tr></tbody></table>';
    var reps = cs.filter(function (c) { return c.monthly; }).map(function (c) { return e(c.name) + ': representative example: ' + e(D.M.repText(c.s.r.fin)); });
    var newQ = cs.some(function (c) { return c.t === 'new'; }) ? '<p class="p2-fine">Brand new: finance available, I\u2019ll put together a personalised quote.</p>' : '';
    if (reps.length) h += '<p class="p2-fine">' + reps.join('<br/>') + '</p>' + newQ + '<p class="p2-fine">' + e(BROKER) + '</p>'; else h += newQ;
    return { id: 'compare', label: 'Compare', html: '<p class="p2-kick">Side by side</p><h2>Compare these</h2>' + h };
  }
  function closeCh() {
    var phone = D.phone.replace(/\D/g, ''); if (phone.indexOf('0') === 0) phone = '44' + phone.slice(1);
    var wa = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(D.text());
    return { id: 'next', label: 'Next steps', cls: 'p2-close', html: '<p class="p2-kick">What happens next</p><h1>' + e(D.first ? 'Over to you, ' + D.first + '.' : 'Over to you.') + '</h1>'
      + '<ol class="p2-steps"><li>Take it for a test drive, whenever suits you.</li><li>I\u2019ll value your car properly when you bring it in.</li><li>I\u2019ll put together a personalised quote, no pressure.</li></ol>'
      + '<div class="p2-btns"><a class="p2-btn" href="' + BOOK + '" target="_blank" rel="noopener">Book a test drive</a>'
      + (phone ? '<a class="p2-btn wa" href="' + e(wa) + '" target="_blank" rel="noopener">Send me this by WhatsApp</a>' : '') + '</div>'
      + '<div class="p2-sign"><img src="dan.jpg" alt=""/><div><b>Dan</b><br/>Your inside BMW guy, Hedin BMW Ruxley</div></div>' };
  }
  function build() {
    var sl = D.slides, s = sl[FOCUS] || sl[0];
    var items = sl.map(function (x, i) { return { s: x, i: i }; });
    CH = [heroCh(s), whyCh(s), mediaCh(s), specCh(s),
      cardsCh('alts', 'Alternatives', 'Also worth a look', 'Other cars that fit', items.filter(function (x) { return x.s.kind === 'used' && x.i !== FOCUS; })),
      cardsCh('new', 'Brand new', 'Brand new options', 'Or built new, just for you', items.filter(function (x) { return x.s.kind === 'new' && x.i !== FOCUS; })),
      compareCh(), closeCh()].filter(Boolean);
    var tr = ROOT.querySelector('.p2-track');
    tr.innerHTML = CH.map(function (c, i) { return '<section class="p2-ch ' + (c.cls || '') + '" data-ch="' + i + '" aria-label="' + e(c.label) + '">' + c.html + '</section>'; }).join('');
    ROOT.querySelector('.p2-nav').innerHTML = CH.map(function (c, i) { return '<button type="button" data-go="' + i + '">' + e(c.label) + '</button>'; }).join('');
  }
  function kenBurns(sec) {
    clearInterval(KBT);
    var imgs = sec ? sec.querySelectorAll('.p2-kb img') : []; if (imgs.length < 2) return;
    var k = 0;
    KBT = setInterval(function () { imgs[k].classList.remove('on'); k = (k + 1) % imgs.length; imgs[k].classList.add('on'); }, 6000);
  }
  function go(i) {
    if (i < 0 || i >= CH.length) return;
    var prev = IDX; IDX = i;
    [].forEach.call(ROOT.querySelectorAll('.p2-ch'), function (sec, k) {
      sec.classList.toggle('on', k === IDX); sec.classList.toggle('back', k < IDX);
      if (k !== IDX && window.aosMedia && sec.querySelector('[data-aos-reg]') && window.aosMedia.leave) window.aosMedia.leave(sec.querySelector('[data-aos-reg]'));
    });
    [].forEach.call(ROOT.querySelectorAll('.p2-nav button'), function (b, k) { b.classList.toggle('on', k === IDX); });
    ROOT.querySelector('.p2-arrow.prev').disabled = IDX === 0;
    ROOT.querySelector('.p2-arrow.next').disabled = IDX === CH.length - 1;
    var sec = ROOT.querySelector('.p2-ch.on');
    kenBurns(CH[IDX].id === 'car' ? sec : null);
    clearInterval(SPT);
    if (CH[IDX].media && window.aosMedia) {
      var area = sec.querySelector('[data-aos-reg]'); window.aosMedia.scan(sec);
      var n = 0; SPT = setInterval(function () { var b = area.querySelector('button.aos-b[data-aos="spin"]'); if (b) { clearInterval(SPT); b.click(); } else if (++n > 40) clearInterval(SPT); }, 500);
    }
    if (prev !== IDX && sec) sec.scrollTop = 0;
  }
  function chrome() {
    ROOT = document.createElement('div'); ROOT.className = 'p2'; ROOT.id = 'deskPresentV2'; ROOT.hidden = true;
    ROOT.setAttribute('role', 'dialog'); ROOT.setAttribute('aria-label', 'Presentation');
    ROOT.innerHTML = '<div class="p2-top"><span class="p2-brand">Dan \u00b7 Hedin BMW Ruxley</span><span class="p2-tools"><button type="button" class="p2-ic" data-act="fs">Full screen</button><button type="button" class="p2-ic" data-act="close">Close</button></span></div>'
      + '<div class="p2-track"></div><button type="button" class="p2-arrow prev" aria-label="Previous">&#8249;</button><button type="button" class="p2-arrow next" aria-label="Next">&#8250;</button><nav class="p2-nav"></nav>';
    document.body.appendChild(ROOT);
    ROOT.addEventListener('click', function (ev) {
      var t = ev.target.closest('button'); if (!t) return;
      if (t.dataset.go) go(+t.dataset.go);
      else if (t.classList.contains('prev')) go(IDX - 1);
      else if (t.classList.contains('next')) go(IDX + 1);
      else if (t.dataset.act === 'close') close();
      else if (t.dataset.act === 'fs') fs();
      else if (t.dataset.focus != null) { FOCUS = +t.dataset.focus; build(); go(0); }
    });
    var sx = null, sy = null;
    ROOT.addEventListener('touchstart', function (ev) { if (ev.target.closest('.aos-stage,.p2-cmp')) { sx = null; return; } sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; }, { passive: true });
    ROOT.addEventListener('touchend', function (ev) {
      if (sx == null) return; var dx = ev.changedTouches[0].clientX - sx, dy = ev.changedTouches[0].clientY - sy; sx = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(IDX + (dx < 0 ? 1 : -1));
    }, { passive: true });
    document.addEventListener('keydown', function (ev) {
      if (ROOT.hidden) return;
      if (ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); go(IDX + 1); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); go(IDX - 1); }
      else if (ev.key === 'Escape') { if (ROOT.querySelector('.p2-ch.on .aos-stage')) return; ev.preventDefault(); close(); }
      else if (ev.key === 'f' || ev.key === 'F') fs();
    }, true);
  }
  function fs() {
    if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen().catch(function () {}); return; }
    var req = ROOT.requestFullscreen || ROOT.webkitRequestFullscreen;
    if (req) { try { var p = req.call(ROOT); if (p && p.catch) p.catch(function () {}); } catch (x) {} }
  }
  function open() {
    D = window.fmbDeskPresentData && window.fmbDeskPresentData(); if (!D || !D.slides.length) return;
    if (!ROOT) chrome();
    FOCUS = 0; build(); ROOT.hidden = false; document.body.style.overflow = 'hidden';
    go(0); fs();
  }
  function close() {
    clearInterval(KBT); clearInterval(SPT);
    ROOT.hidden = true; document.body.style.overflow = '';
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    [].forEach.call(ROOT.querySelectorAll('[data-aos-reg]'), function (a) { if (window.aosMedia && window.aosMedia.leave) window.aosMedia.leave(a); });
  }
  var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'present-v2.css?v=1'; document.head.appendChild(l);
  window.dpV2 = { open: open, close: close, go: go, chapters: function () { return CH.map(function (c) { return c.id; }); } };
})();
