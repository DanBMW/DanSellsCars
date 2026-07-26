(function(){
  var style=document.createElement('style');
  style.textContent='@keyframes shBounce{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(7px)}}';
  document.head.appendChild(style);

  /* Pages on the new design system load premium.css or funnel-premium.css;
     match their quieter palette instead of the original brand blue. */
  function isPremiumPage(){
    var links=document.querySelectorAll('link[rel="stylesheet"]');
    for(var i=0;i<links.length;i++){
      var h=links[i].getAttribute('href')||'';
      if(h.indexOf('premium.css')!==-1) return true;
    }
    return false;
  }

  function init(){
    if(document.documentElement.scrollHeight<=window.innerHeight+24) return;
    var el=document.createElement('button');
    el.setAttribute('aria-label','Scroll down');
    var skin=isPremiumPage()
      ? 'background:rgba(10,12,15,.72);border:1px solid rgba(91,138,201,.55);color:#ece9e1;box-shadow:none;'
      : 'background:rgba(21,89,207,.80);border:none;color:#fff;box-shadow:0 4px 18px rgba(21,89,207,.38);';
    el.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);width:44px;height:44px;border-radius:50%;'+skin+'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity .3s ease,transform .3s ease;z-index:9999;animation:shBounce 1.7s ease-in-out infinite;padding:0;';
    el.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    document.body.appendChild(el);

    function check(){
      var atBottom=window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-80;
      var noScroll=document.documentElement.scrollHeight<=window.innerHeight+24;
      if(atBottom||noScroll){
        el.style.opacity='0';el.style.pointerEvents='none';
      } else {
        el.style.opacity='1';el.style.pointerEvents='auto';
      }
    }

    window.addEventListener('scroll',check,{passive:true});
    window.addEventListener('resize',function(){
      if(document.documentElement.scrollHeight<=window.innerHeight+24) el.style.display='none';
    },{passive:true});
    el.addEventListener('click',function(){
      window.scrollBy({top:Math.min(Math.round(window.innerHeight*0.72),420),behavior:'smooth'});
    });
    check();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  } else {
    init();
  }
})();
