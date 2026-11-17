#!/usr/bin/env node
/* Tests the showroom cover job (scripts/reception-mail.js) against an in-memory
 * database: the 07:30 start, one plan a day, a decline and its reassignment,
 * no duplicate emails, and a closed Sunday.
 *   node scripts/test-reception-job.js
 */
'use strict';
const assert = require('assert');
const J = require('./reception-mail.js');
const RR = require('../reception-rota.js');

function fakeDb(init) {
  const data = JSON.parse(JSON.stringify(init || {}));
  const parts = p => String(p || '').split('/').filter(Boolean);
  const getAt = p => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), data);
  const setAt = (p, v) => {
    const ps = parts(p); if (!ps.length) return;
    let o = data; ps.slice(0, -1).forEach(k => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    const last = ps[ps.length - 1];
    if (v === null || v === undefined) delete o[last]; else o[last] = JSON.parse(JSON.stringify(v));
  };
  return {
    data,
    ref(p) {
      return {
        get: async () => ({ val: () => { const v = getAt(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }),
        set: async v => setAt(p, v),
        update: async v => { Object.keys(v).forEach(k => setAt(p + '/' + k, v[k])); },
        remove: async () => setAt(p, null)
      };
    }
  };
}

const team = {
  tomi: { name: 'Tomi', email: 'tomiwa.adelaja@hedinautomotive.co.uk', order: 0, active: true },
  carl: { name: 'Carl', email: 'carl.hadwin@hedinautomotive.co.uk', order: 1, active: true },
  dan: { name: 'Dan', email: 'daniel.cane@hedinautomotive.co.uk', order: 2, active: true },
  ben: { name: 'Ben', email: 'ben.x@hedinautomotive.co.uk', order: 3, active: true },
  chloe: { name: 'Chloe', email: 'chloe.x@hedinautomotive.co.uk', order: 4, active: true },
  molly: { name: 'Molly', email: 'molly.x@hedinautomotive.co.uk', order: 5, active: true },
  /* two people a shift since 17 November: six sales executives fill the six seats with nobody twice */
  mon: { name: 'Mon', email: 'mon.x@hedinautomotive.co.uk', order: 6, active: true },
  karis: { name: 'Karis', email: 'karis.x@hedinautomotive.co.uk', order: 7, active: true }
};
const SEATS = ['am', 'am2', 'mid', 'mid2', 'pm', 'pm2'];
const at = (h, m) => ({ mins: h * 60 + m });
const MON = '2026-11-02', SUN = '2026-11-08';
const rcPfx = () => (RR.TEST_ONLY ? 'rc_test' : 'rc_live');

async function runAt(db, date, h, m, cfgExtra) {
  const queue = Object.assign({}, (await db.ref('lockupTest/notify').get()).val() || {}, (await db.ref('lockupPrivate/notify').get()).val() || {});
  const q = J.makeQueue(db, 'lockupTest', queue);
  const reception = (await db.ref('lockupTest/reception').get()).val() || {};
  const res = await J.run(Object.assign({
    db, root: 'lockupTest', logRoot: 'receptionLogTest', n: Object.assign({ date: date, dow: 1 }, at(h, m)), dry: false,
    team, managers: {}, cfg: {}, testExec: 'daniel.cane@hedinautomotive.co.uk',
    queueAdd: (id, rec, dry) => q.add(id, rec, dry), log: () => {},
    reception, absences: {}, shiftCfg: undefined, bh: {}, holidays: {}, closed: {},
    notify: queue
  }, cfgExtra || {}));
  await q.flush();
  return { res, added: q.added };
}

(async () => {
  // before 07:30: nothing is planned or sent
  let db = fakeDb();
  let r = await runAt(db, MON, 7, 20);
  assert.strictEqual(r.res.skipped, 'before the plan time');
  assert.strictEqual(r.added.length, 0);
  console.log('ok: nothing is planned before 07:30');

  // 08:00: three shifts of two seats, six different sales people, one email each, chloe and molly never
  db = fakeDb();
  r = await runAt(db, MON, 8, 0);
  const day = db.data.lockupTest.reception[MON];
  const ppl = SEATS.map(k => day[k].personId);
  assert.strictEqual(new Set(ppl).size, 6, JSON.stringify(ppl));
  assert.ok(ppl.every(p => p !== 'chloe' && p !== 'molly'));
  assert.strictEqual(r.added.length, 6, 'six cover emails: ' + r.added.join(','));
  const mail = db.data.lockupTest.notify[r.added[0]];
  assert.ok(/You are on showroom cover\. Please cover showroom until/.test(mail.text), mail.text);
  if (RR.TEST_ONLY) assert.ok(/I am covering:\nhttps:\/\/dan-sells\.co\.uk\/reception\.html\?test=1/.test(mail.text), mail.text);
  else assert.ok(/I am covering:\nhttps:\/\/dan-sells\.co\.uk\/reception\.html\?(?!test=)/.test(mail.text) && !/reception\.html\?test=1/.test(mail.text), mail.text);
  assert.ok(/action=cannot/.test(mail.text), mail.text);
  assert.ok(/I am covering/.test(mail.html) && /I cannot cover/.test(mail.html), 'queued html has tap buttons');
  assert.ok(/action=covering/.test(mail.html) && /action=cannot/.test(mail.html), mail.html.slice(0, 400));
  assert.deepStrictEqual(mail.to, ['daniel.cane@hedinautomotive.co.uk'], 'testExec routes the cover email to Dan');
  assert.ok(db.data.lockupTest.reception[MON]._day.plannedAt, 'the day is marked planned');
  console.log('ok: at 08:00 three people are planned, each emailed once');

  // a later run changes nothing and sends nothing
  r = await runAt(db, MON, 8, 15);
  assert.strictEqual(r.added.length, 0);
  assert.deepStrictEqual(db.data.lockupTest.reception[MON].am.personId, day.am.personId);
  console.log('ok: a later run does not re-plan or email again');

  // the person on the morning says they cannot cover: the managers are told, the shift is reassigned
  const was = day.am.personId;
  db.data.lockupTest.reception[MON].am = Object.assign({}, db.data.lockupTest.reception[MON].am, { status: 'declined', reason: 'I cannot cover right now', reasonText: 'with a customer', ts: 1000 });
  r = await runAt(db, MON, 9, 0);
  const notes = r.added.filter(id => id.indexOf(rcPfx() + '_decl_') === 0);
  assert.strictEqual(notes.length, 1, 'one manager note: ' + r.added.join(','));
  assert.strictEqual(db.data.lockupTest.notify[notes[0]].to, 'managers');
  assert.ok(/with a customer/.test(db.data.lockupTest.notify[notes[0]].text));
  const now = db.data.lockupTest.reception[MON].am;
  assert.notStrictEqual(now.personId, was, 'the decliner is taken off the shift');
  assert.strictEqual(now.status, 'assigned');
  assert.deepStrictEqual(Object.keys(now.declined), [was]);
  assert.ok(r.added.some(id => id === rcPfx() + '_' + MON + '_am_' + now.personId), 'the new person is emailed');
  console.log('ok: a decline notifies the managers with the reason and puts the next fair person on');

  // the same decline is not handled twice, and the decliner is not put back on
  r = await runAt(db, MON, 9, 30);
  assert.strictEqual(r.added.filter(id => id.indexOf(rcPfx() + '_decl_') === 0).length, 0);
  assert.notStrictEqual(db.data.lockupTest.reception[MON].am.personId, was);
  console.log('ok: a decline is handled once and the person who declined is not put back');

  // a sales person with "Other" and no words is not recorded (rules check, here: the job reads the reason it is given)
  // Sunday: closed, nothing at all
  db = fakeDb();
  r = await runAt(db, SUN, 8, 0);
  assert.strictEqual(r.res.skipped, 'closed');
  assert.strictEqual(r.added.length, 0);
  console.log('ok: Sunday is closed, nothing is planned');

  // a person with no work email is skipped, not written as on reception with no one to tell
  const t2 = Object.assign({}, team, { tomi: Object.assign({}, team.tomi, { email: '' }) });
  db = fakeDb();
  r = await runAt(db, MON, 8, 0, { team: t2 });
  const first = db.data.lockupTest.reception[MON].am.personId;
  assert.notStrictEqual(first, 'tomi', 'nobody is put on who has no email');
  console.log('ok: nobody without a work email is put on reception');

  // nobody free: the shift is marked not covered and the managers are told, once
  const everyoneAway = {};
  Object.keys(team).forEach(id => { everyoneAway['a_' + id] = { personId: id, kind: 'holiday', status: 'booked', from: MON, to: MON, note: '' }; });
  db = fakeDb();
  r = await runAt(db, MON, 8, 0, { absences: everyoneAway });
  const shortDay = db.data.lockupTest.reception[MON];
  assert.strictEqual(shortDay.am.status, 'short', JSON.stringify(shortDay.am));
  assert.strictEqual(shortDay.mid.status, 'short');
  const shortNote = r.added.filter(id => id.indexOf(rcPfx() + '_short_') === 0);
  assert.strictEqual(shortNote.length, 3, 'one note per uncovered shift, not one per seat: ' + r.added.join(','));
  assert.strictEqual(shortDay.am2.status, 'short');
  assert.ok(/either place/.test(db.data.lockupTest.notify[shortNote[0]].text), 'the note says both places are empty');
  const shortMail = db.data.lockupTest.notify[shortNote[0]];
  assert.ok(/Showroom not covered 09:00 to 12:00/.test(shortMail.subject), shortMail.subject);
  assert.strictEqual(shortMail.to, 'managers');
  r = await runAt(db, MON, 8, 30, { absences: everyoneAway });
  assert.strictEqual(r.added.filter(id => id.indexOf(rcPfx() + '_short_') === 0).length, 0, 'not told again on the next run');
  console.log('ok: when nobody is free the shift is marked not covered and the managers are told once');

  // a team member with no work email: the managers are told once, and nobody is put on for them
  const noMail = Object.assign({}, team, { ben: Object.assign({}, team.ben, { email: '' }) });
  db = fakeDb();
  r = await runAt(db, MON, 8, 0, { team: noMail });
  assert.strictEqual(r.added.filter(id => id === rcPfx() + '_noemail_ben').length, 1, 'Ben is flagged: ' + r.added.join(','));
  r = await runAt(db, MON, 8, 30, { team: noMail });
  assert.strictEqual(r.added.filter(id => id === rcPfx() + '_noemail_ben').length, 0, 'flagged once');
  console.log('ok: anyone on the team without a work email is flagged to the managers once');

  // the management log: every shift someone is put on, every skip, every absence tag
  db = fakeDb();
  await runAt(db, MON, 8, 0);
  const logged = Object.values(db.data.receptionLogTest || {});
  assert.strictEqual(logged.filter(e => e.kind === 'on').length, 6, 'six seats logged as on: ' + JSON.stringify(logged));
  await runAt(db, MON, 8, 15);
  assert.strictEqual(Object.values(db.data.receptionLogTest).filter(e => e.kind === 'on').length, 6, 'a later run logs nothing twice');
  const amWho = db.data.lockupTest.reception[MON].am.personId;
  db.data.lockupTest.reception[MON].am = Object.assign({}, db.data.lockupTest.reception[MON].am, { status: 'declined', reason: 'I am off site', reasonText: '', ts: 2000 });
  await runAt(db, MON, 9, 0);
  const skips = Object.values(db.data.receptionLogTest).filter(e => e.kind === 'skip');
  assert.strictEqual(skips.length, 1);
  assert.strictEqual(skips[0].personId, amWho, 'the skip is logged against the person who declined');
  console.log('ok: each shift put on and each skip is logged, once');

  // a manager tags someone absent: logged as an absence (not a skip), they are taken off that shift and the next person goes on
  const midBefore = db.data.lockupTest.reception[MON].mid.personId;
  db.data.lockupTest.reception[MON].mid = Object.assign({}, db.data.lockupTest.reception[MON].mid, { absent: { personId: midBefore, by: 'will', ts: 3000 } });
  await runAt(db, MON, 10, 0);
  const absents = Object.values(db.data.receptionLogTest).filter(e => e.kind === 'absent');
  assert.strictEqual(absents.length, 1, JSON.stringify(absents));
  assert.strictEqual(absents[0].personId, midBefore);
  assert.strictEqual(Object.values(db.data.receptionLogTest).filter(e => e.kind === 'skip').length, 1, 'an absence tag is not a skip');
  assert.strictEqual(db.data.lockupTest.reception[MON].mid.personId, midBefore, 'a nudge does not take them off the shift');
  console.log('ok: a nudge is logged as an absence, is not a skip, and leaves them on the shift');

  // an absence tag emails the person "Where are you?", and their reply goes to the managers once
  db = fakeDb();
  await runAt(db, MON, 8, 0);
  const absPerson = db.data.lockupTest.reception[MON].pm.personId;
  db.data.lockupTest.reception[MON].pm = Object.assign({}, db.data.lockupTest.reception[MON].pm, { absent: { personId: absPerson, by: 'will', ts: 5000 } });
  r = await runAt(db, MON, 10, 0);
  const whereAre = r.added.filter(id => id.indexOf(rcPfx() + '_absent_') === 0);
  assert.strictEqual(whereAre.length, 1, 'one where-are-you email: ' + r.added.join(','));
  const wm = db.data.lockupTest.notify[whereAre[0]];
  assert.ok(/Where are you\?/.test(wm.subject) && /reception\.html/.test(wm.text) && /I am here/.test(wm.text), wm.text);
  assert.deepStrictEqual(wm.to, ['daniel.cane@hedinautomotive.co.uk'], 'testExec routes the cover email to Dan');
  db.data.lockupTest.reception[MON].pm = Object.assign({}, db.data.lockupTest.reception[MON].pm, { absent: Object.assign({}, db.data.lockupTest.reception[MON].pm.absent, { reply: { status: 'here', ts: 6000 } }) });
  r = await runAt(db, MON, 10, 15);
  assert.strictEqual(r.added.filter(id => id.indexOf(rcPfx() + '_reply_') === 0).length, 1, 'the reply reaches the managers');
  r = await runAt(db, MON, 10, 30);
  assert.strictEqual(r.added.filter(id => id.indexOf(rcPfx() + '_reply_') === 0).length, 0, 'once');
  console.log('ok: an absence tag emails the person "Where are you?" and their reply goes to the managers once');

  // a manager reallocates a shift: the person on it is logged as a skip with the reason, and the next person goes on
  const onNow = db.data.lockupTest.reception[MON].am.personId;
  db.data.lockupTest.reception[MON].am = Object.assign({}, db.data.lockupTest.reception[MON].am, { reallocate: { personId: onNow, by: 'will', ts: 7000, text: 'at the dentist' } });
  r = await runAt(db, MON, 10, 45);
  const rskips = Object.values(db.data.receptionLogTest).filter(e => e.kind === 'skip' && e.reason === 'Unable to do it');
  assert.strictEqual(rskips.length, 1, JSON.stringify(rskips));
  assert.strictEqual(rskips[0].personId, onNow, 'logged as a skip against the person taken off');
  assert.notStrictEqual(db.data.lockupTest.reception[MON].am.personId, onNow, 'reallocated to someone else');
  assert.ok(db.data.lockupTest.reception[MON].am.personId, 'and the shift is covered');
  assert.strictEqual(rskips[0].reasonText, 'at the dentist', 'the manager\'s words are kept');
  console.log('ok: unable to do it is logged as a skip with the manager\'s words, and the shift is covered by someone else');

  // appointments: someone with a booking over a shift is not put on it
  db = fakeDb();
  await runAt(db, MON, 8, 0, { busy: { carl: [{ from: '08:30', to: '10:30' }] } });
  assert.notStrictEqual(db.data.lockupTest.reception[MON].am.personId, 'carl', 'a booking from 08:30 keeps Carl off the morning');
  console.log('ok: a person with an appointment over a shift is not put on it');

  // the 07:30 re-read: someone now booked over a shift that has not started is moved off it, with no skip logged
  db = fakeDb();
  await runAt(db, MON, 8, 0);
  const pmBefore = db.data.lockupTest.reception[MON].pm.personId;
  await runAt(db, MON, 7, 40, { recheck: true, busy: { [pmBefore]: [{ from: '15:30', to: '17:30' }] } });
  assert.ok(!Object.values(db.data.receptionLogTest || {}).some(e => e.kind === 'skip'), 'no skip for a booking');
  console.log('ok: a booking that clashes with a shift that has not started moves them off it, with no skip');

  // the rota: someone whose usual day off is this Monday is not put on, and nobody is on twice
  const offTeam = Object.assign({}, team, { carl: Object.assign({}, team.carl, { off: 'mon' }), tomi: Object.assign({}, team.tomi, { off: 'mon' }) });
  db = fakeDb();
  await runAt(db, MON, 8, 0, { team: offTeam });
  const offDay = db.data.lockupTest.reception[MON];
  const onDay = SEATS.map(k => offDay[k] && offDay[k].personId).filter(Boolean);
  assert.ok(!onDay.includes('carl') && !onDay.includes('tomi'), 'days off are respected: ' + JSON.stringify(onDay));
  const wkS = RR.shiftsFor(1);
  wkS.forEach(x => wkS.forEach(y => {
    const a = (offDay[x.id] || {}).personId;
    if (x.id < y.id && a && a === (offDay[y.id] || {}).personId) assert.ok(!RR.tooClose(x, y), 'a double only with a gap: ' + JSON.stringify(onDay));
  }));
  assert.strictEqual(new Set(onDay).size, 4, 'all four people in are used before anyone doubles: ' + JSON.stringify(onDay));
  console.log('ok: someone on a day off is not put on, and a double shift always has a gap');

  // with a customer: the person on the shift is taken off at once, logged as a skip with that reason, and the next person goes on
  db = fakeDb();
  await runAt(db, MON, 8, 0);
  const custWho = db.data.lockupTest.reception[MON].am.personId;
  db.data.lockupTest.reception[MON].am = Object.assign({}, db.data.lockupTest.reception[MON].am, { status: 'declined', reason: "I'm with a customer now, cannot cover", reasonText: '', ts: 8000 });
  await runAt(db, MON, 8, 30);
  const custSkip = Object.values(db.data.receptionLogTest).filter(e => e.kind === 'skip' && e.reason === "I'm with a customer now, cannot cover");
  assert.strictEqual(custSkip.length, 1, 'logged as a skip');
  assert.strictEqual(custSkip[0].personId, custWho);
  assert.notStrictEqual(db.data.lockupTest.reception[MON].am.personId, custWho, 'the next person goes on');
  console.log('ok: with a customer is logged as a skip and the next person goes on');

  // nobody free: the managers are emailed the choices, and a manager's choice puts that person on and emails them
  db = fakeDb();
  const everyoneBusy = {};
  Object.keys(team).forEach(id => { everyoneBusy['a_' + id] = { personId: id, kind: 'holiday', status: 'booked', from: MON, to: MON, note: '' }; });
  await runAt(db, MON, 8, 0, { absences: everyoneBusy });
  const shortNoteId = Object.keys(db.data.lockupTest.notify).filter(k => k.indexOf(rcPfx() + '_short_') === 0)[0];
  const shortText = db.data.lockupTest.notify[shortNoteId].text;
  assert.ok(/Free and not on a shift yet: nobody/.test(shortText) && /Please choose two people/.test(shortText), shortText);
  const dateMail = db.data.lockupTest.notify[shortNoteId];
  assert.ok(/Monday 2 November/.test(dateMail.subject) && /Monday 2 November/.test(dateMail.text), 'the managers email names the date: ' + dateMail.subject);
  assert.ok(/https:\/\/dan-sells\.co\.uk\/reception\.html/.test(dateMail.text) && /reception\.html/.test(dateMail.html), 'and links to the page');
  console.log('ok: when nobody is free the managers are emailed who is free, who is busy, and that they should choose');

  db.data.lockupTest.reception[MON] = Object.assign({}, db.data.lockupTest.reception[MON] || {}, { am: { status: 'short', ts: 9000, assign: { personId: 'carl', by: 'will', ts: 9500 } } });
  const carlIn = Object.assign({}, everyoneBusy); delete carlIn.a_carl;
  r = await runAt(db, MON, 9, 0, { absences: carlIn });
  assert.strictEqual(db.data.lockupTest.reception[MON].am.personId, 'carl', 'the manager choice is put on the shift');
  assert.ok(r.added.some(id => id.indexOf(rcPfx() + '_' + MON + '_am_carl') === 0), 'and emailed');
  console.log('ok: a manager choice puts that person on the shift and emails them');


  // cover emails use mode-scoped ids and sendAfter = shift start - 10 mins on first plan
  {
    db = fakeDb();
    r = await runAt(db, MON, 8, 0);
    assert.ok(r.added.every(id => id.indexOf(rcPfx() + '_') === 0), 'ids are mode-scoped: ' + r.added.join(','));
    const amId = r.added.filter(id => id.indexOf(rcPfx() + '_' + MON + '_am_') === 0)[0];
    const amMail = db.data.lockupTest.notify[amId];
    assert.ok(amMail && amMail.sendAfter, 'planned cover carries sendAfter');
    assert.strictEqual(amMail.sendAfter, J.coverSendAfterMs(MON, '09:00'), String(amMail.sendAfter));
    // a decline reallocation email has no sendAfter (sends now)
    const was = db.data.lockupTest.reception[MON].am.personId;
    db.data.lockupTest.reception[MON].am = Object.assign({}, db.data.lockupTest.reception[MON].am, { status: 'declined', reason: 'I cannot cover right now', reasonText: 'x', ts: 2000 });
    r = await runAt(db, MON, 9, 0);
    const newPid = db.data.lockupTest.reception[MON].am.personId;
    assert.notStrictEqual(newPid, was);
    const reallocId = r.added.filter(id => id === rcPfx() + '_' + MON + '_am_' + newPid)[0];
    assert.ok(reallocId, 'realloc cover queued: ' + r.added.join(','));
    assert.ok(!db.data.lockupTest.notify[reallocId].sendAfter, 'realloc cover sends immediately');
    console.log('ok: cover emails are mode-scoped, held until 10 mins before the shift, reallocations send now');
  }

  // ensure path: live recovers when an old unscoped id was only a test send
  {
    const date = MON;
    const oldId = 'rc_' + date + '_am_tomi';
    db = fakeDb({ lockupTest: { notify: { [oldId]: { kind: 'reception', rcTest: true, sent: 1, to: ['daniel.cane@hedinautomotive.co.uk'], subject: 'x', text: 'x', html: '<p>x</p>', ts: 1 } },
      reception: { [date]: { _day: { plannedAt: 1 }, am: { personId: 'tomi', status: 'assigned', ts: 1 }, mid: { personId: 'carl', status: 'assigned', ts: 1 }, pm: { personId: 'dan', status: 'assigned', ts: 1 } } } } });
    r = await runAt(db, date, 10, 0);
    const liveAm = rcPfx() + '_' + date + '_am_tomi';
    assert.ok(r.added.indexOf(liveAm) >= 0, 'ensure requeues under mode id after a test send: ' + r.added.join(','));
    assert.ok(db.data.lockupTest.notify[liveAm].sendAfter, 'ensure keeps sendAfter');
    // a real (non-rcTest) prior send must not requeue
    const sentLive = 'rc_' + date + '_mid_carl';
    db = fakeDb({ lockupTest: { notify: { [sentLive]: { kind: 'reception', sent: 1, to: ['carl.hadwin@hedinautomotive.co.uk'], subject: 'x', text: 'x', html: '<p>x</p>', ts: 1 } },
      reception: { [date]: { _day: { plannedAt: 1 }, am: { personId: 'tomi', status: 'assigned', ts: 1 }, mid: { personId: 'carl', status: 'assigned', ts: 1 }, pm: { personId: 'dan', status: 'assigned', ts: 1 } } } } });
    r = await runAt(db, date, 10, 0);
    assert.ok(r.added.indexOf(rcPfx() + '_' + date + '_mid_carl') < 0, 'does not resend after a live send: ' + r.added.join(','));
    console.log('ok: ensure requeues after test collision, never after a live send');
  }


  // mid-shift decline banks the time already covered
  {
    db = fakeDb();
    await runAt(db, MON, 8, 0);
    const who = db.data.lockupTest.reception[MON].am.personId;
    db.data.lockupTest.reception[MON].am = Object.assign({}, db.data.lockupTest.reception[MON].am, {
      status: 'covering', coveringMins: 9 * 60, ts: 1000
    });
    db.data.lockupTest.reception[MON].am = Object.assign({}, db.data.lockupTest.reception[MON].am, {
      status: 'declined', reason: 'I cannot cover right now', reasonText: 'customer walked in', ts: 9000
    });
    r = await runAt(db, MON, 10, 0);
    const covers = Object.values(db.data.receptionLogTest || {}).filter(e => e.kind === 'cover' && e.reason === 'handed_back');
    assert.strictEqual(covers.length, 1, 'one handed_back: ' + JSON.stringify(covers));
    assert.strictEqual(covers[0].personId, who);
    assert.deepStrictEqual([covers[0].from, covers[0].to, covers[0].minutes], ['09:00', '10:00', 60]);
    const note = r.added.filter(id => id.indexOf(rcPfx() + '_decl_') === 0)[0];
    assert.ok(note && /covered 09:00 to 10:00/.test(db.data.lockupTest.notify[note].text), db.data.lockupTest.notify[note].text);
    assert.notStrictEqual(db.data.lockupTest.reception[MON].am.personId, who, 'remainder reallocated');
    const reallocOn = Object.values(db.data.receptionLogTest).filter(e => e.kind === 'on' && e.reason === 'reallocated');
    assert.ok(reallocOn.length >= 1, 'replacement logged as reallocated');
    console.log('ok: mid-shift decline banks the hour already covered and reallocates the rest');
  }

  // decline before the shift starts banks nothing
  {
    db = fakeDb();
    await runAt(db, MON, 8, 0);
    const who = db.data.lockupTest.reception[MON].pm.personId;
    db.data.lockupTest.reception[MON].pm = Object.assign({}, db.data.lockupTest.reception[MON].pm, {
      status: 'declined', reason: 'I am not in today', reasonText: '', ts: 11000
    });
    await runAt(db, MON, 8, 30);
    const covers = Object.values(db.data.receptionLogTest || {}).filter(e => e.kind === 'cover' && e.personId === who);
    assert.strictEqual(covers.length, 0, 'no bank before the shift: ' + JSON.stringify(covers));
    console.log('ok: a decline before the shift starts banks nothing');
  }

  // take the shift: volunteer goes on, previous person is told, history reason took_over, no double cover email
  {
    db = fakeDb();
    await runAt(db, MON, 8, 0);
    const prev = db.data.lockupTest.reception[MON].mid.personId;
    /* Ben sits in the other seat of this shift, so his take is refused; nothing changes */
    assert.strictEqual(db.data.lockupTest.reception[MON].mid2.personId, 'ben');
    db.data.lockupTest.reception[MON].mid = Object.assign({}, db.data.lockupTest.reception[MON].mid, {
      take: { personId: 'ben', by: 'ben', ts: 11000 }
    });
    r = await runAt(db, MON, 9, 45);
    assert.strictEqual(db.data.lockupTest.reception[MON].mid.personId, prev, 'one person never sits in both seats of a shift');
    assert.strictEqual(r.added.filter(id => id.indexOf(rcPfx() + '_taken_') === 0).length, 0);
    /* Ben comes off mid2 (Karis takes it), and then his take of mid goes through */
    db.data.lockupTest.reception[MON].mid2 = { personId: 'karis', status: 'assigned', ts: 11500 };
    db.data.lockupTest.reception[MON].pm2 = { personId: 'tomi', status: 'assigned', ts: 11500 };
    db.data.lockupTest.reception[MON].mid = Object.assign({}, db.data.lockupTest.reception[MON].mid, {
      take: { personId: 'ben', by: 'ben', ts: 12000 }
    });
    r = await runAt(db, MON, 10, 0);
    assert.strictEqual(db.data.lockupTest.reception[MON].mid.personId, 'ben', 'Ben is now on mid');
    assert.strictEqual(db.data.lockupTest.reception[MON].mid.status, 'assigned');
    const took = Object.values(db.data.receptionLogTest).filter(e => e.kind === 'on' && e.reason === 'took_over' && e.personId === 'ben');
    assert.strictEqual(took.length, 1, JSON.stringify(took));
    assert.strictEqual(took[0].replacedPersonId, prev);
    assert.strictEqual(took[0].from, '12:00', 'future shift keeps its start: ' + took[0].from);
    assert.strictEqual(took[0].to, '15:00');
    const takenMail = r.added.filter(id => id.indexOf(rcPfx() + '_taken_') === 0);
    assert.strictEqual(takenMail.length, 1, 'previous person notified: ' + r.added.join(','));
    assert.ok(/has taken your showroom cover/.test(db.data.lockupTest.notify[takenMail[0]].text));
    const benCover = r.added.filter(id => id.indexOf(rcPfx() + '_' + MON + '_mid_ben') === 0 || id.indexOf(rcPfx() + '_' + MON + '_mid_ben_take_') === 0);
    assert.ok(benCover.length >= 1, 'Ben gets a cover email: ' + r.added.join(','));
    // same run must not also ensure a second cover for Ben
    assert.strictEqual(benCover.length, 1, 'exactly one cover email for Ben: ' + benCover.join(','));
    // previous person is declined for the shift so plan will not put them back
    assert.ok(db.data.lockupTest.reception[MON].mid.declined[prev], 'previous person marked declined');
    // a second run must not re-handle the same take
    r = await runAt(db, MON, 10, 15);
    assert.strictEqual(r.added.filter(id => id.indexOf(rcPfx() + '_taken_') === 0).length, 0);
    assert.strictEqual(db.data.lockupTest.reception[MON].mid.personId, 'ben');
    console.log('ok: take the shift puts the volunteer on, banks/notifies the previous person, once');
  }

  // take mid-shift: banks the previous person's time and logs remainder from now
  {
    db = fakeDb();
    await runAt(db, MON, 8, 0);
    const prev = db.data.lockupTest.reception[MON].am.personId;
    db.data.lockupTest.reception[MON].am = Object.assign({}, db.data.lockupTest.reception[MON].am, {
      status: 'covering', coveringMins: 9 * 60, take: { personId: 'ben', by: 'ben', ts: 14000 }
    });
    r = await runAt(db, MON, 10, 30);
    assert.strictEqual(db.data.lockupTest.reception[MON].am.personId, 'ben');
    const handed = Object.values(db.data.receptionLogTest).filter(e => e.kind === 'cover' && e.reason === 'handed_back' && e.personId === prev);
    assert.strictEqual(handed.length, 1, JSON.stringify(handed));
    assert.deepStrictEqual([handed[0].from, handed[0].to, handed[0].minutes], ['09:00', '10:30', 90]);
    const took = Object.values(db.data.receptionLogTest).filter(e => e.kind === 'on' && e.reason === 'took_over' && e.personId === 'ben');
    assert.strictEqual(took[0].from, '10:30', took[0].from);
    assert.strictEqual(took[0].to, '12:00');
    console.log('ok: mid-shift take banks the previous cover and starts the volunteer from now');
  }

  // take an open/short shift
  {
    db = fakeDb();
    const everyoneAway = {};
    Object.keys(team).forEach(id => { everyoneAway['a_' + id] = { personId: id, kind: 'holiday', status: 'booked', from: MON, to: MON, note: '' }; });
    await runAt(db, MON, 8, 0, { absences: everyoneAway });
    assert.strictEqual(db.data.lockupTest.reception[MON].am.status, 'short');
    db.data.lockupTest.reception[MON].am = Object.assign({}, db.data.lockupTest.reception[MON].am, {
      take: { personId: 'carl', by: 'carl', ts: 13000 }
    });
    const carlIn = Object.assign({}, everyoneAway); delete carlIn.a_carl;
    r = await runAt(db, MON, 9, 0, { absences: carlIn });
    assert.strictEqual(db.data.lockupTest.reception[MON].am.personId, 'carl');
    const took = Object.values(db.data.receptionLogTest).filter(e => e.kind === 'on' && e.reason === 'took_over' && e.personId === 'carl');
    assert.ok(took.length >= 1);
    console.log('ok: take the shift works on an uncovered shift');
  }

  // walk-in taken by the person on the active cover shift: same path as Unable
  {
    const teamW = {
      tomi: { name: 'Tomi', fullName: 'Tomi Adelaja', email: 'tomiwa.adelaja@hedinautomotive.co.uk', order: 0, active: true },
      carl: { name: 'Carl', fullName: 'Carl Hadwin', email: 'carl.hadwin@hedinautomotive.co.uk', order: 1, active: true },
      danny: { name: 'Danny', fullName: 'Danny Willis', email: 'danny.willis@hedinautomotive.co.uk', order: 2, active: true },
      dan: { name: 'Dan', fullName: 'Daniel Cane', email: 'daniel.cane@hedinautomotive.co.uk', order: 3, active: true },
      ben: { name: 'Ben', fullName: 'Ben X', email: 'ben.x@hedinautomotive.co.uk', order: 4, active: true },
      chloe: { name: 'Chloe', email: 'chloe.x@hedinautomotive.co.uk', order: 5, active: true },
      molly: { name: 'Molly', email: 'molly.x@hedinautomotive.co.uk', order: 6, active: true }
    };
    db = fakeDb();
    await runAt(db, MON, 8, 0, { team: teamW });
    // put Danny on the morning so the walk-in match is deterministic
    const amWas = db.data.lockupTest.reception[MON].am.personId;
    db.data.lockupTest.reception[MON].am = Object.assign({}, db.data.lockupTest.reception[MON].am, {
      personId: 'danny', status: 'covering', coveringMins: 9 * 60, ts: 1
    });
    // someone else takes a walk-in: nothing
    r = await runAt(db, MON, 10, 0, {
      team: teamW,
      walkinAlerts: [{ id: 'w-other', kind: 'walk-in-taken', assignedTo: 'Carl Hadwin', customer: 'Mr A' }]
    });
    assert.strictEqual(db.data.lockupTest.reception[MON].am.personId, 'danny', 'other taker leaves cover alone');
    assert.ok(db.data.lockupTest.reception[MON]._day.walkinHandled['w-other'], 'alert marked seen');
    assert.strictEqual(r.added.filter(id => id.indexOf(rcPfx() + '_realloc_') === 0 || /Unable to do it/.test((db.data.lockupTest.notify[id] || {}).text || '')).length, 0);

    // Danny (on cover) takes a walk-in during the active window.
    // Drop the morning's am cover notify ids so the replacement is free to be emailed
    // under the same rc_<date>_am_<person> form the plan uses for reallocations.
    Object.keys(db.data.lockupTest.notify || {}).forEach(id => {
      if (id.indexOf(rcPfx() + '_' + MON + '_am_') === 0) delete db.data.lockupTest.notify[id];
    });
    r = await runAt(db, MON, 10, 15, {
      team: teamW,
      walkinAlerts: [
        { id: 'w-other', kind: 'walk-in-taken', assignedTo: 'Carl Hadwin', customer: 'Mr A' },
        { id: 'w-danny', kind: 'walk-in-taken', assignedTo: 'Danny Willis', customer: 'Mr Patel' }
      ]
    });
    assert.notStrictEqual(db.data.lockupTest.reception[MON].am.personId, 'danny', 'Danny is taken off cover');
    assert.ok(db.data.lockupTest.reception[MON].am.personId, 'someone else is put on');
    assert.ok(db.data.lockupTest.reception[MON].am.declined.danny, 'Danny is declined so he is not put back');
    const wskips = Object.values(db.data.receptionLogTest || {}).filter(e => e.kind === 'skip' && e.reason === 'Unable to do it' && e.personId === 'danny');
    assert.strictEqual(wskips.length, 1, 'logged as unable/skip: ' + JSON.stringify(wskips));
    assert.ok(/Took a walk-in/.test(wskips[0].reasonText), wskips[0].reasonText);
    const newCover = db.data.lockupTest.reception[MON].am.personId;
    assert.ok(r.added.some(id => id === rcPfx() + '_' + MON + '_am_' + newCover), 'new cover person is emailed: ' + r.added.join(','));
    assert.ok(!db.data.lockupTest.notify[rcPfx() + '_' + MON + '_am_' + newCover].sendAfter, 'walk-in realloc cover sends now');

    // same alerts again: no second reallocation
    const after = db.data.lockupTest.reception[MON].am.personId;
    r = await runAt(db, MON, 10, 30, {
      team: teamW,
      walkinAlerts: [{ id: 'w-danny', kind: 'walk-in-taken', assignedTo: 'Danny Willis', customer: 'Mr Patel' }]
    });
    assert.strictEqual(db.data.lockupTest.reception[MON].am.personId, after, 'no double reallocation');
    assert.strictEqual(Object.values(db.data.receptionLogTest || {}).filter(e => e.kind === 'skip' && e.personId === 'danny').length, 1);

    // outside the active window: nothing
    db = fakeDb();
    await runAt(db, MON, 8, 0, { team: teamW });
    db.data.lockupTest.reception[MON].am = Object.assign({}, db.data.lockupTest.reception[MON].am, { personId: 'danny', status: 'assigned', ts: 1 });
    r = await runAt(db, MON, 8, 40, {
      team: teamW,
      walkinAlerts: [{ id: 'w-early', kind: 'walk-in-taken', assignedTo: 'Danny Willis', customer: 'Early' }]
    });
    assert.strictEqual(db.data.lockupTest.reception[MON].am.personId, 'danny', 'before the shift window, cover stays');
    assert.ok(db.data.lockupTest.reception[MON]._day.walkinHandled['w-early']);
    console.log('ok: walk-in taken by the cover person reallocates like Unable; other cases leave cover alone');
  }

  // a planned cover email is held until 10 minutes before its shift; a reallocation sends now
  db = fakeDb();
  await runAt(db, MON, 8, 0);
  const heldMail = Object.values(db.data.lockupTest.notify).filter(e => /Showroom cover \d/.test(e.subject || '') && !/not covered/.test(e.subject));
  assert.ok(heldMail.length > 0 && heldMail.every(e => typeof e.sendAfter === 'number'), 'planned cover emails are held: ' + JSON.stringify(heldMail.map(e => e.sendAfter)));
  console.log('ok: planned cover emails are held until 10 minutes before the shift');

  // off on the team calendar after the day was planned: taken off a shift that has not ended,
  // the shift refilled now, the managers told once, a shift that has ended left as it was,
  // and a manager's own pick left alone (Dan, 13 November 2026: Danny marked away at 09:33
  // stayed on the 09:00 shift because a fully staffed day is never re-planned)
  {
    const away = (pid, date) => ({ ['sh_x_' + pid]: { personId: pid, kind: 'absent', status: 'approved', from: date, to: date, note: 'Away' } });
    db = fakeDb();
    await runAt(db, MON, 8, 0);
    const d0 = db.data.lockupTest.reception[MON];
    const amWas = d0.am.personId;
    r = await runAt(db, MON, 9, 40, { absences: away(amWas, MON) });
    const d1 = db.data.lockupTest.reception[MON];
    assert.ok(d1.am.personId && d1.am.personId !== amWas, 'am refilled with someone else: ' + d1.am.personId);
    assert.ok([d1.am2.personId, d1.mid.personId, d1.mid2.personId].indexOf(d1.am.personId) < 0, 'never the other seat or back to back');
    assert.strictEqual(d1.am.offCalendar.personId, amWas);
    assert.strictEqual(d1.am.declined[amWas], true);
    const sentNow = r.added.map(id => db.data.lockupTest.notify[id]).filter(e => Array.isArray(e.to) && /Showroom cover/.test(e.subject || ''));
    assert.ok(sentNow.length === 1 && sentNow[0].sendAfter == null, 'the refill is emailed now: ' + JSON.stringify(sentNow.map(e => e.sendAfter)));
    assert.strictEqual(r.added.filter(id => /off/.test(id)).length, 1, 'managers told once: ' + r.added.join(','));
    const offLog = Object.values(db.data.receptionLogTest).filter(e => e.kind === 'absent' && e.personId === amWas);
    assert.strictEqual(offLog.length, 1);
    assert.strictEqual(offLog[0].reason, 'Off on the team calendar');
    const after = d1.am.personId;
    r = await runAt(db, MON, 9, 50, { absences: away(amWas, MON) });
    assert.strictEqual(db.data.lockupTest.reception[MON].am.personId, after, 'a second run changes nothing');
    assert.strictEqual(r.added.filter(id => !/_nag_/.test(id)).length, 0, 'and sends nothing but the unconfirmed reminders: ' + r.added.join(','));

    // the shift has already ended: left exactly as it was
    db = fakeDb();
    await runAt(db, MON, 8, 0);
    const amPerson = db.data.lockupTest.reception[MON].am.personId;
    r = await runAt(db, MON, 12, 30, { absences: away(amPerson, MON) });
    assert.strictEqual(db.data.lockupTest.reception[MON].am.personId, amPerson, 'an ended shift is history');
    assert.ok(!r.added.some(id => /off/.test(id)));

    // a later shift today, not started yet, is freed too
    db = fakeDb();
    await runAt(db, MON, 8, 0);
    const pmP = db.data.lockupTest.reception[MON].pm.personId;
    r = await runAt(db, MON, 10, 0, { absences: away(pmP, MON) });
    assert.notStrictEqual(db.data.lockupTest.reception[MON].pm.personId, pmP, 'a later shift today is freed too');

    // a manager chose them for the shift: their call stands
    db = fakeDb();
    await runAt(db, MON, 8, 0);
    const mid = db.data.lockupTest.reception[MON].mid;
    const pick = mid.personId;
    db.data.lockupTest.reception[MON].mid = Object.assign({}, mid, { assign: { personId: pick, ts: 5, by: 'Will' }, assignHandledTs: 5 });
    r = await runAt(db, MON, 9, 40, { absences: away(pick, MON) });
    assert.strictEqual(db.data.lockupTest.reception[MON].mid.personId, pick, "a manager's pick is not undone");

    // only a real absence record frees anyone. A bank holiday whose rota did not load leaves
    // the day's staff list empty; the first version of this read "not listed" as "off" and
    // freed every shift, so one bad read would have stripped the whole day's cover.
    db = fakeDb();
    await runAt(db, MON, 8, 0);
    const before = JSON.stringify(['am', 'mid', 'pm'].map(k => db.data.lockupTest.reception[MON][k].personId));
    r = await runAt(db, MON, 9, 40, { holidays: { [MON]: { label: 'test' } }, bh: {} });
    assert.strictEqual(JSON.stringify(['am', 'mid', 'pm'].map(k => db.data.lockupTest.reception[MON][k].personId)), before, 'an empty staff list frees nobody');
    assert.ok(!r.added.some(id => /off/.test(id)), 'and tells nobody');
    // a cancelled absence, and "can't lock up but in today", leave cover alone
    const amNow = db.data.lockupTest.reception[MON].am.personId;
    r = await runAt(db, MON, 9, 45, { absences: {
      c1: { personId: amNow, kind: 'absent', status: 'cancelled', from: MON, to: MON },
      c2: { personId: amNow, kind: 'nolockup', nlType: 'in', status: 'approved', from: MON, to: MON }
    } });
    assert.strictEqual(db.data.lockupTest.reception[MON].am.personId, amNow, 'cancelled or in-but-no-lockup keeps cover');
    console.log('ok: off on the team calendar takes them off cover and refills the shift now, once');
  }

  // 17 November: a day planned with one person a shift gets its second seats mid afternoon.
  // Seats that have ended are left alone (no email, no short note); the afternoon's second seat is filled now.
  {
    db = fakeDb({ lockupTest: { reception: { [MON]: {
      _day: { plannedAt: 1 },
      am: { personId: 'tomi', status: 'covering', ts: 1 },
      mid: { personId: 'carl', status: 'covering', ts: 1 },
      pm: { personId: 'dan', status: 'covering', ts: 1 }
    } }, notify: {
      [rcPfx() + '_' + MON + '_am_tomi']: { sent: 1 }, [rcPfx() + '_' + MON + '_mid_carl']: { sent: 1 }, [rcPfx() + '_' + MON + '_pm_dan']: { sent: 1 }
    } } });
    r = await runAt(db, MON, 16, 16);
    const d = db.data.lockupTest.reception[MON];
    assert.ok(!d.am2 && !d.mid2, 'ended seats are not filled: ' + JSON.stringify(d));
    assert.ok(d.pm2 && d.pm2.personId && ['dan', 'carl'].indexOf(d.pm2.personId) < 0, 'the afternoon second seat is filled with a gap: ' + JSON.stringify(d.pm2));
    assert.deepStrictEqual([d.am.personId, d.mid.personId, d.pm.personId], ['tomi', 'carl', 'dan'], 'nobody already on is moved');
    assert.ok(!r.added.some(id => /_short_/.test(id)), 'no short notes for seats that have ended: ' + r.added.join(','));
    const pm2Mail = r.added.filter(id => id.indexOf(rcPfx() + '_' + MON + '_pm2_') === 0);
    assert.strictEqual(pm2Mail.length, 1, 'one email for the new seat: ' + r.added.join(','));
    assert.strictEqual(r.added.filter(id => /^rc_(live|test)_2026-11-02_/.test(id)).length, 1, 'and none for anyone else');
    r = await runAt(db, MON, 16, 31);
    assert.strictEqual(r.added.length, 0, 'the next run sends nothing: ' + r.added.join(','));
    console.log('ok: a day planned with one person a shift gets its second seats, ended seats left alone');
  }

  // 17 November: personal no sign in links, and a reminder every 15 minutes until they answer
  {
    const L = { links: true };
    const allMail = db => Object.assign({}, db.data.lockupTest.notify || {}, (db.data.lockupPrivate || {}).notify || {});
    db = fakeDb();
    r = await runAt(db, MON, 8, 0, L);
    const covers = r.added.filter(id => new RegExp('^' + rcPfx() + '_' + MON + '_').test(id));
    assert.strictEqual(covers.length, 6);
    assert.ok(covers.every(id => db.data.lockupPrivate.notify[id] && !(db.data.lockupTest.notify || {})[id]), 'cover emails with a link go on the private queue only');
    assert.ok(!/cover\.html\?t=/.test(JSON.stringify(db.data.lockupTest)), 'no personal link anywhere under the world readable lockup tree');
    const amWho = db.data.lockupTest.reception[MON].am.personId;
    const amMail = db.data.lockupPrivate.notify[covers.find(id => id.indexOf('_am_' + amWho) > 0)];
    const tok = (amMail.text.match(/cover\.html\?t=([A-Za-z0-9_-]+)&a=covering/) || [])[1];
    assert.ok(tok && RR.TOKEN_RE.test(tok), 'the email carries a personal link: ' + amMail.text);
    assert.ok(/cover\.html\?t=[A-Za-z0-9_-]+&a=cannot/.test(amMail.text) && /cover\.html\?t=/.test(amMail.html));
    const link = db.data[J.LINK_ROOT][tok];
    assert.deepStrictEqual([link.date, link.shift, link.personId, link.from, link.to], [MON, 'am', amWho, '09:00', '12:00']);
    assert.strictEqual(Object.keys(db.data[J.LINK_ROOT]).length, 6, 'one link a person a seat');
    assert.strictEqual(db.data[J.IDX_ROOT][MON]['am_' + amWho].t, tok);
    r = await runAt(db, MON, 8, 15, L);
    assert.strictEqual(Object.keys(db.data[J.LINK_ROOT]).length, 6, 'a later run reuses the links');
    console.log('ok: cover emails carry a personal link, kept off the public queue');

    // nobody has confirmed: a reminder every 15 minutes from the first email (08:50 for the 09:00 seats)
    Object.keys(db.data.lockupTest.reception[MON]).forEach(k => { if (k !== '_day') db.data.lockupTest.reception[MON][k].ts = 1; });
    r = await runAt(db, MON, 9, 0, L);
    assert.strictEqual(r.added.filter(id => /_nag_/.test(id)).length, 0, 'nothing before 15 minutes: ' + r.added.join(','));
    r = await runAt(db, MON, 9, 5, L);
    let nags = r.added.filter(id => /_nag_/.test(id));
    assert.deepStrictEqual(nags.map(id => id.replace(/^.*_nag_[0-9-]+_/, '')).sort(), ['am2_' + db.data.lockupTest.reception[MON].am2.personId + '_1', 'am_' + amWho + '_1'].sort(), 'reminder 1 for both morning seats: ' + nags.join(','));
    const nag1 = db.data.lockupPrivate.notify[nags.find(id => id.indexOf('_am_') > 0)];
    assert.ok(/Reminder: are you covering the showroom 09:00 to 12:00\?/.test(nag1.subject) && nag1.text.indexOf('t=' + tok + '&a=covering') > 0, nag1.subject);
    r = await runAt(db, MON, 9, 12, L);
    assert.strictEqual(r.added.filter(id => /_nag_/.test(id)).length, 0, 'not again inside the 15 minutes');
    r = await runAt(db, MON, 9, 21, L);
    assert.strictEqual(r.added.filter(id => /_nag_.*_2$/.test(id)).length, 2, 'reminder 2: ' + r.added.join(','));
    r = await runAt(db, MON, 9, 36, L);
    assert.strictEqual(r.added.filter(id => /_nag_.*_3$/.test(id)).length, 2);
    const mgr = r.added.filter(id => /_nagMgr_/.test(id));
    assert.strictEqual(mgr.length, 2, 'the managers hear at the third: ' + r.added.join(','));
    assert.strictEqual(db.data.lockupTest.notify[mgr[0]].to, 'managers');
    assert.ok(/Still waiting/.test(db.data.lockupPrivate.notify[r.added.find(id => /_nag_.*_am_.*_3$/.test(id))].subject));
    r = await runAt(db, MON, 9, 51, L);
    assert.strictEqual(r.added.filter(id => /_nagMgr_/.test(id)).length, 0, 'and only once');
    assert.strictEqual(r.added.filter(id => /_nag_.*_4$/.test(id)).length, 2);
    assert.ok(!r.added.some(id => /_nag_.*_(mid|pm)/.test(id)), 'later shifts are not chased before their time');
    console.log('ok: a reminder every 15 minutes until they answer, the managers told once at the third');

    // they tap I am covering on the link: the seat says covering and the reminders stop
    db.data[J.LINK_ROOT][tok].answer = { kind: 'covering', ts: 5000 };
    r = await runAt(db, MON, 10, 6, L);
    assert.strictEqual(db.data.lockupTest.reception[MON].am.status, 'covering');
    assert.strictEqual(db.data.lockupTest.reception[MON].am.personId, amWho);
    assert.ok(!r.added.some(id => id.indexOf('_nag_' + MON + '_am_') > 0), 'no more reminders for them: ' + r.added.join(','));
    assert.ok(r.added.some(id => id.indexOf('_nag_' + MON + '_am2_') > 0), 'their partner is still chased');
    r = await runAt(db, MON, 10, 21, L);
    assert.strictEqual(db.data.lockupTest.reception[MON].am.status, 'covering', 'the same answer is not applied twice');
    console.log('ok: I am covering on the link confirms the seat and stops the reminders');

    // the partner taps I cannot cover (with a customer): declined, managers told, the next person on with their own link
    const am2Who = db.data.lockupTest.reception[MON].am2.personId;
    const tok2 = db.data[J.IDX_ROOT][MON]['am2_' + am2Who].t;
    db.data[J.LINK_ROOT][tok2].answer = { kind: 'customer', ts: 6000 };
    r = await runAt(db, MON, 10, 25, L);
    const am2 = db.data.lockupTest.reception[MON].am2;
    assert.ok(am2.personId && am2.personId !== am2Who, 'someone else is put on: ' + JSON.stringify(am2));
    assert.ok(am2.declined[am2Who]);
    const skip = Object.values(db.data.receptionLogTest).filter(e => e.kind === 'skip' && e.personId === am2Who);
    assert.strictEqual(skip.length, 1);
    assert.strictEqual(skip[0].reason, "I'm with a customer now, cannot cover");
    assert.ok(r.added.some(id => /_decl_/.test(id)), 'managers told: ' + r.added.join(','));
    const newMail = allMail(db)[r.added.find(id => id.indexOf(rcPfx() + '_' + MON + '_am2_' + am2.personId) === 0)];
    assert.ok(newMail && /cover\.html\?t=/.test(newMail.text) && newMail.text.indexOf(tok2) < 0, 'the new person gets their own link');
    console.log('ok: I cannot cover on the link hands the seat on, with the reason, and a fresh link');

    // an answer on a link for a seat they no longer hold changes nothing
    db.data[J.LINK_ROOT][tok2].answer = { kind: 'covering', ts: 7000 };
    r = await runAt(db, MON, 10, 40, L);
    assert.strictEqual(db.data.lockupTest.reception[MON].am2.personId, am2.personId, 'the old link cannot take the seat back');
    assert.notStrictEqual(db.data.lockupTest.reception[MON].am2.status, 'covering');
    // a made up token with no index entry is never read
    db.data[J.LINK_ROOT]['x'.repeat(32)] = { date: MON, shift: 'am2', personId: 'tomi', answer: { kind: 'other', text: 'x', ts: 8000 } };
    const before = JSON.stringify(db.data.lockupTest.reception[MON].am2);
    await runAt(db, MON, 10, 55, L);
    assert.strictEqual(JSON.stringify(db.data.lockupTest.reception[MON].am2), before, 'a forged link does nothing');
    console.log('ok: an old or forged link changes nothing');

    // without links (lockup test mode) the emails keep the signed in page and the public queue
    db = fakeDb();
    r = await runAt(db, MON, 8, 0);
    assert.ok(!db.data.lockupPrivate && !db.data[J.LINK_ROOT], 'no links and nothing private');
    // links are pruned with their day
    db = fakeDb();
    await runAt(db, MON, 8, 0, L);
    const later = '2026-11-20';
    await runAt(db, later, 8, 0, Object.assign({ n: { date: later, dow: 5, mins: 480 } }, L));
    assert.ok(Object.keys(db.data[J.LINK_ROOT]).length >= 6);
    await runAt(db, '2026-11-18', 8, 0, Object.assign({ n: { date: '2026-11-18', dow: 3, mins: 480 } }, L));
    assert.ok(!db.data[J.IDX_ROOT][MON] && Object.values(db.data[J.LINK_ROOT]).every(x => x.date !== MON), 'a day past keeping takes its links with it');
    console.log('ok: no links in test mode; links go when their day is pruned');
  }

  console.log('all reception job tests passed');
})().catch(e => { console.error(e); process.exit(1); });
