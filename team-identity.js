/* team-identity.js - who a signed-in Hedin account is, and what the team
 * systems let them do. Pure functions, so the browser pages (team-session.js)
 * and scripts/test-team.js run exactly the same rules.
 *
 * One identity for every team system (Dan, 30 October 2026):
 *   - the Google account must be verified and @hedinautomotive.co.uk;
 *   - it is linked to a person on the lockup team list or managers list, by
 *     email (shifts/links/<uid> remembers the link once made);
 *   - admin  = the uid is on the Firebase staff list (staff/<uid>, Dan);
 *   - manager = admin, or the person is listed under shifts/managers;
 *   - staff  = anyone else linked to the team.
 * Lockup sign-off, the forecourt check and the team board stay open to
 * colleagues exactly as before. Only the manager screens use this identity.
 */
(function (root) {
  'use strict';
  var DOMAIN = /^[a-z0-9._-]+@hedinautomotive\.co\.uk$/i;
  var ID = /^[a-z0-9_]{1,24}$/;
  var DAYS = ['', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  function lower(s) { return String(s || '').trim().toLowerCase(); }

  function emailOk(user) {
    return !!user && user.emailVerified === true && DOMAIN.test(String(user.email || ''));
  }

  /* the person a work email belongs to: team list first, then managers */
  function personForEmail(email, team, managers) {
    var e = lower(email), found = null;
    [['team', team || {}], ['manager', managers || {}]].forEach(function (g) {
      Object.keys(g[1]).forEach(function (id) {
        if (!found && lower(g[1][id] && g[1][id].email) === e && e) found = { id: id, list: g[0] };
      });
    });
    return found;
  }

  /* i = { user, team, managers, link, staffAdmin, shiftsManagers }
     returns { status, personId, name, role, admin, canManage, linkNeeded }
     status: signedout | wrongdomain | unlinked | team */
  function resolve(i) {
    i = i || {};
    var base = { status: 'signedout', personId: null, name: null, role: null, admin: false, canManage: false, linkNeeded: false };
    if (!i.user) return base;
    if (!emailOk(i.user)) return Object.assign(base, { status: 'wrongdomain' });
    var match = personForEmail(i.user.email, i.team, i.managers);
    var personId = i.link || (match && match.id) || null;
    if (!personId) return Object.assign(base, { status: 'unlinked' });
    var list = (i.team && i.team[personId]) || (i.managers && i.managers[personId]) || null;
    var admin = i.staffAdmin === true;
    var manager = admin || !!(i.shiftsManagers && i.shiftsManagers[personId] === true);
    return {
      status: 'team', personId: personId, name: list ? list.name : personId,
      role: admin ? 'admin' : manager ? 'manager' : 'staff',
      admin: admin, canManage: manager,
      linkNeeded: !i.link && !!match
    };
  }

  /* the cards on the team home page, in order. Admin only shows for admins. */
  function cardsFor(state) {
    if (!state || state.status !== 'team') return [];
    var cards = [
      { id: 'lockup', title: 'Lockup', href: 'lockup.html', blurb: 'Tonight’s lockup, the checklist and sign off.' },
      { id: 'forecourt', title: 'Forecourt checks', href: 'Forecourt.html', blurb: 'This week’s forecourt check, car by car.' },
      { id: 'board', title: 'Team board', href: 'team-board.html', blurb: 'The £15,000 profit challenge and the wall display.' },
      { id: 'calendar', title: 'Team calendar', href: 'shifts.html', blurb: 'Who is in, days off, holidays and bank holidays.' }
    ];
    if (state.admin) cards.push({ id: 'admin', title: 'Team admin', href: 'team-admin.html', blurb: 'People, managers, access and test mode.' });
    return cards;
  }

  /* validation for a person on lockup/config/team (or managers) */
  function validPerson(p, opts) {
    opts = opts || {};
    var errs = [];
    p = p || {};
    if (opts.isNew && !ID.test(String(opts.id || ''))) errs.push('The short id must be lower case letters, numbers or underscores, up to 24 characters.');
    if (opts.isNew && opts.taken && opts.taken.indexOf(opts.id) >= 0) errs.push('Someone already has that id.');
    if (!String(p.name || '').trim()) errs.push('Give them a first name.');
    if (String(p.name || '').length > 40) errs.push('The first name is too long.');
    if (String(p.fullName || '').length > 60) errs.push('The full name is too long.');
    if (!DOMAIN.test(String(p.email || '').trim())) errs.push('Use their Hedin work address (name@hedinautomotive.co.uk).');
    if (DAYS.indexOf(p.off || '') < 0) errs.push('Pick a usual day off, or none.');
    if (p.order != null && (!(+p.order >= 0) || +p.order > 99)) errs.push('Order has to be between 0 and 99.');
    return errs;
  }

  /* a short id from a first name: lower case, unique against taken ids */
  function newPersonId(name, taken) {
    var base = lower(String(name || '').trim().split(/\s+/)[0]).replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'person';
    var id = base, n = 2;
    taken = taken || [];
    while (taken.indexOf(id) >= 0) id = base + n++;
    return id;
  }

  var api = { emailOk: emailOk, personForEmail: personForEmail, resolve: resolve, cardsFor: cardsFor, validPerson: validPerson, newPersonId: newPersonId, DOMAIN: DOMAIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TeamIdentity = api;
})(this);
