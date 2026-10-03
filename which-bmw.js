/* "Which BMW suits me" - a ten question quiz that answers with a model.
 *
 * Deliberately NOT the Find my BMW funnel. That one asks what car you want and
 * shows you the ones in stock that match. This one asks about your life and
 * tells you which MODEL fits, for somebody who does not yet know whether they
 * want an X3 or a 3 Series. One sends a brief, this one sends an answer.
 *
 * Every figure it reasons with is real:
 *   automation/bmw-models.json          size, boot, seats, power per tonne,
 *                                       electric range, price range per model
 *   hedin-stock-snapshot.json + group   the cars themselves, for the photo and
 *                                       the live price
 *   stock-finance.json + the ladder     the lender's own monthly payment at the
 *                                       deposit they typed, through dsFin
 *
 * Nothing here invents a payment, a boot size or a 0-62 time. Where we hold no
 * figure the page says so rather than guessing: an XM has no boot size in it
 * because Hedin publish an impossible one, and that is better said out loud.
 *
 * The recommendation explains itself. Every card lists the answers it satisfies
 * and, just as important, what it does not, because a customer who turns up to
 * find the boot too small blames the page that sent them.
 */
(function () {
  'use strict';

  var FORM = 'https://formspree.io/f/xqewleog';
  var WA = '447827138197';
  var KEY = 'wbQuiz';
  var MAX_AGE = 7 * 24 * 3600 * 1000;

  var DRIVING_DAYS = 320;

  /* How much of an electric car's range a daily drive may take before home
     charging stops being comfortable. 60% leaves room for winter, a detour and
     a cold battery, all three of which are real and none of which appear in a
     WLTP figure. */
  var EV_HEADROOM = 0.6;

  /* ICONS: one line drawing an option. Images in the answers are the single
     biggest lever on completion in the benchmarks (about a third better), and
     they let a question be understood without reading it, which is what makes
     the thing fast. Deliberately line art on currentColor rather than
     photographs: they inherit the accent hue as it winds, weigh nothing, and
     never look like stock imagery. */
  var ICON = {
    one:   'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0',
    two:   'M9 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm-6 8a6 6 0 0112 0M17 7.5a3 3 0 110 6M21 20a5 5 0 00-3-4.6',
    seat:  'M7 11a3 3 0 100-6 3 3 0 000 6zm-4 9a4 4 0 018 0M15 10h5v6a2 2 0 01-2 2h-1a2 2 0 01-2-2v-6zm0 0a2.5 2.5 0 015 0',
    three: 'M12 11a3 3 0 100-6 3 3 0 000 6zm-5 8a5 5 0 0110 0M5 9.5a2.5 2.5 0 110-5M19 9.5a2.5 2.5 0 100-5M2 18a4 4 0 013-3.8M22 18a4 4 0 00-3-3.8',
    five:  'M6 10a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm6 0a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm6 0a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM2 19a4 4 0 018 0m-2 0a4 4 0 018 0m-2 0a4 4 0 018 0',
    seven: 'M7 10a2 2 0 100-4 2 2 0 000 4zm5 0a2 2 0 100-4 2 2 0 000 4zm5 0a2 2 0 100-4 2 2 0 000 4zM7 19a2 2 0 100-4 2 2 0 000 4zm5 0a2 2 0 100-4 2 2 0 000 4zm5 0a2 2 0 100-4 2 2 0 000 4zM12 22h.01',
    bag:   'M6 8h12l-1 12H7L6 8zm3 0V6a3 3 0 016 0v2',
    pram:  'M4 16h12a6 6 0 00-12 0zM16 16V5a2 2 0 012-2M6 16v4M16 16v4M6.5 21.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm9 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
    dog:   'M10 5l-3 3v5a5 5 0 0010 0V8l-3-3M9 11h.01M15 11h.01M12 14v2M5 13l-2 6M19 13l2 6',
    bike:  'M6 18a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm12 0a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM6 14.5l4-7h5l3 7M9 7.5h4',
    boxes: 'M3 9h8v8H3zM13 5h8v6h-8zM13 13h8v6h-8zM3 9l2-3h4l2 3',
    plug:  'M9 3v5M15 3v5M7 8h10v3a5 5 0 01-10 0V8zM12 16v5',
    plugmix: 'M9 3v4M14 3v4M7.5 7h8v2.5a4 4 0 01-8 0V7zM11.5 14v3M17 13l3 3-3 3M20 16h-9',
    road:  'M4 21L9 3M20 21L15 3M12 6v3M12 12v3M12 18v2',
    pump:  'M4 20V5a2 2 0 012-2h6a2 2 0 012 2v15M3 20h12M6 8h6M16 9l3 2v6a2 2 0 003.9.6M16 13h3',
    bend:  'M5 21c0-7 6-6 6-11S7 5 7 3M12 21c0-9 7-7 7-13',
    cruise:'M3 17h18M6 13l2-4h8l2 4M8 17v2M16 17v2M5 9h2M17 9h2',
    city:  'M4 21V9l5-4v16M9 21V11l6-3v13M15 21V12l5 2v7M7 13h.01M7 17h.01M12 14h.01M12 18h.01',
    sofa:  'M4 11V8a2 2 0 012-2h12a2 2 0 012 2v3M3 11h18v6H3zM6 17v2M18 17v2',
    hide:  'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM4 4l16 16',
    nod:   'M12 18a6 6 0 100-12 6 6 0 000 12zM9.5 12l1.8 1.8L15 10',
    star:  'M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.4l6-.8L12 3z',
    tight: 'M8 20V4M16 20V4M11 12h2M11 9l-1.5 3L11 15M13 9l1.5 3L13 15',
    open:  'M3 12h18M18 8l4 4-4 4M6 8l-4 4 4 4',
    pound: 'M8 20h9M9 20V9a4 4 0 017-2.6M7 13h7',
    notes: 'M2 7h20v10H2zM12 15a3 3 0 100-6 3 3 0 000 6zM5 10v.01M19 14v.01'
  };

  /* Needle at a given sweep, for the "how quick" question. Five of the same
     dial reading further round says the thing without a word of copy. */
  function dialIcon(frac) {
    var a = (-120 + frac * 240) * Math.PI / 180;
    return { arc: 'M4.5 17a9 9 0 0115 0',
             nd: 'M12 17L' + (12 + 7 * Math.sin(a)).toFixed(1)
                 + ' ' + (17 - 7 * Math.cos(a)).toFixed(1) };
  }

  /* THIRTEEN QUESTIONS WAS TOO MANY, and the cut was measured rather than
     argued. Over 300 random briefs, changing one answer at a time:

        who 99%   pace 70%   charge 58%   park 53%   load 53%
        weekend 52%   attention 47%   mood 34%   love 20%
        longrun 16%   age 9%   DAILY MILEAGE 1%

     The benchmarks say 5 to 8 questions, completion falling about 15% for
     every question past 8, so everything under half was cut or merged.

     The daily mileage question is gone, and it is worth being plain about why:
     it had a needle gauge and was the only question on here that asked anybody
     to type, and it changed the recommended car in 1 run out of 100. What it
     actually drove was fuel, and fuel is now one tap in `life` below, which
     covers charging, mileage and long runs together. Dan asked for the
     miles/minutes toggle originally; the honest answer is that it cost the most
     and did the least, and the mileage estimate still reaches his inbox. */
  var Q = [
    { id: 'who', h: 'Who is coming?', type: 'one', opts: [
        { v: 'solo',       t: 'Just me',             i: 'one' },
        { v: 'childseats', t: 'Kids and car seats',  i: 'seat' },
        { v: 'occasional', t: 'Mates in the back',   i: 'three' },
        { v: 'five',       t: 'Five adults, properly', i: 'five' },
        { v: 'seven',      t: 'Seven of us',         i: 'seven' }
      ] },
    { id: 'load', h: 'What goes in the boot?', hint: 'Tick any.',
      type: 'many', opts: [
        { v: 'light', t: 'Not much',    i: 'bag' },
        { v: 'buggy', t: 'A buggy',     i: 'pram' },
        { v: 'dog',   t: 'A dog',       i: 'dog' },
        { v: 'kit',   t: 'Bikes, kit',  i: 'bike' },
        { v: 'big',   t: 'Big awkward stuff', i: 'boxes' }
      ] },
    { id: 'life', h: 'How will you live with it?', type: 'one', opts: [
        { v: 'short',    t: 'Short runs, and I can plug in at home', i: 'plug' },
        { v: 'mixed',    t: 'A bit of everything, and I can plug in', i: 'plugmix' },
        { v: 'miles',    t: 'Motorway miles most weeks', i: 'road' },
        { v: 'nocharge', t: 'Nowhere to charge at home', i: 'pump' }
      ] },
    { id: 'pace', h: 'How quick?', type: 'one', opts: [
        { v: 'calm',   t: 'Easy does it',      d: 0 },
        { v: 'poke',   t: 'A bit of poke',     d: 0.3 },
        { v: 'quick',  t: 'Properly quick',    d: 0.6 },
        { v: 'pocket', t: 'Small but savage',  d: 0.8 },
        { v: 'fast',   t: 'As fast as it comes', d: 1 }
      ] },
    { id: 'park', h: 'Where does it live?', type: 'one', opts: [
        { v: 'yes', t: 'Somewhere tight', i: 'tight' },
        { v: 'no',  t: 'Plenty of room',  i: 'open' }
      ] },
    { id: 'weekend', h: 'Best drive you can imagine?', type: 'one', opts: [
        { v: 'country',  t: 'An empty back road',   i: 'bend' },
        { v: 'motorway', t: 'Three hours somewhere good', i: 'cruise' },
        { v: 'city',     t: 'Quick blast, then parked', i: 'city' },
        { v: 'nodrive',  t: 'Not driving at all',   i: 'sofa' }
      ] },
    { id: 'attention', h: 'Pulling up outside, you want…', type: 'one', opts: [
        { v: 'none',  t: 'Nobody to look',        i: 'hide' },
        { v: 'quiet', t: 'The right people to notice', i: 'nod' },
        { v: 'heads', t: 'Heads to turn',         i: 'star' }
      ] },
    { id: 'pay', h: 'Budget?', hint: 'Roughly is fine.',
      type: 'pay' }
  ];

  var A = { who: null, load: [], life: null, pace: null, park: null,
            weekend: null, attention: null, pay: null,
            monthly: null, deposit: null, cash: null };

  var MODELS = null, CARS = [], FIN = {}, LAD = {}, STEP = 0, SENT = false;
  var RESULT = [];
  var STARTED = false;          /* past the title card */
  var SEEN_BREAK = {};          /* interstitials already shown this session */

  /* ---------- the figures ---------- */

  function money(n) {
    return '£' + Math.round(n).toLocaleString('en-GB');
  }

  function num(v) {
    var s = String(v == null ? '' : v).replace(/[^0-9.]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  /* A rough daily mileage from the one question that replaced the three.
     This is an ESTIMATE and is labelled as one wherever it appears: it goes in
     Dan's email as lead context and is never shown to the customer as though
     they had told us. The old question asked for the real figure and changed
     the recommended car once in a hundred runs, which is why it is gone. */
  var LIFE_MILES = { short: 12, mixed: 30, miles: 70, nocharge: 25 };

  function dailyMiles() {
    return A.life ? LIFE_MILES[A.life] : null;
  }

  function annualMiles() {
    var d = dailyMiles();
    return d == null ? null : Math.round(d * DRIVING_DAYS / 100) * 100;
  }

  /* Can they plug in at home? Three of the four answers say so directly. */
  function canCharge() {
    return A.life ? (A.life !== 'nocharge') : null;
  }

  /* The family key a car joins the model table on. Must stay identical to
     family() in automation/model-table.py, or a model shows with no cars under
     it and therefore no photo and no price. */
  function family(c) {
    var s = (c.series || '').trim(), m = c.model || '';
    if (!s) return /i3/.test(m) ? 'i3' : '';
    if (s === '2 Series') {
      if (m.indexOf('Gran Coup') !== -1) return '2 Series GC';
      if (m.indexOf('Tourer') !== -1) return '2 Series AT';
    }
    return s;
  }

  function carsFor(key) {
    var out = [], i;
    for (i = 0; i < CARS.length; i++) if (CARS[i]._fam === key) out.push(CARS[i]);
    return out;
  }

  /* The car whose photograph represents the model: Dan's own forecourt first,
     then the newest, and it must actually have an image. */
  function heroCar(key) {
    var list = carsFor(key).filter(function (c) { return c.image; });
    list.sort(function (a, b) {
      if (!!b._home !== !!a._home) return b._home ? 1 : -1;
      return (num(b.year) || 0) - (num(a.year) || 0);
    });
    return list[0] || null;
  }

  /* The lender's own monthly payment for this model at their deposit: the
     cheapest live quote across the model's cars. Never calculated here beyond
     what dsFin is allowed to do, which is read off the line the lender's own
     quotes make. A model with no live quote returns null and the card says to
     ask, rather than showing a figure nobody stands behind. */
  function monthlyFor(key) {
    if (!window.dsFin) return null;
    var dep = A.deposit == null ? null : A.deposit;
    var best = null, list = carsFor(key), i, f;
    for (i = 0; i < list.length; i++) {
      f = window.dsFin.at(FIN[list[i].id], LAD[list[i].id], dep);
      if (f && f.monthly && (!best || f.monthly < best.monthly)) {
        best = { monthly: f.monthly, car: list[i], fin: f };
      }
    }
    return best;
  }

  function priceFrom(key) {
    var list = carsFor(key), lo = null, i, p;
    for (i = 0; i < list.length; i++) {
      p = num(list[i].price);
      if (p && (lo == null || p < lo)) lo = p;
    }
    return lo;
  }

  /* ---------- scoring ---------- */

  var PACE_RANK = { relaxed: 1, brisk: 2, quick: 3, fast: 4, 'very fast': 5 };
  var WANT_PACE = { calm: 1, poke: 2, quick: 4, pocket: 4, fast: 5 };

  function bootNeeded() {
    var n = 0;
    if (A.load.indexOf('shop') !== -1) n = Math.max(n, 400);
    if (A.load.indexOf('buggy') !== -1) n = Math.max(n, 430);
    if (A.load.indexOf('dog') !== -1) n = Math.max(n, 450);
    if (A.load.indexOf('kit') !== -1) n = Math.max(n, 470);
    if (A.load.indexOf('big') !== -1) n = Math.max(n, 520);
    return n;
  }

  /* Whether a fuel suits how they will live with it, with the reason in words.
     This is the heart of the quiz: the same car is a good idea or a bad one
     depending entirely on this one answer, which is why three questions were
     folded into it rather than cut. Keep the sentences SHORT: they are read on
     a phone by somebody who has just been given an answer. */
  function fuelVerdict(m) {
    var L = A.life, out = { good: [], bad: [] };
    var ev = m.fuels.indexOf('Electric') !== -1;
    var ph = m.fuels.indexOf('Plug-in hybrid') !== -1;
    var di = m.fuels.indexOf('Diesel') !== -1;
    var pe = m.fuels.indexOf('Petrol') !== -1;
    var range = m.ev_miles_max || null;
    if (!L) return out;

    if (ev) {
      if (L === 'nocharge') out.bad.push('electric with nowhere to plug in');
      else if (L === 'miles') {
        if (range && range >= 280) out.good.push(range + ' miles a charge, so the long runs are one stop');
        else out.bad.push('motorway miles most weeks means public charging stops');
      } else {
        out.good.push(range ? 'charges overnight at home, ' + range + ' miles a charge'
                            : 'charges overnight at home');
      }
    }
    if (ph) {
      if (L === 'nocharge') out.bad.push('a plug-in you cannot charge is a heavy petrol car');
      else if (L === 'short' && range) {
        out.good.push('your short runs go electric, the engine is there for the rest');
      } else if (range) {
        out.good.push(range + ' electric miles, then petrol when you need it');
      }
    }
    if (di && L === 'miles') out.good.push('diesel earns its keep on motorway miles');
    if (di && L === 'short') out.bad.push('diesel does not like short cold runs');
    if (pe && L === 'nocharge') out.good.push('petrol, nothing to plug in');
    return out;
  }

  /* What the two personality answers say about a car, scored against figures we
     hold rather than a vibe: how tall it is, power per tonne, how long it is.
     `weight` is 1 for the budget answer and 2 for the heart answer, where
     personality is meant to lead.

     Nothing in here ever rules a car out. These questions separate two cars
     that both fit; they must not take away a car that works.

     Presence follows SIZE, not body style. An iX1's body reads "SUV", so
     rewarding any SUV gave a small crossover the same presence as an X7 and
     "heads turn" barely moved the answer at all. */
  function personality(m, weight) {
    var s = 0, why = [];
    var low = m.height_mm && m.height_mm < 1500;
    var tall = m.height_mm && m.height_mm >= 1620;
    var punchy = (m.hp_per_tonne_max || 0) >= 170;
    var big = m.size_class === 'large' || m.size_class === 'limousine';
    var small = m.size_class === 'small' || m.size_class === 'compact';

    if (A.weekend === 'country') {
      if (low) { s += 9; why.push('low and planted, made for a road like that'); }
      if (punchy) s += 7;
      if (tall) s -= 5;
    } else if (A.weekend === 'motorway') {
      if (big) { s += 9; why.push('long legs for the three hour runs'); }
      if (m.fuels.indexOf('Diesel') !== -1 || m.ev_miles_max >= 250) s += 5;
      if (small) s -= 4;
    } else if (A.weekend === 'city') {
      if (small) { s += 9; why.push('small enough to make town easy'); }
      if (m.electric) { s += 7; why.push('electric suits stop start driving'); }
      if (m.length_mm > 4800) s -= 6;
    } else if (A.weekend === 'nodrive') {
      if (m.electric) { s += 7; why.push('quiet, smooth, nothing to think about'); }
      if (big) s += 3;
      if (punchy) s -= 2;
    }

    if (A.attention === 'none') {
      if (small || /Saloon|Touring|Hatchback/i.test(m.body)) {
        s += 9; why.push('understated, like you asked');
      }
      if (m.size_class === 'limousine') s -= 12;
      else if (m.size_class === 'large') s -= 5;
    } else if (A.attention === 'quiet') {
      if (!small && m.size_class !== 'limousine') s += 5;
      if (punchy) { s += 5; why.push('quick without shouting about it'); }
    } else if (A.attention === 'heads') {
      if (m.size_class === 'limousine') { s += 14; why.push('this is the one people look at'); }
      else if (m.size_class === 'large') { s += 10; why.push('real presence on a driveway'); }
      else if (small) s -= 10;
      if (tall) s += 3;
    }
    return { score: s * (weight || 1), why: why };
  }

  /* opts.ignoreBudget drops the money filters, which is how the heart answer is
     worked out: the car they would have if the figure were not in the way.
     Everything practical still applies, because a car that cannot carry the
     children is not a dream, it is a mistake. */
  function assess(key, m, opts) {
    opts = opts || {};
    var r = { key: key, m: m, score: 0, reasons: [], caveats: [], out: null };
    var boot = bootNeeded();
    var pace = PACE_RANK[m.pace_best] || 0;
    var want = WANT_PACE[A.pace] || 0;

    /* ----- the things that rule a model out ----- */
    if (A.who === 'seven' && !m.seven_seats) {
      r.out = 'no third row'; return r;
    }
    if (A.who === 'five' && !m.five_adults) {
      r.out = 'not wide enough across the back for five adults in comfort'; return r;
    }
    if (A.who === 'childseats' && !m.two_seats_two_adults) {
      r.out = 'tight for two child seats and a buggy'; return r;
    }
    if (boot && m.boot_l_max && m.boot_l_max < boot) {
      r.out = 'boot is ' + m.boot_l_max + ' litres and you need nearer ' + boot;
      return r;
    }
    if (A.park === 'yes' && m.length_mm && m.length_mm > 4800) {
      r.out = 'too big for a tight space at ' + (m.length_mm / 1000).toFixed(2) + 'm long';
      return r;
    }
    if (A.life === 'nocharge' && m.electric && m.fuels.length === 1) {
      r.out = 'electric only, and nowhere to charge'; return r;
    }
    if (A.pace === 'pocket' && m.size_class !== 'small' && m.size_class !== 'compact') {
      r.out = 'not a small car'; return r;
    }
    var lo = priceFrom(key) || m.price_from;
    if (!opts.ignoreBudget && A.cash && lo && lo > A.cash * 1.05) {
      r.out = 'starts at ' + money(lo) + ', over your budget'; return r;
    }
    var mo = A.monthly || opts.ignoreBudget ? monthlyFor(key) : null;
    if (!opts.ignoreBudget && A.monthly) {
      if (mo && mo.monthly > A.monthly * 1.05) {
        r.out = 'the cheapest one comes to ' + money(mo.monthly) + ' a month at '
          + money(A.deposit || 0) + ' down'; return r;
      }
      if (!mo && lo && A.monthly < 250 && lo > 30000) {
        r.out = 'nothing here lands near ' + money(A.monthly) + ' a month'; return r;
      }
    }
    r.monthly = mo;
    r.priceFrom = lo;

    /* ----- what makes it a good answer ----- */
    if (A.who === 'seven') { r.score += 30; r.reasons.push('seven seats'); }
    if (A.who === 'five' && m.five_adults) {
      r.score += 25;
      r.reasons.push('properly wide across the back, ' + m.width_mm + 'mm');
    }
    var bootSaid = false;
    if (A.who === 'childseats' && m.two_seats_two_adults) {
      r.score += 20;
      r.reasons.push('two child seats, front seats still back'
        + (m.boot_l_max ? ', ' + m.boot_l_max + ' litre boot' : ''));
      bootSaid = !!m.boot_l_max;
    }
    if (A.who === 'solo' && (m.size_class === 'small' || m.size_class === 'compact')) {
      r.score += 10; r.reasons.push('no more car than you need');
    }
    /* The boot is only worth a line of its own if the child seat reason has not
       already given the figure. Saying "650 litre boot" twice on one card reads
       like a fault in the page. */
    if (boot && m.boot_l_max) {
      r.score += m.boot_l_max >= boot + 100 ? 12 : 6;
      if (!bootSaid) {
        r.reasons.push(m.boot_l_max + ' litre boot'
          + (m.boot_l_max >= boot + 100 ? ', more than you need' : ''));
      }
    }

    var fv = fuelVerdict(m);
    r.score += fv.good.length * 14;
    r.score -= fv.bad.length * 18;
    fv.good.forEach(function (t) { r.reasons.push(t); });
    fv.bad.forEach(function (t) { r.caveats.push(t); });

    if (pace && want) {
      var gap = Math.abs(pace - want);
      r.score += gap === 0 ? 16 : gap === 1 ? 9 : gap === 2 ? 2 : -8;
      if (gap <= 1) {
        r.reasons.push(m.pace_best + ', ' + m.hp_per_tonne_max + 'hp a tonne');
      } else if (want > pace) {
        r.caveats.push('even the quickest is only ' + m.pace_best);
      }
    }
    if (A.pace === 'pocket' && pace >= 3) {
      r.score += 14; r.reasons.push('small car, serious pace');
    }

    /* "What matters most" and "new or used" are no longer asked: they moved
       the answer 34% and 9% of the time and said what the other questions
       already said. A car that is cheap to run still earns a line when it
       plainly is one. */
    if (m.electric) { r.score += 6; r.reasons.push('no fuel, barely any tax'); }
    else if (m.co2_gkm_min && m.co2_gkm_min < 50) {
      r.score += 5; r.reasons.push('from ' + m.co2_gkm_min + 'g/km');
    }

    if (A.park === 'yes' && m.length_mm && m.length_mm <= 4600) {
      r.score += 10; r.reasons.push('easy to park, ' + (m.length_mm / 1000).toFixed(2) + 'm');
    }

    var p = personality(m, opts.heart ? 2 : 1);
    r.score += p.score;
    p.why.forEach(function (t) { if (r.reasons.indexOf(t) === -1) r.reasons.push(t); });

    /* Dan's own forecourt first, gently: it decides a tie, never the answer.
       Left out of the heart answer entirely, which is about the car and not
       about what happens to be on the forecourt this morning. */
    if (!opts.heart) {
      r.score += Math.min(m.in_stock_dan, 4) * 2;
      r.score += Math.min(m.in_stock_dan + m.in_stock_group, 20) * 0.2;
    }
    return r;
  }

  function hasBudget() {
    return !!(A.cash || A.monthly);
  }

  /* Is this car actually beyond what they said they would spend? The same 5%
     latitude the budget filter uses, so a car is never both "within budget"
     there and "over budget" here. A car we hold no figure for is not claimed
     to be over: we do not know. */
  function overBudget(r) {
    if (A.monthly) return !!(r.monthly && r.monthly.monthly > A.monthly * 1.05);
    if (A.cash) return !!(r.priceFrom && r.priceFrom > A.cash * 1.05);
    return false;
  }

  function rank(opts) {
    var keys = Object.keys(MODELS || {}), all = [], i;
    for (i = 0; i < keys.length; i++) {
      /* The i3 hatchback is out of production and the name now means two other
         cars, so recommending "an i3" would read as an offer of the new one. */
      if (keys[i] === 'i3') continue;
      all.push(assess(keys[i], MODELS[keys[i]], opts));
    }
    var fit = all.filter(function (r) { return !r.out; });
    fit.sort(function (a, b) { return b.score - a.score; });
    return { fit: fit, all: all };
  }

  function recommend() {
    var head = rank({});
    RESULT = { fit: head.fit, all: head.all, heart: null, gap: null };

    /* The heart answer: the same brief with the money taken out, and
       personality counting double. Only worth showing when they gave a budget
       AND it lands somewhere different, otherwise it is the same card twice. */
    if (hasBudget()) {
      var h = rank({ ignoreBudget: true, heart: true });
      var top = head.fit[0], hw = h.fit[0];
      /* Only when the money is genuinely what stands between them. A heart car
         they can already afford is not a head and heart problem, it is just a
         second suggestion, and labelling it "what your budget says" against
         "what your heart says" would be untrue: on a 150,000 budget the quiz
         offered an X5 and an XM as if the XM were out of reach. */
      if (hw && (!top || hw.key !== top.key) && overBudget(hw)) {
        RESULT.heart = hw;
        RESULT.gap = gapTo(hw);
      }
    }
    return RESULT;
  }

  /* What the heart answer costs over the budget one, in the figures they gave
     us. Said plainly: somebody who can see it is £80 a month can decide for
     themselves, and somebody who cannot see it just feels sold to. */
  function gapTo(h) {
    var budget = RESULT.fit[0];
    if (A.monthly && h.monthly) {
      var over = h.monthly.monthly - A.monthly;
      return over > 0
        ? { kind: 'monthly', over: over,
            text: money(h.monthly.monthly) + ' a month at the same ' + money(A.deposit || 0)
              + ' down, on the cheapest one in stock. That is ' + money(over)
              + ' a month more than you set.' }
        : { kind: 'monthly', over: 0,
            text: money(h.monthly.monthly) + ' a month, which is inside what you set' };
    }
    if (A.cash && h.priceFrom) {
      var d = h.priceFrom - A.cash;
      return d > 0
        ? { kind: 'cash', over: d,
            text: 'from ' + money(h.priceFrom) + ', about ' + money(d) + ' over your budget' }
        : { kind: 'cash', over: 0, text: 'from ' + money(h.priceFrom) + ', inside your budget' };
    }
    if (budget && h.priceFrom) {
      return { kind: 'cash', over: 0, text: 'from ' + money(h.priceFrom) };
    }
    return null;
  }

  /* A sentence read back to them from the three personality answers. It is the
     one part of the page that is about them rather than about a car, and it is
     what makes the answer feel worked out rather than generated. */
  function readBack() {
    var bits = [];
    if (A.weekend === 'country') bits.push('you would take the long way round');
    else if (A.weekend === 'motorway') bits.push('you cover proper distances');
    else if (A.weekend === 'city') bits.push('your driving is short and in town');
    else if (A.weekend === 'nodrive') bits.push('the car is a tool, not a hobby');
    if (A.attention === 'none') bits.push('and you would rather nobody looked');
    else if (A.attention === 'quiet') bits.push('and you want the right people to notice');
    else if (A.attention === 'heads') bits.push('and you want heads to turn');
    if (!bits.length) return '';
    var s = bits.join(', ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }

  /* ---------- the page ---------- */

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ga(name, params) {
    try { if (window.gtag) gtag('event', name, params || {}); } catch (e) {}
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), a: A, s: STEP,
                                                 b: SEEN_BREAK }));
    } catch (e) {}
  }

  function restore() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      var b = JSON.parse(raw);
      if (!b || !b.t || Date.now() - b.t > MAX_AGE) { localStorage.removeItem(KEY); return false; }
      var k;
      for (k in b.a) if (A.hasOwnProperty(k)) A[k] = b.a[k];
      /* Put them back on the question they left, clamped: "carry on" that
         starts again at question one is not carrying on. Somebody resuming has
         plainly started, so the title card is not shown again, and any
         interstitial they already walked past stays walked past. */
      if (typeof b.s === 'number') STEP = Math.max(0, Math.min(Q.length, b.s));
      STARTED = STEP > 0 || !!A.who;
      SEEN_BREAK = (b.b && typeof b.b === 'object') ? b.b : {};
      return true;
    } catch (e) { return false; }
  }

  /* May they move on? A multi-select question is skippable, so yes. */
  function answered(q) {
    if (q.type === 'many') return true;
    if (q.type === 'pay') return !!A.pay;
    return !!A[q.id];
  }

  /* Have they actually chosen something? Separate from answered() on purpose:
     a skippable question is always ready to move on, so asking answered() what
     to label the button meant the Skip wording could never appear. */
  function chosen(q) {
    if (q.type === 'many') return A[q.id].length > 0;
    return answered(q);
  }

  /* One line drawing per option, inheriting the accent hue through
     currentColor. An option carrying `d` instead of `i` draws the pace dial at
     that sweep, so five of the same gauge reading further round says the whole
     question without a word of copy. */
  function iconSvg(o) {
    var body;
    if (o && o.d !== undefined) {
      var k = dialIcon(o.d);
      body = '<path d="' + k.arc + '"/><path d="' + k.nd + '"/>';
    } else if (o && ICON[o.i]) {
      body = '<path d="' + ICON[o.i] + '"/>';
    } else {
      return '';
    }
    return '<svg class="wb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
      + ' aria-hidden="true">' + body + '</svg>';
  }

  function optBtn(qid, v, label, icon, on) {
    return '<button type="button" class="wb-opt' + (on ? ' on' : '') + '"'
      + ' data-q="' + qid + '" data-v="' + v + '" aria-pressed="' + !!on + '">'
      + iconSvg({ i: icon })
      + '<span class="wb-opt-t">' + esc(label) + '</span></button>';
  }

  function optMarkup(q) {
    var sel = q.type === 'many' ? A[q.id] : [A[q.id]];
    return q.opts.map(function (o) {
      var on = sel.indexOf(o.v) !== -1;
      return '<button type="button" class="wb-opt' + (on ? ' on' : '') + '"'
        + ' data-q="' + q.id + '" data-v="' + o.v + '" aria-pressed="' + on + '">'
        + iconSvg(o)
        + '<span class="wb-opt-t">' + esc(o.t) + '</span>'
        + (o.l ? '<span class="wb-opt-l">' + esc(o.l) + '</span>' : '')
        + '</button>';
    }).join('');
  }

  /* BUDGET WITHOUT A KEYBOARD. Every answer on this quiz is now a tap, which
     the benchmarks are blunt about: multiple choice over free text wherever
     possible, so people move instead of stopping to think and type.

     The deposit chips are deliberately the lender's OWN rungs from
     stock-finance-ladder.json. Typing £4,300 made dsFin read a payment off the
     line between two quotes, which is defensible but is still our arithmetic;
     tapping £5,000 gets the figure BMW Financial Services actually gave for
     that car. Faster to answer and a better number at the end of it. Keep this
     list and RUNGS in stock-finance.py in step. */
  var MONTHLY = [250, 350, 450, 600, 800];
  var DEPOSITS = [0, 1000, 2500, 5000, 10000];
  var CASH = [15000, 25000, 40000, 60000, 90000];

  function chipRow(name, values, current, fmt) {
    return '<div class="wb-quick" role="group">'
      + values.map(function (n, i) {
          var last = i === values.length - 1;
          return '<button type="button" class="wb-qk' + (current === n ? ' on' : '')
            + '" data-set="' + name + '" data-val="' + n + '">'
            + fmt(n, last) + '</button>';
        }).join('') + '</div>';
  }

  function payMarkup() {
    var r = A.pay;
    var money0 = function (n) { return '£' + n.toLocaleString('en-GB'); };
    var h = '<div class="wb-opts two">'
      + optBtn('pay', 'monthly', 'Monthly', 'pound', r === 'monthly')
      + optBtn('pay', 'cash', 'Cash', 'notes', r === 'cash')
      + optBtn('pay', 'unsure', 'Not sure yet', 'open', r === 'unsure')
      + '</div>';
    if (r === 'monthly') {
      h += '<p class="wb-sub">A month, at most</p>'
        + chipRow('monthly', MONTHLY, A.monthly, function (n, last) {
            return money0(n) + (last ? '+' : ''); })
        + '<p class="wb-sub">Deposit</p>'
        + chipRow('deposit', DEPOSITS, A.deposit, function (n) {
            return n === 0 ? 'None' : money0(n); })
        + '<p class="wb-conv">Payments come straight from BMW Financial Services at '
        + 'whichever deposit you tap.</p>';
    } else if (r === 'cash') {
      h += '<p class="wb-sub">To spend</p>'
        + chipRow('cash', CASH, A.cash, function (n, last) {
            return '£' + Math.round(n / 1000) + 'k' + (last ? '+' : ''); });
    }
    return h;
  }

  /* 212 is a cold blue and 392 wraps to 32, a warm amber; hsl() takes a hue
     past 360, so the whole sweep is one addition. Every accent on screen is
     derived from this one property in CSS. */
  function setHue(frac) {
    var h = 212 + Math.max(0, Math.min(1, frac)) * 180;
    document.body.style.setProperty('--accH', String(Math.round(h)));
  }

  /* The title card. A quiz that opens on question one reads as a form; one
     that opens on a cover reads as something you chose to do. Three lines and
     a button: the long version of this page tested as the wordiest thing on
     it, and nothing on a cover needs explaining twice. */
  function renderIntro() {
    $('wbProg').hidden = true;
    setHue(0);
    $('wbStage').innerHTML = '<div class="wb-intro">'
      + '<span class="wb-kicker">8 taps</span>'
      + '<h1 class="wb-giant">Which BMW<br/>is <em>actually</em><br/>yours?</h1>'
      + '<p class="wb-lede">No typing. No email until the end. Then I will tell you, '
      + 'and show you why.</p>'
      + '<button type="button" class="wb-go" id="wbGo">Start <span>→</span></button>'
      + '</div>';
    $('wbStage').classList.add('wb-in');
    $('wbGo').addEventListener('click', function () {
      STEP = 0; STARTED = true; save(); render(); ga('wb_start', {});
    });
  }

  /* One beat between the half about your life and the half about you. It marks
     the change of subject, which otherwise arrives as a strange question about
     car parks. Two short lines: it is a signpost, not a chapter. */
  var BREAKS = { weekend: {
    kicker: 'Halfway',
    h: 'Sensible half done.',
    p: 'Now the bit that actually decides it.' } };

  function renderBreak(q) {
    var b = BREAKS[q.id];
    $('wbStage').innerHTML = '<div class="wb-break">'
      + '<span class="wb-kicker">' + esc(b.kicker) + '</span>'
      + '<h2>' + esc(b.h) + '</h2><p>' + esc(b.p) + '</p>'
      + '<button type="button" class="wb-go" id="wbGo">Go on <span>→</span></button>'
      + '</div>';
    $('wbStage').classList.remove('wb-in');
    void $('wbStage').offsetWidth;
    $('wbStage').classList.add('wb-in');
    $('wbGo').addEventListener('click', function () {
      SEEN_BREAK[q.id] = true; save(); render();
    });
    ga('wb_interstitial', { before: q.id });
  }

  function render() {
    var total = Q.length;
    if (!STARTED && STEP === 0) return renderIntro();
    if (STEP >= total) return renderResult();
    var q = Q[STEP];
    if (BREAKS[q.id] && !SEEN_BREAK[q.id]) {
      $('wbProg').hidden = false;
      $('wbStepTxt').textContent = (STEP + 1) + ' / ' + total;
      $('wbFill').style.width = (100 * STEP / total) + '%';
      $('wbDial').style.setProperty('--p', String(Math.round(100 * STEP / total)));
      setHue(STEP / (total - 1));
      return renderBreak(q);
    }
    $('wbProg').hidden = false;
    $('wbStepTxt').textContent = (STEP + 1) + ' / ' + total;
    $('wbFill').style.width = (100 * STEP / total) + '%';
    $('wbDial').style.setProperty('--p', String(Math.round(100 * STEP / total)));
    setHue(STEP / (total - 1));

    var body = '<div class="wb-qhead"><span class="wb-num" aria-hidden="true">'
      + (STEP + 1) + '</span>'
      + '<h1 class="wb-h">' + esc(q.h) + '</h1>'
      + (q.hint ? '<p class="wb-hint">' + esc(q.hint) + '</p>' : '') + '</div>';
    if (q.type === 'pay') body += payMarkup();
    else body += '<div class="wb-opts' + (q.type === 'many' ? ' two' : '') + '">' + optMarkup(q) + '</div>';

    /* Only a question that can genuinely be skipped ever says Skip. The daily
       driving and budget questions hold the button disabled until they are
       answered, so labelling those Skip would promise something the button
       will not do, and the label would still read Skip after typing: it is set
       at render, and typing only re-enables the button. */
    /* A single-choice question advances on the tap, so a Next button beside it
       is a second thing to decide about and does nothing the tap did not. It is
       drawn only where it is the only way on: the tick-any question and the
       budget screen. Benchmarks are consistent that fewer controls per screen
       is what makes a quiz feel quick. */
    var needsNext = q.type !== 'one';
    var label = STEP === total - 1 ? 'See my answer'
      : (q.type === 'many' && !chosen(q) ? 'Skip' : 'Next');
    body += '<div class="wb-nav">'
      + (STEP ? '<button type="button" class="wb-back" id="wbBack">Back</button>' : '<span></span>')
      + (needsNext
          ? '<button type="button" class="wb-next" id="wbNext"'
            + (answered(q) ? '' : ' disabled') + '>' + label + '</button>'
          : '')
      + '</div>';
    $('wbStage').innerHTML = body;
    $('wbStage').classList.remove('wb-in');
    void $('wbStage').offsetWidth;
    $('wbStage').classList.add('wb-in');
    wire(q);
    ga('wb_step_' + (STEP + 1), { step: STEP + 1, step_name: q.id });
  }

  function wire(q) {
    var stage = $('wbStage');
    stage.querySelectorAll('.wb-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.dataset.v, id = b.dataset.q;
        if (id === 'pay') { A.pay = v; save(); render(); return; }
        if (q.type === 'many') {
          var i = A[id].indexOf(v);
          if (i === -1) {
            if (q.max && A[id].length >= q.max) A[id].shift();
            A[id].push(v);
          } else A[id].splice(i, 1);
          save();
          render();
          return;
        }
        A[id] = v;
        save();
        ga('wb_answer', { step_name: id, answer: v });
        next();
      });
    });
    /* The budget chips. One handler for all three rows, because they differ
       only in which answer they set. No keyboard anywhere in the quiz now. */
    stage.querySelectorAll('.wb-qk').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.dataset.set, v = Number(b.dataset.val);
        A[key] = A[key] === v ? null : v;
        save();
        stage.querySelectorAll('[data-set="' + key + '"]').forEach(function (x) {
          x.classList.toggle('on', Number(x.dataset.val) === A[key]);
        });
        ga('wb_answer', { step_name: key, answer: String(v) });
      });
    });
    if ($('wbBack')) $('wbBack').addEventListener('click', function () {
      STEP = Math.max(0, STEP - 1); save(); render(); ga('wb_back', {});
    });
    /* Not drawn on a single-choice question any more, so this must not assume
       it is there. */
    if ($('wbNext')) $('wbNext').addEventListener('click', next);
  }

  /* A short beat before the answer. It is honest about what it is doing rather
     than a fake spinner: these are the four things the page genuinely does, and
     the answer is already computed before the first line is drawn. Skipped
     entirely under reduced motion and when the answers were restored, where a
     delay would just be in the way. */
  var WORKING = ['Measuring boots…', 'Checking what fits five adults…',
                 'Asking the lender for payments…', 'Arguing with myself…'];

  function renderWorking(done) {
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return done();
    $('wbProg').hidden = true;
    $('wbStage').innerHTML = '<div class="wb-work"><div class="wb-work-ring"></div>'
      + '<p id="wbWorkTxt">' + esc(WORKING[0]) + '</p></div>';
    $('wbStage').classList.add('wb-in');
    var i = 0;
    var t = setInterval(function () {
      i += 1;
      var el = $('wbWorkTxt');
      if (!el) { clearInterval(t); return; }
      if (i >= WORKING.length) { clearInterval(t); done(); return; }
      el.textContent = WORKING[i];
    }, 420);
  }

  function next() {
    STEP += 1;
    save();
    if (STEP >= Q.length) {
      recommend();
      return renderWorking(render);
    }
    render();
  }

  /* ---------- the answer ---------- */

  function figures(r) {
    var m = r.m, bits = [];
    if (m.length_mm) bits.push((m.length_mm / 1000).toFixed(2) + 'm long');
    if (m.boot_l_max) bits.push(m.boot_l_max + ' litre boot');
    if (m.seats && m.seats.length) bits.push(m.seats.join(' or ') + ' seats');
    if (m.ev_miles_max) bits.push('up to ' + m.ev_miles_max + ' electric miles');
    if (m.fuels && m.fuels.length) bits.push(m.fuels.join(', ').toLowerCase());
    return bits;
  }

  function card(r, rank, label, gap) {
    var m = r.m, hero = heroCar(r.key), mo = r.monthly;
    var img = hero && hero.image
      ? '<img class="wb-shot" src="' + esc(hero.image) + '" alt="' + esc(m.name)
        + '" loading="' + (rank ? 'lazy' : 'eager') + '"/>'
      : '<div class="wb-shot wb-noshot">No photograph to hand</div>';
    var price = r.priceFrom ? 'from ' + money(r.priceFrom) : '';
    var fin = '';
    if (mo) {
      /* The gap line already gives the monthly figure and the deposit, so the
         standard line underneath it would say the same thing twice in a row.
         The representative example is NOT optional either way: it has to sit
         under every monthly payment this page shows. */
      var saidIt = gap && gap.kind === 'monthly';
      fin = (saidIt ? '' : '<p class="wb-mo"><strong>' + money(mo.monthly) + ' a month</strong> on PCP at '
        + money(A.deposit || 0) + ' down, on the cheapest one in stock'
        + ' <span class="wb-reg">' + esc(mo.car.reg || '') + '</span></p>')
        + '<details class="wb-rep"><summary>The representative example in full</summary>'
        + '<p>' + esc(window.dsFin.repExample(mo.fin)) + '</p>'
        + (mo.fin.legal ? '<p class="wb-legal">' + esc(mo.fin.legal) + '</p>' : '')
        + '</details>';
    } else if (A.pay === 'monthly') {
      fin = '<p class="wb-mo wb-ask">Message me for a payment on this one.</p>';
    }
    var wa = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(
      'Hi Dan, the quiz says a ' + m.name + ' suits me. Can we talk about it?');
    var badge = label || (rank ? '' : 'Your best fit');
    /* wb-pick, not wb-top: the header is .wb-top, and two different things
       sharing a class name is how a style on one quietly lands on the other. */
    return '<article class="wb-card' + (rank && !label ? '' : ' wb-pick')
      + (label === 'What your heart says' ? ' wb-heart' : '') + '">'
      + '<div class="wb-shotwrap">' + img
      + (badge ? '<span class="wb-badge">' + esc(badge) + '</span>' : '') + '</div>'
      + '<div class="wb-cardbody">'
      + '<h3>BMW ' + esc(m.name) + '</h3>'
      + '<p class="wb-figs">' + esc(figures(r).join(' · ')) + (price ? ' · ' + price : '') + '</p>'
      + (gap ? '<p class="wb-gap">' + esc(gap.text) + '</p>' : '')
      + fin
      + (r.reasons.length ? '<ul class="wb-why">' + r.reasons.slice(0, 5).map(function (t) {
          return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '')
      + (r.caveats.length ? '<p class="wb-cav"><strong>Worth knowing:</strong> '
          + esc(r.caveats.join('; ')) + '.</p>' : '')
      + '<p class="wb-stock">' + (m.in_stock_dan
          ? m.in_stock_dan + ' on my forecourt right now'
          : (m.in_stock_group ? 'None on my forecourt today, ' + m.in_stock_group
              + ' elsewhere in the group' : 'None in stock today, so this one is a factory order'))
      + '</p>'
      + '<a class="wb-wa" href="' + wa + '" target="_blank" rel="noopener"'
      + ' data-model="' + esc(m.name) + '">Talk to me about the ' + esc(m.name) + '</a>'
      + '</div></article>';
  }

  function renderResult() {
    /* Work the answer out if it has not been worked out yet. Without this, a
       session resumed on the last step reads RESULT as empty and tells somebody
       their answers rule out every car, which is both wrong and the most
       discouraging thing the page could say. */
    if (!RESULT || !RESULT.fit) recommend();
    var fit = RESULT.fit || [], top = fit.slice(0, 2);
    $('wbProg').hidden = true;
    $('wbFill').style.width = '100%';
    var h;
    if (!top.length) {
      h = '<h1 class="wb-h">Your answers rule out everything I have</h1>'
        + '<p class="wb-hint">That usually means one answer is doing all the work, a tight budget with a big '
        + 'boot, or seven seats on a small car. Rather than bend it, let me look properly.</p>'
        + '<p class="wb-hint">' + esc(ruledOutLine()) + '</p>'
        + '<a class="wb-wa" href="https://wa.me/' + WA + '?text='
        + encodeURIComponent('Hi Dan, the quiz could not find me a match. Can you help?')
        + '" target="_blank" rel="noopener">Tell me what you are after</a>';
      ga('wb_zero_match', {});
    } else if (RESULT.heart) {
      /* Two answers to the same brief: the one the budget allows, and the one
         they would have without it. Shown side by side, named plainly, with the
         difference in money on the second, so the choice is theirs to make. */
      var rb = readBack();
      h = '<h1 class="wb-h">Your head and your heart disagree</h1>'
        + (rb ? '<p class="wb-read">' + esc(rb) + '</p>' : '')
        + '<p class="wb-hint">Both of these fit your life. One fits the figure you gave me as well. '
        + 'I have put the difference in plain money so you can decide rather than guess.</p>'
        + '<div class="wb-cards">'
        + card(top[0], 0, 'What your budget says')
        + card(RESULT.heart, 1, 'What your heart says', RESULT.gap)
        + '</div>';
      h += alsoMarkup(fit) + formMarkup();
      ga('wb_head_heart', { budget: top[0].m.name, heart: RESULT.heart.m.name,
                            over: RESULT.gap ? RESULT.gap.over : 0 });
    } else {
      var rb2 = readBack();
      h = '<h1 class="wb-h">' + (top.length > 1 ? 'Two that suit you' : 'This is the one')
        + '</h1>' + (rb2 ? '<p class="wb-read">' + esc(rb2) + '</p>' : '')
        + '<p class="wb-hint">Worked out from what you told me and the real figures for every '
        + 'BMW I can get hold of. Every line under a car is a reason it fits you, not a sales line.</p>'
        + '<div class="wb-cards">' + top.map(function (r, i) { return card(r, i); }).join('') + '</div>';
      h += alsoMarkup(fit) + formMarkup();
      ga('wb_result', { top: top[0].m.name, second: top[1] ? top[1].m.name : '',
                        fits: fit.length });
    }
    $('wbStage').innerHTML = h;
    $('wbStage').classList.add('wb-in');
    /* The finance wording belongs where a payment is, and nowhere else. Through
       the questions the footer is one short line; it grows into the full
       disclosure the moment a monthly figure is on screen. A page of small
       print under question one is words nobody reads and everybody sees. */
    var lg = $('wbLegal');
    if (lg && /a month/.test(h)) {
      lg.className = '';
      lg.innerHTML = 'Payments are BMW Financial Services\u2019 own at the deposit you '
        + 'picked, with the full representative example on every card. Not a quotation. '
        + 'Finance subject to status, 18+, UK residents. Nothing shared with anybody but me. '
        + '<a href="privacy.html">Privacy</a>';
    }
    wireResult();
  }

  function ruledOutLine() {
    var all = RESULT.all || [], counts = {};
    all.forEach(function (r) { if (r.out) counts[r.out] = (counts[r.out] || 0) + 1; });
    var best = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    return best ? 'The commonest reason was: ' + best + '.' : '';
  }

  /* The runners up. Pulled out of the branch it used to live in: the head and
     heart screen is a second ending for the same quiz and needs everything the
     first one has, and the contact form going missing from it was exactly the
     sort of thing that happens when two endings each build their own page. */
  function alsoMarkup(fit) {
    if (fit.length <= 2) return '';
    return '<details class="wb-also"><summary>' + (fit.length - 2)
      + ' more that would work</summary><ul>'
      + fit.slice(2, 8).map(function (r) {
          return '<li><strong>' + esc(r.m.name) + '</strong> '
            + esc(r.reasons[0] || 'fits what you told me') + '</li>'; }).join('')
      + '</ul></details>';
  }

  function formMarkup() {
    return '<form class="wb-form" id="wbForm" novalidate>'
      + '<h2>Want me to take it from here?</h2>'
      + '<p class="wb-hint">Real cars, real payments. Your answers come with it.</p>'
      + '<label>Your name<input type="text" id="wbName" autocomplete="name" required/></label>'
      + '<label>Mobile<input type="tel" id="wbPhone" autocomplete="tel" required/></label>'
      + '<label>Email<input type="email" id="wbEmail" autocomplete="email" required/></label>'
      + '<label class="wb-ta">Anything else I should know?<textarea id="wbNotes" rows="3"></textarea></label>'
      + '<input type="text" id="wbGotcha" name="_gotcha" tabindex="-1" autocomplete="off"'
      + ' style="position:absolute;left:-9999px" aria-hidden="true"/>'
      + '<p class="wb-err" id="wbErr" hidden></p>'
      + '<button type="submit" class="wb-send" id="wbSend">Send this to Dan</button>'
      + '<p class="wb-small">Or just <a href="https://wa.me/' + WA + '?text='
      + encodeURIComponent('Hi Dan, I did the quiz on your site') + '" target="_blank" rel="noopener">message me</a>. '
      + 'Your details go to me and nobody else.</p>'
      + '</form>';
  }

  function summary() {
    var L = [], d = dailyMiles();
    var q = function (id) { return (Q.filter(function (x) { return x.id === id; })[0] || {}); };
    var label = function (id, v) {
      var o = (q(id).opts || []).filter(function (x) { return x.v === v; })[0];
      return o ? o.t : v;
    };
    L.push('On board: ' + label('who', A.who));
    if (A.load.length) L.push('Carries: ' + A.load.map(function (v) { return label('load', v); }).join(', '));
    if (A.life) L.push('Lives with it: ' + label('life', A.life)
      + ' (so roughly ' + annualMiles().toLocaleString('en-GB')
      + ' miles a year, my estimate, not theirs)');
    if (A.pace) L.push('Wants it to feel: ' + label('pace', A.pace));
    if (A.weekend) L.push('Best drive: ' + label('weekend', A.weekend));
    if (A.attention) L.push('Pulling up outside: ' + label('attention', A.attention));

    if (A.park) L.push('Tight parking: ' + label('park', A.park));
    if (A.pay === 'monthly') L.push('Budget: up to ' + money(A.monthly || 0) + ' a month at '
      + money(A.deposit || 0) + ' deposit');
    else if (A.pay === 'cash') L.push('Budget: ' + money(A.cash || 0) + ' outright');
    else if (A.pay) L.push('Budget: not decided');
    return L;
  }

  function payload() {
    var fit = RESULT.fit || [], P = {
      form: 'which-bmw-quiz',
      _subject: 'Which BMW quiz: ' + (fit[0] ? fit[0].m.name : 'no match') + ' for '
        + ($('wbName') ? $('wbName').value.trim() : ''),
      name: $('wbName').value.trim(),
      phone: $('wbPhone').value.trim(),
      email: $('wbEmail').value.trim(),
      _replyto: $('wbEmail').value.trim(),
      notes: $('wbNotes').value.trim(),
      quizsummary: summary().join('\n'),
      daily_miles_estimate: dailyMiles() == null ? '' : Math.round(dailyMiles()),
      annual_miles_estimate: annualMiles() == null ? '' : annualMiles(),
      page_url: location.href
    };
    ['who', 'life', 'pace', 'park', 'pay', 'weekend', 'attention'].forEach(function (k) {
      P[k] = A[k] || '';
    });
    P.personality = readBack();
    /* The gap between head and heart is the conversation Dan is about to have,
       so it goes in the email rather than being left on the page. */
    if (RESULT.heart) {
      P.heart_model = RESULT.heart.m.name;
      P.heart_vs_budget = RESULT.gap ? RESULT.gap.text : '';
      P.heart_over_budget = RESULT.gap ? RESULT.gap.over : '';
      P.heart_why = RESULT.heart.reasons.slice(0, 4).join('; ');
      P._subject = 'Which BMW quiz: ' + (fit[0] ? fit[0].m.name : 'no match')
        + ' on budget, ' + RESULT.heart.m.name + ' at heart, for '
        + ($('wbName') ? $('wbName').value.trim() : '');
    }
    P.carries = A.load.join(', ');
    P.can_charge_at_home = canCharge() === null ? '' : (canCharge() ? 'Yes' : 'No');
    P.monthly_max = A.monthly || '';
    P.deposit = A.deposit == null ? '' : A.deposit;
    P.cash_max = A.cash || '';
    fit.slice(0, 3).forEach(function (r, i) {
      var n = i + 1;
      P['match_' + n + '_model'] = r.m.name;
      P['match_' + n + '_why'] = r.reasons.slice(0, 4).join('; ');
      P['match_' + n + '_caveats'] = r.caveats.join('; ');
      P['match_' + n + '_price_from'] = r.priceFrom ? money(r.priceFrom) : '';
      P['match_' + n + '_monthly'] = r.monthly ? money(r.monthly.monthly) : '';
      P['match_' + n + '_in_stock_dan'] = r.m.in_stock_dan;
    });
    P.models_that_fit = fit.map(function (r) { return r.m.name; }).join(', ');
    return P;
  }

  function wireResult() {
    document.querySelectorAll('.wb-wa').forEach(function (a) {
      a.addEventListener('click', function () {
        ga('wb_card_whatsapp', { model: a.dataset.model || '' });
      });
    });
    var f = $('wbForm');
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (SENT) return;
      var err = $('wbErr'), btn = $('wbSend');
      var name = $('wbName').value.trim(), ph = $('wbPhone').value.trim(),
          em = $('wbEmail').value.trim();
      if ($('wbGotcha').value) return;                     /* a bot filled the trap */
      if (!name || !ph || !em || em.indexOf('@') === -1) {
        err.hidden = false;
        err.textContent = 'I need a name, a mobile and an email that works.';
        ga('wb_contact_invalid', {});
        return;
      }
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      var ctl = new AbortController();
      var t = setTimeout(function () { ctl.abort(); }, 12000);
      fetch(FORM, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload())
      }).then(function (res) {
        clearTimeout(t);
        return res.json().catch(function () { return {}; }).then(function (j) {
          if (!res.ok || j.error || (j.errors && j.errors.length)) throw new Error('rejected');
          return j;
        });
      }).then(function () {
        SENT = true;
        ga('wb_lead_sent', {});
        try { localStorage.removeItem(KEY); } catch (e2) {}
        f.innerHTML = '<h2>Got it, thank you</h2><p class="wb-hint">Everything you told me is with me now, '
          + 'including which models came out on top. I will come back to you properly rather than with a '
          + 'template.</p><p class="wb-small">If you would rather talk now, <a href="https://wa.me/' + WA
          + '" target="_blank" rel="noopener">message me</a>.</p>';
      }).catch(function () {
        clearTimeout(t);
        btn.disabled = false;
        btn.textContent = 'Try again';
        err.hidden = false;
        err.innerHTML = 'That did not send. Try again, or <a href="https://wa.me/' + WA
          + '?text=' + encodeURIComponent('Hi Dan, I did the quiz but the form would not send')
          + '" target="_blank" rel="noopener">message me instead</a>.';
        ga('wb_lead_error', {});
      });
    });
  }

  /* ---------- boot ---------- */

  function grab(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url);
      return r.json();
    });
  }

  function start() {
    var had = restore();
    Promise.all([
      grab('automation/bmw-models.json'),
      grab('automation/hedin-stock-snapshot.json').catch(function () { return []; }),
      grab('automation/hedin-group-stock.json').catch(function () { return []; }),
      grab('automation/stock-finance.json').catch(function () { return {}; }),
      grab('automation/stock-finance-ladder.json').catch(function () { return {}; })
    ]).then(function (r) {
      MODELS = r[0];
      r[1].forEach(function (c) { c._home = true; });
      CARS = r[1].concat(r[2]);
      CARS.forEach(function (c) { c._fam = family(c); });
      FIN = r[3] || {};
      LAD = r[4] || {};
      $('wbLoad').hidden = true;
      $('wbStage').hidden = false;
      if (had && A.who) {
        $('wbResume').hidden = false;
        $('wbResumeGo').addEventListener('click', function () {
          $('wbResume').hidden = true; render();
        });
        $('wbResumeNew').addEventListener('click', function () {
          try { localStorage.removeItem(KEY); } catch (e) {}
          location.reload();
        });
        ga('wb_resume', {});
        return;
      }
      render();
      /* The title card is a view, not a start. wb_start fires when they press
         the button on it, so the two can be told apart in GA: everybody who
         lands sees the card, and the gap between the two numbers is the cost of
         the cover screen. */
      ga('wb_intro_view', {});
    }).catch(function () {
      /* The model table is the one file the quiz cannot do without. */
      $('wbLoad').innerHTML = '<p>The quiz will not load just now. '
        + '<a href="https://wa.me/' + WA + '">Message me</a> and I will answer it myself, '
        + 'or try <a href="find-my-bmw.html">Find my BMW</a>.</p>';
    });
  }

  window.wbDebug = { get A() { return A; }, get result() { return RESULT; },
                     get models() { return MODELS; }, recommend: recommend,
                     dailyMiles: dailyMiles, annualMiles: annualMiles,
                     canCharge: canCharge,
                     assess: function (k, o) { return assess(k, MODELS[k], o); },
                     readBack: readBack, steps: function () { return Q.length; },
                     set: function (o) { var k; for (k in o) A[k] = o[k]; },
                     /* Clamped, so a test can say "jump to the end" without
                        tracking how many questions there happen to be today. */
                     go: function (n) { STEP = Math.min(n, Q.length); render(); } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else start();
})();
