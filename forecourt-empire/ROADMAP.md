# Forecourt Empire — beta feedback log & roadmap

Dan's playtest feedback, captured for the next build pass. **None of this is
implemented yet** — the live beta is unchanged while testing continues.

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
  A red car can still be the smart buy at the right money — that's the game.
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

---

*Beta shipped 2026-07-24. Feedback items above logged same day; to be
implemented as the post-beta art & feel pass unless Dan reprioritises.*
