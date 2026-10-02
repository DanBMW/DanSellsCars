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

  /* Minutes behind the wheel into miles. 0.4 miles a minute is 24mph, which is
     a town and dual carriageway mix rather than a motorway figure, and it is
     said on screen so nobody is converted without being told. The toggle exists
     because almost everybody knows their commute in minutes and almost nobody
     knows it in miles. */
  var MPM = 0.4;
  var DRIVING_DAYS = 320;

  /* How much of an electric car's range a daily drive may take before home
     charging stops being comfortable. 60% leaves room for winter, a detour and
     a cold battery, all three of which are real and none of which appear in a
     WLTP figure. */
  var EV_HEADROOM = 0.6;

  var Q = [
    { id: 'who', h: 'Who is usually on board?',
      hint: 'The honest answer, not the once a year answer.', type: 'one',
      opts: [
        { v: 'solo', t: 'Just me, or me and one other', l: 'The back seat is mostly empty.' },
        { v: 'childseats', t: 'Two child seats and two adults', l: 'Seats in the back, buggy in the boot.' },
        { v: 'occasional', t: 'Two in the back now and then', l: 'Friends, family, the odd lift.' },
        { v: 'five', t: 'Five adults, regularly', l: 'Three grown ups across the back, comfortably.' },
        { v: 'seven', t: 'More than five', l: 'You need the third row.' }
      ] },
    { id: 'load', h: 'What goes in the back?', hint: 'Tick anything that happens most weeks.',
      type: 'many', opts: [
        { v: 'light', t: 'Not a lot', l: 'A bag, a coat, the shopping.' },
        { v: 'shop', t: 'The weekly shop', l: '' },
        { v: 'buggy', t: 'A buggy or pram', l: '' },
        { v: 'dog', t: 'A dog', l: '' },
        { v: 'kit', t: 'Bikes, clubs or sports kit', l: '' },
        { v: 'big', t: 'Big awkward loads', l: 'Tip runs, flat packs, work gear.' }
      ] },
    { id: 'daily', h: 'How much driving on a normal day?',
      hint: 'Give it in whichever you actually know. This is the question that decides petrol, diesel, hybrid or electric.',
      type: 'daily' },
    { id: 'longrun', h: 'And the long runs?', hint: 'Two hours or more in one go.',
      type: 'one', opts: [
        { v: 'never', t: 'Hardly ever', l: '' },
        { v: 'monthly', t: 'Once a month or so', l: '' },
        { v: 'weekly', t: 'Most weeks', l: '' },
        { v: 'often', t: 'Several times a week', l: 'Motorway miles are your life.' }
      ] },
    { id: 'charge', h: 'Could you charge at home?',
      hint: 'A driveway or garage with a socket. It does not have to be a proper charger yet.',
      type: 'one', opts: [
        { v: 'yes', t: 'Yes, off street parking', l: '' },
        { v: 'maybe', t: 'Possibly, not sure', l: '' },
        { v: 'no', t: 'No, I park on the street', l: '' }
      ] },
    { id: 'pace', h: 'How should it feel?', hint: 'No wrong answer. It changes the engine, not the model.',
      type: 'one', opts: [
        { v: 'calm', t: 'Easy and relaxed', l: 'Quiet, smooth, nothing to prove.' },
        { v: 'poke', t: 'Comfortable, with a bit of poke', l: 'Happy daily, and it moves when you ask.' },
        { v: 'quick', t: 'Properly quick', l: 'You want to feel it.' },
        { v: 'pocket', t: 'Small car, big poke', l: 'Something that punches above its size.' },
        { v: 'fast', t: 'As fast as you can get me', l: '' }
      ] },
    /* ---- the three personality questions ----
       Everything above this asks what you need. These ask what you are like,
       which is what separates two cars that fit equally well: a 3 Series and
       an X3 do the same job for the same family, and the answer to "would you
       rather nobody looked" picks between them. They are deliberately quick,
       slightly fun, and none of them rules a car out. */
    { id: 'weekend', h: 'A good drive looks like…', hint: 'The one you would choose.',
      type: 'one', opts: [
        { v: 'country', t: 'An empty back road', l: 'Bends, no traffic, nowhere particular to be.' },
        { v: 'motorway', t: 'Three hours to somewhere good', l: 'Cruise set, music on, eating up miles.' },
        { v: 'city', t: 'Short hops, done quickly', l: 'In, out, parked, home.' },
        { v: 'nodrive', t: 'Honestly, not driving at all', l: 'The car is there to get it over with.' }
      ] },
    { id: 'attention', h: 'You pull up outside somewhere. You would rather…',
      hint: '', type: 'one', opts: [
        { v: 'none', t: 'Nobody looked twice', l: 'Understated. You are not here to be seen.' },
        { v: 'quiet', t: 'The people who know, knew', l: 'A quiet nod from somebody who gets it.' },
        { v: 'heads', t: 'Heads turned', l: 'You want it to make an entrance.' }
      ] },
    { id: 'love', h: 'Be honest about driving', hint: '', type: 'one',
      opts: [
        { v: 'best', t: 'Best part of my day', l: 'You go the long way round on purpose.' },
        { v: 'enjoy', t: 'I enjoy it when it is good', l: '' },
        { v: 'means', t: 'It is just how I get places', l: 'No shame in it. It changes the answer.' }
      ] },
    { id: 'mood', h: 'What matters most?', hint: 'Pick up to two, or skip.', type: 'many', max: 2,
      opts: [
        { v: 'comfort', t: 'Comfort', l: 'It should take the edge off a bad road.' },
        { v: 'fun', t: 'How it drives', l: 'Keen steering, something to enjoy.' },
        { v: 'costs', t: 'Running costs', l: 'Fuel, tax and the monthly figure.' },
        { v: 'space', t: 'Space', l: '' },
        { v: 'looks', t: 'Presence', l: 'You want it to look like something.' },
        { v: 'tech', t: 'The latest tech', l: '' }
      ] },
    { id: 'park', h: 'Anything tight to park in?',
      hint: 'A narrow garage, a city space, a lane you have to reverse down.', type: 'one',
      opts: [
        { v: 'yes', t: 'Yes, size matters', l: 'Keep it manageable.' },
        { v: 'no', t: 'Not really', l: 'I can park anything.' }
      ] },
    { id: 'pay', h: 'How would you pay?', hint: '', type: 'pay' },
    { id: 'age', h: 'New or used?', hint: '', type: 'one',
      opts: [
        { v: 'new', t: 'Brand new', l: 'Factory order, or a new one in stock.' },
        { v: 'nearly', t: 'Nearly new', l: 'A year or two old, most of the warranty left.' },
        { v: 'used', t: 'Used, best value', l: '' },
        { v: 'any', t: 'No preference', l: 'Show me what fits.' }
      ] }
  ];

  var A = { who: null, load: [], dailyVal: null, dailyUnit: 'mins', longrun: null,
            charge: null, pace: null, weekend: null, attention: null, love: null,
            mood: [], park: null, pay: null,
            monthly: null, deposit: null, cash: null, age: null };

  var MODELS = null, CARS = [], FIN = {}, LAD = {}, STEP = 0, SENT = false;
  var RESULT = [];

  /* ---------- the figures ---------- */

  function money(n) {
    return '£' + Math.round(n).toLocaleString('en-GB');
  }

  function num(v) {
    var s = String(v == null ? '' : v).replace(/[^0-9.]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  /* Daily miles, whichever way they answered. */
  function dailyMiles() {
    var v = A.dailyVal;
    if (!v) return null;
    return A.dailyUnit === 'miles' ? v : v * MPM;
  }

  function annualMiles() {
    var d = dailyMiles();
    return d == null ? null : Math.round(d * DRIVING_DAYS / 100) * 100;
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

  /* Whether a fuel makes sense for how they actually drive, with the reason in
     words. This is the heart of the quiz: the same car is a good or a terrible
     idea depending on the answers to three questions. */
  function fuelVerdict(m) {
    var d = dailyMiles(), yr = annualMiles(), ch = A.charge;
    var out = { good: [], bad: [] };
    var ev = m.fuels.indexOf('Electric') !== -1;
    var ph = m.fuels.indexOf('Plug-in hybrid') !== -1;
    var di = m.fuels.indexOf('Diesel') !== -1;
    var pe = m.fuels.indexOf('Petrol') !== -1;
    var range = m.ev_miles_max || null;

    if (ev) {
      if (ch === 'no') {
        out.bad.push('electric without somewhere to plug in at home');
      } else if (d != null && range && d <= range * EV_HEADROOM) {
        out.good.push('your ' + Math.round(d) + ' miles a day is well inside its '
          + range + ' mile range, so it charges at home overnight and you rarely think about it');
      } else if (d != null && range && d > range) {
        out.bad.push('your daily drive is longer than its ' + range + ' mile range');
      } else if (range) {
        out.good.push(range + ' miles of range');
      }
      if (A.longrun === 'often' && ch !== 'no') {
        out.bad.push('several long runs a week means public charging stops, which is the one thing an electric car asks of you');
      }
    }
    if (ph) {
      if (ch === 'no') {
        out.bad.push('a plug-in hybrid you cannot charge is just a heavy petrol car');
      } else if (d != null && range && d <= range) {
        out.good.push('your ' + Math.round(d) + ' miles a day fits inside its '
          + range + ' electric miles, so the daily driving is electric and the engine is there for the long trips');
      }
    }
    if (di) {
      if (yr != null && yr >= 12000) {
        out.good.push('diesel earns its keep at about ' + yr.toLocaleString('en-GB') + ' miles a year');
      } else if (yr != null && yr < 7000 && !pe && !ev && !ph) {
        out.bad.push('diesel is the wrong fit for only about ' + yr.toLocaleString('en-GB') + ' miles a year');
      }
    }
    if (pe && yr != null && yr < 10000 && ch === 'no') {
      out.good.push('petrol suits your mileage and needs no charging');
    }
    return out;
  }

  /* What the personality answers say about a car, scored against figures we
     actually hold rather than against a vibe: how tall it is, how much power it
     carries per tonne, how long it is, whether it plugs in. `weight` is 1 for
     the budget answer and 2 for the heart answer, where personality is meant to
     lead.

     Nothing in here ever rules a car out. These questions separate two cars
     that both fit; they must not take away a car that works. */
  function personality(m, weight) {
    var s = 0, why = [];
    var low = m.height_mm && m.height_mm < 1500;
    var tall = m.height_mm && m.height_mm >= 1620;
    var punchy = (m.hp_per_tonne_max || 0) >= 170;
    var big = m.size_class === 'large' || m.size_class === 'limousine';
    var small = m.size_class === 'small' || m.size_class === 'compact';

    if (A.weekend === 'country') {
      if (low) { s += 8; why.push('low and planted, which is what makes a back road worth driving'); }
      if (punchy) s += 6;
      if (tall) s -= 5;
    } else if (A.weekend === 'motorway') {
      if (big) { s += 8; why.push('long legs for the three hour runs you described'); }
      if (m.fuels.indexOf('Diesel') !== -1 || m.ev_miles_max >= 250) s += 5;
      if (small) s -= 4;
    } else if (A.weekend === 'city') {
      if (small) { s += 8; why.push('small enough to make short city hops painless'); }
      if (m.electric) { s += 6; why.push('electric suits stop start driving better than anything else'); }
      if (m.length_mm > 4800) s -= 6;
    } else if (A.weekend === 'nodrive') {
      if (m.electric) { s += 6; why.push('quiet, smooth and nothing to think about'); }
      if (big) s += 3;
      if (punchy) s -= 2;
    }

    /* Presence follows SIZE, not body style. Testing this against the real
       table caught the obvious version being wrong: an iX1's body reads "SUV",
       so rewarding any SUV gave a small crossover the same presence as an X7
       and "heads turn" barely changed the answer at all. A big car has
       presence; a small one does not, whatever shape it is. */
    if (A.attention === 'none') {
      if (small || /Saloon|Touring|Hatchback/i.test(m.body)) {
        s += 9; why.push('understated, which is what you said you wanted');
      }
      if (m.size_class === 'limousine') s -= 12;
      else if (m.size_class === 'large') s -= 5;
    } else if (A.attention === 'quiet') {
      if (!small && m.size_class !== 'limousine') s += 5;
      if (punchy) { s += 5; why.push('quick without shouting about it'); }
    } else if (A.attention === 'heads') {
      if (m.size_class === 'limousine') {
        s += 14; why.push('this is the one people look at');
      } else if (m.size_class === 'large') {
        s += 10; why.push('it has real presence on a driveway');
      } else if (small) {
        s -= 10;
      }
      if (tall) s += 3;                     /* sitting up adds to it */
    }

    if (A.love === 'best') {
      if (punchy) { s += 8; why.push('enough power per tonne to be worth the long way home'); }
      if (low) s += 4;
    } else if (A.love === 'means') {
      if (m.electric || m.plug) { s += 5; why.push('cheap and quiet to live with day to day'); }
      if (punchy) s -= 3;
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
    if (A.charge === 'no' && m.electric && m.fuels.length === 1) {
      r.out = 'electric only, and you have nowhere to charge'; return r;
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
      r.reasons.push('genuinely comfortable for five adults, '
        + m.width_mm + 'mm across with a ' + m.wheelbase_mm + 'mm wheelbase');
    }
    var bootSaid = false;
    if (A.who === 'childseats' && m.two_seats_two_adults) {
      r.score += 20;
      r.reasons.push('room for two child seats with the front seats still back'
        + (m.boot_l_max ? ', and a ' + m.boot_l_max + ' litre boot for the buggy' : ''));
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
        r.reasons.push(m.boot_l_max >= boot + 100
          ? m.boot_l_max + ' litre boot, comfortably more than you asked for'
          : m.boot_l_max + ' litre boot, enough for what you carry');
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
        r.reasons.push('the quick ones go ' + m.pace_best + ', about '
          + m.hp_per_tonne_max + ' horsepower a tonne');
      } else if (want > pace) {
        r.caveats.push('even the quickest is only ' + m.pace_best);
      }
    }
    if (A.pace === 'pocket' && pace >= 3) {
      r.score += 14; r.reasons.push('a small car that is genuinely quick');
    }

    if (A.mood.indexOf('comfort') !== -1 && (m.size_class === 'large' || m.size_class === 'limousine')) {
      r.score += 10; r.reasons.push('long wheelbase and weight, which is what makes a car ride well');
    }
    if (A.mood.indexOf('fun') !== -1 && m.height_mm && m.height_mm < 1500) {
      r.score += 10; r.reasons.push('sits low, ' + m.height_mm + 'mm, so it changes direction like a car and not a tower');
    }
    if (A.mood.indexOf('costs') !== -1) {
      if (m.electric) { r.score += 12; r.reasons.push('no fuel and no road tax to speak of'); }
      else if (m.co2_gkm_min) {
        r.score += m.co2_gkm_min < 50 ? 10 : m.co2_gkm_min < 130 ? 5 : -4;
        if (m.co2_gkm_min < 130) r.reasons.push('from ' + m.co2_gkm_min + 'g/km CO2');
      }
    }
    if (A.mood.indexOf('space') !== -1 && m.boot_l_max) {
      r.score += m.boot_l_max >= 550 ? 10 : m.boot_l_max >= 470 ? 5 : 0;
    }
    if (A.mood.indexOf('looks') !== -1 && /Coupe|SUV/.test(m.body)) {
      r.score += 8; r.reasons.push('it looks like something on a driveway');
    }
    if (A.mood.indexOf('tech') !== -1 && m.years && m.years[1] >= 2025) {
      r.score += 8; r.reasons.push('the newest ones carry BMW’s current screens and software');
    }

    if (A.park === 'yes' && m.length_mm && m.length_mm <= 4600) {
      r.score += 10; r.reasons.push('easy to place at ' + (m.length_mm / 1000).toFixed(2) + 'm long');
    }
    if (A.age === 'new' && m.years && m.years[1] >= 2026) r.score += 6;
    if (A.age === 'used') r.score += (m.price_from && m.price_from < 30000) ? 6 : 0;

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
    if (A.weekend === 'country') bits.push('you would take the long way round for a good road');
    else if (A.weekend === 'motorway') bits.push('you cover proper distances in one go');
    else if (A.weekend === 'city') bits.push('most of your driving is short and in town');
    else if (A.weekend === 'nodrive') bits.push('the car is a tool, not a hobby');
    if (A.attention === 'none') bits.push('you would rather nobody looked twice');
    else if (A.attention === 'quiet') bits.push('you want the people who know to notice');
    else if (A.attention === 'heads') bits.push('you want it to turn a head or two');
    if (A.love === 'best') bits.push('and driving is the best part of your day');
    else if (A.love === 'means') bits.push('and you would rather it just got on with it');
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
      localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), a: A, s: STEP }));
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
         starts again at question one is not carrying on. */
      if (typeof b.s === 'number') STEP = Math.max(0, Math.min(Q.length, b.s));
      return true;
    } catch (e) { return false; }
  }

  /* May they move on? A multi-select question is skippable, so yes. */
  function answered(q) {
    if (q.type === 'many') return true;
    if (q.type === 'daily') return A.dailyVal != null;
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

  function optMarkup(q) {
    var sel = q.type === 'many' ? A[q.id] : [A[q.id]];
    return q.opts.map(function (o) {
      var on = sel.indexOf(o.v) !== -1;
      return '<button type="button" class="wb-opt' + (on ? ' on' : '') + '"'
        + ' data-q="' + q.id + '" data-v="' + o.v + '" aria-pressed="' + on + '">'
        + '<span class="wb-opt-t">' + esc(o.t) + '</span>'
        + (o.l ? '<span class="wb-opt-l">' + esc(o.l) + '</span>' : '')
        + '</button>';
    }).join('');
  }

  function dailyMarkup() {
    var v = A.dailyVal == null ? '' : A.dailyVal;
    var d = dailyMiles(), yr = annualMiles();
    return '<div class="wb-daily">'
      + '<div class="wb-toggle" role="group" aria-label="Miles or minutes">'
      + '<button type="button" class="wb-tog' + (A.dailyUnit === 'mins' ? ' on' : '')
      + '" data-unit="mins">Minutes</button>'
      + '<button type="button" class="wb-tog' + (A.dailyUnit === 'miles' ? ' on' : '')
      + '" data-unit="miles">Miles</button></div>'
      + '<label class="wb-numwrap"><input type="number" id="wbDaily" inputmode="numeric" min="0" max="600"'
      + ' value="' + v + '" placeholder="' + (A.dailyUnit === 'mins' ? '40' : '16') + '"/>'
      + '<span>' + (A.dailyUnit === 'mins' ? 'minutes a day' : 'miles a day') + '</span></label>'
      + '<p class="wb-conv" id="wbConv">'
      + (d == null ? 'However you think about it. Most people know the minutes.'
          : (A.dailyUnit === 'mins'
              ? 'About ' + Math.round(d) + ' miles a day, so roughly '
                + yr.toLocaleString('en-GB') + ' a year. Worked out at 24mph, a town and dual carriageway mix.'
              : 'Roughly ' + yr.toLocaleString('en-GB') + ' miles a year.'))
      + '</p></div>';
  }

  function payMarkup() {
    var r = A.pay;
    var h = '<div class="wb-opts">'
      + ['<button type="button" class="wb-opt' + (r === 'monthly' ? ' on' : '') + '" data-q="pay" data-v="monthly">'
         + '<span class="wb-opt-t">Monthly</span><span class="wb-opt-l">Finance, with a deposit.</span></button>',
         '<button type="button" class="wb-opt' + (r === 'cash' ? ' on' : '') + '" data-q="pay" data-v="cash">'
         + '<span class="wb-opt-t">Outright</span><span class="wb-opt-l">Cash, or part exchange plus cash.</span></button>',
         '<button type="button" class="wb-opt' + (r === 'unsure' ? ' on' : '') + '" data-q="pay" data-v="unsure">'
         + '<span class="wb-opt-t">Not sure yet</span><span class="wb-opt-l">Skip the figures.</span></button>'
        ].join('') + '</div>';
    if (r === 'monthly') {
      h += '<div class="wb-pair">'
        + '<label class="wb-numwrap"><span class="wb-pre">£</span>'
        + '<input type="number" id="wbMonthly" inputmode="numeric" min="100" max="3000" step="10"'
        + ' value="' + (A.monthly || '') + '" placeholder="450"/><span>a month, at most</span></label>'
        + '<label class="wb-numwrap"><span class="wb-pre">£</span>'
        + '<input type="number" id="wbDeposit" inputmode="numeric" min="0" max="50000" step="500"'
        + ' value="' + (A.deposit == null ? '' : A.deposit) + '" placeholder="5000"/><span>deposit</span></label>'
        + '</div><p class="wb-conv">Payments come straight from BMW Financial Services at the deposit you type, not from a calculator here.</p>';
    } else if (r === 'cash') {
      h += '<div class="wb-pair"><label class="wb-numwrap"><span class="wb-pre">£</span>'
        + '<input type="number" id="wbCash" inputmode="numeric" min="2000" max="200000" step="500"'
        + ' value="' + (A.cash || '') + '" placeholder="25000"/><span>to spend</span></label></div>';
    }
    return h;
  }

  function render() {
    var total = Q.length;
    if (STEP >= total) return renderResult();
    var q = Q[STEP];
    $('wbProg').hidden = false;
    $('wbStepTxt').textContent = (STEP + 1) + ' of ' + total;
    $('wbFill').style.width = (100 * STEP / total) + '%';

    var body = '<h1 class="wb-h">' + esc(q.h) + '</h1>'
      + (q.hint ? '<p class="wb-hint">' + esc(q.hint) + '</p>' : '');
    if (q.type === 'daily') body += dailyMarkup();
    else if (q.type === 'pay') body += payMarkup();
    else body += '<div class="wb-opts' + (q.type === 'many' ? ' two' : '') + '">' + optMarkup(q) + '</div>';

    /* Only a question that can genuinely be skipped ever says Skip. The daily
       driving and budget questions hold the button disabled until they are
       answered, so labelling those Skip would promise something the button
       will not do, and the label would still read Skip after typing: it is set
       at render, and typing only re-enables the button. */
    var label = STEP === total - 1 ? 'See my answer'
      : (q.type === 'many' && !chosen(q) ? 'Skip' : 'Next');
    body += '<div class="wb-nav">'
      + (STEP ? '<button type="button" class="wb-back" id="wbBack">Back</button>' : '<span></span>')
      + '<button type="button" class="wb-next" id="wbNext"' + (answered(q) ? '' : ' disabled')
      + '>' + label + '</button>'
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
    stage.querySelectorAll('.wb-tog').forEach(function (b) {
      b.addEventListener('click', function () {
        A.dailyUnit = b.dataset.unit; save(); render();
        var el = $('wbDaily'); if (el) el.focus();
      });
    });
    var d = $('wbDaily');
    if (d) {
      d.addEventListener('input', function () {
        var n = parseFloat(d.value);
        A.dailyVal = isNaN(n) || n < 0 ? null : n;
        save();
        var c = $('wbConv'), mi = dailyMiles(), yr = annualMiles();
        if (c) {
          c.textContent = mi == null ? 'However you think about it. Most people know the minutes.'
            : (A.dailyUnit === 'mins'
                ? 'About ' + Math.round(mi) + ' miles a day, so roughly ' + yr.toLocaleString('en-GB')
                  + ' a year. Worked out at 24mph, a town and dual carriageway mix.'
                : 'Roughly ' + yr.toLocaleString('en-GB') + ' miles a year.');
        }
        $('wbNext').disabled = A.dailyVal == null;
      });
      d.focus();
    }
    [['wbMonthly', 'monthly'], ['wbDeposit', 'deposit'], ['wbCash', 'cash']].forEach(function (p) {
      var el = $(p[0]);
      if (!el) return;
      el.addEventListener('input', function () {
        var n = parseFloat(el.value);
        A[p[1]] = isNaN(n) ? null : n;
        save();
      });
    });
    if ($('wbBack')) $('wbBack').addEventListener('click', function () {
      STEP = Math.max(0, STEP - 1); save(); render(); ga('wb_back', {});
    });
    $('wbNext').addEventListener('click', next);
  }

  function next() {
    STEP += 1;
    save();
    if (STEP >= Q.length) { recommend(); }
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
    return '<article class="wb-card' + (rank && !label ? '' : ' wb-top')
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
      + '<p class="wb-hint">I will come back with the actual cars, the real payments and what is worth waiting for. '
      + 'Everything you answered comes with it, so you will not be asked twice.</p>'
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
    if (d != null) L.push('Drives: ' + A.dailyVal + ' ' + A.dailyUnit + ' a day, about '
      + annualMiles().toLocaleString('en-GB') + ' miles a year');
    if (A.longrun) L.push('Long runs: ' + label('longrun', A.longrun));
    if (A.charge) L.push('Home charging: ' + label('charge', A.charge));
    if (A.pace) L.push('Wants it to feel: ' + label('pace', A.pace));
    if (A.weekend) L.push('A good drive: ' + label('weekend', A.weekend));
    if (A.attention) L.push('Pulling up outside: ' + label('attention', A.attention));
    if (A.love) L.push('Driving is: ' + label('love', A.love));
    if (A.mood.length) L.push('Priorities: ' + A.mood.map(function (v) { return label('mood', v); }).join(', '));
    if (A.park) L.push('Tight parking: ' + label('park', A.park));
    if (A.pay === 'monthly') L.push('Budget: up to ' + money(A.monthly || 0) + ' a month at '
      + money(A.deposit || 0) + ' deposit');
    else if (A.pay === 'cash') L.push('Budget: ' + money(A.cash || 0) + ' outright');
    else if (A.pay) L.push('Budget: not decided');
    if (A.age) L.push('Age: ' + label('age', A.age));
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
      daily_miles: dailyMiles() == null ? '' : Math.round(dailyMiles()),
      annual_miles: annualMiles() == null ? '' : annualMiles(),
      page_url: location.href
    };
    ['who', 'longrun', 'charge', 'pace', 'park', 'pay', 'age',
     'weekend', 'attention', 'love'].forEach(function (k) {
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
    P.priorities = A.mood.join(', ');
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
      ga('wb_start', {});
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
