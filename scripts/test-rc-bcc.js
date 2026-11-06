#!/usr/bin/env node
'use strict';
const assert = require('assert');
const { rcBccFor, RC_BCC_UNTIL, RC_BCC_ADDR } = require('./lockup-mail.js');
const J = require('./reception-mail.js');

assert.strictEqual(RC_BCC_UNTIL, '2026-11-12');
assert.deepStrictEqual(rcBccFor('rc_live_2026-11-06_am_carl', Date.parse('2026-11-06T10:00:00Z')), [RC_BCC_ADDR]);
assert.deepStrictEqual(rcBccFor('rc_test_decl_x', Date.parse('2026-11-12T18:00:00Z')), [RC_BCC_ADDR], 'inclusive through 12 Nov');
assert.deepStrictEqual(rcBccFor('rc_live_x', Date.parse('2026-11-13T00:30:00Z')), [], 'stops after 12 Nov UK');
assert.deepStrictEqual(rcBccFor('absence_seed', Date.parse('2026-11-06T10:00:00Z')), [], 'non-rc ids get no bcc');
assert.deepStrictEqual(rcBccFor('forecourt_x', Date.parse('2026-11-06T10:00:00Z')), []);

const hold = J.coverSendAfterMs('2026-11-06', '09:00');
assert.ok(Math.abs(hold - Date.parse('2026-11-06T08:50:00Z')) < 60000, '09:00 hold is ~08:50 UK: ' + new Date(hold).toISOString());
const holdPm = J.coverSendAfterMs('2026-11-06', '15:00');
assert.ok(Math.abs(holdPm - Date.parse('2026-11-06T14:50:00Z')) < 60000, '15:00 hold is ~14:50 UK: ' + new Date(holdPm).toISOString());

assert.strictEqual(J.rcId('2026-11-06', 'am', 'carl').indexOf(J.rcMode() === 'test' ? 'rc_test_' : 'rc_live_'), 0);

console.log('ok: rc BCC window, sendAfter timing, and mode-scoped ids');
