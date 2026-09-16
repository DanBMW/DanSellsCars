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
 *   - A pick-up is matched to an arrival BY CUSTOMER NAME, so both emails
 *     have to name the customer. If the pick-up email only says which
 *     executive is busy, there is nothing to match on and the card stays
 *     waiting.
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

/* Which emails are an arrival. Keep `in:inbox` - that is what makes
   archiving an email clear the card. Narrow `from:` to the real sender. */
var SEARCH = 'in:inbox newer_than:1d subject:(walk-in OR "walk in" OR arrived OR "has arrived")';

/* Emails that mean a sales executive is now sat with the customer. The
   system does send one, so this is what turns a card green and puts
   "now with <name>" on it. Tune it to the real subject line.
   Note this does NOT need `in:inbox`: a pick-up is a fact, and it should
   still count if somebody has tidied the mailbox. */
var SEEN_SEARCH = 'newer_than:1d subject:("now with" OR "sat with" OR "in progress" OR "being seen" OR assigned)';

/* Pulled out of the subject and body. First group of the first pattern that
   matches wins; nothing matching is not an error, the card just says less.
   Run preview() to see what these are actually catching. */
var PATTERNS = {
  customer:   [/customer(?:'s)?\s*name\s*[:\-]\s*(.+)/i,
               /(?:walk[\s-]?in|arrival|arrived)\s*[:\-]\s*(.+)/i,
               /^(?:new\s+)?(?:walk[\s-]?in|arrival)\s*[\-–]\s*(.+)$/i,
               /\bname\s*[:\-]\s*(.+)/i],
  bookedWith: [/(?:booked|appointment)\s+with\s*[:\-]?\s*(.+)/i,
               /sales\s*(?:exec|executive|advisor)\s*[:\-]\s*(.+)/i,
               /\bexecutive\s*[:\-]\s*(.+)/i],
  apptTime:   [/appointment\s*(?:time)?\s*[:\-]\s*(\d{1,2}[:.]\d{2})/i,
               /\bat\s+(\d{1,2}[:.]\d{2})\b/i],
  /* who has SAT DOWN with them, out of the pick-up email - kept apart from
     bookedWith on purpose, since the two are often different people */
  seenBy:     [/(?:now|sat|sitting|seated)\s+with\s*[:\-]?\s*(.+)/i,
               /assigned\s+to\s*[:\-]?\s*(.+)/i,
               /(?:being\s+)?(?:seen|handled)\s+by\s*[:\-]?\s*(.+)/i,
               /sales\s*(?:exec|executive|advisor)\s*[:\-]\s*(.+)/i],
  /* how we tell a booked customer arriving from somebody off the street */
  isBooked:   [/\bappointment\b/i, /\bbooked\b/i, /\bexpected\b/i]
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
      var body = '';
      try { body = m.getPlainBody() || ''; } catch (e) {}
      var text = subject + '\n' + body;

      var name = firstOf(PATTERNS.customer, body, subject);
      var booked = firstOf(PATTERNS.bookedWith, body, subject);
      var appt = firstOf(PATTERNS.apptTime, body, subject);
      var isBooked = !!booked || anyMatch(PATTERNS.isBooked, text);

      /* only a pick-up that happened AT OR AFTER this arrival counts - see
         seenNames(). A minute of slack, because the two emails can leave in
         either order when reception is quick. */
      var withStaff = false, staff = '';
      var hit = name ? seen[key(name)] : null;
      if (hit && hit.at >= when - 60000) { withStaff = true; staff = hit.staff; }

      out.push({
        id: m.getId(),
        /* The email's own timestamp IS the arrival time - exact, and no
           parsing to get wrong. Do not swap this for a time scraped out of
           the body unless the emails turn out to be delayed. */
        arrivalTime: when,
        customerName: clean(name) || (isBooked ? 'Appointment' : 'Walk-in'),
        type: isBooked ? 'appointment' : 'walk-in',
        appointmentTime: appt ? todayAt(appt) : null,
        bookedWith: clean(booked),
        status: withStaff ? 'with-staff' : 'waiting',
        assignedTo: staff
      });
    });
  });

  /* one card per person, keeping their FIRST arrival - a reminder or a
     duplicate notification must not restart somebody's waiting timer */
  var byPerson = {}, ordered = [];
  out.forEach(function (r) {
    var k = key(r.customerName) + '|' + (r.type || '');
    if (!byPerson[k]) { byPerson[k] = r; ordered.push(r); }
    else if (r.arrivalTime < byPerson[k].arrivalTime) {
      byPerson[k].arrivalTime = r.arrivalTime;
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
      var subject = m.getSubject() || '', body = '';
      try { body = m.getPlainBody() || ''; } catch (e) {}
      var who = firstOf(PATTERNS.customer, body, subject);
      if (!who) return;
      var by = clean(firstOf(PATTERNS.seenBy, body, subject)) ||
               clean(firstOf(PATTERNS.bookedWith, body, subject)) ||
               'a member of staff';
      var k = key(who), when = m.getDate().getTime();
      /* the most recent pick-up for that person is the one that counts */
      if (!map[k] || when > map[k].at) map[k] = { staff: by, at: when };
    });
  });
  return map;
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
function clean(s) {
  return String(s || '').replace(/[\r\n].*$/, '').replace(/[<>|].*$/, '')
                        .replace(/\s+/g, ' ').trim().slice(0, 60);
}
function key(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }

/* "10:30" -> today at 10:30, as epoch ms */
function todayAt(hhmm) {
  var m = String(hhmm).match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  var d = new Date();
  d.setHours(+m[1], +m[2], 0, 0);
  return d.getTime();
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
      Logger.log('--- %s | %s', m.getDate(), m.getSubject());
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
