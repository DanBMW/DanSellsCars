#!/usr/bin/env node
/* Tests sendQueue in scripts/lockup-mail.js: one email Gmail refuses no longer stops the rest.
 * 18 November 2026, 13:53: a 421 Temporary System Problem on one email ended the run, and
 * Clive's 8th reminder (and everything queued after it) waited for the next run.
 *   node scripts/test-send-queue.js */
'use strict';
const assert = require('assert');
const { sendQueue } = require('./lockup-mail.js');
(async () => {
  const now = 1000000;
  const queue = {
    a: { ts: 1, subject: 'first' },
    bad: { ts: 2, subject: 'gmail says no' },
    c: { ts: 3, subject: 'after the failure' },
    held: { ts: 4, sendAfter: now + 60000 },
    done: { ts: 5, sent: 9 }
  };
  const sent = [], errs = [];
  const failed = await sendQueue(queue, now, async (id, q) => {
    if (id === 'bad') throw new Error('Data command failed: 421-4.3.0 Temporary System Problem.\nmore');
    sent.push(id); q.sent = now;
  }, m => errs.push(m));
  assert.deepStrictEqual(sent, ['a', 'c'], 'the ones after a failure still go, in order: ' + sent);
  assert.deepStrictEqual(failed, ['bad']);
  assert.ok(!queue.bad.sent, 'the failed one stays unsent for the next run');
  assert.strictEqual(errs.length, 1); assert.ok(/bad/.test(errs[0]) && !/more/.test(errs[0]), errs[0]);
  /* next run: only the failed one is tried again */
  const sent2 = [];
  const f2 = await sendQueue(queue, now + 300000, async (id, q) => { sent2.push(id); q.sent = 1; }, () => {});
  assert.deepStrictEqual(sent2, ['bad', 'held']); assert.deepStrictEqual(f2, []);
  console.log('ok: a refused email is left for the next run and the rest of the queue still sends');
})().catch(e => { console.error(e); process.exit(1); });
