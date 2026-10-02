#!/usr/bin/env python3
"""The BMW model data as a workbook, for Dan to read and to argue with.

Four sheets:

    Models          one row a model family: size, boot, pace, fit, price range
    Cars in stock   one row a car, every figure we hold for it
    Stock history   the 12 daily snapshots in git, and how long each car has
                    been on the forecourt
    Notes           where each figure comes from, and every rule and caveat

Everything here is rebuilt from the files in this folder, so the workbook is a
view and never the master copy: re-run it after a stock refresh. The scoring
rules it documents live in `model-table.py`, so changing a rule means changing
it there and running both.

    python3 automation/model-workbook.py
"""
import json, os, subprocess, sys
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'bmw-model-data.xlsx')
REPO = os.path.dirname(HERE)
SNAP_REL = 'automation/hedin-stock-snapshot.json'

FONT = 'Arial'
HEAD_FILL = PatternFill('solid', fgColor='16222E')
HEAD_FONT = Font(name=FONT, bold=True, color='FFFFFF', size=10)
BODY = Font(name=FONT, size=10)
BOLD = Font(name=FONT, size=10, bold=True)
NOTE = Font(name=FONT, size=10, italic=True, color='555555')
TITLE = Font(name=FONT, size=14, bold=True)
EDIT_FILL = PatternFill('solid', fgColor='FFF9D6')
THIN = Side(style='thin', color='D8DEE6')
BOX = Border(bottom=THIN)


def load(name, default):
    p = os.path.join(HERE, name)
    if not os.path.exists(p):
        print('note: %s is missing' % name)
        return default
    try:
        return json.load(open(p))
    except ValueError:
        print('note: %s will not parse' % name)
        return default


def num(v):
    s = ''.join(ch for ch in str(v or '') if ch.isdigit() or ch == '.')
    try:
        return float(s)
    except ValueError:
        return None


def head(ws, row, labels, widths=None):
    for i, t in enumerate(labels, 1):
        c = ws.cell(row=row, column=i, value=t)
        c.font, c.fill = HEAD_FONT, HEAD_FILL
        c.alignment = Alignment(wrap_text=True, vertical='bottom')
    if widths:
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = ws.cell(row=row + 1, column=1)


def put(ws, row, values, fmt=None):
    for i, v in enumerate(values, 1):
        c = ws.cell(row=row, column=i, value=v)
        c.font = BODY
        if fmt and fmt.get(i):
            c.number_format = fmt[i]


def git_snapshots():
    """Every committed version of the Ruxley snapshot, oldest first.

    This is the whole of the history available: the file is only as old as the
    first morning it was committed, which the Notes sheet states rather than
    leaving somebody to assume it goes back further.
    """
    log = subprocess.run(['git', '-C', REPO, 'log', '--reverse',
                          '--format=%H\t%ad', '--date=short', '--', SNAP_REL],
                         capture_output=True, text=True).stdout.strip()
    out = []
    for line in log.splitlines():
        h, _, d = line.partition('\t')
        blob = subprocess.run(['git', '-C', REPO, 'show', '%s:%s' % (h, SNAP_REL)],
                              capture_output=True, text=True).stdout
        try:
            cars = json.loads(blob)
        except ValueError:
            continue
        out.append((d, h[:7], {c['id']: c for c in cars if c.get('id')}))
    return out


