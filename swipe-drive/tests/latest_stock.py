import asyncio, sys
from playwright.async_api import async_playwright
BASE=sys.argv[1]; OUT=sys.argv[2] if len(sys.argv)>2 else None
res=[]
def ok(c,m): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+m)
async def run(b, mobile, enabled):
    t=('mobile' if mobile else 'desktop')+('-on' if enabled else '-off')
    DEMO="window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false,CUSTOMER_EMAIL_ENABLED:%s};"%('true' if enabled else 'false')
    kw=dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2) if mobile else dict(viewport={'width':1280,'height':860})
    ctx=await b.new_context(**kw); await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');")
    await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_selector('#siEmail'); await pg.fill('#siEmail','dan@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=admin]')
    await pg.wait_for_timeout(1200); await pg.evaluate("location.hash='#team'"); await pg.wait_for_timeout(800)
    await pg.click('#addCust'); await pg.wait_for_selector('#profileForm [name=name]'); await pg.fill('#profileForm [name=name]','Lorna Hayre'); await pg.fill('#profileForm [name=phone]','07700900111'); await pg.fill('#profileForm [name=email]','lorna@example.com')
    await pg.locator('#modelChips [data-v="3 Series"]').click()
    await pg.click('#pfSave'); await pg.wait_for_function("location.hash=='#discover'",timeout=15000); await pg.evaluate("location.hash='#team'"); await pg.wait_for_timeout(900)
    btn=pg.locator('.ct-c',has_text='Lorna Hayre').locator('[data-act=stock]'); ok(await btn.count()==1,t+': Send customer latest stock button on the card')
    if OUT and not enabled: await btn.scroll_into_view_if_needed(); await pg.wait_for_timeout(2700); await pg.screenshot(path=f'{OUT}/1-button-{t}.png')
    await btn.click(); await pg.wait_for_selector('#stockModal:not([hidden])'); await pg.wait_for_timeout(2800)
    txt=await pg.text_content('#stockModal'); n=await pg.locator('#stockCars .ct-stock-car').count()
    ok('Are you sure?' in txt and 'lorna@example.com' in txt and 1<=n<=6,t+f': confirm window shows email and {n} cars')
    if enabled: ok(await pg.locator('#stockYes').is_enabled() and await pg.locator('#stockNote').is_hidden(),t+': send button live when emails are on')
    else: ok(await pg.locator('#stockYes').is_disabled() and 'Customer emails are off' in txt,t+': emails off message, send disabled')
    if OUT: await pg.screenshot(path=f'{OUT}/2-confirm-{t}.png')
    if enabled: await pg.click('#stockYes'); await pg.wait_for_timeout(600); ok('demo mode' in (await pg.text_content('#toast') or ''),t+': demo send reports nothing sent')
    else: await pg.click('#stockNo'); ok(await pg.locator('#stockModal').is_hidden(),t+': Cancel closes the window')
    ok(not errs,t+': no page errors '+str(errs)); await ctx.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel='chrome')
        for m in (True,False):
            for e in (False,True): await run(b,m,e)
        await b.close()
    print(f'RESULT latest stock {sum(res)}/{len(res)}'); sys.exit(0 if all(res) else 1)
asyncio.run(main())
