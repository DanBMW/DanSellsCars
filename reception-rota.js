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
    other: 'Other'
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

  /* management's totals from the log. Entries: { kind: on|skip|absent, personId, date, shift, from, to }.
     A shift someone was put on counts for them unless they skipped it or were tagged absent for it.
     Returns one row per person on the team, most time first. */
  function stats(log, team, from, to) {
    var rows = {}, void_ = {};
    function row(id) { return rows[id] || (rows[id] = { id: id, name: ((team || {})[id] || {}).name || id, shifts: 0, minutes: 0, skips: 0, absent: 0 }); }
    var entries = Object.keys(log || {}).map(function (k) { return log[k]; }).filter(function (e) { return e && e.personId && e.date >= from && e.date <= to; });
    entries.forEach(function (e) { if (e.kind !== 'on') void_[e.personId + '|' + e.date + '|' + e.shift] = true; });
    entries.forEach(function (e) {
      if (e.kind === 'skip') row(e.personId).skips++;
      else if (e.kind === 'absent') row(e.personId).absent++;
      else if (e.kind === 'on' && !void_[e.personId + '|' + e.date + '|' + e.shift]) {
        var r = row(e.personId); r.shifts++; r.minutes += Math.max(0, minsOf(e.to) - minsOf(e.from));
      }
    });
    Object.keys(team || {}).forEach(function (id) { if ((team[id] || {}).active !== false && NEVER.indexOf(id) < 0) row(id); });
    return Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return (b.minutes - a.minutes) || (a.name < b.name ? -1 : 1); });
  }

  /* cover runs in the practice copy only, whatever the lockup's live switch says, and its emails go only to
     the two test addresses (Dan and Nathan). Change this to false only when Dan says it goes live. */
  var TEST_ONLY = true;
  var api = { TEST_ONLY: TEST_ONLY, RECEPTION_ROOT: TEST_ONLY ? 'lockupTest' : 'lockup', RECEPTION_LOG: TEST_ONLY ? 'receptionLogTest' : 'receptionLog', busyIntervals: busyIntervals, clashes: clashes, APPT_MINS: APPT_MINS, APPT_NAMES: APPT_NAMES, stats: stats, minsOf: minsOf, SHIFTS: SHIFTS, REASONS: REASONS, NEVER: NEVER, shiftsFor: shiftsFor, poolFor: poolFor, planDay: planDay, answer: answer, coverEmail: coverEmail, absentEmail: absentEmail, coverPageUrl: coverPageUrl, SITE: SITE, managerNote: managerNote };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ReceptionRota = api;
})(this);
