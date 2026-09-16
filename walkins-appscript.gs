/**
 * Showroom arrivals - Gmail stopgap
 * =================================
 * A Google Apps Script web app that reads the arrival notification emails and
 * serves them as JSON for walkins.html to display.
 *
 * WHY THIS EXISTS
 * The appointments system's own endpoint is the real answer. This is the
 * stopgap for while that is waiting on somebody's laptop - and the reason it
 * works around that is that Apps Script deploys FROM THE BROWSER. Nothing is
 * pushed from a machine, so it can be stood up from anywhere, including a
 * phone.
 *
 * WHAT IT CAN AND CANNOT DO - read this before relying on it
 *   - It sees ARRIVALS (SEARCH) and PICK-UPS (SEEN_SEARCH), because the
 *     system emails on both. So the whole thing works off email: who is
 *     here, how long they have been waiting, the doorbell, and the card
 *     turning green with "now with <name>" once somebody sits down.
 *   - A pick-up is matched to its arrival by the record id off the engage
 *     link where both emails carry it, and otherwise by customer name plus
 *     recorded arrival time. If a pick-up email carried neither a name nor
 *     an id there would be nothing to match on and the card would stay
 *     waiting.
 *   - It reads BOTH email layouts: the walk-in one (Arrived/Car type/Models
 *     of interest) and the appointment one (Arrival time/New - Used/Models/
 *     Owner/Booking type).
 *   - Freshness is capped by the trigger interval, so the bell can be up to
 *     a minute behind the door. The real endpoint is instant.
 *
 * CLEARING A CARD
 * The search is scoped to the inbox, so archiving the email takes the person
 * off the screen. Reception gets a manual clear for free, with nothing to
 * build. Anything older than STALE_MINS drops off by itself as a backstop.
 *
 * SETTING IT UP  (all in a browser - script.google.com)
 *   1. New project, paste this in.
 *   2. Project Settings -> Script Properties, add:
 *        TOKEN   a long random string you invent
 *      Do NOT put the token in this file - this file lives in a public repo.
 *   3. Run `refresh` once by hand and grant the Gmail permission it asks for.
 *   4. Triggers -> Add trigger -> refresh -> Time-driven -> Minutes -> Every minute.
 *   5. Deploy -> New deployment -> Web app
 *        Execute as: Me.   Who has access: Anyone.
 *      ("Anyone" is why the token matters: the URL is unguessable but public,
 *       and customer names go over it.)
 *   6. Copy the /exec URL into walkins.html:
 *        var SOURCE  = 'gas';
 *        var GAS_URL = 'https://script.google.com/macros/s/AKfy.../exec?token=YOURTOKEN';
 *
 * Tell it what the emails look like with SEARCH and PATTERNS below. Run
 * `preview()` after any change: it prints what the script makes of the last
 * few emails, so the parsing can be checked against real ones before the
 * screen goes up.
 */

/* ===================== tell it about your emails ====================== */

/* Matched against the real notification emails. Both kinds carry the same
   "Customer:/Arrived:/Car type:" block, so they are told apart by their
   opening sentence rather than by those fields.
   Keep `in:inbox` on the arrival search - that is what makes archiving an
   email clear the card off the screen. Add `from:` once the sender address
   is known, to stop anything else ever matching. */
var SEARCH = 'in:inbox newer_than:1d ("has just been checked-in" OR "needs to be seen by a sales exec" OR "has checked in for their appointment")';

/* Emails that mean an executive has taken the customer. This one deliberately
   does NOT use `in:inbox`: a pick-up is a fact, and it should still count
   after somebody has tidied the mailbox.
   Careful here. The appointment ARRIVAL email contains the sentence "mark
   that you are now with the customer" - so a search for "now with the
   customer" would match an arrival and mark it picked up the instant it
   landed. Match on "has taken", which only appears once somebody actually
   has. There is a test for exactly this. */
var SEEN_SEARCH = 'newer_than:1d ("has taken the walk-in customer" OR "has taken the customer")';

