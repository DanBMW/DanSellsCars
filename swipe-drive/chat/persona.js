/* Revvy: Dan's SwipeToDrive assistant bot. Free, rule based, runs in the browser. Never quotes prices, discounts or finance. */
(function(g){
var n=0;function pick(a){return a[(n++)%a.length]}
function num(s){var m=String(s).replace(/,/g,"").match(/(\d+(?:\.\d+)?)\s*(k)?/i);return m?parseFloat(m[1])*(m[2]?1000:1):null}
var DAN="I'll pass that to Dan and he'll answer it when he gets your details. For now, let's carry on.";
var ST=[
 [/^(hi|hello|hey|hiya|yo|alright|morning|afternoon|evening|good (morning|afternoon|evening))\b[!.? ]*$/i,["Hello!","Hiya, lovely to have you here.","Hey there!"]],
 [/\bhow (are|r) (you|u)\b|how'?s it going|you ok\b|you alright/i,["Running smoothly, thanks for asking! Full tank and all.","Very well thank you, just had my oil checked.","Top form, ta. Ready when you are."]],
 [/\b(who are you|what are you|your name|what('?s| is) your name)\b/i,["I'm Revvy, Dan's assistant bot here at SwipeToDrive. I gather the basics so Dan can find you the right car.","Revvy's the name. I'm a friendly bot that helps Dan get to know what you're after."]],
 [/\bare (you|u) (a |an )?(bot|robot|ai|real|human|person)\b|\bis this (a )?(bot|real person|human)\b|\btalking to a (bot|robot|person|human)\b/i,["Honest answer: yes, I'm a bot. Dan's assistant, to be precise. Dan sees everything you tell me and picks it up personally.","I am a bot, but a well meaning one! Dan reads every answer and takes it from there."]],
 [/^(thanks|thank you|cheers|ta|nice one|lovely|great|brilliant|awesome|perfect)\b[!. ]*$/i,["You're welcome!","Pleasure.","Any time."]],
 [/^(lol|haha+|ha+|lmao|😂|🤣)[!. ]*$/i,["Glad I'm amusing someone!","I'll be here all week. Try the veal."]],
 [/\b(tell me a joke|joke|make me laugh)\b/i,["Why did the car get a promotion? It was always driven.","I'd tell you a joke about a clutch, but you might not get the gist of it.","What do you call a sleepy BMW? A Beemer in REM."]],
 [/\b(weather|football|pizza|recipe|bitcoin|crypto|politics|lottery|homework|song|movie|film)\b/i,["I'm strictly a car bot, I'm afraid. I'd only get it wrong!","Ha, that's outside my lane. I only know cars."]],
 [/\b(part ?ex|trade ?in|value my car|car worth|worth on|valuation)\b/i,["Dan will value your car properly, I won't guess. The answers you give me help him do that, and I'll pass your question on."]],
 [/\b(price|cost|how much|discount|deal|offer|cheaper|apr|interest|finance rate|pcp|hp deal|lease deal|monthly payment|deposit contribution)\b/i,["I won't guess at prices, deals or finance figures, that's Dan's job and he'll be exact. "+DAN,"Good question, but I'd rather not make up numbers. "+DAN]],
 [/\b(test drive|book a drive|viewing|appointment|open(ing)? (hours|times)|when are you open|address|where are you|located)\b/i,["Dan sorts test drives and visits himself. "+DAN]],
 [/\b(in stock|available|have you got|do you have|show me|see (the )?cars|what cars|just show|skip (this|these|the questions))\b/i,["I need to learn a little about you and your requirements before I can show you what is available. It's quick, promise!","Not long now! I need to learn a little about you and your requirements before I can show you what is available."]],
 [/\b(human|real person|speak to (dan|someone)|talk to (dan|someone)|call me)\b/i,["Of course, Dan will be in touch personally. Let's finish these few questions first so he has everything he needs, I'll pass that request on."]],
 [/\b(privacy|data|gdpr|spam|sell my (data|details))\b/i,["Your answers go to Dan only, to help find your car. No spam from me."]]
];
var NOTE=/pass (that|your question|that request)/;function smalltalk(s){s=(s||"").trim();for(var k=0;k<ST.length;k++)if(ST[k][0].test(s)){var r=pick(ST[k][1]);return {say:r,note:NOTE.test(r)}}return null}
var MOD={"1 Series":"The 1 Series, a cracking little hot hatch.","2 Series":"The 2 Series, fun on a Sunday road.","3 Series":"The 3 Series, a classic for good reason.","4 Series":"The 4 Series, very stylish choice.","5 Series":"The 5 Series, proper executive comfort.","7 Series":"The 7 Series! Ooh, first class.","8 Series":"The 8 Series, now that's a statement.","X1":"The X1, a brilliant all rounder.","X2":"The X2, sporty with a bit of attitude.","X3":"The X3, a family favourite.","X5":"The X5, plenty of room and presence.","X7":"The X7, the full luxury lounge.","i4":"The i4, smooth and silent.","i5":"The i5, electric executive, very nice.","i7":"The i7, peak electric luxury.","iX":"The iX, properly futuristic.","iX1":"The iX1, compact and electric.","Z4":"The Z4! Roof down weather, hopefully.","XM":"The XM, not one for blending in."};
var COL={"Alpine White":"Alpine White, crisp and clean.","Black Sapphire":"Black Sapphire, sleek. Keep a chamois handy!","Brooklyn Grey":"Brooklyn Grey, very on trend.","Portimao Blue":"Portimao Blue, a real head turner.","Fire Red":"Fire Red, nobody will miss you coming.","Skyscraper Grey":"Skyscraper Grey, understated and classy.","Any colour":"Open minded, love it. More cars to choose from."};
function react(q,v,A){v=String(v||"");if(q.id=="name")return null;if(/^(Skipped|Not sure|Not sure yet|No preference|Rather not say)$/.test(v))return q.id=="phone"?"No problem at all, WhatsApp works just as well.":pick(["No problem.","That's fine, Dan can fill that in.","Fair enough."]);
 switch(q.id){
 case "name":return null; /* the next question already says nice to meet you */
 case "model":if(/^M\d|X\d M$/.test(v))return "Ooh, an M car. I can hear it from here!";return MOD[v]||(v=="Not sure yet"?"No problem at all, that's exactly what SwipeToDrive is for.":"Good shout.");
 case "why":if(/Electric/.test(v))return "Electric, nice. Dan can talk you through charging too.";if(/Performance/.test(v))return "A driver after my own heart.";if(/family/i.test(v))return "Room for everyone, noted.";return "Noted, that helps a lot.";
 case "cur":if(v=="No current car")return "Fresh start, lovely.";if(/bmw|series|\bx\d|\bi\d/i.test(v))return "Ah, already one of the family!";if(/audi|merc|mercedes|vw|volkswagen|ford|vauxhall|toyota|tesla|volvo|kia|hyundai/i.test(v))return pick(["Ooh, thinking of switching sides?","Nice, we'll see if we can tempt you over."]);return "Got it.";
 case "reg":return "Thanks, that helps Dan look it up.";
 case "miles":var m=num(v);if(m==null)return "Noted.";if(m>100000)return "That car's seen a few sunsets! Well done.";if(m<20000)return "Barely run in!";return "Noted, thanks.";
 case "cond":var c=(v.match(/Mint/g)||[]).length,r=(v.match(/Rough/g)||[]).length;if(c>=3)return "Sounds immaculate.";if(r>=2)return "Thanks for being honest, Dan appreciates that.";return "Thanks, very helpful.";
 case "settle":return /£0|Paid off/.test(v)?"All paid off, nice and simple.":"Thanks, a rough figure is perfect.";
 case "curMonthly":return "Got it.";
 case "annual":var a=num(v);if(/Over 15k/.test(v)||a>15000)return "Big miles! You'll want something comfy.";if(/Under 6k/.test(v)||(a!=null&&a<6000))return "Low miles, nice and easy going.";return "Noted.";
 case "pay":return v=="Cash"?"Cash, nice and straightforward.":v=="Not sure yet"?"No problem, Dan can explain the options.":"Got it, Dan will go through the details with you.";
 case "budget":case "cash":return "Lovely. Dan will work to that and won't push you past it.";
 case "stretch":case "stretchCash":return pick(["Good to know. Dan will always start with your normal budget.","That just helps Dan know what is possible. No pressure."]);
 case "specs":var mh=(v.match(/Must have: ([^.]*)\./)||[])[1];return mh&&mh!="none"?"Must haves noted, Dan will keep those front of mind.":"Lovely, nice and flexible.";
 case "dep":return "Thanks.";
 case "colour":if(v.indexOf(",")>0)return "Lovely, "+v.split(",").length+" colours noted. More choice means more cars to pick from.";return COL[v]||"Nice choice.";
 case "when":if(/asap|now|today|this week/i.test(v))return "Pedal to the metal, I like it!";if(/just looking/i.test(v))return "Browsing is fine, no pressure at all.";return "Lovely, plenty of time to find the right one.";
 case "phone":return "Perfect, Dan will only use that about your car.";
 }return null}
function typing(log,ms,cb){var t=document.createElement("div");t.className="msg bot typing";t.setAttribute("aria-label","Revvy is typing");t.innerHTML="<i></i><i></i><i></i>";log.appendChild(t);g.SDStick&&g.SDStick();setTimeout(function(){t.remove();cb()},ms)}
g.Revvy={smalltalk:smalltalk,react:react,typing:typing,name:"Revvy"};
})(window);
