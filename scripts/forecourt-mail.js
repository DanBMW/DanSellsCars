#!/usr/bin/env node
/* Forecourt morning reminder. Runs from the lockup-emails workflow: lockup-mail.js
 * calls it at the end of every run (it can also run on its own). At or after
 * 08:30 UK on open days (Mon to Sat, not bank holidays or lockup closed days,
 * and not after 11:00 so a stale run never sends late) it emails each exec on
 * forecourt/current/execs whose allocated cars are still 'pending' or
 * 'in-progress'. Cars marked 'inaccessible' or 'done' (sold counts as done) are
 * left out. Exec names are matched to lockup/config/team by name; anyone with
 * no match goes in one email to the managers. Each send is marked under
 * lockup/mail/<date>/forecourt/<exec>, so it goes once a day.
 * Env as lockup-mail.js. FORECOURT_MANAGER_SUMMARY=1 also emails managers a
 * summary (off by default). DRY_RUN=1 prints, sends and writes nothing.
 */
'use strict';
const R = require('../lockup-rota.js');
const BOARD = 'https://dan-sells.co.uk/Forecourt.html';
const DRY = !!process.env.DRY_RUN;
const TEST_EXEC = 'daniel.cane@hedinautomotive.co.uk', TEST_MGR = 'nathan.jobson@hedinautomotive.co.uk';
const FROM = 8 * 60 + 30, UNTIL = 11 * 60;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => String(s || '').trim().toLowerCase().replace(/[\s_]+/g, ' ');
const regKey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function stockMap() {
  let d = null;
  try { d = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../lookup/stock.json'), 'utf8')); } catch (e) {}
  if (!d) { try { d = await (await fetch('https://dan-sells.co.uk/lookup/stock.json')).json(); } catch (e) {} }
  const m = {};
  Object.entries((d && d.cars) || {}).forEach(([k, c]) => { if (c) m[regKey(c.reg || k)] = c; });
  return m;
}

async function run(opts) {
  opts = opts || {};
  const admin = require('firebase-admin');
  const app = opts.app || admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)),
    databaseURL: 'https://forecourt-1b6bc-default-rtdb.europe-west1.firebasedatabase.app'
  }, 'forecourt-mail');
  const db = app && app.database ? app.database() : admin.database();
  try {
    const nowMs = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
    const n = R.london(new Date(nowMs));
    const tag = '[forecourt] ';
    if (n.dow === 0) return console.log(tag + 'Sunday, nothing to send');
    if (n.mins < FROM || n.mins >= UNTIL) return console.log(tag + 'Outside 08:30 to 11:00 UK, nothing due');

    const TEST = (await db.ref('lockup/config/testMode').get()).val() !== false;
    const cfg = (await db.ref('lockup/config').get()).val() || {};
    let bank = {};
    try { const j = await (await fetch('https://www.gov.uk/bank-holidays.json')).json(); j['england-and-wales'].events.forEach(e => { bank[e.date] = e.title; }); } catch (e) { console.log(tag + 'Bank holiday list unavailable'); }
    if (bank[n.date]) return console.log(tag + 'Bank holiday (' + bank[n.date] + ')');
    if ((cfg.holidays || {})[n.date]) return console.log(tag + 'Closed day on the lockup calendar');

    const cur = (await db.ref('forecourt/current').get()).val() || {};
    const vehicles = cur.vehicles || {}, execs = cur.execs || {};
    const mail = (await db.ref('lockup/mail/' + n.date + '/forecourt').get()).val() || {};
    const byName = {};
    Object.values(cfg.team || {}).forEach(p => { if (p && p.email) { byName[norm(p.name)] = p; if (p.fullName) byName[norm(p.fullName)] = p; } });
    const mgrEmails = TEST ? [TEST_MGR] : Object.values(cfg.managers || {}).map(m => m.email).filter(Boolean);
    const stock = await stockMap();
    const tx = DRY ? null : require('nodemailer').createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });

    console.log(tag + Object.keys(execs).length + ' execs on the board');
    const unmatched = [], summary = [];
    for (const [ek, e] of Object.entries(execs)) {
      const name = (e && e.name) || ek.replace(/_/g, ' ');
      const cars = ((e && e.cars) || []).map(k => vehicles[k] ? Object.assign({ key: k }, vehicles[k]) : null).filter(Boolean);
      const open = cars.filter(v => v.status === 'pending' || v.status === 'in-progress');
      const inacc = cars.filter(v => v.status === 'inaccessible').length;
      summary.push(name + ': ' + open.length + ' to check' + (inacc ? ', ' + inacc + ' inaccessible' : ''));
      if (!open.length) { console.log(tag + name + ': nothing open'); continue; }
      const person = byName[norm(name)];
      if (!person) { unmatched.push(name + ' (' + open.length + ' car' + (open.length > 1 ? 's' : '') + ')'); continue; }
      if (mail[ek]) { console.log(tag + name + ': already sent today'); continue; }
      const rows = open.map(v => { const s = stock[regKey(v.key || v.reg)] || {}; return { reg: v.reg || v.key, desc: [s.model, s.colour].filter(Boolean).join(', '), st: v.status === 'in-progress' ? 'In progress' : 'Pending' }; });
      const to = TEST ? [TEST_EXEC] : [person.email];
      const subject = (TEST ? '[TEST] ' : '') + 'Forecourt check: ' + open.length + ' car' + (open.length > 1 ? 's' : '') + ' for you today';
      const text = ['Morning ' + (person.name || name) + ',', '', 'You have ' + open.length + ' car' + (open.length > 1 ? 's' : '') + ' on the forecourt board still to check:', '',
        ...rows.map(r => '  * ' + r.reg + (r.desc ? ' (' + r.desc + ')' : '') + ': ' + r.st), '',
        'If you cannot get to a car, open it on the board and tap "Car is inaccessible".', '', 'Open the board: ' + BOARD, '', 'Hedin BMW Ruxley forecourt'].join('\n');
      const html = '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#12263a">' +
        '<div style="background:#0b1220;color:#fff;border-radius:14px 14px 0 0;padding:18px 20px;font-size:18px;font-weight:800">&#128663; ' + esc(subject) + '</div>' +
        '<div style="border:1px solid #d9e3ee;border-top:0;border-radius:0 0 14px 14px;padding:20px"><p style="margin:0 0 12px">Morning ' + esc(person.name || name) + ',</p>' +
        '<p style="margin:0 0 10px">You have ' + open.length + ' car' + (open.length > 1 ? 's' : '') + ' on the forecourt board still to check:</p>' +
        '<table style="width:100%;border-collapse:collapse;margin:6px 0 16px;font-size:14px">' + rows.map(r => '<tr><td style="padding:8px 6px;border-bottom:1px solid #edf2f7;font-weight:800;white-space:nowrap">' + esc(r.reg) + '</td><td style="padding:8px 6px;border-bottom:1px solid #edf2f7;color:#5f6e7d">' + esc(r.desc) + '</td><td style="padding:8px 6px;border-bottom:1px solid #edf2f7;text-align:right;white-space:nowrap;color:' + (r.st === 'Pending' ? '#5f6e7d' : '#2d6aa8') + ';font-weight:700">' + r.st + '</td></tr>').join('') + '</table>' +
        '<p style="margin:0 0 14px;font-size:13px;color:#5f6e7d">If you cannot get to a car, open it on the board and tap &ldquo;Car is inaccessible&rdquo;.</p>' +
        '<a href="' + BOARD + '" style="display:block;text-align:center;background:#4d94d8;color:#fff;text-decoration:none;font-weight:800;padding:14px;border-radius:12px;font-size:17px">Open the forecourt board</a>' +
        '<p style="color:#6b7a8c;font-size:12px;margin:16px 0 0">Hedin BMW Ruxley forecourt</p></div></div>';
      console.log((DRY ? '[dry] ' : '') + tag + 'Send "' + subject + '" to ' + to.join(', '));
      if (DRY) { console.log(text); continue; }
      await tx.sendMail({ from: { name: process.env.MAIL_FROM_NAME || 'Hedin Used Cars', address: process.env.GMAIL_USER }, to, subject, text, html });
      await db.ref('lockup/mail/' + n.date + '/forecourt/' + ek).set({ ts: Date.now(), to: to.join(', '), cars: open.length });
    }
    const mgrMail = async (key, subject, lines) => {
      if (mail[key] || !mgrEmails.length) return;
      if (TEST) subject = '[TEST] ' + subject;
      const text = [...lines, '', 'Board: ' + BOARD].join('\n');
      console.log((DRY ? '[dry] ' : '') + tag + 'Send "' + subject + '" to ' + mgrEmails.join(', '));
      if (DRY) { console.log(text); return; }
      await tx.sendMail({ from: { name: process.env.MAIL_FROM_NAME || 'Hedin Used Cars', address: process.env.GMAIL_USER }, to: mgrEmails, subject, text, html: '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#12263a">' + lines.map(l => '<p style="margin:0 0 8px">' + esc(l) + '</p>').join('') + '<p><a href="' + BOARD + '">Open the forecourt board</a></p></div>' });
      await db.ref('lockup/mail/' + n.date + '/forecourt/' + key).set({ ts: Date.now(), to: mgrEmails.join(', ') });
    };
    if (unmatched.length) await mgrMail('_unmatched', 'Forecourt reminder: no email for some execs', ['These names on the forecourt board have cars to check but no matching person (with an email) on the lockup Team list, so they were not emailed:', ...unmatched.map(u => '  * ' + u), 'Add them on lockup.html, Team tab, or rename them on the board to match.']);
    if (process.env.FORECOURT_MANAGER_SUMMARY === '1' && summary.length) await mgrMail('_summary', 'Forecourt this morning', summary);
  } finally {
    if (!opts.app && app && app.delete) await app.delete();
  }
}
module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
