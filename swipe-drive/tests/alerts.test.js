/* Tell me when it arrives: the alert joins the profile as must haves, consent is recorded once, nothing is overwritten,
   whole model names only (an M2 alert never matches an M235), and the copy has no dashes. */
const assert = require('assert'), fs = require('fs'), path = require('path'); global.window = global;
const R = path.join(__dirname, '../..');
global.localStorage = { s: {}, getItem(k) { return this.s[k] || null; }, setItem(k, v) { this.s[k] = String(v); }, removeItem(k) { delete this.s[k]; } };
require(R + '/stock-core.js'); require('../match-core.js'); require('../alert-save.js');
const A = window.AlertSave, M = window.ctMatch; let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
ok(A.get() === null, 'nothing pending');
A.put({ model: 'X5', specs: ['sp:intlight'], new_used: 'new', name: 'Alex', phone: '07700 900123', source: 'home' }); ok(A.get() === null, 'no consent, not pending');
A.put({ model: 'X5', specs: ['sp:intlight'], new_used: 'new', name: 'Alex', phone: '07700 900123', consent_at: '2026-10-29T22:00:00Z', source: 'home' });
const a = A.get(); ok(a && a.phone === '07700900123', 'pending with consent');
let p = A.build(a, {}); ok(p.models_must.join() === 'X5' && p.specs_must.join() === 'sp:intlight' && p.new_used === 'new' && p.name === 'Alex' && p.phone === '07700900123', 'new profile gets the alert');
ok(p.comms_consent_at === '2026-10-29T22:00:00Z' && p.comms_consent_text === A.CONSENT && /stop at any time/.test(p.comms_consent_text) && p.desk.lead_source === 'alert:home' && p.desk.alerts.length === 1, 'consent and source recorded');
const ex = { name: 'Sam', phone: '07700900999', models: ['X3'], models_must: ['X3'], new_used: 'used', comms_consent_at: '2026-01-01T00:00:00Z', desk: { lead_source: 'walk in', alerts: [{ model: 'x5', specs: [] }] } };
p = A.build(a, ex); ok(!p.name && !p.phone && !p.new_used && !p.comms_consent_at, 'existing details and consent are not overwritten');
ok(p.models_must.join() === 'X3,X5' && p.desk.alerts.length === 1 && p.desk.lead_source === 'walk in', 'alert added alongside, same model replaced, source kept');
A.clear(); ok(A.get() === null, 'cleared after saving');
const car = (o) => Object.assign({ kind: 'used', reg: 'R' + Math.random(), fuel: 'Petrol', price_gbp: 40000 }, o);
const pool = [car({ series: '2 Series', model: 'BMW M235 xDrive Gran Coupe' }), car({ series: 'M2', model: 'BMW M2 Coupe' }), car({ series: 'iX1', model: 'BMW iX1 xDrive30' }), car({ series: 'iX', model: 'BMW iX xDrive45' })];
ok(M.rank(pool, { models: ['M2'], models_must: ['M2'] }).map(x => x.car.model).join() === 'BMW M2 Coupe', 'M2 alert matches the M2 only');
ok(M.rank(pool, { models: ['iX'], models_must: ['iX'] }).map(x => x.car.model).join() === 'BMW iX xDrive45', 'iX alert does not match an iX1');
ok(M.rank(pool, { models: ['M2'], models_must: ['M2'] })[0].score >= 55, 'an alert match clears the alerts job threshold of 55');
const html = fs.readFileSync(R + '/alerts.html', 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<[^>]+>/g, ' ');
const vis = html + fs.readFileSync(R + '/swipe-drive/alert-save.js', 'utf8').match(/CONSENT = '([^']*)'/)[1];
ok(!/[\u2013\u2014]|\s-\s/.test(vis), 'no dashes in the alert page copy');
ok(!/Bromley|Enfield|Woolwich/.test(vis), 'one stock pool, no site names');
ok(/I agree that Dan Cane at Hedin Ruxley can contact me/.test(vis) && !/email/i.test(vis.match(/I agree[\s\S]*?Stock alerts\./)[0]), 'consent wording names no email channel while customer emails are off');
console.log('RESULT alerts ' + n + '/' + n);
