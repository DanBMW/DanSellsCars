/* lockup-rota.js - the shared lockup rota logic. Used by lockup.html (browser),
 * team-board.html (office TV, so ES5 only) and scripts/lockup-mail.js (Node,
 * the GitHub Action). Keep all three on this one file so the rota a phone
 * generates is the rota the email goes to.
 *
 * A week is picked once, then stored under lockup/weeks/<YYYY-Www>:
 *   - nobody is put on their day off;
 *   - fewest lockups so far goes first (counts from every stored week);
 *   - nobody does two nights running, and nobody twice in a week if avoidable;
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

  /* nights each person has been given in stored weeks before `week` */
  function counts(weeks, week) {
    var c = {};
    Object.keys(weeks || {}).forEach(function (k) {
      if (week && k >= week) return;
      var d = (weeks[k] && weeks[k].days) || {};
      DAYS.forEach(function (day) { if (d[day]) c[d[day]] = (c[d[day]] || 0) + 1; });
    });
    return c;
  }

  function generate(week, team, weeks, salt) {
    var ids = Object.keys(team || {}).filter(function (id) { return team[id] && team[id].active !== false; }).sort();
    var rnd = mulberry32(hashStr('lockup:' + week + (salt ? ':' + salt : '')));
    var order = ids.slice();
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
    var rank = {}; order.forEach(function (id, i) { rank[id] = i; });
    var c = counts(weeks, week), days = {}, used = {}, prev = null;
    DAYS.forEach(function (day) {
      var ok = ids.filter(function (id) { return team[id].off !== day; });
      var pick = function (list) {
        list.sort(function (a, b) { return ((c[a] || 0) - (c[b] || 0)) || (rank[a] - rank[b]); });
        return list[0] || null;
      };
      var p = pick(ok.filter(function (id) { return !used[id] && id !== prev; })) ||
              pick(ok.filter(function (id) { return id !== prev; })) || pick(ok);
      days[day] = p;
      if (p) { used[p] = true; c[p] = (c[p] || 0) + 1; }
      prev = p;
    });
    return { days: days, generatedAt: Date.now(), seed: 'lockup:' + week + (salt ? ':' + salt : '') };
  }

  /* who is on for a date: { kind: 'staff'|'managers'|'closed', ids: [...] } */
  function onFor(dateStr, weekRec, holidays) {
    var dow = london(new Date(dateStr + 'T12:00:00Z')).dow;
    if (dow === 'sun' || (holidays && holidays[dateStr])) return { kind: 'closed', dow: dow };
    if (dow === 'sat') return { kind: 'managers', dow: dow };
    var id = weekRec && weekRec.days && weekRec.days[dow];
    return { kind: 'staff', dow: dow, id: id || null };
  }

  var api = { DAYS: DAYS, DAY_NAMES: DAY_NAMES, defaults: defaults, london: london, isoWeek: isoWeek, weekStart: weekStart,
    addDays: addDays, shiftWeek: shiftWeek, dateFor: dateFor, counts: counts, generate: generate, onFor: onFor,
    REMIND_MINS: 17 * 60, REMIND_SAT_MINS: 16 * 60, ESCALATE_MINS: 18 * 60 + 30 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LockupRota = api;
})(this);
