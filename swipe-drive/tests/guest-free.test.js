/* SwipeToDrive first open guest flow: the 15 free swipe counter, the "Maybe later" skip and re-prompt, and carrying
   guest swipes and answers into an account without changing what the account already holds.
   Run with: node swipe-drive/tests/guest-free.test.js */
var path = require('path');
var F = require(path.join(__dirname, '..', 'guest-free.js'));
var p = 0, f = 0;
function ok(c, m) { if (c) p++; else { f++; console.log('FAIL', m); } }
function sw(n, likeEvery) { var o = {}; for (var i = 0; i < n; i++) o['REG' + i] = { liked: likeEvery ? i % likeEvery === 0 : false, at: i }; return o; }
function guest(n) { return { cust: F.freeCust(), swipes: sw(n, 3) }; }

/* counter */
ok(F.FIRST === 15 && F.AGAIN === 15 && F.MAX_PROMPTS === 2, 'constants: 15 free, 15 more, 2 prompts');
ok(F.pending(guest(0)) === true, 'a fresh free guest is pending');
ok(F.pending({ cust: { budget_type: 'cash', body: 'suv' } }) === false, 'an older guest who answered the questions is not pending');
ok(F.pending({}) === false && F.pending(null) === false, 'no guest record: not pending (signed in customers never see it)');
for (var n = 0; n < 15; n++) ok(!F.shouldPrompt(guest(n)), 'no prompt after ' + n + ' swipes');
ok(F.shouldPrompt(guest(15)), 'prompt after the 15th swipe');
ok(F.shouldPrompt(guest(17)), 'prompt still due when the 15th was missed (eg app closed mid swipe)');
ok(!F.shouldPrompt({ cust: { budget_type: 'monthly', desk: {} }, swipes: sw(40) }), 'never prompts a guest who already answered');
var pr = F.progress(guest(6)); ok(pr && pr.n === 6 && pr.of === 15 && pr.left === 9, 'progress 6 of 15');
ok(F.progress(guest(22)).n === 15, 'progress caps at 15');
ok(F.count(guest(9)) === 9 && F.likes(guest(9)) === 3, 'count and likes');
/* undo lowers the count, so a guest who undoes the 15th is not prompted until they swipe it again */
var u = guest(15); delete u.swipes.REG14; ok(!F.shouldPrompt(u), 'undo below 15: no prompt');

/* shown then skip: once more after another 15, then never */
var d = guest(15); F.markShown(d);
ok(F.state(d).shown === 1 && !F.shouldPrompt(d), 'once shown, not shown again straight away');
ok(F.progress(d) === null, 'progress bar goes once Revvy has asked');
F.skip(d); ok(F.state(d).skips === 1 && F.state(d).nextAt === 30, 'Maybe later: next ask at 30 swipes');
d.swipes = sw(29, 3); ok(!F.shouldPrompt(d), 'no prompt at 29');
d.swipes = sw(30, 3); ok(F.shouldPrompt(d), 'prompt again at 30');
F.markShown(d); F.skip(d); ok(F.lastPrompt(d), 'second skip is the last prompt');
d.swipes = sw(45, 3); ok(!F.shouldPrompt(d), 'no third prompt at 45');
d.swipes = sw(200, 3); ok(!F.shouldPrompt(d), 'no prompt at 200 either (no nagging)');
/* closing the prompt any other way (back button, nav) counts the same: next ask 15 swipes later */
var d2 = guest(15); F.markShown(d2); d2.swipes = sw(29); ok(!F.shouldPrompt(d2), 'closed without a choice: quiet until 30');
d2.swipes = sw(30); ok(F.shouldPrompt(d2), 'closed without a choice: asks at 30');
/* answering finishes it */
var d3 = guest(15); F.markShown(d3); F.finish(d3);
ok(!F.pending(d3) && F.state(d3).done && !d3.cust.desk.prefs_pending && d3.cust.desk.lead_source === 'swipetodrive-guest', 'finish clears pending, keeps lead source');
d3.swipes = sw(60); ok(!F.shouldPrompt(d3), 'finished: never prompts');
/* the state survives a JSON round trip (localStorage) */
var d4 = JSON.parse(JSON.stringify(F.skip(F.markShown(guest(15))))); ok(F.state(d4).nextAt === 30 && F.state(d4).shown === 1, 'state survives localStorage');

