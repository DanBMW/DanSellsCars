#!/usr/bin/env node
/* node scripts/test-santa-draw.js : the Secret Santa draw helpers. */
'use strict';
const assert = require('assert');
const S = require('./santa-draw.js');
assert.strictEqual(S.keyOf(' Dan.Cane@Hedin.co.uk '), 'dan,cane@hedin,co,uk');
const keys = 'a b c d e f g h i j k l'.split(' ');
for (let t = 0; t < 2000; t++) {
  const p = S.derange(keys, { a: { b: true }, c: { d: true } });
  assert.deepStrictEqual(Object.keys(p).sort(), keys.slice().sort());
  assert.deepStrictEqual(Object.values(p).sort(), keys.slice().sort(), 'everyone receives once');
  keys.forEach(k => assert.notStrictEqual(p[k], k, 'nobody draws themselves'));
  assert.ok(p.a !== 'b' && p.b !== 'a' && p.c !== 'd' && p.d !== 'c', 'exclusions both ways');
}
assert.deepStrictEqual(S.derange(['x', 'y']), { x: 'y', y: 'x' });
assert.throws(() => S.derange(['x']));
assert.throws(() => S.derange(['x', 'y'], { x: { y: true } }), /exclusions/);
/* runRoot against a tiny fake db */
function fakeDb(data) {
  const get = p => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), data);
  return { data, ref: p => ({ get: async () => ({ val: () => (get(p) === undefined ? null : get(p)) }),
    update: async v => { const o = get(p); Object.keys(v).forEach(k => { if (v[k] === null) delete o[k]; else o[k] = v[k]; }); } }) };
}
(async () => {
  const m = {}; ['ann.a@x.com', 'bob.b@x.com', 'cat.c@x.com'].forEach(e => { m[S.keyOf(e)] = { name: e[0].toUpperCase() + e.slice(1, 3), email: e }; });
  const db = fakeDb({ santaTest: { members: m, drawRequest: { mode: 'draw', byName: 'Dan' } } });
  const logs = []; await S.runRoot(db, 'santaTest', x => logs.push(x));
  const R = db.data.santaTest;
  assert.ok(R.draw && R.draw.count === 3 && !R.drawRequest);
  Object.keys(m).forEach(k => { assert.ok(R.assign[k].to !== k); assert.strictEqual(R.assign[k].name, m[R.assign[k].to].name); assert.strictEqual(R.assign[k].drawId, R.draw.id); });
  assert.ok(!/Ann|Bob|Cat/.test(logs.join(' ')), 'the log never names a pairing');
  R.drawRequest = { mode: 'cancel', byName: 'Dan' }; await S.runRoot(db, 'santaTest', () => {});
  assert.ok(!R.assign && !R.sealed && !R.draw);
  console.log('santa draw: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
