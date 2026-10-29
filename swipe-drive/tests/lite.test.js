/* SwipeToDrive on lookup/new-stock-lite.json: same deck as the full file for every kind of profile,
   including must have spec; a car's own record merges in when opened; nothing names a site. */
const assert = require('assert'), fs = require('fs'), path = require('path'); global.window = global;
const R = path.join(__dirname, '../..');
require(R + '/stock-core.js'); require('../match-core.js'); require(R + '/dsfinance.js');
const M = window.ctMatch, fin = window.dsFin;
const full = JSON.parse(fs.readFileSync(R + '/lookup/new-stock.json')), lite = JSON.parse(fs.readFileSync(R + '/lookup/new-stock-lite.json'));
let qf = null; try { qf = JSON.parse(fs.readFileSync(R + '/lookup/new-stock-quotes.json')); } catch (e) {}
const prep = (d) => M.applyLenderQuotes((d.cars || []).filter(c => c.order_number && !c.on_hold && c.price_gbp).map(M.fromNewStock), qf, fin);
const A = prep(full), B = prep(lite); let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
ok(A.length === B.length && A.length > 300, 'same cars: ' + A.length + ' / ' + B.length);
const profiles = [{}, { models: ['X5'] }, { budget_type: 'cash', cash_gbp: 45000 }, { budget_type: 'monthly', monthly_gbp: 500 }, { fuel: 'electric' },
  { new_used: 'new', specs: ['gearbox:Automatic'], specs_must: ['gearbox:Automatic'] }, { specs_must: ['trim:M Sport'] }, { specs_must: ['feat:camera'], models: ['X3'] },
  ...Object.keys((window.ctStock || window.dsStock || {}).FEATURES || {}).map(k => ({ specs_must: ['feat:' + k] }))];
const key = (rk) => rk.map(x => x.car.reg + ':' + x.score + ':' + (x.notes || []).join('|')).join(',');
const needsFull = (c) => !!((c.specs_must || []).length || (c.specs || []).length);
/* app.js rule: spec choices read the full file and merge it into the light cars */
const upgrade = (cars) => { const by = {}; full.cars.forEach(x => by[String(x.order_number)] = x); return cars.map(c => M.mergeNewDetail(Object.assign({}, c), by[c.order_number])); };
const Bf = upgrade(B);
profiles.forEach(p => ok(key(M.rank(A, p)) === key(M.rank(needsFull(p) ? Bf : B, p)), 'same deck for ' + JSON.stringify(p)));
ok(B.every(c => !c.finance || /representative APR|APR/.test(c.finance.representative_example)), 'monthly only with its representative example');
const o = lite.cars[0].order_number, d = JSON.parse(fs.readFileSync(R + '/lookup/order/' + o + '.json')), c = B.find(x => x.order_number === String(o)) || prep({ cars: [lite.cars[0]] })[0];
const mon = c.monthly_gbp; M.mergeNewDetail(c, d);
ok(c.detail && c.images.length >= 1 && c.standard.length > 0 && c.monthly_gbp === mon, 'order file merges pictures and equipment, monthly untouched');
ok(!/Bromley|Enfield|Woolwich|retailer/i.test(JSON.stringify(B.map(x => [x.model, x.description, x.price]))), 'no site names in card text');
console.log('lite.test.js: ' + n + ' passed');
