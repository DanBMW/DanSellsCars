/* Desk mode: Dan's own fact find for a customer sitting with him.
 *
 * Order (Dan, 8 October): the fact find holds no personal details. Find car
 * shows the recommendation, the "out of X" line, alternatives and brand new
 * options (with a Within reach tier up to fmbMatch.TOLERANCE, 15%, over budget).
 * Only then does Customer details appear, then Submit, which sends ONE
 * Formspree email laid out as a fact find. Nothing else touches Formspree.
 *
 * Failsafe: the whole screen autosaves to this device's localStorage on every
 * change, every 15 seconds and when the tab hides. Reopening offers Carry on
 * or Start new customer. The staff gate is a layer over the page and never
 * clears the form. The draft clears only after a successful Submit or New
 * customer. GA events carry funnel: fmb_desk and desk_session.
 * Same matching code as the public flow (fmb-match.js). Plain ES2017.
 */
(function () {
  'use strict';
  var M = window.fmbMatch, ST = window.dsStock, FN = window.dsFin;
  var FORM_URL = 'https://formspree.io/f/xqewleog';
  var DAN_EMAIL = 'daniel.cane@hedinautomotive.co.uk';
  var WORKER = 'https://vehicleproxy.danielcane1992.workers.dev';
  var DRAFT = 'fmbDeskDraft', GATE = 'fmbDeskGate';
  var IDLE_LOCK_MS = 30 * 60 * 1000;
  var GBP = '\u00a3';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function track(name, p) {
    if (typeof window.gtag !== 'function') return;
    var o = { funnel: 'fmb_desk', desk_session: 'true', traffic_type: 'internal' };
    for (var k in (p || {})) o[k] = typeof p[k] === 'string' ? p[k].slice(0, 100) : p[k];
    window.gtag('event', name, o);
  }
  function num(v) { var n = String(v == null ? '' : v).replace(/[^0-9.]/g, ''); return n ? Number(n) : null; }

  /* ---------- choices ---------- */
  /* The part exchange here is deliberately four facts: reg, mileage,
     settlement and a valuation (Dan, 10 October). Service history,
     condition, keys, fuel, gearbox and a separate SIV all came off, because
     he appraises and values the car properly when the customer comes in and
     a desk guess at any of them is a figure somebody might hold him to. */
  var PAY = [{ v: 'monthly', t: 'Monthly' }, { v: 'cash', t: 'Cash price' }, { v: 'notsure', t: 'Not sure yet' }];
  var INTEREST = [{ v: 'new', t: 'Brand new' }, { v: 'used', t: 'Approved used' }, { v: 'either', t: 'Either' }];
  var FIELDS = {
    models: { multi: true, opts: M.MODELS.map(function (m) { return { v: m.v, t: m.t }; }).concat([{ v: 'open', t: 'Open to ideas' }]) },
    who: { opts: M.WHO }, life: { opts: M.LIFE }, miles: { opts: M.MILES }, people: { opts: M.PEOPLE },
    boot: { opts: M.BOOT }, charge: { opts: M.CHARGE },
    pay: { opts: PAY }, when: { opts: M.WHEN }, interest: { opts: INTEREST },
    body: { multi: true, opts: M.BODY }, fuel: { multi: true, opts: M.FUEL },
    mustF: { multi: true, opts: M.EXTRAS.map(function (k) { return { v: k, t: k === 'seven' ? '7 seats' : ST.FEATURES[k].label }; }) },
    wouldF: { multi: true, opts: M.EXTRAS.map(function (k) { return { v: k, t: k === 'seven' ? '7 seats' : ST.FEATURES[k].label }; }) },
    colours: { multi: true, opts: M.COLOURS.map(function (c) { return { v: c, t: c }; }) },
    fundMethod: { multi: true, opts: [{ v: 'pcp', t: 'BMW Select / PCP' }, { v: 'hp', t: 'HP' }, { v: 'other', t: 'Other' }, { v: 'savings', t: 'Savings' }, { v: 'loan', t: 'Loan' }, { v: 'motability', t: 'Motability' }] },
    keepTerm: { opts: [{ v: '24', t: '24 months' }, { v: '36', t: '36 months' }, { v: '48', t: '48 months' }, { v: 'other', t: 'Other' }] },
    said: { opts: [{ v: 'yes', t: 'Yes' }, { v: 'no', t: 'No' }] },
    introBM: { opts: [{ v: 'yes', t: 'Yes' }, { v: 'no', t: 'No' }] }
  };
  var TEXTS = ['pxReg', 'pxMiles', 'pxSettle', 'pxVal', 'curCar', 'likeModel', 'important',
    'mustText', 'wouldText', 'notes', 'curMonthly', 'termOther', 'annualMiles', 'moFrom', 'mo', 'dep', 'cash',
    'n_model', 'n_usage', 'n_px', 'n_budget', 'n_when', 'n_must', 'n_result', 'n_next', 'nsDriveWhen', 'nsFollow'];
  var CHECKS = ['nsDrive', 'nsVal', 'cOptin'];
  var PERSONAL = ['cFirst', 'cLast', 'cPhone', 'cEmail', 'n_customer'];
  var SALES = 'Daniel Cane';

  function build() {
    Object.keys(FIELDS).forEach(function (f) {
      var box = document.querySelector('.desk-box[data-f="' + f + '"]'); if (!box) return;
      var F = FIELDS[f], type = F.multi ? 'checkbox' : 'radio';
      /* Radios can be cleared again with a second tap: nothing is forced at the desk. */
      box.innerHTML = F.opts.map(function (o) {
        return '<label class="chip"><input type="' + type + '" name="d_' + f + '" value="' + esc(o.v) + '"/><span>' + esc(o.t) + '</span></label>';
      }).join('');
    });
    var TIPS={
      models:["What's drawn you to that one?","Have you spent any time in one?"],
      interest:["Are you set on brand new, or open to approved used?","What would brand new give you that used would not?"],
      likeModel:["What is it about that model that stays with you?"],
      important:["When you picture the right car, what does a normal week in it look like?"],
      who:["Who's usually behind the wheel?"],
      life:["Walk me through a normal week in the car."],
      people:["Who else is in the car with you, most days?"],
      boot:["What do you end up carrying that the boot struggles with?"],
      charge:["Where would this car actually get charged?"],
      curCar:["What's not working about the car you're in now?"],
      pxReg:["What's the registration, so I can see what you're in?"],
      pxMiles:["Roughly how many miles has it done?"],
      pxVal:["What were you hoping your car would be worth?"],
      pxSettle:["Roughly what's left to settle, if you know?"],
      mustF:["What would a car have to have for you to say yes?"],
      wouldF:["And what would be lovely, but you could live without?"],
      mustText:["Say that in your own words. What can't you do without?"],
      wouldText:["What would make you smile, if it happened to be there?"],
      body:["What sort of shape feels right for how you live?"],
      fuel:["How do you feel about plugging in, or would you rather not?"],
      colours:["Any colours you love, or ones you just don't want?"],
      notes:["What else should I know so I don't miss the point?"],
      when:["When would you like to be driving it, if it felt right?"],
      curMonthly:["What are you paying now, and how does that feel?"],
      termOther:["How long do you plan to keep it?"],
      annualMiles:["Roughly how many miles do you cover in a year?"],
      pay:["How do you like to think about the money, monthly or as a total?"],
      moFrom:["What monthly figure would feel comfortable?"],
      mo:["And what's the most you'd want it to be?"],
      dep:["What could you comfortably put down?"],
      cash:["What sort of total feels right, if you were paying outright?"],
      fundMethod:["How were you thinking of paying for it?"],
      said:["Have they told you, in their own words, how they'll fund it?"],
      introBM:["Would it help to sit with our business manager on the figures?"],
      cFirst:["What name shall I put this under?"],
      nsDrive:["Would you like to drive one, and when suits?"],
      nsVal:["Shall I value the car you're in?"],
      nsFollow:["When should I come back to you?"]
    };
    function tipHost(el){return el.matches('legend,label,h3,p.desk-col-h')?el:(el.querySelector('legend,h3,p.desk-col-h'));}
    function addTip(el,lines){
      var host=tipHost(el); if(!host||!lines||host.querySelector('.qtip'))return;
      var d=document.createElement('span'); d.className='qtip no-print';
      d.innerHTML='<button type="button" tabindex="0" aria-label="A question to ask">?</button><span class="tip" role="tooltip">'+lines.map(esc).join('<br>')+'</span>';
      if(host.classList.contains('desk-opt')||host.matches('legend,h3,p')){ host.appendChild(d); return; }
      var lab=document.createElement('span'); lab.className='desk-lab';
      var node=host.firstChild;
      while(node&&node.nodeType===3){ var next=node.nextSibling; lab.appendChild(node); node=next; }
      lab.appendChild(d);
      var ctrl=host.querySelector('input,textarea,select');
      if(ctrl) host.insertBefore(lab, ctrl); else host.appendChild(lab);
    }
    document.querySelectorAll('.desk-box').forEach(function(box){addTip(box.parentElement,TIPS[box.getAttribute('data-f')]);});
    ['likeModel','important','curCar','pxReg','pxMiles','pxVal','pxSettle','mustText','wouldText','notes','curMonthly','termOther','annualMiles','moFrom','mo','dep','cash','cFirst','nsDriveWhen','nsFollow'].forEach(function(id){var e=$(id); if(e&&e.parentElement)addTip(e.parentElement,TIPS[id]||TIPS[id.replace('When','')]);});
    ['nsDrive','nsVal'].forEach(function(id){var e=$(id); if(e)addTip(e.parentElement,TIPS[id]);});
    document.addEventListener('click',function(ev){
      var btn=ev.target.closest&&ev.target.closest('.qtip>button');
      document.querySelectorAll('.qtip.open').forEach(function(el){if(!btn||el!==btn.parentNode)el.classList.remove('open');});
      if(btn&&window.matchMedia('(hover: none)').matches){btn.parentNode.classList.toggle('open'); ev.preventDefault();}
    });

    /* The jump bar opens the step rather than linking to it: a plain anchor
       scrolls to a folded <details> and leaves it folded, which reads as a
       dead link. */
    $('deskJump').innerHTML = secs().map(function (sec) {
      var h = sec.querySelector('h2, h3').cloneNode(true);
      var q = h.querySelector('.qtip'); if (q) q.remove();
      return '<button type="button" data-jump="' + esc(sec.id) + '">' + esc(h.textContent.trim()) + '</button>';
    }).join('');
    $('deskJump').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-jump]'); if (!b) return;
      var sec = $(b.getAttribute('data-jump')); if (!sec) return;
      openOnly(sec);
      fitChrome();
      sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  /* ---------- reading the form into the shared answer shape ---------- */
  function vals(f) { return [].map.call(document.querySelectorAll('input[name="d_' + f + '"]:checked'), function (i) { return i.value; }); }
  function one(f) { return vals(f)[0] || null; }
  /* Free text maps onto the features the stock data can actually see. */
  var WORD = [['keyless', /comfort access|keyless/i], ['pano', /panoramic|pano roof/i], ['heated', /heated seats/i],
    ['hud', /head[- ]?up/i], ['sound', /harman|bowers/i], ['acc', /adaptive cruise|driving assistant plus/i],
    ['xdrive', /xdrive|all wheel/i], ['towbar', /tow ?bar/i], ['seven', /7 seats|seven seats/i]];
  function readWords(text, into) {
    WORD.forEach(function (w) { if (w[1].test(text || '') && into.indexOf(w[0]) === -1) into.push(w[0]); });
  }
  function labels(keys) { return keys.map(function (k) { return k === 'seven' ? '7 seats' : (ST.FEATURES[k] ? ST.FEATURES[k].label : k); }); }
  function equity() {
    var e = pxEquityForDeposit(), el = $('pxEquity');
    if (e === null) { el.hidden = true; return null; }
    el.hidden = false;
    el.textContent = 'Equity: ' + FN.money(e) + (e < 0 ? ' (negative equity, it comes off the deposit)' : ', straight onto the deposit');
    return e;
  }
  /* The deposit, in one place and for every pay route.
     A part exchange IS a deposit, so the equity from section 3 is added to
     whatever cash they are putting in rather than left for Dan to total up
     in his head (Dan, 10 October: "assuming any equity would be used
     towards deposit"). It is the valuation less the settlement, and the
     valuation is what makes it a figure at all: a settlement on its own
     would otherwise read as that much negative equity while he is still
     typing, and drop the deposit below the cash. Negative equity counts,
     downwards, because that is what it does to the deal. */
  function pxEquityForDeposit() {
    var val = num($('pxVal').value), set = num($('pxSettle').value);
    if (val === null) return null;
    return val - (set || 0);
  }
  function depositTotal() {
    var cash = num($('dep').value), eq = pxEquityForDeposit();
    if (cash === null && eq === null) return null;
    return (cash || 0) + (eq || 0);
  }
  function paintDeposit() {
    var eq = pxEquityForDeposit(), tot = depositTotal();
    $('depPx').textContent = eq === null ? 'no valuation yet' : FN.money(eq);
    $('depPxNote').textContent = eq === null ? 'valuation less settlement, from section 3'
      : (eq < 0 ? 'negative equity, it comes off the deposit' : 'carried from section 3');
    $('depTotal').textContent = tot === null ? GBP + '0' : FN.money(tot);
    $('depHelp').textContent = tot === null
      ? 'Needed before Find car. Type 0 if there is no deposit.'
      : 'Every monthly figure on the results is quoted at ' + FN.money(tot) + '.';
    actSummary();
  }

  function answers() {
    var a = M.blank();
    var ms = vals('models');
    a.models = ms.filter(function (v) { return v !== 'open'; });
    a.modelOpen = ms.indexOf('open') !== -1;
    a.who = one('who'); a.life = one('life'); a.miles = one('miles'); a.people = one('people');
    a.boot = one('boot'); a.charge = one('charge'); a.when = one('when'); a.interest = one('interest');
    a.body = vals('body'); a.fuel = vals('fuel'); a.colours = vals('colours');
    a.must = vals('mustF'); a.extras = vals('wouldF');
    readWords($('mustText').value, a.must);
    readWords($('wouldText').value, a.extras);
    a.said = (nv('important') || nv('likeModel') || '').trim();
    a.pay = one('pay');
    /* The deposit goes in whatever the pay route, because it is what the
       lender ladder is read at (fmb-match finAt). It used to be collected
       only on the monthly route, so a cash or undecided customer had every
       payment on the page quoted at the lender's default instead of their
       own money. */
    a.dep = depositTotal();
    /* The ceiling is "Up to" when filled, otherwise the monthly budget. */
    if (a.pay === 'monthly') a.mo = num($('mo').value) || num($('moFrom').value) || 0;
    a.term = keepTerm();
    if (a.pay === 'cash') a.cash = num($('cash').value) || 0;
    var am = num($('annualMiles').value);
    if (am) a.miles = am < 6000 ? 'u6' : am < 10000 ? '6to10' : am < 15000 ? '10to15' : '15plus';
    return a;
  }
  /* One question for change cycle and term: how long they plan to keep it. */
  function keepTerm() {
    var c = one('keepTerm'), o = num($('termOther') ? $('termOther').value : '');
    if (c && c !== 'other') return Number(c);
    return o || null;
  }
  /* Old drafts had a free text change cycle and a separate term. */
  function termFromOld(f) {
    var t = num(f['#term'] || ''); if (t) return t;
    var cc = String(f['#changeCycle'] || '').toLowerCase(), m;
    if ((m = cc.match(/(\d+(?:\.\d+)?)\s*(m|month)/))) return Math.round(Number(m[1]));
    if ((m = cc.match(/(\d+(?:\.\d+)?)/))) { var n = Number(m[1]); return n <= 10 ? Math.round(n * 12) : Math.round(n); }
    return null;
  }
  function depTyped() { return String($('dep').value || '').trim() !== '' && num($('dep').value) !== null; }
  function pxInfo() {
    return { reg: $('pxReg').value.toUpperCase().replace(/[^A-Z0-9]/g, ''), found: $('pxFound').hidden ? '' : $('pxFound').textContent,
      car: $('curCar').value.trim(), miles: num($('pxMiles').value), est: $('pxEst').hidden ? '' : $('pxEst').textContent.replace(/^Mileage estimate: /, ''),
      val: num($('pxVal').value), settle: num($('pxSettle').value), equity: equity() };
  }

  /* ---------- data ---------- */
  var ready = false;
  function getJSON(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  var pData = Promise.all([
    getJSON('automation/hedin-stock-snapshot.json'), getJSON('automation/hedin-group-stock.json')['catch'](function () { return []; }),
    getJSON('automation/stock-finance.json')['catch'](function () { return {}; }), getJSON('automation/stock-finance-ladder.json')['catch'](function () { return {}; }),
    getJSON('automation/car-details.json')['catch'](function () { return {}; }), getJSON('lookup/new-stock.json')['catch'](function () { return { cars: [] }; })
  ]).then(function (r) {
    M.load({ home: r[0], group: r[1], fin: r[2], lad: r[3], det: r[4], newCars: r[5] });
    ready = true;
    if (FOUND) runFind(true);
  });

  /* ---------- Find car ---------- */
  var FOUND = false, RES = null, NEWR = null, TOT = null, A = null, VIEWCARS = [];
  function photo(c) { var p = FN.photos(c, M.data().det[c.id]); return p[0] || c.image || ''; }
  function usedCard(r, i, forCustomer, k) {
    var c = r.c, f = r.fin, u = photo(c);
    return '<article class="desk-card is-tappable" data-i="' + i + '" data-car="' + k + '">'
      + '<div class="fmb-ph"' + (c.reg ? ' data-aos-reg="' + esc(c.reg) + '" data-aos-src="' + (c._home ? 'forecourt' : 'group') + '"' : '') + '>'
      + (u ? '<img src="' + esc(u) + '" alt="" width="640" height="360" loading="lazy"/>' : '') + '</div>'
      + '<h3>' + (i === 0 ? 'Top pick: ' : '') + esc((c.year ? c.year + ' ' : '') + M.modelName(c)) + '</h3>'
      + '<p>' + esc([c.reg, c.price, String(c.mileage || '').replace(/\u00a0/g, ' '), c.colour, c._home ? 'Ruxley' : 'Group stock'].filter(Boolean).join(', ')) + '</p>'
      + '<p><b>Why this one:</b> ' + esc(r.why) + '</p>'
      + (!forCustomer && r.miss && r.miss.length ? '<p class="desk-note">Misses: ' + esc(r.miss.join(', ')) + '</p>' : '')
      + (forCustomer ? '' : danBudget(r))
      + protectHtml(r, forCustomer)
      + (f ? '<p class="desk-note">' + esc(FN.money2(f.monthly)) + ' a month. Representative example: ' + esc(M.repText(f)) + '</p>' : '<p class="desk-note">No lender quote at this deposit. Ask for a quote.</p>')
      + (forCustomer ? '' : termNote(f))
      + '</article>';
  }
  function newCard(r, reach, forCustomer, k) {
    var c = r.c;
    return '<article class="desk-card is-tappable' + (reach && !forCustomer ? ' desk-reach' : '') + '" data-car="' + k + '">'
      + '<h3>Brand new ' + esc(c.description) + '</h3>'
      + '<p>' + esc([c.colour, c.price, M.newWhen(c)].filter(Boolean).join(', ')) + '</p>'
      + (reach && !forCustomer && r.overLabel ? '<p class="desk-over">' + esc(r.overLabel) + (A && A.pay === 'monthly' ? ' (estimate, for Dan only)' : '') + '</p>' : '')
      + protectHtml(r, forCustomer)
      + '<p>Finance available. I\u2019ll send you a personalised quote.</p>'
      + '</article>';
  }

  /* Dan only: how far over, and the deposit that brings it in. */
  function danBudget(r) {
    var h = '';
    if (r.overLabel) h += '<p class="desk-over">' + esc(r.overLabel) + '</p>';
    if (r.depHint) h += '<p class="desk-note">' + esc(FN.money(r.depHint)) + ' more deposit gets this in.</p>';
    return h;
  }
  function termNote(f) {
    var t = A && A.term, q = f ? Number(f.term) : 0;
    return t && q && t !== q ? '<p class="desk-note">Quote is on ' + q + ' months, they plan to keep it ' + t + ' months. Requote at ' + t + ' if it matters.</p>' : '';
  }
  function relaxName(l) { return l === 2 ? M.DESK_RELAX2 : M.RELAX[l]; }
  function nearestHtml() {
    var n = RES && RES.nearest; if (!n) return '';
    var c = n.c, a = A;
    var what = (c.year ? c.year + ' ' : '') + M.modelName(c) + (c.reg ? ', ' + c.reg : '') + ', ' + (c.price || '');
    var fig = a.pay === 'monthly' ? 'at ' + FN.money(a.dep || 0) + ' deposit' : '';
    return '<div class="desk-dan"><b>For Dan only.</b> ' + (RES.list.length ? 'Nothing on their chosen model within 15% of budget. ' : 'Nothing within 15% of budget today, so no cars are shown. ')
      + 'Nearest' + (n.sameModel ? ' on the brief' : '') + ': ' + esc(what) + (fig ? ', ' + esc(fig) : '') + '. ' + esc(n.overLabel || '') + '.'
      + (n.depHint ? ' ' + esc(FN.money(n.depHint)) + ' more deposit gets this in.' : (a.pay === 'monthly' ? ' The lender ladder does not reach a deposit that brings it in.' : ''))
      + '</div>';
  }
  /* ---------- full protection (PROTECTION_COST out of the deposit) ---------- */
  function protectHtml(r, forCustomer, cls) {
    if (!r) return '';
    if (!r.protect) return !forCustomer && r.protectEst ? '<p class="desk-note desk-protect-no">With full protection: about ' + esc(FN.money(r.protectEst)) + ' a month, over budget (estimate, for Dan only).</p>' : '';
    var h = '<p class="' + (cls || 'desk-protect') + '">\u2713 ' + esc(M.PROTECT_LINE) + ' <a href="' + M.PROTECT_URL + '" target="_blank" rel="noopener">Learn more about the protection I offer</a></p>';
    if (!forCustomer && r.protectEst) h += '<p class="desk-note">With full protection: about ' + esc(FN.money(r.protectEst)) + ' a month, ' + esc(FN.money(M.PROTECTION_COST)) + ' less deposit on the car (estimate, for Dan only).</p>';
    return h;
  }
  function protectText(r, forDan) {
    if (forDan === false) return r.protect ? 'Yes, fits with full protection.' : 'Ask me about full protection on this car.';
    if (!r) return '';
    var est = r.protectEst ? ' About ' + FN.money(r.protectEst) + ' a month with ' + FN.money(M.PROTECTION_COST) + ' less deposit on the car (estimate, for Dan only).' : '';
    return (r.protect ? 'Yes, fits with full protection.' : 'No, over budget once protection comes out of the deposit.') + est;
  }

  /* ---------- Ask Will to value: a mailto in Dan's own mail app ---------- */
  var WILL = 'Will.potter@hedinautomotive.co.uk';
  function hasPx() { return !!($('pxReg').value.trim() || $('curCar').value.trim()); }
  function paintWill() { var on = hasPx(); $('pxWill').hidden = !on; $('pxWillNote').hidden = !on; }
  function customerStory(a) {
    var bits = [];
    var models = M.chosenModels(a).map(function (v) { return M.modelBy(v).t; });
    var fuel = (a.fuel || []).length === 1 ? M.byV(M.FUEL, a.fuel[0]).t.toLowerCase() : '';
    var what = models.length ? M.list(models, 'or') + (fuel ? ' ' + fuel : '') : (fuel ? 'a ' + fuel + ' BMW' : 'a BMW, open to ideas');
    var life = a.life && a.life !== 'open' ? ' for ' + M.softSaid(M.txt(M.LIFE, a.life)) : '';
    var when = a.when ? ', wants to change ' + M.softSaid(M.txt(M.WHEN, a.when)) : '';
    if (a.when === 'browsing') when = ', just browsing for now';
    var art = models.length ? (/^(X|M|i|8|11|18)/.test(models[0]) ? 'an ' : 'a ') : '';
    bits.push('Looking at ' + art + what + life + when + '.');
    if (a.pay) bits.push(M.budgetLine(a) + '.');
    return bits.join(' ');
  }
  function willMail() {
    var a = answers(), px = pxInfo();
    var found = px.found.replace(/ \(from reg lookup\).*$/, '');
    var year = (found.match(/^(19|20)\d\d/) || px.car.match(/^(19|20)\d\d/) || [''])[0];
    var car = px.car || found || 'Not given';
    var L = ['Hi Will,', '', 'Could you value a part exchange for me, please?', ''];
    L.push('Reg: ' + (px.reg || 'Not given'));
    L.push('Make and model: ' + car);
    if (year && car.indexOf(year) !== 0) L.push('Year: ' + year);
    if (found && found !== car) L.push('From the reg lookup: ' + found);
    L.push('Mileage: ' + (px.miles ? px.miles.toLocaleString('en-GB') + ' miles' : 'Not given'));
    if (px.est) L.push('Estimated mileage from MOT history: ' + px.est);
    if (px.settle !== null) L.push('Outstanding finance: ' + FN.money(px.settle) + ' to settle');
    if (nv('n_px')) L.push('Notes: ' + nv('n_px').replace(/\s*[\u2013\u2014]\s*/g, ', ').replace(/\s+-\s+/g, ', '));
    L.push('', 'The customer: ' + customerStory(a), '');
    L.push('This car has been uploaded to the appraisal system, please value.', '', 'Thanks,', 'Dan');
    var subj = 'PX valuation please: ' + (px.reg || '') + ' ' + car.replace(/^(19|20)\d\d\s+/, '');
    return { to: WILL, subject: subj.replace(/\s+/g, ' ').trim(), body: L.join('\n') };
  }
  function willHref() {
    var m = willMail();
    return 'mailto:' + m.to + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body.replace(/\n/g, '\r\n'));
  }
  function askWill() {
    if (!hasPx()) return;
    track('fmb_desk_px_will');
    window.location.href = willHref();
  }
  function resultHtml(forCustomer) {
    if (!RES) return '';
    var tight = RES.level === 0 && RES.nStrict > 0;
    var head = !RES.list.length ? 'Leave this one with me. I will find you the right car and be in touch.'
      : tight ? M.heroLine(A, TOT) : 'Out of the ' + TOT.total + ' cars in our stock, nothing nails every point today, so these are the closest.';
    var h = '<h2 class="desk-hero">' + esc(head) + '</h2>';
    if (!forCustomer) h += '<p class="desk-note">' + esc(M.xLine(A, TOT)) + '.' + (RES.level >= 2 ? ' Widened: ' + esc(RES.levels.filter(function (l) { return l >= 2; }).map(relaxName).join(', ')) + '.' : '') + (M.TOLERANCE && (A.pay === 'monthly' && A.mo > 0 || A.pay === 'cash' && A.cash > 0) ? ' Nothing over ' + Math.round(M.TOLERANCE * 100) + '% of budget is shown.' : '') + '</p>';
    if (!forCustomer) h += nearestHtml();
    /* The cards and the full page car view read off one list, so a card's
       data-car index can never point at a different car from the one it
       is drawn from. */
    VIEWCARS = [];
    function keep(slide) { VIEWCARS.push(slide); return VIEWCARS.length - 1; }
    var top = RES.list.slice(0, 3);
    h += top.map(function (r, i) { return usedCard(r, i, forCustomer, keep({ kind: 'used', role: i === 0 ? 'top' : 'alt', r: r })); }).join('');
    if (M.wantsNew(A)) {
      var anyNew = NEWR.fit.length || NEWR.reach.length;
      h += '<h3 class="desk-sub">Brand new options</h3>';
      if (!anyNew) h += '<p>I\u2019ll be in touch with brand new options that suit you.</p>';
      else {
        if (NEWR.fit.length) h += NEWR.fit.map(function (r) { return newCard(r, false, forCustomer, keep({ kind: 'new', role: 'new', r: r })); }).join('');
        if (NEWR.reach.length) {
          if (!forCustomer) h += '<h3 class="desk-sub">Within reach, up to ' + Math.round(M.NEW_STRETCH * 100) + '% over budget</h3>';
          h += NEWR.reach.map(function (r) { return newCard(r, true, forCustomer, keep({ kind: 'new', role: 'reach', r: r })); }).join('');
        }
      }
    }
    if (!forCustomer) h += '<div class="desk-row">' + (VIEWCARS.length ? '<button class="fmb-btn wide" type="button" id="deskPresentBtn">Present this car</button>' : '') + '<button class="fmb-btn ghost" type="button" id="deskShow">Customer view</button></div>';
    return h;
  }
  function runFind(silent) {
    A = answers();
    if (!ready) { $('deskEmpty').textContent = 'Loading today\u2019s stock, one moment.'; FOUND = true; return; }
    /* Dan, 14 October: Find car needs the deposit first (0 is fine if typed),
       because every monthly figure is read off the lender ladder at it. A
       cash buyer's budget does not depend on it. */
    var needDep = A.pay !== 'cash' && !depTyped();
    $('depNeed').hidden = !needDep; $('deskDep').classList.toggle('need', needDep);
    if (needDep) {
      FOUND = false; RES = null;
      $('deskResult').hidden = true; $('deskEmpty').hidden = false;
      $('deskEmpty').textContent = 'Add the cash deposit in section 7 first. Type 0 if there is no deposit.';
      if (!silent) { var dsec = $('sec-budget'); if (dsec) dsec.open = true; $('dep').focus(); }
      return;
    }
    RES = M.findUsed(A, { desk: true }); NEWR = M.findNew(A, { stretch: true }); TOT = M.stockTotal(A);
    FOUND = true;
    $('deskEmpty').hidden = true;
    var box = $('deskResult'); box.hidden = false; box.innerHTML = resultHtml(false);
    if (window.aosMedia) window.aosMedia.scan(box);
    $('deskCustomer').hidden = false; $('deskResultNotes').hidden = false;
    if (!silent) {
      track('fmb_desk_find', { stock_x: TOT.total, fallback_level: RES.level, new_fit: NEWR.fit.length, new_reach: NEWR.reach.length });
      fitChrome();
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    save();
  }

  /* ---------- the email ---------- */
  function line(label, v) { return v ? label + ': ' + v : ''; }
  function customer() {
    return { first: $('cFirst').value.trim(), last: $('cLast').value.trim(), phone: $('cPhone').value.trim(), email: $('cEmail').value.trim(), optin: $('cOptin').checked };
  }
  var LEAD_ID = null;
  function leadId() {
    if (LEAD_ID) return LEAD_ID;
    var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    LEAD_ID = 'FMB-D-' + String(d.getFullYear()).slice(2) + z(d.getMonth() + 1) + z(d.getDate()) + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    return LEAD_ID;
  }
  function subject() {
    var c = customer(), name = (c.first + ' ' + c.last).trim() || 'Customer';
    var t = RES && RES.list[0] ? RES.list[0].c : null;
    return 'Desk fact-find: ' + name + (t ? ', ' + t.model + ' ' + (t.reg || '') : '');
  }
  /* One content model, two renderings: the Submit email (plain text) and the
     printable customer profile (HTML). They always match. */
  function nv(id) { var e = $(id); return e ? e.value.trim() : ''; }
  function longDate(v) {
    var d = v ? new Date(String(v).slice(0, 10) + 'T12:00:00') : new Date();
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function stamp() {
    return longDate() + ', ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' (UK)';
  }
  /* forDan false is the customer profile: no budget wording, no estimate. */
  function usedRows(r, forDan) {
    var x = r.c, dan = forDan !== false;
    return [
      ['Car', (x.year ? x.year + ' ' : '') + x.model],
      ['Reg, price, mileage', [x.reg, x.price, String(x.mileage || '').replace(/\u00a0/g, ' ')].filter(Boolean).join(', ')],
      ['Colour, location', [x.colour, x._home ? 'Ruxley forecourt' : 'Group stock'].filter(Boolean).join(', ')],
      ['Why this one', String(r.why || '').replace(/\.+$/, '') + (dan && r.miss && r.miss.length ? '. Misses: ' + r.miss.join(', ') : '')
        + (dan && r.overLabel ? '. For Dan only: ' + r.overLabel + (r.depHint ? ', ' + FN.money(r.depHint) + ' more deposit gets this in' : '') : '')],
      ['Listing', x.url || ''],
      ['Full protection', protectText(r, dan)],
      ['Finance', r.fin ? FN.money2(r.fin.monthly) + ' a month. Representative example: ' + M.repText(r.fin) : 'No lender quote at this deposit yet. Ask for a quote.']
    ];
  }
  function newRow(r, a, reach, forDan) {
    var c = r.c, est = r.est, dan = forDan !== false;
    if (!dan) return 'BMW ' + c.description + ', ' + (c.colour || '') + ', ' + (c.price || '') + ', order ' + c.order_number + (M.newWhen(c) ? ', ' + M.newWhen(c).toLowerCase() : '') + '. Full protection: ' + protectText(r, false).replace(/\.$/, '');
    return 'BMW ' + c.description + ', ' + (c.colour || '') + ', ' + (c.price || '') + ', order ' + c.order_number + (M.newWhen(c) ? ', ' + M.newWhen(c).toLowerCase() : '')
      + (reach && r.overLabel ? '. For Dan only: ' + r.overLabel : '')
      + (a.pay === 'monthly' && est ? '. For Dan only: about ' + FN.money(est) + ' a month at ' + (a.dep === null ? FN.money(M.NEW_QUOTE_DEP) + ' (deposit not given)' : 'their ' + FN.money(a.dep)) + ' deposit on the ' + GBP + M.NEW_PER_1000 + ' per ' + GBP + '1,000 rule' : '')
      + '. Full protection: ' + protectText(r).replace(/\.$/, '');
  }
  /* One content model in the order of Dan's paper customer requirements
     document. The Submit email (text) and the A4 customer profile (HTML) are
     both rendered from it, so they always match. */
  function T(on) { return on ? '\u2611' : '\u2610'; }
  function fm(n) { return n === null || n === undefined || n === '' ? '' : FN.money(n); }
  var FUND = [['pcp', 'BMW Select / PCP'], ['hp', 'HP'], ['other', 'Other'], ['savings', 'Savings'], ['loan', 'Loan'], ['motability', 'Motability']];
  function model() {
    var a = A || answers(), px = pxInfo(), c = customer();
    var D = { a: a, px: px, c: c };
    D.customer = [['Name', (c.first + ' ' + c.last).trim()], ['Mobile', c.phone], ['Email', c.email], ['Marketing opt in', c.optin ? 'Yes' : 'No']];
    D.customerNotes = nv('n_customer');
    D.interestTicks = 'New ' + T(a.interest === 'new' || a.interest === 'either') + '  Used ' + T(a.interest === 'used' || a.interest === 'either');
    D.usage = [['Main driver', M.txt(M.WHO, a.who)], ['Typical week', M.txt(M.LIFE, a.life)], ['People', M.txt(M.PEOPLE, a.people)],
      ['Boot', M.txt(M.BOOT, a.boot)], ['Home charging', M.txt(M.CHARGE, a.charge)]];
    D.pxRows = [['Reg', [px.reg, px.found].filter(Boolean).join(', ')], ['Mileage', px.miles ? 'About ' + px.miles.toLocaleString('en-GB') + ' miles' : ''], ['Estimated mileage (MOT history)', px.est]].filter(function (r) { return r[0] !== 'Estimated mileage (MOT history)' || r[1]; });
    D.money = [['Valuation', fm(px.val)], ['Settlement', fm(px.settle)], ['Equity', px.equity === null ? '' : FN.money(px.equity) + (px.equity < 0 ? ' (negative)' : '')]];
    /* The desk figure is a working one. The appraisal happens in person, so
       the document says so rather than letting a desk number read as a
       valuation Dan has given. */
    if (px.val !== null) D.money.push(['Valued', 'Desk figure. Full appraisal and valuation on arrival']);
    D.must = labels(vals('mustF')).concat(nv('mustText') ? [nv('mustText')] : []);
    D.would = labels(vals('wouldF')).concat(nv('wouldText') ? [nv('wouldText')] : []);
    D.prefs = [['Shape', M.shapesText(a)], ['Fuel', M.fuelsText(a)], ['Colours', a.colours.length ? M.list(a.colours, 'or') : 'Open minded']];
    D.funding = {
      cur: fm(num(nv('curMonthly'))), miles: num(nv('annualMiles')) ? num(nv('annualMiles')).toLocaleString('en-GB') : '',
      pay: a.pay ? M.txt([{ v: 'monthly', t: 'Monthly' }, { v: 'cash', t: 'Cash price' }, { v: 'notsure', t: 'Not sure yet' }], a.pay) : '',
      moFrom: fm(num(nv('moFrom'))), moTo: fm(num(nv('mo'))),
      /* The deposit reaches Dan's inbox and the printed profile the way
         it is actually made up: the cash, the part exchange equity and
         the total the cars were quoted at. */
      depCash: fm(num(nv('dep'))), depPx: fm(pxEquityForDeposit()), depTotal: fm(depositTotal()),
      cash: fm(num(nv('cash'))), term: keepTerm() ? keepTerm() + ' months' : '',
      methods: vals('fundMethod'), said: one('said'), intro: one('introBM')
    };
    D.result = null;
    if (RES && RES.list.length) {
      D.result = { lead: M.xLine(a, TOT) + ', this is the one.', top: RES.list[0], alts: RES.list.slice(1, 3),
        match: RES.level === 0 ? 'Strict match, nothing widened' : 'Widened: ' + RES.levels.filter(function (l) { return l >= 2; }).map(relaxName).join(', '),
        matchCustomer: RES.level === 0 ? 'Matches everything you told me' : 'The closest to everything you told me',
        newFit: NEWR && M.wantsNew(a) ? NEWR.fit : null, newReach: NEWR && M.wantsNew(a) ? NEWR.reach : null };
    }
    D.next = [['Test drive', $('nsDrive').checked, nv('nsDriveWhen')], ['Valuation', $('nsVal').checked, ''],
      ['Follow up date', null, nv('nsFollow') ? longDate(nv('nsFollow')) : '']];
    return D;
  }
  function emailBody() {
    var D = model(), a = D.a, f = D.funding, L = [];
    function row(k, v) { if (v) L.push(k + ': ' + v); }
    function notes(id) { var n = nv(id); if (n) L.push('Notes: ' + n); }
    L.push('DESK SESSION. Find my BMW desk mode. Ref ' + leadId() + '. Salesperson ' + SALES + '. ' + stamp(), '');
    L.push('CUSTOMER DETAILS'); D.customer.forEach(function (r) { row(r[0], r[1]); }); if (D.customerNotes) L.push('Notes: ' + D.customerNotes); L.push('');
    L.push('CUSTOMER REQUIREMENT');
    L.push('Car of interest: ' + M.modelsText(a) + '. ' + D.interestTicks);
    L.push('Current car: ' + (D.px.car || D.px.found || 'Not given'));
    row('What is it you like about this particular model?', nv('likeModel'));
    row('What is important to you when looking for a new car?', nv('important'));
    notes('n_model');
    D.usage.forEach(function (r) { row(r[0], r[1]); }); notes('n_usage');
    L.push('Must have: ' + (D.must.join(', ') || 'None stated'));
    L.push('Would like: ' + (D.would.join(', ') || 'None stated'));
    D.prefs.forEach(function (r) { row(r[0], r[1]); }); notes('n_must');
    row('Specified requirements', nv('notes'));
    D.pxRows.forEach(function (r) { row(r[0], r[1]); });
    D.money.forEach(function (r) { row(r[0], r[1]); }); notes('n_px');
    row('Timeline', M.txt(M.WHEN, a.when)); notes('n_when');
    L.push('');
    L.push('CUSTOMER FUNDING REQUIREMENTS');
    row('Current monthly payment', f.cur); row('Plans to keep it', f.term); row('Annual mileage', f.miles);
    row('How they want to pay', f.pay);
    if (f.moFrom || f.moTo) L.push('Monthly budget: ' + (f.moFrom || 'not given') + ', up to ' + (f.moTo || 'not given'));
    if (f.depTotal) L.push('Deposit: ' + f.depTotal + ' in total'
      + (f.depPx ? ' (' + (f.depCash || '\u00a30') + ' cash plus ' + f.depPx + ' part exchange equity)' : ''));
    row('Cash budget up to', f.cash);
    L.push('Funding method: ' + FUND.map(function (m) { return m[1] + ' ' + T(f.methods.indexOf(m[0]) !== -1); }).join('  '));
    L.push('How has the customer SAID they are funding? Yes ' + T(f.said === 'yes') + '  No ' + T(f.said === 'no'));
    L.push('Introduction To Business Manager: Yes ' + T(f.intro === 'yes') + '  No ' + T(f.intro === 'no'));
    notes('n_budget'); L.push('');
    if (D.result) {
      var R = D.result;
      L.push('CAR FOUND', R.lead);
      usedRows(R.top).forEach(function (r) { row(r[0], r[1]); });
      L.push('');
      if (R.alts.length) { L.push('ALTERNATIVES'); R.alts.forEach(function (r, i) { L.push((i + 2) + '. ' + usedRows(r).filter(function (x) { return x[1]; }).map(function (x) { return x[0] + ': ' + String(x[1]).replace(/\.+$/, ''); }).join('. ')); }); L.push(''); }
      if (R.newFit) {
        L.push('BRAND NEW OPTIONS: FIT THE BUDGET'); if (R.newFit.length) R.newFit.forEach(function (r) { L.push(newRow(r, a, false)); }); else L.push('None fit every point today.');
        L.push('BRAND NEW OPTIONS: WITHIN REACH (up to ' + Math.round(M.NEW_STRETCH * 100) + '% over)'); if (R.newReach.length) R.newReach.forEach(function (r) { L.push(newRow(r, a, true)); }); else L.push('None.');
        L.push('Finance on all brand new: personalised quote to follow.', '');
      }
      row('Matching', R.match); notes('n_result'); L.push('');
    }
    if (RES && !RES.list.length) {
      L.push('CAR FOUND', 'Nothing within ' + Math.round(M.TOLERANCE * 100) + '% of budget today, so no cars were shown.');
      if (RES.nearest) { var n = RES.nearest; L.push('For Dan only. Nearest: ' + (n.c.year ? n.c.year + ' ' : '') + n.c.model + ', ' + (n.c.reg || '') + ', ' + (n.c.price || '') + '. ' + (n.overLabel || '') + (n.depHint ? '. ' + FN.money(n.depHint) + ' more deposit gets this in' : '') + '.'); }
      L.push('');
    }
    L.push('NEXT STEPS');
    D.next.forEach(function (n) { L.push(n[0] + ': ' + (n[1] === null ? (n[2] || 'Not set') : T(n[1]) + (n[2] ? ' ' + n[2] : ''))); });
    notes('n_next'); L.push('');
    L.push('The same content prints as an A4 customer profile from the Customer profile button in desk mode, on the device it was filled in on, until Submit clears it.');
    return L.join('\n').replace(/\n{3,}/g, '\n\n');
  }
  function profileHtml(opts) {
    opts = opts || {};
    var D = model(), a = D.a, f = D.funding;
    function v(x) { return esc(x || ''); }
    function tr(k, val, cls) { return '<tr><th' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(k) + '</th><td>' + val + '</td></tr>'; }
    function tbl(rows) { return '<table class="cp-t">' + rows.join('') + '</table>'; }
    function notes(id, label) { return '<div class="cp-notes"><b>' + esc(label || 'Notes') + '</b>' + v(nv(id)) + '</div>'; }
    var h = '<header class="cp-head"><div><h1>Customer profile</h1><p>Dan Sells, Hedin BMW Ruxley</p><p>Salesperson: ' + SALES + '</p></div>'
      + '<div class="cp-r"><p>' + esc(stamp()) + '</p><p>Ref ' + esc(leadId()) + '</p><p>Find my BMW desk mode</p></div></header>';
    if (opts.example) h += '<p class="cp-example">EXAMPLE DATA. Not a real customer.</p>';
    h += '<section class="cp-sec"><h2 class="cp-bar">Customer details</h2>' + tbl(D.customer.map(function (r) { return tr(r[0], v(r[1])); })) + (D.customerNotes ? '<div class="cp-notes"><b>Notes</b>' + v(D.customerNotes) + '</div>' : '') + '</section>';
    h += '<section class="cp-sec"><h2 class="cp-bar">Customer requirement</h2>' + tbl([
      tr('Car of interest', v(M.modelsText(a)) + '<span class="cp-ticks">' + esc(D.interestTicks) + '</span>'),
      tr('Current car', v(D.px.car || D.px.found)),
      tr('What is it you like about this particular model?', v(nv('likeModel'))),
      tr('What is important to you when looking for a new car?', v(nv('important')))
    ]) + notes('n_model') + '</section>';
    h += '<section class="cp-sec">' + tbl(D.usage.map(function (r) { return tr(r[0], v(r[1])); })) + notes('n_usage') + '</section>';
    h += '<section class="cp-sec"><div class="cp-cols"><div><h3>Must have</h3><ul>' + (D.must.length ? D.must.map(function (x) { return '<li>' + v(x) + '</li>'; }).join('') : '<li>None stated</li>') + '</ul></div>'
      + '<div><h3>Would like</h3><ul>' + (D.would.length ? D.would.map(function (x) { return '<li>' + v(x) + '</li>'; }).join('') : '<li>None stated</li>') + '</ul></div></div>'
      + tbl(D.prefs.map(function (r) { return tr(r[0], v(r[1])); })) + notes('n_must') + '</section>';
    h += '<section class="cp-sec"><div class="cp-spec"><b>Specified requirements</b><br/>' + v(nv('notes')) + '</div></section>';
    h += '<section class="cp-sec">' + tbl(D.pxRows.map(function (r) { return tr(r[0], v(r[1])); }).concat(D.money.map(function (r) { return tr(r[0], v(r[1]), 'strong'); }))) + notes('n_px') + '</section>';
    h += '<section class="cp-sec">' + tbl([tr('Timeline', v(M.txt(M.WHEN, a.when)))]) + notes('n_when') + '</section>';
    h += '<section class="cp-sec"><h2 class="cp-bar">Customer funding requirements</h2>'
      + '<table class="cp-t cp-grid3"><tr><td><span class="red">Current monthly payment \u00a3</span> ' + v(f.cur) + '</td><td><span class="red">Plans to keep it</span> ' + v(f.term) + '</td><td><span class="red">Annual mileage</span> ' + v(f.miles) + '</td></tr>'
      + '<tr><td><span class="red">Monthly budget \u00a3</span> ' + v(f.moFrom) + '</td><td><span class="red">Up to \u00a3</span> ' + v(f.moTo) + '</td><td><span class="red">Deposit</span> ' + v(f.depTotal) + (f.depPx ? ' (' + v(f.depCash) + ' cash, ' + v(f.depPx) + ' PX)' : '') + '</td></tr>'
      + '<tr><td>How they want to pay: ' + v(f.pay) + '</td><td>Cash up to: ' + v(f.cash) + '</td><td>Monthly ceiling used: ' + v(a.pay === 'monthly' && a.mo ? FN.money(a.mo) : '') + '</td></tr></table>'
      + '<table class="cp-t cp-fund"><tr>' + FUND.map(function (m) { return '<td>' + T(f.methods.indexOf(m[0]) !== -1) + ' ' + esc(m[1]) + '</td>'; }).join('') + '</tr></table>'
      + notes('n_budget')
      + '<table class="cp-t cp-grid2"><tr><td>How has the customer SAID they are funding? Yes ' + T(f.said === 'yes') + ' No ' + T(f.said === 'no') + '</td><td>Introduction To Business Manager Yes ' + T(f.intro === 'yes') + ' No ' + T(f.intro === 'no') + '</td></tr></table></section>';
    if (D.result) {
      var R = D.result, top = R.top, u = photo(top.c), rows = usedRows(top, false);
      h += '<section class="cp-sec"><h2 class="cp-bar">Car found</h2><p class="cp-lead">' + v(R.lead) + '</p>'
        + '<div class="cp-car">' + (u ? '<img src="' + esc(u) + '" alt=""/>' : '') + '<div>' + tbl(rows.filter(function (r) { return r[0] !== 'Finance'; }).map(function (r) { return tr(r[0], r[0] === 'Listing' && r[1] ? '<a href="' + esc(r[1]) + '">' + esc(r[1]) + '</a>' : v(r[1])); })) + '</div></div>'
        + '<p class="cp-rep">' + v(rows[rows.length - 1][1]) + '</p>' + tbl([tr('Matching', v(R.matchCustomer))]) + notes('n_result') + '</section>';
      if (R.alts.length) h += '<section class="cp-sec"><h3 class="cp-sub">Alternatives</h3>' + tbl(R.alts.map(function (r, i) {
        var o = {}; usedRows(r, false).forEach(function (x) { o[x[0]] = x[1]; });
        return tr((i + 2) + '. ' + (o['Car'] || ''), [o['Reg, price, mileage'], o['Colour, location'], o['Why this one'] ? 'Why: ' + o['Why this one'] : '', o['Full protection'] ? 'Full protection: ' + o['Full protection'] : '', o['Listing']].filter(Boolean).map(v).join('<br/>') + (o['Finance'] ? '<br/><span class="cp-rep">' + v(o['Finance']) + '</span>' : ''));
      })) + '</section>';
      if (R.newFit) h += '<section class="cp-sec"><h3 class="cp-sub">Brand new options</h3>' + tbl([
        tr('Brand new', R.newFit.length ? R.newFit.map(function (r) { return v(newRow(r, a, false, false)); }).join('<br/>') : 'None fit every point today'),
        tr('Also worth a look', R.newReach.length ? R.newReach.map(function (r) { return v(newRow(r, a, true, false)); }).join('<br/>') : 'None'),
        tr('Finance', 'Personalised quote to follow on all brand new')]) + '</section>';
    }
    h += '<section class="cp-sec"><h2 class="cp-bar">Next steps</h2>' + tbl(D.next.map(function (n) { return tr(n[0], (n[1] === null ? '' : T(n[1]) + ' ') + v(n[2] || (n[1] === null ? 'Not set' : ''))); })) + notes('n_next') + '</section>';
    h += '<section class="cp-sec"><h2 class="cp-bar">Manager comments</h2><div class="cp-box"></div>'
      + '<div class="cp-sign"><div>Salesperson: ' + SALES + '<br/><br/>Signature ______________________ Date __________</div>'
      + '<div>Sales Manager<br/><br/>Signature ______________________ Date __________</div></div></section>';
    return h;
  }
  function buildProfile(opts) {
    /* It prints whatever is filled in. A document with no car on it is
       still the document, and waiting for stock to load would be a
       surprising reason not to print. */
    if (!FOUND && ready) runFind(true);
    $('deskProfile').innerHTML = profileHtml(opts);
    return $('deskProfile');
  }
  function openProfile() {
    buildProfile(); $('deskProfileWrap').hidden = false; window.scrollTo(0, 0);
    track('fmb_desk_profile');
  }
  function payload() {
    var c = customer();
    return {
      form: 'find-my-bmw-desk', desk_session: 'true', lead_id: leadId(),
      _subject: subject(), _replyto: c.email || DAN_EMAIL,
      name: (c.first + ' ' + c.last).trim(), phone: c.phone, email: c.email, marketing_opt_in: c.optin ? 'Yes' : 'No',
      top_reg: RES && RES.list[0] ? RES.list[0].c.reg : '', stock_x: TOT ? String(TOT.total) : '',
      fact_find: emailBody()
    };
  }
  function post(P) {
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    return fetch(FORM_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(P), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json()['catch'](function () { return {}; }).then(function (j) { clearTimeout(to); if (!r.ok || (j && (j.ok === false || j.error || j.errors))) throw new Error(String(r.status)); return j; }); },
        function (x) { clearTimeout(to); throw new Error(x && x.name === 'AbortError' ? 'timeout' : 'network'); });
  }
  var sending = false, LASTSENT = null;
  function submit() {
    if (sending) return;
    var c = customer(), err = '';
    if (!FOUND) err = 'Press Find car first.';
    else if (!(c.first || c.last)) err = 'Add the customer\u2019s name.';
    else if (!c.phone && !c.email) err = 'Add a mobile or an email so the lead is usable.';
    $('deskSubmitErr').hidden = !err; $('deskSubmitErr').textContent = err;
    if (err) return;
    var P = payload(); window.fmbDeskDebug.payload = P;
    sending = true; $('deskSubmit').disabled = true; $('deskSubmit').textContent = 'Sending';
    track('fmb_desk_submit', { stock_x: TOT ? TOT.total : 0 });
    post(P).then(function () {
      sending = false; $('deskSubmit').textContent = 'Sent';
      LASTSENT = { name: c.first, phone: c.phone, summary: customerSummary() };
      $('deskFallback').hidden = true; $('deskDone').hidden = false;
      clearDraft();
      track('fmb_desk_sent', { stock_x: TOT ? TOT.total : 0 });
    }, function (x) {
      sending = false; $('deskSubmit').disabled = false; $('deskSubmit').textContent = 'Submit';
      $('deskFallback').hidden = false;
      $('deskMailto').href = 'mailto:' + DAN_EMAIL + '?subject=' + encodeURIComponent(P._subject) + '&body=' + encodeURIComponent(P.fact_find);
      track('fmb_desk_submit_error', { status: String(x && x.message || 'network') });
    });
  }
  function copyEmail() {
    var t = subject() + '\n\n' + emailBody();
    function done() { $('deskCopy').textContent = 'Copied'; track('fmb_desk_copy'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
    function fallback() { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove(); }
  }
  function customerSummary() {
    var L = ['Hi ' + (customer().first || 'there') + ', lovely to meet you today. Here is what we found together:', ''];
    if (RES && RES.list.length) {
      var t = RES.list[0], c = t.c;
      L.push((RES.level === 0 && RES.nStrict > 0) ? M.heroLine(A, TOT) : 'These are the closest to everything you told me.');
      L.push((c.year ? c.year + ' ' : '') + c.model + ', ' + c.price + ', ' + String(c.mileage || '').replace(/\u00a0/g, ' '));
      L.push('Why this one: ' + t.why);
      if (t.fin) L.push(FN.money2(t.fin.monthly) + ' a month. Representative example: ' + M.repText(t.fin));
      RES.list.slice(1, 3).forEach(function (r) { L.push('', 'Also worth a look: ' + (r.c.year ? r.c.year + ' ' : '') + r.c.model + ', ' + r.c.price + (r.fin ? '. ' + FN.money2(r.fin.monthly) + ' a month. Representative example: ' + M.repText(r.fin) : '')); });
    }
    if (NEWR && M.wantsNew(A)) {
      var all = NEWR.fit.concat(NEWR.reach);
      if (all.length) { L.push('', 'Brand new options:'); all.forEach(function (r) { L.push('Brand new ' + r.c.description + ', ' + (r.c.colour || '') + ', ' + (r.c.price || '') + '. Finance available, I\u2019ll send you a personalised quote.'); }); }
    }
    L.push('', 'Any questions, just message me here. Dan');
    return L.join('\n');
  }
  function waCustomer() {
    var s = LASTSENT || { phone: customer().phone, summary: customerSummary() };
    var d = String(s.phone || '').replace(/\D/g, '');
    if (d.indexOf('0') === 0) d = '44' + d.slice(1);
    this.href = 'https://wa.me/' + d + '?text=' + encodeURIComponent(s.summary);
    track('fmb_desk_whatsapp');
  }

  /* ---------- autosave and restore ---------- */
  var dirty = false, saveT = null, scrollT = null, saveGen = 0;
  function snapshot() {
    var f = {};
    [].forEach.call(document.querySelectorAll('#deskForm input[type=radio]:checked, #deskForm input[type=checkbox]:checked'), function (i) { (f[i.name] = f[i.name] || []).push(i.value); });
    TEXTS.concat(PERSONAL).forEach(function (id) { var e = $(id); if (e) f['#' + id] = e.value; });
    CHECKS.forEach(function (id) { var e = $(id); if (e) f['#' + id] = e.checked; });
    f['#pxFound'] = $('pxFound').hidden ? '' : $('pxFound').textContent;
    f['#pxEst'] = $('pxEst').hidden ? '' : $('pxEst').textContent;
    return { t: Date.now(), fields: f, found: FOUND, scroll: window.scrollY,
      matches: RES ? RES.list.slice(0, 3).map(function (r) { return r.c.reg; }) : [], lead: LEAD_ID };
  }
  /* Never write while the restore offer is waiting, or before the page has
     been opened past the gate: that would overwrite the saved customer with
     an empty form. */
  var pendingRestore = false;
  /* After Submit or New customer nothing is written until Dan types again,
     so a background refresh of the results cannot bring a sent customer back. */
  var justCleared = false;
  function save() {
    if (!restoreChecked || pendingRestore || justCleared) return;
    try { localStorage.setItem(DRAFT, JSON.stringify(snapshot())); dirty = false; } catch (e) {}
  }
  function saveSoon() {
    dirty = true; justCleared = false; var gen = ++saveGen; clearTimeout(saveT);
    saveT = setTimeout(function () { if (gen === saveGen) save(); }, 250);
  }
  function loadDraft() { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) { return null; } }
  function hasContent(d) { if (!d || !d.fields) return false; return Object.keys(d.fields).some(function (k) { var v = d.fields[k]; return Array.isArray(v) ? v.length : (v && v !== false); }); }
  function apply(d) {
    var f = d.fields || {};
    [].forEach.call(document.querySelectorAll('#deskForm input[type=radio], #deskForm input[type=checkbox]'), function (i) { i.checked = (f[i.name] || []).indexOf(i.value) !== -1; });
    TEXTS.concat(PERSONAL).forEach(function (id) { var e = $(id); if (e && f['#' + id] != null) e.value = f['#' + id]; });
    /* Drafts saved before 14 October: change cycle and term become the one
       "How long do you plan to keep it?" answer. */
    if (!(f.d_keepTerm || []).length && !f['#termOther']) {
      var old = termFromOld(f);
      if (old) {
        var chip = document.querySelector('input[name="d_keepTerm"][value="' + (old === 24 || old === 36 || old === 48 ? old : 'other') + '"]');
        if (chip) chip.checked = true;
        if (!(old === 24 || old === 36 || old === 48)) $('termOther').value = String(old);
      }
    }
    CHECKS.forEach(function (id) { var e = $(id); if (e) e.checked = !!f['#' + id]; });
    if (f['#pxFound']) { $('pxFound').hidden = false; $('pxFound').textContent = f['#pxFound']; }
    if (f['#pxEst']) { $('pxEst').hidden = false; $('pxEst').textContent = f['#pxEst']; }
    LEAD_ID = d.lead || null;
    budgetPanels(); equity(); paintDeposit(); paintFill(); actSummary(); paintWill();
    if (d.found) runFind(true);
    setTimeout(function () { window.scrollTo(0, d.scroll || 0); }, 60);
  }
  function clearDraft() { justCleared = true; saveGen++; clearTimeout(saveT); clearTimeout(scrollT); try { localStorage.removeItem(DRAFT); } catch (e) {} }
  function resetAll() {
    $('deskForm').reset();
    PERSONAL.concat(TEXTS).forEach(function (id) { var e = $(id); if (e) e.value = ''; }); CHECKS.forEach(function (id) { var e = $(id); if (e) e.checked = false; });
    $('deskResultNotes').hidden = true; $('deskProfileWrap').hidden = true; $('deskProfile').innerHTML = '';
    $('pxFound').hidden = true; $('pxFound').textContent = '';
    $('pxEst').hidden = true; $('pxEst').textContent = '';
    FOUND = false; RES = null; NEWR = null; LEAD_ID = null; LASTSENT = null;
    $('deskResult').hidden = true; $('deskResult').innerHTML = ''; closePresent(); $('deskEmpty').hidden = false; $('deskEmpty').textContent = 'Fill in what you know, in any order, then press Find car.';
    $('deskCustomer').hidden = true; $('deskDone').hidden = true; $('deskFallback').hidden = true; $('deskSubmitErr').hidden = true;
    $('deskSubmit').disabled = false; $('deskSubmit').textContent = 'Submit'; $('deskCopy').textContent = 'Copy email';
    budgetPanels(); paintDeposit(); paintFill(); actSummary(); paintWill();
    var f1 = secs()[0]; if (f1) openOnly(f1);
    clearDraft(); window.scrollTo(0, 0);
  }
  function budgetPanels() { var p = one('pay'); $('budMonthly').hidden = p !== 'monthly'; $('budCash').hidden = p !== 'cash'; }

  /* ---------- the folded sections ----------
     One open at a time, so the fact find is one screen rather than five.
     A folded section still has to say whether it has been answered, or
     folding it would hide the very thing Dan is checking, so each summary
     carries a count of the answers inside it. */
  function secs() { return [].slice.call(document.querySelectorAll('.desk-sec')); }
  function filledIn(sec) {
    var n = 0;
    [].forEach.call(sec.querySelectorAll('input[type=radio],input[type=checkbox]'), function (i) { if (i.checked) n++; });
    [].forEach.call(sec.querySelectorAll('input:not([type=radio]):not([type=checkbox]),textarea'), function (i) {
      if (String(i.value || '').trim()) n++;
    });
    return n;
  }
  function paintFill() {
    secs().forEach(function (sec) {
      var b = sec.querySelector('.desk-fill'); if (!b) return;
      var n = filledIn(sec);
      b.textContent = n ? n + ' answered' : 'empty';
      b.classList.toggle('on', n > 0);
    });
  }
  function openOnly(sec) {
    secs().forEach(function (s) { s.open = (s === sec); });
  }
  /* The header is sticky and wraps to two lines on a phone, so how far a
     step has to clear it is measured from the header rather than assumed.
     Same lesson as new-cars.html's filter sheet: a hard coded figure is
     wrong on exactly the screen it matters on. */
  function fitChrome() {
    var h = document.querySelector('.desk-top'), px = h ? h.getBoundingClientRect().height : 0;
    /* A zero means the header is not on screen yet (the gate is up), so the
       last good figure is kept rather than overwritten with nothing. It is
       measured again at the moment of every jump for the same reason. */
    if (px > 0) document.documentElement.style.setProperty('--desk-chrome', Math.round(px + 10) + 'px');
  }
  /* What the match is actually going to use, beside the button that runs it,
     so Dan can see at a glance whether it has enough to be worth pressing. */
  function actSummary() {
    var el = $('deskActSum'); if (!el) return;
    var bits = [], ms = vals('models'), tot = depositTotal(), p = one('pay');
    if (ms.length) bits.push('<b>' + esc(ms.length === 1 ? M.txt(FIELDS.models.opts, ms[0]) : ms.length + ' models') + '</b>');
    if (one('interest')) bits.push(esc(M.txt(INTEREST, one('interest'))));
    if (p === 'monthly') {
      var mo = num($('mo').value);
      bits.push(mo ? '<b>up to ' + esc(FN.money(mo)) + ' a month</b>' : 'monthly, no limit set');
    } else if (p === 'cash') {
      var ca = num($('cash').value);
      bits.push(ca ? '<b>up to ' + esc(FN.money(ca)) + ' cash</b>' : 'cash, no limit set');
    }
    bits.push(tot === null ? 'no deposit yet' : '<b>' + esc(FN.money(tot)) + '</b> deposit');
    el.innerHTML = bits.length ? bits.join(' &middot; ') : 'Fill in what you know, then press Find car.';
  }

  /* ---------- the staff gate: a layer, never a reload ---------- */
  var lastActive = Date.now(), restoreChecked = false;
  function unlocked() { try { var g = JSON.parse(sessionStorage.getItem(GATE) || 'null'); return g && Date.now() - g.t < IDLE_LOCK_MS; } catch (e) { return false; } }
  function markActive() { lastActive = Date.now(); try { if (sessionStorage.getItem(GATE)) sessionStorage.setItem(GATE, JSON.stringify({ t: Date.now() })); } catch (e) {} }
  function lock(reason) {
    save();
    try { sessionStorage.removeItem(GATE); } catch (e) {}
    $('deskLock').hidden = false; $('deskApp').hidden = true; $('deskApp').setAttribute('inert', ''); $('deskApp').setAttribute('aria-hidden', 'true');
    $('deskPin').value = ''; try { $('deskPin').focus(); } catch (e) {}
    track('fmb_desk_lock', { reason: reason || 'manual' });
  }
  function openApp() {
    $('deskLock').hidden = true; $('deskApp').hidden = false; $('deskApp').removeAttribute('inert'); $('deskApp').removeAttribute('aria-hidden');
    fitChrome();
    if (!restoreChecked) {
      restoreChecked = true;
      var d = loadDraft();
      if (hasContent(d)) {
        var t = new Date(d.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        var day = new Date(d.t).toDateString() === new Date().toDateString() ? 'today' : new Date(d.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
        $('deskRestoreP').textContent = 'You have a fact find in progress, last saved ' + day + ' at ' + t + '. Carry on with this customer?';
        $('deskRestore').hidden = false; pendingRestore = true;
        $('deskCarry').onclick = function () { pendingRestore = false; apply(d); $('deskRestore').hidden = true; track('fmb_desk_restore', { choice: 'carry_on' }); };
        $('deskFresh').onclick = function () { pendingRestore = false; resetAll(); $('deskRestore').hidden = true; track('fmb_desk_restore', { choice: 'new' }); };
      }
      track('fmb_desk_open', { restored_offer: hasContent(d) ? 'yes' : 'no' });
    }
  }
  function wireGate() {
    $('deskLockForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('deskPin').value;
      window.dsGate.check('admin', v).then(function (ok) {
        if (ok) { try { sessionStorage.setItem(GATE, JSON.stringify({ t: Date.now() })); } catch (x) {} $('deskLockErr').hidden = true; openApp(); }
        else { $('deskLockErr').hidden = false; $('deskLockErr').textContent = 'That password did not work. Try again.'; $('deskPin').value = ''; }
      });
    });
    $('deskLockBtn').addEventListener('click', function () { lock('manual'); });
    setInterval(function () { if (!$('deskLock').hidden) return; if (Date.now() - lastActive > IDLE_LOCK_MS) lock('idle'); }, 30000);
    ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, markActive, { passive: true }); });
  }

  /* ---------- wiring ---------- */
  function wire() {
    var form = $('deskForm');
    /* a second tap on a chosen radio clears it: nothing is forced at the desk */
    var wasOn = null;
    form.addEventListener('pointerdown', function (e) {
      var lab = e.target.closest && e.target.closest('label.chip'); if (!lab) { wasOn = null; return; }
      var i = lab.querySelector('input'); wasOn = i && i.type === 'radio' && i.checked ? i : null;
    });
    form.addEventListener('click', function (e) {
      var i = e.target; if (!i || i.tagName !== 'INPUT' || i.type !== 'radio') return;
      if (wasOn === i) { i.checked = false; wasOn = null; form.dispatchEvent(new Event('change')); }
    });
    form.addEventListener('change', function () { budgetPanels(); equity(); paintDeposit(); paintFill(); if (FOUND) runFind(true); saveSoon(); });
    form.addEventListener('input', function (e) {
      if (/^px(Siv|Settle|Val)$/.test(e.target.id)) equity();
      /* The deposit is the PX equity plus the cash, so it has to repaint when
         any of the three moves, not only when the deposit box itself does. */
      if (/^(dep|pxSettle|pxVal)$/.test(e.target.id)) paintDeposit();
      if (e.target.id === 'pxReg') e.target.value = e.target.value.toUpperCase();
      if (/^(pxReg|curCar)$/.test(e.target.id)) paintWill();
      paintFill(); actSummary(); saveSoon();
      if (FOUND && /^(mo|dep|cash|pxSettle|pxVal)$/.test(e.target.id)) { clearTimeout(form._t); form._t = setTimeout(function () { runFind(true); }, 400); }
    });
    /* One step open at a time. Opening is the deliberate act, so only an
       open fires it; folding one by hand leaves the rest alone. */
    form.addEventListener('toggle', function (e) {
      var sec = e.target;
      if (!sec.classList || !sec.classList.contains('desk-sec') || !sec.open) return;
      secs().forEach(function (s) { if (s !== sec) s.open = false; });
    }, true);
    $('deskCustomer').addEventListener('input', saveSoon);
    $('deskCustomer').addEventListener('change', saveSoon);
    $('deskFind').addEventListener('click', function () { runFind(false); });
    $('deskSide').addEventListener('click', function (e) { if (e.target.id === 'deskShow') showCustomer(); if (e.target.id === 'deskPresentBtn') openPresent(); });
    $('dpClose').addEventListener('click', closePresent);
    $('dpPrev').addEventListener('click', function () { PIDX -= 1; paintPresent(); });
    $('dpNext').addEventListener('click', function () { PIDX += 1; paintPresent(); });
    $('dpStage').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.dp-thumbs button'); if (!b) return;
      var img = $('dpImg'); if (img) img.src = b.getAttribute('data-src');
      [].forEach.call(b.parentNode.children, function (x) { x.classList.toggle('on', x === b); });
    });
    var swipeX = null;
    $('deskPresent').addEventListener('touchstart', function (e) { swipeX = e.touches && e.touches[0] ? e.touches[0].clientX : null; }, { passive: true });
    $('deskPresent').addEventListener('touchend', function (e) {
      if (swipeX == null || !e.changedTouches) return;
      var dx = e.changedTouches[0].clientX - swipeX; swipeX = null;
      if (dx < -50) { PIDX += 1; paintPresent(); }
      else if (dx > 50) { PIDX -= 1; paintPresent(); }
    }, { passive: true });
    document.addEventListener('keydown', presentKey);
    document.addEventListener('fullscreenchange', function () {
      var box = $('deskPresent');
      if (!document.fullscreenElement && box && !box.hidden && box.dataset.wantFs === '1') { /* overlay stays if fullscreen was refused or exited */ }
    });
    $('deskViewClose').addEventListener('click', function () { $('deskView').hidden = true; });

    /* The two overlays. A result card and a customer view card both open
       the same car view; the presentation hands it its own slide list, so
       Next and Previous walk the cars that are actually on screen. */
    cardTaps($('deskResult'), false, function () { return VIEWCARS; });
    cardTaps($('deskViewBody'), true, function () { return VIEWCARS; });
    $('dpStage').addEventListener('click', function (e) {
      if (e.target.closest('.aos-bar, .aos-stage, a, button, input, label, summary')) return;
      if (!PSLIDES.length) return;
      openCar(PSLIDES, PIDX, true);
    });
    $('dcClose').addEventListener('click', closeCar);
    $('dcPrev').addEventListener('click', function () { if (CIDX > 0) { CIDX -= 1; paintCar(); } });
    $('dcNext').addEventListener('click', function () { if (CIDX < CARS.length - 1) { CIDX += 1; paintCar(); } });
    $('dcBody').addEventListener('click', function (e) {
      var t = e.target.closest('[data-shot]');
      var area = $('dcBody').querySelector('.dc-photo');
      if (t) {
        /* A thumbnail swaps the photograph, and puts the 360 away first the
           way every other page that carries one does. */
        var k = parseInt(t.getAttribute('data-shot'), 10), pics = presentPics(CARS[CIDX].r.c);
        if (window.aosMedia && area) window.aosMedia.leave(area);
        clearInterval(SPINT);
        var img = $('dcImg'); if (img) img.src = pics[k] || '';
        [].forEach.call($('dcBody').querySelectorAll('[data-shot]'), function (b) { b.classList.toggle('on', b === t); });
        return;
      }
      if (e.target.closest('.aos-bar, .aos-stage, a, button, summary')) return;
      if (e.target.id === 'dcImg') {
        var p = presentPics(CARS[CIDX].r.c);
        var at = p.indexOf($('dcImg').getAttribute('src'));
        openShot(p, at < 0 ? 0 : at, CARS[CIDX], CARCUST);
      }
    });
    $('dshClose').addEventListener('click', closeShot);
    $('deskShot').addEventListener('click', function (e) { if (e.target.id === 'deskShot' || e.target.classList.contains('dsh-in')) closeShot(); });
    $('dshPrev').addEventListener('click', function () { SHOT.i = (SHOT.i - 1 + SHOT.pics.length) % SHOT.pics.length; paintShot(); });
    $('dshNext').addEventListener('click', function () { SHOT.i = (SHOT.i + 1) % SHOT.pics.length; paintShot(); });
    $('dshFull').addEventListener('click', function () {
      var slide = SHOT.slide, cust = SHOT.cust; closeShot();
      if (slide) openCar([slide], 0, cust);
    });
    document.addEventListener('keydown', function (e) {
      if (!$('deskShot').hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeShot(); }
        else if (e.key === 'ArrowRight') { SHOT.i = (SHOT.i + 1) % SHOT.pics.length; paintShot(); }
        else if (e.key === 'ArrowLeft') { SHOT.i = (SHOT.i - 1 + SHOT.pics.length) % SHOT.pics.length; paintShot(); }
        return;
      }
      if ($('deskCar').hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeCar(); }
      else if (e.key === 'ArrowRight' && CIDX < CARS.length - 1) { CIDX += 1; paintCar(); }
      else if (e.key === 'ArrowLeft' && CIDX > 0) { CIDX -= 1; paintCar(); }
    });
    $('deskSubmit').addEventListener('click', submit);
    $('deskRetry').addEventListener('click', submit);
    $('deskCopy').addEventListener('click', copyEmail);
    $('deskMailto').addEventListener('click', function () { track('fmb_desk_mailto'); });
    $('deskWa').addEventListener('click', waCustomer);
    $('deskNew').addEventListener('click', function () {
      if (!window.confirm('Clear this customer and start fresh?')) return;
      resetAll(); track('fmb_desk_new_customer');
    });
    $('pxLookup').addEventListener('click', lookupReg);
    /* Same pattern as the public forms: look the reg up by itself once it is typed. */
    var pxAuto = '';
    $('pxReg').addEventListener('blur', function () { var r = this.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); if (r.length >= 2 && /[A-Z]/.test(r) && /\d/.test(r) && r !== pxAuto) { pxAuto = r; lookupReg(); } });
    $('pxWill').addEventListener('click', askWill);
    $('deskProfileBtn').addEventListener('click', openProfile);
    /* Print sits in the action bar as well, because the customer
       requirements document is a thing Dan prints at the desk, not only
       something to look at after a car has been found. */
    $('deskPrintBtn').addEventListener('click', openProfile);
    $('dep').addEventListener('input', function () { if (depTyped()) { $('depNeed').hidden = true; $('deskDep').classList.remove('need'); } });
    $('deskProfileBtn2').addEventListener('click', openProfile);
    $('deskProfileClose').addEventListener('click', function () { $('deskProfileWrap').hidden = true; });
    $('deskPrint').addEventListener('click', function () { buildProfile(); track('fmb_desk_print'); window.print(); });
    window.addEventListener('beforeprint', function () { if (FOUND && $('deskLock').hidden) { buildProfile(); $('deskProfileWrap').hidden = false; } });
    $('deskResultNotes').addEventListener('input', saveSoon);
    setInterval(function () { if ($('deskLock').hidden) save(); }, 15000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') save(); });
    window.addEventListener('pagehide', save);
    window.addEventListener('scroll', function () { var gen = saveGen; clearTimeout(scrollT); scrollT = setTimeout(function () { if (gen === saveGen) save(); }, 500); }, { passive: true });
  }

  /* ---------- Present this car: a full screen for the customer ---------- */
  var PIDX = 0, PSLIDES = [];
  var BOOK = 'https://cal.com/danbmwruxley/bmw-ruxley-appointment-with-dan-in-sales';
  function clipWords(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').replace(/[.\s]+$/g, '').trim();
    if (s.length <= n) return s;
    return s.slice(0, n).replace(/\s+\S*$/, '');
  }
  function presentSlides() {
    var out = [];
    if (RES) RES.list.slice(0, 3).forEach(function (r, i) { out.push({ kind: 'used', role: i === 0 ? 'top' : 'alt', r: r }); });
    if (NEWR && M.wantsNew(A)) NEWR.fit.concat(NEWR.reach).slice(0, 3).forEach(function (r) { out.push({ kind: 'new', role: 'new', r: r }); });
    return out;
  }
  function whyFor(slide) {
    var line = slide.kind === 'new' ? M.newWhy(slide.r.c, A) : (slide.r.why || '');
    return line ? [line.replace(/\.+$/, '.') ] : [];
  }
  function presentPics(c) {
    var det = M.data().det || {};
    var p = [];
    try { p = FN.photos(c, det[c.id]) || []; } catch (e) { p = []; }
    if (!p.length && c.image) p = [c.image];
    return p.slice(0, 6);
  }
  function slideHtml(slide, i, n) {
    var c = slide.kind === 'new' ? slide.r.c : slide.r.c;
    var pics = presentPics(c);
    var name = slide.kind === 'new' ? c.description : ((c.year ? c.year + ' ' : '') + M.modelName(c));
    var spec = slide.kind === 'new'
      ? [c.colour, c.fuel, M.newWhen(c)].filter(Boolean).join(', ')
      : [c.colour, String(c.mileage || '').replace(/\u00a0/g, ' '), c._home ? 'Here at Ruxley' : 'I can bring this one in'].filter(Boolean).join(', ');
    var kicker = slide.role === 'top' ? 'The one for you' : (slide.role === 'alt' ? 'Also worth a look' : 'Brand new');
    var h = '';
    if (i === 0) h = '<p class="dp-hero">Based on everything you\u2019ve told me, out of the ' + (TOT ? TOT.total : '') + ' cars in our stock, I believe this is the one for you.</p>';
    var photo = '<div class="dp-photo"' + (slide.kind === 'used' && c.reg ? ' data-aos-reg="' + esc(c.reg) + '" data-aos-src="' + (c._home ? 'forecourt' : 'group') + '"' : '') + '>'
      + (pics[0] ? '<img id="dpImg" src="' + esc(pics[0]) + '" alt=""/>' : '<div class="dp-nophoto">Photo coming</div>')
      + (pics.length > 1 ? '<div class="dp-thumbs">' + pics.map(function (u, k) { return '<button type="button" data-src="' + esc(u) + '"' + (k === 0 ? ' class="on"' : '') + '><img src="' + esc(u) + '" alt=""/></button>'; }).join('') + '</div>' : '')
      + '</div>';
    var price = '<p class="dp-price">' + esc(c.price || 'Price on request') + '</p>';
    var fin = '';
    if (slide.kind === 'used') {
      var f = slide.r.fin;
      fin = f ? '<p class="dp-fin">' + esc(FN.money2(f.monthly)) + ' a month. Representative example: ' + esc(M.repText(f)) + '</p>'
        : '<p class="dp-fin">Ask me for a quote on this one.</p>';
    } else {
      fin = '<p class="dp-fin">Finance available. I\u2019ll put together a personalised quote.</p>';
    }
    var whys = whyFor(slide).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    return '<article class="dp-slide">' + photo + '<div class="dp-copy"><p class="dp-kicker">' + esc(kicker) + '</p>' + h
      + '<h2 class="dp-name">' + esc(name) + '</h2><p class="dp-spec">' + esc(spec) + '</p>' + price + fin + protectHtml(slide.r, true, 'dp-protect')
      + '<h3>Why this one for you</h3><ul class="dp-why">' + whys + '</ul></div></article>';
  }
  /* ---------- one car, full page, and a photograph, enlarged ----------
     Dan, 10 October: a used car photograph should enlarge, and a car in the
     presentation should open full page with the 360 and the information
     under it, price included. Both overlays read the same slide shape the
     deck uses, so there is one description of a car on this page rather
     than three. */
  var CARS = [], CIDX = 0, CARCUST = false, SPINT = null;
  var SHOT = { pics: [], i: 0, slide: null, cust: false };

  function carFacts(slide) {
    var c = slide.r.c;
    if (slide.kind === 'new') return [c.colour, c.fuel, c.transmission, M.newWhen(c), c.order_number ? 'Order ' + c.order_number : ''].filter(Boolean);
    return [c.reg, c.year ? String(c.year) : '', String(c.mileage || '').replace(/\u00a0/g, ' '), c.colour, c.fuel,
      c.seats ? c.seats + ' seats' : '', c._home ? 'Here at Ruxley' : 'In the group, I can bring it in'].filter(Boolean);
  }
  function carName(slide) {
    var c = slide.r.c;
    return slide.kind === 'new' ? 'Brand new ' + c.description : ((c.year ? c.year + ' ' : '') + M.modelName(c));
  }
  function carFinHtml(slide, forCustomer) {
    if (slide.kind === 'new') return '<p class="dc-fin">Finance available. I\u2019ll put together a personalised quote.</p>';
    var f = slide.r.fin;
    /* A monthly figure never appears without the whole representative
       example beside it, here as everywhere else on this site. */
    return f ? '<p class="dc-fin"><b>' + esc(FN.money2(f.monthly)) + ' a month</b><span>Representative example: ' + esc(M.repText(f)) + '</span></p>'
      : '<p class="dc-fin">' + (forCustomer ? 'Ask me for a quote on this one.' : 'No lender quote at this deposit. Ask for a quote.') + '</p>';
  }
  function carKit(slide) {
    if (slide.kind === 'new') {
      var l = (slide.r.c.options || []).concat(slide.r.c.packages || []).concat(slide.r.c.standard || []);
      return l.filter(Boolean);
    }
    var det = (M.data().det || {})[slide.r.c.id] || {};
    return (det.equipment || []).filter(Boolean);
  }
  function carHtml(slide, forCustomer) {
    var c = slide.r.c, pics = presentPics(c), kit = carKit(slide);
    var kicker = slide.role === 'top' ? 'The one for you' : (slide.role === 'alt' ? 'Also worth a look' : 'Brand new');
    var aos = slide.kind === 'used' && c.reg ? ' data-aos-reg="' + esc(c.reg) + '" data-aos-src="' + (c._home ? 'forecourt' : 'group') + '"' : '';
    var h = '<div class="dc-photo"' + aos + '>'
      + (pics[0] ? '<img id="dcImg" src="' + esc(pics[0]) + '" alt=""/>' : '<div class="dc-nophoto">Photo coming</div>')
      + (pics.length > 1 ? '<div class="dc-thumbs">' + pics.map(function (u, k) {
          return '<button type="button" data-shot="' + k + '"' + (k === 0 ? ' class="on"' : '') + '><img src="' + esc(u) + '" alt=""/></button>'; }).join('') + '</div>' : '')
      + '</div>';
    h += '<div class="dc-info"><p class="dc-kicker">' + esc(kicker) + (slide.role === 'reach' && !forCustomer ? ', ' + slide.r.pct.toFixed(1) + '% over budget' : '') + '</p>'
      + '<h2>' + esc(carName(slide)) + '</h2>'
      + '<p class="dc-price">' + esc(c.price || 'Price on request') + '</p>'
      + '<p class="dc-facts">' + esc(carFacts(slide).join(' \u00b7 ')) + '</p>'
      + carFinHtml(slide, forCustomer) + protectHtml(slide.r, forCustomer);
    var why = slide.kind === 'new' ? M.newWhy(c, A || answers()) : slide.r.why;
    if (why) h += '<p class="dc-why"><b>Why this one for you:</b> ' + esc(String(why).replace(/\.+$/, '.')) + '</p>';
    if (!forCustomer && slide.r.miss && slide.r.miss.length) h += '<p class="desk-note">Misses: ' + esc(slide.r.miss.join(', ')) + '</p>';
    if (kit.length) h += '<details class="dc-kit"><summary>Specification (' + kit.length + ')</summary><ul>'
      + kit.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>';
    if (!forCustomer && c.url) h += '<p class="dc-link"><a href="' + esc(c.url) + '" target="_blank" rel="noopener">Open the listing</a></p>';
    return h + '</div>';
  }
  /* A car with a spin should be turning when the page opens, which is what
     Dan asked for. aos-media decides whether there is one, and that answer
     arrives whenever the CDN gets round to it, so this waits for the button
     to appear rather than assuming a time. A car with no spin keeps its
     photographs and nothing happens. */
  function autoSpin(area) {
    clearInterval(SPINT);
    var n = 0;
    SPINT = setInterval(function () {
      if (!area || !document.body.contains(area) || $('deskCar').hidden) { clearInterval(SPINT); return; }
      var b = area.querySelector('button.aos-b[data-aos="spin"]');
      if (b) { clearInterval(SPINT); b.click(); return; }
      if (++n > 45) clearInterval(SPINT);
    }, 500);
  }
  function paintCar() {
    var slide = CARS[CIDX]; if (!slide) return;
    $('dcBody').innerHTML = carHtml(slide, CARCUST);
    $('dcBody').scrollTop = 0;
    $('dcCount').textContent = CARS.length > 1 ? (CIDX + 1) + ' of ' + CARS.length : '';
    $('dcPrev').disabled = CIDX === 0;
    $('dcNext').disabled = CIDX === CARS.length - 1;
    $('dcPrev').hidden = $('dcNext').hidden = CARS.length < 2;
    var area = $('dcBody').querySelector('.dc-photo');
    if (window.aosMedia && area) { window.aosMedia.scan($('dcBody')); autoSpin(area); }
  }
  function openCar(list, i, forCustomer) {
    if (!list || !list.length) return;
    CARS = list; CIDX = Math.max(0, Math.min(i || 0, list.length - 1)); CARCUST = !!forCustomer;
    $('deskCar').hidden = false;
    document.body.classList.add('dc-open');
    paintCar();
    $('dcClose').focus();
    track('fmb_desk_car_view', { kind: CARS[CIDX].kind, customer: forCustomer ? 'yes' : 'no' });
  }
  function closeCar() {
    clearInterval(SPINT);
    $('deskCar').hidden = true; $('dcBody').innerHTML = '';
    if ($('deskShot').hidden) document.body.classList.remove('dc-open');
  }
  function paintShot() {
    $('dshImg').src = SHOT.pics[SHOT.i] || '';
    $('dshCap').textContent = (SHOT.slide ? carName(SHOT.slide) + ', ' : '') + (SHOT.i + 1) + ' of ' + SHOT.pics.length;
    $('dshPrev').hidden = $('dshNext').hidden = SHOT.pics.length < 2;
    $('dshFull').hidden = !SHOT.slide;
  }
  function openShot(pics, i, slide, forCustomer) {
    if (!pics || !pics.length) return;
    SHOT = { pics: pics, i: Math.max(0, Math.min(i || 0, pics.length - 1)), slide: slide || null, cust: !!forCustomer };
    $('deskShot').hidden = false;
    document.body.classList.add('dc-open');
    paintShot();
    $('dshClose').focus();
    track('fmb_desk_photo', { customer: forCustomer ? 'yes' : 'no' });
  }
  function closeShot() {
    $('deskShot').hidden = true; $('dshImg').removeAttribute('src');
    if ($('deskCar').hidden) document.body.classList.remove('dc-open');
  }
  /* What a tap means, in one place: a photograph enlarges, anything else on
     a card opens that car full page. Controls aos-media or the page itself
     put on the card are left alone. */
  function cardTaps(root, forCustomer, listFor) {
    root.addEventListener('click', function (e) {
      if (e.target.closest('.aos-bar, .aos-stage, a, button, input, textarea, select, label, summary, details')) return;
      var card = e.target.closest('[data-car]'); if (!card) return;
      var list = listFor(), idx = parseInt(card.getAttribute('data-car'), 10);
      var slide = list[idx]; if (!slide) return;
      if (e.target.closest('.fmb-ph')) {
        var pics = presentPics(slide.r.c);
        if (pics.length) { openShot(pics, 0, slide, forCustomer); return; }
      }
      openCar(list, idx, forCustomer);
    });
  }

  function paintPresent() {
    var n = PSLIDES.length;
    if (!n) return;
    if (PIDX < 0) PIDX = 0;
    if (PIDX > n - 1) PIDX = n - 1;
    $('dpStage').innerHTML = slideHtml(PSLIDES[PIDX], PIDX, n);
    $('dpCount').textContent = (PIDX + 1) + ' of ' + n;
    $('dpPrev').disabled = PIDX === 0;
    $('dpNext').disabled = PIDX === n - 1;
    $('dpEnd').hidden = PIDX !== n - 1;
    var phone = String($('cPhone').value || '').replace(/\D/g, '');
    if (phone.indexOf('0') === 0) phone = '44' + phone.slice(1);
    $('dpWa').href = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(presentText());
    if (window.aosMedia) window.aosMedia.scan($('dpStage'));
  }
  function presentText() {
    var s = PSLIDES[0]; if (!s) return '';
    var c = s.r.c;
    var name = s.kind === 'new' ? c.description : ((c.year ? c.year + ' ' : '') + M.modelName(c));
    var L = ['Hi, it\u2019s Dan at Hedin BMW Ruxley.', '', 'Based on everything you\u2019ve told me, out of the ' + (TOT ? TOT.total : '') + ' cars in our stock, I believe this is the one for you.', '', name + ', ' + (c.price || '')];
    if (s.kind === 'used' && s.r.fin) L.push(FN.money2(s.r.fin.monthly) + ' a month. Representative example: ' + M.repText(s.r.fin));
    else L.push('Finance available. I\u2019ll put together a personalised quote.');
    whyFor(s).forEach(function (t) { L.push(t); });
    L.push('', 'Any questions, just message me here.');
    return L.join('\n');
  }
  function openPresent() {
    if (!RES || !RES.list.length) return;
    PSLIDES = presentSlides(); PIDX = 0;
    var box = $('deskPresent');
    box.hidden = false;
    paintPresent();
    var req = box.requestFullscreen || box.webkitRequestFullscreen;
    if (req) { try { var p = req.call(box); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    track('fmb_desk_present');
  }
  function closePresent() {
    var box = $('deskPresent');
    if (!box || box.hidden) return;
    box.hidden = true;
    if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) {} }
    if (window.aosMedia) window.aosMedia.leave && $('dpStage') && [].forEach.call($('dpStage').querySelectorAll('[data-aos-reg]'), function (a) { window.aosMedia.leave(a); });
  }
  function presentKey(e) {
    var box = $('deskPresent');
    if (!box || box.hidden) return;
    /* The car view and the enlarged photograph sit on top of the deck and
       answer for themselves, so the deck does not also step a car or close
       itself underneath them. */
    if (!$('deskCar').hidden || !$('deskShot').hidden) return;
    if (e.key === 'Escape') {
      if ($('dpStage').querySelector('.aos-stage')) return;
      e.preventDefault(); closePresent();
    } else if (e.key === 'ArrowRight') { e.preventDefault(); PIDX += 1; paintPresent(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); PIDX -= 1; paintPresent(); }
  }

  function showCustomer() {
    $('deskViewBody').innerHTML = resultHtml(true);
    $('deskView').hidden = false;
    if (window.aosMedia) window.aosMedia.scan($('deskViewBody'));
    track('fmb_desk_customer_view');
  }
  function lookupReg() {
    var reg = $('pxReg').value.replace(/\s/g, '').toUpperCase(); if (!reg) return;
    $('pxFound').hidden = false; $('pxFound').textContent = 'Looking up ' + reg + '\u2026';
    fetch(WORKER + '?target=vehicle-lookup&reg=' + encodeURIComponent(reg)).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || d.error) throw new Error('nf');
      var mot = (d.motHistory || [])[0];
      $('pxFound').textContent = [d.yearOfManufacture, d.make, d.model, d.colour, d.fuelType].filter(Boolean).join(' ') + ' (from reg lookup)' + (mot && mot.mileage ? '. Last MOT ' + mot.mileage : '');
      /* Mileage today estimated from the MOT history (px-lookup.js); Dan sees the working. */
      var est = window.dsPxLookup ? window.dsPxLookup.estimate(d) : null;
      $('pxEst').hidden = !est; $('pxEst').textContent = est ? 'Mileage estimate: ' + est.working : '';
      if (est && !$('pxMiles').value) $('pxMiles').value = String(est.miles);
      else if (!est && mot && mot.odo && !$('pxMiles').value) $('pxMiles').value = String(mot.odo);
      /* The lookup knows the car, so Dan does not type it again. His own
         words win if he has already put something in the box. */
      if (!$('curCar').value && (d.make || d.model)) $('curCar').value = [d.yearOfManufacture, d.make, d.model].filter(Boolean).join(' ');
      paintFill(); paintWill();
      saveSoon(); track('fmb_desk_px_lookup', { ok: 'yes' });
    })['catch'](function () { $('pxFound').textContent = 'Could not look that reg up. Carry on and add the details by hand.'; track('fmb_desk_px_lookup', { ok: 'no' }); });
  }

  function start() {
    build(); wire(); wireGate(); budgetPanels();
    /* Open on step 1 rather than all seven. */
    var first = secs()[0]; if (first) openOnly(first);
    paintDeposit(); paintFill(); actSummary(); fitChrome(); paintWill();
    window.addEventListener('resize', fitChrome, { passive: true });
    if (unlocked()) openApp(); else lock('start');
  }
  window.fmbDeskDebug = {
    payload: null, answers: function () { return answers(); }, customerHtml: function () { return resultHtml(true); }, profileHtml: function () { return profileHtml(); }, result: function () { return { used: RES, neu: NEWR, totals: TOT }; },
    emailBody: function () { return emailBody(); }, buildProfile: function (o) { return buildProfile(o); }, openProfile: function () { openProfile(); }, subject: function () { return subject(); }, lock: function () { lock('test'); }, presentText: function () { return presentText(); },
    ready: function () { return pData; }, draft: function () { return loadDraft(); }, summary: function () { return customerSummary(); }, fitChrome: function () { return fitChrome(); }, willHref: function () { return willHref(); }, willMail: function () { return willMail(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
