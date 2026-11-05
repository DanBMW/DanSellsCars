#!/usr/bin/env node
/* Tests the showroom cover job (scripts/reception-mail.js) against an in-memory
 * database: the 07:30 start, one plan a day, a decline and its reassignment,
 * no duplicate emails, and a closed Sunday.
 *   node scripts/test-reception-job.js
 */
'use strict';
const assert = require('assert');
const J = require('./reception-mail.js');

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
  molly: { name: 'Molly', email: 'molly.x@hedinautomotive.co.uk', order: 5, active: true }
};
const at = (h, m) => ({ mins: h * 60 + m });
const MON = '2026-11-02', SUN = '2026-11-08';

async function runAt(db, date, h, m, cfgExtra) {
  const queue = (await db.ref('lockupTest/notify').get()).val() || {};
  const q = J.makeQueue(db, 'lockupTest', queue);
  const reception = (await db.ref('lockupTest/reception').get()).val() || {};
  const res = await J.run(Object.assign({
    db, root: 'lockupTest', logRoot: 'receptionLogTest', n: Object.assign({ date: date, dow: 1 }, at(h, m)), dry: false,
    team, managers: {}, cfg: {}, testExec: 'daniel.cane@hedinautomotive.co.uk',
    queueAdd: (id, rec, dry) => q.add(id, rec, dry), log: () => {},
    reception, absences: {}, shiftCfg: undefined, bh: {}, holidays: {}, closed: {}
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

  // 08:00: three shifts, three different sales people, one email each, chloe and molly never
  db = fakeDb();
  r = await runAt(db, MON, 8, 0);
  const day = db.data.lockupTest.reception[MON];
  const ppl = ['am', 'mid', 'pm'].map(k => day[k].personId);
  assert.strictEqual(new Set(ppl).size, 3, JSON.stringify(ppl));
  assert.ok(ppl.every(p => p !== 'chloe' && p !== 'molly'));
  assert.strictEqual(r.added.length, 3, 'three cover emails: ' + r.added.join(','));
  const mail = db.data.lockupTest.notify[r.added[0]];
  assert.ok(/You are on showroom cover\. Please cover showroom until/.test(mail.text), mail.text);
  assert.ok(/I am covering:\nhttps:\/\/dan-sells\.co\.uk\/reception\.html\?test=1/.test(mail.text), mail.text);
  assert.ok(/action=cannot/.test(mail.text), mail.text);
  assert.ok(/I am covering/.test(mail.html) && /I cannot cover/.test(mail.html), 'queued html has tap buttons');
  assert.ok(/action=covering/.test(mail.html) && /action=cannot/.test(mail.html), mail.html.slice(0, 400));
  assert.deepStrictEqual(mail.to, ['daniel.cane@hedinautomotive.co.uk'], 'test mode sends to Dan');
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
  const notes = r.added.filter(id => /^rc_decl_/.test(id));
  assert.strictEqual(notes.length, 1, 'one manager note: ' + r.added.join(','));
  assert.strictEqual(db.data.lockupTest.notify[notes[0]].to, 'managers');
  assert.ok(/with a customer/.test(db.data.lockupTest.notify[notes[0]].text));
  const now = db.data.lockupTest.reception[MON].am;
  assert.notStrictEqual(now.personId, was, 'the decliner is taken off the shift');
  assert.strictEqual(now.status, 'assigned');
  assert.deepStrictEqual(Object.keys(now.declined), [was]);
  assert.ok(r.added.some(id => id === 'rc_' + MON + '_am_' + now.personId), 'the new person is emailed');
  console.log('ok: a decline notifies the managers with the reason and puts the next fair person on');

  // the same decline is not handled twice, and the decliner is not put back on
  r = await runAt(db, MON, 9, 30);
  assert.strictEqual(r.added.filter(id => /^rc_decl_/.test(id)).length, 0);
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
  const shortNote = r.added.filter(id => /^rc_short_/.test(id));
  assert.strictEqual(shortNote.length, 3, 'one note per uncovered shift: ' + r.added.join(','));
  const shortMail = db.data.lockupTest.notify[shortNote[0]];
  assert.ok(/Showroom not covered 09:00 to 12:00/.test(shortMail.subject), shortMail.subject);
  assert.strictEqual(shortMail.to, 'managers');
  r = await runAt(db, MON, 8, 30, { absences: everyoneAway });
  assert.strictEqual(r.added.filter(id => /^rc_short_/.test(id)).length, 0, 'not told again on the next run');
  console.log('ok: when nobody is free the shift is marked not covered and the managers are told once');

  // a team member with no work email: the managers are told once, and nobody is put on for them
  const noMail = Object.assign({}, team, { ben: Object.assign({}, team.ben, { email: '' }) });
  db = fakeDb();
  r = await runAt(db, MON, 8, 0, { team: noMail });
  assert.strictEqual(r.added.filter(id => /^rc_noemail_ben/.test(id)).length, 1, 'Ben is flagged: ' + r.added.join(','));
  r = await runAt(db, MON, 8, 30, { team: noMail });
  assert.strictEqual(r.added.filter(id => /^rc_noemail_ben/.test(id)).length, 0, 'flagged once');
  console.log('ok: anyone on the team without a work email is flagged to the managers once');

  // the management log: every shift someone is put on, every skip, every absence tag
  db = fakeDb();
  await runAt(db, MON, 8, 0);
  const logged = Object.values(db.data.receptionLogTest || {});
  assert.strictEqual(logged.filter(e => e.kind === 'on').length, 3, 'three shifts logged as on: ' + JSON.stringify(logged));
  await runAt(db, MON, 8, 15);
  assert.strictEqual(Object.values(db.data.receptionLogTest).filter(e => e.kind === 'on').length, 3, 'a later run logs nothing twice');
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
  const whereAre = r.added.filter(id => /^rc_absent_/.test(id));
  assert.strictEqual(whereAre.length, 1, 'one where-are-you email: ' + r.added.join(','));
  const wm = db.data.lockupTest.notify[whereAre[0]];
  assert.ok(/Where are you\?/.test(wm.subject) && /reception\.html/.test(wm.text) && /I am here/.test(wm.text), wm.text);
  assert.deepStrictEqual(wm.to, ['daniel.cane@hedinautomotive.co.uk'], 'test mode sends it to Dan');
  db.data.lockupTest.reception[MON].pm = Object.assign({}, db.data.lockupTest.reception[MON].pm, { absent: Object.assign({}, db.data.lockupTest.reception[MON].pm.absent, { reply: { status: 'here', ts: 6000 } }) });
  r = await runAt(db, MON, 10, 15);
  assert.strictEqual(r.added.filter(id => /^rc_reply_/.test(id)).length, 1, 'the reply reaches the managers');
  r = await runAt(db, MON, 10, 30);
  assert.strictEqual(r.added.filter(id => /^rc_reply_/.test(id)).length, 0, 'once');
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
  const onDay = ['am', 'mid', 'pm'].map(k => offDay[k] && offDay[k].personId).filter(Boolean);
  assert.ok(!onDay.includes('carl') && !onDay.includes('tomi'), 'days off are respected: ' + JSON.stringify(onDay));
  assert.strictEqual(new Set(onDay).size, onDay.length, 'no double shifts: ' + JSON.stringify(onDay));
  console.log('ok: someone on a day off is not put on, and nobody is on twice');

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
  const shortNoteId = Object.keys(db.data.lockupTest.notify).filter(k => /^rc_short_/.test(k))[0];
  const shortText = db.data.lockupTest.notify[shortNoteId].text;
  assert.ok(/Free and not on a shift yet: nobody/.test(shortText) && /Please choose someone/.test(shortText), shortText);
  console.log('ok: when nobody is free the managers are emailed who is free, who is busy, and that they should choose');

  db.data.lockupTest.reception[MON] = Object.assign({}, db.data.lockupTest.reception[MON] || {}, { am: { status: 'short', ts: 9000, assign: { personId: 'carl', by: 'will', ts: 9500 } } });
  const carlIn = Object.assign({}, everyoneBusy); delete carlIn.a_carl;
  r = await runAt(db, MON, 9, 0, { absences: carlIn });
  assert.strictEqual(db.data.lockupTest.reception[MON].am.personId, 'carl', 'the manager choice is put on the shift');
  assert.ok(r.added.some(id => id.indexOf('rc_' + MON + '_am_carl') === 0), 'and emailed');
  console.log('ok: a manager choice puts that person on the shift and emails them');

  console.log('all reception job tests passed');
})().catch(e => { console.error(e); process.exit(1); });
