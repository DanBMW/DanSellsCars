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
  const say = log || console.log;
  const logRoot = o.logRoot || 'receptionLog';
  /* the management log (skips, absence tags, and every shift someone was put on): admin writes only */
  const logWrite = async (key, entry) => { if (!dry) await db.ref(logRoot + '/' + key).set(entry); };
  const date = n.date, dow = SR.dowOf(date);
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
    /* a manager tagged someone absent on this shift: log it, keep them off the shift, free it if they were on it */
    if (r.absent && r.absent.ts !== r.absentHandledTs) {
      const ab = r.absent, who = firstName(team[ab.personId] || (managers || {})[ab.personId], ab.personId);
      await logWrite('absent_' + date + '_' + s.id + '_' + ab.ts, { kind: 'absent', personId: ab.personId, date, shift: s.id, from: s.from, to: s.to, ts: ab.ts, by: ab.by || '' });
      const dm = Object.assign({}, r.declined || {}); if (ab.personId) dm[ab.personId] = true;
      const change = Object.assign({ declined: dm, absentHandledTs: ab.ts }, r.personId === ab.personId ? { personId: null, status: 'open' } : {});
      today[s.id] = Object.assign({}, r, change);
      if (!dry) await db.ref(root + '/reception/' + date + '/' + s.id).update(change);
      say('Tagged absent on ' + s.id + ': ' + who);
      r = today[s.id];
    }
    if (r.status === 'declined' && r.ts !== r.handledTs) {
      const who = firstName(team[r.personId] || (managers || {})[r.personId], r.personId);
      const note = RR.managerNote(who, s, r.reason || 'Cannot cover', r.reasonText || '');
      await logWrite('skip_' + date + '_' + s.id + '_' + r.ts, { kind: 'skip', personId: r.personId, date, shift: s.id, from: s.from, to: s.to, ts: r.ts, reason: r.reason || '', reasonText: r.reasonText || '' });
      queueAdd('rc_decl_' + date + '_' + s.id + '_' + r.ts, { to: 'managers', subject: note.subject, text: note.text, html: '<p>' + esc(note.text) + '</p>', ts: Date.now() }, dry);
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

  /* everyone on the team needs a work email to be put on showroom cover; tell the managers once about anyone who has none */
  for (const id of Object.keys(team)) {
    if (team[id] && team[id].active !== false && !team[id].email) {
      queueAdd('rc_noemail_' + id, { to: 'managers', subject: (team[id].name || id) + ' has no work email',
        text: (team[id].name || id) + ' has no work email on the lockup team list, so they cannot be put on showroom cover. Please add their Hedin address.',
        html: '<p>' + esc((team[id].name || id)) + ' has no work email on the lockup team list, so they cannot be put on showroom cover. Please add their Hedin address.</p>', ts: Date.now() }, dry);
    }
  }

  /* 2. plan once after 07:30, then only to fill shifts that were reassigned or are open */
  const dayMark = (today._day || {}).plannedAt;
  if (!dayMark && n.mins < PLAN_FROM) return { skipped: 'before 07:30' };
  if (!dayMark || Object.keys(existing).length < shifts.length) {
    const available = SR.staffOn(ctx, date);
    const plan = RR.planDay({
      shifts, available, team, exclude: ((cfg && cfg.receptionExclude) || []).concat(Object.keys(team).filter(id => !(team[id] || {}).email)), history: historyOf(all, date),
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
      queueAdd('rc_' + date + '_' + s.id + '_' + pid, { to: [testExec || p.email], subject: mail.subject, text: mail.text, html: '<p>' + esc(mail.text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>', ts: Date.now() }, dry);
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
      queueAdd('rc_short_' + date + '_' + id, { to: 'managers', subject: 'Showroom not covered ' + s2.from + ' to ' + s2.to,
        text: 'Showroom not covered ' + s2.from + ' to ' + s2.to + '. Nobody from the sales team is free to cover the showroom. Please arrange cover.',
        html: '<p>Showroom not covered ' + esc(s2.from) + ' to ' + esc(s2.to) + '.</p><p>Nobody from the sales team is free to cover the showroom. Please arrange cover.</p>', ts: Date.now() }, dry);
    }
    if (!dayMark && !dry) await db.ref(root + '/reception/' + date + '/_day').set({ plannedAt: Date.now() });
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

module.exports = { run, load, makeQueue, PLAN_FROM, hm, historyOf };
