(function(){
var O=window.Onboard,P=O.V.pounds;
var Q=[
 {id:"name",short:"Name",type:"name",say:"Hi, I'm Revvy, Dan's SwipeToDrive assistant bot. I need to learn a little about you and your requirements before I can show you what is available. First up, what should I call you?",re:"What should I call you?",optional:false,chips:["Skip"]},
 {id:"model",short:"Model I like",type:"model",say:"Nice to meet you{nm}! Which BMW has caught your eye?",chips:["X1","3 Series","X3","i4","Not sure yet"]},
 {id:"why",short:"What I like",kind:"multi",say:"What matters most to you? Tap as many as you like.",choices:["Comfort","Space for family","Low running costs","Performance","Tech","Electric","Looks","Reliability"]},
 {id:"cur",short:"Current car",type:"anycar",say:"What are you driving at the moment?",ex:"Something like 2019 Audi A3 diesel, or just the make and model.",chips:["No current car","Not sure"]},
 {id:"reg",short:"Reg",type:"reg",say:"Do you know the reg? Totally fine to skip.",chips:["Skip"],skipIf:function(a){return a.cur=="No current car"}},
 {id:"miles",short:"Mileage",type:"miles",say:"Roughly how many miles has it done?",chips:["Under 20k","20k to 50k","50k to 80k","Over 80k","Not sure"],skipIf:function(a){return a.cur=="No current car"}},
 {id:"cond",short:"Condition",kind:"rate",say:"Be honest, how is it looking? Tap a rating for each.",parts:["Bodywork","Interior","Tyres","Service history"],skipIf:function(a){return a.cur=="No current car"}},
 {id:"settle",short:"Finance settlement",fn:P(0,150000),type:"settle",ex:"A rough figure is spot on, like £8,000 or about 8k. Paid off is fine too.",say:"Is there finance left on it? A rough settlement figure is perfect.",chips:["Paid off","Not sure"],skipIf:function(a){return a.cur=="No current car"}},
 {id:"curMonthly",short:"Current monthly",fn:P(0,3000),type:"cur",ex:"Something like £350 a month.",say:"And what do you pay a month now?",chips:["None","Not sure"],skipIf:function(a){return a.cur=="No current car"}},
 {id:"annual",short:"Annual mileage",type:"annual",say:"How many miles do you do a year, roughly?",chips:["Under 6k","6k to 10k","10k to 15k","Over 15k"]},
 {id:"pay",short:"Paying by",kind:"single",say:"How are you thinking of paying?",choices:["Monthly finance","Lease","Cash","Not sure yet"]},
 {id:"budget",short:"Monthly budget",kind:"slider",min:150,max:1500,step:25,val:400,fmt:function(v){return "£"+v+" a month"},say:"Slide to a monthly budget you'd be comfy with.",skipIf:function(a){return a.pay=="Cash"}},
 {id:"stretch",short:"Stretch budget",kind:"slider",stretchOf:"budget",max:2000,step:25,fmt:function(v){return "£"+v+" a month"},say:"Imagine Dan found you the perfect car, ticking every single box of your needs. What would your budget be then?",skipIf:function(a){return a.pay=="Cash"}},
 {id:"cash",short:"Cash budget",kind:"slider",min:5000,max:120000,step:1000,val:30000,fmt:function(v){return "Up to £"+v.toLocaleString("en-GB")},say:"Slide to your top cash budget.",skipIf:function(a){return a.pay!="Cash"}},
 {id:"stretchCash",short:"Stretch budget",kind:"slider",stretchOf:"cash",max:150000,step:1000,fmt:function(v){return "Up to £"+v.toLocaleString("en-GB")},say:"Imagine Dan found you the perfect car, ticking every single box of your needs. What would your budget be then?",skipIf:function(a){return a.pay!="Cash"}},
 {id:"dep",short:"Deposit",fn:P(0,100000),type:"cur",ex:"Something like £2,000, or none.",say:"Any cash deposit to put in?",chips:["None","Not sure"],skipIf:function(a){return a.pay=="Cash"}},
 {id:"colour",short:"Colour",kind:"colour",say:"Which colours would you love? Tap as many as you like, then Done.",choices:[["Alpine White","#f4f4f2"],["Black Sapphire","#111318"],["Brooklyn Grey","#7d8288"],["Portimao Blue","#1f4fa8"],["Fire Red","#a3161c"],["Skyscraper Grey","#a7adb3"],["Any colour","conic-gradient(#f44,#fc3,#3c6,#39f,#a4f,#f44)"]]},
 {id:"specs",short:"Spec",kind:"swipe",say:"Now the fun bit, the kit! Tap once for would like, twice for must have, a third tap clears it.",items:["Head up display","Leather or synthetic leather seats","Pro pack","Comfort access","Panoramic roof","Electric seats","Heated seats","Heated steering wheel","M Sport package","Harman Kardon sound","360 parking camera","Adaptive cruise control","Driving assistant","Towbar","7 seats","Larger alloys","Electric tailgate","Wireless charging","Ambient lighting","Plug in hybrid or electric"]},
 {id:"when",short:"When",type:"date",say:"When are you hoping to change?",chips:["ASAP","Next month","In 3 months","Just looking"]},
 {id:"phone",short:"Mobile",type:"phone",say:"Last bit! What's the best mobile for Dan to reach you on?",chips:["Rather not say"]}
];
var A=O.load()||{},i=0,miss=0,log=document.getElementById("log"),form=document.getElementById("form"),inp=document.getElementById("inp"),tray=document.getElementById("tray"),car=document.getElementById("car"),wa=document.getElementById("wa");
function el(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h!=null)e.textContent=h;return e}
var FAST=/[?&]fast\b/.test(location.search),busy=0,R=window.Revvy;
var NEAR=160;function nearBottom(){var d=document.scrollingElement||document.documentElement;return d.scrollHeight-(d.scrollTop+innerHeight)<NEAR}
var stuck=true;addEventListener("scroll",function(){stuck=nearBottom()},{passive:true});
function stick(force){if(!(force||stuck))return;requestAnimationFrame(function(){var d=document.scrollingElement||document.documentElement;d.scrollTop=d.scrollHeight;stuck=true})}
window.SDStick=function(){stick()};
function bot(t,cb){busy++;var ms=FAST?30:Math.min(1400,350+t.length*12);R.typing(log,ms,function(){var b=el("div","msg bot",t);log.appendChild(b);stick();busy--;cb&&cb()})}
function bots(a,cb){a=a.filter(Boolean);if(!a.length)return cb&&cb();bot(a[0],function(){bots(a.slice(1),cb)})}
function me(t){var b=el("div","msg me",t);log.appendChild(b);stick(true)}
function fill(s){var ok=A.name&&A.name!="Skipped"&&A.name!="Not sure";return s.replace("{nm}",ok?", "+A.name:"").replace("{name}",ok?A.name:"there")}
function progress(){var tot=Q.filter(function(q){return !(q.skipIf&&q.skipIf(A))}).length,done=Object.keys(A).filter(function(k){return k.charAt(0)!="_"}).length;var p=Math.min(1,done/tot);car.style.left="calc("+(p*100)+"% - "+(p*34)+"px)";document.getElementById("pct").textContent=Math.round(p*100)+"%";wa.href=O.waLink(A,Q)}
function answer(q,val,shown){if(busy)return;tray.innerHTML="";me(shown||val);inp.value="";A[q.id]=val;i++;A._i=i;miss=0;O.save(A);progress();var rx=R.react(q,val,A);next(rx)}
function next(pre){tray.innerHTML="";while(i<Q.length&&Q[i].skipIf&&Q[i].skipIf(A))i++;
 if(i>=Q.length){form.hidden=true;bots([pre,"That's everything"+fill("{nm}")+"! Tap the green button and your answers go straight to Dan on WhatsApp. He reads every one himself.","Want your answers saved to a SwipeToDrive profile too? Sign in or create a free account and they'll be there next time. Totally optional."],endOffer);return}
 var q=Q[i];form.hidden=true;bots([pre,fill(q.say)],function(){render(q)})}
function waBtn(){var b=el("a","cta","Send to Dan on WhatsApp");b.href=O.waLink(A,Q,"Hi Dan, I've finished SwipeToDrive:");b.target="_blank";b.rel="noopener";b.id="waEnd";return b}
var CFG=window.CT_CONFIG||{},APP=location.origin+"/swipe-drive/",sbP=null;
function getSb(){if(!sbP)sbP=import("https://esm.sh/@supabase/supabase-js@2").then(function(m){return m.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,detectSessionInUrl:false,flowType:"implicit"}})});return sbP}
function endOffer(){tray.innerHTML="";tray.appendChild(waBtn());if(A._saved){var ok=el("p","alt","Your answers are saved to your SwipeToDrive profile.");tray.appendChild(ok);return}var row=el("div","saverow"),sv=chip("Save my answers",null),no=chip("No thanks",null);sv.classList.add("go");row.appendChild(sv);row.appendChild(no);tray.appendChild(row);var au=el("div","authbox");au.id="authbox";tray.appendChild(au);
 no.onclick=function(){row.remove();au.innerHTML="";bot("No problem. Your answers are still ready to send to Dan on WhatsApp.")};
 sv.onclick=function(){row.remove();au.innerHTML='<p class="alt">Loading sign in...</p>';if(!(CFG.SUPABASE_URL&&window.AuthUI&&window.ChatProfile)){au.innerHTML="";bot("Saving isn't available right now, but WhatsApp works just fine.");return}
  getSb().then(function(sb){return sb.auth.getSession().then(function(r){var s=r.data&&r.data.session;if(s)return doSave(sb,s.user,au);
   window.ChatProfile.markPending();
   window.AuthUI.mount(au,{sb:sb,cfg:CFG,redirect:APP,code:true,onDone:function(sess){doSave(sb,sess.user,au)},track:function(n){try{window.gtag&&gtag("event",n,{source:"chat"})}catch(e){}}});stick(true)})}).catch(function(){au.innerHTML="";bot("I couldn't load sign in just now. WhatsApp still works.")})};stick(true)}
