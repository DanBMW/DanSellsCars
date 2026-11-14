/* santa/optin.js - one tap Secret Santa opt in / opt out. No sign in.
 * Token in ?t= is a capability URL. ?c=in or ?c=out records the choice at
 * once. ?practice=1 uses the santaTest tree. */
(function (root) {
  'use strict';
  var PRACTICE = /[?&]practice=1\b/.test(location.search);
  var R = PRACTICE ? 'santaTest' : 'santa';
  var TOKEN_OK = /^[A-Za-z0-9_-]{24,64}$/;
  var B = null, rec, settings = {}, gift = null, giftTried = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function qs(k) { return new URLSearchParams(location.search).get(k) || ''; }
  function token() { return qs('t').trim(); }
  function firstName(n) { return String(n || '').trim().split(' ')[0] || 'there'; }
  /* A guest on this link is not signed in, and santa/settings is only readable
     signed in, so settings.live never arrives here. The gift itself is the signal:
     guestGift/<token> is readable only once the names are out. */
  function namesOut() { return settings.live === true || !!(gift && gift.name); }
  function optInUntilMs() { return settings.optInUntil || Date.parse('2026-11-14T23:59:59+00:00'); }
  function closed() {
    if (namesOut()) return true;
    if (optInUntilMs() && Date.now() >= optInUntilMs()) return true;
    return false;
  }
  function toast(t) {
    var x = document.getElementById('toast');
    if (!x) { x = document.createElement('div'); x.id = 'toast'; x.className = 'toast'; x.setAttribute('role', 'status'); document.body.appendChild(x); }
    x.textContent = t; x.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { x.classList.remove('show'); }, 2600);
  }

  function path() { return R + '/optins/' + token(); }

  function paint() {
    var card = $('card');
    if (!TOKEN_OK.test(token())) {
      card.innerHTML = head() + '<div class="optin-ico">&#10052;</div><h1>This link isn&rsquo;t right</h1><p class="optin-err">Ask Dan to send you a new one from the elves.</p>';
      return;
    }
    if (rec === undefined) {
      card.innerHTML = head() + '<p id="status">Opening your envelope&hellip;</p>';
      return;
    }
    if (!rec || !rec.email) {
      card.innerHTML = head() + '<div class="optin-ico">&#10052;</div><h1>This link isn&rsquo;t right</h1><p class="optin-err">Ask Dan to send you a new one from the elves.</p>';
      return;
    }
    var name = firstName(rec.name);
    if (rec.choice === 'in' && !giftTried) { card.innerHTML = head() + '<p id="status">Opening your envelope&hellip;</p>'; return; }
    if (namesOut() && rec.choice === 'in') return paintGift(card, name);
    if (rec.choice === 'in') {
      card.innerHTML = head() + '<div class="optin-ico" aria-hidden="true">&#127877;</div><h1>You&rsquo;re in!</h1>' +
        '<p class="hello-name">Ho ho ho, ' + esc(name) + '.</p>' +
        '<p>You&rsquo;re on the nice list. ' + (closed() ? 'Opt in has now closed. Names will be revealed when the elves launch it. Open this same link then to unwrap who you&rsquo;ve got. No sign in needed.' : 'Opt in stays open until <b>Saturday 14 November</b>. Names will be revealed when the elves launch it after that. Open this same link then to unwrap who you&rsquo;ve got. No sign in needed.') + '</p>' +
        '<p class="small">Spend up to &pound;20. Presents are exchanged at the team meal on Saturday 5 December. If you&rsquo;re not coming to the meal, pop your gift in the bag and your presents will be given to you before you leave that day.</p>' +
        wishBox();
      wireWish();
      return;
    }
    if (rec.choice === 'out') {
      card.innerHTML = head() + '<div class="optin-ico" aria-hidden="true">&#10024;</div><h1>That&rsquo;s ok</h1>' +
        '<p class="hello-name">See you next year, ' + esc(name) + '.</p>' +
        '<p>You&rsquo;re not in this year&rsquo;s Secret Santa draw. If that&rsquo;s a mistake, talk to Dan.</p>';
      return;
    }
    if (closed()) {
      card.innerHTML = head() + '<h1>Opt in has closed</h1><p>The elves have taken the list away to draw the names. If you think this is a mistake, talk to Dan.</p>';
      return;
    }
    card.innerHTML = head() + '<p class="hello-name">Ho ho ho, ' + esc(name) + '!</p>' +
      '<p>This year&rsquo;s Secret Santa is back at the Ruxley showroom. You buy one present for one colleague, and somebody buys one for you. One tap, no sign in. Names will be revealed when the elves launch it after that.</p>' +
      '<p class="small">Spend up to &pound;20. Presents are exchanged at the team meal on Saturday 5 December. If you&rsquo;re not coming to the meal, pop your gift in the bag and your presents will be given to you before you leave that day.</p>' +
      '<div class="optin-actions">' +
      '<button class="btn red" type="button" id="btn-in">I&rsquo;m in &#127877;</button>' +
      '</div>';
    $('btn-in').onclick = function () { save('in'); };
  }

  function head() { return '<div class="kick">Hedin BMW Ruxley</div>'; }

  function wishBox() {
    var text = rec.wish && rec.wish.text || '';
    return '<div class="optin-wish"><h2 class="xfont">My wishlist</h2><p class="small">Your Secret Santa sees this, nobody else does.</p>' +
      '<textarea id="wish-text" maxlength="600" placeholder="Hints for your Santa: sizes, favourite chocolate, the football team you can&rsquo;t stand&hellip;">' + esc(text) + '</textarea>' +
      '<div class="row end"><button class="btn green sm" type="button" id="wish-save">Save my wishlist</button></div><p class="msg" id="wish-msg"></p></div>';
  }
  function wireWish() {
    if (!$('wish-save')) return;
    $('wish-save').onclick = function () {
      var text = $('wish-text').value.trim().slice(0, 600);
      B.update(path() + '/wish', { text: text, ts: B.serverTs() }).then(function () {
        $('wish-msg').textContent = 'Saved. Your Santa can see it once the names are out.';
        $('wish-msg').className = 'msg ok';
      }).catch(function () {
        $('wish-msg').textContent = 'That didn\u2019t save. Try again.';
        $('wish-msg').className = 'msg bad';
      });
    };
  }

  function paintGift(card, name) {
    if (!giftTried) {
      card.innerHTML = head() + '<p>Unwrapping your present&hellip;</p>';
      return;
    }
    if (!gift || !gift.name) {
      card.innerHTML = head() + '<div class="optin-ico">&#127873;</div><h1>You&rsquo;re in!</h1><p class="hello-name">Ho ho ho, ' + esc(name) + '.</p><p>The names are out. If your present isn&rsquo;t here yet, give the elves a moment and refresh.</p>' + wishBox();
      wireWish();
      return;
    }
    card.innerHTML = head() + '<div class="optin-gift"><div class="optin-ico">&#127873;</div><h1>You&rsquo;re buying for</h1>' +
      '<div class="rname">' + esc(gift.name) + '</div>' +
      '<p class="small">Shhh. Keep it to yourself until the exchange.</p>' +
      '<p class="small">Presents are exchanged at the team meal on Saturday 5 December. If you&rsquo;re not coming to the meal, pop your gift in the bag and your presents will be given to you before you leave that day.</p>' +
      (gift.wish ? '<div class="paper" style="text-align:left;margin-top:12px"><h2 class="xfont">Their wishlist</h2><p>' + esc(gift.wish) + '</p></div>' : '<p>They haven&rsquo;t written a wishlist yet. Check back here now and then.</p>') +
      wishBox() + '</div>';
    wireWish();
  }

  function save(choice) {
    /* no sitting out from 14 November (Dan): only an I'm in is ever saved */
    if (choice !== 'in') return Promise.resolve();
    return B.update(path(), { choice: choice, choiceTs: B.serverTs() }).then(function () {
      rec = rec || {}; rec.choice = choice; rec.choiceTs = Date.now();
      paint();
      toast(choice === 'in' ? 'You\u2019re in. Ho ho ho!' : 'You\u2019re out of this year\u2019s Secret Santa.');
    }).catch(function (e) {
      var code = String((e && e.code) || e || '');
      if (closed() || /permission/i.test(code)) toast('Opt in has closed, so that didn\u2019t save.');
      else toast('That didn\u2019t save. Try again.');
    });
  }

  /* ask for the gift whatever the settings say (see namesOut); before the names
     are out the read is refused, so keep asking once a minute while the page is open */
  var giftT = null;
  function loadGift() {
    if (!(rec && rec.choice === 'in')) { giftTried = true; return; }
    B.get(R + '/guestGift/' + token()).then(function (v) {
      gift = v || null; giftTried = true; paint(); retryGift();
    }).catch(function () { gift = null; giftTried = true; paint(); retryGift(); });
  }
  function retryGift() {
    clearTimeout(giftT);
    if (!(gift && gift.name)) giftT = setTimeout(loadGift, 60000);
  }

  function snow() {
    var c = $('snow'); if (!c || !c.getContext) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var x = c.getContext('2d'), flakes = [], W, H;
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
  function bulbs() { var h = '', el = $('bulbs'); if (!el) return; for (var i = 0; i < 18; i++) h += '<i style="animation-delay:' + (i % 3) * .5 + 's"></i>'; el.innerHTML = h; }

  root.SantaOptin = {
    start: function (backend) {
      B = backend;
      bulbs(); snow();
      var t = token();
      if (!TOKEN_OK.test(t)) { rec = false; paint(); return; }
      B.watch(R + '/settings', function (v) { settings = v || {}; if (rec && rec.email) loadGift(); paint(); }, function () { settings = {}; });
      B.watch(path(), function (v) {
        rec = v;
        var auto = qs('c');
        if (auto === 'in' && rec && rec.email && rec.choice !== auto && !closed()) {
          /* one tap from the email: record the choice, then drop c from the URL so a refresh doesn't flip it back */
          save(auto).then(function () {
            try { var u = new URL(location.href); u.searchParams.delete('c'); history.replaceState({}, '', u); } catch (e) {}
          });
        } else { loadGift(); paint(); }
      }, function () { rec = false; paint(); });
      paint();
    },
    _save: function (c) { return save(c); }
  };
})(this);
