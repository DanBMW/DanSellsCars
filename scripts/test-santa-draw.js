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
const notify = db => Object.assign({}, db.data.lockup && db.data.lockup.notify || {}, db.data.lockupPrivate && db.data.lockupPrivate.notify || {});
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
  /* b. Go / launch reveals names at once, emails once, weekly, eve. No timed announce. */
  {
    const db = fakeDb({ santa: { members: memberMap(ELVES), settings: { budget: 20, exchange: '2026-12-18', live: false } } });
    const R = db.data.santa;
    R.launchRequest = { by: 'dan1', byName: 'Dan', ts: 1 };
    await runAt(db, '2026-11-10T12:00:00Z');
    ok(R.settings.live === true && R.launched && R.draw && bijection(Object.keys(R.members), R.sealed.pairs), 'launch draws the names and goes live');
    eq(ids(db, /^santa_launch_/).length, 7, 'one launch email each');
    const launchMail = notify(db)['santa_launch_' + S.mailId(K('holly.berry@example.com'))];
    ok(/Secret Santa is live/.test(launchMail.subject), 'launch subject: ' + launchMail.subject);
    ok(/team meal/.test(launchMail.text), 'launch email mentions the team meal');
    eq(launchMail.to, ['holly.berry@example.com']); eq(launchMail.fromName, 'Hedin Used Cars');
    /* repeat runs, a second press of Launch, a late run: nothing sent twice */
    notify(db)['santa_launch_' + S.mailId(K('holly.berry@example.com'))].sent = 5;
    for (const t of ['2026-11-10T12:15:00Z', '2026-11-10T12:30:00Z', '2026-11-11T09:00:00Z']) { R.launchRequest = { by: 'dan1', byName: 'Dan', ts: 2 }; await runAt(db, t); }
    eq(ids(db, /^santa_launch_/).length, 7, 'launch emails still 7 after repeats');
    eq(notify(db)['santa_launch_' + S.mailId(K('holly.berry@example.com'))].sent, 5, 'a sent email is never re queued');
    ok(!R.launchRequest, 'a second launch request is just cleared');
    /* cancel and redraw refused once launched, because names are already out */
    const id0 = R.draw.id;
    R.drawRequest = { mode: 'cancel', byName: 'Dan' }; await runAt(db, '2026-11-11T09:15:00Z');
    ok(R.draw.id === id0 && /already launched/.test(R.drawError.msg), 'no cancel after launch');
    R.drawRequest = { mode: 'draw', byName: 'Dan' }; await runAt(db, '2026-11-11T09:30:00Z');
    ok(R.draw.id === id0 && /already out/.test(R.drawError.msg), 'no redraw after launch');
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
    ok(/giftee|wishlist/i.test(wk.text), 'weekly after Go points at the giftee wishlist');
    ok(!/Names are announced/.test(wk.text), 'weekly never names a scheduled announce day');
    /* passing an announceTs later does not send a names out email or change the draw */
    R.settings.announceTs = T('2026-12-01T10:00:00Z');
    await runAt(db, '2026-12-01T09:50:00Z'); eq(ids(db, /^santa_announce_/).length, 0, 'no names out email before a leftover announceTs');
    R.drawRequest = { mode: 'draw', byName: 'Dan' }; await runAt(db, '2026-12-01T10:05:00Z');
    eq(R.draw.id, id0, 'still no redraw, even after a leftover announceTs');
    eq(ids(db, /^santa_announce_/).length, 0, 'announceTs alone never sends a names out email');
    await runAt(db, '2026-12-01T10:20:00Z'); eq(ids(db, /^santa_announce_/).length, 0, 'still no announce email');
    await runAt(db, '2026-12-07T10:00:00Z'); await runAt(db, '2026-12-14T10:00:00Z');
    eq(ids(db, /^santa_weekly_/).length, 28, 'weekly W49 and W50 too');
    ok(/wishlist/i.test(notify(db)['santa_weekly_2026_W50_' + S.mailId(K('ivy.green@example.com'))].text), 'later weeklies still point at the wishlist');
    /* eve: the 18th is a Friday, so Thursday 17th from 10:00 */
    await runAt(db, '2026-12-17T09:00:00Z'); eq(ids(db, /^santa_eve_/).length, 0, 'no eve email before 10am');
    await runAt(db, '2026-12-17T10:01:00Z'); await runAt(db, '2026-12-17T16:00:00Z');
    eq(ids(db, /^santa_eve_/).length, 7, 'eve email once each');
    ok(/tomorrow/.test(notify(db)['santa_eve_' + S.mailId(K('ivy.green@example.com'))].subject), 'eve says tomorrow');
    /* after the exchange: nothing more */
    const before = Object.keys(notify(db)).length;
    for (const t of ['2026-12-18T10:00:00Z', '2026-12-21T10:00:00Z', '2026-12-28T10:00:00Z']) await runAt(db, t);
    eq(Object.keys(notify(db)).length, before, 'no emails on or after the exchange day');
    /* an email names its own reader's giftee and nobody else's; the public queue names nobody */
    const names = Object.values(R.members).map(m => m.name);
    const pubQ = db.data.lockup && db.data.lockup.notify || {};
    Object.keys(notify(db)).forEach(id => { const q = notify(db)[id]; const mk = Object.keys(R.members).find(k => q.to[0] === R.members[k].email); const mine = R.members[mk].name;
      const theirs = pubQ[id] ? null : R.members[R.assign[mk].to].name;
      names.filter(n => n !== mine && n !== theirs).forEach(n => ok(!(q.subject + q.text + q.html).includes(n), 'email ' + id + ' does not mention ' + n));
      if (/^santa_launch_/.test(id)) ok(!pubQ[id] && (q.html + q.text).includes(theirs), 'the launch email names their own giftee'); });
    ok(!Object.keys(pubQ).some(i => /^santa_/.test(i)), 'nothing of the real Santa on the public queue');
    Object.values(notify(db)).forEach(q => ok(!/[\u2013\u2014]| - /.test(q.subject + q.text), 'no dashes: ' + q.subject));
  }
  /* c. launch with reminders off: one email, says open the app; no weekly or eve */
  {
    const db = fakeDb({ santa: { members: memberMap(ELVES.slice(0, 3)), settings: { exchange: '2026-12-21', reminders: false } } });
    db.data.santa.drawRequest = { mode: 'draw', byName: 'Dan' }; await runAt(db, '2026-11-09T10:00:00Z');
    const drawId = db.data.santa.draw.id;
    db.data.santa.launchRequest = { byName: 'Dan' }; await runAt(db, '2026-11-09T10:15:00Z');
    eq(db.data.santa.launched.drawId, drawId, 'launch keeps an existing draw');
    eq(ids(db, /^santa_launch_/).length, 3); ok(/Secret Santa is live/.test(notify(db)[ids(db, /^santa_launch_/)[0]].subject), 'launch subject');
    for (const t of ['2026-11-16T10:00:00Z', '2026-11-23T10:00:00Z', '2026-12-19T10:00:00Z']) await runAt(db, t);
    eq(ids(db, /^santa_(announce|weekly|eve)_/).length, 0, 'reminders off: no weekly or eve; no announce email either');
  }
  /* d. launch refused without the exchange day; leftover announceTs without Go reveals nothing; impossible draw refused */
  {
    const db = fakeDb({ santa: { members: memberMap(ELVES.slice(0, 3)), settings: {} } });
    db.data.santa.launchRequest = { byName: 'Dan' }; await runAt(db, '2026-11-09T10:00:00Z');
    ok(!db.data.santa.launched && /exchange day/.test(db.data.santa.drawError.msg), 'no launch without the exchange day');
    /* announceTs in the past, live still false: no emails, still Coming soon */
    db.data.santa.settings = { announceTs: T('2026-11-01T10:00:00Z') };
    await runAt(db, '2026-11-09T10:10:00Z');
    ok(!db.data.santa.launched && db.data.santa.settings.live !== true, 'announceTs alone does not go live');
    eq(ids(db, /./).length, 0, 'announceTs alone sends no email');
    const k = Object.keys(db.data.santa.members);
    Object.assign(db.data.santa, { settings: { exchange: '2026-12-18' }, exclusions: { [k[0]]: { [k[1]]: true, [k[2]]: true } }, launchRequest: { byName: 'Dan' } });
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
  /* opt in / opt out sync */
  {
    const db = fakeDb({
      lockup: { config: { team: { dan: { name: 'Dan', email: 'daniel.cane@hedinautomotive.co.uk', active: true } }, managers: { will: { name: 'Will', email: 'will.potter@hedinautomotive.co.uk' } } } },
      santa: { settings: { live: false }, optins: {
        Tkaaaaaaaaaaaaaaaaaaaaaaaa12: { name: 'Tina', email: 'tina.graham@hedinautomotive.co.uk', invitedTs: 1, choice: 'in', choiceTs: 2 },
        Tkbbbbbbbbbbbbbbbbbbbbbbbbb12: { name: 'Dan', email: 'daniel.cane@hedinautomotive.co.uk', invitedTs: 1, choice: 'in', choiceTs: 2 },
        Tkcccccccccccccccccccccccc12: { name: 'Lisa', email: 'lisa.debono@hedinautomotive.co.uk', invitedTs: 1, choice: 'out', choiceTs: 2 },
        Tkdddddddddddddddddddddddd12: { name: 'Faith', email: 'faith.marcus@hedinautomotive.co.uk', invitedTs: 1 }
      }, members: { [K('lisa.debono@hedinautomotive.co.uk')]: { name: 'Lisa', email: 'lisa.debono@hedinautomotive.co.uk', extra: true, ts: 1 } } }
    });
    const logs = [];
    await S.runRoot(db, 'santa', { log: m => logs.push(m), nowMs: Date.parse('2026-11-10T12:00:00Z'), notifyRoot: 'lockup/notify' });
    const R = db.data.santa;
    ok(R.members[K('tina.graham@hedinautomotive.co.uk')] && R.members[K('tina.graham@hedinautomotive.co.uk')].extra === true, 'opted in extras are added to the nice list');
    ok(R.members[K('daniel.cane@hedinautomotive.co.uk')] && R.members[K('daniel.cane@hedinautomotive.co.uk')].team === 'dan', 'opted in team people keep their team id');
    ok(!R.members[K('lisa.debono@hedinautomotive.co.uk')], 'opted out people are taken off the nice list');
    ok(!R.members[K('faith.marcus@hedinautomotive.co.uk')], 'no reply yet means not on the list');
    eq(R.replies[K('tina.graham@hedinautomotive.co.uk')].choice, 'in');
    eq(R.replies[K('lisa.debono@hedinautomotive.co.uk')].choice, 'out');
    eq(R.replies[K('faith.marcus@hedinautomotive.co.uk')].choice, 'pending');
    ok(!Object.values(R.replies).some(x => x.token), 'replies never carry the token');
    ok(logs.every(m => !/Tina|Lisa|Faith|Graham|Debono/.test(m)), 'the opt in log never names anyone');

    /* change mind: Faith opts in, Tina opts out */
    db.data.santa.optins.Tkdddddddddddddddddddddddd12.choice = 'in';
    db.data.santa.optins.Tkdddddddddddddddddddddddd12.choiceTs = 3;
    db.data.santa.optins.Tkaaaaaaaaaaaaaaaaaaaaaaaa12.choice = 'out';
    db.data.santa.optins.Tkaaaaaaaaaaaaaaaaaaaaaaaa12.choiceTs = 3;
    await S.syncOptins(db, 'santa', { log: () => {}, nowMs: Date.parse('2026-11-10T12:05:00Z') });
    ok(db.data.santa.members[K('faith.marcus@hedinautomotive.co.uk')], 'changing your mind to in adds you');
    ok(!db.data.santa.members[K('tina.graham@hedinautomotive.co.uk')], 'changing your mind to out takes you off');

    /* after a draw the list is frozen */
    db.data.santa.draw = { id: 'd1', ts: 1, count: 2 };
    db.data.santa.optins.Tkcccccccccccccccccccccccc12.choice = 'in';
    await S.syncOptins(db, 'santa', { log: () => {}, nowMs: Date.parse('2026-11-10T12:10:00Z') });
    ok(!db.data.santa.members[K('lisa.debono@hedinautomotive.co.uk')], 'after the draw, a late opt in is not added');

    /* names out: guestGift is the person's own pairing only */
    const db2 = fakeDb({
      santa: {
        settings: { live: true, announceTs: Date.parse('2026-11-14T10:00:00Z') },
        members: { a: { name: 'Ann', email: 'ann@x.com' }, b: { name: 'Bob', email: 'bob@x.com' } },
        assign: { [K('ann@x.com')]: { to: K('bob@x.com'), name: 'Bob', drawId: 'd9' }, [K('bob@x.com')]: { to: K('ann@x.com'), name: 'Ann', drawId: 'd9' } },
        wish: { [K('bob@x.com')]: { text: 'Fluffy socks', ts: 1 } },
        optins: { TokAAAAAAAAAAAAAAAABBBBBBBB12: { name: 'Ann', email: 'ann@x.com', choice: 'in', choiceTs: 1 } },
        draw: { id: 'd9', ts: 1, count: 2 }
      }
    });
    await S.syncOptins(db2, 'santa', { log: () => {}, nowMs: Date.parse('2026-11-14T11:00:00Z') });
    const g = db2.data.santa.guestGift.TokAAAAAAAAAAAAAAAABBBBBBBB12;
    eq(g.name, 'Bob');
    eq(g.to, K('bob@x.com'));
    eq(g.wish, 'Fluffy socks');
    ok(!db2.data.santa.guestGift[K('bob@x.com')], 'nobody else gets a gift record under a guessable key');
  }

  /* weekly reminders only go to people still on the nice list (opted in) */
  {
    const db = fakeDb({
      santa: {
        settings: { budget: 20, exchange: '2026-12-18', live: true, reminders: true },
        launched: { ts: T('2026-11-10T12:00:00Z'), byName: 'Dan', drawId: 'd1' },
        draw: { id: 'd1', ts: 1, count: 3 },
        members: memberMap(['holly.berry@example.com', 'ivy.green@example.com']),
        mail: { launch: T('2026-11-10T12:00:00Z') }
      }
    });
    await runAt(db, '2026-11-16T10:05:00Z');
    eq(ids(db, /^santa_weekly_/).length, 2, 'weekly only for the two who opted in');
    ok(!ids(db, /noel|rudy|carol|nick|eve/).length, 'opted out or unlisted people get no weekly');
  }

  /* launch day rehearsal, 14 November: organiser overrides, guests with and without a link, no token on the public queue */
  {
    const H = e => e + '@hedinautomotive.co.uk', keyOf2 = S.keyOf;
    const reply = T('2026-11-12T09:00:00Z'), added = T('2026-11-14T08:30:00Z');
    const db = fakeDb({
      lockup: { config: { team: { danny: { name: 'Danny', email: H('danny.page'), active: true }, dan: { name: 'Dan', email: H('daniel.cane'), active: true } }, managers: { will: { name: 'Will', email: H('will.potter') } } } },
      santa: {
        settings: { budget: 20, exchange: '2026-12-05', live: false, reminders: true, optInUntil: T('2026-11-14T23:59:59Z') },
        optins: {
          TokDannyAAAAAAAAAAAAAAAAAA12: { name: 'Danny', email: H('danny.page'), invitedTs: 1, choice: 'out', choiceTs: reply },
          TokTinaBBBBBBBBBBBBBBBBBBBB12: { name: 'Tina', email: H('tina.graham'), invitedTs: 1, choice: 'in', choiceTs: reply },
          TokFaithCCCCCCCCCCCCCCCCCCC12: { name: 'Faith', email: H('faith.marcus'), invitedTs: 1, choice: 'in', choiceTs: reply },
          TokWillDDDDDDDDDDDDDDDDDDDD12: { name: 'Will', email: H('will.potter'), invitedTs: 1, choice: 'in', choiceTs: reply }
        },
        members: { [K(H('daniel.cane'))]: { name: 'Dan', email: H('daniel.cane'), team: 'dan', ts: 1 } }
      }
    });
    /* the morning's runs put the I'm ins on the list */
    await S.runRoot(db, 'santa', { log: () => {}, nowMs: T('2026-11-14T08:00:00Z'), notifyRoot: 'lockup/notify' });
    const R = db.data.santa;
    ok(R.members[K(H('tina.graham'))] && R.members[K(H('faith.marcus'))] && R.members[K(H('will.potter'))], 'I am in replies are on the list');
    ok(!R.members[K(H('danny.page'))], 'Danny said not this year, so he is off for now');
    /* Dan adds Danny and Ruby in Elf HQ, and takes Faith off */
    R.members[K(H('danny.page'))] = { name: 'Danny', email: H('danny.page'), team: 'danny', ts: added };
    R.members[K(H('ruby.kemp'))] = { name: 'Ruby', email: H('ruby.kemp'), extra: true, ts: added };
    delete R.members[K(H('faith.marcus'))];
    await S.runRoot(db, 'santa', { log: () => {}, nowMs: T('2026-11-14T08:45:00Z'), notifyRoot: 'lockup/notify' });
    ok(R.members[K(H('danny.page'))], 'an organiser adding someone after their not this year keeps them in');
    eq(R.replies[K(H('danny.page'))].choice, 'in'); ok(R.replies[K(H('danny.page'))].elves, 'the reply says Elf HQ changed it');
    ok(!R.members[K(H('faith.marcus'))], 'an organiser taking someone off after their I am in keeps them off');
    eq(R.replies[K(H('faith.marcus'))].choice, 'out');
    ok(R.members[K(H('ruby.kemp'))], 'an Elf HQ extra with no opt in link stays on the list');
    /* Dan presses Go */
    R.launchRequest = { byName: 'Dan', ts: T('2026-11-14T10:00:00Z') };
    await S.runRoot(db, 'santa', { log: () => {}, nowMs: T('2026-11-14T10:15:00Z'), notifyRoot: 'lockup/notify' });
    const keys = Object.keys(R.members);
    eq(keys.length, 5, 'Dan, Danny, Tina, Will and Ruby are drawn');
    eq(R.draw.count, 5); ok(bijection(keys, R.sealed.pairs), 'the launch draw is a bijection');
    keys.forEach(k => ok(R.assign[k] && R.assign[k].to !== k, 'nobody draws themselves'));
    ok(R.settings.live === true && R.launched, 'live after Go');
    const pub = db.data.lockup.notify || {}, priv = (db.data.lockupPrivate || {}).notify || {};
    const all = Object.assign({}, pub, priv);
    eq(Object.keys(all).filter(i => /^santa_launch_/.test(i)).length, 5, 'one launch email each');
    const toOf = i => all[i].to[0];
    const privTo = Object.keys(priv).map(i => priv[i].to[0]).sort();
    eq(privTo.length, 5, 'every launch email carries a personal link, so all five are on the private queue');
    eq(Object.keys(pub).filter(i => /^santa_/.test(i)).length, 0, 'nothing Santa on the public queue');
    const linkOf = e => { const m = /optin\.html\?t=([A-Za-z0-9_-]+)/.exec(priv[Object.keys(priv).find(i => toOf(i) === e)].html); return m && m[1]; };
    keys.forEach(k => { const t = linkOf(R.members[k].email); ok(t && R.optins[t] && R.optins[t].choice === 'in' && keyOf2(R.optins[t].email) === k, 'personal link for ' + R.members[k].name); ok(R.guestGift[t] && R.guestGift[t].to === R.assign[k].to, 'the link opens on their own pairing'); });
    eq(linkOf(H('danny.page')), 'TokDannyAAAAAAAAAAAAAAAAAA12', 'Danny keeps his own link, now switched to in');
    ok(linkOf(H('ruby.kemp')) && linkOf(H('daniel.cane')), 'Ruby and Dan, who had no link, get a new one');
    eq(new Set(keys.map(k => linkOf(R.members[k].email))).size, 5, 'five different links');
    ok(/optin\.html\?t=TokTinaBBBBBBBBBBBBBBBBBBBB12/.test(priv[Object.keys(priv).find(i => toOf(i) === H('tina.graham'))].html), 'Tina gets her own link');
    ok(!/c=in|c=out/.test(JSON.stringify(priv)), 'the personal link carries no choice, so tapping it cannot flip anything');
    ok(!/Tok[A-Za-z]+[0-9]{2}/.test(JSON.stringify(db.data.lockup)), 'no token anywhere on the public lockup tree');
    Object.values(priv).forEach(m => ok(/no sign in needed/.test(m.text) && !/PIN/.test(m.text), 'no email asks anybody to sign in'));
    Object.values(priv).forEach(m => ok(!/\byoure\b|&#\d+;/.test(m.text) && !/the app/.test(m.text + m.subject), 'plain text reads properly and never mentions an app'));
    Object.keys(all).forEach(i => { const k = keyOf2(all[i].to[0]), g = R.members[R.assign[k].to].name; ok(/^santa_launch_/.test(i) ? all[i].html.indexOf(g) >= 0 && all[i].text.indexOf(g) >= 0 : true, 'the launch email names their own giftee (' + g + ')'); Object.values(R.members).map(x => x.name).filter(n => n !== g && n !== R.members[k].name && n !== 'Dan').forEach(n => ok(!new RegExp('\\b' + n + '\\b').test(all[i].subject + all[i].text + all[i].html), 'and nobody else (' + n + ')')); });
    ok(R.guestGift && R.guestGift.TokTinaBBBBBBBBBBBBBBBBBBBB12 && R.guestGift.TokTinaBBBBBBBBBBBBBBBBBBBB12.to === R.assign[K(H('tina.graham'))].to, 'Tina sees her own pairing on her link');
    ok(!R.guestGift.TokFaithCCCCCCCCCCCCCCCCCCC12, 'no gift record for a link that is not in the draw');
    /* the next two runs send nothing new and change nothing */
    const before = JSON.stringify(R.sealed) + Object.keys(all).length;
    await S.runRoot(db, 'santa', { log: () => {}, nowMs: T('2026-11-14T10:30:00Z'), notifyRoot: 'lockup/notify' });
    await S.runRoot(db, 'santa', { log: () => {}, nowMs: T('2026-11-14T10:45:00Z'), notifyRoot: 'lockup/notify' });
    const all2 = Object.assign({}, db.data.lockup.notify, db.data.lockupPrivate.notify);
    eq(JSON.stringify(R.sealed) + Object.keys(all2).length, before, 'later runs neither redraw nor email again');
    /* Faith taps I am in again after the launch: the list is locked */
    R.optins.TokFaithCCCCCCCCCCCCCCCCCCC12.choiceTs = T('2026-11-14T11:00:00Z');
    await S.runRoot(db, 'santa', { log: () => {}, nowMs: T('2026-11-14T11:15:00Z'), notifyRoot: 'lockup/notify' });
    ok(!R.members[K(H('faith.marcus'))], 'after Go nobody is added');
    /* the Monday reminder: the link holders on the private queue again, nobody twice */
    await S.runRoot(db, 'santa', { log: () => {}, nowMs: T('2026-11-16T10:05:00Z'), notifyRoot: 'lockup/notify' });
    eq(Object.keys(Object.assign({}, db.data.lockup.notify, db.data.lockupPrivate.notify)).filter(i => /^santa_weekly_/.test(i)).length, 0, 'no weekly inside the launch first two days');
    await S.runRoot(db, 'santa', { log: () => {}, nowMs: T('2026-11-23T10:05:00Z'), notifyRoot: 'lockup/notify' });
    const wk = Object.assign({}, db.data.lockup.notify, db.data.lockupPrivate.notify);
    eq(Object.keys(wk).filter(i => /^santa_weekly_/.test(i)).length, 5, 'one weekly each');
    ok(!/Tok[A-Za-z]+[0-9]{2}/.test(JSON.stringify(db.data.lockup)), 'still no token on the public tree');
    /* lockup in test mode: nothing private, nothing with a token */
    const dbT = fakeDb(JSON.parse(JSON.stringify(db.data)));
    dbT.data.lockupPrivate = {}; dbT.data.lockupTest = {}; dbT.data.santa.mail = {}; 
    await S.runRoot(dbT, 'santa', { log: () => {}, nowMs: T('2026-11-23T10:20:00Z'), notifyRoot: 'lockupTest/notify' });
    ok(!Object.keys(dbT.data.lockupPrivate.notify || {}).length && !/Tok[A-Za-z]+[0-9]{2}/.test(JSON.stringify(dbT.data.lockupTest)), 'test mode never sends a personal link');
  }
  /* the false start: this morning's launch gets one follow up each, naming the person */
  {
    const db = fakeDb({ santa: { members: memberMap(ELVES.slice(0, 4)), settings: { budget: 20, exchange: '2026-12-05', live: false, reminders: true } } });
    db.data.santa.launchRequest = { byName: 'Dan', ts: T('2026-11-14T09:58:00Z') };
    await runAt(db, '2026-11-14T09:59:38Z');
    eq(ids(db, /^santa_launch_/).length, 4); eq(ids(db, /^santa_restart_/).length, 0, 'no follow up in the launch run itself');
    await runAt(db, '2026-11-14T10:30:00Z');
    const R = db.data.santa, rs = ids(db, /^santa_restart_/);
    eq(rs.length, 4, 'one false start email each');
    rs.forEach(i => { const q = notify(db)[i], k = Object.keys(R.members).find(x => R.members[x].email === q.to[0]), g = R.members[R.assign[k].to].name;
      ok(/False start/.test(q.subject) && q.html.includes(g) && q.text.includes(g) && /optin\.html\?t=/.test(q.html), 'false start names ' + g + ' with the link');
      ok(db.data.lockupPrivate.notify[i], 'and it is on the private queue'); });
    await runAt(db, '2026-11-14T10:45:00Z'); await runAt(db, '2026-11-16T10:05:00Z');
    eq(ids(db, /^santa_restart_/).length, 4, 'never twice');
    /* next year's launch never gets one */
    const db2 = fakeDb({ santa: { members: memberMap(ELVES.slice(0, 3)), settings: { exchange: '2027-12-05', live: false } } });
    db2.data.santa.launchRequest = { byName: 'Dan', ts: T('2027-11-14T09:58:00Z') };
    await runAt(db2, '2027-11-14T09:59:00Z'); await runAt(db2, '2027-11-14T10:30:00Z');
    eq(ids(db2, /^santa_restart_/).length, 0, 'a later launch gets no false start email');
  }
  /* a change of mind after the organiser's change still counts */
  {
    const db = fakeDb({ santa: { settings: { live: false }, optins: { TokFaithCCCCCCCCCCCCCCCCCCC12: { name: 'Faith', email: 'f@x.com', invitedTs: 1, choice: 'in', choiceTs: T('2026-11-12T09:00:00Z') } }, members: {} } });
    await S.syncOptins(db, 'santa', { log: () => {}, nowMs: T('2026-11-13T09:00:00Z') });
    delete db.data.santa.members[K('f@x.com')];
    await S.syncOptins(db, 'santa', { log: () => {}, nowMs: T('2026-11-13T09:15:00Z') });
    ok(!db.data.santa.members[K('f@x.com')], 'removed in Elf HQ, stays off');
    db.data.santa.optins.TokFaithCCCCCCCCCCCCCCCCCCC12.choiceTs = T('2026-11-13T10:00:00Z');
    await S.syncOptins(db, 'santa', { log: () => {}, nowMs: T('2026-11-13T10:15:00Z') });
    ok(db.data.santa.members[K('f@x.com')], 'tapping I am in again afterwards puts them back');
  }
  console.log('santa: all ' + checks + ' checks passed');
})().catch(e => { console.error(e); process.exit(1); });
