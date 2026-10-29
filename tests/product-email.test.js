const assert = require("assert"); const PE = require("../product-email.js");
const fs = require("fs");
const NOTE = "<p>Please note: the product videos in this email are AI generated.</p>";
const base = { email: "james@example.com", firstName: "James", car: "BMW 1 Series", orderDate: "2026-10-27", stage: "point_of_sale" };
// matches yesterday's approved test email body
const ref = fs.readFileSync("/workspace/hedin-products/test-email-sergio.html", "utf8").match(/<tr><td>\n([\s\S]*)<\/td><\/tr><\/table><\/td><\/tr><\/table>/)[1];
const r0 = PE.build({ ...base, bought: [] });
assert.strictEqual(r0.html.replace(NOTE + "\n", "").match(/<tr><td>\n([\s\S]*)<\/td><\/tr><\/table><\/td><\/tr><\/table>/)[1], ref, "matches test email");
assert.strictEqual(r0.deadline, "26th November"); assert.strictEqual(r0.cc, "Sergio.Garaguso@hedinautomotive.co.uk");
let n = 0;
assert.ok(r0.html.includes(NOTE + "\n<table"), "note directly above first product");
const ids = PE.PRODUCTS.map(p => p.id);
for (let mask = 0; mask < 32; mask++) for (const stage of ["point_of_sale", "post_handover"]) {
  const bought = ids.filter((_, i) => mask & (1 << i)); const r = PE.build({ ...base, stage, bought }); n++;
  const miss = ids.filter(i => !bought.includes(i));
  assert.deepStrictEqual(r.missing, miss);
  const zeroExpected = miss.includes("gap") || miss.includes("tyreAlloy");
  assert.strictEqual(/0% finance/.test(r.html), zeroExpected, "0% rule " + mask);
  if (zeroExpected) { const z = r.html.match(/offer (.*?) on 0%/)[1]; assert.strictEqual(z, ["gap","tyreAlloy"].filter(i=>miss.includes(i)).map(i=>i==="gap"?"GAP Insurance":"Tyre &amp; Alloy Insurance").join(" and ")); }
  PE.PRODUCTS.forEach(p => assert.strictEqual(r.html.includes("product-videos/" + p.slug + ".gif"), miss.includes(p.id)));
  assert.ok(stage === "point_of_sale" ? r.html.includes("Thank you so much for your order") : r.html.includes("enjoying your new"));
  assert.ok(!/£|\bprice/i.test(r.html), "no prices"); assert.ok(r.html.includes("Phone: {Phone}"));
  if (!miss.length) { assert.ok(r.html.includes("full range of protection") && !r.html.includes("You have until"));
    assert.strictEqual(r.subject, stage === "point_of_sale" ? "Thank you for your order of your new BMW 1 Series" : "Thank you, enjoy your new BMW 1 Series!"); }
  else { assert.strictEqual(r.subject, "Protection options for your new BMW 1 Series"); assert.ok(r.html.includes("26th November"));
    assert.ok(r.html.includes(miss.length === 1 ? "take out this policy" : "any of these policies")); }
  assert.strictEqual(r.html.split("AI generated").length - 1, miss.length ? 1 : 0, "AI note " + mask);
  if (miss.length) assert.ok(r.html.indexOf(NOTE) < r.html.indexOf("product-videos/"));
  assert.ok(PE.toText(r.html).length > 200);
}
assert.ok(PE.build({ ...base, bought: [], phone: "07000 000000" }).html.includes("Phone: 07000 000000"));
assert.ok(PE.build({ ...base, firstName: "<b>x</b>", bought: [] }).html.includes("&lt;b&gt;"));
assert.throws(() => PE.build({ ...base, email: "bad@x" })); assert.throws(() => PE.build({ ...base, firstName: " " }));
assert.strictEqual(PE.deadline("2026-12-15"), "14th January"); assert.strictEqual(PE.deadline("2026-02-01"), "3rd March");
assert.strictEqual(PE.deadline("2026-10-12"), "11th November");
for (const f of require("fs").readdirSync(__dirname + "/../product-videos").filter(f => f.endsWith(".html")))
  assert.ok(fs.readFileSync(__dirname + "/../product-videos/" + f, "utf8").includes("Please note: this video is AI generated."), f);
console.log("product-email: " + n + " variants + edge cases OK");
