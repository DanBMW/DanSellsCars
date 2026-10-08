/* Find my BMW. One page: intro, a needs analysis starting with the model,
 * an honest matching moment, then the reveal with real cars behind a hard
 * contact gate. WhatsApp first, one Formspree submission per lead.
 *
 * Matching lives in fmb-match.js (window.fmbMatch), shared with desk mode, so
 * both recommend the same car. It reads the same files stock.html publishes.
 * Every payment shown is the lender's, with the full representative example.
 * A brand new card shows the cash price and a personalised quote, never a
 * monthly figure. Every answer is an active tap: nothing is pre selected and
 * there is no Skip. No stock counts anywhere in the questions.
 * Plain ES2017, no dependencies.
 */
(function () {
  'use strict';

  var WA = 'https://wa.me/447827138197';
  var FORM_URL = 'https://formspree.io/f/xqewleog';
  var KEY = 'fmbV3', TTL = 7 * 864e5;
  var GBP = '\u00a3';
  var RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var ST = window.dsStock, FN = window.dsFin;

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
    var o = { funnel: 'fmb', fmb_version: '3' };
    for (var k in (p || {})) o[k] = typeof p[k] === 'string' ? p[k].slice(0, 100) : p[k];
    window.gtag('event', name, o);
  }
  function markComplete(how) {
    var seen = false;
    try { seen = !!sessionStorage.getItem('gaDone_fmb'); sessionStorage.setItem('gaDone_fmb', '1'); } catch (e) {}
    if (!seen) track('fmb_complete', { method: how });
  }

  /* ---------------- options (shared with desk mode) ---------------- */
  var M = window.fmbMatch;
  var MODELS = M.MODELS, BODY = M.BODY, FUEL = M.FUEL, WHO = M.WHO, LIFE = M.LIFE, MILES_A = M.MILES;
  var PEOPLE = M.PEOPLE, BOOT = M.BOOT, CHARGE = M.CHARGE, WHEN = M.WHEN;
  var MONTHLY = M.MONTHLY, DEPS = M.DEPS, CASH = M.CASH, EXTRAS = M.EXTRAS, COLOURS = M.COLOURS, SWATCH = M.SWATCH;
  var TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
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
  var INTEREST = [
    { v: 'new', t: 'A brand new BMW', l: 'Already built, or ordered to your spec. I\u2019ll come back to you with options.' },
    { v: 'used', t: 'An approved used BMW', l: 'Real cars across the Hedin BMW group, including my forecourt.' },
    { v: 'either', t: 'Open to either', l: 'Brand new options plus approved used cars that fit.' }
  ];
  var PXQ = [
    { v: 'yes', t: 'Yes', l: 'I\u2019ll ask a few quick things about it next.' },
    { v: 'no', t: 'No', l: 'No car to trade in.' },
    { v: 'maybe', t: 'Maybe', l: 'Not sure yet. You can tell me about it if you like.' }
  ];
  function byV(list, v) { return M.byV(list, v); }

  /* ---------------- answers ---------------- */
  function blank() { return M.blank(); }
  var A = blank();
  var OPEN = {};
  var PRE = {};
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
  var HOME = [], GROUP = [], FIN = {}, LAD = {}, DET = null, NEWC = [];
  var snapOK = null, finOK = false, ladOK = false, groupOK = false, newOK = false;
  var coverage = 1, quotedAny = true;
  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }
  function pushData() {
    M.load({ home: HOME, group: GROUP, fin: FIN, lad: LAD, det: DET || {}, newCars: NEWC });
    var d = M.data();
    coverage = d.coverage; quotedAny = d.quotedAny;
  }
  var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 400); };
  var lazy = {};
  function want(name) {
    if (lazy[name]) return lazy[name];
    var url = { lad: 'automation/stock-finance-ladder.json', group: 'automation/hedin-group-stock.json',
      det: 'automation/car-details.json', newc: 'lookup/new-stock.json' }[name];
    lazy[name] = getJSON(url).then(function (j) {
      if (name === 'lad') { LAD = j || {}; ladOK = true; }
      if (name === 'group') { GROUP = Array.isArray(j) ? j : []; groupOK = GROUP.length > 0; }
      if (name === 'det') DET = j || {};
      if (name === 'newc') { NEWC = ((j && j.cars) || []).filter(function (c) { return !c.on_hold; }); newOK = true; }
      pushData(); refresh();
    })['catch'](function () {
      if (name === 'det') DET = DET || {};
      if (name === 'newc') newOK = true;
      if (name === 'lad') ladOK = true;
      pushData(); refresh();
    });
    return lazy[name];
  }
  var pSnap = getJSON('automation/hedin-stock-snapshot.json').then(function (d) {
    if (!Array.isArray(d) || !d.length) throw new Error('empty');
    HOME = d; snapOK = true; pushData(); refresh();
    idle(function () { want('det'); want('lad'); want('group'); });
  })['catch'](function () { snapOK = false; refresh(); });
  var pFin = getJSON('automation/stock-finance.json').then(function (j) {
    FIN = j || {}; finOK = true; pushData(); refresh();
  })['catch'](function () { FIN = {}; finOK = true; pushData(); refresh(); });

  /* ---------------- matching (delegated to fmb-match.js) ---------------- */
  var NEW_QUOTE_DEP = M.NEW_QUOTE_DEP, NEW_PER_1000 = M.NEW_PER_1000;
  var NEWRES = { fit: [], reach: [], count: 0 }, RESULT = null, SHOWN = [];
  function wantsNew(a) { return M.wantsNew(a || A); }
  function countIn(pool, a, R) { return M.countIn(pool, a, R); }
  function findMatches(a) { return M.findUsed(a); }
  function findNew(a) { return M.findNew(a, { stretch: false }); }
  function newEstimate(c, dep) { return M.newEstimate(c, dep); }
  function newWhen(c) { return M.newWhen(c); }
  function newWhy(c, a) { return M.newWhy(c, a); }
  function newLine(r) { return M.newLine(r); }
  function shapeName(c) { return M.shapeName(c); }
  function persona(a) { return M.persona(a); }
  function extrasText(a) { return M.extrasText(a); }
  function shapesText(a) { return M.shapesText(a); }
  function fuelsText(a) { return M.fuelsText(a); }
  function interestText(a) { return M.interestText(a); }
  function lifeText(a) { var o = M.byV(LIFE, a.life); return o ? o.t : ''; }
  function whenText(a) { var o = M.byV(WHEN, a.when); return o ? o.t : ''; }
  function budgetLine(a) { return M.budgetLine(a); }
  function carLine(r) { return M.carLine(r); }
  function whyLine(r, a) { return r.why || M.whyLine(r, a); }
  function list(arr, word) { return M.list(arr, word); }
  function cap1(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function modelName(c) { return M.modelName(c); }
  function lowCov() { return finOK && coverage < 0.6; }
  var RELAX = M.RELAX, SUBS = M.SUBS;
  function seeAllUrl(a) { return M.findUsed(a).seeUrl; }

  /* ---------------- WhatsApp ---------------- */
  function waText(liked, listOverride, likedNew) {
    var SH = listOverride || SHOWN;
    var a = A, L = [];
    if (likedNew) L.push('Hi Dan, I like the look of this brand new one:', newLine(likedNew), 'From Find my BMW.', '');
    else if (liked) L.push('Hi Dan, I like the look of this one:', carLine(liked), 'From Find my BMW.', '');
    else L.push('Hi Dan, I\u2019ve just done Find my BMW.', '');
    L.push('What I\u2019m after:');
    L.push('Model: ' + M.modelsText(A));
    if (A.interest) L.push(interestText(A));
    if (A.who) L.push('Driver: ' + M.txt(WHO, A.who));
    if (a.life) L.push(lifeText(a));
    if (A.miles) L.push('Miles a year: ' + M.txt(MILES_A, A.miles));
    if (A.people) L.push('People: ' + M.txt(PEOPLE, A.people));
    if (A.boot) L.push('Boot: ' + M.txt(BOOT, A.boot));
    L.push(shapesText(a), fuelsText(a), budgetLine(a));
    if (a.colours.length) L.push(list(a.colours, 'or'));
    if (a.extras.length) L.push('Wish list: ' + extrasText(a));
    if (a.when) L.push('Timing: ' + whenText(a));
    var tail = [];
    if (liked) { var rank = SH.indexOf(liked) + 1; if (rank) tail.push('I like number ' + rank + ' the most (' + liked.c.reg + ').'); }
    var pxl = pxLine(); if (pxl) tail.push(pxl);
    if (RESULT && RESULT.level >= 2) tail.push('Nothing matched exactly, so I\u2019d love your help finding one.');
    var mt = [];
    if ((NEWRES.fit || []).length) {
      mt.push('', 'Brand new ones that fit:');
      NEWRES.fit.forEach(function (r) { mt.push(newLine(r)); });
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
  /* Order: model first, then new/used, needs analysis, shape only when it is
     not implied by the model, fuel, budget, wish list, colour, part exchange,
     timing. Shape and charging are dropped from the path when they do not
     apply, so the progress count stays honest. */
  var ALLQ = ['qm', 'qi', 'qw', 'ql', 'qmi', 'qpe', 'qb', 'qc', 'q2', 'q3', 'q4', 'q5', 'q6', 'qp', 'q7'];
  function activeQS() {
    var out = [];
    ALLQ.forEach(function (q) {
      if (q === 'q2' && M.shapeLocked(A)) return;
      if (q === 'qc' && !M.needsCharge(A) && !(OPEN.q3)) return;
      out.push(q);
    });
    return out;
  }
  function QS() { return activeQS(); }
  var STEP_NAME = { qm: 'model', qi: 'interest', qw: 'who', ql: 'life', qmi: 'miles', qpe: 'people',
    qb: 'boot', qc: 'charge', q2: 'body', q3: 'fuel', q4: 'budget', q5: 'extras', q6: 'colour',
    qp: 'part_exchange', q7: 'timing' };
  var MULTI = { qm: 'models', q2: 'body', q3: 'fuel', q5: 'extras', q6: 'colours' };
  var Q = {
    qm: { h: 'Which BMW are you thinking about?', hint: 'Pick any that appeal, or Open to ideas.' },
    qi: { h: 'New or approved used?', hint: 'Pick one' },
    qw: { h: 'Who will be behind the wheel most days?', hint: 'Pick one' },
    ql: { h: 'What does a typical week look like?', hint: 'Pick the closest one' },
    qmi: { h: 'Roughly how many miles a year?', hint: 'A guess is fine' },
    qpe: { h: 'How many people, regularly?', hint: 'Pick one' },
    qb: { h: 'How much boot space do you need?', hint: 'Pick one' },
    qc: { h: 'Can you charge at home?', hint: 'Pick one. This only helps me rank electric and plug in cars.' },
    q2: { h: 'Which shapes catch your eye?', hint: 'Pick any' },
    q3: { h: 'What should power it?', hint: 'Pick any' },
    q4: { h: 'What feels comfortable?', hint: 'Rough is fine. Nothing here commits you to anything.' },
    q5: { h: 'Anything you would love it to have?', hint: 'Pick any. These help me rank your matches. Only 7 seats rules cars out.' },
    q6: { h: 'Any colours you love?', hint: 'Pick any. I\u2019ll never rule out a great car over paint.' },
    qp: { h: 'Got a car to part exchange?', hint: 'Pick one. If it\u2019s a yes, I\u2019ll ask a few quick things about it next.' },
    q7: { h: 'When would you like to be driving it?', hint: 'Pick one' }
  };
  function opt(q, type, v, t, l, ico, cls) {
    return '<label class="fmb-opt' + (cls ? ' ' + cls : '') + '" data-v="' + esc(v) + '">'
      + '<input type="' + type + '" name="' + q + '" value="' + esc(v) + '"/>'
      + '<span class="fmb-opt-in">' + (ico ? '<span class="fmb-ico">' + ico + '</span>' : '')
      + '<span class="fmb-txt"><span class="fmb-t">' + esc(t) + '</span>'
      + (l ? '<span class="fmb-l">' + esc(l) + '</span>' : '')
      + '</span>'
      + '<span class="fmb-tick">' + TICK + '</span></span></label>';
  }
  function chip(name, v, t) {
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
    h += qWrap('qm', '<div class="fmb-opts two models">' + MODELS.map(function (o) { return opt('qm', 'checkbox', o.v, o.t, '', ''); }).join('')
      + opt('qm', 'checkbox', 'open', 'Open to ideas', 'Show me what suits, whatever the model', SVG.open, 'open') + '</div>');
    h += qWrap('qi', '<div class="fmb-opts">' + INTEREST.map(function (o) { return opt('qi', 'radio', o.v, o.t, o.l, ''); }).join('') + '</div>');
    h += qWrap('qw', '<div class="fmb-opts">' + WHO.map(function (o) { return opt('qw', 'radio', o.v, o.t, '', ''); }).join('') + '</div>');
    h += qWrap('ql', '<div class="fmb-opts">' + LIFE.map(function (o) { return opt('ql', 'radio', o.v, o.t, o.l, SVG[o.v] || SVG.open); }).join('') + '</div>');
    h += qWrap('qmi', '<div class="fmb-opts">' + MILES_A.map(function (o) { return opt('qmi', 'radio', o.v, o.t, '', ''); }).join('') + '</div>');
    h += qWrap('qpe', '<div class="fmb-opts">' + PEOPLE.map(function (o) { return opt('qpe', 'radio', o.v, o.t, '', ''); }).join('') + '</div>');
    h += qWrap('qb', '<div class="fmb-opts">' + BOOT.map(function (o) { return opt('qb', 'radio', o.v, o.t, o.l || '', ''); }).join('') + '</div>');
    h += qWrap('qc', '<div class="fmb-opts">' + CHARGE.map(function (o) { return opt('qc', 'radio', o.v, o.t, '', ''); }).join('') + '</div>');
    h += qWrap('q2', '<div class="fmb-opts two shapes">' + BODY.map(function (o) {
      return opt('q2', 'checkbox', o.v, o.t, o.l, SIL[o.v], '');
    }).join('') + opt('q2', 'checkbox', 'open', 'Open minded', 'Show me every shape', SVG.open, 'open') + '</div>');
    h += qWrap('q3', '<div class="fmb-opts">' + FUEL.map(function (o) {
      return opt('q3', 'checkbox', o.v, o.t, o.l, '', '');
    }).join('') + opt('q3', 'checkbox', 'open', 'Open minded', 'Show me the best of all of them', '', 'open') + '</div>',
      '<p class="fmb-helper">Not sure? Pick Open minded and I\u2019ll talk you through the differences.</p>');
    h += qWrap('q4',
      '<div class="fmb-seg" role="radiogroup" aria-label="How you\u2019d like to pay">'
      + chip('pay', 'monthly', 'A monthly figure') + chip('pay', 'cash', 'A total price') + chip('pay', 'notsure', 'Not sure yet') + '</div>'
      + '<div id="q4m" hidden>'
      + '<fieldset><legend class="fmb-sub">Up to how much a month?</legend><div class="fmb-chips" id="q4mo">'
      + MONTHLY.map(function (m) { return chip('mo', String(m), m ? money(m) : 'No limit'); }).join('') + '</div></fieldset>'
      + '<fieldset><legend class="fmb-sub">Anything to put down?</legend><div class="fmb-chips" id="q4dep">'
      + DEPS.map(function (d) { return chip('dep', String(d), d < 0 ? 'Not sure' : money(d)); }).join('') + '</div></fieldset>'
      + '<p class="fmb-helper">Figures are BMW Financial Services\u2019 own quotes over 48 months at 8,000 miles a year. The full representative example is on each car.</p>'
      + '<p class="fmb-helper" id="q4low" hidden>The lender is quoting fewer cars than usual today, so I\u2019ll match on price as well.</p>'
      + '</div>'
      + '<div id="q4c" hidden><fieldset><legend class="fmb-sub">Up to how much in total?</legend><div class="fmb-chips" id="q4cash">'
      + CASH.map(function (c) { return chip('cash', String(c.v), c.t); }).join('') + '</div></fieldset></div>'
      + '<p class="fmb-helper" id="q4n" hidden>No problem. I\u2019ll show you a good spread and we can work out the numbers together.</p>');
    h += qWrap('q5', '<div class="fmb-opts two">' + EXTRAS.map(function (k) {
      return opt('q5', 'checkbox', k, ST.FEATURES[k].label, '', '');
    }).join('') + opt('q5', 'checkbox', 'open', 'Not fussed', '', '', 'open') + '</div>');
    h += qWrap('q6', '<div class="fmb-opts two swatches" id="q6opts"></div>');
    h += qWrap('qp', '<div class="fmb-opts">' + PXQ.map(function (o) { return opt('qp', 'radio', o.v, o.t, o.l, ''); }).join('') + '</div>');
    h += qWrap('q7', '<div class="fmb-opts">' + WHEN.map(function (o) { return opt('q7', 'radio', o.v, o.t, '', SVG.clock); }).join('') + '</div>');
    $('fmbQuestions').innerHTML = h;
  }
  function colourOptions() {
    var box = $('q6opts');
    if (box.getAttribute('data-built') === '1') return;
    box.innerHTML = COLOURS.map(function (col) {
      var sw = '<span class="fmb-sw" style="background:' + (SWATCH[col.toLowerCase()] || '#777') + '"></span>';
      return opt('q6', 'checkbox', col, col, '', sw);
    }).join('') + opt('q6', 'checkbox', 'open', 'Open minded', '', SVG.open, 'open');
    box.setAttribute('data-built', '1');
    syncInputs('q6');
  }
  function syncInputs(q) {
    var sec = $('s-' + q); if (!sec) return;
    var vals = [];
    if (q === 'qp') vals = [A.px];
    else if (q === 'qi') vals = [A.interest];
    else if (q === 'qw') vals = [A.who];
    else if (q === 'ql') vals = [A.life];
    else if (q === 'qmi') vals = [A.miles];
    else if (q === 'qpe') vals = [A.people];
    else if (q === 'qb') vals = [A.boot];
    else if (q === 'qc') vals = [A.charge];
    else if (q === 'q7') vals = [A.when];
    else if (MULTI[q]) vals = OPEN[q] && !(A[MULTI[q]] || []).length ? ['open'] : (A[MULTI[q]] || []).concat(OPEN[q] && q === 'qm' ? ['open'] : []);
    sec.querySelectorAll('input[name=' + q + ']').forEach(function (i) { i.checked = vals.indexOf(i.value) !== -1; });
    if (q === 'q4') {
      sec.querySelectorAll('input[name=pay]').forEach(function (i) { i.checked = i.value === A.pay; });
      sec.querySelectorAll('input[name=mo]').forEach(function (i) { i.checked = A.mo !== null && i.value === String(A.mo); });
      sec.querySelectorAll('input[name=dep]').forEach(function (i) {
        i.checked = depTouched && (A.dep === null ? i.value === '-1' : i.value === String(A.dep));
      });
      sec.querySelectorAll('input[name=cash]').forEach(function (i) { i.checked = A.cash !== null && i.value === String(A.cash); });
      q4Panels();
    }
  }
  function q4Panels() {
    $('q4m').hidden = A.pay !== 'monthly';
    $('q4c').hidden = A.pay !== 'cash';
    $('q4n').hidden = A.pay !== 'notsure';
    $('q4low').hidden = !(A.pay === 'monthly' && lowCov());
  }
  /* nothing on screen: only the zero match event, for Dan's reports */
  var lastN = null, zeroSent = {};
  function counter() {
    if (!snapOK) return;
    var n = M.countIn(M.data().home, A, {});
    if (n === 0 && lastN !== 0 && lastN !== null && QS().indexOf(cur) !== -1 && !zeroSent[cur]) {
      zeroSent[cur] = 1; track('fmb_zero_match', { step: QS().indexOf(cur) + 1, step_name: STEP_NAME[cur] });
    }
    lastN = n;
  }
  function needs(q) {
    var single = { qi: ['interest', 'Tap new, used or either to carry on'], qw: ['who', 'Tap who drives it to carry on'],
      ql: ['life', 'Tap the week that fits best to carry on'], qmi: ['miles', 'Tap a mileage to carry on'],
      qpe: ['people', 'Tap how many people to carry on'], qb: ['boot', 'Tap the boot that fits to carry on'],
      qc: ['charge', 'Tap whether you can charge at home'], qp: ['px', 'Tap Yes, No or Maybe to carry on'],
      q7: ['when', 'Tap when you would like it to carry on'] };
    if (single[q]) return A[single[q][0]] ? '' : single[q][1];
    if (q === 'q4') {
      if (!A.pay) return 'Tap how you would like to pay to carry on';
      if (A.pay === 'monthly' && A.mo === null) return 'Tap your monthly budget to carry on';
      if (A.pay === 'monthly' && !depTouched) return 'Now tap a deposit, or Not sure';
      if (A.pay === 'cash' && A.cash === null) return 'Tap your total budget to carry on';
      return '';
    }
    if (MULTI[q] && !((A[MULTI[q]] || []).length || OPEN[q])) {
      return { qm: 'Tap a model, or Open to ideas', q2: 'Tap a shape, or Open minded', q3: 'Tap a fuel, or Open minded',
        q5: 'Tap anything you want, or Not fussed', q6: 'Tap a colour, or Open minded' }[q];
    }
    return '';
  }
  function nextLabel() {
    var b = $('fmbNext'), q = cur, need = needs(q);
    var path = QS();
    b.textContent = q === path[path.length - 1] ? 'Show my matches' : 'Continue';
    b.disabled = !!need;
  }
  function refresh() {
    if (QS().indexOf(cur) !== -1 || ALLQ.indexOf(cur) !== -1) {
      if (cur === 'q6') colourOptions();
      if (cur === 'q4') q4Panels();
      counter(); nextLabel();
    }
  }

  /* ---------------- answering ---------------- */
  var autoT = null;
  var RADIO_AUTO = { qi: 1, qw: 1, ql: 1, qmi: 1, qpe: 1, qb: 1, qc: 1, qp: 1, q7: 1 };
  function onChange(e) {
    var i = e.target; if (!i || !i.name) return;
    var q = i.name, v = i.value;
    if (q === 'qi' && (v === 'new' || v === 'either')) want('newc');
    if (q === 'qi') A.interest = v;
    else if (q === 'qp') A.px = v;
    else if (q === 'qw') A.who = v;
    else if (q === 'ql') A.life = v;
    else if (q === 'qmi') A.miles = v;
    else if (q === 'qpe') A.people = v;
    else if (q === 'qb') A.boot = v;
    else if (q === 'qc') A.charge = v;
    else if (q === 'q7') A.when = v;
    else if (MULTI[q]) {
      var sec = $('s-' + q), boxes = sec.querySelectorAll('input[name=' + q + ']');
      if (v === 'open' && i.checked && q !== 'qm') boxes.forEach(function (b) { if (b.value !== 'open') b.checked = false; });
      if (v !== 'open' && i.checked && q !== 'qm') boxes.forEach(function (b) { if (b.value === 'open') b.checked = false; });
      var on = []; boxes.forEach(function (b) { if (b.checked && b.value !== 'open') on.push(b.value); });
      A[MULTI[q]] = on;
      OPEN[q] = !!sec.querySelector('input[value=open]:checked') && (q === 'qm' || !on.length);
      if (q === 'qm') A.modelOpen = OPEN.qm;
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
  function onClick(e) {
    var lab = e.target.closest && e.target.closest('.fmb-opt');
    if (!lab || !e.detail) return;
    var inp = lab.querySelector('input');
    if (!inp || !RADIO_AUTO[inp.name]) return;
    clearTimeout(autoT);
    autoT = setTimeout(function () { if (cur === inp.name) next(); }, 300);
  }

  /* ---------------- navigation ---------------- */
  function ORDER() { return ['intro'].concat(QS(), ['matching', 'reveal']); }
  function screenEl(s) { return s === 'intro' ? $('s-intro') : $('s-' + s); }
  function show(s, back) {
    var prev = cur;
    document.querySelectorAll('.fmb-screen').forEach(function (el) { el.hidden = true; el.classList.remove('fmb-anim-in', 'back'); });
    var el = screenEl(s); if (!el) { s = 'intro'; el = $('s-intro'); }
    cur = s;
    el.hidden = false;
    void el.offsetWidth; el.classList.add('fmb-anim-in'); if (back) el.classList.add('back');
    var path = QS(), qi = path.indexOf(s), NQ = path.length;
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
      if (prev !== s) track('fmb_step', { step: qi + 1, step_name: STEP_NAME[s], of: NQ });
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
    var path = QS();
    var vals = MULTI[q] ? (A[MULTI[q]] || []).concat(OPEN[q] ? ['open'] : [])
      : q === 'q4' ? [A.pay || '', A.mo === null ? '' : String(A.mo), A.dep === null ? 'notsure' : String(A.dep == null ? '' : A.dep), A.cash == null ? '' : String(A.cash)]
      : [A[{ qi: 'interest', qw: 'who', ql: 'life', qmi: 'miles', qpe: 'people', qb: 'boot', qc: 'charge', qp: 'px', q7: 'when' }[q]] || ''];
    track('fmb_answer', { step: path.indexOf(q) + 1, step_name: STEP_NAME[q], answer: vals.filter(function (x) { return x !== '' && x != null; }).join(',').slice(0, 100),
      open_minded: OPEN[q] || A.interest === 'either' ? 'yes' : 'no', match_count: snapOK ? M.countIn(M.data().home, A, {}) : -1 });
  }
  function next() {
    var path = QS(), qi = path.indexOf(cur);
    if (qi === -1) return;
    if (needs(cur)) { nextLabel(); return; }
    answerTrack(cur);
    var path2 = QS();
    qi = path2.indexOf(cur);
    if (qi < path2.length - 1) go(path2[qi + 1]);
    else runMatching();
  }
  function back() {
    var path = QS(), qi = path.indexOf(cur);
    track('fmb_back', { from_step: qi + 1 });
    if (qi > 0) go(path[qi - 1], true); else go('intro', true);
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
    RESULT.totals = M.stockTotal(A);
    moreShown = false; revealTracked = false;
    SHOWN = RESULT.list.slice(0, 3);
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
      + '<div class="fmb-ph"' + (c.reg ? ' data-aos-reg="' + esc(c.reg) + '" data-aos-src="' + (c._home ? 'forecourt' : 'group') + '"' : '') + '>' + (best ? '<span class="fmb-ribbon">' + (r.level === 0 ? 'My top pick' : 'Closest match') + '</span>' : '')
      + (showPct ? '<span class="fmb-pct' + (r.pct >= 80 ? ' hi' : '') + '">' + r.pct + '% match<i style="width:0" data-w="' + r.pct + '"></i></span>' : '')
      + (u ? '<img src="' + esc(u) + '" alt="' + esc(alt) + '" width="640" height="360" loading="' + (i < 3 ? 'eager' : 'lazy') + '" decoding="async"/>'
           : '<div class="sil">' + (SIL[c._prim] || SIL[c._bodies[0]] || SIL.saloon) + '</div>')
      + '</div><div class="fmb-cb">'
      + '<div class="fmb-pills">' + [c.year, c.reg, c.mileage].filter(Boolean).map(function (x) { return '<span>' + esc(String(x).replace(/\u00a0/g, ' ')) + '</span>'; }).join('') + '</div>'
      + '<h3>' + esc(modelName(c)) + '</h3>'
      + '<div class="fmb-price">' + esc(c.price || 'Price on request') + '</div>'
      + (flags.length ? '<div class="fmb-flags">' + flags.join('') + '</div>' : '')
      + (!c._home ? '<p class="fmb-grpline">I can source this one from across the group.</p>' : '')
      + (best && r.level === 0 ? '<div class="fmb-why"><b>Why this one</b><ul class="fmb-whylist">' + String(r.why).split(', ').map(function (x) { return '<li>' + esc(cap1(x)) + '</li>'; }).join('') + '</ul></div>'
              : '<p class="fmb-why"><b>Why it fits:</b> ' + esc(r.why) + '</p>')
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
    var spec = [c.colour, c.fuel, c.drive === 'All Wheel' ? 'xDrive' : ''].filter(Boolean).join(', ');
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
    var list = NEWRES.fit || NEWRES.list || [];
    if (!wantsNew() || !list.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = '<div class="fmb-narrow fmb-head"><h2>Brand new, already built, and a fit for you</h2>'
      + '<ul class="fmb-subs"><li>Unregistered BMWs available through Hedin Ruxley that match what you told me.'
      + (NEWRES.count > list.length ? ' I have ' + NEWRES.count + ' that fit, so I\u2019ll send you the rest.' : '') + '</li></ul></div>'
      + '<div class="fmb-cards">' + list.map(newCard).join('') + '</div>'
      + '<p class="fmb-print">Pictures are configurator renders of that specification. Prices and delivery times come from BMW and can change. Finance subject to status.</p>';
    box.hidden = false;
    box.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('error', function () {
        var c = (NEWRES.fit || [])[Number(img.closest('[data-n]').getAttribute('data-n'))].c, d = document.createElement('div');
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
    var R = RESULT, list = R.list;
    var shownN = Math.min(list.length, moreShown ? 5 : 3);
    SHOWN = list.slice(0, shownN);
    var tight = R.level === 0 && R.nStrict > 0;
    head.textContent = tight ? M.heroLine(A, R.totals) : 'Nothing today nails every point, so leave it with me. Here are the closest, and I will come back to you personally.';
    var lines = [];
    if (tight) lines.push('<li>Here is my top pick, then a couple of alternatives.</li>');
    R.levels.filter(function (l) { return l > 0; }).sort().forEach(function (l) { lines.push('<li class="relax">' + esc(SUBS[l]) + '</li>'); });
    var widened = R.levels.filter(function (l) { return l >= 2; }).sort().map(function (l) { return RELAX[l]; });
    if (widened.length) lines.push('<li class="relax">What I widened: ' + esc(widened.join(', ')) + '.</li>');
    if (A.pay === 'monthly' && A.mo > 0 && !quotedAny) lines.push('<li>The lender isn\u2019t quoting any cars today, so I\u2019ve left the monthly budget out. Ask me for figures on any of them.</li>');
    else if (A.pay === 'monthly' && A.mo > 0 && lowCov()) lines.push('<li>The lender is only quoting some cars today, so I\u2019ve matched the rest on price. Ask me for figures on any of them.</li>');
    subs.innerHTML = lines.join('');
    cardsEl.innerHTML = list.map(function (r, i) { return (i === 1 ? '<h3 class="fmb-alt-h" data-alt>' + (list.length > 2 ? 'Two more worth a look' : 'One more worth a look') + '</h3>' : '') + card(r, i); }).join('') + (R.level >= 2 ? findCard() : '');
    cardsEl.querySelectorAll('.fmb-card[data-i]').forEach(function (el) { el.hidden = Number(el.getAttribute('data-i')) >= shownN; });
    /* Walkaround video and 360 spin (aos-media.js): only cards on screen are checked */
    if (window.aosMedia) window.aosMedia.scan(cardsEl);
    setTimeout(function () { if (window.aosMedia) window.aosMedia.scan(cardsEl); }, 1500);
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
    nextSteps();
    pxBox();
    leadBanner();
    if ((A.interest === 'new' || A.interest === 'either') && !(NEWRES.fit || []).length) {
      var note = document.createElement('p'); note.className = 'fmb-helper';
      note.textContent = 'No brand new car fits every point today. I\'ll be in touch with brand new options that suit you.';
      $('fmbNew').hidden = false; $('fmbNew').innerHTML = ''; $('fmbNew').appendChild(note);
    }
    if (!revealTracked) {
      revealTracked = true;
      track('fmb_reveal', { match_count: R.nStrict, stock_x: R.totals ? R.totals.total : 0, top_pct: list[0].pct == null ? -1 : list[0].pct,
        fallback_level: R.level, persona: p[0], quote_coverage: Math.round(coverage * 100) });
    }
  }
  var revealTracked = false;
  var BOOK = 'https://cal.com/danbmwruxley/bmw-ruxley-appointment-with-dan-in-sales';
  /* After the recommendation: test drive, valuation, WhatsApp (the main
     WhatsApp button is just below in #fmbLead). */
  function nextSteps() {
    var box = $('fmbNext2');
    if (!box) {
      box = document.createElement('div'); box.id = 'fmbNext2'; box.className = 'fmb-block fmb-next-steps';
      $('fmbLead').parentNode.insertBefore(box, $('fmbLead'));
    }
    box.innerHTML = '<h2>What happens next</h2>'
      + '<a class="fmb-btn ghost wide" id="fmbBook" href="' + BOOK + '" target="_blank" rel="noopener">Book a test drive with me</a>'
      + (A.px === 'yes' || A.px === 'maybe' ? '' : '<a class="fmb-btn ghost wide" href="appraisal.html">Get a valuation on your car</a>');
    var b = $('fmbBook');
    b.onclick = function () { track('booking_click', { link_location: 'fmb_results' }); track('fmb_book_click', { top_reg: SHOWN[0] ? SHOWN[0].c.reg : '' }); };
  }

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
    if (R.level === 0 && R.nStrict > 0) return 'Your match is ready.';
    return 'I\'ve found the closest matches for you.';
  }
  function matchCountText() {
    if (!RESULT) return '';
    return 'Your matches are ready';
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
    track('fmb_reveal_locked', { match_count: RESULT ? RESULT.nStrict : 0, persona: p[0] });
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
    if (!gateOpen) track('fmb_gate_view', { match_count: RESULT ? RESULT.nStrict : 0, px: A.px || 'none', interest: A.interest || 'either' });
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
    var R = RESULT || { nStrict: 0, level: 0, levels: [], seeUrl: '', list: [] };
    var ci = contactInfo(), opt = $('fOptin').checked;
    var top = R.list.slice(0, 5);
    var P = {
      form: 'find-my-bmw-v3',
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
      model: M.modelsText(A), who: M.txt(WHO, A.who), miles_a_year: M.txt(MILES_A, A.miles),
      people: M.txt(PEOPLE, A.people), boot: M.txt(BOOT, A.boot), charge: M.txt(CHARGE, A.charge),
      lifestyle: lifeText(A) || 'not answered', body: shapesText(A), fuel: fuelsText(A),
      pay_route: A.pay || 'not answered',
      monthly_max: A.pay === 'monthly' ? (A.mo ? String(A.mo) : 'No limit') : '',
      deposit: A.pay === 'monthly' ? (A.dep === null ? 'Not sure' : String(A.dep)) : '',
      cash_max: A.pay === 'cash' ? (A.cash ? String(A.cash) : 'Any price') : '',
      extras: extrasText(A), colours: A.colours.join(', ') || 'Open minded', timing: whenText(A) || 'not answered',
      persona: persona(A)[0],
      match_count_strict: String(R.nStrict || 0), stock_x: String(R.totals ? R.totals.total : ''),
      fallback_level: String(R.level),
      relaxed: R.levels.filter(function (l) { return l >= 2; }).map(function (l) { return RELAX[l]; }).join(', '),
      quote_coverage: Math.round(coverage * 100) + '%',
      top_regs: top.map(function (r) { return r.c.reg; }).join(', '),
      see_all_url: R.seeUrl || '',
      page_url: location.href.split('#')[0],
      leadsummary: waText(null, top)
    };
    if (wantsNew()) {
      P.new_match_count = String(NEWRES.count); P.stock_x = String(R.totals ? R.totals.total : '');
      P.new_matching_basis = 'BMW quotes assume ' + money(NEW_QUOTE_DEP) + ' down. Matched on ' + GBP + NEW_PER_1000
        + ' a month less per ' + GBP + '1,000 more deposit (more per ' + GBP + '1,000 less). Estimates for Dan only, not shown to the customer. '
        + (A.pay === 'monthly' ? (A.dep === null ? 'Deposit not sure, so matched at ' + money(NEW_QUOTE_DEP) + '.' : 'Customer deposit ' + money(A.dep) + '.') : 'Not a monthly brief.');
      (NEWRES.fit || []).forEach(function (r, i) {
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
      track('fmb_lead_sent', { match_count: RESULT ? RESULT.nStrict : 0, interest: A.interest || 'either' });
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
    L.push('Model: ' + M.modelsText(A));
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
    var newHit = newish && (NEWRES.fit || []).length > 0;
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
    $('fmbStart').addEventListener('click', function () { track('fmb_start', { entry: 'intro' }); go(QS()[0]); });
    $('fmbCarryOn').addEventListener('click', function () {
      var o = loadSaved(); if (!o) return go(QS()[0]);
      track('fmb_resume', { step: o.step }); track('fmb_start', { entry: 'resume' });
      if (o.step === 'reveal') runMatching(true);
      else go(ALLQ.indexOf(o.step) !== -1 ? o.step : QS()[0]);
    });
    $('fmbRestart').addEventListener('click', function () {
      A = blank(); OPEN = {}; depTouched = false;
      try { localStorage.removeItem(KEY); } catch (e) {}
      $('fmbResume').hidden = true;
      ALLQ.forEach(syncInputs);
      track('fmb_start', { entry: 'restart' }); go(QS()[0]);
    });
    $('fmbMore').addEventListener('click', function () {
      moreShown = true;
      document.querySelectorAll('#fmbCards .fmb-card[data-i]').forEach(function (el) { el.hidden = false; });
      SHOWN = RESULT.list.slice(0, 5);
      this.hidden = true;
      $('fmbSeeAll').hidden = !(RESULT.seeN > SHOWN.length);
      track('fmb_more_matches', { match_count: RESULT.nStrict });
      var c4 = document.querySelector('#fmbCards [data-i="3"] h3'); if (c4) { c4.tabIndex = -1; c4.focus(); }
    });
    $('s-reveal').addEventListener('click', function (e) {
      var a = e.target.closest('a'); if (!a) return;
      if (a.hasAttribute('data-newlike')) {
        var nr = (NEWRES.fit || NEWRES.list)[Number(a.getAttribute('data-newlike'))];
        a.href = WA + '?text=' + encodeURIComponent(waText(null, null, nr));
        track('fmb_card_whatsapp', { reg: nr.c.order_number, rank: (NEWRES.fit||[]).indexOf(nr) + 1, pct: -1, source: 'new' });
        markComplete('card_whatsapp');
      } else if (a.hasAttribute('data-like')) {
        var r = RESULT.list[Number(a.getAttribute('data-like'))];
        LIKED = r; a.href = waUrl(r);
        track('fmb_card_whatsapp', { reg: r.c.reg, rank: SHOWN.indexOf(r) + 1, pct: r.pct == null ? -1 : r.pct, source: r.c._home ? 'forecourt' : 'group' });
        markComplete('card_whatsapp');
      } else if (a.id === 'fmbFind' || a.hasAttribute('data-wa-main')) {
        a.href = waUrl(null);
        track('fmb_whatsapp_send', { match_count: RESULT ? RESULT.nStrict : 0, top_reg: SHOWN[0] ? SHOWN[0].c.reg : '', place: a.id ? 'find_card' : 'fail' });
        markComplete('whatsapp');
      }
    });
    function mainWa(place) {
      return function () {
        this.href = waUrl(null);
        track('fmb_whatsapp_send', { match_count: RESULT ? RESULT.nStrict : 0, top_reg: SHOWN[0] ? SHOWN[0].c.reg : '', place: place });
        markComplete('whatsapp');
      };
    }
    $('fmbWa').addEventListener('click', mainWa('main'));
    $('fmbSentWa').addEventListener('click', mainWa('sent'));
    $('fmbSeeAll').addEventListener('click', function () { track('fmb_see_all', { match_count: RESULT.seeN, all: 'yes' }); });
    $('fmbSentAll').addEventListener('click', function () { track('fmb_see_all', { match_count: RESULT.seeN, all: 'yes', place: 'sent' }); });
    wireGate();
    $('fmbPxPhotosWa2').addEventListener('click', pxPhotosClick);
    window.addEventListener('popstate', function (e) {
      var s = (e.state && e.state.s) || (location.hash || '').slice(1) || 'intro';
      if (s === 'matching') s = QS().slice(-1)[0];
      var back = ORDER().indexOf(s) < ORDER().indexOf(cur);
      if (back && QS().indexOf(cur) !== -1) track('fmb_back', { from_step: QS().indexOf(cur) + 1 });
      if (s === 'reveal') { if (!RESULT) compute(); show('reveal'); present(); }
      else { if (gateOpen) closeGate(); show(ORDER().indexOf(s) !== -1 ? s : 'intro', back); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && QS().indexOf(cur) !== -1 && e.target && e.target.matches && e.target.matches('#fmbQuestions input')) {
        e.preventDefault(); next();
      }
    });
  }

  /* ---------------- start ---------------- */
  function preAnswers() {
    var p = new URLSearchParams(location.search), any = false;
    var it = p.get('interest'); if (it && byV(INTEREST, it)) { A.interest = it; PRE.qi = any = true; }
    var life = p.get('life'); if (life && byV(LIFE, life)) { A.life = life; PRE.ql = any = true; }
    var model = (p.get('model') || '').split(',').filter(function (v) { return M.modelBy(v); });
    if (model.length) { A.models = model; PRE.qm = any = true; }
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
    ALLQ.forEach(function (q) { if (q !== 'q6') syncInputs(q); });
    history.replaceState({ s: 'intro' }, '', location.pathname + location.search + (hash && hash !== 'matching' ? '#' + hash : ''));
    if (hash === 'reveal' && saved) {
      track('fmb_resume', { step: 'reveal' });
      runMatching(true);
    } else if (ALLQ.indexOf(hash) !== -1) {
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
    newMatches: function (a) { return M.findNew(Object.assign(blank(), a), { stretch: false }); },
    newEstimate: function (order, dep) { var c = (M.data().newCars).filter(function (x) { return x.order_number === order; })[0]; return c ? newEstimate(c, dep) : null; },
    newReady: function () { return want('newc'); },
    waText: function (i) { return waText(i == null ? null : RESULT.list[i]); },
    matches: function (a) { return findMatches(Object.assign(blank(), a)); }, path: function () { return QS(); },
    ready: function () { return Promise.all([pSnap, pFin]); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
