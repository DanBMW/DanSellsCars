/* Test stub of firebase-auth.js: the signed in account is window.__STORE.user.
 * signInWithPopup signs in as window.__STORE.popupUser (what the Google window would return). */
const listeners = [];
let current = () => (window.__STORE.user || null);
export function getAuth(app) { return { get currentUser() { return current(); } }; }
export function onAuthStateChanged(auth, cb) {
  listeners.push(cb);
  setTimeout(() => cb(current()), 0);
  return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
}
function emit() { listeners.slice().forEach(cb => setTimeout(() => cb(current()), 0)); }
export class GoogleAuthProvider { setCustomParameters(p) { this.params = p; } }
export function signInWithPopup(auth, provider) {
  const u = window.__STORE.popupUser;
  if (!u) return Promise.reject({ code: 'auth/popup-closed-by-user' });
  window.__STORE.user = u; window.__STORE.log.push(['signin', u.uid]); emit();
  return Promise.resolve({ user: u });
}
export function signInAnonymously(auth) {
  window.__STORE.user = { uid: 'anon-' + Math.random().toString(36).slice(2, 6), isAnonymous: true, email: null, emailVerified: false };
  emit(); return Promise.resolve({ user: window.__STORE.user });
}
export function signOut(auth) { window.__STORE.user = null; window.__STORE.log.push(['signout']); emit(); return Promise.resolve(); }
