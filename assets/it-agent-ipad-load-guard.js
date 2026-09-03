/* SULANDRA_IT_IPAD_FAIL_OPEN_V3
   iPad/Safari boot guard for Sulandra IT.
   The core IT workspace is always allowed to paint. Optional enhancements may finish
   after first paint, but they can never strand the user behind a loader or blank page. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_IPAD_FAIL_OPEN_V3__)return;
  window.__SULANDRA_IT_IPAD_FAIL_OPEN_V3__=true;
  window.__SULANDRA_IT_IPAD_LOAD_GUARD__=true;

  const root=document.documentElement;
  const body=()=>document.body;
  let pollTimer=0;
  let failOpenTimer=0;
  let listenersBound=false;

  const enhancedReady=()=>Boolean(
    body()&&
    document.getElementById('agent')&&
    document.querySelector('#agent .agent-main')&&
    document.querySelector('.itws-layout')
  );

  function syncViewport(){
    const target=body();if(!target)return;
    const vv=window.visualViewport;
    const viewportHeight=Math.max(320,Math.round(window.innerHeight||document.documentElement.clientHeight||vv?.height||0));
    let keyboardInset=0;
    if(vv&&vv.height<viewportHeight*.84){
      keyboardInset=Math.max(0,Math.round(viewportHeight-vv.height-vv.offsetTop));
    }
    target.style.setProperty('--itws-keyboard-inset',`${keyboardInset}px`);
  }

  function clearBootTimers(){
    if(pollTimer){clearInterval(pollTimer);pollTimer=0}
    if(failOpenTimer){clearTimeout(failOpenTimer);failOpenTimer=0}
    if(window.__sulandraItPrebootFailOpen){
      clearTimeout(window.__sulandraItPrebootFailOpen);
      window.__sulandraItPrebootFailOpen=0;
    }
  }

  function reveal(mode){
    const target=body();
    syncViewport();
    if(target){
      target.dataset.itwsIpadReady=enhancedReady()?'1':'fallback';
      target.dataset.itwsBootMode=String(mode||'ready');
    }
    root.classList.remove('itws-preboot','itws-boot-failed');
    document.querySelector('.itws-boot-error')?.remove();
    document.querySelector('.itws-boot-warning')?.remove();
    clearBootTimers();
    return true;
  }

  function tryEnhancedReady(){
    if(!enhancedReady())return false;
    reveal('enhanced');
    return true;
  }

  function bindViewportListeners(){
    if(listenersBound)return;
    listenersBound=true;
    window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});
    window.visualViewport?.addEventListener('scroll',syncViewport,{passive:true});
    window.addEventListener('resize',syncViewport,{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(syncViewport,120),{passive:true});
    document.addEventListener('visibilitychange',()=>{
      syncViewport();
      if(!document.hidden&&root.classList.contains('itws-preboot')){
        if(!tryEnhancedReady())reveal('visibility-fail-open');
      }
    });
  }

  function boot(){
    syncViewport();
    bindViewportListeners();
    if(tryEnhancedReady())return;

    if(pollTimer)clearInterval(pollTimer);
    pollTimer=setInterval(()=>{
      if(tryEnhancedReady())return;
      syncViewport();
    },100);

    if(failOpenTimer)clearTimeout(failOpenTimer);
    failOpenTimer=setTimeout(()=>reveal('timeout-fail-open'),1800);
  }

  function pageShow(event){
    syncViewport();
    if(event?.persisted){
      reveal(enhancedReady()?'bfcache-ready':'bfcache-fail-open');
      return;
    }
    if(root.classList.contains('itws-preboot'))boot();
  }

  window.addEventListener('pageshow',pageShow);
  window.addEventListener('load',()=>{
    if(root.classList.contains('itws-preboot')){
      if(!tryEnhancedReady())setTimeout(()=>reveal('load-fail-open'),350);
    }
  },{once:true});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
