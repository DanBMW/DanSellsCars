/* Which two brand new cars are today's.
 *
 * One implementation, deliberately. todays-offers.html shows the pair and the
 * morning job (automation/new-car-post.py, through this file in node) builds
 * the Instagram card for each one: if the two ever disagreed, Dan would post a
 * card for a car his own page is not offering. This repo has already been
 * bitten by twinned code (shrinkShot/shrink, clipKey), so the rule lives here
 * and both sides read it.
 *
 * The pair is a function of the London date and the stock list, and nothing
 * else: every visitor on a day sees the same two, it rolls at midnight with
 * nobody pressing anything, and there is no state to keep. The same way the
 * board picks its six forecourt cars.
 *
 * Browser:  <script src="new-pair.js"></script>  ->  window.dsNewPair
 * Node:     const { pick } = require('./new-pair.js');
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.dsNewPair = api;
})(this, function () {
  'use strict';

  /* FNV-1a over the day key. Small, stable, and the same answer in every
     browser and in node. */
  function seed(str) {
    var h = 2166136261, i;
    for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }

  /* A car has to have an order number, a price, and not be on hold. on_hold
     arrives from the locator as the string "True" as well as a boolean. */
  function sellable(c) {
    return !!(c && c.order_number && c.price_gbp
      && String(c.on_hold) !== 'True' && String(c.on_hold) !== 'true');
  }

  /* Two different models where the stock allows it, because two 1 Series side
     by side is one offer rather than two. A forecourt with one model on it
     still gets its second car. */
  function pick(cars, day, want) {
    var list = (cars || []).filter(sellable);
    var n = want || 2;
    if (!list.length) return [];
    list = list.slice().sort(function (a, b) {
      return String(a.order_number) < String(b.order_number) ? -1 : 1;
    });
    var h = seed(day + '|new'), len = list.length, out = [], used = {}, step, j;
    for (step = 0; step < len && out.length < n; step++) {
      var c = list[(h + step * 7919) % len];
      var k = c.series || c.description;
      if (used[k] || out.indexOf(c) !== -1) continue;
      used[k] = 1; out.push(c);
    }
    for (j = 0; j < len && out.length < n; j++) {
      var d = list[(h + j) % len];
      if (out.indexOf(d) === -1) out.push(d);
    }
    return out;
  }

  return { pick: pick, seed: seed, sellable: sellable };
});
