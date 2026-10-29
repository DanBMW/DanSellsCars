#!/usr/bin/env python3
"""Print the BMW vehicle page url for every car on the locator, as JSON.

Used only by automation/new-stock-quotes.mjs. The locator's `vin` and `iv`
are encrypted and are used here exactly as BMW hand them over, URL encoded
into the same page link the locator's own "View details" button opens. They
are never decrypted and are not written to any committed file.

    python3 automation/new-stock-urls.py > /tmp/new-stock-urls.json
"""
import base64, contextlib, importlib.util, json, os, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('newstock', os.path.join(HERE, 'new-stock.py'))
ns = importlib.util.module_from_spec(spec); spec.loader.exec_module(ns)

F = urllib.parse.quote(base64.b64encode(b'true').decode())
with contextlib.redirect_stdout(sys.stderr):  # pull() prints progress
    rows = []
    for n, (rid, _name) in enumerate(ns.RETAILERS):
        if n:
            ns.time.sleep(ns.RETAILER_PAUSE)
        ns.use_retailer(rid)
        for r in ns.pull(ns.model_ids(ns.Session())):
            r['_retailer'] = rid
            rows.append(r)
out, seen = [], set()
for r in rows:
    num = ns.order_number(r.get('order_number'))
    if not num or not r.get('vin') or not r.get('iv') or num in seen:
        continue
    seen.add(num)
    out.append({'order': num, 'url': 'https://stock.bmw.co.uk/vehicle/%s/%s?dn=%s&f=%s' % (
        urllib.parse.quote(r['vin'], safe=''), urllib.parse.quote(r['iv'], safe=''),
        r['_retailer'], F)})
json.dump(out, sys.stdout)
print('%d vehicle pages' % len(out), file=sys.stderr)
