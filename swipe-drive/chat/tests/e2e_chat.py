"""Swipe Drive chat and quick lane end to end suite (headless Chrome, phone size).
Usage: python3 e2e_chat.py BASE_URL [N] [--slow]
BASE_URL is the folder holding index.html and quick.html, e.g. https://dan-sells.co.uk/swipe-drive/chat/ or file:///path/to/chat/
Needs: pip install playwright, and Google Chrome installed (channel='chrome')."""
import asyncio, sys, random, re, json, urllib.parse
from playwright.async_api import async_playwright

BASE = sys.argv[1]; N = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 54; SLOW = '--slow' in sys.argv
ONLY = [int(x[6:]) for x in sys.argv if x.startswith('--only')] 
IGNORE = ["Content Security Policy directive 'upgrade-insecure-requests'"]
DEVICES = {
 'iphone': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
   user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'),
 'android': dict(viewport={'width': 412, 'height': 915}, device_scale_factor=2.6, is_mobile=True, has_touch=True,
   user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'),
 'small': dict(viewport={'width': 360, 'height': 640}, device_scale_factor=2, is_mobile=True, has_touch=True)}

NAMES = [("Sam", "Sam"), ("sarah", "Sarah"), ("i'm Tom", "Tom"), ("call me Jo", "Jo"), ("my name is Priya", "Priya"), ("Mohammed", "Mohammed"), ("dave", "Dave"), ("Anne Marie", "Anne Marie"), ("it's Chris", "Chris"), ("O'Neill", "O'Neill")]
BAD_NAMES = ["asdfghjkl", "12345", "😊😊", "!!!", "my name is not important to you at all really"]
MODELS = [("1 series", "1 Series"), ("x5", "X5"), ("BMW X1", "X1"), ("3er", "3 Series"), ("320d", "3 Series"), ("m340i", "3 Series"), ("i4", "i4"), ("ix", "iX"), ("iX1", "iX1"),
 ("x5 m50", "X5"), ("m3", "M3"), ("one series", "1 Series"), ("2 series active tourer", "2 Series Active Tourer"), ("4 series gran coupe", "4 Series Gran Coupe"), ("3 series touring", "3 Series Touring"),
 ("z4", "Z4"), ("i think the x3", "X3"), ("x3 🔥", "X3"), ("7 series", "7 Series"), ("i7", "i7"), ("XM", "XM"), ("not sure", "Not sure yet"), ("118i", "1 Series"), ("x7", "X7"), ("5 series", "5 Series"), ("m5", "M5")]
BAD_MODELS = ["audi a4", "banana", "qwertyuiop", "6 series"]
CURS = [("2019 Audi A3 diesel", "2019 Audi A3 diesel"), ("ford focus 2016", "ford focus 2016"), ("vw golf", "vw golf"), ("my old 320d 2015", "my old 320d 2015"), ("Tesla model 3", "Tesla model 3"), ("2018 BMW X1 petrol", "2018 BMW X1 petrol"), ("Kia Sportage hybrid", "Kia Sportage hybrid")]
SMALL = ["hello", "lol", "are you real?", "how much is an x5?", "thanks", "who are you", "can I speak to Dan", "just show me the cars", "tell me a joke"]
MONEY_GOOD = [("about 8k", "8,000"), ("£12,500", "12,500"), ("eight grand", "8,000"), ("6000", "6,000")]
MONTHLY = [("£350", "350"), ("three hundred", "300"), ("420 a month", "420"), ("about 275", "275")]
DEP = [("2k", "2,000"), ("two thousand", "2,000"), ("£500", "500"), ("none", "Deposit: None")]
MILES = [("45k", "45,000"), ("forty five thousand", "45,000"), ("about 30,000", "30,000"), ("112000", "112,000")]
ANNUAL_T = [("12000", "12,000"), ("about 10k", "10,000"), ("200 a week", "10,400"), ("eight thousand", "8,000")]
WHEN_T = ["next month", "in 2 weeks", "march", "asap", "after christmas", "few months"]
PHONES = [("07700 900123", "07700900123"), ("+44 7700 900123", "07700900123"), ("07700900456", "07700900456")]
LONG = "I have been thinking about this for ages and honestly " * 12

class Fail(Exception): pass

async def run_one(b, n, rng):
    dev = rng.choice(list(DEVICES)); ctx = await b.new_context(**DEVICES[dev]); pg = await ctx.new_page(); errs = []
    pg.on('console', lambda m: m.type == 'error' and not any(x in m.text for x in IGNORE) and errs.append(m.text))
    pg.on('pageerror', lambda e: errs.append(str(e)))
    if SLOW and n % 5 == 0:
        cdp = await ctx.new_cdp_session(pg); await cdp.send('Network.enable')
        await cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 400, 'downloadThroughput': 50000, 'uploadThroughput': 20000})
    exp = {}; log = []
    async def bots():
        return await pg.evaluate('[...document.querySelectorAll(".msg.bot:not(.typing)")].map(e=>e.textContent)')
    async def idle():
        await pg.wait_for_function('!document.querySelector(".typing")&&(document.querySelector("#tray").children.length>0||!document.getElementById("form").hidden)', timeout=20000)
        await asyncio.sleep(0.05)
    async def cur():
        return await pg.evaluate('window.SDChat&&SDChat.cur()')
    async def check_msgs(ctxt):
        m = await bots()
        for k, t in enumerate(m):
            if re.search(r'undefined|NaN|\bnull\b|\{nm\}|\{name\}', t): raise Fail(f'bad text "{t}" after {ctxt}')
            if k and t == m[k - 1] and 'learn a little' not in t: raise Fail(f'doubled line "{t}" after {ctxt}')
            if k and 'meet you' in t.lower() and 'meet you' in m[k - 1].lower(): raise Fail(f'double greeting after {ctxt}')
        if exp.get('name') and exp['name'] != 'skip':
            for t in m:
                g = re.search(r'Nice to meet you, ([^!]+)!', t)
                if g and g.group(1) != exp['name']: raise Fail(f'wrong name {g.group(1)} vs {exp["name"]}')
        return m
    async def typ(t, ctxt):
        await idle(); await pg.fill('#inp', t); await pg.press('#inp', 'Enter'); await asyncio.sleep(0.1); await idle(); log.append('> ' + t[:40]); return await check_msgs(ctxt + ':' + t[:30])
    async def tap(t, ctxt):
        await idle(); await pg.locator('#tray button, #tray a.chip', has_text=re.compile('^' + re.escape(t) + '$')).first.click(); await asyncio.sleep(0.1); await idle(); log.append('[' + t + ']'); return await check_msgs(ctxt + ':' + t)
    async def form_on():
        await idle(); return await pg.evaluate('!document.getElementById("form").hidden')
    async def maybe_small(q):
        if rng.random() < 0.18 and await form_on():
            s = rng.choice(SMALL); before = await cur(); await typ(s, 'small ' + q)
            if await cur() != before: raise Fail(f'smalltalk "{s}" moved the flow on at {q}')
            if 'how much' in s:
                last = (await bots())[-2]
                if re.search(r'£\s?\d', last): raise Fail('bot quoted a price')
    async def maybe_bad(q, pool):
        if rng.random() < 0.25 and await form_on():
            s = rng.choice(pool); before = await cur(); await typ(s, 'bad ' + q)
            if await cur() != before: raise Fail(f'bad answer "{s}" accepted at {q}')
    async def slider(v):
        await idle(); mn = int(await pg.get_attribute('#tray input[type=range]', 'min')); mx = int(await pg.get_attribute('#tray input[type=range]', 'max'))
        v = max(mn, min(mx, v)); await pg.evaluate(f'(()=>{{const r=document.querySelector("#tray input[type=range]");r.value={v};r.dispatchEvent(new Event("input"))}})()')
        val = await pg.text_content('.sval'); await tap("That's me", 'slider'); return mn, mx, int(re.sub(r'[^0-9]', '', val))
    async def drag(dx, dy):
        c = pg.locator('.dcard'); await c.scroll_into_view_if_needed(); bb = await c.bounding_box(); x = bb['x'] + bb['width'] / 2; y = bb['y'] + bb['height'] / 2
        await pg.mouse.move(x, y); await pg.mouse.down()
        for s in range(1, 9): await pg.mouse.move(x + dx * s / 8, y + dy * s / 8)
        await pg.mouse.up(); await asyncio.sleep(0.85)
    await pg.goto(BASE + 'index.html?fast'); await idle()
    first = (await bots())[0]
    if 'learn a little about you and your requirements before I can show you what is available' not in first: raise Fail('welcome line missing')
    reloaded = False; steps = 0
    while True:
        q = await cur(); steps += 1
        if steps > 80: raise Fail('flow stuck at ' + str(q))
        if q == 'end': break
        if not reloaded and rng.random() < 0.06:
            await pg.reload(); await idle(); reloaded = True
            if await cur() != q: raise Fail(f'resume went to {await cur()} not {q}')
            if q != 'name' and 'Welcome back' not in ''.join(await bots()): raise Fail('no welcome back after reload')
            continue
        await maybe_small(q)
        if q == 'name':
            await maybe_bad(q, BAD_NAMES)
            if rng.random() < 0.15: await tap('Skip', q); exp['name'] = 'skip'
            else:
                i, e = rng.choice(NAMES); await typ(i, q); exp['name'] = e
            m = await bots(); greet = [t for t in m if 'meet you' in t.lower()]
            if len(greet) != 1: raise Fail(f'expected one greeting, got {greet}')
        elif q == 'model':
            await maybe_bad(q, BAD_MODELS)
            if rng.random() < 0.2: c = rng.choice(['X1', '3 Series', 'X3', 'i4', 'Not sure yet']); await tap(c, q); e = c
            else: i, e = rng.choice(MODELS); await typ(i, q)
            exp['model'] = e; m = await bots(); r = m[-2]
            named = re.findall(r'\b(\d Series(?: \w+)*?|X\d(?: M)?|i[X\d]\d?|M\d|Z4|XM)\b', r)
            if e != 'Not sure yet' and named and not any(e.startswith(x) or x.startswith(e.split(' ')[0]) for x in named): raise Fail(f'model reply "{r}" for {e}')
        elif q == 'why':
            for c in rng.sample(['Comfort', 'Space for family', 'Low running costs', 'Performance', 'Tech', 'Electric', 'Looks', 'Reliability'], rng.randint(0, 3)):
                await pg.locator('#tray button', has_text=c).first.click()
            await tap('Done', q)
        elif q == 'cur':
            await maybe_bad(q, ['banana', 'hmm', LONG[:300]])
            r = rng.random()
            if r < 0.25: await tap('No current car', q); exp['cur'] = 'No current car'
            else: i, e = rng.choice(CURS); await typ(i, q); exp['cur'] = e
        elif q == 'reg':
            await maybe_bad(q, ['hello there mate', '???'])
            if rng.random() < 0.4: await tap('Skip', q)
            else: await typ(rng.choice(['AB19 CDE', 'ab19cde', 'LK66 XYZ']), q)
        elif q == 'miles':
            await maybe_bad(q, ['loads', 'banana'])
            if rng.random() < 0.3: await tap(rng.choice(['Under 20k', '20k to 50k', 'Over 80k', 'Not sure']), q)
            else: i, e = rng.choice(MILES); await typ(i, q); exp['miles'] = e
        elif q == 'cond':
            rows = pg.locator('.rrow')
            for k in range(await rows.count()):
                if rng.random() < 0.85: await rows.nth(k).locator('button', has_text=rng.choice(['Rough', 'OK', 'Good', 'Mint'])).click()
            await tap('Done', q)
        elif q == 'settle':
            await maybe_bad(q, ['loads', 'banana'])
            if rng.random() < 0.3: await tap(rng.choice(['Paid off', 'Not sure']), q)
            else: i, e = rng.choice(MONEY_GOOD); await typ(i, q); exp['settle'] = e
        elif q == 'curMonthly':
            if rng.random() < 0.3: await tap(rng.choice(['None', 'Not sure']), q)
            else: i, e = rng.choice(MONTHLY); await typ(i, q); exp['curMonthly'] = e
        elif q == 'annual':
            if rng.random() < 0.5: await tap(rng.choice(['Under 6k', '6k to 10k', '10k to 15k', 'Over 15k']), q)
            else: i, e = rng.choice(ANNUAL_T); await typ(i, q); exp['annual'] = e
        elif q == 'pay':
            await maybe_bad(q, ['banana', 'whatever is cheapest?'])
            r = rng.random()
            if r < 0.6: c = rng.choice(['Monthly finance', 'Lease', 'Cash', 'Not sure yet']); await tap(c, q)
            else: i, c = rng.choice([('pcp', 'Monthly finance'), ('lease', 'Lease'), ('buy it outright', 'Cash'), ('cash', 'Cash'), ('dunno', 'Not sure yet')]); await typ(i, q)
            exp['pay'] = c; got = (await pg.evaluate('SDChat.answers().pay'))
            if got != c: raise Fail(f'pay {got} vs {c}; log {log[-6:]}; bots {(await bots())[-4:]}')
        elif q in ('budget', 'cash'):
            mn, mx, v = await slider(rng.choice([0, 10**7, rng.randint(200, 900) if q == 'budget' else rng.randint(8000, 60000)]))
            exp['base'] = v; exp['basekind'] = q
        elif q in ('stretch', 'stretchCash'):
            mn, mx, v = await slider(rng.choice([0, exp['base'], exp['base'] + rng.randint(1, 20) * (25 if q == 'stretch' else 1000), 10**7]))
            if mn != exp['base']: raise Fail(f'stretch min {mn} != base {exp["base"]}')
            if v < exp['base']: raise Fail('stretch below base')
            exp['stretch'] = v
        elif q == 'dep':
            if rng.random() < 0.3: await tap(rng.choice(['None', 'Not sure']), q)
            else: i, e = rng.choice(DEP); await typ(i, q); exp['dep'] = e
        elif q == 'colour':
            c = rng.choice(['Alpine White', 'Black Sapphire', 'Brooklyn Grey', 'Portimao Blue', 'Fire Red', 'Skyscraper Grey', 'Any colour'])
            await idle(); await pg.locator('#tray .swatch', has_text=c).click(); await asyncio.sleep(0.1); await idle(); exp['colour'] = c
        elif q == 'specs':
            await idle(); must, like = [], []; total = rng.choice([3, 6, 20])
            for k in range(total):
                name = await pg.text_content('.dcard b'); a = rng.choice(['L', 'R', 'U', 'D', 'bno', 'blike', 'bmust'])
                if a == 'L': await drag(-170, 0)
                elif a == 'R': await drag(170, 0); like.append(name)
                elif a == 'U': await drag(0, -170); must.append(name)
                elif a == 'D': await pg.locator('.dcard').dblclick(); await asyncio.sleep(0.9); must.append(name)
                else:
                    await pg.locator('#tray .dbtns button', has_text={'bno': 'No', 'blike': 'Would like', 'bmust': 'Must have'}[a]).first.click(); await asyncio.sleep(0.9)
                    if a == 'blike': like.append(name)
                    if a == 'bmust': must.append(name)
                if k < 19:
                    nxt = await pg.text_content('.dcard b')
                    if nxt == name: raise Fail(f'card did not advance on {a} for {name}')
            if total < 20: await tap("That's enough kit", q)
            else: await idle()
            got = await pg.evaluate('SDChat.answers().specs')
            for x in must:
                if x not in got.split('Would like')[0]: raise Fail(f'must {x} missing in {got}')
            for x in like:
                if x not in got.split('Would like')[1]: raise Fail(f'like {x} missing in {got}')
        elif q == 'when':
            await maybe_bad(q, ['potato', 'blue'])
            if rng.random() < 0.5: await tap(rng.choice(['ASAP', 'Next month', 'In 3 months', 'Just looking']), q)
            else: await typ(rng.choice(WHEN_T), q)
        elif q == 'phone':
            await maybe_bad(q, ['12345', 'call me maybe', '0123'])
            if rng.random() < 0.2: await tap('Rather not say', q); exp['phone'] = None
            else: i, e = rng.choice(PHONES); await typ(i, q); exp['phone'] = e
        else: raise Fail('unknown question ' + str(q))
        if rng.random() < 0.02 and q not in ('specs',):
            await pg.click('#restart'); await idle()
            if await cur() != 'name': raise Fail('start again did not reset')
            exp = {}; reloaded = True
    href = await pg.get_attribute('#tray a.cta', 'href')
    if not href or not href.startswith('https://wa.me/447827138197?text='): raise Fail('bad WA link ' + str(href))
    txt = urllib.parse.unquote(href.split('text=', 1)[1])
    if re.search(r'undefined|NaN|null|@', txt): raise Fail('bad WA text ' + txt)
    def need(s):
        if s not in txt: raise Fail(f'WA missing "{s}"\n{txt}')
    if exp.get('name') and exp['name'] != 'skip': need('Name: ' + exp['name'])
    if exp.get('model'): need('Model I like: ' + exp['model'])
    if exp.get('cur'): need('Current car: ' + exp['cur'])
    for k in ('miles', 'settle', 'curMonthly', 'dep', 'annual'):
        if exp.get(k): need(exp[k])
    if exp.get('pay'): need('Paying by: ' + exp['pay'])
    if exp.get('colour'): need('Colour: ' + exp['colour'])
    if exp.get('phone'): need('Mobile: ' + exp['phone'])
    if 'base' in exp:
        f = lambda v: '£' + format(v, ',')
        if exp.get('stretch', exp['base']) > exp['base']: need(f(exp['base']) + ' to ' + f(exp['stretch']))
        else: need('(no stretch)')
    m = await bots()
    if errs: raise Fail('console: ' + '; '.join(errs))
    await ctx.close(); return dev, len(log)

