#!/usr/bin/env node
/* Static sanity checks on the self-contained board pages.
 *
 * These pages are one big file each with the markup and the script that drives
 * it side by side, so the failure mode that actually bites is an element id
 * that the script reaches for and the markup no longer has - $('thing') returns
 * null, something throws mid-scene, and the wall display quietly stops. That is
 * invisible until somebody walks past it.
 *
 * No dependencies, no browser. Run: node scripts/check-board-html.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PAGES = ['team-board.html', 'newcar.html'];
let failed = 0;

function problem(page, msg) {
  console.error('  ' + page + ': ' + msg);
  failed++;
}

for (const page of PAGES) {
  const src = fs.readFileSync(path.join(root, page), 'utf8');

  // ids the markup defines
  const ids = [...src.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])
    .filter(id => !id.includes('{') && !id.includes("'"));   // skip templated ids
  const seen = new Set(), dupes = new Set();
  for (const id of ids) { if (seen.has(id)) dupes.add(id); seen.add(id); }
  for (const d of dupes) problem(page, 'duplicate id "' + d + '"');

  // ids the script reaches for
  const wanted = new Set([
    ...[...src.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]),
    ...[...src.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]),
    ...[...src.matchAll(/setBubble\('([^']+)'/g)].map(m => m[1]),
    ...[...src.matchAll(/confetti\('([^']+)'\)/g)].map(m => m[1]),
    ...[...src.matchAll(/closeModal\('([^']+)'\)/g)].map(m => m[1])
  ]);
  for (const w of wanted) {
    if (!seen.has(w)) problem(page, 'script uses $("' + w + '") but no element has that id');
  }

  // class selectors the script reaches for
  const classes = new Set();
  // no closing quote required: markup built in JS reads class="mtab'+(on?' on':'')+'"
  for (const m of src.matchAll(/\bclass="([^"'+]*)/g)) m[1].split(/\s+/).forEach(c => c && classes.add(c));
  for (const m of src.matchAll(/classList\.(?:add|remove|toggle|contains)\('([^']+)'/g)) classes.add(m[1]);
  for (const m of src.matchAll(/className='([^']+)'/g)) m[1].split(/\s+/).forEach(c => c && classes.add(c));
  for (const m of src.matchAll(/querySelector(?:All)?\('([^']*)'\)/g)) {
    for (const c of m[1].matchAll(/\.([a-zA-Z][\w-]*)/g)) {
      if (!classes.has(c[1])) problem(page, 'querySelector("' + m[1] + '") looks for .' + c[1] + ' which nothing sets');
    }
  }

  // every local file the page points at should exist
  for (const m of src.matchAll(/(?:src|href)="((?!https?:|data:|mailto:|#|\/\/)[^"]+)"/g)) {
    const rel = m[1].split('?')[0];
    // skip paths assembled in JS - src="'+t.photo+'" and friends
    if (!rel || /[{}'+]/.test(rel)) continue;
    if (!fs.existsSync(path.join(root, rel))) problem(page, 'points at "' + rel + '" which is not in the repo');
  }

  // the video list must match what is on disk
  for (const m of src.matchAll(/src:'(video\/[^']+)'/g)) {
    if (!fs.existsSync(path.join(root, m[1]))) problem(page, 'CLIPS references "' + m[1] + '" which is not in the repo');
  }
}

if (failed) {
  console.error('\ncheck-board-html: ' + failed + ' problem(s)');
  process.exit(1);
}
console.log('check-board-html: ' + PAGES.join(', ') + ' - ids, classes and assets all resolve');