function doSave(sb,user,au){au.innerHTML='<p class="alt">Saving...</p>';window.ChatProfile.save(sb,user,A).then(function(){au.innerHTML="";A._saved=user.email||"yes";O.save(A);bot("Saved to your profile"+(user.email?" ("+user.email+")":"")+". Open SwipeToDrive any time to see cars that fit. Don't forget to send your answers to Dan too.",function(){var a=el("a","chip","Open SwipeToDrive");a.href=APP;au.appendChild(a);stick(true)})})
 .catch(function(e){console.warn("chat save",e);au.innerHTML="";bot("That didn't save, sorry. Your answers are still safe here, and WhatsApp works just fine.")})}
function render(q){tray.innerHTML="";form.hidden=!!(q.kind&&q.kind!="single");inp.value="";inp.placeholder=q.kind=="single"?"Tap or type":"Type your answer";
 if(q.kind=="single")q.choices.forEach(function(c){chip(c,function(){answer(q,c)})});
 else if(q.kind=="multi"){var sel=[];q.choices.forEach(function(c){var b=chip(c,function(){var k=sel.indexOf(c);k<0?sel.push(c):sel.splice(k,1);b.classList.toggle("on")})});var d=el("button","chip go","Done");d.onclick=function(){answer(q,sel.length?sel.join(", "):"No preference")};tray.appendChild(d)}
 else if(q.kind=="slider"){var mn=q.stretchOf?(A["_n_"+q.stretchOf]||Q.filter(function(z){return z.id==q.stretchOf})[0].val):q.min,v0=q.stretchOf?mn:q.val,w=el("div","slide"),o=el("div","sval",q.fmt(v0)),r=el("input");r.type="range";r.min=mn;r.max=Math.max(q.max,mn);r.step=q.step;r.value=v0;r.setAttribute("aria-label",q.short);r.oninput=function(){o.textContent=q.fmt(+r.value)};var g=el("button","chip go","That's me");g.onclick=function(){var v=+r.value;if(q.stretchOf&&v<mn){bot("That's a touch under your normal budget. Pop it at "+q.fmt(mn)+" or above.");return}A["_n_"+q.id]=v;answer(q,q.fmt(v))};w.appendChild(o);w.appendChild(r);w.appendChild(g);tray.appendChild(w)}
 else if(q.kind=="colour"){var cs=[],grid=el("div","swgrid"),cd=el("button","chip go","Done");cd.type="button";
  q.choices.forEach(function(c){var b=el("button","swatch");b.type="button";b.setAttribute("aria-pressed","false");b.setAttribute("data-c",c[0]);var s=el("span");s.style.background=c[1];b.appendChild(s);b.appendChild(el("em",null,c[0]));
   b.onclick=function(){var any=c[0]=="Any colour",k=cs.indexOf(c[0]);if(k>=0)cs.splice(k,1);else{if(any)cs=[];else cs=cs.filter(function(x){return x!="Any colour"});cs.push(c[0])}
    grid.querySelectorAll(".swatch").forEach(function(x){var on=cs.indexOf(x.getAttribute("data-c"))>=0;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on?"true":"false")});cd.textContent=cs.length?"Done ("+cs.length+")":"Done"};grid.appendChild(b)});
  cd.onclick=function(){answer(q,cs.length?cs.join(", "):"No preference")};tray.appendChild(grid);tray.appendChild(cd)}
 else if(q.kind=="rate"){var res={},box=el("div","rates");q.parts.forEach(function(p){var row=el("div","rrow");row.appendChild(el("b",null,p));["Rough","OK","Good","Mint"].forEach(function(l){var b=el("button","chip sm",l);b.onclick=function(){res[p]=l;row.querySelectorAll("button").forEach(function(x){x.classList.remove("on")});b.classList.add("on")};row.appendChild(b)});box.appendChild(row)});var g2=el("button","chip go","Done");g2.onclick=function(){var rated=q.parts.filter(function(p){return res[p]});answer(q,rated.length?rated.map(function(p){return p+" "+res[p]}).join(", ")+(rated.length<q.parts.length?", others not rated":""):"Not rated")};box.appendChild(g2);tray.appendChild(box)}
 else if(q.kind=="swipe")deck(q);
 else if(q.chips)q.chips.forEach(function(c){chip(c,function(){answer(q,c=="Skip"?"Skipped":c)})});
 stick();if(!form.hidden&&matchMedia("(hover:hover)").matches)inp.focus({preventScroll:true})}
