/* funnel-lead: validation, the answer mapping onto a SwipeToDrive profile, consent required, no unknown values. */
import assert from 'assert';
import { validate, toCustomer, phone07, CONSENT } from '../backend/supabase/functions/_shared/funnel.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const base = { name: 'Alex', phone: '07700 900123', email: 'Alex@Example.com' };
ok(validate(base) === null, 'valid');
ok(validate({ ...base, phone: '020 7946 0000' }) === null, 'a landline the funnel accepted still makes a record');
ok(validate({ ...base, _gotcha: 'x' }) === 'spam', 'honeypot');
ok(validate({ ...base, phone: '123' }) === 'phone' && validate({ ...base, email: 'nope' }) === 'email' && validate({ ...base, name: '<b>' }) === 'name', 'bad fields refused');
ok(phone07('+44 7700 900123') === '07700900123', '+44 numbers become 07');
const row = toCustomer({ ...base, answers: { models: ['X5', '3t', 'M', 'evil'], interest: 'new', fuel: ['phev', 'diesel', 'x'], body: ['touring'], pay: 'monthly', mo: 650, dep: 5000,
  extras: ['heated', 'xdrive', 'hud', 'junk'], must: ['xdrive', 'nothing'], colours: ['Black', 'Purple<script>'], miles: '10to15', when: 'month' } }, '2026-10-29T22:40:00Z');
ok(row.email === 'alex@example.com' && row.phone === '07700900123' && row.name === 'Alex', 'contact cleaned');
ok(row.models.join() === 'X5,3 Series' && row.desk.m_only === true, 'models mapped, M noted');
ok(row.fuel === 'hybrid,diesel' && row.body === 'estate' && row.new_used === 'new', 'fuel (plug in counts as hybrid), body, new or used');
ok(row.budget_type === 'monthly' && row.monthly_gbp === 650 && row.deposit_gbp === 5000 && !row.cash_gbp, 'budget');
ok(row.specs.join() === 'feat:heated,feat:xdrive,feat:hud' && row.specs_must.join() === 'feat:xdrive', 'spec picks and must haves');
ok(row.colours.join() === 'Black' && row.annual_mileage === 12500 && row.desk.when === 'month', 'colours, mileage, timing');
ok(!('comms_consent_at' in row) && !('comms_consent_text' in row), 'no messaging consent from the funnel itself');
const withAlert = toCustomer({ ...base, alert_consent: true }, '2026-10-29T22:40:00Z');
ok(withAlert.comms_consent_at === '2026-10-29T22:40:00Z' && withAlert.comms_consent_text === CONSENT, 'consent only with the stock alert agreement');
ok(row.desk.enquiry.source === 'find-my-bmw' && row.desk.enquiry.actioned_at === null && row.desk.enquiry.first_name === 'Alex', 'shows as a new enquiry');
ok(row.desk.alerts.length === 2 && row.desk.alerts[0].specs.join() === 'feat:xdrive', 'an alert per model');
ok(!('user_id' in row) && !('owner_staff_id' in row) && !('id' in row), 'ownership is set by the function, never by the form');
const cash = toCustomer({ ...base, answers: { pay: 'cash', cash: 45000, mo: 999 } });
ok(cash.budget_type === 'cash' && cash.cash_gbp === 45000 && !cash.monthly_gbp && cash.fuel === 'open' && cash.body === 'any' && cash.new_used === 'both', 'cash brief and open defaults');
ok(!/[\u2013\u2014]|\s-\s/.test(CONSENT), 'no dashes');
console.log('RESULT funnel ' + n + '/' + n);
