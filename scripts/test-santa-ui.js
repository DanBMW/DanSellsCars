#!/usr/bin/env node
/* Runs santa/index.html and the team home in headless Chromium against the
 * in-memory Firebase stubs (scripts/ui-stubs/), with made up elves. Nothing
 * touches the real database. The stubs do not apply the database rules (those
 * are scripts/test-santa-rules.mjs); here the data is shaped as the rules allow.
 *   npm i playwright ; node scripts/test-santa-ui.js   (CHROME=/path/to/chrome optional)
 *   SHOTS=/some/dir also saves screenshots.
 */
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), STUBS = path.join(__dirname, 'ui-stubs'), OUT = process.env.SHOTS;
const LR = require('../lockup-rota.js'), SD = require('./santa-draw.js');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const K = SD.keyOf;
const DAN = { uid: 'dan1', email: 'daniel.cane@hedinautomotive.co.uk', emailVerified: true };
const HOLLY = { uid: 'h1', email: 'holly.berry@example.com', emailVerified: true };
const NOEL = { uid: 'n1', email: 'noel.snow@hedinautomotive.co.uk', emailVerified: true };
const now = Date.now(), H = 3600e3;
const ELVES = [['Dan', DAN.email, 0], ['Holly Berry', HOLLY.email, 1], ['Noel Snow', NOEL.email, 0], ['Ivy Green', 'ivy.green@example.com', 0], ['Rudy Reindeer', 'rudy.reindeer@example.com', 0],
  ['Carol Singer', 'carol.singer@example.com', 1], ['Nick Frost', 'nick.frost@example.com', 0], ['Eve Winter', 'eve.winter@example.com', 0], ['Jingle Jones', 'jingle.jones@example.com', 0]];
