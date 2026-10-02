#!/usr/bin/env python3
"""Outside dimensions for every BMW model family Dan has in stock.

Hedin's listing pages give the boot, the seats, the kerb weight, the power, the
CO2 and the electric range for each individual car, and `car-details.py`
harvests all of that. What they do not give is how big the car is on the
outside, which is the first thing somebody asking "will this fit my family and
my driveway" wants to know. This fetches it.

**The source is Wikipedia's own infobox**, read through `Special:Export` (the
`api.php` endpoint is rate limited from here, the export view is not) and parsed
out of the `{{cvt|4935|mm|in|1}}` templates it stores dimensions in. Each figure
is written out with the page and generation it came from, so every number in the
spreadsheet can be traced back to something rather than taken on trust. A
figure that is not on the page is left empty: a quiz that invents a boot size
is worse than one that says it does not know.

**One row per family, for the current generation.** The quiz recommends a model
("an X3 would suit you"), not a variant, and the generations overlap in stock
anyway. The generation used is recorded in the output. Where two bodies of one
family are genuinely different sizes (a 2 Series Coupé against an Active
Tourer) they are separate rows, because that difference is the whole point.

Page titles move, so each family carries a list of candidates and the first one
that yields usable dimensions wins. The run prints which page answered for
each, and exits non-zero if any family came back with nothing, rather than
quietly writing a table with holes in it.

    python3 automation/model-specs.py [--only X5,X3] [--verbose]
"""
import argparse, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'bmw-model-specs.json')
EXPORT = 'https://en.wikipedia.org/wiki/Special:Export/'
UA = 'Mozilla/5.0 (compatible; dan-sells-stock/1.0)'

# Be a good citizen: the export view is not rate limited the way api.php is,
# but this is somebody else's server and 23 pages is not urgent.
PAUSE = 1.5

# family key -> (display name, body hint, candidate Wikipedia titles)
# The key is what the stock files' own `series` field says, so the two tables
# join without a translation layer. 'i3' has no series in the snapshot and is
# matched on the model name instead.
MODELS = [
    ('1 Series',  '1 Series',            'Hatchback',
     ['BMW 1 Series (F70)', 'BMW 1 Series (F40)', 'BMW 1 Series']),
    ('2 Series',  '2 Series Coupe',      'Coupe',
     ['BMW 2 Series (G42)', 'BMW 2 Series']),
    ('2 Series GC', '2 Series Gran Coupe', 'Gran Coupe',
     ['BMW 2 Series Gran Coupé (F74)', 'BMW 2 Series Gran Coupé (F44)',
      'BMW 2 Series Gran Coupé']),
    ('2 Series AT', '2 Series Active Tourer', 'MPV',
     ['BMW 2 Series Active Tourer (U06)', 'BMW 2 Series Active Tourer']),
    ('3 Series',  '3 Series',            'Saloon',
     ['BMW 3 Series (G20)', 'BMW 3 Series']),
    ('4 Series',  '4 Series',            'Coupe',
     ['BMW 4 Series (G22)', 'BMW 4 Series']),
    ('5 Series',  '5 Series',            'Saloon',
     ['BMW 5 Series (G60)', 'BMW 5 Series (G30)', 'BMW 5 Series']),
    ('7 Series',  '7 Series',            'Saloon',
     ['BMW 7 Series (G70)', 'BMW 7 Series']),
    ('X1',        'X1',                  'SUV',  ['BMW X1 (U11)', 'BMW X1']),
    ('X2',        'X2',                  'SUV',  ['BMW X2 (U10)', 'BMW X2']),
    ('X3',        'X3',                  'SUV',  ['BMW X3 (G45)', 'BMW X3 (G01)', 'BMW X3']),
    ('X4',        'X4',                  'SUV Coupe', ['BMW X4 (G02)', 'BMW X4']),
    ('X5',        'X5',                  'SUV',  ['BMW X5 (G05)', 'BMW X5']),
    ('X6',        'X6',                  'SUV Coupe', ['BMW X6 (G06)', 'BMW X6']),
    ('X7',        'X7',                  'SUV',  ['BMW X7 (G07)', 'BMW X7']),
    ('XM',        'XM',                  'SUV',  ['BMW XM']),
    # "BMW i3" is a disambiguation page, because the name now covers three
    # different cars: a 2026 Neue Klasse model (NA0), a China-only electric
    # 3 Series (G28), and the 2013-2022 hatchback. The four in stock are the
    # hatchback, so that is the page, and the quiz must say "i3 hatchback"
    # rather than "i3" or it reads as an offer of the new one.
    ('i3',        'i3 hatchback',        'Hatchback', ['BMW i3 (hatchback)']),
    ('i4',        'i4',                  'Gran Coupe', ['BMW i4']),
    ('i5',        'i5',                  'Saloon', ['BMW i5', 'BMW 5 Series (G60)']),
    ('i7',        'i7',                  'Saloon', ['BMW i7', 'BMW 7 Series (G70)']),
    ('iX',        'iX',                  'SUV',  ['BMW iX']),
    ('iX1',       'iX1',                 'SUV',  ['BMW iX1', 'BMW X1 (U11)']),
    # The iX2 has no page of its own: "BMW iX2" is a redirect into the X2
    # article, which is where its dimensions live. Same car, same body.
    ('iX2',       'iX2',                 'SUV',  ['BMW X2 (U10)', 'BMW X2']),
    ('iX3',       'iX3',                 'SUV',  ['BMW iX3 (NA5)', 'BMW iX3 (G08)', 'BMW iX3']),
]

DIMS = ('length', 'width', 'height', 'wheelbase')


def fetch(title):
    url = EXPORT + title.replace(' ', '_')
    r = subprocess.run(['curl', '-sS', '--max-time', '60', '-A', UA, url],
                       capture_output=True, text=True)
    return r.stdout or ''


