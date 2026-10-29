import { renderDigest } from '../functions/match-alerts/digest.js';
import { signUnsub, verifyUnsub } from '../functions/_shared/unsub.js';
import fs from 'fs';
const sec='test-secret-1234567890-abcdef', id='3f2b9c1e-1111-4222-8333-444455556666';
const t=await signUnsub(sec,id); let p=0,f=0; const ok=(c,m)=>{c?p++:(f++,console.log('FAIL',m))};
ok((await verifyUnsub(sec,t))?.id===id,'verify'); ok(!(await verifyUnsub(sec,t.slice(0,-2)+'AA')),'tamper sig');
ok(!(await verifyUnsub(sec,t.replace('3f2b','4f2b'))),'other id'); ok(!(await verifyUnsub('other-secret-123456789',t)),'other secret'); ok(!(await verifyUnsub(sec,'')),'empty');
const url='https://dexqyqrbelmdjdhxaboq.supabase.co/functions/v1/unsubscribe?t='+encodeURIComponent(t);
const m=renderDigest({toName:'Sam',staff:false,matchesUrl:'https://dan-sells.co.uk/swipe-drive/#matches',unsubUrl:url,brokerText:'Finance subject to status, 18+, UK residents. Hedin Automotive Group acts as a credit broker and not a lender.',
 items:[{car:{model:'BMW X3 xDrive20d M Sport',year:2022,mileage:'21,400 miles',fuel:'Diesel',gearbox:'Automatic',colour:'Black Sapphire',price:'Price on request',kind:'used'},finance:null,wa:'https://wa.me/447827138197?text=X3',waLabel:'WhatsApp about this car'}]});
ok(m.html.includes('Unsubscribe from these emails')&&m.html.includes(url.replace(/&/g,'&amp;'))&&m.text.includes('Unsubscribe: '+url),'unsub in html and text');
ok(/signed up to SwipeToDrive/.test(m.html)&&/signed up/.test(m.text),'why line');
ok(!/[\u2013\u2014]| - /.test(m.html.replace(/<[^>]+>/g,'')),'no dashes');
let threw=false;try{renderDigest({toName:'x',staff:false,items:[],matchesUrl:'',unsubUrl:''})}catch(e){threw=true}ok(threw,'missing unsub throws');
if(process.argv[2])fs.writeFileSync(process.argv[2],m.html);console.log(p+' passed, '+f+' failed');
/* unsubscribing stops future alerts: the customer email gate in match-alerts needs notify_email, which the unsubscribe function sets false */
const src=fs.readFileSync(new URL('../functions/match-alerts/index.ts',import.meta.url),'utf8'),us=fs.readFileSync(new URL('../functions/unsubscribe/index.ts',import.meta.url),'utf8');
ok(/CUSTOMER_EMAIL_ENABLED && STAFF_EMAIL_ENABLED && p\.notify_email/.test(src),'customer email gated on notify_email');
ok(/update\(\{ notify_email: false \}\)/.test(us)&&/List-Unsubscribe=One-Click/.test(src),'unsubscribe sets notify_email false, one click header sent');
ok(/UNSUBSCRIBE_SECRET'\)\.length >= 16/.test(src),'no customer email without signing secret');
console.log('totals '+p+' passed, '+f+' failed');process.exit(f?1:0);
