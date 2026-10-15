#!/usr/bin/env node
/* Dan's rule: when someone is off only their slot changes. Runs the same
 * lockup-rota.js the page and the mail script use on a copy of real weeks. */
'use strict';
const R = require('../lockup-rota.js');
const assert = require('assert');
const team = R.defaults().team;
const base = () => ({
  '2026-W42': { v: 2, days: { mon: ['clive', 'carl'], tue: ['tomi', 'mon'], wed: ['dan', 'clive'], thu: ['danny', 'karis'], fri: ['dan', 'mon'] } },
  '2026-W43': { v: 2, days: { mon: ['tomi', 'danny'], tue: ['dan', 'karis'], wed: ['carl', 'mon'], thu: ['clive', 'tomi'], fri: ['dan', 'danny'] } }
});
function diff(a, b) {
  const out = [];
  Object.keys(a).forEach(w => R.DAYS.forEach(d => {
    const x = R.ids(a[w].days[d]), y = R.ids(b[w].days[d]);
    x.forEach((p, i) => { if (y[i] !== p) out.push({ w, d, out: p, in: y[i] }); });
  }));
  return out;
}
function check(label, weeks, tm, abs, today, who) {
  const before = base(), after = JSON.parse(JSON.stringify(weeks));
  R.applyAbsences(after, tm, abs, today, {});
  const ch = diff(before, after);
  ch.forEach(c => assert.strictEqual(c.out, who, label + ': ' + c.w + ' ' + c.d + ' changed ' + c.out + ', not ' + who));
  console.log(label + ': ' + ch.map(c => c.w.slice(-3) + ' ' + c.d + ' ' + c.out + ' -> ' + c.in).join(', '));
  return ch;
}
// 1 absence: Danny off Thu 15 Oct
let ch = check('absence', base(), team, { a: { personId: 'danny', from: '2026-10-15', to: '2026-10-15', status: 'approved', kind: 'absent' } }, '2026-10-15', 'danny');
assert.strictEqual(ch.length, 1);
// 2 holiday across 3 days: Dan Tue 20 to Thu 22 Oct (on Tue only in that span)
ch = check('holiday 3 days', base(), team, { h: { personId: 'dan', from: '2026-10-20', to: '2026-10-22', status: 'booked', kind: 'holiday' } }, '2026-10-15', 'dan');
assert.deepStrictEqual(ch.map(c => c.d), ['tue']);
// holiday over 3 working days he is on twice: Dan Fri 16, Mon 19, Tue 20
ch = check('holiday Fri to Tue', base(), team, { h: { personId: 'dan', from: '2026-10-16', to: '2026-10-20', status: 'booked', kind: 'holiday' } }, '2026-10-15', 'dan');
assert.deepStrictEqual(ch.map(c => c.w.slice(-3) + c.d), ['W42fri', 'W43tue']);
// 3 day off edit: Karis now off Tuesday
const t2 = JSON.parse(JSON.stringify(team)); t2.karis.off = 'tue';
ch = check('day off edit', base(), t2, {}, '2026-10-15', 'karis');
assert.deepStrictEqual(ch.map(c => c.w + c.d), ['2026-W43tue']);
// 4 taken off the rota: Clive inactive
const t3 = JSON.parse(JSON.stringify(team)); t3.clive.active = false;
ch = check('off the rota', base(), t3, {}, '2026-10-15', 'clive');
assert.ok(ch.length === 1 && ch[0].d === 'thu');
// 5 stored weeks are never regenerated, only missing ones
assert.strictEqual(R.needsWeek(base()['2026-W42']), false);
assert.strictEqual(R.needsWeek({ days: { mon: ['a'] } }), false);
assert.strictEqual(R.needsWeek(undefined), true);
console.log('ok: only the absent person\u2019s slots change');
