// SwipeToDrive: notify-buy-request (Supabase Edge Function, Deno).
// The app calls this right after saving a buy_requests row. It checks the caller can see that customer,
// emails Dan through Resend and stamps notified_at so a request is only emailed once.
// Secrets (set with `supabase secrets set`, never in the repo):
//   RESEND_API_KEY, MAIL_FROM (alerts@mail.dan-sells.co.uk), DAN_NOTIFY_EMAIL.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
const env = (k: string) => Deno.env.get(k) || '';
const CORS = { 'Access-Control-Allow-Origin': 'https://dan-sells.co.uk', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const auth = req.headers.get('Authorization') || '';
  const { id } = await req.json().catch(() => ({}));
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'id' }, 400);
  // 1. the caller must be signed in and able to access the customer on this request
  //    (server side tests may instead send x-cron-secret, which only the box and pg_cron hold)
  const trusted = !!env('CRON_SECRET') && req.headers.get('x-cron-secret') === env('CRON_SECRET');
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } });
  if (!trusted) { const { data: u } = await asUser.auth.getUser(); if (!u?.user) return json({ error: 'auth' }, 401); }
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: r } = await db.from('buy_requests').select('*').eq('id', id).maybeSingle();
  if (!r) return json({ error: 'not found' }, 404);
  if (!trusted) { const { data: ok } = await asUser.rpc('can_access_customer', { cid: r.customer_id }); if (!ok) return json({ error: 'forbidden' }, 403); }
  if (r.notified_at) return json({ ok: true, already: true });
  if (!env('RESEND_API_KEY') || !env('MAIL_FROM') || !env('DAN_NOTIFY_EMAIL')) return json({ ok: false, reason: 'email not configured' });
  const { data: c } = await db.from('customers').select('name,phone,email,postcode').eq('id', r.customer_id).maybeSingle();
  const cust = c || {} as any;
  const what = r.type === 'buy' ? `wants to buy ${r.car_model || ''} ${r.car_reg && !String(r.car_reg).startsWith('NEW-') ? r.car_reg : ''}`.trim() : `sent their matches (${(r.cars || []).length})`;
  const subject = `SwipeToDrive: ${cust.name || 'A customer'} ${what}`;
  const lines = r.type === 'buy' ? [`Car: ${r.car_model || ''}`, `Reg: ${r.car_reg || ''}`, `Price shown: ${r.car_price || 'n/a'}`]
    : (r.cars || []).map((x: any) => `${x.model || ''} ${x.kind === 'new' ? '(new)' : x.reg || ''} ${x.price || ''}`.trim());
  const text = [subject, '', `Name: ${cust.name || ''}`, `Phone: ${cust.phone || ''}`, `Email: ${cust.email || ''}`, `Postcode: ${cust.postcode || ''}`, '', ...lines, '',
    r.type === 'buy' ? 'They were told you will call to take a deposit and arrange collection.' : '', 'Open SwipeToDrive > Customers > Buy requests: https://dan-sells.co.uk/swipe-drive/#buys'].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5"><h2 style="margin:0 0 8px">${esc(subject)}</h2>` +
    `<p><b>${esc(cust.name)}</b><br>${esc(cust.phone)}<br>${esc(cust.email)}<br>${esc(cust.postcode)}</p><ul>${lines.map((l: string) => `<li>${esc(l)}</li>`).join('')}</ul>` +
    (r.type === 'buy' ? '<p>They were told you will call to take a deposit and arrange collection.</p>' : '') +
    `<p><a href="https://dan-sells.co.uk/swipe-drive/#buys">Open Buy requests in SwipeToDrive</a></p></div>`;
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('MAIL_FROM'), to: [env('DAN_NOTIFY_EMAIL')], subject, html, text, ...(cust.email ? { reply_to: cust.email } : {}) }) });
  if (!res.ok) return json({ ok: false, reason: 'send failed', status: res.status }, 502);
  const sent = await res.clone().json().catch(() => ({}));
  await db.from('buy_requests').update({ notified_at: new Date().toISOString() }).eq('id', id);
  return json({ ok: true, email_id: sent?.id || null });
});
