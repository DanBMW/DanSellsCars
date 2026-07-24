/* FORECOURT EMPIRE — data.js
   Every tuning dial, lifted from the economy model spreadsheet.
   Change numbers here, not in engine.js. */
'use strict';

var FE = window.FE = {};

FE.START_CASH = 1000000;
FE.WEEKS_PER_YEAR = 52;
FE.BASE_CONV = 0.105;          // footfall -> units, calibrated so demand binds ~35% of weeks
FE.CROWDING = 0.88;            // productivity of each extra head
FE.CAPACITY_EXP = 0.20;        // 3.1 * (11200/avgCost)^0.20
FE.BUYER_PREMIUM = 0.055;
FE.TRANSPORT = 180;
FE.LOTS_PER_WEEK = 50;         // fresh auction lots each day; a third are older bargains
FE.INSURANCE_WK = 340;
FE.FLOORPLAN_APR = 0.095;
FE.PREP_SD = 260;
FE.BLOWOUT_P = 0.09;
FE.BLOWOUT_RANGE = [1100, 2200];
FE.FNI_BASE = 0.34;
FE.FNI_BACKEND = 1150;
FE.SERVICE_PREP_SAVING = 0.40;

/* Stocking finance — an optional credit facility to fund stock beyond your
   cash. Limit scales with net worth (capped £1M); the rate starts high for a
   new dealer and eases as you establish a track record and grow net worth. */
FE.STOCK_FINANCE = {
  limitPct: 0.5,          // borrow up to 50% of net worth...
  maxLimit: 1000000,      // ...capped at £1M
  aprStart: 0.145,        // ~14.5% APR for a brand-new dealer
  aprFloor: 0.065,        // best rate once established and wealthy
  buffer: 25000           // headroom below the limit before the bank calls it in
};
/* Customer finance — how the back-end splits into finance commission vs
   products, for visibility. Balance-neutral: the total back-end is unchanged. */
FE.FINANCE_TAKEUP = 0.82;         // share of F&I deals that ride on finance
FE.FINANCE_COMM_SHARE = [0.42, 0.60];  // finance commission as a slice of back-end

FE.BRANDS = {
  Dacio: {
    name: 'Dacio', tier: 1, footfall: 115, prepPct: 0.055,
    avgCost: 7100, avgRetail: 8900, stockNeeded: 40, buyAdj: -0.026,
    haggle: [0.05, 0.09],          // relentless hagglers
    attachMult: 1.22,              // accept finance readily
    comebackFreq: 0.6, comebackCost: [120, 550],
    blurb: 'Budget champion. Avg retail ~£8,900. Expect volume.',
    badge: 'hex', colour: '#3d7dca'
  },
  Fjord: {
    name: 'Fjord', tier: 2, footfall: 95, prepPct: 0.042,
    avgCost: 11200, avgRetail: 13500, stockNeeded: 32, buyAdj: 0,
    haggle: [0.035, 0.065],
    attachMult: 1.0,
    comebackFreq: 1.0, comebackCost: [280, 950],
    blurb: 'The mainstream middle. Avg retail ~£13,500. Steady trade.',
    badge: 'oval', colour: '#1a4f9c'
  },
  BMV: {
    name: 'BMV', tier: 3, footfall: 125, prepPct: 0.034,
    avgCost: 19100, avgRetail: 22500, stockNeeded: 20, buyAdj: 0.032,
    haggle: [0.02, 0.045],
    attachMult: 0.9,
    comebackFreq: 0.8, comebackCost: [700, 2500],
    blurb: 'Premium metal. Avg retail ~£22,500. Image is everything.',
    badge: 'roundel', colour: '#2a2e35'
  }
};

