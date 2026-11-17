/* SwipeToDrive public brand rules (Dan, 17 Nov 2026): nothing public on SwipeToDrive names the dealer group or
   the site. Cars and their "About this car" text come from the shared stock feed, so they are cleaned here, at
   load and at display time, and never in the shared files other pages and jobs read. The FCA credit broker
   statement in the finance small print is the one exception and is never passed through this file.
   Pure functions, used by app.js and by node tests (tests/brand.test.js). */
(function (g) {
  'use strict';
  var BANNED = /hedin|ruxley/i;
  /* sentences that only make sense on the group's own site: drop them whole */
  var DROP = [/hedin|ruxley/i, /enquiryhub@/i, /contact us at BMW\b/i, /^\s*welcome to BMW\b/i];
  /* sentences worth keeping once the name is swapped */
  var SWAP = [
    [/(?:\uD83D\uDE97\s*)?Hedin\s+BMW\s+Ruxley\s+(?:are|is)\s+pleased\s+to\s+offer/gi, 'Dan is pleased to offer'],
    [/Hedin\s+Club\s*Care(?:\s+SMART)?(?:\s+protection)?/gi, 'cosmetic repair cover']
  ];
  function sentences(p) { return String(p).match(/[^.!?]+(?:[.!?]+|$)/g) || []; }
  /* one paragraph of a car description, cleaned; '' when nothing is left */
  function cleanPara(p) {
    var t = String(p || '');
    SWAP.forEach(function (s) { t = t.replace(s[0], s[1]); });
    return sentences(t).filter(function (s) { return s.trim() && !DROP.some(function (r) { return r.test(s); }); }).join('').replace(/\s+/g, ' ').trim();
  }
  /* the whole description: paragraphs split on blank lines, each cleaned, empty ones dropped */
  function cleanDesc(text) {
    if (!text || typeof text !== 'string') return [];
    return text.split(/\n\s*\n/).map(cleanPara).filter(Boolean);
  }
  /* a stock row as SwipeToDrive shows it: no link to the group's listing and no retailer name */
  function cleanCar(c) {
    if (!c || typeof c !== 'object') return c;
    delete c.listing_url; delete c.retailer_name; delete c.retailer; delete c.dealer_name;
    return c;
  }
  function clean(s) { return BANNED.test(String(s || '')) ? '' : s; }
  var api = { cleanDesc: cleanDesc, cleanPara: cleanPara, cleanCar: cleanCar, clean: clean, BANNED: BANNED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else g.ctBrand = api;
})(typeof window !== 'undefined' ? window : globalThis);
