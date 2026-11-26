// Node unit tests for Hedin new car stock deals (lookup/new-offers.json). Usage: node tests/offers.test.js
globalThis.window = globalThis; require('../../stock-core.js'); require('../../dsfinance.js'); require('../match-core.js'); const M = globalThis.ctMatch; const fs = require('fs'); const path = require('path');
const lite = JSON.parse(fs.readFileSync(path.join(__dirname, '../../lookup/new-stock-lite.json'), 'utf8'));
const file = JSON.parse(fs.readFileSync(path.join(__dirname, '../../lookup/new-offers.json'), 'utf8'));
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const NOW = Date.parse('2026-11-26T12:00:00Z');
const build = () => (lite.cars || []).filter(c => c.order_number && !c.on_hold && c.price_gbp).map(M.fromNewStock);
const used = { kind: 'used', reg: 'AB12CDE', model: 'BMW 320i', price_gbp: 20000, finance: null };
const cars = build().concat([used]); M.applyOffers(cars, file, NOW);
const deals = cars.filter(c => c.offer);
const want = file.offers.filter(o => o.active !== false && cars.some(c => c.order_number === String(o.order_number)));
ok(deals.length === want.length && deals.length > 0, `${deals.length} active deals land on their stock cars`);
ok(deals.every(c => c.kind === 'new_stock' && c.finance.source === 'offer' && c.monthly_gbp === c.offer.monthly), 'a deal sets the monthly, from the deal itself');
ok(deals.every(c => /T&Cs apply/.test(c.offer.legal) && /18\+/.test(c.offer.legal)), 'every deal carries the legal line');
ok(deals.every(c => /monthly payments of/.test(c.finance.representative_example) && /Total amount payable/.test(c.finance.representative_example)), 'every deal carries its full figures');
ok(!deals.map(c => c.finance.representative_example).join(' ').match(/[\u2013\u2014]| - /), 'deal copy has no dashes');
ok(deals.every(c => c.images[0] === c.offer.image && c.image === c.offer.image), 'the deal photo is the first picture');
ok(!used.offer && used.finance === null, 'used stock is untouched');
const ox = deals.find(c => c.order_number === '4220782');
ok(ox && ox.offer.monthly === 647.54 && ox.offer.deposit === 5500 && ox.offer.saving === 9285.2 && /Oxide Grey/.test(ox.colour), '520i Touring Oxide Grey: £647.54, £5,500 deposit, saving £9,285.20');
// inactive, expired, broken and unmatched deals do nothing
const base = file.offers.find(o => o.order_number === '4220782');
const tryOne = o => { const cs = build(); M.applyOffers(cs, { offers: [o] }, NOW); return cs.find(c => c.order_number === '4220782'); };
ok(!tryOne(Object.assign({}, base, { active: false })).offer, 'active false hides a deal');
ok(!tryOne(Object.assign({}, base, { valid_to: '2026-11-01' })).offer, 'a deal past valid_to hides itself');
ok(!tryOne(Object.assign({}, base, { monthly: 600 })).offer, 'figures that do not add up hide the deal');
ok(!tryOne(Object.assign({}, base, { total_payable: null })).offer, 'a missing figure hides the deal');
const before = build().find(c => c.order_number === '4220782'); const after = tryOne(Object.assign({}, base, { active: false }));
ok(after.monthly_gbp === before.monthly_gbp && after.finance === before.finance, 'without a deal the car is exactly as before');
ok(!build().some(c => { const cs = [c]; M.applyOffers(cs, { offers: [Object.assign({}, base, { order_number: '0000000' })] }, NOW); return c.offer; }), 'a deal for a car not in stock shows nowhere');
// the full record merging in keeps the deal photo first
const m = M.mergeNewDetail(ox, { order_number: '4220782', description: '520i M Sport Pro Touring', image: 'x.jpg', images: ['x.jpg', 'y.jpg'] });
ok(m.images[0] === ox.offer.image && m.image === ox.offer.image, 'opening the car keeps the deal photo first');
// monthly budget sees the deal monthly
const p = { budget_type: 'monthly', monthly_gbp: 650, fuel: 'open', body: 'any', models: [], new_used: 'both', colours: [], specs: [] };
ok(M.score(ox, p).ok !== false, 'a £650 monthly budget matches the £647.54 deal');
console.log(`\nRESULT offers ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
