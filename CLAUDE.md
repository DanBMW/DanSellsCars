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
  board that used to hang up). Public to view by URL, but adding/editing deals
  is behind the manager PIN. Team photos live in `team/` (see below).
- `mugshot.html` — **Mug Shot of the Week**: the team upload a picture and vote;
  the winner takes a slot in the board rotation for the week. No PIN (a PIN
  would stop the team voting, which is the point). Data is `mugshot/entries`,
  `mugshot/votes/<entry>/<voter>` and a single decided `mugshot/current`.
  **The board only ever reads `mugshot/current`** - never the entries or the
  votes - because it sits on a wall all day and should not pull everybody's
  photos down. Weeks run Monday to Sunday and every client derives the key from
  its own clock, so the roll needs nobody to press anything: whoever has the
  page open when the week turns computes the winner and writes it, stamped with
  the week, so a second client writes the same answer. It takes the newest
  *finished* week that had entries rather than strictly last week, so a quiet
  week or nobody opening the page for a fortnight does not lose the winner.
  **There is no limit on entries per person** - put up as many as you like.
  Voting is **two stages**: swipe left (or the cross) to pass, swipe right (or
  the tick) for yes, and only a yes then asks for a score out of five. One
  number is stored per voter per picture: **0 is a pass**, 1-5 is a yes and how
  good. Do not go back to storing only the yeses - a picture eight people
  passed on and one person rated 5 would top the board. `score()` therefore
  counts every judgement (a pass as a nought) and gives every entry two
  notional 3s to start with, so one lonely 5 cannot beat a picture the whole
  team liked. What is *displayed* is the average of the yeses with the yes
  count beside it, which is the readable version; the score is only the sort.
  **Nothing is shown back when they have judged the lot** - no standings, no
  running scores, no hint of who is ahead (Dan's call: the winner going up on
  the board Monday is the moment, and a leaderboard here gives it away days
  early). `thisWeeksEntries()` still ranks them, for the roll; it just is not
  drawn.
  The deck must stay responsive, because the whole thing is judged in one
  sitting on a phone. Three rules, all of which were got wrong first time:
  a judged card is taken **out of the deck immediately** (`.leaving`) and flies
  off on its own while the next card is already live - the first version nulled
  the top card, waited 680ms and only then redrew, so five quick taps landed
  one vote; cards already on screen are **reused, not rebuilt**, because the
  pictures are data URLs of up to a megabyte and tearing down three `<img>`
  elements per vote was the hitch between one picture and the next; and a
  single short `TAP_GUARD` (160ms) swallows the accidental double tap that
  would otherwise pass two pictures with one finger, while leaving deliberate
  quick tapping to count.
  **Once a device has judged a picture it never sees it again - but only if
  the vote actually landed.** The voter id is per device (localStorage
  `dsMug`) and `dsMugSeen` is an *optimistic* marker so the deck can move on
  the instant somebody taps, before the write comes back. The **stored vote is
  the truth**, and `reconcileSeen()` enforces that on every votes snapshot: a
  locally-seen id with no vote behind it and nothing in flight means the write
  never landed, so the picture goes back in the deck. Do not go back to marking
  seen unconditionally - that is what took pictures away from people for good
  while the database rules were unpublished, refusing every pass (a 0) and
  losing it silently. A failed write is retried twice before it gives up, and
  only then does the card come back with a message beside the deck.
  `reconcileSeen()` also drops ids whose entry has been pruned, which is what
  `tidySeen()` used to do.
  `onUp()` must branch on the stage: it used to wipe the stamp whatever was
  happening, so resting a thumb on a picture after saying yes looked like the
  yes had not registered. `render()` leaves the deck alone while
  `dragging` **or** the stage is `stars`, so somebody else's vote arriving
  cannot swap the card out from under a half-finished judgement.
  Two things the deck needs: the card images carry `draggable="false"` and
  `-webkit-user-drag:none`, because the browser's own image-drag stops the
  mousemove stream and killed swiping on a laptop; and the window listeners are
  bound **once**, not per render, which was leaking a set per card. The
  "nothing new to draw" check in `renderDeck()` requires a **non-empty** id
  list: a card swiped off is still in the box, so an empty deck matching an
  empty `deckIds` used to bail out and leave the last card's counter on screen.
  Entries over 21 days old are pruned after a roll - everything here carries a
  photo. The rules allow a write per **voter**, not on the whole
  `votes/<entry>` node, so pruning deletes each voter key individually;
  removing the parent is refused.
  Dan can take an entry down from the admin console (`mugshot/blocked/<id>`):
  it disappears from the deck and the standings, cannot win a later week, and
  if it had already won, the roll runs again to replace it - and the board
  itself watches `mugshot/blocked` too, so a pulled winner comes off the wall
  even with nobody on `mugshot.html` to re-run the roll.
  The board asks for entries itself, **permanently**: a QR badge sits in the
  **top right corner at all times** (Dan's call - it used to be a 15-second
  slot in the rotation plus a small one on the winner's own screen, so
  somebody walking past had to happen to be there at the right moment). It
  draws at z-index 310, above every cut scene, because "at all times" means
  during a sketch too, and it is deliberately **not a link** - a wall display
  should not be one stray tap from another page. The badge is only as wide as
  the code itself (`--qrbox`, a single custom property shared with the
  forecourt view, which narrows so the grid never runs under it); top right is
  the one corner nothing else wants, with the standings bottom left, Dan's
  credit bottom right and the title centred. It shows only in the wall
  layout (1200px up); below that the board stacks, the mascots sit across the
  top, there is no free corner, and it is being read on a phone rather than
  scanned off a wall.
  Two things had to give way for it, both in the wall layout only. The rails
  start `--qrspace` lower (**both** of them - a lopsided pair reads as a bug),
  and the speech bubbles take a **fixed** height rather than a minimum: a long
  line used to grow the bubble, which grew the rail, which pushed the mascot up
  into the corner, and made the two of them hop about every 7.5 seconds as the
  lines rotated. The QR is a
  **pre-generated inline SVG** - the URL never changes, so there is no library
  and nothing to fetch. Regenerate it with segno (`border=2` bakes in the quiet
  zone) and **check it still decodes at the size it renders at**: the first
  small one was 84px and OpenCV could not read it out of a screenshot, which is
  a fair proxy for a phone across the office.
