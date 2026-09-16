/**
 * Showroom arrivals - Gmail stopgap
 * =================================
 * Reads Hedin Appointments notification emails and serves JSON for the
 * team board / walkins.html.
 *
 * Subjects are a public contract (do not rename upstream):
 *   Walk-in waiting - {Name}
 *   Customer arrived - {Name}
 *   Walk-in taken - {Name}
 *   Walk-in left without being seen - please re-book - {Name}
 *   Dealt! - {Name}
 *
 * SETTING IT UP  (script.google.com)
 *   1. Paste this into Code.gs
 *   2. Script Properties: TOKEN = your secret (not in this file)
 *   3. Run refresh once, grant Gmail
 *   4. Trigger: refresh, time-driven, every minute
 *   5. Deploy web app → New version (keep same /exec URL)
 */

/* ===================== tell it about your emails ====================== */

/* Inbox-scoped so archiving clears waiting cards. Subject matches are the
   stable contract from Hedin Appointments (commit e575f86 catalogue). */
var SEARCH = 'in:inbox newer_than:1d ('
  + 'subject:"Walk-in waiting" OR '
  + 'subject:"Customer arrived" OR '
  + 'subject:"Walk-in taken" OR '
  + 'subject:"Walk-in left without being seen" OR '
  + 'subject:"Dealt!" OR '
  + '"has just been checked-in" OR "needs to be seen by a sales exec" OR '
  + '"has checked in for their appointment"'
  + ')';

/* Pick-ups / taken — not limited to inbox (fact should survive tidy-up). */
var SEEN_SEARCH = 'newer_than:1d ('
  + 'subject:"Walk-in taken" OR '
  + '"has taken the walk-in customer" OR "has taken the customer"'
  + ')';

var LEFT_SEARCH = 'newer_than:1d subject:"Walk-in left without being seen"';

var PATTERNS = {
  customerSubject: [
    /^Walk-in waiting\s*[-:]\s*(.+)$/im,
    /^Customer arrived\s*[-:]\s*(.+)$/im,
    /^Walk-in taken\s*[-:]\s*(.+)$/im,
    /^Walk-in left without being seen\s*[-:].*[-:]\s*(.+)$/im,
    /^.*?please re-book\s*[-:]\s*(.+)$/im,
    /^Dealt!\s*[-:]\s*(.+)$/im,
    /^Appointment waiting\s*[-:]\s*(.+)$/im
  ],
  customer:   [/^[^\n]*Customer(?:\s*name)?[ \t]*[:\-][ \t]*([^\n\r<]+)$/im,
               /Customer(?:\s*name)?[ \t]*[:\-][ \t]*([^\n\r<]+)/i,
               /has taken the (?:walk-in )?customer\s+([^.\n]+)/i],
  seenBy:     [/^[^\n]*Sales\s*exec(?:utive)?[ \t]*[:\-][ \t]*([^\n\r<]+)$/im,
               /Sales\s*exec(?:utive)?[ \t]*[:\-][ \t]*([^\n\r<]+)/i,
               /^[^\n]*Assigned\s*by[ \t]*[:\-][ \t]*([^\n\r<]+)$/im,
               /^(.+?)\s+has taken the (?:walk-in )?customer/im],
  bookedWith: [/^[^\n]*Owner[ \t]*[:\-][ \t]*([^\n\r<]+)$/im,
               /Owner[ \t]*[:\-][ \t]*([^\n\r<]+)/i,
               /^[^\n]*Booked\s*with[ \t]*[:\-][ \t]*([^\n\r<]+)$/im],
  arrivedAt:  [/^[^\n]*Arriv(?:ed|al[ \t]*time)[ \t]*[:\-][ \t]*(\d{1,2}[:.]\d{2})/im,
               /Arriv(?:ed|al[ \t]*time)[ \t]*[:\-][ \t]*(\d{1,2}[:.]\d{2})/i],
  apptTime:   [/^[^\n]*Appointment[ \t]*time[ \t]*[:\-][ \t]*(\d{1,2}[:.]\d{2})/im,
               /^[^\n]*Handover[ \t]*time[ \t]*[:\-][ \t]*(\d{1,2}[:.]\d{2})/im],
  carType:    [/^[^\n]*Car[ \t]*type[ \t]*[:\-][ \t]*([^\n\r<]+)$/im,
               /Car[ \t]*type[ \t]*[:\-][ \t]*([^\n\r<]+)/i,
               /^[^\n]*New[ \t]*\/[ \t]*Used[ \t]*[:\-][ \t]*([^\n\r<]+)$/im,
               /New[ \t]*\/[ \t]*Used[ \t]*[:\-][ \t]*([^\n\r<]+)/i,
               /^[^\n]*Purchase[ \t]*type[ \t]*[:\-][ \t]*([^\n\r<]+)$/im],
  models:     [/^[^\n]*Models?(?:[ \t]*of[ \t]*interest)?[ \t]*[:\-][ \t]*([^\n\r<]+)$/im,
               /Models?(?:[ \t]*of[ \t]*interest)?[ \t]*[:\-][ \t]*([^\n\r<]+)/i],
  bookingType:[/^[^\n]*Booking[ \t]*type[ \t]*[:\-][ \t]*([^\n\r<]+)$/im,
               /Booking[ \t]*type[ \t]*[:\-][ \t]*([^\n\r<]+)/i],
  ref:        [/[?&]engage=([A-Za-z0-9_-]{6,})/,
               /[?&]outcome=([A-Za-z0-9_-]{6,})/],
  isBooked:   [/Booking[ \t]*type[ \t]*[:\-][ \t]*Appointment/i,
               /Booking[ \t]*type[ \t]*[:\-][ \t]*Handover/i,
               /has checked in for their appointment/i,
               /^Customer arrived\b/im],
  isWalkIn:   [/Booking[ \t]*type[ \t]*[:\-][ \t]*Walk/i,
               /^Walk-in waiting\b/im,
               /^Walk-in taken\b/im,
               /^Walk-in left\b/im],
  isHandover: [/Booking[ \t]*type[ \t]*[:\-][ \t]*Handover/i,
               /\bhandover\b/i]
};

