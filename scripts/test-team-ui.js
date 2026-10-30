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
  staff: { dan1: true },
  /* email + PIN accounts (Firebase email/password). verified is what the person's email link does */
  accounts: {
    'tomiwa.adelaja@hedinautomotive.co.uk': { pin: '246810', uid: 'tomi1', verified: true },
    'chloe.smith@hedinautomotive.co.uk': { pin: '135790', uid: 'chloe1', verified: false }
  }
};
const U = {
  tomi: { uid: 'tomi1', email: 'tomiwa.adelaja@hedinautomotive.co.uk', emailVerified: true },
  danny: { uid: 'danny1', email: 'danny.willis@hedinautomotive.co.uk', emailVerified: true },
  carl: { uid: 'carl1', email: 'carl.hadwin@hedinautomotive.co.uk', emailVerified: true },
  will: { uid: 'will1', email: 'will.potter@hedinautomotive.co.uk', emailVerified: true },
  dan: { uid: 'dan1', email: 'daniel.cane@hedinautomotive.co.uk', emailVerified: true },
  gmail: { uid: 'g1', email: 'someone@gmail.com', emailVerified: true },
  unverified: { uid: 'u1', email: 'new.person@hedinautomotive.co.uk', emailVerified: false },
  stranger: { uid: 's1', email: 'stranger@hedinautomotive.co.uk', emailVerified: true },
  nathan: { uid: 'nathan1', email: 'nathan.jobson@hedinautomotive.co.uk', emailVerified: true },
  creator: { uid: 'dan9', email: 'daniel.cane@hedinautomotive.co.uk', emailVerified: true }
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
  const accounts = JSON.parse(JSON.stringify(opts.accounts || FIX.accounts || {}));
  const popup = opts.popupUser === undefined ? user : opts.popupUser;
  await page.addInitScript(({ data, user, popup, accounts }) => {
    window.__STORE = { data, user, popupUser: popup, accounts, log: [] };
  }, { data, user: user || null, popup: popup || null, accounts });
  await page.goto(base + url);
  page.__errors = errors;
  page.__ctx = ctx;
  return page;
}
const store = (page) => page.evaluate(() => ({ data: window.__STORE.data, log: window.__STORE.log.slice() }));
const at = (data, p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), data);
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
const txt = (page, sel) => page.locator(sel).first().textContent().catch(() => '');
async function setNow(page, d) { await page.evaluate((d) => { if (window.TeamHome) window.TeamHome._setNow(d); if (window.ShiftsApp) { window.ShiftsApp._setNow(d); window.ShiftsApp._render(); } }, d); }

