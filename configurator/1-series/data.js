/*
 * BMW 1 Series (F70) configurator data: dan-sells.co.uk
 * ------------------------------------------------------------------
 * EVERY price lives in this one file. Edit a number here and the whole
 * configurator (cards, totals, summary, share links) updates.
 *
 * Source: read-only walkthrough of BMW UK's public configurator,
 * 11 November 2026. Prices are OTR, including VAT, in GBP.
 *
 * Fields:
 *   lines        which trim lines can pick the item (sport, msport, mspro, m135)
 *   standardOn   lines where the item comes as standard (no charge, locked on)
 *   price        GBP incl. VAT. Per-line prices use priceBy: { line: price }
 *   unverified   true = the price or rule was NOT captured on BMW UK and is an
 *                assumption. Shown in the UI as "to be confirmed" and listed in
 *                README.md. Confirm with BMW before relying on it.
 *   group        items sharing a group are mutually exclusive (pick one)
 *   requires     ids that must also be present (auto added, with a notice)
 *   packOnly     cannot be bought alone, only via a package
 */
window.CONFIG_DATA = {
  meta: {
    model: "BMW 1 Series",
    chassis: "F70",
    pricesAsOf: "November 2026",
    source: "BMW UK online configurator",
    onRoadFee: 1450,          // on the road costs included in every OTR price
    vatRate: 0.20,
    contact: {
      name: "Dan Cane",
      role: "BMW Sales Executive, Hedin Ruxley BMW, Sidcup",
      whatsapp: "447827138197",
      email: "daniel.cane@hedinautomotive.co.uk",
      booking: "https://cal.com/danbmwruxley/bmw-ruxley-appointment-with-dan-in-sales",
      instagram: "https://instagram.com/dan_sells_bmw",
      site: "https://dan-sells.co.uk/"
    },
    // Illustrative monthly example ONLY. Not a quote, not an offer, not a
    // representative example from a lender. Set show:false to hide it.
    financeExample: {
      show: false,
      depositPct: 0.10,
      termMonths: 48,
      aprPct: 7.9,
      finalPaymentPct: 0.45   // assumed optional final payment, % of OTR
    }
  },

  lines: {
    sport:  { name: "Sport" },
    msport: { name: "M Sport" },
    mspro:  { name: "M Sport Pro" },
    m135:   { name: "M135 xDrive" }
  },

  variants: [
    { id: "120s",   name: "BMW 120 Sport",                line: "sport",  engine: "120", price: 32640,
      hp: 170, kw: 125, accel: 7.8, drive: "Front-wheel drive", fuel: "Petrol, 48V mild hybrid", gearbox: "Automatic",
      mpg: "53.3", co2: "121 to 124" },
    { id: "120m",   name: "BMW 120 M Sport",              line: "msport", engine: "120", price: 34640,
      hp: 170, kw: 125, accel: 7.8, drive: "Front-wheel drive", fuel: "Petrol, 48V mild hybrid", gearbox: "Automatic",
      mpg: "52.3", co2: "121 to 127" },
    { id: "123m",   name: "BMW 123 xDrive M Sport",       line: "msport", engine: "123", price: 37840,
      hp: 218, kw: 160, accel: 6.3, drive: "xDrive all-wheel drive", fuel: "Petrol, 48V mild hybrid", gearbox: "Automatic",
      mpg: null /* not captured */, co2: "135 to 140" },
    { id: "120mp",  name: "BMW 120 M Sport Pro",          line: "mspro",  engine: "120", price: 37540,
      hp: 170, kw: 125, accel: 7.8, drive: "Front-wheel drive", fuel: "Petrol, 48V mild hybrid", gearbox: "Automatic",
      mpg: null, co2: "127 to 130" },
    { id: "123mp",  name: "BMW 123 xDrive M Sport Pro",   line: "mspro",  engine: "123", price: 40740,
      hp: 218, kw: 160, accel: 6.3, drive: "xDrive all-wheel drive", fuel: "Petrol, 48V mild hybrid", gearbox: "Automatic",
      mpg: null, co2: "140 to 143" },
    { id: "m135",   name: "BMW M135 xDrive",              line: "m135",   engine: "m135", price: 45630,
      hp: 300, kw: 221, accel: 4.9, drive: "xDrive all-wheel drive", fuel: "Petrol", gearbox: "Automatic",
      mpg: "36.7", co2: "173 to 185" }
  ],

  // hex/finish drive the SVG car only. Not BMW artwork.
  paints: [
    { id: "alpine",   name: "Alpine White",     type: "Solid",    price: 0,    hex: "#eceeef", lines: ["sport","msport","mspro","m135"] },
    { id: "jet",      name: "Jet Black",        type: "Solid",    price: 0,    hex: "#0c0d0f", lines: ["sport"] },
    { id: "sapphire", name: "Black Sapphire",   type: "Metallic", price: 650,  hex: "#16181d", lines: ["sport","msport","mspro","m135"] },
    { id: "skyscr",   name: "Skyscraper Grey",  type: "Metallic", price: 650,  hex: "#868c93", lines: ["sport","msport","mspro","m135"] },
    { id: "thunder",  name: "Thundernight",     type: "Metallic", price: 650,  hex: "#4b2d55", lines: ["sport","msport","mspro","m135"] },
    { id: "capeyork", name: "Cape York Green",  type: "Metallic", price: 650,  hex: "#2d4639", lines: ["sport","msport","mspro","m135"] },
    { id: "firered",  name: "Fire Red",         type: "Metallic", price: 650,  hex: "#8d1a1f", lines: ["sport","msport","mspro","m135"] },
    { id: "portimao", name: "Portimao Blue",    type: "Metallic", price: 650,  hex: "#1f4ea1", lines: ["msport","mspro","m135"] },
    // UNVERIFIED: Brooklyn Grey price was not captured on BMW UK; £650 assumed (same as other metallics).
    { id: "brooklyn", name: "Brooklyn Grey",    type: "Metallic", price: 650,  hex: "#9b9e9f", lines: ["msport","mspro","m135"], unverified: true },
    { id: "stormbay", name: "Storm Bay",        type: "Metallic", price: 1350, hex: "#56606b", lines: ["sport","msport","mspro","m135"] },
    { id: "tanzan",   name: "BMW Individual Tanzanite Blue",       type: "BMW Individual", price: 1350, hex: "#1c2240", lines: ["sport","msport","mspro","m135"] },
    { id: "frozgrey", name: "BMW Individual Frozen Pure Grey",     type: "BMW Individual", price: 2100, hex: "#a7a9a6", matte: true, lines: ["sport","msport","mspro","m135"] },
    { id: "frozblue", name: "BMW Individual Frozen Portimao Blue", type: "BMW Individual", price: 2100, hex: "#2b4a8c", matte: true, lines: ["sport","msport","mspro","m135"] }
  ],

  // style: drawing hint for the SVG (y = Y-spoke, multi = multi-spoke, double = double-spoke)
  wheels: [
    { id: "971",  name: "17\" Alloy Aerodynamic 971, Lightning Grey",  size: 17, style: "aero",  rim: "#5d6168", face: null,
      lines: ["sport"], priceBy: { sport: 0 } },
    { id: "972",  name: "17\" Alloy 972, Refined Silver",              size: 17, style: "double", rim: "#b9bdc2", face: null,
      lines: ["sport"], priceBy: { sport: 215 } },
    { id: "974",  name: "18\" Alloy 974, Gunmetal Grey Burnished",     size: 18, style: "multi", rim: "#3c3f44", face: "#9a9da1",
      lines: ["sport"], priceBy: { sport: 730 } },
    { id: "975",  name: "18\" M light alloy Y-spoke 975, M Bicolour",  size: 18, style: "y", rim: "#23262b", face: "#c9ccd0",
      lines: ["msport","mspro","m135"], priceBy: { msport: 0, mspro: 0, m135: 0 } },
    // UNVERIFIED for M135 only: 976 and 1085 prices on M135 not captured; M Sport prices assumed.
    { id: "976",  name: "19\" M light alloy Y-spoke 976, M Bicolour",  size: 19, style: "y", rim: "#23262b", face: "#c9ccd0",
      lines: ["msport","mspro","m135"], priceBy: { msport: 540, mspro: 540, m135: 540 }, unverifiedOn: ["m135"] },
    { id: "977",  name: "19\" M light alloy multi-spoke 977, M Bicolour", size: 19, style: "multi", rim: "#23262b", face: "#c9ccd0",
      lines: ["m135"], priceBy: { m135: 600 } },
    { id: "1085", name: "19\" M forged Y-spoke 1085 M",                size: 19, style: "y", rim: "#2a2c30", face: null,
      lines: ["msport","mspro","m135"], priceBy: { msport: 1075, mspro: 1075, m135: 1075 }, unverifiedOn: ["m135"] },
    { id: "1085s", name: "19\" M forged Y-spoke 1085 M with sport tyres", size: 19, style: "y", rim: "#2a2c30", face: null,
      lines: ["m135"], priceBy: { m135: 1290 } }
  ],
  defaultWheel: { sport: "971", msport: "975", mspro: "975", m135: "977" },

  upholstery: [
    { id: "cloth",  name: "Cloth Anthracite",            type: "Cloth",       price: 0,   hex: "#3a3b3e", accent: "#2a2b2e", lines: ["sport"] },
    // UNVERIFIED: Econeer Bicolour Blue price not captured.
    { id: "econeer", name: "Econeer Bicolour Blue",      type: "Cloth",       price: 0,   hex: "#2c3a55", accent: "#1d1f24", lines: ["sport"], unverified: true },
    { id: "malc",   name: "M Alcantara/Veganza combination, Black with Blue contrast stitching", type: "Alcantara/Veganza", price: 0, hex: "#1d1e21", accent: "#2756a8", lines: ["msport","mspro","m135"] },
    // £730 captured for Veganza perforated Black on 120 Sport. Same price ASSUMED for the
    // other Veganza colours and for M Sport / M Sport Pro / M135 (not captured).
    { id: "vblack", name: "Veganza perforated Black",          type: "Leatherette", price: 730, hex: "#151618", accent: "#2b2c30", lines: ["sport","msport","mspro","m135"], unverifiedOn: ["msport","mspro","m135"] },
    { id: "vmocha", name: "Veganza perforated Mocha",          type: "Leatherette", price: 730, hex: "#5a3a2a", accent: "#2b2c30", lines: ["sport","msport","mspro","m135"], unverified: true },
    { id: "vcoral", name: "Veganza perforated Coral Red/Black", type: "Leatherette", price: 730, hex: "#a8402f", accent: "#151618", lines: ["sport","msport","mspro","m135"], unverified: true },
    { id: "voyster",name: "Veganza perforated Oyster",         type: "Leatherette", price: 730, hex: "#cbbfa8", accent: "#3a3b3e", lines: ["sport","msport","mspro","m135"], unverified: true }
  ],
  defaultUpholstery: { sport: "cloth", msport: "malc", mspro: "malc", m135: "malc" },

  trims: [
    { id: "dsilver", name: "Dark Silver interior décor",                    price: 0, hex: "#6f7277", lines: ["sport"] },
    { id: "hexa",    name: "M Illuminated Aluminium Hexacube trim, Matt",  price: 0, hex: "#9da2a8", lines: ["msport","mspro","m135"] },
    // UNVERIFIED: price of the 'Illuminated' Aluminium Graphite trim was not captured; £0 assumed.
    { id: "graph",   name: "'Illuminated' Aluminium Graphite interior trim", price: 0, hex: "#4a4d52", lines: ["sport","msport","mspro","m135"], unverified: true }
  ],
  defaultTrim: { sport: "dsilver", msport: "hexa", mspro: "hexa", m135: "hexa" },

  // Pack CONTENTS were not itemised in the walkthrough (only the count of
  // included options). The lists below are a best reading of BMW UK's option
  // list ("available in package" items) and are UNVERIFIED. Confirm before quoting.
  packs: [
    { id: "service", name: "BMW UK Service Inclusive", price: 1000, lines: ["sport","msport","mspro","m135"],
      desc: "Scheduled servicing covered for a fixed period and mileage.",
      includes: [], extras: ["Scheduled servicing (terms from BMW UK)"] },
    { id: "tech", name: "Technology Pack", price: 1550, lines: ["sport","msport","mspro","m135"], group: "techpack", unverifiedContents: true,
      desc: "Supports relaxed driving with smarter controls, visibility and parking.",
      includes: ["hud","pap","comfort","aled","wcharge","mirrors"], extras: [] },
    { id: "techplus", name: "Technology Plus Pack", price: 2750, lines: ["sport","msport","mspro","m135"], group: "techpack", unverifiedContents: true,
      desc: "Everything in the Technology Pack, plus advanced driving and parking assistance and Harman/Kardon sound.",
      includes: ["hud","pap","comfort","aled","wcharge","mirrors","dapro","papro","hk"], extras: [] },
    { id: "msppm135", name: "M Sport Pro Pack M135", price: 2075, lines: ["m135"], unverifiedContents: true,
      desc: "Sporty extras to sharpen the look inside and out.",
      includes: ["glow","shadow"], extras: ["M Sport brakes, red calipers", "M seat belts"] },
    { id: "mdynamic", name: "M Dynamic Pack", price: 3000, lines: ["m135"], unverifiedContents: true, forcesWheel: "1085s",
      desc: "Track focused upgrade for the M135 xDrive.",
      includes: [], extras: ["19\" M forged wheels 1085 M with sport tyres", "M Compound brakes", "Raised top speed limiter", "Adaptive M suspension"] }
  ],

  // Option categories in display order
  optionCats: ["Communication", "Exterior", "Interior", "Safety & assistance", "Technology"],
  options: [
    { id: "hk",       cat: "Communication", name: "Harman/Kardon Surround Sound", price: 550, standardOn: ["m135"],
      desc: "12 loudspeakers with digitally amplified sound." },
    { id: "hud",      cat: "Communication", name: "Head-Up Display", price: 0, packOnly: true,
      desc: "Full-colour driving information projected onto the windscreen." },
    { id: "dab",      cat: "Communication", name: "DAB Radio", price: 0, standardOn: ["sport","msport","mspro","m135"] },
    { id: "teleserv", cat: "Communication", name: "BMW TeleServices", price: 0, standardOn: ["sport","msport","mspro","m135"] },

    // UNVERIFIED rule: contrast roof assumed not combinable with the panoramic sunroof
    // (BMW flags it "requires further adjustments").
    { id: "roof",     cat: "Exterior", name: "Contrast roof in Black", price: 315, group: "roofgrp", unverifiedRule: true,
      desc: "A gloss black roof for a sharper two-tone look." },
    { id: "bootlid",  cat: "Exterior", name: "Electric bootlid", price: 390 },
    { id: "mirrors",  cat: "Exterior", name: "Electric folding mirrors with auto-dimming", price: 0, packOnly: true },
    { id: "glow",     cat: "Exterior", name: "Iconic Glow kidney grille", price: 0, packOnly: true, standardOn: ["mspro"] },
    { id: "debadge",  cat: "Exterior", name: "Model designation deletion", price: 0 },
    { id: "pano",     cat: "Exterior", name: "Panoramic glass sunroof", price: 1050, group: "roofgrp" },
    { id: "sunglass", cat: "Exterior", name: "Sun protection glass", price: 320 },
    { id: "towbar",   cat: "Exterior", name: "Towbar", price: 730 },
    { id: "shadow",   cat: "Exterior", name: "High-gloss Shadowline exterior trim", price: 0, packOnly: true, standardOn: ["mspro"] },

    { id: "activeseat", cat: "Interior", name: "Active seat, driver and passenger", price: 415 },
    { id: "elecseats",  cat: "Interior", name: "Electric front seats with driver memory", price: 730 },
    // Sport seats assumed standard on M Sport, M Sport Pro and M135 (UNVERIFIED).
    { id: "sportseats", cat: "Interior", name: "Front sport seats", price: 330, standardOn: ["msport","mspro","m135"], unverifiedRule: true,
      desc: "Raised side bolsters plus seat tilt and depth adjustment." },
    { id: "heatwheel",  cat: "Interior", name: "Heated steering wheel", price: 175 },
    { id: "lugnet",     cat: "Interior", name: "Luggage net", price: 175 },
    { id: "autodim",    cat: "Interior", name: "Auto-dimming rear-view mirror", price: 0, standardOn: ["sport","msport","mspro","m135"] },
    { id: "splitrear",  cat: "Interior", name: "Split folding rear seats", price: 175 },
    { id: "dualac",     cat: "Interior", name: "Dual zone air conditioning", price: 0, standardOn: ["sport","msport","mspro","m135"] },
    { id: "heatseats",  cat: "Interior", name: "Front heated seats", price: 0, standardOn: ["sport","msport","mspro","m135"] },

    { id: "aled",     cat: "Safety & assistance", name: "Adaptive LED headlights", price: 0, packOnly: true },
    { id: "digprem",  cat: "Safety & assistance", name: "BMW Digital Premium (limited duration)", price: 300 },
    { id: "daplus",   cat: "Safety & assistance", name: "Driving Assistant Plus", price: 700, group: "da" },
    { id: "dapro",    cat: "Safety & assistance", name: "Driving Assistant Professional", price: 1700, group: "da" },
    { id: "hba",      cat: "Safety & assistance", name: "High-Beam Assistant", price: 0, standardOn: ["sport","msport","mspro","m135"] },
    { id: "pap",      cat: "Safety & assistance", name: "Parking Assistant Plus", price: 0, packOnly: true },
    // UNVERIFIED rule: Parking Assistant Professional assumed to need a Technology pack.
    { id: "papro",    cat: "Safety & assistance", name: "Parking Assistant Professional", price: 180, requiresPack: ["tech","techplus"], unverifiedRule: true },
    { id: "guard",    cat: "Safety & assistance", name: "Active Guard", price: 0, standardOn: ["sport","msport","mspro","m135"] },
    { id: "isize",    cat: "Safety & assistance", name: "i-Size child seat mounting, front passenger", price: 0, standardOn: ["sport","msport","mspro","m135"] },
    { id: "da",       cat: "Safety & assistance", name: "Driving Assistant", price: 0, standardOn: ["sport","msport","mspro","m135"] },
    { id: "pa",       cat: "Safety & assistance", name: "Parking Assistant", price: 0, standardOn: ["sport","msport","mspro","m135"] },
    { id: "tyrekit",  cat: "Safety & assistance", name: "Tyre Repair Kit Plus", price: 0, standardOn: ["sport","msport","mspro","m135"] },

    { id: "comfort",  cat: "Technology", name: "Comfort Access", price: 520 },
    { id: "wcharge",  cat: "Technology", name: "Wireless charging tray", price: 0, packOnly: true },
    { id: "mhev",     cat: "Technology", name: "48V mild hybrid technology", price: 0, standardOn: ["sport","msport","mspro"] },
    { id: "esim",     cat: "Technology", name: "Personal eSIM", price: 0, standardOn: ["sport","msport","mspro","m135"] }
  ],

  accessories: [
    { id: "mats",     name: "BMW all-weather floor mats, set", price: 138.5 },
    { id: "rack",     name: "BMW roof rack", price: 299 },
    { id: "box350",   name: "BMW roof box Aero 350", price: 945,  group: "roofbox", requires: ["rack"] },
    { id: "box450",   name: "BMW roof box Aero 450", price: 1050, group: "roofbox", requires: ["rack"] },
    { id: "box550",   name: "BMW roof box Aero 550", price: 1300, group: "roofbox", requires: ["rack"] },
    { id: "cycle",    name: "BMW roof cycle carrier", price: 220, requires: ["rack"] },
    { id: "rearbox",  name: "BMW rear box (300 litres)", price: 835, requiresOpt: ["towbar"] },
    { id: "bike2",    name: "Pro 3.0 rear bike carrier, 2 bicycles", price: 941,  group: "bikecarrier", requiresOpt: ["towbar"] },
    { id: "bike3",    name: "Pro 3.0 rear bike carrier, 3 bicycles", price: 1096, group: "bikecarrier", requiresOpt: ["towbar"] },
    { id: "secact1",  name: "BMW Security Active, 1 year service", price: 585, group: "tracker" },
    { id: "secact3",  name: "BMW Security Active, 3 year service", price: 915, group: "tracker" },
    { id: "secs71",   name: "BMW Security Active S7, 1 year service", price: 485, group: "tracker" },
    { id: "secs73",   name: "BMW Security Active S7, 3 year service", price: 815, group: "tracker" },
    { id: "secpro1",  name: "BMW Security Pro, 1 year service", price: 660, group: "tracker" },
    { id: "secpro3",  name: "BMW Security Pro, 3 year service", price: 985, group: "tracker" }
  ]
};
