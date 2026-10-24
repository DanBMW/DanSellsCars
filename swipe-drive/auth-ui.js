/* Swipe Drive sign in box: email and password (sign in, create account, forgot password), email code,
   and Continue with Google (only when CT_CONFIG.GOOGLE_LOGIN_ENABLED is true). Used by the app sign in
   screen and the end of the Revvy chat. Needs a supabase-js client. */
(function(g){
var CSS=".au{width:100%;background:#161a20;border:1px solid #2a2f37;border-radius:16px;padding:14px;color:#ece9e1;font:15px/1.45 Satoshi,system-ui,sans-serif;text-align:left}"+
".au-tabs{display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap}.au-tabs button{flex:1;min-width:0;background:#1d2229;color:#ece9e1;border:1px solid #363c46;border-radius:20px;padding:8px 6px;font-weight:600;font-size:13px;font-family:inherit;cursor:pointer}.au-tabs button.on{background:#5b8ac9;border-color:#5b8ac9}"+
".au label{display:block;margin:0 0 10px}.au label span{display:block;font-size:13px;color:#a7a59e;margin:0 0 4px;font-weight:600}"+
".au input{width:100%;box-sizing:border-box;background:#0f1216;border:1px solid #2a2f37;border-radius:10px;color:#ece9e1;padding:12px;font-size:16px;font-family:inherit}.au input:focus{outline:2px solid #5b8ac9;border-color:transparent}"+
".au-go{width:100%;background:linear-gradient(180deg,#6b98d4,#4a76b2);color:#fff;border:0;border-radius:12px;padding:13px;font-weight:700;font-size:15px;font-family:inherit;cursor:pointer}.au-go[disabled]{opacity:.6}"+
".au-g{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:#1f1f1f;border:0;border-radius:12px;padding:12px;font-weight:600;font-size:15px;font-family:inherit;cursor:pointer;margin:0 0 12px}"+
".au-link{background:none;border:0;color:#9dbbe6;text-decoration:underline;font-size:13px;font-family:inherit;padding:8px 0 0;cursor:pointer}.au-msg{min-height:1.2em;font-size:14px;color:#ffd2dd;margin:8px 0 0}.au-msg.ok{color:#9df0bf}"+
".au-or{text-align:center;color:#a7a59e;font-size:12px;margin:0 0 10px}";
var GSVG='<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>';
function css(){if(document.getElementById("au-css"))return;var s=document.createElement("style");s.id="au-css";s.textContent=CSS;document.head.appendChild(s)}
function nice(e){var m=(e&&(e.message||e.error_description))||"";
 if(/invalid login/i.test(m))return "That email and password don't match. Try again, or tap Forgot password.";
 if(/not confirmed/i.test(m))return "Please confirm your email first. The link is in your inbox.";
 if(/already registered|already exists/i.test(m))return "You already have an account with that email. Sign in instead.";
 if(/password.*(at least|short|weak)/i.test(m))return "Pick a longer password, at least 8 characters.";
 if(/rate|too many|security purposes/i.test(m))return "Too many tries. Wait a minute and try again.";
 if(/token|otp|expired/i.test(m))return "That code did not work. Check it, or send a new one.";
 return "That did not work. Try again, or WhatsApp Dan on 07827 138197."}
function emailOk(s){return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s)}
/* opts: sb (client), cfg, redirect (url), code (bool: show email code tab), onDone(session), track(name) */
function mount(box,o){css();var cfg=o.cfg||g.CT_CONFIG||{},sb=o.sb,tr=o.track||function(){},mode=o.start||"in",sentTo="";
 box.innerHTML="";var w=document.createElement("div");w.className="au";box.appendChild(w);
 function el(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h!=null)e.textContent=h;return e}
 function field(lab,type,ac,ph){var l=el("label");l.appendChild(el("span",null,lab));var i=el("input");i.type=type;i.autocomplete=ac;if(ph)i.placeholder=ph;if(type=="email")i.inputMode="email";l.appendChild(i);return [l,i]}
 function draw(){w.innerHTML="";
  if(cfg.GOOGLE_LOGIN_ENABLED){var gb=el("button","au-g");gb.type="button";gb.innerHTML=GSVG+"<span>Continue with Google</span>";gb.onclick=function(){tr("sign_in_google");sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:o.redirect}}).then(function(r){if(r.error)msg.textContent=nice(r.error)})};w.appendChild(gb);w.appendChild(el("p","au-or","or use your email"))}
  var tabs=el("div","au-tabs"),T=[["in","Sign in"],["up","Create account"]];if(o.code!==false)T.push(["code","Email me a code"]);
  T.forEach(function(t){var b=el("button",mode==t[0]?"on":"",t[1]);b.type="button";b.setAttribute("data-au",t[0]);b.onclick=function(){mode=t[0];draw()};tabs.appendChild(b)});if(mode!="forgot")w.appendChild(tabs);
  var f=el("form");f.noValidate=true;w.appendChild(f);var E=field("Your email","email","email","you@example.com");f.appendChild(E[0]);E[1].value=sentTo||o.email||"";E[1].name="au_email";
  var P=null,C=null;
  if(mode=="in"||mode=="up"){P=field(mode=="up"?"Choose a password (8 or more characters)":"Password","password",mode=="up"?"new-password":"current-password");P[1].name="au_password";f.appendChild(P[0])}
  if(mode=="code"&&sentTo){C=field("The code from the email","text","one-time-code","12345678");C[1].inputMode="numeric";C[1].maxLength=8;C[1].name="au_code";f.appendChild(C[0])}
  var go=el("button","au-go",mode=="in"?"Sign in":mode=="up"?"Create account":mode=="forgot"?"Email me a reset link":sentTo?"Sign in with code":"Email me a code");go.type="submit";f.appendChild(go);
  var msg=el("p","au-msg");msg.setAttribute("role","status");msg.setAttribute("aria-live","polite");f.appendChild(msg);
  if(mode=="in"){var fp=el("button","au-link","Forgot password?");fp.type="button";fp.onclick=function(){sentTo=E[1].value.trim();mode="forgot";draw()};f.appendChild(fp)}
  if(mode=="forgot"){var bk=el("button","au-link","Back to sign in");bk.type="button";bk.onclick=function(){mode="in";draw()};f.appendChild(bk)}
  function ok(t){msg.className="au-msg ok";msg.textContent=t}function bad(t){msg.className="au-msg";msg.textContent=t;go.disabled=false}
  function done(sess){ok("Signed in.");tr("sign_in_"+mode);o.onDone&&o.onDone(sess)}
  f.onsubmit=function(e){e.preventDefault();var em=E[1].value.trim();if(!emailOk(em))return bad("That email doesn't look right. Check it and try again.");go.disabled=true;msg.className="au-msg";msg.textContent="One moment...";
   if(mode=="in"){var pw=P[1].value;if(!pw)return bad("Type your password.");sb.auth.signInWithPassword({email:em,password:pw}).then(function(r){if(r.error)return bad(nice(r.error));done(r.data.session)});return}
   if(mode=="up"){var pw2=P[1].value;if(pw2.length<8)return bad("Pick a longer password, at least 8 characters.");sb.auth.signUp({email:em,password:pw2,options:{emailRedirectTo:o.redirect}}).then(function(r){if(r.error)return bad(nice(r.error));
     if(r.data.session)return done(r.data.session);if(r.data.user&&r.data.user.identities&&!r.data.user.identities.length)return bad("You already have an account with that email. Sign in instead.");
     o.onConfirmNeeded&&o.onConfirmNeeded(em);tr("sign_up_confirm_sent");go.disabled=false;ok("Nearly there. We've emailed you a link to confirm your address. Tap it, then come back and sign in.")});return}
   if(mode=="forgot"){sb.auth.resetPasswordForEmail(em,{redirectTo:o.redirect}).then(function(r){if(r.error)return bad(nice(r.error));go.disabled=false;ok("If there's an account for that email, a reset link is on its way. Open it on this phone to pick a new password.")});return}
   if(mode=="code"){if(!sentTo||sentTo!=em){sb.auth.signInWithOtp({email:em,options:{emailRedirectTo:o.redirect}}).then(function(r){if(r.error)return bad(nice(r.error));o.onConfirmNeeded&&o.onConfirmNeeded(em);sentTo=em;draw();var m2=w.querySelector(".au-msg");m2.className="au-msg ok";m2.textContent="Code sent. Type it below, or tap the link in the email on this phone."});return}
    var code=C[1].value.replace(/\D/g,"");if(code.length<6)return bad("Type the code from the email.");sb.auth.verifyOtp({email:em,token:code,type:"email"}).then(function(r){if(r.error)return bad(nice(r.error));done(r.data.session)})}};
  if(first&&o.autofocus===false){first=false;return}first=false;setTimeout(function(){try{(E[1].value?(P||C||E)[1]:E[1]).focus({preventScroll:true})}catch(e){}},30)}
 var first=true;draw();return {set:function(m){mode=m;draw()}}}
/* after a reset link: ask for the new password */
function recover(box,o){css();box.innerHTML='<div class="au"><form novalidate><label><span>Pick a new password (8 or more characters)</span><input type="password" autocomplete="new-password" name="au_newpw"></label><button class="au-go" type="submit">Save new password</button><p class="au-msg" role="status"></p></form></div>';
 var f=box.querySelector("form"),i=f.querySelector("input"),m=f.querySelector(".au-msg");f.onsubmit=function(e){e.preventDefault();if(i.value.length<8){m.textContent="At least 8 characters, please.";return}
  o.sb.auth.updateUser({password:i.value}).then(function(r){if(r.error){m.textContent=nice(r.error);return}m.className="au-msg ok";m.textContent="Password saved. You're signed in.";o.onDone&&o.onDone()})};i.focus()}
g.AuthUI={mount:mount,recover:recover,nice:nice};
})(window);
