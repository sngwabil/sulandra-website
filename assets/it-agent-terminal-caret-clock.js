/* SULANDRA_TERMINAL_CARET_CLOCK_V1
   JS-driven caret clock for Chromium/xterm startup and repaint edge cases. */
(()=>{
  'use strict';
  if(window.__SULANDRA_TERMINAL_CARET_CLOCK_V1__)return;
  window.__SULANDRA_TERMINAL_CARET_CLOCK_V1__=true;

  let phase=true;
  let timer=0;

  const apply=()=>{
    const root=document.querySelector('#itwsRealTerminal');
    if(!root)return;
    const enabled=root.classList.contains('itws-xterm-ready')&&root.classList.contains('itws-rt-direct-mode');
    root.querySelectorAll('.itws-xterm-pane').forEach(pane=>{
      const layer=pane.querySelector('.xterm-cursor-layer');
      if(!layer)return;
      const active=enabled&&pane.classList.contains('active');
      layer.style.setProperty('display',active?'block':'none','important');
      layer.style.setProperty('visibility',active?'visible':'hidden','important');
      layer.style.setProperty('opacity',active&&phase?'1':'0','important');
    });
  };

  const tick=()=>{
    phase=!phase;
    apply();
  };

  const restart=()=>{
    phase=true;
    apply();
    if(timer)clearInterval(timer);
    timer=setInterval(tick,540);
  };

  const scan=()=>{
    const root=document.querySelector('#itwsRealTerminal');
    if(!root)return;
    apply();
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',restart,{once:true});
  else restart();

  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('focus',restart);
  window.addEventListener('pageshow',restart);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)restart()});
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)},{once:true});
})();
