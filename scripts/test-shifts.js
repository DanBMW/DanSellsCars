#!/usr/bin/env node
/* Tests the shift and day-off calendar rules (shifts-rota.js) and the
 * 'works' kind it adds to lockup-rota.js. Pure, no Firebase.
 *   node scripts/test-shifts.js
 */
'use strict';
const assert = require('assert');
const LR = require('../lockup-rota.js');
const S = require('../shifts-rota.js');

/* the sales team as lockup seeds it, plus Chloe and Molly (Mondays, see test-lockup-slots.js) */
const team = LR.defaults().team;
team.chloe = { name: 'Chloe', fullName: 'Chloe', email: 'chloe@example.test', off: 'tue', never: ['wed'], fixed: ['mon'], active: true, order: 7 };
team.molly = { name: 'Molly', fullName: 'Molly', email: 'molly@example.test', off: 'thu', fixed: ['mon'], active: true, order: 8 };

const TODAY = '2026-10-30';
const ctx = (extra) => S.makeCtx(Object.assign({ team, today: TODAY, holidays: {}, closed: {}, absences: {}, bh: {}, config: {} }, extra || {}));
const hol = (id, from, to, kind, status) => ({ personId: id, from, to, kind: kind || 'holiday', status: status || 'approved' });
const count = (c, date) => S.countDay(c, date);

/* ---- staffing counts ---- */
{
  const c = ctx();
  // Mon 2 Nov: Dan's day off; Chloe and Molly fixed on Mondays
  assert.deepStrictEqual(S.staffOn(c, '2026-11-02').sort(), ['carl', 'chloe', 'clive', 'danny', 'karis', 'mon', 'molly', 'tomi'].sort());
  // Tue 3 Nov: Carl, Clive and Chloe off
  assert.strictEqual(count(c, '2026-11-03').count, 6);
  assert.strictEqual(count(c, '2026-11-03').ok, true);
  // Sat 7 Nov: nobody has a Saturday off, all 9 on, min 7
  assert.strictEqual(count(c, '2026-11-07').count, 9);
  assert.strictEqual(count(c, '2026-11-07').min, 7);
  // Sunday is closed and needs nobody
  assert.strictEqual(count(c, '2026-11-08').kind, 'closed');
  assert.strictEqual(count(c, '2026-11-08').ok, true);
  console.log('ok: usual days off give the weekday counts (Tue 6, Sat 9 of 9, Sun closed)');
}

/* ---- minimum staffing: a request that takes a day below its minimum ---- */
{
  const c = ctx();
  // one holiday on Tuesday: 6 -> 5, still at the minimum, fine
  let r = S.checkRequest(c, { kind: 'holiday', ciphr: 'CPH-1', personId: 'tomi', from: '2026-11-03', to: '2026-11-03' });
  assert.strictEqual(r.valid, true); assert.strictEqual(r.impact.ok, true);
  // two on the same Tuesday: 6 -> 4, short
  const c2 = ctx({ absences: { a: hol('dan', '2026-11-03', '2026-11-03') } });
  r = S.checkRequest(c2, { kind: 'holiday', ciphr: 'CPH-1', personId: 'tomi', from: '2026-11-03', to: '2026-11-03' });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.impact.ok, false, 'second person off on a day already at 5 must be newly short');
  assert.deepStrictEqual(r.impact.newlyShort.map(d => d.date), ['2026-11-03']);
  assert.strictEqual(r.impact.newlyShort[0].after.count, 4);
  console.log('ok: a holiday that takes Tuesday to 4 of 5 is newly short; one that leaves 5 is not');
}
{
  // a day that is already short only counts as newly short if it gets worse
  const c = ctx({ config: { weekdayMin: 7 }, absences: {} });
  const r = S.checkRequest(c, { kind: 'absence', personId: 'tomi', from: '2026-11-03', to: '2026-11-03', id: 'x' });
  assert.strictEqual(r.impact.ok, false, 'Tue already 6 of 7, losing one more is 5 of 7 and is newly short');
  assert.strictEqual(r.impact.newlyShort.length, 1);
  const r2 = S.checkRequest(c, { kind: 'swap', personId: 'tomi', withId: 'danny', date: '2026-11-04' });
  assert.strictEqual(r2.valid, true, 'swap should be valid: ' + r2.errors.join('; '));
  assert.strictEqual(r2.impact.ok, true, 'a swap leaves the count alone, so it can never newly short a day');
  console.log('ok: an already-short day only needs a manager if the request makes it worse; a swap never does');
}
{
  // Saturday: 9 on, minimum 7. Three away leaves 6.
  const c = ctx({ absences: { a: hol('dan', '2026-11-07', '2026-11-07', 'absent'), b: hol('mon', '2026-11-07', '2026-11-07', 'absent'), d: hol('karis', '2026-11-07', '2026-11-07', 'absent') } });
  assert.strictEqual(count(c, '2026-11-07').count, 6);
  assert.strictEqual(count(c, '2026-11-07').ok, false);
  console.log('ok: Saturday minimum is 7 and is counted against the sales team');
}

