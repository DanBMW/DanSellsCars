/* Today's offers: the day's cars, claimable only on the day.
 *
 * Dan, 11 October: "the daily stock card offers on used cars, can we include a
 * couple of new cars also and change them daily on a todays offers page, that
 * rotates daily, the customer would have to click on the offer on the day it's
 * there which would send me a message with all the details I need".
 *
 * There is NO new automation behind this page, deliberately. The used cars are
 * the three the morning routine already picks for the Instagram finance cards
 * (finance-posts/index.json), which already rotate, already carry a 21 day
 * cooldown so the same car cannot come round twice in three weeks, and already
 * hold a live lender quote. So the page and the day's posts show the same
 * cars, which is what a customer who saw the post is looking for, and the
 * morning has no more work to do than it did yesterday.
 *
 * The brand new pair is chosen from lookup/new-stock.json by the London date
 * alone, the way the board picks its forecourt six: every visitor on a given
 * day sees the same two, it rotates at midnight with nobody pressing anything,
 * and there is no state to keep.
 *
 * Finance rules, unchanged from the rest of the site:
 *   - a used monthly figure appears only with the lender's whole
 *     representative example beside it, read from automation/stock-finance.json
 *     through dsfinance.js, and only while that quote is live;
 *   - a brand new card shows the cash price and no monthly at all. BMW publish
 *     a monthly for these but no deposit, term or final payment that could
 *     make a compliant example, and the figures new-stock.py derives are not
 *     a quotation. Same rule the Find my BMW matcher keeps.
 */
