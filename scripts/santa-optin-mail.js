/* Build the Secret Santa opt in / opt out emails.
 * Tokens are unguessable capability URLs. This module never writes to RTDB
 * and never queues mail. Run:
 *   node scripts/santa-optin-mail.js --write /workspace/santa-optin-mail.json
 */
'use strict';
const crypto = require('crypto');

const APP = 'https://dan-sells.co.uk/santa/';
const OPTIN = 'https://dan-sells.co.uk/santa/optin.html';
const DEADLINE = 'Saturday 14 November';
const MEAL = 'Presents are exchanged at the team meal on Saturday 5 December. If you\'re not coming to the meal, pop your gift in the bag and your presents will be given to you before you leave that day.';
const SUBJECT = '\uD83C\uDF85 Ruxley Secret Santa: are you in?';
const FROM = 'The Ruxley elves';

const POEM_LINES = [
  'At Hedin Ruxley the lights are aglow,',
  'BMWs rest under a blanket of snow.',
  'The showroom is sparkling, the kettle is on,',
  'The elves have a sack and the fun has begun.',
  "Tap I'm in if you're joining this year,",
  "The elves will reveal the names after the lists appear."
];

/* The 12 people on the Ruxley Team list, plus the five extras Dan asked for.
 * Tina Graham and Lisa Debono addresses were confirmed by Dan on 10 November 2026.
 * Dan is included so he can opt in like everyone else. */
const RECIPIENTS = [
  { name: 'Carl Hadwin', email: 'carl.hadwin@hedinautomotive.co.uk', group: 'team' },
  { name: 'Chloe Wust', email: 'chloe.wust@hedinautomotive.co.uk', group: 'team' },
  { name: 'Clive Ankomah', email: 'clive.ankomah@hedinautomotive.co.uk', group: 'team' },
  { name: 'Daniel Cane', email: 'daniel.cane@hedinautomotive.co.uk', group: 'team', note: 'Dan himself is included so he can opt in like everyone else.' },
  { name: 'Danny Willis', email: 'danny.willis@hedinautomotive.co.uk', group: 'team' },
  { name: 'Karis Johnson', email: 'karis.johnson@hedinautomotive.co.uk', group: 'team' },
  { name: 'Molly Brown', email: 'molly.brown@hedinautomotive.co.uk', group: 'team' },
  { name: 'Mon Singh', email: 'mon.singh@hedinautomotive.co.uk', group: 'team' },
  { name: 'Tomi Adelaja', email: 'tomiwa.adelaja@hedinautomotive.co.uk', group: 'team' },
  { name: 'Nathan Jobson', email: 'nathan.jobson@hedinautomotive.co.uk', group: 'team' },
  { name: 'Sergio Garaguso', email: 'sergio.garaguso@hedinautomotive.co.uk', group: 'team' },
  { name: 'Will Potter', email: 'will.potter@hedinautomotive.co.uk', group: 'team' },
  { name: 'Tina Graham', email: 'tina.graham@hedinautomotive.co.uk', group: 'extra' },
  { name: 'Lisa Debono', email: 'lisa.debono@hedinautomotive.co.uk', group: 'extra' },
  { name: 'Elvinas Urbonas', email: 'elvinas.urbonas@hedinautomotive.co.uk', group: 'extra' },
  { name: 'Faith Marcus', email: 'faith.marcus@hedinautomotive.co.uk', group: 'extra' },
  { name: 'Fleur Andrews', email: 'fleur.andrews@hedinautomotive.co.uk', group: 'extra' }
];

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function first(name) { return String(name || '').trim().split(' ')[0] || 'there'; }
function token() { return crypto.randomBytes(24).toString('base64url'); }
function link(t, c) { return OPTIN + '?t=' + encodeURIComponent(t) + '&c=' + c; }
function keyOf(email) { return String(email || '').trim().toLowerCase().split('.').join(','); }

