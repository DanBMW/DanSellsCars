/* Quotation email builder. Runs fully in the browser; nothing is stored or sent.
   Needs product-email.js loaded first (or required in node). */
(function (root) {
  var PE = (typeof module !== "undefined" && module.exports) ? require("./product-email.js") : root.ProductEmail;
  var esc = PE.esc, joinList = PE.joinList;
  var TYPES = { PCP: "Personal Contract Purchase (PCP)", HP: "Hire Purchase (HP)", PCH: "Personal Contract Hire (PCH)", Cash: "Cash" };
  // Fields every finance type needs, so a monthly figure never appears without its full representative example.
  var NEED = {
    PCP: ["price", "deposit", "credit", "monthly", "payments", "term", "finalPayment", "purchaseFee", "totalPayable", "apr", "mileage", "excessPence", "lender"],
    HP: ["price", "deposit", "credit", "monthly", "payments", "term", "purchaseFee", "totalPayable", "apr", "lender"],
    PCH: ["initialMonths", "initialRental", "monthly", "payments", "term", "mileage", "excessPence", "lender"],
    Cash: ["price"]
  };
  var LABEL = { price: "Cash price", deposit: "Customer deposit", credit: "Total amount of credit", monthly: "Monthly payment", payments: "Number of monthly payments",
    term: "Duration (months)", finalPayment: "Optional final payment", totalPayable: "Total amount payable", apr: "APR representative",
    mileage: "Annual mileage", excessPence: "Excess mileage (pence per mile)", lender: "Lender", initialRental: "Initial rental", initialMonths: "Initial rental (number of months)", purchaseFee: "Option to purchase fee" };
  function biz(d) { return d.customer === "Business"; }
  function vat(d) { return biz(d) ? "excluding VAT" : "including VAT"; }
  function typeName(d) { return d.type === "PCH" && biz(d) ? "Business Contract Hire (BCH)" : TYPES[d.type]; }
  function short(d) { return d.type === "PCH" && biz(d) ? "BCH" : d.type; }
  function money(n) { return "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function num(v) { return v !== "" && v != null && isFinite(Number(v)); }
  function validate(d) {
    var errs = [];
    if (!PE.isValidEmail(d.email)) errs.push("Please enter a valid customer email.");
    if (!d.firstName || !String(d.firstName).trim()) errs.push("Please enter the customer first name.");
    if (!d.vehicle || !String(d.vehicle).trim()) errs.push("Please enter the registration or model.");
    if (d.customer && d.customer !== "Personal" && d.customer !== "Business") errs.push("Please pick personal or business.");
    var need = NEED[d.type]; if (!need) { errs.push("Please pick the quotation type."); return errs; }
    need.forEach(function (k) {
      if (k === "lender") { if (!d.lender || !String(d.lender).trim()) errs.push("Please enter the lender."); }
      else if (!num(d[k]) || Number(d[k]) < 0) errs.push("Please enter " + LABEL[k].toLowerCase() + ".");
    });
    return errs;
  }
  // Soft check that the figures add up; shown to Dan as a warning, never in the email.
  function checks(d) {
    var w = [], n = function (k) { return Number(d[k] || 0); };
    if (d.type === "PCP" || d.type === "HP") {
      var sum = n("deposit") + n("monthly") * n("payments") + (d.type === "PCP" ? n("finalPayment") : 0) + n("purchaseFee");
      if (Math.abs(sum - n("totalPayable")) > 5) w.push("Deposit + monthly payments" + (d.type === "PCP" ? " + final payment" : "") + " + option to purchase fee = " + money(sum) + ", but total amount payable is " + money(n("totalPayable")) + ". Check against the lender quote (fees may explain a small gap).");
      if (Math.abs(n("price") - n("deposit") - n("credit")) > 1) w.push("Cash price minus deposit (" + money(n("price") - n("deposit")) + ") does not equal the amount of credit (" + money(n("credit")) + ").");
    }
    return w;
  }
  function repExample(d) {
    var t = d.type, f = function (k) { return Number(d[k]); };
    if (t === "Cash") return "";
    var v = " (" + vat(d) + ")";
    if (t === "PCH") return "Representative example" + v + ": initial rental of " + f("initialMonths") + " months, " + money(f("initialRental")) + ", followed by " + f("payments") + " monthly rentals of " + money(f("monthly")) +
      ". Contract length " + f("term") + " months. " + f("mileage").toLocaleString("en-GB") + " miles a year, " + f("excessPence") + "p per excess mile. Lender " + esc(d.lender) + ".";
    return "Representative example" + v + ": " + f("payments") + " monthly payments of " + money(f("monthly")) + ". Cash price " + money(f("price")) + ". Customer deposit " + money(f("deposit")) +
      ". Total amount of credit " + money(f("credit")) + "." + (t === "PCP" ? " Optional final payment " + money(f("finalPayment")) + "." : "") + " Option to purchase fee " + money(f("purchaseFee")) + "." + " Total amount payable " + money(f("totalPayable")) +
      ". Duration " + f("term") + " months." + (t === "PCP" ? " " + f("mileage").toLocaleString("en-GB") + " miles a year, " + f("excessPence") + "p per excess mile." : "") + " " + f("apr") + "% APR representative. Lender " + esc(d.lender) + ".";
  }
  var HIRE_END = "At the end of the contract the vehicle is returned, as hire does not give you ownership. Excess mileage and damage charges may apply at the end of the contract.";
  var SMALL = { PCP: "Finance subject to status, 18+, UK residents. Hedin Automotive Ltd is a credit broker, not a lender.",
    HP: "Finance subject to status, 18+, UK residents. Hedin Automotive Ltd is a credit broker, not a lender.",
    PCH: "Subject to status, 18+, UK residents. Hedin Automotive Ltd is a credit broker, not a lender.",
    Cash: "" };
  function protectionLine(inc, exc) {
    if (!exc.length) return "Our quotation is fully protected, including " + joinList(inc.map(function (p) { return p.name; })) + ".";
    if (!inc.length) return "Our quotation excludes " + joinList(exc.map(function (p) { return p.name; })) + ". This package is tailorable to your needs.";
    return "Our quotation includes " + joinList(inc.map(function (p) { return p.name; })) + ", and excludes " + joinList(exc.map(function (p) { return p.name; })) + ". This package is tailorable to your needs.";
  }
  function row(k, v) { return '<tr><td style="padding:6px 0;color:#555">' + k + '</td><td style="padding:6px 0;text-align:right;font-weight:bold">' + v + '</td></tr>'; }
  function build(d) {
    var errs = validate(d); if (errs.length) throw new Error(errs.join(" "));
    var t = d.type, B = biz(d), V = B ? " plus VAT" : "", co = B && d.company ? String(d.company).trim() : "", veh = String(d.vehicle).trim(), inc0 = d.included || [];
    var inc = PE.PRODUCTS.filter(function (p) { return inc0.indexOf(p.id) >= 0; }), exc = PE.PRODUCTS.filter(function (p) { return inc0.indexOf(p.id) < 0; });
    var f = function (k) { return Number(d[k]); };
    var m = function (k) { return money(f(k)) + V; };
    var rows = t === "Cash" ? [row("Cash price", m("price"))]
      : t === "PCH" ? [row("Initial rental (" + f("initialMonths") + " months)", m("initialRental")), row("Monthly rental", m("monthly") + " x " + f("payments")), row("Contract length", f("term") + " months"), row("Annual mileage", f("mileage").toLocaleString("en-GB") + " miles")]
      : [row("Cash price", m("price")), row("Customer deposit", m("deposit")), row("Monthly payment", m("monthly") + " x " + f("payments"))]
        .concat(t === "PCP" ? [row("Optional final payment", m("finalPayment"))] : [])
        .concat([row("Option to purchase fee", m("purchaseFee")), row("Total amount payable", m("totalPayable")), row("APR representative", f("apr") + "%")]);
    var h = '<p>Hi ' + esc(String(d.firstName).trim()) + ',</p><p>Hope you\'re keeping well!</p>\n' +
      '<p>Thank you for your interest in the ' + esc(veh) + '. As promised, please find your ' + typeName(d) + ' quotation' + (co ? ' for ' + esc(co) : '') + ' below.</p>\n' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #1c69d4;border-bottom:1px solid #e5e5e5;margin:8px 0 12px"><tr><td colspan="2" style="padding:10px 0 4px;font-size:17px;font-weight:bold;color:#1c69d4">' + esc(veh) + ': ' + typeName(d) + '</td></tr>' + rows.join("") + '<tr><td colspan="2" style="padding:4px 0 8px;font-size:12px;color:#555">All figures ' + vat(d) + '.' + (B ? ' VAT is charged at the prevailing rate.' : '') + '</td></tr></table>\n';
    if (t === "PCH") h += '<p>' + HIRE_END + '</p>\n';
    if (t !== "Cash") h += '<p style="font-size:13px;color:#555">' + repExample(d) + ' ' + SMALL[t] + '</p>\n';
    h += '<p><b>' + esc(protectionLine(inc, exc)) + '</b></p>\n' +
      '<p>Here is a little more about each product, so you can see exactly what ' + (exc.length ? 'is included and what could be added' : 'is included') + '. Tap any video to watch.</p>\n' +
      '<p>Please note: the product videos in this email are AI generated.</p>\n' +
      '<table width="100%" cellpadding="0" cellspacing="0">' + PE.PRODUCTS.map(function (p) {
        var on = inc0.indexOf(p.id) >= 0;
        var tag = '<p style="margin:16px 0 0;font-size:12px;font-weight:bold;letter-spacing:.04em;color:' + (on ? '#1a7f37' : '#8a6d00') + '">' + (on ? '&#10003; INCLUDED IN YOUR QUOTATION' : 'NOT INCLUDED, AVAILABLE TO ADD') + '</p>';
        return PE.productBlock(p).replace('<td style="padding:16px 0;border-top:1px solid #e5e5e5">', '<td style="padding:0 0 16px;border-top:1px solid #e5e5e5">' + tag);
      }).join("") + '</table>\n';
    var zero = ["gap", "tyreAlloy"].map(function (id) { return exc.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
    if (zero.length) h += '<p>If you would like to add ' + esc(joinList(zero.map(function (p) { return p.name; }))) + ' separately, we can also offer ' + (zero.length === 1 ? 'it' : 'them') + ' on 0% finance over 10 months.</p>\n';
    h += '<p><a href="' + PE.VID + 'full-presentation.html" style="color:#1c69d4">&#9654; Watch our full protection presentation</a></p>\n' +
      '<p>This quotation is subject to vehicle availability' + (t === "Cash" ? '' : ' and status') + '. If you have any questions, or would like to go ahead, please do let me know and I will be happy to assist.</p>\n<p>Kind regards,</p>';
    var html = '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222;padding:24px"><tr><td>\n' + h + '</td></tr></table></td></tr></table>';
    return { to: d.email.trim(), cc: PE.CC, subject: "Your " + (t === "Cash" ? "" : short(d) + " ") + "quotation for your " + veh, html: html, warnings: checks(d), protection: protectionLine(inc, exc), typeName: typeName(d) };
  }
  var api = { build: build, validate: validate, checks: checks, protectionLine: protectionLine, NEED: NEED, TYPES: TYPES, typeName: typeName };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.QuoteEmail = api;
})(this);
