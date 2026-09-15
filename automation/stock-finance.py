#!/usr/bin/env python3
"""Fetch a real finance quote for every car in the stock snapshot.

`stock.html` shows a finance example on each car, and those figures are sent
to customers - so they are the lender's own quote, pulled the same way the
daily post cards pull theirs, never a calculation of ours. The terms match
the cards exactly (48 months, 8,000 miles, flat £1,000 deposit below £40k and
10% at or above) so the page and the cards never disagree.

Writes automation/stock-finance.json, keyed by listing id. The stock snapshot
itself is left alone: it is refreshed by a separate job and read by the board
as well as this page.

    python3 automation/stock-finance.py [--limit N] [--only 250261,238261]
"""
import argparse, json, os, sys, time, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
SNAP = os.path.join(HERE, 'hedin-stock-snapshot.json')
OUT  = os.path.join(HERE, 'stock-finance.json')

# finance-quote.py has a hyphen in its name, so it cannot be imported normally
spec = importlib.util.spec_from_file_location('fq', os.path.join(HERE, 'finance-quote.py'))
fq = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fq)

TERM, MILEAGE, FLAT, PCT, TIER = 48, 8000, 1000.0, 10.0, 40000.0


def deposit_for(price):
    """Same tiering as the daily cards: a flat grand on the cheaper stock, a
    percentage above the tier, where a flat grand leaves so much on finance
    that the lender often will not quote at all."""
    return round(price * PCT / 100.0, 2) if price >= TIER else FLAT


def price_of(car):
    try:
        return float(str(car.get('price', '')).replace('£', '').replace(',', '').strip())
    except ValueError:
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int)
    ap.add_argument('--only', help='comma-separated listing ids')
    a = ap.parse_args()

    cars = json.load(open(SNAP))
    if a.only:
        want = set(a.only.split(','))
        cars = [c for c in cars if c.get('id') in want]
    if a.limit:
        cars = cars[:a.limit]

    out, ok, refused, failed = {}, 0, 0, 0
    if os.path.exists(OUT):
        try:
            out = json.load(open(OUT))
        except Exception:
            out = {}

    t0 = time.time()
    for i, c in enumerate(cars, 1):
        lid, price = c.get('id'), price_of(c)
        if not lid or not price:
            continue
        dep = deposit_for(price)
        try:
            v = fq.listing(lid)
            q = fq.quote(v, dep, TERM, MILEAGE, 'PCP')
            Q, P = q['Finance']['Quote'], q['Finance']['Product']
            ref = Q['QuoteReference']
            out[lid] = {
                'reg': v['regno'], 'price': v['retail_price'],
                'product': P.get('Name'), 'lender': P.get('Lender'),
                # exactly the field names finance-quote.py uses - guessing at
                # these silently emptied the optional final payment first time
                'monthly': Q['RegularPayment'], 'payments': Q['TotalNumberOfRegularPayments'],
                'term': Q['Term'], 'deposit': Q['TotalDeposit'], 'apr': Q['Apr'],
                'final_payment': Q['Residual'], 'total_payable': Q['TotalAmountPayable'],
                'credit': round(v['retail_price'] - Q['TotalDeposit'], 2),
                'charges': Q['ChargesForCredit'],
                'annual_mileage': Q['AnnualMileage'],
                'contract_mileage': Q['ContractMileage'],
                'excess_pence': Q['ExcessMileageRate'],
                'quoted_at': Q['QuotedAt'], 'valid_to': Q['ValidTo'],
                'legal': fq.legal(ref) if ref else None,
            }
            ok += 1
            print('  %3d/%d  %-9s %-34s %8.2f/mo  %s%% APR'
                  % (i, len(cars), v['regno'], (v['model_text'] or '')[:34],
                     Q['RegularPayment'], Q.get('Apr')), flush=True)
        except SystemExit as e:
            # the lender declining to quote this car is normal, not a fault
            refused += 1
            out.pop(lid, None)
            print('  %3d/%d  %-9s refused: %s' % (i, len(cars), c.get('reg',''), str(e)[:70]), flush=True)
        except Exception as e:
            failed += 1
            out.pop(lid, None)
            print('  %3d/%d  %-9s error: %s' % (i, len(cars), c.get('reg',''), str(e)[:70]), flush=True)

    json.dump(out, open(OUT, 'w'), indent=1, sort_keys=True)
    print('\nquoted %d, refused %d, errored %d, %.0fs total (%.1fs a car)'
          % (ok, refused, failed, time.time()-t0, (time.time()-t0)/max(1, len(cars))))


if __name__ == '__main__':
    main()
