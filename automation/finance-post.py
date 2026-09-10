#!/usr/bin/env python3
"""Build Instagram finance-quote posts from Hedin Ruxley stock.

Picks cars from automation/hedin-stock-snapshot.json, pulls a real BMW
Financial Services quote for each via finance-quote.py, and renders a
1080x1350 PNG plus a caption.

    python3 automation/finance-post.py --count 3 --out out/

Every figure on the card comes from the retailer's own quote engine. Nothing
is calculated here, and a car the lender will not quote is skipped rather
than guessed at.

Requires playwright (chromium) for rendering.
"""
import argparse, base64, datetime, json, os, re, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SNAP = os.path.join(ROOT, 'automation', 'hedin-stock-snapshot.json')
LOG  = os.path.join(ROOT, 'automation', 'finance-post-log.json')
POSTS = os.path.join(ROOT, 'finance-posts')
INDEX = os.path.join(POSTS, 'index.json')
UA   = 'Mozilla/5.0 (compatible; dan-sells-stock/1.0)'
JPEG_QUALITY = 0.86

# Hedin's own published disclosure - do not paraphrase it.
FCA = ("Hedin Automotive London Ltd & Stephen James (Automotive) Limited are an "
       "appointed representative of ITC Compliance Limited which is authorised and "
       "regulated by the Financial Conduct Authority (their registration number is "
       "313486). Permitted activities include advising on and arranging general "
       "insurance contracts and acting as a credit broker not a lender. Finance is "
       "subject to status. Terms and conditions apply. Applicants must be 18 or over "
       "and UK residents.")


def deposit_for(price, flat, pct, tier_at):
    """Flat cash deposit on the cheaper stock, a percentage above the tier.

    A flat £1,000 keeps the monthly figure a true like-for-like across the
    range, but against a £70k car it leaves so much on finance that the lender
    often will not quote at all. Above the tier the deposit scales instead.
    """
    return round(price * pct / 100.0, 2) if price >= tier_at else float(flat)


def money(n, dp=0):
    return '£{:,.{dp}f}'.format(n, dp=dp)


def exact(n):
    """Pence only when there are pence - a tiered deposit is rarely round, and
    rounding it on the card while the representative example gives the true
    figure below is a mismatch on a regulated promotion."""
    return money(n, 0 if float(n) == int(n) else 2)


def quote_car(listing_id, deposit, term, mileage):
    r = subprocess.run(
        [sys.executable, os.path.join(HERE, 'finance-quote.py'), str(listing_id),
         '--deposit', str(deposit), '--term', str(term),
         '--mileage', str(mileage)],
        capture_output=True, text=True, timeout=180)
    if r.returncode != 0 or not r.stdout.strip().startswith('{'):
        return None, (r.stderr or r.stdout).strip().splitlines()[-1:] or ['no quote']
    return json.loads(r.stdout), None


CHROMIUM = os.environ.get('CHROMIUM_PATH', '/opt/pw-browsers/chromium')


def _chromium(args, timeout=180):
    return subprocess.run([CHROMIUM, '--headless', '--disable-gpu', '--no-sandbox',
                           '--hide-scrollbars'] + args,
                          capture_output=True, text=True, timeout=timeout)


