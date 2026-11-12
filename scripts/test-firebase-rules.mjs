/* Tests database.rules.json in the Firebase emulator. Nothing touches the
 * real database.
 *
 * Needs Java and, in a scratch folder:
 *   npm i firebase-tools @firebase/rules-unit-testing firebase
 * copy this file into that folder, add a firebase.json there containing
 *   {"emulators":{"database":{"port":9000,"host":"127.0.0.1"}},"database":{"rules":"rules.json"}}
 * and run from that folder:
 *   RULES=/path/to/repo/database.rules.json \
 *   npx firebase emulators:exec --only database --project demo-forecourt \
 *     "node test-firebase-rules.mjs"
 * Expect "111 passed, 0 failed" (November 2026).
 */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, push, remove } from 'firebase/database';
import { readFileSync } from 'fs';
const rules = readFileSync(process.env.RULES || new URL('../database.rules.json', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-forecourt', database: { rules, host: '127.0.0.1', port: 9000 } });
let pass = 0, fail = 0;
async function t(name, p, expect) {
  try { await (expect === 'allow' ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok   ', expect.padEnd(5), name); }
  catch (e) { fail++; console.log('FAIL ', expect.padEnd(5), name, '-', String(e.message).slice(0, 120)); }
}
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.database();
  await set(ref(db, 'staff/staffUid'), true);
  await set(ref(db, 'disclosures/multi_1_old'), { id: 'multi_1_old', signedAt: 'x', customerName: 'Test' });
  await set(ref(db, 'rav_forms/r1'), { a: 1 });
  await set(ref(db, 'lockup/config/managers/will'), { email: 'will.potter@hedinautomotive.co.uk', name: 'Will' });
  await set(ref(db, 'lockup/config/team/kj'), { email: 'karis.johnson@hedinautomotive.co.uk', name: 'Karis' });
  await set(ref(db, 'shifts/links/willUid'), 'will');
  await set(ref(db, 'shifts/links/karisUid'), 'kj');
});
const anon = env.authenticatedContext('anonUid', { firebase: { sign_in_provider: 'anonymous' } }).database();
const nobody = env.unauthenticatedContext().database();
const google = env.authenticatedContext('randomGoogle', { email: 'x@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }).database();
const staff = env.authenticatedContext('staffUid', { email: 'dan@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }).database();
const img = 'data:image/jpeg;base64,AAAA';
const rec = (id) => ({ id, signedAt: '2026-10-04T00:00:00Z', customerName: 'T', forms: ['comm'] });

console.log('--- signed customer forms (feature removed Oct 2026: nobody reads or writes)');
for (const [who, db] of [['nobody', nobody], ['anon', anon], ['google non-staff', google], ['staff', staff]]) {
  await t(who + ' read one record by id', get(ref(db, 'disclosures/multi_1_old')), 'deny');
  await t(who + ' list all records', get(ref(db, 'disclosures')), 'deny');
  await t(who + ' read rav_forms', get(ref(db, 'rav_forms/r1')), 'deny');
  await t(who + ' create a record', set(ref(db, 'disclosures/multi_2_abc'), rec('multi_2_abc')), 'deny');
  await t(who + ' write rav_forms', set(ref(db, 'rav_forms/x'), { a: 1 }), 'deny');
}

console.log('--- staff list');
await t('google reads own staff entry', get(ref(google, 'staff/randomGoogle')), 'allow');
await t('google reads other staff entry', get(ref(google, 'staff/staffUid')), 'deny');
await t('google adds itself to staff', set(ref(google, 'staff/randomGoogle'), true), 'deny');
await t('staff adds someone to staff', set(ref(staff, 'staff/someone'), true), 'deny');

console.log('--- office TV control + admin (staff only)');
const control = [
  ['boardcontrol/reload', Date.now()], ['boardcontrol/videos', true],
  ['boardcontrol/play', { clip: 'x', ts: 1 }], ['boardcontrol/view', { id: 'auto', ts: 1 }],
  ['boardsettings/slotX', false], ['ticker/items/t1', { text: 'hi', ts: 1 }],
  ['birthdays/b1', { name: 'A', ts: 1 }], ['extra/used', { img, ts: 1 }],
  ['mugshot/blocked/e1', true], ['eventdeals', { enc: 'a', salt: 'b', iv: 'c', ts: 1 }],
  ['profitchallenge/months/2026-10/deals/d1', { exec: 'dc', profit: 100 }],
];
for (const [p, v] of control) {
  await t('nobody write ' + p, set(ref(nobody, p), v), 'deny');
  await t('anon write ' + p, set(ref(anon, p), v), 'deny');
  await t('google non-staff write ' + p, set(ref(google, p), v), 'deny');
  await t('staff write ' + p, set(ref(staff, p), v), 'allow');
}
console.log('--- deals: a manager on their team login (Dan, 12 November 2026)');
/* Will opened the board with his team PIN and every save was refused: the
   deals rule only knew the staff list. A linked manager may now write deals,
   and nothing else on the staff list. */
const pin = { sign_in_provider: 'password' };
const will = env.authenticatedContext('willUid', { email: 'will.potter@hedinautomotive.co.uk', email_verified: true, firebase: pin }).database();
const karis = env.authenticatedContext('karisUid', { email: 'karis.johnson@hedinautomotive.co.uk', email_verified: true, firebase: pin }).database();
const fakeWill = env.authenticatedContext('fakeWill', { email: 'will.potter@hedinautomotive.co.uk', email_verified: false, firebase: pin }).database();
const D = 'profitchallenge/months/2026-11/deals';
await t('manager (Will, PIN login) adds a deal', set(ref(will, D + '/w1'), { exec: 'ca', profit: 6229, reg: 'AB12CDE', ts: 1 }), 'allow');
await t('manager edits a deal', set(ref(will, D + '/w1/profit'), 6300), 'allow');
await t('manager deletes a deal', remove(ref(will, D + '/w1')), 'allow');
await t('manager still bound by the deal shape', set(ref(will, D + '/w2'), { exec: 'zz', profit: 1 }), 'deny');
await t('team member who is not a manager adds a deal', set(ref(karis, D + '/k1'), { exec: 'kj', profit: 1 }), 'deny');
await t('unverified account with a manager email adds a deal', set(ref(fakeWill, D + '/f1'), { exec: 'ca', profit: 1 }), 'deny');
await t('manager still cannot reload the TVs (staff only)', set(ref(will, 'boardcontrol/reload'), Date.now()), 'deny');
console.log('--- colleague features (any sign-in, incl. anonymous)');
const colleague = [
  ['mugshot/entries/e9', { img, ts: 1, by: 'A' }], ['mugshot/votes/e9/anonUid', 3],
  ['mugshot/current', { week: '2026-W40', ts: 1 }], ['newcar/current', { img, ts: 1 }],
  ['extra/newcar', { img, ts: 1 }], ['stockwatch/seen', { a1: 1 }],
  ['stockwatch/day', { day: '2026-10-04', ts: 1 }], ['evpair/screen1', { pub: 'k', ts: 1 }],
  ['forecourt/current/notices/n1', { text: 'x' }], ['forecourt/leaderboard/l1', { score: 5 }],
];
for (const [p, v] of colleague) {
  await t('nobody write ' + p, set(ref(nobody, p), v), 'deny');
  await t('anon write ' + p, set(ref(anon, p), v), 'allow');
}
await t('anon bad-shape mugshot entry still refused', set(ref(anon, 'mugshot/entries/e10'), { img: 'nope', ts: 1 }), 'deny');
console.log('--- public reads the TV relies on');
for (const p of ['boardsettings', 'boardcontrol', 'ticker', 'mugshot', 'newcar', 'extra', 'birthdays', 'stockwatch', 'evpair', 'eventdeals', 'profitchallenge', 'forecourt'])
  await t('nobody read ' + p, get(ref(nobody, p)), 'allow');
await t('nobody read root', get(ref(nobody, '/')), 'deny');
await t('nobody read staff list', get(ref(nobody, 'staff')), 'deny');
await t('anon own empire save', set(ref(anon, 'empire/saves/anonUid'), { game: 1 }), 'allow');
await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
