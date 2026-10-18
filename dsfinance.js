/* Shared finance helpers for the stock pages.
 *
 * `stock.html` shows every car with a finance example, and the Find my BMW
 * confirmation shows a customer the handful that fit what they just told Dan.
 * Both need the same answer to "what does this car cost a month at this
 * deposit", and that answer has rules worth keeping in one place rather than
 * in two copies that drift (see CLAUDE.md on the board and newcar.html, where
 * twinned code is a standing hazard).
 *
 * Every figure here is BMW Financial Services' own. An exact rung from
 * automation/stock-finance-ladder.json is handed back untouched; between rungs
 * the payment is read off the straight line the lender's own quotes make,
 * which reproduces their figure to the penny. Measured, not assumed:
 *   - the payment is exactly linear in the deposit, and the rate depends only
 *     on the APR and term (148 cars at 11.9% share one rate to 2e-6 per £1);
 *   - a least-squares line through a car's rungs lands exactly on 97% of the
 *     1,913 rungs held, and matched live lender quotes at 20 deposits it had
 *     never been asked for (15 exact, the rest a penny, which is the floor
 *     while the quotes themselves are rounded to a penny);
 *   - total payable is deposit + payments x monthly + final payment, and the
 *     charges are that less the cash price, both exact on all 1,913.
 *
 * The guards are not optional. A car whose rungs do not sit on its own line is
 * never interpolated, so a deposit-dependent rate would take that car out
 * rather than quietly produce a wrong number; and the line is never used above
 * the most the lender will take.
 *
 * Term and mileage are a different matter and are NOT derivable: they move the
 * optional final payment, which comes out of the lender's residual tables. A
 * different term needs a new quote.
 */
