/* Specification layer: run with `node swipe-drive/tests/spec.test.js` from the repo root.
   Uses today's real lookup/stock.json, lookup/new-stock.json and automation/car-details.json.
   The rule under test: a pick removes a car ONLY on a definite no. Unknown never removes. */
const fs = require('fs'), assert = require('assert');
global.window = global;
(0, eval)(fs.readFileSync('stock-core.js', 'utf8')); (0, eval)(fs.readFileSync('swipe-drive/match-core.js', 'utf8'));
const M = global.ctMatch;
global.ctDetails = JSON.parse(fs.readFileSync('automation/car-details.json'));
const used = Object.values(JSON.parse(fs.readFileSync('lookup/stock.json')).cars);
const news = JSON.parse(fs.readFileSync('lookup/new-stock.json')).cars.map(M.fromNewStock);
const opts = M.specOptions();
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('pick', 44), pad('used yes/no/unknown', 22), 'new yes/no/unknown');
const tally = (cars, key) => { const t = { t: 0, f: 0, n: 0 }; cars.forEach(c => { const h = M.hasSpec(c, key); if (h === true) t.t++; else if (h === false) t.f++; else t.n++; }); return t; };
const T = {};
opts.forEach(o => { const u = tally(used, o.key), n = tally(news, o.key); T[o.key] = { u, n };
  console.log(pad(o.group + ': ' + o.label, 44), pad(`${u.t}/${u.f}/${u.n}`, 22), `${n.t}/${n.f}/${n.n}`); });
const must = key => ({ specs: [key], specs_must: [key] });
const ok = (cars, p) => cars.filter(c => M.score(c, p).ok).length;

/* 1. Seat colour is visible on new cars, invisible on used: a used car is never removed by an interior pick. */
['sp:intlight', 'sp:intdark', 'sp:fabric'].forEach(k => {
  assert.strictEqual(ok(used, must(k)), used.length, k + ' must not remove any used car');
  assert.strictEqual(T[k].u.f, 0, k + ' must never be a definite no on a used car'); });
/* 2. A must have removes exactly the cars with a definite no, in either list, and nothing else. */
opts.forEach(o => { [['used', used, T[o.key].u], ['new', news, T[o.key].n]].forEach(([name, cars, t]) => {
  const left = ok(cars, must(o.key));
  assert.strictEqual(left, cars.length - t.f, `${o.key} on ${name}: kept ${left}, expected ${cars.length - t.f}`); }); });
/* 2b. Standard on every new BMW (Dan, 30 Oct 2026): a new car is always a yes for these. */
['feat:heated', 'feat:revcam', 'sp:carplay', 'sp:selfpark'].forEach(k => {
  assert.strictEqual(T[k].n.t, news.length, k + ' must be a yes on every new car');
  assert.strictEqual(ok(news, must(k)), news.length, k + ' must never remove a new car'); });
assert.strictEqual(T['sp:carplay'].u.f, 0, 'CarPlay is not itemised on used cars, so it is never a no there');
/* 3. The bugs found in the analysis stay fixed. */
assert.ok(ok(news, { fuel: 'hybrid' }) >= 85, 'plug-in hybrids must match a hybrid pick on new stock');
assert.ok(ok(news, must('feat:xdrive')) > 150, 'xDrive must find the all wheel drive new cars');
assert.ok(ok(news, must('trim:M Sport')) > 20, 'M Sport must find new M Sport cars');
/* 4. Likes now score new cars too. */
const heated = news.find(c => M.hasSpec(c, 'feat:heated') === true);
const plain = news.find(c => M.hasSpec(c, 'feat:heated') !== true);
if (heated && plain) assert.ok(M.score(heated, { specs: ['feat:heated'] }).score > M.score(plain, { specs: ['feat:heated'] }).score, 'a liked spec must lift a new car that has it');
/* 5. An unknown must have keeps the car, adds a note and ranks it below a confirmed car. */
const lightNew = news.find(c => M.hasSpec(c, 'sp:intlight') === true), u0 = used[0];
assert.ok(lightNew, 'expected at least one new car with a light interior');
const a = M.score(lightNew, must('sp:intlight')), b = M.score(u0, must('sp:intlight'));
assert.ok(a.ok && b.ok, 'both kept');
assert.ok(b.unconfirmed && b.notes.some(n => /Not confirmed: Light interior/.test(n)), 'used car carries a Not confirmed note');
assert.ok(!a.unconfirmed, 'new car with a confirmed light interior is not flagged');
assert.ok(b.score < M.score(u0, {}).score, 'an unconfirmed must have ranks a used car a touch lower, never out');
console.log('\nspec tests passed');
