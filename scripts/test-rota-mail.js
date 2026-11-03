#!/usr/bin/env node
/* The Monday email: the lockup rota and who is in this week, in one message,
 * from the same rules the calendar uses. Pure, no mail is sent.
 *   node scripts/test-rota-mail.js
 */
'use strict';
const assert = require('assert');
const LR = require('../lockup-rota.js');
const RM = require('../scripts/lockup-rota-mail.js');

const team = LR.defaults().team;
team.chloe = { name: 'Chloe', fullName: 'Chloe Smith', email: 'c@x', off: 'tue', never: ['wed'], fixed: ['mon'], active: true, order: 7 };
team.molly = { name: 'Molly', fullName: 'Molly Jones', email: 'm@x', off: 'thu', fixed: ['mon'], active: true, order: 8 };
const weeks = { '2026-W45': { v: 2, days: { mon: ['chloe', 'molly'], tue: ['tomi', 'karis'], wed: ['tomi', 'clive'], thu: ['karis', 'danny'], fri: ['carl', 'mon'] } } };
const absences = { a: { personId: 'carl', from: '2026-11-04', to: '2026-11-04', kind: 'holiday', status: 'approved', note: 'Dentist' } };
const base = { fromDate: '2026-11-02', weeks, team, absences, hol: { '2026-12-25': { label: 'Christmas Day' } } };

// without the calendar data: the old two week rota email, unchanged
const old = RM.build(base);
assert.ok(/^Lockup rota for the next two weeks/.test(old.subject), old.subject);
assert.ok(old.text.indexOf('WHO') < 0, 'no who-is-in section without shifts data');
console.log('ok: without the calendar data the email is the rota it always was');

// with it: one email, the week ahead first, then the rota
const shifts = { config: {}, bh: {}, closed: {}, absences, team, managers: {}, today: '2026-11-02' };
const m = RM.build(Object.assign({}, base, { shifts }));
assert.ok(/^Week ahead from Monday 2 November: who is in, and the lockup rota/.test(m.subject), m.subject);
assert.ok(m.text.indexOf('WHO’S IN THIS WEEK') >= 0 && m.text.indexOf('LOCKUP ROTA') > m.text.indexOf('WHO’S IN THIS WEEK'), 'who is in comes first');
const lines = m.text.split('\n');
const from = lines.indexOf('WHO\u2019S IN THIS WEEK'), to = lines.indexOf('LOCKUP ROTA');
const days = lines.slice(from + 1, to).filter(l => /^  (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) /.test(l));
assert.strictEqual(days.length, 6, 'the week ahead lists Monday to Saturday: ' + days.length);
assert.ok(/away: Carl \(holiday: Dentist\)/.test(m.text), 'the away note is in the email');
console.log('ok: the week ahead, the away notes and the rota are in one email');

// a day with no handover is flagged, and a day below the staff minimum is flagged
const short = RM.whoIn('2026-11-02', Object.assign({}, shifts, { absences: Object.assign({}, absences, { h: { personId: 'molly', from: '2026-11-05', to: '2026-11-05', kind: 'holiday', status: 'approved' }, h2: { personId: 'chloe', from: '2026-11-05', to: '2026-11-05', kind: 'holiday', status: 'approved' } }) }));
const thu = short.find(d => d.dateLabel.indexOf('5 Nov') >= 0 || /Thu/.test(d.day));
assert.ok(thu.warn.some(w => /no Chloe or Molly/.test(w)), 'a Thursday with neither handover person is flagged: ' + JSON.stringify(thu.warn));
const hot = RM.whoIn('2026-11-02', Object.assign({}, shifts, { config: { weekdayMin: 9 } }));
assert.ok(hot.filter(d => d.kind === 'weekday').every(d => d.warn.some(w => /minimum 9/.test(w))), 'a minimum of nine is short every weekday');
console.log('ok: a short day is flagged in the email, including a day with no handover');

// the HTML carries the same section
assert.ok(m.html.indexOf('Who\u2019s in this week') >= 0, 'the HTML has the section');
assert.ok(m.html.indexOf('Dentist') >= 0, 'the HTML has the away note');
console.log('ok: the HTML version has the same section');
console.log('all rota email tests passed');
