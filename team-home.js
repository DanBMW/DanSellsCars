/* team-home.js - draws the team home (team.html) from the shared session and
 * the lockup and shifts data. Classic script. TeamHome.start() once the page
 * is wired; everything else follows from TeamSession.onChange.
 */
(function (root) {
  'use strict';
  var R = root.LockupRota, S = root.ShiftRota, TI = root.TeamIdentity, TS = root.TeamSession;
  var NOW = R.london(), FIXED = null, HOL = {}, D = {}, subKey = '', unsub = [], started = false, last = null;
  var WHY = {
    working: 'In', 'swapped-in': 'In (swapped)', off: 'Usual day off', holiday: 'Holiday', absent: 'Away',
    bh: 'In (bank holiday)', 'bh-off': 'Not on the bank holiday rota', 'bh-no-rota': 'Bank holiday rota not set',
    closed: 'Closed', inactive: 'Not active', 'not-team': 'Not on the team'
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clock() { return FIXED || R.london(); }
  function fmt(d, long) {
    if (!d) return '';
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: long ? 'long' : 'short', day: 'numeric', month: 'short' });
  }
  function nameOf(id) {
    var c = TS.config(), p = (c.team || {})[id] || (c.managers || {})[id];
    return p ? p.name : (id || '?');
  }
  function closedDays() { return Object.assign({}, HOL, D.closedCfg || {}); }
  function ctx() {
    var c = TS.config();
    return S.makeCtx({
      team: c.team || {}, managers: c.managers || {}, absences: D.absences || {}, config: D.scfg || {},
      bh: D.bh || {}, holidays: HOL, closed: D.closedCfg || {}, requests: D.requests || {}, today: NOW.date
    });
  }

  /* ---- data: the same paths the calendar and lockup use ---- */
  function subscribe() {
    var p = TS.paths(), key = p.RL + '|' + p.RS;
    if (key === subKey) return;
    unsub.forEach(function (u) { if (typeof u === 'function') u(); });
    unsub = [];
    subKey = key;
    D = { weeks: {}, status: {}, absences: {}, closedCfg: {}, scfg: {}, requests: {}, bh: {} };
    var b = TS.backend();
    function on(path, cb) { unsub.push(b.watch(path, function (v) { cb(v); paint(); })); }
    on(p.RL + '/weeks', function (v) { D.weeks = v || {}; });
    on(p.RL + '/status', function (v) { D.status = v || {}; });
    on(p.RL + '/absences', function (v) { D.absences = v || {}; });
    on(p.RL + '/config/holidays', function (v) { D.closedCfg = v || {}; });
    on(p.RS + '/config', function (v) { D.scfg = S.cfgOf(v || {}); });
    on(p.RS + '/requests', function (v) { D.requests = v || {}; });
    on(p.RS + '/bh', function (v) { D.bh = v || {}; });
  }
  function loadHolidays() {
    if (typeof fetch !== 'function') return;
    fetch('https://www.gov.uk/bank-holidays.json').then(function (r) { return r.json(); }).then(function (j) {
      ((j['england-and-wales'] || {}).events || []).forEach(function (e) { HOL[e.date] = { label: e.title }; });
      paint();
    }).catch(function () {});
  }

  /* ---- what the home says ---- */
  function tonight() {
    var date = NOW.date, c = ctx(), k = S.countDay(c, date);
    if (k.kind === 'closed') return { text: 'Closed today', cls: '' };
    var on = R.onFor(date, D.weeks[R.isoWeek(date)], closedDays());
    var ids = on.kind === 'staff' ? on.ids : [];
    var st = D.status[date];
    var who = ids.length ? ids.map(nameOf).join(' and ') : (NOW.dow === 'sat' ? 'Managers' : 'Nobody on the rota');
    if (st && st.state === 'signed') return { text: 'Signed by ' + (st.by || 'someone'), cls: 'ok' };
    return { text: who + ', not signed yet', cls: ids.length ? 'warn' : 'muted' };
  }
  function todayCalendar() {
    var c = ctx(), k = S.countDay(c, NOW.date);
    if (k.kind === 'closed') return { text: 'Closed today', cls: 'muted' };
    if (k.noRota) return { text: 'Bank holiday rota not set', cls: 'bad' };
    return { text: k.count + ' on, minimum ' + k.min, cls: k.ok ? 'ok' : 'bad' };
  }
  function nextDays(n) {
    var c = ctx(), me = TS.state().personId, out = [];
    var d = NOW.date;
    for (var i = 0; out.length < n && i < 21; i++, d = R.addDays(d, 1)) {
      if (d < NOW.date) continue;
      var p = S.personDay(c, me, d), k = S.dayKind(c, d);
      if (k === 'closed') continue;
      out.push({ date: d, why: p.why, on: p.on });
    }
    return out;
  }
  function waiting() {
    var st = TS.state(), out = [];
    var reqs = Object.keys(D.requests || {}).map(function (k) { return Object.assign({ id: k }, D.requests[k]); });
    reqs.filter(function (r) { return r.kind === 'swap' && r.withId === st.personId && r.status === 'awaiting'; }).forEach(function (r) {
      out.push({ text: nameOf(r.personId) + ' asks you to take the shift on ' + fmt(r.date, true), href: 'shifts.html', action: 'Respond in the calendar' });
    });
    reqs.filter(function (r) { return r.personId === st.personId && r.status === 'pending'; }).forEach(function (r) {
      out.push({ text: 'Your request (' + (r.kind === 'holiday' ? 'holiday' : r.kind === 'absence' ? 'absence' : r.kind === 'switch' ? 'day off switch' : 'shift swap') + ', ' + fmt(r.from || r.giveUp || r.date) + ') is with a manager', href: 'shifts.html', action: 'See it' });
    });
    if (st.canManage) {
      var n = reqs.filter(function (r) { return r.status === 'pending'; }).length;
      if (n) out.push({ text: n + ' request' + (n === 1 ? '' : 's') + ' waiting for a manager', href: 'shifts.html', action: 'Review' });
    }
    return out;
  }

  /* ?next=page.html: a manager sends people here to sign in, then straight back.
     Only a plain page name in this folder is followed. */
  function nextPage() {
    var n = new URLSearchParams(location.search).get('next') || '';
    return /^[A-Za-z0-9_-]+\.html$/.test(n) ? n : '';
  }

  /* ---- drawing ---- */
  function show(view) {
    ['loading', 'signin', 'unverified', 'wrong', 'unlinked', 'home'].forEach(function (x) { $('v-' + x).hidden = x !== view; });
    $('btn-out').hidden = view !== 'home';
  }
  function paint() {
    var st = TS.state();
    NOW = clock();
    $('testbar').hidden = !TS.paths().testMode;
    $('hdr-sub').textContent = TS.paths().testMode ? 'Test copy' : 'Hedin BMW Ruxley';
    if (!st) { show('loading'); return; }
    if (st.status === 'signedout') { show('signin'); return; }
    if (st.status === 'unverified') { $('unv-email').textContent = TS.email(); $('bottomnav').hidden = true; show('unverified'); return; }
    if (st.status === 'wrongdomain') { $('wrong-email').textContent = (TS.email()) || ''; show('wrong'); return; }
    if (st.status === 'unlinked') { $('unlinked-email').textContent = TS.email(); show('unlinked'); return; }
    if (st.status === 'loading') { $('loading-msg').textContent = 'Loading…'; show('loading'); return; }
    if (!Object.keys(TS.config().team || {}).length) {
      $('loading-msg').textContent = 'The team list is not set up on this copy yet. Open lockup.html once, then come back.';
      show('loading'); return;
    }
    $('bottomnav').hidden = false;
    show('home');
    subscribe();
    var next = nextPage();
    if (next && st.canManage) { location.replace(next); return; }
    $('next-note').hidden = !next || st.canManage;
    $('who').textContent = st.name;
    $('home-date').textContent = fmt(NOW.date, true);
    $('home-hello').textContent = 'Hello, ' + st.name;
    $('home-role').textContent = { admin: 'Admin', manager: 'Manager', staff: 'Team' }[st.role] || 'Team';
    $('home-role').className = 'pill ' + (st.role === 'staff' ? '' : 'b');
    var t = tonight(), c = todayCalendar();
    var live = { lockup: t, calendar: c, forecourt: { text: 'Open the check', cls: 'muted' }, board: { text: 'Open the board', cls: 'muted' }, admin: { text: 'People, managers and access', cls: 'muted' } };
    $('cards').innerHTML = TI.cardsFor(st).map(function (card) {
      var l = live[card.id] || { text: '', cls: 'muted' };
      return '<a class="tile" href="' + esc(card.href) + '"><b>' + esc(card.title) + '</b><span class="blurb">' + esc(card.blurb) + '</span>' +
        '<span class="live ' + esc(l.cls) + '">' + esc(l.text) + '</span></a>';
    }).join('');
    $('next-days').innerHTML = nextDays(7).map(function (x) {
      var cls = x.on ? 'ok' : (x.why === 'holiday' || x.why === 'absent' ? 'warn' : 'muted');
      return '<li><span>' + esc(fmt(x.date, true)) + '</span><span class="' + cls + '">' + esc(WHY[x.why] || x.why) + '</span></li>';
    }).join('');
    var w = waiting();
    $('waiting').innerHTML = w.length ? w.map(function (x) {
      return '<li><span>' + esc(x.text) + '</span><a class="big sm" href="' + esc(x.href) + '">' + esc(x.action) + '</a></li>';
    }).join('') : '<li class="muted">Nothing needs you.</li>';
  }

  var TeamHome = {
    start: function () {
      if (started) return;
      started = true;
      loadHolidays();
      TS.onChange(function (st) { last = st; paint(); });
      /* the clock: the day rolls over without a reload */
      setInterval(function () { var n = clock(); if (n.date !== NOW.date) { NOW = n; paint(); } }, 60000);
      paint();
    },
    _paint: paint,
    _setNow: function (d) { FIXED = d ? { date: d, dow: S.dowOf(d), mins: 720, week: R.isoWeek(d) } : null; NOW = clock(); paint(); },
    _nextDays: nextDays, _waiting: waiting, _tonight: tonight, _todayCalendar: todayCalendar
  };
  root.TeamHome = TeamHome;
})(this);
