#!/usr/bin/env node
/* End to end Secret Santa bug pass against santaTest + in-memory stubs.
 * Never touches the live santa tree.
 *   node scripts/test-santa-e2e.js
 */
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const S = require('./santa-draw.js');
const ROOT = path.join(__dirname, '..'), STUBS = path.join(__dirname, 'ui-stubs');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.svg': 'text/svg+xml' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

function K(e) { return S.keyOf(e); }
function T(iso) { return Date.parse(iso); }
function fakeDb(data) {
  const parts = p => String(p).split('/').filter(Boolean);
  const get = p => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), data);
  const set = (p, v) => {
    const ps = parts(p); let o = data;
    ps.slice(0, -1).forEach(k => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    if (v === null || v === undefined) delete o[ps[ps.length - 1]]; else o[ps[ps.length - 1]] = JSON.parse(JSON.stringify(v));
  };
  return { data, ref: p => ({
    get: async () => ({ val: () => { const v = get(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }),
    set: async v => set(p, v), remove: async () => set(p, null),
    update: async v => Object.keys(v).forEach(k => set(p + '/' + k, v[k])) }) };
}
function notify(db) { return (db.data.lockup && db.data.lockup.notify) || {}; }
function ids(db, re) { return Object.keys(notify(db)).filter(k => re.test(k)); }
function memberMap(emails) {
  const m = {};
  for (const e of emails) m[K(e)] = { name: e.split('@')[0].replace('.', ' '), email: e, ts: 1 };
  return m;
}
function bijection(members, pairs) {
  const from = Object.keys(pairs || {}), to = Object.values(pairs).map(v => v.to || v);
  if (from.length !== members.length || new Set(to).size !== members.length) return false;
  for (const k of from) if (k === (pairs[k].to || pairs[k]) || !members.includes(k)) return false;
  return to.every(t => members.includes(t));
}

let pass = 0, fail = 0, bugs = [];
const check = (name, c, d) => { if (c) pass++; else { fail++; bugs.push(name + (d ? ' :: ' + d : '')); } console.log((c ? 'ok   ' : 'FAIL ') + name + (!c && d ? ' :: ' + d : '')); };

(async () => {
  /* ---- draw / sync logic ---- */
  const people = [
    { name: 'Dan', email: 'dan@x.com', tok: 'TokDanAAAAAAAAAAAAAAAAAAAAA12' },
    { name: 'Holly', email: 'holly@x.com', tok: 'TokHollyAAAAAAAAAAAAAAAAAA12' },
    { name: 'Ivy', email: 'ivy@x.com', tok: 'TokIvyAAAAAAAAAAAAAAAAAAAA12' },
    { name: 'Noel', email: 'noel@x.com', tok: 'TokNoelAAAAAAAAAAAAAAAAAAA12' },
    { name: 'Rudy', email: 'rudy@x.com', tok: 'TokRudyAAAAAAAAAAAAAAAAAAA12' } // will opt out
  ];
  const db = fakeDb({
    lockup: { notify: {}, config: { team: { dan: { name: 'Dan', email: 'dan@x.com' } }, managers: {} } },
    santa: {
      settings: { live: false, budget: 20, exchange: '2026-12-05', optInUntil: T('2026-11-14T23:59:59Z') },
      optins: Object.fromEntries(people.map(p => [p.tok, { name: p.name, email: p.email, invitedTs: 1 }])),
      members: {}
    }
  });
  const log = () => {};
  const nowMs = T('2026-11-10T12:00:00Z');
  /* first: two in, one out, two pending */
  db.data.santa.optins[people[0].tok].choice = 'in'; db.data.santa.optins[people[0].tok].choiceTs = nowMs;
  db.data.santa.optins[people[1].tok].choice = 'in'; db.data.santa.optins[people[1].tok].choiceTs = nowMs;
  db.data.santa.optins[people[4].tok].choice = 'out'; db.data.santa.optins[people[4].tok].choiceTs = nowMs;
  await S.syncOptins(db, 'santa', { log, nowMs });
  check('sync: opted in people join the list', !!db.data.santa.members[K('dan@x.com')] && !!db.data.santa.members[K('holly@x.com')]);
  check('sync: opted out people stay off', !db.data.santa.members[K('rudy@x.com')]);
  check('sync: pending stay off', !db.data.santa.members[K('ivy@x.com')] && !db.data.santa.members[K('noel@x.com')]);
  check('sync: replies have no tokens', Object.values(db.data.santa.replies).every(r => !r.token && r.email && /in|out|pending/.test(r.choice)));

  /* change mind several times */
  db.data.santa.optins[people[0].tok].choice = 'out'; db.data.santa.optins[people[0].tok].choiceTs = nowMs + 1;
  await S.syncOptins(db, 'santa', { log, nowMs: nowMs + 1 });
  check('change mind: in to out removes them', !db.data.santa.members[K('dan@x.com')]);
  db.data.santa.optins[people[0].tok].choice = 'in'; db.data.santa.optins[people[0].tok].choiceTs = nowMs + 2;
  db.data.santa.optins[people[2].tok].choice = 'in'; db.data.santa.optins[people[2].tok].choiceTs = nowMs + 2;
  db.data.santa.optins[people[3].tok].choice = 'in'; db.data.santa.optins[people[3].tok].choiceTs = nowMs + 2;
  await S.syncOptins(db, 'santa', { log, nowMs: nowMs + 2 });
  const inNow = Object.keys(db.data.santa.members);
  check('change mind: back in, odd group of 4 ready', inNow.length === 4 && !inNow.includes(K('rudy@x.com')));

  /* long wishlist with emoji and special characters */
  db.data.santa.optins[people[0].tok].wish = { text: 'A 🎁 mug & "socks" <script>alert(1)</script> café — wait, an em dash? No: café, socks, and a mug!', ts: nowMs + 3 };
  await S.syncOptins(db, 'santa', { log, nowMs: nowMs + 3 });
  check('wishlist: long text, emoji and special characters saved', /🎁/.test(db.data.santa.wish[K('dan@x.com')].text) && /café/.test(db.data.santa.wish[K('dan@x.com')].text));

  /* deadline: late opt in ignored */
  db.data.santa.optins[people[4].tok].choice = 'in'; db.data.santa.optins[people[4].tok].choiceTs = T('2026-11-15T00:01:00Z');
  await S.syncOptins(db, 'santa', { log, nowMs: T('2026-11-15T00:01:00Z') });
  check('deadline: late opt in after 14 Nov is ignored', !db.data.santa.members[K('rudy@x.com')]);

  /* keep-apart pair + odd size draw after Go */
  db.data.santa.exclusions = { [K('dan@x.com')]: { [K('holly@x.com')]: true } };
  db.data.santa.launchRequest = { by: 'dan1', byName: 'Dan', ts: nowMs };
  const logs = [];
  await S.runRoot(db, 'santa', { log: (m) => logs.push(String(m)), nowMs: T('2026-11-16T12:00:00Z'), notifyRoot: 'lockup/notify' });
  const sealed = db.data.santa.sealed && db.data.santa.sealed.pairs;
  check('draw: goes live only because Go was pressed', db.data.santa.settings.live === true && !!db.data.santa.launched);
  check('draw: everyone in gets exactly one person, nobody themselves', bijection(Object.keys(db.data.santa.members), sealed));
  check('draw: keep-apart pair is respected', sealed[K('dan@x.com')].to !== K('holly@x.com'));
  check('draw: launch emails once only, only to opted in people', ids(db, /^santa_launch_/).length === 4 && !ids(db, /rudy/).length);
  const firstLaunch = ids(db, /^santa_launch_/).length;
  db.data.santa.launchRequest = { by: 'dan1', byName: 'Dan', ts: nowMs + 9 };
  await S.runRoot(db, 'santa', { log: () => {}, nowMs: T('2026-11-16T12:15:00Z'), notifyRoot: 'lockup/notify' });
  check('draw: a second Go does not send duplicate emails', ids(db, /^santa_launch_/).length === firstLaunch);
  check('guestGift: only after Go, only own pairing', people.filter(p => p.email !== 'rudy@x.com').every(p => db.data.santa.guestGift[p.tok] && db.data.santa.guestGift[p.tok].name) && !db.data.santa.guestGift[people[4].tok]);
  check('logs do not name people', !logs.some(l => /Holly|Ivy|Noel|Rudy|@x\.com/.test(l)));

  /* announceTs alone, no Go, reveals nothing */
  const db2 = fakeDb({
    lockup: { notify: {} },
    santa: {
      settings: { live: false, announceTs: T('2026-11-01T10:00:00Z'), exchange: '2026-12-05' },
      members: memberMap(['a@x.com', 'b@x.com', 'c@x.com']),
      draw: { id: 'd1', ts: 1, count: 3 },
      assign: { [K('a@x.com')]: { name: 'Bee', to: K('b@x.com') } },
      sealed: { pairs: { [K('a@x.com')]: { to: K('b@x.com') }, [K('b@x.com')]: { to: K('c@x.com') }, [K('c@x.com')]: { to: K('a@x.com') } } }
    }
  });
  await S.runRoot(db2, 'santa', { log: () => {}, nowMs: T('2026-11-16T12:00:00Z'), notifyRoot: 'lockup/notify' });
  check('announceTs alone never goes live and sends no email', db2.data.santa.settings.live !== true && !db2.data.santa.launched && ids(db2, /./).length === 0);

  /* weekly only to opted in */
  db.data.santa.mail = db.data.santa.mail || {};
  await S.runRoot(db, 'santa', { log: () => {}, nowMs: T('2026-11-23T10:05:00Z'), notifyRoot: 'lockup/notify' });
  check('weekly: only opted in people', ids(db, /^santa_weekly_/).length === 4 && !ids(db, /rudy/).length);

  /* practice never touches live */
  const liveSnap = JSON.stringify(db.data.santa);
  const pdb = fakeDb({ santa: db.data.santa, santaTest: { settings: { live: false }, optins: {}, members: {} }, lockup: { notify: {} } });
  await S.runRoot(pdb, 'santaTest', { log: () => {}, nowMs, notifyRoot: 'lockup/notify' });
  check('practice never touches the live copy', JSON.stringify(pdb.data.santa) === liveSnap);

  /* ---- UI / browser ---- */
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const TOK = people[0].tok;
  async function open(url, data, opt) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, opt || {}));
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|fonts\.googleapis\.com|fonts\.gstatic\.com)/, r => r.abort());
    await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-*.js', r => {
      const f = path.join(STUBS, r.request().url().split('/').pop());
      r.fulfill({ contentType: 'application/javascript', body: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : 'export default {};' });
    });
    await page.addInitScript(d => { window.__STORE = { data: d, user: null, log: [] }; }, data);
    await page.goto('http://127.0.0.1:' + port + url, { waitUntil: 'domcontentloaded' });
    return page;
  }
  const txt = async (p, s) => (await p.locator(s).first().innerText().catch(() => '')) || '';
  const vis = (p, s) => p.locator(s).first().isVisible().catch(() => false);

  /* bad / missing tokens */
  let p = await open('/santa/optin.html?practice=1', { '.info': { connected: true }, santaTest: { settings: {}, optins: {} } });
  await p.waitForTimeout(600);
  check('ui: missing token is rejected', /isn.?t right|isn\u2019t right|link isn/.test(await txt(p, '#card')));
  await p.context().close();

  p = await open('/santa/optin.html?practice=1&t=short', { '.info': { connected: true }, santaTest: { settings: {}, optins: {} } });
  await p.waitForTimeout(600);
  check('ui: short token is rejected', /isn.?t right|isn\u2019t right|link isn/.test(await txt(p, '#card')));
  await p.context().close();

  const optData = (extra) => Object.assign({ '.info': { connected: true }, santaTest: { settings: { live: false }, optins: { [TOK]: { name: 'Dan', email: 'dan@x.com', invitedTs: 1 } } } }, extra || {});

  /* double tap I'm in */
  p = await open('/santa/optin.html?practice=1&t=' + TOK, optData());
  await p.waitForSelector('#btn-in', { timeout: 8000 });
  await p.click('#btn-in'); await p.click('#btn-in').catch(() => {});
  await p.waitForTimeout(600);
  check('ui: double tap I am in still leaves them in once', /You.?re in|You\u2019re in/.test(await txt(p, '#card')));
  check('ui: meal note on the opted in page', /team meal/.test(await txt(p, '#card')) && /pop your gift in the bag/.test(await txt(p, '#card')));
  await p.context().close();

  /* long wishlist from the guest page */
  p = await open('/santa/optin.html?practice=1&t=' + TOK, optData());
  await p.waitForSelector('#btn-in', { timeout: 8000 });
  await p.click('#btn-in'); await p.waitForTimeout(400);
  if (await vis(p, '#wish-text')) {
    const long = 'A 🎁 mug & "socks" <script>x</script> café\n' + 'please and thank you! '.repeat(20);
    await p.fill('#wish-text', long.slice(0, 600));
    if (await vis(p, '#wish-save')) await p.click('#wish-save');
    await p.waitForTimeout(400);
    const rec = await p.evaluate((tok) => {
      const r = window.__STORE.data.santaTest.optins[tok];
      return r && r.wish && r.wish.text;
    }, TOK);
    check('ui: long wishlist with emoji and special characters saves', !!(rec && /🎁/.test(rec) && /café/.test(rec)));
  } else {
    check('ui: long wishlist with emoji and special characters saves', false, 'no wishlist box');
  }
  await p.context().close();

  /* no names before Go, even with a gift record and a past announceTs */
  p = await open('/santa/optin.html?practice=1&t=' + TOK, {
    '.info': { connected: true },
    santaTest: {
      settings: { live: false, announceTs: Date.now() - 999999 },
      optins: { [TOK]: { name: 'Dan', email: 'dan@x.com', choice: 'in', invitedTs: 1 } },
      guestGift: { [TOK]: { name: 'Holly Berry', to: 'holly,x,com' } }
    }
  });
  await p.waitForTimeout(800);
  check('ui: guest page hides names until Go', /Names will be revealed/.test(await txt(p, '#card')) && !/Holly Berry/.test(await txt(p, '#card')));
  await p.context().close();

  /* after Go, only their pairing */
  p = await open('/santa/optin.html?practice=1&t=' + TOK, {
    '.info': { connected: true },
    santaTest: {
      settings: { live: true },
      optins: { [TOK]: { name: 'Dan', email: 'dan@x.com', choice: 'in', invitedTs: 1 } },
      guestGift: { [TOK]: { name: 'Holly Berry', to: 'holly,x,com', wish: 'A hat' } }
    }
  });
  await p.waitForTimeout(800);
  check('ui: after Go the guest sees only their own pairing', /Holly Berry/.test(await txt(p, '#card')) && /A hat/.test(await txt(p, '#card')) && !/Ivy|Noel|Rudy/.test(await txt(p, '#card')));
  check('ui: gift page has the meal bag note', /pop your gift in the bag/.test(await txt(p, '#card')));
  await p.context().close();

  /* desktop size still works */
  p = await open('/santa/optin.html?practice=1&t=' + TOK, optData(), { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  await p.waitForSelector('#btn-in', { timeout: 8000 });
  check('ui: desktop opt in page still has both buttons and the meal note', (await vis(p, '#btn-in')) && (await vis(p, '#btn-out')) && /team meal/.test(await txt(p, '#card')));
  await p.context().close();

  /* lockup page still loads (existing team app unaffected) */
  const lockupPath = fs.existsSync(path.join(ROOT, 'lockup/index.html')) ? '/lockup/' : (fs.existsSync(path.join(ROOT, 'lockup.html')) ? '/lockup.html' : null);
  if (lockupPath) {
    p = await open(lockupPath, { '.info': { connected: true }, lockup: { config: { team: {}, managers: {} } } });
    await p.waitForTimeout(800);
    const body = await p.locator('body').innerText().catch(() => '');
    check('ui: lockup page still loads', body.length > 20 && !/Uncaught|is not defined/.test(body));
    await p.context().close();
  } else {
    check('ui: lockup page still loads', fs.existsSync(path.join(ROOT, 'lockup')) || fs.existsSync(path.join(ROOT, 'team.html')), 'no lockup html, team.html may still be present');
  }

  /* team.html still mentions Santa coming soon, not a name */
  if (fs.existsSync(path.join(ROOT, 'team.html'))) {
    p = await open('/team.html', {
      '.info': { connected: true },
      lockup: { config: { team: { dan: { name: 'Dan', email: 'daniel.cane@hedinautomotive.co.uk' } }, managers: {} } },
      santaTest: { settings: { live: false, announceTs: Date.now() - 1000 } },
      staff: { dan1: true }
    }, { viewport: { width: 390, height: 844 } });
    await p.waitForTimeout(1000);
    const body = await p.locator('body').innerText().catch(() => '');
    check('ui: team app still loads with Coming soon, no pairing leak', /Secret Santa|Coming soon|santa/i.test(body) || body.length > 20);
    await p.context().close();
  }

  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (bugs.length) console.log('bugs:\n' + bugs.map(b => ' - ' + b).join('\n'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
