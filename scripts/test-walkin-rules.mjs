/* Tests database.rules.json for walkinTaken (the team board keeps each walk-in taken for the cover job)
 * and that the person on a second seat (mid2) can say they cannot cover, in the Firebase emulator.
 * Same setup as scripts/test-cover-rules.mjs. RULES=<file> tests another rules file (the live copy). */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, serverTimestamp } from 'firebase/database';
import { readFileSync } from 'fs';

const rules = readFileSync(process.env.RULES || new URL('../database.rules.json', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-forecourt', database: { rules, host: '127.0.0.1', port: 9000 } });
const anon = env.unauthenticatedContext().database();
const board = env.authenticatedContext('board1', {}).database(); /* the board's quiet anonymous sign in */
const D = '2026-11-18', W = 'walkinTaken/' + D + '/';
let n = 0; const ok = async p => { await p; n++; };
await env.clearDatabase();
await env.withSecurityRulesDisabled(async c => {
  await set(ref(c.database(), 'lockup/reception/' + D + '/mid2'), { personId: 'clive', status: 'assigned', ts: 1 });
  await set(ref(c.database(), 'lockup/reception/' + D + '/mid'), { personId: 'mon', status: 'covering', ts: 1 });
  await set(ref(c.database(), 'shifts/links/clive1'), 'clive');
  await set(ref(c.database(), 'shifts/links/mon1'), 'mon');
});
const rec = { kind: 'walk-in-taken', assignedTo: 'Mon Singh', customer: 'Mr A', eventAt: 1795006800000, ts: serverTimestamp() };

if (process.env.SEATS_ONLY !== '1') {
  /* walkinTaken: the board writes each alert once; nobody reads it but the job */
  await ok(assertFails(set(ref(anon, W + 'AbCdEf123456'), rec)));
  await ok(assertSucceeds(set(ref(board, W + 'AbCdEf123456'), rec)));
  await ok(assertFails(set(ref(board, W + 'AbCdEf123456'), rec)));            /* once only: a second board, or a rewrite */
  await ok(assertFails(set(ref(board, W + 'AbCdEf123456'), null)));           /* never removed by a board */
  await ok(assertFails(get(ref(board, 'walkinTaken'))));
  await ok(assertFails(get(ref(anon, W + 'AbCdEf123456'))));
  await ok(assertFails(set(ref(board, W + 'Second12345'), Object.assign({}, rec, { ts: 5 }))));       /* time is the server's */
  await ok(assertFails(set(ref(board, W + 'Third123456'), Object.assign({}, rec, { kind: 'dealt' }))));
  await ok(assertFails(set(ref(board, W + 'Fourth12345'), Object.assign({}, rec, { assignedTo: '' }))));
  await ok(assertFails(set(ref(board, W + 'Fifth123456'), Object.assign({}, rec, { extra: 1 }))));
  await ok(assertFails(set(ref(board, 'walkinTaken/18-11-2026/Sixth123456'), rec)));
  await ok(assertFails(set(ref(board, W + 'bad id'), rec)));
  await ok(assertSucceeds(set(ref(board, W + 'combo:abc123:def456'), { kind: 'walkin-arrived-taken', assignedTo: 'Mon', ts: serverTimestamp() })));
}

/* the second seat: Clive on mid2 says he cannot cover, and says he is covering */
const clive = env.authenticatedContext('clive1', { email: 'clive.ankomah@hedinautomotive.co.uk', email_verified: true }).database();
await ok(assertSucceeds(update(ref(clive, 'lockup/reception/' + D + '/mid2'), { status: 'covering', personId: 'clive', ts: 2 })));
await ok(assertSucceeds(update(ref(clive, 'lockup/reception/' + D + '/mid2'), { status: 'declined', reason: 'I cannot cover right now', reasonText: 'With a customer', personId: 'clive', ts: 3 })));
/* but never someone else's seat */
await ok(assertFails(update(ref(clive, 'lockup/reception/' + D + '/mid'), { status: 'declined', reason: 'x', personId: 'mon', ts: 4 })));
console.log('ok: ' + n + ' walk-in and second seat rule checks');
await env.cleanup();
process.exit(0);
