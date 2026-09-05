# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

The website for **dan-sells.co.uk** (see `CNAME`) — a personal lead-generation
site for Dan, a BMW sales executive. It is a flat collection of static pages in
the repo root; there is **no build step, no framework, no package.json**. Edit
the HTML/CSS/JS directly and push.

## Tech stack

- **Static HTML + CSS + vanilla JS**, hosted on **GitHub Pages** from the repo
  root. Most styling and scripting is inline per page; shared assets are
  `style.css`, `funnel.css`, `funnel-ui.js`, `ev-funnel-ui.js`, `vip-ui.js`,
  `vip.css`, `contact.js`, `disclaimer.js`, `scroll-hint.js`.
- **Firebase Realtime Database + Storage** (project `forecourt-1b6bc`,
  `europe-west1`) is the backend for the forms that persist data:
  `Forecourt.html`, `combined-form.html` / `combined-download.html`,
  `rav-form.html` / `rav-download.html`, `commission-disclosure.html` /
  `commission-download.html`, the `forecourt-frenzy*.html` games, and
  `team-board.html`. Rules
  live in `database.rules.json` and `storage.rules` (deployed via
  `firebase.json`) — keep them in sync with any new DB paths.
- **Cloudflare Worker** — `worker.js` is the source of the worker deployed at
  `https://vehicleproxy.danielcane1992.workers.dev`. It holds the API secrets
  and proxies, selected by a `?target=` query param:
  - `dvla-lookup` — DVLA Vehicle Enquiry Service (reg → make/model/tax/MOT)
  - `vehicle-lookup` — DVSA MOT History API
  - `market-start` / `market-poll` — AutoTrader market-price scrape via an
    Apify actor (`Ca7tBqNduWgy2A2pq`)

  Editing `worker.js` in this repo does **not** deploy it — it must be
  re-deployed to Cloudflare manually. Pages that call the worker include
  `tradevalue.html`, `step5.html`, `sq1.html`, `sq3.html`, `ap1.html`,
  `ev-step4.html`, `EV.html`, `vip4.html`.

## Site structure: the funnels

The site is organised as multi-page funnels. Each funnel stores answers in
`sessionStorage` as the visitor advances, then submits everything in one go on
the final step.

