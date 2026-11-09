/* Pop ups that must block the deck: the car sheet, match pop up, buy pop up, iOS guide AND the first-visit tutorial.
   Before: arrow keys swiped cards hidden behind the tutorial, and the phone's back button left the car sheet open
   over the previous screen. Runs the real functions from app.js against a tiny fake DOM.
   Run with: node swipe-drive/tests/overlays.test.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const grab = (re) => { const m = src.match(re); if (!m) throw new Error('not found in app.js: ' + re); return m[0]; };
const code = [grab(/var OVERLAYS = \[[^\]]*\];/), grab(/function openOverlays\(\) \{[^\n]*\}/), grab(/function closeOverlay\(el\) \{[^\n]*\}/)].join('\n');
let p = 0, f = 0; const check = (l, c) => { if (c) p++; else { f++; console.log('FAIL', l); } };
function el(id, cls, hidden) { const e = { id, hidden, clicked: 0, removed: false, classList: { contains: (c) => (cls || '').split(' ').includes(c) }, kids: {} }; return e; }
const dom = { '#sheet': el('sheet', 'ct-sheet', true), '#matchModal': el('matchModal', 'ct-match', true), '#buyModal': el('buyModal', '', true), '#iosGuide': el('iosGuide', 'ct-ios', true), '#confetti': { getContext: () => ({ clearRect() {} }), width: 1, height: 1 } };
let tut = null;
const $ = (s, root) => { if (root) return root.kids[s] || null; if (s === '.ct-tut') return tut; return dom[s] || null; };
const ctx = { $ }; vm.createContext(ctx); vm.runInContext(code + '\nthis.openOverlays = openOverlays; this.closeOverlay = closeOverlay;', ctx);
check('nothing open: deck takes input', ctx.openOverlays().length === 0);
tut = el('tut', 'ct-tut', undefined); const skip = { click() { tut.removed = true; tut = null; } }; tut.kids['.ct-tut-skip'] = skip;
check('tutorial open counts as an overlay (arrow keys / buttons blocked)', ctx.openOverlays().length === 1 && ctx.openOverlays()[0].id === 'tut');
const t = tut; ctx.closeOverlay(t); check('closing the tutorial goes through its Skip (remembered as seen)', t.removed === true && ctx.openOverlays().length === 0);
dom['#sheet'].hidden = false; check('open sheet counts', ctx.openOverlays().length === 1);
ctx.openOverlays().forEach(ctx.closeOverlay); check('screen change closes the open sheet', dom['#sheet'].hidden === true);
check('app.js closes overlays on every screen change (back button)', /addEventListener\('hashchange', function \(\) \{ openOverlays\(\)\.forEach\(closeOverlay\); \}\)/.test(src));
console.log(p + ' passed, ' + f + ' failed'); if (f) process.exit(1);
