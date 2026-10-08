/* Desk mode: Dan's own fact find for a customer sitting with him.
 *
 * Order (Dan, 8 October): the fact find holds no personal details. Find car
 * shows the recommendation, the "out of X" line, alternatives and brand new
 * options (with a Within reach tier up to fmbMatch.NEW_STRETCH over budget).
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
  var SERVICE = ['Full BMW', 'Full independent', 'Partial', 'None', 'Not sure'];
  var PXFIN = ['Yes', 'No', 'Not sure'];
  var COND = ['Excellent', 'Good', 'Some marks and wear', 'Needs some work'];
  var KEYS = ['1', '2', 'More than 2'];
  var PAY = [{ v: 'monthly', t: 'Monthly' }, { v: 'cash', t: 'Cash price' }, { v: 'notsure', t: 'Not sure yet' }];
  var INTEREST = [{ v: 'new', t: 'Brand new' }, { v: 'used', t: 'Approved used' }, { v: 'either', t: 'Either' }];
  var FIELDS = {
    models: { multi: true, opts: M.MODELS.map(function (m) { return { v: m.v, t: m.t }; }).concat([{ v: 'open', t: 'Open to ideas' }]) },
    who: { opts: M.WHO }, life: { opts: M.LIFE }, miles: { opts: M.MILES }, people: { opts: M.PEOPLE },
    boot: { opts: M.BOOT }, charge: { opts: M.CHARGE },
    service: { opts: SERVICE.map(function (x) { return { v: x, t: x }; }) },
    pxfin: { opts: PXFIN.map(function (x) { return { v: x, t: x }; }) },
    cond: { opts: COND.map(function (x) { return { v: x, t: x }; }) },
    keys: { opts: KEYS.map(function (x) { return { v: x, t: x }; }) },
    pay: { opts: PAY }, when: { opts: M.WHEN }, interest: { opts: INTEREST },
    body: { multi: true, opts: M.BODY }, fuel: { multi: true, opts: M.FUEL },
    mustF: { multi: true, opts: M.EXTRAS.map(function (k) { return { v: k, t: k === 'seven' ? '7 seats' : ST.FEATURES[k].label }; }) },
    wouldF: { multi: true, opts: M.EXTRAS.map(function (k) { return { v: k, t: k === 'seven' ? '7 seats' : ST.FEATURES[k].label }; }) },
    colours: { multi: true, opts: M.COLOURS.map(function (c) { return { v: c, t: c }; }) },
    curFuel: { multi: true, opts: [{ v: 'petrol', t: 'Petrol' }, { v: 'diesel', t: 'Diesel' }, { v: 'hybrid', t: 'Hybrid' }] },
    gear: { opts: [{ v: 'auto', t: 'Auto' }, { v: 'manual', t: 'Manual' }] },
    pxyn: { opts: [{ v: 'yes', t: 'Yes' }, { v: 'no', t: 'No' }] },
    fundMethod: { multi: true, opts: [{ v: 'pcp', t: 'BMW Select / PCP' }, { v: 'hp', t: 'HP' }, { v: 'other', t: 'Other' }, { v: 'savings', t: 'Savings' }, { v: 'loan', t: 'Loan' }, { v: 'motability', t: 'Motability' }] },
    said: { opts: [{ v: 'yes', t: 'Yes' }, { v: 'no', t: 'No' }] },
    introBM: { opts: [{ v: 'yes', t: 'Yes' }, { v: 'no', t: 'No' }] }
  };
  var TEXTS = ['pxReg', 'pxMiles', 'pxSettle', 'pxSiv', 'pxVal', 'pxNotes', 'curCar', 'likeModel', 'important',
    'mustText', 'wouldText', 'notes', 'curMonthly', 'changeCycle', 'annualMiles', 'moFrom', 'mo', 'depFrom', 'dep', 'term', 'cash',
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
      curFuel:["How has the fuel worked out for the miles you do?"],
      gear:["Do you enjoy changing gear, or would you rather not think about it?"],
      pxyn:["What are you hoping to do with the car you've got?"],
      pxReg:["What's the registration, so I can see what you're in?"],
      pxMiles:["Roughly how many miles has it done?"],
      service:["How has it been looked after?"],
      pxfin:["Is there any finance left on it?"],
      pxVal:["What sort of figure were you hoping your car would be worth?"],
      pxSiv:["If we stand your car in, what were you thinking it might be worth?"],
      pxSettle:["Roughly what's left to settle, if you know?"],
      cond:["How would you describe it to a friend?"],
      keys:["How many keys have you still got?"],
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
      changeCycle:["How long do you usually keep a car?"],
      annualMiles:["Roughly how many miles do you cover in a year?"],
      pay:["How do you like to think about the money, monthly or as a total?"],
      moFrom:["What monthly figure would feel comfortable?"],
      mo:["And what's the most you'd want it to be?"],
      depFrom:["What could you comfortably put down?"],
      dep:["And what's the most you'd want to put down?"],
      term:["How long would you want the agreement to run?"],
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
    ['likeModel','important','curCar','pxReg','pxMiles','pxVal','pxSiv','pxSettle','mustText','wouldText','notes','curMonthly','changeCycle','annualMiles','moFrom','mo','depFrom','dep','term','cash','cFirst','nsDriveWhen','nsFollow'].forEach(function(id){var e=$(id); if(e&&e.parentElement)addTip(e.parentElement,TIPS[id]||TIPS[id.replace('When','')]);});
    ['nsDrive','nsVal'].forEach(function(id){var e=$(id); if(e)addTip(e.parentElement,TIPS[id]);});
    document.addEventListener('click',function(ev){
      var btn=ev.target.closest&&ev.target.closest('.qtip>button');
      document.querySelectorAll('.qtip.open').forEach(function(el){if(!btn||el!==btn.parentNode)el.classList.remove('open');});
      if(btn&&window.matchMedia('(hover: none)').matches){btn.parentNode.classList.toggle('open'); ev.preventDefault();}
    });

    var secs = [].slice.call(document.querySelectorAll('.desk-sec'));
    $('deskJump').innerHTML = secs.map(function (sec) { var h = sec.querySelector('h2, h3').cloneNode(true); var q=h.querySelector('.qtip'); if(q) q.remove(); return '<a href="#' + sec.id + '">' + esc(h.textContent.trim()) + '</a>'; }).join('');
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
    var siv = num($('pxSiv').value), set = num($('pxSettle').value), el = $('pxEquity');
    if (siv === null && set === null) { el.hidden = true; return null; }
    var e = (siv || 0) - (set || 0);
    el.hidden = false; el.textContent = 'Equity: ' + FN.money(e) + (e < 0 ? ' (negative equity)' : '');
    return e;
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
    if (a.pay === 'monthly') { a.mo = num($('mo').value) || 0; a.dep = num($('dep').value); }
    if (a.pay === 'cash') a.cash = num($('cash').value) || 0;
    var am = num($('annualMiles').value);
    if (am) a.miles = am < 6000 ? 'u6' : am < 10000 ? '6to10' : am < 15000 ? '10to15' : '15plus';
    return a;
  }
  function pxInfo() {
    return { reg: $('pxReg').value.toUpperCase().replace(/[^A-Z0-9]/g, ''), found: $('pxFound').hidden ? '' : $('pxFound').textContent,
      car: $('curCar').value.trim(), fuel: vals('curFuel'), gear: one('gear'), yn: one('pxyn'),
      miles: num($('pxMiles').value), service: one('service'), fin: one('pxfin'),
      px: num($('pxVal').value), siv: num($('pxSiv').value), settle: num($('pxSettle').value), equity: equity(),
      cond: one('cond'), notes: $('pxNotes').value.trim(), keys: one('keys') };
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
  var FOUND = false, RES = null, NEWR = null, TOT = null, A = null;
  function photo(c) { var p = FN.photos(c, M.data().det[c.id]); return p[0] || c.image || ''; }
  function usedCard(r, i, forCustomer) {
    var c = r.c, f = r.fin, u = photo(c);
    return '<article class="desk-card" data-i="' + i + '">'
      + '<div class="fmb-ph"' + (c.reg ? ' data-aos-reg="' + esc(c.reg) + '" data-aos-src="' + (c._home ? 'forecourt' : 'group') + '"' : '') + '>'
      + (u ? '<img src="' + esc(u) + '" alt="" width="640" height="360" loading="lazy"/>' : '') + '</div>'
      + '<h3>' + (i === 0 ? 'Top pick: ' : '') + esc((c.year ? c.year + ' ' : '') + M.modelName(c)) + '</h3>'
      + '<p>' + esc([c.reg, c.price, String(c.mileage || '').replace(/\u00a0/g, ' '), c.colour, c._home ? 'Ruxley' : 'Group stock'].filter(Boolean).join(', ')) + '</p>'
      + '<p><b>Why this one:</b> ' + esc(r.why) + '</p>'
      + (r.miss && r.miss.length ? '<p class="desk-note">Misses: ' + esc(r.miss.join(', ')) + '</p>' : '')
      + (f ? '<p class="desk-note">' + esc(FN.money2(f.monthly)) + ' a month. Representative example: ' + esc(M.repText(f)) + '</p>' : '<p class="desk-note">No lender quote at this deposit. Ask for a quote.</p>')
      + '</article>';
  }
  function newCard(r, reach, forCustomer) {
    var c = r.c;
    return '<article class="desk-card' + (reach && !forCustomer ? ' desk-reach' : '') + '">'
      + '<h3>Brand new ' + esc(c.description) + '</h3>'
      + '<p>' + esc([c.colour, c.price, M.newWhen(c)].filter(Boolean).join(', ')) + '</p>'
      + (reach && !forCustomer ? '<p class="desk-pct"><b>' + r.pct.toFixed(1) + '% over budget</b></p>' : '')
      + '<p>Finance available. I\u2019ll send you a personalised quote.</p>'
      + '</article>';
  }
  function resultHtml(forCustomer) {
    if (!RES) return '';
    var tight = RES.level === 0 && RES.nStrict > 0;
    var head = tight ? M.heroLine(A, TOT) : 'Out of the ' + TOT.total + ' cars in our stock, nothing nails every point today, so these are the closest.';
    var h = '<h2 class="desk-hero">' + esc(head) + '</h2>';
    if (!forCustomer) h += '<p class="desk-note">' + esc(M.xLine(A, TOT)) + '.' + (RES.level >= 2 ? ' Widened: ' + esc(RES.levels.filter(function (l) { return l >= 2; }).map(function (l) { return M.RELAX[l]; }).join(', ')) + '.' : '') + '</p>';
    var top = RES.list.slice(0, 3);
    h += top.map(function (r, i) { return usedCard(r, i, forCustomer); }).join('');
    if (M.wantsNew(A)) {
      var anyNew = NEWR.fit.length || NEWR.reach.length;
      h += '<h3 class="desk-sub">Brand new options</h3>';
      if (!anyNew) h += '<p>I\u2019ll be in touch with brand new options that suit you.</p>';
      else {
        if (NEWR.fit.length) h += NEWR.fit.map(function (r) { return newCard(r, false, forCustomer); }).join('');
        if (NEWR.reach.length) {
          if (!forCustomer) h += '<h3 class="desk-sub">Within reach, up to ' + Math.round(M.NEW_STRETCH * 100) + '% over budget</h3>';
          h += NEWR.reach.map(function (r) { return newCard(r, true, forCustomer); }).join('');
        }
      }
    }
    if (!forCustomer) h += '<div class="desk-row"><button class="fmb-btn wide" type="button" id="deskPresentBtn">Present this car</button><button class="fmb-btn ghost" type="button" id="deskShow">Customer view</button></div>';
    return h;
  }
  function runFind(silent) {
    A = answers();
    if (!ready) { $('deskEmpty').textContent = 'Loading today\u2019s stock, one moment.'; FOUND = true; return; }
    RES = M.findUsed(A); NEWR = M.findNew(A, { stretch: true }); TOT = M.stockTotal(A);
    FOUND = true;
    $('deskEmpty').hidden = true;
    var box = $('deskResult'); box.hidden = false; box.innerHTML = resultHtml(false);
    if (window.aosMedia) window.aosMedia.scan(box);
    $('deskCustomer').hidden = false; $('deskResultNotes').hidden = false;
    if (!silent) {
      track('fmb_desk_find', { stock_x: TOT.total, fallback_level: RES.level, new_fit: NEWR.fit.length, new_reach: NEWR.reach.length });
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
  function usedRows(r) {
    var x = r.c;
    return [
      ['Car', (x.year ? x.year + ' ' : '') + x.model],
      ['Reg, price, mileage', [x.reg, x.price, String(x.mileage || '').replace(/\u00a0/g, ' ')].filter(Boolean).join(', ')],
      ['Colour, location', [x.colour, x._home ? 'Ruxley forecourt' : 'Group stock'].filter(Boolean).join(', ')],
      ['Why this one', r.why + (r.miss && r.miss.length ? '. Misses: ' + r.miss.join(', ') : '')],
      ['Listing', x.url || ''],
      ['Finance', r.fin ? FN.money2(r.fin.monthly) + ' a month. Representative example: ' + M.repText(r.fin) : 'No lender quote at this deposit yet. Ask for a quote.']
    ];
  }
  function newRow(r, a, reach) {
    var c = r.c, est = r.est;
    return 'BMW ' + c.description + ', ' + (c.colour || '') + ', ' + (c.price || '') + ', order ' + c.order_number + (M.newWhen(c) ? ', ' + M.newWhen(c).toLowerCase() : '')
      + (reach ? '. ' + r.pct.toFixed(1) + '% over budget' : '')
      + (a.pay === 'monthly' && est ? '. For Dan only: about ' + FN.money(est) + ' a month at ' + (a.dep === null ? FN.money(M.NEW_QUOTE_DEP) + ' (deposit not given)' : 'their ' + FN.money(a.dep)) + ' deposit on the ' + GBP + M.NEW_PER_1000 + ' per ' + GBP + '1,000 rule' : '');
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
    D.carFuelTicks = 'Petrol ' + T(px.fuel.indexOf('petrol') !== -1) + '  Diesel ' + T(px.fuel.indexOf('diesel') !== -1) + '  Hybrid ' + T(px.fuel.indexOf('hybrid') !== -1);
    D.pxTicks = 'Yes ' + T(px.yn === 'yes') + '  No ' + T(px.yn === 'no');
    D.gearTicks = 'Auto ' + T(px.gear === 'auto') + '  Manual ' + T(px.gear === 'manual');
    D.usage = [['Main driver', M.txt(M.WHO, a.who)], ['Typical week', M.txt(M.LIFE, a.life)], ['People', M.txt(M.PEOPLE, a.people)],
      ['Boot', M.txt(M.BOOT, a.boot)], ['Home charging', M.txt(M.CHARGE, a.charge)]];
    D.pxRows = [['Reg', [px.reg, px.found].filter(Boolean).join(', ')], ['Mileage', px.miles ? 'About ' + px.miles.toLocaleString('en-GB') + ' miles' : ''],
      ['Service history', px.service], ['Outstanding finance', px.fin], ['Condition', px.cond], ['Keys', px.keys], ['Notes on the car', px.notes]];
    D.money = [['PX', fm(px.px)], ['SIV', fm(px.siv)], ['Settlement', fm(px.settle)], ['Equity', px.equity === null ? '' : FN.money(px.equity) + (px.equity < 0 ? ' (negative)' : '')]];
    D.must = labels(vals('mustF')).concat(nv('mustText') ? [nv('mustText')] : []);
    D.would = labels(vals('wouldF')).concat(nv('wouldText') ? [nv('wouldText')] : []);
    D.prefs = [['Shape', M.shapesText(a)], ['Fuel', M.fuelsText(a)], ['Colours', a.colours.length ? M.list(a.colours, 'or') : 'Open minded']];
    D.funding = {
      cur: fm(num(nv('curMonthly'))), cycle: nv('changeCycle'), miles: num(nv('annualMiles')) ? num(nv('annualMiles')).toLocaleString('en-GB') : '',
      pay: a.pay ? M.txt([{ v: 'monthly', t: 'Monthly' }, { v: 'cash', t: 'Cash price' }, { v: 'notsure', t: 'Not sure yet' }], a.pay) : '',
      moFrom: fm(num(nv('moFrom'))), moTo: fm(num(nv('mo'))), depFrom: fm(num(nv('depFrom'))), depTo: fm(num(nv('dep'))),
      cash: fm(num(nv('cash'))), term: num(nv('term')) ? num(nv('term')) + ' months' : '',
      methods: vals('fundMethod'), said: one('said'), intro: one('introBM')
    };
    D.result = null;
    if (RES && RES.list.length) {
      D.result = { lead: M.xLine(a, TOT) + ', this is the one.', top: RES.list[0], alts: RES.list.slice(1, 3),
        match: RES.level === 0 ? 'Strict match, nothing widened' : 'Widened: ' + RES.levels.filter(function (l) { return l >= 2; }).map(function (l) { return M.RELAX[l]; }).join(', '),
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
    L.push('Current car: ' + (D.px.car || D.px.found || 'Not given') + '. ' + D.carFuelTicks);
    L.push('Part exchange? ' + D.pxTicks + '. ' + D.gearTicks);
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
    row('Current monthly payment', f.cur); row('Change cycle', f.cycle); row('Annual mileage', f.miles);
    row('How they want to pay', f.pay);
    if (f.moFrom || f.moTo) L.push('Monthly budget: ' + (f.moFrom || 'not given') + ', up to ' + (f.moTo || 'not given'));
    if (f.depFrom || f.depTo) L.push('Deposit: ' + (f.depFrom || 'not given') + ', up to ' + (f.depTo || 'not given'));
    row('Cash budget up to', f.cash); row('Term', f.term);
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
      tr('Current car', v(D.px.car || D.px.found) + '<span class="cp-ticks">' + esc(D.carFuelTicks) + '</span>'),
      tr('Part exchange?', esc(D.gearTicks) + ' &nbsp; ' + esc(D.pxTicks)),
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
      + '<table class="cp-t cp-grid3"><tr><td><span class="red">Current monthly payment \u00a3</span> ' + v(f.cur) + '</td><td><span class="red">Change cycle</span> ' + v(f.cycle) + '</td><td><span class="red">Annual mileage</span> ' + v(f.miles) + '</td></tr>'
      + '<tr><td><span class="red">Monthly budget \u00a3</span> ' + v(f.moFrom) + '</td><td><span class="red">Up to \u00a3</span> ' + v(f.moTo) + '</td><td><span class="red">Deposit \u00a3</span> ' + v(f.depFrom) + ' <span class="red">Up to \u00a3</span> ' + v(f.depTo) + '</td></tr>'
      + '<tr><td>How they want to pay: ' + v(f.pay) + '</td><td>Cash up to: ' + v(f.cash) + '</td><td>Term: ' + v(f.term) + '</td></tr></table>'
      + '<table class="cp-t cp-fund"><tr>' + FUND.map(function (m) { return '<td>' + T(f.methods.indexOf(m[0]) !== -1) + ' ' + esc(m[1]) + '</td>'; }).join('') + '</tr></table>'
      + notes('n_budget')
      + '<table class="cp-t cp-grid2"><tr><td>How has the customer SAID they are funding? Yes ' + T(f.said === 'yes') + ' No ' + T(f.said === 'no') + '</td><td>Introduction To Business Manager Yes ' + T(f.intro === 'yes') + ' No ' + T(f.intro === 'no') + '</td></tr></table></section>';
    if (D.result) {
      var R = D.result, top = R.top, u = photo(top.c), rows = usedRows(top);
      h += '<section class="cp-sec"><h2 class="cp-bar">Car found</h2><p class="cp-lead">' + v(R.lead) + '</p>'
        + '<div class="cp-car">' + (u ? '<img src="' + esc(u) + '" alt=""/>' : '') + '<div>' + tbl(rows.filter(function (r) { return r[0] !== 'Finance'; }).map(function (r) { return tr(r[0], r[0] === 'Listing' && r[1] ? '<a href="' + esc(r[1]) + '">' + esc(r[1]) + '</a>' : v(r[1])); })) + '</div></div>'
        + '<p class="cp-rep">' + v(rows[rows.length - 1][1]) + '</p>' + tbl([tr('Matching', v(R.match))]) + notes('n_result') + '</section>';
      if (R.alts.length) h += '<section class="cp-sec"><h3 class="cp-sub">Alternatives</h3>' + tbl(R.alts.map(function (r, i) {
        var o = {}; usedRows(r).forEach(function (x) { o[x[0]] = x[1]; });
        return tr((i + 2) + '. ' + (o['Car'] || ''), [o['Reg, price, mileage'], o['Colour, location'], o['Why this one'] ? 'Why: ' + o['Why this one'] : '', o['Listing']].filter(Boolean).map(v).join('<br/>') + (o['Finance'] ? '<br/><span class="cp-rep">' + v(o['Finance']) + '</span>' : ''));
      })) + '</section>';
      if (R.newFit) h += '<section class="cp-sec"><h3 class="cp-sub">Brand new options</h3>' + tbl([
        tr('Fit the budget', R.newFit.length ? R.newFit.map(function (r) { return v(newRow(r, a, false)); }).join('<br/>') : 'None fit every point today'),
        tr('Within reach, up to ' + Math.round(M.NEW_STRETCH * 100) + '% over', R.newReach.length ? R.newReach.map(function (r) { return v(newRow(r, a, true)); }).join('<br/>') : 'None'),
        tr('Finance', 'Personalised quote to follow on all brand new')]) + '</section>';
    }
    h += '<section class="cp-sec"><h2 class="cp-bar">Next steps</h2>' + tbl(D.next.map(function (n) { return tr(n[0], (n[1] === null ? '' : T(n[1]) + ' ') + v(n[2] || (n[1] === null ? 'Not set' : ''))); })) + notes('n_next') + '</section>';
    h += '<section class="cp-sec"><h2 class="cp-bar">Manager comments</h2><div class="cp-box"></div>'
      + '<div class="cp-sign"><div>Salesperson: ' + SALES + '<br/><br/>Signature ______________________ Date __________</div>'
      + '<div>Sales Manager<br/><br/>Signature ______________________ Date __________</div></div></section>';
    return h;
  }
  function buildProfile(opts) {
    if (!FOUND) runFind(true);
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
    TEXTS.concat(PERSONAL).forEach(function (id) { f['#' + id] = $(id).value; });
    CHECKS.forEach(function (id) { f['#' + id] = $(id).checked; });
    f['#pxFound'] = $('pxFound').hidden ? '' : $('pxFound').textContent;
    return { t: Date.now(), fields: f, found: FOUND, scroll: window.scrollY,
      matches: RES ? RES.list.slice(0, 3).map(function (r) { return r.c.reg; }) : [], lead: LEAD_ID };
  }
  /* Never write while the restore offer is waiting, or before the page has
     been opened past the gate: that would overwrite the saved customer with
     an empty form. */
  var pendingRestore = false;
  function save() {
    if (!restoreChecked || pendingRestore) return;
    try { localStorage.setItem(DRAFT, JSON.stringify(snapshot())); dirty = false; } catch (e) {}
  }
  function saveSoon() {
    dirty = true; var gen = ++saveGen; clearTimeout(saveT);
    saveT = setTimeout(function () { if (gen === saveGen) save(); }, 250);
  }
  function loadDraft() { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) { return null; } }
  function hasContent(d) { if (!d || !d.fields) return false; return Object.keys(d.fields).some(function (k) { var v = d.fields[k]; return Array.isArray(v) ? v.length : (v && v !== false); }); }
  function apply(d) {
    var f = d.fields || {};
    [].forEach.call(document.querySelectorAll('#deskForm input[type=radio], #deskForm input[type=checkbox]'), function (i) { i.checked = (f[i.name] || []).indexOf(i.value) !== -1; });
    TEXTS.concat(PERSONAL).forEach(function (id) { if (f['#' + id] != null) $(id).value = f['#' + id]; });
    CHECKS.forEach(function (id) { $(id).checked = !!f['#' + id]; });
    if (f['#pxFound']) { $('pxFound').hidden = false; $('pxFound').textContent = f['#pxFound']; }
    LEAD_ID = d.lead || null;
    budgetPanels();
    if (d.found) runFind(true);
    setTimeout(function () { window.scrollTo(0, d.scroll || 0); }, 60);
  }
  function clearDraft() { saveGen++; clearTimeout(saveT); clearTimeout(scrollT); try { localStorage.removeItem(DRAFT); } catch (e) {} }
  function resetAll() {
    $('deskForm').reset();
    PERSONAL.concat(TEXTS).forEach(function (id) { $(id).value = ''; }); CHECKS.forEach(function (id) { $(id).checked = false; });
    $('deskResultNotes').hidden = true; $('deskProfileWrap').hidden = true; $('deskProfile').innerHTML = '';
    $('pxFound').hidden = true; $('pxFound').textContent = '';
    FOUND = false; RES = null; NEWR = null; LEAD_ID = null; LASTSENT = null;
    $('deskResult').hidden = true; $('deskResult').innerHTML = ''; closePresent(); $('deskEmpty').hidden = false; $('deskEmpty').textContent = 'Fill in what you know, in any order, then press Find car.';
    $('deskCustomer').hidden = true; $('deskDone').hidden = true; $('deskFallback').hidden = true; $('deskSubmitErr').hidden = true;
    $('deskSubmit').disabled = false; $('deskSubmit').textContent = 'Submit'; $('deskCopy').textContent = 'Copy email';
    budgetPanels(); clearDraft(); window.scrollTo(0, 0);
  }
  function budgetPanels() { var p = one('pay'); $('budMonthly').hidden = p !== 'monthly'; $('budCash').hidden = p !== 'cash'; }

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
    form.addEventListener('change', function () { budgetPanels(); equity(); if (FOUND) runFind(true); saveSoon(); });
    form.addEventListener('input', function (e) { if (/^px(Siv|Settle)$/.test(e.target.id)) equity(); if (e.target.id === 'pxReg') e.target.value = e.target.value.toUpperCase(); saveSoon(); if (FOUND && /^(mo|dep|cash)$/.test(e.target.id)) { clearTimeout(form._t); form._t = setTimeout(function () { runFind(true); }, 400); } });
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
    $('deskProfileBtn').addEventListener('click', openProfile);
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
      + '<h2 class="dp-name">' + esc(name) + '</h2><p class="dp-spec">' + esc(spec) + '</p>' + price + fin
      + '<h3>Why this one for you</h3><ul class="dp-why">' + whys + '</ul></div></article>';
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
      if (mot && mot.odo && !$('pxMiles').value) $('pxMiles').value = String(mot.odo);
      saveSoon(); track('fmb_desk_px_lookup', { ok: 'yes' });
    })['catch'](function () { $('pxFound').textContent = 'Could not look that reg up. Carry on and add the details by hand.'; track('fmb_desk_px_lookup', { ok: 'no' }); });
  }

  function start() {
    build(); wire(); wireGate(); budgetPanels();
    if (unlocked()) openApp(); else lock('start');
  }
  window.fmbDeskDebug = {
    payload: null, answers: function () { return answers(); }, result: function () { return { used: RES, neu: NEWR, totals: TOT }; },
    emailBody: function () { return emailBody(); }, buildProfile: function (o) { return buildProfile(o); }, openProfile: function () { openProfile(); }, subject: function () { return subject(); }, lock: function () { lock('test'); }, presentText: function () { return presentText(); },
    ready: function () { return pData; }, draft: function () { return loadDraft(); }, summary: function () { return customerSummary(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
