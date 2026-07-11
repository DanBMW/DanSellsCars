/* DanSells EV funnel: shared UI behaviours + the electric-saving engine.
   Loaded blocking in <head> so the resume restore runs before each
   page's inline script reads sessionStorage.
   1. Silent resume: answers are mirrored to localStorage and restored
      into a fresh session for 7 days. Cleared when the brief is sent.
   2. Progress car: reuses the fv2 progress-car styling from funnel.css.
   3. Brief ticket: chips under the progress bar showing the brief as it
      builds. Hidden on pages with body.fv2-noticket.
   4. window.evSavings(): rough petrol/diesel vs electric running-cost
      comparison from DVLA data (CO2 -> real-world mpg) and the annual
      mileage given in step 3. Pure read of sessionStorage, safe to call
      from any page. */
(function(){
  var KEYS = ["evLifestyle","evStyle","evTimeline","evFunding","evCurrentPayment","evDeposit","evMonthlyBudget",
    "evOwnsOutright","evCashBudget","evMileage","evLongTrips","evLongTripsLabel","evDriveway","evCharger",
    "evPX","evReg","evCurrentCar","evPXModel","evPXMileage","evWBAC","evPXService",
    "evPXFinance","evSettlement","evPXCond","evPXPhotos","evPXPhotoBypass",
    "evDvlaMake","evDvlaModel","evDvlaYear","evDvlaFuel","evDvlaCo2","evDvlaCc","evDvlaColour",
    "evMotStatus","evMotExpiry","evMotHistory","evDvsaAnnualMiles",
    "evNotes","evName","evEmail","evPhone","evPostcode","evBestTime",
    "evMarketingOptIn","evMarketingChannels","evPct"];
  var BACKUP_KEY = "evBackup";
  var MAX_AGE = 7*24*3600*1000;

  /* ── silent resume ── */
  try {
    var raw = localStorage.getItem(BACKUP_KEY);
    if (raw) {
      var b = JSON.parse(raw);
      if (!b || !b.t || Date.now() - b.t > MAX_AGE) {
        localStorage.removeItem(BACKUP_KEY);
      } else if (!sessionStorage.getItem("evLifestyle") && !sessionStorage.getItem("evName")) {
        for (var k in b.d) if (sessionStorage.getItem(k) == null) sessionStorage.setItem(k, b.d[k]);
      }
    }
  } catch(e) {}

  var backupDisarmed = false;
  function backup(){
    if (backupDisarmed) return;
    try {
      var d = {}, any = false;
      KEYS.forEach(function(k){
        var v = sessionStorage.getItem(k);
        if (v != null) { d[k] = v; any = true; }
      });
      if (any) localStorage.setItem(BACKUP_KEY, JSON.stringify({ t: Date.now(), d: d }));
    } catch(e) {}
  }
  window.addEventListener("pagehide", backup);
  window.evClearBackup = function(){
    backupDisarmed = true;
    try { localStorage.removeItem(BACKUP_KEY); } catch(e) {}
  };

  /* ── the saving engine ─────────────────────────────────────
     mpg comes from DVLA CO2 where available (fuel-burn chemistry:
     a litre of petrol makes ~2,392g of CO2, diesel ~2,640g), with
     engine-size fallbacks when a reg predates CO2 records.
     Prices are real UK figures, spelled out to the customer.
     Last checked 3 Jul 2026 - sources noted per line; refresh these
     every couple of months:
       petrol/diesel  RAC Fuel Watch UK average
       homeStandard   Ofgem price cap unit rate (Jul–Sep 2026: 26.11p)
       homeOffpeak    overnight EV tariffs (Intelligent Octopus Go is
                      5.49p from Apr 2026; 7p is a safe cross-supplier
                      figure so the card never over-promises)
       publicFast     Zapmap price index, 3–49kW (May 2026: 54p)
       publicRapid    Zapmap price index, 50kW+ (May 2026: 79p)
     Charging behaviour: drivers with home charging are assumed to do
     90% of their miles on the overnight rate and 10% on public rapids
     (the roughly 1-in-10 longer trips). Street-only drivers get 90%
     fast public / 10% rapid instead. */
  var RATES = {
    petrolPerLitre: 1.51,   // RAC Fuel Watch, late Jun 2026
    dieselPerLitre: 1.67,   // RAC Fuel Watch, late Jun 2026
    evMilesPerKwh:  3.3,    // real-world BMW EV average
    homeOffpeak:    0.07,   // overnight EV tariff, £/kWh
    homeStandard:   0.26,   // Ofgem cap unit rate, £/kWh
    publicFast:     0.54,   // public 3–49kW, £/kWh
    publicRapid:    0.79,   // public 50kW+, £/kWh
    homeShare:      0.9     // share of charging done at home overnight
  };
  RATES.homeMix   = RATES.homeShare * RATES.homeOffpeak + (1 - RATES.homeShare) * RATES.publicRapid;
  RATES.publicMix = RATES.homeShare * RATES.publicFast  + (1 - RATES.homeShare) * RATES.publicRapid;
  window.EV_RATES = RATES;

  window.evSavings = function(){
    var g = function(k){ return sessionStorage.getItem(k) || ""; };
    var miles = parseInt(String(g("evMileage")).replace(/[^\d]/g,""), 10) || 0;
    var fuelRaw = g("evDvlaFuel");
    var fuel = fuelRaw.toLowerCase();
    if (!miles || !fuel) return null;

    if (fuel === "electricity" || fuel === "electric") return { alreadyEV: true, miles: miles };

    var diesel = /heavy oil|diesel/.test(fuel);
    var hybrid = /hybrid/.test(fuel);
    var co2 = parseFloat(g("evDvlaCo2")) || 0;
    var cc  = parseInt(g("evDvlaCc"), 10) || 0;

    var mpg = 0, mpgSrc = "";
    if (co2 > 0) {
      mpg = (diesel ? 7440 : 6760) / co2;
      mpgSrc = "DVLA CO2 figure";
    } else if (cc > 0) {
      if (diesel) mpg = cc <= 1600 ? 55 : cc <= 2000 ? 48 : 40;
      else        mpg = cc <= 1400 ? 45 : cc <= 2000 ? 40 : cc <= 3000 ? 33 : 27;
      if (hybrid) mpg *= 1.25;
      mpgSrc = "typical for the engine size";
    } else {
      mpg = diesel ? 47 : 40;
      if (hybrid) mpg *= 1.25;
      mpgSrc = "typical for the fuel type";
    }
    mpg = Math.min(90, Math.max(18, mpg));

    var litrePrice = diesel ? RATES.dieselPerLitre : RATES.petrolPerLitre;
    var fuelCost = miles / mpg * 4.546 * litrePrice;
    var kwh = miles / RATES.evMilesPerKwh;
    var evHome = kwh * RATES.homeMix;      // 90% overnight + 10% public rapid
    var evOff  = kwh * RATES.homeOffpeak;  // best case: everything overnight
    var evStd  = kwh * RATES.homeStandard;
    var evPub  = kwh * RATES.publicMix;    // street-only: 90% fast + 10% rapid

    return {
      alreadyEV: false,
      miles: miles,
      hybrid: hybrid,
      fuelLabel: diesel ? "diesel" : hybrid ? "hybrid" : "petrol",
      litrePrice: litrePrice,
      mpg: Math.round(mpg),
      mpgSrc: mpgSrc,
      fuelCost: fuelCost,
      evHome: evHome, evOff: evOff, evStd: evStd, evPub: evPub,
      saveHome: fuelCost - evHome,
      saveOff: fuelCost - evOff,
      saveStd: fuelCost - evStd,
      savePub: fuelCost - evPub
    };
  };

  // £ rounded to the nearest tenner: these are estimates, not quotes.
  window.evMoney10 = function(v){
    return "£" + (Math.round(v / 10) * 10).toLocaleString("en-GB");
  };

  /* ── progress car (same visual as the BMW finder) ── */
  var CAR_SVG = '<svg viewBox="0 0 72 30" width="34" height="15" aria-hidden="true">' +
    '<path fill="currentColor" d="M4,22 Q1,22 1,18 L2,15 Q3,11 8,10 L17,8.5 L25,3.5 Q27,2 31,2 L45,2 Q49,2 51,4 L57,8.5 L65,10 Q70,11 71,15 L71,18 Q71,22 68,22 Z"/>' +
    '<circle cx="16" cy="22" r="6.5" fill="currentColor"/><circle cx="16" cy="22" r="2.5" fill="#fff"/>' +
    '<circle cx="56" cy="22" r="6.5" fill="currentColor"/><circle cx="56" cy="22" r="2.5" fill="#fff"/></svg>';

  function initProgress(){
    var fill = document.querySelector(".fv2-fill");
    if (!fill) return;
    var track = fill.parentElement;
    var lane = document.createElement("div");
    lane.className = "fv2-prog-lane";
    track.parentNode.insertBefore(lane, track);
    lane.appendChild(track);
    var car = document.createElement("div");
    car.className = "fv2-prog-car";
    car.innerHTML = CAR_SVG;
    lane.appendChild(car);

    var target = parseFloat(fill.style.width) || 0;
    var prev = parseFloat(sessionStorage.getItem("evPct") || "0");
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || prev === target) {
      car.style.left = target + "%";
    } else {
      fill.style.transition = "none";
      car.style.transition = "none";
      fill.style.width = prev + "%";
      car.style.left = prev + "%";
      requestAnimationFrame(function(){ requestAnimationFrame(function(){
        var ease = "cubic-bezier(.3,.7,.3,1)";
        fill.style.transition = "width .9s " + ease;
        car.style.transition = "left .9s " + ease;
        fill.style.width = target + "%";
        car.style.left = target + "%";
      }); });
    }
    sessionStorage.setItem("evPct", String(target));
  }

  /* ── brief ticket ── */
  function initTicket(){
    if (document.body.classList.contains("fv2-noticket")) return;
    var g = function(k){ return sessionStorage.getItem(k) || ""; };
    var money = function(v){
      var n = Number(String(v).replace(/,/g, ""));
      return isNaN(n) ? "" : "£" + n.toLocaleString("en-GB");
    };
    var items = [];
    var STYLE = {"Gran Coupe":"Gran Coupé","Small SAV":"Compact SAV","Large SAV":"Larger SAV","Open to ideas":"Open on shape"};
    var TL = {"Ready now":"Ready now","1-3 months":"1 to 3 months","3-6 months":"3 to 6 months","Just exploring":"Exploring"};

    try {
      var ls = JSON.parse(g("evLifestyle") || "[]");
      if (ls.length) items.push(ls[0] + (ls.length > 1 ? " +" + (ls.length - 1) : ""));
    } catch(e) {}
    if (g("evStyle")) items.push(STYLE[g("evStyle")] || g("evStyle"));
    if (g("evTimeline")) items.push(TL[g("evTimeline")] || g("evTimeline"));
    var f = g("evFunding");
    if (f === "Outright" && g("evCashBudget")) {
      items.push(money(g("evCashBudget")) + " budget");
    } else if (f && g("evMonthlyBudget")) {
      var m = money(g("evMonthlyBudget")) + "/mo";
      var dep = g("evDeposit");
      if (dep && Number(dep.replace(/,/g, "")) > 0) m += ", " + money(dep) + " down";
      items.push(m);
    } else if (f) {
      items.push(f);
    }
    if (g("evMileage")) items.push(Math.round(Number(g("evMileage")) / 1000) + "k miles/yr");
    var dw = g("evDriveway");
    if (dw) items.push(dw.indexOf("driveway") !== -1 || dw.indexOf("Yes") === 0 ? "Home charging" :
      dw.indexOf("Street") === 0 ? "Street parking" : dw.indexOf("Communal") === 0 ? "Communal parking" : "Charging TBC");
    try {
      var s = window.evSavings && window.evSavings();
      if (s && !s.alreadyEV && s.saveHome > 100) items.push("~" + window.evMoney10(s.saveHome) + "/yr saving");
    } catch(e) {}
    var px = g("evPX");
    if (px === "No") items.push("No PX");
    else if (px === "Keeping it") items.push("Keeping current car");
    else if (px) items.push("PX: " + (g("evPXModel") || g("evCurrentCar") || g("evReg") || "yes"));
    try {
      var ph = JSON.parse(g("evPXPhotos") || "[]");
      if (ph.length) items.push(ph.length + (ph.length === 1 ? " photo" : " photos"));
    } catch(e) {}

    if (!items.length) return;
    var prog = document.querySelector(".fv2-progress");
    if (!prog) return;
    var t = document.createElement("div");
    t.className = "fv2-ticket";
    var lab = document.createElement("span");
    lab.className = "fv2-ticket-label";
    lab.textContent = "Your brief";
    t.appendChild(lab);
    items.forEach(function(it, i){
      var c = document.createElement("span");
      c.className = "fv2-ticket-chip";
      c.textContent = it;
      c.style.animationDelay = (i * 45) + "ms";
      t.appendChild(c);
    });
    prog.insertAdjacentElement("afterend", t);
  }

  function ui(){ initProgress(); initTicket(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ui);
  else ui();
})();
