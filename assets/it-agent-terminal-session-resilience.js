/* SULANDRA_TERMINAL_SESSION_RESILIENCE_V1
   Preserve only non-secret Engineering Terminal workspace/session identifiers
   across ordinary login/navigation interruptions. Authentication tokens are
   deliberately excluded. When the user returns after re-authentication, the
   existing terminal code can reconnect to the same backend workspace/session
   instead of creating a fresh terminal merely because sessionStorage changed. */
(()=>{
  'use strict';
  if(window.__SULANDRA_TERMINAL_SESSION_RESILIENCE_V1__)return;
  window.__SULANDRA_TERMINAL_SESSION_RESILIENCE_V1__=true;

  const WORKSPACE_KEY='sulandra:it-solutions:terminal-workspace';
  const SESSION_KEY_PREFIX='sulandra:it-solutions:terminal-sessions:';
  let lastWorkspace='';

  const safeGet=(store,key)=>{try{return String(store?.getItem?.(key)||'')}catch{return ''}};
  const safeSet=(store,key,value)=>{try{if(value)store?.setItem?.(key,value);else store?.removeItem?.(key)}catch{}};

  const hydrate=()=>{
    let workspace=safeGet(sessionStorage,WORKSPACE_KEY);
    if(!workspace){
      workspace=safeGet(localStorage,WORKSPACE_KEY);
      if(workspace)safeSet(sessionStorage,WORKSPACE_KEY,workspace);
    }
    if(!workspace)return;
    const sessionKey=SESSION_KEY_PREFIX+workspace;
    if(!safeGet(sessionStorage,sessionKey)){
      const saved=safeGet(localStorage,sessionKey);
      if(saved)safeSet(sessionStorage,sessionKey,saved);
    }
    lastWorkspace=workspace;
  };

  const persist=()=>{
    const workspace=safeGet(sessionStorage,WORKSPACE_KEY);
    if(!workspace){
      if(lastWorkspace){
        safeSet(localStorage,SESSION_KEY_PREFIX+lastWorkspace,'');
        safeSet(localStorage,WORKSPACE_KEY,'');
        lastWorkspace='';
      }
      return;
    }
    safeSet(localStorage,WORKSPACE_KEY,workspace);
    const sessionKey=SESSION_KEY_PREFIX+workspace;
    const sessions=safeGet(sessionStorage,sessionKey);
    if(sessions)safeSet(localStorage,sessionKey,sessions);
    else safeSet(localStorage,sessionKey,'');
    if(lastWorkspace&&lastWorkspace!==workspace)safeSet(localStorage,SESSION_KEY_PREFIX+lastWorkspace,'');
    lastWorkspace=workspace;
  };

  /* Run immediately while the page is still parsing so the real-terminal
     DOMContentLoaded startup sees the restored identifiers. */
  hydrate();
  const timer=window.setInterval(persist,1000);
  window.addEventListener('pagehide',persist,{capture:true});
  window.addEventListener('beforeunload',()=>{persist();window.clearInterval(timer)},{once:true});
})();
