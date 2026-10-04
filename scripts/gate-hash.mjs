#!/usr/bin/env node
/* Set a new password / PIN for one of the staff gates in staff-gate.js.
 *
 *   node scripts/gate-hash.mjs admin     admin.html + links.html
 *   node scripts/gate-hash.mjs manager   manager PIN on team-board.html + Forecourt.html
 *   node scripts/gate-hash.mjs newcar    Nathan's PIN on newcar.html
 *
 * Asks for the password twice without echoing it, then rewrites that gate's
 * salt and hash in staff-gate.js. The password itself is never written
 * anywhere. Commit and push staff-gate.js afterwards.
 * (scripts/ is not published on the website - see _config.yml.)
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const name = process.argv[2];
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'staff-gate.js');
const src = readFileSync(file, 'utf8');
const re = new RegExp('(\\b' + name + ':\\s*\\{\\s*norm:\\s*\'(upper|none)\',\\s*iter:\\s*(\\d+),\\s*salt:\\s*\')[^\']*(\',\\s*hash:\\s*\')[^\']*(\')');
const m = name && src.match(re);
if (!m) { console.error('Usage: node scripts/gate-hash.mjs admin|manager|newcar'); process.exit(1); }
const norm = m[2], iter = Number(m[3]);

/* Reads lines from stdin without echoing them (raw mode on a terminal). */
const lines = [], waiters = [];
let cur = '', listening = false;
function feed(ch) {
  for (const c of ch) {
    if (c === '\r' || c === '\n') { lines.push(cur); cur = ''; }
    else if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); }
    else if (c === '\u007f' || c === '\b') cur = cur.slice(0, -1);
    else cur += c;
  }
  while (lines.length && waiters.length) waiters.shift()(lines.shift());
}
function ask(prompt) {
  process.stdout.write(prompt);
  if (!listening) {
    listening = true;
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', feed);
    process.stdin.on('end', () => { if (cur) { lines.push(cur); cur = ''; } while (waiters.length) waiters.shift()(lines.shift() || ''); });
  }
  process.stdin.resume();
  return new Promise((resolve) => {
    const done = (v) => { process.stdout.write('\n'); resolve(v); };
    if (lines.length) done(lines.shift()); else waiters.push(done);
  });
}
function stopInput() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
}

let pw = (await ask('New ' + name + ' password: ')).trim();
const again = (await ask('Type it again: ')).trim();
stopInput();
if (!pw) { console.error('Empty password - nothing changed.'); process.exit(1); }
if (pw !== again) { console.error('They did not match - nothing changed.'); process.exit(1); }
if (norm === 'upper') pw = pw.toUpperCase();
if (pw.length < 8) console.warn('Warning: under 8 characters. Anyone can brute-force a short one from the public hash.');

const salt = randomBytes(16).toString('hex');
const hash = pbkdf2Sync(pw, Buffer.from(salt, 'hex'), iter, 32, 'sha256').toString('hex');
writeFileSync(file, src.replace(re, (_, a, _n, _i, b, c) => a + salt + b + hash + c));
console.log('Updated the "' + name + '" gate in staff-gate.js. Now commit and push it:');
console.log('  git add staff-gate.js && git commit -m "Rotate ' + name + ' password" && git push');
