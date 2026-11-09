#!/usr/bin/env node
/* node scripts/test-santa-draw.js [runsPerSize]
 * The Secret Santa draw, launch and emails (scripts/santa-draw.js).
 *  1. fuzz: group sizes 2 to 60, random keep apart pairs, thousands of draws each:
 *     every person gives once and receives once, nobody gets themselves, kept
 *     apart pairs never meet; impossible sets fail with a clear message, and
 *     the draw never fails when a valid draw exists (checked by brute force up to 8);
 *  2. the server run: draw, redraw, cancel, extras added and removed before the
 *     draw, launch once only, names out, weekly reminders and the eve email,
 *     repeat and late runs never double send, practice only emails Dan,
 *     no email ever names a giftee. */
'use strict';
const assert = require('assert');
const S = require('./santa-draw.js');
const RUNS = +process.argv[2] || 2000;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); checks++; };

/* seeded random so a failure can be replayed */
let seed = 20261109;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1e9) / 1e9; };
function randExcl(keys, density) {
  const ex = {};
  keys.forEach(a => keys.forEach(b => { if (a < b && rnd() < density) { (ex[a] = ex[a] || {})[b] = true; } }));
  return ex;
}
function bijection(keys, p) {
  const giv = Object.keys(p).sort(), rec = Object.values(p).sort(), k = keys.slice().sort();
  return JSON.stringify(giv) === JSON.stringify(k) && JSON.stringify(rec) === JSON.stringify(k) && new Set(rec).size === k.length;
}
function bruteFeasible(keys, ex) {
  const bad = (a, b) => a === b || !!((ex[a] || {})[b] || (ex[b] || {})[a]);
  const used = new Set();
  const go = i => { if (i === keys.length) return true; for (const r of keys) if (!used.has(r) && !bad(keys[i], r)) { used.add(r); if (go(i + 1)) return true; used.delete(r); } return false; };
  return go(0);
}

/* ---------- 1. fuzz ---------- */
const t0 = Date.now();
let draws = 0, refused = 0, matchingUsed = 0;
for (let n = 2; n <= 60; n++) {
  const keys = Array.from({ length: n }, (_, i) => 'p' + i);
  for (let t = 0; t < RUNS; t++) {
    const dens = [0, 0, 0.05, 0.15, 0.3, 0.6][t % 6] * (n <= 8 ? 1 : 0.5);
    const ex = randExcl(keys, dens);
    let p = null, err = null;
    const loop = t % 10 === 9 ? 0 : 300; /* every tenth run skips the loop, to drive the matching fallback */
    if (!loop) matchingUsed++;
    try { p = S.derange(keys, ex, null, loop); } catch (e) { err = e; }
    if (p) {
      draws++;
      ok(bijection(keys, p), 'bijection n=' + n);
      ok(keys.every(k => p[k] !== k), 'nobody draws themselves n=' + n);
      ok(Object.keys(ex).every(a => Object.keys(ex[a]).every(b => p[a] !== b && p[b] !== a)), 'kept apart n=' + n);
      ok(S.valid(keys, p, ex), 'valid() agrees');
    } else {
      refused++;
      ok(err instanceof S.DrawError && err.message.length > 20, 'a clear message, n=' + n + ': ' + (err && err.message));
      if (n <= 8) ok(!bruteFeasible(keys, ex), 'refused only when no draw exists (brute force) n=' + n);
    }
    if (p && n <= 8 && t % 50 === 0) ok(bruteFeasible(keys, ex), 'brute force agrees it was possible');
  }
}
/* every possible draw shows up (no bias to a few): 4 people have 9 derangements */
{
  const seen = new Set(); for (let i = 0; i < 4000; i++) { const p = S.derange(['a', 'b', 'c', 'd'], {}, null, 0); seen.add(['a', 'b', 'c', 'd'].map(k => p[k]).join('')); }
  eq(seen.size, 9, 'all 9 derangements of 4 people come up');
}
/* impossible sets */
assert.throws(() => S.derange(['x']), /at least two/); checks++;
assert.throws(() => S.derange(['x', 'y'], { x: { y: true } }), /x is kept apart from everyone/); checks++;
assert.throws(() => S.derange(['a', 'b', 'c'], { a: { b: true, c: true } }, { a: 'Holly' }), /Holly is kept apart from everyone/); checks++;
assert.throws(() => S.derange(['a', 'a', 'b']), /twice/); checks++;
ok(!S.valid(['a', 'b', 'c'], { a: 'b', b: 'b', c: 'a' }), 'valid() catches someone picked twice');
ok(!S.valid(['a', 'b', 'c'], { a: 'b', b: 'a' }), 'valid() catches someone left out');
ok(!S.valid(['a', 'b'], { a: 'a', b: 'b' }), 'valid() catches self');
console.log('fuzz: ' + draws + ' draws checked, ' + refused + ' impossible sets refused cleanly, ' + matchingUsed + ' via the matching fallback, sizes 2 to 60, ' + RUNS + ' runs each (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');

