/* Test stub of firebase-auth.js. The signed in account is window.__STORE.user.
 * Google: signInWithPopup signs in as window.__STORE.popupUser.
 * PIN accounts: window.__STORE.accounts[email] = { pin, uid, verified }. Verification
 * is what the test does when the person opens the email (accounts[email].verified = true). */
const listeners = [];
const S = () => window.__STORE;
function userView() {
  const u = S().user;
  if (!u) return null;
  const acc = u.email && S().accounts ? S().accounts[u.email.toLowerCase()] : null;
  return Object.assign({}, u, {
    emailVerified: acc ? acc.verified === true : !!u.emailVerified,
    /* a forced refresh is what makes the SDK report a change, as it does for a verified email */
    getIdToken: (force) => { if (force) emit(); return Promise.resolve('token-' + u.uid); }
  });
}
function emit() { listeners.slice().forEach(cb => setTimeout(() => cb(userView()), 0)); }
function sub(auth, cb) {
  listeners.push(cb);
  setTimeout(() => cb(userView()), 0);
  return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
}
export function getAuth(app) { return { get currentUser() { return userView(); } }; }
export const onAuthStateChanged = sub;
export const onIdTokenChanged = sub;
export class GoogleAuthProvider { setCustomParameters(p) { this.params = p; } }
export function signInWithPopup(auth, provider) {
  const u = S().popupUser;
  if (!u) return Promise.reject({ code: 'auth/popup-closed-by-user' });
  S().user = u; S().log.push(['signin', u.uid]); emit();
  return Promise.resolve({ user: userView() });
}
export function signInAnonymously(auth) {
  S().user = { uid: 'anon-' + Math.random().toString(36).slice(2, 6), isAnonymous: true, email: null, emailVerified: false };
  emit(); return Promise.resolve({ user: userView() });
}
export function createUserWithEmailAndPassword(auth, email, pw) {
  const e = String(email).toLowerCase();
  S().accounts = S().accounts || {};
  if (S().accounts[e]) return Promise.reject({ code: 'auth/email-already-in-use' });
  if (String(pw).length < 6) return Promise.reject({ code: 'auth/weak-password' });
  S().accounts[e] = { pin: String(pw), uid: 'pw-' + Math.random().toString(36).slice(2, 8), verified: false };
  S().user = { uid: S().accounts[e].uid, email: e, isAnonymous: false };
  S().log.push(['create', e]); emit();
  return Promise.resolve({ user: userView() });
}
export function signInWithEmailAndPassword(auth, email, pw) {
  const e = String(email).toLowerCase();
  const acc = (S().accounts || {})[e];
  if (!acc || acc.pin !== String(pw)) return Promise.reject({ code: 'auth/invalid-credential' });
  S().user = { uid: acc.uid, email: e, isAnonymous: false };
  S().log.push(['signin-pin', e]); emit();
  return Promise.resolve({ user: userView() });
}
export function sendEmailVerification(user) { S().log.push(['verify-email', user && user.email]); return Promise.resolve(); }
export function sendPasswordResetEmail(auth, email) { S().log.push(['reset-email', String(email).toLowerCase()]); return Promise.resolve(); }
export function reload(user) { return Promise.resolve(); }
export function signOut(auth) { S().user = null; S().log.push(['signout']); emit(); return Promise.resolve(); }
