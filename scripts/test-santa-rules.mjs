/* Tests the santa section of database.rules.json in the Firebase emulator.
 * Same setup as scripts/test-shifts-rules.mjs (see the top of that file). */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, push, remove, serverTimestamp } from 'firebase/database';
import { readFileSync } from 'fs';

const rules = readFileSync(process.env.RULES || new URL('../database.rules.json', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-forecourt', database: { rules, host: '127.0.0.1', port: 9000 } });
const H = n => n + '@hedinautomotive.co.uk';
const K = e => e.toLowerCase().split('.').join(',');
const who = {
  dan: { uid: 'dan1', email: H('daniel.cane'), email_verified: true },
  nathan: { uid: 'nat1', email: H('nathan.jobson'), email_verified: true },
  carl: { uid: 'carl1', email: H('carl.hadwin'), email_verified: true },
  molly: { uid: 'mol1', email: H('molly.brown'), email_verified: true },
  elf: { uid: 'elf1', email: 'Holly.Extra@gmail.com', email_verified: true },
  elfUnverified: { uid: 'elf1', email: 'holly.extra@gmail.com', email_verified: false },
  outsider: { uid: 'out1', email: 'someone@gmail.com', email_verified: true }
};
const db = k => env.authenticatedContext(who[k].uid, { email: who[k].email, email_verified: who[k].email_verified }).database();
const anon = env.unauthenticatedContext().database();
let n = 0; const ok = async (p, m) => { await p; n++; }, no = ok;
for (const R of ['santa', 'santaTest']) {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async c => {
    await set(ref(c.database(), 'lockup/config/managers/nathan'), { name: 'Nathan', email: H('nathan.jobson') });
    await set(ref(c.database(), 'shifts/links/nat1'), 'nathan');
  });
  const mem = (e, name) => ({ name, email: e, ts: 1 });
  /* organisers add people before the draw; staff cannot */
  await ok(assertSucceeds(set(ref(db('dan'), R + '/members/' + K(H('carl.hadwin'))), mem(H('carl.hadwin'), 'Carl'))));
  await ok(assertSucceeds(set(ref(db('nathan'), R + '/members/' + K(H('molly.brown'))), mem(H('molly.brown'), 'Molly'))));
  await ok(assertSucceeds(set(ref(db('dan'), R + '/members/' + K('holly.extra@gmail.com')), Object.assign(mem('holly.extra@gmail.com', 'Holly'), { extra: true }))));
  await ok(assertSucceeds(set(ref(db('dan'), R + '/members/' + K(H('daniel.cane'))), mem(H('daniel.cane'), 'Dan'))));
  await no(assertFails(set(ref(db('carl'), R + '/members/' + K('x.y@gmail.com')), mem('x.y@gmail.com', 'X'))));
  await no(assertFails(set(ref(db('dan'), R + '/members/' + K('a.b@gmail.com')), mem('other@gmail.com', 'Mismatch'))), 'key must match email');
  await ok(assertSucceeds(set(ref(db('dan'), R + '/settings'), { budget: 20, exchange: '2026-12-18', title: 'Ruxley Secret Santa' })));
  await no(assertFails(set(ref(db('carl'), R + '/settings/budget'), 999)));
  await no(assertFails(set(ref(db('nathan'), R + '/settings/budget'), 25)), 'managers cannot change settings');
  await ok(assertSucceeds(update(ref(db('dan'), R + '/settings'), { announce: '2026-12-01T10:00', announceTs: 1, reminders: true, live: false })));
  await no(assertFails(set(ref(db('dan'), R + '/settings/announce'), '1 Dec')));
  await ok(assertSucceeds(get(ref(db('carl'), R + '/settings'))), 'staff read the settings (for Coming soon)');
  await no(assertFails(get(ref(anon, R + '/settings'))));
  await no(assertFails(set(ref(db('nathan'), R + '/launchRequest'), { by: 'nat1', byName: 'Nathan', ts: serverTimestamp() })), 'only Dan launches');
  await no(assertFails(set(ref(db('carl'), R + '/launchRequest'), { by: 'carl1', byName: 'Carl', ts: serverTimestamp() })));
  await ok(assertSucceeds(set(ref(db('dan'), R + '/launchRequest'), { by: 'dan1', byName: 'Dan', ts: serverTimestamp() })));
  await no(assertFails(set(ref(db('dan'), R + '/launched'), { ts: 1 })), 'launched is server only');
  await no(assertFails(set(ref(db('dan'), R + '/mail/launch'), 1)), 'mail marks are server only');
  await no(assertFails(get(ref(db('carl'), R + '/mail'))));
  /* members read the list, outsiders do not; extras sign in with their own email */
  await ok(assertSucceeds(get(ref(db('carl'), R + '/members'))));
  await ok(assertSucceeds(get(ref(db('elf'), R + '/members'))));
  await no(assertFails(get(ref(db('elfUnverified'), R + '/members'))));
  await no(assertFails(get(ref(db('outsider'), R + '/members'))));
  await no(assertFails(get(ref(anon, R + '/members'))));
  /* nobody writes the draw results */
  await no(assertFails(set(ref(db('dan'), R + '/assign/' + K(H('carl.hadwin'))), { to: 'x', name: 'x', drawId: 'd' })));
  await no(assertFails(set(ref(db('dan'), R + '/sealed'), { drawId: 'd', pairs: {} })));
  await no(assertFails(set(ref(db('dan'), R + '/draw'), { id: 'd' })));
  await ok(assertSucceeds(set(ref(db('nathan'), R + '/drawRequest'), { by: 'nat1', byName: 'Nathan', ts: serverTimestamp(), mode: 'draw' })));
  await no(assertFails(set(ref(db('carl'), R + '/drawRequest'), { by: 'carl1', byName: 'Carl', ts: serverTimestamp(), mode: 'draw' })));
  /* the server's draw */
  const c = K(H('carl.hadwin')), m = K(H('molly.brown')), h = K('holly.extra@gmail.com'), d = K(H('daniel.cane'));
  const pairs = { [c]: m, [m]: h, [h]: d, [d]: c };
  await env.withSecurityRulesDisabled(async x => {
    const a = {}; Object.keys(pairs).forEach(g => { a[g] = { to: pairs[g], name: 'n', drawId: 'D1' }; });
    await update(ref(x.database(), R), { assign: a, sealed: { drawId: 'D1', pairs }, draw: { id: 'D1', ts: 1, count: 4 }, drawRequest: null });
  });
  /* before launch (Coming soon) and before the names time, nobody reads a pairing or probes for one */
  await env.withSecurityRulesDisabled(x => update(ref(x.database(), R + '/settings'), { live: false, announceTs: 1 }));
  await no(assertFails(get(ref(db('carl'), R + '/assign/' + c))), 'coming soon: not even your own');
  await env.withSecurityRulesDisabled(x => update(ref(x.database(), R + '/settings'), { live: true, announceTs: Date.now() + 864e5 }));
  await no(assertFails(get(ref(db('carl'), R + '/assign/' + c))), 'before the names time: not even your own');
  await env.withSecurityRulesDisabled(x => set(ref(x.database(), R + '/wish/' + m), { text: 'x', ts: 1 }));
  await no(assertFails(get(ref(db('carl'), R + '/wish/' + m))), 'no probing wishlists to find your giftee early');
  await no(assertFails(set(ref(db('carl'), R + '/notes/' + m + '/early'), { text: 'hi', ts: serverTimestamp() })), 'no probing notes to find your giftee early');
  await ok(assertSucceeds(get(ref(db('molly'), R + '/wish/' + m))), 'your own wishlist is always yours');
  await env.withSecurityRulesDisabled(x => update(ref(x.database(), R + '/settings'), { announceTs: Date.now() - 1000 }));
  /* each person reads only their own */
  await ok(assertSucceeds(get(ref(db('carl'), R + '/assign/' + c))));
  await no(assertFails(get(ref(db('carl'), R + '/assign/' + m))));
  await no(assertFails(get(ref(db('carl'), R + '/assign'))));
  await no(assertFails(get(ref(db('dan'), R + '/assign'))), 'not even Dan');
  await no(assertFails(get(ref(db('dan'), R + '/assign/' + c))));
  await no(assertFails(get(ref(db('nathan'), R + '/assign/' + c))));
  await ok(assertSucceeds(get(ref(db('elf'), R + '/assign/' + h))), 'mixed case email still matches');
  /* the people list is frozen once drawn, so nobody can point someone's entry at their own email */
  await no(assertFails(set(ref(db('dan'), R + '/members/' + K('new.one@gmail.com')), mem('new.one@gmail.com', 'New'))));
  await no(assertFails(remove(ref(db('dan'), R + '/members/' + c))));
  /* wishlists: your own, plus the one you are buying for */
  await ok(assertSucceeds(set(ref(db('molly'), R + '/wish/' + m), { text: 'Fluffy socks', ts: serverTimestamp() })));
  await no(assertFails(set(ref(db('carl'), R + '/wish/' + m), { text: 'hack', ts: serverTimestamp() })));
  await ok(assertSucceeds(get(ref(db('carl'), R + '/wish/' + m))), 'Carl buys for Molly');
  await no(assertFails(get(ref(db('elf'), R + '/wish/' + m))));
  await no(assertFails(get(ref(db('dan'), R + '/wish/' + m))));
  await no(assertFails(get(ref(db('dan'), R + '/wish'))));
  /* anonymous notes: only from the Santa, only read by the giftee */
  await ok(assertSucceeds(set(ref(db('carl'), R + '/notes/' + m + '/n1'), { text: 'Ho ho ho', ts: serverTimestamp() })));
  await no(assertFails(set(ref(db('elf'), R + '/notes/' + m + '/n2'), { text: 'fake', ts: serverTimestamp() })));
  await no(assertFails(set(ref(db('carl'), R + '/notes/' + m + '/n3'), { text: 'x', ts: serverTimestamp(), from: 'Carl' })));
  await ok(assertSucceeds(get(ref(db('molly'), R + '/notes/' + m))));
  await no(assertFails(get(ref(db('carl'), R + '/notes/' + m))));
  /* uncover: sealed is shut until Dan writes the permanent flag; managers can never */
  await no(assertFails(get(ref(db('dan'), R + '/sealed'))));
  await no(assertFails(set(ref(db('nathan'), R + '/uncovered/D1'), { by: 'nat1', name: 'Nathan', ts: serverTimestamp() })));
  await no(assertFails(set(ref(db('dan'), R + '/uncovered/WRONG'), { by: 'dan1', name: 'Dan', ts: serverTimestamp() })));
  await ok(assertSucceeds(set(ref(db('dan'), R + '/uncovered/D1'), { by: 'dan1', name: 'Dan', ts: serverTimestamp() })));
  await ok(assertSucceeds(get(ref(db('dan'), R + '/sealed'))));
  await no(assertFails(get(ref(db('nathan'), R + '/sealed'))));
  await no(assertFails(remove(ref(db('dan'), R + '/uncovered/D1'))), 'the flag cannot be taken back');
  await ok(assertSucceeds(get(ref(db('carl'), R + '/uncovered'))), 'everyone can see it was opened');
  /* audit is append only */
  const ar = push(ref(db('dan'), R + '/audit'));
  await ok(assertSucceeds(set(ar, { by: 'dan1', name: 'Dan', what: 'Uncovered the pairings', ts: serverTimestamp() })));
  await no(assertFails(remove(ref(db('dan'), R + '/audit/' + ar.key))));
  await no(assertFails(get(ref(db('carl'), R + '/audit'))));
}
console.log('santa rules: ' + n + ' checks passed');
await env.cleanup();
process.exit(0);
