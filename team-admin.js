/* team-admin.js - the admin back panel (team-admin.html). Classic script.
 * Admins (the Firebase staff list) can change people, managers and access, and
 * switch test mode. Managers see the same panel read only. Every change is
 * checked by team-identity.js before it is written, and every change is logged
 * to shifts/audit, so the record of who changed what is in one place.
 */
(function (root) {
  'use strict';
  var TI = root.TeamIdentity, TS = root.TeamSession, R = root.LockupRota;
  var D = { managers: {}, links: {}, audit: {}, testMode: null }, subKey = '', unsub = [], started = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('show'); }, 3000);
  }
  function fmtTs(ts) { return ts ? new Date(ts).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }
  function dayName(d) { return d ? (R.DAY_NAMES[d] || d) : 'None'; }
  function isAdmin() { var s = TS.state(); return !!(s && s.admin); }

  /* ---- data ---- */
  function subscribe() {
    var p = TS.paths(), key = p.RL + '|' + p.RS;
    if (key === subKey) return;
    unsub.forEach(function (u) { if (typeof u === 'function') u(); });
    unsub = [];
    subKey = key;
    var b = TS.backend();
    function on(path, cb) { unsub.push(b.watch(path, function (v) { cb(v); paint(); })); }
    on(p.RS + '/managers', function (v) { D.managers = v || {}; });
    on(p.RS + '/links', function (v) { D.links = v || {}; });
    on(p.RS + '/audit', function (v) { D.audit = v || {}; });
    on('lockup/config/testMode', function (v) { D.testMode = v; });
  }
  function config() { return TS.config(); }
  function log(what) {
    var s = TS.state(), b = TS.backend(), p = TS.paths();
    if (!b) return;
    return b.push(p.RS + '/audit', { what: String(what).slice(0, 200), ts: Date.now() }).catch(function () {});
  }
  function whoName() { var s = TS.state(); return s && s.name ? s.name : 'someone'; }

  /* ---- writes (admins only; the UI hides them otherwise) ---- */
  /* everyone on either list, for the one-address-one-person check */
  function others() {
    var c = config(), out = [];
    [c.team || {}, c.managers || {}].forEach(function (g) { Object.keys(g).forEach(function (id) { out.push({ id: id, email: (g[id] || {}).email }); }); });
    return out;
  }
  function savePerson(list, id, f) {
    var errs = TI.validPerson(f, { isNew: false, id: id, others: others() });
    if (errs.length) { toast(errs[0]); return Promise.resolve(false); }
    var path = 'lockup/config/' + list + '/' + id;
    var val = { name: f.name.trim(), fullName: (f.fullName || '').trim(), email: f.email.trim().toLowerCase(), off: f.off || null, order: +f.order || 0 };
    if (list === 'team') val.active = f.active !== false;
    return TS.backend().update(path, val).then(function () {
      log(whoName() + ' changed ' + val.name + '’s details' + (list === 'team' && val.active === false ? ' (taken off the team)' : ''));
      toast('Saved');
      return true;
    });
  }
  function addPerson(list, f) {
    var c = config(), taken = Object.keys(c.team || {}).concat(Object.keys(c.managers || {}));
    var id = (f.id || TI.newPersonId(f.name, taken)).trim();
    var errs = TI.validPerson(f, { isNew: true, id: id, taken: taken, others: others() });
    if (errs.length) { toast(errs[0]); return Promise.resolve(false); }
    var val = { name: f.name.trim(), fullName: (f.fullName || '').trim(), email: f.email.trim().toLowerCase(), order: +f.order || 0 };
    if (f.off) val.off = f.off;
    if (list === 'team') val.active = true;
    return TS.backend().set('lockup/config/' + list + '/' + id, val).then(function () {
      log(whoName() + ' added ' + val.name + ' to the ' + (list === 'team' ? 'team' : 'managers') + ' list');
      toast(val.name + ' added');
      return true;
    });
  }
  function setManager(id, on) {
    var p = TS.paths(), b = TS.backend();
    return (on ? b.set(p.RS + '/managers/' + id, true) : b.remove(p.RS + '/managers/' + id)).then(function () {
      log((on ? 'Made a manager: ' : 'Removed as manager: ') + nameOf(id));
      toast(nameOf(id) + (on ? ' can now manage' : ' is no longer a manager'));
    });
  }
  function unlink(uid) {
    var p = TS.paths(), b = TS.backend(), who = nameOf(D.links[uid]);
    return b.remove(p.RS + '/links/' + uid).then(function () {
      log('Unlinked ' + who + '’s sign in, so they can link again');
      toast('Unlinked ' + who);
    });
  }
  function setTestMode(on) {
    return TS.backend().set('lockup/config/testMode', on).then(function () {
      log('Test mode ' + (on ? 'on: lockup and the calendar use the practice copies' : 'off: lockup and the calendar are live'));
      toast(on ? 'Test mode on' : 'Live');
    });
  }
  function nameOf(id) {
    var c = config(), p = (c.team || {})[id] || (c.managers || {})[id];
    return p ? p.name : (id || '?');
  }

  /* ---- drawing ---- */
  function show(view) {
    ['loading', 'signin', 'wrong', 'unlinked', 'inactive', 'app'].forEach(function (x) { $('v-' + x).hidden = x !== view; });
    $('btn-out').hidden = view !== 'app';
  }
  function personRow(list, id, p, admin) {
    var off = p.off ? dayName(p.off) : 'None';
    var active = list === 'team' ? (p.active !== false) : true;
    var pill = active ? '<span class="pill g">Active</span>' : '<span class="pill">Off the team</span>';
    var linked = list === 'team' && Object.keys(D.links).some(function (u) { return D.links[u] === id; });
    var linkPill = list === 'team' ? (linked ? '<span class="pill g">Signed in</span>' : '<span class="pill a">Not signed in</span>') : '';
    return '<tr><td><b>' + esc(p.name) + '</b><div class="muted small">' + esc(p.fullName || '') + '</div></td>' +
      '<td class="hide-s">' + esc(p.email || '') + '</td>' +
      '<td class="hide-s">' + esc(off) + '</td>' +
      '<td>' + pill + ' ' + linkPill + '</td>' +
      '<td class="num">' + (admin ? '<button class="ghost" type="button" data-edit="' + esc(list) + '|' + esc(id) + '">Edit</button>' : '') + '</td></tr>';
  }
  function paintPeople() {
    var c = config(), admin = isAdmin();
    var team = Object.keys(c.team || {}).sort(function (a, b) { return ((c.team[a].order || 0) - (c.team[b].order || 0)) || (a < b ? -1 : 1); });
    var mgrs = Object.keys(c.managers || {}).sort(function (a, b) { return ((c.managers[a].order || 0) - (c.managers[b].order || 0)) || (a < b ? -1 : 1); });
    var head = '<thead><tr><th>Name</th><th class="hide-s">Work address</th><th class="hide-s">Usual day off</th><th>Status</th><th></th></tr></thead>';
    var rows = '<tr><th colspan="5" style="color:var(--gold)">Sales team</th></tr>' + team.map(function (id) { return personRow('team', id, c.team[id], admin); }).join('');
    rows += '<tr><th colspan="5" style="color:var(--gold)">Managers (lockup list)</th></tr>' + mgrs.map(function (id) { return personRow('managers', id, c.managers[id], admin); }).join('');
    $('people').innerHTML = head + '<tbody>' + rows + '</tbody>';
    $('btn-add').hidden = !admin;
  }
  function paintManagers() {
    var c = config(), admin = isAdmin();
    var all = Object.keys(c.team || {}).concat(Object.keys(c.managers || {}));
    var html = all.map(function (id) {
      var on = D.managers[id] === true, p = (c.team || {})[id] || (c.managers || {})[id];
      return '<label class="check" style="padding:8px 0;border-bottom:1px solid var(--line)"><input type="checkbox" data-mgr="' + esc(id) + '"' + (on ? ' checked' : '') + (admin ? '' : ' disabled') + '> ' + esc(p.name) + '</label>';
    }).join('');
    $('mgr-list').innerHTML = html || '<p class="muted">No people yet.</p>';
  }
  function paintLinks() {
    var c = config(), admin = isAdmin();
    var uids = Object.keys(D.links);
    var rows = uids.length ? uids.map(function (u) {
      return '<tr><td><b>' + esc(nameOf(D.links[u])) + '</b></td><td class="hide-s muted small">' + esc(u) + '</td>' +
        '<td class="num">' + (admin ? '<button class="ghost" type="button" data-unlink="' + esc(u) + '">Unlink</button>' : '') + '</td></tr>';
    }).join('') : '<tr><td class="muted">Nobody has signed in yet.</td></tr>';
    var linkedIds = uids.map(function (u) { return D.links[u]; });
    var waiting = Object.keys(c.team || {}).filter(function (id) { return linkedIds.indexOf(id) < 0 && (c.team[id].active !== false); });
    rows += waiting.length ? '<tr><th colspan="3" style="color:var(--gold)">Not signed in yet</th></tr>' + waiting.map(function (id) {
      return '<tr><td>' + esc(nameOf(id)) + '</td><td class="hide-s muted small">' + esc((c.team[id] || {}).email || '') + '</td><td></td></tr>';
    }).join('') : '';
    $('links').innerHTML = '<thead><tr><th>Person</th><th class="hide-s">Account</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
  }
  function paintTestMode() {
    var on = D.testMode !== false, admin = isAdmin();
    $('tm-text').textContent = on
      ? 'Test mode is on. Lockup, this panel and the calendar use the practice copies, so nothing you do here reaches the live rota. Turn it off when you are ready for the team.'
      : 'Live. Lockup, the calendar and this panel use the real rota.';
    var b = $('tm-btn');
    b.hidden = !admin;
    b.textContent = on ? 'Switch to live' : 'Switch back to test mode';
  }
  function paintAudit() {
    var list = Object.keys(D.audit).map(function (k) { return D.audit[k]; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, 40);
    $('audit').innerHTML = list.length ? list.map(function (a) {
      return '<li><span>' + esc(a.what) + '</span><span class="muted small" style="white-space:nowrap">' + esc(fmtTs(a.ts)) + '</span></li>';
    }).join('') : '<li class="muted">Nothing logged yet.</li>';
  }
  function paint() {
    var st = TS.state();
    $('testbar').hidden = !TS.paths().testMode;
    $('hdr-sub').textContent = TS.paths().testMode ? 'Test copy' : 'Hedin BMW Ruxley';
    if (!st) { show('loading'); return; }
    if (st.status === 'signedout') { show('signin'); return; }
    if (st.status === 'wrongdomain' || st.status === 'unverified') { $('wrong-email').textContent = TS.email(); show('wrong'); return; }
    if (st.status === 'unlinked') { $('unlinked-email').textContent = TS.email(); show('unlinked'); return; }
    if (st.status === 'inactive') { show('inactive'); return; }
    if (st.status !== 'team') { $('loading-msg').textContent = 'Loading…'; show('loading'); return; }
    if (!st.canManage) {
      $('loading-msg').textContent = 'The team admin is for managers and admins.';
      show('loading'); return;
    }
    subscribe();
    show('app');
    $('who').textContent = st.name + (st.admin ? ' (admin)' : ' (manager)');
    $('ro-note').hidden = st.admin;
    paintPeople(); paintManagers(); paintLinks(); paintTestMode(); paintAudit();
  }

  /* ---- sheets ---- */
  function sheet(html) { $('sheet').innerHTML = html; $('m-sheet').classList.add('show'); $('sheet').scrollTop = 0; }
  function closeSheet() { $('m-sheet').classList.remove('show'); }
  function formFor(p, isNew, list) {
    p = p || {};
    var offs = ['', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(function (d) {
      return '<option value="' + d + '"' + ((p.off || '') === d ? ' selected' : '') + '>' + (d ? dayName(d) : 'None') + '</option>';
    }).join('');
    return '<form id="pf" class="stack">' +
      (isNew ? '<label class="fld"><span>List</span><select name="list"><option value="team"' + (list !== 'managers' ? ' selected' : '') + '>Sales team</option><option value="managers"' + (list === 'managers' ? ' selected' : '') + '>Managers</option></select></label>' : '') +
      (isNew ? '<label class="fld"><span>Short id (lower case, no spaces; blank makes one from the first name)</span><input name="id" maxlength="24" placeholder="e.g. jack"></label>' : '') +
      '<label class="fld"><span>First name</span><input name="name" maxlength="40" value="' + esc(p.name || '') + '"></label>' +
      '<label class="fld"><span>Full name</span><input name="fullName" maxlength="60" value="' + esc(p.fullName || '') + '"></label>' +
      '<label class="fld"><span>Work address</span><input name="email" type="email" value="' + esc(p.email || '') + '" placeholder="name@hedinautomotive.co.uk"></label>' +
      '<label class="fld"><span>Usual day off</span><select name="off">' + offs + '</select></label>' +
      '<label class="fld"><span>Order on the lists (0 to 99)</span><input name="order" type="number" min="0" max="99" value="' + esc(p.order == null ? 0 : p.order) + '"></label>' +
      (!isNew && list === 'team' ? '<label class="check"><input type="checkbox" name="active"' + (p.active !== false ? ' checked' : '') + '> <span>Active on the team</span></label>' : '') +
      '<p class="small muted">Changing the work address means they link again on their next sign in. Use Unlink on the Access card to do that now.</p>' +
      '<div class="row end"><button class="ghost" type="button" data-close>Cancel</button><button class="big" type="submit">Save</button></div></form>';
  }
  function openEdit(list, id) {
    var c = config(), p = (c[list === 'team' ? 'team' : 'managers'] || {})[id];
    if (!p) return;
    sheet('<h2>' + esc(p.name) + '</h2><p class="sub">' + (list === 'team' ? 'Sales team' : 'Managers list') + '</p>' + formFor(p, false, list));
    $('pf').onsubmit = function (e) {
      e.preventDefault();
      var f = fields(e.target);
      savePerson(list, id, f).then(function (ok) { if (ok) closeSheet(); }).catch(function () { toast('That did not save.'); });
    };
  }
  function openAdd() {
    sheet('<h2>Add a person</h2><p class="sub">They sign in with their work address and are linked to this person the first time.</p>' + formFor({ order: 0 }, true, 'team'));
    var f = $('pf');
    f.onsubmit = function (e) {
      e.preventDefault();
      var v = fields(e.target);
      addPerson(v.list || 'team', v).then(function (ok) { if (ok) closeSheet(); }).catch(function () { toast('That did not save.'); });
    };
  }
  function fields(form) {
    var v = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      v[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    v.order = +v.order || 0;
    if (v.active === undefined) v.active = true;
    return v;
  }

  function onClick(e) {
    var t = e.target.closest('button, [data-edit]');
    if (!t) return;
    if (t.id === 'm-sheet') { closeSheet(); return; }
    if (t.hasAttribute('data-close')) { closeSheet(); return; }
    if (t.id === 'btn-add') { openAdd(); return; }
    if (t.id === 'tm-btn') {
      if (!isAdmin()) return;
      var on = D.testMode !== false;
      if (!window.confirm(on ? 'Switch to live? Lockup and the calendar will use the real rota.' : 'Switch back to test mode? Lockup and the calendar will use the practice copies.')) return;
      setTestMode(!on);
      return;
    }
    var d;
    if ((d = t.getAttribute('data-edit'))) { var parts = d.split('|'); openEdit(parts[0], parts[1]); return; }
    if ((d = t.getAttribute('data-unlink'))) {
      if (!isAdmin() || !window.confirm('Unlink this sign in? They can link again on their next sign in.')) return;
      unlink(d);
    }
  }
  function onChange(e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-mgr') && isAdmin()) {
      setManager(t.getAttribute('data-mgr'), t.checked);
    }
  }

  var TeamAdmin = {
    start: function () {
      if (started) return;
      started = true;
      document.addEventListener('click', onClick);
      document.addEventListener('change', onChange);
      TS.onChange(function () { paint(); });
      paint();
    },
    _paint: paint,
    _fields: fields
  };
  root.TeamAdmin = TeamAdmin;
})(this);
