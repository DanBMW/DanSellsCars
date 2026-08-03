# Forecourt Empire — beta feedback log & roadmap

## Status — Juice pass (2026-07-25e)

The last unbuilt phase of the original art brief (item 1, phase 3). New
`juice.js`: one self-contained module, no assets.

- **Sound is synthesised with WebAudio** — a till chime on a sale, coin blips,
  a descending thunk when a prep bill lands, a buzz on a fine, a four-note
  fanfare on a record week. Nothing to download. Audio only starts after the
  first tap (browsers block it before that) and mutes from the desk menu.
- **Particles** draw to one full-screen canvas that ignores pointer events:
  spinning coins on a sale, confetti on a record week, floating +/- money
  numbers that rise off the cash figure.
- **Screen shake** when a fine lands.
- The loop stops itself the moment nothing is alive, so an idle game costs
  nothing.

Hooked into: interactive sales, the silent auto-sales, prep bills, the
late-night deal, mini-game wins, and week close (record / fine / profit).

---

## Status — Beta V2 (2026-07-25d): HUD, navigation and presentation

A pass over the shell rather than the systems, after a review of the live build.
The HUD and banner were eating roughly 40% of the screen before you saw the
forecourt, and the week gave you no sense of where you were in it.

**HUD** — rebuilt to two tight rows carrying more, not less:
`Wk 18 · MAY · Y1` with the month as a chip (gold on a plate-change month),
stars, and a live stock read (`24 in stock · 10 aged`) on the left; cash plus
net worth on the right. Cash turns red and the label reads "Overdrawn" below
zero — the old build showed a £600k overdraft in the same gold as a healthy
balance. The cash counter also settles quickly now instead of crawling and
sitting in its flash colour for seconds after a batch buy.

**Navigation** — the phase banner is now a three-step stepper (Auction →
Showroom → Office) with ticks behind you and the current block lit, one
dominant primary action, and secondary buttons demoted to a side stack. About
40% shorter than the block it replaced, and the week finally reads as a
sequence. Tab icons are stroked SVG rather than emoji, so they render
identically everywhere and carry the active-tab glow.

**Scene** — a proper light direction: warm key from the upper left, cool fill
from the opposite corner, a gentle overlay bloom and a deeper vignette, so the
diorama has form instead of sitting flat. Discount markers were starbursts that
turned a forecourt of aged stock into a firework display; they are now small
flat price tags that read as labels.

---

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

The forecourt keeps trading while the tab is shut: **12 real hours = one game
week** — about two ticks a day (`FE.REALTIME.msPerWeek`). On resume, `FE.offlineProgress()` runs the
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
- **New mini-game:** *Hit the Gross* (stop the needle in the green, three deals,
  window tightening). A *Walk-Around* fault-spotting game shipped alongside it
  but was cut on 25 Jul — it didn't play well enough to keep.
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

---

## Cloud saves — shipped 2026-07-27

`cloud.js` mirrors the save envelope into Firebase (project `forecourt-1b6bc`,
RTDB `empire/saves/$uid`). Design rules it is built on, and which any future
change must keep:

1. **localStorage stays the source of truth.** `FE.save()` still writes
   locally and synchronously; `FE.afterSave` is the only hook the cloud gets,
   it fires *after* the local write, and it is wrapped in a try. A broken
   mirror can never cost a week.
2. **Anonymous by default.** No login wall. A UID exists from first run and
   the backup starts immediately. Linking Google (Settings → Account) keeps
   the same UID and makes the career reachable from another device.
3. **A remote save never silently replaces a local one.** `FEcloud.decide()`
   is pure and unit-tested; anything other than "this device is level or
   ahead" puts the choice in front of the player.
4. **An unanswered conflict freezes uploads** (`FEcloud.held()`). Without
   this, closing the dialog and playing on would let the next autosave
   overwrite the very career the player was asked about.

### Console setup this depends on

Deployed code is inert until these are done in the Firebase console, and
fails silently (Settings → Account reads "Local only") until they are:

1. Authentication → Sign-in method → enable **Anonymous**
2. Authentication → Sign-in method → enable **Google**
3. Authentication → Settings → Authorized domains → add **dan-sells.co.uk**
4. Deploy `database.rules.json` (the new `empire` block)

**Status probed 2026-07-30** against the live project: step 1 is **done**
(anonymous sign-up returns a valid token). Step 4 is **not** — a read of
`empire/saves/<own uid>` with a valid anonymous token returns
`Permission denied`, meaning the live rules still lack the `empire` block.
Steps 2 and 3 only matter for Google linking, not for backup.

Settings → Account → **Check the connection** (`FEcloud.diagnose`) walks these
in order and names the failing one. It tests the rules with a *read* of the
player's own save path — the exact permission a real sync needs, and one that
cannot damage anything.

