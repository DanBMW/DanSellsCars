"""Scrolling checks (desktop 1280 and phone) plus screenshots of the colour picker and kit page.
Usage: python3 scroll_and_pickers.py BASE_URL [SHOTS_DIR]"""
import asyncio, sys, os
from playwright.async_api import async_playwright
BASE = sys.argv[1]; SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
res = []
def ok(c, m): res.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m)
async def run(b, desk):
    tag = 'desktop' if desk else 'mobile'
    kw = dict(viewport={'width': 1280, 'height': 800}) if desk else dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    ctx = await b.new_context(**kw); pg = await ctx.new_page()
    await pg.add_init_script("window.__siv=0;const o=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(){window.__siv++;return o.apply(this,arguments)}")
    async def idle(): await pg.wait_for_function('!document.querySelector(".typing")&&(document.querySelector("#tray").children.length>0||!document.getElementById("form").hidden)', timeout=20000); await asyncio.sleep(0.05)
    async def typ(s): await idle(); await pg.fill('#inp', s); await pg.press('#inp', 'Enter'); await asyncio.sleep(0.1); await idle()
    async def tap(t, sel='#tray button'): await idle(); await pg.locator(sel, has_text=t).first.click(); await asyncio.sleep(0.1); await idle()
    await pg.goto(BASE + 'chat/index.html'); await idle()   # real typing speed for the scroll checks
    await typ('Sam'); await typ('x3'); await tap('Done'); await typ('2019 Audi A3'); await tap('Skip')
    bottom = await pg.evaluate("(d=>d.scrollHeight-(d.scrollTop+innerHeight))(document.scrollingElement)")
    ok(bottom < 40, f'{tag}: new messages keep the chat at the bottom ({bottom:.0f}px)')
    # read back up while Revvy is typing: the page must not be dragged back down
    await pg.fill('#inp', '45k'); await pg.press('#inp', 'Enter'); await asyncio.sleep(0.05)
    if desk: await pg.mouse.move(640, 400); await pg.mouse.wheel(0, -600)
    else: await pg.evaluate("scrollBy(0,-600)")
    await asyncio.sleep(0.2); y1 = await pg.evaluate('scrollY'); await idle(); await asyncio.sleep(1.5); y2 = await pg.evaluate('scrollY')
    ok(abs(y2 - y1) < 5, f'{tag}: reading back up is not yanked down by new messages ({y1:.0f} then {y2:.0f})')
    ok(await pg.evaluate('window.__siv') == 0, f'{tag}: no scrollIntoView calls fighting the user')
    css = await pg.evaluate("[getComputedStyle(document.querySelector('header')).backdropFilter,getComputedStyle(document.documentElement).scrollBehavior]")
    ok(css[0] in ('none', '') and css[1] != 'smooth', f'{tag}: no blur under the sticky header, no smooth scroll on html {css}')
    await pg.evaluate("scrollTo(0,document.scrollingElement.scrollHeight)")
    for k in range(4):   # through to the colour step
        q = await pg.evaluate('SDChat.cur()')
        if q == 'cond': await tap('Done')
        elif q == 'settle': await tap('Paid off')
        elif q == 'curMonthly': await typ('£300')
        elif q == 'annual': await tap('6k to 10k')
    await tap('Cash'); await tap("That's me"); await tap("That's me")
    for c in ('Alpine White', 'Portimao Blue', 'Skyscraper Grey'): await pg.locator('#tray .swatch', has_text=c).click()
    await pg.wait_for_timeout(200)
    if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, f'colour-multi-{tag}.png'))
    await tap('Done', '#tray button.go')
    for k, n in ((0, 2), (1, 1), (2, 1), (5, 2), (8, 1), (11, 3)):
        for t in range(n): await pg.locator('#tray .ktile').nth(k).click()
    await pg.wait_for_timeout(200)
    if SHOTS:
        await pg.locator('#tray .klegend').scroll_into_view_if_needed(); await pg.screenshot(path=os.path.join(SHOTS, f'kit-page-{tag}.png'))
    if desk:   # app shell: nothing repaints the whole page on scroll
        await pg.goto(BASE); await pg.wait_for_timeout(1500)
        st = await pg.evaluate("[getComputedStyle(document.body).backgroundAttachment,getComputedStyle(document.querySelector('.ct-top')).backdropFilter]")
        ok('fixed' not in st[0] and st[1] in ('none', ''), f'app desktop: no fixed background or blur behind the top bar {st}')
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome'); await run(b, True); await run(b, False); await b.close()
    n = sum(1 for c, _ in res if c); print(f'\nRESULT scroll {n}/{len(res)} passed'); sys.exit(0 if n == len(res) else 1)
asyncio.run(main())
