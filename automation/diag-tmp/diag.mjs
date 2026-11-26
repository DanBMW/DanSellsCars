// Temporary: why do vehicle pages give no Codeweavers quote on the runner?
// Logs only hosts, status codes and response shapes, no keys or values.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const urls = JSON.parse(fs.readFileSync(process.argv[2],'utf8')).slice(0, 3);
const b = await puppeteer.launch({executablePath: process.env.CHROME_PATH, args:['--no-sandbox']});
console.log('browser', await b.version(), 'ua', await b.userAgent());
let i = 0;
for (const r of urls) {
  const pg = await b.newPage();
  const hosts = {};
  pg.on('response', async x => { const u = x.url(); let h=''; try{h=new URL(u).host}catch(e){}; hosts[h]=(hosts[h]||0)+1;
    if (/codeweavers|velocity|calculat/i.test(u)) {
      let shape=''; if (/api\/finance\/quote\//i.test(u) && x.request().method()!=='OPTIONS') { try { const t = await x.text(); try { const j=JSON.parse(t); shape='keys:'+Object.keys(j).join(',')+' vin:'+!!(j.Vehicle&&j.Vehicle.Physical&&j.Vehicle.Physical.Vin)+' product:'+(j.Finance&&j.Finance.Product&&j.Finance.Product.Key); } catch(e){ shape='notjson:'+t.slice(0,120).replace(/\s+/g,' '); } } catch(e){ shape='textErr:'+e.message; } }
      console.log(' RESP', x.status(), x.request().method(), u.split('?')[0].replace(/[0-9a-f-]{36}/,'<id>').slice(0,120), shape); } });
  pg.on('requestfailed', q => { if (/codeweavers|velocity|bmwgroup/i.test(q.url())) console.log(' FAIL', q.url().split('?')[0].slice(0,120), q.failure()?.errorText); });
  pg.on('console', m => { if (m.type()==='error') console.log(' CONSOLE', m.text().slice(0,200)); });
  let st=''; try { const resp = await pg.goto(r.url, {waitUntil:'networkidle2', timeout:60000}); st = resp && resp.status(); } catch(e) { st = 'err '+e.message; }
  await new Promise(s=>setTimeout(s,6000));
  console.log('car', r.order, 'status', st, 'title', await pg.title());
  console.log(' hosts', JSON.stringify(hosts));
  console.log(' text', (await pg.evaluate(()=>document.body ? document.body.innerText.slice(0,600) : '')).replace(/\s+/g,' '));
  await pg.screenshot({path:`/tmp/diag-${i++}.png`, fullPage:false});
  await pg.close();
}
await b.close();
