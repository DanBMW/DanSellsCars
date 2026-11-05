#!/usr/bin/env node
/* Showroom cover practice flush. Reception only, lockupTest only.
 * 1. Prints today's practice shifts, rcTest notify items and receptionLogTest entries.
 * 2. Runs scripts/reception-mail.js for today against lockupTest (handles reallocate / decline / nudge).
 * 3. Sends ONLY lockupTest/notify items with rcTest:true, to Dan (staff) or Nathan (managers), [TEST] subjects.
 * Never sends lockup reminders, never reads or writes live lockup/notify. Env: FIREBASE_SA, GMAIL_USER, GMAIL_APP_PASSWORD, DRY_RUN.
 */
'use strict';
const admin = require('firebase-admin');
const RR = require('../reception-rota.js');
const R = require('../lockup-rota.js');
const RC = require('./reception-mail.js');
const DRY = !!process.env.DRY_RUN;
const EXEC = 'daniel.cane@hedinautomotive.co.uk', MGR = 'nathan.jobson@hedinautomotive.co.uk';
const ROOT = 'lockupTest';
async function main() {
  if (RR.RECEPTION_ROOT !== ROOT) throw new Error('Refusing: RECEPTION_ROOT is ' + RR.RECEPTION_ROOT);
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)),
    databaseURL: 'https://forecourt-1b6bc-default-rtdb.europe-west1.firebasedatabase.app' });
  const db = admin.database(), g = p => db.ref(p).get().then(s => s.val());
  const n = R.london(new Date());
  console.log('UK now', n.date, Math.floor(n.mins / 60) + ':' + String(n.mins % 60).padStart(2, '0'), DRY ? '(dry)' : '');
  const day = (await g(ROOT + '/reception/' + n.date)) || {};
  for (const s of ['am', 'mid', 'pm']) { const r = day[s] || {};
    console.log('BEFORE', s, JSON.stringify({ personId: r.personId, status: r.status, reallocate: r.reallocate ? { ts: r.reallocate.ts, by: r.reallocate.by, text: r.reallocate.text } : null, handled: r.reallocateHandledTs, declined: r.declined })); }
  const logBefore = (await g(RR.RECEPTION_LOG)) || {};
  Object.keys(logBefore).filter(k => k.includes(n.date)).forEach(k => console.log('LOG', k, logBefore[k].kind, logBefore[k].personId));
  const live = (await g('lockup/config')) || {}, tcfg = (await g(ROOT + '/config')) || {};
  const cfg = Object.keys(tcfg.team || {}).length ? tcfg : live;
  const rc = await RC.load(db, ROOT, 'shiftsTest');
  const rq = RC.makeQueue(db, ROOT, (await g(ROOT + '/notify')) || {});
  const res = await RC.run({ db, root: ROOT, logRoot: RR.RECEPTION_LOG, n, dry: DRY, team: cfg.team || {}, managers: cfg.managers || {}, cfg,
    testExec: EXEC, queueAdd: (id, rec, d) => rq.add(id, rec, d), log: console.log, date: n.date, planAt: 0,
    reception: rc.reception, absences: (await g(ROOT + '/absences')) || {}, shiftCfg: rc.shiftCfg, bh: rc.bh, holidays: cfg.holidays || {}, closed: {} });
  await rq.flush();
  console.log('Showroom cover run', JSON.stringify(res), 'queued', rq.added.join(', ') || 'none');
  const after = (await g(ROOT + '/reception/' + n.date)) || {};
  for (const s of ['am', 'mid', 'pm']) { const r = after[s] || {}; console.log('AFTER', s, r.personId || '-', r.status || '-'); }
  const q = (await g(ROOT + '/notify')) || {};
  const tx = DRY ? null : require('nodemailer').createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  let sent = 0;
  for (const id of Object.keys(q).sort((a, b) => (q[a].ts || 0) - (q[b].ts || 0))) {
    const it = q[id];
    if (!it || it.sent || it.rcTest !== true) continue;
    const to = it.to === 'managers' ? [MGR] : [EXEC];
    const subject = '[TEST] ' + it.subject;
    console.log((DRY ? '[dry] ' : '') + 'Send "' + subject + '" to ' + to.join(', ') + ' (' + id + ')');
    if (DRY) continue;
    await tx.sendMail({ from: { name: 'Hedin Used Cars', address: process.env.GMAIL_USER }, to, subject, text: it.text || '', html: it.html || '<p>' + (it.text || '') + '</p>' });
    await db.ref(ROOT + '/notify/' + id + '/sent').set(Date.now()); sent++;
  }
  console.log('Sent', sent);
  await admin.app().delete();
}
main().catch(e => { console.error(e && e.message); process.exit(1); });