/* ---- validation ---- */
{
  const c = ctx();
  let r = S.checkRequest(c, { kind: 'holiday', ciphr: 'CPH-1', personId: 'tomi', from: '2026-10-01', to: '2026-10-02' });
  assert.ok(r.errors.some(e => /past/.test(e)), 'holiday in the past');
  r = S.checkRequest(c, { kind: 'holiday', ciphr: 'CPH-1', personId: 'dan', from: '2026-11-02', to: '2026-11-02' });
  assert.ok(r.errors.some(e => /No working days/.test(e)), 'Dan off on Monday has no working day to take');
  r = S.checkRequest(c, { kind: 'holiday', ciphr: 'CPH-1', personId: 'tomi', from: '2026-11-10', to: '2026-11-05' });
  assert.ok(r.errors.some(e => /before the start/.test(e)));
  const booked = ctx({ absences: { a: hol('tomi', '2026-11-09', '2026-11-12') } });
  r = S.checkRequest(booked, { kind: 'holiday', ciphr: 'CPH-1', personId: 'tomi', from: '2026-11-11', to: '2026-11-13' });
  assert.ok(r.errors.some(e => /Already booked/.test(e)), 'overlap with an approved holiday');
  const requested = ctx({ requests: { q: { kind: 'holiday', ciphr: 'CPH-1', personId: 'tomi', from: '2026-11-20', to: '2026-11-24', status: 'pending' } } });
  r = S.checkRequest(requested, { kind: 'holiday', ciphr: 'CPH-1', personId: 'tomi', from: '2026-11-23', to: '2026-11-25' });
  assert.ok(r.errors.some(e => /Already requested/.test(e)), 'overlap with a pending request');
  // an absence can be recorded for today
  r = S.checkRequest(c, { kind: 'absence', personId: 'carl', from: TODAY, to: TODAY });
  assert.strictEqual(r.valid, true, r.errors.join('; '));
  console.log('ok: past dates, no working days, overlaps and reversed dates are refused; a same-day absence is fine');
}

