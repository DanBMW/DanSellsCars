"""SwipeToDrive first open guest flow: 15 free swipes with no account and no questions, Revvy flies in after the 15th,
"Maybe later" re-prompts once after another 15 and then never, the questions then the save step, and the guest's
likes and passes carried into an account without changing what the account already holds. Demo mode: nothing leaves
the browser (config.js swapped for demo, Formspree, Supabase and Google caught and counted).
Usage: python3 guest_free15_e2e.py BASE_URL SHOTS_DIR"""
import asyncio, sys, json
from playwright.async_api import async_playwright
BASE = sys.argv[1]; SHOTS = sys.argv[2]
DEMO = "window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
PHONE = dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
res = []
def ok(c, m): res.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m)
async def new(b, seed=None, size=PHONE):
    ctx = await b.new_context(**size); out = {'ext': []}
    init = "if(!sessionStorage.getItem('t0')){sessionStorage.setItem('t0','1');localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');localStorage.setItem('sd_cookie_consent_v1','no');" + (f"localStorage.setItem('ctDemoV1',{json.dumps(json.dumps(seed))});" if seed else '') + "}"
    await ctx.add_init_script(init)
    await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
    async def catch(r): out['ext'].append(r.request.url); await r.fulfill(status=204, body='')
    for pat in ['**/formspree.io/**', '**/*.supabase.co/**', '**/*googletagmanager.com/**', '**/*google-analytics.com/**', '**/wa.me/**']:
        await ctx.route(pat, catch)
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    return ctx, pg, errs, out
async def shot(pg, name): await pg.screenshot(path=f'{SHOTS}/{name}.png'); print('  shot', name)
async def vis(pg, sel): return await pg.evaluate(f"(function(){{var e=document.querySelector({sel!r});if(!e)return false;for(var a=e;a&&a.nodeType===1;a=a.parentElement){{if(a.hidden||getComputedStyle(a).display==='none')return false}}var r=e.getBoundingClientRect();return r.width>0&&r.height>0}})()")
async def free(pg): return json.loads(await pg.evaluate("JSON.stringify(ctDebug.free())"))
async def count(pg): return await pg.evaluate("Object.keys(ctDebug.S.swipes).length")
async def swipe(pg, like):
    await pg.wait_for_selector('#deck .ct-card'); await pg.click('#btnLike' if like else '#btnPass'); await pg.wait_for_timeout(420)
    if await vis(pg, '#matchModal'): await pg.evaluate("document.getElementById('matchModal').hidden=true")
async def swipes(pg, n, label, like_every=3, quiet=True):
    """n swipes; with quiet, Revvy and the contact ask must stay away the whole time"""
    bad = []
    for i in range(n):
        await swipe(pg, bool(like_every) and i % like_every == 0)
        if quiet and (await vis(pg, '#revvyPrompt') or await vis(pg, '#askSheet')): bad.append(await count(pg))
    if quiet: ok(not bad, f'{label}: no Revvy prompt and no contact ask (bad at {bad[:3]})')
