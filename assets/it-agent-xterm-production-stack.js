/* SULANDRA_XTERM_PRODUCTION_STACK_V2
   Full xterm browser runtime over native WSS binary PTY streams. */
(()=>{
  'use strict';
  if(window.__SULANDRA_XTERM_PRODUCTION_STACK_V2__)return;
  window.__SULANDRA_XTERM_PRODUCTION_STACK_V2__=true;

  const Runtime=window.SulandraTerminalRuntime;
  const WSS_ORIGIN='wss://sulandra-coding-terminal-worker-production.up.railway.app';
  const states=new Map();
  const readySessions=window.__SULANDRA_XTERM_WSS_READY_SESSIONS__ instanceof Set?window.__SULANDRA_XTERM_WSS_READY_SESSIONS__:new Set();
  window.__SULANDRA_XTERM_WSS_READY_SESSIONS__=readySessions;
  let root=null;
  let host=null;
  let syncTimer=0;

  const restBridge=()=>window.__SULANDRA_TERMINAL_REST_BRIDGE__;
  const authToken=()=>sessionStorage.getItem('sulandra:admin:access-token')
    ||localStorage.getItem('sulandra:admin:access-token')
    ||sessionStorage.getItem('sulandra:employee:access-token')
    ||localStorage.getItem('sulandra:employee:access-token')
    ||localStorage.getItem('token')||'';
  const base64url=value=>{
    const bytes=new TextEncoder().encode(String(value||''));
    let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  };
  const activeSessionId=()=>root?.querySelector('#itwsRtTabs .itws-rt-tab.active')?.dataset?.terminalId||'';
  const directMode=()=>root?.classList.contains('itws-rt-direct-mode')!==false;

  const addToolbarButton=(id,label,title)=>{
    let button=root?.querySelector('#'+id);if(button)return button;
    const tools=root?.querySelector('.itws-rt-input-switch')||root?.querySelector('.itws-rt-foot');
    if(!tools)return null;
    button=document.createElement('button');button.type='button';button.id=id;button.className='itws-rt-copy';button.textContent=label;button.title=title;
    tools.appendChild(button);return button;
  };

  const renderStatus=(state,text,bad=false)=>{
    if(!state?.badge)return;
    state.badge.textContent=text;
    state.badge.classList.toggle('bad',bad);
  };

  const updateFallbackClass=()=>{
    if(!root)return;
    const state=states.get(activeSessionId());
    root.classList.toggle('itws-xterm-fallback-active',!state?.connected);
  };
  const setTransportReady=(state,connected)=>{
    if(!state)return;
    const next=Boolean(connected);
    const changed=state.connected!==next;
    state.connected=next;
    if(next)readySessions.add(state.id);else readySessions.delete(state.id);
    updateFallbackClass();
    if(changed)window.dispatchEvent(new CustomEvent('sulandra:xterm-wss-state',{detail:{sessionId:state.id,connected:next}}));
  };

  const sendBinary=(state,data)=>{
    if(!state?.ws||state.ws.readyState!==WebSocket.OPEN||!data)return false;
    state.ws.send(new TextEncoder().encode(String(data)));
    return true;
  };
  const sendInput=(state,data)=>{
    if(!state||data===undefined||data===null)return false;
    if(sendBinary(state,data))return true;
    Promise.resolve(restBridge()?.sendInput?.(state.id,data)).catch(error=>renderStatus(state,error?.message||'REST terminal input failed',true));
    return true;
  };
  const writeRestOutput=(state,data,reset=false)=>{
    if(!state||state.connected||data===undefined||data===null)return;
    if(reset)state.term.reset();
    if(String(data))state.term.write(String(data));
  };
  const hydrateState=async state=>{
    if(!state||state.disposed||state.connected)return;
    let snapshot=restBridge()?.snapshot?.(state.id);
    if(!snapshot?.data){
      try{snapshot=await restBridge()?.hydrate?.(state.id)}
      catch(error){renderStatus(state,error?.message||'REST PTY hydration failed',true);return}
    }
    if(state.disposed||state.connected)return;
    if(snapshot?.data){
      writeRestOutput(state,snapshot.data,true);
      state.hydrated=true;
      renderStatus(state,'REST PTY active · WSS reconnecting');
    }
    if(directMode()&&state.id===activeSessionId())requestAnimationFrame(()=>state.term.focus());
  };
  const sendControl=(state,message)=>{
    if(!state?.ws||state.ws.readyState!==WebSocket.OPEN)return false;
    state.ws.send(JSON.stringify(message));return true;
  };

  const fallbackRenderer=state=>{
    if(state.renderer==='canvas')return;
    try{state.webgl?.dispose()}catch{}
    state.webgl=null;
    try{
      const canvas=new Runtime.CanvasAddon();
      state.term.loadAddon(canvas);state.canvas=canvas;state.renderer='canvas';
      renderStatus(state,state.connected?'WSS · Canvas':'WSS connecting…');
    }catch{state.renderer='dom';renderStatus(state,state.connected?'WSS · DOM':'WSS connecting…')}
  };

  const loadCapabilities=state=>{
    const fit=new Runtime.FitAddon();state.term.loadAddon(fit);state.fit=fit;
    const links=new Runtime.WebLinksAddon();state.term.loadAddon(links);state.links=links;
    const search=new Runtime.SearchAddon();state.term.loadAddon(search);state.search=search;
    const unicode=new Runtime.Unicode11Addon();state.term.loadAddon(unicode);state.unicode=unicode;
    try{state.term.unicode.activeVersion='11'}catch{}
    const serializer=new Runtime.SerializeAddon();state.term.loadAddon(serializer);state.serializer=serializer;
    try{
      const image=new Runtime.ImageAddon({
        enableSizeReports:true,sixelSupport:true,sixelScrolling:true,sixelPaletteLimit:256,sixelSizeLimit:25_000_000,
        storageLimit:96,showPlaceholder:true,iipSupport:true,iipSizeLimit:20_000_000,pixelLimit:16_777_216,
      });
      state.term.loadAddon(image);state.image=image;
    }catch(error){console.warn('[Sulandra Terminal] image addon unavailable',error)}
  };

  const fitState=state=>{
    if(!state||state.disposed||!state.pane.classList.contains('active'))return;
    try{state.fit.fit()}catch{}
    sendControl(state,{type:'resize',cols:Math.max(40,Math.min(240,state.term.cols||120)),rows:Math.max(12,Math.min(80,state.term.rows||32))});
  };

  const scheduleReconnect=(state,minimumDelay=0)=>{
    if(state.disposed||state.reconnectTimer)return;
    state.reconnects=(state.reconnects||0)+1;
    const delay=Math.max(minimumDelay,Math.min(10_000,400*Math.pow(1.7,Math.min(state.reconnects,7))));
    state.reconnectTimer=setTimeout(()=>{state.reconnectTimer=0;connect(state)},delay);
  };

  const connect=state=>{
    if(!state||state.disposed)return;
    const token=authToken();
    if(!token){setTransportReady(state,false);renderStatus(state,'Authentication required',true);scheduleReconnect(state,5_000);return}
    if(state.ws&&(state.ws.readyState===WebSocket.OPEN||state.ws.readyState===WebSocket.CONNECTING))return;
    setTransportReady(state,false);
    renderStatus(state,state.reconnects?'WSS reconnecting…':'WSS connecting…');
    let ws;
    try{ws=new WebSocket(`${WSS_ORIGIN}/ws/sessions/${encodeURIComponent(state.id)}`,['sulandra-terminal.v2','auth.'+base64url(token)])}
    catch(error){renderStatus(state,'WSS unavailable',true);scheduleReconnect(state);return}
    state.ws=ws;ws.binaryType='arraybuffer';
    if(state.connectTimer)clearTimeout(state.connectTimer);
    state.connectTimer=setTimeout(()=>{
      if(state.disposed||state.ws!==ws||ws.readyState!==WebSocket.CONNECTING)return;
      state.connectTimer=0;
      state.ws=null;
      renderStatus(state,state.hydrated?'REST PTY active · WSS timed out':'WSS timed out · REST fallback active',true);
      try{ws.close()}catch{}
      scheduleReconnect(state);
    },8_000);
    ws.onopen=()=>{
      if(state.ws!==ws){try{ws.close(1000,'Stale terminal connection')}catch{}return}
      if(state.connectTimer){clearTimeout(state.connectTimer);state.connectTimer=0}
      state.reconnects=0;setTransportReady(state,true);renderStatus(state,`WSS · ${state.renderer==='webgl'?'WebGL':state.renderer==='canvas'?'Canvas':'DOM'}`);
      fitState(state);if(directMode()&&state.id===activeSessionId())state.term.focus();
    };
    ws.onmessage=async event=>{
      if(typeof event.data==='string'){
        try{const message=JSON.parse(event.data);if(message.type==='resized')return}catch{}
        state.term.write(event.data);return;
      }
      if(event.data instanceof ArrayBuffer){state.term.write(new Uint8Array(event.data));return}
      if(event.data instanceof Blob){state.term.write(new Uint8Array(await event.data.arrayBuffer()))}
    };
    ws.onerror=()=>{
      if(state.ws!==ws)return;
      setTransportReady(state,false);renderStatus(state,'WSS connection error',true);
    };
    ws.onclose=event=>{
      if(state.ws!==ws)return;
      if(state.connectTimer){clearTimeout(state.connectTimer);state.connectTimer=0}
      state.ws=null;setTransportReady(state,false);
      if(state.disposed)return;
      const rejected=event.code===1008;
      renderStatus(state,rejected?'WSS auth rejected · fallback active':'WSS reconnecting · fallback active',rejected);
      scheduleReconnect(state,rejected?15_000:0);
    };
  };

  const makeState=id=>{
    if(states.has(id))return states.get(id);
    const pane=document.createElement('div');pane.className='itws-xterm-pane';pane.dataset.sessionId=id;
    const badge=document.createElement('span');badge.className='itws-xterm-connection';badge.textContent='WSS connecting…';pane.appendChild(badge);host.appendChild(pane);
    const term=new Runtime.Terminal({
      cursorBlink:true,cursorStyle:'block',cursorInactiveStyle:'outline',scrollback:25_000,allowTransparency:false,convertEol:false,
      disableStdin:!directMode(),fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',fontSize:14,fontWeight:'500',lineHeight:1.18,
      scrollOnUserInput:true,rightClickSelectsWord:true,macOptionIsMeta:true,allowProposedApi:false,
      theme:{background:'#06131d',foreground:'#d7e8ef',cursor:'#50e39a',cursorAccent:'#06131d',selectionBackground:'#245774',black:'#07151f',red:'#ff6b6b',green:'#50e39a',yellow:'#f3c969',blue:'#61a9ff',magenta:'#c792ea',cyan:'#56d4dd',white:'#e8f3f7',brightBlack:'#6f8794',brightRed:'#ff8c8c',brightGreen:'#75efb2',brightYellow:'#ffe08a',brightBlue:'#8cc3ff',brightMagenta:'#d9a7f2',brightCyan:'#8ae7ec',brightWhite:'#ffffff'}
    });
    const state={id,pane,badge,term,fit:null,search:null,serializer:null,image:null,unicode:null,links:null,webgl:null,canvas:null,renderer:'dom',ws:null,connected:false,hydrated:false,reconnects:0,reconnectTimer:0,connectTimer:0,disposed:false};
    states.set(id,state);loadCapabilities(state);term.open(pane);
    const snapshot=restBridge()?.snapshot?.(id);
    if(snapshot?.data){writeRestOutput(state,snapshot.data,true);state.hydrated=true}
    void hydrateState(state);
    try{
      const webgl=new Runtime.WebglAddon();term.loadAddon(webgl);state.webgl=webgl;state.renderer='webgl';
      if(typeof webgl.onContextLoss==='function')webgl.onContextLoss(()=>fallbackRenderer(state));
    }catch{fallbackRenderer(state)}
    term.onData(data=>{if(state.id===activeSessionId()&&directMode())sendInput(state,data)});
    term.onResize(()=>fitState(state));
    const observer=new ResizeObserver(()=>requestAnimationFrame(()=>fitState(state)));observer.observe(pane);state.observer=observer;
    setTimeout(()=>{fitState(state);if(directMode()&&state.id===activeSessionId())state.term.focus();connect(state)},40);return state;
  };

  const disposeState=state=>{
    if(!state||state.disposed)return;state.disposed=true;setTransportReady(state,false);
    if(state.reconnectTimer)clearTimeout(state.reconnectTimer);
    if(state.connectTimer)clearTimeout(state.connectTimer);
    try{state.ws?.close(1000,'Terminal tab closed')}catch{}
    try{state.observer?.disconnect()}catch{}
    for(const addon of ['webgl','canvas','image','serializer','search','links','unicode','fit'])try{state[addon]?.dispose?.()}catch{}
    try{state.term.dispose()}catch{}state.pane.remove();states.delete(state.id);updateFallbackClass();
  };

  const activeState=()=>states.get(activeSessionId());
  const copySelection=async()=>{const state=activeState();const text=state?.term.getSelection();if(!text)return false;try{await navigator.clipboard.writeText(text);return true}catch{return false}};
  const exportHistory=(html=false)=>{
    const state=activeState();if(!state?.serializer)return;
    const text=html?state.serializer.serializeAsHTML({includeGlobalBackground:true}):state.serializer.serialize({scrollback:25_000});
    const blob=new Blob([text],{type:html?'text/html;charset=utf-8':'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`sulandra-terminal-${state.id}.${html?'html':'txt'}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const search=()=>{const state=activeState();if(!state?.search)return;const query=window.prompt('Search terminal history (regular expression supported):');if(query)state.search.findNext(query,{regex:true,caseSensitive:false,incremental:true})};

  const sync=()=>{
    if(!root||!host)return;
    const tabs=[...root.querySelectorAll('#itwsRtTabs .itws-rt-tab[data-terminal-id]')];const ids=new Set(tabs.map(tab=>tab.dataset.terminalId).filter(Boolean));
    ids.forEach(id=>makeState(id));[...states.values()].forEach(state=>{if(!ids.has(state.id))disposeState(state)});
    const active=activeSessionId();states.forEach(state=>{const on=state.id===active;state.pane.classList.toggle('active',on);state.term.options.disableStdin=!on||!directMode();if(on)requestAnimationFrame(()=>{fitState(state);if(directMode())state.term.focus()})});
    updateFallbackClass();
    const hint=root.querySelector('#itwsRtInputHint');if(hint)hint.textContent=states.get(active)?.connected?(directMode()?'Native WSS PTY: type at the live cursor; tmux preserves the shell across reconnects.':'Command box sends complete commands; live WSS output remains above.'):(directMode()?'WSS is reconnecting; xterm remains interactive through the authenticated REST PTY bridge.':'WSS is reconnecting; Command box output continues in xterm through the REST PTY bridge.');
  };

  const enhance=terminalRoot=>{
    if(!Runtime?.Terminal||terminalRoot.dataset.productionXterm==='1')return;
    const shell=terminalRoot.querySelector('#itwsRtShell');const anchor=terminalRoot.querySelector('.itws-rt-terminal-surface')||terminalRoot.querySelector('#itwsRtScreen');if(!shell||!anchor)return;
    root=terminalRoot;root.dataset.productionXterm='1';root.classList.add('itws-xterm-ready','itws-xterm-fallback-active');
    host=document.createElement('div');host.className='itws-xterm-host';host.id='itwsXtermHost';anchor.before(host);
    addToolbarButton('itwsRtSearch','Search','Regex search terminal scrollback');
    addToolbarButton('itwsRtExport','Export','Export terminal history as text');
    addToolbarButton('itwsRtExportHtml','Export HTML','Export terminal history as HTML');
    root.addEventListener('click',event=>{
      const target=event.target instanceof Element?event.target:null;if(!target)return;
      if(target.closest('#itwsRtSearch')){event.preventDefault();search()}
      if(target.closest('#itwsRtExport')){event.preventDefault();exportHistory(false)}
      if(target.closest('#itwsRtExportHtml')){event.preventDefault();exportHistory(true)}
      if(target.closest('#itwsRtCtrlC')){event.preventDefault();event.stopImmediatePropagation();sendInput(activeState(),'\x03')}
    },true);
    document.addEventListener('keydown',event=>{
      if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='f'&&root?.contains(document.activeElement)){event.preventDefault();search()}
    },true);
    root.querySelector('#itwsRtCopy')?.addEventListener('click',event=>{const state=activeState();if(!state?.term.hasSelection())return;event.preventDefault();event.stopImmediatePropagation();void copySelection()},true);
    root.querySelector('#itwsRtLatest')?.addEventListener('click',()=>{const state=activeState();if(state){state.term.scrollToBottom();state.term.focus()}} ,true);
    root.querySelectorAll('[data-rt-input-mode]').forEach(button=>button.addEventListener('click',()=>setTimeout(sync,60)));
    root.querySelector('#itwsRtTabs')?.addEventListener('click',()=>setTimeout(sync,50));
    host.addEventListener('pointerdown',()=>{const state=activeState();if(state&&directMode())setTimeout(()=>state.term.focus(),0)});
    new MutationObserver(sync).observe(root.querySelector('#itwsRtTabs'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});sync();syncTimer=setInterval(sync,500);
  };

  window.addEventListener('sulandra:terminal-rest-output',event=>{
    const detail=event?.detail||{};
    const state=states.get(String(detail.sessionId||''));
    writeRestOutput(state,detail.data,Boolean(detail.reset));
  });
  const scan=()=>document.querySelectorAll('#itwsRealTerminal').forEach(enhance);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('beforeunload',()=>{if(syncTimer)clearInterval(syncTimer);for(const state of states.values())disposeState(state)},{once:true});
})();