/* ---- day off switch ---- */
{
  const c = ctx();
  // Dan works Tuesday and takes his usual day off, Monday, instead, same week
  let r = S.checkRequest(c, { kind: 'switch', personId: 'dan', giveUp: '2026-11-03', takeOn: '2026-11-02', id: 's1' });
  assert.strictEqual(r.valid, true, r.errors.join('; '));
  assert.deepStrictEqual(r.edits.map(e => [e.kind, e.from]), [['absent', '2026-11-03'], ['works', '2026-11-02']]);
  assert.strictEqual(r.impact.ok, true, 'Tue 6 -> 5 and Mon 8 -> 9, both fine');
  assert.strictEqual(r.impact.days.find(d => d.date === '2026-11-02').after.count, 9);
  // once Dan is taken into the Monday, the calendar agrees with the switch
  const after = ctx({ absences: { s1a: { personId: 'dan', from: '2026-11-03', to: '2026-11-03', kind: 'absent', status: 'approved' }, s1b: { personId: 'dan', from: '2026-11-02', to: '2026-11-02', kind: 'works', status: 'approved' } } });
  assert.strictEqual(S.personDay(after, 'dan', '2026-11-02').why, 'swapped-in');
  assert.strictEqual(S.personDay(after, 'dan', '2026-11-03').why, 'absent');
  // the other way round: taking the day off on a working day is refused
  r = S.checkRequest(c, { kind: 'switch', personId: 'dan', giveUp: '2026-11-02', takeOn: '2026-11-03', id: 's2' });
  assert.ok(r.errors.length, 'Dan is not working Monday to give it up');
  // a switch into another week is refused
  r = S.checkRequest(c, { kind: 'switch', personId: 'dan', giveUp: '2026-11-03', takeOn: '2026-11-09', id: 's3' });
  assert.ok(r.errors.some(e => /same week/.test(e)));
  // one switch a week
  const pendingSwitch = ctx({ requests: { p: { kind: 'switch', personId: 'dan', giveUp: '2026-11-04', takeOn: '2026-11-02', status: 'pending' } } });
  r = S.checkRequest(pendingSwitch, { kind: 'switch', personId: 'dan', giveUp: '2026-11-03', takeOn: '2026-11-02', id: 's4' });
  assert.ok(r.errors.some(e => /already switched/.test(e)));
  // a switch that takes a day below minimum comes back with impact.ok false
  const tight = ctx({ config: { weekdayMin: 6 } });
  r = S.checkRequest(tight, { kind: 'switch', personId: 'dan', giveUp: '2026-11-03', takeOn: '2026-11-02', id: 's5' });
  assert.strictEqual(r.impact.ok, false);
  console.log('ok: a switch moves the day, is one week only, and is flagged when it short-staffs a day');
}

/* ---- swap a shift with a colleague ---- */
{
  const c = ctx();
  // Tomi works Wednesday; Danny is off on Wednesday, so Danny takes it
  let r = S.checkRequest(c, { kind: 'swap', personId: 'tomi', withId: 'danny', date: '2026-11-04' });
  assert.strictEqual(r.valid, true, r.errors.join('; '));
  assert.strictEqual(r.impact.ok, true);
  // colleague already working that day (Carl does work Wednesdays)
  r = S.checkRequest(c, { kind: 'swap', personId: 'tomi', withId: 'carl', date: '2026-11-04' });
  assert.ok(r.errors.some(e => /already on/.test(e)), 'a colleague already on cannot take the shift');
  const off = ctx({ absences: { h: hol('danny', '2026-11-04', '2026-11-04') } });
  r = S.checkRequest(off, { kind: 'swap', personId: 'tomi', withId: 'danny', date: '2026-11-04' });
  assert.ok(r.errors.some(e => /away that day/.test(e)));
  console.log('ok: a shift swap to a colleague who is off that day counts the day unchanged');
}

