"""Thirty days of scrape info for a car that has left stock (Dan, 18 November 2026:
"with the scrapes, can we retain ideal file scrape info for 30 days").

car-details.py and stock-finance.py used to delete a sold car's entry on the
next full run, so the photographs, equipment, spec, lender quote and deposit
ladder we had fetched for it were gone the morning after it sold. Instead of
deleting, they hand the entry here, into automation/sold-archive.json, keyed
by listing id:

    {"<id>": {"gone": "YYYY-MM-DD", "details": {...}, "finance": {...}, "ladder": {...}}}

`gone` is the London date the first script found it missing. An entry is
dropped once it is more than KEEP_DAYS old, and straight away if the car comes
back into stock (its live entry is the truth again).

A separate file rather than a flag inside the live ones, on purpose: stock.html,
compare, Find my BMW, the quiz tables and stock-images.py all read car-details.json
and stock-finance.json as "the cars in stock", and a sold car left in there
would be counted, re-checked for dead photos and offered a monthly payment.
Nothing customer facing reads this file.
"""
import json, os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'sold-archive.json')
KEEP_DAYS = 30


def today():
    return datetime.now(ZoneInfo('Europe/London')).date()


def load(path=OUT):
    try:
        with open(path) as fh:
            d = json.load(fh)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def save(arc, path=OUT):
    # One line a car, the way the ladder and car-details are written, so the
    # daily diff stays readable.
    with open(path, 'w') as fh:
        fh.write('{\n')
        keys = sorted(arc)
        for n, k in enumerate(keys):
            fh.write(' %s: %s%s\n' % (json.dumps(k), json.dumps(arc[k], sort_keys=True, ensure_ascii=False),
                                      ',' if n < len(keys) - 1 else ''))
        fh.write('}\n')


def keep(kind, gone_entries, live, day=None, path=OUT):
    """File `gone_entries` ({id: entry}) under `kind`, clear anything back in
    `live`, drop anything past KEEP_DAYS. Returns (kept, expired)."""
    day = day or today()
    arc = load(path)
    for cid in [k for k in arc if k in live]:
        del arc[cid]                                    # back in stock
    for cid, entry in gone_entries.items():
        rec = arc.setdefault(cid, {'gone': day.isoformat()})
        rec[kind] = entry
    expired = 0
    for cid in list(arc):
        try:
            age = (day - date.fromisoformat(arc[cid].get('gone', ''))).days
        except Exception:
            age = KEEP_DAYS + 1                         # unreadable date: let it go
        if age > KEEP_DAYS:
            del arc[cid]
            expired += 1
    save(arc, path)
    return len(arc), expired


def seed(day=None):
    """Build the archive from git history: every car that left car-details.json,
    stock-finance.json or the ladder in the last KEEP_DAYS, with its last known
    entry and the London date of the first commit that no longer had it. Run
    once with --seed; refuses in a shallow clone, which would invent dates."""
    import subprocess
    root = os.path.dirname(HERE)
    git = lambda *a: subprocess.check_output(['git'] + list(a), cwd=root, text=True)
    if git('rev-parse', '--is-shallow-repository').strip() == 'true':
        raise SystemExit('shallow clone: run git fetch --unshallow first')
    day = day or today()
    live = set()
    for f in ('hedin-stock-snapshot.json', 'hedin-group-stock.json'):
        try:
            live |= {c.get('id') for c in json.load(open(os.path.join(HERE, f))) if c.get('id')}
        except Exception:
            raise SystemExit('cannot read %s, refusing to seed' % f)
    arc = {}
    for kind, f in (('details', 'car-details.json'), ('finance', 'stock-finance.json'),
                    ('ladder', 'stock-finance-ladder.json')):
        log = git('log', '--since=%d days ago' % (KEEP_DAYS + 2), '--reverse', '--format=%H %cI',
                  '--', 'automation/' + f).split('\n')
        last, gone, prev = {}, {}, None
        for line in filter(None, log):
            h, t = line.split(' ', 1)
            try:
                d = json.loads(git('show', h + ':automation/' + f))
            except Exception:
                continue
            if not isinstance(d, dict) or len(d) < 50:
                continue                                  # a broken or emptied file says nothing
            when = datetime.fromisoformat(t).astimezone(ZoneInfo('Europe/London')).date()
            for k, v in d.items():
                last[k] = v
                gone.pop(k, None)
            if prev is not None:
                for k in prev - set(d):
                    gone.setdefault(k, when)
            prev = set(d)
        for k, when in gone.items():
            if k in live or (day - when).days > KEEP_DAYS:
                continue
            rec = arc.setdefault(k, {'gone': when.isoformat()})
            rec['gone'] = min(rec['gone'], when.isoformat())
            rec[kind] = last[k]
    save(arc)
    return len(arc)


if __name__ == '__main__':
    import sys
    if '--seed' in sys.argv:
        print('sold archive seeded: %d cars that left stock in the last %d days' % (seed(), KEEP_DAYS))
    else:
        print('usage: python3 automation/sold_archive.py --seed')
