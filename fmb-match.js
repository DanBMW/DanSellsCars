/* Shared Find my BMW matcher. Used by the public flow (fmb.js) and desk mode
 * (desk.js) so both recommend the same car for the same answers.
 *
 * Needs window.dsStock and window.dsFin, loaded first.
 * Answers shape (all optional; nothing is ever assumed):
 *   models[]   series ids, e.g. 'X5', '2gc', 'i4'. Empty or 'open' = open to ideas.
 *   interest   'new' | 'used' | 'either'
 *   who, life, miles, people, boot, charge   soft signals
 *   body[]     shape ids (suv, saloon, touring, hatchback, gran_coupe, coupe, convertible)
 *   fuel[]     fuel ids (petrol, diesel, hybrid, phev, electric)
 *   pay 'monthly'|'cash'|'notsure', mo (number or 0 = no limit), dep (number or null), cash (number or 0)
 *   extras[]   feature keys from dsStock.FEATURES, plus 'seven'
 *   colours[]  colour names
 *   when       timing id
 * Stock pools are injected with load(data) and are the same files stock.html reads.
 * Plain ES2017.
 */
window.fmbMatch = (function () {
  'use strict';

  var ST = window.dsStock, FN = window.dsFin;
  var GBP = '\u00a3';
  var NEW_QUOTE_DEP = 4500, NEW_PER_1000 = 24;
  /* Dan, 8 October: at the desk a brand new car up to 5% over budget is still
     worth showing. One setting, desk mode only. The public flow never uses it. */
  var NEW_STRETCH = 0.05;

  var DATA = { home: [], group: [], fin: {}, lad: {}, det: {}, newCars: [], finOK: false, coverage: 1, quotedAny: true };

  /* The full current range as a customer would say it. Not built from stock. */
  var MODELS = [
    { v: '1', t: '1 Series', series: ['1 Series'], body: ['hatchback'] },
    { v: '2c', t: '2 Series Coup\u00e9', series: ['2 Series'], body: ['coupe'] },
    { v: '2gc', t: '2 Series Gran Coup\u00e9', series: ['2 Series'], body: ['gran_coupe'] },
    { v: '2at', t: '2 Series Active Tourer', series: ['2 Series'], body: ['hatchback'] },
    { v: '3', t: '3 Series', series: ['3 Series'], body: ['saloon'] },
    { v: '3t', t: '3 Series Touring', series: ['3 Series'], body: ['touring'] },
    { v: '4c', t: '4 Series Coup\u00e9', series: ['4 Series'], body: ['coupe'] },
    { v: '4gc', t: '4 Series Gran Coup\u00e9', series: ['4 Series'], body: ['gran_coupe'] },
    { v: '4cv', t: '4 Series Convertible', series: ['4 Series'], body: ['convertible'] },
    { v: '5', t: '5 Series', series: ['5 Series'], body: ['saloon'] },
    { v: '5t', t: '5 Series Touring', series: ['5 Series'], body: ['touring'] },
    { v: '7', t: '7 Series', series: ['7 Series'], body: ['saloon'] },
    { v: 'X1', t: 'X1', series: ['X1'], body: ['suv'] },
    { v: 'X2', t: 'X2', series: ['X2'], body: ['suv'] },
    { v: 'X3', t: 'X3', series: ['X3'], body: ['suv'] },
    { v: 'X4', t: 'X4', series: ['X4'], body: ['suv', 'coupe'] },
    { v: 'X5', t: 'X5', series: ['X5'], body: ['suv'] },
    { v: 'X6', t: 'X6', series: ['X6'], body: ['suv', 'coupe'] },
    { v: 'X7', t: 'X7', series: ['X7'], body: ['suv'] },
    { v: 'XM', t: 'XM', series: ['XM'], body: ['suv'] },
    { v: 'i4', t: 'i4', series: ['i4'], body: ['gran_coupe'] },
    { v: 'i5', t: 'i5', series: ['i5'], body: ['saloon'] },
    { v: 'i7', t: 'i7', series: ['i7'], body: ['saloon'] },
    { v: 'iX1', t: 'iX1', series: ['iX1'], body: ['suv'] },
    { v: 'iX2', t: 'iX2', series: ['iX2'], body: ['suv'] },
    { v: 'iX3', t: 'iX3', series: ['iX3'], body: ['suv'] },
    { v: 'iX', t: 'iX', series: ['iX'], body: ['suv'] },
    { v: 'Z4', t: 'Z4', series: ['Z4'], body: ['convertible'] },
    { v: 'M', t: 'Looking for an M', series: [], body: [], mOnly: true }
  ];
  function modelBy(v) { for (var i = 0; i < MODELS.length; i++) if (MODELS[i].v === v) return MODELS[i]; return null; }

  var BODY = [
    { v: 'suv', t: 'SUV', l: 'X1 to X7, iX1, iX3, iX and friends', keys: ['suv'], stock: ['suv', 'suv-coupe'] },
    { v: 'saloon', t: 'Saloon', l: '3, 5 and 7 Series, i5 and i7', keys: ['saloon'], stock: ['saloon'] },
    { v: 'touring', t: 'Touring', l: 'The estate versions, for the boot space', keys: ['touring'], stock: ['estate'] },
    { v: 'hatchback', t: 'Hatchback', l: '1 Series, plus the Active Tourer and Gran Tourer', keys: ['hatchback', 'mpv'], stock: ['hatch', 'mpv'] },
    { v: 'gran_coupe', t: 'Gran Coup\u00e9', l: 'Four door coup\u00e9s: 2 and 4 Series, i4', keys: ['gran_coupe'], stock: ['gran-coupe'] },
    { v: 'coupe', t: 'Coup\u00e9', l: 'Two doors, plus the X4 and X6', keys: ['coupe'], stock: ['coupe', 'suv-coupe'] },
    { v: 'convertible', t: 'Convertible', l: 'Roof down days', keys: ['convertible'], stock: ['convertible'] }
  ];
  var BODY_NEAR = { saloon: ['gran_coupe', 'touring'], touring: ['suv', 'saloon'], suv: ['touring'],
    hatchback: ['gran_coupe'], coupe: ['gran_coupe', 'convertible'], convertible: ['coupe'], gran_coupe: ['saloon', 'coupe'] };
  var FUEL = [
    { v: 'petrol', t: 'Petrol', l: 'Includes petrol mild hybrids.', keys: ['petrol', 'mhev-petrol'] },
    { v: 'diesel', t: 'Diesel', l: 'Includes diesel mild hybrids.', keys: ['diesel', 'mhev-diesel'] },
    { v: 'hybrid', t: 'Hybrid', l: 'Petrol or diesel with an electric helper. Never needs plugging in.', keys: ['mhev-petrol', 'mhev-diesel'] },
    { v: 'phev', t: 'Plug-in hybrid', l: 'Electric for shorter trips, engine for the long ones.', keys: ['phev'] },
    { v: 'electric', t: 'Electric', l: 'Fully electric. Charge at home or out and about.', keys: ['electric'] }
  ];
  var FUEL_NEAR = { petrol: ['mhev-diesel'], diesel: ['mhev-petrol'], hybrid: ['petrol', 'diesel'],
    phev: ['electric', 'mhev-petrol', 'mhev-diesel'], electric: ['phev'] };
  var FUEL_NAME = { petrol: 'petrol', diesel: 'diesel', 'mhev-petrol': 'petrol mild hybrid',
    'mhev-diesel': 'diesel mild hybrid', phev: 'plug-in hybrid', electric: 'electric' };
  var WHO = [
    { v: 'me', t: 'Mostly me' }, { v: 'partner', t: 'My partner, or someone else' },
    { v: 'family', t: 'Shared around the family' }, { v: 'company', t: 'A company or pool car' }
  ];
  var LIFE = [
    { v: 'family', t: 'School runs and family life', l: 'Big shops, weekends away, everyone on board.' },
    { v: 'commute', t: 'The daily commute', l: 'Commutes and client visits, done in comfort.' },
    { v: 'miles', t: 'Big motorway miles', l: 'Long runs where comfort really counts.' },
    { v: 'thrill', t: 'Driving for fun', l: 'B roads, early starts, big grins.' },
    { v: 'style', t: 'Turning heads', l: 'Arrive looking the part.' },
    { v: 'open', t: 'A bit of everything', l: 'Honestly? A mix of all of it.' }
  ];
  var MILES = [
    { v: 'u6', t: 'Under 6,000' }, { v: '6to10', t: '6 to 10,000' }, { v: '10to15', t: '10 to 15,000' },
    { v: '15plus', t: '15,000 or more' }, { v: 'notsure', t: 'Not sure' }
  ];
  var PEOPLE = [
    { v: 'one', t: 'Just me' }, { v: 'two', t: 'Two of us' }, { v: 'four', t: 'Up to four' },
    { v: 'five', t: 'Five or more' }, { v: 'seven', t: 'We need 7 seats' }
  ];
  var BOOT = [
    { v: 'small', t: 'Not much' }, { v: 'normal', t: 'A normal boot is fine' },
    { v: 'big', t: 'A big boot', l: 'Bikes, dogs, luggage, the lot.' }, { v: 'tow', t: 'I tow' }
  ];
  var CHARGE = [
    { v: 'yes', t: 'Yes, I can charge at home' }, { v: 'no', t: 'Not easily' }, { v: 'notsure', t: 'Not sure yet' }
  ];
  var WHEN = [
    { v: 'now', t: 'As soon as possible' }, { v: 'month', t: 'Within a month' },
    { v: 'quarter', t: 'In the next few months' }, { v: 'browsing', t: 'Just browsing for now' }
  ];
  var MONTHLY = [300, 400, 500, 650, 800, 1000, 0];
  var DEPS = [0, 1000, 2500, 5000, 10000, -1];
  var CASH = [{ v: 20000, t: 'Under ' + GBP + '20k' }, { v: 30000, t: 'Up to ' + GBP + '30k' },
    { v: 50000, t: 'Up to ' + GBP + '50k' }, { v: 70000, t: 'Up to ' + GBP + '70k' }, { v: 0, t: 'Any price' }];
  var CASH_BANDS = { 20000: 'u20', 30000: 'u20,20to30', 50000: 'u20,20to30,30to50', 70000: 'u20,20to30,30to50,50to70' };
  var EXTRAS = ['heated', 'pano', 'hud', 'sound', 'keyless', 'acc', 'xdrive', 'towbar', 'seven'];
  var COLOURS = ['Black', 'White', 'Grey', 'Silver', 'Blue', 'Red', 'Green'];
  var SWATCH = { grey: '#8a8d91', black: '#1b1d20', white: '#e8e6e1', blue: '#2f5f9e', green: '#3d6b4a',
    red: '#8c2f2f', silver: '#b9bcc0', purple: '#5b3f78', beige: '#cdbb98', brown: '#6b4a33',
    orange: '#c9702d', yellow: '#d8b73a' };
  function byV(list, v) { for (var i = 0; i < list.length; i++) if (list[i].v === v) return list[i]; return null; }
  function money(n) { return FN.money(n); }
  function money2(n) { return FN.money2(n); }
  function cap1(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function list(arr, word) { if (!arr.length) return ''; if (arr.length === 1) return arr[0]; return arr.slice(0, -1).join(', ') + ' ' + word + ' ' + arr[arr.length - 1]; }

  function blank() {
    return { models: [], modelOpen: false, interest: null, who: null, life: null, miles: null, people: null,
      boot: null, charge: null, body: [], fuel: [], pay: null, mo: null, dep: null, cash: null,
      extras: [], must: [], colours: [], when: null, px: null };
  }

  function stamp(c, home) {
    c._price = ST.num(c.price); c._miles = ST.num(c.mileage); c._year = ST.num(c.year);
    c._hp = ST.num(c.power); c._home = !!home;
    c._m = /(^|\s)M\d|\sM\d{2,3}[a-z]*\b|^BMW M\d/.test(c.model || '');
    c._fuel = ST.fuelKey(c); c._bodies = ST.bodyKeys(c); c._prim = ST.bodyPrimary(c);
    c._boot = 0;
    return c;
  }
  var NEW_FUEL = { petrol: 'petrol', diesel: 'diesel', phev: 'phev', electric: 'electric' };
  function newBody(c) {
    var d = String(c.description || ''), s = String(c.series || '');
    if (/gran\s*coup/i.test(d)) return 'Coupe';
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
  function bootOf(id) { var d = DATA.det[id]; return d && d.boot_l ? Number(d.boot_l) : 0; }

  function load(d) {
    d = d || {};
    if (d.home) DATA.home = d.home.map(function (c) { return stamp(c, true); });
    if (d.group) DATA.group = d.group.map(function (c) { return stamp(c, false); });
    if (d.fin) { DATA.fin = d.fin; DATA.finOK = true; }
    if (d.lad) DATA.lad = d.lad;
    if (d.det) DATA.det = d.det;
    if (d.newCars) DATA.newCars = (d.newCars.cars || d.newCars || []).filter(function (c) { return !c.on_hold; }).map(stampNew);
    if (DATA.home.length && DATA.finOK) {
      var q = 0; DATA.home.forEach(function (c) { if (FN.live(DATA.fin[c.id])) q++; });
      DATA.coverage = q / DATA.home.length; DATA.quotedAny = q > 0;
    }
    capCache = {};
    return DATA;
  }

  function chosenModels(a) { return (a.models || []).filter(function (v) { return v !== 'open'; }); }
  function modelOpen(a) { return !!(a.modelOpen || !(a.models && a.models.length)); }
  function wantsM(a) { return chosenModels(a).indexOf('M') !== -1; }
  function seriesWanted(a) {
    var s = {};
    chosenModels(a).forEach(function (v) { var m = modelBy(v); if (m) (m.series || []).forEach(function (x) { s[x] = 1; }); });
    return Object.keys(s);
  }
  /* Shape is implied when every chosen model agrees on one body. */
  function impliedBodies(a) {
    var ms = chosenModels(a).map(modelBy).filter(function (m) { return m && m.body && m.body.length; });
    if (!ms.length || wantsM(a)) return [];
    var first = ms[0].body.slice().sort().join('|');
    for (var i = 1; i < ms.length; i++) if (ms[i].body.slice().sort().join('|') !== first) return [];
    return ms[0].body.slice();
  }
  function shapeLocked(a) { return impliedBodies(a).length > 0 && !(a.body && a.body.length); }
  function effectiveBody(a) { return (a.body && a.body.length) ? a.body : impliedBodies(a); }
  function needsCharge(a) {
    var f = a.fuel || [];
    if (f.indexOf('electric') !== -1 || f.indexOf('phev') !== -1) return true;
    return chosenModels(a).some(function (v) { return /^i/.test(v); });
  }

  function bodySet(vals, near) {
    var k = {};
    (vals || []).forEach(function (v) {
      var o = byV(BODY, v); if (o && o.keys) o.keys.forEach(function (x) { k[x] = 1; });
      if (near) (BODY_NEAR[v] || []).forEach(function (n) { var b = byV(BODY, n); if (b) b.keys.forEach(function (x) { k[x] = 1; }); });
    });
    return k;
  }
  function fuelSet(vals, near) {
    var k = {};
    (vals || []).forEach(function (v) {
      var o = byV(FUEL, v); if (o && o.keys) o.keys.forEach(function (x) { k[x] = 1; });
      if (near) (FUEL_NEAR[v] || []).forEach(function (x) { k[x] = 1; });
    });
    return k;
  }
  function bodyHit(c, vals, near) { var k = bodySet(vals, near); return c._bodies.some(function (b) { return k[b]; }); }
  function fuelHit(c, vals, near) { return !!fuelSet(vals, near)[c._fuel]; }
  function seriesHit(c, a) {
    var s = seriesWanted(a);
    if (!s.length && !wantsM(a)) return true;
    var ok = s.length && s.indexOf(c.series) !== -1;
    if (wantsM(a) && c._m) ok = true;
    return ok;
  }
  function hasCeiling(a) { return (a.pay === 'monthly' && a.mo > 0) || (a.pay === 'cash' && a.cash > 0); }
  function wantsSeven(a) { return (a.extras || []).indexOf('seven') !== -1 || a.people === 'seven'; }
  function feature(c, k) { return ST.hasFeature(c, DATA.det[c.id] || null, k) === true; }

  var capCache = {};
  function finAt(c, dep) { return FN.at(DATA.fin[c.id], DATA.lad[c.id], dep === null || dep === undefined ? null : dep); }
  function lowCov() { return DATA.finOK && DATA.coverage < 0.6; }
  function priceCap(a, stretch) {
    var k = a.mo + '|' + a.dep + '|' + stretch;
    if (capCache[k] !== undefined) return capCache[k];
    var lim = a.mo * (1 + stretch), best = 0;
    DATA.home.concat(DATA.group).forEach(function (c) {
      var f = finAt(c, a.dep); if (f && f.monthly <= lim && c._price > best) best = c._price;
    });
    capCache[k] = best; return best;
  }
  function budgetMet(c, a, stretch, strictQuotes) {
    stretch = stretch || 0;
    if (a.pay === 'monthly' && a.mo > 0) {
      if (!DATA.quotedAny && !strictQuotes) return true;
      var f = finAt(c, a.dep);
      if (f) return f.monthly <= a.mo * (1 + stretch);
      if (lowCov() && !strictQuotes) return c._price <= priceCap(a, stretch);
      return false;
    }
    if (a.pay === 'cash' && a.cash > 0) return c._price > 0 && c._price < a.cash * (1 + stretch);
    return true;
  }
  function matches(c, a, R) {
    R = R || {};
    if (!R.anyModel && !seriesHit(c, a)) return false;
    var body = effectiveBody(a);
    if (body.length && !R.anyShape && !bodyHit(c, body, R.bodyN)) return false;
    if ((a.fuel || []).length && !R.anyFuel && !fuelHit(c, a.fuel, R.fuelN)) return false;
    if (!budgetMet(c, a, R.stretch, R.strictQuotes)) return false;
    if (!R.noSeven && wantsSeven(a) && String(c.seats) !== '7') return false;
    /* desk mode Must have: firm features rule a car out (used cars, where the
       equipment list can be read). */
    if (!R.noMust && (a.must || []).length && !a.must.every(function (k) { return k === 'seven' || feature(c, k); })) return false;
    return true;
  }
  function countIn(pool, a, R) { var n = 0; for (var i = 0; i < pool.length; i++) if (matches(pool[i], a, R)) n++; return n; }

  function shapeName(c) {
    var map = { suv: 'SUV', saloon: 'Saloon', touring: 'Touring', hatchback: 'Hatchback', mpv: 'MPV',
      gran_coupe: 'Gran Coup\u00e9', coupe: 'Coup\u00e9', convertible: 'Convertible', suv_coupe: 'SUV coup\u00e9' };
    return map[c._prim] || c.body || 'Another shape';
  }
  function extraWord(k) { if (k === 'xdrive') return 'xDrive'; if (k === 'sound') return 'Harman Kardon or better'; return (ST.FEATURES[k] || { label: k }).label.toLowerCase(); }

  function evaluate(c, a) {
    var got = 0, max = 0, soft = 0, miss = [];
    var f = finAt(c, a.pay === 'monthly' ? a.dep : null);
    var body = effectiveBody(a);
    if (body.length) { max += 3; if (bodyHit(c, body)) got += 3; else miss.push(shapeName(c) + ', not ' + list(body.map(function (v) { return byV(BODY, v).t; }), 'or')); }
    if ((a.fuel || []).length) { max += 3; if (fuelHit(c, a.fuel)) got += 3; else miss.push(cap1(FUEL_NAME[c._fuel] || 'another fuel') + ', not ' + list(a.fuel.map(function (v) { return byV(FUEL, v).t.toLowerCase(); }), 'or')); }
    if (hasCeiling(a)) {
      max += 3;
      if (budgetMet(c, a, 0)) got += 3;
      else if (a.pay === 'monthly' && f) miss.push(money(Math.ceil(f.monthly - a.mo)) + ' a month over your budget');
      else if (a.pay === 'monthly') miss.push('No lender quote at your deposit yet');
      else miss.push(money(c._price - a.cash + 1) + ' over your budget');
    }
    if (wantsSeven(a)) { max += 3; if (String(c.seats) === '7') got += 3; else miss.push((c.seats || '5') + ' seats'); }
    var metMust = [];
    (a.must || []).forEach(function (k) { if (k === 'seven') return; max += 3; if (feature(c, k)) { got += 3; metMust.push(k); } else miss.push('no ' + extraWord(k)); });
    var ss = seriesWanted(a);
    if (ss.length || wantsM(a)) { max += 2; soft += 2; if (seriesHit(c, a)) got += 2; }
    if ((a.colours || []).length) { max += 2; soft += 2; if (a.colours.indexOf(c.colour) !== -1) got += 2; }
    var metExtras = [];
    (a.extras || []).forEach(function (k) {
      if (k === 'seven') return;
      max += 1; soft += 1;
      if (feature(c, k)) { got += 1; metExtras.push(k); }
    });
    var pct = max ? Math.round(100 * got / max) : null;
    var s = c._home ? 12 : 0, aff = 0, b = c._bodies;
    function has(k) { return b.indexOf(k) !== -1; }
    var life = a.life;
    if (life === 'family' || a.who === 'family') { if (has('suv') || has('touring') || has('mpv')) aff += 4; if (String(c.seats) === '7') aff += 4; }
    if (life === 'commute') { if (has('saloon')) aff += 4; if (c._fuel === 'electric' || c._fuel === 'phev') aff += 4; }
    if (life === 'miles' || a.miles === '15plus' || a.miles === '10to15') { if (/diesel/.test(c._fuel) || c._fuel === 'phev') aff += 4; if (has('saloon') || has('touring')) aff += 4; }
    if (life === 'thrill') { if (c._m || c._hp >= 250) aff += 4; if (has('coupe') || has('convertible')) aff += 4; }
    if (life === 'style') { if (has('coupe') || has('gran_coupe') || has('convertible')) aff += 4; if (c._year >= new Date().getFullYear() - 2) aff += 4; }
    if (a.people === 'five' && Number(c.seats) >= 5) aff += 3;
    if (a.boot === 'big') { var boot = bootOf(c.id); if (boot >= 500 || has('touring') || has('suv')) aff += 4; }
    if (a.boot === 'tow' && feature(c, 'towbar')) aff += 4;
    if (a.charge === 'yes' && (c._fuel === 'electric' || c._fuel === 'phev')) aff += 4;
    if (a.charge === 'no' && c._fuel === 'electric') aff -= 4;
    s += Math.min(10, aff);
    if (a.pay === 'monthly' && a.mo > 0 && f && f.monthly <= a.mo) s += (f.monthly / a.mo >= 0.8) ? 5 : 2;
    if (f && (a.pay === 'monthly' || a.pay === 'notsure' || !a.pay)) s += 4;
    if (c.image) s += 3;
    s += Math.max(0, c._year - 2018) + Math.max(0, 8 - c._miles / 10000);
    return { c: c, pct: pct, score: s, fin: f, miss: miss, metExtras: metMust.concat(metExtras), soft: soft, quoted: !!f };
  }
  function pctOf(r) { return r.pct == null ? 0 : r.pct; }
  function better(x, xs, y, ys) {
    if (pctOf(x) !== pctOf(y)) return pctOf(x) > pctOf(y);
    if (lowCov() && x.quoted !== y.quoted) return x.quoted;
    return xs > ys;
  }
  function sig(r) { return (r.c.series || '') + '|' + r.c._fuel + '|' + r.c._prim; }
  function pick(cands, n, a, picked) {
    var out = [], pool = cands.slice();
    var body = effectiveBody(a);
    var variety = !(body.length === 1 && (a.fuel || []).length === 1 && seriesWanted(a).length <= 1);
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

  var RELAX = { 7: 'must haves relaxed', 2: 'budget plus 10%', 3: 'closest fuels', 4: 'nearby shapes', 5: '7 seats dropped', 6: 'model, shape, fuel and wish list set aside' };
  var SUBS = {
    7: 'Nothing had every must have, so a couple are missing one.',
    2: 'Nothing hit every number, so a couple are just over budget.',
    3: 'I\u2019ve included the closest fuel options too.',
    4: 'I\u2019ve widened the shapes a little.',
    5: 'I couldn\u2019t find a 7 seater that fits today.',
    6: 'Nothing close enough today, so here are a few I\u2019d look at.'
  };

  /* X is the whole group: Ruxley plus the other branches, de-duplicated by reg.
     New cars join X only when the brief asks for new or either. */
  function stockTotal(a) {
    var seen = {}, n = 0;
    function add(pool) { pool.forEach(function (c) { var k = String(c.reg || c.id || '').replace(/\s/g, '').toUpperCase(); if (seen[k]) return; seen[k] = 1; n++; }); }
    add(DATA.home); add(DATA.group);
    var used = n;
    var neu = wantsNew(a) ? DATA.newCars.length : 0;
    return { used: used, neu: neu, total: used + neu, home: DATA.home.length, group: DATA.group.length };
  }
  function wantsNew(a) { return a.interest === 'new' || a.interest === 'either'; }

  function findUsed(a) {
    var res = [], seen = {}, levels = [];
    var pool = DATA.home.concat(DATA.group);
    function add(R, lvl, limit) {
      var c = pool.filter(function (x) { return !seen[x.id] && matches(x, a, R); }).map(function (x) { return evaluate(x, a); });
      var got = pick(c, Math.max(0, limit - res.length), a, res);
      got.forEach(function (r) { r.level = lvl; seen[r.c.id] = 1; res.push(r); });
      if (got.length && levels.indexOf(lvl) === -1) levels.push(lvl);
    }
    var nStrict = countIn(pool, a, {});
    add({}, 0, 5);
    var R = {};
    if (res.length < 3 && hasCeiling(a)) { R = { stretch: 0.1 }; add(R, 2, 3); }
    if (res.length < 3 && (a.fuel || []).length) { R = Object.assign({}, R, { fuelN: true }); add(R, 3, 3); }
    if (res.length < 3 && effectiveBody(a).length) { R = Object.assign({}, R, { bodyN: true }); add(R, 4, 3); }
    if (res.length < 3 && (a.must || []).length) { R = Object.assign({}, R, { noMust: true }); add(R, 7, 3); }
    if (res.length < 3 && wantsSeven(a)) { R = Object.assign({}, R, { noSeven: true }); add(R, 5, 3); }
    if (res.length < 3) add({ anyModel: true, anyShape: true, anyFuel: true, noSeven: true, noMust: true }, 6, 3);
    if (res.length < 3) {
      var newest = DATA.home.filter(function (x) { return !seen[x.id]; }).sort(function (x, y) { return y._year - x._year || x._miles - y._miles; });
      newest.slice(0, 3 - res.length).forEach(function (x) { var r = evaluate(x, a); r.level = 6; seen[x.id] = 1; res.push(r); });
      if (levels.indexOf(6) === -1) levels.push(6);
    }
    var level = levels.length ? Math.max.apply(null, levels.map(function (l) { return l === 7 ? 4.5 : l; })) : 0;
    res.forEach(function (r) { r.relaxed = r.level >= 2 ? RELAX[r.level] : ''; r.why = spokenWhy(r, a); });
    var seeN = countIn(pool, a, { strictQuotes: true });
    return { list: res, level: level, levels: levels, nStrict: nStrict, seeN: seeN, seeUrl: seeAllUrl(a) };
  }

  function seeAllUrl(a) {
    var p = [];
    var body = effectiveBody(a);
    if (body.length) {
      var b = []; body.forEach(function (v) { var o = byV(BODY, v); if (o) o.stock.forEach(function (k) { if (b.indexOf(k) === -1) b.push(k); }); });
      p.push('body=' + b.join(','));
    }
    if ((a.fuel || []).length) {
      var f = []; a.fuel.forEach(function (v) { var o = byV(FUEL, v); if (o) o.keys.forEach(function (k) { if (f.indexOf(k) === -1) f.push(k); }); });
      p.push('fuel=' + f.join(','));
    }
    if (a.pay === 'monthly') { if (a.dep !== null) p.push('dep=' + a.dep); if (a.mo > 0) p.push('mo=' + a.mo); p.push('sort=monthly-asc'); }
    if (a.pay === 'cash' && a.cash > 0) p.push('price=' + CASH_BANDS[a.cash]);
    if (wantsSeven(a)) p.push('seats=7');
    p.push('all=1'); p.push('from=fmb');
    return 'https://dan-sells.co.uk/stock.html?' + p.join('&');
  }

  function newEstimate(c, dep) {
    if (!c._quoted) return null;
    var d = dep === null || dep === undefined ? NEW_QUOTE_DEP : dep;
    return Math.round((c._quoted - NEW_PER_1000 * (d - NEW_QUOTE_DEP) / 1000) * 100) / 100;
  }
  /* How far over a monthly budget a new car is, as a share of its cash price.
     5% off the cash price is worth 5% of the quoted monthly, using the car's
     own monthly to price ratio. Returns null when it fits or cannot be priced. */
  function newOver(c, a) {
    if (a.pay === 'monthly' && a.mo > 0) {
      var est = newEstimate(c, a.dep);
      if (est === null || !c._quoted) return null;
      if (est <= a.mo) return { over: 0, est: est };
      return { over: (est - a.mo) / c._quoted, est: est };
    }
    if (a.pay === 'cash' && a.cash > 0) {
      if (!(c._price > 0)) return null;
      if (c._price < a.cash) return { over: 0, est: null };
      return { over: (c._price - a.cash) / a.cash, est: null };
    }
    return { over: 0, est: newEstimate(c, a.dep) };
  }
  function newHard(c, a, stretch) {
    if (!seriesHit(c, a)) return false;
    var body = effectiveBody(a);
    if (body.length && !bodyHit(c, body)) return false;
    if ((a.fuel || []).length && !fuelHit(c, a.fuel)) return false;
    if (wantsSeven(a) && String(c.seats) !== '7') return false;
    var o = newOver(c, a);
    if (!o) return false;
    return o.over <= (stretch || 0) + 1e-9;
  }
  function findNew(a, opts) {
    opts = opts || {};
    if (!wantsNew(a)) return { fit: [], reach: [], count: 0 };
    var stretch = opts.stretch ? NEW_STRETCH : 0;
    var fit = [], reach = [];
    DATA.newCars.forEach(function (c) {
      if (!newHard(c, a, stretch)) return;
      var o = newOver(c, a);
      var row = { c: c, est: o.est, over: o.over, pct: Math.round(o.over * 1000) / 10 };
      if (o.over <= 1e-9) fit.push(row); else reach.push(row);
    });
    function rank(x, y) {
      var cx = (a.colours || []).indexOf(x.c.colour) !== -1 ? 0 : 1, cy = (a.colours || []).indexOf(y.c.colour) !== -1 ? 0 : 1;
      return cx - cy || (x.c.lead_time_weeks_max || 99) - (y.c.lead_time_weeks_max || 99) || x.c._price - y.c._price;
    }
    fit.sort(rank); reach.sort(function (x, y) { return x.over - y.over || rank(x, y); });
    function take(rows, n) {
      var out = [], seen = {};
      rows.forEach(function (r) { if (out.length < n && !seen[r.c.description]) { seen[r.c.description] = 1; out.push(r); } });
      rows.forEach(function (r) { if (out.length < n && out.indexOf(r) === -1) out.push(r); });
      return out;
    }
    return { fit: take(fit, 3), reach: opts.stretch ? take(reach, 3) : [], count: fit.length, reachCount: reach.length };
  }

  function softSaid(s) {
    s = String(s || '').replace(/\s+/g, ' ').replace(/[.?\s]+$/g, '').trim();
    if (!s) return '';
    if (/^(BMW|X[1-7]|XM|Z4|iX[1-3]?|i[1-7]|M[2-8]|[1-8] Series)\b/.test(s)) return s;
    return s.charAt(0).toLowerCase() + s.slice(1);
  }
  function joinBits(bits) {
    if (!bits.length) return '';
    function bare(b) { return b.replace(/^(a|an) /i, ''); }
    if (bits.length === 1) return bits[0];
    if (bits.length === 2) return bits[0] + ' with ' + bare(bits[1]);
    var rest = bits.slice(1).map(bare);
    return bits[0] + ' with ' + rest.slice(0, -1).join(', ') + ' and ' + rest[rest.length - 1];
  }
  function whyBits(c, a, r) {
    var bits = [], body = effectiveBody(a);
    if (body.length && bodyHit(c, body)) {
      var sh = shapeName(c);
      bits.push(sh === 'SUV' ? 'an SUV' : (/^[AEIOU]/i.test(sh) ? 'an ' : 'a ') + sh.toLowerCase());
    }
    if (a.boot === 'big') bits.push('a big boot');
    else if (a.boot === 'tow') bits.push('room to tow');
    var fuelName = { phev: 'plug-in hybrid running costs', electric: 'electric running costs', diesel: 'diesel running costs', petrol: 'petrol running costs', hybrid: 'hybrid running costs' };
    if ((a.fuel || []).length && fuelHit(c, a.fuel) && fuelName[c._fuel]) bits.push(fuelName[c._fuel]);
    if ((a.people === 'five' || a.people === 'seven' || a.who === 'family' || a.life === 'family') && Number(c.seats) >= 5) bits.push((Number(c.seats) || 5) + ' seats');
    (r.metExtras || []).forEach(function (k) {
      var w = k === 'seven' ? '7 seats' : (k === 'heated' ? 'heated seats' : extraWord(k));
      if (bits.indexOf(w) === -1) bits.push(w);
    });
    if (wantsSeven(a) && String(c.seats) === '7' && bits.indexOf('7 seats') === -1) bits.push('7 seats');
    return bits.slice(0, 4);
  }
  function spokenWhy(r, a) {
    var said = softSaid(a && a.said);
    if (!said && a && a.life && a.life !== 'open') said = softSaid(txt(LIFE, a.life));
    var so = joinBits(whyBits(r.c, a, r));
    if (said && so) return 'You mentioned ' + said + ', so ' + so + '.';
    if (so) return cap1(so) + '.';
    return whyLine(r, a);
  }

  function whyLine(r, a) {
    var c = r.c, out = [];
    var body = effectiveBody(a);
    if (seriesWanted(a).length && seriesHit(c, a)) out.push(c.series);
    if (body.length && bodyHit(c, body)) out.push(shapeName(c));
    if ((a.fuel || []).length && fuelHit(c, a.fuel)) out.push(FUEL_NAME[c._fuel]);
    if (hasCeiling(a) && budgetMet(c, a, 0)) out.push(a.pay === 'monthly' ? (r.fin ? 'inside your ' + money(a.mo) + ' a month' : 'priced like the cars inside your ' + money(a.mo) + ' a month') : (a.cash === 20000 ? 'under ' + GBP + '20k' : 'under your ' + GBP + (a.cash / 1000) + 'k'));
    if ((a.colours || []).length && a.colours.indexOf(c.colour) !== -1) out.push('in ' + c.colour);
    (r.metExtras || []).forEach(function (k) { out.push(extraWord(k)); });
    if (wantsSeven(a) && String(c.seats) === '7') out.push('7 seats');
    if ((a.life === 'family' || a.who === 'family') && Number(c.seats) >= 5 && (c._bodies.indexOf('suv') !== -1 || c._bodies.indexOf('touring') !== -1)) out.push('room for the family');
    if (a.boot === 'big') { var boot = bootOf(c.id); if (boot) out.push('a ' + boot + ' litre boot'); }
    if (a.life === 'thrill' && c._hp && (c._m || c._hp >= 250)) out.push(c._hp + 'hp under your right foot');
    if (!out.length) { if (c._year) out.push(c._year + ' plate'); if (c._miles) out.push(c._miles.toLocaleString('en-GB') + ' miles'); }
    return cap1(out.slice(0, 5).join(', '));
  }
  function newWhy(c, a) {
    var fake = { c: c, metExtras: [] };
    var said = softSaid(a && a.said);
    if (!said && a && a.life && a.life !== 'open') said = softSaid(txt(LIFE, a.life));
    var bits = whyBits(c, a, fake);
    var lead = 'a brand new one, already built';
    if (bits.length && /^(a|an) /.test(bits[0])) lead = bits.shift().replace(/^(a|an) /, 'a brand new ') + ', already built';
    var so = joinBits([lead].concat(bits));
    if (said && so) return 'You mentioned ' + said + ', so ' + so + '.';
    return cap1(so) + '.';
  }
  function newWhen(c) {
    var x = c.lead_time_weeks_min, y = c.lead_time_weeks_max;
    if (!y) return '';
    return x && x !== y ? 'Here in ' + x + ' to ' + y + ' weeks' : 'Here in ' + y + ' weeks';
  }
  function modelName(c) { return String(c.model || c.description || '').replace(/^BMW\s+/i, ''); }
  function repText(f) { return FN.repExample(f); }

  function heroLine(a, totals) {
    var x = totals ? totals.total : stockTotal(a).total;
    return 'Based on everything you have told me, out of the ' + x + ' cars in our stock, I believe this is the one for you.';
  }
  function xLine(a, totals) {
    totals = totals || stockTotal(a);
    var bits = totals.used + ' approved used across the Hedin BMW group, Ruxley included';
    if (totals.neu) bits += ', plus ' + totals.neu + ' brand new';
    return 'Out of the ' + totals.total + ' cars in our stock (' + bits + ')';
  }

  function persona(a) {
    var openAll = modelOpen(a) && !a.life && !(a.body && a.body.length) && !(a.fuel && a.fuel.length) && (!a.pay || a.pay === 'notsure') && !(a.extras && a.extras.length);
    var onlyPlug = (a.fuel || []).length && a.fuel.every(function (f) { return f === 'electric' || f === 'phev'; });
    if (openAll) return ['The Open Road Optimist', 'Open to anything, which means more great cars to choose from.'];
    if ((a.fuel || []).indexOf('electric') !== -1 && a.life === 'thrill') return ['The Silent Assassin', 'You want fast, quiet and clever.'];
    if (a.life === 'thrill') return ['The B Road Hunter', 'You buy with your right foot. Feel first, figures second.'];
    if (a.life === 'family' || a.who === 'family') return ['The Weekend Warrior', 'Room for everyone and everything, and still a proper BMW to drive.'];
    if (a.life === 'miles') return ['The Mile Muncher', 'Long days on the road. Comfort is the whole point.'];
    if (onlyPlug) return ['The Future Proofer', 'You\u2019ve done the reading and you\u2019re ready to plug in.'];
    if (a.life === 'style') return ['The Head Turner', 'Shape matters. You want people to look twice.'];
    if (a.life === 'commute') return ['The Smooth Operator', 'Calm, quick and comfortable, every single day.'];
    return ['The Smart Chooser', 'You know what you like and you want it done properly.'];
  }

  function txt(list2, v) { var o = byV(list2, v); return o ? o.t : ''; }
  function modelsText(a) { if (modelOpen(a) && !chosenModels(a).length) return 'Open to ideas'; var t = chosenModels(a).map(function (v) { return modelBy(v).t; }); return list(t, 'and') + (a.modelOpen ? ' (and open to ideas)' : ''); }
  function shapesText(a) { var b = a.body && a.body.length ? a.body : (shapeLocked(a) ? [] : []); if (a.body && a.body.length) return list(a.body.map(function (v) { return byV(BODY, v).t; }), 'or'); if (shapeLocked(a)) return list(impliedBodies(a).map(function (v) { return byV(BODY, v).t; }), 'or') + ' (from the model)'; return 'Open minded on shape'; }
  function fuelsText(a) { return (a.fuel || []).length ? list(a.fuel.map(function (v) { return byV(FUEL, v).t; }), 'or') : 'Open minded on fuel'; }
  function budgetLine(a) {
    if (a.pay === 'monthly') { var dep = a.dep === null ? ', not sure on deposit' : ' with ' + money(a.dep) + ' down'; return a.mo > 0 ? 'Up to ' + money(a.mo) + ' a month' + dep : 'No monthly limit' + dep; }
    if (a.pay === 'cash') { if (!(a.cash > 0)) return 'Any price'; return (a.cash === 20000 ? 'Under ' : 'Up to ') + GBP + (a.cash / 1000) + 'k in total'; }
    return 'Not sure on budget yet';
  }
  function extrasText(a) { return (a.extras || []).map(function (k) { return k === 'seven' ? '7 seats' : (ST.FEATURES[k] || { label: k }).label; }).join(', '); }
  function interestText(a) { return { 'new': 'A brand new BMW', used: 'An approved used BMW', either: 'Brand new or approved used' }[a.interest] || 'Not answered'; }
  function carLine(r) { var c = r.c; return (c.year ? c.year + ' ' : '') + c.model + ', reg ' + (c.reg || 'not listed') + ', ' + c.price + (r.fin ? ', ' + money2(r.fin.monthly) + ' a month with ' + money(r.fin.deposit) + ' down' : ', ask for a quote'); }
  function newLine(r) { var c = r.c; return 'Brand new ' + c.description + (c.colour ? ', ' + c.colour : '') + ', ' + (c.price || 'price on request') + ', order ' + c.order_number + (r.pct ? ', ' + r.pct + '% over budget' : ''); }

  return {
    MODELS: MODELS, BODY: BODY, FUEL: FUEL, WHO: WHO, LIFE: LIFE, MILES: MILES, PEOPLE: PEOPLE, BOOT: BOOT,
    CHARGE: CHARGE, WHEN: WHEN, MONTHLY: MONTHLY, DEPS: DEPS, CASH: CASH, EXTRAS: EXTRAS, COLOURS: COLOURS, SWATCH: SWATCH,
    NEW_STRETCH: NEW_STRETCH, NEW_QUOTE_DEP: NEW_QUOTE_DEP, NEW_PER_1000: NEW_PER_1000, RELAX: RELAX, SUBS: SUBS,
    blank: blank, load: load, data: function () { return DATA; },
    modelBy: modelBy, byV: byV, chosenModels: chosenModels, modelOpen: modelOpen, impliedBodies: impliedBodies,
    shapeLocked: shapeLocked, effectiveBody: effectiveBody, needsCharge: needsCharge, wantsNew: wantsNew, wantsSeven: wantsSeven,
    matches: matches, countIn: countIn, stockTotal: stockTotal, findUsed: findUsed, findNew: findNew,
    newEstimate: newEstimate, newOver: newOver, whyLine: whyLine, spokenWhy: spokenWhy, newWhy: newWhy, softSaid: softSaid, newWhen: newWhen,
    shapeName: shapeName, modelName: modelName, repText: repText, heroLine: heroLine, xLine: xLine, persona: persona,
    modelsText: modelsText, shapesText: shapesText, fuelsText: fuelsText, budgetLine: budgetLine, extrasText: extrasText,
    interestText: interestText, carLine: carLine, newLine: newLine, txt: txt, list: list, money: money, money2: money2,
    finAt: function (c, dep) { return finAt(c, dep); }, feature: feature
  };
})();
