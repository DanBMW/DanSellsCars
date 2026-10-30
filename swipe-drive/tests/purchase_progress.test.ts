// deno test swipe-drive/tests/purchase_progress.test.ts : purchase-progress against a fake database (no network, no keys)
import { handle, LIMIT } from '../backend/supabase/functions/_shared/purchase-progress.ts';
const env = (_: string) => '';
const TOK = 'AbCdEfGhIjKlMnOpQrStUvWx';
const CUST = { id: 'c1', name: 'Ann Example', email: 'ann@example.com', phone: '07700900123', postcode: 'DA14 1AA', desk: { notes: 'secret note', purchase_progress: { deposit: true, finance: 'na', order: false, type: 'order', seen: 'no', token: TOK, updated_by_name: 'Dan', updated_at: '2026-10-30T10:00:00Z' } } };
function fakeDb(o: any = {}) { const st: any = { hits: {}, filters: [] };
  const q = () => { const f: any = {}; const api: any = { select: (c: string) => { st.cols = c; return api; }, eq: (c: string, v: string) => { st.filters.push(c); f.v = v; return api; }, is: () => api, limit: () => api,
    maybeSingle: async () => ({ data: [CUST].find((c) => c.desk.purchase_progress.token === f.v) || null }) }; return api; };
  return { st, db: { rpc: async (_n: string, a: any) => o.rpcErr ? { error: {} } : { data: (st.hits[a.key_hash] = (st.hits[a.key_hash] || 0) + 1) }, from: q } }; }
const get = (t: string, ip = '1.1.1.1') => new Request('http://x/?t=' + encodeURIComponent(t), { headers: { 'x-forwarded-for': ip } });
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(m + ': ' + a + ' != ' + b); };
Deno.test('known token returns the live ticks', async () => { const f = fakeDb(); const r = await handle(get(TOK), () => f.db, env); const j = await r.json();
  eq(r.status, 200, 'status'); eq(j.first_name, 'Ann', 'first'); eq(j.deposit, 'yes', 'dep'); eq(j.finance, 'na', 'fin'); eq(j.order, 'no', 'ord'); eq(j.type, 'order', 'type'); eq(j.seen, 'no', 'seen');
  eq(f.st.filters[0], 'desk->purchase_progress->>token', 'filter'); eq(r.headers.get('access-control-allow-origin'), 'https://dan-sells.co.uk', 'cors'); });
Deno.test('no personal data leaks', async () => { const f = fakeDb(); const raw = await (await handle(get(TOK), () => f.db, env)).text();
  eq(Object.keys(JSON.parse(raw)).sort().join(','), 'deposit,finance,first_name,ok,order,seen,type', 'only allowed keys');
  for (const s of ['Example', 'ann@', '07700', 'DA14', 'secret', TOK, 'c1', 'Dan', '2026']) eq(raw.includes(s), false, 'leak ' + s); });
Deno.test('unknown or malformed token', async () => { const f = fakeDb();
  eq((await handle(get('ZZZZZZZZZZZZZZZZZZZZZZZZ'), () => f.db, env)).status, 404, 'unknown');
  eq((await handle(get('short'), () => f.db, env)).status, 400, 'short');
  eq((await handle(get("x' or 1=1 --xxxxxxxxxxxxxx"), () => f.db, env)).status, 400, 'injection');
  eq((await handle(new Request('http://x/?t=' + TOK, { method: 'POST' }), () => f.db, env)).status, 405, 'method'); });
Deno.test('rate limit per network', async () => { const f = fakeDb();
  for (let i = 0; i < LIMIT; i++) eq((await handle(get(TOK), () => f.db, env)).status, 200, 'under');
  eq((await handle(get(TOK), () => f.db, env)).status, 429, 'over'); eq((await handle(get(TOK, '2.2.2.2'), () => f.db, env)).status, 200, 'other ip');
  eq(Object.keys(f.st.hits).every((k) => /^[0-9a-f]{64}$/.test(k)), true, 'hashed'); });
Deno.test('limiter down fails closed', async () => { const f = fakeDb({ rpcErr: 1 }); eq((await handle(get(TOK), () => f.db, env)).status, 503, '503'); });
