// Node unit tests for real new stock in the Discover deck. Usage: node tests/new_stock.test.js
globalThis.window = globalThis; require('../../stock-core.js'); require('../match-core.js'); const M = globalThis.ctMatch; const fs = require('fs'); const path = require('path');
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../../lookup/new-stock.json'), 'utf8'));
const list = (raw.cars || raw).filter(c => c.order_number && !c.on_hold && c.price_gbp);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const cars = list.map(M.fromNewStock);
ok(cars.length > 0 && cars.every(c => c.reg === 'NEW' + c.order_number && c.kind === 'new_stock'), `${cars.length} cars get id NEW+order number, the same id match-alerts stores`);
ok(cars.every(c => !c.finance || (c.monthly_gbp === c.finance.monthly && /monthly payments of .*APR/i.test(c.finance.representative_example))), 'monthly figure only appears with a representative example');
const fe = list.find(c => c.finance_example); const broken = Object.assign({}, fe, { finance_example: Object.assign({}, fe.finance_example) }); delete broken.finance_example.apr;
const bc = M.fromNewStock(broken); ok(!bc.finance && bc.monthly_gbp == null, 'missing APR means no monthly figure at all');
const ex = cars.filter(c => c.finance).map(c => c.finance.representative_example).join(' ');
ok(!/[\u2013\u2014]| - /.test(ex), 'representative example copy has no dashes');
const base = { budget_type: 'cash', fuel: 'open', body: 'any', models: [], new_used: 'both', colours: [], specs: [] };
const cheapest = Math.min(...cars.map(c => c.price_gbp)); const dear = Math.max(...cars.map(c => c.price_gbp));
const under = M.score(cars.find(c => c.price_gbp === dear), Object.assign({}, base, { cash_gbp: dear - 1 }));
ok(!under.ok || under.score < 0, 'cash budget below the price hides the car');
const fits = M.score(cars.find(c => c.price_gbp === cheapest), Object.assign({}, base, { cash_gbp: cheapest }));
ok(fits.ok !== false, 'cash budget at the price keeps the car');
const fin = cars.filter(c => c.finance).sort((a, b) => a.finance.monthly - b.finance.monthly);
const mb = Object.assign({}, base, { budget_type: 'monthly', monthly_gbp: Math.ceil(fin[0].finance.monthly) });
ok(M.score(fin[0], mb).ok !== false, 'monthly budget fits the cheapest representative example');
ok(M.score(fin[fin.length - 1], mb).ok === false || M.score(fin[fin.length - 1], mb).score < 0, 'monthly budget rules out the dearest one');
const plain = Object.assign({}, fin[0], { finance: null, monthly_gbp: null });
const ps = M.score(plain, Object.assign({}, mb, { monthly_gbp: 1 }));
ok(ps.ok === false, 'with a monthly budget, a new car with no quoted monthly is not shown');
ok(M.score(plain, Object.assign({}, mb, { monthly_gbp: 1, new_used: 'new' })).ok !== false, 'unless they chose brand new: never filtered on a made up monthly');
// placeholder floor
const ph = { kind: 'new', reg: 'NEW-X7', model: 'X7', group: 'X7', floor_cash: cheapest, floor_monthly: fin[0].finance.monthly };
ok(M.score(ph, Object.assign({}, base, { cash_gbp: cheapest - 1 })).ok === false, 'model card hidden when cash is under the cheapest new BMW in stock');
ok(M.score(ph, Object.assign({}, base, { cash_gbp: cheapest + 5000 })).ok === false, 'model card not shown to a cash budget (no price of its own)');
ok(M.score(ph, Object.assign({}, base, { cash_gbp: cheapest + 5000, new_used: 'new' })).ok !== false, 'model card shown when they chose new and cash covers the cheapest');
// covers
ok(list.some(c => M.covers(c, 'M2')) && !M.covers({ description: 'M235 xDrive Gran Coupé', series: '2 Series Gran Coupé' }, 'M2') && !M.covers({ description: 'M2 Coupé', series: 'M2' }, '2 Series Gran Coupé'), 'M2 covered only by a real M2, not an M235');
ok(!M.covers({ description: '220 Coupé', series: '2 Series' }, '2 Series Gran Coupé') && !M.covers({ description: '420i Gran Coupé', series: '4 Series' }, '4 Series Coupé'), 'Coupé and Gran Coupé never stand in for each other');
console.log(`\nRESULT new stock ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
