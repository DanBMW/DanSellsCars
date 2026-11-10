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
  /* before Go (Coming soon), nobody reads a pairing, even if announceTs has already passed */
  await env.withSecurityRulesDisabled(x => update(ref(x.database(), R + '/settings'), { live: false, announceTs: 1 }));
  await no(assertFails(get(ref(db('carl'), R + '/assign/' + c))), 'coming soon: not even your own');
  await env.withSecurityRulesDisabled(x => update(ref(x.database(), R + '/settings'), { live: false, announceTs: Date.now() - 1000 }));
  await no(assertFails(get(ref(db('carl'), R + '/assign/' + c))), 'announceTs alone reveals nothing');
  await env.withSecurityRulesDisabled(x => set(ref(x.database(), R + '/wish/' + m), { text: 'x', ts: 1 }));
  await no(assertFails(get(ref(db('carl'), R + '/wish/' + m))), 'no probing wishlists to find your giftee before Go');
  await no(assertFails(set(ref(db('carl'), R + '/notes/' + m + '/early'), { text: 'hi', ts: serverTimestamp() })), 'no probing notes to find your giftee before Go');
  await ok(assertSucceeds(get(ref(db('molly'), R + '/wish/' + m))), 'your own wishlist is always yours');
  await env.withSecurityRulesDisabled(x => update(ref(x.database(), R + '/settings'), { live: true }));
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

