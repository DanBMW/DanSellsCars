/* cover.js - the personal showroom cover link (cover.html?t=<token>&a=covering|cannot).
 * Dan, 17 November 2026: "make the covering/not covering link not require a login but
 * be a unique link". The token is minted by scripts/reception-mail.js and only ever sent
 * by private email. The page reads coverLink/<token> (readable by its exact token only),
 * shows whose cover it is, and writes one answer to coverLink/<token>/answer. The next
 * run of the job applies it to the rota exactly as a tap on reception.html would, and the
 * page kicks that run so it lands within a minute or two.
 *
 * It never applies a one tap answer on load, even with a=covering: work email links are
 * often opened by a link scanner before the person sees them, and a scanner that runs the
 * page must not tell the managers somebody is covering. One tap on the page does it.
 */
(function (root) {
  'use strict';
  var RR = root.ReceptionRota;
  var WORKER = 'https://vehicleproxy.danielcane1992.workers.dev';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function minsOf(t) { return +String(t).slice(0, 2) * 60 + +String(t).slice(3, 5); }
  function london() {
    var p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(root.__coverNow ? new Date(root.__coverNow) : new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { date: p.year + '-' + p.month + '-' + p.day, mins: (+p.hour % 24) * 60 + +p.minute };
  }

  var S = { link: null, seat: null, sent: null, picking: false, reason: null, busy: false };

  function start(fb) {
    var q = new URLSearchParams(location.search);
    var token = q.get('t') || '', action = q.get('a') || '', test = q.get('test') === '1';
    var LROOT = test ? 'coverLinkTest' : 'coverLink', RROOT = test ? 'lockupTest' : 'lockup';
    S.picking = action === 'cannot';
    if (!RR || !RR.TOKEN_RE.test(token)) return say('This link is not right', 'Open showroom cover from the email again, or sign in on the team page.', true);
    fb.get(fb.ref(fb.db, LROOT + '/' + token)).then(function (snap) {
      var l = snap.val();
      if (!l || !l.personId) return say('This link has expired', 'Links last two weeks. Open showroom cover on the team page instead.', true);
      S.link = l;
      fb.onValue(fb.ref(fb.db, RROOT + '/reception/' + l.date + '/' + l.shift), function (s2) { S.seat = s2.val() || {}; paint(fb, token, LROOT); }, function () { S.seat = {}; paint(fb, token, LROOT); });
    }).catch(function () { say('Could not open your link', 'Check your signal and try again, or open showroom cover on the team page.', true); });
  }

  function say(title, line, withPage) {
    $('c-body').innerHTML = '<h1>' + esc(title) + '</h1><p class="muted">' + esc(line) + '</p>' +
      (withPage ? '<a class="big btn" href="reception.html">Open showroom cover</a>' : '');
  }

  function paint(fb, token, LROOT) {
    var l = S.link, r = S.seat || {}, now = london();
    var when = RR.longDate(l.date) + ', ' + l.from + ' to ' + l.to;
    var head = '<div class="kick">Showroom cover</div><h1>Hi ' + esc(l.name || '') + '</h1><p class="when">' + esc(when) + '</p>';
    var ended = l.date < now.date || (l.date === now.date && minsOf(l.to) <= now.mins);
    if (S.sent) { $('c-body').innerHTML = head + S.sent; return; }
    if (ended) { $('c-body').innerHTML = head + '<p class="note">This shift has finished. Nothing more to do.</p>'; return; }
    if (l.role === 'manager') return paintManager(fb, token, LROOT, head, r);
    var mine = r.personId === l.personId;
    var saidNo = (mine && r.status === 'declined') || (!mine && (r.declined || {})[l.personId]);
    if (saidNo) { $('c-body').innerHTML = head + '<p class="note">You said you cannot cover. The managers have been told and the next person is put on.</p>'; return; }
    if (!mine) { $('c-body').innerHTML = head + '<p class="note">This place has been handed to someone else, so there is nothing more to do here.</p>'; return; }
    var covering = r.status === 'covering';
    /* a manager has nudged them: Where are you? comes first */
    var nudged = r.absent && r.absent.personId === l.personId && !r.absent.reply;
    if (nudged) {
      var nh = head + '<p class="note warn"><b>Where are you?</b> A manager says you are not in the showroom, and you are on cover until ' + esc(l.to) + '.</p>' +
        '<button class="big btn" type="button" id="c-here">I am here</button>';
      if (!S.picking) nh += '<button class="ghost btn" type="button" id="c-no">I cannot be in</button>';
      else nh += reasonsHtml();
      nh += '<p class="msg" id="c-msg" aria-live="polite"></p>';
      var keep0 = $('c-text') ? $('c-text').value : '';
      $('c-body').innerHTML = nh;
      if ($('c-text')) $('c-text').value = keep0;
      $('c-here').onclick = function () { send(fb, token, LROOT, { kind: 'here' }, '<p class="note ok">Thanks. The managers have been told you are here, and you are down as covering until ' + esc(l.to) + '.</p>'); };
      wireReasons(fb, token, LROOT);
      return;
    }
    var html = head + (covering
      ? '<p class="note ok">You are down as covering the showroom until ' + esc(l.to) + '. Thank you.</p>'
      : '<p class="lead">You are on showroom cover until ' + esc(l.to) + '. Please tell us now.</p>' +
        '<button class="big btn" type="button" id="c-yes">I am covering</button>');
    if (!S.picking) {
      html += '<button class="ghost btn" type="button" id="c-no">' + (covering ? 'I can no longer cover' : 'I cannot cover') + '</button>';
    } else html += reasonsHtml();
    html += '<p class="msg" id="c-msg" aria-live="polite"></p><p class="small muted">No sign in needed. This link is yours alone, so please do not forward it.</p>';
    var keepText = $('c-text') ? $('c-text').value : '';
    $('c-body').innerHTML = html;
    if ($('c-text')) $('c-text').value = keepText;
    if ($('c-yes')) $('c-yes').onclick = function () { send(fb, token, LROOT, { kind: 'covering' }, '<p class="note ok">Thank you, you are down as covering the showroom until ' + esc(l.to) + '. The reminders stop now.</p>'); };
    wireReasons(fb, token, LROOT);
  }

  /* the reasons, the same five as reception.html. "I cannot cover right now" and Other must say why. */
  function reasonsHtml() {
    var need = S.reason && RR.needsWords(S.reason);
    return '<div class="why"><b>Why can you not cover?</b><div class="chips">' +
      Object.keys(RR.REASONS).map(function (k) { return '<button type="button" class="chip' + (S.reason === k ? ' on' : '') + '" data-k="' + k + '">' + esc(RR.REASONS[k]) + '</button>'; }).join('') +
      '</div><textarea id="c-text" rows="2" maxlength="500" placeholder="' + (need ? 'Tell the managers why (needed)' : 'Anything the managers should know (optional)') + '"></textarea>' +
      '<button class="big btn danger" type="button" id="c-send">Send to the managers</button></div>';
  }
  function wireReasons(fb, token, LROOT) {
    if ($('c-no')) $('c-no').onclick = function () { S.picking = true; paint(fb, token, LROOT); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-k]'), function (b) { b.onclick = function () { S.reason = b.getAttribute('data-k'); paint(fb, token, LROOT); }; });
    if ($('c-send')) $('c-send').onclick = function () {
      var text = ($('c-text').value || '').trim();
      if (!S.reason) { $('c-msg').textContent = 'Please choose a reason.'; return; }
      var a = RR.answer(S.reason, text);
      if (!a) { $('c-msg').textContent = 'Please tell the managers why.'; return; }
      var ans = { kind: S.reason };
      if (text) ans.text = text.slice(0, 500);
      send(fb, token, LROOT, ans, '<p class="note">Thanks for letting us know. The managers have been told and the next person is being put on.</p>');
    };
  }

  /* a manager's Nudge link from the start of shift email: one tap sends the person Where are you? */
  function paintManager(fb, token, LROOT, head, r) {
    var l = S.link, who = esc(l.name || 'them');
    var on = r.personId === l.personId && (r.status === 'assigned' || r.status === 'covering');
    var html = head.replace('<h1>Hi ' + esc(l.name || '') + '</h1>', '<h1>Nudge ' + who + '?</h1>');
    if (!on) { $('c-body').innerHTML = html + '<p class="note">' + who + ' is no longer on this place, so there is nobody to nudge here. Open showroom cover to see who is on.</p><a class="big btn" href="reception.html">Open showroom cover</a>'; return; }
    var pending = r.absent && r.absent.personId === l.personId && !r.absent.reply;
    var replied = r.absent && r.absent.personId === l.personId && r.absent.reply;
    html += '<p class="lead">' + who + ' should be in the showroom until ' + esc(l.to) + (r.status === 'covering' ? ' and has confirmed.' : ' and has not confirmed yet.') + '</p>' +
      (pending ? '<p class="note warn">Nudged already, no reply yet. You can nudge again.</p>' : '') +
      (replied ? '<p class="note">' + (r.absent.reply.status === 'here' ? who + ' says they are here.' : who + ' is not in: ' + esc(r.absent.reply.text || '')) + '</p>' : '') +
      '<button class="big btn danger" type="button" id="c-nudge">Nudge ' + who + ', not in the showroom</button>' +
      '<p class="msg" id="c-msg" aria-live="polite"></p><p class="small muted">They get a Where are you? email straight away with their own link. This link is for managers only, please do not forward it.</p>';
    $('c-body').innerHTML = html;
    $('c-nudge').onclick = function () { send(fb, token, LROOT, { kind: 'nudge' }, '<p class="note ok">Done. ' + who + ' has been sent Where are you? and you will be emailed their answer.</p>'); };
  }

  function send(fb, token, LROOT, ans, done) {
    if (S.busy) return;
    S.busy = true;
    var msg = $('c-msg'); if (msg) msg.textContent = 'Sending...';
    ans.ts = fb.serverTimestamp();
    fb.set(fb.ref(fb.db, LROOT + '/' + token + '/answer'), ans).then(function () {
      S.busy = false; S.sent = done;
      try { fetch(WORKER + '?target=cover-kick').catch(function () {}); } catch (e) {}
      paint(fb, token, LROOT);
    }).catch(function () {
      S.busy = false;
      if (msg) msg.innerHTML = 'That did not go through. Please try again, or <a href="reception.html">open showroom cover</a> and tap there.';
    });
  }

  root.CoverLink = { start: start, _state: S };
})(this);
