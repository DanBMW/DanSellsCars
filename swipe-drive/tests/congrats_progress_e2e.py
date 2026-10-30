"""Congratulations follow up: purchase progress ticks, link code, desk save and restore, WhatsApp button, card summary,
and the FAQ page live ticks (purchase-progress mocked). Demo mode, fake data. Usage: python3 tests/congrats_progress_e2e.py BASE [SHOTDIR]"""
import asyncio, sys, json, re, urllib.parse
from playwright.async_api import async_playwright
BASE = sys.argv[1].rstrip('/') + '/'; SHOT = sys.argv[2] if len(sys.argv) > 2 else None
SITE = BASE.replace('/swipe-drive/', '/')
DEMO = "window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
SEED = """(function(){var d=JSON.parse(localStorage.getItem('ctDemoV1')||'{}');d.customers=(d.customers||[]).concat([{id:'c-cp1',name:'Ann Example',email:'ann@example.com',phone:'07700900123',owner_staff_id:null,models:['X1'],desk:{},comms_consent_at:new Date().toISOString(),created_at:new Date().toISOString()}]);localStorage.setItem('ctDemoV1',JSON.stringify(d));})()"""
res = []
def ok(c, m): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + m)
async def shot(pg, n, full=False):
    if SHOT: await pg.screenshot(path=f'{SHOT}/congrats-progress-{n}.png', full_page=full)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');")
        await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and print('CONSOLE', m.text))
        await pg.goto(BASE); await pg.wait_for_selector('#siEmail'); await pg.fill('#siEmail', 'dan@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=admin]')
        await pg.wait_for_timeout(1200); await pg.evaluate(SEED); await pg.evaluate("location.hash='#me'"); await pg.wait_for_timeout(400); await pg.evaluate("location.hash='#team'"); await pg.wait_for_timeout(1200)
        await pg.locator('.ct-c[data-cid="c-cp1"] [data-hub=followups]').click(); await pg.wait_for_timeout(1200)
        await pg.fill('#fx-p1', 'fake passphrase 123'); await pg.fill('#fx-p2', 'fake passphrase 123'); await pg.check('#fx-ack'); await pg.click('#fx-go'); await pg.wait_for_timeout(5000)
        await pg.click('#fx-save'); await pg.wait_for_selector('#fx-prog', timeout=8000); await pg.wait_for_timeout(400)
        link = await pg.text_content('#fx-plk'); ok('c=000&name=Ann' in link, 'fresh link has c=000')
        await pg.locator('#fx-prog').scroll_into_view_if_needed(); await shot(pg, '1-before')
        for id in ['t-order', 's-no', 'deposit', 'na', 'p-gap']: await pg.click(f'[data-pg="{id}"]')
        await pg.wait_for_timeout(1200)
        link = await pg.text_content('#fx-plk'); ok('c=120&name=Ann&type=order&seen=0&t=' in link, 'ticked link ' + re.sub(r't=.*', 't=…', link))
        tok = re.search(r't=([A-Za-z0-9_-]+)', link).group(1); ok(len(tok) >= 22, 'token 22+ chars')
        ok('c=120' in await pg.inner_html('.fx-prev'), 'email preview carries the ticks')
        wa = await pg.get_attribute('#fx-wa', 'href'); ok(wa.startswith('https://wa.me/447700900123?text='), 'Send by WhatsApp to 44 mobile')
        txt = urllib.parse.unquote(wa.split('text=')[1]); ok(txt.startswith("Congratulations Ann on your purchase with BMW Ruxley, please find some useful information and FAQ's within the link below.") and 'c=120' in txt, 'WhatsApp wording')
        ok('Tyre & Alloy Insurance' in txt and 'GAP Insurance' not in txt, 'WhatsApp mentions products not taken'); ok('Extended Warranty' in await pg.inner_text('.fx-prev'), 'email mentions products not taken')
        ok((await pg.text_content('#fx-wa')).strip() == 'Send by WhatsApp', 'button label')
        prev = await pg.inner_text('.fx-prev'); ok(prev.strip().endswith('Kind regards,'), 'ends Kind regards,')
        ok('Sergio' in await pg.inner_text('.fx-meta'), 'Sergio cc')
        ok('SwipeToDrive record' in await pg.text_content('#fx-pmsg'), 'saved message')
        await shot(pg, '2-ticked')
        desk = await pg.evaluate("JSON.parse(localStorage.getItem('ctDemoV1')).customers.find(c=>c.id==='c-cp1').desk.purchase_progress")
        ok(desk and desk['deposit'] is True and desk['finance'] == 'na' and desk['type'] == 'order' and desk['seen'] == 'no' and desk['token'] == tok and desk['products'] == ['gap'] and desk.get('updated_at'), 'saved on desk.purchase_progress')
        # reopen restores
        await pg.click('[data-close]'); await pg.wait_for_timeout(500)
        await pg.locator('[data-send]').first.click(); await pg.wait_for_selector('#fx-prog')
        ok(await pg.get_attribute('[data-pg=deposit]', 'aria-pressed') == 'true' and await pg.get_attribute('[data-pg=na]', 'aria-pressed') == 'true', 'reopen restores ticks')
        ok(tok in await pg.text_content('#fx-plk'), 'same token after reopen')
        await pg.click('[data-close]'); await pg.evaluate("location.hash='#me'"); await pg.wait_for_timeout(400); await pg.evaluate("location.hash='#team'"); await pg.wait_for_timeout(1200)
        card = pg.locator('.ct-c[data-cid="c-cp1"] .ct-prog'); ok(await card.count() == 1, 'card shows Purchase progress')
        await card.scroll_into_view_if_needed(); await shot(pg, '3-card')
        ok(not errs, 'no page errors ' + str(errs))
        # FAQ page: live ticks override the link code
        live = {'v': None}
        async def pp(route):
            if live['v'] is None: return await route.fulfill(status=404, body='{"ok":false}', content_type='application/json')
            await route.fulfill(body=json.dumps(live['v']), content_type='application/json')
        await ctx.route('**/functions/v1/purchase-progress*', pp)
        q = 'purchase-thankyou.html?c=000&name=Ann&type=order&t=' + tok
        f = await ctx.new_page(); await f.goto(SITE + q); await f.wait_for_timeout(1500)
        st0 = await f.text_content('#tk-deposit'); ok('Done' not in st0, 'fallback shows link code (deposit not done)'); fb = await f.evaluate("document.documentElement.getAttribute('data-ty-live')"); ok(fb is None, 'unknown token falls back to ?c')
        await f.locator('#tk-deposit').scroll_into_view_if_needed(); await shot(f, '4-faq-before')
        live['v'] = {'ok': True, 'first_name': 'Ann', 'deposit': 'yes', 'finance': 'na', 'order': 'yes', 'type': 'order', 'seen': 'yes'}
        await f.reload(); await f.wait_for_timeout(1800)
        ok(await f.evaluate("document.documentElement.getAttribute('data-ty-live')") == '1', 'live ticks applied')
        st = await f.text_content('#tk-deposit'); ok('To confirm' not in st, 'deposit tick updated live: ' + st.strip())
        await f.locator('#tk-deposit').scroll_into_view_if_needed(); await shot(f, '5-faq-after')
        await b.close()
    print(f'RESULT congrats {sum(res)}/{len(res)}'); sys.exit(0 if all(res) else 1)
asyncio.run(main())
