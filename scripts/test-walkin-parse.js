#!/usr/bin/env node
/*
 * Runs walkins-appscript.gs for real, against sample emails.
 *
 * Google's APIs are stubbed just enough to execute the actual file - this is
 * not a reimplementation of the parsing, it is the parsing, so a change to
 * the .gs is covered here the moment it is made.
 *
 * Add a real (anonymised) arrival email and pick-up email to SAMPLES below
 * and run `node scripts/test-walkin-parse.js` to see exactly what the screen
 * would show, without deploying anything.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GS = path.join(__dirname, '..', 'walkins-appscript.gs');

/* ---- sample mailbox --------------------------------------------------- */
const T = Date.parse('2026-09-16T10:28:00Z');
const min = m => T + m * 60000;

const SAMPLES = {
  inbox: [
    { at: min(-18), subject: 'New walk-in logged',
      body: 'Customer name: Mr Patel\nEnquiry: Used 3 Series\nLogged by: Reception' },
    { at: min(-11), subject: 'Appointment arrived - Ms Okafor',
      body: 'Customer name: Ms Okafor\nAppointment time: 10:15\nBooked with: Dan\nStatus: Arrived' },
    { at: min(-2),  subject: 'New walk-in logged',
      body: 'Customer name: Mr Whitfield\nEnquiry: Part exchange' },
    /* a duplicate notification for somebody already here - must not restart
       their timer, and must not appear twice */
    { at: min(-1),  subject: 'New walk-in logged (reminder)',
      body: 'Customer name: Mr Patel\nEnquiry: Used 3 Series' }
  ],
  seen: [
    { at: min(-9), subject: 'Ms Okafor - now with sales executive',
      body: 'Customer name: Ms Okafor\nNow with: Dan' },
    /* YESTERDAY somebody with the same name was seen. This must not mark
       today's arrival as already being served. */
    { at: min(-1440), subject: 'Mr Whitfield - now with sales executive',
      body: 'Customer name: Mr Whitfield\nNow with: Charlie' }
  ]
};

/* ---- the smallest Google that will run the file ----------------------- */
function msg(m) {
  return {
    getId:        () => 'm' + m.at + (m.subject || '').length,
    getDate:      () => new Date(m.at),
    getSubject:   () => m.subject || '',
    getPlainBody: () => m.body || ''
  };
}
const store = {};
function makeSandbox(mailbox) {
  return {
    GmailApp: {
      search(query) {
        /* the stub only has to tell the two searches apart, which `in:inbox`
           does - that is the real distinction the script relies on */
        const set = query.includes('in:inbox') ? mailbox.inbox : mailbox.seen;
        return set.map(m => ({ getMessages: () => [msg(m)] }));
      }
    },
    CacheService: {
      getScriptCache: () => ({ get: k => store[k] || null,
                               put: (k, v) => { store[k] = v; } })
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: k => store[k] || null,
                                    setProperty: (k, v) => { store[k] = v; } })
    },
    ContentService: {
      MimeType: { JSON: 'json', JAVASCRIPT: 'js' },
      createTextOutput: t => ({ _t: t, setMimeType() { return this; },
                                getContent() { return this._t; } })
    },
    Logger: { log: () => {} },
    Date, Math, JSON, String, Number, RegExp, Array, Object, isNaN
  };
}

function load(mailbox) {
  const sandbox = makeSandbox(mailbox);
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(GS, 'utf8'), sandbox, { filename: 'walkins-appscript.gs' });
  return sandbox;
}

/* ---- checks ----------------------------------------------------------- */
let bad = 0;
const ok = (label, cond, detail) => {
  console.log('  %s %s%s', cond ? 'ok  ' : 'FAIL', label, detail ? '  -> ' + detail : '');
  if (!cond) bad++;
};

console.log('\nWhat the screen would show from these emails:\n');
const s = load(SAMPLES);
const rows = s.scan();
rows.forEach(r => {
  console.log('   ' + r.customerName.padEnd(14) + r.type.padEnd(13) +
    'arrived ' + new Date(r.arrivalTime).toISOString().slice(11, 16) + '   ' +
    (r.status === 'with-staff' ? 'NOW WITH ' + r.assignedTo
      : (r.bookedWith ? 'here for ' + r.bookedWith : 'waiting')));
});

console.log('\nChecks:\n');
const by = n => rows.filter(r => r.customerName === n);

ok('three people, not four (a duplicate is not a second card)', rows.length === 3,
   rows.length + ' cards');
ok('names parsed, not falling back to "Walk-in"',
   rows.every(r => !['Walk-in', 'Appointment'].includes(r.customerName)),
   rows.map(r => r.customerName).join(', '));
ok('the booked customer is typed as an appointment',
   by('Ms Okafor')[0] && by('Ms Okafor')[0].type === 'appointment');
ok('...and carries who it was booked with',
   by('Ms Okafor')[0] && by('Ms Okafor')[0].bookedWith === 'Dan',
   by('Ms Okafor')[0] && by('Ms Okafor')[0].bookedWith);
ok('a pick-up after the arrival shows as "now with"',
   by('Ms Okafor')[0] && by('Ms Okafor')[0].status === 'with-staff'
     && by('Ms Okafor')[0].assignedTo === 'Dan',
   by('Ms Okafor')[0] && by('Ms Okafor')[0].assignedTo);
ok('a walk-in nobody has picked up is still waiting',
   by('Mr Patel')[0] && by('Mr Patel')[0].status === 'waiting');
ok("YESTERDAY's pick-up does NOT mark today's arrival as served",
   by('Mr Whitfield')[0] && by('Mr Whitfield')[0].status === 'waiting',
   by('Mr Whitfield')[0] && by('Mr Whitfield')[0].status);
ok('a duplicate email keeps the FIRST arrival time (timer does not restart)',
   by('Mr Patel')[0] && by('Mr Patel')[0].arrivalTime === min(-18),
   by('Mr Patel')[0] && new Date(by('Mr Patel')[0].arrivalTime).toISOString().slice(11, 16));

/* archiving the arrival email clears the card */
const archived = { inbox: SAMPLES.inbox.filter(m => !/Patel/.test(m.body)), seen: SAMPLES.seen };
ok('archiving the arrival email takes that person off the screen',
   load(archived).scan().every(r => r.customerName !== 'Mr Patel'));

/* the web app itself */
const t = load(SAMPLES);
t.PropertiesService.getScriptProperties().setProperty('TOKEN', 'letmein');
const noTok = JSON.parse(t.doGet({ parameter: {} }).getContent());
ok('a missing token is refused', noTok.error === 'bad token');
const good = JSON.parse(t.doGet({ parameter: { token: 'letmein' } }).getContent());
ok('the right token gets the list', Array.isArray(good.appointments)
   && good.appointments.length === 3);
const jsonp = t.doGet({ parameter: { token: 'letmein', callback: 'cb1' } }).getContent();
ok('JSONP is wrapped in the callback', jsonp.startsWith('cb1(') && jsonp.endsWith(');'));
const nasty = t.doGet({ parameter: { token: 'letmein', callback: 'alert(1)//' } }).getContent();
ok('a junk callback name is not echoed back', !nasty.includes('alert(1)'));

/* nothing in the mailbox at all */
ok('an empty mailbox is an empty screen, not a crash',
   load({ inbox: [], seen: [] }).scan().length === 0);

console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall checks pass\n');
process.exit(bad ? 1 : 0);
