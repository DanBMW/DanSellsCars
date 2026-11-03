/* "Send customer latest stock" email. Shared by the send-latest-stock edge function and the preview script.
   Inline CSS for email clients. No dashes in copy. A monthly figure only appears with its full representative
   example (finance comes from ctMatch.finance, which returns nothing unless the example is complete). */
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const OPENING = 'Dan at BMW Ruxley has seen some vehicles in stock he thinks may be of interest based on your requirements.';
export const REPLIES = {
  interested: "I'm still on the market and interested in making an appointment to talk about these",
  offmarket: "I'm no longer on the market",
  keepinformed: 'Keep me informed of more cars'
};
function carBlock(it) {
  const c = it.car, f = it.finance, isNew = c.kind === 'new_stock';
  const specs = (isNew ? ['Brand new', c.colour, c.fuel, c.gearbox] : [c.year, c.mileage, c.fuel, c.gearbox, c.colour]).filter(Boolean).map(esc).join(' &middot; ');
  const link = !isNew && /^https:\/\/(www\.)?hedinautomotive\.co\.uk\//.test(String(c.listing_url || '')) ? c.listing_url : '';
  return `<tr><td style="padding:0 0 20px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e7ee">
   ${c.image ? `<tr><td>${link ? `<a href="${esc(link)}">` : ''}<img src="${esc(c.image)}" width="560" alt="${esc(c.model)}" style="display:block;width:100%;height:auto;border:0">${link ? '</a>' : ''}</td></tr>` : ''}
   <tr><td style="padding:18px 20px 6px;font:600 19px/1.3 Helvetica,Arial,sans-serif;color:#0b1220">${esc(c.model)}</td></tr>
   <tr><td style="padding:0 20px 8px;font:14px/1.5 Helvetica,Arial,sans-serif;color:#4a5568">${specs}</td></tr>
   <tr><td style="padding:0 20px 8px;font:700 22px/1.3 Helvetica,Arial,sans-serif;color:#0b1220">${esc(c.price || 'Price on request')}</td></tr>
   ${f ? `<tr><td style="padding:0 20px 6px;font:600 15px/1.4 Helvetica,Arial,sans-serif;color:#0b1220">${esc(f.headline)}</td></tr>
   <tr><td style="padding:0 20px 12px;font:12px/1.5 Helvetica,Arial,sans-serif;color:#4a5568"><strong>Representative example.</strong> ${esc(f.example)}</td></tr>` : ''}
   ${link ? `<tr><td style="padding:4px 20px 20px"><a href="${esc(link)}" style="display:inline-block;background:#1c69d4;color:#ffffff;font:700 15px Helvetica,Arial,sans-serif;padding:12px 22px;border-radius:24px;text-decoration:none">View this car</a></td></tr>` : '<tr><td style="padding:0 0 8px"></td></tr>'}
  </table></td></tr>`;
}
function replyBtn(href, label, primary) {
  return `<tr><td style="padding:0 0 12px" align="center"><a href="${esc(href)}" style="display:block;background:${primary ? '#0b1220' : '#ffffff'};color:${primary ? '#ffffff' : '#0b1220'};border:2px solid #0b1220;font:700 15px/1.35 Helvetica,Arial,sans-serif;padding:13px 18px;border-radius:26px;text-decoration:none;text-align:center">${esc(label)}</a></td></tr>`;
}
export function renderStockEmail({ toName, items, replyUrls, unsubUrl, brokerText, waUrl, swipeUrl }) {
  if (!unsubUrl) throw new Error('every customer email needs an unsubscribe link');
  if (!replyUrls || !replyUrls.interested || !replyUrls.offmarket || !replyUrls.keepinformed) throw new Error('reply links missing');
  const n = items.length;
  const subject = `${n} ${n === 1 ? 'car' : 'cars'} Dan picked out for you | BMW Ruxley`;
  const anyFinance = items.some(it => it.finance);
  const why = 'You are getting this because you gave Dan at BMW Ruxley your requirements and asked to hear about suitable cars. One tap below stops these emails.';
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f2f4f8"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="background:#0b1220;border-radius:16px 16px 0 0;padding:22px 24px;font:700 20px Helvetica,Arial,sans-serif;color:#fff">Dan Sells <span style="color:#9fc3ff;font-weight:400;font-size:14px">BMW Ruxley, Sidcup</span></td></tr>
<tr><td style="background:#ffffff;padding:22px 24px 10px;font:16px/1.55 Helvetica,Arial,sans-serif;color:#0b1220">Hi ${esc(toName || 'there')},<br><br>${esc(OPENING)}</td></tr>
${swipeUrl ? `<tr><td style="background:#ffffff;padding:8px 24px 14px" align="center"><a href="${esc(swipeUrl)}" style="display:block;background:#1c69d4;color:#ffffff;font:800 18px Helvetica,Arial,sans-serif;padding:16px 22px;border-radius:30px;text-decoration:none;text-align:center">Swipe your matches</a><div style="font:13px/1.5 Helvetica,Arial,sans-serif;color:#4a5568;padding:8px 0 0">Like or pass on each car in seconds. No login needed.</div></td></tr>` : ''}
<tr><td style="background:#ffffff;padding:12px 20px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map(carBlock).join('')}</table></td></tr>
${swipeUrl ? `<tr><td style="background:#ffffff;padding:0 24px 18px" align="center"><a href="${esc(swipeUrl)}" style="display:block;background:#1c69d4;color:#ffffff;font:800 17px Helvetica,Arial,sans-serif;padding:15px 22px;border-radius:30px;text-decoration:none;text-align:center">Swipe your matches</a></td></tr>` : ''}
<tr><td style="background:#ffffff;padding:6px 24px 6px;font:600 16px/1.5 Helvetica,Arial,sans-serif;color:#0b1220">Let Dan know where you are with one tap:</td></tr>
<tr><td style="background:#ffffff;padding:6px 24px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${replyBtn(replyUrls.interested, REPLIES.interested, true)}${replyBtn(replyUrls.keepinformed, REPLIES.keepinformed, false)}${replyBtn(replyUrls.offmarket, REPLIES.offmarket, false)}
</table></td></tr>
${waUrl ? `<tr><td style="background:#ffffff;padding:0 24px 24px;font:14px/1.5 Helvetica,Arial,sans-serif;color:#4a5568;border-radius:0 0 16px 16px">Prefer to chat? <a href="${esc(waUrl)}" style="color:#128c4b;font-weight:700">WhatsApp Dan</a></td></tr>` : '<tr><td style="background:#ffffff;padding:0 0 8px;border-radius:0 0 16px 16px"></td></tr>'}
<tr><td style="padding:18px 24px 6px;font:11px/1.5 Helvetica,Arial,sans-serif;color:#6b7280">${anyFinance ? esc(brokerText || '') + '<br><br>' : ''}Prices and availability can change. Photos are for illustration.</td></tr>
<tr><td style="padding:6px 24px 4px;font:13px/1.5 Helvetica,Arial,sans-serif;color:#4a5568">${esc(why)}</td></tr>
<tr><td style="padding:8px 24px 28px"><a href="${esc(unsubUrl)}" style="display:inline-block;border:1px solid #9aa3b2;color:#374151;background:#ffffff;font:600 14px Helvetica,Arial,sans-serif;padding:10px 20px;border-radius:22px;text-decoration:none">Unsubscribe from these emails</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = `Hi ${toName || 'there'},\n\n${OPENING}\n\n${swipeUrl ? 'Swipe your matches: ' + swipeUrl + '\n\n' : ''}` + items.map(it => {
    const c = it.car, link = c.kind !== 'new_stock' && /^https:\/\/(www\.)?hedinautomotive\.co\.uk\//.test(String(c.listing_url || '')) ? c.listing_url : '';
    return `${c.model}\n${c.price || 'Price on request'}${it.finance ? '\n' + it.finance.headline + '\nRepresentative example. ' + it.finance.example : ''}${link ? '\n' + link : ''}\n`; }).join('\n') +
    `\n${REPLIES.interested}: ${replyUrls.interested}\n${REPLIES.keepinformed}: ${replyUrls.keepinformed}\n${REPLIES.offmarket}: ${replyUrls.offmarket}\n\n${why}\nUnsubscribe: ${unsubUrl}\n`;
  return { subject, html, text };
}
