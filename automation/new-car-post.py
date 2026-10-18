#!/usr/bin/env python3
"""Build the Instagram card for each of today's brand new offers.

The used car cards (finance-post.py) have been built every morning since
August. The two brand new cars on todays-offers.html had no card at all, so
Dan could post three of the day's five offers and not the other two.

Two rules this job exists to keep:

**The cars are the page's, not this script's.** `new-card-plan.mjs` runs
`new-pair.js` and `dsfinance.js`, the very files the browser runs, and hands
back today's pair with its finance already decided. Nothing here picks a car
or works out a payment. A card for a car the page is not offering, or a
monthly the page would not show, is the fault worth designing out, and this
repo has been bitten by twinned code before (shrinkShot/shrink, clipKey).

**A monthly figure never appears without the whole representative example.**
The figures are BMW Financial Services' own quote for that exact car, recorded
from BMW's own page for it by new-stock-quotes.mjs. A quote that fails any of
the checks in dsFin.newOk - a missing item, a sum that does not add up, a
lapsed campaign, or a quotes file more than three days old - produces a card
with no payment on it at all, which is the honest card rather than no card.

    python3 automation/new-car-post.py              # today, two cards
    python3 automation/new-car-post.py --day 2026-10-19 --count 1 --out /tmp/x

Renders with headless chromium (CHROMIUM_PATH), the same way finance-post.py
does, by importing its render step rather than copying it.
"""
import argparse, datetime, importlib.util, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
POSTS = os.path.join(ROOT, 'finance-posts')
INDEX = os.path.join(POSTS, 'new-index.json')

spec = importlib.util.spec_from_file_location('financepost', os.path.join(HERE, 'finance-post.py'))
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)


