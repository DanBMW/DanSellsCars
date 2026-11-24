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

const W = id => wk.filter(s => s.id === id)[0];
const ids = list => list.map(s => s.id);

// three shifts on open days, two seats each (Dan, 17 November 2026); none on Sunday; Saturday has its own hours
assert.deepStrictEqual(ids(wk), ['am', 'am2', 'mid', 'mid2', 'pm', 'pm2']);
assert.deepStrictEqual(ids(sat), ['am', 'am2', 'mid', 'mid2', 'pm', 'pm2']);
assert.strictEqual(R.shiftsFor(0).length, 0);
assert.deepStrictEqual([W('am').from, W('am').to, W('am2').from, W('am2').to], ['09:00', '12:00', '09:00', '12:00'], 'both seats share the shift hours');
assert.deepStrictEqual([wk[0].from, wk[5].to], ['09:00', '18:00']);
assert.ok(R.sameTime(W('am'), W('am2')) && !R.sameTime(W('am'), W('mid')));
assert.ok(R.tooClose(W('am'), W('mid')), 'back to back is too close');
assert.ok(!R.tooClose(W('am'), W('pm')), 'morning and afternoon have a gap');
assert.ok(!R.tooClose(sat[0], sat[4]), 'Saturday 09:00 to 12:00 and 14:00 to 17:00 have a gap');
console.log('ok: three shifts of two seats on each open day, none on Sunday');

// handover team and excluded people are never on reception
const pool = R.poolFor(everyone, team, ['ben']);
assert.deepStrictEqual(pool, ['tomi', 'carl', 'dan']);
console.log('ok: only sales executives go on reception, Chloe and Molly never');

/* every plan: nobody in both seats of a shift, nobody back to back */
function sound(plan, shifts) {
  const a = plan.assignments;
  shifts.forEach(x => shifts.forEach(y => {
    if (x.id < y.id && a[x.id] && a[x.id] === a[y.id]) assert.ok(!R.tooClose(x, y), a[x.id] + ' on ' + x.id + ' and ' + y.id + ' with no gap: ' + JSON.stringify(a));
  }));
}

// six people: six different people on six seats
const six = ['tomi', 'carl', 'dan', 'will', 'ben', 'mon'];
const t6 = Object.assign({ mon: { order: 7 } }, team);
const plan = R.planDay({ shifts: wk, available: six.concat('chloe'), team: t6, history: {} });
const people = Object.keys(plan.assignments).map(k => plan.assignments[k]);
assert.strictEqual(new Set(people).size, 6, 'six different people on six seats: ' + JSON.stringify(plan.assignments));
assert.ok(people.indexOf('chloe') < 0);
assert.deepStrictEqual(plan.short, []);
sound(plan, wk);
console.log('ok: two different sales executives on each of the three shifts');

// four people: the afternoon is a double for two of the morning, never the midday pair
const four = R.planDay({ shifts: wk, available: ['tomi', 'carl', 'dan', 'will'], team, history: {} });
assert.deepStrictEqual(four.short, [], 'four people fill six seats with a gap: ' + JSON.stringify(four.assignments));
sound(four, wk);
assert.deepStrictEqual([four.assignments.pm, four.assignments.pm2].sort(), [four.assignments.am, four.assignments.am2].sort(), 'the morning pair come back for the afternoon');
console.log('ok: a double shift only with a gap, morning and afternoon');

// five people: only one double, and it is someone from the morning
const five = R.planDay({ shifts: wk, available: ['tomi', 'carl', 'dan', 'will', 'ben'], team, history: {} });
sound(five, wk);
const fiveIds = Object.keys(five.assignments).map(k => five.assignments[k]);
assert.strictEqual(new Set(fiveIds).size, 5, 'everyone on at least once before anyone twice');
assert.deepStrictEqual(five.short, []);

// fairness: the person with fewest recent shifts goes first
const fair = R.planDay({ shifts: [W('am')], available: ['tomi', 'carl'], team, history: { tomi: 4, carl: 1 } });
assert.strictEqual(fair.assignments.am, 'carl');
console.log('ok: the person with fewest recent reception shifts is picked');

