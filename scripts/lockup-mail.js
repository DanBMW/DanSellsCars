#!/usr/bin/env node
/* Lockup emails, run by the lockup-emails GitHub Action every 15 minutes
 * on weekday and Saturday afternoons. It works out UK time itself, so the
 * cron covers both BST and GMT and this decides what is due:
 *   5pm Mon to Fri  reminder to both people on the rota (4pm Saturday: managers)
 *   6:15pm          nudge to tonight's people if still unsigned
 *   6:30pm          managers, if nobody has signed, or with any issues noted
 * It also sends any queued manager notifications (lockup/notify, written by
 * the page for absences, cover and holidays) on every run, marking each sent.
 * Each send is marked under lockup/mail/<date>/<kind>, so a repeat or late run
 * never sends twice. If this week's rota is missing it generates it with the
 * same lockup-rota.js the page uses.
 *
 * Env: FIREBASE_SA (service account JSON), GMAIL_USER, GMAIL_APP_PASSWORD,
 *      optional MAIL_FROM_NAME, DRY_RUN=1 (print, send nothing), NOW (ISO, for tests).
 * Needs: npm i firebase-admin nodemailer
 */
'use strict';
const R = require('../lockup-rota.js');
const SITE = 'https://dan-sells.co.uk/lockup.html';
const DRY = !!process.env.DRY_RUN;
/* Test mode: lockup/config/testMode (missing = on). Everything is read from and
   written to lockupTest/, staff emails go to TEST_EXEC, manager emails only to
   TEST_MGR, and subjects start [TEST]. Real lockup/ is not touched. */
const TEST_EXEC = 'daniel.cane@hedinautomotive.co.uk', TEST_MGR = 'nathan.jobson@hedinautomotive.co.uk';
let ROOT = 'lockup', TEST = false;

