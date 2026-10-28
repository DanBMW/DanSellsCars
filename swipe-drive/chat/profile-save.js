/* SwipeToDrive chat: turn Revvy answers into a customers row and save it for the signed in customer.
   Uses existing columns only. Typed columns are filled only when empty, so a profile the customer already
   set up is never overwritten. The full chat sits in customers.desk.chat (desk is an existing jsonb column). */
(function(g){
var PENDING="sd_chat_pending_save_v1";
function n(v){if(v==null)return null;var m=String(v).replace(/,/g,"").match(/(\d+(?:\.\d+)?)\s*(k)?/i);return m?Math.round(parseFloat(m[1])*(m[2]?1000:1)):null}
var ANNUAL={"Under 6k":5000,"6k to 10k":8000,"10k to 15k":12500,"Over 15k":18000};
var WHEN={"ASAP":"now","Next month":"month","In 3 months":"quarter","Just looking":"browsing"};
function real(v){return v!=null&&v!==""&&!/^(Skipped|Not sure|Not sure yet|Rather not say|No preference)$/.test(String(v))}
function empty(v){return v==null||v===""||(Array.isArray(v)&&!v.length)}
function build(a,existing,email){a=a||{};var ex=existing||{},p={},desk=Object.assign({},ex.desk||{});
 function put(k,v){if(v!=null&&v!==""&&!(Array.isArray(v)&&!v.length)&&empty(ex[k]))p[k]=v}
 if(real(a.name))put("name",String(a.name).slice(0,40));
 if(real(a.phone)&&/^07\d{9}$/.test(a.phone))put("phone",a.phone);
 if(email)put("email",email);
 if(real(a.model))put("models",[a.model]);
 var am=ANNUAL[a.annual]!=null?ANNUAL[a.annual]:(real(a.annual)?n(a.annual):null);if(am)put("annual_mileage",am);
 if(a.pay=="Cash"){if(empty(ex.budget_type))p.budget_type="cash";if(a._n_cash)put("cash_gbp",a._n_cash)}
 else if(a._n_budget){if(empty(ex.budget_type))p.budget_type="monthly";put("monthly_gbp",a._n_budget)}
 if(real(a.dep)){var d=/^(£0|None)/.test(a.dep)?0:n(a.dep);if(d!=null)put("deposit_gbp",d)}
 var noCar=a.cur=="No current car";
 if(real(a.cur)&&!noCar&&empty(desk.cur_car))desk.cur_car=a.cur;
 if(!noCar&&real(a.curMonthly)&&desk.cur_monthly==null){var cm=/^(£0|None)/.test(a.curMonthly)?0:n(a.curMonthly);if(cm!=null)desk.cur_monthly=cm}
 if(WHEN[a.when]&&empty(desk.when))desk.when=WHEN[a.when];
 var clean={};Object.keys(a).forEach(function(k){if(k.charAt(0)!="_"||k=="_notes"||/^_n_/.test(k))clean[k]=a[k]});delete clean._i;
 desk.chat={answers:clean,no_current_car:noCar,saved_at:new Date().toISOString(),source:"revvy_chat"};
 p.desk=desk;return p}
function save(sb,user,answers){
 return Promise.resolve(sb.from("customers").select("*").eq("user_id",user.id).maybeSingle()).then(function(r){if(r.error)throw r.error;var ex=r.data,patch=build(answers,ex,user.email);
  if(ex)return Promise.resolve(sb.from("customers").update(patch).eq("id",ex.id)).then(function(w){if(w.error)throw w.error;return {id:ex.id,created:false,patch:patch}});
  var id=(g.crypto&&g.crypto.randomUUID)?g.crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g,function(){return (Math.random()*16|0).toString(16)});
  var row=Object.assign({id:id,user_id:user.id,owner_staff_id:null},patch);
  return Promise.resolve(sb.from("customers").insert(row)).then(function(w){if(w.error)throw w.error;return {id:id,created:true,patch:patch}})})
 .then(function(res){try{g.localStorage.removeItem(PENDING)}catch(e){}return res})}
function markPending(){try{g.localStorage.setItem(PENDING,"1")}catch(e){}}
function pending(){try{return g.localStorage.getItem(PENDING)=="1"}catch(e){return false}}
g.ChatProfile={build:build,save:save,markPending:markPending,pending:pending,PENDING:PENDING};
})(typeof window!="undefined"?window:globalThis);
