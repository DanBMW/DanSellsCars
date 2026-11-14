/* santa-draw.js - the server side of Secret Santa: the draw, the launch and the
 * emails. Run by scripts/lockup-mail.js on every lockup emails run (every 15
 * minutes, Monday to Saturday 06:00 to 19:59 UTC), so no browser ever holds the
 * whole list. On its own: FIREBASE_SA=... node scripts/santa-draw.js
 *
 * Timing (Dan, 9 November 2026):
 *   - Coming soon until launched. settings/live is false until the launch.
 *   - Launch / Go (Dan presses Go in Elf HQ, santa/launchRequest): if the names
 *     are not drawn yet they are drawn now, then live = true and one launch
 *     email per person is queued. Once only (santa/launched, santa/mail/launch).
 *     Names are revealed only then. announceTs never releases names or sends a
 *     names out email. The rules let nobody read their pairing until live is true.
 *   - Weekly reminder: Mondays, first run from 10:00 London, while live and
 *     before the exchange day, unless settings/reminders is false. One a week
 *     (santa/mail/week_<isoWeek>), none in the launch's first two days.
 *   - Exchange nearly here: the last Monday to Saturday before the exchange day,
 *     from 10:00 London (santa/mail/eve), same switch as the weekly reminder.
 * No email ever names anyone's giftee: they all say open the app.
 * santaTest (the practice copy) never emails the team: one sample of each email
 * goes to Dan only, subject starting [PRACTICE].
 *
 * Writes, with the admin SDK (the rules let no browser write these):
 *   R/assign/<giverKey> = { to, name, drawId }  readable only by that giver, after the announce time
 *   R/sealed            = { drawId, pairs }     readable only by Dan after R/uncovered/<drawId>
 *   R/draw              = { id, ts, count, byName }
 * Keys are the member's email, lower case, with '.' as ','.
 */
'use strict';
const crypto = require('crypto');
const LR = require('../lockup-rota.js');
const APP = 'https://dan-sells.co.uk/santa/';
const OPTIN = 'https://dan-sells.co.uk/santa/optin.html';
const PRIVATE = 'lockupPrivate/notify';
const DAN = 'daniel.cane@hedinautomotive.co.uk';