window.dsFin = (function () {
  'use strict';

  /* How far a rung may sit off the line before this stops trusting it for that
     car. Every rung of all 312 cars sat within 0.83p, so 2p means something has
     genuinely changed rather than rounding. */
  var LINE_TOL = 0.02;
  var CDN = 'https://cdne-cdn-prod-polaris-prod.azureedge.net/vehicles/';

  function p2(n) { return Math.round(n * 100) / 100; }

  /* A quote the page may still show. They carry the lender's campaign end date
     rather than a rolling window, so the whole file lapses together. */
  function live(f) {
    if (!f || !f.monthly) return false;
    if (f.valid_to && new Date(f.valid_to) < new Date()) return false;
    return true;
  }

  /* The car's rungs as a line, once it is clear they make one. Cached on the
     entry; it cannot go stale, because the whole file is replaced when the
     quotes are refreshed. */
  function lineFor(e) {
    if (!e || !e.steps || e.steps.length < 2) return null;
    if (e._line !== undefined) return e._line;
    var s = e.steps, n = s.length, i;
    var sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (i = 0; i < n; i++) {
      sx += s[i].d; sy += s[i].m;
      sxx += s[i].d * s[i].d; sxy += s[i].d * s[i].m;
    }
    var den = n * sxx - sx * sx;
    if (!den) { e._line = null; return null; }
    var rate = -(n * sxy - sx * sy) / den;   /* £ a month less, per £1 down */
    var at0 = (sy + rate * sx) / n;          /* the monthly with nothing down */
    for (i = 0; i < n; i++) {
      if (Math.abs((at0 - rate * s[i].d) - s[i].m) > LINE_TOL) {
        e._line = null;
        return null;
      }
    }
    var b = s[n - 1];
    /* The top rung is as far as we asked, but where the lender told us its own
       ceiling the line holds to there too: checked at £6,100 on a car whose top
       rung is £5,000 and whose ceiling is £6,433.05, matching to a penny. */
    e._line = {
      m0: at0, rate: rate,
      top: e.maxdep ? Math.max(Number(e.maxdep), b.d) : b.d,
      apr: b.apr, term: b.t, payments: b.p, final: b.f
    };
    return e._line;
  }

  /* One quote at any deposit, or null where the lender has none to give. */
  function quoteAt(e, d) {
    if (!e || !e.steps) return null;
    for (var i = 0; i < e.steps.length; i++) {
      if (Number(e.steps[i].d) === d) return e.steps[i];   /* theirs, verbatim */
    }
    var L = lineFor(e);
    if (!L || d < 0 || d > L.top) return null;
    var m = p2(L.m0 - L.rate * d);
    if (m <= 0) return null;
    var tp = p2(d + L.payments * m + L.final);
    return { d: d, m: m, apr: L.apr, t: L.term, p: L.payments, f: L.final,
             c: p2(e.price - d), tp: tp, ch: p2(tp - e.price) };
  }

  /* The display shape: the standard example, or that example with the figures
     swapped for the chosen deposit's. The lender's legal wording carries across
     unchanged - it is written about the vehicle, its mileages, the campaign
     dates and the FCA disclosures and carries no deposit or monthly figure. */
  function at(base, entry, deposit) {
    if (!live(base)) return null;
    if (deposit === null || deposit === undefined) return base;
    var s = quoteAt(entry, deposit);
    if (!s) return null;
    return { product: base.product, lender: base.lender, legal: base.legal,
             price: base.price, reg: base.reg, valid_to: base.valid_to,
             annual_mileage: base.annual_mileage,
             contract_mileage: base.contract_mileage,
             excess_pence: base.excess_pence,
             monthly: s.m, deposit: s.d, apr: s.apr, term: s.t, payments: s.p,
             final_payment: s.f, credit: s.c, total_payable: s.tp,
             charges: s.ch };
  }

  /* The most this car can take, and whether the lender said so or it is simply
     as far as we have asked. */
  function limit(e) {
    if (!e) return null;
    if (e.maxdep) return { amount: Number(e.maxdep), lender: true };
    if (!e.steps || !e.steps.length) return null;
    var L = lineFor(e);
    return { amount: L ? L.top : Number(e.steps[e.steps.length - 1].d),
             lender: false };
  }

  /* Every photograph held for a car, the stock list's own one first so a card
     opens on the picture it always opened on. The detail file stores the CDN's
     id alone, because the prefix is the same on every one. */
  function photos(car, det) {
    var out = car && car.image ? [car.image] : [], i, u;
    var imgs = (det && det.images) || [];
    for (i = 0; i < imgs.length; i++) {
      u = imgs[i];
      if (u.indexOf('http') !== 0) u = CDN + u + '-enlarged.jpg';
      if (out.indexOf(u) === -1) out.push(u);
    }
    return out;
  }

  function money(n) { return '£' + Math.round(n).toLocaleString('en-GB'); }
  function money2(n) {
    return '£' + Number(n).toLocaleString('en-GB',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* The representative example, in the lender's own order. This is the
     required content of a financial promotion that quotes a monthly payment:
     do not shorten it, and do not show a payment anywhere without it. */
  function repExample(f) {
    return f.payments + ' monthly payments of ' + money2(f.monthly) + '. '
      + 'Cash price ' + money(f.price) + '. Customer deposit ' + money2(f.deposit) + '. '
      + 'Total amount of credit ' + money2(f.credit) + '. '
      + 'Optional final payment ' + money2(f.final_payment) + '. '
      + 'Total amount payable ' + money2(f.total_payable) + '. '
      + 'Duration ' + f.term + ' months. '
      + Number(f.annual_mileage).toLocaleString('en-GB') + ' miles a year, '
      + f.excess_pence + 'p per excess mile. '
      + f.apr + '% APR representative. Lender ' + f.lender + '. '
      + 'Finance subject to status, 18+, UK residents.';
  }

  /* ---------- brand new cars ----------
     The lender's own BMW Financial Services quote per car, recorded from
     BMW's own page for it by automation/new-stock-quotes.mjs into
     lookup/new-stock-quotes.json. Never the derived finance_example, and
     never the £24 per £1,000 matching rule, which is Dan's rule of thumb
     and not the lender's line.

     These rules were written inside new-cars.html and are now here, because
     three pages and the morning's card job all have to agree about when a
     brand new monthly may be shown: this repo has been bitten by twinned
     code before (shrinkShot/shrink, clipKey) and a finance rule that drifts
     between copies is worse than a cosmetic one. */
  var NEW_NEED = ['monthly', 'payments', 'term_months', 'cash_price', 'deposit',
    'amount_of_credit', 'final_payment', 'total_payable', 'charge_for_credit',
    'annual_mileage', 'excess_pence', 'apr'];
  var NEW_MAX_AGE_DAYS = 3;
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* car, its quote, and the quotes file's own generated_at. Everything has to
     hold: every item of the representative example present, the quote adding
     up three ways, agreeing with the car's price, still inside its own
     valid_to, and the file itself fresh. Anything else shows no monthly. */
  function newOk(car, e, generatedAt, now) {
    var t = now || Date.now(), i;
    if (!e || !e.lender || !e.product) return false;
    var vt = Date.parse(e.valid_to);
    if (!vt || vt < t) return false;
    for (i = 0; i < NEW_NEED.length; i++) if (!isNum(e[NEW_NEED[i]])) return false;
    var g = Date.parse(generatedAt);
    if (!g || t - g > NEW_MAX_AGE_DAYS * 864e5) return false;
    var dc = isNum(e.deposit_contribution) ? e.deposit_contribution : 0;
    if (Math.abs(e.cash_price - e.deposit - dc - e.amount_of_credit) > 0.02) return false;
    if (Math.abs(e.deposit + e.payments * e.monthly + e.final_payment - e.total_payable) > 0.05) return false;
    if (Math.abs(e.total_payable - e.cash_price - e.charge_for_credit) > 0.05) return false;
    if (car && isNum(car.price_gbp) && Math.abs(car.price_gbp - e.cash_price) > 1) return false;
    return true;
  }

  /* Same wording and order as the used car example above, plus the total
     charge for credit and the lender, which the new car quote carries. */
  function newRep(e) {
    var dc = isNum(e.deposit_contribution) && e.deposit_contribution > 0;
    return e.payments + ' monthly payments of ' + money2(e.monthly) + '. '
      + 'Cash price ' + money2(e.cash_price) + '. Customer deposit ' + money2(e.deposit) + '. '
      + (dc ? 'Deposit contribution ' + money2(e.deposit_contribution) + '. ' : '')
      + 'Total amount of credit ' + money2(e.amount_of_credit) + '. '
      + 'Optional final payment ' + money2(e.final_payment) + '. '
      + 'Total amount payable ' + money2(e.total_payable) + '. '
      + 'Total charge for credit ' + money2(e.charge_for_credit) + '. '
      + 'Duration ' + e.term_months + ' months. '
      + Number(e.annual_mileage).toLocaleString('en-GB') + ' miles a year, '
      + e.excess_pence + 'p per excess mile. '
      + e.apr + '% APR representative. Lender ' + e.lender + '. '
      + 'Finance subject to status, 18+, UK residents.';
  }

  var BROKER = 'Finance is arranged by Stephen James (Automotive) Ltd trading as '
    + 'Hedin Automotive (BMW Ruxley), an Appointed Representative of ITC Compliance '
    + 'Limited (FRN 313486), authorised and regulated by the Financial Conduct '
    + 'Authority. A credit broker, not a lender. Guarantees and indemnities may be required.';

  return { live: live, lineFor: lineFor, quoteAt: quoteAt, at: at,
           limit: limit, photos: photos, repExample: repExample,
           newOk: newOk, newRep: newRep, BROKER: BROKER,
           NEW_NEED: NEW_NEED, NEW_MAX_AGE_DAYS: NEW_MAX_AGE_DAYS,
           money: money, money2: money2, CDN: CDN, TOL: LINE_TOL };
})();
