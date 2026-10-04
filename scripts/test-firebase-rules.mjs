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
 * Expect "103 passed, 0 failed" (October 2026).
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
});
const anon = env.authenticatedContext('anonUid', { firebase: { sign_in_provider: 'anonymous' } }).database();
const nobody = env.unauthenticatedContext().database();
const google = env.authenticatedContext('randomGoogle', { email: 'x@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }).database();
const staff = env.authenticatedContext('staffUid', { email: 'dan@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }).database();
const img = 'data:image/jpeg;base64,AAAA';
const rec = (id) => ({ id, signedAt: '2026-10-04T00:00:00Z', customerName: 'T', forms: ['comm'] });

console.log('--- signed customer forms');
for (const [who, db] of [['nobody', nobody], ['anon', anon], ['google non-staff', google]]) {
  await t(who + ' read one record by id', get(ref(db, 'disclosures/multi_1_old')), 'deny');
  await t(who + ' list all records', get(ref(db, 'disclosures')), 'deny');
  await t(who + ' read rav_forms', get(ref(db, 'rav_forms/r1')), 'deny');
}
await t('nobody create new record (customer submits form)', set(ref(nobody, 'disclosures/multi_2_abc'), rec('multi_2_abc')), 'allow');
await t('nobody create rav_ record', set(ref(nobody, 'disclosures/rav_3_abc'), rec('rav_3_abc')), 'allow');
await t('nobody create disc_ record', set(ref(nobody, 'disclosures/disc_4_abc'), rec('disc_4_abc')), 'allow');
await t('nobody overwrite existing record', set(ref(nobody, 'disclosures/multi_1_old'), rec('multi_1_old')), 'deny');
await t('nobody delete existing record', remove(ref(nobody, 'disclosures/multi_1_old')), 'deny');
await t('nobody create with id mismatch', set(ref(nobody, 'disclosures/multi_5_abc'), rec('other')), 'deny');
await t('nobody write rav_forms', set(ref(nobody, 'rav_forms/x'), { a: 1 }), 'deny');
await t('staff read one record', get(ref(staff, 'disclosures/multi_1_old')), 'allow');
await t('staff list records', get(ref(staff, 'disclosures')), 'allow');
await t('staff read rav_forms', get(ref(staff, 'rav_forms')), 'allow');

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
