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
    db, root: 'lockupTest', n: Object.assign({ date: date, dow: 1 }, at(h, m)), dry: false,
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
  assert.strictEqual(r.res.skipped, 'before 07:30');
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

  console.log('all reception job tests passed');
})().catch(e => { console.error(e); process.exit(1); });
