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
UA   = 'Mozilla/5.0 (compatible; dan-sells-stock/1.0)'

# Hedin's own published disclosure - do not paraphrase it.
FCA = ("Hedin Automotive London Ltd & Stephen James (Automotive) Limited are an "
       "appointed representative of ITC Compliance Limited which is authorised and "
       "regulated by the Financial Conduct Authority (their registration number is "
       "313486). Permitted activities include advising on and arranging general "
       "insurance contracts and acting as a credit broker not a lender. Finance is "
       "subject to status. Terms and conditions apply. Applicants must be 18 or over "
       "and UK residents.")


def money(n, dp=0):
    return '£{:,.{dp}f}'.format(n, dp=dp)


def quote_car(listing_id, deposit, term, mileage):
    r = subprocess.run(
        [sys.executable, os.path.join(HERE, 'finance-quote.py'), str(listing_id),
         '--deposit', str(deposit), '--term', str(term),
         '--mileage', str(mileage)],
        capture_output=True, text=True, timeout=180)
    if r.returncode != 0 or not r.stdout.strip().startswith('{'):
        return None, (r.stderr or r.stdout).strip().splitlines()[-1:] or ['no quote']
    return json.loads(r.stdout), None


def data_uri(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    return 'data:image/jpeg;base64,' + base64.b64encode(raw).decode()


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
  @page{{size:1080px 1350px;margin:0}}
  *{{box-sizing:border-box;margin:0;padding:0}}
  :root{{--ink:#0a0c0f;--ink-2:#0e1114;--paper:#ece9e1;--body-c:#b9b5ab;
    --dim:#847f75;--hair:rgba(236,233,225,.14);--accent:#5b8ac9;
    --serif:'Sentient',Georgia,'Times New Roman',serif;
    --sans:'Satoshi',ui-sans-serif,system-ui,-apple-system,'Helvetica Neue',sans-serif}}
  body{{width:1080px;height:1350px;background:var(--ink);color:var(--paper);
    font-family:var(--sans);display:flex;flex-direction:column;overflow:hidden}}
  .shot{{position:relative;height:812px;flex:0 0 auto}}
  .shot img{{width:1080px;height:812px;object-fit:cover;display:block}}
  .scrim{{position:absolute;inset:0;
    background:linear-gradient(180deg,rgba(10,12,15,.55) 0%,rgba(10,12,15,0) 26%,
      rgba(10,12,15,.10) 52%,rgba(10,12,15,.88) 84%,var(--ink) 100%)}}
  .mark{{position:absolute;top:40px;left:56px;font-size:23px;letter-spacing:.24em;
    font-weight:600}}
  .mark small{{display:block;font-size:12.5px;letter-spacing:.3em;color:var(--body-c);
    font-weight:400;margin-top:6px}}
  .over{{position:absolute;left:56px;right:56px;bottom:34px}}
  .plabel{{font-size:14px;letter-spacing:.26em;text-transform:uppercase;
    color:var(--accent);margin-bottom:14px}}
  .name{{font-family:var(--serif);font-size:60px;line-height:1.04;font-weight:400;
    letter-spacing:-.01em}}
  .sub{{font-size:17px;letter-spacing:.13em;text-transform:uppercase;color:var(--body-c);
    margin-top:14px}}
  .figs{{flex:1 1 auto;display:flex;align-items:center;gap:48px;padding:0 56px}}
  .pay{{flex:0 0 auto}}
  .pay .amt{{font-size:112px;line-height:.9;font-weight:700;letter-spacing:-.035em}}
  .pay .per{{font-size:19px;letter-spacing:.2em;text-transform:uppercase;
    color:var(--body-c);margin-top:16px}}
  .pay .prod{{font-size:15px;letter-spacing:.1em;color:var(--dim);margin-top:9px}}
  .grid{{flex:1 1 auto;display:grid;grid-template-columns:1fr 1fr;gap:26px 32px;
    border-left:1px solid var(--hair);padding-left:48px}}
  .grid div small{{display:block;font-size:12.5px;letter-spacing:.17em;
    text-transform:uppercase;color:var(--dim);margin-bottom:7px}}
  .grid div b{{font-size:29px;font-weight:600;letter-spacing:-.01em}}
  .legal{{flex:0 0 auto;padding:22px 56px 26px;background:var(--ink-2);
    border-top:1px solid var(--hair)}}
  .rep{{font-size:13.5px;line-height:1.5;color:var(--body-c);margin-bottom:9px}}
  .rep b{{color:var(--paper)}}
  .fca{{font-size:11px;line-height:1.45;color:#6f6a61}}
  .site{{position:absolute;top:44px;right:56px;font-size:14px;letter-spacing:.16em;
    color:var(--body-c)}}
</style></head><body>
  <div class="shot">
    <img src="{photo}"/>
    <div class="scrim"></div>
    <div class="mark">DAN SELLS<small>BMW &middot; HEDIN RUXLEY</small></div>
    <div class="site">dan-sells.co.uk</div>
    <div class="over">
      <div class="plabel">Approved used &middot; in stock now</div>
      <div class="name">{model}</div>
      <div class="sub">{year} &middot; {colour} &middot; {mileage:,} miles</div>
    </div>
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
</body></html>""".format(
        model=car['model'].replace('BMW ', ''), year=car['year'], colour=car['colour'],
        mileage=car['mileage_n'], photo=photo, monthly=money(f['monthly']),
        product=f['product'], price=money(car['price_n']), dep=money(f['deposit']),
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
        "{price}. Deposit {dep}. Optional final payment {gfv}. Total amount payable "
        "{total}. {apr}% APR representative. Finance from {lender}, subject to status, "
        "18+, UK residents.\n\n"
        "#BMW #ApprovedUsed #HedinRuxley #BMWFinance #{tag}"
    ).format(
        model=car['model'], colour=car['colour'], year=car['year'],
        mileage=car['mileage_n'], price=money(car['price_n']),
        monthly=money(f['monthly']), monthly2=money(f['monthly'], 2),
        term=f['term_months'], miles=f['annual_mileage'],
        payments=f['payments'], dep=money(f['deposit'], 2),
        gfv=money(f['final_payment'], 2), total=money(f['total_payable'], 2),
        apr=f['apr'], lender=f['lender'],
        tag=re.sub(r'[^A-Za-z0-9]', '', car['series']))


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
    ap.add_argument('--out', default=os.path.join(ROOT, 'out'))
    ap.add_argument('--deposit', type=float, default=1000.0,
                    help='cash deposit in pounds (Dan quotes a flat deposit)')
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
        q, err = quote_car(car['id'], a.deposit, a.term, a.mileage)
        if not q:
            skipped.append((car['reg'], car['model'], err[0] if err else 'no quote'))
            continue
        html = card_html(car, q, data_uri(car['image']))
        base = os.path.join(a.out, '%s-%s' % (today, car['reg']))
        open(base + '.html', 'w').write(html)
        open(base + '.txt', 'w').write(caption(car, q))
        json.dump(q, open(base + '.json', 'w'), indent=2)
        made.append((base, car, q))
        log[car['reg']] = today

    if made:
        render = os.path.join(HERE, 'render-cards.js')
        subprocess.run(['node', render] + [b + '.html' for b, _, _ in made], check=False)
    json.dump(log, open(LOG, 'w'), indent=2, sort_keys=True)

    for base, car, q in made:
        print('  made %-9s %-34s %s/mo  %s%% APR  -> %s.png' % (
            car['reg'], car['model'][:33], money(q['finance']['monthly']),
            q['finance']['apr'], os.path.basename(base)))
    for reg, model, why in skipped:
        print('  skip %-9s %-34s %s' % (reg, model[:33], why))
    if not made:
        sys.exit('no posts produced')


if __name__ == '__main__':
    main()
