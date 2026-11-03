/* Test stub of firebase-database.js: an in-memory tree in window.__STORE.data.
 * Same call shapes as the real SDK for the functions the pages use. */
const S = () => window.__STORE;
const listeners = [];
let seq = 0;
const parts = (p) => String(p || '').split('/').filter(Boolean);
const getAt = (p) => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), S().data);
function setAt(p, v) {
  const ps = parts(p);
  if (!ps.length) { S().data = v || {}; return; }
  let o = S().data;
  ps.slice(0, -1).forEach(k => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
  const last = ps[ps.length - 1];
  if (v === null || v === undefined) delete o[last]; else o[last] = JSON.parse(JSON.stringify(v));
  if (o && typeof o === 'object' && Object.keys(o).length === 0 && ps.length > 1) { /* empty objects vanish, as in RTDB */ }
}
const snap = (v) => ({ val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))), exists: () => v !== undefined && v !== null, key: null });
function notify() {
  S().log.length; /* keeps the log bounded below */
  listeners.slice().forEach(l => setTimeout(() => { if (listeners.indexOf(l) >= 0) l.cb(snap(getAt(l.path))); }, 0));
}
export function getDatabase(app) { return { app: app }; }
export function ref(db, path) { return { path: path || '' }; }
export function onValue(r, cb, err) {
  const l = { path: r.path, cb: cb };
  listeners.push(l);
  setTimeout(() => { if (listeners.indexOf(l) >= 0) cb(snap(getAt(l.path))); }, 0);
  return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
}
export function set(r, v) {
  setAt(r.path, v); S().log.push(['set', r.path]); notify(); return Promise.resolve();
}
export function update(r, v) {
  Object.keys(v).forEach(k => setAt(r.path + '/' + k, v[k]));
  S().log.push(['update', r.path]); notify(); return Promise.resolve();
}
export function remove(r) { setAt(r.path, null); S().log.push(['remove', r.path]); notify(); return Promise.resolve(); }
export function push(r, v) {
  const key = '-k' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);
  const child = { path: r.path + '/' + key, key: key };
  if (v !== undefined) { setAt(child.path, v); S().log.push(['push', child.path]); notify(); return Promise.resolve(child); }
  return child;
}
export function get(r) { return Promise.resolve(snap(getAt(r.path))); }
export function serverTimestamp() { return Date.now(); }
