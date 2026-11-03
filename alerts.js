/* Tell me when it arrives: the public alert sign up. Pick a model and the spec that matters, say how to reach you,
   agree to be contacted, then carry on into SwipeToDrive where the alert joins your profile after you sign in.
   Stock is read as one pool (used and new together). Nothing is sent from this page. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var WA = '447827138197', M = window.ctMatch, q = new URLSearchParams(location.search);
  var ST = { model: q.get('model') || '', specs: (q.get('spec') || '').split(',').filter(Boolean), new_used: /^(new|used)$/.test(q.get('nu')) ? q.get('nu') : 'both', source: (q.get('from') || 'alerts').replace(/[^a-z0-9_-]/gi, '').slice(0, 30) || 'alerts' };
  var CARS = null;
  /* model names the profile uses (the same names as the SwipeToDrive model picker), plus the M cars people ask for */
  var MODELS = ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '7 Series', '8 Series', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'XM',
    'i4', 'i5', 'i7', 'iX', 'iX1', 'iX2', 'iX3', 'Z4', 'M2', 'M3', 'M4', 'M5', 'X3 M', 'X5 M', 'X6 M'];
  function models() { var l = MODELS.slice(); if (ST.model && l.indexOf(ST.model) === -1) l.unshift(ST.model); return l; }
  function drawModels() { $('#alModel').innerHTML = '<option value="">Choose a model</option>' + models().map(function (m) { return '<option' + (m === ST.model ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join(''); }
  function drawSpecs() { var last = null, opts = M.specOptions();
    $('#alSpecs').innerHTML = opts.map(function (o) { var h = o.group && o.group !== last ? '<span class="al-grp">' + esc(o.group) + '</span>' : ''; last = o.group || last;
      return h + '<button type="button" class="al-chip" data-k="' + esc(o.key) + '" aria-pressed="' + (ST.specs.indexOf(o.key) !== -1) + '">' + esc(o.label) + '</button>'; }).join(''); }
  function drawNU() { document.querySelectorAll('#alNU button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === ST.new_used)); }); }
  function prefs() { return { models: [ST.model], models_must: [ST.model], specs: ST.specs, specs_must: ST.specs, new_used: ST.new_used }; }
  function what() { return ST.model ? 'the ' + ST.model + (ST.specs.length ? ' with ' + ST.specs.map(M.specLabel).join(', ') : '') : 'a BMW'; }
  function waLink() { return 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hi Dan, please let me know when ' + what() + ' comes into stock.'); }
  /* the honest count of what fits now, from the stock files the site already publishes */
  function loadCars() { if (CARS) return CARS;
    var used = fetch('lookup/stock.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) { return Object.keys(d.cars || {}).map(function (k) { return d.cars[k]; }); }).catch(function () { return []; });
    var nw = fetch('lookup/new-stock-lite.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) { return (d.cars || []).filter(function (c) { return c.order_number && !c.on_hold && c.price_gbp; }).map(M.fromNewStock); }).catch(function () { return []; });
    CARS = Promise.all([used, nw]).then(function (r) { return r[0].concat(r[1]); }); return CARS; }
  function paint() { $('#alWa').href = waLink(); $('#alWa2').href = waLink();
    var line = $('#alNow'); if (!ST.model) { line.hidden = true; return; }
    loadCars().then(function (cars) { var n = M.rank(cars, prefs()).length;
      /* a spec we cannot see on a car (unknown) keeps the car, so the count is cars that fit or may fit */
      line.hidden = false;
      if (window.moTick) setTimeout(function () { moTick(line.querySelector('b')); }, 0); line.innerHTML = n ? '<b>' + n + (n === 1 ? ' car fits' : ' cars fit') + ' right now.</b> You can see ' + (n === 1 ? 'it' : 'them') + ' straight away in SwipeToDrive, and the alert covers the next ones to arrive.'
        : '<b>None in stock right now.</b> Save the alert and you will hear when one arrives.'; }); }
  function bind() {
    $('#alModel').addEventListener('change', function (e) { ST.model = e.target.value; paint(); });
    $('#alSpecs').addEventListener('click', function (e) { var b = e.target.closest('.al-chip'); if (!b) return; var k = b.getAttribute('data-k'), i = ST.specs.indexOf(k);
      if (i === -1) ST.specs.push(k); else ST.specs.splice(i, 1); b.setAttribute('aria-pressed', String(i === -1)); paint(); });
    $('#alNU').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; ST.new_used = b.getAttribute('data-v'); drawNU(); paint(); });
    $('#alForm').addEventListener('submit', function (e) { e.preventDefault(); var msg = $('#alMsg'), name = $('#alName').value.trim(), phone = $('#alPhone').value.replace(/\s+/g, '');
      msg.textContent = '';
      if (!ST.model) { msg.textContent = 'Choose the model you want first.'; $('#alModel').focus(); return; }
      if (!name) { msg.textContent = 'Add your first name.'; $('#alName').focus(); return; }
      if (!/^07\d{9}$/.test(phone)) { msg.textContent = 'Add a UK mobile number starting 07, so Dan can reach you when it arrives.'; $('#alPhone').focus(); return; }
      if (!$('#alConsent').checked) { msg.textContent = 'Please tick the box so Dan can contact you about matching cars.'; return; }
      window.AlertSave.put({ model: ST.model, specs: ST.specs, new_used: ST.new_used, name: name, phone: phone, consent_at: new Date().toISOString(), source: ST.source });
      if (window.gtag) gtag('event', 'alert_start', { model: ST.model, specs: ST.specs.length, source: ST.source });
      location.href = 'swipe-drive/?alert=1#signin'; });
  }
  /* each step gets a tick once it is complete */
  function done() { var c = document.querySelectorAll('#alForm .al-card'); if (c[0]) c[0].classList.toggle('done', !!ST.model); if (c[1]) c[1].classList.toggle('done', ST.specs.length > 0);
    if (c[2]) c[2].classList.toggle('done', !!$('#alName').value.trim() && /^07\d{9}$/.test($('#alPhone').value.replace(/\s+/g, '')) && $('#alConsent').checked); }
  $('#alForm').addEventListener('input', done); $('#alForm').addEventListener('change', done); $('#alForm').addEventListener('click', function () { setTimeout(done, 0); });
  drawModels(); drawSpecs(); drawNU(); bind(); paint(); done();
  window.alDebug = { ST: ST, prefs: prefs, waLink: waLink };
})();