/* model, newPrice, baseDays, segment, dieselShare, bigEngine */
FE.MODELS = [
  { m: 'Sandera',        b: 'Dacio', np: 15400, days: 30, seg: 'Supermini', dsl: 0.05, big: false },
  { m: 'Sandera Stepway',b: 'Dacio', np: 17800, days: 31, seg: 'Crossover', dsl: 0.05, big: false },
  { m: 'Dustar',         b: 'Dacio', np: 21900, days: 34, seg: 'SUV',       dsl: 0.30, big: false },
  { m: 'Logann MCV',     b: 'Dacio', np: 16200, days: 36, seg: 'Estate',    dsl: 0.20, big: false },
  { m: 'Jogga',          b: 'Dacio', np: 19500, days: 33, seg: 'MPV',       dsl: 0.10, big: false },
  { m: 'Fizzta',         b: 'Fjord', np: 21500, days: 30, seg: 'Supermini', dsl: 0.05, big: false },
  { m: 'Fokus',          b: 'Fjord', np: 26000, days: 38, seg: 'Hatchback', dsl: 0.20, big: false },
  { m: 'Fokus Estate',   b: 'Fjord', np: 27400, days: 42, seg: 'Estate',    dsl: 0.30, big: false },
  { m: 'Puuma',          b: 'Fjord', np: 27800, days: 34, seg: 'Crossover', dsl: 0.05, big: false },
  { m: 'Kuuga',          b: 'Fjord', np: 34500, days: 44, seg: 'SUV',       dsl: 0.35, big: true  },
  { m: 'Mondayo',        b: 'Fjord', np: 29000, days: 52, seg: 'Saloon',    dsl: 0.40, big: true  },
  { m: '1-Line',         b: 'BMV',   np: 32500, days: 44, seg: 'Hatchback', dsl: 0.35, big: false },
  { m: '2-Line Coupe',   b: 'BMV',   np: 36000, days: 56, seg: 'Coupe',     dsl: 0.25, big: true  },
  { m: '3-Line',         b: 'BMV',   np: 42000, days: 50, seg: 'Saloon',    dsl: 0.45, big: true  },
  { m: '3-Line Touring', b: 'BMV',   np: 44500, days: 48, seg: 'Estate',    dsl: 0.45, big: true  },
  { m: '5-Line',         b: 'BMV',   np: 52000, days: 60, seg: 'Saloon',    dsl: 0.50, big: true  },
  { m: 'X1',             b: 'BMV',   np: 41000, days: 46, seg: 'SUV',       dsl: 0.35, big: false },
  { m: 'X3',             b: 'BMV',   np: 51000, days: 52, seg: 'SUV',       dsl: 0.45, big: true  }
];

/* age -> [valueMult, daysMult]; expected mileage = age * 9000 */
FE.AGE = {
  1: [0.86, 0.88], 2: [0.76, 0.94], 3: [0.68, 1.00], 4: [0.61, 1.06],
  5: [0.55, 1.12], 6: [0.49, 1.18], 7: [0.44, 1.24], 8: [0.39, 1.32]
};
FE.MILES_PER_YEAR = 9000;
FE.MILE_VALUE_PEN_PER_10K = 0.055;
FE.MILE_VALUE_FLOOR = 0.72;
FE.MILE_DAYS_PEN_PER_10K = 0.09;
FE.MILE_FAULT_PER_10K = 0.025;
FE.MILE_SD = 0.35;

FE.TRIMS = [
  { t: 'Base', cost: 0.92, retail: 0.90, p: 0.30 },
  { t: 'Mid',  cost: 1.00, retail: 1.00, p: 0.45 },
  { t: 'Top',  cost: 1.13, retail: 1.18, p: 0.25 }
];

/* colour, retailMult, daysMult, share of parc, render hex */
FE.COLOURS = [
  { c: 'White',  r: 1.00, d: 0.94, p: 0.22, hex: '#eef0ee' },
  { c: 'Grey',   r: 1.01, d: 0.95, p: 0.20, hex: '#8f979e' },
  { c: 'Black',  r: 1.02, d: 0.96, p: 0.18, hex: '#22252b' },
  { c: 'Blue',   r: 0.99, d: 1.00, p: 0.12, hex: '#2f5f9e' },
  { c: 'Silver', r: 0.98, d: 1.00, p: 0.10, hex: '#c3c9ce' },
  { c: 'Red',    r: 0.96, d: 1.08, p: 0.08, hex: '#a92f28' },
  { c: 'Green',  r: 0.93, d: 1.18, p: 0.04, hex: '#2e6b46' },
  { c: 'Brown',  r: 0.88, d: 1.34, p: 0.02, hex: '#6f5340' },
  { c: 'Yellow', r: 0.87, d: 1.40, p: 0.02, hex: '#d9b93a' },
  { c: 'Gold',   r: 0.86, d: 1.42, p: 0.02, hex: '#a8873c' }
];

