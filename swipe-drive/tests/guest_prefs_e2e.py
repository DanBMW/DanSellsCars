"""Revvy car preference review after the deck, against the local mock. Usage: python3 tests/guest_prefs_e2e.py BASE MOCK TOKEN [SHOTS]"""
import asyncio, sys, json, urllib.request
from playwright.async_api import async_playwright
BASE, MOCK, TOK = sys.argv[1], sys.argv[2], sys.argv[3]; OUT = sys.argv[4] if len(sys.argv) > 4 else None
CFG = "window.CT_CONFIG={MODE:'supabase',SUPABASE_URL:'%s',SUPABASE_ANON_KEY:'anon-test',DAN_WA:'447827138197'};" % MOCK
res = []
def ok(c, m): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + m)
async def run(b, mobile):
    t = 'mobile' if mobile else 'desktop'
    kw = dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2) if mobile else dict(viewport={'width': 1280, 'height': 860})
    ctx = await b.new_context(**kw); await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=CFG, content_type='text/javascript'))
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    async def shot(n):
        if OUT: await pg.wait_for_timeout(350); await pg.screenshot(path=f'{OUT}/{n}-{t}.png')
    await pg.goto(BASE + 'guest.html#t=' + TOK); await pg.wait_for_selector('#g-tut:not([hidden])')
    await pg.click('#g-tut-go')
    while await pg.locator('#g-end:not([hidden])').count() == 0:
        await pg.click('#g-like'); await pg.wait_for_timeout(350)
    await pg.wait_for_selector('#g-chat:not([hidden])', timeout=5000); ok(True, t + ': chat opens itself at deck end')
    await pg.fill('#g-inp', 'Lorna'); await pg.press('#g-inp', 'Enter')
    for _ in range(2):
        await pg.wait_for_selector('#g-tray .g-chip.go'); await pg.click('#g-tray .g-chip.go'); await pg.wait_for_timeout(150)
    await pg.wait_for_selector('#g-tray .g-chip >> text=Change it'); await shot('1-models-on-file')
    await pg.click('#g-tray .g-chip >> text=Change it'); await pg.wait_for_selector('.g-picks.tri')
    async def to(k, v):
        e = pg.locator(f'.g-pick[data-k="{k}"]')
        for _ in range(3):
            if await e.get_attribute('data-s') == v: break
            await e.click()
    x3 = pg.locator('.g-pick[data-k="X3"]'); await to('X3', 'must'); await to('5 Series', 'like')
    ok(await x3.get_attribute('data-s') == 'must' and 'Must have' in await x3.text_content(), t + ': two taps make must have')
    s3 = pg.locator('.g-pick[data-k="3 Series"]')
    await to('3 Series', ''); await to('X1', '')
    ok(await s3.get_attribute('data-s') == '', t + ': third tap clears'); await shot('2-models-picker')
    await pg.click('.g-done'); await pg.wait_for_timeout(200)
    await pg.click('#g-tray .g-chip >> text=Yes, still right')  # colours
    await pg.click('#g-tray .g-chip >> text=Change it'); await pg.wait_for_selector('.g-picks.tri'); await shot('3-spec-picker')
    await pg.locator('.g-pick').first.click(); await pg.click('.g-done'); await pg.wait_for_timeout(200)
    await pg.click('#g-tray .g-chip >> text=Change it'); await pg.wait_for_selector('.g-picks')
    for k in await pg.eval_on_selector_all('.g-pick[data-s="like"]', 'e=>e.map(x=>x.dataset.k)'): await pg.locator(f'.g-pick[data-k="{k}"]').click()
    await pg.locator('.g-pick[data-k="diesel"]').click(); await shot('4-fuel-picker'); await pg.click('.g-done'); await pg.wait_for_timeout(200)
    await pg.click('#g-tray .g-chip >> text=Change it'); await pg.wait_for_selector('.g-picks')
    await pg.locator('.g-pick[data-k="0_8k"]').click(); await pg.click('.g-done'); await pg.wait_for_timeout(200)
    for _ in range(2): await pg.click('#g-tray .g-chip >> text=Yes, still right'); await pg.wait_for_timeout(150)
    await pg.click('#g-tray .g-chip >> text=Skip'); await pg.wait_for_selector('text=car preferences are updated'); await shot('5-done')
    s = json.load(urllib.request.urlopen(MOCK + '/_state')); pp = s.get('prefs') or {}; pt = pp.get('patch', {})
    ok(set(pt.get('models', [])) == {'X3', '5 Series'} and pt.get('models_must') == ['X3'], t + ': models saved with must have')
    ok(pt.get('fuel') == 'diesel' and pt.get('mileage_bands') and '0_8k' in pt['mileage_bands'] and 'specs' in pt and 'colours' not in pt, t + ': fuel, mileage, spec saved; untouched colours left alone')
    ok(not any(k in pt for k in ['phone', 'email', 'budget_type']), t + ': prefs never touch contact or budget')
    log = await pg.text_content('#g-log'); ok('£' not in log and '450' not in log, t + ': no budget figure in the chat')
    ok(not errs, t + ': no page errors ' + ';'.join(errs)); await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, sys.argv[5] != 'desktop'); await b.close()
    print(f'RESULT guest prefs e2e {sum(res)}/{len(res)}')
asyncio.run(main())