async def quick_suite(b):
    res = []
    for dev in DEVICES:
        ctx = await b.new_context(**DEVICES[dev]); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + 'quick.html')
        h = await pg.get_attribute('#justwa', 'href'); assert h.startswith('https://wa.me/447827138197?text='), h
        box = await pg.locator('#q6').bounding_box(); wbox = await pg.locator('#justwa').bounding_box(); assert box['y'] < wbox['y'], 'questions should come before WhatsApp link'
        await pg.click('#showCall'); await pg.fill('#cName', 'Jo'); await pg.fill('#cPhone', '12'); await pg.click('#call button[type=submit]')
        assert 'mobile' in (await pg.text_content('#ePhone')).lower()
        await pg.fill('#cPhone', '07700 900123')
        async with pg.expect_request(lambda r: 'wa.me' in r.url) as ri: await pg.click('#call button[type=submit]')
        t = urllib.parse.unquote((await ri.value).url); assert 'Name: Jo' in t and 'Mobile: 07700900123' in t, t
        cases = [({'q_name': 'Tom', 'q_model': '1 series', 'q_cur': '2018 Ford Focus', 'q_budget': 'about £450', 'q_stretch': '£520', 'q_when': 'next month', 'q_phone': '07700 900123'}, ['Your first name: Tom', 'Which BMW do you fancy?: 1 Series', 'About £450 a month', 'Perfect car stretch budget: £520 a month', '07700900123']),
                 ({'q_name': 'sarah', 'q_model': 'm340i', 'q_cur': 'none', 'q_budget': 'three hundred', 'q_stretch': '', 'q_when': 'asap', 'q_phone': '+44 7700 900456'}, ['Sarah', '3 Series', '£300 a month', '07700900456']),
                 ({'q_name': '', 'q_model': '', 'q_cur': '', 'q_budget': '', 'q_stretch': '', 'q_when': '', 'q_phone': ''}, ['Not given'])]
        for vals, want in cases:
            await pg.goto(BASE + 'quick.html')
            for k, v in vals.items(): await pg.fill('#' + k, v)
            async with pg.expect_request(lambda r: 'wa.me' in r.url) as ri: await pg.click('#q6 button[type=submit]')
            t = urllib.parse.unquote((await ri.value).url)
            for w in want: assert w in t, (w, t)
            assert not re.search(r'undefined|NaN|null', t), t
        await pg.goto(BASE + 'quick.html')
        for k, v in {'q_name': 'asdfgh', 'q_model': 'banana', 'q_budget': '£400', 'q_stretch': '£300', 'q_phone': '123'}.items(): await pg.fill('#' + k, v)
        await pg.click('#q6 button[type=submit]'); e = await pg.evaluate('[...document.querySelectorAll("#q6 .err")].map(e=>e.textContent)')
        assert sum(1 for x in e if x) == 4 and any('under your normal budget' in x for x in e), e
        assert pg.url.endswith('quick.html'), 'should not leave with errors'
        assert not errs, errs; res.append(dev); await ctx.close()
    return res

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', args=['--no-sandbox', '--allow-file-access-from-files'])
        ok = 0; fails = []; ran = 0
        for n in range(N):
            if ONLY and n not in ONLY: continue
            rng = random.Random(1000 + n); ran += 1
            try:
                dev, steps = await run_one(b, n, rng); ok += 1; print(f'PASS chat #{n} {dev} {steps} inputs', flush=True)
            except Exception as e:
                fails.append((n, str(e)[:500])); print(f'FAIL chat #{n}: {str(e)[:500]}', flush=True)
        try:
            q = await quick_suite(b); print('PASS quick lane on', q); qok = len(q)
        except Exception as e:
            print('FAIL quick lane', repr(e)[:600]); qok = 0
        await b.close()
        print(f'\nRESULT chat {ok}/{ran} passed, quick lane {qok}/{len(DEVICES)} devices passed')
        sys.exit(0 if ok == ran and qok == len(DEVICES) else 1)
asyncio.run(main())
