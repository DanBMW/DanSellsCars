/* staff-gate.js - the shared password / PIN check for the staff pages.
 *
 * Used by: admin.html and links.html ("admin" gate), team-board.html and
 * Forecourt.html (manager PIN, "manager" gate), newcar.html ("newcar" gate).
 *
 * Only a salted PBKDF2-SHA256 hash of each password is stored here - never
 * the password itself. To set a new one, from the repo root run:
 *
 *     node scripts/gate-hash.mjs admin      (or: manager, newcar)
 *
 * It asks for the new password twice (nothing is echoed), rewrites the entry
 * below, and you commit and push staff-gate.js. Nothing else changes.
 *
 * Be clear what this is: a client-side gate on a static site. Anyone can read
 * this file and the page source, so it only stops casual visitors. Short PINs
 * can be brute-forced from the hash in seconds - use a long passphrase where
 * you can. Real protection for the data behind these pages is Firebase Auth
 * plus the database rules (see SECURITY-STAFF.md).
 *
 * Written in ES5 on purpose: team-board.html runs on the office TV browser.
 */
(function () {
  var GATES = {
    /* admin.html + links.html. Matched case-insensitively (typed text is upper-cased). */
    admin:   { norm: 'upper', iter: 150000, salt: '2e41dbf541a69d15b001b3dd896738b0', hash: 'fd52264c4354b59a0d6602b5e7c4f1543c813207191024b4978fff5add4bf0f0' },
    /* Manager PIN on team-board.html and Forecourt.html. Exact match. */
    manager: { norm: 'none',  iter: 150000, salt: 'b4497faf339248519ea60453e8444a31', hash: 'bf5acd99f5e298b6ccb4481b45955a2427a6a6a74372d8364f89ff6c7ef65a1a' },
    /* Nathan's upload PIN on newcar.html. Exact match. */
    newcar:  { norm: 'none',  iter: 150000, salt: 'a0aa2fe697270725bc4b7e83ca9d38fe', hash: '3776e2efcea324b111c5b5e8935ea15b971791f1db6ec7828c8e783b3e546169' }
  };

  function hexToBytes(h) {
    var a = new Uint8Array(h.length / 2);
    for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
    return a;
  }
  function bytesToHex(buf) {
    var a = new Uint8Array(buf), s = '';
    for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16);
    return s;
  }
  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str)), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  /* constant-time-ish compare; the hash is public anyway, this is just tidy */
  function same(a, b) {
    if (a.length !== b.length) return false;
    var d = 0;
    for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  function normalise(g, value) {
    var v = String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
    return g.norm === 'upper' ? v.toUpperCase() : v;
  }

  /* dsGate.check('admin', typed) -> Promise<boolean> */
  function check(name, value) {
    var g = GATES[name];
    var subtle = window.crypto && (window.crypto.subtle || window.crypto.webkitSubtle);
    if (!g || !/^[0-9a-f]{32,}$/.test(g.salt) || !/^[0-9a-f]{64}$/.test(g.hash)) {
      if (window.console) console.error('staff-gate: no password set for "' + name + '" - run node scripts/gate-hash.mjs ' + name);
      return Promise.resolve(false);
    }
    var v = normalise(g, value);
    if (!v || !subtle) return Promise.resolve(false);
    return Promise.resolve(subtle.importKey('raw', utf8(v), { name: 'PBKDF2' }, false, ['deriveBits']))
      .then(function (key) {
        return subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(g.salt), iterations: g.iter }, key, 256);
      })
      .then(function (bits) { return same(bytesToHex(bits), g.hash); })
      ['catch'](function (e) { if (window.console) console.error('staff-gate', e); return false; });
  }

  window.dsGate = { check: check };
})();