def render(html_path, jpg_path):
    """Rasterise a card to JPEG with headless chromium.

    The browser binary rather than the playwright package, because this runs
    unattended every morning and should not depend on an npm install first.

    Chromium only screenshots to PNG, and a PNG of a photograph is about four
    times the size of the equivalent JPEG - three of those a day would put a
    gigabyte a year into the repository. So the PNG is a temporary, re-encoded
    through a canvas in a second chromium pass and thrown away.
    """
    png = jpg_path + '.tmp.png'
    r = _chromium(['--force-device-scale-factor=1', '--screenshot=' + png,
                   '--window-size=1080,1920', 'file://' + os.path.abspath(html_path)])
    if not os.path.exists(png):
        raise SystemExit('render failed for %s: %s' % (html_path, r.stderr[-400:]))

    enc = jpg_path + '.tmp.html'
    open(enc, 'w').write(
        '<html><body><img id="i" src="data:image/png;base64,%s">'
        '<div id="out"></div><script>var i=document.getElementById("i");'
        'function go(){var c=document.createElement("canvas");'
        'c.width=i.naturalWidth;c.height=i.naturalHeight;'
        'c.getContext("2d").drawImage(i,0,0);'
        'document.getElementById("out").textContent=c.toDataURL("image/jpeg",%s);}'
        'if(i.complete)go();else i.onload=go;</script></body></html>'
        % (base64.b64encode(open(png, 'rb').read()).decode(), JPEG_QUALITY))
    r = _chromium(['--virtual-time-budget=10000', '--dump-dom',
                   'file://' + os.path.abspath(enc)])
    m = re.search(r'data:image/jpeg;base64,([A-Za-z0-9+/=]+)', r.stdout)
    os.remove(enc)
    if not m:
        os.replace(png, jpg_path.replace('.jpg', '.png'))
        raise SystemExit('jpeg encode failed for %s; kept the png' % html_path)
    open(jpg_path, 'wb').write(base64.b64decode(m.group(1)))
    os.remove(png)


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def data_uri(url):
    """The snapshot stores the 700px '-preview' image, which is all the stock
    list needs. A story is 1080 wide, so upscaling that is visibly soft - the
    CDN also serves a 1920x1080 '-original', so try that first."""
    if '-preview.' in url:
        try:
            return ('data:image/jpeg;base64,'
                    + base64.b64encode(fetch(url.replace('-preview.', '-original.'))).decode())
        except Exception:
            pass
    return 'data:image/jpeg;base64,' + base64.b64encode(fetch(url)).decode()