/* ---- bank holidays: 4 from the sales team, never Molly or Chloe ---- */
{
  const holidays = { '2026-12-25': { label: 'Christmas Day' }, '2026-12-28': { label: 'Boxing Day' }, '2027-01-01': { label: 'New Year' },
    '2027-04-02': { label: 'Good Friday' }, '2027-04-05': { label: 'Easter Monday' }, '2027-05-03': { label: 'Early May' } };
  const c = ctx({ holidays });
  const rota = S.bhGenerate(c, Object.keys(holidays));
  const counts = {};
  Object.keys(rota).forEach(d => {
    assert.strictEqual(rota[d].staff.length, 4, d + ' has four people');
    assert.ok(!rota[d].staff.includes('molly') && !rota[d].staff.includes('chloe'), d + ' excludes Molly and Chloe');
    rota[d].staff.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  });
  const vals = Object.keys(counts).map(k => counts[k]);
  assert.ok(Math.max(...vals) - Math.min(...vals) <= 1, 'bank holidays are shared out evenly: ' + JSON.stringify(counts));
  assert.strictEqual(Object.keys(counts).length, 7, 'all seven of the rest get a bank holiday over six');
  console.log('ok: six bank holidays, four each, shared out within one: ' + JSON.stringify(counts));
}
{
  // someone on approved holiday is not picked, and a stored rota is never changed
  const holidays = { '2026-12-25': { label: 'Christmas Day' } };
  const c = ctx({ holidays, absences: { h: hol('tomi', '2026-12-25', '2026-12-25') } });
  const pick = S.bhPick(c, '2026-12-25');
  assert.ok(!pick.staff.includes('tomi'), 'away on the bank holiday');
  assert.strictEqual(pick.staff.length, 4);
  const kept = S.bhGenerate(ctx({ holidays, bh: { '2026-12-25': { staff: ['carl', 'danny', 'karis', 'clive'] } } }), ['2026-12-25']);
  assert.deepStrictEqual(kept, {}, 'a rota a manager has set stands');
  // no rota means nobody is on and the day is flagged
  const none = count(ctx({ holidays }), '2026-12-25');
  assert.strictEqual(none.noRota, true);
  assert.strictEqual(none.ok, false);
  // with a rota, only those four are on
  const set = count(ctx({ holidays, bh: { '2026-12-25': { staff: ['carl', 'danny', 'karis', 'clive'] } } }), '2026-12-25');
  assert.deepStrictEqual(set.ids, ['carl', 'danny', 'karis', 'clive'].sort((a, b) => (team[a].order - team[b].order)));
  assert.strictEqual(set.ok, true);
  console.log('ok: bank holiday rota skips anyone away, keeps a manager’s rota, and flags a day with none');
}
{
  // bank holiday does not count weekday minimum: the rota does
  const holidays = { '2026-12-25': { label: 'Christmas Day' } };
  const c = ctx({ holidays, bh: { '2026-12-25': { staff: ['carl', 'danny', 'karis'] } } });
  assert.strictEqual(count(c, '2026-12-25').min, 4);
  assert.strictEqual(count(c, '2026-12-25').ok, false, 'three on a bank holiday is short of four');
}

/* ---- lockup: 'works' entries ---- */
{
  const abs = { s: { personId: 'dan', from: '2026-11-02', to: '2026-11-02', kind: 'works', status: 'approved' } };
  assert.deepStrictEqual(LR.absentOn(abs, '2026-11-02'), {}, 'works is never away');
  assert.deepStrictEqual(LR.worksOn(abs, '2026-11-02'), { dan: true });
  assert.deepStrictEqual(LR.worksOn(abs, '2026-11-03'), {});
  // a person on the rota on their usual day off, with a works entry, is not replaced
  const weeks = { '2026-W45': { v: 2, days: { mon: ['dan', 'tomi'], tue: ['tomi', 'dan'], wed: ['tomi', 'karis'], thu: ['mon', 'molly'], fri: ['tomi', 'clive'] } } };
  const ch = LR.applyAbsences(JSON.parse(JSON.stringify(weeks)), team, abs, '2026-10-30', {});
  assert.ok(!ch.some(c => c.dow === 'mon' && c.out === 'dan'), 'swapped-in Dan keeps the Monday');
  // without the works entry Dan is off Monday and is replaced
  const ch2 = LR.applyAbsences(JSON.parse(JSON.stringify(weeks)), team, {}, '2026-10-30', {});
  assert.ok(ch2.some(c => c.dow === 'mon' && c.out === 'dan'), 'without a works entry he is replaced on his day off');
  // and a works entry makes that person a cover candidate on the date
  const cover = LR.replacement(weeks, team, abs, '2026-11-02', ['tomi']);
  assert.ok(cover, 'someone is found for cover');
  console.log('ok: a day off swap is not away, keeps the person on the night, and is free for cover');
}

/* ---- helpers ---- */
{
  assert.deepStrictEqual(S.listOf({ a: true, b: false, c: true }), ['a', 'c']);
  assert.deepStrictEqual(S.listOf(['x', null, 'y']), ['x', 'y']);
  assert.deepStrictEqual(S.listOf('solo'), ['solo']);
  assert.deepStrictEqual(S.listOf({ 0: 'carl', 1: 'danny' }), ['carl', 'danny']);
  assert.strictEqual(S.cfgOf({}).weekdayMin, 5);
  assert.strictEqual(S.cfgOf({ saturdayMin: 8 }).saturdayMin, 8);
  assert.strictEqual(S.cfgOf({ bhExclude: { molly: true } }).bhExclude.join(), 'molly');
  console.log('ok: stored lists read back in any of their shapes, and config defaults fill the gaps');
}

