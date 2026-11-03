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
  /* a move of `who` to a later night (their only night that week) is allowed */
  const all = diff(before, after), ch = all.filter(c => c.out === who);
  all.filter(c => c.out !== who).forEach(c => assert.strictEqual(c.in, who, label + ': ' + c.w + ' ' + c.d + ' changed ' + c.out));
  if (all.length > ch.length) console.log(label + ' (moved later): ' + all.filter(c => c.in === who).map(c => c.w.slice(-3) + ' ' + c.d + ' ' + c.out + ' -> ' + c.in).join(', '));
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

/* fixed nights: Chloe and Molly paired on Mondays, a fair share of the rest */
const tf = JSON.parse(JSON.stringify(team));
tf.chloe = { name: 'Chloe', active: true, off: 'tue', never: ['wed'], fixed: ['mon'] };
tf.molly = { name: 'Molly', active: true, off: 'thu', fixed: ['mon'] };
{
  const w = base(), fx = R.applyFixed(w, tf, {}, '2026-10-15', {});
  const ch = diff(base(), w);
  console.log('fixed Mondays: ' + ch.map(c => c.w.slice(-3) + ' ' + c.d + ' ' + c.out + ' -> ' + c.in).join(', '));
  assert.deepStrictEqual(ch.map(c => c.w + c.d), ['2026-W43mon', '2026-W43mon']);
  assert.deepStrictEqual(w['2026-W43'].days.mon.slice().sort(), ['chloe', 'molly']);
  assert.strictEqual(R.applyFixed(w, tf, {}, '2026-10-15', {}).length, 0, 'second pass changes nothing');
  /* Chloe away on Mon 26: only her slot, and a normal person covers */
  const g = R.generate('2026-W44', tf, w);
  assert.deepStrictEqual(g.days.mon.slice().sort(), ['chloe', 'molly']);
  assert.ok(g.days.wed.indexOf('chloe') < 0 && g.days.tue.indexOf('chloe') < 0 && g.days.thu.indexOf('molly') < 0, 'days off and never days respected');
  /* fairness: 26 weeks on, all nine within one night of each other in total (the newcomers catch up first) */
  let ws = Object.assign({}, w), k = '2026-W43';
  for (let i = 0; i < 26; i++) { k = R.shiftWeek(k, 1); ws[k] = R.generate(k, tf, ws); assert.deepStrictEqual(ws[k].days.mon.slice().sort(), ['chloe', 'molly']); }
  const tot = {}; Object.keys(ws).forEach(x => R.DAYS.forEach(d => ws[x].days[d].forEach(id => { tot[id] = (tot[id] || 0) + 1; })));
  const vals = Object.keys(tf).map(id => tot[id] || 0);
  console.log('all time after 26 more weeks: ' + Object.keys(tf).map(id => id + ' ' + (tot[id] || 0)).join(', '));
  assert.ok(Math.max(...vals) - Math.min(...vals) <= 1, 'within one night');
  const w2 = Object.assign({}, w, { '2026-W44': JSON.parse(JSON.stringify(g)) });
  const before = JSON.parse(JSON.stringify(w2));
  R.applyAbsences(w2, tf, { a: { personId: 'chloe', from: '2026-10-26', to: '2026-10-26', status: 'approved' } }, '2026-10-15', {});
  const c2 = diff(before, w2);
  assert.ok(c2[0].out === 'chloe' && c2[0].d === 'mon' && c2.slice(1).every(c => c.in === 'chloe'), 'only her slot, plus her only-night move later');
  console.log('Chloe away Mon 26: ' + c2[0].out + ' -> ' + c2[0].in);
  /* never on Wednesday, even as a fallback */
  assert.strictEqual(R.canDo(tf.chloe, 'wed'), false);
}
console.log('ok: fixed nights');

