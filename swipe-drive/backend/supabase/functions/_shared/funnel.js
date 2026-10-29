/* Find my BMW funnel answers -> a SwipeToDrive customers row. Pure functions, shared by the funnel-lead edge function
   and the tests. Only known values pass; everything else is dropped. The customer's own consent is required. */
const SERIES = { '1': '1 Series', '2c': '2 Series', '2gc': '2 Series', '2at': '2 Series', '3': '3 Series', '3t': '3 Series', '4c': '4 Series', '4gc': '4 Series', '4cv': '4 Series',
  '5': '5 Series', '5t': '5 Series', '7': '7 Series', X1: 'X1', X2: 'X2', X3: 'X3', X4: 'X4', X5: 'X5', X6: 'X6', X7: 'X7', XM: 'XM', i4: 'i4', i5: 'i5', i7: 'i7',
  iX1: 'iX1', iX2: 'iX2', iX3: 'iX3', iX: 'iX', Z4: 'Z4' };
const FUEL = { petrol: 'petrol', diesel: 'diesel', hybrid: 'hybrid', phev: 'hybrid', electric: 'electric' };
const BODY = { suv: 'suv', saloon: 'saloon', touring: 'estate', coupe: 'coupe', gran_coupe: 'coupe', hatchback: 'hatchback' };
const SPEC = { heated: 'feat:heated', pano: 'feat:pano', hud: 'feat:hud', sound: 'feat:sound', keyless: 'feat:keyless', acc: 'feat:acc', xdrive: 'feat:xdrive', towbar: 'feat:towbar', seven: 'feat:seven' };
const MILES = { u6: 5000, '6to10': 8000, '10to15': 12500, '15plus': 18000 };
const WHEN = { now: 'now', month: 'month', quarter: 'quarter', browsing: 'browsing' };
const COLOURS = ['Black', 'White', 'Grey', 'Silver', 'Blue', 'Red', 'Green'];
export const CONSENT = "Set me up on SwipeToDrive, Dan's app, with these answers. I agree that Dan Cane at Hedin Ruxley can contact me by WhatsApp, phone call or app notification when a car that matches them comes into stock. I can stop at any time by replying STOP on WhatsApp, or in SwipeToDrive under Me, Stock alerts.";
const arr = (a) => (Array.isArray(a) ? a : []).map(String).slice(0, 30);
const uniq = (a) => [...new Set(a)];
const num = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
export function phone07(p) { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('44')) d = '0' + d.slice(2); return /^07\d{9}$/.test(d) ? d : null; }
export function validate(b) {
  b = b || {};
  if (b._gotcha) return 'spam';
  if (b.consent !== true) return 'consent';
  const name = String(b.name || '').trim();
  if (!name || name.length > 40 || /[<>@]/.test(name)) return 'name';
  if (!phone07(b.phone)) return 'phone';
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/.test(email) || email.length > 120) return 'email';
  return null;
}
export function toCustomer(b, now) {
  const a = (b && b.answers) || {}, at = now || new Date().toISOString();
  const models = uniq(arr(a.models).map((v) => SERIES[v]).filter(Boolean));
  const mOnly = arr(a.models).includes('M');
  const fuel = uniq(arr(a.fuel).map((v) => FUEL[v]).filter(Boolean));
  const body = uniq(arr(a.body).map((v) => BODY[v]).filter(Boolean));
  const specs = uniq(arr(a.extras).map((v) => SPEC[v]).filter(Boolean)), must = uniq(arr(a.must).map((v) => SPEC[v]).filter(Boolean)).filter((k) => specs.includes(k));
  const row = { name: String(b.name).trim().slice(0, 40), phone: phone07(b.phone), email: String(b.email).trim().toLowerCase(),
    models, specs, specs_must: must, colours: arr(a.colours).filter((c) => COLOURS.includes(c)),
    fuel: fuel.length ? fuel.join(',') : 'open', body: body.length === 1 ? body[0] : 'any',
    new_used: a.interest === 'new' ? 'new' : a.interest === 'used' ? 'used' : 'both',
    comms_consent_at: at, comms_consent_text: CONSENT };
  if (a.pay === 'monthly') { row.budget_type = 'monthly'; const mo = num(a.mo, 50, 5000); if (mo) row.monthly_gbp = mo; const dep = num(a.dep, 0, 200000); if (dep != null) row.deposit_gbp = dep; }
  else if (a.pay === 'cash') { row.budget_type = 'cash'; const c = num(a.cash, 1000, 500000); if (c) row.cash_gbp = c; }
  if (MILES[a.miles]) row.annual_mileage = MILES[a.miles];
  const src = String(b.source || 'find-my-bmw').replace(/[^a-z0-9_-]/gi, '').slice(0, 30) || 'find-my-bmw';
  row.desk = { lead_source: src, when: WHEN[a.when] || undefined, m_only: mOnly || undefined,
    enquiry: { source: src, at, first_name: row.name.split(' ')[0], actioned_at: null },
    alerts: models.map((m) => ({ model: m, specs: must, new_used: row.new_used, at, source: src })) };
  return row;
}