const D0 = LR.defaults(), today = LR.london().date;
function fixture(o) {
  o = o || {};
  const members = {}; ELVES.forEach(([n, e, x]) => { members[K(e)] = Object.assign({ name: n, email: e, ts: now - 864e5 }, x ? { extra: true } : { team: 'x' }); });
  const exch = '2026-12-18', annMs = o.announceIn != null ? now + o.announceIn : Date.parse('2026-12-01T10:00:00Z');
  const ann = new Date(annMs).toISOString().slice(0, 16);
  const s = { settings: { budget: 20, exchange: exch, announce: ann, announceTs: annMs, live: !!o.live, reminders: true }, members,
    audit: { a1: { by: 'dan1', name: 'Dan', what: 'Added the Team list (7)', ts: now - 864e5 }, a2: { by: 'dan1', name: 'Dan', what: 'Added Holly Berry', ts: now - 20 * H } }, uncovered: {} };
  if (o.drawn) {
    const keys = Object.keys(members), pairs = SD.derange(keys, {});
    s.draw = { id: 'dSAMPLE', ts: now - 3 * H, count: keys.length, byName: 'Dan' };
    s.sealed = { drawId: 'dSAMPLE', pairs };
    s.assign = {}; keys.forEach(k => { s.assign[k] = { to: pairs[k], name: members[pairs[k]].name, drawId: 'dSAMPLE' }; });
    /* the stubs ignore rules: before the names time the rules refuse your own pairing, so leave it out as the server would show it */
    if (!(s.settings.live && annMs <= now)) s.assign = {};
    s.wish = { [K(DAN.email)]: { text: 'Coffee beans, the stronger the better\nSomething for the car', ts: now - H } };
  }
  if (o.launched) s.launched = { ts: now - 2 * H, byName: 'Dan', drawId: 'dSAMPLE' };
  return {
    '.info': { connected: true },
    lockup: { config: { testMode: false, seeded: 1, team: Object.assign({}, D0.team, { noel: { name: 'Noel', email: NOEL.email, off: 'tue', active: true } }), managers: D0.managers, checklist: D0.checklist }, weeks: {}, status: {}, reception: {} },
    shifts: { links: { dan1: 'dan', n1: 'noel', nat1: 'nathan' }, requests: {} }, staff: { dan1: true }, santaTest: s
  };
}
let pass = 0, fail = 0; const PAGES = [];
const check = (name, c, d) => { if (c) pass++; else fail++; console.log((c ? 'ok   ' : 'FAIL ') + name + (!c && d ? ' :: ' + d : '')); };
async function open(browser, url, data, user, ctxOpt) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ctxOpt || {}));
  const page = await ctx.newPage();
  page.__errors = []; PAGES.push(page);
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|fonts\.googleapis\.com|fonts\.gstatic\.com)/, r => r.abort());
  await page.route('https://api.github.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ workflow_runs: [{ conclusion: 'success', created_at: new Date(now - 6e5).toISOString(), updated_at: new Date(now - 5e5).toISOString() }] }) }));
  await page.route('https://www.gov.uk/bank-holidays.json', r => r.fulfill({ contentType: 'application/json', body: '{"england-and-wales":{"events":[]}}' }));
  await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-*.js', r => {
    const f = path.join(STUBS, r.request().url().split('/').pop());
    r.fulfill({ contentType: 'application/javascript', body: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : 'export default {};' });
  });
  await page.addInitScript(({ data, user }) => { window.__STORE = { data, user, popupUser: user, accounts: {}, log: [] }; try { localStorage.clear(); } catch (e) {} }, { data, user });
  await page.goto('http://127.0.0.1:' + srv.address().port + url);
  return page;
}
const vis = (p, s) => p.locator(s).first().isVisible().catch(() => false);
const txt = (p, s) => p.locator(s).first().innerText().catch(() => '');
const store = (p, path) => p.evaluate(path => path.split('/').reduce((o, k) => (o == null ? undefined : o[k]), window.__STORE.data), path);
async function shot(p, name, full) {
  if (!OUT) return;
  if (full) await p.addStyleTag({ content: '.tabs,.bottomnav,.sh,.practice,header.top{position:static!important}' });
  await p.screenshot({ path: path.join(OUT, name), fullPage: !!full });
}
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const SANTA = '/santa/?practice=1';
  let p;
  /* 1. Coming soon: staff */
  p = await open(browser, SANTA, fixture({ drawn: false }), HOLLY);
  await p.waitForSelector('#v-soon:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(600);
  check('coming soon: staff see the Coming soon screen', await vis(p, '.soon-h'));
  check('coming soon: with the names countdown', /Names announced/.test(await txt(p, '#soon-count')));
  check('coming soon: staff get no tabs and no Elf HQ', !(await vis(p, '#tabs')) && !(await vis(p, '#tab-elves')));
  check('coming soon: no present, no wishlist', !(await vis(p, '#v-home')) && !(await vis(p, '#v-wishes')));
  await shot(p, '18-coming-soon.png');
  /* someone not on the list also sees Coming soon, not an error */
  p = await open(browser, SANTA, fixture(), { uid: 'z1', email: 'stranger@hedinautomotive.co.uk', emailVerified: true });
  await p.waitForSelector('#v-soon:not([hidden])', { timeout: 15000 });
  check('coming soon: someone not on the list sees Coming soon too', true);
  /* 2. Coming soon: Dan still reaches Elf HQ */
  p = await open(browser, SANTA, fixture({ drawn: false }), DAN);
  await p.waitForSelector('#tabs:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(400);
  check('coming soon: Dan sees the Coming soon preview with the organiser note', await vis(p, '.soon-h') && await vis(p, '#soon-org'));
  await p.click('#tab-elves'); await p.waitForTimeout(500);
  check('elf hq: reveal countdown shown', /Names announced/.test(await txt(p, '#hq-count')));
  check('elf hq: names announced and exchange fields', await vis(p, '#set-announce') && await vis(p, '#set-date'));
  check('elf hq: Launch button for Dan', await vis(p, '#launch-go') && !(await p.locator('#launch-go').isDisabled()));
  await shot(p, '19a-elf-hq-dates-countdown.png'); await p.evaluate(() => document.querySelector('.launch').scrollIntoView({ block: 'center' })); await shot(p, '19b-elf-hq-launch-button.png');
  await shot(p, '19-elf-hq-full.png', true);
  /* settings save: London time to ms */
  await p.fill('#set-announce', '2026-12-01T10:00'); await p.fill('#set-date', '2026-12-18'); await p.click('#set-save'); await p.waitForTimeout(300);
  check('elf hq: announce 1 Dec 10:00 London saved as 10:00 UTC', (await store(p, 'santaTest/settings/announceTs')) === Date.parse('2026-12-01T10:00:00Z'), await store(p, 'santaTest/settings/announceTs'));
  await p.fill('#set-announce', '2027-06-01T10:00'); await p.fill('#set-date', '2027-06-18'); await p.click('#set-save'); await p.waitForTimeout(300);
  check('elf hq: summer time is handled (10:00 BST is 09:00 UTC)', (await store(p, 'santaTest/settings/announceTs')) === Date.parse('2027-06-01T09:00:00Z'));
  await p.fill('#set-announce', '2026-12-20T10:00'); await p.fill('#set-date', '2026-12-18'); await p.click('#set-save'); await p.waitForTimeout(300);
  check('elf hq: names after the exchange is refused', (await store(p, 'santaTest/settings/announce')) === '2027-06-01T10:00');
  /* launch confirm */
  p = await open(browser, SANTA, fixture({ drawn: false }), DAN);
  await p.waitForSelector('#tabs:not([hidden])', { timeout: 15000 }); await p.click('#tab-elves'); await p.waitForTimeout(400);
  await p.click('#launch-go'); await p.waitForTimeout(500);
  check('launch: Are you sure? pop up', /Are you sure/.test(await txt(p, '#mbox')) && /9/.test(await txt(p, '#mbox')));
  await shot(p, '20-launch-are-you-sure.png');
  await p.click('#m-no'); await p.waitForTimeout(200);
  check('launch: Not yet writes nothing', (await store(p, 'santaTest/launchRequest')) == null);
  await p.click('#launch-go'); await p.waitForTimeout(300); await p.click('#m-yes'); await p.waitForTimeout(600);
  const lr = await store(p, 'santaTest/launchRequest');
  check('launch: Yes writes one launch request', lr && lr.by === 'dan1' && lr.byName === 'Dan');
  check('launch: Elf HQ shows Launching', /Launching/.test(await txt(p, '#launch-state')));
  /* 3. a manager: Elf HQ but no settings or launch */
  p = await open(browser, SANTA, fixture({ drawn: false }), Object.assign({}, NOEL, { uid: 'nat1' }));
  await p.evaluate(() => { window.__STORE.data.lockup.config.managers.nathan = { name: 'Nathan', email: 'noel.snow@hedinautomotive.co.uk' }; });
  await p.waitForSelector('#tabs:not([hidden])', { timeout: 15000 }); await p.click('#tab-elves'); await p.waitForTimeout(400);
  check('manager: settings read only and no Launch button', await p.locator('#set-save').isDisabled() && !(await vis(p, '#launch-go')));
  /* 4. live, before the names time: locked present with countdown */
  p = await open(browser, SANTA, fixture({ drawn: true, live: true, launched: true }), DAN);
  await p.waitForSelector('.giftbox.locked', { timeout: 15000 }); await p.waitForTimeout(600);
  check('live before names: present locked, no unwrap button', !(await vis(p, '#unwrap')) && await vis(p, '.lock'));
  check('live before names: countdown to the names', /Names announced/.test(await txt(p, '#count')));
  await shot(p, '21-santa-home-locked-countdown.png');
  await p.click('#tab-elves'); await p.waitForTimeout(400);
  check('elf hq: live state shown after launch', /Live since/.test(await txt(p, '#launch-state')) && !(await vis(p, '#launch-go')));
  await shot(p, '22-elf-hq-after-launch.png', true);
  /* 5. names out: unwrap, countdown switches to the exchange */
  p = await open(browser, SANTA, fixture({ drawn: true, live: true, launched: true, announceIn: -H }), DAN);
  await p.waitForSelector('#unwrap', { timeout: 15000 });
  check('names out: countdown is to the present exchange', /Present exchange/.test(await txt(p, '#count')));
  await p.click('#unwrap'); await p.waitForSelector('.rcard', { timeout: 5000 });
  const mine = await store(p, 'santaTest/assign/' + K(DAN.email));
  check('names out: unwraps to your own giftee', (await txt(p, '.rname')) === mine.name);
  /* 6. the team home button */
  p = await open(browser, '/team.html', fixture(), DAN);
  await p.waitForSelector('#v-home:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(800);
  check('team home: Secret Santa says Coming soon', await vis(p, '#santa-soon'));
  const errs = [].concat.apply([], PAGES.map(x => x.__errors));
  check('no page errors on any screen', !errs.length, errs.join(' | '));
  await browser.close(); srv.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
