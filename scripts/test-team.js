#!/usr/bin/env node
/* Tests the shared team identity (team-identity.js): who a signed-in account
 * is, what it may manage, which home cards it sees, and the person checks the
 * admin panel runs before it writes. Pure, no Firebase.
 *   node scripts/test-team.js
 */
'use strict';
const assert = require('assert');
const T = require('../team-identity.js');

const team = {
  tomi: { name: 'Tomi', fullName: 'Tomi Adelaja', email: 'tomiwa.adelaja@hedinautomotive.co.uk', off: 'fri', active: true, order: 0 },
  carl: { name: 'Carl', fullName: 'Carl Hadwin', email: 'carl.hadwin@hedinautomotive.co.uk', off: 'tue', active: true, order: 1 },
  dan: { name: 'Dan', fullName: 'Daniel Cane', email: 'daniel.cane@hedinautomotive.co.uk', off: 'mon', active: true, order: 4 }
};
const managers = {
  will: { name: 'Will', fullName: 'Will Potter', email: 'will.potter@hedinautomotive.co.uk' }
};
const ok = (email, extra) => Object.assign({ uid: 'u_' + email.split('@')[0], email: email, emailVerified: true }, extra || {});
const base = { team, managers };

// signed out, unverified, outside the domain
assert.strictEqual(T.resolve(Object.assign({}, base, { user: null })).status, 'signedout');
assert.strictEqual(T.resolve(Object.assign({}, base, { user: ok('tomiwa.adelaja@hedinautomotive.co.uk', { emailVerified: false }) })).status, 'unverified', 'an unverified Hedin address is told to verify, and gets nothing else');
assert.strictEqual(T.resolve(Object.assign({}, base, { user: ok('someone@gmail.com') })).status, 'wrongdomain', 'personal address is refused');
assert.strictEqual(T.resolve(Object.assign({}, base, { user: ok('x@hedinautomotive.co.uk.evil.com') })).status, 'wrongdomain', 'lookalike domain is refused');
assert.strictEqual(T.resolve(Object.assign({}, base, { user: ok('Tomiwa.Adelaja@HEDINAUTOMOTIVE.co.uk') })).status, 'team', 'case does not matter');
console.log('ok: only verified Hedin work addresses get past the front door');

// unknown Hedin person: unlinked, not team
assert.strictEqual(T.resolve(Object.assign({}, base, { user: ok('nobody@hedinautomotive.co.uk') })).status, 'unlinked');
console.log('ok: a Hedin address that is not on the team list is unlinked');

// a team member, first sign in: linked by email, link needed
let s = T.resolve(Object.assign({}, base, { user: ok('tomiwa.adelaja@hedinautomotive.co.uk') }));
assert.deepStrictEqual([s.status, s.personId, s.name, s.role, s.canManage, s.linkNeeded], ['team', 'tomi', 'Tomi', 'staff', false, true]);
// once linked, the saved link is used and nothing needs writing
s = T.resolve(Object.assign({}, base, { user: ok('tomiwa.adelaja@hedinautomotive.co.uk'), link: 'tomi' }));
assert.strictEqual(s.linkNeeded, false);
console.log('ok: a team member is linked by email once, then by the saved link');

// roles: staff, manager (shifts list), admin (staff list), and a manager who is not on the sales team
s = T.resolve(Object.assign({}, base, { user: ok('daniel.cane@hedinautomotive.co.uk'), staffAdmin: true }));
assert.deepStrictEqual([s.role, s.admin, s.canManage], ['admin', true, true]);
// the creator is always admin on his work account, even with no staff entry
s = T.resolve(Object.assign({}, base, { user: ok('Daniel.Cane@hedinautomotive.co.uk'), link: 'dan' }));
assert.deepStrictEqual([s.role, s.admin], ['admin', true]);
s = T.resolve(Object.assign({}, base, { user: ok('daniel.cane@hedinautomotive.co.uk', { emailVerified: false }) }));
assert.strictEqual(s.admin, false, 'an unverified creator address gets nothing'); 
s = T.resolve(Object.assign({}, base, { user: ok('carl.hadwin@hedinautomotive.co.uk'), shiftsManagers: { carl: true } }));
assert.deepStrictEqual([s.role, s.canManage], ['manager', true]);
s = T.resolve(Object.assign({}, base, { user: ok('will.potter@hedinautomotive.co.uk') }));
assert.deepStrictEqual([s.status, s.personId, s.role, s.canManage], ['team', 'will', 'manager', true], 'Will is on the managers list, so he is management with no flag needed');
s = T.resolve(Object.assign({}, base, { user: ok('mon.singh@hedinautomotive.co.uk') }));
assert.strictEqual(s.status, 'unlinked', 'a sales person not on the list is still unlinked');
// the link wins over the email, so a changed address does not lock a person out of the link they made
s = T.resolve(Object.assign({}, base, { user: ok('new.address@hedinautomotive.co.uk'), link: 'carl' }));
assert.deepStrictEqual([s.status, s.personId], ['team', 'carl']);
// a link to someone who has since gone from the list is not a person
s = T.resolve(Object.assign({}, base, { user: ok('new.address@hedinautomotive.co.uk'), link: 'gone' }));
assert.deepStrictEqual([s.status, s.personId], ['unlinked', null], 'a link to someone no longer on either list is not a person');
console.log('ok: a link to someone removed from both lists is unlinked');
// taken off the team (Active off): access ends, but the creator is never locked out
const off = Object.assign({}, base, { team: Object.assign({}, team, { tomi: Object.assign({}, team.tomi, { active: false }) }) });
s = T.resolve(Object.assign({}, off, { user: ok('tomiwa.adelaja@hedinautomotive.co.uk'), link: 'tomi' }));
assert.deepStrictEqual([s.status, s.personId, s.name], ['inactive', 'tomi', 'Tomi']);
s = T.resolve(Object.assign({}, off, { user: ok('daniel.cane@hedinautomotive.co.uk'), link: 'dan' }));
assert.strictEqual(s.status, 'team', 'the creator is never locked out');
console.log('ok: a person taken off the team is inactive; the creator is not');
console.log('ok: admin, manager and staff roles come from the staff list, the managers list and the link');

