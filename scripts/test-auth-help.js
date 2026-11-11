#!/usr/bin/env node
/* Tests scripts/auth-help.js against an in-memory database and a fake Firebase Auth.
 *   node scripts/test-auth-help.js */
'use strict';
const assert = require('assert');
const AH = require('./auth-help.js');
const NOW = Date.parse('2026-11-11T13:00:00Z'), MIN = 60e3;
let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('ok   ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } }

function fakeDb(data) {
  const parts = p => String(p || '').split('/').filter(Boolean);
  const get = p => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), data);
  const set = (p, v) => { const ps = parts(p); let o = data; ps.slice(0, -1).forEach(k => { if (o[k] == null) o[k] = {}; o = o[k]; }); if (v == null) delete o[ps[ps.length - 1]]; else o[ps[ps.length - 1]] = JSON.parse(JSON.stringify(v)); };
  let seq = 0;
  const ref = p => ({
    get: async () => ({ val: () => { const v = get(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }),
    set: async v => set(p, v), remove: async () => set(p, null),
    push: async v => set(p + '/k' + (++seq), v),
    update: async o => Object.keys(o).forEach(k => set((p ? p + '/' : '') + k, o[k]))
  });
  return { ref, data };
}
function fakeAuth(users, opts) {
  opts = opts || {};
  const calls = [];
  return {
    calls,
    getUser: async uid => { const u = users.find(x => x.uid === uid); if (!u) { const e = new Error('no user'); e.code = 'auth/user-not-found'; throw e; } return u; },
    listUsers: async () => ({ users }),
    updateUser: async (uid, ch) => { calls.push(['update', uid, ch]); Object.assign(users.find(x => x.uid === uid), ch); },
    generateEmailVerificationLink: async (em, s) => { calls.push(['link', em, s && s.url]); if (s && opts.noContinue) throw Object.assign(new Error('x'), { code: 'auth/unauthorized-continue-uri' }); s = s || { url: 'https://forecourt-1b6bc.firebaseapp.com' }; if (em.indexOf('boom') === 0) throw Object.assign(new Error('x'), { code: 'auth/internal-error' }); return 'https://forecourt-1b6bc.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=X&continueUrl=' + encodeURIComponent(s.url); }
  };
}
const pw = [{ providerId: 'password' }];
const user = (uid, email, minsAgo, extra) => Object.assign({ uid, email, emailVerified: false, disabled: false, providerData: pw, metadata: { creationTime: new Date(NOW - minsAgo * MIN).toUTCString() } }, extra || {});
const CFG = { team: { danny: { name: 'Danny', email: 'danny.willis@hedinautomotive.co.uk' } }, managers: { sergio: { name: 'Sergio', email: 'Sergio.Garaguso@hedinautomotive.co.uk' } } };

(async () => {
  /* Sergio: account made 17 minutes ago, Firebase email went nowhere, no request on file (before this existed) */
  {
    const users = [user('serg', 'sergio.garaguso@hedinautomotive.co.uk', 17), user('dw', 'danny.willis@hedinautomotive.co.uk', 60 * 28),
      user('stranger', 'random.person@hedinautomotive.co.uk', 30), user('old', 'danny.willis@hedinautomotive.co.uk', 60 * 24 * 30, { uid: 'old' }),
      user('ok', 'mon.singh@hedinautomotive.co.uk', 10, { emailVerified: true })];
    const db = fakeDb({ lockup: { config: CFG } }), auth = fakeAuth(users), sent = [];
    const r = await AH.run(db, { auth, nowMs: NOW, from: 'bot@x', sendMail: async m => sent.push(m), log: () => {} });
    check('sweep: Sergio and Danny (on the lists, unverified, recent) are emailed', r.mailed.sort().join() === 'danny.willis@hedinautomotive.co.uk,sergio.garaguso@hedinautomotive.co.uk', JSON.stringify(r));
    check('sweep: nobody off the lists, verified, or older than 14 days', sent.length === 2);
    const m = sent.find(x => x.to[0].indexOf('sergio') === 0);
    check('mail: from Ruxley Team on our own address', m.from.name === 'Ruxley Team' && m.from.address === 'bot@x');
    check('mail: carries the Firebase verify link back to team.html, and greets by name', /mode=verifyEmail/.test(m.html) && /dan-sells\.co\.uk%2Fteam\.html/.test(m.text) && /Hi Sergio,/.test(m.text));
    check('mail: no dashes in the visible copy', !/[\u2013\u2014]| - /.test(m.text.replace(/https?:\S+/g, '')));
    check('sweep: a sweep find is listed for admins to verify', db.data.authHelp.verifyReq.serg.email === 'sergio.garaguso@hedinautomotive.co.uk');
    check('log: each send is logged and marked', db.data.authHelp.sent.serg.count === 1 && Object.values(db.data.authHelp.log.serg)[0].what === 'mailed');
    const again = await AH.run(db, { auth, nowMs: NOW + 5 * MIN, from: 'bot@x', sendMail: async m => sent.push(m), log: () => {} });
    check('sweep: a second run sends nothing more', again.mailed.length === 0 && sent.length === 2, JSON.stringify(again));
  }
  /* request path: waits for Firebase first, then sends; repeat requests are spaced and capped */
  {
    const users = [user('u1', 'new.person@hedinautomotive.co.uk', 1)];
    const db = fakeDb({ authHelp: { verifyReq: { u1: { email: 'new.person@hedinautomotive.co.uk', ts: NOW - 30e3 } } } }), auth = fakeAuth(users), sent = [];
    const go = (t) => AH.run(db, { auth, nowMs: t, from: 'bot@x', sendMail: async m => sent.push(m), log: () => {}, sweep: false });
    await go(NOW);
    check('request: not sent in the first two minutes (Firebase gets a chance)', sent.length === 0);
    await go(NOW + 3 * MIN);
    check('request: sent once two minutes have passed', sent.length === 1);
    await go(NOW + 4 * MIN);
    check('request: the same request is not answered twice', sent.length === 1);
    db.data.authHelp.verifyReq.u1.ts = NOW + 5 * MIN;
    await go(NOW + 8 * MIN);
    check('request: a new request inside 10 minutes waits', sent.length === 1);
    await go(NOW + 16 * MIN);
    check('request: after 10 minutes it is answered', sent.length === 2);
    for (let i = 1; i <= 4; i++) { db.data.authHelp.verifyReq.u1.ts = NOW + (16 + i * 11) * MIN; await go(NOW + (19 + i * 11) * MIN); }
    check('request: at most four a day', sent.length === 4, String(sent.length));
  }
  /* a Firebase client error makes it send straight away; verified people are tidied, not mailed */
  {
    const users = [user('u2', 'a.b@hedinautomotive.co.uk', 0), user('u3', 'c.d@hedinautomotive.co.uk', 5, { emailVerified: true }), user('u4', 'boom.x@hedinautomotive.co.uk', 10)];
    const db = fakeDb({ authHelp: { verifyReq: { u2: { email: 'a.b@hedinautomotive.co.uk', ts: NOW - 5e3, clientErr: 'auth/internal-error' }, u3: { email: 'c.d@hedinautomotive.co.uk', ts: NOW - 5 * MIN }, u4: { email: 'boom.x@hedinautomotive.co.uk', ts: NOW - 5 * MIN } } } });
    const auth = fakeAuth(users), sent = [];
    const r = await AH.run(db, { auth, nowMs: NOW, from: 'bot@x', sendMail: async m => sent.push(m), log: () => {}, sweep: false });
    check('client error: sent at once', r.mailed.indexOf('a.b@hedinautomotive.co.uk') >= 0);
    check('verified already: request cleared, nothing sent', !db.data.authHelp.verifyReq.u3 && !sent.some(m => m.to[0] === 'c.d@hedinautomotive.co.uk'));
    check('a failed link is logged with its error, never silent', r.failed.indexOf('u4') >= 0 && Object.values(db.data.authHelp.log.u4)[0].err === 'auth/internal-error');
  }
  /* approval: an admin verified them in person */
  {
    const users = [user('u5', 'e.f@hedinautomotive.co.uk', 30)];
    const db = fakeDb({ authHelp: { verifyReq: { u5: { email: 'e.f@hedinautomotive.co.uk', ts: NOW - 30 * MIN } }, approve: { u5: { by: 'dan1', ts: NOW - MIN } } } });
    const auth = fakeAuth(users), sent = [];
    const r = await AH.run(db, { auth, nowMs: NOW, from: 'bot@x', sendMail: async m => sent.push(m), log: () => {}, sweep: false });
    check('approve: marks the email verified and clears the request', users[0].emailVerified === true && !db.data.authHelp.approve.u5 && !db.data.authHelp.verifyReq.u5, JSON.stringify(r));
    check('approve: logged with who approved, and no email sent', Object.values(db.data.authHelp.log.u5)[0].by === 'dan1' && sent.length === 0);
  }
  /* the continue URL domain is not authorised (live, 11 Nov): falls back to the plain link */
  {
    const users = [user('serg', 'sergio.garaguso@hedinautomotive.co.uk', 60)];
    const db = fakeDb({ lockup: { config: CFG } }), auth = fakeAuth(users, { noContinue: true }), sent = [];
    const r = await AH.run(db, { auth, nowMs: NOW, from: 'bot@x', sendMail: async m => sent.push(m), log: () => {} });
    check('unauthorised continue URL: still sends, with the plain Firebase link', r.mailed.length === 1 && sent.length === 1 && /mode=verifyEmail/.test(sent[0].text) && r.failed.length === 0, JSON.stringify(r));
  }
  /* dry run writes and sends nothing */
  {
    const users = [user('serg', 'sergio.garaguso@hedinautomotive.co.uk', 17)];
    const db = fakeDb({ lockup: { config: CFG } }), auth = fakeAuth(users), before = JSON.stringify(db.data);
    let n = 0;
    const r = await AH.run(db, { auth, nowMs: NOW, dry: true, from: 'bot@x', sendMail: async () => n++, log: () => {} });
    check('dry run: reports, but sends and writes nothing', r.mailed.length === 1 && n === 0 && JSON.stringify(db.data) === before);
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