def card_html(car, q, photo):
    f = q['finance']
    rep = (
        '{payments} monthly payments of {monthly}. Cash price {price}. '
        'Customer deposit {dep}. Total amount of credit {credit}. '
        'Optional final payment {gfv}. Total amount payable {total}. '
        'Duration {term} months. {mileage:,} miles a year, {excess}p per excess mile. '
        '{apr}% APR representative. Lender {lender}.'
    ).format(
        payments=f['payments'], monthly=money(f['monthly'], 2), price=money(car['price_n']),
        dep=money(f['deposit'], 2),
        credit=money(car['price_n'] - f['deposit'], 2), gfv=money(f['final_payment'], 2),
        total=money(f['total_payable'], 2), term=f['term_months'],
        mileage=f['annual_mileage'], excess=f['excess_mileage_pence'],
        apr=f['apr'], lender=f['lender'])

    return """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  /* 1080x1920 for an Instagram story. Instagram draws its own UI over roughly
     the top and bottom 250px, so nothing that has to be read - the wordmark,
     the payment, and above all the representative example and the FCA line -
     may sit outside 250..1670. The photograph may bleed into those bands
     because losing a strip of it costs nothing. */
  @page{{size:1080px 1920px;margin:0}}
  *{{box-sizing:border-box;margin:0;padding:0}}
  :root{{--ink:#0a0c0f;--ink-2:#0e1114;--paper:#ece9e1;--body-c:#b9b5ab;
    --dim:#847f75;--hair:rgba(236,233,225,.14);--accent:#5b8ac9;
    --serif:'Sentient',Georgia,'Times New Roman',serif;
    --sans:'Satoshi',ui-sans-serif,system-ui,-apple-system,'Helvetica Neue',sans-serif}}
  body{{width:1080px;height:1920px;background:var(--ink);color:var(--paper);
    font-family:var(--sans);display:flex;flex-direction:column;overflow:hidden}}
  .top{{flex:0 0 350px;display:flex;align-items:flex-end;justify-content:space-between;
    padding:0 64px 26px}}
  .mark{{font-size:25px;letter-spacing:.24em;font-weight:600}}
  .mark small{{display:block;font-size:13px;letter-spacing:.3em;color:var(--body-c);
    font-weight:400;margin-top:7px}}
  .site{{font-size:15px;letter-spacing:.16em;color:var(--body-c);padding-bottom:4px}}
  /* the photograph keeps its own 16:9 - cropping it to a tall box cut the car
     in half at both ends */
  .shot{{flex:0 0 auto;height:606px}}
  .shot img{{width:1080px;height:606px;object-fit:cover;display:block}}
  .over{{flex:0 0 194px;padding:26px 64px 0}}
  .plabel{{font-size:15px;letter-spacing:.26em;text-transform:uppercase;
    color:var(--accent);margin-bottom:16px}}
  .name{{font-family:var(--serif);font-size:60px;line-height:1.04;font-weight:400;
    letter-spacing:-.01em}}
  .sub{{font-size:18px;letter-spacing:.13em;text-transform:uppercase;color:var(--body-c);
    margin-top:16px}}
  .figs{{flex:0 0 270px;display:flex;align-items:center;gap:44px;padding:0 64px}}
  .pay{{flex:0 0 auto}}
  .pay .amt{{font-size:104px;line-height:.9;font-weight:700;letter-spacing:-.035em}}
  .pay .per{{font-size:19px;letter-spacing:.2em;text-transform:uppercase;
    color:var(--body-c);margin-top:16px}}
  .pay .prod{{font-size:15px;letter-spacing:.1em;color:var(--dim);margin-top:9px}}
  .grid{{flex:1 1 auto;display:grid;grid-template-columns:1fr 1fr;gap:24px 30px;
    border-left:1px solid var(--hair);padding-left:44px}}
  .grid div small{{display:block;font-size:12.5px;letter-spacing:.17em;
    text-transform:uppercase;color:var(--dim);margin-bottom:7px}}
  .grid div b{{font-size:28px;font-weight:600;letter-spacing:-.01em}}
  .legal{{flex:0 0 250px;padding:22px 64px 0;background:var(--ink-2);
    border-top:1px solid var(--hair)}}
  .rep{{font-size:13.5px;line-height:1.5;color:var(--body-c);margin-bottom:9px}}
  .rep b{{color:var(--paper)}}
  .fca{{font-size:11px;line-height:1.45;color:#6f6a61}}
  .tail{{flex:1 1 auto;background:var(--ink-2)}}
</style></head><body>
  <div class="top">
    <div class="mark">DAN SELLS<small>BMW &middot; HEDIN RUXLEY</small></div>
    <div class="site">dan-sells.co.uk</div>
  </div>
  <div class="shot"><img src="{photo}"/></div>
  <div class="over">
    <div class="plabel">Approved used &middot; in stock now</div>
    <div class="name">{model}</div>
    <div class="sub">{year} &middot; {colour} &middot; {mileage:,} miles</div>
  </div>
  <div class="figs">
    <div class="pay">
      <div class="amt">{monthly}</div>
      <div class="per">A month</div>
      <div class="prod">{product}</div>
    </div>
    <div class="grid">
      <div><small>Cash price</small><b>{price}</b></div>
      <div><small>Deposit</small><b>{dep}</b></div>
      <div><small>Term</small><b>{term} months</b></div>
      <div><small>Optional final payment</small><b>{gfv}</b></div>
    </div>
  </div>
  <div class="legal">
    <p class="rep"><b>Representative example.</b> {rep}</p>
    <p class="fca">{fca}</p>
  </div>
  <div class="tail"></div>
</body></html>""".format(
        model=car['model'].replace('BMW ', ''), year=car['year'], colour=car['colour'],
        mileage=car['mileage_n'], photo=photo, monthly=money(f['monthly']),
        product=f['product'], price=money(car['price_n']), dep=exact(f['deposit']),
        term=f['term_months'], gfv=money(f['final_payment']), rep=rep, fca=FCA)


