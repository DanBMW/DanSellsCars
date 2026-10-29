"""new-cars.html with the four site feed: every car shown, no site names anywhere,
non Ruxley cars first seen on the 29 October 2026 seed day get no arrival badge."""
import json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8811', '--bind', '127.0.0.1'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); out = sys.argv[1] if len(sys.argv) > 1 else None
d = json.load(open(os.path.join(root, 'lookup/new-stock.json')))
live = [c for c in d['cars'] if not c.get('on_hold')]
try:
  with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg.goto('http://127.0.0.1:8811/new-cars.html'); pg.wait_for_function('document.querySelectorAll(".nc-card").length > 0', timeout=20000)
    txt = pg.evaluate('document.documentElement.innerText + " " + Array.from(document.querySelectorAll("[alt],[title],[aria-label]")).map(e=>(e.alt||"")+(e.title||"")+(e.getAttribute("aria-label")||"")).join(" ")')
    for w in ['Bromley', 'Enfield', 'Woolwich', 'Hedin Automotive Bromley', 'Hedin Automotive Enfield', 'Hedin Automotive Woolwich']: assert w not in txt, w
    cnt = pg.inner_text('#ncCount'); assert str(len(live)) in cnt, (cnt, len(live))
    bad = [c for c in live if c.get('retailer_id') != '22181' and c.get('first_seen') == '2026-10-29']
    fresh = pg.evaluate('document.querySelectorAll(".nc-arr").length')
    print('cars', len(live), 'seeded non Ruxley', len(bad), 'arrival badges on page', fresh, '| count line:', cnt)
    pg.goto('http://127.0.0.1:8811/new-cars.html?fresh=week'); time.sleep(2)
    if out: pg.screenshot(path=out + '-fresh.png')
    shown = pg.evaluate('Array.from(document.querySelectorAll(".nc-card")).length')
    orders = pg.evaluate('Array.from(document.querySelectorAll(".nc-card")).map(e=>e.innerText)')
    for c in bad: assert not any(str(c['order_number']) in o for o in orders), c['order_number']
    print('just arrived filter shows', shown, 'cars, none of them seed day non Ruxley')
    if out:
      pg.goto('http://127.0.0.1:8811/new-cars.html'); pg.wait_for_selector('.nc-card'); time.sleep(1.5)
      pg.screenshot(path=out + '-newcars.png')
    b.close()
  print('PASS multisite_e2e')
finally: srv.terminate()
