"""Item 13 repro: swipe a car left, the deck rebuilds while it is still flying (the async new stock merge does this),
then the customer swipes right. Before the fix the right swipe lands on the car they swiped left and the match
pop up names it. Usage: python3 bug13_race.py BASE_URL [signin|guest]"""
import asyncio, sys, json
from playwright.async_api import async_playwright
BASE = sys.argv[1]; MODE = sys.argv[2] if len(sys.argv) > 2 else 'signin'
DEMO = "window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 860})
        await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');localStorage.setItem('sd_cookie_consent_v1','no');")
        await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + '#signin'); await pg.wait_for_selector('#siEmail')
        await pg.fill('#siEmail', 'sam@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=customer]')
        await pg.wait_for_function("location.hash=='#profile'||location.hash=='#discover'")
        if await pg.evaluate("location.hash") == '#profile':
            await pg.fill('#profileForm [name=name]', 'Sam')
            if await pg.locator('#profileForm [name=phone]').count(): await pg.fill('#profileForm [name=phone]', '07700900123')
            await pg.click('#pfSave'); await pg.wait_for_function("location.hash=='#discover'", timeout=15000)
        await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(600)
        bad = 0; runs = 6
        for i in range(runs):
            a = await pg.evaluate("ctDebug.S.deck[0].car.reg")
            await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(80)
            await pg.evaluate("ctDebug.redeck()"); await pg.wait_for_timeout(70)
            shown = await pg.evaluate("(document.querySelectorAll('#deck .ct-card:not([style*=\"-40px\"])')[0]||{}).dataset?.reg")
            vis_top = await pg.evaluate("(function(){var l=[].slice.call(document.querySelectorAll('#deck .ct-card')).filter(function(e){return !e._flung});return l.length?l[l.length-1].dataset.reg:''})()")
            await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(900)
            sw = json.loads(await pg.evaluate("JSON.stringify(ctDebug.S.swipes)"))
            mm = await pg.evaluate("document.getElementById('matchModal').hidden ? '' : document.getElementById('mmText').textContent")
            a_liked = bool(sw.get(a, {}).get('liked'))
            print(f'run {i}: swiped left {a}, top card after rebuild {vis_top}, A liked={a_liked}, match="{mm[:60]}"')
            if a_liked or vis_top == a: bad += 1
            await pg.evaluate("document.getElementById('matchModal').hidden=true")
        print('page errors', errs[:3])
        print(('FAIL' if bad else 'PASS') + f' {bad}/{runs} runs liked or reshowed the car swiped left')
        await b.close()
asyncio.run(main())
