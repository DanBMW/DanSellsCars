/* Find my BMW v2. One page: intro, seven tap only questions, an honest
 * matching moment, then the reveal with real cars, WhatsApp first and an
 * optional Formspree form (one submission per lead).
 *
 * Reads the same files stock.html publishes (snapshot, group stock, lender
 * quotes, deposit ladder, car details) and the shared rules in stock-core.js
 * (window.dsStock) and dsfinance.js (window.dsFin), so counts, payments and
 * the "See all matches" hand-off agree with stock.html. Every payment shown is
 * the lender's; a car without a live quote says "Ask for a quote".
 * New or either buyers are also matched against lookup/new-stock.json (the
 * brand new cars already built for Hedin Ruxley); see "brand new stock" below.
 * Every answer is an active tap: nothing is pre selected and there is no Skip.
 * Plain ES2017, no dependencies.
 */
(function () {
  'use strict';

  var WA = 'https://wa.me/447827138197';
  var FORM_URL = 'https://formspree.io/f/xqewleog';
  var KEY = 'fmbV2', TTL = 7 * 864e5;
  var GBP = '\u00a3';
  var RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var ST = window.dsStock, FN = window.dsFin;
  var QS = ['qi', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'qp', 'q7'];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return FN.money(n); }
  function money2(n) { return FN.money2(n); }
  function cap1(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function track(name, p) {
    if (typeof window.gtag !== 'function') return;
    var o = { funnel: 'fmb', fmb_version: '2' };
    for (var k in (p || {})) o[k] = typeof p[k] === 'string' ? p[k].slice(0, 100) : p[k];
    window.gtag('event', name, o);
  }
  function markComplete(how) {
    var seen = false;
    try { seen = !!sessionStorage.getItem('gaDone_fmb'); sessionStorage.setItem('gaDone_fmb', '1'); } catch (e) {}
    if (!seen) track('fmb_complete', { method: how });
  }

  /* ---------------- options ---------------- */
  var I_ = '<svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var SVG = {
    family: I_ + '<circle cx="11" cy="9" r="3.5"/><circle cx="22" cy="11" r="2.8"/><path d="M4 27v-4a7 7 0 0 1 14 0v4M17 27v-3a5 5 0 0 1 10 0v3"/></svg>',
    commute: I_ + '<rect x="4" y="10" width="24" height="16" rx="2"/><path d="M12 10V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M4 17h24"/></svg>',
    miles: I_ + '<path d="M11 4 5 28M21 4l6 24M16 6v3M16 13v4M16 21v5"/></svg>',
    thrill: I_ + '<path d="M4 22a12 12 0 1 1 24 0"/><path d="M16 22l6-7"/><circle cx="16" cy="22" r="1.6"/></svg>',
    style: I_ + '<path d="M16 3l3 8 8 1-6 6 2 9-7-5-7 5 2-9-6-6 8-1z"/></svg>',
    open: I_ + '<path d="M4 10h5c6 0 8 12 14 12h5M24 18l4 4-4 4M4 22h5c2 0 3.5-1.5 4.8-3.5M24 6l4 4-4 4M28 10h-5c-2 0-3.5 1.5-4.8 3.5"/></svg>',
    clock: I_ + '<circle cx="16" cy="16" r="11"/><path d="M16 9v7l5 3"/></svg>'
  };
  var SIL_W = 'viewBox="0 0 240 110" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var WHEELS = '<circle cx="64" cy="84" r="14"/><circle cx="64" cy="84" r="5.5" opacity=".5"/><circle cx="178" cy="84" r="14"/><circle cx="178" cy="84" r="5.5" opacity=".5"/>';
  var SIL = {
    hatchback: '<svg ' + SIL_W + '><path d="M42,84 L34,84 Q26,84 25,75 L26,66 Q27,58 34,54 L44,36 Q48,28 60,27 L128,26 Q142,26 152,34 L172,50 L196,55 Q210,58 213,66 L214,74 Q214,84 204,84 L196,84"/><path d="M160,84 L86,84"/><path d="M50,52 L58,36 Q61,31 68,31 L98,30 L99,52 Z M108,30 L134,30 Q144,30 151,36 L166,50 L109,52 Z" stroke-width="2.6" opacity=".5"/>' + WHEELS + '</svg>',
    saloon: '<svg ' + SIL_W + '><path d="M40,84 L30,84 Q22,84 21,75 L22,66 Q23,59 32,57 L46,54 L64,38 Q70,32 80,31 L124,30 Q136,30 146,37 L164,50 L196,55 Q210,58 213,66 L214,74 Q214,84 204,84 L196,84"/><path d="M160,84 L86,84"/><path d="M56,53 L68,40 Q72,35 80,35 L100,34 L101,52 Z M110,34 L126,34 Q136,34 144,40 L156,50 L111,52 Z" stroke-width="2.6" opacity=".5"/>' + WHEELS + '</svg>',
    touring: '<svg ' + SIL_W + '><path d="M42,84 L33,84 Q25,84 24,75 L25,44 Q26,34 36,33 L128,28 Q142,27 152,34 L172,50 L196,55 Q210,58 213,66 L214,74 Q214,84 204,84 L196,84"/><path d="M160,84 L86,84"/><path d="M32,52 L32,42 Q32,37 38,37 L60,36 L61,52 Z M70,36 L100,35 L101,52 L71,52 Z M110,34 L134,34 Q144,33 151,39 L166,50 L111,52 Z" stroke-width="2.6" opacity=".5"/><path d="M42,29 L124,24.5" stroke-width="2.6" opacity=".5"/>' + WHEELS + '</svg>',
    suv: '<svg ' + SIL_W + '><path d="M42,78 L34,78 Q26,78 25,70 L26,38 Q27,28 37,27 L108,23 Q122,22 131,29 L146,42 L184,45 Q204,47 207,57 L208,68 Q208,78 198,78 L190,78"/><path d="M154,78 L88,78"/><path d="M34,44 L34,36 Q34,31 40,31 L58,30 L59,44 Z M68,30 L94,29 L95,44 L69,44 Z M104,28 L112,28 Q122,27 128,33 L137,42 L105,44 Z" stroke-width="2.6" opacity=".5"/><path d="M42,23 L102,20" stroke-width="2.6" opacity=".5"/><circle cx="64" cy="78" r="16"/><circle cx="64" cy="78" r="6.5" opacity=".5"/><circle cx="172" cy="78" r="16"/><circle cx="172" cy="78" r="6.5" opacity=".5"/></svg>',
    coupe: '<svg ' + SIL_W + '><path d="M40,84 L30,84 Q22,84 21,76 L22,68 Q23,61 32,59 L44,56 Q66,40 84,35 Q100,31 116,31 Q132,31 142,38 L160,51 L194,57 Q210,60 213,67 L214,75 Q214,84 204,84 L196,84"/><path d="M160,84 L86,84"/><path d="M56,54 Q72,42 88,37 L104,35 L104,53 Z M113,35 Q126,34 137,41 L151,51 L113,53 Z" stroke-width="2.6" opacity=".5"/>' + WHEELS + '</svg>',
    convertible: '<svg ' + SIL_W + '><path d="M40,84 L30,84 Q22,84 21,76 L22,68 Q23,61 32,58 L46,56 Q66,53 90,52 L130,51 L142,34 Q144,31 147,32 Q150,33 149,36 L140,52 L156,54 L194,58 Q210,61 213,68 L214,75 Q214,84 204,84 L196,84"/><path d="M160,84 L86,84"/><path d="M54,55 Q74,52 100,51 L116,50.5" stroke-width="2.6" opacity=".5"/><path d="M134,49 L143,36" stroke-width="2.6" opacity=".5"/>' + WHEELS + '</svg>',
    gran_coupe: '<svg ' + SIL_W + '><path d="M34,84 L25,84 Q17,84 16,76 L17,68 Q18,61 27,58 L36,55 Q54,38 74,33 L112,30 Q136,29 148,36 L166,50 L200,56 Q216,59 219,67 L220,75 Q220,84 210,84 L202,84"/><path d="M166,84 L80,84"/><path d="M46,54 Q62,40 78,36 L96,34.5 L97,53 Z M106,34 L126,33 Q140,33 149,40 L160,50 L107,53 Z" stroke-width="2.6" opacity=".5"/><path d="M128,34 L128,52" stroke-width="2.6" opacity=".5"/><circle cx="58" cy="84" r="14"/><circle cx="58" cy="84" r="5.5" opacity=".5"/><circle cx="184" cy="84" r="14"/><circle cx="184" cy="84" r="5.5" opacity=".5"/></svg>'
  };
  SIL.mpv = SIL.hatchback;

  var LIFE = [
    { v: 'family', t: 'Family life', l: 'School runs, big shops, weekends away.' },
    { v: 'commute', t: 'The daily drive', l: 'Commutes and client visits, done in comfort.' },
    { v: 'miles', t: 'Big motorway miles', l: 'Long runs where comfort really counts.' },
    { v: 'thrill', t: 'Driving for fun', l: 'B roads, early starts, big grins.' },
    { v: 'style', t: 'Turning heads', l: 'Arrive looking the part.' },
    { v: 'open', t: 'A bit of everything', l: 'Honestly? Surprise me.' }
  ];
  var BODY = [
    { v: 'suv', t: 'SUV', l: 'X1 to X7, iX1, iX3, iX and friends', keys: ['suv'], stock: ['suv', 'suv-coupe'] },
    { v: 'saloon', t: 'Saloon', l: '3, 5 and 7 Series, i5 and i7', keys: ['saloon'], stock: ['saloon'] },
    { v: 'touring', t: 'Touring', l: 'The estate versions, for the boot space', keys: ['touring'], stock: ['estate'] },
    { v: 'hatchback', t: 'Hatchback', l: '1 Series, plus the Active Tourer and Gran Tourer', keys: ['hatchback', 'mpv'], stock: ['hatch', 'mpv'] },
    { v: 'gran_coupe', t: 'Gran Coup\u00e9', l: 'Four door coup\u00e9s: 2 and 4 Series, i4', keys: ['gran_coupe'], stock: ['gran-coupe'] },
    { v: 'coupe', t: 'Coup\u00e9', l: 'Two doors, plus the X4 and X6', keys: ['coupe'], stock: ['coupe', 'suv-coupe'] },
    { v: 'convertible', t: 'Convertible', l: 'Roof down days', keys: ['convertible'], stock: ['convertible'] },
    { v: 'open', t: 'Open minded', l: 'Show me every shape' }
  ];
  var BODY_NEAR = { saloon: ['gran_coupe', 'touring'], touring: ['suv', 'saloon'], suv: ['touring'],
    hatchback: ['gran_coupe'], coupe: ['gran_coupe', 'convertible'], convertible: ['coupe'], gran_coupe: ['saloon', 'coupe'] };
  var FUEL = [
    { v: 'petrol', t: 'Petrol', l: 'Includes petrol mild hybrids.', keys: ['petrol', 'mhev-petrol'] },
    { v: 'diesel', t: 'Diesel', l: 'Includes diesel mild hybrids.', keys: ['diesel', 'mhev-diesel'] },
    { v: 'hybrid', t: 'Hybrid', l: 'Petrol or diesel with an electric helper. Never needs plugging in.', keys: ['mhev-petrol', 'mhev-diesel'] },
    { v: 'phev', t: 'Plug-in hybrid', l: 'Electric for shorter trips, engine for the long ones.', keys: ['phev'] },
    { v: 'electric', t: 'Electric', l: 'Fully electric. Charge at home or out and about.', keys: ['electric'] },
    { v: 'open', t: 'Open minded', l: 'Show me the best of all of them.' }
  ];
  var FUEL_NEAR = { petrol: ['mhev-diesel'], diesel: ['mhev-petrol'], hybrid: ['petrol', 'diesel'],
    phev: ['electric', 'mhev-petrol', 'mhev-diesel'], electric: ['phev'] };
  var FUEL_NAME = { petrol: 'petrol', diesel: 'diesel', 'mhev-petrol': 'petrol mild hybrid',
    'mhev-diesel': 'diesel mild hybrid', phev: 'plug-in hybrid', electric: 'electric' };
  var MONTHLY = [300, 400, 500, 650, 800, 1000, 0];
  var DEPS = [0, 1000, 2500, 5000, 10000, -1];
  var CASH = [{ v: 20000, t: 'Under ' + GBP + '20k' }, { v: 30000, t: 'Up to ' + GBP + '30k' },
    { v: 50000, t: 'Up to ' + GBP + '50k' }, { v: 70000, t: 'Up to ' + GBP + '70k' }, { v: 0, t: 'Any price' }];
  var CASH_BANDS = { 20000: 'u20', 30000: 'u20,20to30', 50000: 'u20,20to30,30to50', 70000: 'u20,20to30,30to50,50to70' };
  var EXTRAS = ['heated', 'pano', 'hud', 'sound', 'keyless', 'acc', 'xdrive', 'towbar', 'seven'];
  var WHEN = [
    { v: 'now', t: 'As soon as possible' }, { v: 'month', t: 'Within a month' },
    { v: 'quarter', t: 'In the next few months' }, { v: 'browsing', t: 'Just browsing for now' }
  ];
  var SWATCH = { grey: '#8a8d91', black: '#1b1d20', white: '#e8e6e1', blue: '#2f5f9e', green: '#3d6b4a',
    red: '#8c2f2f', silver: '#b9bcc0', purple: '#5b3f78', beige: '#cdbb98', brown: '#6b4a33',
    orange: '#c9702d', yellow: '#d8b73a' };
  var STEP_NAME = { qi: 'interest', q1: 'life', q2: 'body', q3: 'fuel', q4: 'budget', q5: 'extras', q6: 'colour', qp: 'part_exchange', q7: 'timing' };
  var MULTI = { q2: 'body', q3: 'fuel', q5: 'extras', q6: 'colours' };
  var PXQ = [
    { v: 'yes', t: 'Yes', l: 'I\u2019ll ask a few quick things about it next.' },
    { v: 'no', t: 'No', l: 'No car to trade in.' },
    { v: 'maybe', t: 'Maybe', l: 'Not sure yet. You can tell me about it if you like.' }
  ];
  var INTEREST = [
    { v: 'new', t: 'A brand new BMW', l: 'Ordered to your spec, or from brand new stock that may be ready sooner. I\u2019ll come back to you with options.' },
    { v: 'used', t: 'An approved used BMW', l: 'Real cars on my forecourt and across the group.' },
    { v: 'either', t: 'Open to either', l: 'Brand new options from me, ordered to your spec or from new stock that may be ready sooner, plus approved used cars that fit.' }
  ];
  function byV(list, v) { for (var i = 0; i < list.length; i++) if (list[i].v === v) return list[i]; return null; }

  /* ---------------- answers ---------------- */
  /* mo: null not chosen, 0 no limit. dep: null = not sure (standard example).
     cash: null not chosen, 0 any price. Nothing is ever pre selected. */
  function blank() {
    return { interest: null, life: null, body: [], fuel: [], pay: null, mo: null, dep: null, cash: null,
      extras: [], colours: [], when: null, px: null };
  }
  var A = blank();
  var OPEN = {};         /* multi questions where "Open minded" / "Not fussed" is ticked */
  var PRE = {};          /* questions pre answered from the link */
  var depTouched = false;
  var cur = 'intro';

  function save(step) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), answers: A, open: OPEN, dep: depTouched, unlocked: UNLOCKED, pxstate: PXSTATE,
        step: step || cur }));
    } catch (e) {}
  }
  function loadSaved() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!o || !o.answers || Date.now() - (o.t || 0) > TTL) return null;
      return o;
    } catch (e) { return null; }
  }

  /* ---------------- data ---------------- */
  var HOME = [], GROUP = [], FIN = {}, LAD = {}, DET = null;
  var snapOK = null, finOK = false, ladOK = false, groupOK = false;
  var coverage = 1, quotedAny = true;
  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }
  function stamp(c, home) {
    c._price = ST.num(c.price); c._miles = ST.num(c.mileage); c._year = ST.num(c.year);
    c._hp = ST.num(c.power); c._home = home;
    c._m = /(^|\s)M\d|\sM\d{2,3}[a-z]*\b|^BMW M\d/.test(c.model || '');
    c._fuel = ST.fuelKey(c); c._bodies = ST.bodyKeys(c);
    c._prim = ST.bodyPrimary(c);
    return c;
  }
  var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 400); };
  var lazy = {};
  function want(name) {
    if (lazy[name]) return lazy[name];
    var url = { lad: 'automation/stock-finance-ladder.json', group: 'automation/hedin-group-stock.json',
      det: 'automation/car-details.json', newc: 'lookup/new-stock.json' }[name];
    lazy[name] = getJSON(url).then(function (j) {
      if (name === 'lad') { LAD = j || {}; ladOK = true; capCache = {}; }
      if (name === 'group') {
        GROUP = (Array.isArray(j) ? j : []).map(function (c) { return stamp(c, false); });
        groupOK = GROUP.length > 0; capCache = {};
      }
      if (name === 'det') DET = j || {};
      if (name === 'newc') { NEWC = ((j && j.cars) || []).filter(function (c) { return !c.on_hold; }).map(stampNew); newOK = true; }
      refresh();
    })['catch'](function () {
      if (name === 'det') DET = DET || {};
      if (name === 'newc') newOK = true;   /* silent: a failed list just means "I'll be in touch" */
      if (name === 'lad') ladOK = true;
      refresh();
    });
    return lazy[name];
  }
  var pSnap = getJSON('automation/hedin-stock-snapshot.json').then(function (d) {
    if (!Array.isArray(d) || !d.length) throw new Error('empty');
    HOME = d.map(function (c) { return stamp(c, true); });
    snapOK = true;
    calcCoverage();
    refresh();
    idle(function () { want('det'); want('lad'); want('group'); });
  })['catch'](function () { snapOK = false; refresh(); });
  var pFin = getJSON('automation/stock-finance.json').then(function (j) {
    FIN = j || {}; finOK = true; calcCoverage(); refresh();
  })['catch'](function () { FIN = {}; finOK = true; calcCoverage(); refresh(); });

  function calcCoverage() {
    if (!HOME.length || !finOK) return;
    var q = 0;
    HOME.forEach(function (c) { if (FN.live(FIN[c.id])) q++; });
    coverage = q / HOME.length;
    quotedAny = q > 0;
    capCache = {};
  }
  function finAt(c, dep) { return FN.at(FIN[c.id], LAD[c.id], dep === null || dep === undefined ? null : dep); }
  function lowCov() { return finOK && coverage < 0.6; }

  /* ---------------- matching ---------------- */
  function bodySet(vals, near) {
    var k = {};
    vals.forEach(function (v) {
      var o = byV(BODY, v); if (o && o.keys) o.keys.forEach(function (x) { k[x] = 1; });
      if (near) (BODY_NEAR[v] || []).forEach(function (n) { byV(BODY, n).keys.forEach(function (x) { k[x] = 1; }); });
    });
    return k;
  }
  function fuelSet(vals, near) {
    var k = {};
    vals.forEach(function (v) {
      var o = byV(FUEL, v); if (o && o.keys) o.keys.forEach(function (x) { k[x] = 1; });
      if (near) (FUEL_NEAR[v] || []).forEach(function (x) { k[x] = 1; });
    });
    return k;
  }
  function bodyHit(c, vals, near) { var k = bodySet(vals, near); return c._bodies.some(function (b) { return k[b]; }); }
  function fuelHit(c, vals, near) { return !!fuelSet(vals, near)[c._fuel]; }
  function hasCeiling(a) { return (a.pay === 'monthly' && a.mo > 0) || (a.pay === 'cash' && a.cash > 0); }

  /* Highest price among quoted cars inside the ceiling. When the lender is
     quoting few cars, an unquoted car at or under it can still match on price
     (and says "Ask for a quote"). */
  var capCache = {};
  function priceCap(a, stretch) {
    var k = a.mo + '|' + a.dep + '|' + stretch;
    if (capCache[k] !== undefined) return capCache[k];
    var lim = a.mo * (1 + stretch), best = 0;
    HOME.concat(GROUP).forEach(function (c) {
      var f = finAt(c, a.dep);
      if (f && f.monthly <= lim && c._price > best) best = c._price;
    });
    capCache[k] = best;
    return best;
  }
  function budgetMet(c, a, stretch, strictQuotes) {
    stretch = stretch || 0;
    if (a.pay === 'monthly' && a.mo > 0) {
      if (!quotedAny && !strictQuotes) return true;
      var f = finAt(c, a.dep);
      if (f) return f.monthly <= a.mo * (1 + stretch);
      if (lowCov() && !strictQuotes) return c._price <= priceCap(a, stretch);
      return false;
    }
    if (a.pay === 'cash' && a.cash > 0) return c._price < a.cash * (1 + stretch);
    return true;
  }
  /* R: {stretch, fuelN, bodyN, noSeven, anyShape, anyFuel, strictQuotes} */
  function matches(c, a, R) {
    R = R || {};
    if (a.body.length && !R.anyShape && !bodyHit(c, a.body, R.bodyN)) return false;
    if (a.fuel.length && !R.anyFuel && !fuelHit(c, a.fuel, R.fuelN)) return false;
    if (!budgetMet(c, a, R.stretch, R.strictQuotes)) return false;
    if (!R.noSeven && a.extras.indexOf('seven') !== -1 && String(c.seats) !== '7') return false;
    return true;
  }
  function countIn(pool, a, R) { var n = 0; for (var i = 0; i < pool.length; i++) if (matches(pool[i], a, R)) n++; return n; }
  function clone(a) { return JSON.parse(JSON.stringify(a)); }
  function feature(c, k) { return ST.hasFeature(c, DET ? DET[c.id] : null, k) === true; }

  function evaluate(c, a) {
    var got = 0, max = 0, soft = 0, miss = [];
    var f = finAt(c, a.pay === 'monthly' ? a.dep : null);
    if (a.body.length) {
      max += 3;
      if (bodyHit(c, a.body)) got += 3;
      else miss.push(shapeName(c) + ', not ' + list(a.body.map(function (v) { return byV(BODY, v).t; }), 'or'));
    }
    if (a.fuel.length) {
      max += 3;
      if (fuelHit(c, a.fuel)) got += 3;
      else miss.push(cap1(FUEL_NAME[c._fuel] || 'another fuel') + ', not ' + list(a.fuel.map(function (v) { return byV(FUEL, v).t.toLowerCase(); }), 'or'));
    }
    if (hasCeiling(a)) {
      max += 3;
      if (budgetMet(c, a, 0)) got += 3;
      else if (a.pay === 'monthly' && f) miss.push(money(Math.ceil(f.monthly - a.mo)) + ' a month over your budget');
      else if (a.pay === 'monthly') miss.push('No lender quote at your deposit yet');
      else miss.push(money(c._price - a.cash + 1) + ' over your budget');
    }
    if (a.extras.indexOf('seven') !== -1) {
      max += 3;
      if (String(c.seats) === '7') got += 3; else miss.push((c.seats || '5') + ' seats');
    }
    if (a.colours.length) { max += 2; soft += 2; if (a.colours.indexOf(c.colour) !== -1) got += 2; }
    var metExtras = [];
    a.extras.forEach(function (k) {
      if (k === 'seven') return;
      max += 1; soft += 1;
      if (feature(c, k)) { got += 1; metExtras.push(k); }
    });
    var pct = max ? Math.round(100 * got / max) : null;
    /* ranking score: only ever breaks ties between equal percentages */
    var s = c._home ? 12 : 0, aff = 0, b = c._bodies;
    function has(k) { return b.indexOf(k) !== -1; }
    if (a.life === 'family') { if (has('suv') || has('touring') || has('mpv')) aff += 4; if (String(c.seats) === '7') aff += 4; }
    if (a.life === 'commute') { if (has('saloon')) aff += 4; if (c._fuel === 'electric' || c._fuel === 'phev') aff += 4; }
    if (a.life === 'miles') { if (/diesel/.test(c._fuel) || c._fuel === 'phev') aff += 4; if (has('saloon') || has('touring')) aff += 4; }
    if (a.life === 'thrill') { if (c._m || c._hp >= 250) aff += 4; if (has('coupe') || has('convertible')) aff += 4; }
    if (a.life === 'style') { if (has('coupe') || has('gran_coupe') || has('convertible')) aff += 4; if (c._year >= new Date().getFullYear() - 2) aff += 4; }
    s += Math.min(8, aff);
    if (a.pay === 'monthly' && a.mo > 0 && f && f.monthly <= a.mo) s += (f.monthly / a.mo >= 0.8) ? 5 : 2;
    if (f && (a.pay === 'monthly' || a.pay === 'notsure' || !a.pay)) s += 4;
    if (c.image) s += 3;
    s += Math.max(0, c._year - 2018) + Math.max(0, 8 - c._miles / 10000);
    return { c: c, pct: pct, score: s, fin: f, miss: miss, metExtras: metExtras, soft: soft, quoted: !!f };
  }
  function pctOf(r) { return r.pct == null ? 0 : r.pct; }
  function better(x, xs, y, ys) {
    if (pctOf(x) !== pctOf(y)) return pctOf(x) > pctOf(y);
    if (lowCov() && x.quoted !== y.quoted) return x.quoted;
    return xs > ys;
  }
  function sig(r) { return (r.c.series || '') + '|' + r.c._fuel + '|' + r.c._prim; }
  /* Variety: a car the same series, fuel and shape as one already picked loses
     8 points, so the reveal is not three identical 320i M Sports. Skipped when
     the ask is exactly one shape and one fuel. A 90% card never sits above 95%. */
  function pick(cands, n, a, picked) {
    var out = [], pool = cands.slice(), variety = !(a.body.length === 1 && a.fuel.length === 1);
    while (out.length < n && pool.length) {
      var bi = -1, bs = 0;
      for (var i = 0; i < pool.length; i++) {
        var r = pool[i], adj = r.score;
        if (variety && picked.concat(out).some(function (o) { return sig(o) === sig(r); })) adj -= 8;
        if (bi === -1 || better(r, adj, pool[bi], bs)) { bi = i; bs = adj; }
      }
      out.push(pool[bi]); pool.splice(bi, 1);
    }
    return out;
  }

  var SUBS = {
    1: 'A few of these are in our other BMW stock. I can source them from across the group.',
    2: 'Nothing hit every number, so a couple are just over budget.',
    3: 'I\u2019ve included the closest fuel options too.',
    4: 'I\u2019ve widened the shapes a little.',
    5: 'I couldn\u2019t find a 7 seater that fits today.',
    6: 'Nothing close enough today, so here are a few I\u2019d look at.'
  };
  var RELAX = { 1: 'searched our other BMW stock', 2: 'budget plus 10%', 3: 'closest fuels', 4: 'nearby shapes',
    5: '7 seats dropped', 6: 'shape, fuel and wish list set aside' };

  /* The fallback ladder: strict forecourt first, then one step wider at a
     time, labelling every step. It always ends with cars. */
  function findMatches(a) {
    var res = [], seen = {}, levels = [];
    function add(pool, R, lvl, limit) {
      var c = pool.filter(function (x) { return !seen[x.id] && matches(x, a, R); }).map(function (x) { return evaluate(x, a); });
      var got = pick(c, Math.max(0, limit - res.length), a, res);
      got.forEach(function (r) { r.level = lvl; seen[r.c.id] = 1; res.push(r); });
      if (got.length && levels.indexOf(lvl) === -1) levels.push(lvl);
    }
    var nHome = countIn(HOME, a, {}), nGroup = groupOK ? countIn(GROUP, a, {}) : 0;
    add(HOME, {}, 0, 5);
    if (res.length < 3 && groupOK) add(GROUP, {}, 1, 5);
    var R = {};
    if (res.length < 3 && hasCeiling(a)) { R = { stretch: 0.1 }; add(HOME, R, 2, 3); add(GROUP, R, 2, 3); }
    if (res.length < 3 && a.fuel.length) { R = Object.assign({}, R, { fuelN: true }); add(HOME, R, 3, 3); add(GROUP, R, 3, 3); }
    if (res.length < 3 && a.body.length) { R = Object.assign({}, R, { bodyN: true }); add(HOME, R, 4, 3); add(GROUP, R, 4, 3); }
    if (res.length < 3 && a.extras.indexOf('seven') !== -1) { R = Object.assign({}, R, { noSeven: true }); add(HOME, R, 5, 3); add(GROUP, R, 5, 3); }
    if (res.length < 3) add(HOME, { anyShape: true, anyFuel: true, noSeven: true }, 6, 3);
    if (res.length < 3) {
      var newest = HOME.filter(function (x) { return !seen[x.id]; })
        .sort(function (x, y) { return y._year - x._year || x._miles - y._miles; });
      newest.slice(0, 3 - res.length).forEach(function (x) { var r = evaluate(x, a); r.level = 6; seen[x.id] = 1; res.push(r); });
      if (levels.indexOf(6) === -1) levels.push(6);
    }
    var level = levels.length ? Math.max.apply(null, levels) : 0;
    var useGroup = levels.indexOf(1) !== -1 || res.some(function (r) { return !r.c._home; });
    /* See all: the strict filters only, so the number equals stock.html's */
    var seeN = countIn(HOME, a, { strictQuotes: true }) + (useGroup && groupOK ? countIn(GROUP, a, { strictQuotes: true }) : 0);
    return { list: res, level: level, levels: levels, nHome: nHome, nGroup: nGroup, useGroup: useGroup,
      seeN: seeN, seeUrl: seeAllUrl(a, useGroup) };
  }

  function seeAllUrl(a, all) {
    var p = [];
    if (a.body.length) {
      var b = []; a.body.forEach(function (v) { byV(BODY, v).stock.forEach(function (k) { if (b.indexOf(k) === -1) b.push(k); }); });
      p.push('body=' + b.join(','));
    }
    if (a.fuel.length) {
      var f = []; a.fuel.forEach(function (v) { byV(FUEL, v).keys.forEach(function (k) { if (f.indexOf(k) === -1) f.push(k); }); });
      p.push('fuel=' + f.join(','));
    }
    if (a.pay === 'monthly') {
      if (a.dep !== null) p.push('dep=' + a.dep);
      if (a.mo > 0) p.push('mo=' + a.mo);
      p.push('sort=monthly-asc');
    }
    if (a.pay === 'cash' && a.cash > 0) p.push('price=' + CASH_BANDS[a.cash]);
    if (a.extras.indexOf('seven') !== -1) p.push('seats=7');
    if (all) p.push('all=1');
    p.push('from=fmb');
    return 'https://dan-sells.co.uk/stock.html?' + p.join('&');
  }

  /* ---------------- brand new stock ---------------- */
  /* Dan, 8 October: a new or either buyer should see brand new cars that fit,
     and nothing frightening when none do. The cars are lookup/new-stock.json.
     BMW quotes every one at 4,500 pounds down (BMW Select PCP, 48 months).
     For MATCHING ONLY, each 1,000 pounds more deposit takes 24 pounds a month
     off and each 1,000 less adds 24, pro rata (Dan's rule of thumb):
       estimate = quoted monthly - 24 x (their deposit - 4,500) / 1,000
     That estimate is never shown to the customer, and nor is the quoted
     monthly: the locator gives no optional final payment, total payable or
     mileage, so no representative example can go with it (CLAUDE.md, new
     cars). Cards show the cash price and offer a personalised quote; the
     figures go to Dan in the lead email only. */
  var NEW_QUOTE_DEP = 4500, NEW_PER_1000 = 24;
  var NEWC = [], newOK = false, NEWRES = { list: [], count: 0 };
  var NEW_FUEL = { petrol: 'petrol', diesel: 'diesel', phev: 'phev', electric: 'electric' };
  function newBody(c) {
    var d = String(c.description || ''), s = String(c.series || '');
    if (/gran\s*coup/i.test(d)) return 'Coupe';        /* bodyKeys reads gran coupe off the name */
    if (/coup/i.test(d)) return 'Coupe';
    if (/saloon/i.test(d)) return 'Saloon';
    if (s === '1 Series') return 'Hatchback';
    if (/^[3578] Series$/.test(s) && !/touring/i.test(d)) return 'Saloon';
    return '';
  }
  function stampNew(c) {
    c._new = true;
    c._bodies = ST.bodyKeys({ model: c.description, series: c.series, body: newBody(c) });
    c._prim = ST.bodyPrimary({ model: c.description, series: c.series, body: newBody(c) });
    c._fuel = NEW_FUEL[String(c.fuel || '').toLowerCase()] || ST.fuelKey(c);
    c._price = c.price_gbp || ST.num(c.price);
    c._quoted = parseFloat(String(c.monthly || '').replace(/[^0-9.]/g, '')) || 0;
    return c;
  }
  function wantsNew(a) { a = a || A; return a.interest === 'new' || a.interest === 'either'; }
  /* matching only, never displayed */
  function newEstimate(c, dep) {
    if (!c._quoted) return null;
    var d = dep === null || dep === undefined ? NEW_QUOTE_DEP : dep;
    return Math.round((c._quoted - NEW_PER_1000 * (d - NEW_QUOTE_DEP) / 1000) * 100) / 100;
  }
  function newFits(c, a) {
    if (a.body.length && !bodyHit(c, a.body)) return false;
    if (a.fuel.length && !fuelHit(c, a.fuel)) return false;
    if (a.extras.indexOf('seven') !== -1 && String(c.seats) !== '7') return false;
    if (a.pay === 'monthly' && a.mo > 0) {
      var est = newEstimate(c, a.dep);
      return est !== null && est <= a.mo;
    }
    if (a.pay === 'cash' && a.cash > 0) return c._price > 0 && c._price < a.cash;
    return true;
  }
  /* Colour they asked for first, then the soonest here, then the lower price.
     One of each model before any repeats, so three identical X3s never fill it. */
  function findNew(a) {
    if (!wantsNew(a)) return { list: [], count: 0 };
    var fit = NEWC.filter(function (c) { return newFits(c, a); });
    fit.sort(function (x, y) {
      var cx = a.colours.indexOf(x.colour) !== -1 ? 0 : 1, cy = a.colours.indexOf(y.colour) !== -1 ? 0 : 1;
      return cx - cy || (x.lead_time_weeks_max || 99) - (y.lead_time_weeks_max || 99) || x._price - y._price;
    });
    var out = [], seen = {};
    fit.forEach(function (c) { if (out.length < 3 && !seen[c.description]) { seen[c.description] = 1; out.push(c); } });
    fit.forEach(function (c) { if (out.length < 3 && out.indexOf(c) === -1) out.push(c); });
    return { list: out.map(function (c) { return { c: c, est: newEstimate(c, a.pay === 'monthly' ? a.dep : null) }; }), count: fit.length };
  }
  function newWhen(c) {
    var x = c.lead_time_weeks_min, y = c.lead_time_weeks_max;
    if (!y) return '';
    return x && x !== y ? 'Here in ' + x + ' to ' + y + ' weeks' : 'Here in ' + y + ' weeks';
  }
  function newWhy(c, a) {
    var out = ['brand new, already built'];
    if (a.body.length && bodyHit(c, a.body)) out.push(shapeName(c));
    if (a.fuel.length && fuelHit(c, a.fuel)) out.push(FUEL_NAME[c._fuel]);
    if (a.colours.length && a.colours.indexOf(c.colour) !== -1) out.push('in ' + c.colour);
    if (a.extras.indexOf('seven') !== -1 && String(c.seats) === '7') out.push('7 seats');
    if (a.pay === 'cash' && a.cash > 0) out.push(a.cash === 20000 ? 'under ' + GBP + '20k' : 'under your ' + GBP + (a.cash / 1000) + 'k');
    if (a.pay === 'monthly' && a.mo > 0) out.push('should suit your monthly budget, confirmed with a personalised quote');
    return cap1(out.join(', '));
  }
  function newLine(c) {
    return 'Brand new ' + c.description + (c.colour ? ', ' + c.colour : '') + ', ' + (c.price || 'price on request') + ', order ' + c.order_number;
  }

  /* ---------------- words ---------------- */
  function list(arr, word) {
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ' ' + word + ' ' + arr[arr.length - 1];
  }
  function shapeName(c) {
    var map = { suv: 'SUV', saloon: 'Saloon', touring: 'Touring', hatchback: 'Hatchback', mpv: 'MPV',
      gran_coupe: 'Gran Coup\u00e9', coupe: 'Coup\u00e9', convertible: 'Convertible', suv_coupe: 'SUV coup\u00e9' };
    return map[c._prim] || c.body || 'Another shape';
  }
  function persona(a) {
    var openAll = (!a.life || a.life === 'open') && !a.body.length && !a.fuel.length &&
      (!a.pay || a.pay === 'notsure') && !a.extras.length && !a.colours.length;
    var onlyPlug = a.fuel.length && a.fuel.every(function (f) { return f === 'electric' || f === 'phev'; });
    var onlyStyle = a.body.length && a.body.every(function (b) { return b === 'coupe' || b === 'gran_coupe' || b === 'convertible'; });
    if (openAll) return ['The Open Road Optimist', 'Open to anything, which means more great cars to choose from.'];
    if (a.fuel.indexOf('electric') !== -1 && a.life === 'thrill') return ['The Silent Assassin', 'You want fast, quiet and clever.'];
    if (a.life === 'thrill') return ['The B Road Hunter', 'You buy with your right foot. Feel first, figures second.'];
    if (a.life === 'family') return ['The Weekend Warrior', 'Room for everyone and everything, and still a proper BMW to drive.'];
    if (a.life === 'miles') return ['The Mile Muncher', 'Long days on the road. Comfort is the whole point.'];
    if (onlyPlug) return ['The Future Proofer', 'You\u2019ve done the reading and you\u2019re ready to plug in.'];
    if (a.life === 'style' || onlyStyle) return ['The Head Turner', 'Shape matters. You want people to look twice.'];
    if (a.life === 'commute') return ['The Smooth Operator', 'Calm, quick and comfortable, every single day.'];
    return ['The Smart Chooser', 'You know what you like and you want it done properly.'];
  }
  function extraWord(k) {
    if (k === 'xdrive') return 'xDrive';
    if (k === 'sound') return 'Harman Kardon or better';
    return ST.FEATURES[k].label.toLowerCase();
  }
  /* Built only from asks the car really meets, then two plain facts if
     nothing was stated. No range, economy or reliability claims. */
  function whyLine(r, a) {
    var c = r.c, out = [];
    if (a.body.length && bodyHit(c, a.body)) out.push(shapeName(c));
    if (a.fuel.length && fuelHit(c, a.fuel)) out.push(FUEL_NAME[c._fuel]);
    if (hasCeiling(a) && budgetMet(c, a, 0)) {
      out.push(a.pay === 'monthly' ? (r.fin ? 'inside your ' + money(a.mo) + ' a month' : 'priced like the cars inside your ' + money(a.mo) + ' a month')
        : (a.cash === 20000 ? 'under ' + GBP + '20k' : 'under your ' + GBP + (a.cash / 1000) + 'k'));
    }
    if (a.colours.length && a.colours.indexOf(c.colour) !== -1) out.push('in ' + c.colour);
    r.metExtras.forEach(function (k) { out.push(extraWord(k)); });
    if (a.extras.indexOf('seven') !== -1 && String(c.seats) === '7') out.push('7 seats');
    if (a.life === 'family' && Number(c.seats) >= 5 && (c._bodies.indexOf('suv') !== -1 || c._bodies.indexOf('touring') !== -1)) out.push('room for the family');
    if (a.life === 'thrill' && c._hp && (c._m || c._hp >= 250)) out.push(c._hp + 'hp under your right foot');
    if (!out.length) {
      if (c._year) out.push(c._year + ' plate');
      if (c._miles) out.push(c._miles.toLocaleString('en-GB') + ' miles');
    }
    return cap1(out.slice(0, 4).join(', '));
  }
  function modelName(c) { return String(c.model || '').replace(/^BMW\s+/i, ''); }
  function budgetLine(a) {
    if (a.pay === 'monthly') {
      var dep = a.dep === null ? ', not sure on deposit' : ' with ' + money(a.dep) + ' down';
      return a.mo > 0 ? 'Up to ' + money(a.mo) + ' a month' + dep : 'No monthly limit' + dep;
    }
    if (a.pay === 'cash') {
      if (!(a.cash > 0)) return 'Any price';
      return (a.cash === 20000 ? 'Under ' : 'Up to ') + GBP + (a.cash / 1000) + 'k in total';
    }
    return 'Not sure on budget yet';
  }
  function extrasText(a) { return a.extras.map(function (k) { return ST.FEATURES[k].label; }).join(', '); }
  function shapesText(a) { return a.body.length ? list(a.body.map(function (v) { return byV(BODY, v).t; }), 'or') : 'Open minded on shape'; }
  function fuelsText(a) { return a.fuel.length ? list(a.fuel.map(function (v) { return byV(FUEL, v).t; }), 'or') : 'Open minded on fuel'; }
  function interestText(a) { return { 'new': 'A brand new BMW, either a factory order to my spec or a new car in stock that may be ready sooner', used: 'An approved used BMW', either: 'Brand new or approved used. Brand new could be a factory order to my spec or a new car in stock that may be ready sooner' }[a.interest] || ''; }
  function lifeText(a) { var o = byV(LIFE, a.life); return o ? o.t : ''; }
  function whenText(a) { var o = byV(WHEN, a.when); return o ? o.t : ''; }
  function carLine(r) {
    var c = r.c;
    return (c.year ? c.year + ' ' : '') + c.model + ', reg ' + (c.reg || 'not listed') + ', ' + c.price
      + (r.fin ? ', ' + money2(r.fin.monthly) + ' a month with ' + money(r.fin.deposit) + ' down' : ', ask for a quote');
  }

  /* ---------------- WhatsApp ---------------- */
  var RESULT = null, SHOWN = [];
  function waText(liked, listOverride, likedNew) {
    var SH = listOverride || SHOWN;
    var a = A, L = [];
    if (likedNew) L.push('Hi Dan, I like the look of this brand new one:', newLine(likedNew.c), 'From Find my BMW.', '');
    else if (liked) L.push('Hi Dan, I like the look of this one:', carLine(liked), 'From Find my BMW.', '');
    else L.push('Hi Dan, I\u2019ve just done Find my BMW.', '');
    L.push('What I\u2019m after:');
    if (A.interest) L.push(interestText(A));
    if (a.life) L.push(lifeText(a));
    L.push(shapesText(a), fuelsText(a), budgetLine(a));
    if (a.colours.length) L.push(list(a.colours, 'or'));
    if (a.extras.length) L.push('Wish list: ' + extrasText(a));
    if (a.when) L.push('Timing: ' + whenText(a));
    var tail = [];
    if (liked) { var rank = SH.indexOf(liked) + 1; if (rank) tail.push('I like number ' + rank + ' the most (' + liked.c.reg + ').'); }
    var pxl = pxLine(); if (pxl) tail.push(pxl);
    if (RESULT && RESULT.level >= 2) tail.push('Nothing matched exactly, so I\u2019d love your help finding one.');
    var mt = [];
    if (NEWRES.list.length) {
      mt.push('', 'Brand new ones that fit:');
      NEWRES.list.forEach(function (r) { mt.push(newLine(r.c)); });
    }
    if (SH.length) {
      mt.push('', 'My top matches:');
      SH.forEach(function (r, i) { mt.push((i + 1) + '. ' + carLine(r)); });
    }
    var text = L.concat(mt, tail.length ? [''] : [], tail).join('\n');
    /* keep it under about 1,500 characters: drop matches from the bottom first */
    while (text.length > 1500 && mt.length > 3) { mt.pop(); text = L.concat(mt, tail.length ? [''] : [], tail).join('\n'); }
    return text;
  }
  function waUrl(liked) { return WA + '?text=' + encodeURIComponent(waText(liked)); }

  /* ---------------- question screens ---------------- */
  var TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var Q = {
    qi: { n: 1, h: 'New or approved used?', hint: 'Pick one' },
    q1: { n: 1, h: 'First things first. What\u2019s this BMW for?', hint: 'Pick one' },
    q2: { n: 2, h: 'Which shapes catch your eye?', hint: 'Pick any' },
    q3: { n: 3, h: 'What should power it?', hint: 'Pick any' },
    q4: { n: 4, h: 'What feels comfortable?', hint: 'Rough is fine. Nothing here commits you to anything.' },
    q5: { n: 5, h: 'Anything on your wish list?', hint: 'Pick any. These help me rank your matches. Only 7 seats rules cars out.' },
    q6: { n: 6, h: 'Any colours you love?', hint: 'Pick any. I\u2019ll never rule out a great car over paint.' },
    qp: { n: 8, h: 'Got a car to part exchange?', hint: 'Pick one. If it\u2019s a yes, I\u2019ll ask a few quick things about it next.' },
    q7: { n: 7, h: 'Last one. When would you like to be driving it?', hint: 'Pick one' }
  };
  QS.forEach(function (q, i) { Q[q].n = i + 1; });
  var NQ = QS.length;
  function opt(q, type, v, t, l, ico, cls) {
    return '<label class="fmb-opt' + (cls ? ' ' + cls : '') + '" data-v="' + esc(v) + '">'
      + '<input type="' + type + '" name="' + q + '" value="' + esc(v) + '"/>'
      + '<span class="fmb-opt-in">' + (ico ? '<span class="fmb-ico">' + ico + '</span>' : '')
      + '<span class="fmb-txt"><span class="fmb-t">' + esc(t) + '</span>'
      + (l ? '<span class="fmb-l">' + esc(l) + '</span>' : '')
      + '</span>'
      + '<span class="fmb-tick">' + TICK + '</span></span></label>';
  }
  function chip(name, v, t, small) {
    return '<label class="fmb-chip" data-v="' + esc(v) + '"><input type="radio" name="' + name + '" value="' + esc(v) + '"/>'
      + '<span>' + esc(t) + '</span></label>';
  }
  function qWrap(q, inner, after) {
    var d = Q[q];
    return '<section class="fmb-screen" data-s="' + q + '" id="s-' + q + '" hidden>'
      + '<fieldset aria-describedby="' + q + '-hint"><legend id="' + q + '-h" tabindex="-1"><h1>' + esc(d.h) + '</h1></legend>'
      + '<p class="fmb-hint" id="' + q + '-hint">' + esc(d.hint) + '</p>'
      + '<p class="fmb-prefill" data-pre="' + q + '" hidden>I\u2019ve filled this in from the page you came from. Change it if you like.</p>'
      + inner + '</fieldset>' + (after || '') + '</section>';
  }
  function buildQuestions() {
    var h = '';
    h += qWrap('qi', '<div class="fmb-opts">' + INTEREST.map(function (o) { return opt('qi', 'radio', o.v, o.t, o.l, ''); }).join('') + '</div>');
    h += qWrap('q1', '<div class="fmb-opts">' + LIFE.map(function (o) { return opt('q1', 'radio', o.v, o.t, o.l, SVG[o.v]); }).join('') + '</div>');
    h += qWrap('q2', '<div class="fmb-opts two shapes">' + BODY.map(function (o) {
      return opt('q2', 'checkbox', o.v, o.t, o.l, o.v === 'open' ? SVG.open : SIL[o.v], o.v === 'open' ? 'open' : '');
    }).join('') + '</div>');
    h += qWrap('q3', '<div class="fmb-opts">' + FUEL.map(function (o) {
      return opt('q3', 'checkbox', o.v, o.t, o.l, '', o.v === 'open' ? 'open' : '');
    }).join('') + '</div>', '<p class="fmb-helper">Not sure? Pick Open minded and I\u2019ll talk you through the differences.</p>');
    h += qWrap('q4',
      '<div class="fmb-seg" role="radiogroup" aria-label="How you\u2019d like to pay">'
      + chip('pay', 'monthly', 'A monthly figure') + chip('pay', 'cash', 'A total price') + chip('pay', 'notsure', 'Not sure yet') + '</div>'
      + '<div id="q4m" hidden>'
      + '<fieldset><legend class="fmb-sub">Up to how much a month?</legend><div class="fmb-chips" id="q4mo">'
      + MONTHLY.map(function (m) { return chip('mo', String(m), m ? money(m) : 'No limit', true); }).join('') + '</div></fieldset>'
      + '<fieldset><legend class="fmb-sub">Anything to put down?</legend><div class="fmb-chips" id="q4dep">'
      + DEPS.map(function (d) { return chip('dep', String(d), d < 0 ? 'Not sure' : money(d), true); }).join('') + '</div></fieldset>'
      + '<p class="fmb-helper">Figures are BMW Financial Services\u2019 own quotes over 48 months at 8,000 miles a year. The full representative example is on each car.</p>'
      + '<p class="fmb-helper" id="q4low" hidden>The lender is quoting fewer cars than usual today, so I\u2019ll match on price as well.</p>'
      + '</div>'
      + '<div id="q4c" hidden><fieldset><legend class="fmb-sub">Up to how much in total?</legend><div class="fmb-chips" id="q4cash">'
      + CASH.map(function (c) { return chip('cash', String(c.v), c.t, true); }).join('') + '</div></fieldset></div>'
      + '<p class="fmb-helper" id="q4n" hidden>No problem. I\u2019ll show you a good spread and we can work out the numbers together.</p>');
    h += qWrap('q5', '<div class="fmb-opts two">' + EXTRAS.map(function (k) {
      return opt('q5', 'checkbox', k, ST.FEATURES[k].label, '', '');
    }).join('') + opt('q5', 'checkbox', 'open', 'Not fussed', '', '', 'open') + '</div>');
    h += qWrap('q6', '<div class="fmb-opts two swatches" id="q6opts"></div>');
    h += qWrap('qp', '<div class="fmb-opts">' + PXQ.map(function (o) { return opt('qp', 'radio', o.v, o.t, o.l, ''); }).join('') + '</div>');
    h += qWrap('q7', '<div class="fmb-opts">' + WHEN.map(function (o) { return opt('q7', 'radio', o.v, o.t, '', SVG.clock); }).join('') + '</div>');
    $('fmbQuestions').innerHTML = h;
  }
  /* A fixed list in a fixed order. It used to be the forecourt's own colours,
     most stocked first, which is the stock leading the answer. */
  var COLOURS = ['Black', 'White', 'Grey', 'Silver', 'Blue', 'Red', 'Green'];
  function colourOptions() {
    var order = COLOURS;
    var box = $('q6opts');
    if (box.getAttribute('data-built') === String(order.length)) return;
    box.innerHTML = order.map(function (col) {
      var sw = '<span class="fmb-sw" style="background:' + (SWATCH[col.toLowerCase()] || '#777') + '"></span>';
      return opt('q6', 'checkbox', col, col, '', sw);
    }).join('') + opt('q6', 'checkbox', 'open', 'Open minded', '', SVG.open, 'open');
    box.setAttribute('data-built', String(order.length));
    syncInputs('q6');
  }

  /* reflect A into the inputs (used on resume, back and pre fill) */
  function syncInputs(q) {
    var s = $('s-' + q); if (!s) return;
    var vals = [];
    if (q === 'qp') vals = [A.px]; else if (q === 'qi') vals = [A.interest]; else if (q === 'q1') vals = [A.life]; else if (q === 'q7') vals = [A.when];
    else if (MULTI[q]) vals = OPEN[q] ? ['open'] : A[MULTI[q]];
    s.querySelectorAll('input[name=' + q + ']').forEach(function (i) { i.checked = vals.indexOf(i.value) !== -1; });
    if (q === 'q4') {
      s.querySelectorAll('input[name=pay]').forEach(function (i) { i.checked = i.value === A.pay; });
      s.querySelectorAll('input[name=mo]').forEach(function (i) { i.checked = A.mo !== null && i.value === String(A.mo); });
      s.querySelectorAll('input[name=dep]').forEach(function (i) {
        i.checked = depTouched && (A.dep === null ? i.value === '-1' : i.value === String(A.dep));
      });
      s.querySelectorAll('input[name=cash]').forEach(function (i) { i.checked = A.cash !== null && i.value === String(A.cash); });
      q4Panels();
    }
  }
  function q4Panels() {
    $('q4m').hidden = A.pay !== 'monthly';
    $('q4c').hidden = A.pay !== 'cash';
    $('q4n').hidden = A.pay !== 'notsure';
    $('q4low').hidden = !(A.pay === 'monthly' && lowCov());
  }

  /* ---------------- no stock counts in the questions ----------------
     Dan, 8 October: "the customers choices should be theirs, not led by our
     stock". No counts on the tiles, no "X cars match" bar, no forecourt total
     on the intro and no stock led nudges. Counts are still worked out
     silently for the fmb_zero_match and fmb_answer events. */
  /* nothing on screen: only the zero match event, for Dan's reports */
  var lastN = null, zeroSent = {};
  function counter() {
    if (!snapOK) return;
    var n = countIn(HOME, A, {});
    if (n === 0 && lastN !== 0 && lastN !== null && QS.indexOf(cur) !== -1 && !zeroSent[cur]) {
      zeroSent[cur] = 1; track('fmb_zero_match', { step: Q[cur].n, step_name: STEP_NAME[cur] });
    }
    lastN = n;
  }
  /* Dan, 8 October: every answer has to be the customer's own tap. Nothing is
     pre selected, there is no Skip, and Continue stays off until they choose
     (each question has an Open minded, Not fussed or Not sure tap for anyone
     with no preference). The old design otherwise: no extra prompt, the
     question's own hint line does the talking. needs() is the one rule for the
     button and for next(), so Enter cannot get round it either. */
  function needs(q) {
    if (q === 'qi') return A.interest ? '' : 'Tap new, used or either to carry on';
    if (q === 'q1') return A.life ? '' : 'Tap the one that fits best to carry on';
    if (q === 'qp') return A.px ? '' : 'Tap Yes, No or Maybe to carry on';
    if (q === 'q7') return A.when ? '' : 'Tap when you would like it to carry on';
    if (q === 'q4') {
      if (!A.pay) return 'Tap how you would like to pay to carry on';
      if (A.pay === 'monthly' && A.mo === null) return 'Tap your monthly budget to carry on';
      if (A.pay === 'monthly' && !depTouched) return 'Now tap a deposit, or Not sure';
      if (A.pay === 'cash' && A.cash === null) return 'Tap your total budget to carry on';
      return '';
    }
    if (MULTI[q] && !(A[MULTI[q]].length || OPEN[q])) {
      return { q2: 'Tap a shape, or Open minded', q3: 'Tap a fuel, or Open minded',
        q5: 'Tap anything you want, or Not fussed', q6: 'Tap a colour, or Open minded' }[q];
    }
    return '';
  }
  function nextLabel() {
    var b = $('fmbNext'), q = cur, need = needs(q);
    b.textContent = q === 'q7' ? 'Show my matches' : 'Continue';
    b.disabled = !!need;
  }
  function refresh() {
    if (QS.indexOf(cur) !== -1) {
      if (cur === 'q6') colourOptions();
      if (cur === 'q4') q4Panels();
      counter(); nextLabel();
    }
  }

  /* ---------------- answering ---------------- */
  var autoT = null;
  function onChange(e) {
    var i = e.target; if (!i || !i.name) return;
    var q = i.name, v = i.value;
    if (q === 'qi' && (v === 'new' || v === 'either')) want('newc');
    if (q === 'qi') A.interest = v;
    else if (q === 'qp') A.px = v;
    else if (q === 'q1') A.life = v;
    else if (q === 'q7') A.when = v;
    else if (MULTI[q]) {
      var s = $('s-' + q), boxes = s.querySelectorAll('input[name=' + q + ']');
      if (v === 'open' && i.checked) boxes.forEach(function (b) { if (b.value !== 'open') b.checked = false; });
      if (v !== 'open' && i.checked) boxes.forEach(function (b) { if (b.value === 'open') b.checked = false; });
      var on = []; boxes.forEach(function (b) { if (b.checked && b.value !== 'open') on.push(b.value); });
      A[MULTI[q]] = on;
      OPEN[q] = !on.length && !!s.querySelector('input[value=open]:checked');
      if (i.checked && !RM && navigator.vibrate && /Android/i.test(navigator.userAgent)) { try { navigator.vibrate(8); } catch (x) {} }
    }
    else if (q === 'pay') {
      A.pay = v;
      if (v !== 'monthly') { A.mo = null; A.dep = null; depTouched = false; }
      if (v !== 'cash') A.cash = null;
      syncInputs('q4');
      if (v === 'monthly') want('lad');
    }
    else if (q === 'mo') A.mo = Number(v);
    else if (q === 'dep') { var d = Number(v); A.dep = d < 0 ? null : d; depTouched = true; if (d >= 0) want('lad'); }
    else if (q === 'cash') A.cash = Number(v);
    else return;
    save();
    refresh();
  }
  /* Q1 and Q7 move on by themselves after a pointer tap (not on arrow keys,
     which change radios as people move through them). */
  function onClick(e) {
    var lab = e.target.closest && e.target.closest('.fmb-opt');
    if (!lab || !e.detail) return;
    var inp = lab.querySelector('input');
    if (!inp || (inp.name !== 'qi' && inp.name !== 'qp' && inp.name !== 'q1' && inp.name !== 'q7')) return;
    clearTimeout(autoT);
    autoT = setTimeout(function () { if (cur === inp.name) next(); }, 300);
  }

  /* ---------------- navigation ---------------- */
  var ORDER = ['intro'].concat(QS, ['matching', 'reveal']);
  function screenEl(s) { return s === 'intro' ? $('s-intro') : $('s-' + s); }
  function show(s, back) {
    var prev = cur;
    document.querySelectorAll('.fmb-screen').forEach(function (el) { el.hidden = true; el.classList.remove('fmb-anim-in', 'back'); });
    var el = screenEl(s); if (!el) { s = 'intro'; el = $('s-intro'); }
    cur = s;
    el.hidden = false;
    void el.offsetWidth; el.classList.add('fmb-anim-in'); if (back) el.classList.add('back');
    var qi = QS.indexOf(s);
    $('fmbProg').hidden = qi === -1;
    $('fmbBar').hidden = qi === -1;
    document.body.classList.toggle('wide', s === 'reveal');
    if (qi !== -1) {
      var pct = Math.round(100 * (qi + 1) / (NQ + 2));
      $('fmbFill').style.width = pct + '%';
      $('fmbCar').style.left = pct + '%';
      $('fmbStepTxt').textContent = (qi + 1) + ' of ' + NQ;
      document.title = 'Find my BMW | Question ' + (qi + 1) + ' of ' + NQ + ' | Dan Sells';
      syncInputs(s);
      var pre = el.querySelector('[data-pre]'); if (pre) pre.hidden = !PRE[s];
      lastN = null;
      refresh();
      if (prev !== s) track('fmb_step_' + (qi + 1), { step: qi + 1, step_name: STEP_NAME[s] });
      if (s === 'q4' || s === 'q5') { want('lad'); want('det'); want('group'); }
    } else if (s === 'reveal') {
      document.title = 'Your BMW matches | Find my BMW | Dan Sells';
    } else if (s === 'matching') {
      document.title = 'Finding your matches | Find my BMW | Dan Sells';
    } else {
      document.title = 'Find my BMW | Real cars that fit you | Dan Sells';
    }
    var f = qi !== -1 ? $(s + '-h') : (s === 'reveal' ? ($('fmbSent').hidden ? $('personaH') : $('fmbSent')) : (s === 'matching' ? $('matchH') : null));
    if (f) { try { f.focus({ preventScroll: true }); } catch (x) { f.focus(); } }
    window.scrollTo(0, 0);
    if (qi !== -1 || s === 'reveal') save(s);
  }
  function go(s, back) {
    if (s !== cur) {
      var url = s === 'intro' ? location.pathname + location.search : '#' + s;
      if (s === 'matching') history.replaceState({ s: s }, '', '#matching');
      else history.pushState({ s: s }, '', url);
    }
    show(s, back);
  }
  function answerTrack(q) {
    var vals = q === 'qp' ? [A.px || ''] : q === 'qi' ? [A.interest || ''] : q === 'q1' ? [A.life || ''] : q === 'q7' ? [A.when || ''] : q === 'q4'
      ? [A.pay || 'skipped', A.mo === null ? '' : (A.mo ? 'mo' + A.mo : 'nolimit'), A.pay === 'monthly' ? (A.dep === null ? 'dep_notsure' : 'dep' + A.dep) : '', A.cash === null ? '' : 'cash' + A.cash]
      : (OPEN[q] ? ['open'] : A[MULTI[q]]);
    var open = q === 'qp' ? A.px === 'maybe' : q === 'qi' ? A.interest === 'either' : q === 'q4' ? (!A.pay || A.pay === 'notsure') : MULTI[q] ? !A[MULTI[q]].length : (q === 'q1' && (!A.life || A.life === 'open'));
    track('fmb_answer', { step: Q[q].n, step_name: STEP_NAME[q], answer: vals.filter(Boolean).join(',') || 'skipped',
      open_minded: open ? 'yes' : 'no', match_count: snapOK ? countIn(HOME, A, {}) : -1 });
  }
  function next() {
    var qi = QS.indexOf(cur);
    if (qi === -1) return;
    if (needs(cur)) { nextLabel(); return; }
    answerTrack(cur);
    if (qi < QS.length - 1) go(QS[qi + 1]);
    else runMatching();
  }
  function back() {
    var qi = QS.indexOf(cur);
    track('fmb_back', { from_step: qi + 1 });
    if (qi > 0) go(QS[qi - 1], true); else go('intro', true);
  }

  /* ---------------- matching moment ---------------- */
  function waitData(ms) {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function tick() {
        if ((snapOK !== null && finOK && ladOK && DET !== null && (groupOK || lazySettled.group) && (!wantsNew() || newOK)) || Date.now() - t0 > ms) return res();
        setTimeout(tick, 80);
      })();
    });
  }
  var lazySettled = {};
  function runMatching(quick) {
    want('lad'); want('group'); want('det'); if (wantsNew()) want('newc');
    lazy.group.then(function () { lazySettled.group = 1; }, function () { lazySettled.group = 1; });
    go('matching');
    var L = $('fmbMLines');
    var lines = ['Checking the cars on my forecourt', 'Matching shape and fuel',
      'Checking the lender\u2019s latest figures', 'Picking your top three'];
    if (wantsNew()) lines.splice(3, 0, 'Checking brand new stock');
    L.innerHTML = lines.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    var dur = quick ? 200 : (RM ? 300 : 1600);
    L.querySelectorAll('li').forEach(function (li, i) { setTimeout(function () { li.classList.add('on'); }, RM ? 0 : i * (dur / 4)); });
    var t0 = Date.now();
    waitData(5000).then(function () {
      compute();
      setTimeout(function () {
        if (cur === 'matching') { history.replaceState({ s: 'reveal' }, '', '#reveal'); show('reveal'); present(); }
      }, Math.max(0, dur - (Date.now() - t0)));
    });
  }
  function compute() {
    NEWRES = findNew(A);
    if (!snapOK) { RESULT = null; return; }
    RESULT = findMatches(A);
    moreShown = false; revealTracked = false;
    SHOWN = RESULT.list.slice(0, 3);
    RESULT.list.forEach(function (r) {
      r.why = whyLine(r, A);
      r.relaxed = r.level >= 2 ? RELAX[r.level] : (r.level === 1 ? 'group stock' : '');
    });
  }
  function photo(c) { var p = FN.photos(c, DET ? DET[c.id] : null); return p[0] || c.image || ''; }

  /* ---------------- reveal ---------------- */
  function finBlock(r) {
    var f = r.fin, c = r.c;
    if (!f) return '<p class="fmb-quote">Ask for a quote on this one.</p>';
    var rows = [
      ['Monthly payment (' + f.payments + ' payments)', money2(f.monthly)],
      ['Cash price', money(f.price)],
      ['Customer deposit', money2(f.deposit)],
      ['Total amount of credit', money2(f.credit)],
      ['Optional final payment', money2(f.final_payment)],
      ['Total amount payable', money2(f.total_payable)],
      ['Duration', f.term + ' months'],
      ['Annual mileage', Number(f.annual_mileage).toLocaleString('en-GB') + ' miles'],
      ['Excess mileage', f.excess_pence + 'p per mile'],
      ['APR representative', f.apr + '%']
    ];
    void c;
    return '<div class="fmb-fin" aria-label="Representative example">'
      + '<div class="fmb-fin-h">Representative example &middot; ' + esc(f.product || 'PCP') + '</div>'
      + '<dl>' + rows.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>'
      + '<p>Lender ' + esc(f.lender) + '. Finance subject to status, 18+, UK residents.</p>'
      + (f.legal ? '<details><summary>Lender&rsquo;s full wording</summary><p>' + esc(f.legal) + '</p></details>' : '')
      + '</div>';
  }
  function card(r, i) {
    var c = r.c, u = photo(c), best = i === 0;
    var alt = (c.year ? c.year + ' ' : '') + modelName(c) + (c.colour ? ' in ' + c.colour : '');
    var showPct = r.pct != null && r.pct >= 30 && (r.soft > 0 || r.level >= 2 || r.miss.length);
    var flags = r.miss.map(function (m) { return '<span class="fmb-flag">' + esc(m) + '</span>'; });
    if (!c._home) flags.push('<span class="fmb-flag grp">From our other BMW stock</span>');
    return '<article class="fmb-card' + (best ? ' best' : '') + (RM ? '' : ' rise') + '" style="animation-delay:' + (i * 90) + 'ms" data-i="' + i + '">'
      + '<div class="fmb-ph">' + (best ? '<span class="fmb-ribbon">Best match</span>' : '')
      + (showPct ? '<span class="fmb-pct' + (r.pct >= 80 ? ' hi' : '') + '">' + r.pct + '% match<i style="width:0" data-w="' + r.pct + '"></i></span>' : '')
      + (u ? '<img src="' + esc(u) + '" alt="' + esc(alt) + '" width="640" height="360" loading="' + (i < 3 ? 'eager' : 'lazy') + '" decoding="async"/>'
           : '<div class="sil">' + (SIL[c._prim] || SIL[c._bodies[0]] || SIL.saloon) + '</div>')
      + '</div><div class="fmb-cb">'
      + '<div class="fmb-pills">' + [c.year, c.reg, c.mileage].filter(Boolean).map(function (x) { return '<span>' + esc(String(x).replace(/\u00a0/g, ' ')) + '</span>'; }).join('') + '</div>'
      + '<h3>' + esc(modelName(c)) + '</h3>'
      + '<div class="fmb-price">' + esc(c.price || 'Price on request') + '</div>'
      + (flags.length ? '<div class="fmb-flags">' + flags.join('') + '</div>' : '')
      + (!c._home ? '<p class="fmb-grpline">I can source this one from across the group.</p>' : '')
      + '<p class="fmb-why"><b>Why it fits:</b> ' + esc(r.why) + '</p>'
      + finBlock(r)
      + '<a class="fmb-btn wa wide" data-like="' + i + '" href="' + esc(WA) + '" target="_blank" rel="noopener">I like this one</a>'
      + '</div></article>';
  }
  function findCard() {
    return '<div class="fmb-find' + (RM ? '' : ' fmb-card rise') + '"><h3>Want me to find the exact one?</h3>'
      + '<p>Tell me and I\u2019ll watch the incoming stock for you.</p>'
      + '<a class="fmb-btn wa wide" id="fmbFind" href="' + esc(WA) + '" target="_blank" rel="noopener">Find me one on WhatsApp</a></div>';
  }
  /* Brand new cards: the cash price and a personalised quote, the way
     new-cars.html shows them. No monthly figure, quoted or estimated. */
  function newCard(r, i) {
    var c = r.c, u = c.image || '', when = newWhen(c);
    var spec = [c.colour, c.fuel, c.drive === 'All Wheel' ? 'xDrive' : ''].filter(Boolean).join(' \u00b7 ');
    return '<article class="fmb-card fmb-newcard' + (RM ? '' : ' rise') + '" style="animation-delay:' + (i * 90) + 'ms" data-n="' + i + '">'
      + '<div class="fmb-ph">' + (u ? '<img src="' + esc(u) + '" alt="' + esc('Brand new ' + c.description + (c.colour ? ' in ' + c.colour : '')) + '" width="640" height="360" loading="eager" decoding="async"/>'
           : '<div class="sil">' + (SIL[c._prim] || SIL.saloon) + '</div>') + '</div>'
      + '<div class="fmb-cb">'
      + '<div class="fmb-pills"><span>Brand new</span>' + (when ? '<span>' + esc(when) + '</span>' : '') + '</div>'
      + '<h3>' + esc(c.description) + '</h3>'
      + (spec ? '<p class="fmb-newspec">' + esc(spec) + '</p>' : '')
      + '<div class="fmb-price">' + esc(c.price || 'Price on request') + '</div>'
      + '<p class="fmb-why"><b>Why it fits:</b> ' + esc(newWhy(c, A)) + '</p>'
      + '<p class="fmb-quote">Finance available. I\u2019ll send you a personalised quote with the full figures.</p>'
      + '<a class="fmb-btn wa wide" data-newlike="' + i + '" href="' + esc(WA) + '" target="_blank" rel="noopener">I like this one</a>'
      + '</div></article>';
  }
  function newSection() {
    var box = $('fmbNew');
    if (!box) return;
    if (!wantsNew() || !NEWRES.list.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = '<div class="fmb-narrow fmb-head"><h2>Brand new, already built, and a fit for you</h2>'
      + '<ul class="fmb-subs"><li>Unregistered BMWs available through Hedin Ruxley that match what you told me.'
      + (NEWRES.count > NEWRES.list.length ? ' I have ' + NEWRES.count + ' that fit, so I\u2019ll send you the rest.' : '') + '</li></ul></div>'
      + '<div class="fmb-cards">' + NEWRES.list.map(newCard).join('') + '</div>'
      + '<p class="fmb-print">Pictures are configurator renders of that specification. Prices and delivery times come from BMW and can change. Finance subject to status.</p>';
    box.hidden = false;
    box.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('error', function () {
        var c = NEWRES.list[Number(img.closest('[data-n]').getAttribute('data-n'))].c, d = document.createElement('div');
        d.className = 'sil'; d.innerHTML = SIL[c._prim] || SIL.saloon; img.replaceWith(d);
      }, { once: true });
    });
  }
  var moreShown = false;
  function reveal() {
    var subs = $('fmbSubs'), head = $('fmbHeadline'), cardsEl = $('fmbCards');
    var p = persona(A);
    $('personaH').textContent = p[0]; $('personaL').textContent = p[1];
    newSection();
    if (!RESULT || !RESULT.list.length) {
      head.textContent = 'I couldn\u2019t load today\u2019s stock just now.';
      subs.innerHTML = '<li>Send me your answers on WhatsApp and I\u2019ll pick some cars for you myself.</li>';
      cardsEl.innerHTML = '<div class="fmb-fail"><a class="fmb-btn wa wide" data-wa-main href="' + esc(WA) + '" target="_blank" rel="noopener">Send my answers on WhatsApp</a></div>';
      $('fmbMore').hidden = true; $('fmbSeeAll').hidden = true;
      return;
    }
    var R = RESULT, list = R.list, strict = R.nHome + (R.levels.indexOf(1) !== -1 ? R.nGroup : 0);
    var shownN = Math.min(list.length, moreShown ? 5 : 3);
    SHOWN = list.slice(0, shownN);
    if (R.level <= 1 && strict > 0) head.textContent = strict === 1 ? 'I found 1 BMW that fits you.' : 'I found ' + strict + ' BMWs that fit you.';
    else head.textContent = 'Nothing ticked every box today, so here are the closest.';
    var lines = [];
    if (R.level === 0) lines.push('<li>Here are my top ' + Math.min(3, list.length) + '.</li>');
    R.levels.filter(function (l) { return l > 0; }).sort().forEach(function (l) { lines.push('<li class="relax">' + esc(SUBS[l]) + '</li>'); });
    var widened = R.levels.filter(function (l) { return l >= 2; }).sort().map(function (l) { return RELAX[l]; });
    if (widened.length) lines.push('<li class="relax">What I widened: ' + esc(widened.join(', ')) + '.</li>');
    if (A.pay === 'monthly' && A.mo > 0 && !quotedAny) lines.push('<li>The lender isn\u2019t quoting any cars today, so I\u2019ve left the monthly budget out. Ask me for figures on any of them.</li>');
    else if (A.pay === 'monthly' && A.mo > 0 && lowCov()) lines.push('<li>The lender is only quoting some cars today, so I\u2019ve matched the rest on price. Ask me for figures on any of them.</li>');
    subs.innerHTML = lines.join('');
    cardsEl.innerHTML = list.map(card).join('') + (R.level >= 1 ? findCard() : '');
    cardsEl.querySelectorAll('.fmb-card[data-i]').forEach(function (el) { el.hidden = Number(el.getAttribute('data-i')) >= shownN; });
    cardsEl.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('error', function () {
        var c = list[Number(img.closest('[data-i]').getAttribute('data-i'))].c, d = document.createElement('div');
        d.className = 'sil'; d.innerHTML = SIL[c._prim] || SIL.saloon; img.replaceWith(d);
      }, { once: true });
    });
    setTimeout(function () { cardsEl.querySelectorAll('.fmb-pct i').forEach(function (i) { i.style.width = i.getAttribute('data-w') + '%'; }); }, RM ? 0 : 60);
    $('fmbMore').hidden = moreShown || list.length <= 3;
    $('fmbMore').textContent = list.length - 3 === 1 ? 'Show me 1 more' : 'Show me 2 more';
    var see = $('fmbSeeAll');
    see.hidden = !(R.seeN > SHOWN.length);
    see.textContent = 'See all ' + R.seeN + ' matches';
    see.href = R.seeUrl;
    $('fmbSentAll').href = R.seeUrl; $('fmbSentAll').hidden = see.hidden; $('fmbSentAll').textContent = see.textContent;
    $('fmbLead').hidden = false;
    pxBox();
    leadBanner();
    if (A.interest === 'new' || A.interest === 'either') {
      head.textContent = NEWRES.list.length ? 'And a couple of approved used BMWs that may be of interest.'
        : 'While you wait for me to come back to you, here are a couple of used BMWs that may be of interest.';
      var top = subs.querySelector('li:not(.relax)'); if (top && R.level === 0) top.remove();
    }
    if (!revealTracked) {
      revealTracked = true;
      track('fmb_reveal', { match_count: R.nHome, group_count: R.nGroup, top_pct: list[0].pct == null ? -1 : list[0].pct,
        fallback_level: R.level, persona: p[0], quote_coverage: Math.round(coverage * 100) });
    }
  }
  var revealTracked = false;

  /* ---------------- the gate: contact (and part exchange) unlock the results ---------------- */
  /* Dan's rule (1 October): after the last question the results screen shows
     only the persona, the match count and blurred placeholder cards, under a
     sheet asking where to send the matches. The real cards are built only
     after Formspree has accepted the contact details (and, when the part
     exchange answer is Yes, the part exchange details too). Nothing about a
     car (reg, model, price, photo, link) is in the DOM before that; the
     matches live in memory and go to Dan in the payload. A failed send keeps
     the gate, with Try again and WhatsApp. WhatsApp never unlocks. */
  var LEAD = { state: null, first: '', id: '' };
  var PXD = { reg: '', miles: '', milesExact: '', service: '', fin: '', settle: '', cond: '', notes: '', keys: '', photosWa: false };
  var PXSTATE = null;   /* null | 'sent' | 'skipped' */
  var UNLOCKED = false, GSTEP = 'contact', gateOpen = false, gateLastFocus = null;
  function leadId() {
    var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'FMB-' + String(d.getFullYear()).slice(2) + z(d.getMonth() + 1) + z(d.getDate()) + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (x) { return null; } }
  function contactInfo() {
    var o = {}; try { o = JSON.parse(ss('fmbLead') || '{}') || {}; } catch (x) {}
    return { id: LEAD.id || o.id || '', name: $('fName').value.trim() || o.name || '', phone: $('fPhone').value.trim() || o.phone || '', email: $('fEmail').value.trim() || o.email || '' };
  }
  function headline(R) {
    var strict = R.nHome + (R.levels.indexOf(1) !== -1 ? R.nGroup : 0);
    if (R.level <= 1 && strict > 0) return strict === 1 ? 'I found 1 BMW that fits you.' : 'I found ' + strict + ' BMWs that fit you.';
    return 'Nothing ticked every box today, so I\u2019ve found the closest.';
  }
  function matchCountText() {
    if (!RESULT) return '';
    var R = RESULT, strict = R.nHome + (R.levels.indexOf(1) !== -1 ? R.nGroup : 0);
    return strict > 0 && R.level <= 1 ? (strict === 1 ? '1 match ready' : strict + ' matches ready') : R.list.length + ' close matches ready';
  }
  function present() {
    if (UNLOCKED) { closeGate(true); reveal(); return; }
    revealLocked();
    openGate();
  }
  /* placeholders only: no car data at all */
  function revealLocked() {
    var p = persona(A);
    $('personaH').textContent = p[0]; $('personaL').textContent = p[1];
    $('fmbHeadline').textContent = RESULT ? headline(RESULT) : 'Your matches';
    $('fmbSubs').innerHTML = '';
    var sk = '<div class="fmb-card fmb-skel" aria-hidden="true"><div class="fmb-ph"></div><div class="fmb-cb"><i></i><i></i><i class="s"></i><i></i></div></div>';
    $('fmbCards').innerHTML = sk + sk + sk;
    ['fmbMore', 'fmbSeeAll', 'fmbLead', 'fmbPxBox', 'fmbSent', 'fmbNew'].forEach(function (id) { $(id).hidden = true; });
    $('fmbNew').innerHTML = '';
    document.body.classList.add('locked');
    track('fmb_reveal_locked', { match_count: RESULT ? RESULT.nHome : 0, persona: p[0] });
  }
  function setInert(on) {
    ['fmbMain', 'fmbTop'].forEach(function (id) {
      var el = $(id); if (!el) return;
      if (on) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
      else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
    });
  }
  function openGate() {
    var g = $('fmbGate');
    gateLastFocus = document.activeElement;
    g.hidden = false; $('fmbSheet').hidden = false; $('fmbPeek').hidden = true;
    g.classList.remove('peek');
    setInert(true);
    ensurePx();
    $('gateCount').textContent = matchCountText();
    $('peekCount').textContent = matchCountText();
    gstep(LEAD.state === 'sent' ? (A.px === 'yes' ? 'px1' : A.px === 'maybe' ? 'pxask' : 'contact') : 'contact', true);
    if (!gateOpen) track('fmb_gate_view', { match_count: RESULT ? RESULT.nHome : 0, px: A.px || 'none', interest: A.interest || 'either' });
    gateOpen = true;
  }
  function closeGate(silent) {
    var g = $('fmbGate'); if (g.hidden) return;
    g.hidden = true; gateOpen = false;
    setInert(false);
    document.body.classList.remove('locked');
    void silent;
  }
  function collapseGate() {
    $('fmbSheet').hidden = true; $('fmbGate').classList.add('peek');
    $('fmbPeek').hidden = false; $('fmbPeek').focus();
    track('fmb_gate_collapse');
  }
  function expandGate() {
    $('fmbSheet').hidden = false; $('fmbGate').classList.remove('peek'); $('fmbPeek').hidden = true;
    focusStep();
    track('fmb_gate_reopen');
  }
  var PXSTEPS = ['px1', 'px2', 'px3', 'px4', 'px5', 'px6', 'px7'];
  var PXNAME = { px1: 'reg', px2: 'mileage', px3: 'service_history', px4: 'finance', px5: 'condition', px6: 'keys', px7: 'photos' };
  function gstep(g, noTrack) {
    GSTEP = g;
    document.querySelectorAll('#fmbSheet .fmb-gstep').forEach(function (el) { el.hidden = el.getAttribute('data-g') !== g; });
    $('gateErr').hidden = true;
    var pi = PXSTEPS.indexOf(g);
    if (g === 'contact') { $('gateH').textContent = 'Where shall I send your matches?'; $('gateSub').textContent = 'Add your details and your matches unlock straight away.'; }
    else if (g === 'pxask') { $('gateH').textContent = 'Got your details. Thank you.'; $('gateSub').textContent = 'One more optional thing before your matches.'; }
    else if (pi !== -1) {
      $('gateH').textContent = 'Your part exchange';
      $('gateSub').textContent = 'Step ' + (pi + 1) + ' of ' + PXSTEPS.length + (A.px === 'yes' ? '. Your matches unlock when this is sent.' : '. Optional, skip whenever you like.');
      if (!noTrack || pi === 0) track('fmb_px_step_' + (pi + 1), { step: pi + 1, step_name: PXNAME[g], px: A.px });
    }
    $('fSend').textContent = A.px === 'yes' ? 'Continue' : 'Show my matches';
    focusStep();
  }
  function focusStep() {
    var el = document.querySelector('#fmbSheet .fmb-gstep:not([hidden]) input:not([type=hidden]):not([tabindex="-1"]), #fmbSheet .fmb-gstep:not([hidden]) button');
    var h = $('gateH');
    try { (GSTEP === 'contact' ? el || h : h).focus({ preventScroll: true }); } catch (x) { h.focus(); }
  }
  /* keep Tab inside the sheet (or on the peek bar) */
  function trap(e) {
    if (!gateOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); if (!$('fmbSheet').hidden) collapseGate(); return; }
    if (e.key !== 'Tab') return;
    var root = $('fmbSheet').hidden ? $('fmbPeek').parentNode : $('fmbSheet');
    var f = [].filter.call(root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]):not([tabindex="-1"]), textarea, [tabindex="0"]'),
      function (el) { return el.offsetParent !== null || el === document.activeElement; });
    if ($('fmbSheet').hidden) f = [$('fmbPeek')];
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function unlock(how) {
    UNLOCKED = true; save('reveal');
    track('fmb_unlock', { method: how, px: A.px || 'none', px_state: PXSTATE || 'none' });
    closeGate();
    revealTracked = false;
    reveal();
    var t = $('fmbSent').hidden ? $('personaH') : $('fmbSent');
    try { t.focus(); } catch (x) {}
    window.scrollTo(0, 0);
  }
  function showGateErr(kind) {
    $('gateErr').hidden = false;
    $('gateErrP').textContent = kind === 'px'
      ? 'That didn\u2019t go through, so your car\u2019s details haven\u2019t reached me yet. Please try again, or message me on WhatsApp.'
      : 'That didn\u2019t go through, so nothing has reached me yet. Please try again, or message me on WhatsApp.';
    $('gateRetry').setAttribute('data-kind', kind);
    $('gateErr').focus && $('gateRetry').focus();
  }

  /* ---------- the contact submission ---------- */
  function payload() {
    var R = RESULT || { nHome: 0, nGroup: 0, level: 0, levels: [], seeUrl: '', list: [] };
    var ci = contactInfo(), opt = $('fOptin').checked;
    var top = R.list.slice(0, 5);
    var P = {
      form: 'find-my-bmw-v2',
      lead_id: LEAD.id,
      _subject: 'DanSells lead: ' + (ci.name || 'website') + ' (Find my BMW' + (A.interest === 'new' ? ', new car' : '') + ')',
      _replyto: ci.email || 'daniel.cane@hedinautomotive.co.uk',
      _gotcha: $('fGotcha').value,
      name: ci.name, email: ci.email, phone: ci.phone,
      interest: A.interest || 'either',
      interest_detail: interestText(A),
      part_exchange: { yes: 'Yes', no: 'No', maybe: 'Maybe' }[A.px] || 'Not answered',
      marketing_opt_in: opt ? 'Yes' : 'No',
      marketing_channels: opt ? 'Email, WhatsApp' : '',
      lifestyle: lifeText(A) || 'not answered', body: shapesText(A), fuel: fuelsText(A),
      pay_route: A.pay || 'not answered',
      monthly_max: A.pay === 'monthly' ? (A.mo ? String(A.mo) : 'No limit') : '',
      deposit: A.pay === 'monthly' ? (A.dep === null ? 'Not sure' : String(A.dep)) : '',
      cash_max: A.pay === 'cash' ? (A.cash ? String(A.cash) : 'Any price') : '',
      extras: extrasText(A), colours: A.colours.join(', ') || 'Open minded', timing: whenText(A) || 'not answered',
      persona: persona(A)[0],
      match_count_forecourt: String(R.nHome), match_count_group: String(R.nGroup),
      fallback_level: String(R.level),
      relaxed: R.levels.filter(function (l) { return l >= 1; }).map(function (l) { return RELAX[l]; }).join(', '),
      quote_coverage: Math.round(coverage * 100) + '%',
      top_regs: top.map(function (r) { return r.c.reg; }).join(', '),
      see_all_url: R.seeUrl || '',
      page_url: location.href.split('#')[0],
      leadsummary: waText(null, top)
    };
    if (wantsNew()) {
      P.new_match_count = String(NEWRES.count);
      P.new_matching_basis = 'BMW quotes assume ' + money(NEW_QUOTE_DEP) + ' down. Matched on ' + GBP + NEW_PER_1000
        + ' a month less per ' + GBP + '1,000 more deposit (more per ' + GBP + '1,000 less). Estimates for Dan only, not shown to the customer. '
        + (A.pay === 'monthly' ? (A.dep === null ? 'Deposit not sure, so matched at ' + money(NEW_QUOTE_DEP) + '.' : 'Customer deposit ' + money(A.dep) + '.') : 'Not a monthly brief.');
      NEWRES.list.forEach(function (r, i) {
        var n = 'new_match_' + (i + 1) + '_', c = r.c;
        P[n + 'order'] = c.order_number || '';
        P[n + 'model'] = c.description + (c.colour ? ', ' + c.colour : '');
        P[n + 'price'] = c.price || '';
        P[n + 'quoted_monthly'] = c._quoted ? money2(c._quoted) + ' with ' + money(NEW_QUOTE_DEP) + ' down (BMW locator)' : 'none';
        P[n + 'est_monthly'] = r.est !== null && A.pay === 'monthly' && A.dep !== null ? 'about ' + money2(r.est) + ' with ' + money(A.dep) + ' down (estimate)' : '';
        P[n + 'when'] = newWhen(c);
      });
    }
    top.forEach(function (r, i) {
      var n = 'match_' + (i + 1) + '_';
      P[n + 'reg'] = r.c.reg || '';
      P[n + 'model'] = (r.c.year ? r.c.year + ' ' : '') + r.c.model;
      P[n + 'price'] = r.c.price || '';
      P[n + 'monthly'] = r.fin ? money2(r.fin.monthly) + ' a month with ' + money(r.fin.deposit) + ' down, ' + r.fin.apr + '% APR' : 'Ask for a quote';
      P[n + 'match'] = r.pct == null ? '' : r.pct + '%';
      P[n + 'why'] = r.why;
      P[n + 'url'] = r.c.url || '';
      P[n + 'source'] = r.c._home ? 'Ruxley forecourt' : 'Group stock';
      P[n + 'relaxed'] = r.relaxed || '';
    });
    return P;
  }
  var sending = false;
  /* One POST with a real success check: response.ok and no JSON error. */
  function post(P) {
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    return fetch(FORM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(P),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      return r.json()['catch'](function () { return {}; }).then(function (j) {
        clearTimeout(to);
        if (!r.ok || (j && (j.ok === false || j.error || j.errors))) throw new Error(String(r.status || 'bad'));
        return j;
      });
    }, function (x) { clearTimeout(to); throw new Error(x && x.name === 'AbortError' ? 'timeout' : 'network'); });
  }
  function validate() {
    var first = $('fName').value.trim(), email = $('fEmail').value.trim(), phone = $('fPhone').value.trim();
    var digits = phone.replace(/\D/g, '');
    if (!first) return ['Please add your first name.', 'fName', 'name'];
    if (digits.length < 10 || digits.length > 15 || /[^\d\s+()-]/.test(phone)) return ['Please check your mobile number.', 'fPhone', 'phone'];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return ['Please check your email address.', 'fEmail', 'email'];
    return null;
  }
  function afterContact() {
    if (A.px === 'yes') { track('fmb_px_start', { px: 'yes', entry: 'auto' }); gstep('px1'); }
    else if (A.px === 'maybe') gstep('pxask');
    else unlock('contact');
  }
  function submitContact(e) {
    if (e) e.preventDefault();
    if (sending) return;
    if (ss('fmbSent')) { LEAD.state = 'sent'; return afterContact(); }
    var bad = validate(), ferr = $('fFieldErr');
    ferr.hidden = !bad; ferr.textContent = bad ? bad[0] : '';
    ['fName', 'fPhone', 'fEmail'].forEach(function (id) { $(id).setAttribute('aria-invalid', bad && bad[1] === id ? 'true' : 'false'); });
    if (bad) { $(bad[1]).focus(); track('fmb_contact_invalid', { field: bad[2] }); return; }
    if (!LEAD.id) LEAD.id = leadId();
    LEAD.first = $('fName').value.trim();
    ss('fmbLead', JSON.stringify({ id: LEAD.id, name: LEAD.first, phone: $('fPhone').value.trim(), email: $('fEmail').value.trim() }));
    track('fmb_contact_submit', { interest: A.interest || 'either', px: A.px || 'none' });
    var P = payload();
    window.fmbDebug.payload = P;
    sending = true;
    var btn = $('fSend'); btn.disabled = true; btn.textContent = 'Sending';
    $('gateErr').hidden = true;
    post(P).then(function () {
      ss('fmbSent', String(Date.now())); ss('fmbSentName', LEAD.first);
      LEAD.state = 'sent';
      track('fmb_lead_sent', { match_count: RESULT ? RESULT.nHome : 0, interest: A.interest || 'either' });
      markComplete('form');
      sending = false; btn.disabled = false;
      afterContact();
    }, function (x) {
      LEAD.state = 'error'; sending = false;
      btn.disabled = false; btn.textContent = A.px === 'yes' ? 'Continue' : 'Show my matches';
      track('fmb_lead_error', { status: String(x && x.message || 'network').slice(0, 40) });
      track('fmb_gate_submit_error', { which: 'contact', status: String(x && x.message || 'network').slice(0, 40) });
      showGateErr('contact');
    });
  }

  /* ---------- the part exchange steps (in the same sheet) ---------- */
  var MILES = ['Under 20k', '20k to 40k', '40k to 60k', '60k to 80k', '80k to 100k', 'Over 100k'];
  var SERVICE = ['Full main dealer', 'Full independent', 'Partial', 'None', 'Not sure'];
  var PXFIN = ['Yes', 'No', 'Not sure'];
  var COND = ['Excellent', 'Good', 'Some marks and wear', 'Needs some work'];
  var KEYS = ['1', '2', 'More than 2'];
  var PHOTOS = ['Front', 'Rear', 'Both sides', 'Interior', 'Dashboard showing the mileage', 'Any damage'];
  function pchips(name, list) {
    return '<div class="fmb-chips" role="radiogroup" aria-labelledby="' + name + '-l">' + list.map(function (v) {
      return '<label class="fmb-chip"><input type="radio" name="' + name + '" value="' + esc(v) + '"/><span>' + esc(v) + '</span></label>';
    }).join('') + '</div>';
  }
  function pstep(g, label, body, opt) {
    var req = A.px === 'yes' && !opt;
    return '<div class="fmb-gstep" data-g="' + g + '" hidden>'
      + '<p class="fmb-sub" id="' + g + '-l">' + esc(label) + (req ? '' : ' <span class="fmb-opt-tag">(optional)</span>') + '</p>' + body
      + '<p class="fmb-ferr" data-perr role="alert" hidden></p>'
      + '<div class="fmb-pxnav">'
      + (g === 'px7' ? '<button class="fmb-btn wide" type="button" id="pxSend">' + (A.px === 'yes' ? 'Send and show my matches' : 'Send my car\u2019s details') + '</button>'
                     : '<button class="fmb-btn wide" type="button" data-pnext>Continue</button>')
      + (A.px === 'yes' ? '' : '<button class="fmb-btn ghost wide" type="button" data-pskip>Skip, show my matches</button>')
      + '<button class="fmb-link" type="button" data-pback>Back</button>'
      + '</div></div>';
  }
  function buildPx() {
    var h = '';
    h += pstep('px1', 'What\u2019s the reg?', '<div class="fmb-field"><label class="fmb-sr" for="pxReg">Registration</label><input id="pxReg" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="e.g. AB12 CDE" class="fmb-reg"/></div>');
    h += pstep('px2', 'Roughly how many miles?', pchips('pxMiles', MILES.concat(['Exact figure'])) + '<div class="fmb-field" id="pxExactWrap" hidden><label for="pxExact">Exact mileage</label><input id="pxExact" type="text" inputmode="numeric" autocomplete="off" maxlength="7"/></div>');
    h += pstep('px3', 'Service history?', pchips('pxService', SERVICE));
    h += pstep('px4', 'Any finance left on it?', pchips('pxFin', PXFIN) + '<div class="fmb-field" id="pxSettleWrap" hidden><label for="pxSettle">Roughly how much to settle? (optional)</label><input id="pxSettle" type="text" inputmode="numeric" autocomplete="off" maxlength="7" placeholder="\u00a3"/></div>');
    h += pstep('px5', 'What condition is it in?', pchips('pxCond', COND) + '<div class="fmb-field"><label for="pxNotes">Any damage or anything I should know?</label><textarea id="pxNotes" rows="3" maxlength="500"></textarea></div>', true);
    h += pstep('px6', 'How many keys?', pchips('pxKeys', KEYS));
    h += pstep('px7', 'Photos help me value it properly',
      '<p class="fmb-note">Send me these on WhatsApp whenever suits, now or after you\u2019ve seen your matches. They never hold anything up.</p>'
      + '<ul class="fmb-photolist">' + PHOTOS.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'
      + '<a class="fmb-btn wa wide" id="pxPhotosWa" href="' + esc(WA) + '" target="_blank" rel="noopener">Send your photos to Dan on WhatsApp</a>'
      + '<div class="fmb-hp" aria-hidden="true"><label for="pxGotcha">Leave this empty</label><input id="pxGotcha" type="text" tabindex="-1" autocomplete="off"/></div>', true);
    $('pxSteps').innerHTML = h;
  }
  function readPx() {
    if (!$('pxReg')) return;
    function rv(n) { var i = document.querySelector('#pxSteps input[name=' + n + ']:checked'); return i ? i.value : ''; }
    PXD.reg = $('pxReg').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    PXD.miles = rv('pxMiles'); PXD.milesExact = PXD.miles === 'Exact figure' ? $('pxExact').value.replace(/\D/g, '') : '';
    PXD.service = rv('pxService'); PXD.fin = rv('pxFin'); PXD.settle = PXD.fin === 'Yes' ? $('pxSettle').value.replace(/[^\d.]/g, '') : '';
    PXD.cond = rv('pxCond'); PXD.notes = $('pxNotes').value.trim().slice(0, 500); PXD.keys = rv('pxKeys');
  }
  function pxCheck(g) {
    readPx();
    var need = A.px === 'yes';
    if (g === 'px1') {
      if (PXD.reg && !/^[A-Z0-9]{2,8}$/.test(PXD.reg)) return 'That reg doesn\u2019t look quite right.';
      if (need && PXD.reg.length < 2) return 'Please add the reg.';
    }
    if (g === 'px2') {
      if (PXD.miles === 'Exact figure' && !PXD.milesExact) return 'Please add the mileage, or pick a band.';
      if (need && !PXD.miles) return 'Please pick a mileage.';
    }
    if (g === 'px3' && need && !PXD.service) return 'Please pick one.';
    if (g === 'px4' && need && !PXD.fin) return 'Please pick one.';
    if (g === 'px6' && need && !PXD.keys) return 'Please pick one.';
    return '';
  }
  function pxNext() {
    var err = pxCheck(GSTEP), box = document.querySelector('#fmbSheet .fmb-gstep:not([hidden]) [data-perr]');
    if (box) { box.hidden = !err; box.textContent = err; }
    if (err) return false;
    var i = PXSTEPS.indexOf(GSTEP);
    if (i < PXSTEPS.length - 1) gstep(PXSTEPS[i + 1]);
    return true;
  }
  function pxLine() {
    if (!A.px || A.px === 'no') return '';
    if (A.px === 'maybe' && !PXD.reg && !PXD.miles) return 'I might have a car to part exchange.';
    var bits = [];
    if (PXD.reg) bits.push('reg ' + PXD.reg);
    if (PXD.miles) bits.push(PXD.milesExact ? Number(PXD.milesExact).toLocaleString('en-GB') + ' miles' : PXD.miles + ' miles');
    if (PXD.service) bits.push(PXD.service.toLowerCase() + ' service history');
    if (PXD.fin) bits.push('finance: ' + PXD.fin.toLowerCase() + (PXD.settle ? ', about ' + money(Number(PXD.settle)) + ' to settle' : ''));
    if (PXD.keys) bits.push(PXD.keys + (PXD.keys === '1' ? ' key' : ' keys'));
    return 'Part exchange: ' + (bits.length ? bits.join(', ') : (A.px === 'yes' ? 'yes, details to follow' : 'maybe')) + '.';
  }
  function pxPayload() {
    var ci = contactInfo();
    return {
      form: 'find-my-bmw-px',
      lead_id: ci.id,
      lead_addendum: 'true',
      _subject: 'DanSells part exchange: ' + (ci.name || 'website') + (PXD.reg ? ', ' + PXD.reg : '') + ' (Find my BMW)',
      _replyto: ci.email || 'daniel.cane@hedinautomotive.co.uk',
      _gotcha: $('pxGotcha').value,
      name: ci.name, phone: ci.phone, email: ci.email,
      px_reg: PXD.reg,
      px_answer: A.px,
      px_mileage: PXD.milesExact ? Number(PXD.milesExact).toLocaleString('en-GB') + ' (exact)' : PXD.miles,
      px_service_history: PXD.service,
      px_outstanding_finance: PXD.fin,
      px_settlement: PXD.settle ? money(Number(PXD.settle)) : '',
      px_condition: PXD.cond,
      px_notes: PXD.notes,
      px_keys: PXD.keys,
      px_photos: PXD.photosWa ? 'Opened WhatsApp to send photos' : 'Not sent yet (asked to send on WhatsApp)',
      interest: A.interest || 'either',
      interest_detail: interestText(A),
      page_url: location.href.split('#')[0],
      pxsummary: pxLine()
    };
  }
  var pxSending = false;
  function sendPx() {
    if (pxSending) return;
    if (ss('fmbPxSent')) { PXSTATE = 'sent'; return unlock('px'); }
    for (var i = 0; i < PXSTEPS.length; i++) {
      var err = pxCheck(PXSTEPS[i]);
      if (err) { gstep(PXSTEPS[i]); var b = document.querySelector('#fmbSheet .fmb-gstep:not([hidden]) [data-perr]'); b.hidden = false; b.textContent = err; return; }
    }
    var P = pxPayload();
    window.fmbDebug.pxPayload = P;
    pxSending = true;
    var btn = $('pxSend'), lab = btn.textContent; btn.disabled = true; btn.textContent = 'Sending';
    track('fmb_px_submit', { px: A.px });
    post(P).then(function () {
      ss('fmbPxSent', String(Date.now()));
      PXSTATE = 'sent'; pxSending = false;
      track('fmb_px_sent', { px: A.px });
      unlock('px');
    }, function (x) {
      pxSending = false; btn.disabled = false; btn.textContent = lab;
      track('fmb_px_error', { status: String(x && x.message || 'network').slice(0, 40) });
      track('fmb_gate_submit_error', { which: 'px', status: String(x && x.message || 'network').slice(0, 40) });
      showGateErr('px');
    });
  }
  function photoWaText() {
    var ci = contactInfo();
    return 'Hi Dan, here are the photos of my part exchange' + (PXD.reg ? ', reg ' + PXD.reg : '') + '.'
      + (ci.id ? ' (Find my BMW, ref ' + ci.id + ')' : '') + '\n\nPhoto checklist:\n' + PHOTOS.join('\n');
  }
  function pxPhotosClick() {
    readPx(); PXD.photosWa = true;
    this.href = WA + '?text=' + encodeURIComponent(photoWaText());
    var a = this; setTimeout(function () { if (!UNLOCKED) a.href = WA; }, 1500);
    track('fmb_px_photos_whatsapp', { place: this.id === 'pxPhotosWa' ? 'gate' : 'results' });
  }
  function pxBox() {
    var box = $('fmbPxBox');
    box.hidden = !(A.px === 'yes' || A.px === 'maybe');
    $('fmbPxGo').hidden = true;
    $('fmbPxDone').hidden = PXSTATE !== 'sent';
    if (PXSTATE === 'sent') {
      $('fmbPxH').textContent = 'Your part exchange';
      $('fmbPxP').hidden = true;
      $('fmbPxDoneP').textContent = 'Thanks, I\u2019ve got your car\u2019s details' + (PXD.reg ? ' (' + PXD.reg + ')' : '') + '. Photos help me value it properly: front, rear, both sides, interior, the dashboard showing the mileage and any damage.';
    } else {
      $('fmbPxP').hidden = false;
      $('fmbPxP').textContent = 'Thinking about a part exchange? Message me about it any time, or get a value first.';
    }
  }
  /* the gate's WhatsApp: answers only (no cars before unlock); never unlocks */
  function gateWaText() {
    var L = ['Hi Dan, I\u2019ve just done Find my BMW. Please send me my matches.', '', 'What I\u2019m after:'];
    if (A.interest) L.push(interestText(A));
    if (A.life) L.push(lifeText(A));
    L.push(shapesText(A), fuelsText(A), budgetLine(A));
    if (A.colours.length) L.push(list(A.colours, 'or'));
    if (A.extras.length) L.push('Wish list: ' + extrasText(A));
    if (A.when) L.push('Timing: ' + whenText(A));
    readPx(); var px = pxLine(); if (px) L.push('', px);
    return L.join('\n');
  }
  function gateWaClick() {
    this.href = WA + '?text=' + encodeURIComponent(gateWaText());
    var a = this; setTimeout(function () { a.href = WA; }, 1500);
    track('fmb_gate_whatsapp', { place: this.id, px: A.px || 'none' });
  }
  function leadBanner() {
    var newish = A.interest === 'new' || A.interest === 'either';
    var n = LEAD.first || ss('fmbSentName') || '';
    $('fmbSent').hidden = false;
    var newHit = newish && NEWRES.list.length > 0;
    $('fmbSentH').textContent = !newish ? (n ? 'Got them. Thank you, ' + n + '.' : 'Got them. Thank you.')
      : newHit ? (n ? 'Thanks, ' + n + '. Some brand new BMWs already fit what you told me.' : 'Thanks. Some brand new BMWs already fit what you told me.')
      : (n ? 'Thanks, ' + n + '. I\u2019ll be in touch with brand new options that suit you.' : 'Thanks. I\u2019ll be in touch with brand new options that suit you.');
    $('fmbSentP').textContent = !newish
      ? 'Your answers and these cars are with me now. I\u2019ll come back to you personally, usually the same day.'
      : newHit ? 'They are just below. Your answers are with me now, and I\u2019ll come back to you personally with a proper quote, usually the same day.'
      : 'Your answers are with me now. I\u2019ll come back to you personally, usually the same day, with brand new cars that fit, already built or ordered to your spec.';
    $('fmbSentWa').href = WA;
  }
  var pxBuiltFor;
  function ensurePx() { if (pxBuiltFor !== A.px) { buildPx(); pxBuiltFor = A.px; } }
  function wireGate() {
    $('fmbForm').addEventListener('submit', submitContact);
    $('gateRetry').addEventListener('click', function () {
      track('fmb_lead_retry', { which: this.getAttribute('data-kind') });
      if (this.getAttribute('data-kind') === 'px') sendPx(); else submitContact();
    });
    $('gateWa').addEventListener('click', gateWaClick);
    $('gateErrWa').addEventListener('click', gateWaClick);
    $('fmbPeek').addEventListener('click', expandGate);
    $('pxAskYes').addEventListener('click', function () { track('fmb_px_start', { px: 'maybe', entry: 'prompt' }); gstep('px1'); });
    $('pxAskNo').addEventListener('click', function () { PXSTATE = 'skipped'; track('fmb_px_skip', { step: 0 }); unlock('contact'); });
    $('pxSteps').addEventListener('click', function (e) {
      var t = e.target.closest('button, a'); if (!t) return;
      if (t.hasAttribute('data-pnext')) pxNext();
      else if (t.hasAttribute('data-pskip')) { PXSTATE = 'skipped'; track('fmb_px_skip', { step: PXSTEPS.indexOf(GSTEP) + 1 }); unlock('contact'); }
      else if (t.hasAttribute('data-pback')) { var i = PXSTEPS.indexOf(GSTEP); gstep(i > 0 ? PXSTEPS[i - 1] : (A.px === 'maybe' ? 'pxask' : 'px1')); }
      else if (t.id === 'pxSend') sendPx();
      else if (t.id === 'pxPhotosWa') pxPhotosClick.call(t);
    });
    $('pxSteps').addEventListener('change', function (e) {
      var i = e.target;
      if (i.name === 'pxMiles') $('pxExactWrap').hidden = i.value !== 'Exact figure';
      if (i.name === 'pxFin') $('pxSettleWrap').hidden = i.value !== 'Yes';
    });
    /* chip led: a pointer tap on a simple choice moves on by itself */
    $('pxSteps').addEventListener('click', function (e) {
      var lab = e.target.closest('.fmb-chip'); if (!lab || !e.detail) return;
      var v = lab.querySelector('input').value, n = lab.querySelector('input').name;
      if ((n === 'pxMiles' && v !== 'Exact figure') || n === 'pxService' || (n === 'pxFin' && v !== 'Yes') || n === 'pxKeys') {
        var g = GSTEP; setTimeout(function () { if (GSTEP === g) pxNext(); }, 300);
      }
    });
    $('pxSteps').addEventListener('input', function (e) { if (e.target.id === 'pxReg') { var c = e.target.selectionStart; e.target.value = e.target.value.toUpperCase(); try { e.target.setSelectionRange(c, c); } catch (x) {} } });
    $('pxSteps').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); if (GSTEP === 'px7') sendPx(); else pxNext(); } });
    document.addEventListener('keydown', trap, true);
  }

  /* ---------------- events ---------------- */
  var LIKED = null;
  function wire() {
    var qs = $('fmbQuestions');
    qs.addEventListener('change', onChange);
    qs.addEventListener('click', onClick);
    $('fmbNext').addEventListener('click', next);
    $('fmbBack').addEventListener('click', back);
    $('fmbStart').addEventListener('click', function () { track('fmb_start', { entry: 'intro' }); go(QS[0]); });
    $('fmbCarryOn').addEventListener('click', function () {
      var o = loadSaved(); if (!o) return go(QS[0]);
      track('fmb_resume', { step: o.step }); track('fmb_start', { entry: 'resume' });
      if (o.step === 'reveal') runMatching(true);
      else go(QS.indexOf(o.step) !== -1 ? o.step : QS[0]);
    });
    $('fmbRestart').addEventListener('click', function () {
      A = blank(); OPEN = {}; depTouched = false;
      try { localStorage.removeItem(KEY); } catch (e) {}
      $('fmbResume').hidden = true;
      QS.forEach(syncInputs);
      track('fmb_start', { entry: 'restart' }); go(QS[0]);
    });
    $('fmbMore').addEventListener('click', function () {
      moreShown = true;
      document.querySelectorAll('#fmbCards .fmb-card[data-i]').forEach(function (el) { el.hidden = false; });
      SHOWN = RESULT.list.slice(0, 5);
      this.hidden = true;
      $('fmbSeeAll').hidden = !(RESULT.seeN > SHOWN.length);
      track('fmb_more_matches', { match_count: RESULT.nHome });
      var c4 = document.querySelector('#fmbCards [data-i="3"] h3'); if (c4) { c4.tabIndex = -1; c4.focus(); }
    });
    $('s-reveal').addEventListener('click', function (e) {
      var a = e.target.closest('a'); if (!a) return;
      if (a.hasAttribute('data-newlike')) {
        var nr = NEWRES.list[Number(a.getAttribute('data-newlike'))];
        a.href = WA + '?text=' + encodeURIComponent(waText(null, null, nr));
        track('fmb_card_whatsapp', { reg: nr.c.order_number, rank: NEWRES.list.indexOf(nr) + 1, pct: -1, source: 'new' });
        markComplete('card_whatsapp');
      } else if (a.hasAttribute('data-like')) {
        var r = RESULT.list[Number(a.getAttribute('data-like'))];
        LIKED = r; a.href = waUrl(r);
        track('fmb_card_whatsapp', { reg: r.c.reg, rank: SHOWN.indexOf(r) + 1, pct: r.pct == null ? -1 : r.pct, source: r.c._home ? 'forecourt' : 'group' });
        markComplete('card_whatsapp');
      } else if (a.id === 'fmbFind' || a.hasAttribute('data-wa-main')) {
        a.href = waUrl(null);
        track('fmb_whatsapp_send', { match_count: RESULT ? RESULT.nHome : 0, top_reg: SHOWN[0] ? SHOWN[0].c.reg : '', place: a.id ? 'find_card' : 'fail' });
        markComplete('whatsapp');
      }
    });
    function mainWa(place) {
      return function () {
        this.href = waUrl(null);
        track('fmb_whatsapp_send', { match_count: RESULT ? RESULT.nHome : 0, top_reg: SHOWN[0] ? SHOWN[0].c.reg : '', place: place });
        markComplete('whatsapp');
      };
    }
    $('fmbWa').addEventListener('click', mainWa('main'));
    $('fmbSentWa').addEventListener('click', mainWa('sent'));
    $('fmbSeeAll').addEventListener('click', function () { track('fmb_see_all', { match_count: RESULT.seeN, all: RESULT.useGroup ? 'yes' : 'no' }); });
    $('fmbSentAll').addEventListener('click', function () { track('fmb_see_all', { match_count: RESULT.seeN, all: RESULT.useGroup ? 'yes' : 'no', place: 'sent' }); });
    wireGate();
    $('fmbPxPhotosWa2').addEventListener('click', pxPhotosClick);
    window.addEventListener('popstate', function (e) {
      var s = (e.state && e.state.s) || (location.hash || '').slice(1) || 'intro';
      if (s === 'matching') s = QS[NQ - 1];
      var back = ORDER.indexOf(s) < ORDER.indexOf(cur);
      if (back && QS.indexOf(cur) !== -1) track('fmb_back', { from_step: QS.indexOf(cur) + 1 });
      if (s === 'reveal') { if (!RESULT) compute(); show('reveal'); present(); }
      else { if (gateOpen) closeGate(); show(ORDER.indexOf(s) !== -1 ? s : 'intro', back); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && QS.indexOf(cur) !== -1 && e.target && e.target.matches && e.target.matches('#fmbQuestions input')) {
        e.preventDefault(); next();
      }
    });
  }

  /* ---------------- start ---------------- */
  function preAnswers() {
    var p = new URLSearchParams(location.search), any = false;
    var it = p.get('interest'); if (it && byV(INTEREST, it)) { A.interest = it; PRE.qi = any = true; }
    var life = p.get('life'); if (life && byV(LIFE, life)) { A.life = life; PRE.q1 = any = true; }
    var body = (p.get('body') || '').split(',').filter(function (v) { return byV(BODY, v) && v !== 'open'; });
    if (body.length) { A.body = body; PRE.q2 = any = true; }
    var fuel = (p.get('fuel') || '').split(',').filter(function (v) { return byV(FUEL, v) && v !== 'open'; });
    if (fuel.length) { A.fuel = fuel; PRE.q3 = any = true; }
    return any;
  }
  function start() {
    buildQuestions();
    wire();
    var saved = loadSaved(), hash = (location.hash || '').slice(1);
    var pre = preAnswers();
    if (saved && !pre) { A = Object.assign(blank(), saved.answers); OPEN = saved.open || {}; depTouched = !!saved.dep; }
    UNLOCKED = !!(saved && saved.unlocked && !pre); PXSTATE = saved && !pre ? saved.pxstate || null : null;
    if (UNLOCKED) LEAD.state = 'sent';
    QS.forEach(function (q) { if (q !== 'q6') syncInputs(q); });
    history.replaceState({ s: 'intro' }, '', location.pathname + location.search + (hash && hash !== 'matching' ? '#' + hash : ''));
    if (hash === 'reveal' && saved) {
      track('fmb_resume', { step: 'reveal' });
      runMatching(true);
    } else if (QS.indexOf(hash) !== -1) {
      track('fmb_start', { entry: 'deeplink' });
      history.replaceState({ s: hash }, '', '#' + hash);
      show(hash);
    } else {
      show('intro');
      if (saved && !pre && saved.step && saved.step !== 'intro') $('fmbResume').hidden = false;
      var resumed = saved && !pre ? 'yes' : 'no';
      pSnap.then(function () {
        track('fmb_intro_view', { stock_count: HOME.length || -1, resumed: resumed });
      });
    }
  }

  window.fmbDebug = {
    get A() { return A; }, get result() { return RESULT; }, get newResult() { return NEWRES; }, payload: null,
    newMatches: function (a) { return findNew(Object.assign(blank(), a)); },
    newEstimate: function (order, dep) { var c = NEWC.filter(function (x) { return x.order_number === order; })[0]; return c ? newEstimate(c, dep) : null; },
    newReady: function () { return want('newc'); },
    waText: function (i) { return waText(i == null ? null : RESULT.list[i]); },
    matches: function (a) { return findMatches(Object.assign(blank(), a)); },
    ready: function () { return Promise.all([pSnap, pFin]); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
