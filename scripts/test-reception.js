#!/usr/bin/env node
/* Tests the showroom cover rules (reception-rota.js). Pure, no Firebase.
 *   node scripts/test-reception.js
 */
'use strict';
const assert = require('assert');
const R = require('../reception-rota.js');

const team = {
  tomi: { order: 0 }, carl: { order: 1 }, dan: { order: 2 }, will: { order: 3 }, chloe: { order: 4 }, molly: { order: 5 }, ben: { order: 6 }
};
const wk = R.shiftsFor(2), sat = R.shiftsFor(6);
const everyone = ['tomi', 'carl', 'dan', 'chloe', 'molly', 'ben'];

// three shifts on open days, two on Sunday (none), Saturday has its own hours
assert.strictEqual(wk.length, 3); assert.strictEqual(sat.length, 3); assert.strictEqual(R.shiftsFor(0).length, 0);
assert.deepStrictEqual([wk[0].from, wk[2].to], ['09:00', '18:00']);
console.log('ok: three shifts on each open day, none on Sunday');

// handover team and excluded people are never on reception
const pool = R.poolFor(everyone, team, ['ben']);
assert.deepStrictEqual(pool, ['tomi', 'carl', 'dan']);
console.log('ok: only sales executives go on reception, Chloe and Molly never');

// one person per shift, and each person covers a shift before anyone covers two
const plan = R.planDay({ shifts: wk, available: ['tomi', 'carl', 'dan', 'chloe'], team, history: {} });
const people = Object.keys(plan.assignments).map(k => plan.assignments[k]);
assert.strictEqual(new Set(people).size, 3, 'three different people on three shifts: ' + JSON.stringify(plan.assignments));
assert.ok(people.indexOf('chloe') < 0);
assert.deepStrictEqual(plan.short, []);
console.log('ok: three different sales executives cover the three shifts');

// fairness: the person with fewest recent shifts goes first
const fair = R.planDay({ shifts: [wk[0]], available: ['tomi', 'carl'], team, history: { tomi: 4, carl: 1 } });
assert.strictEqual(fair.assignments.am, 'carl');
console.log('ok: the person with fewest recent reception shifts is picked');

// too few people: the shift is short, not silently given to someone twice without need
const thin = R.planDay({ shifts: wk, available: ['tomi'], team, history: {} });
assert.strictEqual(thin.assignments.am, 'tomi');
assert.strictEqual(thin.assignments.mid, null, 'nobody does a double shift: with one person in, the second shift is short');
assert.deepStrictEqual(thin.short, ['mid', 'pm']);
const none = R.planDay({ shifts: wk, available: [], team, history: {} });
assert.deepStrictEqual(none.short, ['am', 'mid', 'pm']);
const two = R.planDay({ shifts: wk, available: ['tomi', 'carl'], team, history: {} });
const twoPeople = Object.keys(two.assignments).map(k => two.assignments[k]).filter(Boolean);
assert.strictEqual(new Set(twoPeople).size, twoPeople.length, 'no one is on twice: ' + JSON.stringify(two.assignments));
assert.strictEqual(two.short.length, 1, 'with two people the third shift is short, not doubled up');
console.log('ok: nobody does a double shift; a shift with nobody free is short');

// declined: the person who cannot cover is taken off that shift, the next fair person goes on
const dec = R.planDay({ shifts: [wk[0]], available: ['tomi', 'carl'], team, history: {}, declined: { am: ['tomi'] } });
assert.strictEqual(dec.assignments.am, 'carl');
console.log('ok: a person who cannot cover is replaced on that shift');

// standing assignments are kept on a re-plan; only the open shift changes
const keep = R.planDay({ shifts: wk, available: ['tomi', 'carl', 'dan'], team, history: {}, existing: { am: 'dan' }, declined: { mid: ['carl'] } });
assert.strictEqual(keep.assignments.am, 'dan');
assert.notStrictEqual(keep.assignments.mid, 'carl');
console.log('ok: a re-plan keeps the people already on and changes only the shift that needs it');

// the answers: covering, the three reasons, and Other needs words
assert.deepStrictEqual(R.answer('covering'), { status: 'covering', reassign: false });
assert.strictEqual(R.answer('cannot', 'busy with a customer').reason, 'I cannot cover right now');
assert.strictEqual(R.answer('notin').reassign, true);
assert.strictEqual(R.answer('cannot', 'with a customer').reasonText, 'with a customer', 'the words are kept for I cannot cover too');
assert.strictEqual(R.answer('offsite').reason, 'I am off site');
assert.strictEqual(R.answer('other', ''), null, 'Other with no words is refused');
assert.strictEqual(R.answer('other', '  at the dentist  ').reasonText, 'at the dentist');
assert.strictEqual(R.answer('bogus'), null);
console.log('ok: the four answers, and Other needs a reason');