- `admin.html` — **Dan's admin console for the board** (password `DANC`, a
  client-side gate like the board's PIN - it stops the wrong person prodding
  it, not somebody determined). One page for everything the wall does: a switch
  per slot in the rotation and per cut scene/stunt, the seconds on each screen
  and the minutes between scenes, both targets, holding a board up on every
  screen, reloading every screen, playing a sketch, the banner, taking a
  manager's screenshot or a birthday card down, and overruling the mug shot of
  the week. Switches write a single boolean to `boardsettings/<key>`; the
  sketches switch writes `boardcontrol/videos` instead, because that already
  owns it and two switches for one thing is worse than one in the wrong place.
- `links.html` — Dan's internal links/dashboard page, **gated with the same
  `DANC` password as the admin console** (stored as a SHA-256, matched
  case-insensitively, remembered per browser session in `dan_links_unlocked`).
  Like every gate on this site it hides the page rather than protecting it:
  the markup is all in the HTML and readable with View Source or curl, and
  the site is served from a public repo. Real protection means Firebase Auth.
  (Includes the Formspree
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
hand-drawn £15,000 challenge board that used to hang on the wall.

**It hangs in the managers' office** (Dan's ruling) - a staff display, not
something customers stand in front of. That is why the banter, Nathan's arson and Will's
reply to it are pitched where they are. Do not soften that content on the
assumption a customer might see it, and do not use "customers can see it" as a
reason for a decision here; if something needs holding back, it is because Dan
said so.

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
- **Our stunts belong to our board.** The paper ball, Nathan's visit and the
  fire are all pinned to the used car board and to Will and Serge standing
  either side of it, but they draw at z-index 90+ while a picture view sits at
  50 - so with the new car board up they painted over the top of it while the
  two of them were hidden behind it, and Nathan appeared to be setting fire to
  his own leaderboard. All three now check `ourBoardUp()` and decline
  otherwise; the cut-scene queue simply moves to the next slot.
- **Will's answer.** `willRelief()` runs only while the new car leaderboard is
  up and only when Will is on the rail beside it, about every second time that
  board comes round. Both rails carry a cartoon body for this (the same SVG
  shape as Will and Serge, without the pom poms), and the stream leaves him at
  hip height and **the board fills up from the bottom**: a translucent layer
  rises to 92% of the picture over nine seconds with a rolling surface and
  bubbles in it, the stream lands on the rising surface rather than the floor,
  a puddle spreads underneath, then it drains away. Nathan's lines are read in
  order rather than shuffled, so he escalates as it climbs. Coordinates come
  from the body and picture rects so it lands right at any size. It sits at
  z-index 60 - above the picture, below every cut scene, so a sketch still
  paints over it - and is skipped entirely under reduced motion.
