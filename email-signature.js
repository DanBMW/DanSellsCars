/* Dan's email signature and Outlook open flow for staff follow up templates.
   mailto cannot carry HTML, so on a phone we copy rich HTML plus plain text,
   then open Outlook compose with the subject (and recipient if known) and an
   empty body. Long press in the body and tap Paste. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EmailSignature = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TOAST = 'Email copied. Long press in the body and tap Paste.';
  var TOAST_FAIL = 'Copy was blocked. In the new email, copy the preview and paste it in.';
  var TEXT = [
    'Daniel Cane',
    'BMW Sales Executive',
    '',
    'Hedin Automotive',
    'BMW',
    'Ruxley',
    '',
    'Visiting Address:',
    'Maidstone Road',
    'DA14 5BG Sidcup',
    '',
    'Phone: +442 083 026 431',
    'Mail: Daniel.Cane@hedinautomotive.co.uk',
    'www.hedinautomotive.co.uk'
  ].join('\n');

  var LOGO = 'https://dan-sells.co.uk/assets/hedin-automotive-logo.png';
  var FONT = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.35;color:#000;';
  var P = 'margin:0;padding:0;' + FONT;
  var LINK = 'color:#0563C1;text-decoration:underline;';
  var HTML = '<div style="' + FONT + 'margin:0;padding:0">'
    + '<div style="border-top:1px solid #000;width:180px;height:1px;line-height:1px;font-size:1px;margin:0;padding:0">&nbsp;</div><br>'
    + '<p style="' + P + '"><strong>Daniel Cane</strong><br>BMW Sales Executive</p><br>'
    + '<p style="' + P + '">Hedin Automotive<br>BMW<br>Ruxley</p><br>'
    + '<p style="' + P + '">Visiting Address:<br>Maidstone Road<br>DA14 5BG Sidcup</p><br>'
    + '<p style="' + P + '">Phone: <a href="tel:+442083026431" style="' + LINK + '">+442 083 026 431</a><br>'
    + 'Mail: <a href="mailto:Daniel.Cane@hedinautomotive.co.uk" style="' + LINK + '">Daniel.Cane@hedinautomotive.co.uk</a><br>'
    + '<a href="https://www.hedinautomotive.co.uk" style="' + LINK + '">www.hedinautomotive.co.uk</a></p><br>'
    + '<img src="' + LOGO + '" alt="Hedin Automotive" width="180" height="18" style="display:block;border:0;width:180px;height:18px">'
    + '</div>';

  function tidy(s) {
    return String(s == null ? '' : s).replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '');
  }

  function hasSignature(t) {
    return /Daniel Cane/.test(t) && /BMW Sales Executive/.test(t) && /hedinautomotive\.co\.uk/i.test(t);
  }

  function withSignature(text) {
    var t = tidy(text);
    if (hasSignature(t)) {
      /* drop a leftover bare Dan line before an already attached signature */
      t = t.replace(/(?:\n)+Dan(?:iel)?(?: Cane)?\n+(?=Daniel Cane)/, '\n\n');
      return tidy(t);
    }
    t = t.replace(/(?:\n)+Dan(?:iel)?(?: Cane)?$/, '');
    return tidy(t + '\n\n' + TEXT);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function linkify(s) {
    return s.replace(/(https?:\/\/[^\s<]+)/g, function (u) {
      var tidyUrl = u.replace(/[),.;]+$/, '');
      return '<a href="' + tidyUrl + '" style="' + LINK + '">' + tidyUrl + '</a>' + u.slice(tidyUrl.length);
    });
  }

  function toHtml(text) {
    var signed = withSignature(text);
    var main = signed;
    var idx = signed.lastIndexOf(TEXT);
    if (idx >= 0) main = signed.slice(0, idx).replace(/\n+$/, '');
    var paras = main.split(/\n\n+/).map(function (p) {
      return '<p style="' + P + '">' + linkify(esc(p)).replace(/\n/g, '<br>') + '</p>';
    }).join('<br>');
    return '<div style="' + FONT + 'max-width:600px">' + paras + '<br>' + HTML + '</div>';
  }

  function isMobileUa(ua) {
    ua = ua || (typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '');
    return /iPhone|iPad|iPod|Android/i.test(ua);
  }

  function composeUrl(opts) {
    opts = opts || {};
    var mobile = opts.mobile != null ? !!opts.mobile : isMobileUa(opts.ua);
    var q = [];
    if (mobile) {
      if (opts.to) q.push('to=' + encodeURIComponent(opts.to));
      if (opts.cc) q.push('cc=' + encodeURIComponent(opts.cc));
      if (opts.subject) q.push('subject=' + encodeURIComponent(opts.subject));
      return 'ms-outlook://compose' + (q.length ? '?' + q.join('&') : '');
    }
    if (opts.cc) q.push('cc=' + encodeURIComponent(opts.cc));
    if (opts.subject) q.push('subject=' + encodeURIComponent(opts.subject));
    return 'mailto:' + (opts.to ? encodeURIComponent(opts.to) : '') + (q.length ? '?' + q.join('&') : '');
  }

  function copyRich(html, text) {
    if (typeof navigator === 'undefined') return Promise.reject(new Error('no clipboard'));
    if (navigator.clipboard && typeof ClipboardItem === 'function') {
      return navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })]);
    }
    return new Promise(function (resolve, reject) {
      try {
        if (typeof document === 'undefined') throw new Error('no document');
        var d = document.createElement('div');
        d.setAttribute('contenteditable', 'true');
        d.innerHTML = html;
        d.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(d);
        var range = document.createRange();
        range.selectNodeContents(d);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        var ok = document.execCommand('copy');
        sel.removeAllRanges();
        document.body.removeChild(d);
        if (ok) return resolve();
      } catch (err) { /* fall through to plain text */ }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(resolve, reject);
      else reject(new Error('copy failed'));
    });
  }

  function openCompose(opts) {
    if (typeof location === 'undefined') return;
    location.href = composeUrl(opts);
  }

  /* Copy first (in the user gesture), then open compose with an empty body. */
  function openEmail(opts) {
    var html = opts.html, text = opts.text;
    var go = function () { openCompose(opts); };
    return copyRich(html, text).then(function () { go(); return true; }, function () { go(); return false; });
  }

  return { TEXT: TEXT, HTML: HTML, LOGO: LOGO, TOAST: TOAST, TOAST_FAIL: TOAST_FAIL, FONT: FONT,
    withSignature: withSignature, toHtml: toHtml, tidy: tidy, hasSignature: hasSignature,
    composeUrl: composeUrl, isMobileUa: isMobileUa, copyRich: copyRich, openCompose: openCompose, openEmail: openEmail };
});
