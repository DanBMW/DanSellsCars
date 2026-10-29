/* Ripples and kinetic headlines for the motion layer (motion.css). Nothing runs with reduced motion. */
(function () {
  var mq = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)'); if (mq && mq.matches) return;
  var SEL = '.mo-rip,.al-go,.al-chip,.fmb-btn,.fmb-opt,.ct-btn,.ct-seg button,.ct-nav a,.ct-nav button';
  document.addEventListener('pointerdown', function (e) { var b = e.target.closest && e.target.closest(SEL); if (!b || b.disabled) return;
    b.classList.add('mo-rip', 'mo-press'); var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2, s = document.createElement('span');
    s.className = 'mo-ink'; s.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
    b.appendChild(s); setTimeout(function () { s.remove(); }, 600); }, { passive: true });
  function kinetic() { document.querySelectorAll('.mo-kinetic:not([data-mo])').forEach(function (h) { h.setAttribute('data-mo', '1'); h.setAttribute('aria-label', h.textContent.trim());
    var i = 0; h.innerHTML = h.textContent.trim().split(/\s+/).map(function (w) { return '<span class="mo-w" aria-hidden="true" style="--i:' + (i++) + '">' + w.replace(/[<&]/g, '') + '</span>'; }).join(' '); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kinetic); else kinetic();
  window.moTick = function (el) { if (!el) return; el.classList.remove('mo-tick'); void el.offsetWidth; el.classList.add('mo-tick'); };
  /* back navigations slide the other way */
  window.addEventListener('pageswap', function (e) { if (e.activation && e.activation.navigationType === 'traverse') document.documentElement.dataset.moDir = 'back'; });
  window.addEventListener('pagereveal', function (e) { var a = window.navigation && navigation.activation; document.documentElement.dataset.moDir = a && a.navigationType === 'traverse' ? 'back' : ''; });
})();