- **Nathan's arson attempt.** `nathanFire()` sets fire to the **whole board**,
  not a corner of it: the `.board` rect is read at runtime and a row of flames
  is built across its full width (one every ~28px, three layers - body, bright
  core, and a taller lick every fourth), plus a char band and a flame layer
  that both climb the board over seven seconds, embers rising off the top edge,
  drifting smoke and an orange wash over the whole room. It burns for eleven
  seconds, then goes out and the char fades. Flame heights are a **percentage
  of their container**, which is what makes them grow as the fire climbs -
  fixed pixel heights just sat there while the char rose past them.
- **Everything answers to a switch.** `boardsettings` is a flat map of
  booleans and numbers written by `admin.html`; the board reads it through
  `sOn(k)` / `sNum(k,default)` and **never** touches `SET[...]` directly.
  **Absent means on**, so a database with nothing under `boardsettings`
  behaves exactly as the board did before the console existed, and clearing a
  setting is how you put a thing back to normal - there is no second "default"
  value to keep in step. Every cut scene and stunt tests its own key first
  (`dance`, `stats`, `nathan`, `fire`, `relief`, `paper`, `champ`, `bubbles`,
  `ncchat`, `sound`), and `views()` tests one per slot (`newcar`, `extras`,
  `mugshot`, `mugask` - the corner QR - `forecourt`, `birthdays`, `ticker`).
  Numbers:
  `viewsecs`, `scenemins`, `target`, `units` - `TARGET` and `UNIT_TARGET` are
  therefore variables, not constants, and `applySettings()` re-renders. A slot
  switched off comes off the wall immediately (`resyncView()`), rather than
  staying up until the rotation happens to move on.
- **The banner along the bottom.** `ticker/items/<pushId>` = `{text, by, ts,
  until?}`, added from the manager panel or the admin console, with an optional
  expiry. It draws at **z-index 320, above every scene** - a 44px strip should
  not vanish for ten seconds because a sketch is playing - and `body.hasticker`
  lifts Dan's credit line clear of it. Each copy of the message carries its own
  trailing separator, so the track is that block twice and a `-50%` slide loops
  seamlessly; the unit repeats until it is wider than the screen or a short
  message trails a gap. `paintTicker()` compares a signature first and leaves a
  running banner alone - repainting would jump it back to the start every time
  anything else on the board changed.
- **What's new on the forecourt.** A fifteen-second view built from
  `automation/hedin-stock-snapshot.json` - the same file `stock.html` reads, a
  plain file next to the page, so the slot works with no backend at all. The
  snapshot cannot say what is *new* (there is no arrival date on a car), so the
  board keeps a ledger of ids it has seen at `stockwatch/seen` and works out
  the difference once a day, writing the answer to `stockwatch/day` so every
  screen shows the same cars. **The day rolls at 9am**, not midnight: the
  overnight snapshot refresh has landed by then and the list does not change
  under the team mid-morning. The first run **seeds** the ledger and claims
  nothing is new - otherwise the board would announce all sixty-nine cars as
  fresh in - and a car that sells drops out of the ledger, so one that comes
  back counts again. With nothing new it shows a different six of the stock
  each morning instead, picked from the day key so every screen agrees; the
  slot is worth having either way. Three cards across, deliberately: an
  auto-fit grid put all six in a line on a wall display and cut every model
  name in half.
