# Forecourt Empire — beta feedback log & roadmap

## Status — build pass of 2026-07-25c (performance variants & the real-time clock)

### Performance variants (from week 10)

Modelled on how the real sub-brands are structured: makers run a "warm" mid tier
(Ford ST, BMW M Performance) below a fully re-engineered "hot" tier (Ford RS,
full BMW M) — and budget makers have no performance arm at all, their sporty
trims being a body kit and a badge. So:

| Brand | Warm | Hot | Notes |
|---|---|---|---|
| Fjord | ST | RS | RS is the top tier, as with Ford's Rallye Sport |
| BMV | M Sport | M Power | mirrors M Performance vs full M Division |
| Dacio | — | — | cosmetic `GT-Line` only: no upside, no downside |

Trade behaviour is grounded in how these actually move on a forecourt: real
retail money (+16-45%) and easier finance, but a narrower buyer pool (longer
days), dearer prep (brakes and tyres: x1.30-x1.90) and higher fault odds because
they get driven hard. Modified examples are worth less and harder to shift
again, so the hot tiers carry a 28-30% mod chance that the risk light reads.
Enthusiast demand lifts through spring/summer (`FE.PERF_SEASON`).

Tuning lives in `FE.PERF` / `FE.PERF_UNLOCK_WK` / `FE.PERF_P`. Measured: 0% of
lots before week 10, ~13-14% after, tier split tracking the configured weights.

### Real-time clock

The forecourt keeps trading while the tab is shut: **one real day = one game
week** (`FE.REALTIME.msPerWeek`). On resume, `FE.offlineProgress()` runs the
owed weeks on the same conservative AFK rules as Skip Week, writes one digest
email (not one per week) and shows a "While you were away" summary.

- Capped at `FE.REALTIME.maxWeeks` (4) so a long absence can't burn a quarter on
  autopilot; the excess is forgiven and reported.
- `G.lastSeen` is stamped by `FE.save()`, so the clock anchors to the last thing
  the player actually did.
- Player can pause the clock from Save & profile.
- Digest calls out the two ways an absence goes wrong: nobody on the floor, or
  the pitch running dry.

---

## Status — build pass of 2026-07-25b (bays & the late-night prospect)

- **Wash & valet bay (£28k) and smart repair bay (£46k)** are now real
  departments alongside the service department, each with its own mechanic:
  smart repair cuts every prep bill a further 22% *and* drops blowout odds 45%
  (measured: avg prep £777 → £454 with service → £338 with both; blowouts
  8.6% → 5.6%); the valet bay lifts conversion 4% because a clean forecourt
  closes better. Both pay a small weekly income and appear on the site view as
  lock-ups stepping down the left edge. Dept plumbing is generalised — income,
  net-worth capital and the progress card all iterate `FE.DEPARTMENTS`.
- **Two new mini-games:** *Walk-Around* (spot every fault on a canvas-drawn
  top-down car before the clock; misses are revealed at the end) and *Hit the
  Gross* (stop the needle in the green, three deals, window tightening).
- **The reward is now a deal you manage, not an auto-sale.** Clearing any level
  brings a late-night prospect through the door with a *retailable* part-
  exchange: you see its retail, book money, gross at book and est. days, then
  choose the allowance (under / book / over — under risks them walking), then
  work the F&I. The PX lands on your pitch with a prep bill to follow. Still
  capped at one a week; the live deal persists on `G.lateNight` so it survives
  a reload mid-negotiation.

---

## Status — build pass of 2026-07-25 (onboarding & persistence)

- **Inherited starter stock:** you now begin with `FE.STARTER_STOCK` (10) cars
  already on the pitch — free of cash outlay, carried at `FE.STARTER_BOOK` (74%
  of retail) so gross reads honestly. Seven sound, three with a visible flaw.
  Week 1 is playable from the first minute instead of "spend £300k, then wait".
