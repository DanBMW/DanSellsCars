#!/usr/bin/env node
/*
 * Runs scripts/test-walkin-parse.js at pinned times of day.
 *
 * That suite anchors its sample emails to NOW, which was the right fix for
 * the version before it (it used to pin them to 13:28, so the samples aged
 * out of the four hour window and the suite passed all morning and failed
 * all afternoon). But anchoring to now moved the problem rather than ending
 * it: the oldest sample is 105 minutes back, so for 35 minutes a day, just
 * after midnight, some samples landed on the previous calendar day and the
 * suite failed. It did, on 9 October 2026 at 01:44, on a push that had
 * nothing to do with reception.
 *
 * That was not the test being precious. It was a real bug in
 * walkins-appscript.gs: `clockOn` stamped the stated time onto the date of
 * the email that carried it, so an arrival at 23:59 whose notification was
 * resent at 00:04 came out nearly 24 hours in the future, was thrown away,
 * and the resend became a SECOND card on the wall that no pick-up cleared.
 *
 * So the clock is pinned here instead of hoped about. Each time below runs
 * the whole suite in its own process with Date fixed to that minute.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SUITE = path.join(__dirname, 'test-walkin-parse.js');

/* The three windows that failed before the fix, their edges, and a few
   ordinary hours so a change that only works at midnight is caught too. */
const TIMES = [
  '00:00', '00:01', '00:02', '00:15', '00:29', '00:30',
  '00:49', '00:50', '00:51', '00:52',
  '01:39', '01:40', '01:44', '01:45', '01:46',
  '02:30', '06:00', '09:15', '13:28', '17:45', '21:00', '23:58', '23:59',
];

const shim = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'walkin-')), 'at.js');
fs.writeFileSync(shim, `
'use strict';
/* Pin the clock to today at FAKE_HHMM, then run the suite in this process. */
var hm = process.env.FAKE_HHMM.split(':');
var base = new Date();
base.setHours(+hm[0], +hm[1], 0, 0);
var FIXED = base.getTime();
var RealDate = Date;
function FakeDate(a, b, c, d, e, f, g) {
  if (!(this instanceof FakeDate)) return new RealDate(FIXED).toString();
  switch (arguments.length) {
    case 0: return new RealDate(FIXED);
    case 1: return new RealDate(a);
    default: return new RealDate(a, b, c, d, e, f, g);
  }
}
FakeDate.prototype = RealDate.prototype;
FakeDate.now = function () { return FIXED; };
FakeDate.parse = RealDate.parse;
FakeDate.UTC = RealDate.UTC;
global.Date = FakeDate;
require(${JSON.stringify(SUITE)});
`);

let failed = 0;
console.log('Running the walk-in suite at %d pinned times of day.\n', TIMES.length);
TIMES.forEach(function (hhmm) {
  let ok = true, out = '';
  try {
    execFileSync(process.execPath, [shim], {
      env: Object.assign({}, process.env, { FAKE_HHMM: hhmm }),
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000,
    });
  } catch (e) {
    ok = false;
    out = String(e.stdout || '') + String(e.stderr || '');
  }
  if (ok) {
    console.log('  ok   ' + hhmm);
  } else {
    failed++;
    console.log('  FAIL ' + hhmm);
    out.split('\n').filter(function (l) { return /FAIL|Error/.test(l); })
      .slice(0, 8).forEach(function (l) { console.log('         ' + l.trim()); });
  }
});

console.log('');
if (failed) {
  console.log('%d of %d times failed. The parsing depends on the hour it runs '
    + 'at, which is the bug this file exists to catch.', failed, TIMES.length);
  process.exit(1);
}
console.log('the same result at every hour, including either side of midnight');