// too few people: a seat is short rather than one person doing both seats or back to back
const thin = R.planDay({ shifts: wk, available: ['tomi'], team, history: {} });
assert.strictEqual(thin.assignments.am, 'tomi');
assert.strictEqual(thin.assignments.am2, null, 'one person is never in both seats');
assert.strictEqual(thin.assignments.mid, null, 'nor back to back');
assert.strictEqual(thin.assignments.pm, 'tomi', 'but may come back after a gap');
assert.deepStrictEqual(thin.short, ['am2', 'mid', 'mid2', 'pm2']);
sound(thin, wk);
const none = R.planDay({ shifts: wk, available: [], team, history: {} });
assert.deepStrictEqual(none.short, ids(wk));
const two = R.planDay({ shifts: wk, available: ['tomi', 'carl'], team, history: {} });
sound(two, wk);
assert.deepStrictEqual(two.short, ['mid', 'mid2'], 'with two people the midday shift is short: ' + JSON.stringify(two.assignments));
console.log('ok: nobody in both seats or back to back; a seat with nobody free is short');

// declined: the person who cannot cover is taken off that seat, the next fair person goes on
const dec = R.planDay({ shifts: [W('am')], available: ['tomi', 'carl'], team, history: {}, declined: { am: ['tomi'] } });
assert.strictEqual(dec.assignments.am, 'carl');
console.log('ok: a person who cannot cover is replaced on that shift');

// standing assignments are kept on a re-plan; only the open seats change, and they respect who is already on
const keep = R.planDay({ shifts: wk, available: ['tomi', 'carl', 'dan', 'will', 'ben'], team, history: {}, existing: { am: 'dan', mid: 'tomi', pm: 'carl' }, declined: { mid2: ['will'] } });
assert.deepStrictEqual([keep.assignments.am, keep.assignments.mid, keep.assignments.pm], ['dan', 'tomi', 'carl']);
assert.notStrictEqual(keep.assignments.mid2, 'will');
sound(keep, wk);
console.log('ok: a re-plan keeps the people already on and changes only the seats that need it');

// a day planned before 17 November (one seat a shift): the second seats are filled around them
const old = R.planDay({ shifts: wk, available: ['tomi', 'carl', 'dan', 'will', 'ben', 'mon'], team: t6, history: {}, existing: { am: 'tomi', mid: 'carl', pm: 'dan' } });
assert.deepStrictEqual([old.assignments.am, old.assignments.mid, old.assignments.pm], ['tomi', 'carl', 'dan']);
assert.deepStrictEqual([old.assignments.am2, old.assignments.mid2, old.assignments.pm2].sort(), ['ben', 'mon', 'will']);

// seats that have ended are skipped, not filled and not short
const late = R.planDay({ shifts: wk, available: ['tomi', 'carl', 'dan'], team, history: {}, existing: { am: 'tomi', mid: 'carl', pm: 'dan' }, skip: ['am2', 'mid2'] });
assert.ok(!('am2' in late.assignments) && !('mid2' in late.assignments), JSON.stringify(late.assignments));
assert.strictEqual(late.assignments.pm2, 'tomi', 'the afternoon second seat goes to someone with a gap');
assert.deepStrictEqual(late.short, []);
console.log('ok: second seats fill around a day planned with one; ended seats are left alone');

// fuzz: random pools, histories, declines and bookings never break the gap rule
let seed = 7;
const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const names = ['tomi', 'carl', 'dan', 'will', 'ben', 'mon', 'karis', 'clive'];
const tAll = {}; names.forEach((x, i) => { tAll[x] = { order: i }; });
for (let i = 0; i < 3000; i++) {
  const shifts = rnd(2) ? wk : sat;
  const av = names.filter(() => rnd(3));
  const hist = {}; av.forEach(x => { hist[x] = rnd(6); });
  const dcl = {}; shifts.forEach(s => { if (rnd(5) === 0 && av.length) dcl[s.id] = [av[rnd(av.length)]]; });
  const p = R.planDay({ shifts, available: av, team: tAll, history: hist, declined: dcl });
  sound(p, shifts);
  shifts.forEach(s => { const a = p.assignments[s.id]; if (a) assert.ok((dcl[s.id] || []).indexOf(a) < 0); else assert.ok(p.short.indexOf(s.id) >= 0); });
}
console.log('ok: 3,000 random days, never both seats or back to back');

