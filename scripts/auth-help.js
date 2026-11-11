/* auth-help.js - our own backup for the team login verification email.
 * Run from scripts/lockup-mail.js on every lockup-emails run (never stops lockup).
 *
 * Firebase's verification email comes from noreply@forecourt-1b6bc.firebaseapp.com,
 * and Hedin's Outlook can quarantine it without anyone seeing it. So:
 *   1. requests   authHelp/verifyReq/<uid> (written by team-backend.js on sign up
 *                 and on Send it again): if the account is still not verified
 *                 WAIT_MS after the request, we email a fresh Firebase link
 *                 (Admin SDK generateEmailVerificationLink) from our own mailer.
 *   2. sweep      a Hedin account on the team or manager list, made in the last
 *                 SWEEP_DAYS and still not verified, with no request on file,
 *                 gets the same email once (covers sign ups before this existed).
 *   3. approvals  authHelp/approve/<uid> (an admin pressed Verify in team admin
 *                 after checking it is really them): we mark the email verified.
 * Every outcome is logged at authHelp/log/<uid>/<push> and in authHelp/sent/<uid>,
 * so a failed or skipped send is never silent. Per person at most one email every
 * GAP_MS and MAX_PER_DAY a day.
 */
'use strict';
const DOMAIN = /^[a-z0-9._%+-]+@hedinautomotive\.co\.uk$/;
const WAIT_MS = 2 * 60e3, GAP_MS = 10 * 60e3, MAX_PER_DAY = 4, SWEEP_DAYS = 14, DAY = 864e5, FAIL_WAIT_MS = 30 * 60e3;
const CONTINUE = 'https://dan-sells.co.uk/team.html?verified=1';
const FROM_NAME = 'Ruxley Team';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function mail(name, link) {
  const hi = 'Hi ' + (name || 'there') + ',';
  const subject = 'Your Ruxley Team login: confirm your email';
  const text = [hi, '', 'Tap the link below to confirm your work email and finish setting up your Ruxley Team login.', '', link, '',
    'Then go back to the Ruxley Team app: https://dan-sells.co.uk/team.html', '',
    'If you did not ask for this, ignore this email.', '', 'Hedin BMW Ruxley'].join('\n');
  const html = '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#12263a">' +
    '<div style="background:#0b1220;color:#fff;border-radius:14px 14px 0 0;padding:18px 20px;font-size:18px;font-weight:800">&#128273; ' + esc(subject) + '</div>' +
    '<div style="border:1px solid #d9e3ee;border-top:0;border-radius:0 0 14px 14px;padding:20px"><p style="margin:0 0 12px">' + esc(hi) + '</p>' +
    '<p style="margin:0 0 18px">Tap the button to confirm your work email and finish setting up your Ruxley Team login.</p>' +
    '<a href="' + esc(link) + '" style="display:block;text-align:center;background:#4d94d8;color:#fff;text-decoration:none;font-weight:800;padding:14px;border-radius:12px;font-size:17px">Confirm my email</a>' +
    '<p style="margin:16px 0 0">Then go back to the <a href="https://dan-sells.co.uk/team.html" style="color:#4d94d8">Ruxley Team app</a>. It carries on by itself.</p>' +
    '<p style="color:#6b7a8c;font-size:12px;margin:16px 0 0">If you did not ask for this, ignore this email. Hedin BMW Ruxley</p></div></div>';
  return { subject, text, html };
}

/* people we know: lockup/config team and managers, by lower case email */
function roster(cfg) {
  const out = {};
  ['team', 'managers'].forEach(l => Object.values((cfg || {})[l] || {}).forEach(p => { if (p && p.email) out[String(p.email).toLowerCase()] = p.name || ''; }));
  return out;
}

