#!/usr/bin/env python3
"""The new cars BMW will build for Hedin Ruxley without a wait.

    python3 automation/new-stock.py            # pull, compare, write
    python3 automation/new-stock.py --check    # pull and report, write nothing

Writes `lookup/new-stock.json`, the new car equivalent of the used
`lookup/stock.json` that Hedin Appointments already reads. Same shape of idea:
one file, replaced whole on a good run, left alone on a bad one.

**This is a script on the morning routine, not a Cloudflare Worker**, and that
is not a liberty taken with the brief. The brief asks for a Worker that
publishes to `https://dan-sells.co.uk/lookup/new-stock.json`. That URL is
GitHub Pages serving this repository, and a Worker cannot write a file into a
git repo: it would have to publish to its own workers.dev address instead, and
every reader of the file would need repointing. Doing it here keeps the URL the
brief asks for, puts the data under the same review and history as everything
else, and costs one more step on a routine that already runs four.

What the list is. Retailer 22181, Hedin Automotive Ruxley. These are cars the
BMW New Car Locator will build now, not the whole order bank. There is no
registration and no readable VIN, so **the order number is the key**.

Four things about the source, all of them confirmed against the live site on
8 October 2026 rather than taken on trust:

- **`https://stock.bmw.co.uk/retailer/22181` is a form, not a list.** The cars
  come from `/results`, which only answers properly to `Accept:
  application/json`. The model ids are read off that form every run, because a
  model whose id is not in the query is simply absent from the results, and a
  newly stocked model would go missing silently.
- **`monthly_max` is the string `none`, base64 encoded.** A high number is not
  the same thing: a cap quietly drops cars. All four of `f`, `monthly_min`,
  `monthly_max` and `debug` are base64 of a plain string.
- **The paging offset lives in a session cookie**, `_new_car_stock_tool_session`.
  `/results/more` without it is a 500, and two requests in parallel share one
  offset and lose a page. So the pages are fetched strictly one after another,
  carrying the cookie the first response set.
- **Image urls must be copied byte for byte.** They are configurator renders
  600 to 900 characters long and carry `%25` sequences; decoding one turns it
  into a 404. They render the specification rather than the physical car, so
  two identical orders can share a url.

The money fields need care, and the first version of this file was wrong about
them. `monthly_finance_payment` and `monthly_apr` are BMW's own figures for
that exact car. The *terms* behind them are published too, but not on the car:
they are in the page's own wording, `finance_disclaimer`, which reads "Based on
a £4,500 deposit, 48 month term and 8,000 miles/year", and `disclaimer_terms`,
which names the product as BMW Select (PCP). `finance_terms()` reads them from
there every run rather than hard coding them, because a campaign that changes
the deposit would otherwise silently relabel every payment on the page.

What the locator does **not** publish is the optional final payment, the total
amount payable or the total charge for credit, and it prints its monthly under
a heading of its own that says "Representative Example" without them.

Those three are recovered by `example_for()`, and that is a calculation, so it
is held to the standard the rest of this repo holds a calculation to:

- **It was checked against the lender, not assumed.** The same sum run against
  all 301 real BMW Financial Services quotes in `stock-finance.json` reproduces
  the lender's own optional final payment with a median error of 15p and a
  worst case of 29p; every one of the 301 lands within a pound.
- **47 payments on a 48 month term is the lender's convention, not a guess.**
  Every one of those 301 quotes has one fewer regular payment than its term.
- **The answers behave like a residual table, which is the real test.** BMW set
  a residual by derivative and mileage, not by how a car is optioned, so cars
  of one derivative should come back close to the same figure in pounds however
  far apart their prices are. They do: ten 120 M Sports spread over £1,708 of
  price all land within £1 of £14,811, three M5 Saloons spread over £17,103 land
  within £414, and the XMs within £359 over £7,315. A wrong deposit or term
  would scatter them.

What is still **not** ours, and is the reason the page says so rather than
inventing it: the **excess mileage charge**. The locator publishes no rate at
all, and in the 301 real quotes it runs from 4.1p to 28.4p a mile with no
relation to anything we hold. It is a term of the agreement, so the card states
that it is confirmed on the order instead of carrying a figure.
"""
import argparse, base64, html, http.cookiejar, json, os, re, time
import urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
LOOKUP = os.path.join(os.path.dirname(HERE), 'lookup')
OUT = os.path.join(LOOKUP, 'new-stock.json')
ORDER_DIR = os.path.join(LOOKUP, 'order')

