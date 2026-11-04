/* Fuel Want and Must: must is a hard filter, would like only boosts the ranking, older profiles (no fuel_must)
   keep every picked fuel as a must. Run with: node swipe-drive/tests/fuel-wantmust.test.js */
var path = require('path');
global.window = global;
require(path.join(__dirname, '..', '..', 'stock-core.js'));
require(path.join(__dirname, '..', 'match-core.js'));
require(path.join(__dirname, '..', 'revvy-flow.js'));
var M = global.ctMatch, f = 0, p = 0;
function check(label, got, want) { if (JSON.stringify(got) === JSON.stringify(want)) p++; else { f++; console.log('FAIL', label, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); } }
var used = function (reg, fuel) { return { kind: 'used', reg: reg, series: '3 Series', model: 'BMW 3 Series ' + reg, year: '2024', price_gbp: 30000, fuel: fuel, source: 'forecourt' }; };
var ev = used('EV', 'Electric'), pet = used('PET', 'Petrol'), die = used('DIE', 'Diesel'), ph = used('PH', 'Plug-in Hybrid'), mh = used('MH', 'Petrol Mild Hybrid');
var card = { kind: 'new', reg: 'NEW-I4', series: 'i4', model: 'BMW i4', fuelKeys: ['electric'], bodyKeys: ['gran_coupe'] };
var ns = { kind: 'new_stock', reg: 'NS1', series: 'X1', model: 'BMW X1 M35i', fuel: 'Petrol', price_gbp: 50000 };
var cars = [ev, pet, die, ph, mh];
var regs = function (prof) { return M.rank(cars, prof).map(function (x) { return x.car.reg; }); };
var ok = function (car, prof) { return M.score(car, prof).ok; };

// fuelPrefs: older profiles (no fuel_must) treat every fuel as a must
check('legacy prefs', M.fuelPrefs({ fuel: 'electric,petrol' }), { all: ['electric', 'petrol'], must: ['electric', 'petrol'], want: [], legacy: true });
check('new prefs', M.fuelPrefs({ fuel: 'electric,petrol', fuel_must: ['electric'] }), { all: ['electric', 'petrol'], must: ['electric'], want: ['petrol'], legacy: false });
check('must outside fuel ignored', M.fuelPrefs({ fuel: 'petrol', fuel_must: ['electric', 'Petrol'] }).must, ['petrol']);
check('open', M.fuelPrefs({ fuel: 'open', fuel_must: [] }).all, []);

// legacy behaviour unchanged: a fuel is a hard filter
check('legacy electric only', regs({ fuel: 'electric' }).sort(), ['EV']);
check('legacy single value', ok(pet, { fuel: 'petrol' }) && !ok(die, { fuel: 'petrol' }), true);
check('legacy hybrid still means plug in and mild', regs({ fuel: 'hybrid' }).sort(), ['MH', 'PH']);

// must is a hard filter
check('must electric', regs({ fuel: 'electric', fuel_must: ['electric'] }).sort(), ['EV']);
check('must electric, want petrol: petrol still hidden', regs({ fuel: 'electric,petrol', fuel_must: ['electric'] }).sort(), ['EV']);
check('two musts', regs({ fuel: 'electric,diesel', fuel_must: ['electric', 'diesel'] }).sort(), ['DIE', 'EV']);
check('plug in hybrid only', regs({ fuel: 'phev', fuel_must: ['phev'] }), ['PH']);

// want only boosts: every car stays, wanted fuel first
var r = regs({ fuel: 'electric', fuel_must: [] });
check('want keeps every car', r.slice().sort(), ['DIE', 'EV', 'MH', 'PET', 'PH']);
check('want ranks electric first', r[0], 'EV');
check('want reason', M.score(ev, { fuel: 'electric', fuel_must: [] }).reasons.indexOf('A fuel you would like') !== -1, true);
check('want scores above a miss', M.score(ev, { fuel: 'electric', fuel_must: [] }).score > M.score(pet, { fuel: 'electric', fuel_must: [] }).score, true);
var r2 = regs({ fuel: 'electric,petrol', fuel_must: [] });
check('two wants first', r2.slice(0, 2).sort(), ['EV', 'PET']);

