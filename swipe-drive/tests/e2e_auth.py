"""Swipe Drive sign in: email and password in the app and at the end of the Revvy chat, saving chat answers.
Usage: python3 e2e_auth.py BASE_URL ACCOUNT_JSON [SHOTS_DIR]
ACCOUNT_JSON holds {"email","password"} for a confirmed test customer (never printed). Talks to the real
Supabase project for sign in and the save; sign up and forgot password are stubbed so no email is sent."""
import asyncio, sys, os, json, re
from playwright.async_api import async_playwright
BASE = sys.argv[1]; ACC = json.load(open(sys.argv[2])); SHOTS = sys.argv[3] if len(sys.argv) > 3 else None
PHONE = dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
res = []
def ok(c, m): res.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m)
def shot(pg, n): return pg.screenshot(path=os.path.join(SHOTS, n)) if SHOTS else asyncio.sleep(0)

async def chat_to_end(pg):
    async def idle(): await pg.wait_for_function('!document.querySelector(".typing")&&(document.querySelector("#tray").children.length>0||!document.getElementById("form").hidden)', timeout=20000); await asyncio.sleep(0.05)
    async def typ(s): await idle(); await pg.fill('#inp', s); await pg.press('#inp', 'Enter'); await asyncio.sleep(0.1); await idle()
    async def tap(t, sel='#tray button'): await idle(); await pg.locator(sel, has_text=t).first.click(); await asyncio.sleep(0.1); await idle()
    await pg.goto(BASE + 'chat/index.html?fast'); await idle()
    await typ('Sam Test'); await typ('x3'); await tap('Space for family'); await tap('Done')
    await typ('no car'); await shot(pg, 'chat-no-car-path.png')
    await tap('6k to 10k'); await tap('Monthly finance'); await tap("That's me"); await tap("That's me"); await typ('£1,000')
    await pg.locator('#tray .swatch', has_text='Black Sapphire').click(); await pg.locator('#tray .swatch', has_text='Brooklyn Grey').click(); await tap('Done', '#tray button.go')
    await pg.locator('#tray .ktile').nth(0).click(); await pg.locator('#tray .ktile').nth(1).click(); await pg.locator('#tray .ktile').nth(1).click(); await tap('Done', '#tray button.kdone')
    await typ('next month'); await typ('07700 900123')
    return idle

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        # ---------- end of chat: offer, sign in with password, save ----------
        ctx = await b.new_context(**PHONE); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        idle = await chat_to_end(pg)
        ok(await pg.evaluate('SDChat.cur()') == 'end', 'chat reached the end')
        await shot(pg, 'chat-end-login-offer.png')
        await pg.locator('#tray .chip', has_text='Save my answers').click(); await pg.wait_for_selector('#authbox input[name=au_email]', timeout=20000)
        await pg.wait_for_timeout(300); await shot(pg, 'chat-end-signin-box.png')
        await pg.fill('#authbox input[name=au_email]', ACC['email']); await pg.fill('#authbox input[name=au_password]', 'wrong-password-123')
        await pg.click('#authbox .au-go'); await pg.wait_for_function("/match/.test(document.querySelector('#authbox .au-msg').textContent)", timeout=20000)
        ok(True, 'wrong password shows a plain message: ' + await pg.text_content('#authbox .au-msg'))
        await pg.fill('#authbox input[name=au_password]', ACC['password']); await pg.click('#authbox .au-go')
        await pg.wait_for_function("[...document.querySelectorAll('.msg.bot')].some(m=>/Saved to your profile/.test(m.textContent))", timeout=30000)
        ok(True, 'password sign in at the end of the chat saved the answers'); await pg.wait_for_timeout(400); await shot(pg, 'chat-end-saved.png')
        ok(await pg.locator('#tray a.cta').is_visible(), 'WhatsApp button still there after saving')
        # read the saved row back as the signed in customer (RLS)
        row = await pg.evaluate("""async()=>{const m=await import('https://esm.sh/@supabase/supabase-js@2');const sb=m.createClient(CT_CONFIG.SUPABASE_URL,CT_CONFIG.SUPABASE_ANON_KEY);
          const r=await sb.from('customers').select('name,phone,models,annual_mileage,budget_type,monthly_gbp,deposit_gbp,desk').maybeSingle();return r.data}""")
        ok(row and row['name'] == 'Sam Test' and row['phone'] == '07700900123' and row['models'] == ['X3'] and row['annual_mileage'] == 8000 and row['budget_type'] == 'monthly', f"customers row typed fields {dict((k, row[k]) for k in ('name','models','annual_mileage','budget_type','monthly_gbp','deposit_gbp')) if row else None}")
        ch = (row or {}).get('desk', {}).get('chat', {})
        ok(ch.get('no_current_car') is True and 'curMonthly' not in ch.get('answers', {}) and ch['answers'].get('colour') == 'Black Sapphire, Brooklyn Grey', 'desk.chat holds the answers, no current monthly for no car, both colours')
        ok(not errs, f'chat no page errors {errs[:2]}'); await ctx.close()
        # ---------- app sign in screen ----------
        ctx = await b.new_context(**PHONE); await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1')")
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_selector('#pwMount input[name=au_email]', timeout=20000)
        ok(await pg.locator('#pwMount .au-g').count() == 0, 'Google button hidden while GOOGLE_LOGIN_ENABLED is false')
        await pg.locator('#pwBox').scroll_into_view_if_needed(); await shot(pg, 'app-signin-password.png')
        # forgot password and sign up, stubbed so nothing is emailed
        await ctx.route('**/auth/v1/recover*', lambda r: r.fulfill(status=200, body='{}', content_type='application/json'))
        await ctx.route('**/auth/v1/signup*', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'id': '00000000-0000-4000-8000-000000000001', 'email': 'new@example.com', 'identities': [{'id': 'x'}], 'aud': 'authenticated', 'role': 'authenticated'})))
        await pg.click('#pwMount .au-link'); await pg.fill('#pwMount input[name=au_email]', 'new@example.com'); await pg.click('#pwMount .au-go')
        await pg.wait_for_function("/reset link/.test(document.querySelector('#pwMount .au-msg').textContent)", timeout=10000); ok(True, 'forgot password sends a reset link')
        await pg.click('#pwMount .au-link'); await pg.click('#pwMount [data-au=up]'); await pg.fill('#pwMount input[name=au_email]', 'new@example.com'); await pg.fill('#pwMount input[name=au_password]', 'short')
        await pg.click('#pwMount .au-go'); ok('8 characters' in await pg.text_content('#pwMount .au-msg'), 'short password refused')
        await pg.fill('#pwMount input[name=au_password]', 'a-long-enough-pass'); await pg.click('#pwMount .au-go')
        await pg.wait_for_function("/confirm your address/.test(document.querySelector('#pwMount .au-msg').textContent)", timeout=10000); ok(True, 'sign up says to confirm the email (confirmation is on)')
        await shot(pg, 'app-signup-confirm.png')
        await ctx.unroute('**/auth/v1/signup*')
        await pg.click('#pwMount [data-au=in]'); await pg.fill('#pwMount input[name=au_email]', ACC['email']); await pg.fill('#pwMount input[name=au_password]', ACC['password']); await pg.click('#pwMount .au-go')
        await pg.wait_for_function("location.hash=='#discover'||location.hash=='#profile'", timeout=30000)
        ok(True, 'password sign in in the app lands on ' + await pg.evaluate('location.hash')); await pg.wait_for_timeout(1200); await shot(pg, 'app-signed-in.png')
        nm = await pg.evaluate("(window.ctDebug&&ctDebug.S.cust||{}).name"); ok(nm == 'Sam Test', f'app shows the profile the chat saved ({nm})')
        ok(not errs, f'app no page errors {errs[:2]}'); await ctx.close()
        # ---------- Google button with the flag on (config swapped in the browser only) ----------
        ctx = await b.new_context(**PHONE); await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1')")
        async def flag(route):
            r = await route.fetch(); body = (await r.text()).replace('GOOGLE_LOGIN_ENABLED: false', 'GOOGLE_LOGIN_ENABLED: true'); await route.fulfill(response=r, body=body)
        await ctx.route('**/swipe-drive/config.js*', flag); pg = await ctx.new_page(); await pg.goto(BASE); await pg.wait_for_selector('#pwMount .au-g', timeout=20000)
        ok(True, 'Google button shows when the flag is on'); await pg.locator('#pwBox').scroll_into_view_if_needed(); await shot(pg, 'app-signin-google-flag-on.png'); await ctx.close()
        await b.close()
    n = sum(1 for c, _ in res if c); print(f'\nRESULT auth {n}/{len(res)} passed'); sys.exit(0 if n == len(res) else 1)
asyncio.run(main())