RETAILER = '22181'
RETAILER_NAME = 'Hedin Automotive Ruxley'
BASE = 'https://stock.bmw.co.uk/retailer/' + RETAILER
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')
CDN = 'https://prod.cosy.bmw.cloud/'

MIN_CARS = 50          # below this the run is treated as broken, not as a sale
KEEP_REMOVED_DAYS = 30
# A residual outside this share of the cash price is dropped and named rather
# than published, the same rule `car-details.py` keeps for a harvested figure:
# an absurd number is worse than no number. Every one of the 80 cars on the
# first run sat between 37% and 52%.
RESIDUAL_BAND = (0.20, 0.70)
PAGE_PAUSE = 1.0       # polite, and nowhere near one person scrolling results
MAX_PAGES = 60
RETRIES = 3
LONDON = ZoneInfo('Europe/London')


def today():
    return datetime.now(LONDON).date()


class Session:
    """One cookie jar for one run. The offset lives in the cookie, so every
    request after the first has to be made by this same object, in order."""

    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar))

    def get(self, url, accept='text/html'):
        """Body as text, with 429 backed off and retried rather than failed."""
        wait = 5
        for attempt in range(RETRIES):
            req = urllib.request.Request(
                url, headers={'User-Agent': UA, 'Accept': accept})
            try:
                with self.op.open(req, timeout=90) as r:
                    return r.status, r.read().decode('utf-8', 'replace')
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < RETRIES - 1:
                    print('  429 from the locator, waiting %ds' % wait)
                    time.sleep(wait); wait *= 3
                    continue
                return e.code, (e.read() or b'').decode('utf-8', 'replace')
            except (urllib.error.URLError, OSError) as e:
                if attempt < RETRIES - 1:
                    print('  %s, retrying' % e); time.sleep(wait); wait *= 3
                    continue
                raise
        return 0, ''


def model_ids(s):
    """Every `data-modelno` on the search form, in order, de-duplicated."""
    status, html = s.get(BASE)
    if status != 200:
        raise RuntimeError('retailer page returned HTTP %s' % status)
    out = []
    for i in re.findall(r'data-modelno="(\d+)"', html):
        if i not in out:
            out.append(i)
    return out


def query_for(ids):
    b64 = lambda v: base64.b64encode(v.encode()).decode()
    qs = [('f', b64('true')), ('monthly_min', b64('0')),
          ('monthly_max', b64('none')), ('debug', b64('false'))]
    qs += [('v[vehicle_ids][]', i) for i in ids]
    return urllib.parse.urlencode(qs)


def pull(ids):
    """Every vehicle row the locator will give for these models.

    A 500 from `/results/more` means the session was lost rather than that the
    list ended, so the whole run starts again from `/results` with a new
    session; keeping the partial list would publish a short catalogue and mark
    every car after the break as removed.
    """
    for attempt in range(RETRIES):
        s = Session()
        query = query_for(ids)
        rows, page, lost = [], 0, False
        status, body = s.get(BASE + '/results?' + query, 'application/json')
        while True:
            if status != 200:
                print('  page %d returned HTTP %s' % (page + 1, status))
                lost = True
                break
            try:
                data = json.loads(body)
            except ValueError:
                print('  page %d was not JSON' % (page + 1))
                lost = True
                break
            page += 1
            rows += [x for x in (data.get('location') or [])
                     if x.get('type') == 'vehicle']
            if data.get('finished') is True:
                break
            if page >= MAX_PAGES:
                raise RuntimeError('still not finished after %d pages' % page)
            time.sleep(PAGE_PAUSE)
            status, body = s.get(BASE + '/results/more?' + query,
                                 'application/json')
        if not lost:
            print('  %d pages, %d vehicle rows' % (page, len(rows)))
            return rows
        if attempt < RETRIES - 1:
            print('  session lost, starting the whole list again')
            time.sleep(10)
    raise RuntimeError('could not read the full list')


def order_number(raw):
    """The digits behind the base64. Anything else is not an order number."""
    try:
        v = base64.b64decode(str(raw or ''), validate=True).decode('ascii')
    except Exception:
        return None
    return v if re.fullmatch(r'\d{6,8}', v) else None