/* ---------- 2. the server run against an in-memory database ---------- */
function fakeDb(data) {
  const parts = p => String(p).split('/').filter(Boolean);
  const get = p => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), data);
  const set = (p, v) => {
    const ps = parts(p); let o = data;
    ps.slice(0, -1).forEach(k => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    if (v === null || v === undefined) delete o[ps[ps.length - 1]]; else o[ps[ps.length - 1]] = JSON.parse(JSON.stringify(v));
  };
  return { data, ref: p => ({
    get: async () => ({ val: () => { const v = get(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }),
    set: async v => set(p, v), remove: async () => set(p, null),
    update: async v => Object.keys(v).forEach(k => set(p + '/' + k, v[k])) }) };
}
const K = S.keyOf;
const T = iso => Date.parse(iso);
const ELVES = ['holly.berry@example.com', 'noel.snow@example.com', 'ivy.green@example.com', 'rudy.deer@example.com', 'carol.singer@example.com', 'nick.frost@example.com', 'eve.winter@example.com'];
function memberMap(list) { const m = {}; list.forEach(e => { m[K(e)] = { name: e.split('.')[0].replace(/^./, c => c.toUpperCase()), email: e, ts: 1 }; }); return m; }
const notify = db => db.data.lockup && db.data.lockup.notify || {};
const ids = (db, re) => Object.keys(notify(db)).filter(k => re.test(k));
const runAt = (db, iso, logs) => S.run(db, { nowMs: T(iso), notifyRoot: 'lockup/notify', log: x => (logs || []).push(x) });

(async () => {
  /* a. draw, extras, redraw, cancel */
  {
    const db = fakeDb({ santa: { members: memberMap(ELVES), settings: { budget: 20 } } });
    /* extras added and removed before the draw */
    db.data.santa.members[K('tinsel.toes@gmail.com')] = { name: 'Tinsel', email: 'tinsel.toes@gmail.com', extra: true };
    delete db.data.santa.members[K('nick.frost@example.com')];
    db.data.santa.members.bogus = { name: 'Wrong key', email: 'other@example.com' };
    db.data.santa.drawRequest = { mode: 'draw', byName: 'Dan' };
    const logs = []; await runAt(db, '2026-11-10T11:00:00Z', logs);
    const R = db.data.santa, keys = Object.keys(R.members).filter(k => k !== 'bogus');
    eq(R.draw.count, 7, 'draw counts the extra in and the removed person out');
    ok(!R.assign.bogus && !Object.values(R.sealed.pairs).includes('bogus'), 'an entry whose key is not its email is left out');
    ok(bijection(keys, R.sealed.pairs), 'server draw is a bijection');
    ok(R.assign[K('tinsel.toes@gmail.com')] && !R.assign[K('nick.frost@example.com')], 'extras in, removed out');
    keys.forEach(k => { eq(R.assign[k].to, R.sealed.pairs[k]); eq(R.assign[k].name, R.members[R.assign[k].to].name); });
    ok(!/Holly|Noel|Ivy|Rudy|Carol|Eve|Tinsel/.test(logs.join(' ')), 'the log never names anyone');
    eq(ids(db, /./).length, 0, 'no emails before the launch');
    const first = R.draw.id;
    for (let i = 0; i < 50; i++) { R.drawRequest = { mode: 'draw', byName: 'Dan' }; await runAt(db, '2026-11-10T11:15:00Z'); ok(bijection(keys, R.sealed.pairs) && R.draw.id !== first, 'redraw ' + i + ' valid'); }
    R.exclusions = { [keys[0]]: { [keys[1]]: true, [keys[2]]: true, [keys[3]]: true, [keys[4]]: true, [keys[5]]: true, [keys[6]]: true } };
    const before = R.draw.id;
    R.drawRequest = { mode: 'draw', byName: 'Dan' }; await runAt(db, '2026-11-10T11:30:00Z');
    ok(/kept apart from everyone/.test(R.drawError.msg) && R.draw.id === before && !R.drawRequest, 'an impossible draw keeps the old one and explains why');
    delete R.exclusions;
    R.drawRequest = { mode: 'cancel', byName: 'Dan' }; await runAt(db, '2026-11-10T11:45:00Z');
    ok(!R.assign && !R.sealed && !R.draw, 'cancel clears the draw');
  }
  /* b. launch before the names are out: draws at launch, emails once, names out email, weekly, eve */
  {
    const db = fakeDb({ santa: { members: memberMap(ELVES), settings: { budget: 20, exchange: '2026-12-18', announceTs: T('2026-12-01T10:00:00Z'), live: false } } });
    const R = db.data.santa;
    R.launchRequest = { by: 'dan1', byName: 'Dan', ts: 1 };
    await runAt(db, '2026-11-10T12:00:00Z');
    ok(R.settings.live === true && R.launched && R.draw && bijection(Object.keys(R.members), R.sealed.pairs), 'launch draws the names and goes live');
    eq(ids(db, /^santa_launch_/).length, 7, 'one launch email each');
    const launchMail = notify(db)['santa_launch_' + S.mailId(K('holly.berry@example.com'))];
    ok(/Names out Tuesday 1 December at 10am/.test(launchMail.subject), 'launch subject says when names are out: ' + launchMail.subject);
    eq(launchMail.to, ['holly.berry@example.com']); eq(launchMail.fromName, 'Hedin Used Cars');
    /* repeat runs, a second press of Launch, a late run: nothing sent twice */
    notify(db)['santa_launch_' + S.mailId(K('holly.berry@example.com'))].sent = 5;
    for (const t of ['2026-11-10T12:15:00Z', '2026-11-10T12:30:00Z', '2026-11-11T09:00:00Z']) { R.launchRequest = { by: 'dan1', byName: 'Dan', ts: 2 }; await runAt(db, t); }
    eq(ids(db, /^santa_launch_/).length, 7, 'launch emails still 7 after repeats');
    eq(notify(db)['santa_launch_' + S.mailId(K('holly.berry@example.com'))].sent, 5, 'a sent email is never re queued');
    ok(!R.launchRequest, 'a second launch request is just cleared');
    /* cancel and redraw refused once launched */
    const id0 = R.draw.id;
    R.drawRequest = { mode: 'cancel', byName: 'Dan' }; await runAt(db, '2026-11-11T09:15:00Z');
    ok(R.draw.id === id0 && /already launched/.test(R.drawError.msg), 'no cancel after launch');
    R.drawRequest = { mode: 'draw', byName: 'Dan' }; await runAt(db, '2026-11-11T09:30:00Z');
    ok(R.draw.id !== id0, 'a redraw before the names are out is allowed');
    const id1 = R.draw.id;
    /* Monday 16 Nov: before 10:00 nothing, from 10:00 one weekly each, repeats nothing */
    await runAt(db, '2026-11-16T09:45:00Z'); eq(ids(db, /^santa_weekly_/).length, 0, 'no weekly before 10am');
    await runAt(db, '2026-11-16T10:05:00Z'); eq(ids(db, /^santa_weekly_2026_W47_/).length, 7, 'weekly W47 one each');
    for (const t of ['2026-11-16T10:20:00Z', '2026-11-16T15:00:00Z', '2026-11-17T10:00:00Z', '2026-11-21T19:00:00Z']) await runAt(db, t);
    eq(ids(db, /^santa_weekly_/).length, 7, 'weekly not repeated in the week');
    /* a late Monday: runs only from 11:40 still sends once */
    await runAt(db, '2026-11-23T11:40:00Z'); await runAt(db, '2026-11-23T11:55:00Z');
    eq(ids(db, /^santa_weekly_2026_W48_/).length, 7, 'late Monday run sends W48 once');
    const wk = notify(db)['santa_weekly_2026_W48_' + S.mailId(K('ivy.green@example.com'))];
    ok(/25 days to go/.test(wk.subject), 'weekly counts down: ' + wk.subject);
    ok(/Names are announced on/.test(wk.text), 'before the names are out the weekly says when');
    /* names out: first run after 1 Dec 10:00 */
    await runAt(db, '2026-12-01T09:50:00Z'); eq(ids(db, /^santa_announce_/).length, 0, 'no names out email early');
    R.drawRequest = { mode: 'draw', byName: 'Dan' }; await runAt(db, '2026-12-01T10:05:00Z');
    eq(R.draw.id, id1, 'no redraw once the names are out');
    eq(ids(db, /^santa_announce_/).length, 7, 'names out email each');
    await runAt(db, '2026-12-01T10:20:00Z'); eq(ids(db, /^santa_announce_/).length, 7, 'names out not repeated');
    await runAt(db, '2026-12-07T10:00:00Z'); await runAt(db, '2026-12-14T10:00:00Z');
    eq(ids(db, /^santa_weekly_/).length, 28, 'weekly W49 and W50 too');
    ok(!/Names are announced/.test(notify(db)['santa_weekly_2026_W50_' + S.mailId(K('ivy.green@example.com'))].text), 'after the names are out the weekly points at the giftee wishlist');
    /* eve: the 18th is a Friday, so Thursday 17th from 10:00 */
    await runAt(db, '2026-12-17T09:00:00Z'); eq(ids(db, /^santa_eve_/).length, 0, 'no eve email before 10am');
    await runAt(db, '2026-12-17T10:01:00Z'); await runAt(db, '2026-12-17T16:00:00Z');
    eq(ids(db, /^santa_eve_/).length, 7, 'eve email once each');
    ok(/tomorrow/.test(notify(db)['santa_eve_' + S.mailId(K('ivy.green@example.com'))].subject), 'eve says tomorrow');
    /* after the exchange: nothing more */
    const before = Object.keys(notify(db)).length;
    for (const t of ['2026-12-18T10:00:00Z', '2026-12-21T10:00:00Z', '2026-12-28T10:00:00Z']) await runAt(db, t);
    eq(Object.keys(notify(db)).length, before, 'no emails on or after the exchange day');
    /* no email names a giftee or says who has who */
    const names = Object.values(R.members).map(m => m.name);
    Object.keys(notify(db)).forEach(id => { const q = notify(db)[id]; const mine = R.members[Object.keys(R.members).find(k => q.to[0] === R.members[k].email)].name;
      names.filter(n => n !== mine).forEach(n => ok(!(q.subject + q.text + q.html).includes(n), 'email ' + id + ' does not mention ' + n)); });
    Object.values(notify(db)).forEach(q => ok(!/[\u2013\u2014]| - /.test(q.subject + q.text), 'no dashes: ' + q.subject));
  }
  /* c. launch after the names time: one email, says open the app; no names out email; reminders off */
  {
    const db = fakeDb({ santa: { members: memberMap(ELVES.slice(0, 3)), settings: { exchange: '2026-12-21', announceTs: T('2026-11-01T10:00:00Z'), reminders: false } } });
    db.data.santa.drawRequest = { mode: 'draw', byName: 'Dan' }; await runAt(db, '2026-11-09T10:00:00Z');
    const drawId = db.data.santa.draw.id;
    db.data.santa.launchRequest = { byName: 'Dan' }; await runAt(db, '2026-11-09T10:15:00Z');
    eq(db.data.santa.launched.drawId, drawId, 'launch keeps an existing draw');
    eq(ids(db, /^santa_launch_/).length, 3); ok(/Open the app to see who you/.test(notify(db)[ids(db, /^santa_launch_/)[0]].subject), 'launch after names time says open the app');
    for (const t of ['2026-11-16T10:00:00Z', '2026-11-23T10:00:00Z', '2026-12-19T10:00:00Z']) await runAt(db, t);
    eq(ids(db, /^santa_(announce|weekly|eve)_/).length, 0, 'reminders off: no weekly or eve; launch after names time: no names out email');
  }
  /* d. launch refused without dates; launch with an impossible draw refused */
  {
    const db = fakeDb({ santa: { members: memberMap(ELVES.slice(0, 3)), settings: {} } });
    db.data.santa.launchRequest = { byName: 'Dan' }; await runAt(db, '2026-11-09T10:00:00Z');
    ok(!db.data.santa.launched && /before launching/.test(db.data.santa.drawError.msg), 'no launch without the dates');
    const k = Object.keys(db.data.santa.members);
    Object.assign(db.data.santa, { settings: { exchange: '2026-12-18', announceTs: 1 }, exclusions: { [k[0]]: { [k[1]]: true, [k[2]]: true } }, launchRequest: { byName: 'Dan' } });
    await runAt(db, '2026-11-09T10:15:00Z');
    ok(!db.data.santa.launched && !db.data.santa.settings.live && /kept apart/.test(db.data.santa.drawError.msg), 'an impossible draw stops the launch and stays Coming soon');
    eq(ids(db, /./).length, 0, 'and sends nothing');
  }
  /* e. practice copy only ever emails Dan, one sample */
  {
    const db = fakeDb({ santaTest: { members: memberMap(ELVES), settings: { exchange: '2026-12-18', announceTs: T('2026-12-01T10:00:00Z') }, launchRequest: { byName: 'Dan' } } });
    await runAt(db, '2026-11-10T12:00:00Z'); await runAt(db, '2026-11-16T10:00:00Z');
    const qs = Object.values(notify(db));
    ok(qs.length === 2 && qs.every(q => q.to.length === 1 && q.to[0] === 'daniel.cane@hedinautomotive.co.uk' && /^\[PRACTICE\]/.test(q.subject)), 'practice: one sample per email, to Dan only');
    ok(!db.data.santa, 'practice never touches the live copy');
  }
  /* f. eve when the exchange is a Monday: the Saturday before, "on Monday ..." */
  {
    eq(S.eveDay('2026-12-21'), '2026-12-19'); eq(S.eveDay('2026-12-18'), '2026-12-17');
    const m = S.makeMail('eve', { name: 'Holly' }, { exchange: '2026-12-21', budget: 20 }, '2026-12-19', T('2026-12-19T10:00:00Z'));
    ok(/on Monday 21 December/.test(m.subject), m.subject);
  }
  console.log('santa: all ' + checks + ' checks passed');
})().catch(e => { console.error(e); process.exit(1); });
