import asyncio, sys, json
from playwright.async_api import async_playwright
BASE=sys.argv[1]; DEMO="window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
res=[]
def ok(c,m): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+m)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(channel='chrome'); ctx=await b.new_context(viewport={'width':390,'height':844})
    await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');")
    await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    sp=lambda row,prev: pg.evaluate("([r,p])=>ctDebug.safePrefs(r,p)",[row,prev])
    r=await sp({'id':'a','models':None,'models_must':None,'fuel':None,'mileage_bands':None,'colours':None,'specs':None},{'models':['X3'],'fuel':'diesel','colours':['Blue'],'specs':['feat:hud']}) if False else None
    await pg.goto(BASE); await pg.wait_for_selector('#siEmail'); await pg.fill('#siEmail','sam@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=customer]')
    await pg.wait_for_function("location.hash=='#profile'||location.hash=='#discover'")
    r=await sp({'id':'a','models':None,'models_must':None,'fuel':None,'mileage_bands':None,'colours':None,'specs':None},{'models':['X3'],'fuel':'diesel','colours':['Blue'],'specs':['feat:hud']})
    ok(r['models']==['X3'] and r['fuel']=='diesel' and r['colours']==['Blue'] and r['specs']==['feat:hud'],'null prefs fall back to existing values '+json.dumps(r))
    ok('mileage_bands' not in r and 'models_must' not in r,'null with nothing before is left out, never sent as null')
    r=await sp({'id':'a','models':None,'fuel':None},None); ok('models' not in r and r['fuel']=='open','new customer with no models: no null, fuel open')
    r=await sp({'id':'a','models':'X3'},None); ok(r['models']==['X3'],'a stray single string becomes a one item list')
    # form: set an old style customer (models X3, fuel diesel, no models_must) and save untouched
    await pg.evaluate("location.hash='#profile'"); await pg.wait_for_selector('#modelChips button')
    await pg.evaluate("ctDebug.S.cust=Object.assign({},ctDebug.S.cust||{},{name:'Sam',phone:'07700900123',models:['X3'],fuel:'diesel',colours:['Blue'],specs:[]});delete ctDebug.S.cust.models_must;delete ctDebug.S.cust.mileage_bands;location.hash='#discover'")
    await pg.wait_for_timeout(400); await pg.evaluate("location.hash='#profile'"); await pg.wait_for_timeout(600)
    st=await pg.evaluate("JSON.stringify({like:[...document.querySelectorAll('#modelChips [data-state=like]')].map(b=>b.dataset.v),must:[...document.querySelectorAll('#modelChips [data-state=must]')].map(b=>b.dataset.v),fuel:[...document.querySelectorAll('[data-name=fuel] [aria-pressed=true]')].map(b=>b.dataset.v)})")
    ok(json.loads(st)=={'like':['X3'],'must':[],'fuel':['diesel']},'old models load as would like, old single fuel loads '+st)
    await pg.fill('#profileForm [name=name]','Sam'); await pg.click('#pfSave'); await pg.wait_for_function("location.hash=='#discover'",timeout=15000)
    c=json.loads(await pg.evaluate("JSON.stringify(ctDebug.S.cust)"))
    ok(c['models']==['X3'] and c['models_must']==[] and c['fuel']=='diesel' and c['colours']==['Blue'],'untouched save keeps existing choices')
    await pg.evaluate("location.hash='#profile'"); await pg.wait_for_selector('#modelChips button'); await pg.wait_for_timeout(400)
    await pg.locator('#modelChips [data-v=X3]').click(); await pg.locator('#modelChips [data-v=X3]').click()   # like -> must -> clear
    await pg.click('#pfSave'); await pg.wait_for_function("location.hash=='#discover'",timeout=15000)
    c=json.loads(await pg.evaluate("JSON.stringify(ctDebug.S.cust)"))
    ok(c['models']==[] and c['models_must']==[] and c['fuel']=='diesel','save with no models sends empty lists, not null '+json.dumps([c['models'],c['models_must']]))
    # simulate a form whose model chips never loaded
    await pg.evaluate("ctDebug.S.cust.models=['X5'];location.hash='#profile'"); await pg.wait_for_selector('#modelChips button'); await pg.evaluate("document.querySelector('#modelChips').innerHTML=''")
    await pg.click('#pfSave'); await pg.wait_for_function("location.hash=='#discover'",timeout=15000)
    c=json.loads(await pg.evaluate("JSON.stringify(ctDebug.S.cust)")); ok(c['models']==['X5'],'a form that did not load models keeps the saved models')
    ok(not errs,'no page errors '+str(errs)); await b.close()
  print(f'RESULT save {sum(res)}/{len(res)}'); sys.exit(0 if all(res) else 1)
asyncio.run(main())
