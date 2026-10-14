/* lockup-rota.js - the shared lockup rota logic. Used by lockup.html (browser),
 * team-board.html (office TV, so ES5 only) and scripts/lockup-mail.js (Node,
 * the GitHub Action). Keep all three on this one file so the rota a phone
 * generates is the rota the email goes to.
 *
 * A week is picked once, then stored under lockup/weeks/<YYYY-Www>:
 *   - nobody is put on their day off;
 *   - fewest lockups so far goes first (counts from every stored week);
 *   - two people a night, nobody two nights running where avoidable;
 *   - pairs vary: a pair that has already worked together is pushed back;
 *   - ties break by a shuffle seeded on the ISO week, so the same history
 *     always gives the same week.
 */
(function (root) {
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
  var DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  var TZ = 'Europe/London';

  var DEFAULT_TEAM = [
    ['tomi', 'Tomi', 'Tomi Adelaja', 'tomiwa.adelaja@hedinautomotive.co.uk', 'fri'],
    ['carl', 'Carl', 'Carl Hadwin', 'carl.hadwin@hedinautomotive.co.uk', 'tue'],
    ['danny', 'Danny', 'Danny Willis', 'danny.willis@hedinautomotive.co.uk', 'wed'],
    ['karis', 'Karis', 'Karis Johnson', 'karis.johnson@hedinautomotive.co.uk', 'wed'],
    ['dan', 'Dan', 'Daniel Cane', 'daniel.cane@hedinautomotive.co.uk', 'mon'],
    ['mon', 'Mon', 'Mon Singh', 'mon.singh@hedinautomotive.co.uk', 'thu'],
    ['clive', 'Clive', 'Clive Ankomah', 'clive.ankomah@hedinautomotive.co.uk', 'tue']
  ];
  var DEFAULT_MANAGERS = [
    ['nathan', 'Nathan', 'Nathan Jobson', 'nathan.jobson@hedinautomotive.co.uk', 'New Car Sales Manager'],
    ['will', 'Will', 'Will Potter', 'will.potter@hedinautomotive.co.uk', 'Used Car Sales Manager'],
    ['sergio', 'Sergio', 'Sergio Garaguso', 'sergio.garaguso@hedinautomotive.co.uk', 'Retail Manager']
  ];
  var DEFAULT_CHECKLIST = [
    ['doors', 'Showroom doors secured'],
    ['windows', 'Upstairs windows closed'],
    ['chargers', 'Chargers reset on showroom cars'],
    ['used', 'Used cars locked'],
    ['front', 'Front cars locked'],
    ['bollards', 'Bollards pulled up']
  ];

  function defaults() {
    var team = {}, managers = {}, checklist = {};
    DEFAULT_TEAM.forEach(function (t, i) { team[t[0]] = { name: t[1], fullName: t[2], email: t[3], off: t[4], active: true, order: i }; });
    DEFAULT_MANAGERS.forEach(function (t, i) { managers[t[0]] = { name: t[1], fullName: t[2], email: t[3], role: t[4], order: i }; });
    DEFAULT_CHECKLIST.forEach(function (t, i) { checklist[t[0]] = { label: t[1], order: i, active: true, builtin: true }; });
    return { team: team, managers: managers, checklist: checklist };
  }

  /* the date, weekday and minutes past midnight in the UK, whatever the device clock zone */
  function london(d) {
    d = d || new Date();
    var p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    var date = p.year + '-' + p.month + '-' + p.day;
    return { date: date, dow: p.weekday.toLowerCase().slice(0, 3), mins: (+p.hour) * 60 + (+p.minute), week: isoWeek(date) };
  }

  function isoWeek(dateStr) {
    var a = dateStr.split('-'), d = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2]));
    var day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var y = d.getUTCFullYear(), start = new Date(Date.UTC(y, 0, 1));
    var wk = Math.ceil(((d - start) / 86400000 + 1) / 7);
    return y + '-W' + (wk < 10 ? '0' : '') + wk;
  }
  /* Monday of an ISO week, as YYYY-MM-DD */
  function weekStart(week) {
    var y = +week.slice(0, 4), w = +week.slice(6);
    var jan4 = new Date(Date.UTC(y, 0, 4)), day = jan4.getUTCDay() || 7;
    var mon = new Date(jan4.getTime() + ((1 - day) + (w - 1) * 7) * 86400000);
    return mon.toISOString().slice(0, 10);
  }
  function addDays(dateStr, n) {
    var a = dateStr.split('-'), d = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2]) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  function shiftWeek(week, n) { return isoWeek(addDays(weekStart(week), 7 * n + 3)); }
  function dateFor(week, dow) { return addDays(weekStart(week), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(dow)); }

  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* a stored night as a list of ids: weeks before pairs held one string */
  function ids(v) {
    if (!v) return [];
    if (typeof v === 'string') return [v];
    return Object.keys(v).sort().map(function (k) { return v[k]; }).filter(Boolean);
  }
  function isPaired(weekRec) {
    if (!weekRec || !weekRec.days) return false;
    return weekRec.v === 2 && DAYS.every(function (d) { return typeof weekRec.days[d] !== 'string'; });
  }

  /* nights each person has been given in stored weeks before `week` */
  function counts(weeks, week) {
    var c = {};
    Object.keys(weeks || {}).forEach(function (k) {
      if (week && k >= week) return;
      var d = (weeks[k] && weeks[k].days) || {};
      DAYS.forEach(function (day) { ids(d[day]).forEach(function (id) { c[id] = (c[id] || 0) + 1; }); });
    });
    return c;
  }
  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  /* how often each pair has worked together */
  function pairCounts(weeks, week) {
    var p = {};
    Object.keys(weeks || {}).forEach(function (k) {
      if (week && k >= week) return;
      var d = (weeks[k] && weeks[k].days) || {};
      DAYS.forEach(function (day) { var x = ids(d[day]); if (x.length > 1) { var q = pairKey(x[0], x[1]); p[q] = (p[q] || 0) + 1; } });
    });
    return p;
  }

  /* two people a night, Mon to Fri. Lowest score wins each slot:
     nights already this week (x100, keeps everyone at 1 or 2), nights in
     earlier weeks (x10, balances totals), +30 if they worked last night,
     +20 per time this pair has already worked together; ties break on the
     shuffle seeded by the ISO week (plus a salt when a manager reshuffles). */
  function generate(week, team, weeks, salt, perNight) {
    perNight = perNight || 2;
    var all = Object.keys(team || {}).filter(function (id) { return team[id] && team[id].active !== false; }).sort();
    var rnd = mulberry32(hashStr('lockup:' + week + (salt ? ':' + salt : '')));
    var order = all.slice();
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
    var rank = {}; order.forEach(function (id, i) { rank[id] = i; });
    var c = counts(weeks, week), pc = pairCounts(weeks, week), days = {}, prev = [], wk = {};
    DAYS.forEach(function (day) {
      var ok = all.filter(function (id) { return team[id].off !== day; }), picked = [];
      for (var n = 0; n < perNight; n++) {
        var best = null, bs = 1e9;
        ok.forEach(function (id) {
          if (picked.indexOf(id) >= 0) return;
          var s = (wk[id] || 0) * 100 + (c[id] || 0) * 10 + (prev.indexOf(id) >= 0 ? 30 : 0) +
                  (picked.length ? (pc[pairKey(picked[0], id)] || 0) * 20 : 0) + rank[id] / 100;
          if (s < bs) { bs = s; best = id; }
        });
        if (best) { picked.push(best); wk[best] = (wk[best] || 0) + 1; c[best] = (c[best] || 0) + 1; }
      }
      if (picked.length > 1) { var q = pairKey(picked[0], picked[1]); pc[q] = (pc[q] || 0) + 1; }
      days[day] = picked;
      prev = picked;
    });
    return { days: days, v: 2, generatedAt: Date.now(), seed: 'lockup:' + week + (salt ? ':' + salt : '') };
  }

  /* ---- absences: "I won't be in", holidays, and seeded ones ----
     lockup/absences/<id>: {personId, from, to, kind: absent|holiday, status: booked|approved|cancelled}
     Seeded entries are written once by whichever client first sees them missing,
     so a change agreed before the rules went live still lands. */
  var SEED_ABSENCES = {
    seed_carl_20261016: { personId: 'carl', from: '2026-10-16', to: '2026-10-16', kind: 'absent', status: 'approved', by: 'Dan', note: 'Carl off Friday 16 Oct (Dan, 14 Oct)' }
  };
  function absentOn(absences, date) {
    var out = {};
    Object.keys(absences || {}).forEach(function (k) {
      var a = absences[k];
      if (a && a.status !== 'cancelled' && a.from <= date && date <= a.to) out[a.personId] = a.kind || 'absent';
    });
    return out;
  }
  function pairOn(weeks, date) {
    var w = weeks && weeks[isoWeek(date)], dow = london(new Date(date + 'T12:00:00Z')).dow;
    return ids(w && w.days && w.days[dow]);
  }
  /* fewest nights first, never on a day off, never absent, never someone
     already on that night; anyone working the night before or after is
     only used when nobody else can do it */
  function replacement(weeks, team, absences, date, pair) {
    var dow = london(new Date(date + 'T12:00:00Z')).dow;
    var near = [];
    if (dow !== 'mon') near = near.concat(pairOn(weeks, addDays(date, -1)));
    if (dow !== 'fri') near = near.concat(pairOn(weeks, addDays(date, 1)));
    /* nights up to and including this week, so a later week doesn't skew it */
    var c = counts(weeks, shiftWeek(isoWeek(date), 1)), away = absentOn(absences, date);
    var cands = Object.keys(team || {}).filter(function (id) {
      var t = team[id];
      return t && t.active !== false && t.off !== dow && !away[id] && pair.indexOf(id) < 0;
    });
    cands.sort(function (a, b) {
      return ((near.indexOf(a) >= 0) - (near.indexOf(b) >= 0)) || ((c[a] || 0) - (c[b] || 0)) || (a < b ? -1 : 1);
    });
    return cands[0] || null;
  }
  /* replaces absent people on today's and later unsigned nights. Mutates
     `weeks`, returns [{week, dow, date, out, in, pair}] for what changed */
  function applyAbsences(weeks, team, absences, today, signed) {
    var changes = [];
    Object.keys(weeks || {}).sort().forEach(function (wk) {
      if (wk < isoWeek(today) || !weeks[wk] || !weeks[wk].days) return;
      DAYS.forEach(function (dow) {
        var date = dateFor(wk, dow);
        if (date < today || (signed && signed[date])) return;
        var away = absentOn(absences, date), pair = ids(weeks[wk].days[dow]), changed = false;
        pair.slice().forEach(function (p) {
          if (!away[p]) return;
          var rest = pair.filter(function (x) { return x !== p; });
          var r = replacement(weeks, team, absences, date, rest.concat([p]));
          pair = r ? pair.map(function (x) { return x === p ? r : x; }) : rest;
          weeks[wk].days[dow] = pair; changed = true;
          changes.push({ week: wk, dow: dow, date: date, out: p, 'in': r, pair: pair.slice() });
        });
        if (changed) weeks[wk].days[dow] = pair;
      });
    });
    return changes;
  }

  /* who is on for a date: { kind: 'staff'|'managers'|'closed', ids: [...] } */
  function onFor(dateStr, weekRec, holidays) {
    var dow = london(new Date(dateStr + 'T12:00:00Z')).dow;
    if (dow === 'sun' || (holidays && holidays[dateStr])) return { kind: 'closed', dow: dow };
    if (dow === 'sat') return { kind: 'managers', dow: dow };
    var list = ids(weekRec && weekRec.days && weekRec.days[dow]);
    return { kind: 'staff', dow: dow, ids: list, id: list[0] || null };
  }

  var api = { DAYS: DAYS, DAY_NAMES: DAY_NAMES, defaults: defaults, london: london, isoWeek: isoWeek, weekStart: weekStart,
    addDays: addDays, shiftWeek: shiftWeek, dateFor: dateFor, counts: counts, pairCounts: pairCounts, ids: ids, isPaired: isPaired, generate: generate, onFor: onFor, SEED_ABSENCES: SEED_ABSENCES, absentOn: absentOn, pairOn: pairOn, replacement: replacement, applyAbsences: applyAbsences,
    REMIND_MINS: 17 * 60, NUDGE_MINS: 18 * 60 + 5, NUDGE_SAT_MINS: 17 * 60 + 5, ESCALATE_SAT_MINS: 17 * 60 + 30,
    /* Saturday closes at 5pm: reminder 4pm, nudge 5:05pm, managers 5:30pm */
    remindAt: function (dow) { return dow === 'sat' ? 16 * 60 : 17 * 60; },
    nudgeAt: function (dow) { return dow === 'sat' ? 17 * 60 + 5 : 18 * 60 + 5; },
    escalateAt: function (dow) { return dow === 'sat' ? 17 * 60 + 30 : 18 * 60 + 30; }, REMIND_SAT_MINS: 16 * 60, ESCALATE_MINS: 18 * 60 + 30 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LockupRota = api;
})(this);
