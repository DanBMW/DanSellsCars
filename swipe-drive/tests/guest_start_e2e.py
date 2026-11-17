"""SwipeToDrive BETA guest flow, consent bar, privacy page and screenshots, in demo mode (nothing leaves the browser:
config.js is swapped for demo, and every Formspree, Supabase and Google request is caught and counted).
Usage: python3 guest_flow.py BASE_URL SHOTS_DIR"""
import asyncio, sys, json, re
from playwright.async_api import async_playwright
BASE = sys.argv[1]; SHOTS = sys.argv[2]
DEMO = "window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
res = []
def ok(c, m): res.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m)
SIZES = {'375x667': dict(viewport={'width': 375, 'height': 667}, is_mobile=True, has_touch=True, device_scale_factor=2),
         '390x844': dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2),
         '1280x800': dict(viewport={'width': 1280, 'height': 800})}
async def new(b, size, consent=None):
    ctx = await b.new_context(**SIZES[size]); out = {'ext': [], 'ga': []}
    init = "localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');"
    if consent: init += f"localStorage.setItem('sd_cookie_consent_v1','{consent}');"
    await ctx.add_init_script(init)
    await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
    async def catch(r):
        u = r.request.url
        if 'googletagmanager' in u or 'google-analytics' in u: out['ga'].append(u)
        else: out['ext'].append(u)
        await r.fulfill(status=204, body='')
    for pat in ['**/formspree.io/**', '**/*.supabase.co/**', '**/*googletagmanager.com/**', '**/*google-analytics.com/**', '**/*analytics.google.com/**', '**/wa.me/**', '**/cal.com/**']:
        await ctx.route(pat, catch)
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    return ctx, pg, errs, out
async def shot(pg, name): await pg.screenshot(path=f'{SHOTS}/{name}.png'); print('  shot', name)

