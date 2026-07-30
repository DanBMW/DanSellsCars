/* Forecourt Empire — cloud save.

   Shape of the thing:

   * localStorage stays the source of truth. Every FE.save() writes locally and
     synchronously exactly as before; this module hangs off FE.afterSave and
     mirrors the envelope up in the background. If Firebase is down, blocked,
     unconfigured or the player is on the Tube, the game does not notice.
   * Sign-in is ANONYMOUS by default. A player gets a durable UID on first run
     with no login wall — the save starts backing itself up immediately and
     nobody is asked for anything. Linking a Google account later (Settings →
     Account) keeps that same UID and makes the career reachable from another
     device.
   * A remote save NEVER silently replaces a local one. When the cloud copy is
     further along we ask; ties go to the device in front of the player.

   The Firebase SDK is loaded lazily by dynamic import, so a player who is
   offline or has the CDN blocked pays nothing for it. `driver` is the only
   thing that talks to Firebase, which is also what makes this testable —
   FEcloud._setDriver() swaps in a fake.

   Console setup this depends on (one-off, in the Firebase console for
   forecourt-1b6bc):
     1. Authentication → Sign-in method → enable Anonymous
     2. Authentication → Sign-in method → enable Google
     3. Authentication → Settings → Authorized domains → add dan-sells.co.uk
     4. deploy database.rules.json (the `empire` block)
   Until those are done every call here fails quietly and the game runs local
   only, which is exactly the behaviour we want anyway. */
