"""Read only check against the live Supabase project: the public anon key (all a guest page has) cannot read
customers, swipes, buy requests, the stock email log or call the guest rate counter. Usage: python3 tests/anon_api_check.py"""
import re, json, urllib.request, urllib.error, sys
cfg = open(__file__.rsplit('/tests/', 1)[0] + '/config.js').read()
URL = re.search(r"SUPABASE_URL:\s*'([^']+)'", cfg).group(1); KEY = re.search(r"SUPABASE_ANON_KEY:\s*'([^']+)'", cfg).group(1)
res = []
def ok(c, m): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + m)
def get(path, method='GET', body=None):
    r = urllib.request.Request(URL + path, method=method, data=body, headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    try: x = urllib.request.urlopen(r, timeout=20); return x.status, x.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
for t in ['customers', 'swipes', 'buy_requests', 'stock_emails', 'profiles', 'guest_hits', 'purchases']:
    s, b = get(f'/rest/v1/{t}?select=*&limit=5')
    ok(s >= 400 or b.strip() == '[]', f'anon cannot read {t} ({s}, {len(b)} bytes, no rows)')
s, b = get('/rest/v1/rpc/guest_hit', 'POST', json.dumps({'cid': '11111111-2222-3333-4444-555555555555'}).encode()); ok(s >= 400, f'anon cannot call guest_hit ({s})')
print(f'RESULT anon api {sum(res)}/{len(res)}'); sys.exit(0 if all(res) else 1)