async def wizard(pg, must_suv=True):
    await pg.wait_for_selector('[data-screen=start]:not([hidden])')
    await pg.click('[data-wiz-go="1"] >> nth=0')
    await pg.click('#startForm [data-name=budget_type] [data-v=monthly]'); await pg.fill('#startForm [name=monthly_gbp]', '600')
    await pg.click('[data-step="1"] [data-wiz-go="2"]')
    if must_suv:
        await pg.click('#wizBody [data-v=suv]'); await pg.click('#wizBody [data-v=suv]')
    await pg.click('[data-step="2"] [data-wiz-go="3"]')
    await pg.click('#startForm [data-name=new_used] [data-v=used]')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for size in ['390x844', '375x667', '1280x800']:
            print('==', size)
            ctx, pg, errs, out = await new(b, size)
            await pg.goto(BASE); await pg.wait_for_selector('[data-screen=start]:not([hidden])')
            ok(await pg.title() == 'SwipeToDrive BETA | Find your perfect BMW', f'{size} title')
            ok(await pg.locator('.sd-cc').is_visible(), f'{size} consent bar shows before any choice')
            ok(not out['ga'] and await pg.evaluate("!document.querySelector('script[src*=googletagmanager]')"), f'{size} no GA before consent')
            await shot(pg, f'guest-start-consent-bar-{size}')
            await pg.click('.sd-cc button:has-text("No thanks")'); await pg.wait_for_timeout(200)
            ok(await pg.evaluate("!document.querySelector('script[src*=googletagmanager]')"), f'{size} no GA after No thanks')
            await shot(pg, f'guest-start-{size}')
            await wizard(pg); await shot(pg, f'guest-question3-{size}')
            await pg.click('#wizDone'); await pg.wait_for_function("location.hash=='#discover'")
            await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(700)
            st = json.loads(await pg.evaluate("JSON.stringify({g:ctDebug.S.session.guest,body:ctDebug.S.cust.body,must:ctDebug.S.cust.body_must,n:ctDebug.S.deck.length,bodies:ctDebug.S.deck.map(function(x){return x.car.body||''}),nav:!document.getElementById('nav').hidden})"))
            ok(st['g'] and st['body'] == 'suv' and st['must'], f'{size} guest session with SUV must have')
            ok(st['n'] > 0 and all(x.lower() in ('suv', '') for x in st['bodies']), f'{size} deck of {st["n"]} only SUVs (or unknown body): {sorted(set(st["bodies"]))}')
            await shot(pg, f'guest-deck-{size}')
            if size == '375x667':
                ok(await pg.locator('#deck .ct-card:last-child .ct-replink').is_visible() or not await pg.locator('#deck .ct-card:last-child .ct-replink').count(), f'{size} rep example pointer visible when the card has finance')
            # like a car: contact ask (or the match pop up for a 90+ car)
            await pg.click('#btnLike'); await pg.wait_for_timeout(900)
            if await pg.evaluate("!document.getElementById('matchModal').hidden"):
                ok(await pg.locator('#mmSave').is_visible(), f'{size} guest match pop up offers Save it with Dan'); await pg.click('#mmSave'); await pg.wait_for_timeout(300)
            ok(await pg.locator('#askSheet').is_visible(), f'{size} contact ask opens on first like')
            ok('Dan Cane of Dan Sells, Sidcup' in await pg.inner_text('#askConsentText'), f'{size} consent wording names Dan Sells, Sidcup')
            await shot(pg, f'guest-contact-ask-{size}')
            await pg.click('#askGo'); await pg.wait_for_timeout(200)
            ok(await pg.locator('.ct-ferr').count() >= 2, f'{size} empty ask shows errors (name, contact, consent)')
            await pg.fill('#askForm [name=name]', 'Test Guest'); await pg.fill('#askForm [name=email]', 'test.guest@example.com'); await pg.check('#askConsent')
            await pg.click('#askGo'); await pg.wait_for_selector('#askDone:not([hidden])')
            await shot(pg, f'guest-contact-sent-{size}')
            await pg.click('#askDone [data-ask-x]')
            ct = json.loads(await pg.evaluate("localStorage.getItem('sd_guest_v1')"))
            ok(ct.get('contact', {}).get('email') == 'test.guest@example.com' and ct['contact'].get('consent_at'), f'{size} contact and consent stored on the phone')
            # match pop up names the car that was swiped
            await pg.wait_for_timeout(300)
            top = await pg.evaluate("(function(){var l=[].slice.call(document.querySelectorAll('#deck .ct-card')).filter(function(e){return !e._flung});return l[l.length-1].dataset.reg})()")
            model = await pg.evaluate(f"ctDebug.S.deck.find(function(x){{return x.car.reg=={top!r}}}).car.model")
            await pg.click('#btnSuper'); await pg.wait_for_selector('#matchModal:not([hidden])'); await pg.wait_for_timeout(500)
            txt = await pg.inner_text('#mmText')
            ok(model in txt, f'{size} match pop up names the swiped car ({model})')
            btns = await pg.evaluate("[].slice.call(document.querySelectorAll('#matchModal .ct-btn')).filter(function(e){return e.offsetParent}).map(function(e){return e.id||e.textContent.trim()})")
            ok(btns.index('mmWa') < btns.index('mmTd'), f'{size} WhatsApp comes before test drive: {btns}')
            await shot(pg, f'match-popup-{size}')
            await pg.evaluate("document.getElementById('matchModal').hidden=true")
            await pg.goto(BASE + '#me'); await pg.wait_for_selector('[data-screen=guestme]:not([hidden])')
            ok('Test' in await pg.inner_text('#gmTitle'), f'{size} returning guest resumes, guest Me shows')
            await shot(pg, f'guest-me-{size}')
            # Revvy is there
            ok(await pg.locator('.rvc').count() > 0, f'{size} Revvy appears')
            # sign in carries the swipes
            liked_before = await pg.evaluate("Object.keys(ctDebug.S.swipes).filter(function(r){return ctDebug.S.swipes[r].liked})")
            await pg.goto(BASE + '#signin'); await pg.wait_for_selector('#siEmail')
            await pg.fill('#siEmail', 'test.guest@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=customer]')
            await pg.wait_for_function("ctDebug.S.session && !ctDebug.S.session.guest && ctDebug.S.cust", timeout=15000); await pg.wait_for_timeout(1500)
            car = json.loads(await pg.evaluate("JSON.stringify({sw:ctDebug.S.swipes,c:ctDebug.S.cust,g:localStorage.getItem('sd_guest_v1')})"))
            ok(all(car['sw'].get(r, {}).get('liked') for r in liked_before) and len(liked_before) >= 1, f'{size} {len(liked_before)} liked cars carried into the account')
            ok(car['c'].get('owner_staff_id') in (None, '') and (car['c'].get('desk') or {}).get('lead_source'), f'{size} account owned by Dan (no owner) with lead source {(car["c"].get("desk") or {}).get("lead_source")}')
            ok(car['g'] is None, f'{size} guest storage cleared after carry')
            ok(not out['ext'], f'{size} nothing sent to Formspree or Supabase in demo: {out["ext"][:3]}')
            ok(not errs, f'{size} no page errors {errs[:2]}')
            await ctx.close()
        # consent accept loads GA once
        ctx, pg, errs, out = await new(b, '390x844'); await pg.goto(BASE); await pg.wait_for_selector('.sd-cc')
        await pg.click('.sd-cc button:has-text("Accept")'); await pg.wait_for_timeout(600)
        ok(await pg.evaluate("!!document.querySelector('script[src*=googletagmanager]')") and out['ga'], 'GA loads only after Accept')
        await ctx.close()
        # privacy and terms pages
        for size in ['390x844', '1280x800']:
            ctx, pg, errs, out = await new(b, size, 'no')
            for page in ['privacy', 'terms']:
                await pg.goto(BASE + page + '.html'); await pg.wait_for_timeout(300)
                t = await pg.inner_text('body'); ok('noindex' in await pg.content(), f'{size} {page} noindex')
                hits = [m.group(0) for m in re.finditer(r'[^.]*(hedin|ruxley)[^.]*', t, re.I)]
                ok(all(re.search(r'data controller|credit broker|Appointed Representative|trading as|registered', h, re.I) for h in hits), f'{size} {page} names the entity only in legal statements: {[h.strip()[:90] for h in hits]}')
                await shot(pg, f'{page}-{size}')
            await ctx.close()
        # desktop signed in deck for comparison
        await b.close()
    bad = [m for c, m in res if not c]; print(f'\n{len(res) - len(bad)}/{len(res)} passed'); [print('FAILED:', m) for m in bad]
asyncio.run(main())
