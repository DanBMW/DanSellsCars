// SwipeToDrive: send-latest-stock (Supabase Edge Function, Deno). NOT deployed until Dan approves.
// Staff tap "Send customer latest stock". This re-ranks the customer's matches on the live stock (same rules as
// the site, match-core.js), keeps only the cars the staff member confirmed that are still in stock, emails the
// customer through Resend with three signed reply buttons and the GDPR unsubscribe button, and logs the send.
// Off unless CUSTOMER_EMAIL_ENABLED=true AND UNSUBSCRIBE_SECRET is set (it is false today; Dan approves turning it on).
// Secrets: RESEND_API_KEY, MAIL_FROM, UNSUBSCRIBE_SECRET, CUSTOMER_EMAIL_ENABLED. SUPABASE_* come from Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { signUnsub, signGuest } from '../_shared/unsub.js';
import { GUEST_DAYS } from '../_shared/guest.js';
import { renderStockEmail } from '../_shared/stock-email.js';
(globalThis as any).window = globalThis;
const SITE = 'https://dan-sells.co.uk';
const env = (k: string) => Deno.env.get(k) || '';
const CORS = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const BROKER = 'Finance subject to status, 18+, UK residents. Hedin Automotive Group acts as a credit broker and not a lender.';
async function loadScript(u: string) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(u + ' ' + r.status); (0, eval)(await r.text()); }
let M: any = null;
async function init() { if (M) return; await loadScript(SITE + '/stock-core.js'); await loadScript(SITE + '/swipe-drive/match-core.js'); M = (globalThis as any).ctMatch; if (!M || !M.pickLatest) throw new Error('match-core.js has no pickLatest'); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!(env('CUSTOMER_EMAIL_ENABLED') === 'true' && env('UNSUBSCRIBE_SECRET').length >= 16)) return json({ ok: false, reason: 'customer emails are off' }, 403);
  if (!env('RESEND_API_KEY') || !env('MAIL_FROM')) return json({ ok: false, reason: 'email not configured' }, 503);
  const { customer_id, regs } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(customer_id || '')) || !Array.isArray(regs) || !regs.length) return json({ error: 'bad request' }, 400);
  // staff or admin only, and only for a customer they can access
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
  const { data: u } = await asUser.auth.getUser(); if (!u?.user) return json({ error: 'auth' }, 401);
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: me } = await db.from('profiles').select('id,role,name,whatsapp').eq('id', u.user.id).maybeSingle();
  if (!me || (me.role !== 'staff' && me.role !== 'admin')) return json({ error: 'staff only' }, 403);
  const { data: can } = await asUser.rpc('can_access_customer', { cid: customer_id }); if (!can) return json({ error: 'forbidden' }, 403);
  const { data: cu } = await db.from('customers').select('*').eq('id', customer_id).maybeSingle();
  if (!cu) return json({ error: 'not found' }, 404);
  if (cu.closed_at) return json({ ok: false, reason: 'customer is closed' }, 409);
  if (cu.email_opt_out) return json({ ok: false, reason: 'customer unsubscribed' }, 409);
  if (!cu.email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(cu.email)) return json({ ok: false, reason: 'no email' }, 409);
  await init();
  const stock = await (await fetch(SITE + '/lookup/stock.json', { cache: 'no-store' })).json();
  let cars: any[] = Object.values(stock.cars || {});
  try { const ns = await (await fetch(SITE + '/lookup/new-stock.json', { cache: 'no-store' })).json(); cars = cars.concat((ns.cars || []).filter((c: any) => c.order_number).map(M.fromNewStock)); } catch (_) { /* used only */ }
  const want = new Set(regs.map((r: unknown) => String(r)));
  const picked = M.pickLatest(cars, cu, 40).filter((x: any) => want.has(x.car.reg)).slice(0, 6);
  if (!picked.length) return json({ ok: false, reason: 'those cars are no longer available' }, 409);
  const secret = env('UNSUBSCRIBE_SECRET'), fn = env('SUPABASE_URL') + '/functions/v1/';
  const tok = async (purpose: string) => encodeURIComponent(await signUnsub(secret, cu.id, purpose));
  const replyUrls = { interested: fn + 'stock-reply?t=' + await tok('interested'), offmarket: fn + 'stock-reply?t=' + await tok('offmarket'), keepinformed: fn + 'stock-reply?t=' + await tok('keepinformed') };
  const unsubUrl = fn + 'unsubscribe?t=' + await tok('custmail');
  // one 'Swipe your matches' link: signed, expires in 30 days, revoked by closing, unsubscribing or a guest_version bump
  const swipeUrl = SITE + '/swipe-drive/guest.html#t=' + encodeURIComponent(await signGuest(secret, cu.id, cu.guest_version | 0, Math.floor(Date.now() / 1000) + GUEST_DAYS * 86400));
  const owner = cu.owner_staff_id ? (await db.from('profiles').select('whatsapp').eq('id', cu.owner_staff_id).maybeSingle()).data : null;
  const wa = 'https://wa.me/' + ((owner && owner.whatsapp) || M.DAN_WA);
  const items = picked.map((x: any) => ({ car: x.car, finance: M.finance(x.car) }));
  const msg = renderStockEmail({ toName: String(cu.name || '').split(' ')[0], items, replyUrls, unsubUrl, swipeUrl, brokerText: BROKER, waUrl: wa });
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('MAIL_FROM'), to: [cu.email], subject: msg.subject, html: msg.html, text: msg.text,
      headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }) });
  const sent = await r.clone().json().catch(() => ({}));
  const log = { customer_id: cu.id, sent_by: me.id, sent_by_name: me.name || '', to_email: cu.email, status: r.ok ? 'sent' : 'failed', resend_id: sent?.id || null,
    cars: picked.map((x: any) => ({ reg: x.car.reg, model: x.car.model, price: x.car.price || '', kind: x.car.kind || 'used' })) };
  await db.from('stock_emails').insert(log);
  if (!r.ok) return json({ ok: false, reason: 'send failed', status: r.status }, 502);
  return json({ ok: true, cars: log.cars.length });
});
