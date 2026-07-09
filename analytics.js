/* DanSells GA4 conversion events. Include with:
     <script src="analytics.js" defer></script>
   after the gtag snippet. Safe no-op on pages where gtag is absent.

   Events fired (see CLAUDE.md "GA4 events"):
   - <funnel>_step_<n>  view of a funnel step (funnels: fmb, ev, sq, ap)
   - <funnel>_complete  first view of that funnel's confirmation page
   - generate_lead      any Formspree submission ({form_page, ref_code})
   - whatsapp_click     any wa.me link ({link_location: float|header|drawer|inline})
   - share              native "Share my BMW story" ({method:native, ref_code})
   - referral_visit     landing with ?ref=CODE ({ref_code}); the code is kept
                        for 90 days and stamped onto generate_lead events and
                        into Formspree payloads (referral_code field) so Dan
                        can pay the refer.html reward. Codes are minted by
                        story-share.js (localStorage dsMyRef).
*/
(function () {
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  function track(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  }

  /* ── inbound referral (?ref=CODE from a shared story link) ───────── */
  var REF_TTL = 90 * 24 * 3600 * 1000;
  function refBy() {
    try {
      var raw = localStorage.getItem('dsRefBy');
      if (!raw) return '';
      var o = JSON.parse(raw);
      if (!o || !o.c || Date.now() - (o.t || 0) > REF_TTL) { localStorage.removeItem('dsRefBy'); return ''; }
      return o.c;
    } catch (e) { return ''; }
  }
  try {
    var m = location.search.match(/[?&]ref=([A-Za-z0-9-]{2,24})/);
    if (m) {
      var code = m[1].toUpperCase();
      localStorage.setItem('dsRefBy', JSON.stringify({ c: code, t: Date.now() }));
      if (!sessionStorage.getItem('gaRefSeen')) {
        sessionStorage.setItem('gaRefSeen', '1');
        track('referral_visit', { ref_code: code, page: page });
      }
    }
  } catch (e) {}

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

  /* ── Formspree submissions → generate_lead ─────────────────────────
     If the visitor arrived via a referral link, stamp the code onto the
     GA event and into the submission itself (referral_code) so it shows
     up in Dan's lead email. */
  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        var url = (typeof input === 'string') ? input : ((input && input.url) || '');
        if (url.indexOf('formspree.io') !== -1) {
          var ref = refBy();
          var params = { form_page: page, transport_type: 'beacon' };
          if (ref) params.ref_code = ref;
          track('generate_lead', params);
          if (ref && init && typeof init.body === 'string') {
            try {
              var body = JSON.parse(init.body);
              if (body && typeof body === 'object' && !Array.isArray(body) && !body.referral_code) {
                body.referral_code = ref;
                init.body = JSON.stringify(body);
              }
            } catch (e2) {}
          }
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
      var p = { method: 'native', content_type: 'bmw_story', page: page };
      try { var mine = localStorage.getItem('dsMyRef'); if (mine) p.ref_code = mine; } catch (e) {}
      track('share', p);
      return origShare(data);
    };
  }
})();
