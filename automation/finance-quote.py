#!/usr/bin/env python3
"""Pull a real BMW Financial Services quote for a car in Hedin Ruxley stock.

Hedin's listing pages load their finance panel from a Codeweavers-backed API.
This asks the same API the same way the page does, so the figures are the
retailer's own quote, not a calculation of ours.

    python3 automation/finance-quote.py 238261 [--deposit 1000 | --deposit-pct 10]
                                               [--term 48] [--mileage 8000] [--product PCP]

Prints one JSON object: the vehicle, the quote, and the lender's own legal
wording for that quote reference.
"""
import argparse, json, re, sys, urllib.request

BASE = 'https://hedinautomotive.co.uk'
UA   = 'Mozilla/5.0 (compatible; dan-sells-stock/1.0)'


def _get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8', 'replace')


def _post(path, payload, referer):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json', 'User-Agent': UA,
                 'Referer': referer})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def listing(listing_id):
    """Read the fields the finance API needs off the listing page."""
    url = '%s/buy-car/used-cars/%s/x' % (BASE, listing_id)
    html = _get(url)

    def field(key):
        m = re.search(r'"%s":\s*("(?:[^"\\]|\\.)*"|[0-9.]+)' % key, html)
        return json.loads(m.group(1)) if m else None

    v = {k: field('car_' + k) for k in
         ('chassino', 'regno', 'retail_price', 'mileage', 'firstregistration',
          'model_text', 'year', 'color', 'fuel')}
    v['site'] = field('site_official_name')
    v['url'] = url
    missing = [k for k in ('chassino', 'regno', 'retail_price', 'mileage') if not v[k]]
    if missing:
        raise SystemExit('listing %s is missing %s - cannot quote' % (listing_id, missing))
    return v


def vehicle_payload(v):
    return {
        'OrganisationIdentifier': {
            'Value': 'Hedin Automotive ' + (v['site'] or 'BMW Ruxley'),
            'Type': 'AssociatedDealerKey'},
        'PhysicalVehicle': {
            'Type': 'Car', 'SourceVehicleId': v['chassino'], 'Vin': v['chassino'],
            'Status': 'PreOwned', 'OnTheRoadPrice': v['retail_price'],
            'Mileage': v['mileage'],
            'Registration': {'RegistrationNumber': v['regno'], 'CountryCode': 'GB',
                             'DateRegisteredWithDvla': v['firstregistration']}},
    }


def quote(v, deposit, term, mileage, product):
    veh = vehicle_payload(v)
    # The dealer identifier has to sit INSIDE Parameters. Anywhere else and the
    # engine falls back to a Mercedes product and refuses the car as ineligible.
    params = {
        'Term': term,
        'CashDeposit': round(deposit, 2),
        'AnnualMileage': mileage,
        'FinanceProductFamilyKeys': [product],
        'CalculationType': 'ToRegularPayment',
        'OrganisationIdentifier': veh['OrganisationIdentifier'],
    }
    body = {'VehicleRequests': [{'Id': '1', 'Parameters': params,
                                 'PhysicalVehicle': veh['PhysicalVehicle']}]}
    res = _post('/api/codeweaver/cfd', body, v['url'])
    veh0 = res['Vehicles'][0]
    if veh0.get('HasError'):
        raise SystemExit('quote failed: %s' % (veh0.get('Error') or {}).get('UserMessage'))
    q = veh0['FinanceQuotations'][0]
    if q.get('HasError'):
        raise SystemExit('quote failed: %s' % (q.get('Error') or {}).get('UserMessage'))
    return q


def legal(quote_ref):
    try:
        d = json.loads(_get('%s/api/codeweaver/legal?quoteRef=%s' % (BASE, quote_ref)))
    except Exception:
        return None
    t = d.get('TermsAndConditions') if isinstance(d, dict) else d
    if not isinstance(t, str):
        return t
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', t)).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('listing_id')
    g = ap.add_mutually_exclusive_group()
    g.add_argument('--deposit', type=float, help='cash deposit in pounds')
    g.add_argument('--deposit-pct', type=float, help='deposit as %% of cash price')
    ap.add_argument('--term', type=int, default=48)
    ap.add_argument('--mileage', type=int, default=10000)
    ap.add_argument('--product', default='PCP', choices=['PCP', 'HP'])
    a = ap.parse_args()

    v = listing(a.listing_id)
    if a.deposit is not None:
        dep, dep_pct = a.deposit, None
    else:
        pct = a.deposit_pct if a.deposit_pct is not None else 10.0
        dep, dep_pct = v['retail_price'] * pct / 100.0, pct
    q = quote(v, dep, a.term, a.mileage, a.product)
    Q = q['Finance']['Quote']
    P = q['Finance']['Product']
    out = {
        'listing_id': a.listing_id,
        'reg': v['regno'],
        'model': 'BMW ' + (v['model_text'] or ''),
        'year': v['year'],
        'colour': v['color'],
        'mileage': v['mileage'],
        'price': v['retail_price'],
        'url': v['url'],
        'finance': {
            'product': P.get('Name'),
            'lender': P.get('Lender'),
            'monthly': Q['RegularPayment'],
            'payments': Q['TotalNumberOfRegularPayments'],
            'term_months': Q['Term'],
            'deposit': Q['TotalDeposit'],
            'deposit_pct': dep_pct,
            'apr': Q['Apr'],
            'rate_of_interest': Q['RateOfInterest'],
            'final_payment': Q['Residual'],
            'total_payable': Q['TotalAmountPayable'],
            'charges_for_credit': Q['ChargesForCredit'],
            'annual_mileage': Q['AnnualMileage'],
            'contract_mileage': Q['ContractMileage'],
            'excess_mileage_pence': Q['ExcessMileageRate'],
            'is_representative_example': Q['IsRepresentativeExample'],
            'quote_reference': Q['QuoteReference'],
            'quoted_at': Q['QuotedAt'],
            'valid_to': Q['ValidTo'],
        },
        'legal': legal(Q['QuoteReference']),
    }
    json.dump(out, sys.stdout, indent=2)
    print()


if __name__ == '__main__':
    main()