// the email says what Dan asked for
const m = R.coverEmail('Tomi', wk[1]);
assert.ok(/You are on showroom cover\. Please cover showroom until 15:00\./.test(m.text), m.text);
assert.ok(/12:00 to 15:00/.test(m.subject));
const mn = R.managerNote('Carl', wk[0], 'I cannot cover right now', 'with a customer');
assert.ok(/Carl said: I cannot cover right now: with a customer/.test(mn.text));
console.log('ok: the cover email reads "You are on showroom cover. Please cover showroom until HH:MM."');

// management stats: time and shifts from the log; a skip or an absence tag takes that shift back out
const log = {
  a: { kind: 'on', personId: 'tomi', date: '2026-11-02', shift: 'am', from: '09:00', to: '12:00' },
  b: { kind: 'on', personId: 'carl', date: '2026-11-02', shift: 'mid', from: '12:00', to: '15:00' },
  c: { kind: 'on', personId: 'carl', date: '2026-11-03', shift: 'pm', from: '15:00', to: '18:00' },
  d: { kind: 'skip', personId: 'carl', date: '2026-11-03', shift: 'pm', from: '15:00', to: '18:00' },
  e: { kind: 'absent', personId: 'tomi', date: '2026-11-04', shift: 'am', from: '09:00', to: '12:00' },
  f: { kind: 'on', personId: 'tomi', date: '2026-11-04', shift: 'am', from: '09:00', to: '12:00' }
};
const st = R.stats(log, team, '2026-11-01', '2026-11-30');
const tomi = st.filter(x => x.id === 'tomi')[0], carl = st.filter(x => x.id === 'carl')[0];
assert.deepStrictEqual([tomi.shifts, tomi.minutes, tomi.absent], [1, 180, 1], 'the 4 November shift is taken back out by the absence tag: ' + JSON.stringify(tomi));
assert.deepStrictEqual([carl.shifts, carl.minutes, carl.skips], [1, 180, 1], 'Carl skipped his 15:00 shift, so only the midday one counts: ' + JSON.stringify(carl));
assert.ok(st.every((x, i) => i === 0 || st[i - 1].minutes >= x.minutes), 'most time first');
assert.ok(st.some(x => x.id === 'chloe') === false, 'the handover team is not in the sales rows');
const outside = R.stats(log, team, '2026-10-01', '2026-10-31');
assert.strictEqual(outside.filter(x => x.shifts || x.skips || x.absent).length, 0, 'nothing outside the dates counts');
console.log('ok: management totals count shifts, time, skips and absences, and a skip takes the shift back out');

// appointments: a booking is two hours from its start time, and blocks a shift it overlaps
const feed = { busy: [{ name: 'Clive', times: ['09:56', '15:25'] }, { name: 'Daniel', times: ['13:00'] }, { name: 'Tomiwa', times: ['12:00'] }, { name: 'Zed', times: ['10:00'] }] };
const bi = R.busyIntervals(feed);
assert.deepStrictEqual(bi.busy.clive[0], { from: '09:56', to: '11:56' });
assert.deepStrictEqual(bi.unknown, ['Zed'], 'unknown names are reported, not guessed');
assert.strictEqual(R.clashes(bi.busy, 'clive', wk[0]), true, 'a 09:56 booking clashes with the 09:00 to 12:00 shift');
assert.strictEqual(R.clashes(bi.busy, 'tomi', wk[0]), false, 'a 12:00 booking does not clash with the morning, which ends at 12:00');
assert.strictEqual(R.clashes(bi.busy, 'tomi', wk[1]), true, 'a 12:00 booking clashes with the midday shift');
const booked = R.planDay({ shifts: [wk[0]], available: ['clive', 'carl'], team, history: {}, busy: bi.busy });
assert.strictEqual(booked.assignments.am, 'carl', 'a booked person is not put on that shift');
const allBooked = R.planDay({ shifts: [wk[0]], available: ['clive'], team, history: {}, busy: bi.busy });
assert.deepStrictEqual(allBooked.short, ['am'], 'with the only person booked the shift is short');
console.log('ok: appointments block the shifts they overlap, two hours each, and unknown names are reported');

console.log('all reception tests passed');
