/* DanSells GA4 conversion events. Include with:
     <script src="analytics.js" defer></script>
   after the gtag snippet. Safe no-op on pages where gtag is absent.

   Events fired (see CLAUDE.md "GA4 events"):
   - <funnel>_step_<n>  view of a funnel step (funnels: fmb, ev, sq, ap)
   - <funnel>_complete  first view of that funnel's confirmation page
   - generate_lead      any Formspree submission ({form_page})
   - whatsapp_click     any wa.me link ({link_location: float|header|drawer|inline})
   - share              native "Share my BMW story" ({method:native})
*/
(function () {
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  function track(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  }

  /* ── funnel step views ─────────────────────────────────────────────
     Slug → funnel + on-screen step number. Redirect-only pages
     (step4*, step6, ev-step7) are deliberately absent. */
  var STEPS = {
    'step1.html':   ['fmb', 1], 'step1b.html':  ['fmb', 2],
    'step2.html':   ['fmb', 3], 'step3.html':   ['fmb', 4],
    'step5.html':   ['fmb', 5], 'step5b.html':  ['fmb', 6],
    'step7.html':   ['fmb', 7], 'step8.html':   ['fmb', 8],
    'ev-step1.html': ['ev', 1], 'ev-step2.html': ['ev', 2],
    'ev-step3.html': ['ev', 3], 'ev-step4.html': ['ev', 4],
    'ev-step5.html': ['ev', 5], 'ev-step6.html': ['ev', 6],
    'sq1.html': ['sq', 1], 'sq2.html':  ['sq', 2], 'sq3.html': ['sq', 3],
    'sq4.html': ['sq', 4], 'sq5.html':  ['sq', 5], 'sq6.html': ['sq', 6],
    'sq6b.html': ['sq', 6], 'sq7.html': ['sq', 7],
    'ap1.html': ['ap', 1], 'ap2.html': ['ap', 2], 'ap3.html': ['ap', 3],
    'ap4.html': ['ap', 4], 'ap5.html': ['ap', 5]
  };
  var COMPLETE = {
    'thankyou.html': 'fmb', 'wait.html': 'fmb',
    'ev-thankyou.html': 'ev', 'sq_done.html': 'sq', 'ap6.html': 'ap'
  };

  if (STEPS[page]) {
    track(STEPS[page][0] + '_step_' + STEPS[page][1],
      { funnel: STEPS[page][0], step: STEPS[page][1] });
  } else if (COMPLETE[page]) {
    var fun = COMPLETE[page], key = 'gaDone_' + fun;
    var seen = false;
    try { seen = !!sessionStorage.getItem(key); sessionStorage.setItem(key, '1'); }
    catch (e) {}
    if (!seen) track(fun + '_complete', { funnel: fun });
  }

  /* ── Formspree submissions → generate_lead ───────────────────────── */
  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input) {
      try {
        var url = (typeof input === 'string') ? input : ((input && input.url) || '');
        if (url.indexOf('formspree.io') !== -1) {
          track('generate_lead', { form_page: page, transport_type: 'beacon' });
        }
      } catch (e) {}
      return origFetch.apply(this, arguments);
    };
  }

  /* ── WhatsApp clicks (wa-float, header icon, drawer, inline links) ── */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href*="wa.me/"]');
    if (!a) return;
    var loc = a.classList.contains('wa-float') ? 'float'
      : a.closest('.site-header') ? 'header'
      : a.closest('.nav-drawer') ? 'drawer'
      : 'inline';
    track('whatsapp_click', { link_location: loc, page: page, transport_type: 'beacon' });
  }, true);

  /* ── native "Share my BMW story" ─────────────────────────────────── */
  if (navigator.share) {
    var origShare = navigator.share.bind(navigator);
    navigator.share = function (data) {
      track('share', { method: 'native', content_type: 'bmw_story', page: page });
      return origShare(data);
    };
  }
})();
