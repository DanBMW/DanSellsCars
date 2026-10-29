/* SwipeToDrive matching, shared by the app (app.js) and the daily match job
   (backend/supabase/functions/match-alerts). Body and fuel come from
   stock-core.js (window.dsStock), the same rules stock.html and Find my BMW use.
   Cars are rows of lookup/stock.json, built by scripts/build-lookup.mjs from
   the forecourt snapshot, group stock and stock-finance.json. */
(function (root) {
  'use strict';
  var DAN_WA = '447827138197';
  function S() { return root.dsStock; }
  function normReg(r) { return String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  var FUEL_OK = {
    petrol: ['petrol', 'mhev-petrol'], diesel: ['diesel', 'mhev-diesel'],
    hybrid: ['phev', 'mhev-petrol', 'mhev-diesel'], electric: ['electric'] };
  var BODY_OK = { /* profile body -> stock-core body keys */
    suv: ['suv'], hatchback: ['hatchback'], saloon: ['saloon', 'gran_coupe'], estate: ['touring'],
    coupe: ['coupe', 'gran_coupe', 'convertible'], mpv: ['mpv'], small: ['hatchback', 'mpv'],
    family: ['suv', 'touring', 'mpv'], big: ['suv'] };
  /* Colour families: the stock data already uses family names (Black, Grey,
     Blue, White, Green, Silver, Purple, Red); anything else is folded in here. */
  var FAMILY = [['Black', /black|sapphire|carbon/i], ['White', /white|alpine/i], ['Grey', /grey|gray|graphite/i], ['Silver', /silver/i],
    ['Blue', /blue/i], ['Green', /green/i], ['Red', /red/i], ['Purple', /purple|violet/i], ['Brown', /brown|bronze/i], ['Orange', /orange|yellow|gold/i]];
  function colourFamily(c) { var v = String((c && c.colour) || ''); for (var i = 0; i < FAMILY.length; i++) if (FAMILY[i][1].test(v)) return FAMILY[i][0]; return v ? 'Other' : ''; }
  /* ---- Specification picks: ONE catalogue, read the same way for used and new cars ------------------------
     THE RULE: a pick can only take a car OUT when that car's own data says it does not have the thing.
     "We cannot see it" is UNKNOWN, never a no. Seat colour, for example, is visible on a new car (its options
     say Oyster or Black) but not on a used car (its equipment list has no seat colour), so a used car is never
     removed because someone picks a light interior. An unknown "must have" keeps the car, ranks it a touch
     lower and adds a "Not confirmed" note, exactly like the reversing camera has always worked.
     Evidence: used cars carry the Hedin equipment list (automation/car-details.json); new cars carry BMW's
     standard and options lists, wheels and upholstery (lookup/new-stock.json). A used list is complete, so a
     missing line means "no". A new car's standard list is NOT complete, so a missing line is only "no" for
     things that are extras on every BMW (panoramic roof, tow bar).
     STANDARD ON EVERY NEW BMW (Dan, 30 Oct 2026): heated seats, reversing camera, Apple CarPlay and self parking
     (Parking Assistant). A new car is therefore always a yes for those four (flag newStd below), even though
     BMW's standard list does not itemise them. A used car is read from its own equipment list. */
  var GROUPS = ['Comfort', 'Technology', 'Driver aids', 'Driving feel', 'Look', 'Interior', 'Electric and hybrid', 'Practical'];
  function cleanKit(a) { var D = (S() || {}).DELETED; return (a || []).filter(function (x) { return typeof x === 'string' && x && !(D && D.test(x)); }); }
  function kitOf(car) {
    if (car && car.kind === 'new_stock') return cleanKit((car.standard || []).concat(car.options || [], car.wheels ? [car.wheels] : [], car.upholstery ? [car.upholstery] : []));
    var det = (root.ctDetails || {})[car && car.listing_id];
    return det && det.equipment ? cleanKit(det.equipment) : null;     /* null: equipment list not loaded or not known */
  }
  function isNewCar(car) { return !!car && car.kind === 'new_stock'; }
  function anyLine(kit, re, not) { return (kit || []).some(function (x) { return re.test(x) && !(not && not.test(x)); }); }
  var SEATLINE = /sensatec|veganza|merino|vernasca|leather|alcantara|fabric|cloth|upholster/i, NOTSEAT = /steering wheel|dashboard|headlining|interior trim|trim finisher|decor|stitching|seat belt/i;
  var LIGHT = /oyster|silverstone|canberra|beige|ivory|cream|white|cognac|castanea|mocha|taupe|light/i, DARK = /black|anthracite/i;
  function seatLines(kit) { return (kit || []).filter(function (x) { return SEATLINE.test(x) && !NOTSEAT.test(x); }); }
  function wheelInches(kit) { var best = null; (kit || []).forEach(function (x) { if (!/wheel|alloy|rim/i.test(x)) return; var m = x.match(/(\d\d)\s*["”“″]/); if (m) best = Math.max(best || 0, +m[1]); }); return best; }
  function F() { return (S() || {}).FEATURES || {}; }
  function ent(key, label, group, o) { o = o || {}; o.key = key; o.label = label; o.group = group; return o; }
  function fe(k, label, group, o) { var f = F()[k] || {}; o = o || {}; o.re = f.re; o.not = f.not; return ent('feat:' + k, label, group, o); }
  var CATALOGUE = null;
  function catalogue() {
    if (CATALOGUE) return CATALOGUE;
    CATALOGUE = [
      /* Comfort */
      fe('heated', 'Heated seats', 'Comfort', { newStd: true }),
      ent('sp:heatwheel', 'Heated steering wheel', 'Comfort', { re: /heated steering/i }),
      ent('sp:memory', 'Electric or memory seats', 'Comfort', { re: /memory seats|electric (front )?seats|electric.*seat/i }),
      ent('sp:massage', 'Ventilated or massage seats', 'Comfort', { re: /ventilat|massage/i }),
      fe('pano', 'Panoramic roof', 'Comfort', { newNeg: true }),
      fe('keyless', 'Keyless entry', 'Comfort'),
      ent('sp:ambient', 'Ambient lighting', 'Comfort', { re: /ambient/i }),
      /* Technology */
      fe('hud', 'Head-up display', 'Technology'),
      ent('sp:cockpit', 'Live Cockpit Professional', 'Technology', { re: /live cockpit pro/i }),
      ent('sp:wireless', 'Wireless phone charging', 'Technology', { re: /wireless charging|wireless phone charging/i, not: /storage for|prep/i }),
      fe('sound', 'Harman Kardon or better', 'Technology'),
      /* Driver aids */
      ent('sp:carplay', 'Apple CarPlay', 'Technology', { re: /carplay|apple car/i, usedNeg: false, newStd: true }),
      fe('acc', 'Adaptive cruise', 'Driver aids'),
      ent('sp:selfpark', 'Self parking (Parking Assistant)', 'Driver aids', { re: /parking assist/i, newStd: true }),
      ent('sp:parkplus', 'Parking Assistant Plus or 360 camera', 'Driver aids', { re: /parking assist\w*\s+(plus|pro)|surround view|top view|panorama view/i }),
      ent('feat:revcam', 'Reversing camera', 'Driver aids', { newStd: true, test: function (c, kit) {
        var Sx = S(); if (!Sx || !Sx.reversingCamera) return null;
        if (isNewCar(c)) return Sx.reversingCamera({ series: c.series, model: c.model }, { equipment: kit || [], first_reg: new Date().toISOString().slice(0, 10), version: c.description });
        return Sx.reversingCamera(c, (root.ctDetails || {})[c.listing_id]); } }),
      /* Driving feel */
      ent('sp:adaptsusp', 'Adaptive suspension', 'Driving feel', { re: /adaptive (m )?suspension|dynamic damper/i }),
      ent('sp:sportsteer', 'Sport steering', 'Driving feel', { re: /variable sport steering|integral active steering/i }),
      ent('sp:ledlights', 'Adaptive LED or Laser lights', 'Driving feel', { re: /adaptive led|laserlight|bmw laser|matrix/i }),
      /* Look */
      ent('trim:M Sport', 'M Sport', 'Look', { test: function (c, kit) { if (isNewCar(c)) return /\bM Sport\b/i.test(c.description || '') || anyLine(kit, /^M Sport Package/i); return /^M Sport/.test(c.trim || ''); } }),
      ent('trim:M Sport Pro', 'M Sport Pro or Plus', 'Look', { test: function (c, kit) { if (isNewCar(c)) return /M Sport (Pro|Plus)/i.test(c.description || '') || anyLine(kit, /^M Sport Pro/i); return /M Sport (Pro|Plus)/.test(c.trim || ''); } }),
      ent('trim:M Performance', 'M Performance', 'Look', { test: function (c) { if (isNewCar(c)) return /^M\d|^[Xx]M\b|M Performance|^[Xx]\d M\d|^i\d M\d|\bM\d{2,3}[a-z]/.test(c.description || '') ? true : null; return c.trim === 'M Performance'; } }),
      ent('sp:wheels19', 'Large wheels (19 inch or more)', 'Look', { test: function (c, kit) { var w = wheelInches(kit); return w == null ? null : w >= 19; } }),
      /* Interior: new cars show it, used cars do not. Unknown never removes a car. */
      ent('sp:leather', 'Leather or leatherette seats', 'Interior', { test: function (c, kit) {
        if (isNewCar(c) && c.upholstery) return !/fabric|cloth/i.test(c.upholstery);
        return anyLine(seatLines(kit), /leather|sensatec|veganza|merino|vernasca/i) ? true : null; } }),
      ent('sp:fabric', 'Fabric seats', 'Interior', { test: function (c, kit) {
        if (isNewCar(c) && c.upholstery) return /fabric|cloth/i.test(c.upholstery);
        return null; } }),
      /* Light interior: Dan's rules from 28 Oct 2026 in stock-core.js lightInterior (Oyster, Smoke White, Ivory White,
         Silverstone, Canberra Beige are light; Cognac, Tartufo, Mocha and other dark or rich colours are not; no seat colour is unknown) */
      ent('sp:intlight', 'Light interior', 'Interior', { test: function (c, kit) { return S().lightInterior(c, { equipment: kit || [] }); } }),
      ent('sp:intdark', 'Dark interior', 'Interior', { test: function (c, kit) { var l = S().lightInterior(c, { equipment: kit || [] }); return l === null ? null : !l; } }),
      /* Electric and hybrid */
      ent('sp:fastcharge', 'Fast charging', 'Electric and hybrid', { re: /dc fast|fast charging|dc charging|ac fast/i, not: /prep/i, usedNeg: false }),
      /* Practical */
      fe('towbar', 'Tow bar', 'Practical', { newNeg: true }),
      ent('feat:xdrive', 'xDrive all wheel drive', 'Practical', { test: function (c) { return c.drive ? /four|all/i.test(String(c.drive)) : null; } }),
      ent('feat:seven', '7 seats', 'Practical', { test: function (c) { return c.seats == null || c.seats === '' ? null : String(c.seats) === '7'; } }),
      ent('gearbox:Automatic', 'Automatic', 'Practical', { test: function (c) { return c.gearbox ? c.gearbox === 'Automatic' : null; } }),
      ent('gearbox:Manual', 'Manual', 'Practical', { test: function (c) { return c.gearbox ? c.gearbox === 'Manual' : null; } })
    ];
    return CATALOGUE;
  }
  function entryFor(key) { var c = catalogue(); for (var i = 0; i < c.length; i++) if (c[i].key === key) return c[i]; return null; }
  function specOptions() { return catalogue().map(function (e) { return { key: e.key, label: e.label, group: e.group }; }); }
  function specLabel(key) { var e = entryFor(key); return e ? e.label : String(key).replace(/^[a-z]+:/, '').replace(/_/g, ' '); }
  /* true, false, or null when the car's data cannot say. NULL IS NEVER A NO. */
  function hasSpec(car, key) {
    var e = entryFor(key);
    if (!e) {                                  /* an older saved pick the catalogue no longer lists */
      if (key.indexOf('feat:') === 0 && car && car.kind !== 'new_stock') { var det = (root.ctDetails || {})[car.listing_id]; return S().hasFeature(car, det, key.slice(5)); }
      return null; }
    var kit = kitOf(car);
    if (e.newStd && isNewCar(car)) return true;            /* standard on every new BMW */
    if (e.test) { var t = e.test(car, kit); if (t !== undefined) return t; }
    if (!e.re || !kit) return null;
    if (anyLine(kit, e.re, e.not)) return true;
    return (isNewCar(car) ? e.newNeg : e.usedNeg !== false) ? false : null;
  }
  /* Score the picks for any car, used or new. likes add points; a must have removes a car ONLY on a definite no. */
  function specScore(car, p) {
    var o = { sc: 0, why: [], ok: true, notes: [], unconf: false }, must = p.specs_must || [], keys = (p.specs || []).slice(), got = 0;
    must.forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); });
    keys.forEach(function (k) { var h = hasSpec(car, k), isMust = must.indexOf(k) !== -1;
      if (h === true) { got++; o.sc += 6; }
      else if (h === false && isMust) o.ok = false;
      else if (h === null && isMust) { o.unconf = true; o.sc -= 2; var n = k === CAM ? CAM_NOTE : 'Not confirmed: ' + specLabel(k); if (o.notes.indexOf(n) === -1) o.notes.push(n); } });
    if (got) o.why.push(got === 1 ? '1 spec you ticked' : got + ' specs you ticked');
    return o;
  }
  /* Fuel is saved as one text value: 'open', a single fuel (older profiles) or a comma list like 'petrol,hybrid'.
     Empty or open means any fuel. A car passes when its fuel fits any chosen type. */
  function fuelList(v) { return [].concat(v == null ? [] : v).join(',').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(function (x) { return x && x !== 'open'; }); }
  /* Optional preferred current mileage: a soft preference (boost in band, small dip outside), never a hard filter. */
  var MILEAGE_BANDS = { '0_8k': { min: 0, max: 8000, label: '0 to 8k' }, '8_15k': { min: 8000, max: 15000, label: '8k to 15k' }, '15_25k': { min: 15000, max: 25000, label: '15k to 25k' }, '25k_plus': { min: 25000, max: Infinity, label: '25k plus' } };
  function carMiles(car) { var m = car && car.mileage; if (m == null || m === '') return null; if (typeof m === 'number') return m; var d = String(m).replace(/[^0-9]/g, ''); return d ? +d : null; }
  /* Models: models[] holds every picked model, models_must[] the subset tapped twice. Older profiles have no
     models_must, so their picks count as would like. Any must have model set = the car must be one of them. */
  function modelFit(car, p) {
    var low = function (a) { return (a || []).map(function (m) { return String(m).toLowerCase(); }); };
    var must = low(p.models_must), all = low(p.models).concat(must); if (!all.length) return { sc: 0, ok: true };
    var name = (String(car.series || '') + ' ' + String(car.model || '')).toLowerCase(),
      /* whole names only: an M2 alert must not match an M235 */
      has = function (m) { return new RegExp('(^|[^a-z0-9])' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(name); };
    if (must.length && must.some(has)) return { sc: 26, ok: true, why: 'A must have model' };
    if (must.length) return { sc: -6, ok: false };
    if (all.some(has)) return { sc: 22, ok: true, why: 'A model you picked' };
    return { sc: -6, ok: true };
  }
  /* Returns {score 0..100, reasons[], ok}. ok false = outside a hard limit. */
  function hasBudget(p) { return !!p && ((p.budget_type === 'cash' && p.cash_gbp > 0) || (p.budget_type !== 'cash' && p.monthly_gbp > 0)); }
  function score(car, p) {
    p = p || {}; var sc = 40, why = [], ok = true, s = S(), notes = [], unconf = false;
    var isNew = car.kind === 'new', ns = car.kind === 'new_stock';   /* new_stock: a real new car in retailer stock */
    if (ns) return scoreNewStock(car, p);
    if (p.new_used === 'new' && !isNew) return { score: 0, reasons: [], ok: false };
    if (p.new_used === 'used' && isNew) return { score: 0, reasons: [], ok: false };
    var fk = isNew ? car.fuelKeys || [] : [s.fuelKey(car)];
    var fl = fuelList(p.fuel);
    if (fl.length) {
      var hit = fl.some(function (f) { return fk.some(function (k) { return (FUEL_OK[f] || []).indexOf(k) !== -1; }); });
      if (hit) { sc += 20; why.push('Your fuel'); } else ok = false; /* a fuel filter is a hard filter for new and used */
    } else sc += 8;
    var bk = isNew ? car.bodyKeys || [] : s.bodyKeys(car);
    if (p.body && p.body !== 'any') {
      if (bk.some(function (k) { return (BODY_OK[p.body] || []).indexOf(k) !== -1; })) { sc += 15; why.push('Your shape'); } else sc -= 12;
    }
    var mr = modelFit(car, p); sc += mr.sc; if (mr.why) why.push(mr.why); if (!mr.ok) ok = false;
    /* model placeholder cards (no real stock for that model): no price of their own, so the budget test is against
       the cheapest real new BMW in stock today (floor_cash / floor_monthly, set by the app). Below that, hide them. */
    /* a model card has no price of its own: with a budget set, only show it to someone who chose brand new */
    if (isNew && hasBudget(p) && p.new_used !== 'new') ok = false;
    if (isNew) {
      if (p.budget_type === 'cash' && p.cash_gbp > 0 && car.floor_cash && p.cash_gbp < car.floor_cash) ok = false;
      if (p.budget_type === 'monthly' && p.monthly_gbp > 0 && car.floor_monthly && p.monthly_gbp < car.floor_monthly) ok = false;
    }
    if (!isNew) {
      if (p.budget_type === 'cash' && p.cash_gbp > 0 && car.price_gbp) {
        var r = car.price_gbp / p.cash_gbp;
        if (r > 1.1) ok = false; else if (r <= 1) { sc += 15; why.push('In your budget'); } else sc += 4;
      }
      if (p.budget_type === 'monthly' && p.monthly_gbp > 0) {
        if (car.finance && car.finance.monthly) {
          var q = car.finance.monthly / p.monthly_gbp;
          if (q > 1.1) ok = false; else if (q <= 1) { sc += 15; why.push('In your monthly budget'); } else sc += 4;
        } else sc -= 4;
      }
      var cols = (p.colours || []).filter(function (x) { return x !== 'Any'; }), mustC = p.colours_must || [];
      if (cols.length) { var fam = colourFamily(car);
        if (cols.indexOf(fam) !== -1) { sc += 10; why.push(fam + ', a colour you like'); } else sc -= 4;
        if (mustC.length && mustC.indexOf(fam) === -1) ok = false; }
      var sp = specScore(car, p); sc += sp.sc; sp.why.forEach(function (w) { why.push(w); }); if (!sp.ok) ok = false; sp.notes.forEach(function (n) { notes.push(n); }); if (sp.unconf) unconf = true;
      var bands = (p.mileage_bands || []).filter(function (k) { return MILEAGE_BANDS[k]; }), mi = carMiles(car);
      if (bands.length && mi != null) { if (bands.some(function (k) { var b = MILEAGE_BANDS[k]; return mi >= b.min && mi < b.max; })) { sc += 8; why.push('Mileage you prefer'); } else sc -= 4; }
      if (car.year) sc += Math.max(0, Math.min(6, car.year - 2019));
      if (p.annual_mileage > 12000 && /diesel|phev/.test(fk[0] || '')) sc += 3;
      if (car.source === 'forecourt') sc += 2;
      if (justArrived(car)) { sc += 5; why.push('Just arrived'); }   /* a modest nudge, never enough to lift a car past the filters */
    }
    return { score: Math.max(1, Math.min(99, Math.round(sc))), reasons: why, ok: ok, notes: notes, unconfirmed: unconf };
  }
  /* Reversing camera: a must have keeps cars with no clear answer, ranked below confirmed cars with a note.
     A would like gives them no boost. Rules live in stock-core.js reversingCamera. */
  var CAM = 'feat:revcam', CAM_NOTE = 'Check with Dan: reversing camera not confirmed';
  /* Arrival dates from automation/stock-arrivals.json (the ledger stock.html uses): first morning the repo saw the
     car in a snapshot, keyed by listing id per list. A car already there when the history began has no arrival. */
  var JUST_DAYS = 7;
  function londonDay(d) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d || new Date()); } catch (e) { return (d || new Date()).toISOString().slice(0, 10); } }
  function arrivalOf(car, ledger) {
    if (!car || !ledger || !ledger.lists || car.listing_id == null) return null;
    var list = ledger.lists[car.source === 'forecourt' ? 'forecourt' : 'group'];
    var day = list && list.cars && list.cars[String(car.listing_id)];
    return day && day !== list.history_from ? day : null;
  }
  function daysBetween(a, b) { var x = Date.parse(a + 'T00:00:00Z'), y = Date.parse(b + 'T00:00:00Z'); return isNaN(x) || isNaN(y) ? null : Math.round((y - x) / 86400000); }
  function stampArrivals(cars, ledger, today) {
    today = today || londonDay();
    (cars || []).forEach(function (c) { var d = arrivalOf(c, ledger); c.arrived_on = d || null; c.arrived_days = d ? daysBetween(d, today) : null; });
    return cars;
  }
  function justArrived(car) { return !!car && car.arrived_days != null && car.arrived_days >= 0 && car.arrived_days < JUST_DAYS; }
  function arrivedText(car) { var n = car && car.arrived_days; return n == null ? '' : n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n + ' days ago'; }
  /* how many cars arrived after the day of the last visit (dates only, so a same day revisit counts none) */
  function newSince(cars, lastVisitIso) {
    if (!lastVisitIso) return 0; var last = londonDay(new Date(lastVisitIso));
    return (cars || []).filter(function (c) { return c.arrived_on && c.arrived_on > last; }).length;
  }
  /* New stock: in budget only on its actual current price. No discount assumptions. Staff alerts only. */
  function scoreNewStock(car, p) {
    var sc = 38, why = [], ok = true, s = S();
    if (p.new_used === 'used') return { score: 0, reasons: [], ok: false };
    var fk = [s.fuelKey(car)];
    var fl = fuelList(p.fuel);
    if (fl.length) { if (fl.some(function (f) { return fk.some(function (k) { return (FUEL_OK[f] || []).indexOf(k) !== -1; }); })) { sc += 20; why.push('Your fuel'); } else ok = false; } else sc += 8;
    var bk = s.bodyKeys(car) || [];
    if (p.body && p.body !== 'any') { if (bk.some(function (k) { return (BODY_OK[p.body] || []).indexOf(k) !== -1; })) { sc += 15; why.push('Your shape'); } else sc -= 12; }
    var mr = modelFit(car, p); sc += mr.sc; if (mr.why) why.push(mr.why); if (!mr.ok) ok = false;
    /* with a budget set, a new car with no real price or quoted monthly is not shown unless they chose brand new */
    if (hasBudget(p) && p.new_used !== 'new' && (p.budget_type === 'cash' ? !car.price_gbp : !(car.finance && car.finance.monthly))) ok = false;
    if (p.budget_type === 'cash' && p.cash_gbp > 0 && car.price_gbp) { if (car.price_gbp <= p.cash_gbp) { sc += 15; why.push('In budget at the current price'); } else ok = false; }
    /* monthly: only on a figure that comes with a full representative example (car.finance); otherwise no monthly test or figure */
    if (p.budget_type === 'monthly' && p.monthly_gbp > 0) { if (car.finance && car.finance.monthly) { if (car.finance.monthly <= p.monthly_gbp) { sc += 15; why.push('In monthly budget at the current price'); } else ok = false; } else sc -= 4; }
    var cols = (p.colours || []).filter(function (x) { return x !== 'Any'; }), mustC = p.colours_must || [];
    if (cols.length) { var fam = colourFamily(car); if (cols.indexOf(fam) !== -1) { sc += 10; why.push(fam + ', a colour you like'); } else sc -= 4; if (mustC.length && fam && mustC.indexOf(fam) === -1) ok = false; }
    var notes = [], unconf = false;
    var sp = specScore(car, p); sc += sp.sc; sp.why.forEach(function (w) { why.push(w); }); if (!sp.ok) ok = false; sp.notes.forEach(function (n) { notes.push(n); }); if (sp.unconf) unconf = true;
    return { score: Math.max(1, Math.min(99, Math.round(sc))), reasons: why, ok: ok, notes: notes, unconfirmed: unconf };
  }
  /* Real new car in retailer stock (lookup/new-stock.json). The id 'NEW' + order number is the same one the alerts job
     stores in stock_seen, so app, alerts and buy requests all agree. Monthly only with a complete representative example. */
  var FE_NEED = ['product', 'lender', 'apr', 'monthly', 'payments', 'term_months', 'deposit', 'cash_price', 'amount_of_credit', 'final_payment', 'total_payable', 'annual_mileage'];
  function newStockFinance(fe) {
    if (!fe || FE_NEED.some(function (k) { return fe[k] == null || fe[k] === ''; })) return null;
    var ex = fe.product + ' from ' + fe.lender + '. ' + fe.payments + ' monthly payments of ' + gbp2(fe.monthly) + ', customer deposit ' + gbp2(fe.deposit) +
      ', cash price ' + gbp2(fe.cash_price) + ', amount of credit ' + gbp2(fe.amount_of_credit) + ', optional final payment ' + gbp2(fe.final_payment) +
      ', total amount payable ' + gbp2(fe.total_payable) + ', ' + fe.term_months + ' month agreement, ' + Number(fe.annual_mileage).toLocaleString('en-GB') + ' miles a year, representative APR ' + fe.apr + '%.' +
      ' The final payment and totals are worked out from the figures BMW publish and are not a quotation.';
    return { monthly: fe.monthly, product: fe.product, representative_example: ex, legal: 'Finance subject to status, 18+, UK residents. Hedin Automotive Group acts as a credit broker and not a lender.' };
  }
  function fromNewStock(c) { var f = newStockFinance(c.finance_example);
    return { kind: 'new_stock', reg: 'NEW' + c.order_number, id: String(c.order_number), order_number: String(c.order_number), model: c.range || ('BMW ' + c.description), description: c.description, series: c.series,
      colour: c.colour, fuel: c.fuel, gearbox: c.transmission, transmission: c.transmission, drive: c.drive, seats: c.seats, upholstery: c.upholstery, wheels: c.wheels,
      price: c.price || (c.price_gbp ? gbp(c.price_gbp) : ''), price_gbp: c.price_gbp, monthly_gbp: f ? c.monthly_gbp : null, finance: f,
      lead_min: c.lead_time_weeks_min, lead_max: c.lead_time_weeks_max, on_hold: !!c.on_hold, image: c.image || '', images: (c.images || []).slice(0, 10), standard: c.standard || [], options: c.options || [] }; }
  /* The deck reads lookup/new-stock-lite.json; the full record for one car (lookup/order/<order>.json) is fetched
     when the customer opens it and merged in here: pictures, equipment and the rest of the specification. */
  function mergeNewDetail(car, d) { if (!car || !d) return car;
    var x = fromNewStock(d); ['description', 'colour', 'fuel', 'gearbox', 'transmission', 'drive', 'seats', 'upholstery', 'wheels', 'image'].forEach(function (k) { if (x[k] != null && x[k] !== '') car[k] = x[k]; });
    if (x.images && x.images.length) car.images = x.images; car.standard = x.standard; car.options = x.options; car.detail = true; return car; }
  /* Brand new stock: the monthly comes only from the lender's own quote for that car (lookup/new-stock-quotes.json,
     checked by dsfinance.js newOk: complete, adds up, matches the price, in date, file fresh). A car without a good
     quote shows no monthly, so a monthly budget never matches it on a guess. fin is window.dsFin. */
  function applyLenderQuotes(cars, file, fin, now) { var q = (file && file.quotes) || {}, gen = file && file.generated_at;
    (cars || []).forEach(function (c) { if (c.kind !== 'new_stock') return; var e = q[String(c.order_number)];
      if (fin && e && fin.newOk(c, e, gen, now)) { c.finance = { monthly: e.monthly, product: e.product, lender: e.lender, representative_example: fin.newRep(e), legal: fin.BROKER, source: 'lender' }; c.monthly_gbp = e.monthly; }
      else { c.finance = null; c.monthly_gbp = null; } });
    return cars; }
  /* does a real stock car stand in for a model placeholder (MBG list name)? M cars only cover M names. */
  var BODY = ['gran coupe', 'active tourer', 'convertible', 'touring', 'saloon', 'coupe'];
  function nrm(x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^bmw\s+/, '').replace(/\s+/g, ' ').trim(); }
  function isMCar(d) { return /^m\d|^(x\d|i\w{1,2}) m\d|^\w+ m$/.test(d); }
  function covers(stock, name) {
    var n = nrm(name), d = nrm(stock.description || stock.model), sr = nrm(stock.series);
    var body = BODY.filter(function (b) { return n.indexOf(b) !== -1; })[0] || '';
    if (body) { if (d.indexOf(body) === -1) return false; if (body === 'coupe' && d.indexOf('gran coupe') !== -1) return false; }
    var core = BODY.reduce(function (a, b) { return a.replace(b, ''); }, n).trim();
    if (isMCar(n)) { var tok = core.split(' ')[0]; return (d === tok || d.indexOf(tok + ' ') === 0) && (core.split(' ').length < 2 || d.indexOf(core) === 0); }
    if (isMCar(d)) return false;
    return sr === core || d.indexOf(core + ' ') === 0;
  }

  /* Why a chosen model has nothing to show, worked out from the real stock (used cars and new cars in stock;
     model placeholder cards are not stock). One entry per chosen model with no car that fits:
     none     nothing of that model in stock at all
     budget   stock exists, the budget is what rules it out
     filter   stock exists, one other choice rules it out (fuel, new or used, must have colour, must have spec)
     narrow   stock exists, only the mix of choices together rules it out
     Counts are real counts from the stock passed in. No prices, dates or promises. */
  function hasModel(car, m) { var n = (String(car.series || '') + ' ' + String(car.model || '') + ' ' + String(car.description || '')).toLowerCase();
    return new RegExp('(^|[^a-z0-9])' + String(m).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(n); }
  function isMModel(m) { m = String(m).trim().toLowerCase(); return /^m\d/.test(m) || /^(x\d|i\w{1,2})\s?m(\d|$)/.test(m) || /^xm$/.test(m); }
  var LOOSEN = [
    ['budget', function (p) { return Object.assign({}, p, { cash_gbp: 0, monthly_gbp: 0 }); }],
    ['fuel', function (p) { return Object.assign({}, p, { fuel: 'open' }); }],
    ['new_used', function (p) { return Object.assign({}, p, { new_used: 'both' }); }],
    ['colours', function (p) { return Object.assign({}, p, { colours_must: [] }); }],
    ['specs', function (p) { return Object.assign({}, p, { specs_must: [] }); }]];
  function noStock(cars, p) { p = p || {}; var seen = {}, out = [];
    var models = [].concat(p.models_must || [], p.models || []).filter(function (m) { var k = String(m).toLowerCase(); if (!m || seen[k]) return false; seen[k] = 1; return true; });
    var real = (cars || []).filter(function (c) { return c.kind !== 'new'; });
    models.forEach(function (m) {
      var q = Object.assign({}, p, { models: [m], models_must: [m] }), mine = real.filter(function (c) { return hasModel(c, m); });
      var ok = function (pp) { return mine.filter(function (c) { return score(c, pp).ok; }).length; };
      if (mine.length && ok(q)) return;
      var x = { model: m, m_car: isMModel(m), total: mine.length, used: mine.filter(function (c) { return c.kind !== 'new_stock'; }).length,
        new_avail: false };
      /* ordering new is only offered when a new one could fit their budget; a model card counts only with no budget or for someone who chose new */
      var news = (cars || []).filter(function (c) { return (c.kind === 'new' || c.kind === 'new_stock') && hasModel(c, m); });
      /* the budget indicator is the cheapest new one of that model in stock today, on its real price or lender quote;
         with no new one of that model in stock there is no indicator, so ordering new is only offered with no budget set
         (or to someone who chose brand new, where the model card already passed its own checks) */
      x.new_avail = !hasBudget(p) ? news.length > 0 : news.some(function (c) { return (c.kind === 'new_stock' || p.new_used === 'new') && score(c, q).ok; });
      x.budget_set = hasBudget(p);
      if (!mine.length) { x.kind = news.length && x.budget_set && !x.new_avail && news.some(function (c) { return c.kind === 'new_stock' && score(c, Object.assign({}, q, { cash_gbp: 0, monthly_gbp: 0 })).ok; }) ? 'budget' : 'none'; out.push(x); return; }
      var best = null; LOOSEN.forEach(function (l, i) { var n = ok(l[1](q)); if (n && (!best || (best.k !== 'budget' && n > best.n))) best = { k: l[0], n: n }; });
      if (best && best.k === 'budget') { x.kind = 'budget'; x.freed = best.n; }
      else if (best) { x.kind = 'filter'; x.filter = best.k; x.freed = best.n; x.electric_only = best.k === 'fuel' && fuelList(p.fuel).join() === 'electric'; x.fuel = fuelList(p.fuel); x.new_used = p.new_used; }
      else x.kind = 'narrow';
      out.push(x); });
    return out; }
  /* Plain words for one noStock entry. o.alerts: true when this customer gets match alerts. o.guest: on a swipe link. */
  function noStockText(x, o) { o = o || {}; var m = x.model, n = x.total, cars = n === 1 ? '1 ' + m : n + ' ' + m + ' cars', is = n === 1 ? 'it' : 'they';
    var alerts = o.alerts ? 'You will be notified when one comes into stock.' : 'Turn on alerts and you will be notified when one comes into stock.';
    if (x.kind === 'none') {
      if (x.m_car) return 'No ' + m + ' in stock right now, as M cars rarely come into approved used stock and tend to sell quickly. ' + alerts;
      if (x.new_avail) return 'No used ' + m + ' in stock right now, but it is available new. ' + alerts;
      return 'No ' + m + ' in stock right now. ' + alerts; }
    if (x.kind === 'budget') return 'Your budget does not stretch to the ' + m + ' based on the parameters you set.';
    if (x.kind === 'filter') {
      if (x.filter === 'fuel') return x.electric_only ? 'We have ' + cars + ' in stock, but none are electric.' : 'We have ' + cars + ' in stock, but none are ' + x.fuel.join(' or ') + '.';
      if (x.filter === 'new_used') return 'We have ' + cars + ' in stock, but ' + (n === 1 ? 'it is not' : 'none are') + ' ' + (x.new_used === 'new' ? 'brand new' : 'used') + '.';
      if (x.filter === 'colours') return 'We have ' + cars + ' in stock, but ' + (n === 1 ? 'it is not' : 'none are') + ' in your must have colour.';
      if (x.filter === 'specs') return 'We have ' + cars + ' in stock, but ' + (n === 1 ? 'it does not' : 'none') + ' have your must have spec.';
    }
    return 'We have ' + cars + ' in stock, but ' + (n === 1 ? 'it does not' : 'none') + ' fit all your choices together.'; }
  /* when must haves are what keeps the deck small: say so, and how to open it up (tap the chip once instead) */
  function mustNote(p) { p = p || {}; var mm = (p.models_must || []).length, ms = (p.specs_must || []).length;
    if (!mm && !ms) return '';
    var what = mm && ms ? 'must have models and spec' : mm ? (mm === 1 ? 'a must have model' : 'must have models') : (ms === 1 ? 'a must have spec' : 'must have spec');
    return 'You have ' + what + ' set, so you only see cars that match, with no other suggestions. Make it a would like (one tap) to see other suggestions too.'; }
  /* the one tap widen for an entry: a profile patch, or null */
  function noStockWiden(x) { if (x.kind !== 'filter') return null;
    return { fuel: { label: 'Show any fuel', patch: { fuel: 'open' } }, new_used: { label: 'Show new and used', patch: { new_used: 'both' } },
      colours: { label: 'Any colour is fine', patch: { colours_must: [] } }, specs: { label: 'Make spec a would like', patch: { specs_must: [] } } }[x.filter] || null; }
  function rank(cars, p) {
    return cars.map(function (c) { var r = score(c, p); return { car: c, score: r.score, reasons: r.reasons, ok: r.ok, notes: r.notes || [], unconfirmed: !!r.unconfirmed }; })
      .filter(function (x) { return x.ok; }).sort(function (a, b) { return (a.unconfirmed - b.unconfirmed) || (b.score - a.score); });
  }
  function waText(car, who) {
    if (car.kind === 'new_stock') return 'Hi' + (who ? ' ' + who : '') + ', a new ' + car.model + (car.colour ? ' in ' + car.colour : '') + ' has come into stock that could suit you. Shall I put a quote together?';
    var hi = 'Hi' + (who ? ' ' + who : '') + ', ';
    if (car.kind === 'new') return hi + 'I matched with a new BMW ' + car.model + ' on SwipeToDrive. Can we talk options?';
    return hi + 'I matched with the ' + car.model + (car.year ? ' (' + car.year + ')' : '') + ', reg ' + normReg(car.reg) + ', on SwipeToDrive. Is it still available?';
  }
  function waLink(number, car, who) { return 'https://wa.me/' + (number || DAN_WA) + '?text=' + encodeURIComponent(waText(car, who)); }
  var gbp = function (n) { return '\u00a3' + Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 }); };
  var gbp2 = function (n) { return '\u00a3' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  /* Monthly figure only together with the lender's full representative example */
  function finance(car) {
    var f = car && car.finance;
    if (!f || !f.monthly || !f.representative_example) return null;
    return { monthly: gbp2(f.monthly), headline: gbp2(f.monthly) + ' a month, ' + f.product, example: f.representative_example, legal: f.legal || '' };
  }
  /* Send customer latest stock: their current top matches, real cars only (no model placeholders), sold or
     removed cars left out, in stock preferred (forecourt, then group, then new in retailer stock), best first. */
  function pickLatest(cars, p, n) {
    var rank = { forecourt: 0, group: 1 };
    return (cars || []).filter(function (c) { return c && c.kind !== 'new' && (!c.status || c.status === 'in_stock') && !c.removed_at; })
      .map(function (c) { var r = score(c, p || {}); return { car: c, score: r.score, ok: r.ok, reasons: r.reasons, notes: r.notes || [], unconfirmed: !!r.unconfirmed }; })
      .filter(function (x) { return x.ok && x.score >= 55; })
      .sort(function (a, b) { var ra = a.car.kind === 'new_stock' ? 2 : (rank[a.car.source] != null ? rank[a.car.source] : 1), rb = b.car.kind === 'new_stock' ? 2 : (rank[b.car.source] != null ? rank[b.car.source] : 1);
        return (a.unconfirmed - b.unconfirmed) || (b.score - a.score) || (ra - rb); })
      .slice(0, n || 6);
  }
  root.ctMatch = { applyLenderQuotes: applyLenderQuotes, hasBudget: hasBudget, mustNote: mustNote, noStock: noStock, noStockText: noStockText, noStockWiden: noStockWiden, hasModel: hasModel, isMModel: isMModel, colourFamily: colourFamily, specOptions: specOptions, hasSpec: hasSpec, FAMILY: FAMILY, DAN_WA: DAN_WA, normReg: normReg, score: score, rank: rank, fromNewStock: fromNewStock, mergeNewDetail: mergeNewDetail, waLink: waLink, waText: waText, finance: finance, gbp: gbp, covers: covers, stampArrivals: stampArrivals, arrivalOf: arrivalOf, justArrived: justArrived, arrivedText: arrivedText, newSince: newSince, londonDay: londonDay, JUST_DAYS: JUST_DAYS, newStockFinance: newStockFinance, fuelList: fuelList, MILEAGE_BANDS: MILEAGE_BANDS, carMiles: carMiles, modelFit: modelFit, pickLatest: pickLatest, CAM_NOTE: CAM_NOTE, specLabel: specLabel, specGroups: GROUPS };
})(typeof window !== 'undefined' ? window : globalThis);
