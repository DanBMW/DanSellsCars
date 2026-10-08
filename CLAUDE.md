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
  `Forecourt.html`, the `forecourt-frenzy*.html` games, and
  `team-board.html`. (The customer signing pages - combined-form,
  rav-form, commission-disclosure and their download pages - were removed in
  October 2026; their records were backed up for Dan and deleted, and the
  rules no longer allow `disclosures/` or `rav_forms/`.) Rules
  live in `database.rules.json` and `storage.rules` (deployed via
  `firebase.json`) — keep them in sync with any new DB paths. Writes need a
  Firebase sign-in: "staff" paths (board control, admin, profit deals) need a Google account listed under `/staff/<uid>`;
  colleague paths (mug shot, newcar, forecourt, the board's own stockwatch and
  pairing writes) take the quiet anonymous sign-in from `staff-auth.js`. Storage is
  unused and fully locked. Test rule changes with
  `scripts/test-firebase-rules.mjs`; setup and limits are in `SECURITY-STAFF.md`.
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
| `find-my-bmw.html` (+ `fmb.js`, `fmb.css`, `stock-core.js`) | **"Find my BMW" v2**, rebuilt 1 October 2026. One page: intro, nine tap only questions (new or approved used, life, shape, fuel, budget, extras, colour, part exchange Yes/No/Maybe, timing; one per screen, `#qi`, `#q1`..`#q7`, `#qp` in the URL, Back and browser back work), a short honest matching moment, then the results behind a **hard contact gate**. Matches are computed in JS memory; until a Formspree submission succeeds the page renders only the persona, the match count and three blurred skeleton cards (no regs, prices, models, images or links in the DOM). The gate (`#fmbGate`, a bottom sheet on mobile, a centred modal on desktop; main is `inert`, focus is trapped, Esc collapses it to a peek bar but never unlocks) asks for name, mobile and email, all required. Success unlocks the real cards, unless part exchange is Yes: then the PX steps (reg, mileage, service history, finance, keys required; condition notes optional; photos via a WhatsApp button, never blocking) must be sent in a second submission first. For Maybe the PX steps are offered and skippable. A failed submission keeps the gate and shows Try again plus WhatsApp. "Rather just WhatsApp me" messages Dan with the answers (no cars) and does **not** unlock. Unlock persists in `localStorage.fmbV2` (answers kept 7 days); `sessionStorage.fmbSent`/`fmbPxSent` stop a second submission. New or either buyers see "I'll come back to you with new car options" above a couple of used cars. Live "X cars match" counter and per option counts come from the same files stock.html reads. Results are never zero: a fallback ladder (group stock, budget +10%, neighbouring fuels, neighbouring shapes, drop 7 seats, then anything in budget or the newest) widens one step at a time and says on screen what it widened. Monthly figures only with the lender's full representative example (the MBG.html display); no quote says "Ask for a quote". "See all matches" deep links to stock.html with the hard filters plus `from=fmb`. Pre answers from `?life=&body=&fuel=`. `window.fmbDebug` exposes the state for tests. The page uses disclaimer.js in **inline mode** (`<html data-dsc="inline">`): no modal over question 1, the full wording renders into `[data-dsc-slot]` on the results screen. `step1.html`..`step8.html`, `step1b`, `step4b/c/m`, `step5b` and `start.html` are now redirect stubs to `find-my-bmw.html` (offers.html pattern, query string kept). `thankyou.html`, `wait.html` and `stock-match.js` are left in place for old links; nothing new posts to them. |
| `which-bmw.html` (+ `which-bmw.js`, `which-bmw.css`) | **"Which BMW suits me" quiz**, added 2 October 2026 and cut down to **eight questions** on 3 October when Dan asked for it punchier. Deliberately **separate from Find my BMW**: that funnel asks what car you want and shows the stock that matches; this asks about your life and answers with a **model**. **The cut was measured, not argued.** Over 300 random briefs, changing one answer at a time moved the recommended car: who 99%, pace 70%, charge 58%, park 53%, load 53%, weekend 52%, attention 47%, mood 34%, love 20%, longrun 16%, age 9%, and **daily mileage 1%**. Benchmarks put the sweet spot at 5 to 8 questions with completion falling about 15% per question past 8, so everything under half was cut or merged. The daily mileage question had a needle gauge and was the only thing on the page that asked anybody to type, and it changed the answer once in a hundred runs: charging, mileage and long runs are now one tap (`life`), and the mileage that reaches Dan’s inbox is an **estimate from that answer**, labelled as one. Dan asked for the miles/minutes toggle originally, so do not put it back without re-running the measurement. **No keyboard anywhere in the quiz**, including budget: monthly and cash are chips and the deposit chips are the lender’s **own rungs** from `stock-finance-ladder.json`, so the payment is a figure BMW Financial Services gave for that car rather than one read off the line between two quotes. Keep `DEPOSITS` here and `RUNGS` in `stock-finance.py` in step. **Every option carries a line drawing** (`ICON`, inline SVG on currentColor so it inherits the accent; the pace question draws the same dial at five sweeps): images in answers are the biggest single lever on completion in the benchmarks. **A single-choice question draws no Next button**, because the tap already advances and a second control is a second decision. The finance wording is one line through the questions and expands to the full disclosure on the results screen, where the payments actually are. **"What your budget says" against "what your heart says"** stays: with a budget given the brief is ranked again with the money out and personality doubled, shown side by side with the difference in plain money, and the heart card appears **only** when that car is genuinely over budget or the labels would be untrue. Answers live in `localStorage.wbQuiz` for 7 days. Fires its own `wb_*` GA events, so it is deliberately absent from the `STEPS` map in `analytics.js`. **Sent by link only** (Dan’s ruling): `noindex`, `Disallow` in `robots.txt`, out of `sitemap.xml`, never linked from a public page. The page is styled as an **instrument cluster** rather than like the rest of the site: title card, rev counter, giant ghost numeral per question, accent hue winding cold blue to warm amber across the eight, an interstitial at the halfway point and a short beat before the answer. Note `.wb [hidden] { display: none !important }` is load bearing: an author `display` beats the browser’s own `[hidden]` rule whatever the specificity. |
| `sq1.html`–`sq3.html` (+ `sq_done`) | **Service Qualifier ("Ramp Report")** — reg-first flow for customers whose car is in for service (entry: `service.html`). sq1 reg-plate input + DVLA lookup + market-scrape kick-off, sq2 vehicle reveal + openness, sq3 contact + locked-value teaser, submits on `sq3.html` → `sq_done.html` (booking-first, cal.com links). Market prices are captured into Dan's Formspree email only — **never shown to the customer**. Funnel copy uses no dash separators at all (Dan's rule, see Sitewide copy and CTA conventions). `sq4`–`sq7` and `sq6b` are retired redirect stubs → `sq1.html`. |
| `yourcar.html` | **Ramp Report personal share link** — Dan sends `yourcar.html?reg=AB12CDE&n=Kate&d=Friday` (built via the widget on `links.html`; `d` is the optional service day, echoed in the greeting); the plate arrives pre-filled, the customer confirms car + mileage then taps **"I'm interested"** (screen 1) and books (cal.com / WhatsApp). Personalised page: keep `noindex` and out of `sitemap.xml`. Both `sq1.html` and `yourcar.html` carry a tap-to-play voice note from Dan (`dan-service-intro.mp3`, GA event `dan_audio_play`). |
| `yourbrief.html` | **Optional deep-dive brief** — nudged from `yourcar.html` stage 2 and `sq_done.html` after the initial interest/booking stages. Single page, five skippable stages (direction, timing, payment + budget, PX intent, recap ticket + notes), reuses identity from `sessionStorage` (never re-asks for what Dan has), **one** Formspree submission on send. |
| `vip.html`, `vip1.html`–`vip7.html` (+ `vip-done`) | **VIP Buyers Event pre-qualification** — off-site, invitation-only flow for the yearly buyers event. The event **runs across four days**, and each customer gets a **1 hour** appointment on their chosen day instead of the usual 2.5, so the groundwork has to be done beforehand. Copy says "on the day", never "on the night". `vip.html` is the personalised red-carpet landing page (`?n=`name `&d=`the dates the event runs across `&t=`the customer's own day and time `&v=`venue `&reg=`plate, built by the widget on `links.html`); the 7 steps mirror the Find my BMW funnel (shortlist, body style + new/used, budget, part exchange with DVLA/MOT lookup, on-the-day readiness, details, review) and submit **once** on `vip7.html` → `vip-done.html`. Shared behaviour in `vip-ui.js` + `vip.css`; hero artwork is `vip-carpet.jpg`. Personalised and internal: keep every page `noindex`, out of `sitemap.xml`, and never linked from a public page. |

**Formspree is rationed** (submission volume costs money): `yourcar.html`
sends exactly one interest email per customer ("I'm interested" tap);
booking taps are GA `booking_tap` events only — cal.com confirms real
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

### stock.html and its finance examples

`stock.html` is **Available Now**: the canonical, indexed used stock search
(in `sitemap.xml`, daily changefreq) and the page every nav/drawer/footer/
homepage "Available Now" link points at. `offers.html` is now a soft redirect
stub to it (meta refresh + `location.replace` keeping the query string,
canonical to stock.html, noindex) - do not rebuild a hand-picked list there.
Each car's hero is the photo with a **finance example** over it (monthly
payment, product, deposit, term and APR), reading the way the daily post cards
read, with the spec below it.

