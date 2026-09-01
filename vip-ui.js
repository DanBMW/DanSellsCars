/* DanSells VIP Buyers Event pre-qualification: shared UI behaviours.
   Modelled on funnel-ui.js, but with its own keys and backup slot so a
   VIP visitor never collides with (or restores from) the Find my BMW
   funnel. Loaded blocking in <head> so the resume restore runs before
   each page's inline script reads sessionStorage.

   1. Silent resume: answers are mirrored to localStorage and restored
      into a fresh session for 14 days (the run-up to the event is
      longer than a normal enquiry). Cleared when the document is sent.
   2. Progress car: a small silhouette drives along the progress track
      from the previous step's position.
   3. Document ticket: a strip of chips under the progress bar showing
      the pre-qualification as it builds. Hidden on body.vip-noticket. */
(function(){
  var KEYS = ["vipName","vipEventDate","vipApptTime","vipVenue",
    "vipShortlist","vipModelPref","vipBodyStyles","vipStockType",
    "vipPurchaseType","vipDeposit","vipMonthly","vipCash","vipAltMonthly","vipAnnualMileage",
    "vipPX","vipReg","vipPXCar","vipPXModel","vipPXMileage","vipPXQuote",
    "vipPXService","vipPXFinance","vipPXSettlement","vipPXCondition","vipPXBringing",
    "vipMotStatus","vipMotExpiry","vipMotHistory",
    "vipDvlaMake","vipDvlaModel","vipDvlaYear","vipDvlaFuel",
    "vipAttending",
    "vipApptConfirm","vipFullName","vipEmail","vipPhone","vipPostcode","vipNotes",
    "vipMktOptIn","vipMktChannels","vipPct"];
  var BACKUP_KEY = "vipBackup";
  var MAX_AGE = 14*24*3600*1000;

  /* ── silent resume ── */
  try {
    var raw = localStorage.getItem(BACKUP_KEY);
    if (raw) {
      var b = JSON.parse(raw);
      if (!b || !b.t || Date.now() - b.t > MAX_AGE) {
        localStorage.removeItem(BACKUP_KEY);
      } else if (!sessionStorage.getItem("vipShortlist") && !sessionStorage.getItem("vipFullName")) {
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
  window.vipClearBackup = function(){
    backupDisarmed = true;
    try { localStorage.removeItem(BACKUP_KEY); } catch(e) {}
  };

  /* ── the invitation link: name, the dates the event runs across, the
        customer's own day and time within them, the venue, and optionally
        the plate of the car they may part exchange.
        Read on every page so a customer who opens a mid-funnel link
        still gets personalised copy. ── */
  function clean(v, re, max){ return (v || "").trim().replace(re, "").slice(0, max); }
  try {
    var p = new URLSearchParams(location.search);
    // The event runs across four days, so the date is a range ("Thursday 18
    // to Sunday 21 September") and the slot names a day as well as a time
    // ("Saturday 20th, 10:30am"). Both sanitisers allow for that.
    var map = [
      ["vipName",      clean(p.get("n")  || p.get("name"), /[^A-Za-z' -]/g, 30)],
      ["vipEventDate", clean(p.get("d")  || p.get("date"), /[^A-Za-z0-9 ,&-]/g, 48)],
      ["vipApptTime",  clean(p.get("t")  || p.get("time"), /[^A-Za-z0-9:., -]/g, 32)],
      ["vipVenue",     clean(p.get("v")  || p.get("venue"), /[^A-Za-z0-9 &'-]/g, 34)]
    ];
    map.forEach(function(pair){ if (pair[1]) sessionStorage.setItem(pair[0], pair[1]); });
    var reg = clean(p.get("reg") || p.get("r"), /[^A-Za-z0-9 ]/g, 10).toUpperCase();
    if (reg && !sessionStorage.getItem("vipReg")) sessionStorage.setItem("vipReg", reg);
  } catch(e) {}

  window.vipWho = function(){ return sessionStorage.getItem("vipName") || ""; };

  /* ── progress car ── */
  var CAR_SVG = '<svg viewBox="0 0 72 30" width="34" height="15" aria-hidden="true">' +
    '<path fill="currentColor" d="M4,22 Q1,22 1,18 L2,15 Q3,11 8,10 L17,8.5 L25,3.5 Q27,2 31,2 L45,2 Q49,2 51,4 L57,8.5 L65,10 Q70,11 71,15 L71,18 Q71,22 68,22 Z"/>' +
    '<circle cx="16" cy="22" r="6.5" fill="currentColor"/><circle cx="16" cy="22" r="2.5" fill="#14100f"/>' +
    '<circle cx="56" cy="22" r="6.5" fill="currentColor"/><circle cx="56" cy="22" r="2.5" fill="#14100f"/></svg>';

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
    var prev = parseFloat(sessionStorage.getItem("vipPct") || "0");
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
    sessionStorage.setItem("vipPct", String(target));
  }

  /* ── document ticket ── */
  function initTicket(){
    if (document.body.classList.contains("vip-noticket")) return;
    var g = function(k){ return sessionStorage.getItem(k) || ""; };
    var money = function(v){
      var n = Number(String(v).replace(/,/g, ""));
      return isNaN(n) ? "" : "£" + n.toLocaleString("en-GB");
    };
    var items = [];
    var BODY = {hatchback:"Hatch",saloon:"Saloon",touring:"Touring",suv:"SUV",coupe:"Coupé",convertible:"Convertible",gran_coupe:"Gran Coupé"};

    if (g("vipShortlist")) items.push(g("vipShortlist"));
    if (g("vipModelPref")) items.push(g("vipModelPref"));
    try {
      var bs = JSON.parse(g("vipBodyStyles") || "[]");
      if (bs.length) {
        var names = bs.map(function(x){ return BODY[x] || x; });
        items.push(names.slice(0,3).join(" / ") + (names.length > 3 ? " +" + (names.length - 3) : ""));
      }
    } catch(e) {}
    if (g("vipStockType")) items.push(g("vipStockType"));
    var pt = g("vipPurchaseType");
    if (pt === "Outright" && g("vipCash")) {
      items.push(money(g("vipCash")) + " budget");
    } else if (pt && g("vipMonthly")) {
      var m = money(g("vipMonthly")) + "/mo";
      var dep = g("vipDeposit");
      if (dep && Number(dep.replace(/,/g, "")) > 0) m += ", " + money(dep) + " down";
      items.push(m);
    } else if (pt) {
      items.push(pt);
    }
    if (g("vipAnnualMileage")) items.push(Math.round(Number(g("vipAnnualMileage")) / 1000) + "k miles/yr");
    var px = g("vipPX");
    if (px === "No") items.push("No part exchange");
    else if (px) items.push("PX: " + (g("vipPXModel") || g("vipPXCar") || g("vipReg") || "yes"));

    if (!items.length) return;
    var prog = document.querySelector(".fv2-progress");
    if (!prog) return;
    var t = document.createElement("div");
    t.className = "fv2-ticket";
    var lab = document.createElement("span");
    lab.className = "fv2-ticket-label";
    lab.textContent = "Your document";
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
