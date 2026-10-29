/* When a model the customer chose has nothing to show, say why in a line or two (match-core.js noStock / noStockText)
   and offer the next step: alerts, ordering new, adjusting the budget, or widening the one filter in the way.
   Shown above the deck, or as the empty deck message when nothing is left. Customers only, never staff. */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var D = function () { return window.ctDebug || {}; }, M = window.ctMatch;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var WA = 'https://wa.me/447827138197', hidden = {}, alertsOn = false, list = [];
  function checkAlerts() { var st = D().store; if (!st || !st.notify) return;
    st.notify().then(function (v) { var push = (v === 'push' || v === 'both') && typeof Notification !== 'undefined' && Notification.permission === 'granted';
      var email = (v === 'email' || v === 'both') && !!(window.CT_CONFIG || {}).CUSTOMER_EMAIL_ENABLED; var was = alertsOn; alertsOn = push || email; if (was !== alertsOn) paint(); }).catch(function () {}); }
  function acts(x, i) { var a = [], who = 'Hi Dan, I am looking for a ' + x.model + ' on SwipeToDrive. Can you help?';
    if (x.kind === 'none') { if (!alertsOn) a.push('<a class="ct-btn ct-sm" href="#me" data-ns-alerts>Turn on alerts</a>'); if (x.new_avail || (x.m_car && !x.budget_set)) a.push('<a class="ct-btn ct-btn-ghost ct-sm" href="../find-my-bmw.html">Look at ordering new</a>'); }
    if (x.kind === 'budget') a.push('<button class="ct-btn ct-sm" type="button" data-ns-open="budget">Adjust my budget</button>');
    var w = M.noStockWiden(x); if (w) a.push('<button class="ct-btn ct-sm" type="button" data-ns-widen="' + i + '">' + esc(w.label) + '</button>');
    if (x.kind === 'narrow') a.push('<button class="ct-btn ct-sm" type="button" data-ns-open="car">Change my choices</button>');
    a.push('<a class="ct-btn ct-btn-ghost ct-sm" target="_blank" rel="noopener" href="' + WA + '?text=' + encodeURIComponent(who) + '">Message Dan</a>');
    return a.join(''); }
  function item(x, i, dismiss) { return '<div class="ct-ns-i" data-ns-model="' + esc(x.model) + '"><p>' + esc(M.noStockText(x, { alerts: alertsOn })) + '</p><div class="ct-row ct-ns-acts">' + acts(x, i) +
    (dismiss ? '<button class="ct-ns-x" type="button" data-ns-hide="' + esc(x.model) + '" aria-label="Hide this note">&times;</button>' : '') + '</div></div>'; }
  var lastEmpty = false;
  function paint(empty) { if (empty === undefined) empty = lastEmpty; lastEmpty = empty;
    var S = D().S || {}, box = $('#deckNoStock'); if (!box || !M || !M.noStock) return;
    var cust = S.session && S.session.role === 'customer' ? S.cust : null;
    list = cust && D().pool ? M.noStock(D().pool(), cust) : [];
    var show = list.filter(function (x) { return !hidden[x.model]; });
    var must = cust && (list.length || empty) ? M.mustNote(cust) : '', mustHtml = must ? '<div class="ct-ns-i ct-ns-must"><p>' + esc(must) + '</p><div class="ct-row ct-ns-acts"><button class="ct-btn ct-sm" type="button" data-ns-open="car">Change my must haves</button></div></div>' : '';
    if (empty && (list.length || must)) { box.hidden = true; $('#deckEmptyT').textContent = !list.length ? 'No cars match your must haves' : list.length === 1 ? 'Nothing to show for the ' + list[0].model : 'Nothing to show for your models';
      $('#deckEmptyP').textContent = ''; $('#deckEmptyActs').innerHTML = '<div class="ct-ns">' + list.map(function (x, i) { return item(x, i, false); }).join('') + mustHtml + '</div>'; return; }
    if (false) { box.hidden = true; $('#deckEmptyT').textContent = list.length === 1 ? 'Nothing to show for the ' + list[0].model : 'Nothing to show for your models';
      $('#deckEmptyP').textContent = ''; $('#deckEmptyActs').innerHTML = '<div class="ct-ns">' + list.map(function (x, i) { return item(x, i, false); }).join('') + '</div>'; return; }
    box.hidden = empty || !show.length; box.innerHTML = show.map(function (x) { return item(x, list.indexOf(x), true); }).join('') + (show.length ? mustHtml : ''); }
  document.addEventListener('click', function (e) { var t = e.target.closest('[data-ns-hide],[data-ns-widen],[data-ns-open]'); if (!t) return;
    if (t.hasAttribute('data-ns-hide')) { hidden[t.getAttribute('data-ns-hide')] = 1; paint(); return; }
    if (t.hasAttribute('data-ns-open')) { var sec = t.getAttribute('data-ns-open'); location.hash = 'profile';
      setTimeout(function () { var d = document.querySelector('#profileForm details.ct-sec[data-sec="' + sec + '"]'); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } }, 250); return; }
    var x = list[+t.getAttribute('data-ns-widen')], w = x && M.noStockWiden(x), S = D().S; if (!w || !S || !S.cust) return; t.disabled = true;
    D().store.saveCustomer(Object.assign({}, S.cust, w.patch)).then(function (saved) { S.cust = saved; D().redeck(); }).catch(function () { t.disabled = false; t.textContent = 'Did not save, try again'; }); });
  addEventListener('hashchange', function () { if (location.hash === '#discover') checkAlerts(); });
  setTimeout(checkAlerts, 800);
  window.ctNoStock = { paint: paint, alertsOn: function () { return alertsOn; }, list: function () { return list; } };
})();
