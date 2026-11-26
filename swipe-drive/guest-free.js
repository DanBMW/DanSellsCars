/* SwipeToDrive first open guest flow (Dan, 26 Nov 2026): a new visitor swipes the first 15 cars with no account and no
   questions. After the 15th swipe Revvy flies in and offers the three questions (then the save or sign up step). A
   "Maybe later" skip keeps them swiping; Revvy asks once more 15 swipes later and then never again on its own.
   State lives in the guest's own localStorage record (sd_guest_v1) next to their swipes:
     d.cust.desk.prefs_pending  true while the guest has not answered the questions (the deck uses open defaults)
     d.free = { shown, skips, nextAt, done }
   Pure functions, used by app.js and by node tests (tests/guest-free.test.js). Nothing here touches the network. */
(function (g) {
  'use strict';
  var FIRST = 15, AGAIN = 15, MAX_PROMPTS = 2;
  function swipesOf(d) { return (d && d.swipes) || {}; }
  function count(d) { return Object.keys(swipesOf(d)).length; }
  function likes(d) { var s = swipesOf(d); return Object.keys(s).filter(function (r) { return s[r] && s[r].liked; }).length; }
  /* still browsing freely: no answers given yet (an older guest who answered the three questions is never pending) */
  function pending(d) { var c = d && d.cust; return !!(c && c.desk && c.desk.prefs_pending); }
  function state(d) { var f = (d && d.free) || {}; return { shown: f.shown || 0, skips: f.skips || 0, nextAt: f.nextAt || FIRST, done: !!f.done }; }
  /* the open profile a free guest swipes with: every shape, fuel and budget, new and used */
  function freeCust() { return { budget_type: 'monthly', monthly_gbp: null, cash_gbp: null, body: 'any', body_must: false, fuel: 'open', fuel_must: [], new_used: 'both', annual_mileage: 8000,
    desk: { lead_source: 'swipetodrive-guest', prefs_pending: true } }; }
  function shouldPrompt(d) { if (!pending(d)) return false; var s = state(d); return !s.done && s.shown < MAX_PROMPTS && count(d) >= s.nextAt; }
  /* how far through the free swipes: for the "Revvy is learning your taste" bar. null once it no longer applies */
  function progress(d) { if (!pending(d) || state(d).shown) return null; var n = Math.min(count(d), FIRST); return { n: n, of: FIRST, left: FIRST - n }; }
  /* Revvy has asked: the next ask is 15 swipes from now, however the prompt is closed (Maybe later, the back button,
     a tab), unless that was the last one */
  function markShown(d) { var s = state(d); d.free = { shown: s.shown + 1, skips: s.skips, nextAt: count(d) + AGAIN, done: s.done, at: Date.now() }; return d; }
  /* "Maybe later" */
  function skip(d) { var s = state(d); d.free = { shown: s.shown, skips: s.skips + 1, nextAt: Math.max(s.nextAt, count(d) + AGAIN), done: s.done, at: Date.now() }; return d; }
  /* answers given: the guest is no longer pending and Revvy never prompts again */
  function finish(d) { var s = state(d); d.free = { shown: s.shown, skips: s.skips, nextAt: s.nextAt, done: true, at: Date.now() };
    if (d.cust && d.cust.desk) { d.cust.desk = Object.assign({}, d.cust.desk); delete d.cust.desk.prefs_pending; } return d; }
  function lastPrompt(d) { return state(d).shown >= MAX_PROMPTS; }
  /* Soft hints for the three questions from what the guest liked: the most liked shape and fuels, and new or used when
     every like was one or the other. Only ever a starting point; they are never saved without the guest pressing on. */
  function hints(d, byReg) {
    var s = swipesOf(d), bodies = {}, fuels = {}, kinds = {}, n = 0;
    Object.keys(s).forEach(function (r) { if (!s[r] || !s[r].liked) return; var c = byReg(r); if (!c) return; n++;
      var b = bodyKey(c.body); if (b) bodies[b] = (bodies[b] || 0) + 1;
      var f = fuelKey(c.fuel); if (f) fuels[f] = (fuels[f] || 0) + 1;
      kinds[c.kind === 'used' ? 'used' : 'new'] = 1; });
    if (n < 3) return null;   /* too few likes to say anything */
    var top = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }); };
    var tb = top(bodies), body = tb.length && bodies[tb[0]] / n >= 0.5 ? tb[0] : null;
    var fuel = top(fuels).filter(function (k) { return fuels[k] / n >= 0.34; }).slice(0, 2);
    var ks = Object.keys(kinds), newUsed = ks.length === 1 ? ks[0] : 'both';
    return { likes: n, body: body, fuel: fuel, new_used: newUsed };
  }
  function bodyKey(b) { b = String(b || '').toLowerCase(); if (!b) return null; if (/suv|sav|sac|x\d/.test(b)) return 'suv'; if (/tour|estate/.test(b)) return 'estate'; if (/saloon|sedan|gran/.test(b)) return 'saloon'; if (/hatch/.test(b)) return 'hatchback'; if (/coup/.test(b)) return 'coupe'; if (/conv|cabrio|roadster/.test(b)) return 'coupe'; return null; }
  function fuelKey(f) { f = String(f || '').toLowerCase(); if (!f) return null; if (/plug|phev/.test(f)) return 'phev'; if (/mild/.test(f)) return /diesel/.test(f) ? 'diesel' : 'petrol'; if (/electric|bev/.test(f) && !/hybrid/.test(f)) return 'electric'; if (/hybrid/.test(f)) return 'hybrid'; if (/diesel/.test(f)) return 'diesel'; if (/petrol/.test(f)) return 'petrol'; return null; }
  /* Swipes to carry into an account: every guest swipe the account does not already have. What the account already
     holds is never changed, so a returning customer's own likes and passes win. */
  function carrySwipes(guestSwipes, have) {
    guestSwipes = guestSwipes || {}; have = have || {};
    return Object.keys(guestSwipes).filter(function (r) { return guestSwipes[r] && !have[r]; })
      .map(function (r) { var s = guestSwipes[r]; return { reg: r, liked: !!s.liked, extra: s.shortlisted ? { shortlisted: true } : null }; });
  }
  /* The guest's answers into an account row: only fills what the account has not set. A guest who never answered
     (prefs pending) brings no answers at all, so the open defaults never land on a real profile. */
  function carryPrefs(row, gc) {
    row = Object.assign({}, row || {}); gc = gc || {};
    var empty = function (v) { return v == null || v === '' || (Array.isArray(v) && !v.length); };
    var isPending = !!(gc.desk && gc.desk.prefs_pending);
    if (!isPending) {
      if (empty(row.budget_type) || (!row.monthly_gbp && !row.cash_gbp)) { row.budget_type = gc.budget_type || row.budget_type || 'monthly'; row.monthly_gbp = gc.monthly_gbp || row.monthly_gbp || null; row.cash_gbp = gc.cash_gbp || row.cash_gbp || null; }
      if (empty(row.fuel) || row.fuel === 'open') { row.fuel = gc.fuel || row.fuel || 'open'; row.fuel_must = gc.fuel_must || row.fuel_must || []; }
      if (empty(row.body) || row.body === 'any') { row.body = gc.body || row.body || 'any'; row.body_must = !!gc.body_must; }
      if (empty(row.new_used) || row.new_used === 'both') row.new_used = gc.new_used || row.new_used || 'both';
    }
    var gd = Object.assign({}, gc.desk || {}); delete gd.prefs_pending;
    row.desk = Object.assign({}, gd, row.desk || {}); if (row.body_must) row.desk.body_must = true;
    if (empty(row.desk.lead_source)) row.desk.lead_source = 'swipetodrive-guest';
    return row;
  }
  var api = { FIRST: FIRST, AGAIN: AGAIN, MAX_PROMPTS: MAX_PROMPTS, count: count, likes: likes, pending: pending, state: state, freeCust: freeCust, shouldPrompt: shouldPrompt,
    progress: progress, markShown: markShown, skip: skip, finish: finish, lastPrompt: lastPrompt, hints: hints, carrySwipes: carrySwipes, carryPrefs: carryPrefs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else g.ctFree = api;
})(typeof window !== 'undefined' ? window : globalThis);
