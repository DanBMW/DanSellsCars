/* Run with: node swipe-drive/chat/tests/profile-save.test.js */
var path=require("path");global.window=global;require(path.join(__dirname,"..","onboard-core.js"));require(path.join(__dirname,"..","profile-save.js"));
var O=global.Onboard,C=global.ChatProfile,p=0,f=0;function ok(c,m){if(c)p++;else{f++;console.log("FAIL",m)}}
var CUR={id:"cur",type:"anycar",chips:["No current car","Not sure"]};
["no car","No car","none","I don't have one","dont have a car","don't own a car","first car","this will be my first car","not got one","haven't got one","between cars","nope","no current car"].forEach(function(s){var r=O.check(CUR,s);ok(r.ok&&r.val=="No current car","nocar "+s+" "+JSON.stringify(r))});
["2019 Audi A3","my first car was a golf, now a 2018 audi a4","bmw 320d","ford focus"].forEach(function(s){var r=O.check(CUR,s);ok(r.ok&&r.val!="No current car","car "+s+" "+JSON.stringify(r))});
/* WhatsApp: skipped questions and empty values never show */
var Q=[{id:"cur",short:"Current car"},{id:"curMonthly",short:"Current monthly",skipIf:function(a){return a.cur=="No current car"}},{id:"colour",short:"Colour"}];
var t=decodeURIComponent(O.waLink({cur:"No current car",curMonthly:"£300",colour:"Fire Red, Alpine White"},Q).split("text=")[1]);
ok(t.indexOf("Current monthly")<0,"wa shows monthly for no car");ok(t.indexOf("Colour: Fire Red, Alpine White")>=0,"wa colours");
t=decodeURIComponent(O.waLink({cur:"Audi",curMonthly:"",colour:"Any colour"},Q).split("text=")[1]);ok(!/Current monthly/.test(t),"wa empty line");
/* profile mapping */
var A={name:"Sam",model:"X3",cur:"No current car",curMonthly:"£300",annual:"6k to 10k",pay:"Monthly finance",_n_budget:400,_n_stretch:500,budget:"£400 a month",dep:"About £2,000",colour:"Fire Red",when:"ASAP",phone:"07700900123",_i:20,_notes:["test drive?"]};
var b=C.build(A,null,"sam@example.com");
ok(b.name=="Sam"&&b.phone=="07700900123"&&b.email=="sam@example.com","basic "+JSON.stringify(b));
ok(b.models[0]=="X3"&&b.annual_mileage==8000&&b.budget_type=="monthly"&&b.monthly_gbp==400&&b.deposit_gbp==2000,"money "+JSON.stringify(b));
ok(b.desk.cur_monthly===undefined&&b.desk.cur_car===undefined&&b.desk.chat.no_current_car===true,"no car desk");
ok(b.desk.when=="now"&&b.desk.chat.answers._i===undefined&&b.desk.chat.answers._n_budget==400&&b.desk.chat.answers._notes.length==1,"desk chat");
var b2=C.build({cur:"2019 Audi A3",curMonthly:"£350",pay:"Cash",_n_cash:30000,name:"Skipped",phone:"Rather not say"},{name:"Old",monthly_gbp:300,budget_type:"monthly",desk:{n_px:"keep me"}},"x@y.com");
ok(!("name" in b2)&&!("phone" in b2)&&!("budget_type" in b2)&&b2.cash_gbp==30000,"no overwrite "+JSON.stringify(b2));
ok(b2.desk.cur_car=="2019 Audi A3"&&b2.desk.cur_monthly==350&&b2.desk.n_px=="keep me","desk merge "+JSON.stringify(b2.desk));
var b3=C.build({curMonthly:"None",cur:"vw golf",dep:"£0",annual:"12,000 a year"},null,null);ok(b3.desk.cur_monthly===0&&b3.deposit_gbp===0&&b3.annual_mileage==12000,"zeros "+JSON.stringify(b3));
/* save: insert then update through a fake client */
function fake(existing){var calls=[];var api={from:function(t){var q={t:t,op:null};var o={select:function(){q.op="select";return o},eq:function(){return o},maybeSingle:function(){calls.push(q);return Promise.resolve({data:existing,error:null})},
 update:function(x){q.op="update";q.x=x;calls.push(q);return {eq:function(){return Promise.resolve({error:null})}}},insert:function(x){q.op="insert";q.x=x;calls.push(q);return Promise.resolve({error:null})}};return o}};api.calls=calls;return api}
var fs=fake(null);global.localStorage={s:{},getItem:function(k){return this.s[k]||null},setItem:function(k,v){this.s[k]=v},removeItem:function(k){delete this.s[k]}};C.markPending();
C.save(fs,{id:"u1",email:"a@b.co"},A).then(function(r){var ins=fs.calls.filter(function(c){return c.op=="insert"})[0];ok(r.created&&ins&&ins.x.user_id=="u1"&&ins.x.owner_staff_id===null&&ins.x.id,"insert row");ok(!C.pending(),"pending cleared");
 var fs2=fake({id:"c9",name:"Sam",desk:{}});return C.save(fs2,{id:"u1"},A).then(function(r2){var up=fs2.calls.filter(function(c){return c.op=="update"})[0];ok(!r2.created&&up&&!("name" in up.x)&&up.x.desk.chat,"update row")})})
.then(function(){console.log(p+" passed, "+f+" failed");process.exit(f?1:0)});