### Not done

- **Leaderboard.** Deliberately deferred. The week clock is anchored on a
  client timestamp and the save is editable in devtools, so any table would
  be honour-system. Making it real means running the economy server-side.
- **`forecourt` RTDB path is still `".read": true, ".write": true`** — world
  readable and writable, and it backs `Forecourt.html`, whose PIN is
  client-side only. Unrelated to the game, but it should be locked down.

---

## Overhaul pass — 2026-07-27

### The borrowing question, and why it was answered with a mortgage

Measured first. A conservative player (£60k reserve, sane stock target) is
never once blocked by cash across 104 weeks. An aggressive one — filling
every pitch, which is the natural instinct — sits on £50-110k against a
£1.2M business and **cannot build the £180k service department for 99
weeks**. That is the trap: profitable, asset-rich, and locked out of the one
investment that would fix it.

Rejected: an **unsecured loan**. It would rescue a player who owns nothing,
which is precisely the player who should be allowed to fail, and it removes
the tension rather than resolving it.

Built: a **commercial mortgage** secured on `FE.propertyValue()` (site +
departments + land). It only helps someone who has already sunk cash into
bricks, which is exactly the trapped player, and it scales with what they
built. Measured effect, aggressive policy over 104 weeks:

| | no mortgage | mortgage |
|---|---|---|
| service dept built | wk 63 | wk 8 |
| weeks blocked | 57 | 2 |
| net worth at wk 104 | £1.49M | £1.83M |

The conservative player never touches it (£2.14M either way), so it is not a
free win — it is a way out of one specific hole. Over-trading is still
punished, just no longer unrecoverably.

Rules it must keep:
- **Borrowing never increases net worth.** Cash in, debt on, they cancel.
- **The weekly payment comes out regardless of trading** — that is what makes
  it a commitment rather than a cash button.
- 60% LTV, so the facility grows only as the player genuinely invests.

### Two accounting bugs found on the way

- **Land expansion destroyed net worth.** £95k of land cost £95k of cash and
  was never booked as an asset — so expanding actively pushed Site 2 (gated
  on net worth) *further away*. Land is now capital. Migration credits it
  back to existing saves.
- Departments were already correct (asset swap, no net change).

### Tutorial

Was a furniture tour: nine steps naming the five tabs, ending on "keep days
in stock under 45" without ever saying what days in stock is. Rewritten to
lead with the job — *buy for less than you can sell it for, and sell it
before it eats the difference* — and to teach days-in-stock where it lives,
on the Stock tab.

### Contextual coaching (`FE.COACH`)

The tour cannot carry everything without becoming a manual. Seven one-off
tips now fire at the moment the thing they explain happens: first car bought,
first prep bill, a car at 60 and at 90 days, cash under three weeks of float,
first losing week, mortgage becoming available while cash is tight. Rendered
as a dismissible strip under the banner — never a modal, because these fire
mid-flow. Remembered in the save.

### Reports screen

Opened on a share button with the P&L buried under the reviews. Now leads
with a net-P&L sparkline, four KPI tiles (net, units vs 4-week average, gross
per unit, average days in stock) and one line of plain English naming the
biggest line against you that week — or, if nothing sold, saying so instead
of blaming the largest cost.

### Auction screen — 2026-07-27

The screen you spend most of your buying time on was a wall: 50 lots, no
sort, **15 screens of scrolling**, and no way to tell a good buy from a bad
one without doing arithmetic in your head.

- **Sorted, best first.** Best margin (default) / Cheapest / Quickest /
  Newest. This is the actual fix for the scrolling — the lots worth buying
  are now at the top, so the other 45 do not need reading.
- **Honest margin.** `estGross` in the engine is `retail − hammer`, which
  ignores the 5.5% premium and £180 transport and so flatters every lot. The
  screen now shows margin against the **all-in** price. Left the engine value
  alone — the AFK buyer policy keys off it.
- **Compact rows** — risk light and spec share a line, four figures in a
  strip, smaller buy button.
- **Shortlist** — star a lot and it floats to the top whatever the sort,
  which is what you need when comparing across fifty.
- **Affordability** — lots beyond your spend power are dimmed with the buy
  button disabled, and the header counts how many you can actually buy.
- Warns when every pitch is full, since anything bought then has nowhere to
  go.

Buying stays one tap, deliberately: an auction runs at pace and a confirm on
every lot would wreck the rhythm. The all-in price is on the button instead.

