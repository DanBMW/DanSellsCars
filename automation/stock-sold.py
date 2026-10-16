#!/usr/bin/env python3
"""DRAFT (compare-draft branch). Writes automation/stock-sold.json: used cars
that have left the Ruxley snapshot in the last KEEP days, so compare can show
them as SOLD with a 'Find something similar' button.

A car missing from today's snapshot gets first_missing = today. It is only
shown as sold once it has been missing for CONFIRM consecutive runs (default 1;
set 2 to ride out a one day blip). If it reappears it is removed from the
ledger at once (a car temporarily hidden, reserved then released, or a feed
glitch). After KEEP days it is dropped. A run whose snapshot is short (under
MIN_SHARE of yesterday's live count) is refused, so a half fetch never marks
the forecourt as sold. New cars already have this in lookup/new-stock.json
'removed' (removed_at, 30 days); the page applies the same 7 day window there.

--seed walks git history for the last KEEP days to build a starting ledger.
"""
import json, os, subprocess, sys
from datetime import date, datetime, timedelta, timezone
HERE = os.path.dirname(os.path.abspath(__file__))
SNAP, OUT = os.path.join(HERE, 'hedin-stock-snapshot.json'), os.path.join(HERE, 'stock-sold.json')
KEEP, CONFIRM, MIN_SHARE = 7, 1, 0.6
KEEPF = ['id','model','series','year','reg','mileage','colour','fuel','fuelGroup','body','power','gearbox','seats','price','image']

def step(led, cars, day):
    live = {c['id']: c for c in cars}
    prev = led.get('live', {})
    if prev and len(live) < MIN_SHARE * len(prev):
        raise SystemExit('only %d cars against %d yesterday, refusing' % (len(live), len(prev)))
    sold = led.get('sold', {})
    for i in [i for i in sold if i in live]:
        del sold[i]                                   # came back: not sold
    for i, c in prev.items():
        if i not in live and i not in sold:
            r = {k: c.get(k) for k in KEEPF}; r['first_missing'] = day.isoformat(); r['runs_missing'] = 0
            sold[i] = r
    for i, r in list(sold.items()):
        r['runs_missing'] = r.get('runs_missing', 0) + 1
        if (day - date.fromisoformat(r['first_missing'])).days > KEEP: del sold[i]
    led['live'] = {i: {k: c.get(k) for k in KEEPF} for i, c in live.items()}
    led['sold'] = sold; led['updated'] = day.isoformat()
    return led

def seed():
    log = subprocess.check_output(['git','log','--since=%d days ago' % (KEEP+1),'--reverse','--format=%h %cI','--','automation/hedin-stock-snapshot.json'], cwd=os.path.dirname(HERE), text=True).split('\n')
    led = {}
    for line in filter(None, log):
        h, t = line.split(' ', 1)
        cars = json.loads(subprocess.check_output(['git','show',h+':automation/hedin-stock-snapshot.json'], cwd=os.path.dirname(HERE), text=True))
        led = step(led, cars, datetime.fromisoformat(t.replace('Z','+00:00')).date())
    return led

if __name__ == '__main__':
    if '--seed' in sys.argv: led = seed()
    else:
        led = json.load(open(OUT)) if os.path.exists(OUT) else {}
        led = step(led, json.load(open(SNAP)), date.today())
    led['confirm_runs'] = CONFIRM; led['keep_days'] = KEEP
    json.dump(led, open(OUT, 'w'), indent=1, ensure_ascii=False)
    print('sold in window:', len(led['sold']))