/* Read off the real emails. There are TWO layouts, and they use different
 * labels for the same things:
 *
 *   walk-in                      appointment
 *   -------------------------    --------------------------------
 *   Customer: Jay                Customer: Ben Griffin
 *   Arrived: 12:36               Arrival time: 11:28
 *   Car type: New                New / Used: New
 *   Models of interest: 1, 2     Models: 1 Series
 *   Logged by: Lisa Debono       Appointment time: 12:00 (2026-09-05)
 *                                Owner: Daniel Cane
 *                                Booking type: Appointment
 *
 * Every pattern is anchored to the start of a line (^ with the m flag).
 * That is not fussiness. An unanchored /arrived\s*[:\-]\s*(.+)/ matches the
 * "Arrived:" line while looking for the customer, and the first version of
 * this put "12:36" on the wall as somebody's name.
 * Run preview() after any change here. */
var PATTERNS = {
  /* Subject often has the FULL name ("Walk-in waiting - Hans Upe") while
     the body Customer: line is first-name only ("Hans"). Prefer subject. */
  customerSubject: [/^Walk-in waiting\s*[-:]\s*(.+)$/im,
                    /^Appointment waiting\s*[-:]\s*(.+)$/im,
                    /^.*?\bwaiting\s*[-:]\s*(.+)$/im],
  customer:   [/^[^\n]*Customer(?:\s*name)?[ \t]*[:\-][ \t]*([^\n\r<]+)$/im,
               /Customer(?:\s*name)?[ \t]*[:\-][ \t]*([^\n\r<]+)/i,
               /has taken the (?:walk-in )?customer\s+([^.\n]+)/i,
               /^([A-Z][^\n]{0,60}?)\s+has checked in for their appointment/im,
               /\b([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,3})\s+has just been checked-?in/i,
               /\b([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,3})\s+needs to be seen by a sales exec/i,
               /\b([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,3})\s+has been checked in/i],
  /* who has SAT DOWN with them, out of the pick-up email */
  seenBy:     [/^[ \t]*Sales\s*exec(?:utive)?[ \t]*[:\-][ \t]*(.+)$/im,
               /^(.+?)\s+has taken the (?:walk-in )?customer/im,
               /^[ \t]*Assigned\s*to[ \t]*[:\-][ \t]*(.+)$/im],
  /* whose appointment it is. "Owner" on the appointment emails; the walk-in
     emails carry no such line, which is right - nobody is expecting them. */
  bookedWith: [/^[ \t]*Owner[ \t]*[:\-][ \t]*(.+)$/im,
               /^[ \t]*Booked\s*with[ \t]*[:\-][ \t]*(.+)$/im,
               /^[ \t]*Appointment\s*with[ \t]*[:\-][ \t]*(.+)$/im],
  /* the time reception recorded, which beats the email's own timestamp if
     the mail sat in a queue or a scanner on the way */
  arrivedAt:  [/^[^\n]*Arriv(?:ed|al[ \t]*time)[ \t]*[:\-][ \t]*(\d{1,2}[:.]\d{2})/im,
               /Arriv(?:ed|al[ \t]*time)[ \t]*[:\-][ \t]*(\d{1,2}[:.]\d{2})/i],
  apptTime:   [/^[ \t]*Appointment[ \t]*time[ \t]*[:\-][ \t]*(\d{1,2}[:.]\d{2})/im],
  /* what they came in for - the line that makes an executive get up */
  carType:    [/^[^\n]*Car[ \t]*type[ \t]*[:\-][ \t]*([^\n\r<]+)$/im,
               /Car[ \t]*type[ \t]*[:\-][ \t]*([^\n\r<]+)/i,
               /^[ \t]*New[ \t]*\/[ \t]*Used[ \t]*[:\-][ \t]*(.+)$/im,
               /New[ \t]*\/[ \t]*Used[ \t]*[:\-][ \t]*([^\n\r<]+)/i],
  models:     [/^[^\n]*Models?(?:[ \t]*of[ \t]*interest)?[ \t]*[:\-][ \t]*([^\n\r<]+)$/im,
               /Models?(?:[ \t]*of[ \t]*interest)?[ \t]*[:\-][ \t]*([^\n\r<]+)/i],
  /* THE BEST KEY THERE IS. The emails carry a link back to the record:
       ...dashboard?engage=FjZaSpiEe0cHFgZpELij&type=appointment
     That id is unique to one visit, so where both the arrival and the
     pick-up email carry it, a pick-up can be tied to its own arrival
     exactly - no guessing from a first name and a clock. */
  ref:        [/[?&]engage=([A-Za-z0-9_-]{6,})/],
  /* how we tell a booked customer arriving from somebody off the street */
  isBooked:   [/^[ \t]*Booking[ \t]*type[ \t]*[:\-][ \t]*Appointment/im,
               /has checked in for their appointment/i,
               /^[ \t]*Owner[ \t]*[:\-]/im],
  isWalkIn:   [/^[ \t]*Booking[ \t]*type[ \t]*[:\-][ \t]*Walk/im,
               /\bwalk[\s-]?in\b/i]
};

