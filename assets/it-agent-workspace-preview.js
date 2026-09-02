/* SULANDRA_DOCKABLE_ENGINEERING_WORKSPACE_V3 */
(()=>{
'use strict';
if(window.__SULANDRA_DOCKABLE_ENGINEERING_WORKSPACE_V3__)return;
window.__SULANDRA_DOCKABLE_ENGINEERING_WORKSPACE_V3__=true;

const GATEWAY=window.location.origin;
const PORT_KEY='sulandra:workspace-preview-port',LAYOUT_KEY='sulandra:engineering-workspace-layout-v2';
const DEFAULT={terminal:52,ide:24,preview:24},MIN=280,panels=new Map();
const PREVIEW_DISCOVERY_PORTS=[3000,5173,4173,8080,8000,5000];
let dock,row,maximized=null,resizeRaf=0,maxAnchor=null;

const authToken=()=>sessionStorage.getItem('sulandra:admin:access-token')||localStorage.getItem('sulandra:admin:access-token')||sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('token')||'';
const activeSessionId=()=>document.querySelector('#itwsRtTabs .itws-rt-tab.active')?.dataset?.terminalId||document.querySelector('.itws-rt-tab.active')?.dataset?.terminalId||'';
const validPort=value=>{const n=Number(value);return Number.isInteger(n)&&n>=1024&&n<=65535&&![9000,13337].includes(n)?n:null};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const readSizes=()=>{try{const raw=JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}')?.sizes||{};return Object.fromEntries(Object.keys(DEFAULT).map(k=>[k,Number(raw[k])>=10&&Number(raw[k])<=80?Number(raw[k]):DEFAULT[k]]))}catch{return {...DEFAULT}}};
const sizes=readSizes();
const save=()=>{try{localStorage.setItem(LAYOUT_KEY,JSON.stringify({version:2,sizes:Object.fromEntries([...panels].map(([id,p])=>[id,Number(p.dataset.size)||DEFAULT[id]]))}))}catch{}};
const notifyResize=()=>{if(resizeRaf)return;resizeRaf=requestAnimationFrame(()=>{resizeRaf=0;window.dispatchEvent(new CustomEvent('sulandra:workspace-layout-resized'))})};
const visible=()=>[...panels.values()].filter(p=>!p.hidden);
const normalize=()=>{const list=visible(),total=list.reduce((n,p)=>n+(Number(p.dataset.size)||1),0)||1;for(const p of list)p.style.flexBasis=`${((Number(p.dataset.size)||1)/total)*100}%`};

function bindSplitter(split){
 split.addEventListener('mousedown',event=>{
  if(window.innerWidth<760||event.button!==0)return;
  const left=panels.get(split.dataset.left),right=panels.get(split.dataset.right);if(!left||!right)return;
  event.preventDefault();const start=event.clientX,lw=left.getBoundingClientRect().width,rw=right.getBoundingClientRect().width,totalPair=lw+rw;
  document.body.classList.add('itws-dock-resizing');
  const move=e=>{const nl=clamp(lw+(e.clientX-start),MIN,Math.max(MIN,totalPair-MIN)),nr=totalPair-nl;if(nr<MIN)return;const all=row.getBoundingClientRect().width||totalPair;left.dataset.size=String(nl/all*100);right.dataset.size=String(nr/all*100);left.style.flexBasis=`${nl}px`;right.style.flexBasis=`${nr}px`;notifyResize()};
  const end=()=>{window.removeEventListener('mousemove',move,true);window.removeEventListener('mouseup',end,true);document.body.classList.remove('itws-dock-resizing');save();normalize();notifyResize()};
  window.addEventListener('mousemove',move,true);window.addEventListener('mouseup',end,true);
 });
 split.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;const l=panels.get(split.dataset.left),r=panels.get(split.dataset.right);if(!l||!r)return;event.preventDefault();const d=(event.key==='ArrowRight'?1:-1)*(event.shiftKey?5:2);l.dataset.size=String(clamp((Number(l.dataset.size)||25)+d,10,80));r.dataset.size=String(clamp((Number(r.dataset.size)||25)-d,10,80));normalize();save();notifyResize()});
}

const splitters=()=>{row?.querySelectorAll('.itws-dock-splitter').forEach(n=>n.remove());const list=visible().filter(p=>p.parentElement===row);list.forEach((p,i)=>{if(i===list.length-1)return;const s=document.createElement('div');s.className='itws-dock-splitter';s.role='separator';s.tabIndex=0;s.dataset.left=p.dataset.panelId;s.dataset.right=list[i+1].dataset.panelId;p.after(s);bindSplitter(s)})};
const reflow=()=>{normalize();splitters();document.body.classList.toggle('itws-dock-has-side-panels',visible().length>1);notifyResize()};
const setVisible=(id,on)=>{const p=panels.get(id);if(!p)return;if(!on&&maximized===id)restorePanel(id);p.hidden=!on;p.classList.toggle('itws-dock-visible',on);reflow()};

const maximizePanel=id=>{
 const p=panels.get(id);if(!p||p.hidden)return;
 if(maximized&&maximized!==id)restorePanel(maximized);
 if(p.parentNode!==document.body){maxAnchor=document.createComment(`sulandra-${id}-restore-anchor`);p.parentNode?.insertBefore(maxAnchor,p);document.body.appendChild(p)}
 maximized=id;dock.classList.add('itws-dock-maximized');document.body.classList.add('itws-native-fullscreen-panel');p.classList.add('itws-panel-maximized');
 const m=p.querySelector('.itws-dock-maximize'),x=p.querySelector('.itws-dock-close');
 if(m){m.textContent='❐';m.title='Restore';m.setAttribute('aria-label','Restore panel')}
 if(x){x.hidden=false;x.style.removeProperty('display');x.dataset.maxRestore='1';x.title='Restore to workspace';x.setAttribute('aria-label','Restore to workspace')}
 requestAnimationFrame(()=>{notifyResize();setTimeout(notifyResize,80)});
};

function restorePanel(id=maximized){
 const p=panels.get(id);if(!p)return;
 p.classList.remove('itws-panel-maximized');
 if(maxAnchor?.parentNode){maxAnchor.parentNode.insertBefore(p,maxAnchor);maxAnchor.remove()}maxAnchor=null;
 if(maximized===id)maximized=null;
 if(!maximized){dock.classList.remove('itws-dock-maximized');document.body.classList.remove('itws-native-fullscreen-panel')}
 const m=p.querySelector('.itws-dock-maximize'),x=p.querySelector('.itws-dock-close');
 if(m){m.textContent='□';m.title='Full screen';m.setAttribute('aria-label','Full screen panel')}
 if(x){delete x.dataset.maxRestore;x.hidden=p.dataset.closable!=='1';x.title='Close panel';x.setAttribute('aria-label','Close panel')}
 reflow();requestAnimationFrame(()=>setTimeout(notifyResize,40));
}

const closePanel=id=>{const p=panels.get(id);if(!p)return;if(p.classList.contains('itws-panel-maximized'))return restorePanel(id);if(p.dataset.closable==='1')setVisible(id,false)};
const createPanel=(id,label,closable=false)=>{const p=document.createElement('section');p.className='itws-dock-panel';p.dataset.panelId=id;p.dataset.closable=closable?'1':'0';p.dataset.size=String(sizes[id]);p.hidden=id!=='terminal';p.innerHTML=`<header class="itws-dock-panel-head"><strong>${label}</strong><span class="itws-dock-panel-meta"></span><div class="itws-dock-panel-actions"><button type="button" class="itws-dock-maximize" aria-label="Full screen panel" title="Full screen">□</button><button type="button" class="itws-dock-close" aria-label="Close panel" title="Close panel" ${closable?'':'hidden'}>×</button></div></header><div class="itws-dock-panel-body"></div>`;p.querySelector('.itws-dock-maximize').onclick=()=>p.classList.contains('itws-panel-maximized')?restorePanel(id):maximizePanel(id);p.querySelector('.itws-dock-close').onclick=()=>closePanel(id);p.addEventListener('dblclick',e=>{if(e.target instanceof Element&&e.target.closest('.itws-dock-panel-head'))p.classList.contains('itws-panel-maximized')?restorePanel(id):maximizePanel(id)});panels.set(id,p);return p};

const createFramePanel=(id,label)=>{
 const p=createPanel(id,label,true),body=p.querySelector('.itws-dock-panel-body');
 body.innerHTML=`<div class="itws-workspace-frame-tools" ${id==='ide'?'hidden':''}><label>Port <input class="itws-workspace-port" type="number" min="1024" max="65535" inputmode="numeric" aria-label="Preview port"></label><button type="button" class="itws-workspace-open-port">Open</button></div><div class="itws-workspace-loading" role="status" aria-live="polite">${id==='ide'?'Open IDE to start the browser editor.':'Open Preview to view a running app.'}</div><iframe class="itws-workspace-frame" title="${label}" allow="clipboard-read; clipboard-write; fullscreen"></iframe>`;
 const frame=body.querySelector('iframe'),loading=body.querySelector('.itws-workspace-loading'),portInput=body.querySelector('.itws-workspace-port');
 if(portInput)portInput.value=String(validPort(sessionStorage.getItem(PORT_KEY))||3000);
 frame.addEventListener('load',()=>{if(frame.getAttribute('src'))loading.hidden=true});
 if(id==='preview'){
  body.querySelector('.itws-workspace-open-port').onclick=()=>void openWorkspace('preview',validPort(portInput.value),false);
  portInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void openWorkspace('preview',validPort(portInput.value),false)}};
 }
 p._workspace={frame,loading,portInput};
 return p;
};

