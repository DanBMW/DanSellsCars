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
    seven:   { label: '7 seats',                 test: function (c) { return String(c.seats) === '7'; } },
    /* Reversing camera (separate from the 360 camera option). Three way: true, false, or null for unknown. */
    revcam:  { label: 'Reversing camera',        tri: function (c, det) { return reversingCamera(c, det); } }
  };
  /* Reversing camera rules, agreed with Dan 28 Oct 2026:
     yes   the listing names a reversing or rear view camera, Parking Assistant Plus or Pro, or Surround View;
           or the car is a generation BMW UK lists with the camera as standard, first registered on or after the cutoff;
           or Dan has confirmed it by hand (CAMERA_OVERRIDES).
     no    parking sensors only (PDC) and nothing above.
     null  plain Parking Assistant, which does not by itself mean a camera, or no equipment list. */
  var CAMERA_OVERRIDES = {      /* listing id: true or false, add a line per car Dan confirms */
    '257888': true              /* MC23OPS 218i Gran Coupe, Dan confirmed 28 Oct 2026 */
  };
  var CAMERA_YES = /revers\w*\s+(assist\s+)?camera|rear.?view camera|rear camera|parking assist\w*\s+(plus|pro)|surround view|top view|panorama view|360.{0,4}camera|camera.{0,6}360/i;
  var CAMERA_MAYBE = /parking assist/i;
  var CAMERA_NO = /park distance control|pdc|parking sensor/i;
  /* [test on series and model text, first month with the camera standard]. Older generations sold alongside are excluded by name. */
  var CAMERA_STD = [
    [function (t) { return /1 series/.test(t) && !/11[68]i|11[68]d|128ti/.test(t); }, '2024-10'],
    [function (t) { return /gran coupe/.test(t) && /2 series/.test(t) && !/21[68]i|218d|220d|m235i xdrive gran/.test(t); }, '2024-10'],
    [function (t) { return /\bi?x1\b/.test(t); }, '2022-10'],
    [function (t) { return /\bi?x2\b/.test(t); }, '2023-10'],
    [function (t) { return /3 series|\bi3\b/.test(t) && !/gran turismo/.test(t); }, '2022-07'],
    [function (t) { return /5 series|\bi5\b/.test(t) && !/gran turismo/.test(t); }, '2023-10'],
    [function (t) { return /\bx3\b|\bix3\b/.test(t); }, '2024-11'],
    [function (t) { return /\bx5\b/.test(t); }, '2023-04'],
    [function (t) { return /\bi4\b|4 series gran coupe|4\d\d[id] .*gran coupe/.test(t); }, '2024-03']
  ];
  function reversingCamera(c, det) {
    var id = c && c.listing_id != null ? String(c.listing_id) : '';
    if (Object.prototype.hasOwnProperty.call(CAMERA_OVERRIDES, id)) return CAMERA_OVERRIDES[id];
    var kit = det && det.equipment ? det.equipment.filter(function (x) { return !DELETED.test(x) && !/prep/i.test(x); }) : null;
    if (kit && kit.some(function (x) { return CAMERA_YES.test(x); })) return true;
    var t = (String((c && c.series) || '') + ' ' + String((c && c.model) || '') + ' ' + String((det && det.version) || '')).toLowerCase().replace(/coup\u00e9/g, 'coupe');
    var reg = String((det && det.first_reg) || '').slice(0, 7);
    if (reg && CAMERA_STD.some(function (r) { return r[0](t) && reg >= r[1]; })) return true;
    if (!kit) return null;
    if (kit.some(function (x) { return CAMERA_MAYBE.test(x); })) return null;
    return kit.some(function (x) { return CAMERA_NO.test(x); }) ? false : null;
  }
  /* true / false, or null when the equipment list has not loaded yet */
  function hasFeature(c, det, key) {
    var f = FEATURES[key];
    if (!f) return false;
    if (f.test) return !!f.test(c);
    if (f.tri) return f.tri(c, det);
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
           FEATURES: FEATURES, DELETED: DELETED, hasFeature: hasFeature, num: num,
           reversingCamera: reversingCamera, CAMERA_OVERRIDES: CAMERA_OVERRIDES };
})();
