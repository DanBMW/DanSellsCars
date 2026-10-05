/* Site-wide "confirm understanding" acknowledgement.
   Shows once per visitor (stored in localStorage) across the whole site.
   Default presentation is a slim bottom bar (not a full-screen modal), so
   the page the visitor came for stays visible. Exact wording and the
   "Continue to page" button are unchanged. Find my BMW still uses inline
   mode via <html data-dsc="inline">. Cookie consent is deliberately not
   combined here yet. */
(function () {
  var WORDING = 'This website has been created by Dan to bring his views and the information that matters into one easy place for you. It is Dan\u2019s personal website and is not the official website of BMW or Hedin Automotive. Full terms and conditions can be found <a href="terms.html" target="_blank" rel="noopener">here</a>. Press continue to confirm your understanding.';
  function acked() { try { return localStorage.getItem('dsc_ack') === '1'; } catch (e) { return false; } }
  function ack() { try { localStorage.setItem('dsc_ack', '1'); } catch (e) {} }

  /* Inline mode, for pages where a bar would still sit on the task
     (find-my-bmw.html: <html data-dsc="inline">). Same wording and the same
     "Continue to page" button, written into every [data-dsc-slot] on the
     page instead of over it. Nothing blocks. */
  if (document.documentElement.getAttribute('data-dsc') === 'inline') {
    var fill = function () {
      var slots = document.querySelectorAll('[data-dsc-slot]');
      for (var i = 0; i < slots.length; i++) {
        var el = slots[i];
        el.innerHTML = '<h2 class="dsc-inline-h">Please read &amp; confirm understanding</h2>'
          + '<p class="dsc-inline-p">' + WORDING + '</p>'
          + (acked() ? '<p class="dsc-inline-done">Thanks, confirmed.</p>'
                     : '<button type="button" class="dsc-inline-btn">Continue to page</button>');
      }
    };
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('.dsc-inline-btn');
      if (!b) return;
      ack();
      fill();
    });
    window.dsDisclaimer = { fill: fill, acked: acked, ack: ack };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill);
    else fill();
    return;
  }

  if (acked()) return;

  var css = ''
    + '.dsc-bar{position:fixed;left:0;right:0;bottom:0;z-index:2000;'
    + 'background:#fff;border-top:1px solid rgba(20,26,34,.12);'
    + 'box-shadow:0 -12px 40px rgba(0,0,0,.18);'
    + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;'
    + 'padding:10px 14px calc(10px + env(safe-area-inset-bottom));'
    + 'animation:dscSlide .28s ease-out;}'
    + '@keyframes dscSlide{from{transform:translateY(110%);opacity:0}to{transform:none;opacity:1}}'
    + '.dsc-bar-inner{max-width:920px;margin:0 auto;display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;}'
    + '.dsc-bar-copy{flex:1 1 240px;min-width:0;}'
    + '.dsc-bar h2{font-size:.8rem;font-weight:800;color:#141a22;margin:0 0 2px;line-height:1.3;}'
    + '.dsc-bar p{font-size:.72rem;line-height:1.45;color:#3c4a5e;margin:0;}'
    + '.dsc-bar a{color:#1559cf;font-weight:700;text-decoration:none;}'
    + '.dsc-bar a:hover{text-decoration:underline;}'
    + '.dsc-bar .dsc-btn{flex:0 0 auto;background:#1559cf;color:#fff;font-weight:700;font-size:.85rem;'
    + 'border:none;border-radius:10px;padding:10px 18px;min-height:44px;cursor:pointer;transition:background .18s;}'
    + '@media(max-width:759px){.dsc-bar .dsc-btn{width:100%}}'
    + '.dsc-bar .dsc-btn:hover{background:#0e3f96;}'
    + '@media(prefers-reduced-motion:reduce){.dsc-bar{animation:none}}'
    /* Dark / premium pages */
    + '.dsc-bar.dsc-dark{background:#0e1114;border-top-color:rgba(236,233,225,.14);'
    + 'font-family:"Satoshi",ui-sans-serif,system-ui,sans-serif;}'
    + '.dsc-dark h2{font-family:"Sentient",Georgia,serif;font-weight:400;color:#ece9e1;}'
    + '.dsc-dark p{color:#b9b5ab;}'
    + '.dsc-dark a{color:#5b8ac9;font-weight:500;}'
    + '.dsc-dark .dsc-btn{background:transparent;border:1px solid #5b8ac9;border-radius:0;color:#ece9e1;'
    + 'font-weight:500;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;}'
    + '.dsc-dark .dsc-btn:hover{background:#5b8ac9;color:#0a0c0f;}'
    /* The sticky contact bar steps aside while this notice is open */
    + 'body.dsc-open .ds-sticky{display:none !important}';

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

    var bar = document.createElement('div');
    bar.className = 'dsc-bar' + (isPremiumPage() ? ' dsc-dark' : '');
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-modal', 'false');
    bar.setAttribute('aria-labelledby', 'dscTitle');
    bar.innerHTML =
      '<div class="dsc-bar-inner">' +
        '<div class="dsc-bar-copy">' +
          '<h2 id="dscTitle">Please read &amp; confirm understanding</h2>' +
          '<p>' + WORDING + '</p>' +
        '</div>' +
        '<button type="button" class="dsc-btn" id="dscOk">Continue to page</button>' +
      '</div>';
    document.body.appendChild(bar);
    document.body.classList.add('dsc-open');
    // Do not lock scroll: the bar is non-blocking by design.

    var btn = document.getElementById('dscOk');
    btn.focus();
    btn.addEventListener('click', function () {
      ack();
      document.body.classList.remove('dsc-open');
      bar.parentNode && bar.parentNode.removeChild(bar);
    });
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