/* ---- leave is booked on Ciphr first: the reference is required ---- */
{
  const c = ctx();
  let r = S.checkRequest(c, { kind: 'holiday', personId: 'tomi', from: '2026-11-16', to: '2026-11-18' });
  assert.ok(r.errors.some(e => /Ciphr/.test(e)), 'no Ciphr reference is refused');
  r = S.checkRequest(c, { kind: 'holiday', personId: 'tomi', from: '2026-11-16', to: '2026-11-18', ciphr: '   ' });
  assert.ok(r.errors.some(e => /Ciphr/.test(e)), 'a blank reference is refused');
  r = S.checkRequest(c, { kind: 'holiday', personId: 'tomi', from: '2026-11-16', to: '2026-11-18', ciphr: 'CPH-99' });
  assert.strictEqual(r.valid, true, r.errors.join('; '));
  // absences and switches do not need one
  r = S.checkRequest(c, { kind: 'absence', personId: 'tomi', from: '2026-11-16', to: '2026-11-16' });
  assert.strictEqual(r.valid, true);
  console.log('ok: a leave request needs its Ciphr reference; absences do not');
}

/* ---- handover: Chloe or Molly on every open day, except bank holidays ---- */
{
  // Molly off Thursday; Chloe never on a Wednesday and off on a Tuesday: take Molly off Thursday,
  // and Chloe's Thursday comes from her rota only. Make Chloe and Molly both away on a Thursday
  const c = ctx({ absences: { h1: hol('chloe', '2026-11-05', '2026-11-05'), h2: hol('molly', '2026-11-05', '2026-11-05') } });
  const day = count(c, '2026-11-05');
  assert.strictEqual(day.ok, false, 'no handover person on a Thursday is short');
  assert.deepStrictEqual(day.reasons, ['handover'], 'and the reason is the handover team, not the count');
  assert.strictEqual(day.count >= day.min, true, 'the staff count is fine');
  // a holiday for Molly on a day Chloe is in: still covered
  const c2 = ctx({ absences: { h: hol('molly', '2026-11-05', '2026-11-05') } });
  assert.strictEqual(count(c2, '2026-11-05').ok, true, 'Chloe on her own covers the handover minimum');
  // the handover minimum applies on Saturdays too
  const sat = ctx({ absences: { a: hol('chloe', '2026-11-07', '2026-11-07'), b: hol('molly', '2026-11-07', '2026-11-07') } });
  assert.deepStrictEqual(count(sat, '2026-11-07').reasons, ['handover']);
  // bank holidays leave Chloe and Molly out by design, so the handover minimum does not apply
  const bh = ctx({ holidays: { '2026-12-25': { label: 'Christmas Day' } }, bh: { '2026-12-25': { staff: ['tomi', 'carl', 'karis', 'clive'] } } });
  assert.strictEqual(count(bh, '2026-12-25').ok, true, 'a bank holiday rota with no handover is fine');
  // a request that takes the handover team away is flagged as a handover warning, and the impact says so
  const r = S.checkRequest(c2, { kind: 'holiday', ciphr: 'CPH-2', personId: 'chloe', from: '2026-11-05', to: '2026-11-05' });
  assert.strictEqual(r.valid, true, 'warnings never stop a request');
  assert.strictEqual(r.impact.ok, false, 'but the impact is short');
  assert.deepStrictEqual(r.impact.newlyShort[0].after.reasons, ['handover']);
  // the week view lists who is in and who is away with notes
  const week = S.whoIn(ctx({ absences: { n: Object.assign(hol('carl', '2026-11-09', '2026-11-09', 'absent'), { note: 'Dentist' }) } }), '2026-11-09', '2026-11-11');
  assert.strictEqual(week.length, 3);
  assert.strictEqual(week[0].away[0].note, 'Dentist', 'the note travels with the absence');
  assert.ok(week.every(d => d.ids !== undefined && d.handover !== undefined));
  console.log('ok: handover is a minimum on open days, a warning rather than a block on requests, and the week view keeps notes');
}

console.log('all shifts tests passed');