/* every week: at least one night each, never two nights running, 52 weeks */
{
  const tf = JSON.parse(JSON.stringify(team));
  tf.chloe = { name: 'Chloe', active: true, off: 'tue', never: ['wed'], fixed: ['mon'] };
  tf.molly = { name: 'Molly', active: true, off: 'thu', fixed: ['mon'] };
  const ws = base(); let k = '2026-W43'; const dist = {}; const tot = {};
  for (let i = 0; i < 52; i++) {
    k = R.shiftWeek(k, 1); ws[k] = R.generate(k, tf, ws);
    const c = {};
    R.DAYS.forEach((d, j) => {
      const p = ws[k].days[d];
      assert.strictEqual(p.length, 2, k + ' ' + d + ' has two');
      p.forEach(id => {
        c[id] = (c[id] || 0) + 1; tot[id] = (tot[id] || 0) + 1;
        assert.ok(R.canDo(tf[id], d), k + ' ' + d + ' ' + id + ' on a day off');
        if (j) assert.ok(ws[k].days[R.DAYS[j - 1]].indexOf(id) < 0, k + ' ' + id + ' two nights running');
      });
    });
    assert.deepStrictEqual(ws[k].days.mon.slice().sort(), ['chloe', 'molly']);
    Object.keys(tf).forEach(id => {
      assert.ok((c[id] || 0) >= 1, k + ': ' + id + ' has no night');
      dist[id] = dist[id] || {}; dist[id][c[id]] = (dist[id][c[id]] || 0) + 1;
    });
  }
  Object.keys(tf).forEach(id => console.log('  ' + id + ': ' + tot[id] + ' nights, weeks by nights ' + JSON.stringify(dist[id])));
  /* all time, including the two stored weeks before Chloe and Molly joined */
  const all = {}; Object.keys(ws).forEach(x => R.DAYS.forEach(d => ws[x].days[d].forEach(id => { all[id] = (all[id] || 0) + 1; })));
  const v = Object.keys(tf).map(id => all[id] || 0);
  console.log('  all time: ' + Object.keys(tf).map(id => id + ' ' + (all[id] || 0)).join(', '));
  assert.ok(Math.max(...v) - Math.min(...v) <= 2, 'all time within about one night (spread of 2 at most) over 52 weeks');
}
console.log('ok: at least one night each per week over 52 weeks');

/* only night that week and "I can't make it": moved to a later valid night */
{
  const abs = (id, d, kind) => ({ a: { personId: id, from: d, to: d, status: 'approved', kind: kind || 'absent' } });
  // Karis's only night is Tue 20; she can't make it, so she moves later that week
  let w = base(), ch = R.applyAbsences(w, team, abs('karis', '2026-10-20'), '2026-10-15', {});
  const d = w['2026-W43'].days, n = {};
  R.DAYS.forEach((x, j) => d[x].forEach(id => { n[id] = (n[id] || 0) + 1; if (j && id === 'karis') assert.ok(d[R.DAYS[j - 1]].indexOf(id) < 0, id + ' back to back'); assert.ok(R.canDo(team[id], x), id + ' day off'); }));
  assert.strictEqual(n.karis, 1, 'Karis still has one night');
  assert.ok(d.tue.indexOf('karis') < 0);
  const mv = ch.find(c => c.moved); assert.ok(mv && mv.in === 'karis' && mv.date > '2026-10-20');
  assert.ok(ch.length <= 2, 'only the two slots change (or the cover plus the move)');
  console.log('only night moved: ' + ch.map(c => c.date + ' ' + c.out + ' -> ' + c.in).join(', ') + ' | ' + ch[0].note);
  // holiday: no move
  w = base(); ch = R.applyAbsences(w, team, abs('karis', '2026-10-20', 'holiday'), '2026-10-15', {});
  assert.ok(!ch.some(c => c.moved) && !/only lockup/.test(ch[0].note || ''), 'holiday is not moved');
  // nothing later that week: current behaviour plus a note
  w = base(); w['2026-W43'].days.tue = ['dan', 'tomi']; w['2026-W43'].days.fri = ['karis', 'danny'];
  ch = R.applyAbsences(w, team, abs('karis', '2026-10-23'), '2026-10-15', {});
  assert.ok(ch.length === 1 && /no other night/.test(ch[0].note));
  console.log('no night left: ' + ch[0].note);
  // never moved onto tonight or a past night: Danny off tonight Thu 15 (only W42 night), Fri 16 is later so allowed; today itself never
  w = base(); ch = R.applyAbsences(w, team, abs('karis', '2026-10-15'), '2026-10-15', {});
  ch.filter(c => c.moved).forEach(c => assert.ok(c.date > '2026-10-15'));
}
console.log('ok: only night moved later in the week');

/* Saturday named pair (lockup/config/saturday), managers kind kept */
{
  const cfg = { saturday: ['chloe', 'sergio'] };
  const s = R.onFor('2026-11-07', null, {}, cfg, {});
  assert.strictEqual(s.kind, 'managers'); assert.deepStrictEqual(s.ids, ['chloe', 'sergio']);
  assert.deepStrictEqual(R.onFor('2026-11-07', null, {}).ids, []);
  const away = R.onFor('2026-11-07', null, {}, cfg, { a: { personId: 'chloe', from: '2026-11-07', to: '2026-11-07', kind: 'away' } });
  assert.deepStrictEqual(away.ids, ['sergio']);
  console.log('saturday pair ok');
}

