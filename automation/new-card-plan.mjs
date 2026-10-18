/* What today's two brand new cards should say.
 *
 * The picking rule (new-pair.js) and the finance rules (dsfinance.js) are the
 * ones todays-offers.html and new-cars.html use in the browser, so this runs
 * them rather than restating them: a card showing a car the page is not
 * offering, or a monthly the page will not show, is the fault worth designing
 * out. automation/new-car-post.py calls this and renders what comes back.
 *
 *   node automation/new-card-plan.mjs [YYYY-MM-DD] [count]
 *
 * Prints one JSON object: the day, the cars, and for each the lender's own
 * quote and its representative example, or null where the quote does not pass
 * every check (dsFin.newOk), in which case the card carries no monthly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

globalThis.window = globalThis.window || globalThis;   /* both files set window.* */
require(path.join(ROOT, 'dsfinance.js'));
const pair = require(path.join(ROOT, 'new-pair.js'));
const FN = globalThis.window.dsFin;

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const stock = read('lookup/new-stock.json');
let quotes = { quotes: {}, generated_at: '' };
try { quotes = read('lookup/new-stock-quotes.json'); } catch (e) {}

/* The London date, the same one the page derives from its own clock. */
const londonToday = () => new Intl.DateTimeFormat('en-CA',
  { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const day = process.argv[2] && /^\d{4}-\d\d-\d\d$/.test(process.argv[2]) ? process.argv[2] : londonToday();
const want = +(process.argv[3] || 2);
const cars = pair.pick(stock.cars || [], day, want);

const out = cars.map(c => {
  const q = (quotes.quotes || {})[c.order_number] || null;
  const ok = FN.newOk(c, q, quotes.generated_at);
  const weeks = c.lead_time_weeks_min && c.lead_time_weeks_max
    ? `${c.lead_time_weeks_min} to ${c.lead_time_weeks_max} weeks`
    : (c.lead_time_weeks_max ? `${c.lead_time_weeks_max} weeks` : '');
  return {
    order: String(c.order_number),
    description: c.description || '', series: c.series || '', range: c.range || '',
    colour: c.colour || '', upholstery: c.upholstery || '', wheels: c.wheels || '',
    fuel: c.fuel || '', transmission: c.transmission || '', seats: c.seats || null,
    zero_to_62: c.zero_to_62 || null,
    price: c.price || '', price_gbp: c.price_gbp || null,
    price_kind: String(c.retailer_price) === 'True' || c.retailer_price === true
      ? 'Hedin Ruxley price, on the road' : 'BMW on the road price',
    weeks, image: (c.images && c.images[0]) || c.image || '',
    finance: ok ? q : null,
    rep: ok ? FN.newRep(q) : null,
    quotes_generated_at: quotes.generated_at || '',
    quote_rejected: !ok && !!q
  };
});

process.stdout.write(JSON.stringify({
  day, broker: FN.BROKER, stock_generated_at: stock.generated_at || '',
  quotes_generated_at: quotes.generated_at || '', cars: out
}, null, 1) + '\n');
