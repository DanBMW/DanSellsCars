/* Customer journey (follow ups) UI. Part of Swipe Drive, Dan's customer system. Hosted today in
   links.html (#fx-root); Swipe Drive can mount it anywhere with FollowUpsUI.mount(el).
   Needs followups-core.js. Data is end to end encrypted: only ciphertext reaches Supabase.
   Set window.FU_STORE to swap in a mock store. */
(function () {
  var F = window.FollowUps, root = null; if (!F) return;
  var AUTOLOCK_MS = 10 * 60 * 1000, key = null, vault = null, rows = [], recs = [], timer = null, sb = null, view = 'list', sel = null, variant = 0;
  function today() { return F.iso(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))); }
  function e(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nice(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

  /* ---------- store: Supabase (ciphertext only) ---------- */
  var store = window.FU_STORE || {
    init: function () { var C = window.CT_CONFIG || {}; return import('https://esm.sh/@supabase/supabase-js@2').then(function (m) {
      sb = m.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } }); }); },
    user: function () { return sb.auth.getSession().then(function (r) { return r.data.session && r.data.session.user; }); },
    signIn: function (email) { return sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname + '?fu=1' } }).then(function (r) { if (r.error) throw r.error; }); },
    signOut: function () { return sb.auth.signOut(); },
    getVault: function () { return sb.from('followup_vault').select('*').maybeSingle().then(function (r) { if (r.error) throw r.error; return r.data; }); },
    putVault: function (v) { return sb.from('followup_vault').insert(v).then(function (r) { if (r.error) throw r.error; }); },
    list: function () { return sb.from('followups').select('id,iv,ct,v').then(function (r) { if (r.error) throw r.error; return r.data; }); },
    put: function (row) { return sb.from('followups').upsert(row).then(function (r) { if (r.error) throw r.error; }); },
    del: function (id) { return sb.from('followups').delete().eq('id', id).then(function (r) { if (r.error) throw r.error; }); }
  };

  /* ---------- lock handling ---------- */
  function lock(msg) { key = null; recs = []; clearTimeout(timer); render('unlock', msg || 'Locked. Enter your passphrase to continue.'); }
  function poke() { if (!key) return; clearTimeout(timer); timer = setTimeout(function () { lock('Locked after 10 minutes of no activity.'); }, AUTOLOCK_MS); }
  ['click', 'keydown', 'touchstart'].forEach(function (t) { document.addEventListener(t, poke, { passive: true }); });
  window.addEventListener('pagehide', function () { key = null; });

  function load() { return store.list().then(function (r) { rows = r; return Promise.all(r.map(function (x) { return F.decrypt(key, x).catch(function () { return null; }); })); })
    .then(function (d) { recs = d.filter(Boolean); }); }
  function save(rec) { return F.encrypt(key, rec).then(function (b) { return store.put({ id: rec.id, v: b.v, iv: b.iv, ct: b.ct }); })
    .then(function () { var i = recs.findIndex(function (r) { return r.id === rec.id; }); if (i >= 0) recs[i] = rec; else recs.push(rec); }); }

  /* ---------- screens ---------- */
  var ICON = '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  function shell(inner) { root.innerHTML = '<div class="fx">' + inner + '</div>'; }
  function render(s, msg) {
    if (s === 'signin') shell('<div class="fx-lock">' + ICON + '<div class="fx-h">Sign in to your follow ups</div><p class="fx-p">Use the same email you use for Swipe Drive. We will email you a sign in link.</p>'
      + '<input class="widget-input" id="fx-email" type="email" placeholder="Your email" autocomplete="username"><button class="fx-btn" id="fx-go">Email me a sign in link</button><p class="fx-msg">' + e(msg) + '</p></div>');
    if (s === 'create') shell('<div class="fx-lock">' + ICON + '<div class="fx-h">Create your follow ups passphrase</div><p class="fx-p">Customer details are encrypted on this device before they are saved. Only this passphrase can unlock them. It is never stored or sent anywhere.</p>'
      + '<input class="widget-input" id="fx-p1" type="password" placeholder="Passphrase (12 characters or more)" autocomplete="new-password"><input class="widget-input" id="fx-p2" type="password" placeholder="Type it again" autocomplete="new-password">'
      + '<label class="fx-warn"><input type="checkbox" id="fx-ack"> I understand that if I forget this passphrase, nobody can recover my follow ups, not even the site.</label><button class="fx-btn" id="fx-go">Create and unlock</button><p class="fx-msg">' + e(msg) + '</p></div>');
    if (s === 'unlock') shell('<div class="fx-lock">' + ICON + '<div class="fx-h">Follow ups are locked</div><p class="fx-p">End to end encrypted. Enter your passphrase to unlock on this device.</p>'
      + '<input class="widget-input" id="fx-pass" type="password" placeholder="Passphrase" autocomplete="current-password"><button class="fx-btn" id="fx-go">Unlock</button><p class="fx-msg">' + e(msg) + '</p>'
      + '<div class="fx-badges"><span>AES 256</span><span>600,000 round key</span><span>Auto locks</span></div></div>');
    if (s === 'app') return app(msg);
    var go = document.getElementById('fx-go'), inp = root.querySelector('input'); if (inp) inp.focus();
    root.querySelectorAll('input').forEach(function (i) { i.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go.click(); }); });
    go.onclick = function () { var m = root.querySelector('.fx-msg'); m.textContent = 'Working...'; go.disabled = true;
      var p = s === 'signin' ? store.signIn(document.getElementById('fx-email').value.trim()).then(function () { m.textContent = 'Check your inbox and open the link on this device.'; })
        : s === 'create' ? create() : F.openVault(document.getElementById('fx-pass').value, vault).then(function (k) { key = k; return load(); }).then(function () { poke(); render('app'); });
      p.catch(function (er) { m.textContent = er.message || 'Something went wrong'; }).then(function () { go.disabled = false; }); };
  }
  function create() { var a = document.getElementById('fx-p1').value, b = document.getElementById('fx-p2').value;
    if (a !== b) return Promise.reject(new Error('The two passphrases do not match'));
    if (!document.getElementById('fx-ack').checked) return Promise.reject(new Error('Please tick to confirm you understand'));
    return F.makeVault(a).then(function (r) { return store.putVault(r.vault).then(function () { vault = r.vault; key = r.key; recs = []; poke(); render('app'); }); }); }

  var STATE = { overdue: 'Overdue', due: 'Due today', soon: 'Due soon', upcoming: 'Planned', planned: 'Planned', sent: 'Sent', skipped: 'Not tracked', stopped: 'Stopped' };
  function stageLabel(r) { var n = F.nextStage(r); return r.stopped ? 'Journey stopped' : n ? n.label : 'Journey complete'; }
  function card(r, t) { var st = F.status(r, t), d = r.due ? Math.round((new Date(r.due) - new Date(t)) / 864e5) : 0;
    var when = st === 'overdue' ? (-d) + ' days overdue' : st === 'due' ? 'Due today' : st === 'stopped' ? 'Stopped' : st === 'complete' ? 'Complete' : 'Due ' + nice(r.due);
    var tl = r.path === 'kit' ? '' : '<span class="fx-dots">' + F.timeline(r, t).map(function (x) { return '<i class="fx-d-' + x.state + '" title="' + e(x.label) + '"></i>'; }).join('') + '</span>';
    return '<div class="fx-row fx-' + st + '"><span class="fx-av">' + e((r.firstName[0] || '') + (r.lastName[0] || '')).toUpperCase() + '</span><button class="fx-who" data-tl="' + e(r.id) + '"><b>' + e(r.firstName + ' ' + r.lastName) + '</b><small>'
      + e(r.car || 'No car noted') + ' &middot; ' + e(stageLabel(r)) + (r.swipeCustomerId ? ' &middot; Swipe Drive' : '') + '</small>' + tl + '</button><span class="fx-when">' + when + '</span>'
      + (st === 'due' || st === 'overdue' ? '<button class="fx-btn fx-sm" data-send="' + e(r.id) + '">Send next follow up</button>' : '<button class="fx-ghost fx-sm" data-tl="' + e(r.id) + '">Journey</button>') + '</div>'; }

  function app(msg) {
    var t = today(), due = F.dueNow(recs, t), rest = F.sortByDue(recs.filter(function (r) { var s = F.status(r, t); return s === 'soon' || s === 'upcoming'; }));
    var soon = rest.filter(function (r) { return F.status(r, t) === 'soon'; }).length, other = recs.filter(function (r) { var s = F.status(r, t); return s === 'stopped' || s === 'complete'; });
    shell('<div class="fx-top"><div class="fx-stats"><div><b>' + due.length + '</b><span>Due now</span></div><div><b>' + soon + '</b><span>Next 14 days</span></div><div><b>' + (recs.length - other.length) + '</b><span>On a journey</span></div></div>'
      + '<div class="fx-actions"><button class="fx-btn" id="fx-add">+ Add customer</button><button class="fx-ghost" id="fx-exp">Encrypted backup</button><button class="fx-ghost" id="fx-lock">' + ICON + 'Lock</button></div></div>'
      + (msg ? '<p class="fx-msg">' + e(msg) + '</p>' : '')
      + '<div class="fx-sec">Send next follow up</div>' + (due.length ? due.map(function (r) { return card(r, t); }).join('') : '<p class="fx-empty">Nothing due. You are all caught up.</p>')
      + '<div class="fx-sec">Coming up</div>' + (rest.length ? rest.map(function (r) { return card(r, t); }).join('') : '<p class="fx-empty">No customers scheduled yet.</p>')
      + (other.length ? '<div class="fx-sec">Stopped or complete</div>' + other.map(function (r) { return card(r, t); }).join('') : '') + '<div id="fx-modal"></div>');
    document.getElementById('fx-lock').onclick = function () { lock(); };
    document.getElementById('fx-add').onclick = function () { form(null); };
    document.getElementById('fx-exp').onclick = function () { var blob = new Blob([F.exportBackup(vault, rows)], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'followups-backup-' + t + '.json'; a.click(); };
    root.querySelectorAll('[data-send]').forEach(function (b) { b.onclick = function () { send(b.getAttribute('data-send')); }; });
    root.querySelectorAll('[data-tl]').forEach(function (b) { b.onclick = function () { journey(b.getAttribute('data-tl')); }; });
  }
  function modal(html) { var m = document.getElementById('fx-modal'); m.innerHTML = '<div class="fx-ov"><div class="fx-dlg">' + html + '</div></div>';
    m.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { m.innerHTML = ''; }; }); return m; }
  function journey(id) { var r = recs.find(function (x) { return x.id === id; }), t = today(), tl = F.timeline(r, t);
    var m = modal('<div class="fx-h">' + e(r.firstName + ' ' + r.lastName) + '</div><div class="fx-sub">' + e(r.car || '') + (r.path === 'kit' ? ' &middot; Keep in touch' : ' &middot; ' + r.term + ' month agreement, collected ' + nice(r.start) + (r.purchaseDate ? ', bought ' + nice(r.purchaseDate) : '')) + '</div>'
      + '<ol class="fx-tl">' + tl.map(function (x) { return '<li class="fx-t-' + x.state + '"><span class="fx-tm">' + (x.m != null ? 'Month ' + x.m : '') + '</span><b>' + e(x.label) + '</b><small>' + STATE[x.state] + (x.date ? ' &middot; ' + nice(x.date) : '') + '</small></li>'; }).join('') + '</ol>'
      + (r.notes ? '<div class="fx-meta">' + e(r.notes) + '</div>' : '')
      + '<div class="fx-actions">' + (F.status(r, t) === 'due' || F.status(r, t) === 'overdue' ? '<button class="fx-btn" id="fx-js">Send next follow up</button>' : '')
      + '<button class="fx-ghost" id="fx-je">Edit</button><button class="fx-ghost' + (r.stopped ? '' : ' fx-danger') + '" id="fx-jstop">' + (r.stopped ? 'Resume journey' : 'Stop follow ups') + '</button><button class="fx-ghost" data-close>Close</button></div>');
    if (document.getElementById('fx-js')) document.getElementById('fx-js').onclick = function () { send(id); };
    document.getElementById('fx-je').onclick = function () { form(id); };
    document.getElementById('fx-jstop').onclick = function () { save(Object.assign({}, r, { stopped: !r.stopped })).then(function () { render('app', (r.stopped ? 'Journey resumed for ' : 'Follow ups stopped for ') + r.firstName + '.'); }); };
  }
  function form(id) { var r = id ? recs.find(function (x) { return x.id === id; }) : {}, t = today(), path = r.path || 'journey';
    var m = modal('<div class="fx-h">' + (id ? 'Edit customer' : 'Add customer') + '</div>'
      + '<div class="fx-seg"><button data-p="journey" class="' + (path === 'journey' ? 'on' : '') + '">Bought a car</button><button data-p="kit" class="' + (path === 'kit' ? 'on' : '') + '">Keep in touch (not bought yet)</button></div>'
      + ['firstName:First name', 'lastName:Surname', 'email:Email address', 'phone:Mobile (optional)', 'car:Car e.g. BMW X1 xDrive23i M Sport'].map(function (f) { f = f.split(':');
        return '<input class="widget-input" data-f="' + f[0] + '" placeholder="' + f[1] + '" value="' + e(r[f[0]] || '') + '" autocomplete="off">'; }).join('')
      + '<div id="fx-jf"><div class="fx-sub">Protection products they have (shown in the initial follow up after collection)</div><div class="fx-chips">'
      + (window.ProductEmail ? ProductEmail.PRODUCTS.map(function (p) { return '<button class="fx-chip' + ((r.products || []).indexOf(p.id) >= 0 ? ' on' : '') + '" data-pr="' + p.id + '">' + e(p.name) + '</button>'; }).join('') : '')
      + '</div><label class="fx-chk"><input type="checkbox" id="fx-incp"' + (!id || Array.isArray(r.products) ? ' checked' : '') + '> Include the product presentation in the initial follow up</label>' + (id ? '' : '<div class="fx-sub">Which email are you sending now?</div><select class="widget-input" data-f="stage" id="fx-stage"></select>'
      + '<div class="fx-sub">Date of this email</div><input class="widget-input" type="date" data-f="sentDate" id="fx-sent" value="' + t + '">')
      + '<div class="fx-two"><label><span class="fx-sub">Agreement term (months)</span><input class="widget-input" type="number" min="24" max="60" step="1" data-f="term" id="fx-term" value="' + (r.term || 48) + '"></label>'
      + '<label><span class="fx-sub">Collection date (journey starts here)</span><input class="widget-input" type="date" data-f="start" id="fx-start" value="' + (r.start || t) + '"></label></div>'
      + '<div class="fx-two"><label><span class="fx-sub">Purchase date</span><input class="widget-input" type="date" data-f="purchaseDate" id="fx-buy" value="' + (r.purchaseDate || '') + '"></label><span></span></div><p class="fx-hint" id="fx-hint"></p></div>'
      + '<input class="widget-input" data-f="swipeCustomerId" placeholder="Swipe Drive customer ID (optional link)" value="' + e(r.swipeCustomerId || '') + '" autocomplete="off">'
      + '<textarea class="widget-input" data-f="notes" placeholder="Private notes (encrypted)">' + e(r.notes || '') + '</textarea><p class="fx-msg" id="fx-ferr"></p>'
      + '<div class="fx-actions"><button class="fx-btn" id="fx-save">' + (id ? 'Save' : 'Save and open email') + '</button><button class="fx-ghost" data-close>Cancel</button></div>');
    var startTouched = !!id, buyTouched = !!id;
    function sync() { var jf = document.getElementById('fx-jf'); jf.style.display = path === 'kit' ? 'none' : ''; if (path === 'kit') return;
      var term = +document.getElementById('fx-term').value || 48, sel = document.getElementById('fx-stage'), st; try { st = F.stagesFor(term); } catch (er) { document.getElementById('fx-hint').textContent = er.message; return; }
      if (sel) { var cur = sel.value || 'buy'; sel.innerHTML = st.map(function (s) { return '<option value="' + s.id + '"' + (s.id === cur ? ' selected' : '') + '>' + (s.m == null ? 'Purchase' : 'Month ' + s.m) + ': ' + s.label + '</option>'; }).join('');
        var at = st.filter(function (s) { return s.id === sel.value; })[0] || st[0];
        var sent = document.getElementById('fx-sent').value || t;
        if (!startTouched) document.getElementById('fx-start').value = at.kind === 'purchase' ? sent : F.addDays(F.addMonths(sent, -at.m), -(at.days || 0));
        if (!buyTouched) document.getElementById('fx-buy').value = at.kind === 'purchase' ? sent : '';
        var tmp = { start: document.getElementById('fx-start').value, purchaseDate: document.getElementById('fx-buy').value };
        var nx = st[st.indexOf(at) + 1];
        document.getElementById('fx-hint').textContent = (st.indexOf(at) > 0 ? 'Joining the journey at ' + at.label.toLowerCase() + '. Earlier emails are marked not tracked. ' : '') + (nx ? 'After this one, next is ' + nx.label.toLowerCase() + ' on ' + nice(F.planDate(tmp, nx)) + '.' : 'This is the last email in the journey.'); } }
    m.querySelectorAll('[data-pr]').forEach(function (b) { b.onclick = function () { b.classList.toggle('on'); }; });
    m.querySelectorAll('[data-p]').forEach(function (b) { b.onclick = function () { path = b.getAttribute('data-p'); m.querySelectorAll('[data-p]').forEach(function (x) { x.classList.toggle('on', x === b); }); sync(); }; });
    ['fx-stage', 'fx-sent', 'fx-term'].forEach(function (i) { var x = document.getElementById(i); if (x) x.addEventListener('input', sync); });
    document.getElementById('fx-start').addEventListener('input', function () { startTouched = true; sync(); });
    document.getElementById('fx-buy').addEventListener('input', function () { buyTouched = true; sync(); }); sync();
    document.getElementById('fx-save').onclick = function () { var f = {}; m.querySelectorAll('[data-f]').forEach(function (i) { f[i.getAttribute('data-f')] = i.value; }); f.path = path; if (!f.purchaseDate) delete f.purchaseDate;
      f.products = path === 'journey' && document.getElementById('fx-incp').checked ? [].map.call(m.querySelectorAll('[data-pr].on'), function (b) { return b.getAttribute('data-pr'); }) : null;
      var rec; try { if (id) { rec = F.withDue(Object.assign({}, r, f, { term: +f.term || 48 })); F.stagesFor(rec.term); } else rec = F.newRecord(f, t); }
      catch (er) { document.getElementById('fx-ferr').textContent = er.message; return; }
      save(rec).then(function () { if (id) return render('app', 'Saved. ' + (rec.due ? 'Next follow up ' + nice(rec.due) + '.' : ''));
        render('app', 'Saved ' + rec.firstName + '.'); send(rec.id, f.sentDate); }, function (er) { document.getElementById('fx-ferr').textContent = er.message; }); };
  }
  var sendDate = null;
  function send(id, onDate) { sel = recs.find(function (x) { return x.id === id; }); sendDate = onDate || today(); variant = F.suggestVariant(sel); draw(); }
  function draw() { var stg = F.nextStage(sel), vs = F.variants(stg.kind), mail = F.build(sel, variant);
    var m = modal('<div class="fx-h">Send next follow up to ' + e(sel.firstName) + '</div><div class="fx-sub">' + e(stg.label) + (stg.m != null ? ' &middot; month ' + stg.m + ' of ' + sel.term : '') + ' &middot; choose a wording</div><div class="fx-vars">'
      + vs.map(function (v, i) { var b = F.build(sel, i); return '<button class="fx-var' + (i === variant ? ' on' : '') + '" data-v="' + i + '"><span class="fx-vn">Option ' + (i + 1) + (i === F.suggestVariant(sel) ? ' &middot; suggested' : '') + '</span><b>' + e(b.subject) + '</b><small>' + e(b.text.split('\n\n')[2].slice(0, 110)) + '...</small></button>'; }).join('')
      + '</div><div class="fx-meta"><b>To:</b> ' + e(mail.to) + '<br><b>Cc:</b> ' + e(mail.cc) + '<br><b>Subject:</b> ' + e(mail.subject) + '</div><div class="fx-prev">' + mail.html + '</div>'
      + (stg.kind === 'initial' && !mail.products && window.dashOpen ? '<p class="fx-hint">Tip: send the Product presentation email too. <a href="#p=presentation">Open it</a></p>' : '')
      + '<p class="fx-msg" id="fx-smsg">Nothing sends from here. Copy and open email opens a new message, then you press Send.</p>'
      + '<div class="fx-actions"><button class="fx-btn" id="fx-open">Copy and open email</button><button class="fx-ok" id="fx-done">Mark as sent</button><button class="fx-ghost" data-close>Close</button></div>');
    m.querySelectorAll('[data-v]').forEach(function (b) { b.onclick = function () { variant = +b.getAttribute('data-v'); draw(); }; });
    document.getElementById('fx-open').onclick = function () { var go = function () { location.href = F.mailto(mail); };
      (navigator.clipboard && window.ClipboardItem ? navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([mail.html], { type: 'text/html' }), 'text/plain': new Blob([mail.text], { type: 'text/plain' }) })]) : Promise.reject())
        .then(function () { document.getElementById('fx-smsg').textContent = 'Copied. The email opens with the text filled in. Once sent, press Mark as sent.'; }, function () {}).then(go); };
    document.getElementById('fx-done').onclick = function () { var n = F.markSent(sel, sendDate, variant); save(n).then(function () { render('app', 'Marked as sent. ' + (n.due ? 'Next for ' + n.firstName + ': ' + stageLabel(n).toLowerCase() + ' on ' + nice(n.due) + '.' : n.firstName + ' has completed the journey.')); }); };
  }

  /* ---------- start ---------- */
  function start() { if (/[?&]fu=1/.test(location.search) && window.dashOpen) window.dashOpen('followups'); store.init().then(store.user).then(function (u) { if (!u) return render('signin');
    return store.getVault().then(function (v) { vault = v; render(v ? 'unlock' : 'create'); }); })
    .catch(function (er) { shell('<p class="fx-msg">Follow ups could not load: ' + e(er.message || er) + '</p>'); }); }
  window.FollowUpsUI = { mount: function (el) { root = el; start(); }, open: function (id) { journey(id); } };
  var host = document.getElementById('fx-root'); if (host && !window.FU_DEFER) window.FollowUpsUI.mount(host);
})();