def sheet_models(wb, models):
    ws = wb.create_sheet('Models')
    ws['A1'] = 'BMW models, one row each'
    ws['A1'].font = TITLE
    ws['A2'] = ('Sizes are the current generation of each model and come from the page named in '
                'the last column. Boot, power, weight, CO2 and electric range are the real range '
                'across the cars actually in stock, from Hedin own figures. Blank means we hold '
                'no figure, which is never the same as zero.')
    ws['A2'].font = NOTE
    ws.merge_cells('A2:T2')
    ws.row_dimensions[2].height = 30

    cols = ['Model', 'Body', 'Size class', 'Length mm', 'Width mm', 'Height mm',
            'Wheelbase mm', 'Boot litres (low)', 'Boot litres (high)', 'Seats',
            'Fuels available', '5 adults in comfort', '4 adults', '2 child seats + 2 adults',
            '7 seats', 'Pace (typical)', 'Pace (quickest)', 'hp per tonne (low)',
            'hp per tonne (high)', 'Price from', 'Price to', 'In stock, Dan',
            'In stock, group', 'Total in stock', 'Size source']
    w = [16, 11, 11, 9, 9, 9, 10, 10, 10, 8, 18, 11, 9, 12, 8, 11, 11, 10, 10,
         11, 11, 9, 10, 9, 26]
    head(ws, 4, cols, w)

    r = 5
    for k in sorted(models, key=lambda x: -(models[x].get('length_mm') or 0)):
        m = models[k]
        yn = lambda b: 'Yes' if b else 'No'
        put(ws, r, [
            m['name'], m['body'], m.get('size_class'),
            m.get('length_mm'), m.get('width_mm'), m.get('height_mm'),
            m.get('wheelbase_mm'), m.get('boot_l_min'), m.get('boot_l_max'),
            ' / '.join(str(s) for s in m.get('seats', [])),
            ', '.join(m.get('fuels', [])),
            yn(m['five_adults']), yn(m['four_adults']),
            yn(m['two_seats_two_adults']), yn(m['seven_seats']),
            m.get('pace_typical'), m.get('pace_best'),
            m.get('hp_per_tonne_min'), m.get('hp_per_tonne_max'),
            m.get('price_from'), m.get('price_to'),
            m['in_stock_dan'], m['in_stock_group'],
            '=V%d+W%d' % (r, r),
            m.get('dims_source'),
        ], fmt={20: '£#,##0', 21: '£#,##0'})
        for col in (12, 13, 14, 15):
            ws.cell(row=r, column=col).alignment = Alignment(horizontal='center')
        r += 1

    last = r - 1
    ws.cell(row=r, column=1, value='Totals').font = BOLD
    for col, letter in ((22, 'V'), (23, 'W'), (24, 'X')):
        c = ws.cell(row=r, column=col, value='=SUM(%s5:%s%d)' % (letter, letter, last))
        c.font = BOLD
    ws.cell(row=r + 2, column=1, value=(
        '"5 adults in comfort" is 1,950mm across AND a 2,970mm wheelbase, fitted to Dan own '
        'ruling that this means X5 and above. It deliberately excludes the 5 Series and i5, '
        'which are longer than an X5 but 104mm narrower across the back seat. Change the rule in '
        'automation/model-table.py, not here.')).font = NOTE
    ws.merge_cells(start_row=r + 2, start_column=1, end_row=r + 2, end_column=20)
    ws.cell(row=r + 3, column=1, value=(
        'Pace is horsepower per tonne using Hedin own power and kerb weight for each car, never '
        'the badge: relaxed under 130, brisk 130, quick 170, fast 220, very fast 300 and above.')
    ).font = NOTE
    ws.merge_cells(start_row=r + 3, start_column=1, end_row=r + 3, end_column=20)
    return ws


def sheet_cars(wb, cars, det, models):
    ws = wb.create_sheet('Cars in stock')
    ws['A1'] = 'Every car in stock today, with every figure we hold'
    ws['A1'].font = TITLE
    cols = ['Reg', 'Model', 'Family', 'Year', 'Price', 'Mileage', 'Colour',
            'Fuel', 'Body', 'Seats', 'Doors', 'Boot litres', 'Kerb kg',
            'Power hp', 'hp per tonne', 'CO2 g/km', 'Electric range miles',
            'Drive', 'Trim', 'First registered', 'Forecourt', 'Listing id']
    w = [10, 30, 12, 7, 11, 11, 10, 14, 11, 7, 7, 9, 9, 9, 11, 9, 11, 11, 13, 13, 11, 10]
    head(ws, 3, cols)
    for i, x in enumerate(w, 1):
        ws.column_dimensions[get_column_letter(i)].width = x

    r = 4
    for c in sorted(cars, key=lambda x: (not x.get('_home'), x.get('model') or '')):
        d = det.get(c.get('id')) or {}
        hp, kg = d.get('power_hp'), d.get('weight_kg')
        put(ws, r, [
            c.get('reg'), c.get('model'), c.get('_family'),
            int(c['year']) if str(c.get('year', '')).isdigit() else None,
            num(c.get('price')), num(c.get('mileage')), c.get('colour'),
            c.get('fuelGroup'), c.get('body'), d.get('seats'), d.get('doors'),
            d.get('boot_l'), kg, hp,
            ('=ROUND(N%d/(M%d/1000),0)' % (r, r)) if hp and kg else None,
            d.get('co2_gkm'), d.get('ev_miles'), c.get('drive'), c.get('trim'),
            d.get('first_reg'), 'Ruxley (Dan)' if c.get('_home') else 'Group',
            c.get('id'),
        ], fmt={4: '0', 5: '£#,##0', 6: '#,##0'})
        r += 1

    last = r - 1
    ws.cell(row=r + 1, column=1, value='Cars').font = BOLD
    ws.cell(row=r + 1, column=2, value='=COUNTA(A4:A%d)' % last).font = BOLD
    ws.cell(row=r + 2, column=1, value='Dan own forecourt').font = BODY
    ws.cell(row=r + 2, column=2,
            value='=COUNTIF(U4:U%d,"Ruxley (Dan)")' % last).font = BODY
    ws.cell(row=r + 3, column=1, value='Average price').font = BODY
    c = ws.cell(row=r + 3, column=2, value='=ROUND(AVERAGE(E4:E%d),0)' % last)
    c.font, c.number_format = BODY, '£#,##0'
    ws.cell(row=r + 4, column=1, value='Cars with a boot figure').font = BODY
    ws.cell(row=r + 4, column=2, value='=COUNT(L4:L%d)' % last).font = BODY
    return ws


