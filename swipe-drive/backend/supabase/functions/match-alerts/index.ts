// Swipe Drive daily job (Supabase Edge Function, Deno). Triggered by pg_cron
// after the morning stock refresh (see schema.sql). It:
//  1. reads lookup/stock.json, finds regs not seen before (stock_seen),
//  2. scores them against every customer with match-core.js,
//  3. pushes to the owning colleague (or Dan) and to a claimed customer with push on,
//  4. sends ONE digest email per staff recipient (customer email behind CUSTOMER_EMAIL_ENABLED, default off),
//  5. sends due "you may be able to change your car" reminders (purchase + 33 months),
//  6. records everything in notifications_sent / purchases.reminder_sent_at so nothing repeats.
// Secrets live only here: SUPABASE_SERVICE_ROLE_KEY, VAPID_PRIVATE, RESEND_API_KEY, CRON_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { renderDigest } from './digest.js';
import { renderReminder } from './reminder.js';
(globalThis as any).window = globalThis;
const SITE = 'https://dan-sells.co.uk';
await import(SITE + '/stock-core.js');
await import(SITE + '/swipe-drive/match-core.js');
const M = (globalThis as any).ctMatch;
(globalThis as any).ctDetails = await fetch(SITE + '/automation/car-details.json').then(r => r.json()).catch(() => null);  // equipment for spec picks
const env = (k: string) => Deno.env.get(k) || '';
const APP = SITE + '/swipe-drive/';
const CUSTOMER_EMAIL_ENABLED = env('CUSTOMER_EMAIL_ENABLED') === 'true';
const STAFF_EMAIL_ENABLED = !!(env('RESEND_API_KEY') && env('MAIL_FROM'));
const BROKER = 'Finance subject to status, 18+, UK residents. Hedin Automotive Group acts as a credit broker and not a lender.';

