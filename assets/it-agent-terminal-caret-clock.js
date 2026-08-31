/* SULANDRA_TERMINAL_CARET_CLOCK_V2
   JS-driven caret clock for Chromium/xterm startup and repaint edge cases.
   Supports xterm 5.x DOM cursors and legacy canvas cursor layers. */
(()=>{
  'use strict';
  if(window.__SULANDRA_TERMINAL_CARET_CLOCK_V2__)return;
  window.__SULANDRA_TERMINAL_CARET_CLOCK_V2__=true;

  let phase=true;
  let timer=0;

  const apply=()=>{
    const root=document.querySelector('#itwsRealTerminal');
    if(!root)return;
    const enabled=root.classList.contains('itws-xterm-ready')&&root.classList.contains('itws-rt-direct-mode');
    root.querySelectorAll('.itws-xterm-pane').forEach(pane=>{
      const active=enabled&&pane.classList.contains('active');

      // Legacy/canvas renderer: the entire cursor layer can be hidden when a
      // pane is inactive without affecting terminal row layout.
      pane.querySelectorAll('.xterm-cursor-layer').forEach(layer=>{
        layer.style.setProperty('display',active?'block':'none','important');
        layer.style.setProperty('visibility',active?'visible':'hidden','important');
        layer.style.setProperty('opacity',active&&phase?'1':'0','important');
      });

      // xterm 5.x core renderer: the caret is a span inside the DOM rows. Do
      // not use display:none here because that can alter cell geometry.
      pane.querySelectorAll('.xterm-cursor').forEach(cursor=>{
        cursor.style.setProperty('visibility',active?'visible':'hidden','important');
        cursor.style.setProperty('opacity',active&&phase?'1':'0','important');
      });
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
