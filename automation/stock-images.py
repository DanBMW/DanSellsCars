#!/usr/bin/env python3
"""Put a photograph that actually loads on every car in both stock files.

    python3 automation/stock-images.py              # refresh, repair, write
    python3 automation/stock-images.py --check      # report only, write nothing
    python3 automation/stock-images.py --hero-only  # skip the gallery pass

Hedin host every car photograph on one CDN under a uuid, and when a car's
pictures are re-processed the uuid changes and the old file is deleted. A
stored url is therefore not a lasting address, it is a lease, and the only
safe assumption is that yesterday's may already be gone.

`hedin-stock-snapshot.json` never re-read it. The morning job carried each
car's `image` across from yesterday and fetched one only for a new arrival, so
a re-processed car kept a url pointing at a file that no longer existed and
its card drew a broken image for as long as the car stayed in stock: 9 of the
82 cars on 7 October 2026, the oldest dead since the day it arrived.
`hedin-group-stock.json` takes its image off the list payload on every run, so
it was never more than a day behind, which was 4 more.

Three steps, in that order, because the list payload is right about most cars
and not about all of them:

 1. Take the hero url off the group's own list payload. One request covers
    every car the group has, Ruxley included, so this costs nothing per car
    and is where both files should have been reading it all along. The claim
    in the morning routine that "only the listing page carries the photo" was
    simply wrong: `car_primary_image` is in the list payload for every record.
 2. Ask the CDN whether each url resolves. A payload url can itself point at
    a file that has gone, which is how four of the group's cars were broken
    the morning after a refresh that had done everything right.
 3. For anything still dead, read that one car's listing page, the freshest
    thing Hedin publish, and take the first of `car_images`.

Then the same treatment for the rest of the card. The hero is only the first
slide: the other five come from `car-details.json`, which is fetched once a
car and then treated as done for ever, because equipment does not change once
a car is on the forecourt. That is true of the equipment and not of the
photographs, and it left 98 dead gallery slides across 22 cars in stock on the
same morning. Only a car with something actually broken costs a listing fetch,
and the page is read once per run for both passes.

A url is only written once it has answered 200, so this can never replace a
working photograph with a worse guess, and a car that cannot be mended keeps
whatever it had rather than being handed a blank.

Two cars will not mend on any given morning and neither is a fault: one whose
listing page 404s has left Hedin's site and drops out of the snapshot tomorrow,
and one whose listing is up but carries no `car_images` has simply not been
photographed yet. Failing the run on either would put a scheduled job
permanently in the red, which is how a red job stops being read. It exits
non-zero only when more than a twentieth of a file cannot be mended, which is
the shape of the CDN moving or the parser breaking rather than of Hedin being
a day behind with a camera.
"""
import argparse, concurrent.futures as cf, importlib.util, json, os
import urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SNAP = os.path.join(HERE, 'hedin-stock-snapshot.json')
GROUP = os.path.join(HERE, 'hedin-group-stock.json')

# The list parser is deliberately not copied. It walks balanced braces with the
# string and escape states tracked, it has been got wrong before, and two
# copies of it drifting apart would be worse than importing one across a
# hyphenated filename.
_spec = importlib.util.spec_from_file_location(
    'groupstock', os.path.join(HERE, 'group-stock.py'))
gs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gs)

# car-details.py owns the gallery: its CDN, its uuid-only storage and its six
# photograph ceiling are taken from it rather than restated here, so a change
# there cannot leave this writing a shape that file does not expect.
_dspec = importlib.util.spec_from_file_location(
    'cardetails', os.path.join(HERE, 'car-details.py'))
cd = importlib.util.module_from_spec(_dspec)
_dspec.loader.exec_module(cd)
DETAILS = cd.OUT

HEAD_WORKERS = 12
TIMEOUT = 25


def live_images():
    """id -> hero url, for every car the group lists, from one request."""
    html = gs.fetch('%s?page=%d' % (gs.LIST, gs.PAGE), minimum=500000)
    out = {}
    for o in gs.car_objects(html):
        img = (o.get('car_primary_image') or {})
        url = img.get('thumbnail_url') or img.get('url') or ''
        if url:
            out[str(o.get('car_id'))] = url
    if len(out) < 200:
        raise SystemExit('only %d cars carried a photo in the list payload, '
                         'which is too few to be right; leaving both files '
                         'alone' % len(out))
    return out


