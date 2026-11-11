/* Tests the authHelp rules in database.rules.json in the Firebase emulator.
 * Set up as scripts/test-firebase-rules.mjs describes, then:
 *   RULES=/path/to/repo/database.rules.json npx firebase emulators:exec --only database \
 *     --project demo-forecourt "node test-authhelp-rules.mjs"
 */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, serverTimestamp } from 'firebase/database';
import { readFileSync } from 'fs';
const rules = readFileSync(process.env.RULES || new URL('../database.rules.json', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-forecourt', database: { rules, host: '127.0.0.1', port: 9000 } });
let pass = 0, fail = 0;
async function t(name, p, expect) {
  try { await (expect === 'allow' ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok   ', expect.padEnd(5), name); }
  catch (e) { fail++; console.log('FAIL ', expect.padEnd(5), name, '-', String(e.message).slice(0, 120)); }
}
await env.withSecurityRulesDisabled(async (c) => { await set(ref(c.database(), 'staff/dan1'), true); });
const ctx = (uid, email, verified) => env.authenticatedContext(uid, { email, email_verified: verified, firebase: { sign_in_provider: 'password' } }).database();
const serg = ctx('serg', 'sergio.garaguso@hedinautomotive.co.uk', false);
const other = ctx('oth', 'someone.else@hedinautomotive.co.uk', false);
const verified = ctx('ver', 'mon.singh@hedinautomotive.co.uk', true);
const gmail = ctx('gm', 'x@gmail.com', false);
const dan = ctx('dan1', 'daniel.cane@hedinautomotive.co.uk', true);
const will = ctx('will1', 'will.potter@hedinautomotive.co.uk', true);
const nobody = env.unauthenticatedContext().database();
const req = (em, extra) => Object.assign({ email: em, ts: serverTimestamp() }, extra || {});

await t('unverified person asks for a backup email for themselves', set(ref(serg, 'authHelp/verifyReq/serg'), req('sergio.garaguso@hedinautomotive.co.uk', { clientErr: 'auth/internal-error' })), 'allow');
await t('they can read their own request', get(ref(serg, 'authHelp/verifyReq/serg')), 'allow');
await t('asking again inside a minute is refused', set(ref(serg, 'authHelp/verifyReq/serg'), req('sergio.garaguso@hedinautomotive.co.uk')), 'deny');
await t('nobody asks for someone else', set(ref(other, 'authHelp/verifyReq/serg'), req('someone.else@hedinautomotive.co.uk')), 'deny');
await t('the email must be their own', set(ref(other, 'authHelp/verifyReq/oth'), req('sergio.garaguso@hedinautomotive.co.uk')), 'deny');
await t('not for an outside address', set(ref(gmail, 'authHelp/verifyReq/gm'), req('x@gmail.com')), 'deny');
await t('not once already verified', set(ref(verified, 'authHelp/verifyReq/ver'), req('mon.singh@hedinautomotive.co.uk')), 'deny');
await t('the time must be the server time', set(ref(other, 'authHelp/verifyReq/oth'), { email: 'someone.else@hedinautomotive.co.uk', ts: 1 }), 'deny');
await t('no extra fields', set(ref(other, 'authHelp/verifyReq/oth'), req('someone.else@hedinautomotive.co.uk', { sent: 1 })), 'deny');
await t('signed out: nothing', set(ref(nobody, 'authHelp/verifyReq/x'), req('a@hedinautomotive.co.uk')), 'deny');
await t('a person cannot read the list, the log or the sent marks', get(ref(serg, 'authHelp')), 'deny');
await t('a person cannot write the sent marks', set(ref(serg, 'authHelp/sent/serg'), { last: 1 }), 'deny');
await t('a person cannot approve themselves', set(ref(serg, 'authHelp/approve/serg'), { by: 'serg', ts: serverTimestamp() }), 'deny');
await t('a manager (not admin) cannot read it', get(ref(will, 'authHelp')), 'deny');
await t('a manager (not admin) cannot approve', set(ref(will, 'authHelp/approve/serg'), { by: 'will1', ts: serverTimestamp() }), 'deny');
await t('Dan reads the list', get(ref(dan, 'authHelp')), 'allow');
await t('Dan cannot approve someone with no request', set(ref(dan, 'authHelp/approve/nobody'), { by: 'dan1', ts: serverTimestamp() }), 'deny');
await t('Dan cannot sign it as someone else', set(ref(dan, 'authHelp/approve/serg'), { by: 'will1', ts: serverTimestamp() }), 'deny');
await t('Dan approves Sergio', set(ref(dan, 'authHelp/approve/serg'), { by: 'dan1', ts: serverTimestamp() }), 'allow');
await t('Dan cannot write the log', set(ref(dan, 'authHelp/log/serg/x'), { what: 'x' }), 'deny');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
await env.cleanup();
process.exit(fail ? 1 : 0);