/* condition grade -> prepMult, faultRisk, frequency */
FE.COND = {
  5: { prep: 0.60, fault: 0.02, p: 0.12 },
  4: { prep: 0.85, fault: 0.04, p: 0.30 },
  3: { prep: 1.15, fault: 0.09, p: 0.34 },
  2: { prep: 1.60, fault: 0.16, p: 0.18 },
  1: { prep: 2.30, fault: 0.28, p: 0.06 }
};
FE.HISTORY = [
  { h: 'Full', r: 1.04, d: 0.92, p: 0.52 },
  { h: 'Part', r: 0.98, d: 1.06, p: 0.34 },
  { h: 'None', r: 0.90, d: 1.22, p: 0.14 }
];

/* auction competition */
FE.DESIRE_AGE = 0.40;    // age 1-2
FE.DESIRE_TOP = 0.35;    // top spec
FE.DESIRE_COLOUR = 0.30; // white / black / grey
/* Recalibrated so the AVERAGE lot lands near the model's 83%-of-retail buy-in
   (avg trade £11,200 vs avg retail £13,500). The spec band of 73.5–80.5% made
   auction margins roughly double the verified model once fees were netted off. */
FE.BUY_PCT_LOW = 0.78;
FE.BUY_PCT_HIGH = 0.848;
FE.BUY_PCT_CAP = 0.92;

/* slow colour price cuts to shift */
FE.SLOW_CUT_MILD = 0.04;   // daysMult 1.05-1.25
FE.SLOW_CUT_BAD = 0.08;    // daysMult > 1.25

FE.SITES = [
  { name: 'Portacabin + gravel yard', cost: 45000,  ext: 20, int: 0, util: 280, tier: 1, pres: 0.72, maxStaff: 3,
    blurb: 'Cheap way in. 20 pitches on gravel, a kettle, and ambition.' },
  { name: 'Converted unit',           cost: 140000, ext: 40, int: 2, util: 560, tier: 2, pres: 0.90, maxStaff: 4,
    blurb: '40 pitches, 2 under cover. A proper front door.' },
  { name: 'Small showroom',           cost: 290000, ext: 65, int: 5, util: 950, tier: 3, pres: 1.06, maxStaff: 5,
    blurb: '65 pitches, 5 under glass and lights. Looks the part — costs it too.' }
];
FE.PRES_CONV_PEN = 0.13;   // per tier short (of a 0.26 base conversion)
FE.PRES_STAR_PEN = 0.11;   // star drift per tier short

FE.SALARIES = [
  { name: 'Low basic / high commission', basic: 14000, comm: 0.12, moraleGood: 1.10, moraleBad: 0.72,
    blurb: '£14k basic, 12% of gross. Hungry when it’s good. Ugly when it’s not.' },
  { name: 'Balanced', basic: 22000, comm: 0.08, moraleGood: 1.00, moraleBad: 0.92,
    blurb: '£22k basic, 8% of gross. The middle road.' },
  { name: 'High basic / low commission', basic: 32000, comm: 0.03, moraleGood: 0.86, moraleBad: 1.06,
    blurb: '£32k basic, 3% of gross. Steady heads, big fixed bill.' }
];

