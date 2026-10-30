#!/usr/bin/env node
/* Runs the real team pages (team.html, team-admin.html, lockup.html,
 * Forecourt.html, team-board.html, shifts.html) in headless Chromium, against
 * an in-memory Firebase (scripts/ui-stubs/) and a scripted Google sign in.
 * Nothing touches the real database.
 *
 *   npm i playwright        (or use an installed Chromium; see CHROME below)
 *   node scripts/test-team-ui.js
 *
 * Playwright's Chromium is used as installed (chromium.launch()). Set
 * CHROME=/path/to/chrome to use another binary.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const LR = require('../lockup-rota.js');

const ROOT = path.join(__dirname, '..');
const STUBS = path.join(__dirname, 'ui-stubs');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

/* ---------- a static server for the repo ---------- */
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const f = path.join(ROOT, p);
      if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

/* ---------- fixtures: the team, the rota and the shifts, as the live database holds them ---------- */
const D = LR.defaults();
const TEAM = Object.assign({}, D.team, {
  chloe: { name: 'Chloe', fullName: 'Chloe Smith', email: 'chloe.smith@hedinautomotive.co.uk', off: 'tue', never: ['wed'], fixed: ['mon'], active: true, order: 7 },
  molly: { name: 'Molly', fullName: 'Molly Jones', email: 'molly.jones@hedinautomotive.co.uk', off: 'thu', fixed: ['mon'], active: true, order: 8 }
});
const FIX = {
  lockup: {
    config: { testMode: false, seeded: 1, team: TEAM, managers: D.managers, checklist: D.checklist },
    absences: {
      a1: { personId: 'carl', from: '2026-11-09', to: '2026-11-13', kind: 'holiday', status: 'approved', note: 'Carl holiday' }
    },
    weeks: { '2026-W44': { v: 2, days: { mon: ['chloe', 'molly'], tue: ['tomi', 'karis'], wed: ['tomi', 'clive'], thu: ['karis', 'danny'], fri: ['carl', 'mon'] } } },
    status: { '2026-10-30': { state: 'signed', by: 'Carl' } }
  },
  shifts: {
    managers: { will: true },
    links: { will1: 'will', carl1: 'carl' },
    requests: {
      r1: { personId: 'karis', kind: 'holiday', from: '2026-11-17', to: '2026-11-18', status: 'pending', ts: 1000 },
      w1: { personId: 'tomi', withId: 'danny', kind: 'swap', date: '2026-11-11', status: 'awaiting', ts: 2000 }
    },
    audit: {}
  },
  staff: { dan1: true }
};
const U = {
  tomi: { uid: 'tomi1', email: 'tomiwa.adelaja@hedinautomotive.co.uk', emailVerified: true },
  danny: { uid: 'danny1', email: 'danny.willis@hedinautomotive.co.uk', emailVerified: true },
  carl: { uid: 'carl1', email: 'carl.hadwin@hedinautomotive.co.uk', emailVerified: true },
  will: { uid: 'will1', email: 'will.potter@hedinautomotive.co.uk', emailVerified: true },
  dan: { uid: 'dan1', email: 'daniel.cane@hedinautomotive.co.uk', emailVerified: true },
  gmail: { uid: 'g1', email: 'someone@gmail.com', emailVerified: true },
  unverified: { uid: 'u1', email: 'tomiwa.adelaja@hedinautomotive.co.uk', emailVerified: false },
  stranger: { uid: 's1', email: 'stranger@hedinautomotive.co.uk', emailVerified: true }
};
const BANK = { 'england-and-wales': { events: [{ title: 'Christmas Day', date: '2026-12-25' }] } };

