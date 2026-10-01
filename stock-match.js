/* "Here are a few that fit" - the cars that match a finished Find my BMW brief.
 *
 * The brief has already gone to Dan by the time this runs. This is the bit the
 * customer gets back: a handful of real cars from the WHOLE group, chosen
 * against what they just said they wanted and what they can pay, with the
 * monthly payment worked out at their own deposit.
 *
 * Two rules from Dan, and neither is an accident:
 *   - NO LINK TO THE HEDIN LISTING. On the stock page a customer who came
 *     looking is given the listing; here they have just handed Dan a brief, and
 *     the point is that the next move comes to him rather than to a website.
 *   - ONE ACTION A CARD, and it is WhatsApp, pre-filled so Dan knows which car
 *     before he has read a word.
 *
 * Everything is read from the files the stock page already publishes, so there
 * is no second source of truth and nothing to keep in step: the two stock
 * lists, the lender quotes, the deposit ladder and the photographs. If any of
 * them will not load, the section simply does not appear - a confirmation page
 * that has already thanked somebody must not break because a side feature
 * could not fetch a file.
 */
window.dsStockMatch = (function () {
  'use strict';

  var WA = 'https://wa.me/447827138197';
  var SHOW = 6;

  /* Find my BMW's "features that matter" in the words Hedin's listings
     actually use, worked out by reading all 434 equipment lines across the
     stock rather than guessed. Two things that bite:

     TRUNCATION. The lines stop at about 40 characters, so the car that has
     adaptive cruise says "Digital Aftermarket - Active Cruise Cont" with no
     "rol" on the end. Patterns match the stump, not the full phrase.

     DELETIONS. "Deletion of Harman/Kardon" is a factory delete and means the
     car does NOT have it. A plain substring match counts those as a match, so
     every line beginning "Deletion of" is thrown out first. 50 cars carry one.

     `firm:false` means Hedin do not itemise it because it is standard fit on
     a modern BMW, so a car not listing it tells us nothing: sat-nav shows on
     8 cars of 325 and Apple CarPlay on 7, when in truth nearly all of them
     have both. Those are never used to rule a car out and are never claimed
     as present. Ruling on them would be worse than useless - somebody asking
     for sat-nav would be shown eight cars.
     "360 Camera" and "Leather Seats" have NOTHING in the data: upholstery is
     not in the equipment list at all, and no car names a surround-view camera.
  */
  var FEATURES = {
    'Heated Seats':                 {firm:true,  re:/heated\s+(front\s+|and\s+rear\s+)?seats|heat comfort system/i},
    'Heated Steering Wheel':        {firm:true,  re:/heated steering wheel/i},
    'Panoramic Roof':               {firm:true,  re:/panoramic glass (sun)?roof|sky lounge panoramic/i},
    'Electric Seats':               {firm:true,  re:/electric memory seats|front electric seats/i},
    'Parking Sensors':              {firm:true,  re:/parking assistant|park distance control|parking sensors/i},
    'Keyless Entry':                {firm:true,  re:/comfort access/i},
    'Head-Up Display':              {firm:true,  re:/head.?up display/i},
    'Wireless Charging':            {firm:true,  re:/wireless charging/i},
    'Premium Sound System':         {firm:true,  re:/harman\/kardon|bowers & wilkins|hifi loudspeaker/i},
    'Adaptive Cruise Control':      {firm:true,  re:/active cruise cont/i},
    'Reversing Camera':             {firm:false, re:/reversing camera/i},
    'Apple CarPlay / Android Auto': {firm:false, re:/smartphone integration/i},
    'Navigation':                   {firm:false, re:/navigation/i},
    '\u00b0Camera':                 {firm:false, re:null},
    'Leather Seats':                {firm:false, re:null}
  };
  var DELETED = /^\s*deletion of/i;

  function feat(name){
    if (FEATURES[name]) return FEATURES[name];
    /* "360\u00b0 Camera" carries a degree sign; match on the number so a
       change of punctuation in the funnel cannot silently stop matching. */
    if (/^360/.test(name)) return FEATURES['\u00b0Camera'];
    return null;
  }

  function hasFeature(det, name){
    var f = feat(name);
    if (!f || !f.re) return false;
    var kit = (det && det.equipment) || [];
    for (var i = 0; i < kit.length; i++)
      if (f.re.test(kit[i]) && !DELETED.test(kit[i])) return true;
    return false;
  }

  /* Only the ones the listings record reliably can rule a car out. */
  function firmOnly(list){
    return list.filter(function (n){ var f = feat(n); return f && f.firm && f.re; });
  }

  /* Find my BMW's words for a body style, in the stock list's words. "Touring"
     is BMW for an estate and is the one that does not translate itself. */
  var BODY = {
    hatchback: 'hatch', saloon: 'saloon', touring: 'estate', suv: 'suv',
    coupe: 'coupe', convertible: 'convertible', gran_coupe: 'gran-coupe'
  };

  function ss(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function arr(k) {
    try { var v = JSON.parse(ss(k) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function num(s) {
    var m = String(s == null ? '' : s).replace(/[^0-9]/g, '');
    return m ? parseInt(m, 10) : 0;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* What they told the funnel. Everything is optional: a brief that skipped a
     step simply narrows less. */
  function brief() {
    var route = ss('purchaseType');
    return {
      bodies: arr('bodyStyles').map(function (b) { return BODY[b]; }).filter(Boolean),
      colours: arr('specColours').filter(function (c) { return c !== 'Open to any'; }),
      needs: arr('specNeeds'),
      wants: arr('specWants'),
      trim: ss('specTrim'),
      cash: /outright/i.test(route),
      deposit: num(ss('deposit')),
      monthly: num(ss('monthlyBudget')),
      cashBudget: num(ss('cashBudget')),
      model: ss('modelPref').trim().toLowerCase(),
      name: (ss('fullName') || '').trim().split(/\s+/)[0] || ''
    };
  }

  function bodyKey(c) {
    if (/gran\s*coup/i.test(c.model || '')) return 'gran-coupe';
    var map = { SUV: 'suv', Saloon: 'saloon', Estate: 'estate', Hatchback: 'hatch',
                Coupe: 'coupe', Convertible: 'convertible' };
    return map[c.body] || (c.body || '').toLowerCase();
  }

  /* How many of their must-haves this car actually has, and which of
     everything they named it can be shown to have. */
  function metNeeds(det, b) {
    var firm = firmOnly(b.needs), n = 0;
    for (var i = 0; i < firm.length; i++) if (hasFeature(det, firm[i])) n++;
    return n;
  }
  function matchedAsks(det, b) {
    return b.needs.concat(b.wants).filter(function (name) {
      return hasFeature(det, name);
    });
  }

  /* Their own words for the car, against its model name and family. */
  function modelHit(c, b) {
    if (!b.model) return 0;
    var hay = ((c.model || '') + ' ' + (c.series || '')).toLowerCase(), n = 0;
    b.model.split(/[^a-z0-9]+/).forEach(function (w) {
      if (w.length > 1 && hay.indexOf(w) !== -1) n++;
    });
    return n;
  }

  /* M Sport is on 270 of 332 cars, so trim can only ever rank, never rule out.
     One boolean, used by both the ranking and the percentage, so the number a
     customer reads and the order they are read in cannot disagree.
     "Luxury / High spec" has almost nothing literal to match - one model name
     in the whole list - so it is read as how much kit the car carries, which is
     what somebody choosing it means. The bar is 48 equipment lines, the 75th
     percentile of the stock (median 43), so it picks out the best-equipped
     quarter rather than most of the forecourt. */
  var HIGH_SPEC = 48;

  function trimMet(c, det, choice) {
    var kit = (det && det.equipment) || [];
    var name = ((c.model || '') + ' ' + (c.trim || '')).toLowerCase();
    var m = /m sport|m performance/.test(name)
         || kit.some(function (k) { return /^m sport/i.test(k) && !DELETED.test(k); });
    if (choice === 'M Sport / Performance') return m;
    if (choice === 'Standard / SE') return !m;
    if (choice === 'Sport') return /sport/.test(name);
    if (choice === 'Luxury / High spec') return kit.length >= HIGH_SPEC;
    return false;
  }

  /* How much of what they ACTUALLY ASKED FOR this car gives them.
     Deliberately not the ranking score scaled to 100: that number would move
     on things nobody asked about (age, mileage, which forecourt) and could
     not be explained. This is a share of their own brief, and the line of
     met asks under it on the card is the working.
     Only what they stated is counted, so somebody who skipped a step is not
     marked down for it, and a feature Hedin never itemise is in neither half -
     it would otherwise hold every car below 100% for something we simply
     cannot see. Must-haves weigh three, nice-to-haves one. */
  function matchPct(c, det, b) {
    var got = 0, max = 0;
    function add(w, ok) { max += w; if (ok) got += w; }
    /* The budget and the body style are hard filters, so a car that got this
       far meets them - but they were asked for, so they belong in the total. */
    if (b.bodies.length) add(3, true);
    if (b.cash ? b.cashBudget : b.monthly) add(3, true);
    if (b.colours.length) add(2, b.colours.indexOf(c.colour) !== -1);
    if (b.model) add(2, modelHit(c, b) > 0);
    if (b.trim && b.trim !== 'No preference') add(1, trimMet(c, det, b.trim));
    firmOnly(b.needs).forEach(function (n) { add(3, hasFeature(det, n)); });
    firmOnly(b.wants).forEach(function (n) { add(1, hasFeature(det, n)); });
    /* With nothing but a budget and a body style stated, every car is 100% and
       the badge says nothing. Shown only when something could separate them. */
    var picky = b.colours.length || b.model
      || (b.trim && b.trim !== 'No preference')
      || firmOnly(b.needs).length || firmOnly(b.wants).length;
    return (max && picky) ? Math.round(100 * got / max) : null;
  }

  /* A car is only shown if it genuinely clears what they said they could pay.
     Nothing is stretched to fill the list: three cars that fit beat six that
     do not, and an empty list is answered honestly below. */
  function fits(c, b, fin) {
    if (b.bodies.length && b.bodies.indexOf(bodyKey(c)) === -1) return false;
    if (b.cash) return !b.cashBudget || c._price <= b.cashBudget;
    if (!fin) return false;                       /* no quote, nothing to promise */
    return !b.monthly || fin.monthly <= b.monthly;
  }

  /* Among the cars that fit, the ones closest to what they described. Dan's
     own forecourt wins ties, the same way it sorts first on the stock page. */
  function score(c, b, fin, det) {
    var s = 0;
    if (b.colours.length && b.colours.indexOf(c.colour) !== -1) s += 30;
    s += 25 * modelHit(c, b);
    /* Nice-to-haves rank; must-haves gate above and are not double counted
       here beyond the ordering the caller already applies. */
    b.wants.forEach(function (n) { if (hasFeature(det, n)) s += 15; });
    if (b.trim && b.trim !== 'No preference' && trimMet(c, det, b.trim)) s += 25;
    if (c._home) s += 12;
    if (fin && b.monthly) s += Math.max(0, 10 - (b.monthly - fin.monthly) / 25);
    s += Math.max(0, (c._year || 0) - 2018);
    s += Math.max(0, 8 - c._miles / 10000);
    return s;
  }

  function waLink(c, fin) {
    var bits = ['Hi Dan, I’ve seen this and I’m interested.', '',
                [c.year, c.model].filter(Boolean).join(' ')];
    if (c.reg) bits.push('Reg ' + c.reg);
    if (c.price) bits.push(c.price);
    if (fin) bits.push('Around ' + dsFin.money(fin.monthly) + ' a month with '
                       + dsFin.money(fin.deposit) + ' down');
    return WA + '?text=' + encodeURIComponent(bits.join('\n'));
  }

  function card(c, fin, det, asks, pct) {
    var pics = dsFin.photos(c, det);
    var spec = [c.mileage ? String(c.mileage).replace(/ /g, ' ') : '',
                c.fuel || '', c.gearbox || '', c.colour || '']
                .filter(Boolean).join(' · ');
    return '<article class="sm-card">'
      + (pics.length
          ? '<img class="sm-photo" src="' + esc(pics[0]) + '" alt="'
            + esc((c.year || '') + ' ' + c.model) + '" loading="lazy" width="560" height="315"/>'
          : '')
      + '<div class="sm-body">'
      +   '<p class="sm-meta">' + esc([c.year, c.reg].filter(Boolean).join(' · '))
      +     (pct === null || pct === undefined ? ''
            : '<span class="sm-pct' + (pct >= 80 ? ' hot' : '') + '">' + pct + '% match</span>')
      +   '</p>'
      +   '<h3 class="sm-title">' + esc(c.model) + '</h3>'
      +   '<p class="sm-price">' + esc(c.price || '') + '</p>'
      +   (fin
            ? '<p class="sm-mo">' + dsFin.money(fin.monthly) + ' a month with '
              + dsFin.money(fin.deposit) + ' down</p>'
              + '<details class="sm-rep"><summary>Representative example</summary><p>'
              + esc(dsFin.repExample(fin)) + '</p>'
              + (fin.legal ? '<p>' + esc(fin.legal) + '</p>' : '') + '</details>'
            : '')
      +   (spec ? '<p class="sm-spec">' + esc(spec) + '</p>' : '')
      +   ((asks && asks.length)
            ? '<p class="sm-asks">' + asks.map(esc).join(' \u00b7 ') + '</p>'
            : '')
      +   '<a class="sm-wa" href="' + waLink(c, fin) + '" target="_blank" rel="noopener"'
      +     ' data-reg="' + esc(c.reg || '') + '">I’m interested in this one</a>'
      + '</div></article>';
  }

  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      return r.ok ? r.json() : null;
    });
  }

  function init(opts) {
    var box = document.getElementById((opts && opts.into) || 'stockMatch');
    if (!box || typeof dsFin === 'undefined') return;
    var b = brief();

    Promise.all([
      getJSON('automation/hedin-stock-snapshot.json'),
      getJSON('automation/hedin-group-stock.json'),
      getJSON('automation/stock-finance.json'),
      getJSON('automation/stock-finance-ladder.json'),
      getJSON('automation/car-details.json')
    ]).then(function (r) {
      var mine = r[0] || [], rest = r[1] || [], FIN = r[2] || {},
          LAD = r[3] || {}, DET = r[4] || {};
      if (!mine.length && !rest.length) return;

      var all = mine.map(function (c) { c._home = true; return c; })
        .concat(rest.map(function (c) { c._home = false; return c; }));

      var firm = firmOnly(b.needs);
      var rows = [];
      all.forEach(function (c) {
        c._price = num(c.price); c._miles = num(c.mileage); c._year = num(c.year);
        /* their own deposit, so the payment is the one they would actually pay */
        var fin = dsFin.at(FIN[c.id], LAD[c.id], b.cash ? null : b.deposit);
        if (!fits(c, b, fin)) return;
        var det = DET[c.id];
        rows.push({ c: c, fin: fin, det: det, s: score(c, b, fin, det),
                    met: metNeeds(det, b), asks: matchedAsks(det, b),
                    pct: matchPct(c, det, b) });
      });
      if (!rows.length) return;

      /* A must-have is meant to mean it. Cars that have the lot are shown on
         their own, and only if nothing has the lot does this fall back to the
         closest - which it then says out loud, rather than quietly handing
         somebody a car missing the one thing they insisted on. */
      var whole = rows.filter(function (r) { return r.met === firm.length; });
      var short = firm.length && !whole.length;
      rows = (whole.length ? whole : rows);
      /* The percentage leads the ordering, because a 90% card sitting above a
         95% one reads as broken however good the reason. The score only breaks
         ties, on the things nobody asked about: newer, fewer miles, Dan's own
         forecourt. */
      rows.sort(function (x, y) {
        return (y.met - x.met) || ((y.pct || 0) - (x.pct || 0)) || (y.s - x.s);
      });
      rows = rows.slice(0, SHOW);

      box.innerHTML =
        '<h2 class="sm-h">' + (b.name ? esc(b.name) + ', a' : 'A')
        + ' few in stock that fit</h2>'
        + '<p class="sm-sub">Picked from every BMW we have, against what you have '
        + 'just told me'
        + (b.cash
            ? '.'
            : (b.deposit
                ? ', with the payments worked out on your ' + dsFin.money(b.deposit) + ' deposit.'
                : '.'))
        + (short
            ? ' Nothing in stock has every must-have you listed, so these are the'
              + ' closest, and each one says what it does have.'
            : '')
        + ' Tap one and it comes straight to me.</p>'
        + '<div class="sm-grid">'
        + rows.map(function (r2) { return card(r2.c, r2.fin, r2.det, r2.asks, r2.pct); }).join('')
        + '</div>';
      box.hidden = false;

      box.addEventListener('click', function (e) {
        var a = e.target.closest('.sm-wa');
        if (a && window.gtag) {
          gtag('event', 'match_interest', { reg: a.getAttribute('data-reg') });
        }
      });
    })['catch'](function () { /* the page has already thanked them; stay quiet */ });
  }

  return { init: init, brief: brief, fits: fits, BODY: BODY };
})();
