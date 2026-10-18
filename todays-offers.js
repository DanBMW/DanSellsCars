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
  /* ---------- data ---------- */
  var DAY = todayKey(), DATA = {}, OFFERS = [];
  Promise.all([
    getJSON('finance-posts/index.json')['catch'](function () { return { posts: [] }; }),
    getJSON('automation/hedin-stock-snapshot.json')['catch'](function () { return []; }),
    getJSON('automation/stock-finance.json')['catch'](function () { return {}; }),
    getJSON('automation/car-details.json')['catch'](function () { return {}; }),
    getJSON('automation/stock-arrivals.json')['catch'](function () { return null; }),
    getJSON('lookup/new-stock.json')['catch'](function () { return { cars: [] }; }),
    getJSON('lookup/new-stock-quotes.json')['catch'](function () { return { quotes: {} }; }),
    getJSON('finance-posts/new-index.json')['catch'](function () { return { posts: [] }; })
  ]).then(function (r) {
    DATA = { cards: r[0], home: r[1] || [], fin: r[2] || {}, det: r[3] || {}, arr: r[4],
      neu: r[5] || { cars: [] }, nq: r[6] || { quotes: {} }, ncards: r[7] || { posts: [] } };
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
  /* Two brand new cars, from the date alone. The rule itself is in
     new-pair.js, shared with the morning job that builds their Instagram
     cards: a card for a car this page is not offering would be worse than no
     card at all. */
  function newPair(day) {
    if (!window.dsNewPair) return [];
    return window.dsNewPair.pick(DATA.neu.cars || [], day, 2);
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
  /* The lender's own BMW Financial Services quote for this car, or null.
     The checks are dsFin.newOk, the same ones new-cars.html applies: every
     item of the representative example present, the quote adding up and
     agreeing with the car's price, inside its own valid_to, and the quotes
     file itself no more than three days old. A quote that does not pass
     shows no monthly figure at all. */
  function newQuote(c) {
    var q = ((DATA.nq && DATA.nq.quotes) || {})[c.order_number];
    return FN.newOk && FN.newOk(c, q, DATA.nq && DATA.nq.generated_at) ? q : null;
  }
  function newOffer(c) {
    var weeks = c.lead_time_weeks_min && c.lead_time_weeks_max
      ? c.lead_time_weeks_min + ' to ' + c.lead_time_weeks_max + ' weeks away'
      : (c.lead_time_weeks_max ? c.lead_time_weeks_max + ' weeks away' : '');
    var np = (c.images && c.images.length ? c.images : (c.image ? [c.image] : [])).slice(0, 5);
    return {
      kind: 'new', id: 'N' + c.order_number, car: c, fin: null, nq: newQuote(c),
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
    if (o.nq) L.push(FN.money2(o.nq.monthly) + ' a month at ' + FN.money(o.nq.deposit) + ' down, '
      + o.nq.term_months + ' months.');
    L.push('Ref ' + claimRef(o) + '.');
    return L.join('\n');
  }
  function waHref(o) { return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(waText(o)); }

  function finHtml(o) {
    if (o.kind === 'new') {
      /* A brand new monthly is BMW Financial Services' own quote for that
         car, recorded from BMW's own page for it, and it never appears
         without the whole representative example beside it. Without a quote
         that passes every check, the card says what kind of price it is and
         offers a personalised quote, which is where this page started. */
      if (!o.nq) {
        return '<p class="to-mo"><b>' + esc(o.priceKind) + '</b>'
          + '<span>Finance available. I’ll put a personalised quote together for you.</span></p>';
      }
      var q = o.nq;
      return '<p class="to-mo"><b>' + esc(FN.money2(q.monthly)) + ' a month</b>'
        + '<span>' + esc(q.product) + ', ' + esc(FN.money(q.deposit)) + ' deposit, '
        + esc(q.term_months) + ' months, ' + esc(q.annual_mileage.toLocaleString('en-GB'))
        + ' miles a year, ' + esc(q.apr) + '% APR representative.</span></p>'
        + '<details class="to-rep" open><summary>Representative example</summary>'
        + esc(FN.newRep(q)) + ' ' + esc(FN.BROKER) + '</details>';
    }
    if (!o.fin) return '<p class="to-mo"><span>Message me for a quote on this one.</span></p>';
    return '<p class="to-mo"><b>' + esc(FN.money2(o.fin.monthly)) + ' a month</b>'
      + '<span>' + esc(o.fin.product || 'BMW Select (PCP)') + ', ' + esc(FN.money(o.fin.deposit)) + ' deposit, '
      + esc(o.fin.term) + ' months, ' + esc(o.fin.apr) + '% APR representative.</span></p>'
      + '<details class="to-rep" open><summary>Representative example</summary>'
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
      monthly: o.fin ? FN.money2(o.fin.monthly) : (o.nq ? FN.money2(o.nq.monthly) : ''),
      deposit: o.fin ? FN.money(o.fin.deposit) : (o.nq ? FN.money(o.nq.deposit) : ''),
      term: o.fin ? o.fin.term + ' months' : (o.nq ? o.nq.term_months + ' months' : ''),
      apr: o.fin ? o.fin.apr + '%' : (o.nq ? o.nq.apr + '%' : ''),
      annual_mileage: o.nq ? o.nq.annual_mileage : (o.fin ? o.fin.annual_mileage : ''),
      vin: o.nq && o.nq.vin ? o.nq.vin : '',
      quote_reference: (o.post && o.post.quote_reference) || (o.fin && o.fin.quote_reference) || '',
      representative_example: o.fin ? FN.repExample(o.fin) : (o.nq ? FN.newRep(o.nq) : ''),
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

  /* ---------- Dan's own cards for the day ----------
     Dan, 16 October: "bring back the offer images that I can share on my
     insta". The images were never lost. The morning routine writes the three
     1080x1920 story cards into finance-posts/ every day, and they are the same
     three cars this page shows, with the same lender quote on them. What went
     away on 11 October, when he started sharing this page instead of the
     cards, was his route to them: the page he now opens every morning had no
     way to get at them. So it carries them.

     Staff only, and query string only: ?dan=1 (or #posts) turns it on and that
     device remembers it, so the link he shares with customers never shows it
     and he never has to add anything after the first time. It is a tidiness
     gate rather than a secret, the way finance-posts.html already is: the
     cards and their captions are public files on a public site.

     The brand new pair has no card image and cannot be given one here. BMW's
     configurator renders are served with no Access-Control-Allow-Origin
     header (checked, 16 October), so a canvas drawn from one cannot be
     exported and anything built in the browser would come out blank. They get
     their caption and a link to the photograph instead, which is what posting
     one by hand from a phone actually needs. */
  var POSTKEY = 'dsOfferPosts';
  function wantPosts() {
    var q = location.search + ' ' + location.hash;
    if (/[?&]dan=0/.test(q)) { try { localStorage.removeItem(POSTKEY); } catch (e) {} return false; }
    if (/[?&]dan=1/.test(q) || /#posts/.test(q)) { try { localStorage.setItem(POSTKEY, '1'); } catch (e) {} return true; }
    try { return localStorage.getItem(POSTKEY) === '1'; } catch (e) { return false; }
  }
  /* A share sheet that will take the file itself is what gets a card into
     Instagram in one go. Feature detected with a real File, because
     navigator.share alone says nothing about whether files are allowed. */
  function canShareFiles() {
    try {
      if (!navigator.share || !navigator.canShare || typeof File !== 'function') return false;
      return navigator.canShare({ files: [new File([new Blob([''], { type: 'image/jpeg' })], 'a.jpg', { type: 'image/jpeg' })] });
    } catch (e) { return false; }
  }
  function expiry(post) {
    var d = post.valid_to ? new Date(post.valid_to) : null;
    if (!d || isNaN(d)) return null;
    var now = new Date();
    if (d < now) return { gone: true, on: d };
    if (d - now < 5 * 86400000) return { soon: true, on: d };
    return null;
  }
  function shortDate(d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }

  /* The brand new pair's caption. Same finance rule the cards themselves
     keep: the cash price and which kind of price it is, and no monthly
     figure, because there is no representative example to put beside one. */
  function newCaption(o) {
    var c = o.car, L = [];
    L.push('Brand new BMW ' + (c.description || '') + ', built and waiting, unregistered.');
    L.push([c.colour, c.upholstery, c.transmission].filter(Boolean).join(', '));
    L.push('');
    L.push(o.price + ', ' + o.priceKind + '.');
    if (o.weeks) L.push('Delivery ' + o.weeks + '.');
    L.push('');
    if (o.nq) {
      /* A payment in a caption carries the whole representative example, the
         same rule the card and the page keep. */
      L.push('');
      L.push(FN.money(o.nq.monthly) + ' a month on ' + o.nq.product + ' with '
        + FN.money(o.nq.deposit) + ' down, ' + o.nq.term_months + ' months, '
        + Number(o.nq.annual_mileage).toLocaleString('en-GB') + ' miles a year.');
      L.push('');
      L.push('Representative example: ' + FN.newRep(o.nq));
      L.push(FN.BROKER);
    } else {
      L.push('Finance available through BMW Financial Services. Message me and I will put a personalised quote together on your own deposit and mileage.');
    }
    L.push('');
    L.push('#BMW #BrandNew #HedinRuxley'
      + (c.series ? ' #' + String(c.series).replace(/[^A-Za-z0-9]/g, '') : ''));
    return L.join('\n');
  }

  /* Today's card for a brand new car, if the morning built one. Matched on
     the order number and the day, so a card left over from yesterday is never
     offered as today's. */
  function newCardFor(o) {
    var posts = (DATA.ncards && DATA.ncards.posts) || [];
    for (var i = 0; i < posts.length; i++) {
      if (String(posts[i].order) === String(o.ref) && posts[i].date === DAY) return posts[i];
    }
    return null;
  }

  function postsBlock(pick, news) {
    if (!wantPosts()) return;
    var posts = (pick && pick.posts) || [];
    var sec = $('toPost'), out = $('toPostOut');
    if (!sec || !out) return;
    sec.hidden = false;
    var files = canShareFiles();

    var html = '';
    if (!posts.length) {
      html += '<p class="to-post-warn">No cards have been built yet. They land each morning with the stock refresh.</p>';
    } else if (!pick.today) {
      html += '<p class="to-post-warn">Today’s cards are not built yet. These are ' + esc(longDate(pick.day))
        + '’s, so check the car is still here before you post it.</p>';
    }

    html += posts.map(function (p, i) {
      var ex = expiry(p);
      var flag = ex && ex.gone
        ? '<span class="to-post-flag bad">Quote expired ' + esc(shortDate(ex.on)) + ', do not post</span>'
        : ex && ex.soon
          ? '<span class="to-post-flag warn">Rate ends ' + esc(shortDate(ex.on)) + '</span>' : '';
      return '<article class="to-post-item' + (ex && ex.gone ? ' lapsed' : '') + '" data-post="' + i + '">'
        + '<a class="to-post-shot" href="finance-posts/' + esc(p.image) + '" target="_blank" rel="noopener">'
        + '<img src="finance-posts/' + esc(p.image) + '" alt="' + esc(p.model) + ' story card" loading="lazy"/></a>'
        + '<div class="to-post-main">'
        + '<h3>' + esc(p.model) + '</h3>'
        + '<p class="to-post-figs">' + esc(p.reg) + ' · ' + esc(p.price) + ' · '
        + FN.money2(p.monthly) + ' a month · ' + esc(p.apr) + '% APR · ' + esc(p.term) + ' months'
        + '</p>' + flag
        + '<pre class="to-post-cap" id="toCap' + i + '">' + esc(p.caption) + '</pre>'
        + '<div class="to-post-act">'
        + (files ? '<button class="to-btn" type="button" data-share="' + i + '">Share the card</button>' : '')
        + '<a class="to-btn ghost" href="finance-posts/' + esc(p.image) + '" download="' + esc(p.image) + '" data-save="' + i + '">Save image</a>'
        + '<button class="to-btn ghost" type="button" data-cap="' + i + '">Copy caption</button>'
        + '</div></div></article>';
    }).join('');

    /* The brand new pair. The morning job (automation/new-car-post.py) builds
       a card for each of them from the same pick this page uses, so the card
       is shown where there is one, exactly as the used cards are. Where there
       is not, the caption and BMW's own photograph are still here, which is
       what posting one by hand needs. */
    if (news && news.length) {
      html += '<p class="to-post-sub">The two brand new ones.</p>'
        + news.map(function (o, j) {
          var card = newCardFor(o);
          var shot = card
            ? '<a class="to-post-shot" href="finance-posts/' + esc(card.image) + '" target="_blank" rel="noopener">'
              + '<img src="finance-posts/' + esc(card.image) + '" alt="' + esc(o.title) + ' story card" loading="lazy"/></a>'
            : (o.photo ? '<a class="to-post-shot wide" href="' + esc(o.photo) + '" target="_blank" rel="noopener">'
              + '<img src="' + esc(o.photo) + '" alt="' + esc(o.title) + '" loading="lazy"/></a>' : '');
          var figs = 'Order ' + o.ref + ' · ' + o.price
            + (o.nq ? ' · ' + FN.money2(o.nq.monthly) + ' a month · ' + o.nq.apr + '% APR' : ' · ' + o.priceKind);
          return '<article class="to-post-item" data-new="' + j + '">' + shot
            + '<div class="to-post-main">'
            + '<h3>' + esc(o.title) + '</h3>'
            + '<p class="to-post-figs">' + esc(figs) + '</p>'
            + (card ? '' : '<p class="to-post-warn">No card was built for this one today, so here is the caption and BMW\u2019s own picture.</p>')
            + '<pre class="to-post-cap" id="toNewCap' + j + '">' + esc(card ? card.caption : newCaption(o)) + '</pre>'
            + '<div class="to-post-act">'
            + (card && files ? '<button class="to-btn" type="button" data-newshare="' + j + '">Share the card</button>' : '')
            + (card ? '<a class="to-btn ghost" href="finance-posts/' + esc(card.image) + '" download="' + esc(card.image) + '">Save image</a>' : '')
            + '<button class="to-btn ghost" type="button" data-newcap="' + j + '">Copy caption</button>'
            + (!card && o.photo ? '<a class="to-btn ghost" href="' + esc(o.photo) + '" target="_blank" rel="noopener">Open the photograph</a>' : '')
            + '</div></div></article>';
        }).join('');
    }

    out.innerHTML = html;

    function copied(btn) {
      var was = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = was; }, 1600);
    }
    function copyFrom(id, btn) {
      var t = (document.getElementById(id) || {}).textContent || '';
      var ta;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(function () { copied(btn); }, function () { copied(btn); });
        return;
      }
      ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); copied(btn); } catch (e) {}
      document.body.removeChild(ta);
    }

    out.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-share],[data-newshare],[data-cap],[data-newcap],[data-save]') : null;
      if (!b) return;
      var i;
      if (b.hasAttribute('data-cap')) {
        i = +b.getAttribute('data-cap');
        copyFrom('toCap' + i, b);
        track('offer_post_caption', { offer_date: pick.day || '', reg: posts[i] ? posts[i].reg : '' });
      } else if (b.hasAttribute('data-newcap')) {
        i = +b.getAttribute('data-newcap');
        copyFrom('toNewCap' + i, b);
        track('offer_post_caption', { offer_date: DAY, reg: news[i] ? String(news[i].ref) : '', kind: 'new' });
      } else if (b.hasAttribute('data-save')) {
        track('offer_post_save', { offer_date: pick.day || '', reg: posts[+b.getAttribute('data-save')].reg });
      } else if (b.hasAttribute('data-share')) {
        e.preventDefault();
        i = +b.getAttribute('data-share');
        shareCard(posts[i], b, pick.day || '');
      } else if (b.hasAttribute('data-newshare')) {
        e.preventDefault();
        i = +b.getAttribute('data-newshare');
        var card = newCardFor(news[i]);
        if (card) shareCard({ image: card.image, caption: card.caption, reg: String(card.order) }, b, DAY);
      }
    });
    $('toPostHide').addEventListener('click', function () {
      try { localStorage.removeItem(POSTKEY); } catch (e) {}
      sec.hidden = true;
    });
    track('offer_post_panel', { offer_date: pick.day || '', cards: posts.length });
  }

  /* One tap from the page to the share sheet, so the card goes straight into
     Instagram. The caption rides along as text where the target takes it, and
     is on the clipboard either way because Instagram does not. */
  function shareCard(post, btn, day) {
    var was = btn.textContent;
    btn.textContent = 'Getting it ready';
    btn.disabled = true;
    function done(msg) { btn.textContent = msg || was; btn.disabled = false;
      if (msg) setTimeout(function () { btn.textContent = was; }, 2200); }
    fetch('finance-posts/' + post.image, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(function (blob) {
        var f = new File([blob], post.image, { type: 'image/jpeg' });
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(post.caption)['catch'](function () {});
        }
        return navigator.share({ files: [f], text: post.caption });
      })
      .then(function () {
        track('offer_post_share', { offer_date: day, reg: post.reg });
        done('Shared');
      })['catch'](function (err) {
        if (err && err.name === 'AbortError') { done(); return; }
        done('Use Save image');
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
    postsBlock(pick, news);
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
    /* Passing the page on is how a daily share travels, so it gets its own
       button: wa.me with no number lets them pick the friend. */
    var sh = $('toShare');
    if (sh) sh.addEventListener('click', function () { track('offer_share', { offer_date: DAY, method: 'whatsapp' }); });
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
    ref: claimRef, waText: waText, newPair: newPair, msToMidnight: msToMidnight,
    wantPosts: wantPosts, newCaption: newCaption, expiry: expiry };
})();