/* week-of-year -> demand multiplier, month, plate change, stock deval, scheduled shock */
FE.SEASON = [
  { w: 1,  mo: 'Jan', d: 0.52 }, { w: 2,  mo: 'Jan', d: 0.55 }, { w: 3,  mo: 'Jan', d: 0.60 }, { w: 4,  mo: 'Jan', d: 0.66 },
  { w: 5,  mo: 'Feb', d: 0.74 }, { w: 6,  mo: 'Feb', d: 0.80 }, { w: 7,  mo: 'Feb', d: 0.84, dev: 0.02 }, { w: 8,  mo: 'Feb', d: 0.88, dev: 0.03 },
  { w: 9,  mo: 'Mar', d: 1.32, plate: 1, dev: 0.05 }, { w: 10, mo: 'Mar', d: 1.48, plate: 1 }, { w: 11, mo: 'Mar', d: 1.45, plate: 1 }, { w: 12, mo: 'Mar', d: 1.34, plate: 1 },
  { w: 13, mo: 'Apr', d: 1.14 }, { w: 14, mo: 'Apr', d: 1.16 }, { w: 15, mo: 'Apr', d: 1.12 }, { w: 16, mo: 'Apr', d: 1.10 },
  { w: 17, mo: 'May', d: 1.15 }, { w: 18, mo: 'May', d: 1.18 }, { w: 19, mo: 'May', d: 1.14 }, { w: 20, mo: 'May', d: 1.12 },
  { w: 21, mo: 'Jun', d: 1.08 }, { w: 22, mo: 'Jun', d: 1.06 }, { w: 23, mo: 'Jun', d: 1.02, shock: 'launch' }, { w: 24, mo: 'Jun', d: 0.98, dev: 0.04 },
  { w: 25, mo: 'Jul', d: 0.88 }, { w: 26, mo: 'Jul', d: 0.82 }, { w: 27, mo: 'Jul', d: 0.78 }, { w: 28, mo: 'Jul', d: 0.76 },
  { w: 29, mo: 'Aug', d: 0.72 }, { w: 30, mo: 'Aug', d: 0.74 }, { w: 31, mo: 'Aug', d: 0.80, dev: 0.02 }, { w: 32, mo: 'Aug', d: 0.86, dev: 0.03 },
  { w: 33, mo: 'Sep', d: 1.28, plate: 1, dev: 0.05 }, { w: 34, mo: 'Sep', d: 1.40, plate: 1 }, { w: 35, mo: 'Sep', d: 1.36, plate: 1 }, { w: 36, mo: 'Sep', d: 1.24, plate: 1 },
  { w: 37, mo: 'Oct', d: 1.08 }, { w: 38, mo: 'Oct', d: 1.10 }, { w: 39, mo: 'Oct', d: 1.06 }, { w: 40, mo: 'Oct', d: 1.04 },
  { w: 41, mo: 'Nov', d: 1.00 }, { w: 42, mo: 'Nov', d: 0.98, shock: 'fuelSentiment' }, { w: 43, mo: 'Nov', d: 0.94, dev: 0.03 }, { w: 44, mo: 'Nov', d: 0.90 },
  { w: 45, mo: 'Dec', d: 0.86 }, { w: 46, mo: 'Dec', d: 0.80 }, { w: 47, mo: 'Dec', d: 0.48 }, { w: 48, mo: 'Dec', d: 0.40 },
  { w: 49, mo: 'Jan', d: 0.52 }, { w: 50, mo: 'Jan', d: 0.56 }, { w: 51, mo: 'Jan', d: 0.62 }, { w: 52, mo: 'Jan', d: 0.68 }
];

FE.STAR_FOOTFALL = [[2.0, 0.22], [2.5, 0.36], [3.0, 0.58], [3.5, 0.80], [4.0, 1.00], [4.5, 1.08], [5.0, 1.18]];

FE.AD_TIERS = [
  { name: 'Off',    cost: 0,    mult: 0.86 },
  { name: 'Low',    cost: 300,  mult: 0.95 },
  { name: 'Normal', cost: 600,  mult: 1.00 },
  { name: 'Push',   cost: 1200, mult: 1.07 }
];

