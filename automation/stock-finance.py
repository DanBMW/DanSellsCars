#!/usr/bin/env python3
"""Fetch a real finance quote for every BMW on the stock page.

`stock.html` shows a finance example on each car, and those figures are sent
to customers - so they are the lender's own quote, pulled the same way the
daily post cards pull theirs, never a calculation of ours. The terms match
the cards exactly (48 months, 8,000 miles, flat £1,000 deposit below £40k and
10% at or above) so the page and the cards never disagree.

Covers both lists the page draws from: the Ruxley snapshot, and the other
branches' BMWs behind the "unlock our other stock" button. One file keyed by
listing id serves both, so an unlocked car shows its example the moment the
button is pressed and the page needed no change to do it.

Writes automation/stock-finance.json, keyed by listing id. Neither stock file
is touched: they are refreshed by their own jobs, and the snapshot is read by
the board as well as this page.

    python3 automation/stock-finance.py [--limit N] [--only 250261,238261]
                                        [--when-lapsed]

--when-lapsed is for a safety-net schedule (see CLAUDE.md): it does nothing
unless most of the list has lost its live quote, so on an ordinary day it
costs Hedin's site nothing.
"""
import argparse, json, os, re, sys, time, importlib.util
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
SNAP  = os.path.join(HERE, 'hedin-stock-snapshot.json')
# The other branches' BMWs, shown on stock.html behind the "unlock our other
# stock" button. They are quoted too, so a car carries its finance example the
# moment somebody opens that half of the list. The lender quotes them through
# exactly the same path - checked against five cars from £12k to £98k before
# this was wired up - and declines the older ones the same way it declines
# older Ruxley stock, which the page already handles.
#
# Note this is the per-car example on the stock page only. The daily Instagram
# cards stay Ruxley: see the note at the top of finance-post.py.
GROUP = os.path.join(HERE, 'hedin-group-stock.json')
OUT   = os.path.join(HERE, 'stock-finance.json')

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


UK = ZoneInfo('Europe/London')
# --when-lapsed re-quotes only when fewer than this share of the cars hold a
# live quote. A normal morning leaves roughly nine in ten quoted (older stock
# is declined by the lender), so this only trips when quotes have lapsed.
LAPSED_BELOW = 0.6
# ...and not within this long of the last run, so a day on which the lender is
# declining most cars is retried a few times rather than hammered.
MIN_GAP = timedelta(hours=3)


def _when(stamp):
    """Parse the lender's timestamps. QuotedAt carries seven fractional digits
    and older ValidTo values carry no offset at all (read as UK time, which is
    how the page's `new Date()` reads them for a UK visitor)."""
    if not stamp:
        return None
    s = re.sub(r'(\.\d{6})\d+', r'\1', str(stamp))
    try:
        d = datetime.fromisoformat(s)
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=UK)


def still_live(entry):
    """True while a quote we already hold is inside the lender's own validity
    - the same test as finLive() on the page."""
    d = _when((entry or {}).get('valid_to'))
    return bool(d and d > datetime.now(timezone.utc))


def get_quote(lid, dep, tries=3):
    """One car's listing and quote, retried on a network or server error. A
    lender refusal (SystemExit) is an answer, not a fault, and is not retried."""
    for n in range(1, tries + 1):
        try:
            v = fq.listing(lid)
            return v, fq.quote(v, dep, TERM, MILEAGE, 'PCP')
        except SystemExit:
            raise
        except Exception:
            if n == tries:
                raise
            time.sleep(5 * n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int)
    ap.add_argument('--only', help='comma-separated listing ids')
    ap.add_argument('--when-lapsed', action='store_true',
                    help='only run if most cars have lost their live quote')
    a = ap.parse_args()

    cars = json.load(open(SNAP))
    if os.path.exists(GROUP):
        cars += json.load(open(GROUP))
    else:
        print('note: %s is missing, quoting the Ruxley list only'
              % os.path.basename(GROUP))

    # every id we are meant to have a quote for, before any narrowing - used
    # below to drop quotes for cars that have since sold
    live = {c.get('id') for c in cars if c.get('id')}
    full_run = not (a.only or a.limit)

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

    if a.when_lapsed:
        ids = [c.get('id') for c in cars if c.get('id') and price_of(c)]
        held = sum(1 for i in ids if still_live(out.get(i)))
        last = max((d for d in (_when(e.get('quoted_at')) for e in out.values()) if d),
                   default=None)
        share = held / max(1, len(ids))
        print('%d of %d cars hold a live quote (%.0f%%); last quoted %s'
              % (held, len(ids), share * 100,
                 last.astimezone(UK).strftime('%Y-%m-%d %H:%M %Z') if last else 'never'))
        if share >= LAPSED_BELOW:
            print('quotes are live - nothing to do')
            return
        if last and datetime.now(timezone.utc) - last < MIN_GAP:
            print('last run was under %s ago - leaving it for the next slot' % MIN_GAP)
            return
        print('quotes have lapsed - re-quoting the list')

    t0 = time.time()
    for i, c in enumerate(cars, 1):
        lid, price = c.get('id'), price_of(c)
        if not lid or not price:
            continue
        dep = deposit_for(price)
        try:
            v, q = get_quote(lid, dep)
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
            # Could not reach the lender (after retries). That says nothing
            # about the car, so a quote we already hold stays while it is
            # still inside its own validity - it is the lender's figure, not
            # ours - rather than one bad minute on Hedin's site emptying the
            # page. A lapsed one goes, as before.
            failed += 1
            kept = still_live(out.get(lid))
            if not kept:
                out.pop(lid, None)
            print('  %3d/%d  %-9s error%s: %s' % (i, len(cars), c.get('reg',''),
                  ' (kept live quote)' if kept else '', str(e)[:60]), flush=True)

    # A sold car's quote would otherwise sit in here for ever: the entry is
    # never revisited because the car has left both lists, and the file only
    # ever grew. Pruning is limited to a full run - on --only or --limit the
    # cars that were not asked about are not gone, they are simply not in
    # today's slice, and dropping them would wipe the file.
    dropped = 0
    if full_run:
        for lid in [k for k in out if k not in live]:
            del out[lid]
            dropped += 1

    json.dump(out, open(OUT, 'w'), indent=1, sort_keys=True)
    print('\nquoted %d, refused %d, errored %d%s, %.0fs total (%.1fs a car)'
          % (ok, refused, failed,
             ', %d sold cars pruned' % dropped if dropped else '',
             time.time()-t0, (time.time()-t0)/max(1, len(cars))))
    # Every car erroring means the lender was never reached at all - fail
    # loudly so a scheduled run shows red, rather than reporting success.
    if failed and not ok and not refused:
        sys.exit('could not reach the finance API for any car')


if __name__ == '__main__':
    main()