// the answers: covering, the three reasons, and Other needs words
assert.deepStrictEqual(R.answer('covering'), { status: 'covering', reassign: false });
assert.strictEqual(R.answer('cannot', 'busy with a customer').reason, 'I cannot cover right now');
assert.strictEqual(R.answer('notin').reassign, true);
assert.strictEqual(R.answer('cannot', 'with a customer').reasonText, 'with a customer', 'the words are kept for I cannot cover too');
assert.strictEqual(R.answer('offsite').reason, 'I am off site');
assert.strictEqual(R.answer('other', ''), null, 'Other with no words is refused');
assert.strictEqual(R.answer('other', '  at the dentist  ').reasonText, 'at the dentist');
assert.strictEqual(R.answer('bogus'), null);
const cust = R.answer('customer');
assert.deepStrictEqual([cust.status, cust.reassign, cust.reason, cust.reasonText], ['declined', true, "I'm with a customer now, cannot cover", ''], 'with a customer needs no words and reallocates at once');
console.log('ok: the four answers, and Other needs a reason');

// locations: place 1 is HALO, place 2 is Reception; a lone person is always at HALO
assert.strictEqual(R.locationOf(1), 'HALO');
assert.strictEqual(R.locationOf(2), 'Reception');
assert.strictEqual(R.locationOf(2, { alone: true }), 'HALO');
assert.strictEqual(R.locationOf(undefined), 'HALO');
assert.strictEqual(R.heldCount({ am: { personId: 'tomi', status: 'assigned' } }, wk, W('am')), 1);
assert.strictEqual(R.heldCount({ am: { personId: 'tomi', status: 'assigned' }, am2: { personId: 'carl', status: 'assigned' } }, wk, W('am')), 2);
assert.strictEqual(R.heldCount({ am: { personId: 'tomi', status: 'assigned' } }, wk, W('am'), { am2: 'carl' }), 2);
console.log('ok: place 1 is HALO, place 2 is Reception, a lone person is HALO');

