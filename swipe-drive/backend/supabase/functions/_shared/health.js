/* Daily health line to Dan after every match-alerts run, and an alert when a run fails or carries a problem the
   cron would otherwise never show (pg_cron ignores the response). Goes through the same Dan route as
   notify-buy-request: Resend, from MAIL_FROM, to DAN_NOTIFY_EMAIL. No address lives in code. */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const escH = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clean = (s) => String(s == null ? '' : s).replace(/[\u2013\u2014]/g, ',').replace(/ - /g, ', ');

/* Send the daily line only when something changed (new cars or alerts sent) or the run carried a problem.
   A quiet run sends nothing. Failures go through failureMessage and always send. */
export function shouldSendHealth(out) {
  const o = out || {};
  return (o.fresh || 0) > 0 || (o.pushed || 0) > 0 || (o.emailed || 0) > 0 || (o.reminders || 0) > 0 || (o.warnings || []).length > 0;
}

export function healthMessage(out, when = new Date()) {
  const o = out || {}, warn = (o.warnings || []).map(clean);
  const line = `${plural(o.fresh || 0, 'fresh car', 'fresh cars')}, ${o.pushed || 0} pushed, ${o.emailed || 0} emailed`;
  const extra = [];
  if (o.reminders) extra.push(plural(o.reminders, 'change reminder', 'change reminders') + ' sent');
  if (o.reactivated) extra.push(plural(o.reactivated, 'customer', 'customers') + ' back on matching');
  if (o.skipped) extra.push(clean(o.skipped));
  const day = when.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
  const subject = `${warn.length ? 'SwipeToDrive daily run, needs a look: ' : 'SwipeToDrive daily run: '}${line}`;
  const text = [`SwipeToDrive daily run, ${day}`, line + '.', ...extra.map((e) => e + '.'),
    ...(warn.length ? ['', 'Problems this run:', ...warn.map((w) => '* ' + w)] : [])].join('\n');
  const html = `<p><b>SwipeToDrive daily run</b>, ${escH(day)}</p><p>${escH(line)}.</p>` + extra.map((e) => `<p>${escH(e)}.</p>`).join('') +
    (warn.length ? `<p><b>Problems this run:</b></p><ul>${warn.map((w) => `<li>${escH(w)}</li>`).join('')}</ul>` : '');
  return { subject, text, html };
}

export function failureMessage(err, stage = '', when = new Date()) {
  const msg = clean(err && err.message ? err.message : err).slice(0, 1500) || 'unknown error';
  const at = when.toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });
  const subject = 'SwipeToDrive daily run FAILED' + (stage ? `, at ${clean(stage)}` : '');
  const text = [`The SwipeToDrive match job failed at ${at} London time.`, stage ? `Stage: ${clean(stage)}` : '', `Error: ${msg}`, '',
    'No further alerts went out after this point. Anything already sent is recorded, so a rerun will not repeat it.'].filter((x) => x !== '').join('\n');
  const html = `<p><b>The SwipeToDrive match job failed</b> at ${escH(at)} London time.</p>` + (stage ? `<p>Stage: ${escH(clean(stage))}</p>` : '') +
    `<pre style="white-space:pre-wrap">${escH(msg)}</pre><p>No further alerts went out after this point. Anything already sent is recorded, so a rerun will not repeat it.</p>`;
  return { subject, text, html };
}

/* env: a function (name) => value. Returns { ok, reason }. Never throws, so a failed alert cannot hide the original error. */
export async function sendDan(env, msg, fetchFn = fetch) {
  if (!env('RESEND_API_KEY') || !env('MAIL_FROM') || !env('DAN_NOTIFY_EMAIL')) return { ok: false, reason: 'email not configured' };
  try {
    const r = await fetchFn('https://api.resend.com/emails', { method: 'POST',
      headers: { Authorization: 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('MAIL_FROM'), to: [env('DAN_NOTIFY_EMAIL')], subject: msg.subject, html: msg.html, text: msg.text }) });
    return { ok: !!r.ok, reason: r.ok ? '' : 'resend ' + r.status };
  } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
}