// the home cards: team members see the four systems, admins also see the admin panel
const staffCards = T.cardsFor(T.resolve(Object.assign({}, base, { user: ok('tomiwa.adelaja@hedinautomotive.co.uk'), link: 'tomi' })));
assert.deepStrictEqual(staffCards.map(c => c.id), ['lockup', 'forecourt', 'board', 'calendar']);
const adminCards = T.cardsFor(T.resolve(Object.assign({}, base, { user: ok('daniel.cane@hedinautomotive.co.uk'), staffAdmin: true, link: 'dan' })));
assert.ok(adminCards.some(c => c.id === 'admin' && c.href === 'team-admin.html'));
assert.deepStrictEqual(T.cardsFor({ status: 'signedout' }), [], 'no cards without a team identity');
console.log('ok: home cards for staff; the admin panel only for admins');

// person validation: what the admin panel refuses before it writes
const good = { name: 'Chloe', fullName: 'Chloe Smith', email: 'chloe.smith@hedinautomotive.co.uk', off: 'tue', order: 7 };
assert.deepStrictEqual(T.validPerson(good, { isNew: true, id: 'chloe', taken: ['tomi'] }), []);
assert.ok(T.validPerson(Object.assign({}, good, { email: 'chloe@gmail.com' })).length === 1, 'personal email refused');
assert.ok(T.validPerson(Object.assign({}, good, { name: '  ' })).length === 1, 'no name refused');
assert.ok(T.validPerson(Object.assign({}, good, { off: 'sun' })).length === 1, 'Sunday is not a day off option');
assert.ok(T.validPerson(Object.assign({}, good, { off: '' })).length === 0, 'none is allowed');
assert.ok(T.validPerson(good, { isNew: true, id: 'Bad Id!' }).length >= 1, 'bad id refused');
assert.ok(T.validPerson(good, { isNew: true, id: 'tomi', taken: ['tomi'] }).length >= 1, 'taken id refused');
assert.ok(T.validPerson(Object.assign({}, good, { order: 150 })).length === 1, 'order out of range refused');
assert.strictEqual(T.validPerson(Object.assign({}, good, { name: 'x'.repeat(41) })).length, 1);
// one work address, one person: a second person on the same address is refused, their own address is not
const others = [{ id: 'tomi', email: 'tomiwa.adelaja@hedinautomotive.co.uk' }, { id: 'carl', email: 'carl.hadwin@hedinautomotive.co.uk' }];
assert.ok(T.validPerson({ name: 'Jack', email: 'Tomiwa.Adelaja@hedinautomotive.co.uk', off: 'wed' }, { isNew: true, id: 'jack', others }).some(e => /already uses/.test(e)), 'a duplicate address, any case, is refused');
assert.deepStrictEqual(T.validPerson({ name: 'Tomi', email: 'tomiwa.adelaja@hedinautomotive.co.uk', off: 'fri' }, { id: 'tomi', others }), [], 'a person keeps their own address');
console.log('ok: two people cannot share a work address');
console.log('ok: the admin panel refuses a bad email, day, id, order or name');

// ids from names are unique and safe
assert.strictEqual(T.newPersonId('Chloe Smith', []), 'chloe');
assert.strictEqual(T.newPersonId('Chloe', ['chloe']), 'chloe2');
assert.strictEqual(T.newPersonId('Chloe', ['chloe', 'chloe2']), 'chloe3');
assert.strictEqual(T.newPersonId("O'Brien", []), 'obrien');
assert.strictEqual(T.newPersonId('   ', []), 'person');
assert.ok(T.newPersonId('x'.repeat(60), []).length <= 20);
console.log('ok: new person ids are safe, short and unique');

console.log('all team identity tests passed');
