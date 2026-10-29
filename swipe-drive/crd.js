/* SwipeToDrive: printable customer page (the old desk.html "Customer profile" sheet).
   window.ctCrd.open(customer, session) shows it full screen with Print / Close. It prints whatever is
   filled in, reading the customer row plus customers.desk, and never sends anything anywhere. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var T = function (on) { return '<span class="cp-tick">' + (on ? '&#10003;' : '') + '</span>'; };

  function deskDef() { return window.ctDeskDef || []; }
  function field(key) { var f = null; deskDef().forEach(function (g) { g.f.forEach(function (x) { if (x[0] === key) f = x; }); }); return f; }
  function optText(key, val) {
    var f = field(key); if (val == null || val === '') return '';
    var arr = [].concat(val), opts = f && Array.isArray(f[2]) ? f[2] : [];
    return arr.map(function (v) { var o = opts.filter(function (x) { return x.v === v; })[0]; return o ? o.t : v; }).join(', ');
  }
  function money(n) { return n == null || n === '' ? '' : '£' + Number(n).toLocaleString('en-GB'); }
  function specLabel(k) { var M = window.ctMatch, o = M && M.specOptions ? M.specOptions().filter(function (x) { return x.key === k; })[0] : null; return o ? o.label : String(k).replace(/_/g, ' '); }
  function stamp() { return new Date().toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

  function html(c, session) {
    var d = c.desk || {}, px = c.px || {}, M = window.ctMatch;
    function v(x) { return esc(x == null ? '' : x); }
    function tr(k, val, cls) { return '<tr><th' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(k) + '</th><td>' + val + '</td></tr>'; }
    function tbl(rows) { return '<table class="cp-t">' + rows.join('') + '</table>'; }
    function notes(key, label) { return '<div class="cp-notes"><b>' + esc(label || 'Notes') + '</b>' + v(d[key]) + '</div>'; }
    var sales = session && session.name ? session.name : 'Dan';
    var models = (c.models || []).join(', ');
    var mustModels = (c.models_must || []);
    var must = [], would = [];
    mustModels.forEach(function (m) { must.push(m); });
    (c.colours_must || []).forEach(function (m) { must.push(m + ' colour'); });
    (c.specs_must || []).forEach(function (k) { must.push(specLabel(k)); });
    (c.models || []).filter(function (m) { return mustModels.indexOf(m) === -1; }).forEach(function (m) { would.push(m); });
    (c.colours || []).filter(function (m) { return (c.colours_must || []).indexOf(m) === -1; }).forEach(function (m) { would.push(m + ' colour'); });
    (c.specs || []).filter(function (k) { return (c.specs_must || []).indexOf(k) === -1; }).forEach(function (k) { would.push(specLabel(k)); });
    if (d.must_text) must.push(d.must_text);
    if (d.would_text) would.push(d.would_text);
    var li = function (a) { return a.length ? a.map(function (x) { return '<li>' + v(x) + '</li>'; }).join('') : '<li>None stated</li>'; };
    var nu = { new: 'Brand new', used: 'Used', both: 'New or used' }[c.new_used] || '';
    var fuel = (c.fuel || '') === 'open' ? 'Open minded' : String(c.fuel || '').split(',').filter(Boolean).join(', ');
    var keep = d.keep === 'other' ? (d.keep_other ? d.keep_other + ' months' : 'Other') : optText('keep', d.keep);
    var fund = [].concat(d.fund || []);
    var fundOpts = (field('fund') || [])[2] || [];
    var ratings = c.px_condition_ratings || {}, rtxt = Object.keys(ratings).map(function (k) { var r = ratings[k]; return k.replace(/_/g, ' ') + ' ' + (r && r.rating != null ? r.rating : r) + '/5'; }).join(', ');
    var ok = !!(c.comms_consent_at || c.user_id);
    var consentTxt = c.user_id ? 'Yes. Customer signed in to SwipeToDrive themselves.'
      : c.comms_consent_at ? 'Yes. Recorded ' + new Date(c.comms_consent_at).toLocaleDateString('en-GB') + (c.comms_consent_by_name ? ' by ' + c.comms_consent_by_name : '') + '.'
      : 'NO. Do not message this customer.';

    var h = '<header class="cp-head"><div><h1>Customer profile</h1><p>Dan Sells, Hedin BMW Ruxley</p><p>Salesperson: ' + v(sales) + '</p></div>'
      + '<div class="cp-r"><p>' + esc(stamp()) + '</p><p>Ref ' + esc(String(c.id || '').slice(0, 8).toUpperCase()) + '</p><p>SwipeToDrive</p></div></header>';
    h += '<section class="cp-sec"><h2 class="cp-bar">Customer details</h2>' + tbl([
      tr('Name', v(c.name)), tr('Mobile', v(c.phone)), tr('Email', v(c.email)), tr('Postcode', v(c.postcode)),
      tr('OK to message', ok ? v(consentTxt) : '<span class="red">' + v(consentTxt) + '</span>')]) + notes('n_customer') + '</section>';
    h += '<section class="cp-sec"><h2 class="cp-bar">Customer requirement</h2>' + tbl([
      tr('Car of interest', v(models || 'Not set') + (nu ? '<span class="cp-ticks">' + esc(nu) + '</span>' : '')),
      tr('Current car', v(d.cur_car || px.reg || '')),
      tr('What do they like about this model?', v(d.like_model)),
      tr('What is important when looking for a car?', v(d.important))]) + notes('n_model') + '</section>';
    h += '<section class="cp-sec">' + tbl([tr('Who drives it most', v(optText('who', d.who))), tr('A typical week', v(optText('life', d.life))), tr('People', v(optText('people', d.people))),
      tr('Boot', v(optText('boot', d.boot))), tr('Home charging', v(optText('charge', d.charge)))]) + notes('n_usage') + '</section>';
    h += '<section class="cp-sec"><div class="cp-cols"><div><h3>Must have</h3><ul>' + li(must) + '</ul></div><div><h3>Would like</h3><ul>' + li(would) + '</ul></div></div>'
      + tbl([tr('Fuel', v(fuel)), tr('Body', v(c.body === 'any' ? 'Any' : c.body)), tr('Mileage', v((c.mileage_bands || []).join(', '))), tr('Colours', v((c.colours || []).join(', ')))]) + notes('n_must') + '</section>';
    h += '<section class="cp-sec"><div class="cp-spec"><b>Specified requirements</b>' + v(d.spec_notes) + '</div></section>';
    h += '<section class="cp-sec">' + tbl([
      tr('Part exchange', v(px.reg ? px.reg + (px.mileage ? ', ' + Number(px.mileage).toLocaleString('en-GB') + ' miles' : '') : 'None')),
      tr('Condition', v(rtxt)),
      tr('Valuation', v(money(c.px_valuation_gbp) + (c.px_valued_on ? ' on ' + c.px_valued_on : '')), 'strong'),
      tr('Finance settlement', v(money(c.px_settlement_gbp) + (c.px_settlement_valid_until ? ' valid until ' + c.px_settlement_valid_until : '')), 'strong'),
      tr('Equity', v(c.px_valuation_gbp != null && c.px_settlement_gbp != null ? money(c.px_valuation_gbp - c.px_settlement_gbp) : ''), 'strong')]) + notes('n_px', 'Part exchange notes') + '</section>';
    h += '<section class="cp-sec">' + tbl([tr('Timeline', v(optText('when', d.when)))]) + notes('n_when') + '</section>';
    h += '<section class="cp-sec"><h2 class="cp-bar">Customer funding requirements</h2>'
      + '<table class="cp-t cp-grid3"><tr><td><span class="red">Current monthly payment</span> ' + v(money(d.cur_monthly)) + '</td><td><span class="red">Plans to keep it</span> ' + v(keep) + '</td><td><span class="red">Annual mileage</span> ' + v(c.annual_mileage ? Number(c.annual_mileage).toLocaleString('en-GB') : '') + '</td></tr>'
      + '<tr><td><span class="red">Monthly budget from</span> ' + v(money(d.monthly_from)) + '</td><td><span class="red">Up to</span> ' + v(money(c.monthly_gbp)) + '</td><td><span class="red">Deposit</span> ' + v(money(c.deposit_gbp)) + '</td></tr>'
      + '<tr><td>How they want to pay: ' + v(c.budget_type === 'cash' ? 'Cash' : c.budget_type === 'monthly' ? 'Monthly' : d.pay_notsure ? 'Not sure yet' : '') + '</td><td>Cash up to: ' + v(money(c.cash_gbp)) + '</td><td></td></tr></table>'
      + '<table class="cp-t cp-fund"><tr>' + fundOpts.map(function (o) { return '<td>' + T(fund.indexOf(o.v) !== -1) + ' ' + esc(o.t) + '</td>'; }).join('') + '</tr></table>'
      + notes('n_budget')
      + '<table class="cp-t cp-grid2"><tr><td>Has the customer SAID how they are funding? Yes ' + T(d.said === 'yes') + ' No ' + T(d.said === 'no') + '</td><td>Introduction to Business Manager Yes ' + T(d.intro_bm === 'yes') + ' No ' + T(d.intro_bm === 'no') + '</td></tr></table></section>';
    h += '<section class="cp-sec"><h2 class="cp-bar">Next steps</h2>' + tbl([
      tr('Test drive booked', T(!!d.ns_drive) + ' ' + v(d.ns_drive_when || (d.ns_drive ? '' : 'Not set'))),
      tr('Valuation on their car', T(!!d.ns_val)), tr('Follow up date', v(d.ns_follow || 'Not set'))]) + notes('n_next') + '</section>';
    h += '<section class="cp-sec"><h2 class="cp-bar">Manager comments</h2><div class="cp-box"></div>'
      + '<div class="cp-sign"><div>Salesperson: ' + v(sales) + '<br/><br/>Signature ______________________ Date __________</div>'
      + '<div>Sales Manager<br/><br/>Signature ______________________ Date __________</div></div></section>';
    return h;
  }

  var wrap = null;
  function close() { if (wrap) { wrap.remove(); wrap = null; } document.body.classList.remove('ct-crd-open'); }
  function open(c, session) {
    if (!c) return; close();
    wrap = document.createElement('div'); wrap.className = 'ct-crd-wrap'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', 'Customer page');
    wrap.innerHTML = '<div class="ct-crd-bar no-print"><button class="ct-btn ct-btn-big" type="button" data-p>Print or save as PDF</button><button class="ct-btn ct-btn-ghost" type="button" data-x>Close</button></div><article class="ct-crd">' + html(c, session) + '</article>';
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-p]')) window.print(); else if (e.target.closest('[data-x]')) close(); });
    document.body.appendChild(wrap); document.body.classList.add('ct-crd-open'); wrap.scrollTop = 0;
    document.addEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
  window.ctCrd = { open: open, close: close, html: html };
})();
