/* FORECOURT EMPIRE — engine.js
   Pure game logic. No DOM. UI talks to this through FE.* calls and reads FE.G. */
'use strict';

(function () {

var G = null;               // live game state
FE.getState = function () { return G; };

/* ---------- rng & utils ---------- */
function rnd() { return Math.random(); }
function U(a, b) { return a + rnd() * (b - a); }
function RI(a, b) { return Math.floor(U(a, b + 1)); }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function pickW(arr, wfn) {
  var tot = 0, i;
  for (i = 0; i < arr.length; i++) tot += wfn(arr[i]);
  if (tot <= 0) return null;
  var r = rnd() * tot;
  for (i = 0; i < arr.length; i++) { r -= wfn(arr[i]); if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}
function norm(mean, sd) {
  var u1 = Math.max(rnd(), 1e-9), u2 = rnd();
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function r25(x) { return Math.round(x / 25) * 25; }
function money(x) {
  var n = Math.round(x), neg = n < 0; n = Math.abs(n);
  return (neg ? '-£' : '£') + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
FE.money = money;

/* ---------- lookups ---------- */
function season() { return FE.SEASON[(G.week - 1) % 52]; }
function brand() { return FE.BRANDS[G.brand]; }
function site() { return FE.SITES[G.site]; }
function salary() { return FE.SALARIES[G.salary]; }
function totalSlots() { return site().ext + site().int + G.extraSlots; }
function usedSlots() { return G.stock.filter(function (c) { return c.status === 'stock' || c.status === 'sold'; }).length; }
function inStock() { return G.stock.filter(function (c) { return c.status === 'stock'; }); }
function brandCapacity() { return 3.1 * Math.pow(11200 / brand().avgCost, FE.CAPACITY_EXP); }
function carCost(c) { return c.cost.hammer + c.cost.premium + c.cost.transport + c.cost.prep; }
FE.carCost = carCost;
function acq(c) { return c.cost.hammer + c.cost.premium + c.cost.transport; }
FE.acq = acq;
function carName(c) { return c.brand + ' ' + FE.MODELS[c.model].m; }
FE.carName = carName;
function carDesc(c) {
  return FE.TRIMS[c.trim].t + ' · ' + FE.COLOURS[c.colour].c + ' · ' + c.year + ' · ' +
    c.miles.toLocaleString() + ' mi · grade ' + c.cond + ' · ' + FE.HISTORY[c.hist].h + ' history · ' + c.fuel;
}
FE.carDesc = carDesc;
function daysIn(c) { return Math.max(0, (G.week - c.arrivedWk) * 7); }
FE.daysIn = daysIn;

function starFootfall(s) {
  var t = FE.STAR_FOOTFALL, i;
  if (s <= t[0][0]) return t[0][1];
  for (i = 1; i < t.length; i++) {
    if (s <= t[i][0]) {
      var f = (s - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
      return t[i - 1][1] + f * (t[i][1] - t[i - 1][1]);
    }
  }
  return t[t.length - 1][1];
}

function presConvFactor() {
  var diff = site().tier - brand().tier;
  if (diff >= 0) return Math.min(1 + 0.06 * diff, 1.12);
  if (diff === -1) return 0.5;
  return 0.19;
}

/* ---------- new game ---------- */
FE.newGame = function (brandKey, siteIdx, salaryIdx) {
  G = {
    v: 1, created: Date.now(),
    brand: brandKey, site: siteIdx, salary: salaryIdx, salaryChangedYr: 0,
    cash: FE.START_CASH - FE.SITES[siteIdx].cost,
    week: 1, phase: 'auction',
    stars: 4.0,
    stock: [], lots: [], lotsWk: 0,
    staff: [],
    // day-1 recruitment: the agency has a first batch on the books now, the
    // rest land in week 2 (keeps a reason to check the books back without a dead week)
    candidates: [], candidatePool: [],
    emails: [], reviews: [], reports: [],
    adTier: 2,
    extraSlots: 0, extraUtil: 0, expansionsDone: [], pendingBuilds: [],
    dept: { service: 0, building: 0 },      // service: week it went live (0 = none)
    franchise: null,                        // {slots, signedWk, qUnits, qMargin, yUnits, preRegPending}
    finance: { enabled: false },            // stocking finance facility
    orders: [],                             // pending factory orders
    shocks: [],                             // {id, until, data}
    randShocksThisYear: 0,
    weekly: null,                           // current week ledger
    events: [], eventIdx: 0,                // showroom queue
    pendingComebacks: [],                   // {carId, dueWk, cost, fault}
    flags: { firstSaleDone: false, prepTip: false, holdTip: false, tradeBuyerUsed: false, monReviewDone: false, allocDeclines: 0 },
    totals: { units: 0, unitsYr: 0, bestWk: 0, bestWkAt: 0, worstWk: 999, worstWkAt: 0, fines: [], afk: 0, financed: 0, financeComm: 0 },
    holidayPlan: {},                        // staffId -> requestWk
    lastCloseAt: 0,                         // ms timestamp of last week completion (skip cooldown)
    idc: 1, dead: false
  };
  // the aunt's contact book: three buyers with known wants, so week 1 teaches
  // "buy what people actually want" — announced BEFORE the first auction
  var segs = [];
  FE.MODELS.forEach(function (m) { if (m.b === brandKey && segs.indexOf(m.seg) < 0) segs.push(m.seg); });
  segs.sort(function () { return Math.random() - 0.5; });
  G.wantedSegs = segs.slice(0, 3);
  // shuffle the roster, put the first 6 on the books now, the rest arrive week 2
  var pool = FE.ROSTER.map(function (r) { return r.id; });
  for (var pi = pool.length - 1; pi > 0; pi--) { var pj = Math.floor(Math.random() * (pi + 1)); var tmp = pool[pi]; pool[pi] = pool[pj]; pool[pj] = tmp; }
  G.candidates = pool.slice(0, 6);
  G.candidatePool = pool.slice(6);
  startWeek();
  FE.save();
  return G;
};

/* ---------- persistence ---------- */
var SAVE_KEY = 'forecourtEmpireSave_v1';
FE.save = function () { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) {} };
FE.load = function () {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    G = JSON.parse(raw);
    return G;
  } catch (e) { return null; }
};
FE.wipe = function () { localStorage.removeItem(SAVE_KEY); G = null; };

/* ---------- cash ---------- */
function pay(amt, cat, label) {
  G.cash -= amt;
  if (G.weekly) G.weekly.costs[cat] = (G.weekly.costs[cat] || 0) + amt;
  if (G.weekly && label) G.weekly.feed.push({ t: label, amt: -amt });
}
function earn(amt, label) {
  G.cash += amt;
  if (G.weekly && label) G.weekly.feed.push({ t: label, amt: amt });
}

/* ---------- email ---------- */
function mail(from, subj, body, type, data) {
  var e = { id: G.idc++, wk: G.week, from: from, subj: subj, body: body, type: type || 'info', data: data || null, unread: true, done: false };
  G.emails.unshift(e);
  // keep the inbox (and the save file) bounded — bin old, actioned post
  if (G.emails.length > 120) {
    G.emails = G.emails.filter(function (m, i) { return i < 120 || (!m.done && ['comeback', 'holiday', 'payreview', 'poach', 'alloc', 'prereg'].indexOf(m.type) >= 0); });
  }
  return e;
}
FE.markRead = function (id) {
  G.emails.forEach(function (e) { if (e.id === id) e.unread = false; });
  FE.save();
};
FE.markAllRead = function (ids) {
  var only = ids && ids.length ? {} : null;
  if (only) ids.forEach(function (id) { only[id] = 1; });
  G.emails.forEach(function (e) { if (!only || only[e.id]) e.unread = false; });
  FE.save();
};
// delete emails by id, but never bin one that still needs a decision
FE.deleteEmails = function (ids) {
  var kill = {}; (ids || []).forEach(function (id) { kill[id] = 1; });
  var pending = ['comeback', 'holiday', 'payreview', 'poach', 'alloc', 'prereg'];
  var removed = 0;
  G.emails = G.emails.filter(function (e) {
    if (!kill[e.id]) return true;
    if (pending.indexOf(e.type) >= 0 && !e.done) return true;   // keep un-actioned decisions
    removed++; return false;
  });
  FE.save();
  return removed;
};
FE.emailDeletable = function (e) {
  var pending = ['comeback', 'holiday', 'payreview', 'poach', 'alloc', 'prereg'];
  return !(pending.indexOf(e.type) >= 0 && !e.done);
};
FE.unreadCount = function () { return G ? G.emails.filter(function (e) { return e.unread; }).length : 0; };

/* ---------- vehicle generation (section 8a) ---------- */
var AGE_W = [0.10, 0.14, 0.18, 0.16, 0.14, 0.12, 0.09, 0.07];

function genPlate(age) {
  var yr = 26 - age;
  var half = rnd() < 0.5 ? yr : yr + 50;
  var L = 'ABCDEFGHKLMNOPRSTVWY';
  return pick(L.split('')) + pick(L.split('')) + (half < 10 ? '0' : '') + half + ' ' +
    pick(L.split('')) + pick(L.split('')) + pick(L.split(''));
}

function genVehicle(brandKey, opts) {
  opts = opts || {};
  var models = [];
  FE.MODELS.forEach(function (m, i) { if (m.b === brandKey) models.push(i); });
  var mi = opts.model != null ? opts.model : pick(models);
  var M = FE.MODELS[mi];
  var age = opts.age || (function () { var r = rnd(), s = 0, i; for (i = 0; i < 8; i++) { s += AGE_W[i]; if (r < s) return i + 1; } return 4; })();
  var ageRow = FE.AGE[age];
  var expMiles = age * FE.MILES_PER_YEAR;
  var miles = Math.max(1500, Math.round(norm(expMiles, expMiles * FE.MILE_SD) / 100) * 100);
  // higher-mileage bargain: push the odometer well over the age-expected figure
  if (opts.milesHigh) miles = Math.max(miles, Math.round(expMiles * U(1.25, 1.75) / 100) * 100);
  var dev = (miles - expMiles) / 10000;
  var mileVal = clamp(1 - FE.MILE_VALUE_PEN_PER_10K * dev, FE.MILE_VALUE_FLOOR, 1.22);

  var trim = (function () { var r = rnd(), s = 0, i; for (i = 0; i < FE.TRIMS.length; i++) { s += FE.TRIMS[i].p; if (r < s) return i; } return 1; })();
  var colour = (function () { var r = rnd(), s = 0, i; for (i = 0; i < FE.COLOURS.length; i++) { s += FE.COLOURS[i].p; if (r < s) return i; } return 0; })();
  var cond = (function () { var r = rnd(), s = 0, k; for (k = 5; k >= 1; k--) { s += FE.COND[k].p; if (r < s) return k; } return 3; })();
  var hist = (function () { var r = rnd(), s = 0, i; for (i = 0; i < FE.HISTORY.length; i++) { s += FE.HISTORY[i].p; if (r < s) return i; } return 0; })();
  var fuel = rnd() < M.dsl ? 'Diesel' : (rnd() < 0.06 ? 'Hybrid' : 'Petrol');

  var retail = r25(M.np * ageRow[0] * mileVal * FE.TRIMS[trim].retail * FE.COLOURS[colour].r * FE.HISTORY[hist].r);
  var daysTrue = M.days * ageRow[1] * (1 + FE.MILE_DAYS_PEN_PER_10K * Math.max(0, dev)) *
    FE.COLOURS[colour].d * FE.HISTORY[hist].d * U(0.85, 1.2);
  var faultP = clamp(FE.COND[cond].fault + FE.MILE_FAULT_PER_10K * Math.max(0, dev), 0.02, 0.45);

  return {
    id: G ? G.idc++ : Math.floor(rnd() * 1e9),
    model: mi, brand: brandKey, age: age, year: 2026 - age, plate: genPlate(age),
    miles: miles, trim: trim, colour: colour, cond: cond, hist: hist, fuel: fuel, big: M.big,
    retail: retail, screen: retail, daysTrue: daysTrue, faultP: faultP,
    cost: { hammer: 0, premium: 0, transport: 0, prep: 0 },
    truePrep: 0, prepPaid: false, boughtWk: 0, arrivedWk: 0, slot: null,
    status: 'lot', holdCost: 0, discounted: false, ack90: false, arrived: true,
    isPX: false, isNew: false, isPreReg: false
  };
}

function truePrepFor(c, baseCost) {
  var mean = brand().prepPct * baseCost * FE.COND[c.cond].prep;
  var p = Math.max(120, norm(mean, FE.PREP_SD));
  if (FE.COLOURS[c.colour].c === 'Black') p *= 1.1;
  var blowout = rnd() < FE.BLOWOUT_P;
  if (blowout) p += U(FE.BLOWOUT_RANGE[0], FE.BLOWOUT_RANGE[1]);
  if (G.dept.service && G.week >= G.dept.service) p *= (1 - FE.SERVICE_PREP_SAVING);
  return { amount: Math.round(p), blowout: blowout };
}

/* ---------- auction ---------- */
/* Traffic-light risk from VISIBLE attributes only (grade, colour, mileage vs
   expected, history, age). Returns light + flavour of red + the driver list.
   'gamble' red = rough but a real upside; 'grave' red = cheap for a reason. */
function scoreLot(v) {
  var drivers = [], factors = 0;
  var colDays = FE.COLOURS[v.colour].d;
  var grave = colDays >= 1.30;          // brown / yellow / gold
  var slow = colDays >= 1.06 && !grave; // red / green
  var dev = (v.miles - v.age * FE.MILES_PER_YEAR) / 10000;

  if (v.cond <= 2) { factors++; drivers.push('Condition grade ' + v.cond + ' — prep and hidden faults likely'); }
  if (grave) drivers.push(FE.COLOURS[v.colour].c + ' — a colour that sits, then has to be discounted out');
  else if (slow) { factors++; drivers.push(FE.COLOURS[v.colour].c + ' — a slower-selling colour'); }
  if (dev > 0.7) { factors++; drivers.push('High mileage — ' + Math.round(dev * 10000).toLocaleString() + ' over the age-expected figure'); }
  if (FE.HISTORY[v.hist].h === 'None') { factors++; drivers.push('No service history'); }
  if (v.age >= 7) { factors++; drivers.push('Older car — slower to shift, more to go wrong'); }

  var light, flavour = null;
  if (grave || factors >= 2) {
    light = 'red';
    // graveyard colour with no other saving grace = genuinely bad; otherwise a gamble
    var desirableBase = (v.age <= 3) || FE.TRIMS[v.trim].t === 'Top' ||
      ['White', 'Black', 'Grey'].indexOf(FE.COLOURS[v.colour].c) >= 0;
    flavour = (grave && !desirableBase) ? 'grave' : 'gamble';
  } else if (factors === 1) {
    light = 'amber';
  } else {
    light = 'green';
  }
  if (!drivers.length) drivers.push('Clean on paper — grade ' + v.cond + ', ' + FE.HISTORY[v.hist].h.toLowerCase() + ' history, sensible mileage');
  return { light: light, flavour: flavour, drivers: drivers };
}
FE.scoreLot = scoreLot;

function genLots() {
  var lots = [], i;
  var N = FE.LOTS_PER_WEEK;
  for (i = 0; i < N; i++) {
    // roughly a third of the list are older, higher-mileage bargains — cheap
    // in, but slower to shift and more likely to bite
    var opts = {};
    if (rnd() < 0.34) { opts.age = RI(5, 8); opts.milesHigh = true; }
    var v = genVehicle(G.brand, opts);
    var des = 0;
    if (v.age <= 2) des += FE.DESIRE_AGE;
    if (FE.TRIMS[v.trim].t === 'Top') des += FE.DESIRE_TOP;
    var cn = FE.COLOURS[v.colour].c;
    if (cn === 'White' || cn === 'Black' || cn === 'Grey') des += FE.DESIRE_COLOUR;
    // rival bidders can see condition, history and mileage too — visible
    // quality is priced in, so the edge is in what the room undervalues
    des += (v.cond - 3) * 0.06;
    if (FE.HISTORY[v.hist].h === 'Full') des += 0.08;
    if (FE.HISTORY[v.hist].h === 'None') des -= 0.12;
    des -= ((v.miles - v.age * FE.MILES_PER_YEAR) / 10000) * 0.03;
    if (v.age === 3) des += 0.05;
    var adj = brand().buyAdj + des * 0.05;
    var pct = Math.min(U(FE.BUY_PCT_LOW + adj, FE.BUY_PCT_HIGH + adj), FE.BUY_PCT_CAP);
    v.hammer = r25(v.retail * pct);
    var M = FE.MODELS[v.model];
    var baseDays = M.days * FE.AGE[v.age][1] * FE.COLOURS[v.colour].d * FE.HISTORY[v.hist].d;
    v.estDays = [Math.round(baseDays * 0.8), Math.round(baseDays * 1.25)];
    v.estGross = v.retail - v.hammer;
    v.wide = (v.cond <= 2 || FE.COLOURS[v.colour].d >= 1.05);
    v.risk = scoreLot(v);
    lots.push(v);
  }
  // Vas (trader) casts an eye over the lanes and rates one gamble as worth it
  if (staffHasTrait('trader')) {
    var gambles = lots.filter(function (l) { return l.risk.flavour === 'gamble'; });
    if (gambles.length) gambles[Math.floor(rnd() * gambles.length)].vasFlag = true;
  }
  return lots;
}

FE.buyLot = function (lotId) {
  var idx = -1;
  G.lots.forEach(function (l, i) { if (l.id === lotId) idx = i; });
  if (idx < 0) return { ok: false, msg: 'Lot gone.' };
  var v = G.lots[idx];
  if (usedSlots() >= totalSlots()) return { ok: false, msg: 'No free pitches. Sell something or buy land.' };
  var premium = Math.round(v.hammer * FE.BUYER_PREMIUM);
  var total = v.hammer + premium + FE.TRANSPORT;
  if (FE.spendPower() < total) {
    return { ok: false, msg: FE.financeEnabled()
      ? 'Beyond your cash and stocking-finance limit.'
      : 'Not enough cash — turn on stocking finance in the Office to buy on credit.' };
  }
  G.lots.splice(idx, 1);
  v.cost.hammer = v.hammer; v.cost.premium = premium; v.cost.transport = FE.TRANSPORT;
  v.boughtWk = G.week; v.arrivedWk = G.week; v.status = 'stock';
  var tp = truePrepFor(v, v.hammer);
  v.truePrep = tp.amount; v.blowout = tp.blowout;
  // auction cars are transported + prepped, so they land on the forecourt
  // during the week rather than instantly. Weeks 1-2 arrive at once (hope curve).
  v.arrived = (G.week <= 2);
  if (v.arrived) autoPlace(v); else v.slot = null;
  G.stock.push(v);
  pay(v.hammer + premium, 'auction', 'Hammer + premium — ' + carName(v));
  pay(FE.TRANSPORT, 'auction', 'Transport');
  FE.save();
  return { ok: true, car: v };
};

function autoPlace(v) {
  var n = totalSlots(), taken = {}, i;
  G.stock.forEach(function (c) { if (c.slot != null && (c.status === 'stock' || c.status === 'sold')) taken[c.slot] = 1; });
  var internal = site().int;
  // expensive cars head inside; everything else fills the yard from the front
  if (internal > 0 && v.retail > brand().avgRetail * 1.05) {
    for (i = 0; i < internal; i++) if (!taken[i]) { v.slot = i; return; }
  }
  for (i = internal; i < n; i++) if (!taken[i]) { v.slot = i; return; }
  for (i = 0; i < internal; i++) if (!taken[i]) { v.slot = i; return; }
  v.slot = null;
}

function slotMult(idx) {
  if (idx == null) return 0.85;
  var internal = site().int;
  if (idx < internal) return 1.25;
  var ext = totalSlots() - internal, p = (idx - internal) / Math.max(ext, 1);
  if (p < 0.2) return 1.15;      // roadside
  if (p < 0.5) return 1.05;      // front row
  return 0.9;                    // back corners
}
FE.slotMult = slotMult;
FE.moveCar = function (carId, slot) {
  var car = null;
  G.stock.forEach(function (c) { if (c.id === carId) car = c; });
  if (!car) return;
  var other = null;
  G.stock.forEach(function (c) { if (c.slot === slot && (c.status === 'stock' || c.status === 'sold')) other = c; });
  if (other) other.slot = car.slot;
  car.slot = slot;
  FE.save();
};
FE.reprice = function (carId, price) {
  G.stock.forEach(function (c) { if (c.id === carId) c.screen = Math.max(100, Math.round(price)); });
  FE.save();
};

/* ---------- trade out ---------- */
function tradeValue(c) {
  var base = Math.min(carCost(c) * U(0.9, 0.97), c.retail * 0.84);
  if (daysIn(c) > 60) base -= c.retail * 0.02;
  if (daysIn(c) > 90) base -= c.retail * 0.02;
  if (G.staff && staffHasTrait('trader')) base += c.retail * 0.02;  // Vas knows the trade
  return r25(base);
}
FE.tradeValue = tradeValue;
FE.tradeOut = function (carId) {
  var car = null;
  G.stock.forEach(function (c) { if (c.id === carId && c.status === 'stock') car = c; });
  if (!car) return null;
  var v = tradeValue(car);
  car.status = 'traded';
  car.soldWk = G.week;
  earn(v, 'Traded out — ' + carName(car));
  var net = v - acq(car) - car.holdCost;
  if (G.weekly) {
    G.weekly.trades.push({ car: car, value: v, net: net });
    if (net < 0) G.weekly.losses.push({ name: carName(car) + ' (' + daysIn(car) + ' days)', amt: net, why: 'Traded out below cost' });
  }
  FE.save();
  return { value: v, net: net };
};

/* ---------- shocks ---------- */
function activeShock(id) {
  var f = null;
  G.shocks.forEach(function (s) { if (s.id === id && s.until >= G.week) f = s; });
  return f;
}
FE.saleActive = function () { return !!activeShock('summerSale'); };
function fireShock(id) {
  var def = FE.SHOCK_DEFS[id], txt = def.blurb, until = G.week, hit = 0;
  if (id === 'launch') {
    var counts = {}, best = null, bestN = 0;
    inStock().forEach(function (c) { if (!c.isNew) { counts[c.model] = (counts[c.model] || 0) + 1; if (counts[c.model] > bestN) { bestN = counts[c.model]; best = c.model; } } });
    if (best == null) best = pick(FE.MODELS.map(function (m, i) { return m.b === G.brand ? i : -1; }).filter(function (i) { return i >= 0; }));
    var cut = U(0.06, 0.09);
    inStock().forEach(function (c) { if (c.model === best && !c.isNew) { c.retail = r25(c.retail * (1 - cut)); c.screen = Math.min(c.screen, r25(c.screen * (1 - cut * 0.6))); hit++; } });
    txt = txt.replace('{model}', G.brand + ' ' + FE.MODELS[best].m) + ' ' + hit + ' of yours devalued ' + Math.round(cut * 100) + '% overnight.';
  } else if (id === 'fuelSentiment') {
    var cut2 = U(0.05, 0.08);
    inStock().forEach(function (c) { if (c.fuel === 'Diesel') { c.retail = r25(c.retail * (1 - cut2)); hit++; } });
    until = G.week + 6;
    txt += ' ' + hit + ' diesel cars devalued ' + Math.round(cut2 * 100) + '%. Expect them to sit for a while.';
  } else if (id === 'priceCut') {
    var cut3 = U(0.04, 0.07);
    inStock().forEach(function (c) { if (!c.isNew) { c.retail = r25(c.retail * (1 - cut3)); hit++; } });
    txt += ' Your used stock is down ' + Math.round(cut3 * 100) + '% across the board (' + hit + ' cars).';
  } else if (id === 'rateRise') {
    until = G.week + 4;
    txt += ' Effects will last around a month.';
  } else if (id === 'fuelSpike') {
    until = G.week + 4;
    txt += ' Large-engined stock will barely move for a few weeks.';
  } else if (id === 'scrappage') {
    until = G.week + 3;
    txt += ' Footfall up, margins down, for a few weeks.';
  } else if (id === 'summerSale') {
    until = G.week + 5;   // late Jul through the end of August
    txt += ' It runs to the end of August. Expect a busy but thin-margined few weeks — move metal on volume, not on gross.';
  }
  G.shocks.push({ id: id, until: until });
  mail('Trade press', def.name, txt, 'shock');
}

/* ---------- start of week ---------- */
function startWeek() {
  var s = season();
  G.phase = 'auction';
  G.weekly = {
    wk: G.week, sales: [], trades: [], losses: [], feed: [],
    costs: {}, front: 0, back: 0, units: 0, attached: 0, pushes: 0, gradeLowSold: 0,
    financed: 0, financeComm: 0,
    staffUnits: {}, staffGross: {}
  };
  // collections: sold cars leave, freeing pitches
  G.stock.forEach(function (c) { if (c.status === 'sold' && c.soldWk < G.week) { c.status = 'collected'; c.slot = null; } });
  // hold cost accrues on everything still here
  G.stock.forEach(function (c) {
    if (c.status === 'stock' || c.status === 'sold') {
      c.holdCost += carCost(c) * FE.FLOORPLAN_APR / 52;
    }
  });
  // seasonal devaluation (pre-plate softening + plate drop)
  if (s.dev) {
    inStock().forEach(function (c) { if (!c.isNew) c.retail = r25(c.retail * (1 - s.dev)); });
    if (s.plate) mail('Trade press', 'Plate change — new registrations out', 'The new plate is on the road. Outgoing-plate stock has softened ' + Math.round(s.dev * 100) + '% and part-exchange volume is surging.', 'shock');
  }
  // scheduled + random shocks
  if (s.shock) fireShock(s.shock);
  else if (G.week > 8 && G.randShocksThisYear < 2 && rnd() < 0.025) {
    G.randShocksThisYear++;
    fireShock(pick(['priceCut', 'rateRise', 'fuelSpike', 'scrappage']));
  }
  if ((G.week - 1) % 52 === 0 && G.week > 1) { G.randShocksThisYear = 0; G.totals.unitsYr = 0; }

  // factory orders arriving
  G.orders = G.orders.filter(function (o) {
    if (o.dueWk <= G.week) { deliverNewCar(o); return false; }
    return true;
  });

  // pending construction completing (land expansion, franchise fit-out)
  G.pendingBuilds = G.pendingBuilds.filter(function (bd) {
    if (bd.dueWk > G.week) return true;
    if (bd.kind === 'expansion') {
      G.extraSlots += bd.slots; G.extraUtil += bd.util;
      G.expansionsDone.push(bd.id);
      mail('Site works', bd.name + ' — ready', 'The new ground is surfaced and lined. ' + bd.slots + ' extra pitches are open for stock.', 'info');
    } else if (bd.kind === 'franchise') {
      G.franchise.live = true;
      mail(G.brand + ' UK', 'Brand corner ready', 'The showroom fit-out is done and the signage is up. The order window is open — place your first factory order whenever you like.', 'info');
    }
    return false;
  });

  // fresh auction list
  G.lots = genLots();
  G.lotsWk = G.week;
  mail('Central Auctions', 'Today’s list — ' + FE.LOTS_PER_WEEK + ' lots', 'Fresh lots in the lanes, including a run of older, higher-mileage bargains. They expire when the next list lands: miss a day and the good ones are gone.', 'auction');

  // week-1 flavour
  if (G.week === 1) {
    mail('Hartley & Crumb, solicitors', 'Your late aunt’s estate', 'The funds have cleared: ' + money(FE.START_CASH) + ', less the premises. Her note reads: "Don’t let them see you coming, love."\n\nHer old contact book is in the bottom drawer. Three of her people are still waiting on a car: one wants a ' + G.wantedSegs[0] + ', one a ' + G.wantedSegs[1] + ', one a ' + G.wantedSegs[2] + '. If you’ve got what they’re after when they call in, they’ll hardly need selling to.', 'info');
    mail('Recruitment desk', 'Sales executives — ' + G.candidates.length + ' available now', 'You can start hiring today — you need at least two on the floor, the GSM does not sell. The agency has ' + G.candidates.length + ' names on the books right now and more coming next week. Fees are payable up front. See the Staff tab.', 'info');
  }
  if (G.week === 2 && G.candidatePool && G.candidatePool.length) {
    G.candidates = G.candidates.concat(G.candidatePool);
    var newCount = G.candidatePool.length;
    G.candidatePool = [];
    mail('Recruitment desk', newCount + ' more candidates on the books', 'The agency has sent through the rest of its list — ' + newCount + ' more names in the Staff tab. Full roster now available.', 'info');
  }
  if (G.week === FE.FRANCHISE.unlockWk && !G.franchise) {
    mail(G.brand + ' UK', 'Franchise opportunity', 'The manufacturer is offering a franchise agreement: new ' + G.brand + ' stock on your forecourt. ' + money(FE.FRANCHISE.fee) + ' a year, minimum ' + FE.FRANCHISE.minSlots + ' pitches committed, and a volume target of ' + FE.FRANCHISE.targetPerSlot + ' units per pitch per year. A word of advice from the trade: commit properly or not at all. Half-hearted franchises underperform used-only sites. Open the Franchise panel in the Office to decide.', 'info');
  }
  // holiday requests (Jul/Aug)
  var yw = ((G.week - 1) % 52) + 1;
  if (yw >= 24 && yw <= 31) {
    G.staff.forEach(function (st) {
      if (!G.holidayPlan[st.id] && rnd() < 0.18) {
        G.holidayPlan[st.id] = G.week + 1;
        mail(st.name, 'Holiday request', st.name + ' wants next week off. It’s the school holidays. Approve and they’re off the floor for a week; refuse and it will be remembered.', 'holiday', { staffId: st.id });
      }
    });
  }
  // Mon's pay review
  if (yw >= 20 && !G.flags.monReviewDone) {
    var mon = staffById('mon');
    if (mon) {
      G.flags.monReviewDone = true;
      mail('Mon', 'Pay review — as discussed', 'Boss — twenty weeks in, numbers speak for themselves. I want another £4,000 on the basic or I’ll have to listen to the calls I’m getting. Your move.', 'payreview', { staffId: 'mon', amount: 4000 });
    }
  }
  // poaching risk on low basic
  if (G.week >= 15 && G.salary === 0 && G.staff.length > 2 && rnd() < 0.03) {
    var star = null, bg = -1;
    G.staff.forEach(function (st) { if (st.totGross > bg && !st.poached) { bg = st.totGross; star = st; } });
    if (star && bg > 20000) {
      star.poached = true;
      mail(star.name, 'Been approached', star.name + ' has had an offer from a rival site — better basic. Match it (adds £115/wk to their cost) or they walk at the end of next week.', 'poach', { staffId: star.id });
    }
  }
  // franchise allocation push at quarter starts
  if (G.franchise && (yw === 1 || yw === 14 || yw === 27 || yw === 40)) {
    var alloc = RI(2, 4);
    mail(G.brand + ' UK', 'Quarterly allocation', 'The factory is pushing ' + alloc + ' units of allocation at you this quarter. Accept and they arrive next week, invoiced at 92% of list. Decline and regional will make a note.', 'alloc', { n: alloc });
  }
  FE.save();
}

function staffById(id) {
  var f = null;
  G.staff.forEach(function (s) { if (s.id === id) f = s; });
  return f;
}

/* ---------- staff ---------- */
FE.hire = function (candId) {
  if (G.staff.length >= site().maxStaff) return { ok: false, msg: 'This site supports a maximum of ' + site().maxStaff + ' sales executives.' };
  var idx = G.candidates.indexOf(candId);
  if (idx < 0) return { ok: false, msg: 'No longer available.' };
  var R = null;
  FE.ROSTER.forEach(function (r) { if (r.id === candId) R = r; });
  if (G.cash < R.fee) return { ok: false, msg: 'Cannot cover the agency fee.' };
  G.candidates.splice(idx, 1);
  if (R.fee > 0) pay(R.fee, 'misc', 'Agency fee — ' + R.name);
  G.staff.push({
    id: R.id, name: R.name, hiredWk: G.week, morale: 1.0, growth: 1.0,
    trained: {}, offUntil: 0, extraBasic: 0, poached: false, leaving: 0,
    totUnits: 0, totGross: 0, fniDeals: 0, weeks: 0, lastUnits: 0, lastGross: 0
  });
  mail(R.name, 'First day', R.name + ' starts on the floor this week. ' + R.rep + '.', 'info');
  FE.save();
  return { ok: true };
};

FE.sackCost = function (id) {
  var st = staffById(id);
  if (!st) return 0;
  var weeksServed = Math.max(0, G.week - st.hiredWk);
  var basicWk = salary().basic / 52 + (st.extraBasic || 0);
  return Math.round(basicWk * (weeksServed >= 26 ? 4 : 2));   // ~statutory notice pay
};
FE.sackStaff = function (id) {
  var st = staffById(id);
  if (!st) return { ok: false, msg: 'Not found.' };
  var redundancy = FE.sackCost(id);
  if (G.cash < redundancy) return { ok: false, msg: 'Can’t cover the ' + money(redundancy) + ' redundancy.' };
  G.staff = G.staff.filter(function (s) { return s.id !== id; });
  if (redundancy > 0) pay(redundancy, 'misc', 'Redundancy — ' + st.name);
  // the rest of the team notices — a small morale dip
  G.staff.forEach(function (s) { s.morale = Math.max(0.55, s.morale - 0.07); });
  mail('Accounts', 'Let ' + st.name + ' go', st.name + ' has been let go' + (redundancy > 0 ? ' with ' + money(redundancy) + ' redundancy' : '') + '. The rest of the floor has noticed — expect a small dip in mood.', 'info');
  FE.save();
  return { ok: true, redundancy: redundancy };
};

FE.train = function (staffId, courseId) {
  var st = staffById(staffId);
  var C = null;
  FE.TRAINING.forEach(function (c) { if (c.id === courseId) C = c; });
  if (!st || !C) return { ok: false, msg: 'Not found.' };
  if (st.trained[courseId]) return { ok: false, msg: 'Already completed.' };
  if (C.needs && !st.trained[C.needs]) return { ok: false, msg: 'Needs ' + C.needs.toUpperCase() + ' first.' };
  if (G.cash < C.cost) return { ok: false, msg: 'Not enough cash.' };
  if (st.offUntil > G.week) return { ok: false, msg: st.name + ' is already off the floor.' };
  if (st.id === 'terry' && (courseId === 'fni' || courseId === 'fni2')) {
    mail('Terry', 'Re: the finance course', 'I’ve been at this thirty-eight years and I have never once sold a man an insurance product he didn’t ask for. I’m not starting now. Send Priya.', 'info');
    return { ok: false, msg: 'Terry refuses point blank.' };
  }
  pay(C.cost, 'training', C.name + ' — ' + st.name);
  st.trained[courseId] = true;
  st.offUntil = G.week + Math.ceil(C.weeks);
  st.offFraction = C.weeks;   // 0.5 = half week off floor
  FE.save();
  return { ok: true };
};

FE.changeSalary = function (idx) {
  var yr = Math.ceil(G.week / 52);
  if (G.salaryChangedYr === yr) return { ok: false, msg: 'You can only restructure pay once per year.' };
  G.salary = idx; G.salaryChangedYr = yr;
  G.staff.forEach(function (s) { s.morale = Math.max(0.6, s.morale - 0.12); });
  mail('Accounts', 'Pay restructure', 'The whole team is now on ' + FE.SALARIES[idx].name + '. Nobody loves having their pay changed under them — expect a mood dip.', 'info');
  FE.save();
  return { ok: true };
};

function execWeekCap(st) {
  var R = null;
  FE.ROSTER.forEach(function (r) { if (r.id === st.id) R = r; });
  var mid = (R.lo + R.hi) / 2, draw;
  if (R.trait === 'wildcard') draw = U(R.lo, R.hi);
  else draw = mid + (U(R.lo, R.hi) - mid) * 0.5;
  if (R.trait === 'grows') draw *= st.growth;
  if (R.trait === 'prestige' && brand().avgRetail < 18000) draw *= 0.4;
  draw *= brandCapacity() / 3.1;
  draw *= st.morale;
  if (st.trained.sales) draw *= 1.15;
  if (st.trained.prod) draw *= 1.10;
  if (st.offUntil > G.week) draw *= (st.offFraction === 0.5 ? 0.5 : 0);
  if (st.onHoliday === G.week) draw = 0;
  return draw;
}

function crowdEff(n) {
  if (n <= 0) return 0;
  var sum = 0, i;
  for (i = 0; i < n; i++) sum += Math.pow(FE.CROWDING, i);
  return sum / n;
}

/* is any currently-active exec carrying this trait? (site-wide effects) */
function staffHasTrait(trait) {
  var found = false;
  G.staff.forEach(function (st) {
    if (st.leaving && st.leaving <= G.week) return;
    if (st.onHoliday === G.week || st.offUntil > G.week) return;
    var R = null;
    FE.ROSTER.forEach(function (r) { if (r.id === st.id) R = r; });
    if (R && R.trait === trait) found = true;
  });
  return found;
}
FE.staffHasTrait = staffHasTrait;

/* ---------- showroom simulation ---------- */
FE.enterShowroom = function () {
  G.phase = 'showroom';
  var events = [];

  // cars still in transit arrive (and get prepped) staggered through the week;
  // already-placed cars that still need prep get a plain prep bill
  G.stock.forEach(function (c) {
    if (c.status !== 'stock') return;
    if (!c.arrived) events.push({ kind: 'arrival', carId: c.id });
    else if (!c.prepPaid) events.push({ kind: 'prep', carId: c.id });
  });

  var s = season();
  var yw = ((G.week - 1) % 52) + 1;

  // staff capacity
  var caps = {}, capTotal = 0;
  G.staff.forEach(function (st) {
    if (st.leaving && st.leaving <= G.week) return;
    caps[st.id] = execWeekCap(st);
  });
  var n = Object.keys(caps).length;
  var eff = crowdEff(n);
  Object.keys(caps).forEach(function (k) { caps[k] *= eff; capTotal += caps[k]; });
  if (G.dept.building && G.dept.building >= G.week) capTotal *= 0.8;

  // demand
  var starM = starFootfall(G.stars);
  var adM = adFactor();
  var conv = FE.BASE_CONV * presConvFactor();
  if (activeShock('rateRise')) conv *= 0.85;
  var foot = brand().footfall * (activeShock('scrappage') ? 1.3 : 1);
  if (activeShock('summerSale')) foot *= 1.5;   // the sale pulls crowds through the summer lull
  if (staffHasTrait('magnet')) foot *= 1.04;   // Tomi brings the crowd in
  var newShare = 0;
  if (G.franchise) {
    var newCount = inStock().filter(function (c) { return c.isNew; }).length;
    newShare = Math.min(1, newCount / Math.max(totalSlots(), 1));
  }
  var demand = foot * s.d * starM * adM * conv * (1 - FE.FRANCHISE.cannibal * newShare);
  var stk = inStock().filter(function (c) { return !c.isNew; });
  // a thin forecourt converts badly — walk-ins want a choice. During the weeks
  // 1-2 hope curve the starter forecourt gets a gentler penalty so it feels alive.
  var thinDenom = brand().stockNeeded * (G.week <= 2 ? 0.32 : 0.6);
  demand *= clamp(stk.length / thinDenom, 0.1, 1);
  var stockCap = Math.ceil(stk.length * 0.4);

  var unitsF = Math.min(demand, capTotal, stockCap);
  var units = Math.floor(unitsF) + (rnd() < (unitsF % 1) ? 1 : 0);

  // scaffolding — weeks 1-4 (hope curve)
  var prequal = yw === 1 ? 3 : yw === 2 ? 2 : (yw === 3 || yw === 4) ? 1 : 0;
  if (G.week <= 4) {
    var segs = [];
    FE.MODELS.forEach(function (m) { if (m.b === G.brand && segs.indexOf(m.seg) < 0) segs.push(m.seg); });
    var i;
    for (i = 0; i < prequal; i++) {
      // week 1: the three named contacts from the aunt's book; later weeks random
      var seg = (G.week === 1 && G.wantedSegs && G.wantedSegs[i]) ? G.wantedSegs[i] : pick(segs);
      events.push({ kind: 'prequal', seg: seg });
    }
    if (G.week === 1) events.push({ kind: 'tradebuyer' });
  }

  // new car sales (separate stream, still uses staff)
  var newSold = 0;
  if (G.franchise) {
    var newStock = inStock().filter(function (c) { return c.isNew; });
    var perWk = s.plate ? 7 / FE.FRANCHISE.daysPlate : 7 / FE.FRANCHISE.daysOff;
    var preRegDrag = inStock().some(function (c) { return c.isPreReg; }) ? 0.8 : 1;
    var nf = newStock.length * perWk * starM * Math.max(s.d, 0.6) * preRegDrag;
    newSold = Math.floor(nf) + (rnd() < (nf % 1) ? 1 : 0);
    newSold = Math.min(newSold, newStock.length, Math.max(0, Math.ceil(capTotal) - units));
  }

  // split used units into interactive & auto
  var interactive = Math.min(units, Math.max(1, Math.round(units * 0.55)), 6);
  if (units === 0) interactive = 0;
  var auto = units - interactive;
  var i2;
  for (i2 = 0; i2 < interactive; i2++) {
    var withPX = rnd() < (s.plate ? 0.45 : 0.28);
    events.push({ kind: 'offer', px: withPX });
  }
  for (i2 = 0; i2 < auto; i2++) events.push({ kind: 'auto' });
  for (i2 = 0; i2 < newSold; i2++) events.push({ kind: 'autoNew' });

  // a chancer on aged stock, outside the demand count
  var aged = stk.filter(function (c) { return daysIn(c) >= 60; });
  if (aged.length && rnd() < 0.5) events.push({ kind: 'offer', crazy: true });

  // occasional private seller offering a car straight to the GSM (from wk 3),
  // only if there's a pitch free to put it on
  if (G.week >= 3 && usedSlots() < totalSlots() && rnd() < FE.PRIVATE_SELLER_P) {
    events.push({ kind: 'privateseller' });
  }

  // prep/arrival events are staggered THROUGH the week rather than dumped up
  // front, so stock trickles onto the forecourt as the week trades
  var special = events.filter(function (e) { return e.kind === 'prep' || e.kind === 'arrival'; });
  var tail = events.filter(function (e) { return e.kind !== 'prep' && e.kind !== 'arrival'; });
  tail.sort(function () { return rnd() - 0.5; });
  // guaranteed first sale: make sure a prequal (if any) leads
  tail.sort(function (a, b) {
    var pa = a.kind === 'prequal' ? 0 : 1, pb = b.kind === 'prequal' ? 0 : 1;
    return G.flags.firstSaleDone ? 0 : pa - pb;
  });
  special.sort(function () { return rnd() - 0.5; });
  // weave the special events into the front ~70% so cars arrive early enough to sell
  var woven = tail.slice();
  special.forEach(function (sp, i) {
    var span = Math.max(1, woven.length);
    var pos = Math.min(woven.length, Math.floor((i + 0.5) / Math.max(1, special.length) * span * 0.7));
    woven.splice(pos, 0, sp);
  });
  G.events = woven;
  G.eventIdx = 0;
  G.weekly.caps = caps;
  G.weekly.capTotal = capTotal;
  G.weekly.demand = demand;
  FE.save();
};

function adFactor() {
  if (G.week <= 4) return 1.0;
  return FE.AD_TIERS[G.adTier].mult;
}
function adCost() {
  var yw = ((G.week - 1) % 52) + 1;
  if (G.week === 1) return 0;
  if (G.week === 2) return 300;
  if (G.week <= 4) return 600;
  return FE.AD_TIERS[G.adTier].cost;
}

function pickSaleCar(opts) {
  opts = opts || {};
  var cands = inStock().filter(function (c) {
    if (!c.arrived) return false;
    if (opts.isNew != null && c.isNew !== opts.isNew) return false;
    if (opts.seg && FE.MODELS[c.model].seg !== opts.seg) return false;
    if (opts.aged && daysIn(c) < 60) return false;
    return true;
  });
  if (!cands.length) return null;
  return pickW(cands, function (c) {
    var w = slotMult(c.slot);
    w *= 1 / Math.max(FE.COLOURS[c.colour].d, 0.8);
    var d = daysIn(c);
    if (opts.aged) w *= 1 + d / 60;
    else w *= d > 90 ? 0.55 : d > 60 ? 0.75 : 1;
    var ratio = c.screen / Math.max(c.retail, 1);
    w *= clamp(1 - (ratio - 1) * 6, 0.1, 1.6);
    if (ratio < 1) w *= clamp(1 + (1 - ratio) * 3, 1, 1.7);
    if (c.big && activeShock('fuelSpike')) w *= 0.25;
    if (c.fuel === 'Diesel' && activeShock('fuelSentiment')) w *= 0.7;
    var yw = ((G.week - 1) % 52) + 1;
    var seg = FE.MODELS[c.model].seg;
    if ((seg === 'SUV' || seg === 'Crossover') && yw >= 37 && yw <= 44) w *= 1.15;
    return w;
  });
}

function pickExec() {
  var ids = Object.keys(G.weekly.caps || {});
  if (!ids.length) return null;
  var id = pickW(ids, function (k) { return Math.max(G.weekly.caps[k], 0.05); });
  return staffById(id);
}

FE.currentEvent = function () {
  if (G.phase !== 'showroom') return null;
  while (G.eventIdx < G.events.length) {
    var ev = G.events[G.eventIdx];
    if (!ev.built) buildEvent(ev);
    if (ev.dead) { G.eventIdx++; continue; }
    return ev;
  }
  return null;
};
FE.advanceEvent = function () { G.eventIdx++; FE.save(); };
FE.eventsLeft = function () {
  var c = 0, i;
  for (i = G.eventIdx; i < G.events.length; i++) if (!G.events[i].dead) c++;
  return c;
};

function buildEvent(ev) {
  ev.built = true;
  if (ev.kind === 'prep') {
    var car = null;
    G.stock.forEach(function (c) { if (c.id === ev.carId) car = c; });
    if (!car || car.prepPaid || car.status !== 'stock') { ev.dead = true; return; }
    ev.car = car;
    return;
  }
  if (ev.kind === 'arrival') {
    var carA = null;
    G.stock.forEach(function (c) { if (c.id === ev.carId) carA = c; });
    if (!carA || carA.status !== 'stock') { ev.dead = true; return; }
    ev.car = carA;
    return;
  }
  if (ev.kind === 'prequal') {
    var c2 = pickSaleCar({ seg: ev.seg, isNew: false });
    if (!c2) {
      ev.noStock = true;
      return;
    }
    // guaranteed first sale, else 85%
    var converts = !G.flags.firstSaleDone ? true : rnd() < 0.85;
    if (!converts) { ev.walked = true; return; }
    ev.car = c2;
    ev.offer = r25(c2.screen * U(0.97, 1.0));
    ev.exec = pickExec();
    return;
  }
  if (ev.kind === 'tradebuyer') {
    return; // UI picks the car
  }
  if (ev.kind === 'offer') {
    var c3 = pickSaleCar({ isNew: false, aged: ev.crazy || false });
    if (!c3) { ev.dead = true; return; }
    ev.car = c3;
    ev.exec = pickExec();
    if (!ev.exec && G.week > 2) { ev.dead = true; return; }  // nobody on the floor
    var d = daysIn(c3);
    var roll = rnd();
    var type = ev.crazy ? 'crazy' : roll < (d > 75 ? 0.3 : 0.45) ? 'fair' : roll < 0.85 ? 'cheeky' : 'crazy';
    ev.type = type;
    var f = type === 'fair' ? U(0.97, 0.99) : type === 'cheeky' ? U(0.90, 0.925) : U(0.60, 0.76);
    if (activeShock('summerSale') && type !== 'crazy') f *= U(0.955, 0.975);   // sale shoppers push harder
    ev.offer = r25(c3.screen * f);
    ev.serious = type === 'fair' ? U(0.7, 0.95) : type === 'cheeky' ? U(0.5, 0.85) : U(0.1, 0.6);
    ev.read = pick(FE.READS[type]);
    ev.buyer = pick(FE.FIRST_NAMES) + ' ' + pick(FE.SURNAMES);
    if (ev.px) {
      ev.pxCar = genVehicle(G.brand, { age: RI(4, 8) });
      ev.pxCar.isPX = true;
      ev.pxGuide = r25(ev.pxCar.retail * 0.78);
    }
    return;
  }
  if (ev.kind === 'auto') {
    var c4 = pickSaleCar({ isNew: false });
    if (!c4) { ev.dead = true; return; }
    var exec = pickExec();
    if (!exec && G.week > 2) { ev.dead = true; return; }
    var res = closeSale(c4, autoPrice(c4, exec), exec, null);
    ev.result = res; ev.silent = true;
    return;
  }
  if (ev.kind === 'autoNew') {
    var c5 = pickSaleCar({ isNew: true });
    if (!c5) { ev.dead = true; return; }
    var exec2 = pickExec();
    var price = r25(c5.retail * (1 - U(0.005, 0.02)));
    var res2 = closeSale(c5, price, exec2, null);
    ev.result = res2; ev.silent = true;
    return;
  }
  if (ev.kind === 'privateseller') {
    if (usedSlots() >= totalSlots()) { ev.dead = true; return; }
    // private sellers often offload older, higher-mileage cars, occasionally a gem
    var opts = rnd() < 0.55 ? { age: RI(4, 8), milesHigh: rnd() < 0.6 } : {};
    var v = genVehicle(G.brand, opts);
    v.isPX = true;                                   // uninspected, like a PX — bites more often
    v.faultP = clamp(v.faultP + 0.09, 0.02, 0.5);
    // asking: below auction guide (no fees, wants a quick private sale)
    var asking = r25(v.retail * U(0.66, 0.78));
    ev.pcar = v;
    ev.asking = asking;
    ev.estGross = v.retail - asking;
    var baseDays = FE.MODELS[v.model].days * FE.AGE[v.age][1] * FE.COLOURS[v.colour].d * FE.HISTORY[v.hist].d;
    ev.estDays = [Math.round(baseDays * 0.8), Math.round(baseDays * 1.25)];
    ev.risk = scoreLot(v);
    ev.seller = pick(FE.FIRST_NAMES) + ' ' + pick(FE.SURNAMES);
    ev.firm = rnd() < 0.4;                            // some sellers won't budge
    return;
  }
}

function autoPrice(c, exec) {
  var h = brand().haggle;
  var price = c.screen * (1 - U(h[0], h[1]));
  // slow colours need their cut to actually move
  var dm = FE.COLOURS[c.colour].d;
  if (dm >= 1.05 && daysIn(c) > c.daysTrue * 0.7) {
    price *= 1 - (dm > 1.25 ? FE.SLOW_CUT_BAD : FE.SLOW_CUT_MILD);
    c.discounted = true;
  }
  if (activeShock('scrappage')) price *= 0.97;
  if (activeShock('summerSale')) price *= 0.955;   // event pricing eats the gross
  if (exec) {
    var R = null;
    FE.ROSTER.forEach(function (r) { if (r.id === exec.id) R = r; });
    if (R) {
      var cost = carCost(c), front = price - cost;
      if (front > 0 && R.gross !== 1) price = cost + front * R.gross;
      if (R.trait === 'discounts') price *= 0.985;
    }
  }
  return r25(Math.min(price, c.screen));
}

FE.payPrep = function (ev) {
  var car = ev.car;
  // a transit car lands on the forecourt now (arrival + prep in one)
  if (!car.arrived) { car.arrived = true; if (car.slot == null) autoPlace(car); }
  pay(car.truePrep, 'prep', 'Prep — ' + carName(car));
  car.cost.prep = car.truePrep;
  car.prepPaid = true;
  var firstBlowout = car.blowout && !G.flags.prepTip;
  if (car.blowout && G.flags.prepTip === false) G.flags.prepTip = true;
  FE.save();
  return { amount: car.truePrep, blowout: car.blowout, tip: firstBlowout };
};

/* ---------- closing a sale ---------- */
function closeSale(car, price, exec, fniChoice) {
  car.status = 'sold';
  car.soldWk = G.week;
  var front, back = 0, attached = false;

  // front gross = price achieved minus buy-in (hammer + premium + transport).
  // Prep is expensed in the week it's paid, so it isn't double-counted here.
  if (car.isNew) {
    front = price - acq(car) + Math.round(car.list * FE.FRANCHISE.holdback);
  } else {
    front = price - acq(car);
  }

  // back end
  var execFni = 1.0, execName = 'you';
  if (exec) {
    var R = null;
    FE.ROSTER.forEach(function (r) { if (r.id === exec.id) R = r; });
    execFni = R.fni;
    execName = exec.name;
    if (exec.trained.fni) execFni *= 1.35;
    if (exec.trained.fni2) execFni *= 1.25;
  } else {
    execFni = 0.9;
  }
  var attach = FE.FNI_BASE * execFni * brand().attachMult;
  if (activeShock('rateRise')) attach *= 0.8;
  if (fniChoice === 'push') { attach *= 1.3; G.weekly.pushes++; }
  if (fniChoice === 'soft') attach *= 0.7;
  attach = clamp(attach, 0.02, 0.92);
  if (rnd() < attach) {
    attached = true;
    back = Math.round(FE.FNI_BACKEND * U(0.75, 1.35));
  }

  // split the back-end into finance commission vs products, for visibility
  // (balance-neutral: financeComm + products === back). Terry never sells finance.
  var financed = false, financeComm = 0;
  var noFinance = exec && exec.id === 'terry';
  if (attached && !noFinance && rnd() < FE.FINANCE_TAKEUP) {
    financed = true;
    financeComm = Math.round(back * U(FE.FINANCE_COMM_SHARE[0], FE.FINANCE_COMM_SHARE[1]));
  }

  earn(price, 'Sold — ' + carName(car) + (execName !== 'you' ? ' (' + execName + ')' : ''));
  if (financeComm) earn(financeComm, 'Finance commission — ' + carName(car));
  if (back - financeComm > 0) earn(back - financeComm, 'F&I products — ' + carName(car));

  car.soldPrice = price; car.soldFront = Math.round(front); car.soldBack = back;
  car.soldBy = exec ? exec.id : 'you';
  car.soldAttached = attached;
  car.soldFinanced = financed; car.soldFinanceComm = financeComm; car.soldProducts = back - financeComm;

  G.weekly.units++;
  G.weekly.front += front;
  G.weekly.back += back;
  if (attached) G.weekly.attached++;
  if (financed) { G.weekly.financed++; G.weekly.financeComm += financeComm; G.totals.financed++; G.totals.financeComm += financeComm; }
  if (car.cond <= 2 && !car.isNew) G.weekly.gradeLowSold++;
  if (exec) {
    G.weekly.staffUnits[exec.id] = (G.weekly.staffUnits[exec.id] || 0) + 1;
    G.weekly.staffGross[exec.id] = (G.weekly.staffGross[exec.id] || 0) + Math.max(front, 0) + back;
    exec.totUnits++; exec.totGross += Math.max(front, 0) + back;
    if (attached) exec.fniDeals++;
  }
  G.totals.units++; G.totals.unitsYr++;

  var netOfHold = front + back - car.cost.prep - car.holdCost;
  var sale = { car: car, price: price, front: Math.round(front), back: back, exec: execName, prep: car.cost.prep, hold: Math.round(car.holdCost), net: Math.round(netOfHold) };
  G.weekly.sales.push(sale);
  if (netOfHold < -50) {
    var why = daysIn(car) > 90 ? 'Sat too long, discounted out' :
      car.blowout ? 'Prep blowout — ' + money(car.truePrep) + ' job' :
      car.discounted ? 'Slow colour, cut to move' : 'Bought too dear';
    G.weekly.losses.push({ name: carName(car) + ' (' + daysIn(car) + ' days)', amt: Math.round(netOfHold), why: why });
  }

  if (car.isNew && G.franchise) { G.franchise.qUnits++; G.franchise.yUnits++; G.franchise.qMargin += Math.max(front, 0); }

  // complaint / review seeds
  var cRisk = 0.03;
  if (exec) {
    var R2 = null;
    FE.ROSTER.forEach(function (r) { if (r.id === exec.id) R2 = r; });
    cRisk = R2.cRisk;
    if (exec.trained.prod) cRisk *= 0.7;
  }
  if (fniChoice === 'push') cRisk += 0.05;
  car.saleComplaintRisk = cRisk;

  // comeback scheduling
  var fp = car.faultP * brand().comebackFreq * (car.isPX ? 1.5 : 1) * (car.isNew ? 0.1 : 1);
  if (rnd() < fp * 0.55) {
    var cc = brand().comebackCost;
    var costC = Math.round(U(cc[0], cc[1]) * (car.cond <= 2 ? 1.6 : 1));
    G.pendingComebacks.push({ carId: car.id, dueWk: G.week + RI(2, 8), cost: costC });
  }

  soldEmail(car, sale);
  reviewMaybe(car, sale, fniChoice);
  if (!G.flags.firstSaleDone) G.flags.firstSaleDone = true;
  FE.save();
  return sale;
}

FE.acceptOffer = function (ev, fniChoice) {
  var s = closeSale(ev.car, ev.offer, ev.exec, fniChoice);
  ev.dead = true;
  return s;
};
FE.counterOffer = function (ev, price) {
  price = Math.min(Math.round(price), ev.car.screen);
  var gap = (price - ev.offer) / Math.max(ev.car.screen - ev.offer, 1);
  var p = ev.serious * (1.05 - 0.85 * clamp(gap, 0, 1));
  if (ev.type === 'crazy') p *= 0.55;
  if (rnd() < p) {
    var s = closeSale(ev.car, r25(price), ev.exec, null);
    ev.countered = true;
    return { won: true, sale: s };
  }
  ev.dead = true;
  starNudge(-0.005);
  return { won: false };
};
FE.declineOffer = function (ev) {
  ev.dead = true;
  FE.save();
};
FE.suggestAlt = function (ev) {
  var seg = FE.MODELS[ev.car.model].seg;
  var alt = pickSaleCar({ isNew: false });
  if (alt && alt.id !== ev.car.id && rnd() < 0.35) {
    var price = autoPrice(alt, ev.exec);
    var s = closeSale(alt, price, ev.exec, null);
    ev.dead = true;
    return { won: true, sale: s, car: alt };
  }
  ev.dead = true;
  return { won: false };
};

/* PX resolution: choice = high | fair | low | trade */
FE.resolvePX = function (ev, choice) {
  var res = { dealOn: false, pxTaken: false };
  var guide = ev.pxGuide;
  if (choice === 'high') {
    res.dealOn = rnd() < 0.95;
    if (res.dealOn) { res.pxTaken = true; res.paid = r25(guide * 1.09); }
  } else if (choice === 'fair') {
    res.dealOn = rnd() < 0.65;
    if (res.dealOn) { res.pxTaken = true; res.paid = guide; }
  } else if (choice === 'low') {
    res.dealOn = rnd() < 0.25;
    if (res.dealOn) { res.pxTaken = true; res.paid = r25(guide * 0.9); }
    else starNudge(-0.01);
  } else if (choice === 'trade') {
    res.dealOn = rnd() < 0.65;
    if (res.dealOn) {
      res.traded = true;
      res.margin = RI(150, 320);
      if (staffHasTrait('trader')) res.margin += RI(60, 140);   // Vas finds the extra
      earn(res.margin, 'PX traded straight out');
    }
  }
  if (res.pxTaken) {
    var car = ev.pxCar;
    car.cost.hammer = res.paid; car.cost.premium = 0; car.cost.transport = 0;
    car.boughtWk = G.week; car.arrivedWk = G.week; car.status = 'stock';
    var tp = truePrepFor(car, res.paid);
    car.truePrep = tp.amount; car.blowout = tp.blowout;
    car.faultP = clamp(car.faultP + 0.08, 0, 0.5);   // five minutes in a car park, not an inspection
    autoPlace(car);
    G.stock.push(car);
    pay(res.paid, 'auction', 'PX taken in — ' + carName(car));
    G.events.push({ kind: 'prep', carId: car.id });
  }
  ev.pxResolved = true; ev.pxResult = res;
  FE.save();
  return res;
};
FE.pxWalk = function (ev) {
  ev.dead = true;
  starNudge(-0.02);
  FE.save();
};

/* trade buyer (week 1) */
FE.tradeBuyerSell = function (ev, carId) {
  var car = null;
  G.stock.forEach(function (c) { if (c.id === carId && c.status === 'stock') car = c; });
  if (!car) return null;
  var v = carCost(car) + 400 + (car.prepPaid ? 0 : car.truePrep * 0);
  // he pays your cost + £400 — prep you haven't spent yet stays unspent
  if (!car.prepPaid) { car.truePrep = 0; car.prepPaid = true; G.events.forEach(function (e) { if (e.kind === 'prep' && e.carId === car.id) e.dead = true; }); }
  car.status = 'traded'; car.soldWk = G.week;
  earn(v, 'Trade buyer — ' + carName(car));
  G.weekly.trades.push({ car: car, value: v, net: 400 });
  G.flags.tradeBuyerUsed = true;
  ev.dead = true;
  FE.save();
  return { value: v };
};
FE.tradeBuyerDecline = function (ev) { ev.dead = true; FE.save(); };

/* ---------- private seller (buy a car straight off the street) ---------- */
function takePrivateCar(v, price) {
  v.cost.hammer = price; v.cost.premium = 0; v.cost.transport = 0;
  v.boughtWk = G.week; v.arrivedWk = G.week; v.status = 'stock';
  var tp = truePrepFor(v, price);
  v.truePrep = tp.amount; v.blowout = tp.blowout;
  autoPlace(v);
  G.stock.push(v);
  pay(price, 'auction', 'Private purchase — ' + carName(v));
  G.events.push({ kind: 'prep', carId: v.id });
}
FE.privateBuy = function (ev) {
  if (usedSlots() >= totalSlots()) return { ok: false, msg: 'No free pitch to put it on.' };
  if (FE.spendPower() < ev.asking) return { ok: false, msg: 'Not enough to cover it.' };
  takePrivateCar(ev.pcar, ev.asking);
  ev.dead = true; ev.bought = true;
  FE.save();
  return { ok: true, price: ev.asking };
};
FE.privateCounter = function (ev, offer) {
  offer = r25(Math.max(100, offer));
  if (offer >= ev.asking) return FE.privateBuy(ev);
  var gap = (ev.asking - offer) / ev.asking;       // how far below asking
  var accept = ev.firm ? (gap < 0.03) : (rnd() < clamp(1 - gap * 4.5, 0.05, 0.95));
  if (accept) {
    if (usedSlots() >= totalSlots()) return { ok: false, msg: 'No free pitch to put it on.' };
    if (FE.spendPower() < offer) return { ok: false, msg: 'Not enough to cover it.' };
    takePrivateCar(ev.pcar, offer);
    ev.dead = true; ev.bought = true;
    FE.save();
    return { ok: true, price: offer, countered: true };
  }
  FE.save();
  return { ok: false, walked: true, msg: ev.firm ? 'They won’t budge on the price.' : 'They weren’t having it and hung up.' };
};
FE.privateDecline = function (ev) { ev.dead = true; FE.save(); };

FE.prequalClose = function (ev, fniChoice) {
  var s = closeSale(ev.car, ev.offer, ev.exec, fniChoice);
  ev.dead = true;
  return s;
};
FE.prequalMiss = function (ev) { ev.dead = true; FE.save(); };

/* ---------- sold email + reviews ---------- */
function soldEmail(car, sale) {
  var execId = car.soldBy, name, lines = [];
  var buyer = 'M' + (rnd() < 0.5 ? 'r' : 's') + ' ' + pick(FE.SURNAMES);
  var isLoss = sale.front + sale.back < 0;
  if (execId === 'you') name = 'You';
  else name = sale.exec;
  lines.push((isLoss ? 'Finally shifted' : 'Sold') + ' the ' + FE.COLOURS[car.colour].c.toLowerCase() + ' ' + FE.MODELS[car.model].m + (isLoss ? '. Had to come down to ' + money(sale.price) + ' to get it away.' : ' this afternoon. ' + buyer + '.'));
  if (!isLoss) lines.push('Screen price ' + money(car.screen) + ', did the deal at ' + money(sale.price) + '.');
  if (execId === 'terry') lines.push('No finance, paid cash. A fair price for an honest car, and that’s the whole story.');
  else if (car.soldFinanced) lines.push('Finance: ' + pick(['PCP through the usual house', 'HP over 48 months', 'PCP, low deposit', 'finance through the house']) + (car.soldProducts > 0 ? ', plus ' + pick(['GAP insurance', 'GAP + paint protection', 'a warranty upgrade', 'paint protection']) + '.' : '.'));
  else if (car.soldAttached) lines.push('Cash buyer, but took ' + pick(['GAP insurance', 'a warranty upgrade', 'paint protection']) + '.');
  else lines.push('No finance, no products — ' + pick(['paid cash and wasn’t interested', 'flat no on the lot', 'already had cover sorted']) + '.');
  lines.push('Front-end ' + money(sale.front));
  if (car.soldFinanced && car.soldFinanceComm) lines.push('Finance commission ' + money(car.soldFinanceComm));
  lines.push('Back-end ' + money(sale.back) + (car.soldFinanceComm ? ' (inc. finance)' : ''));
  lines.push(isLoss ? 'Total LOSS ' + money(sale.front + sale.back) : 'Total profit ' + money(sale.front + sale.back));
  lines.push('(Prep spent ' + money(sale.prep) + ' · hold cost ' + money(sale.hold) + ' — true net ' + money(sale.net) + ')');
  lines.push(daysIn(car) + ' days in stock.' + (isLoss ? (execId === 'deano' ? ' Sorry boss.' : '') : ' ' + pick(['Nice one to see gone.', 'Good deal all round.', 'Clean sale.'])));
  if (execId === 'deano' && !isLoss) lines.push('(Had to sweeten it a bit to close. You know how it is.)');
  mail(name, (isLoss ? 'Sold — at a loss — ' : 'Sold — ') + carName(car) + ' (' + FE.COLOURS[car.colour].c + ', ' + car.year + ')', lines.join('\n'), 'sold');
}

function reviewMaybe(car, sale, fniChoice) {
  var execName = sale.exec === 'you' ? 'the manager' : sale.exec;
  if (rnd() < car.saleComplaintRisk) {
    var txt = fniChoice === 'push' ? 'Pushy on the finance, wouldn’t take no for an answer. Shame, the car was decent.' : pick(FE.REVIEW_BAD);
    G.reviews.unshift({ wk: G.week, stars: RI(1, 2), text: txt });
    starNudge(-0.08);
    return;
  }
  if (rnd() < 0.28) {
    if (site().tier < brand().tier && rnd() < 0.4) {
      G.reviews.unshift({ wk: G.week, stars: 3, text: pick(FE.REVIEW_PRES) });
      starNudge(-0.03);
    } else {
      var t = pick(FE.REVIEW_GOOD).replace('{car}', carName(car)).replace('{exec}', execName);
      G.reviews.unshift({ wk: G.week, stars: rnd() < 0.8 ? 5 : 4, text: t });
      starNudge(0.02);
    }
  }
}

function starNudge(d) {
  var damp = G.week <= 4 ? 0.35 : 1;
  G.stars = clamp(G.stars + d * damp, 1, 5);
}

/* ---------- office / comebacks ---------- */
FE.enterOffice = function () {
  G.phase = 'office';
  // comebacks due
  G.pendingComebacks = G.pendingComebacks.filter(function (cb) {
    if (cb.dueWk > G.week) return true;
    var car = null;
    G.stock.forEach(function (c) { if (c.id === cb.carId) car = c; });
    if (!car) return false;
    var wks = G.week - car.soldWk;
    var fault = pick(['a knocking from the front end', 'the gearbox slipping between 2nd and 3rd', 'an engine management light that won’t clear', 'a clutch that’s started slipping', 'a misfire under load', 'an oil leak on the drive', 'the air-con giving up', 'a whining wheel bearing']);
    var tone = wks <= 3 ? 'furious — and quoting the Consumer Rights Act' : wks <= 12 ? 'firm but reasonable' : 'chancing it, politely';
    mail('Customer services', 'Comeback — ' + carName(car) + ' sold week ' + car.soldWk,
      'The ' + FE.COLOURS[car.colour].c.toLowerCase() + ' ' + FE.MODELS[car.model].m + ' sold ' + wks + ' week' + (wks === 1 ? '' : 's') + ' ago for ' + money(car.soldPrice) + ' is back. The customer reports ' + fault + '. Mileage at sale ' + car.miles.toLocaleString() + ', now ' + (car.miles + wks * 180).toLocaleString() + '. Repair estimate: ' + money(cb.cost) + '. Customer is ' + tone + '.',
      'comeback', { carId: car.id, cost: cb.cost, soldWk: car.soldWk });
    return false;
  });
  FE.save();
};

FE.resolveComeback = function (emailId, choice) {
  var e = null;
  G.emails.forEach(function (m) { if (m.id === emailId) e = m; });
  if (!e || e.done) return null;
  e.done = true; e.unread = false;
  var cost = e.data.cost;
  var wks = G.week - e.data.soldWk;
  var withinReject = wks <= 4;      // ~30 days: strong right to reject
  var withinSixMo = wks <= 26;      // burden on you
  var out = { cost: 0, star: 0, note: '' };
  if (choice === 'pay') {
    out.cost = cost; out.star = withinReject ? 0.08 : 0.05;
    out.note = 'Fixed without a quibble. Word gets around.';
  } else if (choice === 'warranty') {
    if (rnd() < 0.6) { out.cost = Math.round(cost * 0.25); out.star = -0.01; out.note = 'Warranty picked it up, excess only.'; }
    else { out.cost = 0; out.star = -0.12; out.note = 'Warranty declined the claim. You look evasive.'; }
  } else if (choice === 'wear') {
    if (!withinSixMo && rnd() < 0.75) { out.star = -0.04; out.note = 'Outside six months — defensible, just about.'; }
    else { out.star = -0.25; out.note = 'Within six months the burden is on you. It escalated.'; if (rnd() < 0.3) { out.cost = 2000; out.note += ' Trading standards involved: £2,000.'; } }
  } else if (choice === 'goodwill') {
    out.cost = Math.round(cost * 0.5); out.star = 0.02; out.note = 'Met them halfway. Diplomatic.';
  } else if (choice === 'refuse') {
    if (withinReject) {
      // forced rejection — full refund, car back
      var car = null;
      G.stock.forEach(function (c) { if (c.id === e.data.carId) car = c; });
      out.cost = car ? car.soldPrice : cost * 4;
      out.star = -0.4;
      out.note = 'Within 30 days they have a short-term right to reject. Full refund forced, one-star review, car back on your books needing the repair.';
      if (car) {
        car.status = 'stock'; car.soldWk = 0; car.arrivedWk = G.week;
        car.cost.prep += cost;      // it still needs fixing
        autoPlace(car);
      }
      G.reviews.unshift({ wk: G.week, stars: 1, text: 'Sold me a faulty car then refused to fix it. Rejected it under the Consumer Rights Act. Avoid.' });
    } else {
      out.star = -0.3; out.note = 'Formal complaint lodged.';
      if (rnd() < 0.25) { out.cost = 4000; out.note += ' It went to the ombudsman: £4,000.'; }
      G.reviews.unshift({ wk: G.week, stars: 1, text: pick(FE.REVIEW_BAD) });
    }
  }
  // Karis (defuser) takes the heat out of a comeback — softer star hit, and
  // negative outcomes cost a little less to settle
  if (staffHasTrait('defuser')) {
    if (out.star < 0) out.star *= 0.55;
    if (out.cost && choice !== 'refuse' && choice !== 'pay') out.cost = Math.round(out.cost * 0.85);
    out.note += ' Karis handled it beautifully.';
  }
  if (out.cost) pay(out.cost, 'comebacks', 'Comeback — ' + choice);
  starNudge(out.star);
  // retro P&L on the sale
  var car2 = null;
  G.stock.forEach(function (c) { if (c.id === e.data.carId) car2 = c; });
  if (car2 && out.cost && choice !== 'refuse') {
    car2.soldFront -= out.cost;
    if (car2.soldFront + car2.soldBack < 0 && G.weekly) {
      G.weekly.losses.push({ name: carName(car2) + ' (comeback)', amt: -(out.cost), why: 'Repair after sale flipped this deal negative' });
    }
  }
  FE.save();
  return out;
};

FE.resolveHoliday = function (emailId, approve) {
  var e = null;
  G.emails.forEach(function (m) { if (m.id === emailId) e = m; });
  if (!e || e.done) return;
  e.done = true; e.unread = false;
  var st = staffById(e.data.staffId);
  if (!st) return;
  if (approve) { st.onHoliday = G.week + 1; st.morale = Math.min(1.25, st.morale + 0.06); }
  else { st.morale = Math.max(0.55, st.morale - 0.1); }
  FE.save();
};
FE.resolvePayReview = function (emailId, accept) {
  var e = null;
  G.emails.forEach(function (m) { if (m.id === emailId) e = m; });
  if (!e || e.done) return;
  e.done = true; e.unread = false;
  var st = staffById(e.data.staffId);
  if (!st) return;
  if (accept) { st.extraBasic = (st.extraBasic || 0) + e.data.amount / 52; st.morale = Math.min(1.25, st.morale + 0.08); }
  else {
    st.morale = Math.max(0.55, st.morale - 0.15);
    if (rnd() < 0.3) { st.leaving = G.week + 2; mail(st.name, 'Notice', st.name + ' has handed their notice in. Two weeks.', 'info'); }
  }
  FE.save();
};
FE.resolvePoach = function (emailId, match) {
  var e = null;
  G.emails.forEach(function (m) { if (m.id === emailId) e = m; });
  if (!e || e.done) return;
  e.done = true; e.unread = false;
  var st = staffById(e.data.staffId);
  if (!st) return;
  if (match) { st.extraBasic = (st.extraBasic || 0) + 115; st.morale = Math.min(1.25, st.morale + 0.05); st.poached = false; }
  else { st.leaving = G.week + 2; mail(st.name, 'Gone', st.name + ' is leaving for the rival site at the end of next week.', 'info'); }
  FE.save();
};
FE.resolveAlloc = function (emailId, accept) {
  var e = null;
  G.emails.forEach(function (m) { if (m.id === emailId) e = m; });
  if (!e || e.done) return;
  e.done = true; e.unread = false;
  if (accept && G.franchise) {
    var i;
    for (i = 0; i < e.data.n; i++) {
      G.orders.push(makeOrder(null, null, null, G.week + 1));
    }
    mail(G.brand + ' UK', 'Allocation confirmed', e.data.n + ' units arrive next week. Invoices follow.', 'info');
  } else if (!accept) {
    G.flags.allocDeclines++;
    if (G.flags.allocDeclines >= 2) mail(G.brand + ' UK', 'A note from regional', 'Twice now. The zone manager has a long memory. (No mechanical effect — yet. This is a beta.)', 'info');
  }
  FE.save();
};

/* ---------- franchise ---------- */
FE.signFranchise = function (slots) {
  if (G.week < FE.FRANCHISE.unlockWk) return { ok: false, msg: 'Not yet offered.' };
  if (G.franchise) return { ok: false, msg: 'Already signed.' };
  slots = Math.max(FE.FRANCHISE.minSlots, slots || FE.FRANCHISE.minSlots);
  var liveWk = G.week + FE.FRANCHISE_INSTALL_WKS;
  G.franchise = { slots: slots, signedWk: G.week, qUnits: 0, qMargin: 0, yUnits: 0, qStartWk: G.week, live: false, liveWk: liveWk };
  G.pendingBuilds.push({ kind: 'franchise', name: G.brand + ' brand corner', dueWk: liveWk, startedWk: G.week });
  mail(G.brand + ' UK', 'Welcome to the network', 'Franchise signed: ' + slots + ' pitches committed, target ' + (slots * FE.FRANCHISE.targetPerSlot) + ' units a year (' + (slots * 2) + ' a quarter). The fee drips from now. The brand corner is being fitted out this week — the order window opens in week ' + liveWk + '. Remember the plate months. Good luck.', 'info');
  FE.save();
  return { ok: true };
};

function makeOrder(model, colour, trim, dueWk) {
  var models = [];
  FE.MODELS.forEach(function (m, i) { if (m.b === G.brand) models.push(i); });
  var mi = model != null ? model : pick(models);
  var t = trim != null ? trim : 1;
  var col = colour != null ? colour : (function () { var r = rnd(), s = 0, i; for (i = 0; i < FE.COLOURS.length; i++) { s += FE.COLOURS[i].p; if (r < s) return i; } return 0; })();
  var list = r25(FE.MODELS[mi].np * FE.TRIMS[t].cost);
  return { model: mi, colour: col, trim: t, list: list, dueWk: dueWk };
}
FE.orderNewCar = function (model, colour, trim, express) {
  if (!G.franchise) return { ok: false, msg: 'No franchise.' };
  if (G.franchise.live === false) return { ok: false, msg: 'The brand corner is still being fitted out — orders open week ' + G.franchise.liveWk + '.' };
  // reserve a pitch for every car already on order, so a batch can't overflow the site
  if (usedSlots() + G.orders.length >= totalSlots()) return { ok: false, msg: 'No free pitches (cars already on order fill the rest).' };
  var due = express ? G.week + 1 : G.week + RI(8, 14);
  var o = makeOrder(model, colour, trim, due);
  var cost = Math.round(o.list * FE.FRANCHISE.costPct);
  if (G.cash < cost) return { ok: false, msg: 'Cannot fund it — ' + money(cost) + ' due on delivery.' };
  G.orders.push(o);
  FE.save();
  return { ok: true, dueWk: due, cost: cost };
};
FE.freePitches = function () { return Math.max(0, totalSlots() - usedSlots() - (G.orders ? G.orders.length : 0)); };
// order a batch of the same spec in one go, capped by free pitches and cash
FE.orderNewCars = function (model, colour, trim, express, qty) {
  qty = Math.max(1, qty || 1);
  var placed = 0, dueWk = 0, lastMsg = '';
  for (var i = 0; i < qty; i++) {
    var r = FE.orderNewCar(model, colour, trim, express);
    if (!r.ok) { lastMsg = r.msg; break; }
    placed++; dueWk = r.dueWk;
  }
  if (placed === 0) return { ok: false, msg: lastMsg || 'Could not order.' };
  return { ok: true, placed: placed, dueWk: dueWk, short: placed < qty ? lastMsg : null };
};
function deliverNewCar(o) {
  var v = genVehicle(G.brand, { model: o.model, age: 1 });
  v.age = 0; v.year = 2026; v.miles = RI(5, 40); v.cond = 5; v.hist = 0; v.trim = o.trim; v.colour = o.colour;
  v.isNew = true; v.list = o.list;
  v.retail = o.list; v.screen = o.list;
  v.faultP = 0.02;
  var cost = Math.round(o.list * FE.FRANCHISE.costPct);
  v.cost.hammer = cost; v.cost.premium = 0; v.cost.transport = 0; v.cost.prep = FE.FRANCHISE.pdi;
  v.truePrep = FE.FRANCHISE.pdi; v.prepPaid = true;
  v.boughtWk = G.week; v.arrivedWk = G.week; v.status = 'stock';
  autoPlace(v);
  G.stock.push(v);
  pay(cost, 'auction', 'Factory invoice — new ' + carName(v));
  pay(FE.FRANCHISE.pdi, 'prep', 'PDI');
}

function quarterEnd() {
  if (!G.franchise) return;
  var F = G.franchise;
  var weeks = G.week - F.qStartWk;
  if (weeks < 13) return;
  var target = Math.round(F.slots * FE.FRANCHISE.targetPerSlot / 4 * Math.min(weeks / 13, 1));
  var pct = target > 0 ? F.qUnits / target : 1;
  var tier = pct >= FE.FRANCHISE.bonusFullAt ? FE.FRANCHISE.bonusFull : pct >= FE.FRANCHISE.bonusHalfAt ? FE.FRANCHISE.bonusHalf : 0;
  var bonus = Math.round(F.qMargin * tier);
  var short = Math.max(0, target - F.qUnits);
  var body = 'Quarter closed: ' + F.qUnits + ' of ' + target + ' new units (' + Math.round(pct * 100) + '%).';
  if (bonus > 0) { earn(bonus, 'Volume bonus'); body += ' Volume bonus paid: ' + money(bonus) + ' (' + Math.round(tier * 100) + '% tier).'; }
  else body += ' No bonus this quarter.';
  if (short > 0 && pct < FE.FRANCHISE.bonusFullAt) {
    var n = Math.max(1, Math.round(short * FE.FRANCHISE.preRegShare));
    body += '\n\nThe zone manager "suggests" pre-registering ' + n + ' unit' + (n > 1 ? 's' : '') + ' to protect your standing. They would count toward target — and become used stock at 11.5% below list, sold at a loss, filling pitches you need. Your call, boss.';
    mail(G.brand + ' UK', 'Quarter end — ' + Math.round(pct * 100) + '% of target', body, 'prereg', { n: n });
  } else {
    mail(G.brand + ' UK', 'Quarter end — ' + Math.round(pct * 100) + '% of target', body, 'info');
  }
  F.qUnits = 0; F.qMargin = 0; F.qStartWk = G.week;
}

FE.resolvePreReg = function (emailId, doIt) {
  var e = null;
  G.emails.forEach(function (m) { if (m.id === emailId) e = m; });
  if (!e || e.done) return null;
  e.done = true; e.unread = false;
  if (!doIt || !G.franchise) return { done: false };
  var n = e.data.n, made = 0, i;
  for (i = 0; i < n; i++) {
    if (usedSlots() >= totalSlots()) break;
    var o = makeOrder(null, null, 1, G.week);
    var cost = Math.round(o.list * FE.FRANCHISE.costPct);
    if (G.cash < cost) break;
    var v = genVehicle(G.brand, { model: o.model, age: 1 });
    v.miles = RI(50, 200); v.cond = 5; v.hist = 0; v.trim = 1; v.colour = o.colour;
    v.isPreReg = true; v.list = o.list;
    v.retail = r25(o.list * (1 - FE.FRANCHISE.preRegLossPct)); v.screen = v.retail;
    v.cost.hammer = cost; v.cost.premium = 0; v.cost.transport = 0; v.cost.prep = FE.FRANCHISE.pdi;
    v.truePrep = FE.FRANCHISE.pdi; v.prepPaid = true;
    v.boughtWk = G.week; v.arrivedWk = G.week; v.status = 'stock';
    autoPlace(v);
    G.stock.push(v);
    pay(cost, 'auction', 'Pre-registration — ' + carName(v));
    G.franchise.yUnits++;
    made++;
  }
  mail('Accounts', 'Pre-registration done', made + ' car' + (made === 1 ? '' : 's') + ' registered to ourselves. They’re used cars now, worth less than we paid. The bonus had better be worth it.', 'info');
  FE.save();
  return { done: true, n: made };
};

/* ---------- departments & expansion ---------- */
FE.buildDept = function (id) {
  var D = null;
  FE.DEPARTMENTS.forEach(function (d) { if (d.id === id) D = d; });
  if (!D) return { ok: false };
  if (G.dept[id]) return { ok: false, msg: 'Already built.' };
  if (G.cash < D.cost) return { ok: false, msg: 'Not enough cash.' };
  pay(D.cost, 'misc', D.name + ' — construction');
  G.dept[id] = G.week + D.buildWks;
  G.dept.building = G.week + D.buildWks;
  mail('Site works', D.name, 'Construction underway — the site is disrupted this week (capacity down). Live from week ' + (G.week + D.buildWks) + '.', 'info');
  FE.save();
  return { ok: true };
};
FE.buyExpansion = function (id) {
  var E = null;
  FE.EXPANSIONS.forEach(function (x) { if (x.id === id) E = x; });
  if (!E || G.expansionsDone.indexOf(id) >= 0) return { ok: false, msg: 'Not available.' };
  if (G.pendingBuilds.some(function (b) { return b.id === id; })) return { ok: false, msg: 'Already under construction.' };
  if (G.cash < E.cost) return { ok: false, msg: 'Not enough cash.' };
  pay(E.cost, 'misc', E.name);
  var due = G.week + (E.buildWks || 1);
  G.pendingBuilds.push({ kind: 'expansion', id: id, name: E.name, slots: E.slots, util: E.util, dueWk: due, startedWk: G.week });
  mail('Site works', E.name + ' — groundworks started', 'Diggers are in on the new plot. The ' + E.slots + ' pitches will be surfaced and open in week ' + due + '.', 'info');
  FE.save();
  return { ok: true, dueWk: due };
};
FE.setAds = function (tier) { if (G.week >= 5) { G.adTier = tier; FE.save(); } };
FE.ack90 = function (carId) { G.stock.forEach(function (c) { if (c.id === carId) c.ack90 = true; }); FE.save(); };
FE.needsAck = function () {
  return inStock().filter(function (c) { return daysIn(c) >= 90 && !c.ack90 && !c.isNew; });
};

/* ---------- fines ---------- */
function fineCheck() {
  if (G.week < 3) return null;
  var rp = 0.15, drivers = [];
  var attachRate = G.weekly.units ? G.weekly.attached / G.weekly.units : 0;
  if (attachRate > 0.6) { rp += (attachRate - 0.6) * 30; drivers.push('gap'); }
  if (G.weekly.pushes > 0) { rp += G.weekly.pushes * 0.4; drivers.push('gap'); }
  if (G.adTier === 3 && G.week >= 5) { rp += 0.5; drivers.push('adv'); }
  if (G.salary === 0) { rp += 0.6; drivers.push('employ'); }
  if (G.weekly.gradeLowSold > 0) { rp += G.weekly.gradeLowSold * 0.8; drivers.push('road'); }
  var trainedShare = G.staff.length ? G.staff.filter(function (s) { return s.trained.comp; }).length / G.staff.length : 0;
  rp *= (1 - 0.6 * trainedShare);
  var p = clamp(rp * 0.02, 0.005, 0.18);
  if (rnd() >= p) return null;
  var pool = drivers.length ? drivers : ['adv', 'data', 'miles'];
  if (rnd() < 0.25) pool = pool.concat(['data', 'miles']);
  var fid = pick(pool);
  var F = null;
  FE.FINES.forEach(function (f) { if (f.id === fid) F = f; });
  pay(F.amount, 'fines', 'FINE — ' + F.name);
  starNudge(-F.star);
  G.totals.fines.push({ wk: G.week, name: F.name, amount: F.amount });
  var why = {
    gap: 'The FCA has taken a view on your GAP insurance sales practices. The attachment rate did not go unnoticed.',
    adv: 'Your finance example in last week’s advertising did not meet the representative-example rules.',
    miles: 'Trading standards found a mileage discrepancy in an advert. This one stings the rating too.',
    data: 'Customer records were mishandled. The ICO does not do warnings twice.',
    road: 'A car left your forecourt in a condition it should not have. Severe — and public.',
    employ: 'An employment tribunal claim over the pay structure. Low basics attract paperwork.'
  }[fid];
  mail('Compliance', 'FINE: ' + F.name + ' — ' + money(F.amount), why + '\n\nFine paid: ' + money(F.amount) + '. Compliance training materially cuts the odds of a repeat.', 'fine');
  return F;
}

/* ---------- close week ---------- */
FE.closeWeek = function () {
  if (FE.needsAck().length) return { ok: false, msg: 'Stock over 90 days needs acknowledging first (Stock tab).' };
  var W = G.weekly, s = season();

  // fixed costs
  var sal = 0, comm = 0;
  G.staff = G.staff.filter(function (st) { return !(st.leaving && st.leaving <= G.week); });
  var anchorPresent = staffHasTrait('anchor');
  G.staff.forEach(function (st) {
    sal += salary().basic / 52 + (st.extraBasic || 0);
    var g = W.staffGross[st.id] || 0;
    comm += g * salary().comm;
    st.lastUnits = W.staffUnits[st.id] || 0;
    st.lastGross = g;
    st.weeks++;
    if (st.id === 'sarah') st.growth = Math.min(2.2, st.growth * 1.04);
    // morale drift — Clive (anchor) steadies the room, so bad-month dips are softer
    var target = s.d >= 0.95 ? salary().moraleGood : salary().moraleBad;
    if (target < st.morale && anchorPresent) target = st.morale - (st.morale - target) * 0.55;
    st.morale = clamp(st.morale + (target - st.morale) * 0.25, 0.55, 1.25);
    if (st.onHoliday && st.onHoliday < G.week) st.onHoliday = 0;
  });
  pay(Math.round(sal), 'salaries');
  pay(Math.round(comm), 'commission');
  pay(site().util + G.extraUtil, 'utilities');
  pay(adCost(), 'advertising');
  pay(FE.INSURANCE_WK, 'insurance');
  var fp = 0;
  G.stock.forEach(function (c) { if (c.status === 'stock' || c.status === 'sold') fp += carCost(c) * FE.FLOORPLAN_APR / 52; });
  pay(Math.round(fp), 'floorplan');
  // stocking finance interest on the drawn balance (only when you've borrowed)
  if (FE.financeEnabled()) {
    var drawn = FE.financeDrawn();
    if (drawn > 0) pay(Math.round(drawn * FE.financeApr() / 52), 'stockfinance');
  }
  if (G.franchise) pay(Math.round(FE.FRANCHISE.fee / 52), 'franchise');
  if (G.dept.service && G.week >= G.dept.service) earn(FE.DEPARTMENTS[0].weekly, 'Service department income');

  var fine = fineCheck();
  quarterEnd();

  // report
  var stkList = inStock();
  var totDays = 0;
  stkList.forEach(function (c) { totDays += daysIn(c); });
  var costs = W.costs;
  var grossTot = W.front + W.back;
  var deptIncome = (G.dept.service && G.week >= G.dept.service) ? FE.DEPARTMENTS[0].weekly : 0;
  var tradeNet = 0;
  W.trades.forEach(function (t) { tradeNet += t.net; });
  var net = grossTot + deptIncome + tradeNet
    - (costs.salaries || 0) - (costs.commission || 0) - (costs.utilities || 0)
    - (costs.prep || 0) - (costs.advertising || 0) - (costs.floorplan || 0)
    - (costs.insurance || 0) - (costs.misc || 0) - (costs.fines || 0)
    - (costs.training || 0) - (costs.comebacks || 0) - (costs.franchise || 0) - (costs.stockfinance || 0);
  // auction spend is capital, not P&L — stock swaps cash for metal

  // floorplan offenders
  var off = stkList.slice().sort(function (a, b) { return b.holdCost - a.holdCost; }).slice(0, 3)
    .map(function (c) { return { name: FE.MODELS[c.model].m, amt: Math.round(c.holdCost) }; });

  var report = {
    wk: G.week, mo: s.mo, yr: Math.ceil(G.week / 52),
    units: W.units, front: Math.round(W.front), back: Math.round(W.back), gross: Math.round(grossTot),
    costs: {
      salaries: Math.round((costs.salaries || 0)), commission: Math.round(costs.commission || 0),
      utilities: costs.utilities || 0, prep: Math.round(costs.prep || 0), advertising: costs.advertising || 0,
      auction: Math.round(costs.auction || 0), floorplan: Math.round(costs.floorplan || 0),
      insurance: costs.insurance || 0, fines: Math.round(costs.fines || 0), training: Math.round(costs.training || 0),
      comebacks: Math.round(costs.comebacks || 0), franchise: Math.round(costs.franchise || 0), misc: Math.round(costs.misc || 0),
      stockfinance: Math.round(costs.stockfinance || 0)
    },
    financeDrawn: FE.financeDrawn(), financeApr: Math.round(FE.financeApr() * 1000) / 10,
    financed: W.financed || 0, financeComm: Math.round(W.financeComm || 0),
    deptIncome: deptIncome, tradeNet: Math.round(tradeNet),
    net: Math.round(net), losses: W.losses,
    stock: stkList.length, slots: totalSlots(),
    avgDays: stkList.length ? Math.round(totDays / stkList.length) : 0,
    ageing: stkList.filter(function (c) { return daysIn(c) >= 60; }).length,
    stars: Math.round(G.stars * 10) / 10, cash: Math.round(G.cash),
    stockBought: Math.round(costs.auction || 0),
    headcount: G.staff.length + '/' + site().maxStaff,
    floorplanTop: off, fine: fine ? fine.name : null,
    demand: Math.round((W.demand || 0) * 10) / 10, capacity: Math.round((W.capTotal || 0) * 10) / 10
  };
  G.reports.unshift(report);
  if (W.units > G.totals.bestWk) { G.totals.bestWk = W.units; G.totals.bestWkAt = G.week; }
  if (W.units < G.totals.worstWk) { G.totals.worstWk = W.units; G.totals.worstWkAt = G.week; }

  // star baseline drift toward presentation-implied level
  var baseTarget = clamp(4.0 + (site().tier - brand().tier) * FE.PRES_STAR_PEN, 3.1, 4.85);
  G.stars = clamp(G.stars + (baseTarget - G.stars) * 0.05, 1, 5);

  G.week++;
  G.phase = 'report';
  G.lastCloseAt = Date.now();   // start the anti-spam cooldown for the next week
  // the bank calls it in only past your facility limit (plus a little headroom)
  var deadLine = FE.financeEnabled() ? -(FE.financeLimit() + FE.STOCK_FINANCE.buffer) : -25000;
  if (G.cash < deadLine) { G.dead = true; FE.save(); return { ok: true, report: report, dead: true }; }
  FE.save();
  return { ok: true, report: report };
};

// anti-spam cooldown between week completions
FE.skipRemainMs = function () {
  return Math.max(0, (FE.SKIP_COOLDOWN_MS || 0) - (Date.now() - (G.lastCloseAt || 0)));
};
FE.skipReady = function () { return FE.skipRemainMs() <= 0; };

FE.nextWeek = function () {
  startWeek();
  FE.save();
};

/* ---------- AFK / skip week ---------- */
FE.skipWeek = function () {
  // "Skip the rest of the week": staff handle whatever the player hasn't, then
  // the week closes. Works from any phase — from the auction it's a full AFK
  // week; from the showroom/office it just finishes off what's left.
  var startedFromAuction = (G.phase === 'auction');
  var afkNote = [];
  var kept = 0;
  if (G.phase === 'auction') FE.enterShowroom();   // generate the week's events
  if (G.phase === 'showroom') {
    G.events.forEach(function (ev) {
      if (!ev.built) buildEvent(ev);
      if (ev.dead || ev.silent) return;
      if (ev.kind === 'prep' || ev.kind === 'arrival') { FE.payPrep(ev); ev.dead = true; return; }
      if (ev.kind === 'prequal' && ev.car) { FE.prequalClose(ev, null); kept++; return; }
      if (ev.kind === 'offer') {
        if (ev.type === 'crazy') { ev.dead = true; afkNote.push('Declined a silly offer on the ' + FE.MODELS[ev.car.model].m + '.'); return; }
        if (ev.px && !ev.pxResolved) {
          var pr = FE.resolvePX(ev, 'fair');
          if (!pr.dealOn) { ev.dead = true; return; }
        }
        if (rnd() < 0.75) { FE.acceptOffer(ev, null); kept++; }
        else ev.dead = true;
        return;
      }
      if (ev.kind === 'tradebuyer') { ev.dead = true; return; }
      if (ev.kind === 'privateseller') {
        // staff take an obvious bargain (green light, healthy margin), else pass
        if (ev.risk && ev.risk.light === 'green' && ev.estGross > 1400 && FE.spendPower() >= ev.asking) {
          FE.privateBuy(ev); afkNote.push('Picked up a ' + FE.MODELS[ev.pcar.model].m + ' privately.');
        } else ev.dead = true;
        return;
      }
    });
    G.eventIdx = G.events.length;
  }
  if (G.phase !== 'office') FE.enterOffice();
  // auto-answer any still-open office post conservatively
  G.emails.forEach(function (e) {
    if (e.done) return;
    if (e.type === 'comeback') { FE.resolveComeback(e.id, 'goodwill'); }
    if (e.type === 'holiday') FE.resolveHoliday(e.id, true);
    if (e.type === 'payreview') FE.resolvePayReview(e.id, true);
    if (e.type === 'poach') FE.resolvePoach(e.id, true);
    if (e.type === 'prereg') FE.resolvePreReg(e.id, false);
    if (e.type === 'alloc') FE.resolveAlloc(e.id, false);
  });
  FE.needsAck().forEach(function (c) { FE.ack90(c.id); });
  if (startedFromAuction) G.totals.afk++;
  var res = FE.closeWeek();
  if (startedFromAuction) {
    mail('The team', 'While you were away…', 'The floor ran itself this week. ' + kept + ' deals done at the prices offered — no counters, nothing clever. ' + (afkNote.length ? afkNote.join(' ') : '') + ' Full numbers in the weekly report.', 'away');
  }
  return res;
};

/* ---------- share card (section 13/16) ---------- */
FE.shareText = function () {
  var s = season(), yr = Math.ceil((G.week - 1) / 52) || 1;
  var yw = ((G.week - 2) % 52) + 1;
  var stockV = 0;
  inStock().forEach(function (c) { stockV += carCost(c); });
  var nw = Math.round(G.cash + stockV + site().cost + (G.dept.service ? 180000 : 0));
  var lines = [];
  lines.push('FORECOURT EMPIRE — Week ' + (G.week - 1) + ', ' + s.mo + ', Year ' + yr);
  lines.push('Brand: ' + G.brand + '   Site: ' + site().name);
  lines.push('');
  lines.push('Cash in bank:      ' + money(G.cash));
  lines.push('Net worth:         ' + money(nw) + ' / ' + money(FE.SITE2_TARGET) + ' (Site 2)');
  lines.push('Star rating:       ' + (Math.round(G.stars * 10) / 10) + ' stars');
  lines.push('');
  lines.push('Units sold (YTD):  ' + G.totals.unitsYr);
  lines.push('Best week:         ' + G.totals.bestWk + ' units (Week ' + G.totals.bestWkAt + ')');
  lines.push('Worst week:        ' + (G.totals.worstWk === 999 ? 0 : G.totals.worstWk) + ' units (Week ' + G.totals.worstWkAt + ')');
  var stkList = inStock(), totDays = 0;
  stkList.forEach(function (c) { totDays += daysIn(c); });
  lines.push('Avg days in stock: ' + (stkList.length ? Math.round(totDays / stkList.length) : 0));
  lines.push('Stock on site:     ' + usedSlots() + ' / ' + totalSlots() + ' pitches');
  lines.push('');
  if (G.staff.length) {
    lines.push('STAFF (' + G.staff.length + '/' + site().maxStaff + ')');
    G.staff.forEach(function (st) {
      var fni = st.totUnits ? Math.round(100 * st.fniDeals / st.totUnits) : 0;
      lines.push('  ' + st.name + '  -  ' + st.lastUnits + ' units/wk  -  ' + money(st.totUnits ? Math.round(st.totGross / st.totUnits) : 0) + ' avg gross  -  F&I ' + fni + '%');
    });
    lines.push('');
  }
  lines.push('Franchise: ' + (G.franchise ? 'New cars on ' + G.franchise.slots + ' pitches' : 'Used only'));
  var worst = null;
  stkList.forEach(function (c) { if (!worst || c.holdCost > worst.holdCost) worst = c; });
  if (worst) lines.push('Worst hold: ' + FE.MODELS[worst.model].m + ' ' + money(Math.round(worst.holdCost)));
  lines.push('Departments: ' + (G.dept.service ? 'Service dept' : 'none yet'));
  lines.push('Fines taken: ' + G.totals.fines.length + (G.totals.fines.length ? ' (' + G.totals.fines[G.totals.fines.length - 1].name + ', ' + money(G.totals.fines[G.totals.fines.length - 1].amount) + ')' : ''));
  lines.push('Salary structure: ' + salary().name);
  if (G.totals.units) lines.push('Finance penetration: ' + Math.round(G.totals.financed / G.totals.units * 100) + '%');
  if (FE.financeEnabled()) lines.push('Stocking finance: ' + (FE.financeDrawn() > 0 ? money(FE.financeDrawn()) + ' drawn @ ' + (Math.round(FE.financeApr() * 1000) / 10) + '%' : 'facility open, undrawn'));
  if (G.totals.afk > 0) lines.push('AFK weeks: ' + G.totals.afk);
  lines.push('');
  lines.push('Can you beat it?');
  return lines.join('\n');
};

FE.netWorth = function () {
  var stockV = 0;
  inStock().forEach(function (c) { stockV += carCost(c); });
  return Math.round(G.cash + stockV + site().cost + (G.dept.service ? 180000 : 0));
};

/* ---------- stocking finance facility ---------- */
FE.financeEnabled = function () { return !!(G.finance && G.finance.enabled); };
FE.financeLimit = function () {
  if (!FE.financeEnabled()) return 0;
  // limit scales with net worth. Use GROSS assets (net worth + what's drawn) so
  // drawing on the facility doesn't shrink the very limit backing it.
  var drawn = Math.max(0, -G.cash);
  var basis = FE.netWorth() + drawn;
  var lim = Math.round(basis * FE.STOCK_FINANCE.limitPct / 10000) * 10000;
  return Math.max(0, Math.min(FE.STOCK_FINANCE.maxLimit, lim));
};
FE.financeDrawn = function () { return Math.max(0, -Math.round(G.cash)); };
FE.financeHeadroom = function () { return Math.max(0, FE.financeLimit() - FE.financeDrawn()); };
FE.financeApr = function () {
  var sf = FE.STOCK_FINANCE;
  var nw = FE.netWorth();
  var nwFactor = clamp((nw - 900000) / 2100000, 0, 1);   // £900k → £3M eases the rate
  var timeFactor = clamp(G.week / 104, 0, 1);            // matures over ~2 game years
  var t = Math.min(1, timeFactor * 0.5 + nwFactor * 0.6);
  return sf.aprStart - (sf.aprStart - sf.aprFloor) * t;
};
FE.spendPower = function () { return G.cash + FE.financeLimit(); };
FE.enableFinance = function (on) {
  if (!G.finance) G.finance = { enabled: false };
  if (!on && FE.financeDrawn() > 0) return { ok: false, msg: 'Clear the drawn balance before closing the facility.' };
  G.finance.enabled = !!on;
  mail('Kingsway Stocking Finance', on ? 'Facility approved' : 'Facility closed',
    on ? 'Your stocking finance facility is live. You can now buy stock beyond your cash, up to ' + money(FE.financeLimit()) + ' (it scales with your net worth). Interest is ' + Math.round(FE.financeApr() * 1000) / 10 + '% APR to start and eases as you establish yourself — charged weekly on whatever you’ve drawn, on top of the usual floorplan. Turn your stock fast and it pays for itself; sit on it and the interest bites.'
       : 'Facility closed at your request.', 'info');
  FE.save();
  return { ok: true };
};

FE.startWeekExternal = startWeek;

})();
