// Shared by purchase-progress/index.ts and tests/purchase_progress.test.ts. See purchase-progress/index.ts.
const SITE = 'https://dan-sells.co.uk';
const CORS = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Vary': 'Origin' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function sha(s: string) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
export const LIMIT = 60; // lookups per network per hour
const TYPES = ['stock', 'order', 'used'];
// Only these fields ever leave: first name, the three step statuses, type and seen.
export function publicView(name: unknown, p: any) {
  const first = String(name || '').trim().split(/\s+/)[0].slice(0, 40);
  const fin = p.finance === 'yes' || p.finance === 'na' ? p.finance : 'no';
  return { ok: true, first_name: first, deposit: p.deposit ? 'yes' : 'no', finance: fin, order: p.order ? 'yes' : 'no',
    type: TYPES.includes(p.type) ? p.type : null, seen: p.seen === 'no' ? 'no' : p.seen === 'yes' ? 'yes' : null };
}
export async function handle(req: Request, getDb: () => any, env: (k: string) => string) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return json({ error: 'method' }, 405);
  const t = new URL(req.url).searchParams.get('t') || '';
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(t)) return json({ ok: false, reason: 'token' }, 400);
  const db = getDb();
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const hit = await db.rpc('lead_hit', { key_hash: await sha('pp|' + ip + '|' + (env('LEAD_HASH_SALT') || 'dan-sells')) });
  if (hit.error) return json({ ok: false, reason: 'busy' }, 503);
  if ((hit.data | 0) > LIMIT) return json({ ok: false, reason: 'slow down' }, 429);
  const { data, error } = await db.from('customers').select('name,desk').eq('desk->purchase_progress->>token', t).is('closed_at', null).limit(1).maybeSingle();
  if (error) return json({ ok: false, reason: 'busy' }, 503);
  const p = data && data.desk && data.desk.purchase_progress;
  if (!p || p.token !== t) return json({ ok: false, reason: 'not found' }, 404);
  return json(publicView(data.name, p));
}
