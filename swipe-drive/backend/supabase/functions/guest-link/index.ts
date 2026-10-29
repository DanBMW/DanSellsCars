// SwipeToDrive: guest-link (Supabase Edge Function, Deno). NOT deployed until Dan approves.
// Staff "Copy swipe link" / "Send swipe link on WhatsApp": returns a signed, 30 day, revocable guest swipe link
// for a customer the caller can access. Works without an email address. Nothing is sent from here.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { signGuest } from '../_shared/unsub.js';
import { GUEST_DAYS } from '../_shared/guest.js';
const env = (k: string) => Deno.env.get(k) || '';
const CORS = { 'Access-Control-Allow-Origin': 'https://dan-sells.co.uk', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (env('UNSUBSCRIBE_SECRET').length < 16) return json({ ok: false, reason: 'links not set up' }, 503);
  const { customer_id } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(customer_id || ''))) return json({ error: 'bad request' }, 400);
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
  const { data: u } = await asUser.auth.getUser(); if (!u?.user) return json({ error: 'auth' }, 401);
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: me } = await db.from('profiles').select('role').eq('id', u.user.id).maybeSingle();
  if (!me || (me.role !== 'staff' && me.role !== 'admin')) return json({ error: 'staff only' }, 403);
  const { data: can } = await asUser.rpc('can_access_customer', { cid: customer_id }); if (!can) return json({ error: 'forbidden' }, 403);
  const { data: cu } = await db.from('customers').select('id,closed_at,guest_version,user_id,comms_consent_at').eq('id', customer_id).maybeSingle();
  if (!cu) return json({ error: 'not found' }, 404);
  if (cu.closed_at) return json({ ok: false, reason: 'customer is closed' }, 409);
  if (!cu.comms_consent_at && !cu.user_id) return json({ ok: false, reason: 'no messaging consent recorded' }, 409);   // staff must tick the consent box first
  const t = await signGuest(env('UNSUBSCRIBE_SECRET'), cu.id, cu.guest_version | 0, Math.floor(Date.now() / 1000) + GUEST_DAYS * 86400);
  return json({ ok: true, url: 'https://dan-sells.co.uk/swipe-drive/guest.html#t=' + encodeURIComponent(t), days: GUEST_DAYS });
});