def caption(car, q):
    f = q['finance']
    return (
        "{model} - {colour}, {year}\n"
        "{mileage:,} miles | {price}\n\n"
        "{monthly} a month on BMW Select (PCP) with {dep} down, {term} months, "
        "{miles:,} miles a year.\n\n"
        "Want the figures on a different deposit or term? Drop me a message and I will "
        "run it properly for you - no forms, no call centre.\n\n"
        "Representative example: {payments} monthly payments of {monthly2}. Cash price "
        "{price}. Deposit {dep2}. Optional final payment {gfv}. Total amount payable "
        "{total}. {apr}% APR representative. Finance from {lender}, subject to status, "
        "18+, UK residents.\n\n"
        "#BMW #ApprovedUsed #HedinRuxley #BMWFinance #{tag}"
    ).format(
        model=car['model'], colour=car['colour'], year=car['year'],
        mileage=car['mileage_n'], price=money(car['price_n']),
        monthly=money(f['monthly']), monthly2=money(f['monthly'], 2),
        term=f['term_months'], miles=f['annual_mileage'],
        payments=f['payments'], dep=exact(f['deposit']), dep2=money(f['deposit'], 2),
        gfv=money(f['final_payment'], 2), total=money(f['total_payable'], 2),
        apr=f['apr'], lender=f['lender'],
        tag=re.sub(r'[^A-Za-z0-9]', '', car['series']))


def write_index(made, a, today):
    """Rebuild finance-posts/index.json and drop anything past its keep window.

    The gallery page reads this file, so it is the record of what exists - the
    PNGs on disk follow it, not the other way round.
    """
    idx = {'posts': []}
    if os.path.exists(INDEX):
        try:
            idx = json.load(open(INDEX))
        except Exception:
            pass
    posts = [p for p in idx.get('posts', []) if p.get('date') != today]

    for base, car, q in made:
        f = q['finance']
        stem = os.path.basename(base)
        posts.append({
            'date': today, 'reg': car['reg'], 'model': car['model'],
            'series': car['series'], 'year': car['year'], 'colour': car['colour'],
            'mileage': car['mileage'], 'price': car['price'],
            'image': stem + '.jpg', 'caption': open(base + '.txt').read(),
            'listing': car['url'],
            'monthly': f['monthly'], 'apr': f['apr'], 'deposit': f['deposit'],
            'term': f['term_months'], 'annual_mileage': f['annual_mileage'],
            'product': f['product'], 'lender': f['lender'],
            'quote_reference': f['quote_reference'], 'quoted_at': f['quoted_at'],
            'valid_to': f['valid_to'],
        })

    cutoff = (datetime.date.today() - datetime.timedelta(days=a.keep_days)).isoformat()
    keep = [p for p in posts if p['date'] >= cutoff]
    dropped = [p for p in posts if p['date'] < cutoff]
    for p in dropped:
        for ext in ('.jpg', '.png', '.txt', '.json'):
            f = os.path.join(POSTS, p['image'].replace('.jpg', ext))
            if os.path.exists(f):
                os.remove(f)

    keep.sort(key=lambda p: (p['date'], p['reg']), reverse=True)
    json.dump({'generated': datetime.datetime.now().isoformat(timespec='seconds'),
               'terms': {'deposit': a.deposit, 'deposit_pct': a.deposit_pct,
                         'tier_at': a.tier_at, 'term': a.term, 'mileage': a.mileage},
               'posts': keep}, open(INDEX, 'w'), indent=2)
    if dropped:
        print('  pruned %d card(s) older than %s' % (len(dropped), cutoff))


def n(s):
    return int(re.sub(r'[^0-9]', '', str(s)) or 0)