function poemText() { return POEM_LINES.join('\n'); }
function poemHtml() {
  return '<div style="margin:0 0 18px;padding:14px 16px;background:#fff;border-left:4px solid #c8102e;border-radius:0 12px 12px 0;font-family:Georgia,serif;font-style:italic;color:#5a2a1a;line-height:1.55;font-size:16px">' +
    POEM_LINES.map(l => esc(l)).join('<br>') + '</div>';
}

function visibleHasDash(s) {
  return /[\u2013\u2014]| - /.test(s) || /--/.test(s);
}

function makeMail(person, tok, extras) {
  extras = extras || {};
  const firstName = first(person.name);
  const inUrl = link(tok, 'in');
  const outUrl = link(tok, 'out');
  const openUrl = OPTIN + '?t=' + encodeURIComponent(tok);
  let budgetLine = extras.budget != null ? ' Spend up to \u00a3' + extras.budget + '.' : '';
  const mealLine = extras.meal !== false ? MEAL : (extras.exchange ? 'Presents are exchanged on ' + extras.exchange + '.' : '');

  const paras = [
    'Ho ho ho, ' + firstName + '!',
    poemText(),
    "This year's Secret Santa is back at the Ruxley showroom. You buy one present for one colleague, and somebody buys one for you. Nobody sees who has who, not even Dan." + budgetLine,
    mealLine,
    "If you're in, tap the green button. If you'd rather sit this one out, tap the red one. One tap is all it takes, no sign in, and you can change your mind until " + DEADLINE + '.',
    'Names will be revealed when the elves launch it, after the opt in deadline. If you\u2019re in, open the same link in this email to see who you\u2019ve got and to write a wishlist. No PIN needed.',
    'This link is just for you, so please don\u2019t forward it.',
    'The Ruxley elves'
  ];
  const text = paras.join('\n\n') + '\n\nI\u2019m in: ' + inUrl + '\n\nNot this year: ' + outUrl;

  const btn = (href, label, bg, border) =>
    '<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 12px"><tr>' +
    '<td align="center" bgcolor="' + bg + '" style="background:' + bg + ';border-radius:14px;border-bottom:4px solid ' + border + '">' +
    '<a href="' + esc(href) + '" style="display:inline-block;padding:16px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:18px;font-family:-apple-system,Segoe UI,Arial,sans-serif;line-height:1.2">' + label + '</a>' +
    '</td></tr></table>';

  const html =
    '<div style="background:#3a0610;padding:22px 10px;font-family:-apple-system,Segoe UI,Arial,sans-serif">' +
    '<div style="max-width:520px;margin:auto;background:#fff8ec;border-radius:18px;overflow:hidden;border:3px solid #f0ba6c">' +
    '<div style="background:#c8102e;background:linear-gradient(135deg,#d42a3a,#8e1020);color:#fff;text-align:center;padding:22px 16px 18px">' +
    '<div style="font-size:15px;letter-spacing:6px">&#10052; &#127876; &#10052; &#127873; &#10052; &#127876; &#10052;</div>' +
    '<div style="font-family:Georgia,serif;font-size:30px;font-weight:bold;margin:8px 0 2px">Are you in?</div>' +
    '<div style="color:#ffe1b0;font-size:13px;font-weight:bold">Hedin BMW Ruxley Secret Santa</div></div>' +
    '<div style="padding:22px 20px 8px;color:#3b1d12">' +
    '<p style="margin:0 0 14px;line-height:1.55;font-size:16px">Ho ho ho, ' + esc(firstName) + '!</p>' +
    poemHtml() +
    '<p style="margin:0 0 14px;line-height:1.55;font-size:16px">This year&rsquo;s Secret Santa is back at the Ruxley showroom. You buy one present for one colleague, and somebody buys one for you. Nobody sees who has who, not even Dan.' + (budgetLine ? ' ' + esc(budgetLine.trim()) : '') + '</p>' +
    (mealLine ? '<p style="margin:0 0 14px;line-height:1.55;font-size:16px">' + esc(mealLine) + '</p>' : '') +
    '<p style="margin:0 0 18px;line-height:1.55;font-size:16px">If you&rsquo;re in, tap the green button. If you&rsquo;d rather sit this one out, tap the red one. One tap is all it takes, no sign in, and you can change your mind until <b>' + DEADLINE + '</b>.</p>' +
    btn(inUrl, 'I&rsquo;m in &#127877;', '#1f7a45', '#0f4a28') +
    btn(outUrl, 'Not this year', '#7a0f1a', '#3a0610') +
    '<p style="margin:8px 0 14px;line-height:1.55;font-size:16px">Names will be revealed when the elves launch it, after the opt in deadline. If you&rsquo;re in, open the same link in this email to see who you&rsquo;ve got and to write a wishlist. No PIN needed.</p>' +
    '<p style="margin:0 0 8px;line-height:1.55;font-size:15px;color:#5a2a1a">This link is just for you, so please don&rsquo;t forward it.</p>' +
    '<p style="margin:0 0 16px;line-height:1.55;font-size:16px">The Ruxley elves</p>' +
    '<p style="color:#7a5a48;font-size:12px;margin:0 0 16px;text-align:center">Or open your personal page: <a href="' + esc(openUrl) + '" style="color:#7a0f1a">Ruxley Secret Santa opt in</a></p>' +
    '</div></div></div>';

  return {
    to: [person.email],
    name: person.name,
    firstName,
    group: person.group,
    guessed: !!person.guessed,
    note: person.note || '',
    token: tok,
    emailKey: keyOf(person.email),
    optInUrl: inUrl,
    optOutUrl: outUrl,
    openUrl,
    subject: SUBJECT,
    text,
    html,
    fromName: FROM,
    ts: Date.now()
  };
}