/* ---------- harness ---------- */
const CHECKS = [];
function check(name, cond, detail) {
  CHECKS.push({ name, ok: !!cond });
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (!cond && detail ? ' :: ' + detail : ''));
}
async function open(browser, base, page0, url, user, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  /* nothing leaves the test: anything not served here is refused, except the Firebase stubs and the bank holiday list */
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await page.route('https://www.gov.uk/bank-holidays.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(BANK) }));
  await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-*.js', r => {
    const name = r.request().url().split('/').pop();
    const f = path.join(STUBS, name);
    if (fs.existsSync(f)) r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(f, 'utf8') });
    else r.fulfill({ contentType: 'application/javascript', body: 'export default {};' });
  });
  const data = JSON.parse(JSON.stringify(opts.data || FIX));
  const popup = opts.popupUser === undefined ? user : opts.popupUser;
  await page.addInitScript(({ data, user, popup }) => {
    window.__STORE = { data, user, popupUser: popup, log: [] };
  }, { data, user: user || null, popup: popup || null });
  await page.goto(base + url);
  page.__errors = errors;
  page.__ctx = ctx;
  return page;
}
const store = (page) => page.evaluate(() => ({ data: window.__STORE.data, log: window.__STORE.log.slice() }));
const at = (data, p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), data);
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
const txt = (page, sel) => page.locator(sel).first().textContent().catch(() => '');
async function setNow(page, d) { await page.evaluate((d) => { if (window.TeamHome) window.TeamHome._setNow(d); if (window.ShiftsApp) window.ShiftsApp._setNow(d); }, d); }

