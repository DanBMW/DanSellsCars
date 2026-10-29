/* Daily match digest email (one per recipient, every new match in it).
   Used by index.ts; scripts render previews with node. Plain inline CSS for
   email clients. No dashes in copy. */
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function carBlock(it) {
  const c = it.car, f = it.finance;
  const specs = [c.year, c.mileage, c.fuel, c.gearbox, c.colour].filter(Boolean).map(esc).join(' &middot; ');
  const where = c.kind === 'new_stock' ? 'Brand new, in retailer stock' : c.source === 'group' ? 'I can source this one' : 'On my forecourt';
  return `<tr><td style="padding:0 0 22px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e7ee">
   ${c.image ? `<tr><td><img src="${esc(c.image)}" width="560" alt="${esc(c.model)}" style="display:block;width:100%;height:auto;border:0"></td></tr>` : ''}
   <tr><td style="padding:18px 20px 6px;font:600 19px/1.3 Helvetica,Arial,sans-serif;color:#0b1220">${esc(c.model)}</td></tr>
   ${it.customerName ? `<tr><td style="padding:0 20px 4px;font:600 13px/1.4 Helvetica,Arial,sans-serif;color:#1c69d4">For ${esc(it.customerName)}</td></tr>` : ''}
   <tr><td style="padding:0 20px 8px;font:14px/1.5 Helvetica,Arial,sans-serif;color:#4a5568">${specs}<br>${where}</td></tr>
   ${it.note ? `<tr><td style="padding:0 20px 8px;font:600 13px/1.4 Helvetica,Arial,sans-serif;color:#2f6b3f">${esc(it.note)}</td></tr>` : ''}
   <tr><td style="padding:0 20px 8px;font:700 22px/1.3 Helvetica,Arial,sans-serif;color:#0b1220">${esc(c.price || 'Price on request')}</td></tr>
   ${f ? `<tr><td style="padding:0 20px 10px;font:600 15px/1.4 Helvetica,Arial,sans-serif;color:#0b1220">${esc(f.headline)}</td></tr>
   <tr><td style="padding:0 20px 12px;font:12px/1.5 Helvetica,Arial,sans-serif;color:#4a5568"><strong>Representative example.</strong> ${esc(f.example)}</td></tr>`
     : `<tr><td style="padding:0 20px 12px;font:14px/1.4 Helvetica,Arial,sans-serif;color:#4a5568">Monthly: ask for a quote</td></tr>`}
   <tr><td style="padding:4px 20px 20px"><a href="${esc(it.wa)}" style="display:inline-block;background:#25d366;color:#ffffff;font:700 15px Helvetica,Arial,sans-serif;padding:12px 22px;border-radius:24px;text-decoration:none">${esc(it.waLabel || 'WhatsApp about this car')}</a></td></tr>
  </table></td></tr>`;
}
export function renderDigest({ toName, staff, items, matchesUrl, unsubUrl, brokerText }) {
  if (!unsubUrl) throw new Error('every SwipeToDrive email needs an unsubscribe link');
  const why = staff ? 'You are getting this because you are a SwipeToDrive colleague and match emails are on for your customers.'
                    : 'You are getting this because you signed up to SwipeToDrive at dan-sells.co.uk and turned on email match alerts. One tap below stops them.';
  const n = items.length;
  const subject = staff ? `${n} new ${n === 1 ? 'match' : 'matches'} for your customers | SwipeToDrive`
                        : `${n} new ${n === 1 ? 'match' : 'matches'} for you | SwipeToDrive`;
  const intro = staff ? `New stock came in today that matches ${n === 1 ? 'one of your customers' : 'your customers'}. Here it is in one place.`
                      : `New stock came in today that matches what you told me you want.`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f2f4f8"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="background:#0b1220;border-radius:16px 16px 0 0;padding:22px 24px;font:700 20px Helvetica,Arial,sans-serif;color:#fff">SwipeToDrive <span style="color:#ff4f7b;font-weight:400;font-size:14px">powered by Dan Sells</span></td></tr>
<tr><td style="background:#ffffff;padding:22px 24px 8px;font:16px/1.5 Helvetica,Arial,sans-serif;color:#0b1220">Hi ${esc(toName || 'there')},<br><br>${intro}</td></tr>
<tr><td style="background:#ffffff;padding:12px 20px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map(carBlock).join('')}</table></td></tr>
<tr><td style="background:#ffffff;padding:0 24px 24px" align="center"><a href="${esc(matchesUrl)}" style="display:inline-block;background:#1c69d4;color:#fff;font:700 15px Helvetica,Arial,sans-serif;padding:12px 24px;border-radius:24px;text-decoration:none">See all matches</a></td></tr>
<tr><td style="padding:18px 24px 6px;font:11px/1.5 Helvetica,Arial,sans-serif;color:#6b7280">${esc(brokerText || '')}<br><br>Prices and availability can change.</td></tr>
<tr><td style="padding:6px 24px 4px;font:13px/1.5 Helvetica,Arial,sans-serif;color:#4a5568">${esc(why)}</td></tr>
<tr><td style="padding:8px 24px 28px"><a href="${esc(unsubUrl)}" style="display:inline-block;border:1px solid #9aa3b2;color:#374151;background:#ffffff;font:600 14px Helvetica,Arial,sans-serif;padding:10px 20px;border-radius:22px;text-decoration:none">Unsubscribe from these emails</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = `Hi ${toName || 'there'},\n\n${intro}\n\n` + items.map(it => `${it.car.model}${it.customerName ? ' for ' + it.customerName : ''}\n${it.car.price || ''}\n${it.finance ? it.finance.headline + '\nRepresentative example. ' + it.finance.example : 'Monthly: ask for a quote'}\nWhatsApp: ${it.wa}\n`).join('\n') + `\nSee all matches: ${matchesUrl}\n\n${why}\nUnsubscribe: ${unsubUrl}\n`;
  return { subject, html, text };
}
