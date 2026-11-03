/* Model, M variant and model year rules shared by the app and the daily alert job.
   Run with: node swipe-drive/tests/match-rules.test.js */
var path = require('path');
global.window = global;
require(path.join(__dirname, '..', '..', 'stock-core.js'));
require(path.join(__dirname, '..', 'match-core.js'));
var M = global.ctMatch, f = 0, p = 0;
function check(label, got, want) { if (got === want) p++; else { f++; console.log('FAIL', label, 'got', got, 'want', want); } }

var m3 = { kind: 'used', series: '3 Series', model: 'BMW M3 Competition M xDrive Touring', year: '2025', price_gbp: 60000, fuel: 'Petrol', source: 'forecourt' };
var c320 = { kind: 'used', series: '3 Series', model: 'BMW 320d M Sport', year: '2024', price_gbp: 30000, fuel: 'Diesel', source: 'forecourt' };
var m2 = { kind: 'used', series: '2 Series', model: 'BMW M2 Coupe', year: '2023', price_gbp: 45000, fuel: 'Petrol', source: 'forecourt' };
var x5 = { kind: 'used', series: 'X5', model: 'BMW X5 xDrive30d M Sport', year: '2024', price_gbp: 50000, fuel: 'Diesel', source: 'forecourt' };
var m340 = { kind: 'used', series: '3 Series', model: 'BMW M340i xDrive Saloon', year: '2022', price_gbp: 40000, fuel: 'Petrol', source: 'forecourt' };
var noYear = { kind: 'used', series: '3 Series', model: 'BMW 320i', price_gbp: 25000, fuel: 'Petrol', source: 'forecourt' };

// variants: M cars are named by their M model, plain cars are not
check('variant M3', M.variantOf(m3), 'M3');
check('variant M2', M.variantOf(m2), 'M2');
check('variant M340i is M Performance', M.variantOf(m340), 'M Performance');
check('variant plain 320d', M.variantOf(c320), '');

// a series includes its M cars
check('3 Series includes M3', M.modelOk(m3, ['3 Series']), true);
check('3 Series includes 320d', M.modelOk(c320, ['3 Series']), true);
check('3 Series includes M340i', M.modelOk(m340, ['3 Series']), true);

// an M choice asks for those alone: no plain 3 Series
check('M3 choice keeps M3', M.modelOk(m3, ['M3']), true);
check('M3 choice drops 320d', M.modelOk(c320, ['M3']), false);
check('M3 choice drops M2', M.modelOk(m2, ['M3']), false);
check('M3 and X5 keeps X5', M.modelOk(x5, ['M3', 'X5']), true);
check('M3 and X5 drops 320d', M.modelOk(c320, ['M3', 'X5']), false);
check('M Performance choice keeps M340i', M.modelOk(m340, ['M Performance']), true);
check('M Performance choice drops 320d', M.modelOk(c320, ['M Performance']), false);

// no choice means anything goes
check('no model picked keeps all', M.modelOk(c320, []), true);

// the hard limit goes through rank()
function ranked(cars, prefs) { return M.rank(cars, prefs).map(function (x) { return x.car.model; }); }
check('rank: M3 only', ranked([m3, c320, m2, x5], { models: ['M3'] }).join('|'), 'BMW M3 Competition M xDrive Touring');
check('rank: 3 Series gives 320d and M3', ranked([m3, c320, m2, x5], { models: ['3 Series'] }).length, 2);

// model year: from 2024 keeps 2024 and newer, drops older and unknown years
check('year 2024 keeps 2025', M.yearOk(m3, 2024), true);
check('year 2024 keeps 2024', M.yearOk(c320, 2024), true);
check('year 2024 drops 2022', M.yearOk(m340, 2024), false);
check('year 2024 drops unknown year', M.yearOk(noYear, 2024), false);
check('no year set keeps unknown year', M.yearOk(noYear, null), true);
check('rank: year 2025 leaves one', ranked([m3, c320, m2, x5], { year_from: 2025 }).length, 1);

console.log(p + ' passed, ' + f + ' failed');
process.exit(f ? 1 : 0);
