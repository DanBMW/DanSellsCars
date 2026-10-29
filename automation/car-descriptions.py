#!/usr/bin/env python3
"""Hedin's own description for every used car on the stock lists.

Each car's listing page carries a `car_description` field: the paragraph of
text Hedin write for the car. This reads it for the forecourt snapshot and the
group list and writes automation/car-descriptions.json, keyed by listing id,
one line a car so the daily diff stays readable.

A SIDECAR, like car-details.json, for the same reason: the snapshot is read by
the board and the finance cards and must keep its shape.

Unlike equipment, a description can change (price notes, reconditioning), so a
car's text is re-read once it is more than RECHECK_DAYS old. A page that
returns no description is NOT recorded as an empty one: the car keeps whatever
it had, or stays out of the file until a later run finds the text.

Two rules this file must keep:
  - The group list hides where a car is (Dan's ruling). A description that
    names a branch is refused, so the branch can never be published through
    this file.
  - Text is stored as Hedin wrote it, paragraphs kept, nothing invented.

    python3 automation/car-descriptions.py [--limit N] [--only 250261,238261]
"""
import argparse, datetime, importlib.util, json, os, re, sys

HERE  = os.path.dirname(os.path.abspath(__file__))
SNAP  = os.path.join(HERE, 'hedin-stock-snapshot.json')
GROUP = os.path.join(HERE, 'hedin-group-stock.json')
OUT   = os.path.join(HERE, 'car-descriptions.json')

RECHECK_DAYS = 7
# Hedin's copy is cleaned before it is stored, so every page reads the same text.
# A sentence claiming one owner or BMW approval is left out until Dan has checked
# those facts for each car: they are not in our data and must not be published on trust.
UNVERIFIED = re.compile(r'(?i)\b(one|single|sole|1)\s+(previous\s+)?(owner|keeper)|\bprevious owners?\b|\bapproved\b')
EMOJI = re.compile('[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200d]')
DASH = re.compile(r'\s*[\u2013\u2014]\s*|\s-\s')
MIN_LEN, MAX_LEN = 80, 6000
# Branch names must never reach the public file (see the group list rules).
BRANCH = re.compile(r'ruxley|bromley|enfield|woolwich|blackheath|showroom|our branch', re.I)
MARKUP = re.compile(r'<[a-zA-Z/!]|&[a-zA-Z#0-9]+;')


def load_fetcher():
    """car-details.py holds the fetch and the field reader, so reuse them rather than copy them."""
    spec = importlib.util.spec_from_file_location('cd', os.path.join(HERE, 'car-details.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def publish(text):
    """The text as a page may show it: no emoji, no dash separators, no unverified owner or approval sentences."""
    text = DASH.sub(', ', EMOJI.sub('', text or ''))
    paras = []
    for para in re.split(r'\n\s*\n', text):
        sents = re.split(r'(?<=[.!?])\s+', para.strip())
        kept = ' '.join(x for x in sents if x and not UNVERIFIED.search(x))
        kept = re.sub(r'\s{2,}', ' ', kept).strip()
        if kept:
            paras.append(kept)
    return '\n\n'.join(paras)


def clean(text):
    """Hedin's paragraphs, kept. Whitespace inside a paragraph is collapsed, blank lines between paragraphs kept."""
    text = (text or '').replace('\r', '')
    paras = [re.sub(r'[ \t]+', ' ', p).strip() for p in re.split(r'\n\s*\n', text)]
    return '\n\n'.join(p for p in paras if p)


def refuse(text, group):
    """Why a text must not be stored, or None when it is fine.

    Only a GROUP car's text is checked for a branch name: the Ruxley cars are
    Dan's own forecourt, and Hedin's copy there names Ruxley as the seller.
    """
    if not (MIN_LEN <= len(text) <= MAX_LEN):
        return 'length %d' % len(text)
    if MARKUP.search(text):
        return 'markup in text'
    if group and BRANCH.search(text):
        return 'names a branch'
    return None


def cars():
    """Every listing the stock lists carry, once each: id -> (page to read, is it a group car)."""
    out = {}
    for path, group in ((SNAP, False), (GROUP, True)):
        if not os.path.exists(path):
            continue
        data = json.load(open(path, encoding='utf-8'))
        rows = data if isinstance(data, list) else list((data.get('cars') or data).values())
        for c in rows:
            if c.get('id') and c.get('url'):
                out.setdefault(str(c['id']), (c['url'], group))
    return out


def save_all(have, listing):
    # Only cars still listed are kept: a sold car's text is not published.
    kept = {k: v for k, v in have.items() if k in listing}
    lines = ['"%s": %s' % (k, json.dumps(kept[k], ensure_ascii=False)) for k in sorted(kept)]
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('{\n"generated_at": %s,\n"cars": {\n' % json.dumps(datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')))
        f.write(',\n'.join(lines))
        f.write('\n}\n}\n')
    return len(kept)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--only', default='')
    ap.add_argument('--reclean', action='store_true', help='apply publish() to the texts already held')
    args = ap.parse_args()

    cd = load_fetcher()
    today = datetime.date.today()
    have = json.load(open(OUT, encoding='utf-8')).get('cars', {}) if os.path.exists(OUT) else {}
    listing = cars()
    if args.reclean:
        for cid in list(have):
            text = publish(have[cid]['text'])
            if cid not in listing or refuse(text, listing[cid][1]):
                del have[cid]
            else:
                have[cid]['text'] = text
        save_all(have, listing)
        print('reclean: %d held' % len(have))
        return
    only = set(x for x in args.only.split(',') if x)
    todo = [i for i in listing if (not only or i in only)
            and (i not in have or (today - datetime.date.fromisoformat(have[i]['checked'])).days >= RECHECK_DAYS)]
    if args.limit:
        todo = todo[:args.limit]

    fetched = failed = 0
    def save():
        return save_all(have, listing)

    for n, cid in enumerate(todo, 1):
        if n % 20 == 0:
            save(); print('progress %d of %d, %d read, %d failed' % (n, len(todo), fetched, failed), flush=True)
        try:
            url, group = listing[cid]
            html = cd.get(url)
            if '"car_id"' not in html:
                raise ValueError('no car_ fields on the page')
            text = cd.value_after(html, 'car_description')
            text = publish(clean(text if isinstance(text, str) else ''))
            why = refuse(text, group)
            if why:
                raise ValueError(why)
            have[cid] = {'text': text, 'checked': today.isoformat()}
            fetched += 1
        except Exception as e:
            failed += 1
            print('car %s: kept what it had (%s)' % (cid, str(e)[:120]), file=sys.stderr)

    held = save()
    print('descriptions: %d listed, %d read today, %d failed, %d held' % (len(listing), fetched, failed, held))
    # Exit non-zero only when more than a twentieth of the lists cannot be read: one or two a morning is normal.
    if todo and failed > max(1, len(listing) // 20):
        sys.exit(1)


if __name__ == '__main__':
    main()
