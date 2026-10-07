/* dan-sells.co.uk used car lookup widget. Plain JS, no dependencies.

   <script src="https://dan-sells.co.uk/lookup/widget.js" defer></script>

   Markup it looks for (all optional except the reg input):
     <input data-dsc-reg>                     the registration box
     <button type="button" data-dsc-go>       runs the lookup (Enter and leaving
                                              the box run it too)
     <span data-dsc-field="model">            filled with that field; also price
                                              (as £), mileage, year, colour, fuel,
                                              listing_url (sets href on a link)
                                              and any other plain field in the JSON
     <img data-dsc-image>                     the car's photo
     <span data-dsc-status>                   loading, found, not in stock text
   Elements are matched inside the nearest [data-dsc-scope], else the input's
   form, else the whole page, so two lookups can live on one page.

   Every lookup fires a "dsc:car" CustomEvent on the input (it bubbles):
     e.detail = { reg: "LV73VOB", car: {...} or null, state: "found" | "missing" | "error" }

   Finance is never filled in: a monthly figure may only be shown with the full
   representative example. It is in e.detail.car.finance if you need it.
   Nothing here throws into the host page. */
(function () {
  'use strict';
  try {
    if (window.DSCLookup || !window.fetch || !document.addEventListener) return;

    var BASE = 'https://dan-sells.co.uk/lookup/';
    try {
      var me = document.currentScript && document.currentScript.src;
      if (me && /\/lookup\/widget\.js(\?|#|$)/.test(me)) BASE = me.replace(/widget\.js.*$/, '');
    } catch (e) {}

    var DEBOUNCE = 350, TIMEOUT = 10000;
    var NOT_FILLED = { finance: 1, images: 1, image: 1 };

    function norm(r) { return String(r == null ? '' : r).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
    function plate(r) { return /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(r) ? r.slice(0, 4) + ' ' + r.slice(4) : r; }
    function gbp(n) {
      try { return '\u00a3' + Math.round(Number(n)).toLocaleString('en-GB'); }
      catch (e) { return '\u00a3' + Math.round(Number(n)); }
    }
    function scopeOf(el) {
      return (el.closest && (el.closest('[data-dsc-scope]') || el.closest('form'))) || document;
    }
    function all(scope, sel) {
      try { return Array.prototype.slice.call(scope.querySelectorAll(sel)); } catch (e) { return []; }
    }
    function setText(el, v) {
      var tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') el.value = v;
      else el.textContent = v;
    }
    function display(key, car) {
      if (key === 'price') return car.price_gbp != null ? gbp(car.price_gbp) : (car.price || '');
      if (key === 'mileage') return car.mileage || (car.mileage_miles != null ? Number(car.mileage_miles).toLocaleString('en-GB') + ' miles' : '');
      var v = car[key];
      if (v == null || typeof v === 'object') return '';
      return String(v);
    }

    function status(scope, state, text) {
      all(scope, '[data-dsc-status]').forEach(function (el) {
        el.setAttribute('data-dsc-state', state);
        el.textContent = text;
      });
      if (scope.setAttribute) scope.setAttribute('data-dsc-state', state);
    }

    function fill(scope, car) {
      all(scope, '[data-dsc-field]').forEach(function (el) {
        var key = el.getAttribute('data-dsc-field');
        if (!key || NOT_FILLED[key]) return;
        if (key === 'listing_url') {
          var u = car && car.listing_url;
          if (el.tagName === 'A') {
            if (u) { el.href = u; if (!el.textContent.trim()) el.textContent = 'View the full listing'; el.hidden = false; }
            else { el.removeAttribute('href'); el.hidden = true; }
          } else setText(el, u || '');
          return;
        }
        setText(el, car ? display(key, car) : '');
      });
      all(scope, 'img[data-dsc-image]').forEach(function (img) {
        var pics = car ? [car.image].concat(car.images || []).filter(Boolean) : [];
        img.onerror = null;
        if (!pics.length) { img.removeAttribute('src'); img.hidden = true; return; }
        var i = 0;
        /* Some photo urls in the feed have gone from the CDN: move on to the
           car's next photo, and hide the image if none load. */
        img.onerror = function () {
          i++;
          if (i < pics.length) img.src = pics[i];
          else { img.onerror = null; img.removeAttribute('src'); img.hidden = true; }
        };
        img.alt = car.model || plate(car.reg);
        img.hidden = false;
        img.src = pics[0];
      });
    }

    function emit(input, reg, car, state) {
      try {
        var ev;
        var detail = { reg: reg, car: car, state: state };
        if (typeof window.CustomEvent === 'function') ev = new CustomEvent('dsc:car', { bubbles: true, detail: detail });
        else { ev = document.createEvent('CustomEvent'); ev.initCustomEvent('dsc:car', true, false, detail); }
        input.dispatchEvent(ev);
      } catch (e) {}
    }

    var seq = 0;
    function lookup(input) {
      try {
        var scope = scopeOf(input);
        var reg = norm(input.value);
        if (reg.length < 2) {
          input.removeAttribute('data-dsc-last');
          fill(scope, null);
          status(scope, 'idle', '');
          return Promise.resolve(null);
        }
        if (input.getAttribute('data-dsc-last') === reg) return Promise.resolve(input._dscCar || null);
        input.setAttribute('data-dsc-last', reg);
        var mine = ++seq;
        input._dscSeq = mine;
        status(scope, 'loading', 'Checking ' + plate(reg) + '\u2026');

        var ctrl = window.AbortController ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT);
        return fetch(BASE + 'reg/' + encodeURIComponent(reg) + '.json', ctrl ? { signal: ctrl.signal } : {})
          .then(function (r) {
            if (r.status === 404) return null;
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function (car) {
            clearTimeout(timer);
            if (input._dscSeq !== mine) return car;     /* a newer lookup won */
            input._dscCar = car;
            fill(scope, car);
            if (car) status(scope, 'found', plate(reg) + ': ' + (car.model || 'in stock'));
            else status(scope, 'missing', plate(reg) + ' is not in today\u2019s stock');
            emit(input, reg, car, car ? 'found' : 'missing');
            return car;
          })
          .catch(function () {
            clearTimeout(timer);
            if (input._dscSeq !== mine) return null;
            input.removeAttribute('data-dsc-last');     /* let a retry through */
            input._dscCar = null;
            fill(scope, null);
            status(scope, 'error', 'Stock could not be checked just now. Please try again.');
            emit(input, reg, null, 'error');
            return null;
          });
      } catch (e) {
        return Promise.resolve(null);
      }
    }

    function regInput(el) {
      return el && el.matches && el.matches('[data-dsc-reg]') ? el : null;
    }

    var timers = typeof WeakMap === 'function' ? new WeakMap() : null;
    function later(input) {
      if (!timers) { lookup(input); return; }
      clearTimeout(timers.get(input));
      timers.set(input, setTimeout(function () { lookup(input); }, DEBOUNCE));
    }

    document.addEventListener('keydown', function (e) {
      try {
        var input = regInput(e.target);
        if (!input || e.key !== 'Enter') return;
        e.preventDefault();
        if (timers) clearTimeout(timers.get(input));
        lookup(input);
      } catch (err) {}
    }, true);

    document.addEventListener('focusout', function (e) {
      try { var input = regInput(e.target); if (input) later(input); } catch (err) {}
    }, true);

    document.addEventListener('click', function (e) {
      try {
        var btn = e.target && e.target.closest && e.target.closest('[data-dsc-go]');
        if (!btn) return;
        var sel = btn.getAttribute('data-dsc-go');
        var input = (sel && document.querySelector(sel)) || all(scopeOf(btn), '[data-dsc-reg]')[0];
        if (!input) return;
        e.preventDefault();
        if (timers) clearTimeout(timers.get(input));
        input.removeAttribute('data-dsc-last');       /* a click always re-checks */
        lookup(input);
      } catch (err) {}
    }, true);

    /* For anyone wiring it up by hand: DSCLookup.lookup(inputElement) runs it,
       DSCLookup.fetchReg("lv73 vob") just returns the car (or null). */
    window.DSCLookup = {
      base: BASE,
      normalise: norm,
      lookup: function (input) { return input ? lookup(input) : Promise.resolve(null); },
      fetchReg: function (reg) {
        var r = norm(reg);
        if (!r) return Promise.resolve(null);
        return fetch(BASE + 'reg/' + encodeURIComponent(r) + '.json').then(function (res) {
          if (res.status === 404) return null;
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        });
      }
    };
  } catch (e) { /* never break the host page */ }
})();
