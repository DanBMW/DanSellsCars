#!/usr/bin/env node
/* One-shot seed for Showroom cover practice testing.
 * Writes ONLY to lockupTest/reception/<today-UK>/{am,mid,pm} so Dan can
 * exercise decline / I am here / unable on reception.html?test=1.
 * Does not touch live lockup/, does not send email, does not change TEST_ONLY.
 *
 * Env: FIREBASE_SA (service account JSON). Run via seed-reception-practice.yml.
 */
'use strict';

const admin = require('firebase-admin');
const RR = require('../reception-rota.js');
const LR = require('../lockup-rota.js');

const DB_URL = 'https://forecourt-1b6bc-default-rtdb.europe-west1.firebasedatabase.app';
const PERSON = process.env.SEED_PERSON_ID || 'dan';
const ROOT = RR.RECEPTION_ROOT; /* lockupTest while TEST_ONLY */

async function main() {
  if (!process.env.FIREBASE_SA) {
    console.error('FIREBASE_SA missing');
    process.exit(1);
  }
  if (ROOT !== 'lockupTest') {
    console.error('Refusing to seed: RECEPTION_ROOT is', ROOT, '(expected lockupTest)');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)),
    databaseURL: DB_URL
  });
  const db = admin.database();
  const n = LR.london(new Date());
  const date = n.date;
  const dowNum = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }[n.dow];
  const shifts = RR.shiftsFor(dowNum);

  if (!shifts.length) {
    console.log('No reception shifts for', date, n.dow, '- nothing to seed');
    await admin.app().delete();
    return;
  }

  const base = ROOT + '/reception/' + date;
  const before = (await db.ref(base).get()).val() || {};
  console.log('Seeding practice path', base);
  console.log('Before:', JSON.stringify(summarize(before, shifts)));

  const ts = Date.now();
  const updates = {};
  for (const s of shifts) {
    updates[s.id] = {
      personId: PERSON,
      status: 'assigned',
      ts
    };
  }
  updates['_day'] = Object.assign({}, before._day || {}, { plannedAt: ts, seededPractice: ts });

  await db.ref(base).update(updates);

  const after = (await db.ref(base).get()).val() || {};
  const summary = summarize(after, shifts);
  console.log('After:', JSON.stringify(summary));

  const ok = shifts.every(s => after[s.id] && after[s.id].personId === PERSON && after[s.id].status === 'assigned');
  if (!ok) {
    console.error('Seed verification failed');
    await admin.app().delete();
    process.exit(1);
  }
  console.log('OK seeded', date, 'personId=' + PERSON, 'shifts=' + shifts.map(s => s.id).join(','));
  console.log('Live lockup/ untouched. Emails not sent.');
  await admin.app().delete();
}

function summarize(day, shifts) {
  const out = { _day: day._day || null };
  for (const s of shifts) {
    const r = day[s.id] || null;
    out[s.id] = r ? { personId: r.personId || null, status: r.status || null } : null;
  }
  return out;
}

main().catch(e => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
