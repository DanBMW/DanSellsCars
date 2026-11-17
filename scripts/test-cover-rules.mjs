/* Tests the showroom cover personal links (coverLink / coverLinkTest) and the
 * second seats on reception (am2, mid2, pm2) in database.rules.json, in the
 * Firebase emulator. Same setup as scripts/test-shifts-rules.mjs (see the top
 * of that file). Nothing touches the real database. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, serverTimestamp } from 'firebase/database';
import { readFileSync } from 'fs';

const rules = readFileSync(process.env.RULES || new URL('../database.rules.json', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-forecourt', database: { rules, host: '127.0.0.1', port: 9000 } });
const H = n => n + '@hedinautomotive.co.uk';
const anon = env.unauthenticatedContext().database();
const signed = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).database();
const T = 'Ab3_dEf-ghIJklmnOPqrstUVwxyz0123'; /* 32 characters, the shape the job mints */
let n = 0; const ok = async p => { await p; n++; };

for (const [L, R, LINKS] of [['coverLink', 'lockup', 'shifts'], ['coverLinkTest', 'lockupTest', 'shiftsTest']]) {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async c => {
    await set(ref(c.database(), L + '/' + T), { date: '2026-11-18', shift: 'am2', personId: 'mon', name: 'Mon', from: '09:00', to: '12:00', ts: 1 });
    await set(ref(c.database(), 'coverLinkIdx/2026-11-18/am2_mon'), { t: T });
    await set(ref(c.database(), R + '/reception/2026-11-18/am2'), { personId: 'mon', status: 'assigned', ts: 1 });
    await set(ref(c.database(), LINKS + '/links/mon1'), 'mon');
  });

  /* a link is read by its exact token only: never listed, never the index */
  await ok(assertSucceeds(get(ref(anon, L + '/' + T))));
  await ok(assertFails(get(ref(anon, L))));
  await ok(assertFails(get(ref(anon, 'coverLinkIdx'))));
  await ok(assertFails(get(ref(anon, 'coverLinkIdx/2026-11-18'))));
  await ok(assertFails(get(ref(anon, L + '/short'))));

  /* no sign in needed to answer on your own link, stamped with the server's clock */
  await ok(assertSucceeds(set(ref(anon, L + '/' + T + '/answer'), { kind: 'covering', ts: serverTimestamp() })));
  await ok(assertSucceeds(set(ref(anon, L + '/' + T + '/answer'), { kind: 'customer', ts: serverTimestamp() })));
  await ok(assertSucceeds(set(ref(anon, L + '/' + T + '/answer'), { kind: 'other', text: 'At the dentist', ts: serverTimestamp() })));
  await ok(assertFails(set(ref(anon, L + '/' + T + '/answer'), { kind: 'other', ts: serverTimestamp() })));
  await ok(assertFails(set(ref(anon, L + '/' + T + '/answer'), { kind: 'cannot', ts: serverTimestamp() })));
  await ok(assertSucceeds(set(ref(anon, L + '/' + T + '/answer'), { kind: 'cannot', text: 'Stuck in traffic', ts: serverTimestamp() })));
  await ok(assertSucceeds(set(ref(anon, L + '/' + T + '/answer'), { kind: 'here', ts: serverTimestamp() })));
  await ok(assertSucceeds(set(ref(anon, L + '/' + T + '/answer'), { kind: 'nudge', ts: serverTimestamp() })));
  await ok(assertFails(set(ref(anon, L + '/' + T + '/answer'), { kind: 'covering', ts: 12345 })));
  await ok(assertFails(set(ref(anon, L + '/' + T + '/answer'), { kind: 'boss', ts: serverTimestamp() })));
  await ok(assertFails(set(ref(anon, L + '/' + T + '/answer'), { kind: 'covering', ts: serverTimestamp(), extra: 1 })));
  await ok(assertFails(set(ref(anon, L + '/' + T + '/answer'), { kind: 'cannot', text: 'x'.repeat(501), ts: serverTimestamp() })));

  /* nobody can write the link itself, make up a link, or reach the seat through one */
  await ok(assertFails(set(ref(anon, L + '/' + T + '/personId'), 'tomi')));
  await ok(assertFails(set(ref(anon, L + '/' + T), { personId: 'tomi' })));
  await ok(assertFails(set(ref(anon, L + '/Zz3_dEf-ghIJklmnOPqrstUVwxyz0123/answer'), { kind: 'covering', ts: serverTimestamp() })));
  await ok(assertFails(set(ref(anon, 'coverLinkIdx/2026-11-18/am2_mon'), { t: T })));
  await ok(assertFails(update(ref(anon, R + '/reception/2026-11-18/am2'), { status: 'covering', ts: Date.now() })));

  /* the second seat answers on the signed in page too (it was am|mid|pm only until 17 November) */
  const mon = signed('mon1', H('mon.singh'));
  await ok(assertSucceeds(update(ref(mon, R + '/reception/2026-11-18/am2'), { status: 'covering', personId: 'mon', ts: Date.now() })));
  await ok(assertFails(update(ref(mon, R + '/reception/2026-11-18/am3'), { status: 'covering', personId: 'mon', ts: Date.now() })));
}
await env.cleanup();
console.log('cover rules: ' + n + ' checks ok');