// the email says what Dan asked for, with tap links for covering / cannot cover, and the location
const m = R.coverEmail('Tomi', W('mid'), { date: '2026-11-02' });
assert.ok(/You are on showroom cover at HALO\. Please cover showroom until 15:00\./.test(m.text), m.text);
assert.ok(/Showroom cover at HALO, 12:00 to 15:00/.test(m.subject), m.subject);
const m2 = R.coverEmail('Carl', W('mid2'), { date: '2026-11-02' });
assert.ok(/You are on showroom cover at Reception\. Please cover showroom until 15:00\./.test(m2.text), m2.text);
assert.ok(/Showroom cover at Reception, 12:00 to 15:00/.test(m2.subject), m2.subject);
const mAlone = R.coverEmail('Carl', W('mid2'), { date: '2026-11-02', alone: true });
assert.ok(/You are on showroom cover at HALO\. Please cover showroom until 15:00\./.test(mAlone.text), mAlone.text);
const sm = R.startEmail({ from: '09:00', to: '12:00' }, [
  { name: 'Tomi', state: 'assigned' },
  { name: 'Carl', state: 'covering' }
]);
assert.ok(/Place 1, HALO: Tomi, Not confirmed yet\./.test(sm.text), sm.text);
assert.ok(/Place 2, Reception: Carl, Confirmed, covering\./.test(sm.text), sm.text);
assert.ok(/Place 1, HALO/.test(sm.html) && /Place 2, Reception/.test(sm.html), sm.html);
const smOne = R.startEmail({ from: '09:00', to: '12:00' }, [
  { name: '', state: 'short' },
  { name: 'Carl', state: 'assigned' }
]);
assert.ok(/Place 1, HALO: Nobody, Nobody free, please choose someone\./.test(smOne.text), smOne.text);
assert.ok(/Place 2, HALO: Carl, Not confirmed yet\./.test(smOne.text), smOne.text);
const nag = R.nagEmail('Tomi', W('mid'), { date: '2026-11-02', n: 1 });
assert.ok(/Reminder: are you covering the showroom at HALO, 12:00 to 15:00\?/.test(nag.subject), nag.subject);
assert.ok(/you are on showroom cover at HALO until 15:00 and have not confirmed yet/.test(nag.text), nag.text);
const nag2 = R.nagEmail('Carl', W('mid2'), { date: '2026-11-02', n: 3 });
assert.ok(/Still waiting: are you covering the showroom at Reception, 12:00 to 15:00\?/.test(nag2.subject), nag2.subject);
assert.ok(/covering the showroom at Reception until 15:00/.test(nag2.text), nag2.text);
const nagAlone = R.nagEmail('Carl', W('mid2'), { date: '2026-11-02', n: 1, alone: true });
assert.ok(/showroom cover at HALO until 15:00/.test(nagAlone.text), nagAlone.text);
const un = R.unconfirmedNote('Tomi', W('mid'), 40);
assert.ok(/has not confirmed showroom cover at HALO, 12:00 to 15:00 after 40 minutes/.test(un.text), un.text);
assert.ok(/has not confirmed showroom cover at HALO, 12:00 to 15:00/.test(un.subject), un.subject);
assert.ok(/action=covering/.test(m.coveringUrl), m.coveringUrl);
assert.ok(/action=cannot/.test(m.cannotUrl), m.cannotUrl);
if (R.TEST_ONLY) assert.ok(/test=1/.test(m.coveringUrl), 'practice links keep test=1 while TEST_ONLY');
else assert.ok(!/test=1/.test(m.coveringUrl) && !/test=1/.test(m.cannotUrl), 'live links drop test=1 when TEST_ONLY is off: ' + m.coveringUrl);
assert.ok(/date=2026-11-02/.test(m.coveringUrl) && /shift=mid/.test(m.coveringUrl), m.coveringUrl);
assert.ok(/I am covering/.test(m.html) && /I cannot cover/.test(m.html), 'html has the tap buttons');
assert.ok(m.html.indexOf(m.coveringUrl.replace(/&/g, '&amp;')) >= 0 && m.html.indexOf(m.cannotUrl.replace(/&/g, '&amp;')) >= 0, 'html links match the urls');
assert.ok(/I am covering:\nhttps:\/\/dan-sells\.co\.uk\/reception\.html/.test(m.text), m.text);
const ab = R.absentEmail('Tomi', W('mid'), { date: '2026-11-02' });
assert.ok(/You are on showroom cover at HALO, 12:00 to 15:00\./.test(ab.text), ab.text);
assert.ok(/action=here/.test(ab.hereUrl) && /action=away/.test(ab.awayUrl), ab.hereUrl);
assert.ok(/I am here/.test(ab.html) && /I cannot be in/.test(ab.html));
const ab2 = R.absentEmail('Carl', W('mid2'), { date: '2026-11-02' });
assert.ok(/You are on showroom cover at Reception, 12:00 to 15:00\./.test(ab2.text), ab2.text);
const abAlone = R.absentEmail('Carl', W('mid2'), { date: '2026-11-02', alone: true });
assert.ok(/You are on showroom cover at HALO, 12:00 to 15:00\./.test(abAlone.text), abAlone.text);
const mn = R.managerNote('Carl', wk[0], 'I cannot cover right now', 'with a customer');
assert.ok(/Carl said: I cannot cover right now: with a customer/.test(mn.text));
console.log('ok: the cover email has tap buttons for I am covering and I cannot cover');

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
assert.strictEqual(R.clashes(bi.busy, 'tomi', W('mid')), true, 'a 12:00 booking clashes with the midday shift');
const booked = R.planDay({ shifts: [W('am')], available: ['clive', 'carl'], team, history: {}, busy: bi.busy });
assert.strictEqual(booked.assignments.am, 'carl', 'a booked person is not put on that shift');
const allBooked = R.planDay({ shifts: [W('am')], available: ['clive'], team, history: {}, busy: bi.busy });
assert.deepStrictEqual(allBooked.short, ['am'], 'with the only person booked the shift is short');
console.log('ok: appointments block the shifts they overlap, two hours each, and unknown names are reported');


// bankCover: credit from confirm (or shift start) up to the moment they cannot
assert.strictEqual(R.bankCover(wk[0], { nowMins: R.minsOf('08:30') }), null, 'nothing before the shift starts');
assert.deepStrictEqual(R.bankCover(wk[0], { nowMins: R.minsOf('10:00') }), { from: '09:00', to: '10:00', minutes: 60 }, 'rostered time from start when never confirmed');
assert.deepStrictEqual(R.bankCover(wk[0], { nowMins: R.minsOf('10:00'), confirmMins: R.minsOf('09:30') }), { from: '09:30', to: '10:00', minutes: 30 }, 'from confirm when they tapped covering late');
assert.deepStrictEqual(R.bankCover(wk[0], { nowMins: R.minsOf('10:00'), confirmMins: R.minsOf('08:45') }), { from: '09:00', to: '10:00', minutes: 60 }, 'early confirm still banks from shift start');
assert.deepStrictEqual(R.bankCover(wk[0], { nowMins: R.minsOf('13:00'), confirmMins: R.minsOf('09:00') }), { from: '09:00', to: '12:00', minutes: 180 }, 'cap at shift end');
assert.strictEqual(R.bankCover(wk[0], { nowMins: R.minsOf('09:00'), confirmMins: R.minsOf('09:00') }), null, 'zero minutes is not banked');
assert.deepStrictEqual(R.remainCover(wk[0], R.minsOf('10:00')), { from: '10:00', to: '12:00', minutes: 120 });
assert.strictEqual(R.remainCover(wk[0], R.minsOf('12:00')), null);
console.log('ok: bankCover credits partial time, remainCover is the leftover slot');

