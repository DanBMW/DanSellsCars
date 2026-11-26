"""SwipeToDrive Hedin new car deals on the Discover deck (demo mode).
Usage: python3 e2e_offers.py BASE_URL [SHOTS_DIR]   e.g. http://localhost:8765/swipe-drive/"""
import asyncio, sys, os, json
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'e2e_deck.py')).read().split('async def main')[0])
async def shot(pg, n):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); await pg.screenshot(path=os.path.join(SHOTS, n))
async def suite(b, mobile):
    tag = 'mobile' if mobile else 'desktop'
    ctx, pg, errs = await setup(b, mobile)
    deals = json.loads(await pg.evaluate("JSON.stringify(ctDebug.S.newStock.filter(c=>c.offer).map(c=>[c.reg,c.colour,c.offer.monthly]))"))
    ok(len(deals) >= 1, f'{tag}: {len(deals)} deals on stock cars {deals}')
    used = await pg.evaluate("ctDebug.S.cars.length"); ok(used > 50, f'{tag}: used stock still loads ({used} cars)')
    reg = 'NEW4220782'
    await pg.goto(BASE + '?reg=' + reg); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(1500)
    top = await pg.locator('#deck .ct-card').last.inner_text()
    ok('NEW \u2022 UNREGISTERED' in top.upper() and 'DEAL' in top.upper(), f'{tag}: card has NEW \u2022 UNREGISTERED and Deal')
    ok('\u00a3647.54/month' in top and '\u00a35,500 deposit' in top and 'Save \u00a39,285.20' in top, f'{tag}: card shows monthly, deposit and saving')
    ok('Finance subject to status. 18+. T&Cs apply.' in top, f'{tag}: card shows the legal line')
    fit = await pg.evaluate("(()=>{const i=document.querySelector('#deck .ct-card:last-child img.ct-ph-img');return i?[getComputedStyle(i).objectFit,i.currentSrc,i.naturalWidth]:null})()")
    ok(fit and fit[0] == 'contain' and 'oxide-grey' in fit[1] and fit[2] > 0, f'{tag}: deal photo shown whole (object-fit contain) {fit}')
    await shot(pg, f'offer-card-{tag}.png')
    if SHOTS: await pg.locator('#deck .ct-card').last.screenshot(path=os.path.join(SHOTS, f'offer-cardonly-{tag}.png'))
    vis = await pg.evaluate("(()=>{const c=document.querySelector('#deck .ct-card:last-child');const l=c.querySelector('.ct-legal');if(!l)return false;const a=c.getBoundingClientRect(),b=l.getBoundingClientRect();return b.bottom<=a.bottom+1&&b.height>0})()")
    ok(vis, f'{tag}: legal line is inside the visible card')
    await pg.locator('#deck .ct-card').last.click(); await pg.wait_for_selector('#sheet:not([hidden])'); await pg.wait_for_timeout(800)
    sh = await pg.inner_text('#sheet')
    ok('Representative example' in sh and '47 monthly payments of \u00a3647.54' in sh and 'T&Cs apply' in sh, f'{tag}: sheet has the full figures and legal line')
    await shot(pg, f'offer-sheet-{tag}.png')
    if SHOTS: await pg.locator('#sheet .ct-deal').screenshot(path=os.path.join(SHOTS, f'offer-sheetdeal-{tag}.png'))
    ok('\u2013' not in sh and '\u2014' not in sh, f'{tag}: no dashes in the sheet')
    ok(not errs, f'{tag}: no page errors {errs[:2]}'); await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--ignore-certificate-errors'])
        await suite(b, True); await suite(b, False); await b.close()
    n = sum(1 for c, _ in res if c); print(f'\nRESULT offers e2e {n}/{len(res)} passed'); sys.exit(0 if n == len(res) else 1)
asyncio.run(main())
