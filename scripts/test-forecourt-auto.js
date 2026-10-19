#!/usr/bin/env node
/* Tests for scripts/forecourt-auto.js against an in-memory database. No
 * network, no Firebase, no email. Run: node scripts/test-forecourt-auto.js */
'use strict';
const A = require('./forecourt-auto.js');
const assert = require('assert');
const Module = require('module');
const mailed = [];
const _load = Module._load; /* forecourt-mail.js, without firebase-admin or a real mail server */
Module._load = function (req) { if (req === 'nodemailer') return { createTransport: () => ({ sendMail: async m => { mailed.push(m); } }) }; if (req === 'firebase-admin') return {}; return _load.apply(this, arguments); };
const WE = ['will.potter@hedinautomotive.co.uk', 'elvinas.urbonas@hedinautomotive.co.uk'];

function fakeDb(data) {
  const parts = p => p.split('/').filter(Boolean);
  const getAt = p => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), data);
  const clone = v => v === undefined ? null : JSON.parse(JSON.stringify(v));
  return { data, writes: [], ref(p) { const self = this; return {
    get: async () => ({ val: () => clone(getAt(p)) }),
    set: async v => { self.writes.push(p); const ks = parts(p); let o = data; ks.slice(0, -1).forEach(k => { o = o[k] = o[k] || {}; }); o[ks[ks.length - 1]] = clone(v); } }; } };
}
const team = {}; ['tomi', 'carl', 'danny', 'karis', 'dan', 'mon', 'clive', 'chloe', 'molly'].forEach((id, i) => { team[id] = { name: id[0].toUpperCase() + id.slice(1), fullName: id + ' x', email: id + '@example.test', order: i, active: true, off: { dan: 'mon', carl: 'tue', molly: 'thu' }[id] || 'fri' }; });
const lockupCfg = { team, managers: { will: { name: 'Will', email: 'will@example.test' } } };
const stock = {}; for (let i = 0; i < 59; i++) { const k = 'AB' + String(10 + i) + 'CDE'; stock[k] = { reg: k, model: 'BMW 1 Series', colour: 'Blue', source: 'forecourt', status: 'in_stock' }; }
stock.ZZ99ZZZ = { reg: 'ZZ99ZZZ', source: 'group', status: 'in_stock' };
const prevExecs = { Carl: { name: 'Carl', cars: Object.keys(stock).slice(0, 20) }, Tomi: { name: 'Tomi', cars: Object.keys(stock).slice(20, 40) } };
const at = s => Date.parse(s);
const quiet = () => {};