function deck(q){var st={},box=el("div","kit"),leg=el("p","klegend");leg.innerHTML='<span class="kl like">Would like</span><span class="kl must">Must have</span><span class="kl">Tap again to clear</span>';tray.appendChild(leg);
 var L={"":"","like":"Would like","must":"Must have"};
 q.items.forEach(function(it){var b=el("button","ktile");b.type="button";b.setAttribute("data-k",it);b.setAttribute("aria-pressed","false");var nm=el("b",null,it),tg=el("i","ktag","");b.appendChild(nm);b.appendChild(tg);
  b.onclick=function(){var v=st[it]||"",nx=v==""?"like":v=="like"?"must":"";if(nx)st[it]=nx;else delete st[it];b.setAttribute("data-s",nx);b.setAttribute("aria-pressed",nx?"true":"false");b.setAttribute("aria-label",it+(nx?", "+L[nx]:""));tg.textContent=L[nx]};box.appendChild(b)});
 tray.appendChild(box);var d=el("button","chip go kdone","Done");d.type="button";d.onclick=function(){var must=q.items.filter(function(x){return st[x]=="must"}),like=q.items.filter(function(x){return st[x]=="like"});answer(q,"Must have: "+(must.join(", ")||"none")+". Would like: "+(like.join(", ")||"none")+".")};tray.appendChild(d)}
