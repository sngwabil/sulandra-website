/* CODEBASE_TERMINAL_SESSION_DURABILITY_V1
 * Durable standalone Codebase terminal sessions.
 * - Selects a non-expired Sulandra JWT before terminal/API reconnects.
 * - Persists live Codebase terminal tab/session metadata in sessionStorage.
 * - Reconnects a refreshed tab to the existing /pty session instead of creating
 *   a new terminal session.
 * - Makes one terminal pane the explicit input target with a visible active
 *   border and blinking cursor.
 */
(()=>{
  'use strict';
  if(window.__SULANDRA_CODEBASE_TERMINAL_SESSION_DURABILITY_V1__)return;
  window.__SULANDRA_CODEBASE_TERMINAL_SESSION_DURABILITY_V1__=true;

  const STATE_KEY='sulandra:codebase:terminal-session-state:v1';
  const ACTIVE_ATTR='data-codebase-active-terminal';
  const styleId='codebase-terminal-session-durability-style';
  let activeTerminalId='';
  let restoring=false;
  let persistTimer=0;
  let bindTimer=0;

  const tabs=()=>{try{return Array.isArray(openTabs)?openTabs:[]}catch{return []}};
  const terminals=()=>{try{return activeTerminals&&typeof activeTerminals==='object'?activeTerminals:{}}catch{return {}}};
  const sameOriginOpener=()=>{try{return window.opener&&!window.opener.closed&&window.opener.location.origin===window.location.origin?window.opener:null}catch{return null}};

  const decodeJwtPayload=token=>{
    const parts=String(token||'').split('.');
    if(parts.length!==3)return null;
    try{
      const normalized=parts[1].replace(/-/g,'+').replace(/_/g,'/');
      const padded=normalized+'='.repeat((4-normalized.length%4)%4);
      return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(padded),char=>'%'+char.charCodeAt(0).toString(16).padStart(2,'0')).join('')));
    }catch{return null}
  };
  const tokenExpiry=token=>{
    const payload=decodeJwtPayload(token);
    return payload&&Number.isFinite(Number(payload.exp))?Number(payload.exp)*1000:0;
  };
  const usableToken=token=>{
    const value=String(token||'').trim();
    if(!value)return false;
    const expiry=tokenExpiry(value);
    return !expiry||expiry>Date.now()+30_000;
  };
  const fromStorage=(storage,key)=>{try{return String(storage?.getItem(key)||'').trim()}catch{return ''}};
  const bestInGroup=values=>{
    const usable=[...new Set(values.map(value=>String(value||'').trim()).filter(usableToken))];
    usable.sort((a,b)=>tokenExpiry(b)-tokenExpiry(a));
    return usable[0]||'';
  };
  const freshestToken=()=>{
    const configured=String(document.getElementById('cfg-token')?.value||'').trim();
    if(usableToken(configured))return configured;
    const opener=sameOriginOpener();
    const groups=[
      [
        fromStorage(sessionStorage,'sulandra:admin:access-token'),
        fromStorage(sessionStorage,'sulandra:employee:access-token'),
        fromStorage(opener?.sessionStorage,'sulandra:admin:access-token'),
        fromStorage(opener?.sessionStorage,'sulandra:employee:access-token'),
      ],
      [
        fromStorage(localStorage,'sulandra:admin:access-token'),
        fromStorage(localStorage,'sulandra:employee:access-token'),
        fromStorage(opener?.localStorage,'sulandra:admin:access-token'),
        fromStorage(opener?.localStorage,'sulandra:employee:access-token'),
      ],
      [
        fromStorage(sessionStorage,'token'),fromStorage(localStorage,'token'),
        fromStorage(opener?.sessionStorage,'token'),fromStorage(opener?.localStorage,'token'),
      ],
    ];
    for(const group of groups){const token=bestInGroup(group);if(token)return token}
    return '';
  };
  const syncFreshToken=()=>{
    const token=freshestToken();
    const input=document.getElementById('cfg-token');
    if(token&&input&&input.value!==token)input.value=token;
    return token;
  };
  if(window.RAILWAY_CONFIG)window.RAILWAY_CONFIG.getToken=freshestToken;

  const installStyle=()=>{
    if(document.getElementById(styleId))return;
    const style=document.createElement('style');
    style.id=styleId;
    style.textContent=`
      .terminal-view{position:relative!important;transition:box-shadow .12s ease,border-color .12s ease!important}
      .terminal-view[${ACTIVE_ATTR}="true"]{box-shadow:inset 0 0 0 1px rgba(79,195,247,.88),inset 0 0 22px rgba(79,195,247,.045)!important}
      .terminal-view:not([${ACTIVE_ATTR}="true"]) .xterm-cursor-layer{opacity:0!important}
      .terminal-view[${ACTIVE_ATTR}="true"] .xterm-cursor-layer{opacity:1!important}
    `;
    document.head.appendChild(style);
  };

  const currentLayout=()=>{
    try{
      if(isVerticalStack)return 'vertical';
      if(activeGridClass==='stack-2-1'||activeGridClass==='stack-1-2')return activeGridClass;
      return Number(gridMode)||1;
    }catch{return 1}
  };
  const terminalDescriptors=()=>tabs().filter(tab=>tab?.type==='terminal').map(tab=>({
    id:String(tab.id||''),name:String(tab.name||'Terminal'),type:'terminal',color:String(tab.color||''),
    sessionId:String(tab.sessionId||''),workspaceId:String(tab.workspaceId||''),
  })).filter(tab=>tab.id);
  const persistNow=()=>{
    try{
      const payload={version:1,savedAt:Date.now(),layout:currentLayout(),activeTerminalId,termCounter:typeof termCounter==='number'?termCounter:1,terminals:terminalDescriptors()};
      sessionStorage.setItem(STATE_KEY,JSON.stringify(payload));
    }catch{}
  };
  const schedulePersist=()=>{clearTimeout(persistTimer);persistTimer=setTimeout(persistNow,60)};

  const focusTerminal=(tabId,{force=false}={})=>{
    if(!tabId)return;
    activeTerminalId=String(tabId);
    installStyle();
    for(const[id,term]of Object.entries(terminals())){
      const selected=id===activeTerminalId;
      const container=document.getElementById(`xterm-container-${id}`);
      if(container){container.setAttribute(ACTIVE_ATTR,selected?'true':'false');container.dataset.codebaseFocused=selected?'true':'false'}
      try{term.options.cursorBlink=selected}catch{}
      if(selected&&force){
        try{term.focus?.()}catch{}
        if(container){try{container.focus({preventScroll:true})}catch{try{container.focus()}catch{}}}
      }
    }
    schedulePersist();
  };

  const bindTerminalTargets=()=>{
    installStyle();
    for(const[id,term]of Object.entries(terminals())){
      const container=document.getElementById(`xterm-container-${id}`);
      if(!container)continue;
      if(container.dataset.codebaseDurableFocusBound!=='1'){
        container.dataset.codebaseDurableFocusBound='1';
        const activate=()=>focusTerminal(id,{force:false});
        container.addEventListener('pointerdown',activate,true);
        container.addEventListener('touchstart',activate,{capture:true,passive:true});
        container.addEventListener('click',activate,true);
        container.addEventListener('focusin',activate,true);
      }
      const selected=id===activeTerminalId;
      container.setAttribute(ACTIVE_ATTR,selected?'true':'false');
      try{term.options.cursorBlink=selected}catch{}
    }
  };
  const scheduleBindings=()=>{clearTimeout(bindTimer);bindTimer=setTimeout(bindTerminalTargets,30);setTimeout(bindTerminalTargets,120)};

  const previousInitXterm=window.initXterm;
  if(typeof previousInitXterm==='function'){
    window.initXterm=function(containerId,tabId,...rest){
      syncFreshToken();
      const tab=tabs().find(item=>item?.id===tabId);
      const wasExisting=Boolean(terminals()[tabId]);
      const NativeWebSocket=window.WebSocket;
      let patched=false;
      if(!wasExisting&&tab?.sessionId&&typeof NativeWebSocket==='function'){
        const sessionId=String(tab.sessionId).trim();
        const workspaceId=String(tab.workspaceId||'').trim();
        function ResumeWebSocket(url,protocols){
          let target=String(url||'');
          try{
            const parsed=new URL(target,window.location.href);
            if(parsed.pathname.endsWith('/pty')){
              parsed.searchParams.set('sessionId',sessionId);
              if(workspaceId)parsed.searchParams.set('workspaceId',workspaceId);
              parsed.searchParams.set('resume','1');
              target=parsed.toString();
            }
          }catch{}
          return protocols===undefined?new NativeWebSocket(target):new NativeWebSocket(target,protocols);
        }
        ResumeWebSocket.prototype=NativeWebSocket.prototype;
        for(const key of ['CONNECTING','OPEN','CLOSING','CLOSED'])ResumeWebSocket[key]=NativeWebSocket[key];
        window.WebSocket=ResumeWebSocket;
        patched=true;
      }
      let result;
      try{result=previousInitXterm.call(this,containerId,tabId,...rest)}finally{if(patched)window.WebSocket=NativeWebSocket}
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const term=terminals()[tabId];
        const ws=term?.__sulandraWs;
        if(ws&&ws.dataset?.codebaseDurabilityBound!=='1'){
          try{ws.dataset.codebaseDurabilityBound='1'}catch{}
        }
        if(ws&&!ws.__codebaseDurabilityBound){
          ws.__codebaseDurabilityBound=true;
          ws.addEventListener('message',event=>{
            if(typeof event.data==='string'&&event.data.startsWith('{')){
              try{const control=JSON.parse(event.data);if(control?.type==='session')schedulePersist()}catch{}
            }
          });
          ws.addEventListener('open',schedulePersist);
          ws.addEventListener('close',schedulePersist);
        }
        if(!restoring&&!wasExisting)activeTerminalId=tabId;
        if(activeTerminalId===tabId)focusTerminal(tabId,{force:true});else scheduleBindings();
        schedulePersist();
      }));
      return result;
    };
  }

  const previousOpenTerminal=window.openTerminal;
  if(typeof previousOpenTerminal==='function')window.openTerminal=function(...args){
    const before=new Set(tabs().map(tab=>tab.id));
    const result=previousOpenTerminal.apply(this,args);
    const created=tabs().find(tab=>tab?.type==='terminal'&&!before.has(tab.id));
    if(created)activeTerminalId=created.id;
    scheduleBindings();schedulePersist();
    return result;
  };

  const previousCloseTab=window.closeTab;
  if(typeof previousCloseTab==='function')window.closeTab=function(index,event){
    const closing=tabs()[index];
    const result=previousCloseTab.call(this,index,event);
    if(closing?.id===activeTerminalId){const remaining=terminalDescriptors();activeTerminalId=remaining.at(-1)?.id||remaining[0]?.id||''}
    scheduleBindings();schedulePersist();
    return result;
  };

  const previousSetGridMode=window.setGridMode;
  if(typeof previousSetGridMode==='function')window.setGridMode=function(...args){const result=previousSetGridMode.apply(this,args);scheduleBindings();schedulePersist();return result};
  const previousRenderWorkspace=window.renderWorkspace;
  if(typeof previousRenderWorkspace==='function')window.renderWorkspace=function(...args){const result=previousRenderWorkspace.apply(this,args);scheduleBindings();schedulePersist();return result};

  document.addEventListener('click',event=>{
    const tabEl=event.target instanceof Element?event.target.closest('.tab'):null;
    if(!tabEl||!tabEl.parentElement?.matches('#tab-bar'))return;
    const index=[...tabEl.parentElement.children].indexOf(tabEl);
    const tab=tabs()[index];
    if(tab?.type==='terminal')requestAnimationFrame(()=>focusTerminal(tab.id,{force:true}));
    else if(tab)requestAnimationFrame(()=>{activeTerminalId='';bindTerminalTargets();schedulePersist()});
  },true);

  const restoreState=()=>{
    let state;
    try{state=JSON.parse(sessionStorage.getItem(STATE_KEY)||'null')}catch{return false}
    if(!state||state.version!==1||!Array.isArray(state.terminals)||!state.terminals.length)return false;
    const valid=state.terminals.filter(tab=>/^[A-Za-z0-9_.-]+$/.test(String(tab?.id||''))&&/^[A-Za-z0-9_-]+$/.test(String(tab?.sessionId||'')));
    if(!valid.length)return false;
    restoring=true;
    try{
      const existing=new Set(tabs().map(tab=>tab.id));
      for(const saved of valid){
        if(existing.has(saved.id))continue;
        tabs().push({id:String(saved.id),name:String(saved.name||'Terminal'),type:'terminal',color:String(saved.color||'#66bb6a'),sessionId:String(saved.sessionId),workspaceId:String(saved.workspaceId||'')});
      }
      try{if(Number.isFinite(Number(state.termCounter)))termCounter=Math.max(termCounter,Number(state.termCounter))}catch{}
      activeTerminalId=valid.some(tab=>tab.id===state.activeTerminalId)?String(state.activeTerminalId):String(valid.at(-1)?.id||valid[0].id);
      const layout=state.layout;
      if(typeof window.setGridMode==='function')window.setGridMode(layout==='vertical'||layout==='stack-2-1'||layout==='stack-1-2'?layout:Math.max(1,Math.min(4,Number(layout)||1)));
      else window.renderWorkspace?.();
      scheduleBindings();
      setTimeout(()=>focusTerminal(activeTerminalId,{force:true}),220);
      return true;
    }finally{restoring=false}
  };

  syncFreshToken();installStyle();
  if(!restoreState())scheduleBindings();
  window.addEventListener('pageshow',()=>{syncFreshToken();scheduleBindings()});
  window.addEventListener('focus',syncFreshToken);
  window.addEventListener('storage',syncFreshToken);
  window.addEventListener('pagehide',persistNow);
  window.addEventListener('beforeunload',persistNow);
  setInterval(()=>{syncFreshToken();persistNow()},5_000);
  new MutationObserver(scheduleBindings).observe(document.documentElement,{childList:true,subtree:true});
})();
