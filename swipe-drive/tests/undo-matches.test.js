/* Undo the last swipe and open a match's full details: the wiring in app.js and index.html that the browser check relies on.
   The behaviour itself is checked on the live site with a test account (see the PR). Run with: node swipe-drive/tests/undo-matches.test.js */
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let p = 0, f = 0; const check = (l, c) => { if (c) p++; else { f++; console.log('FAIL', l); } };
check('undo button in the deck controls, off until there is a swipe', /<button[^>]*id="btnUndo"[^>]*disabled/.test(html));
check('each swipe is remembered for undo, a few back', /S\.undo = S\.undo \|\| \[\]\)\.push\(\{ x: x, prev: prev \}\)/.test(app) && /var UNDO_MAX = \d+;/.test(app));
check('undo puts the card back on top and drops the swipe', /S\.deck\.unshift\(x\)/.test(app) && /delete S\.swipes\[reg\]/.test(app));
check('undo waits for the swipe save before deleting it (no race)', /saved\.then\(function \(\) \{[^}]*store\.unswipe/.test(app));
check('undo deletes the stored swipe (live and demo)', (app.match(/unswipe: function \(cid, reg, prev\)/g) || []).length === 2 && /from\('swipes'\)\.delete\(\)\.eq\('customer_id', cid\)\.eq\('reg', reg\)/.test(app));
check('undo closes the match pop up and updates the matches badge', /closeOverlay\(\$\('#matchModal'\)\);[\s\S]{0,200}badge\(\)/.test(app));
check('undo button disabled when there is nothing to undo', /\$\('#btnUndo'\)\.disabled = !canUndo/.test(app));
check('keyboard: down arrow or Ctrl/Cmd+Z undoes', /e\.key === 'ArrowDown' \|\| \(\(e\.ctrlKey \|\| e\.metaKey\)/.test(app));
check('undo ignored while a pop up is open', /\['#btnLike', '#btnPass', '#btnSuper', '#btnUndo'\]/.test(app));
check('matches: each car opens its full details', /data-open="' \+ esc\(c\.reg\)/.test(app) && /openSheet\(\{ car: c, score: 0, reasons: \[\] \}, 'matches'\)/.test(app));
check('matches: links and buttons inside a match keep their own job', /e\.target\.closest\('a,button,input,select,textarea'\)\) return/.test(app));
check('details opened from matches never swipe the deck', /S\.sheetFrom === 'matches'/.test(app));
check('back closes the details sheet', /history\.pushState\(\{ ctSheet: 1 \}/.test(app) && /addEventListener\('popstate'/.test(app));
console.log(p + ' passed, ' + f + ' failed'); if (f) process.exit(1);
