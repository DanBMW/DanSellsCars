/* scripts/reception-mail.js - showroom cover, run from scripts/lockup-mail.js
 * (every 15 minutes, Monday to Saturday, by the lockup-emails Action).
 *
 *   After 07:30 on each open day: plan the three shifts (reception-rota.js) from
 *   the sales team's availability (shift calendar), write the plan to
 *   <root>/reception/<date>/<shift>, and queue one email per person:
 *   "You are on showroom cover. Please cover showroom until HH:MM."
 *   A person who answers "cannot cover" on reception.html is recorded there as
 *   declined. The next run queues a manager note with their reason, banks any
 *   time they already covered (handed_back), takes them off that shift and puts
 *   the next fair person on, emailing them the same way. Anyone can write a
 *   take request to volunteer for a shift; the job puts them on, notifies the
 *   previous person, and logs took_over.
 *   When the team-board walk-in feed reports that the person currently on the
 *   active showroom cover shift has taken a walk-in, the job writes the same
 *   reallocate record the managers' "unable" button writes, so the next fair
 *   person is put on and emailed. Outside the active shift window, or when the
 *   taker is not the cover person, nothing changes. Each alert id is handled once.
 *
 *   Email ids are fixed (rc_live_<date>_<shift>_<person> or rc_test_…), so each
 *   email is queued once, and test runs can never block live sends. Planned
 *   cover emails carry sendAfter = shift start minus 10 minutes (UK); a
 *   reallocation after a decline sends straight away. Old days are pruned
 *   after 14 days.
 *
 * Still to do (Dan to provide): the appointment link, read at 07:30 and 17:30,
 * to skip people with customers booked. Until then the plan uses the shift
 * calendar only.
 *
 * Exports run({ db, root, shiftsRoot, n, nowMs, dry, cfg, bank, mgrList, testExec }).
 */
'use strict';
const RR = require('../reception-rota.js');
const SR = require('../shifts-rota.js');
const LR = require('../lockup-rota.js');

const PLAN_FROM = 7 * 60 + 30; /* 07:30 UK */
const KEEP_DAYS = 14;

function hm(mins) { return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function minsOf(t) { return +String(t).slice(0, 2) * 60 + +String(t).slice(3, 5); }
function firstName(p, id) { return (p && p.name) || id; }

/* live and test share the lockup notify queue when lockup is live; scope every
   reception id so a test send can never block the real one. */
function rcMode() { return RR.TEST_ONLY ? 'test' : 'live'; }
function rcId() { return ['rc', rcMode()].concat([].slice.call(arguments)).join('_'); }

/* UK wall-clock (date + HH:MM) → epoch ms, via Europe/London. */
function ukTimeToMs(date, hhmm) {
  const parts = String(hhmm).split(':');
  const H = +parts[0], M = +(parts[1] || 0);
  const want = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), H, M, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const asUtc = (ms) => {
    const o = {};
    dtf.formatToParts(new Date(ms)).forEach(p => { if (p.type !== 'literal') o[p.type] = p.value; });
    return Date.UTC(+o.year, +o.month - 1, +o.day, (+o.hour % 24), +o.minute, +o.second);
  };
  let t = want;
  for (let i = 0; i < 4; i++) t += want - asUtc(t);
  return t;
}

/* Cover email held until 10 minutes before the shift starts (UK). */
function coverSendAfterMs(date, from) {
  return ukTimeToMs(date, hm(Math.max(0, minsOf(from) - 10)));
}

/* True when this person already got a live (non-rcTest) cover mail for the shift,
   under the old rc_<date>_… id or the new rc_live_/rc_test_ form. */
function coverAlreadySent(existing, date, shift, pid) {
  const re = new RegExp('^rc_(?:(?:live|test)_)?' + date.replace(/-/g, '\\-') + '_' + shift + '_' + pid + '(?:_|$)');
  return Object.keys(existing || {}).some(id => {
    const q = existing[id];
    if (!q || !q.sent || q.rcTest) return false;
    return re.test(id);
  });
}


/* Same public proxy the team board polls for walk-in / office-display alerts. */
const OFFICE_ALERTS_URL = 'https://dansells-office-alerts.danielcane1992.workers.dev/alerts';

