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
  if (g && !g.dead) { resumeGame(); }
  else {
    $('screen-boot').classList.remove('hidden');
    $('bootContinue').classList.toggle('hidden', !g || !!g.dead);
    if (!g) bootDiagnostic();
  }
  startCloud();
};
/* If a profile was minted on this device but there is no career behind it,
   the player has been here before and the save is not where it should be.
   Saying so — and naming the likely reasons — beats a blank New career
   button, which reads as "the game ate it". */
function bootDiagnostic() {
  var el = $('bootDiag');
  if (!el) return;
  var p = FE.playedHereBefore && FE.playedHereBefore();
  if (!p) return;
  var when = p.created ? new Date(p.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  el.classList.remove('hidden');
  el.innerHTML = '<div class="card boot-diag"><b>⚠️ You have played on this device before</b>' +
    '<div class="kv">' + (p.name ? esc(p.name) + '’s profile is still here' : 'A profile is still here') +
    (when ? ', created ' + when : '') + ', but there is no career saved against it.</div>' +
    '<div class="kv muted small">Saves live in this browser, on this device. The usual reasons a career is not here:' +
    '<br>• <b>You are in a different browser</b> — an installed app and a Safari tab have separate storage on iPhone. Try the other one.' +
    '<br>• <b>Browser data was cleared</b>, or Safari evicted it after a week away.' +
    '<br>• <b>A private window</b> — nothing survives closing it.' +
    '<br>Site updates and cache changes do <b>not</b> touch saves.</div>' +
    '<div class="btnrow"><button class="sec" onclick="UI.importUI()">Paste a save code</button></div></div>';
}
/* The cloud connects in the background — boot never waits on the network, so a
   flat signal costs nothing but the mirror. When it does connect and finds a
   save that disagrees with this device, the player is asked; we never pick. */
function startCloud() {
  var c = window.FEcloud;
  if (!c) return;
  c.onsync = function (d) { UI.cloudChoose(d, false); };
  c.on(function () { try { if (G()) renderHUD(); } catch (e) {} });
  try { c.init(); } catch (e) {}
}
// Every path back into a running career goes through here, so the real-time
// catch-up runs whether the player auto-resumed or tapped Continue.
function resumeGame() {
  enterMain();
  var d = FE.offlineProgress();
  if (d) { renderAll(); welcomeBack(d); }
}
UI.newGameFlow = function () {
  if (G() && !confirm('Start a fresh career? Your current save will be wiped.')) return;
  setup = { brand: null, site: null, salary: null, step: 1 };
  $('screen-boot').classList.add('hidden');
  renderSetup();
};
UI.continueGame = function () {
  $('screen-boot').classList.add('hidden');
  resumeGame();
};
// digest of the weeks that ran themselves while the tab was shut
function welcomeBack(d) {
  var g = G();
  if (d.dead) {
    UI.modal('<h3>💀 It went under while you were away</h3>' +
      '<p class="kv">The bank pulled the plug in week ' + g.week + '. ' + d.units + ' cars went out but it wasn’t enough.</p>' +
      '<button onclick="UI.closeModal();UI.renderAll()">Face it</button>', true);
    return;
  }
  var pos = d.net >= 0;
  UI.modal('<div class="wb"><div class="wb-badge">☕</div>' +
    '<h3>While you were away</h3>' +
    '<p class="kv muted small">' + d.weeksRun + ' week' + (d.weeksRun === 1 ? '' : 's') + ' traded without you — week ' + d.fromWk + ' to ' + (d.toWk - 1) + '.' +
    (d.skipped ? ' <span class="muted">(' + d.skipped + ' more week' + (d.skipped === 1 ? '' : 's') + ' of real time went by, but the most that can run unattended is ' + FE.REALTIME.maxWeeks + '.)</span>' : '') + '</p>' +
    '<div class="card">' +
    '<div class="row kv"><span>Cars sold</span><b>' + d.units + '</b></div>' +
    '<div class="row kv"><span>Profit / loss</span><b class="' + (pos ? 'good' : 'danger') + '">' + (pos ? '' : '−') + M(Math.abs(d.net)) + '</b></div>' +
    '<div class="row kv"><span>Cash movement</span><b class="' + (d.cashDelta >= 0 ? 'good' : 'danger') + '">' + (d.cashDelta >= 0 ? '+' : '−') + M(Math.abs(d.cashDelta)) + '</b></div>' +
    '<div class="row kv"><span>Star rating</span><b class="' + (d.starDelta >= 0 ? 'good' : 'danger') + '">' + (d.starDelta > 0 ? '+' : '') + d.starDelta.toFixed(1) + '</b></div>' +
    '</div>' +
    (d.notes.length ? '<p class="kv small">' + esc(d.notes.join(' ')) + '</p>' : '') +
    (d.fines.length ? '<p class="kv danger small">Fines while you were out: ' + esc(d.fines.join(', ')) + '</p>' : '') +
    (d.noStaff
      ? '<p class="kv danger small">There was nobody on the floor. The bills came in anyway — hire someone before you go again.</p>'
      : (d.noStock
        ? '<p class="kv warn small">The pitch ran dry — there was nothing left to sell. Get to the auction house.</p>'
        : '<p class="kv muted small">They took the deals as offered — nobody countered, nobody chased. The post is waiting in your inbox.</p>')) +
    '<div class="btnrow"><button onclick="UI.closeModal();UI.tab(\'email\')">Read the post</button>' +
    '<button class="sec" onclick="UI.closeModal();UI.renderAll()">Get back to it</button></div></div>', true);
}

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
    { sel: null, pos: 'center', text: '<b>The job, in one line:</b> buy a car for less than you can sell it for, and sell it before it eats the difference.<br><br>Everything else in here is detail on those two halves.' },
    { sel: '#cash', text: 'Your <b>live cash position</b>. It moves the instant a car sells or a bill lands. Cars are bought with it, but so are wages, prep and training — run out and it stops mattering how much stock you own.', pos: 'below' },
    { sel: '#banner', text: 'The week runs in three blocks: <b>Auction</b> (buy) → <b>Showroom</b> (sell) → <b>Office</b> (pay for it all). This banner always tells you what is next, so you can never be lost.', pos: 'below' },
    { sel: '#tab-stock', text: '<b>Stock</b>, and the number that kills dealerships: <b>days in stock</b>. Every day a car sits you pay interest on it and it quietly loses value. Past about 45 days the profit is gone; past 90 you are selling at a loss and do not know it yet.', pos: 'above' },
    { sel: '#tab-site', text: 'Your <b>forecourt</b>. Tap a car to see what it owes you, or an empty pitch to place stock. An empty pitch earns nothing — a full one you cannot shift costs you.', pos: 'above' },
    { sel: '#tab-staff', text: '<b>Staff</b>. More sellers means more sold — genuinely, it is wired that way — but they are paid whether they sell or not. Hire from day one.', pos: 'above' },
    { sel: '#tab-computer', text: 'The <b>office computer</b>: email, the auction house, banking, property, recruitment, factory orders. If you are looking for something and it is not a tab, it is in here.', pos: 'above' },
    { sel: '#tab-reports', text: '<b>Reports</b> — the weekly P&amp;L. Worth reading even when the week felt fine; the bills that sink you are the quiet ones.', pos: 'above' },
    { sel: null, pos: 'center', last: true, text: 'That is everything. You will get a nudge from me the first time something important happens, so you can stop reading and start buying.<br><br>Go and fill that forecourt.' }
  ];
}

