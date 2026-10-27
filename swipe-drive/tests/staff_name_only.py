"""Staff can add a customer with a name only, and the swipe link buttons work. Usage: python3 tests/staff_name_only.py BASE [SHOTS]"""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1]; OUT = sys.argv[2] if len(sys.argv) > 2 else None
DEMO = "window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
res = []
def ok(c, m): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + m)
async def run(b, mobile):
    t = 'mobile' if mobile else 'desktop'
    kw = dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2) if mobile else dict(viewport={'width': 1280, 'height': 860})
    ctx = await b.new_context(**kw); await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');")
    await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pops = []; ctx.on('page', lambda p: pops.append(p))
    await pg.goto(BASE); await pg.wait_for_selector('#siEmail'); await pg.fill('#siEmail', 'dan@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=admin]')
    await pg.wait_for_timeout(1200); await pg.evaluate("location.hash='#team'"); await pg.wait_for_timeout(800)
    await pg.click('#addCust'); await pg.wait_for_selector('#profileForm [name=name]'); await pg.fill('#profileForm [name=name]', 'Name Only')
    await pg.click('#pfSave'); await pg.wait_for_function("location.hash=='#discover'", timeout=15000); ok(True, t + ': saved with a name only')
    c = await pg.evaluate("ctDebug.S.cust"); ok(c['phone'] is None and c['email'] is None and isinstance(c['models'], list), t + ': phone and email saved as empty, lists never null')
    await pg.evaluate("location.hash='#team'"); await pg.wait_for_timeout(900)
    card = pg.locator('.ct-c', has_text='Name Only'); await card.locator('[data-act=walink]').scroll_into_view_if_needed()
    if OUT: await pg.screenshot(path=f'{OUT}/7-staff-link-buttons-{t}.png')
    await card.locator('[data-act=walink]').click(); await pg.wait_for_timeout(1500)
    u = pops[-1].url if pops else ''; print('popup', u[:60]); import urllib.parse; d = urllib.parse.unquote_plus(urllib.parse.unquote_plus(u)); ok(('wa.me' in u or 'whatsapp.com' in u) and 'guest.html#t=' in d, t + ': Send swipe link on WhatsApp opens WhatsApp with the link')
    ok(not errs, t + ': no page errors ' + str(errs)); await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome'); await run(b, True); await run(b, False); await b.close()
    print(f'RESULT staff name only {sum(res)}/{len(res)}'); sys.exit(0 if all(res) else 1)
asyncio.run(main())
