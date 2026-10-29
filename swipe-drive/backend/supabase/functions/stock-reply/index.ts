// SwipeToDrive: stock-reply (Supabase Edge Function, Deno). NOT deployed until Dan approves.
// The three buttons in the "latest stock" email. GET shows a confirm page (link scanners never record anything),
// POST records the answer on the customer and emails a staff notification to Dan (DAN_NOTIFY_EMAIL secret).
// "No longer on the market" only flags the customer for Dan to close (close_suggested_at); it never closes them.
// Token: signed per customer, same pattern as unsubscribe (../_shared/unsub.js), purpose = the button.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyUnsub } from '../_shared/unsub.js';
import { REPLIES } from '../_shared/stock-email.js';
const env = (k: string) => Deno.env.get(k) || '';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
const DONE: Record<string, string> = {
  interested: 'Thanks. Dan will be in touch to arrange a time to talk these through.',
  keepinformed: "Thanks. Dan will keep an eye out and send you more cars that fit.",
  offmarket: 'Thanks for letting Dan know. Good luck, and you know where he is if anything changes.'
};
const page = (body: string, status = 200) => new Response(`<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Dan Sells | BMW Ruxley</title>
<body style="margin:0;background:#f2f4f8;font:17px/1.5 Helvetica,Arial,sans-serif;color:#0b1220"><div style="max-width:460px;margin:48px auto;background:#fff;border-radius:16px;padding:28px 24px;text-align:center">
<div style="font-weight:700;font-size:20px;margin:0 0 14px">Dan Sells <span style="font-weight:400;font-size:14px;color:#4a5568">BMW Ruxley</span></div>${body}</div></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

Deno.serve(async (req) => {
  const url = new URL(req.url); const t = url.searchParams.get('t') || '';
  const v = await verifyUnsub(env('UNSUBSCRIBE_SECRET'), t);
  if (!v || !REPLIES[v.purpose as keyof typeof REPLIES]) return page('<p>That link did not work. WhatsApp Dan on 07827 138197 instead.</p>', 404);
  const label = REPLIES[v.purpose as keyof typeof REPLIES];
  if (req.method !== 'POST') return page(`<p>Send this to Dan?</p><p style="font-weight:700">${esc(label)}</p><form method="post" action="?t=${encodeURIComponent(t)}"><button style="background:#0b1220;color:#fff;border:0;border-radius:24px;padding:13px 26px;font:700 16px Helvetica,Arial,sans-serif;cursor:pointer">Yes, send it</button></form>`);
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const now = new Date().toISOString();
  const patch: any = { stock_reply: v.purpose, stock_reply_at: now };
  if (v.purpose === 'offmarket') patch.close_suggested_at = now;
  const { data: cu, error } = await db.from('customers').update(patch).eq('id', v.id).select('id,name,phone,email,owner_staff_id').maybeSingle();
  if (error || !cu) return page('<p>That did not save. WhatsApp Dan on 07827 138197 instead.</p>', 500);
  await db.from('stock_emails').update({ reply: v.purpose, replied_at: now }).eq('customer_id', v.id).is('replied_at', null);
  if (env('RESEND_API_KEY') && env('MAIL_FROM') && env('DAN_NOTIFY_EMAIL')) {
    const subject = `SwipeToDrive: ${cu.name || 'A customer'} replied, ${label}`;
    const lines = [`Name: ${cu.name || ''}`, `Phone: ${cu.phone || ''}`, `Email: ${cu.email || ''}`, `Reply: ${label}`,
      v.purpose === 'offmarket' ? 'They are flagged on the Customers screen so you can close them. Nothing was closed automatically.' : '',
      'Open SwipeToDrive > Customers: https://dan-sells.co.uk/swipe-drive/#team'].filter(Boolean);
    await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('MAIL_FROM'), to: [env('DAN_NOTIFY_EMAIL')], subject, text: lines.join('\n'),
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5"><h2 style="margin:0 0 8px">${esc(subject)}</h2>${lines.map(l => `<p style="margin:4px 0">${esc(l)}</p>`).join('')}</div>`,
        ...(cu.email ? { reply_to: cu.email } : {}) }) }).catch(() => null);
  }
  return page(`<p>${esc(DONE[v.purpose])}</p>`);
});
