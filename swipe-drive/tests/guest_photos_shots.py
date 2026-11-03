"""Screenshots of guest deck cards and details at several sizes. Usage: BASE MOCK TOKEN OUTDIR PREFIX"""
import asyncio, sys
from playwright.async_api import async_playwright
BASE, MOCK, TOK, OUT, PRE = sys.argv[1:6]
CFG = "window.CT_CONFIG={MODE:'supabase',SUPABASE_URL:'%s',SUPABASE_ANON_KEY:'anon-test',DAN_WA:'447827138197'};" % MOCK
SIZES = [(360, 640, 1), (390, 844, 1), (430, 932, 1), (375, 667, 1), (1280, 860, 0)]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); bad = []
        for w, h, mob in SIZES:
            kw = dict(viewport={'width': w, 'height': h}, is_mobile=bool(mob), has_touch=bool(mob), device_scale_factor=2 if mob else 1)
            ctx = await b.new_context(**kw); await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=CFG, content_type='text/javascript'))
            pg = await ctx.new_page(); await pg.goto(BASE + 'guest.html#t=' + TOK); await pg.wait_for_selector('#g-tut:not([hidden])'); await pg.click('#g-tut-go')
            await pg.wait_for_selector('#g-deck .g-card:not(.under)'); await pg.wait_for_timeout(1500)
            for i in range(3):
                await pg.screenshot(path=f'{OUT}/{PRE}-card{i+1}-{w}x{h}.png')
                r = await pg.evaluate("""()=>{const c=document.querySelector('#g-deck .g-card:not(.under)'),r=c.getBoundingClientRect(),b=c.querySelector('.bd');return {bottom:r.bottom,vh:innerHeight,bd:b?b.getBoundingClientRect().bottom:0}}""")
                if r['bd'] > r['vh'] + 1: bad.append(f'{w}x{h} card text below fold')
                if i < 2: await pg.click('#g-pass'); await pg.wait_for_timeout(500)
            await pg.click('#g-info'); await pg.wait_for_selector('#g-sheet:not([hidden])'); await pg.wait_for_timeout(1200)
            await pg.screenshot(path=f'{OUT}/{PRE}-details-{w}x{h}.png'); await ctx.close()
        print('ISSUES', bad); await b.close()
asyncio.run(main())
