/* Car Tinder app. Plain JS, relative paths, no build step, so it can be
   wrapped later with Capacitor or PWABuilder. Platform specific bits (push,
   install, haptics, deep links, share) sit behind `platform` below.
   Data goes through `store`: 'demo' keeps everything on the device,
   'supabase' talks to the real backend (see backend/supabase/schema.sql). */
(function () {
  'use strict';
  var CFG = window.CT_CONFIG || {}, M = window.ctMatch;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function track(n, p) { try { if (window.gtag) window.gtag('event', 'car_tinder_' + n, p || {}); } catch (e) {} (window.__ctEvents = window.__ctEvents || []).push('car_tinder_' + n); }
  function toast(t) { var el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2600); }
  var uuid = function () { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })); };
  var fmtDate = function (d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  function addMonths(d, n) { var x = new Date(d + 'T12:00:00'); var day = x.getDate(); x.setMonth(x.getMonth() + n); if (x.getDate() < day) x.setDate(0); return x.toISOString().slice(0, 10); }
  var INS = [['gap', 'GAP insurance'], ['tyre_alloy', 'Tyre and alloy insurance'], ['cosmetic', 'Cosmetic repair insurance'], ['warranty', 'Warranty'], ['other', 'Other cover']];
  var INS_L = {}; INS.forEach(function (i) { INS_L[i[0]] = i[1]; });

  /* ---------------- platform ---------------- */
  var platform = {
    ios: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    standalone: (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true,
    haptic: function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) {} },
    deferredInstall: null,
    pushSupported: function () { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; },
    subscribePush: function () {
      var key = CFG.VAPID_PUBLIC_KEY; var pad = '='.repeat((4 - key.length % 4) % 4);
      var raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/')); var arr = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return Notification.requestPermission().then(function (p) {
        if (p !== 'granted') throw new Error('denied');
        return navigator.serviceWorker.ready.then(function (r) { return r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: arr }); });
      });
    },
    openExternal: function (url) { window.open(url, '_blank', 'noopener'); },
    deepLink: function () { var q = new URLSearchParams(location.search); return { reg: M.normReg(q.get('reg') || ''), login: q.get('login') || '', claim: q.get('claim') || '' }; }
  };
  window.ctPlatform = platform;

  /* ---------------- store ---------------- */
  var LS = 'ctDemoV1';
  function demoDb() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } }
  function demoSave(d) { try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) { toast('This phone is out of storage space'); } }
  var demo = {
    mode: 'demo',
    session: function () { return Promise.resolve(demoDb().session || null); },
    signIn: function (role, email) {
      var d = demoDb(); var uid = 'demo-' + role;
      d.session = { uid: uid, role: role, email: email || (role === 'admin' ? 'dan@demo.local' : role === 'staff' ? 'colleague@demo.local' : 'you@demo.local'),
        name: role === 'admin' ? 'Dan' : role === 'staff' ? 'Demo colleague' : '', whatsapp: role === 'admin' ? CFG.DAN_WA : role === 'staff' ? '' : '' };
      d.customers = d.customers || []; d.swipes = d.swipes || {}; d.purchases = d.purchases || []; d.invites = d.invites || []; d.staff = d.staff || {};
      d.staff[uid] = d.staff[uid] || (role !== 'customer' ? { id: uid, name: d.session.name, email: d.session.email, whatsapp: d.session.whatsapp } : null);
      if (role === 'customer' && !d.customers.some(function (c) { return c.user_id === uid; })) d.customers.push({ id: uuid(), user_id: uid, owner_staff_id: null, email: d.session.email, created_at: new Date().toISOString() });
      demoSave(d); return Promise.resolve(d.session);
    },
    signOut: function () { var d = demoDb(); delete d.session; demoSave(d); return Promise.resolve(); },
    visible: function (d, c) { var s = d.session; if (!s) return false; return s.role === 'admin' || (s.role === 'staff' && c.owner_staff_id === s.uid) || c.user_id === s.uid; },
    customers: function () { var d = demoDb(); return Promise.resolve((d.customers || []).filter(function (c) { return demo.visible(d, c); })); },
    saveCustomer: function (c) { var d = demoDb(); var s = d.session; var i = (d.customers || []).findIndex(function (x) { return x.id === c.id; });
      if (i === -1) { c.id = c.id || uuid(); c.owner_staff_id = s.role === 'customer' ? null : s.uid; c.created_at = new Date().toISOString(); d.customers.push(c); }
      else { if (!demo.visible(d, d.customers[i])) return Promise.reject(new Error('no access')); c.owner_staff_id = d.customers[i].owner_staff_id; c.user_id = d.customers[i].user_id; d.customers[i] = c; }
      c.updated_at = new Date().toISOString(); demoSave(d); return Promise.resolve(c); },
    swipes: function (cid) { return Promise.resolve((demoDb().swipes || {})[cid] || {}); },
    setSwipe: function (cid, reg, liked, extra) { var d = demoDb(); d.swipes[cid] = d.swipes[cid] || {}; d.swipes[cid][reg] = Object.assign({ liked: liked, at: Date.now() }, extra || {}); demoSave(d); return Promise.resolve(); },
    purchases: function (cid) { return Promise.resolve((demoDb().purchases || []).filter(function (p) { return p.customer_id === cid; })); },
    savePurchase: function (p) { var d = demoDb(); p.id = p.id || uuid(); p.remind_on = addMonths(p.purchase_date, 33); d.purchases = (d.purchases || []).filter(function (x) { return x.id !== p.id; }); d.purchases.push(p); demoSave(d); return Promise.resolve(p); },
    staffList: function () { var d = demoDb(); return Promise.resolve(Object.values(d.staff || {}).filter(Boolean)); },
    invites: function () { return Promise.resolve(demoDb().invites || []); },
    invite: function (inv) { var d = demoDb(); inv.id = uuid(); inv.created_at = new Date().toISOString(); d.invites.push(inv); demoSave(d); return Promise.resolve(inv); },
    uploadPx: function (cid, file) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res({ preview: r.result, link: '' }); }; r.readAsDataURL(file); }); },
    setNotify: function (v) { var d = demoDb(); d.notify = v; demoSave(d); return Promise.resolve(); },
    notify: function () { return Promise.resolve(demoDb().notify || 'push'); },
    savePush: function () { return Promise.resolve(false); },
    owner: function (c) { var d = demoDb(); return Promise.resolve(c && c.owner_staff_id ? (d.staff || {})[c.owner_staff_id] || null : null); }
  };

  var sb = null, sbUser = null, sbProfile = null;
  var supa = {
    mode: 'supabase',
    init: function () { return import('https://esm.sh/@supabase/supabase-js@2').then(function (m) { sb = m.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }); }); },
    session: function () { return sb.auth.getSession().then(function (r) { sbUser = r.data.session && r.data.session.user; if (!sbUser) return null;
      return sb.from('profiles').select('*').eq('id', sbUser.id).single().then(function (p) { sbProfile = p.data; return { uid: sbUser.id, role: p.data.role, email: p.data.email, name: p.data.name, whatsapp: p.data.whatsapp }; }); }); },
    sendLink: function (email) { return sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + location.pathname } }).then(function (r) { if (r.error) throw r.error; }); },
    signOut: function () { return sb.auth.signOut(); },
    customers: function () { return sb.from('customers').select('*').order('created_at', { ascending: false }).then(function (r) { if (r.error) throw r.error; return r.data; }); },
    saveCustomer: function (c) { var row = Object.assign({}, c); delete row.px_photos_preview; if (!row.id) { row.owner_staff_id = sbProfile.role === 'customer' ? null : sbUser.id; if (sbProfile.role === 'customer') row.user_id = sbUser.id; }
      return sb.from('customers').upsert(row).select().single().then(function (r) { if (r.error) throw r.error; return r.data; }); },
    swipes: function (cid) { return sb.from('swipes').select('*').eq('customer_id', cid).then(function (r) { var o = {}; (r.data || []).forEach(function (s) { o[s.reg] = s; }); return o; }); },
    setSwipe: function (cid, reg, liked, extra) { return sb.from('swipes').upsert(Object.assign({ customer_id: cid, reg: reg, liked: liked, by_user: sbUser.id }, extra || {})); },
    purchases: function (cid) { return sb.from('purchases').select('*').eq('customer_id', cid).then(function (r) { return r.data || []; }); },
    savePurchase: function (p) { var row = Object.assign({}, p); delete row.remind_on; row.created_by = sbUser.id; return sb.from('purchases').upsert(row).select().single().then(function (r) { if (r.error) throw r.error; return r.data; }); },
    staffList: function () { return sb.from('profiles').select('id,name,email,whatsapp,role').in('role', ['staff', 'admin']).then(function (r) { return r.data || []; }); },
    invites: function () { return sb.from('staff_invites').select('*').order('created_at', { ascending: false }).then(function (r) { return r.data || []; }); },
    invite: function (inv) { inv.invited_by = sbUser.id; return sb.from('staff_invites').insert(inv).then(function (r) { if (r.error) throw r.error; }); },
    uploadPx: function (cid, file) { var path = cid + '/' + uuid() + '.' + ((file.type.split('/')[1]) || 'jpg');
      return sb.storage.from('px').upload(path, file, { contentType: file.type }).then(function (r) { if (r.error) throw r.error;
        return sb.storage.from('px').createSignedUrl(path, 30 * 86400); }).then(function (s) { return { path: path, link: s.data.signedUrl, preview: URL.createObjectURL(file) }; }); },
    setNotify: function (v) { return sb.from('profiles').update({ notify_push: v === 'push' || v === 'both', notify_email: v === 'email' || v === 'both' }).eq('id', sbUser.id); },
    notify: function () { var p = sbProfile || {}; return Promise.resolve(p.notify_push && p.notify_email ? 'both' : p.notify_push ? 'push' : p.notify_email ? 'email' : 'off'); },
    savePush: function (sub) { var j = sub.toJSON(); return sb.from('push_subscriptions').upsert({ user_id: sbUser.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' }).then(function () { return true; }); },
    owner: function (c) { if (!c || !c.owner_staff_id) return Promise.resolve(null); return sb.rpc('customer_whatsapp', { cid: c.id }).then(function (r) { return { whatsapp: r.data, name: '', email: '' }; }); },
    claim: function (id) { return sb.rpc('claim_customer', { claim: id }); }
  };
  var LIVE = CFG.MODE === 'supabase' && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY;
  var store = LIVE ? supa : demo;

  /* ---------------- state ---------------- */
  var S = { session: null, cust: null, owner: null, cars: [], newRange: [], deck: [], swipes: {}, pxPhotos: [], generated: '' };

  /* ---------------- data ---------------- */
  function loadStock() {
    var stock = fetch('../lookup/stock.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) {
      S.generated = d.generated_at; S.cars = Object.keys(d.cars).map(function (k) { var c = d.cars[k]; c.kind = 'used'; return c; }); });
    var range = fetch('../MBG.html', { cache: 'no-cache' }).then(function (r) { return r.text(); }).then(function (h) {
      var doc = new DOMParser().parseFromString(h, 'text/html'); var out = [];
      $$('#new details.mbg-acc', doc).forEach(function (det) {
        var group = ($('.mbg-acc-t', det) || {}).textContent || '';
        $$('a.mbg-chip', det).forEach(function (a) { var name = a.textContent.trim(); out.push(newCar(name, group)); });
      });
      S.newRange = out;
    }).catch(function () { S.newRange = []; });
    return Promise.all([stock, range]);
  }
  /* body and fuel for a new model, only from its name and MBG.html group */
  function newCar(name, group) {
    var n = name.toLowerCase(), b = [], f = [];
    if (/^i/.test(n) || /electric/i.test(group)) f.push('electric');
    if (/^(x|ix)\d|^xm/.test(n)) b.push('suv');
    if (/touring/.test(n)) b.push('touring'); if (/gran coup/.test(n)) b.push('gran_coupe'); else if (/coup/.test(n)) b.push('coupe');
    if (/convertible/.test(n)) b.push('convertible'); if (/active tourer/.test(n)) b.push('mpv'); if (/saloon/.test(n)) b.push('saloon');
    if (/^1 series|^m135/.test(n)) b.push('hatchback'); if (/^i3$|^i4|^i5|^i7/.test(n) && !b.length) b.push('saloon');
    var series = (name.match(/^(\d Series|i\d|iX\d?|X\d|XM|M\d)/i) || [name])[0];
    return { kind: 'new', reg: 'NEW-' + name.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase(), model: 'BMW ' + name, series: series, group: group, bodyKeys: b, fuelKeys: f };
  }
  function allModels() {
    var seen = {}, out = [];
    S.cars.forEach(function (c) { if (c.series && !seen[c.series]) { seen[c.series] = 1; out.push(c.series); } });
    S.newRange.forEach(function (c) { if (c.series && !seen[c.series]) { seen[c.series] = 1; out.push(c.series); } });
    return out.sort(function (a, b) { return a.localeCompare(b, 'en', { numeric: true }); });
  }
  function pool() { return S.cars.concat(S.newRange); }
  function byReg(reg) { return pool().find(function (c) { return c.reg === reg; }); }
  function waNum() { return (S.owner && S.owner.whatsapp) || CFG.DAN_WA; }
  function waWho() { return S.owner && S.owner.name ? S.owner.name.split(' ')[0] : (S.cust && S.cust.owner_staff_id ? '' : 'Dan'); }

  /* ---------------- routing ---------------- */
  var SCREENS = ['signin', 'profile', 'discover', 'matches', 'me', 'bought', 'team', 'invites'];
  function go(name) { if (location.hash !== '#' + name) location.hash = name; else route(); }
  function route() {
    var h = (location.hash || '').slice(1) || (S.session ? 'discover' : 'signin');
    if (!S.session) h = 'signin';
    if (SCREENS.indexOf(h) === -1) h = 'discover';
    var staff = S.session && S.session.role !== 'customer';
    if ((h === 'team' || h === 'invites') && !staff) h = 'discover';
    if (h === 'invites' && S.session.role !== 'admin') h = 'team';
    if (S.session && !S.cust && ['discover', 'matches', 'bought', 'me'].indexOf(h) !== -1) h = staff ? 'team' : 'profile';
    if (S.session && S.cust && !S.cust.name && !staff && h !== 'profile') h = 'profile';
    $$('.ct-screen').forEach(function (s) { s.hidden = s.getAttribute('data-screen') !== h; });
    $('#nav').hidden = !S.session;
    $$('[data-nav]').forEach(function (a) { if (a.getAttribute('data-nav') === h) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $$('[data-staff-only]').forEach(function (e) { e.hidden = !staff; });
    var act = $('#acting'); act.hidden = !(staff && S.cust); if (S.cust) act.textContent = 'For ' + (S.cust.name || 'new customer');
    window.scrollTo(0, 0);
    ({ profile: showProfile, discover: showDeck, matches: showMatches, me: showMe, bought: showBought, team: showTeam, invites: showInvites }[h] || function () {})();
  }
  window.addEventListener('hashchange', route);

  /* ---------------- sign in ---------------- */
  function initSignin() {
    $('#demoBox').hidden = LIVE; $('#demoBar').hidden = LIVE;
    $('#signinForm').addEventListener('submit', function (e) {
      e.preventDefault(); var em = $('#siEmail').value.trim(), msg = $('#siMsg');
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(em)) { msg.textContent = 'Please enter a valid email.'; return; }
      if (!LIVE) { msg.textContent = 'Demo mode: no email is sent. Use the button below to carry on.'; $('#demoBox').hidden = false; return; }
      msg.textContent = 'Sending...';
      store.sendLink(em).then(function () { msg.className = 'ct-msg ok'; msg.textContent = 'Check your inbox for the sign in link. It works once.'; track('sign_in_link_sent'); })
        .catch(function () { msg.textContent = 'That did not send. Try again, or WhatsApp me on 07827 138197.'; });
    });
    $$('[data-demo]').forEach(function (b) { b.addEventListener('click', function () {
      store.signIn(b.getAttribute('data-demo'), $('#siEmail').value.trim()).then(afterSignIn); track('sign_in', { method: 'demo', role: b.getAttribute('data-demo') }); }); });
  }
  function afterSignIn(sess) {
    S.session = sess; if (!sess) { route(); return; }
    var staff = sess.role !== 'customer';
    return store.customers().then(function (list) {
      if (!staff) S.cust = list[0] || null;
      else { var last = sessionStorage.getItem('ctActing'); S.cust = list.find(function (c) { return c.id === last; }) || null; }
      return loadCust();
    }).then(function () { if (!location.hash || location.hash === '#signin') location.hash = staff ? 'team' : (S.cust && S.cust.name ? 'discover' : 'profile'); else route(); iosNudge(); });
  }
  function loadCust() {
    if (!S.cust) { S.swipes = {}; S.owner = null; return Promise.resolve(); }
    return Promise.all([store.swipes(S.cust.id), store.owner(S.cust)]).then(function (r) { S.swipes = r[0]; S.owner = r[1]; badge(); });
  }

  /* ---------------- profile form ---------------- */
  function bindChoice(root) {
    $$('.ct-seg[data-name], .ct-chips[data-name]', root).forEach(function (g) {
      g.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return;
        if (g.classList.contains('ct-multi')) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
        else $$('button', g).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        platform.haptic(8); showDeps(root); });
    });
  }
  function choice(root, name) { var g = $('[data-name="' + name + '"]', root); if (!g) return null;
    var on = $$('button[aria-pressed=true]', g).map(function (b) { return b.getAttribute('data-v'); }); return g.classList.contains('ct-multi') ? on : (on[0] || null); }
  function setChoice(root, name, v) { var g = $('[data-name="' + name + '"]', root); if (!g) return; var vs = [].concat(v == null ? [] : v);
    $$('button', g).forEach(function (b) { b.setAttribute('aria-pressed', vs.indexOf(b.getAttribute('data-v')) !== -1 ? 'true' : 'false'); }); }
  function showDeps(root) { $$('[data-show]', root).forEach(function (el) { var m = el.getAttribute('data-show').match(/^(\w+)(!?=)(\w+)$/); var v = choice(root, m[1]);
    el.hidden = m[2] === '=' ? v !== m[3] : (v === m[3] || !v); }); }
  function showProfile() {
    var f = $('#profileForm'), c = S.cust || {}, staff = S.session.role !== 'customer';
    $('#pfTitle').textContent = staff ? (c.id ? 'Edit ' + (c.name || 'customer') : 'Add a customer') : 'About you';
    $('#pfSub').textContent = staff ? 'Fill in what the customer told you. Their matches, swipes and photos stay visible to you and Dan only.' : 'Takes a minute. The more you tell me, the better your matches.';
    var mc = $('#modelChips'); mc.innerHTML = allModels().map(function (m) { return '<button type="button" data-v="' + esc(m) + '">' + esc(m) + '</button>'; }).join('');
    ['name', 'phone', 'email', 'postcode', 'monthly_gbp', 'cash_gbp', 'deposit_gbp'].forEach(function (k) { if (f.elements[k]) f.elements[k].value = c[k] == null ? '' : c[k]; });
    f.elements.annual_mileage.value = String(c.annual_mileage || 8000);
    setChoice(f, 'budget_type', c.budget_type || 'monthly'); setChoice(f, 'fuel', c.fuel || 'open'); setChoice(f, 'body', c.body || 'any');
    setChoice(f, 'models', c.models || []); setChoice(f, 'new_used', c.new_used || 'both');
    var px = c.px || {}; setChoice(f, 'px_has', px.reg ? 'yes' : 'no');
    f.elements.px_reg.value = px.reg || ''; f.elements.px_mileage.value = px.mileage || ''; f.elements.px_condition.value = px.condition || ''; f.elements.px_finance.value = px.finance_outstanding == null ? '' : px.finance_outstanding;
    S.pxPhotos = (px.photos || []).slice(); drawThumbs(); showDeps(f);
    $('#pfSave').textContent = staff ? 'Save and find matches' : 'Find my match';
  }
  function drawThumbs() { $('#pxThumbs').innerHTML = S.pxPhotos.map(function (p) { return p.preview ? '<img src="' + esc(p.preview) + '" alt="Part exchange photo">' : '<span class="ct-pill">Photo saved</span>'; }).join(''); }
  function initProfile() {
    var f = $('#profileForm'); bindChoice(f);
    $('#pxFile').addEventListener('change', function (e) {
      var files = [].slice.call(e.target.files || []).slice(0, 6); var cid = (S.cust && S.cust.id) || (S.pendingId = S.pendingId || uuid());
      $('#pfMsg').textContent = 'Adding photos...';
      Promise.all(files.map(function (fl) { return store.uploadPx(cid, fl); })).then(function (r) { S.pxPhotos = S.pxPhotos.concat(r); drawThumbs(); $('#pfMsg').textContent = ''; })
        .catch(function () { $('#pfMsg').textContent = 'A photo did not upload. You can send photos on WhatsApp instead.'; });
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); var el = f.elements, msg = $('#pfMsg'), staff = S.session.role !== 'customer';
      if (!el.name.value.trim() || !el.phone.value.trim() || !el.postcode.value.trim()) { msg.textContent = 'Name, mobile and postcode please.'; return; }
      var c = Object.assign({}, S.cust || {}, { id: (S.cust && S.cust.id) || S.pendingId || undefined, name: el.name.value.trim(), phone: el.phone.value.trim(), postcode: el.postcode.value.trim().toUpperCase(),
        budget_type: choice(f, 'budget_type'), monthly_gbp: +el.monthly_gbp.value || null, cash_gbp: +el.cash_gbp.value || null, deposit_gbp: +el.deposit_gbp.value || null,
        annual_mileage: +el.annual_mileage.value, fuel: choice(f, 'fuel'), body: choice(f, 'body'), models: choice(f, 'models'), new_used: choice(f, 'new_used') });
      if (staff) c.email = el.email.value.trim() || null;
      c.px = choice(f, 'px_has') === 'yes' ? { reg: M.normReg(el.px_reg.value), mileage: +el.px_mileage.value || null, condition: el.px_condition.value, finance_outstanding: el.px_finance.value === '' ? null : +el.px_finance.value,
        photos: S.pxPhotos.map(function (p) { return LIVE ? { path: p.path, link: p.link } : p; }) } : null;
      store.saveCustomer(c).then(function (saved) { S.cust = saved; S.pendingId = null; sessionStorage.setItem('ctActing', saved.id); track('profile_saved', { by: staff ? 'staff' : 'customer' }); return loadCust(); })
        .then(function () { S.deck = []; go('discover'); }).catch(function () { msg.textContent = 'That did not save. Please try again.'; });
    });
  }

  /* ---------------- deck ---------------- */
  function buildDeck() {
    var ranked = M.rank(pool(), S.cust || {});
    if (!ranked.length) ranked = M.rank(pool(), { new_used: (S.cust || {}).new_used });
    var deep = platform.deepLink().reg; var seen = S.swipes;
    S.deck = ranked.filter(function (x) { return !seen[x.car.reg]; });
    if (deep) { var i = S.deck.findIndex(function (x) { return x.car.reg === deep; }); if (i > 0) S.deck.unshift(S.deck.splice(i, 1)[0]); }
  }
  function cardHtml(x) {
    var c = x.car, f = M.finance(c), isNew = c.kind === 'new';
    var img = isNew ? '<div class="ct-img ct-noimg">' + esc(c.model.replace(/^BMW /, '')) + '</div>' : (c.image ? '<div class="ct-img" style="background-image:url(\'' + esc(c.image) + '\')"></div>' : '<div class="ct-img ct-noimg">No photo yet</div>');
    var src = isNew ? 'Brand new' : c.source === 'group' ? 'I can source this one' : 'On my forecourt';
    var tags = isNew ? [c.group] : [c.year, c.mileage, c.fuel, c.gearbox];
    var money = isNew ? '<div class="ct-mon">Ordered to your spec, or from new stock. I quote new car figures live.</div>'
      : '<div class="ct-price">' + esc(c.price || 'Price on request') + '</div>' + (f ? '<div class="ct-mon">' + esc(f.headline) + '</div><p class="ct-rep"><b>Representative example.</b> ' + esc(f.example) + '</p>' : '<div class="ct-mon">Monthly: ask for a quote</div>');
    return img + '<div class="ct-shade"></div><div class="ct-score"><b>' + x.score + '%</b> match</div><div class="ct-src">' + esc(src) + '</div>' +
      '<div class="ct-stamp ct-stamp-like">LIKE</div><div class="ct-stamp ct-stamp-nope">NOPE</div>' +
      '<div class="ct-meta"><h3>' + esc(c.model) + '</h3><div class="ct-tags">' + tags.filter(Boolean).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') +
      x.reasons.map(function (r) { return '<span>&#10003; ' + esc(r) + '</span>'; }).join('') + '</div>' + money + '</div>';
  }
  function showDeck() { if (!S.deck.length) buildDeck(); drawDeck(); }
  function drawDeck() {
    var deck = $('#deck'); deck.innerHTML = '';
    var top = S.deck.slice(0, 3);
    $('#deckEmpty').hidden = !!top.length; $('#deckActions').hidden = !top.length; deck.hidden = !top.length;
    top.slice().reverse().forEach(function (x, i, arr) {
      var el = document.createElement('div'); el.className = 'ct-card'; el.innerHTML = cardHtml(x); el.dataset.reg = x.car.reg;
      var depth = arr.length - 1 - i; el.style.transform = 'translateY(' + depth * 10 + 'px) scale(' + (1 - depth * 0.04) + ')'; el.style.zIndex = 10 - depth;
      if (depth === 0) drag(el, x); deck.appendChild(el);
    });
  }
  function drag(el, x) {
    var sx = 0, sy = 0, dx = 0, dy = 0, t0 = 0, down = false, lastX = 0, lastT = 0, vx = 0;
    var like = $('.ct-stamp-like', el), nope = $('.ct-stamp-nope', el);
    function set() { el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + dx * 0.06 + 'deg)'; like.style.opacity = Math.max(0, Math.min(1, dx / 100)); nope.style.opacity = Math.max(0, Math.min(1, -dx / 100)); }
    el.addEventListener('pointerdown', function (e) { down = true; sx = e.clientX; sy = e.clientY; t0 = lastT = performance.now(); lastX = e.clientX; el.style.transition = 'none'; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; });
    el.addEventListener('pointermove', function (e) { if (!down) return; dx = e.clientX - sx; dy = (e.clientY - sy) * 0.4; var now = performance.now(); vx = (e.clientX - lastX) / Math.max(1, now - lastT); lastX = e.clientX; lastT = now; set(); });
    function up() { if (!down) return; down = false; el.style.cursor = '';
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && performance.now() - t0 < 300) { dx = dy = 0; set(); openSheet(x); return; }
      if (dx > 110 || vx > 0.6) fling(el, x, 1, vx); else if (dx < -110 || vx < -0.6) fling(el, x, -1, vx);
      else { el.style.transition = 'transform .45s cubic-bezier(.2,1.5,.4,1)'; dx = dy = 0; set(); like.style.opacity = nope.style.opacity = 0; } }
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el._fling = function (dir) { fling(el, x, dir, 0); };
  }
  function fling(el, x, dir, v) {
    var w = window.innerWidth; el.style.transition = 'transform .38s cubic-bezier(.3,.7,.4,1)';
    var tx = dir * (w + 200), rot = dir * (30 + Math.min(20, Math.abs(v) * 10));
    el.style.transform = 'translate(' + tx + 'px,-40px) rotate(' + rot + 'deg)';
    $(dir > 0 ? '.ct-stamp-like' : '.ct-stamp-nope', el).style.opacity = 1;
    platform.haptic(dir > 0 ? [10, 30, 16] : 10);
    setTimeout(function () { decide(x, dir > 0); }, 300);
  }
  function decide(x, liked) {
    S.deck.shift(); S.swipes[x.car.reg] = { liked: liked, at: Date.now() };
    store.setSwipe(S.cust.id, x.car.reg, liked).catch(function () {});
    track(liked ? 'swipe_right' : 'swipe_left', { reg: x.car.kind === 'new' ? '' : x.car.reg, kind: x.car.kind, score: x.score });
    drawDeck(); badge();
    if (liked) { var likes = Object.keys(S.swipes).filter(function (r) { return S.swipes[r].liked; }).length; if (likes === 1 || x.score >= 75) matchMoment(x); else toast('Added to your matches'); }
  }
  function matchMoment(x) {
    var c = x.car, m = $('#matchModal'); var mm = $('#mmCar');
    if (c.image) { mm.src = c.image; mm.hidden = false; } else mm.hidden = true;
    $('#mmText').textContent = S.session.role !== 'customer' ? (S.cust.name || 'Your customer') + ' and the ' + c.model + ' look made for each other.' : 'You and the ' + c.model + ' look made for each other.';
    var a = $('#mmWa'); a.href = M.waLink(waNum(), c, waWho()); a.textContent = 'Message ' + (waWho() || 'me') + ' on WhatsApp';
    m.hidden = false; confetti($('#confetti')); platform.haptic([20, 40, 20, 40, 60]); track('match', { kind: c.kind, score: x.score });
  }
  function confetti(cv) {
    var ctx = cv.getContext('2d'), W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
    var cols = ['#ff4f7b', '#1c69d4', '#ffffff', '#ffd166', '#3ce07f'], P = [];
    for (var i = 0; i < 160; i++) P.push({ x: W / 2, y: H * 0.42, vx: (Math.random() - 0.5) * 22 * devicePixelRatio, vy: (-Math.random() * 18 - 6) * devicePixelRatio, r: (4 + Math.random() * 6) * devicePixelRatio, c: cols[i % 5], a: Math.random() * 6, s: Math.random() * 0.3 - 0.15 });
    var t = 0; (function f() { ctx.clearRect(0, 0, W, H); P.forEach(function (p) { p.vy += 0.5 * devicePixelRatio; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.s;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); });
      if (++t < 150 && !$('#matchModal').hidden) requestAnimationFrame(f); else ctx.clearRect(0, 0, W, H); })();
  }
  function openSheet(x) {
    var c = x.car, f = M.finance(c), isNew = c.kind === 'new';
    var imgs = (c.images && c.images.length ? c.images : c.image ? [c.image] : []);
    var specs = isNew ? [['Range', c.group]] : [['Year', c.year], ['Mileage', c.mileage], ['Fuel', c.fuel], ['Gearbox', c.gearbox], ['Body', c.body], ['Colour', c.colour], ['Power', c.power], ['Seats', c.seats], ['Drive', c.drive], ['Reg', c.reg]];
    $('#sheetBody').innerHTML = (imgs.length ? '<div class="ct-gal">' + imgs.slice(0, 8).map(function (u) { return '<img src="' + esc(u) + '" alt="" loading="lazy">'; }).join('') + '</div>' : '') +
      '<h2>' + esc(c.model) + '</h2><p class="ct-sub">' + esc(isNew ? 'Brand new BMW, ordered to your spec or from new stock' : c.source === 'group' ? 'I can source this one' : 'On my forecourt') + '</p>' +
      '<div class="ct-specs">' + specs.filter(function (s) { return s[1]; }).map(function (s) { return '<div><span>' + s[0] + '</span>' + esc(s[1]) + '</div>'; }).join('') + '</div>' +
      (isNew ? '<p>New car figures change with allocation, so I quote them live.</p>' : '<div class="ct-price">' + esc(c.price || 'Price on request') + '</div>' + finHtml(f)) +
      '<div class="ct-row"><a class="ct-btn ct-wa" target="_blank" rel="noopener" href="' + esc(M.waLink(waNum(), c, waWho())) + '">WhatsApp ' + esc(waWho() || 'me') + '</a></div>';
    $('#sheet').hidden = false;
  }
  function finHtml(f) { return f ? '<div class="ct-repx"><b>' + esc(f.headline) + '</b><br><b>Representative example.</b> ' + esc(f.example) + '</div>' : '<p class="ct-mon">Monthly: ask for a quote</p>'; }
  function topCard() { return $('#deck .ct-card:last-child'); }
  function initDeck() {
    $('#btnLike').addEventListener('click', function () { var t = topCard(); if (t && t._fling) t._fling(1); });
    $('#btnPass').addEventListener('click', function () { var t = topCard(); if (t && t._fling) t._fling(-1); });
    $('#btnInfo').addEventListener('click', function () { if (S.deck[0]) openSheet(S.deck[0]); });
    document.addEventListener('keydown', function (e) { if ($('[data-screen=discover]').hidden || !$('#sheet').hidden) return; if (e.key === 'ArrowRight') $('#btnLike').click(); if (e.key === 'ArrowLeft') $('#btnPass').click(); });
    $$('[data-close]').forEach(function (b) { b.addEventListener('click', function () { b.closest('.ct-sheet,.ct-match,.ct-ios').hidden = true; }); });
    $('#sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') e.target.hidden = true; });
  }

  /* ---------------- matches ---------------- */
  function liked() { return Object.keys(S.swipes).filter(function (r) { return S.swipes[r].liked; }).sort(function (a, b) { return S.swipes[b].at - S.swipes[a].at; }).map(byReg).filter(Boolean); }
  function badge() { var n = liked().length, b = $('#matchBadge'); b.hidden = !n; b.textContent = n; }
  function showMatches() {
    var L = liked(), staff = S.session.role !== 'customer';
    $('#mSub').textContent = L.length ? (staff ? 'Everything ' + (S.cust.name || 'your customer') + ' liked.' : 'Every car you swiped right on. Message ' + (waWho() || 'me') + ' about any of them.') : 'No matches yet. Swipe right on a car you like.';
    $('#matchList').innerHTML = L.map(function (c) { var f = M.finance(c), isNew = c.kind === 'new';
      return '<article class="ct-m">' + (isNew ? '<div class="ct-noimg">' + esc(c.model.replace(/^BMW /, '')) + '</div>' : c.image ? '<img src="' + esc(c.image) + '" alt="' + esc(c.model) + '" loading="lazy">' : '<div class="ct-noimg">No photo yet</div>') +
        '<div class="ct-m-b"><h3>' + esc(c.model) + '</h3><p>' + esc(isNew ? 'Brand new, ' + c.group : [c.year, c.mileage, c.fuel, c.source === 'group' ? 'I can source this one' : 'On my forecourt'].filter(Boolean).join(' \u00b7 ')) + '</p>' +
        (isNew ? '<p>I quote new car figures live.</p>' : '<div class="ct-price">' + esc(c.price || 'Price on request') + '</div>' + finHtml(f)) +
        '<div class="ct-row"><a class="ct-btn ct-wa" target="_blank" rel="noopener" href="' + esc(M.waLink(waNum(), c, waWho())) + '">WhatsApp about ' + esc(isNew ? 'this model' : M.normReg(c.reg)) + '</a></div>' +
        '<button class="ct-unlike" type="button" data-unlike="' + esc(c.reg) + '">Remove from matches</button></div></article>'; }).join('');
    $('#sendBox').hidden = !L.length; $('#sendBtn').textContent = staff ? 'Send these matches to Dan' : 'Send my matches to ' + (S.owner && S.owner.name ? S.owner.name.split(' ')[0] : 'Dan');
  }
  function initMatches() {
    $('#matchList').addEventListener('click', function (e) { var b = e.target.closest('[data-unlike]'); if (!b) return; var r = b.getAttribute('data-unlike'); S.swipes[r] = { liked: false, at: Date.now() }; store.setSwipe(S.cust.id, r, false); showMatches(); badge(); });
    $('#sendBtn').addEventListener('click', sendLead);
  }
  function sendLead() {
    var c = S.cust, L = liked(), msg = $('#sendMsg'), px = c.px || {};
    var lead = 'CT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    var body = { _subject: 'Car Tinder matches: ' + (c.name || '') + ' (' + L.length + ')', form_page: 'car-tinder', lead_id: lead, name: c.name, phone: c.phone, email: c.email || S.session.email, postcode: c.postcode,
      budget: c.budget_type === 'cash' ? 'Cash up to \u00a3' + (c.cash_gbp || '?') : 'Monthly up to \u00a3' + (c.monthly_gbp || '?'), deposit: c.deposit_gbp || '', annual_mileage: c.annual_mileage,
      fuel: c.fuel, body_or_size: c.body, models_of_interest: (c.models || []).join(', '), new_or_used: c.new_used,
      px_reg: px.reg || 'None', px_mileage: px.mileage || '', px_condition: px.condition || '', px_finance_outstanding: px.finance_outstanding == null ? '' : px.finance_outstanding,
      px_photo_links: (px.photos || []).map(function (p) { return p.link; }).filter(Boolean).join(' ') || ((px.photos || []).length ? (px.photos.length + ' photo(s) on the customer device, demo mode, not uploaded') : 'None'),
      liked_regs: L.filter(function (x) { return x.kind !== 'new'; }).map(function (x) { return x.reg; }).join(', '),
      liked_new_models: L.filter(function (x) { return x.kind === 'new'; }).map(function (x) { return x.model; }).join(', '),
      liked_cars: L.map(function (x) { return x.model + (x.kind === 'new' ? ' (new)' : ' ' + x.reg + ' ' + (x.price || '')); }).join(' | '),
      owner_staff_name: S.owner ? (S.owner.name || '') : (S.session.role === 'staff' ? S.session.name : 'Dan'), owner_staff_email: S.owner ? (S.owner.email || '') : (S.session.role === 'staff' ? S.session.email : ''),
      submitted_by: S.session.role, app_mode: LIVE ? 'live' : 'demo' };
    msg.className = 'ct-msg'; msg.textContent = 'Sending...';
    fetch(CFG.FORMSPREE, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); msg.className = 'ct-msg ok'; msg.textContent = 'Sent. ' + (waWho() || 'Dan') + ' will be in touch, usually the same day.'; track('matches_sent', { count: L.length, lead_id: lead }); })
      .catch(function () { msg.textContent = 'That did not send. Tap WhatsApp on any car instead.'; });
  }

  /* ---------------- me ---------------- */
  function showMe() {
    var c = S.cust || {}, staff = S.session.role !== 'customer';
    $('#meName').textContent = staff ? (c.name || 'Customer') : (c.name || 'You'); $('#meEmail').textContent = staff ? 'Signed in as ' + S.session.email : S.session.email;
    var b = c.budget_type === 'cash' ? (c.cash_gbp ? 'Up to ' + M.gbp(c.cash_gbp) : '') : (c.monthly_gbp ? 'Up to ' + M.gbp(c.monthly_gbp) + ' a month' : '');
    $('#meSummary').innerHTML = '<dl><dt>Budget</dt><dd>' + esc(b || 'Not set') + '</dd><dt>Fuel</dt><dd>' + esc(c.fuel === 'open' ? 'Open minded' : c.fuel || '') + '</dd><dt>Models</dt><dd>' + esc((c.models || []).join(', ') || 'Any') + '</dd><dt>Part exchange</dt><dd>' + esc(c.px && c.px.reg ? c.px.reg : 'None') + '</dd></dl>';
    $('#boughtBtn').textContent = staff ? 'Record a bought car' : "I've bought my car";
    store.purchases(c.id).then(function (ps) { $('#meBought').innerHTML = ps.filter(function (p) { return !p.cancelled; }).map(purchaseHtml).join('') || '<p class="ct-sub">Nothing recorded yet.</p>'; });
    var custEmail = !!CFG.CUSTOMER_EMAIL_ENABLED || staff; $$('[data-email-opt]').forEach(function (e) { e.hidden = !custEmail; });
    store.notify().then(function (v) { if (!custEmail && (v === 'email' || v === 'both')) v = 'push'; $$('#notifySeg button').forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-v') === v ? 'true' : 'false'); }); });
    installInfo();
  }
  function purchaseHtml(p) { var ins = (p.insurances || []).map(function (i) { return (i.type === 'other' && i.label ? i.label : INS_L[i.type]) + (i.ends_on ? ', ends ' + fmtDate(i.ends_on) : ''); });
    return '<div class="ct-c"><h3>' + esc(p.model) + ' <span class="ct-pill">' + esc(p.reg) + '</span></h3><p>Bought ' + esc(fmtDate(p.purchase_date)) + ', ' + esc(String(p.finance_type).toUpperCase()) + (p.term_months ? ' over ' + esc(p.term_months) + ' months' : '') + '</p>' +
      (ins.length ? '<p>Cover: ' + esc(ins.join('; ')) + '</p>' : '') + '<p><span class="ct-pill hot">Reminder ' + esc(fmtDate(p.remind_on || addMonths(p.purchase_date, 33))) + '</span></p>' +
      '<div class="ct-row"><button class="ct-btn ct-btn-ghost ct-sm" type="button" data-edit-p="' + esc(p.id) + '">Edit</button><button class="ct-btn ct-btn-ghost ct-sm" type="button" data-cancel-p="' + esc(p.id) + '">Cancel reminder</button></div></div>'; }
  function initMe() {
    $('#notifySeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var v = b.getAttribute('data-v'); var msg = $('#notifyMsg'); msg.className = 'ct-msg';
      $$('#notifySeg button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      store.setNotify(v); track('notify_pref', { value: v });
      if (v !== 'push' && v !== 'both') { msg.textContent = v === 'off' ? 'Alerts are off.' : 'Email alerts are on.'; return; }
      if (platform.ios && !platform.standalone) { $('#iosGuide').hidden = false; msg.textContent = 'Add the app to your Home Screen first, then turn alerts on from there.'; return; }
      if (!platform.pushSupported()) { msg.textContent = 'This browser does not support phone alerts.'; return; }
      platform.subscribePush().then(function (sub) { return store.savePush(sub); }).then(function (saved) { msg.className = 'ct-msg ok'; msg.textContent = saved ? 'Alerts are on. I will tell you when a new car fits.' : 'Alerts allowed on this phone. They start once the backend is connected (demo mode).'; track('push_enabled'); })
        .catch(function () { msg.textContent = 'Alerts were not allowed. You can switch them on in your phone settings.'; }); });
    $('#meBought').addEventListener('click', purchaseClick);
    $('#signOut').addEventListener('click', function () { store.signOut().then(function () { S.session = S.cust = null; sessionStorage.removeItem('ctActing'); location.hash = 'signin'; }); });
  }
  function purchaseClick(e) {
    var ed = e.target.closest('[data-edit-p]'), ca = e.target.closest('[data-cancel-p]'); if (!ed && !ca) return;
    var id = (ed || ca).getAttribute(ed ? 'data-edit-p' : 'data-cancel-p'); var cid = (ed || ca).closest('[data-cid]'); cid = cid ? cid.getAttribute('data-cid') : S.cust.id;
    var pre = cid !== (S.cust && S.cust.id) ? setActing(cid) : Promise.resolve();
    pre.then(function () { return store.purchases(S.cust.id); }).then(function (ps) { var p = ps.find(function (x) { return x.id === id; }); if (!p) return;
      if (ca) { if (!confirm('Cancel the reminder for ' + p.reg + '?')) return; p.cancelled = true; store.savePurchase(p).then(function () { toast('Reminder cancelled'); route(); }); }
      else { S.editPurchase = p; go('bought'); } });
  }

  /* ---------------- bought ---------------- */
  function showBought() {
    var f = $('#boughtForm'), p = S.editPurchase || {}, staff = S.session.role !== 'customer';
    $('#boughtSub').textContent = staff ? 'Record what ' + (S.cust.name || 'the customer') + ' bought. You get a reminder email 33 months from the purchase date.' : 'Congratulations. Save the details and I will remind you when you may be able to change it.';
    f.elements.reg.value = p.reg || ''; f.elements.model.value = p.model || ''; f.elements.purchase_date.value = p.purchase_date || new Date().toISOString().slice(0, 10); f.elements.term_months.value = p.term_months || '';
    setChoice(f, 'finance_type', p.finance_type || 'pcp');
    var have = {}; (p.insurances || []).forEach(function (i) { have[i.type] = i; });
    $('#insList').innerHTML = INS.map(function (i) { var h = have[i[0]]; return '<label><input type="checkbox" value="' + i[0] + '"' + (h ? ' checked' : '') + '> ' + i[1] +
      (i[0] === 'other' ? ' <input type="text" data-ins-label placeholder="Name it" value="' + esc(h && h.label || '') + '">' : '') +
      '<span class="ct-end">Ends <input type="date" data-ins-end value="' + esc(h && h.ends_on || '') + '"></span></label>'; }).join('');
    showDeps(f); remPreview();
  }
  function remPreview() { var f = $('#boughtForm'), d = f.elements.purchase_date.value; $('#remPreview').innerHTML = d ? 'Reminder on <b>' + esc(fmtDate(addMonths(d, 33))) + '</b>: you may be able to change your car then, and it is a good time to check any cover you hold before it ends.' : ''; }
  function initBought() {
    var f = $('#boughtForm'); bindChoice(f); f.elements.purchase_date.addEventListener('change', remPreview);
    f.addEventListener('submit', function (e) { e.preventDefault(); var el = f.elements, msg = $('#boughtMsg');
      if (!el.reg.value.trim() || !el.model.value.trim() || !el.purchase_date.value) { msg.textContent = 'Reg, model and date please.'; return; }
      var ins = $$('#insList label').filter(function (l) { return $('input[type=checkbox]', l).checked; }).map(function (l) { var t = $('input[type=checkbox]', l).value; var o = { type: t, label: t === 'other' ? ($('[data-ins-label]', l).value.trim() || 'Other cover') : INS_L[t] };
        var end = $('[data-ins-end]', l).value; if (end) o.ends_on = end; return o; });
      var ft = choice(f, 'finance_type');
      var p = Object.assign({}, S.editPurchase || {}, { customer_id: S.cust.id, reg: M.normReg(el.reg.value), model: el.model.value.trim(), purchase_date: el.purchase_date.value, finance_type: ft, term_months: ft === 'cash' ? null : (+el.term_months.value || null), insurances: ins, cancelled: false });
      store.savePurchase(p).then(function () { S.editPurchase = null; track('bought_saved', { finance_type: ft, by: S.session.role }); toast('Saved. Reminder set for ' + fmtDate(addMonths(p.purchase_date, 33))); go(S.session.role === 'customer' ? 'me' : 'team'); })
        .catch(function () { msg.textContent = 'That did not save. Please try again.'; }); });
  }

  /* ---------------- staff ---------------- */
  function setActing(id) { return store.customers().then(function (l) { S.cust = l.find(function (c) { return c.id === id; }) || null; sessionStorage.setItem('ctActing', id); S.deck = []; return loadCust(); }); }
  function showTeam() {
    var admin = S.session.role === 'admin';
    $('#teamTitle').textContent = admin ? 'All customers' : 'My customers'; $('#ownerFilterWrap').hidden = !admin; $('#invitesLink').hidden = !admin;
    Promise.all([store.customers(), store.staffList(), demoDb && store.mode === 'demo' ? Promise.resolve(demoDb().swipes || {}) : Promise.resolve(null)]).then(function (r) {
      var list = r[0], staff = r[1], sw = r[2] || {}, names = {}; staff.forEach(function (s) { names[s.id] = s.name || s.email; });
      var of = $('#ownerFilter'); if (admin) { var cur = of.value; of.innerHTML = '<option value="">Everyone</option><option value="none">Dan direct</option>' + staff.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name || s.email) + '</option>'; }).join(''); of.value = cur; }
      var fv = admin ? of.value : ''; list = list.filter(function (c) { return !fv || (fv === 'none' ? !c.owner_staff_id : c.owner_staff_id === fv); });
      var since = Date.now() - 2 * 86400000;
      return Promise.all(list.map(function (c) { return Promise.all([store.purchases(c.id), r[2] ? Promise.resolve(sw[c.id] || {}) : store.swipes(c.id)]).then(function (x) { return { c: c, ps: x[0], sw: x[1] }; }); })).then(function (rows) {
        $('#custList').innerHTML = rows.map(function (row) { var c = row.c; var ranked = M.rank(S.cars.filter(function (car) { return !row.sw[car.reg]; }), c).filter(function (x) { return x.score >= 55; });
          var freshN = ranked.filter(function (x) { return S.fresh && S.fresh[x.car.reg]; }).length; var likes = Object.keys(row.sw).filter(function (k) { return row.sw[k].liked; }).length;
          var p = row.ps.filter(function (x) { return !x.cancelled; })[0];
          return '<div class="ct-c" data-cid="' + esc(c.id) + '"><h3>' + esc(c.name || 'Unnamed') + '</h3><p>' + esc([c.phone, c.postcode].filter(Boolean).join(' \u00b7 ')) + (admin ? ' \u00b7 Owner: ' + esc(c.owner_staff_id ? names[c.owner_staff_id] || 'Colleague' : 'Dan direct') : '') + '</p>' +
            '<p>' + (freshN ? '<span class="ct-pill hot">' + freshN + ' new today</span>' : '') + '<span class="ct-pill">' + ranked.length + ' matches</span><span class="ct-pill">' + likes + ' liked</span>' + (c.user_id ? '<span class="ct-pill">Claimed</span>' : '') + '</p>' +
            (p ? '<p>Bought ' + esc(p.model) + ' (' + esc(p.reg) + '). Reminder <b>' + esc(fmtDate(p.remind_on || addMonths(p.purchase_date, 33))) + '</b></p>' : '') +
            '<div class="ct-row"><button class="ct-btn ct-sm" type="button" data-act="swipe">Swipe for them</button><button class="ct-btn ct-btn-ghost ct-sm" type="button" data-act="matches">Shortlist</button><button class="ct-btn ct-btn-ghost ct-sm" type="button" data-act="edit">Edit</button><button class="ct-btn ct-btn-ghost ct-sm" type="button" data-act="bought">' + (p ? 'Edit bought car' : 'Bought') + '</button>' +
            (p ? '<button class="ct-btn ct-btn-ghost ct-sm" type="button" data-cancel-p="' + esc(p.id) + '">Cancel reminder</button>' : '') +
            (!c.user_id && c.email ? '<button class="ct-btn ct-btn-ghost ct-sm" type="button" data-act="claim">Invite to claim</button>' : '') + '</div></div>'; }).join('') || '<p class="ct-sub">No customers yet. Add your first one.</p>';
      });
    });
  }
  function initTeam() {
    $('#addCust').addEventListener('click', function () { S.cust = null; S.pendingId = null; sessionStorage.removeItem('ctActing'); S.swipes = {}; go('profile'); });
    $('#ownerFilter').addEventListener('change', showTeam);
    $('#custList').addEventListener('click', function (e) { if (e.target.closest('[data-cancel-p]')) return purchaseClick(e); var b = e.target.closest('[data-act]'); if (!b) return; var id = b.closest('[data-cid]').getAttribute('data-cid'), act = b.getAttribute('data-act');
      setActing(id).then(function () {
        if (act === 'swipe') go('discover'); else if (act === 'matches') go('matches'); else if (act === 'edit') go('profile');
        else if (act === 'bought') store.purchases(id).then(function (ps) { S.editPurchase = ps.filter(function (x) { return !x.cancelled; })[0] || null; go('bought'); });
        else if (act === 'claim') { if (!LIVE) { toast('Demo mode: the claim email is sent once the backend is connected'); return; }
          sb.from('customer_claims').insert({ customer_id: id, email: S.cust.email, created_by: sbUser.id }).select().single().then(function (r) { if (r.error) throw r.error;
            return sb.auth.signInWithOtp({ email: S.cust.email, options: { emailRedirectTo: location.origin + location.pathname + '?claim=' + r.data.id } }); }).then(function () { toast('Claim link sent to ' + S.cust.email); }).catch(function () { toast('That did not send'); }); }
      }); });
  }
  function showInvites() { store.invites().then(function (l) { $('#invList').innerHTML = l.map(function (i) { return '<div class="ct-c"><h3>' + esc(i.name) + '</h3><p>' + esc(i.email) + ' \u00b7 WhatsApp ' + esc(i.whatsapp) + '</p><p><span class="ct-pill' + (i.accepted_at ? '' : ' hot') + '">' + (i.accepted_at ? 'Signed in' : 'Invited, waiting') + '</span></p></div>'; }).join(''); }); }
  function initInvites() { $('#inviteForm').addEventListener('submit', function (e) { e.preventDefault(); var el = e.target.elements, msg = $('#invMsg');
    var inv = { name: el.name.value.trim(), email: el.email.value.trim().toLowerCase(), whatsapp: el.whatsapp.value.replace(/\D/g, '').replace(/^0/, '44') };
    if (!inv.name || !/@/.test(inv.email) || inv.whatsapp.length < 11) { msg.textContent = 'Name, email and a full WhatsApp number please.'; return; }
    store.invite(inv).then(function () { msg.className = 'ct-msg ok'; msg.textContent = LIVE ? 'Invited. They become staff when they sign in with ' + inv.email + '.' : 'Saved in demo mode. No email is sent.'; e.target.reset(); showInvites(); track('staff_invited'); })
      .catch(function () { msg.className = 'ct-msg'; msg.textContent = 'That did not save.'; }); }); }

  /* ---------------- install ---------------- */
  function installInfo() {
    var el = $('#installInfo');
    if (platform.standalone) { el.innerHTML = '<p class="ct-sub">You are using the app. Nice.</p>'; return; }
    if (platform.ios) { el.innerHTML = '<p class="ct-sub">Add Car Tinder to your Home Screen to use it like an app and get alerts.</p><button class="ct-btn ct-btn-ghost" type="button" id="iosOpen">Show me how</button>'; $('#iosOpen').onclick = function () { $('#iosGuide').hidden = false; track('ios_guide_open'); }; return; }
    el.innerHTML = platform.deferredInstall ? '<button class="ct-btn" type="button" id="instNow">Install the app</button>' : '<p class="ct-sub">Use your browser menu and choose Install app or Add to Home screen.</p>';
    if ($('#instNow')) $('#instNow').onclick = doInstall;
  }
  function doInstall() { var p = platform.deferredInstall; if (!p) return; p.prompt(); p.userChoice.then(function (c) { track('install_' + c.outcome); platform.deferredInstall = null; $('#installBtn').hidden = true; installInfo(); }); }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); platform.deferredInstall = e; $('#installBtn').hidden = false; });
  window.addEventListener('appinstalled', function () { track('installed'); $('#installBtn').hidden = true; });
  $('#installBtn').addEventListener('click', doInstall);
  function iosNudge() { if (platform.ios && !platform.standalone && !sessionStorage.getItem('ctIosSeen') && S.session) { sessionStorage.setItem('ctIosSeen', '1'); setTimeout(function () { $('#iosGuide').hidden = false; track('ios_guide_auto'); }, 1800); } }

  /* ---------------- boot ---------------- */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(function (r) { window.__ctSW = r.scope; }).catch(function () {});
  initSignin(); initProfile(); initDeck(); initMatches(); initMe(); initBought(); initTeam(); initInvites();
  var dl = platform.deepLink();
  (LIVE ? supa.init() : Promise.resolve())
    .then(function () { return loadStock(); })
    .then(function () {
      try { var prev = JSON.parse(localStorage.getItem('ctSeenRegs') || 'null'); S.fresh = {}; if (prev) { var ps = {}; prev.forEach(function (r) { ps[r] = 1; }); S.cars.forEach(function (c) { if (!ps[c.reg]) S.fresh[c.reg] = 1; }); }
        localStorage.setItem('ctSeenRegs', JSON.stringify(S.cars.map(function (c) { return c.reg; }))); } catch (e) {}
      return store.session(); })
    .then(function (sess) { if (sess && LIVE && dl.claim) return supa.claim(dl.claim).then(function () { history.replaceState(null, '', location.pathname); return store.session(); }); return sess; })
    .then(function (sess) { if (sess) track('sign_in', { method: LIVE ? 'magic_link' : 'demo', role: sess.role }); return sess ? afterSignIn(sess) : route(); })
    .then(iosNudge)
    .catch(function (e) { console.warn('Car Tinder start', e); route(); });
  window.ctDebug = { S: S, store: store, platform: platform, route: route };
})();
