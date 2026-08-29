/* IT_AGENT_IPAD_STABLE_LOAD_V1
   Reveals the page only after the canonical chat-first workspace is actually ready.
   Also keeps iPad software-keyboard clearance synchronized with the fixed composer. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_IPAD_LOAD_GUARD__)return;
  window.__SULANDRA_IT_IPAD_LOAD_GUARD__=true;

  const root=document.documentElement;
  const body=()=>document.body;
  const ready=()=>Boolean(
    body()?.classList.contains('it-chatgpt-workspace')&&
    document.querySelector('.itws-layout')&&
    document.querySelector('.itws-sidebar')&&
    document.querySelector('#agent .agent-main')&&
    (document.querySelector('#agentForm')||document.querySelector('.agent-compose'))&&
    document.getElementById('itwsActivity')&&
    document.querySelector('[data-itws-view="overview"]')
  );

  function syncViewport(){
    const target=body();if(!target)return;
    const vv=window.visualViewport;
    const layoutHeight=Math.max(320,Math.round(window.innerHeight||document.documentElement.clientHeight||vv?.height||0));
    let keyboardInset=0;
    if(vv&&vv.height<layoutHeight*.84){
      keyboardInset=Math.max(0,Math.round(layoutHeight-vv.height-vv.offsetTop));
    }
    target.style.setProperty('--itws-keyboard-inset',`${keyboardInset}px`);
  }

  function reveal(){
    if(!ready())return false;
    syncViewport();
    body().dataset.itwsIpadReady='1';
    root.classList.remove('itws-preboot','itws-boot-failed');
    document.querySelector('.itws-boot-error')?.remove();
    return true;
  }

  function fail(){
    if(reveal())return;
    root.classList.add('itws-boot-failed');
    root.classList.remove('itws-preboot');
    if(document.querySelector('.itws-boot-error'))return;
    const node=document.createElement('div');
    node.className='itws-boot-error';
    node.setAttribute('role','alert');
    node.innerHTML='<div><strong>Sulandra IT did not finish loading.</strong><p>The current chat workspace could not initialize on this device. The old Action Center page is intentionally not shown as a fallback.</p><button type="button">Reload Sulandra IT</button></div>';
    node.querySelector('button')?.addEventListener('click',()=>location.reload());
    document.body.appendChild(node);
  }

  function boot(){
    syncViewport();
    if(reveal())return;
    const started=Date.now();
    const timer=setInterval(()=>{
      if(reveal()){clearInterval(timer);return}
      if(Date.now()-started>5000){clearInterval(timer);fail()}
    },80);
    window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});
    window.visualViewport?.addEventListener('scroll',syncViewport,{passive:true});
    window.addEventListener('resize',syncViewport,{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(syncViewport,120),{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