function keyOf(email) { return String(email || '').trim().toLowerCase().split('.').join(','); }
function mailId(k) { return String(k).replace(/[^a-z0-9]+/g, '_').slice(0, 60); }
let RAND = n => crypto.randomInt(n);
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = RAND(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

class DrawError extends Error {}
/* Who can't be matched at all, for a clear Elf HQ message */
function explain(keys, bad, names) {
  const nm = k => (names && names[k]) || k;
  for (const g of keys) if (!keys.some(r => !bad(g, r))) return nm(g) + ' is kept apart from everyone, so nobody can be drawn for them. Remove one of their keep apart pairs.';
  return 'No draw fits all the keep apart pairs. Remove one or two of them and draw again.';
}
/* The draw. Tries for one big loop first (A gives to B, B to C ... back to A),
   which is the nicest; if the keep apart pairs make a loop hard, it finds a
   perfect matching (Kuhn's augmenting paths over a shuffled order), which
   always finds a valid draw when one exists. Throws DrawError when none does. */
function derange(keys, excl, names, loopTries) {
  excl = excl || {};
  const bad = (a, b) => a === b || !!((excl[a] || {})[b] || (excl[b] || {})[a]);
  if (keys.length < 2) throw new DrawError('You need at least two people to draw names.');
  if (new Set(keys).size !== keys.length) throw new DrawError('Someone is on the list twice.');
  loopTries = loopTries == null ? 300 : loopTries;
  for (let t = 0; t < loopTries; t++) {
    const o = shuffle(keys), pairs = {};
    let ok = true;
    for (let i = 0; i < o.length; i++) { const g = o[i], r = o[(i + 1) % o.length]; if (bad(g, r)) { ok = false; break; } pairs[g] = r; }
    if (ok) return pairs;
  }
  const givers = shuffle(keys), match = {}; /* receiver -> giver */
  const adj = {}; givers.forEach(g => { adj[g] = shuffle(keys).filter(r => !bad(g, r)); });
  function aug(g, seen) {
    for (const r of adj[g]) {
      if (seen[r]) continue; seen[r] = 1;
      if (match[r] === undefined || aug(match[r], seen)) { match[r] = g; return true; }
    }
    return false;
  }
  for (const g of givers) if (!aug(g, {})) throw new DrawError(explain(keys, bad, names));
  const pairs = {}; Object.keys(match).forEach(r => { pairs[match[r]] = r; });
  return pairs;
}
/* a draw is valid when it is a bijection on the members with no self and no kept apart pair */
function valid(keys, pairs, excl) {
  excl = excl || {};
  const g = Object.keys(pairs).sort(), r = Object.values(pairs).sort(), k = keys.slice().sort();
  if (JSON.stringify(g) !== JSON.stringify(k) || JSON.stringify(r) !== JSON.stringify(k)) return false;
  return g.every(a => pairs[a] !== a && !((excl[a] || {})[pairs[a]] || (excl[pairs[a]] || {})[a]));
}

/* ---------- the emails ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function longDate(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }); }
function whenLondon(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' }) + ' at ' +
    d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '').replace(':00', '');
}
function daysTo(date, today) { return Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 864e5); }
const SIGNIN = 'Sign in with your work email and PIN, the same as the Team app. First time? Type your work email, pick a six digit PIN, press Set my PIN and click the link in the email we send.';
function page(title, paras, button, foot, href) {
  const p = paras.filter(Boolean).map(x => '<p style="margin:0 0 14px;line-height:1.55;font-size:16px">' + x + '</p>').join('');
  return '<div style="background:#3a0610;padding:22px 10px;font-family:-apple-system,Segoe UI,Arial,sans-serif">' +
    '<div style="max-width:520px;margin:auto;background:#fff8ec;border-radius:18px;overflow:hidden;border:3px solid #f0ba6c">' +
    '<div style="background:#c8102e;background:linear-gradient(135deg,#d42a3a,#8e1020);color:#fff;text-align:center;padding:22px 16px 18px">' +
    '<div style="font-size:15px;letter-spacing:6px">&#10052; &#127876; &#10052; &#127873; &#10052; &#127876; &#10052;</div>' +
    '<div style="font-family:Georgia,serif;font-size:30px;font-weight:bold;margin:8px 0 2px">' + title + '</div>' +
    '<div style="color:#ffe1b0;font-size:13px;font-weight:bold">Hedin BMW Ruxley Secret Santa</div></div>' +
    '<div style="padding:22px 20px 8px;color:#3b1d12">' + p +
    '<a href="' + (href || APP) + '" style="display:block;margin:6px 0 16px;text-align:center;background:#1f7a45;color:#fff;text-decoration:none;font-weight:bold;padding:16px;border-radius:14px;font-size:18px;border-bottom:4px solid #0f4a28">' + button + '</a>' +
    '<p style="color:#7a5a48;font-size:12px;margin:0 0 16px;text-align:center">' + (foot || esc(SIGNIN)) + '</p></div></div></div>';
}
/* kind: launch | announce | weekly | eve. m: member {name}. s: settings. today: London date */
/* link: the person's own opt in link (no sign in), only ever queued on the private queue */
/* gift: {name, wish} of who they are buying for, only ever with a private link */
function makeMail(kind, m, s, today, nowMs, link, gift) {
  const first = String(m.name || '').split(' ')[0] || 'there';
  const budget = s.budget != null ? '\u00a3' + s.budget : null;
  const ex = s.exchange ? longDate(s.exchange) : null;
  const dx = s.exchange ? daysTo(s.exchange, today) : null;
  const namesOut = s.live === true;
  let subject, title, paras, text, button;
  const gName = gift && gift.name ? String(gift.name).split(' ')[0] : '';
  const gLine = gName ? '&#127873; You\u2019re Secret Santa for <b style="font-size:22px;color:#c8102e">' + esc(gift.name) + '</b>' : '';
  const gWish = gName ? (gift.wish ? esc(gName) + '\u2019s wishlist so far: <i>' + esc(String(gift.wish).slice(0, 300)) + '</i>' : esc(gName) + ' hasn\u2019t written a wishlist yet. Tap below to check back for it.') : '';
  const line = { budget: budget ? 'Spend up to ' + budget + '.' : '', ex: ex ? 'Presents are exchanged at the team meal on ' + ex + '. If you\'re not coming to the meal, pop your gift in the bag and your presents will be given to you before you leave that day.' : '' };
  if (kind === 'launch') {
    subject = '\uD83C\uDF85 Secret Santa is live! Tap to see who you\u2019ve got';
    title = 'Secret Santa is live!';
    paras = gName
      ? ['Ho ho ho, ' + esc(first) + '!', 'The Ruxley Secret Santa is live and the names are drawn &#128513;', gLine, gWish, 'Nobody else can see this, so keep it to yourself!', 'Then write your own wishlist so your Secret Santa knows what you\u2019d love. ' + esc(line.budget) + ' ' + esc(line.ex)]
      : ['Ho ho ho, ' + esc(first) + '!', 'The Ruxley Secret Santa is live and the names are drawn. <b>Tap the button below to unwrap who you\u2019ve got</b> &#128513;', 'Nobody else can see it, not even Dan, so keep it to yourself!', 'Then write your wishlist so your own Secret Santa knows what you\u2019d love. ' + esc(line.budget) + ' ' + esc(line.ex)];
    if (gName) subject = '\uD83C\uDF85 Secret Santa is live! Here\u2019s who you\u2019ve got';
    button = gName ? 'See ' + gName + '\u2019s wishlist and write mine' : 'Unwrap my present';
  } else if (kind === 'announce') {
    subject = '\uD83C\uDF81 The Secret Santa names are out! Tap to see who you\u2019ve got';
    title = 'The names are out!';
    paras = ['Ho ho ho, ' + esc(first) + '!', 'Your present is ready to unwrap. <b>Tap the button below to see who you\u2019re Secret Santa for.</b>', 'Check nobody is looking over your shoulder first &#129323;', esc(line.budget) + ' ' + esc(line.ex)];
    button = 'Unwrap my present';
  } else if (kind === 'weekly') {
    subject = '\uD83C\uDF84 Secret Santa: ' + (dx != null ? dx + ' day' + (dx === 1 ? '' : 's') + ' to go' : 'your weekly reminder');
    title = dx != null ? dx + ' day' + (dx === 1 ? '' : 's') + ' to go' : 'Secret Santa';
    paras = ['Hi ' + esc(first) + ',', 'Your weekly Secret Santa nudge from the elves. ' + esc(line.ex) + ' ' + esc(line.budget),
      '&#128220; <b>Is your wishlist up to date?</b> Your Santa reads it, so a few hints go a long way.',
      namesOut ? (gName ? '&#127873; <b>Had a look at ' + esc(gName) + '\u2019s wishlist?</b> They may have added to it.' : '&#127873; <b>Had a look at your giftee\u2019s wishlist?</b> They may have added to it.') : 'The elves will email you when the names are revealed.'];
    button = 'Open Secret Santa';
  } else if (kind === 'eve') {
    const when = dx === 1 ? 'tomorrow' : 'on ' + ex;
    subject = '\uD83C\uDF81 Secret Santa is ' + when + '! Have you got your present?';
    title = dx === 1 ? 'It\u2019s tomorrow!' : 'Nearly time!';
    paras = ['Hi ' + esc(first) + ',', 'The Secret Santa exchange is <b>' + esc(when) + '</b>. ' + esc(line.budget), 'Wrapped and ready? If you need a last minute idea, ' + (gName ? esc(gName) + '\u2019s' : 'your giftee\u2019s') + ' wishlist is on your Secret Santa page.'];
    button = 'Open Secret Santa';
  } else throw new Error('unknown mail ' + kind);
  const href = link || APP;
  const foot = link ? 'This is your own private link, no sign in needed. Please don\u2019t forward this email.' : SIGNIN;
  text = paras.map(x => x.replace(/<[^>]+>/g, '').replace(/&#39;/g, '\u2019').replace(/&#\d+;/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n') + '\n\n' + button + ': ' + href + '\n\n' + foot + '\n\nThe Ruxley elves';
  return { subject, text, html: page(esc(title), paras, esc(button), esc(foot), href), fromName: 'Hedin Used Cars', ts: nowMs };
}

/* ---------- the run ---------- */
async function val(db, p) { return (await db.ref(p).get()).val(); }

async function doDraw(db, R, byName, nowMs, log) {
  const members = (await val(db, R + '/members')) || {};
  const excl = (await val(db, R + '/exclusions')) || {};
  const keys = Object.keys(members).filter(k => members[k] && keyOf(members[k].email) === k);
  const names = {}; keys.forEach(k => { names[k] = members[k].name; });
  let pairs;
  try { pairs = derange(keys, excl, names); } catch (e) {
    if (!(e instanceof DrawError)) throw e;
    await db.ref(R).update({ drawRequest: null, drawError: { msg: e.message, ts: nowMs } });
    log(R + ': draw refused, ' + e.message);
    return null;
  }
  if (!valid(keys, pairs, excl)) throw new Error('draw failed its own check');
  const id = 'd' + nowMs.toString(36) + crypto.randomBytes(3).toString('hex');
  const assign = {};
  keys.forEach(g => { assign[g] = { to: pairs[g], name: members[pairs[g]].name, drawId: id }; });
  await db.ref(R).update({ assign, notes: null, drawError: null, drawRequest: null, sealed: { drawId: id, pairs }, draw: { id, ts: nowMs, count: keys.length, byName: byName || '' } });
  log(R + ': drew ' + keys.length + ' names (draw ' + id + '), nothing printed');
  return id;
}

/* queue one email per member (practice: one sample to Dan). Never overwrites a queued id. */
async function queue(db, R, kind, notifyRoot, s, today, nowMs, log) {
  const members = (await val(db, R + '/members')) || {};
  const practice = R !== 'santa';
  let list = Object.keys(members).filter(k => members[k] && members[k].email).map(k => ({ k, m: members[k] }));
  if (practice) list = list.length ? [{ k: 'practice', m: { name: 'Dan', email: DAN } }] : [];
  /* someone who said I'm in on their opt in link gets that link back: it shows their
     pairing with no sign in. A token must never sit on the public lockup queue
     (lockup is world readable), so those go on lockupPrivate/notify, which only the
     Action reads, and only for the real list. */
  const tokens = {};
  const assign = practice ? {} : ((await val(db, R + '/assign')) || {});
  const wishes = practice ? {} : ((await val(db, R + '/wish')) || {});
  if (!practice) {
    const optins = (await val(db, R + '/optins')) || {};
    Object.keys(optins).forEach(t => {
      const r = optins[t];
      if (!r || r.choice !== 'in' || !r.email || !/^[A-Za-z0-9_-]{24,64}$/.test(t)) return;
      const k = keyOf(r.email);
      if (!tokens[k] || (r.choiceTs || 0) > tokens[k].ts) tokens[k] = { t, ts: r.choiceTs || 0 };
    });
  }
  let n = 0;
  for (const { k, m } of list) {
    const id = (practice ? 'santatest_' : 'santa_') + kind + '_' + (kind === 'weekly' ? LR.isoWeek(today).replace('-', '_') + '_' : '') + mailId(k);
    const ref = db.ref(notifyRoot + '/' + id), pref = db.ref(PRIVATE + '/' + id);
    if ((await ref.get()).val() || (await pref.get()).val()) continue;
    const tok = tokens[k] && notifyRoot === 'lockup/notify' ? tokens[k].t : null;
    /* the giftee goes in only on the private queue, and only once the names are out */
    const a = tok && s.live === true && assign[k] && assign[k].to ? assign[k] : null;
    const gift = a ? { name: (members[a.to] && members[a.to].name) || a.name, wish: wishes[a.to] && wishes[a.to].text } : null;
    const mail = makeMail(kind, m, s, today, nowMs, tok ? OPTIN + '?t=' + encodeURIComponent(tok) : null, gift);
    if (practice) mail.subject = '[PRACTICE] ' + mail.subject;
    await (tok ? pref : ref).set(Object.assign({ to: [String(m.email).toLowerCase()] }, mail));
    n++;
  }
  log(R + ': queued ' + n + ' ' + kind + ' email' + (n === 1 ? '' : 's'));
  return n;
}
/* the last Monday to Saturday day strictly before the exchange */
function eveDay(exchange) { let d = LR.addDays(exchange, -1); while (LR.london(new Date(d + 'T12:00:00Z')).dow === 'sun') d = LR.addDays(d, -1); return d; }


function teamIdFor(email, team, managers) {
  const e = String(email || '').trim().toLowerCase();
  for (const g of [team, managers]) {
    for (const id of Object.keys(g || {})) {
      const p = g[id];
      if (p && String(p.email || '').trim().toLowerCase() === e) return id;
    }
  }
  return null;
}

/* Every drawn person gets a personal link (santa/optins/<token>, choice in), so
 * the launch email and every reminder open straight onto their own pairing with
 * no sign in. Someone with a link keeps it (switched to in if they were kept in
 * by Elf HQ or never replied); anyone else gets a new unguessable token. Only
 * after the draw, so the list is final. Logs never name anyone or a token. */
async function ensureLinks(db, R, nowMs, log) {
  const members = (await val(db, R + '/members')) || {};
  const assign = (await val(db, R + '/assign')) || {};
  const optins = (await val(db, R + '/optins')) || {};
  const byKey = {};
  Object.keys(optins).forEach(t => {
    const r = optins[t];
    if (!r || !r.email || !/^[A-Za-z0-9_-]{24,64}$/.test(t)) return;
    const k = keyOf(r.email), b = byKey[k];
    /* prefer a link already in, then the newest */
    if (!b || (r.choice === 'in') > (b.r.choice === 'in') || ((r.choice === 'in') === (b.r.choice === 'in') && (r.choiceTs || r.invitedTs || 0) > (b.r.choiceTs || b.r.invitedTs || 0))) byKey[k] = { t, r };
  });
  const updates = {};
  let made = 0, flipped = 0;
  for (const k of Object.keys(members)) {
    const m = members[k];
    if (!m || !m.email || keyOf(m.email) !== k || !assign[k]) continue;
    const have = byKey[k];
    if (have && have.r.choice === 'in') continue;
    if (have) { updates['optins/' + have.t + '/choice'] = 'in'; updates['optins/' + have.t + '/choiceTs'] = nowMs; flipped++; continue; }
    const t = crypto.randomBytes(24).toString('base64url');
    const rec = { name: String(m.name || m.email.split('@')[0]).slice(0, 40), email: String(m.email).toLowerCase(), invitedTs: nowMs, choice: 'in', choiceTs: nowMs };
    if (m.team) rec.team = m.team; else rec.extra = true;
    updates['optins/' + t] = rec;
    made++;
  }
  if (!Object.keys(updates).length) return;
  await db.ref(R).update(updates);
  log(R + ': personal links, ' + made + ' new, ' + flipped + ' switched to in');
}

/* Apply opt in / opt out answers. Tokens stay on the server: organisers only
 * see santa/replies (name, email, choice), never the token or a pairing.
 * People who say they are in are added to the nice list; people who say not
 * this year are taken off, until the draw or launch locks the list. After the
 * names are out, each opted in token gets its own guestGift (their pairing
 * only). Logs never name anyone. */
async function syncOptins(db, R, o) {
  const log = o.log, nowMs = o.nowMs;
  const s = (await val(db, R + '/settings')) || {};
  const draw = await val(db, R + '/draw');
  const locked = !!draw || s.live === true || !!(s.optInUntil && nowMs >= s.optInUntil);
  const optins = (await val(db, R + '/optins')) || {};
  const team = (await val(db, 'lockup/config/team')) || {};
  const managers = (await val(db, 'lockup/config/managers')) || {};
  const members = Object.assign({}, (await val(db, R + '/members')) || {});
  const wishes = Object.assign({}, (await val(db, R + '/wish')) || {});
  const assign = (await val(db, R + '/assign')) || {};
  /* server only: when this sync last put each person on the list from their reply.
     An organiser's change in Elf HQ made after the reply wins over the reply. */
  const added_ = (await val(db, R + '/optinAdded')) || {};
  const namesOut = s.live === true;
  const updates = {};
  const replies = {};
  let added = 0, removed = 0, gifts = 0;
  for (const token of Object.keys(optins)) {
    const rec = optins[token];
    if (!rec || !rec.email) continue;
    const email = String(rec.email).trim().toLowerCase();
    const k = keyOf(email);
    const choice = rec.choice === 'in' || rec.choice === 'out' ? rec.choice : 'pending';
    const cts = rec.choiceTs || 0, mem = members[k];
    /* an organiser added them after they said not this year: they stay in */
    const keptIn = choice === 'out' && !!mem && (mem.ts || 0) > cts && (mem.ts || 0) > (added_[k] || 0);
    /* an organiser took them off after this sync added them from an I'm in: they stay off */
    const keptOut = choice === 'in' && !mem && !!added_[k] && added_[k] >= cts;
    if (choice === 'in' && mem && !added_[k] && !locked) updates['optinAdded/' + k] = nowMs;
    replies[k] = { name: String(rec.name || '').slice(0, 40), email: email, choice: keptIn ? 'in' : keptOut ? 'out' : choice, ts: rec.choiceTs || rec.invitedTs || 0 };
    if (keptIn || keptOut) replies[k].elves = true;
    if (!locked && choice === 'in' && !mem && !keptOut) {
      const m = { name: String(rec.name || email.split('@')[0]).slice(0, 40), email: email, ts: nowMs };
      const tid = teamIdFor(email, team, managers);
      if (tid) m.team = tid; else m.extra = true;
      updates['members/' + k] = m;
      updates['optinAdded/' + k] = nowMs;
      members[k] = m;
      added++;
    }
    if (!locked && choice === 'out' && mem && !keptIn) {
      updates['members/' + k] = null;
      delete members[k];
      removed++;
    }
    if (choice === 'in' && rec.wish && rec.wish.text != null) {
      const incoming = { text: String(rec.wish.text).slice(0, 600), ts: rec.wish.ts || nowMs };
      const existing = wishes[k];
      if (!existing || (incoming.ts || 0) >= (existing.ts || 0)) {
        updates['wish/' + k] = incoming;
        wishes[k] = incoming;
      }
    }
    if (namesOut && choice === 'in' && assign[k] && assign[k].to) {
      const gift = { name: assign[k].name, to: assign[k].to, drawId: assign[k].drawId || '' };
      const gw = wishes[assign[k].to];
      if (gw && gw.text) gift.wish = String(gw.text).slice(0, 600);
      updates['guestGift/' + token] = gift;
      gifts++;
    }
  }
  if (Object.keys(optins).length) updates['replies'] = Object.keys(replies).length ? replies : null;
  if (!Object.keys(updates).length) return;
  await db.ref(R).update(updates);
  if (added || removed || gifts) log(R + ': opt in sync in +' + added + ' out -' + removed + (gifts ? ' gifts ' + gifts : ''));
}

async function runRoot(db, R, o) {
  const log = o.log, nowMs = o.nowMs, notifyRoot = o.notifyRoot;
  const L = LR.london(new Date(nowMs)), today = L.date;
  let s = (await val(db, R + '/settings')) || {};
  let launched = await val(db, R + '/launched');
  const draw0 = await val(db, R + '/draw');
  await syncOptins(db, R, o);
  s = (await val(db, R + '/settings')) || {};

  /* 1. draw or cancel asked for in Elf HQ */
  const req = await val(db, R + '/drawRequest');
  if (req) {
    if (launched) {
      await db.ref(R).update({ drawRequest: null, drawError: { msg: req.mode === 'cancel' ? 'Secret Santa is already launched, so the draw can\u2019t be cancelled.' : 'The names are already out, so they can\u2019t be drawn again.', ts: nowMs } });
      log(R + ': ' + req.mode + ' refused after launch');
    } else if (req.mode === 'cancel') {
      await db.ref(R).update({ assign: null, sealed: null, draw: null, notes: null, drawRequest: null, drawError: null });
      log(R + ': draw cancelled by ' + (req.byName || '?'));
    } else await doDraw(db, R, req.byName, nowMs, log);
  }

  /* 2. launch: once only */
  const lr = await val(db, R + '/launchRequest');
  if (lr) {
    if (launched) await db.ref(R + '/launchRequest').remove();
    else if (!s.exchange) {
      await db.ref(R).update({ launchRequest: null, drawError: { msg: 'Set the present exchange day before launching.', ts: nowMs } });
    } else {
      const drawn = (await val(db, R + '/draw')) || null;
      const id = drawn ? drawn.id : await doDraw(db, R, lr.byName, nowMs, log);
      if (id) {
        launched = { ts: nowMs, byName: lr.byName || '', drawId: id };
        await db.ref(R).update({ launched, launchRequest: null, 'settings/live': true });
        s.live = true;
        log(R + ': launched by ' + (lr.byName || '?'));
      } else await db.ref(R + '/launchRequest').remove();
    }
  }
  /* once the names are out, everyone drawn has their own link: nobody has to sign in */
  if (launched) await ensureLinks(db, R, nowMs, log);
  await syncOptins(db, R, o);
  if (!launched) return;
  const mail = (await val(db, R + '/mail')) || {};
  const mark = k => db.ref(R + '/mail/' + k).set(nowMs);

  /* 3. the launch emails, once only. Names are already out at Go, so there is no later announce email. */
  if (!mail.launch) { await mark('launch'); await queue(db, R, 'launch', notifyRoot, s, today, nowMs, log); }
  /* 4. reminders, unless switched off; never on or after the exchange day */
  if (s.reminders === false || !s.exchange || today >= s.exchange) return;
  if (today === eveDay(s.exchange) && L.mins >= 600 && !mail.eve) { await mark('eve'); await queue(db, R, 'eve', notifyRoot, s, today, nowMs, log); return; }
  const wk = 'week_' + LR.isoWeek(today);
  if (L.dow === 'mon' && L.mins >= 600 && !mail[wk] && !mail.eve && nowMs - launched.ts > 2 * 864e5) { await mark(wk); await queue(db, R, 'weekly', notifyRoot, s, today, nowMs, log); }
}

async function run(db, o) {
  o = o || {};
  if (typeof o === 'function') o = { log: o };
  const opts = { log: o.log || (m => console.log('santa: ' + m)), nowMs: o.nowMs || Date.now(), notifyRoot: o.notifyRoot || 'lockup/notify' };
  for (const R of ['santa', 'santaTest']) {
    try { await runRoot(db, R, opts); } catch (e) { opts.log(R + ' failed: ' + (e && e.message)); }
  }
}

module.exports = { keyOf, derange, valid, explain, DrawError, run, runRoot, syncOptins, makeMail, eveDay, mailId, teamIdFor, _setRand: f => { RAND = f; } };

if (require.main === module) {
  const admin = require('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)), databaseURL: 'https://forecourt-1b6bc-default-rtdb.europe-west1.firebasedatabase.app' });
  run(admin.database()).then(() => process.exit(0), e => { console.error(e); process.exit(1); });
}
