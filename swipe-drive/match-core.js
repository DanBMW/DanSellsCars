/* Swipe Drive matching, shared by the app (app.js) and the daily match job
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
  /* Specification picks. Only things the data can test: trim and gearbox from
     lookup/stock.json, equipment from automation/car-details.json through
     stock-core.js FEATURES (the same rules stock.html uses). */
  var SPEC_FIELDS = [
    ['trim:M Sport', 'M Sport', function (c) { return /^M Sport/.test(c.trim || ''); }],
    ['trim:M Sport Pro', 'M Sport Pro or Plus', function (c) { return /M Sport (Pro|Plus)/.test(c.trim || ''); }],
    ['trim:M Performance', 'M Performance', function (c) { return c.trim === 'M Performance'; }],
    ['gearbox:Automatic', 'Automatic', function (c) { return c.gearbox === 'Automatic'; }],
    ['gearbox:Manual', 'Manual', function (c) { return c.gearbox === 'Manual'; }]];
  function specOptions() {
    var o = SPEC_FIELDS.map(function (f) { return { key: f[0], label: f[1] }; }), F = (S() || {}).FEATURES || {};
    Object.keys(F).forEach(function (k) { o.push({ key: 'feat:' + k, label: F[k].label }); }); return o;
  }
  /* true, false, or null when the car's equipment list is not known */
  function hasSpec(car, key) {
    for (var i = 0; i < SPEC_FIELDS.length; i++) if (SPEC_FIELDS[i][0] === key) return SPEC_FIELDS[i][2](car);
    if (key.indexOf('feat:') === 0) { var det = (root.ctDetails || {})[car.listing_id]; return S().hasFeature(car, det, key.slice(5)); }
    return null;
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
    var name = (String(car.series || '') + ' ' + String(car.model || '')).toLowerCase(), has = function (m) { return name.indexOf(m) !== -1; };
    if (must.length && must.some(has)) return { sc: 26, ok: true, why: 'A must have model' };
    if (must.length) return { sc: -6, ok: false };
    if (all.some(has)) return { sc: 22, ok: true, why: 'A model you picked' };
    return { sc: -6, ok: true };
  }
  /* Returns {score 0..100, reasons[], ok}. ok false = outside a hard limit. */
  function score(car, p) {
    p = p || {}; var sc = 40, why = [], ok = true, s = S();
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
      var specs = p.specs || [], mustS = p.specs_must || [], got = 0;
      specs.forEach(function (k) { var h = hasSpec(car, k);
        if (h === true) { got++; sc += 6; } else if (mustS.indexOf(k) !== -1 && h === false) ok = false; });
      if (got) why.push(got === 1 ? '1 spec you ticked' : got + ' specs you ticked');
      var bands = (p.mileage_bands || []).filter(function (k) { return MILEAGE_BANDS[k]; }), mi = carMiles(car);
      if (bands.length && mi != null) { if (bands.some(function (k) { var b = MILEAGE_BANDS[k]; return mi >= b.min && mi < b.max; })) { sc += 8; why.push('Mileage you prefer'); } else sc -= 4; }
      if (car.year) sc += Math.max(0, Math.min(6, car.year - 2019));
      if (p.annual_mileage > 12000 && /diesel|phev/.test(fk[0] || '')) sc += 3;
      if (car.source === 'forecourt') sc += 2;
      if (justArrived(car)) { sc += 5; why.push('Just arrived'); }   /* a modest nudge, never enough to lift a car past the filters */
    }
    return { score: Math.max(1, Math.min(99, Math.round(sc))), reasons: why, ok: ok };
  }
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
    if (p.budget_type === 'cash' && p.cash_gbp > 0 && car.price_gbp) { if (car.price_gbp <= p.cash_gbp) { sc += 15; why.push('In budget at the current price'); } else ok = false; }
    /* monthly: only on a figure that comes with a full representative example (car.finance); otherwise no monthly test or figure */
    if (p.budget_type === 'monthly' && p.monthly_gbp > 0) { if (car.finance && car.finance.monthly) { if (car.finance.monthly <= p.monthly_gbp) { sc += 15; why.push('In monthly budget at the current price'); } else ok = false; } else sc -= 4; }
    var cols = (p.colours || []).filter(function (x) { return x !== 'Any'; }), mustC = p.colours_must || [];
    if (cols.length) { var fam = colourFamily(car); if (cols.indexOf(fam) !== -1) { sc += 10; why.push(fam + ', a colour you like'); } else sc -= 4; if (mustC.length && fam && mustC.indexOf(fam) === -1) ok = false; }
    (p.specs_must || []).forEach(function (k) { var h = hasSpec(car, k); if (h === false) ok = false; });
    return { score: Math.max(1, Math.min(99, Math.round(sc))), reasons: why, ok: ok };
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
  function rank(cars, p) {
    return cars.map(function (c) { var r = score(c, p); return { car: c, score: r.score, reasons: r.reasons, ok: r.ok }; })
      .filter(function (x) { return x.ok; }).sort(function (a, b) { return b.score - a.score; });
  }
  function waText(car, who) {
    if (car.kind === 'new_stock') return 'Hi' + (who ? ' ' + who : '') + ', a new ' + car.model + (car.colour ? ' in ' + car.colour : '') + ' has come into stock that could suit you. Shall I put a quote together?';
    var hi = 'Hi' + (who ? ' ' + who : '') + ', ';
    if (car.kind === 'new') return hi + 'I matched with a new BMW ' + car.model + ' on Swipe Drive. Can we talk options?';
    return hi + 'I matched with the ' + car.model + (car.year ? ' (' + car.year + ')' : '') + ', reg ' + normReg(car.reg) + ', on Swipe Drive. Is it still available?';
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
  root.ctMatch = { colourFamily: colourFamily, specOptions: specOptions, hasSpec: hasSpec, FAMILY: FAMILY, DAN_WA: DAN_WA, normReg: normReg, score: score, rank: rank, fromNewStock: fromNewStock, waLink: waLink, waText: waText, finance: finance, gbp: gbp, covers: covers, stampArrivals: stampArrivals, arrivalOf: arrivalOf, justArrived: justArrived, arrivedText: arrivedText, newSince: newSince, londonDay: londonDay, JUST_DAYS: JUST_DAYS, newStockFinance: newStockFinance, fuelList: fuelList, MILEAGE_BANDS: MILEAGE_BANDS, carMiles: carMiles, modelFit: modelFit };
})(typeof window !== 'undefined' ? window : globalThis);
