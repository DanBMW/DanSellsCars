/* Shared part exchange reg lookup: homepage quick form and Find my BMW.
   Goes through the site's own vehicleproxy worker (target=vehicle-lookup,
   DVLA plus MOT history), never to DVLA or the MOT API directly. The worker
   only answers this site's origin. Failure is always quiet: the caller just
   carries on with the reg and mileage the customer typed. */
(function () {
  var WORKER = 'https://vehicleproxy.danielcane1992.workers.dev';
  var cache = {};
  function clean(r) { return String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  /* Looks like a UK plate: 2 to 7 characters, at least one letter and one digit */
  function plausible(r) { r = clean(r); return r.length >= 2 && r.length <= 7 && /[A-Z]/.test(r) && /\d/.test(r); }
  function title(s) { return String(s || '').toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }).replace(/\bBmw\b/g, 'BMW').replace(/\b(Mhev|Phev|Hev|Ev|Gt|Gti|Amg|Tdi|Tsi|Suv|Cvt|Dct)\b/g, function (w) { return w.toUpperCase(); }).replace(/\bXdrive/g, 'xDrive').replace(/\bSdrive/g, 'sDrive'); }
  function ukDate(s) {
    var m = /^(\d{4})[-.](\d{2})[-.](\d{2})/.exec(s || ''); if (!m) return '';
    var M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return Number(m[3]) + ' ' + M[Number(m[2]) - 1] + ' ' + m[1];
  }

  /* Mileage today, estimated from the MOT history (Dan's formula):
     miles a month = (last MOT miles minus the previous MOT miles) / months between
     those two tests, then last MOT miles + miles a month x months since the last
     MOT, rounded to the nearest 100. Only passed tests with a real odometer
     reading count; km are converted; same day retests are collapsed.
     One MOT: average since first registration if we know that date, else the
     last reading as is. No MOT: nothing. A falling reading or more than 5,000
     a month: the last reading as is. Returns null or
     { miles, last, lastDate, rate, months, method, working }. */
  var MONTH_MS = 365.2425 / 12 * 864e5;
  function pdate(s) { var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1) : NaN; }
  function shortDate(t) { var d = new Date(t); return d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function fmt(n) { return Number(n).toLocaleString('en-GB'); }
  function estimate(d, now) {
    now = now || Date.now();
    var seen = {}, tests = (d && d.motHistory || []).map(function (t) {
      var miles = t.odo ? Number(t.odo) : NaN, u = String(t.odoUnit || 'MI').toUpperCase();
      if (u === 'KM') miles = miles * 0.621371; else if (u !== 'MI') miles = NaN;
      return { t: pdate(t.date), miles: miles, pass: /^PASS/i.test(t.result || '') };
    }).filter(function (x) { return x.pass && x.miles > 0 && !isNaN(x.t); })
      .sort(function (a, b) { return b.t - a.t; })
      .filter(function (x) { var k = new Date(x.t).toISOString().slice(0, 10); if (seen[k]) return false; seen[k] = 1; return true; });
    if (!tests.length) return null;
    var L = tests[0], since = Math.max(0, (now - L.t) / MONTH_MS), rate = null, method = 'last', note = '';
    if (tests.length > 1) {
      var P = tests[1], gap = (L.t - P.t) / MONTH_MS, diff = L.miles - P.miles;
      if (gap > 0.5) rate = diff / gap;
      if (diff < 0) note = 'reading went down since the previous MOT, so using the last reading';
      method = 'two';
    } else {
      var reg = pdate(d.monthOfFirstRegistration || d.registrationDate || d.firstUsedDate || '');
      if (!isNaN(reg) && L.t > reg) { var m = (L.t - reg) / MONTH_MS; if (m > 1) { rate = L.miles / m; method = 'reg'; } }
    }
    if (rate !== null && (rate < 0 || rate > 5000)) { if (!note) note = 'rate looked wrong, so using the last reading'; rate = null; }
    var miles = Math.round((L.miles + (rate ? rate * since : 0)) / 100) * 100;
    var w = 'Last MOT ' + fmt(Math.round(L.miles)) + ' (' + shortDate(L.t) + ')';
    if (rate) w += ', about ' + fmt(Math.round(rate / 10) * 10) + ' a month' + (method === 'reg' ? ' since first registration' : '') + ', ' + (Math.round(since * 10) / 10) + ' months since, estimate ' + fmt(miles);
    else w += note ? ', ' + note : (tests.length === 1 ? ', only one MOT so using it as is' : '');
    return { miles: miles, last: Math.round(L.miles), lastDate: shortDate(L.t), rate: rate ? Math.round(rate) : null, months: Math.round(since * 10) / 10, method: rate ? method : 'last', working: w };
  }
  function norm(reg, d) {
    var mot = (d.motHistory || []).filter(function (t) { return t.odo; })[0] || null;
    var miles = mot && (mot.odoUnit || 'MI') === 'MI' ? mot.odo : (mot && mot.odoUnit === 'KM' ? Math.round(mot.odo * 0.621371) : null);
    return {
      reg: reg, make: d.make ? (String(d.make).toUpperCase() === 'BMW' ? 'BMW' : title(d.make)) : '', model: d.model ? (/^[A-Z0-9 ]+$/.test(d.model) && d.model.length > 4 ? title(d.model) : d.model) : '',
      year: d.yearOfManufacture || d.year || '', colour: d.colour ? title(d.colour) : '', fuel: d.fuelType ? title(d.fuelType) : '',
      motExpiry: ukDate(d.motExpiryDate || d.motDueDate || ''), motMiles: miles, motDate: mot ? ukDate(mot.date) : '',
      est: estimate(d)
    };
  }
  function lookup(reg) {
    reg = clean(reg);
    if (!plausible(reg)) return Promise.reject(new Error('format'));
    if (cache[reg]) return cache[reg];
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
    cache[reg] = fetch(WORKER + '?target=vehicle-lookup&reg=' + encodeURIComponent(reg), ctl ? { signal: ctl.signal } : {})
      .then(function (r) { return r.json(); })
      .then(function (d) { clearTimeout(timer); if (!d || d.error || !(d.make || d.model)) throw new Error('nf'); return norm(reg, d); })
      ['catch'](function (e) { clearTimeout(timer); delete cache[reg]; throw e; });
    return cache[reg];
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function carName(v) { return [v.year, v.make, v.model].filter(Boolean).join(' '); }
  function rows(v) {
    return [['Colour', v.colour], ['Fuel', v.fuel], ['MOT until', v.motExpiry],
      ['Last MOT mileage', v.motMiles ? Number(v.motMiles).toLocaleString('en-GB') + ' miles' + (v.motDate ? ' (' + v.motDate + ')' : '') : ''],
      ['Mileage today', v.est && v.est.rate ? 'About ' + fmt(v.est.miles) + ' (estimated)' : '']]
      .filter(function (r) { return r[1]; });
  }
  /* The confirmation card. Buttons carry data-pxl="yes" / "change". */
  function card(v) {
    return '<div class="pxl-card" role="group" aria-label="Is this your car?">'
      + '<p class="pxl-car"><b>' + esc(v.reg) + '</b> ' + esc(carName(v)) + '</p>'
      + '<dl>' + rows(v).map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>'
      + '<p class="pxl-q">Is this your car?</p>'
      + '<div class="pxl-btns"><button type="button" class="pxl-yes" data-pxl="yes">Yes, that\u2019s it</button><button type="button" class="pxl-change" data-pxl="change">Change</button></div>'
      + '</div>';
  }
  function summary(v) {
    if (!v) return '';
    return [carName(v), v.colour, v.fuel, v.motExpiry ? 'MOT until ' + v.motExpiry : '', v.motMiles ? 'last MOT ' + Number(v.motMiles).toLocaleString('en-GB') + ' miles' : '', v.est ? 'mileage estimate: ' + v.est.working : ''].filter(Boolean).join(', ');
  }
  function suggest(v) { return v && v.est ? v.est.miles : null; }
  function suggestNote(v) {
    if (!v || !v.est) return '';
    return v.est.rate ? 'About ' + fmt(v.est.miles) + ' miles, estimated from your MOT history. Please check and update.'
                      : 'That is the mileage from its last MOT. Please update it if it has gone up since.';
  }
  var api = { estimate: estimate, suggest: suggest, suggestNote: suggestNote, lookup: lookup, plausible: plausible, clean: clean, card: card, summary: summary, carName: carName, WORKER: WORKER };
  if (typeof window !== 'undefined') window.dsPxLookup = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
