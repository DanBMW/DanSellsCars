/* team-backend.js - the Firebase side of the team session, as an ES module.
 * Pages import makeBackend(app) and hand it to TeamSession.start(). The
 * session only ever talks to this small interface, so tests can supply a fake.
 */
import { getDatabase, ref, onValue, set, update, push, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, onIdTokenChanged, signInWithPopup, GoogleAuthProvider, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, reload } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export function makeBackend(app) {
  const db = getDatabase(app), auth = getAuth(app);
  /* the link in the email brings them back to the team home, signed in; if this
     domain is not on Firebase's authorised list it falls back to the plain email */
  const fbVerify = u => sendEmailVerification(u, { url: location.origin + '/team.html?verified=1' })
    .catch(e => (e && /continue-uri|unauthorized|invalid-continue/.test(e.code || '')) ? sendEmailVerification(u) : Promise.reject(e));
  /* Firebase's own email comes from noreply@forecourt-1b6bc.firebaseapp.com, which
     work mail (Outlook) can quarantine without telling anyone. So every send also
     leaves a request at authHelp/verifyReq/<uid>: the lockup-emails run
     (scripts/auth-help.js) emails a second link from our own mailer if the person
     is still not verified a couple of minutes later. Firebase errors are kept on
     the request too, so a failed send is never silent. */
  const askHelp = (u, err) => set(ref(db, 'authHelp/verifyReq/' + u.uid), Object.assign({ email: String(u.email || '').toLowerCase(), ts: serverTimestamp() }, err ? { clientErr: String(err.code || err.message || err).slice(0, 190) } : {}))
    .then(() => true, e => { console.warn('team: verify request', e && e.code); return false; });
  /* fails only when neither Firebase nor our own mailer could take the request */
  const verify = u => fbVerify(u).then(() => askHelp(u), e => askHelp(u, e).then(ok => {
    console.warn('team: firebase verify email', e && e.code);
    if (!ok) return Promise.reject(e);
  }));
  return {
    onAuth(cb) {
      /* token changes too, so a verified email shows up without a reload */
      return onIdTokenChanged(auth, u => cb(u && !u.isAnonymous ? { uid: u.uid, email: u.email || '', emailVerified: !!u.emailVerified } : null));
    },
    signIn() {
      const p = new GoogleAuthProvider();
      p.setCustomParameters({ hd: 'hedinautomotive.co.uk', prompt: 'select_account' });
      return signInWithPopup(auth, p);
    },
    signOut() { return signOut(auth); },
    /* a personal PIN: a six digit password on the work address. Firebase's own
       email verification and password reset do the rest, so a PIN can only be
       set by someone who can open their work email. */
    signUpPin(email, pin) {
      return createUserWithEmailAndPassword(auth, email, pin).then(c => verify(c.user).then(() => c.user));
    },
    signInPin(email, pin) { return signInWithEmailAndPassword(auth, email, pin); },
    resetPin(email) { return sendPasswordResetEmail(auth, email); },
    resendVerification() { return auth.currentUser ? verify(auth.currentUser) : Promise.reject(new Error('not signed in')); },
    reload() { return auth.currentUser ? reload(auth.currentUser).then(() => auth.currentUser.getIdToken(true)) : Promise.resolve(); },
    watch(path, cb) { return onValue(ref(db, path), s => cb(s.val()), err => console.warn('team: ' + path + ' ' + (err && err.code))); },
    set(path, v) { return set(ref(db, path), v); },
    update(path, v) { return update(ref(db, path), v); },
    remove(path) { return remove(ref(db, path)); },
    push(path, v) { const r = push(ref(db, path)); return set(r, v).then(() => r.key); },
    key(path) { return push(ref(db, path)).key; },
    now() { return serverTimestamp(); }
  };
}
