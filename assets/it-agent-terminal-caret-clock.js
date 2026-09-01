/* SULANDRA_TERMINAL_CARET_CLOCK_V4
   Renderer-independent caret animation for Chromium/xterm.
   The caret only animates while the active xterm actually owns keyboard focus,
   and it never overrides xterm DEC cursor visibility (ESC[?25l / ESC[?25h). */
(()=>{
  'use strict';
  if(window.__SULANDRA_TERMINAL_CARET_CLOCK_V4__)return;
  window.__SULANDRA_TERMINAL_CARET_CLOCK_V4__=true;

  const STYLE_ID='sulandra-terminal-caret-clock-v4';
  const installStyle=()=>{
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      @keyframes sulandra-terminal-caret-blink-v4 {
        0%, 49% { opacity: 1; }
        50%, 100% { opacity: 0; }
      }
      #itwsRealTerminal.itws-xterm-ready.itws-rt-direct-mode
        .itws-xterm-pane.sulandra-caret-owner.sulandra-caret-focused .xterm-cursor-layer {
        animation: sulandra-terminal-caret-blink-v4 1.08s steps(1, end) infinite !important;
      }
      #itwsRealTerminal.itws-xterm-ready.itws-rt-direct-mode
        .itws-xterm-pane.sulandra-caret-owner:not(.sulandra-caret-focused) .xterm-cursor-layer,
      #itwsRealTerminal.itws-xterm-ready.itws-rt-direct-mode
        .itws-xterm-pane.sulandra-caret-owner .xterm-cursor {
        animation: none !important;
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

  const paneHasKeyboardFocus=pane=>{
    const active=document.activeElement;
    if(!active||!pane.contains(active))return false;
    return active.classList?.contains('xterm-helper-textarea')||Boolean(active.closest?.('.xterm'));
  };

  const apply=()=>{
    installStyle();
    const root=document.querySelector('#itwsRealTerminal');
    if(!root)return;
    const enabled=root.classList.contains('itws-xterm-ready')&&root.classList.contains('itws-rt-direct-mode');
    root.querySelectorAll('.itws-xterm-pane').forEach(pane=>{
      const owner=Boolean(enabled&&pane.classList.contains('active'));
      pane.classList.toggle('sulandra-caret-owner',owner);
      pane.classList.toggle('sulandra-caret-focused',Boolean(owner&&paneHasKeyboardFocus(pane)));
    });
  };

  const restartFocusedAnimation=()=>{
    apply();
    const owner=document.querySelector('#itwsRealTerminal .itws-xterm-pane.sulandra-caret-owner.sulandra-caret-focused');
    if(!owner)return;
    owner.classList.remove('sulandra-caret-focused');
    void owner.offsetWidth;
    owner.classList.add('sulandra-caret-focused');
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});
  else apply();

  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('focusin',apply,true);
  document.addEventListener('focusout',()=>queueMicrotask(apply),true);
  window.addEventListener('focus',restartFocusedAnimation);
  window.addEventListener('pageshow',restartFocusedAnimation);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)restartFocusedAnimation()});
})();
