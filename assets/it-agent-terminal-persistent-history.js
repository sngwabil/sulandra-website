/* SULANDRA_TERMINAL_PERSISTENT_HISTORY_V1
   Presents the complete disk-backed terminal transcript without loading the
   entire session into browser memory. Older pages are prepended as the user
   scrolls to the top; the live xterm remains the interactive terminal. */
(()=>{
  'use strict';
  if(window.__SULANDRA_TERMINAL_PERSISTENT_HISTORY_V1__)return;
  window.__SULANDRA_TERMINAL_PERSISTENT_HISTORY_V1__=true;

  const PAGE_BYTES=262144;
  const states=new Map();
  let root=null;
  let host=null;
  let button=null;
  let overlay=null;
  let pre=null;
  let status=null;
  let loading=false;
  let openSessionId='';

  const authToken=()=>sessionStorage.getItem('sulandra:admin:access-token')
    ||localStorage.getItem('sulandra:admin:access-token')
    ||sessionStorage.getItem('sulandra:employee:access-token')
    ||localStorage.getItem('sulandra:employee:access-token')
    ||localStorage.getItem('token')||'';
  const apiBase=()=>typeof API==='string'&&API?API:'https://sulandra-website-production-5fc4.up.railway.app';
  const activeSessionId=()=>root?.querySelector('#itwsRtTabs .itws-rt-tab.active')?.dataset?.terminalId||'';
  const stripAnsi=value=>String(value||'')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g,'')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g,'')
    .replace(/\x1B[()][A-Z0-2]/g,'')
    .replace(/\r(?!\n)/g,'\n')
    .replace(/\u0000/g,'');

  const requestPage=async(sessionId,before)=>{
    const params=new URLSearchParams({limit:String(PAGE_BYTES)});
    if(before!==undefined&&before!==null)params.set('before',String(Math.max(0,Number(before)||0)));
    const response=await fetch(`${apiBase()}/api/it-solutions/terminal/sessions/${encodeURIComponent(sessionId)}/history?${params}`,{
      cache:'no-store',
      headers:{Accept:'application/json',Authorization:'Bearer '+authToken()},
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||payload.message||`History request failed (${response.status})`);
    return payload.data??payload;
  };

  const setStatus=(text,bad=false)=>{
    if(!status)return;
    status.textContent=text;
    status.classList.toggle('bad',Boolean(bad));
  };

  const loadOlder=async()=>{
    if(loading||!openSessionId||!overlay?.classList.contains('open'))return;
    const state=states.get(openSessionId);
    if(!state?.hasMore||state.start<=0)return;
    loading=true;
    setStatus('Loading older history…');
    const oldHeight=overlay.scrollHeight;
    const oldTop=overlay.scrollTop;
    try{
      const page=await requestPage(openSessionId,state.start);
      if(openSessionId!==activeSessionId()&&overlay.classList.contains('open')){
        closeHistory();return;
      }
      const text=stripAnsi(page.data||'');
      pre.textContent=text+pre.textContent;
      state.start=Math.max(0,Number(page.start)||0);
      state.hasMore=Boolean(page.hasMore)&&state.start>0;
      state.size=Math.max(state.size||0,Number(page.size)||0);
      requestAnimationFrame(()=>{
        const delta=overlay.scrollHeight-oldHeight;
        overlay.scrollTop=Math.max(0,oldTop+delta);
      });
      setStatus(state.hasMore?'Scroll up for older history':'Beginning of terminal history');
    }catch(error){
      setStatus(error?.message||'Unable to load older history',true);
    }finally{loading=false}
  };

  const openHistory=async()=>{
    const sessionId=activeSessionId();
    if(!sessionId)return;
    if(overlay?.classList.contains('open')&&openSessionId===sessionId){closeHistory();return}
    openSessionId=sessionId;
    root?.classList.add('itws-persistent-history-open');
    overlay?.classList.add('open');
    if(button){button.classList.add('active');button.setAttribute('aria-pressed','true')}
    pre.textContent='';
    setStatus('Loading complete terminal history…');
    loading=true;
    try{
      const page=await requestPage(sessionId,null);
      if(openSessionId!==sessionId)return;
      const state={start:Math.max(0,Number(page.start)||0),size:Math.max(0,Number(page.size)||0),hasMore:Boolean(page.hasMore)};
      states.set(sessionId,state);
      pre.textContent=stripAnsi(page.data||'');
      requestAnimationFrame(()=>{overlay.scrollTop=overlay.scrollHeight});
      setStatus(state.hasMore?'Complete transcript · scroll up for older history':'Complete transcript · beginning loaded');
    }catch(error){
      pre.textContent='';
      setStatus(error?.message||'Unable to load terminal history',true);
    }finally{loading=false}
  };

  const closeHistory=()=>{
    openSessionId='';
    root?.classList.remove('itws-persistent-history-open');
    overlay?.classList.remove('open');
    if(button){button.classList.remove('active');button.setAttribute('aria-pressed','false')}
  };

  const install=()=>{
    root=document.querySelector('[data-production-xterm="1"]');
    host=root?.querySelector('#itwsXtermHost');
    const tools=root?.querySelector('.itws-rt-input-switch')||root?.querySelector('.itws-rt-foot');
    if(!root||!host||!tools)return false;
    if(root.dataset.persistentHistory==='1')return true;
    root.dataset.persistentHistory='1';

    button=document.createElement('button');
    button.type='button';button.id='itwsRtAllHistory';button.className='itws-rt-copy';
    button.textContent='All history';button.title='Open the complete disk-backed terminal history';
    button.setAttribute('aria-pressed','false');tools.appendChild(button);

    overlay=document.createElement('div');overlay.className='itws-terminal-history-view';overlay.setAttribute('aria-label','Complete terminal history');
    const bar=document.createElement('div');bar.className='itws-terminal-history-bar';
    status=document.createElement('span');status.className='itws-terminal-history-status';status.textContent='Complete terminal history';
    const close=document.createElement('button');close.type='button';close.className='itws-terminal-history-close';close.textContent='Live terminal';close.title='Return to the live terminal';
    bar.append(status,close);
    pre=document.createElement('pre');pre.className='itws-terminal-history-pre';
    overlay.append(bar,pre);host.appendChild(overlay);

    button.addEventListener('click',event=>{event.preventDefault();void openHistory()});
    close.addEventListener('click',event=>{event.preventDefault();closeHistory()});
    overlay.addEventListener('scroll',()=>{if(overlay.scrollTop<160)void loadOlder()},{passive:true});
    root.addEventListener('click',event=>{
      const target=event.target instanceof Element?event.target:null;
      if(target?.closest('#itwsRtLatest'))closeHistory();
      if(target?.closest('[data-terminal-id]')&&!target.closest('[data-close-terminal]')){
        const next=target.closest('[data-terminal-id]')?.dataset?.terminalId||'';
        if(overlay.classList.contains('open')&&next&&next!==openSessionId){closeHistory()}
      }
    },true);
    return true;
  };

  if(!install()){
    const observer=new MutationObserver(()=>{if(install())observer.disconnect()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    window.setTimeout(()=>observer.disconnect(),30000);
  }
})();
