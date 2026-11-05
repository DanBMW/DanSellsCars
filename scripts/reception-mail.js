/* scripts/reception-mail.js - showroom cover, run from scripts/lockup-mail.js
 * (every 15 minutes, Monday to Saturday, by the lockup-emails Action).
 *
 *   After 07:30 on each open day: plan the three shifts (reception-rota.js) from
 *   the sales team's availability (shift calendar), write the plan to
 *   <root>/reception/<date>/<shift>, and queue one email per person:
 *   "You are on showroom cover. Please cover showroom until HH:MM."
 *   A person who answers "cannot cover" on reception.html is recorded there as
 *   declined. The next run queues a manager note with their reason, takes them
 *   off that shift and puts the next fair person on, emailing them the same way.
 *
 *   Email ids are fixed (rc_<date>_<shift>_<person>), so each email is queued
 *   once, however many runs there are. Old days are pruned after 14 days.
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
  const qAdd = (id, rec, dry) => queueAdd(id, Object.assign({}, rec, flag, { subject: '[Beta] ' + rec.subject }), dry);
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

  /* 1. a decline: note it to the managers once (keyed by the decline's own time),
     remember the person as declined for that shift, and free the shift */
  const existing = {};
  for (const s of shifts) {
    let r = today[s.id] || {};
    /* a manager reallocated the shift: the person on it is logged as a skip, and the shift is freed */
    if (r.reallocate && r.reallocate.ts !== r.reallocateHandledTs) {
      const rl = r.reallocate, pid = r.personId;
      const dm = Object.assign({}, r.declined || {});
      if (pid) {
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
      qAdd('rc_reply_' + date + '_' + s.id + '_' + rp.ts, { to: 'managers', subject: who + (rp.status === 'here' ? ' is here' : ' is not in') + ' (' + s.from + ' to ' + s.to + ')', text: line, html: '<p>' + esc(line) + '</p>', ts: Date.now() }, dry);
    }
    /* a manager nudged someone who is not in the showroom: log it and email them. They stay on the shift. */
    if (r.absent && r.absent.ts !== r.absentHandledTs) {
      const ab = r.absent, ap = team[ab.personId] || {};
      await logWrite('absent_' + date + '_' + s.id + '_' + ab.ts, { kind: 'absent', personId: ab.personId, date, shift: s.id, from: s.from, to: s.to, ts: ab.ts, by: ab.by || '' });
      if (ap.email) {
        const first = firstName(ap, ab.personId);
        const line = 'Hi ' + first + ', you are not in the showroom. You are on showroom cover ' + s.from + ' to ' + s.to + '.';
        qAdd('rc_absent_' + date + '_' + s.id + '_' + ab.ts, { to: [testExec || ap.email], subject: 'Where are you? 👀',
          text: line + '\n\nWhere are you? If you are here, tell us: I am here. If you cannot be in, update the reason.\n\nhttps://dan-sells.co.uk/reception.html',
          html: '<p>' + esc(line) + '</p><p>Where are you? 👀 If you are here, tell us: <b>I am here</b>. If you cannot be in, update the reason.</p><p><a href="https://dan-sells.co.uk/reception.html">Open showroom cover</a></p>', ts: Date.now() }, dry);
      }
      if (!dry) await db.ref(root + '/reception/' + date + '/' + s.id).update({ absentHandledTs: ab.ts });
      today[s.id] = Object.assign({}, r, { absentHandledTs: ab.ts });
      say('Nudged ' + firstName(ap, ab.personId) + ' on ' + s.id);
      r = today[s.id];
    }
    if (r.status === 'declined' && r.ts !== r.handledTs) {
      const who = firstName(team[r.personId] || (managers || {})[r.personId], r.personId);
      const note = RR.managerNote(who, s, r.reason || 'Cannot cover', r.reasonText || '');
      await logWrite('skip_' + date + '_' + s.id + '_' + r.ts, { kind: 'skip', personId: r.personId, date, shift: s.id, from: s.from, to: s.to, ts: r.ts, reason: r.reason || '', reasonText: r.reasonText || '' });
      qAdd('rc_decl_' + date + '_' + s.id + '_' + r.ts, { to: 'managers', subject: note.subject, text: note.text, html: '<p>' + esc(note.text) + '</p>', ts: Date.now() }, dry);
      const dm = Object.assign({}, r.declined || {});
      if (r.personId) dm[r.personId] = true;
      const freed = { personId: null, status: 'open', declined: dm, handledTs: r.ts };
      today[s.id] = Object.assign({}, r, freed);
      if (!dry) await db.ref(root + '/reception/' + date + '/' + s.id).update(freed);
      if (endMins(s) > n.mins) say('Reassigning ' + s.id + ' after ' + who + ' declined');
      continue;
    }
    if (r.personId && r.status !== 'declined') existing[s.id] = r.personId;
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
      qAdd('rc_noemail_' + id, { to: 'managers', subject: (team[id].name || id) + ' has no work email',
        text: (team[id].name || id) + ' has no work email on the lockup team list, so they cannot be put on showroom cover. Please add their Hedin address.',
        html: '<p>' + esc((team[id].name || id)) + ' has no work email on the lockup team list, so they cannot be put on showroom cover. Please add their Hedin address.</p>', ts: Date.now() }, dry);
    }
  }

  /* 2. plan once (tomorrow from 17:30, today from 07:30), then only to fill shifts that were reassigned or are open */
  if (o.feedFailed && !dry && !(today._day || {}).plannedAt) {
    qAdd('rc_feed_' + date, { to: 'managers', subject: 'Appointments not read for ' + date, text: 'The appointment times could not be read, so showroom cover for ' + date + ' is planned from the shift calendar alone. Please check the appointments.', html: '<p>The appointment times could not be read, so showroom cover for ' + esc(date) + ' is planned from the shift calendar alone. Please check the appointments.</p>', ts: Date.now() }, dry);
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
      const p = team[pid] || {};
      today[s.id] = Object.assign({}, today[s.id] || {}, rec);
      if (!dry) await db.ref(root + '/reception/' + date + '/' + s.id).update(rec);
      await logWrite('on_' + date + '_' + s.id + '_' + rec.ts, { kind: 'on', personId: pid, date, shift: s.id, from: s.from, to: s.to, ts: rec.ts });
      const mail = RR.coverEmail(firstName(p, pid), s);
      qAdd('rc_' + date + '_' + s.id + '_' + pid, { to: [testExec || p.email], subject: mail.subject, text: mail.text, html: '<p>' + esc(mail.text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>', ts: Date.now() }, dry);
      say('On reception ' + s.from + ' to ' + s.to + ': ' + firstName(p, pid));
    }
    for (const id of plan.short) {
      const s2 = shifts.filter(x => x.id === id)[0];
      if (!s2) continue;
      if (!dry && (today[id] || {}).status !== 'short') {
        const cur = Object.assign({}, today[id] || {}, { personId: null, status: 'short', ts: Date.now() });
        today[id] = cur;
        await db.ref(root + '/reception/' + date + '/' + id).update({ personId: null, status: 'short', ts: cur.ts });
      } else if (dry) today[id] = Object.assign({}, today[id] || {}, { status: 'short' });
      qAdd('rc_short_' + date + '_' + id, { to: 'managers', subject: 'Showroom not covered ' + s2.from + ' to ' + s2.to,
        text: 'Showroom not covered ' + s2.from + ' to ' + s2.to + '. Nobody from the sales team is free to cover the showroom. Please arrange cover.',
        html: '<p>Showroom not covered ' + esc(s2.from) + ' to ' + esc(s2.to) + '.</p><p>Nobody from the sales team is free to cover the showroom. Please arrange cover.</p>', ts: Date.now() }, dry);
    }
    if (!dayMark && !dry) await db.ref(root + '/reception/' + date + '/_day').update({ plannedAt: Date.now() });
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

module.exports = { run, load, makeQueue, readBusy, APPT_FEED, PLAN_FROM, hm, historyOf };
