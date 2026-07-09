/* Guard for autoplaying background videos.
   When the visitor prefers reduced motion, has data-saver on, or is on a
   slow (2g/3g) connection, abort the video download, show the poster and
   offer tap-to-play instead. On normal connections this does nothing. */
(function () {
  function lite() {
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var conn = navigator.connection || {};
    var slow = !!conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '') || conn.effectiveType === '3g';
    if (!reduce && !slow) return;

    Array.prototype.forEach.call(document.querySelectorAll('video[autoplay]'), function (v) {
      var sources = Array.prototype.slice.call(v.querySelectorAll('source'));
      sources.forEach(function (s) {
        s.dataset.src = s.getAttribute('src');
        s.removeAttribute('src');
      });
      if (v.getAttribute('src')) {
        v.dataset.src = v.getAttribute('src');
        v.removeAttribute('src');
      }
      v.removeAttribute('autoplay');
      v.load(); /* aborts the in-flight download; the poster stays visible */

      var wrap = v.parentElement;
      if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Play video');
      btn.innerHTML = '&#9654;';
      btn.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'width:64px;height:64px;border-radius:50%;border:0;background:rgba(0,0,0,.55);' +
        'color:#fff;font-size:24px;line-height:1;cursor:pointer;z-index:40;' +
        'display:flex;align-items:center;justify-content:center;padding:0 0 0 5px;';
      btn.addEventListener('click', function () {
        sources.forEach(function (s) { s.setAttribute('src', s.dataset.src); });
        if (v.dataset.src) v.setAttribute('src', v.dataset.src);
        v.load();
        v.play();
        btn.remove();
      });
      wrap.appendChild(btn);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lite);
  } else {
    lite();
  }
})();
