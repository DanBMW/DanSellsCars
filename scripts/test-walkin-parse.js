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
const T = new Date(); T.setHours(13, 28, 0, 0);
const min = m => T.getTime() + m * 60000;

/* The banner the mail gateway staples on the front of every external
   message. It is in the real emails, so it is in the test. */
const BANNER = `This Message Is From an External Sender
This message came from outside your organization.
Report Suspicious
`;

/* Verbatim from the real notifications, names as supplied. */
const arrival = (name, at, type, models) => BANNER +
`A walk-in has just been checked-in and needs to be seen by a sales exec.

Customer: ${name}
Arrived: ${at}
Car type: ${type}
Models of interest: ${models}
Logged by: Lisa Debono
Thank You.`;

const pickup = (exec, name, at, type, models) => BANNER +
`${exec} has taken the walk-in customer ${name}.

Customer: ${name}
Sales executive: ${exec}
Assigned by: Lisa Debono
Arrived: ${at}
Car type: ${type}
Models of interest: ${models}`;

const SAMPLES = {
  inbox: [
    { at: min(-52), subject: 'Walk-in checked in',
      body: arrival('Jay', '12:36', 'New', '1 Series, 2 Series, 3 Series') },
    { at: min(-105), subject: 'Walk-in checked in',
      body: arrival('Chris', '10:43', 'Used', '4 Series') },
    /* a second Chris, later the same morning - the pick-up below belongs to
       the FIRST one, and must not clear this one */
    { at: min(-8), subject: 'Walk-in checked in',
      body: arrival('Chris', '13:20', 'Used', 'X3') },
    /* the same notification arriving twice */
    { at: min(-50), subject: 'Walk-in checked in (resend)',
      body: arrival('Jay', '12:36', 'New', '1 Series, 2 Series, 3 Series') }
  ],
  seen: [
    { at: min(-100), subject: 'Walk-in taken',
      body: pickup('Clive Ankomah', 'Chris', '10:43', 'Used', '4 Series') }
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
const jay = by('Jay')[0];
const chrises = by('Chris');

ok('the customer name is the NAME, not the "Arrived:" line',
   !!jay && jay.customerName === 'Jay',
   rows.map(r => r.customerName).join(', '));
ok('three cards - the resent notification is not a fourth', rows.length === 3,
   rows.length + ' cards');
ok('walk-ins are typed as walk-ins, not appointments',
   rows.every(r => r.type === 'walk-in'));
ok('nobody is wrongly shown as booked with an executive',
   rows.every(r => !r.bookedWith));
ok("reception's recorded time is used, not the email's timestamp",
   !!jay && new Date(jay.arrivalTime).getHours() === 12
         && new Date(jay.arrivalTime).getMinutes() === 36,
   jay && new Date(jay.arrivalTime).toTimeString().slice(0, 5));
ok('what they came in for is captured',
   !!jay && jay.carType === 'New'
         && jay.models === '1 Series, 2 Series, 3 Series',
   jay && (jay.carType + ' / ' + jay.models));
ok('the executive who took them is named in full',
   chrises.some(c => c.assignedTo === 'Clive Ankomah'),
   chrises.map(c => c.assignedTo || '-').join(', '));
ok('BOTH Chrises are on the board', chrises.length === 2);
ok('the pick-up clears the 10:43 Chris...',
   chrises.filter(c => new Date(c.arrivalTime).getMinutes() === 43)
          .every(c => c.status === 'with-staff'));
ok('...and NOT the 13:20 Chris who is still waiting',
   chrises.filter(c => new Date(c.arrivalTime).getMinutes() === 20)
          .every(c => c.status === 'waiting'),
   chrises.map(c => new Date(c.arrivalTime).toTimeString().slice(0,5)
                    + '=' + c.status).join(', '));
ok('Jay has nobody with him yet', !!jay && jay.status === 'waiting');
ok('a resent notification keeps the first arrival time',
   !!jay && new Date(jay.arrivalTime).getMinutes() === 36);

/* archiving the arrival email clears the card */
const archived = { inbox: SAMPLES.inbox.filter(m => !/Customer: Jay/.test(m.body)), seen: SAMPLES.seen };
ok('archiving the arrival email takes that person off the screen',
   load(archived).scan().every(r => r.customerName !== 'Jay'));

/* the web app itself */
const t = load(SAMPLES);
t.PropertiesService.getScriptProperties().setProperty('TOKEN', 'letmein');
const noTok = JSON.parse(t.doGet({ parameter: {} }).getContent());
ok('a missing token is refused', noTok.error === 'bad token');
const good = JSON.parse(t.doGet({ parameter: { token: 'letmein' } }).getContent());
ok('the right token gets the list', Array.isArray(good.appointments)
   && good.appointments.length === 3, good.appointments.length + ' rows');
const jsonp = t.doGet({ parameter: { token: 'letmein', callback: 'cb1' } }).getContent();
ok('JSONP is wrapped in the callback', jsonp.startsWith('cb1(') && jsonp.endsWith(');'));
const nasty = t.doGet({ parameter: { token: 'letmein', callback: 'alert(1)//' } }).getContent();
ok('a junk callback name is not echoed back', !nasty.includes('alert(1)'));

/* nothing in the mailbox at all */
ok('an empty mailbox is an empty screen, not a crash',
   load({ inbox: [], seen: [] }).scan().length === 0);

console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall checks pass\n');
process.exit(bad ? 1 : 0);
