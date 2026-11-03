// Local stand in for the guest-deck edge function: the real shared logic (_shared/guest.js) with an in memory
// database and the local stock files. Usage: node tests/guest_mock_server.mjs PORT  (prints a valid token)
import fs from 'fs'; import http from 'http';
globalThis.window = globalThis;
const R = new URL('../../', import.meta.url).pathname;
(0, eval)(fs.readFileSync(R + 'stock-core.js', 'utf8')); (0, eval)(fs.readFileSync(R + 'swipe-drive/match-core.js', 'utf8')); (0, eval)(fs.readFileSync(R + 'dsfinance.js', 'utf8'));
const { guestHandle } = await import('../backend/supabase/functions/_shared/guest.js');
const { signGuest } = await import('../backend/supabase/functions/_shared/unsub.js');
const M = globalThis.ctMatch, SECRET = 'local-test-secret-0123456789abcdef', PORT = +process.argv[2] || 8799;
const CID = '11111111-2222-3333-4444-555555555555';
const cust = { id: CID, name: 'Lorna Hayre', phone: '07700900111', email: 'lorna@example.com', models: ['3 Series', 'X3', '5 Series', 'X1'], models_must: [], fuel: 'petrol,hybrid,diesel', budget_type: 'monthly', monthly_gbp: 450, guest_version: 0, closed_at: null, email_opt_out: false };
const st = JSON.parse(fs.readFileSync(R + 'lookup/stock.json', 'utf8')); let cars = Object.values(st.cars);
const ns = JSON.parse(fs.readFileSync(R + 'lookup/new-stock.json', 'utf8')); { const nc = (ns.cars || ns).filter(c => c.order_number).map(M.fromNewStock); M.applyLenderQuotes(nc, JSON.parse(fs.readFileSync(R + 'lookup/new-stock-quotes.json', 'utf8')), globalThis.dsFin); cars = cars.concat(nc); }
const emailed = M.pickLatest(cars, cust, 6).map(x => x.car.reg).reverse();
export const state = { swipes: {}, requests: [], hits: 0 };
if (process.argv[3] === 'nophone') { cust.phone = null; }
if (process.argv[3] === 'nostock') { cust.models = ['M2', '3 Series', 'X3']; cust.models_must = ['M2', '3 Series']; }
const db = { customer: async id => id === CID ? cust : null, hit: async () => { const m = Math.floor(Date.now() / 60000); if (state.min !== m) { state.min = m; state.hits = 0; } return ++state.hits; }, emailedRegs: async () => emailed,
  swipes: async () => Object.fromEntries(Object.entries(state.swipes).map(([k, v]) => [k, v.liked])), ownerWa: async () => '447827138197',
  swipe: async (id, reg, liked) => { state.swipes[reg] = { liked, source: 'guest_link' }; }, buyRequest: async (id, act, c) => { state.requests.push({ act, cars: c }); },
  savePrefs: async (id, patch, changes) => { Object.assign(cust, patch); state.prefs = { patch, changes }; },
  confirm: async (id, fill, upd) => { Object.assign(cust, fill); state.confirm = upd; } };
const tok = await signGuest(SECRET, CID, 0, Math.floor(Date.now() / 1000) + 30 * 86400);
http.createServer((req, res) => {
  const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(200, H); return res.end(); }
  if (req.url.startsWith('/_state')) { res.writeHead(200, H); return res.end(JSON.stringify(state)); }
  if (req.url.startsWith('/_close')) { cust.closed_at = new Date().toISOString(); cust.guest_version++; res.writeHead(200, H); return res.end('{}'); }
  let b = ''; req.on('data', d => b += d); req.on('end', async () => {
    const r = await guestHandle(JSON.parse(b || '{}'), { secret: SECRET, db, M, loadCars: async () => cars });
    res.writeHead(r.status, H); res.end(JSON.stringify(r.body)); });
}).listen(PORT, () => console.log('TOKEN ' + tok));
