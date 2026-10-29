/* SwipeToDrive admin hub: follow ups, Send quotation and Product presentation inside the app.
   Admin only (app.js routes these screens for role admin and nobody else). Reuses the app's signed in
   Supabase client, so there is no second sign in. Nothing sends from here: emails open in Outlook (mailto)
   with Sergio on cc after the HTML is copied. Customer email sending stays off. */
(function () {
  var D = function () { return window.ctDebug || {}; };
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function isAdmin() { var S = D().S; return !!(S && S.session && S.session.role === 'admin'); }
  function toast(t) { var el = $('#toast'); if (!el) return; el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2800); }

  /* ---------- follow ups store: the app's own session; ciphertext only ---------- */
  var DEMO = 'ctFuDemoV1';
  function demoGet() { try { return JSON.parse(localStorage.getItem(DEMO)) || { vault: null, rows: {} }; } catch (e) { return { vault: null, rows: {} }; } }
  function demoPut(d) { localStorage.setItem(DEMO, JSON.stringify(d)); }
  function sb() { return window.ctSupa && window.ctSupa(); }
  function live() { return !!sb(); }
  function ok(r) { if (r.error) throw r.error; return r.data; }
  window.FU_DEFER = true;
  window.FU_STORE = {
    init: function () { return Promise.resolve(); },
    user: function () { if (!isAdmin()) return Promise.resolve(null); if (!live()) return Promise.resolve({ id: 'demo-admin' });
      return sb().auth.getSession().then(function (r) { return r.data.session && r.data.session.user; }); },
    signIn: function () { return Promise.reject(new Error('Sign in to SwipeToDrive first.')); },
    signOut: function () { return Promise.resolve(); },
    getVault: function () { return live() ? sb().from('followup_vault').select('*').maybeSingle().then(ok) : Promise.resolve(demoGet().vault); },
    putVault: function (v) { if (live()) return sb().from('followup_vault').insert(v).then(ok); var d = demoGet(); d.vault = v; demoPut(d); return Promise.resolve(); },
    list: function () { if (live()) return sb().from('followups').select('id,iv,ct,v').then(ok); var r = demoGet().rows; return Promise.resolve(Object.keys(r).map(function (k) { return r[k]; })); },
    put: function (row) { if (live()) return sb().from('followups').upsert(row).then(ok); var d = demoGet(); d.rows[row.id] = row; demoPut(d); return Promise.resolve(); },
    del: function (id) { if (live()) return sb().from('followups').delete().eq('id', id).then(ok); var d = demoGet(); delete d.rows[id]; demoPut(d); return Promise.resolve(); }
  };

  /* ---------- shared email helpers ---------- */
  function copyHtml(html, prevEl) { var text = window.ProductEmail.toText(html);
    if (navigator.clipboard && window.ClipboardItem) return navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]).catch(function () { return fallback(prevEl); });
    return Promise.resolve().then(function () { return fallback(prevEl); }); }
  function fallback(el) { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); var k = false; try { k = document.execCommand('copy'); } catch (e) {} s.removeAllRanges(); if (!k) throw new Error('copy failed'); }
  function openMail(m) { location.href = 'mailto:' + encodeURIComponent(m.to) + '?cc=' + encodeURIComponent(m.cc) + '&subject=' + encodeURIComponent(m.subject); }
  function output(box, m) { box.innerHTML = (m.warnings && m.warnings.length ? '<p class="hb-warn">' + esc(m.warnings.join(' ')) + '</p>' : '') +
      '<p class="hb-note"><b>To:</b> ' + esc(m.to) + '<br><b>Cc:</b> ' + esc(m.cc) + '<br><b>Subject:</b> ' + esc(m.subject) + '</p><div class="hb-prev"><div class="hb-html">' + m.html + '</div></div>' +
      '<div class="ct-row ct-wrap"><button class="ct-btn" type="button" data-mail>Copy and open Outlook</button><button class="ct-btn ct-btn-ghost" type="button" data-copy>Copy email only</button></div><p class="hb-note" data-msg>Nothing sends from here. Paste into the new email and press Send.</p>';
    var prev = $('.hb-html', box), msg = $('[data-msg]', box);
    $('[data-copy]', box).onclick = function () { copyHtml(m.html, prev).then(function () { msg.textContent = 'Copied. Paste it into the email body.'; toast('Copied'); }, function () { msg.textContent = 'Copy was blocked. Select the preview and copy it by hand.'; }); };
    $('[data-mail]', box).onclick = function () { copyHtml(m.html, prev).then(function () { msg.textContent = 'Copied. In the new email, click in the body, paste and press Send.'; }, function () { msg.textContent = 'Copy was blocked. Select the preview and copy it by hand.'; }).then(function () { openMail(m); }); };
    box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function chips(name, list, on) { return '<div class="hb-chips" data-chips="' + name + '">' + list.map(function (p) { return '<button type="button" class="hb-chip" data-v="' + esc(p[0]) + '" aria-pressed="' + (on.indexOf(p[0]) >= 0) + '">' + esc(p[1]) + '</button>'; }).join('') + '</div>'; }
  function seg(name, list, cur) { return '<div class="ct-seg" data-seg="' + name + '">' + list.map(function (p) { return '<button type="button" data-v="' + p + '" aria-pressed="' + (p === cur) + '">' + p + '</button>'; }).join('') + '</div>'; }
  function wire(root) { root.querySelectorAll('[data-chips] .hb-chip').forEach(function (b) { b.onclick = function () { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); }; }); }
  function picked(root, n) { return [].map.call(root.querySelectorAll('[data-chips="' + n + '"] [aria-pressed=true]'), function (b) { return b.getAttribute('data-v'); }); }
  function PRODS() { return window.ProductEmail.PRODUCTS.map(function (p) { return [p.id, p.name]; }); }
  function today() { var t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
  var pre = { quote: null, present: null };

  /* ---------- Send quotation ---------- */
  var QL = { price: 'Cash price (\u00a3)', initialMonths: 'Initial rental (months)', initialRental: 'Initial rental (\u00a3)', deposit: 'Customer deposit (\u00a3)', credit: 'Total amount of credit (\u00a3)', monthly: 'Monthly payment (\u00a3)',
    payments: 'Number of monthly payments', term: 'Duration (months)', finalPayment: 'Optional final payment (\u00a3)', purchaseFee: 'Option to purchase fee (\u00a3)', totalPayable: 'Total amount payable (\u00a3)', apr: 'APR representative (%)',
    mileage: 'Annual mileage', excessPence: 'Excess mileage (pence per mile)', lender: 'Lender' };
  var QN = { PCP: 'Every figure below is needed so the monthly payment always appears with its full representative example. Copy them from the lender quote.', HP: 'Every figure below is needed so the monthly payment always appears with its full representative example. Copy them from the lender quote.',
    PCH: 'Contract hire is a rental, so there is no cash price, APR or final payment. The vehicle is returned at the end. Copy the figures from the lender quote.', Cash: 'Cash quotation: just the price.' };
  function quote() { var root = $('#hbQuote'), p = pre.quote || {}; pre.quote = null; var Q = window.QuoteEmail, type = 'PCP', cust = 'Personal';
    root.innerHTML = '<input class="widget-input" id="hq-email" type="email" placeholder="Customer email address" value="' + esc(p.email) + '" autocomplete="off">' +
      '<input class="widget-input" id="hq-name" placeholder="Customer first name" value="' + esc(p.firstName) + '" autocomplete="off">' +
      '<input class="widget-input" id="hq-vehicle" placeholder="Registration or model e.g. BMW X1 sDrive20i M Sport" value="' + esc(p.car) + '" autocomplete="off">' +
      '<span class="hb-lab">Customer</span>' + seg('cust', ['Personal', 'Business'], cust) + '<input class="widget-input" id="hq-company" placeholder="Company name (optional)" hidden><p class="hb-note" id="hq-vat"></p>' +
      '<span class="hb-lab">Quotation type</span>' + seg('type', ['PCP', 'HP', 'PCH', 'Cash'], type) + '<p class="hb-note" id="hq-tn"></p>' +
      '<div class="hb-grid">' + Object.keys(QL).map(function (k) { return '<label data-qf="' + k + '">' + QL[k] + '<input class="widget-input" id="hq-' + k + '" ' + (k === 'lender' ? 'value="BMW Financial Services"' : 'type="number" step="any" min="0" inputmode="decimal"') + '></label>'; }).join('') + '</div>' +
      '<span class="hb-lab">The quotation includes</span>' + chips('inc', PRODS(), []) + '<p class="hb-err" id="hq-err"></p><button class="ct-btn ct-btn-big" type="button" id="hq-go">Create email</button><div id="hq-out"></div>';
    wire(root);
    function sync() { root.querySelectorAll('[data-seg] button').forEach(function (b) { var g = b.parentNode.getAttribute('data-seg'); b.setAttribute('aria-pressed', b.getAttribute('data-v') === (g === 'type' ? type : cust)); });
      var pch = root.querySelector('[data-seg=type] [data-v=PCH]'); pch.textContent = cust === 'Business' ? 'BCH' : 'PCH'; $('#hq-company').hidden = cust !== 'Business';
      $('#hq-vat').textContent = cust === 'Business' ? 'Business: enter every figure excluding VAT. The email shows them as plus VAT.' : 'Personal: enter every figure including VAT.';
      var need = Q.NEED[type]; root.querySelectorAll('[data-qf]').forEach(function (l) { l.hidden = need.indexOf(l.getAttribute('data-qf')) < 0; }); $('#hq-tn').textContent = QN[type]; }
    root.querySelectorAll('[data-seg] button').forEach(function (b) { b.onclick = function () { if (b.parentNode.getAttribute('data-seg') === 'type') type = b.getAttribute('data-v'); else cust = b.getAttribute('data-v'); sync(); }; });
    sync();
    $('#hq-go').onclick = function () { var err = $('#hq-err'); err.textContent = '';
      var d = { type: type, customer: cust, company: cust === 'Business' ? $('#hq-company').value : '', email: $('#hq-email').value, firstName: $('#hq-name').value, vehicle: $('#hq-vehicle').value, included: picked(root, 'inc') };
      Q.NEED[type].forEach(function (k) { d[k] = $('#hq-' + k).value; });
      var v = Q.validate(d); if (v.length) { err.textContent = v[0]; return; }
      try { output($('#hq-out'), Q.build(d)); } catch (e) { err.textContent = e.message; } }; }

  /* ---------- Product presentation ---------- */
  function present() { var root = $('#hbPresent'), p = pre.present || {}; pre.present = null; var stage = 'point_of_sale';
    root.innerHTML = '<p class="ct-sub">The protection products email, with what they have bought ticked. The product videos are AI generated and the email says so.</p>' +
      '<input class="widget-input" id="hp-email" type="email" placeholder="Customer email address" value="' + esc(p.email) + '" autocomplete="off">' +
      '<input class="widget-input" id="hp-name" placeholder="Customer first name" value="' + esc(p.firstName) + '" autocomplete="off">' +
      '<input class="widget-input" id="hp-car" placeholder="Car e.g. BMW 1 Series" value="' + esc(p.car) + '" autocomplete="off">' +
      '<span class="hb-lab">Order date (deadline is 30 days later)</span><input class="widget-input" id="hp-date" type="date" value="' + (p.orderDate || today()) + '">' +
      '<span class="hb-lab">Products they have bought</span>' + chips('bought', PRODS(), []) +
      '<span class="hb-lab">When</span><div class="ct-seg" data-seg="stage"><button type="button" data-v="point_of_sale" aria-pressed="true">Pre handover</button><button type="button" data-v="post_handover" aria-pressed="false">Post handover</button></div>' +
      '<p class="hb-err" id="hp-err"></p><button class="ct-btn ct-btn-big" type="button" id="hp-go">Create email</button><div id="hp-out"></div>';
    wire(root);
    root.querySelectorAll('[data-seg=stage] button').forEach(function (b) { b.onclick = function () { stage = b.getAttribute('data-v'); root.querySelectorAll('[data-seg=stage] button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
    $('#hp-go').onclick = function () { var P = window.ProductEmail, err = $('#hp-err'); err.textContent = '';
      var d = { email: $('#hp-email').value, firstName: $('#hp-name').value, car: $('#hp-car').value, orderDate: $('#hp-date').value, stage: stage, bought: picked(root, 'bought') };
      if (!P.isValidEmail(d.email)) { err.textContent = 'Please enter a valid customer email.'; return; }
      if (!d.firstName.trim()) { err.textContent = 'Please enter the customer first name.'; return; }
      if (!d.orderDate) { err.textContent = 'Please pick the order date.'; return; }
      try { output($('#hp-out'), P.build(d)); } catch (e) { err.textContent = e.message; } }; }

  /* ---------- screens ---------- */
  var mounted = false, shown = {};
  function show(h) { if (!isAdmin()) return;
    if (h === 'followups') { if (!mounted) { mounted = true; window.FollowUpsUI.mount($('#fx-root')); } if (pre.fu) { window.FollowUpsUI.addFor(pre.fu); pre.fu = null; } }
    if (h === 'quote' && (pre.quote || !shown.quote)) { shown.quote = 1; quote(); }
    if (h === 'present' && (pre.present || !shown.present)) { shown.present = 1; present(); } }
  window.ctHub = { show: show };

  /* back arrows: history back when we came from inside the app, otherwise home */
  var inApp = false; addEventListener('hashchange', function () { inApp = true; });
  document.addEventListener('click', function (e) { if (e.target.closest('[data-hb-back]')) { if (inApp && history.length > 1) history.back(); else location.hash = 'team'; } });

  /* customer record buttons: prefill from the SwipeToDrive customer */
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-hub]'); if (!b || !isAdmin()) return; e.stopPropagation();
    var id = b.closest('[data-cid]').getAttribute('data-cid'), st = D().store, what = b.getAttribute('data-hub');
    Promise.all([st.customers(), st.purchases(id).catch(function () { return []; })]).then(function (r) { var c = r[0].find(function (x) { return x.id === id; }) || {};
      var p = (r[1] || []).filter(function (x) { return !x.cancelled; })[0], parts = String(c.name || '').trim().split(/\s+/);
      var car = p ? p.model : ((c.models || [])[0] ? 'BMW ' + c.models[0] : '');
      var x = { firstName: parts[0] || '', lastName: parts.slice(1).join(' '), email: c.email || '', phone: c.phone || '', car: car || '', swipeCustomerId: c.id };
      if (p) { x.purchaseDate = p.purchase_date; x.start = p.collected_on || p.purchase_date; if (p.term_months) x.term = p.term_months; }
      if (what === 'followups') pre.fu = x; else pre[what] = x;
      if (location.hash === '#' + what) show(what); else location.hash = what; }); }, true);

  /* follow up sheets: the back button closes the sheet first */
  var on = false, popping = false;
  new MutationObserver(function () { var o = !!document.querySelector('#fx-root .fx-ov'); if (o === on) return; on = o;
    if (o) history.pushState({ hbSheet: 1 }, '', location.href); else if (!popping && history.state && history.state.hbSheet) history.back(); popping = false; })
    .observe(document.getElementById('fx-root') || document.body, { childList: true, subtree: true });
  addEventListener('popstate', function () { if (on) { popping = true; var m = document.getElementById('fx-modal'); if (m) m.innerHTML = ''; } });
  document.addEventListener('click', function (e) { if (e.target.classList && e.target.classList.contains('fx-ov')) e.target.parentNode.innerHTML = ''; });
})();