/* Read walk-in-taken (and related) alerts from the office-display feed.
   Returns [] on any failure so cover planning never blocks on the feed. */
async function fetchWalkinAlerts(fetchImpl) {
  try {
    const res = await (fetchImpl || fetch)(OFFICE_ALERTS_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) return [];
    const j = await res.json();
    const raw = (j && j.alerts) || [];
    return raw.map(a => {
      if (!a || !a.id) return null;
      const kind = String(a.kind || '').toLowerCase().replace(/[\s_]+/g, '-');
      return {
        id: String(a.id),
        kind: kind,
        assignedTo: a.salesExecutiveName || a.assignedTo || a.bookedWith || '',
        customer: a.customerName || a.customer || a.name || '',
        eventAt: a.eventAt || a.arrivedAt || null,
        ts: a.eventAt || a.arrivedAt || null
      };
    }).filter(Boolean);
  } catch (e) { return []; }
}

/* UK clock minutes from an epoch ms timestamp. */
function ukMinsFromTs(ts) {
  if (!ts) return null;
  const dtf = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = dtf.formatToParts(new Date(ts));
  const o = {};
  parts.forEach(p => { if (p.type !== 'literal') o[p.type] = p.value; });
  return (+o.hour % 24) * 60 + (+o.minute);
}

/* Confirm time for banking: coveringMins if stored, else coveringTs, else ts when status is covering. */
function confirmMinsOf(rec) {
  if (!rec) return null;
  if (rec.coveringMins != null) return +rec.coveringMins;
  if (rec.coveringTs) return ukMinsFromTs(rec.coveringTs);
  if (rec.status === 'covering' && rec.ts) return ukMinsFromTs(rec.ts);
  return null;
}

/* Log a handed-back partial when someone leaves mid-shift. Returns the banked segment or null. */
async function bankHandBack(logWrite, s, rec, n, date, extra) {
  const bank = RR.bankCover(s, { nowMins: n.mins, confirmMins: confirmMinsOf(rec) });
  if (!bank) return null;
  const ts = (extra && extra.ts) || Date.now();
  await logWrite('cover_' + date + '_' + s.id + '_' + ts, Object.assign({
    kind: 'cover', reason: 'handed_back', personId: rec.personId, date, shift: s.id,
    from: bank.from, to: bank.to, minutes: bank.minutes, ts
  }, extra || {}));
  return bank;
}

/* the shift calendar's view of the day, as the rota reads it */
function shiftCtx(o) {
  return SR.makeCtx({ team: o.team, managers: o.managers, absences: o.absences, config: o.shiftCfg, bh: o.bh, holidays: o.holidays, closed: o.closed, today: o.n.date });
}

/* previous reception shifts per person in the last 30 days, from the plan */
function historyOf(all, date) {
  const out = {};
  Object.keys(all || {}).forEach(d => {
    if (d >= date || LR.addDays(date, -30) > d) return;
    Object.keys(all[d] || {}).forEach(k => { if (k.charAt(0) === '_') return; const p = all[d][k] && all[d][k].personId; if (p) out[p] = (out[p] || 0) + 1; });
  });
  return out;
}

