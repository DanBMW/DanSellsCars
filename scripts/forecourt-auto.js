#!/usr/bin/env node
/* Automatic fortnightly forecourt check (Forecourt.html). Runs from the
 * lockup-emails workflow: lockup-mail.js calls run() before it sends its
 * notification queue, so everything this queues goes out in the same run,
 * through the same Gmail sender (lockup/notify, the queue lockup.html already
 * uses). It never sends mail itself.
 *
 * OFF until forecourt/auto/config/enabled is true. Nothing below runs, and
 * nothing is written, while it is false or missing.
 *
 * forecourt/auto/config  { enabled, start: '2026-10-26', everyDays: 14,
 *                          sandbox (true: data in forecourtTest/, every email
 *                          to Dan only), fuelDaily (default true) }
 *
 * On a cycle Monday (or the next open day if it is a bank holiday), once the
 * morning stock list is today's (or from 09:30 whatever it is), it:
 *   1. archives forecourt/current to forecourt/auto/history/<id>
 *   2. loads the Ruxley stock (the same list "Load today's stock" uses:
 *      lookup/stock.json, source forecourt, in stock) into a fresh current
 *   3. shares the cars equally (counts within 1) across the active execs on
 *      lockup/config/team, rotating so nobody gets a car they had last cycle
 *   4. queues each exec their allocation email (wording from the board's own
 *      "Share with Sales Executives" email). Anyone off that day gets it at
 *      08:00 on their next working day instead.
 * The existing 08:30 reminder (forecourt-mail.js) is the daily follow up. On
 * cycle day it is pre marked as sent so nobody gets two emails, and on an
 * exec's day off (weekly off or a lockup absence) it is skipped for them.
 * When every cycle car is done, inaccessible or gone from stock, it queues
 * the finished report to Will Potter (with the board's CSV attached) and the
 * fuel list to the whole team. forecourt/auto/requests/report (the manager
 * "Send report to Will now" button) queues the report early.
 * Fuel: the check already records "Min 1/4 Tank Fuel" (fuel) and "Fully
 * Charged EV-PHEV" (charged); a NO on either puts the car on the fuel list.
 * Ticks live at <root>/current/fuel/<key> (forecourt-fuel.html).
 * Every queued email has a fixed id (fc_<cycle>_<kind>...), written only if it
 * is not there yet, and the queue marks each one sent: nothing goes twice.
 */
'use strict';
const R = require('../lockup-rota.js');
const BOARD = 'https://dan-sells.co.uk/Forecourt.html';
const FUEL = 'https://dan-sells.co.uk/forecourt-fuel.html';
const TEST_EXEC = 'daniel.cane@hedinautomotive.co.uk';
const WILL = 'will.potter@hedinautomotive.co.uk';
const CHECK_IDS = ['soldboard', 'clean', 'fuel', 'charged', 'aircon', 'radio', 'satnav', 'bt', 'personal', 'receipts', 'tyre', 'aid', 'mileage', 'warning', 'profile', 'priceboard'];
const CHECK_LABELS = ['Sold Board in Window?', 'Clean Inside and Out', 'Min 1/4 Tank Fuel', 'Fully Charged EV-PHEV', 'Aircon Off', 'Radio Off', 'No Address in Sat Nav', 'No Phones Paired', 'No Personal Items', 'No Receipts in Glovebox', 'Tyre Inflator Kit / Spare Wheel / Run Flats', 'First Aid Kit Present', 'Mileage Reset', 'No Warning Lights', 'No Profile Set', 'Price Board & AUC Plate Present'];
const START_MINS = 7 * 60 + 30, FALLBACK_MINS = 9 * 60 + 30, FUEL_DAILY_MINS = 9 * 60, LATE_MINS = 19 * 60 + 45;
const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYNAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const regKey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const dispReg = k => { k = regKey(k); return k.length === 7 ? k.slice(0, 4) + ' ' + k.slice(4) : k; };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const dowOf = date => R.london(new Date(date + 'T12:00:00Z')).dow;
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
function niceDate(date, withDay) { const a = date.split('-'); return (withDay === false ? '' : DAYNAMES[dowOf(date)] + ' ') + (+a[2]) + ' ' + MONTHS[+a[1] - 1]; }
function shortDate(date) { const a = date.split('-'); return (+a[2]) + ' ' + MONTHS[+a[1] - 1].slice(0, 3); }
function hm(ts) { return ts ? new Date(ts).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) : ''; }
function when(ts) { if (!ts) return ''; const n = R.london(new Date(ts)); return DAYNAMES[n.dow].slice(0, 3) + ' ' + shortDate(n.date) + ' ' + hm(ts); }
function ukMs(date, mins) { /* ms for a UK wall clock time on a date */
  for (const off of [0, 60, -60]) { const t = Date.parse(date + 'T00:00:00Z') + (mins - off) * 60000; const n = R.london(new Date(t)); if (n.date === date && n.mins === mins) return t; }
  return Date.parse(date + 'T00:00:00Z') + mins * 60000;
}
function dur(ms) { if (!(ms > 0)) return ''; const h = Math.floor(ms / 3600000), d = Math.floor(h / 24); return d ? plural(d, 'day') + (h % 24 ? ' ' + plural(h % 24, 'hour') : '') : h ? plural(h, 'hour') + ' ' + Math.round((ms % 3600000) / 60000) + ' min' : Math.round(ms / 60000) + ' min'; }