/* replacement rules (Dan, 3 Nov): fewest that week, no back to back unless forced (flagged), least paired with partner */
{
  const tm = { a: { name: 'A' }, b: { name: 'B' }, c: { name: 'C' }, d: { name: 'D' }, e: { name: 'E' } };
  const wk = '2026-W47'; // Mon 16 Nov
  // c has 1 night this week, d has 2: fewest wins even though d has fewer overall
  let weeks = { '2026-W40': { days: { mon: ['c', 'c'], tue: ['c', 'e'] } }, [wk]: { days: { mon: ['a', 'b'], tue: [], wed: ['d', 'e'], thu: [], fri: ['c', 'd'] } } };
  // Wed: e away; candidates a,b (on Mon only, not adjacent to Wed), c (Fri)
  const abs = { x: { personId: 'a', from: '2026-11-18', to: '2026-11-18', kind: 'absent', status: 'approved' }, y: { personId: 'b', from: '2026-11-18', to: '2026-11-18', kind: 'absent', status: 'approved' }, z: { personId: 'e', from: '2026-11-18', to: '2026-11-18', kind: 'absent', status: 'approved' } };
  let info = { partner: ['d'] };
  assert.strictEqual(R.replacement(weeks, tm, abs, '2026-11-18', ['d', 'e'], info), 'c'); assert.ok(!info.fallback);
  // back to back refused when someone else is free: Tue slot, a and b on Mon, d/e on Wed, c free
  info = { partner: [] };
  assert.strictEqual(R.replacement(weeks, tm, {}, '2026-11-17', [], info), 'c'); assert.ok(!info.fallback);
  // only adjacent people left: allowed and flagged
  const tm2 = { a: tm.a, b: tm.b, d: tm.d, e: tm.e };
  info = { partner: [] };
  const r = R.replacement(weeks, tm2, {}, '2026-11-17', [], info);
  assert.ok(['a', 'b', 'd', 'e'].includes(r)); assert.strictEqual(info.fallback, 'back to back');
  // the flag reaches the managers' change note
  const w2 = { [wk]: { days: { mon: ['a', 'b'], tue: ['d', 'e'], wed: ['d', 'e'], thu: [], fri: [] } } };
  const ch = R.applyAbsences(w2, tm2, { q: { personId: 'e', from: '2026-11-17', to: '2026-11-17', kind: 'absent', status: 'approved' } }, '2026-11-16', {});
  assert.ok(ch.some(x => x.date === '2026-11-17' && /night before or after/.test(x.note || '')), JSON.stringify(ch));
  // least paired with the partner breaks a tie
  const w3 = { '2026-W40': { days: { mon: ['a', 'd'], tue: ['a', 'd'] } }, [wk]: { days: { mon: [], tue: [], wed: ['d', 'x'], thu: [], fri: [] } } };
  assert.strictEqual(R.replacement(w3, { a: tm.a, b: tm.b, d: tm.d }, {}, '2026-11-18', ['d', 'x'], { partner: ['d'] }), 'b');
  console.log('replacement rules ok');
}

/* Saturday "can't lockup": either type drops that person; both out falls back to managers */
{
  const cfg = { saturday: ['chloe', 'sergio'] }, d = '2026-11-07';
  const nl = (id, t) => ({ personId: id, from: d, to: d, kind: 'nolockup', nlType: t, status: 'approved' });
  assert.deepStrictEqual(R.onFor(d, null, {}, cfg, { a: nl('chloe', 'in') }).ids, ['sergio']);
  assert.deepStrictEqual(R.onFor(d, null, {}, cfg, { a: nl('sergio', 'out') }).ids, ['chloe']);
  const both = R.onFor(d, null, {}, cfg, { a: nl('chloe', 'in'), b: nl('sergio', 'out') });
  assert.strictEqual(both.kind, 'managers'); assert.deepStrictEqual(both.ids, []);
  assert.deepStrictEqual(R.onFor(d, null, {}, cfg, { a: Object.assign(nl('chloe', 'in'), { status: 'cancelled' }) }).ids, ['chloe', 'sergio']);
  assert.strictEqual(R.awayOn({ a: nl('chloe', 'out') }, d).chloe, undefined, 'still in on the calendar');
  console.log('saturday cant lockup ok');
}
