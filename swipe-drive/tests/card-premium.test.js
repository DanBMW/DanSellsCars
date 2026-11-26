/* Premium swipe card: short clean titles, the layout files wired in, and the rules the phone run relies on.
   Layout is checked in a browser at 360, 390 and 412 wide, in app browser heights included. Run with: node swipe-drive/tests/card-premium.test.js */
const fs = require('fs'), path = require('path');
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = rd('app.js'), css = rd('card-premium.css'), js = rd('card-premium.js'), html = rd('index.html'), sw = rd('sw.js');
let p = 0, f = 0; const check = (l, c) => { if (c) p++; else { f++; console.log('FAIL', l); } };
const m = app.match(/function shortTitle[\s\S]*?String\(m \|\| ''\); \}/); check('shortTitle exists', !!m);
const shortTitle = new Function(m[0] + '; return shortTitle;')();
[['BMW 120 1.5 120i MHT M Sport DCT Euro 6 (s/s) 5dr', 'BMW 120i M Sport'], ['BMW M135 2.0 M135i DCT xDrive Euro 6 (s/s) 5dr', 'BMW M135i xDrive'],
 ['BMW 330e 2.0 330e 22.3kWh M Sport Auto Euro 6 (s/s) 4dr', 'BMW 330e M Sport'], ['BMW iX1 30 66.5kWh M Sport Auto xDrive 5dr (11kW Charger)', 'BMW iX1 30 M Sport xDrive'],
 ['BMW X5 4.4 M60i MHT Steptronic xDrive Euro 6 (s/s) 5dr', 'BMW X5 M60i xDrive'], ['BMW 220 M Sport Gran Coupe', 'BMW 220 M Sport Gran Coupe'], ['BMW X3 M50', 'BMW X3 M50'], ['BMW 128ti', 'BMW 128ti'], ['', '']]
  .forEach(([a, b]) => check('short title ' + a + ' => ' + b + ' (got ' + shortTitle(a) + ')', shortTitle(a) === b));
check('the full name stays on the card title for screen readers and the details view', /<h3 title="' \+ esc\(c\.model\) \+ '">' \+ esc\(shortTitle\(c\.model\)\)/.test(app));
check('every stock name shortens to at most 40 characters with no dashes', (() => { const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'lookup', 'std-stock.json'), 'utf8')).cars; return Object.values(d).every(c => { const t = shortTitle(c.model); return t.length <= 40 && !/[\u2010-\u2015-]/.test(t); }); })());
check('source chip sits in the details row, not on the photo', /<div class="ct-mtop">/.test(app) && /'<div class="ct-tarea">' \+ img \+ ser \+ gauge\(x\.score\) \+ just \+/.test(app));
check('odd ratio photos are flagged and shown whole', /classList\.toggle\('is-odd'/.test(app) && /\.ct-ph\.is-odd img\.ct-ph-img\{[^}]*object-fit:contain/.test(css));
check('sharp photo keeps a 16:10 frame (whole dealer shot), filled edge to edge with the blurred same photo', /aspect-ratio:16\/10;max-height:100%;object-fit:cover/.test(css) && /\.ct-ph-bg\{inset:-40px;filter:blur/.test(css));
check('deal cards point to the representative example in Info', /\(card \? '<p class="ct-replink"><u>Representative example in Info<\/u>, tap the card<\/p>' : ''\)/.test(app));
check('cards always show the representative example pointer', /#deck \.ct-card \.ct-replink\{display:block/.test(css));
check('buttons sit flush on the nav, sized from card-premium.js', /bottom:var\(--sd-nav-h,64px\)!important/.test(css) && /--sd-deck-h/.test(js) && /window\.innerHeight/.test(js));
check('nothing behind the buttons: cars left is screen reader only, How it works moves to the top bar', /#deckLeft\{position:absolute!important;width:1px/.test(css) && /bar\.appendChild\(how\)/.test(js));
check('layout refits on resize and in app browser viewport changes', /visualViewport/.test(js) && /ResizeObserver/.test(js));
check('drawDeck asks for a refit', /if \(window\.sdFit\) window\.sdFit\(\);/.test(app));
check('files wired in and versions bumped', /card-premium\.css\?v=1/.test(html) && /card-premium\.js\?v=1/.test(html) && /app\.js\?v=62/.test(html) && /'sd-v82'/.test(sw) && /card-premium\.css\?v=1/.test(sw) && /card-premium\.js\?v=1/.test(sw));
check('card-premium.css loads after premium.css and guest-free.css', html.indexOf('card-premium.css') > html.indexOf('guest-free.css') && html.indexOf('card-premium.css') > html.indexOf('premium.css?'));
check('no dashes in new visible copy', !/content:'[^']*[\u2010-\u2015-][^']*'/.test(css));
console.log(p + ' passed, ' + f + ' failed'); if (f) process.exit(1);