**Profit in pounds.** A percentage is the right comparator but the wrong thing
to lead with, so every lot now shows **Est profit in money**, with the % as a
sub-line. Making that figure honest needed `FE.expectedPrep()` — the same
model as `truePrepFor` with the randomness removed and the blowout risk priced
in at expected value — because prep is the single biggest thing between the
hammer price and the money. Each lot shows All-in / Est retail / Est prep /
Est profit, the buy button reads "Buy £14,185 — to make about £1,818", and the
header carries the best lot on the list plus the combined profit of the best
lots you can both afford and find a pitch for. Default sort is Most profit;
Best margin % is still there for return on capital.

---

## Save-loss investigation — 2026-07-30

Dan reported a lost career and asked whether a code change caused it.

### What was ruled out, by test not by argument

- **Schema migration.** Saves built by every recent build (`90960a9`,
  `e052aef`, `e219b73`, `e38a4bb` — schemas 4 and 5) were loaded with the
  current build. All four survived intact and played on. Not the cause.
- **Save size.** ~148KB at week 79, growing ~42KB per game year against a
  ~5MB localStorage quota. Reports capped at 60, emails at 120. Not the
  cause. (`G.reviews` is uncapped but contributed 0KB in testing — worth
  watching, not urgent.)
- **Cache / service-worker changes.** Deleted *every* cache and unregistered
  *every* worker, then reloaded: the career resumed untouched. localStorage
  is keyed by origin, not by cache. A site deploy cannot lose a save. There is
  also no root-scope service worker and no `localStorage.clear()` anywhere in
  the repo outside the game's own tests.
- **Domain.** `CNAME` unchanged, so the origin — and therefore the storage
  bucket — is stable.

### The real defect found

`localStorage.setItem` throws when the browser refuses a write (quota, iOS
private mode, storage pressure). `FE.storage.set` swallows it and returns
false, and **nothing looked at the return value.** Measured: the game played
on for six further weeks with nothing persisted and no indication whatsoever,
then lost all six on reload.

Fixed three ways:
1. `FE.saveHealth()` records every failed write, with a reason distinguishing
   "storage refuses everything" from "this career is too big".
2. Every 20th save reads itself back and compares length — catching the worse
   case where a write appears to succeed but nothing lands.
3. A **persistent** alert bar (not a toast, which slides away unseen) naming
   the week from which nothing has been saved, with a one-tap save-code
   export so the career can be rescued before the tab closes.

### And a boot diagnostic

A profile with no career behind it means the player has been here before and
the save is not where it should be. Rather than a bare New career button —
which reads as "the game ate it" — the boot screen now names the likely
causes: different browser (installed app and Safari tab have separate storage
on iPhone), cleared data, Safari's 7-day eviction, private window. It states
explicitly that site updates and cache changes do not touch saves.

---

## Games pass — 2026-07-30

**Broken star glyph.** The half star was `U+2BE8` LEFT HALF BLACK STAR, which
almost no font ships — iOS drew a tofu box (`★★★⯨☆` rendered as `★★★□☆`).
Rebuilt from `★` and `☆`, which are universal, with the half made by clipping
a filled star over an empty one in CSS.

**Games made obvious.** Hit the Gross moved to the top of the list. The Games
app on the desktop now carries a badge counting what is actually winnable this
week — the coin run and the late-night prospect — and reads "2 rewards
waiting" instead of "a play while they prospect". The Computer tab badge
counted unread email only, so a waiting reward was invisible from the main
screen; it now counts both.

**Double or Drop.** Stake up to £1,000, call heads or tails, let it ride up to
ten flips, pot doubles on every win. Digital coin with a 3D flip, a rising
tumble sound and a metallic landing, and the face it lands on is unmissable.

The coin is a genuinely fair 50/50 — a rigged coin dressed up as a fair one is
a worse thing to put in a game than an honest gamble. That does mean ten
straight calls turns £1,000 into **£1,024,000**, which would trivialise a
career, so it is limited to **one run per game week** — the same rhythm as the
late-night prospect. Bounded rolls, design intact.

Both legs go through the books under `misc` (`FE.coinStake` / `FE.coinPayout`)
so a big win shows up in the week's feed rather than appearing from nowhere,
and walking away mid-run banks the pot rather than losing it.

### Buying, and the Computer button — 2026-07-31

**The Computer button now opens the computer.** `UI.computerTap` diverted
straight to the inbox whenever there was unread post, which meant that with
post waiting there was *no way to reach the desktop from that button at all*
— tap Computer, get email; tap it again, get email. The unread count is
already a badge on the Email app, so going where the button says costs
nothing.

**Ordering new cars was invisible.** It lived only behind an app icon on the
computer, so a player who had signed a franchise could easily never find it.
The auction-phase banner button is now **🛒 Buy stock**, opening a chooser
that names both routes side by side:

- **The auction — used cars.** Lot count, and why you would.
- **The factory — brand new cars.** What it costs and how long it takes —
  or, when it is shut, exactly why and when it opens (franchise not unlocked
  yet / not signed / brand corner still being fitted).

