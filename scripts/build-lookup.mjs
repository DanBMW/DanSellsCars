#!/usr/bin/env node
/* Builds the hidden used car lookup from the stock files the morning routine
   already refreshes. No dependencies; Node 18 or newer.

     node scripts/build-lookup.mjs          (run from anywhere)

   Reads
     automation/hedin-stock-snapshot.json   Dan's forecourt (Ruxley)
     automation/hedin-group-stock.json      the rest of the group's BMWs
     automation/stock-finance.json          lender quotes, keyed by listing id
     automation/car-details.json            gallery photos, keyed by listing id
     lookup/_history.json                   the ledger this script keeps
   Writes
     lookup/stock.json                      cars in stock today, keyed by reg
     lookup/recent.json                     cars that left in the last 30 days
     lookup/reg/<REG>.json                  one file per car, in stock or recent
     lookup/_history.json                   first_seen, last_seen, removed_at

   Rules: only fields the source files really hold, null where they hold
   nothing, never a guess. A car in both lists is the forecourt's. A finance
   quote is copied exactly as stored, and only while it is live (inside its own
   valid_to); a lapsed or missing quote is null.

   A car that leaves stock keeps its reg file for 30 days: its last known data,
   status "removed", removed_at (the London date this script first found it
   gone), available_until (removed_at + 30 days) and finance null. The file and
   its ledger entry are deleted once today is past available_until. A car that
   comes back is in_stock again with fresh data and removed_at cleared.

   Idempotent: per reg files carry no run timestamp, and generated_at only
   moves when the content changes or on the first run of a new London day, so a
   second run on the same day writes nothing.

   Guard: if today's stock looks broken (fewer than LOOKUP_MIN_CARS cars, 50 by
   default, or more than LOOKUP_MAX_DROP of the cars in stock last run gone at
   once, 0.4 by default), it writes nothing and exits 1 rather than mark good
   cars as removed.

   LOOKUP_TODAY=YYYY-MM-DD overrides the date, for tests. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTO = path.join(ROOT, 'automation');
const OUT = path.join(ROOT, 'lookup');
const REG_DIR = path.join(OUT, 'reg');
const LEDGER = path.join(OUT, '_history.json');
const CDN = 'https://cdne-cdn-prod-polaris-prod.azureedge.net/vehicles/';
const KEEP_DAYS = 30;
const MIN_CARS = Number(process.env.LOOKUP_MIN_CARS || 50);
const MAX_DROP = Number(process.env.LOOKUP_MAX_DROP || 0.4);

function fail(msg) {
  console.error('build-lookup: ' + msg + '. Nothing was written.');
  process.exit(1);
}

function londonToday() {
  const o = process.env.LOOKUP_TODAY;
  if (o) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o) || isNaN(Date.parse(o + 'T00:00:00Z'))) fail(`LOOKUP_TODAY "${o}" is not YYYY-MM-DD`);
    return o;
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const londonDateOf = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readAuto = (f) => {
  const p = path.join(AUTO, f);
  if (!fs.existsSync(p)) fail(`missing automation/${f}`);
  try { return readJson(p); } catch (e) { fail(`automation/${f} is not valid JSON (${e.message})`); }
};
const readOptional = (p, fallback) => {
  if (!fs.existsSync(p)) return fallback;
  try { return readJson(p); } catch (e) { fail(`${path.relative(ROOT, p)} is not valid JSON (${e.message})`); }
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
    status: 'in_stock',
    removed_at: null,
    available_until: null,
  };
}

/* Last known data, marked removed. Status fields always sit at the end. */
function removedRecord(last, removedAt) {
  const { status, removed_at, available_until, ...rest } = last;
  return { ...rest, finance: null, status: 'removed', removed_at: removedAt, available_until: addDays(removedAt, KEEP_DAYS) };
}

const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

/* Writes only when the bytes differ. Returns true if it wrote. */
function writeIfChanged(p, body) {
  if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === body) return false;
  fs.writeFileSync(p, body);
  return true;
}

/* A file with generated_at: keep the previous stamp when nothing else changed
   and it was stamped today (London), so a second run the same day is a no op. */
function writeStamped(p, payload, today) {
  const prev = readOptional(p, null);
  if (prev && prev.generated_at && londonDateOf(prev.generated_at) === today) {
    const { generated_at, ...rest } = prev;
    if (JSON.stringify(rest) === JSON.stringify(payload)) return false;
  }
  const stamp = process.env.LOOKUP_TODAY ? today + 'T12:00:00Z' : new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return writeIfChanged(p, JSON.stringify({ generated_at: stamp, ...payload }) + '\n');
}

