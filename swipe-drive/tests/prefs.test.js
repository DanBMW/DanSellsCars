// Model would like / must have, multi fuel, preferred current mileage. Usage: node tests/prefs.test.js
globalThis.window = globalThis; require('../../stock-core.js'); require('../match-core.js'); const M = globalThis.ctMatch;
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const C = o => Object.assign({ kind: 'used', source: 'forecourt', reg: 'AB12CDE', series: 'X3', model: 'BMW X3 xDrive20d M Sport', fuel: 'Diesel', body: 'SUV', mileage: '12,000 miles', year: 2022, price_gbp: 30000 }, o);
ok(M.fuelList('diesel').join() === 'diesel', 'an old single fuel still reads as one fuel');
ok(M.fuelList('open').length === 0 && M.fuelList(null).length === 0, 'open or nothing means any fuel');
ok(M.score(C(), { fuel: 'petrol,diesel' }).ok, 'car passes when its fuel is any chosen type');
ok(!M.score(C(), { fuel: 'petrol,electric' }).ok, 'car is filtered when its fuel is none of the chosen types');
ok(M.score(C(), { fuel: 'diesel' }).ok && !M.score(C(), { fuel: 'petrol' }).ok, 'old single fuel profiles match as before');
let r = M.score(C(), { models: ['X3'] }); ok(r.ok && r.reasons.includes('A model you picked'), 'old saved models count as would like');
ok(M.score(C({ series: '3 Series', model: 'BMW 320i' }), { models: ['X3'] }).ok, 'a would like model never filters other cars');
ok(!M.score(C(), { models: ['i4', 'X3'], models_must: ['i4'] }).ok, 'a must have model filters out other models');
r = M.score(C(), { models: ['X3'], models_must: ['X3'] }); ok(r.ok && r.reasons.includes('A must have model'), 'a must have model match is kept and named');
const a = M.score(C(), { mileage_bands: ['8_15k'] }), b = M.score(C(), { mileage_bands: ['25k_plus'] });
ok(a.ok && b.ok && a.score > b.score && a.reasons.includes('Mileage you prefer'), 'mileage band boosts, outside the band only dips, never filters');
ok(M.carMiles(C()) === 12000 && M.carMiles(C({ mileage: 25000 })) === 25000, 'odometer read from text or number');
console.log(`\nRESULT prefs ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
