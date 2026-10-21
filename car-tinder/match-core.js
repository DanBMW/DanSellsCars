/* Car Tinder matching, shared by the app (app.js) and the daily match job
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
  /* Returns {score 0..100, reasons[], ok}. ok false = outside a hard limit. */
  function score(car, p) {
    p = p || {}; var sc = 40, why = [], ok = true, s = S();
    var isNew = car.kind === 'new';
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
      if (car.year) sc += Math.max(0, Math.min(6, car.year - 2019));
      if (p.annual_mileage > 12000 && /diesel|phev/.test(fk[0] || '')) sc += 3;
      if (car.source === 'forecourt') sc += 2;
    }
    return { score: Math.max(1, Math.min(99, Math.round(sc))), reasons: why, ok: ok };
  }
  function rank(cars, p) {
    return cars.map(function (c) { var r = score(c, p); return { car: c, score: r.score, reasons: r.reasons, ok: r.ok }; })
      .filter(function (x) { return x.ok; }).sort(function (a, b) { return b.score - a.score; });
  }
  function waText(car, who) {
    var hi = 'Hi' + (who ? ' ' + who : '') + ', ';
    if (car.kind === 'new') return hi + 'I matched with a new BMW ' + car.model + ' on Car Tinder. Can we talk options?';
    return hi + 'I matched with the ' + car.model + (car.year ? ' (' + car.year + ')' : '') + ', reg ' + normReg(car.reg) + ', on Car Tinder. Is it still available?';
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
  root.ctMatch = { DAN_WA: DAN_WA, normReg: normReg, score: score, rank: rank, waLink: waLink, waText: waText, finance: finance, gbp: gbp };
})(typeof window !== 'undefined' ? window : globalThis);
