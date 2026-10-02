#!/usr/bin/env python3
"""One row per BMW model, for the "which BMW suits me" quiz.

Joins the four things we hold and turns them into the handful of answers a
customer's questions actually reduce to:

    hedin-stock-snapshot.json  Dan's own forecourt, per car
    hedin-group-stock.json     the rest of the group, per car
    car-details.json           boot, kerb weight, power, CO2, electric range
    bmw-model-specs.json       length, width, height, wheelbase (researched)

Writes `bmw-models.json` for the quiz and `bmw-models.csv` so a change is
readable in a diff and openable in a spreadsheet.

**Everything measured comes from a figure, not from an impression.** Where a
judgement is made - whether five adults are comfortable, how quick the car
feels - the rule is written down here in one place, applied to real dimensions,
and recorded in the output next to the figures it came from, so Dan can disagree
with the rule rather than having to guess what it was.

The two judgements worth stating:

* **Five adults in comfort needs width AND wheelbase**, not length. The test is
  1,950mm across and a 2,970mm wheelbase, and it was fitted to Dan's own
  ruling that this means "X5 and above": it passes the X5, X6, X7, XM, iX,
  7 Series and i7, and stops at the 5 Series, which is longer than an X5 but
  104mm narrower across the back seat. Length alone would have waved the
  5 Series and the i5 through.
* **Pace is power per tonne**, from Hedin's own power and kerb weight for that
  car, never from the badge. A 2.5 tonne X5 40d and a 1.5 tonne 120 both read
  "quick" off their horsepower alone and do not feel remotely alike.

    python3 automation/model-table.py [--quiet]
"""
import argparse, csv, json, os, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SNAP = os.path.join(HERE, 'hedin-stock-snapshot.json')
GROUP = os.path.join(HERE, 'hedin-group-stock.json')
DETAIL = os.path.join(HERE, 'car-details.json')
SPECS = os.path.join(HERE, 'bmw-model-specs.json')
OUT_JSON = os.path.join(HERE, 'bmw-models.json')
OUT_CSV = os.path.join(HERE, 'bmw-models.csv')

# Five adults in comfort. Fitted to Dan's "X5 and above": see the module note.
FIVE_ADULTS_MM = (1950, 2970)       # width, wheelbase
# Four adults without anybody apologising.
FOUR_ADULTS_MM = (1790, 2650)
# A buggy and the weekly shop. 2 Series Gran Coupe is 430l and passes; an i3 at
# 260l does not.
FAMILY_BOOT_L = 400

PACE = ((300, 'very fast'), (220, 'fast'), (170, 'quick'),
        (130, 'brisk'), (0, 'relaxed'))

SIZE = ((5100, 'limousine'), (4800, 'large'), (4600, 'mid size'),
        (4400, 'compact'), (0, 'small'))


def load(path, default):
    if not os.path.exists(path):
        print('note: %s is missing' % os.path.basename(path))
        return default
    try:
        return json.load(open(path))
    except ValueError:
        print('note: %s will not parse' % os.path.basename(path))
        return default


def num(v):
    """A figure out of the snapshot's own display strings ("38,769 miles")."""
    s = ''.join(ch for ch in str(v or '') if ch.isdigit() or ch == '.')
    try:
        return float(s)
    except ValueError:
        return None


def family(car):
    """The key this car joins the dimensions table on.

    The snapshot's `series` is right for most of the range, but three families
    have bodies of genuinely different size and shape under one series, and a
    quiz that cannot tell a 2 Series Coupe from an Active Tourer is no use to
    somebody choosing between them. The i3s carry no series at all.
    """
    s = (car.get('series') or '').strip()
    m = (car.get('model') or '')
    if not s:
        return 'i3' if 'i3' in m else None
    if s == '2 Series':
        if 'Gran Coupe' in m or 'Gran Coupé' in m:
            return '2 Series GC'
        if 'Tourer' in m:
            return '2 Series AT'
    return s


