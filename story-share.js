/* DanSells "Share my BMW story" - shared share/referral module.
   Used by thankyou.html, ev-thankyou.html and sq_done.html:

     dsStoryShare.init({
       social:     "…full share text containing dan-sells.co.uk…",
       firstName:  "Kate",                          // for the referral code
       heading:    "Here's my BMW Story with Dan",  // card headline
       tagline:    "Your perfect BMW. Two minutes to find it.",
       fileName:   "my-bmw-story.png",
       shareTitle: "My BMW story"
     });

   It mints a persistent referral code (e.g. KATE-7X2M, localStorage
   dsMyRef), rewrites the dan-sells.co.uk mention in the share text to
   dan-sells.co.uk/?ref=CODE, points the X/WhatsApp buttons at it, prints
   the code on the generated share image, and fills #refNudge with the
   £250/£125 referral-reward nudge. analytics.js reads dsMyRef to tag
   share events; it also captures ?ref= on landing pages and attaches it
   to generate_lead events and Formspree payloads. */
(function () {
  'use strict';

  function refCode(firstName) {
    try {
      var have = localStorage.getItem('dsMyRef');
      if (have) return have;
      var name = (firstName || '').replace(/[^a-z]/gi, '').toUpperCase().slice(0, 6) || 'BMW';
      var salt = '';
      for (var i = 0; i < 4; i++) salt += 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)];
      var code = name + '-' + salt;
      localStorage.setItem('dsMyRef', code);
      return code;
    } catch (e) { return 'BMW-' + Date.now().toString(36).slice(-4).toUpperCase(); }
  }

  var S = {};

  function init(opts) {
    S = opts || {};
    S.code = refCode(S.firstName);
    S.link = 'https://dan-sells.co.uk/?ref=' + S.code;
    S.social = (S.social || '')
      .replace('dan-sells.co.uk', 'dan-sells.co.uk/?ref=' + S.code)
      .replace(/\b(a|an) a\b/g, '$1'); /* tidy "a a deposit" left by the £-figure scrub */

    var x = document.getElementById('shareX');
    var wa = document.getElementById('shareWa');
    if (x) x.href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(S.social);
    if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent(S.social);
    window._socialStory = S.social;

    var nudge = document.getElementById('refNudge');
    if (nudge) {
      nudge.innerHTML =
        '<div style="display:flex;gap:12px;align-items:flex-start;background:linear-gradient(135deg,#fdf8ec,#faf3dd);' +
        'border:1px solid #e7d9a8;border-radius:14px;padding:14px 16px;margin-top:14px;">' +
        '<div style="font-size:1.35rem;line-height:1;">&#127942;</div>' +
        '<div style="font-size:.78rem;color:#5c5233;line-height:1.55;">' +
        '<strong style="color:#3f3818;">Sharing is referring.</strong> Your personal link is baked into every share above ' +
        '- if a friend finds Dan through it and buys, you get <strong style="color:#3f3818;">&pound;250 BMW credit</strong> ' +
        'or &pound;125 cash. <a href="refer.html" style="color:#8a6d1a;font-weight:700;">How the reward works &rarr;</a>' +
        '<div style="margin-top:8px;"><span style="display:inline-block;background:#fff;border:1.5px dashed #cbb666;border-radius:8px;' +
        'padding:4px 10px;font-weight:800;letter-spacing:.06em;color:#3f3818;font-size:.8rem;">' + S.code + '</span>' +
        '<span style="margin-left:8px;color:#8a7a45;font-size:.72rem;">your code - friends can also quote it to Dan</span></div>' +
        '</div></div>';
    }
  }

  /* ── the share card ────────────────────────────────────────────── */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCard(text, onDone) {
    var W = 1080, H = 1080;
    var cvs = document.createElement('canvas');
    cvs.width = W; cvs.height = H;
    var ctx = cvs.getContext('2d');

    function render(bg) {
      /* backdrop: photo (or navy) under a deep vignette + blue glow */
      if (bg) {
        var sc = Math.max(W / bg.width, H / bg.height);
        ctx.drawImage(bg, (W - bg.width * sc) / 2, (H - bg.height * sc) / 2, bg.width * sc, bg.height * sc);
      } else { ctx.fillStyle = '#0d1f3c'; ctx.fillRect(0, 0, W, H); }
      var gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(5,12,30,0.88)');
      gr.addColorStop(0.5, 'rgba(4,10,24,0.93)');
      gr.addColorStop(1, 'rgba(2,6,16,0.97)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      var glow = ctx.createRadialGradient(W / 2, 0, 80, W / 2, 0, 620);
      glow.addColorStop(0, 'rgba(40,110,255,0.22)');
      glow.addColorStop(1, 'rgba(40,110,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 640);

      /* masthead */
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px Georgia,serif';
      ctx.fillText('DanSells', W / 2, 104);
      ctx.fillStyle = 'rgba(140,175,255,0.85)';
      ctx.font = '600 23px Arial,sans-serif';
      ctx.fillText('M Y   B M W   S T O R Y', W / 2, 148);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '22px Arial,sans-serif';
      ctx.fillText('with Dan at BMW Ruxley', W / 2, 182);

      /* the story itself: drop the share-text scaffolding (the "Here's my
         story" lead-in, any short title line, the trailing CTA) so the
         card quotes only the story */
      var paras = text.split('\n\n').map(function (p) { return p.replace(/\n/g, ' ').trim(); }).filter(Boolean);
      if (paras.length > 1) paras.shift();
      if (paras.length > 1 && /dan-sells\.co\.uk/.test(paras[paras.length - 1])) paras.pop();
      paras = paras.filter(function (p) { return p.length >= 50 || /[.!?]$/.test(p); });
      var body = paras.join(' ') || text.replace(/\n/g, ' ');

      /* wrap first, then size the card to its content */
      ctx.font = '31px Georgia,serif';
      var cardX = 64, cardW = W - 128, maxW = cardW - 112, lh = 47, maxLines = 8;
      var words = body.split(/\s+/), lines = [], line = '';
      for (var i = 0; i < words.length; i++) {
        var t = line + (line ? ' ' : '') + words[i];
        if (ctx.measureText(t).width > maxW && line) {
          if (lines.length === maxLines - 1) { line = line.replace(/\s\S*$/, '') + ' …'; break; }
          lines.push(line); line = words[i];
        } else { line = t; }
      }
      if (line) lines.push(line);
      var cardH = 128 + lines.length * lh + 46;
      /* centre the card + code strip in the space between masthead and footer */
      var blockH = cardH + 28 + 118;
      var cardY = Math.max(226, 216 + Math.round(((H - 130) - 216 - blockH) / 2));

      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, cardX, cardY, cardW, cardH, 26); ctx.fill();
      ctx.strokeStyle = 'rgba(120,160,255,0.28)'; ctx.lineWidth = 1.5;
      roundRect(ctx, cardX, cardY, cardW, cardH, 26); ctx.stroke();
      ctx.fillStyle = 'rgba(85,145,255,0.5)';
      ctx.font = 'bold 120px Georgia,serif';
      ctx.textAlign = 'left';
      ctx.fillText('“', cardX + 32, cardY + 100);

      ctx.fillStyle = 'rgba(255,255,255,0.93)';
      ctx.font = '31px Georgia,serif';
      var y = cardY + 128;
      for (var li = 0; li < lines.length; li++) { ctx.fillText(lines[li], cardX + 56, y); y += lh; }

      /* referral strip, snug under the story card */
      var stripY = Math.min(cardY + cardH + 28, H - 244), stripH = 118;
      ctx.fillStyle = 'rgba(85,145,255,0.14)';
      roundRect(ctx, 64, stripY, W - 128, stripH, 22); ctx.fill();
      ctx.strokeStyle = 'rgba(120,160,255,0.4)'; ctx.lineWidth = 1.5;
      roundRect(ctx, 64, stripY, W - 128, stripH, 22); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(180,205,255,0.85)';
      ctx.font = '600 21px Arial,sans-serif';
      ctx.fillText('S T A R T   Y O U R S   W I T H   M Y   C O D E', W / 2, stripY + 42);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px Arial,sans-serif';
      ctx.fillText(S.code || 'DAN-SELLS', W / 2, stripY + 92);

      /* footer */
      ctx.fillStyle = '#5591ff';
      ctx.font = 'bold 36px Arial,sans-serif';
      ctx.fillText('dan-sells.co.uk', W / 2, H - 76);
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.font = '22px Arial,sans-serif';
      ctx.fillText(S.tagline || 'Your perfect BMW. Two minutes to find it.', W / 2, H - 38);
      onDone(cvs);
    }

    var img = new Image();
    img.onload = function () { render(img); };
    img.onerror = function () { render(null); };
    img.src = 'photo07.jpg';
  }

  /* ── button handlers (pages call these by name) ────────────────── */
  window.copyStory = function () {
    if (!window._socialStory) return;
    navigator.clipboard.writeText(window._socialStory).then(function () {
      var b = document.getElementById('copyBtn');
      if (!b) return;
      var old = b.innerHTML;
      b.textContent = '✓ Copied!';
      setTimeout(function () { b.innerHTML = old; }, 2000);
    });
  };

  window.shareInstagram = function () {
    if (!window._socialStory) return;
    drawCard(window._socialStory, function (cvs) {
      cvs.toBlob(function (blob) {
        var file = new File([blob], S.fileName || 'my-bmw-story.png', { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({
            files: [file],
            title: S.shareTitle || 'My BMW story',
            text: (S.shareTitle || 'My BMW story') + ' - create yours at ' + S.link
          }).catch(function () {});
        } else {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = S.fileName || 'my-bmw-story.png'; a.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
        }
      }, 'image/png');
    });
  };

  window.dsStoryShare = { init: init, drawCard: drawCard };
})();
