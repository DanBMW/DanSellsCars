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
  `style.css`, `funnel.css`, `funnel-ui.js`, `ev-funnel-ui.js`, `contact.js`,
  `disclaimer.js`, `scroll-hint.js`.
- **Firebase Realtime Database + Storage** (project `forecourt-1b6bc`,
  `europe-west1`) is the backend for the forms that persist data:
  `Forecourt.html`, `combined-form.html` / `combined-download.html`,
  `rav-form.html` / `rav-download.html`, `commission-disclosure.html` /
  `commission-download.html`, and the `forecourt-frenzy*.html` games. Rules
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
  `ev-step4.html`, `EV.html`.

## Site structure: the funnels

The site is organised as multi-page funnels. Each funnel stores answers in
`sessionStorage` as the visitor advances, then submits everything in one go on
the final step.

| Pages | Funnel |
|---|---|
| `step1.html`–`step8.html` (+ `step1b`, `step4b/c/m`) | **"Find my BMW"** — 8-step new/used car matching brief. Entry: `start.html`. `step1b` is step 2; `step4b/c/m` are branch/redirect pages within the part-exchange flow. Shared behaviour (silent resume, progress bar, brief ticket) lives in `funnel-ui.js` + `funnel.css`. Submits on `step8.html` → `thankyou.html` / `wait.html`. |
| `sq1.html`–`sq3.html` (+ `sq_done`) | **Service Qualifier ("Ramp Report")** — reg-first flow for customers whose car is in for service (entry: `service.html`). sq1 reg-plate input + DVLA lookup + market-scrape kick-off, sq2 vehicle reveal + openness, sq3 contact + locked-value teaser, submits on `sq3.html` → `sq_done.html` (booking-first, cal.eu links). Market prices are captured into Dan's Formspree email only — **never shown to the customer**. Funnel copy uses plain hyphens, no en/em dashes (Dan's rule). `sq4`–`sq7` and `sq6b` are retired redirect stubs → `sq1.html`. |
| `yourcar.html` | **Ramp Report personal share link** — Dan sends `yourcar.html?reg=AB12CDE&n=Kate` (built via the widget on `links.html`); the plate arrives pre-filled, the customer confirms car + mileage then taps **"I'm interested"** (screen 1) and books (cal.eu / WhatsApp). Personalised page: keep `noindex` and out of `sitemap.xml`. Both `sq1.html` and `yourcar.html` carry a tap-to-play voice note from Dan (`dan-service-intro.mp3`, GA event `dan_audio_play`). |
| `yourbrief.html` | **Optional deep-dive brief** — nudged from `yourcar.html` stage 2 and `sq_done.html` after the initial interest/booking stages. Single page, five skippable stages (direction, timing, payment + budget, PX intent, recap ticket + notes), reuses identity from `sessionStorage` (never re-asks for what Dan has), **one** Formspree submission on send. |

**Formspree is rationed** (submission volume costs money): `yourcar.html`
sends exactly one interest email per customer ("I'm interested" tap);
booking taps are GA `booking_tap` events only — cal.eu confirms real
bookings itself; `yourbrief.html` sends one email per completed brief.
One deliberate exception (Dan's request): the "skip the form" hatch on
`sq1.html` (WhatsApp/Email) fires one skip-signal email per session with
the typed reg, so Dan knows a prospect chose the direct route. Don't add
other per-step or per-tap Formspree calls to these flows.
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
  `ev-step6.html`, `ap5.html`, `sq3.html`), `yourcar.html` interest pings,
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
  `ap` (Appraisal, 1–5). Redirect pages fire nothing.
- `<funnel>_complete` — confirmation page view (`thankyou`/`wait`,
  `ev-thankyou`, `sq_done`, `ap6`), deduped per session.
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
- `links.html` — Dan's internal links/dashboard page (includes the Formspree
  record-ID → PDF download widgets).
- **The games are internal-only, never customer-facing** (Dan's ruling):
  `forecourt-frenzy.html`, `forecourt-frenzy-classic.html`,
  `world-cup-tracker-live-leaderboard.html`, `sweepstake-2026.html`.

These must never be linked from public pages, must stay **out of
`sitemap.xml`**, and must carry
`<meta name="robots" content="noindex, nofollow">`. Do not remove that meta
tag, and do not add these pages to any nav.

Also retired: `ev.html` is a redirect stub to `EV.html` (the live EV landing
page) kept only so old lowercase links still work — don't resurrect it.