def sheet_history(wb, snaps):
    ws = wb.create_sheet('Stock history')
    ws['A1'] = 'Dan forecourt, day by day'
    ws['A1'].font = TITLE
    ws['A2'] = ('Every committed stock snapshot. This is the whole history there is: the file '
                'starts on the first morning it was committed, so there is nothing before the '
                'first row. It grows by one row a day from here.')
    ws['A2'].font = NOTE
    ws.merge_cells('A2:G2')
    ws.row_dimensions[2].height = 28

    head(ws, 4, ['Date', 'Cars on the forecourt', 'Arrived', 'Left (sold or moved)',
                 'Average price', 'Commit'],
         [12, 18, 10, 18, 13, 11])
    r, prev = 5, None
    for date, sha, cars in snaps:
        prices = [p for p in (num(c.get('price')) for c in cars.values()) if p]
        arrived = len(set(cars) - set(prev)) if prev is not None else None
        left = len(set(prev) - set(cars)) if prev is not None else None
        put(ws, r, [date, len(cars), arrived, left,
                    round(sum(prices) / len(prices)) if prices else None, sha],
            fmt={5: '£#,##0'})
        if prev is None:
            ws.cell(row=r, column=3, value='first day')
            ws.cell(row=r, column=4, value='first day')
            for col in (3, 4):
                ws.cell(row=r, column=col).font = NOTE
        prev = cars
        r += 1
    last = r - 1
    ws.cell(row=r, column=1, value='Totals').font = BOLD
    for col, letter in ((3, 'C'), (4, 'D')):
        ws.cell(row=r, column=col,
                value='=SUM(%s5:%s%d)' % (letter, letter, last)).font = BOLD

    # How long each car has been listed. A car still on the newest snapshot is
    # still here; one that dropped out is dated the last morning it was seen,
    # which is the nearest thing we have to a sale date and is labelled as such
    # rather than as "sold".
    first, lastseen = {}, {}
    info = {}
    for date, _sha, cars in snaps:
        for cid, c in cars.items():
            first.setdefault(cid, date)
            lastseen[cid] = date
            info[cid] = c
    live = set(snaps[-1][2]) if snaps else set()

    r += 2
    ws.cell(row=r, column=1, value='Every car seen in that window').font = TITLE
    r += 1
    ws.cell(row=r, column=1, value=(
        'Days listed counts the mornings the car appeared, not calendar days, so a car seen on '
        'one snapshot reads 1. "Gone by" is the last morning it was on the list: it may have '
        'sold, moved branch or simply been taken down.')).font = NOTE
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
    r += 2
    hr = r
    for i, t in enumerate(['Reg', 'Model', 'Price', 'First seen', 'Last seen',
                           'Days listed', 'Still in stock', 'Gone by'], 1):
        c = ws.cell(row=hr, column=i, value=t)
        c.font, c.fill = HEAD_FONT, HEAD_FILL
    r += 1
    days = {cid: sum(1 for _d, _s, cars in snaps if cid in cars) for cid in first}
    for cid in sorted(first, key=lambda x: (x in live, first[x])):
        c = info[cid]
        put(ws, r, [c.get('reg'), c.get('model'), num(c.get('price')),
                    first[cid], lastseen[cid], days[cid],
                    'Yes' if cid in live else 'No',
                    '' if cid in live else lastseen[cid]],
            fmt={3: '£#,##0'})
        r += 1
    return ws


