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
  /* Returns {score 0..100, reasons[], ok}. ok false = outside a hard limit. */
  function score(car, p) {
    p = p || {}; var sc = 40, why = [], ok = true, s = S();
    var isNew = car.kind === 'new', ns = car.kind === 'new_stock';   /* new_stock: a real new car in retailer stock */
    if (ns) return scoreNewStock(car, p);
    if (p.new_used === 'new' && !isNew) return { score: 0, reasons: [], ok: false };
    if (p.new_used === 'used' && isNew) return { score: 0, reasons: [], ok: false };
    var fk = isNew ? car.fuelKeys || [] : [s.fuelKey(car)];
    if (p.fuel && p.fuel !== 'open') {
      var hit = fk.some(function (k) { return (FUEL_OK[p.fuel] || []).indexOf(k) !== -1; });
      if (hit) { sc += 20; why.push('Your fuel'); } else if (!isNew) { ok = false; } else sc -= 10;
    } else sc += 8;
    var bk = isNew ? car.bodyKeys || [] : s.bodyKeys(car);
    if (p.body && p.body !== 'any') {
      if (bk.some(function (k) { return (BODY_OK[p.body] || []).indexOf(k) !== -1; })) { sc += 15; why.push('Your shape'); } else sc -= 12;
    }
    var models = (p.models || []).map(function (m) { return String(m).toLowerCase(); });
    if (models.length) {
      var name = (String(car.series || '') + ' ' + String(car.model || '')).toLowerCase();
      if (models.some(function (m) { return name.indexOf(m) !== -1; })) { sc += 22; why.push('A model you picked'); } else sc -= 6;
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
      if (car.year) sc += Math.max(0, Math.min(6, car.year - 2019));
      if (p.annual_mileage > 12000 && /diesel|phev/.test(fk[0] || '')) sc += 3;
      if (car.source === 'forecourt') sc += 2;
    }
    return { score: Math.max(1, Math.min(99, Math.round(sc))), reasons: why, ok: ok };
  }
  /* New stock: in budget only on its actual current price. No discount assumptions. Staff alerts only. */
  function scoreNewStock(car, p) {
    var sc = 38, why = [], ok = true, s = S();
    if (p.new_used === 'used') return { score: 0, reasons: [], ok: false };
    var fk = [s.fuelKey(car)];
    if (p.fuel && p.fuel !== 'open') { if (fk.some(function (k) { return (FUEL_OK[p.fuel] || []).indexOf(k) !== -1; })) { sc += 20; why.push('Your fuel'); } else ok = false; } else sc += 8;
    var bk = s.bodyKeys(car) || [];
    if (p.body && p.body !== 'any') { if (bk.some(function (k) { return (BODY_OK[p.body] || []).indexOf(k) !== -1; })) { sc += 15; why.push('Your shape'); } else sc -= 12; }
    var models = (p.models || []).map(function (m) { return String(m).toLowerCase(); });
    if (models.length) { var name = (String(car.series || '') + ' ' + String(car.model || '')).toLowerCase();
      if (models.some(function (m) { return name.indexOf(m) !== -1; })) { sc += 22; why.push('A model you picked'); } else sc -= 6; }
    if (p.budget_type === 'cash' && p.cash_gbp > 0 && car.price_gbp) { if (car.price_gbp <= p.cash_gbp) { sc += 15; why.push('In budget at the current price'); } else ok = false; }
    if (p.budget_type === 'monthly' && p.monthly_gbp > 0 && car.monthly_gbp) { if (car.monthly_gbp <= p.monthly_gbp) { sc += 15; why.push('In monthly budget at the current price'); } else ok = false; }
    var cols = (p.colours || []).filter(function (x) { return x !== 'Any'; }), mustC = p.colours_must || [];
    if (cols.length) { var fam = colourFamily(car); if (cols.indexOf(fam) !== -1) { sc += 10; why.push(fam + ', a colour you like'); } else sc -= 4; if (mustC.length && fam && mustC.indexOf(fam) === -1) ok = false; }
    (p.specs_must || []).forEach(function (k) { var h = hasSpec(car, k); if (h === false) ok = false; });
    return { score: Math.max(1, Math.min(99, Math.round(sc))), reasons: why, ok: ok };
  }
  function fromNewStock(c) { return { kind: 'new_stock', reg: 'NEW' + c.order_number, order_number: c.order_number, model: c.range || ('BMW ' + c.description), series: c.series,
    colour: c.colour, fuel: c.fuel, gearbox: c.transmission, price: c.price, price_gbp: c.price_gbp, monthly_gbp: c.monthly_gbp, image: c.image || '' }; }
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
  root.ctMatch = { colourFamily: colourFamily, specOptions: specOptions, hasSpec: hasSpec, FAMILY: FAMILY, DAN_WA: DAN_WA, normReg: normReg, score: score, rank: rank, fromNewStock: fromNewStock, waLink: waLink, waText: waText, finance: finance, gbp: gbp };
})(typeof window !== 'undefined' ? window : globalThis);
