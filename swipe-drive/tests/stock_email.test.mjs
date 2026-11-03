// Latest stock email: wording, reply links, unsubscribe, finance rule, signed tokens. Usage: node tests/stock_email.test.mjs
import fs from 'fs';
globalThis.window = globalThis;
(0, eval)(fs.readFileSync(new URL('../../stock-core.js', import.meta.url), 'utf8')); (0, eval)(fs.readFileSync(new URL('../match-core.js', import.meta.url), 'utf8'));
const { renderStockEmail, OPENING, REPLIES } = await import('../backend/supabase/functions/_shared/stock-email.js');
const { signUnsub, verifyUnsub } = await import('../backend/supabase/functions/_shared/unsub.js');
const M = globalThis.ctMatch; let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const used = { kind: 'used', reg: 'AB12CDE', model: 'BMW 320i M Sport', series: '3 Series', fuel: 'Petrol', year: 2023, mileage: '9,000 miles', price: '£30,000', price_gbp: 30000, source: 'forecourt', image: 'https://x/y.jpg', listing_url: 'https://hedinautomotive.co.uk/buy-car/used-cars/1/x', status: 'in_stock' };
const nw = { kind: 'new_stock', reg: 'NEW123', model: 'BMW X1 sDrive20i', series: 'X1', fuel: 'Petrol', price: '£40,000', price_gbp: 40000, image: '' };
const u = { interested: 'https://f/stock-reply?t=1', offmarket: 'https://f/stock-reply?t=2', keepinformed: 'https://f/stock-reply?t=3' };
const m = renderStockEmail({ toName: 'Lorna', items: [{ car: used, finance: M.finance(used) }, { car: nw, finance: null }], replyUrls: u, unsubUrl: 'https://f/unsubscribe?t=x' });
ok(m.html.includes(OPENING) && OPENING.startsWith('Dan at BMW Ruxley has seen some vehicles in stock'), 'opens with the agreed line');
ok(Object.values(REPLIES).every(r => m.html.includes(r.replace(/'/g, "&#39;")) || m.html.includes(r)), 'all three reply buttons present');
ok(m.html.includes('Unsubscribe from these emails'), 'GDPR unsubscribe button present');
ok((m.html.match(/hedinautomotive/g) || []).length === 2, 'Hedin link for the used car only, none for the new order number car');
ok(!/a month/.test(m.html), 'no monthly figure without a full representative example');
let threw = false; try { renderStockEmail({ items: [], replyUrls: u }); } catch (e) { threw = true; } ok(threw, 'refuses to render without an unsubscribe link');
const vis = m.html.replace(/<[^>]+>/g, ' ').replace(/https?:\S+/g, ''); ok(!/[\u2013\u2014]| - /.test(vis), 'no dashes in visible copy');
const id = '11111111-2222-3333-4444-555555555555', sec = 'x'.repeat(32);
for (const p of ['interested', 'offmarket', 'keepinformed', 'custmail']) { const v = await verifyUnsub(sec, await signUnsub(sec, id, p)); ok(v && v.id === id && v.purpose === p, 'signed token round trip: ' + p); }
const t = await signUnsub(sec, id, 'interested'); ok(!(await verifyUnsub(sec, t.replace('interested', 'offmarket'))), 'a token cannot be switched to another button');
const picked = M.pickLatest([used, { ...used, reg: 'SOLD1', status: 'sold' }, { kind: 'new', reg: 'NEW-X', series: '3 Series', model: 'BMW 3 Series' }], { models: ['3 Series'] }, 6);
ok(picked.length === 1 && picked[0].car.reg === 'AB12CDE', 'pickLatest keeps real in stock cars only');
console.log(`\nRESULT stock email ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
