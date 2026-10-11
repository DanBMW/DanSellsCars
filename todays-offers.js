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
    return {
      kind: 'used', id: 'U' + c.id, car: c, fin: live, post: post,
      ref: c.reg, photo: pics[0] || c.image || '',
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
    return {
      kind: 'new', id: 'N' + c.order_number, car: c, fin: null,
      ref: c.order_number, photo: (c.images && c.images[0]) || c.image || '',
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

  function cardHtml(o) {
    var aos = o.kind === 'used' && o.car.reg
      ? ' data-aos-reg="' + esc(o.car.reg) + '" data-aos-src="forecourt"' : '';
    var flag = o.kind === 'used' && o.fresh !== null && o.fresh !== undefined
      ? '<span class="to-flag">Fresh in</span>' : '';
    return '<article class="to-card" data-offer="' + esc(o.id) + '">'
      + '<div class="to-ph"' + aos + '>' + flag
      + (o.photo ? '<img src="' + esc(o.photo) + '" alt="" loading="lazy"/>' : '') + '</div>'
      + '<div class="to-body">'
      + '<h3>' + esc(o.title) + '</h3>'
      + '<p class="to-meta">' + esc(o.meta) + '</p>'
      + '<p class="to-price">' + esc(o.price || 'Price on request') + '</p>'
      + finHtml(o)
      + '<div class="to-act" data-act></div>'
      + '</div></article>';
  }

  function actHtml(o) {
    if (wasSent(o)) {
      return '<p class="to-done">Claimed. I’ll come back to you today.</p>'
        + '<a class="to-btn wa" href="' + esc(waHref(o)) + '" target="_blank" rel="noopener" data-wa>Message me on WhatsApp</a>';
    }
    return '<button type="button" class="to-btn" data-open>Claim this offer</button>';
  }
  function formHtml(o) {
    return '<form class="to-form" novalidate>'
      + '<label>Your name<input name="name" autocomplete="name" required/></label>'
      + '<label>Mobile<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required/></label>'
      + '<label>Email, if you’d like it in writing<input name="email" type="email" autocomplete="email"/></label>'
      + '<label>Anything I should know?<textarea name="note" rows="2" maxlength="400"></textarea></label>'
      + '<span class="to-hp"><label>Leave this empty<input name="_gotcha" tabindex="-1" autocomplete="off"/></label></span>'
      + '<p class="to-err" data-err hidden role="alert"></p>'
      + '<button type="submit" class="to-btn" data-send>Send it to Dan</button>'
      + '<button type="button" class="to-btn ghost" data-cancel>Not now</button>'
      + '</form>';
  }

  function paintAct(card, o) {
    var box = card.querySelector('[data-act]');
    box.innerHTML = actHtml(o);
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
        paintAct(card, o);
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

  function wire(card, o) {
    card.addEventListener('click', function (e) {
      if (e.target.closest('[data-open]')) {
        card.querySelector('[data-act]').innerHTML = formHtml(o);
        var f = card.querySelector('form');
        f.querySelector('input[name=name]').focus();
        track('offer_claim_open', { offer_ref: claimRef(o), kind: o.kind });
        return;
      }
      if (e.target.closest('[data-cancel]')) { paintAct(card, o); return; }
      if (e.target.closest('[data-wa]')) track('offer_whatsapp', { offer_ref: claimRef(o) });
    });
    card.addEventListener('submit', function (e) {
      e.preventDefault();
      send(o, e.target, card);
    });
  }

  /* ---------- build ---------- */
  function build() {
    var pick = cardsFor(DAY);
    OFFERS = [];
    (pick.posts || []).forEach(function (p) { var o = usedOffer(p); if (o) OFFERS.push(o); });
    var news = newPair(DAY).map(newOffer);

    if (!OFFERS.length && !news.length) {
      $('toEmpty').textContent = 'No offers are up at the moment. Message me and I’ll tell you what has just landed.';
      return;
    }
    $('toEmpty').hidden = true;

    if (pick.day && !pick.today) {
      $('toKick').textContent = 'Latest offers';
      $('toTitle').textContent = 'The latest offers';
      $('toLede').textContent = 'Today’s are still being put together. These went up on ' + longDate(pick.day) + '.';
    } else {
      $('toKick').textContent = 'Today only, ' + longDate(DAY);
      $('toClock').hidden = false;
      tick();
    }

    if (OFFERS.length) { $('toUsedH').hidden = false; $('toUsed').innerHTML = OFFERS.map(cardHtml).join(''); }
    if (news.length) { $('toNewH').hidden = false; $('toNew').innerHTML = news.map(cardHtml).join(''); }

    OFFERS = OFFERS.concat(news);
    OFFERS.forEach(function (o) {
      var card = document.querySelector('[data-offer="' + o.id + '"]');
      if (!card) return;
      paintAct(card, o);
      wire(card, o);
    });
    if (window.aosMedia) window.aosMedia.scan(document);
    track('offers_view', { offer_date: pick.day || '', used: pick.posts.length, brand_new: news.length });
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
