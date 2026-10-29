// SwipeToDrive daily job (Supabase Edge Function, Deno). Triggered by pg_cron
// after the morning stock refresh (see schema.sql). It:
//  1. reads lookup/stock.json, finds regs not seen before (stock_seen),
//  2. scores them against every customer with match-core.js,
//  3. pushes to the owning colleague (or Dan) and to a claimed customer with push on,
//  4. sends ONE digest email per staff recipient (customer email behind CUSTOMER_EMAIL_ENABLED, default off),
//  5. sends due "you may be able to change your car" reminders (purchase + 33 months),
//  6. records everything in notifications_sent / purchases.reminder_sent_at so nothing repeats.
//  7. emails Dan a one line health summary when a run sends or finds something, and an alert if it fails (DAN_NOTIFY_EMAIL),
//     under a run lock (take_job_lock) so two overlapping runs cannot double send.
// Secrets live only here: SUPABASE_SERVICE_ROLE_KEY, VAPID_PRIVATE, RESEND_API_KEY, CRON_SECRET, UNSUBSCRIBE_SECRET, DAN_NOTIFY_EMAIL.
// Every email carries a visible unsubscribe button plus List-Unsubscribe and List-Unsubscribe-Post (one click).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { renderDigest } from './digest.js';
import { renderReminder } from './reminder.js';
import { signUnsub } from '../_shared/unsub.js';
import { fetchAll } from '../_shared/paginate.js';
import { pushUrl } from '../_shared/links.js';
import { healthMessage, failureMessage, sendDan, shouldSendHealth } from '../_shared/health.js';
(globalThis as any).window = globalThis;
const SITE = 'https://dan-sells.co.uk';
// The hosted edge runtime cannot import remote URLs at run time (worker failed to boot), so fetch the live
// browser scripts and run them in global scope: the job always uses the same rules as the site.
async function loadScript(u: string) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(u + ' ' + r.status); (0, eval)(await r.text()); }
// Loaded inside the request (not at boot) so a broken or missing script becomes a failure email to Dan,
// not a worker that silently fails to start while pg_cron ignores the response.
let M: any = null;
async function init() {
  if (M) return;
  await loadScript(SITE + '/stock-core.js');
  await loadScript(SITE + '/swipe-drive/match-core.js');
  M = (globalThis as any).ctMatch;
  if (!M || !M.rank) throw new Error('match-core.js loaded but ctMatch is missing');
  (globalThis as any).ctDetails = await fetch(SITE + '/automation/car-details.json').then(r => r.json()).catch(() => null);  // equipment for spec picks
}
const env = (k: string) => Deno.env.get(k) || '';
const APP = SITE + '/swipe-drive/';
// customer emails also need UNSUBSCRIBE_SECRET, so a customer never gets an email without a working signed unsubscribe link
const CUSTOMER_EMAIL_ENABLED = env('CUSTOMER_EMAIL_ENABLED') === 'true' && env('UNSUBSCRIBE_SECRET').length >= 16;
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
  const out: any = { pushed: 0, emailed: 0, reminders: 0, fresh: 0, warnings: [], stage: 'start' };
  let db: any = null, runId: string | null = null;
  try {
    db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    // Run lock: two runs at once (cron plus a manual or retried call) could both read notifications_sent before
    // either writes it and send twice. take_job_lock hands out one lock at a time and expires after 20 minutes.
    out.stage = 'run lock';
    const lk = await db.rpc('take_job_lock', { p_job: 'match-alerts', p_minutes: 20 });
    if (lk.error) out.warnings.push('Run lock not available (' + lk.error.message + '), ran without it');
    else if (!lk.data) return Response.json({ skipped: 'another match run is in progress' }, { status: 409 });
    else runId = lk.data;
    out.stage = 'loading match rules'; await init();
    await run(db, out);
    out.stage = 'done';
    if (shouldSendHealth(out)) { const h = await sendDan(env, healthMessage(out)); out.health_email = h.ok ? 'sent' : h.reason; }
    else out.health_email = 'skipped, nothing changed';
    const { stage: _s, ...body } = out;
    return Response.json(body);
  } catch (e: any) {
    console.error('match-alerts', out.stage, e);
    const a = await sendDan(env, failureMessage(e, out.stage));
    return Response.json({ error: String(e && e.message || e), stage: out.stage, alert_email: a.ok ? 'sent' : a.reason }, { status: 500 });
  } finally {
    if (db && runId) { try { await db.rpc('release_job_lock', { p_job: 'match-alerts', p_run: runId }); } catch (_) { /* expires on its own */ } }
  }
});
// a write whose error PostgREST returns quietly: note it for Dan, because a lost notifications_sent row means a repeat tomorrow
function noteErr(out: any, what: string, r: any) { if (r && r.error) out.warnings.push(what + ': ' + r.error.message); }
async function run(db: any, out: any) {
  webpush.setVapidDetails('mailto:' + (env('VAPID_CONTACT') || 'dan@dan-sells.co.uk'), env('VAPID_PUBLIC'), env('VAPID_PRIVATE'));
  out.stage = 'reading profiles';

  const profiles = await fetchAll(db, 'profiles', '*', 'id');
  const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
  const admin = (profiles || []).find((p: any) => p.role === 'admin');
  // signed per recipient token when UNSUBSCRIBE_SECRET is set, otherwise the stored uuid token (staff only, see CUSTOMER_EMAIL_ENABLED)
  const U = new Map<string, string>();
  for (const p of profiles || []) U.set(p.id, `${env('SUPABASE_URL')}/functions/v1/unsubscribe?t=` + encodeURIComponent(env('UNSUBSCRIBE_SECRET') ? await signUnsub(env('UNSUBSCRIBE_SECRET'), p.id) : p.unsubscribe_token));
  const unsub = (p: any) => U.get(p.id) || '';
  const subs = await fetchAll(db, 'push_subscriptions', '*', 'id');
  async function push(uid: string, payload: any) {
    let n = 0;
    for (const s of (subs || []).filter((s: any) => s.user_id === uid)) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload)); n++; }
      catch (e: any) { if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id); }
    }
    return n;
  }

  // ---------- new stock matches ----------
  out.stage = 'reading stock';
  const sr = await fetch(SITE + '/lookup/stock.json', { cache: 'no-store' });
  if (!sr.ok) throw new Error('lookup/stock.json ' + sr.status);
  const stock = await sr.json();
  const cars: any[] = Object.values(stock.cars || {});
  // new cars in retailer stock (lookup/new-stock.json), keyed NEW<order number>; in budget only on the actual current price
  let newCars: any[] = [];
  try { const ns = await (await fetch(SITE + '/lookup/new-stock.json', { cache: 'no-store' })).json(); newCars = (ns.cars || []).filter((c: any) => c.order_number).map(M.fromNewStock); } catch (e: any) { newCars = []; out.warnings.push('New stock not read: ' + String(e && e.message || e)); }
  if (!cars.length) out.warnings.push('lookup/stock.json had no cars');
  const seen = await fetchAll(db, 'stock_seen', 'reg', 'reg');   // paged: a plain select stops at 1000 rows
  const seenSet = new Set((seen || []).map((r: any) => r.reg));
  const newSeeded = [...seenSet].some((r: any) => String(r).startsWith('NEW'));
  const fresh = (seenSet.size ? cars.filter(c => !seenSet.has(c.reg)) : [])      // first run only seeds
    .concat(newSeeded ? newCars.filter(c => !seenSet.has(c.reg)) : []);          // first run with new stock only seeds it
  out.stage = 'matching';
  if (newCars.length) noteErr(out, 'stock_seen new stock', await db.from('stock_seen').upsert(newCars.map(c => ({ reg: c.reg })), { onConflict: 'reg', ignoreDuplicates: true }));
  if (cars.length && (!seenSet.size || cars.length >= seenSet.size * 0.6))
    noteErr(out, 'stock_seen', await db.from('stock_seen').upsert(cars.map(c => ({ reg: c.reg })), { onConflict: 'reg', ignoreDuplicates: true }));
  else if (cars.length) out.warnings.push(`Stock looked short (${cars.length} cars against ${seenSet.size} seen), stock_seen left as it was`);
  out.fresh = fresh.length;

  // customers whose 33 month point has arrived come back: equity baseline 0, flagged Due to change, matching resumes
  const rb = await db.rpc('reactivate_due_customers'); noteErr(out, 'reactivate_due_customers', rb); const back = rb.data;
  out.reactivated = (back || []).length;

  if (fresh.length) {
    const all = await fetchAll(db, 'customers', '*', 'id');
    const customers = (all || []).filter((c: any) => !c.dealt_at && !c.closed_at);   // dealt customers are paused, closed (archived) customers get nothing
    const sent = await fetchAll(db, 'notifications_sent', 'recipient,customer_id,reg,channel', ['recipient', 'customer_id', 'reg', 'channel']);
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
        const mine = staff ? hits : hits.filter((h: any) => h.car.kind !== 'new_stock');   // new stock alerts are for staff only
        const items = mine.filter((h: any) => !done.has([p.id, cu.id, h.car.reg, 'push'].join('|')));
        if (p.notify_push && items.length) {
          const c = items[0].car;
          const n = await push(p.id, { title: staff ? `New match for ${cu.name || 'a customer'}` : (items.length > 1 ? `${items.length} new matches for you` : 'New match for you'),
            body: `${c.model}${c.year ? ', ' + c.year : ''}`, url: pushUrl(APP, items), image: c.image || '' });
          if (n) { out.pushed += n; noteErr(out, 'notifications_sent push', await db.from('notifications_sent').insert(items.map((h: any) => ({ recipient: p.id, customer_id: cu.id, reg: h.car.reg, channel: 'push' })))); }
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
      const msg = renderDigest({ toName: p.name, staff, items, matchesUrl: APP + (staff ? '#team' : '#matches'), unsubUrl: unsub(p), brokerText: BROKER });
      if (await sendEmail(p.email, msg, unsub(p))) {
        // Dan also gets a copy of matches for colleagues' customers who are due to change
        if (admin && pid !== admin.id) { const due = items.filter((it: any) => /due to change/.test(it.customerName));
          if (due.length) await sendEmail(admin.email, renderDigest({ toName: admin.name, staff: true, items: due, matchesUrl: APP + '#team', unsubUrl: unsub(admin), brokerText: BROKER }), unsub(admin)); }
        out.emailed++; noteErr(out, 'notifications_sent email', await db.from('notifications_sent').insert(items.map((it: any) => ({ recipient: pid, customer_id: it.customer_id, reg: it.car.reg, channel: 'email' }))));
      }
    }
  }

  // ---------- 33 month reminders ----------
  const today = new Date().toISOString().slice(0, 10);
  out.stage = 'change reminders';
  const { data: due, error: dueErr } = await db.from('purchases').select('*, customers(*)').lte('remind_on', today).is('reminder_sent_at', null).eq('cancelled', false);
  if (dueErr) out.warnings.push('Reminders not read: ' + dueErr.message);
  for (const pu of due || []) {
    const cu = pu.customers; if (!cu || cu.closed_at) continue;   // closed (archived) customers get no reminders; left unsent so reopening brings it back
    const owner = cu.owner_staff_id ? byId.get(cu.owner_staff_id) : admin;
    const wa = (owner && owner.whatsapp) || M.DAN_WA;
    const r = renderReminder({ purchase: pu, customer: cu, ownerName: owner ? owner.name : 'Dan', wa });
    let any = false;
    const cp = cu.user_id && byId.get(cu.user_id);
    if (cp && cp.notify_push) any = (await push(cp.id, r.push)) > 0 || any;
    const to = owner || admin;
    if (to && STAFF_EMAIL_ENABLED) any = (await sendEmail(to.email, r.staffEmail, unsub(to))) || any;
    if (admin && to && to.id !== admin.id && STAFF_EMAIL_ENABLED) await sendEmail(admin.email, r.staffEmail, unsub(admin));
    if (any) { out.reminders++; noteErr(out, 'reminder_sent_at', await db.from('purchases').update({ reminder_sent_at: new Date().toISOString() }).eq('id', pu.id)); }
  }
  return out;
}