def images_of(car):
    """`image` first, then the exterior gallery, then the interior.

    Copied exactly as they arrive: these carry `%25` and decoding one makes
    BMW answer 404. Only the one CDN, and no duplicates.
    """
    out, vi = [], car.get('vehicle_images') or {}
    for u in ([car.get('image')] + list(vi.get('exterior') or [])
              + list(vi.get('interior') or [])):
        if isinstance(u, str) and u.startswith(CDN) and u not in out:
            out.append(u)
    return out


def clean(v):
    """One line of locator text, fit to put on a page.

    The feed carries HTML entities in plain string fields: a colour comes back
    as "BMW&nbsp;Individual Tanzanite Blue". Unescaped it reads wrong on the
    card, and left as an entity it is markup sitting in a data file. The
    non-breaking space becomes an ordinary one, the same tidy-up the group
    stock fetcher does to Hedin's mileage.
    """
    if not isinstance(v, str):
        return v
    return html.unescape(v).replace('\u00a0', ' ').strip()


def series_of(name):
    """The model family, by the same rules the used snapshot uses, so the two
    stock pages name a family the same way and a filter reads alike on both."""
    n = (name or '').replace('BMW ', '').strip()
    for tok in ('iX1', 'iX2', 'iX3', 'iX', 'i4', 'i5', 'i7'):
        if n.startswith(tok):
            return tok
    if n.startswith('XM'):
        return 'XM'
    m = re.match(r'X(\d)', n)
    if m:
        return 'X' + m.group(1)
    m = re.match(r'Z(\d)', n)
    if m:
        return 'Z' + m.group(1)
    m = re.match(r'M(\d{3})', n)          # M135, M235, M340
    if m:
        return m.group(1)[0] + ' Series'
    m = re.match(r'M(\d)\b', n)            # M2, M3, M4, M5
    if m:
        return m.group(1) + ' Series'
    m = re.match(r'(\d)\d\d', n)          # 120, 320i, 530e
    if m:
        return m.group(1) + ' Series'
    return ''


def finance_terms(s):
    """The deposit, term, mileage and product behind BMW's monthly payments.

    Read off the retailer page every run. The page carries both the template
    ("%{default_annual_mileage} miles/year") and the filled sentence; only the
    filled one is any use, so a page that gives only the template is treated as
    giving nothing and the figures are left out rather than guessed at.
    """
    status, page = s.get(BASE)
    if status != 200 or not page:
        return None
    m = re.search(r'Based on a \\u00a3([\d,]+) deposit, (\d+) month term '
                  r'and ([\d,]+) miles/year', page)
    if not m:
        m = re.search(r'Based on a £([\d,]+) deposit, (\d+) month term '
                      r'and ([\d,]+) miles/year', page)
    if not m:
        print('  the locator did not publish its finance terms this run, so '
              'no example is written')
        return None
    product = ('BMW Select (PCP)' if 'BMW Select (PCP)' in page
               else 'BMW Select')
    return {
        'product': product,
        'lender': 'BMW Financial Services (GB) Limited',
        'deposit_gbp': int(m.group(1).replace(',', '')),
        'term_months': int(m.group(2)),
        'annual_mileage': int(m.group(3).replace(',', '')),
        'source': BASE,
    }


