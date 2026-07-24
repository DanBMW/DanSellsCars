/* FORECOURT EMPIRE — scene.js
   Isometric "diorama" renderer for the site view. Canvas 2D, no assets:
   every car, building and figure is drawn procedurally. Chunky, saturated,
   Clash-of-Clans-flavoured. Talks back to UI via UI.slotTap(i). */
'use strict';

var Scene = window.Scene = {};

(function () {
  var cv, ctx, raf = null, W = 0, H = 0, dpr = 1;
  var TILE = 30, ORX = 0, ORY = 0;
  var bays = [];          // {slot, wx, wy, internal, poly:[{x,y}...], cx, cy}
  var figures = [];       // walking staff/customers
  var t0 = performance.now();
  var lastState = null;
  var moveMode = false;

  function G() { return FE.getState(); }

  /* ---------- iso projection ---------- */
  function iso(wx, wy, wz) {
    return {
      x: ORX + (wx - wy) * TILE,
      y: ORY + (wx + wy) * TILE * 0.5 - (wz || 0) * TILE * 0.95
    };
  }

  /* ---------- colour helpers ---------- */
  function sh(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = clamp((n >> 16) + amt), g = clamp(((n >> 8) & 255) + amt), b = clamp((n & 255) + amt);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function clamp(x) { return Math.max(0, Math.min(255, Math.round(x))); }

  /* ---------- layout ---------- */
  function layout() {
    var g = G(); if (!g) return;
    var s = FE.SITES[g.site];
    var total = s.ext + s.int + g.extraSlots;
    var internal = s.int;
    var cols = total <= 24 ? 5 : 6;
    var rows = Math.ceil(total / cols);

    // scale tiles so the iso grid fits the canvas width
    var spanTiles = cols + rows;
    TILE = Math.max(16, Math.min(34, (W * 0.9) / spanTiles));

    bays = [];
    var i, col, row, wx, wy;
    var gapX = 1.12, gapY = 1.5;
    // world extents to centre horizontally + leave room for building at back
    var minWX = 0, maxWX = (cols - 1) * gapX, minWY = 0, maxWY = (rows - 1) * gapY;
    // centre: screen x of (wx-wy). Range of (wx-wy) is [minWX-maxWY, maxWX-minWY]
    var loX = minWX - maxWY, hiX = maxWX - minWY;
    ORX = W / 2 - (loX + hiX) / 2 * TILE;
    ORY = TILE * 3.2;   // top margin for building/roof

    for (i = 0; i < total; i++) {
      col = i % cols; row = Math.floor(i / cols);
      wx = col * gapX; wy = row * gapY;
      var b = { slot: i, wx: wx, wy: wy, internal: i < internal, cx: 0, cy: 0, poly: null };
      bays.push(b);
    }

    // scene pixel height -> size the canvas so it all shows (container scrolls if tall)
    var bottom = iso(maxWX, maxWY + 1.2, 0).y;
    var needH = bottom + TILE * 2.4;
    setCanvasSize(W, Math.max(needH, 300));
    // recompute bay screen polys
    bays.forEach(function (b) {
      var p = bayPoly(b.wx, b.wy);
      b.poly = p.poly; b.cx = p.cx; b.cy = p.cy;
    });
    seedFigures();
  }

  function bayPoly(wx, wy) {
    var hw = 0.46, hl = 0.62;   // half footprint of a bay
    var a = iso(wx - hw, wy - hl), b = iso(wx + hw, wy - hl),
        c = iso(wx + hw, wy + hl), d = iso(wx - hw, wy + hl);
    return { poly: [a, b, c, d], cx: iso(wx, wy).x, cy: iso(wx, wy).y };
  }

  /* ---------- figures (walking staff + customers) ---------- */
  function seedFigures() {
    var g = G(); if (!g) return;
    figures = [];
    var staff = g.staff.filter(function (st) { return !(st.leaving && st.leaving <= g.week); });
    var palette = ['#e0663a', '#3a8fe0', '#4cae6a', '#c14fb0', '#d9a93a', '#7a63d0'];
    staff.forEach(function (st, i) {
      var away = st.onHoliday === g.week || st.offUntil > g.week;
      if (away) return;
      figures.push(makeFigure(palette[i % palette.length], 'staff', st.name));
    });
    // ambient customers scale with recent footfall / week liveliness
    var s = FE.SEASON[(g.week - 1) % 52];
    var custN = Math.max(0, Math.round(2 + s.d * 3));
    var i2;
    for (i2 = 0; i2 < custN; i2++) figures.push(makeFigure('#9aa4af', 'cust', null));
  }
  function makeFigure(colour, kind, name) {
    var wander = randPathPoint();
    return {
      colour: colour, kind: kind, name: name,
      wx: wander.wx, wy: wander.wy,
      tx: wander.wx, ty: wander.wy,
      speed: kind === 'staff' ? 0.010 : 0.007,
      pause: Math.random() * 2000, phase: Math.random() * 6.28
    };
  }
  function randPathPoint() {
    // wander in the aisles across the lot footprint
    var g = G();
    var s = FE.SITES[g.site];
    var total = s.ext + s.int + g.extraSlots;
    var cols = total <= 24 ? 5 : 6;
    var rows = Math.ceil(total / cols);
    return { wx: Math.random() * (cols - 1) * 1.12, wy: Math.random() * ((rows - 1) * 1.5 + 1) };
  }

  function stepFigures(dt) {
    figures.forEach(function (f) {
      if (f.pause > 0) { f.pause -= dt; return; }
      var dx = f.tx - f.wx, dy = f.ty - f.wy;
      var d = Math.hypot(dx, dy);
      if (d < 0.05) {
        var p = randPathPoint(); f.tx = p.wx; f.ty = p.wy;
        f.pause = 400 + Math.random() * 2600;
        return;
      }
      var step = f.speed * dt / 16;
      f.wx += dx / d * step; f.wy += dy / d * step;
    });
  }

  /* ---------- car sprite (iso box stack) ---------- */
  function isoBox(cx, cy, hw, hl, hgt, top, left, right) {
    // corners of the top face and the base, in screen space, given a ground
    // centre (cx,cy). hw/hl are half-widths along the two iso axes (in TILE units).
    function pt(sx, sy, up) { return { x: cx + (sx - sy) * TILE, y: cy + (sx + sy) * TILE * 0.5 - up * TILE * 0.95 }; }
    var tA = pt(-hw, -hl, hgt), tB = pt(hw, -hl, hgt), tC = pt(hw, hl, hgt), tD = pt(-hw, hl, hgt);
    var bC = pt(hw, hl, 0), bD = pt(-hw, hl, 0), bB = pt(hw, -hl, 0);
    // right face (towards +x screen)
    ctx.fillStyle = right;
    ctx.beginPath(); ctx.moveTo(tB.x, tB.y); ctx.lineTo(tC.x, tC.y); ctx.lineTo(bC.x, bC.y); ctx.lineTo(bB.x, bB.y); ctx.closePath(); ctx.fill();
    // left face (towards -x screen / front)
    ctx.fillStyle = left;
    ctx.beginPath(); ctx.moveTo(tD.x, tD.y); ctx.lineTo(tC.x, tC.y); ctx.lineTo(bC.x, bC.y); ctx.lineTo(bD.x, bD.y); ctx.closePath(); ctx.fill();
    // top face
    ctx.fillStyle = top;
    ctx.beginPath(); ctx.moveTo(tA.x, tA.y); ctx.lineTo(tB.x, tB.y); ctx.lineTo(tC.x, tC.y); ctx.lineTo(tD.x, tD.y); ctx.closePath(); ctx.fill();
    return { tA: tA, tB: tB, tC: tC, tD: tD };
  }

  function drawCar(cx, cy, hex, opts) {
    opts = opts || {};
    // shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + TILE * 0.14, TILE * 0.62, TILE * 0.32, 0, 0, 6.283);
    ctx.fill();
    ctx.restore();

    var body = hex, roof = sh(hex, 26), lft = sh(hex, -34), rgt = sh(hex, -20);
    if (opts.dull) { body = sh(hex, -18); roof = sh(hex, -2); }
    // lower body
    isoBox(cx, cy - TILE * 0.02, 0.34, 0.52, 0.3, body, lft, rgt);
    // cabin / greenhouse (glass sides), slightly inset and back
    var glassTop = '#cdd6de', glassL = '#7f8b98', glassR = '#93a0ad';
    isoBox(cx, cy - TILE * 0.02, 0.26, 0.30, 0.55, roof, glassL, glassR);
    // windscreen hint (front, -y): a dark band
    ctx.fillStyle = 'rgba(20,28,38,0.55)';
    var w1 = { x: cx - 0.26 * TILE, y: cy - 0.02 * TILE + (0.30) * TILE * 0.5 - 0.3 * TILE * 0.95 };
    // headlights
    ctx.fillStyle = opts.isNew ? '#eaffea' : '#f2f2d8';
    var hlY = cy - TILE * 0.02 - 0.3 * TILE * 0.05;
    ctx.beginPath(); ctx.ellipse(cx - TILE * 0.28, cy + TILE * 0.02, TILE * 0.06, TILE * 0.04, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - TILE * 0.02, cy + TILE * 0.14, TILE * 0.06, TILE * 0.04, 0, 0, 6.283); ctx.fill();

    // sold sign
    if (opts.sold) {
      badge(cx, cy - TILE * 1.0, '#d93a2b', '#fff', 'SOLD');
    } else if (opts.isNew) {
      badge(cx, cy - TILE * 1.0, '#2fae54', '#eafff0', 'NEW');
    }
    // dust film on ageing stock
    if (opts.dust) {
      ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#8a7f66';
      ctx.beginPath(); ctx.ellipse(cx, cy - TILE * 0.25, TILE * 0.5, TILE * 0.42, 0, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    if (opts.disc) badge(cx + TILE * 0.5, cy - TILE * 0.2, '#ffd24a', '#4a3000', '%');
  }

  function badge(x, y, bg, fg, txt) {
    ctx.save();
    ctx.font = '900 ' + Math.round(TILE * 0.34) + 'px system-ui, sans-serif';
    var w = ctx.measureText(txt).width + TILE * 0.3;
    ctx.fillStyle = bg;
    roundRect(x - w / 2, y - TILE * 0.28, w, TILE * 0.42, 3); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y - TILE * 0.06);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* ---------- building ---------- */
  function drawBuilding() {
    var g = G(); var s = FE.SITES[g.site];
    var total = s.ext + s.int + g.extraSlots;
    var cols = total <= 24 ? 5 : 6;
    var rows = Math.ceil(total / cols);
    // anchor the building screen-centre to the lot's screen-centre, sat behind the back row
    var lotCx = (cols - 1) * 1.12 / 2, lotCy = (rows - 1) * 1.5 / 2;
    var c = { x: ORX + (lotCx - lotCy) * TILE, y: ORY - TILE * 0.3 };
    var tier = s.tier;
    var wallH = tier === 1 ? 0.7 : tier === 2 ? 1.1 : 1.5;
    var widthK = tier === 1 ? 0.62 : tier === 2 ? 0.82 : 0.92;
    var halfW = (cols * 1.12) / 2 * widthK, halfL = tier === 1 ? 0.5 : 0.68;
    var wallCol = tier === 3 ? '#3b5168' : tier === 2 ? '#7a5b43' : '#8a8f98';
    // main block
    isoBox(c.x, c.y, halfW, halfL, wallH, sh(wallCol, 30), sh(wallCol, -30), sh(wallCol, -14));
    // glass frontage for showroom
    if (tier === 3) {
      ctx.fillStyle = 'rgba(150,205,255,0.5)';
      var gy = c.y - wallH * TILE * 0.95 + TILE * 0.2;
      ctx.fillRect(c.x - halfW * TILE * 0.8, gy, halfW * TILE * 1.6, wallH * TILE * 0.55);
      ctx.strokeStyle = 'rgba(220,240,255,0.6)'; ctx.lineWidth = 1;
      var k; for (k = -3; k <= 3; k++) { var xx = c.x + k * halfW * TILE * 0.26; ctx.beginPath(); ctx.moveTo(xx, gy); ctx.lineTo(xx, gy + wallH * TILE * 0.55); ctx.stroke(); }
    }
    // signage
    ctx.save();
    ctx.font = '900 ' + Math.round(TILE * 0.5) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(g.brand.toUpperCase(), c.x, c.y - wallH * TILE * 0.95 - TILE * 0.4);
    ctx.restore();
    // flag on the portacabin
    if (tier === 1) {
      var fx = c.x + halfW * TILE * 0.75, fy = c.y - wallH * TILE * 0.95;
      ctx.strokeStyle = '#cfd6dd'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - TILE); ctx.stroke();
      var wav = Math.sin(performance.now() / 300) * TILE * 0.12;
      ctx.fillStyle = '#d93a2b';
      ctx.beginPath(); ctx.moveTo(fx, fy - TILE); ctx.lineTo(fx + TILE * 0.5, fy - TILE * 0.85 + wav); ctx.lineTo(fx, fy - TILE * 0.7); ctx.closePath(); ctx.fill();
    }
  }

  /* ---------- ground ---------- */
  function drawGround() {
    var g = G(); var s = FE.SITES[g.site];
    var total = s.ext + s.int + g.extraSlots;
    var cols = total <= 24 ? 5 : 6;
    var rows = Math.ceil(total / cols);
    var gapX = 1.12, gapY = 1.5;
    var pad = 0.85;
    var a = iso(-pad, -0.7), b = iso((cols - 1) * gapX + pad, -0.7),
        c = iso((cols - 1) * gapX + pad, (rows - 1) * gapY + pad + 0.4),
        d = iso(-pad, (rows - 1) * gapY + pad + 0.4);
    // grass border
    ctx.fillStyle = g.site === 0 ? '#3f4a33' : '#42553a';
    poly([iso(-pad - 0.5, -1.1), iso((cols - 1) * gapX + pad + 0.5, -1.1), iso((cols - 1) * gapX + pad + 0.5, (rows - 1) * gapY + pad + 0.9), iso(-pad - 0.5, (rows - 1) * gapY + pad + 0.9)]);
    // yard surface
    var grad = ctx.createLinearGradient(0, a.y, 0, c.y);
    if (g.site === 0) { grad.addColorStop(0, '#5a5346'); grad.addColorStop(1, '#4a443a'); }
    else { grad.addColorStop(0, '#3c424b'); grad.addColorStop(1, '#31363d'); }
    ctx.fillStyle = grad;
    poly([a, b, c, d]);
    // gravel speckle
    if (g.site === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      var i; for (i = 0; i < 60; i++) {
        var rx = a.x + Math.random() * (b.x - a.x), ry = a.y + Math.random() * (c.y - a.y);
        ctx.fillRect(rx, ry, 2, 1);
      }
    }
  }

  function poly(pts) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath(); ctx.fill();
  }

  function drawBay(b, occupied) {
    // bay outline / parking lines
    ctx.strokeStyle = occupied ? 'rgba(255,255,255,0.10)' : (b.internal ? 'rgba(150,200,255,0.6)' : 'rgba(255,255,255,0.28)');
    ctx.lineWidth = b.internal ? 1.6 : 1.2;
    ctx.beginPath();
    ctx.moveTo(b.poly[0].x, b.poly[0].y);
    for (var i = 1; i < b.poly.length; i++) ctx.lineTo(b.poly[i].x, b.poly[i].y);
    ctx.closePath();
    if (b.internal) { ctx.fillStyle = 'rgba(140,190,255,0.10)'; ctx.fill(); }
    ctx.stroke();
    if (moveMode && !occupied) {
      ctx.fillStyle = 'rgba(255,210,74,0.22)'; ctx.fill();
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  function drawFigure(f) {
    var p = iso(f.wx, f.wy, 0);
    var bob = Math.sin(performance.now() / 160 + f.phase) * (f.pause > 0 ? 0 : TILE * 0.05);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + TILE * 0.05, TILE * 0.18, TILE * 0.09, 0, 0, 6.283); ctx.fill();
    // body
    ctx.fillStyle = f.colour;
    roundRect(p.x - TILE * 0.11, p.y - TILE * 0.5 + bob, TILE * 0.22, TILE * 0.42, TILE * 0.08); ctx.fill();
    // head
    ctx.fillStyle = '#e9c39a';
    ctx.beginPath(); ctx.arc(p.x, p.y - TILE * 0.56 + bob, TILE * 0.11, 0, 6.283); ctx.fill();
    // staff name tag
    if (f.kind === 'staff' && TILE > 22) {
      ctx.save();
      ctx.font = '700 ' + Math.round(TILE * 0.3) + 'px system-ui'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      var w = ctx.measureText(f.name).width + 8;
      roundRect(p.x - w / 2, p.y - TILE * 0.95 + bob, w, TILE * 0.34, 3); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
      ctx.fillText(f.name, p.x, p.y - TILE * 0.78 + bob);
      ctx.restore();
    }
  }

  /* ---------- main draw ---------- */
  function draw() {
    var g = G(); if (!g || !ctx) return;
    ctx.clearRect(0, 0, W, H);

    // seasonal sky tint wash
    var s = FE.SEASON[(g.week - 1) % 52];
    var winter = s.mo === 'Dec' || s.mo === 'Jan' || s.mo === 'Feb';
    ctx.fillStyle = winter ? 'rgba(120,140,170,0.05)' : 'rgba(255,240,200,0.04)';
    ctx.fillRect(0, 0, W, H);

    drawGround();
    drawBuilding();

    // map slot -> car
    var bySlot = {};
    g.stock.forEach(function (c) { if (c.slot != null && (c.status === 'stock' || c.status === 'sold')) bySlot[c.slot] = c; });

    // collect drawables (bays first as floor, then cars+figures depth-sorted)
    bays.forEach(function (b) { drawBay(b, !!bySlot[b.slot]); });

    var drawables = [];
    bays.forEach(function (b) {
      var car = bySlot[b.slot];
      if (car) drawables.push({ depth: b.wx + b.wy, kind: 'car', b: b, car: car });
    });
    figures.forEach(function (f) { drawables.push({ depth: f.wx + f.wy + 0.2, kind: 'fig', f: f }); });
    drawables.sort(function (a, b) { return a.depth - b.depth; });

    drawables.forEach(function (dz) {
      if (dz.kind === 'car') {
        var car = dz.car, d = FE.daysIn(car);
        drawCar(dz.b.cx, dz.b.cy, FE.COLOURS[car.colour].hex, {
          sold: car.status === 'sold',
          isNew: car.isNew,
          dust: d >= 60 && car.status === 'stock',
          disc: d >= 90 && car.status === 'stock',
          dull: d >= 60 && car.status === 'stock'
        });
      } else {
        drawFigure(dz.f);
      }
    });
  }

  function loop() {
    var now = performance.now();
    var dt = Math.min(48, now - t0); t0 = now;
    stepFigures(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  /* ---------- canvas sizing ---------- */
  function setCanvasSize(w, h) {
    W = w; H = h; dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- hit testing ---------- */
  function pointInPoly(px, py, poly) {
    var inside = false, i, j;
    for (i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function onTap(ev) {
    var rect = cv.getBoundingClientRect();
    var px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    var py = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
    // topmost (front-most) bay whose slightly-raised car area was hit — test back-to-front,
    // keep last match so front wins
    var hit = -1;
    bays.forEach(function (b) { if (pointInPoly(px, py, b.poly)) hit = b.slot; });
    if (hit >= 0 && window.UI) UI.slotTap(hit);
  }

  /* ---------- public ---------- */
  Scene.mount = function (container, opts) {
    opts = opts || {};
    moveMode = !!opts.moveMode;
    container.innerHTML = '';
    cv = document.createElement('canvas');
    cv.className = 'scene-canvas';
    container.appendChild(cv);
    ctx = cv.getContext('2d');
    W = container.clientWidth || 360;
    setCanvasSize(W, 300);
    cv.addEventListener('click', onTap);
    layout();
    lastState = stamp();
    if (raf) cancelAnimationFrame(raf);
    t0 = performance.now();
    loop();
  };
  Scene.setMoveMode = function (on) { moveMode = on; };
  Scene.refresh = function () {
    if (!ctx) return;
    var st = stamp();
    if (st !== lastState) { layout(); lastState = st; }
    else seedFigures();
  };
  Scene.unmount = function () {
    if (raf) cancelAnimationFrame(raf); raf = null; ctx = null; cv = null;
  };
  // a cheap fingerprint of things that change the layout
  function stamp() {
    var g = G(); if (!g) return '';
    var occ = g.stock.filter(function (c) { return c.status === 'stock' || c.status === 'sold'; }).length;
    var staff = g.staff.length;
    return g.site + '|' + g.extraSlots + '|' + occ + '|' + staff + '|' + g.week + '|' + (moveMode ? 'm' : '');
  }
  Scene.resize = function () {
    if (!ctx || !cv) return;
    var container = cv.parentElement;
    if (!container) return;
    W = container.clientWidth || 360;
    layout();
  };
})();
