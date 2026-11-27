// Node unit tests: cars with no photograph yet go behind cars that have one. Usage: node tests/photoless.test.js
globalThis.window = globalThis; require('../../stock-core.js'); require('../../dsfinance.js'); require('../match-core.js'); const M = globalThis.ctMatch;
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const P = 'https://cdne-cdn-prod-polaris-prod.azureedge.net/vehicles/x-preview.jpg';
const car = (reg, extra) => Object.assign({ kind: 'used', reg, model: 'BMW 320i M Sport', series: '3 Series', price_gbp: 25000, year: '2023', fuel: 'Petrol', mileage: '20,000 miles' }, extra || {});
ok(M.photoless(car('A1', { image: null, images: null })), 'a used car with no image and no gallery is photoless');
ok(!M.photoless(car('A2', { image: P })), 'a hero image is enough');
ok(!M.photoless(car('A3', { images: [P] })), 'a gallery is enough');
ok(!M.photoless({ kind: 'new', model: 'BMW X1' }), 'a model placeholder is never counted as photoless');
ok(M.photoless({ kind: 'new_stock', reg: 'NEW1', image: '', images: [] }), 'a new stock car with no picture is photoless');
/* the morning of 27 November: five fresh arrivals with no photos would have led the deck */
const today = new Date().toISOString().slice(0, 10);
const fresh = ['N1', 'N2', 'N3', 'N4', 'N5'].map(r => car(r, { image: null, images: null, arrived_on: today, arrived_days: 0 }));
const old = ['O1', 'O2', 'O3'].map(r => car(r, { image: P, images: [P] }));
const ranked = M.rank(fresh.concat(old), {});
ok(ranked.length === 8, 'nothing is dropped: all 8 cars are still in the deck (' + ranked.length + ')');
const firstBare = ranked.findIndex(x => M.photoless(x.car)), lastPic = ranked.map(x => !M.photoless(x.car)).lastIndexOf(true);
ok(firstBare > lastPic, 'every car with a photo comes before every car without one (' + ranked.map(x => x.car.reg).join(' ') + ')');
console.log(`\nRESULT photoless ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
