#!/usr/bin/env python3
"""Build stock-support.html and team-offers.json from the Q4 stocklist.

Inputs:
  stock-support/sheet.json       the stocklist rows (sheet figures only)
  stock-support/template.html    the page, with /*DATA*/ where the cars go
  lookup/new-stock.json          BMW locator: live cars and the 30-day removed list
  lookup/new-stock-quotes.json   per order, the VIN (matched by the sheet's VIN suffix)

A sheet unit is dropped from BOTH outputs once the locator has it in its
`removed` list (it has sold or left). A unit whose order is no longer in the
locator's `cars` list is also dropped from the team board, because it has no
photo or spec to show. Units not in the locator at all stay on the stock page
only, marked as not matched.

Run after the daily new-car stock job:  python3 scripts/build-stock-support.py
"""
import json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
def p(*a): return os.path.join(ROOT, *a)

sheet = json.load(open(p('stock-support', 'sheet.json')))['rows']
locator = json.load(open(p('lookup', 'new-stock.json')))
quotes = json.load(open(p('lookup', 'new-stock-quotes.json')))['quotes']
cars = {c['order_number']: c for c in locator.get('cars', [])}
removed = {c['order_number'] for c in locator.get('removed', [])}

by_suffix = {}
for order, q in quotes.items():
    by_suffix.setdefault(q['vin'][-7:], []).append(order)

out = []
for r in sheet:
    orders = by_suffix.get(r['vin_suffix'], [])
    order = orders[0] if len(orders) == 1 else None
    c = cars.get(order) if order else None
    if order in removed:
        continue  # sold or gone: removed from the stock page and the board
    fam = re.sub(r'\s+', ' ', (r.get('model_header') or '').replace('Msp', 'MSP')).strip()
    row = {
        'ref': r['vin_suffix'], 'order': order, 'family': fam,
        'matched': c is not None,
        'description': c['description'] if c else None,
        'colour': c['colour'] if c else None,
        'fuel': c['fuel'] if c else None,
        'image': (c.get('image') or None) if c else None,
        'monthly': r.get('monthly'), 'deposit': r.get('deposit') if r.get('monthly') is not None else None,
        'mileage': r.get('mileage'), 'options_value': r.get('options_value'),
        'link': r.get('link'), 'notes': r.get('notes') or [],
        'unavailable': bool(r.get('unavailable')),
        'on_locator': c is not None,
    }
    out.append(row)

# Stock page: all surviving units, as before.
page = open(p('stock-support', 'template.html')).read()
data = json.dumps(out, ensure_ascii=False)
if '/*DATA*/' not in page:
    sys.exit('template is missing /*DATA*/')
html = page.replace('/*DATA*/[]', data, 1)
open(p('stock-support.html'), 'w').write(html)

# Team board: only cars on the live locator with a monthly and a photo.
board = []
for r in out:
    if not (r['on_locator'] and r['monthly'] is not None and r['image']):
        continue
    board.append({
        'fam': r['family'], 'desc': r['description'], 'col': r['colour'], 'fuel': r['fuel'],
        'img': r['image'], 'dep': r['deposit'], 'mon': r['monthly'],
        'mil': r['mileage'], 'opt': r['options_value'],
    })
json.dump({'generated_from': 'stock-support/sheet.json + lookup/new-stock.json', 'count': len(board), 'cars': board},
          open(p('team-offers.json'), 'w'), ensure_ascii=False, indent=1)
print('stock page units:', len(out), '| team board offers:', len(board))
