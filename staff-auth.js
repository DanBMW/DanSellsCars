/* staff-auth.js - Firebase sign-in for the staff pages (ES module).
 *
 * The database rules (database.rules.json) have two levels for writes:
 *   - "signed in": any Firebase sign-in, including the invisible anonymous
 *     one this file does for you (mug shot deck, Nathan's upload, forecourt
 *     tools, the board's own stock/pairing writes);
 *   - "staff": a Google account whose uid Dan has added under /staff in the
 *     database (admin console, board manager actions, reading signed
 *     customer forms).
 * Reads of the board's own data stay public so the office TV needs nothing.
 *
 * Everything here is lazy and fails soft: the Firebase Auth SDK is imported
 * only when needed, and if it can't load the page carries on exactly as it
 * did before. Nothing shows unless the database actually refuses something.
 *
 * Use:
 *   import { ensureSignedIn, guard, staffSignIn, authSettled, isDenied } from './staff-auth.js';
 *   ensureSignedIn(app);                  // quiet anonymous sign-in
 *   const S = guard(app, 'staff');        // or 'signed'
 *   save: S((v) => set(ref(db, 'x'), v)), // a refused write asks for staff sign-in, then retries once
 *
 * See SECURITY-STAFF.md for the one-off setup.
 */
const SDK = 'https://www.gstatic.com/firebasejs/10.12.0/';
let modsP = null;
function mods() {
  if (!modsP) {
    modsP = Promise.all([import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-database.js')])
      .then(([A, D]) => ({ A, D }))
      .catch((e) => { modsP = null; throw e; });
  }
  return modsP;
}

export function isDenied(e) {
  return !!e && (e.code === 'PERMISSION_DENIED' || /permission[_ ]denied/i.test(String(e.message || e)));
}

/* Resolves with the restored user (or null) once Firebase Auth has loaded
   whatever sign-in this browser remembers. Never rejects. */
export async function authSettled(app) {
  try {
    const { A } = await mods();
    const auth = A.getAuth(app);
    if (auth.authStateReady) { await auth.authStateReady(); return auth.currentUser; }
    return await new Promise((res) => { const off = A.onAuthStateChanged(auth, (u) => { off(); res(u); }); });
  } catch (e) { return null; }
}

/* Quiet anonymous sign-in if nobody is signed in. Never rejects. */
let anonP = null;
export function ensureSignedIn(app) {
  if (!anonP) {
    anonP = (async () => {
      try {
        const u = await authSettled(app);
        if (u) return u;
        const { A } = await mods();
        return (await A.signInAnonymously(A.getAuth(app))).user;
      } catch (e) {
        console.warn('staff-auth: anonymous sign-in unavailable (' + ((e && e.code) || e) + ')');
        anonP = null;
        return null;
      }
    })();
  }
  return anonP;
}

async function isStaff(app, user) {
  if (!user || user.isAnonymous) return false;
  try {
    const { D } = await mods();
    const s = await D.get(D.ref(D.getDatabase(app), 'staff/' + user.uid));
    return s.val() === true;
  } catch (e) { return false; }
}

/* ---- the sign-in card ---- */
let staffP = null;
export function staffSignIn(app, opts) {
  if (staffP) return staffP;
  staffP = new Promise((resolve, reject) => {
    mods().then(({ A }) => {
      const auth = A.getAuth(app);
      const wrap = document.createElement('div');
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(10,18,28,.72);display:flex;align-items:center;justify-content:center;padding:18px;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      wrap.innerHTML =
        '<div style="background:#fff;color:#12263a;max-width:380px;width:100%;border-radius:14px;padding:22px 20px;box-shadow:0 18px 50px rgba(0,0,0,.35)">' +
        '<div style="font-weight:800;font-size:18px;margin-bottom:6px">Staff sign-in</div>' +
        '<p data-r style="margin:0 0 14px;color:#3b4f63"></p>' +
        '<button data-go type="button" style="width:100%;padding:12px 14px;border:0;border-radius:10px;background:#1c69d4;color:#fff;font-weight:700;font-size:15px;cursor:pointer">Sign in with Google</button>' +
        '<p data-msg style="margin:12px 0 0;font-size:13px;color:#3b4f63;word-break:break-all"></p>' +
        '<button data-x type="button" style="margin-top:12px;width:100%;padding:10px;border:1px solid #c9d4df;border-radius:10px;background:#fff;color:#12263a;font-size:14px;cursor:pointer">Cancel</button>' +
        '</div>';
      const q = (s) => wrap.querySelector(s);
      q('[data-r]').textContent = (opts && opts.reason) || 'That needs a staff account. Sign in with the Google account Dan has added to the staff list.';
      const msg = q('[data-msg]');
      const close = () => { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); staffP = null; };
      const check = async (u) => {
        if (await isStaff(app, u)) { close(); resolve(u); return; }
        msg.innerHTML = '';
        msg.appendChild(document.createTextNode('Signed in as ' + (u.email || 'this account') +
          ', but it is not on the staff list yet. To add it, Dan puts this ID under "staff" in the Firebase database with the value true: '));
        const b = document.createElement('b'); b.textContent = u.uid; msg.appendChild(b);
        q('[data-go]').textContent = 'Use a different Google account';
      };
      q('[data-go]').onclick = () => {
        msg.textContent = 'Opening Google...';
        const provider = new A.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        /* called straight from the click so the popup is not blocked */
        A.signInWithPopup(auth, provider).then((r) => check(r.user)).catch((e) => {
          msg.textContent = (e && e.code === 'auth/popup-closed-by-user') ? '' : 'Sign-in did not work (' + ((e && e.code) || e) + ').';
        });
      };
      q('[data-x]').onclick = () => { close(); reject(new Error('PERMISSION_DENIED: staff sign-in cancelled')); };
      document.body.appendChild(wrap);
      if (auth.currentUser && !auth.currentUser.isAnonymous) check(auth.currentUser);
    }).catch((e) => { staffP = null; reject(e); });
  });
  return staffP;
}

/* guard(app, 'staff' | 'signed') -> wrap(fn). A refused write signs in and
   retries once: 'signed' does the quiet anonymous sign-in and never shows
   anything (safe for the unattended wall display); 'staff' shows the staff
   sign-in card. Any other error passes straight through. */
export function guard(app, level) {
  return (fn) => (...args) => Promise.resolve().then(() => fn(...args)).catch(async (e) => {
    if (!isDenied(e)) throw e;
    if (level === 'signed') {
      const u = await ensureSignedIn(app);
      if (!u) throw e;
      return fn(...args);
    }
    await staffSignIn(app);
    return fn(...args);
  });
}