/* ---- the schedule ---- */
function isOpen(date, hol) { return dowOf(date) !== 'sun' && !(hol || {})[date]; }
function scheduledOn(cfg, date) { /* the cycle date this date belongs to, or null before the first */
  const start = cfg.start || '2026-10-26', every = +cfg.everyDays || 14;
  if (date < start) return null;
  return R.addDays(start, Math.floor(daysBetween(start, date) / every) * every);
}
function startDayFor(scheduled, hol) { let d = scheduled; for (let i = 0; i < 6 && !isOpen(d, hol); i++) d = R.addDays(d, 1); return d; }
function nextCycles(cfg, fromDate, count, hol) {
  const every = +cfg.everyDays || 14, out = [];
  let s = scheduledOn(cfg, fromDate); if (!s || startDayFor(s, hol) < fromDate) s = s ? R.addDays(s, every) : (cfg.start || '2026-10-26');
  for (let i = 0; i < count; i++) { out.push({ scheduled: s, start: startDayFor(s, hol) }); s = R.addDays(s, every); }
  return out;
}

/* ---- who is in ---- */
function offReason(person, date, absences) {
  const dow = dowOf(date), ab = R.absentOn(absences || {}, date)[person.id];
  if (ab) return ab === 'holiday' ? 'on holiday' : 'off';
  if (person.off === dow) return 'on your day off';
  if (R.arr(person.never).indexOf(dow) >= 0) return 'off';
  return '';
}
function firstInDay(person, from, absences, hol) { let d = from; for (let i = 0; i < 14; i++, d = R.addDays(d, 1)) if (isOpen(d, hol) && !offReason(person, d, absences)) return d; return from; }
function pickExecs(team, absences, start, hol) {
  /* active team with an email, unless away every open day of the first week */
  return Object.keys(team || {}).map(id => Object.assign({ id }, team[id])).filter(t => t && t.active !== false && t.name)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id))
    .filter(t => { for (let i = 0; i < 6; i++) { const d = R.addDays(start, i); if (isOpen(d, hol) && !R.absentOn(absences || {}, d)[t.id]) return true; } return false; });
}
const execKey = name => String(name).replace(/\s/g, '_');
const initials = p => String(p.fullName || p.name).split(' ').map(x => x[0] || '').join('').toUpperCase().slice(0, 2);

/* ---- the allocation: counts within 1, extras to people in on day one, rotate, avoid last cycle's cars ---- */
function allocate(cars, execs, prevOwner, index, inToday) {
  const k = execs.length; if (!k) return {};
  const n = cars.length, base = Math.floor(n / k), extra = n % k;
  const rot = execs.map((e, i) => execs[(i + index) % k]);
  const order = rot.filter(e => inToday[e.name]).concat(rot.filter(e => !inToday[e.name]));
  const target = {}; order.forEach((e, i) => { target[e.name] = base + (i < extra ? 1 : 0); });
  const alloc = {}; rot.forEach(e => { alloc[e.name] = []; });
  let p = 0;
  cars.forEach(c => { for (let t = 0; t < k; t++) { const e = rot[(p + t) % k]; if (alloc[e.name].length < target[e.name]) { alloc[e.name].push(c); p = (p + t + 1) % k; return; } } });
  /* swap away any car going back to whoever had it last time */
  const owner = {}; Object.keys(alloc).forEach(nm => alloc[nm].forEach(c => { owner[c] = nm; }));
  for (let pass = 0; pass < 3; pass++) {
    let bad = 0;
    cars.forEach(c => {
      const e = owner[c]; if (!prevOwner[c] || prevOwner[c] !== e) return;
      const d = cars.find(x => owner[x] !== e && prevOwner[x] !== e && prevOwner[c] !== owner[x]);
      if (!d) { bad++; return; }
      const f = owner[d];
      alloc[e][alloc[e].indexOf(c)] = d; alloc[f][alloc[f].indexOf(d)] = c; owner[c] = f; owner[d] = e;
    });
    if (!bad) break;
  }
  return alloc;
}