async function main() {
  const admin = require('firebase-admin');
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)),
    databaseURL: 'https://forecourt-1b6bc-default-rtdb.europe-west1.firebasedatabase.app'
  });
  const db = admin.database();
  const nowMs = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
  const n = R.london(new Date(nowMs));
  console.log('UK now', n.date, n.dow, Math.floor(n.mins / 60) + ':' + String(n.mins % 60).padStart(2, '0'));

  TEST = (await db.ref('lockup/config/testMode').get()).val() !== false;
  ROOT = TEST ? 'lockupTest' : 'lockup';
  console.log(TEST ? 'TEST MODE: using lockupTest/, emails to ' + TEST_EXEC + ' and ' + TEST_MGR : 'Real mode');
  let cfg = (await db.ref(ROOT + '/config').get()).val();
  if (TEST && (!cfg || !cfg.seeded)) { cfg = Object.assign(R.defaults(), { seeded: Date.now() }); if (!DRY) await db.ref(ROOT + '/config').set(cfg); console.log('Seeded test config'); }
  if (!cfg) { console.log('No lockup config yet (open lockup.html once).'); return done(admin); }

  let bank = {};
  try {
    const j = await (await fetch('https://www.gov.uk/bank-holidays.json')).json();
    j['england-and-wales'].events.forEach(e => { bank[e.date] = { label: e.title }; });
  } catch (e) { console.log('Bank holidays unavailable, carrying on'); }
  const hol = Object.assign({}, bank, cfg.holidays || {});

  const weeks = (await db.ref(ROOT + '/weeks').get()).val() || {};
  for (const w of [n.week, R.shiftWeek(n.week, 1)]) {
    if (!R.isPaired(weeks[w])) { const prior = Object.assign({}, weeks); delete prior[w]; weeks[w] = R.generate(w, cfg.team || {}, prior); if (!DRY) await db.ref(ROOT + '/weeks/' + w).set(weeks[w]); console.log('Generated rota', w, weeks[w].days); }
  }

  /* absences: seed any missing, then re-pair today's and later unsigned nights */
  const team0 = cfg.team || {}, nm = id => (team0[id] || (cfg.managers || {})[id] || {}).name || id;
  const absences = (await db.ref(ROOT + '/absences').get()).val() || {};
  const seededNow = [];
  for (const id of Object.keys(R.SEED_ABSENCES)) {
    if (absences[id]) continue;
    seededNow.push(id);
    absences[id] = Object.assign({ ts: Date.now() }, R.SEED_ABSENCES[id]);
    if (!DRY) await db.ref(ROOT + '/absences/' + id).set(absences[id]);
    console.log('Seeded absence', id);
  }
  const allRecs = (await db.ref(ROOT + '/records').get()).val() || {};
  const signed = {}; Object.keys(allRecs).forEach(d => { signed[d] = 1; });
  const changes = R.applyAbsences(weeks, team0, absences, n.date, signed);
  for (const c of changes) {
    console.log('Re-paired', c.date, nm(c.out), '->', c.in ? nm(c.in) : 'nobody', 'now', c.pair.map(nm).join(' and '));
    if (!DRY) await db.ref(ROOT + '/weeks/' + c.week + '/days/' + c.dow).set(c.pair);
  }

  /* queued notifications from lockup.html: absences, cover, holidays */
  const mgrList = TEST ? [TEST_MGR] : Object.values(cfg.managers || {}).map(m => m.email).filter(Boolean);
  const queue = (await db.ref(ROOT + '/notify').get()).val() || {};
  for (const id of seededNow) {
    if (queue[id]) continue;
    const a = absences[id], ch = changes.filter(c => c.out === a.personId && c.date >= a.from && c.date <= a.to);
    queue[id] = { kind: 'absence', ts: Date.now(), subject: nm(a.personId) + ' off ' + a.from + ', lockup re-paired',
      lines: [a.note || nm(a.personId) + ' is away.'].concat(ch.map(c => c.date + ': ' + nm(c.out) + ' out, ' + (c.in ? nm(c.in) + ' in' : 'nobody free') + '. Now on: ' + c.pair.map(nm).join(' and '))) };
    if (!DRY) await db.ref(ROOT + '/notify/' + id).set(queue[id]);
  }
  /* A queued entry can also carry: sendAfter (ms, held until then), to
     ('team' | 'managers' | [emails]), html + text (sent as is), fromName. */
  const teamList = TEST ? [TEST_EXEC] : Object.values(cfg.team || {}).filter(t => t.active !== false).map(t => t.email).filter(Boolean);
  /* lockupPrivate/notify is the same queue but not publicly readable (the
     database rules give it no read), for one off emails that carry the
     manager PIN. Only the Action's service account can read or write it. */
  const paths = {};
  Object.keys(queue).forEach(id => { paths[id] = ROOT + '/notify/' + id; });
  if (!TEST) {
    const priv = (await db.ref('lockupPrivate/notify').get()).val() || {};
    Object.keys(priv).forEach(id => { queue[id] = priv[id]; paths[id] = 'lockupPrivate/notify/' + id; });
  }
  for (const id of Object.keys(queue).sort((a, b) => (queue[a].ts || 0) - (queue[b].ts || 0))) {
    const q = queue[id];
    if (!q || q.sent) continue;
    if (q.sendAfter && nowMs < q.sendAfter) { console.log('Holding', id, 'until', new Date(q.sendAfter).toISOString()); continue; }
    const to = q.to === 'team' ? teamList : Array.isArray(q.to) ? (TEST ? [TEST_EXEC] : q.to) : mgrList;
    if (!to.length) { console.log('Notification', id, 'waiting, no recipients set'); continue; }
    if (q.html) {
      const subject = (TEST ? '[TEST] ' : '') + q.subject;
      console.log((DRY ? '[dry] ' : '') + 'Send "' + subject + '" to ' + to.join(', '));
      if (DRY) console.log(q.text || '');
      else await transport().sendMail({ from: { name: q.fromName || process.env.MAIL_FROM_NAME || 'Hedin Used Cars', address: process.env.GMAIL_USER }, to, subject, text: q.text || '', html: q.html });
    } else {
      const lines = Array.isArray(q.lines) ? q.lines : Object.values(q.lines || {});
      await send(transport(), to, q.subject, 'Hi all,', lines.slice(0, 1), lines.slice(1), 'See the rota');
    }
    if (!DRY) await db.ref((paths[id] || ROOT + '/notify/' + id) + '/sent').set(Date.now());
  }

  const on = R.onFor(n.date, weeks[n.week], hol);
  if (on.kind === 'closed') { console.log('Closed today'); return done(admin); }

  const recsObj = (await db.ref(ROOT + '/records/' + n.date).get()).val() || {};
  const recs = Object.values(recsObj).sort((a, b) => a.ts - b.ts);
  const mail = (await db.ref(ROOT + '/mail/' + n.date).get()).val() || {};
  const team = cfg.team || {}, mgrs = cfg.managers || {};
  const mgrEmails = TEST ? [TEST_MGR] : Object.values(mgrs).map(m => m.email).filter(Boolean);
  const people = on.kind === 'staff' ? on.ids.map(id => team[id]).filter(Boolean) : [];
  const names = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : (l[0] || '');
  const dayName = R.DAY_NAMES[n.dow];
  const remindAt = on.kind === 'managers' ? R.REMIND_SAT_MINS : R.REMIND_MINS;
  const list = Object.keys(cfg.checklist || {}).filter(k => cfg.checklist[k].active !== false)
    .sort((a, b) => (cfg.checklist[a].order || 0) - (cfg.checklist[b].order || 0)).map(k => cfg.checklist[k].label);
  const tx = transport();
  void tx;

  /* reminder: due from 5pm (4pm Sat) until 9pm, skipped once signed */
  let remindedNow = false;
  if (n.mins >= remindAt && n.mins < 21 * 60 && !mail.remind && !recs.length) {
    let to, hi;
    if (on.kind === 'managers') { to = mgrEmails; hi = 'Hi all'; }
    else if (people.length) { to = TEST ? [TEST_EXEC] : people.map(p => p.email).filter(Boolean); hi = 'Hi ' + names(people.map(p => p.name)); }
    else { to = mgrEmails; hi = 'Hi all, nobody is on the lockup rota tonight'; }
    if (to.length) {
      await send(tx, to, (on.kind === 'managers' ? 'Managers lockup tonight' : people.length > 1 ? 'Lockup tonight: ' + names(people.map(p => p.name)) : "It's your lockup tonight") + ', ' + dayName,
        hi + ',', [
          on.kind === 'managers' ? "It's Saturday, so it's managers' lockup tonight." : people.length > 1 ? "You're on lockup together tonight. Either of you can start the checklist." : people.length ? "You're on lockup tonight." : 'Please pick someone to lock up.',
          'Tick each one off on your phone as you go, then sign:'
        ], list, 'Start lockup');
      await mark(db, n.date, 'remind', to); remindedNow = true;
    } else console.log('Reminder due but no email address set');
  }

  /* 6:15pm nudge to tonight's people if still unsigned. Only in the window
     before 6:30pm, so a late run that is already due the manager email skips
     it, and never in the same run as the first reminder. */
  if (n.mins >= R.NUDGE_MINS && n.mins < R.ESCALATE_MINS && !mail.nudge && !recs.length && !remindedNow) {
    const to = on.kind === 'managers' ? mgrEmails : people.length ? (TEST ? [TEST_EXEC] : people.map(p => p.email).filter(Boolean)) : [];
    if (to.length) {
      const hi = on.kind === 'managers' ? 'Hi all' : 'Hi ' + names(people.map(p => p.name));
      await send(tx, to, 'Lockup not signed yet, ' + dayName, hi + ',',
        ['Just a nudge: tonight\u2019s lockup hasn\u2019t been signed off yet.', 'If it\u2019s done, tick it off and sign on your phone in a minute. The managers get an email at 6:30pm if it\u2019s still open.'], [], 'Sign off lockup');
      await mark(db, n.date, 'nudge', to);
    } else console.log('Nudge due but no email address set');
  }

  /* 6:30pm: not signed, or signed with issues */
  if (n.mins >= R.ESCALATE_MINS && !mail.escalate && mgrEmails.length) {
    const who = on.kind === 'managers' ? 'managers' : people.length ? names(people.map(p => p.fullName || p.name)) : 'nobody on the rota';
    if (!recs.length) {
      await send(tx, mgrEmails, 'Lockup not signed, ' + dayName, 'Hi all,',
        ['Tonight\u2019s lockup hasn\u2019t been signed off yet.', 'On the rota: ' + who + '.', 'Please check the building is secure.'], list, 'Open lockup');
      await mark(db, n.date, 'escalate', mgrEmails);
    } else {
      const issues = [];
      recs.forEach(r => Object.values(r.items || {}).forEach(i => { if (!i.done || i.note) issues.push(i.label + (i.done ? '' : ' (not done)') + (i.note ? ': ' + i.note : '') + (i.photo ? ' [photo on record]' : '')); }));
      const r = recs[0];
      if (issues.length) {
        await send(tx, mgrEmails, 'Lockup signed with notes, ' + dayName, 'Hi all,',
          ['Lockup was signed by ' + r.signedByName + (r.presentNames && r.presentNames !== r.signedByName ? ' (there: ' + r.presentNames + ')' : '') + ' at ' + new Date(r.ts).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) + (r.coveringFor ? ', covering for ' + names(r.coveringFor.split(',').map(id => (team[id] || {}).name || id)) : '') + '.', 'Notes from tonight:'], issues, 'See the record');
      } else console.log('Signed, nothing to report');
      await mark(db, n.date, 'escalate', issues.length ? mgrEmails : []);
    }
  }
  return done(admin);
}

