/* A monthly budget only shows used cars that have a lender quote.
   Before this rule a GBP 150 a month customer was shown a GBP 39,999 X3 with no monthly figure.
   Run with: node swipe-drive/tests/monthly-quote.test.js */
var path = require('path');
global.window = global;
require(path.join(__dirname, '..', '..', 'stock-core.js'));
require(path.join(__dirname, '..', 'match-core.js'));
var M = global.ctMatch, f = 0, p = 0;
function check(label, got, want) { if (got === want) p++; else { f++; console.log('FAIL', label, 'got', got, 'want', want); } }
var base = { fuel: 'open', body: 'any', models: [], new_used: 'both', colours: [], specs: [] };
var quoted = { kind: 'used', series: 'X1', model: 'BMW X1 sDrive18i', year: 2023, price_gbp: 22000, fuel: 'Petrol', body: 'SUV', source: 'group', finance: { monthly: 280 } };
var noQuote = { kind: 'used', series: 'X3', model: 'BMW X3 xDrive30 M Sport', year: 2025, price_gbp: 39999, fuel: 'Plug-in hybrid', body: 'SUV', source: 'group' };
var monthly = Object.assign({}, base, { budget_type: 'monthly', monthly_gbp: 300 });
check('quoted car in monthly budget shows', M.score(quoted, monthly).ok, true);
check('car with no quote is hidden on a monthly budget', M.score(noQuote, monthly).ok, false);
check('car with no quote still shows with no budget', M.score(noQuote, Object.assign({}, base, { budget_type: 'monthly', monthly_gbp: null })).ok, true);
check('car with no quote still shows on a cash budget it fits', M.score(noQuote, Object.assign({}, base, { budget_type: 'cash', cash_gbp: 40000 })).ok, true);
check('rank drops the unquoted car', M.rank([quoted, noQuote], monthly).map(function (x) { return x.car.model; }).join(), 'BMW X1 sDrive18i');
console.log(p + ' passed, ' + f + ' failed'); if (f) process.exit(1);
