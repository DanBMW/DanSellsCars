/* forecourt-stock.js: Ruxley stock lookup for Forecourt.html.
 * Reads the public lookup/stock.json (built daily) and keeps only cars with
 * source "forecourt". No customer data, no keys. ES5 on purpose. */
(function () {
  var PH = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64"><rect width="96" height="64" rx="8" fill="#e8eef5"/><path d="M18 42l8-12h44l8 12v6H18z" fill="#b8c6d6"/><circle cx="32" cy="48" r="5" fill="#8a9bb0"/><circle cx="64" cy="48" r="5" fill="#8a9bb0"/></svg>');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function key(r) { return String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  var S = { map: {}, list: [], loaded: false, failed: false, generatedAt: '', placeholder: PH, esc: esc };
  S.ready = fetch('/lookup/stock.json?d=' + new Date().toISOString().slice(0, 13), { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      var cars = (d && d.cars) || {};
      Object.keys(cars).forEach(function (k) {
        var c = cars[k];
        if (!c || c.source !== 'forecourt' || (c.status && c.status !== 'in_stock')) return;
        var kk = key(c.reg || k);
        S.map[kk] = { reg: kk, model: c.model || '', colour: c.colour || '', image: c.image || (c.images && c.images[0]) || '' };
        S.list.push(S.map[kk]);
      });
      S.generatedAt = d.generated_at || ''; S.loaded = true;
    })
    .catch(function () { S.failed = true; });
  S.info = function (k) { return S.map[key(k)] || null; };
  /* flag: '' normal, 'gone' loaded from stock but no longer there, 'manual' typed and not in stock */
  S.flag = function (v) {
    if (!S.loaded || !v) return '';
    if (S.info(v.key || v.reg)) return '';
    return v.src === 'stock' ? 'gone' : 'manual';
  };
  S.flagHTML = function (v) {
    var f = S.flag(v);
    if (f === 'gone') return '<span class="badge b-red fc-flag">Sold or gone</span>';
    if (f === 'manual') return '<span class="badge b-grey fc-flag">Not in stock list</span>';
    return '';
  };
  S.thumb = function (k, cls) {
    var c = S.info(k);
    var src = c && c.image ? c.image : PH;
    return '<img class="' + (cls || 'fc-thumb') + '" src="' + esc(src) + '" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'' + PH.replace(/'/g, '%27') + '\'">';
  };
  S.meta = function (k) {
    var c = S.info(k); if (!c) return '';
    return esc([c.model, c.colour].filter(Boolean).join(' \u00b7 '));
  };
  S.model = function (k) { var c = S.info(k); return c ? c.model : ''; };
  window.fcStock = S;
})();
