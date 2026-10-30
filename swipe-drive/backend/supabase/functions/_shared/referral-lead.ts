// Shared by referral-lead/index.ts and tests/referral_lead.test.ts. See referral-lead/index.ts.
import { validateReferral, toRows, mergeReferrer, mergeReferred } from './referral.js';
const SITE = 'https://dan-sells.co.uk';
const CORS = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function sha(s: string) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
const esc = (v: string) => v.replace(/[\\%_]/g, (c) => '\\' + c);
// find an open record by email first, then phone. Never a pattern match.
async function find(db: any, email: string | null, phone: string | null) {
  if (email) { const { data } = await db.from('customers').select('id,desk').ilike('email', esc(email)).is('closed_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(); if (data) return data; }
  if (phone) { const { data } = await db.from('customers').select('id,desk').eq('phone', phone).is('closed_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(); if (data) return data; }
  return null;
}
async function upsert(db: any, row: any, merge: (d: any, a: any) => any) {
  const ex = await find(db, row.email, row.phone);
  if (ex) { const u = await db.from('customers').update({ desk: merge(ex.desk, row.desk) }).eq('id', ex.id); if (u.error) throw u.error; return { id: ex.id, existed: true }; }
  const id = crypto.randomUUID(); const ins = await db.from('customers').insert({ id, owner_staff_id: null, user_id: null, ...row });
  if (ins.error) throw ins.error; return { id, existed: false };
}
export async function handle(req: Request, getDb: () => any, env: (k: string) => string) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const raw = await req.text(); if (raw.length > 10000) return json({ error: 'too large' }, 413);
  let b: any = {}; try { b = JSON.parse(raw); } catch (_) { return json({ error: 'bad request' }, 400); }
  const bad = validateReferral(b);
  if (bad === 'spam') return json({ ok: true });
  if (bad) return json({ ok: false, reason: bad }, 400);
  const db = getDb();
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const hit = await db.rpc('lead_hit', { key_hash: await sha('ref|' + ip + '|' + (env('LEAD_HASH_SALT') || 'dan-sells')) });
  if (hit.error) return json({ ok: false, reason: 'busy' }, 503);
  if ((hit.data | 0) > 5) return json({ ok: false, reason: 'slow down' }, 429);
  const rows = toRows({ ...b, referral_id: crypto.randomUUID() });
  try {
    const rr = await upsert(db, rows.referrer, mergeReferrer);
    const fr = await upsert(db, rows.referred, mergeReferred);
    if (rr.id === fr.id) return json({ ok: false, reason: 'same' }, 400);
    const ins = await db.from('referrals').insert({ ...rows.referral, referrer_customer_id: rr.id, referred_customer_id: fr.id });
    if (ins.error) throw ins.error;
    return json({ ok: true });
  } catch (e) { console.error('referral-lead', (e as any)?.message); return json({ ok: false, reason: 'save' }, 500); }
}
