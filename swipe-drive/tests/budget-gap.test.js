/* 'Nothing in your budget' speaks the customer's language: monthly budgets get monthly figures (real lender quotes only,
   never the hidden rough estimate), cash budgets keep the cash price. Run with: node swipe-drive/tests/budget-gap.test.js */
var path = require('path'); global.window = global;
require(path.join(__dirname, '..', '..', 'stock-core.js')); require(path.join(__dirname, '..', 'match-core.js'));
var M = global.ctMatch, f = 0, p = 0;
function check(l, got, want) { if (got === want) p++; else { f++; console.log('FAIL', l, '| got', JSON.stringify(got), '| want', JSON.stringify(want)); } }
var cars = [
  { kind: 'used', reg: 'A', price_gbp: 14000, finance: null, est_monthly: 223 },                 /* cheapest cash, no quote: estimate must never show */
  { kind: 'used', reg: 'B', price_gbp: 18000, finance: { monthly: 292.54 } },
  { kind: 'new_stock', reg: 'C', price_gbp: 35000, finance: { monthly: 389.99 } },
  { kind: 'new', reg: 'D' }];
var mon = { budget_type: 'monthly', monthly_gbp: 150 }, g = M.budgetGap(cars, mon);
check('monthly: lowest real monthly quote', g.from, 292.54);
check('monthly: how far over', g.over, 142.54);
var t = M.budgetGapText(g, 'Dan');
check('monthly text gives the monthly figure', /£292\.54 a month/.test(t), true);
check('monthly text gives the gap to the budget', /£142\.54 over your £150 a month budget/.test(t), true);
check('monthly text has no cash price', /£14,000|£18,000/.test(t), false);
check('monthly text never shows the rough estimate', /223/.test(t), false);
var none = M.budgetGap([cars[0]], mon);
check('monthly, only unquoted cars: no figure', none.from, null);
check('monthly, only unquoted cars: ask for figures', /Ask Dan for figures/.test(M.budgetGapText(none, 'Dan')) && !/223|14,000/.test(M.budgetGapText(none, 'Dan')), true);
var cash = M.budgetGap(cars, { budget_type: 'cash', cash_gbp: 10000 });
check('cash unchanged: cheapest cash price', cash.from, 14000);
check('cash text unchanged', M.budgetGapText(cash, 'Dan'), 'The cheapest used car that fits everything else you chose is £14,000. Raise your budget to see what is close, or ask Dan what is coming in.');
check('no budget: no gap', M.budgetGap(cars, { budget_type: 'monthly', monthly_gbp: null }), null);
check('model cards only: no gap', M.budgetGap([cars[3]], mon), null);
check('salesperson name used', /ask Sam\./.test(M.budgetGapText(g, 'Sam')), true);
console.log(p + ' passed, ' + f + ' failed'); if (f) process.exit(1);