def band(table, v):
    if v is None:
        return None
    for floor, name in table:
        if v >= floor:
            return name
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()

    home = load(SNAP, [])
    group = load(GROUP, [])
    det = load(DETAIL, {})
    specs = load(SPECS, {})
    if not home or not specs:
        sys.exit('need the stock snapshot and the dimensions table')

    for c in home:
        c['_home'] = True
    cars = home + group

    rows, unmatched = {}, {}
    for c in cars:
        k = family(c)
        if not k:
            unmatched[c.get('model') or '?'] = unmatched.get(c.get('model') or '?', 0) + 1
            continue
        rows.setdefault(k, []).append(c)

    out = {}
    for k, group_cars in sorted(rows.items()):
        sp = specs.get(k) or {}
        if not sp.get('length_mm') and not a.quiet:
            print('note: no dimensions for %s, size questions cannot use it' % k)

        prices = [p for p in (num(c.get('price')) for c in group_cars) if p]
        years = [int(y) for y in (c.get('year') for c in group_cars) if str(y).isdigit()]
        d = [det.get(c.get('id')) or {} for c in group_cars]
        boots = [x['boot_l'] for x in d if x.get('boot_l')]
        powers = [x['power_hp'] for x in d if x.get('power_hp')]
        weights = [x['weight_kg'] for x in d if x.get('weight_kg')]
        co2 = [x['co2_gkm'] for x in d if x.get('co2_gkm')]
        evm = [x['ev_miles'] for x in d if x.get('ev_miles')]
        seats = sorted({x['seats'] for x in d if x.get('seats')})
        fuels = sorted({c.get('fuelGroup') for c in group_cars if c.get('fuelGroup')})

        # Power per tonne, car by car, then the best and typical of them. Done
        # per car and not off the averages, or a heavy variant and a powerful
        # one would be read as the same car.
        ppt = [round(x['power_hp'] / (x['weight_kg'] / 1000.0))
               for x in d if x.get('power_hp') and x.get('weight_kg')]

        w, wb = sp.get('width_mm'), sp.get('wheelbase_mm')
        five = bool(w and wb and w >= FIVE_ADULTS_MM[0] and wb >= FIVE_ADULTS_MM[1])
        four = bool(w and wb and w >= FOUR_ADULTS_MM[0] and wb >= FOUR_ADULTS_MM[1])

        r = {
            'name': sp.get('name') or k,
            'body': sp.get('body') or (group_cars[0].get('body') or ''),
            'in_stock_dan': sum(1 for c in group_cars if c.get('_home')),
            'in_stock_group': sum(1 for c in group_cars if not c.get('_home')),
            'fuels': fuels,
            'seats': seats,
            'years': [min(years), max(years)] if years else [],
            'price_from': int(min(prices)) if prices else None,
            'price_to': int(max(prices)) if prices else None,
            'price_typical': int(statistics.median(prices)) if prices else None,
        }
        for key, vals in (('boot_l', boots), ('power_hp', powers),
                          ('weight_kg', weights), ('co2_gkm', co2),
                          ('ev_miles', evm), ('hp_per_tonne', ppt)):
            if vals:
                r[key + '_min'] = int(min(vals))
                r[key + '_max'] = int(max(vals))
        for key in ('length_mm', 'width_mm', 'height_mm', 'wheelbase_mm'):
            if sp.get(key):
                r[key] = sp[key]
        r['dims_source'] = sp.get('source', '')
        r['dims_generation'] = sp.get('generation', '')
        r['size_class'] = band(SIZE, sp.get('length_mm'))
        r['pace_best'] = band(PACE, max(ppt)) if ppt else None
        r['pace_typical'] = band(PACE, int(statistics.median(ppt))) if ppt else None
        r['five_adults'] = five
        r['four_adults'] = four
        r['seven_seats'] = 7 in seats
        r['family_boot'] = bool(boots and max(boots) >= FAMILY_BOOT_L)
        # Two child seats plus two adults in the front: five seats, a back seat
        # wide enough and a boot that takes a buggy. Not the same question as
        # five adults, and far more people ask it.
        r['two_seats_two_adults'] = bool(
            5 in seats or 7 in seats) and four and r['family_boot']
        r['plug'] = bool(set(fuels) & {'Electric', 'Plug-in hybrid'})
        r['electric'] = 'Electric' in fuels
        out[k] = r

    with open(OUT_JSON, 'w') as fh:
        fh.write('{\n')
        keys = sorted(out)
        for n, k in enumerate(keys):
            fh.write(' %s: %s%s\n' % (json.dumps(k), json.dumps(out[k], sort_keys=True),
                                      ',' if n < len(keys) - 1 else ''))
        fh.write('}\n')

    cols = ['key'] + sorted({c for r in out.values() for c in r})
    with open(OUT_CSV, 'w', newline='') as fh:
        wr = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore')
        wr.writeheader()
        for k in sorted(out):
            row = {'key': k}
            for c, v in out[k].items():
                row[c] = ' / '.join(str(x) for x in v) if isinstance(v, list) else v
            wr.writerow(row)

    print('wrote %d models to %s and %s'
          % (len(out), os.path.basename(OUT_JSON), os.path.basename(OUT_CSV)))
    if unmatched:
        print('not matched to a family: %s'
              % ', '.join('%s x%d' % (k, v) for k, v in sorted(unmatched.items())))


if __name__ == '__main__':
    main()
