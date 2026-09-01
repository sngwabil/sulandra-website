/* SULANDRA_WORKSPACE_IDE_PREVIEW_V1 */
(()=>{
  'use strict';
  if(window.__SULANDRA_WORKSPACE_IDE_PREVIEW_V1__)return;
  window.__SULANDRA_WORKSPACE_IDE_PREVIEW_V1__=true;

  const GATEWAY='https://sulandra-coding-terminal-worker-production.up.railway.app';
  const PORT_KEY='sulandra:workspace-preview-port';
  const authToken=()=>sessionStorage.getItem('sulandra:admin:access-token')
    ||localStorage.getItem('sulandra:admin:access-token')
    ||sessionStorage.getItem('sulandra:employee:access-token')
    ||localStorage.getItem('sulandra:employee:access-token')
    ||localStorage.getItem('token')||'';
  const activeSessionId=()=>document.querySelector('#itwsRtTabs .itws-rt-tab.active')?.dataset?.terminalId
    ||document.querySelector('.itws-rt-tab.active')?.dataset?.terminalId||'';
  const validPort=value=>{const port=Number(value);return Number.isInteger(port)&&port>=1024&&port<=65535&&![9000,13337].includes(port)?port:null};

  let panel=null,frame=null,loading=null,title=null,portInput=null,boundsRaf=0;
  const closeStatusBoard=()=>{
    if(!document.body?.classList.contains('itws-status-board-open'))return;
    const close=document.querySelector('.itws-status-board-close');
    if(close){close.click();return}
    document.querySelector('.itws-status-board-drawer')?.classList.remove('itws-open');
    document.body?.classList.remove('itws-status-board-open');
  };
  const syncPanelBounds=()=>{
    boundsRaf=0;
    if(!panel?.classList.contains('itws-open')||window.innerWidth<700)return;
    const shell=document.querySelector('#agent .agent-shell');
    const rect=shell?.getBoundingClientRect();
    const rawTop=Number.isFinite(rect?.top)?rect.top:0;
    const top=Math.max(0,Math.min(Math.max(0,window.innerHeight-320),rawTop));
    const height=Math.max(320,window.innerHeight-top);
    panel.style.setProperty('--itws-workspace-panel-top',`${Math.round(top)}px`);
    panel.style.setProperty('--itws-workspace-panel-height',`${Math.round(height)}px`);

    /* The terminal starts lower than the rail because it sits below the
       Engineering Workspace controls. Size it from its own viewport position,
       not from the rail top, so wrapped footer tools never fall below the page. */
    const terminal=document.getElementById('itwsRealTerminal')||document.querySelector('.itws-real-terminal');
    const terminalRect=terminal?.getBoundingClientRect();
    if(Number.isFinite(terminalRect?.top)){
      const terminalTop=Math.max(0,Math.min(window.innerHeight-260,terminalRect.top));
      const terminalHeight=Math.max(360,window.innerHeight-terminalTop);
      document.body?.style.setProperty('--itws-terminal-available-height',`${Math.round(terminalHeight)}px`);
    }
  };
  const queueBounds=()=>{if(boundsRaf)return;boundsRaf=requestAnimationFrame(syncPanelBounds)};
  const focusActiveTerminal=()=>{
    const pane=document.querySelector('#itwsRealTerminal .itws-xterm-pane.active');
    const textarea=pane?.querySelector('.xterm-helper-textarea');
    textarea?.focus?.({preventScroll:true});
  };
  const closePanel=()=>{
    panel?.classList.remove('itws-open','itws-ide-mode','itws-preview-mode');
    panel?.style.removeProperty('--itws-workspace-panel-top');
    panel?.style.removeProperty('--itws-workspace-panel-height');
    document.body?.classList.remove('itws-workspace-panel-open');
    document.body?.style.removeProperty('--itws-terminal-available-height');
    frame?.removeAttribute('src');
    if(loading){loading.hidden=false;loading.textContent='Choose IDE or a preview port.'}
    queueMicrotask(focusActiveTerminal);
  };
  const makePanel=()=>{
    if(panel)return panel;
    const shell=document.querySelector('#agent .agent-shell');
    if(!shell)return null;
    panel=document.createElement('aside');
    panel.id='itwsWorkspacePanel';
    panel.className='itws-workspace-panel';
    panel.setAttribute('aria-label','Workspace IDE and live preview');
    panel.innerHTML=`<div class="itws-workspace-panel-head"><strong class="itws-workspace-panel-title">Workspace</strong><input class="itws-workspace-port" type="number" min="1024" max="65535" inputmode="numeric" aria-label="Preview port"><button type="button" class="itws-workspace-open-port">Preview</button><button type="button" class="itws-workspace-close" aria-label="Close workspace panel" title="Close">×</button></div><div class="itws-workspace-loading" role="status" aria-live="polite">Choose IDE or a preview port.</div><iframe class="itws-workspace-frame" title="Sulandra workspace IDE or live preview" allow="clipboard-read; clipboard-write; fullscreen"></iframe><div class="itws-workspace-panel-note">Authenticated session-only view. IDE and Preview remain inside this workspace rail; reserved terminal service ports are blocked.</div>`;
    shell.appendChild(panel);
    frame=panel.querySelector('.itws-workspace-frame');
    loading=panel.querySelector('.itws-workspace-loading');
    title=panel.querySelector('.itws-workspace-panel-title');
    portInput=panel.querySelector('.itws-workspace-port');
    portInput.value=String(validPort(sessionStorage.getItem(PORT_KEY))||3000);
    panel.querySelector('.itws-workspace-close')?.addEventListener('click',closePanel);
    panel.querySelector('.itws-workspace-open-port')?.addEventListener('click',()=>openWorkspace(validPort(portInput.value)));
    portInput?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void openWorkspace(validPort(portInput.value))}});
    frame?.addEventListener('load',()=>{if(loading)loading.hidden=true});
    return panel;
  };
  const ticket=async(sessionId,port)=>{
    const token=authToken();
    if(!token)throw new Error('Administrator sign-in is required');
    const response=await fetch(`${GATEWAY}/workspace/ticket`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({sessionId,port})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`Workspace access failed (${response.status})`);
    return payload;
  };
  const openWorkspace=async port=>{
    const sessionId=activeSessionId();
    if(!sessionId){window.alert('Open or create a terminal session first.');return}
    if(port!==null&&port!==undefined&&!validPort(port)){window.alert('Use a preview port from 1024–65535. Ports 9000 and 13337 are reserved.');return}
    closeStatusBoard();
    if(!makePanel())return;
    const ideMode=port===null||port===undefined;
    panel.classList.add('itws-open');
    panel.classList.toggle('itws-ide-mode',ideMode);
    panel.classList.toggle('itws-preview-mode',!ideMode);
    document.body?.classList.add('itws-workspace-panel-open');
    queueBounds();
    if(port){portInput.value=String(port);try{sessionStorage.setItem(PORT_KEY,String(port))}catch{}}
    title.textContent=port?`Live Preview · :${port}`:'Sulandra IDE';
    frame.title=port?`Sulandra live preview on port ${port}`:'Sulandra IDE';
    loading.hidden=false;loading.textContent=port?`Opening live preview on port ${port}…`:'Opening Sulandra IDE…';
    try{
      const access=await ticket(sessionId,port??null);
      frame.src=GATEWAY+access.url;
    }catch(error){loading.hidden=false;loading.textContent=error?.message||'Workspace view could not be opened.'}
  };
  const installTools=()=>{
    const root=document.getElementById('itwsRealTerminal')||document.querySelector('.itws-real-terminal');
    if(!root)return false;
    let host=root.querySelector('.itws-rt-input-switch')||root.querySelector('.itws-rt-foot')||root.querySelector('.itws-terminal-footer');
    if(!host)return false;
    if(document.getElementById('itwsWorkspaceIdeButton'))return true;
    const tools=document.createElement('span');tools.className='itws-workspace-tools';
    const ide=document.createElement('button');ide.type='button';ide.id='itwsWorkspaceIdeButton';ide.className='itws-workspace-tool';ide.textContent='IDE';ide.title='Open the Sulandra browser IDE';
    const preview=document.createElement('button');preview.type='button';preview.id='itwsWorkspacePreviewButton';preview.className='itws-workspace-tool';preview.textContent='Preview';preview.title='Open a live app port in the right panel';
    ide.addEventListener('click',()=>void openWorkspace(null));
    preview.addEventListener('click',()=>void openWorkspace(validPort(sessionStorage.getItem(PORT_KEY))||3000));
    tools.append(ide,preview);host.appendChild(tools);makePanel();return true;
  };
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(target?.closest('#itwsActivity')&&document.body?.classList.contains('itws-workspace-panel-open'))closePanel();
  },true);
  window.addEventListener('resize',queueBounds,{passive:true});
  window.addEventListener('scroll',queueBounds,{passive:true});
  const boot=()=>{if(installTools())return;const observer=new MutationObserver(()=>{if(installTools())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),20000)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.SulandraWorkspacePreview={openIde:()=>openWorkspace(null),openPreview:port=>openWorkspace(validPort(port)),close:closePanel};
})();
