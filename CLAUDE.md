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
  `tradevalue.html`, `step5.html`, `sq6b.html`, `sq7.html`, `ap1.html`,
  `ev-step4.html`, `EV.html`.

## Site structure: the funnels

The site is organised as multi-page funnels. Each funnel stores answers in
`sessionStorage` as the visitor advances, then submits everything in one go on
the final step.

| Pages | Funnel |
|---|---|
| `step1.html`–`step8.html` (+ `step1b`, `step4b/c/m`) | **"Find my BMW"** — 8-step new/used car matching brief. Entry: `start.html`. `step1b` is step 2; `step4b/c/m` are branch/redirect pages within the part-exchange flow. Shared behaviour (silent resume, progress bar, brief ticket) lives in `funnel-ui.js` + `funnel.css`. Submits on `step8.html` → `thankyou.html` / `wait.html`. |
| `sq1.html`–`sq7.html` (+ `sq6b`, `sq_done`) | **Service Qualifier** — qualifies service/service-plan leads. `sq6b` is a branch of step 6. Ends at `sq_done.html`. |
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
  `ev-step6.html`, `ap5.html`, `sq7.html`), `contact.js`, `tradevalue.html`,
  `index.html`, offer pages, `combined-form.html`, `rav-form.html`,
  `commission-disclosure.html`, `refer.html`, `thankyou.html`, `wait.html`,
  and more. Search for `formspree.io` before changing anything about the
  payload shape.

## Duplicated header/nav/footer — keep in sync manually

There is **no templating or includes**. The header, nav, and footer HTML is
copy-pasted into every page. Any change to navigation links, footer text, the
GA4 snippet, or shared meta tags must be applied to **every page** by hand —
grep for a distinctive string from the block you're changing and update all
matches. Expect small drift between pages; match the page you're editing.

## Staff-only pages — must stay noindex

- `Forecourt.html` — internal forecourt stock check tool (PIN-gated,
  Firebase-backed).
- `links.html` — Dan's internal links/dashboard page (includes the Formspree
  record-ID → PDF download widgets).

These must never be linked from public pages, must stay **out of
`sitemap.xml`**, and must carry
`<meta name="robots" content="noindex, nofollow">`. Do not remove that meta
tag, and do not add these pages to any nav.
