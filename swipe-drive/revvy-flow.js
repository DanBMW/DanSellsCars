/* Revvy walkthrough engine, shared by the signed in app (revvy.js) and the guest swipe link (guest.js).
   Goes through every requirement field in order. A field that is set is read back with Yes, still right or
   Change it; a field that is not set is asked for, with quick reply chips and Skip. Every change is saved
   straight away through the caller's save(patch). Ends with a summary of everything. Plain text only. */
(function (root) {
  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
  var key = function (x) { return Array.isArray(x) ? x[0] : x; }, lab = function (l, k) { var f = (l || []).filter(function (x) { return key(x) === k; })[0]; return f ? (Array.isArray(f) ? f[1] : f) : k; };
  function show(f, v) { var on = v[f.k], must = f.mk ? (v[f.mk] || []) : [];
    if (f.kind === 'tri') { on = on || []; if (!on.length) return ''; var like = on.filter(function (x) { return must.indexOf(x) < 0; });
      return [must.length ? 'must have ' + must.map(function (k) { return lab(f.list, k); }).join(', ') : '', like.length ? (must.length ? 'would also like ' : 'would like ') + like.map(function (k) { return lab(f.list, k); }).join(', ') : ''].filter(Boolean).join(', and '); }
    if (f.kind === 'multi') return (on || []).map(function (k) { return lab(f.list, k); }).join(', ');
    if (f.kind === 'single') return on == null || on === '' || (f.unset || []).indexOf(on) >= 0 ? '' : lab(f.list, on);
    if (f.kind === 'num') return on == null || on === '' ? '' : (f.fmt ? f.fmt(on) : String(on));
    return on ? String(on) : ''; }
  function run(o) {
    var log = o.log, tray = o.tray, v = o.values, fields = o.fields, failed = [], changed = [];
    function scroll() { log.scrollTop = 1e6; if (o.onScroll) o.onScroll(); }
    function bot(t) { log.appendChild(el('div', o.cls.bot, t)); scroll(); }
    function me(t) { log.appendChild(el('div', o.cls.me, t)); scroll(); }
    function chips(a) { tray.innerHTML = ''; a.forEach(function (c) { var b = el(c.href ? 'a' : 'button', o.cls.chip + (c.go ? ' ' + o.cls.go : ''), c.t); if (c.href) b.href = c.href; else { b.type = 'button'; b.onclick = function () { tray.innerHTML = ''; if (!c.quiet) me(c.t); c.f(); }; } tray.appendChild(b); }); }
    function picker(f, done) { tray.innerHTML = ''; var st = {}, on = f.kind === 'single' ? (v[f.k] != null ? [v[f.k]] : []) : (v[f.k] || []), must = f.mk ? (v[f.mk] || []) : [];
      on.forEach(function (k) { st[k] = 'like'; }); must.forEach(function (k) { st[k] = 'must'; });
      if (f.kind === 'tri') tray.appendChild(el('p', o.cls.legend, 'Tap once for would like, twice for must have, a third tap clears it.'));
      var g = el('div', o.cls.picks + (f.kind === 'tri' ? ' tri' : ''));
      f.list.forEach(function (x) { var k = key(x), b = el('button', o.cls.pick); b.type = 'button'; b.setAttribute('data-k', k); b.appendChild(el('b', null, lab(f.list, k))); var i = el('i'); b.appendChild(i);
        function paint() { var s = st[k] || ''; b.setAttribute('data-s', s); b.setAttribute('aria-pressed', s ? 'true' : 'false'); i.textContent = s === 'must' ? 'Must have' : s === 'like' && f.kind === 'tri' ? 'Would like' : ''; }
        b.onclick = function () { var s = st[k] || ''; if (f.kind === 'tri') st[k] = s === '' ? 'like' : s === 'like' ? 'must' : '';
          else if (f.kind === 'single') { Object.keys(st).forEach(function (z) { st[z] = ''; }); st[k] = 'like'; [].forEach.call(g.children, function (z) { z.setAttribute('data-s', ''); z.setAttribute('aria-pressed', 'false'); }); }
          else { st[k] = s ? '' : 'like'; if (f.exclusive) { if (k === f.exclusive && st[k]) Object.keys(st).forEach(function (z) { if (z !== k) st[z] = ''; }); else if (st[k]) st[f.exclusive] = ''; [].forEach.call(g.children, function (z) { var zk = z.getAttribute('data-k'); z.setAttribute('data-s', st[zk] || ''); z.setAttribute('aria-pressed', st[zk] ? 'true' : 'false'); }); } }
          paint(); };
        paint(); g.appendChild(b); });
      tray.appendChild(g);
      var row = el('div', o.cls.row), d = el('button', o.cls.chip + ' ' + o.cls.go, 'Done'); d.type = 'button'; row.appendChild(d);
      var sk = el('button', o.cls.chip, 'Skip'); sk.type = 'button'; row.appendChild(sk); tray.appendChild(row);
      sk.onclick = function () { tray.innerHTML = ''; me('Skip'); done(null); };
      d.onclick = function () { var a = [], m = []; Object.keys(st).forEach(function (k) { if (st[k]) a.push(k); if (st[k] === 'must') m.push(k); }); tray.innerHTML = '';
        if (f.kind === 'single') { if (!a.length) { me('Skip'); return done(null); } var p = {}; p[f.k] = a[0]; me(lab(f.list, a[0])); return done(p); }
        if (f.exclusive && !a.length) a = [f.exclusive];
        var p2 = {}; p2[f.k] = a; if (f.mk) p2[f.mk] = m; var tmp = {}; tmp[f.k] = a; if (f.mk) tmp[f.mk] = m; me(show(f, tmp) || 'None'); done(p2); }; }
    function ask(f, done) { tray.innerHTML = ''; var form = el('form', o.cls.form), i = el('input', o.cls.input); i.placeholder = f.ph || 'Type here';
      if (f.kind === 'num') { i.type = 'number'; i.inputMode = 'numeric'; i.min = '0'; }
      if (v[f.k] != null && v[f.k] !== '') i.value = v[f.k]; var go = el('button', o.cls.chip + ' ' + o.cls.go, 'Save'); go.type = 'submit'; form.appendChild(i); form.appendChild(go); tray.appendChild(form);
      var row = el('div', o.cls.row); (f.quick || []).forEach(function (q) { var b = el('button', o.cls.chip, q[1]); b.type = 'button'; b.onclick = function () { put(q[0], q[1]); }; row.appendChild(b); });
      var sk = el('button', o.cls.chip, 'Skip'); sk.type = 'button'; sk.onclick = function () { tray.innerHTML = ''; me('Skip'); done(null); }; row.appendChild(sk); tray.appendChild(row);
      function put(val, shown) { if (f.kind === 'num') { val = Math.round(+val); if (!isFinite(val) || val < 0 || (f.max && val > f.max)) { bot(f.bad || 'That does not look right. Have another go?'); return; } }
        else { val = String(val).replace(/[<>]/g, '').trim().slice(0, f.maxLen || 300); if (!val) return; if (f.check) { var bad = f.check(val); if (bad) { bot(bad); return; } } }
        tray.innerHTML = ''; me(shown || (f.fmt ? f.fmt(val) : String(val))); var p = {}; p[f.k] = val; done(p); }
      form.onsubmit = function (e) { e.preventDefault(); if (i.value.trim() !== '') put(i.value); }; setTimeout(function () { try { i.focus({ preventScroll: true }); } catch (e) {} }, 60); }
    function edit(f, done) { if (f.kind === 'num' || f.kind === 'text') ask(f, done); else picker(f, done); }
    function apply(f, p, next) { if (!p) return next(); var before = show(f, v);
      Object.keys(p).forEach(function (k) { v[k] = p[k]; }); if (show(f, v) === before && before) return next();
      Promise.resolve().then(function () { return o.save(p, f); }).then(function () { changed.push(f.label); next(); }, function () { failed.push(f.label); bot('That one did not save, sorry. Dan will go through it with you.'); next(); }); }
    var n = 0;
    function step() { var f = fields[n++]; if (!f) return end(); if (f.when && !f.when(v)) return step(); if (!f.kind && f.open) return section(f);
      var cur = show(f, v);
      if (cur) { bot((f.say ? f.say(cur) : 'For ' + f.label.toLowerCase() + ', you have ' + cur + '.') + ' Still right?');
        chips([{ t: 'Yes, still right', go: 1, f: step }, { t: 'Change it', f: function () { if (f.hint) bot(f.hint); edit(f, function (p) { apply(f, p, step); }); } }]); }
      else { bot(f.q); if (f.hint) bot(f.hint); edit(f, function (p) { apply(f, p, step); }); } }
    function section(f) { bot(f.q); chips([{ t: f.openText || 'Open it in my profile', go: 1, f: function () { o.open(f.open); } }, { t: 'Carry on', f: step }]); }
    function end() { var lines = fields.filter(function (f) { return f.kind && (!f.when || f.when(v)); }).map(function (f) { return f.label + ': ' + (show(f, v) || 'not set'); });
      bot('Here is everything I have for you:'); log.appendChild(el('div', o.cls.bot + ' ' + o.cls.sum, lines.join('\n'))); scroll();
      bot(failed.length ? 'Some answers did not save: ' + failed.join(', ') + '. Dan will sort those.' : changed.length ? 'All saved. Your deck and alerts use these straight away.' : 'Nothing changed, so you are all set.');
      o.done({ changed: changed, failed: failed, values: v }); }
    step();
  }
  root.RevvyFlow = { run: run, show: show };
})(typeof window !== 'undefined' ? window : globalThis);
/* Every requirement field, in walkthrough order. L carries the option lists; opt.px adds the part exchange
   (signed in only: a forwarded guest link must never write a part exchange). Keys starting desk. live in customers.desk. */