UI.startTutorial = function (firstRun) {
  // replaying from Settings while the tour is already up would stack overlays
  var open = document.getElementById('tutOverlay');
  if (open) open.remove();
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
var skipTickerStarted = false;
function enterMain() {
  $('main').classList.remove('hidden');
  shownCash = G().cash;
  $('cash').textContent = M(Math.round(shownCash));
  renderAll();
  requestAnimationFrame(cashTick);
  if (!skipTickerStarted) { skipTickerStarted = true; setInterval(skipTick, 1000); }
  if (G().dead) showGameOver();
}

/* One tip at a time, under the banner, dismissible. Deliberately not a modal:
   these fire mid-flow and a dialog would be an interruption rather than help. */
/* Silent save failure is how a career actually disappears, so this is a bar
   that stays put until it is fixed — not a toast that slides away unseen. */
function renderSaveAlert() {
  var el = $('saveAlert');
  if (!el) return;
  var hz = FE.saveHealth ? FE.saveHealth() : { ok: true };
  if (hz.ok) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = '<div class="save-alert">' +
    '<b>⚠️ This career is not being saved</b>' +
    '<div class="kv">' + esc(hz.reason) + ' Everything since week ' + hz.failedAt +
    ' only exists in this tab — close it and that progress is gone.</div>' +
    '<div class="btnrow"><button class="grn sm" onclick="UI.exportUI()">Copy save code out</button>' +
    '<button class="sec sm" onclick="UI.saveRetry()">Try again</button></div></div>';
}
UI.saveRetry = function () {
  var ok = FE.save();
  renderSaveAlert();
  toast(ok ? 'Saved — you are safe again.' : 'Still refusing. Copy the save code out before you close this tab.');
};
function renderCoach() {
  var el = $('coach');
  if (!el) return;
  var c = FE.coachDue && FE.coachDue();
  if (!c) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = '<div class="coach-card">' +
    '<button class="coach-x" onclick="UI.coachDismiss(\'' + c.id + '\')" aria-label="Got it">✕</button>' +
    '<b>💡 ' + esc(c.title) + '</b>' +
    '<div class="kv">' + c.body + '</div>' +
    '<button class="sec sm" onclick="UI.coachDismiss(\'' + c.id + '\')">Got it</button></div>';
}
UI.coachDismiss = function (id) {
  FE.coachShown(id);
  renderCoach();
  Juice.sound('tap');
};
function renderAll() {
  if (!G()) return;
  renderHUD(); renderBanner(); renderTab();
  renderSaveAlert();
  renderCoach();
}
UI.renderAll = renderAll;

/* Half stars used to be U+2BE8 (LEFT HALF BLACK STAR), which almost no font
   ships — iOS drew a tofu box. Built from ★ and ☆ instead, which are
   universal, with the half made by clipping a filled star over an empty one. */
function starHTML(v) {
  var full = Math.floor(v), half = (v - full) >= 0.5, out = '';
  for (var i = 0; i < 5; i++) {
    if (i < full) out += '<i class="st on">★</i>';
    else if (i === full && half) out += '<i class="st half">☆<b>★</b></i>';
    else out += '<i class="st">☆</i>';
  }
  return out;
}
/* The Computer tab badge counted unread email only, so a waiting game reward
   was invisible from the main screen. It now counts anything worth opening
   the computer for. */
function computerBadge() {
  var n = FE.unreadCount();
  return n + gamesAvailable();
}
function renderHUD() {
  var g = G(), s = FE.SEASON[(g.week - 1) % 52];
  var yr = Math.ceil(g.week / 52);
  var sale = FE.saleActive();
  var plate = !!s.plate;
  $('hudWeek').innerHTML =
    '<span class="hw-wk">Wk ' + g.week + '</span>' +
    '<span class="hw-mo' + (plate ? ' plate' : '') + '">' + s.mo + '</span>' +
    '<span class="hw-yr">Y' + yr + '</span>' +
    (sale ? '<span class="sale-chip">SUMMER SALE</span>' : (plate ? '<span class="hw-flag">PLATE</span>' : '')) +
    '<span class="cal-cue" aria-hidden="true">▾</span>';

  var st = Math.round(g.stars * 10) / 10;
  var sEl = $('hudStars');
  sEl.innerHTML = starHTML(g.stars) + ' ' + st.toFixed(1);
  sEl.className = 'stars ' + (g.stars >= 4.2 ? 'good' : g.stars >= 3.5 ? '' : 'low');

  // stock at a glance — the number that decides whether you should be buying
  var onPitch = g.stock.filter(function (c) { return c.status === 'stock' && c.arrived !== false; }).length;
  var transit = g.stock.filter(function (c) { return c.status === 'stock' && c.arrived === false; }).length;
  var aged = g.stock.filter(function (c) { return c.status === 'stock' && FE.daysIn(c) >= 60; }).length;
  var sp = $('hudStock');
  sp.innerHTML = '<b>' + onPitch + '</b> in stock' + (transit ? ' <span class="muted">+' + transit + '</span>' : '') +
    (aged ? ' <span class="hud-aged" title="60+ days">' + aged + ' aged</span>' : '');

  var nw = FE.netWorth();
  $('hudNet').innerHTML = 'Net worth <b>' + M(nw) + '</b>';
  $('cash').classList.toggle('neg', g.cash < 0);
  $('cashLabel').textContent = g.cash < 0 ? 'Overdrawn' : 'Cash';

  var badge = computerBadge();
  $('emailBadge').textContent = badge;
  $('emailBadge').style.display = badge ? '' : 'none';
}

function cashTick() {
  var g = G();
  if (g) {
    var diff = g.cash - shownCash;
    // snap on a big jump (buying a batch of stock), otherwise ease — the old
    // rate crawled and left the figure sitting in its flash colour for seconds
    if (Math.abs(diff) > 120000) shownCash = g.cash - Math.sign(diff) * 60000;
    if (Math.abs(diff) > 1) {
      shownCash += diff * 0.26 + (diff > 0 ? 1 : -1);
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
  var remain = FE.skipRemainMs();
  var onCd = remain > 0;
  var PH = ['auction', 'showroom', 'office'];
  var at = PH.indexOf(g.phase);
  // the week as three steps, so you can always see where you are in it
  var stepper = '<div class="steps">' + ['Auction', 'Showroom', 'Office'].map(function (n, i) {
    var cls = i < at ? 'done' : (i === at ? 'now' : '');
    return '<span class="step ' + cls + '"><i>' + (i < at ? '✓' : (i + 1)) + '</i>' + n + '</span>';
  }).join('') + '</div>';

  var skipBtn = onCd
    ? '<button class="sec sm" disabled>Skip in <span id="skipCountdown">' + fmtMs(remain) + '</span></button>'
    : '<button class="sec sm" onclick="UI.skipWeek()">Skip week</button>';

  if (g.phase === 'auction') {
    h = stepper + '<div class="ph-row">' +
      '<button class="grn ph-go" onclick="UI.toShowroom()">Open the showroom →</button>' +
      '<div class="ph-side"><button class="sec sm" onclick="UI.openAuction()">🔨 Auction · ' + g.lots.length + '</button>' + skipBtn + '</div></div>' +
      '<div class="ph-hint">Buy what you can sell, then open up for the week.</div>';
  } else if (g.phase === 'showroom') {
    var left = FE.eventsLeft();
    h = stepper + '<div class="ph-row">' +
      (left
        ? '<button class="ph-go" onclick="UI.nextEvent()">Next up <span class="ph-count">' + left + '</span></button>'
        : '<button class="grn ph-go" onclick="UI.toOffice()">To the office →</button>') +
      '<div class="ph-side">' + skipBtn + '</div></div>' +
      '<div class="ph-hint">' + (left ? left + ' thing' + (left === 1 ? '' : 's') + ' on the floor.' : 'Floor’s quiet — nothing left this week.') + '</div>';
  } else if (g.phase === 'office') {
    var ack = FE.needsAck().length;
    var closeBtn = onCd
      ? '<button class="grn ph-go" disabled>Closes in <span id="skipCountdown">' + fmtMs(remain) + '</span></button>'
      : '<button class="grn ph-go" onclick="UI.skipWeek()">Close the week →</button>';
    h = stepper + '<div class="ph-row">' + closeBtn +
      '<div class="ph-side"><button class="sec sm" onclick="UI.computer()">💻 Computer</button></div></div>' +
      '<div class="ph-hint">' + (ack ? '<span class="danger">' + ack + ' car' + (ack === 1 ? '' : 's') + ' at 90+ days need acknowledging.</span>' :
        (onCd ? 'Post and paperwork. <a class="pz-link" onclick="Puzzle.hub()">Game while you wait?</a>' : 'Post, paperwork, then close.')) + '</div>';
  } else if (g.phase === 'report') {
    h = '<div class="steps"><span class="step done"><i>✓</i>Week closed</span></div>' +
      '<div class="ph-row"><button class="ph-go" onclick="UI.startNext()">Start week ' + g.week + ' →</button>' +
      '<div class="ph-side"><button class="sec sm" onclick="UI.computer()">💻 Computer</button></div></div>' +
      '<div class="ph-hint">Report filed. Have a look before you push on.</div>';
  }
  $('banner').innerHTML = h;
}
function fmtMs(ms) {
  var s = Math.ceil(ms / 1000), m = Math.floor(s / 60);
  s = s % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
// tick the skip countdown once a second; re-render the banner the moment it frees up
function skipTick() {
  if (!G() || $('overlay') === null) return;
  var el = $('skipCountdown');
  if (el) {
    var remain = FE.skipRemainMs();
    if (remain <= 0) renderBanner();
    else el.textContent = fmtMs(remain);
  }
}

/* ---------- tabs ---------- */
UI.tab = function (t) {
  if (curTab === 'site' && t !== 'site' && window.Scene) Scene.unmount();
  if (curTab === 'email' && t !== 'email') { mailSelectMode = false; mailSelected = {}; }
  curTab = t; moveModeCar = null;
  // email is reached through the computer, so it lights that button
  var TABBTN = { site: 'tab-site', email: 'tab-computer', stock: 'tab-stock', staff: 'tab-staff', reports: 'tab-reports' };
  Object.keys(TABBTN).forEach(function (k) {
    var b = $(TABBTN[k]);
    if (b) b.classList.toggle('on', k === t);
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
/* Net worth only really climbs if you grow the business — trading well on a
   full-but-fixed forecourt creeps along at a fraction of the rate. Tell the
   player which lever is missing rather than leaving the bar to crawl. */
function site2Hint() {
  var g = G();
  var reps = g.reports || [];
  if (reps.length < 4) return 'Trade a few weeks and this will start to move.';
  // average weekly net over the last 8 closed weeks
  var n = Math.min(8, reps.length), sum = 0;
  for (var i = 0; i < n; i++) sum += (reps[i].net || 0);
  var perWk = sum / n;
  var gap = FE.SITE2_TARGET - FE.netWorth();
  if (gap <= 0) return 'Target reached.';
  var free = FE.freePitches();
  var expLeft = FE.EXPANSIONS.filter(function (x) { return g.expansionsDone.indexOf(x.id) < 0; }).length;
  if (perWk <= 50) {
    return 'Not growing at the moment. Net worth climbs on profit — and profit scales with pitches, so buying land is the lever.';
  }
  var wks = Math.ceil(gap / perWk);
  var msg = 'About ' + wks + ' week' + (wks === 1 ? '' : 's') + ' at your recent rate (' + M(Math.round(perWk)) + '/wk).';
  if (expLeft && free < 6) msg += ' More pitches would speed it up — you are running out of room.';
  else if (expLeft) msg += ' Land expansion is the fastest way to move it.';
  return msg;
}
function renderSite() {
  var g = G(), s = FE.SITES[g.site];
  var nw = FE.netWorth();
  var pct = Math.min(100, nw / FE.SITE2_TARGET * 100).toFixed(1);
  var moveHTML = moveModeCar
    ? '<div class="card warn small">Moving the ' + esc(FE.carName(moveModeCar)) + ' — tap a pitch. <button class="ghost small" onclick="UI.cancelMove()">Cancel</button></div>'
    : '';
  // occupied pitches = cars physically on the forecourt (in stock + sold-but-
  // not-yet-collected), matching exactly what the scene draws. Cars still in
  // transit from the auction (arrived === false) sit off-site, so they don't
  // take a pitch yet — they're shown separately as "arriving".
  var usedN = g.stock.filter(function (c) { return (c.status === 'stock' && c.arrived !== false) || c.status === 'sold'; }).length;
  var arrivingN = g.stock.filter(function (c) { return c.status === 'stock' && c.arrived === false; }).length;
  var capN = s.ext + s.int + g.extraSlots;
  var countTxt = usedN + '/' + capN + ' pitches' + (arrivingN ? ' · +' + arrivingN + ' arriving' : '');
  var saleRibbon = FE.saleActive() ? '<div class="scene-sale">☀️ SUMMER SALE ☀️</div>' : '';

  // Build the shell once; on same-tab refreshes just update the dynamic bits and
  // let the canvas keep running (rebuilding innerHTML would restart the scene).
  if (!$('sceneHost')) {
    var h = '<div id="moveBanner">' + moveHTML + '</div>' +
      '<div class="scene-frame"><div id="sceneHost"></div>' +
      '<div id="sceneSale">' + saleRibbon + '</div>' +
      '<div class="scene-caption"><span>' + esc(s.name) + '</span><span id="sceneCount">' + countTxt + '</span></div></div>' +
      '<div class="building-card" onclick="UI.computer()"><div><b>' + esc(s.name) + '</b><div class="kv">Tap for the office computer</div></div><div style="font-size:1.4rem">🏢</div></div>' +
      '<div id="site2card"><b>Site 2 — locked</b> · unlocks at £2M net worth' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="small" id="site2fig">' + M(nw) + ' / ' + M(FE.SITE2_TARGET) + '</div>' +
      '<div class="small muted" id="site2hint">' + site2Hint() + '</div></div>';
    $('content').innerHTML = h;
    Scene.mount($('sceneHost'), { moveMode: !!moveModeCar });
  } else {
    $('moveBanner').innerHTML = moveHTML;
    Scene.setMoveMode(!!moveModeCar);
    var sc = $('sceneCount'); if (sc) sc.textContent = countTxt;
    var ss = $('sceneSale'); if (ss) ss.innerHTML = saleRibbon;
    var sf = $('site2fig'); if (sf) sf.textContent = M(nw) + ' / ' + M(FE.SITE2_TARGET);
    var sh = $('site2hint'); if (sh) sh.innerHTML = site2Hint();
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
    if (stockSort === 'margin') return priceGap(a) - priceGap(b);   // worst-priced first
    return FE.carCost(b) - FE.carCost(a);
  });
  var h = '<div class="btnrow" style="margin-top:10px">' +
    '<button class="' + (stockSort === 'days' ? '' : 'sec') + '" onclick="UI.setStockSort(\'days\')">Days</button>' +
    '<button class="' + (stockSort === 'margin' ? '' : 'sec') + '" onclick="UI.setStockSort(\'margin\')">Pricing</button>' +
    '<button class="' + (stockSort === 'hold' ? '' : 'sec') + '" onclick="UI.setStockSort(\'hold\')">Hold cost</button>' +
    '<button class="' + (stockSort === 'cost' ? '' : 'sec') + '" onclick="UI.setStockSort(\'cost\')">Cost</button></div>';
  if (!list.length) h += '<div class="card kv">Nothing on the pitch. The auction email is waiting.</div>';
  list.forEach(function (c) {
    var d = FE.daysIn(c);
    var cost = FE.carCost(c);
    var gross = c.screen - cost;                 // what the screen price would make
    var gap = priceGap(c);                       // screen vs market, as a %
    var sold = c.status === 'sold';
    var flag = sold ? '<span class="good">SOLD — awaiting collection</span>' :
      d >= 90 ? '<span class="danger">' + d + ' days' + (c.ack90 ? '' : ' — needs decision') + '</span>' :
      d >= 60 ? '<span class="warn">' + d + ' days — getting dusty</span>' : d + ' days';
    var pcls = gap > 4 ? 'over' : gap < -4 ? 'under' : 'at';
    var plabel = gap > 4 ? '+' + gap.toFixed(0) + '% over market' :
                 gap < -4 ? gap.toFixed(0) + '% under market' : 'at market';
    h += '<div class="card stock-row">' +
      '<div class="row" onclick="UI.stockCard(' + c.id + ')"><b>' + esc(FE.carName(c)) + '</b>' +
        '<span class="sr-screen">' + M(c.screen) + '</span></div>' +
      '<div class="kv" onclick="UI.stockCard(' + c.id + ')">' + esc(FE.carDesc(c)) + '</div>' +
      '<div class="sr-figs" onclick="UI.stockCard(' + c.id + ')">' +
        '<span><i>Cost in</i><b>' + M(cost) + '</b></span>' +
        '<span><i>Market</i><b>' + M(c.retail) + '</b></span>' +
        '<span><i>Screen</i><b>' + M(c.screen) + '</b></span>' +
        '<span><i>Gross at screen</i><b class="' + (gross > 800 ? 'good' : gross > 0 ? '' : 'danger') + '">' + M(gross) + '</b></span>' +
      '</div>' +
      '<div class="sr-bar" onclick="UI.stockCard(' + c.id + ')" title="screen against market">' +
        '<i class="' + pcls + '" style="width:' + Math.min(100, Math.abs(gap) * 4) + '%"></i></div>' +
      '<div class="row kv"><span class="sr-tag ' + pcls + '">' + plabel + '</span>' +
        '<span>' + flag + ' · hold <b>' + M(Math.round(c.holdCost)) + '</b></span></div>' +
      (sold ? '' :
        '<div class="sr-price">' +
          '<button class="sec sm" onclick="UI.quickPrice(' + c.id + ',-5)">−5%</button>' +
          '<button class="sec sm" onclick="UI.quickPrice(' + c.id + ',0)">Match market</button>' +
          '<button class="sec sm" onclick="UI.quickPrice(' + c.id + ',5)">+5%</button>' +
          '<button class="sm" onclick="UI.repriceUI(' + c.id + ')">Set…</button>' +
        '</div>') +
      '</div>';
  });
  $('content').innerHTML = h;
}
// screen price against market, as a percentage — the number that decides how fast it moves
function priceGap(c) {
  if (!c.retail) return 0;
  return (c.screen / c.retail - 1) * 100;
}
/* One tap to reprice, but never silently: every route lands on the same
   confirmation showing the old price, the new one and what it does to the
   gross, because a stray tap on a stock list should not reprice a car. */
UI.quickPrice = function (id, pctVsMarket) {
  var c = null;
  G().stock.forEach(function (x) { if (x.id === id) c = x; });
  if (!c) return;
  var target = Math.round(c.retail * (1 + pctVsMarket / 100) / 25) * 25;
  UI.confirmPrice(id, target);
};
UI.confirmPrice = function (id, target) {
  var c = null;
  G().stock.forEach(function (x) { if (x.id === id) c = x; });
  if (!c) return;
  target = Math.max(0, Math.round(target));
  if (target === c.screen) { toast('That is already the screen price.'); return; }
  var cost = FE.carCost(c);
  var gross = target - cost, wasGross = c.screen - cost;
  var gap = c.retail ? (target / c.retail - 1) * 100 : 0;
  var dir = target > c.screen ? 'up' : 'down';
  UI.modal('<div class="danger-ask"><div class="danger-ask-badge">🏷️</div>' +
    '<h3>Price the ' + esc(FE.carName(c)) + ' at ' + M(target) + '?</h3>' +
    '<div class="card">' +
    '<div class="row kv"><span>Screen now</span><b>' + M(c.screen) + '</b></div>' +
    '<div class="row kv"><span>New screen</span><b class="' + (dir === 'up' ? 'good' : 'warn') + '">' + M(target) + '</b></div>' +
    '<div class="row kv"><span>Against market</span><b>' + (gap >= 0 ? '+' : '') + gap.toFixed(1) + '%</b></div>' +
    '<div class="row kv"><span>Gross at that price</span><b class="' + (gross > 0 ? 'good' : 'danger') + '">' + M(gross) +
      ' <span class="muted small">(was ' + M(wasGross) + ')</span></b></div>' +
    '</div>' +
    (gross < 0 ? '<p class="kv danger small">That is below what the car cost you — you would be selling at a loss.</p>' : '') +
    (gap > 12 ? '<p class="kv warn small">Well over market. Expect it to sit.</p>' : '') +
    '<div class="btnrow" style="flex-direction:column">' +
    '<button class="grn" onclick="UI.closeModal()">No — leave it at ' + M(c.screen) + '</button>' +
    '<button class="amber" onclick="UI.priceGo(' + id + ',' + target + ')">Yes, price it at ' + M(target) + '</button>' +
    '</div></div>', { centre: true, sticky: true });
};
UI.priceGo = function (id, target) {
  FE.reprice(id, target);
  UI.closeModal(); renderAll();
  Juice.sound('tap');
  toast('Repriced to ' + M(target) + '.');
};
UI.stockCard = function (id) {
  var g = G(), c = null;
  g.stock.forEach(function (x) { if (x.id === id) c = x; });
  if (!c) return;
  var d = FE.daysIn(c);
  var h = '<h3>' + esc(FE.carName(c)) + '</h3><div class="kv">' + esc(FE.carDesc(c)) + ' · plate ' + c.plate + '</div>';
  if (c.perf) h += '<div class="kv muted small">' + esc(c.perf.note) + (c.modified ? ' <span class="warn">This one has been modified — worth less and harder to move on.</span>' : '') + '</div>';
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
  var cost = FE.carCost(c);
  UI.modal('<h3>Reprice — ' + esc(FE.carName(c)) + '</h3>' +
    '<div class="card"><div class="row kv"><span>Cost in</span><b>' + M(cost) + '</b></div>' +
    '<div class="row kv"><span>Market value</span><b>' + M(c.retail) + '</b></div>' +
    '<div class="row kv"><span>Screen now</span><b>' + M(c.screen) + '</b></div>' +
    '<div class="row kv"><span>Days in stock</span><b>' + FE.daysIn(c) + '</b></div></div>' +
    '<p class="kv muted small">Under market it moves faster; over and it sits. Nothing changes until you confirm.</p>' +
    '<input type="number" id="repriceVal" class="txt" value="' + c.screen + '" step="25">' +
    '<div class="btnrow"><button onclick="UI.repriceGo(' + id + ')">Review price…</button>' +
    '<button class="ghost" onclick="UI.stockCard(' + id + ')">Back</button></div>');
};
UI.repriceGo = function (id) {
  var v = parseInt($('repriceVal').value, 10);
  if (!v || v < 0) { toast('Put a price in first.'); return; }
  UI.confirmPrice(id, v);
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
    // what the warranty position actually is, so referring it is a judgement
    // rather than a guess: a covered failure with cover in force will pay out
    var d = e.data || {};
    var wLine = '';
    if (d.faultKind != null) {
      var covered = (d.faultKind === 'mech' || d.faultKind === 'elec');
      var inForce = !!d.warrantySold || !!d.mfrCover;
      var cls = (covered && inForce) ? 'good' : 'warn';
      wLine = '<p class="kv ' + cls + ' small">Warranty position: ' +
        (inForce
          ? (d.warrantySold ? 'policy sold with the deal' : 'still inside factory cover')
          : '<b>nothing to claim on</b>') +
        ' · this fault is ' +
        (covered ? '<b>a sudden ' + (d.faultKind === 'elec' ? 'electrical' : 'mechanical') + ' failure</b>' : '<b>a wear item</b> (excluded)') +
        '.</p>';
    }
    h += '<p class="kv warn">' + cra + '</p>' + wLine + '<div class="btnrow">' +
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
// performance-variant badge for lot / stock cards
function perfChip(c) {
  if (!c.perf) return '';
  return '<span class="perf-chip ' + c.perf.tier + '">' + esc(c.perf.badge) + '</span>' +
    (c.modified ? '<span class="perf-mod">modified</span>' : '');
}
function riskChip(l) {
  var r = l.risk;
  var lbl = RISK_LABEL[r.light];
  if (r.light === 'red') lbl = r.flavour === 'gamble' ? 'High risk / high reward' : 'High risk — bad car';
  return '<span class="risk-chip ' + r.light + '" onclick="event.stopPropagation();UI.riskInfo(' + l.id + ')">● ' + lbl + '</span>';
}
/* Sorting and shortlisting live for the life of the list — a new week brings a
   new list, so there is nothing worth persisting. */
var auctionSort = 'profit';
var aucStar = {};
UI.setAuctionSort = function (k) { auctionSort = k; UI.openAuction(); };
UI.aucStar = function (id, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  aucStar[id] = !aucStar[id];
  Juice.sound('tap');
  UI.openAuction();
};
/* The all-in is what leaves your account: hammer + 5.5% premium + transport.
   The engine's estGross is hammer-to-retail and so flatters every lot by the
   fees; this is the number a buyer should actually compare on. */
function lotAllIn(l) { return Math.round(l.hammer * 1.055) + 180; }
/* What the lot is expected to make: retail, less everything it costs to buy,
   less the prep it is expected to need. Hold cost is still to come and is not
   knowable at the hammer, which is what the caveat under the filters says. */
function lotMargin(l) {
  var allIn = lotAllIn(l);
  var prep = FE.expectedPrep(l, l.hammer);
  var profit = l.retail - allIn - prep;
  return { allIn: allIn, prep: prep, profit: profit, gross: l.retail - allIn,
           pct: allIn ? (profit / allIn) * 100 : 0 };
}
function profitCls(p) { return p >= 1500 ? 'good' : p >= 700 ? '' : p > 0 ? 'warn' : 'danger'; }
function marginCls(pct) { return pct >= 12 ? 'good' : pct >= 6 ? '' : pct > 0 ? 'warn' : 'danger'; }

UI.openAuction = function () {
  var g = G();
  if (g.phase !== 'auction') { toast('The auction house is done for today. Tomorrow’s list comes with the new week.'); return; }
  var counts = { all: g.lots.length, green: 0, amber: 0, red: 0 };
  g.lots.forEach(function (l) { counts[l.risk.light]++; });
  var freeP = FE.freePitches();
  var power = FE.spendPower();

  var h = '<h3>The auction house — today’s list</h3>';
  h += '<div class="auc-wallet">' +
    '<div><span>Cash in the bank</span><b id="aucCash">' + M(g.cash) + '</b></div>' +
    (FE.financeEnabled() ? '<div><span>Total to spend</span><b class="pw">' + M(power) + '</b></div>' : '') +
    '<div><span>Free pitches</span><b class="' + (freeP ? '' : 'danger') + '">' + freeP + '</b></div>' +
    '</div>';
  if (!freeP) h += '<p class="kv danger small" style="margin:4px 0 0">Every pitch is full. Anything you buy now has nowhere to go — sell something first.</p>';
  else if (FE.weeksOfFloat() < 4) {
    h += '<p class="kv danger small" style="margin:4px 0 0">Careful — your cash only covers ' + FE.weeksOfFloat().toFixed(1) +
      ' weeks of running costs. Buy to the last pound here and you will not be able to pay wages, training or building work.</p>';
  }

  // filter, then sort — so the counts on the chips stay honest
  var list = g.lots.filter(function (l) { return auctionFilter === 'all' || l.risk.light === auctionFilter; });
  var SORTS = {
    profit: { name: 'Most profit', fn: function (a, b) { return lotMargin(b).profit - lotMargin(a).profit; } },
    margin: { name: 'Best margin %', fn: function (a, b) { return lotMargin(b).pct - lotMargin(a).pct; } },
    cheap:  { name: 'Cheapest',    fn: function (a, b) { return lotAllIn(a) - lotAllIn(b); } },
    quick:  { name: 'Quickest',    fn: function (a, b) { return (a.estDays[0] + a.estDays[1]) - (b.estDays[0] + b.estDays[1]); } },
    fresh:  { name: 'Newest',      fn: function (a, b) { return b.year - a.year || a.miles - b.miles; } }
  };
  list = list.slice().sort(SORTS[auctionSort] ? SORTS[auctionSort].fn : SORTS.profit.fn);
  // anything starred floats to the top, whatever the sort
  list.sort(function (a, b) { return (aucStar[b.id] ? 1 : 0) - (aucStar[a.id] ? 1 : 0); });

  var affordable = g.lots.filter(function (l) { return lotAllIn(l) <= power; }).length;
  var best = g.lots.reduce(function (m, l) { var p = lotMargin(l).profit; return p > m ? p : m; }, -1e9);
  /* What today's list is worth to you: the best lots you can both afford and
     find a pitch for, added up. Tells you at a glance whether it is a list
     worth working or one to sit out. */
  var picks = g.lots.filter(function (l) { return lotAllIn(l) <= power; })
    .map(function (l) { return lotMargin(l).profit; })
    .filter(function (v) { return v > 0; })
    .sort(function (a, b) { return b - a; })
    .slice(0, Math.max(0, freeP));
  var pot = picks.reduce(function (a, v) { return a + v; }, 0);
  h += '<div class="auc-read">' +
    '<span><i>You can afford</i><b class="' + (affordable ? '' : 'danger') + '">' + affordable + ' of ' + g.lots.length + '</b></span>' +
    '<span><i>Best lot today</i><b class="' + profitCls(best) + '">' + (best > -1e9 ? M(best) : '—') + '</b></span>' +
    '<span><i>Best ' + picks.length + ' you can buy</i><b class="' + profitCls(pot) + '">' + M(pot) + '</b></span>' +
    '</div>';

  h += '<div class="risk-filter">' +
    ['all', 'green', 'amber', 'red'].map(function (f) {
      var name = f === 'all' ? 'All' : f === 'green' ? '🟢' : f === 'amber' ? '🟠' : '🔴';
      return '<button class="' + (auctionFilter === f ? 'on ' : '') + f + '" onclick="UI.setAuctionFilter(\'' + f + '\')">' + name + ' ' + counts[f] + '</button>';
    }).join('') + '</div>';
  h += '<div class="sortrow">' + Object.keys(SORTS).map(function (k) {
      return '<button class="' + (auctionSort === k ? '' : 'sec') + ' sm" onclick="UI.setAuctionSort(\'' + k + '\')">' + SORTS[k].name + '</button>';
    }).join('') + '</div>';
  h += '<p class="kv muted small"><b>Est profit</b> is retail less the all-in price (hammer + 5.5% premium + £180 transport) <b>and less the prep it is expected to need</b>. It is an average — grade 1 and 2 cars vary most, and hold cost comes off it for every week the car sits. Tap a risk light for why.</p>';

  if (!g.lots.length) h += '<div class="card kv">All lots gone or bought. Fresh list with the new week.</div>';

  list.forEach(function (l) {
    var m = lotMargin(l);
    var afford = m.allIn <= power;
    h += '<div class="card lot ' + l.risk.light + (afford ? '' : ' unaffordable') + (aucStar[l.id] ? ' starred' : '') + '">' +
      '<div class="row lot-top">' +
        '<b>' + esc(l.brand + ' ' + FE.MODELS[l.model].m) + perfChip(l) + '</b>' +
        '<button class="lot-star' + (aucStar[l.id] ? ' on' : '') + '" onclick="UI.aucStar(' + l.id + ',event)" aria-label="Shortlist">' + (aucStar[l.id] ? '★' : '☆') + '</button>' +
      '</div>' +
      '<div class="lot-line">' + riskChip(l) +
        '<span class="days-chip ' + (l.estDays[1] <= 45 ? 'good' : l.estDays[0] > 60 ? 'warn' : '') + '">' + l.estDays[0] + '–' + l.estDays[1] + ' days to sell</span>' +
        (l.vasFlag ? '<span class="vas-flag">Vas rates this one</span>' : '') +
        '<span class="lot-spec">' + esc(FE.carDesc(l)) + '</span></div>' +
      '<div class="lot-figs">' +
        '<span><i>All-in</i><b>' + M(m.allIn) + '</b></span>' +
        '<span><i>Est retail</i><b>' + M(l.retail) + '</b></span>' +
        '<span><i>Est prep</i><b class="muted">−' + M(m.prep) + '</b></span>' +
        '<span class="fig-profit"><i>Est profit</i><b class="' + profitCls(m.profit) + '">' +
          (m.profit < 0 ? '−' + M(Math.abs(m.profit)) : M(m.profit)) + '</b>' +
          '<em class="' + marginCls(m.pct) + '">' + (m.pct >= 0 ? '+' : '') + m.pct.toFixed(1) + '%</em></span>' +
      '</div>' +
      (afford
        ? '<button class="lot-buy" onclick="UI.buyLot(' + l.id + ')">Buy ' + M(m.allIn) +
            '<span class="lb-sub">' + (m.profit > 0 ? 'to make about ' + M(m.profit) : 'loses about ' + M(Math.abs(m.profit))) + '</span></button>'
        : '<button class="lot-buy sec" disabled>Beyond your budget</button>') +
      '</div>';
  });
  if (g.lots.length && !list.length) h += '<div class="card kv muted">No ' + RISK_LABEL[auctionFilter] + ' lots in today’s list.</div>';
  h += '<button class="ghost" onclick="UI.closeModal()">Leave the auction house</button>';
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
    '<button class="ghost" onclick="UI.openAuction()">Back to the auction house</button></div>';
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
    if (ev.result) {
      Juice.sound('coin');
      Juice.float('+' + M(ev.result.front + ev.result.back), '#35d07f', '#cash');
      toast(esc(ev.result.exec === 'you' ? 'You' : ev.result.exec) + ' sold the ' + FE.MODELS[ev.result.car.model].m + ' — ' + M(ev.result.front + ev.result.back) + ' gross');
    }
    FE.advanceEvent();
    renderAll();
    setTimeout(UI.nextEvent, 650);
    return;
  }
  if (ev.kind === 'prep' || ev.kind === 'arrival') return prepPopup(ev);
  if (ev.kind === 'prequal') return prequalPopup(ev);
  if (ev.kind === 'tradebuyer') return tradeBuyerPopup(ev);
  if (ev.kind === 'privateseller') return privateSellerPopup(ev);
  if (ev.kind === 'offer') {
    if (ev.px && !ev.pxResolved) return pxPopup(ev);
    return offerPopup(ev);
  }
  FE.advanceEvent(); UI.nextEvent();
};
function privateSellerPopup(ev) {
  var v = ev.pcar;
  var estPrep = Math.round(FE.BRANDS[G().brand].prepPct * ev.asking * FE.COND[v.cond].prep);
  var forecastGross = v.retail - ev.asking - estPrep;
  var rl = ev.risk.light;
  var riskLbl = rl === 'green' ? '🟢 Low risk' : rl === 'amber' ? '🟠 Some risk' : (ev.risk.flavour === 'gamble' ? '🔴 High risk / high reward' : '🔴 High risk — bad car');
  var h = '<h3>Private seller on the phone</h3>' +
    '<p class="kv">' + esc(ev.seller) + ' rang up — wants to sell you their car directly, no auction. <span class="warn">Uninspected, mind: five minutes on the drive, not a full check.</span></p>' +
    '<div class="card"><b>' + esc(FE.carName(v)) + '</b><div class="kv">' + esc(FE.carDesc(v)) + ' · plate ' + v.plate + '</div>' +
    '<div class="row" style="margin:6px 0"><span class="risk-chip ' + rl + '" onclick="UI.privateRiskInfo()">● ' + riskLbl + '</span></div>' +
    '<div class="row kv"><span>Asking price</span><b style="font-size:1.1rem">' + M(ev.asking) + '</b></div>' +
    '<div class="row kv"><span>Est retail</span><b>' + M(v.retail) + '</b></div>' +
    '<div class="row kv"><span>Est. gross (before prep &amp; hold)</span><b class="' + (ev.estGross > 1200 ? 'good' : '') + '">' + M(ev.estGross) + '</b></div>' +
    '<div class="row kv"><span>Est prep</span><b>' + M(estPrep) + '</b></div>' +
    '<div class="row kv"><span>Forecast gross after prep</span><b class="' + (forecastGross < 0 ? 'danger' : forecastGross > 1000 ? 'good' : '') + '">' + M(forecastGross) + '</b></div>' +
    '<div class="row kv"><span>Est days to sell</span><b>' + ev.estDays[0] + '–' + ev.estDays[1] + '</b></div>' +
    '</div>' +
    '<div class="btnrow">' +
    '<button class="grn" onclick="UI.privateBuy()">Buy — ' + M(ev.asking) + '</button>' +
    '<button onclick="UI.privateCounterUI()">Haggle</button>' +
    '<button class="sec" onclick="UI.privateDecline()">Decline</button></div>';
  UI.modal(h);
}
UI.privateRiskInfo = function () {
  var ev = FE.currentEvent(); if (!ev || ev.kind !== 'privateseller') return;
  var r = ev.risk;
  var head = r.light === 'green' ? '🟢 Low risk' : r.light === 'amber' ? '🟠 Some risk' : r.flavour === 'gamble' ? '🔴 High risk, high reward' : '🔴 High risk — a bad car';
  var h = '<h3>' + head + '</h3><p class="kv">What the light reads on this car:</p><ul class="risk-list">';
  r.drivers.forEach(function (d) { h += '<li>' + esc(d) + '</li>'; });
  h += '</ul><p class="kv muted small">Private cars carry a bit more hidden fault risk than auction stock — nobody’s been under it on a ramp.</p>' +
    '<button class="ghost" onclick="UI.backToPrivate()">Back</button>';
  UI.modal(h);
};
UI.backToPrivate = function () { privateSellerPopup(FE.currentEvent()); };
UI.privateBuy = function () {
  var ev = FE.currentEvent();
  var r = FE.privateBuy(ev);
  if (!r.ok) { toast(r.msg); return; }
  UI.modal('<h3>Bought it</h3><p class="kv">The ' + esc(FE.carName(ev.pcar)) + ' is yours for ' + M(r.price) + '. It’s on the pitch — prep bill to follow.</p>' +
    '<button onclick="UI.closeModal();FE.advanceEvent();UI.renderAll();UI.nextEvent()">Next</button>');
};
UI.privateCounterUI = function () {
  var ev = FE.currentEvent();
  var suggest = Math.round(ev.asking * 0.9 / 25) * 25;
  UI.modal('<h3>Haggle</h3><p class="kv">They’re asking ' + M(ev.asking) + '.' + (ev.firm ? ' They sounded pretty firm.' : ' Worth a try.') + ' Lowball too hard and they’ll hang up.</p>' +
    '<input type="number" id="privateOffer" value="' + suggest + '" step="25">' +
    '<div class="btnrow"><button onclick="UI.privateCounterGo()">Make the offer</button><button class="ghost" onclick="UI.backToPrivate()">Back</button></div>');
};
UI.privateCounterGo = function () {
  var ev = FE.currentEvent();
  var v = parseInt($('privateOffer').value, 10) || ev.asking;
  var r = FE.privateCounter(ev, v);
  if (r.ok) {
    UI.modal('<h3>' + (r.countered ? 'Haggled and bought' : 'Bought it') + '</h3><p class="kv">Got the ' + esc(FE.carName(ev.pcar)) + ' for ' + M(r.price) + '. On the pitch — prep to follow.</p>' +
      '<button onclick="UI.closeModal();FE.advanceEvent();UI.renderAll();UI.nextEvent()">Next</button>');
  } else if (r.walked) {
    UI.modal('<h3>No deal</h3><p class="kv">' + esc(r.msg) + '</p>' +
      '<button onclick="UI.closeModal();FE.advanceEvent();UI.renderAll();UI.nextEvent()">Next</button>');
  } else {
    toast(r.msg);
  }
};
UI.privateDecline = function () {
  var ev = FE.currentEvent();
  FE.privateDecline(ev);
  UI.closeModal(); FE.advanceEvent(); renderAll(); UI.nextEvent();
};

function prepPopup(ev) {
  var c = ev.car;
  var isArrival = (ev.kind === 'arrival');
  var r = FE.payPrep(ev);
  if (!r.already) Juice.bill(r.amount);
  var lead = isArrival
    ? 'The transporter’s just dropped it on the forecourt and the workshop’s been straight through it. Bill: '
    : 'The workshop’s been through it. Bill: ';
  // Deliberately a centred panel, not a bottom sheet: the workshop's bills must
  // never sit where the offer pop-ups put their Accept button, or you end up
  // paying for a car you meant to haggle over.
  var h = '<div class="bill"><div class="bill-tag">' + (isArrival ? '🚚 Delivered' : '🔧 Workshop') + '</div>' +
    '<h3>' + esc(FE.carName(c)) + '</h3>' +
    '<div class="bill-amt ' + (r.blowout ? 'bad' : '') + '">' + M(r.amount) + '</div>' +
    '<p class="kv">' + lead.replace(' Bill: ', '') + '</p>' +
    (r.blowout ? '<p class="kv danger">Includes a horror they found underneath.</p>' : '');
  if (r.tip) h += '<p class="kv warn small">Career tip (you’ll only get this once): the auction’s "est. gross" uses an average prep guess. Condition grades 1–2 are where blowouts hide, and the colour column tells you how long you’ll pay to hold it.</p>';
  h += '<p class="kv muted small">Already paid — the workshop doesn’t ask first.</p>' +
    '<button class="sec big" onclick="UI.prepAck()">Noted</button></div>';
  // the bill is already paid, so the X must still advance the queue
  UI.modal(h, { centre: true, sticky: true, onClose: 'UI.prepAck()' });
}
UI.prepAck = function () {
  UI.closeModal(); FE.advanceEvent(); renderAll(); UI.nextEvent();
};

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
  Juice.sale(s.front + s.back);
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
UI.toOffice = function () { FE.enterOffice(); renderAll(); UI.computer(); toast('Post’s in. Deal with the desk, then close the week.'); };

function buildProgress(startWk, dueWk, nowWk, label) {
  var total = Math.max(1, dueWk - startWk);
  var done = Math.min(total, nowWk - startWk);
  var pct = Math.round(done / total * 100);
  var left = Math.max(0, dueWk - nowWk);
  return '<div class="kv"><span class="build-tag">🏗 ' + label + '</span> — ' + (left <= 0 ? 'finishing this week' : left + ' wk' + (left === 1 ? '' : 's') + ' left') + '</div>' +
    '<div class="progressbar"><i class="warn" style="width:' + pct + '%"></i></div>';
}
// a greyed-out card for something that hasn't unlocked yet — visible so the
// player knows it exists and is coming, not hidden so the office feels empty
function lockedCard(name, blurb, wk) {
  var left = wk - G().week;
  return '<div class="card locked"><div class="row"><b>🔒 ' + esc(name) + '</b>' +
    '<span class="lock-wk">Week ' + wk + '</span></div>' +
    '<div class="kv muted">' + blurb + '</div>' +
    '<div class="kv small lock-eta">' + (left <= 1 ? 'Opens next week.' : 'Opens in ' + left + ' weeks.') + '</div></div>';
}
/* The old "office" screen predated the computer and had grown to hold a copy
   of everything. Stocking finance now lives in Banking, and departments and
   land in Property, so this keeps only what has no other home: what you spend
   on advertising, the franchise relationship, the pay structure, and what
   unlocks next. Reached as the Admin app, or from Factory Orders before a
   franchise exists. */
UI.adminApp = function () {
  var g = G(); if (!g) return;
  var h = '<h3>📋 Dealership admin</h3>';

  // advertising
  if (FE.unlocked('ads')) {
    h += '<div class="card"><b>Advertising</b><div class="kv muted small">Drives footfall. It comes out of cash every week whether it works or not.</div><div class="btnrow">';
    FE.AD_TIERS.forEach(function (t, i) {
      h += '<button class="' + (g.adTier === i ? '' : 'sec') + '" onclick="FE.setAds(' + i + ');UI.adminApp()">' + t.name + '<br><span class="small">' + M(t.cost) + '/wk</span></button>';
    });
    h += '</div></div>';
  } else {
    h += lockedCard('Advertising', 'Spend is fixed while you find your feet. Then you choose the tier.', FE.unlockWeek('ads'));
  }

  // franchise
  if (!FE.unlocked('franchise')) {
    h += lockedCard('Franchise', 'Sign with ' + g.brand + ' for new cars and factory orders. They want to see a going concern first.', FE.unlockWeek('franchise'));
  } else if (g.week >= FE.FRANCHISE.unlockWk) {
    if (!g.franchise) {
      h += '<div class="card"><b>' + g.brand + ' franchise</b><div class="kv">New cars on your forecourt. ' + M(FE.FRANCHISE.fee) + '/yr, minimum ' + FE.FRANCHISE.minSlots + ' pitches, target ' + FE.FRANCHISE.targetPerSlot + ' units per pitch per year. <span class="warn">Commit properly or not at all — a token effort underperforms staying used-only.</span></div>' +
        '<div class="btnrow"><button onclick="UI.signFranchiseUI()">Sign up</button></div></div>';
    } else if (g.franchise.live === false) {
      h += '<div class="card"><b>' + g.brand + ' franchise</b>' + buildProgress(g.franchise.signedWk, g.franchise.liveWk, g.week, 'Brand corner fit-out') + '<div class="kv muted">Order window opens week ' + g.franchise.liveWk + '.</div></div>';
    } else {
      var F = g.franchise;
      var weeksIn = g.week - F.qStartWk;
      var pct = Math.min(100, Math.round(F.qUnits / Math.max(F.slots * 2, 1) * 100));
      h += '<div class="card"><b>Franchise — quarter progress</b>' +
        '<div class="kv">' + F.qUnits + ' of ' + (F.slots * 2) + ' this quarter · ' + (13 - weeksIn) + ' wk' + (13 - weeksIn === 1 ? '' : 's') + ' left</div>' +
        '<div class="progressbar"><i class="' + (pct >= 97 ? 'good' : pct >= 60 ? '' : 'warn') + '" style="width:' + pct + '%"></i></div>' +
        '<div class="btnrow"><button onclick="UI.orderWindow()">Order window</button></div></div>';
    }
  }

  // pay structure
  if (!FE.unlocked('salary')) {
    h += lockedCard('Pay structure', 'Change the basic/commission split. Not while the ink’s still wet on their contracts.', FE.unlockWeek('salary'));
  } else {
    h += '<div class="card"><b>Pay structure</b><div class="kv">Currently: ' + FE.SALARIES[g.salary].name + '. Once a year you can change it — the team never thanks you.</div><div class="btnrow">';
    FE.SALARIES.forEach(function (s2, i) {
      if (i !== g.salary) h += '<button class="sec small" onclick="UI.salaryUI(' + i + ')">' + s2.name + '</button>';
    });
    h += '</div></div>';
  }

  // what opens up next
  var soon = FE.upcomingUnlocks();
  if (soon.length) {
    h += '<div class="card unlock-soon"><b>Coming up</b>';
    soon.forEach(function (u) {
      h += '<div class="row kv"><span>' + esc(u.name) + '</span><b>Week ' + u.wk + '</b></div>';
    });
    h += '<div class="kv muted small">The business opens up as you trade. Nothing here is missable.</div></div>';
  }

  h += '<button class="ghost" onclick="UI.computer()">← Desktop</button>';
  UI.modal(h);
};
UI.openOffice = function () { UI.adminApp(); };   // older call sites
UI.financeToggle = function (on) {
  var r = FE.enableFinance(on);
  toast(r.ok ? (on ? 'Stocking finance live — you can now buy on credit.' : 'Facility closed.') : r.msg);
  UI.bankApp(); renderHUD();
};
UI.signFranchiseUI = function () {
  var r = FE.signFranchise(FE.FRANCHISE.minSlots);
  toast(r.ok ? 'Franchise signed — brand corner being fitted out.' : r.msg);
  UI.adminApp();
};
UI.buildDeptUI = function (id) {
  var r = FE.buildDept(id);
  toast(r.ok ? 'Diggers in. Site disrupted this week.' : (r.msg || 'No.'));
  UI.propertyApp(); renderHUD();
};
UI.expandUI = function (id) {
  var r = FE.buyExpansion(id);
  toast(r.ok ? 'Groundworks started — pitches open week ' + r.dueWk + '.' : (r.msg || 'No.'));
  UI.propertyApp(); renderHUD();
};
UI.salaryUI = function (i) {
  if (!confirm('Restructure everyone onto "' + FE.SALARIES[i].name + '"? Morale will take a knock, and that’s your change for the year.')) return;
  var r = FE.changeSalary(i);
  toast(r.ok ? 'Done. The kitchen’s gone quiet.' : r.msg);
  UI.adminApp();
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
  h += '<button class="ghost" onclick="UI.computer()">← Desktop</button>';
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
    '<div class="btnrow"><button class="red" onclick="UI.sackConfirm(\'' + id + '\')">Let them go…</button>' +
    '<button class="ghost" onclick="UI.closeModal()">Keep them</button></div>');
};
/* Fail-safe. Sacking can't be undone, so it takes a second, deliberate tap on a
   centred dialog where "keep them" is the primary button — a stray tap where
   the last screen's confirm button sat lands on the safe option, not the sack. */
UI.sackConfirm = function (id) {
  var st = null;
  G().staff.forEach(function (s) { if (s.id === id) st = s; });
  if (!st) return;
  var cost = FE.sackCost(id);
  var courses = [];
  FE.TRAINING.forEach(function (c) { if (st.trained && st.trained[c.id]) courses.push(c.name); });
  UI.modal('<div class="danger-ask"><div class="danger-ask-badge">⚠️</div>' +
    '<h3>Are you sure you want to let ' + esc(st.name) + ' go?</h3>' +
    '<p class="kv">This can’t be undone. You’d have to re-hire from the agency, pay the fee again, and start them from scratch.</p>' +
    '<div class="card">' +
    '<div class="row kv"><span>Sold for you</span><b>' + (st.totUnits || 0) + ' car' + ((st.totUnits || 0) === 1 ? '' : 's') + '</b></div>' +
    '<div class="row kv"><span>Gross written</span><b>' + M(Math.round(st.totGross || 0)) + '</b></div>' +
    (courses.length ? '<div class="row kv"><span>Training you’ve paid for</span><b>' + esc(courses.join(', ')) + '</b></div>' : '') +
    '<div class="row kv"><span>Redundancy due</span><b class="danger">' + M(cost) + '</b></div>' +
    '</div>' +
    '<div class="btnrow" style="flex-direction:column">' +
    '<button class="grn" onclick="UI.closeModal()">No — keep ' + esc(st.name) + '</button>' +
    '<button class="red" onclick="UI.sackGo(\'' + id + '\')">Yes, let them go</button>' +
    '</div></div>', { centre: true, sticky: true });
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
/* A tiny inline sparkline of weekly net. No library, no canvas — a polyline
   scaled to the range, with zero drawn so a losing week reads as one. */
function sparkline(vals, w, hgt) {
  if (vals.length < 2) return '';
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (min === max) { min -= 1; max += 1; }
  var lo = Math.min(min, 0), hi = Math.max(max, 0);
  var x = function (i) { return (i / (vals.length - 1)) * w; };
  var y = function (v) { return hgt - ((v - lo) / (hi - lo)) * hgt; };
  var pts = vals.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ');
  var zero = y(0).toFixed(1);
  var last = vals[vals.length - 1];
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + hgt + '" preserveAspectRatio="none">' +
    '<line class="sp-zero" x1="0" y1="' + zero + '" x2="' + w + '" y2="' + zero + '"/>' +
    '<polyline class="sp-line ' + (last >= 0 ? 'up' : 'down') + '" points="' + pts + '"/>' +
    '<circle class="sp-dot ' + (last >= 0 ? 'up' : 'down') + '" cx="' + x(vals.length - 1).toFixed(1) + '" cy="' + y(last).toFixed(1) + '" r="2.6"/>' +
    '</svg>';
}
function tile(label, value, cls, sub) {
  return '<div class="kpi"><i>' + label + '</i><b class="' + (cls || '') + '">' + value + '</b>' +
    (sub ? '<em>' + sub + '</em>' : '') + '</div>';
}
/* Reports used to open on a share button with the numbers buried under the
   reviews. It is the P&L screen — so it now leads with how the business is
   actually doing, and the vanity stuff goes to the bottom. */
function renderReports() {
  var g = G(), h = '';
  var reps = g.reports || [];
  if (!reps.length) {
    h += '<div class="card kv">No weeks closed yet. Close your first week and the numbers land here.</div>';
    $('content').innerHTML = h;
    return;
  }
  var recent = reps.slice(0, 12).slice().reverse();          // oldest → newest
  var nets = recent.map(function (r) { return r.net; });
  var last = reps[0];
  var last4 = reps.slice(0, 4);
  var avgUnits = last4.reduce(function (a, r) { return a + r.units; }, 0) / last4.length;
  var avgNet = last4.reduce(function (a, r) { return a + r.net; }, 0) / last4.length;
  var gpu = last.units ? Math.round(last.gross / last.units) : 0;
  var trend = reps.length > 4 ? last.net - avgNet : 0;

  h += '<div class="card rep-head"><div class="row"><b>How it is going</b>' +
    '<span class="muted small">last ' + recent.length + ' weeks</span></div>' +
    sparkline(nets, 100, 30) +
    '<div class="kpis">' +
    tile('Net this week', (last.net < 0 ? '−' : '') + M(Math.abs(last.net)), last.net >= 0 ? 'good' : 'danger',
         reps.length > 4 && Math.abs(trend) >= 250 ? (trend >= 0 ? '▲ ' : '▼ ') + M(Math.abs(Math.round(trend))) + ' vs avg' : '') +
    tile('Units', last.units, last.units >= avgUnits ? 'good' : 'warn', '4-wk avg ' + avgUnits.toFixed(1)) +
    tile('Gross / unit', gpu ? M(gpu) : '—', gpu >= 1400 ? 'good' : gpu ? 'warn' : '') +
    tile('Avg days in stock', last.avgDays, last.avgDays <= 45 ? 'good' : last.avgDays <= 70 ? 'warn' : 'danger',
         last.avgDays <= 45 ? 'healthy' : 'over 45') +
    '</div>' + repVerdict(last, avgNet, gpu) + '</div>';

  h += '<h3 class="sec-head">Week by week</h3>';
  reps.slice(0, 10).forEach(function (r) {
    h += '<div class="card"><pre class="report">' + reportText(r) + '</pre></div>';
  });
  if (g.reviews.length) {
    h += '<h3 class="sec-head">Reviews</h3>';
    g.reviews.slice(0, 8).forEach(function (r) {
      h += '<div class="card review"><div class="rstars">' + '★'.repeat(r.stars) + '</div><div class="kv">' + esc(r.text) + '</div></div>';
    });
  }
  h += '<div class="btnrow" style="margin-top:14px"><button class="sec" onclick="UI.share()">Share my progress</button></div>';
  $('content').innerHTML = h;
}
/* One line of plain English on the week, pointing at the biggest single lever
   rather than making the player read the whole P&L to find it. */
function repVerdict(r, avgNet, gpu) {
  var c = r.costs || {};
  /* Nothing sold is its own diagnosis — naming the biggest cost line would
     point at the wrong thing entirely. */
  if (!r.units) {
    return '<div class="kv danger small">Nothing went out this week, so every bill came straight off the bottom line. Check you have stock on the pitch and someone on the floor to sell it.</div>';
  }
  if (r.net < 0) {
    var worst = '', wv = 0;
    [['prep', 'prep bills'], ['floorplan', 'floorplan interest'], ['salaries', 'wages'],
     ['stockfinance', 'stocking finance interest'], ['mortgage', 'the mortgage'], ['advertising', 'advertising']]
      .forEach(function (p) { if ((c[p[0]] || 0) > wv) { wv = c[p[0]]; worst = p[1]; } });
    return '<div class="kv warn small">Down ' + M(Math.abs(r.net)) + ' this week — the biggest line against you was ' + worst + ' at ' + M(wv) + '.' +
      (r.avgDays > 60 ? ' Stock is sitting at ' + r.avgDays + ' days, which is where the money is going.' : '') + '</div>';
  }
  if (r.avgDays > 60) return '<div class="kv warn small">A profitable week, but stock is averaging ' + r.avgDays + ' days. That bill arrives later.</div>';
  if (gpu && gpu < 1200) return '<div class="kv warn small">Profitable, but ' + M(gpu) + ' a unit is thin — you are buying too dear or pricing too soft.</div>';
  return '<div class="kv good small">A clean week: ' + r.units + ' out at ' + M(gpu) + ' a unit, stock turning at ' + r.avgDays + ' days.</div>';
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
  if (c.mortgage) t += line('Mortgage', '-' + M(c.mortgage));
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
  if (r.boundBy) {
    // the honest answer to "would another salesperson have helped?"
    var bb = r.boundBy === 'capacity' ? 'your people — the floor was the limit, another head would sell more'
      : r.boundBy === 'stock' ? 'stock — you ran short of cars to sell'
      : 'demand — enough staff and stock, not enough customers';
    t += line('Held back by', bb);
  }
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
  var remain = FE.skipRemainMs();
  if (remain > 0) {
    toast('You can end the week in ' + fmtMs(remain) + '. Play it out in the meantime, or come back shortly.');
    return;
  }
  var full = g.phase === 'auction';   // skipping before you've opened up = whole week
  var msg = full
    ? 'Let the staff run the whole week? They take the fair and cheeky offers, decline the silly ones, and handle the post conservatively — about 75% of a managed week.'
    : 'Skip the rest of the week and go to the report? Staff finish off anything you haven’t handled.';
  if (!confirm(msg)) return;
  UI.closeModal();
  var bestBefore = g.totals.bestWk;
  var r = FE.skipWeek();
  renderAll();
  if (r && r.report) weekJuice(r.report, bestBefore);
  if (r && r.report) UI.modal('<h3>' + (full ? 'While you were away…' : 'End of week report') + '</h3><pre class="report">' + reportText(r.report) + '</pre>' +
    '<div class="btnrow"><button onclick="UI.closeModal();UI.startNext()">Start week ' + G().week + '</button>' +
    '<button class="sec" onclick="UI.closeModal();UI.renderAll()">Sit with it</button></div>');
  if (r && r.dead) setTimeout(showGameOver, 400);
};
/* What the week earns you in feedback: a fanfare and confetti on a record,
   a shake and a buzz on a fine, a quiet win chime on a profitable week. */
function weekJuice(rep, bestBefore) {
  if (!rep) return;
  var record = rep.units > 0 && rep.units > (bestBefore || 0);
  if (rep.fine) { Juice.fine(); return; }
  if (record) { setTimeout(function () { Juice.record(); }, 220); return; }
  if (rep.net > 0) Juice.sound('win');
}
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

/* ---------- desk menu ---------- */
UI.calendar = function () {
  var g = G(); if (!g) return;
  var yw = ((g.week - 1) % 52) + 1;
  var yr = Math.ceil(g.week / 52);
  var S = FE.SEASON;
  // demand range for bar scaling
  var lo = 99, hi = 0;
  S.forEach(function (w) { if (w.d < lo) lo = w.d; if (w.d > hi) hi = w.d; });

  // group weeks into month blocks, in calendar order
  var blocks = [], cur = null;
  S.forEach(function (w) {
    if (!cur || cur.mo !== w.mo) { cur = { mo: w.mo, wks: [] }; blocks.push(cur); }
    cur.wks.push(w);
  });

  function vibe(avg) {
    if (avg >= 1.3) return { t: 'Plate rush', c: 'busy' };
    if (avg >= 1.05) return { t: 'Busy', c: 'good' };
    if (avg >= 0.85) return { t: 'Steady', c: 'ok' };
    if (avg >= 0.65) return { t: 'Quiet', c: 'slow' };
    return { t: 'Dead', c: 'dead' };
  }

  var rows = '';
  blocks.forEach(function (b) {
    var avg = b.wks.reduce(function (a, w) { return a + w.d; }, 0) / b.wks.length;
    var v = vibe(avg);
    var isNow = b.wks.some(function (w) { return w.w === yw; });
    var hasPlate = b.wks.some(function (w) { return w.plate; });
    var hasSale = b.wks.some(function (w) { return w.sale; });
    var cells = b.wks.map(function (w) {
      var hpct = Math.round(20 + (w.d - lo) / Math.max(0.01, hi - lo) * 80);
      var cls = 'cal-wk';
      if (w.w === yw) cls += ' now';
      if (w.plate) cls += ' plate';
      if (w.sale) cls += ' sale';
      var mk = w.w === yw ? '📍' : w.plate ? '🔵' : w.sale ? '☀️' : '';
      return '<div class="' + cls + '" title="Week ' + w.w + '">' +
        '<span class="cal-bar" style="height:' + hpct + '%"></span>' +
        '<span class="cal-mk">' + mk + '</span></div>';
    }).join('');
    rows += '<div class="cal-row' + (isNow ? ' now' : '') + '">' +
      '<div class="cal-mo"><b>' + b.mo + '</b>' +
        '<span class="cal-vibe ' + v.c + '">' + v.t + '</span>' +
        (hasPlate ? '<span class="cal-tag plate">Plate change</span>' : '') +
        (hasSale ? '<span class="cal-tag sale">Summer sale</span>' : '') +
      '</div>' +
      '<div class="cal-bars">' + cells + '</div></div>';
  });

  // next big date lookahead
  var nextTxt = '';
  for (var i = 1; i <= 52; i++) {
    var w = S[(yw - 1 + i) % 52];
    if (w.plate) { nextTxt = 'Next plate change: ' + w.mo + ' (in ' + i + ' wk' + (i === 1 ? '' : 's') + ') — footfall spikes, outgoing-plate stock softens.'; break; }
  }
  var saleTxt = '';
  if (FE.saleActive()) saleTxt = '<p class="kv sale-note">☀️ <b>Summer Sale on now</b> — crowds are up, margins are down. Shift stock on volume.</p>';
  else {
    for (var j = 1; j <= 52; j++) {
      var w2 = S[(yw - 1 + j) % 52];
      if (w2.sale) { saleTxt = '<p class="kv muted small">Summer Sale starts in ' + j + ' week' + (j === 1 ? '' : 's') + ' (' + w2.mo + ').</p>'; break; }
    }
  }

  UI.modal('<h3>The trading year</h3>' +
    '<p class="kv muted small">Week ' + g.week + ' · ' + FE.SEASON[yw - 1].mo + ' · Year ' + yr + '. Bars show how busy each week runs.</p>' +
    saleTxt +
    '<div class="cal-grid">' + rows + '</div>' +
    (nextTxt ? '<p class="kv small" style="margin-top:8px">📅 ' + nextTxt + '</p>' : '') +
    '<div class="cal-legend"><span>📍 Now</span><span>🔵 Plate change</span><span>☀️ Summer sale</span></div>' +
    '<button class="ghost" style="margin-top:10px" onclick="UI.closeModal()">Close</button>');
};
/* Everything the manager can do away from the forecourt lives here, behind the
   one desk button: the games and the old manager's-drawer items together. */
/* Installing matters beyond convenience: an installed app is exempt from the
   browser storage eviction that would otherwise bin a career after a week
   away, so this is offered as save protection, not decoration. */
UI.installApp = function () {
  var p = window.__installPrompt;
  if (!p) { toast('Use your browser menu — "Add to Home Screen".'); return; }
  UI.closeModal();
  p.prompt();
  p.userChoice.then(function (r) {
    window.__installPrompt = null;
    toast(r && r.outcome === 'accepted' ? 'Installed — your save is safer there.' : 'No problem, it stays in the browser.');
  }).catch(function () {});
};
UI.soundToggle = function () {
  var off = !Juice.muted();
  Juice.setMuted(off);
  if (!off) Juice.sound('tap');
  toast(off ? 'Sound off.' : 'Sound on.');
  UI.settingsApp();
};
// kept so any older call site still lands somewhere sensible
UI.gearMenu = function () { UI.deskMenu(); };
UI.confirmRestart = function () {
  if (confirm('Abandon this career and wipe the save?')) UI.restart();
};

/* ---------- save & profile ---------- */

/* ---------- the computer: a desktop of apps ----------
   Everything that isn't the forecourt itself lives behind one icon, laid out
   like a phone home screen. Each app is a thin wrapper over machinery that
   already exists, so there is one place to add to rather than a growing pile
   of floating buttons. */
/* The Games app carries a count of what is actually available to win this
   week — the coin toss run and the late-night prospect — so it reads as
   something with a reward behind it rather than a distraction. */
function gamesAvailable() {
  var n = 0;
  if (window.Puzzle && Puzzle.coinPlayedThisWeek && !Puzzle.coinPlayedThisWeek()) n++;
  var pr = FE.prospectReady && FE.prospectReady();
  if (pr && pr.ok && !pr.resume) n++;
  return n;
}
function gamesBadge() { var n = gamesAvailable(); return n ? n : ''; }
function gamesSub() {
  var n = gamesAvailable();
  if (!n) return 'A play while they prospect';
  return n === 1 ? '1 reward waiting' : n + ' rewards waiting';
}

/* A dot on the Admin app only when there is genuinely something to decide —
   a franchise you can now sign, or a pay structure you have just unlocked. */
function adminFlag(g) {
  if (FE.unlocked('franchise') && g.week >= FE.FRANCHISE.unlockWk && !g.franchise) return '!';
  if (FE.unlocked('salary') && !g.salaryChanged) return '';
  return '';
}
UI.computer = function () {
  var g = G(); if (!g) return;
  var unread = FE.unreadCount();
  var needs = g.emails.filter(function (e) {
    return !e.done && ['comeback','holiday','payreview','poach','alloc','prereg'].indexOf(e.type) >= 0;
  }).length;
  var lots = g.phase === 'auction' ? g.lots.length : 0;
  var hires = (g.candidates || []).length;
  var canOrder = !!(g.franchise && g.franchise.live !== false);
  var drawn = FE.financeEnabled() ? FE.financeDrawn() : 0;

  function app(id, label, sub, badge, colour, svg, on, locked) {
    return '<button class="capp' + (locked ? ' locked' : '') + '"' +
      (locked ? '' : ' onclick="' + on + '"') + '>' +
      '<span class="capp-ic" style="--ac:' + colour + '">' + svg +
      (badge ? '<i class="capp-badge">' + badge + '</i>' : '') + '</span>' +
      '<b>' + label + '</b><small>' + sub + '</small></button>';
  }
  var I = UI.appIcons;
  var h = '<div class="desktop"><div class="desk-top"><h3>💻 Office computer</h3>' +
    '<span class="desk-clock">Wk ' + g.week + ' · ' + FE.SEASON[(g.week - 1) % 52].mo + '</span></div>' +
    '<div class="capps">' +
    app('mail','Email','Inbox' + (needs ? ' · action needed' : ''), unread || '', '#3d8bff', I.mail,
        "UI.closeModal();UI.tab('email')") +
    app('auction','Auction House', g.phase === 'auction' ? "Today's list" : 'Closed today', lots || '', '#ffb63d', I.gavel,
        "UI.closeModal();UI.openAuction()", g.phase !== 'auction') +
    app('bank','Banking','Cash, facility, floorplan','', '#2fd6c0', I.bank, "UI.bankApp()") +
    app('property','Property','Site, land &amp; departments','', '#9b6cff', I.house, "UI.propertyApp()") +
    app('hire','Recruitment', hires ? hires + ' on the books' : 'Agency', '', '#35d07f', I.badge,
        "UI.closeModal();UI.tab('staff')") +
    app('factory','Factory Orders', canOrder ? 'Order new stock' : 'Franchise required', '', '#ff5d6c', I.factory,
        canOrder ? "UI.closeModal();UI.orderWindow()" : "UI.adminApp()") +
    app('admin','Admin','Ads, franchise &amp; pay', adminFlag(g), '#ffa04d', I.clip, "UI.adminApp()") +
    app('games','Games', gamesSub(), gamesBadge(), '#5f6dff', I.game, "Puzzle.hub()") +
    app('settings','Settings','Sound, save, help','', '#97a3c4', I.cog, "UI.settingsApp()") +
    '</div>' +
    (drawn > 0 ? '<div class="desk-note warn">Stocking finance drawn: ' + M(drawn) + ' at ' + (Math.round(FE.financeApr()*1000)/10) + '% APR.</div>' : '') +
    /* "To the office" lands here, so the week has to be closeable from here —
       otherwise the desktop is a modal you must dismiss before you can finish. */
    (g.phase === 'office'
      ? '<div class="desk-close"><button class="grn" onclick="UI.closeModal();UI.skipWeek()">Close the week →</button>' +
        '<div class="kv muted small">Post and paperwork done? Close up and see the numbers.</div></div>'
      : '') +
    '</div>';
  UI.modal(h);
};

// what the cars on the pitch cost you — the other half of net worth
function stockValue() {
  var t = 0;
  G().stock.forEach(function (c) { if (c.status === 'stock') t += FE.carCost(c); });
  return Math.round(t);
}
/* Banking — the money view, pulled out of the old office screen */
UI.bankApp = function () {
  var g = G();
  var h = '<h3>🏦 Banking</h3>' +
    '<div class="card"><div class="row kv"><span>Cash</span><b class="' + (g.cash < 0 ? 'danger' : 'good') + '">' + M(g.cash) + '</b></div>' +
    '<div class="row kv"><span>Stock at cost</span><b>' + M(stockValue()) + '</b></div>' +
    '<div class="row kv"><span>Net worth</span><b class="teal">' + M(FE.netWorth()) + '</b></div>' +
    '<div class="row kv"><span>Spend power <span class="muted small">(stock only)</span></span><b>' + M(FE.spendPower()) + '</b></div></div>' +
    (function () {
      var wc = FE.weeklyCosts(), wks = FE.weeksOfFloat();
      var cls = wks < 3 ? 'danger' : wks < 6 ? 'warn' : 'good';
      return '<div class="card"><b>Working capital</b>' +
        '<div class="row kv"><span>Running costs</span><b>' + M(wc) + '/wk</b></div>' +
        '<div class="row kv"><span>Cash covers</span><b class="' + cls + '">' +
        (wks >= 99 ? 'plenty' : wks.toFixed(1) + ' weeks') + '</b></div>' +
        '<div class="kv muted small">Cash pays wages, training, agency fees and building work. ' +
        'Stocking finance is secured on the cars, so it only ever buys cars — keep a float back or you will be rich in metal and unable to pay for a course.</div>' +
        (wks < 3 ? '<div class="kv danger small">You are running thin. Trade a car out or sell before you commit to anything else.</div>' : '') +
        '</div>';
    })();
  if (!FE.unlocked('finance')) {
    h += lockedCard('Stocking finance', 'A credit facility to buy stock beyond your cash. The bank wants to see you trade a few weeks first.', FE.unlockWeek('finance'));
  } else if (FE.financeEnabled()) {
    var lim = FE.financeLimit(), dr = FE.financeDrawn(), head = FE.financeHeadroom();
    var pct = lim ? Math.min(100, Math.round(dr / lim * 100)) : 0;
    h += '<div class="card"><b>Stocking finance</b>' +
      '<div class="row kv"><span>Credit limit</span><b>' + M(lim) + '</b></div>' +
      '<div class="row kv"><span>Drawn now</span><b class="' + (dr > 0 ? 'warn' : '') + '">' + M(dr) + '</b></div>' +
      '<div class="row kv"><span>Headroom</span><b>' + M(head) + '</b></div>' +
      '<div class="row kv"><span>Rate</span><b>' + (Math.round(FE.financeApr() * 1000) / 10) + '% APR</b></div>' +
      '<div class="progressbar"><i class="' + (pct > 80 ? 'warn' : '') + '" style="width:' + pct + '%"></i></div>' +
      '<div class="kv muted small">Interest on the drawn balance only, weekly, on top of floorplan.</div>' +
      (dr <= 0 ? '<div class="btnrow"><button class="sec" onclick="UI.financeToggle(false)">Close facility</button></div>' : '') +
      '</div>';
  } else {
    h += '<div class="card"><b>Stocking finance</b><div class="kv">Buy stock beyond your cash — up to ' + M(FE.STOCK_FINANCE.maxLimit) + ', scaled to net worth. <span class="warn">Leverage cuts both ways.</span></div>' +
      '<div class="btnrow"><button onclick="UI.financeToggle(true)">Open a facility</button></div></div>';
  }
  h += mortgageCard();
  h += '<button class="ghost" onclick="UI.computer()">← Desktop</button>';
  UI.modal(h);
};

/* ---------- commercial mortgage ----------
   The borrowing ladder is three rungs and players only ever met two of them,
   so this leads with what the money is FOR rather than with a rate. */
function mortgageCard() {
  var g = G();
  if (!FE.unlocked('mortgage')) {
    return lockedCard('Commercial mortgage', 'Release cash from the property you own — the money stocking finance cannot lend you.', FE.unlockWeek('mortgage'));
  }
  var bal = FE.mortgageBalance(), lim = FE.mortgageLimit(), pv = FE.propertyValue();
  var h = '<div class="card"><b>Property &amp; mortgage</b>' +
    '<div class="row kv"><span>Property owned</span><b>' + M(pv) + '</b></div>';
  if (bal > 0) {
    var m = g.mortgage;
    var paidPct = Math.max(0, Math.min(100, Math.round((1 - bal / m.principal) * 100)));
    h += '<div class="row kv"><span>Outstanding</span><b class="warn">' + M(bal) + '</b></div>' +
      '<div class="row kv"><span>Weekly payment</span><b>' + M(FE.mortgageWeekly()) + '</b></div>' +
      '<div class="row kv"><span>Rate</span><b>' + (Math.round(m.apr * 1000) / 10) + '% APR</b></div>' +
      '<div class="row kv"><span>Clear in</span><b>' + FE.mortgageWeeksLeft() + ' wks</b></div>' +
      '<div class="progressbar"><i class="good" style="width:' + paidPct + '%"></i></div>' +
      '<div class="kv muted small">' + paidPct + '% repaid. The payment comes out whatever the week did — that is the deal.</div>';
  } else {
    h += '<div class="row kv"><span>Owed</span><b class="good">Nothing</b></div>';
  }
  h += '<div class="row kv"><span>Still available</span><b>' + M(lim) + '</b></div>' +
    '<div class="kv muted small">The bank lends ' + Math.round(FE.MORTGAGE.ltv * 100) + '% of the site, departments and land you own. ' +
    '<b>Borrowing does not make you richer</b> — the cash comes in and the debt goes on, so net worth does not move. What it buys is time.</div>';
  if (lim >= FE.MORTGAGE.minDraw) {
    h += '<div class="btnrow"><button class="grn" onclick="UI.mortgageUI()">' + (bal > 0 ? 'Borrow more' : 'Borrow against the property') + '</button>' +
      (bal > 0 ? '<button class="sec" onclick="UI.mortgageOverpayUI()">Pay some off</button>' : '') + '</div>';
  } else if (bal > 0) {
    h += '<div class="btnrow"><button class="sec" onclick="UI.mortgageOverpayUI()">Pay some off</button></div>';
  } else {
    h += '<div class="kv muted small">Nothing to borrow against yet — build or buy property and the facility grows with it.</div>';
  }
  return h + '</div>';
}
var mortDraw = { amount: 0, term: 104 };
UI.mortgageUI = function () {
  var lim = FE.mortgageLimit();
  if (lim < FE.MORTGAGE.minDraw) { toast('Nothing left to borrow against.'); return; }
  if (!mortDraw.amount || mortDraw.amount > lim) mortDraw.amount = Math.min(lim, 100000);
  var q = FE.mortgageQuote(mortDraw.amount, mortDraw.term);
  var steps = [25000, 50000, 100000, 200000].filter(function (v) { return v <= lim; });
  if (steps.indexOf(lim) < 0) steps.push(lim);
  var h = '<h3>🏦 Borrow against the property</h3>' +
    '<p class="kv muted small">Secured on ' + M(FE.propertyValue()) + ' of property. Up to ' + M(lim) + ' available.</p>' +
    '<div class="card"><b>How much?</b><div class="btnrow">' +
    steps.map(function (v) {
      return '<button class="' + (mortDraw.amount === v ? '' : 'sec') + ' sm" onclick="UI.mortSet(' + v + ',' + mortDraw.term + ')">' +
        (v === lim ? 'Max ' : '') + M(v) + '</button>';
    }).join('') + '</div></div>' +
    '<div class="card"><b>Over how long?</b><div class="btnrow">' +
    FE.MORTGAGE.terms.map(function (t) {
      return '<button class="' + (mortDraw.term === t ? '' : 'sec') + ' sm" onclick="UI.mortSet(' + mortDraw.amount + ',' + t + ')">' +
        (t / 52) + ' year' + (t === 52 ? '' : 's') + '</button>';
    }).join('') + '</div></div>' +
    '<div class="card"><b>What it costs</b>' +
    '<div class="row kv"><span>You receive</span><b class="good">' + M(q.net) + '</b></div>' +
    '<div class="row kv"><span>Arrangement fee</span><b>' + M(q.fee) + '</b></div>' +
    '<div class="row kv"><span>Rate</span><b>' + (Math.round(q.apr * 1000) / 10) + '% APR</b></div>' +
    '<div class="row kv"><span>Weekly payment</span><b class="warn">' + M(q.weekly) + '</b></div>' +
    '<div class="row kv"><span>Interest over the term</span><b>' + M(q.totalInterest) + '</b></div>' +
    '<div class="row kv"><span>Total cost of the money</span><b>' + M(q.totalCost) + '</b></div></div>' +
    weeklyBiteWarning(q.weekly) +
    '<div class="btnrow"><button class="grn" onclick="UI.mortgageConfirm()">Take ' + M(q.net) + '</button>' +
    '<button class="sec" onclick="UI.bankApp()">Not now</button></div>';
  UI.modal(h);
};
UI.mortSet = function (amount, term) { mortDraw.amount = amount; mortDraw.term = term; UI.mortgageUI(); };
/* Borrowing is only sensible if the weekly payment is small against what the
   business already carries — say so before they sign, not after. */
function weeklyBiteWarning(weekly) {
  var wc = FE.weeklyCosts();
  if (!wc) return '';
  var pct = Math.round(weekly / wc * 100);
  if (pct >= 25) return '<div class="card"><div class="kv danger">That payment is ' + pct + '% on top of your ' + M(wc) + ' weekly running costs, and it comes out in January too, when nothing sells. Consider a longer term or a smaller draw.</div></div>';
  if (pct >= 12) return '<div class="card"><div class="kv warn">Adds ' + pct + '% to your ' + M(wc) + ' weekly running costs — noticeable, but carryable.</div></div>';
  return '<div class="card"><div class="kv muted small">Adds ' + pct + '% to your ' + M(wc) + ' weekly running costs.</div></div>';
}
UI.mortgageConfirm = function () {
  var q = FE.mortgageQuote(mortDraw.amount, mortDraw.term);
  UI.modal('<div class="danger-ask"><div class="danger-ask-badge">🏦</div>' +
    '<h3>Borrow ' + M(q.amount) + ' against the property?</h3>' +
    '<p class="kv">' + M(q.net) + ' lands now. ' + M(q.weekly) + ' a week comes out for ' + (q.termWks / 52) + ' year' + (q.termWks === 52 ? '' : 's') + ', trading or not.</p>' +
    '<p class="kv muted small">Your net worth will not move — the cash and the debt cancel out.</p>' +
    '<div class="btnrow" style="flex-direction:column">' +
    '<button class="grn" onclick="UI.bankApp()">No — leave it</button>' +
    '<button class="amber" onclick="UI.mortgageGo()">Yes, draw ' + M(q.net) + '</button></div></div>', { centre: true });
};
UI.mortgageGo = function () {
  var r = FE.mortgageDraw(mortDraw.amount, mortDraw.term);
  if (!r.ok) { toast(r.msg); return; }
  UI.closeModal(); renderAll();
  Juice.sound('coin');
  toast('Drawn ' + M(r.quote.net) + '. Repayments start this week.');
  setTimeout(UI.bankApp, 400);
};
UI.mortgageOverpayUI = function () {
  var bal = FE.mortgageBalance(), g = G();
  var can = Math.max(0, Math.min(bal, Math.floor(g.cash)));
  var opts = [25000, 50000, 100000].filter(function (v) { return v <= can; });
  if (can > 0 && opts.indexOf(can) < 0) opts.push(can);
  UI.modal('<h3>Pay some of the mortgage off</h3>' +
    '<div class="card"><div class="row kv"><span>Outstanding</span><b>' + M(bal) + '</b></div>' +
    '<div class="row kv"><span>Cash you have</span><b>' + M(Math.max(0, g.cash)) + '</b></div>' +
    '<div class="kv muted small">Overpaying saves interest but does not cut the weekly payment — it just finishes sooner. Cash working in the business is usually worth more than saving 6% on the debt; only do this when you are flush.</div></div>' +
    (opts.length
      ? '<div class="btnrow">' + opts.map(function (v) {
          return '<button class="sec" onclick="UI.mortgageOverpayGo(' + v + ')">' + (v === bal ? 'Clear it — ' : '') + M(v) + '</button>';
        }).join('') + '</div>'
      : '<div class="kv warn">No spare cash to overpay with.</div>') +
    '<button class="ghost" onclick="UI.bankApp()">← Banking</button>');
};
UI.mortgageOverpayGo = function (amount) {
  var r = FE.mortgageOverpay(amount);
  toast(r.ok ? (r.cleared ? 'Mortgage cleared. The property is yours outright.' : 'Paid ' + M(amount) + ' off.') : r.msg);
  if (r.ok) { renderAll(); Juice.sound('tap'); }
  UI.bankApp();
};

/* Property — the site, the land and what's built on it */
UI.propertyApp = function () {
  var g = G(), s = FE.SITES[g.site];
  var nw = FE.netWorth(), pct = Math.min(100, nw / FE.SITE2_TARGET * 100).toFixed(1);
  var h = '<h3>🏢 Property</h3>' +
    '<div class="card"><b>' + esc(s.name) + '</b>' +
    '<div class="row kv"><span>Pitches</span><b>' + (s.ext + s.int + g.extraSlots) + '</b></div>' +
    '<div class="row kv"><span>Free now</span><b>' + FE.freePitches() + '</b></div>' +
    '<div class="row kv"><span>Utilities</span><b>' + M(s.util + g.extraUtil) + '/wk</b></div>' +
    '<div class="row kv"><span>Property owned</span><b class="teal">' + M(FE.propertyValue()) + '</b></div>' +
    (FE.mortgageBalance() ? '<div class="row kv"><span>Mortgaged</span><b class="warn">' + M(FE.mortgageBalance()) + '</b></div>' : '') +
    '</div>';
  if (!FE.unlocked('depts')) h += lockedCard('Departments', 'Service, smart repair and valeting.', FE.unlockWeek('depts'));
  else FE.DEPARTMENTS.forEach(function (d) {
    if (g.dept[d.id]) {
      h += g.week >= g.dept[d.id]
        ? '<div class="card kv"><b>' + d.name + '</b> — live. ' + M(d.weekly) + '/wk coming in.</div>'
        : '<div class="card"><b>' + d.name + '</b>' + buildProgress(g.dept[d.id] - d.buildWks, g.dept[d.id], g.week, 'Construction') + '</div>';
    } else {
      h += '<div class="card"><b>' + d.name + '</b> <span class="tag">' + M(d.cost) + '</span><div class="kv">' + d.blurb + '</div>' +
        '<div class="btnrow"><button class="sec" onclick="UI.buildDeptUI(\'' + d.id + '\')">Build</button></div></div>';
    }
  });
  if (!FE.unlocked('expansion')) h += lockedCard('Land expansion', 'Buy the ground next door.', FE.unlockWeek('expansion'));
  else FE.EXPANSIONS.forEach(function (x) {
    if (g.expansionsDone.indexOf(x.id) >= 0) return;
    var pend = null; g.pendingBuilds.forEach(function (b) { if (b.id === x.id) pend = b; });
    h += pend
      ? '<div class="card"><b>' + x.name + '</b>' + buildProgress(pend.startedWk, pend.dueWk, g.week, 'Groundworks') + '</div>'
      : '<div class="card"><b>' + x.name + '</b> <span class="tag">' + M(x.cost) + '</span><div class="kv">+' + x.slots + ' pitches, utilities +' + M(x.util) + '/wk</div>' +
        '<div class="btnrow"><button class="sec" onclick="UI.expandUI(\'' + x.id + '\')">Buy the land</button></div></div>';
  });
  h += '<div class="card"><b>Site 2 — locked</b> · unlocks at ' + M(FE.SITE2_TARGET) + ' net worth' +
    '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
    '<div class="small">' + M(nw) + ' / ' + M(FE.SITE2_TARGET) + '</div>' +
    '<div class="small muted">' + site2Hint() + '</div></div>' +
    '<button class="ghost" onclick="UI.computer()">← Desktop</button>';
  UI.modal(h);
};

/* Settings — the old manager's drawer */
UI.settingsApp = function () {
  UI.modal('<h3>⚙️ Settings</h3>' +
    '<div class="btnrow" style="flex-direction:column">' +
    (window.__installPrompt ? '<button class="grn" onclick="UI.installApp()">📲 Install to home screen</button>' : '') +
    '<button class="sec" onclick="UI.soundToggle()">' + (Juice.muted() ? '🔇 Sound off' : '🔊 Sound on') + '</button>' +
    '<button class="sec" onclick="UI.saveMenu()">💾 Save &amp; profile</button>' +
    '<button class="sec" onclick="UI.accountApp()">☁️ Account &amp; cloud save' + cloudDot() + '</button>' +
    '<button class="sec" onclick="UI.closeModal();UI.share()">📤 Share my progress</button>' +
    '<button class="sec" onclick="UI.skipWeekUI()">⏭ Skip this week (staff run it)</button>' +
    '<button class="sec" onclick="UI.helpUI()">❓ How this works</button>' +
    '<button class="sec" onclick="UI.closeModal();UI.startTutorial(false)">🎓 Replay tutorial</button>' +
    '<button class="red" onclick="UI.confirmRestart()">Abandon career</button></div>' +
    '<p class="kv muted small" style="margin-top:10px">Beta build. Saves locally, automatically. The clock runs a game week every 12 real hours.</p>' +
    '<button class="ghost" onclick="UI.computer()">← Desktop</button>');
};

/* ---------- account & cloud save ----------
   Everything here degrades to "local only" language when the cloud isn't
   reachable, because for most of this game's life that will be the truth and
   it is not a fault worth alarming anyone about. */
function cloud() { return window.FEcloud || null; }
function cloudDot() {
  var c = cloud(); if (!c) return '';
  var s = c.status().state;
  if (s === 'on') return ' <span class="cl-dot on" title="Backed up"></span>';
  if (s === 'connecting') return ' <span class="cl-dot wait"></span>';
  if (s === 'error') return ' <span class="cl-dot err"></span>';
  return '';
}
function ago(ts) {
  if (!ts) return 'not yet';
  var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  return new Date(ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}
UI.accountApp = function () {
  var c = cloud();
  if (!c) { UI.modal('<h3>☁️ Cloud save</h3><p class="kv">Not available in this build.</p>' +
    '<button class="ghost" onclick="UI.settingsApp()">← Settings</button>'); return; }
  var s = c.status(), on = c.enabled();
  var held = !!(c.held && c.held());
  var line, cls;
  if (!on) { line = 'Off — this device only'; cls = 'muted'; }
  else if (held) { line = 'Paused — waiting on you'; cls = 'warn'; }
  else if (s.state === 'on') { line = 'Backing up'; cls = 'good'; }
  else if (s.state === 'connecting') { line = 'Connecting…'; cls = 'muted'; }
  else if (s.state === 'error') { line = 'Local only'; cls = 'warn'; }
  else { line = 'Not connected'; cls = 'muted'; }

  var h = '<h3>☁️ Account &amp; cloud save</h3>' +
    '<div class="card"><b>Status</b>' +
    '<div class="row kv"><span>Cloud backup</span><b class="' + cls + '">' + line + '</b></div>' +
    (on && s.state === 'on' ? '<div class="row kv"><span>Last backed up</span><b>' + ago(s.lastPush) + '</b></div>' : '') +
    (s.err ? '<div class="kv warn small">' + esc(s.err) + '</div>' : '') +
    (held ? '<div class="kv warn small">There are two careers on this account and you haven’t said which continues. Nothing is being uploaded until you do, so neither can overwrite the other.</div>' : '') +
    '<div class="kv muted small">Your career always saves to this device first. The cloud copy is a mirror — if it can’t be reached, nothing is lost and nothing stops.</div>' +
    (on ? '<div class="btnrow">' +
        (held ? '<button class="amber" onclick="UI.cloudResolve()">Choose which career continues</button>'
          : s.state === 'on' ? '<button class="sec" onclick="UI.cloudBackupNow()">Back up now</button>'
          : '<button class="sec" onclick="UI.cloudRetry()">Try again</button>') +
        '<button class="sec" onclick="UI.cloudToggle(false)">Turn off</button></div>'
      : '<div class="btnrow"><button onclick="UI.cloudToggle(true)">Turn cloud save on</button></div>') +
    '</div>';

  if (on && s.state === 'on') {
    h += '<div class="card"><b>This device</b>' +
      (s.linked
        ? '<div class="row kv"><span>Signed in</span><b class="good">' + esc(s.email || 'Google account') + '</b></div>' +
          '<div class="kv muted small">Sign in with the same Google account on another phone or laptop and your career comes with you.</div>' +
          '<div class="btnrow"><button class="sec" onclick="UI.cloudSignOut()">Sign out on this device</button></div>'
        : '<div class="row kv"><span>Account</span><b>Guest</b></div>' +
          '<div class="kv">Your save is backed up against an anonymous ID held only in this browser. That protects you from clearing your data or losing the phone — but it can’t follow you to a second device, and it goes if this browser profile does.</div>' +
          '<div class="kv muted small">Linking a Google account keeps this exact career and makes it reachable anywhere you sign in. Nothing is shared with anyone.</div>' +
          '<div class="btnrow"><button class="grn" onclick="UI.cloudLink()">Link a Google account</button></div>') +
      '</div>';
  }

  h += '<div class="card"><b>Is it actually working?</b>' +
    '<div class="kv muted small">Cloud saves depend on settings in the Firebase console that this screen cannot see. Run the check and it will name whichever step is failing.</div>' +
    '<div id="cloudDiag"></div>' +
    '<div class="btnrow"><button class="sec" onclick="UI.cloudDiagnose()">Check the connection</button></div></div>';

  h += '<div class="card"><b>Always works</b>' +
    '<div class="kv">Whatever the cloud is doing, a save code moves a career between devices by hand.</div>' +
    '<div class="btnrow"><button class="sec" onclick="UI.exportUI()">Copy save code</button>' +
    '<button class="sec" onclick="UI.importUI()">Paste a save code</button></div></div>' +
    '<button class="ghost" onclick="UI.settingsApp()">← Settings</button>';
  UI.modal(h);
};
UI.cloudToggle = function (on) {
  var c = cloud(); if (!c) return;
  c.setEnabled(on);
  toast(on ? 'Cloud save on.' : 'Cloud save off — this device only.');
  setTimeout(UI.accountApp, 250);
};
UI.cloudRetry = function () {
  var c = cloud(); if (!c) return;
  c.init();
  toast('Reconnecting…');
  setTimeout(UI.accountApp, 800);
};
UI.cloudBackupNow = function () {
  var c = cloud(); if (!c) return;
  c.pushNow();
  toast('Backing up…');
  setTimeout(UI.accountApp, 700);
};
UI.cloudLink = function () {
  var c = cloud(); if (!c) return;
  UI.modal('<h3>Linking…</h3><p class="kv">A Google sign-in window should have opened. Finish there and come back.</p>' +
    '<p class="kv muted small">If nothing appeared, your browser may have blocked the popup — allow popups for this site and try again.</p>');
  c.linkGoogle(function (err, res) {
    if (err) {
      UI.modal('<h3>Not linked</h3><p class="kv warn">' + esc(err.message || 'Sign-in did not complete.') + '</p>' +
        '<p class="kv muted small">Nothing changed — your career is exactly where it was.</p>' +
        '<button class="ghost" onclick="UI.accountApp()">← Back</button>');
      return;
    }
    if (res && res.switched) {
      /* That Google account already had a career. Two histories can't be
         merged, so the player picks which one continues. */
      var d = { action: 'ask', local: FE.describeEnvelope(res.local), remote: FE.describeEnvelope(res.remote), remoteEnvelope: res.remote };
      if (!d.remote) { c.pushNow(); toast('Signed in — this career is now on that account.'); setTimeout(UI.accountApp, 300); return; }
      UI.cloudChoose(d, true);
      return;
    }
    toast('Linked. This career now follows your account.');
    UI.accountApp();
  });
};
UI.cloudSignOut = function () {
  UI.modal('<div class="danger-ask"><div class="danger-ask-badge">☁️</div>' +
    '<h3>Sign out on this device?</h3>' +
    '<p class="kv">Your career stays on this device and keeps saving. It just stops backing up until you sign in again.</p>' +
    '<div class="btnrow" style="flex-direction:column">' +
    '<button class="grn" onclick="UI.accountApp()">No — stay signed in</button>' +
    '<button class="amber" onclick="UI.cloudSignOutGo()">Yes, sign out</button></div></div>', { centre: true });
};
UI.cloudSignOutGo = function () {
  var c = cloud(); if (!c) return;
  c.signOut(function () { toast('Signed out.'); UI.accountApp(); });
};

UI.cloudDiagnose = function () {
  var c = cloud(); if (!c || !c.diagnose) return;
  var el = $('cloudDiag');
  if (el) el.innerHTML = '<div class="kv muted small diag-run">Checking…</div>';
  c.diagnose(function (steps) {
    var box = $('cloudDiag');
    if (!box) return;
    var allOk = steps.length && steps.every(function (s) { return s.ok; });
    box.innerHTML = '<div class="diag">' + steps.map(function (s) {
      return '<div class="diag-row ' + (s.ok ? 'ok' : 'bad') + '">' +
        '<i>' + (s.ok ? '✓' : '✕') + '</i>' +
        '<div><b>' + esc(s.name) + '</b>' +
        (s.detail ? '<div class="kv small">' + esc(s.detail) + '</div>' : '') +
        (s.fix ? '<div class="kv warn small"><b>Fix:</b> ' + esc(s.fix) + '</div>' : '') +
        '</div></div>';
    }).join('') +
    (allOk ? '<div class="kv good small" style="margin-top:8px">All good — this career is backed up.</div>' : '') +
    '</div>';
    if (allOk) Juice.sound('win');
  });
};

/* The one screen that must never get this wrong: two saves, one career.
   Nothing is overwritten until the player says which. */
function envLine(d) {
  if (!d) return '<div class="kv muted">nothing saved</div>';
  return '<div class="row kv"><span>Progress</span><b>Week ' + d.week + (d.brand ? ' · ' + esc(d.brand) : '') + '</b></div>' +
    '<div class="row kv"><span>Cars sold</span><b>' + d.units + '</b></div>' +
    '<div class="row kv"><span>Cash</span><b>' + M(d.cash || 0) + '</b></div>' +
    '<div class="row kv"><span>Last played</span><b>' + ago(d.savedAt) + '</b></div>';
}
UI.cloudChoose = function (d, fromLink) {
  pendingSync = d;
  if (d.action === 'restore') {
    UI.modal('<div class="danger-ask"><div class="danger-ask-badge">☁️</div>' +
      '<h3>There’s a career on your account</h3>' +
      '<p class="kv">This device has no save, but your account does.</p>' +
      '<div class="card">' + envLine(d.remote) + '</div>' +
      '<div class="btnrow" style="flex-direction:column">' +
      '<button class="grn" onclick="UI.cloudTakeRemote()">Pick it up where I left off</button>' +
      '<button class="sec" onclick="UI.cloudKeepLocal()">Start fresh on this device</button></div>' +
      '<p class="kv muted small">Starting fresh replaces the saved career on your account. There is no way back from that.</p></div>',
      { centre: true, sticky: true });
    return;
  }
  UI.modal('<div class="danger-ask"><div class="danger-ask-badge">⚠️</div>' +
    '<h3>Two careers, one account</h3>' +
    '<p class="kv">' + (fromLink ? 'That Google account already has a career of its own.' : 'The copy on your account is further along than this device.') +
    ' They can’t be merged — pick the one that continues.</p>' +
    '<div class="card"><b>On your account</b>' + envLine(d.remote) + '</div>' +
    '<div class="card"><b>On this device</b>' + envLine(d.local) + '</div>' +
    '<div class="btnrow" style="flex-direction:column">' +
    '<button class="grn" onclick="UI.cloudTakeRemote()">Continue the one on my account</button>' +
    '<button class="amber" onclick="UI.cloudKeepLocal()">Continue the one on this device</button></div>' +
    '<p class="kv muted small">Whichever you leave behind is overwritten. Copy a save code out first if you want to keep both.</p></div>',
    { centre: true, sticky: true });
};
var pendingSync = null;
UI.cloudTakeRemote = function () {
  var d = pendingSync; pendingSync = null;
  if (!d || !d.remoteEnvelope) { UI.closeModal(); return; }
  var c = cloud(); if (c) c.release();
  var r = FE.adoptEnvelope(d.remoteEnvelope);
  UI.closeModal();
  if (!r.ok) { toast(r.msg || 'That save could not be opened.'); return; }
  $('screen-boot').classList.add('hidden');
  enterMain();
  renderAll();
  toast('Career restored — week ' + r.week + '.');
  Juice.sound('win');
};
UI.cloudKeepLocal = function () {
  pendingSync = null;
  UI.closeModal();
  var c = cloud(); if (c) { c.release(); c.pushNow(); }
  toast('Keeping this career.');
};
// re-open a conflict the player closed without answering
UI.cloudResolve = function () {
  if (pendingSync) { UI.cloudChoose(pendingSync, false); return; }
  var c = cloud(); if (c) { c.release(); c.resync(); }
  toast('Checking…');
};
UI.deskMenu = function () { UI.computer(); };   // older call sites land on the desktop

UI.appIcons = {
  mail:   '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.6"/><path d="M3.4 6.6 12 13l8.6-6.4"/></svg>',
  gavel:  '<svg viewBox="0 0 24 24"><path d="M3 21h9M6.5 12.5l5-5M4.5 10.5 9 6M13 3l8 8M15.5 5.5 11 10M17 11l-5 5"/></svg>',
  bank:   '<svg viewBox="0 0 24 24"><path d="M3 9.5 12 4l9 5.5M4.5 10v8M9.5 10v8M14.5 10v8M19.5 10v8M2.5 20.5h19"/></svg>',
  house:  '<svg viewBox="0 0 24 24"><path d="M3.5 20.5h17M5 20.5V10l7-5.5 7 5.5v10.5M10 20.5v-5h4v5"/></svg>',
  badge:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path d="M5 20.5a7 7 0 0 1 14 0"/><rect x="3" y="2.5" width="18" height="19" rx="3"/></svg>',
  factory:'<svg viewBox="0 0 24 24"><path d="M2.5 20.5h19V9l-6 4V9l-6 4V4.5h-7z"/><path d="M6 16.5h2M11 16.5h2M16 16.5h2"/></svg>',
  game:   '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10.5" rx="4.5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="16" cy="11.5" r="1.1"/><circle cx="18.5" cy="14" r="1.1"/></svg>',
  clip:   '<svg viewBox="0 0 24 24"><rect x="4.5" y="4" width="15" height="17" rx="2.4"/><rect x="8.75" y="2" width="6.5" height="3.6" rx="1.4"/><path d="M8.5 11.5h7M8.5 15.5h4.5"/></svg>',
  cog:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
};

UI.saveMenu = function () {
  var p = FE.profile(), info = FE.saveInfo(), g = G();
  var when = info && info.savedAt ? new Date(info.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  UI.modal('<h3>💾 Save &amp; profile</h3>' +
    '<div class="card"><b>Manager</b>' +
    '<div class="row kv"><span>Name</span><b>' + (p.name ? esc(p.name) : '<span class="muted">not set</span>') + '</b></div>' +
    '<div class="row kv"><span>Player ID</span><span class="mono small muted">' + esc(p.id.slice(0, 8)) + '…</span></div>' +
    '<div class="btnrow"><button class="sec" onclick="UI.nameUI()">' + (p.name ? 'Change name' : 'Set a name') + '</button></div>' +
    '<div class="kv muted small">Your ID travels with your save. When online play arrives, this is the account it attaches to.</div></div>' +
    '<div class="card"><b>This career</b>' +
    '<div class="row kv"><span>Progress</span><b>Week ' + (g ? g.week : '—') + (g ? ' · ' + esc(g.brand) : '') + '</b></div>' +
    '<div class="row kv"><span>Last saved</span><b>' + when + '</b></div>' +
    '<div class="kv muted small">The game saves itself after every action — there is no way to lose a week.</div>' +
    '<div class="btnrow"><button onclick="UI.saveNow()">Save now</button></div></div>' +
    '<div class="card"><b>Real-time trading</b>' +
    '<div class="kv">Every 12 real hours is a game week — roughly two a day. Leave the game and the team keep the floor running; you come back to the post and a summary. Up to ' + FE.REALTIME.maxWeeks + ' weeks can run unattended.</div>' +
    '<div class="row kv"><span>Status</span><b class="' + (FE.realtimeOn() ? 'good' : 'muted') + '">' + (FE.realtimeOn() ? 'On' : 'Paused') + '</b></div>' +
    (FE.realtimeOn() ? '<div class="row kv"><span>Next week runs in</span><b>' + fmtDur(FE.nextTickIn()) + '</b></div>' : '') +
    '<div class="btnrow"><button class="sec" onclick="UI.realtimeToggle(' + (FE.realtimeOn() ? 'false' : 'true') + ')">' +
    (FE.realtimeOn() ? 'Pause the clock' : 'Start the clock') + '</button></div>' +
    '<div class="kv muted small">Paused, nothing moves unless you play. The clock never runs your career past the cap.</div></div>' +
    '<div class="card"><b>Move to another device</b>' +
    '<div class="kv">Copy a save code out, paste it in on the other phone. Same code a future online account would sync.</div>' +
    '<div class="btnrow"><button class="sec" onclick="UI.exportUI()">Copy save code</button>' +
    '<button class="sec" onclick="UI.importUI()">Paste a save code</button></div></div>' +
    '<button class="ghost" onclick="UI.closeModal()">Close</button>');
};
UI.nameUI = function () {
  var p = FE.profile();
  UI.modal('<h3>Manager name</h3><p class="kv muted small">Shown on your progress card, and reserved for you when online play lands.</p>' +
    '<input id="nameIn" class="txt" maxlength="24" placeholder="e.g. Dan" value="' + esc(p.name || '') + '">' +
    '<div id="nameErr" class="kv danger small"></div>' +
    '<div class="btnrow"><button onclick="UI.nameGo()">Save name</button>' +
    '<button class="ghost" onclick="UI.saveMenu()">Back</button></div>');
  var el = $('nameIn'); if (el) el.focus();
};
UI.nameGo = function () {
  var el = $('nameIn'); if (!el) return;
  var r = FE.setUsername(el.value);
  if (!r.ok) { var e = $('nameErr'); if (e) e.textContent = r.msg; return; }
  toast('Name set — ' + esc(r.profile.name));
  UI.saveMenu();
};
function fmtDur(ms) {
  if (ms == null) return '—';
  var m = Math.round(ms / 60000), h = Math.floor(m / 60);
  m = m % 60;
  return h ? h + 'h ' + m + 'm' : m + 'm';
}
UI.realtimeToggle = function (on) {
  FE.setRealtime(on);
  toast(on ? 'Real-time trading on — the floor runs while you’re away.' : 'Clock paused.');
  UI.saveMenu();
};
UI.saveNow = function () {
  toast(FE.save() ? 'Saved.' : 'Could not save — device storage is full.');
};
UI.exportUI = function () {
  if (!G()) { toast('Nothing to export yet.'); return; }
  UI.modal('<h3>Your save code</h3><p class="kv muted small">Packing it up…</p>');
  FE.exportSave(function (code) {
    if (!code) { toast('Nothing to export yet.'); UI.saveMenu(); return; }
    var kb = (code.length / 1024).toFixed(0);
    UI.modal('<h3>Your save code</h3>' +
      '<p class="kv muted small">Copy all of it. Paste it into "Paste a save code" on the other device — it replaces whatever career is on there. <span class="muted">(' + kb + ' KB)</span></p>' +
      '<textarea id="expBox" class="txt code" rows="6" readonly>' + esc(code) + '</textarea>' +
      '<div class="btnrow"><button onclick="UI.copyCode()">Copy to clipboard</button>' +
      '<button class="ghost" onclick="UI.saveMenu()">Back</button></div>');
    var t = $('expBox'); if (t) { t.focus(); t.select(); }
  });
};
UI.copyCode = function () {
  var t = $('expBox'); if (!t) return;
  t.select();
  var done = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t.value).then(function () { toast('Save code copied.'); }, function () { toast('Select the text and copy it manually.'); });
    done = true;
  }
  if (!done) { try { done = document.execCommand('copy'); } catch (e) {} toast(done ? 'Save code copied.' : 'Select the text and copy it manually.'); }
};
UI.importUI = function () {
  UI.modal('<h3>Paste a save code</h3>' +
    '<p class="kv warn small">This replaces the career on this device. Copy your own code out first if you want to keep it.</p>' +
    '<textarea id="impBox" class="txt code" rows="6" placeholder="Paste the code here"></textarea>' +
    '<div id="impErr" class="kv danger small"></div>' +
    '<div class="btnrow"><button onclick="UI.importGo()">Load this save</button>' +
    '<button class="ghost" onclick="UI.saveMenu()">Back</button></div>');
};
UI.importGo = function () {
  var t = $('impBox'); if (!t) return;
  FE.importSave(t.value, function (r) {
    if (!r.ok) { var e = $('impErr'); if (e) e.textContent = r.msg; return; }
    UI.closeModal();
    renderAll();
    toast('Save loaded — week ' + r.week + '.');
  });
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
/* Every window gets a close X. `opts` is either the legacy `sticky` boolean or
   { sticky, centre, onClose } —
     sticky  : tapping the backdrop won't dismiss (the X still will)
     centre  : float the panel in the middle of the screen instead of a bottom
               sheet, for anything that must not share button positions with
               the offer pop-ups (prep bills)
     onClose : JS run by the X instead of a plain close, so a window that owes
               the engine a call (advance the event queue) still makes it. */
var modalOnClose = null;
UI.modal = function (html, opts) {
  var o = (opts === true) ? { sticky: true } : (opts || {});
  var ov = $('overlay');
  ov.classList.remove('hidden');
  ov.classList.toggle('centre', !!o.centre);
  ov.dataset.sticky = o.sticky ? '1' : '';
  modalOnClose = o.onClose || null;
  var sheet = ov.querySelector('.sheet');
  sheet.innerHTML =
    '<div class="sheet-xwrap"><button class="sheet-x" onclick="UI.dismissModal()" aria-label="Close">✕</button></div>' + html;
  sheet.scrollTop = 0;
};
// what the X (and backdrop tap) does — honours the window's own exit action
UI.dismissModal = function () {
  var fn = modalOnClose;
  modalOnClose = null;
  if (fn) { try { (new Function(fn))(); return; } catch (e) { /* fall through */ } }
  UI.closeModal();
};
UI.closeModal = function () {
  modalOnClose = null;
  var ov = $('overlay');
  ov.classList.add('hidden');
  ov.classList.remove('centre');
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
      UI.dismissModal();
    }
  });
  UI.boot();
});

})();
