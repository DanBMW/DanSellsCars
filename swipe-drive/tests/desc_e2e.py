"""About this car in the details sheet. Usage: python3 desc_e2e.py BASE_URL SHOTS_DIR"""
import asyncio, sys, os
from playwright.async_api import async_playwright
BASE, SHOTS = sys.argv[1], sys.argv[2]
DEMO = "window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
res = []
def ok(c, m):
    res.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m)

async def setup(b, mobile, reduced=False, tut_seen=True):
    kw = dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2) if mobile else dict(viewport={'width': 1280, 'height': 860})
    ctx = await b.new_context(reduced_motion='reduce' if reduced else 'no-preference', **kw)
    await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');" + ("localStorage.setItem('sd_discover_tutorial_v1','1');" if tut_seen else ""))
    await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_selector('#siEmail')
    await pg.fill('#siEmail', 'sam@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=customer]')
    await pg.wait_for_function("location.hash=='#profile'||location.hash=='#discover'")
    if await pg.evaluate("location.hash") == '#profile':
        await pg.fill('#profileForm [name=name]', 'Sam')
        if await pg.locator('#profileForm [name=phone]').count(): await pg.fill('#profileForm [name=phone]', '07700900123')
        await pg.click('#pfSave'); await pg.wait_for_function("location.hash=='#discover'", timeout=15000)
    await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(700)
    print('deck size', await pg.evaluate('ctDebug.S.deck.length'))
    return ctx, pg, errs

async def run(b, mobile):
    tag = 'phone' if mobile else 'desktop'
    ctx, pg, errs = await setup(b, mobile)
    await pg.wait_for_function("window.ctDesc", timeout=10000)
    await pg.evaluate("document.getElementById('matchModal').hidden=true")
    real = "(function(){var c=ctDebug.S.deck[0].car,d=(window.ctDesc||{})[String(c.listing_id)];return !!(d&&d.text&&!/^Welcome to BMW/.test(d.text))})()"
    for i in range(15):
        if await pg.evaluate(real): break
        await pg.click('#deck .ct-card:last-child ~ * , #deckActions button >> nth=0') if False else await pg.evaluate("document.querySelector('#deck .ct-card:last-child')._fling(-1)")
        await pg.wait_for_timeout(900); await pg.evaluate("document.getElementById('matchModal').hidden=true")
    await pg.screenshot(path=f'{SHOTS}/desc-{tag}-card.png')
    m = await pg.locator('#deck .ct-card:last-child .ct-meta h3').bounding_box()
    await pg.mouse.click(m['x'] + 10, m['y'] + 5) if not mobile else await pg.tap('#deck .ct-card:last-child .ct-meta h3')
    await pg.wait_for_selector('#sheet:not([hidden])')
    n = await pg.locator('#sheetBody .ct-desc p').count()
    t = await pg.locator('#sheetBody .ct-desc').inner_text() if n else ''
    ok(n > 0, f'{tag}: About this car shown ({n} paragraphs)')
    ok('-' not in t and '\u2013' not in t and '\u2014' not in t, f'{tag}: no dashes in description')
    ok('Buy with confidence' not in t, f'{tag}: boilerplate dropped')
    await pg.locator('#sheetBody .ct-desc').scroll_into_view_if_needed()
    await pg.screenshot(path=f'{SHOTS}/desc-{tag}-sheet.png')
    # absent description hides cleanly
    await pg.evaluate("window.ctDesc={}")
    await pg.keyboard.press('Escape'); await pg.evaluate("document.getElementById('sheet').hidden=true")
    await pg.evaluate("(function(){var x=ctDebug.S.deck[0]; return x})()")
    gone = await pg.evaluate("(function(){document.getElementById('sheet').hidden=true; return 1})()")
    ok(not errs, f'{tag}: no page errors {errs}')
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, True); await run(b, False); await b.close()
    sys.exit(0 if all(r[0] for r in res) else 1)
asyncio.run(main())