- **Progressive unlocks:** the office opens up over time via `FE.UNLOCKS`
  (finance wk3, ads wk5, departments + land wk6, franchise wk7, pay wk9).
  Gated in the engine (`FE.unlocked`), shown as locked cards plus a "coming up"
  list so nothing feels hidden or missable.
- **"Lanes" → "auction house"** throughout the player-facing copy.
- **Cash always visible in the auction** — a wallet bar with cash, total spend
  power (when finance is on) and free pitches.
- **Persistence rebuilt for a backend:** saves are wrapped in an envelope
  `{schema, profile:{id,name,created}, savedAt, game}` with `FE.migrate` for
  schema bumps, `FE.storage` as the only localStorage toucher (swap for a
  remote driver), a client-minted profile UUID + display name, and gzipped
  portable save codes (`FEz1:`/`FE1:`, ~8x smaller) for device transfer.
  Reports are capped at 60 weeks so a long career can't bloat the save.

### Balance note

Starter stock is a one-off ~£150k lift: break-even moves from ~week 6 to weeks
3–5 and the year-1 cash floor rises £150–300k. Year-end net rose ~£50–90k
across brands. If the tension needs restoring later, the lever is
`FE.START_CASH` (see item 9 below — £750k was the recommended single change),
not removing the starter stock, which is doing the onboarding work.

---

Dan's playtest feedback, captured for the build pass.

## Status — implemented in the build pass of 2026-07-24

- **Item 1 (Clash-of-Clans art):** DONE (first pass). New `scene.js` renders an
  isometric canvas diorama — chunky procedural cars with volume, tier-scaled
  buildings with brand signage (portacabin flag / showroom glass), gravel vs
  tarmac, seasonal tint. Further polish (richer sprites, particles/juice,
  ambient props) still open.
- **Item 2 (hire from day 1):** DONE. Recruitment opens week 1 (6 names day 1,
  rest week 2). Week 1-2 thin-forecourt penalty softened so it isn't punishing.
- **Item 3 (traffic-light risk):** DONE. Green/amber/red chips on every lot,
  red split into high-risk/high-reward vs bad-car, tap-through drivers, filter.
- **Item 4 (visible sales execs):** DONE (first pass). Walking name-tagged exec
  figures + ambient customers on the site view. Deeper behaviour (standing at
  the car during a deal, morale in the step) still open.
- **Item 5 (phone-style email):** DONE. Mail-app inbox with avatars, unread
  dots, filter tabs, needs-action pills, reader header.
- **Item 6 (construction time):** DONE. Land expansion + franchise fit-out now
  build over weeks with office/map progress; orders gated until the corner's up.
- **Item 7 (skippable tutorial):** DONE. Spotlight coach marks over week 1,
  skippable + replayable from the menu.
- **Item 8 (six new candidates):** DONE. Dan, Danny, Karis, Clive, Vas, Tomi
  added with the drafted traits (complete / discounts / defuser / anchor /
  trader / magnet).
- **Item 9 (£1m capital):** unchanged for beta, per the review below.

Everything below is the original captured detail; treat "not implemented yet"
notes as superseded by the status list above.

---

## 1. Art overhaul — Clash of Clans style (Dan, beta day 1)

> "The graphics are very sub par to what I imagined. I was imagining Clash of
> Clans style, forget anything I've made before, don't let that influence you."

The current site view is a flat CSS grid with a perspective tilt — functional,
not delightful. Target: the chunky, saturated, hand-crafted isometric look of
CoC/Hay Day.

Direction for the rebuild:

- **True isometric scene**, canvas- or SVG-rendered, replacing the CSS slot
  grid. Depth-sorted iso tiles, buildings with volume (bevelled walls, warm
  roof highlights), tarmac/gravel texture tiles, kerb and road along the front.
- **Cars as proper iso sprites** — one sprite per body style (supermini,
  hatch, saloon, estate, SUV, coupe, MPV) recoloured per paint colour, with
  the cartoon proportions of the genre: fat wheels, big cabins, glossy
  two-tone shading.
- **Premises as characterful buildings**: leaning portacabin with a flag and
  a kettle steam puff; converted unit with roller doors; glass showroom that
  glows at dusk with cars visible inside.