const ticket=async(sessionId,port)=>{const token=authToken();if(!token)throw new Error('Administrator sign-in is required');const response=await fetch(`${GATEWAY}/workspace/ticket`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({sessionId,port})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`Workspace access failed (${response.status})`);return payload};

const previewCandidates=(requestedPort,discover)=>{
 const requested=validPort(requestedPort);
 const ports=discover?[requested,...PREVIEW_DISCOVERY_PORTS]:[requested];
 return [...new Set(ports.filter(port=>validPort(port)))];
};

const probePreview=async url=>{
 try{
  const response=await fetch(url,{method:'HEAD',credentials:'same-origin',cache:'no-store',redirect:'follow'});
  return {ready:response.status<500,status:response.status};
 }catch(error){
  return {ready:false,status:0,error};
 }
};

const openLivePreview=async({sessionId,requestedPort,discover,p,v})=>{
 const candidates=previewCandidates(requestedPort,discover);
 if(!candidates.length)throw new Error('Use a preview port from 1024–65535. Ports 9000 and 13337 are reserved.');
 v.frame.removeAttribute('src');
 v.frame.removeAttribute('srcdoc');
 delete v.frame.dataset.sessionId;
 delete v.frame.dataset.port;
 let lastStatus=0;
 for(const port of candidates){
  v.loading.hidden=false;
  v.loading.textContent=`Checking live preview on port ${port}…`;
  const access=await ticket(sessionId,port);
  const target=GATEWAY+access.url;
  const probe=await probePreview(target);
  lastStatus=probe.status;
  if(!probe.ready)continue;
  v.portInput.value=String(port);
  try{sessionStorage.setItem(PORT_KEY,String(port))}catch{}
  p.querySelector('.itws-dock-panel-meta').textContent=`:${port}`;
  v.frame.dataset.sessionId=sessionId;
  v.frame.dataset.port=String(port);
  v.loading.hidden=false;
  v.loading.textContent=`Opening live preview on port ${port}…`;
  v.frame.src=target;
  return;
 }
 const ports=candidates.join(', ');
 const suffix=lastStatus?` (HTTP ${lastStatus})`:'';
 throw new Error(`No live app is reachable on ${candidates.length===1?'port':'ports'} ${ports}${suffix}. Start your app in Terminal, then click ${discover?'Preview again':'Open'}.`);
};

