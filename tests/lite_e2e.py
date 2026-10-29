"""new-cars.html and todays-offers.html on lookup/new-stock-lite.json: the full file is never read on first load,
a car's own record loads when it is opened, no site names show, and cars with first_seen_seed get no arrival badge."""
import json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = '8811'; BASE = 'http://127.0.0.1:' + PORT
srv = subprocess.Popen([sys.executable, '-m', 'http.server', PORT, '--bind', '127.0.0.1'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); out = sys.argv[1] if len(sys.argv) > 1 else None
lite = json.load(open(os.path.join(root, 'lookup/new-stock-lite.json')))
live = [c for c in lite['cars'] if not c.get('on_hold')]
seeded = {str(c['order_number']) for c in live if c.get('first_seen_seed')}
SITES = ['Bromley', 'Enfield', 'Woolwich', 'Hedin Automotive Ruxley']
def visible(pg):
  return pg.evaluate('document.documentElement.innerText + " " + Array.from(document.querySelectorAll("[alt],[title],[aria-label]")).map(e=>(e.alt||"")+(e.title||"")+(e.getAttribute("aria-label")||"")).join(" ")')
try:
  with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    reqs = []; pg.on('request', lambda r: reqs.append(r.url))
    pg.goto(BASE + '/new-cars.html'); pg.wait_for_function('document.querySelectorAll(".nc-card").length > 0', timeout=20000); time.sleep(1)
    assert not any(u.endswith('/lookup/new-stock.json') for u in reqs), 'full file read on first load'
    assert any(u.endswith('/lookup/new-stock-lite.json') for u in reqs)
    t = visible(pg)
    for w in SITES: assert w not in t, w
    cnt = pg.inner_text('#ncCount'); assert str(len(live)) in cnt, cnt
    assert 'On the road price' in t and '£' in pg.inner_text('.nc-price')
    badges = pg.evaluate('Array.from(document.querySelectorAll(".nc-card")).filter(a=>a.querySelector(".nc-arr")).map(a=>a.querySelector(".nc-quote").dataset.quote)')
    assert not set(badges) & seeded, 'seed day car badged'
    print('cars', len(live), 'arrival badges', len(badges), 'none seed day')
    if out: pg.screenshot(path=out + '-newcars.png')
    first = pg.locator('.nc-card').first; first.locator(".nc-spec-list summary").click()
    pg.wait_for_function('document.querySelector(".nc-card .nc-spec-list[open] li")', timeout=10000)
    assert any('/lookup/order/' in u for u in reqs), 'order file not fetched'
    assert not any(u.endswith('/lookup/new-stock.json') for u in reqs)
    pg.locator('.nc-card').first.scroll_into_view_if_needed()
    if out: pg.screenshot(path=out + '-opened.png')
    for w in SITES: assert w not in visible(pg), w
    pg.fill('#ncQ', 'harman'); pg.wait_for_function('document.querySelector("#ncCount").innerText.indexOf(" of ") > 0', timeout=15000)
    assert any(u.endswith('/lookup/new-stock.json') for u in reqs), 'search should read the full file'
    print('search "harman":', pg.inner_text('#ncCount'))
    pg.goto(BASE + '/todays-offers.html'); time.sleep(4)
    t = visible(pg)
    for w in SITES: assert w not in t, w
    if out: pg.screenshot(path=out + '-offers.png', full_page=False)
    print('todays offers loaded; order files fetched:', len([u for u in reqs if '/lookup/order/' in u]))
    b.close()
  print('PASS lite_e2e')
finally: srv.terminate()
