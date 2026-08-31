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

  let panel=null,frame=null,loading=null,title=null,portInput=null;
  const closeStatusBoard=()=>{
    if(!document.body?.classList.contains('itws-status-board-open'))return;
    const close=document.querySelector('.itws-status-board-close');
    if(close){close.click();return}
    document.querySelector('.itws-status-board-drawer')?.classList.remove('itws-open');
    document.body?.classList.remove('itws-status-board-open');
  };
  const closePanel=()=>{
    panel?.classList.remove('itws-open');
    document.body?.classList.remove('itws-workspace-panel-open');
    frame?.removeAttribute('src');
    if(loading){loading.hidden=false;loading.textContent='Choose IDE or a preview port.'}
  };
  const makePanel=()=>{
    if(panel)return panel;
    const shell=document.querySelector('#agent .agent-shell');
    if(!shell)return null;
    panel=document.createElement('aside');
    panel.id='itwsWorkspacePanel';
    panel.className='itws-workspace-panel';
    panel.setAttribute('aria-label','Workspace IDE and live preview');
    panel.innerHTML=`<div class="itws-workspace-panel-head"><strong class="itws-workspace-panel-title">Workspace</strong><input class="itws-workspace-port" type="number" min="1024" max="65535" inputmode="numeric" aria-label="Preview port"><button type="button" class="itws-workspace-open-port">Preview</button><button type="button" class="itws-workspace-close" aria-label="Close workspace panel" title="Close">×</button></div><div class="itws-workspace-loading">Choose IDE or a preview port.</div><iframe class="itws-workspace-frame" title="Sulandra workspace IDE or live preview" allow="clipboard-read; clipboard-write; fullscreen"></iframe><div class="itws-workspace-panel-note">Authenticated session-only view. Preview traffic stays inside this isolated workspace; reserved terminal service ports are blocked.</div>`;
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
    panel.classList.add('itws-open');document.body?.classList.add('itws-workspace-panel-open');
    if(port){portInput.value=String(port);try{sessionStorage.setItem(PORT_KEY,String(port))}catch{}}
    title.textContent=port?`Live Preview · :${port}`:'Sulandra IDE';
    loading.hidden=false;loading.textContent=port?`Opening live preview on port ${port}…`:'Opening professional IDE…';
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
    const ide=document.createElement('button');ide.type='button';ide.id='itwsWorkspaceIdeButton';ide.className='itws-workspace-tool';ide.textContent='IDE';ide.title='Open professional browser IDE';
    const preview=document.createElement('button');preview.type='button';preview.id='itwsWorkspacePreviewButton';preview.className='itws-workspace-tool';preview.textContent='Preview';preview.title='Open a live app port in the right panel';
    ide.addEventListener('click',()=>void openWorkspace(null));
    preview.addEventListener('click',()=>void openWorkspace(validPort(sessionStorage.getItem(PORT_KEY))||3000));
    tools.append(ide,preview);host.appendChild(tools);makePanel();return true;
  };
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(target?.closest('#itwsActivity')&&document.body?.classList.contains('itws-workspace-panel-open'))closePanel();
  },true);
  const boot=()=>{if(installTools())return;const observer=new MutationObserver(()=>{if(installTools())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),20000)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.SulandraWorkspacePreview={openIde:()=>openWorkspace(null),openPreview:port=>openWorkspace(validPort(port)),close:closePanel};
})();