function chip(t,f){var b=el("button","chip",t);b.type="button";b.onclick=f;tray.appendChild(b);return b}
function rescue(q){tray.innerHTML="";bot(miss>=3?"No stress at all. Tap an option, skip this one, or if you'd rather, message Dan directly.":"No stress, just tap one of these or skip it and we'll keep going.",function(){(q.chips||q.choices||[]).forEach(function(c){if(c!="Skip")chip(c,function(){answer(q,c)})});chip("Skip",function(){answer(q,"Skipped")});if(miss<3)return;var w=el("a","chip wa","WhatsApp Dan");w.href=O.waLink(A,Q);w.target="_blank";w.rel="noopener";tray.appendChild(w)})}
form.onsubmit=function(e){e.preventDefault();if(busy)return;var q=Q[i],s=inp.value;if(!q||!s.trim())return;var t=s.trim();
 if(/^(skip|pass|skip it|next)$/i.test(t)&&(q.chips||[]).indexOf("Skip")>=0){answer(q,"Skipped",t);return}
 var r0=q.id=="name"?null:O.check(q,s),st=(r0&&r0.ok)?null:R.smalltalk(t);if(st&&!(q.id=="name"&&/^call me\b/i.test(t))){me(t);inp.value="";if(st.note){A._notes=(A._notes||[]).concat([t]);O.save(A);progress()}bots([st.say,q.re||fill(q.say)],function(){render(q)});return}
 var r=O.check(q,s);
 if(r.ok){answer(q,r.val,t);return}
 me(t);inp.value="";miss++;bot(O.reply(q,r),function(){if(miss>=2)rescue(q);else render(q)})};
var rsb=document.getElementById("restart"),rst=0;rsb.onclick=function(){if(Date.now()-rst<4000){O.clear();location.reload();return}rst=Date.now();rsb.textContent="Tap again to clear";rsb.classList.add("warn");setTimeout(function(){if(Date.now()-rst>=3900){rsb.textContent="Start again";rsb.classList.remove("warn")}},4000)};
window.SDChat={cur:function(){return Q[i]?Q[i].id:'end'},answers:function(){return A},questions:Q,wa:function(){return O.waLink(A,Q)}};
progress();if(A._i){i=A._i;next("Welcome back"+(A.name&&A.name!="Skipped"?", "+A.name:"")+"! I've kept your answers, let's carry on.")}else next();
})();
