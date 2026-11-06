/* reception-rota.js - who covers the showroom (reception desk or the desk by the
 * halo) each shift. Pure functions, so the scheduled job (scripts/reception-mail.js),
 * the browser page (reception.html) and scripts/test-reception.js run the same rules.
 *
 * Rules (Dan):
 *   - sales executives only, so the handover team (Chloe and Molly) are never
 *     put on reception; anyone off, on holiday or away is left out, using the
 *     shift calendar's own availability (ShiftRota.staffOn);
 *   - three shifts across the day, one person on each;
 *   - fair: people with fewest recent reception shifts first, then people who
 *     have not already covered a shift today, so one person does not get the
 *     whole day when someone else is free;
 *   - a person who says they cannot cover is taken off that shift and the next
 *     fair person is put on, with the reason going to the managers.
 *
 * Shift hours are a guess until Dan confirms them: see SHIFTS below.
 */
(function (root) {
  'use strict';

  /* three shifts a day. Times are local (UK). Dan to confirm. */
  var SHIFTS = {
    weekday: [
      { id: 'am', from: '09:00', to: '12:00' },
      { id: 'mid', from: '12:00', to: '15:00' },
      { id: 'pm', from: '15:00', to: '18:00' }
    ],
    sat: [
      { id: 'am', from: '09:00', to: '12:00' },
      { id: 'mid', from: '12:00', to: '14:00' },
      { id: 'pm', from: '14:00', to: '17:00' }
    ]
  };
  var REASONS = {
    cannot: 'I cannot cover right now',
    notin: 'I am not in today',
    offsite: 'I am off site',
    customer: "I'm with a customer now, cannot cover",
    other: 'Other'
  };
  /* why a cover segment is on the history record */
  var COVER_REASONS = {
    planned: 'planned',
    took_over: 'took over',
    reallocated: 'reallocated',
    handed_back: 'handed back'
  };
  var NEVER = ['chloe', 'molly']; /* handover team, not sales executives */
  /* appointments: the booking feed gives a start time only, so each one is taken as this long */
  var APPT_MINS = 120;
  /* the feed's first names to team ids */
  var APPT_NAMES = { Carl: 'carl', Clive: 'clive', Daniel: 'dan', Danny: 'danny', Mon: 'mon', Tomiwa: 'tomi', Karis: 'karis' };

  function shiftsFor(dow) {
    /* dow: 1 Monday .. 6 Saturday, 0 Sunday (closed, no shifts) */
    if (dow === 0) return [];
    return dow === 6 ? SHIFTS.sat : SHIFTS.weekday;
  }

  /* the pool for a day: available sales people, minus the handover team and
     anyone the config excludes, in team order */
  function poolFor(available, team, exclude) {
    var skip = (exclude || []).concat(NEVER);
    return (available || []).filter(function (id) { return skip.indexOf(id) < 0; })
      .sort(function (a, b) {
        var ta = (team && team[a]) || {}, tb = (team && team[b]) || {};
        return ((ta.order || 0) - (tb.order || 0)) || (a < b ? -1 : 1);
      });
  }

  /* plan one day.
     opts = { shifts, available, team, exclude, history, declined, existing }
       shifts    the day's shifts (shiftsFor)
       available ids on the sales team that day (ShiftRota.staffOn)
       history   { id: reception shifts in the last 30 days }
       declined  { shiftId: [ids who said they cannot cover that shift] }
       existing  { shiftId: id } already put on and still standing; these are kept
     returns { assignments: { shiftId: id|null }, short: [shiftId] } */
  function planDay(opts) {
    var shifts = opts.shifts || [], pool = poolFor(opts.available, opts.team, opts.exclude);
    var hist = opts.history || {}, declined = opts.declined || {}, existing = opts.existing || {}, busy = opts.busy || {};
    var out = {}, short = [], today = {};
    /* keep standing assignments as they are */
    shifts.forEach(function (s) { if (existing[s.id] && pool.indexOf(existing[s.id]) >= 0) { out[s.id] = existing[s.id]; today[existing[s.id]] = (today[existing[s.id]] || 0) + 1; } });
    shifts.forEach(function (s) {
      if (out[s.id]) return;
      var no = declined[s.id] || [];
      var free = function (id) { return no.indexOf(id) < 0 && !clashes(busy, id, s); };
      var cand = pool.filter(function (id) { return free(id) && Object.keys(out).every(function (k) { return out[k] !== id; }); });
      /* no double shifts: someone already on today is never put on a second one. If nobody new is free the shift is short. */
      if (!cand.length) { out[s.id] = null; short.push(s.id); return; }
      cand.sort(function (a, b) {
        return ((today[a] || 0) - (today[b] || 0)) || ((hist[a] || 0) - (hist[b] || 0)) || (pool.indexOf(a) - pool.indexOf(b));
      });
      out[s.id] = cand[0];
      today[cand[0]] = (today[cand[0]] || 0) + 1;
    });
    return { assignments: out, short: short };
  }

  /* what a covering person can answer, and what it does to the day */
  function answer(kind, reason) {
    if (kind === 'covering') return { status: 'covering', reassign: false };
    if (!REASONS[kind]) return null;
    var r = String(reason || '').trim(); /* the words are kept for every reason, not only Other */
    if (kind === 'other' && !r) return null; /* a reason is needed for Other */
    return { status: 'declined', reassign: true, reason: REASONS[kind], reasonText: r.slice(0, 500) };
  }

  /* deep link into reception.html for one shift action (covering / cannot / here / away) */
  var SITE = 'https://dan-sells.co.uk/reception.html';
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function coverPageUrl(opts) {
    opts = opts || {};
    var q = [];
    if (TEST_ONLY || opts.test) q.push('test=1');
    if (opts.date) q.push('date=' + encodeURIComponent(opts.date));
    if (opts.shift) q.push('shift=' + encodeURIComponent(opts.shift));
    if (opts.action) q.push('action=' + encodeURIComponent(opts.action));
    return SITE + (q.length ? '?' + q.join('&') : '');
  }
  function mailBtn(href, label, kind) {
    var base = 'display:block;text-align:center;text-decoration:none;font-weight:800;padding:14px;border-radius:12px;font-size:17px;';
    var style = kind === 'danger'
      ? base + 'background:#fff;color:#c0392b;border:2px solid #c0392b;margin-top:10px'
      : base + 'background:#4d94d8;color:#fff;border:0';
    return '<a href="' + escHtml(href) + '" style="' + style + '">' + escHtml(label) + '</a>';
  }

  /* the wording of the cover email, as Dan asked: "you are on showroom cover,
     please cover showroom until ##:##". opts.date makes the tap links open that day. */
  function coverEmail(name, shift, opts) {
    opts = opts || {};
    var covering = coverPageUrl({ date: opts.date, shift: shift.id, action: 'covering' });
    var cannot = coverPageUrl({ date: opts.date, shift: shift.id, action: 'cannot' });
    var open = coverPageUrl({ date: opts.date, shift: shift.id });
    var subject = 'Showroom cover ' + shift.from + ' to ' + shift.to;
    var text = 'Hi ' + name + ',\n\nYou are on showroom cover. Please cover showroom until ' + shift.to + '.\n\n' +
      'I am covering:\n' + covering + '\n\n' +
      'I cannot cover:\n' + cannot + '\n\n' +
      'Open showroom cover:\n' + open;
    var html = '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#12263a">' +
      '<div style="background:#0b1220;color:#fff;border-radius:14px 14px 0 0;padding:18px 20px;font-size:18px;font-weight:800">Showroom cover ' + escHtml(shift.from) + ' to ' + escHtml(shift.to) + '</div>' +
      '<div style="border:1px solid #d9e3ee;border-top:0;border-radius:0 0 14px 14px;padding:20px">' +
      '<p style="margin:0 0 12px">Hi ' + escHtml(name) + ',</p>' +
      '<p style="margin:0 0 16px">You are on showroom cover. Please cover showroom until ' + escHtml(shift.to) + '.</p>' +
      mailBtn(covering, 'I am covering', 'primary') +
      mailBtn(cannot, 'I cannot cover', 'danger') +
      '<p style="color:#6b7a8c;font-size:12px;margin:16px 0 0">Hedin BMW Ruxley showroom cover</p></div></div>';
    return { subject: subject, text: text, html: html, coveringUrl: covering, cannotUrl: cannot };
  }

  /* "where are you" nudge: tap I am here, or say you cannot be in */
  function absentEmail(name, shift, opts) {
    opts = opts || {};
    var here = coverPageUrl({ date: opts.date, shift: shift.id, action: 'here' });
    var away = coverPageUrl({ date: opts.date, shift: shift.id, action: 'away' });
    var line = 'Hi ' + name + ', you are not in the showroom. You are on showroom cover ' + shift.from + ' to ' + shift.to + '.';
    var text = line + '\n\nI am here:\n' + here + '\n\nI cannot be in:\n' + away;
    var html = '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#12263a">' +
      '<div style="background:#0b1220;color:#fff;border-radius:14px 14px 0 0;padding:18px 20px;font-size:18px;font-weight:800">Where are you? &#128064;</div>' +
      '<div style="border:1px solid #d9e3ee;border-top:0;border-radius:0 0 14px 14px;padding:20px">' +
      '<p style="margin:0 0 16px">' + escHtml(line) + '</p>' +
      mailBtn(here, 'I am here', 'primary') +
      mailBtn(away, 'I cannot be in', 'danger') +
      '<p style="color:#6b7a8c;font-size:12px;margin:16px 0 0">Hedin BMW Ruxley showroom cover</p></div></div>';
    return { subject: 'Where are you? \ud83d\udc40', text: text, html: html, hereUrl: here, awayUrl: away };
  }

  /* the email to managers when someone cannot cover */
  /* the email to managers when a shift has nobody free: the names they can choose from, and why the others are not */
  function shortNote(shift, free, onOther, booked, names) {
    var nm = function (id) { return (names || {})[id] || id; };
    var lines = [];
    lines.push('Nobody free is left for showroom cover ' + shift.from + ' to ' + shift.to + '. Please choose someone.');
    lines.push('');
    lines.push('Free and not on a shift yet: ' + (free.length ? free.map(nm).join(', ') : 'nobody'));
    lines.push('Free but already on another shift today: ' + (onOther.length ? onOther.map(nm).join(', ') : 'nobody'));
    lines.push('With an appointment over this shift: ' + (booked.length ? booked.map(nm).join(', ') : 'nobody'));
    lines.push('');
    lines.push('Assign on reception.html (managers, Assign under the shift).');
    return { subject: 'Showroom not covered ' + shift.from + ' to ' + shift.to + ': please choose', text: lines.join('\n') };
  }

  function managerNote(name, shift, reason, reasonText) {
    return {
      subject: name + ' cannot cover the showroom ' + shift.from + ' to ' + shift.to,
      text: name + ' said: ' + reason + (reasonText ? ': ' + reasonText : '') + '. The next person has been put on.'
    };
  }

  function minsOf(t) { return +String(t).slice(0, 2) * 60 + +String(t).slice(3, 5); }
  function hmOf(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

  /* one day of the booking feed ({ busy: [{ name, times: ['HH:MM'] }] }) as busy intervals per team id.
     Returns { busy, unknown } where unknown lists feed names with no team id. */
  function busyIntervals(day) {
    var busy = {}, unknown = [];
    ((day && day.busy) || []).forEach(function (b) {
      var id = APPT_NAMES[b.name];
      if (!id) { unknown.push(b.name); return; }
      busy[id] = (busy[id] || []).concat((b.times || []).map(function (t) {
        var from = minsOf(t);
        return { from: hmOf(from), to: hmOf(from + APPT_MINS) };
      }));
    });
    return { busy: busy, unknown: unknown };
  }

  /* does this person have an appointment during this shift */
  function clashes(busy, id, shift) {
    var list = (busy || {})[id] || [];
    return list.some(function (a) { return minsOf(a.from) < minsOf(shift.to) && minsOf(a.to) > minsOf(shift.from); });
  }

  /* bank the time someone DID cover before they handed a shift back.
     opts = { nowMins, confirmMins }. confirmMins is when they tapped "I am covering" (UK clock mins);
     if they never confirmed, credit runs from the shift start once the shift has begun.
     Returns { from, to, minutes } or null when nothing to bank (e.g. they declined before the shift). */
  function bankCover(shift, opts) {
    opts = opts || {};
    if (!shift || opts.nowMins == null) return null;
    var fromM = minsOf(shift.from), toM = minsOf(shift.to), now = opts.nowMins;
    var start;
    if (opts.confirmMins != null) start = Math.max(fromM, opts.confirmMins);
    else {
      if (now <= fromM) return null;
      start = fromM;
    }
    var end = Math.min(now, toM);
    if (end <= start) return null;
    return { from: hmOf(start), to: hmOf(end), minutes: end - start };
  }

  /* remaining slot after a hand-back or take-over, from now (or shift start) to the shift end */
  function remainCover(shift, nowMins) {
    if (!shift || nowMins == null) return null;
    var fromM = minsOf(shift.from), toM = minsOf(shift.to);
    var start = Math.max(fromM, nowMins);
    if (start >= toM) return null;
    return { from: hmOf(start), to: shift.to, minutes: toM - start };
  }

  /* management's totals from the log.
     Entries: { kind: on|skip|absent|cover, personId, date, shift, from, to, reason? }.
     A planned/reallocated/took_over "on" counts unless skipped or tagged absent.
     A "cover" (handed_back partial) always adds its minutes on top, so a mid-shift
     decline still credits the time they did. Returns one row per person, most time first. */
  function stats(log, team, from, to) {
    var rows = {}, void_ = {};
    function row(id) { return rows[id] || (rows[id] = { id: id, name: ((team || {})[id] || {}).name || id, shifts: 0, minutes: 0, skips: 0, absent: 0, handed: 0 }); }
    var entries = Object.keys(log || {}).map(function (k) { return log[k]; }).filter(function (e) { return e && e.personId && e.date >= from && e.date <= to; });
    entries.forEach(function (e) { if (e.kind === 'skip' || e.kind === 'absent') void_[e.personId + '|' + e.date + '|' + e.shift] = true; });
    entries.forEach(function (e) {
      if (e.kind === 'skip') row(e.personId).skips++;
      else if (e.kind === 'absent') row(e.personId).absent++;
      else if (e.kind === 'cover') {
        var r = row(e.personId);
        var m = e.minutes != null ? e.minutes : Math.max(0, minsOf(e.to) - minsOf(e.from));
        r.minutes += m;
        if (e.reason === 'handed_back') r.handed += m;
        else { r.shifts++; }
      } else if (e.kind === 'on' && !void_[e.personId + '|' + e.date + '|' + e.shift]) {
        var r2 = row(e.personId); r2.shifts++; r2.minutes += Math.max(0, minsOf(e.to) - minsOf(e.from));
      }
    });
    Object.keys(team || {}).forEach(function (id) { if ((team[id] || {}).active !== false && NEVER.indexOf(id) < 0) row(id); });
    return Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return (b.minutes - a.minutes) || (a.name < b.name ? -1 : 1); });
  }

  /* durable cover history for managers: every on/cover segment in the date window, newest first */
  function historyRows(log, team, from, to) {
    var out = [];
    Object.keys(log || {}).forEach(function (k) {
      var e = log[k];
      if (!e || !e.personId || e.date < from || e.date > to) return;
      if (e.kind !== 'on' && e.kind !== 'cover') return;
      var reason = e.reason || (e.kind === 'cover' ? 'handed_back' : 'planned');
      var mins = e.minutes != null ? e.minutes : Math.max(0, minsOf(e.to) - minsOf(e.from));
      out.push({
        key: k, personId: e.personId, name: ((team || {})[e.personId] || {}).name || e.personId,
        date: e.date, shift: e.shift, from: e.from, to: e.to, minutes: mins,
        reason: reason, reasonLabel: COVER_REASONS[reason] || reason, ts: e.ts || 0,
        replacedPersonId: e.replacedPersonId || ''
      });
    });
    return out.sort(function (a, b) { return (b.date < a.date ? -1 : b.date > a.date ? 1 : 0) || (b.ts - a.ts); });
  }

  /* normalise a person name for matching walk-in / booking feed names to team ids */
  function normName(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /* Match an office-alerts / walk-in taker name to a team id.
     Prefers fullName, then short name, then APPT_NAMES first-name map, then a unique first name. */
  function matchPersonByName(name, team) {
    var n = normName(name);
    if (!n) return null;
    var ids = Object.keys(team || {});
    var i, p, full, short, exact = null, firstHits = [];
    var first = n.split(' ')[0];
    for (i = 0; i < ids.length; i++) {
      p = team[ids[i]] || {};
      full = normName(p.fullName);
      short = normName(p.name);
      if (full && full === n) return ids[i];
      if (short && short === n) exact = exact || ids[i];
      if (full && (full === first || full.indexOf(first + ' ') === 0)) firstHits.push(ids[i]);
      else if (short && short === first) firstHits.push(ids[i]);
    }
    if (exact) return exact;
    var rawFirst = String(name || '').trim().split(/\s+/)[0];
    if (rawFirst && APPT_NAMES[rawFirst]) return APPT_NAMES[rawFirst];
    if (firstHits.length === 1) return firstHits[0];
    return null;
  }

  /* The shift whose window contains nowMins, or null outside every window (heads-up does not count). */
  function activeShiftAt(shifts, nowMins) {
    var i, s;
    for (i = 0; i < (shifts || []).length; i++) {
      s = shifts[i];
      if (nowMins >= minsOf(s.from) && nowMins < minsOf(s.to)) return s;
    }
    return null;
  }

  /* When a walk-in-taken alert names the person currently on the active cover shift,
     return the same reallocate payload the managers' "unable" button writes. Otherwise null.
     opts = { alertId, kind, assignedTo, customer, team, shifts, nowMins, day, handled, ts } */
  function walkinCoverReallocate(opts) {
    opts = opts || {};
    var alertId = String(opts.alertId || '');
    if (alertId && opts.handled && opts.handled[alertId]) return null;
    var kind = String(opts.kind || '').toLowerCase().replace(/[\s_]+/g, '-');
    if (kind !== 'walk-in-taken' && kind !== 'walkin-taken'
        && kind !== 'walkin-arrived-taken' && kind !== 'walk-in-arrived-taken'
        && kind !== 'walkin-waiting-taken' && kind !== 'walk-in-waiting-taken') return null;
    var shift = activeShiftAt(opts.shifts, opts.nowMins);
    if (!shift) return null;
    var rec = (opts.day || {})[shift.id] || {};
    if (!rec.personId || rec.status === 'declined' || rec.status === 'short' || rec.status === 'open') return null;
    /* a reallocate already queued and not yet handled: do not stack another */
    if (rec.reallocate && rec.reallocate.ts !== rec.reallocateHandledTs) return null;
    var pid = matchPersonByName(opts.assignedTo, opts.team);
    if (!pid || pid !== rec.personId) return null;
    var cust = String(opts.customer || '').trim().slice(0, 80);
    return {
      shiftId: shift.id,
      personId: pid,
      alertId: alertId,
      reallocate: {
        personId: pid,
        text: cust ? ('Took a walk-in (' + cust + ')') : 'Took a walk-in',
        by: 'walkin',
        ts: opts.ts || Date.now(),
        alertId: alertId
      }
    };
  }

  /* email when someone takes (or is given) a shift that already had a person */
  function takenEmail(name, takerName, shift, opts) {
    opts = opts || {};
    var open = coverPageUrl({ date: opts.date, shift: shift.id });
    var subject = 'Showroom cover taken ' + shift.from + ' to ' + shift.to;
    var text = 'Hi ' + name + ',\n\n' + takerName + ' has taken your showroom cover ' + shift.from + ' to ' + shift.to + '. You are no longer on that shift.\n\nOpen showroom cover:\n' + open;
    var html = '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#12263a">' +
      '<div style="background:#0b1220;color:#fff;border-radius:14px 14px 0 0;padding:18px 20px;font-size:18px;font-weight:800">Showroom cover taken</div>' +
      '<div style="border:1px solid #d9e3ee;border-top:0;border-radius:0 0 14px 14px;padding:20px">' +
      '<p style="margin:0 0 12px">Hi ' + escHtml(name) + ',</p>' +
      '<p style="margin:0 0 16px">' + escHtml(takerName) + ' has taken your showroom cover ' + escHtml(shift.from) + ' to ' + escHtml(shift.to) + '. You are no longer on that shift.</p>' +
      mailBtn(open, 'Open showroom cover', 'primary') +
      '<p style="color:#6b7a8c;font-size:12px;margin:16px 0 0">Hedin BMW Ruxley showroom cover</p></div></div>';
    return { subject: subject, text: text, html: html };
  }

  /* cover runs in the practice copy only, whatever the lockup's live switch says, and its emails go only to
     the two test addresses (Dan and Nathan). Change this to false only when Dan says it goes live. */
  var TEST_ONLY = false;
  /* one-off corrections to who is in on a day, on top of the shift calendar. Tomi has appointments on Friday 6
     November, his usual day off, so he is assumed in for that day. Remove the line once the rota itself is corrected. */
  var ONE_OFF_IN = { '2026-11-06': ['tomi'] };
var api = { shortNote: shortNote, TEST_ONLY: TEST_ONLY, ONE_OFF_IN: ONE_OFF_IN, RECEPTION_ROOT: TEST_ONLY ? 'lockupTest' : 'lockup', RECEPTION_LOG: TEST_ONLY ? 'receptionLogTest' : 'receptionLog', busyIntervals: busyIntervals, clashes: clashes, APPT_MINS: APPT_MINS, APPT_NAMES: APPT_NAMES, stats: stats, historyRows: historyRows, bankCover: bankCover, remainCover: remainCover, COVER_REASONS: COVER_REASONS, takenEmail: takenEmail, minsOf: minsOf, hmOf: hmOf, SHIFTS: SHIFTS, REASONS: REASONS, NEVER: NEVER, shiftsFor: shiftsFor, poolFor: poolFor, planDay: planDay, answer: answer, coverEmail: coverEmail, absentEmail: absentEmail, coverPageUrl: coverPageUrl, SITE: SITE, managerNote: managerNote, normName: normName, matchPersonByName: matchPersonByName, activeShiftAt: activeShiftAt, walkinCoverReallocate: walkinCoverReallocate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ReceptionRota = api;
})(this);