| Pages | Funnel |
|---|---|
| `step1.html`–`step8.html` (+ `step1b`) | **"Find my BMW"** — 8-step new/used car matching brief. Entry: `start.html`, though the homepage's own hero/route-card CTAs link straight to `step1.html` — `start.html` currently has no inbound links from the site itself (only `sitemap.xml`). `step1b` is step 2. `step4.html`, `step4b/c/m.html` and `step6.html` are retired redirect stubs (→ `step3.html` / `step7.html`) kept only so old links still resolve — there is no live part-exchange branching logic behind them any more. Shared behaviour (silent resume, progress bar, brief ticket) lives in `funnel-ui.js` + `funnel.css`. Submits on `step8.html` → `thankyou.html` / `wait.html`. |
| `sq1.html`–`sq3.html` (+ `sq_done`) | **Service Qualifier ("Ramp Report")** — reg-first flow for customers whose car is in for service (entry: `service.html`). sq1 reg-plate input + DVLA lookup + market-scrape kick-off, sq2 vehicle reveal + openness, sq3 contact + locked-value teaser, submits on `sq3.html` → `sq_done.html` (booking-first, cal.eu links). Market prices are captured into Dan's Formspree email only — **never shown to the customer**. Funnel copy uses plain hyphens, no en/em dashes (Dan's rule). `sq4`–`sq7` and `sq6b` are retired redirect stubs → `sq1.html`. |
| `yourcar.html` | **Ramp Report personal share link** — Dan sends `yourcar.html?reg=AB12CDE&n=Kate&d=Friday` (built via the widget on `links.html`; `d` is the optional service day, echoed in the greeting); the plate arrives pre-filled, the customer confirms car + mileage then taps **"I'm interested"** (screen 1) and books (cal.eu / WhatsApp). Personalised page: keep `noindex` and out of `sitemap.xml`. Both `sq1.html` and `yourcar.html` carry a tap-to-play voice note from Dan (`dan-service-intro.mp3`, GA event `dan_audio_play`). |
| `yourbrief.html` | **Optional deep-dive brief** — nudged from `yourcar.html` stage 2 and `sq_done.html` after the initial interest/booking stages. Single page, five skippable stages (direction, timing, payment + budget, PX intent, recap ticket + notes), reuses identity from `sessionStorage` (never re-asks for what Dan has), **one** Formspree submission on send. |
| `vip.html`, `vip1.html`–`vip7.html` (+ `vip-done`) | **VIP Buyers Event pre-qualification** — off-site, invitation-only flow for the yearly buyers event. The event **runs across four days**, and each customer gets a **1 hour** appointment on their chosen day instead of the usual 2.5, so the groundwork has to be done beforehand. Copy says "on the day", never "on the night". `vip.html` is the personalised red-carpet landing page (`?n=`name `&d=`the dates the event runs across `&t=`the customer's own day and time `&v=`venue `&reg=`plate, built by the widget on `links.html`); the 7 steps mirror the Find my BMW funnel (shortlist, body style + new/used, budget, part exchange with DVLA/MOT lookup, on-the-day readiness, details, review) and submit **once** on `vip7.html` → `vip-done.html`. Shared behaviour in `vip-ui.js` + `vip.css`; hero artwork is `vip-carpet.jpg`. Personalised and internal: keep every page `noindex`, out of `sitemap.xml`, and never linked from a public page. |

**Formspree is rationed** (submission volume costs money): `yourcar.html`
sends exactly one interest email per customer ("I'm interested" tap);
booking taps are GA `booking_tap` events only — cal.eu confirms real
bookings itself; `yourbrief.html` sends one email per completed brief.
One deliberate exception (Dan's request): the "skip the form" hatch on
`sq1.html` (WhatsApp/Email) fires one skip-signal email per session with
the typed reg, so Dan knows a prospect chose the direct route. Don't add
other per-step or per-tap Formspree calls to these flows.
The VIP flow follows the same rule: `vip7.html` sends exactly one email per
completed pre-qualification (guarded by the `vipSent` session key so a
refresh or a back-tap cannot re-fire it), and `vip.html`/`vip-done.html`
send nothing at all.
| `ev-step1.html`–`ev-step7.html` (+ `ev-thankyou`) | **BMW EV Finder** — EV-specific matching funnel (entry: `EV.html` / `ev.html`). Shared behaviour in `ev-funnel-ui.js`. Submits on `ev-step6.html`. |
| `ap1.html`–`ap6.html` | **Vehicle Appraisal** — customer self-appraisal of their current car (entry: `appraisal.html`). Submits on `ap5.html`, confirmation on `ap6.html`. |

Other notable pages: offer landing pages (`ix3-offer.html`, `x1-offer.html`,
`1series-offer.html`, `offers.html`), valuation tools (`tradevalue.html`
customer-facing, `Value.html` trade tool), dealership pages
(`bmw-sevenoaks.html`, `bmw-sidcup.html`), and legal pages (`privacy.html`,
`terms.html`, `commission-disclosure.html`, `disclaimer.js`).

## Shared IDs and endpoints

- **GA4 property `G-XZL1RF6SV6`** — the gtag snippet is pasted into the
  `<head>` of nearly every page individually. A new page needs the snippet
  added; a property change means editing every page.
- **Formspree endpoint `https://formspree.io/f/xqewleog`** — the single form
  backend for all lead submissions: funnel final steps (`step8.html`,
  `ev-step6.html`, `ap5.html`, `sq3.html`, `vip7.html`), `yourcar.html` interest pings,
  `yourbrief.html`, `contact.js`, `tradevalue.html`,
  `index.html`, offer pages, `combined-form.html`, `rav-form.html`,
  `commission-disclosure.html`, `refer.html`, `thankyou.html`, `wait.html`,
  and more. Search for `formspree.io` before changing anything about the
  payload shape.

## GA4 events — analytics.js

`analytics.js` (included with `<script src="analytics.js" defer>` on every
GA-tagged page) fires the conversion events; keep its slug→step map in sync
when adding/renaming funnel pages. Events:

- `<funnel>_step_<n>` — funnel step view. Funnels: `fmb` (Find my BMW,
  steps 1–8), `ev` (EV Finder, 1–6), `sq` (Service Qualifier, 1–3),
  `ap` (Appraisal, 1–5), `vip` (VIP Buyers Event, 1–7). Redirect pages fire
  nothing. `vip.html` is the invitation landing page, not a step: it fires
  its own `vip_invite_view` and `vip_start`.
- `<funnel>_complete` — confirmation page view (`thankyou`/`wait`,
  `ev-thankyou`, `sq_done`, `ap6`, `vip-done`), deduped per session.
- `generate_lead` `{form_page}` — any Formspree submission (a `fetch`
  wrapper detects formspree.io calls, so new forms are tracked for free).
- `whatsapp_click` `{link_location: float|header|drawer|inline}` — any
  `wa.me` link click (delegated listener).
- `share` `{method: native, ref_code}` — the "Share my BMW story" native share.
- `referral_visit` `{ref_code}` — landing with `?ref=CODE` from a shared
  story link. The code persists 90 days (localStorage `dsRefBy`) and is
  stamped onto later `generate_lead` events and injected into Formspree
  payloads as `referral_code`, so referred leads are visible in Dan's email.

## Story sharing / referral loop — story-share.js

`thankyou.html` and `ev-thankyou.html` share one module, `story-share.js`
(loaded blocking in `<head>`, before the inline scripts that call it).
(`sq_done.html` used it too until the Service Qualifier became the reg-first
"Ramp Report" — that page is now booking-only.) Each page keeps its own `socialify()` copy scrubbing (surname,
exact £ figures) and calls `dsStoryShare.init({social, firstName, tagline,
fileName, shareTitle})`. The module mints the visitor's referral code
(e.g. `KATE-7X2M`, localStorage `dsMyRef`), rewrites the `dan-sells.co.uk`
mention in the share text to `dan-sells.co.uk/?ref=CODE`, draws the 1080×1080
share card (story + code + URL), provides the global `copyStory()` /
`shareInstagram()` button handlers, and fills each page's `#refNudge` with
the £250-credit/£125-cash nudge that points at `refer.html`.

## Shared header/drawer/footer — edit partials, then run build.js

The site header, nav drawer, and footer live in `partials/header.html`,
`partials/drawer.html`, `partials/footer.html`. Each page that carries them
contains the stamped markup between marker comments:

```html
<!-- chrome:header {"wa":"...optional per-page vars..."} -->
...stamped content — never edit this by hand...
<!-- /chrome:header -->
```

To change the chrome: edit the partial, run **`node build.js`** (no
dependencies), and commit both the partial and the restamped pages. CI
(`.github/workflows/chrome-check.yml`) runs `node build.js --check` and fails
if they're out of sync.

Per-page variation goes through `{{name|default}}` tokens in the partials,
overridden by the JSON on a page's opening marker. Current tokens: `wa`
(URL-encoded WhatsApp pre-fill message, header), `blurb1`/`blurb2` (footer
description lines), `legalTail` (extra sentence(s) at the end of the footer
legal paragraph — used by `bmw-pcp-explained.html` and
`bmw-finance-compared.html` for their finance disclaimers).

Pages without the chrome markers (all funnel pages, plus
`business-proposal.html`/`finance-proposal.html` which have their own minimal
header) are untouched by the build. The GA4 snippet and other `<head>` content
are still duplicated per page — only the header/drawer/footer are templated.

## Staff-only pages — must stay noindex

- `Forecourt.html` — internal forecourt stock check tool (PIN-gated,
  Firebase-backed).
- `newcar.html` — upload page for the new car manager's daily 76 Plate
  leaderboard screenshot. PIN-gated, writes to `newcar/current`. Like the
  board, its UI runs from a plain script so a blocked Firebase CDN cannot
  leave a dead page.
- `team-board.html` — the **£15,000 Profit Challenge** board: a live race-to-the-
  top scoreboard for the used car team (the digital replacement for the paper
  board on the showroom wall). Public to view by URL, but adding/editing deals
  is behind the manager PIN. Team photos live in `team/` (see below).
- `links.html` — Dan's internal links/dashboard page (includes the Formspree
  record-ID → PDF download widgets, the Ramp Report link builder with its
  localStorage sent-log, the VIP Buyers Event invitation builder with its own
  `dsVipLog` sent-log, and the print-materials links).
- `vip.html` and `vip1.html`–`vip7.html` / `vip-done.html` — the VIP Buyers
  Event pre-qualification. Sent by personal link only, never linked publicly.
- `print-car-card.html` / `print-car-card-dark.html` — A4 in-car cards for
  service customers (QR → `sq1.html?utm_source=car-qr`, referral QR →
  `refer.html?utm_source=car-qr`). QRs are inline SVG; regenerate if the
  target URLs ever change.
- **The games are internal-only, never customer-facing** (Dan's ruling):
  `forecourt-frenzy.html`, `forecourt-frenzy-classic.html`,
  `world-cup-tracker-live-leaderboard.html`, `sweepstake-2026.html`.

These must never be linked from public pages, must stay **out of
`sitemap.xml`**, and must carry
`<meta name="robots" content="noindex, nofollow">`. Do not remove that meta
tag, and do not add these pages to any nav.

## The Profit Challenge board — team-board.html

A single self-contained page; no build step, no shared assets. It replaces the
hand-drawn £15,000 challenge board that lived on the showroom wall.

- **Team roster** is the `TEAM` array at the top of the page script — id,
  initials, display name and photo path, in the same left-to-right order as the
  old paper board (DW, CA, MS, KJ, CH, TA, DC, MD). Changing the team means
  editing that array **and** the `exec` regex in `database.rules.json`, which
  whitelists the same eight ids.
- **Photos** are in `team/` (`dw|ca|ms|kj|ch|ta|dc|md.jpg`, plus `will.jpg` and
  `serge.jpg` for the two mascots at the top). All are 360×240 and framed the
  same way, so the CSS crops them with one shared `object-position`. They came
  from the Hedin Automotive Ruxley BMW team page, except `ms.jpg` (Mon Singh),
  who is not on that page — his was cropped from a photo Dan supplied. A missing
  photo degrades to an initials tile rather than a broken image.
- **Data** lives at `profitchallenge/months/<YYYY-MM>/deals/<pushId>` as
  `{exec, profit, reg, ts}`. The month key is derived from the clock, so the
  board **auto-rolls on the 1st** and every finished month stays readable via
  "Past months". Nothing needs resetting by hand.
- **Month tabs** sit under the title on the board itself: every month that has
  deals, plus the current one, plus anything banked ahead (dashed, gold when
  selected). It always opens on the current month. `renderMonthTabs()` builds
  them from `backend.months()`, capped to the last eleven past months. A board
  left on a finished month reverts to the live one after three minutes of no
  interaction - a wall display stuck on July is a broken board. The tabs
  replaced the old "Past months" modal, which did the same job less directly.
- **Next month ahead of time.** The manager panel has a two-way month selector:
  the live month, or the next one, for cars sold at the end of a month that will
  not be collected until the following one. Those deals are written straight to
  `profitchallenge/months/<next>/deals`, stay off the live board, and appear by
  themselves when the clock rolls over. Leaving the panel always returns the
  wall display to the live month, so nobody can walk off and leave next month on
  the screen. `monthState()` is the single source of truth for how a month is
  labelled (live / next month / finished) - `showMonth()` and `dsOnDeals()` both
  use it.
- **Manager access** is the same shared PIN pattern as `Forecourt.html`
  (`PIN` constant in the page). Note this is a client-side gate: the DB rules
  allow anyone to write to `profitchallenge`, so the PIN stops accidents, not a
  determined visitor. The rules do validate shape — known `exec` id, numeric
  `profit` within ±100000, short `reg` — and are scoped so a bad write cannot
  touch any other path. Move to Firebase Auth if the figures ever need to be
  genuinely private.
- **Will and Serge are animated cheerleaders** (inline SVG bodies + pom poms,
  their team photos as heads) and their speech bubbles rotate every 7.5s from
  the `LINES` pools in the page — one pool per character per mood (`empty`,
  `trailing`, `middle`, `chasing`, `leader`, `close`, `champion`, `general`).
  `middle` and `chasing` carry most of the weight and name someone from the
  middle of the pack - picking on whoever is last every time gets old, and
  unfair - with `chasing` reading the live gap to the person above them. Will encourages, Serge
  stays unconvinced: that contrast is the joke from the paper board, so keep it
  if you add lines. `{name}` and `{amount}` are filled from the live board, a
  shuffle bag stops repeats until a pool is exhausted, and a new deal, new
  leader or new champion sets both of them cheering for four seconds. Note the
  pom pom `translate` sits on a wrapper `<g>` — a CSS `transform` animation on
  the same element would replace the attribute and fling it across the page.
- **One cut scene at a time.** `SCENES` is a running order (video, breakdance,
  video, Nathan, video, stats, video, fire) and `nextCutScene()` takes the next
  one roughly every five minutes. Because the video sits in every other slot
  that gives a sketch about every ten minutes - which is the figure Dan asks
  for - and each of the other four about every forty. Six independent schedules meant the board was
  interrupted every couple of minutes; one queue fixes that, and the sketches
  come round most often because there are nine of them. A scene that returns
  `false` - an empty board, nothing uploaded, another scene holding the floor -
  passes straight to the next rather than wasting the slot. The paper ball
  keeps its own frequent timer because it covers nothing.
- **Stunt timing.** `every()` runs its first outing soon after load rather than
  waiting a full interval. A wall display gets switched on and watched: waiting
  ten minutes for the first thing to happen makes it look broken, and every
  refresh restarts the clock.
- **Stunts.** Every 45-95s Will and Serge lob a paper ball across the board
  (`throwPaper()` - Web Animations API, coordinates read from the two heads at
  runtime so it works at any layout, target flinches on impact). Every 2.5-5
  minutes Nathan Jobson, the new car manager, slides in from the right to
  insist new cars are better (`nathanVisit()`, photo `team/nj.jpg`); Will tells
  him to leave and Serge takes his side. A `busy` flag stops the two stunts
  overlapping and `holdUntil` pauses the normal 7.5s rotation while one plays.
  Note the intruder animates `right`, not `transform` - and if you ever need to
  screenshot the overlay in headless Chromium, `page.screenshot` will not
  capture it; use CDP `Page.captureScreenshot` with `fromSurface:false`.
- **Nathan's arson attempt.** Every 14-19 minutes `nathanFire()` pins a flickering
  fire to the board's own bottom-left corner (read from the `.board` rect at
  runtime, clamped to the viewport so a scrolled phone still shows it) and
  Nathan turns up to claim credit. Will panics, Serge says "Let him cook." It
  burns for ten seconds and goes out.
- **The view rotation.** The wall display cycles through whatever there is to
  show, 30 seconds each (`VIEW_MS`, `views()`, `showView()`, `rotateView()`):
  the used car board, the new car leaderboard, then either manager's extra
  screenshot if they have put one up. These are **views, not cut scenes** -
  they never take the `busy` lock, and the image view sits at z-index 50 so
  every cut scene paints over whichever one is up. `views()` is rebuilt on
  every call, so an upload joins the cycle and a removal drops out of it with
  no restart; `showView()` clamps an index that has gone out of range. A
  manager opening the panel parks it back on the used car board, and Will and
  Serge have their say as it comes back to theirs.
- **Pinning a board.** The manager panel's "What's on the board" section holds
  the display on one board instead of cycling: the used car board, the new car
  leaderboard, either secondary screenshot, or back to Rotate
  (`VIEWPINS`, `pinnedView`, `applyPin()`, `setPinnedView()`). Like the sketch
  controls it goes through `boardcontrol`, but unlike the one-shot play command
  it is **state** - `boardcontrol/view`, an `{id, ts}` pair - so a screen
  switched on later comes up on the pinned board rather than starting to
  rotate. A pin holds the display through a manager opening the panel, since
  holding a board is the point, and **lapses after fifteen minutes**
  (`PIN_MS`): somebody holds a board up to talk to the team and walks off, and
  a wall display stuck on one screen all afternoon is a broken board. Every
  screen expires it off the same stored timestamp rather than one of them
  writing the reset, so there is no race, a screen switched on mid-pin adopts
  the right remainder, and one switched on after it lapsed comes up rotating.
  Pinning a slot nobody has uploaded to yet is allowed: the button is disabled
  while it is empty, and `applyPin()` keeps the used car board up and snaps onto
  the picture the moment it arrives (and back off it when it is removed).
- **The extra screenshots.** Either manager can put an arbitrary picture on the
  board with a caption above it - Will from the "Screenshot on the board"
  section of the board's own manager panel (`extra/used`), Nathan from a second
  optional slot beneath his leaderboard upload on `newcar.html`
  (`extra/newcar`). Both have a remove button, and a slot that is empty is
  simply skipped, so neither is ever a blank frame in the rotation. Both reuse
  the same in-browser shrink-to-a-data-URL step as the leaderboard upload
  (`shrinkShot()` on the board, `shrink()` on `newcar.html` - twins by
  necessity, since the board is deliberately self-contained; change both
  together).
- **Nathan and Will on the new car board.** The leaderboard view - and only
  that view, not an uploaded screenshot - carries its own pair of heads in the
  bottom corners with the same speech bubbles as Will and Serge, rotating every
  7.5s from the `NCCHAT` pools through the same shuffle bag (`ncChat()`,
  `ncChatLine()`). Nathan gloats about new cars, Will defends the used pitch;
  that opposition is the joke, so keep it if you add lines. They are **side
  rails level with the middle of the picture**, the same shape as Will and
  Serge on our own board. The `chatty` class narrows the image to leave room
  for them - by `calc(100vw - 540px)` as well as a percentage, because the
  rails are a fixed-ish width and a percentage alone lets them sit on the
  picture at laptop sizes. Below 1000px there is no room at all and the rails
  are hidden.
- **Dan's credit line.** A fixed `.credit` in the bottom-right corner at
  z-index 300, above every board, view and cut scene, so it reads on the wall
  whatever the display is showing. It is deliberately clear of the centred
  `.foot` and of both mascots at every screen size.
- **New car leaderboard.** Nathan uploads the daily 76 Plate
  screenshot from `newcar.html` (listed on `links.html`; its own PIN, separate
  from the board's manager PIN). The image
  is downscaled and JPEG-compressed **in the browser** and stored as a data URL
  at `newcar/current` in the database - Storage was avoided because its rules
  are not managed by `firebase.json` and would have been extra setup. The rules
  cap the string at 1.4MB and the page keeps to 1.3MB, shrinking in passes
  until it fits. Until the first upload it falls back to `newcar/seed.jpg`, a
  **clean rebuild** of Nathan's spreadsheet rather than a photo of his screen -
  source in `newcar/source/76-plate-leaderboard.html`, rendered at 1600x1000
  through headless Chromium, so the figures can be edited and re-rendered. The
  transcription off the photo was checked, not trusted: every row's five
  columns sum to its stated total, and the blue and green team totals (70 and
  123) sum to 193, the sum of all eight execs.
- **Team sketch cut scene.** `videoScene()` takes four of the eight slots in
  `SCENES`, so a sketch plays roughly every 10 minutes. It shows one of
  the AI-generated team sketches in `video/` full screen (`CLIPS` array; add a
  clip by adding a row with its `ar` = width/height - the clips are a mix of
  16:9 and portrait and the frame sizes itself from that, corrected from the
  file on `loadedmetadata`). It never plays the same one twice running. A 16s
  guard closes the scene if the file stalls - the board must never be left
  covered.
  **Sound.** Clips play with sound, except any carrying `sound:false` -
  sketch 4, the shredding sketch, which swears. That flag is not a preference:
  the board is on a showroom wall with customers in front of it.
  Browsers refuse to autoplay with sound until somebody has touched the page,
  and a wall display never gets touched, so `audioOk` only becomes true on the
  first tap or key press on that screen - before that, and if `play()` is
  refused anyway, the clip falls back to silent with the "sound off" badge
  rather than being dropped. Never let the fallback skip the clip: an empty
  slot on the wall is worse than a quiet one. The clips are warmed into the browser cache 20s after load on wide
  screens only, so a phone does not pull down thirty megabytes it will probably
  never play.
- **Manager control of the sketches.** The manager panel has a "Sketches"
  section: a toggle for the automatic slot and a play button per clip. Both go
  through `boardcontrol` in the database rather than staying local, because the
  manager is usually on their phone while the board is on the wall - a tap
  plays on every screen showing the board. `dsOnControl()` ignores the play
  command in the **first** snapshot it receives (that one is history - a screen
  switched on later must not replay it) and anything older than two minutes;
  anything else goes straight to `playNow()`, which **takes the floor**: it
  cuts short whatever scene is up and closes an open panel rather than queueing
  the clip behind them, because a manager pressing play expects it on the wall
  there and then. The toggle stops the automatic slot only: a manager pressing
  play still works with sketches switched off.
- **Cutting a scene short.** Every cut scene clears `busy` from its own timer,
  so a scene that is interrupted must not have that timer free the flag out
  from under whatever took the floor next. Scenes take a token from
  `sceneStart()` and hand it back to `sceneEnd(g)`; `stopScenes()` bumps the
  generation and hides every overlay, so a stale timer's `sceneEnd` is a no-op.
  Never write `busy = false` directly in a new scene - use the pair. If `boardcontrol` is
  unreadable - the usual cause is the rules not being published - the panel
  says so and the buttons fall back to playing on that screen alone, rather
  than leaving the manager tapping something that silently does nothing.
- **Month-on-month cut scene.** One slot in `SCENES`, so roughly every 40
  minutes. `statsScene()` reads this
  month and last month in one go (`backend.read()`, a one-off `get`) and shows
  three stat tiles plus a cumulative-profit line chart. The comparison is
  deliberately **like for like** - this month to date against last month to the
  *same day*, not against a whole finished month, which would flatter or damn
  the current month for no reason. Deal timestamps place each deal on a day;
  one banked before its month began counts on day one.
  Chart colours were validated with the dataviz skill's checker against the
  panel surface (`node scripts/validate_palette.js "#2f7bf0,#b8862c" --mode dark
  --surface "#141b26"` - all checks pass). Do not swap them for the brighter
  `--gold`: it sits outside the dark lightness band and fails. The stat figures
  use the body sans with proportional figures, not Clash Display - a display
  face on a stat value reads as decoration.
- **Leader cut scene.** Every 4.5-6.5 minutes `leaderDance()` dims the board and
  the current leader breakdances centre stage - toprock, a headspin, then a
  freeze - over their name, total and a rotating tagline. It is skipped on an
  empty board (nothing to celebrate) and, like the other stunts, whenever a
  modal is open, so it never interrupts a manager mid-entry (`stuntsBlocked()`).
- **The £15k target** is the `TARGET` constant. Past it the track extends itself
  in 5k steps (20k, 25k, 30k…), mirroring the strip Dan taped to the bottom of
  the paper board, and the £15,000 line stays marked as "Target".
- **Pace, not distance.** "£13,800 to go" says nothing on the 5th and frightens
  everyone on the 25th, so on the **live** month each standings row projects
  instead (`paceOf()`, `paceNote()`): "on pace for £18,400" in gold when the
  rate clears £15,000, otherwise "£620 a day to hit it". One clause, never two -
  this is small type on a wall. Nothing is projected before day `PACE_FROM` (5)
  because three days is noise, nor on a finished or future month where a
  projection means nothing; both fall back to the distance. The team's own
  projection replaces the Average tile while it applies.
- **Deal of the month.** The single biggest deal banked (`bestDeal()`) appears
  under the leader in the breakdance cut scene and nowhere else - Dan's call:
  it turns up with the dance and goes with it, rather than sitting on the board
  permanently. (It was briefly a fifth tile in the totals row; if it ever comes
  back it must be a tile, not a strip - the wall layout places its grid rows
  explicitly, and an unplaced element lands in an implicit row at the bottom,
  250px wide, and pushes the board off one screen.)
- **Crossing £15,000** gets its own scene (`champScene()`): the face, the name,
  HAS DONE IT, the figure and confetti, for ten seconds. It fires on the
  crossing only, once per person per month (`champSeen`), never off the first
  snapshot - that is history, not a moment - and it waits while a manager has
  the panel open, since they are usually the one entering the deal that caused
  it. Otherwise it takes the floor from whatever is up, because nothing else on
  this board matters more.
- **The 8-unit target** is `UNIT_TARGET`. Each standings row reads "3 / 8
  deals" and turns gold on 8, and the team's Deals tile reads against
  `UNIT_TARGET * TEAM.length`. Profit and units are separate targets - somebody
  can be past £15,000 on six deals, or on eight and short of it.
- **Reloading every screen.** Shipping a change to a board on a wall used to
  mean walking over to refresh it. "Reload every screen" in the manager panel
  writes `boardcontrol/reload`, and each screen reloads on a timestamp newer
  than its own load (never off the first snapshot, never one older than two
  minutes). Every screen also reloads itself at 4am if it has been up two hours
  and no panel is open, so a change made during the day is live by morning.
- **The team list is checked in CI.** `scripts/check-board-team.js` compares the
  `TEAM` array against the `exec` pattern in `database.rules.json` and fails the
  build if they disagree (`.github/workflows/board-check.yml`). Out of step
  there is no visible error: the board renders the new person fine and Firebase
  silently rejects every deal entered for them.
- **The manager panel** leads with the day-to-day half - add a deal, then this
  month's deals - and folds everything about what the wall is showing (board
  picker, sketches, screenshot, reload) into a closed `<details>` underneath.
  The deal list is what gets used every day, on a phone, and it was four
  sections down.
- **Watches re-subscribe.** Firebase *cancels* a listener that errors - it
  never comes back on its own, which is why publishing a rule used to leave
  every open board blind to the new path until somebody refreshed it. The
  module wraps every watch (deals, `newcar/current`, both `extra` slots,
  `boardcontrol`) in a retry with a 2s-to-30s backoff that resets on the first
  good value; `newcar.html` carries the same helper. Keep it: this page is
  meant to sit on a wall unattended, and a rules change should not need a lap
  of the showroom with a keyboard.
- The board renders from a **plain non-module script** and only then lets the
  Firebase module feed it, so a slow or blocked CDN shows an honest "offline"
  board rather than a blank screen. The webfont is loaded non-render-blocking
  for the same reason. Keep both properties if you refactor — this page is
  meant to sit on a wall display unattended.

Also retired: `ev.html` is a redirect stub to `EV.html` (the live EV landing
page) kept only so old lowercase links still work — don't resurrect it.
