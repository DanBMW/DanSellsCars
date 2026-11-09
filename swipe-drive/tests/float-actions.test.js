/* Short phones: the swipe buttons float over the foot of the card above the bottom nav. Checks the CSS and app.js wiring the browser run relies on.
   The layout and touch behaviour are checked on the live site (iPhone SE, iPhone 13, Pixel 7, desktop) with a test account. Run with: node swipe-drive/tests/float-actions.test.js */
const fs = require('fs'), path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'premium.css'), 'utf8'), app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let p = 0, f = 0; const check = (l, c) => { if (c) p++; else { f++; console.log('FAIL', l); } };
const m = css.match(/@media \(max-width:520px\) and \(max-height:720px\)\{([\s\S]*?)\n\}/); const blk = m ? m[1] : '';
check('only short, narrow screens get the floating row (tall phones and desktop unchanged)', !!m && !/@media \(max-width:520px\) and \(min-height/.test(css));
check('buttons float (fixed) above the nav, only while the deck shows', /#deck:not\(\[hidden\]\)~\.ct-actions\{position:fixed;[^}]*bottom:calc\(71px \+ var\(--safe-b\)\)/.test(blk));
check('the row lets touches through to the card, the buttons still take them', /\.ct-actions\{[^}]*pointer-events:none/.test(blk) && /\.ct-actions \.ct-act\{pointer-events:auto;touch-action:none/.test(blk));
check('a subtle gradient sits behind the buttons', /\.ct-actions\{[^}]*background:linear-gradient\(180deg,rgba\(10,12,15,0\)/.test(blk));
check('the card fills the space down to the nav', /\.ct-deck\{[^}]*height:max\(300px,calc\(100dvh - 222px - var\(--safe-b\)\)\)\}/.test(blk));
check('the card keeps its key facts clear of the buttons (bottom padding)', /\.ct-card \.ct-meta\{flex:0 0 auto;padding:10px 16px 74px/.test(blk));
check('the photo gives up height instead of the price', /\.ct-card \.ct-tarea\{flex:1 1 auto;min-height:72px/.test(blk));
check('button labels stay for screen readers', /\.ct-act span\{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect\(0 0 0 0\)/.test(blk));
check('toasts move above the floating buttons', /\.ct-toast\{bottom:calc\(152px \+ var\(--safe-b\)\)\}/.test(blk));
check('the plain toast never blocks a touch', /#toast\{pointer-events:none\}/.test(css));
check('the round undo style only hits the deck button, not the staff undo toast', /\.ct-act\.ct-undo\{width:44px/.test(css) && !/(^|[}\s])\.ct-undo\{width:44px/.test(css));
check('a sideways drag that starts on a floating button swipes the card', /function floatDrag\(\)/.test(app) && /getComputedStyle\(acts\)\.position !== 'fixed'/.test(app) && /card\.setPointerCapture\(s\.id\)/.test(app) && /floatDrag\(\);/.test(app));
check('drag forwarding waits for a clear sideways move, so taps still press the button', /Math\.abs\(dx\) < 12 \|\| Math\.abs\(dx\) < Math\.abs\(dy\)/.test(app));
check('drag forwarding stays off while a pop up is open', /if \(!card \|\| openOverlays\(\)\.length\) return;/.test(app));
check('asset versions bumped', /premium\.css\?v=5/.test(html) && /app\.js\?v=57/.test(html));
console.log(p + ' passed, ' + f + ' failed'); if (f) process.exit(1);