(function () {
  'use strict';

  var C = {};
  window.FEcloud = C;

  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var CONFIG = {
    apiKey: 'AIzaSyB3OT3aCyLYlQ3STi94HrgSHUZzf6v8T3E',
    authDomain: 'forecourt-1b6bc.firebaseapp.com',
    databaseURL: 'https://forecourt-1b6bc-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'forecourt-1b6bc',
    storageBucket: 'forecourt-1b6bc.firebasestorage.app',
    messagingSenderId: '1073459223252',
    appId: '1:1073459223252:web:d65abed953fc641fc7b941'
  };
  var OFF_KEY = 'feCloudOff';
  var PUSH_MS = 4000;          // debounce — a busy showroom fires saves constantly
  var MAX_BYTES = 512 * 1024;  // refuse to push something absurd rather than error forever
  var CONNECT_MS = 12000;      // stop waiting on a blocked CDN and say so

  /* ---------- status ---------- */
  var st = {
    state: 'idle',   // idle | off | connecting | on | error
    uid: null,
    linked: false,   // a real credential is attached, not just anonymous
    email: '',
    lastPush: 0,
    lastPull: 0,
    err: ''
  };
  var subs = [];
  C.status = function () {
    return { state: st.state, uid: st.uid, linked: st.linked, email: st.email,
             lastPush: st.lastPush, lastPull: st.lastPull, err: st.err };
  };
  C.on = function (fn) { if (typeof fn === 'function') subs.push(fn); };
  function emit() {
    var s = C.status();
    subs.forEach(function (f) { try { f(s); } catch (e) {} });
  }
  function set(state, err) {
    st.state = state;
    st.err = err || '';
    emit();
  }

  /* ---------- opt-out ---------- */
  C.enabled = function () {
    try { return localStorage.getItem(OFF_KEY) !== '1'; } catch (e) { return true; }
  };
  C.setEnabled = function (on) {
    try { on ? localStorage.removeItem(OFF_KEY) : localStorage.setItem(OFF_KEY, '1'); } catch (e) {}
    if (!on) {
      cancelPush();
      driver = null;
      FE.afterSave = null;          // leave no hook behind on a local-only game
      st.uid = null; st.linked = false; st.email = '';
      set('off');
    } else {
      st.state = 'idle';
      C.init();
    }
  };

  /* ---------- the Firebase driver ----------
     Every method takes a node-style callback so nothing above this line has to
     care that it's promises underneath. */
  var driver = null;
  var loading = null;
  var fb = null;   // { app, auth, db, mod:{...} }

  function loadSDK() {
    if (loading) return loading;
    loading = Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-database.js')
    ]).then(function (m) {
      var A = m[0], U = m[1], D = m[2];
      var app = A.initializeApp(CONFIG, 'forecourt-empire');
      return {
        app: app,
        auth: U.getAuth(app),
        db: D.getDatabase(app),
        U: U, D: D
      };
    });
    return loading;
  }

  function firebaseDriver() {
    return {
      signInAnon: function (cb) {
        loadSDK().then(function (f) {
          fb = f;
          var cur = f.auth.currentUser;
          if (cur) return cb(null, describeUser(cur));
          return f.U.signInAnonymously(f.auth).then(function (r) { cb(null, describeUser(r.user)); });
        }).catch(function (e) { cb(e); });
      },
      linkGoogle: function (cb) {
        loadSDK().then(function (f) {
          fb = f;
          var provider = new f.U.GoogleAuthProvider();
          var user = f.auth.currentUser;
          if (!user) return cb(new Error('not signed in'));
          if (!user.isAnonymous) return cb(null, describeUser(user));
          return f.U.linkWithPopup(user, provider).then(function (r) {
            cb(null, describeUser(r.user));
          }).catch(function (e) {
            /* This Google account already carries a career of its own. We can't
               merge two histories, so sign into that account and let the caller
               put the choice in front of the player. */
            if (e && (e.code === 'auth/credential-already-in-use' ||
                      e.code === 'auth/email-already-in-use')) {
              var cred = f.U.GoogleAuthProvider.credentialFromError(e);
              if (!cred) return cb(e);
              return f.U.signInWithCredential(f.auth, cred).then(function (r) {
                cb(null, describeUser(r.user), true);   // true = switched, not linked
              }).catch(function (e2) { cb(e2); });
            }
            cb(e);
          });
        }).catch(function (e) { cb(e); });
      },
      signOut: function (cb) {
        loadSDK().then(function (f) { return f.U.signOut(f.auth); })
          .then(function () { cb(null); }, function (e) { cb(e); });
      },
      get: function (uid, cb) {
        loadSDK().then(function (f) {
          return f.D.get(f.D.ref(f.db, 'empire/saves/' + uid));
        }).then(function (snap) {
          cb(null, snap && snap.exists() ? snap.val() : null);
        }, function (e) { cb(e); });
      },
      set: function (uid, env, cb) {
        loadSDK().then(function (f) {
          var p = f.D.set(f.D.ref(f.db, 'empire/saves/' + uid), env);
          var name = env && env.profile && env.profile.name;
          if (name) {
            f.D.set(f.D.ref(f.db, 'empire/profiles/' + uid), {
              name: name, created: env.profile.created || 0, updated: Date.now()
            }).catch(function () {});
          }
          return p;
        }).then(function () { cb(null); }, function (e) { cb(e); });
      }
    };
  }
  function describeUser(u) {
    if (!u) return null;
    var email = '';
    if (u.email) email = u.email;
    else if (u.providerData && u.providerData[0]) email = u.providerData[0].email || '';
    return { uid: u.uid, linked: !u.isAnonymous, email: email };
  }
  /* Swap the backend. Tests use this; it resets the connection state so a
     half-finished attempt against the real SDK can't leak into the next one. */
  C._setDriver = function (d) {
    cancelPush();
    driver = d;
    st.uid = null; st.linked = false; st.email = ''; st.lastPush = 0; st.lastPull = 0;
    FE.afterSave = null;
    set('idle');
  };

  /* ---------- deciding what to do with two saves ----------
     Pure and exported so it can be tested without a browser or a network. */
  C.decide = function (local, remote) {
    var L = FE.describeEnvelope(local), R = FE.describeEnvelope(remote);
    if (!R) return { action: 'push' };                       // nothing up there yet
    if (!L) return { action: 'restore', remote: R };         // new device, career in the cloud
    if (R.week > L.week) return { action: 'ask', local: L, remote: R };
    // same week on both: only worth asking if the cloud copy is clearly later
    if (R.week === L.week && R.savedAt > L.savedAt + 60000) return { action: 'ask', local: L, remote: R };
    return { action: 'push' };                               // this device is level or ahead
  };

  /* ---------- connect ---------- */
  C.init = function () {
    if (!C.enabled()) { set('off'); return; }
    if (st.state === 'connecting' || st.state === 'on') return;
    set('connecting');
    if (!driver) driver = firebaseDriver();
    /* A blocked or very slow CDN can leave an import() pending indefinitely.
       Give up out loud rather than spinning forever behind a "connecting" dot. */
    var settled = false;
    var giveUp = setTimeout(function () {
      if (settled) return;
      settled = true;
      set('error', navigator.onLine ? 'Could not reach the cloud — backing up locally only.' : 'Offline — backing up locally only.');
    }, CONNECT_MS);
    driver.signInAnon(function (err, user) {
      if (settled) return;
      settled = true;
      clearTimeout(giveUp);
      if (err || !user) { set('error', friendly(err)); return; }
      st.uid = user.uid; st.linked = user.linked; st.email = user.email || '';
      set('on');
      FE.afterSave = schedulePush;
      syncOnce();
    });
  };

  /* Compare what's here with what's up there, once, at connect time. */
  function syncOnce() {
    if (!st.uid) return;
    driver.get(st.uid, function (err, remote) {
      if (err) { set('error', friendly(err)); return; }
      st.lastPull = Date.now();
      var d = C.decide(FE.rawEnvelope(), remote);
      if (d.action === 'push') { held = false; pushNow(); return; }
      /* An unanswered conflict must freeze uploads. Otherwise the player closes
         the dialog, carries on, and the next autosave quietly overwrites the
         very career we just asked them about. */
      held = true;
      d.remoteEnvelope = remote;
      if (typeof C.onsync === 'function') { try { C.onsync(d); } catch (e) {} }
    });
  }
  C.resync = syncOnce;

  /* ---------- pushing ---------- */
  var timer = null, queued = null, held = false;
  function cancelPush() { if (timer) { clearTimeout(timer); timer = null; } queued = null; }
  /* Uploads stay frozen until the player has resolved a two-save conflict. */
  C.held = function () { return held; };
  C.release = function () { held = false; };
  function schedulePush(env) {
    if (st.state !== 'on' || !st.uid || held) return;
    queued = env || (FE.envelope && FE.envelope());
    if (timer) return;
    timer = setTimeout(function () { timer = null; pushNow(); }, PUSH_MS);
  }
  function pushNow() {
    if (st.state !== 'on' || !st.uid || held) return;
    var env = queued || (FE.envelope && FE.envelope());
    queued = null;
    if (!env || !env.game) return;
    var size = 0;
    try { size = JSON.stringify(env).length; } catch (e) { return; }
    if (size > MAX_BYTES) { set('error', 'This career is too big to back up.'); return; }
    driver.set(st.uid, env, function (err) {
      if (err) { set('error', friendly(err)); return; }
      st.lastPush = Date.now();
      if (st.state !== 'on') set('on'); else emit();
    });
  }
  C.push = schedulePush;
  C.pushNow = function () { cancelPush(); pushNow(); };

  /* Flush before the tab goes away, so closing mid-week doesn't lose the last
     few actions from the cloud copy. */
  window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && timer) C.pushNow();
  });
  window.addEventListener('pagehide', function () { if (timer) C.pushNow(); });

  /* ---------- pulling ---------- */
  C.pull = function (cb) {
    cb = cb || function () {};
    if (st.state !== 'on' || !st.uid) return cb(new Error('not connected'));
    driver.get(st.uid, function (err, remote) {
      if (err) return cb(err);
      st.lastPull = Date.now();
      cb(null, remote);
    });
  };

  /* ---------- linking a real account ---------- */
  C.linkGoogle = function (cb) {
    cb = cb || function () {};
    if (st.state !== 'on') return cb(new Error('not connected'));
    driver.linkGoogle(function (err, user, switched) {
      if (err || !user) return cb(err || new Error('sign-in failed'), null);
      st.uid = user.uid; st.linked = user.linked; st.email = user.email || '';
      emit();
      if (switched) {
        /* We are now on a different account with its own save — hand the caller
           both so the player picks. Nothing is overwritten until they do. */
        driver.get(st.uid, function (e2, remote) {
          cb(null, { switched: true, remote: remote || null, local: FE.rawEnvelope() });
        });
        return;
      }
      pushNow();                       // this career now belongs to the linked account
      cb(null, { switched: false });
    });
  };
  C.signOut = function (cb) {
    cb = cb || function () {};
    if (!driver) return cb(null);
    cancelPush();
    driver.signOut(function (err) {
      st.uid = null; st.linked = false; st.email = '';
      FE.afterSave = null;
      set('idle', err ? friendly(err) : '');
      cb(err || null);
    });
  };

  /* ---------- setup check ----------
     Cloud saves depend on console steps nobody can see from inside the game,
     so this walks them in order and names the one that is failing. A read of
     the player's own save path is the honest test of the rules: it needs the
     exact permission a real sync needs, and it cannot damage anything.

     Reports back through cb(steps) where each step is
     { name, ok, detail, fix }. */
  C.diagnose = function (cb) {
    cb = cb || function () {};
    var steps = [];
    function done() { cb(steps); }
    function step(name, ok, detail, fix) { steps.push({ name: name, ok: ok, detail: detail || '', fix: fix || '' }); }

    if (!C.enabled()) {
      step('Cloud save switched on', false, 'You have turned it off on this device.', 'Turn it back on above.');
      return done();
    }
    var d = driver || firebaseDriver();
    driver = d;
    d.signInAnon(function (err, user) {
      if (err || !user) {
        var code = (err && err.code) || '';
        if (/operation-not-allowed|configuration-not-found|admin-restricted/.test(code)) {
          step('Reach Google’s servers', true);
          step('Sign in anonymously', false, 'The project is refusing anonymous sign-in.',
               'Firebase console → Authentication → Sign-in method → enable Anonymous.');
        } else {
          step('Reach Google’s servers', false, friendly(err),
               navigator.onLine ? 'Something is blocking the connection — a VPN, ad blocker or corporate network.' : 'You are offline.');
        }
        return done();
      }
      step('Reach Google’s servers', true);
      step('Sign in anonymously', true, 'Signed in as ' + (user.linked ? (user.email || 'a Google account') : 'a guest') + '.');
      st.uid = user.uid; st.linked = user.linked; st.email = user.email || '';

      d.get(user.uid, function (e2, remote) {
        if (e2) {
          var msg = ((e2 && (e2.code || e2.message)) || '') + '';
          if (/permission|PERMISSION_DENIED/i.test(msg)) {
            step('Database is letting you in', false, 'The database refused the read.',
                 'The security rules have not been deployed. In the Firebase console → Realtime Database → Rules, paste the contents of database.rules.json (it needs the "empire" block) and publish.');
          } else {
            step('Database is letting you in', false, friendly(e2), 'Check the database URL and that the database exists.');
          }
          return done();
        }
        step('Database is letting you in', true, remote ? 'Found a career backed up here.' : 'Connected — nothing backed up yet.');
        if (!FE.getState || !FE.getState()) {
          step('Back up this career', false, 'No career loaded to back up.', 'Start or continue a career, then check again.');
          return done();
        }
        set('on');
        FE.afterSave = schedulePush;
        held = false;
        var env = FE.envelope();
        d.set(user.uid, env, function (e3) {
          if (e3) {
            step('Back up this career', false, friendly(e3), 'The rules allow reading but not writing — re-check the "empire/saves" block.');
            return done();
          }
          st.lastPush = Date.now();
          step('Back up this career', true, 'Week ' + env.game.week + ' is now saved to your account.');
          emit();
          done();
        });
      });
    });
  };

  function friendly(err) {
    var code = (err && err.code) || '';
    if (/popup-closed|cancelled-popup|popup-blocked/.test(code)) return 'Sign-in window was closed.';
    if (/operation-not-allowed|configuration-not-found/.test(code)) return 'Cloud saves are not switched on for this project yet.';
    if (/network|unavailable|failed-to-get-document/.test(code)) return 'No connection — backing up locally only.';
    if (/permission|PERMISSION_DENIED/i.test(code + ' ' + (err && err.message))) return 'The database turned that away — check the rules are deployed.';
    if (!navigator.onLine) return 'Offline — backing up locally only.';
    return (err && err.message) ? String(err.message).slice(0, 120) : 'Could not reach the cloud.';
  }
})();