- **Ambient life**: customers wandering the rows, browsing animations,
  bunting and A-boards flapping, pigeons, puddles on gravel in winter,
  seasonal tinting (grey January light vs bright March).
- **Juice**: coin-burst + register ding on every sale, SOLD sign slams down
  with a wobble, dust motes on ageing stock, confetti on record weeks,
  screen-shake on fines.
- Phasing suggestion: (1) iso ground + buildings + car sprites, (2) walking
  figures and ambient props, (3) particles/juice. Each phase shippable.

## 2. Hiring should open immediately (week 1)

> "I believe you should be able to hire immediately as the game feels dead
> after setting the forecourt up."

Spec had recruitment opening week 2 ("week 1 is deliberately painful and
teaches why you need people") — in practice it just feels dead. Change:

- **Recruitment opens day 1**, same 10-name roster.
- Keep some scarcity/texture: possibly only 4–6 names available on day 1,
  with the agency sending the rest through in week 2 — preserves a reason to
  come back to the books without the dead week.
- **Balance knock-on to re-check**: week 1 currently relies on scaffolded
  sales only. With staff selling in week 1 on top of the aunt's three
  contacts, week 1 may turn too generous — January's 0.52 demand does most of
  the containment, but re-run the hope-curve targets (week 1 net ≈ break-even,
  3.5–5 units) after the change. Salaries already run from hire date, so the
  soft-burn maths mostly holds.

## 3. Auction lots — traffic-light risk system

> "Auction cars should have a traffic light style system for risk, red for
> highest risk."

Replace/extend the current "Wide variance — inspect risk" text flag with a
colour-coded chip on every lot card:

- 🟢 **Green** — no visible risk factors: grade 4–5, fast colour, sensible
  age/mileage, full or part history.
- 🟠 **Amber** — one risk factor: grade 3, or a slow-ish colour (red/green),
  or mileage well over expected, or no history, or age 7+.
- 🔴 **Red** — two or more factors, or any of: grade 1–2, the graveyard
  colours (brown/yellow/gold), heavily over-mileage with no history.
- Scoring is from **visible** attributes only — the hidden rolls (true prep,
  latent faults, true days-to-sell) stay hidden, so the light is an honest
  summary of what a buyer could see in the lane, not a leak of the answer.
- **Red means "high risk", not "don't buy" (Dan, day 2).** Two flavours of
  red, and the chip's tap-through should say which:
  - *High risk, potentially high reward* — rough grade / big mileage on an
    otherwise desirable car, priced down because the room won't touch it.
    The gamble: prep and faults could eat you, or you clear double gross.
    Tap-through copy along the lines of "priced for the risk — the upside is
    real if the workshop is kind."
  - *High risk because it's simply a bad car* — graveyard colour, wrong spec,
    no story where it wins big. Tap-through: "cheap for a reason; the exit is
    trade, not retail."
  - Practically: show the risk driver(s) on the chip tap (grade, colour,
    mileage, history) so the player learns to tell a gamble from a grave.
- Sort/filter by light in the auction sheet.

## 4. Sales execs visible on the map

> "I want the little sales execs to be visible moving around the map."

- One walking figure per hired exec on the site view, distinct palette per
  person (and a name tag on tap), idling by the building, wandering the rows,
  pausing at bonnets.
- During the showroom block, the exec handling the current event stands next
  to the car in question with the customer figure — the pop-up points at a
  place on the map, not an abstraction.
- On courses/holiday = figure absent; morale readable at a glance (spring in
  the step vs trudging).
- Builds on the same sprite/animation layer as item 1 — do together.

## 5. Email tab should feel like a real phone mail client (Dan, day 2)

> "Need to sort the emails out so they look like reading an email on your phone."

Current inbox is a stack of generic cards. Rebuild as a proper mail app:

- **Inbox list**: avatar circle with sender initial (colour-coded per sender —
  execs get their palette from the map figures), sender name bold + week/time
  right-aligned, subject line, one-line greyed preview, blue unread dot,
  "needs action" pill on comebacks/requests. Grouped by day ("This week",
  "Earlier").
- **Full-screen reader** (slide-in, not a bottom sheet): mail-app header
  (From / Subject / week), body in a proper reading layout, action buttons
  pinned at the bottom like smart replies. Back arrow top-left.
- **Threading**: comeback follow-ups, warranty responses and quarter-end
  franchise mail thread under the original message rather than arriving as
  strangers.
- **Filter tabs** across the top: All · Needs action · Sold notes · Trade
  press. Unread badge per filter.
- Rich content where it earns it: the daily auction email embeds the 20-lot
  list (with the traffic lights from item 3); sold notes keep the exec's
  sign-off style.
- Swipe-to-archive; archive is where the 120-mail cap trims from.

## 6. Construction time on everything that's built (Dan, day 2)

> "Have a construction building time on anything that's built."

Currently the service department takes a week but land expansion is instant.
Change: **nothing appears by magic.** Every purchase that changes the site
gets a visible build:

| Build | Time (game weeks) | While building |
|---|---|---|
| Service department | 1 wk (as now) | capacity −20%, scaffolding on map |
| Land expansion +15 | 1 wk | diggers on the new ground, slots unusable |
| Land expansion +40 | 2 wks | same, longer |
| Smart repair / valeting (post-beta) | 1 wk / half-week | scaffold props |
| Franchise signing | 1 wk brand-corner install before first order lands |
| Premises upgrade (when added) | 2 wks, site partially disrupted |

- Map shows the build: scaffold sprite, crane, hi-vis figures (same sprite
  layer as items 1 and 4), progress bar over the plot, completion fanfare.
- Ties into the app-version real-time clock naturally (spec §15 gave build
  times in real hours: 24h / 12h / 6h).

## 7. Opening tutorial — skippable button walkthrough (Dan, day 2)

> "There should be an opening tutorial, that is skippable if needed, that
> walks them through all the buttons."

A guided first-contact layer on top of week 1, with **Skip tutorial**
available at every step:

- **Format**: spotlight coach marks — dim the screen, cut a hole around the
  control being introduced, one short line of copy, tap-to-advance. No walls
  of text; each step points at a real button at the moment it first matters.
- **Sequence** (rides the existing week-1 flow rather than a separate mode):
  1. HUD — the live cash number ("this is the only score that matters") and
     the star rating.
  2. Banner — the three-block week: Auction → Showroom → Office.
  3. Email tab + badge — the auction list lands here every week.
  4. Auction sheet — what a lot card shows; est. gross is *before* fees,
     prep and hold; (once built) the traffic light.
  5. Site view — tap a car for its stock card; reprice / move / trade out.
  6. First showroom pop-up — accept / counter / decline, the customer read.
  7. Prep bill moment — "this is why the auction number was optimistic."
  8. Office — close the week, read the report; days-in-stock under 45 is
     the health line.
  9. Week 2 — Staff tab, hiring and the agency fee (or day 1, once item 2
     moves hiring forward).
- **Skippable and re-summonable**: "Skip tutorial" on every mark; "Replay
  tutorial" in the ☰ menu. Store per-device done/skipped flag.
- Keep it to the buttons. The *economics* stay undiscovered — the spec's
  deliberate opacity (hidden brand traits, prep traps, colour maths) is the
  game; the tutorial only teaches the controls, never the strategy.
- The existing scaffolding (aunt's contacts, guaranteed first sale, trade
  buyer) already provides the win moments — the tutorial narrates around
  them, it doesn't add new help.

## 8. Six new names for the recruitment list (Dan, day 2)

> "Have the following names also on the recruitment list: Dan, Danny, Karis,
> Clive, Vas and Tomi."

Roster grows from 10 to 16 candidates. Placeholder characters drafted below —
**stats and one-liners are proposals for Dan to tweak** before they go in
(units/wk range, gross mult, F&I mult, complaint risk, all hidden until
observed, same as the original ten):

| Name | Shown reputation | Fee | Draft hidden character |
|---|---|---|---|
| **Dan** | "Knows everyone in Kent" | £4,800 | The complete package: 2.8–3.6 units, 1.18 gross, 1.25 F&I, 2% complaints. Priciest safe pair of hands on the list. |
| **Danny** | "Dan's cousin. Probably fine" | £700 | Looks like a budget Dan, isn't: 2.2–4.0 units but 0.78 gross — gives it away to close. The name is the trap. |
| **Karis** | "Service advisor gone to the dark side" | £2,200 | Aftersales DNA: 1.8–2.6 units, huge complaint-defusing effect (comebacks she handled cost half), 1.3 F&I. |
| **Clive** | "Semi-retired. Does Tuesdays properly" | £1,900 | Old-school: 1.6–2.0 units, 1.35 gross, 0.2 F&I, morale anchor — the team around him dips slower in bad months. |
| **Vas** | "Ran his own pitch until the divorce" | £2,600 | Trade brain: his sales find an extra 2% on PX margins and he spots blowout-risk lots (flags one red lot a week), 2.6–3.2 units. |
| **Tomi** | "TikTok famous, apparently" | £1,100 | Footfall magnet: +4% site enquiries while employed, 2.0–3.4 units, 0.85 gross, 8% complaint risk — brings the crowd and the drama. |

- Design intent: each new hire adds a *mechanic*, not just a stat line —
  Karis touches comebacks, Clive touches team morale, Vas touches the
  auction/PX layer, Tomi touches footfall. Keeps the bigger roster
  interesting rather than six more bars on the same sliders.
- Six more names also softens the sting of losing someone to poaching late
  in a career, and makes the day-1 hiring change (item 2) feel like a real
  labour market.

## 9. Starting capital — honest review of the £1,000,000 (Dan asked, day 2)

Verdict from full-year simulations: **£1m is right for the story, ~30% too
generous for the tension — but don't change it mid-beta.**

The numbers (52-week runs, sensible play, minimum cash ever touched):

| Route | Peak capital deployed | Lowest cash all year |
|---|---|---|
| Dacio / portacabin | ~£250k | **£746k** |
| Fjord / converted | ~£640k | £364k |
| BMV / converted | ~£680k | £331k |
| BMV / showroom | ~£800k | £249k |
| Dacio / showroom | ~£700k | £318k |

Meaning: on every sane route, £250k–£750k of the aunt's money never enters
play. Nobody gets within sight of the overdraft in year 1 unless they
over-commit to the franchise. The death spiral the spec wants reachable
(thin cash → can't restock → forecourt ages → stars fall) is currently
almost unreachable because the buffer absorbs a full year of mistakes.

Options considered:

- **Keep £1m** — it's the opening line of the game and a great round number.
  Cost: capital pressure only exists on BMV+franchise routes.
- **Cut to ~£600k** — makes BMV/showroom (£290k site + ~£400k stock)
  genuinely tight and franchise commitment scary. Cost: beginners on
  expensive routes could die in month 2, which is exactly the retention risk
  the hope curve exists to avoid.
- **£750k ("after probate and the taxman")** — narratively free, keeps Dacio
  and Fjord comfortable, puts real sweat into premium routes. The single
  number I'd pick if forced to pick one.

**Recommendation:** leave £1m alone for the beta — forgiveness is what you
want while colleagues learn the game. At the app build, keep the £1m *pitch*
and take the difference back in-fiction: probate fees, or a second-career
prestige reset that restarts you on £600k. If only one lever ever gets
pulled, make it £750k, not a deeper cut — the game's difficulty lives in the
P&L (January, floorplan, prep), not in the opening balance, and starving the
player of stock money just makes the forecourt emptier, not the decisions
harder.

---

*Beta shipped 2026-07-24. Items 1–4 logged day 1, items 5–9 day 2; to be
implemented as the post-beta pass unless Dan reprioritises. No gameplay or
visual changes have been made while the beta is under test.*
