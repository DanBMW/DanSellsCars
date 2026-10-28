// Swipe Drive: guest-deck (Supabase Edge Function, Deno). NOT deployed until Dan approves.
// The "Swipe your matches" link in the latest stock email. A signed, expiring, revocable per customer token
// (../_shared/unsub.js signGuest) is the only key. It can: read car cards for that customer's matches, record
// swipes, and send a Buy this car or Send my matches request to Dan. It never returns customer details.
// Rate limited per customer (guest_hit). Secrets: UNSUBSCRIBE_SECRET, CRON_SECRET (to call notify-buy-request).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { guestHandle } from '../_shared/guest.js';
(globalThis as any).window = globalThis;
const SITE = 'https://dan-sells.co.uk';
const env = (k: string) => Deno.env.get(k) || '';
const CORS = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
async function loadScript(u: string) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(u + ' ' + r.status); (0, eval)(await r.text()); }
let M: any = null;
async function init() { if (M) return; await loadScript(SITE + '/stock-core.js'); await loadScript(SITE + '/swipe-drive/match-core.js'); M = (globalThis as any).ctMatch; }
async function loadCars() {
  const st = await (await fetch(SITE + '/lookup/stock.json', { cache: 'no-store' })).json();
  let cars: any[] = Object.values(st.cars || {});
  try { const ns = await (await fetch(SITE + '/lookup/new-stock.json', { cache: 'no-store' })).json(); cars = cars.concat((ns.cars || []).filter((c: any) => c.order_number).map(M.fromNewStock)); } catch (_) { /* used only */ }
  return cars;
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('no', { status: 405, headers: CORS });
  const body = await req.json().catch(() => ({}));
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  await init();
  const db = {
    customer: async (id: string) => (await sb.from('customers').select('id,name,phone,email,owner_staff_id,closed_at,email_opt_out,guest_version,models,models_must,fuel,body,colours,colours_must,specs,specs_must,new_used,budget_type,monthly_gbp,cash_gbp,mileage_bands,annual_mileage').eq('id', id).maybeSingle()).data,
    hit: async (id: string) => (await sb.rpc('guest_hit', { cid: id })).data || 0,
    emailedRegs: async (id: string) => { const r = (await sb.from('stock_emails').select('cars').eq('customer_id', id).order('sent_at', { ascending: false }).limit(1).maybeSingle()).data; return (r?.cars || []).map((c: any) => c.reg); },
    swipes: async (id: string) => { const o: any = {}; ((await sb.from('swipes').select('reg,liked').eq('customer_id', id)).data || []).forEach((s: any) => { o[s.reg] = s.liked; }); return o; },
    ownerWa: async (cu: any) => { if (!cu.owner_staff_id) return '447827138197'; const p = (await sb.from('profiles').select('whatsapp').eq('id', cu.owner_staff_id).maybeSingle()).data; return p?.whatsapp || '447827138197'; },
    swipe: async (id: string, reg: string, liked: boolean) => { await sb.from('swipes').upsert({ customer_id: id, reg, liked, source: 'guest_link' }, { onConflict: 'customer_id,reg' }); },
    // Confirm your details: fill missing phone or email, hold any change for Dan (guest_update), email Dan
    confirm: async (id: string, fill: any, upd: any) => {
      const { data: cu } = await sb.from('customers').update({ ...fill, guest_update: upd }).eq('id', id).select('name').maybeSingle();
      if (env('RESEND_API_KEY') && env('MAIL_FROM') && env('DAN_NOTIFY_EMAIL')) {
        const L = [`${cu?.name || 'A customer'} went through Confirm your details from the swipe link.`,
          `Mobile: ${upd.filled.includes('phone') ? 'added ' + fill.phone : upd.proposed.phone ? 'wants it changed to ' + upd.proposed.phone + ' (not applied, tap Apply in Customers)' : upd.confirmed.phone ? 'confirmed' : 'not confirmed'}`,
          `Email: ${upd.filled.includes('email') ? 'added ' + fill.email : upd.proposed.email ? 'wants it changed to ' + upd.proposed.email + ' (not applied, tap Apply in Customers)' : upd.confirmed.email ? 'confirmed' : 'not confirmed'}`,
          upd.proposed.name ? `Name typed: ${upd.proposed.name}` : '', `Preferences: ${upd.confirmed.prefs ? 'still right' : 'something has changed'}${upd.prefs_note ? ': ' + upd.prefs_note : ''}`,
          'Open Swipe Drive > Customers: https://dan-sells.co.uk/swipe-drive/#team'].filter(Boolean);
        await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: env('MAIL_FROM'), to: [env('DAN_NOTIFY_EMAIL')], subject: `Swipe Drive: ${cu?.name || 'A customer'} confirmed their details`, text: L.join('\n') }) }).catch(() => null);
      }
    },
    // car preferences from Revvy: low risk, saved straight to the customer; Dan gets a summary of what changed
    savePrefs: async (id: string, patch: any, changes: string[]) => {
      const { data: cu } = await sb.from('customers').update(patch).eq('id', id).select('name').maybeSingle();
      if (env('RESEND_API_KEY') && env('MAIL_FROM') && env('DAN_NOTIFY_EMAIL')) {
        const L = [`${cu?.name || 'A customer'} updated their car preferences with Revvy from the swipe link. Saved to their profile:`, '', ...changes.map(c => '  ' + c), '', 'Open Swipe Drive > Customers: https://dan-sells.co.uk/swipe-drive/#team'];
        await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: env('MAIL_FROM'), to: [env('DAN_NOTIFY_EMAIL')], subject: `Swipe Drive: ${cu?.name || 'A customer'} updated their car preferences`, text: L.join('\n') }) }).catch(() => null);
      }
    },
    buyRequest: async (id: string, act: string, cars: any[]) => {
      const row: any = act === 'buy' ? { customer_id: id, type: 'buy', car_reg: cars[0].reg, car_model: cars[0].model, car_price: cars[0].price, cars: [], created_by: null, source: 'guest_link' }
                                     : { customer_id: id, type: 'matches', cars, created_by: null, source: 'guest_link' };
      const { data } = await sb.from('buy_requests').insert(row).select('id').single();
      if (data?.id && env('CRON_SECRET')) await fetch(env('SUPABASE_URL') + '/functions/v1/notify-buy-request', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': env('CRON_SECRET'), Authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY') }, body: JSON.stringify({ id: data.id }) }).catch(() => null);
    }
  };
  const r = await guestHandle(body, { secret: env('UNSUBSCRIBE_SECRET'), db, M, loadCars });
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
});
