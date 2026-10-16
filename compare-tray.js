/* Compare ticks and tray for stock.html and new-cars.html. Additive only:
   it never touches a card's own markup beyond appending one button, and
   keeps the shared list in localStorage.dscCompare (same as compare.html).
   Keys: 'u' + listing id (used), 'n' + order number (new). Max 4. */
(function(){
  var MAX = 4, KEY = 'dscCompare', META = 'dscCompareMeta';
  function get(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch(e){ return []; } }
  function put(a){ try { localStorage.setItem(KEY, JSON.stringify(a)); } catch(e){} }
  function meta(){ try { return JSON.parse(localStorage.getItem(META) || '{}') || {}; } catch(e){ return {}; } }
  function keyFor(card){
    if (card.classList.contains('sl-card')) return card.getAttribute('data-id') ? 'u' + card.getAttribute('data-id') : null;
    var q = card.querySelector('[data-quote]');
    return q ? 'n' + q.getAttribute('data-quote') : null;
  }
  var css = document.createElement('style');
  css.textContent =
    '.cmp-tick{display:flex;align-items:center;justify-content:center;gap:8px;width:calc(100% - 24px);margin:10px 12px 12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:transparent;color:inherit;font:inherit;font-size:14px;cursor:pointer}'
   +'.cmp-tick i{width:18px;height:18px;border-radius:5px;border:2px solid currentColor;display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:12px;line-height:1}'
   +'.cmp-tick[aria-pressed="true"]{background:#1c69d4;border-color:#1c69d4;color:#fff}.cmp-tick[aria-pressed="true"] i::after{content:"\\2713"}'
   +'.nc-body .cmp-tick{width:100%;margin:10px 0 0}'
   +'.cmp-tray{position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom));z-index:155;display:none;align-items:center;gap:10px;padding:10px 10px 10px 14px;border-radius:14px;background:#151a22;color:#eef1f5;box-shadow:0 10px 30px rgba(0,0,0,.45);border:1px solid #2a3240;max-width:560px;margin:0 auto;font-size:14px}'
   +'.cmp-tray.on{display:flex}.cmp-tray .cmp-n{flex:1}.cmp-tray .cmp-n b{font-size:16px}'
   +'.cmp-tray a{background:#1c69d4;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600}.cmp-tray button{background:none;border:0;color:#8d97a6;font:inherit;cursor:pointer}'
   +'.cmp-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(140px + env(safe-area-inset-bottom));z-index:156;background:#d23;color:#fff;padding:10px 14px;border-radius:10px;font-size:14px;display:none}'
   +'@media(min-width:900px){.cmp-tray{bottom:20px}.cmp-toast{bottom:90px}}';
  document.head.appendChild(css);
  var tray = document.createElement('div'); tray.className = 'cmp-tray'; tray.setAttribute('role','region'); tray.setAttribute('aria-label','Compare');
  tray.innerHTML = '<span class="cmp-n"></span><button type="button" class="cmp-clear">Clear</button><a href="compare.html">Compare</a>';
  var toast = document.createElement('div'); toast.className = 'cmp-toast'; toast.setAttribute('role','status');
  document.body.appendChild(tray); document.body.appendChild(toast);
  var tt = 0;
  function say(t){ toast.textContent = t; toast.style.display = 'block'; clearTimeout(tt); tt = setTimeout(function(){ toast.style.display = 'none'; }, 2600); }
  function paint(){
    var sel = get();
    tray.classList.toggle('on', sel.length > 0);
    var n = tray.querySelector('.cmp-n'), h = '<b>' + sel.length + '</b> of ' + MAX + ' to compare';
    if (n.innerHTML !== h) n.innerHTML = h;
    tray.querySelector('a').href = 'compare.html?c=' + sel.join(',');
    [].forEach.call(document.querySelectorAll('.cmp-tick'), function(b){
      var on = sel.indexOf(b.getAttribute('data-cmp')) >= 0;
      var a = on ? 'true' : 'false', t = on ? 'Added to compare' : 'Compare';
      if (b.getAttribute('aria-pressed') !== a) b.setAttribute('aria-pressed', a);
      if (b.lastChild.textContent !== t) b.lastChild.textContent = t;
    });
  }
  function decorate(){
    [].forEach.call(document.querySelectorAll('.sl-card, .nc-card'), function(card){
      if (card.querySelector('.cmp-tick')) return;
      var k = keyFor(card); if (!k) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cmp-tick'; b.setAttribute('data-cmp', k);
      b.innerHTML = '<i aria-hidden="true"></i><span>Compare</span>';
      (card.querySelector('.nc-body') || card).appendChild(b);
    });
    paint();
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.cmp-tick');
    if (b){
      e.preventDefault(); e.stopPropagation();
      var k = b.getAttribute('data-cmp'), sel = get(), i = sel.indexOf(k);
      if (i >= 0) sel.splice(i, 1);
      else if (sel.length >= MAX){ say('Compare holds ' + MAX + ' cars. Remove one first.'); return; }
      else {
        sel.push(k);
        var card = b.closest('.sl-card, .nc-card'), h = card && card.querySelector('h2, h3'), im = card && card.querySelector('img');
        var m = meta(); m[k] = { name: h ? h.textContent.trim() : '', img: im ? im.currentSrc || im.src : '', t: k.charAt(0) };
        try { localStorage.setItem(META, JSON.stringify(m)); } catch(err){}
      }
      put(sel); paint(); return;
    }
    if (e.target.closest && e.target.closest('.cmp-clear')){ put([]); paint(); }
  }, true);
  /* Sit just above whatever is fixed at the bottom (the WhatsApp bar on a
     phone, the finance disclaimer bar until it is dismissed), never over it. */
  function lift(){
    var h = 0;
    [].forEach.call(document.querySelectorAll('.ds-sticky, .dsc-bar'), function(el){
      var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.height === 0 || r.top >= innerHeight) return;
      h = Math.max(h, innerHeight - r.top);
    });
    var b = Math.round(h + 12) + 'px';
    if (tray.style.bottom !== b){ tray.style.bottom = b; toast.style.bottom = Math.round(h + 80) + 'px'; }
  }
  setInterval(lift, 500); window.addEventListener('resize', lift); window.addEventListener('scroll', lift, {passive:true});
  window.addEventListener('storage', paint);
  window.addEventListener('pageshow', paint);
  new MutationObserver(function(){ clearTimeout(decorate.t); decorate.t = setTimeout(decorate, 60); })
    .observe(document.body, { childList: true, subtree: true });
  decorate();
})();
