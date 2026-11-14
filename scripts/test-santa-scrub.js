#!/usr/bin/env node
/* A sent Secret Santa email keeps only its marker: the lockup tree is world readable. */
'use strict';
const assert = require('assert');
const { scrubSanta } = require('./lockup-mail.js');
function fakeDb(data) {
  const parts = p => String(p).split('/').filter(Boolean);
  const node = (p, make) => { let o = data; for (const k of parts(p)) { if (o[k] == null) { if (!make) return null; o[k] = {}; } o = o[k]; } return o; };
  return { data, ref: p => ({ update: async v => { const o = node(p, true); Object.keys(v).forEach(k => { if (v[k] == null) delete o[k]; else o[k] = v[k]; }); } }) };
}
(async () => {
  const link = 'https://dan-sells.co.uk/santa/optin.html?t=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const data = { lockup: { notify: {
    santa_optin_tina: { to: ['t@x'], subject: 'Secret Santa', html: '<a href="' + link + '">', text: link, sent: 1, ts: 1 },
    santa_launch_ruby: { to: ['r@x'], subject: 'live', html: 'x', text: 'y', ts: 2 },
    rc_live_2026_x: { subject: 'cover', html: 'keep me', text: 'keep', sent: 1, ts: 3 }
  } }, lockupPrivate: { notify: { santa_launch_dan: { to: ['d@x'], html: 'Ruby', text: 'Ruby', sent: 5 } } } };
  const db = fakeDb(data);
  const queue = Object.assign({}, data.lockup.notify, data.lockupPrivate.notify);
  const paths = { santa_launch_dan: 'lockupPrivate/notify/santa_launch_dan' };
  const logs = [];
  let n = await scrubSanta(db, JSON.parse(JSON.stringify(queue)), paths, 'lockup', true, m => logs.push(m));
  assert.strictEqual(n, 2); assert.ok(data.lockup.notify.santa_optin_tina.html, 'a dry run changes nothing');
  n = await scrubSanta(db, JSON.parse(JSON.stringify(queue)), paths, 'lockup', false, m => logs.push(m));
  assert.strictEqual(n, 2, 'both sent Santa emails scrubbed');
  const t = data.lockup.notify.santa_optin_tina;
  assert.ok(t.sent && !t.html && !t.text && t.scrubbed, 'the opt in email keeps only its marker');
  assert.ok(!JSON.stringify(data.lockup).includes('optin.html?t='), 'no personal link left on the public tree');
  assert.ok(!data.lockupPrivate.notify.santa_launch_dan.html, 'a sent private one is scrubbed too');
  assert.strictEqual(data.lockup.notify.santa_launch_ruby.html, 'x', 'an unsent one is left to be sent');
  assert.strictEqual(data.lockup.notify.rc_live_2026_x.html, 'keep me', 'other emails untouched');
  assert.strictEqual(await scrubSanta(db, JSON.parse(JSON.stringify(Object.assign({}, data.lockup.notify))), {}, 'lockup', false, () => {}), 0, 'a second run does nothing');
  assert.ok(logs.every(l => !/tina|ruby|optin/i.test(l)), 'the log names nobody');
  console.log('santa scrub: ok');
})().catch(e => { console.error(e); process.exit(1); });