def pick(cars, count, recent):
    """One car per price band where possible, skipping anything posted recently."""
    bands = [(0, 30000), (30000, 50000), (50000, 10**9)]
    used = set(recent)
    # Build a queue per band, then round-robin so the run spans price points even
    # when a car in one band turns out to be ineligible for finance.
    queues = []
    for lo, hi in bands:
        pool = [c for c in cars if lo <= c['price_n'] < hi and c['reg'] not in used]
        pool.sort(key=lambda c: c['mileage_n'])
        queues.append(pool)
    out = []
    while any(queues) and len(out) < count:
        for qd in queues:
            if qd:
                c = qd.pop(0)
                if c['reg'] not in used:
                    out.append(c); used.add(c['reg'])
            if len(out) >= count:
                break
    pool = sorted([c for c in cars if c['reg'] not in used], key=lambda c: c['mileage_n'])
    out.extend(pool[:count - len(out)])
    return out[:count]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--count', type=int, default=3)
    ap.add_argument('--out', default=POSTS)
    ap.add_argument('--keep-days', type=int, default=10,
                    help='prune cards older than this from the gallery')
    ap.add_argument('--deposit', type=float, default=1000.0,
                    help='flat cash deposit for cars below --tier-at')
    ap.add_argument('--deposit-pct', type=float, default=10.0,
                    help='deposit as %% of cash price for cars at/above --tier-at')
    ap.add_argument('--tier-at', type=float, default=40000.0,
                    help='cash price at which the deposit switches to a percentage')
    ap.add_argument('--term', type=int, default=48)
    ap.add_argument('--mileage', type=int, default=8000)
    ap.add_argument('--cooldown-days', type=int, default=21)
    ap.add_argument('--reg', action='append', help='post these regs instead of picking')
    a = ap.parse_args()

    cars = json.load(open(SNAP))
    for c in cars:
        c['price_n'] = n(c['price']); c['mileage_n'] = n(c['mileage'])

    log = json.load(open(LOG)) if os.path.exists(LOG) else {}
    cutoff = (datetime.date.today() - datetime.timedelta(days=a.cooldown_days)).isoformat()
    recent = {r for r, d in log.items() if d >= cutoff}

    if a.reg:
        chosen = [c for c in cars if c['reg'] in set(a.reg)]
    else:
        # Ask for more than we need: some cars the lender will not quote, and a
        # short post run is worse than a slightly different car.
        chosen = pick(cars, a.count * 4, recent)
    os.makedirs(a.out, exist_ok=True)
    today = datetime.date.today().isoformat()
    made, skipped = [], []

    for car in chosen:
        if len(made) >= a.count and not a.reg:
            break
        dep = deposit_for(car['price_n'], a.deposit, a.deposit_pct, a.tier_at)
        q, err = quote_car(car['id'], dep, a.term, a.mileage)
        if not q:
            skipped.append((car['reg'], car['model'], err[0] if err else 'no quote'))
            continue
        base = os.path.join(a.out, '%s-%s' % (today, car['reg']))
        open(base + '.build.html', 'w').write(card_html(car, q, data_uri(car['image'])))
        open(base + '.txt', 'w').write(caption(car, q))
        json.dump(q, open(base + '.json', 'w'), indent=2)
        made.append((base, car, q))
        log[car['reg']] = today

    for base, _, _ in made:
        render(base + '.build.html', base + '.jpg')
        os.remove(base + '.build.html')
    json.dump(log, open(LOG, 'w'), indent=2, sort_keys=True)

    if a.out == POSTS:
        write_index(made, a, today)

    for base, car, q in made:
        print('  made %-9s %-34s %s/mo  %s%% APR  -> %s.jpg' % (
            car['reg'], car['model'][:33], money(q['finance']['monthly']),
            q['finance']['apr'], os.path.basename(base)))
    for reg, model, why in skipped:
        print('  skip %-9s %-34s %s' % (reg, model[:33], why))
    if not made:
        sys.exit('no posts produced')


if __name__ == '__main__':
    main()