function main() {
  const today = londonToday();
  const forecourt = readAuto('hedin-stock-snapshot.json');
  const group = readAuto('hedin-group-stock.json');
  const fin = readAuto('stock-finance.json');
  const det = readOptional(path.join(AUTO, 'car-details.json'), {});
  if (!Array.isArray(forecourt) || forecourt.length === 0) fail('the forecourt snapshot is empty or not a list');
  if (!Array.isArray(group)) fail('the group stock file is not a list');

  /* Today's stock. */
  const cars = {};
  let nF = 0, nG = 0, skipped = 0;
  for (const [list, source] of [[forecourt, 'forecourt'], [group, 'group']]) {
    for (const c of list) {
      const r = normReg(c.reg);
      if (!r) { skipped++; continue; }
      if (cars[r]) continue;                    /* forecourt wins */
      cars[r] = record(c, source, fin, det);
      if (source === 'forecourt') nF++; else nG++;
    }
  }
  const total = nF + nG;
  if (total < MIN_CARS) fail(`only ${total} cars in today's stock (minimum ${MIN_CARS}); the stock files look broken`);

  const ledger = readOptional(LEDGER, null) || {};
  const wasLive = Object.keys(ledger).filter((r) => !ledger[r].removed_at);
  const goneNow = wasLive.filter((r) => !cars[r]);
  if (wasLive.length && goneNow.length / wasLive.length > MAX_DROP) {
    fail(`${goneNow.length} of the ${wasLive.length} cars in stock last run are missing today (more than ${Math.round(MAX_DROP * 100)}%); the stock files look broken`);
  }

  fs.mkdirSync(REG_DIR, { recursive: true });

  /* Reg files on disk with no ledger entry (the first build, or a file put back
     by hand): adopt them. One that already says removed keeps its date; one
     that does not is treated as found gone today. */
  for (const f of fs.readdirSync(REG_DIR)) {
    if (!f.endsWith('.json')) continue;
    const r = f.slice(0, -5);
    if (ledger[r] || cars[r]) continue;
    let last = null;
    try { last = readJson(path.join(REG_DIR, f)); } catch (e) { /* unreadable: deleted below */ }
    ledger[r] = { first_seen: null, last_seen: null,
      removed_at: last && last.status === 'removed' && last.removed_at ? last.removed_at : today };
  }

  const recent = {};
  const files = {};                             /* reg -> record to write */
  let added = 0, back = 0, gone = 0, expired = 0;

  for (const [r, car] of Object.entries(cars)) {
    const e = ledger[r];
    if (!e) { ledger[r] = { first_seen: today, last_seen: today, removed_at: null }; added++; }
    else {
      if (e.removed_at) back++;
      ledger[r] = { first_seen: e.first_seen || today, last_seen: today, removed_at: null };
    }
    files[r] = car;
  }

  for (const r of Object.keys(ledger)) {
    if (cars[r]) continue;
    const e = ledger[r];
    if (!e.removed_at) { e.removed_at = today; gone++; }
    const until = addDays(e.removed_at, KEEP_DAYS);
    const p = path.join(REG_DIR, r + '.json');
    let last = null;
    if (today <= until && fs.existsSync(p)) {
      try { last = readJson(p); } catch (err) { last = null; }
    }
    if (today > until || !last) {               /* past its 30 days, or nothing to show */
      delete ledger[r];
      if (fs.existsSync(p)) fs.unlinkSync(p);
      expired++;
      continue;
    }
    const rec = removedRecord(last, e.removed_at);
    files[r] = rec;
    recent[r] = rec;
  }

  let written = 0;
  for (const [r, rec] of Object.entries(files)) {
    if (writeIfChanged(path.join(REG_DIR, r + '.json'), JSON.stringify(rec, null, 1) + '\n')) written++;
  }
  /* Anything else in reg/ is not a car we know about. */
  for (const f of fs.readdirSync(REG_DIR)) {
    if (f.endsWith('.json') && !files[f.slice(0, -5)]) { fs.unlinkSync(path.join(REG_DIR, f)); expired++; }
  }

  const s1 = writeStamped(path.join(OUT, 'stock.json'),
    { count: total, counts: { forecourt: nF, group: nG }, cars: sortKeys(cars) }, today);
  const s2 = writeStamped(path.join(OUT, 'recent.json'),
    { keep_days: KEEP_DAYS, count: Object.keys(recent).length, cars: sortKeys(recent) }, today);
  const s3 = writeIfChanged(LEDGER, JSON.stringify(sortKeys(ledger), null, 1) + '\n');

  console.log(`lookup ${today}: ${total} in stock (forecourt ${nF}, group ${nG})`
    + `${skipped ? `, ${skipped} without a reg skipped` : ''}; `
    + `new ${added}, back in stock ${back}, left stock ${gone}, kept as recent ${Object.keys(recent).length}, deleted ${expired}; `
    + `reg files written ${written}; stock.json ${s1 ? 'written' : 'unchanged'}, recent.json ${s2 ? 'written' : 'unchanged'}, ledger ${s3 ? 'written' : 'unchanged'}`);
}

main();