async function sendEmail(to: string, msg: {subject: string, html: string, text: string}, unsub: string) {
  if (!STAFF_EMAIL_ENABLED) return false;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST',
    headers: { Authorization: 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('MAIL_FROM'), to: [to], subject: msg.subject, html: msg.html, text: msg.text,
      headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }) });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== 'Bearer ' + env('CRON_SECRET')) return new Response('no', { status: 401 });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  webpush.setVapidDetails('mailto:' + (env('VAPID_CONTACT') || 'dan@dan-sells.co.uk'), env('VAPID_PUBLIC'), env('VAPID_PRIVATE'));
  const unsubUrl = (tok: string) => `${env('SUPABASE_URL')}/functions/v1/unsubscribe?t=${tok}`;
  const out: any = { pushed: 0, emailed: 0, reminders: 0 };

  const { data: profiles } = await db.from('profiles').select('*');
  const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
  const admin = (profiles || []).find((p: any) => p.role === 'admin');
  const { data: subs } = await db.from('push_subscriptions').select('*');
  async function push(uid: string, payload: any) {
    let n = 0;
    for (const s of (subs || []).filter((s: any) => s.user_id === uid)) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload)); n++; }
      catch (e: any) { if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id); }
    }
    return n;
  }

  // ---------- new stock matches ----------
  const stock = await (await fetch(SITE + '/lookup/stock.json', { cache: 'no-store' })).json();
  const cars: any[] = Object.values(stock.cars || {});
  // new cars in retailer stock (lookup/new-stock.json), keyed NEW<order number>; budget fit uses a 90% price floor
  let newCars: any[] = [];
  try { const ns = await (await fetch(SITE + '/lookup/new-stock.json', { cache: 'no-store' })).json(); newCars = (ns.cars || []).filter((c: any) => c.order_number).map(M.fromNewStock); } catch (_) { newCars = []; }
  const { data: seen } = await db.from('stock_seen').select('reg');
  const seenSet = new Set((seen || []).map((r: any) => r.reg));
  const newSeeded = [...seenSet].some((r: any) => String(r).startsWith('NEW'));
  const fresh = (seenSet.size ? cars.filter(c => !seenSet.has(c.reg)) : [])      // first run only seeds
    .concat(newSeeded ? newCars.filter(c => !seenSet.has(c.reg)) : []);          // first run with new stock only seeds it
  if (newCars.length) await db.from('stock_seen').upsert(newCars.map(c => ({ reg: c.reg })), { onConflict: 'reg', ignoreDuplicates: true });
  if (cars.length && (!seenSet.size || cars.length >= seenSet.size * 0.6))
    await db.from('stock_seen').upsert(cars.map(c => ({ reg: c.reg })), { onConflict: 'reg', ignoreDuplicates: true });
  out.fresh = fresh.length;

  // customers whose 33 month point has arrived come back: equity baseline 0, flagged Due to change, matching resumes
  const { data: back } = await db.rpc('reactivate_due_customers');
  out.reactivated = (back || []).length;

  if (fresh.length) {
    const { data: all } = await db.from('customers').select('*');
    const customers = (all || []).filter((c: any) => !c.dealt_at);   // dealt customers are paused
    const { data: sent } = await db.from('notifications_sent').select('recipient,customer_id,reg,channel');
    const done = new Set((sent || []).map((s: any) => [s.recipient, s.customer_id, s.reg, s.channel].join('|')));
    const digest = new Map<string, any[]>();     // recipient -> items
    for (const cu of customers || []) {
      const hits = M.rank(fresh, cu).filter((x: any) => x.score >= 55).slice(0, 6);
      if (!hits.length) continue;
      const owner = cu.owner_staff_id ? byId.get(cu.owner_staff_id) : admin;
      const wa = (owner && owner.whatsapp) || M.DAN_WA;
      const recips: { p: any, staff: boolean }[] = [];
      if (owner) recips.push({ p: owner, staff: true });
      if (cu.user_id && byId.get(cu.user_id)) recips.push({ p: byId.get(cu.user_id), staff: false });
      for (const { p, staff } of recips) {
        const mine = staff ? hits : hits.filter((h: any) => h.car.kind !== 'new_stock');   // 10% floor estimates are for staff only
        const items = mine.filter((h: any) => !done.has([p.id, cu.id, h.car.reg, 'push'].join('|')));
        if (p.notify_push && items.length) {
          const c = items[0].car;
          const n = await push(p.id, { title: staff ? `New match for ${cu.name || 'a customer'}` : (items.length > 1 ? `${items.length} new matches for you` : 'New match for you'),
            body: `${c.model}${c.year ? ', ' + c.year : ''}`, url: APP + '#matches', image: c.image || '' });
          if (n) { out.pushed += n; await db.from('notifications_sent').insert(items.map((h: any) => ({ recipient: p.id, customer_id: cu.id, reg: h.car.reg, channel: 'push' }))); }
        }
        const emailOk = staff ? STAFF_EMAIL_ENABLED : (CUSTOMER_EMAIL_ENABLED && STAFF_EMAIL_ENABLED && p.notify_email);
        if (emailOk) for (const h of mine) if (!done.has([p.id, cu.id, h.car.reg, 'email'].join('|'))) {
          const arr = digest.get(p.id) || []; digest.set(p.id, arr);
          arr.push({ customer_id: cu.id, customerName: staff ? cu.name + (cu.due_to_change_at ? ' (due to change)' : '') : '', note: staff ? h.reasons.join(', ') : '', car: h.car, finance: M.finance(h.car), wa: M.waLink(wa, h.car), waLabel: staff ? `WhatsApp ${cu.name || 'the customer'}` : 'WhatsApp about this car' });
        }
      }
    }
    for (const [pid, items] of digest) {
      const p = byId.get(pid); const staff = p.role !== 'customer';
      // Staff WhatsApp CTA goes to the customer's phone in the staff digest
      if (staff) for (const it of items) { const cu = (customers || []).find((c: any) => c.id === it.customer_id); if (cu && cu.phone) it.wa = 'https://wa.me/' + String(cu.phone).replace(/\D/g, '').replace(/^0/, '44') + '?text=' + encodeURIComponent(`Hi ${cu.name || ''}, a car just came in that matches what you are after: ${it.car.model}, reg ${it.car.reg}. Want the details?`); }
      const msg = renderDigest({ toName: p.name, staff, items, matchesUrl: APP + (staff ? '#team' : '#matches'), unsubUrl: unsubUrl(p.unsubscribe_token), brokerText: BROKER });
      if (await sendEmail(p.email, msg, unsubUrl(p.unsubscribe_token))) {
        // Dan also gets a copy of matches for colleagues' customers who are due to change
        if (admin && pid !== admin.id) { const due = items.filter((it: any) => /due to change/.test(it.customerName));
          if (due.length) await sendEmail(admin.email, renderDigest({ toName: admin.name, staff: true, items: due, matchesUrl: APP + '#team', unsubUrl: unsubUrl(admin.unsubscribe_token), brokerText: BROKER }), unsubUrl(admin.unsubscribe_token)); }
        out.emailed++; await db.from('notifications_sent').insert(items.map((it: any) => ({ recipient: pid, customer_id: it.customer_id, reg: it.car.reg, channel: 'email' })));
      }
    }
  }

  // ---------- 33 month reminders ----------
  const today = new Date().toISOString().slice(0, 10);
  const { data: due } = await db.from('purchases').select('*, customers(*)').lte('remind_on', today).is('reminder_sent_at', null).eq('cancelled', false);
  for (const pu of due || []) {
    const cu = pu.customers; const owner = cu.owner_staff_id ? byId.get(cu.owner_staff_id) : admin;
    const wa = (owner && owner.whatsapp) || M.DAN_WA;
    const r = renderReminder({ purchase: pu, customer: cu, ownerName: owner ? owner.name : 'Dan', wa });
    let any = false;
    const cp = cu.user_id && byId.get(cu.user_id);
    if (cp && cp.notify_push) any = (await push(cp.id, r.push)) > 0 || any;
    const to = owner || admin;
    if (to && STAFF_EMAIL_ENABLED) any = (await sendEmail(to.email, r.staffEmail, unsubUrl(to.unsubscribe_token))) || any;
    if (admin && to && to.id !== admin.id && STAFF_EMAIL_ENABLED) await sendEmail(admin.email, r.staffEmail, unsubUrl(admin.unsubscribe_token));
    if (any) { out.reminders++; await db.from('purchases').update({ reminder_sent_at: new Date().toISOString() }).eq('id', pu.id); }
  }
  return Response.json(out);
});
