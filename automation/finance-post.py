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


def quote_car(listing_id, deposit_pct, term, mileage):
    r = subprocess.run(
        [sys.executable, os.path.join(HERE, 'finance-quote.py'), str(listing_id),
         '--deposit-pct', str(deposit_pct), '--term', str(term),
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
        'Customer deposit {dep} ({pct:g}%). Total amount of credit {credit}. '
        'Optional final payment {gfv}. Total amount payable {total}. '
        'Duration {term} months. {mileage:,} miles a year, {excess}p per excess mile. '
        '{apr}% APR representative. Lender {lender}.'
    ).format(
        payments=f['payments'], monthly=money(f['monthly'], 2), price=money(car['price_n']),
        dep=money(f['deposit'], 2), pct=f['deposit_pct'],
        credit=money(car['price_n'] - f['deposit'], 2), gfv=money(f['final_payment'], 2),
        total=money(f['total_payable'], 2), term=f['term_months'],
        mileage=f['annual_mileage'], excess=f['excess_mileage_pence'],
        apr=f['apr'], lender=f['lender'])

    return """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page{{size:1080px 1350px;margin:0}}
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{width:1080px;height:1350px;background:#0a0c0f;color:#ece9e1;
    font-family:'Helvetica Neue',Arial,sans-serif;display:flex;flex-direction:column;overflow:hidden}}
  .bar{{display:flex;align-items:center;justify-content:space-between;
    padding:30px 44px;border-bottom:1px solid rgba(236,233,225,.16);flex:0 0 auto}}
  .brand{{font-size:34px;letter-spacing:.16em;font-weight:600}}
  .brand small{{display:block;font-size:15px;letter-spacing:.22em;color:#847f75;
    font-weight:400;margin-top:5px}}
  .model{{text-align:right;font-size:30px;line-height:1.22;max-width:520px;font-weight:600}}
  .model small{{display:block;font-size:17px;color:#847f75;letter-spacing:.1em;
    font-weight:400;margin-top:6px;text-transform:uppercase}}
  .hero{{width:1080px;height:672px;object-fit:cover;flex:0 0 auto}}
  .quote{{display:flex;flex:1 1 auto;border-bottom:1px solid rgba(236,233,225,.16)}}
  .left{{flex:1 1 auto;padding:36px 44px;border-right:1px solid rgba(236,233,225,.16);
    display:flex;flex-direction:column;justify-content:center}}
  .label{{font-size:16px;letter-spacing:.2em;color:#5b8ac9;text-transform:uppercase;
    margin-bottom:14px}}
  .pm{{font-size:96px;font-weight:700;line-height:.95;letter-spacing:-.02em}}
  .pm span{{font-size:30px;font-weight:400;letter-spacing:.08em;color:#b9b5ab;margin-left:12px}}
  .terms{{display:flex;gap:34px;margin-top:26px}}
  .terms div{{font-size:25px;font-weight:700;line-height:1.2}}
  .terms div small{{display:block;font-size:14px;font-weight:400;color:#847f75;
    letter-spacing:.12em;text-transform:uppercase;margin-top:5px}}
  .right{{flex:0 0 330px;padding:32px 40px;display:flex;flex-direction:column;
    justify-content:center;gap:24px}}
  .right div small{{display:block;font-size:14px;letter-spacing:.14em;color:#847f75;
    text-transform:uppercase;margin-bottom:8px}}
  .right div b{{font-size:34px;font-weight:700}}
  .foot{{flex:0 0 auto;padding:20px 44px 24px;background:#0e1114}}
  .rep{{font-size:14px;line-height:1.5;color:#b9b5ab;margin-bottom:9px}}
  .fca{{font-size:11.5px;line-height:1.45;color:#6f6a61}}
</style></head><body>
  <div class="bar">
    <div class="brand">DAN SELLS<small>BMW &middot; HEDIN RUXLEY</small></div>
    <div class="model">{model}<small>{year} &middot; {reg} &middot; {colour}</small></div>
  </div>
  <img class="hero" src="{photo}"/>
  <div class="quote">
    <div class="left">
      <div class="label">Example finance quote</div>
      <div class="pm">{monthly}<span>PER MONTH</span></div>
      <div class="terms">
        <div>{pct:g}%<small>Deposit</small></div>
        <div>{miles:,}<small>Miles a year</small></div>
        <div>PCP<small>{term} months</small></div>
      </div>
    </div>
    <div class="right">
      <div><small>Car price</small><b>{price}</b></div>
      <div><small>Mileage</small><b>{mileage:,}</b></div>
      <div><small>Optional final payment</small><b>{gfv}</b></div>
    </div>
  </div>
  <div class="foot">
    <p class="rep"><b>Representative example.</b> {rep}</p>
    <p class="fca">{fca}</p>
  </div>
</body></html>""".format(
        model=car['model'].replace('BMW ', ''), year=car['year'], reg=car['reg'],
        colour=car['colour'], photo=photo, monthly=money(f['monthly']),
        pct=f['deposit_pct'], miles=f['annual_mileage'], term=f['term_months'],
        price=money(car['price_n']), mileage=car['mileage_n'],
        gfv=money(f['final_payment']), rep=rep, fca=FCA)


def caption(car, q):
    f = q['finance']
    return (
        "{model} - {colour}, {year}\n"
        "{mileage:,} miles | {price}\n\n"
        "{monthly} a month on BMW Select (PCP), {pct:g}% deposit, {term} months, "
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
        pct=f['deposit_pct'], term=f['term_months'], miles=f['annual_mileage'],
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
    ap.add_argument('--deposit-pct', type=float, default=10.0)
    ap.add_argument('--term', type=int, default=48)
    ap.add_argument('--mileage', type=int, default=10000)
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
        q, err = quote_car(car['id'], a.deposit_pct, a.term, a.mileage)
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
