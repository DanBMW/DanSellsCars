/* DanSells Find my BMW funnel: shared UI behaviours.
   Loaded blocking in <head> so the resume restore runs before each
   page's inline script reads sessionStorage.
   1. Silent resume: answers are mirrored to localStorage and restored
      into a fresh session for 7 days. Cleared when the brief is sent.
   2. Progress car: a small silhouette drives along the progress track
      from the previous step's position.
   3. Brief ticket: a strip of chips under the progress bar showing the
      brief as it builds. Hidden on pages with body.fv2-noticket. */
(function(){
  var KEYS = ["lifestyle","bodyStyles","timeline","purchaseType","deposit","monthlyBudget",
    "annualMileage","cashBudget","altMonthly","partExchange","reg","currentCar","mileage",
    "wbacVal","pxModel","pxService","pxFinance","pxSettlement","pxCondition","pxPhotos","pxPhotoBypass","pxDvlaMake",
    "pxDvlaModel","pxDvlaYear","pxDvlaFuel","specBypass","specColours","specTrim","specNeeds",
    "specWants","modelPref","notes","fullName","email","phone","postcode","bestTime",
    "marketingOptIn","marketingChannels","fv2Pct"];
  var BACKUP_KEY = "fv2Backup";
  var MAX_AGE = 7*24*3600*1000;

  /* ── silent resume ── */
  try {
    var raw = localStorage.getItem(BACKUP_KEY);
    if (raw) {
      var b = JSON.parse(raw);
      if (!b || !b.t || Date.now() - b.t > MAX_AGE) {
        localStorage.removeItem(BACKUP_KEY);
      } else if (!sessionStorage.getItem("lifestyle") && !sessionStorage.getItem("fullName")) {
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
  window.fv2ClearBackup = function(){
    backupDisarmed = true;
    try { localStorage.removeItem(BACKUP_KEY); } catch(e) {}
  };

  /* ── progress car ── */
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
    var prev = parseFloat(sessionStorage.getItem("fv2Pct") || "0");
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
    sessionStorage.setItem("fv2Pct", String(target));
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
    var BODY = {hatchback:"Hatch",saloon:"Saloon",touring:"Touring",suv:"SUV",coupe:"Coupé",convertible:"Convertible",gran_coupe:"Gran Coupé"};
    var TL = {"Right now if the deal is right":"Right now","Within 1 month":"Within a month","1 to 3 months":"1 to 3 months","Just exploring":"Exploring"};

    if (g("lifestyle")) items.push(g("lifestyle"));
    try {
      var bs = JSON.parse(g("bodyStyles") || "[]");
      if (bs.length) {
        var names = bs.map(function(x){ return BODY[x] || x; });
        items.push(names.slice(0,3).join(" / ") + (names.length > 3 ? " +" + (names.length - 3) : ""));
      }
    } catch(e) {}
    if (g("timeline")) items.push(TL[g("timeline")] || g("timeline"));
    var pt = g("purchaseType");
    if (pt === "Outright" && g("cashBudget")) {
      items.push(money(g("cashBudget")) + " budget");
    } else if (pt && g("monthlyBudget")) {
      var m = money(g("monthlyBudget")) + "/mo";
      var dep = g("deposit");
      if (dep && Number(dep.replace(/,/g, "")) > 0) m += ", " + money(dep) + " down";
      items.push(m);
    } else if (pt) {
      items.push(pt);
    }
    if (g("annualMileage")) items.push(Math.round(Number(g("annualMileage")) / 1000) + "k miles/yr");
    var px = g("partExchange");
    if (px === "No") items.push("No PX");
    else if (px) items.push("PX: " + (g("pxModel") || g("currentCar") || g("reg") || "yes"));
    try {
      var ph = JSON.parse(g("pxPhotos") || "[]");
      if (ph.length) items.push(ph.length + (ph.length === 1 ? " photo" : " photos"));
    } catch(e) {}
    try {
      var cl = JSON.parse(g("specColours") || "[]");
      if (cl.length) items.push(cl[0] === "Open to any" ? "Any colour" : cl.slice(0,2).join(", ") + (cl.length > 2 ? " +" + (cl.length - 2) : ""));
    } catch(e) {}
    var tr = g("specTrim");
    if (tr && tr !== "No preference") items.push(tr === "M Sport / Performance" ? "M Sport" : tr === "Happy with standard" ? "Standard spec" : tr);
    if (g("modelPref")) items.push(g("modelPref"));

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
