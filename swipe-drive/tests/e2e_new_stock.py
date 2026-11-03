"""SwipeToDrive real new stock in the Discover deck (demo mode).
Usage: python3 e2e_new_stock.py BASE_URL [SHOTS_DIR]"""
import asyncio, sys, os, json
sys.argv += [] ; exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'e2e_deck.py')).read().split('async def main')[0])
async def shot(pg, n):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); await pg.screenshot(path=os.path.join(SHOTS, n))
async def budget(pg, cash):
    await pg.evaluate(f"ctDebug.S.cust.budget_type='cash';ctDebug.S.cust.cash_gbp={cash};ctDebug.S.deck=[];location.hash='#matches';")
    await pg.wait_for_timeout(300); await pg.evaluate("location.hash='#discover'"); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(500)
kinds = lambda pg: pg.evaluate("JSON.stringify(ctDebug.S.deck.map(d=>[d.car.kind||'used',d.car.reg,d.car.price_gbp||0]))")
async def suite(b):
    ctx, pg, errs = await setup(b, True)
    d = json.loads(await kinds(pg)); ns = [x for x in d if x[0] == 'new_stock']; ph = [x for x in d if x[0] == 'new']
    ok(len(ns) >= 60, f'{len(ns)} real new cars in the deck'); ok(all(x[1].startswith('NEW') and x[1][3:].isdigit() for x in ns), 'ids are NEW+order number')
    covered = await pg.evaluate("ctDebug.S.deck.filter(d=>d.car.kind==='new').filter(d=>ctDebug.S.newStock.some(s=>ctMatch.covers(s,d.car.name||d.car.model))).length")
    ok(covered == 0, 'no model card where real stock covers that model')
    reg = ns[0][1]
    await pg.goto(BASE + '?reg=' + reg); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(700)
    top = await pg.locator('#deck .ct-card').last.inner_text()
    ok(top.upper().count('NEW, IN STOCK') >= 2, 'card labelled New, in stock'); await shot(pg, 'ns1-card.png')
    await pg.locator('#deck .ct-card').last.click(); await pg.wait_for_selector('#sheet:not([hidden])'); await pg.wait_for_timeout(400)
    sh = await pg.inner_text('#sheet'); ok('Order number' in sh and reg[3:] in sh, 'details show the order number')
    ok(('monthly payments of' in sh) or ('a month' not in sh), 'monthly only with representative example'); await shot(pg, 'ns2-sheet.png')
    ok('wa.me/447827138197' in (await pg.locator('#sheet a.ct-wa').first.get_attribute('href')) and reg[3:] in (await pg.locator('#sheet a.ct-wa').first.get_attribute('href')), 'WhatsApp link names the order number')
    await pg.locator('#sheet [data-close]').first.click(); await pg.wait_for_timeout(300); await pg.evaluate(f"ctDebug.S.swipes['{reg}']={{liked:true,at:Date.now()}};location.hash='#matches'"); await pg.wait_for_timeout(700)
    await pg.locator(f'[data-buy="{reg}"]').scroll_into_view_if_needed(); await shot(pg, 'ns3-matches.png')
    ok(await pg.locator(f'[data-buy="{reg}"]').count() == 1, 'real new car has Buy this car in matches')
    await pg.locator(f'[data-buy="{reg}"]').click(); await pg.wait_for_selector('#buyModal:not([hidden])'); await shot(pg, 'ns4-confirm.png')
    await pg.locator('#buyModal button[type=submit], #buyModal .ct-btn-big').first.click(); await pg.wait_for_timeout(900)
    buys = json.loads(await pg.evaluate("JSON.stringify(JSON.parse(localStorage.ctDemoV1).buys||[])"))
    bq = buys[0] if buys else {}
    ok(bq.get('car_reg') == reg and bq.get('car_id') == reg[3:] and ('order ' + reg[3:]) in bq.get('car_model', ''), f"buy request carries order id and model: {bq.get('car_model')}")
    await shot(pg, 'ns5-sent.png')
    # placeholder
    pr = ph[0][1]; await pg.goto(BASE + '?reg=' + pr); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(700)
    await pg.locator('#deck .ct-card').last.click(); await pg.wait_for_selector('#sheet:not([hidden])'); await pg.wait_for_timeout(400)
    ok(await pg.locator('#sheet [data-buy]').count() == 0, 'model card has no buy button')
    a = pg.locator('#sheet a', has_text='Ask Dan about this model'); ok(await a.count() == 1 and 'wa.me/447827138197' in (await a.first.get_attribute('href')), 'model card asks Dan on WhatsApp'); await shot(pg, 'ns6-model.png')
    await pg.locator('#sheet [data-close]').first.click(); await pg.wait_for_timeout(300); await pg.evaluate(f"ctDebug.S.swipes['{pr}']={{liked:true,at:Date.now()}};location.hash='#matches'"); await pg.wait_for_timeout(700)
    ok(await pg.locator(f'[data-buy="{pr}"]').count() == 0 and await pg.locator('a:visible', has_text='Ask Dan about this model').count() >= 1, 'matches: model card asks Dan, no buy button'); await shot(pg, 'ns7-matches-model.png')
    # budget
    await budget(pg, 20000); d = json.loads(await kinds(pg))
    ok(not any(x[0] in ('new_stock', 'new') for x in d), 'cash £20,000 hides new cars and model cards (no new BMW in stock that cheap)')
    await budget(pg, 40000); d = json.loads(await kinds(pg))
    ok(any(x[0] == 'new_stock' for x in d) and all(x[2] <= 40000 for x in d if x[0] == 'new_stock'), 'cash £40,000 shows only new cars priced within it')
    html = await pg.content(); ok('\u2013' not in await pg.inner_text('body') and '\u2014' not in await pg.inner_text('body'), 'no dashes in visible copy')
    ok(not errs, f'no page errors {errs[:2]}'); await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome'); await suite(b); await b.close()
    n = sum(1 for c, _ in res if c); print(f'\nRESULT new stock e2e {n}/{len(res)} passed'); sys.exit(0 if n == len(res) else 1)
asyncio.run(main())
