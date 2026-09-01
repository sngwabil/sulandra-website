/* SULANDRA_DOCKABLE_ENGINEERING_WORKSPACE_V2 */
(()=>{
  'use strict';
  if(window.__SULANDRA_DOCKABLE_ENGINEERING_WORKSPACE_V2__)return;
  window.__SULANDRA_DOCKABLE_ENGINEERING_WORKSPACE_V2__=true;

  const GATEWAY='https://sulandra-coding-terminal-worker-production.up.railway.app';
  const PORT_KEY='sulandra:workspace-preview-port';
  const LAYOUT_KEY='sulandra:engineering-workspace-layout-v2';
  const MIN_PANEL=280;
  const DEFAULT_SIZES={terminal:52,ide:24,preview:24};
  const panels=new Map();
  let dock=null;
  let row=null;
  let terminalMount=null;
  let maximized=null;
  let resizeRaf=0;

  const authToken=()=>sessionStorage.getItem('sulandra:admin:access-token')
    ||localStorage.getItem('sulandra:admin:access-token')
    ||sessionStorage.getItem('sulandra:employee:access-token')
    ||localStorage.getItem('sulandra:employee:access-token')
    ||localStorage.getItem('token')||'';
  const activeSessionId=()=>document.querySelector('#itwsRtTabs .itws-rt-tab.active')?.dataset?.terminalId
    ||document.querySelector('.itws-rt-tab.active')?.dataset?.terminalId||'';
  const validPort=value=>{const port=Number(value);return Number.isInteger(port)&&port>=1024&&port<=65535&&![9000,13337].includes(port)?port:null};
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

  const readLayout=()=>{
    try{
      const parsed=JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}');
      const sizes={...DEFAULT_SIZES};
      for(const key of Object.keys(sizes)){
        const value=Number(parsed?.sizes?.[key]);
        if(Number.isFinite(value)&&value>=10&&value<=80)sizes[key]=value;
      }
      return {sizes};
    }catch{return {sizes:{...DEFAULT_SIZES}}}
  };
  const layout=readLayout();
  const saveLayout=()=>{
    const sizes={};
    for(const [id,panel] of panels)sizes[id]=Number(panel.dataset.size)||DEFAULT_SIZES[id]||25;
    try{localStorage.setItem(LAYOUT_KEY,JSON.stringify({version:2,sizes}))}catch{}
  };

  const notifyResize=()=>{
    if(resizeRaf)return;
    resizeRaf=requestAnimationFrame(()=>{
      resizeRaf=0;
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new CustomEvent('sulandra:workspace-layout-resized'));
    });
  };

  const visiblePanels=()=>[...panels.values()].filter(panel=>!panel.hidden);
  const normalizeSizes=()=>{
    const visible=visiblePanels();
    if(!visible.length)return;
    const total=visible.reduce((sum,panel)=>sum+(Number(panel.dataset.size)||1),0)||visible.length;
    for(const panel of visible){
      const percent=((Number(panel.dataset.size)||1)/total)*100;
      panel.style.flexBasis=`${percent}%`;
    }
  };

  const renderSplitters=()=>{
    if(!row)return;
    row.querySelectorAll('.itws-dock-splitter').forEach(node=>node.remove());
    const visible=visiblePanels();
    visible.forEach((panel,index)=>{
      if(index===visible.length-1)return;
      const splitter=document.createElement('div');
      splitter.className='itws-dock-splitter';
      splitter.setAttribute('role','separator');
      splitter.setAttribute('aria-orientation','vertical');
      splitter.tabIndex=0;
      splitter.dataset.left=panel.dataset.panelId||'';
      splitter.dataset.right=visible[index+1].dataset.panelId||'';
      panel.after(splitter);
      bindSplitter(splitter);
    });
  };

  const reflow=()=>{
    normalizeSizes();
    renderSplitters();
    document.body?.classList.toggle('itws-dock-has-side-panels',visiblePanels().length>1);
    notifyResize();
  };

  const setVisible=(id,visible)=>{
    const panel=panels.get(id);if(!panel)return;
    panel.hidden=!visible;
    panel.classList.toggle('itws-dock-visible',visible);
    if(!visible&&maximized===id)restorePanel(id);
    reflow();
  };

  const maximizePanel=id=>{
    const panel=panels.get(id);if(!panel||panel.hidden)return;
    if(maximized&&maximized!==id)restorePanel(maximized);
    maximized=id;
    dock?.classList.add('itws-dock-maximized');
    panel.classList.add('itws-panel-maximized');
    panel.querySelector('.itws-dock-maximize')?.setAttribute('aria-label','Restore panel');
    panel.querySelector('.itws-dock-maximize')?.setAttribute('title','Restore');
    const icon=panel.querySelector('.itws-dock-maximize');if(icon)icon.textContent='❐';
    const close=panel.querySelector('.itws-dock-close');
    if(close){close.hidden=false;close.dataset.maxRestore='1';close.title='Restore to workspace';close.setAttribute('aria-label','Restore to workspace')}
    notifyResize();
  };

  const restorePanel=id=>{
    const panel=panels.get(id||maximized);if(!panel)return;
    panel.classList.remove('itws-panel-maximized');
    if(maximized===panel.dataset.panelId)maximized=null;
    if(!maximized)dock?.classList.remove('itws-dock-maximized');
    const maximize=panel.querySelector('.itws-dock-maximize');
    if(maximize){maximize.textContent='□';maximize.title='Maximize';maximize.setAttribute('aria-label','Maximize panel')}
    const close=panel.querySelector('.itws-dock-close');
    if(close){delete close.dataset.maxRestore;close.hidden=panel.dataset.closable!=='1';close.title='Close panel';close.setAttribute('aria-label','Close panel')}
    reflow();
  };

  const closePanel=id=>{
    const panel=panels.get(id);if(!panel)return;
    if(panel.classList.contains('itws-panel-maximized')){restorePanel(id);return}
    if(panel.dataset.closable==='1')setVisible(id,false);
  };

  const createPanel=(id,label,{closable=false}={})=>{
    const panel=document.createElement('section');
    panel.className='itws-dock-panel';
    panel.dataset.panelId=id;
    panel.dataset.closable=closable?'1':'0';
    panel.dataset.size=String(layout.sizes[id]||DEFAULT_SIZES[id]||25);
    panel.hidden=id!=='terminal';
    panel.innerHTML=`<header class="itws-dock-panel-head"><strong>${label}</strong><span class="itws-dock-panel-meta"></span><div class="itws-dock-panel-actions"><button type="button" class="itws-dock-maximize" aria-label="Maximize panel" title="Maximize">□</button><button type="button" class="itws-dock-close" aria-label="Close panel" title="Close panel" ${closable?'':'hidden'}>×</button></div></header><div class="itws-dock-panel-body"></div>`;
    panel.querySelector('.itws-dock-maximize')?.addEventListener('click',()=>panel.classList.contains('itws-panel-maximized')?restorePanel(id):maximizePanel(id));
    panel.querySelector('.itws-dock-close')?.addEventListener('click',()=>closePanel(id));
    panel.addEventListener('dblclick',event=>{if(event.target instanceof Element&&event.target.closest('.itws-dock-panel-head'))panel.classList.contains('itws-panel-maximized')?restorePanel(id):maximizePanel(id)});
    panels.set(id,panel);
    return panel;
  };

  function bindSplitter(splitter){
    const begin=event=>{
      if(window.innerWidth<760||event.button!==0)return;
      const left=panels.get(splitter.dataset.left);const right=panels.get(splitter.dataset.right);
      if(!left||!right)return;
      event.preventDefault();
      const startX=event.clientX;
      const leftWidth=left.getBoundingClientRect().width;
      const rightWidth=right.getBoundingClientRect().width;
      const combined=leftWidth+rightWidth;
      document.body.classList.add('itws-dock-resizing');
      splitter.setPointerCapture?.(event.pointerId);
      const move=moveEvent=>{
        const delta=moveEvent.clientX-startX;
        const nextLeft=clamp(leftWidth+delta,MIN_PANEL,Math.max(MIN_PANEL,combined-MIN_PANEL));
        const nextRight=combined-nextLeft;
        if(nextRight<MIN_PANEL)return;
        const total=row?.getBoundingClientRect().width||combined;
        left.dataset.size=String((nextLeft/total)*100);
        right.dataset.size=String((nextRight/total)*100);
        left.style.flexBasis=`${nextLeft}px`;
        right.style.flexBasis=`${nextRight}px`;
        notifyResize();
      };
      const end=()=>{
        splitter.removeEventListener('pointermove',move);
        splitter.removeEventListener('pointerup',end);
        splitter.removeEventListener('pointercancel',end);
        document.body.classList.remove('itws-dock-resizing');
        saveLayout();normalizeSizes();notifyResize();
      };
      splitter.addEventListener('pointermove',move);
      splitter.addEventListener('pointerup',end);
      splitter.addEventListener('pointercancel',end);
    };
    splitter.addEventListener('pointerdown',begin);
    splitter.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
      const left=panels.get(splitter.dataset.left);const right=panels.get(splitter.dataset.right);if(!left||!right)return;
      event.preventDefault();
      const step=event.shiftKey?5:2;
      const direction=event.key==='ArrowRight'?1:-1;
      left.dataset.size=String(clamp((Number(left.dataset.size)||25)+(direction*step),10,80));
      right.dataset.size=String(clamp((Number(right.dataset.size)||25)-(direction*step),10,80));
      normalizeSizes();saveLayout();notifyResize();
    });
  }

  const createFramePanel=(id,label)=>{
    const panel=createPanel(id,label,{closable:true});
    const body=panel.querySelector('.itws-dock-panel-body');
    body.innerHTML=`<div class="itws-workspace-frame-tools" ${id==='ide'?'hidden':''}><label>Port <input class="itws-workspace-port" type="number" min="1024" max="65535" inputmode="numeric" aria-label="Preview port"></label><button type="button" class="itws-workspace-open-port">Open</button></div><div class="itws-workspace-loading" role="status" aria-live="polite">${id==='ide'?'Open IDE to start the browser editor.':'Open Preview to view a running app.'}</div><iframe class="itws-workspace-frame" title="${label}" allow="clipboard-read; clipboard-write; fullscreen"></iframe>`;
    const frame=body.querySelector('.itws-workspace-frame');
    const loading=body.querySelector('.itws-workspace-loading');
    const portInput=body.querySelector('.itws-workspace-port');
    if(portInput)portInput.value=String(validPort(sessionStorage.getItem(PORT_KEY))||3000);
    frame?.addEventListener('load',()=>{if(loading&&frame.getAttribute('src'))loading.hidden=true});
    if(id==='preview'){
      body.querySelector('.itws-workspace-open-port')?.addEventListener('click',()=>void openWorkspace('preview',validPort(portInput?.value)));
      portInput?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void openWorkspace('preview',validPort(portInput.value))}});
    }
    panel._workspace={frame,loading,portInput};
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

  const openWorkspace=async(kind,requestedPort)=>{
    const id=kind==='preview'?'preview':'ide';
    const panel=panels.get(id);if(!panel)return;
    const sessionId=activeSessionId();
    if(!sessionId){window.alert('Open or create a terminal session first.');return}
    const port=id==='preview'?validPort(requestedPort):null;
    if(id==='preview'&&!port){window.alert('Use a preview port from 1024–65535. Ports 9000 and 13337 are reserved.');return}
    const view=panel._workspace||{};
    if(id==='preview'&&view.portInput){view.portInput.value=String(port);try{sessionStorage.setItem(PORT_KEY,String(port))}catch{}}
    panel.querySelector('.itws-dock-panel-meta').textContent=id==='preview'?`:${port}`:'';
    setVisible(id,true);
    const sameSession=view.frame?.dataset.sessionId===sessionId;
    const samePort=id==='ide'||view.frame?.dataset.port===String(port);
    if(sameSession&&samePort&&view.frame?.getAttribute('src')){notifyResize();return}
    if(view.loading){view.loading.hidden=false;view.loading.textContent=id==='preview'?`Opening live preview on port ${port}…`:'Opening Sulandra IDE…'}
    try{
      const access=await ticket(sessionId,id==='preview'?port:null);
      if(!view.frame)return;
      view.frame.dataset.sessionId=sessionId;
      view.frame.dataset.port=id==='preview'?String(port):'';
      view.frame.src=GATEWAY+access.url;
    }catch(error){if(view.loading){view.loading.hidden=false;view.loading.textContent=error?.message||'Workspace view could not be opened.'}}
  };

  const installTools=()=>{
    const root=document.getElementById('itwsRealTerminal')||document.querySelector('.itws-real-terminal');
    if(!root)return false;
    const host=root.querySelector('.itws-rt-input-switch')||root.querySelector('.itws-rt-foot')||root.querySelector('.itws-terminal-footer');
    if(!host)return false;
    if(document.getElementById('itwsWorkspaceIdeButton'))return true;
    const tools=document.createElement('span');tools.className='itws-workspace-tools';
    const ide=document.createElement('button');ide.type='button';ide.id='itwsWorkspaceIdeButton';ide.className='itws-workspace-tool';ide.textContent='IDE';ide.title='Open the Sulandra browser IDE';
    const preview=document.createElement('button');preview.type='button';preview.id='itwsWorkspacePreviewButton';preview.className='itws-workspace-tool';preview.textContent='Preview';preview.title='Open a live app preview';
    ide.addEventListener('click',()=>void openWorkspace('ide',null));
    preview.addEventListener('click',()=>void openWorkspace('preview',validPort(sessionStorage.getItem(PORT_KEY))||3000));
    tools.append(ide,preview);host.appendChild(tools);return true;
  };

  const installDock=()=>{
    if(dock)return true;
    terminalMount=document.getElementById('itwsEngineeringTerminal');
    if(!terminalMount)return false;
    const parent=terminalMount.parentElement;if(!parent)return false;
    dock=document.createElement('div');dock.id='itwsDockableWorkspace';dock.className='itws-dock-workspace';dock.setAttribute('aria-label','Dockable Engineering Workspace');
    row=document.createElement('div');row.className='itws-dock-row';dock.appendChild(row);
    parent.insertBefore(dock,terminalMount);
    const terminalPanel=createPanel('terminal','Terminal');terminalPanel.hidden=false;terminalPanel.classList.add('itws-dock-visible');
    terminalPanel.querySelector('.itws-dock-panel-body').appendChild(terminalMount);
    row.appendChild(terminalPanel);
    row.appendChild(createFramePanel('ide','IDE'));
    row.appendChild(createFramePanel('preview','Preview'));
    normalizeSizes();renderSplitters();
    const observer=new ResizeObserver(()=>notifyResize());observer.observe(dock);dock._resizeObserver=observer;
    document.body?.classList.add('itws-dockable-workspace-ready');
    return true;
  };

  const boot=()=>{
    const ready=installDock();
    const tools=installTools();
    if(ready&&tools)return;
    const observer=new MutationObserver(()=>{if(installDock()&&installTools())observer.disconnect()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),30000);
  };

  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&maximized){event.preventDefault();restorePanel(maximized)}},true);
  window.addEventListener('resize',()=>{if(window.innerWidth<760&&maximized)notifyResize();else reflow()},{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

  window.SulandraDockableWorkspace={
    openIde:()=>openWorkspace('ide',null),
    openPreview:port=>openWorkspace('preview',validPort(port)),
    maximize:maximizePanel,
    restore:restorePanel,
    close:closePanel,
    show:id=>setVisible(id,true),
    notifyResize,
    getPanel:id=>panels.get(id)||null
  };
  window.SulandraWorkspacePreview={openIde:()=>openWorkspace('ide',null),openPreview:port=>openWorkspace('preview',validPort(port)),close:()=>{closePanel('ide');closePanel('preview')}};
})();
