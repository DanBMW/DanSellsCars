"""Referrals tab and Referred by badge in demo mode, fake data only. Usage: python3 tests/referrals_e2e.py BASE [SHOTS]"""
import asyncio, sys, json
from playwright.async_api import async_playwright
BASE = sys.argv[1]; OUT = sys.argv[2] if len(sys.argv) > 2 else None
DEMO = "window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
res = []
def ok(c, m): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + m)
SEED = """(function(){var d=JSON.parse(localStorage.getItem('ctDemoV1')||'{}');var now=Date.now();
d.customers=(d.customers||[]).concat([
 {id:'c-ref1',name:'Sam Example',phone:'07700900111',owner_staff_id:null,models:['X3'],desk:{lead_source:'referral',referrals_made:[{referral_id:'r1',first_name:'Alex'}]},created_at:new Date(now-864e5).toISOString()},
 {id:'c-fr1',name:'Alex Example',phone:'07700900222',owner_staff_id:null,models:[],desk:{lead_source:'referral',referred_by:{referral_id:'r1',first_name:'Sam'},enquiry:{source:'referral',at:new Date(now-864e5).toISOString(),first_name:'Alex',actioned_at:null}},created_at:new Date(now-864e5).toISOString()},
 {id:'c-fr2',name:'Jo Example',owner_staff_id:null,models:[],desk:{referred_by:{referral_id:'r2',first_name:'Chris'}},created_at:new Date(now-5*864e5).toISOString()}]);
d.referrals=[{id:'r1',created_at:new Date(now-864e5).toISOString(),referrer_customer_id:'c-ref1',referred_customer_id:'c-fr1',referrer_first_name:'Sam',referred_first_name:'Alex',reward_choice:'credit',reward_label:'\\u00a3250 BMW Credit',status:'new'},
 {id:'r2',created_at:new Date(now-5*864e5).toISOString(),referred_customer_id:'c-fr2',referrer_first_name:'Chris',referred_first_name:'Jo',reward_choice:'cash',reward_label:'\\u00a3125 Cash',status:'sold',paid_out_at:new Date(now-2*864e5).toISOString(),paid_out_by_name:'Dan'}];
localStorage.setItem('ctDemoV1',JSON.stringify(d));})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');")
        await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_selector('#siEmail'); await pg.fill('#siEmail', 'dan@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=admin]')
        await pg.wait_for_timeout(1200); await pg.evaluate(SEED); await pg.evaluate("location.hash='#me'"); await pg.wait_for_timeout(500); await pg.evaluate("location.hash='#team'"); await pg.wait_for_timeout(1200)
        ok(await pg.is_visible('#refTab'), 'admin sees the Referrals tab')
        card = pg.locator('.ct-c[data-cid="c-fr1"]'); ok('referred by sam' in (await card.inner_text()).lower(), 'badge on the referred card')
        await card.scroll_into_view_if_needed();
        if OUT: await card.screenshot(path=f'{OUT}/referrals-badge-card.png')
        await pg.click('#refTab'); await pg.wait_for_selector('.rf-r'); ok(await pg.locator('.rf-r').count() == 2, 'two referrals listed')
        t = (await pg.locator('#custList').inner_text()).lower(); ok('£250 bmw credit' in t and 'paid' in t and '£125 cash' in t, 'reward and paid stamp shown')
        await pg.locator('#custTabs').scroll_into_view_if_needed()
        if OUT: await pg.screenshot(path=f'{OUT}/referrals-tab.png')
        await pg.locator('.rf-r[data-rid=r1] [data-rpaid]').check(); await pg.wait_for_timeout(700)
        r1 = await pg.evaluate("JSON.parse(localStorage.getItem('ctDemoV1')).referrals[0]"); ok(bool(r1.get('paid_out_at')) and r1.get('paid_out_by_name') == 'Dan', 'tick stamps time and who')
        if OUT: await pg.locator('#custTabs').scroll_into_view_if_needed(); await pg.screenshot(path=f'{OUT}/referrals-tab-ticked.png')
        await pg.locator('.rf-r[data-rid=r1] [data-rpaid]').uncheck(); await pg.wait_for_timeout(700)
        ok(not await pg.evaluate("JSON.parse(localStorage.getItem('ctDemoV1')).referrals[0].paid_out_at"), 'untick clears it')
        await pg.select_option('.rf-r[data-rid=r1] [data-rst]', 'contacted'); await pg.wait_for_timeout(600)
        ok(await pg.evaluate("JSON.parse(localStorage.getItem('ctDemoV1')).referrals[0].status") == 'contacted', 'status saved')
        await pg.click('#custTabs [data-tab=open]'); await pg.wait_for_timeout(900)
        await pg.locator('.ct-c[data-cid="c-fr1"] [data-act=edit]').click(); await pg.wait_for_timeout(900)
        ok('referred by sam' in (await pg.inner_text('#pfRef')).lower(), 'badge on the profile page')
        if OUT: await pg.screenshot(path=f'{OUT}/referrals-badge-profile.png')
        ok(not errs, 'no page errors ' + str(errs)); await b.close()
    print(f'RESULT referrals {sum(res)}/{len(res)}'); sys.exit(0 if all(res) else 1)
asyncio.run(main())