var STALE_MINS = 240;
var MAX_THREADS = 50;
var CACHE_KEY = 'showroom_arrivals_v2';

/* ===================== nothing below needs editing ==================== */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var want = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (want && p.token !== want) {
    return out({ error: 'bad token' }, p.callback);
  }
  /* ?say=... returns the announcement as AUDIO DATA rather than a list.
     This is what gives every screen the same voice.
     It has to be fetched here rather than by the board for two reasons:
     the TTS host sends no CORS headers, so a browser cannot fetch it; and
     the wall TV refuses a remote media URL outright. Handing the board raw
     bytes sidesteps both - it decodes them into Web Audio, which is the one
     audio path that TV has always been willing to use. */
  if (p.say) return sayAudio(p.say, p.callback);

  var body = readCache();
  if (!body) {
    try { refresh(); body = readCache(); } catch (err) {
      return out({ error: String(err) }, p.callback);
    }
  }
  return out(body || { appointments: [], events: [] }, p.callback);
}

/* ===================== the voice ====================================== */

/* en-GB female. Swap VOICE_URL for a paid engine later without the board
   changing at all - it only ever asks for "the audio for this sentence". */
var VOICE_LANG = 'en-GB';
var VOICE_CHUNK = 180;     /* the endpoint truncates long requests */

function voiceUrl(text) {
  return 'https://translate.google.com/translate_tts'
       + '?ie=UTF-8&client=tw-ob&tl=' + encodeURIComponent(VOICE_LANG)
       + '&q=' + encodeURIComponent(text);
}

/* Split on sentence ends so the joins fall where a speaker would pause,
   rather than mid-word. */
function voiceChunks(text) {
  /* No lookbehind: it needs the V8 runtime, and an Apps Script project set
     to the legacy one would fail to compile the whole file rather than just
     this line. Keep the terminator on the sentence it belongs to. */
  var parts = String(text || '').replace(/([.!?])\s+/g, '$1\u0001').split('\u0001');
  var out = [], cur = '';
  parts.forEach(function (bit) {
    while (bit.length > VOICE_CHUNK) {          /* a single huge sentence */
      out.push(bit.slice(0, VOICE_CHUNK));
      bit = bit.slice(VOICE_CHUNK);
    }
    if ((cur + ' ' + bit).trim().length > VOICE_CHUNK) { if (cur) out.push(cur.trim()); cur = bit; }
    else cur = (cur ? cur + ' ' : '') + bit;
  });
  if (cur.trim()) out.push(cur.trim());
  return out.filter(function (x) { return x.length; });
}