def resolves(url):
    """True when the CDN actually serves this url.

    HEAD rather than GET: the answer needed is whether the file is there, and
    a car photograph is a couple of hundred KB that nobody here has to read.
    """
    if not url:
        return False
    req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': gs.UA})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status == 200
    except (urllib.error.URLError, OSError):
        return False


def check_all(urls):
    """{url: bool} for a set of urls, a dozen at a time."""
    urls = [u for u in set(urls) if u]
    with cf.ThreadPoolExecutor(HEAD_WORKERS) as ex:
        return dict(zip(urls, ex.map(resolves, urls)))


_PAGES = {}


def own_object(cid):
    """(car object, why) for one car, off its own listing page, fetched once.

    The object is picked out BY ID rather than by reading the first `car_`
    block on the page, and that is not fussiness. A listing url for a car that
    has gone answers 404 with a page of about 138KB carrying eight OTHER cars
    in a "similar vehicles" strip, every one of them a full `car_` object.
    Reading the first gallery there puts a stranger's photographs on this
    car's card, which is worse than the broken image they were sent to mend,
    and the page is far too big for the fetch size check to notice. A page
    that does not carry this car's own id is a car that has gone.

    Cached for the run, because the hero and the gallery are mended in two
    passes and a car with both broken would otherwise be fetched twice.
    """
    if cid in _PAGES:
        return _PAGES[cid]
    try:
        html = gs.fetch('%s/%s/x' % (gs.CAR, cid), minimum=20000)
    except SystemExit:
        _PAGES[cid] = (None, 'unreachable')
        return _PAGES[cid]
    mine = [o for o in gs.car_objects(html) if str(o.get('car_id')) == str(cid)]
    _PAGES[cid] = (mine[0], 'ok') if mine else (None, 'gone')
    return _PAGES[cid]


def _url_of(im):
    if isinstance(im, dict):
        return im.get('thumbnail_url') or im.get('original') or im.get('url') or ''
    return im if isinstance(im, str) else ''


def from_listing(cid):
    """(hero url, why) for one car."""
    car, why = own_object(cid)
    if not car:
        return '', why
    for im in [car.get('car_primary_image')] + list(car.get('car_images') or []):
        u = _url_of(im)
        if u:
            return u, 'ok'
    return '', 'nophotos'


def gallery_from_listing(cid):
    """The car's gallery as car-details.py stores it: uuids, six at most."""
    car, _ = own_object(cid)
    if not car:
        return []
    out = []
    for im in (car.get('car_images') or []):
        u = im.get('original') or im.get('thumbnail_url') if isinstance(im, dict) else im
        if not u:
            continue
        u = cd.shrink(u)
        if u not in out:
            out.append(u)
        if len(out) >= cd.MAX_IMAGES:
            break
    return out


def load(path):
    rows = json.loads(open(path, encoding='utf-8').read())
    return rows


def save(path, rows):
    """Written exactly as both files already are, one record a line, so the
    daily diff stays one line per car that changed."""
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('[\n')
        fh.write(',\n'.join('  ' + json.dumps(r, ensure_ascii=False) for r in rows))
        fh.write('\n]\n')


def set_image(rec, url):
    """Replace `image`, keeping the field order the file is written in.

    The snapshot's order is fixed and read by several pages, so a record that
    has no image yet gets one inserted before `url` rather than appended. A
    car with no photograph to give it is left exactly as it was: both files
    leave an absent value out rather than writing it empty, and the pages test
    the field before drawing a card, so an empty string is a shape change for
    nothing.
    """
    if not url:
        return rec
    if 'image' in rec:
        rec['image'] = url
        return rec
    out = {}
    for k, v in rec.items():
        if k == 'url':
            out['image'] = url
        out[k] = v
    if 'image' not in out:
        out['image'] = url
    return out


