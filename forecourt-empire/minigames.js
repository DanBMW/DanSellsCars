/* Forecourt Empire — Portacabin mini-games.
   Optional puzzles for the downtime between weeks. Games:
     - Forecourt Shuffle  : "get the red car out" (Rush Hour style slide puzzle)
     - Forecourt Parking  : top-down driving, joystick + accelerator
     - Plate Scramble     : a sliding-tile (8-puzzle) number plate
     - Hit the Gross      : stop the needle on the number
   Clearing any level brings a late-night prospect through the door with a
   retailable part-exchange — a full deal for the player to manage (engine side:
   FE.spawnLateNightProspect / lateNightPX / lateNightClose). One a week. */
(function () {
  'use strict';
  var Puzzle = {};
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function money(n) { return '£' + Math.round(n).toLocaleString('en-GB'); }

  /* ---------------- the reward: a late-night prospect ---------------- */
  // Called from every win screen. Returns the HTML for the "someone's at the
  // door" prompt, or a note explaining why nobody came.
  function prospectLine() {
    if (!(window.FE && FE.prospectReady)) return '';
    var r = FE.prospectReady();
    if (r.already) return '<p class="kv pz-prospect done">🤝 The team already turned one up for you this week — one’s the limit.</p>';
    if (!r.ok) return r.msg ? '<p class="kv pz-prospect done">🤝 ' + esc(r.msg) + '</p>' : '';
    return '<div class="pz-prospect knock"><b>🚪 Someone’s at the door.</b> ' +
      'While you were playing, the team were out prospecting — and one of them has just walked a buyer in. ' +
      'They’ve got a car to part-exchange.' +
      '<button class="grn" style="margin-top:9px;width:100%" onclick="Puzzle.lateNight()">Go and meet them →</button></div>';
  }

  Puzzle.lateNight = function () {
    var d = FE.spawnLateNightProspect();
    if (!d) { UI.closeModal(); return; }
    if (d.already) { UI.closeModal(); return; }
    lnRender();
  };

  function riskChipHTML(r) {
    var lbl = r.light === 'green' ? 'Looks clean' : r.light === 'amber' ? 'Something to watch' :
      (r.flavour === 'gamble' ? 'High risk / high reward' : 'High risk — bad car');
    return '<span class="risk-chip ' + r.light + '">● ' + lbl + '</span>';
  }

  function lnRender() {
    var st = FE.lateNightState();
    if (!st) { UI.closeModal(); return; }
    var L = st.deal, c = st.car, px = L.px;
    if (L.stage === 'px') {
      var pxGross = L.pxRetail - L.pxGuide;
      UI.modal(
        '<div class="ln-head"><span class="ln-time">🌙 After hours</span>' +
        '<h3>' + esc(L.buyer) + ' — brought in by ' + esc(st.execName) + '</h3></div>' +
        '<p class="kv">They want the <b>' + esc(FE.carName(c)) + '</b> and they’ll pay <b>' + money(L.offer) + '</b> ' +
        '<span class="muted">(screen ' + money(c.screen) + ')</span>. There’s a car to take in.</p>' +
        '<div class="card ln-px"><div class="row"><b>Their part-exchange</b>' + riskChipHTML(L.pxRisk) + '</div>' +
        '<div class="kv"><b>' + esc(FE.carName(px)) + '</b></div>' +
        '<div class="kv muted small">' + esc(FE.carDesc(px)) + '</div>' +
        '<div class="row kv"><span>You could retail it at</span><b>' + money(L.pxRetail) + '</b></div>' +
        '<div class="row kv"><span>Book says it’s worth</span><b>' + money(L.pxGuide) + '</b></div>' +
        '<div class="row kv"><span>Gross in it at book</span><b class="' + (pxGross > 1200 ? 'good' : '') + '">' + money(pxGross) + '</b></div>' +
        '<div class="row kv"><span>Est. days to sell</span><b>' + L.pxDays[0] + '–' + L.pxDays[1] + '</b></div>' +
        '<div class="kv muted small">Prep hasn’t been costed yet — that bill lands once it’s yours.</div></div>' +
        '<p class="kv muted small">What are you allowing them for it?</p>' +
        '<div class="btnrow" style="flex-direction:column">' +
        '<button class="sec" onclick="Puzzle.lnPX(\'low\')">Under it — ' + money(Math.round(L.pxGuide * 0.88 / 25) * 25) + ' <span class="small">(best gross, they may walk)</span></button>' +
        '<button onclick="Puzzle.lnPX(\'fair\')">Book money — ' + money(L.pxGuide) + ' <span class="small">(fair, usually sticks)</span></button>' +
        '<button class="sec" onclick="Puzzle.lnPX(\'high\')">Over it — ' + money(Math.round(L.pxGuide * 1.10 / 25) * 25) + ' <span class="small">(deal’s certain, gross bleeds)</span></button>' +
        '</div>' +
        '<button class="ghost" style="margin-top:8px" onclick="Puzzle.lnWalk()">Not tonight — send them away</button>', true);
      return;
    }
    // stage: close — PX agreed, now the paperwork
    var r = L.pxResult;
    UI.modal(
      '<div class="ln-head"><span class="ln-time">🌙 After hours</span><h3>Deal on the table</h3></div>' +
      '<p class="kv">' + esc(L.buyer) + ' takes the <b>' + esc(FE.carName(c)) + '</b> at <b>' + money(L.offer) + '</b>' +
      (r.pxTaken ? ', and you’ve allowed <b>' + money(r.paid) + '</b> for the ' + esc(FE.carName(px)) + '. It’s on the pitch — prep bill to follow.' : '.') + '</p>' +
      '<p class="kv muted small">' + esc(st.execName) + ' will do the paperwork. How hard on the add-ons?</p>' +
      '<div class="btnrow" style="flex-direction:column">' +
      '<button class="sec" onclick="Puzzle.lnClose(\'soft\')">Soft — just get it signed</button>' +
      '<button onclick="Puzzle.lnClose(null)">Normal</button>' +
      '<button class="sec" onclick="Puzzle.lnClose(\'push\')">Push it <span class="small">(more back-end, more comeback risk)</span></button>' +
      '</div>', true);
  }

  Puzzle.lnPX = function (choice) {
    var r = FE.lateNightPX(choice);
    if (!r) { UI.closeModal(); return; }
    if (!r.dealOn) {
      UI.modal('<div class="pz-win"><div class="pz-win-badge">🚶</div><h3>They walked</h3>' +
        '<p class="kv">Wouldn’t wear it for their car, and off they went into the night. That’s the risk of going in under book.</p>' +
        '<div class="pz-btns"><button class="ghost" onclick="Puzzle.hub()">← Desk</button>' +
        '<button class="sec" onclick="UI.closeModal();UI.renderAll()">Back to the forecourt</button></div></div>', true);
      UI.renderAll();
      return;
    }
    lnRender();
  };
  Puzzle.lnClose = function (fni) {
    var res = FE.lateNightClose(fni);
    if (!res) { UI.closeModal(); return; }
    UI.modal('<div class="pz-win"><div class="pz-win-badge">🤝</div><h3>Signed, after hours</h3>' +
      '<p class="kv">' + esc(res.exec === 'you' ? 'You' : res.exec) + ' sold the <b>' + esc(FE.carName(res.car)) + '</b> for <b>' + money(res.price) + '</b>.</p>' +
      '<div class="card"><div class="row kv"><span>Front gross</span><b class="' + (res.front >= 0 ? 'good' : 'danger') + '">' + money(res.front) + '</b></div>' +
      '<div class="row kv"><span>Back end</span><b>' + money(res.back) + '</b></div>' +
      '<div class="row kv"><span>Total gross</span><b class="good">' + money(res.gross) + '</b></div>' +
      (res.pxCar ? '<div class="row kv"><span>Taken in</span><b>' + esc(FE.carName(res.pxCar)) + ' @ ' + money(res.pxPaid) + '</b></div>' : '') +
      '</div>' +
      (res.pxCar ? '<p class="kv muted small">The part-exchange is on your pitch and needs prepping before it retails.</p>' : '') +
      '<p class="kv pz-prospect done">Consider that last-minute prospecting. It’s on this week’s numbers.</p>' +
      '<div class="pz-btns"><button class="sec" onclick="Puzzle.hub()">← Desk</button>' +
      '<button onclick="UI.closeModal();UI.renderAll()">Back to the forecourt</button></div></div>', true);
    UI.renderAll();
  };
  Puzzle.lnWalk = function () {
    FE.lateNightWalk();
    UI.closeModal(); UI.renderAll();
  };

  /* ---------------- Forecourt Shuffle (Rush Hour) ---------------- */
  // grid 6x6, exit on row y=2 (right edge). car: {id,x,y,len,dir:'h'|'v',red?}
  Puzzle.LEVELS = [
    [{ id: 'R', x: 1, y: 2, len: 2, dir: 'h', red: 1 }, { id: 'A', x: 3, y: 2, len: 3, dir: 'v' }], // 2
    [{ id: 'R', x: 0, y: 2, len: 2, dir: 'h', red: 1 }, { id: 'A', x: 2, y: 0, len: 2, dir: 'v' }, { id: 'B', x: 2, y: 2, len: 2, dir: 'v' }, { id: 'C', x: 4, y: 2, len: 3, dir: 'v' }], // 3
    [{ id: 'R', x: 0, y: 2, len: 2, dir: 'h', red: 1 }, { id: 'A', x: 2, y: 2, len: 2, dir: 'v' }, { id: 'B', x: 3, y: 0, len: 2, dir: 'h' }, { id: 'C', x: 3, y: 1, len: 3, dir: 'v' }, { id: 'D', x: 4, y: 2, len: 2, dir: 'v' }, { id: 'E', x: 0, y: 4, len: 2, dir: 'h' }], // 4
    [{ id: 'R', x: 0, y: 2, len: 2, dir: 'h', red: 1 }, { id: 'A', x: 2, y: 0, len: 3, dir: 'v' }, { id: 'B', x: 3, y: 1, len: 2, dir: 'h' }, { id: 'C', x: 3, y: 2, len: 2, dir: 'v' }, { id: 'D', x: 5, y: 2, len: 3, dir: 'v' }, { id: 'E', x: 0, y: 3, len: 2, dir: 'h' }, { id: 'F', x: 2, y: 4, len: 2, dir: 'h' }], // 5
    [{ id: 'R', x: 1, y: 2, len: 2, dir: 'h', red: 1 }, { id: 'A', x: 4, y: 0, len: 3, dir: 'v' }, { id: 'B', x: 0, y: 0, len: 3, dir: 'v' }, { id: 'C', x: 2, y: 4, len: 2, dir: 'h' }, { id: 'D', x: 3, y: 5, len: 2, dir: 'h' }, { id: 'E', x: 0, y: 3, len: 3, dir: 'v' }, { id: 'F', x: 1, y: 0, len: 3, dir: 'h' }, { id: 'G', x: 1, y: 3, len: 2, dir: 'h' }, { id: 'H', x: 5, y: 1, len: 2, dir: 'v' }, { id: 'I', x: 2, y: 1, len: 2, dir: 'h' }, { id: 'J', x: 3, y: 2, len: 2, dir: 'v' }], // 6
    [{ id: 'R', x: 2, y: 2, len: 2, dir: 'h', red: 1 }, { id: 'A', x: 4, y: 2, len: 2, dir: 'v' }, { id: 'B', x: 4, y: 4, len: 2, dir: 'h' }, { id: 'C', x: 0, y: 0, len: 3, dir: 'v' }, { id: 'D', x: 0, y: 4, len: 2, dir: 'v' }, { id: 'E', x: 1, y: 2, len: 3, dir: 'v' }, { id: 'F', x: 5, y: 2, len: 2, dir: 'v' }, { id: 'G', x: 3, y: 1, len: 2, dir: 'h' }, { id: 'H', x: 3, y: 4, len: 2, dir: 'v' }, { id: 'I', x: 4, y: 0, len: 2, dir: 'h' }, { id: 'J', x: 2, y: 3, len: 3, dir: 'v' }, { id: 'K', x: 1, y: 0, len: 2, dir: 'v' }, { id: 'L', x: 2, y: 0, len: 2, dir: 'h' }], // 9
    [{ id: 'R', x: 1, y: 2, len: 2, dir: 'h', red: 1 }, { id: 'A', x: 2, y: 3, len: 3, dir: 'v' }, { id: 'B', x: 5, y: 1, len: 3, dir: 'v' }, { id: 'C', x: 3, y: 0, len: 2, dir: 'h' }, { id: 'D', x: 3, y: 2, len: 3, dir: 'v' }, { id: 'E', x: 4, y: 3, len: 2, dir: 'v' }, { id: 'F', x: 1, y: 1, len: 3, dir: 'h' }, { id: 'G', x: 0, y: 3, len: 2, dir: 'v' }, { id: 'H', x: 4, y: 5, len: 2, dir: 'h' }, { id: 'I', x: 0, y: 0, len: 2, dir: 'h' }, { id: 'J', x: 1, y: 4, len: 2, dir: 'v' }, { id: 'K', x: 0, y: 1, len: 2, dir: 'v' }], // 10
    [{ id: 'R', x: 0, y: 2, len: 2, dir: 'h', red: 1 }, { id: 'A', x: 4, y: 0, len: 2, dir: 'v' }, { id: 'B', x: 1, y: 4, len: 2, dir: 'v' }, { id: 'C', x: 4, y: 4, len: 2, dir: 'v' }, { id: 'D', x: 2, y: 4, len: 2, dir: 'h' }, { id: 'E', x: 3, y: 2, len: 2, dir: 'v' }, { id: 'F', x: 0, y: 0, len: 2, dir: 'v' }, { id: 'G', x: 2, y: 5, len: 2, dir: 'h' }, { id: 'H', x: 2, y: 0, len: 3, dir: 'v' }] // 13
  ];
  var CAR_TINT = { A: '#3d8bff', B: '#2fd6c0', C: '#ffb63d', D: '#9b6cff', E: '#35d07f', F: '#ff9e40', G: '#5f6dff', H: '#e879c0', I: '#4bd0e0', J: '#c0a24a', K: '#7fb04a', L: '#d06a6a' };

  var RH = { lvl: 0, cars: [], moves: 0 };

  function occGrid(cars, exceptId) {
    var g = []; for (var y = 0; y < 6; y++) { g[y] = []; for (var x = 0; x < 6; x++) g[y][x] = null; }
    cars.forEach(function (c) {
      if (c.id === exceptId) return;
      for (var i = 0; i < c.len; i++) { var px = c.dir === 'h' ? c.x + i : c.x, py = c.dir === 'h' ? c.y : c.y + i; g[py][px] = c.id; }
    });
    return g;
  }
  function rangeFor(cars, c) {
    var g = occGrid(cars, c.id);
    if (c.dir === 'h') {
      var a = c.x; while (a - 1 >= 0 && !g[c.y][a - 1]) a--;
      var b = c.x; while (b + c.len <= 5 && !g[c.y][b + c.len]) b++;
      return [a, b];
    }
    var a2 = c.y; while (a2 - 1 >= 0 && !g[a2 - 1][c.x]) a2--;
    var b2 = c.y; while (b2 + c.len <= 5 && !g[b2 + c.len][c.x]) b2++;
    return [a2, b2];
  }
  function rhSolved() { var r = RH.cars[0]; return r.x + r.len === 6; }
  function rhBestKey(l) { return 'feShuffleBest_' + l; }

  function rhLoad(l) {
    RH.lvl = l; RH.moves = 0;
    RH.cars = Puzzle.LEVELS[l].map(function (c) { return Object.assign({}, c); });
    rhRender();
  }

  Puzzle.openShuffle = function (lvl) {
    var l = lvl == null ? (RH.lvl || 0) : lvl;
    var chips = Puzzle.LEVELS.map(function (_, i) {
      var solved = localStorage.getItem(rhBestKey(i));
      return '<button class="pz-chip' + (i === l ? ' on' : '') + (solved ? ' done' : '') + '" onclick="Puzzle.openShuffle(' + i + ')">' + (i + 1) + (solved ? '✓' : '') + '</button>';
    }).join('');
    var html =
      '<div class="pz-wrap">' +
      '<div class="pz-title"><b>🚗 Forecourt Shuffle</b><span>Slide the cars — get the <b class="pz-red">red one</b> out the right.</span></div>' +
      '<div class="pz-chips">' + chips + '</div>' +
      '<div class="pz-board" id="pzBoard"><div class="pz-exit" title="exit">▸</div></div>' +
      '<div class="pz-foot"><span id="pzMoves">Moves: 0</span><span id="pzBest"></span></div>' +
      '<div class="pz-btns">' +
      '<button class="sec" onclick="Puzzle.rhReset()">↺ Reset</button>' +
      '<button class="ghost" onclick="Puzzle.hub()">← Desk</button>' +
      '</div></div>';
    UI.modal(html, true);
    rhLoad(l);
  };
  Puzzle.rhReset = function () { rhLoad(RH.lvl); };

  function rhRender() {
    var board = $('pzBoard'); if (!board) return;
    // keep the exit marker, replace cars
    board.querySelectorAll('.pz-car').forEach(function (e) { e.remove(); });
    var cell = 100 / 6;
    RH.cars.forEach(function (c) {
      var el = document.createElement('div');
      var w = c.dir === 'h' ? c.len : 1, h = c.dir === 'h' ? 1 : c.len;
      el.className = 'pz-car ' + (c.red ? 'red' : '') + ' ' + c.dir + (c.len === 3 ? ' long' : '');
      el.style.left = (c.x * cell) + '%'; el.style.top = (c.y * cell) + '%';
      el.style.width = (w * cell) + '%'; el.style.height = (h * cell) + '%';
      if (!c.red && CAR_TINT[c.id]) el.style.setProperty('--tint', CAR_TINT[c.id]);
      el.dataset.id = c.id;
      el.innerHTML = '<span class="pz-glass"></span>';
      rhBindDrag(el, c);
      board.appendChild(el);
    });
    var mv = $('pzMoves'); if (mv) mv.textContent = 'Moves: ' + RH.moves;
    var best = localStorage.getItem(rhBestKey(RH.lvl));
    var b = $('pzBest'); if (b) b.textContent = best ? 'Best: ' + best : '';
  }

  function rhBindDrag(el, car) {
    var drag = null;
    el.addEventListener('pointerdown', function (e) {
      if (rhSolved()) return;
      var board = $('pzBoard'); var rect = board.getBoundingClientRect();
      var cellPx = rect.width / 6;
      var rg = rangeFor(RH.cars, car);
      var cur = car.dir === 'h' ? car.x : car.y;
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cellPx: cellPx, cur: cur, min: rg[0], max: rg[1], moved: 0 };
      el.setPointerCapture(e.pointerId);
      el.classList.add('grab');
      e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var raw = car.dir === 'h' ? (e.clientX - drag.sx) : (e.clientY - drag.sy);
      var lo = (drag.min - drag.cur) * drag.cellPx, hi = (drag.max - drag.cur) * drag.cellPx;
      var d = Math.max(lo, Math.min(hi, raw));
      drag.moved = d;
      el.style.transform = car.dir === 'h' ? 'translateX(' + d + 'px)' : 'translateY(' + d + 'px)';
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var steps = Math.round(drag.moved / drag.cellPx);
      var np = Math.max(drag.min, Math.min(drag.max, drag.cur + steps));
      el.style.transform = '';
      if (np !== drag.cur) {
        if (car.dir === 'h') car.x = np; else car.y = np;
        RH.moves++;
        var cell = 100 / 6;
        el.style.left = (car.x * cell) + '%'; el.style.top = (car.y * cell) + '%';
        var mv = $('pzMoves'); if (mv) mv.textContent = 'Moves: ' + RH.moves;
        if (rhSolved()) rhWin(el);
      }
      el.classList.remove('grab');
      drag = null;
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function rhWin(redEl) {
    // drive the red car off the right, then celebrate
    redEl.style.transition = 'transform .5s cubic-bezier(.5,0,.6,1)';
    redEl.style.transform = 'translateX(140%)';
    var best = localStorage.getItem(rhBestKey(RH.lvl));
    var isBest = !best || RH.moves < +best;
    if (isBest) localStorage.setItem(rhBestKey(RH.lvl), RH.moves);
    setTimeout(function () {
      var last = RH.lvl >= Puzzle.LEVELS.length - 1;
      UI.modal(
        '<div class="pz-win"><div class="pz-win-badge">🏁</div>' +
        '<h3>Out clean!</h3>' +
        '<p class="kv">Level ' + (RH.lvl + 1) + ' solved in <b>' + RH.moves + '</b> move' + (RH.moves === 1 ? '' : 's') + '.' +
        (isBest ? ' <span class="pz-pb">New best!</span>' : ' <span class="muted small">Best: ' + localStorage.getItem(rhBestKey(RH.lvl)) + '</span>') + '</p>' +
        prospectLine() +
        '<div class="pz-btns">' +
        (last ? '' : '<button onclick="Puzzle.openShuffle(' + (RH.lvl + 1) + ')">Next puzzle →</button>') +
        '<button class="sec" onclick="Puzzle.openShuffle(' + RH.lvl + ')">Replay</button>' +
        '<button class="ghost" onclick="Puzzle.hub()">← Desk</button>' +
        '</div>' + (last ? '<p class="kv muted small" style="margin-top:8px">That’s the lot — you’ve cleared every board. Show-off.</p>' : '') + '</div>', true);
    }, 560);
  }

  /* ---------------- Plate Scramble (8-puzzle) ---------------- */
  var PS = { tiles: [], gap: 8, moves: 0, plate: 'DANSELLS', t0: 0, timer: null };
  function psBestKey() { return 'fePlateBest'; }
  function psSolved() { for (var i = 0; i < 8; i++) if (PS.tiles[i] !== i) return false; return true; }
  function psNeighbours(g) {
    var r = Math.floor(g / 3), c = g % 3, out = [];
    if (r > 0) out.push(g - 3); if (r < 2) out.push(g + 3);
    if (c > 0) out.push(g - 1); if (c < 2) out.push(g + 1);
    return out;
  }
  function psScramble() {
    PS.tiles = [0, 1, 2, 3, 4, 5, 6, 7, -1]; PS.gap = 8;
    var last = -1;
    for (var i = 0; i < 120; i++) {
      var nb = psNeighbours(PS.gap).filter(function (n) { return n !== last; });
      var pick = nb[Math.floor(Math.random() * nb.length)];
      PS.tiles[PS.gap] = PS.tiles[pick]; PS.tiles[pick] = -1; last = PS.gap; PS.gap = pick;
    }
    PS.moves = 0;
  }
  Puzzle.openPlate = function () {
    psScramble();
    var html =
      '<div class="pz-wrap">' +
      '<div class="pz-title"><b>🔡 Plate Scramble</b><span>Slide the tiles to spell the plate. Tap a tile next to the gap.</span></div>' +
      '<div class="ps-target">Target: <b>' + PS.plate.slice(0, 4) + ' ' + PS.plate.slice(4) + '</b></div>' +
      '<div class="ps-board" id="psBoard"></div>' +
      '<div class="pz-foot"><span id="psMoves">Moves: 0</span><span id="psBest"></span></div>' +
      '<div class="pz-btns">' +
      '<button class="sec" onclick="Puzzle.openPlate()">↺ New scramble</button>' +
      '<button class="ghost" onclick="Puzzle.hub()">← Desk</button>' +
      '</div></div>';
    UI.modal(html, true);
    psRender();
  };
  function psRender() {
    var board = $('psBoard'); if (!board) return;
    var h = '';
    for (var i = 0; i < 9; i++) {
      var v = PS.tiles[i];
      if (v === -1) { h += '<div class="ps-tile gap"></div>'; continue; }
      var movable = psNeighbours(PS.gap).indexOf(i) >= 0;
      h += '<div class="ps-tile' + (movable ? ' movable' : '') + (PS.tiles[i] === i ? ' home' : '') + '" onclick="Puzzle.psTap(' + i + ')">' + esc(PS.plate[v]) + '</div>';
    }
    board.innerHTML = h;
    var mv = $('psMoves'); if (mv) mv.textContent = 'Moves: ' + PS.moves;
    var best = localStorage.getItem(psBestKey());
    var b = $('psBest'); if (b) b.textContent = best ? 'Best: ' + best : '';
  }
  Puzzle.psTap = function (i) {
    if (psNeighbours(PS.gap).indexOf(i) < 0) return;
    PS.tiles[PS.gap] = PS.tiles[i]; PS.tiles[i] = -1; PS.gap = i; PS.moves++;
    psRender();
    if (psSolved()) {
      var best = localStorage.getItem(psBestKey());
      var isBest = !best || PS.moves < +best;
      if (isBest) localStorage.setItem(psBestKey(), PS.moves);
      setTimeout(function () {
        UI.modal('<div class="pz-win"><div class="pz-win-badge">🎉</div><h3>Plate’s straight!</h3>' +
          '<p class="kv">Unscrambled <b>' + PS.plate.slice(0, 4) + ' ' + PS.plate.slice(4) + '</b> in <b>' + PS.moves + '</b> moves.' +
          (isBest ? ' <span class="pz-pb">New best!</span>' : ' <span class="muted small">Best: ' + best + '</span>') + '</p>' +
          prospectLine() +
          '<div class="pz-btns"><button onclick="Puzzle.openPlate()">Again</button><button class="ghost" onclick="Puzzle.hub()">← Desk</button></div></div>', true);
      }, 260);
    }
  };

  /* ---------------- Forecourt Parking (top-down driving) ---------------- */
  // Arena in logical units (W x H); canvas scales to fit. Drive the car into the
  // green bay — aligned and stopped — without clipping cones, cars or the edges.
  var PK_W = 100, PK_H = 68;
  var PK_LEVELS = [
    { name: 'Straight in',
      car: { x: 15, y: 34, a: 0 }, bay: { x: 82, y: 34, w: 22, h: 13, a: 0 },
      obs: [{ t: 'cone', x: 48, y: 20, r: 2.4 }, { t: 'cone', x: 48, y: 48, r: 2.4 }] },
    { name: 'Between the motors',
      car: { x: 14, y: 15, a: 0 }, bay: { x: 60, y: 46, w: 14, h: 22, a: 0 },
      obs: [{ t: 'car', x: 60, y: 20, w: 12, h: 20 }, { t: 'car', x: 42, y: 50, w: 12, h: 20 }, { t: 'car', x: 78, y: 50, w: 12, h: 20 }, { t: 'cone', x: 30, y: 33, r: 2.2 }] },
    { name: 'Reverse into the corner',
      car: { x: 20, y: 52, a: 0 }, bay: { x: 84, y: 14, w: 15, h: 21, a: 0 },
      obs: [{ t: 'car', x: 84, y: 40, w: 13, h: 18 }, { t: 'cone', x: 55, y: 22, r: 2.2 }, { t: 'cone', x: 62, y: 30, r: 2.2 }, { t: 'cone', x: 48, y: 40, r: 2.2 }, { t: 'car', x: 60, y: 56, w: 16, h: 14 }] }
  ];
  var PK = null; // active game state

  function pkBestKey(l) { return 'feParkBest_' + l; }
  function pkCorners(cx, cy, hl, hw, ang) {
    var c = Math.cos(ang), s = Math.sin(ang), o = [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]];
    return o.map(function (p) { return { x: cx + p[0] * c - p[1] * s, y: cy + p[0] * s + p[1] * c }; });
  }
  function pkSat(A, B) {
    var rs = [A, B];
    for (var r = 0; r < 2; r++) {
      var p = rs[r];
      for (var i = 0; i < 4; i++) {
        var p1 = p[i], p2 = p[(i + 1) % 4], ax = -(p2.y - p1.y), ay = (p2.x - p1.x);
        var mnA = 1e9, mxA = -1e9, mnB = 1e9, mxB = -1e9;
        A.forEach(function (q) { var d = q.x * ax + q.y * ay; if (d < mnA) mnA = d; if (d > mxA) mxA = d; });
        B.forEach(function (q) { var d = q.x * ax + q.y * ay; if (d < mnB) mnB = d; if (d > mxB) mxB = d; });
        if (mxA < mnB || mxB < mnA) return false;
      }
    }
    return true;
  }
  function pkCircleHit(cx, cy, hl, hw, ang, ox, oy, r) {
    var dx = ox - cx, dy = oy - cy, c = Math.cos(-ang), s = Math.sin(-ang);
    var lx = dx * c - dy * s, ly = dx * s + dy * c;
    var qx = Math.max(-hl, Math.min(hl, lx)), qy = Math.max(-hw, Math.min(hw, ly));
    return (lx - qx) * (lx - qx) + (ly - qy) * (ly - qy) < r * r;
  }

  Puzzle.openPark = function (lvl) {
    var l = lvl == null ? (PK ? PK.lvl : 0) : lvl;
    var L = PK_LEVELS[l];
    PK = {
      lvl: l, x: L.car.x, y: L.car.y, a: L.car.a, spd: 0,
      joy: { x: 0, y: 0, id: null }, gas: false, gasId: null,
      state: 'drive', t0: performance.now(), elapsed: 0, last: 0, gear: 1
    };
    var chips = PK_LEVELS.map(function (lv, i) {
      var done = localStorage.getItem(pkBestKey(i));
      return '<button class="pz-chip' + (i === l ? ' on' : '') + (done ? ' done' : '') + '" onclick="Puzzle.openPark(' + i + ')">' + (i + 1) + (done ? '✓' : '') + '</button>';
    }).join('');
    var html =
      '<div class="pz-wrap">' +
      '<div class="pz-title"><b>🅿️ Forecourt Parking</b><span>Drive into the <b class="pz-green">green bay</b> — lined up and stopped — without a scrape.</span></div>' +
      '<div class="pz-chips">' + chips + '</div>' +
      '<div class="pk-stage"><canvas id="pkCanvas"></canvas>' +
      '<div class="pk-msg" id="pkMsg"></div>' +
      '<div class="pk-joy" id="pkJoy"><div class="pk-knob" id="pkKnob"></div></div>' +
      '<div class="pk-ped" id="pkPed"><span>GO</span></div>' +
      '</div>' +
      '<div class="pz-btns"><button class="sec" onclick="Puzzle.openPark(' + l + ')">↺ Retry</button>' +
      '<button class="ghost" onclick="Puzzle.hub()">← Desk</button></div></div>';
    UI.modal(html, true);
    pkBindControls();
    requestAnimationFrame(pkFrame);
  };

  function pkBindControls() {
    var joy = $('pkJoy'), knob = $('pkKnob'), ped = $('pkPed');
    if (!joy) return;
    function setKnob() {
      var R = joy.clientWidth / 2 - 6;
      knob.style.transform = 'translate(' + (PK.joy.x * R) + 'px,' + (PK.joy.y * R) + 'px)';
    }
    function moveJoy(e) {
      var rect = joy.getBoundingClientRect();
      var R = rect.width / 2;
      var dx = (e.clientX - (rect.left + R)) / R, dy = (e.clientY - (rect.top + R)) / R;
      var m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      PK.joy.x = dx; PK.joy.y = dy; setKnob();
    }
    joy.addEventListener('pointerdown', function (e) { PK.joy.id = e.pointerId; joy.setPointerCapture(e.pointerId); moveJoy(e); e.preventDefault(); });
    joy.addEventListener('pointermove', function (e) { if (PK.joy.id === e.pointerId) moveJoy(e); });
    function joyEnd(e) { if (PK.joy.id === e.pointerId) { PK.joy.id = null; PK.joy.x = 0; PK.joy.y = 0; setKnob(); } }
    joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
    ped.addEventListener('pointerdown', function (e) { PK.gas = true; PK.gasId = e.pointerId; ped.setPointerCapture(e.pointerId); ped.classList.add('on'); e.preventDefault(); });
    function pedEnd(e) { if (PK.gasId === e.pointerId) { PK.gas = false; PK.gasId = null; ped.classList.remove('on'); } }
    ped.addEventListener('pointerup', pedEnd); ped.addEventListener('pointercancel', pedEnd);
  }

  function pkFrame(ts) {
    var cv = $('pkCanvas');
    if (!cv || !PK) return; // modal closed → stop the loop
    // size canvas to its box (dpr-aware)
    var box = cv.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var wPx = Math.round(box.width * dpr), hPx = Math.round(box.width * (PK_H / PK_W) * dpr);
    if (cv.width !== wPx || cv.height !== hPx) { cv.width = wPx; cv.height = hPx; }
    var scale = cv.width / PK_W;
    var dt = PK.last ? Math.min(0.033, (ts - PK.last) / 1000) : 0.016; PK.last = ts;

    if (PK.state === 'drive') {
      PK.elapsed = (ts - PK.t0) / 1000;
      var MAXF = 30, MAXR = 17, ENG = 40, TURN = 2.7;
      var gear = PK.joy.y > 0.25 ? -1 : PK.joy.y < -0.25 ? 1 : (PK.spd < -0.5 ? -1 : 1);
      if (PK.gas) PK.spd += gear * ENG * dt;
      // drag / braking
      var drag = PK.gas ? 0.6 : 2.6;
      PK.spd -= PK.spd * Math.min(1, drag * dt);
      PK.spd = Math.max(-MAXR, Math.min(MAXF, PK.spd));
      if (Math.abs(PK.spd) < 0.05) PK.spd = 0;
      PK.a += PK.joy.x * TURN * Math.max(-1, Math.min(1, PK.spd / 6)) * dt;
      var nx = PK.x + Math.cos(PK.a) * PK.spd * dt;
      var ny = PK.y + Math.sin(PK.a) * PK.spd * dt;
      // collision test at the proposed spot
      var hl = 5, hw = 2.6;
      var cor = pkCorners(nx, ny, hl, hw, PK.a);
      var crash = false;
      cor.forEach(function (p) { if (p.x < 0 || p.x > PK_W || p.y < 0 || p.y > PK_H) crash = true; });
      var L = PK_LEVELS[PK.lvl];
      if (!crash) L.obs.forEach(function (o) {
        if (o.t === 'cone') { if (pkCircleHit(nx, ny, hl, hw, PK.a, o.x, o.y, o.r)) crash = true; }
        else { if (pkSat(cor, pkCorners(o.x, o.y, o.w / 2, o.h / 2, 0))) crash = true; }
      });
      if (crash) { PK.state = 'crash'; PK.spd = 0; pkMsg('crash'); }
      else {
        PK.x = nx; PK.y = ny;
        // win: centre in bay, aligned, stopped
        var b = L.bay;
        var inBay = Math.abs(PK.x - b.x) < b.w / 2 - 1 && Math.abs(PK.y - b.y) < b.h / 2 - 1;
        var da = Math.abs(((PK.a - b.a) % Math.PI + Math.PI + Math.PI / 2) % Math.PI - Math.PI / 2);
        if (inBay && da < 0.38 && Math.abs(PK.spd) < 2.5) {
          PK.state = 'won'; PK.spd = 0;
          var best = localStorage.getItem(pkBestKey(PK.lvl));
          var secs = PK.elapsed;
          var isBest = !best || secs < +best;
          if (isBest) localStorage.setItem(pkBestKey(PK.lvl), secs.toFixed(1));
          pkWin(isBest);
        }
      }
    }
    pkDraw(cv, scale);
    requestAnimationFrame(pkFrame);
  }

  function pkMsg(kind) {
    var m = $('pkMsg'); if (!m) return;
    if (kind === 'crash') m.innerHTML = '<div class="pk-flash bad">💥 Ding! Watch the paintwork.<button class="sec" onclick="Puzzle.openPark(' + PK.lvl + ')">Try again</button></div>';
    else m.innerHTML = '';
  }

  function pkWin(isBest) {
    var last = PK.lvl >= PK_LEVELS.length - 1;
    var secs = PK.elapsed.toFixed(1);
    setTimeout(function () {
      UI.modal('<div class="pz-win"><div class="pz-win-badge">🅿️</div><h3>Parked it!</h3>' +
        '<p class="kv">"' + esc(PK_LEVELS[PK.lvl].name) + '" in <b>' + secs + 's</b>.' +
        (isBest ? ' <span class="pz-pb">New best!</span>' : ' <span class="muted small">Best: ' + localStorage.getItem(pkBestKey(PK.lvl)) + 's</span>') + '</p>' +
        prospectLine() +
        '<div class="pz-btns">' +
        (last ? '' : '<button onclick="Puzzle.openPark(' + (PK.lvl + 1) + ')">Next bay →</button>') +
        '<button class="sec" onclick="Puzzle.openPark(' + PK.lvl + ')">Replay</button>' +
        '<button class="ghost" onclick="Puzzle.hub()">← Desk</button></div>' +
        (last ? '<p class="kv muted small" style="margin-top:8px">Every bay nailed. Licence renewed.</p>' : '') + '</div>', true);
    }, 500);
  }

  function pkDraw(cv, scale) {
    var g = cv.getContext('2d'); var L = PK_LEVELS[PK.lvl];
    g.clearRect(0, 0, cv.width, cv.height);
    // tarmac
    g.fillStyle = '#2b3140'; g.fillRect(0, 0, cv.width, cv.height);
    // faint grid
    g.strokeStyle = 'rgba(255,255,255,.04)'; g.lineWidth = 1;
    for (var i = 10; i < PK_W; i += 10) { g.beginPath(); g.moveTo(i * scale, 0); g.lineTo(i * scale, cv.height); g.stroke(); }
    for (var j = 10; j < PK_H; j += 10) { g.beginPath(); g.moveTo(0, j * scale); g.lineTo(cv.width, j * scale); g.stroke(); }
    // bay
    var b = L.bay;
    g.save();
    g.fillStyle = 'rgba(53,208,127,.18)'; g.strokeStyle = '#35d07f'; g.lineWidth = 2; g.setLineDash([8, 6]);
    g.fillRect((b.x - b.w / 2) * scale, (b.y - b.h / 2) * scale, b.w * scale, b.h * scale);
    g.strokeRect((b.x - b.w / 2) * scale, (b.y - b.h / 2) * scale, b.w * scale, b.h * scale);
    g.setLineDash([]); g.fillStyle = 'rgba(53,208,127,.6)'; g.font = 'bold ' + (b.h * scale * 0.5) + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', b.x * scale, b.y * scale);
    g.restore();
    // obstacles
    L.obs.forEach(function (o) {
      if (o.t === 'cone') {
        g.fillStyle = '#ff9e40'; g.beginPath(); g.arc(o.x * scale, o.y * scale, o.r * scale, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(o.x * scale, o.y * scale, o.r * scale * 0.45, 0, 7); g.fill();
      } else {
        g.fillStyle = '#59627a'; g.strokeStyle = '#3a4157'; g.lineWidth = 2;
        var x = (o.x - o.w / 2) * scale, y = (o.y - o.h / 2) * scale;
        g.fillRect(x, y, o.w * scale, o.h * scale); g.strokeRect(x, y, o.w * scale, o.h * scale);
        g.fillStyle = 'rgba(150,170,210,.5)'; g.fillRect(x + o.w * scale * 0.2, y + o.h * scale * 0.28, o.w * scale * 0.6, o.h * scale * 0.44);
      }
    });
    // player car
    g.save();
    g.translate(PK.x * scale, PK.y * scale); g.rotate(PK.a);
    var hl = 5 * scale, hw = 2.6 * scale;
    g.fillStyle = PK.state === 'crash' ? '#ff5d6c' : '#ffce4a';
    g.strokeStyle = '#7a5a12'; g.lineWidth = 2;
    roundRect(g, -hl, -hw, hl * 2, hw * 2, 4); g.fill(); g.stroke();
    g.fillStyle = 'rgba(30,40,60,.85)'; roundRect(g, hl * 0.05, -hw * 0.62, hl * 0.7, hw * 1.24, 3); g.fill(); // windshield
    g.fillStyle = '#fff7d0'; g.fillRect(hl - 2, -hw * 0.8, 3, hw * 0.5); g.fillRect(hl - 2, hw * 0.3, 3, hw * 0.5); // headlights
    g.restore();
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* ---------------- Hit the Gross (timing) ---------------- */
  // A needle sweeping a bar; stop it in the green. Three deals in a row, the
  // target narrowing each time — the nerve of holding out for the number.
  var HG = null;
  function hgBestKey() { return 'feGrossBest'; }
  Puzzle.openGross = function () {
    HG = { round: 1, rounds: 3, pos: 0, dir: 1, speed: 0.85, band: 26, banked: 0, running: true, raf: null };
    UI.modal('<div class="pz-wrap">' +
      '<div class="pz-title"><b>🎯 Hit the Gross</b><span>Stop the needle in the green. Three deals — the window tightens each time.</span></div>' +
      '<div class="pz-bar"><span id="hgRound">Deal 1 of 3</span><span id="hgBank">£0 banked</span></div>' +
      '<div class="hg-track" id="hgTrack"><div class="hg-band" id="hgBand"></div><div class="hg-needle" id="hgNeedle"></div></div>' +
      '<button class="grn big" id="hgStop" onclick="Puzzle.hgStop()">STOP</button>' +
      '<div class="pz-btns"><button class="ghost" onclick="Puzzle.hub()">← Desk</button></div></div>', true);
    hgSetup();
  };
  function hgSetup() {
    HG.band = [26, 18, 12][HG.round - 1];
    HG.speed = [0.85, 1.05, 1.3][HG.round - 1];
    HG.bandStart = 12 + Math.random() * (76 - HG.band);
    HG.pos = 0; HG.dir = 1; HG.running = true;
    var b = $('hgBand');
    if (b) { b.style.left = HG.bandStart + '%'; b.style.width = HG.band + '%'; }
    var r = $('hgRound'); if (r) r.textContent = 'Deal ' + HG.round + ' of ' + HG.rounds;
    cancelAnimationFrame(HG.raf);
    HG.raf = requestAnimationFrame(hgFrame);
  }
  function hgFrame() {
    if (!HG || !HG.running) return;
    var n = $('hgNeedle');
    if (!n) { HG = null; return; }                 // modal closed
    HG.pos += HG.dir * HG.speed;
    if (HG.pos >= 100) { HG.pos = 100; HG.dir = -1; }
    if (HG.pos <= 0) { HG.pos = 0; HG.dir = 1; }
    n.style.left = HG.pos + '%';
    HG.raf = requestAnimationFrame(hgFrame);
  }
  Puzzle.hgStop = function () {
    if (!HG || !HG.running) return;
    HG.running = false;
    cancelAnimationFrame(HG.raf);
    var inBand = HG.pos >= HG.bandStart && HG.pos <= HG.bandStart + HG.band;
    var mid = HG.bandStart + HG.band / 2;
    var acc = 1 - Math.min(1, Math.abs(HG.pos - mid) / (HG.band / 2));
    var n = $('hgNeedle'); if (n) n.className = 'hg-needle ' + (inBand ? 'hit' : 'miss');
    if (!inBand) {
      setTimeout(function () {
        UI.modal('<div class="pz-win"><div class="pz-win-badge">📉</div><h3>Missed it</h3>' +
          '<p class="kv">Held out too long and they walked. Banked <b>' + money(HG.banked) + '</b> before it went wrong.</p>' +
          '<div class="pz-btns"><button onclick="Puzzle.openGross()">Go again</button>' +
          '<button class="ghost" onclick="Puzzle.hub()">← Desk</button></div></div>', true);
      }, 450);
      return;
    }
    HG.banked += Math.round((400 + acc * 1400) * HG.round);
    var bk = $('hgBank'); if (bk) bk.textContent = money(HG.banked) + ' banked';
    if (HG.round >= HG.rounds) { hgWin(); return; }
    HG.round++;
    setTimeout(function () { if (n) n.className = 'hg-needle'; hgSetup(); }, 420);
  };
  function hgWin() {
    var best = localStorage.getItem(hgBestKey());
    var isBest = !best || HG.banked > +best;
    if (isBest) localStorage.setItem(hgBestKey(), HG.banked);
    setTimeout(function () {
      UI.modal('<div class="pz-win"><div class="pz-win-badge">🎯</div><h3>Three from three</h3>' +
        '<p class="kv">You held your nerve for <b>' + money(HG.banked) + '</b> of notional gross.' +
        (isBest ? ' <span class="pz-pb">New best!</span>' : ' <span class="muted small">Best: ' + money(+best) + '</span>') + '</p>' +
        '<p class="kv muted small">Practice money — it doesn’t hit the books. What comes next does.</p>' +
        prospectLine() +
        '<div class="pz-btns"><button class="sec" onclick="Puzzle.openGross()">Again</button>' +
        '<button class="ghost" onclick="Puzzle.hub()">← Desk</button></div></div>', true);
    }, 480);
  }

  /* ---------------- hub ---------------- */
  /* The games list, rendered into the desk menu (UI.deskMenu). Everything the
     player can reach from their desk lives in one place, so there is only one
     button on the screen. */
  Puzzle.gamesHTML = function () {
    var shuffleDone = Puzzle.LEVELS.filter(function (_, i) { return localStorage.getItem(rhBestKey(i)); }).length;
    return '<p class="kv">Play a game while your team prospect. It\u2019s only fair, right?</p>' +
      '<div class="pz-reward-note">\uD83D\uDEAA Clear any level and one of them walks a buyer in after hours \u2014 <b>with a part-exchange worth retailing</b>. You manage the deal. Once a week.</div>' +
      '<button class="pz-game" onclick="Puzzle.openShuffle()"><span class="pz-game-ico">\uD83D\uDE97</span><span><b>Forecourt Shuffle</b><small>Get the red car out. ' + Puzzle.LEVELS.length + ' boards' + (shuffleDone ? ' \u00b7 ' + shuffleDone + '/' + Puzzle.LEVELS.length + ' cleared' : '') + '</small></span></button>' +
      '<button class="pz-game" onclick="Puzzle.openPark()"><span class="pz-game-ico">\uD83C\uDD7F\uFE0F</span><span><b>Forecourt Parking</b><small>Joystick + accelerator. Park it in the bay, no scrapes. ' + PK_LEVELS.length + ' bays.</small></span></button>' +
      '<button class="pz-game" onclick="Puzzle.openGross()"><span class="pz-game-ico">\uD83C\uDFAF</span><span><b>Hit the Gross</b><small>Stop the needle on the number. Three deals, tightening.</small></span></button>' +
      '<button class="pz-game" onclick="Puzzle.openPlate()"><span class="pz-game-ico">\uD83D\uDD21</span><span><b>Plate Scramble</b><small>Slide the tiles to fix the number plate.</small></span></button>';
  };
  // every "back to games" link in the games lands on the desk
  Puzzle.hub = function () { UI.deskMenu(); };

  /* read-only hooks used by the automated tests to drive the games */
  Puzzle.pkInfo = function () { return PK ? { x: PK.x, y: PK.y, spd: PK.spd, state: PK.state, elapsed: PK.elapsed } : null; };
  Puzzle.hgSetPos = function (p) { if (HG) HG.pos = p; };
  Puzzle.hgInfo = function () { return HG ? { round: HG.round, pos: HG.pos, bandStart: HG.bandStart, band: HG.band, banked: HG.banked } : null; };

  window.Puzzle = Puzzle;
})();