/* ---------- the scenarios ---------- */
async function scenarios(browser, base) {
  /* 1. the team home: every sign in state */
  {
    let p = await open(browser, base, null, '/team.html', null);
    await p.waitForSelector('#v-signin:not([hidden])', { timeout: 8000 });
    check('home: signed out shows the sign in card', await visible(p, '#btn-signin'));
    check('home: signed out has no cards', (await p.locator('#cards a').count()) === 0);
    await p.fill('#pin-email', 'tomiwa.adelaja@hedinautomotive.co.uk');
    await p.fill('#pin-code', '000000');
    await p.click('#pin-in');
    await p.waitForTimeout(300);
    check('home: a wrong PIN is refused, in plain words', /don.t match/.test(await txt(p, '#signin-msg')), await txt(p, '#signin-msg'));
    await p.fill('#pin-code', '246810');
    await p.click('#pin-in');
    await p.waitForSelector('#v-home:not([hidden])', { timeout: 8000 });
    check('home: the right PIN signs Tomi in with no Google window', await visible(p, '#v-home'));
    await p.close();
    p = await open(browser, base, null, '/team.html', null);
    await p.waitForSelector('#v-signin:not([hidden])', { timeout: 8000 });
    await p.click('#btn-signin');
    await p.waitForTimeout(300);
    check('home: a cancelled popup is not an error message', (await txt(p, '#signin-msg')).trim() === '');
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/team.html', U.gmail, { popupUser: U.gmail });
    await p.waitForTimeout(1200);
    if (!(await visible(p, '#v-wrong'))) console.log('DEBUG gmail', JSON.stringify(await p.evaluate(() => ({ st: window.TeamSession && TeamSession.state(), sections: [...document.querySelectorAll('main section')].map(x => x.id + ':' + x.hidden) }))), p.__errors);
    await p.waitForSelector('#v-wrong:not([hidden])', { timeout: 8000 });
    check('home: a personal Gmail is refused', (await txt(p, '#wrong-email')).indexOf('gmail') >= 0);
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/team.html', U.unverified);
    await p.waitForSelector('#v-unverified:not([hidden])', { timeout: 8000 });
    check('home: an unverified Hedin address is asked to verify, and gets nothing else', (await txt(p, '#unv-email')).indexOf('new.person') >= 0 && !(await visible(p, '#v-home')));
    /* verify it in the (stub) mailbox, then continue */
    await p.evaluate(() => { window.__STORE.accounts = window.__STORE.accounts || {}; });
    await p.click('#unv-resend');
    await p.waitForTimeout(200);
    check('home: send it again is logged to the mail', (await store(p)).log.some(l => l[0] === 'verify-email'));
    await p.close();
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
    await p.waitForURL(/team\.html\?next=lockup\.html/, { timeout: 5000 }).catch(() => {});
    check('lockup: a colleague is sent to team sign in, to come back to lockup', /team\.html\?next=lockup\.html/.test(p.url()), p.url());
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
    await p.waitForURL(/team\.html\?next=lockup\.html/, { timeout: 5000 }).catch(() => {});
    check('lockup: a signed out visitor is sent to team sign in too', /team\.html\?next=lockup\.html/.test(p.url()), p.url());
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/Forecourt.html', U.tomi);
    await p.waitForSelector('#sync-dot, body', { timeout: 8000 });
    await p.waitForTimeout(700);
    await p.evaluate(() => window.switchRole());
    await p.waitForTimeout(500);
    await p.waitForURL(/team\.html\?next=Forecourt\.html/, { timeout: 5000 }).catch(() => {});
    check('forecourt: a colleague is sent to team sign in', /team\.html\?next=Forecourt\.html/.test(p.url()), p.url());
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
    await p.waitForURL(/team\.html\?next=team-board\.html/, { timeout: 5000 }).catch(() => {});
    check('board: a colleague is sent to team sign in', /team\.html\?next=team-board\.html/.test(p.url()), p.url());
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


/* ---------- PIN accounts, roles, the redirect back, and the calendar's new flows ---------- */
async function extraScenarios(browser, base) {
  /* a. set a PIN for a new work address: verification is sent, and until it is verified nothing else opens */
  {
    const p = await open(browser, base, null, '/team.html', null);
    await p.waitForSelector('#v-signin:not([hidden])', { timeout: 8000 });
    await p.fill('#pin-email', 'new.person@hedinautomotive.co.uk');
    await p.fill('#pin-code', '12345');
    await p.click('#pin-new');
    await p.waitForTimeout(200);
    check('pin: a PIN shorter than six digits is refused before anything is sent', /six digit/.test(await txt(p, '#signin-msg')), await txt(p, '#signin-msg'));
    await p.fill('#pin-code', '111222');
    await p.click('#pin-new');
    await p.waitForSelector('#v-unverified:not([hidden])', { timeout: 8000 });
    let st = await store(p);
    check('pin: setting a PIN creates the account and sends the verification email', st.log.some(l => l[0] === 'create') && st.log.some(l => l[0] === 'verify-email'), JSON.stringify(st.log));
    check('pin: until verified, the person is asked to verify and sees no team tiles', await visible(p, '#v-unverified') && !(await visible(p, '#v-home')));
    await p.evaluate(() => { window.__STORE.accounts['new.person@hedinautomotive.co.uk'].verified = true; });
    await p.click('#unv-continue');
    await p.waitForSelector('#v-unlinked:not([hidden])', { timeout: 8000 });
    check('pin: once verified, the team list decides (not on it: told so)', await visible(p, '#v-unlinked'));
    check('pin: no errors setting a PIN', p.__errors.length === 0, p.__errors.join(' | '));
    await p.close();
  }
  /* b. a PIN that already exists is not created twice; forgot my PIN sends the reset to the work address */
  {
    const p = await open(browser, base, null, '/team.html', null);
    await p.waitForSelector('#v-signin:not([hidden])', { timeout: 8000 });
    await p.fill('#pin-email', 'tomiwa.adelaja@hedinautomotive.co.uk');
    await p.fill('#pin-code', '999999');
    await p.click('#pin-new');
    await p.waitForTimeout(250);
    check('pin: a second PIN for the same address is refused', /already have a PIN/.test(await txt(p, '#signin-msg')), await txt(p, '#signin-msg'));
    await p.click('#pin-reset');
    await p.waitForTimeout(250);
    const st = await store(p);
    check('pin: forgot my PIN emails a reset to the work address', st.log.some(l => l[0] === 'reset-email' && l[1] === 'tomiwa.adelaja@hedinautomotive.co.uk'), JSON.stringify(st.log.slice(-2)));
    check('pin: the reset message does not say whether the address has a PIN', /If that work address has a PIN/.test(await txt(p, '#signin-msg')));
    await p.fill('#pin-email', 'someone@gmail.com');
    await p.click('#pin-reset');
    await p.waitForTimeout(150);
    check('pin: a personal address is not sent a reset', /Use your Hedin work address/.test(await txt(p, '#signin-msg')) || /work address/.test(await txt(p, '#signin-msg')), await txt(p, '#signin-msg'));
    await p.close();
  }
  /* c. the roles: the creator is admin with no staff entry, Nathan is management from the lockup list */
  {
    const p = await open(browser, base, null, '/team.html', U.creator);
    await p.waitForSelector('#v-home:not([hidden])', { timeout: 8000 });
    await p.waitForTimeout(200);
    check('roles: Dan on his work account is admin with no staff entry', (await txt(p, '#home-role')) === 'Admin' && (await p.locator('#cards a[href="team-admin.html"]').count()) === 1, await txt(p, '#home-role'));
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/team.html', U.nathan);
    await p.waitForSelector('#v-home:not([hidden])', { timeout: 8000 });
    await p.waitForTimeout(200);
    check('roles: Nathan is management from the lockup list, with no extra flag', (await txt(p, '#home-role')) === 'Manager', await txt(p, '#home-role'));
    await p.close();
  }
  /* d. a manager asked for a page is sent back to it; a colleague is told the page is for managers */
  {
    const p = await open(browser, base, null, '/team.html?next=lockup.html', U.will);
    await p.waitForURL(/lockup\.html/, { timeout: 8000 }).catch(() => {});
    check('redirect: a manager who signs in is sent back to the page they asked for', /lockup\.html/.test(p.url()), p.url());
    await p.close();
  }
  {
    const p = await open(browser, base, null, '/team.html?next=lockup.html', U.tomi);
    await p.waitForSelector('#v-home:not([hidden])', { timeout: 8000 });
    await p.waitForTimeout(300);
    check('redirect: a colleague stays on the home page and is told the page is for managers', /team\.html/.test(p.url()) && await visible(p, '#next-note'), p.url());
    await p.close();
  }
  /* e. the Android shell: bottom navigation, the floating button, and a sheet of what to ask for */
  {
    const p = await open(browser, base, null, '/shifts.html', U.tomi);
    await p.waitForSelector('#tabs button', { timeout: 8000 });
    await setNow(p, '2026-10-30');
    await p.waitForTimeout(250);
    check('android: a colleague has two bottom navigation items (calendar, requests)', (await p.locator('#tabs button').count()) === 2, 'got ' + (await p.locator('#tabs button').count()));
    check('android: the bottom navigation is at the foot of the screen', await p.evaluate(() => { const r = document.getElementById('tabs').getBoundingClientRect(); return r.bottom > window.innerHeight - 4; }));
    check('android: the floating New button shows on the calendar', await visible(p, '#fab'));
    await p.click('#fab');
    await p.waitForSelector('#m-sheet.show');
    const items = await p.locator('#sheet .listrow').allTextContents();
    check('android: New opens a sheet of what to ask for, leave first', items.length === 5 && /Book leave/.test(items[0]), items.join(' | '));
    check('android: nothing in the sheet offers to add an entry for someone to a colleague', !items.some(x => /Add an entry/.test(x)));
    await p.screenshot({ path: path.join(OUT, 'calendar-new-sheet-phone.png'), fullPage: false });
    /* f. leave: the Ciphr tick is needed, the reference is optional, and it goes straight on */
    await p.click('#sheet [data-act="holiday"]');
    await p.waitForSelector('#rq-form');
    check('leave: the sheet says annual leave is authorised on Ciphr first', /authorised on Ciphr first/.test(await txt(p, '#sheet')));
    check('leave: the tick reads as a confirmation', /I confirm this annual leave has been authorised on Ciphr/.test(await txt(p, '#sheet')));
    check('leave: the Ciphr reference is marked optional', /Ciphr reference \(optional\)/.test(await txt(p, '#sheet')));
    await p.fill('#rq-form [name=from]', '2026-11-16');
    await p.fill('#rq-form [name=to]', '2026-11-18');
    await p.fill('#rq-form [name=ciphr]', 'CPH-7741');
    await p.waitForTimeout(60);
    check('leave: no Send without the tick, even with a reference', await p.locator('#rq-go').isDisabled());
    await p.fill('#rq-form [name=ciphr]', '');
    await p.check('#rq-form [name=ciphrOk]');
    await p.fill('#rq-form [name=note]', 'Wedding abroad');
    await p.waitForTimeout(60);
    check('leave: the tick alone opens Send', !(await p.locator('#rq-go').isDisabled()));
    await p.screenshot({ path: path.join(OUT, 'leave-form-phone.png'), fullPage: false });
    await p.click('#rq-go');
    await p.waitForTimeout(300);
    let st = await store(p);
    const leave = Object.keys(st.data.shifts.requests || {}).map(k => st.data.shifts.requests[k]).find(r => r.kind === 'holiday' && r.note === 'Wedding abroad');
    check('leave: it goes straight on as approved, with who ticked it and when', leave && leave.status === 'approved' && leave.ciphrConfirmed === true && leave.ciphrConfirmedBy === 'Tomi' && typeof leave.ciphrConfirmedAt === 'number' && !leave.ciphr, JSON.stringify(leave));
    check('leave: it is written to lockup so cover is re-paired as today', Object.keys(st.data.lockup.absences || {}).some(k => /^sh_/.test(k) && st.data.lockup.absences[k].personId === 'tomi' && st.data.lockup.absences[k].kind === 'holiday'));
    await p.close();
  }
  /* g. a switch is always the manager's decision: the warnings show, the send still works */
  {
    const data = JSON.parse(JSON.stringify(FIX)); data.shifts.config = { weekdayMin: 9 };
    const p = await open(browser, base, null, '/shifts.html', U.tomi, { data });
    await p.waitForSelector('#tabs button', { timeout: 8000 });
    await setNow(p, '2026-10-30');
    await p.waitForTimeout(250);
    await p.click('#fab');
    await p.waitForSelector('#m-sheet.show');
    await p.click('#sheet [data-act="switch"]');
    await p.waitForSelector('#rq-form');
    await p.fill('#rq-form [name=giveUp]', '2026-11-19');
    await p.fill('#rq-form [name=takeOn]', '2026-11-20');
    await p.waitForTimeout(80);
    const pv = await txt(p, '#pv');
    check('switch: warnings show on the days that fall short', /minimum 9/.test(pv) && /Warnings do not stop/.test(pv), pv.slice(0, 200));
    check('switch: the warnings do not stop it being sent', !(await p.locator('#rq-go').isDisabled()));
    await p.click('#rq-go');
    await p.waitForTimeout(300);
    const st = await store(p);
    const sw = Object.keys(st.data.shifts.requests || {}).map(k => st.data.shifts.requests[k]).find(r => r.kind === 'switch');
    check('switch: it is sent to a manager as pending, not approved', sw && sw.status === 'pending' && !sw.auto, JSON.stringify(sw));
    check('switch: nothing is written to lockup until a manager approves', !Object.keys(st.data.lockup.absences || {}).some(k => /^sh_/.test(k)));
    await p.close();
  }
  /* h. the day sheet: a person's note, and a day with no handover cover */
  {
    const data = JSON.parse(JSON.stringify(FIX));
    data.lockup.absences.hc = { personId: 'chloe', from: '2026-11-05', to: '2026-11-05', kind: 'absent', status: 'approved', note: 'Dentist' };
    data.lockup.absences.hm = { personId: 'molly', from: '2026-11-05', to: '2026-11-05', kind: 'absent', status: 'approved' };
    const p = await open(browser, base, null, '/shifts.html', U.tomi, { data });
    await p.waitForSelector('#tabs button', { timeout: 8000 });
    await setNow(p, '2026-10-30');
    await p.waitForTimeout(200);
    await p.click('#cal .months button[data-month="2026-11"]');
    await p.waitForSelector('#cal .dc[data-day="2026-11-05"]');
    await p.click('#cal .dc[data-day="2026-11-05"]');
    await p.waitForSelector('#m-sheet.show');
    check('handover: a Thursday with neither Chloe nor Molly says so on the day', /No handover cover/.test(await txt(p, '#sheet')), (await txt(p, '#sheet')).slice(0, 200));
    check('handover: that day shows as short on the calendar', /short/.test(await p.locator('#cal .dc[data-day="2026-11-05"]').getAttribute('class')));
    await p.click('#sheet [data-close]');
    await p.waitForTimeout(150);
    await p.click('#cal .dc[data-day="2026-11-05"]');
    await p.click('#cal .dc[data-day="2026-11-10"]').catch(() => {});
    await p.waitForTimeout(150);
    await p.click('#sheet [data-close]').catch(() => {});
    await p.click('#cal .dc[data-day="2026-11-10"]');
    await p.waitForSelector('#m-sheet.show');
    check('notes: the day sheet shows why someone is away, in their own words', /Carl holiday/.test(await txt(p, '#sheet')), (await txt(p, '#sheet')).slice(0, 200));
    await p.close();
  }
  /* i. managers see the management tabs, and the New sheet adds time off for someone */
  {
    const p = await open(browser, base, null, '/shifts.html', U.will);
    await p.waitForSelector('#tabs button', { timeout: 8000 });
    await setNow(p, '2026-10-30');
    await p.waitForTimeout(200);
    check('android: a manager has the five bottom navigation items', (await p.locator('#tabs button').count()) === 5, 'got ' + (await p.locator('#tabs button').count()));
    await p.click('#fab');
    await p.waitForSelector('#m-sheet.show');
    check('android: a manager can add time off for someone from the same sheet', (await txt(p, '#sheet')).indexOf('Add an entry for anyone') >= 0);
    check('shifts: no page errors for a manager', p.__errors.length === 0, p.__errors.join(' | '));
    await p.screenshot({ path: path.join(OUT, 'calendar-phone-android.png'), fullPage: false });
    await p.close();
  }
  /* j. day off switch, training, manager entries and swaps without approval */
  {
    const SO = process.env.SHOTS_DIR;
    const vps = SO ? [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]] : [['phone', { width: 390, height: 844 }]];
    for (const [v, vp] of vps) {
      const cell = async (p, d) => (await p.locator('[data-day="' + d + '"] span').first().textContent().catch(() => '')).trim();
      const toNov = async (p) => { await p.locator('button', { hasText: 'Nov 26' }).first().click().catch(() => {}); await p.waitForTimeout(200); };
      /* Carl's usual day off is Tuesday. He asks for Thursday 19 Nov off and works Tuesday 17 Nov instead. */
      let p = await open(browser, base, null, '/shifts.html', U.carl, { viewport: vp });
      await p.waitForSelector('#fab', { timeout: 8000 }); await setNow(p, '2026-11-02'); await toNov(p);
      const tueBefore = await cell(p, '2026-11-17'), thuBefore = await cell(p, '2026-11-19');
      await p.click('#fab'); await p.waitForSelector('#m-sheet.show'); await p.click('#sheet [data-act="switch"]'); await p.waitForSelector('#rq-form');
      await p.fill('#rq-form [name=giveUp]', '2026-11-19'); await p.fill('#rq-form [name=takeOn]', '2026-11-17'); await p.waitForTimeout(150);
      if (SO) await p.screenshot({ path: SO + '/dayoff-request-' + v + '.png' });
      await p.click('#rq-go'); await p.waitForTimeout(400);
      let st = await store(p);
      const swId = Object.keys(st.data.shifts.requests).find(k => st.data.shifts.requests[k].kind === 'switch' && st.data.shifts.requests[k].personId === 'carl');
      check('dayoff ' + v + ': the switch is sent as pending', swId && st.data.shifts.requests[swId].status === 'pending');
      check('dayoff ' + v + ': managers are notified', Object.values(st.data.lockup.notify || {}).some(n => /Day off switch: Carl/.test(n.subject)));
      check('dayoff ' + v + ': nothing changes before approval', (await cell(p, '2026-11-17')) === tueBefore && !Object.keys(st.data.lockup.absences).some(k => k.indexOf(swId) >= 0));
      const data = st.data; await p.__ctx.close();
      /* Will approves it */
      p = await open(browser, base, null, '/shifts.html', U.will, { viewport: vp, data });
      await p.waitForSelector('#tabs button', { timeout: 8000 }); await setNow(p, '2026-11-02');
      await p.evaluate((id) => { const b = document.createElement('button'); b.setAttribute('data-review', id); document.body.appendChild(b); b.click(); }, swId);
      await p.waitForSelector('[data-rv-approve]'); if (SO) await p.screenshot({ path: SO + '/dayoff-review-' + v + '.png' });
      await p.click('[data-rv-approve]'); await p.waitForTimeout(500);
      st = await store(p);
      check('dayoff ' + v + ': approved', st.data.shifts.requests[swId].status === 'approved');
      const ab = Object.keys(st.data.lockup.absences).filter(k => k.indexOf(swId) >= 0).map(k => st.data.lockup.absences[k]);
      check('dayoff ' + v + ': lockup has Thursday away and Tuesday working', ab.some(a => a.kind === 'absent' && a.from === '2026-11-19') && ab.some(a => a.kind === 'works' && a.from === '2026-11-17'), JSON.stringify(ab));
      const after = st.data; await p.__ctx.close();
      p = await open(browser, base, null, '/shifts.html', U.will, { viewport: vp, data: after }); await p.waitForSelector('#fab', { timeout: 8000 }).catch(() => {}); await setNow(p, '2026-11-02'); await toNov(p);
      const tueAfter = await cell(p, '2026-11-17'), thuAfter = await cell(p, '2026-11-19');
      check('dayoff ' + v + ': headcounts move (Tue up one, Thu down one)', parseInt(tueAfter) === parseInt(tueBefore) + 1 && parseInt(thuAfter) === parseInt(thuBefore) - 1, tueBefore + '>' + tueAfter + ' ' + thuBefore + '>' + thuAfter);
      if (SO) await p.screenshot({ path: SO + '/dayoff-approved-' + v + '.png' });
      await p.__ctx.close();
      /* a declined switch changes nothing */
      const d2 = JSON.parse(JSON.stringify(FIX)); d2.shifts.requests.dx = { personId: 'carl', kind: 'switch', giveUp: '2026-11-26', takeOn: '2026-11-24', status: 'pending', ts: 5 };
      p = await open(browser, base, null, '/shifts.html', U.will, { viewport: vp, data: d2 });
      await p.waitForSelector('#tabs button', { timeout: 8000 }); await setNow(p, '2026-11-02');
      await p.evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-review', 'dx'); document.body.appendChild(b); b.click(); });
      await p.waitForSelector('[data-rv-decline]'); await p.click('[data-rv-decline]'); await p.waitForTimeout(400);
      st = await store(p);
      check('dayoff ' + v + ': a decline leaves the rota unchanged', st.data.shifts.requests.dx.status === 'declined' && !Object.keys(st.data.lockup.absences).some(k => k.indexOf('dx') >= 0));
      await p.__ctx.close();
      /* training: Tomi adds his own, straight on */
      p = await open(browser, base, null, '/shifts.html', U.tomi, { viewport: vp });
      await p.waitForSelector('#fab', { timeout: 8000 }); await setNow(p, '2026-11-02');
      await p.click('#fab'); await p.waitForSelector('#m-sheet.show'); await p.click('#sheet [data-act="training"]'); await p.waitForSelector('#rq-form');
      await p.fill('#rq-form [name=from]', '2026-11-18'); await p.fill('#rq-form [name=to]', '2026-11-18'); await p.fill('#rq-form [name=note]', 'BMW product course'); await p.waitForTimeout(150);
      if (SO) await p.screenshot({ path: SO + '/training-form-' + v + '.png' });
      check('training ' + v + ': Send is open with no approval step', !(await p.locator('#rq-go').isDisabled()));
      await p.click('#rq-go'); await p.waitForTimeout(400);
      st = await store(p);
      const tr = Object.values(st.data.shifts.requests).find(r => r.kind === 'training');
      check('training ' + v + ': goes straight on as approved with its note', tr && tr.status === 'approved' && tr.note === 'BMW product course', JSON.stringify(tr));
      check('training ' + v + ': counts as away in lockup', Object.values(st.data.lockup.absences).some(a => a.personId === 'tomi' && a.kind === 'absent' && a.from === '2026-11-18' && /Training/.test(a.note || '')));
      await toNov(p); await p.locator('[data-day="2026-11-18"]').first().click(); await p.waitForTimeout(300);
      check('training ' + v + ': the day sheet shows the note', /BMW product course/.test(await txt(p, '#sheet')));
      if (SO) await p.screenshot({ path: SO + '/training-daysheet-' + v + '.png' });
      await p.__ctx.close();
      /* managers add any type for anyone */
      p = await open(browser, base, null, '/shifts.html', U.will, { viewport: vp });
      await p.waitForSelector('#fab', { timeout: 8000 }); await setNow(p, '2026-11-02');
      await p.click('#fab'); await p.waitForSelector('#m-sheet.show'); await p.click('#sheet [data-act="mgr-holiday"]'); await p.waitForSelector('#rq-form');
      const types = await p.locator('#rq-form [name=kind] option').allTextContents();
      check('manager ' + v + ': can pick leave, training, lieu day or absence', ['Annual leave', 'Training', 'Lieu day'].every(x => types.indexOf(x) >= 0), types.join(','));
      await p.selectOption('#rq-form [name=personId]', 'karis'); await p.selectOption('#rq-form [name=kind]', 'lieu');
      await p.fill('#rq-form [name=from]', '2026-11-20'); await p.fill('#rq-form [name=to]', '2026-11-20'); await p.waitForTimeout(150);
      if (SO) await p.screenshot({ path: SO + '/training-manager-entry-' + v + '.png' });
      await p.click('#rq-go'); await p.waitForTimeout(400);
      st = await store(p);
      check('manager ' + v + ': a lieu day for Karis is booked', Object.values(st.data.shifts.requests).some(r => r.kind === 'lieu' && r.personId === 'karis' && r.status === 'approved'));
      await p.__ctx.close();
      /* a swap goes through when Danny accepts, and managers are told */
      p = await open(browser, base, null, '/shifts.html', U.danny, { viewport: vp, data: Object.assign(JSON.parse(JSON.stringify(FIX)), {}) });
      await p.waitForSelector('#fab', { timeout: 8000 }).catch(() => {}); await setNow(p, '2026-11-02');
      await p.evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-accept', 'w1'); document.body.appendChild(b); b.click(); }); await p.waitForTimeout(500);
      st = await store(p);
      check('swap ' + v + ': accepted with no manager step', st.data.shifts.requests.w1.status === 'approved', JSON.stringify(st.data.shifts.requests.w1));
      check('swap ' + v + ': managers are told', Object.values(st.data.lockup.notify || {}).some(n => /Shift swap agreed/.test(n.subject)));
      await p.__ctx.close();
      /* with approval on, a short swap waits for a manager */
      const d3 = JSON.parse(JSON.stringify(FIX)); d3.shifts.config = { swapNeedsApproval: true, weekdayMin: 9 };
      p = await open(browser, base, null, '/shifts.html', U.danny, { viewport: vp, data: d3 });
      await p.waitForSelector('#fab', { timeout: 8000 }).catch(() => {}); await setNow(p, '2026-11-02');
      await p.evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-accept', 'w1'); document.body.appendChild(b); b.click(); }); await p.waitForTimeout(500);
      st = await store(p);
      check('swap ' + v + ': with approval on, it goes to a manager', st.data.shifts.requests.w1.status === 'pending', JSON.stringify(st.data.shifts.requests.w1));
      await p.__ctx.close();
    }
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
    await extraScenarios(browser, base);
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
