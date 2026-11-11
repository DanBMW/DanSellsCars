# BMW 1 Series (F70) configurator, dan-sells

Static HTML/CSS/JS, no build step. Open `index.html` through any static server.

* `data.js`: every price, colour, wheel, trim, package, option and accessory. Edit prices here only.
* `app.js`: steps, rules (variant availability, packages lock their contents, exclusive groups, auto added dependencies), pricing, share link, summary.
* `car.js`: stylised SVG car and interior, tinted by the chosen paint, wheels and trim. No BMW imagery.
* `tests/run.js`: headless Chrome checks and screenshots (`node tests/run.js http://127.0.0.1:8765/`).

Nothing is sent anywhere: the share link carries the build in its query string; "Send to Dan" opens WhatsApp or email on the visitor's device.

## Data not confirmed on BMW UK (flagged `unverified` in data.js, shown as TBC)

* Brooklyn Grey: price not captured, £650 assumed.
* M135 xDrive: prices for 976 and 1085 wheels not captured, M Sport prices assumed (£540, £1,075).
* Upholstery: Veganza perforated £730 captured for Black on 120 Sport only; same assumed for Mocha, Coral Red, Oyster and for M lines. Econeer Bicolour Blue price not captured (£0 assumed).
* Interior trim: 'Illuminated' Aluminium Graphite price not captured (£0 assumed).
* Package contents (Technology, Technology Plus, M Sport Pro Pack M135, M Dynamic) were not itemised; lists are indicative.
* Rules assumed: contrast roof not combinable with panoramic sunroof; Parking Assistant Professional needs a Technology pack; front sport seats standard on M Sport, M Sport Pro and M135; M Dynamic Pack fits 1085 wheels with sport tyres.
* Combined mpg for 123 xDrive and 120 M Sport Pro not captured (shown as TBC).
* Monthly figure: hidden (Dan's choice, 11 Nov 2026, `financeExample.show: false`). If ever switched on it is an illustrative calculation, not a lender quote.