const openWorkspace=async(kind,requestedPort,discoverPreview=false)=>{
 const id=kind==='preview'?'preview':'ide',p=panels.get(id);if(!p)return;
 const sessionId=activeSessionId();
 if(!sessionId){alert('Open or create a terminal session first.');return}
 const port=id==='preview'?validPort(requestedPort):null;
 if(id==='preview'&&!port){alert('Use a preview port from 1024–65535. Ports 9000 and 13337 are reserved.');return}
 const v=p._workspace;
 setVisible(id,true);
 if(id==='preview'){
  v.portInput.value=String(port);
  p.querySelector('.itws-dock-panel-meta').textContent=`:${port}`;
 }else{
  p.querySelector('.itws-dock-panel-meta').textContent='';
 }
 if(v.frame.dataset.sessionId===sessionId&&(id==='ide'||v.frame.dataset.port===String(port))&&v.frame.getAttribute('src'))return notifyResize();
 v.loading.hidden=false;
 v.loading.textContent=id==='preview'?`Opening live preview on port ${port}…`:'Opening Sulandra IDE…';
 try{
  if(id==='preview'){
   await openLivePreview({sessionId,requestedPort:port,discover:discoverPreview,p,v});
   return;
  }
  const access=await ticket(sessionId,null);
  v.frame.dataset.sessionId=sessionId;
  v.frame.dataset.port='';
  v.frame.src=GATEWAY+access.url;
 }catch(error){
  v.loading.hidden=false;
  v.loading.textContent=error?.message||'Workspace view could not be opened.';
 }
};