/* A card drops off by itself after this long, in case nobody archives it. */
var STALE_MINS = 240;

/* How many threads to look at per scan. Plenty for a showroom, and it keeps
   each run well inside the Apps Script runtime quota. */
var MAX_THREADS = 40;

/* ===================== nothing below needs editing ==================== */

var CACHE_KEY = 'showroom_arrivals_v1';

/* The widget asks for this. It only ever reads the cache, so it returns in a
   fraction of a second - the Gmail work happens on the trigger instead. That
   split is what keeps 4 screens polling all day inside the quota. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var want = PropertiesService.getScriptProperties().getProperty('TOKEN');

  if (want && p.token !== want) {
    return out({ error: 'bad token' }, p.callback);
  }

  var body = readCache();
  if (!body) {
    /* nothing cached yet - do one scan now rather than show an empty
       showroom, which would read as "nobody is waiting" and be wrong */
    try { refresh(); body = readCache(); } catch (err) {
      return out({ error: String(err) }, p.callback);
    }
  }
  return out(body || { appointments: [] }, p.callback);
}

/* Apps Script and browser CORS do not always get along, and a screen on a
   wall is the wrong place to discover that. With ?callback= it answers as
   JSONP instead, which sidesteps CORS entirely. */
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
  /* the cache can evict; properties survive, so a screen never reads empty */
  PropertiesService.getScriptProperties().setProperty(CACHE_KEY, s);
}

/* The trigger runs this. Everything expensive lives here. */
function refresh() {
  var rows = scan();
  writeCache({ appointments: rows, scannedAt: Date.now() });
  return rows.length;
}

