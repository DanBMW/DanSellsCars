/* Shared stock rules for stock.html and the Find my BMW funnel (fmb.js).
 *
 * One copy of the body, fuel and equipment rules, so the funnel's live counts,
 * its "See all matches" hand-off and the stock.html filters can never disagree
 * (CLAUDE.md: twinned code has bitten this repo before).
 *
 * Body. The data mislabels several cars, so the shape comes from the series
 * and the model name first and the `body` field last:
 *   - i4 is listed as "Coupe" with no "Gran Coupe" in the name: it is a four
 *     door Gran Coupe.
 *   - X4 and X6 are listed as "Coupe": they are SUV coupes, so they count as
 *     both an SUV and a coupe in the funnel and as "SUV Coupe" on stock.html.
 *   - The 2 Series Gran Tourer is listed as "Coupe" and the Active Tourer as
 *     "MPV": both are MPV/tourers.
 *
 * Fuel keys use stock.html's own values: petrol, diesel, mhev-petrol,
 * mhev-diesel, phev, electric ('' when the data says nothing usable).
 */
window.dsStock = (function () {
  'use strict';

  function bodyKeys(c) {
    var m = String((c && c.model) || '').toLowerCase();
    var s = String((c && c.series) || '');
    var b = String((c && c.body) || '');
    var k = {};
    if (/^(X\d|iX\d?|XM)$/.test(s)) k.suv = 1;
    if (s === 'X4' || s === 'X6') { k.suv = 1; k.coupe = 1; }
    if (/gran\s*coup/.test(m) || s === 'i4') k.gran_coupe = 1;
    if (/\btourer\b/.test(m) || b === 'MPV') k.mpv = 1;
    if (/\btouring\b/.test(m)) k.touring = 1;
    if (!Object.keys(k).length) {
      var map = { SUV: 'suv', Saloon: 'saloon', Estate: 'touring', Hatchback: 'hatchback',
                  Coupe: 'coupe', Convertible: 'convertible', MPV: 'mpv' };
      if (map[b]) k[map[b]] = 1;
    }
    return Object.keys(k);
  }

  /* One value for a single valued facet (stock.html). An X4 is both an SUV and
     a coupe, so it gets its own "SUV coupe" value. */
  function bodyPrimary(c) {
    var ks = bodyKeys(c);
    if (ks.indexOf('suv') !== -1 && ks.indexOf('coupe') !== -1) return 'suv_coupe';
    var order = ['suv', 'gran_coupe', 'mpv', 'touring', 'saloon', 'hatchback', 'coupe', 'convertible'];
    for (var i = 0; i < order.length; i++) if (ks.indexOf(order[i]) !== -1) return order[i];
    return ks[0] || '';
  }

  /* stock.html's facet values and labels for each primary body */
  var STOCK_BODY = {
    suv: ['suv', 'SUV'], suv_coupe: ['suv-coupe', 'SUV Coup\u00e9'],
    saloon: ['saloon', 'Saloon'], touring: ['estate', 'Estate'],
    hatchback: ['hatch', 'Hatchback'], mpv: ['mpv', 'MPV and Tourer'],
    coupe: ['coupe', 'Coup\u00e9'], gran_coupe: ['gran-coupe', 'Gran Coup\u00e9'],
    convertible: ['convertible', 'Convertible']
  };
  function stockBodyKey(c) { var p = STOCK_BODY[bodyPrimary(c)]; return p ? p[0] : ''; }
  function stockBodyLabel(c) { var p = STOCK_BODY[bodyPrimary(c)]; return p ? p[1] : (c.body || ''); }

  function fuelKey(c) {
    var f = String((c && c.fuel) || '').toLowerCase();
    if (f.indexOf('plug-in') !== -1 || f.indexOf('plug in') !== -1) return 'phev';
    if (f.indexOf('electric') !== -1) return 'electric';
    if (f.indexOf('mild hybrid') !== -1 && f.indexOf('diesel') !== -1) return 'mhev-diesel';
    if (f.indexOf('mild hybrid') !== -1) return 'mhev-petrol';
    if (f.indexOf('diesel') !== -1) return 'diesel';
    if (f.indexOf('petrol') !== -1) return 'petrol';
    var g = String((c && c.fuelGroup) || '').toLowerCase();
    if (g.indexOf('plug') !== -1) return 'phev';
    if (g.indexOf('electric') !== -1) return 'electric';
    if (g.indexOf('diesel') !== -1) return 'diesel';
    if (g.indexOf('petrol') !== -1) return 'petrol';
    return '';
  }

  /* Equipment the data can actually see. Lines are truncated at about 40
     characters (match the stump) and "Deletion of ..." means the car does NOT
     have it, so those lines are thrown out first. Sat nav, CarPlay, leather and
     cameras are standard fit and not itemised, so they are deliberately absent. */
  var DELETED = /^\s*deletion of/i;
  var FEATURES = {
    heated:  { label: 'Heated seats',            re: /heated\s+(front\s+|and\s+rear\s+)?seats|heat comfort system/i },
    pano:    { label: 'Panoramic roof',          re: /panoramic glass (sun)?roof|sky lounge panoramic/i },
    hud:     { label: 'Head-up display',         re: /head.?up display/i },
    sound:   { label: 'Harman Kardon or better', re: /harman\/kardon|bowers & wilkins|hifi loudspeaker/i },
    keyless: { label: 'Keyless entry',           re: /comfort access/i },
    /* BMW rarely itemises adaptive cruise by name: it comes inside Driving
       Assistant Plus and Driving Assistant Professional, which is what the
       listings print. Matching only "Active Cruise Cont" found 24 cars of 332
       when 97 have it. Two lines must NOT count, and both look like a match:
       plain "Driving Assistant" (121 cars) is lane departure and collision
       warning with ordinary cruise, no adaptive anything; and "Driving
       Assistant Plus preparation" (19 cars) means wired for it and not fitted,
       the same trap as "Deletion of". */
    acc:     { label: 'Adaptive cruise',         re: /active cruise cont|driving assistant (plus|pro)/i,
               not: /prep/i },
    towbar:  { label: 'Tow bar',                 re: /tow ?bar|towbar|trailer tow/i },
    xdrive:  { label: 'xDrive all wheel drive',  test: function (c) { return c.drive === 'FourWheel'; } },
    seven:   { label: '7 seats',                 test: function (c) { return String(c.seats) === '7'; } }
  };
  /* true / false, or null when the equipment list has not loaded yet */
  function hasFeature(c, det, key) {
    var f = FEATURES[key];
    if (!f) return false;
    if (f.test) return !!f.test(c);
    if (!det) return null;
    var kit = det.equipment || [];
    for (var i = 0; i < kit.length; i++) {
      if (DELETED.test(kit[i])) continue;
      if (f.not && f.not.test(kit[i])) continue;
      if (f.re.test(kit[i])) return true;
    }
    return false;
  }

  function num(s) { var m = String(s == null ? '' : s).replace(/[^0-9]/g, ''); return m ? parseInt(m, 10) : 0; }

  return { bodyKeys: bodyKeys, bodyPrimary: bodyPrimary, stockBodyKey: stockBodyKey,
           stockBodyLabel: stockBodyLabel, STOCK_BODY: STOCK_BODY, fuelKey: fuelKey,
           FEATURES: FEATURES, DELETED: DELETED, hasFeature: hasFeature, num: num };
})();
