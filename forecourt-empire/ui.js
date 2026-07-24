/* FORECOURT EMPIRE — ui.js
   All DOM. Talks to engine.js via FE.*  */
'use strict';

var UI = window.UI = {};

(function () {

var $ = function (id) { return document.getElementById(id); };
var M = FE.money;
var curTab = 'site';
var setup = { brand: null, site: null, salary: null, step: 0 };
var moveModeCar = null;
var shownCash = 0;

function G() { return FE.getState(); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

/* ---------- boot ---------- */
UI.boot = function () {
  var g = FE.load();
  if (g && !g.dead) { enterMain(); }
  else { $('screen-boot').classList.remove('hidden'); $('bootContinue').classList.toggle('hidden', !g || !!g.dead); }
};
UI.newGameFlow = function () {
  if (G() && !confirm('Start a fresh career? Your current save will be wiped.')) return;
  setup = { brand: null, site: null, salary: null, step: 1 };
  $('screen-boot').classList.add('hidden');
  renderSetup();
};
UI.continueGame = function () { $('screen-boot').classList.add('hidden'); enterMain(); };

/* ---------- setup wizard ---------- */
function renderSetup() {
  var el = $('screen-setup');
  el.classList.remove('hidden');
  var h = '';
  if (setup.step === 1) {
    h += '<div class="logo">Forecourt<br>Empire<small>DEALERSHIP MANAGEMENT</small></div>';
    h += '<p class="prose" style="margin-top:22px">Your aunt left you <em>£1,000,000</em>.</p>';
    h += '<p class="prose">Against everyone’s advice, you’re opening a car dealership.</p>';
    h += '<p class="prose muted small">You are the General Sales Manager. You don’t drive them and you don’t fix them — you buy stock, hire people, set prices and carry the consequences.</p>';
    h += '<button class="big" onclick="UI.setupNext()">Right then</button>';
  } else if (setup.step === 2) {
    h += '<h2>Choose your brand</h2><p class="muted small">This decision shapes everything. No pressure.</p>';
    Object.keys(FE.BRANDS).forEach(function (k) {
      var b = FE.BRANDS[k];
      h += '<div class="setup-card' + (setup.brand === k ? ' sel' : '') + '" onclick="UI.pickBrand(\'' + k + '\')">' +
        '<h3>' + k + ' <span class="tag">' + M(b.avgRetail) + ' avg</span></h3>' +
        '<div class="kv">' + b.blurb + '</div></div>';
    });
    h += '<button class="big" ' + (setup.brand ? '' : 'disabled') + ' onclick="UI.setupNext()">Take the franchise plunge</button>';
  } else if (setup.step === 3) {
    h += '<h2>Choose your premises</h2><p class="muted small">Same price whoever you are. Whether it suits you is another matter.</p>';
    FE.SITES.forEach(function (s, i) {
      h += '<div class="setup-card' + (setup.site === i ? ' sel' : '') + '" onclick="UI.pickSite(' + i + ')">' +
        '<h3>' + s.name + ' <span class="tag">' + M(s.cost) + '</span></h3>' +
        '<div class="kv">' + s.ext + ' pitches' + (s.int ? ' + ' + s.int + ' indoors' : '') + ' · utilities ' + M(s.util) + '/wk · up to ' + s.maxStaff + ' staff</div>' +
        '<div class="kv muted">' + s.blurb + '</div></div>';
    });
    h += '<button class="big" ' + (setup.site != null ? '' : 'disabled') + ' onclick="UI.setupNext()">Sign the lease</button>';
  } else if (setup.step === 4) {
    h += '<h2>Salary structure</h2><p class="muted small">One structure, all staff, the whole run. Changeable once a year — at a cost to morale.</p>';
    FE.SALARIES.forEach(function (s, i) {
      h += '<div class="setup-card' + (setup.salary === i ? ' sel' : '') + '" onclick="UI.pickSalary(' + i + ')">' +
        '<h3>' + s.name + '</h3><div class="kv">' + s.blurb + '</div></div>';
    });
    h += '<button class="big" ' + (setup.salary != null ? '' : 'disabled') + ' onclick="UI.setupDone()">Open the doors</button>';
  }
  el.innerHTML = '<div style="max-width:460px;margin:0 auto">' + h + '</div>';
}
UI.setupNext = function () { setup.step++; renderSetup(); };
UI.pickBrand = function (k) { setup.brand = k; renderSetup(); };
UI.pickSite = function (i) { setup.site = i; renderSetup(); };
UI.pickSalary = function (i) { setup.salary = i; renderSetup(); };
UI.setupDone = function () {
  FE.newGame(setup.brand, setup.site, setup.salary);
  $('screen-setup').classList.add('hidden');
  shownCash = G().cash;
  enterMain();
  var seen = false;
  try { seen = localStorage.getItem('feTutorialDone') === '1'; } catch (e) {}
  if (seen) UI.week1Intro();
  else setTimeout(function () { UI.startTutorial(true); }, 400);
};
UI.week1Intro = function () {
  var ws = G().wantedSegs;
  UI.modal('<h3>Week 1 — January</h3>' +
    '<p class="kv">It’s the deadest month of the year and you own a car dealership with no cars and no staff.</p>' +
    '<p class="kv">The auction list is in your inbox. And your aunt’s contact book has three people still waiting on a car: <b>a ' + ws[0] + ', a ' + ws[1] + ' and a ' + ws[2] + '</b>. Buy what people actually want and week one might not be a disaster.</p>' +
    '<p class="kv muted small">You can hire from today — the agency has names on the books. Or open up first and see how it feels solo.</p>' +
    '<div class="btnrow"><button onclick="UI.closeModal();UI.openAuction()">To the auction</button></div>');
};

/* ---------- tutorial: spotlight coach marks ---------- */
var tutStep = 0, tutSteps = [];
function buildTutSteps() {
  return [
    { sel: '#cash', text: 'This is your <b>live cash position</b> — the only score that matters. It moves the instant a car sells or a bill lands.', pos: 'below' },
    { sel: '#hudStars', text: 'Your <b>star rating</b>. Reviews and footfall follow it — protect it.', pos: 'below' },
    { sel: '#banner', text: 'Each week runs in three blocks: <b>Auction → Showroom → Office</b>. This banner always tells you what’s next.', pos: 'below' },
    { sel: '#tab-site', text: 'Your <b>forecourt</b>. Tap a car for its details, or an empty pitch to place stock.', pos: 'above' },
    { sel: '#tab-email', text: '<b>Email</b> — the daily auction list, complaints and requests all land here.', pos: 'above' },
    { sel: '#tab-stock', text: '<b>Stock</b> — every car you own, sortable by days in stock or hold cost.', pos: 'above' },
    { sel: '#tab-staff', text: '<b>Staff</b> — hire and train your sales execs. You can hire from day one.', pos: 'above' },
    { sel: '#tab-reports', text: '<b>Reports</b> — weekly P&amp;L, reviews and the share card.', pos: 'above' },
    { sel: '.gear', text: 'The <b>manager’s drawer</b>: skip a week, share progress, or replay this tour.', pos: 'above' },
    { sel: null, text: 'That’s the tour. The one number that kills dealerships is <b>days in stock</b> — keep the average under 45. Now go buy some cars.', pos: 'center', last: true }
  ];
}
UI.startTutorial = function (firstRun) {
  if (curTab !== 'site') UI.tab('site');
  tutSteps = buildTutSteps();
  tutStep = 0;
  tutSteps._firstRun = firstRun;
  var ov = document.createElement('div');
  ov.id = 'tutOverlay';
  ov.innerHTML = '<div id="tutSpot"></div><div id="tutCard"></div>';
  document.body.appendChild(ov);
  showTutStep();
};
function showTutStep() {
  var step = tutSteps[tutStep];
  var spot = $('tutSpot'), card = $('tutCard');
  if (!spot || !card) return;
  var total = tutSteps.length;
  var btns = '<div class="tut-btns">' +
    (step.last ? '' : '<button class="ghost small" onclick="UI.tutSkip()">Skip tour</button>') +
    '<button class="small" onclick="UI.tutNext()">' + (step.last ? 'Start' : 'Next (' + (tutStep + 1) + '/' + total + ')') + '</button></div>';
  card.innerHTML = '<div class="tut-text">' + step.text + '</div>' + btns;

  if (step.sel && document.querySelector(step.sel)) {
    var el = document.querySelector(step.sel);
    var r = el.getBoundingClientRect();
    var pad = 6;
    spot.style.display = 'block';
    spot.style.left = (r.left - pad) + 'px';
    spot.style.top = (r.top - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';
    card.style.display = 'block';
    // position card above or below the spot
    card.style.left = '50%';
    card.style.transform = 'translateX(-50%)';
    if (step.pos === 'above') { card.style.top = 'auto'; card.style.bottom = (window.innerHeight - r.top + 14) + 'px'; }
    else { card.style.bottom = 'auto'; card.style.top = (r.bottom + 14) + 'px'; }
  } else {
    spot.style.display = 'none';
    card.style.left = '50%'; card.style.transform = 'translateX(-50%)';
    card.style.top = '50%'; card.style.bottom = 'auto';
    card.style.marginTop = '-60px';
  }
}
UI.tutNext = function () {
  tutStep++;
  if (tutStep >= tutSteps.length) { endTutorial(); return; }
  showTutStep();
};
UI.tutSkip = function () { endTutorial(); };
function endTutorial() {
  var ov = $('tutOverlay'); if (ov) ov.remove();
  try { localStorage.setItem('feTutorialDone', '1'); } catch (e) {}
  if (tutSteps._firstRun) UI.week1Intro();
}

/* ---------- main shell ---------- */
function enterMain() {
  $('main').classList.remove('hidden');
  shownCash = G().cash;
  $('cash').textContent = M(Math.round(shownCash));
  renderAll();
  requestAnimationFrame(cashTick);
  if (G().dead) showGameOver();
}

function renderAll() {
  if (!G()) return;
  renderHUD(); renderBanner(); renderTab();
}
UI.renderAll = renderAll;

function renderHUD() {
  var g = G(), s = FE.SEASON[(g.week - 1) % 52];
  var yr = Math.ceil(g.week / 52);
  $('hudWeek').innerHTML = '<b>Week ' + g.week + '</b> · ' + s.mo + ' · Year ' + yr;
  var st = Math.round(g.stars * 10) / 10;
  var full = Math.round(g.stars);
  $('hudStars').textContent = '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full) + ' ' + st.toFixed(1);
  var badge = FE.unreadCount();
  $('emailBadge').textContent = badge;
  $('emailBadge').style.display = badge ? '' : 'none';
}

function cashTick() {
  var g = G();
  if (g) {
    var diff = g.cash - shownCash;
    if (Math.abs(diff) > 1) {
      shownCash += diff * 0.12 + (diff > 0 ? 1 : -1);
      var el = $('cash');
      el.textContent = M(Math.round(shownCash));
      el.className = diff > 0 ? 'flash-up' : 'flash-down';
    } else if (shownCash !== g.cash) {
      shownCash = g.cash;
      $('cash').textContent = M(Math.round(shownCash));
      setTimeout(function () { $('cash').className = ''; }, 600);
    }
  }
  requestAnimationFrame(cashTick);
}

function renderBanner() {
  var g = G(), h = '';
  var skipBtn = '<button class="sec" onclick="UI.skipWeek()">Skip week ⏭</button>';
  if (g.phase === 'auction') {
    h = '<div class="ph"><b>Block 1 — Auction</b><div>' + g.lots.length + ' lots in the lanes. They’re gone tomorrow.</div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button onclick="UI.openAuction()">Lanes</button>' +
      '<button class="sec" onclick="UI.toShowroom()">Open up →</button>' + skipBtn + '</div>';
  } else if (g.phase === 'showroom') {
    var left = FE.eventsLeft();
    h = '<div class="ph"><b>Block 2 — Showroom</b><div>' + (left ? left + ' thing' + (left === 1 ? '' : 's') + ' need' + (left === 1 ? 's' : '') + ' your attention.' : 'Floor’s quiet.') + '</div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' +
      (left ? '<button onclick="UI.nextEvent()">Next up</button>' : '<button class="sec" onclick="UI.toOffice()">Office →</button>') +
      skipBtn + '</div>';
  } else if (g.phase === 'office') {
    var ack = FE.needsAck().length;
    h = '<div class="ph"><b>Block 3 — Office</b><div>Post, paperwork and decisions.' + (ack ? ' <span class="danger">' + ack + ' car(s) at 90+ days need acknowledging.</span>' : '') + '</div></div>' +
      '<div style="display:flex;gap:6px"><button class="sec" onclick="UI.openOffice()">Desk</button>' +
      '<button class="grn" onclick="UI.skipWeek()">Skip week ⏭</button></div>';
  } else if (g.phase === 'report') {
    h = '<div class="ph"><b>Week closed</b><div>Report filed.</div></div><button onclick="UI.startNext()">Start week ' + g.week + '</button>';
  }
  $('banner').innerHTML = h;
}

/* ---------- tabs ---------- */
UI.tab = function (t) {
  if (curTab === 'site' && t !== 'site' && window.Scene) Scene.unmount();
  if (curTab === 'email' && t !== 'email') { mailSelectMode = false; mailSelected = {}; }
  curTab = t; moveModeCar = null;
  ['site', 'email', 'stock', 'staff', 'reports'].forEach(function (k) {
    $('tab-' + k).classList.toggle('on', k === t);
  });
  renderTab();
};
function renderTab() {
  var fn = { site: renderSite, email: renderEmail, stock: renderStock, staff: renderStaff, reports: renderReports }[curTab];
  fn();
}

/* ---------- site view ---------- */
function shade(hex, amt) {
  var n = parseInt(hex.slice(1), 16);
  var r = Math.max(0, Math.min(255, (n >> 16) + amt)), gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt));
  return 'rgb(' + r + ',' + gg + ',' + b + ')';
}
function carSVG(c) {
  var hex = FE.COLOURS[c.colour].hex;
  return '<svg viewBox="0 0 40 64">' +
    '<rect x="1" y="8" width="5" height="12" rx="2" fill="#151515"/><rect x="34" y="8" width="5" height="12" rx="2" fill="#151515"/>' +
    '<rect x="1" y="44" width="5" height="12" rx="2" fill="#151515"/><rect x="34" y="44" width="5" height="12" rx="2" fill="#151515"/>' +
    '<rect x="3" y="2" width="34" height="60" rx="11" fill="' + hex + '" stroke="rgba(0,0,0,.35)"/>' +
    '<rect x="8" y="13" width="24" height="9" rx="3" fill="rgba(15,22,30,.8)"/>' +
    '<rect x="8" y="25" width="24" height="18" rx="3" fill="' + shade(hex, -26) + '"/>' +
    '<rect x="8" y="46" width="24" height="7" rx="3" fill="rgba(15,22,30,.7)"/>' +
    '</svg>';
}
function renderSite() {
  var g = G(), s = FE.SITES[g.site];
  var nw = FE.netWorth();
  var pct = Math.min(100, nw / FE.SITE2_TARGET * 100).toFixed(1);
  var moveHTML = moveModeCar
    ? '<div class="card warn small">Moving the ' + esc(FE.carName(moveModeCar)) + ' — tap a pitch. <button class="ghost small" onclick="UI.cancelMove()">Cancel</button></div>'
    : '';
  // occupied pitches = cars physically on the forecourt (in stock + sold-but-
  // not-yet-collected), matching exactly what the scene draws
  var usedN = g.stock.filter(function (c) { return c.status === 'stock' || c.status === 'sold'; }).length;

  // Build the shell once; on same-tab refreshes just update the dynamic bits and
  // let the canvas keep running (rebuilding innerHTML would restart the scene).
  if (!$('sceneHost')) {
    var h = '<div id="moveBanner">' + moveHTML + '</div>' +
      '<div class="scene-frame"><div id="sceneHost"></div>' +
      '<div class="scene-caption"><span>' + esc(s.name) + '</span><span id="sceneCount">' + usedN + '/' + (s.ext + s.int + g.extraSlots) + ' pitches</span></div></div>' +
      '<div class="building-card" onclick="UI.openOffice()"><div><b>' + esc(s.name) + '</b><div class="kv">Tap for office, expansion &amp; departments</div></div><div style="font-size:1.4rem">🏢</div></div>' +
      '<div id="site2card"><b>Site 2 — locked</b> · unlocks at £2M net worth' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="small" id="site2fig">' + M(nw) + ' / ' + M(FE.SITE2_TARGET) + '</div></div>';
    $('content').innerHTML = h;
    Scene.mount($('sceneHost'), { moveMode: !!moveModeCar });
  } else {
    $('moveBanner').innerHTML = moveHTML;
    Scene.setMoveMode(!!moveModeCar);
    var sc = $('sceneCount'); if (sc) sc.textContent = usedN + '/' + (s.ext + s.int + g.extraSlots) + ' pitches';
    var sf = $('site2fig'); if (sf) sf.textContent = M(nw) + ' / ' + M(FE.SITE2_TARGET);
    var bar = document.querySelector('#site2card .bar i'); if (bar) bar.style.width = pct + '%';
    Scene.refresh();
  }
}
UI.slotTap = function (i) {
  var g = G();
  var car = null;
  g.stock.forEach(function (c) { if (c.slot === i && (c.status === 'stock' || c.status === 'sold')) car = c; });
  if (moveModeCar) {
    FE.moveCar(moveModeCar.id, i);
    moveModeCar = null;
    renderTab();
    return;
  }
  if (car) { UI.stockCard(car.id); }
  else if (FE.getState().stock.some(function (c) { return c.status === 'stock' && c.slot == null; })) {
    // unplaced stock exists — offer placement
    var un = FE.getState().stock.filter(function (c) { return c.status === 'stock' && c.slot == null; });
    var h = '<h3>Place a car</h3>';
    un.forEach(function (c) {
      h += '<div class="card" onclick="UI.placeCar(' + c.id + ',' + i + ')"><b>' + esc(FE.carName(c)) + '</b><div class="kv">' + esc(FE.carDesc(c)) + '</div></div>';
    });
    UI.modal(h + '<button class="ghost" onclick="UI.closeModal()">Never mind</button>');
  }
};
UI.placeCar = function (carId, slot) { FE.moveCar(carId, slot); UI.closeModal(); renderTab(); };
UI.cancelMove = function () { moveModeCar = null; renderTab(); };

/* ---------- stock tab ---------- */
var stockSort = 'days';
UI.setStockSort = function (s) { stockSort = s; renderTab(); };
function renderStock() {
  var g = G();
  var list = g.stock.filter(function (c) { return c.status === 'stock' || c.status === 'sold'; });
  list.sort(function (a, b) {
    if (stockSort === 'days') return FE.daysIn(b) - FE.daysIn(a);
    if (stockSort === 'hold') return b.holdCost - a.holdCost;
    return FE.carCost(b) - FE.carCost(a);
  });
  var h = '<div class="btnrow" style="margin-top:10px">' +
    '<button class="' + (stockSort === 'days' ? '' : 'sec') + '" onclick="UI.setStockSort(\'days\')">By days</button>' +
    '<button class="' + (stockSort === 'hold' ? '' : 'sec') + '" onclick="UI.setStockSort(\'hold\')">By hold cost</button>' +
    '<button class="' + (stockSort === 'cost' ? '' : 'sec') + '" onclick="UI.setStockSort(\'cost\')">By cost</button></div>';
  if (!list.length) h += '<div class="card kv">Nothing on the pitch. The auction email is waiting.</div>';
  list.forEach(function (c) {
    var d = FE.daysIn(c);
    var flag = c.status === 'sold' ? '<span class="good">SOLD — awaiting collection</span>' :
      d >= 90 ? '<span class="danger">' + d + ' days' + (c.ack90 ? '' : ' — needs decision') + '</span>' :
      d >= 60 ? '<span class="warn">' + d + ' days — getting dusty</span>' : d + ' days';
    h += '<div class="card" onclick="UI.stockCard(' + c.id + ')">' +
      '<div class="row"><b>' + esc(FE.carName(c)) + '</b><b>' + M(c.screen) + '</b></div>' +
      '<div class="kv">' + esc(FE.carDesc(c)) + '</div>' +
      '<div class="row kv"><span>' + flag + '</span><span>Hold cost so far <b>' + M(Math.round(c.holdCost)) + '</b></span></div>' +
      '</div>';
  });
  $('content').innerHTML = h;
}
UI.stockCard = function (id) {
  var g = G(), c = null;
  g.stock.forEach(function (x) { if (x.id === id) c = x; });
  if (!c) return;
  var d = FE.daysIn(c);
  var h = '<h3>' + esc(FE.carName(c)) + '</h3><div class="kv">' + esc(FE.carDesc(c)) + ' · plate ' + c.plate + '</div>';
  if (c.status === 'sold') {
    h += '<p class="kv good" style="margin-top:8px">Sold — customer collects shortly.</p>';
    UI.modal(h + '<button class="ghost" onclick="UI.closeModal()">Close</button>');
    return;
  }
  h += '<div class="card"><div class="row kv"><span>Bought for</span><b>' + M(FE.acq(c)) + '</b></div>' +
    '<div class="row kv"><span>Prep ' + (c.prepPaid ? 'spent' : 'pending') + '</span><b>' + M(c.prepPaid ? c.cost.prep : 0) + '</b></div>' +
    '<div class="row kv"><span>Screen price</span><b>' + M(c.screen) + '</b></div>' +
    '<div class="row kv"><span>Market retail (trade view)</span><b>' + M(c.retail) + '</b></div>' +
    '<div class="row kv"><span>Days in stock</span><b>' + d + '</b></div>' +
    '<div class="row kv"><span>Hold cost so far</span><b class="' + (c.holdCost > 300 ? 'warn' : '') + '">' + M(Math.round(c.holdCost)) + '</b></div>' +
    '<div class="row kv"><span>Trade-out value today</span><b>' + M(FE.tradeValue(c)) + '</b></div></div>';
  if (d >= 90 && !c.ack90) h += '<p class="kv danger">This car has been here 90+ days. Decide something — reprice it, trade it, or look it in the eye and acknowledge it. It cannot be ignored.</p>';
  h += '<div class="btnrow">' +
    '<button onclick="UI.repriceUI(' + c.id + ')">Reprice</button>' +
    '<button class="sec" onclick="UI.startMove(' + c.id + ')">Move</button>' +
    '<button class="amber" onclick="UI.tradeOutUI(' + c.id + ')">Trade out</button>' +
    (d >= 90 && !c.ack90 ? '<button class="red" onclick="UI.ackUI(' + c.id + ')">Acknowledge</button>' : '') +
    '</div><button class="ghost" style="margin-top:10px" onclick="UI.closeModal()">Close</button>';
  UI.modal(h);
};
UI.repriceUI = function (id) {
  var c = null;
  G().stock.forEach(function (x) { if (x.id === id) c = x; });
  UI.modal('<h3>Reprice — ' + esc(FE.carName(c)) + '</h3>' +
    '<p class="kv">Screen ' + M(c.screen) + ' · market ' + M(c.retail) + '. Price under market and it moves faster; over and it sits.</p>' +
    '<input type="number" id="repriceVal" value="' + c.screen + '" step="25">' +
    '<div class="btnrow"><button onclick="UI.repriceGo(' + id + ')">Set price</button><button class="ghost" onclick="UI.stockCard(' + id + ')">Back</button></div>');
};
UI.repriceGo = function (id) {
  FE.reprice(id, parseInt($('repriceVal').value, 10) || 0);
  UI.closeModal(); renderAll();
};
UI.startMove = function (id) {
  G().stock.forEach(function (x) { if (x.id === id) moveModeCar = x; });
  UI.closeModal(); UI.tab('site');
};
UI.tradeOutUI = function (id) {
  var c = null;
  G().stock.forEach(function (x) { if (x.id === id) c = x; });
  var v = FE.tradeValue(c);
  UI.modal('<h3>Trade out?</h3><p class="kv">The trade will take the ' + esc(FE.carName(c)) + ' today for <b>' + M(v) + '</b>. You paid ' + M(FE.acq(c)) + (c.prepPaid ? ' plus ' + M(c.cost.prep) + ' prep' : '') + '. Money now, pitch free, no more hold cost.</p>' +
    '<div class="btnrow"><button class="amber" onclick="UI.tradeOutGo(' + id + ')">Take it</button><button class="ghost" onclick="UI.closeModal()">Keep the car</button></div>');
};
UI.tradeOutGo = function (id) {
  var r = FE.tradeOut(id);
  UI.closeModal();
  toast('Traded out — ' + (r.net >= 0 ? 'made ' : 'took a hit of ') + M(Math.abs(r.net)) + ' net');
  renderAll();
};
UI.ackUI = function (id) { FE.ack90(id); UI.closeModal(); renderAll(); };

/* ---------- email tab ---------- */
var mailFilter = 'all';
var ACTION_TYPES = ['comeback', 'holiday', 'payreview', 'poach', 'alloc', 'prereg'];
function mailCat(e) {
  if (ACTION_TYPES.indexOf(e.type) >= 0 && !e.done) return 'action';
  if (e.type === 'sold') return 'sold';
  if (e.type === 'shock') return 'press';
  return 'general';
}
function avatarColour(name) {
  var known = { Priya: '#c14fb0', Mon: '#3a8fe0', Glen: '#4cae6a', Deano: '#d97b3a', Sarah: '#7a63d0',
    Terry: '#8a8f98', Kelly: '#e0663a', Marcus: '#3b5168', Bev: '#5a8a6a', Ryan: '#d9a93a',
    Dan: '#1f6feb', Danny: '#6aa0d0', Karis: '#c14fb0', Clive: '#8a8f98', Vas: '#4cae6a', Tomi: '#e0663a' };
  if (known[name]) return known[name];
  var h = 0, i; for (i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  var hues = ['#3a8fe0', '#4cae6a', '#d97b3a', '#8a6ad0', '#c14fb0', '#5a8a6a', '#c0603a'];
  return hues[h % hues.length];
}
function mailPreview(body) {
  var t = body.replace(/\n+/g, ' ').trim();
  return t.length > 64 ? t.slice(0, 64) + '…' : t;
}
UI.setMailFilter = function (f) { mailFilter = f; renderEmail(); };
var mailSelectMode = false;
var mailSelected = {};
UI.mailSelectToggle = function () {
  mailSelectMode = !mailSelectMode; mailSelected = {};
  renderEmail();
};
UI.mailTick = function (id) {
  if (mailSelected[id]) delete mailSelected[id]; else mailSelected[id] = 1;
  renderEmail();
};
UI.mailSelectAll = function () {
  var g = G();
  var list = g.emails.filter(function (e) { return (mailFilter === 'all' || mailCat(e) === mailFilter) && FE.emailDeletable(e); });
  var allOn = list.length && list.every(function (e) { return mailSelected[e.id]; });
  mailSelected = {};
  if (!allOn) list.forEach(function (e) { mailSelected[e.id] = 1; });
  renderEmail();
};
UI.mailMarkAllRead = function () {
  var g = G();
  // mark read within the current filter (so "Sold notes" clears just those)
  var ids = g.emails.filter(function (e) { return mailFilter === 'all' || mailCat(e) === mailFilter; }).map(function (e) { return e.id; });
  FE.markAllRead(mailFilter === 'all' ? null : ids);
  renderHUD(); renderEmail();
  toast(mailFilter === 'all' ? 'All marked read.' : 'Marked read.');
};
UI.mailDeleteSelected = function () {
  var ids = Object.keys(mailSelected).map(Number);
  if (!ids.length) { toast('Tick some emails first.'); return; }
  var n = FE.deleteEmails(ids);
  mailSelectMode = false; mailSelected = {};
  renderHUD(); renderEmail();
  toast(n ? n + ' email' + (n === 1 ? '' : 's') + ' deleted.' : 'Nothing deleted (action items are kept).');
};
function renderEmail() {
  var g = G(), h = '';
  var counts = { all: 0, action: 0, sold: 0, press: 0 };
  g.emails.forEach(function (e) {
    counts.all++;
    var c = mailCat(e);
    if (c === 'action') counts.action++;
    else if (c === 'sold') counts.sold++;
    else if (c === 'press') counts.press++;
  });
  var tabs = [['all', 'All'], ['action', 'Needs action'], ['sold', 'Sold notes'], ['press', 'Trade press']];
  h += '<div class="mail-tabs">' + tabs.map(function (t) {
    var badge = t[0] === 'action' && counts.action ? '<span class="mt-badge">' + counts.action + '</span>' : '';
    return '<button class="' + (mailFilter === t[0] ? 'on' : '') + '" onclick="UI.setMailFilter(\'' + t[0] + '\')">' + t[1] + badge + '</button>';
  }).join('') + '</div>';

  // action bar: mark-all-read + select/delete
  var selCount = Object.keys(mailSelected).length;
  if (!mailSelectMode) {
    h += '<div class="mail-actions">' +
      '<button class="sec small" onclick="UI.mailMarkAllRead()">✓ Mark all read</button>' +
      '<button class="sec small" onclick="UI.mailSelectToggle()">Select</button></div>';
  } else {
    h += '<div class="mail-actions">' +
      '<button class="sec small" onclick="UI.mailSelectAll()">Select all</button>' +
      '<button class="red small" onclick="UI.mailDeleteSelected()">Delete' + (selCount ? ' (' + selCount + ')' : '') + '</button>' +
      '<button class="ghost small" onclick="UI.mailSelectToggle()">Cancel</button></div>';
  }

  var list = g.emails.filter(function (e) { return mailFilter === 'all' || mailCat(e) === mailFilter; });
  if (!list.length) h += '<div class="card kv muted" style="margin-top:10px">' + (mailFilter === 'all' ? 'Inbox zero. Enjoy it while it lasts.' : 'Nothing here right now.') + '</div>';

  var group = null;
  list.slice(0, 80).forEach(function (e) {
    var gLabel = e.wk >= g.week ? 'This week' : e.wk >= g.week - 1 ? 'Last week' : 'Earlier';
    if (gLabel !== group) { group = gLabel; h += '<div class="mail-group">' + group + '</div>'; }
    var cat = mailCat(e);
    var initial = esc(e.from.charAt(0).toUpperCase());
    var pill = cat === 'action' ? '<span class="mail-pill">Needs action</span>' :
      cat === 'sold' ? '<span class="mail-pill sold">Sold</span>' : '';
    var selectable = FE.emailDeletable(e);
    var ticked = !!mailSelected[e.id];
    var tap = mailSelectMode ? (selectable ? 'UI.mailTick(' + e.id + ')' : '') : 'UI.openEmail(' + e.id + ')';
    var check = mailSelectMode ? '<div class="mail-check' + (ticked ? ' on' : '') + (selectable ? '' : ' lock') + '">' + (selectable ? (ticked ? '✓' : '') : '🔒') + '</div>' : '';
    h += '<div class="mail-item' + (e.unread ? ' unread' : '') + (ticked ? ' sel' : '') + '"' + (tap ? ' onclick="' + tap + '"' : '') + '>' +
      check +
      '<div class="mail-av" style="background:' + avatarColour(e.from) + '">' + initial + (e.unread ? '<i class="dot"></i>' : '') + '</div>' +
      '<div class="mail-body">' +
      '<div class="mail-row1"><span class="mail-from">' + esc(e.from) + '</span><span class="mail-wk">wk ' + e.wk + '</span></div>' +
      '<div class="mail-subj">' + esc(e.subj) + ' ' + pill + '</div>' +
      '<div class="mail-prev">' + esc(mailPreview(e.body)) + '</div>' +
      '</div></div>';
  });
  $('content').innerHTML = h;
}
UI.openEmail = function (id) {
  var g = G(), e = null;
  g.emails.forEach(function (x) { if (x.id === id) e = x; });
  if (!e) return;
  FE.markRead(id);
  renderHUD();
  var h = '<div class="mail-reader-head">' +
    '<div class="mail-av lg" style="background:' + avatarColour(e.from) + '">' + esc(e.from.charAt(0).toUpperCase()) + '</div>' +
    '<div><div class="mail-from" style="font-size:1rem">' + esc(e.from) + '</div><div class="mail-wk">Week ' + e.wk + '</div></div></div>' +
    '<h3 style="margin:4px 0 10px">' + esc(e.subj) + '</h3>' +
    '<pre>' + esc(e.body) + '</pre>';
  if (e.type === 'auction' && e.wk === g.week && g.phase === 'auction') {
    h += '<div class="btnrow"><button onclick="UI.closeModal();UI.openAuction()">Open the list</button></div>';
  }
  if (e.type === 'comeback' && !e.done) {
    var wks = g.week - e.data.soldWk;
    var cra = wks <= 4 ? 'Within ~30 days of sale: they hold a short-term right to reject. Tread carefully.' :
      wks <= 26 ? 'Within 6 months: the law presumes the fault existed at sale. Burden’s on you.' :
      'Past 6 months: burden of proof shifts to the customer. Wear and tear is arguable.';
    h += '<p class="kv warn">' + cra + '</p><div class="btnrow">' +
      '<button class="grn" onclick="UI.comeback(' + e.id + ',\'pay\')">Pay in full (' + M(e.data.cost) + ')</button>' +
      '<button class="sec" onclick="UI.comeback(' + e.id + ',\'warranty\')">Refer to warranty</button>' +
      '<button class="sec" onclick="UI.comeback(' + e.id + ',\'goodwill\')">Goodwill 50% (' + M(Math.round(e.data.cost / 2)) + ')</button>' +
      '<button class="amber" onclick="UI.comeback(' + e.id + ',\'wear\')">Wear &amp; tear</button>' +
      '<button class="red" onclick="UI.comeback(' + e.id + ',\'refuse\')">Refuse</button></div>';
  }
  if (e.type === 'holiday' && !e.done) {
    h += '<div class="btnrow"><button class="grn" onclick="UI.holiday(' + e.id + ',true)">Approve</button>' +
      '<button class="red" onclick="UI.holiday(' + e.id + ',false)">Refuse</button></div>';
  }
  if (e.type === 'payreview' && !e.done) {
    h += '<div class="btnrow"><button class="grn" onclick="UI.payreview(' + e.id + ',true)">Pay the man</button>' +
      '<button class="red" onclick="UI.payreview(' + e.id + ',false)">Hold the line</button></div>';
  }
  if (e.type === 'poach' && !e.done) {
    h += '<div class="btnrow"><button class="grn" onclick="UI.poach(' + e.id + ',true)">Match it</button>' +
      '<button class="red" onclick="UI.poach(' + e.id + ',false)">Let them go</button></div>';
  }
  if (e.type === 'alloc' && !e.done) {
    h += '<div class="btnrow"><button class="grn" onclick="UI.alloc(' + e.id + ',true)">Accept allocation</button>' +
      '<button class="red" onclick="UI.alloc(' + e.id + ',false)">Decline</button></div>';
  }
  if (e.type === 'prereg' && !e.done) {
    h += '<div class="btnrow"><button class="amber" onclick="UI.prereg(' + e.id + ',true)">Pre-register the shortfall</button>' +
      '<button class="sec" onclick="UI.prereg(' + e.id + ',false)">Take the lower bonus</button></div>';
  }
  h += '<button class="ghost" style="margin-top:12px" onclick="UI.closeModal();UI.renderAll()">← Back to inbox</button>';
  UI.modal(h);
};
UI.comeback = function (id, choice) {
  var out = FE.resolveComeback(id, choice);
  UI.modal('<h3>Done</h3><p class="kv">' + esc(out.note) + '</p>' + (out.cost ? '<p class="kv">Cost: ' + M(out.cost) + '</p>' : '') +
    '<button onclick="UI.closeModal();UI.renderAll()">OK</button>');
};
UI.holiday = function (id, a) { FE.resolveHoliday(id, a); UI.closeModal(); renderAll(); };
UI.payreview = function (id, a) { FE.resolvePayReview(id, a); UI.closeModal(); renderAll(); };
UI.poach = function (id, a) { FE.resolvePoach(id, a); UI.closeModal(); renderAll(); };
UI.alloc = function (id, a) { FE.resolveAlloc(id, a); UI.closeModal(); renderAll(); };
UI.prereg = function (id, a) {
  var r = FE.resolvePreReg(id, a);
  UI.closeModal();
  if (r && r.done) toast(r.n + ' car(s) pre-registered. They’re used stock now.');
  renderAll();
};

/* ---------- auction ---------- */
var auctionFilter = 'all';
UI.setAuctionFilter = function (f) { auctionFilter = f; UI.openAuction(); };
var RISK_LABEL = { green: 'Low risk', amber: 'Some risk', red: 'High risk' };
function riskChip(l) {
  var r = l.risk;
  var lbl = RISK_LABEL[r.light];
  if (r.light === 'red') lbl = r.flavour === 'gamble' ? 'High risk / high reward' : 'High risk — bad car';
  return '<span class="risk-chip ' + r.light + '" onclick="event.stopPropagation();UI.riskInfo(' + l.id + ')">● ' + lbl + '</span>';
}
UI.openAuction = function () {
  var g = G();
  if (g.phase !== 'auction') { toast('The lanes are done for today. Tomorrow’s list comes with the new week.'); return; }
  var counts = { all: g.lots.length, green: 0, amber: 0, red: 0 };
  g.lots.forEach(function (l) { counts[l.risk.light]++; });
  var h = '<h3>Central Auctions — today’s list</h3>' +
    '<p class="kv muted small">Est. gross is <b>before fees, prep &amp; hold cost</b> — the mean prep assumption, and it is optimistic. Buyer premium 5.5% + £180 transport on every lot. Tap a risk light for why.</p>';
  if (FE.financeEnabled()) {
    h += '<div class="card kv" style="margin:4px 0"><b>' + M(FE.spendPower()) + '</b> to spend (' + M(g.cash) + ' cash + ' + M(FE.financeHeadroom()) + ' stocking finance).</div>';
  }
  h += '<div class="risk-filter">' +
    ['all', 'green', 'amber', 'red'].map(function (f) {
      var name = f === 'all' ? 'All' : f === 'green' ? '🟢' : f === 'amber' ? '🟠' : '🔴';
      return '<button class="' + (auctionFilter === f ? 'on ' : '') + f + '" onclick="UI.setAuctionFilter(\'' + f + '\')">' + name + ' ' + counts[f] + '</button>';
    }).join('') + '</div>';
  if (!g.lots.length) h += '<div class="card kv">All lots gone or bought. Fresh list with the new week.</div>';
  var shown = 0;
  g.lots.forEach(function (l) {
    if (auctionFilter !== 'all' && l.risk.light !== auctionFilter) return;
    shown++;
    h += '<div class="card lot ' + l.risk.light + '">' +
      '<div class="row"><b>' + esc(l.brand + ' ' + FE.MODELS[l.model].m) + '</b><b>' + M(l.hammer) + '</b></div>' +
      '<div class="kv">' + esc(FE.carDesc(l)) + '</div>' +
      '<div class="row" style="margin:5px 0">' + riskChip(l) + (l.vasFlag ? '<span class="vas-flag">Vas rates this one</span>' : '') + '</div>' +
      '<div class="row kv"><span>Est retail <b>' + M(l.retail) + '</b></span><span>Est days <b>' + l.estDays[0] + '–' + l.estDays[1] + '</b></span></div>' +
      '<div class="row kv"><span>Est. gross (before prep &amp; hold) <b class="' + (l.estGross > 1200 ? 'good' : '') + '">' + M(l.estGross) + '</b></span></div>' +
      '<div class="btnrow"><button onclick="UI.buyLot(' + l.id + ')">Buy — ' + M(Math.round(l.hammer * 1.055) + 180) + ' all-in</button></div>' +
      '</div>';
  });
  if (g.lots.length && !shown) h += '<div class="card kv muted">No ' + RISK_LABEL[auctionFilter] + ' lots in today’s list.</div>';
  h += '<button class="ghost" onclick="UI.closeModal()">Leave the lanes</button>';
  UI.modal(h);
};
UI.riskInfo = function (id) {
  var g = G(), l = null;
  g.lots.forEach(function (x) { if (x.id === id) l = x; });
  if (!l) return;
  var r = l.risk;
  var head = r.light === 'green' ? '🟢 Low risk' : r.light === 'amber' ? '🟠 Some risk' :
    r.flavour === 'gamble' ? '🔴 High risk, high reward' : '🔴 High risk — a bad car';
  var intro = r.light === 'green' ? 'Nothing visible to scare the room. Priced accordingly — the margin is honest, not generous.' :
    r.light === 'amber' ? 'One thing to watch. Manageable if the money’s right.' :
    r.flavour === 'gamble' ? 'Rough on paper and priced for it — but there’s a desirable car underneath. Get the prep and the faults kind and this is where the big gross hides. Get them wrong and it eats you.' :
    'Cheap for a reason, and no hidden upside. The colour or the spec means you’ll be discounting it to shift it. Your exit here is the trade, not the retail line.';
  var h = '<h3>' + head + '</h3><p class="kv">' + intro + '</p>' +
    '<div class="card"><b>' + esc(l.brand + ' ' + FE.MODELS[l.model].m) + '</b><div class="kv">' + esc(FE.carDesc(l)) + '</div></div>' +
    '<p class="kv" style="margin-bottom:4px"><b>What the light is reading:</b></p><ul class="risk-list">';
  r.drivers.forEach(function (d) { h += '<li>' + esc(d) + '</li>'; });
  h += '</ul>';
  if (l.vasFlag) h += '<p class="kv good">Vas reckons this one’s worth the gamble — he’s usually right about the ones the room walks past.</p>';
  h += '<div class="btnrow"><button onclick="UI.buyLot(' + l.id + ');">Buy — ' + M(Math.round(l.hammer * 1.055) + 180) + '</button>' +
    '<button class="ghost" onclick="UI.openAuction()">Back to the lanes</button></div>';
  UI.modal(h);
};
UI.buyLot = function (id) {
  var r = FE.buyLot(id);
  if (!r.ok) { toast(r.msg); return; }
  toast('Bought — ' + FE.carName(r.car) + '. It’s on your pitch.');
  UI.openAuction();
  renderHUD();
};

/* ---------- showroom events ---------- */
UI.toShowroom = function () {
  var g = G();
  if (g.week === 1 && !g.stock.some(function (c) { return c.status === 'stock'; })) {
    if (!confirm('Open up with an empty forecourt? Your aunt’s contacts are coming today.')) return;
  }
  FE.enterShowroom();
  renderAll();
  UI.nextEvent();
};
UI.nextEvent = function () {
  var ev = FE.currentEvent();
  if (!ev) { renderAll(); toast('That’s the floor cleared for this week.'); return; }
  if (ev.silent) {
    // auto sale already resolved at build time
    if (ev.result) toast(esc(ev.result.exec === 'you' ? 'You' : ev.result.exec) + ' sold the ' + FE.MODELS[ev.result.car.model].m + ' — ' + M(ev.result.front + ev.result.back) + ' gross');
    FE.advanceEvent();
    renderAll();
    setTimeout(UI.nextEvent, 650);
    return;
  }
  if (ev.kind === 'prep') return prepPopup(ev);
  if (ev.kind === 'prequal') return prequalPopup(ev);
  if (ev.kind === 'tradebuyer') return tradeBuyerPopup(ev);
  if (ev.kind === 'offer') {
    if (ev.px && !ev.pxResolved) return pxPopup(ev);
    return offerPopup(ev);
  }
  FE.advanceEvent(); UI.nextEvent();
};

function prepPopup(ev) {
  var c = ev.car;
  var r = FE.payPrep(ev);
  var h = '<h3>Prep bill — ' + esc(FE.carName(c)) + '</h3>' +
    '<p class="kv">The workshop’s been through it. Bill: <b class="' + (r.blowout ? 'danger' : '') + '">' + M(r.amount) + '</b>' +
    (r.blowout ? ' — <span class="danger">including a horror they found underneath.</span>' : '.') + '</p>';
  if (r.tip) h += '<p class="kv warn">Career tip (you’ll only get this once): the auction’s "est. gross" uses an average prep guess. Condition grades 1–2 are where blowouts hide, and the colour column tells you how long you’ll pay to hold it.</p>';
  h += '<button onclick="UI.closeModal();FE.advanceEvent();UI.renderAll();UI.nextEvent()">Pay it</button>';
  UI.modal(h);
}

function prequalPopup(ev) {
  if (ev.noStock) {
    UI.modal('<h3>Aunt’s contact book</h3><p class="kv">Someone came in asking for a <b>' + esc(ev.seg) + '</b> — you haven’t got one. They left. Buy what people actually want.</p>' +
      '<button onclick="UI.closeModal();FE.advanceEvent();UI.renderAll();UI.nextEvent()">Noted</button>');
    return;
  }
  if (ev.walked) {
    UI.modal('<h3>Aunt’s contact book</h3><p class="kv">A ' + esc(ev.seg) + ' shopper had a look, made polite noises, and left. Can’t win them all.</p>' +
      '<button onclick="UI.closeModal();FE.advanceEvent();UI.renderAll();UI.nextEvent()">On to the next</button>');
    return;
  }
  var c = ev.car;
  UI.modal('<h3>A friendly face</h3><p class="kv">One of your aunt’s old contacts — been waiting for a <b>' + esc(ev.seg) + '</b>. They love the ' + esc(FE.carName(c)) + ' and they’ll pay <b>' + M(ev.offer) + '</b> (screen ' + M(c.screen) + ').</p>' +
    fniButtons('UI.prequalGo', ev.exec) +
    '<button class="ghost" style="margin-top:8px" onclick="UI.closeModal();FE.prequalMiss(FE.currentEvent());UI.renderAll();UI.nextEvent()">Turn the deal away</button>');
}
function fniButtons(fnName, exec) {
  var who = exec ? exec.name : 'You';
  return '<p class="kv muted small" style="margin-top:6px">' + esc(who) + ' will handle the paperwork. How hard on the add-ons?</p>' +
    '<div class="btnrow">' +
    '<button onclick="' + fnName + '(null)">Deal — usual patter</button>' +
    '<button class="amber" onclick="' + fnName + '(\'push\')">Deal — push products</button>' +
    '<button class="sec" onclick="' + fnName + '(\'soft\')">Deal — keep it light</button></div>';
}
UI.prequalGo = function (fni) {
  var ev = FE.currentEvent();
  var s = FE.prequalClose(ev, fni);
  saleResult(s);
};
function saleResult(s) {
  var h = '<h3>' + (s.front + s.back >= 0 ? 'Deal done' : 'Deal done — it hurt') + '</h3>' +
    '<div class="card"><div class="row kv"><span>Sold at</span><b>' + M(s.price) + '</b></div>' +
    '<div class="row kv"><span>Front-end</span><b class="' + (s.front < 0 ? 'danger' : '') + '">' + M(s.front) + '</b></div>' +
    '<div class="row kv"><span>Back-end</span><b>' + M(s.back) + '</b></div>' +
    '<div class="row kv"><span>Days in stock</span><b>' + FE.daysIn(s.car) + '</b></div></div>' +
    '<p class="kv muted small">The sold sign’s up. Full note in your inbox.</p>' +
    '<button onclick="UI.closeModal();FE.advanceEvent();UI.renderAll();UI.nextEvent()">Next</button>';
  UI.modal(h);
}

function tradeBuyerPopup(ev) {
  var g = G();
  var stock = g.stock.filter(function (c) { return c.status === 'stock'; });
  var h = '<h3>The trade buyer</h3><p class="kv">A local trader’s sniffing about: <i>"I’ll give you cost plus £400 for any one of them, cash today."</i> Guaranteed profit, one less car to prep and hold.</p>';
  stock.forEach(function (c) {
    h += '<div class="card" onclick="UI.tradeBuyerGo(' + c.id + ')"><div class="row"><b>' + esc(FE.carName(c)) + '</b><b class="good">' + M(FE.acq(c) + 400) + '</b></div><div class="kv">' + esc(FE.carDesc(c)) + '</div></div>';
  });
  h += '<button class="ghost" onclick="UI.closeModal();FE.tradeBuyerDecline(FE.currentEvent());UI.renderAll();UI.nextEvent()">Send him packing</button>';
  UI.modal(h);
}
UI.tradeBuyerGo = function (carId) {
  var ev = FE.currentEvent();
  FE.tradeBuyerSell(ev, carId);
  UI.modal('<h3>Cash in hand</h3><p class="kv">£400 clear, no prep, no waiting. That’s the trade-out lever — remember it exists when something won’t sell.</p>' +
    '<button onclick="UI.closeModal();UI.renderAll();UI.nextEvent()">Next</button>');
};

function pxPopup(ev) {
  var p = ev.pxCar;
  var g = FE.MODELS[p.model];
  var estPrep = Math.round(FE.BRANDS[G().brand].prepPct * ev.pxGuide * FE.COND[p.cond].prep);
  var retailNet = p.retail - ev.pxGuide - estPrep;
  UI.modal('<h3>Part-exchange on the table</h3>' +
    '<p class="kv">' + esc(ev.buyer) + ' wants the ' + esc(FE.carName(ev.car)) + ' — but only with their old one taken in. They’re stood at the desk. <span class="warn">Deals cool by the minute.</span></p>' +
    '<div class="card"><b>' + esc(p.brand + ' ' + g.m) + '</b><div class="kv">' + esc(FE.carDesc(p)) + '</div>' +
    '<div class="row kv"><span>Trade guide</span><b>' + M(ev.pxGuide) + '</b></div>' +
    '<div class="row kv"><span>Retail guide</span><b>' + M(p.retail) + '</b></div>' +
    '<div class="row kv"><span>Est prep</span><b>' + M(estPrep) + '</b></div>' +
    '<div class="row kv"><span>Forecast gross if retailed</span><b>' + M(retailNet) + '</b></div>' +
    '<div class="kv muted small">Five minutes in a car park is not an inspection. PX bites later more often than auction stock.</div></div>' +
    '<div class="btnrow">' +
    '<button onclick="UI.pxGo(\'high\')">Value high — win the deal</button>' +
    '<button class="sec" onclick="UI.pxGo(\'fair\')">Value accurately</button>' +
    '<button class="sec" onclick="UI.pxGo(\'low\')">Value low</button>' +
    '<button class="amber" onclick="UI.pxGo(\'trade\')">Take it, punt to trade</button></div>');
}
UI.pxGo = function (choice) {
  var ev = FE.currentEvent();
  var r = FE.resolvePX(ev, choice);
  if (!r.dealOn) {
    UI.modal('<h3>They walked</h3><p class="kv">"We’ll think about it." They won’t. The PX number killed it.</p>' +
      '<button onclick="UI.closeModal();FE.pxWalk(FE.currentEvent());UI.renderAll();UI.nextEvent()">Back to the floor</button>');
    return;
  }
  var note = r.traded ? 'PX flipped straight to the trade for ' + M(r.margin) + ' clear.' :
    'Their old one is on your books at ' + M(r.paid) + '. Prep bill to follow.';
  UI.modal('<h3>PX agreed</h3><p class="kv">' + note + ' Now — the deal itself.</p>' +
    '<button onclick="UI.closeModal();UI.pxThenOffer()">To the numbers</button>');
};
UI.pxThenOffer = function () { offerPopup(FE.currentEvent()); };

function offerPopup(ev) {
  var c = ev.car;
  var gross = ev.offer - FE.acq(c);
  var h = '<h3>Offer on the ' + esc(FE.MODELS[c.model].m) + '</h3>' +
    '<p class="kv">' + esc(ev.buyer) + (ev.exec ? ' — ' + esc(ev.exec.name) + ' is handling it' : '') + '. Read: <span class="cust-read">"' + esc(ev.read) + '"</span></p>' +
    '<div class="card">' +
    '<div class="row kv"><span>Screen price</span><b>' + M(c.screen) + '</b></div>' +
    '<div class="row kv"><span>You paid</span><b>' + M(FE.acq(c)) + '</b> <span class="muted">+ ' + M(c.cost.prep) + ' prep</span></div>' +
    '<div class="row kv"><span>Days in stock</span><b class="' + (FE.daysIn(c) > 60 ? 'warn' : '') + '">' + FE.daysIn(c) + '</b></div>' +
    '<div class="row kv"><span>Hold cost so far</span><b>' + M(Math.round(c.holdCost)) + '</b></div>' +
    '<div class="row" style="margin-top:6px"><span><b>THE OFFER</b></span><b style="font-size:1.2rem">' + M(ev.offer) + '</b></div>' +
    '<div class="row kv"><span>Front gross if accepted</span><b class="' + (gross < 0 ? 'danger' : gross > 1200 ? 'good' : '') + '">' + M(gross) + '</b></div>' +
    '</div>' +
    '<div class="btnrow">' +
    '<button class="grn" onclick="UI.offerAccept()">Accept</button>' +
    '<button onclick="UI.offerCounterUI()">Counter</button>' +
    '<button class="sec" onclick="UI.offerDecline()">Decline</button>' +
    '<button class="sec" onclick="UI.offerAlt()">Suggest another car</button></div>';
  UI.modal(h);
}
UI.offerAccept = function () {
  var ev = FE.currentEvent();
  UI.modal('<h3>Shake on it</h3><p class="kv">' + M(ev.offer) + ' for the ' + esc(FE.MODELS[ev.car.model].m) + '.</p>' + fniButtons('UI.offerFni', ev.exec));
};
UI.offerFni = function (fni) {
  var ev = FE.currentEvent();
  var s = FE.acceptOffer(ev, fni);
  saleResult(s);
};
UI.offerCounterUI = function () {
  var ev = FE.currentEvent();
  var mid = Math.round((ev.offer + ev.car.screen) / 2);
  UI.modal('<h3>Counter</h3><p class="kv">They offered ' + M(ev.offer) + ' against a screen of ' + M(ev.car.screen) + '. Push too hard on a serious buyer and they walk — the read is a hint, not an answer.</p>' +
    '<input type="number" id="counterVal" value="' + mid + '" step="25">' +
    '<div class="btnrow"><button onclick="UI.offerCounterGo()">Put it to them</button><button class="ghost" onclick="UI.backToOffer()">Back</button></div>');
};
UI.backToOffer = function () { offerPopup(FE.currentEvent()); };
UI.offerCounterGo = function () {
  var ev = FE.currentEvent();
  var v = parseInt($('counterVal').value, 10) || ev.offer;
  var r = FE.counterOffer(ev, v);
  if (r.won) {
    FE.advanceEvent();
    saleResultNoAdvance(r.sale);
  } else {
    UI.modal('<h3>Gone</h3><p class="kv">"' + pick(['Nah, you’re alright."', 'I’ll leave it, thanks."', 'That’s not what we discussed."']) + ' They’re out the door.</p>' +
      '<button onclick="UI.closeModal();FE.advanceEvent();UI.renderAll();UI.nextEvent()">Next</button>');
  }
};
function saleResultNoAdvance(s) {
  UI.modal('<h3>Deal done</h3>' +
    '<div class="card"><div class="row kv"><span>Sold at</span><b>' + M(s.price) + '</b></div>' +
    '<div class="row kv"><span>Front-end</span><b class="' + (s.front < 0 ? 'danger' : '') + '">' + M(s.front) + '</b></div>' +
    '<div class="row kv"><span>Back-end</span><b>' + M(s.back) + '</b></div></div>' +
    '<button onclick="UI.closeModal();UI.renderAll();UI.nextEvent()">Next</button>');
}
UI.offerDecline = function () {
  var ev = FE.currentEvent();
  FE.declineOffer(ev);
  UI.closeModal(); FE.advanceEvent(); renderAll(); UI.nextEvent();
};
UI.offerAlt = function () {
  var ev = FE.currentEvent();
  var r = FE.suggestAlt(ev);
  if (r.won) {
    UI.modal('<h3>Switched the deal</h3><p class="kv">They weren’t sold on the ' + esc(FE.MODELS[ev.car.model].m) + ' — but they left in the ' + esc(FE.carName(r.car)) + '.</p>' +
      '<div class="card"><div class="row kv"><span>Sold at</span><b>' + M(r.sale.price) + '</b></div>' +
      '<div class="row kv"><span>Front + back</span><b>' + M(r.sale.front + r.sale.back) + '</b></div></div>' +
      '<button onclick="UI.closeModal();FE.advanceEvent();UI.renderAll();UI.nextEvent()">Next</button>');
  } else {
    UI.modal('<h3>No dice</h3><p class="kv">They only wanted that one. Gone.</p>' +
      '<button onclick="UI.closeModal();FE.advanceEvent();UI.renderAll();UI.nextEvent()">Next</button>');
  }
};

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

/* ---------- office ---------- */
UI.toOffice = function () { FE.enterOffice(); renderAll(); UI.tab('email'); toast('Post’s in. Deal with the desk, then close the week.'); };

function buildProgress(startWk, dueWk, nowWk, label) {
  var total = Math.max(1, dueWk - startWk);
  var done = Math.min(total, nowWk - startWk);
  var pct = Math.round(done / total * 100);
  var left = Math.max(0, dueWk - nowWk);
  return '<div class="kv"><span class="build-tag">🏗 ' + label + '</span> — ' + (left <= 0 ? 'finishing this week' : left + ' wk' + (left === 1 ? '' : 's') + ' left') + '</div>' +
    '<div class="progressbar"><i class="warn" style="width:' + pct + '%"></i></div>';
}
UI.openOffice = function () {
  var g = G();
  var h = '<h3>The office</h3>';
  // stocking finance facility
  var drawn = FE.financeDrawn(), lim = FE.financeLimit();
  if (FE.financeEnabled()) {
    var head = FE.financeHeadroom();
    var pct = lim ? Math.min(100, Math.round(drawn / lim * 100)) : 0;
    h += '<div class="card"><b>Stocking finance</b>' +
      '<div class="row kv"><span>Credit limit</span><b>' + M(lim) + '</b></div>' +
      '<div class="row kv"><span>Drawn now</span><b class="' + (drawn > 0 ? 'warn' : '') + '">' + M(drawn) + '</b></div>' +
      '<div class="row kv"><span>Headroom to spend</span><b>' + M(head) + '</b></div>' +
      '<div class="row kv"><span>Interest rate</span><b>' + (Math.round(FE.financeApr() * 1000) / 10) + '% APR</b></div>' +
      '<div class="progressbar"><i class="' + (pct > 80 ? 'warn' : '') + '" style="width:' + pct + '%"></i></div>' +
      '<div class="kv muted small">Limit scales with net worth (max ' + M(FE.STOCK_FINANCE.maxLimit) + '); the rate eases as you establish. Interest on the drawn balance only, weekly, on top of floorplan.</div>' +
      (drawn <= 0 ? '<div class="btnrow"><button class="sec" onclick="UI.financeToggle(false)">Close facility</button></div>' : '') +
      '</div>';
  } else {
    h += '<div class="card"><b>Stocking finance</b><div class="kv">A credit facility to buy stock beyond your cash — up to ' + M(FE.STOCK_FINANCE.maxLimit) + ', scaled to your net worth. Rate is higher for a new dealer (~' + (Math.round(FE.STOCK_FINANCE.aprStart * 1000) / 10) + '% APR) and eases as you grow. <span class="warn">Leverage cuts both ways: turn stock fast and it pays; sit on it and interest bites.</span></div>' +
      '<div class="btnrow"><button onclick="UI.financeToggle(true)">Open a facility</button></div></div>';
  }
  // ads
  if (g.week >= 5) {
    h += '<div class="card"><b>Advertising</b><div class="btnrow">';
    FE.AD_TIERS.forEach(function (t, i) {
      h += '<button class="' + (g.adTier === i ? '' : 'sec') + '" onclick="FE.setAds(' + i + ');UI.openOffice()">' + t.name + '<br><span class="small">' + M(t.cost) + '/wk</span></button>';
    });
    h += '</div></div>';
  } else {
    h += '<div class="card kv"><b>Advertising</b> — fixed while you find your feet (tiers unlock week 5).</div>';
  }
  // franchise
  if (g.week >= FE.FRANCHISE.unlockWk) {
    if (!g.franchise) {
      h += '<div class="card"><b>' + g.brand + ' franchise</b><div class="kv">New cars on your forecourt. ' + M(FE.FRANCHISE.fee) + '/yr, minimum ' + FE.FRANCHISE.minSlots + ' pitches, target ' + FE.FRANCHISE.targetPerSlot + ' units per pitch per year. <span class="warn">Commit properly or not at all — a token effort underperforms staying used-only.</span></div>' +
        '<div class="btnrow"><button onclick="UI.signFranchiseUI()">Sign up</button></div></div>';
    } else if (g.franchise.live === false) {
      h += '<div class="card"><b>' + g.brand + ' franchise</b>' + buildProgress(g.franchise.signedWk, g.franchise.liveWk, g.week, 'Brand corner fit-out') + '<div class="kv muted">Order window opens week ' + g.franchise.liveWk + '.</div></div>';
    } else {
      var F = g.franchise;
      var weeksIn = g.week - F.qStartWk;
      var target = Math.round(F.slots * FE.FRANCHISE.targetPerSlot / 4 * Math.min(Math.max(weeksIn, 1) / 13, 1));
      var pct = target ? Math.min(100, Math.round(F.qUnits / Math.max(F.slots * 2, 1) * 100)) : 0;
      h += '<div class="card"><b>Franchise — quarter progress</b>' +
        '<div class="kv">' + F.qUnits + ' of ' + (F.slots * 2) + ' this quarter · ' + (13 - weeksIn) + ' wk' + (13 - weeksIn === 1 ? '' : 's') + ' left</div>' +
        '<div class="progressbar"><i class="' + (pct >= 97 ? 'good' : pct >= 60 ? '' : 'warn') + '" style="width:' + pct + '%"></i></div>' +
        '<div class="btnrow"><button onclick="UI.orderWindow()">Order window</button></div></div>';
    }
  }
  // departments
  FE.DEPARTMENTS.forEach(function (d) {
    if (g.dept[d.id]) {
      if (g.week >= g.dept[d.id]) h += '<div class="card kv"><b>' + d.name + '</b> — live. ' + M(d.weekly) + '/wk coming in.</div>';
      else h += '<div class="card"><b>' + d.name + '</b>' + buildProgress(g.dept[d.id] - d.buildWks, g.dept[d.id], g.week, 'Construction') + '<div class="kv muted">Capacity down while the builders are in.</div></div>';
    } else {
      h += '<div class="card"><b>' + d.name + '</b> <span class="tag">' + M(d.cost) + '</span><div class="kv">' + d.blurb + ' <span class="muted">Build: ' + d.buildWks + ' wk.</span></div>' +
        '<div class="btnrow"><button class="sec" onclick="UI.buildDeptUI(\'' + d.id + '\')">Build</button></div></div>';
    }
  });
  h += '<div class="card kv"><b>Smart repair · Valeting bay</b> — the builders say "after the beta".</div>';
  // expansion
  FE.EXPANSIONS.forEach(function (x) {
    if (g.expansionsDone.indexOf(x.id) >= 0) return;
    var pend = null;
    g.pendingBuilds.forEach(function (b) { if (b.id === x.id) pend = b; });
    if (pend) {
      h += '<div class="card"><b>' + x.name + '</b>' + buildProgress(pend.startedWk, pend.dueWk, g.week, 'Groundworks') + '<div class="kv muted">+' + x.slots + ' pitches open week ' + pend.dueWk + '.</div></div>';
    } else {
      h += '<div class="card"><b>' + x.name + '</b> <span class="tag">' + M(x.cost) + '</span><div class="kv">+' + x.slots + ' pitches, utilities +' + M(x.util) + '/wk <span class="muted">Build: ' + x.buildWks + ' wk.</span></div>' +
        '<div class="btnrow"><button class="sec" onclick="UI.expandUI(\'' + x.id + '\')">Buy the land</button></div></div>';
    }
  });
  // salary restructure
  h += '<div class="card"><b>Pay structure</b><div class="kv">Currently: ' + FE.SALARIES[g.salary].name + '. Once a year you can change it — the team never thanks you.</div><div class="btnrow">';
  FE.SALARIES.forEach(function (s, i) {
    if (i !== g.salary) h += '<button class="sec small" onclick="UI.salaryUI(' + i + ')">' + s.name + '</button>';
  });
  h += '</div></div>';
  h += '<button class="ghost" onclick="UI.closeModal()">Back to it</button>';
  UI.modal(h);
};
UI.financeToggle = function (on) {
  var r = FE.enableFinance(on);
  toast(r.ok ? (on ? 'Stocking finance live — you can now buy on credit.' : 'Facility closed.') : r.msg);
  UI.openOffice(); renderHUD();
};
UI.signFranchiseUI = function () {
  var r = FE.signFranchise(FE.FRANCHISE.minSlots);
  toast(r.ok ? 'Franchise signed — brand corner being fitted out.' : r.msg);
  UI.openOffice();
};
UI.buildDeptUI = function (id) {
  var r = FE.buildDept(id);
  toast(r.ok ? 'Diggers in. Site disrupted this week.' : (r.msg || 'No.'));
  UI.openOffice(); renderHUD();
};
UI.expandUI = function (id) {
  var r = FE.buyExpansion(id);
  toast(r.ok ? 'Groundworks started — pitches open week ' + r.dueWk + '.' : (r.msg || 'No.'));
  UI.openOffice(); renderHUD();
};
UI.salaryUI = function (i) {
  if (!confirm('Restructure everyone onto "' + FE.SALARIES[i].name + '"? Morale will take a knock, and that’s your change for the year.')) return;
  var r = FE.changeSalary(i);
  toast(r.ok ? 'Done. The kitchen’s gone quiet.' : r.msg);
  UI.openOffice();
};

UI.orderWindow = function () {
  var g = G();
  if (!g.franchise) return;
  var free = FE.freePitches();
  var h = '<h3>' + g.brand + ' — manufacturer order window</h3>' +
    '<p class="kv muted small">Your cost is 92% of list. Factory stock lands next week; a factory order takes 8–14 weeks. New cars fly in March and September and sit like stones the rest of the year — time your orders.</p>' +
    '<div class="card kv" style="margin:6px 0"><b>' + free + '</b> free pitch' + (free === 1 ? '' : 'es') + ' (cars already on order are reserved).</div>';
  var models = [];
  FE.MODELS.forEach(function (m, i) { if (m.b === g.brand) models.push(i); });
  h += '<select id="ordModel">';
  models.forEach(function (mi) {
    h += '<option value="' + mi + '">' + FE.MODELS[mi].m + ' — list ' + M(FE.MODELS[mi].np) + '</option>';
  });
  h += '</select><div style="height:8px"></div><select id="ordTrim">';
  FE.TRIMS.forEach(function (t, i) { h += '<option value="' + i + '"' + (i === 1 ? ' selected' : '') + '>' + t.t + ' trim</option>'; });
  h += '</select><div style="height:8px"></div><select id="ordColour">';
  FE.COLOURS.forEach(function (c, i) { h += '<option value="' + i + '">' + c.c + '</option>'; });
  h += '</select><div style="height:8px"></div>' +
    '<label class="kv" style="display:block;margin-bottom:4px">How many?</label><select id="ordQty">';
  [1, 2, 3, 5, 8, 12, 20, 30].forEach(function (q) {
    if (q <= Math.max(1, free)) h += '<option value="' + q + '"' + (q === 3 ? ' selected' : '') + '>' + q + ' car' + (q === 1 ? '' : 's') + '</option>';
  });
  h += '</select>';
  h += '<div class="btnrow"><button onclick="UI.orderGo(true)">Factory stock — next week</button>' +
    '<button class="sec" onclick="UI.orderGo(false)">Factory order — 8–14 wks</button></div>';
  if (g.orders.length) {
    h += '<div class="card kv"><b>' + g.orders.length + ' on order</b> — ' + g.orders.map(function (o) { return FE.MODELS[o.model].m + ' (wk ' + o.dueWk + ')'; }).join(', ') + '</div>';
  }
  h += '<button class="ghost" onclick="UI.openOffice()">Back</button>';
  UI.modal(h);
};
UI.orderGo = function (express) {
  var qty = parseInt(($('ordQty') || {}).value, 10) || 1;
  var r = FE.orderNewCars(parseInt($('ordModel').value, 10), parseInt($('ordColour').value, 10), parseInt($('ordTrim').value, 10), express, qty);
  if (r.ok) toast(r.placed + ' car' + (r.placed === 1 ? '' : 's') + ' ordered — arriving week ' + r.dueWk + '.' + (r.short ? ' (' + r.short + ')' : ''));
  else toast(r.msg);
  if (r.ok) UI.orderWindow();
};

/* ---------- staff tab ---------- */
function renderStaff() {
  var g = G(), h = '';
  var maxS = FE.SITES[g.site].maxStaff;
  h += '<div class="card kv"><b>Headcount ' + g.staff.length + '/' + maxS + '</b> — minimum 2 to run a floor properly. The GSM (you) manages; you don’t sell.' + (g.week === 1 && g.candidatePool && g.candidatePool.length ? ' <span class="muted">More candidates arrive next week.</span>' : '') + '</div>';
  g.staff.forEach(function (st) {
    var fni = st.totUnits ? Math.round(100 * st.fniDeals / st.totUnits) : 0;
    var moraleTxt = st.morale > 1.05 ? 'buzzing' : st.morale > 0.9 ? 'fine' : st.morale > 0.75 ? 'flat' : 'mutinous';
    h += '<div class="card"><div class="row"><b>' + esc(st.name) + '</b><span class="kv">' + (st.offUntil > g.week ? '<span class="warn">on a course</span>' : st.onHoliday === g.week ? '<span class="warn">on holiday</span>' : st.leaving ? '<span class="danger">leaving wk ' + st.leaving + '</span>' : 'on the floor') + '</span></div>' +
      '<div class="row kv"><span>This week: <b>' + st.lastUnits + '</b> units · ' + M(Math.round(st.lastGross)) + ' gross</span><span>F&amp;I ' + fni + '%</span></div>' +
      '<div class="row kv"><span>Career: ' + st.totUnits + ' units</span><span>Morale: ' + moraleTxt + '</span></div>' +
      '<div class="btnrow"><button class="sec" onclick="UI.trainUI(\'' + st.id + '\')">Send on a course</button>' +
      '<button class="red" onclick="UI.sackUI(\'' + st.id + '\')">Let go</button></div></div>';
  });
  if (g.staff.length < maxS && g.candidates.length) {
    h += '<h3 style="margin-top:16px">The agency’s books</h3>';
    g.candidates.forEach(function (cid) {
      var R = null;
      FE.ROSTER.forEach(function (r) { if (r.id === cid) R = r; });
      h += '<div class="card"><div class="row"><b>' + esc(R.name) + '</b><b>' + (R.fee ? M(R.fee) + ' fee' : 'No fee') + '</b></div>' +
        '<div class="kv">' + esc(R.rep) + '</div>' +
        '<div class="btnrow"><button onclick="UI.hireUI(\'' + R.id + '\')">Hire</button></div></div>';
    });
  } else if (g.staff.length >= maxS) {
    h += '<div class="card kv muted">Floor’s full for this site. A bigger premises unlocks more desks.</div>';
  }
  $('content').innerHTML = h;
}
UI.sackUI = function (id) {
  var st = null;
  G().staff.forEach(function (s) { if (s.id === id) st = s; });
  if (!st) return;
  var cost = FE.sackCost(id);
  var below = G().staff.length <= 2;
  UI.modal('<h3>Let ' + esc(st.name) + ' go?</h3>' +
    '<p class="kv">Redundancy: <b>' + M(cost) + '</b> (notice pay). The rest of the team’s morale will dip a little.' +
    (below ? ' <span class="warn">This drops you below two on the floor — capacity will suffer until you rehire.</span>' : '') + '</p>' +
    '<div class="btnrow"><button class="red" onclick="UI.sackGo(\'' + id + '\')">Let them go</button>' +
    '<button class="ghost" onclick="UI.closeModal()">Keep them</button></div>');
};
UI.sackGo = function (id) {
  var r = FE.sackStaff(id);
  UI.closeModal();
  toast(r.ok ? 'Done. Paid ' + M(r.redundancy) + ' redundancy.' : r.msg);
  renderTab(); renderHUD();
};
UI.hireUI = function (id) {
  var r = FE.hire(id);
  toast(r.ok ? 'On the floor Monday.' : r.msg);
  renderTab();
};
UI.trainUI = function (staffId) {
  var st = null;
  G().staff.forEach(function (s) { if (s.id === staffId) st = s; });
  var h = '<h3>Courses — ' + esc(st.name) + '</h3><p class="kv muted small">Training costs money and takes them off the floor. The player who trains in January is playing well.</p>';
  FE.TRAINING.forEach(function (c) {
    var done = st.trained[c.id];
    h += '<div class="card"><div class="row"><b>' + c.name + '</b><b>' + M(c.cost) + '</b></div>' +
      '<div class="kv">' + c.fx + ' · ' + (c.weeks === 1 ? '1 week' : '3 days') + ' off the floor</div>' +
      '<div class="btnrow">' + (done ? '<button disabled>Completed</button>' : '<button class="sec" onclick="UI.trainGo(\'' + staffId + '\',\'' + c.id + '\')">Book it</button>') + '</div></div>';
  });
  h += '<button class="ghost" onclick="UI.closeModal()">Back</button>';
  UI.modal(h);
};
UI.trainGo = function (staffId, courseId) {
  var r = FE.train(staffId, courseId);
  toast(r.ok ? 'Booked. They’re off the floor while it runs.' : r.msg);
  if (r.ok) UI.trainUI(staffId);
  renderHUD();
};

/* ---------- reports tab ---------- */
function renderReports() {
  var g = G(), h = '';
  h += '<div class="btnrow" style="margin-top:10px"><button onclick="UI.share()">Share my progress</button></div>';
  if (g.reviews.length) {
    h += '<h3 style="margin:14px 0 4px">Reviews</h3>';
    g.reviews.slice(0, 8).forEach(function (r) {
      h += '<div class="card review"><div class="rstars">' + '★'.repeat(r.stars) + '</div><div class="kv">' + esc(r.text) + '</div></div>';
    });
  }
  if (!g.reports.length) h += '<div class="card kv">No weeks closed yet.</div>';
  g.reports.slice(0, 10).forEach(function (r) {
    h += '<div class="card"><pre class="report">' + reportText(r) + '</pre></div>';
  });
  $('content').innerHTML = h;
}
function pad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
function line(label, val) { return label + pad(val, 29 - label.length) + '\n'; }
function reportText(r) {
  var t = 'WEEK ' + r.wk + ' — ' + r.mo.toUpperCase() + ', YEAR ' + r.yr + '\n';
  t += '─────────────────────────────\n';
  t += line('Units sold', r.units);
  t += line('Front-end gross', M(r.front));
  t += line('Back-end gross', M(r.back));
  if (r.financeComm) t += line('  of which finance', M(r.financeComm));
  t += line('Total gross', M(r.gross));
  if (r.units) t += line('Finance penetration', Math.round((r.financed || 0) / r.units * 100) + '%');
  t += '\n';
  var c = r.costs;
  if (c.salaries) t += line('Staff salaries', '-' + M(c.salaries));
  if (c.commission) t += line('Commission', '-' + M(c.commission));
  t += line('Utilities', '-' + M(c.utilities));
  if (c.prep) t += line('Prep', '-' + M(c.prep));
  if (c.advertising) t += line('Advertising', '-' + M(c.advertising));
  if (c.floorplan) t += line('Floorplan interest', '-' + M(c.floorplan));
  if (c.stockfinance) t += line('Stocking finance int.', '-' + M(c.stockfinance));
  t += line('Insurance / misc', '-' + M(c.insurance + (c.misc || 0)));
  if (c.training) t += line('Training', '-' + M(c.training));
  if (c.comebacks) t += line('Comebacks', '-' + M(c.comebacks));
  if (c.franchise) t += line('Franchise fee', '-' + M(c.franchise));
  if (c.fines) t += line('FINES', '-' + M(c.fines));
  if (r.deptIncome) t += line('Service dept', '+' + M(r.deptIncome));
  if (r.tradeNet) t += line('Trade-outs (net)', (r.tradeNet >= 0 ? '+' : '-') + M(Math.abs(r.tradeNet)));
  t += '─────────────────────────────\n';
  t += line(r.net >= 0 ? 'NET PROFIT' : 'NET LOSS', M(r.net));
  if (r.stockBought) t += line('Stock bought', M(r.stockBought));
  if (r.losses.length) {
    t += '\nLOSSES THIS WEEK\n';
    r.losses.forEach(function (l) {
      t += l.name + '  ' + M(l.amt) + ' ⚠\n  ' + l.why + '\n';
    });
  }
  if (r.floorplanTop.length && r.floorplanTop[0].amt > 100) {
    t += '\nDEAREST TO HOLD: ' + r.floorplanTop.map(function (o) { return o.name + ' ' + M(o.amt); }).join(' · ') + '\n';
  }
  t += '\n';
  t += line('Stock', r.stock + ' units (' + r.slots + ' pitches)');
  t += line('Avg days in stock', r.avgDays + (r.avgDays > 45 ? '  ⚠' : ''));
  if (r.ageing) t += line('Ageing stock (60+)', r.ageing + ' units ⚠');
  t += line('Headcount', r.headcount);
  t += line('Star rating', r.stars + ' ★');
  t += line('Cash', M(r.cash));
  if (r.financeDrawn) t += line('Finance drawn', M(r.financeDrawn) + ' @ ' + r.financeApr + '%');
  return t;
}

/* ---------- week close ---------- */
UI.startNext = function () {
  FE.nextWeek();
  renderAll();
  UI.tab('site');
  toast('New week. Fresh auction list in your inbox.');
};
// One "skip / finish the week" path used by the banner and the burger menu.
UI.skipWeek = function () {
  var g = G();
  var full = g.phase === 'auction';   // skipping before you've opened up = whole week
  var msg = full
    ? 'Let the staff run the whole week? They take the fair and cheeky offers, decline the silly ones, and handle the post conservatively — about 75% of a managed week.'
    : 'Skip the rest of the week and go to the report? Staff finish off anything you haven’t handled.';
  if (!confirm(msg)) return;
  UI.closeModal();
  var r = FE.skipWeek();
  renderAll();
  if (r && r.report) UI.modal('<h3>' + (full ? 'While you were away…' : 'End of week report') + '</h3><pre class="report">' + reportText(r.report) + '</pre>' +
    '<div class="btnrow"><button onclick="UI.closeModal();UI.startNext()">Start week ' + G().week + '</button>' +
    '<button class="sec" onclick="UI.closeModal();UI.renderAll()">Sit with it</button></div>');
  if (r && r.dead) setTimeout(showGameOver, 400);
};
UI.skipWeekUI = function () { UI.closeModal(); UI.skipWeek(); };

/* ---------- share ---------- */
UI.share = function () {
  var txt = FE.shareText();
  var done = function () { toast('Copied. Paste it in the group chat.'); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { sharePrompt(txt); });
  else sharePrompt(txt);
};
function sharePrompt(txt) {
  UI.modal('<h3>Your progress card</h3><pre class="report">' + esc(txt) + '</pre><button onclick="UI.closeModal()">Close</button>');
}

/* ---------- game over ---------- */
function showGameOver() {
  var g = G();
  UI.modal('<h3>The bank has called it</h3>' +
    '<p class="kv">Cash: <b class="danger">' + M(g.cash) + '</b>. The overdraft is closed, the auction account is frozen, and somewhere your aunt is shaking her head.</p>' +
    '<p class="kv">You lasted <b>' + g.week + ' weeks</b> and sold <b>' + g.totals.units + ' cars</b>.</p>' +
    '<div class="btnrow"><button class="sec" onclick="UI.share()">Share the wreckage</button>' +
    '<button class="red" onclick="UI.restart()">Start again</button></div>', true);
}
UI.restart = function () {
  FE.wipe();
  location.reload();
};

/* ---------- gear menu ---------- */
UI.gearMenu = function () {
  UI.modal('<h3>Manager’s drawer</h3>' +
    '<div class="btnrow" style="flex-direction:column">' +
    '<button class="sec" onclick="UI.closeModal();UI.share()">Share my progress</button>' +
    '<button class="sec" onclick="UI.skipWeekUI()">Skip this week (staff run it)</button>' +
    '<button class="sec" onclick="UI.helpUI()">How this works</button>' +
    '<button class="sec" onclick="UI.closeModal();UI.startTutorial(false)">Replay tutorial</button>' +
    '<button class="red" onclick="UI.confirmRestart()">Abandon career</button></div>' +
    '<p class="kv muted small" style="margin-top:10px">Beta build. Saves locally on this device, automatically. One game week per sitting is the intended pace — the app version will run a real day per week.</p>' +
    '<button class="ghost" onclick="UI.closeModal()">Close</button>');
};
UI.confirmRestart = function () {
  if (confirm('Abandon this career and wipe the save?')) UI.restart();
};
UI.helpUI = function () {
  UI.modal('<h3>How this works</h3>' +
    '<p class="kv">Each week has three blocks: <b>Auction</b> (buy stock — 20 fresh lots, gone tomorrow), <b>Showroom</b> (offers, part-exchanges, prep bills), and <b>Office</b> (post, fines, franchise, then close the week).</p>' +
    '<p class="kv">The metric that kills dealerships is <b>days in stock</b>. Keep the average under 45. Cars over 60 days gather dust; over 90 you must face them.</p>' +
    '<p class="kv">Watch the hold cost on every stock card — funding stock costs real money every week it sits.</p>' +
    '<p class="kv">Everything else you learn the hard way. That’s the game.</p>' +
    '<button onclick="UI.closeModal()">Back</button>');
};

/* ---------- modal & toast plumbing ---------- */
UI.modal = function (html, sticky) {
  var ov = $('overlay');
  ov.classList.remove('hidden');
  ov.dataset.sticky = sticky ? '1' : '';
  ov.querySelector('.sheet').innerHTML = html;
};
UI.closeModal = function () {
  $('overlay').classList.add('hidden');
  // whatever the modal changed (purchases, prices, moves), reflect it behind
  if (G() && !$('main').classList.contains('hidden')) { renderHUD(); renderTab(); }
};
function toast(msg) {
  var t = document.createElement('div');
  t.className = 'feed-toast';
  t.innerHTML = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 3500);
}
UI.toast = toast;

document.addEventListener('DOMContentLoaded', function () {
  $('overlay').addEventListener('click', function (e) {
    if (e.target === this && !this.dataset.sticky) {
      // don't allow dismissing mid-event popups by tapping outside — decisions must be made
      var g = G();
      if (g && g.phase === 'showroom' && FE.eventsLeft() > 0) return;
      UI.closeModal();
    }
  });
  UI.boot();
});

})();