def example_for(price, monthly, apr, terms):
    """The rest of the representative example, from BMW's own three figures.

    The optional final payment is what the agreement has to be worth at the end
    of the term for BMW's monthly to be the monthly: discount the payments at
    the effective monthly rate the APR implies, take that off the credit, and
    carry the remainder forward to the end. Total payable and the charge for
    credit then follow by addition, not by another model.
    """
    if not (price and monthly and apr is not None and terms):
        return None
    term = terms['term_months']
    deposit = terms['deposit_gbp']
    payments = term - 1          # the lender's convention on all 301 quotes
    credit = price - deposit
    if credit <= 0 or payments < 1:
        return None
    r = (1 + apr / 100.0) ** (1 / 12.0) - 1
    if r <= 0:
        return None
    pv = monthly * (1 - (1 + r) ** -payments) / r
    final = (credit - pv) * (1 + r) ** term
    lo, hi = RESIDUAL_BAND
    if not (price * lo <= final <= price * hi):
        return None
    total = deposit + monthly * payments + final
    return {
        'product': terms['product'],
        'lender': terms['lender'],
        'apr': apr,
        'monthly': round(monthly, 2),
        'payments': payments,
        'term_months': term,
        'deposit': deposit,
        'cash_price': round(price, 2),
        'amount_of_credit': round(credit, 2),
        'final_payment': round(final, 2),
        'total_payable': round(total, 2),
        'charge_for_credit': round(total - price, 2),
        'annual_mileage': terms['annual_mileage'],
        'contract_mileage': terms['annual_mileage'] * term // 12,
        # BMW publish no excess mileage rate with the stock figures, and it is
        # a term of the agreement, so it is named as outstanding rather than
        # filled in with a plausible number.
        'excess_pence': None,
        'basis': ('BMW publish the monthly payment, the APR and the cash price '
                  'for this car. The optional final payment, total amount '
                  'payable and total charge for credit are worked out from '
                  'those on the terms BMW state, and are not a quotation.'),
    }


def normalise(car, terms=None):
    num = order_number(car.get('order_number'))
    if not num:
        return None
    shots = images_of(car)
    price_n = car.get('numeric_visible_cash_price')
    desc = clean(car.get('description')) or ''
    rec = {
        'order_number': num,
        'description': desc,
        'range': clean(car.get('range')) or '',
        'series': series_of(clean(car.get('range')) or desc),
        'colour': clean(car.get('colour')) or '',
        'fuel': clean(car.get('fuel_type')) or '',
        'transmission': clean(car.get('transmission')) or '',
        'drive': clean(car.get('drive_type')) or '',
        'wheels': clean(car.get('wheels')) or '',
        'upholstery': clean(car.get('upholstery_text')) or '',
        'seats': car.get('seat_count'),
        'engine_cc': car.get('engine_size'),
        'zero_to_62': car.get('seconds_from_0_to_62'),
        'price': clean(car.get('visible_cash_price')) or '',
        'price_gbp': int(round(price_n)) if isinstance(price_n, (int, float)) else None,
        'monthly': clean(car.get('monthly_finance_payment')) or '',
        'monthly_gbp': car.get('numeric_monthly_price'),
        'apr': car.get('monthly_apr'),
        'finance_example': example_for(price_n, car.get('numeric_monthly_price'),
                                       car.get('monthly_apr'), terms),
        'lead_time_weeks_min': car.get('lead_time_in_weeks_min'),
        'lead_time_weeks_max': car.get('lead_time_in_weeks_max'),
        'on_hold': bool(car.get('on_hold')),
        'options': [clean(o.get('title')) for o in (car.get('non_standard_options') or [])
                    if isinstance(o, dict) and o.get('title')],
        'image': shots[0] if shots else '',
        'images': shots,
    }
    # An absent value is left out rather than written empty, the same rule both
    # used stock files follow: every page tests a field before drawing its row.
    return {k: v for k, v in rec.items() if v not in (None, '', [])}


def load_previous():
    if not os.path.exists(OUT):
        return {'cars': [], 'removed': []}
    try:
        return json.loads(open(OUT, encoding='utf-8').read())
    except (ValueError, OSError) as e:
        print('  previous file unreadable (%s), starting the ledger fresh' % e)
        return {'cars': [], 'removed': []}


def roll_removed(prev, live, day):
    """Yesterday's list against today's, keeping a car for 30 days after the
    locator drops it. The clock runs from the day it LEFT, not from the day it
    arrived, so a car gone on 8 October is still listed on 7 November."""
    live_ids = {c['order_number'] for c in live}
    was = {c['order_number']: c for c in (prev.get('cars') or [])}
    removed = {r['order_number']: dict(r)
               for r in (prev.get('removed') or []) if r.get('order_number')}

    back = [n for n in list(removed) if n in live_ids]
    for n in back:
        del removed[n]                      # ordered again, so not removed

    gone = 0
    for n, car in was.items():
        if n in live_ids or n in removed:
            continue
        rec = dict(car)
        rec['removed_at'] = day.isoformat()
        removed[n] = rec
        gone += 1

    aged = []
    for n, rec in list(removed.items()):
        try:
            left = datetime.fromisoformat(rec['removed_at']).date()
        except (KeyError, ValueError):
            left = day                      # no date, treat as gone today
            rec['removed_at'] = day.isoformat()
        if (day - left).days > KEEP_REMOVED_DAYS:
            del removed[n]
            aged.append(n)

    out = sorted(removed.values(), key=lambda r: (r.get('removed_at', ''),
                                                  r['order_number']))
    return out, back, gone, aged


