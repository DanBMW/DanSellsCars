#!/usr/bin/env node
/* The personal showroom cover link (cover.html), against the in-memory Firebase stubs.
 * Nothing touches the real database.
 *   node scripts/test-cover-ui.js   (CHROME=... optional; SHOTS=/dir saves screenshots)
 */
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), STUBS = path.join(__dirname, 'ui-stubs'), OUT = process.env.SHOTS;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const f = path.join(ROOT, p);
  if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const TOK = 'Ab3_dEf-ghIJklmnOPqrstUVwxyz0123', DATE = '2026-11-18';
/* 10:30 London on the day, inside the 09:00 to 12:00 shift */
const NOW = Date.UTC(2026, 10, 18, 10, 30);
const fixture = o => {
  o = o || {};
  const link = { date: DATE, shift: 'am2', personId: 'mon', name: 'Mon', from: '09:00', to: '12:00', ts: 1 };
  const seat = Object.assign({ personId: 'mon', status: 'assigned', ts: 1 }, o.seat || {});
  /* as the real rules treat a visitor with no sign in: the link list and the index are closed */
  return { coverLink: { [TOK]: Object.assign(link, o.link || {}) }, lockup: { reception: { [DATE]: { am2: seat } } }, __deny: ['^coverLinkIdx'].concat(o.deny || []) };
};
let pass = 0, fail = 0;
const check = (name, c, d) => { if (c) pass++; else fail++; console.log((c ? 'ok   ' : 'FAIL ') + name + (!c && d ? ' :: ' + d : '')); };
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  async function open(url, data, now) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.__errors = []; page.__kicks = [];
    page.on('pageerror', e => page.__errors.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => {
      const u = r.request().url();
      if (/cover-kick/.test(u)) { page.__kicks.push(u); return r.fulfill({ status: 200, body: '{}' }); }
      if (/gstatic\.com\/firebasejs\/10\.12\.0\/firebase-/.test(u)) {
        const f = path.join(STUBS, u.split('/').pop());
        return r.fulfill({ contentType: 'application/javascript', body: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : 'export default {};' });
      }
      return r.abort();
    });
    await page.addInitScript(a => { window.__STORE = { data: a.data, user: null, log: [] }; window.__coverNow = a.now; }, { data, now: now || NOW });
    await page.goto('http://127.0.0.1:' + srv.address().port + url);
    await page.waitForTimeout(500);
    return page;
  }
  const txt = p => p.locator('#c-body').innerText().catch(() => '');
  const store = (p, k) => p.evaluate(k => k.split('/').reduce((o, x) => (o == null ? undefined : o[x]), window.__STORE.data), k);
  const shot = async (p, n) => { if (OUT) await p.screenshot({ path: path.join(OUT, n), fullPage: true }); };

  let p = await open('/cover.html?t=short', fixture());
  check('a malformed link says so', /not right/.test(await txt(p)));
  p = await open('/cover.html?t=' + 'Z'.repeat(32), fixture());
  check('an unknown link has expired', /expired/.test(await txt(p)));

  /* the email's I am covering link opens the page and asks for one tap: nothing is written on load */
  p = await open('/cover.html?t=' + TOK + '&a=covering', fixture());
  let t = await txt(p);
  check('it greets them and names the shift, no sign in', /Hi Mon/.test(t) && /Wednesday 18 November, 09:00 to 12:00/.test(t) && !/sign in to/i.test(t), t);
  check('nothing is written on load, so a link scanner cannot answer', (await store(p, 'coverLink/' + TOK + '/answer')) === undefined);
  await shot(p, 'cover-ask.png');
  await p.click('#c-yes'); await p.waitForTimeout(300);
  const ans = await store(p, 'coverLink/' + TOK + '/answer');
  check('one tap writes I am covering on their link', ans && ans.kind === 'covering' && typeof ans.ts === 'number', JSON.stringify(ans));
  check('the page thanks them and says the reminders stop', /reminders stop/.test(await txt(p)));
  check('and kicks the job so it lands now', p.__kicks.length === 1, JSON.stringify(p.__kicks));
  check('never touches the rota itself', (await store(p, 'lockup/reception/' + DATE + '/am2/status')) === 'assigned');
  await shot(p, 'cover-done.png');
  check('no page errors', !p.__errors.length, p.__errors.join(' | '));

  /* the I cannot cover link opens the reasons; Other needs words */
  p = await open('/cover.html?t=' + TOK + '&a=cannot', fixture());
  check('the cannot link opens the reasons', await p.locator('[data-k="customer"]').isVisible());
  await p.click('#c-send'); await p.waitForTimeout(150);
  check('a reason must be chosen', /choose a reason/.test(await p.locator('#c-msg').innerText()));
  await p.click('[data-k="other"]'); await p.waitForTimeout(150);
  await p.click('#c-send'); await p.waitForTimeout(150);
  check('Other needs words', /say why/.test(await p.locator('#c-msg').innerText()) && (await store(p, 'coverLink/' + TOK + '/answer')) === undefined);
  await p.fill('#c-text', 'Car broke down'); await p.click('#c-send'); await p.waitForTimeout(300);
  const a2 = await store(p, 'coverLink/' + TOK + '/answer');
  check('the decline is written with the reason and the words', a2 && a2.kind === 'other' && a2.text === 'Car broke down', JSON.stringify(a2));
  check('the page says the managers are told', /managers have been told/.test(await txt(p)));
  await shot(p, 'cover-cannot.png');
  p = await open('/cover.html?t=' + TOK, fixture());
  await p.click('#c-no'); await p.click('[data-k="customer"]'); await p.click('#c-send'); await p.waitForTimeout(300);
  check('With a customer needs no words', (await store(p, 'coverLink/' + TOK + '/answer')).kind === 'customer');

  /* the state of the seat decides what is offered */
  p = await open('/cover.html?t=' + TOK, fixture({ seat: { status: 'covering' } }));
  t = await txt(p);
  check('already covering: says so, and offers to step off', /down as covering/.test(t) && /no longer cover/.test(t) && !(await p.locator('#c-yes').count()), t);
  p = await open('/cover.html?t=' + TOK, fixture({ seat: { personId: 'carl', status: 'assigned' } }));
  check('handed to someone else: nothing to do', /handed to someone else/.test(await txt(p)) && !(await p.locator('button').count()));
  p = await open('/cover.html?t=' + TOK, fixture({ seat: { personId: 'carl', status: 'assigned', declined: { mon: true } } }));
  check('they said no earlier: the page says so', /You said you cannot cover/.test(await txt(p)));
  p = await open('/cover.html?t=' + TOK, fixture(), Date.UTC(2026, 10, 18, 12, 5));
  check('after the shift: finished', /finished/.test(await txt(p)) && !(await p.locator('button').count()));
  p = await open('/cover.html?t=' + TOK + '&test=1', { coverLinkTest: fixture().coverLink, lockupTest: fixture().lockup });
  check('the practice copy reads its own link', /Hi Mon/.test(await txt(p)));

  /* the rules refuse the write (for example before they are published): an honest message, a way through */
  p = await open('/cover.html?t=' + TOK, fixture({ deny: ['^coverLink/.*/answer'] }));
  await p.click('#c-yes'); await p.waitForTimeout(300);
  check('a refused answer says so and points to the signed in page', /did not go through/.test(await txt(p)) && await p.locator('#c-msg a[href="reception.html"]').count() === 1);
  check('no dashes in the visible copy', !/ [-–—] /.test(await txt(p)));

  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
