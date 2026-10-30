// deno test swipe-drive/tests/referral_lead.test.ts : referral-lead against a fake database (no network, no keys)
import { handle } from '../backend/supabase/functions/_shared/referral-lead.ts';
const env = (_: string) => '';
function fakeDb(o: any = {}) {
  const st: any = { hits: {}, customers: o.customers || [], referrals: [], updates: [] };
  const from = (t: string) => { const f: any = {};
    const api: any = { select: () => api, ilike: (_c: string, v: string) => { f.email = v.replace(/\\/g, ''); return api; }, eq: (c: string, v: string) => { f[c] = v; return api; }, is: () => api, order: () => api, limit: () => api,
      maybeSingle: async () => ({ data: st.customers.find((c: any) => (f.email && c.email === f.email) || (f.phone && c.phone === f.phone)) || null }),
      insert: async (r: any) => { if (o.insErr) return { error: { message: 'x' } }; (t === 'customers' ? st.customers : st.referrals).push(r); return {}; },
      update: (r: any) => { st.updates.push(r); return { eq: async (_c: string, id: string) => { const c = st.customers.find((x: any) => x.id === id); if (c) Object.assign(c, r); return {}; } }; } };
    return api; };
  return { st, db: { rpc: async (_n: string, a: any) => o.rpcErr ? { error: {} } : { data: (st.hits[a.key_hash] = (st.hits[a.key_hash] || 0) + 1) }, from } };
}
const body = (x: any = {}) => JSON.stringify({ referrer_name: 'Sam Jones', referrer_phone: '07700900111', referrer_email: 'sam@example.com', friend_name: 'Alex Smith', friend_phone: '07700900222', reward_preference: '£250 BMW Credit', ...x });
const post = (b: string, ip = '1.1.1.1') => new Request('http://x/', { method: 'POST', body: b, headers: { 'x-forwarded-for': ip } });
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(m + ': ' + a + ' != ' + b); };
Deno.test('new referral: two records, referred marked, referral row', async () => {
  const f = fakeDb(); const r = await handle(post(body()), () => f.db, env); eq(r.status, 200, 'status');
  eq(f.st.customers.length, 2, 'two records'); const [a, b] = f.st.customers; const ref = f.st.referrals[0];
  eq(b.desk.referred_by.first_name, 'Sam', 'badge'); eq(ref.referrer_customer_id, a.id, 'referrer id'); eq(ref.referred_customer_id, b.id, 'referred id');
  eq(ref.reward_choice, 'credit', 'reward'); eq(ref.status, 'new', 'status'); eq(ref.paid_out_at, undefined, 'not paid'); eq(a.owner_staff_id, null, 'Dan direct'); eq(a.comms_consent_at, undefined, 'no consent'); });
Deno.test('existing people are matched by email or mobile, never overwritten', async () => {
  const f = fakeDb({ customers: [{ id: 'old1', email: 'sam@example.com', name: 'Samuel', desk: { note: 'keep' } }, { id: 'old2', phone: '07700900222', name: 'Alexandra', desk: {} }] });
  eq((await handle(post(body()), () => f.db, env)).status, 200, '200'); eq(f.st.customers.length, 2, 'no new rows');
  eq(f.st.customers[0].name, 'Samuel', 'name kept'); eq(f.st.customers[0].desk.note, 'keep', 'desk kept'); eq(f.st.customers[0].desk.referrals_made.length, 1, 'referral noted');
  eq(f.st.customers[1].desk.referred_by.first_name, 'Sam', 'marked'); eq(f.st.updates.every((u: any) => Object.keys(u).join() === 'desk'), true, 'only desk');
  eq(f.st.referrals[0].referred_customer_id, 'old2', 'linked'); });
Deno.test('same person both sides is refused', async () => {
  const f = fakeDb({ customers: [{ id: 'one', email: 'sam@example.com', phone: '07700900222', desk: {} }] });
  eq((await handle(post(body()), () => f.db, env)).status, 400, 'same'); eq(f.st.referrals.length, 0, 'no referral'); });
Deno.test('validation, honeypot, size, method', async () => { const f = fakeDb();
  eq((await handle(post(body({ reward_preference: '£999' })), () => f.db, env)).status, 400, 'reward');
  eq((await handle(post('{x'), () => f.db, env)).status, 400, 'json');
  eq((await handle(post('x'.repeat(10001)), () => f.db, env)).status, 413, 'size');
  eq((await handle(new Request('http://x/'), () => f.db, env)).status, 405, 'method');
  eq((await (await handle(post(body({ _gotcha: 'b' })), () => f.db, env)).json()).ok, true, 'honeypot ok'); eq(f.st.customers.length, 0, 'nothing saved'); });
Deno.test('rate limit: 6th in an hour refused; store down refuses', async () => { const f = fakeDb();
  for (let i = 0; i < 5; i++) eq((await handle(post(body({ referrer_email: i + '@example.com', referrer_phone: '0770090030' + i, friend_phone: '0770090040' + i })), () => f.db, env)).status, 200, 'ok ' + i);
  eq((await handle(post(body()), () => f.db, env)).status, 429, '6th'); eq((await handle(post(body(), '2.2.2.2'), () => f.db, env)).status, 200, 'other network');
  const g = fakeDb({ rpcErr: true }); eq((await handle(post(body()), () => g.db, env)).status, 503, '503'); eq(g.st.customers.length, 0, 'none'); });
Deno.test('save failure reported', async () => { const f = fakeDb({ insErr: true }); eq((await handle(post(body()), () => f.db, env)).status, 500, '500'); });
