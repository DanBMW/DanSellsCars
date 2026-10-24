// Just arrived: ledger mapping, 7 day window, score nudge, 'new since your last visit'. Usage: node tests/arrivals.test.js
globalThis.window = globalThis; require('../../stock-core.js'); require('../match-core.js'); const M = globalThis.ctMatch;
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const L = { today: '2026-10-24', lists: { forecourt: { history_from: '2026-08-13', cars: { '1': '2026-10-24', '2': '2026-10-18', '3': '2026-10-17', '4': '2026-08-13' } }, group: { history_from: '2026-09-28', cars: { '1': '2026-10-20', '9': '2026-09-28' } } } };
const car = (id, source, extra) => Object.assign({ reg: 'R' + source[0] + id, listing_id: String(id), source, model: 'BMW 320i M Sport', fuel: 'Petrol', body: 'Saloon', year: 2022, price_gbp: 25000, kind: 'used' }, extra || {});
const cars = [car(1, 'forecourt'), car(2, 'forecourt'), car(3, 'forecourt'), car(4, 'forecourt'), car(1, 'group'), car(9, 'group'), car(77, 'group')];
M.stampArrivals(cars, L, '2026-10-24');
ok(cars[0].arrived_days === 0 && cars[1].arrived_days === 6 && cars[2].arrived_days === 7, 'days counted from the London date');
ok(cars[4].arrived_on === '2026-10-20', 'the same listing id in the other list is kept apart');
ok(cars[3].arrived_on === null && cars[5].arrived_on === null, 'cars already there when history began are not arrivals');
ok(cars[6].arrived_on === null, 'a car missing from the ledger gets no badge');
ok(M.justArrived(cars[0]) && M.justArrived(cars[1]) && !M.justArrived(cars[2]), 'under 7 days old: 0 to 6 days yes, 7 days no');
ok(M.arrivedText(cars[0]) === 'Today' && M.arrivedText(cars[4]) === '4 days ago' && M.arrivedText(car(5, 'group', { arrived_days: 1 })) === 'Yesterday', 'arrived text');
const p = { budget_type: 'cash', cash_gbp: 30000, fuel: 'open', body: 'any', models: [], new_used: 'both', colours: [], specs: [] };
const a = M.score(cars[0], p), b = M.score(cars[2], p);
ok(a.score - b.score === 5 && a.reasons.includes('Just arrived') && !b.reasons.includes('Just arrived'), `modest boost of 5 points (${a.score} vs ${b.score})`);
const pricey = M.score(Object.assign({}, cars[0], { price_gbp: 60000 }), p);
ok(pricey.ok === false, 'the boost never lifts a car past the budget filter');
ok(M.newSince(cars, '2026-10-19T20:00:00Z') === 2, 'since a visit on the 19th: the arrivals on the 20th and 24th count, the 18th does not');
ok(M.newSince(cars, '2026-10-24T07:00:00Z') === 0, 'same day revisit counts none');
ok(M.newSince(cars, null) === 0, 'first visit shows no line');
ok(M.newSince(cars, '2026-10-23T23:30:00Z') === 0 && M.newSince(cars, '2026-10-23T22:30:00Z') === 1, 'visit day is the London date (23:30 UTC on the 23rd is already the 24th in London)');
// real ledger matches the real stock
const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../../automation/stock-arrivals.json'), 'utf8'));
const stock = Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, '../../lookup/stock.json'), 'utf8')).cars);
M.stampArrivals(stock, real, real.today);
ok(stock.filter(c => c.arrived_on).length > 0 && stock.every(c => c.arrived_on === null || /^\d{4}-\d\d-\d\d$/.test(c.arrived_on)), `real data: ${stock.filter(c => c.arrived_on).length} cars with arrival dates, ${stock.filter(M.justArrived).length} just arrived`);
console.log(`\nRESULT arrivals ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