function build(opts) {
  opts = opts || {};
  const tokens = opts.tokens || {};
  const used = new Set(Object.values(tokens));
  function fresh() {
    let t; do { t = token(); } while (used.has(t));
    used.add(t); return t;
  }
  const seen = new Set();
  const emails = [];
  for (const person of RECIPIENTS) {
    const e = person.email.toLowerCase();
    if (seen.has(e)) throw new Error('duplicate ' + e);
    seen.add(e);
    const tok = tokens[e] || fresh();
    const mail = makeMail(person, tok, { budget: opts.budget != null ? opts.budget : 20, exchange: opts.exchange || 'Saturday 5 December' });
    if (visibleHasDash(mail.subject + '\n' + mail.text + '\n' + POEM_LINES.join('\n'))) {
      throw new Error('visible dash in mail for ' + e);
    }
    emails.push(mail);
  }
  return {
    meta: {
      subject: SUBJECT,
      fromName: FROM,
      deadline: DEADLINE,
      deadlineDate: '2026-11-14',
      deadlineWeekday: 'Saturday',
      poem: POEM_LINES,
      count: emails.length,
      guessed: emails.filter(m => m.guessed).map(m => ({ name: m.name, email: m.to[0] })),
      danIncluded: true,
      budget: 20,
      exchange: 'Saturday 5 December 2026',
      budgetOrExchangeInLiveSettings: false,
      note: 'Not queued and not written to RTDB. Seed santa/optins from each token before sending. Tina and Lisa addresses are confirmed. Do not set an announce date. Names come out only when Dan presses Go.'
    },
    emails
  };
}

module.exports = { RECIPIENTS, POEM_LINES, SUBJECT, FROM, DEADLINE, MEAL, makeMail, build, token, keyOf, visibleHasDash, poemText };

if (require.main === module) {
  const fs = require('fs');
  const i = process.argv.indexOf('--write');
  const out = build();
  if (i >= 0) {
    const dest = process.argv[i + 1] || '/workspace/santa-optin-mail.json';
    fs.writeFileSync(dest, JSON.stringify(out, null, 2));
    console.log('wrote ' + dest + ' (' + out.emails.length + ' emails)');
  } else {
    console.log(out.meta.subject);
    console.log(out.emails.length + ' recipients, ' + out.meta.guessed.length + ' guessed');
  }
}
