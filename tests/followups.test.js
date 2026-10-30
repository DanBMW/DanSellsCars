const assert = require("assert"); const F = require("../swipe-drive/crm/followups-core.js"); let n = 0;
(async () => {
  // crypto round trip, wrong passphrase, tamper, iterations
  assert.ok(F.ITER >= 600000);
  const { key, vault } = await F.makeVault("correct horse battery staple");
  const rec = F.newRecord({ firstName: "Jo", email: "jo@example.com", car: "BMW X1", start: "2026-10-29" }, "2026-10-29");
  const box = await F.encrypt(key, rec); assert.ok(!box.ct.includes("firstName") && !JSON.stringify(box).includes("example"));
  assert.deepStrictEqual(await F.decrypt(key, box), rec); n++;
  const box2 = await F.encrypt(key, rec); assert.notStrictEqual(box.iv, box2.iv); n++;
  const k2 = await F.openVault("correct horse battery staple", vault); assert.deepStrictEqual(await F.decrypt(k2, box), rec); n++;
  await assert.rejects(F.openVault("wrong horse battery staple", vault), /did not unlock/); n++;
  await assert.rejects(F.openVault("short", vault), /12 characters/); n++;
  const bad = { ...box, ct: (box.ct[0] === "A" ? "B" : "A") + box.ct.slice(1) }; await assert.rejects(F.decrypt(key, bad)); n++;
  await assert.rejects(F.decrypt(key, box, "other")); n++;
  const bk = F.exportBackup(vault, [{ id: "1", ...box }]); assert.ok(!bk.includes("jo@example.com"));
  assert.deepStrictEqual(await F.readBackup(bk, "correct horse battery staple"), [rec]); n++;
  // journey
  assert.deepStrictEqual(F.stagesFor(48).map(x => x.m), [null, 0, 6, 12, 18, 24, 30, 36, 42, 45]); n++;
  assert.deepStrictEqual(F.stagesFor(48).map(x => x.kind), ["purchase", "initial", "checkin", "checkin", "checkin", "checkin", "checkin", "review", "remain", "final"]); n++;
  assert.deepStrictEqual(F.stagesFor(36).map(x => x.m), [null, 0, 6, 12, 18, 24, 30, 33]); n++;
  assert.deepStrictEqual(F.stagesFor(24).map(x => x.m), [null, 0, 6, 12, 18, 21]); assert.throws(() => F.stagesFor(12)); n++;
  for (const [a, m, b] of [["2026-08-31", 6, "2027-02-28"], ["2027-08-31", 6, "2028-02-29"], ["2026-12-31", 6, "2027-06-30"], ["2027-04-29", -12, "2026-04-29"], ["2027-02-28", -12, "2026-02-28"]]) { assert.strictEqual(F.addMonths(a, m), b); n++; }
  assert.strictEqual(rec.due, "2026-10-29"); assert.strictEqual(F.nextStage(rec).id, "buy"); assert.strictEqual(F.status(rec, "2026-10-29"), "due"); n++;
  let r = rec; const sent = [];
  for (const [id, d] of [["buy", "2026-10-29"], ["m0", "2026-10-31"], ["m6", "2027-04-29"], ["m12", "2027-10-29"], ["m18", "2028-04-29"], ["m24", "2028-10-29"], ["m30", "2029-04-29"], ["m36", "2029-10-29"], ["m42", "2030-04-29"], ["m45", "2030-07-29"]]) {
    assert.strictEqual(F.nextStage(r).id, id); assert.strictEqual(r.due, d); r = F.markSent(r, F.addMonths(d, 0 + (id === "m6" ? 0 : 0)), 0); sent.push(id); n++; }
  assert.strictEqual(F.nextStage(r), null); assert.strictEqual(r.due, null); assert.strictEqual(F.status(r, "2031-01-01"), "complete"); assert.throws(() => F.markSent(r, "2031-01-01", 0)); n++;
  // sending late does not shift the plan: due dates stay anchored on the start date
  const late = F.markSent(F.markSent(rec, "2026-10-29", 0), "2026-11-20", 1); assert.strictEqual(late.due, "2027-04-29"); assert.strictEqual(rec.history.length, 0); n++;
  assert.strictEqual(F.status({ ...late, due: "2026-10-29" }, "2026-10-30"), "overdue"); assert.strictEqual(F.status(late, "2027-04-20"), "soon");
  assert.strictEqual(F.status(late, "2027-01-01"), "upcoming"); assert.strictEqual(F.status({ ...late, stopped: true }, "2027-05-01"), "stopped"); n++;
  // mid journey: Dan sends the 12 month email to someone not yet in the database
  const mid = F.newRecord({ firstName: "Sam", email: "sam@example.com", car: "BMW 330e", stage: "m12", sentDate: "2026-10-29" }, "2026-10-29");
  assert.strictEqual(mid.start, "2025-10-29"); assert.deepStrictEqual(mid.history.map(h => h.stage + (h.skipped ? "s" : "")), ["buys", "m0s", "m6s"]);
  assert.strictEqual(F.nextStage(mid).id, "m12"); assert.strictEqual(mid.due, "2026-10-29");
  const mid2 = F.markSent(mid, "2026-10-29", 2); assert.strictEqual(F.nextStage(mid2).id, "m18"); assert.strictEqual(mid2.due, "2027-04-29");
  assert.deepStrictEqual(F.timeline(mid2, "2026-10-29").map(t => t.state), ["skipped", "skipped", "skipped", "sent", "upcoming", "planned", "planned", "planned", "planned", "planned"]); n++;
  assert.strictEqual(F.suggestVariant(mid2), 0); n++;
  const midE = F.newRecord({ firstName: "Sam", email: "sam@example.com", stage: "m36", sentDate: "2026-10-29", start: "2023-11-15" }, "2026-10-29");
  assert.strictEqual(midE.start, "2023-11-15"); assert.strictEqual(midE.due, "2026-11-15"); assert.strictEqual(midE.history.length, 7); n++;
  assert.throws(() => F.newRecord({ firstName: "A", email: "a@b.co", stage: "m45", term: 36 }, "2026-10-29"), /Unknown stage/);
  // keep in touch path
  const k = F.newRecord({ firstName: "Lee", email: "lee@example.com", path: "kit", sentDate: "2026-10-29" }, "2026-10-29");
  assert.strictEqual(k.due, "2026-10-29"); const kk = F.markSent(k, "2026-10-29", 0); assert.strictEqual(kk.due, "2027-04-29"); assert.strictEqual(F.nextStage(kk).kind, "kit"); n++;
  assert.strictEqual(F.suggestVariant(r), 1);
  const list = [{ ...rec, id: "a", due: "2026-11-01" }, { ...rec, id: "b", due: "2026-10-01" }, { ...rec, id: "c", due: "2026-10-29" }, { ...rec, id: "d", due: "2026-09-01", stopped: true }];
  assert.deepStrictEqual(F.dueNow(list, "2026-10-29").map(x => x.id), ["b", "c"]); n++;
  assert.throws(() => F.newRecord({ firstName: "A", email: "bad" }, "2026-10-29"), /email/);
  assert.throws(() => F.newRecord({ email: "a@b.co" }, "2026-10-29"), /needed/);
  // wording: every stage, 3 distinct variants, rules
  const stages = F.stagesFor(48).concat([{ id: "kit0", m: null, kind: "kit" }]);
  for (const st of stages) {
    const vs = F.variants(st.kind); assert.strictEqual(vs.length, 3); assert.strictEqual(new Set(vs.map(v => v.s)).size, 3);
    for (let i = 0; i < 3; i++) for (const car of ["BMW X1 xDrive", ""]) {
      const m = F.build({ ...rec, path: st.kind === "kit" ? "kit" : "journey", car, firstName: "Jo <b>" }, i, st); n++;
      assert.strictEqual(m.cc, "Sergio.Garaguso@hedinautomotive.co.uk"); assert.strictEqual(m.to, "jo@example.com");
      const visible = (m.subject + " " + m.text).replace(/https:\/\/[^\s]+/g, "");
      assert.ok(!/[-\u2010-\u2015]/.test(visible), "dash in " + st.id + i + ": " + visible);
      assert.ok(m.text.endsWith("Kind regards,")); assert.ok(m.text.includes("https://wa.me/447827138197"));
      assert.ok(!/£|\$|per month|monthly|%|Dan Cane/i.test(visible)); assert.ok(!/\{\w+\}/.test(m.text + m.subject));
      if (st.m) assert.ok(!/\b(?!6\b|\d{4,}\b)\d+\b/.test(visible.replace(new RegExp("\\b" + st.m + "\\b", "g"), "")), "stray number " + st.id + i);
      assert.ok(!m.html.includes("<b>") && m.html.includes("Jo &lt;b&gt;"));
      assert.ok(F.mailto(m).startsWith("mailto:jo%40example.com?cc=Sergio.Garaguso%40hedinautomotive.co.uk&subject="));
    }
  }
  // purchase vs initial: purchase date and collection date
  const pc = F.newRecord({ firstName: "Ann", email: "ann@example.com", car: "BMW X5", purchaseDate: "2026-10-01", start: "2026-10-20", sentDate: "2026-10-01" }, "2026-10-01");
  assert.strictEqual(pc.due, "2026-10-01"); const pc1 = F.markSent(pc, "2026-10-01", 0); assert.strictEqual(F.nextStage(pc1).id, "m0"); assert.strictEqual(pc1.due, "2026-10-22");
  const pc2 = F.markSent(pc1, "2026-10-22", 1); assert.strictEqual(pc2.due, "2027-04-20"); assert.strictEqual(F.markSent(pc2, "2027-04-20", 0).due, "2027-10-20"); n++;
  const pm = F.build(pc, 0), im = F.build(pc1, 0); assert.ok(pm.text.includes("https://dan-sells.co.uk/purchase-thankyou.html?c=000&name=Ann") && /FAQs/.test(pm.text) && !/survey/.test(pm.text));
  assert.ok(/survey/.test(im.text) && im.text.includes("controls-refresh") && !im.text.includes("purchase-thankyou")); n++;
  assert.throws(() => F.newRecord({ firstName: "A", email: "a@b.co", purchaseDate: "2026-11-01", start: "2026-10-20" }, "2026-10-01"), /Purchase date/);
  const at0 = F.newRecord({ firstName: "B", email: "b@b.co", stage: "m0", sentDate: "2026-10-31" }, "2026-10-31"); assert.strictEqual(at0.start, "2026-10-29"); assert.strictEqual(at0.history[0].stage, "buy"); n++;
  // initial follow up with product presentation presentation (reuses product-email.js)
  const PE = require("../product-email.js"), ids = PE.PRODUCTS.map(p => p.id);
  for (let mask = 0; mask < 32; mask++) { const has = ids.filter((_, i) => mask & (1 << i));
    const pr = F.newRecord({ firstName: "Jo", email: "jo@example.com", car: "BMW X1", products: has, stage: "m0", sentDate: "2026-10-31" }, "2026-10-31");
    assert.deepStrictEqual(pr.products, has);
    for (let v = 0; v < 3; v++) { const m = F.build(pr, v); n++;
      assert.ok(m.text.includes("Please note: the product videos in this email are AI generated."));
      for (const p of PE.PRODUCTS) assert.ok(m.html.includes(PE.VID + p.slug + ".html"));
      assert.strictEqual((m.html.match(/INCLUDED WITH YOUR CAR/g) || []).length, has.length);
      assert.strictEqual((m.html.match(/AVAILABLE TO ADD/g) || []).length, 5 - has.length);
      assert.ok(!/0% finance|£/.test(m.text)); assert.ok(m.text.endsWith("Kind regards,")); assert.ok(m.text.indexOf("AI generated") < m.text.indexOf("wa.me"));
      const intro = m.text.split("\n\n")[3]; assert.ok(!/[-\u2010-\u2015]/.test(intro), intro); } }
  // products only on month 0; no products field = plain congrats
  const plain = F.build({ ...rec, products: null }, 0); assert.ok(!plain.html.includes("AI generated")); assert.strictEqual(plain.products, null);
  const later = F.markSent(F.newRecord({ firstName: "Jo", email: "jo@example.com", products: ["gap"], stage: "m0" }, "2026-10-29"), "2026-10-29", 0);
  assert.ok(!F.build(F.newRecord({ firstName: "Jo", email: "jo@example.com", products: ["gap"] }, "2026-10-29"), 0).html.includes("AI generated"));
  assert.ok(!F.build(later, 0).html.includes("AI generated")); n++;
  // mid journey entry keeps products in the encrypted record
  const midP = F.newRecord({ firstName: "Sam", email: "sam@example.com", stage: "m12", sentDate: "2026-10-29", products: ["gap", "warranty"] }, "2026-10-29");
  assert.deepStrictEqual((await F.decrypt(key, await F.encrypt(key, midP))).products, ["gap", "warranty"]); assert.strictEqual(F.nextStage(midP).id, "m12"); n++;
  assert.throws(() => F.build(rec, 3));
  console.log("followups tests passed:", n);
})().catch(e => { console.error(e); process.exit(1); });