def sheet_notes(wb, models, cars, det, snaps):
    ws = wb.create_sheet('Notes')
    ws.column_dimensions['A'].width = 30
    ws.column_dimensions['B'].width = 105
    ws['A1'] = 'Where every figure comes from'
    ws['A1'].font = TITLE
    r = 3
    rows = [
        ('Built', datetime.now().strftime('%d %B %Y, %H:%M')),
        ('Rebuild it with', 'python3 automation/model-workbook.py (after model-table.py)'),
        ('', ''),
        ('SOURCES', ''),
        ('Boot, kerb weight, power, CO2, electric range, seats, doors',
         'Hedin own listing page for each car, harvested by automation/car-details.py. '
         'These are per car, so the Models sheet shows the range across the cars in stock.'),
        ('Price, model, year, mileage, colour, fuel, body, drive, trim',
         'The daily stock snapshots, automation/hedin-stock-snapshot.json and '
         'hedin-group-stock.json.'),
        ('Length, width, height, wheelbase',
         'Wikipedia infobox for each model, fetched by automation/model-specs.py. The exact '
         'page is named on every row of the Models sheet.'),
        ('', ''),
        ('THINGS TO KNOW', ''),
        ('Hedin unit labels are wrong',
         'Their listings label kerb weight in lbs on a figure that is kilograms, and CO2 in '
         'g/mile on a figure that is g/km. Checked against the published figures for four cars '
         'across four fuel types. The numbers are right and metric; we relabel them once on the '
         'way in. Anything you read straight off their site will be labelled wrongly.'),
        ('One Hedin figure is simply wrong',
         'Two of the three XMs are published with a 5,271 litre boot. The real figure is 527. '
         'Those are dropped rather than shown, so the XM has no boot figure at all here: no '
         'figure is better than an absurd one in front of a customer.'),
        ('Sizes are the current generation',
         'One row a model, using the newest generation on the source page. Where stock spans two '
         'generations the difference is small (an X3 moved 47mm between them) and it is the model '
         'being recommended, not a specific car.'),
        ('i3 means three different cars now',
         'The four in stock are the 2013-2022 hatchback. BMW now also use i3 for a 2026 Neue '
         'Klasse car and a China-only electric 3 Series, so always say "i3 hatchback".'),
        ('No 0-62 times',
         'Not published in any source we can reach, so pace is horsepower per tonne from Hedin '
         'own figures instead. It ranks the cars correctly and is honest about what it is. Say '
         'the word and I will key in official 0-62 figures by hand.'),
        ('How far back the history goes',
         'The first snapshot in git is %s and the newest is %s, %d mornings. There is nothing '
         'before that date, because the file did not exist. From here it grows by a row a day.'
         % (snaps[0][0] if snaps else '?', snaps[-1][0] if snaps else '?', len(snaps))),
        ('', ''),
        ('WHAT TO EDIT', ''),
        ('Nothing here, by design',
         'Every sheet is rebuilt from the data files, so an edit is lost on the next run. To '
         'change a judgement (what counts as comfortable for five adults, where the pace bands '
         'sit) change automation/model-table.py and re-run both scripts. Tell me and I will do it.'),
    ]
    for label, text in rows:
        a = ws.cell(row=r, column=1, value=label)
        b = ws.cell(row=r, column=2, value=text)
        a.font = BOLD if label.isupper() and label else BODY
        b.font = BODY
        b.alignment = Alignment(wrap_text=True, vertical='top')
        if label and label.isupper():
            a.fill = EDIT_FILL
        r += 1

    r += 1
    ws.cell(row=r, column=1, value='COVERAGE').font = BOLD
    ws.cell(row=r, column=1).fill = EDIT_FILL
    r += 1
    n = len(cars)
    for key, label in (('boot_l', 'boot litres'), ('weight_kg', 'kerb weight'),
                       ('power_hp', 'power'), ('co2_gkm', 'CO2'),
                       ('ev_miles', 'electric range'), ('seats', 'seats')):
        have = sum(1 for c in cars if (det.get(c.get('id')) or {}).get(key))
        ws.cell(row=r, column=1, value=label).font = BODY
        ws.cell(row=r, column=2,
                value='%d of %d cars (%d%%)' % (have, n, round(100.0 * have / n))).font = BODY
        r += 1
    return ws


def main():
    models = load('bmw-models.json', {})
    det = load('car-details.json', {})
    home = load('hedin-stock-snapshot.json', [])
    group = load('hedin-group-stock.json', [])
    if not models or not home:
        sys.exit('run model-table.py first')

    for c in home:
        c['_home'] = True
    cars = home + group
    # The same family rule model-table.py applies. Kept deliberately identical:
    # two tables keyed differently would silently fail to join, and the
    # workbook would show a model with no cars under it.
    def family(car):
        s = (car.get('series') or '').strip()
        m = car.get('model') or ''
        if not s:
            return 'i3' if 'i3' in m else ''
        if s == '2 Series':
            if 'Gran Coupe' in m or 'Gran Coupé' in m:
                return '2 Series GC'
            if 'Tourer' in m:
                return '2 Series AT'
        return s
    for c in cars:
        c['_family'] = family(c)

    snaps = git_snapshots()
    print('%d models, %d cars, %d daily snapshots' % (len(models), len(cars), len(snaps)))

    wb = Workbook()
    wb.remove(wb.active)
    sheet_models(wb, models)
    sheet_cars(wb, cars, det, models)
    sheet_history(wb, snaps)
    sheet_notes(wb, models, cars, det, snaps)
    wb.save(OUT)
    print('wrote %s' % os.path.basename(OUT))


if __name__ == '__main__':
    main()