The page is a client-side **faceted** search over the two JSON files. Nine
facets: price, monthly payment, model family (from `series`, falling back to
the model name), body (from `body`; "Gran Coupé" when the model name says so),
fuel (from `fuel`, so mild hybrids are their own options), mileage, year,
colour and seats (the snapshot's own `seats` field, never guessed). Sorts by
price, monthly, mileage and newest. Filters live in the query string
(shareable), a Reset button clears them, the count is live, and the empty state
is a WhatsApp "Tell me what you're after" CTA.

Everything about the panel comes off two things, `FACETS` and `SEL`, so adding
a facet means adding a row to `FACETS` and nothing else. The rules it has to
keep, most of which were got wrong first:

- **Several options at once, OR within a facet and AND across them** (a Saloon
  or an Estate, that is also petrol). That is how faceted search reads
  everywhere else and the only arrangement people guess right without being
  told. Chips, not a native `<select multiple>`, which is close to unusable on
  the phone most of this list is read on.
- **Every option carries a count**, and it is counted against what every
  *other* facet allows (`rowsFor(key)` skips the facet it is counting). Count a
  facet against its own selection and every option but the chosen one reads 0,
  which looks broken. An option that would empty the list is shown and
  **disabled** rather than removed, so the rows do not jump about as you tap,
  and an option that is *on* is never disabled or there is no way to turn it off.
- **The bands are disjoint.** The old ones were nested (one "Under £40,000"
  containing the "Under £20,000" above it), which is fine for a single-choice
  dropdown and meaningless once two can be on at once, where the pair just means
  whichever is wider. `ALIAS` maps every value an already-shared link might
  carry (`price=u30`, `miles=u40`, `monthly=u500`...) onto the set of new bands
  covering exactly the same cars. Do not drop it: Dan sends those links to one
  customer about one budget.
- **The chips are built once and only repainted.** `buildFacets()` makes the
  DOM, `paintFacets()` updates counts and pressed/disabled state on every
  render. Rebuilding their markup each time threw keyboard focus back to the top
  of the page on every tap and replaced the very node a quick second tap was
  aimed at.
- **Selections live in `SEL`, not in the DOM**, so rebuilding the panel after
  `unlock()` widens the options cannot silently drop a filter somebody set.
- **The applied filters show as removable pills** above the count. With several
  options live across several facets this is what keeps the list explainable,
  and on a phone the panel is shut, so without it nothing on screen says why
  only four cars are showing. The count on the Filters button does the same job.
- **Body comes from `stock-core.js`** (`window.dsStock.stockBodyKey`), shared
  with Find my BMW: i4 is a Gran Coupé, X4/X6 are "SUV Coupé" (`suv-coupe`),
  Active/Gran Tourer are "MPV and Tourer" (`mpv`). The funnel's SUV maps to
  `body=suv,suv-coupe`, Coupé to `coupe,suv-coupe`, Hatchback to `hatch,mpv`.
  Fuel keys come from `dsStock.fuelKey`.
- **Cards are diffed, not redrawn.** Each card is built once (`CARDS` cache,
  `buildCard`) and only its finance slots repainted (`paintFin`); `reconcile()`
  reorders/hides nodes. Search and number inputs are debounced 150ms. The count
  is announced by the visually hidden `#slLive` after 700ms of quiet.
- **Phones get a full screen filter sheet** (`#slSheet`, at 700px and below)
  with a sticky "Show N cars" button (`#slShowBtn`). Chips are 44px or taller.
- **Shared links are read once** (`INITIAL_QS`) and re-applied after the group
  file lands, so `?all=1&colour=Green` keeps a group only value.
- `?from=fmb` shows a "Back to my matches" banner linking `find-my-bmw.html#reveal`.
- **Free text is AND over words, in any order.** A single substring match meant
  the obvious two-word search ("white touring") came back empty while both words
  were plainly on the card.

#### The budget search: deposit and monthly ceiling

Above the filter panel, outside it and always on screen (the panel is shut by
default on a phone), sit the two questions a customer actually arrives with:
what can I put down, and what can I pay a month. Picking a deposit **changes
every payment on the page** to the lender's quote at that deposit, the terms
line, the representative example and the monthly sorts with it; the monthly box
is a ceiling, not a band.

- **Those figures are the lender's at that exact deposit**, read from
  `automation/stock-finance-ladder.json`. They are never worked out here. The
  monthly payment is almost perfectly linear in the deposit (about £25.55 per
  £1,000 on one car checked) so interpolating between two rungs would be easy
  and would look right. Do not: a payment put in front of a customer has to be
  one the lender gave.
- **The rungs are £0, £1,000, £2,500, £5,000, £7,500, £10,000 and £15,000**, in
  `RUNGS` in `stock-finance.py` and `DEPOSITS` in `stock.html`. **Keep the two
  lists in step**: a deposit offered on the page that was never quoted shows
  every car as unquotable.
- **The deposit chips carry counts**, each one meaning "cars the lender will
  quote at that deposit, within the monthly ceiling you have set", so the trade
  is visible before tapping: £5,000 down might show 22 cars at £400 a month and
  £7,500 down 32. Counting a deposit means re-stamping `_monthly` across the
  list and putting it back (`countAtDeposit()`), which measured at about 3ms of
  a 68ms tap over all 332 cars.
- **The legal wording is taken off the main entry at any rung.** It is written
  about the vehicle, its mileages, the campaign dates and the FCA disclosures
  and carries no deposit or monthly figure, so it reads true for every rung.
  That was checked against the lender's own text, not assumed, and it is why
  the ladder file holds no legal text and stays about 250KB.
- **An old `?monthly=` link becomes a ceiling** at the top of whichever band it
  named, so links Dan shared before this still land somewhere sensible.
  `monthly` is no longer a facet.

Monthly filters and sorts only use a
**live** lender quote; a car without one shows "Ask for a quote", is excluded
from a monthly filter and sorts after the quoted cars. Every card has the
WhatsApp button (primary, prefilled with year, model, reg and price) plus an
email link to daniel.cane@hedinautomotive.co.uk and the Hedin listing.

**Those figures come from the lender.** `automation/stock-finance.py` pulls a
real BMW Financial Services quote per car through Hedin's own Codeweavers API,
the same path `automation/finance-quote.py` uses for the daily cards, on the
same terms (48 months, 8,000 miles, flat £1,000 deposit below £40k and 10% at
or above) so the page and the cards can never disagree.

**Between the quoted deposits the page reads off the line those quotes make**
(Dan asked for this on 1 October, so a customer can type any deposit rather
than pick one of seven). That is a deliberate, measured exception to "never
calculate a payment here", and it rests on evidence rather than on its being
convenient:

- The monthly payment is **exactly linear in the deposit**, and the rate
  depends only on the APR and term: 148 cars at 11.9% share one rate to within
  2e-6 per £1.
- A least-squares line through a car's own rungs reproduces the lender's figure
  **to the penny**: it lands exactly on 97% of the 1,913 rungs we hold, and was
  checked against live quotes at 20 deposits the lender had never been asked
  for, where 15 were exact and the rest a penny out. A penny is the floor,
  because the quotes we are given are themselves rounded to one.
- The rest of the example follows exactly, not approximately: total payable is
  deposit + payments x monthly + final payment and the charges are that less
  the cash price, both of which hold with a residual of 0.00 on all 1,913.

The maths lives in **`dsfinance.js`** (`window.dsFin`), shared by `stock.html`
and the Find my BMW matcher rather than copied into both. This repo has been
bitten by twinned code before (`shrinkShot`/`shrink`, `clipKey`), and a finance
rule that drifts between two copies is worse than a cosmetic one.

Two guards keep it honest, and neither is optional:
- **An exact rung is handed back verbatim**, never recomputed.
- **`lineFor()` checks the line against every rung the car has** (`LINE_TOL`,
  2p; every rung of all 312 cars sat within 0.83p) and a car that does not fit
  it falls back to its rungs alone. If BMW ever makes the rate depend on the
  deposit, that car stops being interpolated instead of quietly going wrong.
- **It is never used past the most the lender will take** (`maxdep`, or the top
  rung). Above that the card says so rather than inventing a payment.

What is still NOT ours to calculate: anything that changes the **term or the
mileage**. Those move the optional final payment, which comes out of the
lender's residual tables and cannot be derived from anything we hold. A
different term means a new quote.

The quotes live in `automation/stock-finance.json`, keyed by listing id,
**alongside** the stock snapshot rather than inside it: the snapshot is
refreshed by its own job and read by the board's forecourt view too. Re-run it
whenever the snapshot changes.

The same job also writes **`automation/stock-finance-ladder.json`**: the
lender's quote for each car at each deposit rung, which is what the budget
search reads. One line a car, the way the snapshot is written, so the daily
diff stays readable.

- **The listing page fetch is the expensive part** (1.8s of what used to be
  2.8s a car); quoting the same car again at another deposit is about half a
  second, which is why the ladder reuses one page fetch and why seven rungs
  cost about 6.7s a car rather than seven times the job. The full run is about
  37 minutes for 330-odd cars, up from 16.
- **The lender silently clamps a deposit it will not take.** Ask for £7,500 on
  a £16,495 car and it answers with an ordinary-looking quote that is actually
  for £6,433.05 and says nothing about it; the only tell is `TotalDeposit`
  coming back lower than you asked. A rung like that is dropped rather than
  stored, because keeping it would offer a customer a deposit the lender has
  already refused and show the same payment under three different deposits.
  The ceiling is recorded as `maxdep` and the card says it ("most this one
  takes on PCP is about £6,433 down") instead of a bare "ask for a quote".
  Every rung above a clamped one is skipped: they all clamp to the same place.
- **The count of regular payments is stored per rung**, not taken off the
  default quote. The term came back the same at every deposit on every car
  checked, but the page prints "47 monthly payments of ..." and a wrong count
  there is a wrong financial promotion.

### Photographs and equipment - car-details.json

`automation/car-details.py` fetches each car's own listing page once and writes
`automation/car-details.json`: up to six gallery photographs, the factory
equipment list (median 43 lines a car, 434 distinct across the fleet), the trim
version and the emissions figure. A **sidecar**, not a change to either stock
file, for the usual reason: the snapshot is read by the board as well and must
keep its shape.

- **Equipment is what makes the search box worth having.** "harman kardon"
  finds 46 cars, "tow bar" 3, "heated seats" 75. None of that was findable when
  the haystack was model, colour and trim. The haystack is stamped onto each
  car once (`hayFor`) rather than rebuilt per keystroke.
- **Equipment does not change once a car is on the forecourt**, so the file
  itself is the "already fetched" marker and only new arrivals cost a request.
  The first run was 329 cars in about seven minutes; an ordinary morning is a
  few seconds.
- **A page with no `car_` fields fails that one car** rather than being
  recorded as having nothing, which would mark it done for ever.
- **Gallery urls are stored as the CDN's uuid alone** and put back together by
  the page, which is about 70 characters a photograph saved on a file a phone
  downloads.
- **Only the photograph on screen is ever fetched.** The card has one `<img>`
  and the arrows set its `src`; 332 cards times six photographs would be thirty
  megabytes nobody asked for. The equipment list is built the first time its
  `<details>` is opened for the same reason - fourteen thousand list items
  otherwise.
- **A photograph url is a lease, not an address**, and that is what
  `automation/stock-images.py` exists for. Hedin re-process a car's pictures
  from time to time and the old CDN file is deleted when they do, so anything
  stored goes dead without warning. The snapshot never re-read its `image`
  (the morning routine carried it across and fetched one only for a new
  arrival) so the damage accumulated: 9 of 82 cars broken on 7 October 2026,
  the oldest dead since the day the car arrived. `car-details.json` is worse
  in principle because it is fetched once a car and then treated as done for
  ever, which is true of the equipment and not of the pictures: 98 dead
  gallery slides across 22 cars on the same morning. `group-stock.py` was the
  one that was right, because it takes the image off the list payload on every
  run, so it was never more than a day behind.
  The script runs daily, after both stock lists and the car details, and does
  three things in order: takes the hero off the group's own list payload (one
  request for every car the group has, which is where the snapshot should
  always have read it, the routine's old claim that "only the listing page
  carries the photo" being simply wrong), asks the CDN whether each url
  resolves, and for anything still dead reads that one car's listing page.
  Two rules it must keep. **A url is only written once it has answered 200**,
  so it can never put a worse guess over a working photograph, and a car it
  cannot mend keeps what it had rather than being handed a blank. And **the
  listing page is read by car id, never by taking the first `car_` block on
  it**: a listing url for a car that has gone answers 404 with a 138KB page
  carrying eight OTHER cars in a "similar vehicles" strip, and reading the
  first gallery there puts a stranger's photographs on this car's card. That
  page is far too big for the fetch size check to notice, and an id that is
  absent from its own page is how a sold car is told apart from a broken one.
  It exits non-zero only when more than a twentieth of a file cannot be
  mended. One or two a morning is normal and not actionable: a car whose
  listing has gone drops out of tomorrow's snapshot, and a car whose listing
  is up with no pictures has not been photographed yet. Failing on those would
  put a scheduled job permanently in the red, which is how a red job stops
  being read.

Three things the page has to respect:
- **A quote expires, and they all expire together.** `valid_to` is BMW
  Financial Services' own campaign end date, not a rolling window from the day
  of the quote: every entry in the file carries the same one (checked across
  three consecutive runs, all reading 2026-09-30T23:59:59), so the whole page
  lapses on one day when a campaign rolls over rather than car by car.
  `finLive()` drops a lapsed one and the card falls back to "message me for a
  quote" - showing a stale monthly payment as current would be worse than
  showing none. That is what puts this on the morning routine: the figures are
  only ever as current as the last run.
- **A rollover blanks the page until something re-quotes, and the lender may
  not be ready.** The campaign ended 30 Sep 23:59; the Routine does not run
  until about 08:00, so both pages showed "Ask for a quote" overnight - and on
  1 October the lender (Hedin's own listing pages too) was still declining
  almost every used car, quoting only a handful of electrified ones at 6.9% on
  a campaign to `2026-12-31T23:59:59+00:00` (note the offset - older values
  carried none). Nothing on our side can fix a lender that will not quote,
  and the page must not show a lapsed figure, so the answer is to re-quote
  promptly and retry. `stock-finance.py --when-lapsed` is built for that: a
  no-op unless under 60% of the cars hold a live quote and the last run was
  over three hours ago, so it can be scheduled just after midnight UK time and
  again late morning and mid-afternoon (clear of the Routine's 07:00-08:00 UTC
  window) and an ordinary day costs Hedin's site nothing. A ready-made
  `.github/workflows/finance-requote.yml` doing exactly that was drafted on
  1 October but could not be pushed - the automation token has no Workflows
  permission - so until Dan adds it, the Routine is the only re-quote.
- **A network error keeps a still-live quote.** `stock-finance.py` retries a
  car twice on a network or server error, and if it still cannot reach the
  lender it keeps the quote it already holds while that quote is inside its own
  `valid_to` - the lender's figure, not ours - rather than one bad minute on
  Hedin's site emptying the page. A refusal still drops the car's quote, and a
  run in which every car errored exits non-zero so a scheduled run shows red.
- **Not every car can be quoted.** Older stock gets "contact us directly for
  finance information" from the lender; that is normal, not a fault, and
  those cars simply show the fallback.
- **The representative example is on the card**, in full, along with the
  lender's own wording for that quote reference. This page goes to customers.
- The term shown is the one the lender returned, which is not always 48
  months - it comes back shorter on older cars.

### Hidden used car lookup - lookup/

Added 7 October 2026 for a colleague's appointment booking page: they take a
reg and pull that car's details and photo. **Sent by link only**: `lookup/index.html`
carries `<meta name="robots" content="noindex,nofollow">`, `robots.txt` has
`Disallow: /lookup/`, it is out of `sitemap.xml` and must never be linked from
any page. It is hidden from search, not private: anyone with the URL can read it.

- **`scripts/build-lookup.mjs` writes it** (Node 18+, no dependencies) from
  `hedin-stock-snapshot.json` (source `forecourt`), `hedin-group-stock.json`
  (source `group`), `stock-finance.json` and `car-details.json`:
  `lookup/stock.json` (today's stock only: `generated_at`, `count`, `counts`,
  `cars` keyed by reg, uppercase, no spaces), `lookup/recent.json` (cars that
  left stock in the last 30 days, same shape) and one `lookup/reg/<REG>.json`
  per car in either. A car in both lists is the forecourt's. Only fields the
  stock files hold, null where they hold nothing. `finance` is the
  `stock-finance.json` entry verbatim plus `representative_example`
  (dsfinance.js wording), and null when there is no live quote.
- **A car that leaves stock is kept for 30 days** (Dan, 7 October). Its reg
  file keeps the last known data with `status: "removed"`, `removed_at` (the
  London date the script first found it gone), `available_until` (removed_at
  plus 30 days) and `finance: null`; the file is deleted once today is past
  `available_until`. A car in stock has `status: "in_stock"` and both dates
  null; one that comes back is in_stock again with fresh data. So a 404 means
  "not in stock and not in the last 30 days".
- **`lookup/_history.json` is the ledger** (`first_seen`, `last_seen`,
  `removed_at` per reg, London dates). It is committed but, starting with an
  underscore, Jekyll does not publish it. Do not delete it: without it every
  car looks new and the 30 day clock restarts.
- **Idempotent and guarded.** Reg files carry no timestamp and `generated_at`
  only moves on a real change or the first run of a London day, so running it
  twice in a day writes nothing the second time. It refuses to write and exits
  1 if today's stock has fewer than 50 cars, more than 40% of yesterday's cars
  vanish at once, or a stock file is missing or unreadable, rather than mark
  good cars as removed. `LOOKUP_TODAY=YYYY-MM-DD` overrides the date for tests.
- **Run it after every stock or quote refresh**: `node scripts/build-lookup.mjs`
  then commit all of `lookup/`, including `lookup/_history.json`, `recent.json`
  and any deleted reg files.
- `lookup/widget.js` is a drop in script the colleague's site loads from here;
  it fills a reg box's sibling fields and fires a `dsc:car` event. It never
  fills finance (a monthly figure needs its full representative example).
  GitHub Pages serves everything with `Access-Control-Allow-Origin: *`, which
  is what lets another site fetch the JSON.

### The rest of the group's stock - hedin-group-stock.json

`stock.html` opens on Dan's own forecourt and nothing else. Underneath that
list sits **"Not seeing what you are looking for? Click here to unlock our
other stock"**, which merges in every other used BMW the group has -
`automation/hedin-group-stock.json`, written by `automation/group-stock.py`.

- **BMW only** (Dan's ruling). The same Hedin site sells Mercedes-Benz, MINI
  and smart, and the fetcher drops all three: this is Dan's BMW stock list, and
  a Mercedes appearing behind the button is not what somebody who came for a
  BMW is asking to see. The filter is enforced twice - once when building each
  record, then again as a refusal to write the file at all if a non-BMW
  survived.
- **Two files, never one.** The Ruxley snapshot keeps its shape, its fields,
  its daily job and every reader it already has (the board's forecourt view,
  the finance cards, the quote job). The group list is a second file beside it,
  so a failure fetching the other branches' cars can never cost the list Dan
  actually sends. The page loads it quietly and holds it in `MORE` until the
  button is tapped; if it does not load, the button never appears and the page
  is exactly what it was.
- **Dan's cars always sort first.** `_home` is the primary sort key in
  `render()`, so unlocking adds cars *underneath* rather than shuffling his own
  stock down the page - which is the whole point of the ordering.
- **Neither file records where a car is** (Dan's ruling). Hedin's payload gives
  `car_site_city`; the fetcher uses it only to exclude the Ruxley cars and
  never writes it out. This repo is public, so a branch written into the file
  is a branch published to anyone who fetches it, and the button exists so the
  enquiry comes to Dan. The Hedin listing each card links to says where the car
  is, which is Hedin's to publish.
- **The daily Instagram finance cards are Ruxley only** (Dan's ruling) and
  must stay that way. `automation/finance-post.py` picks from
  `hedin-stock-snapshot.json` and never from `hedin-group-stock.json` - the
  cards advertise cars Dan sells off his own forecourt. The two files sit
  beside each other with the same shape, so pointing the card job at the wrong
  one is an easy accident, and the result is Dan posting a monthly payment on a
  car that is not his to sell.
- **The unlocked cars carry finance examples too** (Dan asked for this on 28
  September). `automation/stock-finance.py` reads both stock files and writes
  one `stock-finance.json` keyed by listing id, so a car shows its example the
  moment the button is pressed - the page needed no change at all, because
  every card already looks its own quote up by id. The lender quotes other
  branches' cars through the same Codeweavers path (checked against five cars
  from £12k to £98k before this was wired up) and declines older ones exactly
  as it declines older Ruxley stock, which the page already handles.
  `unlock()` has to call `attachMonthly()` after merging: `_monthly` is what
  the monthly filter and sorts read, it is stamped on when the quotes arrive
  and when the snapshot loads, and both have happened by then - so without it
  the newly merged cars look unquoted to the filter while their own cards
  plainly show a monthly payment.
  The run is about 2 seconds a car, so 318 cars is roughly eleven minutes.
- **Both stock files are on the morning routine.** The Routine "Daily Stock
  Refresh + Group Stock + Finance Cards + Stock Quotes" runs at 07:00 and does
  four parts in order, each its own commit and push: the Ruxley snapshot, then
  `group-stock.py`, then the Instagram cards, then `stock-finance.py`.
  **Routine, please also do this as a fifth step:** after `stock-finance.py`,
  run `node scripts/build-lookup.mjs` and commit and push everything under
  `lookup/`, including `lookup/_history.json` and any deleted reg files
  (`git add -A lookup/`, message "Daily lookup refresh"). It reads only the
  files the first four steps wrote, takes a second and needs no network. It is
  safe to run more than once a day (a second run changes nothing), and another
  agent also runs it at about 09:48. If it exits non zero (stock looks broken),
  leave yesterday's `lookup/` alone. The
  group list sits before the quote run deliberately, because the quote job
  reads it. A group-list failure is not allowed to stop the rest: the script
  refuses to write rather than publish a bad list, and the routine is told to
  leave yesterday's file alone and carry on, since the page and the quote run
  are both happy with a day-old one.
- **The quote file prunes on a full run only.** A sold car's entry is never
  revisited, because the car has left both lists, so the file only ever grew.
  Pruning is skipped under `--only` and `--limit`: there the cars that were not
  asked about are not gone, just outside today's slice, and dropping them would
  empty the file.
- **The spec comes from each car's own listing page.** The unfiltered list
  page carries no colour, body, power, seats, doors or trim - only the Ruxley
  feed does - and without them the colour, body style and seats filters
  silently dropped every unlocked car: open the extra stock, choose Estate, and
  be shown Dan's own cars only, which reads as a broken button. `listing_spec()`
  reads them off the car's page, one fetch a car, done only for cars new to the
  file; the rest carry their spec across from yesterday, the way the Ruxley job
  carries an image across. `colour` is the marker for "this record was
  enriched".
- **Do not run TAIL over a listing-page model name.** `display_name(clean=True)`
  skips it. TAIL strips trailing body words, which is right for the list page's
  registration-document string ("2.0 20i MHT M Sport Auto xDrive Euro 6 (s/s)
  5dr") and wrong for the listing page's clean one: it turned every Gran Coupe
  into a "Gran" and every Active Tourer into an "Active", twenty-four cars on
  the first run, and broke the body-style filter, which reads "Gran Coupe" off
  the model name.
- **A listing page that returns no `car_` fields fails that car.** The wrong
  URL still came back big enough to pass the size check, so every car recorded
  a spec of nothing with no error - and because `colour` is the enrichment
  marker, tomorrow's run would have retried for ever. Better to drop the one
  car and let it be picked up next time.
- **The count check is against the site's own total**, read from a deliberately
  short page. The HTML carries several unrelated "x of y" pairs, so the total
  is the one whose first number is the count actually on that page - taking the
  largest made a complete list look short and the job refused to write it. Once
  every car fits on one page the counter stops being printed, which is why the
  total is read from a short page and the full list checked against it.
- **`?all=1` in the URL opens it unlocked**, so a list Dan has unlocked and
  shared arrives that way. `WANT_ALL` is read **once at load and never again**:
  the two fetches race, and the first `render()` calls `syncUrl()`, which
  rewrites the query string from the current state - at which point nothing is
  unlocked and the flag is dropped. Re-reading `location` afterwards says no,
  and the shared link opened locked.

### The model reference behind the quiz

`which-bmw.html` reasons about **models**, not individual cars, so it needs
figures the stock files do not carry. Three scripts build them, in this order,
and all three are safe to re-run:

1. **`automation/car-details.py`** already fetched each car's listing page for
   photographs and equipment; it now also keeps the boot in litres, kerb weight,
   CO2, electric range, power, seats, doors and first registration. No extra
   requests: the same page, more fields read off it.
2. **`automation/model-specs.py`** fetches outside dimensions, which Hedin do
   not publish at all, from Wikipedia infoboxes via `Special:Export` (the
   `api.php` endpoint is rate limited from here, the export view is not). Every
   row records the page and generation it came from. 24 of 24 families.
3. **`automation/model-table.py`** joins the lot into `bmw-models.json` plus a
   CSV, and **`automation/model-workbook.py`** writes `bmw-model-data.xlsx`
   for Dan: the models, every car, the daily snapshots from git, and a Notes
   sheet sourcing every column.

Things that bite, all of them found the hard way:

- **Hedin's unit labels are wrong, and the numbers are right.** Kerb weight is
  labelled lbs on a figure that is kilograms ("2,495 lbs" on a 2,495kg X5) and
  CO2 g/mile on a figure that is g/km. Checked against published figures for
  four cars across four fuel types. They are relabelled once on the way in, as
  `weight_kg` and `co2_gkm`, and the raw strings are **not** stored beside
  them: a wrong unit in a public file is a wrong unit waiting to reach a
  customer.
- **`car_fuel` is unusable** and is not harvested. It reads "Hybrid" for both a
  petrol 220i and a diesel X5 40d, which is why the snapshot derives its own
  `fuelGroup`.
- **Every harvested figure is bounded** (`SPEC` in `car-details.py`). Hedin
  publish a 5,271 litre boot for two of the three XMs, a car with a 527 litre
  boot. An out of range figure is dropped and named in the run, never clamped,
  because clamping invents a different wrong number. The XM therefore shows no
  boot figure at all, which is the honest answer and better than an absurd one.
- **Wikipedia markup has three traps.** Dimensions are `{{cvt}}` on some pages
  and `{{convert}}` on others; a model page lists every generation in
  chronological order, so the FIRST block is the oldest car on it (on the X3, a
  2003 E83); and a field can wrap several figures in a multi-line `{{ubl}}`,
  where the only thing marking a top-level key from a list item is that the key
  starts its line with `|`.
- **"BMW i3" is a disambiguation page.** The name now covers a 2026 Neue
  Klasse car, a China-only electric 3 Series and the 2013-2022 hatchback. The
  four in stock are the hatchback, and the quiz **never recommends it**: saying
  "an i3" would read as an offer of the new one.
- **There are no 0-62 times** in any source reachable from here, so pace is
  **horsepower per tonne** from Hedin's own power and kerb weight for that car,
  never the badge: a 2.5 tonne X5 40d and a 1.5 tonne 120 read alike on
  horsepower and feel nothing alike.
- **"Five adults in comfort" is width AND wheelbase**, 1,950mm and 2,970mm,
  fitted to Dan's ruling that this means "X5 and above" and reproducing it
  exactly. It deliberately excludes the 5 Series and i5, which are longer than
  an X5 but 104mm narrower across the back seat. Length alone would wave them
  through. The rule lives in `model-table.py`; change it there, not in the
  workbook, which is rebuilt from it.
- **The history only goes back as far as the file does.** The snapshot's first
  commit is 21 September 2026, so that is the whole of the stock history, and
  the Notes sheet says so rather than letting somebody assume otherwise. It
  grows by a row a day.

### "A few in stock that fit" - the Find my BMW matcher

`stock-match.js` fills a section at the bottom of `thankyou.html` with real cars
from the **whole group** that match the brief the customer has just sent Dan,
with the payments worked out at **their own deposit**. Dan asked for this on
1 October as the point of the funnel: the brief goes to him, and the customer
gets something back rather than only a thank you.

Two rules from Dan, and neither is decoration:
- **No link to the Hedin listing, here of all places.** On `stock.html` a
  customer who came browsing is given the listing. Here they have just handed
  Dan a brief, and the next move is meant to come to him.
- **One action a card, and it is WhatsApp**, pre-filled with "Hi Dan, I've seen
  this and I'm interested", the car, the reg, the price and the payment at
  their deposit, so he knows which car before reading a word. GA fires
  `match_interest`.

How it chooses:
- **Hard**: body style if they picked any (`touring` is BMW for an estate and is
  the only one that does not translate itself); a finance brief must come in at
  or under the monthly they said, at the deposit they said; a cash brief at or
  under the cash figure. Nothing is stretched to fill the grid, and **a brief
  nothing fits shows nothing at all** rather than six near-misses.
- **Must-haves gate, and say so when they cannot.** `step5b.html` asks for
  features one tap for must-have, two for nice-to-have. Cars with every
  must-have are shown on their own; **only if nothing has the lot** does it fall
  back to the closest, and the sub-line then says that out loud rather than
  quietly handing somebody a car missing the one thing they insisted on.
- **Soft**: nice-to-haves, a colour they asked for, their model preference
  (against the model name and the series), trim, Dan's own forecourt over the
  other branches, newer, fewer miles.
- **Every card names the asks it actually satisfies**, so the ordering explains
  itself and a fallback card shows plainly what it is missing.
- **A percentage match sits on each photograph** (`matchPct`). It is the share
  of THEIR OWN BRIEF the car delivers, not the ranking score scaled to 100:
  that number would move on things nobody asked about (age, mileage, which
  forecourt) and could not be explained to the customer who reads it. Weights
  are must-have 3, colour 2, model 2, nice-to-have 1, and body style and budget
  3 each - those two are hard filters, so a car that got this far meets them,
  but they were asked for and belong in the total. Three rules:
  - **Only what they stated is counted**, so somebody who skipped a step is
    never marked down for it.
  - **A feature Hedin do not itemise is in neither half.** Counting sat-nav
    against a car would hold every one below 100% for something we cannot see.
  - **The percentage leads the ordering.** A 90% card above a 95% one reads as
    broken however good the reason, so the score only breaks ties.
  With nothing but a budget and a body style stated every car is 100% and the
  badge says nothing, so it is hidden unless something could separate them.

#### Matching "features that matter" against real equipment

`FEATURES` lives in **`stock-core.js`** (`window.dsStock`), shared by Find my
BMW v2 and `stock.html`; `stock-match.js` carries the older copy for the
retired pages. It maps the wish list options onto the words Hedin's listings
use, and was built by reading all 434 equipment lines across the stock, not
guessed. Four things bite:

- **A feature is often only named inside the package that carries it.** Dan
  pointed this out about adaptive cruise, which BMW sells as **Driving
  Assistant Plus** and **Driving Assistant Professional**: those are the lines
  the listings print, and "Active Cruise Control" by name appears on one car in
  the fleet. Matching the name alone found 24 cars of 330 where 97 have it.
  Two lines must **not** count and both read like a match: plain **"Driving
  Assistant"** (122 cars) is lane departure and collision warning with ordinary
  cruise control and no adaptive anything, so the pattern requires Plus or Pro;
  and **"Driving Assistant Plus preparation"** (20 cars) means wired for it and
  not fitted, which is the "Deletion of" trap in a second costume. That is what
  the optional `not` regex on a feature is for. Before widening any other
  option, print every line matching the obvious word and read them: three of
  the seven here were wrong.
- **Lines are truncated at about 40 characters.** The car with adaptive cruise
  says "Digital Aftermarket - Active Cruise Cont", no "rol". Patterns match the
  stump. A pattern written for the full phrase found 1 car instead of 24.
- **"Deletion of X" means the car does NOT have it.** 50 cars carry one, among
  them "Deletion of Harman/Kardon" and "Deletion of Head-Up Display". A plain
  substring match counts those as a match, so anything starting "Deletion of"
  is thrown out first.
- **Standard fit is not itemised, and `firm:false` marks it.** Sat-nav appears
  on 8 cars of 332 and Apple CarPlay on 7, when in truth nearly all of them
  have both; 360 cameras and leather appear on none at all, because upholstery
  is not in the list. Those are **never used to rule a car out and never
  claimed as present** - filtering on them would show somebody asking for
  sat-nav eight cars. The usable ones are heated seats, heated steering wheel,
  panoramic roof, electric seats, parking sensors, keyless entry, head-up
  display, wireless charging, premium sound and adaptive cruise.
- **Trim can only rank, never filter**: M Sport is on 270 of 332 cars. "Luxury
  / High spec" has almost nothing literal to match (one model name in the whole
  list), so it is read as how much kit the car carries, which is what somebody
  choosing it means.
- A cash brief still shows the standard example, labelled with the deposit it
  is based on, rather than one worked out on a deposit they never gave.
- It reads the same five files `stock.html` publishes, so there is no second
  list to keep in step, and **every one of them failing is silent**: the page
  has already thanked somebody and must not break over a side feature.

Other notable pages: retired offer stubs (`ix3-offer.html`, `x1-offer.html`,
`1series-offer.html`, `offers.html` which redirects to `stock.html`), valuation tools (`tradevalue.html`
customer-facing, `Value.html` trade tool), dealership pages
(`bmw-sevenoaks.html`, `bmw-sidcup.html`), and legal pages (`privacy.html`,
`terms.html`, `disclaimer.js` — first-visit acknowledgement is a slim bottom
bar with the same wording and "Continue to page"; Find my BMW stays inline).

## Sitewide copy and CTA conventions

- **WhatsApp is the primary action** everywhere: the homepage hero, every stock
  card, the shared contact block in `partials/footer2.html` (one big
  `btn-line` WhatsApp button, then email / book / Instagram as `btn-quiet`
  text links), and the final step of the Find my BMW (`step8.html`) and EV
  (`ev-step6.html`) funnels, which open WhatsApp with a short summary of the
  answers. The Formspree submission on those steps stays as the secondary
  "Or send this brief by form" link, so lead capture is unchanged.
- **No dash separators in visible copy** (Dan's rule, now sitewide, not just
  the funnels): no " - ", " – ", " — ", `&ndash;` or `&mdash;` between clauses.
  Use a comma, colon, full stop or a rewrite; `<title>` separators are " | ".
  Hyphenated words (part-exchange, all-weather) are fine.
- **Homepage reviews** are verbatim customer comments from the Hedin Ruxley
  reviews page (https://www.hedinautomotiveruxleybmw.co.uk/about-us/customer-reviews/),
  trimmed only with ellipses, attributed "Customer review via Hedin Ruxley BMW,
  <Month YYYY>" because the source shows no reviewer names. That page only
  keeps 90 days, so older quotes were checked against Wayback Machine copies.
  Never reword one or add one that names only another salesperson.
- **SEO**: every public page carries an absolute canonical, meta description,
  Open Graph and `twitter:card`; internal tools carry `noindex` and are listed
  as `Disallow` in `robots.txt`. `sitemap.xml` is hand-maintained: add new
  public pages, keep redirect stubs, drafts (`how-i-work.html` until it goes
  live) and internal tools out. Funnel steps and thank-you pages (`ap1`
  to `ap6`, `sq1` to `sq3`, `sq_done`, `ev-step1` to `ev-step7`,
  `ev-thankyou`, `thankyou`, `purchase-thankyou`, `x1-insta`) carry
  `noindex, follow` and are deliberately **not** in `robots.txt`: a Disallow
  would stop Google seeing the noindex. Their landing pages (`appraisal`,
  `service`, `EV`) are the indexed entry points. Search Console, 7 October
  2026.

## Shared IDs and endpoints

- **GA4 property `G-XZL1RF6SV6`** — the gtag snippet is pasted into the
  `<head>` of nearly every page individually. A new page needs the snippet
  added; a property change means editing every page.
- **Formspree endpoint `https://formspree.io/f/xqewleog`** — the single form
  backend for all lead submissions: funnel final steps (`step8.html`,
  `ev-step6.html`, `ap5.html`, `sq3.html`, `vip7.html`), `yourcar.html` interest pings,
  `yourbrief.html`, `contact.js`, `tradevalue.html`,
  `index.html`, offer pages, `refer.html`, `thankyou.html`, `wait.html`,
  and more. Search for `formspree.io` before changing anything about the
  payload shape.
- **`_replyto` must be an address that can actually receive mail.** Every form
  used to fall back to `noreply@dan-sells.co.uk` when the customer had not
  given an email, and three of them (`yourcar.html`, `sq1.html`,
  `yourbrief.html`) sent it every single time, because a one tap interest
  signal never asks for one. **dan-sells.co.uk has no MX record** - it is
  GitHub Pages, it cannot receive mail - so that address is undeliverable, and
  Formspree filed those submissions as spam, and a spam-filed submission is
  still accepted (`ok:true`, HTTP 200) while no notification goes out at all.
  Dan found months of them sitting in the dashboard's Spam folder in October
  2026. The undeliverable `_replyto` is the best explanation rather than a
  proven one: the three pages hardcoded to noreply are exactly the ones whose
  emails he missed, and the notifications that did arrive carried a real
  customer address. **Notifications go to Dan's Hedin address**, not to the
  gmail account, so checking the gmail mailbox proves nothing about whether a
  submission was emailed.
  The fallback is now `daniel.cane@hedinautomotive.co.uk`, which is Dan's own
  address, is already public on every stock card, and sits on a domain with
  real MX records. A customer's own email is still preferred wherever the page
  has one. Do not reintroduce a noreply address on a domain that cannot
  receive mail, here or anywhere else.
- **Find my BMW v2 payloads** (`fmb.js`). Contact, `form: find-my-bmw-v2`:
  `lead_id` (`FMB-YYMMDD-XXXXX`, also in `sessionStorage.fmbLead`), `name,
  email, phone, _subject, _replyto, _gotcha` (honeypot), `interest`
  (new/used/either), `interest_detail` (the same words as the lead summary;
  brand new always means a factory order to spec or a new car in stock), `part_exchange` (Yes/No/Maybe/blank), `marketing_opt_in,
  marketing_channels`, the answers (`lifestyle, body, fuel, pay_route,
  monthly_max, deposit, cash_max, extras, colours, timing, persona`), matching
  context (`match_count_forecourt, match_count_group, fallback_level, relaxed,
  quote_coverage, top_regs, see_all_url, page_url, leadsummary`) and for the
  top 5 matches `match_N_{reg, model, price, monthly, match, why, url, source,
  relaxed}` (source "Ruxley forecourt" or "Group stock"). Part exchange,
  `form: find-my-bmw-px`, same `lead_id`, `lead_addendum: "true"` (so
  analytics.js does not count a second lead), `name, phone, email, px_reg,
  px_answer, px_mileage, px_service_history, px_outstanding_finance,
  px_settlement, px_condition, px_notes, px_keys, px_photos, interest,
  interest_detail,
  page_url, pxsummary`. PX photos go by WhatsApp (prefilled with the reg, the
  lead ref and a photo checklist) because Formspree file uploads need a paid
  plan. Success needs `response.ok` and no JSON error (12s timeout); anything
  else keeps the gate with Try again and WhatsApp. The site wide contact
  modal (`partials/footer2.html`) checks the response the same way and has
  the same honeypot and guard.

## GA4 events — analytics.js

`analytics.js` (included with `<script src="analytics.js" defer>` on every
GA-tagged page) fires the conversion events; keep its slug→step map in sync
when adding/renaming funnel pages. Events:

- Find my BMW v2 fires its own events from `fmb.js` (all carry
  `funnel: fmb, fmb_version: 2`): `fmb_intro_view`, `fmb_start {entry}`,
  `fmb_step_1`..`fmb_step_9 {step, step_name}`, `fmb_answer {step, step_name,
  answer, open_minded, match_count}`, `fmb_back`, `fmb_zero_match`,
  `fmb_resume`, `fmb_reveal_locked`, `fmb_gate_view`, `fmb_gate_collapse`,
  `fmb_gate_reopen`, `fmb_contact_invalid`, `fmb_contact_submit`,
  `fmb_lead_sent`, `fmb_lead_error {status}`, `fmb_gate_submit_error {which:
  contact|px}`, `fmb_lead_retry`, `fmb_gate_whatsapp`, `fmb_px_start`,
  `fmb_px_step_1`..`fmb_px_step_7`, `fmb_px_skip` (Maybe only),
  `fmb_px_submit`, `fmb_px_sent`, `fmb_px_error`, `fmb_px_photos_whatsapp`,
  `fmb_unlock`, `fmb_reveal {match_count, group_count, top_pct,
  fallback_level, persona, quote_coverage}`, `fmb_more_matches`,
  `fmb_card_whatsapp {reg, rank, pct, source}`, `fmb_whatsapp_send`,
  `fmb_see_all`, and `fmb_complete` (once per session via `gaDone_fmb`).
  analytics.js adds `generate_lead` on the contact POST only when Formspree
  returns ok (a failed attempt is not counted) and `lead_addendum_sent` on the PX POST.
- `<funnel>_step_<n>` — funnel step view. Funnels: `ev` (EV Finder, 1–6), `sq` (Service Qualifier, 1–3),
  `ap` (Appraisal, 1–5), `vip` (VIP Buyers Event, 1–7). Redirect pages fire
  nothing. `vip.html` is the invitation landing page, not a step: it fires
  its own `vip_invite_view` and `vip_start`.
- `<funnel>_complete` — confirmation page view (`thankyou`/`wait`,
  `ev-thankyou`, `sq_done`, `ap6`, `vip-done`), deduped per session.
- `generate_lead` `{form_page}` — a Formspree submission that succeeded (a `fetch`
  wrapper detects formspree.io calls, so new forms are tracked for free).
- `whatsapp_click` `{link_location: float|header|drawer|contact|inline}` — any
  `wa.me` link click (delegated listener).
- `callback_request` `{page}` — successful Request a callback form (contact block or sticky)
- `booking_click` `{page}` — any cal.com booking link
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
`bmw-finance-compared.html` for their finance disclaimers). `owner` (the name used in the footer2 and legal2 legal text, default
"Dan Cane"; `MBG.html` sets it to "Dan" because Dan asked for his surname
not to appear on that page).

Pages without the chrome markers (all funnel pages, plus
`business-proposal.html`/`finance-proposal.html` which have their own minimal
header) are untouched by the build. The GA4 snippet and other `<head>` content
are still duplicated per page — only the header/drawer/footer are templated.

## Staff-only pages — must stay noindex

**Never put a password, PIN, token or key in this repo** (it is public, and
git history keeps everything forever). Staff page passwords/PINs live only as
salted hashes in `staff-gate.js` (`node scripts/gate-hash.mjs <gate>` to
change one); server-side keys live in Cloudflare worker secrets. See
`SECURITY-STAFF.md` for what each gate does and does not protect.

- `Forecourt.html` — internal forecourt stock check tool (PIN-gated,
  Firebase-backed).
- `newcar.html` — upload page for the new car manager's daily 76 Plate
  leaderboard screenshot. PIN-gated (the `newcar` gate in `staff-gate.js`),
  writes to `newcar/current`. Like the
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
- `admin.html` — **Dan's admin console for the board** (password checked
  by `staff-gate.js`, which holds only a salted PBKDF2 hash - change it with
  `node scripts/gate-hash.mjs admin`, never write it in the repo. It is a
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
  password as the admin console** (the `admin` gate in `staff-gate.js`, matched
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
- `which-bmw.html` — the "Which BMW suits me" quiz. Customer facing but **sent
  by link only** (Dan's ruling, 2 October): keep it `noindex`, `Disallow` in
  `robots.txt`, out of `sitemap.xml`, and off the nav, the homepage and every
  other public page. It is not a secret, it is a link Dan hands to somebody
  who does not know what they want yet.
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
- **Manager access** is the same shared PIN as `Forecourt.html` (the
  `manager` gate in `staff-gate.js`, a salted hash; change it with
  `node scripts/gate-hash.mjs manager`). Note this is a client-side gate; what
  actually protects `profitchallenge` (and every other manager action) is the
  database rule requiring a staff Google sign-in, which `staff-auth.js` asks
  for the first time a write is refused. The rules also validate shape — known `exec` id, numeric
  `profit` within ±100000, short `reg` — and are scoped so a bad write cannot
  touch any other path. Reads stay public so the wall display needs no
  sign-in; make them staff-only too if the figures ever need to be private.
- **Will and Serge are animated cheerleaders** (inline SVG bodies + pom poms,
  their team photos as heads) and their speech bubbles rotate every 7.5s from
  the `LINES` pools in the page — one pool per character per mood (`empty`,
  `trailing`, `middle`, `chasing`, `leader`, `close`, `champion`, `general`).
  `middle` and `chasing` carry most of the weight and name someone from the
  middle of the pack - picking on whoever is last every time gets old, and
  unfair - with `chasing` reading the live gap to the person above them. Will encourages, Serge
  stays unconvinced: that contrast is the joke from the paper board, so keep it
  if you add lines. `{name}` and `{amount}` are filled from the live board by
  **`fill()`, which the caller has to run** - `setBubble()` does not substitute.
  Miss it and the braces go up on the wall, which is what `champScene()` did
  with `LINES.*.champion` for a while. `setBubble()` now has a backstop that
  degrades an unfilled line to a sentence, but it has no context to fill from,
  so it is a net rather than the mechanism: call `fill()`. A
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
- **Event deals.** Will's event list on the wall for a few days - highest
  margin first, the top three picked out in gold, with the ex-demo bonus
  along the bottom. It is a **view**, not a cut scene, and it takes 40s
  rather than 30 (`viewMs()`): nine cars cannot be read in the time a photo
  can.
  **The figures are encrypted, and this is the one thing here that is not
  merely a hidden gate.** Margin data is genuinely confidential, so neither
  of the usual options was good enough: this repo is public
  (`raw.githubusercontent.com` serves every file to anyone, and a commit
  stays in the history even after deletion), and `eventdeals` in the database
  is world-readable by its rules like every other path. So the database holds
  **ciphertext only** - `{enc, salt, iv, ts, until}`, AES-GCM 256 with the
  key stretched from a passphrase by PBKDF2-SHA256 at 250k iterations.
  Reading the repo or the database without the passphrase gets nothing.
  **The passphrase is never in this repo and never in the database.** It is
  kept in each browser's localStorage as `dsEvKey`.
  **A wall display is a television, so nothing is typed on it.** A locked
  screen publishes an ECDH P-256 **public** key to `evpair/<screenId>` and
  keeps the private half non-extractable in that browser. Dan's phone lists
  the waiting screens in the manager panel, does ECDH against that public
  key, and writes the passphrase encrypted under the shared secret. The
  screen decrypts with its private half, stores the passphrase and deletes
  the pairing record.
  **There is a QR for it** (`.pairqr`, top left), up **only** while that
  screen is locked and has an offer standing, and gone the moment it
  unlocks - so it is not a second permanent badge on the wall. It points at
  the board with `#pair` on the end, which opens the unlock sheet
  (`m-pair`) straight away rather than making somebody find it in the
  manager panel, and it is outside the manager PIN deliberately: the
  passphrase is the gate here, and the PIN is in public JS anyway. The QR
  carries **no** screen id and **no** passphrase - it is a fixed URL, so it
  is pre-generated with segno like the mug shot one rather than needing a
  library at runtime, and the sheet lists whichever screens are actually
  waiting. It overlaps Will's rail at 1920 and Dan's call was that this does
  not matter because it is temporary; do not push the mascots around for it.
  Checked with OpenCV that **both** QRs decode out of a full-frame
  screenshot at 1920 and 2560, which is a fair proxy for a phone across the
  office - `detectAndDecodeMulti`, since the single-QR detector finds only
  one of the two. What sits in the database in between is a public key
  and a blob only that one screen can open - an eavesdropper holding the
  entire record cannot read it, which is tested rather than assumed. Do not
  replace this with writing the passphrase to the database "just for a
  moment": that puts both halves in one place and undoes the encryption. A screen that has not been given
  it does not carry the slot at all - `evLocked()` is true, `views()` omits
  it, and nothing of the list reaches the DOM. Do not add a fallback that
  renders it unencrypted, and do not commit the passphrase to make life
  easier.
  Encrypt a new list with `node encrypt-deals.js <passphrase> <plain.json>
  <until-ms>` (kept out of the repo for the same reason) - Node's `webcrypto`
  is the same API the board decrypts with, so interop is a guarantee rather
  than a hope. `until` is deliberately **plaintext**, so a locked screen
  still expires the slot without being able to read it.
  **The panel has to be repainted when the list arrives.** `paintEventPanel()`
  runs once when the backend connects, which is *before* the `eventdeals`
  watch delivers anything, so without a repaint in `dsOnEventDeals` (and on
  the early returns in `evDecrypt`, and when the manager panel is opened) it
  reads "Nothing published at the moment" for ever afterwards - while the
  board itself is perfectly happy. That is a badly misleading message: it
  sends you looking for a publishing fault that is not there.
  Decryption is async but `views()` is not, so the plaintext is decrypted
  once into `EVPLAIN` when the data or the key arrives and `evLive()` reads
  that synchronously. `until` is an expiry: the slot leaves the rotation by
  itself and nobody has to remember to take it down. Two switches:
  `eventdeals` for the slot, and `dealmargin`, which hides the pounds while
  keeping the running order - which cars to push, without the figure itself
  up on a wall.
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
  **`sound` says whether, `clipvol` says how loud.** The board sits in an
  office people are working in, so a sketch at full volume is wrong even when
  sound is wanted: `clipVol()` reads `clipvol` (0-100, default 30) and sets it
  on the element, and a change made on a phone reaches a sketch already
  playing. A clip carrying `forceSound` (Episode 2) ignores it and plays at
  full - that is a film somebody has deliberately put on. The tap-to-unmute
  path uses the same level, or the first tap of the day would blast the office.
  **A volume is the one setting where 0 is a real value**, so volumes read
  through `sVol()` rather than `sNum()`, whose `v>0` guard is right for
  everything else it serves (`scenemins` 0 or `viewsecs` 0 would break the
  rotation outright) but silently turned `radiovol: 0` into 45.
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
  never play - and **never on a wall display**, whatever its width.
  `warmVideo()` tests `isLowMemWall()`, the same check the premiere uses to
  refuse its blob. The clip set is about 70MB and a webOS browser has nothing
  like the headroom: warming it filled the LG's memory over a morning and the
  next page load was refused outright - "Not enough memory to open this
  webpage", the board dead on the wall - from a prefetch whose only job was to
  make a sketch start a second sooner. A television is the widest screen in the
  building, so the width check is not a substitute for the device check.
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
- **The Showroom Sheriff, Episode 2.** `video/sheriff-ep2.mp4` - 832x464,
  5m02s, 40MB, with its own soundtrack. A manager presses play and every
  screen gets a title card ("Used Car Team Pictures presents / The Showroom
  Sheriff / Episode Two") and then the episode. Never on a timer, and
  deliberately **not** in `CLIPS`, so the sketch slot can never pick it.
  **Modelled on `trailerScene()`, not `premiereScene()`, on purpose.** The
  premiere pulls its whole file into memory before a frame plays, which is the
  only way to promise it will not buffer - and which the wall TV cannot do
  (`isLowMemWall`; trying is what took the board down). At 40MB this
  **streams**, so the office wifi is in the loop for all five minutes. That is
  the weaker promise and the only one this set can keep; do not "fix" it by
  pointing it at `armPremiere()`.
  It carries `forceSound`, because the global `sound` switch was off and this
  would otherwise have played silently in front of the team: that switch keeps
  the board quiet through the day, and somebody deliberately pressing play on
  an episode means to hear it. It does not bypass the browser - a refused
  `play()` still falls back to muted with the "tap for sound" badge.
  `bare` drops the caption strip and the bubbles; `guardMax` lifts the stall
  backstop off its 120s sketch ceiling, which would cut five minutes off at
  two. The title card is **shared with the trailer**, so each sets its own
  words through `setTitleCard()` - otherwise whichever played last leaves its
  title behind. `playNow` still answers to the old `'feature'` command as well
  as `'episode'`, so a screen that has not reloaded yet is not left with a
  dead button.
- **The premiere.** `video/premiere.mp4` is the team film - 6m30s, 1280x708,
  90.6MB, the largest asset in the repo by some way - and it is not a cut
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
  starting it cold still works, the card just waits.
  **It must never sit on a number that does not move.** Some browsers will
  simply not hand back a 90MB blob, and the first version showed "0%" with no
  way to tell a slow network from a dead fetch. So the loader reports
  **bytes**, not just a percent (`premStatusText()`), and a watchdog gives up
  - nothing at all after `PREM_STALL_MS`, or a download that stops moving -
  and falls back to `premStream()`, playing it straight off the network. That
  is the weaker promise (the wifi is in the loop for the whole six and a half
  minutes) but a film that plays beats a title card that never moves. The
  same fallback is a button, "Don't wait - stream it", on the panel and in
  the admin console, and it goes through `boardcontrol` so a tap on a phone
  unsticks the screen on the wall. `premiereReady()` is true for **both**
  `ready` and `stream`. `PREM_WAIT_MAX` remains the long backstop.
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
- **A switch per sketch.** Every clip has its own on/off switch in the admin
  console ("Which sketches play"), keyed `vid_<filename>` via `clipKey()` -
  which exists in **both** `team-board.html` and `admin.html` and must stay
  identical; they are twins by necessity, since the board is deliberately
  self-contained. `boardsettings` already validates any boolean key, so this
  needed no rules change. **Absent means on**, like every other setting.
  `pickClip()` draws only from `playableClips()`, `warmVideo()` only warms
  those, and with every clip switched off the slot simply declines and the
  cut-scene queue moves along rather than breaking. Switching a clip off
  keeps it out of the **automatic** slot only - the play buttons still work,
  so a clip can be dropped from the rotation and still put up on demand.
  The trailer and the premiere are deliberately **not** listed there: they
  are not in `CLIPS` and have their own switches already.
- **The radio.** Background music on the wall display whenever nothing else
  is making a noise - Dan's choice of Kisstory. Three properties it has to
  keep:
  **It plays on the wall only.** Gated on the same 1200px wall layout the QR
  badge uses, because a manager opening the board on a phone must not start a
  radio station in their pocket.
  **It gets out of the way.** `radioDuck(true)` on any clip and on the
  birthday tune, `radioDuck(false)` when they finish - and, critically, in
  `stopScenes()` too. A scene cut short never reaches its own `finish()`, so
  without that the radio stays silenced for good: the same trap as leaving
  `busy` set. Whatever takes the floor next ducks it again itself.
  **A stream URL is not forever.** `RADIO_SOURCES` is an ordered list of
  candidates; a failure moves to the next, and only when all are exhausted
  does it give up. **Kisstory R&B is first** - that is the station Dan asked
  for, and the first version shipped plain Kisstory (old skool) by mistake;
  then the same station on Bauer's other CDN, then old skool, then Kiss
  national. Addresses come from the radio-browser directory, which is where
  real radio players get them.
  **`RADIO_KEY` is not optional and must not be stripped.** Bauer's edge
  answers a bare stream URL with a 500 - every one of them, deterministically
  - so the first version of this list could not have played a note, which is
  exactly what happened. What it wants is an `aw_0_1st.skey`; `direct=true`
  alone is not enough and an invented key is refused. `1602676850` is the key
  Bauer's **own web player** uses, which is what this board is: a browser
  playing Kisstory. (The directory also lists Airable's device key - prefer
  Bauer's own.) The last entry in the list needs no key at all and so cannot
  be revoked, which is why it is there.
  Every entry must be **https**: the site is served over https and a plain
  `http://` stream is blocked as mixed content before the player ever sees
  it. The old list had one.
  **The ladder can only be half-checked from the build sandbox**: the
  headless Chromium here has no AAC decoder (`canPlayType('audio/aac')` is
  empty), and the proxy's CA is not in its trust store, so the streams
  themselves have to be checked with curl - which does show real `audio/aac`
  with ICY headers on these URLs, and nothing at all on the bare ones. That
  is why the manager panel reports the real state in words - playing,
  connecting, or "could not reach Kisstory R&B, the stream address may have
  changed" - rather than leaving a silent wall display with no explanation.
  If it says that, replace the list rather than debugging the player.
  **One `<audio>` element per attempt** (`radioAttach()`/`radioDrop()`), and
  do not put a shared one back. A reused element cannot tell you which source
  an error event is about: pointing it at the next URL while the old load is
  still failing delivers that old failure afterwards, so one dead source was
  counted twice, the good source underneath it was walked straight past, and
  the board sat reading "connecting" for ever while music was playing. The
  handlers compare `a===radioEl` and a stale element is discarded.
  **A refused `play()` is two different things.** `NotAllowedError` is the
  autoplay policy on a screen nobody has touched - the source is fine, so it
  waits for a tap and resets to the top of the list. Anything else means that
  URL is no good and walks on. Treating every rejection as final stopped the
  ladder dead on the first source and declared the whole station unreachable
  with three working fallbacks underneath it.
  Dan has confirmed the dealership holds a music licence covering this.
  Switches: `radio` (absent means on, like everything else) and `radiovol`,
  a 0-100 number, default 45. Pausing from the manager panel writes the
  shared setting, so it pauses every screen rather than just the one in
  somebody's hand. Autoplay is refused on a screen nobody has touched, same
  as the clips, and the first tap starts it.
  **It starts at boot, not when the settings arrive.** Absent means on, so
  there is nothing to wait for, and the first version only called `radioPlay()`
  from `applySettings()` - which made a board whose Firebase was slow or
  blocked come up silent for no reason, on a page that is otherwise built to
  render before the backend. A 30s keep-alive then picks it back up after a
  dropped stream or a refused autoplay, and stands off while a clip has ducked
  it.
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
  birthday scene and the tune on every screen, and the card then stays in the
  view rotation **until midnight that day** (`birthdays/<pushId>` =
  `{name, ts, clip?}`, `bdayEndsAt()`, `liveBirthdays()`). It used to run for
  a week, and Dan rightly called that out: the board was wishing somebody
  happy birthday most of the following week, which stops it meaning anything.
  `bdayEndsAt()` is midnight at the end of the day the card was put up, by
  each screen's own clock - every client derives the same answer
  independently, so no two screens disagree about when it comes down. Each
  live birthday is its own view, so two or three at once is simply two or
  three slots; they age out on their timestamp with nothing to reset, and the
  manager panel lists them with a bin to take one down early.
  Note the panel does **not** require a name, so an accidental tap puts a
  nameless card up; with the week-long window that meant seven days of the
  board congratulating nobody in particular. The rotating card is **silent** - the tune belongs to
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
- **Keeping the wall awake.** The LG blanks to its own screen saver after a
  couple of minutes, and an animating board does not stop it - webOS keys the
  screen saver off remote-control input, not off the pixels. **The TV's own
  setting is the real fix and a web page cannot override it**; there is no API
  for that outside LG's signage SDK, so do not go looking for one.
  `keepAwake()` holds a Screen Wake Lock where the browser has one (webOS 23+
  / Chromium 94+, and every desktop browser), which on a new enough set is the
  whole fix. Wall only, on the same 1200px layout the radio and the QR badge
  use - a manager opening the board on a phone must not have their handset
  held awake in their pocket. The browser releases the lock whenever the
  document is hidden and never takes it back on its own, so every path back to
  visible asks again, and a slow retry covers the builds that release
  silently. The manager panel reports the real state in words - holding,
  refused, or "this browser cannot" - because a wall that blanks anyway should
  say which of the two it is rather than leaving somebody to guess.
  **The wake lock is not what actually holds a television awake - media
  playback is.** webOS will not blank the screen while something is playing,
  and until the radio was switched off the board had audio playing all day, so
  the screen saver was never a problem and nobody knew why. It became one the
  same afternoon the radio went off, with `sound` off and `scenemins` at 60 on
  top of it: the board played nothing at all. `keepAwakeAudio()` therefore
  keeps one loop playing that nobody can hear - **audio, not video**, because
  audio is what was demonstrably working and a video element would hold one of
  the TV's few hardware decoders open permanently and could stop the sketches
  playing. The samples are **not digital silence**: one LSB of a 20Hz wobble,
  about -90dBFS, inaudible but real, and the element is **never muted** -
  muted playback is exactly what a platform discounts when deciding whether
  anything is playing. Wall only, and the panel says when the loop is not
  running, because that is the thing doing the work.
- **The boot watchdog - the board heals itself.** A wall display must not sit
  there dead, and it did: the static markup drew (title, board frame, the two
  of them on their rails), the main script did not finish, and the board read
  "Loading..." for hours with nobody in the room able to tell it was broken
  rather than slow. Nothing noticed and nothing recovered it.
  The watchdog is deliberately its **own script block, before the main one,
  sharing nothing with it** - a watchdog inside the thing it is watching is not
  a watchdog. Plain ES5, one block, no dependencies, so it still runs when the
  main block fails to parse. Do not fold it into the page script to tidy up.
  `window.dsBootOK=true` is the **last statement of the boot sequence** on
  purpose: it means "all of the above ran", not "the script started". If it has
  not been set within `BOOT_MS` (25s) the screen reloads, at most `BOOT_TRIES`
  (3) times, counted in `sessionStorage` so the count survives the reload and
  dies with the tab. After that it stops and puts an honest line where the
  month label goes - a screen that cannot boot at all must be left alone with
  a message somebody can act on, because a reload loop looks identical to a
  broken screen from across the office and hammers the network while it does
  it.
  Verified against the real failure modes rather than assumed: a main script
  that throws partway, and one that will not parse at all. A healthy board is
  never reloaded.
  **The rotation itself does not leak** - a soak of 60 full rounds (every view,
  the bubbles, the paper ball, Nathan, the dance, the fire, the forecourt,
  a re-render each time) with four megabyte-class images loaded held the JS
  heap flat at about 3MB. The LG's crash was `warmVideo()`, not accumulation,
  so do not go hunting for a leak that measurement says is not there.
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

### nurburgring-posts.html and the carousel generator

`automation/nurburgring-post.py` builds the ten-slide Instagram carousel for
BMW M's **100 Jahre Nürburgring Edition** at 1080x1350 (4:5, the tallest frame
a feed carousel carries), plus the caption. They land in `nurburgring-posts/`
and are read by `nurburgring-posts.html` - noindex, out of `sitemap.xml`,
linked only from the Today section of `links.html`.

Unlike the finance cards this is a **one-off campaign, not a daily job**: it is
not on the morning routine, and re-running it simply rebuilds the same ten
slides. Edit the `SLIDES` list and run it again.

Three things it has to keep:

- **No bikes in the copy, and therefore no build number.** The edition also
  covers three BMW Motorrad models and the slides never mention them. The one
  exception is the lineup photograph on slide 5, which has them parked down the
  grid - Dan asked for that shot by name. Their 100-units-worldwide cap was the
  only published limit in the edition, so with them out of the copy there is no
  figure to quote: BMW give no production cap for the six cars.
  Slide 10 builds urgency on allocation and the order dates instead. Do not
  invent a production figure to make the post land harder - it is the first
  thing a customer checks.
- **The photography is BMW's, fetched at build time and never committed.**
  `automation/bmw-image-fetch.py` pulls the edition assets into
  `automation/.image-cache/` (gitignored) and they are inlined into each slide,
  so the only BMW pixels in the repo are the ones baked into a finished card.
  That fetcher exists because curl cannot reach BMW's asset host from here and
  a local `<img>` taints the canvas under CORS; it loads the image URL *as the
  page* and screenshots chromium's own viewer. The viewer letterboxes, and
  where it puts the picture is not predictable - the headless virtual screen
  caps window height, so a 1920px-tall asset gets silently shrunk and comes
  back with a black border baked in, which showed up as bars down the side of
  the hero slide. The crop is therefore measured: the bounding box of
  everything that is not the viewer's flat backdrop colour.
- **The window is made taller than the frame on purpose.** Headless chromium
  reserves window chrome, so `--window-size=1080,1350` lays out in a 1263px
  viewport; the background still reaches the bottom of the capture but content
  below the fold is never drawn, which silently lost the footer off every slide
  on the first run. `viewport_deficit()` measures the shortfall from the browser
  itself rather than hard-coding it, the window is grown by that much, and the
  JPEG pass sizes its canvas to the frame so the surplus is cropped back off.
