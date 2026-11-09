/* Cars with no lender quote on a monthly budget: a rough estimate (never shown) decides.
   May fit (up to 15% over): kept, flagged budgetMaybe, label 'This may be in budget, ask Dan for figures'.
   Clearly over: hidden. Cash and no-budget customers are unchanged.
   Run with: node swipe-drive/tests/monthly-quote.test.js */
var path = require('path');
global.window = global;
require(path.join(__dirname, '..', '..', 'stock-core.js'));
require(path.join(__dirname, '..', 'match-core.js'));
var M = global.ctMatch, f = 0, p = 0;
function check(label, got, want) { if (got === want) p++; else { f++; console.log('FAIL', label, 'got', got, 'want', want); } }
function used(reg, price, year, monthly) { return { kind: 'used', reg: reg, series: 'X1', model: 'BMW X1 ' + reg, year: year, price_gbp: price, fuel: 'Petrol', body: 'SUV', source: 'group', finance: monthly ? { monthly: monthly, representative_example: 'x', product: 'PCP' } : null }; }
var base = { fuel: 'open', body: 'any', models: [], new_used: 'both', colours: [], specs: [] };
var mon = function (m) { return Object.assign({}, base, { budget_type: 'monthly', monthly_gbp: m }); };

/* comparables: 2023 cars around GBP 20k, quotes at 1.5% of price a month */
var pool = [used('A1', 20000, 2023, 300), used('A2', 22000, 2023, 330), used('A3', 18000, 2022, 270), used('A4', 21000, 2024, 315)];
var cheap = used('NQ1', 20000, 2023), dear = used('NQ2', 26000, 2023);   /* estimates: 300 and 390 */
var all = pool.concat([cheap, dear]);
M.stampEstimates(all);
check('estimate from comparable ratio', cheap.est_monthly, 300);
check('estimate scales with price', dear.est_monthly, 390);
check('quoted cars get no estimate', pool[0].est_monthly, undefined);

var r = M.score(cheap, mon(300));
check('no quote, estimate in budget: kept', r.ok, true);
check('no quote, estimate in budget: flagged maybe', r.budgetMaybe, true);
check('maybe reason, no figure', r.reasons.indexOf('May be in your monthly budget') !== -1, true);
check('no figure leaks into the reasons', r.reasons.join(' ').indexOf('300') === -1, true);
check('estimate up to 15% over still may fit', M.score(dear, mon(340)).ok, true);   /* 390 <= 391 */
check('estimate clearly over: hidden', M.score(dear, mon(300)).ok, false);
check('cash budget unchanged', M.score(dear, Object.assign({}, base, { budget_type: 'cash', cash_gbp: 27000 })).ok, true);
check('cash budget never flagged maybe', !!M.score(dear, Object.assign({}, base, { budget_type: 'cash', cash_gbp: 27000 })).budgetMaybe, false);
check('no budget unchanged', M.score(dear, Object.assign({}, base, { budget_type: 'monthly', monthly_gbp: null })).ok, true);
check('budgetMaybe helper', M.budgetMaybe(cheap, mon(300)), true);
check('budgetMaybe helper false when over', M.budgetMaybe(dear, mon(300)), false);
check('quoted car never budgetMaybe', M.budgetMaybe(pool[0], mon(400)), false);

/* rank stamps estimates itself (the alerts, guest deck and Send latest stock jobs only call rank / pickLatest) */
var c2 = used('NQ3', 20000, 2023), ranked = M.rank(pool.concat([c2]), mon(300));
check('rank keeps the maybe car', ranked.some(function (x) { return x.car.reg === 'NQ3' && x.budgetMaybe; }), true);
check('quoted in-budget car ranks above the maybe car', ranked.findIndex(function (x) { return x.car.reg === 'A1'; }) < ranked.findIndex(function (x) { return x.car.reg === 'NQ3'; }), true);

/* no comparables at all: no estimate, hidden on a monthly budget */
var lone = used('NQ4', 20000, 2023);
check('no data for an estimate: hidden on monthly', M.rank([lone], mon(1000)).length, 0);

/* new stock with an out of date lender quote: old monthly scaled by (price - deposit) / (old cash price - deposit) */
var ns = { kind: 'new_stock', reg: 'NEW1', order_number: '1', model: 'BMW X1', price_gbp: 45000, fuel: 'Petrol', finance: null };
var qf = { generated_at: new Date().toISOString(), quotes: { '1': { monthly: 500, cash_price: 50000, deposit: 5000 } } };
M.applyLenderQuotes([ns], qf, { newOk: function () { return false; } });
M.stampEstimates([ns]);
check('stale new quote scaled', ns.est_monthly, 444);   /* 500 * 40000 / 45000 */
check('new stock maybe on monthly', M.score(ns, mon(400)).budgetMaybe, true);
check('new stock clearly over hidden', M.score(ns, mon(350)).ok, false);
check('new stock brand-new-only also hidden when clearly over', M.score(ns, Object.assign(mon(350), { new_used: 'new' })).ok, false);
console.log(p + ' passed, ' + f + ' failed'); if (f) process.exit(1);
