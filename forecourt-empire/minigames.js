/* Forecourt Empire — Portacabin mini-games.
   Optional, self-contained puzzles for downtime between weeks. No economy
   effect; best scores persist in localStorage. Two games:
     - Forecourt Shuffle : "get the red car out" (Rush Hour style slide puzzle)
     - Plate Scramble    : a sliding-tile (8-puzzle) number plate to unscramble
   All levels below were BFS-verified solvable (min-move counts in comments). */
(function () {
  'use strict';
  var Puzzle = {};
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

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
      '<button class="ghost" onclick="Puzzle.hub()">← Games</button>' +
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
        '<div class="pz-btns">' +
        (last ? '' : '<button onclick="Puzzle.openShuffle(' + (RH.lvl + 1) + ')">Next puzzle →</button>') +
        '<button class="sec" onclick="Puzzle.openShuffle(' + RH.lvl + ')">Replay</button>' +
        '<button class="ghost" onclick="Puzzle.hub()">← Games</button>' +
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
      '<button class="ghost" onclick="Puzzle.hub()">← Games</button>' +
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
          '<div class="pz-btns"><button onclick="Puzzle.openPlate()">Again</button><button class="ghost" onclick="Puzzle.hub()">← Games</button></div></div>', true);
      }, 260);
    }
  };

  /* ---------------- hub ---------------- */
  Puzzle.hub = function () {
    var shuffleDone = Puzzle.LEVELS.filter(function (_, i) { return localStorage.getItem(rhBestKey(i)); }).length;
    UI.modal(
      '<div class="pz-hub"><h3>🏗️ The portacabin</h3>' +
      '<p class="kv muted small">Kettle’s on. A couple of puzzles for while the kettle boils / the timer runs down. Nothing here touches the business — just for the head.</p>' +
      '<button class="pz-game" onclick="Puzzle.openShuffle()"><span class="pz-game-ico">🚗</span><span><b>Forecourt Shuffle</b><small>Get the red car out. ' + Puzzle.LEVELS.length + ' boards' + (shuffleDone ? ' · ' + shuffleDone + '/' + Puzzle.LEVELS.length + ' cleared' : '') + '</small></span></button>' +
      '<button class="pz-game" onclick="Puzzle.openPlate()"><span class="pz-game-ico">🔡</span><span><b>Plate Scramble</b><small>Slide the tiles to fix the number plate.</small></span></button>' +
      '<button class="ghost" style="margin-top:12px" onclick="UI.closeModal()">Close</button></div>', true);
  };

  window.Puzzle = Puzzle;
})();
