// Shared by funnel-lead/index.ts and tests/funnel_lead.test.ts. See funnel-lead/index.ts.
import { validate, toCustomer, CONSENT } from './funnel.js';
const SITE = 'https://dan-sells.co.uk', APP = SITE + '/swipe-drive/';
const CORS = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function sha(s: string) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
// "Would you like to join SwipeToDrive?" Yes or No, after the enquiry. Records the choice on the record the claim
// belongs to. Yes never records messaging consent unless the stock alert agreement was ticked too, and an existing
// consent is never changed. The claim id is a random UUID only this customer's browser was given.
async function join(b: any, req: Request, getDb: () => any, env: (k: string) => string) {
  const claim = String(b.claim || ''); if (!/^[0-9a-f-]{36}$/i.test(claim)) return json({ ok: false, reason: 'claim' }, 400);
  const choice = b.choice === 'yes' ? 'yes' : 'no';
  const db = getDb();
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const hit = await db.rpc('lead_hit', { key_hash: await sha('join|' + ip + '|' + (env('LEAD_HASH_SALT') || 'dan-sells')) });
  if (hit.error) return json({ ok: false, reason: 'busy' }, 503);
  if ((hit.data | 0) > 20) return json({ ok: false, reason: 'slow down' }, 429);
  const { data: cl } = await db.from('customer_claims').select('customer_id').eq('id', claim).maybeSingle();
  if (!cl) return json({ ok: false, reason: 'claim' }, 404);
  const { data: c } = await db.from('customers').select('id,desk,comms_consent_at').eq('id', cl.customer_id).maybeSingle();
  if (!c) return json({ ok: false, reason: 'claim' }, 404);
  const at = new Date().toISOString(), desk = { ...(c.desk || {}), std_join: { choice, at } };
  const upd: any = { desk };
  if (choice === 'yes' && b.alert_consent === true && !c.comms_consent_at) { upd.comms_consent_at = at; upd.comms_consent_text = CONSENT; }
  const u = await db.from('customers').update(upd).eq('id', c.id); if (u.error) return json({ ok: false, reason: 'save' }, 500);
  return json({ ok: true });
}
// The request handler, with the database passed in so tests can run it against a fake.
export async function handle(req: Request, getDb: () => any, env: (k: string) => string) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const raw = await req.text(); if (raw.length > 20000) return json({ error: 'too large' }, 413);
  let b: any = {}; try { b = JSON.parse(raw); } catch (_) { return json({ error: 'bad request' }, 400); }
  if (b && b.action === 'join') return join(b, req, getDb, env);
  const bad = validate(b);
  if (bad === 'spam') return json({ ok: true });                    // honeypot: look fine, do nothing
  if (bad) return json({ ok: false, reason: bad }, 400);
  const db = getDb();
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const key = await sha(ip + '|' + (env('LEAD_HASH_SALT') || 'dan-sells'));
  const hit = await db.rpc('lead_hit', { key_hash: key });
  if (hit.error) return json({ ok: false, reason: 'busy' }, 503);    // no rate limit, no write
  if ((hit.data | 0) > 5) return json({ ok: false, reason: 'slow down' }, 429);   // more than 5 an hour from one network
  const row: any = toCustomer(b);
  // one record per email: an existing one is never overwritten from a public form, it only gets a new enquiry note
  const like = row.email.replace(/[\\%_]/g, (c: string) => '\\' + c);   // an email is matched as text, never as a pattern
  const { data: ex } = await db.from('customers').select('id,user_id,desk').ilike('email', like).is('closed_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  let id = ex?.id, claimed = !!ex?.user_id;
  if (ex) {
    const desk = { ...(ex.desk || {}) }; desk.enquiry = { ...row.desk.enquiry, repeat: true, consent_at: row.comms_consent_at, consent_text: row.comms_consent_text };
    // their new answers become alerts too (one per model), the rest of the record stays as it is
    const alerts = (desk.alerts || []).filter((a: any) => !(row.desk.alerts || []).some((n: any) => String(n.model).toLowerCase() === String(a.model).toLowerCase()));
    desk.alerts = [...alerts, ...(row.desk.alerts || [])].slice(-10);
    const u = await db.from('customers').update({ desk }).eq('id', ex.id); if (u.error) return json({ ok: false, reason: 'save' }, 500);
  } else {
    id = crypto.randomUUID();
    const ins = await db.from('customers').insert({ id, owner_staff_id: null, user_id: null, ...row });
    if (ins.error) { console.error('funnel-lead insert', ins.error.message); return json({ ok: false, reason: 'save' }, 500); }
  }
  if (claimed) return json({ ok: true, url: APP + '#signin', claim: false });
  const cl = await db.from('customer_claims').insert({ customer_id: id, email: row.email }).select('id').single();
  if (cl.error) return json({ ok: true, url: APP + '#signin', claim: false });
  return json({ ok: true, url: APP + '?claim=' + cl.data.id + '#signin', claim: true, ref: cl.data.id });
}