/* The ten candidates. rep is shown; everything after fee is hidden. */
FE.ROSTER = [
  { id: 'mon',    name: 'Mon',    rep: 'Top sales exec, BMV Croydon',        fee: 8500, lo: 3.2, hi: 4.4, gross: 1.15, fni: 1.00, cRisk: 0.04, trait: 'payReview' },
  { id: 'glen',   name: 'Glen',   rep: 'Former police officer',              fee: 1200, lo: 1.0, hi: 5.0, gross: 1.05, fni: 0.85, cRisk: 0.02, trait: 'wildcard' },
  { id: 'priya',  name: 'Priya',  rep: 'Aftersales advisor, Kiya',           fee: 2800, lo: 2.0, hi: 3.0, gross: 0.95, fni: 1.85, cRisk: 0.03, trait: 'fniStar' },
  { id: 'deano',  name: 'Deano',  rep: '"Sales legend" — 3 dealers in 2 yrs', fee: 900,  lo: 4.0, hi: 6.2, gross: 0.62, fni: 1.20, cRisk: 0.22, trait: 'liability' },
  { id: 'sarah',  name: 'Sarah',  rep: 'Graduate, no experience',            fee: 0,    lo: 0.8, hi: 1.8, gross: 0.88, fni: 0.70, cRisk: 0.05, trait: 'grows' },
  { id: 'terry',  name: 'Terry',  rep: '38 years in the trade',              fee: 3400, lo: 1.9, hi: 2.3, gross: 1.28, fni: 0.15, cRisk: 0.01, trait: 'noFinance' },
  { id: 'kelly',  name: 'Kelly',  rep: 'Retail background, no motor trade',  fee: 600,  lo: 2.4, hi: 3.6, gross: 0.74, fni: 1.10, cRisk: 0.06, trait: 'discounts' },
  { id: 'marcus', name: 'Marcus', rep: 'Prestige specialist, BMV Mayfair',   fee: 6200, lo: 1.6, hi: 3.8, gross: 1.32, fni: 1.15, cRisk: 0.05, trait: 'prestige' },
  { id: 'bev',    name: 'Bev',    rep: 'Fleet sales, Fjord',                 fee: 3900, lo: 2.8, hi: 3.4, gross: 0.92, fni: 0.90, cRisk: 0.02, trait: 'steady' },
  { id: 'ryan',   name: 'Ryan',   rep: 'Car supermarket, 2 years',           fee: 1500, lo: 3.0, hi: 4.2, gross: 0.80, fni: 1.35, cRisk: 0.11, trait: 'pusher' },
  { id: 'dan',    name: 'Dan',    rep: 'Knows everyone in Kent',             fee: 4800, lo: 2.8, hi: 3.6, gross: 1.18, fni: 1.25, cRisk: 0.02, trait: 'complete' },
  { id: 'danny',  name: 'Danny',  rep: 'Dan’s cousin. Probably fine',        fee: 700,  lo: 2.2, hi: 4.0, gross: 0.78, fni: 1.05, cRisk: 0.09, trait: 'discounts' },
  { id: 'karis',  name: 'Karis',  rep: 'Service advisor gone to the dark side', fee: 2200, lo: 1.8, hi: 2.6, gross: 0.96, fni: 1.30, cRisk: 0.02, trait: 'defuser' },
  { id: 'clive',  name: 'Clive',  rep: 'Semi-retired. Does Tuesdays properly', fee: 1900, lo: 1.6, hi: 2.0, gross: 1.35, fni: 0.20, cRisk: 0.01, trait: 'anchor' },
  { id: 'vas',    name: 'Vas',    rep: 'Ran his own pitch until the divorce', fee: 2600, lo: 2.6, hi: 3.2, gross: 1.02, fni: 1.00, cRisk: 0.03, trait: 'trader' },
  { id: 'tomi',   name: 'Tomi',   rep: 'TikTok famous, apparently',          fee: 1100, lo: 2.0, hi: 3.4, gross: 0.85, fni: 0.95, cRisk: 0.08, trait: 'magnet' }
];

FE.TRAINING = [
  { id: 'fni',   name: 'F&I / Finance & Insurance', cost: 6500,  weeks: 1,   fx: 'F&I attachment +35%' },
  { id: 'fni2',  name: 'Advanced F&I',              cost: 11000, weeks: 1,   fx: 'Further +25% attachment. Raises mis-selling risk.', needs: 'fni' },
  { id: 'sales', name: 'Sales technique',           cost: 3200,  weeks: 1,   fx: 'Conversion +15%' },
  { id: 'prod',  name: 'Product knowledge',         cost: 2400,  weeks: 0.5, fx: 'Conversion +10%, fewer complaints' },
  { id: 'care',  name: 'Customer care',             cost: 2800,  weeks: 0.5, fx: 'Softer complaints, faster star recovery' },
  { id: 'comp',  name: 'Compliance',                cost: 4000,  weeks: 0.5, fx: 'Materially cuts fine probability' }
];

FE.FINES = [
  { id: 'gap',    name: 'GAP insurance mis-selling',   amount: 10000, star: 0.10 },
  { id: 'adv',    name: 'Advertising compliance',      amount: 4000,  star: 0.02 },
  { id: 'miles',  name: 'Trading standards — mileage', amount: 6500,  star: 0.22 },
  { id: 'data',   name: 'Data protection',             amount: 8000,  star: 0.05 },
  { id: 'road',   name: 'Roadworthiness',              amount: 12000, star: 0.35 },
  { id: 'employ', name: 'Employment dispute',          amount: 5500,  star: 0.04 }
];

