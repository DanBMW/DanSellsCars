"""Swipe Drive Discover deck: drag from anywhere, tap opens details, swipe in details, first visit tutorial.
Usage: python3 e2e_deck.py BASE_URL [SHOTS_DIR]   e.g. http://localhost:8765/swipe-drive/
Runs the app in demo mode (config.js swapped in the browser only). Touch uses real CDP touch events, so
touch-action and scrolling behave like a phone. Needs playwright and Google Chrome."""
import asyncio, sys, os
from playwright.async_api import async_playwright
BASE = sys.argv[1]; SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
DEMO = "window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
res = []
def ok(c, m):
    res.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m)

async def setup(b, mobile, reduced=False, tut_seen=True):
    kw = dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2) if mobile else dict(viewport={'width': 1280, 'height': 860})
    ctx = await b.new_context(reduced_motion='reduce' if reduced else 'no-preference', **kw)
    await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');" + ("localStorage.setItem('sd_discover_tutorial_v1','1');" if tut_seen else ""))
    await ctx.route('**/swipe-drive/config.js', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
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

async def touch_drag(pg, cdp, x, y, dx, dy, steps=12):
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    for i in range(1, steps + 1):
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + dx * i / steps, 'y': y + dy * i / steps}]}); await asyncio.sleep(0.016)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(600); await calm(pg)

async def calm(pg):
    await pg.evaluate("document.getElementById('matchModal').hidden=true")

async def tap(pg, cdp, x, y):
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]}); await asyncio.sleep(0.05)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(500)

async def mouse_drag(pg, x, y, dx, dy):
    await pg.mouse.move(x, y); await pg.mouse.down()
    for i in range(1, 13): await pg.mouse.move(x + dx * i / 12, y + dy * i / 12); await asyncio.sleep(0.016)
    await pg.mouse.up(); await pg.wait_for_timeout(600); await calm(pg)

top_reg = lambda pg: pg.evaluate("(document.querySelector('#deck .ct-card:last-child')||{}).dataset?.reg||''")
swipe_of = lambda pg, r: pg.evaluate(f"JSON.stringify(ctDebug.S.swipes[{r!r}]||null)")
async def box(pg, sel):
    return await pg.locator(sel).last.bounding_box()

async def deck_suite(b, mobile):
    tag = 'mobile' if mobile else 'desktop'
    ctx, pg, errs = await setup(b, mobile); cdp = await ctx.new_cdp_session(pg) if mobile else None
    drag = (lambda x, y, dx, dy: touch_drag(pg, cdp, x, y, dx, dy)) if mobile else (lambda x, y, dx, dy: mouse_drag(pg, x, y, dx, dy))
    click = (lambda x, y: tap(pg, cdp, x, y)) if mobile else (lambda x, y: pg.mouse.click(x, y))
    # 1 drag starting on the text (title, then tags/price) swipes
    r = await top_reg(pg); m = await box(pg, '#deck .ct-card:last-child .ct-meta h3')
    await drag(m['x'] + 20, m['y'] + m['height'] / 2, 230, 10)
    ok(await top_reg(pg) != r and '"liked":true' in (await swipe_of(pg, r)), f'{tag}: drag right from the title text likes the car')
    r = await top_reg(pg); m = await box(pg, '#deck .ct-card:last-child .ct-meta')
    await drag(m['x'] + m['width'] / 2, m['y'] + m['height'] - 30, -230, 0)
    ok(await top_reg(pg) != r and '"liked":false' in (await swipe_of(pg, r)), f'{tag}: drag left from the price area passes')
    r = await top_reg(pg); m = await box(pg, '#deck .ct-card:last-child .ct-tarea')
    await drag(m['x'] + m['width'] / 2, m['y'] + m['height'] / 2, 230, 0)
    ok(await top_reg(pg) != r, f'{tag}: drag on the photo still swipes')
    # 2 short tap on the info and on the photo opens the details
    m = await box(pg, '#deck .ct-card:last-child .ct-meta'); await click(m['x'] + m['width'] / 2, m['y'] + 30); await pg.wait_for_timeout(400)
    ok(await pg.is_visible('#sheet'), f'{tag}: tap on the info opens the details')
    if SHOTS and mobile: await pg.screenshot(path=os.path.join(SHOTS, 'deck-detail-open-mobile.png'))
    await pg.evaluate("document.getElementById('sheet').hidden=true")
    m = await box(pg, '#deck .ct-card:last-child .ct-tarea'); await click(m['x'] + m['width'] / 2, m['y'] + m['height'] / 2); await pg.wait_for_timeout(400)
    ok(await pg.is_visible('#sheet'), f'{tag}: tap on the photo opens the details')
    # 3 in the details: vertical drag scrolls and keeps it open, horizontal drag decides and moves on
    r = await top_reg(pg); sh = await box(pg, '#sheet .ct-sheet-in'); y0 = await pg.evaluate("document.querySelector('#sheet .ct-sheet-in').scrollTop")
    sx = sh['x'] + sh['width'] / 2; sy = sh['y'] + sh['height'] * 0.6
    if mobile: await touch_drag(pg, cdp, sx, sy, 6, -260)
    else: await pg.mouse.move(sx, sy); await pg.mouse.wheel(0, 400); await pg.wait_for_timeout(500)
    y1 = await pg.evaluate("document.querySelector('#sheet .ct-sheet-in').scrollTop")
    ok(await pg.is_visible('#sheet') and await top_reg(pg) == r, f'{tag}: vertical drag in the details does not swipe')
    ok(y1 > y0 or await pg.evaluate("(e=>e.scrollHeight<=e.clientHeight+2)(document.querySelector('#sheet .ct-sheet-in'))"), f'{tag}: details still scroll vertically ({y0} to {y1})')
    hy = await pg.evaluate("(()=>{const s=document.querySelector('#sheet .ct-sheet-in').getBoundingClientRect();const h=document.querySelector('#sheetBody h2');const r=h?h.getBoundingClientRect():s;return Math.min(Math.max(r.top+r.height/2,s.top+40),s.bottom-40)})()")
    await drag(sh['x'] + 60, hy, 220, 8); await pg.wait_for_timeout(500)
    ok(not await pg.is_visible('#sheet') and await top_reg(pg) != r and '"liked":true' in (await swipe_of(pg, r)), f'{tag}: swipe right in the details likes and moves to the next car')
    await pg.evaluate("document.getElementById('matchModal').hidden=true")
    r = await top_reg(pg); m = await box(pg, '#deck .ct-card:last-child .ct-meta'); await click(m['x'] + m['width'] / 2, m['y'] + 30); await pg.wait_for_timeout(400)
    sh = await box(pg, '#sheet .ct-sheet-in'); hy = await pg.evaluate("(()=>{const s=document.querySelector('#sheet .ct-sheet-in').getBoundingClientRect();return s.top+Math.min(160,s.height/2)})()")
    await drag(sh['x'] + sh['width'] / 2 + 100, hy, -220, 0); await pg.wait_for_timeout(500)
    ok(not await pg.is_visible('#sheet') and '"liked":false' in (await swipe_of(pg, r)), f'{tag}: swipe left in the details passes')
    sel = await pg.evaluate("String(getSelection())")
    ok(sel.strip() == '', f'{tag}: no text got selected while dragging')
    ok(not errs, f'{tag}: no page errors {errs[:2]}')
    if SHOTS and not mobile: await pg.screenshot(path=os.path.join(SHOTS, 'deck-desktop-1280.png'))
    await ctx.close()

