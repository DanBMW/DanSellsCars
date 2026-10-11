/* Homepage quick form: five fields, one Formspree submission, then an
   optional handoff into Find my BMW with the details carried over in
   sessionStorage (dsQuick), so its contact gate is skipped. */
(function () {
  var FORM_URL = 'https://formspree.io/f/xqewleog';
  function $(id) { return document.getElementById(id); }
  function val(n) { var i = document.querySelector('input[name="' + n + '"]:checked'); return i ? i.value : ''; }
  function track(e, p) { try { if (window.gtag) gtag('event', e, Object.assign({ form_name: 'home_quick' }, p || {})); } catch (x) {} }
  function ref() {
    var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'DSH-' + String(d.getFullYear()).slice(2) + z(d.getMonth() + 1) + z(d.getDate()) + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  }
  var WANT = { used: 'Approved used', 'new': 'Brand new', either: 'Not sure yet' };
  var PX = { yes: 'Yes', no: 'No', maybe: 'Maybe' };
  function check() {
    var name = $('hqName').value.trim(), phone = $('hqPhone').value.trim(), email = $('hqEmail').value.trim(), d = phone.replace(/\D/g, '');
    if (!name) return ['Please add your first name.', 'hqName'];
    if (d.length < 10 || d.length > 15 || /[^\d\s+()-]/.test(phone)) return ['Please check your mobile number.', 'hqPhone'];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return ['Please check your email address.', 'hqEmail'];
    if (!val('hqWant')) return ['Pick what you are looking for.', null];
    if (!val('hqPx')) return ['Let me know about a part exchange.', null];
    return null;
  }
  function done(q) {
    $('hqForm').hidden = true; $('hqDone').hidden = false;
    $('hqDoneH').textContent = 'Thanks ' + q.name + ', I\u2019ll be in touch shortly.';
    $('hqWa').href = 'https://wa.me/447827138197?text=' + encodeURIComponent('Hi Dan, it\u2019s ' + q.name + '. I\u2019ve just sent my details on your website (ref ' + q.id + ').');
    try { $('hqDone').focus(); } catch (x) {}
  }
  var sending = false;
  function submit(e) {
    e.preventDefault();
    if (sending) return;
    var bad = check(), err = $('hqErr');
    err.hidden = !bad; err.textContent = bad ? bad[0] : '';
    if (bad) { if (bad[1]) $(bad[1]).focus(); track('home_quick_invalid'); return; }
    var q = { id: ref(), name: $('hqName').value.trim(), phone: $('hqPhone').value.trim(), email: $('hqEmail').value.trim(), want: val('hqWant'), px: val('hqPx'), t: Date.now() };
    var P = {
      form: 'home-quick', lead_id: q.id,
      _subject: 'DanSells quick lead: ' + q.name + ' (' + WANT[q.want] + (q.px === 'yes' ? ', part exchange' : '') + ')',
      _replyto: q.email, _gotcha: $('hqGotcha').value,
      name: q.name, phone: q.phone, email: q.email,
      looking_for: WANT[q.want], part_exchange: PX[q.px],
      page_url: location.href.split('#')[0],
      note: 'If they carry on into Find my BMW, their full brief follows as one more email with same_lead_as ' + q.id + '.'
    };
    sending = true; var b = $('hqSend'); b.disabled = true; b.textContent = 'Sending';
    fetch(FORM_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(P) })
      .then(function (r) { return r.json()['catch'](function () { return {}; }).then(function (j) { if (!r.ok || (j && (j.ok === false || j.error || j.errors))) throw new Error(r.status); }); })
      .then(function () {
        try { sessionStorage.setItem('dsQuick', JSON.stringify(q)); } catch (x) {}
        track('generate_lead', { lead_source: 'home_quick', looking_for: q.want, part_exchange: q.px });
        done(q);
      }, function () {
        sending = false; b.disabled = false; b.textContent = 'Send to Dan';
        err.hidden = false; err.textContent = 'That did not go through, so nothing has reached me yet. Please try again, or message me on WhatsApp.';
        track('home_quick_error');
      });
  }
  function boot() {
    var f = $('hqForm'); if (!f) return;
    f.addEventListener('submit', submit);
    f.addEventListener('focusin', function once() { track('home_quick_start'); f.removeEventListener('focusin', once); });
    $('hqGo').addEventListener('click', function () { track('home_quick_to_fmb'); });
    try { var q = JSON.parse(sessionStorage.getItem('dsQuick') || 'null'); if (q && q.id) done(q); } catch (x) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