/* opt in tokens: one tap, no login; organisers see replies but never tokens or pairings */
for (const R of ['santa', 'santaTest']) {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async c => {
    await set(ref(c.database(), 'lockup/config/managers/nathan'), { name: 'Nathan', email: H('nathan.jobson') });
    await set(ref(c.database(), 'shifts/links/nat1'), 'nathan');
    await set(ref(c.database(), R + '/settings'), { live: false });
    await set(ref(c.database(), R + '/optins/TokAAAAAAAAAAAAAAAAAAAAAAAA12'), { name: 'Tina', email: 'tina.graham@hedinautomotive.co.uk', invitedTs: 1 });
    await set(ref(c.database(), R + '/optins/TokBBBBBBBBBBBBBBBBBBBBBBBB12'), { name: 'Lisa', email: 'lisa.debono@hedinautomotive.co.uk', invitedTs: 1, choice: 'in', choiceTs: 1 });
  });
  const tokA = 'TokAAAAAAAAAAAAAAAAAAAAAAAA12', tokB = 'TokBBBBBBBBBBBBBBBBBBBBBBBB12';
  await ok(assertSucceeds(get(ref(anon, R + '/optins/' + tokA))), 'anyone with the token can read it');
  await no(assertFails(get(ref(anon, R + '/optins'))), 'nobody can list all tokens');
  await no(assertFails(get(ref(db('dan'), R + '/optins'))), 'not even Dan can list tokens');
  await no(assertFails(get(ref(anon, R + '/optins/short'))), 'a short token is rejected');
  await ok(assertSucceeds(get(ref(anon, R + '/optins/nopeAAAAAAAAAAAAAAAAAAAAAA12'))), 'an unknown well formed token reads as empty');
  await ok(assertSucceeds(update(ref(anon, R + '/optins/' + tokA), { choice: 'in', choiceTs: serverTimestamp() })), 'one tap opt in, no login');
  await ok(assertSucceeds(update(ref(anon, R + '/optins/' + tokA), { choice: 'out', choiceTs: serverTimestamp() })), 'you can change your mind');
  await ok(assertSucceeds(update(ref(anon, R + '/optins/' + tokA), { choice: 'in', choiceTs: serverTimestamp() })));
  await no(assertFails(update(ref(anon, R + '/optins/' + tokA), { choice: 'maybe', choiceTs: serverTimestamp() })));
  await no(assertFails(update(ref(anon, R + '/optins/' + tokA), { email: 'hacked@x.com' })), 'the token cannot be pointed at someone else');
  await no(assertFails(set(ref(anon, R + '/optins/TokCCCCCCCCCCCCCCCCCCCCCCCC12'), { name: 'Eve', email: 'eve@x.com' })), 'clients cannot mint tokens');
  await no(assertFails(update(ref(anon, R + '/optins/nopeAAAAAAAAAAAAAAAAAAAAAA12'), { choice: 'in', choiceTs: serverTimestamp() })), 'an invalid token cannot be written');
  await no(assertFails(set(ref(db('dan'), R + '/replies/' + K('tina.graham@hedinautomotive.co.uk')), { name: 'Tina', email: 'tina.graham@hedinautomotive.co.uk', choice: 'in', ts: 1 })), 'replies are server only');
  await env.withSecurityRulesDisabled(async c => {
    await set(ref(c.database(), R + '/replies/' + K('tina.graham@hedinautomotive.co.uk')), { name: 'Tina', email: 'tina.graham@hedinautomotive.co.uk', choice: 'in', ts: 1 });
  });
  await ok(assertSucceeds(get(ref(db('dan'), R + '/replies'))), 'Dan can see who is in or out');
  await ok(assertSucceeds(get(ref(db('nathan'), R + '/replies'))), 'managers can see who is in or out');
  await no(assertFails(get(ref(db('carl'), R + '/replies'))), 'staff cannot read the replies list');
  await no(assertFails(get(ref(anon, R + '/replies'))));
  await ok(assertSucceeds(update(ref(anon, R + '/optins/' + tokA), { choice: 'out', choiceTs: serverTimestamp() })));
  await ok(assertSucceeds(set(ref(anon, R + '/optins/' + tokB + '/wish'), { text: 'Socks', ts: serverTimestamp() })), 'an opted in guest can write a wishlist with the token');
  await no(assertFails(set(ref(anon, R + '/optins/' + tokA + '/wish'), { text: 'Nope', ts: serverTimestamp() })), 'an opted out guest cannot write a wishlist');
  await env.withSecurityRulesDisabled(async c => {
    await update(ref(c.database(), R + '/settings'), { live: false, optInUntil: Date.now() - 1000 });
    await set(ref(c.database(), R + '/draw'), null);
  });
  await no(assertFails(update(ref(anon, R + '/optins/' + tokB), { choice: 'out', choiceTs: serverTimestamp() })), 'no changing your mind after the opt in deadline');
  await env.withSecurityRulesDisabled(async c => { await update(ref(c.database(), R + '/settings'), { optInUntil: Date.now() + 864e5 }); });
  await env.withSecurityRulesDisabled(async c => {
    await update(ref(c.database(), R + '/settings'), { live: false, announceTs: Date.now() - 1000 });
    await set(ref(c.database(), R + '/draw'), { id: 'd1', ts: 1, count: 2 });
    await set(ref(c.database(), R + '/guestGift/' + tokB), { name: 'Tina', to: K('tina.graham@hedinautomotive.co.uk'), drawId: 'd1' });
  });
  await no(assertFails(get(ref(anon, R + '/guestGift/' + tokB))), 'announceTs alone does not open a guest pairing');
  await env.withSecurityRulesDisabled(async c => {
    await update(ref(c.database(), R + '/settings'), { live: true });
  });
  await no(assertFails(update(ref(anon, R + '/optins/' + tokA), { choice: 'in', choiceTs: serverTimestamp() })), 'no changing your mind after launch');
  await no(assertFails(get(ref(db('dan'), R + '/guestGift'))), 'nobody can list guest pairings');
  await ok(assertSucceeds(get(ref(anon, R + '/guestGift/' + tokB))), 'the token holder can read their pairing once Dan has pressed Go');
  await ok(assertSucceeds(get(ref(anon, R + '/guestGift/' + tokA))), 'another token path is readable after names are out but is empty');
  await no(assertFails(get(ref(anon, R + '/guestGift/short'))), 'a short gift token is still rejected');
  await no(assertFails(set(ref(anon, R + '/guestGift/' + tokA), { name: 'Hack', to: 'x' })), 'clients cannot write a guest pairing');
}

console.log('santa rules: ' + n + ' checks passed');

await env.cleanup();
process.exit(0);