function sayAudio(text, callback) {
  var chunks = voiceChunks(text);
  if (!chunks.length) return out({ error: 'nothing to say' }, callback);

  var clips = [];
  for (var i = 0; i < chunks.length; i++) {
    var b64 = voiceClip(chunks[i]);
    if (!b64) return out({ error: 'voice unavailable' }, callback);
    clips.push(b64);
  }
  return out({ clips: clips, type: 'audio/mpeg', say: text }, callback);
}

/* One phrase, base64. Cached because the fixed parts repeat all day -
   "Walk-in", "Arrived", an executive's name - and there is no sense
   fetching the same audio a hundred times. */
function voiceClip(phrase) {
  var ck = 'tts_' + VOICE_LANG + '_' + hash(phrase);
  try {
    var hit = CacheService.getScriptCache().get(ck);
    if (hit) return hit;
  } catch (e) {}

  var res;
  try {
    res = UrlFetchApp.fetch(voiceUrl(phrase), {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
  } catch (e) { return ''; }

  if (res.getResponseCode() !== 200) return '';
  var bytes = res.getBlob().getBytes();
  if (!bytes || bytes.length < 512) return '';    /* an error page, not audio */
  var b64 = Utilities.base64Encode(bytes);

  /* the cache refuses anything much over 100KB - not worth failing over */
  try {
    if (b64.length < 95000) CacheService.getScriptCache().put(ck, b64, 21600);
  } catch (e) {}
  return b64;
}

function hash(s) {
  var h = 0, str = String(s || '');
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(36);
}

function out(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][\w$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function readCache() {
  var s = CacheService.getScriptCache().get(CACHE_KEY);
  if (!s) s = PropertiesService.getScriptProperties().getProperty(CACHE_KEY);
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

function writeCache(obj) {
  var s = JSON.stringify(obj);
  CacheService.getScriptCache().put(CACHE_KEY, s, 600);
  PropertiesService.getScriptProperties().setProperty(CACHE_KEY, s);
}

function refresh() {
  var packed = scan();
  writeCache({
    appointments: packed.appointments,
    events: packed.events,
    scannedAt: Date.now()
  });
  return packed.appointments.length;
}

function classifySubject(subject) {
  var s = String(subject || '');
  if (/^Walk-in waiting\b/i.test(s)) return 'walkin-waiting';
  if (/^Customer arrived\b/i.test(s)) return 'customer-arrived';
  if (/^Walk-in taken\b/i.test(s)) return 'walkin-taken';
  if (/^Walk-in left without being seen\b/i.test(s)) return 'walkin-left';
  if (/^Dealt!\b/i.test(s)) return 'dealt';
  if (/needs to be seen by a sales exec|has just been checked-?in/i.test(s))
    return 'walkin-waiting';
  if (/has checked in for their appointment/i.test(s)) return 'customer-arrived';
  return '';
}

function scan() {
  var cutoff = Date.now() - STALE_MINS * 60000;
  var events = [];
  var byVisit = {}; /* waiting cards keyed by ref or name@time */

  GmailApp.search(SEARCH, 0, MAX_THREADS).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      var when = m.getDate().getTime();
      if (when < cutoff) return;

      var subject = m.getSubject() || '';
      var body = messageText(m);
      var text = subject + '\n' + body;
      var kind = classifySubject(subject);
      if (!kind) {
        /* body-only fallback for older phrasings */
        if (/needs to be seen by a sales exec|has just been checked-?in/i.test(text))
          kind = 'walkin-waiting';
        else if (/has checked in for their appointment|I'm with the customer/i.test(text) &&
                 /Customer arrived|Arrival time|Booking type/i.test(text))
          kind = 'customer-arrived';
        else return;
      }

      var name = customerNameFrom(body, subject);
      var booked = clean(firstOf(PATTERNS.bookedWith, body, subject));
      var staff = sanitizeName(firstOf(PATTERNS.seenBy, body, subject));
      var stated = firstOf(PATTERNS.arrivedAt, body, subject);
      var arrived = stated ? clockOn(when, stated) : null;
      if (arrived === null) arrived = when;
      var appt = firstOf(PATTERNS.apptTime, body, subject);
      var ref = firstOf(PATTERNS.ref, body, subject) || '';
      var booking = clean(firstOf(PATTERNS.bookingType, body, subject));
      var isHandover = anyMatch(PATTERNS.isHandover, text) || /handover/i.test(booking);
      var isWalkIn = kind.indexOf('walkin') === 0 || anyMatch(PATTERNS.isWalkIn, text);
      if (kind === 'customer-arrived' && isHandover) isWalkIn = false;
      var type = isWalkIn ? 'walk-in' : (isHandover ? 'handover' : 'appointment');

      var ev = {
        id: m.getId(),
        kind: kind,
        at: when,
        arrivalTime: arrived,
        customerName: sanitizeName(name) || (isWalkIn ? 'Walk-in' : (isHandover ? 'Handover' : 'Appointment')),
        type: type,
        appointmentTime: appt ? clockOn(when, appt) : null,
        bookedWith: booked,
        assignedTo: staff,
        carType: clean(firstOf(PATTERNS.carType, body, subject)),
        models: clean(firstOf(PATTERNS.models, body, subject)),
        ref: ref,
        subject: subject
      };
      events.push(ev);

      /* Maintain who is still waiting on the showroom list */
      var vk = ref ? ('ref:' + ref)
            : (key(ev.customerName) + '|' + (stated ? hhmm(arrived) : 'unknown'));

      if (kind === 'walkin-waiting' || kind === 'customer-arrived') {
        if (!byVisit[vk] || arrived <= byVisit[vk].arrivalTime) {
          byVisit[vk] = {
            id: m.getId(),
            arrivalTime: arrived,
            customerName: ev.customerName,
            type: type,
            appointmentTime: ev.appointmentTime,
            bookedWith: booked,
            carType: ev.carType,
            models: ev.models,
            ref: ref,
            status: 'waiting',
            assignedTo: '',
            statedTime: !!stated
          };
        }
      } else if (kind === 'walkin-taken') {
        if (byVisit[vk]) {
          byVisit[vk].status = 'with-staff';
          byVisit[vk].assignedTo = staff || byVisit[vk].assignedTo;
        } else {
          /* taken without a waiting card still recorded for matching */
          byVisit[vk] = {
            id: m.getId(),
            arrivalTime: arrived,
            customerName: ev.customerName,
            type: type,
            appointmentTime: null,
            bookedWith: booked,
            carType: ev.carType,
            models: ev.models,
            ref: ref,
            status: 'with-staff',
            assignedTo: staff || '',
            statedTime: !!stated
          };
        }
      } else if (kind === 'walkin-left') {
        if (byVisit[vk]) {
          byVisit[vk].status = 'walked-out';
          byVisit[vk].assignedTo = '';
        }
      }
    });
  });

  /* Also merge SEEN_SEARCH in case taken mail was archived */
  GmailApp.search(SEEN_SEARCH, 0, MAX_THREADS).forEach(function (t) {
    t.getMessages().forEach(function (m) {
      var when = m.getDate().getTime();
      if (when < cutoff) return;
      var subject = m.getSubject() || '';
      var body = messageText(m);
      /* A "Walk-in taken" subject is NOT already handled above. The pass
         above is in:inbox-scoped, so an archived pick-up is invisible to it -
         and an archived pick-up is exactly what this block exists to catch.
         Skipping it left the customer reading "waiting" for ever, with the
         timer climbing, which on a wall in the managers' office looks like
         somebody has been ignored for an hour.
         Re-applying is harmless: the guard below only touches a visit that
         is still waiting, and this block raises no event, so nothing is
         announced twice. */
      var name = customerNameFrom(body, subject);
      if (!name) return;
      var staff = sanitizeName(firstOf(PATTERNS.seenBy, body, subject)) || 'a member of staff';
      var stated = firstOf(PATTERNS.arrivedAt, body, subject);
      var arrived = stated ? clockOn(when, stated) : when;
      var ref = firstOf(PATTERNS.ref, body, subject) || '';
      var vk = ref ? ('ref:' + ref) : (key(name) + '|' + (stated ? hhmm(arrived) : 'unknown'));
      if (byVisit[vk] && byVisit[vk].status === 'waiting') {
        byVisit[vk].status = 'with-staff';
        byVisit[vk].assignedTo = staff;
      }
    });
  });

  var appointments = [];
  Object.keys(byVisit).forEach(function (vk) {
    var r = byVisit[vk];
    delete r.statedTime;
    /* Only surface people still in the showroom flow */
    if (r.status === 'walked-out') return;
    appointments.push(r);
  });
  appointments.sort(function (a, b) { return a.arrivalTime - b.arrivalTime; });

  /* Newest events first for the board; cap to keep payload small */
  events.sort(function (a, b) { return b.at - a.at; });
  if (events.length > 80) events = events.slice(0, 80);

  return { appointments: appointments, events: events };
}

