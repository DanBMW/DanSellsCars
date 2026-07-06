/* Email/contact fallback for people who don't use WhatsApp.
   Renders a lightweight enquiry form that submits to the same Formspree
   endpoint used elsewhere on the site. Exposes window.openContactModal(). */
(function () {
  var FORMSPREE = 'https://formspree.io/f/xqewleog';

  var css = ''
    + 'button.nav-icon-btn{background:none;border:none;padding:0;font:inherit;cursor:pointer;}'
    + '.cf-bg{display:none;position:fixed;inset:0;z-index:1200;background:rgba(5,10,20,.72);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:16px;}'
    + '.cf-bg.open{display:flex;}'
    + '.cf-box{background:#fff;border-radius:22px;padding:28px 24px;width:100%;max-width:440px;position:relative;'
    + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;box-shadow:0 40px 90px -20px rgba(0,0,0,.5);}'
    + '.cf-box h3{font-size:1.1rem;font-weight:800;color:#141a22;margin:0 0 4px;}'
    + '.cf-box .cf-sub{font-size:.85rem;color:#5f6b7c;margin:0 0 18px;line-height:1.5;}'
    + '.cf-field{margin-bottom:13px;}'
    + '.cf-field label{display:block;font-size:.78rem;font-weight:600;color:#44536a;margin-bottom:5px;}'
    + '.cf-field input,.cf-field textarea{width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid rgba(16,21,29,.18);border-radius:11px;'
    + 'font-size:.9rem;font-family:inherit;color:#141a22;background:#fafbfc;}'
    + '.cf-field textarea{min-height:96px;resize:vertical;}'
    + '.cf-field input:focus,.cf-field textarea:focus{outline:none;border-color:#1559cf;background:#fff;box-shadow:0 0 0 3px rgba(21,89,207,.12);}'
    + '.cf-send{display:block;width:100%;margin-top:4px;padding:14px;background:#1559cf;color:#fff;font-weight:700;font-size:.95rem;border:none;border-radius:12px;cursor:pointer;transition:background .18s;}'
    + '.cf-send:hover{background:#0e3f96;}'
    + '.cf-close{position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.2rem;color:#5f6b7c;cursor:pointer;line-height:1;}'
    + '.cf-legal{font-size:.68rem;color:#8a94a0;line-height:1.55;margin:14px 0 0;}'
    + '.cf-legal a{color:#1559cf;text-decoration:none;}'
    + '.cf-ok{display:none;text-align:center;padding:14px 0 6px;}'
    + '.cf-ok p{font-size:.98rem;font-weight:700;color:#1d6b40;margin:0 0 6px;}'
    + '.cf-ok span{font-size:.85rem;color:#5f6b7c;}';

  function init() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var bg = document.createElement('div');
    bg.className = 'cf-bg';
    bg.id = 'cfModal';
    bg.setAttribute('role', 'dialog');
    bg.setAttribute('aria-modal', 'true');
    bg.setAttribute('aria-labelledby', 'cfTitle');
    bg.innerHTML =
      '<div class="cf-box">' +
        '<button type="button" class="cf-close" aria-label="Close" onclick="closeContactModal()">✕</button>' +
        '<div id="cfForm">' +
          '<h3 id="cfTitle">Message Dan</h3>' +
          '<p class="cf-sub">Prefer not to use WhatsApp? Drop Dan a message here and he’ll come back to you personally.</p>' +
          '<div class="cf-field"><label for="cfName">Full name *</label><input id="cfName" type="text" placeholder="Your name" autocomplete="name"/></div>' +
          '<div class="cf-field"><label for="cfEmail">Email *</label><input id="cfEmail" type="email" placeholder="you@example.com" autocomplete="email"/></div>' +
          '<div class="cf-field"><label for="cfPhone">Phone (optional)</label><input id="cfPhone" type="tel" placeholder="07..." autocomplete="tel"/></div>' +
          '<div class="cf-field"><label for="cfMsg">Message *</label><textarea id="cfMsg" placeholder="How can Dan help?"></textarea></div>' +
          '<button type="button" class="cf-send" onclick="submitContact()">Send to Dan →</button>' +
          '<p class="cf-legal">By submitting you agree Dan may contact you about your enquiry. See our <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</p>' +
        '</div>' +
        '<div class="cf-ok" id="cfOk">' +
          '<p>Thanks — your message is on its way. ✓</p>' +
          '<span>Dan will be in touch personally, as soon as he can.</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bg);

    bg.addEventListener('click', function (e) { if (e.target === bg) closeContactModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeContactModal(); });
  }

  window.openContactModal = function () {
    var m = document.getElementById('cfModal');
    if (!m) return;
    document.getElementById('cfForm').style.display = 'block';
    document.getElementById('cfOk').style.display = 'none';
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
    var n = document.getElementById('cfName'); if (n) n.focus();
  };
  window.closeContactModal = function () {
    var m = document.getElementById('cfModal');
    if (!m) return;
    m.classList.remove('open');
    document.body.style.overflow = '';
  };
  window.submitContact = function () {
    var n = document.getElementById('cfName').value.trim();
    var e = document.getElementById('cfEmail').value.trim();
    var p = document.getElementById('cfPhone').value.trim();
    var msg = document.getElementById('cfMsg').value.trim();
    if (!n || !e || !msg) { alert('Please add your name, email and a short message.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { alert('Please check the email address.'); return; }
    fetch(FORMSPREE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        _subject: 'Website enquiry — ' + n,
        name: n, email: e, phone: p || 'not given', message: msg,
        source: (location && location.pathname) || 'website',
        replyto: e
      })
    }).catch(function () {}).finally(function () {
      document.getElementById('cfForm').style.display = 'none';
      document.getElementById('cfOk').style.display = 'block';
    });
  };

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