// open: nothing filtered, same as before
check('open keeps all', regs({ fuel: 'open' }).length, 5);
check('open score', M.score(pet, { fuel: 'open' }).score, M.score(pet, {}).score);

// brand new model cards and new to stock: same rules, nothing else changed
check('model card must', ok(card, { fuel: 'petrol', fuel_must: ['petrol'] }), false);
check('model card want', ok(card, { fuel: 'petrol', fuel_must: [] }), true);
check('model card legacy', ok(card, { fuel: 'petrol' }), false);
check('new stock must', ok(ns, { fuel: 'electric', fuel_must: ['electric'] }), false);
check('new stock want', ok(ns, { fuel: 'electric', fuel_must: [] }), true);
check('new stock legacy', ok(ns, { fuel: 'electric' }), false);
check('new_used still a filter', ok(ns, { fuel: 'petrol', fuel_must: [], new_used: 'used' }), false);

// wider search (Any fuel) clears must and want
var w = M.noStockWiden({ kind: 'filter', filter: 'fuel' });
check('noStock widen patch', w.patch, { fuel: 'open', fuel_must: [] });
check('widened profile shows all', regs(Object.assign({ fuel: 'electric', fuel_must: ['electric'] }, w.patch)).length, 5);
var nsx = M.noStock([pet], { models: ['3 Series'], fuel: 'electric', fuel_must: ['electric'] });
check('noStock names the must fuel', nsx[0] && nsx[0].filter, 'fuel');
check('noStock electric only', nsx[0] && nsx[0].electric_only, true);
check('want fuel never blocks noStock', M.noStock([pet], { models: ['3 Series'], fuel: 'electric', fuel_must: [] }).length, 0);

// must note: only mentions fuel when a must have fuel was really chosen
check('note legacy unchanged', M.mustNote({ fuel: 'electric' }), '');
check('note fuel', /a must have fuel set/.test(M.mustNote({ fuel: 'electric', fuel_must: ['electric'] })), true);
check('note models and spec unchanged', /must have models and spec set/.test(M.mustNote({ models_must: ['X5'], specs_must: ['a'] })), true);

// Revvy field: tri with Open minded exclusive, plug in hybrid offered
var fld = window.RevvyFlow.fields({ models: [], specs: [], colours: [], desk: {} }, {}).filter(function (x) { return x.k === 'fuel'; })[0];
check('revvy fuel field', [fld.kind, fld.mk, fld.exclusive], ['tri', 'fuel_must', 'open']);
check('revvy fuel list', fld.list.map(function (x) { return x[0]; }), ['open', 'petrol', 'diesel', 'hybrid', 'phev', 'electric']);

// guest link backend: values and validation
import(path.join(__dirname, '..', 'backend', 'supabase', 'functions', '_shared', 'guest.js')).then(function (G) {
  var opts = G.prefOptions(M, []);
  check('guest legacy values', G.prefValues({ fuel: 'electric,petrol' }, M).fuel_must, ['electric', 'petrol']);
  check('guest new values', G.prefValues({ fuel: 'electric,petrol', fuel_must: ['petrol'] }, M).fuel_must, ['petrol']);
  var cur = G.prefValues({ fuel: 'electric', models: [], models_must: [], colours: [], colours_must: [], specs: [], specs_must: [], mileage_bands: [] }, M);
  var c1 = G.cleanPrefs({ fuel: ['electric', 'phev', 'jet'], fuel_must: ['electric', 'diesel'] }, cur, opts);
  check('guest want and must saved', [c1.patch.fuel, c1.patch.fuel_must], ['electric,phev', ['electric']]);
  check('guest change text', c1.changes, ['Fuel: must have Electric; would like Plug in hybrid']);
  var c2 = G.cleanPrefs({ fuel: ['diesel'] }, cur, opts);
  check('guest older page keeps legacy', [c2.patch.fuel, 'fuel_must' in c2.patch, c2.changes], ['diesel', false, ['Fuel: Diesel']]);
  var c3 = G.cleanPrefs({ fuel: ['electric'], fuel_must: ['electric'] }, cur, opts);
  check('guest no change when legacy must matches', Object.keys(c3.patch).length, 0);
  console.log('RESULT fuel want must ' + p + '/' + (p + f)); if (f) process.exit(1);
}).catch(function (e) { console.log('FAIL guest import', e.message); process.exit(1); });