async function run(o) {
  const { db, root, n, dry, team, managers, cfg, testExec, queueAdd, log } = o;
  const date0 = o.date || n.date;
  const say = log || console.log;
  const logRoot = o.logRoot || 'receptionLog';
  const flag = Object.assign({}, RR.TEST_ONLY ? { rcTest: true } : {});
  /* every email to managers names the date and links to the page; cover emails to people are as before */
  const qAdd = (id, rec, dry) => {
    const r2 = Object.assign({}, rec, flag, { subject: '[Beta] ' + rec.subject });
    if (rec.to === 'managers') {
      const when = RR.longDate(date);
      r2.subject = '[Beta] ' + rec.subject + ' · ' + when;
      r2.text = rec.text + '\n\n' + when + '\nOpen showroom cover: ' + RR.PAGE_URL;
      r2.html = (rec.html || '') + '<p><b>' + esc(when) + '</b><br><a href="' + RR.PAGE_URL + '">Open showroom cover</a></p>';
    }
    return queueAdd(id, r2, dry);
  };
  /* the management log (skips, absence tags, and every shift someone was put on): admin writes only */
  const logWrite = async (key, entry) => { if (!dry) await db.ref(logRoot + '/' + key).set(entry); };
  const date = date0, dow = SR.dowOf(date);
  const absences = o.absences || {};
  const ctx = shiftCtx({ team, managers, absences, shiftCfg: o.shiftCfg, bh: o.bh, holidays: o.holidays, closed: o.closed, n });
  if (SR.dayKind(ctx, date) === 'closed') return { skipped: 'closed' };

  const shifts = RR.shiftsFor(dow);
  const all = o.reception || {};
  const today = Object.assign({}, all[date] || {});
  const endMins = s => +s.to.slice(0, 2) * 60 + +s.to.slice(3, 5);

  /* 0. walk-in taken by the person on the active cover shift → same reallocate as Unable */
  const walkinHandled = Object.assign({}, ((today._day || {}).walkinHandled) || {});
  let walkinHandledDirty = false;
  const walkinAlerts = o.walkinAlerts != null ? o.walkinAlerts : await fetchWalkinAlerts(o.fetch);
  for (const a of walkinAlerts || []) {
    const aid = a && a.id ? String(a.id) : '';
    const action = RR.walkinCoverReallocate({
      alertId: aid,
      kind: a.kind,
      assignedTo: a.assignedTo,
      customer: a.customer,
      team: team,
      shifts: shifts,
      nowMins: n.mins,
      day: today,
      handled: walkinHandled,
      ts: (typeof a.eventAt === 'number' ? a.eventAt : null) || (typeof a.ts === 'number' ? a.ts : null) || Date.now()
    });
    if (aid) { walkinHandled[aid] = true; walkinHandledDirty = true; }
    if (!action) continue;
    const prev = today[action.shiftId] || {};
    today[action.shiftId] = Object.assign({}, prev, { reallocate: action.reallocate });
    if (!dry) await db.ref(root + '/reception/' + date + '/' + action.shiftId + '/reallocate').set(action.reallocate);
    say('Walk-in taken by cover ' + firstName(team[action.personId], action.personId) + ' on ' + action.shiftId + ': queue reallocate');
  }
  if (walkinHandledDirty && !dry) {
    const dayPath = root + '/reception/' + date + '/_day';
    const dayCur = Object.assign({}, today._day || {});
    dayCur.walkinHandled = walkinHandled;
    today._day = dayCur;
    await db.ref(dayPath).update({ walkinHandled: walkinHandled });
  }

  /* 1. a decline: note it to the managers once (keyed by the decline's own time),
     remember the person as declined for that shift, and free the shift */
  const existing = {};
  const mailedCover = {}; /* person|shift mailed a cover email this run — stops ensure double-sends */
  const markMailed = (shift, pid) => { if (pid) mailedCover[shift + '|' + pid] = true; };
  for (const s of shifts) {
    let r = today[s.id] || {};
    /* a manager reallocated the shift: the person on it is logged as a skip, and the shift is freed */
    /* a manager chose someone for a shift nobody could cover: they go on it, and are emailed as usual */
    if (r.assign && r.assign.ts !== r.assignHandledTs && r.assign.personId) {
      const pid = r.assign.personId, p = team[pid] || {};
      const change = { personId: pid, status: 'assigned', ts: Date.now(), assignHandledTs: r.assign.ts, declined: r.declined || {} };
      today[s.id] = Object.assign({}, r, change);
      if (!dry) await db.ref(root + '/reception/' + date + '/' + s.id).update(change);
      if (!dry) await logWrite('on_' + date + '_' + s.id + '_' + change.ts, { kind: 'on', reason: 'planned', personId: pid, date, shift: s.id, from: s.from, to: s.to, ts: change.ts, by: r.assign.by || '' });
      if (p.email) {
        const mail = RR.coverEmail(firstName(p, pid), s);
        qAdd(rcId(date, s.id, pid, change.ts), { to: [testExec || p.email], subject: mail.subject, text: mail.text, html: '<p>' + esc(mail.text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>', ts: Date.now() }, dry);
        markMailed(s.id, pid);
      }
      say('Manager chose ' + firstName(p, pid) + ' for ' + s.id);
      r = today[s.id];
      existing[s.id] = pid;
      continue;
    }

    /* someone volunteered to take the shift (or the remainder of it) */
    if (r.take && r.take.ts !== r.takeHandledTs && r.take.personId) {
      const tk = r.take, pid = tk.personId, p = team[pid] || {};
      const prev = r.personId && r.personId !== pid ? r.personId : null;
      if (prev) {
        await bankHandBack(logWrite, s, r, n, date, { ts: tk.ts, by: pid });
        const dm = Object.assign({}, r.declined || {});
        dm[prev] = true;
        r = Object.assign({}, r, { declined: dm });
      }
      const slot = RR.remainCover(s, n.mins) || { from: s.from, to: s.to, minutes: minsOf(s.to) - minsOf(s.from) };
      const change = {
        personId: pid, status: 'assigned', ts: Date.now(), takeHandledTs: tk.ts,
        declined: r.declined || {}, coveringMins: null, coveringTs: null
      };
      today[s.id] = Object.assign({}, r, change);
      if (!dry) await db.ref(root + '/reception/' + date + '/' + s.id).update(change);
      await logWrite('on_' + date + '_' + s.id + '_' + change.ts, {
        kind: 'on', reason: 'took_over', personId: pid, date, shift: s.id,
        from: slot.from, to: slot.to, minutes: slot.minutes, ts: change.ts,
        replacedPersonId: prev || '', by: tk.by || pid
      });
      if (p.email) {
        const mail = RR.coverEmail(firstName(p, pid), Object.assign({}, s, { from: slot.from, to: slot.to }), { date: date });
        qAdd(rcId(date, s.id, pid, 'take', tk.ts), { to: [testExec || p.email], subject: mail.subject, text: mail.text, html: mail.html, ts: Date.now() }, dry);
        markMailed(s.id, pid);
      }
      if (prev) {
        const prevP = team[prev] || {};
        if (prevP.email) {
          const note = RR.takenEmail(firstName(prevP, prev), firstName(p, pid), s, { date: date });
          qAdd(rcId('taken', date, s.id, prev, tk.ts), { to: [testExec || prevP.email], subject: note.subject, text: note.text, html: note.html, ts: Date.now() }, dry);
        }
        qAdd(rcId('takeMgr', date, s.id, tk.ts), {
          to: 'managers',
          subject: firstName(p, pid) + ' took showroom cover ' + s.from + ' to ' + s.to,
          text: firstName(p, pid) + ' took the shift from ' + firstName(team[prev], prev) + '.',
          html: '<p>' + esc(firstName(p, pid) + ' took the shift from ' + firstName(team[prev], prev) + '.') + '</p>',
          ts: Date.now()
        }, dry);
      }
      say((prev ? firstName(p, pid) + ' took ' + s.id + ' from ' + firstName(team[prev], prev) : firstName(p, pid) + ' took open ' + s.id));
      r = today[s.id];
      existing[s.id] = pid;
      continue;
    }
    if (r.reallocate && r.reallocate.ts !== r.reallocateHandledTs) {
      const rl = r.reallocate, pid = r.personId;
      const dm = Object.assign({}, r.declined || {});
      if (pid) {
        await bankHandBack(logWrite, s, r, n, date, { ts: rl.ts, by: rl.by || '' });
        await logWrite('realloc_' + date + '_' + s.id + '_' + rl.ts, { kind: 'skip', personId: pid, date, shift: s.id, from: s.from, to: s.to, ts: rl.ts, reason: 'Unable to do it', reasonText: String(rl.text || '').slice(0, 500), by: rl.by || '' });
        dm[pid] = true;
      }
      const change = { declined: dm, reallocateHandledTs: rl.ts, personId: null, status: 'open' };
      today[s.id] = Object.assign({}, r, change);
      if (!dry) await db.ref(root + '/reception/' + date + '/' + s.id).update(change);
      say('Unable to do ' + s.id + (pid ? ': ' + firstName(team[pid], pid) : ''));
      r = today[s.id];
    }
    /* a reply from someone tagged absent goes to the managers */
    if (r.absent && r.absent.reply) {
      const rp = r.absent.reply, who = firstName(team[r.absent.personId], r.absent.personId);
      const line = rp.status === 'here' ? who + ' says they are here.' : who + ' is not in: ' + (rp.text || 'no reason given') + '.';
      qAdd(rcId('reply', date, s.id, rp.ts), { to: 'managers', subject: who + (rp.status === 'here' ? ' is here' : ' is not in') + ' (' + s.from + ' to ' + s.to + ')', text: line, html: '<p>' + esc(line) + '</p>', ts: Date.now() }, dry);
    }
    /* a manager nudged someone who is not in the showroom: log it and email them. They stay on the shift. */
    if (r.absent && r.absent.ts !== r.absentHandledTs) {
      const ab = r.absent, ap = team[ab.personId] || {};
      await logWrite('absent_' + date + '_' + s.id + '_' + ab.ts, { kind: 'absent', personId: ab.personId, date, shift: s.id, from: s.from, to: s.to, ts: ab.ts, by: ab.by || '' });
      if (ap.email) {
        const first = firstName(ap, ab.personId);
        const mail = RR.absentEmail(first, s, { date: date });
        qAdd(rcId('absent', date, s.id, ab.ts), { to: [testExec || ap.email], subject: mail.subject,
          text: mail.text, html: mail.html, ts: Date.now() }, dry);
      }
      if (!dry) await db.ref(root + '/reception/' + date + '/' + s.id).update({ absentHandledTs: ab.ts });
      today[s.id] = Object.assign({}, r, { absentHandledTs: ab.ts });
      say('Nudged ' + firstName(ap, ab.personId) + ' on ' + s.id);
      r = today[s.id];
    }
    if (r.status === 'declined' && r.ts !== r.handledTs) {
      const who = firstName(team[r.personId] || (managers || {})[r.personId], r.personId);
      const note = RR.managerNote(who, s, r.reason || 'Cannot cover', r.reasonText || '');
      const banked = await bankHandBack(logWrite, s, r, n, date, { ts: r.ts });
      await logWrite('skip_' + date + '_' + s.id + '_' + r.ts, { kind: 'skip', personId: r.personId, date, shift: s.id, from: s.from, to: s.to, ts: r.ts, reason: r.reason || '', reasonText: r.reasonText || '' });
      const bankLine = banked ? (' They covered ' + banked.from + ' to ' + banked.to + ' (' + banked.minutes + ' mins) before handing back.') : '';
      qAdd(rcId('decl', date, s.id, r.ts), { to: 'managers', subject: note.subject, text: note.text + bankLine, html: '<p>' + esc(note.text + bankLine) + '</p>', ts: Date.now() }, dry);
      const dm = Object.assign({}, r.declined || {});
      if (r.personId) dm[r.personId] = true;
      const freed = { personId: null, status: 'open', declined: dm, handledTs: r.ts };
      today[s.id] = Object.assign({}, r, freed);
      if (!dry) await db.ref(root + '/reception/' + date + '/' + s.id).update(freed);
      if (endMins(s) > n.mins) say('Reassigning ' + s.id + ' after ' + who + ' declined' + (banked ? ' (banked ' + banked.minutes + 'm)' : ''));
      continue;
    }
    if (r.personId && r.status !== 'declined') existing[s.id] = r.personId;
  }

  /* 1c. off on the team calendar: taken off the shift and the shift refilled
     (Dan, 13 November 2026). The day is planned once and only re-planned when
     a shift is empty, so an absence recorded after the plan never reached it:
     Danny was put on the 09:00 shift at 09:28 and marked away on the calendar
     at 09:33, and he stayed on cover. Every run now frees anyone on a shift
     that has not ended who has an absence on the calendar for the day.
     It acts on an absence RECORD (LockupRota.awayOn: a holiday or absence,
     not cancelled), never on someone merely missing from the day's staff
     list. That list is also empty when a read fails or a bank holiday rota
     has not loaded, and treating "not listed" as "off" would strip the whole
     day's cover on one bad read, email the managers about every shift, and,
     because a freed person is marked declined, stop the right people being
     put back once the read recovered. A failed absences read is just {} and
     frees nobody.
     Marking them declined makes the refill a reallocation, so the new person
     is emailed now rather than ten minutes before a shift that has already
     started. Left alone: a shift that has ended, a manager's own pick, someone
     who volunteered to take the shift, and a one-off booked in for the day. */
  const awayToday = LR.awayOn(absences, date);
  const oneOff = (RR.ONE_OFF_IN || {})[date] || [];
  for (const s of shifts) {
    const r = today[s.id] || {}, pid = existing[s.id];
    if (!pid || !awayToday[pid] || oneOff.indexOf(pid) >= 0) continue;
    if (date === n.date && endMins(s) <= n.mins) continue;
    const chosen = (r.assign && r.assign.personId === pid && r.assignHandledTs === r.assign.ts) ||
      (r.take && r.take.personId === pid && r.takeHandledTs === r.take.ts);
    if (chosen) continue;
    const ts = Date.now(), who = firstName(team[pid], pid);
    const banked = await bankHandBack(logWrite, s, r, n, date, { ts, by: 'calendar' });
    await logWrite('absent_' + date + '_' + s.id + '_' + ts, { kind: 'absent', personId: pid, date, shift: s.id, from: s.from, to: s.to, ts, reason: 'Off on the team calendar', by: 'calendar' });
    const dm = Object.assign({}, r.declined || {});
    dm[pid] = true;
    const freed = { personId: null, status: 'open', declined: dm, offCalendar: { personId: pid, ts } };
    today[s.id] = Object.assign({}, r, freed);
    if (!dry) await db.ref(root + '/reception/' + date + '/' + s.id).update(freed);
    delete existing[s.id];
    const line = who + ' is off on the team calendar, so they have been taken off showroom cover ' + s.from + ' to ' + s.to +
      (banked ? ' (they covered ' + banked.from + ' to ' + banked.to + ' first)' : '') + '. The shift goes to the next person free.';
    qAdd(rcId('off', date, s.id, pid), { to: 'managers', subject: who + ' is off: showroom cover ' + s.from + ' to ' + s.to + ' reassigned', text: line, html: '<p>' + esc(line) + '</p>', ts: Date.now() }, dry);
    say('Off on the calendar: ' + who + ' taken off ' + s.id);
  }
  const declined = {};
  shifts.forEach(s => { declined[s.id] = Object.keys((today[s.id] || {}).declined || {}); });

  /* the 07:30 re-read of today's bookings: a shift not yet started that its person now clashes with is freed.
     This is not a skip, they were not refusing it, the booking came in. */
  const busy = o.busy || {};
  if (o.recheck && o.busy && !dry) {
    for (const s of shifts) {
      const r = today[s.id] || {};
      if (!r.personId || minsOf(s.from) <= n.mins) continue;
      if (RR.clashes(busy, r.personId, s)) {
        const change = { personId: null, status: 'open' };
        today[s.id] = Object.assign({}, r, change);
        delete existing[s.id];
        await db.ref(root + '/reception/' + date + '/' + s.id).update(change);
        say('Freed ' + s.id + ': ' + firstName(team[r.personId], r.personId) + ' has an appointment');
      }
    }
    await db.ref(root + '/reception/' + date + '/_day').update({ rechecked: Date.now() });
  }

  /* everyone on the team needs a work email to be put on showroom cover; tell the managers once about anyone who has none */
  for (const id of Object.keys(team)) {
    if (team[id] && team[id].active !== false && !team[id].email) {
      qAdd(rcId('noemail', id), { to: 'managers', subject: (team[id].name || id) + ' has no work email',
        text: (team[id].name || id) + ' has no work email on the lockup team list, so they cannot be put on showroom cover. Please add their Hedin address.',
        html: '<p>' + esc((team[id].name || id)) + ' has no work email on the lockup team list, so they cannot be put on showroom cover. Please add their Hedin address.</p>', ts: Date.now() }, dry);
    }
  }

  /* 2. plan once (tomorrow from 17:30, today from 07:30), then only to fill shifts that were reassigned or are open */
  if (o.feedFailed && !dry && !(today._day || {}).plannedAt) {
    qAdd(rcId('feed', date), { to: 'managers', subject: 'Appointments not read for ' + date, text: 'The appointment times could not be read, so showroom cover for ' + date + ' is planned from the shift calendar alone. Please check the appointments.', html: '<p>The appointment times could not be read, so showroom cover for ' + esc(date) + ' is planned from the shift calendar alone. Please check the appointments.</p>', ts: Date.now() }, dry);
  }
  const dayMark = (today._day || {}).plannedAt;
  const planAt = o.planAt != null ? o.planAt : PLAN_FROM;
  if (!dayMark && planAt > 0 && n.mins < planAt) return { skipped: 'before the plan time' };
  if (!dayMark || Object.keys(existing).length < shifts.length) {
    const available = Array.from(new Set(SR.staffOn(ctx, date).concat((RR.ONE_OFF_IN || {})[date] || [])));
    const plan = RR.planDay({
      shifts, available, team, busy, exclude: ((cfg && cfg.receptionExclude) || []).concat(Object.keys(team).filter(id => !(team[id] || {}).email)), history: historyOf(all, date),
      declined: declined, existing: existing
    });
    for (const s of shifts) {
      const pid = plan.assignments[s.id];
      const prev = (today[s.id] || {}).personId;
      if (!pid || pid === prev) continue;
      const rec = { personId: pid, status: 'assigned', ts: Date.now(), declined: (today[s.id] || {}).declined || {} };
      /* a shift that someone declined earlier today is a reallocation and sends now; any other planned shift is held */
      const reallocated = Object.keys((today[s.id] || {}).declined || {}).length > 0;
      const p = team[pid] || {};
      today[s.id] = Object.assign({}, today[s.id] || {}, rec);
      if (!dry) await db.ref(root + '/reception/' + date + '/' + s.id).update(rec);
      const why = Object.keys((today[s.id] || {}).declined || {}).length ? 'reallocated' : 'planned';
      await logWrite('on_' + date + '_' + s.id + '_' + rec.ts, { kind: 'on', reason: why, personId: pid, date, shift: s.id, from: s.from, to: s.to, ts: rec.ts });
      const mail = RR.coverEmail(firstName(p, pid), s, { date: date });
      const cover = { to: [testExec || p.email], subject: mail.subject, text: mail.text, html: mail.html, ts: Date.now() };
      /* planned shifts are held until 10 mins before the shift starts; a reallocation sends now */
      if (!reallocated) cover.sendAfter = coverSendAfterMs(date, s.from);
      qAdd(rcId(date, s.id, pid), cover, dry);
      markMailed(s.id, pid);
      say('On reception ' + s.from + ' to ' + s.to + ': ' + firstName(p, pid) + (cover.sendAfter ? ' (hold until ' + new Date(cover.sendAfter).toISOString() + ')' : ' (now)'));
    }
    for (const id of plan.short) {
      const s2 = shifts.filter(x => x.id === id)[0];
      if (!s2) continue;
      if (!dry && (today[id] || {}).status !== 'short') {
        const cur = Object.assign({}, today[id] || {}, { personId: null, status: 'short', ts: Date.now() });
        today[id] = cur;
        await db.ref(root + '/reception/' + date + '/' + id).update({ personId: null, status: 'short', ts: cur.ts });
      } else if (dry) today[id] = Object.assign({}, today[id] || {}, { status: 'short' });
      const taken = Object.keys(plan.assignments).map(k => plan.assignments[k]).filter(Boolean);
      const pool2 = RR.poolFor(available, team, []);
      const booked = pool2.filter(pid => RR.clashes(busy, pid, s2) && declined[id].indexOf(pid) < 0);
      const free = pool2.filter(pid => !RR.clashes(busy, pid, s2) && declined[id].indexOf(pid) < 0 && taken.indexOf(pid) < 0);
      const onOther = pool2.filter(pid => !RR.clashes(busy, pid, s2) && declined[id].indexOf(pid) < 0 && taken.indexOf(pid) >= 0);
      const names = {}; Object.keys(team).forEach(k => { names[k] = firstName(team[k], k); });
      const note = RR.shortNote(s2, free, onOther, booked, names);
      qAdd(rcId('short', date, id), { to: 'managers', subject: note.subject, text: note.text,
        html: '<p>' + note.text.split('\n').map(esc).join('</p><p>') + '</p>', ts: Date.now() }, dry);
    }
    if (!dayMark && !dry) await db.ref(root + '/reception/' + date + '/_day').update({ plannedAt: Date.now() });
  }

  /* 2b. ensure every assigned/covering shift has a mode-scoped cover email.
     Lets live recover when an older unscoped rc_<date>_… id was eaten by a test
     send (rcTest). Never re-queues if a non-test send already went out. */
  const notifyMap = o.notify || {};
  for (const s of shifts) {
    const r = today[s.id] || {};
    const pid = r.personId;
    if (!pid || (r.status !== 'assigned' && r.status !== 'covering')) continue;
    if (mailedCover[s.id + '|' + pid]) continue;
    if (coverAlreadySent(notifyMap, date, s.id, pid)) continue;
    const p = team[pid] || {};
    if (!(testExec || p.email)) continue;
    const mail = RR.coverEmail(firstName(p, pid), s, { date: date });
    const cover = { to: [testExec || p.email], subject: mail.subject, text: mail.text, html: mail.html, ts: Date.now(), sendAfter: coverSendAfterMs(date, s.from) };
    if (qAdd(rcId(date, s.id, pid), cover, dry)) { markMailed(s.id, pid); say('Queued cover ' + s.id + ' for ' + firstName(p, pid) + ' (hold until ' + new Date(cover.sendAfter).toISOString() + ')'); }
  }

  /* 3. prune old days */
  if (!dry) {
    const cutoff = LR.addDays(date, -KEEP_DAYS);
    for (const d of Object.keys(all)) if (d < cutoff && d.match(/^\d{4}-\d{2}-\d{2}$/)) await db.ref(root + '/reception/' + d).remove();
  }
  return { planned: !dayMark, date };
}

/* reads what the job needs, then runs. db is the firebase-admin database */
async function load(db, root, shiftsRoot) {
  const g = p => db.ref(p).get().then(s => s.val());
  return {
    reception: await g(root + '/reception'), absences: await g(root + '/absences'),
    shiftCfg: await g(shiftsRoot + '/config'), bh: await g(shiftsRoot + '/bh')
  };
}

/* the notify queue, one write per id: an id already queued (or already sent) is never queued again */
function makeQueue(db, root, existing) {
  const writes = [], added = [];
  return {
    add(id, rec, dry) {
      if (existing[id]) return false;
      existing[id] = rec; added.push(id);
      if (!dry) writes.push(db.ref(root + '/notify/' + id).set(Object.assign({ kind: 'reception' }, rec)));
      return true;
    },
    flush() { return Promise.all(writes); },
    added
  };
}

/* the booking feed: busy start times for the next week. Returns { busy, unknown, day } for one date, or null
   when the feed cannot be read (the plan then uses the shift calendar alone, and the managers are told). */
const APPT_FEED = 'https://hedin-vehicle-lookup.nathangjj.workers.dev/v1/busy-week';
async function readBusy(date, fetchImpl) {
  try {
    const res = await (fetchImpl || fetch)(APPT_FEED, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const j = await res.json();
    const day = (j.days || []).filter(d => d.date === date)[0];
    if (!day) return null;
    return Object.assign({ day: date }, RR.busyIntervals(day));
  } catch (e) { return null; }
}

module.exports = { run, load, makeQueue, readBusy, APPT_FEED, OFFICE_ALERTS_URL, fetchWalkinAlerts, PLAN_FROM, hm, historyOf, rcId, rcMode, coverSendAfterMs, coverAlreadySent, ukTimeToMs, ukMinsFromTs, confirmMinsOf, bankHandBack };