(function (root) {
  var gbp = function (n) { return '\u00a3' + Number(n).toLocaleString('en-GB'); };
  var FUEL = [['open', 'Open minded'], ['petrol', 'Petrol'], ['diesel', 'Diesel'], ['hybrid', 'Hybrid'], ['electric', 'Electric']];
  var BODY = [['any', 'Any'], ['small', 'Small and easy'], ['hatchback', 'Hatchback'], ['saloon', 'Saloon'], ['estate', 'Touring'], ['suv', 'SUV'], ['family', 'Family space'], ['coupe', 'Coupe or convertible']];
  var NU = [['used', 'Used'], ['new', 'Brand new'], ['both', 'Either']];
  var MILES = [['0_8k', '0 to 8k'], ['8_15k', '8k to 15k'], ['15_25k', '15k to 25k'], ['25k_plus', '25k plus']];
  function fields(L, opt) { opt = opt || {}; var D = Object.assign({}, L.desk || {});
    if (D.who) D.who = [['me', 'Mostly me'], ['partner', 'Partner or someone else'], ['family', 'Shared around the family'], ['company', 'Company or pool car']];
    if (D.people) D.people = [['one', 'Just me'], ['two', 'Two'], ['four', 'Up to four'], ['five', 'Five or more'], ['seven', 'Needs 7 seats']];
    var cash = function (v) { return v.budget_type === 'cash'; };
    var f = [
      { k: 'models', mk: 'models_must', kind: 'tri', list: L.models, label: 'Models', q: 'Which BMW models do you like?' },
      { k: 'specs', mk: 'specs_must', kind: 'tri', list: L.specs, label: 'Spec', q: 'Any spec you want, like a reversing camera, heated seats or M Sport?' },
      { k: 'colours', mk: 'colours_must', kind: 'tri', list: L.colours, label: 'Colours', q: 'Any colours you like, or any to avoid by leaving them out?' },
      { k: 'fuel', kind: 'multi', list: FUEL, exclusive: 'open', label: 'Fuel', q: 'Which fuel suits you?', hint: 'Pick as many as you like, or Open minded.' },
      { k: 'body', kind: 'single', list: BODY, label: 'Body or size', q: 'What body style or size?' },
      { k: 'new_used', kind: 'single', list: NU, label: 'New or used', q: 'Brand new, used, or either?' },
      { k: 'mileage_bands', kind: 'multi', list: MILES, label: 'Current mileage on the car', q: 'How many miles should the car already have done?', hint: 'Pick any that are fine, or none for any.' },
      { k: 'annual_mileage', kind: 'num', label: 'Miles a year', q: 'Roughly how many miles a year do you drive?', fmt: function (n) { return Number(n).toLocaleString('en-GB') + ' miles'; }, max: 100000,
        quick: [[5000, '5,000'], [8000, '8,000'], [10000, '10,000'], [12000, '12,000'], [15000, '15,000'], [20000, '20,000']] },
      { k: 'budget_type', kind: 'single', list: [['monthly', 'Monthly payments'], ['cash', 'Cash']], label: 'Paying by', q: 'Are you thinking monthly payments or cash?' },
      { k: 'monthly_gbp', kind: 'num', label: 'Monthly budget', when: function (v) { return !cash(v); }, q: 'What is the most you would like to pay a month?', fmt: function (n) { return 'up to ' + gbp(n) + ' a month'; }, max: 10000,
        quick: [[250, '\u00a3250'], [350, '\u00a3350'], [450, '\u00a3450'], [600, '\u00a3600'], [800, '\u00a3800']] },
      { k: 'cash_gbp', kind: 'num', label: 'Cash budget', when: cash, q: 'What is your budget, up to?', fmt: function (n) { return 'up to ' + gbp(n); }, max: 1000000,
        quick: [[15000, '\u00a315,000'], [25000, '\u00a325,000'], [35000, '\u00a335,000'], [50000, '\u00a350,000']] },
      { k: 'deposit_gbp', kind: 'num', label: 'Deposit', when: function (v) { return !cash(v); }, q: 'How much deposit could you put down? Zero is fine.', fmt: gbp, max: 500000,
        quick: [[0, 'None'], [1000, '\u00a31,000'], [2000, '\u00a32,000'], [3000, '\u00a33,000'], [5000, '\u00a35,000']] },
      { k: 'desk.fund', kind: 'multi', list: D.fund, label: 'Payment type', q: 'How would you like to pay for it?', hint: 'Pick any that apply.' },
      { k: 'desk.keep', kind: 'single', list: D.keep, label: 'How long you will keep it', q: 'How long do you plan to keep the car?' },
      { k: 'desk.cur_monthly', kind: 'num', label: 'Current monthly payment', q: 'What do you pay a month on your current car? Zero if nothing.', fmt: gbp, max: 10000, quick: [[0, 'Nothing']] },
      { k: 'desk.when', kind: 'single', list: D.when, label: 'Timescale', q: 'When would you like to be driving it?' },
      { k: 'desk.people', kind: 'single', list: D.people, label: 'Seats', q: 'How many people does it need to carry?' },
      { k: 'desk.boot', kind: 'single', list: D.boot, label: 'Boot', q: 'How much boot space do you need?' },
      { k: 'desk.who', kind: 'single', list: D.who, label: 'Main driver', q: 'Who will drive it most?' },
      { k: 'desk.life', kind: 'single', list: D.life, label: 'A typical week', q: 'What does a typical week look like in it?' },
      { k: 'desk.charge', kind: 'single', list: D.charge, label: 'Home charging', q: 'Could you charge an electric or plug in car at home?' },
      { k: 'desk.cur_car', kind: 'text', label: 'Current car', q: 'What do you drive now? Make and model is fine.', ph: 'e.g. Audi A3 Sportback', maxLen: 80 },
      { k: 'desk.important', kind: 'text', label: 'What matters most', q: 'What is most important to you in your next car?', ph: 'e.g. comfort, economy, tech', maxLen: 300 },
      { k: 'desk.spec_notes', kind: 'text', label: 'Gearbox, age, interior and other needs', q: 'Anything on gearbox, age of car, interior colour or anything else I should know?', ph: 'e.g. automatic, under 3 years old, black leather', maxLen: 300 },
      { k: 'desk.must_text', kind: 'text', label: 'Other must haves', q: 'Any other must haves?', ph: 'Optional', maxLen: 300 },
      { k: 'desk.would_text', kind: 'text', label: 'Other would likes', q: 'And anything that would be nice to have?', ph: 'Optional', maxLen: 300 }];
    if (opt.px) f.push(
      { k: 'px_has', kind: 'single', list: [['no', 'No car to swap'], ['yes', 'I have one']], label: 'Part exchange', q: 'Do you have a car to part exchange?' },
      { k: 'px_reg', kind: 'text', label: 'Part exchange reg', when: function (v) { return v.px_has === 'yes'; }, q: 'What is its reg?', ph: 'e.g. AB12 CDE', maxLen: 10, check: function (x) { return /^[A-Z0-9 ]{2,9}$/i.test(x) ? '' : 'That reg does not look right.'; } },
      { k: 'px_mileage', kind: 'num', label: 'Part exchange mileage', when: function (v) { return v.px_has === 'yes'; }, q: 'Roughly how many miles has it done?', fmt: function (n) { return Number(n).toLocaleString('en-GB') + ' miles'; }, max: 500000 },
      { k: 'px_more', when: function (v) { return v.px_has === 'yes'; }, open: 'px', q: 'The condition ratings, photos and settlement figure are in your profile, because they need a tick to confirm.', openText: 'Open my part exchange' });
    return f.filter(function (x) { return !x.kind || x.kind === 'num' || x.kind === 'text' || (x.list && x.list.length); }); }
  root.RevvyFlow.fields = fields; root.RevvyFlow.LISTS = { FUEL: FUEL, BODY: BODY, NU: NU, MILES: MILES };
})(typeof window !== 'undefined' ? window : globalThis);