Reachable from the banner, and from the Stock tab when the pitch is empty —
which used to say "the auction email is waiting" and now offers the button.
The chooser also notes that private sellers and part-exchanges come to you,
since neither is a place you can go.

### Land, staff and demand — 2026-07-31

Land bought pitches and nothing else. Measured over 104 weeks: demand was the
binding constraint in **97 of them**, not capacity — so the extra cars just
stood there paying floorplan, and expansion could never pay for itself.

Two changes, both needed:

1. **Land raises the staff ceiling.** `FE.maxStaff()` = site + finished
   expansions (`land15` +1, `land40` +3). Pending groundworks do not count.
   A showroom with both goes 5 → 9 execs. Staff drives demand *and* capacity,
   so this is what turns pitches into sales.
2. **A bigger forecourt draws more trade** — `FE.LAND_DRAW`, up to +27.5% on
   a showroom with both parcels, scaled by how full the ground actually is.

The second was nearly a mistake worth recording. The first attempt keyed the
uplift to stock levels alone, which handed *every* player a 30% demand rise
whether they had expanded or not and inflated Fjord's year from £141k to
£231k. It is now keyed to ground you have bought: a player who never expands
takes the `extraSlots > 0` guard and gets the original numbers exactly, and
the gain is earned twice — buy the ground, then fill it. Empty land still
draws nothing.

### Factory order window — 2026-07-31

Rebuilt. It was four bare `<select>`s rebuilt from defaults on every render,
so placing an order threw you back to the first model in white and you
re-picked the whole spec to order a second batch.

Now: chips for model, trim and quantity, real colour swatches with the
slow-selling ones flagged, and the spec **sticky for the session** — order
five black Fokus Estates and it still says five black Fokus Estates
afterwards. It also prices itself before you commit: list, your cost at 92%,
PDI, margin at list, and the total, with the buttons disabled when the total
is beyond your spending power.

### Footfall, made visible — 2026-07-31

Dan asked for land, staff and marketing to increase footfall. Two of the three
already did — advertising (`adFactor`) and the team's prospecting
(`STAFF_DEMAND × crowdEff`) were both in the demand line already. They were
just scattered through one long expression and **invisible**, so a player
could hire the floor and turn the marketing up without ever seeing that any of
it worked.

`FE.footfall()` now gathers every term that brings people onto the forecourt —
brand pull, advertising, staff prospecting, forecourt size, the magnet trait,
and seasonal shocks — and returns them named, with the multiplier each
contributes. The Site tab carries a card showing the total and the breakdown;
tapping it explains the three levers the player actually controls.

**Regrouped, not rebalanced**, and proven so: `neutral-test.js` rebuilds the
old expression from its parts across 40 states and compares — 0.000000%
difference. (It flagged a 4% gap on the first run, which turned out to be the
reference implementation forgetting the magnet trait, not the code.)

One thing left deliberately alone: an exec away on a training course still
counts toward footfall. Arguably they should not — they are not on the floor
prospecting — but that is a balance decision rather than part of a refactor,
so it stays as it was.

---

## Graphics, pass 1 — art direction (2026-08-03)

Dan picked art direction first, then normal-mapped lighting. This is the
first half.

The scene was competent and flat: cars floated with no contact shadow, the
light was a single warm blob, the palette had no point of view, and the whole
diorama sat in the app's dark background with no sky — so it read as a UI
widget rather than a place.

**`MOOD`, one palette per month.** Sky (two stops), sun colour and strength,
ambient fill, grass, haze and a wet-weather probability. Everything downstream
reads from it, so January is grey, low-sun and slick; July is bleached and
hazy; September is golden. The game's whole rhythm is seasonal and the scene
never showed it.

**Contact shadows.** The single biggest missing thing. Every car now has a
soft ellipse offset away from the key light. It is what makes them sit on the
tarmac rather than hover above it.

**Weather**, rolled from the week number so it is stable within a week and a
wet week stays wet. Rain is drawn as seeded streaks — no particle state, no
allocation — and the tarmac darkens under it.

**Sky and depth haze.** A gradient backdrop with soft cloud banding, a low sun
disc on clear days, and a haze that washes the far rows toward the sky colour.

**Rim light** on the sun-facing side of each car, above a light threshold.

Two things worth recording:

- The rim light started as one wide band at 42% alpha, which blew the paint
  out in high summer and left a visible seam down the middle of every car.
  It is now three narrowing bands at a sixth of that, which fakes a falloff.
- The sky is **cached** and re-baked only when the month, the weather or the
  canvas size changes. Five radial gradients per frame measured fine at 60fps
  on a laptop and would not have been fine on a mid-range phone.

Still to come (pass 2): normal-mapped per-pixel lighting.
