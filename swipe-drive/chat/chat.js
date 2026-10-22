(function(){
var O=window.Onboard,P=O.V.pounds;
var Q=[
 {id:"name",short:"Name",type:"name",say:"Hi, I'm Revvy, Dan's Swipe Drive assistant bot. I need to learn a little about you and your requirements before I can show you what is available. First up, what should I call you?",re:"What should I call you?",optional:false,chips:["Skip"]},
 {id:"model",short:"Model I like",type:"model",say:"Nice to meet you{nm}! Which BMW has caught your eye?",chips:["X1","3 Series","X3","i4","Not sure yet"]},
 {id:"why",short:"What I like",kind:"multi",say:"What matters most to you? Tap as many as you like.",choices:["Comfort","Space for family","Low running costs","Performance","Tech","Electric","Looks","Reliability"]},
 {id:"cur",short:"Current car",type:"anycar",say:"What are you driving at the moment?",ex:"Something like 2019 Audi A3 diesel, or just the make and model.",chips:["No current car","Not sure"]},
 {id:"reg",short:"Reg",type:"reg",say:"Do you know the reg? Totally fine to skip.",chips:["Skip"],skipIf:function(a){return a.cur=="No current car"}},
 {id:"miles",short:"Mileage",type:"miles",say:"Roughly how many miles has it done?",chips:["Under 20k","20k to 50k","50k to 80k","Over 80k","Not sure"],skipIf:function(a){return a.cur=="No current car"}},
 {id:"cond",short:"Condition",kind:"rate",say:"Be honest, how is it looking? Tap a rating for each.",parts:["Bodywork","Interior","Tyres","Service history"],skipIf:function(a){return a.cur=="No current car"}},
 {id:"settle",short:"Finance settlement",fn:P(0,150000),type:"settle",ex:"A rough figure is spot on, like £8,000 or about 8k. Paid off is fine too.",say:"Is there finance left on it? A rough settlement figure is perfect.",chips:["Paid off","Not sure"],skipIf:function(a){return a.cur=="No current car"}},
 {id:"curMonthly",short:"Current monthly",fn:P(0,3000),type:"cur",ex:"Something like £350 a month.",say:"And what do you pay a month now?",chips:["None","Not sure"]},
 {id:"annual",short:"Annual mileage",type:"annual",say:"How many miles do you do a year, roughly?",chips:["Under 6k","6k to 10k","10k to 15k","Over 15k"]},
 {id:"pay",short:"Paying by",kind:"single",say:"How are you thinking of paying?",choices:["Monthly finance","Lease","Cash","Not sure yet"]},
 {id:"budget",short:"Monthly budget",kind:"slider",min:150,max:1500,step:25,val:400,fmt:function(v){return "£"+v+" a month"},say:"Slide to a monthly budget you'd be comfy with.",skipIf:function(a){return a.pay=="Cash"}},
 {id:"stretch",short:"Stretch budget",kind:"slider",stretchOf:"budget",max:2000,step:25,fmt:function(v){return "£"+v+" a month"},say:"Imagine Dan found you the perfect car, ticking every single box of your needs. What would your budget be then?",skipIf:function(a){return a.pay=="Cash"}},
 {id:"cash",short:"Cash budget",kind:"slider",min:5000,max:120000,step:1000,val:30000,fmt:function(v){return "Up to £"+v.toLocaleString("en-GB")},say:"Slide to your top cash budget.",skipIf:function(a){return a.pay!="Cash"}},
 {id:"stretchCash",short:"Stretch budget",kind:"slider",stretchOf:"cash",max:150000,step:1000,fmt:function(v){return "Up to £"+v.toLocaleString("en-GB")},say:"Imagine Dan found you the perfect car, ticking every single box of your needs. What would your budget be then?",skipIf:function(a){return a.pay!="Cash"}},
 {id:"dep",short:"Deposit",fn:P(0,100000),type:"cur",ex:"Something like £2,000, or none.",say:"Any cash deposit to put in?",chips:["None","Not sure"],skipIf:function(a){return a.pay=="Cash"}},
 {id:"colour",short:"Colour",kind:"colour",say:"Pick a colour you'd love. Tap one.",choices:[["Alpine White","#f4f4f2"],["Black Sapphire","#111318"],["Brooklyn Grey","#7d8288"],["Portimao Blue","#1f4fa8"],["Fire Red","#a3161c"],["Skyscraper Grey","#a7adb3"],["Any colour","conic-gradient(#f44,#fc3,#3c6,#39f,#a4f,#f44)"]]},
 {id:"specs",short:"Spec",kind:"swipe",say:"Now the fun bit! Swipe through some kit. Left for no, right for would like, up for must have.",items:["Head up display","Leather or synthetic leather seats","Pro pack","Comfort access","Panoramic roof","Electric seats","Heated seats","Heated steering wheel","M Sport package","Harman Kardon sound","360 parking camera","Adaptive cruise control","Driving assistant","Towbar","7 seats","Larger alloys","Electric tailgate","Wireless charging","Ambient lighting","Plug in hybrid or electric"]},
 {id:"when",short:"When",type:"date",say:"When are you hoping to change?",chips:["ASAP","Next month","In 3 months","Just looking"]},
 {id:"phone",short:"Mobile",type:"phone",say:"Last bit! What's the best mobile for Dan to reach you on?",chips:["Rather not say"]}
];
var A=O.load()||{},i=0,miss=0,log=document.getElementById("log"),form=document.getElementById("form"),inp=document.getElementById("inp"),tray=document.getElementById("tray"),car=document.getElementById("car"),wa=document.getElementById("wa");
function el(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h!=null)e.textContent=h;return e}
var FAST=/[?&]fast\b/.test(location.search),busy=0,R=window.Revvy;
function bot(t,cb){busy++;var ms=FAST?30:Math.min(1400,350+t.length*12);R.typing(log,ms,function(){var b=el("div","msg bot",t);log.appendChild(b);b.scrollIntoView({block:"end",behavior:"smooth"});busy--;cb&&cb()})}
function bots(a,cb){a=a.filter(Boolean);if(!a.length)return cb&&cb();bot(a[0],function(){bots(a.slice(1),cb)})}
function me(t){var b=el("div","msg me",t);log.appendChild(b);b.scrollIntoView({block:"end"})}
function fill(s){var ok=A.name&&A.name!="Skipped"&&A.name!="Not sure";return s.replace("{nm}",ok?", "+A.name:"").replace("{name}",ok?A.name:"there")}
function progress(){var tot=Q.filter(function(q){return !(q.skipIf&&q.skipIf(A))}).length,done=Object.keys(A).filter(function(k){return k.charAt(0)!="_"}).length;var p=Math.min(1,done/tot);car.style.left="calc("+(p*100)+"% - "+(p*34)+"px)";document.getElementById("pct").textContent=Math.round(p*100)+"%";wa.href=O.waLink(A,Q)}
function answer(q,val,shown){if(busy)return;tray.innerHTML="";me(shown||val);inp.value="";A[q.id]=val;i++;A._i=i;miss=0;O.save(A);progress();var rx=R.react(q,val,A);next(rx)}
function next(pre){tray.innerHTML="";while(i<Q.length&&Q[i].skipIf&&Q[i].skipIf(A))i++;
 if(i>=Q.length){form.hidden=true;bots([pre,"That's everything"+fill("{nm}")+"! Tap the green button and your answers go straight to Dan on WhatsApp. He reads every one himself."],function(){var b=el("a","cta","Send to Dan on WhatsApp");b.href=O.waLink(A,Q,"Hi Dan, I've finished Swipe Drive:");b.target="_blank";b.rel="noopener";tray.appendChild(b);b.scrollIntoView({block:"end",behavior:"smooth"})});return}
 var q=Q[i];form.hidden=true;bots([pre,fill(q.say)],function(){render(q)})}
function render(q){tray.innerHTML="";form.hidden=!!(q.kind&&q.kind!="single");inp.value="";inp.placeholder=q.kind=="single"?"Tap or type":"Type your answer";
 if(q.kind=="single")q.choices.forEach(function(c){chip(c,function(){answer(q,c)})});
 else if(q.kind=="multi"){var sel=[];q.choices.forEach(function(c){var b=chip(c,function(){var k=sel.indexOf(c);k<0?sel.push(c):sel.splice(k,1);b.classList.toggle("on")})});var d=el("button","chip go","Done");d.onclick=function(){answer(q,sel.length?sel.join(", "):"No preference")};tray.appendChild(d)}
 else if(q.kind=="slider"){var mn=q.stretchOf?(A["_n_"+q.stretchOf]||Q.filter(function(z){return z.id==q.stretchOf})[0].val):q.min,v0=q.stretchOf?mn:q.val,w=el("div","slide"),o=el("div","sval",q.fmt(v0)),r=el("input");r.type="range";r.min=mn;r.max=Math.max(q.max,mn);r.step=q.step;r.value=v0;r.setAttribute("aria-label",q.short);r.oninput=function(){o.textContent=q.fmt(+r.value)};var g=el("button","chip go","That's me");g.onclick=function(){var v=+r.value;if(q.stretchOf&&v<mn){bot("That's a touch under your normal budget. Pop it at "+q.fmt(mn)+" or above.");return}A["_n_"+q.id]=v;answer(q,q.fmt(v))};w.appendChild(o);w.appendChild(r);w.appendChild(g);tray.appendChild(w)}
 else if(q.kind=="colour"){q.choices.forEach(function(c){var b=el("button","swatch");var s=el("span");s.style.background=c[1];b.appendChild(s);b.appendChild(el("em",null,c[0]));b.onclick=function(){answer(q,c[0])};tray.appendChild(b)})}
 else if(q.kind=="rate"){var res={},box=el("div","rates");q.parts.forEach(function(p){var row=el("div","rrow");row.appendChild(el("b",null,p));["Rough","OK","Good","Mint"].forEach(function(l){var b=el("button","chip sm",l);b.onclick=function(){res[p]=l;row.querySelectorAll("button").forEach(function(x){x.classList.remove("on")});b.classList.add("on")};row.appendChild(b)});box.appendChild(row)});var g2=el("button","chip go","Done");g2.onclick=function(){var rated=q.parts.filter(function(p){return res[p]});answer(q,rated.length?rated.map(function(p){return p+" "+res[p]}).join(", ")+(rated.length<q.parts.length?", others not rated":""):"Not rated")};box.appendChild(g2);tray.appendChild(box)}
 else if(q.kind=="swipe")deck(q);
 else if(q.chips)q.chips.forEach(function(c){chip(c,function(){answer(q,c=="Skip"?"Skipped":c)})});
 setTimeout(function(){(form.hidden?tray:form).scrollIntoView({block:"end"});if(!form.hidden)inp.focus()},50)}
function deck(q){var k=0,must=[],like=[],box=el("div","deck"),hint=el("p","dhint","Left for no, right for would like, up for must have"),btns=el("div","dbtns");tray.appendChild(box);tray.appendChild(btns);
 var finished=false;function fin(){if(finished)return;finished=true;var j=k+(busyCard?1:0);while(queue.length&&j<q.items.length){var v=queue.shift(),it=q.items[j];if(v=="must")must.push(it);else if(v=="like")like.push(it);j++}k=q.items.length;answer(q,"Must have: "+(must.join(", ")||"none")+". Would like: "+(like.join(", ")||"none")+".")}
 function show(){box.innerHTML="";if(k>=q.items.length)return fin();var c=el("div","dcard");c.appendChild(el("span","dcount",(k+1)+" of "+q.items.length));c.appendChild(el("b",null,q.items[k]));if(k==0)c.appendChild(hint);var st=el("i","dstamp");c.appendChild(st);box.appendChild(c);
  var x0=0,y0=0,dx=0,dy=0,down=false;
  c.addEventListener("pointerdown",function(e){down=true;x0=e.clientX;y0=e.clientY;dx=dy=0;c.setPointerCapture(e.pointerId);c.style.transition="none"});
  c.addEventListener("pointermove",function(e){if(!down)return;dx=e.clientX-x0;dy=e.clientY-y0;c.style.transform="translate("+dx+"px,"+dy+"px) rotate("+dx/18+"deg)";st.textContent=dy<-50&&Math.abs(dy)>Math.abs(dx)?"MUST HAVE":dx>40?"WOULD LIKE":dx<-40?"NO":"";st.className="dstamp"+(st.textContent?" on":"")});
  c.addEventListener("pointerup",function(){if(!down)return;down=false;c.style.transition="";
   if(dy<-80&&Math.abs(dy)>Math.abs(dx))return go("must");if(dx>80)return go("like");if(dx<-80)return go("no");
   c.style.transform="";st.className="dstamp";if(Math.abs(dx)<8&&Math.abs(dy)<8){var t=Date.now();if(t-lastTap<350){lastTap=0;go("must")}else lastTap=t}});
  c.addEventListener("dblclick",function(e){e.preventDefault()})}
 var busyCard=false,queue=[],lastTap=0;function go(v){if(busyCard){if(queue.length<q.items.length)queue.push(v);return}if(k>=q.items.length)return;busyCard=true;var c=box.firstChild,it=q.items[k];if(v=="must"){must.push(it);var b=el("div","dburst","⭐ Must have");c.appendChild(b);c.classList.add("dmh")}else if(v=="like")like.push(it);
  if(v=="must"){c.style.transition="transform .3s ease";c.style.transform="scale(1.06)";setTimeout(function(){c.style.transition="transform .3s ease,opacity .3s";c.style.transform="translateY(-30%) scale(.9)";c.style.opacity="0"},380)}else{c.style.transition="transform .35s ease,opacity .35s";c.style.transform=v=="no"?"translateX(-140%) rotate(-18deg)":"translateX(140%) rotate(18deg)";c.style.opacity="0"}
  setTimeout(function(){busyCard=false;if(finished)return;k++;show();if(queue.length&&k<q.items.length)go(queue.shift())},v=="must"?720:360)}
 [["No","no"],["Would like","like"],["Must have","must"]].forEach(function(b){var e=chip(b[0],function(){go(b[1])});e.classList.add("d"+b[1]);btns.appendChild(e)});var sk=chip("That's enough kit",fin);btns.appendChild(sk);show()}
function chip(t,f){var b=el("button","chip",t);b.type="button";b.onclick=f;tray.appendChild(b);return b}
function rescue(q){tray.innerHTML="";bot(miss>=3?"No stress at all. Tap an option, skip this one, or if you'd rather, message Dan directly.":"No stress, just tap one of these or skip it and we'll keep going.",function(){(q.chips||q.choices||[]).forEach(function(c){if(c!="Skip")chip(c,function(){answer(q,c)})});chip("Skip",function(){answer(q,"Skipped")});if(miss<3)return;var w=el("a","chip wa","WhatsApp Dan");w.href=O.waLink(A,Q);w.target="_blank";w.rel="noopener";tray.appendChild(w)})}
form.onsubmit=function(e){e.preventDefault();if(busy)return;var q=Q[i],s=inp.value;if(!q||!s.trim())return;var t=s.trim();
 if(/^(skip|pass|skip it|next)$/i.test(t)&&(q.chips||[]).indexOf("Skip")>=0){answer(q,"Skipped",t);return}
 var r0=q.id=="name"?null:O.check(q,s),st=(r0&&r0.ok)?null:R.smalltalk(t);if(st&&!(q.id=="name"&&/^call me\b/i.test(t))){me(t);inp.value="";if(st.note){A._notes=(A._notes||[]).concat([t]);O.save(A);progress()}bots([st.say,q.re||fill(q.say)],function(){render(q)});return}
 var r=O.check(q,s);
 if(r.ok){answer(q,r.val,t);return}
 me(t);inp.value="";miss++;bot(O.reply(q,r),function(){if(miss>=2)rescue(q);else render(q)})};
var rsb=document.getElementById("restart"),rst=0;rsb.onclick=function(){if(Date.now()-rst<4000){O.clear();location.reload();return}rst=Date.now();rsb.textContent="Tap again to clear";rsb.classList.add("warn");setTimeout(function(){if(Date.now()-rst>=3900){rsb.textContent="Start again";rsb.classList.remove("warn")}},4000)};
window.SDChat={cur:function(){return Q[i]?Q[i].id:'end'},answers:function(){return A}};
progress();if(A._i){i=A._i;next("Welcome back"+(A.name&&A.name!="Skipped"?", "+A.name:"")+"! I've kept your answers, let's carry on.")}else next();
})();
