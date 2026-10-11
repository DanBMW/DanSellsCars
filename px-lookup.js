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
  function norm(reg, d) {
    var mot = (d.motHistory || []).filter(function (t) { return t.odo; })[0] || null;
    var miles = mot && (mot.odoUnit || 'MI') === 'MI' ? mot.odo : (mot && mot.odoUnit === 'KM' ? Math.round(mot.odo * 0.621371) : null);
    return {
      reg: reg, make: d.make ? (String(d.make).toUpperCase() === 'BMW' ? 'BMW' : title(d.make)) : '', model: d.model ? (/^[A-Z0-9 ]+$/.test(d.model) && d.model.length > 4 ? title(d.model) : d.model) : '',
      year: d.yearOfManufacture || d.year || '', colour: d.colour ? title(d.colour) : '', fuel: d.fuelType ? title(d.fuelType) : '',
      motExpiry: ukDate(d.motExpiryDate || d.motDueDate || ''), motMiles: miles, motDate: mot ? ukDate(mot.date) : ''
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
      ['Last MOT mileage', v.motMiles ? Number(v.motMiles).toLocaleString('en-GB') + ' miles' + (v.motDate ? ' (' + v.motDate + ')' : '') : '']]
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
    return [carName(v), v.colour, v.fuel, v.motExpiry ? 'MOT until ' + v.motExpiry : '', v.motMiles ? 'last MOT ' + Number(v.motMiles).toLocaleString('en-GB') + ' miles' : ''].filter(Boolean).join(', ');
  }
  window.dsPxLookup = { lookup: lookup, plausible: plausible, clean: clean, card: card, summary: summary, carName: carName, WORKER: WORKER };
})();
