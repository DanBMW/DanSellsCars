"""Tell me when it arrives, New enquiries, Find my BMW SwipeToDrive opt in. Demo mode, fake data only.
Usage: python3 alerts_e2e.py [SHOTS_DIR]"""
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = '8813'; SITE = 'http://127.0.0.1:' + PORT + '/'; APP = SITE + 'swipe-drive/'
OUT = sys.argv[1] if len(sys.argv) > 1 else None
DEMO = "window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
n = 0
def ok(c, m):
    global n
    assert c, m; n += 1; print('ok', m)
def shot(pg, name, full=False):
    if OUT: pg.screenshot(path=os.path.join(OUT, 'alerts-' + name + '.png'), full_page=full)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', PORT, '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
  with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');")
    ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
    ctx.route('https://www.googletagmanager.com/**', lambda r: r.abort())
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))

    # 1. homepage doorway
    pg.goto(SITE); pg.wait_for_timeout(800)
    d = pg.locator('a[href*="alerts.html"]').first; ok(d.count() == 1, 'homepage has the alert doorway')
    d.scroll_into_view_if_needed(); shot(pg, 'home-doorway')

    # 2. alerts page, bad input then good
    pg.goto(SITE + 'alerts.html?model=X5&from=home'); pg.wait_for_timeout(1500)
    ok(pg.eval_on_selector('#alModel', 'e=>e.value') == 'X5', 'model from the link is preselected')
    shot(pg, 'page', True)
    pg.goto(SITE + 'alerts.html'); pg.wait_for_timeout(800)
    def submit(): pg.click('.al-go'); return pg.inner_text('#alMsg')
    ok('model' in submit(), 'no model refused')
    pg.select_option('#alModel', 'X5'); ok('first name' in submit(), 'no name refused')
    pg.fill('#alName', 'Testy'); pg.fill('#alPhone', '01234 567890'); ok('07' in submit(), 'landline refused')
    pg.fill('#alPhone', '07700 900123'); ok('tick' in submit(), 'no consent refused')
    ok(pg.evaluate("localStorage.getItem('sd_alert_pending_v1')") is None, 'nothing stored before consent')
    ok(not pg.is_checked('#alConsent'), 'consent is not pre ticked')
    chip = pg.locator('.al-chip').first; chip.click()
    pg.check('#alConsent'); pg.click('.al-go'); pg.wait_for_url('**/swipe-drive/**', timeout=8000); pg.wait_for_timeout(1200)
    ok(pg.is_visible('#alertNote'), 'sign in screen says the alert is waiting'); shot(pg, 'signin')
    pg.fill('#siEmail', 'testy@example.com'); pg.click('#signinForm button[type=submit]'); pg.click('[data-demo=customer]')
    pg.wait_for_selector('#alertSheet', timeout=8000); ok('Your alert is saved' in pg.inner_text('#alertSheet'), 'alert saved sheet'); shot(pg, 'saved')
    c = pg.evaluate("(()=>{var d=JSON.parse(localStorage.ctDemoV1);return d.customers.find(x=>x.desk&&x.desk.alerts)})()")
    ok(c and c['desk']['alerts'][0]['model'] == 'X5' and 'X5' in c['models_must'], 'alert on the profile, model is a must')
    ok(c.get('comms_consent_at') and 'STOP' in c.get('comms_consent_text', '') and c['comms_consent_text'] in pg.evaluate("fetch('/alerts.html').then(r=>r.text())"), 'consent time and wording recorded')
    ok(c['desk']['enquiry']['actioned_at'] is None and c['desk']['enquiry']['first_name'] == 'Testy', 'shows as a new enquiry')
    ok(pg.evaluate("localStorage.getItem('sd_alert_pending_v1')") is None, 'pending alert cleared')

    # 3. duplicate sign up for the same model replaces, never duplicates
    pg.goto(SITE + 'alerts.html?model=X5'); pg.wait_for_timeout(800); pg.fill('#alName', 'Testy'); pg.fill('#alPhone', '07700900123'); pg.check('#alConsent'); pg.click('.al-go')
    pg.wait_for_url('**/swipe-drive/**'); pg.wait_for_selector('#alertSheet', timeout=8000)
    c = pg.evaluate("(()=>{var d=JSON.parse(localStorage.ctDemoV1);return d.customers.find(x=>x.desk&&x.desk.alerts)})()")
    ok(len(c['desk']['alerts']) == 1 and c['desk']['enquiry']['repeat'] is True, 'repeat sign up keeps one alert, flagged as repeat')
    ok(c['name'].startswith('Testy'), 'existing name kept')
    pg.click('#alertSheet button, #alertSheet a >> nth=-1') if pg.locator('#alertSheet button').count() else None
    pg.evaluate("document.getElementById('alertSheet')&&document.getElementById('alertSheet').remove()")

    # 4. stop the alert from Me
    pg.goto(APP + '#me'); pg.wait_for_selector('#myAlerts:not([hidden])', timeout=8000); shot(pg, 'me-stop')
    pg.click('[data-stop-alert="0"]'); pg.wait_for_timeout(800); ok(pg.locator('#myAlerts').is_hidden(), 'Stop this alert removes it')
    c = pg.evaluate("(()=>{var d=JSON.parse(localStorage.ctDemoV1);return d.customers.find(x=>x.email==='testy@example.com')||d.customers.find(x=>x.desk&&x.desk.enquiry)})()")
    ok(not (c['desk'].get('alerts')) and 'X5' not in (c.get('models_must') or []), 'alert and its must have model are gone')

    # 5. New enquiries for admin
    pg.evaluate("(()=>{var d=JSON.parse(localStorage.ctDemoV1);delete d.session;localStorage.ctDemoV1=JSON.stringify(d);sessionStorage.clear()})()")
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    FAKE = [{'id': 'c-e1', 'name': 'Alpha Test', 'phone': '07700900001', 'email': 'a@example.com', 'owner_staff_id': None, 'created_at': now, 'desk': {'enquiry': {'source': 'find-my-bmw', 'at': now, 'first_name': 'Alpha', 'actioned_at': None}}},
            {'id': 'c-e2', 'name': 'Bravo Test', 'phone': '07700900002', 'email': 'b@example.com', 'owner_staff_id': None, 'created_at': now, 'desk': {'enquiry': {'source': 'alert:new-cars', 'at': '2026-10-28T09:00:00Z', 'first_name': 'Bravo', 'actioned_at': None}}},
            {'id': 'c-e3', 'name': 'Done Test', 'phone': '07700900003', 'email': 'c@example.com', 'owner_staff_id': None, 'created_at': now, 'desk': {'enquiry': {'source': 'alerts', 'at': now, 'first_name': 'Done', 'actioned_at': now}}}]
    pg.goto(APP + '#signin'); pg.reload(); pg.wait_for_timeout(900)
    if pg.locator('#siEmail').is_visible():
        pg.fill('#siEmail', 'dan@example.com'); pg.click('#signinForm button[type=submit]'); pg.click('[data-demo=admin]'); pg.wait_for_timeout(800)
    pg.evaluate("(f)=>{var d=JSON.parse(localStorage.ctDemoV1);d.customers=f;localStorage.ctDemoV1=JSON.stringify(d);}", FAKE)
    pg.goto(APP + '#team'); pg.reload(); pg.wait_for_selector('#enqBox:not([hidden])', timeout=10000)
    t = pg.inner_text('#enqBox'); ok('Alpha' in t and 'Bravo' in t and 'Done' not in t, 'only unactioned enquiries listed')
    ok('Find my BMW' in t and 'Stock alert, new cars' in t, 'source labels'); ok(t.index('Alpha') < t.index('Bravo'), 'newest first')
    shot(pg, 'enquiries')
    pg.locator('[data-eid="c-e1"] [data-enq=open]').click(); pg.wait_for_timeout(500)
    ok(pg.locator('#custList [data-cid="c-e1"].ct-flash').count() == 1, 'Open card highlights the customer card')
    pg.locator('[data-eid="c-e1"] [data-enq=done]').click(); pg.wait_for_timeout(1200)
    t = pg.inner_text('#enqBox'); ok('Alpha' not in t and 'Bravo' in t, 'Mark as actioned removes it')
    a = pg.evaluate("JSON.parse(localStorage.ctDemoV1).customers.find(x=>x.id==='c-e1')")
    ok(a['desk']['enquiry']['actioned_at'] and a['name'] == 'Alpha Test', 'actioned time stored, card intact')

    # 6. Find my BMW: no opt in box; the join question appears after the enquiry with the claim link
    pg3 = ctx.new_page(); pg3.on('pageerror', lambda e: errs.append(str(e))); pg3.goto(SITE + 'find-my-bmw.html'); pg3.wait_for_timeout(800)
    ok(pg3.locator('#fStd').count() == 0, 'no SwipeToDrive opt in box in the funnel')
    ok(not pg3.is_checked('#fStdAlert'), 'stock alert agreement not pre ticked')
    pg3.evaluate("(()=>{var s=document.getElementById('fmbSent');s.hidden=false;var c=s.closest('.fmb-screen,section');if(c){c.hidden=false;c.style.display='block'};var q=document.getElementById('fmbStd');q.hidden=false;document.getElementById('fmbStdYes').href='#claim';q.scrollIntoView({block:'center'})})()")
    ok('Would you like to join SwipeToDrive?' in pg3.inner_text('#fmbStd'), 'join question shown'); shot(pg3, 'fmb-join')
    pg3.click('#fmbStdNo'); ok(pg3.locator('#fmbStd').is_hidden(), 'No closes the question')
    ok(not errs, 'no page errors ' + '; '.join(errs))
  print('RESULT alerts_e2e %d/%d' % (n, n))
finally:
    srv.terminate()