(function () {
  'use strict';
  var FN = window.dsFin, ST = window.dsStock;
  var FORM = 'https://formspree.io/f/xqewleog';
  var DAN_EMAIL = 'daniel.cane@hedinautomotive.co.uk';
  var WA = '447827138197';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function track(n, p) { if (window.gtag) window.gtag('event', n, p || {}); }
  function getJSON(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error(r.status); return r.json(); }); }

  /* ---------- the day ----------
     London, not UTC and not the visitor's clock: the offer is Dan's working
     day. Every client derives the same key from its own clock, so two people
     reading the page in different time zones still see the same cars, the same
     way the board agrees with itself across screens. */
  function londonParts(d) {
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London',
      year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d || new Date());
    var o = {};
    f.forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function todayKey(d) { var p = londonParts(d); return p.year + '-' + p.month + '-' + p.day; }
  /* Midnight London, as an instant. Built by asking what London says the time
     is right now and taking the rest of the day off the clock, so it needs no
     table of when the clocks change. */
  function msToMidnight() {
    var now = new Date();
    var s = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false,
      hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now).split(':');
    var gone = (+s[0] % 24) * 3600 + (+s[1]) * 60 + (+s[2]);
    return (86400 - gone) * 1000 - now.getMilliseconds();
  }
  function longDate(key) {
    var d = new Date(key + 'T12:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  /* A stable hash of the date, so the brand new pair is a function of the day
     and nothing else. */
  function seed(str) {
    var h = 2166136261, i;
    for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }

  /* ---------- data ---------- */
  var DAY = todayKey(), DATA = {}, OFFERS = [];
  Promise.all([
    getJSON('finance-posts/index.json')['catch'](function () { return { posts: [] }; }),
    getJSON('automation/hedin-stock-snapshot.json')['catch'](function () { return []; }),
    getJSON('automation/stock-finance.json')['catch'](function () { return {}; }),
    getJSON('automation/car-details.json')['catch'](function () { return {}; }),
    getJSON('automation/stock-arrivals.json')['catch'](function () { return null; }),
    getJSON('lookup/new-stock.json')['catch'](function () { return { cars: [] }; })
  ]).then(function (r) {
    DATA = { cards: r[0], home: r[1] || [], fin: r[2] || {}, det: r[3] || {}, arr: r[4], neu: r[5] || { cars: [] } };
    build();
  })['catch'](function () { fail(); });

  function fail() {
    $('toEmpty').textContent = 'I could not load today’s cars just now. Message me and I’ll send them over.';
    $('toEmpty').hidden = false;
  }

  /* ---------- picking ---------- */
  function cardsFor(day) {
    var posts = (DATA.cards && DATA.cards.posts) || [];
    var mine = posts.filter(function (p) { return p.date === day; });
    if (mine.length) return { day: day, posts: mine, today: true };
    /* The morning job has not landed yet, or it could not reach the lender.
       Showing the newest day it did make is better than an empty page, as long
       as the page says which day it is talking about rather than calling an
       older car today's offer. */
    var days = posts.map(function (p) { return p.date; }).sort();
    var last = days[days.length - 1];
    return { day: last || null, posts: posts.filter(function (p) { return p.date === last; }), today: false };
  }
  function carByReg(reg) {
    var want = String(reg || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (var i = 0; i < DATA.home.length; i++) {
      var c = DATA.home[i];
      if (String(c.reg || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === want) return c;
    }
    return null;
  }
  /* Two brand new cars, from the date alone. Different models where the stock
     allows it, because two 1 Series side by side is one offer, not two. */
  function newPair(day) {
    var cars = (DATA.neu.cars || []).filter(function (c) {
      return c && c.order_number && c.price_gbp && String(c.on_hold) !== 'True';
    });
    if (!cars.length) return [];
    cars = cars.slice().sort(function (a, b) { return String(a.order_number) < String(b.order_number) ? -1 : 1; });
    var h = seed(day + '|new'), n = cars.length, out = [], used = {};
    for (var step = 0; step < n && out.length < 2; step++) {
      var c = cars[(h + step * 7919) % n];
      var k = c.series || c.description;
      if (used[k]) continue;
      used[k] = 1; out.push(c);
    }
    /* A forecourt with one model on it still gets its second offer. */
    for (var j = 0; j < n && out.length < 2; j++) {
      var d = cars[(h + j) % n];
      if (out.indexOf(d) === -1) out.push(d);
    }
    return out;
  }

  /* ---------- a used offer ---------- */
  function freshDays(id) {
    var a = DATA.arr && DATA.arr.lists && DATA.arr.lists.forecourt;
    if (!a || !a.cars || !a.cars[id] || !a.history_from) return null;
    var first = a.cars[id];
    if (first === a.history_from) return null;      /* seed day: nothing on it is fresh */
    var days = Math.round((new Date(DAY + 'T12:00:00') - new Date(first + 'T12:00:00')) / 86400000);
    return days >= 0 && days <= 7 ? days : null;
  }
  function usedOffer(post) {
    var c = carByReg(post.reg);
    if (!c) return null;
    var f = DATA.fin[c.id];
    var live = f && FN.live(f) ? f : null;
    var pics = FN.photos(c, DATA.det[c.id]) || [];
    if (!pics.length && c.image) pics = [c.image];
    return {
      kind: 'used', id: 'U' + c.id, car: c, fin: live, post: post,
      ref: c.reg, photo: pics[0] || '', pics: pics.slice(0, 6),
      title: (c.year ? c.year + ' ' : '') + (c.model || '').replace(/^BMW\s+/, 'BMW '),
      meta: [c.reg, c.mileage, c.colour, c.fuel].filter(Boolean).join(' · '),
      price: c.price, fresh: freshDays(c.id),
      url: c.url
    };
  }
  function newOffer(c) {
    var weeks = c.lead_time_weeks_min && c.lead_time_weeks_max
      ? c.lead_time_weeks_min + ' to ' + c.lead_time_weeks_max + ' weeks away'
      : (c.lead_time_weeks_max ? c.lead_time_weeks_max + ' weeks away' : '');
    var np = (c.images && c.images.length ? c.images : (c.image ? [c.image] : [])).slice(0, 5);
    return {
      kind: 'new', id: 'N' + c.order_number, car: c, fin: null,
      ref: c.order_number, photo: np[0] || '', pics: np,
      title: 'Brand new BMW ' + (c.description || ''),
      meta: [c.colour, c.fuel, c.transmission, weeks].filter(Boolean).join(' · '),
      price: c.price, weeks: weeks,
      priceKind: String(c.retailer_price) === 'True' ? 'Hedin Ruxley price, on the road' : 'BMW on the road price'
    };
  }

  /* ---------- drawing ---------- */
  function claimRef(o) { return 'OFFER-' + DAY.replace(/-/g, '').slice(2) + '-' + o.ref; }
  function sentKey(o) { return 'dsOffer:' + claimRef(o); }
  function wasSent(o) { try { return !!localStorage.getItem(sentKey(o)); } catch (e) { return false; } }
  function markSent(o) { try { localStorage.setItem(sentKey(o), String(Date.now())); } catch (e) {} }

  function waText(o) {
    var L = ['Hi Dan, I’d like today’s offer on the ' + o.title + '.'];
    L.push(o.kind === 'used' ? 'Reg ' + o.ref + ', ' + (o.price || '') : 'Order ' + o.ref + ', ' + (o.price || ''));
    if (o.fin) L.push(FN.money2(o.fin.monthly) + ' a month at ' + FN.money(o.fin.deposit) + ' down.');
    L.push('Ref ' + claimRef(o) + '.');
    return L.join('\n');
  }
  function waHref(o) { return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(waText(o)); }

  function finHtml(o) {
    if (o.kind === 'new') {
      return '<p class="to-mo"><b>' + esc(o.priceKind) + '</b>'
        + '<span>Finance available. I’ll put a personalised quote together for you.</span></p>';
    }
    if (!o.fin) return '<p class="to-mo"><span>Message me for a quote on this one.</span></p>';
    return '<p class="to-mo"><b>' + esc(FN.money2(o.fin.monthly)) + ' a month</b>'
      + '<span>' + esc(o.fin.product || 'BMW Select (PCP)') + ', ' + esc(FN.money(o.fin.deposit)) + ' deposit, '
      + esc(o.fin.term) + ' months, ' + esc(o.fin.apr) + '% APR representative.</span></p>'
      + '<details class="to-rep"><summary>Representative example</summary>'
      + esc(FN.repExample(o.fin)) + (o.fin.legal ? ' ' + esc(o.fin.legal) : '') + '</details>';
  }

  /* One <img> and the arrows set its src. Five cars times six photographs
     is a lot of picture nobody asked for, which is the rule stock.html and
     new-cars.html both keep. The urls ride on the element rather than in a
     closure, so a repaint cannot lose them. */
  function cardHtml(o) {
    var aos = o.kind === 'used' && o.car.reg
      ? ' data-aos-reg="' + esc(o.car.reg) + '" data-aos-src="forecourt"' : '';
    var flag = o.kind === 'used' && o.fresh !== null && o.fresh !== undefined
      ? '<span class="to-flag">Fresh in</span>' : '';
    var n = (o.pics || []).length;
    var nav = n > 1
      ? '<button class="to-arrow to-prev" type="button" data-step="-1" aria-label="Previous photograph">&#8249;</button>'
        + '<button class="to-arrow to-next" type="button" data-step="1" aria-label="Next photograph">&#8250;</button>'
        + '<span class="to-dots" data-dots aria-hidden="true">'
        + o.pics.map(function (u, k) { return '<i' + (k === 0 ? ' class="on"' : '') + '></i>'; }).join('')
        + '</span>'
      : '';
    return '<article class="to-card" data-offer="' + esc(o.id) + '">'
      + '<div class="to-ph"' + aos + ' data-pics="' + esc((o.pics || []).join('|')) + '" data-at="0"'
      + ' role="button" tabindex="0" aria-label="Open ' + esc(o.title) + '">' + flag
      + (o.photo ? '<img src="' + esc(o.photo) + '" alt="' + esc(o.title) + '" loading="lazy"/>' : '')
      + nav + (n > 1 ? '<span class="to-more">' + n + ' photos</span>' : '') + '</div>'
      + '<div class="to-body">'
      + '<h3>' + esc(o.title) + '</h3>'
      + '<p class="to-meta">' + esc(o.meta) + '</p>'
      + '<p class="to-price">' + esc(o.price || 'Price on request') + '</p>'
      + finHtml(o)
      + '<div class="to-act" data-act></div>'
      + '</div></article>';
  }
  function stepPhoto(area, by) {
    var pics = (area.getAttribute('data-pics') || '').split('|').filter(Boolean);
    if (pics.length < 2) return;
    var at = (parseInt(area.getAttribute('data-at'), 10) || 0) + by;
    if (at < 0) at = pics.length - 1;
    if (at >= pics.length) at = 0;
    area.setAttribute('data-at', String(at));
    var img = area.querySelector('img');
    /* The 360 or the video may be open over the photograph. Put it away
       first, the way every other page that carries one does. */
    if (window.aosMedia) window.aosMedia.leave(area);
    if (img) img.src = pics[at];
    [].forEach.call(area.querySelectorAll('[data-dots] i'), function (d, k) { d.classList.toggle('on', k === at); });
  }

  function actHtml(o) {
    if (wasSent(o)) {
      return '<p class="to-done">Claimed. I’ll come back to you today.</p>'
        + '<a class="to-btn wa" href="' + esc(waHref(o)) + '" target="_blank" rel="noopener" data-wa>Message me on WhatsApp</a>';
    }
    /* WhatsApp sits beside the claim rather than only after it: it is the
       primary action everywhere else on this site, and this link is itself
       shared over WhatsApp. */
    return '<button type="button" class="to-btn" data-open>Claim this one</button>'
      + '<a class="to-btn wa" href="' + esc(waHref(o)) + '" target="_blank" rel="noopener" data-wa>Ask me about it on WhatsApp</a>';
  }
  function formHtml(o) {
    return '<form class="to-form" novalidate>'
      + '<p class="to-formnote">Two things and it is done. I’ll come back to you today with the figures on your own deposit.</p>'
      + '<label>Your name<input name="name" autocomplete="name" required/></label>'
      + '<label>Mobile<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required/></label>'
      + '<label>Email, if you’d like it in writing<input name="email" type="email" autocomplete="email"/></label>'
      + '<label>Anything I should know?<textarea name="note" rows="2" maxlength="400" placeholder="Part exchange, deposit, when you need it"></textarea></label>'
      + '<span class="to-hp"><label>Leave this empty<input name="_gotcha" tabindex="-1" autocomplete="off"/></label></span>'
      + '<p class="to-err" data-err hidden role="alert"></p>'
      + '<button type="submit" class="to-btn" data-send>Send it to Dan</button>'
      + '<button type="button" class="to-btn ghost" data-cancel>Not now</button>'
      + '</form>';
  }

  function paintAct(root, o) {
    var box = root && root.querySelector('[data-act]');
    if (box) box.innerHTML = actHtml(o);
  }
  /* A claim made in the full page view has to show on the card behind it,
     and the other way about, or somebody goes back and is asked again for
     something Dan already has. */
  function paintEverywhere(o) {
    var card = document.querySelector('[data-offer="' + o.id + '"]');
    if (card) paintAct(card, o);
    if (!$('toCar').hidden && OFFERS[CAR] === o) paintAct($('tcBody'), o);
  }

  /* ---------- the claim ----------
     One submission per claim, guarded by a key per offer so a refresh or a
     double tap cannot fire a second. Formspree is rationed on this site and a
     claim is the one message Dan actually wants from this page. */
  function send(o, form, card) {
    var fd = {}, i, el = form.elements;
    for (i = 0; i < el.length; i++) if (el[i].name) fd[el[i].name] = String(el[i].value || '').trim();
    var err = form.querySelector('[data-err]');
    if (!fd.name || !fd.phone) {
      err.hidden = false; err.textContent = 'I need a name and a mobile so I can come back to you.';
      return;
    }
    if (fd._gotcha) return;                       /* honeypot */
    var btn = form.querySelector('[data-send]');
    btn.disabled = true; btn.textContent = 'Sending';
    err.hidden = true;

    var P = {
      form: 'todays-offer', offer_ref: claimRef(o), offer_date: DAY, offer_kind: o.kind,
      _subject: 'Today’s offer claimed: ' + fd.name + ', ' + o.title + ' ' + o.ref,
      _replyto: fd.email || DAN_EMAIL,
      _gotcha: '',
      name: fd.name, phone: fd.phone, email: fd.email, note: fd.note,
      car: o.title, price: o.price || '',
      reg: o.kind === 'used' ? o.ref : '', order_number: o.kind === 'new' ? o.ref : '',
      listing: o.url || '',
      monthly: o.fin ? FN.money2(o.fin.monthly) : '',
      deposit: o.fin ? FN.money(o.fin.deposit) : '',
      term: o.fin ? o.fin.term + ' months' : '',
      apr: o.fin ? o.fin.apr + '%' : '',
      quote_reference: (o.post && o.post.quote_reference) || (o.fin && o.fin.quote_reference) || '',
      representative_example: o.fin ? FN.repExample(o.fin) : '',
      page_url: location.href
    };
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    fetch(FORM, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(P), signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        return r.json()['catch'](function () { return {}; }).then(function (j) {
          clearTimeout(to);
          if (!r.ok || (j && (j.ok === false || j.error || j.errors))) throw new Error(String(r.status));
          return j;
        });
      })
      .then(function () {
        markSent(o);
        paintEverywhere(o);
        track('offer_claim', { offer_ref: claimRef(o), kind: o.kind, reg: o.ref });
      }, function (x) {
        clearTimeout(to);
        btn.disabled = false; btn.textContent = 'Try again';
        err.hidden = false;
        err.innerHTML = 'That did not send, so nothing reached Dan. Try again, or '
          + '<a href="' + esc(waHref(o)) + '" target="_blank" rel="noopener">send it on WhatsApp</a>.';
        track('offer_claim_error', { offer_ref: claimRef(o), status: String(x && x.message || 'network') });
      });
  }

  /* What a tap on the claim controls means, in one place, so the card and
     the full page view cannot drift apart. */
  function claimClick(e, root, o) {
    if (e.target.closest('[data-open]')) {
      root.querySelector('[data-act]').innerHTML = formHtml(o);
      var f = root.querySelector('form');
      f.querySelector('input[name=name]').focus();
      track('offer_claim_open', { offer_ref: claimRef(o), kind: o.kind });
      return true;
    }
    if (e.target.closest('[data-cancel]')) { paintAct(root, o); return true; }
    if (e.target.closest('[data-wa]')) { track('offer_whatsapp', { offer_ref: claimRef(o) }); return true; }
    return false;
  }
  function wire(card, o, idx) {
    card.addEventListener('click', function (e) {
      if (claimClick(e, card, o)) return;
      var ph = e.target.closest('.to-ph');
      if (ph) {
        /* aos-media's own Video and 360 buttons, and the photo arrows, keep
           their taps; anything else on the photograph opens the car. */
        if (e.target.closest('.aos-bar, .aos-stage')) return;
        var step = e.target.closest('[data-step]');
        if (step) { stepPhoto(ph, parseInt(step.getAttribute('data-step'), 10)); return; }
        openCar(idx);
        return;
      }
      if (e.target.closest('a, button, input, textarea, label, summary')) return;
      openCar(idx);
    });
    card.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('to-ph')) {
        e.preventDefault(); openCar(idx);
      }
    });
    card.addEventListener('submit', function (e) {
      e.preventDefault();
      send(o, e.target, card);
    });
  }

  /* ---------- one car, full page ----------
     Dan is sharing this link rather than the cards now, so the page has to
     stand up as the thing a customer reads rather than a list of three
     thumbnails. A tap opens the car itself: the 360 where AutoOnShow has
     one, the photographs where it does not, and the price, the facts, the
     figures and the claim underneath. One column at every width, because a
     car is a tall thing to read about on a phone. */
  var CAR = 0, SPINT = null;

  function carFacts(o) {
    var c = o.car;
    if (o.kind === 'new') {
      return [['Colour', c.colour], ['Fuel', c.fuel], ['Gearbox', c.transmission],
        ['Seats', c.seats], ['Wheels', c.wheels], ['Ready', o.weeks],
        ['0 to 62', c.zero_to_62 ? c.zero_to_62 + ' seconds' : ''],
        ['Order number', c.order_number]];
    }
    return [['Registration', c.reg], ['Year', c.year], ['Mileage', c.mileage],
      ['Colour', c.colour], ['Fuel', c.fuel], ['Gearbox', c.gearbox],
      ['Seats', c.seats], ['Where', c._home === false ? 'In the group, I can bring it in' : 'Here at Ruxley']];
  }
  function carKit(o) {
    if (o.kind === 'new') {
      return (o.car.options || []).concat(o.car.packages || []).concat(o.car.standard || []).filter(Boolean);
    }
    var det = (DATA.det || {})[o.car.id] || {};
    return (det.equipment || []).filter(Boolean);
  }
  function carHtml(o) {
    var pics = o.pics || [], kit = carKit(o);
    var aos = o.kind === 'used' && o.car.reg
      ? ' data-aos-reg="' + esc(o.car.reg) + '" data-aos-src="forecourt"' : '';
    var h = '<div class="tc-photo"' + aos + '>'
      + (pics[0] ? '<img id="tcImg" src="' + esc(pics[0]) + '" alt="' + esc(o.title) + '"/>' : '')
      + (pics.length > 1 ? '<div class="tc-thumbs">' + pics.map(function (u, k) {
          return '<button type="button" data-shot="' + k + '"' + (k === 0 ? ' class="on"' : '')
            + ' aria-label="Photograph ' + (k + 1) + '"><img src="' + esc(u) + '" alt=""/></button>'; }).join('') + '</div>' : '')
      + '</div>';
    h += '<div class="tc-info">'
      + '<p class="tc-kick">' + (o.kind === 'new' ? 'Brand new, already built' : 'Approved used') + '</p>'
      + '<h2>' + esc(o.title) + '</h2>'
      + '<p class="tc-price">' + esc(o.price || 'Price on request') + '</p>'
      + finHtml(o)
      + '<ul class="tc-facts">' + carFacts(o).filter(function (r) { return r[1]; }).map(function (r) {
          return '<li><b>' + esc(r[0]) + '</b>' + esc(r[1]) + '</li>'; }).join('') + '</ul>';
    if (kit.length) h += '<details class="tc-kit"><summary>What this one has, ' + kit.length + ' things</summary><ul>'
      + kit.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>';
    h += '<div class="tc-act" data-act></div></div>';
    return h;
  }
  /* The 360 opens by itself where there is one. aos-media decides whether
     that is true and the answer arrives whenever the CDN gets round to it,
     so this waits for its button rather than assuming a time; a car with no
     spin simply keeps its photographs and nothing happens. */
  function autoSpin(area) {
    clearInterval(SPINT);
    var n = 0;
    SPINT = setInterval(function () {
      if (!area || !document.body.contains(area) || $('toCar').hidden) { clearInterval(SPINT); return; }
      var b = area.querySelector('button.aos-b[data-aos="spin"]');
      if (b) { clearInterval(SPINT); b.click(); return; }
      if (++n > 45) clearInterval(SPINT);
    }, 500);
  }
  function paintCar() {
    var o = OFFERS[CAR]; if (!o) return;
    $('tcBody').innerHTML = carHtml(o);
    $('tcBody').scrollTop = 0;
    $('tcCount').textContent = (CAR + 1) + ' of ' + OFFERS.length;
    $('tcPrev').disabled = CAR === 0;
    $('tcNext').disabled = CAR === OFFERS.length - 1;
    paintAct($('tcBody'), o);
    var area = $('tcBody').querySelector('.tc-photo');
    if (window.aosMedia && area) { window.aosMedia.scan($('tcBody')); autoSpin(area); }
  }
  function openCar(i) {
    if (!OFFERS.length) return;
    CAR = Math.max(0, Math.min(i || 0, OFFERS.length - 1));
    $('toCar').hidden = false;
    document.body.classList.add('to-open');
    paintCar();
    $('tcClose').focus();
    track('offer_car_view', { offer_ref: claimRef(OFFERS[CAR]), kind: OFFERS[CAR].kind });
  }
  function closeCar() {
    clearInterval(SPINT);
    $('toCar').hidden = true; $('tcBody').innerHTML = '';
    document.body.classList.remove('to-open');
  }
  function wireCar() {
    $('tcClose').addEventListener('click', closeCar);
    $('tcPrev').addEventListener('click', function () { if (CAR > 0) { CAR -= 1; paintCar(); } });
    $('tcNext').addEventListener('click', function () { if (CAR < OFFERS.length - 1) { CAR += 1; paintCar(); } });
    $('tcBody').addEventListener('click', function (e) {
      var t = e.target.closest('[data-shot]');
      if (t) {
        var k = parseInt(t.getAttribute('data-shot'), 10), o = OFFERS[CAR];
        var area = $('tcBody').querySelector('.tc-photo');
        if (window.aosMedia && area) window.aosMedia.leave(area);
        clearInterval(SPINT);
        var img = $('tcImg'); if (img) img.src = (o.pics || [])[k] || '';
        [].forEach.call($('tcBody').querySelectorAll('[data-shot]'), function (b) { b.classList.toggle('on', b === t); });
        return;
      }
      claimClick(e, $('tcBody'), OFFERS[CAR]);
    });
    $('tcBody').addEventListener('submit', function (e) {
      e.preventDefault(); send(OFFERS[CAR], e.target, $('tcBody'));
    });
    document.addEventListener('keydown', function (e) {
      if ($('toCar').hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeCar(); }
      else if (e.key === 'ArrowRight' && CAR < OFFERS.length - 1) { CAR += 1; paintCar(); }
      else if (e.key === 'ArrowLeft' && CAR > 0) { CAR -= 1; paintCar(); }
    });
  }

  /* ---------- build ---------- */
  function build() {
    var pick = cardsFor(DAY);
    OFFERS = [];
    (pick.posts || []).forEach(function (p) { var o = usedOffer(p); if (o) OFFERS.push(o); });
    var news = newPair(DAY).map(newOffer);

    if (!OFFERS.length && !news.length) {
      $('toEmpty').textContent = 'Nothing is up just at the moment. Message me and I\u2019ll tell you what has just landed.';
      askBlock();
      return;
    }
    $('toEmpty').hidden = true;

    if (pick.day && !pick.today) {
      $('toKick').textContent = 'The latest, from ' + longDate(pick.day);
      $('toTitle').textContent = 'The latest cars';
      $('toLede').textContent = 'Today\u2019s are still being put together, so these are the ones from ' + longDate(pick.day) + '. They are all still here.';
    } else {
      $('toKick').textContent = 'Today only, ' + longDate(DAY);
      $('toClock').hidden = false;
      tick();
    }

    if (OFFERS.length) { $('toUsedH').hidden = false; $('toUsed').innerHTML = OFFERS.map(cardHtml).join(''); }
    if (news.length) { $('toNewH').hidden = false; $('toNew').innerHTML = news.map(cardHtml).join(''); }

    OFFERS = OFFERS.concat(news);
    OFFERS.forEach(function (o, i) {
      var card = document.querySelector('[data-offer="' + o.id + '"]');
      if (!card) return;
      paintAct(card, o);
      wire(card, o, i);
    });
    wireCar();
    askBlock();
    if (window.aosMedia) window.aosMedia.scan(document);
    track('offers_view', { offer_date: pick.day || '', used: pick.posts.length, brand_new: news.length });
  }
  /* The way out for somebody none of these suit, which on a page of five
     cars is most people. WhatsApp first, the way the rest of the site is. */
  function askBlock() {
    $('toAsk').hidden = false;
    $('toAskWa').href = 'https://wa.me/' + WA + '?text='
      + encodeURIComponent('Hi Dan, I saw today\u2019s offers. None of them are quite right, what I am after is ');
    $('toAskWa').addEventListener('click', function () { track('offer_ask_whatsapp', { offer_date: DAY }); });
  }

  /* The countdown is the honest part of "today only": it says how long is
     left, and when it runs out the page reloads itself onto the new day
     rather than leaving somebody able to claim yesterday's car. */
  function tick() {
    var left = msToMidnight();
    if (left <= 0) { location.reload(); return; }
    var h = Math.floor(left / 3600000), m = Math.floor(left / 60000) % 60;
    $('toLeft').textContent = h > 0 ? h + 'h ' + m + 'm left' : m + 'm left';
    setTimeout(tick, left < 60000 ? left + 500 : 30000);
  }

  /* for the tests */
  window.toDebug = { day: function () { return DAY; }, offers: function () { return OFFERS; },
    ref: claimRef, waText: waText, newPair: newPair, msToMidnight: msToMidnight };
})();
