#!/usr/bin/env node
/* The Christmas 2026 rota (Dan, 14 November 2026), checked cell by cell against
   the picture he sent, then through every system that reads it: the calendar,
   the minimums, the lockup pairs, showroom cover and the Monday email. */
'use strict';
const assert = require('assert');
const R = require('../lockup-rota.js'), S = require('../shifts-rota.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

/* the picture, transcribed: I = in, O = off. Dan and Tomi then swapped Christmas Eve
   and New Year's Eve (Dan, 14 November): Dan in on the 24th, Tomi in on the 31st. */
const DATES = ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25', '2026-12-26', '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01'];
const PIC = {
  dan:    'O I I I O O O O I I O O',
  carl:   'O O I I O O O I O I I O',
  clive:  'I O I I O O O I I O O O',
  danny:  'I I O O O O O I I O I O',
  karis:  'I I O I O O O I O I O O',
  mon:    'I I O O O O O I I I I O',
  patryk: 'I I I O O O O O I I I O',
  tomi:   'I I I O O O O O I I I O',
  molly:  'I I I O O O O O O I O O',
  chloe:  'O O O I O O O I I I I O'
};
const CLOSED = ['2026-12-25', '2026-12-26', '2026-12-27', '2027-01-01'];

/* the live team (14 November) plus Patryk, whose usual day off is not known yet */
const team = {
  tomi: { name: 'Tomi', off: 'fri', active: true, order: 0 }, carl: { name: 'Carl', off: 'tue', active: true, order: 1 },
  danny: { name: 'Danny', off: 'wed', active: true, order: 2 }, karis: { name: 'Karis', off: 'wed', active: true, order: 3 },
  dan: { name: 'Dan', off: 'mon', active: true, order: 4 }, mon: { name: 'Mon', off: 'thu', active: true, order: 5 },
  clive: { name: 'Clive', off: 'tue', active: true, order: 6 },
  chloe: { name: 'Chloe', off: 'tue', never: ['mon', 'tue', 'wed', 'thu', 'fri'], active: true, order: 7 },
  molly: { name: 'Molly', off: 'thu', fixed: ['mon'], active: true, order: 8 },
  patryk: { name: 'Patryk', off: 'sat', active: true, order: 9 }
};
const managers = { nathan: { name: 'Nathan' }, will: { name: 'Will' }, sergio: { name: 'Sergio' } };
const holidays = { '2026-12-25': { label: 'Christmas Day' }, '2026-12-28': { label: 'Boxing Day' }, '2027-01-01': { label: 'New Year’s Day' } };
const ctx = (absences) => S.makeCtx({ team, managers, absences: absences || {}, holidays, today: '2026-11-14' });

/* 1. the table in the code is the picture */
DATES.forEach((d, i) => {
  const rd = R.rotaDay(d);
  if (CLOSED.indexOf(d) >= 0) { ok(!rd, d + ' has no open rota'); return; }
  ok(rd, d + ' is on the rota');
  Object.keys(PIC).forEach(id => {
    const want = PIC[id].split(' ')[i];
    eq(rd['in'].indexOf(id) >= 0 ? 'I' : rd.off.indexOf(id) >= 0 ? 'O' : '?', want, id + ' on ' + d + ' matches the picture');
  });
  eq(rd['in'].length + rd.off.length, 10, d + ': everyone listed once');
});
eq(R.rotaDay('2026-12-21').managers, ['nathan', 'will']); eq(R.rotaDay('2026-12-23').managers, ['will']);
eq(R.rotaDay('2026-12-24').managers, ['nathan']); ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31'].forEach(d => eq(R.rotaDay(d).managers, ['sergio']));
ok(/10am to 4pm/.test(R.rotaDay('2026-12-28').note), 'bank holiday hours on the 28th');
ok(!R.rotaDay('2026-12-20') && !R.rotaDay('2027-01-02'), 'normal rota either side');

/* 2. the calendar shows exactly the picture */
const c = ctx();
DATES.forEach((d, i) => {
  const closed = CLOSED.indexOf(d) >= 0;
  eq(S.dayKind(c, d) === 'closed', closed, d + (closed ? ' closed' : ' open'));
  Object.keys(PIC).forEach(id => eq(S.personDay(c, id, d).on ? 'I' : 'O', PIC[id].split(' ')[i], 'calendar: ' + id + ' on ' + d));
  const k = S.countDay(c, d);
  ok(k.ok, d + ' is not short on its own rota (' + k.count + ' on, minimum ' + k.min + ')');
  ok(!k.noRota, d + ' never says no bank holiday rota');
});
eq(S.personDay(c, 'chloe', '2026-12-29'), { on: true, why: 'rota-in' }, 'Chloe in on a weekday she normally never works');
eq(S.personDay(c, 'clive', '2026-12-29').on, true, 'Clive in on his usual day off');
eq(S.personDay(c, 'dan', '2026-12-24'), { on: true, why: 'rota-in' }); eq(S.personDay(c, 'tomi', '2026-12-24'), { on: false, why: 'rota' });
eq(S.personDay(c, 'dan', '2026-12-31'), { on: false, why: 'rota' }); eq(S.personDay(c, 'tomi', '2026-12-31').on, true, 'Tomi in on New Year\u2019s Eve');
eq(S.countDay(c, '2026-12-24').min, 4, 'Christmas Eve minimum is the rota itself');
eq(S.countDay(c, '2026-12-28').count, 5, 'the 28th: Carl, Clive, Danny, Karis and Mon');
eq(S.countDay(c, '2026-12-17').min, 5, 'an ordinary weekday keeps its minimum');
eq(S.bhDates(c, '2026-12-01', '2027-01-31'), [], 'no bank holiday left asking for a rota');

/* 3. a real holiday still wins, and makes the day short */
const hol = { h1: { personId: 'carl', from: '2026-12-24', to: '2026-12-24', kind: 'holiday', status: 'approved' } };
eq(S.personDay(ctx(hol), 'carl', '2026-12-24'), { on: false, why: 'holiday' });
ok(!S.countDay(ctx(hol), '2026-12-24').ok, 'Carl booking Christmas Eve off leaves it short');
ok(!S.impact(ctx(), [{ personId: 'dan', from: '2026-12-24', to: '2026-12-24', kind: 'holiday' }]).ok, 'a new request on a rota day needs a manager');

/* 4. Patryk is away everywhere before 30 November, then normal */
eq(S.personDay(c, 'patryk', '2026-11-27'), { on: false, why: 'notstarted' });
eq(S.personDay(c, 'patryk', '2026-11-30').on, true, 'Patryk in from Monday 30 November');
eq(R.absentOn({}, '2026-11-25').patryk, 'notstarted', 'lockup will not put him on a night before he starts');

/* 5. lockup: nobody off on the rota is left on a night, closed days have none */
const weeks = {}, today = '2026-12-14';
['2026-W52', '2026-W53'].forEach(w => { weeks[w] = R.generate(w, team, Object.assign({}, weeks)); });
R.applyAbsences(weeks, team, {}, today, {});
['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-29', '2026-12-30', '2026-12-31'].forEach(d => {
  const pair = R.pairOn(weeks, d), i = DATES.indexOf(d);
  pair.forEach(id => eq(PIC[id] ? PIC[id].split(' ')[i] : 'I', 'I', 'lockup ' + d + ': ' + id + ' is in that day'));
  ok(pair.length >= 1, 'lockup ' + d + ' has someone');
});
['2026-12-25', '2026-12-26', '2027-01-01'].forEach(d => eq(R.onFor(d, null, holidays, {}, {}).kind, 'closed', 'lockup closed ' + d));

/* 6. showroom cover draws from the calendar */
eq(S.staffOn(c, '2026-12-24'), ['carl', 'karis', 'dan', 'clive', 'chloe'], 'cover pool on Christmas Eve');

/* 7. the Monday email: the week ahead, nobody listed as away for a rota day off */
const RM = require('./lockup-rota-mail.js');
const wk = RM.whoIn('2026-12-21', { team, managers, absences: {}, holidays, today: '2026-12-21' });
ok(wk.every(d => d.away.length === 0), 'rota days off are not called away');
ok(wk.every(d => d.warn.length === 0), 'nothing short in Christmas week');
eq(wk.map(d => d.date), ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24'], 'Christmas week: Friday and Saturday closed');

console.log('christmas rota: ' + n + ' checks ok');