function scan() {
  var seen = seenNames();
  var cutoff = Date.now() - STALE_MINS * 60000;
  var out = [];

  GmailApp.search(SEARCH, 0, MAX_THREADS).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      var when = m.getDate().getTime();
      if (when < cutoff) return;

      var subject = m.getSubject() || '';
      var body = messageText(m);
      var text = subject + '\n' + body;

      var name = customerNameFrom(body, subject);
      var booked = firstOf(PATTERNS.bookedWith, body, subject);
      var appt = firstOf(PATTERNS.apptTime, body, subject);
      /* "Booking type: Walk-in/Appointment" is definitive where it appears.
         Otherwise the wording decides, and only then the presence of an
         owner. Checked in that order because the appointment email says
         "walk-in" nowhere, and the walk-in email has no owner. */
      var isBooked = anyMatch(PATTERNS.isWalkIn, text) ? false
                   : anyMatch(PATTERNS.isBooked, text) ? true
                   : !!booked;

      /* Reception's own "Arrived: 12:36" beats the email's timestamp: the
         mail passes through an external-sender scanner on the way in, and a
         few minutes in a queue would otherwise show as a few minutes less
         standing about. Falls back to the timestamp if the line is missing
         or nonsense. */
      var stated = firstOf(PATTERNS.arrivedAt, body, subject);
      var arrived = stated ? clockOn(when, stated) : null;
      if (arrived === null) arrived = when;

      /* Match a pick-up to its arrival. The record id off the engage link is
         exact where both emails carry it; otherwise fall back to name plus
         recorded arrival time. These emails carry first names only - "Jay",
         "Chris" - and two Chrises in a morning is not far-fetched, so name
         alone would clear the wrong card. */
      var ref = firstOf(PATTERNS.ref, body, subject);
      var hit = findPickup(seen, ref, name, arrived);
      var withStaff = !!hit, staff = hit ? hit.staff : '';

      out.push({
        id: m.getId(),
        arrivalTime: arrived,
        customerName: sanitizeName(name) || (isBooked ? 'Appointment' : 'Walk-in'),
        type: isBooked ? 'appointment' : 'walk-in',
        appointmentTime: appt ? clockOn(when, appt) : null,
        bookedWith: clean(booked),
        /* what they came in for - the line that makes an executive get up */
        carType: clean(firstOf(PATTERNS.carType, body, subject)),
        models: clean(firstOf(PATTERNS.models, body, subject)),
        ref: ref || '',
        status: withStaff ? 'with-staff' : 'waiting',
        assignedTo: staff,
        /* internal only - tells the dedupe below whether arrivalTime came
           from reception or from the email's own clock. Removed there. */
        statedTime: !!stated
      });
    });
  });

  /* Collapse a resent notification into one card, WITHOUT collapsing two
     different people who happen to share a first name.
     Keying on the name alone does the second thing: these emails carry
     "Chris", not a surname, so a second Chris walking in at 13:20 silently
     replaced the one who arrived at 10:43 and never appeared on the screen
     at all. Somebody standing in the showroom invisibly is worse than a
     duplicate card.
     The recorded arrival time separates them: a resend repeats "Arrived:
     10:43", a different person does not. Where that line is missing there is
     nothing to tell them apart, so fall back to the name and accept that a
     resend may double up - a spare card is the safer way to be wrong. */
  var byPerson = {}, ordered = [];
  out.forEach(function (r) {
    var k = r.ref ? 'ref:' + r.ref
          : key(r.customerName) + '|' +
            (r.statedTime ? hhmm(r.arrivalTime) : 'unknown');
    delete r.statedTime;
    if (!byPerson[k]) { byPerson[k] = r; ordered.push(r); }
    else if (r.arrivalTime < byPerson[k].arrivalTime) {
      byPerson[k].arrivalTime = r.arrivalTime;   /* keep the first arrival */
    }
  });
  return ordered;
}

/* Who has been picked up. Each entry carries WHEN, because a pick-up only
   counts for an arrival it came after.
   Without that time check, a "sat with" email from an earlier visit marks a
   fresh arrival as already being served - somebody walks in, the screen says
   "now with Dan", and they get left standing there. That is the worst thing
   this screen could do, so the check is not optional. */
function seenNames() {
  var map = {};
  if (!SEEN_SEARCH) return map;
  GmailApp.search(SEEN_SEARCH, 0, MAX_THREADS).forEach(function (t) {
    t.getMessages().forEach(function (m) {
      var subject = m.getSubject() || '';
      var body = messageText(m);
      var who = customerNameFrom(body, subject);
      if (!who) return;
      var by = clean(firstOf(PATTERNS.seenBy, body, subject)) ||
               'a member of staff';
      var when = m.getDate().getTime();

      /* The pick-up email repeats the customer's arrival time, so it can be
         tied to one specific arrival rather than to a first name. Both keys
         are stored: the precise one, and the loose one as a fallback for
         when the arrival line is missing. */
      var stated = firstOf(PATTERNS.arrivedAt, body, subject);
      var at = stated ? clockOn(when, stated) : null;
      var rec = { staff: by, at: when, arrived: at };

      /* The record id is the strongest key when the pick-up email carries
         the engage link back to the same visit. */
      var ref = firstOf(PATTERNS.ref, body, subject);
      if (ref) put(map, 'ref:' + ref, rec);
      put(map, key(who), rec);
      if (at !== null) put(map, key(who) + '@' + hhmm(at), rec);
    });
  });
  return map;
}


/* Prefer plain text; if the labelled fields are missing (common with
   HTML-only arrival mail), strip tags from the HTML body and try that. */
function messageText(m) {
  var plain = '';
  try { plain = m.getPlainBody() || ''; } catch (e) {}
  if (/Customer(?:\s*name)?\s*[:\-]/i.test(plain)
      || /has just been checked-?in/i.test(plain)
      || /needs to be seen by a sales exec/i.test(plain)) {
    return plain;
  }
  var html = '';
  try { html = m.getBody() || ''; } catch (e) {}
  if (!html) return plain;
  var stripped = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
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
    .trim();
  return stripped || plain;
}

