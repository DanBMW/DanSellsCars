#!/usr/bin/env python3
"""Refresh the Ruxley used-stock snapshot (Part One of the morning job).

    python automation/stock-snapshot.py            # write the snapshot
    python automation/stock-snapshot.py --check    # fetch and report, write nothing

Replaces the step that used to be done by Claude: fetch the raw HTML of the
Hedin list page (NOT the rendered page, which shows only 48 cars behind a
"Show more"), pull every {"car_...} object out of it, keep the Ruxley BMWs,
check the count against the site's own stated total, and write
`automation/hedin-stock-snapshot.json` in exactly the shape the stock page,
the board and the WhatsApp assistant already read: one compact record per
line, same field order, an absent value left out rather than written empty.

Refuses to write (leaving yesterday's file alone) when:
  - the parsed count differs from the site's stated total
  - any record is not Ruxley / BMW
  - the list is under 60% of yesterday's count

Sanity-check failures (plate/year mismatch, i-model not electric, duplicate
ids or regs, unclassified fuel, unmapped series) are printed as warnings.

Exit codes: 0 ok, 1 refused / failed.  Last stdout lines are machine readable:
    NEW <id> <model> ...      SOLD <id> <model> ...
"""
import importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'hedin-stock-snapshot.json')
LIST = ('https://hedinautomotive.co.uk/buy-car/used-cars/all-used-cars'
        '?car_brand=BMW&car_website_city=Ruxley&page=2')
CAR = 'https://hedinautomotive.co.uk/buy-car/used-cars'

# group-stock.py already has the fetcher, the brace-matching parser and the
# series / fuel rules, so reuse them rather than keep a second copy.
_spec = importlib.util.spec_from_file_location('group_stock', os.path.join(HERE, 'group-stock.py'))
gs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gs)

ORDER = ['id', 'model', 'series', 'year', 'reg', 'mileage', 'colour', 'fuel',
         'fuelGroup', 'fuelRaw', 'body', 'power', 'gearbox', 'drive', 'seats',
         'doors', 'trim', 'price', 'image', 'url']


def nb(s):
    # ordinary whitespace only: the snapshot keeps Hedin's own non-breaking
    # spaces in mileage and power, so leave them exactly as sent
    return (s or '').strip(' \t\r\n')


def record(c):
    cid = str(c['car_id'])
    model_text = nb(c.get('car_model_text'))
    name = 'BMW ' + model_text
    group, label = gs.fuel_of('BMW', c.get('car_fuel'), model_text)
    img = c.get('car_primary_image') or {}
    slug_model = nb(c.get('car_model')).lower().replace(' ', '-')
    rec = {
        'id': cid,
        'model': name,
        'series': gs.series_of('BMW', model_text),
        'year': str(c.get('car_year') or ''),
        'reg': c.get('car_regno') or '',
        'mileage': nb(c.get('car_mileage_text')),
        'colour': nb(c.get('car_color')),
        'fuel': label,
        'fuelGroup': group,
        'fuelRaw': c.get('car_fuel') or '',
        'body': nb(c.get('car_body')),
        'power': nb(c.get('car_power_text')),
        'gearbox': nb(c.get('car_gearbox')),
        'drive': nb(c.get('car_drive')),
        'seats': str(c.get('car_seats') or ''),
        'doors': str(c.get('car_doors') or ''),
        'trim': nb(c.get('car_trim_package')),
        'price': nb(c.get('car_retail_price_text')) or nb(c.get('car_price_text')),
        # re-read every morning for every car: Hedin delete old image files
        'image': img.get('thumbnail_url') or img.get('url') or '',
        'url': '%s/%s/pb-bmw-%s-%s' % (CAR, cid, slug_model, c.get('car_year')),
    }
    return {k: rec[k] for k in ORDER if rec.get(k) not in (None, '')}


SPEC = ('colour', 'body', 'power', 'gearbox', 'drive', 'seats', 'doors', 'trim')


def fill_missing(rows, old_by_id):
    """The list feed sometimes leaves a spec field empty on a car (colour is the
    usual one) and the finance cards and the stock page need them. A car's spec
    does not change, so take it from yesterday's record; for a new car, read its
    own listing page, exactly as group-stock.py does. Nothing is ever invented:
    a field neither source has is left out and reported."""
    for r in rows:
        gaps = [k for k in SPEC if not r.get(k)]
        if not gaps:
            continue
        prev = old_by_id.get(r['id'], {})
        for k in gaps:
            if prev.get(k):
                r[k] = prev[k]
        gaps = [k for k in SPEC if not r.get(k)]
        if gaps:
            try:
                spec = gs.listing_spec(r['id'])
                for k in gaps:
                    if spec.get(k):
                        r[k] = spec[k]
            except SystemExit as e:
                print('WARN %s: listing page read failed (%s)' % (r.get('reg') or r['id'], str(e)[:60]))
        gaps = [k for k in SPEC if not r.get(k)]
        if gaps:
            print('WARN %s: still no %s' % (r.get('reg') or r['id'], ', '.join(gaps)))
    for r in rows:      # keep the original field order after filling
        ordered = {k: r[k] for k in ORDER if k in r}
        r.clear(); r.update(ordered)


