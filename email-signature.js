/* Dan's email signature for staff follow up templates.
   Plain text for mailto bodies and copy as text. HTML (with the Hedin
   wordmark) for rich clipboard copy and HTML email. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EmailSignature = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TEXT = [
    '______________________________',
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
    '',
    'Mail: Daniel.Cane@hedinautomotive.co.uk',
    'www.hedinautomotive.co.uk'
  ].join('\n');

  var LOGO = 'https://dan-sells.co.uk/assets/hedin-automotive-logo.png';
  var LINK = 'color:#0563C1;text-decoration:underline;';
  var HTML = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Calibri,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.35;color:#000;margin-top:16px">'
    + '<tr><td style="border-top:1px solid #000;width:280px;font-size:0;line-height:0;height:1px;padding:0 0 16px 0">&nbsp;</td></tr>'
    + '<tr><td style="padding:0 0 16px 0"><strong>Daniel Cane</strong><br>BMW Sales Executive</td></tr>'
    + '<tr><td style="padding:0 0 16px 0">Hedin Automotive<br>BMW<br>Ruxley</td></tr>'
    + '<tr><td style="padding:0 0 16px 0">Visiting Address:<br>Maidstone Road<br>DA14 5BG Sidcup</td></tr>'
    + '<tr><td style="padding:0 0 16px 0">Phone: <a href="tel:+442083026431" style="' + LINK + '">+442 083 026 431</a></td></tr>'
    + '<tr><td style="padding:0 0 16px 0">Mail: <a href="mailto:Daniel.Cane@hedinautomotive.co.uk" style="' + LINK + '">Daniel.Cane@hedinautomotive.co.uk</a><br>'
    + '<a href="https://www.hedinautomotive.co.uk" style="' + LINK + '">www.hedinautomotive.co.uk</a></td></tr>'
    + '<tr><td style="padding:16px 0 0 0"><img src="' + LOGO + '" alt="Hedin Automotive" width="260" height="26" style="display:block;border:0;width:260px;height:auto"></td></tr>'
    + '</table>';

  function withSignature(text) {
    var t = String(text == null ? '' : text).replace(/(?:\r?\n)+$/, '').replace(/[ \t]+$/, '');
    if (t.indexOf('______________________________') !== -1 && /Daniel Cane/.test(t)) return t;
    t = t.replace(/(?:\r?\n)+Dan(?:iel)?(?: Cane)?[ \t]*$/, '');
    t = t.replace(/(?:\r?\n)+$/, '').replace(/[ \t]+$/, '');
    return t + '\n\n' + TEXT;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function linkify(s) {
    return s.replace(/(https?:\/\/[^\s<]+)/g, function (u) {
      var tidy = u.replace(/[),.;]+$/, '');
      return '<a href="' + tidy + '" style="' + LINK + '">' + tidy + '</a>' + u.slice(tidy.length);
    });
  }

  function toHtml(text) {
    var signed = withSignature(text);
    var main = signed;
    var idx = signed.lastIndexOf(TEXT);
    if (idx >= 0) main = signed.slice(0, idx).replace(/(?:\r?\n)+$/, '');
    var paras = main.split(/\n\n+/).map(function (p) {
      return '<p style="margin:0 0 14px">' + linkify(esc(p)).replace(/\n/g, '<br>') + '</p>';
    }).join('');
    return '<div style="font-family:Calibri,Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:600px">' + paras + HTML + '</div>';
  }

  return { TEXT: TEXT, HTML: HTML, LOGO: LOGO, withSignature: withSignature, toHtml: toHtml };
});