def plan(day, count):
    """Today's cars, with their finance already decided by the page's own rules."""
    cmd = ['node', os.path.join(HERE, 'new-card-plan.mjs')]
    if day:
        cmd.append(day)
        cmd.append(str(count))
    else:
        cmd += [datetime.date.today().isoformat(), str(count)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if r.returncode != 0 or not r.stdout.strip().startswith('{'):
        sys.exit('new-card-plan.mjs failed: %s' % (r.stderr or r.stdout)[-500:])
    return json.loads(r.stdout)


def money(n, dp=0):
    return fp.money(n, dp)


def fin_rows(c):
    """The four figures beside the payment, or beside the price when the
    lender's quote is not there to be shown."""
    f = c.get('finance')
    if f:
        return [('Cash price', money(f['cash_price'])),
                ('Deposit', fp.exact(f['deposit'])),
                ('Term', '%s months' % f['term_months']),
                ('Optional final payment', money(f['final_payment']))]
    rows = []
    if c['weeks']:
        rows.append(('Delivery', c['weeks']))
    if c.get('zero_to_62'):
        rows.append(('0 to 62mph', '%ss' % c['zero_to_62']))
    if c['fuel']:
        rows.append(('Fuel', c['fuel']))
    if c['transmission']:
        rows.append(('Gearbox', c['transmission']))
    if c.get('seats'):
        rows.append(('Seats', str(c['seats'])))
    return rows[:4]


def card_html(c, broker, photo):
    f = c.get('finance')
    big = money(f['monthly']) if f else (c['price'] or '')
    # The price kind is two lines of its own rather than a long strap under the
    # figure: BMW publish one price a car and whose it is, and the card says
    # which kind it is rather than claiming a saving it cannot evidence.
    per = 'A month' if f else ('Hedin Ruxley price' if c['price_kind'].startswith('Hedin')
                               else 'BMW price')
    prod = ('%s, %s miles a year' % (f['product'], '{:,}'.format(f['annual_mileage']))) if f \
        else 'On the road. Finance available, ask me for a personalised quote'
    legal = ('<p class="rep"><b>Representative example.</b> %s</p><p class="fca">%s</p>'
             % (c['rep'], broker)) if f else (
        '<p class="rep"><b>Finance available.</b> I will put a personalised quotation '
        'together on your own deposit, mileage and term, in writing.</p>'
        '<p class="fca">%s</p>' % broker)
    grid = ''.join('<div><small>%s</small><b>%s</b></div>' % (k, v) for k, v in fin_rows(c))
    sub = ' &middot; '.join(x for x in [c['colour'], c['transmission'],
                                        (c['weeks'] + ' away') if c['weeks'] else ''] if x)

    return """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  /* 1080x1920 for an Instagram story, and the bands add to 1670 exactly for
     the same reason the used card's do: Instagram draws its own UI over
     roughly the top and bottom 250px, and the representative example may
     never sit under it. */
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
  /* BMW's picture of a brand new car is a configurator render on white, not a
     photograph, so it sits on its own white panel and is never cropped: a
     render bled into the dark page would be a grey box with a car in it. It
     is not stretched past its own size either, because 733px upscaled to 1080
     is visibly soft. */
  .shot{{flex:0 0 606px;background:#fff;display:flex;align-items:center;
    justify-content:center;position:relative}}
  .shot img{{max-width:1000px;max-height:560px;display:block}}
  .tag{{position:absolute;left:0;top:0;background:var(--ink);color:var(--paper);
    font-size:15px;letter-spacing:.24em;text-transform:uppercase;padding:14px 26px}}
  .over{{flex:0 0 194px;padding:26px 64px 0}}
  .plabel{{font-size:15px;letter-spacing:.26em;text-transform:uppercase;
    color:var(--accent);margin-bottom:16px}}
  .name{{font-family:var(--serif);font-size:60px;line-height:1.04;font-weight:400;
    letter-spacing:-.01em}}
  .sub{{font-size:18px;letter-spacing:.13em;text-transform:uppercase;color:var(--body-c);
    margin-top:16px}}
  .figs{{flex:0 0 270px;display:flex;align-items:center;gap:44px;padding:0 64px}}
  .pay{{flex:0 0 auto;max-width:430px}}
  .pay .amt{{font-size:{amtsize}px;line-height:.9;font-weight:700;letter-spacing:-.035em}}
  .pay .per{{font-size:19px;letter-spacing:.2em;text-transform:uppercase;
    color:var(--body-c);margin-top:16px}}
  .pay .prod{{font-size:15px;letter-spacing:.1em;color:var(--dim);margin-top:9px;line-height:1.4}}
  .grid{{flex:1 1 auto;display:grid;grid-template-columns:1fr 1fr;gap:24px 30px;
    border-left:1px solid var(--hair);padding-left:44px}}
  .grid div small{{display:block;font-size:12.5px;letter-spacing:.17em;
    text-transform:uppercase;color:var(--dim);margin-bottom:7px;min-height:14px}}
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
  <div class="shot"><span class="tag">Brand new</span><img src="{photo}"/></div>
  <div class="over">
    <div class="plabel">Brand new &middot; built &middot; unregistered</div>
    <div class="name">{model}</div>
    <div class="sub">{sub}</div>
  </div>
  <div class="figs">
    <div class="pay">
      <div class="amt">{big}</div>
      <div class="per">{per}</div>
      <div class="prod">{prod}</div>
    </div>
    <div class="grid">{grid}</div>
  </div>
  <div class="legal">{legal}</div>
  <div class="tail"></div>
</body></html>""".format(
        photo=photo, model=('BMW ' + c['description']).replace('BMW BMW ', 'BMW '),
        sub=sub, big=big, per=per, prod=prod, grid=grid, legal=legal,
        amtsize=104 if f else 78)


def caption(c, broker):
    f = c.get('finance')
    L = ['Brand new BMW %s, built and waiting, unregistered.' % c['description']]
    L.append(' | '.join(x for x in [c['colour'], c['transmission'],
                                    ('Delivery ' + c['weeks']) if c['weeks'] else ''] if x))
    L.append('')
    L.append('%s, %s.' % (c['price'], c['price_kind']))
    if f:
        L.append('')
        L.append('%s a month on %s with %s down, %s months, %s miles a year.'
                 % (money(f['monthly']), f['product'], fp.exact(f['deposit']),
                    f['term_months'], '{:,}'.format(f['annual_mileage'])))
        L.append('')
        L.append('Want it on your own deposit, mileage or term? Message me and I will have '
                 'it quoted properly, in writing.')
        L.append('')
        L.append('Representative example: %s' % c['rep'])
        L.append(broker)
    else:
        L.append('')
        L.append('Finance available through BMW Financial Services. Message me and I will put '
                 'a personalised quotation together on your own deposit, mileage and term.')
    L.append('')
    L.append('#BMW #BrandNew #HedinRuxley%s' % (
        ' #' + re.sub(r'[^A-Za-z0-9]', '', c['series']) if c['series'] else ''))
    return '\n'.join(L)


def write_index(made, day, keep_days):
    idx = {'posts': []}
    if os.path.exists(INDEX):
        try:
            idx = json.load(open(INDEX))
        except Exception:
            pass
    posts = [p for p in idx.get('posts', []) if p.get('date') != day]
    for base, c in made:
        f = c.get('finance') or {}
        posts.append({
            'date': day, 'order': c['order'],
            'model': ('BMW ' + c['description']).replace('BMW BMW ', 'BMW '),
            'series': c['series'], 'colour': c['colour'], 'price': c['price'],
            'price_kind': c['price_kind'], 'delivery': c['weeks'],
            'image': os.path.basename(base) + '.jpg',
            'caption': open(base + '.txt').read(),
            'monthly': f.get('monthly'), 'apr': f.get('apr'),
            'deposit': f.get('deposit'), 'term': f.get('term_months'),
            'annual_mileage': f.get('annual_mileage'),
            'product': f.get('product'), 'lender': f.get('lender'),
            'valid_to': f.get('valid_to'),
        })
    cutoff = (datetime.date.fromisoformat(day) - datetime.timedelta(days=keep_days)).isoformat()
    keep = [p for p in posts if p['date'] >= cutoff]
    for p in [p for p in posts if p['date'] < cutoff]:
        for ext in ('.jpg', '.png', '.txt', '.json'):
            old = os.path.join(POSTS, p['image'].replace('.jpg', ext))
            if os.path.exists(old):
                os.remove(old)
    keep.sort(key=lambda p: (p['date'], p['order']), reverse=True)
    json.dump({'generated': datetime.datetime.now().isoformat(timespec='seconds'),
               'posts': keep}, open(INDEX, 'w'), indent=2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--day', help='London date to build for (default today)')
    ap.add_argument('--count', type=int, default=2)
    ap.add_argument('--out', default=POSTS)
    ap.add_argument('--keep-days', type=int, default=10)
    a = ap.parse_args()

    p = plan(a.day, a.count)
    day, cars = p['day'], p['cars']
    if not cars:
        sys.exit('no brand new cars to post')
    os.makedirs(a.out, exist_ok=True)

    made = []
    for c in cars:
        base = os.path.join(a.out, '%s-new-%s' % (day, c['order']))
        photo = fp.data_uri(c['image']) if c['image'] else ''
        open(base + '.build.html', 'w').write(card_html(c, p['broker'], photo))
        open(base + '.txt', 'w').write(caption(c, p['broker']))
        json.dump(c, open(base + '.json', 'w'), indent=2)
        made.append((base, c))

    for base, _ in made:
        fp.render(base + '.build.html', base + '.jpg')
        os.remove(base + '.build.html')

    if os.path.abspath(a.out) == os.path.abspath(POSTS):
        write_index(made, day, a.keep_days)

    for base, c in made:
        f = c.get('finance')
        print('  made %-9s %-34s %s -> %s.jpg' % (
            c['order'], c['description'][:33],
            (money(f['monthly']) + '/mo') if f else ('no monthly'
                + (', quote rejected' if c.get('quote_rejected') else ', no quote')),
            os.path.basename(base)))


if __name__ == '__main__':
    main()
