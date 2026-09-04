#!/usr/bin/env node
/* The used car team is listed in two places that must agree:
 *
 *   team-board.html      the TEAM array the board renders from
 *   database.rules.json  the `exec` pattern that decides which ids Firebase
 *                        will accept a deal for
 *
 * Get them out of step and there is no error anywhere obvious: the board shows
 * the new person perfectly well, and Firebase silently refuses every deal
 * entered for them. This fails the build instead.
 *
 * Run: node scripts/check-board-team.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const board = fs.readFileSync(path.join(root, 'team-board.html'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8');

function fail(msg) {
  console.error('check-board-team: ' + msg);
  process.exit(1);
}

const arr = board.match(/var TEAM\s*=\s*\[([\s\S]*?)\n\];/);
if (!arr) fail('could not find the TEAM array in team-board.html');
const teamIds = [...arr[1].matchAll(/\bid\s*:\s*'([^']+)'/g)].map(m => m[1]);
if (!teamIds.length) fail('found the TEAM array but no ids in it');

const pat = rules.match(/"exec"\s*:\s*\{\s*"\.validate"\s*:\s*"[^"]*matches\(\/\^\(([^)]*)\)\$\/\)/);
if (!pat) fail('could not find the exec pattern in database.rules.json');
const ruleIds = pat[1].split('|').map(s => s.trim()).filter(Boolean);

const missing = teamIds.filter(id => !ruleIds.includes(id));
const extra = ruleIds.filter(id => !teamIds.includes(id));

if (missing.length || extra.length) {
  if (missing.length) {
    console.error('\n  On the board but NOT allowed by the database rules:');
    console.error('    ' + missing.join(', '));
    console.error('    Every deal entered for them would be silently rejected.');
  }
  if (extra.length) {
    console.error('\n  Allowed by the database rules but not on the board:');
    console.error('    ' + extra.join(', '));
  }
  console.error('\n  Fix: make the exec pattern in database.rules.json read');
  console.error('    ^(' + teamIds.join('|') + ')$');
  console.error('  then publish the rules in the Firebase console.\n');
  fail('the team list and the database rules disagree');
}

console.log('check-board-team: ' + teamIds.length + ' execs, board and rules agree (' + teamIds.join(', ') + ')');
