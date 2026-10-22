/* Swipe Drive app. Plain JS, relative paths, no build step, so it can be
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
  function track(n, p) { try { if (window.gtag) window.gtag('event', 'swipe_drive_' + n, p || {}); } catch (e) {} (window.__ctEvents = window.__ctEvents || []).push('swipe_drive_' + n); }
  /* turn a database or network error into plain English */
  function plainErr(e) { e = e || {}; var m = String(e.message || e.error_description || e), c = String(e.code || '');
    if (/fetch|network|Failed to fetch|offline/i.test(m) && !c) return 'No connection right now. Check your signal and try again.';
    if (c === '23505' || /duplicate key/i.test(m)) return /staff_invites/.test(m) ? 'That email has already been invited.' : /user_id/.test(m) ? 'This customer already has their own profile.' : 'That already exists.';
    if (c === '42501' || /row.level security/i.test(m)) return 'Your account is not allowed to save this. Sign out and back in, and if it still fails ask Dan to check your access.';
    if (/px_needs_confirmation/.test(m)) return 'Part exchange details need the I confirm tick before they can be saved.';
    if (c === '23514' || /check constraint/i.test(m)) return 'One of the answers is not in the format the system expects (' + (m.match(/"([a-z_]+)"/) || [, 'check'])[1].replace(/_/g, ' ') + ').';
    if (c === '22P02' || /invalid input/i.test(m)) return 'One of the numbers or dates is not valid. Check the highlighted fields.';
    if (c === 'PGRST204' || c === '42703' || /column .* does not exist|schema cache/i.test(m)) return 'That did not save just now. Please try again in a minute, or WhatsApp Dan on 07827 138197.';
    if (/JWT|expired|not authenticated/i.test(m)) return 'Your sign in has expired. Sign out and sign in again.';
    return 'That did not save: ' + m; }
  function fieldErr(f, name, text) { var el = typeof name === 'string' ? f.elements[name] : name; if (!el) return null;
    el.setAttribute('aria-invalid', 'true'); var id = 'err-' + (el.name || el.id); var sp = document.createElement('span'); sp.className = 'ct-ferr'; sp.id = id; sp.textContent = text;
    (el.closest('label') || el.parentNode).appendChild(sp); el.setAttribute('aria-describedby', id); return el; }
  function clearErrs(f) { $$('.ct-ferr', f).forEach(function (x) { x.remove(); }); $$('[aria-invalid]', f).forEach(function (x) { x.removeAttribute('aria-invalid'); x.removeAttribute('aria-describedby'); }); }
  function banner(f, text, ok) { var b = $('.ct-banner', f); if (!b) { b = document.createElement('div'); b.className = 'ct-banner'; b.setAttribute('role', 'alert'); f.insertBefore(b, f.firstChild.nextSibling); }
    b.hidden = !text; b.className = 'ct-banner' + (ok ? ' ok' : ''); b.textContent = text || ''; if (text) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  function busy(btn, on, label) { if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Saving...'; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); } else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; btn.removeAttribute('aria-busy'); } }
  function toast(t) { var el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2600); }
  var uuid = function () { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })); };
  var fmtDate = function (d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  function addMonths(d, n) { var x = new Date(d + 'T12:00:00'); var day = x.getDate(); x.setMonth(x.getMonth() + n); if (x.getDate() < day) x.setDate(0); return x.toISOString().slice(0, 10); }
  var INS = [['gap', 'GAP insurance'], ['tyre_alloy', 'Tyre and alloy insurance'], ['cosmetic', 'Cosmetic repair insurance'], ['warranty', 'Warranty'], ['other', 'Other cover']];
  var RATE_AREAS = [['overall', 'Overall condition'], ['bodywork', 'Bodywork'], ['paintwork', 'Paintwork'], ['wheels_tyres', 'Wheels and tyres'], ['interior', 'Interior'], ['mechanical', 'Mechanical'], ['electrics', 'Electrics and warning lights'], ['service_history', 'Service history'], ['mot', 'MOT']];
  var RATE_L = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  function ratingsText(r) { r = r || {}; return RATE_AREAS.filter(function (a) { return r[a[0]] && r[a[0]].rating; }).map(function (a) { var x = r[a[0]]; return a[1] + ': ' + RATE_L[x.rating] + ' (' + x.rating + '/5)' + (x.notes ? ', ' + x.notes : ''); }).join('; '); }
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
        /* if the phone holds a subscription made with an older key, drop it and subscribe again with the current one */
        return navigator.serviceWorker.ready.then(function (r) { return r.pushManager.getSubscription().then(function (old) {
          var same = old && old.options && old.options.applicationServerKey && new Uint8Array(old.options.applicationServerKey).join() === arr.join();
          if (same) return old; return (old ? old.unsubscribe() : Promise.resolve()).then(function () { return r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: arr }); }); }); });
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
    markDealt: function (cid, pid) { var d = demoDb(); var c = (d.customers || []).find(function (x) { return x.id === cid; }); if (c) { c.dealt_at = pid ? new Date().toISOString() : null; c.dealt_purchase_id = pid || null; demoSave(d); } return Promise.resolve(); },
    savePurchase: function (p) { var d = demoDb(); p.id = p.id || uuid(); p.remind_on = addMonths(p.purchase_date, 33); d.purchases = (d.purchases || []).filter(function (x) { return x.id !== p.id; }); d.purchases.push(p); demoSave(d); return Promise.resolve(p); },
    staffList: function () { var d = demoDb(); return Promise.resolve(Object.values(d.staff || {}).filter(Boolean)); },
    invites: function () { return Promise.resolve(demoDb().invites || []); },
    buyRequest: function (r) { var d = demoDb(); d.buys = d.buys || []; r.status = 'new'; r.created_at = new Date().toISOString(); d.buys.unshift(r); demoSave(d); return Promise.resolve(r); },
    notifyBuy: function () { return Promise.resolve({ ok: false, reason: 'demo' }); },
    buyRequests: function () { var d = demoDb(); return Promise.resolve((d.buys || []).filter(function (b) { var c = (d.customers || []).find(function (x) { return x.id === b.customer_id; }); return c && demo.visible(d, c); }).map(function (b) { b.customers = (d.customers || []).find(function (x) { return x.id === b.customer_id; }) || null; return b; })); },
    setBuyStatus: function (id, st) { var d = demoDb(); (d.buys || []).forEach(function (b) { if (b.id === id) { b.status = st; b.called_at = st === 'called' ? new Date().toISOString() : null; } }); demoSave(d); return Promise.resolve(); },
    invite: function (inv) { var d = demoDb(); inv.id = uuid(); inv.created_at = new Date().toISOString(); d.invites.push(inv); demoSave(d); return Promise.resolve(inv); },
    uploadPx: function (cid, file) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res({ preview: r.result, link: '' }); }; r.readAsDataURL(file); }); },
    setNotify: function (v) { var d = demoDb(); d.notify = v; demoSave(d); return Promise.resolve(); },
    notify: function () { return Promise.resolve(demoDb().notify || 'push'); },
    savePush: function () { return Promise.resolve(false); },
    owner: function (c) { var d = demoDb(); return Promise.resolve(c && c.owner_staff_id ? (d.staff || {})[c.owner_staff_id] || null : null); }
  };

  var sb = null, sbUser = null, sbProfile = null;
  /* earlier unsaved extras go first so this save's values win */
  function row0(c) { return c && c.id ? Object.assign({}, pendingGet(c.id), c) : c; }
  var supa = {
    mode: 'supabase',
    init: function () { return import('https://esm.sh/@supabase/supabase-js@2').then(function (m) { sb = m.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } }); }); },
    session: function () { return sb.auth.getSession().then(function (r) { sbUser = r.data.session && r.data.session.user; if (!sbUser) return null;
      return sb.from('profiles').select('*').eq('id', sbUser.id).single().then(function (p) { sbProfile = p.data; return { uid: sbUser.id, role: p.data.role, email: p.data.email, name: p.data.name, whatsapp: p.data.whatsapp }; }); }); },
    verifyCode: function (email, code) { return sb.auth.verifyOtp({ email: email, token: code, type: 'email' }).then(function (r) { if (r.error) throw r.error; }); },
    sendLink: function (email) { return sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: APP_URL } }).then(function (r) { if (r.error) throw r.error; }); },
    signOut: function () { return sb.auth.signOut(); },
    customers: function () { return sb.from('customers').select('*').order('created_at', { ascending: false }).then(function (r) { if (r.error) throw r.error;
      return Promise.all(r.data.map(function (c) { if (c.px_valuation_set_by !== 'staff') return c; return sb.rpc('valuation_set_by_name', { cid: c.id }).then(function (n) { c.px_valuation_set_by_name = n.data; return c; }); })); }); },
    saveCustomer: function (c) { var row = Object.assign({}, row0(c)); delete row.px_photos_preview; var isNew = !row.id || !S.cust || S.cust.id !== row.id; if (isNew) { row.owner_staff_id = sbProfile.role === 'customer' ? null : sbUser.id; if (sbProfile.role === 'customer') row.user_id = sbUser.id; }
      /* No INSERT ... RETURNING: the read policy can't see a row inside the statement that creates it, so Postgres
         rejected every new customer. Insert or update first, then read the row back. */
      if (!row.id) row.id = uuid();
      function write(x) { return isNew ? sb.from('customers').insert(x) : sb.from('customers').update(x).eq('id', x.id); }
      /* A column the database does not know (PGRST204 / 42703) must never stop the core profile saving or show a
         technical message. Drop that one field, retry quietly, keep the dropped values on this phone and send them
         again on the next save. */
      var dropped = {}, tries = 0;
      function attempt(x) { return Promise.resolve(write(x)).then(function (r) { var e = r && r.error;
        if (e && (e.code === 'PGRST204' || e.code === '42703') && tries++ < 6) { var col = ((e.message || '').match(/'([a-z_]+)' column|column [a-z_]+\.([a-z_]+)|column "([a-z_]+)"/) || []).slice(1).filter(Boolean)[0];
          if (col && col in x && col !== 'id') { dropped[col] = x[col]; var y = Object.assign({}, x); delete y[col]; return attempt(y); } }
        return r; }); }
      return attempt(row).then(function (r) { if (r.error) throw r.error; pendingCols(row.id, dropped); return sb.from('customers').select('*').eq('id', row.id).single(); })
        .then(function (r) { if (r.error) throw r.error; return Object.assign(r.data, dropped); }); },
    swipes: function (cid) { return sb.from('swipes').select('*').eq('customer_id', cid).then(function (r) { var o = {}; (r.data || []).forEach(function (s) { o[s.reg] = s; }); return o; }); },
    /* Supabase query builders have .then but no .catch, so wrap in a real Promise and reject on r.error.
       (Calling .catch straight on the builder threw inside decide() and froze the deck on the next card.) */
    setSwipe: function (cid, reg, liked, extra) { return Promise.resolve().then(function () { if (!sbUser) throw new Error('signed out');
      return sb.from('swipes').upsert(Object.assign({ customer_id: cid, reg: reg, liked: liked, by_user: sbUser.id }, extra || {})); }).then(function (r) { if (r && r.error) throw r.error; }); },
    purchases: function (cid) { return sb.from('purchases').select('*').eq('customer_id', cid).then(function (r) { return r.data || []; }); },
    markDealt: function (cid, pid) { return sb.from('customers').update({ dealt_at: pid ? new Date().toISOString() : null, dealt_purchase_id: pid || null }).eq('id', cid).then(function (r) { if (r.error) throw r.error; }); },
    savePurchase: function (p) { var row = Object.assign({}, p); delete row.remind_on; row.created_by = sbUser.id; return sb.from('purchases').upsert(row).select().single().then(function (r) { if (r.error) throw r.error; return r.data; }); },
    staffList: function () { return sb.from('profiles').select('id,name,email,whatsapp,role').in('role', ['staff', 'admin']).then(function (r) { return r.data || []; }); },
    /* lead record first (no RETURNING: staff only read policy), then ask the edge function to email Dan */
    buyRequest: function (r) { r.created_by = sbUser.id; return Promise.resolve(sb.from('buy_requests').insert(r)).then(function (x) { if (x.error) throw x.error; return r; }); },
    notifyBuy: function (id) { return Promise.resolve(sb.functions.invoke('notify-buy-request', { body: { id: id } })).then(function (x) { if (x.error) throw x.error; return x.data; }); },
    buyRequests: function () { return Promise.resolve(sb.from('buy_requests').select('*, customers(name, phone, email)').order('created_at', { ascending: false }).limit(200)).then(function (r) { if (r.error) throw r.error; return r.data || []; }); },
    setBuyStatus: function (id, st) { return Promise.resolve(sb.from('buy_requests').update({ status: st, called_at: st === 'called' ? new Date().toISOString() : null, called_by: st === 'called' ? sbUser.id : null }).eq('id', id)).then(function (r) { if (r.error) throw r.error; }); },
    invites: function () { return sb.from('staff_invites').select('*').order('created_at', { ascending: false }).then(function (r) { return r.data || []; }); },
    invite: function (inv) { inv.invited_by = sbUser.id; return sb.from('staff_invites').insert(inv).then(function (r) { if (r.error) throw r.error; }); },
    findProfile: function (email) { return sb.from('profiles').select('role').eq('email', email).maybeSingle().then(function (r) { return r.data || null; }, function () { return null; }); },
    uploadPx: function (cid, file) { var path = cid + '/' + uuid() + '.' + ((file.type.split('/')[1]) || 'jpg');
      return sb.storage.from('px').upload(path, file, { contentType: file.type }).then(function (r) { if (r.error) throw r.error;
        return sb.storage.from('px').createSignedUrl(path, 30 * 86400); }).then(function (s) { return { path: path, link: s.data.signedUrl, preview: URL.createObjectURL(file) }; }); },
    setNotify: function (v) { return sb.from('profiles').update({ notify_push: v === 'push' || v === 'both', notify_email: v === 'email' || v === 'both' }).eq('id', sbUser.id); },
    notify: function () { var p = sbProfile || {}; return Promise.resolve(p.notify_push && p.notify_email ? 'both' : p.notify_push ? 'push' : p.notify_email ? 'email' : 'off'); },
    savePush: function (sub) { var j = sub.toJSON(); return sb.from('push_subscriptions').upsert({ user_id: sbUser.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' }).then(function () { return true; }); },
    owner: function (c) { if (!c || !c.owner_staff_id) return Promise.resolve(null); return sb.rpc('customer_whatsapp', { cid: c.id }).then(function (r) { return { whatsapp: r.data, name: '', email: '' }; }); },
    claim: function (id) { return sb.rpc('claim_customer', { claim: id }); }
  };
  /* One fixed callback URL, so it always matches the Supabase redirect allow list
     (location.pathname could be /swipe-drive/index.html or carry ?reg=). */
  var APP_URL = location.origin + '/swipe-drive/';
  /* Supabase puts a failed or expired link's reason in the hash: #error=...&error_description=... */
  var AUTH_ERR = (function () { var h = new URLSearchParams((location.hash || '').slice(1)), q = new URLSearchParams(location.search);
    var d = h.get('error_description') || q.get('error_description'); return d ? { code: h.get('error_code') || q.get('error_code') || '', text: d.replace(/\+/g, ' ') } : null; })();
  function isAuthHash(h) { return /(^|&)(access_token|refresh_token|error|error_code|type)=/.test(h || ''); }
  /* fields the database could not take yet, kept per customer and sent again with the next save */
  function pendingCols(id, o) { try { var k = 'sdPendingCols:' + id; if (o && Object.keys(o).length) localStorage.setItem(k, JSON.stringify(o)); else localStorage.removeItem(k); } catch (e) {} }
  function pendingGet(id) { try { return JSON.parse(localStorage.getItem('sdPendingCols:' + id) || 'null') || {}; } catch (e) { return {}; } }
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
    var det = fetch('../automation/car-details.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) { window.ctDetails = d; }).catch(function () { window.ctDetails = null; });
    return Promise.all([stock, range, det]);
  }
  /* body and fuel for a new model, only from its name and MBG.html group */
  function newCar(name, group) {
    var n = name.toLowerCase(), b = [], f = [];
    /* fuel from the model name only (the MBG group names mix fuels): i models are electric, a trailing e is a
       plug in hybrid (M760e, X5 M60e, XM, M5), M and M Performance cars are petrol, the rest come in several fuels */
    if (/^i/.test(n)) f.push('electric');
    else if (/\d+e\b/.test(n) || /\d+e xdrive/.test(n) || /^xm|^m5 /.test(n)) f.push('phev');
    else if (/^m\d|\bm\d+i?\b|m\d{3}i?|\bm$/.test(n) || /^bmw m$|m performance/i.test(group)) f.push('petrol');
    else f.push('petrol', 'diesel', 'mhev-petrol', 'mhev-diesel', 'phev');
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
  var SCREENS = ['signin', 'profile', 'discover', 'matches', 'me', 'bought', 'team', 'invites', 'buys', 'pick'];
  function go(name) { if (location.hash !== '#' + name) location.hash = name; else route(); }
  function route() {
    var h = (location.hash || '').slice(1); if (isAuthHash(h)) h = '';
    h = h || (S.session ? 'discover' : 'signin');
    if (!S.session) h = 'signin';
    if (SCREENS.indexOf(h) === -1) h = 'discover';
    var staff = S.session && S.session.role !== 'customer';
    if ((h === 'team' || h === 'invites' || h === 'buys') && !staff) h = 'discover';
    if (h === 'invites' && S.session.role !== 'admin') h = 'team';
    /* Staff with no customer picked: Discover and Matches explain what to do, Me shows the account.
       (This used to bounce every tab back to Customers, so the nav looked dead.) */
    var tab = h;
    if (S.session && !S.cust && staff && (h === 'discover' || h === 'matches' || h === 'bought')) h = 'pick';
    else if (S.session && !S.cust && !staff && ['discover', 'matches', 'bought', 'me'].indexOf(h) !== -1) h = 'profile';
    if (h === 'pick') tab = tab === 'bought' ? 'team' : tab;
    if (S.session && S.cust && !S.cust.name && !staff && h !== 'profile') h = 'profile';
    $$('.ct-screen').forEach(function (s) { s.hidden = s.getAttribute('data-screen') !== h; });
    $('#nav').hidden = !S.session;
    $$('[data-nav]').forEach(function (a) { if (a.getAttribute('data-nav') === (h === 'pick' ? tab : h)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $$('[data-staff-only]').forEach(function (e) { e.hidden = !staff; });
    var act = $('#acting'); act.hidden = !(staff && S.cust); if (S.cust) act.textContent = 'For ' + (S.cust.name || 'new customer');
    window.scrollTo(0, 0);
    ({ profile: showProfile, discover: showDeck, matches: showMatches, me: showMe, bought: showBought, team: showTeam, invites: showInvites, buys: showBuys }[h] || function () {})();
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
      store.sendLink(em).then(function () { msg.className = 'ct-msg ok'; msg.textContent = 'Check your inbox for the sign in link. It works once. Open it on this phone, or type the code from the email below.'; $('#codeBox').hidden = false; track('sign_in_link_sent'); })
        .catch(function () { msg.textContent = 'That did not send. Try again, or WhatsApp me on 07827 138197.'; });
    });
    if (AUTH_ERR) { var m0 = $('#siMsg'); m0.textContent = (/expired|invalid/i.test(AUTH_ERR.code + AUTH_ERR.text) ? 'That sign in link has expired or was already used. Links work once. Send a new one below.' : 'Sign in did not finish: ' + AUTH_ERR.text + '. Send a new link below.');
      history.replaceState(null, '', location.pathname + location.search); }
    $('#codeForm').addEventListener('submit', function (e) { e.preventDefault(); var em = $('#siEmail').value.trim(), code = $('#siCode').value.replace(/\D/g, ''), msg = $('#siMsg');
      if (code.length < 6) { msg.textContent = 'Type the code from the email.'; return; }
      msg.textContent = 'Checking...'; store.verifyCode(em, code).then(function () { return store.session(); }).then(function (sess) { track('sign_in', { method: 'code' }); afterSignIn(sess); })
        .catch(function () { msg.textContent = 'That code did not work. Check it, or send a new link.'; }); });
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
    }).then(function () { resyncPush(); if (!location.hash || location.hash === '#signin') location.hash = staff ? 'team' : (S.cust && S.cust.name ? 'discover' : 'profile'); else route(); iosNudge(); });
  }
  /* alerts already allowed: quietly refresh the subscription so a key change never leaves a phone without alerts */
  function resyncPush() { try { if (!LIVE || !platform.pushSupported() || Notification.permission !== 'granted' || !CFG.VAPID_PUBLIC_KEY) return;
    platform.subscribePush().then(function (sub) { return store.savePush(sub); }).catch(function (e) { console.warn('Swipe Drive push resync', e); }); } catch (e) {} }
  function loadCust() {
    if (!S.cust) { S.swipes = {}; S.owner = null; return Promise.resolve(); }
    return Promise.all([store.swipes(S.cust.id), store.owner(S.cust)]).then(function (r) { S.swipes = r[0]; S.owner = r[1]; badge(); });
  }

  /* ---------------- desk questions (same as desk.html), stored in customers.desk ---------------- */
  var O = function (s) { return s.split('|').map(function (x) { var a = x.split('='); return { v: a[0], t: a[1] || a[0] }; }); };
  var DESK = [
    { h: 'Car of interest', f: [['like_model', 'What do they like about this model?', 'text'], ['important', 'What is important when looking for a new car?', 'text'], ['n_model', 'Notes', 'text']] },
    { h: 'Usage', f: [['who', 'Who drives it most', O('me=Mostly them|partner=Partner or someone else|family=Shared around the family|company=Company or pool car')],
      ['life', 'A typical week', O('family=School runs and family life|commute=Daily commute|miles=Big motorway miles|thrill=Driving for fun|style=Turning heads|open=A bit of everything')],
      ['people', 'People', O('one=Just them|two=Two|four=Up to four|five=Five or more|seven=Needs 7 seats')],
      ['boot', 'Boot', O('small=Not much|normal=A normal boot|big=A big boot|tow=Tows')],
      ['charge', 'Home charging', O('yes=Can charge at home|no=Not easily|notsure=Not sure yet')], ['n_usage', 'Notes', 'text']] },
    { h: 'Current car', f: [['cur_car', 'Current car (make and model)', 'line'], ['n_px', 'Part exchange notes', 'text']] },
    { h: 'Must have and would like', f: [['must_text', 'Other must haves', 'text'], ['would_text', 'Other would likes', 'text'], ['n_must', 'Notes', 'text'], ['spec_notes', 'Specified requirements', 'text']] },
    { h: 'Timeline', f: [['when', 'When would they like to be driving it', O('now=As soon as possible|month=Within a month|quarter=In the next few months|browsing=Just browsing for now')], ['n_when', 'Notes', 'text']] },
    { h: 'Funding', f: [['cur_monthly', 'Current monthly payment (\u00a3)', 'num'], ['keep', 'How long do they plan to keep it', O('24=24 months|36=36 months|48=48 months|other=Other')], ['keep_other', 'Other, months', 'num'],
      ['monthly_from', 'Monthly budget from (\u00a3)', 'num'], ['pay_notsure', 'Not sure how they want to pay yet', 'check'],
      ['fund', 'Funding method', O('pcp=BMW Select / PCP|hp=HP|other=Other|savings=Savings|loan=Loan|motability=Motability'), true],
      ['said', 'Has the customer SAID how they are funding?', O('yes=Yes|no=No'), false, true], ['intro_bm', 'Introduction to Business Manager', O('yes=Yes|no=No'), false, true],
      ['n_budget', 'Notes', 'text'], ['n_result', 'Notes on the result', 'text', false, true]] },
    { h: 'Next steps agreed', staff: true, f: [['ns_drive', 'Test drive booked', 'check'], ['ns_drive_when', 'When', 'line'], ['ns_val', 'Valuation on their car', 'check'], ['ns_follow', 'Follow up date', 'date'], ['n_next', 'Notes on next steps', 'text']] },
    { h: 'Customer', f: [['optin', 'They asked to be kept posted (occasional news from Dan, unsubscribe any time)', 'check'], ['n_customer', 'Notes on the customer', 'text']] }
  ];
  function deskHtml(staff) { return DESK.filter(function (g) { return staff || !g.staff; }).map(function (g) {
      return '<details class="ct-more"><summary>' + esc(g.h) + ' <em class="ct-opt">optional</em></summary>' + g.f.filter(function (x) { return staff || !x[4]; }).map(function (x) { var k = x[0], t = x[2];
        if (Array.isArray(t)) return '<span class="ct-lab">' + esc(x[1]) + '</span><div class="ct-chips' + (x[3] ? ' ct-multi' : '') + '" data-name="desk_' + k + '">' + t.map(function (o) { return '<button type="button" data-v="' + esc(o.v) + '">' + esc(o.t) + '</button>'; }).join('') + '</div>';
        if (t === 'check') return '<label class="ct-check ct-check-sm"><input type="checkbox" data-desk="' + k + '"> <span>' + esc(x[1]) + '</span></label>';
        if (t === 'text') return '<label class="ct-f"><span>' + esc(x[1]) + '</span><textarea data-desk="' + k + '" rows="2" maxlength="800"></textarea></label>';
        return '<label class="ct-f"><span>' + esc(x[1]) + '</span><input data-desk="' + k + '"' + (t === 'num' ? ' type="number" inputmode="numeric" min="0"' : t === 'date' ? ' type="date"' : '') + '></label>'; }).join('') + '</details>'; }).join(''); }
  function deskFill(f, v) { v = v || {}; $$('[data-desk]', f).forEach(function (el) { var k = el.getAttribute('data-desk'); if (el.type === 'checkbox') el.checked = !!v[k]; else el.value = v[k] == null ? '' : v[k]; });
    DESK.forEach(function (g) { g.f.forEach(function (x) { if (Array.isArray(x[2])) setChoice(f, 'desk_' + x[0], v[x[0]] == null ? (x[3] ? [] : null) : v[x[0]]); }); }); }
  function deskRead(f, prev) { var o = Object.assign({}, prev || {});
    $$('[data-desk]', f).forEach(function (el) { var k = el.getAttribute('data-desk'), val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value.trim();
      if (val === '' || val === null || val === false) delete o[k]; else o[k] = val; });
    DESK.forEach(function (g) { g.f.forEach(function (x) { if (!Array.isArray(x[2]) || !$('[data-name="desk_' + x[0] + '"]', f)) return; var v = choice(f, 'desk_' + x[0]); if (v == null || (Array.isArray(v) && !v.length)) delete o[x[0]]; else o[x[0]] = v; }); }); return o; }

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
    var fams = {}; S.cars.forEach(function (car) { var fm = M.colourFamily(car); if (fm) fams[fm] = 1; });
    var famList = M.FAMILY.map(function (x) { return x[0]; }).filter(function (x) { return fams[x]; }); if (fams.Other) famList.push('Other');
    drawTri('#colourChips', [{ key: 'Any', label: 'Any' }].concat(famList.map(function (x) { return { key: x, label: x }; })), c.colours || ['Any'], c.colours_must || []);
    drawTri('#specChips', M.specOptions(), c.specs || [], c.specs_must || []);
    var px = c.px || {}; setChoice(f, 'px_has', px.reg ? 'yes' : 'no');
    f.elements.px_reg.value = px.reg || ''; f.elements.px_mileage.value = px.mileage || ''; f.elements.px_condition.value = px.condition || '';
    ['px_valuation_gbp', 'px_valued_on', 'px_settlement_gbp', 'px_settlement_valid_until'].forEach(function (k) { f.elements[k].value = c[k] == null ? '' : c[k]; });
    /* one settlement box: older profiles kept "finance still owed" inside px, carry it across */
    if (f.elements.px_settlement_gbp.value === '' && px.finance_outstanding != null) f.elements.px_settlement_gbp.value = px.finance_outstanding;
    $('#pxValBy').textContent = valBy(c); liveEquity();
    drawRates(c.px_condition_ratings); $('#pxConfirm').checked = false;
    $('#pxConfirmLabel').textContent = staff ? 'I confirm, on behalf of the customer, that this is what they told me' : 'I confirm';
    $('#pxConfirmed').textContent = c.px_terms_confirmed_at ? 'Last confirmed ' + new Date(c.px_terms_confirmed_at).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + (c.px_terms_confirmed_by === 'staff' && !staff ? ' by your sales executive' : '') : '';
    S.pxPhotos = (px.photos || []).slice(); drawThumbs(); showDeps(f);
    var dk = $('#deskBox'); if (dk.getAttribute('data-for') !== String(staff)) { dk.innerHTML = deskHtml(staff); dk.setAttribute('data-for', String(staff)); bindChoice(dk); } deskFill(f, c.desk);
    $('#pfSave').textContent = staff ? 'Save and find matches' : 'Find my match';
  }
  function drawTri(sel, opts, on, must) { $(sel).innerHTML = opts.map(function (o) { var st = must.indexOf(o.key) !== -1 ? 'must' : on.indexOf(o.key) !== -1 ? 'like' : '';
      return '<button type="button" data-v="' + esc(o.key) + '" data-state="' + st + '" aria-pressed="' + (st ? 'true' : 'false') + '">' + esc(o.label) + '</button>'; }).join(''); }
  function triVals(sel) { var on = [], must = []; $$(sel + ' button').forEach(function (b) { var st = b.getAttribute('data-state'), v = b.getAttribute('data-v'); if (st) on.push(v); if (st === 'must') must.push(v); }); return { on: on, must: must }; }
  function equity(c) { if (c.px_valuation_gbp == null || c.px_settlement_gbp == null) return null; var e = c.px_valuation_gbp - c.px_settlement_gbp;
    return { neg: e < 0, text: M.gbp(Math.abs(e)), label: e < 0 ? 'Negative equity, subject to inspection and settlement confirmation' : 'Estimated equity, subject to inspection and settlement confirmation' }; }
  function valBy(c) { if (c.px_valuation_gbp == null) return ''; var who = c.px_valuation_set_by === 'customer' ? (S.session && S.session.role === 'customer' ? 'you' : 'the customer') : (c.px_valuation_set_by_name || 'Dan');
    return 'Valuation entered by ' + who + (c.px_valued_on ? ', valued on ' + fmtDate(c.px_valued_on) : ''); }
  function pxMoneyHtml(c) { var bits = []; if (c.px_valuation_gbp != null) bits.push('PX valuation ' + M.gbp(c.px_valuation_gbp) + (c.px_valued_on ? ' (' + fmtDate(c.px_valued_on) + ')' : ''));
    if (c.px_settlement_gbp != null) bits.push('Settlement ' + M.gbp(c.px_settlement_gbp) + (c.px_settlement_valid_until ? ' valid until ' + fmtDate(c.px_settlement_valid_until) : ''));
    var e = equity(c); return (bits.length ? '<p>' + esc(bits.join(' \u00b7 ')) + '</p>' : '') + (c.px_valuation_gbp != null ? '<p>' + esc(valBy(c)) + '</p>' : '') + (e ? '<p><span class="ct-pill' + (e.neg ? ' hot' : '') + '">' + esc(e.text) + '</span> ' + esc(e.label) + '</p>' : ''); }
  function liveEquity() { var f = $('#profileForm').elements, v = f.px_valuation_gbp.value, st = f.px_settlement_gbp.value, el = $('#pxEquity');
    var e = equity({ px_valuation_gbp: v === '' ? null : +v, px_settlement_gbp: st === '' ? null : +st }); el.hidden = !e; if (e) { el.className = 'ct-equity' + (e.neg ? ' neg' : ''); el.innerHTML = '<b>' + esc(e.text) + '</b><small>' + esc(e.label) + '</small>'; } }
  function drawRates(r) { r = r || {}; $('#pxRates').innerHTML = RATE_AREAS.map(function (a) { var x = r[a[0]] || {};
      return '<div class="ct-rate" data-area="' + a[0] + '"><div class="ct-rate-h"><span>' + a[1] + '</span><em>' + (x.rating ? RATE_L[x.rating] : '') + '</em></div><div class="ct-rate-b">' +
        [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-r="' + n + '" aria-label="' + RATE_L[n] + '" title="' + RATE_L[n] + '" aria-pressed="' + (x.rating === n ? 'true' : 'false') + '">' + n + '</button>'; }).join('') +
        '</div><input type="text" maxlength="300" placeholder="Notes (optional)" value="' + esc(x.notes || '') + '"></div>'; }).join(''); }
  function readRates() { var o = {}; $$('#pxRates .ct-rate').forEach(function (el) { var b = $('button[aria-pressed=true]', el), n = $('input', el).value.trim();
      if (b || n) o[el.getAttribute('data-area')] = Object.assign(b ? { rating: +b.getAttribute('data-r') } : {}, n ? { notes: n } : {}); }); return o; }
  function drawThumbs() { $('#pxThumbs').innerHTML = S.pxPhotos.map(function (p) { return p.preview ? '<img src="' + esc(p.preview) + '" alt="Part exchange photo">' : '<span class="ct-pill">Photo saved</span>'; }).join(''); }
  function initProfile() {
    var f = $('#profileForm'); bindChoice(f);
    ['px_valuation_gbp', 'px_settlement_gbp'].forEach(function (k) { f.elements[k].addEventListener('input', liveEquity); });
    $('#pxRates').addEventListener('click', function (e) { var b = e.target.closest('button[data-r]'); if (!b) return; var row = b.closest('.ct-rate'), on = b.getAttribute('aria-pressed') === 'true';
      $$('button', row).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); if (!on) b.setAttribute('aria-pressed', 'true');
      $('.ct-rate-h em', row).textContent = on ? '' : RATE_L[+b.getAttribute('data-r')]; platform.haptic(6); });
    $$('.ct-tri', f).forEach(function (g) { g.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return;
      var v = b.getAttribute('data-v'), st = b.getAttribute('data-state'), any = g.id === 'colourChips';
      var nx = any && v === 'Any' ? (st ? '' : 'like') : (st === '' ? 'like' : st === 'like' ? 'must' : '');
      if (any && v === 'Any' && nx) $$('button', g).forEach(function (x) { x.setAttribute('data-state', ''); x.setAttribute('aria-pressed', 'false'); });
      if (any && v !== 'Any') { var a = $('[data-v=Any]', g); a.setAttribute('data-state', ''); a.setAttribute('aria-pressed', 'false'); }
      b.setAttribute('data-state', nx); b.setAttribute('aria-pressed', nx ? 'true' : 'false'); platform.haptic(8); }); });
    $('#pxFile').addEventListener('change', function (e) {
      var files = [].slice.call(e.target.files || []).slice(0, 6); var cid = (S.cust && S.cust.id) || (S.pendingId = S.pendingId || uuid());
      $('#pfMsg').textContent = 'Adding photos...';
      Promise.all(files.map(function (fl) { return store.uploadPx(cid, fl); })).then(function (r) { S.pxPhotos = S.pxPhotos.concat(r); drawThumbs(); $('#pfMsg').textContent = ''; })
        .catch(function () { $('#pfMsg').textContent = 'A photo did not upload. You can send photos on WhatsApp instead.'; });
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); var el = f.elements, msg = $('#pfMsg'), staff = S.session.role !== 'customer', btn = $('#pfSave');
      if (btn.disabled) return; clearErrs(f); banner(f, ''); msg.textContent = '';
      var bad = [], ph = el.phone.value.replace(/[^\d+]/g, ''), em = staff ? el.email.value.trim() : '';
      if (!el.name.value.trim()) bad.push(fieldErr(f, 'name', 'Add a name.'));
      if (!ph) bad.push(fieldErr(f, 'phone', 'Add a mobile number.')); else if (ph.replace(/\D/g, '').length < 10) bad.push(fieldErr(f, 'phone', 'That mobile number looks too short.'));
      if (staff && !em) bad.push(fieldErr(f, 'email', 'Add the customer email.')); else if (em && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(em)) bad.push(fieldErr(f, 'email', 'That email does not look right.'));
      var rated = Object.keys(readRates()).length > 0;
      if (choice(f, 'px_has') === 'yes' && rated && !$('#pxConfirm').checked) bad.push(fieldErr(f, $('#pxConfirm'), 'Tick I confirm, because condition ratings are filled in.'));
      if (choice(f, 'px_has') === 'yes' && !el.px_reg.value.trim()) bad.push(fieldErr(f, 'px_reg', 'Add the part exchange reg, or choose No part exchange.'));
      bad = bad.filter(Boolean);
      if (bad.length) { banner(f, bad.length === 1 ? 'One thing to fix before saving.' : bad.length + ' things to fix before saving.'); bad[0].scrollIntoView({ block: 'center' }); bad[0].focus({ preventScroll: true }); return; }
      var c = Object.assign({}, S.cust || {}, { id: (S.cust && S.cust.id) || S.pendingId || undefined, name: el.name.value.trim(), phone: el.phone.value.trim(), postcode: el.postcode.value.trim().toUpperCase(),
        budget_type: choice(f, 'budget_type'), monthly_gbp: +el.monthly_gbp.value || null, cash_gbp: +el.cash_gbp.value || null, deposit_gbp: +el.deposit_gbp.value || null,
        annual_mileage: +el.annual_mileage.value, colours: triVals('#colourChips').on.filter(function (x) { return x !== 'Any'; }), colours_must: triVals('#colourChips').must, specs: triVals('#specChips').on, specs_must: triVals('#specChips').must, fuel: choice(f, 'fuel'), body: choice(f, 'body'), models: choice(f, 'models'), new_used: choice(f, 'new_used') });
      if (staff) c.email = el.email.value.trim() || null;
      c.desk = deskRead(f, (S.cust || {}).desk);
      var num = function (v) { return v === '' ? null : Math.max(0, Math.round(+v)); }, prevVal = S.cust ? S.cust.px_valuation_gbp : null;
      c.px_valuation_gbp = num(el.px_valuation_gbp.value); c.px_valued_on = el.px_valued_on.value || null;
      c.px_settlement_gbp = num(el.px_settlement_gbp.value); c.px_settlement_valid_until = el.px_settlement_valid_until.value || null;
      if (c.px_valuation_gbp !== prevVal && c.px_valuation_gbp != null) { c.px_valuation_set_by = staff ? 'staff' : 'customer'; c.px_valuation_set_by_name = staff ? (S.session.name || 'Dan') : ''; }
      if (choice(f, 'px_has') === 'yes') { c.px_condition_ratings = readRates();
        if ($('#pxConfirm').checked) { c.px_terms_confirmed_at = new Date().toISOString(); c.px_terms_confirmed_by = staff ? 'staff' : 'customer'; } }
      else { c.px_condition_ratings = {}; c.px_terms_confirmed_at = null; c.px_terms_confirmed_by = null; c.px_valuation_gbp = c.px_settlement_gbp = null; c.px_valued_on = c.px_settlement_valid_until = null; }
      if (LIVE) { delete c.px_valuation_set_by; delete c.px_valuation_set_by_name; delete c.px_valuation_set_by_user; } /* stamped by the database */
      c.px = choice(f, 'px_has') === 'yes' ? { reg: M.normReg(el.px_reg.value), mileage: +el.px_mileage.value || null, condition: el.px_condition.value, finance_outstanding: c.px_settlement_gbp, /* mirror of the settlement figure, kept for older readers */
        photos: S.pxPhotos.map(function (p) { return LIVE ? { path: p.path, link: p.link } : p; }) } : null;
      var wasNew = !(S.cust && S.cust.id); busy(btn, true);
      store.saveCustomer(c).then(function (saved) { S.cust = saved; S.pendingId = null; sessionStorage.setItem('ctActing', saved.id); track('profile_saved', { by: staff ? 'staff' : 'customer' }); return loadCust(); })
        .then(function () { busy(btn, false); toast(staff ? (wasNew ? 'Customer added' : 'Customer saved') : 'Saved'); S.deck = []; go('discover'); })
        .catch(function (err) { busy(btn, false); console.warn('save customer', err); banner(f, plainErr(err)); track('profile_save_failed', { code: (err && err.code) || '' }); });
    });
  }

  /* ---------------- deck ---------------- */
  function buildDeck() {
    var ranked = M.rank(pool(), S.cust || {});
    /* Never pad the deck with cars outside the customer's filters: an empty deck shows the end screen instead.
       One card per stable id (reg), and nothing already swiped. */
    var deep = platform.deepLink().reg, seen = S.swipes, ids = {};
    S.deck = ranked.filter(function (x) { var id = x.car.reg; if (!id || seen[id] || ids[id]) return false; ids[id] = 1; return true; });
    if (deep) { var i = S.deck.findIndex(function (x) { return x.car.reg === deep; }); if (i > 0) S.deck.unshift(S.deck.splice(i, 1)[0]); }
  }
  function cardHtml(x) {
    var c = x.car, f = M.finance(c), isNew = c.kind === 'new';
    var img = isNew ? '<div class="ct-noimg-ph">' + esc(c.model.replace(/^BMW /, '')) + '</div>' : (photos(c).length ? photoHtml(c, 0, true) : noPhoto(c));
    var src = isNew ? 'Brand new' : c.source === 'group' ? 'I can source this one' : 'On my forecourt';
    var tags = isNew ? [c.group] : [c.year, c.mileage, c.fuel, c.gearbox];
    var money = isNew ? '<div class="ct-mon">Ordered to your spec, or from new stock. I quote new car figures live.</div>'
      : '<div class="ct-price">' + esc(c.price || 'Price on request') + '</div>' + (f ? '<div class="ct-mon">' + esc(f.headline) + '</div><p class="ct-rep"><b>Representative example.</b> ' + esc(f.example) + '</p>' : '<div class="ct-mon">Monthly: ask for a quote</div>');
    return '<div class="ct-tarea">' + img + gauge(x.score) + '<div class="ct-src">' + esc(src) + '</div>' +
      '</div>' + '<div class="ct-stamp ct-stamp-like" aria-hidden="true">TEST DRIVE</div><div class="ct-stamp ct-stamp-nope" aria-hidden="true">PASS</div><div class="ct-stamp ct-stamp-super" aria-hidden="true">KEYS PLEASE</div><canvas class="ct-tread" aria-hidden="true"></canvas>' +
      '<div class="ct-meta">' + (isNew ? '<span class="ct-plate ct-plate-new">NEW</span>' : plate(c.reg)) + '<h3>' + esc(c.model) + '</h3><div class="ct-tags">' + tags.filter(Boolean).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') +
      x.reasons.map(function (r) { return '<span>&#10003; ' + esc(r) + '</span>'; }).join('') + '</div>' + money + '</div>';
  }
  function showDeck() { if (!S.deck.length) buildDeck(); drawDeck(); }
  function drawDeck() {
    var deck = $('#deck'); deck.innerHTML = '';
    var top = S.deck.slice(0, 3);
    $('#deckEmpty').hidden = !!top.length; $('#deckActions').hidden = !top.length; deck.hidden = !top.length;
    var left = $('#deckLeft'); if (!left) { left = document.createElement('p'); left.id = 'deckLeft'; left.className = 'ct-sub ct-left'; left.setAttribute('aria-live', 'polite'); $('#deckActions').parentNode.insertBefore(left, $('#deckActions').nextSibling); }
    left.hidden = !top.length; left.textContent = S.deck.length === 1 ? 'Last car in your deck' : S.deck.length + ' cars left to see';
    top.slice().reverse().forEach(function (x, i, arr) {
      var el = document.createElement('div'); el.className = 'ct-card'; el.innerHTML = cardHtml(x); el.dataset.reg = x.car.reg;
      var depth = arr.length - 1 - i; el.style.transform = 'translateY(' + depth * 10 + 'px) scale(' + (1 - depth * 0.04) + ')'; el.style.zIndex = 10 - depth;
      if (depth === 0) drag(el, x); deck.appendChild(el);
    });
    settlePhotos(deck);
  }
  function drag(el, x) {
    var sx = 0, sy = 0, dx = 0, dy = 0, t0 = 0, down = false, lastX = 0, lastT = 0, vx = 0;
    var like = $('.ct-stamp-like', el), nope = $('.ct-stamp-nope', el), sup = $('.ct-stamp-super', el), tread = treadTrail(el);
    function set() { el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + dx * 0.06 + 'deg)'; like.style.opacity = Math.max(0, Math.min(1, dx / 100)); nope.style.opacity = Math.max(0, Math.min(1, -dx / 100));
      sup.style.opacity = Math.max(0, Math.min(1, (-dy / 0.4 - Math.abs(dx)) / 160)); tread.draw(dx, dy); el.classList.toggle('is-go', dx > 40); el.classList.toggle('is-stop', dx < -40); }
    el.addEventListener('pointerdown', function (e) { down = true; sx = e.clientX; sy = e.clientY; t0 = lastT = performance.now(); lastX = e.clientX; el.style.transition = 'none'; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; });
    el.addEventListener('pointermove', function (e) { if (!down) return; dx = e.clientX - sx; dy = (e.clientY - sy) * 0.4; var now = performance.now(); vx = (e.clientX - lastX) / Math.max(1, now - lastT); lastX = e.clientX; lastT = now; set(); });
    function up() { if (!down) return; down = false; el.style.cursor = '';
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && performance.now() - t0 < 300) { dx = dy = 0; set();
        var ph = $('.ct-ph', el), rb = ph && ph.getBoundingClientRect();
        if (rb && sy < rb.bottom && photos(x.car).length > 1) { stepPhoto(el, x.car, sx < rb.left + rb.width / 2 ? -1 : 1); return; }
        openSheet(x); return; }
      if (-dy / 0.4 > 150 && Math.abs(dx) < 90) { fling(el, x, 2, 0); return; }
      if (dx > 110 || (vx > 0.6 && dx > 45)) fling(el, x, 1, vx); else if (dx < -110 || (vx < -0.6 && dx < -45)) fling(el, x, -1, vx);
      else { el.style.transition = 'transform .45s cubic-bezier(.2,1.5,.4,1)'; dx = dy = 0; set(); like.style.opacity = nope.style.opacity = sup.style.opacity = 0; tread.clear(); el.classList.remove('is-go', 'is-stop'); } }
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el._fling = function (dir) { fling(el, x, dir, 0); };
  }
  function fling(el, x, dir, v) {
    if (el._flung) return; el._flung = true;
    var w = window.innerWidth, rm = reduced(); el.style.transition = rm ? 'opacity .2s' : 'transform .38s cubic-bezier(.3,.7,.4,1)';
    if (rm) el.style.opacity = 0;
    else if (dir === 2) el.style.transform = 'translate(0,-' + (window.innerHeight + 200) + 'px) scale(.9)';
    else el.style.transform = 'translate(' + dir * (w + 200) + 'px,-40px) rotate(' + dir * (30 + Math.min(20, Math.abs(v) * 10)) + 'deg)';
    $(dir === 2 ? '.ct-stamp-super' : dir > 0 ? '.ct-stamp-like' : '.ct-stamp-nope', el).style.opacity = 1;
    platform.haptic(dir === 2 ? [20, 30, 20, 30, 40] : dir > 0 ? [10, 30, 16] : 10);
    setTimeout(function () { decide(x, dir > 0, dir === 2); }, rm ? 200 : 300);
  }
  /* The deck always advances first; saving happens after and a failed save only shows a small note. */
  function saveSwipe(reg, liked, extra) {
    var cid = S.cust && S.cust.id;
    Promise.resolve().then(function () { if (!cid) throw new Error('no customer'); return store.setSwipe(cid, reg, liked, extra); })
      .catch(function (err) { console.warn('Swipe Drive swipe save', err); toast('That swipe did not save. Carry on swiping.'); });
  }
  function decide(x, liked, superLike) {
    if (x._decided) return; x._decided = true;
    var i = S.deck.indexOf(x); if (i !== -1) S.deck.splice(i, 1); else S.deck = S.deck.filter(function (y) { return y.car.reg !== x.car.reg; });
    S.swipes[x.car.reg] = { liked: liked, at: Date.now(), shortlisted: !!superLike };
    try { drawDeck(); } catch (e) { console.warn('Swipe Drive deck', e); }
    saveSwipe(x.car.reg, liked, superLike ? { shortlisted: true } : null);
    track(superLike ? 'super_like' : liked ? 'swipe_right' : 'swipe_left', { reg: x.car.kind === 'new' ? '' : x.car.reg, kind: x.car.kind, score: x.score });
    if (superLike) { badge(); matchMoment(x); return; }
    badge();
    if (liked) { var likes = Object.keys(S.swipes).filter(function (r) { return S.swipes[r].liked; }).length; if (likes === 1 || x.score >= 75) matchMoment(x); else toast('Added to your matches'); }
  }
  function matchMoment(x) {
    var c = x.car, m = $('#matchModal'); var mm = $('#mmCar');
    if (c.image) { mm.src = c.image; mm.hidden = false; } else mm.hidden = true;
    $('#mmText').textContent = S.session.role !== 'customer' ? (S.cust.name || 'Your customer') + ' and the ' + c.model + ' look made for each other.' : 'You and the ' + c.model + ' look made for each other.';
    var a = $('#mmWa'); a.href = M.waLink(waNum(), c, waWho()); a.textContent = 'Message ' + (waWho() || 'me') + ' on WhatsApp';
    m.hidden = false; try { $('[data-close]', m).focus({ preventScroll: true }); } catch (e) {} confetti($('#confetti')); platform.haptic([20, 40, 20, 40, 60]); track('match', { kind: c.kind, score: x.score });
  }
  function confetti(cv) { if (reduced()) return;
    var ctx = cv.getContext('2d'), W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
    var cols = ['#ff4f7b', '#1c69d4', '#ffffff', '#ffd166', '#3ce07f'], P = [];
    for (var i = 0; i < 160; i++) P.push({ x: W / 2, y: H * 0.42, vx: (Math.random() - 0.5) * 22 * devicePixelRatio, vy: (-Math.random() * 18 - 6) * devicePixelRatio, r: (4 + Math.random() * 6) * devicePixelRatio, c: cols[i % 5], a: Math.random() * 6, s: Math.random() * 0.3 - 0.15 });
    var t = 0; (function f() { ctx.clearRect(0, 0, W, H); P.forEach(function (p) { p.vy += 0.5 * devicePixelRatio; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.s;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); });
      if (++t < 150 && !$('#matchModal').hidden) requestAnimationFrame(f); else ctx.clearRect(0, 0, W, H); })();
  }
  function openSheet(x) {
    var c = x.car, f = M.finance(c), isNew = c.kind === 'new';
    var imgs = photos(c);
    var specs = isNew ? [['Range', c.group]] : [['Year', c.year], ['Mileage', c.mileage], ['Fuel', c.fuel], ['Gearbox', c.gearbox], ['Body', c.body], ['Colour', c.colour], ['Power', c.power], ['Seats', c.seats], ['Drive', c.drive], ['Reg', c.reg]];
    $('#sheetBody').innerHTML = (imgs.length ? '<div class="ct-gal">' + imgs.slice(0, 10).map(function (u, k) { return photoHtml({ images: imgs, model: c.model }, k, false); }).join('') + '</div>' : '') +
      '<h2>' + esc(c.model) + '</h2><p class="ct-sub">' + esc(isNew ? 'Brand new BMW, ordered to your spec or from new stock' : c.source === 'group' ? 'I can source this one' : 'On my forecourt') + '</p>' +
      '<div class="ct-specs">' + specs.filter(function (s) { return s[1]; }).map(function (s) { return '<div><span>' + s[0] + '</span>' + esc(s[1]) + '</div>'; }).join('') + '</div>' +
      (isNew ? '<p>New car figures change with allocation, so I quote them live.</p>' : '<div class="ct-price">' + esc(c.price || 'Price on request') + '</div>' + finHtml(f)) +
      '<div class="ct-row"><a class="ct-btn ct-wa" target="_blank" rel="noopener" href="' + esc(M.waLink(waNum(), c, waWho())) + '">WhatsApp ' + esc(waWho() || 'me') + '</a></div>';
    $('#sheet').hidden = false;
  }
  function photos(c) { var l = (c.images && c.images.length ? c.images : []).slice(0, 10); if (c.image && l.indexOf(c.image) === -1 && !l.length) l = [c.image]; return l; }
  function noPhoto(c) { return '<div class="ct-noimg-ph">' + esc(String(c.model || '').replace(/^BMW /, '')) + '<small>Photos coming soon</small></div>'; }
  /* Every photo starts with a spinner. load clears it, error shows the model name. Each load is checked against the
     photo the card wants now, so a slow photo from an earlier card or filter can never blank the current one. */
  function photoHtml(c, i, dots) { var l = photos(c); if (!l.length) return '';
    var u = esc(l[i || 0]); return '<div class="ct-ph is-loading" data-i="' + (i || 0) + '" data-model="' + esc(String(c.model || '').replace(/^BMW /, '')) + '"><div class="ct-ph-bg" style="background-image:url(\'' + u + '\')"></div><span class="ct-spin" aria-hidden="true"></span><img class="ct-ph-img" src="' + u + '" data-want="' + u + '" alt="' + esc(c.model) + '" draggable="false"' + (dots ? '' : ' loading="lazy"') + '>' +
      (dots && l.length > 1 ? '<div class="ct-dots">' + l.map(function (_, k) { return '<i' + (k === (i || 0) ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' : '') + '</div>'; }
  function stepPhoto(el, c, dir) { var ph = $('.ct-ph', el), l = photos(c); if (!ph || l.length < 2) return false; var i = (+ph.getAttribute('data-i') + dir + l.length) % l.length;
    ph.setAttribute('data-i', i); var u = l[i], im = $('.ct-ph-img', ph); ph.classList.remove('is-broken'); ph.classList.add('is-loading'); im.setAttribute('data-want', u); im.src = u; settlePhotos(ph); $('.ct-ph-bg', ph).style.backgroundImage = "url('" + u.replace(/'/g, '%27') + "')";
    $$('.ct-dots i', ph).forEach(function (d, k) { d.className = k === i ? 'on' : ''; }); platform.haptic(6); return true; }
  /* rev counter: 0 to 100 over 240 degrees, red line from 85 */
  function gauge(sc) { var a0 = -210, sweep = 240, r = 26, cx = 32, cy = 32;
    function pt(v, rr) { var a = (a0 + sweep * v / 100) * Math.PI / 180; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; }
    function arc(v1, v2, rr) { var p1 = pt(v1, rr), p2 = pt(v2, rr), big = (v2 - v1) * sweep / 100 > 180 ? 1 : 0; return 'M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + 'A' + rr + ' ' + rr + ' 0 ' + big + ' 1 ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1); }
    var ticks = ''; for (var t = 0; t <= 100; t += 10) { var q1 = pt(t, 22), q2 = pt(t, t % 50 ? 19.5 : 17.5); ticks += '<line x1="' + q1[0].toFixed(1) + '" y1="' + q1[1].toFixed(1) + '" x2="' + q2[0].toFixed(1) + '" y2="' + q2[1].toFixed(1) + '"/>'; }
    var n = pt(sc, 20);
    return '<div class="ct-gauge" role="img" aria-label="' + sc + ' percent match"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' +
      '<path d="' + arc(0, 100, r) + '" class="g-bg"/><path d="' + arc(85, 100, r) + '" class="g-red"/><path d="' + arc(0, Math.max(1, sc), r) + '" class="g-val"/>' +
      '<g class="g-tick">' + ticks + '</g><line class="g-needle" x1="32" y1="32" x2="' + n[0].toFixed(1) + '" y2="' + n[1].toFixed(1) + '"/><circle cx="32" cy="32" r="3" class="g-hub"/></svg>' +
      '<span class="g-num">' + sc + '<small>%</small></span><span class="g-lab">match</span></div>'; }
  function plate(reg) { return '<span class="ct-plate" aria-label="Registration ' + esc(reg) + '">' + esc(String(reg).replace(/^([A-Z]{2}\d{2})([A-Z]{3})$/, '$1 $2')) + '</span>'; }
  function finHtml(f) { return f ? '<div class="ct-repx"><b>' + esc(f.headline) + '</b><br><b>Representative example.</b> ' + esc(f.example) + '</div>' : '<p class="ct-mon">Monthly: ask for a quote</p>'; }
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  /* tyre tread marks behind the card while it is dragged */
  function treadTrail(el) { var cv = $('.ct-tread', el), ctx = cv && cv.getContext('2d'), pts = [];
    function size() { var r = el.getBoundingClientRect(); cv.width = r.width * 2; cv.height = r.height * 2; }
    return { draw: function (dx, dy) { if (!ctx || reduced()) return; if (!pts.length) size(); pts.push([dx, dy]); if (pts.length > 40) pts.shift();
        ctx.clearRect(0, 0, cv.width, cv.height); var col = dx > 0 ? '60,207,122' : '229,72,77';
        for (var i = 1; i < pts.length; i++) { var a = i / pts.length; ctx.strokeStyle = 'rgba(' + col + ',' + (a * 0.55) + ')'; ctx.lineWidth = 14; ctx.setLineDash([6, 5]);
          [cv.width * 0.3, cv.width * 0.7].forEach(function (x0) { ctx.beginPath(); ctx.moveTo(x0 - pts[i - 1][0] * 2, cv.height * 0.92 - pts[i - 1][1] * 2); ctx.lineTo(x0 - pts[i][0] * 2, cv.height * 0.92 - pts[i][1] * 2); ctx.stroke(); }); } },
      clear: function () { pts = []; if (ctx) ctx.clearRect(0, 0, cv.width, cv.height); } }; }
  function photoState(img, ok) { var ph = img.closest('.ct-ph'); if (!ph) return;
    var want = img.getAttribute('data-want'); if (want && img.getAttribute('src') !== want) return; /* stale load */
    ph.classList.remove('is-loading'); ph.classList.toggle('is-broken', !ok);
    if (!ok && !$('.ct-ph-fail', ph)) { var f = document.createElement('div'); f.className = 'ct-ph-fail'; f.textContent = ph.getAttribute('data-model') || 'Photo unavailable'; ph.appendChild(f); }
    if (ok) { var x = $('.ct-ph-fail', ph); if (x) x.remove(); } }
  document.addEventListener('load', function (e) { if (e.target.classList && e.target.classList.contains('ct-ph-img')) photoState(e.target, e.target.naturalWidth > 0); }, true);
  document.addEventListener('error', function (e) { if (e.target.classList && e.target.classList.contains('ct-ph-img')) photoState(e.target, false); }, true);
  /* photos already in the cache can finish before the listener sees them */
  function settlePhotos(root) { $$('.ct-ph-img', root).forEach(function (im) { if (im.complete) photoState(im, im.naturalWidth > 0); }); }
  function topCard() { return $('#deck .ct-card:last-child'); }
  var OVERLAYS = ['#sheet', '#matchModal', '#buyModal', '#iosGuide'];
  function openOverlays() { return OVERLAYS.map(function (s) { return $(s); }).filter(function (el) { return el && !el.hidden; }); }
  function closeOverlay(el) { if (!el) return; el.hidden = true; if (el.id === 'matchModal') { var c = $('#confetti'); try { c.getContext('2d').clearRect(0, 0, c.width, c.height); } catch (e) {} } }
  function initDeck() {
    $('#btnLike').addEventListener('click', function () { var t = topCard(); if (t && t._fling) t._fling(1); });
    $('#btnPass').addEventListener('click', function () { var t = topCard(); if (t && t._fling) t._fling(-1); });
    $('#btnSuper').addEventListener('click', function () { var t = topCard(); if (t && t._fling) t._fling(2); });
    $('#btnInfo').addEventListener('click', function () { if (S.deck[0]) openSheet(S.deck[0]); });
    /* While any pop up or sheet is open the deck takes no input at all, and Escape closes the top one. */
    document.addEventListener('keydown', function (e) { var open = openOverlays();
      if (open.length) { if (e.key === 'Escape') { e.preventDefault(); closeOverlay(open[open.length - 1]); } else if (/^Arrow/.test(e.key) && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) e.preventDefault(); return; }
      if ($('[data-screen=discover]').hidden || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
      if (e.repeat) { if (/^Arrow/.test(e.key)) e.preventDefault(); return; } /* holding a key never swipes cards unseen */
      if (e.key === 'ArrowRight') { e.preventDefault(); $('#btnLike').click(); } if (e.key === 'ArrowLeft') { e.preventDefault(); $('#btnPass').click(); } if (e.key === 'ArrowUp') { e.preventDefault(); $('#btnSuper').click(); } });
    ['#btnLike', '#btnPass', '#btnSuper'].forEach(function (s) { $(s).addEventListener('click', function (e) { if (openOverlays().length) e.stopImmediatePropagation(); }, true); });
    $('#deck').addEventListener('pointerdown', function (e) { if (openOverlays().length) e.stopPropagation(); }, true);
    $$('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closeOverlay(b.closest('.ct-sheet,.ct-match,.ct-ios')); }); });
    $('#sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') e.target.hidden = true; });
  }

  /* ---------------- matches ---------------- */
  function liked() { return Object.keys(S.swipes).filter(function (r) { return S.swipes[r].liked; }).sort(function (a, b) { return S.swipes[b].at - S.swipes[a].at; }).map(byReg).filter(Boolean); }
  function badge() { var n = liked().length, b = $('#matchBadge'); b.hidden = !n; b.textContent = n; }
  function showMatches() {
    var L = liked(), staff = S.session.role !== 'customer';
    $('#mSub').textContent = L.length ? (staff ? 'Everything ' + (S.cust.name || 'your customer') + ' liked.' : 'Every car you swiped right on. Message ' + (waWho() || 'me') + ' about any of them.') : 'No matches yet. Swipe right on a car you like.';
    $('#matchList').innerHTML = L.map(function (c) { var f = M.finance(c), isNew = c.kind === 'new';
      return '<article class="ct-m">' + (isNew ? '<div class="ct-noimg">' + esc(c.model.replace(/^BMW /, '')) + '</div>' : photos(c).length ? photoHtml(c, 0, false) : '<div class="ct-noimg">' + esc(String(c.model || '').replace(/^BMW /, '')) + '<small>Photos coming soon</small></div>') +
        '<div class="ct-m-b">' + (S.swipes[c.reg] && S.swipes[c.reg].shortlisted ? '<span class="ct-keys">Keys please</span>' : '') + (isNew ? '' : plate(c.reg)) + '<h3>' + esc(c.model) + '</h3><p>' + esc(isNew ? 'Brand new, ' + c.group : [c.year, c.mileage, c.fuel, c.source === 'group' ? 'I can source this one' : 'On my forecourt'].filter(Boolean).join(' \u00b7 ')) + '</p>' +
        (isNew ? '<p>I quote new car figures live.</p>' : '<div class="ct-price">' + esc(c.price || 'Price on request') + '</div>' + finHtml(f)) +
        '<div class="ct-row"><a class="ct-btn ct-wa" target="_blank" rel="noopener" href="' + esc(M.waLink(waNum(), c, waWho())) + '">WhatsApp about ' + esc(isNew ? 'this model' : M.normReg(c.reg)) + '</a></div>' +
        '<button class="ct-btn ct-btn-big ct-buy" type="button" data-buy="' + esc(c.reg) + '">Buy this car</button>' +
        '<button class="ct-unlike" type="button" data-unlike="' + esc(c.reg) + '">Remove from matches</button></div></article>'; }).join('');
    $('#sendBox').hidden = !L.length; $('#sendBtn').textContent = staff ? 'Send these matches to Dan' : 'Send my matches to ' + (S.owner && S.owner.name ? S.owner.name.split(' ')[0] : 'Dan');
  }
  function initMatches() {
    $('#matchList').addEventListener('click', function (e) { var bb = e.target.closest('[data-buy]'); if (bb) { var car = byReg(bb.getAttribute('data-buy')); if (car) askBuy(car); return; } });
    $('#buyYes').addEventListener('click', confirmBuy);
    $('#matchList').addEventListener('click', function (e) { var b = e.target.closest('[data-unlike]'); if (!b) return; var r = b.getAttribute('data-unlike'); S.swipes[r] = { liked: false, at: Date.now() }; saveSwipe(r, false); showMatches(); badge(); });
    $('#sendBtn').addEventListener('click', sendLead);
  }
  function sendLead() {
    var c = S.cust, L = liked(), msg = $('#sendMsg'), px = c.px || {};
    var lead = 'CT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    var body = { _subject: 'Swipe Drive matches: ' + (c.name || '') + ' (' + L.length + ')', form_page: 'swipe-drive', lead_id: lead, name: c.name, phone: c.phone, email: c.email || S.session.email, postcode: c.postcode,
      budget: c.budget_type === 'cash' ? 'Cash up to \u00a3' + (c.cash_gbp || '?') : 'Monthly up to \u00a3' + (c.monthly_gbp || '?'), deposit: c.deposit_gbp || '', annual_mileage: c.annual_mileage,
      colours: (c.colours || []).join(', ') || 'Any', colours_must_have: (c.colours_must || []).join(', '), specs_wanted: (c.specs || []).map(function (k) { var o = M.specOptions().find(function (x) { return x.key === k; }); return o ? o.label : k; }).join(', '), specs_must_have: (c.specs_must || []).map(function (k) { var o = M.specOptions().find(function (x) { return x.key === k; }); return o ? o.label : k; }).join(', '),
      fuel: c.fuel, body_or_size: c.body, models_of_interest: (c.models || []).join(', '), new_or_used: c.new_used,
      px_reg: px.reg || 'None', px_mileage: px.mileage || '', px_condition: px.condition || '', px_finance_outstanding: c.px_settlement_gbp != null ? c.px_settlement_gbp : px.finance_outstanding == null ? '' : px.finance_outstanding,
px_valuation_from_dan: c.px_valuation_gbp == null ? '' : M.gbp(c.px_valuation_gbp), px_valued_on: c.px_valued_on ? fmtDate(c.px_valued_on) : '', px_valuation_entered_by: c.px_valuation_gbp == null ? '' : c.px_valuation_set_by === 'customer' ? 'Customer' : (c.px_valuation_set_by_name || 'Dan'),
      px_settlement_figure: c.px_settlement_gbp == null ? '' : M.gbp(c.px_settlement_gbp), px_settlement_valid_until: c.px_settlement_valid_until ? fmtDate(c.px_settlement_valid_until) : '',
      px_condition_ratings: ratingsText(c.px_condition_ratings), px_terms_confirmed_at: c.px_terms_confirmed_at ? new Date(c.px_terms_confirmed_at).toLocaleString('en-GB') + ' by ' + (c.px_terms_confirmed_by || '') : '',
      px_equity: equity(c) ? equity(c).label + ': ' + equity(c).text : '',
            px_photo_links: (px.photos || []).map(function (p) { return p.link; }).filter(Boolean).join(' ') || ((px.photos || []).length ? (px.photos.length + ' photo(s) on the customer device, demo mode, not uploaded') : 'None'),
      liked_regs: L.filter(function (x) { return x.kind !== 'new'; }).map(function (x) { return x.reg; }).join(', '),
      liked_new_models: L.filter(function (x) { return x.kind === 'new'; }).map(function (x) { return x.model; }).join(', '),
      liked_cars: L.map(function (x) { return x.model + (x.kind === 'new' ? ' (new)' : ' ' + x.reg + ' ' + (x.price || '')); }).join(' | '),
      owner_staff_name: S.owner ? (S.owner.name || '') : (S.session.role === 'staff' ? S.session.name : 'Dan'), owner_staff_email: S.owner ? (S.owner.email || '') : (S.session.role === 'staff' ? S.session.email : ''),
      submitted_by: S.session.role, app_mode: LIVE ? 'live' : 'demo' };
    msg.className = 'ct-msg'; msg.textContent = 'Sending...';
    saveBuyRequest({ type: 'matches', cars: L.map(function (x) { return { reg: x.reg, model: x.model, price: x.kind === 'new' ? '' : (x.price || ''), kind: x.kind }; }) }).then(function (r) { body.request_id = r ? r.id : ''; });
    fetch(CFG.FORMSPREE, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); msg.className = 'ct-msg ok'; msg.textContent = 'Sent. ' + (waWho() || 'Dan') + ' will be in touch, usually the same day.'; track('matches_sent', { count: L.length, lead_id: lead }); })
      .catch(function () { msg.textContent = 'That did not send. Tap WhatsApp on any car instead.'; });
  }

  /* ---------------- buy this car / buy requests ---------------- */
  /* Saves the lead in buy_requests, then asks the edge function to email Dan. If the function is not deployed
     yet the record is still saved and the customer still sees the confirmation and a WhatsApp fallback. */
  function saveBuyRequest(extra) {
    if (!S.cust) return Promise.resolve(null);
    var r = Object.assign({ id: uuid(), customer_id: S.cust.id }, extra);
    return Promise.resolve().then(function () { return store.buyRequest(r); })
      .then(function (row) { Promise.resolve().then(function () { return store.notifyBuy(row.id); }).catch(function (e) { console.warn('Swipe Drive notify', e); }); track('buy_request', { type: r.type }); return row; })
      .catch(function (e) { console.warn('Swipe Drive buy request', e); return null; });
  }
  function buyWa(c, ref) { var reg = c.kind === 'new' ? '' : ', reg ' + M.normReg(c.reg);
    return 'https://wa.me/' + String(waNum()).replace(/\D/g, '') + '?text=' + encodeURIComponent('Hi ' + (waWho() || 'Dan') + ', I would like to buy the ' + c.model + reg + (c.kind === 'new' || !c.price ? '' : ' (' + c.price + ')') + ' I found on Swipe Drive.' + (ref ? ' Ref ' + ref.slice(0, 8).toUpperCase() + '.' : '')); }
  function askBuy(c) { S.buyCar = c; var who = waWho() || 'Dan';
    $('#buyTitle').textContent = 'Buy the ' + c.model + '?'; $('#buyText').textContent = who + ' will call you to take a deposit and arrange collection.';
    $('#buyAsk').hidden = false; $('#buyDone').hidden = true; $('#buyYes').disabled = false; $('#buyModal').hidden = false; }
  function confirmBuy() { var c = S.buyCar; if (!c) return; var btn = $('#buyYes'); btn.disabled = true; btn.textContent = 'Sending...';
    saveBuyRequest({ type: 'buy', car_reg: c.reg, car_id: String(c.id || c.order_number || c.reg), car_model: c.model, car_price: c.kind === 'new' ? 'Brand new, quote live' : (c.price || '') }).then(function (row) {
      btn.textContent = 'Yes, buy this car'; var who = waWho() || 'Dan';
      $('#buyAsk').hidden = true; $('#buyDone').hidden = false;
      $('#buyDoneText').textContent = row ? 'Done. ' + who + ' has your request for the ' + c.model + ' and will call you to take a deposit and arrange collection.' : 'That did not reach ' + who + ' just now. Tap WhatsApp below so nothing is missed.';
      var a = $('#buyWa'); a.href = buyWa(c, row && row.id); a.textContent = row ? 'Or WhatsApp ' + who + ' now' : 'WhatsApp ' + who + ' about it';
      platform.haptic([20, 40, 20]); });
  }
  function showBuys() { var el = $('#buyList'); el.innerHTML = '<p class="ct-sub">Loading...</p>';
    store.buyRequests().then(function (l) {
      el.innerHTML = l.map(function (b) { var c = b.customers || {}, buy = b.type === 'buy';
        var what = buy ? esc(b.car_model || '') + (b.car_reg && !/^NEW-/.test(b.car_reg) ? ' <span class="ct-pill">' + esc(b.car_reg) + '</span>' : '') + (b.car_price ? ' · ' + esc(b.car_price) : '')
          : 'Sent ' + (b.cars || []).length + ' matches: ' + esc((b.cars || []).map(function (x) { return x.model + (x.kind === 'new' ? ' (new)' : ' ' + x.reg); }).join(', '));
        return '<div class="ct-c' + (b.status === 'new' ? ' ct-buy-new' : '') + '"><h3>' + esc(c.name || 'Customer') + ' <span class="ct-pill' + (buy ? ' hot' : '') + '">' + (buy ? 'Buy this car' : 'Matches') + '</span></h3><p>' + what + '</p>' +
          '<p>' + esc(new Date(b.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })) + (b.status === 'called' && b.called_at ? ' · Called ' + esc(new Date(b.called_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })) : '') + '</p>' +
          '<div class="ct-row">' + (c.phone ? '<a class="ct-btn ct-sm" href="tel:' + esc(String(c.phone).replace(/\s/g, '')) + '">Call ' + esc(c.phone) + '</a>' : '') +
          (b.status === 'called' ? '<button class="ct-btn ct-btn-ghost ct-sm" type="button" data-buy-st="new" data-id="' + esc(b.id) + '">Called ✓ (undo)</button>' : '<button class="ct-btn ct-btn-ghost ct-sm" type="button" data-buy-st="called" data-id="' + esc(b.id) + '">Mark as called</button>') + '</div></div>'; }).join('') || '<p class="ct-sub">No buy requests yet.</p>';
    }).catch(function (e) { el.innerHTML = '<p class="ct-msg">' + esc(plainErr(e)) + '</p>'; });
  }
  function initBuys() {
    $('#buyList').addEventListener('click', function (e) { var b = e.target.closest('[data-buy-st]'); if (!b) return; b.disabled = true;
      store.setBuyStatus(b.getAttribute('data-id'), b.getAttribute('data-buy-st')).then(showBuys).catch(function (err) { b.disabled = false; toast(plainErr(err)); }); });
  }

  /* ---------------- me ---------------- */
  function showMe() {
    var c = S.cust || {}, staff = S.session.role !== 'customer', none = staff && !S.cust;
    $$('[data-cust-only]').forEach(function (e) { e.hidden = none; });

    $('#meName').textContent = staff ? (c.name || 'Customer') : (c.name || 'You'); $('#meEmail').textContent = staff ? 'Signed in as ' + S.session.email : S.session.email;
    var b = c.budget_type === 'cash' ? (c.cash_gbp ? 'Up to ' + M.gbp(c.cash_gbp) : '') : (c.monthly_gbp ? 'Up to ' + M.gbp(c.monthly_gbp) + ' a month' : '');
    $('#meSummary').innerHTML = '<dl><dt>Budget</dt><dd>' + esc(b || 'Not set') + '</dd><dt>Fuel</dt><dd>' + esc(c.fuel === 'open' ? 'Open minded' : c.fuel || '') + '</dd><dt>Colours</dt><dd>' + esc((c.colours || []).join(', ') || 'Any') + '</dd><dt>Spec</dt><dd>' + esc((c.specs || []).map(function (k) { var o = M.specOptions().find(function (x) { return x.key === k; }); return o ? o.label : k; }).join(', ') || 'Any') + '</dd><dt>Models</dt><dd>' + esc((c.models || []).join(', ') || 'Any') + '</dd><dt>Part exchange</dt><dd>' + esc(c.px && c.px.reg ? c.px.reg : 'None') + '</dd></dl>' + pxMoneyHtml(c);
    $('#boughtBtn').textContent = staff ? 'Record a bought car' : "I've bought my car";
    if (none) { $('#meName').textContent = 'Your account'; $('#meEmail').textContent = 'Signed in as ' + S.session.email + (S.session.role === 'admin' ? ' (admin)' : ''); }
    if (!none) store.purchases(c.id).then(function (ps) { $('#meBought').innerHTML = ps.filter(function (p) { return !p.cancelled; }).map(purchaseHtml).join('') || '<p class="ct-sub">Nothing recorded yet.</p>'; });
    var custEmail = !!CFG.CUSTOMER_EMAIL_ENABLED || staff; $$('[data-email-opt]').forEach(function (e) { e.hidden = !custEmail; });
    store.notify().then(function (v) { if (!custEmail && (v === 'email' || v === 'both')) v = 'push';
      /* only say On when this phone really has permission */
      if ((v === 'push' || v === 'both') && (!platform.pushSupported() || Notification.permission !== 'granted')) v = v === 'both' ? 'email' : 'off';
      notifyState(v); });
    termsBox();
    installInfo();
  }
  function notifyState(v) { $$('#notifySeg button').forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-v') === v ? 'true' : 'false'); });
    var on = v === 'push' || v === 'both'; $('#notifyState').textContent = 'Phone notifications: ' + (on ? 'On' : 'Off, tap Turn on to hear when a car fits you') + (v === 'email' || v === 'both' ? '. Email alerts: On' : '');
    var b = $('#notifySeg [data-v=push]'); if (b) b.textContent = on ? 'On' : 'Turn on'; }
  /* The site notice on the Me page: only says confirmed after this person pressed Confirm here (or on the site). */
  var TERMS = 'This website has been created by Dan to bring his views and the information that matters into one easy place for you. It is Dan\u2019s personal website and is not the official website of BMW or Hedin Automotive. Full terms and conditions can be found <a href="../terms.html" target="_blank" rel="noopener">here</a>.';
  function termsAt() { try { return localStorage.getItem('sdTermsAt') || ''; } catch (e) { return ''; } }
  function termsBox() { var el = $('#meTerms'); if (!el) return; var at = termsAt();
    el.innerHTML = '<h3>Please read and confirm</h3><p class="ct-sub">' + TERMS + '</p>' + (at ? '<p class="ct-msg ok">You confirmed this on ' + esc(new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })) + '.</p>'
      : '<p class="ct-sub">Not confirmed yet.</p><div class="ct-row"><button class="ct-btn" type="button" id="termsOk">Confirm and continue</button></div>'); }
  function purchaseHtml(p) { var ins = (p.insurances || []).map(function (i) { return (i.type === 'other' && i.label ? i.label : INS_L[i.type]) + (i.ends_on ? ', ends ' + fmtDate(i.ends_on) : ''); });
    return '<div class="ct-c"><h3>' + esc(p.model) + ' <span class="ct-pill">' + esc(p.reg) + '</span></h3><p>Bought ' + esc(fmtDate(p.purchase_date)) + ', ' + esc(String(p.finance_type).toUpperCase()) + (p.term_months ? ' over ' + esc(p.term_months) + ' months' : '') + '</p>' +
      (ins.length ? '<p>Cover: ' + esc(ins.join('; ')) + '</p>' : '') + '<p><span class="ct-pill hot">Reminder ' + esc(fmtDate(p.remind_on || addMonths(p.purchase_date, 33))) + '</span></p>' +
      '<div class="ct-row"><button class="ct-btn ct-btn-ghost ct-sm" type="button" data-edit-p="' + esc(p.id) + '">Edit</button><button class="ct-btn ct-btn-ghost ct-sm" type="button" data-cancel-p="' + esc(p.id) + '">Cancel reminder</button></div></div>'; }
  function initMe() {
    $('#notifySeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var v = b.getAttribute('data-v'); var msg = $('#notifyMsg'); msg.className = 'ct-msg';
      notifyState(v);
      store.setNotify(v); track('notify_pref', { value: v });
      if (v !== 'push' && v !== 'both') { msg.textContent = v === 'off' ? 'Phone notifications are off.' : 'Email alerts are on.'; return; }
      if (platform.ios && !platform.standalone) { $('#iosGuide').hidden = false; msg.textContent = 'Add the app to your Home Screen first, then turn alerts on from there.'; return; }
      if (!platform.pushSupported()) { msg.textContent = 'This browser does not support phone alerts.'; return; }
      platform.subscribePush().then(function (sub) { return store.savePush(sub); }).then(function (saved) { msg.className = 'ct-msg ok'; msg.textContent = saved ? 'Alerts are on. I will tell you when a new car fits.' : 'Alerts allowed on this phone. They start once the backend is connected (demo mode).'; track('push_enabled'); })
        .catch(function () { notifyState('off'); store.setNotify('off'); msg.textContent = 'Notifications were not allowed. You can switch them on in your phone settings, then tap Turn on again.'; }); });
    $('#meBought').addEventListener('click', purchaseClick);
    $('#meTerms').addEventListener('click', function (e) { if (!e.target.closest('#termsOk')) return; try { localStorage.setItem('sdTermsAt', new Date().toISOString()); localStorage.setItem('dsc_ack', '1'); } catch (x) {} termsBox(); track('terms_confirmed'); toast('Thanks, confirmed'); });
    $('#signOut').addEventListener('click', function () { store.signOut().then(function () { S.session = S.cust = null; sessionStorage.removeItem('ctActing'); location.hash = 'signin'; }); });
  }
  function purchaseClick(e) {
    var ed = e.target.closest('[data-edit-p]'), ca = e.target.closest('[data-cancel-p]'); if (!ed && !ca) return;
    var id = (ed || ca).getAttribute(ed ? 'data-edit-p' : 'data-cancel-p'); var cid = (ed || ca).closest('[data-cid]'); cid = cid ? cid.getAttribute('data-cid') : S.cust.id;
    var pre = cid !== (S.cust && S.cust.id) ? setActing(cid) : Promise.resolve();
    pre.then(function () { return store.purchases(S.cust.id); }).then(function (ps) { var p = ps.find(function (x) { return x.id === id; }); if (!p) return;
      if (ca) { if (!confirm('Cancel the reminder for ' + p.reg + '?')) return; p.cancelled = true; store.savePurchase(p).then(function () { return S.session.role !== 'customer' && S.cust.dealt_purchase_id === p.id ? store.markDealt(S.cust.id, null) : null; }).then(function () { toast('Reminder cancelled'); route(); }); }
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
      var btn = $('button[type=submit]', f); busy(btn, true); msg.textContent = '';
      store.savePurchase(p).then(function (saved) { var stf = S.session.role !== 'customer'; return (stf ? store.markDealt(S.cust.id, (saved && saved.id) || p.id) : Promise.resolve()).then(function () { return stf; }); })
        .then(function (stf) { busy(btn, false); S.editPurchase = null; track('bought_saved', { finance_type: ft, by: S.session.role }); toast(stf ? 'Marked as dealt. Alerts paused until ' + fmtDate(addMonths(p.purchase_date, 33)) : 'Saved. Reminder set for ' + fmtDate(addMonths(p.purchase_date, 33))); go(stf ? 'team' : 'me'); })
        .catch(function (err) { busy(btn, false); msg.textContent = plainErr(err); }); });
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
            (c.px && c.px.reg ? '<p>PX ' + esc(c.px.reg) + (c.px_terms_confirmed_at ? ' \u00b7 terms confirmed ' + esc(new Date(c.px_terms_confirmed_at).toLocaleDateString('en-GB')) : '') + '</p>' : '') + (ratingsText(c.px_condition_ratings) ? '<p>' + esc(ratingsText(c.px_condition_ratings)) + '</p>' : '') + pxMoneyHtml(c) +
            (c.due_to_change_at ? '<p><span class="ct-pill due">Due to change</span> Back on matching since ' + esc(fmtDate(String(c.due_to_change_at).slice(0, 10))) + (c.px && c.px.equity_assumed_gbp === 0 ? '. PX equity assumed \u00a30 until valued' : '') + '</p>' : '') +
            (c.dealt_at ? '<p><span class="ct-pill">Dealt</span> Alerts paused' + (p ? ' until <b>' + esc(fmtDate(p.remind_on || addMonths(p.purchase_date, 33))) + '</b>' : '') + '</p>' : '') +
            (p ? '<p>Bought ' + esc(p.model) + ' (' + esc(p.reg) + '). Reminder <b>' + esc(fmtDate(p.remind_on || addMonths(p.purchase_date, 33))) + '</b></p>' : '') +
            '<div class="ct-row"><button class="ct-btn ct-sm" type="button" data-act="swipe">Swipe for them</button><button class="ct-btn ct-btn-ghost ct-sm" type="button" data-act="matches">Shortlist</button><button class="ct-btn ct-btn-ghost ct-sm" type="button" data-act="edit">Edit</button><button class="ct-btn ct-btn-ghost ct-sm" type="button" data-act="bought">' + (p ? 'Edit bought car' : 'Mark as dealt') + '</button>' +
            (c.dealt_at ? '<button class="ct-btn ct-btn-ghost ct-sm" type="button" data-act="resume">Resume alerts</button>' : '') +
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
        else if (act === 'resume') store.markDealt(id, null).then(function () { toast('Alerts back on for ' + (S.cust.name || 'this customer')); showTeam(); }).catch(function (err) { toast(plainErr(err)); });
        else if (act === 'claim') { if (!LIVE) { toast('Demo mode: the claim email is sent once the backend is connected'); return; }
          sb.from('customer_claims').insert({ customer_id: id, email: S.cust.email, created_by: sbUser.id }).select().single().then(function (r) { if (r.error) throw r.error;
            return sb.auth.signInWithOtp({ email: S.cust.email, options: { emailRedirectTo: APP_URL + '?claim=' + r.data.id } }); }).then(function () { toast('Claim link sent to ' + S.cust.email); }).catch(function () { toast('That did not send'); }); }
      }); });
  }
  function showInvites() { store.invites().then(function (l) { $('#invList').innerHTML = l.map(function (i) { return '<div class="ct-c"><h3>' + esc(i.name) + '</h3><p>' + esc(i.email) + ' \u00b7 WhatsApp ' + esc(i.whatsapp) + '</p><p><span class="ct-pill' + (i.accepted_at ? '' : ' hot') + '">' + (i.accepted_at ? 'Signed in' : 'Invited, waiting') + '</span></p></div>'; }).join(''); }); }
  function initInvites() { $('#inviteForm').addEventListener('submit', function (e) { e.preventDefault(); var el = e.target.elements, msg = $('#invMsg');
    var inv = { name: el.name.value.trim(), email: el.email.value.trim().toLowerCase(), whatsapp: el.whatsapp.value.replace(/\D/g, '').replace(/^0/, '44') };
    var f = e.target, btn = $('button[type=submit]', f); if (btn.disabled) return; clearErrs(f); banner(f, ''); msg.textContent = ''; $('#invShare').hidden = true;
    var bad = [];
    if (!inv.name) bad.push(fieldErr(f, 'name', 'Add their name.'));
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(inv.email)) bad.push(fieldErr(f, 'email', 'Add the email they will sign in with.'));
    if (inv.whatsapp.length < 11) bad.push(fieldErr(f, 'whatsapp', 'Add their full mobile number, for example 07700 900000.'));
    bad = bad.filter(Boolean); if (bad.length) { bad[0].focus(); return; }
    busy(btn, true, 'Inviting...');
    var prior = store.findProfile ? store.findProfile(inv.email) : Promise.resolve(null);
    prior.then(function (p) { return store.invite(inv).then(function () { return p; }); }).then(function (p) { busy(btn, false);
        var already = p && p.role === 'customer';
        banner(f, LIVE ? 'Invite saved for ' + inv.name + '. No email is sent, so send them the message below.' + (already ? ' Note: ' + inv.email + ' has already signed in once as a customer, so ask Dan to switch their role to staff.' : '') : 'Saved in demo mode. No email is sent.', true);
        shareInvite(inv); f.reset(); showInvites(); toast('Invite saved'); track('staff_invited'); })
      .catch(function (err) { busy(btn, false); console.warn('invite', err); banner(f, plainErr(err)); }); }); }
  function shareInvite(inv) { var link = location.origin + '/swipe-drive/';
    var text = 'Hi ' + inv.name.split(' ')[0] + ', I have added you to Swipe Drive. Open ' + link + ' and sign in with ' + inv.email + ' (that exact email). You will get a sign in link and code by email, and you will see your customers once you are in. Dan';
    var box = $('#invShare'); box.hidden = false; $('#invShareText').textContent = text;
    $('#invWa').href = 'https://wa.me/' + inv.whatsapp + '?text=' + encodeURIComponent(text);
    $('#invCopy').onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Invite message copied'); }, function () {
      var r = document.createRange(); r.selectNodeContents($('#invShareText')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Message selected, copy it'); }); }; }

  /* ---------------- install ---------------- */
  function installInfo() {
    var el = $('#installInfo');
    if (platform.standalone) { el.innerHTML = '<p class="ct-sub">You are using the app. Nice.</p>'; return; }
    if (platform.ios) { el.innerHTML = '<p class="ct-sub">Add Swipe Drive to your Home Screen to use it like an app and get alerts.</p><button class="ct-btn ct-btn-ghost" type="button" id="iosOpen">Show me how</button>'; $('#iosOpen').onclick = function () { $('#iosGuide').hidden = false; track('ios_guide_open'); }; return; }
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
  initSignin(); initProfile(); initDeck(); initMatches(); initMe(); initBought(); initTeam(); initInvites(); initBuys();
  var dl = platform.deepLink();
  (LIVE ? supa.init() : Promise.resolve())
    .then(function () { if (LIVE) sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_IN' && !S.session) store.session().then(afterSignIn); if (ev === 'SIGNED_OUT') { S.session = S.cust = null; route(); } }); return loadStock(); })
    .then(function () {
      try { var prev = JSON.parse(localStorage.getItem('ctSeenRegs') || 'null'); S.fresh = {}; if (prev) { var ps = {}; prev.forEach(function (r) { ps[r] = 1; }); S.cars.forEach(function (c) { if (!ps[c.reg]) S.fresh[c.reg] = 1; }); }
        localStorage.setItem('ctSeenRegs', JSON.stringify(S.cars.map(function (c) { return c.reg; }))); } catch (e) {}
      return store.session(); })
    .then(function (sess) { if (sess && LIVE && dl.claim) return supa.claim(dl.claim).then(function () { history.replaceState(null, '', location.pathname); return store.session(); }); return sess; })
    .then(function (sess) { if (sess) track('sign_in', { method: LIVE ? 'magic_link' : 'demo', role: sess.role }); return sess ? afterSignIn(sess) : route(); })
    .then(function () { var l = $('#loader'); if (l) l.hidden = true; })
    .then(iosNudge)
    .catch(function (e) { console.warn('Swipe Drive start', e); route(); var l = document.getElementById('loader'); if (l) l.hidden = true; });
  window.ctDebug = { S: S, store: store, platform: platform, route: route };
})();
