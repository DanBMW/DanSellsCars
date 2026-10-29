/* Follow up tracker core: encryption, scheduling and wording.
   Runs in the browser and in node (tests). Customer details are encrypted on the
   device with a key derived from Dan's passphrase. The passphrase is never stored or sent. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('crypto').webcrypto);
  else root.FollowUps = factory(root.crypto);
})(typeof self !== 'undefined' ? self : this, function (wc) {
  'use strict';
  var subtle = wc.subtle, ITER = 600000, CC = 'Sergio.Garaguso@hedinautomotive.co.uk', WA = 'https://wa.me/447827138197';
  var te = new TextEncoder(), td = new TextDecoder();
  function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function rand(n) { var a = new Uint8Array(n); wc.getRandomValues(a); return a; }

  /* ---------- crypto ---------- */
  function newSalt() { return b64(rand(16)); }
  function deriveKey(pass, saltB64, iter) {
    if (!pass || pass.length < 12) return Promise.reject(new Error('Passphrase must be at least 12 characters'));
    return subtle.importKey('raw', te.encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return subtle.deriveKey({ name: 'PBKDF2', salt: unb64(saltB64), iterations: iter || ITER, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function encrypt(key, obj, aad) {
    var iv = rand(12);
    return subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: te.encode(aad || 'fu1') }, key, te.encode(JSON.stringify(obj)))
      .then(function (ct) { return { v: 1, iv: b64(iv), ct: b64(ct) }; });
  }
  function decrypt(key, box, aad) {
    return subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), additionalData: te.encode(aad || 'fu1') }, key, unb64(box.ct))
      .then(function (pt) { return JSON.parse(td.decode(pt)); });
  }
  /* vault check: a known value encrypted once so a wrong passphrase is spotted without touching records */
  function makeVault(pass) { var salt = newSalt(); return deriveKey(pass, salt).then(function (k) { return encrypt(k, { ok: 'dan-sells-followups' }, 'vault').then(function (c) { return { key: k, vault: { salt: salt, iterations: ITER, check_iv: c.iv, check_ct: c.ct } }; }); }); }
  function openVault(pass, v) {
    return deriveKey(pass, v.salt, v.iterations).then(function (k) {
      return decrypt(k, { iv: v.check_iv, ct: v.check_ct }, 'vault').then(function (o) { if (o.ok !== 'dan-sells-followups') throw 0; return k; });
    }).catch(function (e) { throw new Error(e && e.message && /12 characters/.test(e.message) ? e.message : 'That passphrase did not unlock your follow ups'); });
  }

  /* ---------- journey: one per customer, anchored on handover / agreement start ----------
     Default 48 month agreement: congrats at 0, check ins 6 to 30, review at 36, 6 months left at 42, final at 45.
     Other terms scale: check ins every 6 months until term minus 18, review term minus 12, remain term minus 6, final term minus 3. */
  var KINDS = {
    purchase: { label: 'Congratulations on your purchase' }, initial: { label: 'Initial follow up' }, checkin: { label: 'Check in' }, review: { label: 'Agreement review' },
    remain: { label: 'Only 6 months remain' }, final: { label: 'Final follow up' }, kit: { label: 'Keep in touch' }
  };
  function stagesFor(term) { term = +term || 48; if (term < 24 || term > 60) throw new Error('Agreement term must be 24 to 60 months');
    var s = [{ id: 'buy', m: null, kind: 'purchase', label: 'Congratulations on your purchase' },
      { id: 'm0', m: 0, days: 2, kind: 'initial', label: 'Initial follow up (48 hours after collection)' }];
    for (var m = 6; m <= term - 18; m += 6) s.push({ id: 'm' + m, m: m, kind: 'checkin', label: m + ' month check in' });
    s.push({ id: 'm' + (term - 12), m: term - 12, kind: 'review', label: (term - 12) + ' month agreement review' });
    s.push({ id: 'm' + (term - 6), m: term - 6, kind: 'remain', label: 'Only 6 months remain' });
    s.push({ id: 'm' + (term - 3), m: term - 3, kind: 'final', label: 'Final follow up' });
    return s; }
  function iso(d) { return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) throw new Error('Bad date'); return new Date(Date.UTC(+m[1], m[2] - 1, +m[3])); }
  function addMonths(s, n) { var d = parse(s), y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return iso(new Date(Date.UTC(y, m, Math.min(day, last)))); }
  function addDays(s, n) { var d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  /* planned date of a stage: purchase on the purchase date, everything else from collection (rec.start) */
  function planDate(rec, s) { return s.kind === 'purchase' ? (rec.purchaseDate || rec.start) : addDays(addMonths(rec.start, s.m), s.days || 0); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function stageById(rec, id) { return stagesFor(rec.term).filter(function (s) { return s.id === id; })[0]; }
  /* the stage the customer is waiting on next, or null when the journey is complete */
  function nextStage(rec) { if (rec.path === 'kit') return { id: 'kit' + ((rec.history || []).length), m: null, kind: 'kit', label: 'Keep in touch' };
    var done = {}; (rec.history || []).forEach(function (h) { done[h.stage] = 1; });
    var st = stagesFor(rec.term); for (var i = 0; i < st.length; i++) if (!done[st[i].id]) return st[i]; return null; }
  function dueDate(rec) { var n = nextStage(rec); if (!n) return null;
    if (n.kind === 'kit') { var h = rec.history || []; return h.length ? addMonths(h[h.length - 1].date, 6) : rec.start; }
    return planDate(rec, n); }
  function withDue(rec) { var r = JSON.parse(JSON.stringify(rec)); r.due = dueDate(r); return r; }
  function status(rec, todayIso) { if (rec.stopped) return 'stopped'; if (!rec.due) return 'complete'; var d = daysBetween(todayIso, rec.due);
    return d < 0 ? 'overdue' : d === 0 ? 'due' : d <= 14 ? 'soon' : 'upcoming'; }
  function sortByDue(list) { return list.slice().sort(function (a, b) { return (a.due || '9') < (b.due || '9') ? -1 : (a.due || '9') > (b.due || '9') ? 1 : 0; }); }
  function dueNow(list, todayIso) { return sortByDue(list.filter(function (r) { var s = status(r, todayIso); return s === 'due' || s === 'overdue'; })); }
  function markSent(rec, todayIso, variant) { var n = nextStage(rec); if (!n) throw new Error('Journey complete');
    var r = JSON.parse(JSON.stringify(rec)); r.history = (r.history || []).concat([{ stage: n.id, date: todayIso, variant: variant }]); r.lastSent = todayIso; return withDue(r); }
  /* timeline for the customer view: every stage with its planned date and state */
  function timeline(rec, todayIso) { if (rec.path === 'kit') return (rec.history || []).map(function (h) { return { id: h.stage, label: 'Keep in touch', date: h.date, state: 'sent' }; })
      .concat(rec.stopped ? [] : [{ id: 'next', label: 'Keep in touch', date: rec.due, state: status(rec, todayIso) }]);
    var h = {}; (rec.history || []).forEach(function (x) { h[x.stage] = x; }); var nx = nextStage(rec);
    return stagesFor(rec.term).map(function (s) { var x = h[s.id], plan = planDate(rec, s);
      return { id: s.id, m: s.m, kind: s.kind, label: s.label, date: x ? x.date : plan,
        state: x ? (x.skipped ? 'skipped' : 'sent') : rec.stopped ? 'stopped' : nx && nx.id === s.id ? status(rec, todayIso) : 'planned' }; }); }
  /* new record. f.stage lets Dan add someone mid journey: f.stage is the stage being sent now (e.g. m12) on f.sentDate.
     The agreement start is back calculated (sentDate minus stage months) unless f.start is given; earlier stages are marked skipped. */
  function newRecord(f, todayIso) {
    if (!f.firstName || !f.email) throw new Error('First name and email are needed');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) throw new Error('That email address does not look right');
    var term = +f.term || 48, path = f.path === 'kit' ? 'kit' : 'journey', st = stagesFor(term), stage = f.stage || 'buy', sent = f.sentDate || todayIso;
    var r = { id: f.id || b64(rand(9)).replace(/[+/=]/g, 'x'), firstName: f.firstName.trim(), lastName: (f.lastName || '').trim(), email: f.email.trim(),
      phone: (f.phone || '').trim(), car: (f.car || '').trim(), notes: (f.notes || '').trim(), term: term, path: path,
      swipeCustomerId: f.swipeCustomerId || null, products: Array.isArray(f.products) ? f.products.slice() : null, history: [], created: todayIso };
    if (path === 'kit') { r.start = sent; return withDue(r); }
    var at = st.filter(function (s) { return s.id === stage; })[0]; if (!at) throw new Error('Unknown stage for this agreement term');
    /* start = collection date. Back calculated from the email being sent now unless given. */
    r.start = f.start || (at.kind === 'purchase' ? sent : addDays(addMonths(sent, -at.m), -(at.days || 0)));
    r.purchaseDate = f.purchaseDate || (at.kind === 'purchase' ? sent : null);
    if (r.purchaseDate && r.purchaseDate > r.start) throw new Error('Purchase date must be on or before collection');
    var idx = st.indexOf(at); st.forEach(function (s, i) { if (i < idx) r.history.push({ stage: s.id, date: planDate(r, s), skipped: true }); });
    return withDue(r); }

  /* ---------- wording library: 3 per stage, in the tone of the links page ownership templates ---------- */
  var TY = 'https://dan-sells.co.uk/purchase-thankyou.html', REFER = 'https://dan-sells.co.uk/refer.html', REFRESH = 'https://cal.com/danbmwruxley/controls-refresh';
  var W = {
    /* links.html Purchase Thank You: short congratulations at the point of purchase with the useful information and FAQs page */
    purchase: [
      { s: 'Congratulations on your purchase, {name}!', p: ['Congratulations on your purchase with BMW Ruxley! Thank you for choosing me, I am really looking forward to getting you into your {car}.', 'Please find some useful information and FAQs within the link below, it covers everything that happens between now and collection: {ty}', 'Any questions before the day, reply here or WhatsApp me: {wa}'] },
      { s: 'Your new {car}, congratulations!', p: ['A huge congratulations on your new {car}, and thank you for your order with BMW Ruxley.', 'I have put together some useful information and answers to common questions here, so you know exactly what to expect: {ty}', 'If anything comes up in the meantime, I am only a message away on WhatsApp: {wa}'] },
      { s: 'Thank you for your order, {name}', p: ['Thank you for your purchase with BMW Ruxley, it was a pleasure helping you choose your {car}.', 'You will find some useful information and FAQs within the link below: {ty}', 'I will keep you updated along the way, and you can reach me on WhatsApp any time: {wa}'] }
    ],
    /* links.html template 10 Initial Follow Up: after collection, second handover offer, BMW survey, referral, coffee.
       The product presentation (product-email.js post handover) is added here. */
    initial: [
      { s: 'How is the new BMW? Dan at BMW Ruxley', p: ['Thank you again for choosing me for your {car}, it was a genuine pleasure to sort it for you. I hope you are enjoying the car so far!', 'Just checking in now you have had a little time with it. If any questions have popped up, I am here. And if you would like to come back in so I can walk you through anything again, the tech, the controls, anything at all, you can book a second handover at a time that suits you: {refresh}', 'You will shortly receive a short survey from BMW about your experience. Although it comes from BMW, it reflects directly on me, so your honest feedback really matters. If anything fell short, I would love the chance to put it right first.', 'Reply here or WhatsApp me any time: {wa}'] },
      { s: 'Settling in with your {car}, {name}?', p: ['I hope you have had a great first couple of days with your {car}! Thank you once more for trusting me with it.', 'If anything is not quite clear yet, just shout, or book a relaxed second handover to go over the tech and controls: {refresh}', 'BMW will be in touch shortly with a short survey. It reflects on me and how I looked after you, so if there is anything I can do better, please tell me first and I will sort it personally.', 'And if you know anyone thinking about a BMW, I would love to look after them too: {refer}', 'I am only a message away on WhatsApp: {wa}'] },
      { s: 'Enjoying the new {car}?', p: ['I just wanted to say thank you again. It was a real pleasure helping you with your {car}, and I hope the first few drives have been everything you hoped for.', 'Now you have had a little time with it, questions often pop up. I am always happy to help, and you can book a second handover whenever suits: {refresh}', 'You will receive a short survey from BMW soon. Your honest feedback really matters to me, and if anything was not quite right, let me know first so I can put it right.', 'If you are ever passing, pop in for a coffee. The easiest way to reach me is WhatsApp: {wa}'] }
    ],
    checkin: [
      { s: '{n} months in, how is the {car}? Dan at BMW Ruxley', p: ['Hard to believe you have had the {car} {n} months already! Just a friendly check in to see how you are getting on. I hope it is still putting a smile on your face.', 'If there is anything on the car you would like to get to know better, you are very welcome to come back in for a relaxed controls and tech refresher. No charge and no rush: {refresh}', 'Reply here or WhatsApp me any time, and the door is always open for a coffee: {wa}'] },
      { s: 'Checking in from BMW Ruxley', p: ['It has been around {n} months since you collected your {car}, time really does fly! Just a quick note to see how you and the car are getting on.', 'There is nothing you need to do here, I just like to keep in touch with the people I have looked after. If anything ever needs sorting, you know where I am.', 'And if a friend or family member is thinking about a BMW, I would love to look after them too: {refer}', 'Reply here or WhatsApp me: {wa}'] },
      { s: '{name}, {n} months with your {car}', p: ['I hope you are well! I was just thinking it is now {n} months since you drove away in your {car}, so I wanted to check in.', 'No agenda, I simply like to make sure everything is as it should be. If any questions have come up, or you fancy popping in for a catch up, you are always welcome.', 'Message me on WhatsApp whenever suits you: {wa}'] }
    ],
    review: [
      { s: 'Your agreement review, {name}', p: ['I hope you are well and still enjoying your {car}. You are now {n} months into your agreement, which is a great time to take a look at your options.', 'I would be happy to give you a no obligation review of where you stand, including an idea of what your car is worth at the moment. No pressure at all, it is simply good to know your options ahead of time.', 'Just reply here or WhatsApp me and I will put it together for you: {wa}'] },
      { s: '{n} months in: a look at your options', p: ['Time flies! It has been {n} months since you collected your {car}, so I wanted to get in touch about your agreement.', 'Whether you are happy as you are or thinking about something new in the future, I can review your agreement and talk you through what is possible. It costs nothing to ask and there is no obligation.', 'Message me on WhatsApp whenever suits you: {wa}'] },
      { s: 'Thinking ahead with your {car}', p: ['I hope all is well. As you are now into the final year of your agreement on your {car}, I like to offer my customers a no obligation review.', 'I can look at where you stand and what your options are, so nothing comes as a surprise later on. Some owners like to plan early, others prefer to wait, and either is absolutely fine.', 'Reply here or WhatsApp me if you would like me to take a look: {wa}'] }
    ],
    remain: [
      { s: 'Only 6 months remain on your agreement, {name}', p: ['I hope you are well. Just a heads up that there are now around 6 months left on the agreement for your {car}.', 'This is the ideal time to think about what you would like to do next. I can talk you through your options and, if you are thinking of changing, help you find the right car with plenty of time to spare.', 'Reply here or WhatsApp me and we can chat it through: {wa}'] },
      { s: '6 months to go with your {car}', p: ['It is hard to believe, but your agreement on your {car} has around 6 months remaining.', 'There is no rush to decide anything today. I just want to make sure you have all the information and plenty of time to choose what is right for you, with no pressure from me.', 'Message me on WhatsApp whenever suits you: {wa}'] },
      { s: 'Planning your next step, {name}', p: ['I hope all is well with you and the {car}. With around 6 months left on your agreement, I wanted to get in touch early.', 'Planning ahead gives you the most choice, whether that is keeping the car, handing it back or looking at something new. I am happy to explain each option clearly.', 'Just reply here or send me a WhatsApp: {wa}'] }
    ],
    final: [
      { s: 'Your agreement is nearly at its end, {name}', p: ['I hope you are well. Your agreement on your {car} is now in its final few months, so I wanted to check in one last time before it ends.', 'If you would like help with your options, or to arrange anything for the end of the agreement, I will make it as easy as possible for you.', 'Reply here or WhatsApp me and I will take care of it: {wa}'] },
      { s: 'A final check in about your {car}', p: ['Just a quick note as your agreement on your {car} approaches its end in the next few months.', 'Thank you for being such a great customer. Whatever you decide to do next, I would love to help you with it, and I am here to answer any questions along the way.', 'Message me on WhatsApp any time: {wa}'] },
      { s: 'Before your agreement ends, {name}', p: ['I hope you have enjoyed your {car}. With only a few months left on your agreement, I wanted to make sure you have everything you need.', 'If you have not decided yet, that is absolutely fine. Let me know a good time for a chat and I will talk you through your options with no pressure at all.', 'Reply here or send me a WhatsApp: {wa}'] }
    ],
    kit: [
      { s: 'Keeping in touch, {name}', p: ['I hope you are well. We spoke a while ago about {car}, and I wanted to check in to see where you are with your plans.', 'If anything has changed or you would like me to look at what is available now, I am happy to help with no pressure at all.', 'Message me on WhatsApp whenever suits you: {wa}'] },
      { s: 'Still thinking about {car}?', p: ['I hope all is well with you.', 'I know timing is everything when it comes to changing your car, so I thought I would touch base. Whenever you are ready, I can put together options that fit what you are looking for.', 'Just send me a WhatsApp and we can pick things up: {wa}'] },
      { s: 'A quick hello, {name}', p: ['I hope you are keeping well.', 'It has been a little while since we last spoke about {car}. If you are still looking, or simply want to see what is around at the moment, I would be glad to help.', 'You can reach me directly on WhatsApp: {wa}'] }
    ]
  };
  function escH(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function link(u, html) { return html ? '<a href="' + u + '">' + u.replace('https://', '') + '</a>' : u; }
  function fill(s, rec, stage, html) {
    var car = rec.car || (rec.path === 'kit' ? 'your next car' : 'BMW'), name = html ? escH(rec.firstName) : rec.firstName, c = html ? escH(car) : car;
    return s.split('{name}').join(name).split('{car}').join(c).split('{n}').join(stage && stage.m != null ? stage.m : '')
      .split('{ty}').join(link(TY + '?name=' + encodeURIComponent(rec.firstName), html)).split('{wa}').join(link(WA, html)).split('{refer}').join(link(REFER, html)).split('{refresh}').join(link(REFRESH, html)); }
  function variants(kind) { if (!W[kind]) throw new Error('Unknown stage'); return W[kind]; }
  function suggestVariant(rec) { var h = (rec.history || []).filter(function (x) { return !x.skipped; }), last = h.length ? h[h.length - 1].variant : -1; return (last + 1) % 3; }
  /* month 0: product presentation, reusing product-email.js (same included / available to add layout and AI video note).
     rec.products = ids of products the customer has; null or missing = no product section. */
  function PEmod() { if (typeof ProductEmail !== 'undefined') return ProductEmail; if (typeof require === 'function') return require('../../product-email.js'); throw new Error('product-email.js not loaded'); }
  function productSection(rec) { var PE = PEmod(), has = rec.products || [], inc = PE.PRODUCTS.filter(function (p) { return has.indexOf(p.id) >= 0; }), exc = PE.PRODUCTS.filter(function (p) { return has.indexOf(p.id) < 0; });
    var intro = !exc.length ? 'Thank you for choosing our full range of protection. With ' + PE.joinList(inc.map(function (p) { return p.name; })) + ' all in place, you can simply enjoy the drive. Here is a reminder of what each one covers.'
      : inc.length ? 'Your car is protected with ' + PE.joinList(inc.map(function (p) { return p.name; })) + '. Below is a reminder of what you have, along with the other protection products available to add if you would like them.'
      : 'Below is some information on the protection products available for your new car, in case any would be useful. Tap any video to watch.';
    var h = '<p style="margin:0 0 14px">' + PE.esc(intro) + '</p><p style="margin:0 0 14px">Please note: the product videos in this email are AI generated.</p><table width="100%" cellpadding="0" cellspacing="0">'
      + PE.PRODUCTS.map(function (p) { var on = has.indexOf(p.id) >= 0;
        var tag = '<p style="margin:16px 0 0;font-size:12px;font-weight:bold;letter-spacing:.04em;color:' + (on ? '#1a7f37' : '#8a6d00') + '">' + (on ? '&#10003; INCLUDED WITH YOUR CAR' : 'NOT INCLUDED, AVAILABLE TO ADD') + '</p>';
        return PE.productBlock(p).replace('<td style="padding:16px 0;border-top:1px solid #e5e5e5">', '<td style="padding:0 0 16px;border-top:1px solid #e5e5e5">' + tag); }).join('')
      + '</table><p style="margin:0 0 14px"><a href="' + PE.VID + 'full-presentation.html" style="color:#1c69d4">&#9654; Watch our full protection presentation</a></p>';
    return { html: h, text: PE.toText(h), included: inc.map(function (p) { return p.id; }), available: exc.map(function (p) { return p.id; }) }; }
  function build(rec, variant, stage) {
    stage = stage || nextStage(rec); if (!stage) throw new Error('Journey complete');
    var v = variants(stage.kind)[variant]; if (!v) throw new Error('Pick one of the three wordings');
    var paras = v.p.concat(['Kind regards,']), ps = stage.kind === 'initial' && Array.isArray(rec.products) ? productSection(rec) : null, at = paras.length - 2;
    var html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:600px"><p style="margin:0 0 14px">Hi ' + escH(rec.firstName) + ',</p>'
      + paras.map(function (p, i) { return (ps && i === at ? ps.html : '') + '<p style="margin:0 0 14px">' + fill(p, rec, stage, true) + '</p>'; }).join('') + '</div>';
    var tp = paras.map(function (p) { return fill(p, rec, stage, false); }); if (ps) tp.splice(at, 0, ps.text);
    var text = ['Hi ' + rec.firstName + ','].concat(tp).join('\n\n');
    var subj = fill(v.s, rec, stage, false); subj = subj.charAt(0).toUpperCase() + subj.slice(1);
    return { to: rec.email, cc: CC, subject: subj, html: html, text: text, stage: stage, products: ps };
  }
  function mailto(m) { return 'mailto:' + encodeURIComponent(m.to) + '?cc=' + encodeURIComponent(m.cc) + '&subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.text); }

  /* ---------- encrypted backup: records stay encrypted, plus the vault salt so it can be reopened with the passphrase ---------- */
  function exportBackup(vault, rows) { return JSON.stringify({ kind: 'dan-sells-followups-backup', v: 1, exported: new Date().toISOString(), vault: vault, rows: rows.map(function (r) { return { id: r.id, iv: r.iv, ct: r.ct }; }) }); }
  function readBackup(json, pass) { var b = JSON.parse(json); if (b.kind !== 'dan-sells-followups-backup') throw new Error('Not a follow ups backup');
    return openVault(pass, b.vault).then(function (k) { return Promise.all(b.rows.map(function (r) { return decrypt(k, r); })); }); }

  return { ITER: ITER, CC: CC, WA: WA, WORDING: W, newSalt: newSalt, deriveKey: deriveKey, encrypt: encrypt, decrypt: decrypt, makeVault: makeVault, openVault: openVault,
    KINDS: KINDS, stagesFor: stagesFor, nextStage: nextStage, dueDate: dueDate, withDue: withDue, timeline: timeline, stageById: stageById, addMonths: addMonths, addDays: addDays, planDate: planDate, status: status, dueNow: dueNow, sortByDue: sortByDue, markSent: markSent, newRecord: newRecord, iso: iso,
    variants: variants, productSection: productSection, suggestVariant: suggestVariant, build: build, mailto: mailto, exportBackup: exportBackup, readBackup: readBackup };
});
