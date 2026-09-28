#!/usr/bin/env python3
"""Snapshot the wider Hedin used stock - everything that is not already in the
Ruxley snapshot.

    python3 automation/group-stock.py

Writes `automation/hedin-group-stock.json`, which `stock.html` loads behind the
"unlock our other stock" button underneath the Ruxley list.

Two things this file deliberately does NOT carry.

**Where a car is.** Hedin's payload gives `car_site_city` for every record and
it is used here only to exclude the Ruxley cars, never written out. This repo
is public, so a branch written into the file is a branch published to anyone
who fetches it - and the whole point of the button is that an enquiry comes to
Dan rather than walking into another site. The Hedin listing each card links to
says where the car is, which is Hedin's to publish, not ours.

**A finance figure.** Quotes come from BMW Financial Services through the
Codeweavers path and are keyed by listing id in `stock-finance.json`; nothing
here is in it, so every one of these cards falls back to "message me for a
quote", which is the honest answer for a car we have no lender quote on. Do not
extend the quote job to cover this file to fill the gap - most of it is not
even BMW.

The Ruxley snapshot is left completely alone: same file, same fields, same
daily job. This is a second file beside it, so a failure here cannot cost the
list Dan actually sends.
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SNAP  = os.path.join(HERE, 'hedin-stock-snapshot.json')
OUT   = os.path.join(HERE, 'hedin-group-stock.json')
LIST  = 'https://hedinautomotive.co.uk/buy-car/used-cars/all-used-cars'
CAR   = LIST.rsplit('/', 1)[0]     # a single car is /buy-car/used-cars/<id>/<slug>
BRAND = 'BMW'   # the only marque this list carries - see the filter in main()
UA    = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
         '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')

# The list page paginates at 48. Asking for a page well past the end returns
# the lot, so the whole group comes back in one request and no car needs a
# visit of its own - the payload already carries its photo.
PAGE = 40


def fetch(url, minimum=50000):
    """`minimum` is a floor on the response size: a truncated page parses to
    nothing in particular rather than failing, so a short body is treated as a
    failed fetch instead of quietly producing an empty car."""
    r = subprocess.run(['curl', '-sS', '--http1.1', '--max-time', '180',
                        '-A', UA, '-H', 'Accept: text/html', url],
                       capture_output=True, text=True)
    if r.returncode != 0 or len(r.stdout) < minimum:
        raise SystemExit('fetch failed for %s: rc=%s %db %s'
                         % (url, r.returncode, len(r.stdout), r.stderr[-200:]))
    return r.stdout


def car_objects(html):
    """Every {"car_...} object, by balanced braces.

    The rendered list only ever shows 48 cars behind a "Show more", so reading
    the visible page is how cars go missing. The full set is in the HTML as
    JSON, and this walks it with the string and escape states tracked, because
    a model name with a brace or a quote in it would otherwise end the object
    early and silently drop that car.
    """
    out, i = [], 0
    while True:
        i = html.find('{"car_', i)
        if i < 0:
            return out
        depth, j, instr, esc = 0, i, False, False
        while j < len(html):
            c = html[j]
            if esc:
                esc = False
            elif instr:
                if c == '\\':
                    esc = True
                elif c == '"':
                    instr = False
            else:
                if c == '"':
                    instr = True
                elif c == '{':
                    depth += 1
                elif c == '}':
                    depth -= 1
                    if depth == 0:
                        j += 1
                        break
            j += 1
        try:
            out.append(json.loads(html[i:j]))
        except ValueError:
            pass
        i = j


def stated_total(html, shown):
    """The site's own "288 of 616", read against the number of cars actually on
    that page.

    The HTML carries several unrelated "x of y" pairs, so the total cannot just
    be the largest one - a stray "3 of 672" was enough to make this refuse a
    complete list as short. The pair that means stock is the one whose first
    number is the count on the page.

    It disappears once everything fits on one page, which is why the total is
    read from a deliberately short page and the full list checked against it.
    """
    for a, b in re.findall(r'(\d+)\s*of\s*(\d+)', html):
        if int(a) == shown and int(b) >= shown:
            return int(b)
    return None


# --- BMW series, same rules the Ruxley snapshot uses so one dropdown serves
#     both lists. Anything not a BMW simply has no series. ---
def series_of(brand, model):
    if brand != 'BMW':
        return None
    m = (model or '').strip()
    for tok in ('iX1', 'iX2', 'iX3', 'iX'):
        if m.startswith(tok):
            return tok
    if re.match(r'^i[4577]\b', m):
        return m[:2]
    if m.startswith('XM'):
        return 'XM'
    r = re.match(r'^X([1-7])', m)
    if r:
        return 'X' + r.group(1)
    r = re.match(r'^Z([0-9])', m)
    if r:
        return 'Z' + r.group(1)
    r = re.match(r'^M(\d)\d\d', m)          # M340i, M440i
    if r:
        return r.group(1) + ' Series'
    r = re.match(r'^M([1-8])\b', m)         # M2, M3, M135
    if r:
        return r.group(1) + ' Series'
    r = re.match(r'^(\d)\d\d', m)           # 118i, 320d, 840i
    if r:
        return r.group(1) + ' Series'
    return None


# --- Fuel. Hedin call every 48V mild hybrid "Hybrid", petrol and diesel
#     alike, so the raw word is kept and the group derived from BMW's naming:
#     a `d` straight after the model number means diesel, on a BMW (320d, X5
#     xDrive30d) and on a Mercedes (A200d, C220d) alike. Everything else Hedin
#     calls "Hybrid" on those two and on MINI is a petrol mild hybrid - checked
#     rather than assumed: of the 125 such cars in stock when this was written,
#     not one carried a d-suffix. A marque whose naming is not known to follow
#     that rule is left ungrouped rather than guessed at, and simply does not
#     answer the fuel filter. ---
MILD_HYBRID_IS_PETROL = ('BMW', 'Mercedes-Benz', 'MINI')


def fuel_of(brand, raw, name):
    raw = (raw or '').strip()
    direct = {'Electric': ('Electric', 'Electric'),
              'Plug in hybrid': ('Plug-in hybrid', 'Plug-in hybrid'),
              'Petrol': ('Petrol', 'Petrol'),
              'Diesel': ('Diesel', 'Diesel')}
    if raw in direct:
        return direct[raw]
    if raw == 'Hybrid':
        if re.search(r'\b[A-Za-z]*\d{2,3}d\b', name or '') or \
           re.search(r'\bxDrive\d{2}d\b', name or ''):
            return ('Diesel', 'Diesel (mild hybrid)')
        if brand in MILD_HYBRID_IS_PETROL:
            return ('Petrol', 'Petrol (mild hybrid)')
        return (None, 'Hybrid')
    return (None, raw or None)


# Trailing registration-document noise on Hedin's long model strings:
# "... Euro 6 (s/s) 5dr", "... Hatchback 5dr", "... SUV 5dr Petrol Hybrid DCT".
TAIL = re.compile(
    r'\s+(?:Euro\s*\d.*|(?:Hatchback|Saloon|Estate|Coupe|Coupé|Cabriolet|'
    r'Convertible|SUV|Tourer|Touring|MPV)\b.*|\d\s*dr\b.*)$', re.I)


def display_name(brand, model, text):
    text = (text or '').strip()
    model = (model or '').strip()
    name = text if model and text.lower().startswith(model.lower()) else \
        (model + ' ' + text).strip()
    name = TAIL.sub('', name).strip(' -,')
    name = re.sub(r'\s{2,}', ' ', name)
    if not name:
        name = model
    return ('%s %s' % (brand, name)).strip()


SPEC_FIELDS = ('colour', 'body', 'seats', 'doors', 'power', 'gearbox',
               'drive', 'trim')


def listing_spec(cid):
    """Colour, body, seats and the rest, off the car's own listing page.

    The unfiltered list page does not carry any of it - only the Ruxley feed
    does - and without it the colour, body style and seats filters silently
    dropped every unlocked car. Somebody would open the extra stock, pick
    "Estate", and be shown Dan's own cars only, which reads as a broken button.

    One fetch a car, so it is only done for cars that are new to the file; the
    rest carry their spec across from yesterday, the same way the Ruxley job
    carries an image across. First run is a few minutes, after that a handful.
    The listing page also gives a far cleaner model name than the list page's
    registration-document string, so that is taken here too.
    """
    html = fetch('%s/%s/x' % (CAR, cid), minimum=20000)

    def field(key):
        m = re.search(r'"car_%s":\s*("(?:[^"\\]|\\.)*"|[0-9.]+)' % key, html)
        if not m:
            return None
        try:
            v = json.loads(m.group(1))
        except ValueError:
            return None
        return v.replace(' ', ' ').strip() if isinstance(v, str) else v

    out = {}
    for key, want in (('color', 'colour'), ('body', 'body'), ('seats', 'seats'),
                      ('doors', 'doors'), ('power_text', 'power'),
                      ('gearbox', 'gearbox'), ('drive', 'drive'),
                      ('trim_package', 'trim')):
        v = field(key)
        if v not in (None, ''):
            out[want] = str(v)
    mt = field('model_text')
    if mt:
        out['model_text'] = mt
    if not out:
        # the page came back big enough to look fine but carried none of the
        # fields - a redirect or an error page rendering as a full site shell.
        # Better to fail the car than to record it as having no spec, which
        # would stop tomorrow's run ever retrying it.
        raise SystemExit('listing %s carried no car_ fields' % cid)
    return out


def main():
    known = set()
    if os.path.exists(SNAP):
        known = {c.get('id') for c in json.load(open(SNAP))}
    if not known:
        raise SystemExit('Ruxley snapshot is missing or empty - refusing to run, '
                         'because with nothing to exclude the group file would '
                         'duplicate the whole of the main list')

    # One short page purely to read the site's own total, then the whole list.
    # Asking the full page for its total does not work: once every car fits,
    # the "x of y" counter stops being printed.
    probe = fetch('%s?page=2' % LIST)
    pshown = len({c['car_id'] for c in car_objects(probe) if c.get('car_id')})
    total = stated_total(probe, pshown)
    if not total:
        raise SystemExit('could not read the site total from the first page - '
                         'the list markup has changed; leaving the file alone')

    html = fetch('%s?page=%d' % (LIST, PAGE))
    cars = {c['car_id']: c for c in car_objects(html) if c.get('car_id')}
    print('parsed %d distinct cars (site says %d)' % (len(cars), total))
    if len(cars) < total:
        raise SystemExit('only %d of the site\'s %d cars parsed - refusing to '
                         'write a short list over a good one' % (len(cars), total))

    # Yesterday's file, so a car already on it keeps its spec without another
    # visit to its listing page.
    seen = {}
    if os.path.exists(OUT):
        try:
            seen = {r['id']: r for r in json.load(open(OUT)) if r.get('id')}
        except (ValueError, KeyError):
            seen = {}

    rows, skipped, other_brand, fetched, failed = [], 0, 0, 0, 0
    for cid, c in cars.items():
        if cid in known:            # already in the Ruxley list Dan sends
            skipped += 1
            continue
        brand = (c.get('car_brand') or '').strip()
        # BMW only (Dan's ruling). The group sells Mercedes-Benz, MINI and
        # smart from the same site, and the page this feeds is Dan's BMW stock
        # list: a Mercedes turning up behind the button is not what somebody
        # who came for a BMW is asking to see.
        if brand != BRAND:
            other_brand += 1
            continue
        # The spec the filters need lives on the car's own listing page, so it
        # is carried across for a car we already had and fetched once for a new
        # one. `colour` is the marker: a record without it never got enriched.
        old = seen.get(cid)
        spec = {}
        if old and old.get('colour'):
            spec = {k: old[k] for k in SPEC_FIELDS if old.get(k)}
            if old.get('_modelText'):
                spec['model_text'] = old['_modelText']
        else:
            try:
                spec = listing_spec(cid)
                fetched += 1
            except SystemExit as e:
                # one unreachable listing must not cost the whole run - the car
                # still goes in, just without the spec the filters read
                failed += 1
                print('  %s: no spec (%s)' % (cid, str(e)[:70]))

        name = display_name(brand, c.get('car_model'),
                            spec.get('model_text') or c.get('car_model_text'))
        group, label = fuel_of(brand, c.get('car_fuel'), name)
        img = (c.get('car_primary_image') or {})
        # Hedin put a non-breaking space in the mileage here but a plain one in
        # the Ruxley feed. The page strips a trailing " miles" off the figure
        # before drawing it, and that match fails on the nbsp - so the word
        # ends up printed twice under a "Mileage" heading.
        miles = (c.get('car_mileage_text') or '').replace(' ', ' ').strip()
        rec = {
            'id': cid,
            'brand': brand,
            'model': name,
            'series': series_of(brand, c.get('car_model')),
            'year': str(c.get('car_year') or ''),
            'reg': c.get('car_regno') or '',
            'mileage': miles,
            'fuel': label,
            'fuelGroup': group,
            'fuelRaw': c.get('car_fuel') or '',
            'colour': spec.get('colour', ''),
            'body': spec.get('body', ''),
            'power': spec.get('power', ''),
            'gearbox': spec.get('gearbox') or c.get('car_gearbox') or '',
            'drive': spec.get('drive', ''),
            'seats': spec.get('seats', ''),
            'doors': spec.get('doors', ''),
            'trim': spec.get('trim', ''),
            'price': c.get('car_price_text') or '',
            # kept so tomorrow's run can tell an enriched record from a bare
            # one and reuse the better model name without re-fetching
            '_modelText': spec.get('model_text', ''),
            'image': img.get('thumbnail_url') or img.get('url') or '',
            'url': '%s/%s/%s' % (CAR, cid, c.get('slug') or ''),
        }
        # An absent value is left out rather than written empty, the same rule
        # the Ruxley snapshot follows - the page tests each field before it
        # draws a row, so a missing one costs a line, not a broken card.
        rows.append({k: v for k, v in rec.items() if v not in (None, '')})

    if len(rows) < 50:
        raise SystemExit('only %d %s outside Ruxley - that is too few to be '
                         'right, leaving the existing file alone'
                         % (len(rows), BRAND))
    if any(r.get('brand') != BRAND for r in rows):
        raise SystemExit('a non-%s slipped through the brand filter - '
                         'refusing to write it' % BRAND)

    rows.sort(key=lambda r: int(re.sub(r'[^0-9]', '', r.get('price', '')) or 0))
    with open(OUT, 'w') as fh:
        fh.write('[\n')
        fh.write(',\n'.join('  ' + json.dumps(r, ensure_ascii=False) for r in rows))
        fh.write('\n]\n')

    print('wrote %d %s to %s (%d already in the Ruxley list, %d other marques '
          'left out)' % (len(rows), BRAND, os.path.relpath(OUT), skipped,
                         other_brand))
    nospec = sum(1 for r in rows if not r.get('colour'))
    print('spec: %d fetched, %d carried over, %d without one%s'
          % (fetched, len(rows) - fetched - failed, nospec,
             ' (%d fetches failed)' % failed if failed else ''))
    nofuel = sum(1 for r in rows if not r.get('fuelGroup'))
    if nofuel:
        print('%d cars left unclassified for fuel (filter will not catch them)'
              % nofuel)


if __name__ == '__main__':
    main()
