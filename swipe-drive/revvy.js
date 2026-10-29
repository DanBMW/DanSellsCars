/* Chat to Revvy (signed in customers). Walks through every requirement on the profile with revvy-flow.js:
   set ones are read back to confirm or change, missing ones are asked for. Each change saves straight to the
   customer's own profile through the app's normal save (store.saveCustomer), so it is the same as editing the
   profile by hand. Only the customer's own car choices are shown, never contact details. Staff never see this. */
(function () {
  function $(s, r) { return (r || document).querySelector(s); }
  function D() { return window.ctDebug || {}; }
  function S() { return D().S || {}; }
  function isCust() { var s = S().session; return !!(s && s.role === 'customer'); }
  function lists() { var d = D(), M = window.ctMatch, desk = {};
    (d.DESK || []).forEach(function (g) { g.f.forEach(function (x) { if (Array.isArray(x[2]) && !x[4]) desk[x[0]] = x[2].map(function (o) { return [o.v, o.t]; }); }); });
    return { models: d.allModels ? d.allModels() : [], specs: M.specOptions().map(function (o) { return [o.key, o.label]; }), colours: d.colourList ? d.colourList() : M.FAMILY.map(function (x) { return x[0]; }), desk: desk }; }
  /* customer row to flat values, and a flat patch back onto the row */
  function values(c) { var v = {}, M = window.ctMatch;
    ['models', 'models_must', 'specs', 'specs_must', 'mileage_bands'].forEach(function (k) { v[k] = (c[k] || []).slice(); });
    v.colours = (c.colours || []).filter(function (x) { return x !== 'Any'; }); v.colours_must = (c.colours_must || []).slice();
    var fl = M.fuelList(c.fuel); v.fuel = fl.length ? fl : (c.fuel === 'open' ? ['open'] : []);
    ['body', 'new_used', 'budget_type', 'annual_mileage', 'monthly_gbp', 'cash_gbp', 'deposit_gbp'].forEach(function (k) { v[k] = c[k] == null ? null : c[k]; });
    Object.keys(c.desk || {}).forEach(function (k) { if (k !== 'chat') v['desk.' + k] = c.desk[k]; });
    var px = c.px || {}; v.px_has = px.reg ? 'yes' : null; v.px_reg = px.reg || ''; v.px_mileage = px.mileage == null || px.mileage === '' ? null : +px.mileage;
    return v; }
  function onto(c, p) { var n = Object.assign({}, c), desk = Object.assign({}, c.desk || {}), px = Object.assign({}, c.px || {});
    Object.keys(p).forEach(function (k) { var val = p[k];
      if (k.indexOf('desk.') === 0) { if (val == null || val === '' || (Array.isArray(val) && !val.length)) delete desk[k.slice(5)]; else desk[k.slice(5)] = val; }
      else if (k === 'fuel') n.fuel = (val || []).filter(function (x) { return x !== 'open'; }).join(',') || 'open';
      else if (k === 'px_has') { if (val === 'no') { px = {}; n.px_condition_ratings = {}; n.px_terms_confirmed_at = null; n.px_terms_confirmed_by = null; n.px_settlement_gbp = null; n.px_settlement_valid_until = null; } }
      else if (k === 'px_reg') px.reg = String(val).toUpperCase().replace(/\s+/g, ' ').trim();
      else if (k === 'px_mileage') px.mileage = val;
      else n[k] = val; });
    n.desk = desk; n.px = Object.keys(px).length ? px : null; if (n.models_must && n.models) n.models_must = n.models_must.filter(function (m) { return n.models.indexOf(m) >= 0; }); return n; }
  var ov = document.createElement('div'); ov.className = 'ct-sheet rv'; ov.id = 'revvy'; ov.hidden = true;
  ov.innerHTML = '<div class="ct-sheet-in rv-in" role="dialog" aria-modal="true" aria-label="Chat to Revvy"><button class="ct-x" type="button" data-rv-x aria-label="Close">&times;</button>' +
    '<div class="rv-top"><img src="icons/icon-192.png" alt="" width="36" height="36"><div><b>Revvy</b><small>Dan\'s SwipeToDrive assistant</small></div></div><div class="rv-log" id="rvLog"></div><div class="rv-tray" id="rvTray"></div></div>';
  document.body.appendChild(ov);
  function close() { ov.hidden = true; if (history.state && history.state.rv) history.back(); }
  ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('[data-rv-x]')) close(); });
  addEventListener('popstate', function () { if (!ov.hidden) ov.hidden = true; });
  function section(sec) { ov.hidden = true; if (history.state && history.state.rv) history.replaceState(null, ''); location.hash = 'profile';
    setTimeout(function () { var d = document.querySelector('#profileForm details.ct-sec[data-sec="' + sec + '"]'); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } }, 200); }
  var CLS = { bot: 'rv-m bot', me: 'rv-m me', chip: 'ct-btn ct-btn-ghost rv-c', go: 'rv-go', legend: 'rv-legend', picks: 'rv-picks', pick: 'rv-pick', row: 'rv-row', form: 'rv-form', input: 'rv-inp', sum: 'rv-sum' };
  function open() { var c = S().cust; if (!c) { location.hash = 'profile'; return; }
    var nm = c.name ? ' ' + String(c.name).split(' ')[0] : '';
    $('#rvLog').innerHTML = ''; $('#rvTray').innerHTML = ''; ov.hidden = false; history.pushState({ rv: 1 }, '', location.href);
    var b = document.createElement('div'); b.className = 'rv-m bot'; b.textContent = 'Hi' + nm + ", I'm Revvy, Dan's assistant. Let's go through everything you are looking for, one thing at a time. Anything already set I'll check with you, anything missing I'll ask. Skip whatever you like.";
    $('#rvLog').appendChild(b);
    window.RevvyFlow.run({ log: $('#rvLog'), tray: $('#rvTray'), values: values(c), fields: window.RevvyFlow.fields(lists(), { px: true }), cls: CLS, open: section,
      save: function (p) { var st = D().store, cur = S().cust; return st.saveCustomer(onto(cur, p)).then(function (saved) { D().S.cust = saved; D().S.deck = []; }); },
      done: function (r) { var tr = $('#rvTray'); tr.innerHTML = '';
        [['Back to the cars', 'discover', 1], ['See my matches', 'matches'], ['Open my profile', 'profile']].forEach(function (x) { var a = document.createElement('button'); a.type = 'button'; a.className = 'ct-btn' + (x[2] ? '' : ' ct-btn-ghost') + ' rv-c'; a.textContent = x[0];
          a.onclick = function () { close(); setTimeout(function () { location.hash = x[1]; }, 30); }; tr.appendChild(a); }); } }); }
  document.addEventListener('click', function (e) { if (e.target.closest('[data-revvy]')) { e.preventDefault(); open(); } });
  function vis() { var on = isCust(); document.querySelectorAll('[data-revvy],[data-revvy-row]').forEach(function (b) { b.hidden = !on; }); }
  addEventListener('hashchange', function () { setTimeout(vis, 0); }); setInterval(vis, 1500); vis();
  window.ctRevvy = { open: open, values: values, onto: onto };
})();
