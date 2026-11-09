/* team-status.js - the green and red lights on the team home tiles (Dan,
 * 9 November 2026). Each light is a real check, not decoration:
 *   - the database connection (.info/connected) for every system;
 *   - the lockup-emails GitHub Action, which sends lockup, forecourt and
 *     showroom cover emails: judged on the age of its last SUCCESSFUL run, so a
 *     single run GitHub fails without starting (0 jobs) never turns it red.
 *     In its window (Monday to Saturday, 06:00 to 19:59 UTC) the last good run
 *     must be under 40 minutes old; out of hours it must have run well near the
 *     end of the last window;
 *   - per system data: this week's lockup rota, today's showroom cover plan
 *     (after 07:45 on an open day), the calendar settings arriving (which also
 *     proves the sign in can read them), and the board's last code check.
 * The repo is public, so GitHub's API is read without a token. Results are
 * shared between tabs in localStorage for 5 minutes, so a phone asks GitHub at
 * most 12 times an hour (the unauthenticated limit is 60).
 * Classic script: TeamStatus.start(backend, getData, onChange); TeamStatus.forTile(id).
 */
(function (root) {
  'use strict';
  var REPO = 'DanBMW/DanSellsCars', CACHE = 'teamStatusGH2', TTL = 5 * 60 * 1000;
  var B = null, getData = null, onChange = null, conn = null, connSince = Date.now(), gh = {}, ghErr = {}, rc = { date: null, has: null }, rcUnsub = null, timer = null;

  function hm(ms) { return new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }); }
  function dayTime(ms) { return new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' }); }

  /* the most recent moment the lockup-emails window closed (19:59 UTC, Mon to Sat) */
  function inWindow(d) { var g = d.getUTCDay(), h = d.getUTCHours(); return g >= 1 && g <= 6 && h >= 6 && h <= 19; }
  function windowOpened(d) { var x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6, 0)); return x.getTime(); }
  function lastWindowEnd(now) {
    var d = new Date(now);
    for (var i = 0; i < 9; i++) {
      var end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 19, 59);
      var g = new Date(end).getUTCDay();
      if (g >= 1 && g <= 6 && end <= now) return end;
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1, 12));
    }
    return now - 48 * 3600e3;
  }
  /* runs: GitHub workflow_runs (completed). Returns {s:'up'|'down'|'unknown', why} */
  function judgeSchedule(runs, now) {
    if (!runs) return { s: 'unknown', why: 'Could not reach GitHub to check the email robot.' };
    var ok = runs.filter(function (r) { return r.conclusion === 'success'; })
      .map(function (r) { return Date.parse(r.updated_at || r.created_at); }).sort(function (a, b) { return b - a; })[0];
    var d = new Date(now);
    if (inWindow(d) && now - windowOpened(d) > 40 * 60e3) {
      if (ok && now - ok < 40 * 60e3) return { s: 'up', why: 'Email robot ran fine at ' + hm(ok) + '.' };
      return { s: 'down', why: ok ? 'No good email run since ' + dayTime(ok) + '. Emails may be stuck.' : 'No good email run found.' };
    }
    var end = lastWindowEnd(now);
    if (inWindow(d)) end = lastWindowEnd(windowOpened(d) - 1);
    if (ok && ok >= end - 40 * 60e3) return { s: 'up', why: 'Quiet hours. The email robot last ran fine at ' + dayTime(ok) + '.' };
    return { s: 'down', why: ok ? 'The email robot did not finish its last day well (last good run ' + dayTime(ok) + ').' : 'No good email run found.' };
  }
  function judgeLast(runs, label) {
    if (!runs) return { s: 'unknown', why: 'Could not reach GitHub to check the ' + label + '.' };
    var r = runs.filter(function (x) { return x.conclusion && x.conclusion !== 'cancelled' && x.conclusion !== 'skipped'; })[0];
    if (!r) return { s: 'unknown', why: 'No ' + label + ' found yet.' };
    var t = Date.parse(r.updated_at || r.created_at);
    return r.conclusion === 'success' ? { s: 'up', why: 'Last ' + label + ' passed, ' + dayTime(t) + '.' } : { s: 'down', why: 'Last ' + label + ' failed, ' + dayTime(t) + '.' };
  }

  function loadGH(force) {
    if (typeof fetch !== 'function') return;
    try {
      var c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (!force && c && Date.now() - c.ts < TTL) { gh = c.gh || {}; ghErr = {}; changed(); return; }
    } catch (e) {}
    var wfs = ['lockup-emails.yml', 'board-check.yml'], out = {}, left = wfs.length;
    wfs.forEach(function (wf) {
      fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/' + wf + '/runs?status=completed&per_page=15', { headers: { Accept: 'application/vnd.github+json' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { out[wf] = (j.workflow_runs || []).map(function (r) { return { conclusion: r.conclusion, created_at: r.created_at, updated_at: r.updated_at }; }); ghErr[wf] = false; })
        .catch(function () { ghErr[wf] = true; })
        .then(function () {
          if (--left) return;
          Object.keys(out).forEach(function (k) { gh[k] = out[k]; });
          try { localStorage.setItem(CACHE, JSON.stringify({ ts: Date.now(), gh: gh })); } catch (e) {}
          changed();
        });
    });
  }
  function changed() { if (onChange) try { onChange(); } catch (e) { console.error(e); } }

  function db() {
    if (conn === true) return { s: 'up', why: 'Connected to the team database.' };
    if (conn === false && Date.now() - connSince > 10000) return { s: 'down', why: 'No connection to the team database since ' + hm(connSince) + '. Check your signal.' };
    return { s: 'unknown', why: 'Connecting to the team database.' };
  }
  function worst(list) {
    var order = { down: 3, unknown: 2, up: 1 }, s = 'up';
    list.forEach(function (x) { if (order[x.s] > order[s]) s = x.s; });
    return { s: s, checks: list };
  }
  function mail() { return ghErr['lockup-emails.yml'] && !gh['lockup-emails.yml'] ? judgeSchedule(null) : judgeSchedule(gh['lockup-emails.yml'], Date.now()); }

  function forTile(id) {
    var d = (getData && getData()) || {}, base = db();
    var c = [Object.assign({ name: 'Database' }, base)];
    if (id === 'lockup') {
      c.push(Object.assign({ name: 'Lockup emails' }, mail()));
      if (d.weeksLoaded) c.push(d.hasWeek ? { name: 'This week\u2019s rota', s: 'up', why: 'This week\u2019s lockup rota is there.' } : { name: 'This week\u2019s rota', s: 'down', why: 'This week\u2019s lockup rota is missing.' });
    } else if (id === 'forecourt') {
      c.push(Object.assign({ name: 'Forecourt emails' }, mail()));
    } else if (id === 'reception') {
      c.push(Object.assign({ name: 'Cover emails' }, mail()));
      if (d.openDay && d.mins >= 465 && rc.has !== null) c.push(rc.has ? { name: 'Today\u2019s plan', s: 'up', why: 'Today\u2019s showroom cover plan is there.' } : { name: 'Today\u2019s plan', s: 'down', why: 'Today\u2019s showroom cover plan has not been made.' });
    } else if (id === 'board') {
      c.push(Object.assign({ name: 'Board check' }, judgeLast(gh['board-check.yml'], 'board code check')));
    } else if (id === 'calendar') {
      if (d.calLoaded) c.push({ name: 'Calendar settings', s: 'up', why: 'The calendar settings loaded.' });
      else c.push({ name: 'Calendar settings', s: 'unknown', why: 'Waiting for the calendar settings.' });
    }
    return worst(c);
  }

  function watchCover(path) {
    if (!B || !path || path === rc.path) return;
    if (typeof rcUnsub === 'function') rcUnsub();
    rc = { path: path, has: null };
    rcUnsub = B.watch(path, function (v) { rc.has = !!v; changed(); });
  }

  var TeamStatus = {
    start: function (backend, data, cb) {
      if (B) return;
      B = backend; getData = data; onChange = cb;
      B.watch('.info/connected', function (v) { var now = v === true; if (now !== conn) { conn = now; connSince = Date.now(); } changed(); });
      loadGH(false);
      timer = setInterval(function () { loadGH(false); changed(); }, 60000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) loadGH(false); });
      setTimeout(changed, 11000);
    },
    watchCover: watchCover,
    forTile: forTile,
    refresh: function () { loadGH(true); },
    _judgeSchedule: judgeSchedule, _judgeLast: judgeLast, _lastWindowEnd: lastWindowEnd
  };
  root.TeamStatus = TeamStatus;
  if (typeof module !== 'undefined' && module.exports) module.exports = TeamStatus;
})(this);
