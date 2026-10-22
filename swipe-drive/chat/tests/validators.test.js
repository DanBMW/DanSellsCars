/* Run with: node swipe-drive/chat/tests/validators.test.js */
var path=require("path");global.window=global;require(path.join(__dirname,"..","onboard-core.js"));var O=global.Onboard,f=0,p=0;
function t(q,input,ok,val){var r=O.check(q,input);if(!!r.ok===ok&&(val==null||r.val===val))p++;else{f++;console.log("FAIL",JSON.stringify(input),"expected",ok,val,"got",JSON.stringify(r))}}
var miles={id:"miles",type:"miles"},annual={id:"annual",type:"annual"},settle={id:"settle",type:"settle",fn:O.V.pounds(0,150000)},cur={id:"curMonthly",type:"cur",fn:O.V.pounds(0,3000)},phone={id:"phone",type:"phone",chips:["Rather not say"]},name={id:"name",type:"name",optional:false,chips:["Skip"]};
t(miles,"-5",false);t(miles,"-5 miles",false);t(miles,"minus 5000",false);t(miles,"45k",true,"45,000 miles");t(miles,"forty five thousand",true,"45,000 miles");
t(settle,"£-100",false);t(settle,"-£100",false);t(settle,"- 8000",false);t(settle,"about 8k",true,"About £8,000");t(settle,"eight grand",true,"£8,000");
t(cur,"−350",false);t(cur,"£350",true,"£350");t(annual,"-10000",false);t(annual,"10000",true,"10,000 a year");
t(phone,"01234567890",false);t(phone,"020 7946 0958",false);t(phone,"07700 900123",true,"07700900123");t(phone,"+44 7700 900123",true,"07700900123");t(phone,"447700900123",true,"07700900123");t(phone,"+44 (0)7700 900123",true,"07700900123");t(phone,"12345",false);
var r=O.check(phone,"01234567890");if(O.reply(phone,r).indexOf("07")<0){f++;console.log("FAIL landline reply should ask for 07")}else p++;
t(name,"Sam",true,"Sam");t(name,"A".repeat(60),false);t(name,"Bartholomewwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",false);
t({id:"pay",kind:"single",choices:["Monthly finance","Lease","Cash","Not sure yet"]},"dunno",true,"Not sure yet");t({id:"pay",kind:"single",choices:["Monthly finance","Lease","Cash","Not sure yet"]},"banana",false);
console.log(p+" passed, "+f+" failed");process.exit(f?1:0);
