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
    ['doors', 'Showroom front door secured', 'Front door'],
    ['sliding', 'Showroom sliding car doors secured', 'Sliding doors'], /* the big sliding doors cars drive through */
    ['windows', 'Upstairs windows closed', 'Windows'],
    ['chargers', 'Chargers reset on showroom cars', 'Chargers'],
    ['used', 'Used cars locked', 'Used cars'],
    ['front', 'Front cars locked', 'Front cars'],
    ['bollards', 'Bollards pulled up', 'Bollards']
  ];
  /* short name for the board strip: config `short`, else the code default,
     else the label cut to about 14 characters */
  function shortLabel(id, item) {
    if (item && item.short) return item.short;
    for (var i = 0; i < DEFAULT_CHECKLIST.length; i++) if (DEFAULT_CHECKLIST[i][0] === id) return DEFAULT_CHECKLIST[i][2];
    var l = String((item && item.label) || id).trim();
    return l.length > 14 ? l.slice(0, 13).replace(/\s+\S*$/, '') + '\u2026' : l;
  }

  function defaults() {
    var team = {}, managers = {}, checklist = {};
    DEFAULT_TEAM.forEach(function (t, i) { team[t[0]] = { name: t[1], fullName: t[2], email: t[3], off: t[4], active: true, order: i }; });
    DEFAULT_MANAGERS.forEach(function (t, i) { managers[t[0]] = { name: t[1], fullName: t[2], email: t[3], role: t[4], order: i }; });
    DEFAULT_CHECKLIST.forEach(function (t, i) { checklist[t[0]] = { label: t[1], short: t[2], order: i, active: true, builtin: true }; });
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
  /* a week is only ever made when it has no stored record at all. A stored
     week is never regenerated because counts, days off or absences changed:
     those only swap the affected slot (applyAbsences). A full reshuffle is
     the manager's "Shuffle" button and nothing else. */
  /* per person rota settings, all optional on lockup/config/team/<id>:
       off: 'tue'          weekly day off (never rostered)
       never: ['wed']      other days never rostered (e.g. a half day)
       fixed: ['mon']      nights they always do by default (a fixed pairing
                           when two people share the same fixed night)
       onlyFixed: true     only rostered on their fixed nights, unless nobody
                           else can cover (fallback replacement) */
  function arr(v) { if (!v) return []; if (typeof v === 'string') return [v]; if (v.length !== undefined) return Array.prototype.slice.call(v).filter(Boolean); return Object.keys(v).map(function (k) { return v[k]; }).filter(Boolean); }
  function canDo(t, dow) { return !!t && t.active !== false && t.off !== dow && arr(t.never).indexOf(dow) < 0; }
  function isFixedOn(t, dow) { return arr(t && t.fixed).indexOf(dow) >= 0; }
  /* free for any night, not just a fallback */
  function normalOn(t, dow) { return canDo(t, dow) && (!t.onlyFixed || isFixedOn(t, dow)); }
  function fixedFor(team, dow) { return Object.keys(team || {}).filter(function (id) { return canDo(team[id], dow) && isFixedOn(team[id], dow); }).sort(); }
  function needsWeek(weekRec) { return !weekRec || !weekRec.days; }
  function isPaired(weekRec) {
    if (!weekRec || !weekRec.days) return false;
    return DAYS.every(function (d) { return typeof weekRec.days[d] !== 'string'; });
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
  function nextTo(days, d, id) {
    var i = DAYS.indexOf(d);
    return (i > 0 && ids(days[DAYS[i - 1]]).indexOf(id) >= 0) || (i < DAYS.length - 1 && ids(days[DAYS[i + 1]]).indexOf(id) >= 0);
  }
  /* tries a few shuffles and keeps the first that meets every rule
     (nobody two nights running, everyone at least one night, everyone at
     their fair share); otherwise the one that breaks the fewest */
  function generate(week, team, weeks, salt, perNight) {
    var best = null, bs = 1e9;
    for (var t = 0; t < 40; t++) {
      var g = generateOnce(week, team, weeks, t ? (salt ? salt + ':' : '') + 'r' + t : salt, perNight);
      if (g.penalty < bs) { bs = g.penalty; best = g; }
      if (!g.penalty) break;
    }
    delete best.penalty;
    return best;
  }
  function generateOnce(week, team, weeks, salt, perNight) {
    perNight = perNight || 2;
    var all = Object.keys(team || {}).filter(function (id) { return team[id] && team[id].active !== false; }).sort();
    var rnd = mulberry32(hashStr('lockup:' + week + (salt ? ':' + salt : '')));
    var order = all.slice();
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
    var rank = {}; order.forEach(function (id, i) { rank[id] = i; });
    var c = counts(weeks, week), pc = pairCounts(weeks, week), days = {}, prev = [], wk = {};
    /* this week's share: 10 nights over the team, the extra nights going to
       whoever has done fewest so far, so totals stay within one of each other */
    var slots = perNight * DAYS.length, tgt = {};
    all.slice().sort(function (x, y) { return ((c[x] || 0) - (c[y] || 0)) || (rank[x] - rank[y]); })
      .forEach(function (id, i) { tgt[id] = Math.floor(slots / all.length) + (i < slots % all.length ? 1 : 0); });
    DAYS.forEach(function (day) {
      var picked = fixedFor(team, day).slice(0, perNight);
      picked.forEach(function (id) { wk[id] = (wk[id] || 0) + 1; c[id] = (c[id] || 0) + 1; });
      var ok = all.filter(function (id) { return normalOn(team[id], day); });
      if (ok.filter(function (id) { return picked.indexOf(id) < 0; }).length < perNight - picked.length) ok = all.filter(function (id) { return canDo(team[id], day); });
      for (var n = picked.length; n < perNight; n++) {
        var best = null, bs = 1e9;
        ok.forEach(function (id) {
          if (picked.indexOf(id) >= 0) return;
          var s = Math.max(0, (wk[id] || 0) - tgt[id] + 1) * 1000 + (wk[id] || 0) * 50 + (c[id] || 0) * 100 + (prev.indexOf(id) >= 0 ? 5000 : 0) +
                  (picked.length ? (pc[pairKey(picked[0], id)] || 0) * 10 : 0) + rank[id] / 100;
          if (s < bs) { bs = s; best = id; }
        });
        if (best) { picked.push(best); wk[best] = (wk[best] || 0) + 1; c[best] = (c[best] || 0) + 1; }
      }
      if (picked.length > 1) { var q = pairKey(picked[0], picked[1]); pc[q] = (pc[q] || 0) + 1; }
      days[day] = picked;
      prev = picked;
    });
    /* repair: move a night from anyone over their share to someone under it
       who can do that night (fixed nights stay put) */
    for (var guard = 0; guard < 50; guard++) {
      var over = all.filter(function (id) { return (wk[id] || 0) > tgt[id]; }), under = all.filter(function (id) { return (wk[id] || 0) < tgt[id]; });
      if (!over.length || !under.length) break;
      var moved = false;
      DAYS.forEach(function (d) {
        if (moved) return;
        days[d].forEach(function (o, i) {
          if (moved || over.indexOf(o) < 0 || isFixedOn(team[o], d)) return;
          var u = under.filter(function (id) { return normalOn(team[id], d) && days[d].indexOf(id) < 0 && !nextTo(days, d, id); })
            .sort(function (x, y) { return ((c[x] || 0) - (c[y] || 0)) || (rank[x] - rank[y]); })[0];
          if (!u) return;
          days[d][i] = u; wk[o]--; wk[u] = (wk[u] || 0) + 1; c[o]--; c[u] = (c[u] || 0) + 1; moved = true;
        });
      });
      if (!moved) break;
    }
    /* everyone does at least one night a week: anyone still on none takes a
       night from someone with two or more (never a fixed night, never next to
       a night they already have, never a day off) */
    all.forEach(function (z) {
      if (wk[z]) return;
      var done = false;
      DAYS.forEach(function (d) {
        if (done || !normalOn(team[z], d) || days[d].indexOf(z) >= 0 || nextTo(days, d, z)) return;
        days[d].forEach(function (o, i) {
          if (done || (wk[o] || 0) < 2 || isFixedOn(team[o], d)) return;
          days[d][i] = z; wk[o]--; wk[z] = 1; c[o]--; c[z] = (c[z] || 0) + 1; done = true;
        });
      });
    });
    var pen = 0;
    all.forEach(function (id) {
      pen += Math.abs((wk[id] || 0) - tgt[id]) + (wk[id] ? 0 : 1000);
      DAYS.forEach(function (d, i) { if (i && days[d].indexOf(id) >= 0 && days[DAYS[i - 1]].indexOf(id) >= 0) pen += 1000; });
    });
    return { penalty: pen, days: days, v: 2, generatedAt: Date.now(), seed: 'lockup:' + week + (salt ? ':' + salt : '') };
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
    var tw = {}, wr = weeks && weeks[isoWeek(date)];
    DAYS.forEach(function (d) { ids(wr && wr.days && wr.days[d]).forEach(function (id) { tw[id] = (tw[id] || 0) + 1; }); });
    var cands = Object.keys(team || {}).filter(function (id) {
      var t = team[id];
      return canDo(t, dow) && !away[id] && pair.indexOf(id) < 0;
    });
    /* people kept to their fixed nights only step in when nobody else can */
    cands.sort(function (a, b) {
      return ((!normalOn(team[a], dow)) - (!normalOn(team[b], dow))) || ((near.indexOf(a) >= 0) - (near.indexOf(b) >= 0)) || ((tw[a] ? 1 : 0) - (tw[b] ? 1 : 0)) || ((c[a] || 0) - (c[b] || 0)) || (a < b ? -1 : 1);
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
          var t = team && team[p];
          /* away, now off that day, or taken off the rota: swap just this slot */
          if (!away[p] && canDo(t, dow)) return;
          var rest = pair.filter(function (x) { return x !== p; });
          var r = replacement(weeks, team, absences, date, rest.concat([p]));
          pair = r ? pair.map(function (x) { return x === p ? r : x; }) : rest;
          weeks[wk].days[dow] = pair; changed = true;
          var ch = { week: wk, dow: dow, date: date, out: p, 'in': r, pair: pair.slice() };
          changes.push(ch);
          if (away[p] === 'absent' && canDo(t, dow)) moveLater(weeks, team, absences, today, signed, wk, dow, p, ch, changes);
        });
        if (changed) weeks[wk].days[dow] = ids(weeks[wk].days[dow]);
      });
    });
    return changes;
  }
  /* Dan's rule: if the night someone can't make was their only one that
     week, move them to another valid night later that week (after today,
     unsigned, not a day off or never day, not absent, not next to a night
     they have). They swap with someone on that night who has two or more
     nights; that person takes the vacated night if it is valid for them,
     otherwise the cover already found keeps it. Sets ch.note for the email. */
  function moveLater(weeks, team, absences, today, signed, wk, dow, p, ch, changes) {
    var w = weeks[wk].days, n = {};
    DAYS.forEach(function (d) { ids(w[d]).forEach(function (id) { n[id] = (n[id] || 0) + 1; }); });
    if (n[p]) return;
    var name = (team[p] && team[p].name) || p, i0 = DAYS.indexOf(dow);
    for (var i = i0 + 1; i < DAYS.length; i++) {
      var e = DAYS[i], de = dateFor(wk, e);
      if (de <= today || (signed && signed[de]) || !canDo(team[p], e) || absentOn(absences, de)[p]) continue;
      var pe = ids(w[e]); if (pe.indexOf(p) >= 0) continue;
      var o = pe.filter(function (x) { return (n[x] || 0) >= 2 && !isFixedOn(team[x], e); })[0];
      if (!o) continue;
      pe = pe.map(function (x) { return x === o ? p : x; }); w[e] = pe;
      if (nextTo(w, e, p)) { w[e] = ids(weeks[wk].days[e]).map(function (x) { return x === p ? o : x; }); continue; }
      /* o into the vacated night instead of the cover, when valid */
      var pd = ids(w[dow]), r = ch['in'];
      if (r && pd.indexOf(o) < 0 && canDo(team[o], dow) && !absentOn(absences, ch.date)[o]) {
        var trial = pd.map(function (x) { return x === r ? o : x; }), keep = w[dow]; w[dow] = trial;
        if (!nextTo(w, dow, o)) { ch['in'] = o; ch.pair = trial.slice(); }
        else w[dow] = keep;
      }
      changes.push({ week: wk, dow: e, date: de, out: o, 'in': p, pair: pe.slice(), moved: true });
      ch.note = name + '\u2019s only lockup this week, so moved to ' + DAY_NAMES[e] + ' ' + (+de.slice(8)) + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+de.slice(5, 7) - 1] + ' in place of ' + ((team[o] && team[o].name) || o) + '.';
      return;
    }
    ch.note = 'That was ' + name + '\u2019s only lockup this week and no other night this week works, so ' + name + ' has none this week.';
  }

  /* who is on for a date: { kind: 'staff'|'managers'|'closed', ids: [...] } */
  /* puts fixed people onto their fixed nights in stored weeks, after `today`
     (never tonight, past or signed nights). Only the slots it needs change:
     the non fixed person with the most nights that week makes way. Each
     night is done once (days_fixed marker) so a manager's later swap sticks.
     Mutates `weeks`, returns changes like applyAbsences. */
  function applyFixed(weeks, team, absences, today, signed, from) {
    var changes = [];
    Object.keys(weeks || {}).sort().forEach(function (wk) {
      var w = weeks[wk]; if (!w || !w.days) return;
      DAYS.forEach(function (dow) {
        var date = dateFor(wk, dow);
        if (date <= today || (from && date < from) || (signed && signed[date])) return;
        var want = fixedFor(team, dow); if (!want.length) return;
        var away = absentOn(absences, date), pair = ids(w.days[dow]);
        var key = want.join('+');
        if ((w.fixedDone || {})[dow] === key) return;
        var before = pair.slice();
        want.forEach(function (id) {
          if (away[id] || pair.indexOf(id) >= 0) return;
          var others = pair.filter(function (x) { return !isFixedOn(team[x], dow); });
          if (pair.length < 2) { pair.push(id); return; }
          if (!others.length) return;
          var wn = {}; DAYS.forEach(function (d) { ids(w.days[d]).forEach(function (x) { wn[x] = (wn[x] || 0) + 1; }); });
          others.sort(function (a, b) { return (wn[b] || 0) - (wn[a] || 0) || (a < b ? -1 : 1); });
          pair = pair.map(function (x) { return x === others[0] ? id : x; });
        });
        w.fixedDone = w.fixedDone || {}; w.fixedDone[dow] = key;
        if (pair.join() !== before.join()) {
          w.days[dow] = pair;
          before.forEach(function (x) { if (pair.indexOf(x) < 0) changes.push({ week: wk, dow: dow, date: date, out: x, 'in': pair.filter(function (y) { return before.indexOf(y) < 0; })[0], pair: pair.slice(), fixed: true }); });
        }
        changes.fixedMarks = (changes.fixedMarks || []).concat([{ week: wk, dow: dow, key: key }]);
      });
    });
    return changes;
  }
  function onFor(dateStr, weekRec, holidays) {
    var dow = london(new Date(dateStr + 'T12:00:00Z')).dow;
    if (dow === 'sun' || (holidays && holidays[dateStr])) return { kind: 'closed', dow: dow };
    if (dow === 'sat') return { kind: 'managers', dow: dow };
    var list = ids(weekRec && weekRec.days && weekRec.days[dow]);
    return { kind: 'staff', dow: dow, ids: list, id: list[0] || null };
  }

  var api = { DAYS: DAYS, DAY_NAMES: DAY_NAMES, defaults: defaults, london: london, isoWeek: isoWeek, weekStart: weekStart,
    addDays: addDays, shiftWeek: shiftWeek, dateFor: dateFor, counts: counts, pairCounts: pairCounts, ids: ids, isPaired: isPaired, needsWeek: needsWeek, applyFixed: applyFixed, canDo: canDo, normalOn: normalOn, isFixedOn: isFixedOn, fixedFor: fixedFor, arr: arr, shortLabel: shortLabel, generate: generate, onFor: onFor, SEED_ABSENCES: SEED_ABSENCES, absentOn: absentOn, pairOn: pairOn, replacement: replacement, applyAbsences: applyAbsences,
    REMIND_MINS: 17 * 60, NUDGE_MINS: 18 * 60 + 5, NUDGE_SAT_MINS: 17 * 60 + 5, ESCALATE_SAT_MINS: 17 * 60 + 30,
    /* Saturday closes at 5pm: reminder 4pm, nudge 5:05pm, managers 5:30pm */
    remindAt: function (dow) { return dow === 'sat' ? 16 * 60 : 17 * 60; },
    nudgeAt: function (dow) { return dow === 'sat' ? 17 * 60 + 5 : 18 * 60 + 5; },
    escalateAt: function (dow) { return dow === 'sat' ? 17 * 60 + 30 : 18 * 60 + 30; }, REMIND_SAT_MINS: 16 * 60, ESCALATE_MINS: 18 * 60 + 30 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LockupRota = api;
})(this);
