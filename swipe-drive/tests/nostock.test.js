/* No stock explanations: real counts, the right reason per case, plain copy with no dashes, prices or promises */
const assert = require('assert'); global.window = global;
require('../../stock-core.js'); require('../match-core.js');
const M = window.ctMatch;
const car = (o) => Object.assign({ kind: 'used', reg: 'R' + Math.random(), series: 'X5', model: 'BMW X5 xDrive30d M Sport', fuel: 'Diesel', body: 'SUV', colour: 'Black Sapphire', price_gbp: 40000, year: 2022, mileage: '20,000 miles' }, o);
const stock = [car({}), car({}), car({ series: '3 Series', model: 'BMW 320i M Sport', fuel: 'Petrol', price_gbp: 22000 }), car({ series: 'M3', model: 'BMW M3 Competition', fuel: 'Petrol', price_gbp: 70000 }),
  { kind: 'new', name: 'i5 Saloon', series: 'i5', model: 'BMW i5 Saloon', reg: 'NEW-I5' }];
let r, t; let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
r = M.noStock(stock, { models: ['M2'] }); ok(r.length === 1 && r[0].kind === 'none' && r[0].m_car, 'M2: none, M car');
t = M.noStockText(r[0], { alerts: true }); ok(/^No M2 in stock right now, as M cars rarely/.test(t) && /You will be notified/.test(t), 'M2 wording with alerts on: ' + t);
t = M.noStockText(r[0], { alerts: false }); ok(/Turn on alerts and you will be notified/.test(t), 'alerts off offers to turn them on');
r = M.noStock(stock, { models: ['X3 M'] }); ok(r[0].kind === 'none' && r[0].m_car, 'X3 M counts as an M car');
ok(M.noStock(stock, { models: ['X5'] }).length === 0, 'X5 in stock: nothing to explain');
ok(M.noStock(stock, { models: ['M3'] }).length === 0, 'M3 in stock: nothing to explain');
ok(M.noStock(stock, { models: ['M2'] })[0].total === 0 && !M.hasModel(car({ series: '2 Series', model: 'BMW M240i' }), 'M2'), 'M240i is not an M2');
r = M.noStock(stock, { models: ['i5'] }); ok(r[0].kind === 'none' && r[0].new_avail && /available new/.test(M.noStockText(r[0])), 'i5: none used, available new');
r = M.noStock(stock, { models: ['M3'], budget_type: 'cash', cash_gbp: 30000 }); ok(r[0].kind === 'budget' && r[0].total === 1, 'M3 over budget');
t = M.noStockText(r[0]); ok(t === 'Your budget does not stretch to the M3 based on the parameters you set.', 'budget wording: ' + t);
r = M.noStock(stock, { models: ['X5'], fuel: 'electric' }); ok(r[0].kind === 'filter' && r[0].filter === 'fuel' && r[0].electric_only && M.noStockText(r[0]) === 'We have 2 X5 cars in stock, but none are electric.', 'electric only');
ok(M.noStockWiden(r[0]).patch.fuel === 'open', 'one tap widen for fuel');
r = M.noStock(stock, { models: ['X5'], colours: ['White'], colours_must: ['White'] }); ok(r[0].filter === 'colours' && /must have colour/.test(M.noStockText(r[0])), 'colour filter');
r = M.noStock(stock, { models: ['X5'], new_used: 'new' }); ok(r[0].filter === 'new_used' && /none are brand new/.test(M.noStockText(r[0])), 'new only');
r = M.noStock(stock, { models: ['X5'], fuel: 'electric', budget_type: 'cash', cash_gbp: 10000 }); ok(r[0].kind === 'narrow' && /fit all your choices together/.test(M.noStockText(r[0])), 'two filters together: narrow');
r = M.noStock(stock, { models: ['X5'], fuel: 'electric', budget_type: 'cash', cash_gbp: 30000 }); ok(r[0].kind === 'narrow', 'budget alone does not free it, so narrow');
ok(M.mustNote({}) === '' && /must have models set, so you only see cars that match, with no other suggestions/.test(M.mustNote({ models_must: ['X5', 'X3'] })) && /must have models and spec/.test(M.mustNote({ models_must: ['X5'], specs_must: ['a'] })), 'must have note');
// budgets: no unrealistic new cars
const ph = { kind: 'new', name: 'M5 Saloon', series: 'M5', model: 'BMW M5 Saloon', reg: 'NEW-M5', floor_cash: 20000, floor_monthly: 200 };
const nsCar = (o) => Object.assign({ kind: 'new_stock', reg: 'NEWX', series: 'X7', model: 'BMW X7', description: 'X7 xDrive40d', fuel: 'Diesel', price_gbp: 90000, finance: null }, o);
ok(M.rank([ph], { models: ['M5'] }).length === 1, 'model card shown when no budget set');
ok(M.rank([ph], { models: ['M5'], budget_type: 'cash', cash_gbp: 30000 }).length === 0, 'model card hidden once a cash budget is set');
ok(M.rank([ph], { models: ['M5'], budget_type: 'monthly', monthly_gbp: 400 }).length === 0, 'model card hidden once a monthly budget is set');
ok(M.rank([ph], { models: ['M5'], budget_type: 'cash', cash_gbp: 30000, new_used: 'new' }).length === 1, 'model card kept for someone who chose brand new');
ok(M.rank([nsCar({})], { budget_type: 'cash', cash_gbp: 50000 }).length === 0 && M.rank([nsCar({})], { budget_type: 'cash', cash_gbp: 95000 }).length === 1, 'new stock: real price against cash budget');
ok(M.rank([nsCar({})], { budget_type: 'monthly', monthly_gbp: 2000 }).length === 0, 'new stock with no quoted monthly hidden for a monthly budget');
ok(M.rank([nsCar({ finance: { monthly: 900 } })], { budget_type: 'monthly', monthly_gbp: 500 }).length === 0 && M.rank([nsCar({ finance: { monthly: 450 } })], { budget_type: 'monthly', monthly_gbp: 500 }).length === 1, 'new stock: real quoted monthly against budget');
ok(M.rank([nsCar({ price_gbp: null })], { budget_type: 'cash', cash_gbp: 200000 }).length === 0 && M.rank([nsCar({ price_gbp: null })], { budget_type: 'cash', cash_gbp: 200000, new_used: 'new' }).length === 1, 'new stock with no price: only for someone who chose new');
r = M.noStock([ph], { models: ['M5'] }); ok(r[0].kind === 'none' && r[0].new_avail, 'no budget: ordering new offered');
r = M.noStock([ph], { models: ['M5'], budget_type: 'cash', cash_gbp: 15000 }); ok(r[0].kind === 'none' && !r[0].new_avail && !/available new/.test(M.noStockText(r[0])), 'budget set: no ordering new suggestion for a priceless model card');
r = M.noStock([nsCar({})], { models: ['X7'], budget_type: 'cash', cash_gbp: 40000 }); ok(r[0].kind === 'budget' && !r[0].new_avail && /does not stretch/.test(M.noStockText(r[0])), 'over budget new stock: budget message, not ordering new');
// lender quotes are the only new car monthly
global.window.dsFin = { newOk: (c, e) => e && e.good, newRep: e => 'rep ' + e.monthly, BROKER: 'broker' };
const qcars = [nsCar({ order_number: '1', finance: { monthly: 1 } }), nsCar({ order_number: '2', finance: { monthly: 1 } })];
M.applyLenderQuotes(qcars, { generated_at: 'x', quotes: { 1: { good: true, monthly: 480, product: 'PCP', lender: 'BMW FS' }, 2: { good: false, monthly: 100 } } }, window.dsFin);
ok(qcars[0].finance.monthly === 480 && qcars[0].finance.source === 'lender' && qcars[1].finance === null, 'only a checked lender quote sets a new car monthly');
ok(M.rank(qcars, { budget_type: 'monthly', monthly_gbp: 500 }).length === 1, 'monthly budget matches only on the real quote');
r = M.noStock([nsCar({ series: 'X5', model: 'BMW X5', price_gbp: 70000, order_number: '3' }), ph], { models: ['X5'], budget_type: 'cash', cash_gbp: 40000 });
ok(r[0].kind === 'budget' && !r[0].new_avail, 'cheapest new X5 in stock over budget: budget message, no order suggestion');
r = M.noStock([nsCar({ series: 'X5', model: 'BMW X5', price_gbp: 70000, order_number: '3' })], { models: ['X5'], budget_type: 'cash', cash_gbp: 80000, new_used: 'used' });
ok(r[0].kind === 'filter' && r[0].filter === 'new_used', 'fits budget but they chose used: says so');
const all = [M.mustNote({ models_must: ['X5'] }), M.mustNote({ specs_must: ['a'] })];
[[{ models: ['M2'] }, true], [{ models: ['M2'] }, false], [{ models: ['i5'] }], [{ models: ['B9'] }], [{ models: ['M3'], budget_type: 'cash', cash_gbp: 5000 }], [{ models: ['X5'], fuel: 'petrol,hybrid' }], [{ models: ['X5'], colours: ['Blue'], colours_must: ['Blue'] }]]
  .forEach(([p, a]) => M.noStock(stock, p).forEach(x => all.push(M.noStockText(x, { alerts: a }))));
ok(all.length === 9 && all.every(x => !/[-\u2013\u2014]/.test(x) && !/\u00a3|\d+ (weeks|days|months)/.test(x)), 'no dashes, prices or lead times in any wording');
ok(all.every(x => x.split(/\. /).length <= 2), 'brief');
console.log(all.join('\n')); console.log('RESULT nostock ' + n + '/' + n);
