/* team-backend.js - the Firebase side of the team session, as an ES module.
 * Pages import makeBackend(app) and hand it to TeamSession.start(). The
 * session only ever talks to this small interface, so tests can supply a fake.
 */
import { getDatabase, ref, onValue, set, update, push, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export function makeBackend(app) {
  const db = getDatabase(app), auth = getAuth(app);
  return {
    onAuth(cb) {
      return onAuthStateChanged(auth, u => cb(u && !u.isAnonymous ? { uid: u.uid, email: u.email || '', emailVerified: !!u.emailVerified } : null));
    },
    signIn() {
      const p = new GoogleAuthProvider();
      p.setCustomParameters({ hd: 'hedinautomotive.co.uk', prompt: 'select_account' });
      return signInWithPopup(auth, p);
    },
    signOut() { return signOut(auth); },
    watch(path, cb) { return onValue(ref(db, path), s => cb(s.val()), err => console.warn('team: ' + path + ' ' + (err && err.code))); },
    set(path, v) { return set(ref(db, path), v); },
    update(path, v) { return update(ref(db, path), v); },
    remove(path) { return remove(ref(db, path)); },
    push(path, v) { const r = push(ref(db, path)); return set(r, v).then(() => r.key); },
    key(path) { return push(ref(db, path)).key; }
  };
}
