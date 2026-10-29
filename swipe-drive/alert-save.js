/* SwipeToDrive: "Tell me when it arrives" alerts from the public page (alerts.html).
   The page stores the alert on this device; after sign in the app adds it to the customer's profile.
   Uses existing columns only: models, models_must, specs, specs_must, new_used, name, phone, and the
   customers.desk jsonb (desk.alerts list, desk.lead_source). Consent is recorded in comms_consent_at and
   comms_consent_text (the database stamps who and when). Nothing here sends any message. */
(function (g) {
  var KEY = 'sd_alert_pending_v1';
  var CONSENT = 'I agree that Dan Cane at Hedin Ruxley can contact me by WhatsApp, phone call or app notification when a car that matches this alert comes into stock. I can stop at any time by replying STOP on WhatsApp, or in SwipeToDrive under Me, Stock alerts.';
  function uniq(a) { var s = {}, o = []; (a || []).forEach(function (x) { var k = String(x).toLowerCase(); if (x && !s[k]) { s[k] = 1; o.push(x); } }); return o; }
  function clean(a) { a = a || {}; return { model: String(a.model || '').slice(0, 40), specs: uniq(a.specs || []).slice(0, 12).map(String), new_used: /^(new|used|both)$/.test(a.new_used) ? a.new_used : 'both',
    name: String(a.name || '').trim().slice(0, 40), phone: String(a.phone || '').replace(/\s+/g, ''), consent_at: a.consent_at || '', source: String(a.source || 'alerts').slice(0, 40) }; }
  function put(a) { try { g.localStorage.setItem(KEY, JSON.stringify(clean(a))); } catch (e) {} }
  function get() { try { var a = JSON.parse(g.localStorage.getItem(KEY) || 'null'); return a && a.model && a.consent_at ? clean(a) : null; } catch (e) { return null; } }
  function clear() { try { g.localStorage.removeItem(KEY); } catch (e) {} }
  function empty(v) { return v == null || v === '' || (Array.isArray(v) && !v.length); }
  /* the patch for an existing (or empty) profile: the alert's model and spec become must haves, added to what is there */
  function build(a, ex) { a = clean(a); ex = ex || {}; var p = {}, desk = Object.assign({}, ex.desk || {});
    p.models = uniq((ex.models || []).concat([a.model])); p.models_must = uniq((ex.models_must || []).concat([a.model]));
    if (a.specs.length) { p.specs = uniq((ex.specs || []).concat(a.specs)); p.specs_must = uniq((ex.specs_must || []).concat(a.specs)); }
    if (a.new_used !== 'both' && (empty(ex.new_used) || ex.new_used === 'both')) p.new_used = a.new_used;
    if (a.name && empty(ex.name)) p.name = a.name;
    if (/^07\d{9}$/.test(a.phone) && empty(ex.phone)) p.phone = a.phone;
    var list = (desk.alerts || []).filter(function (x) { return String(x.model).toLowerCase() !== a.model.toLowerCase(); });
    list.push({ model: a.model, specs: a.specs, new_used: a.new_used, at: a.consent_at, source: a.source }); desk.alerts = list.slice(-10);
    if (empty(desk.lead_source)) desk.lead_source = 'alert:' + a.source;
    /* shows in New enquiries on the team screen until a colleague marks it actioned */
    desk.enquiry = { repeat: !!(desk.enquiry && desk.enquiry.at), source: 'alert:' + a.source, at: a.consent_at || new Date().toISOString(), first_name: (a.name || ex.name || '').split(' ')[0], actioned_at: null, model: a.model };
    p.desk = desk;
    if (!ex.comms_consent_at) { p.comms_consent_at = a.consent_at || new Date().toISOString(); p.comms_consent_text = CONSENT; }
    return p; }
  g.AlertSave = { KEY: KEY, CONSENT: CONSENT, put: put, get: get, clear: clear, build: build, clean: clean };
})(typeof window !== 'undefined' ? window : globalThis);
