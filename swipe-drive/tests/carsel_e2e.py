"""Staff editing a customer with no car prefs must see every car pick (fuel, body, models, colours, all specs). Demo mode, fake data. Usage: python3 tests/carsel_e2e.py BASE [SHOT]"""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1]; SHOT = sys.argv[2] if len(sys.argv) > 2 else None
DEMO = "window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
SEED = """(function(){var d=JSON.parse(localStorage.getItem('ctDemoV1')||'{}');d.customers=(d.customers||[]).concat([{id:'c-cs1',name:'Test Person',phone:'07700900333',owner_staff_id:null,models:[],desk:{},created_at:new Date().toISOString()}]);localStorage.setItem('ctDemoV1',JSON.stringify(d));})()"""
res = []
def ok(c, m): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + m)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');")
        await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_selector('#siEmail'); await pg.fill('#siEmail', 'dan@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=admin]')
        await pg.wait_for_timeout(1200); await pg.evaluate(SEED); await pg.evaluate("location.hash='#me'"); await pg.wait_for_timeout(500); await pg.evaluate("location.hash='#team'"); await pg.wait_for_timeout(1200)
        await pg.locator('.ct-c[data-cid="c-cs1"] [data-act=edit]').click(); await pg.wait_for_timeout(1500)
        if SHOT: await pg.locator('details[data-sec=car] > summary').scroll_into_view_if_needed(); await pg.screenshot(path=SHOT)
        for sel, m in [('[data-name=fuel]', 'fuel'), ('[data-name=body]', 'body'), ('#modelChips', 'models'), ('#colourChips', 'colours'), ('#specChips', 'specs'), ('[data-name=new_used]', 'new or used')]:
            ok(await pg.is_visible('#profileForm ' + sel), m + ' visible')
        n = await pg.locator('#specChips button').count(); vis = await pg.evaluate("[...document.querySelectorAll('#specChips button')].filter(b=>b.checkVisibility()).length")
        ok(n >= 33 and vis == n, f'all spec picks visible ({vis}/{n})')
        ok(await pg.locator('#modelChips button').count() > 0, 'model chips rendered')
        await pg.locator('#specChips button').first.click(timeout=3000); ok(await pg.locator('#specChips button').first.get_attribute('data-state') == 'like', 'spec tap works')
        ok(not errs, 'no page errors ' + str(errs)); await b.close()
    print(f'RESULT carsel {sum(res)}/{len(res)}'); sys.exit(0 if all(res) else 1)
asyncio.run(main())