- **The view rotation.** The wall display cycles through whatever there is to
  show (`views()`, `showView()`, `rotateView()`) - 30 seconds each (`VIEW_MS`),
  except a birthday card, which gets 15 (`BDAY_VIEW_MS`): it is one line of
  text, and with two or three up at once a full slot each pushes the boards
  themselves too far apart. The timing is therefore a self-rescheduling
  timeout keyed off the current view (`armRotation()`, `viewMs()`), not one
  fixed interval - every path that changes or holds a view has to re-arm it.
  The cycle is:
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
  `ncChatLine()`), and that rotation respects `holdUntil` - without it the 7.5s
  timer talked straight over both of them mid-set-piece.
  Nathan gloats about new cars, Will defends the used pitch;
  that opposition is the joke, so keep it if you add lines. They are **side
  rails level with the middle of the picture**, the same shape as Will and
  Serge on our own board. The `chatty` class narrows the image to leave room
  for them - by `calc(100vw - 540px)` as well as a percentage, because the
  rails are a fixed-ish width and a percentage alone lets them sit on the
  picture at laptop sizes. Below 1000px there is no room at all and the rails
  are hidden - and **that narrowing rule must stay inside the same media
  query**. Left outside it, `calc(100vw - 540px)` goes negative below 540px
  wide, `max-width` resolves to 0, and the new car board is invisible on a
  phone: caption and timestamp render, picture does not.
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
  file on `loadedmetadata`). It never plays the same one twice running. A
  guard closes the scene if the file stalls - the board must never be left
  covered - and it **follows the clip's own length** (duration + 4s, floor 16s,
  ceiling 120s, re-armed from `loadedmetadata`), along with `holdUntil` so Will
  and Serge stay quiet for the whole thing. It was a flat 16s while every sketch
  was ten seconds; that would have cut the 28s pool clip off mid-swim.
  **The pool clip is a recording of a live scene.** `sketch-pool.mp4` is Will
  swimming, from Dan's own Clive's Driving School app - a real-time three.js
  scene, not a file, so there was nothing to download. It was captured by
  mirroring the app locally, pinning its render loop to a fixed 1/20s timestep
  (it clamps delta to 0.05s, so a hand-stepped loop gives exact 20fps timing
  however slowly the software renderer draws), stepping and screenshotting every
  frame, then encoding the 561 frames with the app's own soundtrack. Re-record it
  the same way if the scene changes: 152s of headless wall clock is 28s of film.
  **Sound.** Clips play with sound, except any carrying `sound:false` -
  sketch 4, the shredding sketch, which swears. Dan asked for that one to stay
  silent; the board is in the managers' office, so it is his call rather than a
  customer one, but leave the flag alone unless he says otherwise.
  **Always ask for sound and let the browser refuse** - never pre-mute on the
  assumption it will. A display whose browser is configured to allow autoplay
  with sound (Chrome launched `--autoplay-policy=no-user-gesture-required`,
  Edge's per-site Media autoplay set to Allow, or a site Chrome has built up
  enough media engagement for) then plays with sound and never needs touching.
  Gating the attempt behind a gesture, which is what this did at first, left
  those displays silent for no reason. When `play()` is refused the clip drops
  to muted and plays anyway with a "tap for sound" badge - never let the
  fallback skip the clip, an empty slot on the wall is worse than a quiet one -
  and the first tap on that screen unmutes the clip that is already running
  (`liveVideo`) rather than only helping the next one. The clips are warmed into the browser cache 20s after load on wide
  screens only, so a phone does not pull down thirty megabytes it will probably
  never play.
