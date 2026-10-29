/* Monday rota email: the next two weeks of lockup (starting this Monday), sent to
 * the team with the managers on cc, asking everyone to update their
 * availability on the lockup page as soon as possible.
 *
 * Called from scripts/lockup-mail.js, which already runs every 15 minutes
 * (06:00 to 19:45 UTC, Monday to Saturday) and works out UK time itself, so
 * "Monday 08:00 London" holds through the clock changes with no new cron:
 * due on a Monday from 08:00 until 12:00 UK, once, marked at
 * <root>/mail/<date>/rota. It only runs when <root>/config/rotaEmail is true
 * (off until Dan switches it on), or when the Action is started by hand with
 * ROTA_NOW=1 (one off send, optional ROTA_FROM=YYYY-MM-DD Monday). */
'use strict';
const R = require('../lockup-rota.js');
const SITE = 'https://dan-sells.co.uk/lockup.html';
const SEND_FROM_MINS = 8 * 60, SEND_UNTIL_MINS = 12 * 60;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const names = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : (l[0] || '');
function fmt(date, opts) { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', Object.assign({ timeZone: 'Europe/London' }, opts)); }

/* Is the weekly email due now? n = R.london(now). */
function due(n, cfg, mailToday) {
  return !!(cfg && cfg.rotaEmail === true) && n.dow === 'mon' && n.mins >= SEND_FROM_MINS && n.mins < SEND_UNTIL_MINS && !(mailToday && mailToday.rota);
}

/* Rows for the two weeks from the Monday `fromDate`: Monday to Saturday, Sunday left out (closed). */
function rows(fromDate, weeks, team, absences, hol, nWeeks) {
  const out = [], wk0 = R.isoWeek(fromDate);
  for (let w = 0; w < (nWeeks || 2); w++) {
    const wk = R.shiftWeek(wk0, w);
    R.DAYS.concat(['sat']).forEach(d => {
      const date = R.dateFor(wk, d), on = R.onFor(date, weeks[wk], hol);
      const away = R.absentOn(absences || {}, date), awayNames = Object.keys(away).filter(id => team[id]).map(id => team[id].name + (away[id] === 'holiday' ? ' (holiday)' : ''));
      let who;
      if (on.kind === 'closed') who = 'Closed' + (hol[date] && hol[date].label ? ', ' + hol[date].label : '');
      else if (on.kind === 'managers') who = 'Managers';
      else who = on.ids.length ? names(on.ids.map(id => (team[id] || {}).name || id)) : 'Not set yet';
      out.push({ week: wk, date, dow: d, day: R.DAY_NAMES[d], dateLabel: fmt(date, { day: 'numeric', month: 'short' }), who, away: awayNames, kind: on.kind });
    });
  }
  return out;
}

function build(o) {
  /* o: { fromDate (Monday), weeks, team, absences, hol, test } */
  const rs = rows(o.fromDate, o.weeks, o.team, o.absences, o.hol, 2);
  const start = fmt(o.fromDate, { weekday: 'long', day: 'numeric', month: 'long' });
  const subject = (o.test ? '[TEST] ' : '') + 'Lockup rota for the next two weeks, from ' + start;
  const intro = ['Here\u2019s the lockup rota for the next two weeks. Please have a quick look for your nights.',
    'If you can\u2019t make a night, or you\u2019re away or on holiday, please update the lockup page as soon as possible. It only takes a minute, and it means the rota can pick someone fairly, the 5pm reminder goes to the right people and the building is always locked up properly.',
    'On the lockup page, tap Can\u2019t make it? next to your night, or use Book holiday for longer.'];
  const byWeek = {}; rs.forEach(r => { (byWeek[r.week] = byWeek[r.week] || []).push(r); });
  const text = ['Hi all,', '', intro[0], ''].concat(...Object.keys(byWeek).map(wk => ['Week of ' + fmt(R.weekStart(wk), { weekday: 'long', day: 'numeric', month: 'long' }) + ':']
    .concat(byWeek[wk].map(r => '  ' + r.day + ' ' + r.dateLabel + ': ' + r.who + (r.away.length ? ' (away: ' + r.away.join(', ') + ')' : '')), ['']))).concat([intro[1], '', intro[2], '', 'Update my availability: ' + SITE, '', 'Thank you!', 'Hedin BMW Ruxley lockup']).join('\n');
  const td = 'padding:9px 10px;border-bottom:1px solid #e6edf4;font-size:14px;vertical-align:top';
  const html = '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#12263a">' +
    '<div style="background:#0b1220;color:#fff;border-radius:14px 14px 0 0;padding:18px 20px;font-size:18px;font-weight:800">&#128273; ' + esc(subject) + '</div>' +
    '<div style="border:1px solid #d9e3ee;border-top:0;border-radius:0 0 14px 14px;padding:20px"><p style="margin:0 0 12px">Hi all,</p><p style="margin:0 0 14px">' + esc(intro[0]) + '</p>' +
    Object.keys(byWeek).map(wk => '<p style="margin:16px 0 6px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#4d6680">Week of ' + esc(fmt(R.weekStart(wk), { day: 'numeric', month: 'long' })) + '</p>' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e6edf4;border-radius:10px">' +
      byWeek[wk].map(r => '<tr style="background:' + (r.kind === 'closed' ? '#f6f8fa' : '#fff') + '"><td style="' + td + ';width:96px;font-weight:700;white-space:nowrap">' + r.day.slice(0, 3) + ' ' + esc(r.dateLabel) + '</td><td style="' + td + (r.kind === 'closed' ? ';color:#8796a5' : '') + '">' + esc(r.who) +
        (r.away.length ? '<br><span style="font-size:12px;color:#b26a00">Away: ' + esc(r.away.join(', ')) + '</span>' : '') + '</td></tr>').join('') + '</table>').join('') +
    '<div style="background:#fff7e6;border:1px solid #f3d9a4;border-radius:12px;padding:14px 16px;margin:20px 0 16px"><p style="margin:0 0 8px;font-weight:800">Can\u2019t make a night? Please let us know as soon as possible</p><p style="margin:0 0 8px">' + esc(intro[1]) + '</p><p style="margin:0">' + esc(intro[2]) + '</p></div>' +
    '<a href="' + SITE + '" style="display:block;text-align:center;background:#4d94d8;color:#fff;text-decoration:none;font-weight:800;padding:14px;border-radius:12px;font-size:17px">Update my availability</a>' +
    '<p style="margin:16px 0 0">Thank you!</p><p style="color:#6b7a8c;font-size:12px;margin:12px 0 0">Hedin BMW Ruxley lockup</p></div></div>';
  return { subject, text, html, rows: rs };
}

/* Mondays: this Monday; on other days (one off send) the next Monday. */
function fromDateFor(n, override) {
  if (override) return override;
  const idx = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(n.dow);
  return idx === 0 ? n.date : R.addDays(n.date, 7 - idx);
}

module.exports = { build, rows, due, fromDateFor, SEND_FROM_MINS, SEND_UNTIL_MINS };
