/* Guest swipe mode: everything the guest-deck edge function decides, kept pure so node tests can run it with
   a fake database. The guest only ever gets car cards back. Never a name, phone, email, budget or preference. */
import { verifyGuest } from './unsub.js';
export const GUEST_DAYS = 30;
export const RATE_PER_MIN = 120;
/* the only car fields a guest can see (all public on the Hedin listing anyway) */
const CAR_KEYS = ['reg', 'kind', 'model', 'series', 'year', 'mileage', 'fuel', 'gearbox', 'colour', 'body', 'power', 'seats', 'price', 'image', 'images', 'listing_url', 'source', 'description', 'order_number'];
export function guestCard(c, finance) {
  const o = {}; CAR_KEYS.forEach(k => { if (c[k] != null && c[k] !== '') o[k] = k === 'images' ? (c.images || []).slice(0, 8) : c[k]; });
  if (o.kind === 'new_stock') delete o.listing_url;
  if (o.listing_url && !/^https:\/\/(www\.)?hedinautomotive\.co\.uk\//.test(o.listing_url)) delete o.listing_url;
  if (finance) o.finance = { headline: finance.headline, example: finance.example, legal: finance.legal || '' };   // only with the full representative example
  return o;
}
/* deck order: the cars in the latest email first (still in stock), then other current matches */
export function guestDeck(M, cars, cust, emailedRegs, n) {
  const ranked = M.pickLatest(cars, cust, n || 40), seen = new Set(), out = [];
  const byReg = new Map(cars.map(c => [c.reg, c]));
  (emailedRegs || []).forEach(r => { const c = byReg.get(r); if (c && (!c.status || c.status === 'in_stock') && !seen.has(r)) { seen.add(r); out.push(c); } });
  ranked.forEach(x => { if (!seen.has(x.car.reg)) { seen.add(x.car.reg); out.push(x.car); } });
  return out.map(c => guestCard(c, M.finance(c)));
}
/* checks every request: token valid and not expired, link not revoked, customer not closed or unsubscribed, rate */
export async function guestGate(secret, tok, db) {
  const v = await verifyGuest(secret, tok);
  if (!v) return { status: 401, error: 'link not valid' };
  if (v.expired) return { status: 410, error: 'link expired' };
  const cu = await db.customer(v.id);
  if (!cu || cu.closed_at || cu.email_opt_out || (cu.guest_version | 0) !== v.ver) return { status: 410, error: 'link no longer active' };
  const hits = await db.hit(v.id);
  if (hits > RATE_PER_MIN) return { status: 429, error: 'slow down' };
  return { ok: true, cu };
}
const REG = /^[A-Z0-9-]{2,20}$/i;
/* Confirm your details (Revvy in the guest page). The link may have been forwarded, so contact details are
   never shown: a mobile is 'ending 789', an email is 'l***@g***.com', name and postcode are never sent.
   Preferences are low risk and shown as 'Dan has you down for', budget only as a rough band. */
export function maskPhone(p) { const d = String(p || '').replace(/\D/g, ''); return d.length >= 6 ? 'a mobile ending ' + d.slice(-3) : ''; }
export function maskEmail(e) { const m = /^([^@\s])[^@\s]*@([^@.\s])[^@\s]*?(\.[a-z.]{2,})$/i.exec(String(e || '')); return m ? `${m[1]}***@${m[2]}***${m[3]}` : ''; }
function band(n, step) { const lo = Math.floor(n / step) * step; return [lo, lo + step]; }
export function budgetText(c) {
  if (c.budget_type === 'cash' && c.cash_gbp > 0) { const [a, b] = band(c.cash_gbp, 5000); return `around \u00a3${a.toLocaleString('en-GB')} to \u00a3${b.toLocaleString('en-GB')}`; }
  if (c.budget_type === 'monthly' && c.monthly_gbp > 0) { const [a, b] = band(c.monthly_gbp, 100); return `around \u00a3${a} to \u00a3${b} a month`; }
  return '';
}
const FUEL = { petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Electric' };
/* Car preferences the guest can review and change with Revvy (low risk, saved straight to the customer).
   Option lists come from the same rules as the main app, and anything outside them is dropped. */
export const BODY_OPTS = [['any', 'Any'], ['small', 'Small and easy'], ['hatchback', 'Hatchback'], ['saloon', 'Saloon'], ['estate', 'Touring'], ['suv', 'SUV'], ['family', 'Family space'], ['coupe', 'Coupe or convertible']];
export const NEWUSED_OPTS = [['used', 'Used'], ['new', 'Brand new'], ['both', 'Either']];
export const FUEL_OPTS = [['petrol', 'Petrol'], ['diesel', 'Diesel'], ['hybrid', 'Hybrid'], ['electric', 'Electric']];
export function prefOptions(M, cars) {
  const seen = {}, models = [];
  (cars || []).forEach(c => { if (c.series && !seen[c.series]) { seen[c.series] = 1; models.push(c.series); } });
  models.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return { models, colours: M.FAMILY.map(x => x[0]), specs: M.specOptions().map(o => [o.key, o.label]), fuel: FUEL_OPTS,
    mileage: Object.keys(M.MILEAGE_BANDS).map(k => [k, M.MILEAGE_BANDS[k].label]), body: BODY_OPTS, new_used: NEWUSED_OPTS };
}
export function prefValues(c, M) {
  const arr = v => Array.isArray(v) ? v.slice() : [];
  return { models: arr(c.models), models_must: arr(c.models_must), colours: arr(c.colours).filter(x => x !== 'Any'), colours_must: arr(c.colours_must), specs: arr(c.specs), specs_must: arr(c.specs_must),
    fuel: M.fuelList(c.fuel), mileage_bands: arr(c.mileage_bands), body: c.body || 'any', new_used: c.new_used || 'both' };
}
/* validate a guest's preference answers against the option lists; returns the patch and a plain English change list */
export function cleanPrefs(body, cur, opts) {
  const pick = (v, allowed, max) => Array.isArray(v) ? [...new Set(v.map(String))].filter(x => allowed.includes(x)).slice(0, max || 40) : null;
  const keys = l => l.map(x => Array.isArray(x) ? x[0] : x), patch = {}, changes = [];
  const lab = (l, k) => { const f = l.find(x => (Array.isArray(x) ? x[0] : x) === k); return f ? (Array.isArray(f) ? f[1] : f) : k; };
  const tri = (k, mk, list, name) => { if (!(k in body)) return; const on = pick(body[k], keys(list)), must = pick(body[mk] || [], keys(list)); if (!on) return;
    const m2 = must.filter(x => on.includes(x)); const before = JSON.stringify([[...cur[k]].sort(), [...cur[mk]].sort()]), after = JSON.stringify([[...on].sort(), [...m2].sort()]);
    if (before !== after) { patch[k] = on; patch[mk] = m2; changes.push(`${name}: must have ${m2.map(x => lab(list, x)).join(', ') || 'none'}; would like ${on.filter(x => !m2.includes(x)).map(x => lab(list, x)).join(', ') || 'none'}`); } };
  tri('models', 'models_must', opts.models, 'Models'); tri('colours', 'colours_must', opts.colours, 'Colours'); tri('specs', 'specs_must', opts.specs, 'Spec');
  if ('fuel' in body) { const f = pick(body.fuel, keys(opts.fuel)); if (f && JSON.stringify([...f].sort()) !== JSON.stringify([...cur.fuel].sort())) { patch.fuel = f.join(',') || 'open'; changes.push('Fuel: ' + (f.map(x => lab(opts.fuel, x)).join(', ') || 'Open minded')); } }
  if ('mileage_bands' in body) { const b = pick(body.mileage_bands, keys(opts.mileage)); if (b && JSON.stringify([...b].sort()) !== JSON.stringify([...cur.mileage_bands].sort())) { patch.mileage_bands = b; changes.push('Mileage: ' + (b.map(x => lab(opts.mileage, x)).join(', ') || 'Any')); } }
  ['body', 'new_used'].forEach(k => { if (k in body && keys(opts[k]).includes(String(body[k])) && String(body[k]) !== cur[k]) { patch[k] = String(body[k]); changes.push((k === 'body' ? 'Body or size: ' : 'New or used: ') + lab(opts[k], patch[k])); } });
  return { patch, changes };
}
export function guestHints(c, M) {
  const must = c.models_must || [], like = (c.models || []).filter(m => must.indexOf(m) < 0), fuels = M.fuelList(c.fuel);
  return { phone_hint: maskPhone(c.phone), email_hint: maskEmail(c.email), has_phone: !!maskPhone(c.phone), has_email: !!maskEmail(c.email),
    prefs: { models_must: must, models_like: like, fuel: fuels.length ? fuels.map(f => FUEL[f] || f).join(', ') : 'Open minded',
      colours: (c.colours || []).filter(x => x !== 'Any'), body: c.body && c.body !== 'any' ? c.body : '', budget: budgetText(c) } };
}
const PHONE = /^(\+?44|0)7\d{9}$/, EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$/i;
const clean = (s, n) => String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, n);
export async function guestHandle(body, deps) {
  const { secret, db, M, loadCars } = deps;
  const g = await guestGate(secret, body && body.t, db);
  if (!g.ok) return { status: g.status, body: { error: g.error } };
  const cu = g.cu, act = body.action || 'deck';
  if (act === 'deck') {
    const cars = await loadCars();
    const deck = guestDeck(M, cars, cu, await db.emailedRegs(cu.id), 40);
    const sw = await db.swipes(cu.id);
    return { status: 200, body: { cars: deck, swiped: sw, owner_wa: await db.ownerWa(cu) } };
  }
  if (act === 'swipe') {
    if (!REG.test(String(body.reg || '')) || typeof body.liked !== 'boolean') return { status: 400, body: { error: 'bad swipe' } };
    await db.swipe(cu.id, String(body.reg), body.liked);
    return { status: 200, body: { ok: true } };
  }
  if (act === 'buy' || act === 'send') {
    const cars = await loadCars(), byReg = new Map(cars.map(c => [c.reg, c]));
    const regs = (act === 'buy' ? [body.reg] : body.regs || []).map(String).filter(r => REG.test(r)).slice(0, 20);
    const picked = regs.map(r => byReg.get(r)).filter(Boolean);
    if (!picked.length) return { status: 400, body: { error: 'no cars' } };
    await db.buyRequest(cu.id, act, picked.map(c => ({ reg: c.reg, model: c.model, price: c.price || '', kind: c.kind || 'used' })));
    return { status: 200, body: { ok: true } };
  }
  if (act === 'hints') { const cars = await loadCars(); return { status: 200, body: Object.assign(guestHints(cu, M), { values: prefValues(cu, M), options: prefOptions(M, cars) }) }; }
  if (act === 'prefs') {
    const cars = await loadCars(), r = cleanPrefs(body || {}, prefValues(cu, M), prefOptions(M, cars));
    if (Object.keys(r.patch).length) await db.savePrefs(cu.id, r.patch, r.changes);
    return { status: 200, body: { ok: true, changed: r.changes.length } };
  }
  if (act === 'confirm') {
    const phone = clean(body.phone, 20).replace(/[\s()-]/g, ''), email = clean(body.email, 254).toLowerCase(), name = clean(body.name, 60), note = clean(body.prefs_note, 500);
    if (phone && !PHONE.test(phone)) return { status: 400, body: { error: 'phone' } };
    if (email && !EMAIL.test(email)) return { status: 400, body: { error: 'email' } };
    /* missing phone or email: filled straight in. A different one from what is on file: held for Dan to apply,
       because a forwarded link must not be able to take over someone's contact details. Name never overwritten. */
    const fill = {}, proposed = {};
    if (phone) { if (!String(cu.phone || '').trim()) fill.phone = phone; else if (phone.replace(/\D/g, '').slice(-9) !== String(cu.phone).replace(/\D/g, '').slice(-9)) proposed.phone = phone; }
    if (email) { if (!String(cu.email || '').trim()) fill.email = email; else if (email !== String(cu.email).toLowerCase()) proposed.email = email; }
    if (name) proposed.name = name;
    const upd = { at: new Date().toISOString(), confirmed: { phone: !!body.phone_ok, email: !!body.email_ok, prefs: !!body.prefs_ok }, proposed, filled: Object.keys(fill), prefs_note: note || '' };
    await db.confirm(cu.id, fill, upd);
    return { status: 200, body: { ok: true, filled: Object.keys(fill), held: Object.keys(proposed).filter(k => k !== 'name') } };
  }
  return { status: 400, body: { error: 'unknown action' } };
}
