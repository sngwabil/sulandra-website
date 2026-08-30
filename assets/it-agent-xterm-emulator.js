/* IT_AGENT_XTERM_EMULATOR_V1
   Replaces the custom prompt renderer with xterm.js connected to the existing
   authenticated node-pty session. The shell stays isolated from production secrets. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_XTERM_EMULATOR_V1__)return;
  window.__SULANDRA_IT_XTERM_EMULATOR_V1__=true;

  const API_FALLBACK='https://sulandra-website-production-5fc4.up.railway.app';
  const states=new Map();
  let root=null;
  let host=null;
  let syncTimer=0;

  const authToken=()=>sessionStorage.getItem('sulandra:employee:access-token')
    ||localStorage.getItem('sulandra:employee:access-token')
    ||sessionStorage.getItem('sulandra:admin:access-token')
    ||localStorage.getItem('sulandra:admin:access-token')
    ||localStorage.getItem('token')||'';

  const apiRequest=async(path,options={})=>{
    const base=typeof window.API==='string'&&window.API?window.API:API_FALLBACK;
    const response=await fetch(base+path,{
      ...options,
      headers:{Accept:'application/json',Authorization:'Bearer '+authToken(),...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||payload.message||`Terminal request failed (${response.status})`);
    return payload.data??payload;
  };

  const activeSessionId=()=>root?.querySelector('#itwsRtTabs .itws-rt-tab.active')?.dataset?.terminalId||'';
  const directMode=()=>root?.classList.contains('itws-rt-direct-mode')!==false;

  const setConnection=(state,ok,message='')=>{
    if(!state?.badge)return;
    state.badge.classList.toggle('bad',!ok);
    state.badge.textContent=ok?'PTY connected':(message||'PTY reconnecting');
  };

  const queueInput=(state,data)=>{
    if(!state||!data||state.disposed)return;
    state.inputQueue+=String(data);
    if(state.inputTimer)return;
    state.inputTimer=window.setTimeout(()=>flushInput(state),16);
  };

  const flushInput=state=>{
    if(!state||state.disposed)return;
    if(state.inputTimer){clearTimeout(state.inputTimer);state.inputTimer=0}
    const payload=state.inputQueue;
    state.inputQueue='';
    if(!payload)return;
    const chunks=[];
    for(let i=0;i<payload.length;i+=32000)chunks.push(payload.slice(i,i+32000));
    state.inputChain=state.inputChain.then(async()=>{
      for(const data of chunks){
        await apiRequest('/api/it-solutions/terminal/sessions/'+encodeURIComponent(state.id)+'/input',{
          method:'POST',body:JSON.stringify({data}),
        });
      }
      setConnection(state,true);
    }).catch(error=>setConnection(state,false,error.message||'Input failed'));
  };

  const resizeRemote=state=>{
    if(!state||state.disposed||!state.term)return;
    const cols=Math.max(40,Math.min(240,state.term.cols||120));
    const rows=Math.max(12,Math.min(80,state.term.rows||32));
    if(state.lastCols===cols&&state.lastRows===rows)return;
    state.lastCols=cols;state.lastRows=rows;
    void apiRequest('/api/it-solutions/terminal/sessions/'+encodeURIComponent(state.id)+'/resize',{
      method:'POST',body:JSON.stringify({cols,rows}),
    }).catch(error=>setConnection(state,false,error.message||'Resize failed'));
  };

  const fitState=state=>{
    if(!state||state.disposed||!state.pane?.classList.contains('active'))return;
    try{state.fit.fit()}catch{}
    resizeRemote(state);
  };

  const pollState=async state=>{
    if(!state||state.disposed||state.polling)return;
    state.polling=true;
    try{
      const data=await apiRequest('/api/it-solutions/terminal/sessions/'+encodeURIComponent(state.id)+'/output?cursor='+encodeURIComponent(String(state.cursor||0)));
      if(data.reset){
        try{state.term.reset();state.term.clear()}catch{}
        state.cursor=0;
      }
      if(data.data)state.term.write(String(data.data));
      state.cursor=Number(data.cursor)||state.cursor||0;
      state.alive=data.alive!==false;
      state.term.options.disableStdin=!state.alive||!directMode();
      setConnection(state,true);
      if(data.exitCode!==null&&data.exitCode!==undefined&&!state.exitShown){
        state.exitShown=true;
        state.term.writeln(`\r\n\x1b[90m[process exited with code ${data.exitCode}]\x1b[0m`);
      }
    }catch(error){
      setConnection(state,false,error.message||'PTY connection interrupted');
    }finally{state.polling=false}
  };

  const makeState=id=>{
    if(states.has(id))return states.get(id);
    const pane=document.createElement('div');
    pane.className='itws-xterm-pane';
    pane.dataset.sessionId=id;
    const badge=document.createElement('span');
    badge.className='itws-xterm-connection';
    badge.textContent='PTY connecting';
    pane.appendChild(badge);
    host.appendChild(pane);

    const TerminalCtor=window.Terminal;
    const FitCtor=window.FitAddon?.FitAddon;
    if(typeof TerminalCtor!=='function'||typeof FitCtor!=='function'){
      badge.classList.add('bad');badge.textContent='Terminal emulator unavailable';
      return null;
    }

    const term=new TerminalCtor({
      cursorBlink:true,
      cursorStyle:'block',
      cursorInactiveStyle:'outline',
      scrollback:12000,
      allowTransparency:false,
      convertEol:false,
      disableStdin:!directMode(),
      fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize:14,
      fontWeight:'500',
      lineHeight:1.18,
      letterSpacing:0,
      theme:{
        background:'#06131d',foreground:'#d7e8ef',cursor:'#50e39a',cursorAccent:'#06131d',
        selectionBackground:'#245774',black:'#07151f',red:'#ff6b6b',green:'#50e39a',yellow:'#f3c969',
        blue:'#61a9ff',magenta:'#c792ea',cyan:'#56d4dd',white:'#e8f3f7',brightBlack:'#6f8794',
        brightRed:'#ff8c8c',brightGreen:'#75efb2',brightYellow:'#ffe08a',brightBlue:'#8cc3ff',
        brightMagenta:'#d9a7f2',brightCyan:'#8ae7ec',brightWhite:'#ffffff'
      },
      scrollOnUserInput:true,
      rightClickSelectsWord:true,
      macOptionIsMeta:true,
      allowProposedApi:false,
    });
    const fit=new FitCtor();
    term.loadAddon(fit);
    term.open(pane);

    const state={id,pane,badge,term,fit,cursor:0,polling:false,disposed:false,alive:true,inputQueue:'',inputTimer:0,inputChain:Promise.resolve(),lastCols:0,lastRows:0,exitShown:false};
    states.set(id,state);

    term.onData(data=>{
      if(state.id!==activeSessionId()||!directMode()||!state.alive)return;
      queueInput(state,data);
    });
    term.onResize(()=>resizeRemote(state));
    term.onSelectionChange(()=>{});

    const ro=new ResizeObserver(()=>window.requestAnimationFrame(()=>fitState(state)));
    ro.observe(pane);state.resizeObserver=ro;
    window.setTimeout(()=>{fitState(state);term.focus();void pollState(state)},40);
    return state;
  };

  const disposeState=state=>{
    if(!state||state.disposed)return;
    state.disposed=true;
    if(state.inputTimer)clearTimeout(state.inputTimer);
    try{state.resizeObserver?.disconnect()}catch{}
    try{state.term?.dispose()}catch{}
    state.pane?.remove();
    states.delete(state.id);
  };

  const copySelection=async state=>{
    if(!state?.term)return false;
    const selected=state.term.getSelection();
    if(!selected)return false;
    try{await navigator.clipboard.writeText(selected);return true}catch{return false}
  };

  const sync=()=>{
    if(!root||!host)return;
    const tabs=[...root.querySelectorAll('#itwsRtTabs .itws-rt-tab[data-terminal-id]')];
    const ids=new Set(tabs.map(tab=>tab.dataset.terminalId).filter(Boolean));
    ids.forEach(id=>makeState(id));
    [...states.values()].forEach(state=>{if(!ids.has(state.id))disposeState(state)});

    const active=activeSessionId();
    states.forEach(state=>{
      const on=state.id===active;
      state.pane.classList.toggle('active',on);
      state.term.options.disableStdin=!on||!directMode()||!state.alive;
      if(on){window.requestAnimationFrame(()=>{fitState(state);if(directMode())state.term.focus()})}
    });
    const directButton=root.querySelector('[data-rt-input-mode="direct"]');
    if(directButton)directButton.textContent='⌨ Terminal';
    const hint=root.querySelector('#itwsRtInputHint');
    if(hint)hint.textContent=directMode()
      ?'Type directly at the live PTY cursor. Bash, editors, Ctrl keys, arrows, paste and interactive programs run in the terminal.'
      :'Use the command box to send complete commands while terminal output remains live above.';
  };

  const enhance=terminalRoot=>{
    if(!terminalRoot||terminalRoot.dataset.xtermReady==='1')return;
    const shell=terminalRoot.querySelector('#itwsRtShell');
    const anchor=terminalRoot.querySelector('.itws-rt-terminal-surface')||terminalRoot.querySelector('#itwsRtScreen');
    if(!shell||!anchor||typeof window.Terminal!=='function'||typeof window.FitAddon?.FitAddon!=='function')return;
    root=terminalRoot;
    root.dataset.xtermReady='1';
    root.classList.add('itws-xterm-ready');

    host=document.createElement('div');
    host.className='itws-xterm-host';
    host.id='itwsXtermHost';
    anchor.before(host);

    root.querySelectorAll('[data-rt-input-mode]').forEach(button=>button.addEventListener('click',()=>{
      window.setTimeout(()=>{
        sync();
        const state=states.get(activeSessionId());
        if(state){state.term.options.disableStdin=!directMode()||!state.alive;if(directMode())state.term.focus()}
      },70);
    }));

    root.querySelector('#itwsRtTabs')?.addEventListener('click',()=>window.setTimeout(sync,50));
    host.addEventListener('pointerdown',()=>{
      const state=states.get(activeSessionId());
      if(state&&directMode())window.setTimeout(()=>state.term.focus(),0);
    });

    const copyButton=root.querySelector('#itwsRtCopy');
    copyButton?.addEventListener('click',event=>{
      const state=states.get(activeSessionId());
      if(!state?.term?.hasSelection())return;
      event.preventDefault();event.stopImmediatePropagation();
      const old=copyButton.textContent;
      void copySelection(state).then(ok=>{
        copyButton.textContent=ok?'Copied selection':'Copy failed';
        window.setTimeout(()=>{copyButton.textContent=old;if(directMode())state.term.focus()},1200);
      });
    },true);

    root.querySelector('#itwsRtLatest')?.addEventListener('click',()=>{
      const state=states.get(activeSessionId());
      state?.term?.scrollToBottom();
      if(state&&directMode())state.term.focus();
    },true);

    new MutationObserver(sync).observe(root.querySelector('#itwsRtTabs'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    sync();
    syncTimer=window.setInterval(()=>{
      sync();
      states.forEach(state=>{if(state.alive)void pollState(state)});
    },90);
    window.addEventListener('beforeunload',()=>{if(syncTimer)clearInterval(syncTimer)},{once:true});
  };

  const scan=()=>document.querySelectorAll('#itwsRealTerminal').forEach(enhance);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  window.setInterval(scan,1000);
})();