const installTools=()=>{
 const root=document.getElementById('itwsRealTerminal')||document.querySelector('.itws-real-terminal');if(!root)return false;
 const host=root.querySelector('.itws-rt-input-switch')||root.querySelector('.itws-rt-foot')||root.querySelector('.itws-terminal-footer');if(!host)return false;
 if(document.getElementById('itwsWorkspaceIdeButton'))return true;
 const tools=document.createElement('span');tools.className='itws-workspace-tools';
 tools.innerHTML='<button type="button" id="itwsWorkspaceIdeButton" class="itws-workspace-tool">IDE</button><button type="button" id="itwsWorkspacePreviewButton" class="itws-workspace-tool">Preview</button>';
 tools.querySelector('#itwsWorkspaceIdeButton').onclick=()=>void openWorkspace('ide',null,false);
 tools.querySelector('#itwsWorkspacePreviewButton').onclick=()=>void openWorkspace('preview',validPort(sessionStorage.getItem(PORT_KEY))||3000,true);
 host.appendChild(tools);
 return true;
};

const installDock=()=>{
 if(dock)return true;
 const mount=document.getElementById('itwsEngineeringTerminal');if(!mount?.parentElement)return false;
 dock=document.createElement('div');dock.id='itwsDockableWorkspace';dock.className='itws-dock-workspace';dock.setAttribute('aria-label','Dockable Engineering Workspace');
 row=document.createElement('div');row.className='itws-dock-row';dock.appendChild(row);mount.parentElement.insertBefore(dock,mount);
 const terminal=createPanel('terminal','Terminal',true);terminal.hidden=false;terminal.classList.add('itws-dock-visible');terminal.querySelector('.itws-dock-panel-body').appendChild(mount);
 row.append(terminal,createFramePanel('ide','IDE'),createFramePanel('preview','Preview'));
 normalize();splitters();new ResizeObserver(()=>notifyResize()).observe(dock);document.body.classList.add('itws-dockable-workspace-ready');
 return true;
};

const reopenFromNavigation=event=>{const control=event.target instanceof Element?event.target.closest('button,a,[role="button"]'):null;if(!control)return;const label=String(control.textContent||'').trim().replace(/\s+/g,' ');if(label==='Engineering Terminal'||control.matches('[data-view="engineering-terminal"],[data-route="engineering-terminal"],[data-target="engineering-terminal"]'))requestAnimationFrame(()=>setVisible('terminal',true))};
const boot=()=>{if(installDock()&&installTools())return;const observer=new MutationObserver(()=>{if(installDock()&&installTools())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),30000)};

document.addEventListener('click',reopenFromNavigation,true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&maximized){e.preventDefault();restorePanel(maximized)}},true);
window.addEventListener('resize',()=>{normalize();splitters();notifyResize()},{passive:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

window.SulandraDockableWorkspace={openIde:()=>openWorkspace('ide',null,false),openPreview:port=>openWorkspace('preview',validPort(port)||3000,true),maximize:maximizePanel,restore:restorePanel,close:closePanel,show:id=>setVisible(id,true),notifyResize,getPanel:id=>panels.get(id)||null};
window.SulandraWorkspacePreview={openIde:()=>openWorkspace('ide',null,false),openPreview:port=>openWorkspace('preview',validPort(port)||3000,true),close:()=>{closePanel('ide');closePanel('preview')}};
})();
