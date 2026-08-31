/* SULANDRA_TERMINAL_CARET_CLOCK_V3
   Renderer-independent caret ownership for Chromium/xterm.
   JavaScript chooses the active pane; CSS animation owns the blink so xterm
   repaints cannot race a setInterval opacity toggle. */
(()=>{
  'use strict';
  if(window.__SULANDRA_TERMINAL_CARET_CLOCK_V3__)return;
  window.__SULANDRA_TERMINAL_CARET_CLOCK_V3__=true;

  const STYLE_ID='sulandra-terminal-caret-clock-v3';
  const installStyle=()=>{
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      @keyframes sulandra-terminal-caret-blink-v3 {
        0%, 49% { opacity: 1; }
        50%, 100% { opacity: 0; }
      }
      #itwsRealTerminal.itws-xterm-ready.itws-rt-direct-mode
        .itws-xterm-pane.sulandra-caret-owner .xterm-cursor-layer,
      #itwsRealTerminal.itws-xterm-ready.itws-rt-direct-mode
        .itws-xterm-pane.sulandra-caret-owner .xterm-cursor {
        visibility: visible !important;
        animation: sulandra-terminal-caret-blink-v3 1.08s steps(1, end) infinite !important;
      }
      #itwsRealTerminal .itws-xterm-pane:not(.sulandra-caret-owner) .xterm-cursor-layer {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        animation: none !important;
      }
      #itwsRealTerminal .itws-xterm-pane:not(.sulandra-caret-owner) .xterm-cursor {
        visibility: hidden !important;
        opacity: 0 !important;
        animation: none !important;
      }
    `;
    (document.head||document.documentElement).appendChild(style);
  };

  const apply=()=>{
    installStyle();
    const root=document.querySelector('#itwsRealTerminal');
    if(!root)return;
    const enabled=root.classList.contains('itws-xterm-ready')&&root.classList.contains('itws-rt-direct-mode');
    root.querySelectorAll('.itws-xterm-pane').forEach(pane=>{
      pane.classList.toggle('sulandra-caret-owner',Boolean(enabled&&pane.classList.contains('active')));
    });
  };

  const restart=()=>{
    apply();
    const owner=document.querySelector('#itwsRealTerminal .itws-xterm-pane.sulandra-caret-owner');
    if(!owner)return;
    // Reattach the class on lifecycle resumes so Chromium restarts the CSS
    // animation even after bfcache/visibility throttling.
    owner.classList.remove('sulandra-caret-owner');
    void owner.offsetWidth;
    owner.classList.add('sulandra-caret-owner');
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});
  else apply();

  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('focus',restart);
  window.addEventListener('pageshow',restart);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)restart()});
})();