/* opts: { auth (admin.auth()), nowMs, sendMail(msg) | null for dry, from, dry, log } */
async function run(db, opts) {
  const auth = opts.auth, nowMs = opts.nowMs || Date.now(), say = opts.log || console.log, dry = !!opts.dry;
  const [reqS, apprS, sentS, cfgS] = await Promise.all(['authHelp/verifyReq', 'authHelp/approve', 'authHelp/sent', 'lockup/config'].map(p => db.ref(p).get()));
  const reqs = reqS.val() || {}, approvals = apprS.val() || {}, sent = sentS.val() || {}, people = roster(cfgS.val());
  const report = { mailed: [], verified: [], skipped: [], failed: [] };
  const log = async (uid, what, extra) => {
    say('auth-help', uid, what, extra ? JSON.stringify(extra) : '');
    if (!dry) await db.ref('authHelp/log/' + uid).push(Object.assign({ what, ts: nowMs }, extra || {}));
  };

  /* 3. approvals first, so an approved person is not emailed as well */
  for (const uid of Object.keys(approvals)) {
    const a = approvals[uid] || {};
    try {
      const u = await auth.getUser(uid);
      if (!u.emailVerified) { if (!dry) await auth.updateUser(uid, { emailVerified: true }); }
      await log(uid, 'approved', { by: a.by || '', email: u.email || '' });
      report.verified.push(u.email);
      if (!dry) await db.ref().update({ ['authHelp/approve/' + uid]: null, ['authHelp/verifyReq/' + uid]: null, ['authHelp/sent/' + uid + '/verified']: nowMs, ['authHelp/sent/' + uid + '/hold']: null, ['authHelp/sent/' + uid + '/email']: String(u.email || '').toLowerCase() });
    } catch (e) { report.failed.push(uid); await log(uid, 'approve failed', { err: String(e && (e.code || e.message)).slice(0, 190) }); }
  }

  /* who to email: requests plus the sweep */
  const todo = {};
  Object.keys(reqs).forEach(uid => { if (!approvals[uid]) todo[uid] = { ts: reqs[uid].ts || 0, clientErr: reqs[uid].clientErr || '', why: 'request' }; });
  if (opts.sweep !== false) {
    let page;
    do {
      page = await auth.listUsers(1000, page && page.pageToken);
      page.users.forEach(u => {
        const em = String(u.email || '').toLowerCase(), made = Date.parse(u.metadata && u.metadata.creationTime) || 0;
        if (u.emailVerified || u.disabled || todo[u.uid] || approvals[u.uid] || (sent[u.uid] && (sent[u.uid].last || sent[u.uid].hold))) return;
        if (!DOMAIN.test(em) || !(em in people) || nowMs - made > SWEEP_DAYS * DAY) return;
        if (!(u.providerData || []).some(p => p.providerId === 'password')) return;
        todo[u.uid] = { ts: made, why: 'sweep' };
      });
    } while (page.pageToken);
  }

  for (const uid of Object.keys(todo)) {
    const t = todo[uid], s = sent[uid] || {};
    if (nowMs - t.ts < WAIT_MS && !t.clientErr) continue; /* give Firebase's own email a moment */
    if (s.last && s.last >= t.ts) continue;                /* already answered this request */
    if (s.last && nowMs - s.last < GAP_MS) continue;
    if (s.failAt && nowMs - s.failAt < FAIL_WAIT_MS) continue;          /* a failure waits before the next try */
    if (s.hold) continue;                                              /* held: Dan will verify them by hand, no email */
    const today = s.day === new Date(nowMs).toISOString().slice(0, 10) ? (s.count || 0) : 0;
    if (today >= MAX_PER_DAY) { report.skipped.push(uid); await log(uid, 'skipped, daily limit'); continue; }
    try {
      const u = await auth.getUser(uid);
      const em = String(u.email || '').toLowerCase();
      t.email = em;
      if (u.emailVerified) { report.skipped.push(em); if (!dry) await db.ref('authHelp/verifyReq/' + uid).remove(); continue; }
      if (!DOMAIN.test(em)) { report.skipped.push(em); await log(uid, 'skipped, not a work address', { email: em }); continue; }
      /* dan-sells.co.uk is not on Firebase's authorised domain list, so like the page
         we fall back to Firebase's own confirm page (team.html carries on by itself) */
      const link = await auth.generateEmailVerificationLink(em, { url: CONTINUE })
        .catch(e => (e && /continue-uri|unauthorized|invalid-continue/.test(e.code || '')) ? auth.generateEmailVerificationLink(em) : Promise.reject(e));
      const m = mail(people[em] || '', link);
      say((dry ? '[dry] ' : '') + 'Send "' + m.subject + '" to ' + em + ' (' + t.why + (t.clientErr ? ', firebase said ' + t.clientErr : '') + ')');
      if (!dry) {
        await opts.sendMail({ from: { name: FROM_NAME, address: opts.from }, to: [em], subject: m.subject, text: m.text, html: m.html });
        await db.ref('authHelp/sent/' + uid).set({ last: nowMs, day: new Date(nowMs).toISOString().slice(0, 10), count: today + 1, email: em, why: t.why });
      }
      /* a sweep find is listed for admins too, so Dan can verify them in team admin */
      if (!dry && t.why === 'sweep') await db.ref('authHelp/verifyReq/' + uid).set({ email: em, ts: t.ts });
      report.mailed.push(em);
      await log(uid, 'mailed', { email: em, why: t.why, clientErr: t.clientErr || null });
    } catch (e) {
      report.failed.push(uid);
      /* keep Firebase's own words (the raw server response) and wait FAIL_WAIT_MS before trying again */
      await log(uid, 'send failed', { err: String(e && (e.code || e.message)).slice(0, 190), msg: String(e && e.message || '').slice(0, 400) });
      if (!dry) await db.ref('authHelp/sent/' + uid).update(Object.assign({ failAt: nowMs }, t.email ? { email: t.email } : {}));
    }
  }
  return report;
}

module.exports = { run, mail, roster, WAIT_MS, GAP_MS, MAX_PER_DAY, SWEEP_DAYS };
