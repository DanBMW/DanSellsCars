// deno test swipe-drive/tests/funnel_lead.test.ts : funnel-lead against a fake database (no network, no keys)
import { handle } from '../backend/supabase/functions/_shared/funnel-lead.ts';
const env = (_: string) => '';
function fakeDb(o: any = {}) {
  const st: any = { hits: {}, customers: o.customers || [], claims: [], updates: [], likes: [] };
  const q = (t: string) => { const f: any = { t, filt: {} };
    const api: any = { select: () => api, ilike: (_c: string, v: string) => { st.likes.push(v); f.like = v; return api; }, is: () => api, order: () => api, limit: () => api, eq: () => api,
      maybeSingle: async () => ({ data: st.customers.find((c: any) => c.email === f.like.replace(/\\/g, '')) || null }),
      single: async () => (o.claimErr ? { error: { message: 'x' } } : { data: { id: 'claim-' + (st.claims.length - 1) } }),
      insert: (r: any) => { if (t === 'customers') { if (o.insErr) return Promise.resolve({ error: { message: 'x' } }); st.customers.push(r); return Promise.resolve({}); } st.claims.push(r); return api; },
      update: (r: any) => { st.updates.push(r); return { eq: async () => ({}) }; } };
    return api; };
  return { st, db: { rpc: async (_n: string, a: any) => o.rpcErr ? { error: {} } : { data: (st.hits[a.k] = (st.hits[a.k] || 0) + 1) }, from: q } };
}
const body = (x: any = {}) => JSON.stringify({ name: 'Alex', phone: '07700900123', email: 'alex@example.com', consent: true, answers: { models: ['X5'] }, ...x });
const post = (b: string, ip = '1.1.1.1') => new Request('http://x/', { method: 'POST', body: b, headers: { 'x-forwarded-for': ip } });
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(m + ': ' + a + ' != ' + b); };
Deno.test('new lead: record with consent, Dan owns it, claim link', async () => {
  const f = fakeDb(); const r = await handle(post(body()), () => f.db, env); const j = await r.json();
  eq(r.status, 200, 'status'); eq(j.url.includes('?claim=claim-0#signin'), true, 'claim url'); const c = f.st.customers[0];
  eq(c.owner_staff_id, null, 'owner'); eq(c.user_id, null, 'user'); eq(!!c.comms_consent_at, true, 'consent'); eq(c.desk.enquiry.source, 'find-my-bmw', 'enquiry'); eq(f.st.claims[0].email, 'alex@example.com', 'claim email'); });
Deno.test('no consent, bad phone, bad json, too large, wrong method', async () => {
  const f = fakeDb();
  eq((await handle(post(body({ consent: false })), () => f.db, env)).status, 400, 'consent');
  eq((await handle(post(body({ phone: '999' })), () => f.db, env)).status, 400, 'phone');
  eq((await handle(post('{nope'), () => f.db, env)).status, 400, 'json');
  eq((await handle(post('x'.repeat(20001)), () => f.db, env)).status, 413, 'size');
  eq((await handle(new Request('http://x/', { method: 'GET' }), () => f.db, env)).status, 405, 'method');
  eq(f.st.customers.length, 0, 'nothing saved'); });
Deno.test('honeypot looks fine, saves nothing', async () => { const f = fakeDb(); const j = await (await handle(post(body({ _gotcha: 'bot' })), () => f.db, env)).json(); eq(j.ok, true, 'ok'); eq(f.st.customers.length, 0, 'nothing'); });
Deno.test('rate limit: the 6th in an hour from one network is refused, others unaffected', async () => {
  const f = fakeDb(); for (let i = 0; i < 5; i++) eq((await handle(post(body({ email: 'a' + i + '@example.com' })), () => f.db, env)).status, 200, 'ok ' + i);
  eq((await handle(post(body({ email: 'z@example.com' })), () => f.db, env)).status, 429, '6th'); eq(f.st.customers.length, 5, 'five saved');
  eq((await handle(post(body({ email: 'y@example.com' }), '2.2.2.2'), () => f.db, env)).status, 200, 'other network'); });
Deno.test('rate limit store down: refuses, writes nothing', async () => { const f = fakeDb({ rpcErr: true }); eq((await handle(post(body()), () => f.db, env)).status, 503, '503'); eq(f.st.customers.length, 0, 'none'); });
Deno.test('duplicate email: never overwritten, enquiry marked repeat, alert merged', async () => {
  const f = fakeDb({ customers: [{ id: 'old', email: 'alex@example.com', user_id: 'u1', name: 'Original', desk: { alerts: [{ model: 'X5', specs: [] }, { model: 'i4' }], note: 'keep' } }] });
  const j = await (await handle(post(body({ name: 'Hijack' })), () => f.db, env)).json();
  eq(j.claim, false, 'claimed record gets plain sign in'); eq(f.st.customers.length, 1, 'no new row'); eq(f.st.customers[0].name, 'Original', 'name kept');
  const u = f.st.updates[0]; eq(Object.keys(u).join(), 'desk', 'only desk updated'); eq(u.desk.enquiry.repeat, true, 'repeat'); eq(u.desk.note, 'keep', 'desk kept'); eq(u.desk.alerts.length, 2, 'alerts deduped'); });
Deno.test('email wildcards are escaped', async () => { const f = fakeDb(); await handle(post(body({ email: 'a_b%c@example.com' })), () => f.db, env); eq(f.st.likes[0], 'a\\_b\\%c@example.com', 'escaped'); });
Deno.test('save failure is reported, no claim', async () => { const f = fakeDb({ insErr: true }); eq((await handle(post(body()), () => f.db, env)).status, 500, '500'); eq(f.st.claims.length, 0, 'no claim'); });
