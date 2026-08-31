/* SULANDRA_TERMINAL_CARET_UI_V1
   Small presentation layer for terminal input-mode labeling. */
(()=>{
  'use strict';
  if(window.__SULANDRA_TERMINAL_CARET_UI_V1__)return;
  window.__SULANDRA_TERMINAL_CARET_UI_V1__=true;

  const apply=()=>{
    document.querySelectorAll('#itwsRealTerminal [data-rt-input-mode="direct"]').forEach(button=>{
      if(button.textContent!=='In-Terminal')button.textContent='In-Terminal';
      button.setAttribute('aria-label','In-Terminal');
      button.title='Type directly in the live terminal';
    });
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});
  else apply();
  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
})();
