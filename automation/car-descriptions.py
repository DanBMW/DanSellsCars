#!/usr/bin/env python3
"""Hedin's own written description ("Other info") for every car on the stock page.

Writes automation/car-descriptions.json, keyed by listing id, one line a car:
    {"text": "...", "fetched": "2026-10-29"}

A sidecar, like car-details.json: it never touches the stock files, and a failure
here must never cost the list Dan sends. A car's text is re-read only when it is
more than 7 days old, so the daily run is small and the first run is the long one.

Exit codes: 0 fine; non-zero only when more than a twentieth of the cars that
needed reading could not be read. The existing file is then left exactly as it was.

    python3 automation/car-descriptions.py [--limit N] [--only 250261,238261]
                                           [--refresh] [--probe 256418]

--probe ID prints which embedded fields on that car's page look like free text,
for the one-off job of confirming the field name. It writes nothing.
"""
import argparse, datetime, html as htmlmod, json, os, re, sys, time, urllib.request

HERE  = os.path.dirname(os.path.abspath(__file__))
SNAP  = os.path.join(HERE, 'hedin-stock-snapshot.json')
GROUP = os.path.join(HERE, 'hedin-group-stock.json')
OUT   = os.path.join(HERE, 'car-descriptions.json')

BASE = 'https://hedinautomotive.co.uk'
UA   = 'Mozilla/5.0 (compatible; dan-sells-stock/1.0)'
MAX_AGE_DAYS = 7
MAX_CHARS = 2500          # enough for a card, not a novel
MIN_CHARS = 40            # anything shorter is a label, not a description
FAIL_SHARE = 0.05         # more than a twentieth unreadable -> exit non-zero

# Likely names of the field on the listing page, most likely first. The page
# embeds the same car_* state car-details.py reads. Confirm once with --probe
# and put the real name first; the heading fallback below covers the rest.
KEYS = ('car_description', 'car_other_info', 'car_comments', 'car_remarks',
        'car_dealer_comments', 'car_text', 'car_overview', 'car_summary',
        'car_notes', 'description')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8', 'replace')


def value_after(page, key):
    """The JSON value following "key": in the page (same walker as car-details.py)."""
    m = re.search(r'"%s"\s*:\s*' % re.escape(key), page)
    if not m:
        return None
    i = m.end()
    if page[i] not in '[{':
        lit = re.match(r'("(?:[^"\\]|\\.)*"|-?[0-9.]+|true|false|null)', page[i:])
        try:
            return json.loads(lit.group(1)) if lit else None
        except ValueError:
            return None
    depth, instr, esc = 0, False, False
    for j in range(i, len(page)):
        ch = page[j]
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
                    return json.loads(page[i:j + 1])
                except ValueError:
                    return None
    return None


def clean(s):
    """Plain text: tags and entities out, whitespace tidied, paragraphs kept."""
    s = re.sub(r'(?i)<\s*br\s*/?>|</p\s*>|</li\s*>', '\n', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = htmlmod.unescape(s).replace(' ', ' ')
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n\s*\n+', '\n\n', s).strip()
    return s


def find_text(page):
    for key in KEYS:
        v = value_after(page, key)
        if isinstance(v, str) and len(clean(v)) >= MIN_CHARS:
            return clean(v)
    # Fallback: the visible "Other info" section, if the page is server-rendered.
    m = re.search(r'(?is)>\s*Other info\s*<.*?>([^<]{%d,})<' % MIN_CHARS, page)
    if m:
        return clean(m.group(1))
    return None


def probe(cid):
    page = get('%s/buy-car/used-cars/%s/x' % (BASE, cid))
    print('page length', len(page))
    names = sorted(set(re.findall(r'"(car_[a-z_]+)"\s*:', page)))
    print('car_* fields on the page:', ', '.join(names) or 'none')
    for n in names + ['description']:
        if re.search(r'descr|comment|remark|text|overview|summary|note|info|highlight', n):
            v = value_after(page, n)
            if isinstance(v, str):
                print('\n%s (%d chars): %s' % (n, len(v), v[:200].replace('\n', ' ')))
    print('\n"Other info" heading present:', bool(re.search(r'(?i)Other info', page)))
    print('find_text result:', (find_text(page) or 'NOTHING FOUND')[:200])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int)
    ap.add_argument('--only')
    ap.add_argument('--refresh', action='store_true')
    ap.add_argument('--probe')
    a = ap.parse_args()
    if a.probe:
        return probe(a.probe)

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

    today = datetime.date.today()

    def stale(cid):
        rec = out.get(cid)
        if not rec:
            return True
        try:
            d = datetime.date.fromisoformat(rec.get('fetched', ''))
        except ValueError:
            return True
        return (today - d).days > MAX_AGE_DAYS

    todo = [c for c in cars if c.get('id')]
    if a.only:
        want = set(a.only.split(','))
        todo = [c for c in todo if c['id'] in want]
    elif not a.refresh:
        todo = [c for c in todo if stale(c['id'])]
    if a.limit:
        todo = todo[:a.limit]
    print('%d cars in stock, %d on file, %d to read' % (len(live), len(out), len(todo)))

    ok = failed = 0
    new = dict(out)
    t0 = time.time()
    for i, c in enumerate(todo, 1):
        cid = c['id']
        try:
            page = get('%s/buy-car/used-cars/%s/x' % (BASE, cid))
            if '"car_id"' not in page:
                raise ValueError('no car_ fields on the page')
            text = find_text(page)
            if not text:
                raise ValueError('no description text found')
            new[cid] = {'text': text[:MAX_CHARS], 'fetched': today.isoformat()}
            ok += 1
            print('  %3d/%d  %-9s %d chars' % (i, len(todo), c.get('reg', ''), len(text)), flush=True)
        except Exception as e:
            failed += 1
            print('  %3d/%d  %-9s failed: %s' % (i, len(todo), c.get('reg', ''), str(e)[:70]), flush=True)

    # Too many unreadable: keep yesterday's file exactly as it is.
    if todo and failed > FAIL_SHARE * len(todo):
        sys.exit('%d of %d cars could not be read (more than a twentieth); file left as it was'
                 % (failed, len(todo)))

    dropped = 0
    if full_run:
        for cid in [k for k in new if k not in live]:
            del new[cid]
            dropped += 1

    if not new and out:
        sys.exit('nothing to write over a good file; left as it was')

    tmp = OUT + '.tmp'
    with open(tmp, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('{\n')
        keys = sorted(new)
        for n, k in enumerate(keys):
            fh.write(' %s: %s%s\n' % (json.dumps(k), json.dumps(new[k], sort_keys=True, ensure_ascii=False),
                                      ',' if n < len(keys) - 1 else ''))
        fh.write('}\n')
    os.replace(tmp, OUT)

    print('\nread %d, failed %d%s, %d cars on file, %.0fs'
          % (ok, failed, ', %d sold cars pruned' % dropped if dropped else '',
             len(new), time.time() - t0))


if __name__ == '__main__':
    main()
