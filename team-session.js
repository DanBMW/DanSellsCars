/* team-session.js - the one team session every system asks: who is signed in,
 * which person, and whether they may manage. Classic script, so the TV board
 * and the plain pages can use it without a module.
 *
 *   TeamSession.start(backend)     once, from a page's module (idempotent)
 *   TeamSession.ready()            Promise of the state once it is known
 *   TeamSession.canManage()        Promise<boolean>
 *   TeamSession.onChange(fn)       fn(state) on every change
 *   TeamSession.signIn() / signOut(), signUpPin / signInPin / resetPin / resendVerification
 *   TeamSession.paths()            { RL, RS } roots, lockup and shifts (test copies follow testMode)
 *   TeamSession.config()           the lockup config as last read (team and managers lists)
 *
 * The first sign in links the account to its person (shifts/links/<uid>), by the
 * same email match the rules check. After that the saved link is used.
 */
(function (root) {
  'use strict';
  var TI = root.TeamIdentity;
  var B = null, started = false, unsub = [], user = null, authKnown = false, testMode = true;
  var RL = 'lockup', RS = 'shifts', rootsKey = '';
  var D = { lcfg: null }, loaded = {}, listeners = [], waiters = [], linkWritten = false, current = null;

  /* the roster (people, managers) is always the live one: test mode changes the rota data only */
  function fresh() { D.link = null; D.admin = false; D.mgrs = {}; loaded.link = loaded.admin = loaded.mgrs = false; linkWritten = false; }

  function view() {
    return TI.resolve({
      user: user, team: (D.lcfg || {}).team, managers: (D.lcfg || {}).managers,
      link: D.link, staffAdmin: D.admin, shiftsManagers: D.mgrs
    });
  }
  function settled() {
    if (!authKnown) return false;
    if (!user || !TI.emailOk(user)) return true;
    return !!(loaded.cfg && loaded.link && loaded.admin && loaded.mgrs);
  }
  function recompute() {
    current = view();
    if (settled() && current.linkNeeded && !linkWritten && B) {
      linkWritten = true;
      B.set(RS + '/links/' + user.uid, current.personId).catch(function (e) { console.warn('team: link', e && e.code); linkWritten = false; });
    }
    if (settled()) {
      waiters.splice(0).forEach(function (w) { clearTimeout(w.t); w.res(current); });
    }
    listeners.forEach(function (fn) { try { fn(current); } catch (e) { console.error(e); } });
  }
  function on(path, cb) { unsub.push(B.watch(path, function (v) { cb(v); recompute(); })); }
  function subscribeRoots() {
    unsub.forEach(function (u) { if (typeof u === 'function') u(); });
    unsub = [];
    fresh();
    if (user && TI.emailOk(user)) {
      on(RS + '/links/' + user.uid, function (v) { D.link = v || null; loaded.link = true; });
      on('staff/' + user.uid, function (v) { D.admin = v === true; loaded.admin = true; });
      on(RS + '/managers', function (v) { D.mgrs = v || {}; loaded.mgrs = true; });
    } else {
      loaded.link = loaded.admin = loaded.mgrs = true;
    }
    recompute();
  }
  function setRoots(t) {
    testMode = t;
    var nRL = t ? 'lockupTest' : 'lockup', nRS = t ? 'shiftsTest' : 'shifts';
    if (nRL + nRS === rootsKey) return;
    RL = nRL; RS = nRS; rootsKey = nRL + nRS;
    subscribeRoots();
  }

  function start(backend) {
    if (started) return;
    started = true; B = backend;
    B.watch('lockup/config/testMode', function (v) { setRoots(v !== false); });
    B.watch('lockup/config', function (v) { D.lcfg = v || {}; loaded.cfg = true; recompute(); });
    setRoots(true);
    B.onAuth(function (u) {
      user = u; authKnown = true;
      subscribeRoots();
    });
  }

  function ready(ms) {
    if (!started) return Promise.resolve({ status: 'signedout', canManage: false });
    if (current && settled()) return Promise.resolve(current);
    return new Promise(function (res) {
      var w = { res: res, t: setTimeout(function () {
        waiters = waiters.filter(function (x) { return x !== w; });
        res(current || { status: 'loading', canManage: false });
      }, ms || 8000) };
      waiters.push(w);
    });
  }

  root.TeamSession = {
    start: start,
    ready: ready,
    state: function () { return current; },
    canManage: function () { return ready().then(function (s) { return !!s.canManage; }); },
    onChange: function (fn) { listeners.push(fn); if (current) fn(current); },
    signIn: function () { return B ? B.signIn() : Promise.reject(new Error('not started')); },
    signOut: function () { return B ? B.signOut() : Promise.resolve(); },
    signUpPin: function (e, p) { return B.signUpPin(e, p); },
    signInPin: function (e, p) { return B.signInPin(e, p); },
    resetPin: function (e) { return B.resetPin(e); },
    resendVerification: function () { return B.resendVerification(); },
    reloadUser: function () { return B.reload(); },
    backend: function () { return B; },
    paths: function () { return { RL: RL, RS: RS, testMode: testMode }; },
    config: function () { return D.lcfg || {}; },
    email: function () { return user ? user.email : ''; },
    _settled: settled
  };
})(this);