async def start_free(pg):
    await pg.goto(BASE); await pg.wait_for_selector('[data-screen=start]:not([hidden])')
    await pg.click('[data-free-go]'); await pg.wait_for_function("location.hash=='#discover'"); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(500)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])

        print('== A: 15 free swipes, Revvy, Maybe later, one re-prompt, then never')
        ctx, pg, errs, out = await new(b)
        await pg.goto(BASE); await pg.wait_for_selector('[data-screen=start]:not([hidden])'); await pg.wait_for_timeout(400)
        ok('No account and no questions' in await pg.inner_text('.ct-start-hero'), 'landing says no account and no questions')
        await shot(pg, '01-landing')
        await pg.click('[data-free-go]'); await pg.wait_for_function("location.hash=='#discover'"); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(600)
        st = json.loads(await pg.evaluate("JSON.stringify({g:ctDebug.S.session.guest,pend:!!(ctDebug.S.cust.desk||{}).prefs_pending,n:ctDebug.S.deck.length,ask:!document.getElementById('askSheet').hidden})"))
        ok(st['g'] and st['pend'] and st['n'] >= 45, f'one tap: guest deck of {st["n"]} cars, no questions, prefs pending')
        ok(await vis(pg, '#freeBar') and '0 / 15' in await pg.inner_text('#freeN'), 'learning bar shows 0 / 15')
        await pg.wait_for_timeout(1700)
        ok(not await vis(pg, '[data-revvy-row]'), 'learning bar takes the place of the Chat to Revvy row')
        await shot(pg, '02-free-deck')
        await swipes(pg, 14, 'swipes 1 to 14')
        ok('14 / 15' in await pg.inner_text('#freeN'), 'learning bar at 14 / 15')
        ok(await count(pg) == 14, '14 swipes saved on the phone')
        await shot(pg, '03-free-deck-14')
        await swipe(pg, True); await pg.wait_for_selector('#revvyPrompt:not([hidden])', timeout=4000)
        await pg.wait_for_timeout(380); await shot(pg, '04-revvy-entrance-mid')
        await pg.wait_for_timeout(1500); await shot(pg, '05-revvy-entrance-settled')
        ok('got taste' in await pg.inner_text('#rvpTitle') and 'actually love' in await pg.inner_text('#rvpP'), 'Revvy: You\u2019ve got taste, cars you\u2019ll actually love')
        ok('15 cars swiped' in (await pg.inner_text('#rvpK')).lower(), 'Revvy counts 15 cars swiped')
        ok(await vis(pg, '#rvpLater') and 'Maybe later' in await pg.inner_text('#rvpLater'), 'Maybe later, keep swiping is shown')
        ok(await pg.evaluate("ctDebug.S.deck.length") > 0, 'deck still there behind Revvy')
        n0 = await count(pg); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(400)
        ok(await count(pg) == n0, 'no swiping behind the prompt')
        f = await free(pg); ok(f['shown'] == 1 and f['nextAt'] == 30, f'state: shown once, next ask at 30 {f}')
        await pg.click('#rvpLater'); await pg.wait_for_timeout(250)
        ok(not await vis(pg, '#revvyPrompt'), 'Maybe later closes Revvy'); await shot(pg, '06-after-maybe-later')
        f = await free(pg); ok(f['skips'] == 1 and f['nextAt'] == 30, f'skip saved {f}')
        ok(not await vis(pg, '#freeBar'), 'learning bar gone once Revvy has asked')
        await pg.wait_for_timeout(1700); ok(await vis(pg, '[data-revvy-row]'), 'Chat to Revvy row back after the prompt')
        # reload: a returning guest carries on swiping, no prompt
        await pg.reload(); await pg.wait_for_function("location.hash=='#discover' && ctDebug.S.session && ctDebug.S.session.guest"); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(400)
        ok(await count(pg) == 15 and not await vis(pg, '#revvyPrompt'), 'reload: returning guest back on the deck with 15 swipes, no prompt')
        await swipes(pg, 14, 'swipes 16 to 29')
        await swipe(pg, False); await pg.wait_for_selector('#revvyPrompt:not([hidden])', timeout=4000); await pg.wait_for_timeout(1500)
        ok('Still swiping' in await pg.inner_text('#rvpTitle') and 'ask again' in await pg.inner_text('#rvpP'), 'second ask at 30, says it is the last')
        await shot(pg, '07-revvy-second-ask')
        await pg.click('#rvpLater'); await pg.wait_for_timeout(250)
        await swipes(pg, 25, 'swipes 31 to 55, after the last skip')
        f = await free(pg); ok(f['shown'] == 2 and f['skips'] == 2, f'never a third prompt {f}')
        await pg.goto(BASE + '#me'); await pg.wait_for_selector('[data-screen=guestme]:not([hidden])'); await pg.wait_for_timeout(900)
        ok(await vis(pg, '[data-free-ask]'), 'Me offers Tell Revvy what you like'); await shot(pg, '08-guest-me')
        await pg.click('[data-free-ask]'); await pg.wait_for_selector('[data-screen=start]:not([hidden]) [data-step="1"]:not([hidden])')
        ok(True, 'Tell Revvy what you like opens question 1')
        ok(not out['ext'], f'A: nothing sent out {out["ext"][:2]}'); ok(not errs, f'A: no page errors {errs[:2]}')
        await ctx.close()

        print('== B: Revvy, the three questions with hints, then the save step, then carried into a new account')
        ctx, pg, errs, out = await new(b)
        await start_free(pg)
        await swipes(pg, 14, 'B swipes 1 to 14', like_every=2)
        await swipe(pg, True); await pg.wait_for_selector('#revvyPrompt:not([hidden])', timeout=4000); await pg.wait_for_timeout(1300)
        await pg.click('#rvpGo'); await pg.wait_for_selector('[data-screen=start]:not([hidden]) [data-step="1"]:not([hidden])')
        await pg.wait_for_timeout(300)
        say = await pg.inner_text('#wizSay'); ok('You liked' in say, f'question 1: Revvy knows how many they liked: {say}')
        await shot(pg, '09-revvy-question-1')
        await pg.fill('#startForm [name=monthly_gbp]', '650'); await pg.click('[data-step="1"] [data-wiz-go="2"]'); await pg.wait_for_timeout(200)
        await shot(pg, '10-revvy-question-2-pencilled')
        await pg.click('[data-step="2"] [data-wiz-go="3"]'); await pg.click('#wizDone')
        await pg.wait_for_function("location.hash=='#discover'"); await pg.wait_for_selector('#askSheet:not([hidden])', timeout=5000); await pg.wait_for_timeout(300)
        st = json.loads(await pg.evaluate("JSON.stringify({pend:!!(ctDebug.S.cust.desk||{}).prefs_pending,mo:ctDebug.S.cust.monthly_gbp,n:Object.keys(ctDebug.S.swipes).length,f:ctDebug.free()})"))
        ok(not st['pend'] and st['mo'] == 650 and st['n'] == 15 and st['f']['done'], f'answers saved, 15 swipes kept, free flow done {st}')
        ok('Your deck is tuned' in await pg.inner_text('#askTitle'), 'then the save step: Your deck is tuned, keep your picks')
        await shot(pg, '11-save-step')
        await pg.click('#askForm [data-ask-x]'); await pg.wait_for_timeout(200)
        ok(not await vis(pg, '#askSheet'), 'Not now closes the save step')
        await swipes(pg, 20, 'B 20 swipes after answering and Not now (no Revvy, no second contact ask this visit)', like_every=2)
        g = json.loads(await pg.evaluate("localStorage.getItem('sd_guest_v1')"))['swipes']
        gl = [r for r in g if g[r]['liked']]; gp = [r for r in g if not g[r]['liked']]
        await pg.goto(BASE + '#signin'); await pg.wait_for_selector('#siEmail')
        await pg.fill('#siEmail', 'new.guest@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=customer]')
        await pg.wait_for_function("ctDebug.S.session && !ctDebug.S.session.guest && ctDebug.S.cust", timeout=15000); await pg.wait_for_timeout(1500)
        a = json.loads(await pg.evaluate("JSON.stringify({sw:ctDebug.S.swipes,c:ctDebug.S.cust,g:localStorage.getItem('sd_guest_v1')})"))
        ok(all(a['sw'].get(r, {}).get('liked') is True for r in gl) and all(a['sw'].get(r, {}).get('liked') is False for r in gp), f'{len(gl)} likes and {len(gp)} passes carried into the new account')
        ok(a['c'].get('monthly_gbp') == 650 and a['c'].get('budget_type') == 'monthly', 'answers carried into the new account')
        ok(not (a['c'].get('desk') or {}).get('prefs_pending') and a['g'] is None, 'no pending flag saved, guest storage cleared')
        ok(not out['ext'], f'B: nothing sent out {out["ext"][:2]}'); ok(not errs, f'B: no page errors {errs[:2]}')
        await ctx.close()

        print('== C: a free guest signs in to an existing account: saved choices and swipes untouched')
        ctx, pg, errs, out = await new(b)
        await start_free(pg)
        await swipes(pg, 6, 'C 6 free swipes', like_every=2)
        g = json.loads(await pg.evaluate("localStorage.getItem('sd_guest_v1')"))['swipes']
        passed = [r for r in g if not g[r]['liked']][0]
        seed = {'customers': [{'id': 'cust-1', 'user_id': 'demo-customer', 'owner_staff_id': None, 'name': 'Sam Existing', 'email': 'you@demo.local', 'budget_type': 'cash', 'cash_gbp': 30000, 'monthly_gbp': None,
                 'body': 'saloon', 'body_must': True, 'fuel': 'diesel', 'fuel_must': ['diesel'], 'new_used': 'used', 'desk': {'lead_source': 'find-my-bmw', 'note': 'keep me'}, 'updated_at': '2026-11-01T10:00:00Z'}],
                'swipes': {'cust-1': {passed: {'liked': True, 'at': 1}, 'OLD123': {'liked': False, 'at': 2}}}}
        await pg.evaluate(f"localStorage.setItem('ctDemoV1', {json.dumps(json.dumps(seed))})")
        await pg.goto(BASE + '#signin'); await pg.wait_for_selector('#siEmail')
        await pg.fill('#siEmail', 'you@demo.local'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=customer]')
        await pg.wait_for_function("ctDebug.S.session && !ctDebug.S.session.guest && ctDebug.S.cust", timeout=15000); await pg.wait_for_timeout(1500)
        a = json.loads(await pg.evaluate("JSON.stringify({sw:ctDebug.S.swipes,c:ctDebug.S.cust})")); c = a['c']
        ok(c['name'] == 'Sam Existing' and c['budget_type'] == 'cash' and c['cash_gbp'] == 30000 and c['body'] == 'saloon' and c['fuel'] == 'diesel' and c['new_used'] == 'used', 'existing saved choices untouched')
        ok((c.get('desk') or {}).get('note') == 'keep me' and (c.get('desk') or {}).get('lead_source') == 'find-my-bmw' and 'prefs_pending' not in (c.get('desk') or {}), 'existing desk notes and lead source untouched')
        ok(a['sw'][passed]['liked'] is True and a['sw']['OLD123']['liked'] is False, 'existing swipes win over the guest swipe of the same car')
        ok(all(r in a['sw'] for r in g), 'the other guest swipes are added')
        ok(not out['ext'], f'C: nothing sent out {out["ext"][:2]}'); ok(not errs, f'C: no page errors {errs[:2]}')
        await ctx.close()

        print('== D: an older guest who answered the three questions never sees the free flow')
        ctx, pg, errs, out = await new(b)
        await pg.goto(BASE); await pg.wait_for_selector('[data-screen=start]:not([hidden])')
        await pg.evaluate("localStorage.setItem('sd_guest_v1', JSON.stringify({cust:{id:'guest',budget_type:'monthly',monthly_gbp:500,body:'suv',fuel:'open',new_used:'both',desk:{lead_source:'swipetodrive-guest'}},swipes:{}}))")
        await pg.goto(BASE + '#discover'); await pg.reload(); await pg.wait_for_selector('#deck .ct-card'); await pg.wait_for_timeout(400)
        ok(not await vis(pg, '#freeBar'), 'older guest: no learning bar')
        await swipes(pg, 16, 'older guest 16 passes', like_every=0)
        await pg.click('#btnLike'); await pg.wait_for_timeout(900)
        if await vis(pg, '#matchModal'): await pg.click('#mmSave'); await pg.wait_for_timeout(300)
        ok(await vis(pg, '#askSheet') and not await vis(pg, '#revvyPrompt'), 'older guest: first like still gets the beta contact ask, never Revvy')
        ok(not errs, f'D: no page errors {errs[:2]}')
        await ctx.close()

        print('== E: reduced motion still shows Revvy and the skip')
        ctx, pg, errs, out = await new(b, size=dict(PHONE, reduced_motion='reduce'))
        await start_free(pg); await swipes(pg, 14, 'E swipes 1 to 14')
        await swipe(pg, False); await pg.wait_for_selector('#revvyPrompt:not([hidden])', timeout=4000); await pg.wait_for_timeout(500)
        ok(await vis(pg, '#rvpLater') and await vis(pg, '#rvpGo'), 'reduced motion: prompt and both buttons visible')
        await shot(pg, '12-revvy-reduced-motion')
        ok(not errs, f'E: no page errors {errs[:2]}')
        await ctx.close()
        await b.close()
    bad = [m for c, m in res if not c]; print(f'\n{len(res) - len(bad)}/{len(res)} passed'); [print('FAILED:', m) for m in bad]
    sys.exit(1 if bad else 0)
asyncio.run(main())
