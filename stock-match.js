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
  function score(c, b, fin) {
    var s = 0;
    if (b.colours.length && b.colours.indexOf(c.colour) !== -1) s += 30;
    if (b.model) {
      var hay = (c.model || '').toLowerCase();
      b.model.split(/[^a-z0-9]+/).forEach(function (w) {
        if (w.length > 1 && hay.indexOf(w) !== -1) s += 25;
      });
    }
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

  function card(c, fin, det) {
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
      +   '<p class="sm-meta">' + esc([c.year, c.reg].filter(Boolean).join(' · ')) + '</p>'
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

      var rows = [];
      all.forEach(function (c) {
        c._price = num(c.price); c._miles = num(c.mileage); c._year = num(c.year);
        /* their own deposit, so the payment is the one they would actually pay */
        var fin = dsFin.at(FIN[c.id], LAD[c.id], b.cash ? null : b.deposit);
        if (!fits(c, b, fin)) return;
        rows.push({ c: c, fin: fin, s: score(c, b, fin) });
      });
      if (!rows.length) return;

      rows.sort(function (x, y) { return y.s - x.s; });
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
        + ' Tap one and it comes straight to me.</p>'
        + '<div class="sm-grid">'
        + rows.map(function (r2) { return card(r2.c, r2.fin, DET[r2.c.id]); }).join('')
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