function transport() {
  if (DRY) return null;
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function send(tx, to, subject, hi, lines, bullets, cta) {
  if (TEST) subject = '[TEST] ' + subject;
  const text = [hi, '', ...lines, '', ...bullets.map(b => '  * ' + b), '', cta + ': ' + SITE, '', 'Hedin BMW Ruxley lockup'].join('\n');
  const html = '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#12263a">' +
    '<div style="background:#0b1220;color:#fff;border-radius:14px 14px 0 0;padding:18px 20px;font-size:18px;font-weight:800">&#128273; ' + esc(subject) + '</div>' +
    '<div style="border:1px solid #d9e3ee;border-top:0;border-radius:0 0 14px 14px;padding:20px"><p style="margin:0 0 12px">' + esc(hi) + '</p>' +
    lines.map(l => '<p style="margin:0 0 10px">' + esc(l) + '</p>').join('') +
    (bullets.length ? '<ul style="padding-left:18px;margin:8px 0 18px">' : '<div style="height:8px"></div>') + bullets.map(b => '<li style="margin:4px 0">' + esc(b) + '</li>').join('') + (bullets.length ? '</ul>' : '') +
    '<a href="' + SITE + '" style="display:block;text-align:center;background:#4d94d8;color:#fff;text-decoration:none;font-weight:800;padding:14px;border-radius:12px;font-size:17px">' + esc(cta) + '</a>' +
    '<p style="color:#6b7a8c;font-size:12px;margin:16px 0 0">Hedin BMW Ruxley lockup</p></div></div>';
  console.log((DRY ? '[dry] ' : '') + 'Send "' + subject + '" to ' + to.join(', '));
  if (DRY) { console.log(text); return; }
  await tx.sendMail({ from: { name: process.env.MAIL_FROM_NAME || 'Hedin Used Cars', address: process.env.GMAIL_USER }, to, subject, text, html });
}
async function mark(db, date, kind, to) {
  if (DRY) return;
  await db.ref(ROOT + '/mail/' + date + '/' + kind).set({ ts: Date.now(), to: to.join(', ') });
}
function done(admin) { return admin.app().delete(); }

main().catch(e => { console.error(e); process.exit(1); });
