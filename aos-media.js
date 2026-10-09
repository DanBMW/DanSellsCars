/* aos-media.js: the walkaround video and the 360 spin for a used car.
 *
 * Hedin film most used BMWs for AutoOnShow. Neither stock file carries the
 * media, so the browser builds the address from the reg and asks AutoOnShow's
 * CDN directly (never through the worker, never with the br-api.aos.tv token,
 * nothing stored in Firebase). See CLAUDE.md, "Walkaround video and 360 spin".
 *
 * A page marks a photo area and calls scan():
 *   <div data-aos-reg="LX75FZS" data-aos-src="forecourt|group"
 *        [data-aos-mode="badges"]>...photo...</div>
 *   aosMedia.scan(container)
 * Only areas that are on screen are probed. Once a file is confirmed a small
 * "Video" or "360" button appears in the corner of the area; tapping it plays
 * the video or opens the spin over the photo. data-aos-mode="badges" shows the
 * same labels as plain badges for list cards that are themselves a link.
 * aosMedia.leave(area) puts the photo back (photo arrows and thumbnails).
 */
window.aosMedia = (function () {
  'use strict';

  var HOST = 'https://eu.cdn.autosonshow.tv';
  /* AutoOnShow library per Hedin site: 3927 Ruxley, 3924 Bromley,
     3925 Enfield, 3929 Woolwich, 4974 Blackheath. The stock files carry no
     branch, so the likely site goes first and the rest follow. */
  var ORDER = {
    forecourt: ['3927', '3924', '3925', '3929', '4974'],
    group: ['3924', '3925', '3929', '4974', '3927']
  };
  var MAX_FRAMES = 125, PX_PER_FRAME = 8, PROBE_MS = 8000, DWELL_MS = 250;

  function norm(r) { return String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function order(src) { return src === 'group' ? ORDER.group : ORDER.forecourt; }
  function folder(lib, reg) { return HOST + '/' + lib + '/bmwforecourt/' + reg + '/'; }
  function videoUrl(lib, reg) { return folder(lib, reg) + 'video_med.mp4'; }
  function pad(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
  function frameUrl(lib, reg, n) { return folder(lib, reg) + '360_' + pad(n) + '.jpg'; }

  function track(name, p) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, p); } catch (e) {}
  }

  /* ---------- what we already know this session ----------
     'v:REG' and 's:REG' hold the library that has the file, or '' when every
     library answered "not here". A cancelled check, or one where any library
     simply never answered (a phone that will not preload video), stores
     nothing, so the next visit asks again. The prefix is aos2: because the
     first version stored '' for timed out video checks on iPhones. */
  var PREFIX = 'aos2:', MEM = {};
  function recall(k) {
    if (Object.prototype.hasOwnProperty.call(MEM, k)) return MEM[k];
    try { var v = sessionStorage.getItem(PREFIX + k); if (v !== null) return (MEM[k] = v); } catch (e) {}
    return undefined;
  }
  function remember(k, v) {
    MEM[k] = v;
    try { sessionStorage.setItem(PREFIX + k, v); } catch (e) {}
  }

  /* ---------- one candidate at a time ---------- */
  var probeBox = null;
  function box() {
    if (probeBox && probeBox.isConnected) return probeBox;
    probeBox = document.createElement('div');
    probeBox.setAttribute('aria-hidden', 'true');
    probeBox.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    document.body.appendChild(probeBox);
    return probeBox;
  }

  /* One hidden <video> per car, metadata only: loadedmetadata means it is the
     video, error or 8 seconds of nothing means the next library. */
  function videoTester() {
    var v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('preload', 'metadata');
    box().appendChild(v);
    var t = 0, cb = null;
    function off() { clearTimeout(t); v.onloadedmetadata = v.onerror = null; }
    function stop() { off(); v.removeAttribute('src'); try { v.load(); } catch (e) {} }
    return {
      test: function (url, done) {
        cb = done;
        v.onloadedmetadata = function () { off(); stop(); cb(true); };
        v.onerror = function () { off(); cb(false); };
        t = setTimeout(function () { off(); stop(); cb(null); }, PROBE_MS);
        v.src = url;
      },
      cancel: stop,
      dispose: function () { stop(); if (v.parentNode) v.parentNode.removeChild(v); }
    };
  }
  /* Frame 1 only; the other frames wait until somebody opens the viewer. */
  function imageTester() {
    var img = null, t = 0;
    function stop() { clearTimeout(t); if (img) { img.onload = img.onerror = null; img.src = ''; img = null; } }
    return {
      test: function (url, done) {
        stop();
        var me = img = new Image();
        me.onload = function () { if (img !== me) return; stop(); done(true); };
        me.onerror = function () { if (img !== me) return; stop(); done(false); };
        t = setTimeout(function () { if (img !== me) return; stop(); done(null); }, PROBE_MS);
        me.src = url;
      },
      cancel: stop,
      dispose: stop
    };
  }

  /* ---------- a check per reg and kind, shared by every area showing it ---------- */
  var LIVE = {};
  function probe(kind, reg, src, sub) {
    var key = kind + ':' + reg, known = recall(key);
    if (known !== undefined) { sub.done(known); return function () {}; }
    var run = LIVE[key];
    if (!run) {
      run = LIVE[key] = { subs: [], tester: kind === 'v' ? videoTester() : imageTester(), over: false };
      var libs = order(src), i = 0, unsure = false;
      var next = function () {
        if (run.over) return;
        run.subs = run.subs.filter(function (s) { return s.alive(); });
        if (!run.subs.length) { cancelRun(key, run); return; }
        if (i >= libs.length) { finish(unsure ? null : ''); return; }
        var lib = libs[i++];
        run.tester.test(kind === 'v' ? videoUrl(lib, reg) : frameUrl(lib, reg, 1), function (ok) {
          if (run.over) return;
          if (ok) finish(lib);
          else { if (ok === null) unsure = true; next(); }
        });
      };
      var finish = function (lib) {
        run.over = true; delete LIVE[key];
        run.tester.dispose();
        if (lib !== null) remember(key, lib);   /* null: some library never answered */
        run.subs.forEach(function (s) { s.done(lib); });
      };
      setTimeout(next, 0);
    }
    run.subs.push(sub);
    return function () {
      var k = run.subs.indexOf(sub);
      if (k !== -1) run.subs.splice(k, 1);
      if (!run.subs.length && !run.over) cancelRun(key, run);
    };
  }
  function cancelRun(key, run) {
    run.over = true; run.tester.dispose();
    if (LIVE[key] === run) delete LIVE[key];
  }

  /* ---------- only cars that are on screen ---------- */
  var IO = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var st = e.target._aos; if (!st) return;
      if (e.isIntersecting) {
        if (!st.timer && !st.running) st.timer = setTimeout(function () { st.timer = 0; start(e.target); }, DWELL_MS);
      } else stopChecks(e.target);
    });
  }, { threshold: 0.01 }) : null;

  function start(area) {
    var st = area._aos;
    if (!st || st.running || !area.isConnected) return;
    st.running = true;
    var alive = function () { return area.isConnected && st.running; };
    /* The 360 frame is an image, which every phone fetches, so it goes first.
       A car with a spin was filmed, so it gets the Video button straight away
       and the tap finds the file (openVideo). The hidden <video> check only
       runs for a car with no spin: iPhones, above all in Low Power Mode or
       on data saver, often never preload a video nobody can see. */
    var kind = st.s === undefined ? 's' : (needsVideoCheck(st) ? 'v' : '');
    if (!kind) { settle(area); return; }
    st['un' + kind] = probe(kind, st.reg, st.src, {
      alive: alive,
      done: function (lib) {
        st[kind] = lib; st['un' + kind] = null; paint(area);
        if (kind === 's' && needsVideoCheck(st) && st.running) { st.running = false; start(area); return; }
        settle(area);
      }
    });
    settle(area);
  }
  function needsVideoCheck(st) { return st.v === undefined && !st.s; }
  function stopChecks(area) {
    var st = area._aos; if (!st) return;
    clearTimeout(st.timer); st.timer = 0;
    st.running = false;
    ['v', 's'].forEach(function (k) { var u = st['un' + k]; st['un' + k] = null; if (u) u(); });
  }
  function settle(area) {
    var st = area._aos;
    if (st.s !== undefined && (st.s || st.v !== undefined)) { st.running = false; if (IO) IO.unobserve(area); }
  }

  /* ---------- the buttons ---------- */
  var ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>';
  var ICON_SPIN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3c3.6 0 6.5 1.3 6.5 3S12.3 8.6 9.6 8.9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6.6 9C3.6 8.8 1.5 7.7 1.5 6S4.4 3 8 3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 7l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  var ICON_PHOTO = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5.5" cy="6.5" r="1.3" fill="currentColor"/><path d="M2.5 12l4-3.5 3 2.5 2-1.5 2.5 2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

  function paint(area) {
    var st = area._aos, has = { v: hasVideo(st), s: !!st.s };
    var bar = area.querySelector(':scope > .aos-bar');
    if (!has.v && !has.s) { if (bar) bar.parentNode.removeChild(bar); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'aos-bar' + (st.mode === 'badges' ? ' aos-static' : '');
      area.appendChild(bar);
    }
    var tag = st.mode === 'badges' ? 'span' : 'button';
    var html = '';
    if (tag === 'button') html += '<button type="button" class="aos-b aos-photos" data-aos="photos" hidden>' + ICON_PHOTO + '<span>Photos</span></button>';
    if (has.v) html += '<' + tag + (tag === 'button' ? ' type="button" aria-pressed="false"' : '') + ' class="aos-b" data-aos="video">' + ICON_PLAY + '<span>Video</span></' + tag + '>';
    if (has.s) html += '<' + tag + (tag === 'button' ? ' type="button" aria-pressed="false"' : '') + ' class="aos-b" data-aos="spin">' + ICON_SPIN + '<span>360</span></' + tag + '>';
    if (bar.getAttribute('data-k') !== html) { bar.innerHTML = html; bar.setAttribute('data-k', html); syncBar(area); }
  }
  function hasVideo(st) { return !!st.v || (!!st.s && st.v !== ''); }
  /* Libraries to try on a tap: the one we know, else the spin's, then the rest */
  function videoLibs(st) {
    var first = st.v || st.s, out = first ? [first] : [];
    order(st.src).forEach(function (l) { if (out.indexOf(l) === -1) out.push(l); });
    return out;
  }
  function syncBar(area) {
    var bar = area.querySelector(':scope > .aos-bar'); if (!bar) return;
    var open = area._aos && area._aos.open;
    bar.querySelectorAll('[data-aos]').forEach(function (b) {
      var k = b.getAttribute('data-aos');
      if (k === 'photos') b.hidden = !open;
      else b.setAttribute('aria-pressed', String(open === k));
    });
  }

  /* ---------- the stage over the photo ---------- */
  function leave(area) {
    var st = area && area._aos; if (!st || !st.open) return;
    if (st.spin) { st.spin.destroy(); st.spin = null; }
    var stage = area.querySelector(':scope > .aos-stage');
    if (stage) {
      var v = stage.querySelector('video');
      stage.parentNode.removeChild(stage);
      if (v) { v._aosClosed = true; try { v.pause(); } catch (e) {} v.removeAttribute('src'); try { v.load(); } catch (e) {} }
    }
    st.open = null; syncBar(area);
  }
  function stageFor(area, kind) {
    leave(area);
    var s = document.createElement('div');
    s.className = 'aos-stage aos-' + kind;
    var bar = area.querySelector(':scope > .aos-bar');
    area.insertBefore(s, bar || null);
    area._aos.open = kind; syncBar(area);
    return s;
  }
  /* Everything up to play() runs synchronously inside the tap, which is what
     iOS needs before it will start a video. A library that errors (403) moves
     on to the next; if none has it the photo comes back quietly and the Video
     button goes for that car. */
  function openVideo(area) {
    var st = area._aos; if (!hasVideo(st)) return;
    var libs = videoLibs(st), i = 0, played = false;
    var s = stageFor(area, 'video');
    var v = document.createElement('video');
    v.controls = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.setAttribute('controls', ''); v.setAttribute('preload', 'auto');
    v.setAttribute('aria-label', 'Walkaround video of ' + st.reg);
    v.addEventListener('loadedmetadata', function () {
      if (v._aosClosed) return;
      if (st.v !== libs[i]) { st.v = libs[i]; remember('v:' + st.reg, libs[i]); }
    });
    v.addEventListener('play', function () {
      if (played) return; played = true;
      track('video_play', { reg: st.reg, library: libs[i], page: location.pathname });
    });
    v.addEventListener('error', function () {
      if (v._aosClosed || st.open !== 'video') return;
      if (++i < libs.length) { go(); return; }
      st.v = ''; remember('v:' + st.reg, '');
      leave(area); paint(area);
    });
    function go() {
      v.src = videoUrl(libs[i], st.reg);
      var p = v.play();
      if (p && p['catch']) p['catch'](function (err) {
        /* A retry after a 403 is outside the tap. These walkarounds have no
           sound, so a muted start loses nothing. */
        if (err && err.name === 'NotAllowedError' && !v._aosClosed && !v.muted) {
          v.muted = true; var q = v.play(); if (q && q['catch']) q['catch'](function () {});
        }
      });
    }
    s.appendChild(v);
    go();
  }
  function openSpin(area) {
    var st = area._aos; if (!st.s) return;
    var s = stageFor(area, 'spin');
    st.spin = new Spin(s, st.reg, st.s);
    track('spin_open', { reg: st.reg, library: st.s, page: location.pathname });
    try { s.focus({ preventScroll: true }); } catch (e) { s.focus(); }
  }

  /* The spin: one <img> whose src is swapped. Assume 125 frames until one
     fails; about 8px of drag is one frame, dragging right goes forward, the
     ends wrap. Only a small window around the current frame is fetched. */
  function Spin(stage, reg, lib) {
    var self = this, frame = 1, count = MAX_FRAMES, cache = {}, dead = false;
    stage.tabIndex = 0;
    stage.setAttribute('role', 'group');
    stage.setAttribute('aria-roledescription', '360 view');
    stage.setAttribute('aria-label', '360 view of ' + reg + '. Drag, or use the arrow keys, to turn the car.');
    stage.innerHTML = '<img class="aos-frame" alt="360 view of ' + reg + '" draggable="false">'
      + '<button type="button" class="aos-step aos-prev" aria-label="Turn the car one way"><span aria-hidden="true">&#8249;</span></button>'
      + '<button type="button" class="aos-step aos-next" aria-label="Turn the car the other way"><span aria-hidden="true">&#8250;</span></button>'
      + '<span class="aos-hint" aria-hidden="true">' + ICON_SPIN + 'Drag to turn</span>';
    var img = stage.querySelector('.aos-frame'), hint = stage.querySelector('.aos-hint');
    img.setAttribute('draggable', 'false');

    function wrap(n) { return ((n - 1) % count + count) % count + 1; }
    function failed(n) {
      if (dead || n <= 1 || n > count) return;     /* frame 1 is proven by the check */
      count = n - 1;
      if (frame > count) show(1);
    }
    function preload(n) {
      for (var d = -2; d <= 12; d++) {
        var k = wrap(n + d);
        if (cache[k]) continue;
        var im = cache[k] = new Image();
        im.onerror = (function (k) { return function () { failed(k); }; })(k);
        im.src = frameUrl(lib, reg, k);
      }
    }
    function show(n) {
      frame = wrap(n);
      img.setAttribute('data-frame', String(frame));
      img.src = frameUrl(lib, reg, frame);
      preload(frame);
    }
    img.addEventListener('error', function () { failed(Number(img.getAttribute('data-frame'))); });

    var drag = null;
    function down(e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest && e.target.closest('button')) return;
      e.preventDefault();
      try { stage.focus({ preventScroll: true }); } catch (x) {}
      try { var sel = window.getSelection && window.getSelection(); if (sel) sel.removeAllRanges(); } catch (x) {}
      drag = { x: e.clientX, f: frame, id: e.pointerId };
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
      stage.classList.add('aos-dragging');
    }
    function move(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var n = drag.f + Math.trunc((e.clientX - drag.x) / PX_PER_FRAME);
      if (wrap(n) !== frame) { show(n); hint.classList.add('aos-gone'); }
    }
    function up(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      drag = null; stage.classList.remove('aos-dragging');
    }
    function key(e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); self.step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); self.step(-1); }
    }
    function click(e) {
      var b = e.target.closest('.aos-step'); if (!b) return;
      self.step(b.classList.contains('aos-next') ? 1 : -1);
    }
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('lostpointercapture', up);
    stage.addEventListener('keydown', key);
    stage.addEventListener('click', click);
    stage.addEventListener('dragstart', function (e) { e.preventDefault(); });

    this.step = function (d) { show(frame + d); hint.classList.add('aos-gone'); };
    this.state = function () { return { reg: reg, lib: lib, frame: frame, count: count }; };
    this.destroy = function () {
      dead = true;
      Object.keys(cache).forEach(function (k) { cache[k].onerror = null; });
      cache = {};
    };
    show(1);
  }

  /* ---------- wiring ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.aos-bar button[data-aos]'); if (!b) return;
    var area = b.closest('[data-aos-reg]'); if (!area || !area._aos) return;
    e.preventDefault(); e.stopPropagation();
    var k = b.getAttribute('data-aos');
    if (k === 'photos' || area._aos.open === k) leave(area);
    else if (k === 'video') openVideo(area);
    else if (k === 'spin') openSpin(area);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var area = e.target.closest && e.target.closest('[data-aos-reg]');
    if (area && area._aos && area._aos.open) leave(area);
  });

  function attach(area) {
    var reg = norm(area.getAttribute('data-aos-reg'));
    if (!reg) return;
    var src = area.getAttribute('data-aos-src') === 'group' ? 'group' : 'forecourt';
    var st = area._aos;
    if (st && st.reg === reg && st.src === src) return;
    if (st) { leave(area); stopChecks(area); var old = area.querySelector(':scope > .aos-bar'); if (old) old.remove(); }
    st = area._aos = { reg: reg, src: src, mode: area.getAttribute('data-aos-mode') || 'full',
                       v: recall('v:' + reg), s: recall('s:' + reg), open: null, spin: null };
    area.classList.add('aos-area');
    if (st.v !== undefined && st.s !== undefined) { paint(area); return; }
    paint(area);
    if (IO) IO.observe(area); else start(area);
  }
  function scan(root) {
    css();
    (root || document).querySelectorAll('[data-aos-reg]').forEach(attach);
  }

  var cssDone = false;
  function css() {
    if (cssDone) return; cssDone = true;
    var s = document.createElement('style');
    s.textContent = [
      '.aos-area{position:relative}',
      '.aos-bar{position:absolute;left:10px;top:10px;z-index:6;display:flex;gap:6px;flex-wrap:wrap}',
      '.aos-b{display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:0 11px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(6,9,14,.72);color:#fff;font:600 12px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:.04em;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}',
      'button.aos-b{cursor:pointer;min-height:36px}',
      '.aos-b[hidden]{display:none}',
      'button.aos-b[aria-pressed="true"]{background:#1c69d4;border-color:#1c69d4}',
      'button.aos-b:focus-visible{outline:2px solid #fff;outline-offset:2px}',
      '.aos-b svg{width:13px;height:13px;flex:0 0 auto}',
      '.aos-static .aos-b{min-height:24px;padding:0 8px;font-size:11px}',
      '.aos-stage{position:absolute;inset:0;z-index:5;background:#0d1117;overflow:hidden}',
      '.aos-stage video{display:block;width:100%;height:100%;object-fit:contain;background:#000}',
      '.aos-spin{touch-action:pan-y;cursor:grab;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;outline:none}',
      '.aos-spin:focus-visible{box-shadow:inset 0 0 0 2px #1c69d4}',
      '.aos-spin.aos-dragging{cursor:grabbing}',
      '.aos-frame{display:block;width:100%;height:100%;object-fit:cover;-webkit-user-select:none;user-select:none;-webkit-user-drag:none;pointer-events:none}',
      '.aos-step{position:absolute;top:50%;width:44px;height:44px;margin-top:-22px;border:0;border-radius:50%;background:rgba(6,9,14,.6);color:#fff;font-size:28px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0 0 3px}',
      '.aos-step:focus-visible{outline:2px solid #fff}',
      '.aos-prev{left:8px}.aos-next{right:8px}',
      '.aos-hint{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(6,9,14,.66);color:#fff;font:600 12px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;pointer-events:none;transition:opacity .4s}',
      '.aos-hint svg{width:14px;height:14px}',
      '.aos-hint.aos-gone{opacity:0}',
      '@media (prefers-reduced-motion:reduce){.aos-hint{transition:none}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* Pages load this with defer, so anything drawn before it arrived is picked
     up here; later renders call scan() themselves. */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan(document); });
  else scan(document);

  return {
    scan: scan, attach: attach, leave: leave,
    norm: norm, order: order, videoUrl: videoUrl, frameUrl: frameUrl,
    /* for tests */
    debug: function (area) { var st = area && area._aos; return st ? { reg: st.reg, src: st.src, v: st.v, s: st.s, open: st.open, spin: st.spin && st.spin.state() } : null; }
  };
})();