async def deeplink_suite(b):
    ctx, pg, errs = await setup(b, True)
    reg = await pg.evaluate("ctDebug.S.deck[7].car.reg"); first = await top_reg(pg)
    await pg.goto(BASE + '?reg=' + reg + '&src=alert'); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(600)
    ok(await top_reg(pg) == reg and reg != first, f'push link ?reg={reg} opens the deck on that car')
    await pg.goto(BASE + '?reg=' + reg.lower()[:4] + ' ' + reg.lower()[4:] + '&src=alert'); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(600)
    ok(await top_reg(pg) == reg, 'lower case reg with a space still finds it')
    await pg.goto(BASE + '?reg=ZZ99ZZZ'); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(600)
    ok(await top_reg(pg) == first, 'an unknown or sold reg just shows the normal deck')
    ok(not errs, f'deep link no page errors {errs[:2]}'); await ctx.close()

async def tutorial_suite(b):
    ctx, pg, errs = await setup(b, True, tut_seen=False)
    await pg.wait_for_selector('#tut', timeout=5000); ok(True, 'tutorial shows on first Discover visit')
    txt = await pg.text_content('#tut'); ok('Skip' in txt and not any(d in txt for d in ['\u2013', '\u2014', ' - ']), 'tutorial has Skip and no dashes')
    caps = []
    for k in range(4):
        await pg.wait_for_timeout(1300 if k == 0 else 2600)
        caps.append(await pg.text_content('.tut-cap'))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, f'tutorial-step{k + 1}.png'))
    ok(caps == ['Swipe right on a car you like', 'Swipe left to pass', 'Tap the card for all the details', 'Still swipe in the details to decide'], f'tutorial steps {caps}')
    await pg.click('.ct-tut-skip'); ok(not await pg.locator('#tut').count(), 'Skip closes it')
    await pg.reload(); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(900)
    ok(not await pg.locator('#tut').count(), 'shows once per device')
    await pg.click('#howTo'); ok(await pg.locator('#tut').count() == 1, 'How it works replays it')
    await pg.click('.tut-go'); await ctx.close()
    ctx, pg, errs = await setup(b, True, reduced=True, tut_seen=False)
    await pg.wait_for_selector('#tut', timeout=5000)
    ok(await pg.locator('#tut .tut-list li').count() == 4 and not await pg.locator('#tut .tut-stage').count(), 'reduced motion shows static steps')
    if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'tutorial-reduced-motion.png'))
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        await deck_suite(b, True); await deck_suite(b, False); await deeplink_suite(b); await tutorial_suite(b)
        await b.close()
    n = sum(1 for c, _ in res if c); print(f'\nRESULT deck {n}/{len(res)} passed'); sys.exit(0 if n == len(res) else 1)
asyncio.run(main())
