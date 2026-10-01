#!/usr/bin/env python3
"""Photographs and equipment for every car on the stock page.

The list pages carry one photo and no equipment at all. Each car's own listing
page carries a gallery and the factory equipment list, which is what lets
`stock.html` show more than one picture and lets the search box find a car by
something that is actually on it ("harman kardon", "heated seats", "tow bar")
rather than only by model and colour.

Writes automation/car-details.json, keyed by listing id, one line a car so the
daily diff stays readable. A SIDECAR, not a change to either stock file: the
snapshot is read by the board as well as the page and must keep its shape, and
a failure here must never cost the list Dan actually sends.

Equipment does not change once a car is on the forecourt, so a car already in
the file is left alone and only new arrivals cost a fetch - about two seconds
each, so an ordinary morning is a few seconds and the first run is the long one.

    python3 automation/car-details.py [--limit N] [--only 250261,238261]
                                      [--refresh]
"""
import argparse, json, os, re, sys, time, urllib.request

HERE  = os.path.dirname(os.path.abspath(__file__))
SNAP  = os.path.join(HERE, 'hedin-stock-snapshot.json')
GROUP = os.path.join(HERE, 'hedin-group-stock.json')
OUT   = os.path.join(HERE, 'car-details.json')

BASE = 'https://hedinautomotive.co.uk'
UA   = 'Mozilla/5.0 (compatible; dan-sells-stock/1.0)'

# Every gallery image sits on one CDN under a uuid, so the id alone is stored
# and the page puts the url back together. That is about 70 characters a photo
# saved across the whole file, on something a phone downloads.
CDN  = 'https://cdne-cdn-prod-polaris-prod.azureedge.net/vehicles/'
UUID = re.compile(re.escape(CDN) + r'([0-9a-f-]{36})-(?:enlarged|preview)\.jpg$')

# Enough for a card to leaf through without the file carrying forty-odd urls a
# car that nobody will ever scroll to.
MAX_IMAGES = 6


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8', 'replace')


def value_after(html, key):
    """The JSON value following "key": in the page, brackets balanced.

    The listing page is one long line of embedded state, so a plain regex
    cannot read a list or an object out of it: this walks the brackets and
    tracks whether it is inside a string, the same way the snapshot job reads
    the list page.
    """
    m = re.search(r'"%s"\s*:\s*' % re.escape(key), html)
    if not m:
        return None
    i = m.end()
    if html[i] not in '[{':
        lit = re.match(r'("(?:[^"\\]|\\.)*"|-?[0-9.]+|true|false|null)', html[i:])
        try:
            return json.loads(lit.group(1)) if lit else None
        except ValueError:
            return None
    depth, instr, esc = 0, False, False
    for j in range(i, len(html)):
        ch = html[j]
        if esc:
            esc = False
            continue
        if ch == '\\':
            esc = True
            continue
        if ch == '"':
            instr = not instr
            continue
        if instr:
            continue
        if ch in '[{':
            depth += 1
        elif ch in ']}':
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(html[i:j + 1])
                except ValueError:
                    return None
    return None


def shrink(url):
    """A gallery url as the id alone where it sits on the usual CDN."""
    m = UUID.match(url or '')
    return m.group(1) if m else url


def detail(cid):
    html = get('%s/buy-car/used-cars/%s/x' % (BASE, cid))
    # The wrong url still answers with a page big enough to look healthy, so
    # the check is for the car's own fields rather than for a page at all.
    if '"car_id"' not in html:
        raise ValueError('no car_ fields on the page for %s' % cid)

    imgs = value_after(html, 'car_images') or []
    out_imgs = []
    for im in imgs:
        u = im.get('original') or im.get('thumbnail_url') if isinstance(im, dict) else im
        if not u:
            continue
        u = shrink(u)
        if u not in out_imgs:
            out_imgs.append(u)
        if len(out_imgs) >= MAX_IMAGES:
            break

    eq = value_after(html, 'car_equipment') or []
    eq = [e.strip() for e in eq if isinstance(e, str) and e.strip()]

    rec = {}
    if out_imgs:
        rec['images'] = out_imgs
    if eq:
        rec['equipment'] = eq
    for key, field in (('version', 'car_version'), ('emissions', 'car_emission_mixed_text')):
        v = value_after(html, field)
        if isinstance(v, str) and v.strip():
            rec[key] = v.strip()
    # Nothing useful came back. Recording it would mark the car done for ever,
    # because the file itself is the "already fetched" marker, so it is better
    # to fail this one car and let tomorrow pick it up.
    if not rec.get('images') and not rec.get('equipment'):
        raise ValueError('neither images nor equipment for %s' % cid)
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int)
    ap.add_argument('--only', help='comma-separated listing ids')
    ap.add_argument('--refresh', action='store_true',
                    help='re-fetch cars already in the file')
    a = ap.parse_args()

    cars = []
    for path in (SNAP, GROUP):
        if os.path.exists(path):
            cars += json.load(open(path))
        else:
            print('note: %s is missing' % os.path.basename(path))
    live = {c.get('id') for c in cars if c.get('id')}
    full_run = not (a.only or a.limit)

    out = {}
    if os.path.exists(OUT):
        try:
            out = json.load(open(OUT))
        except Exception:
            out = {}

    todo = [c for c in cars if c.get('id')]
    if a.only:
        want = set(a.only.split(','))
        todo = [c for c in todo if c['id'] in want]
    elif not a.refresh:
        todo = [c for c in todo if c['id'] not in out]
    if a.limit:
        todo = todo[:a.limit]

    print('%d cars in stock, %d already have details, %d to fetch'
          % (len(live), len(out), len(todo)))

    ok = failed = 0
    t0 = time.time()
    for i, c in enumerate(todo, 1):
        try:
            rec = detail(c['id'])
            out[c['id']] = rec
            ok += 1
            print('  %3d/%d  %-9s %d photos, %d equipment lines'
                  % (i, len(todo), c.get('reg', ''), len(rec.get('images', [])),
                     len(rec.get('equipment', []))), flush=True)
        except Exception as e:
            failed += 1
            print('  %3d/%d  %-9s failed: %s'
                  % (i, len(todo), c.get('reg', ''), str(e)[:70]), flush=True)

    dropped = 0
    if full_run:
        for cid in [k for k in out if k not in live]:
            del out[cid]
            dropped += 1

    with open(OUT, 'w') as fh:
        fh.write('{\n')
        keys = sorted(out)
        for n, k in enumerate(keys):
            fh.write(' %s: %s%s\n' % (json.dumps(k), json.dumps(out[k], sort_keys=True),
                                      ',' if n < len(keys) - 1 else ''))
        fh.write('}\n')

    print('\nfetched %d, failed %d%s, %d cars on file, %.0fs'
          % (ok, failed, ', %d sold cars pruned' % dropped if dropped else '',
             len(out), time.time() - t0))
    if failed and not ok and todo:
        sys.exit('every fetch failed - the listing pages were not reachable')


if __name__ == '__main__':
    main()