/* ---- reading the board ---- */
function carRows(cur, stock) {
  const vehicles = (cur && cur.vehicles) || {}, answers = (cur && cur.answers) || {}, execs = (cur && cur.execs) || {};
  const ownerOf = {}; Object.values(execs).forEach(e => ((e && e.cars) || []).forEach(k => { ownerOf[k] = e.name; }));
  return Object.keys(vehicles).map(k => Object.assign({ key: k }, vehicles[k])).sort((a, b) => (a.order || 0) - (b.order || 0)).map(v => {
    const a = answers[v.key] || {}, s = stock[v.key] || {};
    const fails = CHECK_IDS.filter(id => id !== 'soldboard' && a[id] === 'no').map(id => CHECK_LABELS[CHECK_IDS.indexOf(id)]);
    const sold = a.soldboard === 'yes', gone = !s.reg && v.src === 'stock';
    let state = v.status === 'done' ? (sold ? 'sold' : fails.length ? 'issues' : 'clear') : v.status === 'inaccessible' ? 'inaccessible' : gone ? 'gone' : v.status === 'in-progress' ? 'in-progress' : 'pending';
    return { key: v.key, reg: v.reg || dispReg(v.key), model: s.model || v.model || '', colour: s.colour || '', image: s.image || '', owner: ownerOf[v.key] || '', status: v.status, state, sold, fails, notes: a.notes || '', checkedBy: a.checkedBy || '', checkedAt: a.checkedAt || 0, inacc: v.inaccessible || null, fuel: !sold && v.status === 'done' && a.fuel === 'no', charge: !sold && v.status === 'done' && a.charged === 'no' };
  });
}
function fuelList(cur, stock) {
  const ticks = (cur && cur.fuel) || {};
  return carRows(cur, stock).filter(r => r.fuel || r.charge).map(r => Object.assign(r, { tick: ticks[r.key] || null }));
}
const closed = r => r.state !== 'pending' && r.state !== 'in-progress';

/* ---- email shells (the forecourt-mail.js look) ---- */
function shell(title, inner, cta, href, foot) {
  return '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:600px;margin:auto;color:#12263a">' +
    '<div style="background:#0b1220;color:#fff;border-radius:14px 14px 0 0;padding:18px 20px;font-size:18px;font-weight:800">' + title + '</div>' +
    '<div style="border:1px solid #d9e3ee;border-top:0;border-radius:0 0 14px 14px;padding:20px">' + inner +
    (cta ? '<a href="' + href + '" style="display:block;text-align:center;background:#4d94d8;color:#fff;text-decoration:none;font-weight:800;padding:14px;border-radius:12px;font-size:17px;margin-top:6px">' + esc(cta) + '</a>' : '') +
    '<p style="color:#6b7a8c;font-size:12px;margin:16px 0 0">' + esc(foot || 'Hedin BMW Ruxley forecourt') + '</p></div></div>';
}
const P = t => '<p style="margin:0 0 12px">' + t + '</p>';
const TD = 'padding:8px 6px;border-bottom:1px solid #edf2f7;';
function carTable(rows, right) {
  return '<table style="width:100%;border-collapse:collapse;margin:6px 0 16px;font-size:14px">' + rows.map(r => '<tr><td style="' + TD + 'font-weight:800;white-space:nowrap">' + esc(r.reg) + '</td><td style="' + TD + 'color:#5f6e7d">' + esc([r.model, r.colour].filter(Boolean).join(', ')) + '</td>' + (right ? '<td style="' + TD + 'text-align:right;color:#5f6e7d;font-size:13px">' + right(r) + '</td>' : '') + '</tr>').join('') + '</table>';
}

/* allocation: wording from Forecourt.html's "Share with Sales Executives" email
   (buildExecShareMessage), with their own cars listed */
function allocationEmail(person, rows, cycle, late) {
  const subject = 'Forecourt checks to complete: ' + plural(rows.length, 'car') + ' for you';
  const intro = "It's that time again! Please complete all forecourt checks as a priority using the link below.";
  const how = 'Open the link, tap your name, and complete all of your allocated cars.';
  const lines = ['Morning ' + person.name + ',', '', intro, '', (late ? 'This fortnight\u2019s check started on ' + niceDate(cycle.start) + ' while you were off. ' : '') + 'You have ' + plural(rows.length, 'car') + ' this fortnight:', '',
    ...rows.map(r => '  * ' + r.reg + (r.model ? ' (' + [r.model, r.colour].filter(Boolean).join(', ') + ')' : '')), '', how,
    'If you cannot get to a car, open it on the board and tap "Car is inaccessible".', '', BOARD, '', 'Hedin BMW Ruxley forecourt'];
  const html = shell('&#128663; ' + esc(subject), P('Morning ' + esc(person.name) + ',') + P(esc(intro)) +
    P((late ? 'This fortnight&rsquo;s check started on ' + esc(niceDate(cycle.start)) + ' while you were off. ' : '') + 'You have <b>' + plural(rows.length, 'car') + '</b> this fortnight:') +
    carTable(rows) + P(esc(how)) + '<p style="margin:0 0 14px;font-size:13px;color:#5f6e7d">If you cannot get to a car, open it on the board and tap &ldquo;Car is inaccessible&rdquo;. You will get a reminder each morning at 08:30 until your cars are done.</p>', 'Open the forecourt board', BOARD);
  return { subject, text: lines.join('\n'), html };
}

