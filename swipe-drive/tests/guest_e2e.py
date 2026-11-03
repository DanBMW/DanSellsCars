"""Guest swipe page end to end against the local mock of guest-deck (tests/guest_mock_server.mjs).
Usage: python3 tests/guest_e2e.py BASE_URL MOCK_URL TOKEN [SHOTS_DIR]"""
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
    pg = await ctx.new_page(); errs = []; reqs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('request', lambda r: reqs.append(r.url))
    async def shot(n):
        if OUT: await pg.wait_for_timeout(400); await pg.screenshot(path=f'{OUT}/{n}-{t}.png')
    await pg.goto(BASE + 'guest.html#t=' + TOK); await pg.wait_for_selector('#g-tut:not([hidden])', timeout=15000)
    ok(True, t + ': tutorial shows first time for this link'); await shot('1-tutorial')
    await pg.click('#g-tut-go'); await pg.wait_for_selector('#g-deck .g-card:not(.under)')
    n = int((await pg.text_content('#g-count')).split(' of ')[1]); ok(n >= 6, t + f': deck of {n} cars'); await shot('2-deck')
    body = await pg.text_content('body')
    ok(not any(x in body for x in ['Lorna', '07700900111', 'lorna@example', 'Budget', 'Postcode']), t + ': no customer details anywhere on the page')
    ok(await pg.locator('text=Me').count() == 0 and await pg.locator('text=Matches').count() == 0, t + ': no Me tab or matches list')
    await pg.click('#g-like'); await pg.wait_for_timeout(400); await pg.click('#g-pass'); await pg.wait_for_timeout(400)
    card = pg.locator('#g-deck .g-card:not(.under)'); bb = await card.bounding_box()
    await pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2); await pg.mouse.down(); await pg.mouse.move(bb['x'] + bb['width'] / 2 + 200, bb['y'] + bb['height'] / 2, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(500)
    ok('Car 4 of' in await pg.text_content('#g-count'), t + ': buttons and drag both swipe')
    await pg.click('#g-info'); await pg.wait_for_selector('#g-sheet:not([hidden])'); await shot('3-details')
    await pg.click('#g-buy'); await pg.click('#g-buy'); await pg.wait_for_function("document.querySelector('#g-buy-msg').textContent.length>0")
    ok('Sent to Dan' in await pg.text_content('#g-buy-msg'), t + ': Buy this car sends to Dan')
    await pg.click('#g-x')
    for i in range(n):
        if await pg.locator('#g-end').is_visible(): break
        await pg.click('#g-like' if i % 2 else '#g-pass'); await pg.wait_for_timeout(260)
        if i == 6:
            ok(await pg.locator('#g-nudge').is_visible(), t + ': gentle Confirm your details prompt after about 10 swipes'); await shot('4a-nudge')
    await pg.wait_for_selector('#g-end:not([hidden])'); await shot('4-end')
    et = await pg.text_content('#g-end'); ok('Sign in to see your profile and save everything' in et, t + ': gentle sign in prompt at the end')
    await pg.wait_for_selector('#g-chat:not([hidden])', timeout=5000); ok(True, t + ': Revvy opens by itself when the deck ends'); await pg.wait_for_selector('#g-in:not([hidden])')
    await pg.fill('#g-inp', 'Lorna'); await pg.press('#g-inp', 'Enter'); await pg.wait_for_selector('.g-chip >> text=Yes, that is right')
    log = await pg.text_content('#g-log'); ok('a mobile ending 111' in log and '07700900111' not in log, t + ': mobile shown only as a masked hint')
    await pg.click('.g-chip >> text=Yes, that is right'); await pg.wait_for_selector('.g-chip >> text=It has changed')
    log = await pg.text_content('#g-log'); ok('l***@e***.com' in log and 'lorna@example.com' not in log, t + ': email shown only masked'); await shot('5-revvy-confirm')
    await pg.click('.g-chip >> text=It has changed'); await pg.wait_for_selector('#g-in:not([hidden])'); await pg.fill('#g-inp', 'nope'); await pg.press('#g-inp', 'Enter'); await pg.wait_for_timeout(200)
    ok('does not look right' in await pg.text_content('#g-log'), t + ': bad email caught'); await pg.fill('#g-inp', 'lorna.new@example.com'); await pg.press('#g-inp', 'Enter')
    for k in range(40):
        await pg.wait_for_timeout(150); last = await pg.locator('#g-log .g-m.bot').last.text_content()
        if 'Anything else Dan' in last: break
        for lab in ['Yes, still right', 'Skip']:
            if await pg.locator('#g-tray .g-chip', has_text=lab).count(): await pg.locator('#g-tray .g-chip', has_text=lab).first.click(); break
    log = await pg.text_content('#g-log')
    ok('For models, you have' in log and '3 Series, X3' in log and 'Petrol, Hybrid, Diesel' in log and '450' not in log and '£' not in log, t + ': every requirement walked one by one, no budget figures')
    await pg.wait_for_selector('#g-tray .g-chip >> text=Skip'); await pg.click('#g-tray .g-chip >> text=Skip'); await pg.wait_for_selector('text=Sign in to SwipeToDrive >> nth=-1'); await pg.wait_for_timeout(300)
    st = json.load(urllib.request.urlopen(MOCK + '/_state'))['confirm']; ok(st['proposed'].get('email') == 'lorna.new@example.com' and st['confirmed']['phone'] and st['confirmed']['prefs'] and not st['filled'], t + ': changed email held for Dan, confirmations saved')
    ok('Dan will check the new email' in await pg.text_content('#g-log'), t + ': tells them Dan will check the change'); await shot('6-revvy-done')
    full = await pg.text_content('body'); ok(not any(x in full for x in ['07700900111', 'lorna@example.com', 'Hayre']), t + ': no stored contact details anywhere on the page')
    await pg.click('.g-chip >> text=Back to the cars')
    await pg.click('#g-send'); await pg.wait_for_function("document.querySelector('#g-send-msg').textContent.length>0"); ok('Sent to Dan' in await pg.text_content('#g-send-msg'), t + ': Send my likes to Dan works')
    s = json.load(urllib.request.urlopen(MOCK + '/_state')); ok(len(s['swipes']) >= n and all(v['source'] == 'guest_link' for v in s['swipes'].values()), t + ': swipes recorded against the customer as guest_link')
    api = [u for u in reqs if u.startswith(MOCK)]; ok(api and all(u == MOCK + '/functions/v1/guest-deck' for u in api), t + ': the page only ever calls guest-deck')
    ok(not any('/rest/v1/' in u or '/auth/v1/' in u or 'supabase-js' in u for u in reqs), t + ': no database, auth or Supabase client requests')
    await pg.reload(); await pg.wait_for_selector('#g-deck .g-card, #g-end:not([hidden])'); ok(await pg.locator('#g-tut').is_hidden(), t + ': tutorial not repeated for the same link')
    ok(not errs, t + ': no page errors ' + str(errs)); await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome'); await run(b, True); await run(b, False)
        urllib.request.urlopen(MOCK + '/_close')
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, device_scale_factor=2); await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=CFG, content_type='text/javascript'))
        pg = await ctx.new_page(); await pg.goto(BASE + 'guest.html#t=' + TOK); await pg.wait_for_selector('#g-err:not([hidden])')
        ok('no longer active' in await pg.text_content('#g-err'), 'closed customer: link stops working')
        if OUT: await pg.screenshot(path=f'{OUT}/5-link-closed-mobile.png')
        await pg.goto(BASE + 'guest.html'); await pg.reload(); await pg.wait_for_selector('#g-err:not([hidden])'); ok(True, 'no token: error page, nothing loaded')
        await b.close()
    print(f'RESULT guest e2e {sum(res)}/{len(res)}'); sys.exit(0 if all(res) else 1)
asyncio.run(main())