/* ---------- the scenarios ---------- */
async function scenarios(browser, base) {
  /* 1. the team home: every sign in state */
  {
    const p = await open(browser, base, null, '/team.html', null);
    await p.waitForSelector('#v-signin:not([hidden])', { timeout: 8000 });
    check('home: signed out shows the sign in card', await visible(p, '#btn-signin'));
    check('home: signed out has no cards', (await p.locator('#cards a').count()) === 0);
    await p.click('#btn-signin');
    await p.waitForTimeout(300);
    check('home: a cancelled popup is not an error message', (await txt(p, '#signin-msg')).trim() === '');
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/team.html', U.gmail, { popupUser: U.gmail });
    await p.waitForSelector('#v-wrong:not([hidden])', { timeout: 8000 });
    check('home: a personal Gmail is refused', (await txt(p, '#wrong-email')).indexOf('gmail') >= 0);
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/team.html', U.unverified);
    await p.waitForSelector('#v-wrong:not([hidden])', { timeout: 8000 });
    check('home: an unverified Hedin address is refused', await visible(p, '#v-wrong'));
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/team.html', U.stranger);
    await p.waitForSelector('#v-unlinked:not([hidden])', { timeout: 8000 });
    check('home: a Hedin address not on the team list is told so', (await txt(p, '#unlinked-email')).indexOf('stranger') >= 0);
    await p.close();
  }
  /* a team member: home, the link is saved, the four cards, no admin */
  {
    const p = await open(browser, base, null, '/team.html', U.tomi);
    await p.waitForSelector('#v-home:not([hidden])', { timeout: 8000 });
    await setNow(p, '2026-10-30');
    await p.waitForTimeout(300);
    const st = await store(p);
    check('home: Tomi lands on the home page', await visible(p, '#v-home'));
    check('home: greeting uses his first name', (await txt(p, '#home-hello')) === 'Hello, Tomi', await txt(p, '#home-hello'));
    check('home: role is Team', (await txt(p, '#home-role')) === 'Team');
    const cards = await p.locator('#cards a').allTextContents();
    check('home: a team member sees the four systems', cards.length === 4 && ['Lockup', 'Forecourt', 'Team board', 'Team calendar'].every(w => cards.some(c => c.indexOf(w) === 0)), cards.join(' | '));
    check('home: no admin card for staff', !cards.some(c => c.indexOf('Team admin') === 0));
    check('home: the first sign in saves the link to his person', st.log.some(l => l[0] === 'set' && l[1] === 'shifts/links/tomi1'), JSON.stringify(st.log.slice(-4)));
    check('home: lockup tile says tonight is signed by Carl', (await txt(p, '#cards a[href="lockup.html"] .live')).indexOf('Signed by Carl') >= 0, await txt(p, '#cards a[href="lockup.html"] .live'));
    check('home: calendar tile gives the day count', /\d+ on, minimum 5/.test(await txt(p, '#cards a[href="shifts.html"] .live')), await txt(p, '#cards a[href="shifts.html"] .live'));
    const nd = await p.locator('#next-days li').count();
    check('home: next seven days are listed', nd === 7, 'got ' + nd);
    const waiting = await txt(p, '#waiting');
    check('home: Tomi is told his own swap is waiting for Danny', /Danny/.test(waiting) || /Your request/.test(waiting) || /Nothing needs you/.test(waiting), waiting);
    await p.screenshot({ path: path.join(OUT, 'team-home-phone.png'), fullPage: true });
    check('home: no page errors for Tomi', p.__errors.length === 0, p.__errors.join(' | '));
    await p.close();
  }
  /* Danny is asked to take a shift, so it is waiting on him */
  {
    const p = await open(browser, base, null, '/team.html', U.danny);
    await p.waitForSelector('#v-home:not([hidden])', { timeout: 8000 });
    await setNow(p, '2026-10-30');
    await p.waitForTimeout(200);
    const w = await txt(p, '#waiting');
    check('home: Danny is asked to take Tomi’s shift', /asks you to take the shift/.test(w), w);
    check('home: Danny is pointed to the calendar to answer', (await p.locator('#waiting a[href="shifts.html"]').count()) >= 1);
    await p.close();
  }
  /* Will is a manager: sees the pending holiday waiting for a manager, and not the admin panel */
  {
    const p = await open(browser, base, null, '/team.html', U.will);
    await p.waitForSelector('#v-home:not([hidden])', { timeout: 8000 });
    await setNow(p, '2026-10-30');
    await p.waitForTimeout(200);
    check('home: Will is a manager', (await txt(p, '#home-role')) === 'Manager', await txt(p, '#home-role'));
    check('home: Will sees the request waiting for a manager', /1 request waiting for a manager/.test(await txt(p, '#waiting')), await txt(p, '#waiting'));
    check('home: a manager has no admin card', (await p.locator('#cards a[href="team-admin.html"]').count()) === 0);
    await p.close();
  }
  /* Dan is admin on his work account: the admin card appears */
  {
    const p = await open(browser, base, null, '/team.html', U.dan);
    await p.waitForSelector('#v-home:not([hidden])', { timeout: 8000 });
    await p.waitForTimeout(200);
    check('home: Dan is admin', (await txt(p, '#home-role')) === 'Admin', await txt(p, '#home-role'));
    check('home: Dan has the admin card', (await p.locator('#cards a[href="team-admin.html"]').count()) === 1);
    await p.close();
  }

  /* 2. the admin panel */
  {
    const p = await open(browser, base, null, '/team-admin.html', U.tomi);
    await p.waitForSelector('#v-loading:not([hidden])', { timeout: 8000 });
    await p.waitForTimeout(400);
    check('admin: a team member without manager access is turned away', (await txt(p, '#loading-msg')).indexOf('managers and admins') >= 0, await txt(p, '#loading-msg'));
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/team-admin.html', U.will);
    await p.waitForSelector('#v-app:not([hidden])', { timeout: 8000 });
    await p.waitForTimeout(300);
    check('admin: a manager sees the panel read only', await visible(p, '#ro-note'));
    check('admin: a manager cannot add people', !(await visible(p, '#btn-add')));
    check('admin: a manager cannot edit people', (await p.locator('[data-edit]').count()) === 0);
    check('admin: a manager cannot switch test mode', !(await visible(p, '#tm-btn')));
    check('admin: managers and access are listed', (await txt(p, '#people')).indexOf('Tomi') >= 0 && (await txt(p, '#links')).indexOf('Carl') >= 0);
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/team-admin.html', U.dan);
    await p.waitForSelector('#v-app:not([hidden])', { timeout: 8000 });
    await p.waitForTimeout(300);
    check('admin: Dan sees the write controls', (await visible(p, '#btn-add')) && (await p.locator('[data-edit]').count()) > 5);
    const notSigned = await txt(p, '#links');
    check('admin: people who have not signed in yet are shown', /Not signed in yet/.test(notSigned) && /Danny/.test(notSigned) && /Chloe/.test(notSigned), notSigned.slice(0, 200));
    /* edit Tomi's first name */
    await p.locator('[data-edit="team|tomi"]').click();
    await p.waitForSelector('#pf');
    await p.fill('#pf [name=fullName]', 'Tomiwa Adelaja');
    await p.click('#pf button[type=submit]');
    await p.waitForTimeout(300);
    let st = await store(p);
    check('admin: an edit writes the person to the lockup team list', at(st.data, 'lockupTest/config/team/tomi') === undefined && at(st.data, 'lockup/config/team/tomi').fullName === 'Tomiwa Adelaja', JSON.stringify(at(st.data, 'lockup/config/team/tomi')));
    check('admin: the edit is logged to the audit', st.log.some(l => l[1].indexOf('shifts/audit/') === 0));
    /* a bad email is refused before anything is written */
    const before = st.log.length;
    await p.locator('[data-edit="team|carl"]').click();
    await p.waitForSelector('#pf');
    await p.fill('#pf [name=email]', 'carl@gmail.com');
    await p.click('#pf button[type=submit]');
    await p.waitForTimeout(200);
    st = await store(p);
    check('admin: a personal email is refused, nothing written', at(st.data, 'lockup/config/team/carl').email === 'carl.hadwin@hedinautomotive.co.uk' && !st.log.slice(before).some(l => /config\/team\/carl/.test(l[1])));
    await p.click('#pf [data-close]');
    /* take Carl off the team: active off, not deleted */
    await p.locator('[data-edit="team|carl"]').click();
    await p.waitForSelector('#pf');
    await p.uncheck('#pf [name=active]');
    await p.click('#pf button[type=submit]');
    await p.waitForTimeout(300);
    st = await store(p);
    check('admin: taking someone off the team sets active false and keeps them', at(st.data, 'lockup/config/team/carl').active === false && at(st.data, 'lockup/config/team/carl').name === 'Carl');
    /* add a person */
    await p.click('#btn-add');
    await p.waitForSelector('#pf');
    await p.selectOption('#pf [name=list]', 'team');
    await p.fill('#pf [name=name]', 'Jack');
    await p.fill('#pf [name=fullName]', 'Jack Brown');
    await p.fill('#pf [name=email]', 'jack.brown@hedinautomotive.co.uk');
    await p.selectOption('#pf [name=off]', 'wed');
    await p.click('#pf button[type=submit]');
    await p.waitForTimeout(300);
    st = await store(p);
    const jack = at(st.data, 'lockup/config/team/jack');
    check('admin: a new person gets a short id from their first name', jack && jack.name === 'Jack' && jack.off === 'wed' && jack.active === true, JSON.stringify(jack));
    /* a second Jack gets a new id, not a clash */
    await p.click('#btn-add');
    await p.waitForSelector('#pf');
    await p.fill('#pf [name=name]', 'Jack');
    await p.fill('#pf [name=email]', 'jack.two@hedinautomotive.co.uk');
    await p.click('#pf button[type=submit]');
    await p.waitForTimeout(300);
    st = await store(p);
    check('admin: a second Jack gets jack2', at(st.data, 'lockup/config/team/jack2') && at(st.data, 'lockup/config/team/jack2').email === 'jack.two@hedinautomotive.co.uk');
    /* managers: Will is a manager; Dan removes him, then adds him back */
    await p.uncheck('[data-mgr="will"]');
    await p.waitForTimeout(250);
    st = await store(p);
    check('admin: removing a manager deletes the manager flag', at(st.data, 'shifts/managers/will') === undefined);
    await p.check('[data-mgr="nathan"]');
    await p.waitForTimeout(250);
    st = await store(p);
    check('admin: making someone a manager sets the flag', at(st.data, 'shifts/managers/nathan') === true);
    /* unlink Carl's sign in */
    await p.locator('[data-unlink="carl1"]').click();
    await p.waitForTimeout(300);
    st = await store(p);
    check('admin: unlinking removes the link', at(st.data, 'shifts/links/carl1') === undefined);
    /* test mode: this turns the practice copies on, and back off */
    await p.click('#tm-btn');
    await p.waitForTimeout(300);
    st = await store(p);
    check('admin: switching to test mode sets the flag', at(st.data, 'lockup/config/testMode') === true);
    check('admin: the test bar appears', await visible(p, '#testbar'));
    /* the admin is not locked out by test mode: the roster is live, so the switch back works */
    check('admin: still an admin in test mode', (await txt(p, '#who')).indexOf('admin') >= 0 && await visible(p, '#tm-btn'), await txt(p, '#who'));
    await p.click('#tm-btn');
    await p.waitForTimeout(300);
    st = await store(p);
    check('admin: switches back to live from test mode', at(st.data, 'lockup/config/testMode') === false);
    check('admin: the audit shows the changes', (await txt(p, '#audit')).indexOf('Test mode') >= 0 || (await txt(p, '#audit')).indexOf('changed') >= 0, (await txt(p, '#audit')).slice(0, 120));
    await p.screenshot({ path: path.join(OUT, 'team-admin-desktop.png'), fullPage: true });
    check('admin: no page errors', p.__errors.length === 0, p.__errors.join(' | '));
    await p.close();
  }

  /* 3. the manager gates on the existing pages */
  {
    const p = await open(browser, base, null, '/lockup.html', U.tomi);
    await p.waitForSelector('#btn-manager', { timeout: 8000 });
    await p.waitForTimeout(600);
    await p.click('#btn-manager');
    await p.waitForTimeout(500);
    check('lockup: a team member is asked for the manager PIN', await visible(p, '#pin-modal.show'));
    check('lockup: the page loads with no errors for a colleague', p.__errors.length === 0, p.__errors.join(' | '));
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/lockup.html', U.will);
    await p.waitForSelector('#btn-manager', { timeout: 8000 });
    await p.waitForTimeout(600);
    await p.click('#btn-manager');
    await p.waitForTimeout(700);
    check('lockup: a team manager goes straight in, no PIN', await visible(p, '#view-manager') && !(await visible(p, '#pin-modal.show')));
    check('lockup: a team manager gets the manager screen with the team list', (await txt(p, '#view-manager')).length > 20);
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/lockup.html', null);
    await p.waitForSelector('#btn-manager', { timeout: 8000 });
    await p.waitForTimeout(600);
    await p.click('#btn-manager');
    await p.waitForTimeout(400);
    check('lockup: a signed out visitor still gets the PIN (the old way)', await visible(p, '#pin-modal.show'));
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/Forecourt.html', U.tomi);
    await p.waitForSelector('#sync-dot, body', { timeout: 8000 });
    await p.waitForTimeout(700);
    await p.evaluate(() => window.switchRole());
    await p.waitForTimeout(500);
    check('forecourt: a colleague is asked for the PIN', await visible(p, '#pin-modal.open'));
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/Forecourt.html', U.will);
    await p.waitForSelector('#sync-dot, body', { timeout: 8000 });
    await p.waitForTimeout(700);
    await p.evaluate(() => window.switchRole());
    await p.waitForTimeout(500);
    check('forecourt: a team manager goes to the manager view with no PIN', (await txt(p, '#role-bar')).indexOf('MANAGER') >= 0 && !(await visible(p, '#pin-modal.open')), await txt(p, '#role-bar'));
    check('forecourt: no page errors for a manager', p.__errors.length === 0, p.__errors.join(' | '));
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/team-board.html', U.tomi);
    await p.waitForSelector('#btn-manager', { timeout: 8000 });
    await p.waitForTimeout(700);
    await p.click('#btn-manager');
    await p.waitForTimeout(500);
    check('board: a colleague is asked for the PIN', await visible(p, '#m-pin.open'));
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/team-board.html', U.will);
    await p.waitForSelector('#btn-manager', { timeout: 8000 });
    await p.waitForTimeout(700);
    await p.click('#btn-manager');
    await p.waitForTimeout(600);
    check('board: a team manager opens the manager panel with no PIN', await visible(p, '#m-mgr.open') && !(await visible(p, '#m-pin.open')));
    check('board: no page errors for a manager', p.__errors.length === 0, p.__errors.join(' | '));
    await p.close();
  }

  /* 4. the calendar still works on the same login (regression on the shifts page) */
  {
    const p = await open(browser, base, null, '/shifts.html', U.tomi);
    await p.waitForSelector('#cal .dc', { timeout: 8000 }).catch(() => {});
    check('calendar: Tomi reaches the calendar with the shared login', (await p.locator('#cal .dc').count()) > 20, 'cells ' + (await p.locator('#cal .dc').count()));
    check('calendar: no page errors', p.__errors.length === 0, p.__errors.join(' | '));
    await p.close();
  }

  /* 5. phones: nothing runs off the side of the screen on the team pages */
  for (const url of ['/team.html', '/team-admin.html', '/shifts.html']) {
    const user = url === '/team-admin.html' ? U.dan : U.tomi;
    const p = await open(browser, base, null, url, user, { viewport: { width: 390, height: 844 } });
    await p.waitForTimeout(900);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('phone: ' + url + ' does not scroll sideways', over <= 0, 'overflows by ' + over + 'px');
    await p.close();
  }
}

const OUT = path.join(process.env.TMPDIR || '/tmp', 'team-ui-shots');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  try {
    await scenarios(browser, base);
  } catch (e) {
    console.log('FAIL scenario crashed: ' + (e && e.message));
    CHECKS.push({ name: 'run', ok: false });
  } finally {
    await browser.close();
    srv.close();
  }
  const failed = CHECKS.filter(c => !c.ok);
  console.log('\n' + (CHECKS.length - failed.length) + ' passed, ' + failed.length + ' failed');
  process.exit(failed.length ? 1 : 0);
})();
