/* santa.js - the Ruxley Secret Santa app (santa/index.html). Dan, 9 November 2026.
 *
 * Who is who: the same Firebase sign in as the Team app (work email and PIN, or
 * Google). A member is keyed by their email, lower case, with '.' as ','; the
 * database rules work out the same key from the signed in, verified email, so
 * every read of a pairing is personal and enforced by the server:
 *   R/assign/<me>      only I can read who I have
 *   R/wish/<k>         I can read my own, and my giftee's
 *   R/notes/<me>       anonymous notes my Santa sent me
 *   R/sealed           the whole list: only Dan, and only after R/uncovered/<drawId>
 *                      is written (permanent, and shown to everyone)
 * The draw itself runs on the server (scripts/santa-draw.js), so no browser,
 * the organiser's included, ever holds the whole list.
 * R is santa, or santaTest with ?practice=1.
 */
(function (root) {
  'use strict';
  var CREATOR = 'daniel.cane@hedinautomotive.co.uk';
  var PRACTICE = /[?&]practice=1\b/.test(location.search);
  var R = PRACTICE ? 'santaTest' : 'santa';
  var SV = { '.sv': 'timestamp' };
  var B = null, user = null, me = null, view = 'home', unsub = [], orgUnsub = [];
  var D = { settings: {}, launched: null, launchReq: null, member: undefined, members: null, draw: null, req: null, err: null, assign: null, giftWish: null, myWish: null, notes: {}, uncovered: {}, audit: {}, excl: {}, sealed: null, admin: false, link: null, managers: {}, team: {}, replies: {} };
  var giftWishUnsub = null, sealedUnsub = null, splashUntil = Date.now() + 1400;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function K(email) { return String(email || '').trim().toLowerCase().split('.').join(','); }
  function toast(t) { var x = $('toast'); x.textContent = t; x.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { x.classList.remove('show'); }, 2600); }
  function say(id, t, ok) { var m = $(id); m.textContent = t || ''; m.className = 'msg ' + (ok ? 'ok' : 'bad'); }
  function when(ts) { return typeof ts === 'number' ? new Date(ts).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'just now'; }
  function isAdmin() { return !!user && user.emailVerified && (D.admin || String(user.email).toLowerCase() === CREATOR); }
  function isOrg() { return isAdmin() || !!(D.link && D.managers && D.managers[D.link]); }
  function myName() { return (D.member && D.member.name) || (D.team[D.link] || D.managers[D.link] || {}).name || String(user && user.email || '').split('@')[0]; }
  function watch(list, path, cb) { list.push(B.watch(path, function (v) { cb(v); paint(); })); }
  function clear(list) { list.splice(0).forEach(function (u) { if (typeof u === 'function') u(); }); }

  /* ---------- data ---------- */
  function subscribe() {
    clear(unsub); clear(orgUnsub); orgOn = false;
    D.member = undefined; D.members = null; D.assign = null; D.myWish = null; D.notes = {}; D.admin = false; D.link = null;
    if (!user || !user.emailVerified) return paint();
    me = K(user.email);
    watch(unsub, R + '/settings', function (v) { D.settings = v || {}; announceTimer(); });
    watch(unsub, 'staff/' + user.uid, function (v) { D.admin = v === true; orgCheck(); });
    if (/@hedinautomotive\.co\.uk$/i.test(user.email)) watch(unsub, 'shifts/links/' + user.uid, function (v) { D.link = v || null; orgCheck(); });
    watch(unsub, 'lockup/config/managers', function (v) { D.managers = v || {}; orgCheck(); });
    watch(unsub, 'lockup/config/team', function (v) { D.team = v || {}; });
    watch(unsub, R + '/members/' + me, function (v) {
      var was = D.member; D.member = v || null;
      if (!!was !== !!D.member) memberSubs();
    });
  }
  var memUnsub = [], orgOn = false;
  var assignUnsub = null, annT = null;
  function assignSub() {
    if (assignUnsub) assignUnsub();
    assignUnsub = D.member ? B.watch(R + '/assign/' + me, function (v) { D.assign = v || null; gifteeSub(); paint(); }) : null;
  }
  /* the rules only open your pairing at the names time (and once live), so ask again then */
  function announceTimer() {
    clearTimeout(annT);
    var t = D.settings.announceTs;
    if (D.member && t && t > Date.now() && t - Date.now() < 864e5 * 20) annT = setTimeout(assignSub, t - Date.now() + 1500);
    if (D.member && !D.assign && namesOut()) assignSub();
  }
  function namesOut() { return D.settings.live === true; }
  function memberSubs() {
    clear(memUnsub);
    if (!D.member) return;
    assignSub(); announceTimer();
    watch(memUnsub, R + '/wish/' + me, function (v) { D.myWish = v || null; fillWish(); });
    watch(memUnsub, R + '/notes/' + me, function (v) { D.notes = v || {}; });
    commonSubs(memUnsub);
  }
  function commonSubs(list) {
    watch(list, R + '/launched', function (v) { D.launched = v || null; });
    watch(list, R + '/members', function (v) { D.members = v || {}; });
    watch(list, R + '/draw', function (v) { D.draw = v || null; });
    watch(list, R + '/drawRequest', function (v) { D.req = v || null; });
    watch(list, R + '/uncovered', function (v) { D.uncovered = v || {}; });
  }
  function orgCheck() {
    var o = isOrg();
    if (o === orgOn) return;
    orgOn = o; clear(orgUnsub);
    if (!o) return;
    if (!D.member) commonSubs(orgUnsub);
    watch(orgUnsub, R + '/exclusions', function (v) { D.excl = v || {}; });
    watch(orgUnsub, R + '/audit', function (v) { D.audit = v || {}; });
    watch(orgUnsub, R + '/drawError', function (v) { D.err = v || null; });
    watch(orgUnsub, R + '/launchRequest', function (v) { D.launchReq = v || null; });
    watch(orgUnsub, R + '/replies', function (v) { D.replies = v || {}; });
  }
  function gifteeSub() {
    if (giftWishUnsub) { giftWishUnsub(); giftWishUnsub = null; }
    D.giftWish = null;
    if (D.assign && D.assign.to) giftWishUnsub = B.watch(R + '/wish/' + D.assign.to, function (v) { D.giftWish = v || null; paint(); });
  }
  function audit(what) { return B.push(R + '/audit', { by: user.uid, name: myName().slice(0, 40), what: what, ts: SV }).catch(function () {}); }

  /* ---------- views ---------- */
  function show(v) {
    ['signin', 'unverified', 'notlisted', 'soon', 'home', 'wishes', 'elves'].forEach(function (x) { $('v-' + x).hidden = x !== v; });
    var app = (v === 'home' || v === 'wishes' || v === 'elves') && (isOrg() || D.settings.live === true);
    $('tabs').hidden = !app;
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); });
  }
  function paint() {
    if (Date.now() < splashUntil) { setTimeout(paint, splashUntil - Date.now() + 10); return; }
    $('splash').classList.add('gone');
    $('practice').hidden = !PRACTICE;
    if (user === undefined) return;
    if (!user) return show('signin');
    if (!user.emailVerified) { $('unv-email').textContent = user.email; pollVerified(); return show('unverified'); }
    if (D.member === undefined) return;
    var org = isOrg(), live = D.settings.live === true;
    $('tab-elves').hidden = !org;
    if (!live && !org) { paintSoon(); $('soon-org').hidden = true; return show('soon'); }
    if (!D.member && !org) { $('nl-email').textContent = user.email; return show('notlisted'); }
    if (!D.member && view !== 'elves') view = 'elves';
    if (!live && view === 'home') { show('home'); $('v-home').hidden = true; $('v-soon').hidden = false; $('soon-org').hidden = false; return paintSoon(); }
    $('v-soon').hidden = true;
    show(view);
    if (view === 'home') paintHome();
    if (view === 'wishes') paintWishes();
    if (view === 'elves') paintElves();
  }

  function exchangeMs() { var d = D.settings.exchange; return d ? Date.parse(d + 'T12:00:00Z') : null; }
  function longWhen(ms) { return new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(' am', 'am').replace(' pm', 'pm'); }
  function cdHtml(label, t) {
    var left = Math.max(0, t - Date.now()), dd = Math.floor(left / 864e5), hh = Math.floor(left % 864e5 / 36e5), mm = Math.floor(left % 36e5 / 6e4);
    return '<div class="cd-label">' + label + '</div><div class="cd"><div><b>' + dd + '</b><span>days</span></div><div><b>' + hh + '</b><span>hours</span></div><div><b>' + mm + '</b><span>mins</span></div></div>';
  }
  /* before the names time: count down to it; after: to the exchange day */
  function optInUntilMs() { return D.settings.optInUntil || Date.parse('2026-11-14T23:59:59+00:00'); }
  function countdown() {
    var until = optInUntilMs(), t = exchangeMs();
    if (D.settings.live !== true && until && Date.now() < until) return cdHtml('Opt in closes ' + esc(longWhen(until)), until);
    if (t) return cdHtml('Present exchange ' + esc(new Date(t).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })), t);
    return '<div class="cd-label">Names will be revealed when the elves launch it, after Saturday 14 November</div>';
  }
  function paintSoon() {
    var until = optInUntilMs();
    $('soon-count').innerHTML = D.settings.live !== true && until && Date.now() < until ? cdHtml('Opt in closes ' + esc(longWhen(until)), until) : '';
  }
  function paintHome() {
    $('hello').innerHTML = 'Merry Christmas, <b>' + esc(myName()) + '</b> &#127876;';
    var budget = D.settings.budget;
    var c = countdown();
    if (budget != null) c += '<div class="budget">&#128176; Spend up to <b>&pound;' + esc(budget) + '</b></div>';
    c += '<p class="small center meal-note">Presents are exchanged at the team meal on Saturday 5 December. If you&rsquo;re not coming to the meal, pop your gift in the bag and your presents will be given to you before you leave that day.</p>';
    $('count').innerHTML = c;
    var unc = D.draw && D.uncovered && D.uncovered[D.draw.id];
    $('uncovered-note').hidden = !unc;
    if (unc) $('uncovered-note').innerHTML = '&#128065; The organiser uncovered this year&rsquo;s list (' + esc(unc.name) + ', ' + esc(when(unc.ts)) + ').';

    var gz = $('gift-zone');
    if (!D.draw || !D.assign) {
      gz.removeAttribute('data-k');
      var n = D.members ? Object.keys(D.members).length : 0;
      gz.innerHTML = '<div class="paper center"><img class="banner" src="img/trees.jpg" alt=""><div class="hat">&#127877;</div><h2 class="xfont">The names are in the hat</h2><p>' + (D.req ? 'The elves are drawing right now. Your present appears here within 15 minutes.' : 'Once the organiser draws the names, your present appears here to unwrap.') + '</p><p class="small">' + n + ' elves on the list so far.</p></div>';
      $('giftee-zone').innerHTML = '';
      return;
    }
    var seen = localStorage.getItem('santaSeen_' + D.draw.id) === '1';
    var key = 'gz' + D.draw.id + (seen ? 'o' : 'w');
    if (gz.getAttribute('data-k') !== key) {
      gz.setAttribute('data-k', key);
      gz.innerHTML = seen ? openedCard() : wrappedGift();
      if (!seen) $('unwrap').onclick = unwrap;
      else $('rewrap').onclick = function () { localStorage.removeItem('santaSeen_' + D.draw.id); paint(); };
    }
    if (seen) paintGiftee(); else $('giftee-zone').innerHTML = '';
  }
  function wrappedGift() {
    return '<div class="giftbox" id="giftbox"><button class="present" id="unwrap" type="button" aria-label="Unwrap your present">' +
      '<span class="lid"><span class="bow"></span></span><span class="box"><span class="ribbon"></span></span><span class="tag">For you</span></button>' +
      '<p class="tap">Tap the present to see who you&rsquo;re Secret Santa for</p><p class="small center">Check nobody&rsquo;s looking over your shoulder &#129323;</p></div>';
  }
  function openedCard() {
    return '<div class="reveal"><div class="rcard"><div class="rk">You&rsquo;re Secret Santa for</div><div class="rname xfont">' + esc(D.assign.name) + '</div>' +
      '<div class="rsub">Shhh. Keep it to yourself until the exchange.</div>' +
      '<p class="small center meal-note">Presents are exchanged at the team meal on Saturday 5 December. If you&rsquo;re not coming to the meal, pop your gift in the bag and your presents will be given to you before you leave that day.</p></div>' +
      '<button class="link center" id="rewrap" type="button">Wrap it back up</button></div>';
  }
  function unwrap() {
    var b = $('giftbox');
    b.classList.add('opening');
    burst();
    setTimeout(function () { localStorage.setItem('santaSeen_' + D.draw.id, '1'); var gz = $('gift-zone'); gz.removeAttribute('data-k'); paint(); var r = document.querySelector('.reveal'); if (r) r.classList.add('pop'); }, 1300);
  }
  function paintGiftee() {
    var nm = esc(D.assign.name), w = D.giftWish;
    $('giftee-zone').innerHTML = '<div class="paper"><h2 class="xfont">' + nm + '&rsquo;s wishlist</h2>' +
      (w && w.text ? '<div class="scroll">' + esc(w.text).replace(/\n/g, '<br>') + '</div><p class="small">Updated ' + esc(when(w.ts)) + '</p>' : '<p class="small">' + nm + ' hasn&rsquo;t written a wishlist yet. Check back soon.</p>') +
      '</div><div class="paper"><h2 class="xfont">Send ' + nm + ' a note</h2><p class="small">It arrives signed &ldquo;Your Secret Santa&rdquo;. Your name is never stored with it.</p>' +
      '<textarea id="note-text" maxlength="280" rows="3" placeholder="A cheeky hint, a riddle, a festive threat&hellip;"></textarea><div class="row end"><button class="btn red sm" id="note-go" type="button">Send from Santa &#127877;</button></div><p class="msg" id="note-msg"></p></div>';
    $('note-go').onclick = function () {
      var t = $('note-text').value.trim();
      if (!t) return say('note-msg', 'Write something first.', false);
      B.push(R + '/notes/' + D.assign.to, { text: t, ts: SV }).then(function () { $('note-text').value = ''; say('note-msg', 'Sent. Ho ho ho.', true); }).catch(function () { say('note-msg', 'That didn\u2019t send. Try again.', false); });
    };
  }

  var CHIPS = ['Chocolate', 'Something for the car', 'Socks are fine', 'No alcohol please', 'Coffee lover', 'Surprise me'];
  function fillWish() { var t = $('wish-text'); if (t && document.activeElement !== t) t.value = (D.myWish && D.myWish.text) || ''; left(); }
  function left() { $('wish-left').textContent = (600 - $('wish-text').value.length) + ' characters left'; }
  function paintWishes() {
    var ns = Object.keys(D.notes || {}).map(function (k) { return D.notes[k]; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    $('notes-in').innerHTML = ns.length ? ns.map(function (n) { return '<div class="note"><p>' + esc(n.text) + '</p><span>Your Secret Santa &#127877; ' + esc(when(n.ts)) + '</span></div>'; }).join('') :
      '<p class="small">Nothing yet. Your Santa can send you an anonymous note once the names are drawn.</p>';
  }

  function memberList() { var m = D.members || {}; return Object.keys(m).map(function (k) { return Object.assign({ k: k }, m[k]); }).sort(function (a, b) { return String(a.name).localeCompare(b.name); }); }
  function paintElves() {
    var drawn = !!D.draw, list = memberList();
    if (document.activeElement !== $('set-budget')) $('set-budget').value = D.settings.budget != null ? D.settings.budget : '';
    if (document.activeElement !== $('set-date')) $('set-date').value = D.settings.exchange || '';
    if ($('set-announce') && document.activeElement !== $('set-announce')) $('set-announce').value = D.settings.announce || '';
    $('set-rem').checked = D.settings.reminders !== false;
    var adm = isAdmin();
    ['set-budget', 'set-date', 'set-rem', 'set-save'].forEach(function (id) { if ($(id)) $(id).disabled = !adm; });
    $('set-who').hidden = adm;
    $('hq-count').innerHTML = countdown();
    paintLaunch(list, adm);
    paintReplies();
    $('mem-count').textContent = list.length;
    $('mem-locked').hidden = !drawn; $('mem-tools').hidden = drawn;
    $('people').innerHTML = list.map(function (p) {
      return '<li><span class="av">' + esc(String(p.name || '?').charAt(0)) + '</span><span class="pn"><b>' + esc(p.name) + '</b><small>' + esc(p.email) + '</small></span>' +
        '<span class="tagp ' + (p.extra ? 'x' : '') + '">' + (p.extra ? 'Extra' : 'Team') + '</span>' + (drawn ? '' : '<button class="rm" data-rm="' + esc(p.k) + '" type="button" aria-label="Remove ' + esc(p.name) + '">&times;</button>') + '</li>';
    }).join('') || '<li class="small">Nobody yet. Add the team, then anyone extra.</li>';
    var opts = '<option value="">Pick someone</option>' + list.map(function (p) { return '<option value="' + esc(p.k) + '">' + esc(p.name) + '</option>'; }).join('');
    ['ex-a', 'ex-b'].forEach(function (id) { var s = $(id), v = s.value; if (s.getAttribute('data-o') !== opts) { s.innerHTML = opts; s.setAttribute('data-o', opts); s.value = v; } });
    var nm = function (k) { return ((D.members || {})[k] || {}).name || k; }, ex = [];
    Object.keys(D.excl || {}).forEach(function (a) { Object.keys(D.excl[a] || {}).forEach(function (b) { ex.push([a, b]); }); });
    $('ex-list').innerHTML = ex.map(function (e) { return '<li><span class="pn">' + esc(nm(e[0])) + ' &#10052; ' + esc(nm(e[1])) + '</span><button class="rm" data-exrm="' + esc(e[0] + '|' + e[1]) + '" type="button" aria-label="Remove">&times;</button></li>'; }).join('');
    var ds = '';
    if (D.req) ds = '<div class="drawing"><span class="spin">&#10052;</span><div><b>' + (D.req.mode === 'cancel' ? 'Cancelling the draw' : 'The elves are drawing the names') + '</b><p class="small">Asked by ' + esc(D.req.byName) + ' ' + esc(when(D.req.ts)) + '. It happens on the server within 15 minutes (Monday to Saturday daytime), so no screen ever sees the list.</p></div></div>';
    else if (drawn) ds = '<p>&#9989; Drawn ' + esc(when(D.draw.ts)) + (D.draw.byName ? ' (asked for by ' + esc(D.draw.byName) + ')' : '') + '. <b>' + esc(D.draw.count) + '</b> people each have one name.</p><div class="row"><button class="btn ghost sm" id="redraw" type="button">Draw again</button><button class="btn ghost sm danger" id="cancel-draw" type="button">Cancel the draw</button></div>';
    else ds = '<p>Everyone on the list gets one name. Nobody gets themselves, and the pairs you keep apart never meet.</p><button class="btn red big" id="draw-go" type="button"' + (list.length < 3 ? ' disabled' : '') + '>&#127877; Draw the names</button>' + (list.length < 3 ? '<p class="small">You need at least three people.</p>' : '');
    if (D.err && !D.req) ds += '<p class="msg bad">The last draw didn\u2019t work: ' + esc(D.err.msg) + '.</p>';
    $('draw-state').innerHTML = ds;
    if ($('draw-go')) $('draw-go').onclick = function () { confirmBox('Draw the names?', 'Everyone on the list (' + list.length + ') gets one name to buy for. The list locks until you cancel the draw.', 'Draw them', function () { request('draw', 'Asked for the draw'); }); };
    if ($('redraw')) $('redraw').onclick = function () { confirmBox('Draw again?', 'Everyone gets a new name and their old one is thrown away. Anyone who has already unwrapped will need to unwrap again.', 'Draw again', function () { request('draw', 'Asked for a fresh draw'); }); };
    if ($('cancel-draw')) $('cancel-draw').onclick = function () { confirmBox('Cancel the draw?', 'Everyone\u2019s present disappears and the list unlocks, so you can change it and draw again.', 'Cancel the draw', function () { request('cancel', 'Cancelled the draw'); }); };
    $('uncover-box').hidden = !(isAdmin() && drawn);
    var unc = drawn && D.uncovered[D.draw.id];
    $('uncover').hidden = !!unc;
    if (unc) watchSealed(); else $('sealed-list').innerHTML = '';
    var au = Object.keys(D.audit || {}).map(function (k) { return D.audit[k]; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    $('audit').innerHTML = au.length ? au.slice(0, 30).map(function (a) { return '<li><b>' + esc(a.name) + '</b> ' + esc(a.what) + '<span>' + esc(when(a.ts)) + '</span></li>'; }).join('') : '<li class="small">Nothing yet.</li>';
  }

  function paintReplies() {
    var box = $('optin-box'); if (!box) return;
    var r = D.replies || {}, keys = Object.keys(r);
    if (!keys.length) {
      $('optin-count').textContent = '0';
      $('optin-sum').innerHTML = '';
      $('optin-list').innerHTML = '<li class="small">No opt in emails have been sent yet.</li>';
      return;
    }
    var list = keys.map(function (k) { return Object.assign({ k: k }, r[k]); }).sort(function (a, b) {
      var rank = function (c) { return c === 'in' ? 0 : c === 'out' ? 2 : 1; };
      return rank(a.choice) - rank(b.choice) || String(a.name || a.email).localeCompare(String(b.name || b.email));
    });
    var nIn = list.filter(function (p) { return p.choice === 'in'; }).length;
    var nOut = list.filter(function (p) { return p.choice === 'out'; }).length;
    var nWait = list.length - nIn - nOut;
    $('optin-count').textContent = nIn + ' in';
    $('optin-sum').innerHTML = '<span class="tagp in">' + nIn + ' in</span><span class="tagp wait">' + nWait + ' waiting</span><span class="tagp out">' + nOut + ' out</span>';
    var label = function (c) { return c === 'in' ? 'In' : c === 'out' ? 'Out' : 'Waiting'; };
    var klass = function (c) { return c === 'in' ? 'in' : c === 'out' ? 'out' : 'wait'; };
    $('optin-list').innerHTML = list.map(function (p) {
      return '<li><span class="av">' + esc(String(p.name || p.email || '?').charAt(0)) + '</span><span class="pn"><b>' + esc(p.name || p.email) + '</b><small>' + esc(p.email || '') + '</small></span>' +
        '<span class="tagp ' + klass(p.choice) + '">' + label(p.choice) + '</span></li>';
    }).join('');
  }
  function paintLaunch(list, adm) {
    var s = D.settings, L = D.launched, h = '';
    if (L) {
      h = '<div class="state live"><span class="big-ico">&#127881;</span><div><b>Live since ' + esc(when(L.ts)) + '</b><span class="small">Launched by ' + esc(L.byName) + '. Everyone got an email and can unwrap who they have. ' + (s.reminders === false ? 'Weekly reminders are off.' : 'Weekly reminders go on Mondays from 10am until the exchange.') + '</span></div></div>';
    } else if (D.launchReq) {
      h = '<div class="state soon2"><span class="spin">&#10052;</span><div><b>Launching</b><span class="small">Asked by ' + esc(D.launchReq.byName) + ' ' + esc(when(D.launchReq.ts)) + '. Within 15 minutes (Monday to Saturday daytime) the elves draw the names if they aren&rsquo;t drawn yet, switch off Coming soon, email everyone and reveal who they have.</span></div></div>';
    } else {
      var miss = [];
      if (!s.exchange) miss.push('the present exchange day'); if (list.length < 3) miss.push('at least three people');
      h = '<div class="state soon2"><span class="big-ico">&#128679;</span><div><b>Coming soon is on</b><span class="small">Everyone except the organisers sees the Coming soon screen. Names stay sealed until you press Go.</span></div></div>' +
        '<p class="small">Check the entries first. Pressing Go draws the names (if they are not drawn already), emails everyone who opted in, and reveals who they have. There is no automatic reveal and no set launch day.</p>' +
        (miss.length ? '<p class="msg bad">Before pressing Go, set ' + esc(miss.join(' and ')) + '.</p>' : '') +
        (adm ? '<button class="btn launch-go" id="launch-go" type="button"' + (miss.length ? ' disabled' : '') + '>&#128640; Go: reveal the names</button>' : '<p class="small">Only Dan can press Go.</p>');
    }
    $('launch-state').innerHTML = h;
    if ($('launch-go')) $('launch-go').onclick = launchReview;
  }
  function entriesReviewHtml() {
    var r = D.replies || {}, keys = Object.keys(r);
    var groups = { in: [], out: [], pending: [] };
    keys.forEach(function (k) {
      var p = r[k] || {}, c = p.choice === 'in' ? 'in' : p.choice === 'out' ? 'out' : 'pending';
      groups[c].push(p);
    });
    var bit = function (title, arr, klass) {
      var body = arr.length ? arr.sort(function (a, b) { return String(a.name || a.email).localeCompare(String(b.name || b.email)); }).map(function (p) {
        return '<li><span class="pn"><b>' + esc(p.name || p.email) + '</b><small>' + esc(p.email || '') + '</small></span></li>';
      }).join('') : '<li class="small">Nobody in this group.</li>';
      return '<h3 class="rev-h">' + title + ' <span class="tagp ' + klass + '">' + arr.length + '</span></h3><ul class="people rev-list">' + body + '</ul>';
    };
    if (!keys.length) return '<p class="small">No opt in replies have been recorded yet. The nice list currently has <b>' + memberList().length + '</b> people.</p>';
    return bit("Who's in", groups.in, 'in') + bit('Waiting', groups.pending, 'wait') + bit("Who's out", groups.out, 'out');
  }
  function launchReview() {
    var until = optInUntilMs(), early = until && Date.now() < until;
    $('mbox').innerHTML = '<div class="mico">&#128203;</div><h2 id="modal-h">Check the entries</h2>' +
      '<p>Have a look through who is in, who is out, and who has not replied. Names stay sealed until you press Go on the next screen.</p>' +
      (early ? '<p class="msg bad">Opt in is still open until Saturday 14 November. Pressing Go now will lock the list early.</p>' : '') +
      '<div class="entries-review" id="entries-review">' + entriesReviewHtml() + '</div>' +
      '<div class="mrow"><button class="btn ghost" id="m-no" type="button">Not yet</button><button class="btn red" id="m-yes" type="button">Continue</button></div>';
    $('modal').classList.add('show');
    $('m-no').onclick = closeModal;
    $('m-yes').onclick = function () { closeModal(); launchConfirm(); };
  }
  function launchConfirm() {
    var n = memberList().length;
    $('mbox').innerHTML = '<div class="mico">&#128640;</div><h2 id="modal-h">Are you sure?</h2><p>This launches the Ruxley Secret Santa for real, and reveals the names now.</p><ul class="warn">' +
      '<li>Coming soon switches off for everyone.</li>' + (D.draw ? '' : '<li>The names are drawn now (on the server) and the list locks.</li>') +
      '<li>All <b>' + n + '</b> people who are in get an email, with a button to see who they have.</li>' +
      '<li>It only happens once and can&rsquo;t be undone. There is no later automatic reveal.</li></ul>' +
      '<div class="mrow"><button class="btn ghost" id="m-no" type="button">Not yet</button><button class="btn launch-go" id="m-yes" type="button">Yes, reveal the names</button></div>';
    $('modal').classList.add('show');
    $('m-no').onclick = closeModal;
    $('m-yes').onclick = function () {
      $('m-yes').disabled = true;
      B.set(R + '/launchRequest', { by: user.uid, byName: myName().slice(0, 40), ts: SV }).then(function () { audit('Pressed Go and revealed the names'); closeModal(); toast('Launching! Emails go within 15 minutes'); })
        .catch(function (e) { closeModal(); toast('Not allowed (' + (e && e.code || e) + ')'); });
    };
  }
  /* 'YYYY-MM-DDTHH:MM' London time to ms */
  function londonMs(str) {
    var guess = Date.parse(str + ':00Z');
    var p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(guess).forEach(function (x) { p[x.type] = x.value; });
    var asLondon = Date.parse(p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':00Z');
    return guess - (asLondon - guess);
  }
  function request(mode, what) {
    B.set(R + '/drawRequest', { by: user.uid, byName: myName().slice(0, 40), ts: SV, mode: mode }).then(function () { audit(what); toast(mode === 'draw' ? 'Into the hat they go' : 'Cancelling'); }).catch(function (e) { toast('That didn\u2019t work (' + (e && e.code || e) + ')'); });
  }
  function watchSealed() {
    if (sealedUnsub) return;
    sealedUnsub = B.watch(R + '/sealed', function (v) {
      D.sealed = v || null;
      var p = (v && v.pairs) || {}, nm = function (k) { return ((D.members || {})[k] || {}).name || k; };
      $('sealed-list').innerHTML = v ? '<p class="alert">&#128065; Uncovered. This is recorded and everyone can see it was opened.</p><ul class="pairs">' + Object.keys(p).sort(function (a, b) { return nm(a).localeCompare(nm(b)); }).map(function (g) { return '<li><b>' + esc(nm(g)) + '</b><span>&#127873; buys for</span><b>' + esc(nm(p[g])) + '</b></li>'; }).join('') + '</ul>' : '';
    });
  }
  function uncover() {
    var mb = $('mbox');
    mb.innerHTML = '<div class="mico">&#9888;&#65039;</div><h2 id="modal-h">Are you sure?</h2><p>This shows <b>every</b> Secret Santa pairing on this screen.</p><ul class="warn"><li>It can&rsquo;t be undone or hidden again.</li><li>It&rsquo;s recorded in the Elf log with your name and the time.</li><li>Everyone in the Secret Santa will see a note that the list was uncovered by you.</li></ul>' +
      '<div class="mrow"><button class="btn green" id="m-no" type="button">No, keep it secret</button><button class="btn ghost danger" id="m-yes" type="button">Yes, uncover it</button></div>';
    $('modal').classList.add('show');
    $('m-no').onclick = closeModal;
    $('m-yes').onclick = function () {
      $('m-yes').disabled = true;
      B.set(R + '/uncovered/' + D.draw.id, { by: user.uid, name: myName().slice(0, 40), ts: SV })
        .then(function () { return audit('Uncovered who has who'); })
        .then(function () { closeModal(); toast('Uncovered'); paint(); })
        .catch(function (e) { closeModal(); toast('Not allowed (' + (e && e.code || e) + ')'); });
    };
  }
  function confirmBox(h, p, yes, fn) {
    $('mbox').innerHTML = '<h2 id="modal-h">' + esc(h) + '</h2><p>' + esc(p) + '</p><div class="mrow"><button class="btn ghost" id="m-no" type="button">Not yet</button><button class="btn red" id="m-yes" type="button">' + esc(yes) + '</button></div>';
    $('modal').classList.add('show');
    $('m-no').onclick = closeModal;
    $('m-yes').onclick = function () { closeModal(); fn(); };
  }
  function closeModal() { $('modal').classList.remove('show'); }

  /* ---------- effects: snow, lights, confetti, music ---------- */
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function snow() {
    var c = $('snow'), x = c.getContext('2d'), flakes = [], W, H;
    function size() { W = c.width = innerWidth * devicePixelRatio; H = c.height = innerHeight * devicePixelRatio; c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px'; }
    size(); addEventListener('resize', size);
    for (var i = 0; i < (reduce ? 40 : 110); i++) flakes.push({ x: Math.random(), y: Math.random(), r: Math.random() * 2.4 + .6, s: Math.random() * .6 + .25, w: Math.random() * 6.28 });
    function tick() {
      x.clearRect(0, 0, W, H); x.fillStyle = 'rgba(255,255,255,.85)';
      flakes.forEach(function (f) {
        if (!reduce) { f.y += f.s / 600; f.w += .01; if (f.y > 1.02) { f.y = -.02; f.x = Math.random(); } }
        x.beginPath(); x.arc((f.x + Math.sin(f.w) * .01) * W, f.y * H, f.r * devicePixelRatio, 0, 6.28); x.fill();
      });
      if (!reduce) requestAnimationFrame(tick);
    }
    tick();
  }
  function bulbs() { var h = ''; for (var i = 0; i < 18; i++) h += '<i style="animation-delay:' + (i % 3) * .5 + 's"></i>'; $('bulbs').innerHTML = h; }
  function burst() {
    var cols = ['#e0263f', '#f0ba6c', '#2fbf71', '#ffffff', '#5ab3ff'], box = $('gift-zone');
    for (var i = 0; i < 70; i++) {
      var s = document.createElement('i'); s.className = 'conf';
      s.style.background = cols[i % cols.length];
      s.style.setProperty('--dx', (Math.random() * 2 - 1) * 180 + 'px'); s.style.setProperty('--dy', (-Math.random() * 260 - 60) + 'px'); s.style.setProperty('--r', Math.random() * 720 + 'deg');
      box.appendChild(s); setTimeout(function (n) { return function () { n.remove(); }; }(s), 1600);
    }
  }
  /* Jingle Bells on a little music box, made in the browser. Off until tapped. */
  var actx = null, musicOn = false, loopT = null;
  var SONG = 'E4 E4 E2 E4 E4 E2 E4 G4 C4 D4 E1 F4 F4 F4 F4 F4 E4 E4 E8 E8 E4 D4 D4 E4 D2 G2';
  var HZ = { C: 523.25, D: 587.33, E: 659.25, F: 698.46, G: 783.99 };
  function playSong() {
    if (!musicOn) return;
    var t = actx.currentTime + .05, beat = .32;
    SONG.split(' ').forEach(function (n) {
      var f = HZ[n[0]], d = beat * 4 / +n.slice(1), o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.18, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d * .95);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d); t += d;
    });
    loopT = setTimeout(playSong, (t - actx.currentTime + 1.2) * 1000);
  }
  function toggleMusic() {
    musicOn = !musicOn;
    $('music').setAttribute('aria-pressed', String(musicOn)); $('music').querySelector('span').textContent = musicOn ? 'on' : 'off';
    if (musicOn) { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); playSong(); } else clearTimeout(loopT);
  }

  var pollT = null;
  function pollVerified() {
    if (pollT) return;
    pollT = setInterval(function () { if (!user || user.emailVerified) { clearInterval(pollT); pollT = null; return; } if (!document.hidden) B.reload().catch(function () {}); }, 5000);
  }

  /* ---------- wiring ---------- */
  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.onclick = function () { view = b.getAttribute('data-v'); paint(); scrollTo(0, 0); }; });
    $('music').onclick = toggleMusic;
    $('wish-chips').innerHTML = CHIPS.map(function (c) { return '<button type="button" class="chip">' + esc(c) + '</button>'; }).join('');
    $('wish-chips').onclick = function (e) { var b = e.target.closest('.chip'); if (!b) return; var t = $('wish-text'); t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + b.textContent; left(); };
    $('wish-text').oninput = left;
    $('wish-save').onclick = function () {
      B.set(R + '/wish/' + me, { text: $('wish-text').value.trim().slice(0, 600), ts: SV }).then(function () { say('wish-msg', 'Saved. Your Santa can see it now.', true); }).catch(function () { say('wish-msg', 'That didn\u2019t save. Try again.', false); });
    };
    $('set-save').onclick = function () {
      var b = +$('set-budget').value, d = $('set-date').value, u = { reminders: $('set-rem').checked };
      if ($('set-budget').value !== '') { if (!(b >= 0 && b <= 500)) return toast('Budget between \u00a30 and \u00a3500'); u.budget = Math.round(b); }
      if (d) u.exchange = d;
      B.update(R + '/settings', u).then(function () { toast('Saved'); audit('Changed the settings'); }).catch(function () { toast('That didn\u2019t save'); });
    };
    $('add-go').onclick = function () {
      var n = $('add-name').value.trim(), e = $('add-email').value.trim().toLowerCase();
      if (!n) return say('mem-msg', 'Give them a first name.', false);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return say('mem-msg', 'That email doesn\u2019t look right.', false);
      if ((D.members || {})[K(e)]) return say('mem-msg', 'They\u2019re already on the list.', false);
      B.set(R + '/members/' + K(e), { name: n.slice(0, 40), email: e, extra: true, ts: SV }).then(function () { $('add-name').value = ''; $('add-email').value = ''; say('mem-msg', n + ' is on the nice list.', true); audit('Added ' + n.slice(0, 40)); }).catch(function () { say('mem-msg', 'That didn\u2019t work. Is the draw already done?', false); });
    };
    $('add-team').onclick = function () {
      var all = [], have = D.members || {};
      [D.team, D.managers].forEach(function (g) { Object.keys(g || {}).forEach(function (id) { var p = g[id]; if (p && p.email && p.active !== false && !have[K(p.email)]) all.push({ id: id, p: p }); }); });
      if (!all.length) return say('mem-msg', 'Everyone on the Team list is already here.', true);
      Promise.all(all.map(function (x) { return B.set(R + '/members/' + K(x.p.email), { name: String(x.p.name).slice(0, 40), email: String(x.p.email).toLowerCase(), team: x.id, ts: SV }); }))
        .then(function () { say('mem-msg', 'Added ' + all.length + ' from the Team list.', true); audit('Added the Team list (' + all.length + ')'); }).catch(function () { say('mem-msg', 'Some of them didn\u2019t add.', false); });
    };
    $('people').onclick = function (e) {
      var b = e.target.closest('[data-rm]'); if (!b) return;
      var k = b.getAttribute('data-rm'), n = ((D.members || {})[k] || {}).name || k;
      confirmBox('Take ' + n + ' off the list?', 'They won\u2019t be in the draw.', 'Take them off', function () { B.remove(R + '/members/' + k).then(function () { audit('Removed ' + n); }); });
    };
    $('ex-go').onclick = function () {
      var a = $('ex-a').value, b = $('ex-b').value;
      if (!a || !b || a === b) return say('mem-msg', 'Pick two different people.', false);
      B.set(R + '/exclusions/' + a + '/' + b, true).then(function () { say('mem-msg', 'Kept apart.', true); });
    };
    $('ex-list').onclick = function (e) { var b = e.target.closest('[data-exrm]'); if (!b) return; var p = b.getAttribute('data-exrm').split('|'); B.remove(R + '/exclusions/' + p[0] + '/' + p[1]); };
    $('uncover').onclick = uncover;
    $('modal').onclick = function (e) { if (e.target.id === 'modal') closeModal(); };
    var DOM = function () { return $('pin-email').value.trim().toLowerCase(); };
    var err = function (e) { var c = e && e.code || ''; if (c === 'auth/popup-closed-by-user') return ''; if (/invalid-credential|wrong-password|user-not-found/.test(c)) return 'That email and PIN don\u2019t match.'; if (c === 'auth/email-already-in-use') return 'You already have a PIN. Sign in with it.'; return 'That didn\u2019t work (' + (c || e) + ').'; };
    $('pin-form').onsubmit = function (e) { e.preventDefault(); if (!/^[0-9]{6}$/.test($('pin-code').value)) return say('signin-msg', 'Your PIN is six digits.', false); B.signInPin(DOM(), $('pin-code').value).catch(function (x) { say('signin-msg', err(x), false); }); };
    $('pin-new').onclick = function () { if (!/^[0-9]{6}$/.test($('pin-code').value)) return say('signin-msg', 'Type your email and the six digit PIN you want, then press Set my PIN.', false); B.signUpPin(DOM(), $('pin-code').value).then(function () { say('signin-msg', 'Wait up to 60 seconds for our email, then click the link in it to finish signing in.', true); }).catch(function (x) { say('signin-msg', err(x), false); }); };
    $('pin-reset').onclick = function () { if (!DOM()) return say('signin-msg', 'Type your email first.', false); B.resetPin(DOM()).then(function () { say('signin-msg', 'If that email has a PIN, a reset link is on its way.', true); }); };
    $('g-in').onclick = function () { B.signIn().catch(function (x) { var t = err(x); if (t) say('signin-msg', t, false); }); };
    $('unv-out').onclick = $('nl-out').onclick = function () { B.signOut(); };
    setInterval(function () { paint(); }, 30000);
  }

  root.Santa = {
    start: function (backend) {
      B = backend; user = undefined;
      wire(); bulbs(); snow();
      var last = '?';
      B.onAuth(function (u) { var k = u ? u.uid + ':' + u.emailVerified : ''; if (k === last) return; last = k; user = u; subscribe(); paint(); });
      paint();
    },
    _K: K
  };
})(this);
