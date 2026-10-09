#!/usr/bin/env python3
"""When each car arrived on the forecourt, worked out from this repo's own history.

    python3 automation/stock-arrivals.py            # write the sidecar
    python3 automation/stock-arrivals.py --check    # report, write nothing

Writes `automation/stock-arrivals.json`, which `stock.html` reads to badge a
car as fresh in and to sort by what landed most recently.

**Neither stock file is touched.** A sidecar, for the same reason
`car-details.json` is one: the snapshot is read by the board's forecourt view
as well, and its shape is a contract with readers this script knows nothing
about. Adding a field there to save a request is how a wall display breaks.

**Hedin publish no arrival date.** There is no such field on a car, which is
why the board keeps its own ledger in Firebase. The answer here comes from the
daily snapshots already committed to this repo: a car's arrival is the first
morning its id appears in one. `model-workbook.py` reads the same history for
its snapshot sheet, so this is an established way round the missing field
rather than a new one.

Three things it has to keep, and the first one is the whole job:

- **The first day in the history is a SEED, and nothing on it is fresh.** On
  21 September the snapshot arrived with 70 cars in it; every one of them has
  a first_seen of that day and not one of them arrived that day. The board's
  own stockwatch learned this the same way ("the first run seeds the ledger
  and claims nothing is new, otherwise the board would announce all sixty-nine
  cars as fresh in"). `history_from` is published so the page can apply the
  rule itself, and a car whose first_seen equals it is never badged.
  `lookup/_history.json` is not used for this, for exactly that reason: it
  began on 7 October, so 311 of its 318 cars share one first_seen and would
  all read as fresh.
- **It is rebuilt from git every run, so it is idempotent and self healing.**
  Nothing is carried forward from the last run and nothing accumulates. Miss it
  for three days and the next run reconstructs the same answer; run it twice in
  a day and the second writes nothing. That matters for a job on a morning
  routine: the ones that go wrong are the ones that cannot be re-run.
- **A car that leaves and comes back keeps its original arrival.** `first_seen`
  is the first day it was ever seen, not the first day of its current spell. A
  car that goes off the list for a fortnight and returns is not new stock, and
  a badge that says it is would be telling a customer something untrue.

The group file is read the same way, so an unlocked car carries its date too.
Its history is shorter (it began on 28 September) and it carries its own seed
day, so the two are tracked separately rather than sharing one.
"""
import argparse, json, os, subprocess, sys
from datetime import datetime
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'stock-arrivals.json')
LONDON = ZoneInfo('Europe/London')

SOURCES = [
    ('forecourt', 'automation/hedin-stock-snapshot.json'),
    ('group', 'automation/hedin-group-stock.json'),
]


def git(*args):
    return subprocess.run(['git'] + list(args), cwd=REPO, check=True,
                          capture_output=True, text=True).stdout


def refuse_if_shallow():
    """A shallow clone silently truncates the history this whole script is.

    Every arrival date here is "the first morning this file appeared in a
    commit", so a clone that only holds the last few days reports that morning
    as the seed and resets every car that genuinely arrived before it. On
    2026-10-09 a fresh container held 6 snapshot commits against the real 17
    days, which would have rewritten a 96 car ledger to a 5 day one and lost
    every true arrival date in between. It is not a crash and it is not
    visible in the output: the file looks perfectly well formed.

    The script is idempotent and self healing ONLY against the full history,
    so refuse rather than write a confident wrong answer. Deepen the clone
    (git fetch --unshallow) and run it again.
    """
    try:
        shallow = git('rev-parse', '--is-shallow-repository').strip()
    except Exception:
        return                      # old git without the flag: carry on
    if shallow == 'true':
        sys.exit('refusing to run in a shallow clone: the arrival history '
                 'would be truncated to whatever this clone happens to hold, '
                 'and every earlier arrival date silently reset. '
                 'Run "git fetch --unshallow" first.')


def commits_for(path):
    """Every commit that touched the file, oldest first, as (sha, London date)."""
    out = git('log', '--reverse', '--format=%H %cI', '--', path).strip()
    rows = []
    for line in out.split('\n'):
        if not line.strip():
            continue
        sha, iso = line.split(' ', 1)
        day = datetime.fromisoformat(iso).astimezone(LONDON).date().isoformat()
        rows.append((sha, day))
    return rows


def ids_at(sha, path):
    """The car ids in that version of the file, or None if it will not read.

    A version that cannot be parsed is skipped rather than treated as an empty
    forecourt: counting it would make every car arrive again the next morning.
    """
    try:
        blob = git('show', '%s:%s' % (sha, path))
        doc = json.loads(blob)
    except Exception:
        return None
    cars = doc.get('cars') if isinstance(doc, dict) else doc
    if not isinstance(cars, list):
        return None
    out = set()
    for c in cars:
        if isinstance(c, dict) and c.get('id') not in (None, ''):
            out.add(str(c['id']))
    return out or None


def first_seen_for(path):
    """{id: first London day it appeared} plus the seed day, from git alone."""
    seen, days = {}, []
    for sha, day in commits_for(path):
        ids = ids_at(sha, path)
        if ids is None:
            continue
        if days and days[-1] == day:
            pass              # several commits in one day are one morning
        else:
            days.append(day)
        for i in ids:
            seen.setdefault(i, day)
    return seen, (days[0] if days else None), len(days)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--check', action='store_true',
                    help='report and write nothing')
    args = ap.parse_args()

    refuse_if_shallow()

    today = datetime.now(LONDON).date().isoformat()
    doc = {
        'generated_at': datetime.now(ZoneInfo('UTC')).strftime(
            '%Y-%m-%dT%H:%M:%S.000Z'),
        'today': today,
        'note': ('first_seen is the first morning this repo saw the car in a '
                 'stock snapshot. A car whose first_seen equals its list\'s '
                 'history_from was already there when the history began and '
                 'has NOT just arrived.'),
        'lists': {},
    }
    total_new = 0
    for name, path in SOURCES:
        seen, seed, ndays = first_seen_for(path)
        if not seen or not seed:
            print('%s: no readable history, leaving it out' % name)
            continue
        fresh = sorted(i for i, d in seen.items() if d != seed and d == today)
        week = sum(1 for d in seen.values() if d != seed and d >= _back(today, 7))
        doc['lists'][name] = {
            'history_from': seed,
            'days_of_history': ndays,
            'cars': dict(sorted(seen.items())),
        }
        total_new += len(fresh)
        print('%-10s %4d cars, history from %s over %d mornings, '
              '%d arrived today, %d in the last 7 days'
              % (name, len(seen), seed, ndays, len(fresh), week))

    if not doc['lists']:
        raise SystemExit('no history on either stock file, keeping the old sidecar')

    if args.check:
        print('--check, nothing written')
        return

    old = None
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding='utf-8'))
        except Exception:
            old = None
    if old and old.get('lists') == doc['lists'] and old.get('today') == today:
        print('nothing changed, %s left alone' % os.path.basename(OUT))
        return

    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print('wrote %s (%d arrived today)' % (os.path.relpath(OUT, REPO), total_new))


def _back(day, n):
    from datetime import date, timedelta
    return (date.fromisoformat(day) - timedelta(days=n)).isoformat()


if __name__ == '__main__':
    main()
