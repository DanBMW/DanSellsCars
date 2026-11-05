#!/usr/bin/env node
/* One-off showroom cover launch email. Built for scripts/lockup-mail.js when
 * LAUNCH_EMAIL=1. Sends once to the live team (lockup/config team emails),
 * cc managers, guarded by lockup/mail/showroom-cover-launch. Do not call
 * from the cron path without that env flag.
 */
'use strict';

const SUBJECT = 'New: Showroom cover rota starts today';
const FROM_NAME = 'Will, Nathan and Serge';
const FLAG_PATH = 'lockup/mail/showroom-cover-launch';

const TEXT = [
  'Hi all,',
  '',
  "From today, we're running a simple rota so the showroom is always covered.",
  '',
  'How it works',
  '- Each day is split into shifts (09:00–12:00, 12:00–15:00 and 15:00–18:00, with shorter times on Saturdays), and one person covers the showroom each shift.',
  "- If you're on, you'll get an email. You're assumed to be covering, so there's nothing to do. If you'd like, tap I'm covering and your shift turns green on the team board.",
  "- Not sure if you're on showroom duty? Check the top of the team board.",
  '- If you can\'t do it, tap can\'t cover and pick a reason: can\'t cover right now, not in today, off site, or with a customer. For "can\'t cover right now" or "Other", please add a quick line on why.',
  '- "With a customer" goes straight away with no typing.',
  "- When you can't cover, we're told and the next fair person is put on automatically, so there's no need to chase anyone.",
  "- Today's lockup is now always shown at the bottom of the team board.",
  '',
  'This is a soft launch, so please tell us if anything looks wrong.',
  '',
  'Thanks,',
  'Will, Nathan and Serge'
].join('\n');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function htmlOf(text) {
  const lines = String(text).split('\n');
  const out = [];
  let inList = false;
  const flush = () => { if (inList) { out.push('</ul>'); inList = false; } };
  for (const line of lines) {
    if (line.startsWith('- ')) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + esc(line.slice(2)) + '</li>');
      continue;
    }
    flush();
    if (line === '') { out.push(''); continue; }
    if (line === 'How it works') { out.push('<p><b>' + esc(line) + '</b></p>'); continue; }
    out.push('<p>' + esc(line) + '</p>');
  }
  flush();
  return out.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
}

function build() {
  return { subject: SUBJECT, fromName: FROM_NAME, text: TEXT, html: htmlOf(TEXT), flagPath: FLAG_PATH };
}

/** Collect live team + manager emails from lockup/config (never the test root). */
function recipients(cfg) {
  const team = Object.values((cfg && cfg.team) || {}).filter(t => t && t.active !== false).map(t => t.email).filter(Boolean);
  const managers = Object.values((cfg && cfg.managers) || {}).map(m => m && m.email).filter(Boolean);
  return { to: team, cc: managers };
}

/**
 * Send once. o: { db, transport, dry, log, cfg }.
 * Always reads/writes the live flag under lockup/mail/…, and uses live cfg.team / cfg.managers.
 */
async function maybeSend(o) {
  const say = o.log || console.log;
  const mail = build();
  const { to, cc } = recipients(o.cfg || {});
  if (!to.length) { say('Launch email: no live team emails on lockup/config'); return { sent: false, reason: 'no-team' }; }
  const flag = o.db ? (await o.db.ref(mail.flagPath).get()).val() : null;
  if (flag && flag.sent) { say('Launch email: already sent at ' + (flag.ts || flag.sent)); return { sent: false, reason: 'already' }; }
  say((o.dry ? '[dry] ' : '') + 'Send "' + mail.subject + '" to ' + to.join(', ') + (cc.length ? ' cc ' + cc.join(', ') : ''));
  if (o.dry) { say(mail.text); return { sent: false, reason: 'dry', mail, to, cc }; }
  await o.transport.sendMail({
    from: { name: mail.fromName, address: o.fromAddress },
    to, cc, subject: mail.subject, text: mail.text, html: mail.html
  });
  await o.db.ref(mail.flagPath).set({ sent: true, ts: Date.now(), to: to.join(', '), cc: cc.join(', ') });
  return { sent: true, to, cc };
}

module.exports = { build, recipients, maybeSend, SUBJECT, FROM_NAME, FLAG_PATH, TEXT };
