import asyncio, sys
from playwright.async_api import async_playwright
BASE=sys.argv[1]; OUT=sys.argv[2] if len(sys.argv)>2 else None
DEMO="window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
res=[]
def ok(c,m): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+m)
async def run(b, mobile):
    t='mobile' if mobile else 'desktop'
    kw=dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2) if mobile else dict(viewport={'width':1280,'height':860})
    ctx=await b.new_context(**kw); await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');")
    await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    async def shot(n):
        if OUT: await pg.wait_for_timeout(300); await pg.screenshot(path=f'{OUT}/{n}-{t}.png')
    await pg.goto(BASE); await pg.wait_for_selector('#siEmail'); await pg.fill('#siEmail','dan@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=admin]')
    await pg.wait_for_timeout(1200); await pg.evaluate("location.hash='#team'"); await pg.wait_for_timeout(800)
    for nm,ph in (('Lorna Hayre','07700900111'),('Sam Test','07700900222')):
        await pg.click('#addCust'); await pg.wait_for_selector('#profileForm [name=name]'); await pg.fill('#profileForm [name=name]',nm); await pg.fill('#profileForm [name=phone]',ph)
        if await pg.locator('#profileForm [name=email]').count(): await pg.fill('#profileForm [name=email]',nm.split()[0].lower()+'@example.com')
        await pg.click('#pfSave'); await pg.wait_for_function("location.hash=='#discover'",timeout=15000); await pg.evaluate("location.hash='#team'"); await pg.wait_for_timeout(900)
    card=pg.locator('.ct-c',has_text='Lorna Hayre'); await card.locator('[data-act=close]').scroll_into_view_if_needed(); await shot('1-button')
    ok(await pg.locator('.ct-c').count()==2,'two open customers listed')
    await card.locator('[data-act=close]').click(); await pg.wait_for_selector('#closeModal:not([hidden])')
    txt=await pg.inner_text('#closeModal'); ok("Close Lorna Hayre?" in txt and "They'll move to Archived and stop getting alerts. You can reopen them any time." in txt,'confirm window wording'); await shot('2-confirm')
    await pg.click('#closeNo'); ok(await pg.locator('#closeModal').is_hidden() and await pg.locator('.ct-c',has_text='Lorna Hayre').count()==1,'Cancel leaves the customer open')
    await card.locator('[data-act=close]').click(); await pg.click('#closeYes'); await pg.wait_for_selector('#undoToast:not([hidden])'); await pg.wait_for_timeout(500)
    ok(await pg.locator('.ct-c',has_text='Lorna Hayre').count()==0,'closed customer leaves the main list'); await shot('3-undo-toast')
    await pg.click('#undoBtn'); await pg.wait_for_timeout(800); ok(await pg.locator('.ct-c',has_text='Lorna Hayre').count()==1,'Undo brings them back')
    await pg.locator('.ct-c',has_text='Lorna Hayre').locator('[data-act=close]').click(); await pg.click('#closeYes'); await pg.wait_for_timeout(600)
    c=await pg.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>/demo/i.test(k))||'{}'))")
    lo=[x for x in (c.get('customers') or []) if x.get('name')=='Lorna Hayre']
    ok(lo and lo[0].get('closed_at') and lo[0].get('phone')=='07700900111','soft flag set, data kept')
    await pg.locator('#custTabs [data-tab=archived]').click(); await pg.wait_for_timeout(600)
    at=(await pg.text_content('#custList')); ok('Lorna Hayre' in at and 'Closed' in at and 'Sam Test' not in at and await pg.locator('[data-act=reopen]').count()==1,'Archived shows closed customer with Reopen'); await shot('4-archived')
    ok('1' in (await pg.text_content('#archN')),'Archived count shown')
    await pg.click('[data-act=reopen]'); await pg.wait_for_timeout(600); ok('No closed customers' in await pg.inner_text('#custList'),'Reopen moves them back')
    await pg.locator('#custTabs [data-tab=open]').click(); await pg.wait_for_timeout(600); ok(await pg.locator('.ct-c',has_text='Lorna Hayre').count()==1,'reopened customer back in main list')
    vis=await pg.evaluate("[...document.querySelectorAll('#custTabs,#closeModal,#undoToast')].map(e=>e.innerText).join(' ')"); ok(not any(d in vis for d in ['\u2013','\u2014',' - ']),'no dashes in the new copy')
    ok(not errs,'no page errors '+str(errs)); await ctx.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel='chrome'); await run(b,True); await run(b,False); await b.close()
    print(f'RESULT close {sum(res)}/{len(res)}'); sys.exit(0 if all(res) else 1)
asyncio.run(main())