function first(pats, text) {
  for (var i = 0; i < pats.length; i++) {
    var m = text.match(pats[i]);
    if (m && m[1]) return m[1];
  }
  return '';
}

/* Body first, subject second.
   A subject is usually a headline ("Ms Okafor - now with sales executive")
   while the body carries the labelled field ("Now with: Dan"). Searching one
   joined string takes whichever comes first, which is the subject, so the
   card ended up saying "now with sales executive". Look in the body, and only
   fall back to the subject if it has nothing. */
function firstOf(pats, body, subject) {
  return first(pats, body || '') || first(pats, subject || '');
}
function anyMatch(pats, text) {
  for (var i = 0; i < pats.length; i++) if (pats[i].test(text)) return true;
  return false;
}


/* Body "Customer: Hans" plus subject "Walk-in waiting - Hans Upe" -> prefer
   the longer subject form when it clearly belongs to the same person. */
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
      || low === 'the customer' || low === 'appointment'
      || /^sales\b/.test(low) || /checked-?in/.test(low)
      || /needs to be seen/.test(low) || /sales exec/.test(low)) return '';
  return s;
}

function clean(s) {
  return String(s || '').replace(/[\r\n].*$/, '').replace(/[<>].*$/, '')
                        .replace(/\|.*$/, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}
function key(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }

/* the most recent pick-up for a key is the one that counts */
function put(map, k, rec) {
  if (!map[k] || rec.at > map[k].at) map[k] = rec;
}

/* Find the pick-up belonging to THIS arrival, and only if it came after it.
   Without the time check a "has taken" email from an earlier visit marks a
   fresh arrival as already being served - somebody walks in, the screen says
   "now with Clive", and they are left standing there. */
function findPickup(seen, ref, name, arrived) {
  /* the record id is unique to one visit - if it matches, we are done */
  if (ref && seen['ref:' + ref]) return seen['ref:' + ref];
  if (!name) return null;
  var exact = seen[key(name)+'@'+hhmm(arrived)];
  var loose = seen[key(name)];
  var hit = exact || loose;
  if (!hit) return null;
  /* a minute of slack: the two emails can leave in either order */
  if (hit.at < arrived - 60000) return null;
  /* a loose match that names a DIFFERENT arrival time is somebody else */
  if (!exact && hit.arrived !== null && hit.arrived !== undefined
      && Math.abs(hit.arrived - arrived) > 60000) return null;
  return hit;
}

function hhmm(ms) {
  var d = new Date(ms), p = function (n) { return n < 10 ? '0' + n : '' + n };
  return p(d.getHours()) + p(d.getMinutes());
}

/* "12:36" on the same DAY as the given moment, as epoch ms.
   Anchored to the email rather than to "today" so a screen reading
   yesterday's mail, or one running over midnight, does not place an
   arrival on the wrong day. Returns null if the result lands somewhere
   implausible, so the caller falls back to the timestamp. */
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

/* ---------------------------------------------------------------------
   Run this by hand after changing SEARCH or PATTERNS. It prints what the
   script makes of the real emails, so the parsing can be checked before
   anything goes on a screen - rather than finding out on the wall that
   every card says "Walk-in" because a regex missed.
   --------------------------------------------------------------------- */
function preview() {
  var threads = GmailApp.search(SEARCH, 0, 5);
  Logger.log('SEARCH matched %s threads', threads.length);
  if (!threads.length) {
    Logger.log('Nothing matched. Widen SEARCH, or check the notification '
             + 'emails actually land in THIS mailbox.');
    return;
  }
  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      var body = messageText(m);
      Logger.log('--- %s | %s', m.getDate(), m.getSubject());
      Logger.log('body head: %s', String(body).slice(0, 500));
    });
  });
  var rows = scan();
  Logger.log('\nWhat the screen would show (%s):', rows.length);
  rows.forEach(function (r) {
    Logger.log('  %s | %s | arrived %s | booked with %s | %s',
      r.customerName, r.type, new Date(r.arrivalTime), r.bookedWith || '-', r.status);
  });
  Logger.log('\nAny name reading "Walk-in"/"Appointment" means PATTERNS.customer '
           + 'did not match - paste a real email body and adjust it.');
}
