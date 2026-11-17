/* SwipeToDrive BETA matching fixes: i3 series, plate year, 2026 only, body must have, no dealer names in descriptions.
   Run with: node swipe-drive/tests/beta-match.test.js */
var path = require('path'), fs = require('fs');
global.window = global;
require(path.join(__dirname, '..', '..', 'stock-core.js'));
require(path.join(__dirname, '..', 'match-core.js'));
var B = require(path.join(__dirname, '..', 'std-brand.js'));
var M = global.ctMatch, f = 0, p = 0;
function check(label, got, want) { if (got === want) p++; else { f++; console.log('FAIL', label, 'got', got, 'want', want); } }
// 6: series from the model when the feed has none, i3 is its own series
check('i3 series', M.seriesOf({ model: 'BMW i3 120Ah', series: '' }), 'i3');
check('i3s series', M.seriesOf({ model: 'BMW i3s 120Ah' }), 'i3');
check('X3 M50 series', M.seriesOf({ model: 'BMW X3 M50 xDrive' }), 'X3');
check('320d series', M.seriesOf({ model: 'BMW 320d M Sport' }), '3 Series');
check('feed series kept', M.seriesOf({ model: 'BMW X5 xDrive45e', series: 'X5' }), 'X5');
var i3 = { kind: 'used', reg: 'HV20HMJ', model: 'BMW i3 120Ah', series: '', year: '2020', price_gbp: 15000, fuel: 'Electric', source: 'forecourt' };
i3.series = M.seriesOf(i3);
check('i3 pick finds HV20HMJ', M.rank([i3], { models: ['i3'], models_must: ['i3'], budget_type: 'cash', cash_gbp: 20000, fuel: 'open' }).some(function (x) { return x.car.reg === 'HV20HMJ'; }), true);
// 7: a 26 or 76 plate is a 2026 car even when the feed says 2025; 2026 only is exact
check('26 plate', M.plateYear('LX26ABC'), 2026);
check('76 plate', M.plateYear('LX76ABC'), 2026);
check('25 plate', M.plateYear('LX25ABC'), 2025);
check('carYear uses the plate', M.carYear({ reg: 'LX26ABC', year: '2025' }), 2026);
check('carYear keeps a later feed year', M.carYear({ reg: 'LX25ABC', year: '2026' }), 2026);
// 5: body must have is a hard filter, a would like is not
var suv = { body: 'suv' }, saloon = { body: 'saloon' };
check('must: suv fits', M.bodyFit(['suv'], { body: 'suv', body_must: true }).ok, true);
check('must: saloon hidden', M.bodyFit(['saloon'], { body: 'suv', body_must: true }).ok, false);
check('would like: saloon still shown', M.bodyFit(['saloon'], { body: 'suv' }).ok, true);
check('must: unknown shape never hidden', M.bodyFit([], { body: 'suv', body_must: true }).ok, true);
check('bodyMust from column', !!M.bodyMust({ body: 'suv', body_must: true }), true);
check('bodyMust from desk', !!M.bodyMust({ body: 'suv', desk: { body_must: true } }), true);
check('no must for any', !!M.bodyMust({ body: 'any', body_must: true }), false);
// descriptions: dealer group names never shown
var d = 'Hedin BMW Ruxley are pleased to offer this car. It has Hedin Club Care. Visit Hedin Automotive in Ruxley today. Lovely spec.';
var c = B.cleanDesc(d);
check('no hedin or ruxley after cleaning', /hedin|ruxley/i.test(c), false);
check('opening reworded', /^Dan is pleased to offer/.test(c), true);
var car = B.cleanCar({ reg: 'AB12CDE', listing_url: 'https://x', retailer_name: 'Hedin', model: 'BMW X1' });
check('listing link and retailer dropped', 'listing_url' in car || 'retailer_name' in car, false);
var stock = path.join(__dirname, '..', '..', 'lookup', 'car-descriptions.json');
if (fs.existsSync(stock)) { var all = JSON.parse(fs.readFileSync(stock, 'utf8')), n = 0, bad = 0;
  Object.keys(all).forEach(function (k) { var t = all[k] && (all[k].text || all[k]); if (typeof t !== 'string') return; n++; if (/hedin|ruxley/i.test(B.cleanDesc(t))) bad++; });
  check('every stored description cleans (' + n + ')', bad, 0); }
console.log(p + ' passed, ' + f + ' failed'); if (f) process.exit(1);
