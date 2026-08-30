/* IT_AGENT_XTERM_INTERRUPT_FIX_V1
   Own Ctrl+C at the xterm/PTTY layer so it interrupts the active foreground process
   instead of falling through to the legacy command controller or browser copy path. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_XTERM_INTERRUPT_FIX_V1__)return;
  window.__SULANDRA_IT_XTERM_INTERRUPT_FIX_V1__=true;

  const API_FALLBACK='https://sulandra-website-production-5fc4.up.railway.app';
  let interrupting=false;

  const authToken=()=>sessionStorage.getItem('sulandra:employee:access-token')
    ||localStorage.getItem('sulandra:employee:access-token')
    ||sessionStorage.getItem('sulandra:admin:access-token')
    ||localStorage.getItem('sulandra:admin:access-token')
    ||localStorage.getItem('token')||'';

  const activeSessionId=()=>document.querySelector('#itwsRtTabs .itws-rt-tab.active')?.dataset?.terminalId||'';
  const apiBase=()=>typeof window.API==='string'&&window.API?window.API:API_FALLBACK;
  const focusTerminal=()=>{
    const id=activeSessionId();
    if(!id)return;
    const pane=[...document.querySelectorAll('.itws-xterm-pane')].find(node=>node.dataset.sessionId===id);
    const textarea=pane?.querySelector('.xterm-helper-textarea');
    if(textarea instanceof HTMLElement)textarea.focus({preventScroll:true});
  };

  const sendInterrupt=async()=>{
    const id=activeSessionId();
    if(!id||interrupting)return;
    interrupting=true;
    try{
      const response=await fetch(apiBase()+'/api/it-solutions/terminal/sessions/'+encodeURIComponent(id)+'/input',{
        method:'POST',
        headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+authToken()},
        body:JSON.stringify({data:'\u0003'}),
      });
      if(!response.ok){
        const payload=await response.json().catch(()=>({}));
        throw new Error(payload.error||payload.message||`Ctrl+C failed (${response.status})`);
      }
    }catch(error){
      console.error('[Sulandra Terminal] Ctrl+C interrupt failed',error);
    }finally{
      interrupting=false;
      window.setTimeout(focusTerminal,40);
    }
  };

  const insideLiveTerminal=target=>target instanceof Element&&Boolean(target.closest('#itwsXtermHost,.itws-xterm-pane,.xterm'));

  document.addEventListener('keydown',event=>{
    if(!event.ctrlKey||event.metaKey||String(event.key||'').toLowerCase()!=='c')return;
    if(!insideLiveTerminal(event.target))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void sendInterrupt();
  },true);

  document.addEventListener('click',event=>{
    const button=event.target instanceof Element?event.target.closest('#itwsRtCtrlC'):null;
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void sendInterrupt();
  },true);
})();
