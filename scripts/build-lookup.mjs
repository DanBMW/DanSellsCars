#!/usr/bin/env node
/* Builds the hidden used car lookup from the stock files the morning routine
   already refreshes. No dependencies; Node 18 or newer.

     node scripts/build-lookup.mjs          (run from anywhere)

   Reads
     automation/hedin-stock-snapshot.json   Dan's forecourt (Ruxley)
     automation/hedin-group-stock.json      the rest of the group's BMWs
     automation/stock-finance.json          lender quotes, keyed by listing id
     automation/car-details.json            gallery photos, keyed by listing id
   Writes
     lookup/stock.json                      every car, keyed by normalised reg
     lookup/reg/<REG>.json                  one file per car (404 = not in stock)
   and deletes any lookup/reg/*.json whose car has left both lists.

   Rules: only fields the source files really hold, null where they hold
   nothing, never a guess. A car in both lists is the forecourt's. A finance
   quote is copied exactly as stored, and only while it is live (inside its own
   valid_to); a lapsed or missing quote is null. Per reg files carry no run
   timestamp, so a car that has not changed is not rewritten and the daily diff
   shows only arrivals, departures and real changes. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTO = path.join(ROOT, 'automation');
const OUT = path.join(ROOT, 'lookup');
const REG_DIR = path.join(OUT, 'reg');
const CDN = 'https://cdne-cdn-prod-polaris-prod.azureedge.net/vehicles/';

const read = (f, fallback) => {
  const p = path.join(AUTO, f);
  if (!fs.existsSync(p)) {
    if (fallback !== undefined) { console.warn(`missing ${f}, carrying on without it`); return fallback; }
    throw new Error(`missing ${f}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

export const normReg = (r) => String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const str = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).replace(/\u00a0/g, ' ').trim());
const num = (v) => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return s.replace(/[^0-9]/g, '') === '' || !Number.isFinite(n) ? null : n;
};

function live(f) {
  if (!f || !f.monthly) return false;
  if (f.valid_to && new Date(f.valid_to) < new Date()) return false;
  return true;
}

/* The representative example in the site's own wording (dsfinance.js
   repExample), built only from the stored figures. */
const gbp0 = (n) => '£' + Math.round(n).toLocaleString('en-GB');
const gbp2 = (n) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function repExample(f) {
  return f.payments + ' monthly payments of ' + gbp2(f.monthly) + '. '
    + 'Cash price ' + gbp0(f.price) + '. Customer deposit ' + gbp2(f.deposit) + '. '
    + 'Total amount of credit ' + gbp2(f.credit) + '. '
    + 'Optional final payment ' + gbp2(f.final_payment) + '. '
    + 'Total amount payable ' + gbp2(f.total_payable) + '. '
    + 'Duration ' + f.term + ' months. '
    + Number(f.annual_mileage).toLocaleString('en-GB') + ' miles a year, '
    + f.excess_pence + 'p per excess mile. '
    + f.apr + '% APR representative. Lender ' + f.lender + '. '
    + 'Finance subject to status, 18+, UK residents.';
}

function photos(car, det) {
  const gallery = [];
  for (let u of (det && Array.isArray(det.images) ? det.images : [])) {
    if (!u) continue;
    if (!String(u).startsWith('http')) u = CDN + u + '-enlarged.jpg';
    if (!gallery.includes(u)) gallery.push(u);
  }
  const main = str(car.image) || gallery[0] || null;
  const extras = gallery.filter((u) => u !== main);
  return { image: main, images: extras.length ? extras : null };
}

function record(car, source, fin, det) {
  const reg = normReg(car.reg);
  const f = fin[String(car.id)];
  const { image, images } = photos(car, det[String(car.id)]);
  return {
    reg,
    model: str(car.model),
    series: str(car.series),
    year: num(car.year),
    mileage: str(car.mileage),
    mileage_miles: num(car.mileage),
    colour: str(car.colour),
    fuel: str(car.fuel),
    body: str(car.body),
    gearbox: str(car.gearbox),
    drive: str(car.drive),
    seats: num(car.seats),
    doors: num(car.doors),
    power: str(car.power),
    trim: str(car.trim),
    price: str(car.price),
    price_gbp: num(car.price),
    image,
    images,
    listing_url: str(car.url),
    listing_id: str(car.id),
    source,
    finance: live(f) && normReg(f.reg || reg) === reg
      ? { ...f, representative_example: repExample(f) }
      : null,
  };
}

function main() {
  const forecourt = read('hedin-stock-snapshot.json');
  const group = read('hedin-group-stock.json', []);
  const fin = read('stock-finance.json', {});
  const det = read('car-details.json', {});
  if (!Array.isArray(forecourt) || forecourt.length === 0) {
    throw new Error('forecourt snapshot is empty or not a list; refusing to publish an empty lookup');
  }

  const cars = {};
  let nF = 0, nG = 0, skipped = 0;
  for (const c of forecourt) {
    const r = normReg(c.reg);
    if (!r) { skipped++; continue; }
    if (cars[r]) continue;
    cars[r] = record(c, 'forecourt', fin, det); nF++;
  }
  for (const c of group) {
    const r = normReg(c.reg);
    if (!r) { skipped++; continue; }
    if (cars[r]) continue;                      /* forecourt wins */
    cars[r] = record(c, 'group', fin, det); nG++;
  }

  const sorted = Object.fromEntries(Object.keys(cars).sort().map((k) => [k, cars[k]]));
  fs.mkdirSync(REG_DIR, { recursive: true });

  let written = 0, unchanged = 0, removed = 0;
  for (const [r, car] of Object.entries(sorted)) {
    const p = path.join(REG_DIR, r + '.json');
    const body = JSON.stringify(car, null, 1) + '\n';
    if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === body) { unchanged++; continue; }
    fs.writeFileSync(p, body); written++;
  }
  for (const f of fs.readdirSync(REG_DIR)) {
    if (!f.endsWith('.json')) continue;
    if (!sorted[f.slice(0, -5)]) { fs.unlinkSync(path.join(REG_DIR, f)); removed++; }
  }

  const all = {
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    count: nF + nG,
    counts: { forecourt: nF, group: nG },
    cars: sorted,
  };
  fs.writeFileSync(path.join(OUT, 'stock.json'), JSON.stringify(all) + '\n');

  console.log(`lookup: ${nF + nG} cars (forecourt ${nF}, group ${nG})`
    + `${skipped ? `, ${skipped} without a reg skipped` : ''}; `
    + `reg files written ${written}, unchanged ${unchanged}, removed ${removed}`);
}

main();