/* hints from likes */
var cars = { A: { body: 'SUV', fuel: 'Electric', kind: 'used' }, B: { body: 'SUV', fuel: 'Electric', kind: 'used' }, C: { body: 'Saloon', fuel: 'Petrol (mild hybrid)', kind: 'used' }, D: { body: 'SUV', fuel: 'Plug-in hybrid', kind: 'used' }, E: { body: 'Coupe', fuel: 'Petrol', kind: 'new_stock' } };
var by = function (r) { return cars[r]; };
var h = F.hints({ swipes: { A: { liked: true }, B: { liked: true }, C: { liked: true }, D: { liked: true }, E: { liked: false } } }, by);
ok(h && h.likes === 4 && h.body === 'suv' && h.fuel.indexOf('electric') === 0 && h.new_used === 'used', 'hints: 4 likes, SUV, electric first, used only: ' + JSON.stringify(h));
ok(F.hints({ swipes: { A: { liked: true }, B: { liked: true } } }, by) === null, 'hints need 3 likes');
var h2 = F.hints({ swipes: { A: { liked: true }, C: { liked: true }, E: { liked: true } } }, by);
ok(h2 && h2.body === null && h2.new_used === 'both', 'hints: no shape when likes are mixed, either when new and used liked');

/* carry over: swipes */
var gs = { A1: { liked: true, at: 1 }, B2: { liked: false, at: 2 }, C3: { liked: true, shortlisted: true, at: 3 }, D4: { liked: false, at: 4 } };
var have = { B2: { liked: true }, X9: { liked: true } };
var add = F.carrySwipes(gs, have), regs = add.map(function (x) { return x.reg; });
ok(add.length === 3 && regs.indexOf('B2') === -1, 'carry: every guest swipe the account lacks, account swipe B2 kept as it is');
ok(add.filter(function (x) { return x.liked; }).length === 2 && add.filter(function (x) { return !x.liked; }).length === 1, 'carry: likes and passes both carried');
ok(add.find(function (x) { return x.reg === 'C3'; }).extra.shortlisted === true, 'carry: a super like stays shortlisted');
ok(F.carrySwipes(sw(15, 3), {}).length === 15, 'carry: all 15 free swipes into a new account');
ok(F.carrySwipes(null, have).length === 0, 'carry: nothing to carry');

/* carry over: answers */
var existing = { id: 'c1', name: 'Sam', budget_type: 'cash', cash_gbp: 30000, body: 'saloon', body_must: true, fuel: 'diesel', fuel_must: ['diesel'], new_used: 'used', desk: { lead_source: 'find-my-bmw', note: 'keep' } };
var r1 = F.carryPrefs(existing, F.freeCust());
ok(r1.budget_type === 'cash' && r1.cash_gbp === 30000 && r1.body === 'saloon' && r1.fuel === 'diesel' && r1.new_used === 'used' && r1.name === 'Sam', 'free guest into an existing account: every saved choice kept');
ok(r1.desk.lead_source === 'find-my-bmw' && r1.desk.note === 'keep' && !('prefs_pending' in r1.desk), 'desk kept, prefs pending never saved');
var r2 = F.carryPrefs({}, F.freeCust());
ok(r2.budget_type === undefined && r2.body === undefined && r2.fuel === undefined && r2.desk.lead_source === 'swipetodrive-guest', 'free guest into a new account: no made up answers, lead source set');
var answered = { budget_type: 'monthly', monthly_gbp: 450, body: 'suv', body_must: true, fuel: 'electric', new_used: 'new', desk: { lead_source: 'swipetodrive-guest' } };
var r3 = F.carryPrefs({ id: 'c2', budget_type: null, body: 'any', fuel: 'open', new_used: 'both' }, answered);
ok(r3.monthly_gbp === 450 && r3.body === 'suv' && r3.body_must === true && r3.fuel === 'electric' && r3.new_used === 'new' && r3.desk.body_must === true, 'answered guest fills an empty account');
var r4 = F.carryPrefs(existing, answered);
ok(r4.budget_type === 'cash' && r4.body === 'saloon' && r4.fuel === 'diesel' && r4.new_used === 'used', 'answered guest never overwrites an account that has answers');
ok(existing.desk.prefs_pending === undefined && existing.body === 'saloon', 'the account object passed in is not changed');

console.log(p + ' passed, ' + f + ' failed'); process.exit(f ? 1 : 0);
