#!/usr/bin/env node
/* Stamps the shared chrome (partials/*.html) into every page between
   marker comments:

     <!-- chrome:header {"wa":"...optional per-page vars..."} -->
     ...stamped content, do not edit by hand...
     <!-- /chrome:header -->

   Partials may contain {{name|default}} tokens; a page overrides a token
   by putting {"name":"value"} on its opening marker. Run after editing
   anything in partials/:

     node build.js            rewrite pages in place
     node build.js --check    exit 1 if any page is out of date (CI)
*/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CHECK = process.argv.includes('--check');
const MARKER = /([ \t]*)<!-- chrome:([a-z][a-z0-9]*)( \{.*?\})? -->[\s\S]*?<!-- \/chrome:\2 -->/g;

const partials = {};
for (const f of fs.readdirSync(path.join(ROOT, 'partials'))) {
  if (f.endsWith('.html')) {
    partials[path.basename(f, '.html')] =
      fs.readFileSync(path.join(ROOT, 'partials', f), 'utf8').trimEnd();
  }
}

let failed = false;
const stale = [];

for (const f of fs.readdirSync(ROOT).sort()) {
  if (!f.endsWith('.html')) continue;
  const file = path.join(ROOT, f);
  const src = fs.readFileSync(file, 'utf8');

  const out = src.replace(MARKER, (match, indent, name, json) => {
    const tpl = partials[name];
    if (!tpl) {
      console.error(`${f}: unknown partial "chrome:${name}"`);
      failed = true;
      return match;
    }
    let vars = {};
    if (json) {
      try { vars = JSON.parse(json); }
      catch (e) {
        console.error(`${f}: bad JSON on chrome:${name} marker: ${e.message}`);
        failed = true;
        return match;
      }
    }
    const body = tpl.replace(/\{\{(\w+)\|([^}]*)\}\}/g,
      (_, key, dflt) => (key in vars ? vars[key] : dflt));
    return `${indent}<!-- chrome:${name}${json || ''} -->\n${body}\n<!-- /chrome:${name} -->`;
  });

  if (out !== src) {
    stale.push(f);
    if (!CHECK) fs.writeFileSync(file, out);
  }
}

if (failed) process.exit(1);
if (stale.length === 0) {
  console.log('chrome up to date in all pages');
} else if (CHECK) {
  console.error(`chrome out of date in ${stale.length} page(s) - run "node build.js" and commit:`);
  for (const f of stale) console.error('  ' + f);
  process.exit(1);
} else {
  console.log(`stamped ${stale.length} page(s):`);
  for (const f of stale) console.log('  ' + f);
}
