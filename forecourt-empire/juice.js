/* Forecourt Empire — juice.
   The feedback layer: coins on a sale, confetti on a record week, a shake when
   a fine lands, floating numbers, and a small synthesised sound kit.

   No audio files: everything is generated with WebAudio oscillators, so the
   whole thing stays in one script with nothing to download. Audio only starts
   after the player's first tap (browsers block it before that) and can be
   muted from the desk. Particles draw to one full-screen canvas that ignores
   pointer events, and the loop stops itself the moment nothing is alive. */
(function () {
  'use strict';
  var J = {};
  var cv = null, ctx = null, parts = [], raf = null, W = 0, H = 0, dpr = 1;
  var MUTE_KEY = 'feMuted';
  var actx = null, unlocked = false;

  /* ---------------- sound ---------------- */
  J.muted = function () { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; } };
  J.setMuted = function (m) { try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) {} };
  function audio() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC(); } catch (e) { return null; }
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  // one shaped oscillator note
  function note(freq, t0, dur, type, vol, glideTo) {
    var a = audio(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(t0, dur, vol) {
    var a = audio(); if (!a) return;
    var n = Math.floor(a.sampleRate * dur);
    var buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = a.createBufferSource(); src.buffer = buf;
    var g = a.createGain(); g.gain.value = vol;
    var f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start(t0);
  }
  J.sound = function (kind) {
    if (J.muted() || !unlocked) return;
    var a = audio(); if (!a) return;
    var t = a.currentTime;
    switch (kind) {
      case 'sale':      // till: two chimes and a drawer
        note(880, t, 0.10, 'triangle', 0.20);
        note(1318, t + 0.07, 0.16, 'triangle', 0.18);
        noise(t + 0.16, 0.10, 0.06);
        break;
      case 'coin':
        note(1046, t, 0.06, 'square', 0.06);
        note(1568, t + 0.04, 0.08, 'square', 0.05);
        break;
      case 'record':    // fanfare
        [523, 659, 784, 1046].forEach(function (f, i) { note(f, t + i * 0.09, 0.22, 'triangle', 0.17); });
        break;
      case 'bill':      // money out: a short descending thunk
        note(300, t, 0.16, 'sawtooth', 0.11, 150);
        break;
      case 'fine':      // bad news
        note(220, t, 0.30, 'sawtooth', 0.16, 110);
        note(233, t + 0.02, 0.28, 'square', 0.07, 116);
        break;
      case 'tap':
        note(660, t, 0.045, 'sine', 0.05);
        break;
      case 'win':
        [659, 880].forEach(function (f, i) { note(f, t + i * 0.08, 0.18, 'triangle', 0.15); });
        break;
    }
  };

  /* ---------------- particle canvas ---------------- */
  function ensure() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.id = 'juiceLayer';
    document.body.appendChild(cv);
    ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function run() {
    if (raf) return;
    var last = performance.now();
    (function step(now) {
      var dt = Math.min(50, now - last) / 1000; last = now;
      ctx.clearRect(0, 0, W, H);
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += p.vr * dt;
        var fade = Math.min(1, p.life / p.fade);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.kind === 'coin') {
          var rx = Math.abs(Math.cos(p.rot)) * p.r + p.r * 0.15;   // spinning disc
          ctx.fillStyle = '#b3801e';
          ctx.beginPath(); ctx.ellipse(0, 1.5, rx, p.r, 0, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#ffce4a';
          ctx.beginPath(); ctx.ellipse(0, 0, rx, p.r, 0, 0, 6.283); ctx.fill();
        } else if (p.kind === 'confetti') {
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
        } else {                                                    // text
          ctx.globalAlpha = fade;
          ctx.font = '800 ' + p.size + 'px -apple-system, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,7,16,.75)';
          ctx.strokeText(p.text, 0, 0);
          ctx.fillStyle = p.c; ctx.fillText(p.text, 0, 0);
        }
        ctx.restore();
      }
      if (parts.length) raf = requestAnimationFrame(step);
      else { raf = null; ctx.clearRect(0, 0, W, H); }
    })(last);
  }
  // where to burst from: an element's centre, or the middle of the screen
  function anchor(sel) {
    var el = sel && document.querySelector(sel);
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight * 0.42 };
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  J.coins = function (n, sel) {
    ensure();
    var a = anchor(sel || '#cash');
    n = n || 14;
    for (var i = 0; i < n; i++) {
      parts.push({
        kind: 'coin', x: a.x + (Math.random() - .5) * 30, y: a.y + (Math.random() - .5) * 14,
        vx: (Math.random() - .5) * 320, vy: -180 - Math.random() * 240, g: 900,
        r: 4 + Math.random() * 3.5, rot: Math.random() * 6.3, vr: (Math.random() - .5) * 14,
        life: 1.0 + Math.random() * 0.5, fade: 0.45
      });
    }
    run();
    J.sound('coin');
  };
  J.float = function (text, colour, sel) {
    ensure();
    var a = anchor(sel);
    parts.push({
      kind: 'text', text: text, c: colour || '#35d07f', size: 26,
      x: a.x, y: a.y, vx: (Math.random() - .5) * 30, vy: -110, g: 90,
      r: 0, rot: 0, vr: 0, life: 1.5, fade: 0.7
    });
    run();
  };
  J.confetti = function (n) {
    ensure();
    var cols = ['#ffce4a', '#35d07f', '#3d8bff', '#ff5d6c', '#2fd6c0', '#9b6cff'];
    n = n || 90;
    for (var i = 0; i < n; i++) {
      parts.push({
        kind: 'confetti', x: Math.random() * W, y: -20 - Math.random() * 120,
        vx: (Math.random() - .5) * 140, vy: 90 + Math.random() * 200, g: 190,
        r: 3.5 + Math.random() * 3.5, rot: Math.random() * 6.3, vr: (Math.random() - .5) * 12,
        c: cols[(Math.random() * cols.length) | 0],
        life: 2.4 + Math.random() * 1.4, fade: 0.9
      });
    }
    run();
  };
  J.shake = function (strength) {
    var el = document.getElementById('app') || document.body;
    el.style.setProperty('--shake', (strength || 7) + 'px');
    el.classList.remove('shaking');
    void el.offsetWidth;                 // restart the animation
    el.classList.add('shaking');
    setTimeout(function () { el.classList.remove('shaking'); }, 520);
  };

  /* ---------------- composed moments ---------------- */
  J.sale = function (gross) {
    J.sound('sale');
    J.coins(gross > 2000 ? 20 : 13);
    if (gross != null) {
      J.float((gross >= 0 ? '+' : '−') + '£' + Math.abs(Math.round(gross)).toLocaleString('en-GB'),
        gross >= 0 ? '#35d07f' : '#ff5d6c', '#cash');
    }
  };
  J.bill = function (amount) {
    J.sound('bill');
    if (amount) J.float('−£' + Math.round(amount).toLocaleString('en-GB'), '#ffb63d', '#cash');
  };
  J.fine = function () { J.sound('fine'); J.shake(9); };
  J.record = function () { J.sound('record'); J.confetti(110); };

  // browsers won't let audio start until the player has interacted
  document.addEventListener('pointerdown', function unlock() {
    unlocked = true;
    audio();
    document.removeEventListener('pointerdown', unlock);
  }, { once: true });

  window.Juice = J;
})();