FE.FRANCHISE = {
  unlockWk: 7,
  fee: 45000,             // per year, dripped weekly
  minSlots: 8,
  targetPerSlot: 8.0,     // units per slot per year
  bonusFull: 0.20, bonusFullAt: 0.97,
  bonusHalf: 0.10, bonusHalfAt: 0.85,
  marginLow: 0.05, marginHigh: 0.07,
  holdback: 0.025,
  costPct: 0.92,
  pdi: 180,
  daysPlate: 26, daysOff: 72,
  cannibal: 0.22,
  preRegLossPct: 0.115,
  preRegShare: 0.7
};

FE.DEPARTMENTS = [
  { id: 'service', name: 'Service department', cost: 180000, buildWks: 1, weekly: 3200,
    blurb: 'Workshop income ~£3,200/wk. Word is it does something for prep bills too.' }
];
FE.EXPANSIONS = [
  { id: 'land15', name: 'Extra land — 15 pitches', cost: 40000, slots: 15, util: 90, buildWks: 1 },
  { id: 'land40', name: 'Extra land — 40 pitches', cost: 95000, slots: 40, util: 210, buildWks: 2 }
];
FE.FRANCHISE_INSTALL_WKS = 1;   // brand corner fit-out before the first order lands

FE.SITE2_TARGET = 2000000;

/* ---------- flavour pools ---------- */

FE.FIRST_NAMES = ['Dave','Karen','Mo','Steve','Tracy','Ali','Jamal','Chloe','Gary','Denise','Pawel','Ruth','Craig','Fatima','Lee','Sandra','Tomasz','Nicola','Barry','Jade','Owen','Margaret','Kev','Sophie','Derek','Amara','Ian','Lisa','Frank','Priti','Colin','Wendy','Marek','Donna','Reg','Hayley','Stu','Carol','Nige','Becky'];
FE.SURNAMES = ['Whitfield','Patel','Kowalski','Burrows','O’Neill','Hodgson','Akhtar','Trelawney','Sugden','Mercer','Doyle','Chapple','Nkomo','Farthing','Osei','Dunmore','Battersby','Cole','Vine','Hollis','Pryce','Garner','Ashworth','Okafor','Timmins','Ledger','Mahmood','Quirke','Sables','Wren'];

FE.READS = {
  fair:   ['seems serious', 'ready to buy today', 'came with the family', 'second visit this week'],
  cheeky: ['testing you', 'been to three other dealers', 'phone out, checking prices', 'says they’ve "seen it cheaper"'],
  crazy:  ['chancing it — probably', 'claims it’s "all the cash they have"', 'wearing sunglasses indoors', 'you honestly can’t tell']
};

FE.REVIEW_GOOD = [
  'Bought a {car} from {exec}. Great service, no pressure, sorted everything in an hour.',
  '{exec} was straight with us from the start. Love the {car}. Would recommend.',
  'Second car from this place. {exec} remembered us. That’s why we came back.',
  'No games, fair price on the {car}. {exec} even filled the tank.'
];
FE.REVIEW_BAD = [
  'Sold me a car with a knocking noise and told me it was normal. Then refused to fix it. Avoid.',
  'Pushy on the finance, wouldn’t take no for an answer. Shame, the car was decent.',
  'Three weeks in and it’s back on their ramp. Getting fobbed off. One star.',
  'Felt like a number, not a customer.'
];
FE.REVIEW_PRES = [
  'Car’s fine but sat on a gravel yard in the rain looking at a portacabin. Not what I expected for this money.',
  'Nice enough people but the place is a tip. Hard to trust a £20k car from a shed.'
];

FE.SHOCK_DEFS = {
  launch:        { name: 'New model launch',        blurb: 'The factory has revealed the new {model}. Your outgoing examples just got old overnight.' },
  fuelSentiment: { name: 'Diesel sentiment shift',  blurb: 'Another round of headlines about diesel. Your diesel stock has gone quiet.' },
  priceCut:      { name: 'Manufacturer price cut',  blurb: 'List prices cut on new cars. Used values follow them down.' },
  rateRise:      { name: 'Finance rate rise',       blurb: 'Money just got dearer. Watch conversion and finance take-up.' },
  fuelSpike:     { name: 'Fuel price spike',        blurb: 'Petrol through the roof. Nobody wants the big engines this month.' },
  scrappage:     { name: 'Scrappage scheme',        blurb: 'A new incentive scheme has people out shopping — and expecting silly money for their old ones.' }
};
