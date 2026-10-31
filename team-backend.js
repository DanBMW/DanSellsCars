/* team-backend.js - the Firebase side of the team session, as an ES module.
 * Pages import makeBackend(app) and hand it to TeamSession.start(). The
 * session only ever talks to this small interface, so tests can supply a fake.
 */
import { getDatabase, ref, onValue, set, update, push, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, onIdTokenChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, reload } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export function makeBackend(app) {
  const db = getDatabase(app), auth = getAuth(app);
  return {
    onAuth(cb) {
      /* token changes too, so a verified email shows up without a reload */
      return onIdTokenChanged(auth, u => cb(u && !u.isAnonymous ? { uid: u.uid, email: u.email || '', emailVerified: !!u.emailVerified } : null));
    },
    signOut() { return signOut(auth); },
    /* a personal PIN: a six digit password on the work address. Firebase's own
       email verification and password reset do the rest, so a PIN can only be
       set by someone who can open their work email. */
    signUpPin(email, pin) {
      return createUserWithEmailAndPassword(auth, email, pin).then(c => sendEmailVerification(c.user).then(() => c.user));
    },
    signInPin(email, pin) { return signInWithEmailAndPassword(auth, email, pin); },
    resetPin(email) { return sendPasswordResetEmail(auth, email); },
    resendVerification() { return auth.currentUser ? sendEmailVerification(auth.currentUser) : Promise.reject(new Error('not signed in')); },
    reload() { return auth.currentUser ? reload(auth.currentUser).then(() => auth.currentUser.getIdToken(true)) : Promise.resolve(); },
    watch(path, cb) { return onValue(ref(db, path), s => cb(s.val()), err => console.warn('team: ' + path + ' ' + (err && err.code))); },
    set(path, v) { return set(ref(db, path), v); },
    update(path, v) { return update(ref(db, path), v); },
    remove(path) { return remove(ref(db, path)); },
    push(path, v) { const r = push(ref(db, path)); return set(r, v).then(() => r.key); },
    key(path) { return push(ref(db, path)).key; }
  };
}
