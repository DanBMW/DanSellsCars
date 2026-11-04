"""Fuel Want and Must in the profile form and Revvy's chat. Demo mode, fake data. Usage: python3 tests/fuel_wantmust_e2e.py BASE"""
import asyncio, sys, json
from playwright.async_api import async_playwright
BASE=sys.argv[1]; DEMO="window.CT_CONFIG={MODE:'demo',DAN_WA:'447827138197',GOOGLE_LOGIN_ENABLED:false};"
res=[]
def ok(c,m): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+m)
FS="JSON.stringify([...document.querySelectorAll('#fuelChips button')].filter(b=>b.dataset.state).map(b=>b.dataset.v+':'+b.dataset.state))"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(channel='chrome'); ctx=await b.new_context(viewport={'width':390,'height':844})
    await ctx.add_init_script("localStorage.setItem('sdIntroSeen','1');localStorage.setItem('sd_discover_tutorial_v1','1');")
    await ctx.route('**/swipe-drive/config.js*', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_selector('#siEmail'); await pg.fill('#siEmail','sam@example.com'); await pg.click('#signinForm button[type=submit]'); await pg.click('[data-demo=customer]')
    await pg.wait_for_function("location.hash=='#profile'||location.hash=='#discover'")
    # an older profile: fuel diesel, no fuel_must, loads as must have (today's behaviour)
    await pg.evaluate("ctDebug.S.cust=Object.assign({},ctDebug.S.cust||{},{name:'Sam',phone:'07700900123',fuel:'diesel,electric'});delete ctDebug.S.cust.fuel_must;location.hash='#discover'")
    await pg.wait_for_timeout(300); await pg.evaluate("location.hash='#profile'"); await pg.wait_for_selector('#fuelChips button'); await pg.wait_for_timeout(300)
    ok(json.loads(await pg.evaluate(FS))==['diesel:must','electric:must'],'older fuels load as must have '+await pg.evaluate(FS))
    labels=await pg.evaluate("[...document.querySelectorAll('#fuelChips button')].map(b=>b.textContent).join('|')")
    ok(labels=='Open minded|Petrol|Diesel|Hybrid|Plug in hybrid|Electric','fuel options '+labels)
    await pg.evaluate("document.querySelector('details.ct-sec[data-sec=car]').open=true")
    await pg.click('#fuelChips [data-v=open]'); ok(json.loads(await pg.evaluate(FS))==['open:like'],'Open minded clears the others')
    await pg.click('#fuelChips [data-v=electric]'); ok(json.loads(await pg.evaluate(FS))==['electric:like'],'one tap is would like and clears Open minded')
    await pg.click('#fuelChips [data-v=phev]'); await pg.click('#fuelChips [data-v=phev]'); ok(json.loads(await pg.evaluate(FS))==['phev:must','electric:like'],'two taps is must have')
    await pg.click('#fuelChips [data-v=open]'); await pg.click('#fuelChips [data-v=open]'); ok(json.loads(await pg.evaluate(FS))==[],'Open minded has no must have state')
    await pg.click('#fuelChips [data-v=electric]')
    await pg.fill('#profileForm [name=name]','Sam'); await pg.click('#pfSave'); await pg.wait_for_function("location.hash=='#discover'",timeout=15000)
    c=json.loads(await pg.evaluate("JSON.stringify(ctDebug.S.cust)")); ok(c['fuel']=='electric' and c['fuel_must']==[],'saved would like electric '+json.dumps([c['fuel'],c.get('fuel_must')]))
    n=await pg.evaluate("ctMatch.rank(ctDebug.pool(),ctDebug.S.cust).filter(x=>!/electric/i.test(x.car.fuel||'')&&x.car.kind!=='new').length")
    ok(n>0,'would like electric still shows other fuels ('+str(n)+')')
    await pg.evaluate("location.hash='#profile'"); await pg.wait_for_selector('#fuelChips button'); await pg.wait_for_timeout(300)
    await pg.evaluate("document.querySelector('details.ct-sec[data-sec=car]').open=true")
    await pg.click('#fuelChips [data-v=electric]'); await pg.click('#pfSave'); await pg.wait_for_function("location.hash=='#discover'",timeout=15000)
    c=json.loads(await pg.evaluate("JSON.stringify(ctDebug.S.cust)")); ok(c['fuel']=='electric' and c['fuel_must']==['electric'],'saved must have electric')
    bad=await pg.evaluate("ctMatch.rank(ctDebug.pool(),ctDebug.S.cust).filter(x=>{const s=window.dsStock; const k=x.car.kind==='new'?(x.car.fuelKeys||[]):[s.fuelKey(x.car)]; return k.indexOf('electric')<0}).length")
    ok(bad==0,'must have electric shows electric only')
    # Revvy: values and patch, then the real picker on the fuel question
    v=json.loads(await pg.evaluate("JSON.stringify(ctRevvy.values({fuel:'petrol,diesel'}))")); ok(v['fuel_must']==['petrol','diesel'],'Revvy reads an older profile as must have')
    n2=json.loads(await pg.evaluate("JSON.stringify(ctRevvy.onto({fuel:'open'},{fuel:['petrol','electric'],fuel_must:['electric']}))")); ok(n2['fuel']=='petrol,electric' and n2['fuel_must']==['electric'],'Revvy saves want and must')
    n3=json.loads(await pg.evaluate("JSON.stringify(ctRevvy.onto({fuel:'petrol',fuel_must:['petrol']},{fuel:['open'],fuel_must:[]}))")); ok(n3['fuel']=='open' and n3['fuel_must']==[],'Revvy Open minded clears both')
    await pg.evaluate("""(()=>{const box=document.createElement('div');box.id='tbox';box.innerHTML='<div id=tlog></div><div id=ttray></div>';document.body.appendChild(box);
      const f=RevvyFlow.fields({models:[],specs:[],colours:[],desk:{}},{}).filter(x=>x.k==='fuel');window.__p=null;
      RevvyFlow.run({log:document.getElementById('tlog'),tray:document.getElementById('ttray'),values:{fuel:[]},fields:f,cls:{bot:'b',me:'m',chip:'c',go:'g',legend:'l',picks:'ps',pick:'pk',row:'r',form:'f',input:'i',sum:'s'},save:p=>{window.__p=p;return Promise.resolve()},open:()=>{},done:()=>{}});})()""")
    await pg.wait_for_selector('#ttray .pk[data-k=electric]')
    await pg.evaluate("document.querySelector('#ttray .pk[data-k=electric]').click()"); await pg.evaluate("document.querySelector('#ttray .pk[data-k=electric]').click()"); await pg.evaluate("document.querySelector('#ttray .pk[data-k=petrol]').click()")
    tag=await pg.evaluate("[...document.querySelectorAll('#ttray .pk')].map(b=>b.dataset.k+':'+b.dataset.s+':'+b.querySelector('i').textContent).filter(x=>!x.endsWith('::')).join('|')")
    ok(tag=='petrol:like:Would like|electric:must:Must have','Revvy picker labels '+tag)
    await pg.evaluate("document.querySelector('#ttray .pk[data-k=open]').click()"); ok(await pg.evaluate("[...document.querySelectorAll('#ttray .pk')].filter(b=>b.dataset.s).map(b=>b.dataset.k).join()")=='open','Revvy Open minded clears the others')
    await pg.evaluate("document.querySelector('#ttray .pk[data-k=electric]').click()"); await pg.evaluate("document.querySelector('#ttray .pk[data-k=electric]').click()"); await pg.evaluate("document.querySelector('#ttray .pk[data-k=diesel]').click()")
    await pg.evaluate("document.querySelector('#ttray .g').click()"); await pg.wait_for_timeout(300)
    pp=json.loads(await pg.evaluate("JSON.stringify(window.__p)")); ok(pp=={'fuel':['electric','diesel'],'fuel_must':['electric']} or pp=={'fuel':['diesel','electric'],'fuel_must':['electric']},'Revvy saves '+json.dumps(pp))
    log=await pg.text_content('#tlog'); ok('must have Electric, and would also like Diesel' in log,'Revvy reads it back')
    ok(not errs,'no page errors '+str(errs)); await b.close()
  print(f'RESULT fuel e2e {sum(res)}/{len(res)}'); sys.exit(0 if all(res) else 1)
asyncio.run(main())