// stats: a handed_back cover still credits minutes after a skip voids the planned on
const log2 = {
  a: { kind: 'on', personId: 'tomi', date: '2026-11-02', shift: 'am', from: '09:00', to: '12:00', reason: 'planned' },
  b: { kind: 'cover', personId: 'tomi', date: '2026-11-02', shift: 'am', from: '09:00', to: '10:00', minutes: 60, reason: 'handed_back' },
  c: { kind: 'skip', personId: 'tomi', date: '2026-11-02', shift: 'am', from: '09:00', to: '12:00' },
  d: { kind: 'on', personId: 'carl', date: '2026-11-02', shift: 'am', from: '10:00', to: '12:00', reason: 'took_over' }
};
const st2 = R.stats(log2, team, '2026-11-01', '2026-11-30');
const tomi2 = st2.filter(x => x.id === 'tomi')[0], carl2 = st2.filter(x => x.id === 'carl')[0];
assert.deepStrictEqual([tomi2.minutes, tomi2.handed, tomi2.skips, tomi2.shifts], [60, 60, 1, 0], 'Tomi keeps the hour he did: ' + JSON.stringify(tomi2));
assert.deepStrictEqual([carl2.minutes, carl2.shifts], [120, 1], 'Carl gets the took_over remainder: ' + JSON.stringify(carl2));
const hist = R.historyRows(log2, team, '2026-11-01', '2026-11-30');
assert.ok(hist.some(h => h.reason === 'handed_back' && h.minutes === 60));
assert.ok(hist.some(h => h.reason === 'took_over'));
assert.ok(hist.some(h => h.reason === 'planned'));
const te = R.takenEmail('Tomi', 'Carl', wk[0], { date: '2026-11-02' });
assert.ok(/Carl has taken your showroom cover 09:00 to 12:00/.test(te.text), te.text);
console.log('ok: handed-back minutes stay on the record, history lists reasons, taken email names the taker');

