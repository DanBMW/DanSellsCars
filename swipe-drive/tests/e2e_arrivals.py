"""Swipe Drive Just arrived badge, 'new since your last visit' line and staff 'new today' (demo mode).
Usage: python3 e2e_arrivals.py BASE_URL [SHOTS_DIR]
The arrivals ledger is swapped for a fixture dated from today, so the checks do not depend on the morning's stock."""
import asyncio, sys, os, json, datetime, urllib.request
from zoneinfo import ZoneInfo
from playwright.async_api import async_playwright
BASE = sys.argv[1]; SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
DEMO = "window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
res = []
def ok(c, m): res.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m)
today = datetime.datetime.now(ZoneInfo('Europe/London')).date()
d = lambda n: (today - datetime.timedelta(days=n)).isoformat()
stock = json.load(urllib.request.urlopen(BASE.rstrip('/').rsplit('/', 1)[0] + '/lookup/stock.json'))['cars']
fc = [c for c in stock.values() if c['source'] == 'forecourt'][:6]; gp = [c for c in stock.values() if c['source'] == 'group'][:4]
ages = [0, 2, 6, 7, 12, None]          # None: already there when history began
L = {'today': today.isoformat(), 'lists': {'forecourt': {'history_from': '2026-08-13', 'cars': {}}, 'group': {'history_from': '2026-09-28', 'cars': {}}}}
for c, a in zip(fc, ages): L['lists']['forecourt']['cars'][c['listing_id']] = '2026-08-13' if a is None else d(a)
for c in gp: L['lists']['group']['cars'][c['listing_id']] = d(1)
FRESH = [c['reg'] for c, a in zip(fc, ages) if a is not None and a < 7] + [c['reg'] for c in gp]
OLD = [c['reg'] for c, a in zip(fc, ages) if a is None or a >= 7]
async def shot(pg, n):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); await pg.screenshot(path=os.path.join(SHOTS, n))
async def ctx_for(b, role='customer', last=None):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');" + (f"if(!sessionStorage.seeded){{localStorage.setItem('sdLastVisit','{last}');sessionStorage.seeded=1}}" if last else ''))
    await ctx.route('**/swipe-drive/config.js', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
    await ctx.route('**/automation/stock-arrivals.json', lambda r: r.fulfill(body=json.dumps(L), content_type='application/json'))
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_selector('#siEmail')
    await pg.fill('#siEmail', role + '@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click(f'[data-demo={role}]')
    if role == 'customer':
        await pg.wait_for_function("location.hash=='#profile'||location.hash=='#discover'")
        if await pg.evaluate("location.hash") == '#profile':
            await pg.fill('#profileForm [name=name]', 'Sam')
            if await pg.locator('#profileForm [name=phone]').count(): await pg.fill('#profileForm [name=phone]', '07700900123')
            await pg.click('#pfSave'); await pg.wait_for_function("location.hash=='#discover'", timeout=15000)
        await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(800)
    return ctx, pg, errs
async def top(pg): return await pg.evaluate("ctDebug.S.deck[0].car.reg")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        last = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=3)).isoformat()
        ctx, pg, errs = await ctx_for(b, 'customer', last)
        st = json.loads(await pg.evaluate("JSON.stringify(ctDebug.S.cars.filter(c=>c.arrived_on).map(c=>[c.reg,c.arrived_days]))"))
        ok(sorted(r for r, _ in st) == sorted(FRESH + [r for r in OLD if L['lists']['forecourt']['cars'].get(next(c['listing_id'] for c in fc if c['reg'] == r)) != '2026-08-13']), 'arrival dates stamped from the ledger by listing id')
        exp = await pg.evaluate("ctDebug.S.deck.filter(x=>x.car.arrived_on && x.car.arrived_on > '" + d(3) + "').length")
        line = await pg.locator('#sinceLast').inner_text() if await pg.locator('#sinceLast:visible').count() else ''
        ok(exp > 0 and line == (f'{exp} new cars since your last visit' if exp != 1 else '1 new car since your last visit'), f'since line: "{line}" (expected {exp})')
        indeck = set(json.loads(await pg.evaluate("JSON.stringify(ctDebug.S.deck.map(x=>x.car.reg))")))
        fresh_top = [r for r in FRESH if r in indeck][0]
        await pg.goto(BASE + '?reg=' + fresh_top); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(800)
        card = pg.locator('#deck .ct-card').last
        ok(await top(pg) == fresh_top and await card.locator('.ct-just').count() == 1 and (await card.locator('.ct-just').inner_text()).strip().lower() == 'just arrived', 'Just arrived badge on the card')
        ok('Just arrived' in await card.inner_text() or 'JUST ARRIVED' in await card.inner_text(), 'badge text visible'); await shot(pg, 'ar1-card.png')
        ok(not await pg.locator('#sinceLast:visible').count(), 'a second load the same day shows no since line')
        await card.click(); await pg.wait_for_selector('#sheet:not([hidden])'); await pg.wait_for_timeout(400)
        sh = await pg.inner_text('#sheet'); ok('Just arrived' in sh or 'JUST ARRIVED' in sh, 'badge in details'); ok('Arrived' in sh and any(t in sh for t in ['Today', 'Yesterday', 'days ago']), 'details show when it arrived'); await shot(pg, 'ar2-sheet.png')
        await pg.locator('#sheet [data-close]').first.click(); await pg.wait_for_timeout(300)
        old = ([r for r in OLD if r in indeck] or [None])[0]
        if old:
            await pg.goto(BASE + '?reg=' + old); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(700)
            ok(await pg.locator('#deck .ct-card').last.locator('.ct-just').count() == 0, f'no badge on a car 7 or more days old or already in stock ({old})')
        body = await pg.inner_text('body'); ok('\u2013' not in body and '\u2014' not in body and ' - ' not in body, 'no dashes in visible copy')
        ok(not errs, f'no page errors {errs[:2]}'); await ctx.close()
        # since line screenshot on a fresh device with an older visit
        ctx, pg, errs = await ctx_for(b, 'customer', (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=8)).isoformat())
        n = await pg.evaluate("ctDebug.S.sinceN"); ok(n >= len([r for r in FRESH if True]) - 2 and await pg.locator('#sinceLast:visible').count() == 1, f'older visit shows {n} new cars'); await shot(pg, 'ar3-since.png')
        sv = await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('sdLastVisit')).length"); dv = await pg.evaluate("JSON.stringify(JSON.parse(localStorage.ctDemoV1).visits||{})")
        ok(sv >= 2 and len(json.loads(dv)) == 1, 'visit saved per device and per profile')
        await ctx.close()
        # staff new today from the ledger
        ctx, pg, errs = await ctx_for(b, 'admin'); await pg.wait_for_timeout(1500)
        fr = json.loads(await pg.evaluate("JSON.stringify(Object.keys(ctDebug.S.fresh||{}))"))
        ok(sorted(fr) == sorted([c['reg'] for c, a in zip(fc, ages) if a == 0]), f'staff new today comes from the ledger ({fr})')
        ok(await pg.evaluate("localStorage.getItem('ctSeenRegs')") is None, 'old per browser seen list is gone')
        ok(not errs, f'staff no page errors {errs[:2]}'); await ctx.close(); await b.close()
    n = sum(1 for c, _ in res if c); print(f'\nRESULT arrivals e2e {n}/{len(res)} passed'); sys.exit(0 if n == len(res) else 1)
asyncio.run(main())
