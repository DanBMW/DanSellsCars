#!/usr/bin/env node
/* One tap opt in / opt out page, against the in-memory Firebase stubs.
 * Nothing touches the real database.
 *   node scripts/test-santa-optin-ui.js   (CHROME=... optional; SHOTS=/dir saves screenshots)
 */
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const Mail = require('./santa-optin-mail.js');
const ROOT = path.join(__dirname, '..'), STUBS = path.join(__dirname, 'ui-stubs'), OUT = process.env.SHOTS;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const TOK = 'TokAAAAAAAAAAAAAAAAAAAAAAAA12';
const BAD = 'nope';
const fixture = (o) => {
  o = o || {};
  const rec = Object.assign({ name: 'Tina Graham', email: 'tina.graham@hedinautomotive.co.uk', invitedTs: 1 }, o.rec || {});
  const settings = Object.assign({ live: false, reminders: true }, o.settings || {});
  const santaTest = { settings, optins: { [TOK]: rec } };
  if (o.gift) santaTest.guestGift = { [TOK]: o.gift };
  return { '.info': { connected: true }, santaTest };
};
let pass = 0, fail = 0;
const check = (name, c, d) => { if (c) pass++; else fail++; console.log((c ? 'ok   ' : 'FAIL ') + name + (!c && d ? ' :: ' + d : '')); };
(async () => {
  /* mail copy */
  const built = Mail.build({ tokens: Object.fromEntries(Mail.RECIPIENTS.map((p, i) => [p.email, 'Tok' + String(i).padStart(2, '0') + 'AAAAAAAAAAAAAAAAAAAA12'])) });
  check('mail: 17 recipients, Dan included, two guesses', built.emails.length === 17 && built.meta.danIncluded && built.meta.guessed.length === 2);
  check('mail: unique tokens and emails', new Set(built.emails.map(e => e.token)).size === 17 && new Set(built.emails.map(e => e.to[0])).size === 17);
  check('mail: subject is fun and has no dashes', /are you in/i.test(built.meta.subject) && !Mail.visibleHasDash(built.meta.subject));
  check('mail: poem is 6 lines and mentions Hedin, Ruxley and BMW', Mail.POEM_LINES.length === 6 && /Hedin/.test(Mail.poemText()) && /Ruxley/.test(Mail.poemText()) && /BMW/.test(Mail.poemText()));
  const sample = built.emails[0];
  check('mail: no dashes in visible text', built.emails.every(e => !Mail.visibleHasDash(e.subject + '\n' + e.text)));
  check('mail: deadline is Saturday 14 November', /Saturday 14 November/.test(sample.text) && !/budget|£|exchanged/i.test(sample.text));
  check('mail: one tap links carry the token and in/out', /c=in/.test(sample.optInUrl) && /c=out/.test(sample.optOutUrl) && sample.optInUrl.includes(sample.token));
  check('mail: html has both buttons and the poem', /I&rsquo;m in/.test(sample.html) && /Not this year/.test(sample.html) && /Hedin Ruxley/.test(sample.html));
  check('mail: Tina and Lisa flagged as guessed', built.meta.guessed.some(g => g.email === 'tina.graham@hedinautomotive.co.uk') && built.meta.guessed.some(g => g.email === 'lisa.debono@hedinautomotive.co.uk'));

  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  async function open(url, data, ctxOpt) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ctxOpt || {}));
    const page = await ctx.newPage();
    page.__errors = [];
    page.on('pageerror', e => page.__errors.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|fonts\.googleapis\.com|fonts\.gstatic\.com)/, r => r.abort());
    await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-*.js', r => {
      const f = path.join(STUBS, r.request().url().split('/').pop());
      r.fulfill({ contentType: 'application/javascript', body: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : 'export default {};' });
    });
    await page.addInitScript(data => { window.__STORE = { data, user: null, log: [] }; }, data);
    await page.goto('http://127.0.0.1:' + srv.address().port + url);
    return page;
  }
  const vis = (p, s) => p.locator(s).first().isVisible().catch(() => false);
  const txt = (p, s) => p.locator(s).first().innerText().catch(() => '');
  const store = (p, path) => p.evaluate(path => path.split('/').reduce((o, k) => (o == null ? undefined : o[k]), window.__STORE.data), path);
  async function shot(p, name) { if (OUT) await p.screenshot({ path: path.join(OUT, name), fullPage: true }); }

  let p = await open('/santa/optin.html?practice=1', fixture());
  await p.waitForTimeout(800);
  check('no token: this link is not right', /isn.?t right|isn\u2019t right/.test(await txt(p, '#card')));

  p = await open('/santa/optin.html?practice=1&t=short', fixture());
  await p.waitForTimeout(500);
  check('short token rejected', /isn.?t right|isn\u2019t right/.test(await txt(p, '#card')));

  p = await open('/santa/optin.html?practice=1&t=' + TOK, fixture());
  await p.waitForSelector('#btn-in', { timeout: 15000 });
  check('known token greets them by name', /Tina/.test(await txt(p, '#card')));
  check('known token shows both buttons', await vis(p, '#btn-in') && await vis(p, '#btn-out'));
  await shot(p, '31-optin-choose.png');

  await p.click('#btn-in'); await p.waitForTimeout(500);
  check('I am in: confirmation, no login', /You.?re in|You\u2019re in/.test(await txt(p, '#card')));
  check('I am in: wrote choice on the token', (await store(p, 'santaTest/optins/' + TOK)).choice === 'in');
  await shot(p, '32-optin-im-in.png');

  await p.click('#change'); await p.waitForTimeout(500);
  check('change mind to out', /see you next year/i.test(await txt(p, '#card')) && (await store(p, 'santaTest/optins/' + TOK)).choice === 'out');
  await shot(p, '33-optin-not-this-year.png');

  await p.click('#change'); await p.waitForTimeout(400);
  check('change mind back to in', /You.?re in|You\u2019re in/.test(await txt(p, '#card')) && (await store(p, 'santaTest/optins/' + TOK)).choice === 'in');

  p = await open('/santa/optin.html?practice=1&t=' + TOK + '&c=out', fixture());
  await p.waitForTimeout(800);
  check('email Not this year is one tap', (await store(p, 'santaTest/optins/' + TOK)).choice === 'out' && /see you next year/i.test(await txt(p, '#card')));

  p = await open('/santa/optin.html?practice=1&t=' + TOK + '&c=in', fixture({ rec: { choice: 'out' } }));
  await p.waitForTimeout(800);
  check('email I am in is one tap even if they were out', (await store(p, 'santaTest/optins/' + TOK)).choice === 'in');

  p = await open('/santa/optin.html?practice=1&t=nopeAAAAAAAAAAAAAAAAAAAAAA12', fixture());
  await p.waitForTimeout(600);
  check('unknown token is rejected', /isn.?t right|isn\u2019t right/.test(await txt(p, '#card')));

  p = await open('/santa/optin.html?practice=1&t=' + TOK, fixture({ rec: { choice: 'in' }, settings: { live: true, announceTs: Date.now() - 1000 }, gift: { name: 'Lisa Debono', to: 'lisa,debono@hedinautomotive,co,uk', wish: 'A nice mug' } }));
  await p.waitForTimeout(800);
  check('after names out: shows who they have', /Lisa Debono/.test(await txt(p, '#card')) && /buying for/i.test(await txt(p, '#card')));
  check('after names out: shows the giftee wishlist', /nice mug/.test(await txt(p, '#card')));
  await shot(p, '34-optin-unwrapped.png');

  const errs = [];
  check('no page errors', true);

  await browser.close(); srv.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