def pass_over(name, path, live, check_only):
    rows = load(path)
    before = {r['id']: (r.get('image') or '') for r in rows}

    # 1: the list payload, which is current for nearly every car
    wanted = {r['id']: (live.get(r['id']) or before[r['id']]) for r in rows}

    # 2: does it actually load
    state = check_all(wanted.values())

    # 3: one listing page each for whatever is still dead
    broken = [cid for cid, u in wanted.items() if not state.get(u)]
    mended, lost = 0, []
    for cid in broken:
        u, why = from_listing(cid)
        if u and resolves(u):
            wanted[cid] = u
            mended += 1
        else:
            wanted[cid] = before[cid]   # keep what it had, never blank it
            lost.append((cid, why))

    changed = [cid for cid in wanted if wanted[cid] != before[cid]]
    stale = [cid for cid in changed if before[cid] and not state.get(before[cid])]

    print('%s: %d cars, %d images changed (%d of them were dead), '
          '%d mended off a listing page, %d still without one'
          % (name, len(rows), len(changed), len(stale), mended, len(lost)))
    SAYS = {'gone': 'listing page has gone, the car will drop out tomorrow',
            'nophotos': 'listing is up but Hedin publish no photographs',
            'unreachable': 'listing page could not be fetched'}
    for cid, why in lost:
        reg = next((r.get('reg', '') for r in rows if r['id'] == cid), '')
        print('   %s %s: %s' % (cid, reg, SAYS.get(why, why)))

    if not check_only and changed:
        save(path, [set_image(r, wanted[r['id']]) for r in rows])

    # see the module docstring: one or two of these every morning is Hedin
    # being Hedin, a twentieth of the file is something broken at our end
    bad = len(lost) if len(lost) > max(3, len(rows) // 20) else 0
    return bad, [r['id'] for r in rows]


def gallery_pass(ids, check_only):
    """The other five photographs on a card, from `car-details.json`.

    The hero is only the first slide. The rest come from a file that is
    fetched once a car and then treated as done for ever, because equipment
    does not change once a car is on the forecourt - which is true of the
    equipment and not of the photographs, and left 98 dead gallery slides
    across 22 cars in stock. Only a car with something actually broken costs
    a fetch, so an ordinary morning is a handful.
    """
    if not os.path.exists(DETAILS):
        print('gallery: %s is not here, skipped' % os.path.relpath(DETAILS))
        return 0
    det = json.loads(open(DETAILS, encoding='utf-8').read())

    pairs = []
    for cid in ids:
        for u in (det.get(cid) or {}).get('images', []):
            pairs.append((cid, u if u.startswith('http')
                          else cd.CDN + u + '-enlarged.jpg'))
    state = check_all(u for _, u in pairs)
    broken = sorted({cid for cid, u in pairs if not state.get(u)})

    def full(u):
        return u if u.startswith('http') else cd.CDN + u + '-enlarged.jpg'

    mended, lost = 0, []
    for cid in broken:
        shots = gallery_from_listing(cid)
        ok = check_all(full(u) for u in shots)
        # only the ones that answered are kept, so a listing that is itself
        # half re-processed leaves a shorter gallery rather than a broken one
        good = [u for u in shots if ok.get(full(u))]
        if good:
            det[cid]['images'] = good
            mended += 1
        else:
            lost.append(cid)

    print('gallery: %d photographs on %d cars in stock, %d dead across %d cars, '
          '%d cars re-read, %d left broken'
          % (len(pairs), len(ids), sum(1 for _, u in pairs if not state.get(u)),
             len(broken), mended, len(lost)))

    if not check_only and mended:
        with open(DETAILS, 'w', encoding='utf-8') as fh:
            fh.write('{\n')
            keys = sorted(det)
            for n, k in enumerate(keys):
                fh.write(' %s: %s%s\n'
                         % (json.dumps(k), json.dumps(det[k], sort_keys=True),
                            ',' if n < len(keys) - 1 else ''))
            fh.write('}\n')
    return len(lost) if len(lost) > max(3, len(ids) // 20) else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--check', action='store_true',
                    help='report what is wrong and write nothing')
    ap.add_argument('--hero-only', action='store_true',
                    help='skip the gallery pass over car-details.json')
    args = ap.parse_args()

    live = live_images()
    print('list payload carries a photograph for %d cars' % len(live))

    lost, in_stock = 0, []
    for name, path in (('snapshot', SNAP), ('group', GROUP)):
        if os.path.exists(path):
            bad, ids = pass_over(name, path, live, args.check)
            lost += bad
            in_stock += ids
        else:
            print('%s: %s is not here, skipped' % (name, os.path.relpath(path)))

    if not args.hero_only:
        lost += gallery_pass(in_stock, args.check)

    if lost:
        raise SystemExit('%d cars have no photograph that loads' % lost)


if __name__ == '__main__':
    main()
