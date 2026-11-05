#!/usr/bin/env node
'use strict';
const assert = require('assert');
const M = require('./showroom-cover-launch-mail.js');

const m = M.build();
assert.strictEqual(m.subject, 'New: Showroom cover rota starts today');
assert.strictEqual(m.fromName, 'Will, Nathan and Serge');
assert.ok(m.text.indexOf("Today's lockup is now always shown at the bottom of the team board.") >= 0);
assert.ok(m.text.indexOf('Will, Nathan and Serge') >= 0);
assert.ok(m.html.indexOf('<ul>') >= 0 && m.html.indexOf('<li>') >= 0);
assert.ok(m.html.indexOf('I&#39;m covering') >= 0 || m.html.indexOf("I'm covering") >= 0 || m.text.indexOf("I'm covering") >= 0);
assert.strictEqual(m.flagPath, 'lockup/mail/showroom-cover-launch');

const r = M.recipients({
  team: { a: { email: 'a@hedinautomotive.co.uk', active: true }, b: { email: 'b@hedinautomotive.co.uk', active: false }, c: { name: 'NoMail' } },
  managers: { w: { email: 'will@hedinautomotive.co.uk' }, n: { email: 'nathan@hedinautomotive.co.uk' } }
});
assert.deepStrictEqual(r.to, ['a@hedinautomotive.co.uk']);
assert.deepStrictEqual(r.cc.sort(), ['nathan@hedinautomotive.co.uk', 'will@hedinautomotive.co.uk']);

(async () => {
  const sends = [];
  const store = {};
  const db = { ref(path) { return {
    async get() { return { val: () => store[path] || null }; },
    async set(v) { store[path] = v; }
  }; } };
  const transport = { sendMail(msg) { sends.push(msg); return Promise.resolve(); } };
  const cfg = { team: { tomi: { email: 'tomi@hedinautomotive.co.uk', active: true } }, managers: { will: { email: 'will@hedinautomotive.co.uk' } } };

  let r1 = await M.maybeSend({ db, transport, dry: true, fromAddress: 'x@y.z', cfg });
  assert.strictEqual(r1.reason, 'dry');
  assert.strictEqual(sends.length, 0);
  assert.ok(!store[M.FLAG_PATH], 'dry run must not set the sent flag');

  let r2 = await M.maybeSend({ db, transport, dry: false, fromAddress: 'x@y.z', cfg });
  assert.strictEqual(r2.sent, true);
  assert.strictEqual(sends.length, 1);
  assert.strictEqual(sends[0].from.name, 'Will, Nathan and Serge');
  assert.deepStrictEqual(sends[0].to, ['tomi@hedinautomotive.co.uk']);
  assert.deepStrictEqual(sends[0].cc, ['will@hedinautomotive.co.uk']);
  assert.strictEqual(sends[0].subject, M.SUBJECT);
  assert.ok(store[M.FLAG_PATH] && store[M.FLAG_PATH].sent === true);

  let r3 = await M.maybeSend({ db, transport, dry: false, fromAddress: 'x@y.z', cfg });
  assert.strictEqual(r3.reason, 'already');
  assert.strictEqual(sends.length, 1, 'second send must not fire again');
  console.log('ok: launch email builds, dry-runs, sends once, then refuses');
})().catch(e => { console.error(e); process.exit(1); });
