/* Tests the shifts section of database.rules.json in the Firebase emulator.
 * Nothing touches the real database.
 *
 * Needs Java and, in a scratch folder with the packages installed
 *   npm i firebase-tools @firebase/rules-unit-testing firebase
 * copy this file there, add a firebase.json containing
 *   {"emulators":{"database":{"port":9000,"host":"127.0.0.1"}},"database":{"rules":"rules.json"}}
 * and run from that folder:
 *   RULES=/path/to/repo/database.rules.json \
 *   npx firebase emulators:exec --only database --project demo-forecourt \
 *     "node test-shifts-rules.mjs"
 */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, push, remove } from 'firebase/database';
import { readFileSync } from 'fs';

const rules = readFileSync(process.env.RULES || new URL('../database.rules.json', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-forecourt', database: { rules, host: '127.0.0.1', port: 9000 } });

const HEDIN = (n) => n + '@hedinautomotive.co.uk';
const who = {
  admin: { uid: 'admin1', email: HEDIN('daniel.cane'), email_verified: true },
  tomi: { uid: 'tomi1', email: HEDIN('tomiwa.adelaja'), email_verified: true },
  carl: { uid: 'carl1', email: HEDIN('carl.hadwin'), email_verified: true },
  danny: { uid: 'danny1', email: HEDIN('danny.willis'), email_verified: true },
  will: { uid: 'will1', email: HEDIN('will.potter'), email_verified: true },
  tomiUnverified: { uid: 'tomi1', email: HEDIN('tomiwa.adelaja'), email_verified: false },
  outsider: { uid: 'out1', email: 'someone@gmail.com', email_verified: true }
};

let pass = 0, fail = 0;
async function t(name, p, expect) {
  try { await (expect === 'allow' ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok   ', expect.padEnd(5), name); }
  catch (e) { fail++; console.log('FAIL ', expect.padEnd(5), name, '-', String(e.message).slice(0, 160)); }
}

const req = (o) => Object.assign({ personId: 'tomi', kind: 'holiday', from: '2026-11-16', to: '2026-11-18', status: 'pending', ts: 1, ciphrConfirmed: true, ciphrConfirmedBy: 'Tomi', ciphrConfirmedAt: 1 }, o);

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.database();
  await set(ref(db, 'staff/admin1'), true);
  await set(ref(db, 'lockup/config/team/tomi'), { name: 'Tomi', email: who.tomi.email, active: true });
  await set(ref(db, 'lockup/config/team/carl'), { name: 'Carl', email: who.carl.email, active: true });
  await set(ref(db, 'lockup/config/managers/will'), { name: 'Will', email: who.will.email, active: true });
  await set(ref(db, 'shifts/managers/will'), true);
  await set(ref(db, 'shifts/links/will1'), 'will');
  await set(ref(db, 'shifts/links/tomi1'), 'tomi');
  await set(ref(db, 'shifts/links/carl1'), 'carl');
  await set(ref(db, 'lockup/config/team/danny'), { name: 'Danny', email: HEDIN('danny.willis'), active: true });
  await set(ref(db, 'shifts/requests/r1'), req({}));
  await set(ref(db, 'shifts/config/weekdayMin'), 5);
  // the test copy has its own managers and links
  await set(ref(db, 'shiftsTest/managers/will'), true);
  await set(ref(db, 'shiftsTest/links/will1'), 'will');
  await set(ref(db, 'shiftsTest/links/tomi1'), 'tomi');
});

const authDb = (u) => { const { uid, ...claims } = u; return env.authenticatedContext(uid, claims).database(); };
const T = authDb(who.tomi), C = authDb(who.carl), W = authDb(who.will), A = authDb(who.admin);
const O = authDb(who.outsider), U = authDb(who.tomiUnverified);

// reading: Hedin work accounts, verified, only
await t('outsider cannot read shifts', get(ref(O, 'shifts/requests/r1')), 'deny');
await t('unverified Hedin address cannot read shifts', get(ref(U, 'shifts/requests/r1')), 'deny');
await t('verified Hedin colleague can read requests', get(ref(T, 'shifts/requests/r1')), 'allow');

// requests: own only, approval by a manager only
await t('colleague creates own holiday request (pending)', set(ref(T, 'shifts/requests/h1'), req({ ts: 2 })), 'allow');
await t('colleague cannot book someone else', set(ref(T, 'shifts/requests/h2'), req({ personId: 'carl', ts: 2 })), 'deny');
await t('colleague cannot create an approved holiday', set(ref(T, 'shifts/requests/h3'), req({ status: 'approved', ts: 2 })), 'deny');
await t('colleague cannot approve a holiday on update', update(ref(T, 'shifts/requests/r1'), { status: 'approved' }), 'deny');
await t('colleague can cancel their own pending request', update(ref(T, 'shifts/requests/h1'), { status: 'cancelled' }), 'allow');
await t('colleague cannot decline (only a manager)', update(ref(T, 'shifts/requests/r1'), { status: 'declined' }), 'deny');
await t('manager approves a holiday', update(ref(W, 'shifts/requests/r1'), { status: 'approved', decidedBy: 'Will', decidedAt: 3 }), 'allow');
await t('manager declines', update(ref(W, 'shifts/requests/h1'), { status: 'declined' }), 'allow');
await t('manager with override and reason', update(ref(W, 'shifts/requests/r1'), { override: true, reason: 'Cover arranged' }), 'allow');
await t('request with a bad date is refused', set(ref(T, 'shifts/requests/h4'), req({ from: '16/11/2026', ts: 2 })), 'deny');
await t('request with an unknown kind is refused', set(ref(T, 'shifts/requests/h5'), req({ kind: 'lunch', ts: 2 })), 'deny');
await t('request with an unexpected field is refused', set(ref(T, 'shifts/requests/h6'), req({ extra: 'x', ts: 2 })), 'deny');
await t('request recording who asked is allowed', set(ref(T, 'shifts/requests/h7'), req({ ts: 2, by: 'Tomi Adelaja' })), 'allow');
await t('colleague records an absence as approved, marked auto', set(ref(T, 'shifts/requests/ab1'), { personId: 'tomi', kind: 'absence', from: '2026-11-16', to: '2026-11-16', status: 'approved', auto: true, ts: 2 }), 'allow');
await t('colleague cannot approve an absence for someone else', set(ref(T, 'shifts/requests/ab2'), { personId: 'carl', kind: 'absence', from: '2026-11-16', to: '2026-11-16', status: 'approved', auto: true, ts: 2 }), 'deny');
await t('colleague cannot mark a holiday as approved by themselves', set(ref(T, 'shifts/requests/ab3'), { personId: 'tomi', kind: 'holiday', from: '2026-11-16', to: '2026-11-16', status: 'approved', auto: true, ts: 2 }), 'deny');

// day off switch: always a manager's decision, so a colleague cannot mark it approved
const sw = { personId: 'tomi', kind: 'switch', giveUp: '2026-11-17', takeOn: '2026-11-16', status: 'approved', auto: true, ts: 4 };
await t('colleague cannot approve their own switch, even marked auto', set(ref(T, 'shifts/requests/s1'), sw), 'deny');
await t('a manager approves a switch', set(ref(W, 'shifts/requests/s1'), sw), 'allow');
// shift swap: only the colleague taking the shift can accept it automatically
const swp = { personId: 'tomi', withId: 'carl', kind: 'swap', date: '2026-11-18', status: 'pending', ts: 5 };
await t('colleague asks for a swap', set(ref(T, 'shifts/requests/w1'), swp), 'allow');
await t('the asker cannot approve their own swap', set(ref(T, 'shifts/requests/w1/status'), 'approved'), 'deny');
await t('the asker cannot approve their own swap marked auto', update(ref(T, 'shifts/requests/w1'), { status: 'approved', auto: true }), 'deny');
await t('the colleague taking the shift accepts it', update(ref(C, 'shifts/requests/w1'), { status: 'approved', auto: true }), 'allow');
await t('colleague holiday approved when marked auto is refused without the Ciphr tick', set(ref(T, 'shifts/requests/s2'), req({ status: 'approved', auto: true, ts: 4, ciphrConfirmed: null })), 'deny');
await t('switch without auto is not approved by the colleague', set(ref(T, 'shifts/requests/s3'), Object.assign({}, sw, { auto: false })), 'deny');

// shift swap: the colleague who takes it confirms, but cannot change who it is for
await t('tomi asks Carl to take a shift', set(ref(T, 'shifts/requests/w1'), { personId: 'tomi', withId: 'carl', kind: 'swap', date: '2026-11-18', status: 'awaiting', ts: 5 }), 'allow');
await t('Carl confirms the swap', update(ref(C, 'shifts/requests/w1'), { status: 'pending' }), 'allow');
await t('Carl cannot change who the shift is for', update(ref(C, 'shifts/requests/w1'), { personId: 'carl' }), 'deny');
await t('Carl cannot approve it', update(ref(C, 'shifts/requests/w1'), { status: 'approved' }), 'deny');
await t('Carl cannot confirm a request that is not his', update(ref(C, 'shifts/requests/r1'), { status: 'cancelled' }), 'deny');

// settings: managers only, with sensible ranges
await t('colleague cannot change the weekday minimum', set(ref(T, 'shifts/config/weekdayMin'), 4), 'deny');
await t('manager sets the weekday minimum', set(ref(W, 'shifts/config/weekdayMin'), 6), 'allow');
await t('manager sets Saturday to 8', set(ref(W, 'shifts/config/saturdayMin'), 8), 'allow');
await t('manager cannot set an absurd minimum', set(ref(W, 'shifts/config/weekdayMin'), 40), 'deny');
await t('manager sets the bank holiday exclusion list', set(ref(W, 'shifts/config/bhExclude'), { molly: true, chloe: true }), 'allow');
await t('manager cannot put a stranger on the exclusion list', set(ref(W, 'shifts/config/bhExclude/Bad-Name'), true), 'deny');
await t('admin adds a manager', set(ref(A, 'shifts/managers/nathan'), true), 'allow');
await t('a manager cannot add a manager', set(ref(W, 'shifts/managers/sergio'), true), 'deny');

// bank holiday rota: managers set it, colleagues read it
await t('colleague cannot write a bank holiday rota', set(ref(T, 'shifts/bh/2026-12-25'), { staff: { carl: true }, ts: 9 }), 'deny');
await t('manager writes a bank holiday rota', set(ref(W, 'shifts/bh/2026-12-25'), { staff: { tomi: true, carl: true, karis: true, clive: true }, ts: 9, by: 'Will' }), 'allow');
await t('manager cannot write a rota with a non boolean', set(ref(W, 'shifts/bh/2026-12-28'), { staff: { tomi: 'yes' } }), 'deny');

// self link: only to your own work address, once
await t('a colleague links to their own team id', set(ref(authDb(who.danny), 'shifts/links/danny1'), 'danny'), 'allow');
await t('a colleague cannot link to someone else', set(ref(T, 'shifts/links/tomi9'), 'carl'), 'deny');
await t('a colleague cannot link to a person with another email', set(ref(authDb(who.outsider), 'shifts/links/out1'), 'tomi'), 'deny');
await t('a colleague cannot re-link after linking', set(ref(T, 'shifts/links/tomi1'), 'carl'), 'deny');

// audit: add only
await t('colleague writes an audit line', push(ref(T, 'shifts/audit'), { what: 'Tomi switched Tue for Mon', ts: 6 }), 'allow');
await t('colleague writes an audit line with a fixed key', set(ref(T, 'shifts/audit/a1'), { what: 'first', ts: 6 }), 'allow');
await t('colleague cannot rewrite an existing audit line', set(ref(T, 'shifts/audit/a1'), { what: 'changed', ts: 6 }), 'deny');

// the test-mode copy behaves the same, and never reaches the live rota
await t('colleague requests in the test copy', set(ref(T, 'shiftsTest/requests/t1'), req({ ts: 2 })), 'allow');
await t('colleague cannot change settings in the test copy', set(ref(T, 'shiftsTest/config/weekdayMin'), 4), 'deny');
await t('manager changes settings in the test copy', set(ref(W, 'shiftsTest/config/weekdayMin'), 5), 'allow');
await t('an outsider cannot read the test copy', get(ref(O, 'shiftsTest/requests/t1')), 'deny');

// access, as the admin panel uses it: only an admin unlinks a sign in, and a person cannot unlink themselves
// danny1 was linked to his own person by the self-link case above
await t('a colleague cannot unlink their own sign in', remove(ref(authDb(who.danny), 'shifts/links/danny1')), 'deny');
await t('a manager cannot unlink someone else', remove(ref(W, 'shifts/links/danny1')), 'deny');
await t('the admin unlinks a sign in', remove(ref(A, 'shifts/links/danny1')), 'allow');
await t('the admin removes a manager flag', remove(ref(A, 'shifts/managers/nathan')), 'allow');
await t('a manager cannot remove a manager flag', remove(ref(W, 'shifts/managers/will')), 'deny');

// management: Dan is always admin as the creator; Nathan, Will and Sergio are management from the lockup list
const CREATOR = { uid: 'dan2', email: HEDIN('daniel.cane'), email_verified: true };
const UNVERIFIED_CREATOR = { uid: 'dan3', email: HEDIN('daniel.cane'), email_verified: false };
const NATHAN = { uid: 'nathan1', email: HEDIN('nathan.jobson'), email_verified: true };
await env.withSecurityRulesDisabled(async (c) => {
  const d = c.database();
  await set(ref(d, 'lockup/config/managers/nathan'), { name: 'Nathan', email: NATHAN.email, active: true });
  await set(ref(d, 'shifts/links/nathan1'), 'nathan');
});
const CR = authDb(CREATOR), UC = authDb(UNVERIFIED_CREATOR), NA = authDb(NATHAN);
await t('the creator is admin with no staff entry: changes the settings', set(ref(CR, 'shifts/config/weekdayMin'), 5), 'allow');
await t('the creator is admin: adds a manager flag', set(ref(CR, 'shifts/managers/sergio'), true), 'allow');
await t('an unverified creator address is not admin', set(ref(UC, 'shifts/managers/carl'), true), 'deny');
await t('Nathan, on the management list, approves a request', update(ref(NA, 'shifts/requests/r1'), { status: 'approved', decidedBy: 'Nathan', decidedAt: 5 }), 'allow');
await t('Nathan, on the management list, cannot make managers (admin only)', set(ref(NA, 'shifts/managers/nobody'), true), 'deny');
await t('the creator writes to the test copy as well', set(ref(CR, 'shiftsTest/config/weekdayMin'), 5), 'allow');
// the Ciphr reference on a leave request: optional, short
await t('a leave request carries its Ciphr reference', set(ref(T, 'shifts/requests/c1'), req({ ts: 9, ciphr: 'CPH-123456' })), 'allow');
await t('a Ciphr reference over 40 characters is refused', set(ref(T, 'shifts/requests/c2'), req({ ts: 9, ciphr: 'x'.repeat(41) })), 'deny');
// the handover team: a minimum from 0 to 3, and only the handover names
await t('the handover minimum is set by a manager', set(ref(W, 'shifts/config/handoverMin'), 1), 'allow');
await t('a handover minimum of 9 is refused', set(ref(W, 'shifts/config/handoverMin'), 9), 'deny');
await t('a handover name that is not a person id is refused', set(ref(W, 'shifts/config/handoverIds/Bad-Name'), true), 'deny');
await t('a management list member sets the handover team', set(ref(NA, 'shifts/config/handoverIds/chloe'), true), 'allow');
await t('a colleague cannot set the handover team', set(ref(T, 'shifts/config/handoverMin'), 0), 'deny');

// lockup absences: 'works' is accepted, unknown kinds are not
await t('a day off switch is written to lockup as works', set(ref(T, 'lockup/absences/sw1'), { personId: 'tomi', from: '2026-11-16', to: '2026-11-16', kind: 'works', status: 'approved', ts: 7 }), 'allow');
await t('an unknown absence kind is refused', set(ref(T, 'lockup/absences/sw2'), { personId: 'tomi', from: '2026-11-16', to: '2026-11-16', kind: 'bogus', status: 'approved', ts: 7 }), 'deny');
await t('the lockupTest copy takes works too', set(ref(T, 'lockupTest/absences/sw1'), { personId: 'tomi', from: '2026-11-16', to: '2026-11-16', kind: 'works', status: 'approved', ts: 7 }), 'allow');

// annual leave: added straight on, but only with the Ciphr tick, and only for yourself
const leave = { personId: 'tomi', kind: 'holiday', from: '2026-12-01', to: '2026-12-02', status: 'approved', auto: true, ts: 20, ciphrConfirmed: true, ciphrConfirmedBy: 'Tomi', ciphrConfirmedAt: 20 };
await t('colleague adds their own leave straight on with the Ciphr tick', set(ref(T, 'shifts/requests/L1'), leave), 'allow');
await t('leave without the Ciphr tick is refused', set(ref(T, 'shifts/requests/L2'), Object.assign({}, leave, { ciphrConfirmed: null })), 'deny');
await t('leave with the tick set to false is refused', set(ref(T, 'shifts/requests/L3'), Object.assign({}, leave, { ciphrConfirmed: false })), 'deny');
await t('a colleague cannot add leave for someone else', set(ref(T, 'shifts/requests/L4'), Object.assign({}, leave, { personId: 'carl' })), 'deny');
await t('the Ciphr reference is optional', set(ref(T, 'shifts/requests/L5'), Object.assign({}, leave, { from: '2026-12-10', to: '2026-12-10' })), 'allow');
await t('a pending leave request also needs the tick', set(ref(T, 'shifts/requests/L6'), { personId: 'tomi', kind: 'holiday', from: '2026-12-12', to: '2026-12-12', status: 'pending', ts: 21 }), 'deny');
await t('a manager adds leave for someone without the tick', set(ref(W, 'shifts/requests/L7'), { personId: 'carl', kind: 'holiday', from: '2026-12-14', to: '2026-12-14', status: 'approved', ts: 22 }), 'allow');
await t('a manager removes a colleague\'s leave', update(ref(W, 'shifts/requests/L1'), { status: 'cancelled' }), 'allow');
await t('a manager edits a colleague\'s leave dates', update(ref(W, 'shifts/requests/L5'), { to: '2026-12-11' }), 'allow');
await t('the test copy needs the tick too', set(ref(T, 'shiftsTest/requests/L8'), Object.assign({}, leave, { ciphrConfirmed: null })), 'deny');
await t('their leave is written to lockup so cover is re-paired', set(ref(T, 'lockup/absences/sh_L1_a'), { personId: 'tomi', from: '2026-12-01', to: '2026-12-02', kind: 'holiday', status: 'approved', ts: 20 }), 'allow');
await t('the test copy takes leave with the tick', set(ref(T, 'shiftsTest/requests/L9'), leave), 'allow');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