/* Will's report: the board's "Copy issues" snapshot (copyIssuesSnapshot) as the
   spine, then every car, who checked it, inaccessible cars and timings, with
   the board's CSV export attached. */
function reportEmail(cur, stock, cycle, early, nowMs) {
  const rows = carRows(cur, stock).filter(r => !cycle.cars || cycle.cars.indexOf(r.key) >= 0 || r.status === 'done' || r.status === 'inaccessible');
  const done = rows.filter(r => r.status === 'done'), issues = rows.filter(r => r.state === 'issues'), clear = rows.filter(r => r.state === 'clear'), sold = rows.filter(r => r.state === 'sold');
  const inacc = rows.filter(r => r.state === 'inaccessible'), gone = rows.filter(r => r.state === 'gone'), open = rows.filter(r => !closed(r));
  const fuel = rows.filter(r => r.fuel || r.charge);
  const times = done.map(r => r.checkedAt).filter(Boolean).sort();
  const startMs = cycle.createdAt || 0, lastMs = Math.max(times[times.length - 1] || 0, ...inacc.map(r => (r.inacc && r.inacc.at) || 0));
  const subject = early ? 'Forecourt check report (sent early): ' + done.length + ' of ' + rows.length + ' checked' : 'Forecourt check complete: ' + niceDate(cycle.start, false) + ', ' + plural(rows.length, 'car');
  const byExec = {}; (cycle.execs || []).forEach(nm => { byExec[nm] = { n: 0, done: 0, inacc: 0, issues: 0, first: 0, last: 0 }; });
  rows.forEach(r => { const o = r.owner || 'Not allocated'; const b = byExec[o] = byExec[o] || { n: 0, done: 0, inacc: 0, issues: 0, first: 0, last: 0 }; b.n++; if (r.status === 'done') { b.done++; if (r.fails.length) b.issues++; if (r.checkedAt) { b.first = b.first ? Math.min(b.first, r.checkedAt) : r.checkedAt; b.last = Math.max(b.last, r.checkedAt); } } if (r.state === 'inaccessible') b.inacc++; });
  /* text: the Copy issues format */
  const L = ['Forecourt Check, ' + niceDate(cycle.start) + (cycle.auto === false ? '' : ' (fortnightly)'), 'Hedin Ruxley', ''];
  if (early) L.push('Sent early by a manager: ' + plural(open.length, 'car') + ' not yet checked.', '');
  if (issues.length) { L.push('\u26a0\ufe0f ' + plural(issues.length, 'car') + ' with issues:', ''); issues.forEach(r => { L.push([r.reg, r.checkedBy, hm(r.checkedAt)].filter(Boolean).join(' \u00b7 ')); r.fails.forEach(f => L.push('  \u2717 ' + f)); if (r.notes) L.push('  Note: ' + r.notes); L.push(''); }); }
  else L.push('\u2705 No issues found', '');
  if (clear.length) L.push('\u2705 ' + plural(clear.length, 'car') + ' all clear');
  if (sold.length) L.push('\ud83c\udf89 ' + plural(sold.length, 'car') + ' sold');
  if (inacc.length) { L.push('', '\ud83d\udeab ' + plural(inacc.length, 'car') + ' inaccessible:'); inacc.forEach(r => L.push('  ' + r.reg + ': ' + ((r.inacc && r.inacc.note) || '') + ' (' + [(r.inacc && r.inacc.by), when(r.inacc && r.inacc.at)].filter(Boolean).join(', ') + ')')); }
  if (gone.length) L.push('', '\ud83d\ude97 ' + plural(gone.length, 'car') + ' left stock before being checked: ' + gone.map(r => r.reg).join(', '));
  if (open.length) L.push('', '\u23f3 ' + plural(open.length, 'car') + ' not yet checked: ' + open.map(r => r.reg + (r.owner ? ' (' + r.owner + ')' : '')).join(', '));
  if (fuel.length) L.push('', '\u26fd ' + plural(fuel.length, 'car') + ' need fuel or charging: ' + fuel.map(r => r.reg).join(', '));
  L.push('', 'Timings: started ' + when(startMs) + (lastMs ? ', last check ' + when(lastMs) : '') + (startMs && lastMs > startMs ? ', ' + dur(lastMs - startMs) + ' in all' : '') + '.', '', 'Who checked what:');
  Object.keys(byExec).forEach(nm => { const b = byExec[nm]; L.push('  ' + nm + ': ' + b.done + ' of ' + b.n + ' checked' + (b.inacc ? ', ' + b.inacc + ' inaccessible' : '') + (b.issues ? ', ' + b.issues + ' with issues' : '') + (b.last ? ', last ' + when(b.last) : '')); });
  L.push('', 'Every car is in the attached spreadsheet. Full report on the board: ' + BOARD, '', 'Hedin BMW Ruxley forecourt');
  /* html */
  const kpi = (n, l, c) => '<td style="width:25%;padding:10px 4px;text-align:center;border:1px solid #d9e3ee;border-radius:10px"><div style="font-size:26px;font-weight:800;color:' + c + '">' + n + '</div><div style="font-size:11px;color:#6b7a8c">' + l + '</div></td>';
  const badge = r => ({ issues: '<span style="color:#c54242;font-weight:800">' + plural(r.fails.length, 'issue') + '</span>', clear: '<span style="color:#2f8f57;font-weight:800">All clear</span>', sold: '<span style="color:#2f8f57;font-weight:800">Sold</span>', inaccessible: '<span style="color:#9a5a00;font-weight:800">Inaccessible</span>', gone: '<span style="color:#5f6e7d;font-weight:800">Left stock</span>', 'in-progress': '<span style="color:#2d6aa8;font-weight:800">In progress</span>', pending: '<span style="color:#5f6e7d;font-weight:800">Not checked</span>' }[r.state]);
  const H2 = t => '<h3 style="font-size:15px;margin:18px 0 6px">' + t + '</h3>';
  let h = (early ? '<p style="margin:0 0 12px;padding:10px 12px;background:#fff8ec;border:1px solid #f2b65c;border-radius:10px;color:#9a5a00;font-weight:700">Sent early by a manager: ' + plural(open.length, 'car') + ' not yet checked.</p>' : P('Hi Will,') + P('Every car on this fortnight&rsquo;s forecourt check is done. Here is the full report.')) +
    '<table style="width:100%;border-collapse:separate;border-spacing:6px 0;margin:0 0 8px"><tr>' + kpi(done.length, 'Checked', '#1f4f82') + kpi(issues.length, 'With issues', issues.length ? '#c54242' : '#2f8f57') + kpi(inacc.length, 'Inaccessible', '#9a5a00') + kpi(fuel.length, 'Need fuel', '#9a5a00') + '</tr></table>' +
    '<p style="margin:8px 0 0;font-size:13px;color:#5f6e7d">Started ' + esc(when(startMs)) + (lastMs ? ' &middot; last check ' + esc(when(lastMs)) : '') + (startMs && lastMs > startMs ? ' &middot; ' + esc(dur(lastMs - startMs)) + ' in all' : '') + '</p>';
  if (issues.length) { h += H2('&#9888;&#65039; ' + plural(issues.length, 'car') + ' with issues'); issues.forEach(r => { h += '<div style="border:1px solid #efb0b0;background:#fff8f8;border-radius:10px;padding:10px 12px;margin:0 0 8px"><b style="font-family:Courier New,monospace">' + esc(r.reg) + '</b> <span style="color:#5f6e7d;font-size:13px">' + esc(r.model) + '</span><div style="font-size:12px;color:#6b7a8c;margin:2px 0 6px">Checked by ' + esc(r.checkedBy || r.owner) + ', ' + esc(when(r.checkedAt)) + '</div>' + r.fails.map(f => '<div style="font-size:13px;color:#c54242">&#10007; ' + esc(f) + '</div>').join('') + (r.notes ? '<div style="margin-top:6px;padding:6px 8px;background:#fffaf0;border-left:3px solid #F0BA6C;font-size:13px;color:#6a5a36">&#128221; ' + esc(r.notes) + '</div>' : '') + '</div>'; }); }
  if (inacc.length) { h += H2('&#128683; ' + plural(inacc.length, 'car') + ' inaccessible'); h += carTable(inacc, r => esc((r.inacc && r.inacc.note) || '') + '<br><span style="font-size:11px">' + esc([(r.inacc && r.inacc.by), when(r.inacc && r.inacc.at)].filter(Boolean).join(', ')) + '</span>'); }
  if (gone.length) { h += H2('&#128663; ' + plural(gone.length, 'car') + ' left stock before being checked'); h += carTable(gone, r => esc(r.owner)); }
  if (open.length) { h += H2('&#9203; ' + plural(open.length, 'car') + ' not yet checked'); h += carTable(open, r => esc(r.owner) + (r.state === 'in-progress' ? ' (in progress)' : '')); }
  if (fuel.length) { h += H2('&#9981; ' + plural(fuel.length, 'car') + ' need fuel or charging'); h += carTable(fuel, r => (r.charge && !r.fuel ? 'Needs charging' : r.charge ? 'Fuel and charge' : 'Needs fuel') + (r.tick ? ', done' : '')) + '<p style="margin:-8px 0 8px;font-size:13px"><a href="' + FUEL + '">The fuel list</a> has been sent to the team.</p>'; }
  h += H2('Who checked what') + '<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="color:#6b7a8c;text-align:left"><th style="' + TD + '">Exec</th><th style="' + TD + '">Checked</th><th style="' + TD + '">Issues</th><th style="' + TD + '">Inaccessible</th><th style="' + TD + '">Last check</th></tr>' +
    Object.keys(byExec).map(nm => { const b = byExec[nm]; return '<tr><td style="' + TD + 'font-weight:800">' + esc(nm) + '</td><td style="' + TD + '">' + b.done + ' of ' + b.n + '</td><td style="' + TD + '">' + (b.issues || '') + '</td><td style="' + TD + '">' + (b.inacc || '') + '</td><td style="' + TD + '">' + esc(when(b.last)) + '</td></tr>'; }).join('') + '</table>';
  h += H2('Every car') + '<table style="width:100%;border-collapse:collapse;font-size:12px"><tr style="color:#6b7a8c;text-align:left"><th style="' + TD + '">Reg</th><th style="' + TD + '">Car</th><th style="' + TD + '">Result</th><th style="' + TD + '">Checked by</th><th style="' + TD + '">When</th></tr>' +
    rows.map(r => '<tr><td style="' + TD + 'font-weight:800;white-space:nowrap">' + esc(r.reg) + '</td><td style="' + TD + 'color:#5f6e7d">' + esc(r.model) + '</td><td style="' + TD + '">' + badge(r) + (r.notes && r.state !== 'issues' ? '<div style="color:#6a5a36">&#128221; ' + esc(r.notes) + '</div>' : '') + '</td><td style="' + TD + '">' + esc(r.checkedBy || (r.inacc && r.inacc.by) || r.owner) + '</td><td style="' + TD + 'white-space:nowrap">' + esc(when(r.checkedAt || (r.inacc && r.inacc.at))) + '</td></tr>').join('') + '</table>' +
    '<p style="margin:12px 0 12px;font-size:13px;color:#5f6e7d">Every car and every answer is in the attached spreadsheet.</p>';
  /* the board's CSV export columns */
  const fmt = ts => ts ? new Date(ts).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const answers = (cur && cur.answers) || {};
  const head = ['Registration', 'Model', 'Result', 'Checked By', 'Checked At', 'Notes', 'Allocated To', 'Inaccessible Note'].concat(CHECK_LABELS);
  const resultOf = r => ({ issues: 'Issues', clear: 'All clear', sold: 'Sold', inaccessible: 'Inaccessible', gone: 'Left stock', 'in-progress': 'In progress', pending: 'Not checked' }[r.state]);
  const csv = [head].concat(rows.map(r => [r.reg, r.model, resultOf(r), r.checkedBy, fmt(r.checkedAt), r.notes, r.owner, (r.inacc && r.inacc.note) || ''].concat(CHECK_IDS.map(id => (answers[r.key] || {})[id] || ''))))
    .map(x => x.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  return { subject, text: L.join('\n'), html: shell('&#128203; ' + esc(subject), h, 'Open the forecourt board', BOARD), csv, csvName: 'forecourt-' + cycle.start + '.csv' };
}

function fuelEmail(list, cycle, daily) {
  const todo = list.filter(r => !r.tick), kind = r => r.charge && !r.fuel ? 'Needs charging' : r.charge ? 'Fuel and charge' : 'Needs fuel';
  const subject = (daily ? 'Still to fuel: ' : 'Fuel run: ') + plural(todo.length, 'car') + (daily ? ' on the forecourt' : ' need fuel');
  const intro = daily ? 'These cars are still showing low on fuel or charge from the forecourt check.' : 'The forecourt check is done. These cars came up low on fuel or charge.';
  const ask = 'When you fuel or charge one, tick it off on the fuel list so nobody else goes out to it.';
  const doneN = list.length - todo.length;
  const text = ['Hi all,', '', intro, '', ...todo.map(r => '  * ' + r.reg + (r.model ? ' (' + r.model + ')' : '') + ': ' + kind(r)), '', doneN ? doneN + ' already ticked off.' : '', ask, '', 'Fuel list: ' + FUEL, '', 'Hedin BMW Ruxley forecourt'].join('\n');
  const html = shell('&#9981; ' + esc(subject), P('Hi all,') + P(esc(intro)) + carTable(todo, r => '<b style="color:' + (r.charge && !r.fuel ? '#2d6aa8' : '#9a5a00') + '">' + kind(r) + '</b>') + (doneN ? '<p style="margin:0 0 12px;font-size:13px;color:#2f8f57;font-weight:700">&#10003; ' + doneN + ' already ticked off</p>' : '') + P(esc(ask)), 'Open the fuel list', FUEL);
  return { subject, text, html };
}

/* ---- the run ---- */
async function run(o) {
  const db = o.db, log = o.log || console.log, DRY = !!o.dry, tag = '[forecourt auto] ';
  const nowMs = o.nowMs || Date.now(), n = R.london(new Date(nowMs)), hol = o.hol || {};
  const cfg = (await db.ref('forecourt/auto/config').get()).val() || {};
  if (cfg.enabled !== true) { log(tag + 'off (forecourt/auto/config/enabled is not true)'); return { off: true }; }
  if (n.dow === 'sun') return log(tag + 'Sunday');
  const FC = cfg.sandbox ? 'forecourtTest' : 'forecourt', SB = !!cfg.sandbox;
  const ROOT = o.root || 'lockup', lcfg = o.lockupCfg || {}, team = lcfg.team || {}, mgrs = lcfg.managers || {};
  const absences = o.absences || {};
  const stock = o.stock || {}, stockDate = o.stockGeneratedAt ? R.london(new Date(o.stockGeneratedAt)).date : '';
  const out = { queued: [] };
  const put = async (path, val) => { if (DRY) return log('[dry] ' + tag + 'write ' + path); await db.ref(path).set(val); };
  const queue = async (id, mail, to, sendAfter) => {
    const p = ROOT + '/notify/' + id;
    if ((await db.ref(p).get()).val()) return log(tag + id + ' already queued');
    if (SB) { to = [TEST_EXEC]; mail = Object.assign({}, mail, { subject: '[SANDBOX] ' + mail.subject }); }
    const q = { kind: 'forecourt', ts: nowMs, subject: mail.subject, to, html: mail.html, text: mail.text };
    if (sendAfter && sendAfter > nowMs) q.sendAfter = sendAfter;
    if (mail.csv) { q.csv = mail.csv; q.csvName = mail.csvName; }
    out.queued.push(Object.assign({ id }, q));
    log((DRY ? '[dry] ' : '') + tag + 'queue ' + id + ' "' + q.subject + '" to ' + to.join(', ') + (q.sendAfter ? ' after ' + new Date(q.sendAfter).toISOString() : ''));
    if (!DRY) await db.ref(p).set(q);
  };
  const markReminder = async (ek, why) => {
    const p = 'lockup/mail/' + n.date + '/forecourt/' + ek;
    if ((await db.ref(p).get()).val()) return;
    log((DRY ? '[dry] ' : '') + tag + 'no 08:30 reminder for ' + ek + ' today (' + why + ')');
    if (!DRY) await db.ref(p).set({ ts: nowMs, skipped: why });
  };
  const people = {}; Object.keys(team).forEach(id => { const t = team[id]; if (t && t.name) people[t.name] = Object.assign({ id }, t); });
  const everyone = Object.values(team).filter(t => t && t.active !== false && t.email).map(t => t.email).concat(Object.values(mgrs).map(m => m && m.email).filter(Boolean));

  let cur = (await db.ref(FC + '/current').get()).val() || {};
  const cycles = (await db.ref(FC + '/auto/cycles').get()).val() || {};

  /* 1. a new cycle */
  const sched = scheduledOn(cfg, n.date), startDay = sched && startDayFor(sched, hol);
  if (sched && startDay === n.date && !cycles[sched] && isOpen(n.date, hol)) {
    if (!SB) for (const ek of Object.keys(cur.execs || {})) if (n.mins < 11 * 60) await markReminder(ek, 'new cycle today');
    const ready = stockDate === n.date || n.mins >= FALLBACK_MINS;
    if (n.mins < START_MINS || !ready) log(tag + 'cycle ' + sched + ' due today, waiting for ' + (n.mins < START_MINS ? '07:30' : 'today\u2019s stock list (or 09:30)'));
    else if (n.mins >= LATE_MINS) log(tag + 'too late to start today');
    else {
      const cars = Object.keys(stock).filter(k => stock[k].source === 'forecourt' && (!stock[k].status || stock[k].status === 'in_stock'));
      const execs = pickExecs(team, absences, n.date, hol);
      const prevOwner = {}; /* whoever had each car on the board being archived */
      Object.values(cur.execs || {}).forEach(e => ((e && e.cars) || []).forEach(k => { prevOwner[k] = e.name; }));
      const inToday = {}; execs.forEach(e => { if (!offReason(e, n.date, absences)) inToday[e.name] = true; });
      const index = Object.keys(cycles).length + daysBetween(cfg.start || '2026-10-26', sched) / (+cfg.everyDays || 14);
      const alloc = allocate(cars, execs, prevOwner, index, inToday);
      const newCur = { vehicles: {}, answers: {}, execs: {}, meta: { stockLoadedOn: n.date, cycle: sched, auto: true } };
      cars.forEach((k, i) => { newCur.vehicles[k] = { key: k, reg: dispReg(k), status: 'pending', order: i + 1, src: 'stock' }; newCur.answers[k] = { done: false, notes: '', checkedBy: '', sold: false }; });
      execs.forEach(e => { newCur.execs[execKey(e.name)] = { name: e.name, initials: initials(e), cars: alloc[e.name] || [] }; });
      const cycle = { id: sched, start: n.date, status: 'open', createdAt: nowMs, cars, alloc, stockAt: o.stockGeneratedAt || '', execs: execs.map(e => e.name) };
      if (cur.vehicles) await put(FC + '/auto/history/' + (cur.meta && cur.meta.cycle ? cur.meta.cycle : 'manual_' + ((cur.meta && cur.meta.stockLoadedOn) || n.date)), Object.assign({ archivedAt: nowMs }, cur));
      await put(FC + '/current', newCur);
      await put(FC + '/auto/cycles/' + sched, cycle);
      log(tag + 'cycle ' + sched + ': ' + cars.length + ' cars across ' + execs.length + ' execs: ' + execs.map(e => e.name + ' ' + (alloc[e.name] || []).length).join(', '));
      out.cycle = cycle; out.alloc = alloc; out.execs = execs;
      const rowsBy = {}; carRows(newCur, stock).forEach(r => { rowsBy[r.key] = r; });
      for (const e of execs) {
        const mine = (alloc[e.name] || []).map(k => rowsBy[k]); if (!mine.length) continue;
        const inDay = firstInDay(e, n.date, absences, hol), late = inDay !== n.date;
        if (!e.email) { log(tag + e.name + ' has no email on the lockup Team list'); continue; }
        await queue('fc_' + sched + '_alloc_' + e.id, allocationEmail(e, mine, cycle, late), [e.email], late ? ukMs(inDay, 8 * 60) : 0);
        if (!SB && !late) await markReminder(execKey(e.name), 'allocation email today');
      }
      cycles[sched] = cycle; cur = newCur;
    }
  }

  /* 2. the open cycle */
  const id = cur.meta && cur.meta.cycle, cyc = id && cycles[id];
  if (!cyc) { log(tag + 'no automatic cycle on the board'); }
  else {
    /* follow ups: the existing 08:30 reminder, minus anyone off today, and minus allocation day for late starters */
    if (!SB && n.mins < 11 * 60 && cyc.status === 'open') for (const ek of Object.keys(cur.execs || {})) {
      const e = people[(cur.execs[ek] || {}).name]; if (!e) continue;
      const why = offReason(e, n.date, absences); if (why) { await markReminder(ek, 'day off'); continue; }
      if (firstInDay(e, cyc.start, absences, hol) === n.date && n.date !== cyc.start) await markReminder(ek, 'allocation email today');
    }
    const rows = carRows(cur, stock).filter(r => (cyc.cars || []).indexOf(r.key) >= 0);
    const missing = (cyc.cars || []).filter(k => !(cur.vehicles || {})[k]).length;
    const allDone = rows.length && rows.every(closed);
    if (cyc.status === 'open' && allDone && n.mins < LATE_MINS) {
      log(tag + 'cycle ' + id + ' complete' + (missing ? ' (' + missing + ' removed from the board)' : ''));
      await queue('fc_' + id + '_report', reportEmail(cur, stock, cyc, false, nowMs), [WILL]);
      const fl = fuelList(cur, stock);
      if (fl.filter(r => !r.tick).length) await queue('fc_' + id + '_fuel_' + n.date, fuelEmail(fl, cyc, false), everyone);
      await put(FC + '/auto/cycles/' + id + '/status', 'complete'); await put(FC + '/auto/cycles/' + id + '/completedAt', nowMs);
      cyc.status = 'complete';
    } else if (cyc.status === 'open') log(tag + 'cycle ' + id + ': ' + rows.filter(closed).length + ' of ' + rows.length + ' closed');
    /* daily fuel list while any are outstanding, for 14 days from the start */
    if (cfg.fuelDaily !== false && n.mins >= FUEL_DAILY_MINS && n.mins < LATE_MINS && isOpen(n.date, hol) && daysBetween(cyc.start, n.date) < (+cfg.everyDays || 14) && n.date !== cyc.start) {
      const fl = fuelList(cur, stock).filter(r => !r.tick);
      if (fl.length) await queue('fc_' + id + '_fuel_' + n.date, fuelEmail(fuelList(cur, stock), cyc, true), everyone);
    }
  }

  /* 3. "Send report to Will now" from the board */
  const req = (await db.ref(FC + '/auto/requests/report').get()).val();
  if (req && req.at && !req.handled && n.mins < LATE_MINS) {
    const c = cyc || { id: 'manual', start: (cur.meta && cur.meta.stockLoadedOn) || n.date, createdAt: 0, auto: false };
    const rows = carRows(cur, stock), early = !rows.every(closed);
    await queue('fc_' + c.id + '_report_req_' + req.at, reportEmail(cur, stock, c, early, nowMs), [WILL]);
    await put(FC + '/auto/requests/report/handled', nowMs);
  }
  return out;
}

module.exports = { run, allocate, pickExecs, scheduledOn, startDayFor, nextCycles, offReason, firstInDay, carRows, fuelList, allocationEmail, reportEmail, fuelEmail, CHECK_IDS, CHECK_LABELS, ukMs };
