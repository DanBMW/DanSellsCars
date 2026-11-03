"""Consent gate, printable customer page and spec groups, demo mode with fake customers only.
Usage: python3 consent_e2e.py [SHOTS_PREFIX]"""
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = '8812'; BASE = 'http://127.0.0.1:' + PORT + '/swipe-drive/'
OUT = sys.argv[1] if len(sys.argv) > 1 else None
DEMO = "window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
FAKE = [{'id': 'c-alpha', 'name': 'Test Alpha', 'phone': '07700900001', 'email': 'alpha@example.com', 'owner_staff_id': 'demo-admin', 'created_at': '2026-10-29T10:00:00Z', 'models': ['X3'], 'budget_type': 'cash', 'cash_gbp': 40000, 'specs': ['sp:intlight'], 'specs_must': ['sp:intlight']},
        {'id': 'c-bravo', 'name': 'Test Bravo', 'phone': '07700900002', 'email': 'bravo@example.com', 'owner_staff_id': 'demo-admin', 'created_at': '2026-10-29T11:00:00Z', 'comms_consent_at': '2026-10-29T11:05:00Z', 'comms_consent_by_name': 'Dan'}]
SEND = ['Invite to claim', 'Send customer latest stock', 'Copy swipe link', 'Send swipe link on WhatsApp', 'Start follow up journey', 'Send quotation']
n = 0
def ok(c, m):
    global n
    assert c, m; n += 1; print('ok', m)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', PORT, '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
  with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');")
    ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('#siEmail'); pg.fill('#siEmail', 'dan@example.com'); pg.click('#signinForm button[type=submit]')
    pg.click('[data-demo=admin]'); pg.wait_for_timeout(800)
    pg.evaluate("(f)=>{var d=JSON.parse(localStorage.ctDemoV1);d.customers=f;localStorage.ctDemoV1=JSON.stringify(d);}", FAKE)
    pg.goto(BASE + '#team'); pg.reload(); pg.wait_for_selector('#custList .ct-cust, #custList article, #custList > *', timeout=15000); pg.wait_for_timeout(1500)
    cards = pg.locator('#custList > *'); txt = {}
    for i in range(cards.count()):
        t = cards.nth(i).inner_text()
        for nm in ('Test Alpha', 'Test Bravo'):
            if nm in t: txt[nm] = (i, t)
    a = txt['Test Alpha'][1]; bt = txt['Test Bravo'][1]
    ok(all(s not in a for s in SEND), 'no consent: no messaging buttons')
    ok('Record consent to message' in a and 'Print customer page' in a, 'no consent: Record consent and Print shown')
    ok(all(s in bt for s in ['Send customer latest stock', 'Copy swipe link', 'Print customer page']), 'consent: send buttons shown')
    al = cards.nth(txt['Test Alpha'][0]); al.scroll_into_view_if_needed()
    if OUT: al.screenshot(path=OUT + '-card-noconsent.png'); cards.nth(txt['Test Bravo'][0]).screenshot(path=OUT + '-card-consent.png')
    al.locator('[data-act=crd]').click(); pg.wait_for_selector('.ct-crd-wrap'); pg.wait_for_timeout(400)
    sheet = pg.inner_text('.ct-crd-wrap')
    ok('Test Alpha' in sheet and 'OK to message' in sheet, 'printable page filled, with OK to message row')
    if OUT: pg.screenshot(path=OUT + '-print.png')
    pg.locator('.ct-crd-wrap [data-x]').click()
    al.locator('[data-act=consent]').click(); pg.wait_for_function("location.hash=='#profile'"); pg.wait_for_timeout(800)
    ok(pg.is_visible('#consentBox') and not pg.is_checked('#commsConsent'), 'profile shows the unticked consent box')
    pg.evaluate("document.querySelectorAll('#profileForm details.ct-sec').forEach(d=>d.open=true)")
    groups = pg.evaluate("Array.from(document.querySelectorAll('#specChips .ct-grp')).map(e=>e.textContent)")
    ok(groups == ['Comfort', 'Technology', 'Driver aids', 'Driving feel', 'Look', 'Interior', 'Electric and hybrid', 'Practical'], 'eight spec groups: ' + ', '.join(groups))
    ok(pg.evaluate("document.querySelector('#specChips [data-v=\"sp:intlight\"]').dataset.state") == 'must', 'Light interior kept as a must have')
    pg.locator('#specChips').scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    if OUT: pg.locator('#specChips').screenshot(path=OUT + '-specs.png')
    pg.once('dialog', lambda d: d.dismiss()); pg.check('#commsConsent'); pg.click('#pfSave'); pg.wait_for_timeout(1500)
    saved = pg.evaluate("JSON.parse(localStorage.ctDemoV1).customers.find(c=>c.id==='c-alpha')")
    ok(saved and not saved.get('comms_consent_at'), 'Cancel on the confirm: profile saved without consent')
    pg.goto(BASE + '#team'); pg.wait_for_timeout(1200)
    pg.locator('#custList > *', has_text='Test Alpha').locator('[data-act=consent]').click(); pg.wait_for_function("location.hash=='#profile'"); pg.wait_for_timeout(800)
    pg.once('dialog', lambda d: d.accept()); pg.check('#commsConsent'); pg.click('#pfSave'); pg.wait_for_timeout(1500)
    saved = pg.evaluate("JSON.parse(localStorage.ctDemoV1).customers.find(c=>c.id==='c-alpha')")
    ok(saved.get('comms_consent_at'), 'OK on the confirm: consent recorded')
    pg.goto(BASE + '#team'); pg.wait_for_timeout(1200)
    ok('Send customer latest stock' in pg.locator('#custList > *', has_text='Test Alpha').inner_text(), 'buttons appear after consent')
    ok(not errs, 'no page errors: ' + '; '.join(errs))
    b.close()
  print('PASS consent_e2e', n)
finally: srv.terminate()
