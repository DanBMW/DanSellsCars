/* FORECOURT EMPIRE — scene.js
   Isometric "diorama" renderer for the site view. Canvas 2D, no assets:
   cars, buildings, trees and figures are all drawn procedurally.

   v2 — the elegance pass:
   - cars are pre-rendered cartoon sprites (per body style, colour, state)
     with rounded silhouettes, glass, arches, lights and a gloss highlight
   - one sun (upper-left): every shadow falls the same way
   - kerbed tarmac, painted bays, grass world with trees and bushes
   - characterful buildings per premises tier, kept clear of the stock
   - chibi walking figures with name pills
   - vignette + warm light so the frame reads like a little world

   Talks back to UI via UI.slotTap(i). */
'use strict';

var Scene = window.Scene = {};

(function () {
  var cv, ctx, raf = null, W = 0, H = 0, dpr = 1;
  var TILE = 30, ORX = 0, ORY = 0;
  var bays = [];          // {slot, wx, wy, internal, poly, cx, cy}
  var figures = [];
  var props = [];         // trees / bushes, laid out once per layout()
  var t0 = performance.now();
  var lastState = null;
  var moveMode = false;
  var spriteCache = {};

  function G() { return FE.getState(); }

  /* ---------- iso projection ---------- */
  function iso(wx, wy, wz) {
    return {
      x: ORX + (wx - wy) * TILE,
      y: ORY + (wx + wy) * TILE * 0.5 - (wz || 0) * TILE * 0.95
    };
  }

  /* ---------- helpers ---------- */
  function clamp255(x) { return Math.max(0, Math.min(255, Math.round(x))); }
  function sh(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgb(' + clamp255((n >> 16) + amt) + ',' + clamp255(((n >> 8) & 255) + amt) + ',' + clamp255((n & 255) + amt) + ')';
  }
  function shA(hex, amt, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + clamp255((n >> 16) + amt) + ',' + clamp255(((n >> 8) & 255) + amt) + ',' + clamp255((n & 255) + amt) + ',' + a + ')';
  }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function poly(c, pts) {
    c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
  }
  // deterministic rng so props don't dance between frames
  function lcg(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function gridDims() {
    var g = G(); var s = FE.SITES[g.site];
    var total = s.ext + s.int + g.extraSlots;
    var cols = total <= 24 ? 5 : 6;
    return { total: total, cols: cols, rows: Math.ceil(total / cols), gapX: 1.12, gapY: 1.5, internal: s.int };
  }

  /* ---------- layout ---------- */
  function layout() {
    var g = G(); if (!g) return;
    var d = gridDims();
    var spanTiles = d.cols + d.rows;
    TILE = Math.max(16, Math.min(34, (W * 0.88) / spanTiles));

    var maxWX = (d.cols - 1) * d.gapX, maxWY = (d.rows - 1) * d.gapY;
    var loX = -maxWY, hiX = maxWX;
    ORX = W / 2 - (loX + hiX) / 2 * TILE;
    ORY = TILE * 4.1;   // room for the building + sign at the back

    bays = [];
    for (var i = 0; i < d.total; i++) {
      var col = i % d.cols, row = Math.floor(i / d.cols);
      bays.push({ slot: i, wx: col * d.gapX, wy: row * d.gapY, internal: i < d.internal });
    }

    var bottom = iso(maxWX, maxWY + 1.3, 0).y;
    setCanvasSize(W, Math.max(bottom + TILE * 2.6, 300));
    bays.forEach(function (b) {
      var hw = 0.46, hl = 0.62;
      b.poly = [iso(b.wx - hw, b.wy - hl), iso(b.wx + hw, b.wy - hl), iso(b.wx + hw, b.wy + hl), iso(b.wx - hw, b.wy + hl)];
      var c = iso(b.wx, b.wy);
      b.cx = c.x; b.cy = c.y;
    });

    layoutProps(d);
    seedFigures();
  }

  function layoutProps(d) {
    props = [];
    var rnd = lcg(d.total * 7919 + G().site * 131 + 17);
    var maxWX = (d.cols - 1) * d.gapX, maxWY = (d.rows - 1) * d.gapY;
    var i;
    // trees along the back corners, clear of the building footprint
    for (i = 0; i < 2; i++) {
      props.push({ kind: 'tree', wx: -1.45 + rnd() * 0.3, wy: -0.9 + rnd() * 0.5 + i * 0.9, s: 0.9 + rnd() * 0.35 });
      props.push({ kind: 'tree', wx: maxWX + 1.15 + rnd() * 0.3, wy: -0.7 + rnd() * 0.5 + i * 0.9, s: 0.9 + rnd() * 0.35 });
    }
    // bushes down the sides
    var n = 2 + Math.floor(d.rows / 2);
    for (i = 0; i < n; i++) {
      props.push({ kind: 'bush', wx: -1.35 - rnd() * 0.25, wy: 0.6 + (maxWY / n) * i + rnd() * 0.4, s: 0.8 + rnd() * 0.4 });
      props.push({ kind: 'bush', wx: maxWX + 1.1 + rnd() * 0.25, wy: 0.9 + (maxWY / n) * i + rnd() * 0.4, s: 0.8 + rnd() * 0.4 });
    }
    // a couple of flower tubs by the front corner
    props.push({ kind: 'tub', wx: -1.05, wy: maxWY + 0.95, s: 1 });
    props.push({ kind: 'tub', wx: maxWX + 0.85, wy: maxWY + 1.05, s: 1 });
  }

  /* ---------- figures ---------- */
  function seedFigures() {
    var g = G(); if (!g) return;
    figures = [];
    var palette = ['#ff8757', '#58a6ff', '#3fd68c', '#e07ad2', '#ffd166', '#a58bff'];
    var idx = 0;
    g.staff.forEach(function (st) {
      if (st.leaving && st.leaving <= g.week) return;
      if (st.onHoliday === g.week || st.offUntil > g.week) return;
      figures.push(makeFigure(palette[idx++ % palette.length], 'staff', st.name));
    });
    var s = FE.SEASON[(g.week - 1) % 52];
    var custN = Math.max(1, Math.round(1 + s.d * 3));
    for (var i = 0; i < custN; i++) figures.push(makeFigure(i % 2 ? '#9fb0c8' : '#b7a48e', 'cust', null));
  }
  function makeFigure(colour, kind, name) {
    var w = randPathPoint();
    return {
      colour: colour, kind: kind, name: name,
      wx: w.wx, wy: w.wy, tx: w.wx, ty: w.wy,
      speed: kind === 'staff' ? 0.010 : 0.007,
      pause: Math.random() * 2000, phase: Math.random() * 6.28, dir: 1
    };
  }
  function randPathPoint() {
    var d = gridDims();
    return { wx: Math.random() * (d.cols - 1) * d.gapX, wy: 0.1 + Math.random() * ((d.rows - 1) * d.gapY + 0.8) };
  }
  function stepFigures(dt) {
    figures.forEach(function (f) {
      if (f.pause > 0) { f.pause -= dt; return; }
      var dx = f.tx - f.wx, dy = f.ty - f.wy;
      var dd = Math.hypot(dx, dy);
      if (dd < 0.05) {
        var p = randPathPoint(); f.tx = p.wx; f.ty = p.wy;
        f.pause = 500 + Math.random() * 2800;
        return;
      }
      var step = f.speed * dt / 16;
      f.wx += dx / dd * step; f.wy += dy / dd * step;
      f.dir = (dx - dy) >= 0 ? 1 : -1;   // rough screen-x facing
    });
  }

  /* ---------- car sprites ----------
     Drawn once per (segment, colour, state) in a 110x84 design space at 2x,
     facing screen-left (front at low x). Each segment has its own silhouette
     so an SUV, a coupe, a saloon and an estate read as different cars.

     Coordinate convention: ground line = 66; smaller y = higher up.
     Key heights per segment: sill (body underside), belt (top of body sheet /
     bottom of side glass), hood (top of the bonnet), roof (top of the roof).
     wsx0/wsx1 = windscreen base/top x; rr = roof-rear-corner x; the boot deck
     (saloon only) sits at bootY from rgb..x1. */
  var GROUND = 66;
  var CARSPEC = {
    // stubby, short bonnet, tall-ish upright cabin
    Supermini: { x0: 27, x1: 84, sill: 61, belt: 47, hood: 43, roof: 31, wsx0: 40, wsx1: 46, rr: 70, wr: 8.0, wa: 38, wb: 71 },
    // classic two-box, gently sloped tailgate
    Hatchback: { x0: 21, x1: 90, sill: 61, belt: 47, hood: 42, roof: 29, wsx0: 39, wsx1: 47, rr: 73, wr: 8.5, wa: 37, wb: 77 },
    // three-box: separate boot deck behind the cabin, sits low
    Saloon:    { x0: 16, x1: 95, sill: 61, belt: 46, hood: 41, roof: 30, wsx0: 42, wsx1: 52, rr: 68, rgb: 77, bootY: 44, wr: 8.5, wa: 35, wb: 81 },
    // long roof carried right to the back, near-vertical tailgate
    Estate:    { x0: 17, x1: 96, sill: 61, belt: 47, hood: 42, roof: 29, wsx0: 39, wsx1: 47, rr: 88, wr: 8.5, wa: 36, wb: 82 },
    // tall, boxy, high clearance, big wheels, upright glasshouse
    SUV:       { x0: 20, x1: 91, sill: 56, belt: 42, hood: 38, roof: 24, wsx0: 39, wsx1: 46, rr: 85, wr: 11,  wa: 37, wb: 77 },
    // raised like an SUV but with a sleeker, sloped tail
    Crossover: { x0: 21, x1: 89, sill: 58, belt: 44, hood: 40, roof: 27, wsx0: 39, wsx1: 47, rr: 79, wr: 9.5, wa: 36, wb: 75 },
    // low and long, small cabin set back, fastback roofline
    Coupe:     { x0: 18, x1: 93, sill: 62, belt: 49, hood: 45, roof: 35, wsx0: 46, wsx1: 57, rr: 78, wr: 8.5, wa: 35, wb: 79, fast: true },
    // one-box people-carrier: steep short bonnet, huge tall glasshouse
    MPV:       { x0: 18, x1: 91, sill: 57, belt: 44, hood: 40, roof: 23, wsx0: 31, wsx1: 41, rr: 85, wr: 9,   wa: 35, wb: 79 }
  };

  function carSprite(colourIdx, seg, dull, isNew) {
    var key = colourIdx + '|' + seg + '|' + (dull ? 1 : 0) + '|' + (isNew ? 1 : 0);
    if (spriteCache[key]) return spriteCache[key];
    var hex = FE.COLOURS[colourIdx].hex;
    var P = CARSPEC[seg] || CARSPEC.Hatchback;
    var DW = 110, DH = 84, S = 2;
    var off = document.createElement('canvas');
    off.width = DW * S; off.height = DH * S;
    var c = off.getContext('2d');
    c.scale(S, S);

    var base = GROUND;
    var wy = base - 3;                                   // wheel centre y
    var midX = (P.x0 + P.x1) / 2;

    // build the body silhouette (clockwise from the front sill)
    var outline;
    if (P.rgb != null) {                                // three-box (saloon)
      outline = [
        { x: P.x0, y: P.sill }, { x: P.x0, y: P.hood }, { x: P.wsx0, y: P.hood },
        { x: P.wsx1, y: P.roof }, { x: P.rr, y: P.roof }, { x: P.rgb, y: P.bootY },
        { x: P.x1, y: P.bootY }, { x: P.x1, y: P.sill }
      ];
    } else if (P.fast) {                                // fastback coupe
      outline = [
        { x: P.x0, y: P.sill }, { x: P.x0, y: P.hood }, { x: P.wsx0, y: P.hood },
        { x: P.wsx1, y: P.roof }, { x: P.rr, y: P.roof + 1 }, { x: P.x1, y: P.belt + 1 },
        { x: P.x1, y: P.sill }
      ];
    } else {                                            // two-box (hatch/estate/suv/etc)
      outline = [
        { x: P.x0, y: P.sill }, { x: P.x0, y: P.hood }, { x: P.wsx0, y: P.hood },
        { x: P.wsx1, y: P.roof }, { x: P.rr, y: P.roof }, { x: P.x1, y: P.belt },
        { x: P.x1, y: P.sill }
      ];
    }

    // --- soft contact shadow (sun upper-left → shadow lower-right)
    var len = P.x1 - P.x0;
    c.fillStyle = 'rgba(8,12,22,0.28)';
    c.beginPath(); c.ellipse(midX + 3, base + 5, len * 0.58, 9, 0, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(8,12,22,0.16)';
    c.beginPath(); c.ellipse(midX + 6, base + 6, len * 0.68, 12, 0, 0, 6.283); c.fill();

    // --- body sheet
    var bodyGrad = c.createLinearGradient(0, P.roof, 0, base);
    bodyGrad.addColorStop(0, sh(hex, 34));
    bodyGrad.addColorStop(0.42, hex);
    bodyGrad.addColorStop(1, sh(hex, -30));
    poly(c, outline);
    c.fillStyle = bodyGrad; c.fill();
    // subtle body outline for definition
    c.strokeStyle = shA(hex, -60, 0.35); c.lineWidth = 1; c.stroke();

    // --- glasshouse: follows the roofline between the pillars
    var gTopFront = { x: P.wsx1 + 1.5, y: P.roof + 2.5 };
    var gTopRear, gBotRear;
    if (P.rgb != null) { gTopRear = { x: P.rr - 1.5, y: P.roof + 2.5 }; gBotRear = { x: P.rgb - 2, y: P.belt - 1 }; }
    else if (P.fast) { gTopRear = { x: P.rr - 3, y: P.roof + 3 }; gBotRear = { x: P.x1 - 8, y: P.belt - 1 }; }
    else { gTopRear = { x: P.rr - 2.5, y: P.roof + 2.5 }; gBotRear = { x: P.rr - 4, y: P.belt - 1 }; }
    var gBotFront = { x: P.wsx0 + 3, y: P.belt - 1 };
    var glassPts = [gTopFront, gTopRear, gBotRear, gBotFront];
    var glass = c.createLinearGradient(0, P.roof, 0, P.belt);
    glass.addColorStop(0, '#aacdec'); glass.addColorStop(0.5, '#43648c'); glass.addColorStop(1, '#243a54');
    poly(c, glassPts); c.fillStyle = glass; c.fill();
    // B-pillar
    var pillarX = gTopFront.x + (gTopRear.x - gTopFront.x) * 0.5;
    c.strokeStyle = sh(hex, -6); c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(pillarX, P.roof + 2); c.lineTo(pillarX - 1, P.belt - 1); c.stroke();
    // windscreen glint
    c.save(); poly(c, glassPts); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.30)';
    c.beginPath();
    c.moveTo(gTopFront.x + 1, P.roof + 2); c.lineTo(gTopFront.x + (gTopRear.x - gTopFront.x) * 0.34, P.roof + 2);
    c.lineTo(gTopFront.x + (gTopRear.x - gTopFront.x) * 0.12, P.belt); c.lineTo(gBotFront.x - 3, P.belt);
    c.closePath(); c.fill();
    c.restore();

    // --- wheel arches + wheels
    [P.wa, P.wb].forEach(function (wx) {
      c.fillStyle = sh(hex, -52);                       // arch recess
      c.beginPath(); c.arc(wx, wy - 1, P.wr + 3, Math.PI, 6.283); c.fill();
      c.fillRect(wx - P.wr - 3, wy - 1, (P.wr + 3) * 2, 3);
      var tyre = c.createRadialGradient(wx - 2, wy - 3, 1, wx, wy, P.wr);
      tyre.addColorStop(0, '#39404e'); tyre.addColorStop(1, '#12151d');
      c.fillStyle = tyre;
      c.beginPath(); c.arc(wx, wy, P.wr, 0, 6.283); c.fill();
      var hub = c.createRadialGradient(wx - 1, wy - 1, 1, wx, wy, P.wr * 0.5);
      hub.addColorStop(0, '#d3dae2'); hub.addColorStop(1, '#8b95a3');
      c.fillStyle = hub;
      c.beginPath(); c.arc(wx, wy, P.wr * 0.46, 0, 6.283); c.fill();
      c.fillStyle = '#5f6774';
      c.beginPath(); c.arc(wx, wy, P.wr * 0.16, 0, 6.283); c.fill();
    });

    // --- sill shadow
    c.fillStyle = shA(hex, -46, 0.9);
    rr(c, P.x0 + 2, P.sill - 2.5, len - 4, 3.5, 2); c.fill();

    // --- lights
    c.fillStyle = '#fff6cf';                            // headlight
    rr(c, P.x0 - 0.5, P.hood + 2, 6.5, 5.5, 2.6); c.fill();
    c.fillStyle = 'rgba(255,244,200,0.4)';
    c.beginPath(); c.ellipse(P.x0 + 1, P.hood + 4, 8, 6, 0, 0, 6.283); c.fill();
    c.fillStyle = '#ff5a54';                            // taillight
    rr(c, P.x1 - 5.5, (P.rgb != null ? P.bootY : P.belt) + 1.5, 5.5, 4.5, 2); c.fill();

    // --- door line + handle
    c.strokeStyle = 'rgba(10,14,22,0.26)'; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(pillarX + 1, P.belt + 1); c.lineTo(pillarX, P.sill - 4); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.5)';
    rr(c, pillarX + 3, P.belt + 3.5, 6, 2, 1); c.fill();

    // --- gloss along the roof + bonnet
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.beginPath(); c.ellipse((P.wsx1 + P.rr) / 2, P.roof + 1.4, (P.rr - P.wsx1) * 0.34, 1.8, 0, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.16)';
    c.beginPath(); c.ellipse(P.x0 + (P.wsx0 - P.x0) * 0.5, P.hood + 1.2, (P.wsx0 - P.x0) * 0.4, 1.5, 0, 0, 6.283); c.fill();

    // --- states
    if (dull) {
      c.save(); poly(c, outline); c.clip();
      c.fillStyle = 'rgba(120,110,90,0.32)'; c.fillRect(0, 0, DW, DH);
      c.fillStyle = 'rgba(92,84,66,0.5)';
      for (var i = 0; i < 16; i++) c.fillRect(P.x0 + (i * 37) % len, P.roof + (i * 17) % (P.sill - P.roof), 1.6, 1.2);
      c.restore();
    }
    if (isNew) {
      c.fillStyle = 'rgba(255,255,255,0.92)';
      var sx = P.rr - 4, sy = P.roof - 3.5;
      c.beginPath();
      c.moveTo(sx, sy - 4); c.lineTo(sx + 1.4, sy - 1.2); c.lineTo(sx + 4.4, sy);
      c.lineTo(sx + 1.4, sy + 1.2); c.lineTo(sx, sy + 4); c.lineTo(sx - 1.4, sy + 1.2);
      c.lineTo(sx - 4.4, sy); c.lineTo(sx - 1.4, sy - 1.2); c.closePath(); c.fill();
    }

    spriteCache[key] = { cv: off, dw: DW, dh: DH, base: base };
    return spriteCache[key];
  }

  function drawCarAt(cx, cy, car) {
    var d = FE.daysIn(car);
    var seg = FE.MODELS[car.model].seg;
    var dull = d >= 60 && car.status === 'stock';
    var sp = carSprite(car.colour, seg, dull, !!car.isNew);
    var w = TILE * 2.02, h = w * sp.dh / sp.dw;
    // baseline sits a whisker below bay centre so the car fills the bay
    var bx = cx - w / 2, by = cy + TILE * 0.34 - h * (sp.base / sp.dh);
    // ground it before drawing it — offset away from the key light, upper-left
    contactShadow(cx + TILE * 0.10, cy + TILE * 0.40, w * 0.40, TILE * 0.20, 0.38);
    ctx.drawImage(sp.cv, bx, by, w, h);
    /* Rim the sun-facing edge. Cheap: redraw the sprite clipped to a sliver on
       the light side and screen a warm tint over it, so the car reads as lit
       from somewhere rather than evenly coloured. */
    var mm = mood();
    if (mm.str > 0.35) {
      /* Three narrowing bands fake a gradient falloff. One wide band at high
         alpha blew the paint out in high summer and left a visible seam down
         the middle of every car. */
      var lit = (mm.str - 0.35) * 0.16;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (var bI = 0; bI < 3; bI++) {
        ctx.globalAlpha = lit;
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx, by, w * (0.30 - bI * 0.09), h);
        ctx.clip();
        ctx.drawImage(sp.cv, bx, by, w, h);
        ctx.restore();
      }
      ctx.restore();
    }

    if (car.status === 'sold') pill(cx, cy - TILE * 0.95, '#ff4d5e', '#fff', 'SOLD', -0.06);
    else {
      if (car.isNew) pill(cx, cy - TILE * 0.95, '#2fd07f', '#053018', 'NEW', 0);
      if (d >= 90) starburst(cx + TILE * 0.62, cy - TILE * 0.1, TILE * 0.24);
    }
  }

  function pill(x, y, bg, fg, txt, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.font = '900 ' + Math.max(9, Math.round(TILE * 0.34)) + 'px system-ui, sans-serif';
    var w = ctx.measureText(txt).width + TILE * 0.42;
    var h = TILE * 0.48;
    ctx.fillStyle = 'rgba(8,12,22,0.35)';
    rr(ctx, -w / 2 + 1.5, -h / 2 + 2.5, w, h, h / 2); ctx.fill();
    ctx.fillStyle = bg;
    rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    rr(ctx, -w / 2 + 2, -h / 2 + 1.5, w - 4, h * 0.42, h * 0.3); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 0, 0.5);
    ctx.restore();
  }

  // price-cut tag on a discounted car. Deliberately small and flat: a busy
  // forecourt can carry a dozen of these and they must read as labels.
  function starburst(x, y, r) {
    var w = r * 1.9, h = r * 1.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(6,10,20,0.5)';
    rrect(-w / 2 + 0.5, -h / 2 + 1.2, w, h, h * 0.42); ctx.fill();
    ctx.fillStyle = '#ffc93f';
    rrect(-w / 2, -h / 2, w, h, h * 0.42); ctx.fill();
    ctx.fillStyle = '#4a2f00';
    ctx.font = '900 ' + Math.round(h * 0.78) + 'px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('%', 0, h * 0.06);
    ctx.restore();
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- ground ---------- */
  /* ---------- art direction ----------
     One palette per month drives everything: the sky behind the diorama, the
     grass, the tarmac, the colour and strength of the sun, and the weather.
     The forecourt should look like the month it is — grey and wet through
     January, bleached in high summer, golden in September — because the
     game's whole rhythm is seasonal and the scene never showed it.

     Each entry:
       sky   [top, bottom]  the backdrop the diorama sits in
       sun   colour of the key light, and str its strength 0-1
       amb   ambient fill from the sky, tints the shadow side
       grass [top, bottom]
       haze  how much distance washes toward the sky colour
       wet   0-1, how likely the ground is to be wet this month */
  var MOOD = {
    Jan: { sky: ['#2c3a55', '#55647f'], sun: '#cfe0f5', str: 0.22, amb: '#8fa8cc', grass: ['#4a6a4c', '#3b563e'], haze: 0.34, wet: 0.75 },
    Feb: { sky: ['#31405c', '#5f7396'], sun: '#dbe7f7', str: 0.28, amb: '#93accf', grass: ['#4e7150', '#3d5b41'], haze: 0.30, wet: 0.65 },
    Mar: { sky: ['#3a5378', '#7d9ac0'], sun: '#f4ecd6', str: 0.42, amb: '#9dbadd', grass: ['#568a4a', '#42663f'], haze: 0.24, wet: 0.45 },
    Apr: { sky: ['#41628f', '#93b4d8'], sun: '#fff2d2', str: 0.55, amb: '#a8c7e6', grass: ['#5c9450', '#457043'], haze: 0.20, wet: 0.38 },
    May: { sky: ['#4472a5', '#a6c8e6'], sun: '#fff4cf', str: 0.66, amb: '#b2d0ec', grass: ['#63a054', '#4a7a46'], haze: 0.16, wet: 0.28 },
    Jun: { sky: ['#4a7cb4', '#b4d4ef'], sun: '#fff6c8', str: 0.76, amb: '#bcd8f2', grass: ['#68a856', '#4e8048'], haze: 0.14, wet: 0.22 },
    Jul: { sky: ['#4e83bd', '#c0dcf3'], sun: '#fff8c2', str: 0.84, amb: '#c4def5', grass: ['#6fae57', '#54864a'], haze: 0.12, wet: 0.18 },
    Aug: { sky: ['#5386bd', '#c6dff4'], sun: '#fff5bd', str: 0.80, amb: '#c6e0f5', grass: ['#74ad5c', '#59854e'], haze: 0.13, wet: 0.20 },
    Sep: { sky: ['#4a6f9e', '#b6cbe2'], sun: '#ffe6a8', str: 0.68, amb: '#b4cbe4', grass: ['#6d9c52', '#547a45'], haze: 0.18, wet: 0.32 },
    Oct: { sky: ['#3f5c85', '#8fa6c4'], sun: '#ffd894', str: 0.50, amb: '#a2b8d4', grass: ['#67894a', '#4e6a3f'], haze: 0.24, wet: 0.52 },
    Nov: { sky: ['#344a6c', '#6d81a0'], sun: '#e8d7b4', str: 0.32, amb: '#93a7c4', grass: ['#5a7444', '#455c3a'], haze: 0.30, wet: 0.70 },
    Dec: { sky: ['#2a3854', '#51607c'], sun: '#cddcf0', str: 0.20, amb: '#8ca5c8', grass: ['#4a6647', '#3a5039'], haze: 0.36, wet: 0.78 }
  };
  function mood() {
    var g = G();
    var s = FE.SEASON[(g.week - 1) % 52];
    return MOOD[s.mo] || MOOD.Jun;
  }
  /* Weather is stable within a game week — rolled from the week number so it
     does not flicker frame to frame, and so a wet week stays wet. */
  function weather() {
    var g = G(), m = mood();
    var r = lcg(g.week * 977 + 13);
    r();
    var roll = r();
    var wet = roll < m.wet;
    var heavy = wet && r() < 0.35;
    return { wet: wet, heavy: heavy, sun: !wet && r() < 0.55 };
  }

  /* The sky the whole diorama sits in. Without it the scene floated in the
     app background and read as a UI element rather than a place. */
  /* The sky only changes when the month, the weather or the canvas size does,
     so it is baked once and blitted. Five radial gradients per frame is fine on
     a laptop and not fine on a mid-range phone. */
  var skyCache = null, skyKey = '';
  function drawSky() {
    var g = G(), m = mood(), wx = weather();
    var key = FE.SEASON[(g.week - 1) % 52].mo + '|' + (wx.sun ? 1 : 0) + '|' + W + 'x' + H + '|' + dpr;
    if (!skyCache || skyKey !== key) {
      skyCache = document.createElement('canvas');
      skyCache.width = Math.max(1, Math.round(W * dpr));
      skyCache.height = Math.max(1, Math.round(H * dpr));
      var sc = skyCache.getContext('2d');
      sc.scale(dpr, dpr);
      paintSky(sc, m, wx);
      skyKey = key;
    }
    ctx.drawImage(skyCache, 0, 0, W, H);
  }
  function paintSky(ctx, m, wx) {
    var sk = ctx.createLinearGradient(0, 0, 0, H);
    sk.addColorStop(0, m.sky[0]);
    sk.addColorStop(1, m.sky[1]);
    ctx.fillStyle = sk;
    ctx.fillRect(0, 0, W, H);
    // soft cloud banding — a flat gradient read as empty
    var cr = lcg(7);
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (var ci = 0; ci < 5; ci++) {
      var cy0 = H * (0.04 + cr() * 0.34);
      var cw = W * (0.5 + cr() * 0.7), chh = H * (0.03 + cr() * 0.05);
      var cg = ctx.createRadialGradient(W * cr(), cy0, 0, W * cr(), cy0, cw);
      cg.addColorStop(0, shA('#ffffff', 0, 0.10));
      cg.addColorStop(1, shA('#ffffff', 0, 0));
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.ellipse(W * (0.15 + cr() * 0.7), cy0, cw * 0.5, chh, 0, 0, 6.283); ctx.fill();
    }
    ctx.restore();
    // a low sun disc on a clear day, sitting behind the diorama
    if (wx.sun) {
      var sunG = ctx.createRadialGradient(W * 0.19, H * 0.13, 0, W * 0.19, H * 0.13, W * 0.34);
      sunG.addColorStop(0, shA(m.sun, 40, 0.55));
      sunG.addColorStop(0.4, shA(m.sun, 0, 0.16));
      sunG.addColorStop(1, shA(m.sun, 0, 0));
      ctx.fillStyle = sunG; ctx.fillRect(0, 0, W, H);
    }
  }

  /* A soft contact shadow. The single biggest thing missing: every car, tree
     and person floated a few pixels above the tarmac with nothing tying it
     down. Drawn as a squashed ellipse offset away from the sun. */
  function contactShadow(cx, cy, rx, ry, alpha) {
    var m = mood();
    var a = (alpha == null ? 0.34 : alpha) * (0.45 + m.str * 0.75);
    ctx.save();
    var gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    gr.addColorStop(0, 'rgba(8,14,26,' + a.toFixed(3) + ')');
    gr.addColorStop(0.6, 'rgba(8,14,26,' + (a * 0.5).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(8,14,26,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }

  function drawGround() {
    var g = G(); var d = gridDims();
    var maxWX = (d.cols - 1) * d.gapX, maxWY = (d.rows - 1) * d.gapY;
    var pad = 0.85;

    // grass world
    var gA = iso(-pad - 1.3, -1.9), gB = iso(maxWX + pad + 1.3, -1.9),
        gC = iso(maxWX + pad + 1.3, maxWY + pad + 1.15), gD = iso(-pad - 1.3, maxWY + pad + 1.15);
    var m = mood();
    var grassGrad = ctx.createLinearGradient(0, gA.y, 0, gC.y);
    grassGrad.addColorStop(0, m.grass[0]); grassGrad.addColorStop(1, m.grass[1]);
    ctx.fillStyle = grassGrad;
    poly(ctx, [gA, gB, gC, gD]); ctx.fill();
    // grass mottling — clipped to the grass diamond so it never spills out
    var rnd = lcg(d.total * 31 + 5);
    ctx.save();
    poly(ctx, [gA, gB, gC, gD]); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,220,0.05)';
    for (var i = 0; i < 26; i++) {
      var mx = gA.x + rnd() * (gB.x - gA.x), my = gA.y + rnd() * (gC.y - gA.y);
      ctx.beginPath(); ctx.ellipse(mx, my, TILE * (0.5 + rnd()), TILE * 0.22, 0, 0, 6.283); ctx.fill();
    }
    ctx.restore();

    // kerb then tarmac
    var kPad = pad + 0.16;
    poly(ctx, [iso(-kPad, -0.86), iso(maxWX + kPad, -0.86), iso(maxWX + kPad, maxWY + kPad + 0.42), iso(-kPad, maxWY + kPad + 0.42)]);
    ctx.fillStyle = '#b9bfc9'; ctx.fill();
    ctx.strokeStyle = 'rgba(40,50,60,0.35)'; ctx.lineWidth = 1; ctx.stroke();

    var a = iso(-pad, -0.7), b = iso(maxWX + pad, -0.7),
        c2 = iso(maxWX + pad, maxWY + pad + 0.28), d2 = iso(-pad, maxWY + pad + 0.28);
    var wx = weather();
    var tGrad = ctx.createLinearGradient(0, a.y, 0, c2.y);
    var wetAmt = wx.wet ? (wx.heavy ? -26 : -16) : 0;   // rain darkens the surface
    if (g.site === 0) { tGrad.addColorStop(0, sh('#6e6553', wetAmt)); tGrad.addColorStop(1, sh('#57503f', wetAmt)); }
    else { tGrad.addColorStop(0, sh('#4b5568', wetAmt)); tGrad.addColorStop(1, sh('#3a4254', wetAmt)); }
    ctx.fillStyle = tGrad;
    poly(ctx, [a, b, c2, d2]); ctx.fill();

    // surface texture — clipped to the tarmac diamond
    ctx.save();
    poly(ctx, [a, b, c2, d2]); ctx.clip();
    if (g.site === 0) {
      ctx.fillStyle = 'rgba(30,25,15,0.14)';
      for (var j = 0; j < 90; j++) {
        var rx = a.x + rnd() * (b.x - a.x), ry = a.y + rnd() * (c2.y - a.y);
        ctx.fillRect(rx, ry, 2, 1.2);
      }
      ctx.fillStyle = 'rgba(255,250,230,0.05)';
      for (var j2 = 0; j2 < 40; j2++) {
        ctx.fillRect(a.x + rnd() * (b.x - a.x), a.y + rnd() * (c2.y - a.y), 1.5, 1);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.028)';
      for (var j3 = 0; j3 < 14; j3++) {
        ctx.beginPath();
        ctx.ellipse(a.x + rnd() * (b.x - a.x), a.y + rnd() * (c2.y - a.y), TILE * 0.8, TILE * 0.3, 0, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.restore();

    // showroom floor slab under internal bays
    if (d.internal > 0) {
      var lastInt = Math.min(d.internal, d.cols) - 1;
      var s0 = iso(-0.62, -0.75), s1 = iso(lastInt * d.gapX + 0.62, -0.75),
          s2 = iso(lastInt * d.gapX + 0.62, 0.75), s3 = iso(-0.62, 0.75);
      var fGrad = ctx.createLinearGradient(0, s0.y, 0, s2.y);
      fGrad.addColorStop(0, 'rgba(196,214,238,0.34)'); fGrad.addColorStop(1, 'rgba(150,175,210,0.18)');
      poly(ctx, [s0, s1, s2, s3]);
      ctx.fillStyle = fGrad; ctx.fill();
      ctx.strokeStyle = 'rgba(210,228,255,0.45)'; ctx.lineWidth = 1.4; ctx.stroke();
    }
  }

  function drawBay(b, occupied) {
    if (moveMode && !occupied) {
      poly(ctx, b.poly);
      ctx.fillStyle = 'rgba(255,210,74,0.24)'; ctx.fill();
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.stroke();
      return;
    }
    poly(ctx, b.poly);
    // a faint filled pad under occupied bays so every car reads as one pitch
    if (occupied) {
      ctx.fillStyle = b.internal ? 'rgba(150,200,255,0.16)' : 'rgba(255,255,255,0.06)';
      ctx.fill();
    } else if (b.internal) {
      ctx.fillStyle = 'rgba(140,190,255,0.10)'; ctx.fill();
    }
    if (b.internal) {
      ctx.strokeStyle = occupied ? 'rgba(200,225,255,0.4)' : 'rgba(200,225,255,0.7)';
      ctx.lineWidth = 1.6;
    } else {
      ctx.strokeStyle = occupied ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.8;
    }
    ctx.stroke();
  }

  /* ---------- buildings ---------- */
  function isoBoxAt(cx, cy, hw, hl, hgt, top, left, right) {
    function pt(sx, sy, up) { return { x: cx + (sx - sy) * TILE, y: cy + (sx + sy) * TILE * 0.5 - up * TILE * 0.95 }; }
    var tA = pt(-hw, -hl, hgt), tB = pt(hw, -hl, hgt), tC = pt(hw, hl, hgt), tD = pt(-hw, hl, hgt);
    var bC = pt(hw, hl, 0), bD = pt(-hw, hl, 0), bB = pt(hw, -hl, 0);
    ctx.fillStyle = right;
    poly(ctx, [tB, tC, bC, bB]); ctx.fill();
    ctx.fillStyle = left;
    poly(ctx, [tD, tC, bC, bD]); ctx.fill();
    ctx.fillStyle = top;
    poly(ctx, [tA, tB, tC, tD]); ctx.fill();
    return { tA: tA, tB: tB, tC: tC, tD: tD, bB: bB, bC: bC, bD: bD, pt: pt };
  }

  // the service department — a workshop that appears on the grass once built,
  // shown as scaffolding while under construction
  // smart repair / wash-and-valet lock-ups — smaller units beside the workshop,
  // each with its own door colour and a prop so you can tell them apart
  function drawSmallBay(cx, cy, id, building) {
    var hw = 0.38, hl = 0.3, hgt = 0.44;
    ctx.fillStyle = 'rgba(8,12,22,0.2)';
    ctx.beginPath(); ctx.ellipse(cx + TILE * 0.16, cy + TILE * 0.16, hw * TILE * 1.3, TILE * 0.26, 0, 0, 6.283); ctx.fill();

    if (building) {
      var b0 = isoBoxAt(cx, cy, hw, hl, hgt, 'rgba(150,160,175,0.26)', 'rgba(120,130,145,0.26)', 'rgba(90,100,115,0.28)');
      ctx.strokeStyle = 'rgba(230,200,120,0.7)'; ctx.lineWidth = 1.2;
      for (var k = 0; k <= 2; k++) {
        var t = k / 2;
        ctx.beginPath();
        ctx.moveTo(b0.bD.x + (b0.tD.x - b0.bD.x) * t, b0.bD.y + (b0.tD.y - b0.bD.y) * t);
        ctx.lineTo(b0.bC.x + (b0.tC.x - b0.bC.x) * t, b0.bC.y + (b0.tC.y - b0.bC.y) * t);
        ctx.stroke();
      }
      return;
    }

    var wall = id === 'valet' ? '#8fb6c4' : '#a9a0b6';
    var box = isoBoxAt(cx, cy, hw, hl, hgt, sh(wall, 18), sh(wall, -6), sh(wall, -28));
    ctx.fillStyle = id === 'valet' ? '#4d707e' : '#5f5870';
    poly(ctx, [box.tA, box.tB, box.tC, box.tD]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    poly(ctx, [box.tA, box.tB, box.pt(hw * 0.85, -hl, hgt), box.pt(-hw * 0.85, -hl, hgt)]); ctx.fill();

    // door on the front face
    var fTL = box.tD, fTR = box.tC, fBL = box.bD;
    var fw = fTR.x - fTL.x, skew = (fTR.y - fTL.y) / fw;
    var dx0 = fTL.x + fw * 0.18, dx1 = fTL.x + fw * 0.82;
    var dy0 = fTL.y + (fBL.y - fTL.y) * 0.22, dy1 = fBL.y - 1;
    ctx.fillStyle = id === 'valet' ? '#2f9fb8' : '#7d5fc4';
    poly(ctx, [
      { x: dx0, y: dy0 + (dx0 - fTL.x) * skew },
      { x: dx1, y: dy0 + (dx1 - fTL.x) * skew },
      { x: dx1, y: dy1 + (dx1 - fTL.x) * skew },
      { x: dx0, y: dy1 + (dx0 - fTL.x) * skew }
    ]); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    for (var r = 1; r < 3; r++) {
      var ry = dy0 + (dy1 - dy0) * (r / 3);
      ctx.beginPath();
      ctx.moveTo(dx0, ry + (dx0 - fTL.x) * skew);
      ctx.lineTo(dx1, ry + (dx1 - fTL.x) * skew);
      ctx.stroke();
    }
    // a prop out front: suds bucket for the valet, paint tin for smart repair
    var px = box.bB.x + TILE * 0.16, py = box.bB.y - TILE * 0.04;
    ctx.fillStyle = id === 'valet' ? '#3fc9e0' : '#c46b4a';
    ctx.beginPath(); ctx.ellipse(px, py, TILE * 0.1, TILE * 0.06, 0, 0, 6.283); ctx.fill();
    if (id === 'valet') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(px - TILE * 0.04, py - TILE * 0.1, TILE * 0.045, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(px + TILE * 0.06, py - TILE * 0.16, TILE * 0.032, 0, 6.283); ctx.fill();
    }
  }

  function drawServiceDept(cx, cy, building) {
    var hw = 0.6, hl = 0.42, hgt = 0.66;
    ctx.fillStyle = 'rgba(8,12,22,0.22)';
    ctx.beginPath(); ctx.ellipse(cx + TILE * 0.28, cy + TILE * 0.26, hw * TILE * 1.25, TILE * 0.4, 0, 0, 6.283); ctx.fill();

    if (building) {
      // scaffold shell + a little crane while the builders are in
      var b0 = isoBoxAt(cx, cy, hw, hl, hgt, 'rgba(150,160,175,0.28)', 'rgba(120,130,145,0.28)', 'rgba(90,100,115,0.3)');
      ctx.strokeStyle = 'rgba(230,200,120,0.75)'; ctx.lineWidth = 1.4;
      var k;
      for (k = 0; k <= 3; k++) {
        var t = k / 3;
        ctx.beginPath();
        ctx.moveTo(b0.bD.x + (b0.tD.x - b0.bD.x) * t, b0.bD.y + (b0.tD.y - b0.bD.y) * t);
        ctx.lineTo(b0.bC.x + (b0.tC.x - b0.bC.x) * t, b0.bC.y + (b0.tC.y - b0.bC.y) * t);
        ctx.stroke();
      }
      // crane
      var cxr = b0.tB.x + TILE * 0.2, cyr = b0.tB.y;
      ctx.strokeStyle = '#e0b84a'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(cxr, cyr + TILE * 0.2); ctx.lineTo(cxr, cyr - TILE * 1.3); ctx.lineTo(cxr - TILE * 0.9, cyr - TILE * 1.05); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cxr - TILE * 0.6, cyr - TILE * 1.13); ctx.lineTo(cxr - TILE * 0.6, cyr - TILE * 0.7); ctx.stroke();
      return;
    }

    var wall = '#9aa6b3';
    var box = isoBoxAt(cx, cy, hw, hl, hgt, sh(wall, 20), sh(wall, -6), sh(wall, -30));
    // corrugated roof with a ridge highlight
    ctx.fillStyle = '#5a6572'; poly(ctx, [box.tA, box.tB, box.tC, box.tD]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    poly(ctx, [box.tA, box.tB, box.pt(hw * 0.85, -hl, hgt), box.pt(-hw * 0.85, -hl, hgt)]); ctx.fill();

    // front face = tD..tC..bC..bD
    var fTL = box.tD, fTR = box.tC, fBL = box.bD;
    var fw = fTR.x - fTL.x, skew = (fTR.y - fTL.y) / fw;
    function fy(x, b) { return b + (x - fTL.x) * skew; }
    // big roller door
    var dx0 = fTL.x + fw * 0.12, dx1 = fTL.x + fw * 0.62;
    var dy0 = fTL.y + (fBL.y - fTL.y) * 0.26, dy1 = fBL.y - 1.5;
    ctx.fillStyle = '#39424e';
    poly(ctx, [{ x: dx0, y: fy(dx0, dy0) }, { x: dx1, y: fy(dx1, dy0) }, { x: dx1, y: fy(dx1, dy1) }, { x: dx0, y: fy(dx0, dy1) }]); ctx.fill();
    ctx.strokeStyle = 'rgba(18,22,30,0.55)'; ctx.lineWidth = 1;
    for (var sl = 1; sl < 5; sl++) { var ly = dy0 + (dy1 - dy0) * sl / 5; ctx.beginPath(); ctx.moveTo(dx0, fy(dx0, ly)); ctx.lineTo(dx1, fy(dx1, ly)); ctx.stroke(); }
    // a car up on the ramp, glimpsed inside the bay
    ctx.fillStyle = 'rgba(70,90,120,0.7)';
    var rcx = (dx0 + dx1) / 2, rcy = fy(rcx, dy1) - TILE * 0.28;
    rr(ctx, rcx - TILE * 0.34, rcy, TILE * 0.68, TILE * 0.14, TILE * 0.06); ctx.fill();
    ctx.fillStyle = 'rgba(40,55,78,0.7)';
    rr(ctx, rcx - TILE * 0.18, rcy - TILE * 0.1, TILE * 0.34, TILE * 0.11, TILE * 0.05); ctx.fill();
    ctx.strokeStyle = 'rgba(30,36,44,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rcx - TILE * 0.2, rcy + TILE * 0.14); ctx.lineTo(rcx - TILE * 0.2, fy(rcx, dy1)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rcx + TILE * 0.2, rcy + TILE * 0.14); ctx.lineTo(rcx + TILE * 0.2, fy(rcx, dy1)); ctx.stroke();
    // side window
    ctx.fillStyle = 'rgba(255,220,150,0.8)';
    var wx0 = fTL.x + fw * 0.72, wx1 = fTL.x + fw * 0.92, wy0 = fTL.y + (fBL.y - fTL.y) * 0.34, wy1 = fTL.y + (fBL.y - fTL.y) * 0.56;
    poly(ctx, [{ x: wx0, y: fy(wx0, wy0) }, { x: wx1, y: fy(wx1, wy0) }, { x: wx1, y: fy(wx1, wy1) }, { x: wx0, y: fy(wx0, wy1) }]); ctx.fill();

    // SERVICE fascia
    var sw = hw * TILE * 1.5, sh2 = TILE * 0.42;
    var sx = cx - sw / 2, sy = box.tA.y + (box.tC.y - box.tA.y) * 0.16 - sh2 / 2;
    ctx.fillStyle = 'rgba(8,12,22,0.35)'; rr(ctx, sx + 1.5, sy + 2, sw, sh2, 4); ctx.fill();
    ctx.fillStyle = '#16233d'; rr(ctx, sx, sy, sw, sh2, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(47,214,192,0.7)'; ctx.lineWidth = 1.2; rr(ctx, sx, sy, sw, sh2, 4); ctx.stroke();
    ctx.fillStyle = '#2fd6c0'; ctx.font = '900 ' + Math.round(sh2 * 0.56) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SERVICE', cx, sy + sh2 / 2 + 0.5);
  }

  function drawBuilding() {
    var g = G(); var s = FE.SITES[g.site];
    var d = gridDims();
    var tier = s.tier;
    var wallH = tier === 1 ? 0.72 : tier === 2 ? 1.1 : 1.45;
    var widthK = tier === 1 ? 0.55 : tier === 2 ? 0.8 : 0.92;
    var halfW = (d.cols * d.gapX) / 2 * widthK, halfL = tier === 1 ? 0.42 : 0.52;
    if (tier === 2) halfW = Math.min(halfW, 2.3);
    if (tier === 3) halfW = Math.min(halfW, 2.65);
    var wallCol = tier === 3 ? '#e4e9f2' : tier === 2 ? '#b98a63' : '#aab3ad';

    // position in screen space: centred near the lot's top corner and always
    // fully in frame, whatever shape the lot is
    var span = halfW * TILE + halfL * TILE + 8;
    var c = {
      x: Math.max(span + 6, Math.min(W - span - 6, ORX + TILE * 0.2)),
      y: ORY - TILE * 0.55
    };

    // ground shadow (sun upper-left)
    ctx.fillStyle = 'rgba(8,12,22,0.22)';
    ctx.beginPath();
    ctx.ellipse(c.x + TILE * 0.5, c.y + TILE * 0.35, halfW * TILE * 1.18, TILE * 0.55, 0, 0, 6.283);
    ctx.fill();

    var box = isoBoxAt(c.x, c.y, halfW, halfL, wallH, sh(wallCol, 22), sh(wallCol, -8), sh(wallCol, -34));

    // roof slab
    ctx.fillStyle = tier === 3 ? '#33415c' : tier === 2 ? '#6b4f39' : '#7d8680';
    poly(ctx, [box.tA, box.tB, box.tC, box.tD]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    poly(ctx, [box.tA, box.tB, box.pt(halfW * 0.86, -halfL, wallH), box.pt(-halfW * 0.86, -halfL, wallH)]); ctx.fill();

    // FRONT face details (the -y left face in this projection is box left: tD..tC..bC..bD)
    var fTL = box.tD, fTR = box.tC, fBL = box.bD, fBR = box.bC;
    var fw = fTR.x - fTL.x;

    if (tier === 3) {
      // showroom: glass front with mullions + warm interior glow
      var gx0 = fTL.x + fw * 0.06, gx1 = fTL.x + fw * 0.94;
      var gy0 = fTL.y + (fBL.y - fTL.y) * 0.22, gy1 = fBL.y - 3;
      var skew = (fTR.y - fTL.y) / fw;   // vertical shift per px
      function fy(x, base) { return base + (x - fTL.x) * skew; }
      var glass = ctx.createLinearGradient(0, gy0, 0, gy1);
      glass.addColorStop(0, 'rgba(150,200,250,0.85)');
      glass.addColorStop(0.65, 'rgba(90,140,200,0.8)');
      glass.addColorStop(1, 'rgba(255,214,140,0.75)');
      ctx.fillStyle = glass;
      poly(ctx, [{ x: gx0, y: fy(gx0, gy0) }, { x: gx1, y: fy(gx1, gy0) }, { x: gx1, y: fy(gx1, gy1) }, { x: gx0, y: fy(gx0, gy1) }]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,240,255,0.75)'; ctx.lineWidth = 1.4;
      for (var m = 0; m <= 5; m++) {
        var mx = gx0 + (gx1 - gx0) * m / 5;
        ctx.beginPath(); ctx.moveTo(mx, fy(mx, gy0)); ctx.lineTo(mx, fy(mx, gy1)); ctx.stroke();
      }
      // a car silhouette inside
      ctx.fillStyle = 'rgba(30,45,70,0.55)';
      var sx = (gx0 + gx1) / 2, sy = fy(sx, gy1) - TILE * 0.3;
      rr(ctx, sx - TILE * 0.55, sy - TILE * 0.2, TILE * 1.1, TILE * 0.22, TILE * 0.1); ctx.fill();
      rr(ctx, sx - TILE * 0.3, sy - TILE * 0.34, TILE * 0.55, TILE * 0.18, TILE * 0.09); ctx.fill();
    } else if (tier === 2) {
      // converted unit: roller door + person door + window strip
      var rx0 = fTL.x + fw * 0.12, rx1 = fTL.x + fw * 0.52;
      var skew2 = (fTR.y - fTL.y) / fw;
      function fy2(x, base) { return base + (x - fTL.x) * skew2; }
      var ry0 = fTL.y + (fBL.y - fTL.y) * 0.3, ry1 = fBL.y - 2;
      ctx.fillStyle = '#77828f';
      poly(ctx, [{ x: rx0, y: fy2(rx0, ry0) }, { x: rx1, y: fy2(rx1, ry0) }, { x: rx1, y: fy2(rx1, ry1) }, { x: rx0, y: fy2(rx0, ry1) }]); ctx.fill();
      ctx.strokeStyle = 'rgba(30,36,44,0.5)'; ctx.lineWidth = 1;
      for (var sl = 1; sl < 5; sl++) {
        var ly = ry0 + (ry1 - ry0) * sl / 5;
        ctx.beginPath(); ctx.moveTo(rx0, fy2(rx0, ly)); ctx.lineTo(rx1, fy2(rx1, ly)); ctx.stroke();
      }
      // person door + windows
      var px0 = fTL.x + fw * 0.62;
      ctx.fillStyle = '#3a4556';
      poly(ctx, [{ x: px0, y: fy2(px0, ry0 + 6) }, { x: px0 + fw * 0.1, y: fy2(px0 + fw * 0.1, ry0 + 6) }, { x: px0 + fw * 0.1, y: fy2(px0 + fw * 0.1, ry1) }, { x: px0, y: fy2(px0, ry1) }]); ctx.fill();
      ctx.fillStyle = 'rgba(255,220,150,0.8)';
      var wx0 = fTL.x + fw * 0.78, wx1 = fTL.x + fw * 0.94;
      var wy0 = fTL.y + (fBL.y - fTL.y) * 0.34, wy1 = fTL.y + (fBL.y - fTL.y) * 0.52;
      poly(ctx, [{ x: wx0, y: fy2(wx0, wy0) }, { x: wx1, y: fy2(wx1, wy0) }, { x: wx1, y: fy2(wx1, wy1) }, { x: wx0, y: fy2(wx0, wy1) }]); ctx.fill();
    } else {
      // portacabin: door, two glowing windows, steps
      var skew3 = (fTR.y - fTL.y) / fw;
      function fy3(x, base) { return base + (x - fTL.x) * skew3; }
      var dy0 = fTL.y + (fBL.y - fTL.y) * 0.3, dy1 = fBL.y - 2;
      var dx0 = fTL.x + fw * 0.42, dx1 = fTL.x + fw * 0.58;
      ctx.fillStyle = '#f2f5f7';
      poly(ctx, [{ x: dx0, y: fy3(dx0, dy0) }, { x: dx1, y: fy3(dx1, dy0) }, { x: dx1, y: fy3(dx1, dy1) }, { x: dx0, y: fy3(dx0, dy1) }]); ctx.fill();
      [[0.1, 0.34], [0.66, 0.9]].forEach(function (win) {
        var wx0 = fTL.x + fw * win[0], wx1 = fTL.x + fw * win[1];
        var wy0 = fTL.y + (fBL.y - fTL.y) * 0.32, wy1 = fTL.y + (fBL.y - fTL.y) * 0.62;
        ctx.fillStyle = 'rgba(255,220,150,0.85)';
        poly(ctx, [{ x: wx0, y: fy3(wx0, wy0) }, { x: wx1, y: fy3(wx1, wy0) }, { x: wx1, y: fy3(wx1, wy1) }, { x: wx0, y: fy3(wx0, wy1) }]); ctx.fill();
        ctx.strokeStyle = 'rgba(90,80,60,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo((wx0 + wx1) / 2, fy3((wx0 + wx1) / 2, wy0)); ctx.lineTo((wx0 + wx1) / 2, fy3((wx0 + wx1) / 2, wy1)); ctx.stroke();
      });
      // flag
      var fx = box.tB.x + TILE * 0.1, fyy = box.tB.y;
      ctx.strokeStyle = '#dfe5ec'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx, fyy); ctx.lineTo(fx, fyy - TILE * 1.1); ctx.stroke();
      var wav = Math.sin(performance.now() / 300) * TILE * 0.1;
      ctx.fillStyle = '#ff5d6c';
      ctx.beginPath();
      ctx.moveTo(fx, fyy - TILE * 1.1);
      ctx.quadraticCurveTo(fx + TILE * 0.3, fyy - TILE * 1.05 + wav, fx + TILE * 0.55, fyy - TILE * 0.95 + wav);
      ctx.lineTo(fx, fyy - TILE * 0.78);
      ctx.closePath(); ctx.fill();
    }

    // fascia sign — drawn as a top layer in draw() so trees never cover it
    var signW = Math.max(halfW * TILE * 1.1, TILE * 3.2), signH = TILE * 0.62;
    signSpec = {
      x: c.x - signW / 2, y: box.tA.y + (box.tC.y - box.tA.y) * 0.18 - signH / 2,
      w: signW, h: signH, cx: c.x, text: g.brand.toUpperCase()
    };
  }

  var signSpec = null;
  function drawSign() {
    if (!signSpec) return;
    var s = signSpec;
    ctx.fillStyle = 'rgba(8,12,22,0.35)';
    rr(ctx, s.x + 2, s.y + 3, s.w, s.h, 6); ctx.fill();
    var signGrad = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    signGrad.addColorStop(0, '#2c3a5e'); signGrad.addColorStop(1, '#1b2542');
    ctx.fillStyle = signGrad;
    rr(ctx, s.x, s.y, s.w, s.h, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,206,74,0.65)'; ctx.lineWidth = 1.3;
    rr(ctx, s.x, s.y, s.w, s.h, 6); ctx.stroke();
    ctx.fillStyle = '#ffd24a';
    ctx.font = '900 ' + Math.round(s.h * 0.58) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.text, s.cx, s.y + s.h / 2 + 0.5);
  }

  /* ---------- props ---------- */
  function drawProp(p) {
    var pt = iso(p.wx, p.wy, 0);
    var s = p.s * TILE;
    if (p.kind === 'tree') {
      ctx.fillStyle = 'rgba(8,12,22,0.25)';
      ctx.beginPath(); ctx.ellipse(pt.x + s * 0.16, pt.y + s * 0.1, s * 0.52, s * 0.2, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#6b4a32';
      ctx.fillRect(pt.x - s * 0.06, pt.y - s * 0.5, s * 0.12, s * 0.55);
      ctx.fillStyle = '#3e7a3d';
      ctx.beginPath(); ctx.arc(pt.x, pt.y - s * 0.85, s * 0.46, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(pt.x - s * 0.3, pt.y - s * 0.62, s * 0.32, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(pt.x + s * 0.3, pt.y - s * 0.62, s * 0.32, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#5da456';
      ctx.beginPath(); ctx.arc(pt.x - s * 0.14, pt.y - s * 0.95, s * 0.3, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,230,0.25)';
      ctx.beginPath(); ctx.arc(pt.x - s * 0.24, pt.y - s * 1.02, s * 0.14, 0, 6.283); ctx.fill();
    } else if (p.kind === 'bush') {
      ctx.fillStyle = 'rgba(8,12,22,0.2)';
      ctx.beginPath(); ctx.ellipse(pt.x + s * 0.1, pt.y + s * 0.06, s * 0.4, s * 0.15, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#41793f';
      ctx.beginPath(); ctx.arc(pt.x - s * 0.16, pt.y - s * 0.16, s * 0.26, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(pt.x + s * 0.16, pt.y - s * 0.18, s * 0.3, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#5da456';
      ctx.beginPath(); ctx.arc(pt.x, pt.y - s * 0.3, s * 0.22, 0, 6.283); ctx.fill();
    } else if (p.kind === 'tub') {
      ctx.fillStyle = '#8a5a3c';
      rr(ctx, pt.x - s * 0.22, pt.y - s * 0.24, s * 0.44, s * 0.26, s * 0.05); ctx.fill();
      ctx.fillStyle = '#e0637a';
      ctx.beginPath(); ctx.arc(pt.x - s * 0.1, pt.y - s * 0.3, s * 0.09, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(pt.x + s * 0.08, pt.y - s * 0.34, s * 0.09, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#e08ae0';
      ctx.beginPath(); ctx.arc(pt.x, pt.y - s * 0.24, s * 0.08, 0, 6.283); ctx.fill();
    }
  }

  /* ---------- figures (chibi) ---------- */
  function drawFigure(f) {
    var p = iso(f.wx, f.wy, 0);
    var walking = f.pause <= 0;
    var t = performance.now() / 150 + f.phase;
    var bob = walking ? Math.sin(t) * TILE * 0.045 : 0;
    var legSwing = walking ? Math.sin(t * 2) * TILE * 0.06 : 0;

    ctx.fillStyle = 'rgba(8,12,22,0.28)';
    ctx.beginPath(); ctx.ellipse(p.x + TILE * 0.04, p.y + TILE * 0.04, TILE * 0.17, TILE * 0.08, 0, 0, 6.283); ctx.fill();

    // legs
    ctx.fillStyle = '#2c3442';
    rr(ctx, p.x - TILE * 0.09 + legSwing, p.y - TILE * 0.18, TILE * 0.075, TILE * 0.2, TILE * 0.03); ctx.fill();
    rr(ctx, p.x + TILE * 0.015 - legSwing, p.y - TILE * 0.18, TILE * 0.075, TILE * 0.2, TILE * 0.03); ctx.fill();

    // body
    var bodyGrad = ctx.createLinearGradient(p.x - TILE * 0.14, 0, p.x + TILE * 0.14, 0);
    bodyGrad.addColorStop(0, sh(f.colour.length === 7 ? f.colour : '#888888', 18));
    bodyGrad.addColorStop(1, sh(f.colour.length === 7 ? f.colour : '#888888', -16));
    ctx.fillStyle = bodyGrad;
    rr(ctx, p.x - TILE * 0.13, p.y - TILE * 0.5 + bob, TILE * 0.26, TILE * 0.36, TILE * 0.1); ctx.fill();
    if (f.kind === 'staff') {                     // tie
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      rr(ctx, p.x - TILE * 0.02, p.y - TILE * 0.48 + bob, TILE * 0.04, TILE * 0.16, TILE * 0.02); ctx.fill();
    }

    // head
    ctx.fillStyle = '#f0c59c';
    ctx.beginPath(); ctx.arc(p.x, p.y - TILE * 0.6 + bob, TILE * 0.125, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#4a3728';                    // hair cap
    ctx.beginPath(); ctx.arc(p.x - TILE * 0.01, p.y - TILE * 0.64 + bob, TILE * 0.115, Math.PI * 0.95, Math.PI * 1.98); ctx.fill();

    // name pill
    if (f.kind === 'staff' && TILE > 19) {
      ctx.save();
      var fs = Math.max(8.5, TILE * 0.27);
      ctx.font = '700 ' + fs + 'px system-ui';
      var w = ctx.measureText(f.name).width + 10;
      var py = p.y - TILE * 1.0 + bob;
      ctx.fillStyle = 'rgba(10,14,26,0.68)';
      rr(ctx, p.x - w / 2, py - fs * 0.72, w, fs * 1.4, fs * 0.7); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p.x - 3, py + fs * 0.66); ctx.lineTo(p.x + 3, py + fs * 0.66); ctx.lineTo(p.x, py + fs * 0.98);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.name, p.x, py);
      ctx.restore();
    }
  }

  /* ---------- main draw ---------- */
  function draw() {
    var g = G(); if (!g || !ctx) return;
    ctx.clearRect(0, 0, W, H);

    drawSky();
    drawGround();
    drawBuilding();

    var bySlot = {};
    g.stock.forEach(function (c) { if (c.slot != null && (c.status === 'stock' || c.status === 'sold')) bySlot[c.slot] = c; });

    bays.forEach(function (b) { drawBay(b, !!bySlot[b.slot]); });

    var drawables = [];
    bays.forEach(function (b) {
      var car = bySlot[b.slot];
      if (car) drawables.push({ depth: b.wx + b.wy, kind: 'car', b: b, car: car });
    });
    figures.forEach(function (f) { drawables.push({ depth: f.wx + f.wy + 0.18, kind: 'fig', f: f }); });
    props.forEach(function (p) { drawables.push({ depth: p.wx + p.wy, kind: 'prop', p: p }); });
    // departments sit on the front-left grass, stacked down the edge as they're
    // built (service is the big workshop; smart repair and valet are lock-ups)
    if (g.dept) {
      var d = gridDims();
      var baseY = (d.rows - 1) * d.gapY * 0.66;
      if (g.dept.service) {
        var swx = -1.38, swy = baseY;
        var sp = iso(swx, swy);
        drawables.push({ depth: swx + swy, kind: 'servicedept', cx: sp.x, cy: sp.y, building: g.week < g.dept.service });
      }
      [{ id: 'smart' }, { id: 'valet' }].forEach(function (bay, i) {
        if (!g.dept[bay.id]) return;
        // stepped toward the viewer from the workshop: raising wx and wy by the
        // same amount keeps the screen column and just moves it down the frame
        var d = 1.15 + i * 1.15;
        var bwx = -1.38 + d, bwy = baseY + d;
        var bp = iso(bwx, bwy);
        drawables.push({ depth: bwx + bwy, kind: 'smallbay', cx: bp.x, cy: bp.y, id: bay.id, building: g.week < g.dept[bay.id] });
      });
    }
    drawables.sort(function (x, y) { return x.depth - y.depth; });

    drawables.forEach(function (dz) {
      if (dz.kind === 'car') drawCarAt(dz.b.cx, dz.b.cy, dz.car);
      else if (dz.kind === 'fig') drawFigure(dz.f);
      else if (dz.kind === 'servicedept') drawServiceDept(dz.cx, dz.cy, dz.building);
      else if (dz.kind === 'smallbay') drawSmallBay(dz.cx, dz.cy, dz.id, dz.building);
      else drawProp(dz.p);
    });

    // the fascia sign sits above everything (trees never cover the brand)
    drawSign();

    /* ---------- atmosphere ----------
       Driven by the month's mood rather than a winter/not-winter flag, so the
       light, the haze and the weather all move together through the year. */
    var m = mood(), wx = weather();

    // distance haze: the far rows wash toward the sky, which reads as depth
    var haze = ctx.createLinearGradient(0, 0, 0, H * 0.72);
    haze.addColorStop(0, shA(m.sky[1], 0, m.haze));
    haze.addColorStop(1, shA(m.sky[1], 0, 0));
    ctx.fillStyle = haze; ctx.fillRect(0, 0, W, H * 0.72);

    // key light from the upper left, coloured by the season
    var sun = ctx.createRadialGradient(W * 0.16, -H * 0.05, 0, W * 0.16, -H * 0.05, W * 1.0);
    sun.addColorStop(0, shA(m.sun, 0, 0.06 + m.str * 0.20));
    sun.addColorStop(0.55, shA(m.sun, 0, 0.02 + m.str * 0.05));
    sun.addColorStop(1, shA(m.sun, 0, 0));
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);

    // ambient fill from the opposite corner, tinted by the sky
    var fill = ctx.createRadialGradient(W * 0.92, H * 1.02, 0, W * 0.92, H * 1.02, W * 0.85);
    fill.addColorStop(0, shA(m.amb, 0, 0.18));
    fill.addColorStop(1, shA(m.amb, 0, 0));
    ctx.fillStyle = fill; ctx.fillRect(0, 0, W, H);

    // rain
    if (wx.wet) drawRain(wx.heavy);

    // bloom, weaker on a dull day
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    var bloom = ctx.createLinearGradient(0, 0, 0, H);
    bloom.addColorStop(0, shA(m.sun, 0, 0.05 + m.str * 0.07));
    bloom.addColorStop(0.6, shA(m.sun, 0, 0.02));
    bloom.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H);
    ctx.restore();

    var vig = ctx.createRadialGradient(W / 2, H * 0.45, W * 0.28, W / 2, H * 0.45, W * 0.88);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.7, 'rgba(5,8,18,0.14)');
    vig.addColorStop(1, 'rgba(4,6,14,0.44)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }

  /* Rain, drawn as short slanted streaks seeded per-frame. Cheap enough for a
     phone: no particle state, no allocation, just a seeded scatter. */
  var rainT = 0;
  function drawRain(heavy) {
    rainT = (rainT + 1) % 100000;
    var n = heavy ? 150 : 78;
    var r = lcg(1);
    ctx.save();
    ctx.strokeStyle = heavy ? 'rgba(198,222,246,0.42)' : 'rgba(198,222,246,0.28)';
    ctx.lineWidth = heavy ? 1.4 : 1;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var sx = r() * (W + 120) - 60;
      var speed = 9 + r() * 7;
      var sy = (r() * H + rainT * speed) % (H + 60) - 30;
      var len = heavy ? 16 + r() * 12 : 10 + r() * 8;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - len * 0.34, sy + len);
    }
    ctx.stroke();
    ctx.restore();
  }

  function loop() {
    var now = performance.now();
    var dt = Math.min(48, now - t0); t0 = now;
    stepFigures(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  /* ---------- canvas plumbing ---------- */
  function setCanvasSize(w, h) {
    W = w; H = h; dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pointInPoly(px, py, pp) {
    var inside = false, i, j;
    for (i = 0, j = pp.length - 1; i < pp.length; j = i++) {
      var xi = pp[i].x, yi = pp[i].y, xj = pp[j].x, yj = pp[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function onTap(ev) {
    var rect = cv.getBoundingClientRect();
    var px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    var py = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
    var hit = -1;
    bays.forEach(function (b) { if (pointInPoly(px, py, b.poly)) hit = b.slot; });
    // cars stand taller than their bay — accept a tap slightly above a bay too
    if (hit < 0) {
      bays.forEach(function (b) { if (pointInPoly(px, py + TILE * 0.55, b.poly)) hit = b.slot; });
    }
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
  function stamp() {
    var g = G(); if (!g) return '';
    var occ = g.stock.filter(function (c) { return c.status === 'stock' || c.status === 'sold'; }).length;
    return g.site + '|' + g.extraSlots + '|' + occ + '|' + g.staff.length + '|' + g.week + '|' + (moveMode ? 'm' : '');
  }
  Scene.resize = function () {
    if (!ctx || !cv) return;
    var container = cv.parentElement;
    if (!container) return;
    W = container.clientWidth || 360;
    layout();
  };
})();