function messageText(m) {
  var plain = '';
  try { plain = m.getPlainBody() || ''; } catch (e) {}
  if (/Customer(?:\s*name)?\s*[:\-]/i.test(plain)
      || /Walk-in waiting|Customer arrived|Walk-in taken|Dealt!/i.test(plain)) {
    return plain;
  }
  var html = '';
  try { html = m.getBody() || ''; } catch (e) {}
  if (!html) return plain;
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim() || plain;
}

function first(pats, text) {
  for (var i = 0; i < pats.length; i++) {
    var m = text.match(pats[i]);
    if (m && m[1]) return m[1];
  }
  return '';
}
function firstOf(pats, body, subject) {
  return first(pats, body || '') || first(pats, subject || '');
}
function anyMatch(pats, text) {
  for (var i = 0; i < pats.length; i++) if (pats[i].test(text)) return true;
  return false;
}

function customerNameFrom(body, subject) {
  var fromSub = sanitizeName(first(PATTERNS.customerSubject, subject || ''));
  var fromBody = sanitizeName(firstOf(PATTERNS.customer, body, subject));
  if (fromSub && fromBody) {
    var ks = key(fromSub), kb = key(fromBody);
    if (ks.indexOf(kb) === 0 || ks === kb || fromSub.length >= fromBody.length)
      return fromSub;
    return fromBody;
  }
  return fromSub || fromBody;
}

