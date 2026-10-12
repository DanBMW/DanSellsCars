// The lender's own BMW Select (PCP) quote for every new car, and its VIN.
//
// Each car's page on stock.bmw.co.uk loads a BMW Financial Services quote
// (served by Codeweavers) when a normal visitor opens it. This opens each page
// once, in headless Chrome, one at a time with a pause, and records what the
// browser was sent: the plain VIN (Vehicle.Physical.Vin) and the PCP quote the
// page itself asked for (£4,500 deposit, 48 months, 10,000 miles a year).
//
// Hard rules (CLAUDE.md, "New car lender quotes"):
//  - the locator's vin/iv are never decrypted, only passed through in the url;
//  - nothing is requested that the page does not request itself, and no key,
//    token or quote id is written anywhere;
//  - every figure is the lender's own; nothing here calculates a payment.
//
//   python3 automation/new-stock-urls.py > /tmp/ns-urls.json
//   node automation/new-stock-quotes.mjs /tmp/ns-urls.json
//
// Writes lookup/new-stock-quotes.json keyed by order number. A car whose page
// gives no PCP quote today keeps yesterday's only while its ValidTo is still
// in the future; new-cars.html applies its own checks on top.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer-core');

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'lookup', 'new-stock-quotes.json');
const urls = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const limit = +(process.env.LIMIT || 0) || urls.length;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let prev = {};
try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).quotes || {}; } catch (e) {}

function pick(t) {
  const pr = t && t.Finance && t.Finance.Product, q = t && t.Finance && t.Finance.Quote;
  if (!pr || pr.Key !== 'PCP' || !q || !(q.RegularPayment > 0)) return null;
  return {
    product: 'BMW Select (PCP)', lender: pr.Lender || null,
    monthly: q.RegularPayment, payments: q.TotalNumberOfRegularPayments,
    term_months: q.Term, cash_price: q.TotalPrice, deposit: q.TotalDeposit,
    deposit_contribution: q.TotalContribution || 0, amount_of_credit: q.Balance,
    final_payment: q.Residual, total_payable: q.TotalAmountPayable,
    charge_for_credit: q.ChargesForCredit, annual_mileage: q.AnnualMileage,
    excess_pence: q.ExcessMileageRate, apr: q.Apr,
    valid_to: q.ValidTo, quoted_at: q.QuotedAt
  };
}

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const quotes = {};
let got = 0, vins = 0;
for (const r of urls.slice(0, limit)) {
  const pg = await browser.newPage();
  await pg.setRequestInterception(true);
  pg.on('request', q => ['image', 'media', 'font'].includes(q.resourceType()) ? q.abort() : q.continue());
  const rec = { vin: null, quote: null };
  pg.on('response', async x => {
    if (!/codeweavers\.net\/api\/finance\/quote\//i.test(x.url())) return;
    let t; try { t = JSON.parse(await x.text()); } catch (e) { return; }
    const v = t && t.Vehicle && t.Vehicle.Physical && t.Vehicle.Physical.Vin;
    if (v && /^W[A-Z0-9]{16}$/.test(v)) rec.vin = v;
    const p = pick(t); if (p) rec.quote = p;
  });
  try {
    await pg.goto(r.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(2500);
  } catch (e) { console.log(r.order, 'page did not settle:', e.message); }
  await pg.close();
  const old = prev[r.order];
  if (rec.quote) { got++; quotes[r.order] = { vin: rec.vin, ...rec.quote, fetched_at: new Date().toISOString() }; }
  else if (old && Date.parse(old.valid_to) > Date.now()) quotes[r.order] = old;
  else if (rec.vin) quotes[r.order] = { vin: rec.vin };
  if (rec.vin) vins++;
  console.log(r.order, rec.vin || 'no vin', rec.quote ? rec.quote.monthly : 'no quote');
  await sleep(3000);
}
await browser.close();
if (got < Math.min(10, limit) / 2) { console.log('only', got, 'quotes, keeping the old file'); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), source: 'stock.bmw.co.uk vehicle pages, BMW Financial Services quote as loaded by the page', count: got, quotes }, null, 1) + '\n');
console.log(`${vins} VINs, ${got} quotes, written to ${OUT}`);