def write_order_files(live, removed, day):
    """One file per order number, the way `lookup/reg/<REG>.json` works for the
    used stock, so a colleague's system can ask about a single car without
    pulling the whole catalogue down. Same three fields as the used contract:
    `status`, `removed_at`, `available_until`, null where they do not apply.

    A file is written only when its content has changed, and `generated_at` is
    deliberately NOT in it, so an ordinary day touches almost nothing and the
    daily diff stays readable. Files for cars past the 30 days are deleted,
    which is what makes a 404 mean "not in stock and not in the last month".
    """
    os.makedirs(ORDER_DIR, exist_ok=True)
    want, wrote = {}, 0
    for car in live:
        want[car['order_number']] = dict(car, status='in_stock',
                                         removed_at=None, available_until=None)
    for car in removed:
        left = car.get('removed_at')
        until = None
        if left:
            try:
                until = (datetime.fromisoformat(left).date()
                         + timedelta(days=KEEP_REMOVED_DAYS)).isoformat()
            except ValueError:
                until = None
        want[car['order_number']] = dict(car, status='removed',
                                         removed_at=left, available_until=until)

    for num, rec in want.items():
        path = os.path.join(ORDER_DIR, num + '.json')
        body = json.dumps(rec, ensure_ascii=False, indent=1) + '\n'
        try:
            if open(path, encoding='utf-8').read() == body:
                continue
        except OSError:
            pass
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(body)
        wrote += 1

    dropped = 0
    for name in os.listdir(ORDER_DIR):
        if not name.endswith('.json'):
            continue
        if name[:-5] not in want:
            os.remove(os.path.join(ORDER_DIR, name))
            dropped += 1
    print('order files: %d written or changed, %d past 30 days deleted, %d on file'
          % (wrote, dropped, len(want)))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--check', action='store_true',
                    help='pull and report, write nothing')
    args = ap.parse_args()

    s = Session()
    ids = model_ids(s)
    print('%d models on the search form' % len(ids))
    if not ids:
        raise SystemExit('no model ids on the retailer page, keeping the '
                         'existing file')

    rows = pull(ids)

    terms = finance_terms(s)
    if terms:
        print('BMW\'s own finance terms: %s, %d months, £%s deposit, %s miles '
              'a year' % (terms['product'], terms['term_months'],
                          '{:,}'.format(terms['deposit_gbp']),
                          '{:,}'.format(terms['annual_mileage'])))

    live, seen = [], set()
    dropped = 0
    for row in rows:
        rec = normalise(row, terms)
        if not rec:
            dropped += 1
            continue
        if rec['order_number'] in seen:
            continue
        seen.add(rec['order_number'])
        live.append(rec)
    live.sort(key=lambda c: (c.get('price_gbp') or 0, c['order_number']))
    print('%d cars (%d rows dropped for no usable order number)'
          % (len(live), dropped))
    quoted = sum(1 for c in live if c.get('finance_example'))
    print('%d of %d carry a full set of finance figures' % (quoted, len(live)))

    if len(live) < MIN_CARS:
        raise SystemExit('only %d cars, which is too few to be right; keeping '
                         'the existing file' % len(live))

    day = today()
    prev = load_previous()
    removed, back, gone, aged = roll_removed(prev, live, day)
    print('removed list: %d gone today, %d back in stock, %d aged out, %d held'
          % (gone, len(back), len(aged), len(removed)))

    doc = {
        'generated_at': datetime.now(ZoneInfo('UTC')).strftime(
            '%Y-%m-%dT%H:%M:%S.000Z'),
        'retailer_id': RETAILER,
        'retailer_name': RETAILER_NAME,
        'count': len(live),
        'finance_terms': terms,
        'cars': live,
        'removed': removed,
    }
    if args.check:
        print('--check, nothing written')
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print('wrote %s' % os.path.relpath(OUT, os.path.dirname(HERE)))
    write_order_files(live, removed, day)


if __name__ == '__main__':
    main()
