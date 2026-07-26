/* Site-wide "confirm understanding" acknowledgement.
   Shows once per visitor (stored in localStorage) across the whole site. */
(function () {
  try { if (localStorage.getItem('dsc_ack') === '1') return; } catch (e) {}

  var css = ''
    + '.dsc-overlay{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;'
    + 'padding:20px;background:rgba(6,12,22,.72);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);}'
    + '.dsc-box{background:#fff;border-radius:20px;max-width:440px;width:100%;padding:30px 26px 26px;'
    + 'box-shadow:0 40px 90px -20px rgba(0,0,0,.55);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;'
    + 'text-align:center;animation:dscPop .28s cubic-bezier(.2,.9,.3,1.1);}'
    + '@keyframes dscPop{from{opacity:0;transform:translateY(14px) scale(.97);}to{opacity:1;transform:none;}}'
    + '.dsc-badge{width:48px;height:48px;border-radius:14px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;'
    + 'background:rgba(21,89,207,.1);color:#1559cf;}'
    + '.dsc-box h2{font-size:1.15rem;font-weight:800;color:#141a22;margin:0 0 10px;line-height:1.3;}'
    + '.dsc-box p{font-size:.9rem;line-height:1.65;color:#3c4a5e;margin:0 0 20px;}'
    + '.dsc-box a{color:#1559cf;font-weight:700;text-decoration:none;}'
    + '.dsc-box a:hover{text-decoration:underline;}'
    + '.dsc-btn{display:block;width:100%;background:#1559cf;color:#fff;font-weight:700;font-size:.95rem;'
    + 'border:none;border-radius:12px;padding:14px;cursor:pointer;transition:background .18s;}'
    + '.dsc-btn:hover{background:#0e3f96;}'
    + '@media(prefers-reduced-motion:reduce){.dsc-box{animation:none;}}'
    /* Dark variant, applied only on pages carrying premium.css so the
       acknowledgement matches the front-of-house design. Wording is
       identical in both; only the styling differs. */
    + '.dsc-overlay.dsc-dark{background:rgba(5,7,10,.88);}'
    + '.dsc-dark .dsc-box{background:#0e1114;border:1px solid rgba(236,233,225,.14);border-radius:0;'
    + 'box-shadow:0 40px 90px -20px rgba(0,0,0,.7);'
    + 'font-family:"Satoshi",ui-sans-serif,system-ui,sans-serif;padding:34px 30px 30px;}'
    + '.dsc-dark .dsc-badge{background:none;width:auto;height:auto;margin:0 auto 18px;color:#5b8ac9;}'
    + '.dsc-dark .dsc-box h2{font-family:"Sentient",Georgia,serif;font-weight:400;font-size:1.3rem;'
    + 'color:#ece9e1;letter-spacing:.005em;margin-bottom:14px;}'
    + '.dsc-dark .dsc-box p{color:#b9b5ab;line-height:1.8;margin-bottom:24px;}'
    + '.dsc-dark .dsc-box a{color:#5b8ac9;font-weight:500;}'
    + '.dsc-dark .dsc-btn{background:transparent;border:1px solid #5b8ac9;border-radius:0;color:#ece9e1;'
    + 'font-weight:500;font-size:.8rem;letter-spacing:.22em;text-transform:uppercase;padding:16px;'
    + 'transition:background .25s,color .25s;}'
    + '.dsc-dark .dsc-btn:hover{background:#5b8ac9;color:#0a0c0f;}';

  /* Pages using the new design system load premium.css; match its look. */
  function isPremiumPage() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if ((links[i].getAttribute('href') || '').indexOf('premium.css') !== -1) return true;
    }
    return false;
  }

  function init() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.className = 'dsc-overlay' + (isPremiumPage() ? ' dsc-dark' : '');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'dscTitle');
    overlay.innerHTML =
      '<div class="dsc-box">' +
        '<div class="dsc-badge" aria-hidden="true">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>' +
        '</div>' +
        '<h2 id="dscTitle">Please read &amp; confirm understanding</h2>' +
        '<p>This website has been created by Dan to bring his views and the information that matters into one easy place for you. It is Dan’s personal website and is not the official website of BMW or Hedin Automotive. Full terms and conditions can be found <a href="terms.html" target="_blank" rel="noopener">here</a>. Press continue to confirm your understanding.</p>' +
        '<button type="button" class="dsc-btn" id="dscOk">Continue to page</button>' +
      '</div>';
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = 'hidden';

    var btn = document.getElementById('dscOk');
    btn.focus();
    btn.addEventListener('click', function () {
      try { localStorage.setItem('dsc_ack', '1'); } catch (e) {}
      overlay.parentNode && overlay.parentNode.removeChild(overlay);
      document.documentElement.style.overflow = '';
    });
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
