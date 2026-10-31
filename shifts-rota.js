/* shifts-rota.js - the rules behind the shift and day-off calendar (shifts.html).
 *
 * Pure functions, no Firebase, so the browser page and scripts/test-shifts.js
 * run exactly the same rules. It sits on lockup-rota.js: the team, usual days
 * off, absences and lockup cover are the lockup ones, so the calendar and the
 * lockup rota cannot disagree about who is in.
 *
 * Rules (Dan, 30 October 2026):
 *   - Mon to Fri: at least weekdayMin (5) of the sales team on each day.
 *   - Saturday: at least saturdayMin (7, or 8) on.
 *   - Bank holidays: a rota of bhStaff (4) from the sales team, excluding
 *     bhExclude (Molly and Chloe). Those are the only people on a bank holiday.
 *   - Sunday and manually closed days (lockup config "closed days"): no staff.
 *   - A request that would take a day below its minimum is not approved on
 *     its own: a manager has to approve it with an override and a reason.
 *   - A day off swap is within one ISO week and at most switchesPerWeek a week.
 *
 * Absence kinds, all in lockup/absences:
 *   holiday, absent   away from work (counted out of staffing)
 *   works             a day off swapped for a working day, or a shift taken
 *                     over from a colleague (counted in, free for cover)
 */
