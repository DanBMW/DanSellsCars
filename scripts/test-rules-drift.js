#!/usr/bin/env node
/* Tests scripts/rules-drift.js: the cover job's check that the live database rules are main's.
 *   node scripts/test-rules-drift.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const RD = require('./rules-drift.js');
const repoText = fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8');
const repo = RD.parseRules(repoText);
const fakeFetch = body => async (url, o) => {
  assert.ok(/\/\.settings\/rules\.json$/.test(url), url);
  assert.strictEqual(o.headers.Authorization, 'Bearer tok');
  return { ok: true, text: async () => body };
};
(async () => {
  let r = await RD.check({ dbUrl: 'https://x.firebasedatabase.app/', getToken: async () => 'tok', fetch: fakeFetch(JSON.stringify(repo)), repoText });
  assert.strictEqual(r.same, true); assert.deepStrictEqual(r.diffs, []);
  console.log('ok: the same rules are the same');

  /* what was live on 18 November: no second seats on reception, no coverLink, no walkinTaken */
  const old = JSON.parse(JSON.stringify(repo));
  old.rules.lockup.reception.$date.$shift['.write'] = old.rules.lockup.reception.$date.$shift['.write'].replace('(am|mid|pm)2?', '(am|mid|pm)');
  delete old.rules.coverLink; delete old.rules.walkinTaken;
  r = await RD.check({ dbUrl: 'https://x.firebasedatabase.app', getToken: async () => 'tok', fetch: fakeFetch(JSON.stringify(old)), repoText });
  assert.strictEqual(r.same, false);
  assert.ok(r.diffs.includes('only in the repo: /rules/coverLink'), r.diffs.join('|'));
  assert.ok(r.diffs.includes('only in the repo: /rules/walkinTaken'), r.diffs.join('|'));
  assert.ok(r.diffs.includes('different: /rules/lockup/reception/$date/$shift/.write'), r.diffs.join('|'));
  const m = RD.driftMail(r, 'daniel.cane@hedinautomotive.co.uk');
  assert.ok(/^rules_drift_[0-9a-f]{12}$/.test(m.id));
  assert.deepStrictEqual(m.to, ['daniel.cane@hedinautomotive.co.uk']);
  assert.ok(/firebase deploy --only database/.test(m.text));
  assert.ok(!/[\u2013\u2014]/.test(m.text + m.subject), 'no long dashes');
  console.log('ok: the 18 November live rules are reported, with the paths that differ');

  r = await RD.check({ dbUrl: 'https://x', getToken: async () => 'tok', fetch: async () => ({ ok: false, status: 401 }), repoText });
  assert.strictEqual(r.error, 'HTTP 401');
  r = await RD.check({ dbUrl: 'https://x', getToken: async () => { throw new Error('no creds'); }, repoText });
  assert.ok(/no creds/.test(r.error));
  console.log('ok: an unreadable live copy is an error, not a difference');
  console.log('all rules drift tests passed');
})().catch(e => { console.error(e); process.exit(1); });
