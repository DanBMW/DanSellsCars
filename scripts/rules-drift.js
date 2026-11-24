/* rules-drift.js - is the live Realtime Database running the rules in database.rules.json?
 *
 * 18 November 2026: the second cover seats (am2, mid2, pm2, 17 November) and the personal
 * cover links (coverLink) were on main but the rules were never published, so Clive could not
 * say he could not cover mid2 (the database refused his tap) and every personal email link
 * failed to open. Nothing told anybody. The cover job now compares the live rules with the
 * repo's on each run and emails Dan once per version of the file when they differ.
 * Read only: it never publishes rules. Publishing stays a hand step (firebase deploy --only database).
 */
'use strict';
const crypto = require('crypto');

function parseRules(text) {
  /* the console strips nothing, but people paste rules with // comment lines */
  return JSON.parse(String(text || '').replace(/^\s*\/\/.*$/mg, ''));
}

/* paths where a and b differ, at most max of them */
function diffPaths(a, b, path, out, max) {
  out = out || []; path = path || ''; max = max || 20;
  if (out.length >= max) return out;
  const obj = x => x && typeof x === 'object' && !Array.isArray(x);
  if (obj(a) && obj(b)) {
    const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort();
    for (const k of keys) {
      if (out.length >= max) break;
      /* a is the repo, b is live */
      if (!(k in b)) out.push('only in the repo: ' + path + '/' + k);
      else if (!(k in a)) out.push('only live: ' + path + '/' + k);
      else diffPaths(a[k], b[k], path + '/' + k, out, max);
    }
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push('different: ' + (path || '/'));
  return out;
}

/* opts = { dbUrl, getToken: async () => access token, fetch, repoText }
   returns { same: bool, diffs: [..], hash } or { error } when the live rules cannot be read */
async function check(opts) {
  let live;
  try {
    const token = await opts.getToken();
    const res = await (opts.fetch || fetch)(opts.dbUrl.replace(/\/$/, '') + '/.settings/rules.json', { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return { error: 'HTTP ' + res.status };
    live = parseRules(await res.text());
  } catch (e) { return { error: String((e && e.message) || e) }; }
  const repo = parseRules(opts.repoText);
  const diffs = diffPaths(repo, live);
  const hash = crypto.createHash('sha256').update(JSON.stringify(repo)).digest('hex').slice(0, 12);
  return { same: diffs.length === 0, diffs, hash };
}

/* the email to Dan, once per version of the repo file (the queue id carries the hash) */
function driftMail(res, to) {
  const lines = res.diffs.map(d => '  ' + d).join('\n');
  const text = 'The live database rules are not the ones on main, so parts of the team app are refused by the database.\n\n' +
    'Differences:\n' + lines + '\n\nPublish them from the repo with: firebase deploy --only database --project forecourt-1b6bc';
  return {
    id: 'rules_drift_' + res.hash, to: [to], subject: 'Database rules on main are not live',
    text, html: '<p>The live database rules are not the ones on main, so parts of the team app are refused by the database.</p><pre>' +
      res.diffs.map(d => d.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))).join('\n') +
      '</pre><p>Publish them from the repo with: <code>firebase deploy --only database --project forecourt-1b6bc</code></p>',
    ts: Date.now()
  };
}

module.exports = { parseRules, diffPaths, check, driftMail };