(function (root) {
  var LR = (typeof module !== 'undefined' && module.exports) ? require('./lockup-rota.js') : root.LockupRota;

  var DEFAULT_CONFIG = { weekdayMin: 5, saturdayMin: 7, bhStaff: 4, bhExclude: ['molly', 'chloe'], switchesPerWeek: 1, swapNeedsApproval: false, handoverMin: 1, handoverIds: ['chloe', 'molly'], countExclude: ['chloe', 'molly', 'elvis'] };

  /* a list stored as an array, as {id: true}, as {0: id, 1: id} or as one string */
  function listOf(v) {
    if (!v) return [];
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) return v.filter(Boolean);
    return Object.keys(v).sort(function (a, b) { return (+a) - (+b) || (a < b ? -1 : 1); })
      .filter(function (k) { return v[k] === true || (typeof v[k] === 'string' && v[k]); })
      .map(function (k) { return v[k] === true ? k : v[k]; });
  }
  function cfgOf(config) {
    var c = {};
    Object.keys(DEFAULT_CONFIG).forEach(function (k) {
      c[k] = (config && config[k] != null) ? config[k] : DEFAULT_CONFIG[k];
    });
    c.bhExclude = listOf(c.bhExclude);
    c.handoverIds = listOf(c.handoverIds);
    c.countExclude = listOf(c.countExclude);
    return c;
  }
  function dowOf(date) { return LR.london(new Date(date + 'T12:00:00Z')).dow; }
  function rangeDates(from, to) {
    var out = [], d = from;
    while (d <= to && out.length < 400) { out.push(d); d = LR.addDays(d, 1); }
    return out;
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ctx = {
       team, managers        lockup config (team and managers by id)
       absences              lockup/absences
       config                shifts/config (see DEFAULT_CONFIG)
       bh                    shifts/bh: date -> {staff: [ids]}
       holidays              bank holidays: date -> {label} (gov.uk, England and Wales)
       closed                lockup config "closed days": date -> {label}
       requests              shifts/requests (for the one switch a week rule)
       today                 YYYY-MM-DD, London
     } */
  function makeCtx(o) {
    o = o || {};
    return {
      team: o.team || {}, managers: o.managers || {}, absences: o.absences || {},
      config: cfgOf(o.config), bh: o.bh || {}, holidays: o.holidays || {}, closed: o.closed || {},
      requests: o.requests || {}, today: o.today || LR.london().date
    };
  }

  /* weekday, Saturday, bank holiday, or closed */
  function dayKind(ctx, date) {
    if (ctx.closed[date]) return 'closed';
    var dow = dowOf(date);
    if (dow === 'sun') return 'closed';
    if (ctx.holidays[date]) return 'bh';
    if (dow === 'sat') return 'sat';
    return 'weekday';
  }
  function minFor(ctx, kind) {
    if (kind === 'weekday') return ctx.config.weekdayMin;
    if (kind === 'sat') return ctx.config.saturdayMin;
    if (kind === 'bh') return ctx.config.bhStaff;
    return 0;
  }

  /* one person on one date: { on, why }. why is working, swapped-in, off,
     holiday, absent, bh, bh-off, bh-no-rota, inactive, closed or not-team */
  function personDay(ctx, id, date) {
    var t = ctx.team[id];
    if (!t) return { on: false, why: 'not-team' };
    if (t.active === false) return { on: false, why: 'inactive' };
    var kind = dayKind(ctx, date);
    if (kind === 'closed') return { on: false, why: 'closed' };
    var away = LR.absentOn(ctx.absences, date)[id] || null;
    if (kind === 'bh') {
      var rota = ctx.bh[date];
      if (!rota) return { on: false, why: 'bh-no-rota' };
      if (listOf(rota.staff).indexOf(id) < 0) return { on: false, why: 'bh-off' };
      if (away) return { on: false, why: away };
      return { on: true, why: 'bh' };
    }
    if (away) return { on: false, why: away };
    var works = !!LR.worksOn(ctx.absences, date)[id];
    var usual = LR.canDo(t, dowOf(date));
    if (!usual && !works) return { on: false, why: 'off' };
    return { on: true, why: usual ? 'working' : 'swapped-in' };
  }

  /* sales team on that date, in lockup team order */
  function staffOn(ctx, date) {
    return Object.keys(ctx.team).filter(function (id) { return personDay(ctx, id, date).on; })
      .sort(function (a, b) { return ((ctx.team[a].order || 0) - (ctx.team[b].order || 0)) || (a < b ? -1 : 1); });
  }

  /* the staffing of one date against its minimum. Two minimums:
       staff     the sales team on that day (weekdays, Saturday, bank holidays)
       handover  at least handoverMin of the handover team (Chloe, Molly) in
                 on every open day except bank holidays, whose rota leaves
                 them out. */
  function countDay(ctx, date) {
    var kind = dayKind(ctx, date), min = minFor(ctx, kind);
    var ids = kind === 'closed' ? [] : staffOn(ctx, date);
    var hIds = ctx.config.handoverIds || [];
    var hCount = kind === 'closed' ? 0 : ids.filter(function (id) { return hIds.indexOf(id) >= 0; }).length;
    var hApplies = kind === 'weekday' || kind === 'sat';
    var hMin = hApplies ? ctx.config.handoverMin : 0;
    /* the minimum counts sales executives only: not the handover team, not
       Elvis, not managers (who are not on the team list) */
    var ex = ctx.config.countExclude || [];
    var sales = ids.filter(function (id) { return ex.indexOf(id) < 0 && !(ctx.managers && ctx.managers[id]); });
    var staffOk = kind === 'closed' || sales.length >= min;
    var handoverOk = !hApplies || hCount >= hMin;
    var ok = staffOk && handoverOk;
    var reasons = [];
    if (!staffOk) reasons.push('staff');
    if (!handoverOk) reasons.push('handover');
    return {
      date: date, dow: dowOf(date), kind: kind, count: sales.length, min: min, ids: ids, salesIds: sales, ok: ok,
      short: staffOk ? 0 : min - sales.length, noRota: kind === 'bh' && !ctx.bh[date],
      handover: { count: hCount, min: hMin, ok: handoverOk }, reasons: reasons
    };
  }

  /* minimum staffing across a span: the days that fall short, for the
     settings screen and the staffing table */
  function shortDays(ctx, from, to) {
    return rangeDates(from, to).map(function (d) { return countDay(ctx, d); }).filter(function (c) { return !c.ok; });
  }

  /* what a set of edits does to staffing. edits: [{personId, from, to, kind}]
     with kind holiday, absent (away) or works (in). Only a day that was ok
     and is now not, or that lost someone while already short, is "newly
     short" and needs a manager. */
  function impact(ctx, edits) {
    var extra = {}, dates = {};
    (edits || []).forEach(function (e, i) {
      extra['_edit' + i] = { personId: e.personId, from: e.from, to: e.to, kind: e.kind, _pending: true };
      rangeDates(e.from, e.to).forEach(function (d) { dates[d] = true; });
    });
    var after = Object.assign({}, ctx, { absences: Object.assign({}, ctx.absences, extra) });
    var days = Object.keys(dates).sort().map(function (d) {
      var b = countDay(ctx, d), a = countDay(after, d);
      return { date: d, dow: a.dow, kind: a.kind, before: b, after: a, min: a.min,
        newlyShort: !a.ok && (b.ok || a.count < b.count),
        ids: a.ids };
    });
    var newlyShort = days.filter(function (x) { return x.newlyShort; });
    return { days: days, newlyShort: newlyShort, ok: newlyShort.length === 0 };
  }

  var RANGE_KINDS = ['holiday', 'absence', 'training', 'lieu'];
  /* the change a request makes, as lockup/absences style edits */
  function editsFor(req) {
    /* training and lieu days are time away, recorded in lockup as away like an absence */
    if (RANGE_KINDS.indexOf(req.kind) >= 0) {
      return [{ personId: req.personId, from: req.from, to: req.to, kind: req.kind === 'holiday' ? 'holiday' : 'absent' }];
    }
    if (req.kind === 'switch') {
      return [
        { personId: req.personId, from: req.giveUp, to: req.giveUp, kind: 'absent' },
        { personId: req.personId, from: req.takeOn, to: req.takeOn, kind: 'works' }
      ];
    }
    if (req.kind === 'swap') {
      return [
        { personId: req.personId, from: req.date, to: req.date, kind: 'absent' },
        { personId: req.withId, from: req.date, to: req.date, kind: 'works' }
      ];
    }
    return [];
  }

  function overlapsBooked(ctx, personId, from, to, ignoreId) {
    var hit = null;
    Object.keys(ctx.absences).forEach(function (k) {
      var a = ctx.absences[k];
      if (!a || a.personId !== personId || a.kind === 'works' || a.status === 'cancelled') return;
      if (a.from <= to && from <= a.to) hit = 'Already booked ' + a.from + (a.to !== a.from ? ' to ' + a.to : '');
    });
    if (hit) return hit;
    Object.keys(ctx.requests).forEach(function (k) {
      if (k === ignoreId) return;
      var r = ctx.requests[k];
      if (!r || r.personId !== personId || RANGE_KINDS.indexOf(r.kind) < 0) return;
      if (['pending', 'approved'].indexOf(r.status) < 0) return;
      if (r.from <= to && from <= r.to) hit = 'Already requested ' + r.from + (r.to !== r.from ? ' to ' + r.to : '');
    });
    return hit;
  }

  /* checks a request before it is sent. Returns
     { valid, errors[], edits[], impact, workDates[] }.
     req: {kind, personId, from, to, giveUp, takeOn, date, withId, note, id} */
  function checkRequest(ctx, req) {
    var errors = [], edits = [], workDates = [], im = null;
    var iso = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
    var t = ctx.team[req.personId];
    if (!t) errors.push('Pick who this is for.');
    if (RANGE_KINDS.indexOf(req.kind) >= 0) {
      if (!iso.test(req.from || '') || !iso.test(req.to || '')) errors.push('Pick a start and end date.');
      else if (req.to < req.from) errors.push('The end date is before the start.');
      else if (req.kind === 'holiday' && req.from < ctx.today) errors.push('Holiday starts in the past.');
      else if (req.kind !== 'holiday' && req.to < ctx.today) errors.push('That is in the past.');
      else {
        var booked = overlapsBooked(ctx, req.personId, req.from, req.to, req.id);
        if (booked) errors.push(booked + '.');
        workDates = rangeDates(req.from, req.to).filter(function (d) { return personDay(ctx, req.personId, d).on; });
        if (!workDates.length && req.kind === 'holiday') errors.push('No working days in that range.');
        /* annual leave is authorised on Ciphr first; the person confirms that with a tick (a manager adding it does not need one) */
        if (req.kind === 'holiday' && !req.byManager && req.ciphrOk !== true && req.ciphrConfirmed !== true) errors.push('Tick to confirm this annual leave has been authorised on Ciphr.');
      }
    } else if (req.kind === 'switch') {
      var lw = req.giveUp && LR.isoWeek(req.giveUp);
      if (!iso.test(req.giveUp || '') || !iso.test(req.takeOn || '')) errors.push('Pick the day you give up and the day you take instead.');
      else if (req.giveUp === req.takeOn) errors.push('Those are the same day.');
      else if (LR.isoWeek(req.takeOn) !== lw) errors.push('Both days have to be in the same week.');
      else if (req.giveUp < ctx.today || req.takeOn < ctx.today) errors.push('Pick a day that has not passed.');
      else if (!personDay(ctx, req.personId, req.giveUp).on || personDay(ctx, req.personId, req.giveUp).why === 'bh') errors.push('You are not on that day to give it up.');
      else if (personDay(ctx, req.personId, req.takeOn).on) errors.push('You are already on that day.');
      else if (['weekday', 'sat'].indexOf(dayKind(ctx, req.takeOn)) < 0) errors.push('The office is not open that day.');
      else {
        var sw = Object.keys(ctx.requests).filter(function (k) {
          var r = ctx.requests[k];
          return r && r.kind === 'switch' && r.personId === req.personId && k !== req.id && ['pending', 'awaiting', 'approved'].indexOf(r.status) >= 0 && LR.isoWeek(r.giveUp) === lw;
        }).length;
        if (sw >= ctx.config.switchesPerWeek) errors.push('You have already switched a day off this week.');
      }
    } else if (req.kind === 'swap') {
      if (!iso.test(req.date || '')) errors.push('Pick the shift.');
      else if (req.date < ctx.today) errors.push('That shift has passed.');
      else if (!personDay(ctx, req.personId, req.date).on) errors.push('You are not working that day.');
      else if (['weekday', 'sat'].indexOf(dayKind(ctx, req.date)) < 0) errors.push('That is not a shift day.');
      else if (!ctx.team[req.withId]) errors.push('Pick the colleague who is taking it.');
      else if (req.withId === req.personId) errors.push('Pick someone else.');
      else if (personDay(ctx, req.withId, req.date).on) errors.push(ctx.team[req.withId].name + ' is already on that day.');
      else if (LR.absentOn(ctx.absences, req.date)[req.withId]) errors.push(ctx.team[req.withId].name + ' is away that day.');
    } else {
      errors.push('Unknown request.');
    }
    if (!errors.length) {
      edits = editsFor(req);
      im = impact(ctx, edits);
    }
    return { valid: !errors.length, errors: errors, edits: edits, impact: im, workDates: workDates };
  }

  /* the bank holiday rota: bhStaff people from the sales team, minus the
     excluded people and anyone away. Fewest bank holidays so far (earlier
     ones only, so re-running the rota never changes history), people on
     their usual day off last, ties on a shuffle seeded by the date.
     Returns {staff, short}. */
  function bhPick(ctx, date) {
    var n = ctx.config.bhStaff, excl = ctx.config.bhExclude;
    var c = {};
    Object.keys(ctx.bh).forEach(function (d) {
      if (d < date && ctx.holidays[d]) listOf(ctx.bh[d].staff).forEach(function (id) { c[id] = (c[id] || 0) + 1; });
    });
    var pool = Object.keys(ctx.team).filter(function (id) {
      var t = ctx.team[id];
      return t.active !== false && excl.indexOf(id) < 0 && !LR.absentOn(ctx.absences, date)[id];
    }).sort();
    var rnd = mulberry32(hashStr('bh:' + date));
    var rank = {};
    pool.forEach(function (id) { rank[id] = rnd(); });
    var dow = dowOf(date);
    pool.sort(function (a, b) {
      return ((c[a] || 0) - (c[b] || 0)) ||
        ((LR.canDo(ctx.team[a], dow) ? 0 : 1) - (LR.canDo(ctx.team[b], dow) ? 0 : 1)) ||
        (rank[a] - rank[b]);
    });
    var staff = pool.slice(0, n).sort();
    return { staff: staff, short: Math.max(0, n - staff.length) };
  }
  /* rota for each bank holiday in dates (ascending) that has none yet. Dates
     with a rota are left alone; a manager's own choice always stands. */
  function bhGenerate(ctx, dates) {
    var out = {}, work = Object.assign({}, ctx.bh);
    dates.slice().sort().forEach(function (d) {
      if (!ctx.holidays[d] || work[d]) return;
      var pick = bhPick(Object.assign({}, ctx, { bh: work }), d);
      out[d] = { staff: pick.staff, short: pick.short };
      work[d] = { staff: pick.staff };
    });
    return out;
  }

  /* the week ahead, day by day, for the Monday email and the home page: who is
     in, who is away (with their note), and whether each minimum is met */
  function whoIn(ctx, from, to) {
    return rangeDates(from, to).map(function (d) {
      var c = countDay(ctx, d), away = LR.absentOn(ctx.absences, d);
      var awayList = Object.keys(away).filter(function (id) { return ctx.team[id]; }).map(function (id) {
        var a = Object.keys(ctx.absences).map(function (k) { return ctx.absences[k]; })
          .filter(function (x) { return x && x.personId === id && x.kind !== 'works' && x.status !== 'cancelled' && x.from <= d && d <= x.to; })[0] || {};
        return { id: id, kind: away[id], note: a.note || '' };
      });
      return Object.assign({}, c, { away: awayList });
    });
  }

  /* the bank holidays (from gov.uk) between two dates */
  function bhDates(ctx, from, to) {
    return Object.keys(ctx.holidays).filter(function (d) { return d >= from && d <= to && !ctx.closed[d]; }).sort();
  }

  /* what changes if a person's usual day off moves: days that fall short
     with the new setting, for the settings screen */
  function weeklyOffEffect(ctx, personId, newOff, from, to) {
    var team = Object.assign({}, ctx.team), t = Object.assign({}, team[personId]);
    t.off = newOff || null;
    team[personId] = t;
    var after = Object.assign({}, ctx, { team: team });
    return {
      before: shortDays(ctx, from, to).length,
      after: shortDays(after, from, to).length,
      days: shortDays(after, from, to)
    };
  }

  var api = {
    DEFAULT_CONFIG: DEFAULT_CONFIG, listOf: listOf, cfgOf: cfgOf, makeCtx: makeCtx, dowOf: dowOf, rangeDates: rangeDates,
    dayKind: dayKind, minFor: minFor, personDay: personDay, staffOn: staffOn, countDay: countDay, shortDays: shortDays,
    impact: impact, editsFor: editsFor, checkRequest: checkRequest, bhPick: bhPick, bhGenerate: bhGenerate, bhDates: bhDates,
    weeklyOffEffect: weeklyOffEffect, whoIn: whoIn
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ShiftRota = api;
})(this);
