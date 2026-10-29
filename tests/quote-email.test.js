const assert = require("assert"); const Q = require("../quote-email.js"); const PE = require("../product-email.js");
const base = { email: "jo@example.com", firstName: "Jo", vehicle: "BMW X1 sDrive20i", lender: "BMW Financial Services" };
const fin = { price: 38000, deposit: 5000, credit: 33000, monthly: 399, payments: 47, term: 48, finalPayment: 16000, totalPayable: 39753, apr: 6.9, mileage: 8000, excessPence: 9 };
const ids = PE.PRODUCTS.map(p => p.id); let n = 0;
const ex = {
  PCP: { ...fin }, HP: { price: 38000, deposit: 5000, credit: 33000, monthly: 760, payments: 48, term: 48, totalPayable: 41480, apr: 6.9 },
  PCH: { initialRental: 2700, monthly: 300, payments: 35, term: 36, mileage: 8000, excessPence: 9 }, Cash: { price: 38000 } };
for (const type of Object.keys(ex)) for (let m = 0; m < 32; m++) {
  const included = ids.filter((_, i) => m & (1 << i)); const r = Q.build({ ...base, ...ex[type], type, included }); n++;
  const h = r.html, txt = PE.toText(h);
  // fully protected only when all five
  assert.strictEqual(h.includes("fully protected"), included.length === 5);
  assert.strictEqual(h.includes("tailorable to your needs"), included.length < 5);
  if (included.length && included.length < 5) assert.ok(/Our quotation includes .+, and excludes .+\. This package is tailorable to your needs\./.test(txt));
  if (!included.length) assert.ok(txt.includes("Our quotation excludes "));
  // all five products presented, with correct markers, and the AI note once
  PE.PRODUCTS.forEach(p => assert.ok(h.includes("product-videos/" + p.slug + ".gif")));
  assert.strictEqual((h.match(/INCLUDED IN YOUR QUOTATION/g) || []).length, included.length);
  assert.strictEqual((h.match(/NOT INCLUDED, AVAILABLE TO ADD/g) || []).length, 5 - included.length);
  assert.strictEqual(h.split("AI generated").length - 1, 1);
  // monthly figure only with its full representative example
  if (type === "Cash") { assert.ok(!/monthly|APR|Representative/i.test(txt)); assert.ok(txt.includes("£38,000.00")); }
  else {
    assert.ok(txt.includes("Representative example:")); assert.ok(txt.includes("credit broker, not a lender"));
    for (const k of Q.NEED[type]) if (k !== "lender" && k !== "payments" && k !== "term") {
      const v = ex[type][k]; const s = k === "apr" ? v + "%" : k === "mileage" ? v.toLocaleString("en-GB") + " miles" : k === "excessPence" ? v + "p" : "£" + v.toLocaleString("en-GB", { minimumFractionDigits: 2 });
      assert.ok(txt.split("Representative example:")[1].includes(s), type + " rep example missing " + k); }
    if (type === "PCH") assert.ok(txt.includes("you will not own the car") && !/APR|final payment|Cash price/.test(txt.split("Our quotation")[0]));
    if (type === "HP") assert.ok(!/final payment|excess mile/i.test(txt.split("Our quotation")[0]));
  }
  assert.strictEqual(h.includes("0% finance"), !included.includes("gap") || !included.includes("tyreAlloy"));
  assert.ok(/<p>Kind regards,<\/p><\/td>/.test(h) && !/Daniel|Phone:|Sales Executive/.test(h));
  assert.strictEqual(r.cc, "Sergio.Garaguso@hedinautomotive.co.uk");
  assert.ok(!/ [-–—] |\w—\w/.test(txt.replace(/https?:\S+/g, "")), "no dashes in joining copy");
}
assert.strictEqual(Q.protectionLine(PE.PRODUCTS.slice(0, 2), PE.PRODUCTS.slice(2)), "Our quotation includes Tyre & Alloy Insurance and GAP Insurance, and excludes Hedin Club Care SMART Protection, Williams Racing Ceramic Coating and Extended Warranty. This package is tailorable to your needs.");
assert.strictEqual(Q.protectionLine(PE.PRODUCTS.slice(0, 4), PE.PRODUCTS.slice(4)), "Our quotation includes Tyre & Alloy Insurance, GAP Insurance, Hedin Club Care SMART Protection and Williams Racing Ceramic Coating, and excludes Extended Warranty. This package is tailorable to your needs.");
// missing finance fields block the email
for (const k of Q.NEED.PCP) { const d = { ...base, ...fin, type: "PCP" }; delete d[k]; assert.throws(() => Q.build(d), k); }
assert.throws(() => Q.build({ ...base, type: "PCP", price: 1 })); assert.throws(() => Q.build({ ...base, email: "x", type: "Cash", price: 1 }));
assert.throws(() => Q.build({ ...base, type: "Loan", price: 1 }));
assert.strictEqual(Q.build({ ...base, ...fin, type: "PCP" }).warnings.length, 0);
assert.ok(Q.build({ ...base, ...fin, totalPayable: 30000, type: "PCP" }).warnings.length === 1);
assert.ok(Q.build({ ...base, firstName: "<i>", type: "Cash", price: 1 }).html.includes("&lt;i&gt;"));
console.log("quote-email: " + n + " variants + edge cases OK");
