/* santa-draw.js - the Secret Santa draw, done on the server so no browser
 * ever holds the whole list. Run by scripts/lockup-mail.js on every lockup
 * emails run (every 15 minutes, Monday to Saturday daytime), or on its own:
 *   FIREBASE_SA=... node scripts/santa-draw.js
 *
 * An organiser asks for a draw in the app (santa/drawRequest {mode:'draw'|'cancel'}).
 * This then writes, with the admin SDK (the rules let no browser write these):
 *   santa/assign/<giverKey> = { to, name, drawId }   readable only by that giver
 *   santa/sealed            = { drawId, pairs }      readable only by an admin AFTER
 *                                                    santa/uncovered/<drawId> is written,
 *                                                    which is permanent and shown to everyone
 *   santa/draw              = { id, ts, count, byName }
 * Keys are the member's email, lower case, with '.' as ','. The rules compute the
 * same key from the signed in, verified email, which is what makes the reads personal.
 * Pure helpers (keyOf, derange) are exported for scripts/test-santa-draw.js.
 */
'use strict';
const crypto = require('crypto');

function keyOf(email) { return String(email || '').trim().toLowerCase().split('.').join(','); }

function rnd(n) { return crypto.randomInt(n); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

/* one big loop (A gives to B, B to C ... last to A): nobody draws themselves and
   there are no little closed pairs. Exclusions (both ways) are respected; if a
   loop cannot be found it falls back to any derangement that respects them. */
function derange(keys, excl, tries) {
  excl = excl || {};
  const bad = (a, b) => a === b || !!((excl[a] || {})[b] || (excl[b] || {})[a]);
  if (keys.length < 2) throw new Error('need at least two people');
  tries = tries || 5000;
  for (let t = 0; t < tries; t++) {
    const o = shuffle(keys), pairs = {};
    let ok = true;
    for (let i = 0; i < o.length; i++) { const g = o[i], r = o[(i + 1) % o.length]; if (bad(g, r)) { ok = false; break; } pairs[g] = r; }
    if (ok) return pairs;
  }
  for (let t = 0; t < tries; t++) {
    const r = shuffle(keys), pairs = {};
    if (keys.every((g, i) => !bad(g, r[i]) && (pairs[g] = r[i]))) return pairs;
  }
  throw new Error('no draw fits those exclusions');
}

async function runRoot(db, R, log) {
  const req = (await db.ref(R + '/drawRequest').get()).val();
  if (!req) return false;
  const now = Date.now();
  if (req.mode === 'cancel') {
    await db.ref(R).update({ assign: null, sealed: null, draw: null, notes: null, drawRequest: null, drawError: null });
    log(R + ': draw cancelled by ' + (req.byName || '?'));
    return true;
  }
  const members = (await db.ref(R + '/members').get()).val() || {};
  const excl = (await db.ref(R + '/exclusions').get()).val() || {};
  const keys = Object.keys(members).filter(k => keyOf(members[k].email) === k);
  let pairs;
  try { pairs = derange(keys, excl); } catch (e) {
    await db.ref(R).update({ drawRequest: null, drawError: { msg: e.message, ts: now } });
    log(R + ': draw refused, ' + e.message);
    return true;
  }
  const id = 'd' + now.toString(36) + crypto.randomBytes(3).toString('hex');
  const assign = {};
  keys.forEach(g => { assign[g] = { to: pairs[g], name: members[pairs[g]].name, drawId: id }; });
  await db.ref(R).update({
    assign, notes: null, drawError: null, drawRequest: null,
    sealed: { drawId: id, pairs },
    draw: { id, ts: now, count: keys.length, byName: req.byName || '' }
  });
  log(R + ': drew ' + keys.length + ' names (draw ' + id + '), nothing printed');
  return true;
}

async function run(db, log) {
  log = log || (m => console.log('santa: ' + m));
  for (const R of ['santa', 'santaTest']) {
    try { await runRoot(db, R, log); } catch (e) { log(R + ' failed: ' + (e && e.message)); }
  }
}

module.exports = { keyOf, derange, run, runRoot };

if (require.main === module) {
  const admin = require('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)), databaseURL: 'https://forecourt-1b6bc-default-rtdb.europe-west1.firebasedatabase.app' });
  run(admin.database()).then(() => process.exit(0), e => { console.error(e); process.exit(1); });
}