- **The trailer.** `video/trailer.mp4` is the team film trailer, and it is
  **not one of the sketches**: it is deliberately kept out of `CLIPS` so the
  random sketch slot can never pick it, and it runs on its own hourly timer
  (`TRAILER_EVERY`) outside the `SCENES` queue - it is an event, not one of the
  rotation's turns. `trailerScene()` puts a plain black title card up first
  (`.trailercard`, "Used Car Team Pictures presents / Coming soon to this
  screen") for `TRAILER_CARD_MS`, then hands to `videoScene(TRAILER)`. The card
  takes the floor and hands it straight back - one tick's gap - so the clip
  keeps all of `videoScene`'s own handling: sound with the muted fallback, the
  length-aware guard, the stall backstop. The card draws at the same z-index as
  the clip (96) on **solid** black rather than the video scene's near-black, so
  the cut from card to trailer reads as one piece. Its first outing is a few
  minutes after load, not an hour, so a screen switched on does not sit there.
  It has its own `trailer` switch in the admin console and its own play button;
  `playNow('trailer')` routes to the card, not straight to the clip.
- **The premiere.** `video/premiere.mp4` is the team film, and it is not a cut
  scene, not a sketch and **not on any timer** - it runs only when a manager
  starts it, from the board's own panel or the admin console. It is built
  differently from everything else on this page, for one reason: it runs six
  and a half minutes with the whole team stood in the room, so it must not
  stall and must not be interrupted.
  **It is played from memory, not streamed.** `armPremiere()` pulls the whole
  file down over XHR (for the progress events) and mints a blob URL; the title
  card holds until that is done, showing a percentage, and only then does the
  film roll. Once it has commenced not one further byte is needed from the
  network, which is the only way to actually promise it will not buffer over
  office wifi. "Get every screen ready" arms every screen ahead of time;
  starting it cold still works, the card just waits. `PREM_WAIT_MAX` is the
  point at which it gives up waiting and streams anyway - a premiere that
  risks a stall beats an empty screen.
  **While it runs, `premiereLock` stands the whole board down**: cut scenes,
  stunts, the view rotation, a manager's play button, the reload command, and
  the champion scene - which normally takes the floor from everything else,
  because nothing on this board matters more. During a premiere something
  does. The champion is not lost: `champScene()` returns false, `pendingChamp`
  holds it, and the 1s backstop gives it its moment when the credits roll.
  The banner and the mug shot QR are hidden too (`body.premiere`); they draw
  above every scene on purpose, but nothing crawls across a premiere.
  **`stuntsBlocked()` reports that lock, so the film has to bypass it** - the
  clip carries `premiere:true` and `videoScene()` tests `busy` and an open
  panel instead. Getting that wrong is not subtle and not obvious: the
  premiere turned away its own film, ended at the card, and every other guard
  then looked broken because the lock had already cleared.
  The film runs `bare` - no caption strip, no bubbles over it - and
  `guardMax` lifts the stall backstop's ceiling, which is 120s for a sketch
  and would otherwise cut a feature off at two minutes. Title and credits are
  the `PREMIERE` constant, in one place.
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
  everyone on the 25th, so on the **live** month each standings row is measured
  against a straight line to the target instead (`paceOf()`, `paceNote()`):
  "£3,600 ahead of pace" in gold, or "£620 a day to hit it" when short. One
  clause, never two - this is small type on a wall. Nothing is shown before day
  `PACE_FROM` (5), nor on a finished or future month; both fall back to the
  distance. The team's own figure, against `TARGET * TEAM.length`, replaces the
  Average tile while it applies.
  **Do not go back to extrapolating the run rate.** That is what this did first
  (`total / days elapsed * days in month`) and profit does not arrive evenly:
  one big-profit car in the first week read "on pace for £85,000" on a board
  whose target is £15,000, and Dan rightly called it nonsense. Comparing
  against the line is a statement about today, not a forecast, and cannot run
  away with itself.
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
- **Happy birthday.** A button in the manager panel (optional name) puts a
  birthday scene and the tune on every screen, and the card then **stays in the
  view rotation for a week** (`birthdays/<pushId>` = `{name, ts, clip?}`,
  `BDAY_DAYS`, `liveBirthdays()`). Each live birthday is its own view, so two
  or three at once is simply two or three slots; they age out on their
  timestamp with nothing to reset, and the manager panel lists them with a bin
  to take one down early. The rotating card is **silent** - the tune belongs to
  the moment it goes up, not to every thirty seconds for seven days.
  Somebody's own clip lives in `BDAY_CLIPS` - a file in `video/` plus the
  first name(s) it answers to. Matching is on the **whole first name**, not a
  prefix: `indexOf(match)===0` handed Monica the video made for Mon. The panel
  says as you type whether that name has one. It follows the
  card when it is first put up, and after that rides the rotation at most once
  an hour (`BDAY_CLIP_GAP`) - the same ten seconds every two minutes for a week
  would be a punishment, not a present. `videoScene()` therefore takes an
  ad-hoc `{src, ar, cap}` object as well as a `CLIPS` src. The tune is **synthesised with
  the Web Audio API** (`BDAY`, `playBirthdayTune()`), not played from a file:
  the melody is out of copyright (the Hill sisters' tune - the US claim was
  struck down in 2016 and UK protection expired at the end of that year) and
  generating it avoids any separate recording copyright, and any megabyte of
  audio. The one-off "play it now" rides the existing `boardcontrol/play`
  command as `tune:birthday:<name>`; the week-long card is separate state under
  `birthdays`. Same audio rule as the sketches: a wall display that nobody has
  touched cannot make sound, so the scene says "tap this screen once to hear
  it" and still plays silently rather than not at all.
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
  of the building with a keyboard.
- The board renders from a **plain non-module script** and only then lets the
  Firebase module feed it, so a slow or blocked CDN shows an honest "offline"
  board rather than a blank screen. The webfont is loaded non-render-blocking
  for the same reason. Keep both properties if you refactor — this page is
  meant to sit on a wall display unattended.

Also retired: `ev.html` is a redirect stub to `EV.html` (the live EV landing
page) kept only so old lowercase links still work — don't resurrect it.
