/* Staff only email (goes to the owning colleague or Dan, never the customer), so the List-Unsubscribe headers
   from index.ts are enough and no customer unsubscribe footer is needed. "You may be able to change your car" reminder, purchase date + 33 months.
   No promises about equity or offers, no claims about what any cover includes. */
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const INSURANCE_LABELS = { gap: 'GAP insurance', tyre_alloy: 'Tyre and alloy insurance', cosmetic: 'Cosmetic repair insurance', warranty: 'Warranty', other: 'Other cover' };
const fmt = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
export function insuranceLines(p) {
  return (p.insurances || []).map(i => (i.type === 'other' && i.label ? i.label : INSURANCE_LABELS[i.type] || i.label) + (i.ends_on ? ', ends ' + fmt(i.ends_on) : ''));
}
export function renderReminder({ purchase: p, customer: c, ownerName, wa }) {
  const ins = insuranceLines(p);
  const waUrl = 'https://wa.me/' + wa + '?text=' + encodeURIComponent(`Hi ${ownerName || 'Dan'}, I bought my ${p.model || 'BMW'} (${p.reg}) on ${fmt(p.purchase_date)}. Could we look at changing it?`);
  const insLine = ins.length ? `Before you do anything, check and use any cover you hold before it ends: ${ins.join('; ')}.` : '';
  const push = { title: 'You may be able to change your car', body: `It is 33 months since you bought your ${p.model || 'car'}. ${ins.length ? 'Check and use any cover you hold before it ends: ' + ins.map(s => s.split(',')[0]).join(', ') + '.' : 'Tap to message me.'}`, url: waUrl };
  const subject = `Reminder: ${c.name || 'customer'} bought ${p.reg} 33 months ago | SwipeToDrive`;
  const html = `<!doctype html><html><body style="margin:0;background:#f2f4f8"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" style="max-width:600px;width:100%;background:#fff;border-radius:16px;font:15px/1.55 Helvetica,Arial,sans-serif;color:#0b1220">
<tr><td style="background:#0b1220;color:#fff;border-radius:16px 16px 0 0;padding:20px 24px;font-weight:700;font-size:19px">SwipeToDrive <span style="color:#ff4f7b;font-weight:400;font-size:14px">powered by Dan Sells</span></td></tr>
<tr><td style="padding:22px 24px">${esc(c.name || 'Your customer')} bought ${esc(p.model || 'their car')} (${esc(p.reg)}) on ${esc(fmt(p.purchase_date))} on ${esc(String(p.finance_type).toUpperCase())}${p.term_months ? ' over ' + esc(p.term_months) + ' months' : ''}.<br><br>
They may be able to change their car. It is worth a conversation; nothing has been worked out or promised.<br><br>
${ins.length ? 'Cover they told us they hold, so they can check and use it before it ends:<ul>' + ins.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' : 'No insurance products were recorded.'}
<a href="https://wa.me/${esc(String(c.phone || '').replace(/\D/g, '').replace(/^0/, '44'))}" style="display:inline-block;background:#25d366;color:#fff;font-weight:700;padding:12px 22px;border-radius:24px;text-decoration:none">WhatsApp ${esc(c.name || 'the customer')}</a></td></tr></table></td></tr></table></body></html>`;
  const text = `${c.name || 'Your customer'} bought ${p.model || ''} (${p.reg}) on ${fmt(p.purchase_date)}. They may be able to change their car.\n${ins.length ? 'Cover held: ' + ins.join('; ') : ''}`;
  return { push, staffEmail: { subject, html, text }, customerLine: `You may be able to change your car. ${insLine}`, waUrl };
}
