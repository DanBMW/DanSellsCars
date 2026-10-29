/* Chat to Revvy (signed in customers). If the customer has saved choices, Revvy reads each one back to confirm
   or change it (same idea as the confirm flow on the guest swipe link). If not, it opens the Revvy onboarding
   chat (chat/), which saves the answers to their profile. Only the customer's own car choices are shown:
   no contact details. Staff and admin never see this button. */
(function () {
  function $(s, r) { return (r || document).querySelector(s); }
  function S() { return (window.ctDebug || {}).S || {}; }
  function isCust() { var s = S().session; return !!(s && s.role === 'customer'); }
  var gbp = function (n) { return '\u00a3' + Number(n).toLocaleString('en-GB'); };
  var cap = function (t) { t = String(t).replace(/_/g, ' '); if (/^(suv|mpv)$/i.test(t)) return t.toUpperCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
  var list = function (a) { return (a || []).map(cap).join(', '); };
  function tri(on, must) { on = on || []; must = must || []; var like = on.filter(function (x) { return must.indexOf(x) < 0; });
    return [must.length ? 'must have ' + list(must) : '', like.length ? (must.length ? 'would also like ' : 'would like ') + list(like) : ''].filter(Boolean).join(', and '); }
  function steps(c) { var fuel = String(c.fuel || '').split(',').filter(function (x) { return x && x !== 'open'; });
    return [
      { q: 'models', t: tri(c.models, c.models_must), sec: 'car' },
      { q: 'colours', t: tri(c.colours, c.colours_must), sec: 'car' },
      { q: 'spec', t: tri(c.specs, c.specs_must), sec: 'car' },
      { q: 'fuel', t: list(fuel), sec: 'car' },
      { q: 'current mileage', t: list(c.mileage_bands), sec: 'car' },
      { q: 'body or size', t: c.body && c.body !== 'any' ? cap(c.body) : '', sec: 'car' },
      { q: 'new or used', t: c.new_used && c.new_used !== 'both' ? cap(c.new_used) : '', sec: 'car' },
      { q: 'budget', t: c.budget_type === 'cash' && c.cash_gbp ? gbp(c.cash_gbp) + ' to spend' : c.monthly_gbp ? 'up to ' + gbp(c.monthly_gbp) + ' a month' + (c.deposit_gbp ? ' with ' + gbp(c.deposit_gbp) + ' down' : '') : '', sec: 'budget' }]; }
  function hasChoices(c) { return steps(c || {}).some(function (s) { return s.t; }); }

  var ov = document.createElement('div'); ov.className = 'ct-sheet rv'; ov.id = 'revvy'; ov.hidden = true;
  ov.innerHTML = '<div class="ct-sheet-in rv-in" role="dialog" aria-modal="true" aria-label="Chat to Revvy"><button class="ct-x" type="button" data-rv-x aria-label="Close">&times;</button>' +
    '<div class="rv-top"><img src="icons/icon-192.png" alt="" width="36" height="36"><div><b>Revvy</b><small>Dan\'s SwipeToDrive assistant</small></div></div><div class="rv-log" id="rvLog"></div><div class="rv-tray" id="rvTray"></div></div>';
  document.body.appendChild(ov);
  function close() { ov.hidden = true; if (history.state && history.state.rv) history.back(); }
  ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('[data-rv-x]')) close(); });
  addEventListener('popstate', function () { if (!ov.hidden) ov.hidden = true; });
  function bot(t) { var m = document.createElement('div'); m.className = 'rv-m bot'; m.textContent = t; $('#rvLog').appendChild(m); $('#rvLog').scrollTop = 1e6; }
  function me(t) { var m = document.createElement('div'); m.className = 'rv-m me'; m.textContent = t; $('#rvLog').appendChild(m); $('#rvLog').scrollTop = 1e6; }
  function chips(a) { var tr = $('#rvTray'); tr.innerHTML = ''; a.forEach(function (c) { var b = document.createElement(c.href ? 'a' : 'button'); b.className = 'ct-btn' + (c.go ? '' : ' ct-btn-ghost'); b.textContent = c.t;
    if (c.href) b.href = c.href; else { b.type = 'button'; b.onclick = function () { tr.innerHTML = ''; me(c.t); c.f && c.f(); }; } tr.appendChild(b); }); }
  function change(sec) { ov.hidden = true; if (history.state && history.state.rv) history.replaceState(null, ''); location.hash = 'profile';
    setTimeout(function () { var d = document.querySelector('#profileForm details.ct-sec[data-sec="' + sec + '"]'); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } }, 150); }
  function open() { var c = S().cust || {}, nm = c.name ? ' ' + String(c.name).split(' ')[0] : '';
    $('#rvLog').innerHTML = ''; $('#rvTray').innerHTML = ''; ov.hidden = false; history.pushState({ rv: 1 }, '', location.href);
    if (!hasChoices(c)) { bot('Hi' + nm + ", I'm Revvy, Dan's assistant. You have not told me what you are after yet. It takes about two minutes, then your deck only shows cars that fit.");
      chips([{ t: 'Set up my choices with Revvy', go: 1, href: 'chat/' }, { t: 'Maybe later', f: function () { close(); } }]); return; }
    bot('Hi' + nm + ", I'm Revvy. Let's check Dan has your choices right, one at a time.");
    var st = steps(c).filter(function (s) { return s.t; }), n = 0;
    (function next() { var s = st[n++]; if (!s) { bot('Perfect, your choices are confirmed. Your deck and alerts already use them.'); chips([{ t: 'Back to the cars', go: 1, f: function () { close(); location.hash = 'discover'; } }, { t: 'See my matches', f: function () { close(); location.hash = 'matches'; } }]); return; }
      bot('For ' + s.q + ', you are down for ' + s.t + '. Still right?');
      chips([{ t: 'Yes, still right', go: 1, f: next }, { t: 'Change it', f: function () { bot('No problem, I will open that part of your profile.'); setTimeout(function () { change(s.sec); }, 500); } }]); })(); }
  document.addEventListener('click', function (e) { if (e.target.closest('[data-revvy]')) { e.preventDefault(); open(); } });
  function vis() { var on = isCust(); document.querySelectorAll('[data-revvy]').forEach(function (b) { b.hidden = !on; }); }
  addEventListener('hashchange', function () { setTimeout(vis, 0); }); setInterval(vis, 1500); vis();
  window.ctRevvy = { open: open, steps: steps, hasChoices: hasChoices };
})();
