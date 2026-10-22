/* Swipe Drive chat: questions, storage and a free client side relevance checker. No network calls. */
(function(g){
var MODELS=["1 Series","2 Series","2 Series Gran Coupe","2 Series Active Tourer","3 Series","3 Series Touring","4 Series","4 Series Gran Coupe","5 Series","5 Series Touring","7 Series","8 Series","X1","X2","X3","X4","X5","X6","X7","XM","Z4","i4","i5","i7","iX","iX1","iX2","iX3","M2","M3","M4","M5","M8","X3 M","X5 M","Mini","Not sure yet"];
var OTHER_MAKES=["audi","mercedes","merc","vw","volkswagen","ford","vauxhall","toyota","nissan","kia","hyundai","tesla","volvo","skoda","seat","peugeot","renault","honda","mazda","lexus","jaguar","land rover","range rover","porsche","fiat","citroen","mini","polestar","cupra","mg","byd","dacia","suzuki","jeep"];
var PROF=/\b(f+u+c+k+|sh[i1]t|c+u+n+t|bollocks|wank|twat|prick|bastard|piss off|arse|dick)\w*/i;
var OFFTOPIC=/\b(weather|football|pizza|recipe|joke|who are you|are you (a )?(bot|robot|ai|real)|what time|bitcoin|crypto|politics|lottery|homework|song|movie|film)\b/i;
var UNSURE=/^(not sure|unsure|dunno|don'?t know|idk|no idea|maybe|not really sure|no clue|pass|rather not say|prefer not to say|skip)\b/i;
function lev(a,b){a=a.toLowerCase();b=b.toLowerCase();var m=[],i,j;for(i=0;i<=b.length;i++)m[i]=[i];for(j=0;j<=a.length;j++)m[0][j]=j;for(i=1;i<=b.length;i++)for(j=1;j<=a.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[j-1]==b[i-1]?0:1));return m[b.length][a.length]}
function gibberish(s){var t=s.toLowerCase().replace(/[^a-z]/g,"");if(!t)return false;
 if(/(.)\1{3,}/.test(t))return true;
 if(/^(asdf|qwer|zxcv|hjkl|jkl|sdfg|dfgh|fghj|ghjk|uiop|wert|ertyu|lkj|poiu|mnb)/.test(t)&&t.length>=4)return true;
 if(t.length>=6&&!/[aeiouy]/.test(t))return true;
 if(/[^aeiouy\s]{6,}/.test(s.toLowerCase().replace(/[^a-z\s]/g,"")))return true;
 return false}
function money(s){var x=s.toLowerCase().replace(/,/g,"").replace(/£|gbp|pounds?|quid/g," ");
 var m=x.match(/(\d+(?:\.\d+)?)\s*(k|grand|thousand)?/);if(!m)return null;var v=parseFloat(m[1]);if(m[2])v*=1000;return Math.round(v)}
var V={
 name:function(s){var t=s.trim().replace(/^(i'?m|it'?s|my name is|call me|name'?s)\s+/i,"");if(!/^[a-z][a-z' .]{0,30}$/i.test(t))return {ok:0,why:"name"};if(t.split(/\s+/).length>3)return {ok:0,why:"name"};return {ok:1,val:t.replace(/\b\w/g,function(c){return c.toUpperCase()})}},
 model:function(s){var t=" "+s.toLowerCase().replace(/\bbmw\b/g," ").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim()+" ";
  var W={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8};t=t.replace(/ (a|an|the|please|new|used|i|like|want|fancy|probably|maybe|prob|think|id|love|the new) /g," ").replace(/ (a|an|the|please|new|used|i|like|want|fancy|probably|maybe|prob|think|id|love) /g," ");t=t.replace(/ (one|two|three|four|five|six|seven|eight) /g,function(m,w){return " "+W[w]+" "});t=t.trim();
  if(/^(not sure|unsure|dunno|no idea|don t know|any|anything)( yet)?$/.test(t))return {ok:1,val:"Not sure yet"};
  var m;
  /* X models, with optional M or M Performance suffix: x5 m, x5m, x5 m50, x3 m40d */
  if(m=t.match(/^x\s?([1-7])\s?(m\d{0,2}[a-z]?)?\b/)){var xm=m[2];if(xm=="m"&&(m[1]=="3"||m[1]=="5"))return {ok:1,val:"X"+m[1]+" M"};return {ok:1,val:"X"+m[1]}}
  if(/^xm\b/.test(t))return {ok:1,val:"XM"};
  if(/^z\s?4\b/.test(t))return {ok:1,val:"Z4"};
  if(m=t.match(/^i\s?x\s?([123])\b/))return {ok:1,val:"iX"+m[1]};
  if(/^i\s?x\b/.test(t))return {ok:1,val:"iX"};
  if(m=t.match(/^i\s?([457])\b/))return {ok:1,val:"i"+m[1]};
  /* M cars: m2 m3 m4 m5 m8, but m340i or m135i are M Performance versions of the series */
  if(m=t.match(/^m\s?([1-8])(\d\d)[a-z]*\b/))return {ok:1,val:m[1]+" Series"};
  if(m=t.match(/^m\s?([23458])\b/))return {ok:1,val:"M"+m[1]};
  /* engine codes like 320d, 118i, 530e */
  if(m=t.match(/^([1-8])\d\d\s?[a-z]{0,2}\b/)){var se=m[1];if(se=="6")return {ok:0,why:"model"};var tail=t.slice(m[0].length);if(/touring|estate/.test(tail)&&/^[35]$/.test(se))return {ok:1,val:se+" Series Touring"};if(/gran coupe|gc\b/.test(tail)&&/^[24]$/.test(se))return {ok:1,val:se+" Series Gran Coupe"};return {ok:1,val:se+" Series"}}
  /* 1 series, 3er, 3 series touring, 2 series gran coupe, active tourer */
  if(m=t.match(/^([1-8])\s?(series|ser|er|seris|serise)?\b(.*)$/)){var n=m[1],rest=m[3]||"";if(n=="6")return {ok:0,why:"model"};
   if(/gran coupe|gc\b/.test(rest)&&/^[24]$/.test(n))return {ok:1,val:n+" Series Gran Coupe"};if(/active|tourer/.test(rest)&&n=="2")return {ok:1,val:"2 Series Active Tourer"};if(/touring|estate/.test(rest)&&/^[35]$/.test(n))return {ok:1,val:n+" Series Touring"};
   if(m[2]||!rest.trim())return {ok:1,val:n+" Series"}}
  if(/^mini\b/.test(t))return {ok:1,val:"Mini"};
  /* word only fuzzy match, never across different digits */
  var best=null,bd=99,dig=(t.match(/\d/g)||[]).join("");
  MODELS.forEach(function(mo){var ml=mo.toLowerCase();if((ml.match(/\d/g)||[]).join("")!==dig)return;var d=lev(t,ml);if(d<bd){bd=d;best=mo}});
  if(best&&bd<=Math.max(1,Math.floor(best.length/4)))return {ok:1,val:best,fixed:bd>0};
  var mk=OTHER_MAKES.filter(function(k){return new RegExp("\\b"+k+"\\b").test(t)})[0];
  if(mk)return {ok:0,why:"othermake",hint:mk};return {ok:0,why:"model"}},
 anycar:function(s){if(new RegExp("\\b("+OTHER_MAKES.join("|")+")\\b","i").test(s))return {ok:1,val:s.trim()};var r=V.model(s);if(r.ok)return {ok:1,val:/\b(19|20)\d{2}\b|diesel|petrol|hybrid|electric|touring|auto|manual|\bbmw\b/i.test(s)?s.trim():r.val};if(r.why=="othermake")return {ok:1,val:s.trim()};
  if(/\b(19|20)\d{2}\b|\b\d\.\d\b|\b(diesel|petrol|hybrid|electric|estate|hatch|saloon|suv|coupe)\b/i.test(s))return {ok:1,val:s.trim()};
  if(/^(none|nothing|no car|don'?t have one|no)$/i.test(s.trim()))return {ok:1,val:"No current car"};return {ok:0,why:"car"}},
 reg:function(s){var t=s.toUpperCase().replace(/\s+/g,"");
  if(/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(t)||/^[A-Z]\d{1,3}[A-Z]{3}$/.test(t)||/^[A-Z]{3}\d{1,3}[A-Z]$/.test(t)||/^[A-Z]{1,3}\d{1,4}$/.test(t)||/^\d{1,4}[A-Z]{1,3}$/.test(t))return {ok:1,val:t.length==7?t.slice(0,4)+" "+t.slice(4):t};return {ok:0,why:"reg"}},
 miles:function(s){if(/^(low|not many|hardly any)/i.test(s))return {ok:1,val:"Low, not sure exactly"};var v=money(s);if(v==null)return {ok:0,why:"num"};if(v<1||v>400000)return {ok:0,why:"range",lo:"1",hi:"400,000"};return {ok:1,val:v.toLocaleString("en-GB")+" miles"}},
 annual:function(s){var v=money(s);if(v==null)return {ok:0,why:"num"};if(/week/i.test(s))v*=52;else if(/month/i.test(s))v*=12;else if(/day/i.test(s))v*=365;if(v<500||v>60000)return {ok:0,why:"range",lo:"500",hi:"60,000"};return {ok:1,val:Math.round(v).toLocaleString("en-GB")+" a year"}},
 pounds:function(lo,hi){return function(s){if(/^(none|nothing|zero|no|0)$/i.test(s.trim()))return {ok:1,val:"£0"};if(/paid off|own it outright|no finance/i.test(s))return {ok:1,val:"£0 (no finance)"};var v=money(s);if(v==null)return {ok:0,why:"money"};if(v<lo||v>hi)return {ok:0,why:"range",lo:"£"+lo.toLocaleString("en-GB"),hi:"£"+hi.toLocaleString("en-GB")};return {ok:1,val:(/about|around|roughly|ish|approx/i.test(s)?"About ":"")+"£"+v.toLocaleString("en-GB")}}},
 yesno:function(s){if(/^(y|yes|yeah|yep|yup|sure|ok|okay|definitely|please|go on|aye)\b/i.test(s.trim()))return {ok:1,val:"Yes"};if(/^(n|no|nope|nah|not really|never)\b/i.test(s.trim()))return {ok:1,val:"No"};return {ok:0,why:"yesno"}},
 phone:function(s){var t=s.replace(/[\s()-]/g,"").replace(/^\+44/,"0").replace(/^0044/,"0");if(/^07\d{9}$/.test(t)||/^0[1-3]\d{8,9}$/.test(t))return {ok:1,val:t};return {ok:0,why:"phone"}},
 email:function(s){var t=s.trim();if(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(t))return {ok:1,val:t.toLowerCase()};return {ok:0,why:"email"}},
 postcode:function(s){var t=s.toUpperCase().replace(/\s+/g,"");if(/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(t))return {ok:1,val:t.slice(0,-3)+" "+t.slice(-3)};if(/^[A-Z]{1,2}\d[A-Z\d]?$/.test(t))return {ok:1,val:t};return {ok:0,why:"postcode"}},
 date:function(s){var t=s.toLowerCase();if(/\b(asap|now|today|tomorrow|this week|next week|this month|next month|few weeks|few months|couple of months|soon|no rush|just looking|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|spring|summer|autumn|winter|christmas|new year)\b/.test(t)||/\b\d{1,2}[\/.]\d{1,2}([\/.]\d{2,4})?\b/.test(t)||/\b\d+\s*(day|week|month|year)s?\b/.test(t))return {ok:1,val:s.trim()};return {ok:0,why:"date"}},
 text:function(s){return s.trim().length>=2?{ok:1,val:s.trim()}:{ok:0,why:"short"}}
};
function check(q,raw){var s=(raw||"").trim();
 if(!s)return {ok:0,why:"empty"};
 if(PROF.test(s))return {ok:0,why:"rude"};
 if(OFFTOPIC.test(s))return {ok:0,why:"offtopic"};
 if(UNSURE.test(s)){if(q.optional!==false)return {ok:1,val:q.type=="model"?"Not sure yet":"Not sure",unsure:1};return {ok:0,why:"need"}}
 if(/\?$/.test(s)&&!/^(y|n)/i.test(s))return {ok:0,why:"question"};
 if(gibberish(s)&&q.type!="reg"&&q.type!="postcode")return {ok:0,why:"gibberish"};
 var L=q.choices||q.chips;if(L){var low=s.toLowerCase(),hit=null,bd=99;L.forEach(function(c){c=Array.isArray(c)?c[0]:c;var cl=c.toLowerCase();if((cl.match(/\d/g)||[]).join("")!==(low.match(/\d/g)||[]).join(""))return;var d=cl==low?0:(low.length>3&&cl.indexOf(low)>=0)?0:lev(low,cl);if(d<bd){bd=d;hit=c}});if(bd==0||(bd<=2&&low.length>4))return {ok:1,val:hit}}
 var f=q.fn||V[q.type]||V.text;return f(s)}
var EX={name:"Just your first name is fine, like Sam.",model:"Something like X3, 3 Series or i4. Not sure is fine too.",othermake:"Lovely, though Swipe Drive is BMW only. Which BMW catches your eye? Something like X1 or 1 Series.",car:"Something like 2019 Audi A3 diesel, or just the make and model.",reg:"A UK reg looks like AB12 CDE.",num:"A number is perfect, like 32,000 or about 30k.",range:"That looks a bit outside what I'd expect. Something between {lo} and {hi}?",money:"A rough figure is spot on, like £300 or about 5k.",yesno:"Just yes or no is grand.",phone:"A UK mobile like 07700 900123.",email:"Something like name@example.com.",postcode:"Like DA14 6NF, or just the first half, DA14.",date:"Something like ASAP, next month or March.",short:"Give me a few words, no essay needed.",empty:"Pop an answer in, or tap one below.",need:"No worries if you're unsure, just a rough guess helps."};
var LEAD={gibberish:["Ha, I think the keyboard got that one.","Hmm, that looks like a cat walked on the phone.","I didn't quite catch that."],rude:["Fair enough, car shopping can be stressful! Let's keep it friendly.","I'll pretend I didn't see that one."],offtopic:["Good question for another day! I'm just here for your next car.","I'll leave that one to Google. Back to cars for a sec."],question:["Good question, Dan can answer that one properly on WhatsApp.","Dan will happily cover that. For now,"],def:["Hmm, that doesn't look quite right.","Not sure that fits this one.","I might be being slow, but that doesn't match.","Close, but not quite what I was after."]};
var n=0;function pick(a){return a[(n++)%a.length]}
function reply(q,r){var lead=pick(LEAD[r.why]||LEAD.def);var ex=EX[r.why]||q.ex||EX[q.type]||EX.short;if(r.why=="range")lead="";if(r.why=="othermake")return ex;ex=ex.replace("{lo}",r.lo||"").replace("{hi}",r.hi||"");
 if(/^(gibberish|rude|offtopic|question)$/.test(r.why))ex=(q.ex||EX[q.type]||EX.short);if(/,$/.test(lead))ex=ex.charAt(0).toLowerCase()+ex.slice(1);return (lead+" "+ex).trim()}
var KEY="sd_chat_answers_v1";
function save(o){try{localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}}
function load(){try{return JSON.parse(localStorage.getItem(KEY))||null}catch(e){return null}}
function clear(){try{localStorage.removeItem(KEY)}catch(e){}}
function waLink(ans,qs,intro){var lines=[intro||"Hi Dan, I started Swipe Drive. Here's what I've got so far:"];qs.forEach(function(q){if(ans[q.id]==null||q.stretchOf)return;var v=ans[q.id],st=qs.filter(function(z){return z.stretchOf==q.id})[0],f=function(n){return "£"+n.toLocaleString("en-GB")};if(st&&ans["_n_"+st.id]!=null&&ans["_n_"+q.id]!=null){v=ans["_n_"+st.id]>ans["_n_"+q.id]?f(ans["_n_"+q.id])+" to "+f(ans["_n_"+st.id])+(st.id=="stretch"?" a month":"")+" (normal, then stretch for the perfect car)":v+" (no stretch)"}lines.push(q.short+": "+v)});if(ans._notes&&ans._notes.length)lines.push("Questions for Dan: "+ans._notes.join(" / "));return "https://wa.me/447827138197?text="+encodeURIComponent(lines.join("\n"))}
g.Onboard={V:V,MODELS:MODELS,check:check,reply:reply,save:save,load:load,clear:clear,waLink:waLink,lev:lev};
})(typeof window!="undefined"?window:globalThis);