(async () => {
  let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
  const data = { forecourt: { current: { execs: prevExecs, vehicles: { AB10CDE: { key: 'AB10CDE', reg: 'AB10 CDE', status: 'done' } }, meta: { stockLoadedOn: '2026-10-14' } } }, lockup: { notify: {}, mail: {} } };
  const db = fakeDb(data);
  const base = { db, log: quiet, lockupCfg, stock, absences: {}, hol: {} };

  await t('off by default writes nothing', async () => {
    const r = await A.run(Object.assign({}, base, { nowMs: at('2026-10-26T07:15:00Z'), stockGeneratedAt: '2026-10-26T07:10:00Z' }));
    assert(r.off); assert.strictEqual(db.writes.length, 0);
  });
  data.forecourt.auto = { config: { enabled: true, start: '2026-10-26', everyDays: 14 } };
  await t('nothing before the start date', async () => {
    await A.run(Object.assign({}, base, { nowMs: at('2026-10-19T08:00:00Z'), stockGeneratedAt: '2026-10-19T07:10:00Z' }));
    assert(!data.forecourt.auto.cycles);
  });
  await t('cycle day waits for today\u2019s stock, and holds the old reminders', async () => {
    await A.run(Object.assign({}, base, { nowMs: at('2026-10-26T07:00:00Z'), stockGeneratedAt: '2026-10-25T07:10:00Z' }));
    assert(!data.forecourt.auto.cycles); assert(data.lockup.mail['2026-10-26'].forecourt.Carl.skipped);
  });
  let first;
  await t('cycle starts: all Ruxley cars, counts within 1, nobody gets last cycle\u2019s car', async () => {
    first = await A.run(Object.assign({}, base, { nowMs: at('2026-10-26T07:40:00Z'), stockGeneratedAt: '2026-10-26T07:10:00Z' }));
    const cur = data.forecourt.current; assert.strictEqual(Object.keys(cur.vehicles).length, 59); assert(!cur.vehicles.ZZ99ZZZ);
    const counts = Object.values(cur.execs).map(e => e.cars.length); assert.strictEqual(counts.reduce((a, b) => a + b), 59); assert(Math.max(...counts) - Math.min(...counts) <= 1);
    assert.strictEqual(Object.keys(cur.execs).length, 9);
    Object.values(cur.execs).forEach(e => e.cars.forEach(k => assert.notStrictEqual(prevExecs[e.name] && prevExecs[e.name].cars.indexOf(k) >= 0 ? e.name : '', e.name)));
    assert(data.forecourt.auto.history.manual_2026_10_14 || data.forecourt.auto.history['manual_2026-10-14']);
    assert.strictEqual(Object.keys(data.lockup.notify).filter(k => k.indexOf('_alloc_') > 0).length, 9);
    assert.strictEqual(cur.execs.Dan.cars.length, 6, 'Dan is off on the Monday, so the odd cars go to people in');
    assert(data.lockup.notify['fc_2026-10-26_alloc_dan'].sendAfter === A.ukMs('2026-10-27', 480), 'Dan\u2019s goes Tuesday 08:00');
    assert(!data.lockup.notify['fc_2026-10-26_alloc_tomi'].sendAfter);
    const sum = data.lockup.notify['fc_2026-10-26_summary']; assert(sum, 'summary queued'); assert.deepStrictEqual(sum.to, WE); assert.strictEqual(sum.sendAfter, A.ukMs('2026-10-26', 495), 'summary at 08:15');
    assert(/Deadline: Wednesday 28 October at 5pm/.test(sum.text)); assert(/Dan: 6 cars \(day off today, email Tuesday 08:00\)/.test(sum.text), sum.text); assert(!/latest one/.test(sum.text));
    assert(/Deadline: Wednesday 28 October at 5pm/.test(data.lockup.notify['fc_2026-10-26_alloc_tomi'].text));
    const cyc = data.forecourt.auto.cycles['2026-10-26']; assert.deepStrictEqual(cyc.window, ['2026-10-26', '2026-10-27', '2026-10-28']); assert.strictEqual(cyc.deadline, '2026-10-28');
    Object.values(data.lockup.notify).forEach(q => assert(!/[\u2013\u2014]| - /.test(q.text), 'no dashes in ' + q.subject));
  });
  await t('a second run queues nothing new', async () => {
    const before = Object.keys(data.lockup.notify).length;
    await A.run(Object.assign({}, base, { nowMs: at('2026-10-26T07:55:00Z'), stockGeneratedAt: '2026-10-26T07:10:00Z' }));
    assert.strictEqual(Object.keys(data.lockup.notify).length, before);
  });
  await t('Tuesday: Dan\u2019s 08:30 reminder held for his allocation, Carl skipped on his day off', async () => {
    await A.run(Object.assign({}, base, { nowMs: at('2026-10-27T07:00:00Z'), stockGeneratedAt: '2026-10-27T07:10:00Z' }));
    assert.strictEqual(data.lockup.mail['2026-10-27'].forecourt.Dan.skipped, 'allocation email today');
    assert.strictEqual(data.lockup.mail['2026-10-27'].forecourt.Carl.skipped, 'day off');
    assert(!data.lockup.mail['2026-10-27'].forecourt.Tomi);
  });
  await t('reminder wording: deadline Mon/Tue, FINAL DAY Wednesday, Tuesday for people off Wednesday', async () => {
    const cyc = data.forecourt.auto.cycles['2026-10-26'], P = id => Object.assign({ id }, team[id]);
    team.danny.off = 'wed';
    assert(/^Deadline: Wednesday 28 October at 5pm/.test(A.reminderNote(P('tomi'), '2026-10-27', cyc, {}, {}).line));
    const w = A.reminderNote(P('tomi'), '2026-10-28', cyc, {}, {}); assert(w.final && /FINAL DAY.*5pm today/.test(w.line));
    const d = A.reminderNote(P('danny'), '2026-10-27', cyc, {}, {}); assert(d.final && /FINAL DAY.*off on Wednesday/.test(d.line), d.line);
    const ab = { x: { personId: 'mon', from: '2026-10-28', to: '2026-10-28', kind: 'holiday', status: 'booked' } };
    assert(A.reminderNote(P('mon'), '2026-10-27', cyc, ab, {}).final, 'booked absence Wednesday: final day Tuesday');
    assert(A.reminderNote(P('tomi'), '2026-10-29', cyc, {}, {}).overdue);
  });
  await t('forecourt-mail.js 08:30 reminder says FINAL DAY on Wednesday', async () => {
    data.lockup.config = Object.assign({ testMode: false }, lockupCfg);
    process.env.NOW = '2026-10-28T08:35:00Z'; process.env.GMAIL_USER = 'x@example.test'; mailed.length = 0;
    await require('./forecourt-mail.js').run({ app: { database: () => db } });
    const m = mailed.find(x => x.to[0] === 'tomi@example.test'); assert(m, 'Tomi reminded'); assert(/^FINAL DAY: forecourt checks, 7 cars to finish by 5pm today/.test(m.subject), m.subject); assert(/FINAL DAY/.test(m.html));
    delete data.lockup.mail['2026-10-28'];
  });
  await t('finished early: no report until 17:00 Wednesday', async () => {
    const cur = data.forecourt.current; let i = 0;
    Object.keys(cur.vehicles).forEach(k => { i++; if (i === 3) { cur.vehicles[k].status = 'inaccessible'; cur.vehicles[k].inaccessible = { note: 'Blocked in', by: 'Mon', at: at('2026-10-27T10:00:00Z') }; return; } cur.vehicles[k].status = 'done'; Object.assign(cur.answers[k], { done: true, checkedBy: 'Tomi', checkedAt: at('2026-10-27T09:00:00Z') + i * 60000, soldboard: 'no', fuel: i % 10 ? 'yes' : 'no', clean: i === 5 ? 'no' : 'yes', notes: i === 5 ? 'Scuff on rear bumper' : '' }); });
    cur.fuel = { [Object.keys(cur.vehicles)[9]]: { by: 'Karis', at: 1 } };
    await A.run(Object.assign({}, base, { nowMs: at('2026-10-27T13:00:00Z'), stockGeneratedAt: '2026-10-27T07:10:00Z' }));
    assert.strictEqual(data.forecourt.auto.cycles['2026-10-26'].status, 'complete');
    await A.run(Object.assign({}, base, { nowMs: at('2026-10-28T16:45:00Z') }));
    assert(!data.lockup.notify['fc_2026-10-26_report']); assert(!Object.keys(data.lockup.notify).some(k => k.indexOf('_fuel_') > 0));
  });
  await t('17:00 Wednesday: one report to Will and Elvis listing cars not done and whose, one fuel list', async () => {
    const cur = data.forecourt.current, k = Object.keys(cur.vehicles)[1]; cur.vehicles[k].status = 'pending'; cur.answers[k] = { done: false };
    const owner = Object.values(cur.execs).find(e => e.cars.indexOf(k) >= 0).name;
    await A.run(Object.assign({}, base, { nowMs: at('2026-10-28T17:00:00Z') }));
    const r = data.lockup.notify['fc_2026-10-26_report']; assert(r); assert.deepStrictEqual(r.to, WE); assert(/1 car not done by the Wednesday 5pm deadline/.test(r.subject), r.subject);
    assert(r.text.indexOf(cur.vehicles[k].reg + ' (BMW 1 Series): ' + owner + ', not started') > 0, 'not done car and whose'); assert(/Scuff/.test(r.html)); assert(/Blocked in/.test(r.text)); assert(r.csv.split('\n').length === 60);
    const f = data.lockup.notify['fc_2026-10-26_fuel_2026-10-28']; assert(f); assert(/4 cars/.test(f.subject), f.subject); assert(f.to.indexOf(WE[1]) >= 0);
    const before = Object.keys(data.lockup.notify).length;
    await A.run(Object.assign({}, base, { nowMs: at('2026-10-28T17:15:00Z') }));
    assert.strictEqual(Object.keys(data.lockup.notify).length, before);
  });
  await t('stock not in by 08:10: latest list used, summary says so', async () => {
    const d3 = { forecourt: { auto: { config: { enabled: true, start: '2026-10-26' } } }, lockup: { notify: {}, mail: {} } };
    await A.run(Object.assign({}, base, { db: fakeDb(d3), nowMs: at('2026-10-26T08:00:00Z'), stockGeneratedAt: '2026-10-24T07:10:00Z' }));
    assert(!d3.forecourt.current, 'waits at 08:00');
    await A.run(Object.assign({}, base, { db: fakeDb(d3), nowMs: at('2026-10-26T08:15:00Z'), stockGeneratedAt: '2026-10-24T07:10:00Z' }));
    assert(d3.forecourt.current); const s = d3.lockup.notify['fc_2026-10-26_summary']; assert(/had not come in by 08:10, so this uses the latest one, from Sat 24 Oct/.test(s.text), s.text); assert(!s.sendAfter, 'goes straight away at 08:15');
  });
  await t('daily fuel list next morning, once', async () => {
    await A.run(Object.assign({}, base, { nowMs: at('2026-10-29T09:05:00Z') }));
    await A.run(Object.assign({}, base, { nowMs: at('2026-10-29T09:20:00Z') }));
    assert(/^Still to fuel/.test(data.lockup.notify['fc_2026-10-26_fuel_2026-10-29'].subject));
  });
  await t('manager "send report now" queues once', async () => {
    data.forecourt.auto.requests = { report: { at: 123, by: 'Manager' } };
    await A.run(Object.assign({}, base, { nowMs: at('2026-10-29T10:00:00Z') }));
    await A.run(Object.assign({}, base, { nowMs: at('2026-10-29T10:15:00Z') }));
    assert.deepStrictEqual(data.lockup.notify['fc_2026-10-26_report_req_123'].to, WE); assert(data.forecourt.auto.requests.report.handled);
  });
  await t('sandbox sends everything to Dan only', async () => {
    const d2 = { forecourt: { auto: { config: { enabled: true, sandbox: true, start: '2026-10-26' } } }, forecourtTest: {}, lockup: { notify: {}, mail: {} } };
    await A.run(Object.assign({}, base, { db: fakeDb(d2), nowMs: at('2026-10-26T07:40:00Z'), stockGeneratedAt: '2026-10-26T07:10:00Z' }));
    assert(d2.forecourtTest.current); assert(!d2.forecourt.current);
    Object.values(d2.lockup.notify).forEach(q => { assert.deepStrictEqual(q.to, ['daniel.cane@hedinautomotive.co.uk']); assert(/^\[SANDBOX\]/.test(q.subject)); });
  });
  await t('schedule: every other Monday, bank holiday moves to Tuesday', async () => {
    const c = A.nextCycles({ start: '2026-10-26', everyDays: 14 }, '2026-10-19', 4, {});
    assert.deepStrictEqual(c.map(x => x.start), ['2026-10-26', '2026-11-09', '2026-11-23', '2026-12-07']);
    assert.strictEqual(A.startDayFor('2026-12-28', { '2026-12-28': 1 }), '2026-12-29');
    assert.deepStrictEqual(A.windowFor('2026-12-29', { '2026-12-28': 1, '2027-01-01': 1 }), ['2026-12-29', '2026-12-30', '2026-12-31'], 'bank holiday moves the whole window');
    assert.deepStrictEqual(A.windowFor('2026-05-26', { '2026-05-25': 1 }), ['2026-05-26', '2026-05-27', '2026-05-28']);
  });
  console.log(n + ' forecourt auto tests passed');
})().catch(e => { console.error(e); process.exit(1); });