def cvt(text, key):
    """The LAST convert-template figure for an infobox key, in mm.

    Three things this got wrong first time and must keep right:

    * **Both template names.** Dimensions are written `{{cvt|4935|mm|in|1}}` on
      some pages and `{{convert|4708|mm|in|1|abbr=on}}` on others. Matching
      only `cvt` found the X5 and silently missed the X3, the 1 Series and the
      i4, which reads as "Wikipedia does not carry it" when it plainly does.
    * **A range can be a single parameter.** `{{convert|4564-4570|mm|..}}` as
      well as `{{cvt|2060|-|2286|kg|..}}`. Both are read, the lower figure is
      taken, and the key is listed in `ranged` so nobody reads it as exact.
    * **The LAST block, not the first.** A model page documents every
      generation in chronological order, so the first set of dimensions belongs
      to the oldest car on the page: on the X3 that is a 2003 E83, twenty years
      older than anything Dan sells. The last block is the newest generation
      the page covers.
    """
    # The field's value is taken first and the convert template looked for
    # inside it, because some pages wrap several figures in an unbulleted list
    # spread over several lines:
    #     | length = {{ubl
    #       | {{convert|4500|mm|in|1|abbr=on}}
    #       | {{convert|4616|mm|in|1|abbr=on}} (LWB)
    #       }}
    # Requiring the field to open with the convert template missed the X1, the
    # iX1, the iX2 and the iX3 outright.
    #
    # The value ends at the next TOP-LEVEL field, and the only thing separating
    # one of those from a list item is the indent: an infobox key starts its
    # line with "|" while a ubl item is indented to "  |". Delimiting on any
    # "\n...|" instead stopped dead at the first list item, captured the bare
    # "{{ubl", and found no figure at all. Not delimiting would be worse: a key
    # with no value would borrow the next field's number.
    vals = [m.group(1) for m in
            re.finditer(r'\|[ \t]*%s[ \t]*=(.{0,400}?)(?=\n\|)'
                        % key, text, re.I | re.S)]
    hits = []
    for v in vals:
        inner = re.search(r'\{\{\s*(?:cvt|convert)\s*\|([^}]*)\}\}', v, re.I)
        if inner:
            hits.append(inner.group(1))
    if not hits:
        return None, False, 0
    nums = []
    for p in [q.strip() for q in hits[-1].split('|')]:
        m = re.fullmatch(r'(-?[0-9][0-9,.]*)\s*[-–]\s*(-?[0-9][0-9,.]*)', p)
        if m:
            nums += [float(m.group(1).replace(',', '')),
                     float(m.group(2).replace(',', ''))]
            continue
        if re.fullmatch(r'-?[0-9][0-9,.]*', p):
            nums.append(float(p.replace(',', '')))
            continue
        if p in ('-', '–', '~'):
            continue
        break               # the unit, so the figures are done
    if not nums:
        return None, False, len(hits)
    return nums[0], len(nums) > 1, len(hits)


def generation(title):
    m = re.search(r'\(([A-Z]+[0-9]+)\)', title)
    return m.group(1) if m else ''


def specs_from(text):
    out, ranged, blocks = {}, [], 0
    for k in DIMS:
        v, isrange, n = cvt(text, k)
        blocks = max(blocks, n)
        if v:
            out[k + '_mm'] = int(round(v))
            if isrange:
                ranged.append(k)
    w, wrange, _ = cvt(text, 'weight')
    if w:
        out['kerb_kg_from'] = int(round(w))
        if wrange:
            ranged.append('weight')
    if ranged:
        out['ranged'] = ranged      # figure is the low end of a published range
    # How many generations the page documents. Anything above 1 means these
    # figures are the newest of several sets on one page, which belongs in the
    # output rather than being something to take on trust.
    if blocks:
        out['gens_on_page'] = blocks
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='comma-separated family keys')
    ap.add_argument('--verbose', action='store_true')
    a = ap.parse_args()

    want = set(a.only.split(',')) if a.only else None
    rows, missing = {}, []
    for key, name, body, titles in MODELS:
        if want and key not in want:
            continue
        got = None
        for t in titles:
            text = fetch(t)
            time.sleep(PAUSE)
            if len(text) < 2000:
                if a.verbose:
                    print('    %s: %d bytes, skipping' % (t, len(text)))
                continue
            s = specs_from(text)
            if s.get('length_mm'):
                s.update(name=name, body=body, source=t, generation=generation(t))
                got = s
                break
            if a.verbose:
                print('    %s: no length in the infobox' % t)
        if got:
            rows[key] = got
            print('  %-14s %-32s %smm long, %smm wide, boot n/a here'
                  % (key, got['source'], got['length_mm'], got.get('width_mm', '?')))
        else:
            missing.append(key)
            print('  %-14s NOTHING FOUND from %d candidates' % (key, len(titles)))

    if rows:
        existing = {}
        if os.path.exists(OUT):
            try:
                existing = json.load(open(OUT))
            except ValueError:
                existing = {}
        existing.update(rows)
        with open(OUT, 'w') as fh:
            fh.write('{\n')
            keys = sorted(existing)
            for n, k in enumerate(keys):
                fh.write(' %s: %s%s\n' % (json.dumps(k),
                                          json.dumps(existing[k], sort_keys=True),
                                          ',' if n < len(keys) - 1 else ''))
            fh.write('}\n')
        print('\nwrote %d families to %s' % (len(existing), os.path.basename(OUT)))

    if missing:
        sys.exit('no dimensions for: %s - fix the page candidates rather than '
                 'leaving the table with holes in it' % ', '.join(missing))


if __name__ == '__main__':
    main()