function sanitizeName(s) {
  s = clean(s);
  if (!s) return '';
  var low = s.toLowerCase();
  if (low === 'walk-in' || low === 'walk in' || low === 'customer'
      || low === 'a walk-in' || low === 'a walk-in customer'
      || low === 'the customer' || low === 'appointment' || low === 'handover'
      || /^sales\b/.test(low) || /checked-?in/.test(low)
      || /needs to be seen/.test(low) || /sales exec/.test(low)
      || /please re-book/i.test(low)) return '';
  return s.replace(/^[\s*•·]+/, '').trim();
}

function clean(s) {
  return String(s || '').replace(/[\r\n].*$/, '').replace(/[<>].*$/, '')
                        .replace(/\|.*$/, '').replace(/^[\s*•·]+/, '')
                        .replace(/\s+/g, ' ').trim().slice(0, 60);
}
function key(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }

function hhmm(ms) {
  var d = new Date(ms), p = function (n) { return n < 10 ? '0' + n : '' + n };
  return p(d.getHours()) + p(d.getMinutes());
}

function clockOn(ref, text) {
  var m = String(text).match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  var h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  var d = new Date(ref);
  d.setHours(h, mi, 0, 0);
  var t = d.getTime();
  if (Math.abs(t - ref) > 12 * 3600000) return null;
  return t;
}

function preview() {
  var threads = GmailApp.search(SEARCH, 0, 8);
  Logger.log('SEARCH matched %s threads', threads.length);
  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      Logger.log('--- %s | %s | kind=%s', m.getDate(), m.getSubject(),
        classifySubject(m.getSubject() || ''));
    });
  });
  var packed = scan();
  Logger.log('\nWaiting cards (%s):', packed.appointments.length);
  packed.appointments.forEach(function (r) {
    Logger.log('  %s | %s | %s | %s', r.customerName, r.type, r.status, r.assignedTo || '-');
  });
  Logger.log('\nEvents (%s):', packed.events.length);
  packed.events.slice(0, 15).forEach(function (e) {
    Logger.log('  %s | %s | %s', e.kind, e.customerName, e.assignedTo || '-');
  });
}