// walk-in taken by the person on cover → same reallocate payload as Unable
{
  const teamNames = {
    tomi: { name: 'Tomi', fullName: 'Tomi Adelaja', order: 0 },
    carl: { name: 'Carl', fullName: 'Carl Hadwin', order: 1 },
    danny: { name: 'Danny', fullName: 'Danny Willis', order: 2 },
    dan: { name: 'Dan', fullName: 'Daniel Cane', order: 3 }
  };
  assert.strictEqual(R.matchPersonByName('Danny Willis', teamNames), 'danny');
  assert.strictEqual(R.matchPersonByName('Tomiwa', teamNames), 'tomi');
  assert.strictEqual(R.matchPersonByName('Daniel Cane', teamNames), 'dan');
  assert.strictEqual(R.matchPersonByName('Nobody Here', teamNames), null);
  assert.strictEqual(R.activeShiftAt(wk, R.minsOf('10:00')).id, 'am');
  assert.strictEqual(R.activeShiftAt(wk, R.minsOf('08:45')), null, 'heads-up before first shift is not active');
  assert.strictEqual(R.activeShiftAt(wk, R.minsOf('18:00')), null, 'at shift end the window is closed');

  const day = { am: { personId: 'danny', status: 'covering', ts: 1 } };
  const hit = R.walkinCoverReallocate({
    alertId: 'a1', kind: 'walk-in-taken', assignedTo: 'Danny Willis', customer: 'Mr Patel',
    team: teamNames, shifts: wk, nowMins: R.minsOf('10:00'), day: day, handled: {}
  });
  assert.ok(hit, 'cover person taking a walk-in queues a reallocate');
  assert.strictEqual(hit.shiftId, 'am');
  assert.strictEqual(hit.personId, 'danny');
  assert.strictEqual(hit.reallocate.by, 'walkin');
  assert.ok(/Took a walk-in/.test(hit.reallocate.text));

  assert.strictEqual(R.walkinCoverReallocate({
    alertId: 'a1', kind: 'walk-in-taken', assignedTo: 'Danny Willis',
    team: teamNames, shifts: wk, nowMins: R.minsOf('10:00'), day: day, handled: { a1: true }
  }), null, 'same alert is not handled twice');

  assert.strictEqual(R.walkinCoverReallocate({
    alertId: 'a2', kind: 'walk-in-taken', assignedTo: 'Carl Hadwin',
    team: teamNames, shifts: wk, nowMins: R.minsOf('10:00'), day: day, handled: {}
  }), null, 'someone not on cover taking a walk-in changes nothing');

  assert.strictEqual(R.walkinCoverReallocate({
    alertId: 'a3', kind: 'walk-in', assignedTo: 'Danny Willis',
    team: teamNames, shifts: wk, nowMins: R.minsOf('10:00'), day: day, handled: {}
  }), null, 'a waiting walk-in (not taken) changes nothing');

  assert.strictEqual(R.walkinCoverReallocate({
    alertId: 'a4', kind: 'walk-in-taken', assignedTo: 'Danny Willis',
    team: teamNames, shifts: wk, nowMins: R.minsOf('08:40'), day: day, handled: {}
  }), null, 'outside the active shift window changes nothing');

  const already = { am: { personId: 'danny', status: 'covering', ts: 1, reallocate: { personId: 'danny', ts: 5, by: 'walkin', text: 'Took a walk-in' } } };
  assert.strictEqual(R.walkinCoverReallocate({
    alertId: 'a5', kind: 'walk-in-taken', assignedTo: 'Danny Willis',
    team: teamNames, shifts: wk, nowMins: R.minsOf('10:30'), day: already, handled: {}
  }), null, 'a second walk-in while a reallocate is already queued does not stack');

  const freed = { am: { personId: 'carl', status: 'assigned', ts: 2, declined: { danny: true } } };
  assert.strictEqual(R.walkinCoverReallocate({
    alertId: 'a6', kind: 'walk-in-taken', assignedTo: 'Danny Willis',
    team: teamNames, shifts: wk, nowMins: R.minsOf('10:00'), day: freed, handled: {}
  }), null, 'after they are freed, a later walk-in does not put them back or re-queue');
  const second = { am: { personId: 'carl', status: 'covering', ts: 1 }, am2: { personId: 'danny', status: 'assigned', ts: 1 } };
  const hit2 = R.walkinCoverReallocate({
    alertId: 'a7', kind: 'walk-in-taken', assignedTo: 'Danny Willis',
    team: teamNames, shifts: wk, nowMins: R.minsOf('10:00'), day: second, handled: {}
  });
  assert.ok(hit2 && hit2.shiftId === 'am2', 'the second seat is found too');
  console.log('ok: walk-in taken by the cover person queues one reallocate; other cases do nothing');
}

// the lockup calendar gives the day as a name: Saturday must get Saturday's hours, Sunday none
assert.deepStrictEqual(R.shiftsFor('sat').map(x => x.to), ['12:00', '12:00', '14:00', '14:00', '17:00', '17:00'], 'Saturday hours from the day name');
assert.strictEqual(R.shiftsFor('sun').length, 0);
assert.deepStrictEqual(R.shiftsFor('fri').map(x => x.to), ['12:00', '12:00', '15:00', '15:00', '18:00', '18:00']);
console.log('ok: days given as names get the right hours, Saturday included');

console.log('all reception tests passed');

// public rota: initials only, the stepped off time in London, no names or notes
{
  const team = { tomi: { fullName: 'Tomiwa Adelaja' }, carl: { fullName: 'Carl Smith' } };
  const day = {
    am: { personId: 'tomi', status: 'assigned', ts: 1, note: 'secret' },
    am2: { personId: 'carl', status: 'covering', ts: 1 },
    mid: { personId: 'carl', status: 'declined', ts: Date.UTC(2026, 10, 12, 12, 40) },
    pm: { status: 'short' }
  };
  const rows = R.publicRota(day, '2026-11-12', 4, team);
  assert.deepStrictEqual(rows.map(r => r.initials), ['TA', 'CS', null, null, null, null]);
  assert.deepStrictEqual(rows.map(r => r.shift), ['am', 'am2', 'mid', 'mid2', 'pm', 'pm2']);
  assert.strictEqual(rows[2].status, 'stepped_off');
  assert.strictEqual(rows[2].endedAt, '12:40');
  assert.strictEqual(rows[4].status, 'short');
  assert.ok(!JSON.stringify(rows).includes('Tomiwa') && !JSON.stringify(rows).includes('secret'));
  assert.strictEqual(R.publicRota({}, '2026-11-15', 0, team).length, 0);
  console.log('ok: public rota shows initials, the time a shift was stepped off, and nothing private');
}
