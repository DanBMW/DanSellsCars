/* shifts-app.js - the shift and day-off calendar, as a plain script (no
 * Firebase here). shifts.html gives it a backend: sign in, watch a path, and
 * write. That keeps every rule in shifts-rota.js and lockup-rota.js, and lets
 * the page be exercised in a browser with a fake backend.
 *
 * Writes go to the lockup root (lockup/ or lockupTest/, the same switch
 * lockup.html uses) and to the shifts root (shifts/ or shiftsTest/). Approved
 * time off is written to lockup/absences, so lockup cover is arranged from the
 * same record (lockup-rota.js applyAbsences), and a day off switch is a pair of
 * absences: an absent on the day given up, a works on the day taken instead.
 */
(function (root) {
  'use strict';
  var R = root.LockupRota, S = root.ShiftRota;
  var B = null;
  var DOM_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WHY = {
    working: 'In', 'swapped-in': 'In (swapped)', off: 'Usual day off', holiday: 'Holiday', absent: 'Away',
    bh: 'Bank holiday', 'bh-off': 'Not on the bank holiday rota', 'bh-no-rota': 'No bank holiday rota yet',
    closed: 'Closed', inactive: 'Not active', 'not-team': 'Not on the team'
  };
  var SYM = {
    working: ['●', 'w', 'In'], 'swapped-in': ['⇄', 's', 'In (swapped)'], off: ['–', 'o', 'Usual day off'],
    holiday: ['H', 'h', 'Holiday'], absent: ['A', 'a', 'Away'], bh: ['BH', 'bh', 'Bank holiday'],
    'bh-off': ['–', 'o', 'Not on the bank holiday rota'], 'bh-no-rota': ['?', 'x', 'No bank holiday rota yet'], closed: ['', 'c', 'Closed']
  };

  var NOW = R.london(), FIXED = null;
  function clock() { return FIXED || R.london(); }
  var HOL = {};
  var st = {
    user: null, auth: 'loading', testMode: true, RL: 'lockup', RS: 'shifts', unsub: [], rootsKey: '',
    me: null, tab: 'calendar', ym: NOW.date.slice(0, 7), view: 'days', openRequest: null, sheetOpen: null, toastT: 0,
    D: { lcfg: null, absences: {}, weeks: {}, status: {}, scfg: null, requests: {}, bh: {}, managers: {}, links: {}, admin: false }
  };

  /* ---------- small helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(o) { var out = {}; Object.keys(o).forEach(function (k) { if (o[k] !== undefined) out[k] = o[k]; }); return out; }
  function fmt(d, long) {
    if (!d) return '';
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: long ? 'long' : 'short', day: 'numeric', month: 'short' });
  }
  function rangeText(a, b) { return a === b ? fmt(a, true) : fmt(a) + ' to ' + fmt(b); }
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show'); clearTimeout(st.toastT);
    st.toastT = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function teamCfg() { return (st.D.lcfg && st.D.lcfg.team) || {}; }
  function mgrCfg() { return (st.D.lcfg && st.D.lcfg.managers) || {}; }
  function nameOf(id) { var p = teamCfg()[id] || mgrCfg()[id]; return p ? p.name : (id || '?'); }
  function teamIds() {
    var t = teamCfg();
    return Object.keys(t).filter(function (k) { return t[k].active !== false; })
      .sort(function (a, b) { return ((t[a].order || 0) - (t[b].order || 0)) || (a < b ? -1 : 1); });
  }
  function lower(s) { return String(s || '').trim().toLowerCase(); }
  function personForEmail(email) {
    var e = lower(email), found = null;
    [teamCfg(), mgrCfg()].forEach(function (group) {
      Object.keys(group).forEach(function (id) { if (!found && lower(group[id].email) === e) found = id; });
    });
    return found;
  }
  function ctx() {
    return S.makeCtx({
      team: teamCfg(), managers: mgrCfg(), absences: st.D.absences, config: st.D.scfg || {}, bh: st.D.bh,
      holidays: HOL, closed: (st.D.lcfg && st.D.lcfg.holidays) || {}, requests: st.D.requests, today: NOW.date
    });
  }
  function signedDates() {
    var o = {};
    Object.keys(st.D.status || {}).forEach(function (d) { if (st.D.status[d] && st.D.status[d].state === 'signed') o[d] = 1; });
    return o;
  }
  function isAdmin() { return !!st.D.admin; }
  function isMgr() { return !!st.me && (st.D.admin || st.D.managers[st.me] === true); }
  function plusMonths(date, n) { var a = date.split('-'); var d = new Date(Date.UTC(+a[0], +a[1] - 1 + n, 1)); return d.toISOString().slice(0, 7) + '-01'; }
  function daysInMonth(ym) { var a = ym.split('-'); return new Date(Date.UTC(+a[0], +a[1], 0)).getUTCDate(); }

  /* ---------- writes ---------- */
  function auditLine(what) { if (!st.me) return; B.push(st.RS + '/audit', { what: String(what).slice(0, 200), ts: Date.now() }).catch(function () {}); }
  function notify(subject, lines, to) {
    var k = B.key(st.RL + '/notify');
    var rec = { kind: 'shifts', subject: String(subject).slice(0, 160), lines: lines.filter(Boolean).slice(0, 20), ts: Date.now(), by: 'shifts.html' };
    if (to) rec.to = to;
    return B.set(st.RL + '/notify/' + k, rec).catch(function (e) { console.error('notify', e); });
  }
  function coverLines(ch) {
    return ch.map(function (c) {
      return fmt(c.date, true) + ': ' + nameOf(c.out) + ' out, ' + (c.in ? nameOf(c.in) + ' in' : 'nobody free') +
        '. Now on: ' + c.pair.map(nameOf).join(' and ') + (c.note ? '. ' + c.note : '');
    });
  }
  /* writes the absence records for an approved request, then re-pairs lockup
     cover from them. Returns the cover changes. */
  function applyEffects(reqId, r, edits) {
    var keys = ['a', 'w'];
    var label = effectLabel(r);
    var writes = edits.map(function (e, i) {
      var key = 'sh_' + reqId + '_' + keys[i];
      var rec = clean({ personId: e.personId, from: e.from, to: e.to, kind: e.kind, status: 'approved', note: label.slice(0, 200), by: nameOf(st.me), ts: Date.now(), req: reqId });
      st.D.absences[key] = rec;
      return B.set(st.RL + '/absences/' + key, rec);
    });
    return Promise.all(writes).then(function () { return arrangeCover(); });
  }
  function cancelEffects(reqId, r) {
    var writes = [];
    ['a', 'w'].forEach(function (s) {
      var key = 'sh_' + reqId + '_' + s;
      if (st.D.absences[key] && st.D.absences[key].status !== 'cancelled') {
        st.D.absences[key].status = 'cancelled';
        writes.push(B.update(st.RL + '/absences/' + key, { status: 'cancelled' }));
      }
    });
    return Promise.all(writes);
  }
  function effectLabel(r) {
    if (r.kind === 'holiday') return 'Holiday';
    if (r.kind === 'absence') return 'Away' + (r.note ? ': ' + r.note : '');
    if (r.kind === 'switch') return 'Day off switched';
    if (r.kind === 'swap') return 'Shift swapped with ' + nameOf(r.withId);
    return '';
  }
  /* lockup cover for everything in absences, from the same rules lockup.html runs */
  function arrangeCover() {
    var w = JSON.parse(JSON.stringify(st.D.weeks || {}));
    var ch = R.applyAbsences(w, teamCfg(), st.D.absences, NOW.date, signedDates());
    var writes = ch.map(function (c) {
      var o = {}; o[c.dow] = c.pair;
      return B.update(st.RL + '/weeks/' + c.week + '/days', o);
    });
    if (ch.length) writes.push(B.push(st.RL + '/changes', { kind: 'shifts', ts: Date.now(), lines: coverLines(ch).slice(0, 20) }));
    return Promise.all(writes).then(function () { return ch; });
  }

  /* ---------- requests: create, approve, decline, accept, cancel ---------- */
  function createRequest(r) {
    var id = B.key(st.RS + '/requests');
    var rec = clean(Object.assign({ status: 'pending', ts: Date.now(), by: nameOf(st.me) }, r));
    return B.set(st.RS + '/requests/' + id, rec).then(function () { return id; });
  }
  function approve(r, o) {
    o = o || {};
    var chk = S.checkRequest(ctx(), Object.assign({}, r, { id: r.id }));
    if (!chk.valid) { toast(chk.errors[0]); return Promise.resolve(false); }
    var short = !chk.impact.ok;
    if (short && !o.override) { toast('That takes a day below its minimum. Tick override to approve anyway.'); return Promise.resolve(false); }
    if (short && !o.reason) { toast('Give a reason for going below the minimum.'); return Promise.resolve(false); }
    return applyEffects(r.id, r, chk.edits).then(function (ch) {
      return B.update(st.RS + '/requests/' + r.id, clean({
        status: 'approved', decidedBy: nameOf(st.me), decidedAt: Date.now(), override: short ? true : undefined,
        reason: o.reason || undefined, auto: r.auto === true ? true : undefined
      })).then(function () {
        auditLine((short ? 'Approved with override' : 'Approved') + ': ' + describe(r) + (o.reason ? ' (' + o.reason + ')' : ''));
        if (ch.length) notify('Lockup cover re-paired: ' + nameOf(r.personId), coverLines(ch));
        return true;
      });
    });
  }
  function decline(r, reason) {
    return B.update(st.RS + '/requests/' + r.id, clean({ status: 'declined', decidedBy: nameOf(st.me), decidedAt: Date.now(), reason: reason || undefined })).then(function () {
      auditLine('Declined: ' + describe(r));
    });
  }
  function cancel(r) {
    var was = r.status;
    return (was === 'approved' ? cancelEffects(r.id, r) : Promise.resolve()).then(function () {
      return B.update(st.RS + '/requests/' + r.id, { status: 'cancelled' });
    }).then(function () {
      auditLine('Cancelled: ' + describe(r));
      if (was === 'approved') return arrangeCover().then(function () { return true; });
    });
  }
  /* the colleague who is asked to take a shift accepts it: if the day stays
     covered it goes through now, otherwise a manager decides */
  function acceptSwap(r) {
    var chk = S.checkRequest(ctx(), Object.assign({}, r, { id: r.id }));
    if (!chk.valid) { toast(chk.errors[0]); return Promise.resolve(false); }
    if (chk.impact.ok) {
      return applyEffects(r.id, r, chk.edits).then(function (ch) {
        return B.update(st.RS + '/requests/' + r.id, { status: 'approved', auto: true, decidedBy: nameOf(st.me), decidedAt: Date.now() }).then(function () {
          auditLine('Swap accepted and approved: ' + describe(r));
          if (ch.length) notify('Lockup cover re-paired: ' + nameOf(r.personId), coverLines(ch));
          return true;
        });
      });
    }
    return B.update(st.RS + '/requests/' + r.id, { status: 'pending', decidedBy: nameOf(st.me), decidedAt: Date.now() }).then(function () {
      notify('Shift swap needs a manager: ' + fmt(r.date, true), [nameOf(r.withId) + ' has agreed to take ' + nameOf(r.personId) + '’s shift on ' + fmt(r.date, true) + '.', 'It takes a day below the minimum, so it needs approving in Shifts.']);
      return true;
    });
  }
  function describe(r) {
    if (r.kind === 'holiday') return 'Holiday ' + rangeText(r.from, r.to);
    if (r.kind === 'absence') return 'Away ' + rangeText(r.from, r.to) + (r.note ? ' (' + r.note + ')' : '');
    if (r.kind === 'switch') return 'Day off switch: give up ' + fmt(r.giveUp) + ' and work ' + fmt(r.takeOn) + ' instead';
    if (r.kind === 'swap') return 'Shift on ' + fmt(r.date) + ' given to ' + nameOf(r.withId);
    return 'Request';
  }
  var STATUS_TEXT = { pending: ['Waiting for a manager', 'a'], awaiting: ['Waiting for a colleague', 'a'], approved: ['Approved', 'g'], declined: ['Declined', 'r'], cancelled: ['Cancelled', ''] };

  /* ---------- derived views ---------- */
  function requestsOf(filter) {
    return Object.keys(st.D.requests || {}).map(function (k) { return Object.assign({ id: k }, st.D.requests[k]); })
      .filter(filter).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  }
  function pendingForManagers() { return requestsOf(function (r) { return r.status === 'pending'; }); }

  /* ---------- rendering: calendar ---------- */
  function monthsList() {
    var out = [];
    for (var i = 0; i < 6; i++) out.push(plusMonths(NOW.date, i).slice(0, 7));
    return out;
  }
  function monthGrid(ym) {
    var first = ym + '-01', n = daysInMonth(ym), last = ym + '-' + (n < 10 ? '0' : '') + n;
    var lead = DOM_DAYS.indexOf(S.dowOf(first));
    var rows = [], d = R.addDays(first, -lead);
    do {
      var week = [];
      for (var i = 0; i < 7; i++) { week.push({ date: d, inMonth: d.slice(0, 7) === ym }); d = R.addDays(d, 1); }
      rows.push(week);
    } while (d <= last);
    return rows;
  }
  function dayCell(date, c) {
    var cls = ['dc'];
    if (date < NOW.date) cls.push('past');
    if (date === NOW.date) cls.push('today');
    var txt;
    if (c.kind === 'closed') { cls.push('closed'); txt = 'Closed'; }
    else if (c.noRota) { cls.push('bad'); txt = 'No rota'; }
    else { cls.push(c.ok ? 'ok' : 'short'); txt = c.count + '/' + c.min; }
    if (c.kind === 'bh') cls.push('bh');
    var label = c.kind === 'closed' ? 'Closed' : c.count + ' on, minimum ' + c.min + (c.kind === 'bh' ? ' (bank holiday)' : c.kind === 'sat' ? ' (Saturday)' : '');
    return '<button type="button" class="' + cls.join(' ') + '" data-day="' + date + '" title="' + esc(label) + '"><b>' + Number(date.slice(8)) + '</b><span>' + esc(txt) + '</span>' +
      (c.kind === 'bh' ? '<em>' + esc(HOL[date] ? HOL[date].label : 'Bank hol') + '</em>' : '') + '</button>';
  }
  function paintCalendar() {
    var c = ctx();
    var months = monthsList();
    var mins = $('mins');
    if (mins) mins.textContent = 'Minimums: Monday to Friday ' + c.config.weekdayMin + ', Saturday ' + c.config.saturdayMin + ', bank holidays ' + c.config.bhStaff + ' from the sales team.';
    var html = '<div class="months">' + months.map(function (m) {
      var lab = MONTHS[+m.slice(5) - 1].slice(0, 3) + ' ' + m.slice(2, 4);
      return '<button type="button" class="' + (m === st.ym ? 'on' : '') + '" data-month="' + m + '">' + lab + '</button>';
    }).join('') + '</div>';
    html += '<div class="seg"><button type="button" class="' + (st.view === 'days' ? 'on' : '') + '" data-view="days">Days</button>' +
      '<button type="button" class="' + (st.view === 'people' ? 'on' : '') + '" data-view="people">Who is in</button></div>';
    if (st.view === 'days') {
      html += '<div class="grid-head">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>';
      html += '<div class="grid">' + monthGrid(st.ym).map(function (row) {
        return row.map(function (x) {
          if (!x.inMonth) return '<span class="dc out"></span>';
          return dayCell(x.date, S.countDay(c, x.date));
        }).join('');
      }).join('') + '</div>';
    } else {
      html += peopleTable(c);
    }
    html += '<div class="legend"><span><i class="k ok"></i>At or above minimum</span><span><i class="k short"></i>Below minimum</span><span><i class="k closed"></i>Closed</span><span><i class="k bh"></i>Bank holiday rota</span></div>';
    $('cal').innerHTML = html;
    paintActions();
  }
  function peopleTable(c) {
    var n = daysInMonth(st.ym), ids = teamIds(), days = [];
    for (var i = 1; i <= n; i++) days.push(st.ym + '-' + (i < 10 ? '0' : '') + i);
    var head = '<tr><th></th>' + days.map(function (d) {
      var k = S.countDay(c, d), dow = S.dowOf(d).slice(0, 1).toUpperCase();
      return '<th class="' + (k.kind === 'closed' ? 'closed' : k.ok ? '' : 'short') + '" data-day="' + d + '" title="' + esc(fmt(d, true)) + '">' + Number(d.slice(8)) + '<small>' + dow + '</small></th>';
    }).join('') + '</tr>';
    var count = '<tr class="counts"><th>On</th>' + days.map(function (d) {
      var k = S.countDay(c, d);
      return '<td class="' + (k.kind === 'closed' ? 'closed' : k.ok ? 'ok' : 'short') + '">' + (k.kind === 'closed' ? '' : k.count) + '</td>';
    }).join('') + '</tr>';
    var rows = ids.map(function (id) {
      return '<tr><th>' + esc(nameOf(id)) + '</th>' + days.map(function (d) {
        var p = S.personDay(c, id, d), sym = SYM[p.why] || ['', 'o', WHY[p.why] || ''];
        if (!p.on && p.why === 'off' && S.dayKind(c, d) === 'bh') sym = SYM['bh-off'];
        return '<td class="sym ' + sym[1] + '" title="' + esc(nameOf(id) + ', ' + fmt(d, true) + ': ' + sym[2]) + '">' + sym[0] + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div class="people"><table><thead>' + head + '</thead><tbody>' + count + rows + '</tbody></table></div>';
  }

  function openDay(date) {
    var c = ctx(), k = S.countDay(c, date);
    var ids = teamIds();
    var lock = (k.kind === 'weekday' || k.kind === 'sat') ? R.pairOn(st.D.weeks, date) : [];
    var rows = ids.map(function (id) {
      var p = S.personDay(c, id, date);
      var cls = p.on ? 'ok' : (p.why === 'holiday' || p.why === 'absent' ? 'warn' : 'muted');
      return '<li><span>' + esc(nameOf(id)) + '</span><span class="' + cls + '">' + esc(WHY[p.why] || p.why) + '</span></li>';
    }).join('');
    var head = fmt(date, true);
    var status = k.kind === 'closed' ? 'Closed' : k.noRota ? 'No bank holiday rota yet' :
      (k.ok ? k.count + ' on, minimum ' + k.min : '<span class="bad">' + k.count + ' on, minimum ' + k.min + ', short by ' + k.short + '</span>');
    var body = '<h2>' + esc(head) + '</h2>' +
      '<p class="sub">' + status + (HOL[date] ? ' · ' + esc(HOL[date].label) : '') + '</p>' +
      (k.kind !== 'closed' ? '<ul class="sum">' + rows + '</ul>' : '<p class="muted">The office is closed.</p>') +
      (lock.length ? '<p class="small muted">Lockup tonight: ' + esc(lock.map(nameOf).join(' and ')) + '</p>' : '') +
      '<div class="row end"><button class="ghost" type="button" data-close>Close</button></div>';
    sheet(body);
  }

  /* ---------- rendering: requests ---------- */
  function paintRequests() {
    var mine = requestsOf(function (r) { return r.personId === st.me; }).slice(0, 25);
    var incoming = requestsOf(function (r) { return r.kind === 'swap' && r.withId === st.me && r.status === 'awaiting'; });
    var needs = isMgr() ? pendingForManagers() : [];
    var out = '';
    if (incoming.length) out += section('Shifts asked of you', incoming.map(function (r) { return row(r, 'incoming'); }).join(''));
    if (needs.length) out += section('Waiting for a manager (' + needs.length + ')', needs.map(function (r) { return row(r, 'mgr'); }).join(''));
    out += section('Yours', mine.length ? mine.map(function (r) { return row(r, 'mine'); }).join('') : '<p class="muted">Nothing yet. Use the buttons on the calendar.</p>');
    $('p-requests').innerHTML = out;
    var badge = $('tab-requests-n');
    if (badge) { var n = incoming.length + needs.length; badge.textContent = n ? String(n) : ''; badge.hidden = !n; }
  }
  function section(title, body) { return '<div class="card"><b>' + esc(title) + '</b><ul class="reqs">' + body + '</ul></div>'; }
  function row(r, who) {
    var st2 = STATUS_TEXT[r.status] || [r.status, ''];
    var pillText = r.status === 'awaiting' ? 'Waiting for ' + nameOf(r.withId) : st2[0];
    var acts = '';
    if (who === 'incoming') acts = '<button class="big small-btn" type="button" data-accept="' + r.id + '">Accept</button><button class="ghost" type="button" data-decline-swap="' + r.id + '">Decline</button>';
    if (who === 'mgr') acts = '<button class="big small-btn" type="button" data-review="' + r.id + '">Review</button>';
    if (who === 'mine' && (r.status === 'pending' || r.status === 'awaiting' || (r.status === 'approved' && r.from && r.from >= NOW.date) || (r.status === 'approved' && r.kind === 'switch' && r.giveUp >= NOW.date))) {
      acts = '<button class="ghost" type="button" data-cancel="' + r.id + '">Cancel</button>';
    }
    return '<li><div><b>' + esc(nameOf(r.personId)) + '</b> <span class="muted small">' + esc(kindLabel(r.kind)) + '</span><br>' + esc(describe(r)) +
      (r.reason ? '<br><span class="muted small">' + esc(r.reason) + '</span>' : '') +
      (r.override ? '<br><span class="warn small">Approved below minimum</span>' : '') + '</div>' +
      '<div class="rq-r"><span class="pill ' + st2[1] + '">' + esc(pillText) + '</span>' + (acts ? '<div class="acts">' + acts + '</div>' : '') + '</div></li>';
  }
  function kindLabel(k) { return { holiday: 'Holiday', absence: 'Absence', switch: 'Day off switch', swap: 'Shift swap' }[k] || k; }

  /* ---------- rendering: bank holidays (managers) ---------- */
  function paintBH() {
    var c = ctx(), horizon = plusMonths(NOW.date, 6);
    var dates = S.bhDates(c, NOW.date, horizon);
    var excl = c.config.bhExclude, pool = teamIds().filter(function (id) { return excl.indexOf(id) < 0; });
    var tally = {};
    dates.forEach(function (d) { S.listOf((st.D.bh[d] || {}).staff).forEach(function (id) { tally[id] = (tally[id] || 0) + 1; }); });
    var missing = dates.filter(function (d) { return !st.D.bh[d]; });
    var body = '<p class="muted small">Bank holidays from gov.uk, six months ahead. Each needs ' + c.config.bhStaff + ' from the sales team. ' +
      esc(excl.map(nameOf).join(' and ')) + ' are never on bank holidays.</p>';
    body += '<div class="row between"><b>' + dates.length + ' bank holiday' + (dates.length === 1 ? '' : 's') + ', ' + missing.length + ' without a rota</b>' +
      (missing.length && isMgr() ? '<button class="big small-btn" type="button" data-bh-gen>Fill the empty ones</button>' : '') + '</div>';
    if (!dates.length) body += '<p class="muted">No bank holidays in the next six months.</p>';
    dates.forEach(function (d) {
      var rota = S.listOf((st.D.bh[d] || {}).staff), short = c.config.bhStaff - rota.length;
      body += '<div class="card bhc"><div class="row between"><b>' + esc(fmt(d, true)) + '</b><span class="muted small">' + esc((HOL[d] || {}).label || '') + '</span></div>' +
        (short > 0 ? '<p class="bad small">' + rota.length + ' of ' + c.config.bhStaff + ' chosen' + (short ? ', ' + short + ' short' : '') + '</p>' : '<p class="ok small">' + rota.length + ' of ' + c.config.bhStaff + ' chosen</p>') +
        '<div class="names">' + pool.map(function (id) {
          var on = rota.indexOf(id) >= 0, away = !!R.absentOn(st.D.absences, d)[id];
          return '<label class="pick' + (away ? ' away' : '') + '"><input type="checkbox" data-bh-date="' + d + '" value="' + esc(id) + '"' + (on ? ' checked' : '') + (isMgr() ? '' : ' disabled') + '> ' + esc(nameOf(id)) + (away ? ' (away)' : '') + '</label>';
        }).join('') + '</div>' +
        (isMgr() ? '<div class="row end"><button class="ghost" type="button" data-bh-save="' + d + '">Save</button></div>' : '') + '</div>';
    });
    body += '<div class="card"><b>Bank holidays so far (next six months)</b><ul class="sum">' + pool.map(function (id) {
      return '<li><span>' + esc(nameOf(id)) + '</span><span>' + (tally[id] || 0) + '</span></li>';
    }).join('') + '</ul></div>';
    $('p-bh').innerHTML = body;
  }

  /* ---------- rendering: staffing (managers) ---------- */
  function paintStaff() {
    var c = ctx(), horizon = plusMonths(NOW.date, 6);
    var short = S.shortDays(c, NOW.date, R.addDays(horizon, -1));
    var html = '<div class="card"><b>Days below minimum, next six months</b><p class="muted small">Weekdays ' + c.config.weekdayMin + ', Saturdays ' + c.config.saturdayMin + ', bank holidays ' + c.config.bhStaff + '.</p>';
    if (!short.length) html += '<p class="ok">Every day is at or above its minimum.</p>';
    else html += '<ul class="sum">' + short.map(function (d) {
      return '<li><span>' + esc(fmt(d.date, true)) + '</span><span class="bad">' + (d.noRota ? 'No rota' : d.count + ' of ' + d.min) + '</span></li>';
    }).join('') + '</ul>';
    html += '</div>';
    html += '<div class="card"><b>Time off this week and next</b><p class="muted small">Approved holidays and absences from lockup, so the two always agree.</p><ul class="sum">';
    var rows = Object.keys(st.D.absences).map(function (k) { return st.D.absences[k]; })
      .filter(function (a) { return a && a.kind !== 'works' && a.status !== 'cancelled' && a.to >= NOW.date && a.from <= R.addDays(NOW.date, 14); })
      .sort(function (a, b) { return a.from < b.from ? -1 : 1; });
    html += rows.length ? rows.map(function (a) {
      return '<li><span>' + esc(nameOf(a.personId)) + '</span><span class="muted small">' + esc(rangeText(a.from, a.to)) + ' · ' + (a.kind === 'holiday' ? 'holiday' : 'away') + '</span></li>';
    }).join('') : '<li class="muted">Nobody is away.</li>';
    html += '</ul></div>';
    $('p-staff').innerHTML = html;
  }

  /* ---------- rendering: settings (managers) ---------- */
  function paintSettings() {
    var cfg = S.cfgOf(st.D.scfg || {}), t = teamCfg(), ids = teamIds();
    var html = '<div class="card"><b>Minimum staffing</b><p class="muted small">Counted over the sales team, excluding anyone off, away or not rostered that day.</p>' +
      '<form id="cfg-form" class="grid2">' +
      field('weekdayMin', 'Monday to Friday, at least', cfg.weekdayMin, 0, 9) +
      field('saturdayMin', 'Saturday, at least', cfg.saturdayMin, 0, 10) +
      field('bhStaff', 'Bank holidays, rota size', cfg.bhStaff, 0, 10) +
      field('switchesPerWeek', 'Day off switches per person a week', cfg.switchesPerWeek, 0, 5) +
      '</form>' +
      '<p class="small" style="margin:10px 0 6px"><b>Left off the bank holiday rota</b></p><div class="names">' + ids.map(function (id) {
        return '<label class="pick"><input type="checkbox" form="cfg-form" name="bhx" value="' + esc(id) + '"' + (cfg.bhExclude.indexOf(id) >= 0 ? ' checked' : '') + '> ' + esc(nameOf(id)) + '</label>';
      }).join('') + '</div>' +
      '<div class="row end" style="margin-top:12px"><button class="big" type="button" data-save-config>Save the settings</button></div></div>';

    html += '<div class="card"><b>Usual day off</b><p class="muted small">Changing it re-pairs the lockup nights from next week on, the same as lockup.html does. The check shows the days that would fall short.</p><ul class="sum off-list">';
    html += ids.map(function (id) {
      var cur = t[id].off || '';
      var opts = ['', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(function (d) {
        return '<option value="' + d + '"' + (d === cur ? ' selected' : '') + '>' + (d ? R.DAY_NAMES[d] : 'None') + '</option>';
      }).join('');
      return '<li><span>' + esc(nameOf(id)) + '</span><span class="off-ctl"><select data-off="' + id + '"' + (isMgr() ? '' : ' disabled') + '>' + opts + '</select>' +
        (isMgr() ? '<button class="ghost" type="button" data-off-save="' + id + '" hidden>Save</button>' : '') + '</span></li>';
    }).join('') + '</ul><p class="muted small" id="off-note"></p></div>';

    if (isAdmin()) {
      var people = ids.concat(Object.keys(mgrCfg()));
      html += '<div class="card"><b>Who manages this (Dan only)</b><p class="muted small">Managers can approve time off, set these numbers and the bank holiday rota. Dan always can.</p><div class="names">' + people.map(function (id) {
        return '<label class="pick"><input type="checkbox" data-mgr="' + esc(id) + '"' + (st.D.managers[id] === true ? ' checked' : '') + '> ' + esc(nameOf(id)) + '</label>';
      }).join('') + '</div></div>';
    }
    $('p-settings').innerHTML = html;
  }
  function field(name, label, v, min, max) {
    return '<label class="fld"><span>' + esc(label) + '</span><input type="number" name="' + name + '" min="' + min + '" max="' + max + '" value="' + esc(v) + '"></label>';
  }

  /* ---------- actions bar ---------- */
  function paintActions() {
    var box = $('actions');
    if (!box) return;
    var html = '<button class="big" type="button" data-act="holiday">Book holiday</button>' +
      '<button class="big alt" type="button" data-act="absence">Report an absence</button>' +
      '<button class="big alt" type="button" data-act="switch">Switch my day off</button>' +
      '<button class="big alt" type="button" data-act="swap">Give a shift to a colleague</button>';
    if (isMgr()) html += '<button class="big alt" type="button" data-act="mgr-holiday">Add time off for someone</button>';
    box.innerHTML = html;
  }

  /* ---------- request forms (sheet) ---------- */
  function sheet(html) {
    $('sheet').innerHTML = html;
    $('m-sheet').classList.add('show');
    $('sheet').scrollTop = 0;
  }
  function closeSheet() { $('m-sheet').classList.remove('show'); st.sheetOpen = null; }
  function opt(list, sel) {
    return list.map(function (id) { return '<option value="' + esc(id) + '"' + (id === sel ? ' selected' : '') + '>' + esc(nameOf(id)) + '</option>'; }).join('');
  }
  function openForm(kind) {
    var me = st.me, body = '', title = '', help = '';
    var people = teamIds();
    if (kind === 'holiday') {
      title = 'Book holiday';
      help = 'Goes to a manager to approve. It is not booked until they do.';
      body = dateField('from', 'First day', NOW.date) + dateField('to', 'Last day', NOW.date) + noteField();
    } else if (kind === 'absence') {
      title = 'Report an absence';
      help = 'For sickness or anything that stops you coming in. It is recorded straight away and lockup cover is arranged from it.';
      body = dateField('from', 'First day', NOW.date) + dateField('to', 'Last day', NOW.date) + noteField();
    } else if (kind === 'switch') {
      title = 'Switch my day off';
      help = 'Give up a day you are working and work your usual day off instead, in the same week. It goes through now if the office stays staffed, otherwise a manager approves it.';
      body = dateField('giveUp', 'Day you give up', '') + dateField('takeOn', 'Day off you work instead', '') + noteField();
    } else if (kind === 'swap') {
      title = 'Give a shift to a colleague';
      help = 'Pick a shift you are working and a colleague who is off that day. They accept it, then it goes through if the office stays staffed, otherwise a manager approves it.';
      body = dateField('date', 'The shift', '') + '<label class="fld"><span>Colleague taking it</span><select name="withId"><option value="">Choose</option>' + opt(people.filter(function (id) { return id !== me; }), '') + '</select></label>' + noteField();
    } else if (kind === 'mgr-holiday') {
      title = 'Add time off for someone';
      help = 'Booked straight away, as a manager. Use this for holidays agreed in person.';
      body = '<label class="fld"><span>Who</span><select name="personId">' + opt(people, '') + '</select></label>' +
        '<label class="fld"><span>Type</span><select name="kind"><option value="holiday">Holiday</option><option value="absence">Away (sickness or other)</option></select></label>' +
        dateField('from', 'First day', NOW.date) + dateField('to', 'Last day', NOW.date) + noteField() +
        '<label class="check"><input type="checkbox" name="override"> <span>Override the minimum if it is short-staffed</span></label><label class="fld"><span>Reason for the override</span><input type="text" name="reason" maxlength="200"></label>';
    }
    st.sheetOpen = { kind: kind };
    sheet('<h2>' + esc(title) + '</h2><p class="sub">' + esc(help) + '</p><form id="rq-form" class="stack">' + body +
      '<div id="pv" class="preview"></div>' +
      '<div class="row end"><button class="ghost" type="button" data-close>Cancel</button><button class="big" type="submit" id="rq-go" disabled>Send</button></div></form>');
    $('rq-form').addEventListener('submit', function (e) { e.preventDefault(); submitForm(kind); });
    previewForm();
  }
  function dateField(name, label, v) {
    return '<label class="fld"><span>' + esc(label) + '</span><input type="date" name="' + name + '" value="' + esc(v) + '"></label>';
  }
  function noteField() { return '<label class="fld"><span>Note (optional)</span><input type="text" name="note" maxlength="200"></label>'; }
  function formValues(kind) {
    var f = $('rq-form'), v = {};
    Array.prototype.forEach.call(f.elements, function (el) { if (el.name) v[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
    var me = st.me, r = { kind: kind };
    if (kind === 'holiday' || kind === 'absence') { r.personId = me; r.from = v.from; r.to = v.to; }
    if (kind === 'switch') { r.personId = me; r.giveUp = v.giveUp; r.takeOn = v.takeOn; }
    if (kind === 'swap') { r.personId = me; r.date = v.date; r.withId = v.withId; }
    if (kind === 'mgr-holiday') { r.personId = v.personId; r.kind = v.kind; r.from = v.from; r.to = v.to; }
    r.note = (v.note || '').trim().slice(0, 200);
    r.reasonText = (v.reason || '').trim().slice(0, 200);
    r.override = !!v.override;
    return r;
  }
  function previewForm() {
    var k = st.sheetOpen && st.sheetOpen.kind; if (!k || !$('rq-form')) return;
    var v = formValues(k), r = Object.assign({}, v), pv = $('pv'), go = $('rq-go');
    var chk = S.checkRequest(ctx(), r);
    var html = '', ok = chk.valid;
    if (!chk.valid) {
      html = chk.errors.map(function (e) { return '<p class="bad">' + esc(e) + '</p>'; }).join('');
    } else {
      var rows = chk.impact.days.filter(function (d) { return d.before.count !== d.after.count || !d.after.ok; });
      if (rows.length) {
        html += '<ul class="sum">' + rows.map(function (d) {
          return '<li><span>' + esc(fmt(d.date, true)) + '</span><span class="' + (d.after.ok ? 'ok' : 'bad') + '">' + d.before.count + ' → ' + d.after.count + ' (minimum ' + d.min + ')</span></li>';
        }).join('') + '</ul>';
      }
      html += '<p class="small' + (k === 'holiday' ? '' : chk.impact.ok ? ' ok' : ' warn') + '">' + esc(outcome(k, chk)) + '</p>';
      if (k === 'mgr-holiday' && !chk.impact.ok) {
        html += '<p class="small warn">Short-staffed: tick the override and give a reason to book it anyway.</p>';
        ok = !!(v.override && v.reasonText);
      } else if (k === 'holiday' && chk.impact.ok === false) {
        html += '<p class="small warn">This would be below minimum. A manager will have to approve it.</p>';
      }
    }
    if (pv) pv.innerHTML = html;
    if (go) go.disabled = !ok;
  }
  function outcome(k, chk) {
    if (k === 'holiday') return 'Goes to a manager to approve.';
    if (k === 'absence') return 'Recorded now. Lockup cover is arranged from it' + (chk.impact.ok ? '.' : ', and managers are told it leaves a day short.');
    if (k === 'switch') return chk.impact.ok ? 'Goes through now, the office stays staffed.' : 'This leaves a day below minimum, so a manager approves it.';
    if (k === 'swap') return 'Goes to ' + nameOf(formValues(k).withId) + ' to accept. Then it goes through if the day stays staffed, otherwise a manager approves it.';
    if (k === 'mgr-holiday') return chk.impact.ok ? 'Booked straight away.' : 'Short-staffed, see below.';
    return '';
  }
  function submitForm(kind) {
    var r = formValues(kind), go = $('rq-go');
    var chk = S.checkRequest(ctx(), r);
    if (!chk.valid) { toast(chk.errors[0]); return; }
    go.disabled = true;
    var p;
    if (kind === 'holiday') {
      p = createRequest(clean({ personId: r.personId, kind: 'holiday', from: r.from, to: r.to, note: r.note || undefined })).then(function (id) {
        notify('Holiday request: ' + nameOf(r.personId) + ', ' + rangeText(r.from, r.to), ['Approve or decline it in Shifts.', r.note].filter(Boolean));
        auditLine('Requested: ' + describe({ kind: 'holiday', from: r.from, to: r.to, personId: r.personId }));
        return 'Sent to a manager.';
      });
    } else if (kind === 'absence') {
      p = createRequest(clean({ personId: r.personId, kind: 'absence', from: r.from, to: r.to, note: r.note || undefined, status: 'approved', auto: true })).then(function (id) {
        var reqRec = { id: id, kind: 'absence', personId: r.personId, from: r.from, to: r.to, note: r.note };
        return applyEffects(id, reqRec, chk.edits).then(function (ch) {
          if (!chk.impact.ok || ch.length) notify((chk.impact.ok ? 'Lockup cover re-paired: ' : 'Short today: ') + nameOf(r.personId) + ', ' + rangeText(r.from, r.to),
            (!chk.impact.ok ? chk.impact.newlyShort.map(function (d) { return fmt(d.date, true) + ': ' + d.after.count + ' on, minimum ' + d.min; }) : []).concat(coverLines(ch)));
          return 'Recorded.';
        });
      });
    } else if (kind === 'switch') {
      p = createRequest(clean({ personId: r.personId, kind: 'switch', giveUp: r.giveUp, takeOn: r.takeOn, note: r.note || undefined })).then(function (id) {
        var rec = { id: id, kind: 'switch', personId: r.personId, giveUp: r.giveUp, takeOn: r.takeOn };
        if (!chk.impact.ok) {
          notify('Day off switch needs approval: ' + nameOf(r.personId), [describe(rec), 'It leaves a day below minimum. Approve or decline it in Shifts.']);
          return 'Sent to a manager.';
        }
        return applyEffects(id, rec, chk.edits).then(function (ch) {
          return B.update(st.RS + '/requests/' + id, { status: 'approved', auto: true, decidedBy: nameOf(r.personId), decidedAt: Date.now() }).then(function () {
            auditLine('Switched: ' + describe(rec));
            if (ch.length) notify('Lockup cover re-paired: ' + nameOf(r.personId), coverLines(ch));
            return 'Switched.';
          });
        });
      });
    } else if (kind === 'swap') {
      p = createRequest(clean({ personId: r.personId, withId: r.withId, kind: 'swap', date: r.date, status: 'awaiting', note: r.note || undefined })).then(function (id) {
        var email = (teamCfg()[r.withId] || {}).email;
        notify(nameOf(r.personId) + ' asks you to take a shift on ' + fmt(r.date, true), ['Open Shifts and accept or decline it.', 'It goes to a manager only if the office would be short.'], email ? [email] : undefined);
        return 'Sent to ' + nameOf(r.withId) + '.';
      });
    } else if (kind === 'mgr-holiday') {
      var rr = { kind: r.kind, personId: r.personId, from: r.from, to: r.to, note: r.note || undefined };
      p = createRequest(clean(Object.assign({}, rr, { status: 'approved', decidedBy: nameOf(st.me), decidedAt: Date.now(), override: !chk.impact.ok ? true : undefined, reason: r.reasonText || undefined }))).then(function (id) {
        return applyEffects(id, Object.assign({ id: id }, rr), chk.edits).then(function () {
          auditLine('Added by manager: ' + describe(rr) + (r.reasonText ? ' (' + r.reasonText + ')' : ''));
          return 'Booked.';
        });
      });
    }
    p.then(function (msg) { closeSheet(); toast(msg); render(); })
      .catch(function (e) { console.error(e); toast('That did not save. Try again.'); go.disabled = false; });
  }

  /* ---------- review (manager) ---------- */
  function openReview(id) {
    var r = Object.assign({ id: id }, st.D.requests[id] || {});
    var chk = S.checkRequest(ctx(), r);
    var rows = chk.valid ? chk.impact.days.filter(function (d) { return d.before.count !== d.after.count || !d.after.ok; }) : [];
    var body = '<h2>' + esc(nameOf(r.personId)) + '</h2><p>' + esc(describe(r)) + '</p>' +
      (r.note ? '<p class="muted small">' + esc(r.note) + '</p>' : '') +
      (!chk.valid ? chk.errors.map(function (e) { return '<p class="bad">' + esc(e) + '</p>'; }).join('') : '') +
      (rows.length ? '<ul class="sum">' + rows.map(function (d) {
        return '<li><span>' + esc(fmt(d.date, true)) + '</span><span class="' + (d.after.ok ? 'ok' : 'bad') + '">' + d.before.count + ' → ' + d.after.count + ' (minimum ' + d.min + ')</span></li>';
      }).join('') + '</ul>' : '') +
      (chk.valid && chk.impact.ok ? '<p class="ok small">Every day stays at or above minimum.</p>' : '') +
      (chk.valid && !chk.impact.ok ? '<p class="warn small">This takes a day below minimum. Tick override and give a reason to approve it anyway.</p>' +
        '<label class="check"><input type="checkbox" id="rv-ov"> <span>Override the minimum</span></label><label class="fld"><span>Reason</span><input type="text" id="rv-reason" maxlength="200"></label>' : '') +
      '<div class="row end"><button class="ghost" type="button" data-close>Close</button>' +
      '<button class="ghost" type="button" data-rv-decline="' + id + '">Decline</button>' +
      (chk.valid ? '<button class="big" type="button" data-rv-approve="' + id + '">Approve</button>' : '') + '</div>';
    sheet(body);
  }

  /* ---------- wiring: clicks and changes ---------- */
  function onClick(e) {
    if (e.target.id === 'm-sheet') { closeSheet(); return; }
    var t = e.target.closest('button, [data-day], [data-month]');
    if (!t) return;
    var d;
    if ((d = t.getAttribute('data-tab'))) { st.tab = d; render(); return; }
    if ((d = t.getAttribute('data-month'))) { st.ym = d; paintCalendar(); return; }
    if ((d = t.getAttribute('data-view'))) { st.view = d; paintCalendar(); return; }
    if ((d = t.getAttribute('data-day'))) { openDay(d); return; }
    if ((d = t.getAttribute('data-act'))) { openForm(d); return; }
    if (t.hasAttribute('data-close')) { closeSheet(); return; }
    if ((d = t.getAttribute('data-review'))) { openReview(d); return; }
    if ((d = t.getAttribute('data-cancel'))) {
      var rc = st.D.requests[d]; if (!rc) return;
      if (!window.confirm('Cancel this?')) return;
      cancel(Object.assign({ id: d }, rc)).then(function () { toast('Cancelled'); }).catch(function () { toast('That did not save.'); });
      return;
    }
    if ((d = t.getAttribute('data-accept'))) {
      acceptSwap(Object.assign({ id: d }, st.D.requests[d])).then(function (ok) { if (ok) toast('Accepted'); }).catch(function () { toast('That did not save.'); });
      return;
    }
    if ((d = t.getAttribute('data-decline-swap'))) {
      B.update(st.RS + '/requests/' + d, { status: 'cancelled', reason: 'Declined by ' + nameOf(st.me) }).then(function () { toast('Declined'); });
      return;
    }
    if ((d = t.getAttribute('data-rv-approve'))) {
      var ov = $('rv-ov'), rs = $('rv-reason');
      approve(Object.assign({ id: d }, st.D.requests[d]), { override: ov ? ov.checked : false, reason: rs ? rs.value.trim() : '' })
        .then(function (ok) { if (ok) { closeSheet(); toast('Approved'); } }).catch(function () { toast('That did not save.'); });
      return;
    }
    if ((d = t.getAttribute('data-rv-decline'))) {
      decline(Object.assign({ id: d }, st.D.requests[d]), '').then(function () { closeSheet(); toast('Declined'); }).catch(function () { toast('That did not save.'); });
      return;
    }
    if (t.hasAttribute('data-save-config')) { saveConfig(); return; }
    if (t.hasAttribute('data-bh-gen')) { generateBH(); return; }
    if ((d = t.getAttribute('data-bh-save'))) { saveBH(d); return; }
    if ((d = t.getAttribute('data-off-save'))) { saveOff(d); return; }
  }
  function onChange(e) {
    var t = e.target;
    if (t.getAttribute('data-off')) {
      var id = t.getAttribute('data-off'), btn = document.querySelector('[data-off-save="' + id + '"]');
      var cur = (teamCfg()[id] || {}).off || '';
      if (btn) btn.hidden = t.value === cur;
      if (t.value !== cur) {
        var eff = S.weeklyOffEffect(ctx(), id, t.value || null, NOW.date, plusMonths(NOW.date, 6));
        $('off-note').textContent = nameOf(id) + ' usual day off to ' + (t.value ? R.DAY_NAMES[t.value] : 'none') + ': ' +
          (eff.after > eff.before ? eff.after - eff.before + ' more day(s) below minimum over the next six months.' : eff.after < eff.before ? 'this helps: ' + (eff.before - eff.after) + ' fewer short day(s).' : 'no change to the short days.');
      } else $('off-note').textContent = '';
      return;
    }
    if (t.getAttribute('data-bh-date')) return;
    if (t.getAttribute('data-mgr')) {
      if (!isAdmin()) return;
      var pid = t.getAttribute('data-mgr'), on = t.checked;
      (on ? B.set(st.RS + '/managers/' + pid, true) : B.remove(st.RS + '/managers/' + pid)).then(function () {
        auditLine((on ? 'Made a manager: ' : 'Removed as manager: ') + nameOf(pid));
        toast(nameOf(pid) + (on ? ' can now manage shifts' : ' no longer manages shifts'));
      });
      return;
    }
  }
  function onInput(e) {
    if (e.target.closest && e.target.closest('#rq-form')) previewForm();
  }
  function saveConfig() {
    var f = $('cfg-form'), v = {};
    var num = function (n, lo, hi, dflt) { var x = parseInt(f.elements[n].value, 10); return isNaN(x) ? dflt : Math.max(lo, Math.min(hi, x)); };
    var ex = {};
    Array.prototype.forEach.call(document.querySelectorAll('input[name="bhx"]'), function (c) { if (c.checked) ex[c.value] = true; });
    v.weekdayMin = num('weekdayMin', 0, 9, 5);
    v.saturdayMin = num('saturdayMin', 0, 10, 7);
    v.bhStaff = num('bhStaff', 0, 10, 4);
    v.switchesPerWeek = num('switchesPerWeek', 0, 5, 1);
    v.bhExclude = ex;
    B.set(st.RS + '/config', v).then(function () {
      auditLine('Changed the staffing settings: weekdays ' + v.weekdayMin + ', Saturday ' + v.saturdayMin + ', bank holidays ' + v.bhStaff);
      toast('Settings saved');
    }).catch(function () { toast('That did not save.'); });
  }
  function saveOff(id) {
    var sel = document.querySelector('[data-off="' + id + '"]');
    var val = sel.value;
    var path = st.RL + '/config/team/' + id + '/off';
    var p = val ? B.set(path, val) : B.remove(path);
    p.then(function () {
      auditLine('Usual day off for ' + nameOf(id) + ': ' + (val ? R.DAY_NAMES[val] : 'none'));
      toast('Usual day off saved');
    }).catch(function () { toast('That did not save.'); });
  }
  function generateBH() {
    var c = ctx(), horizon = plusMonths(NOW.date, 6);
    var dates = S.bhDates(c, NOW.date, horizon).filter(function (d) { return !st.D.bh[d]; });
    var out = S.bhGenerate(c, dates), writes = [];
    Object.keys(out).forEach(function (d) {
      var set = {}; out[d].staff.forEach(function (id) { set[id] = true; });
      writes.push(B.set(st.RS + '/bh/' + d, { staff: set, ts: Date.now(), by: nameOf(st.me) }));
    });
    Promise.all(writes).then(function () {
      auditLine('Bank holiday rota filled for ' + writes.length + ' day' + (writes.length === 1 ? '' : 's'));
      toast(writes.length ? 'Rota filled for ' + writes.length + ' bank holiday' + (writes.length === 1 ? '' : 's') : 'Nothing to fill');
    }).catch(function () { toast('That did not save.'); });
  }
  function saveBH(d) {
    var boxes = document.querySelectorAll('input[data-bh-date="' + d + '"]'), set = {};
    Array.prototype.forEach.call(boxes, function (b) { if (b.checked) set[b.value] = true; });
    var count = Object.keys(set).length, want = ctx().config.bhStaff;
    var write = count ? B.set(st.RS + '/bh/' + d, { staff: set, ts: Date.now(), by: nameOf(st.me) }) : B.remove(st.RS + '/bh/' + d);
    write.then(function () {
      auditLine('Bank holiday ' + d + ': ' + Object.keys(set).map(nameOf).join(', '));
      toast(count === want ? 'Saved' : 'Saved, ' + count + ' of ' + want + ' chosen');
    }).catch(function () { toast('That did not save.'); });
  }

  /* ---------- tabs and the signed-in state ---------- */
  function paintTabs() {
    var mgr = isMgr();
    var tabs = [['calendar', 'Calendar', true], ['requests', 'Requests', true], ['bh', 'Bank holidays', mgr], ['staff', 'Staffing', mgr], ['settings', 'Settings', mgr]];
    $('tabs').innerHTML = tabs.filter(function (t) { return t[2]; }).map(function (t) {
      return '<button type="button" class="' + (st.tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] +
        (t[0] === 'requests' ? ' <span class="tabn" id="tab-requests-n"></span>' : '') + '</button>';
    }).join('');
    ['calendar', 'requests', 'bh', 'staff', 'settings'].forEach(function (k) { $('p-' + k).hidden = st.tab !== k; });
    if ((st.tab === 'bh' || st.tab === 'staff' || st.tab === 'settings') && !mgr) st.tab = 'calendar';
  }
  function show(v) {
    ['signin', 'wrong', 'unlinked', 'loading'].forEach(function (x) { $('v-' + x).hidden = x !== v; });
    $('v-app').hidden = v !== 'app';
    $('btn-out').hidden = !st.user;
    $('who').textContent = st.user ? (st.me ? nameOf(st.me) : st.user.email) : '';
  }
  function render() {
    NOW = clock();
    if (st.auth === 'signedout') { show('signin'); return; }
    if (st.auth === 'wrongdomain') { $('wrong-email').textContent = st.user ? st.user.email : ''; show('wrong'); return; }
    if (st.auth === 'loading' || !st.D.lcfg) { show('loading'); return; }
    if (!Object.keys(teamCfg()).length) {
      $('loading-msg').textContent = 'The team list is not set up on this copy of the rota yet. Open lockup.html once, then come back.';
      show('loading'); return;
    }
    $('loading-msg').textContent = 'Loading the rota\u2026';
    if (!st.me) { $('unlinked-email').textContent = st.user ? st.user.email : ''; show('unlinked'); return; }
    show('app');
    $('hdr-sub').textContent = st.testMode ? 'Test copy, not live' : 'Hedin BMW Ruxley';
    $('testbar').hidden = !st.testMode;
    paintTabs();
    if (st.tab === 'calendar') paintCalendar();
    if (st.tab === 'requests') paintRequests();
    if (st.tab === 'bh' && isMgr()) paintBH();
    if (st.tab === 'staff' && isMgr()) paintStaff();
    if (st.tab === 'settings' && isMgr()) paintSettings();
    paintRequests();
    if (st.sheetOpen) previewForm();
  }
  var painting = null;
  function schedule() { if (!painting) painting = setTimeout(function () { painting = null; render(); }, 30); }

  /* ---------- roots and subscriptions ---------- */
  function subscribeRoots() {
    st.unsub.forEach(function (u) { if (typeof u === 'function') u(); });
    st.unsub = [];
    st.D = { lcfg: null, absences: {}, weeks: {}, status: {}, scfg: null, requests: {}, bh: {}, managers: {}, link: null, linkLoaded: false, admin: false };
    var on = function (path, cb) { st.unsub.push(B.watch(path, function (v) { cb(v); schedule(); })); };
    on(st.RL + '/config', function (v) { st.D.lcfg = v || {}; relink(); });
    on(st.RL + '/absences', function (v) { st.D.absences = v || {}; });
    on(st.RL + '/weeks', function (v) { st.D.weeks = v || {}; });
    on(st.RL + '/status', function (v) { st.D.status = v || {}; });
    if (!st.user) return;
    var uid = st.user.uid;
    on(st.RS + '/config', function (v) { st.D.scfg = v || {}; });
    on(st.RS + '/requests', function (v) { st.D.requests = v || {}; });
    on(st.RS + '/bh', function (v) { st.D.bh = v || {}; });
    on(st.RS + '/managers', function (v) { st.D.managers = v || {}; });
    on(st.RS + '/links/' + uid, function (v) { st.D.link = v || null; st.D.linkLoaded = true; relink(); });
    on('staff/' + uid, function (v) { st.D.admin = v === true; });
  }
  var linking = false;
  function relink() {
    if (!st.user || !st.D.lcfg) { st.me = null; return; }
    var linked = st.D.link || null;
    var fromEmail = personForEmail(st.user.email);
    st.me = linked || fromEmail || null;
    if (st.D.linkLoaded && !linked && fromEmail && !linking) {
      linking = true;
      B.set(st.RS + '/links/' + st.user.uid, fromEmail).catch(function (e) { console.error('link', e); }).then(function () { linking = false; });
    }
    schedule();
  }
  function setRoots(testMode) {
    st.testMode = testMode;
    var RL = testMode ? 'lockupTest' : 'lockup', RS = testMode ? 'shiftsTest' : 'shifts';
    if (RL === st.RL && RS === st.RS && st.rootsKey) return;
    st.RL = RL; st.RS = RS; st.rootsKey = RL + '|' + RS;
    subscribeRoots();
  }

  /* ---------- start ---------- */
  function okDomain(u) { return !!u && u.emailVerified && /^[a-z0-9._-]+@hedinautomotive\.co\.uk$/i.test(u.email || ''); }
  function start(backend) {
    B = backend;
    NOW = clock();
    fetch('https://www.gov.uk/bank-holidays.json').then(function (r) { return r.json(); }).then(function (j) {
      ((j['england-and-wales'] || {}).events || []).forEach(function (e) { HOL[e.date] = { label: e.title }; });
      schedule();
    }).catch(function () {});
    B.watch('lockup/config/testMode', function (v) { setRoots(v !== false); schedule(); });
    setRoots(true);
    B.onAuth(function (u) {
      st.user = u;
      st.me = null;
      if (!u) st.auth = 'signedout';
      else if (!okDomain(u)) st.auth = 'wrongdomain';
      else st.auth = 'ready';
      if (u && okDomain(u)) subscribeRoots();
      else { st.unsub.forEach(function (x) { if (typeof x === 'function') x(); }); st.unsub = []; st.D = { lcfg: null, absences: {}, weeks: {}, status: {}, scfg: null, requests: {}, bh: {}, managers: {}, link: null, linkLoaded: false, admin: false }; }
      schedule();
    });
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    setInterval(function () { var n = clock(); if (n.date !== NOW.date) { NOW = n; schedule(); } }, 60000);
    schedule();
  }

  /* test seam: the same rendering with a fake backend and fixtures */
  root.ShiftsApp = {
    start: start,
    _state: st,
    _render: render,
    _openForm: openForm,
    _openReview: openReview,
    _ctx: ctx,
    _setNow: function (d) { FIXED = d ? { date: d, dow: S.dowOf(d), mins: 720, week: R.isoWeek(d) } : null; NOW = clock(); }
  };
})(this);