def plate_ok(reg, year):
    m = re.match(r'^[A-Z]{2}(\d{2})[A-Z]{3}$', (reg or '').replace(' ', '').upper())
    if not m or not year.isdigit():
        return True            # old-style or private plate: nothing to check
    code, y = int(m.group(1)), int(year)
    if code < 50:
        return y == 2000 + code
    return y in (2000 + code - 50, 2000 + code - 49)


def sanity(rows):
    warn = []
    for key in ('id', 'reg'):
        seen = {}
        for r in rows:
            v = r.get(key)
            if v and v in seen:
                warn.append('duplicate %s %s' % (key, v))
            seen[v] = 1
    for r in rows:
        who = r.get('reg') or r['id']
        if not r.get('series'):
            warn.append('%s: series not mapped (%s)' % (who, r['model']))
        if not r.get('fuelGroup'):
            warn.append('%s: fuel not classified (%s)' % (who, r.get('fuelRaw')))
        if not plate_ok(r.get('reg'), r.get('year', '')):
            warn.append('%s: plate does not match year %s' % (who, r.get('year')))
        if re.match(r'^BMW i[X0-9]', r['model']) and r.get('fuelGroup') != 'Electric':
            warn.append('%s: i-badged model not Electric' % who)
        if r.get('fuelGroup') == 'Diesel' and not re.search(r'\d{2,3}d\b', r['model']):
            warn.append('%s: Diesel without d-suffix model' % who)
        if r.get('body', '').lower().startswith('convertible') and r.get('seats') == '5':
            warn.append('%s: convertible with 5 seats' % who)
    return warn


def load_old():
    if not os.path.exists(OUT):
        return []
    txt = open(OUT, encoding='utf-8').read()
    return json.loads(txt) if txt.strip() else []


def main():
    check_only = '--check' in sys.argv
    html = gs.fetch(LIST, minimum=50000)
    objs = gs.car_objects(html)
    by_id = {}
    for c in objs:
        if c.get('car_id') is not None:
            by_id[str(c['car_id'])] = c
    cars = list(by_id.values())

    bad = [c for c in cars if c.get('car_site_city') != 'Ruxley' or c.get('car_brand') != 'BMW']
    if bad:
        raise SystemExit('REFUSED: %d records are not Ruxley BMW (e.g. %s)'
                         % (len(bad), bad[0].get('car_id')))

    total = gs.stated_total(html, len(cars))
    if total is None:
        raise SystemExit('REFUSED: could not find the site\'s stated total to check %d cars against' % len(cars))
    if total != len(cars):
        raise SystemExit('REFUSED: parsed %d distinct cars but the site says %d' % (len(cars), total))

    rows = [record(c) for c in cars]
    old = load_old()
    fill_missing(rows, {r['id']: r for r in old})
    # keep yesterday's order so the daily diff stays readable; new cars go last
    pos = {r['id']: n for n, r in enumerate(old)}
    rows.sort(key=lambda r: pos.get(r['id'], len(pos)))
    if old and len(rows) < 0.6 * len(old):
        raise SystemExit('REFUSED: %d cars against %d yesterday' % (len(rows), len(old)))

    # fields the stock page, the board and the finance cards cannot live without
    missing = [(r.get('reg') or r['id'], k) for r in rows for k in ('price', 'url', 'model') if not r.get(k)]
    if missing:
        first = missing[0][0]
        sample = next((c for c in cars if str(c['car_id']) == first or c.get('car_regno') == first), {})
        keys = {k: v for k, v in sample.items() if 'pric' in k.lower() or 'cost' in k.lower() or 'amount' in k.lower()}
        raise SystemExit('REFUSED: %d records missing a required field (e.g. %s lacks %s). '
                         'Price-like fields on that car: %s. All its fields: %s' % (
                             len(missing), first, missing[0][1], keys, sorted(sample)))

    for w in sanity(rows):
        print('WARN', w)

    old_ids = {r['id']: r for r in old}
    new_ids = {r['id']: r for r in rows}
    arrived = [r for i, r in new_ids.items() if i not in old_ids]
    sold = [r for i, r in old_ids.items() if i not in new_ids]
    noimg = [r.get('reg') or r['id'] for r in rows if not r.get('image')]

    print('parsed %d cars, site total %d: count check passed' % (len(rows), total))
    if noimg:
        print('WARN %d cars without an image: %s' % (len(noimg), ', '.join(noimg)))

    if not check_only:
        with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write('[\n')
            fh.write(',\n'.join('  ' + json.dumps(r, ensure_ascii=False) for r in rows))
            fh.write('\n]\n')
        print('wrote', os.path.relpath(OUT))
    for r in arrived:
        print('NEW %s | %s | %s | %s | %s | %s | %s | %s' % (
            r['id'], r['model'], r.get('year'), r.get('mileage'), r.get('colour'),
            r.get('fuel'), r.get('price'), r.get('url')))
    for r in sold:
        print('SOLD %s | %s | %s | %s' % (r['id'], r['model'], r.get('reg'), r.get('price')))


if __name__ == '__main__':
    main()
