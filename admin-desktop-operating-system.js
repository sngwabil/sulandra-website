(function(){
'use strict';
if(window.SulandraDesktopOS?.version==='2026.08.04.2')return;

const SERVICE_KEY='sulandra:admin:active-service';
const SESSION_KEY='sulandra:employee:session';
const PROFILE_PREFIX='sulandra:admin:desktop-profile:';
const windows=new Map();
let activeId=null;
let counter=0;
let pendingOpen=null;
let dockObserver=null;
let lastDockSignature='';
let contextMenu=null;

const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
function service(){return localStorage.getItem(SERVICE_KEY)||'community';}
function session(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')||{};}catch{return {};}}
function userId(){const s=session();return String(s.email||s.username||s.userId||'administrator').toLowerCase();}
function profileKey(){return PROFILE_PREFIX+userId();}
function host(){return document.getElementById('adminInternalWorkspace');}
function centerScroll(){const h=host();return h?.closest('.ec-center-scroll,.ec-center-viewport,[data-ec-center-scroll]')||h?.parentElement||document.scrollingElement;}
function readScroll(){const box=centerScroll();return box===document.scrollingElement?window.scrollY:Number(box?.scrollTop||0);}
function writeScroll(value){requestAnimationFrame(()=>{const box=centerScroll();if(box===document.scrollingElement)window.scrollTo(0,value||0);else if(box)box.scrollTop=value||0;});}
function iconFor(title){const t=String(title).toLowerCase();if(/service home|house/.test(t))return'🏘️';if(/transport|trip|driver|fleet/.test(t))return'🚐';if(/employee|staff|workforce/.test(t))return'👥';if(/schedule|assignment/.test(t))return'🗓️';if(/document|record|file/.test(t))return'📁';if(/report|audit/.test(t))return'📊';if(/setting/.test(t))return'⚙️';if(/client|isp|care/.test(t))return'👤';if(/billing|claim/.test(t))return'💰';return'🗂️';}
function titleFor(node,fallback){return fallback||node?.querySelector('.sos-breadcrumb')?.textContent?.split('›').pop()?.trim()||node?.querySelector('h1,h2')?.textContent?.trim()||'Workspace';}

function installStyles(){
 if(document.getElementById('sulandraDesktopOSStylesV2'))return;
 const style=document.createElement('style');style.id='sulandraDesktopOSStylesV2';style.textContent=`
 .dx-window-controls{display:none!important}
 .os-managed-window{position:relative!important}
 .os-window-controls{position:absolute;top:8px;right:10px;z-index:2147482000;display:flex;gap:7px;padding:5px;border-radius:999px;background:rgba(255,255,255,.94);border:1px solid rgba(148,163,184,.45);box-shadow:0 10px 28px rgba(15,23,42,.2);backdrop-filter:blur(12px)}
 .os-window-controls button{width:31px;height:31px;border:0;border-radius:50%;display:grid;place-items:center;font-weight:900;cursor:pointer}.os-min{background:#fef3c7;color:#92400e}.os-max{background:#dcfce7;color:#166534}.os-pin{background:#e0e7ff;color:#3730a3}.os-close{background:#fee2e2;color:#991b1b}
 .os-fullscreen{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;border-radius:0!important;z-index:2147483500!important;overflow:auto!important;background:#fff!important;box-shadow:none!important}
 body.os-fullscreen-open{overflow:hidden!important}
 #dxDesktopDock .dx-dock-body{justify-content:center!important;overflow:visible!important}
 #dxDesktopDock .dx-dock-body>*:not(.os-taskbar-apps){display:none!important}
 .os-taskbar-apps{display:flex;align-items:flex-end;justify-content:center;gap:9px;min-width:0;max-width:calc(100vw - 100px);overflow-x:auto;padding:0 10px 5px}
 .os-task-icon{position:relative;width:50px;height:50px;flex:0 0 50px;border:1px solid rgba(255,255,255,.22);border-radius:14px;background:rgba(255,255,255,.12);color:#fff;display:grid;place-items:center;font-size:24px;cursor:pointer;transition:transform .15s,background .15s}.os-task-icon:hover{transform:translateY(-5px) scale(1.07);background:rgba(255,255,255,.24)}.os-task-icon.active::after{content:"";position:absolute;bottom:-5px;width:20px;height:3px;border-radius:10px;background:#7dd3fc}.os-task-icon.minimized{opacity:.72}.os-task-icon::before{content:attr(data-title);position:absolute;bottom:59px;left:50%;transform:translateX(-50%);display:none;white-space:nowrap;background:#081c31;color:#fff;padding:6px 9px;border-radius:8px;font-size:11px;box-shadow:0 8px 20px rgba(0,0,0,.3)}.os-task-icon:hover::before{display:block}
 .os-desktop-icons{display:grid;grid-template-columns:repeat(auto-fill,96px);align-content:start;gap:18px;padding:18px;min-height:180px}.os-desktop-item{border:0;background:transparent;color:#102448;text-align:center;cursor:pointer;padding:8px;border-radius:12px}.os-desktop-item:hover{background:rgba(255,255,255,.68)}.os-desktop-item .icon{display:grid;place-items:center;font-size:42px;height:50px}.os-desktop-item strong{display:block;font-size:12px;line-height:1.25;word-break:break-word}
 #osDesktopContext{position:fixed;z-index:2147484000;min-width:220px;padding:7px;border-radius:13px;background:#fff;border:1px solid #d7e4ef;box-shadow:0 24px 70px rgba(15,23,42,.3)}#osDesktopContext button{width:100%;border:0;background:transparent;text-align:left;padding:10px;border-radius:8px;font-weight:750;color:#102448;cursor:pointer}#osDesktopContext button:hover{background:#edf5fb}
 .os-folder-window{position:relative;width:100%;min-height:520px;border:1px solid #d7e4ef;border-radius:20px;background:rgba(255,255,255,.97);box-shadow:0 18px 60px rgba(15,23,42,.18);overflow:auto}.os-folder-head{padding:22px 100px 18px 22px;background:#0d3154;color:#fff}.os-folder-body{padding:20px}.os-folder-actions{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:18px}.os-folder-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:9px 12px;font-weight:800;cursor:pointer}.os-file-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:13px}.os-file-card{border:1px solid #d7e4ef;border-radius:14px;background:#fff;padding:15px;cursor:pointer}
 `;document.head.appendChild(style);
}

function taskbarBody(){return document.querySelector('#dxDesktopDock .dx-dock-body');}
function taskSignature(){return [...windows.values()].filter(s=>!s.closed).map(s=>`${s.id}:${s.minimized?1:0}:${s.id===activeId?1:0}:${s.pinned?1:0}`).join('|');}
function renderTaskbar(force=false){
 const body=taskbarBody();if(!body)return;
 const signature=taskSignature();
 let apps=body.querySelector('.os-taskbar-apps');
 if(!apps){apps=document.createElement('div');apps.className='os-taskbar-apps';body.appendChild(apps);force=true;}
 if(!force&&signature===lastDockSignature)return;
 lastDockSignature=signature;apps.innerHTML='';
 windows.forEach(state=>{
  if(state.closed||(!state.pinned&&!state.minimized&&state.id!==activeId))return;
  const button=document.createElement('button');button.type='button';button.className='os-task-icon'+(state.id===activeId?' active':'')+(state.minimized?' minimized':'');button.dataset.title=state.title;button.innerHTML=`<span>${iconFor(state.title)}</span>`;
  button.onclick=()=>state.id===activeId&&!state.minimized?minimize(state.id):restore(state.id);
  apps.appendChild(button);
 });
}
function watchDock(){
 const body=taskbarBody();if(!body){setTimeout(watchDock,250);return;}
 if(dockObserver)dockObserver.disconnect();
 dockObserver=new MutationObserver(()=>requestAnimationFrame(()=>renderTaskbar(true)));
 dockObserver.observe(body,{childList:true});renderTaskbar(true);
}

function addControls(state){
 const node=state.node;if(!node)return;
 node.classList.add('os-managed-window');
 node.querySelector(':scope > .os-window-controls')?.remove();
 const controls=document.createElement('div');controls.className='os-window-controls';controls.innerHTML='<button class="os-min" title="Minimize">−</button><button class="os-max" title="Full screen">□</button><button class="os-pin" title="Keep on taskbar">📌</button><button class="os-close" title="Close">×</button>';
 node.appendChild(controls);
 controls.querySelector('.os-min').onclick=e=>{e.stopPropagation();minimize(state.id)};
 controls.querySelector('.os-max').onclick=e=>{e.stopPropagation();toggleFullscreen(state.id,e.currentTarget)};
 controls.querySelector('.os-pin').onclick=e=>{e.stopPropagation();state.pinned=!state.pinned;lastDockSignature='';renderTaskbar(true)};
 controls.querySelector('.os-close').onclick=e=>{e.stopPropagation();closeWindow(state.id)};
}
function registerWindow(node,title,origin){
 if(!node)return null;
 let id=node.dataset.osWindowId;
 if(id&&windows.has(id)){const existing=windows.get(id);existing.node=node;existing.minimized=false;existing.closed=false;activeId=id;addControls(existing);lastDockSignature='';renderTaskbar(true);return existing;}
 id='osw-'+Date.now().toString(36)+'-'+(++counter);node.dataset.osWindowId=id;
 const state={id,node,title:titleFor(node,title),service:service(),originService:origin?.service||service(),originScroll:Number(origin?.scroll||0),windowScroll:0,minimized:false,pinned:true,closed:false};
 windows.set(id,state);activeId=id;addControls(state);lastDockSignature='';renderTaskbar(true);return state;
}
function folderNode(){const h=host();if(!h)return null;const node=h.firstElementChild;if(!node)return null;const breadcrumb=node.querySelector('.sos-breadcrumb')?.textContent||'';const isDepartmentHome=node.classList.contains('sos-service-shell')&&!breadcrumb.includes('›')&&!node.querySelector('.sos-back');return isDepartmentHome?null:node;}
function registerOpenedFolder(expectedTitle,origin,beforeNode){
 let attempts=0;
 const check=()=>{
  attempts++;
  const node=folderNode();
  if(node&&node!==beforeNode){registerWindow(node,expectedTitle,origin);return;}
  if(attempts<30)setTimeout(check,50);
 };
 setTimeout(check,0);
}
function captureFolderOpen(event){
 const tool=event.target.closest('.sos-tool');if(!tool)return;
 const origin={service:service(),scroll:readScroll()};
 const before=host()?.firstElementChild||null;
 const title=tool.dataset.sosLabel||tool.querySelector('h3')?.textContent?.trim()||'Workspace';
 pendingOpen={origin,title,before};registerOpenedFolder(title,origin,before);
}
function returnToOrigin(state){
 activeId=null;
 const nav=document.querySelector(`[data-service-nav="${state.originService}"]`);
 if(nav){nav.click();setTimeout(()=>{writeScroll(state.originScroll);renderDesktopIcons();lastDockSignature='';renderTaskbar(true)},120);}else{writeScroll(state.originScroll);renderTaskbar(true);}
}
function minimize(id){const state=windows.get(id);if(!state)return;state.windowScroll=readScroll();state.minimized=true;state.node.remove();exitFullscreen(state);returnToOrigin(state);}
function closeWindow(id){const state=windows.get(id);if(!state)return;state.windowScroll=readScroll();state.closed=true;state.node.remove();windows.delete(id);exitFullscreen(state);returnToOrigin(state);}
function restore(id){
 const state=windows.get(id);if(!state)return;const h=host();if(!h)return;
 const current=folderNode();if(current&&current!==state.node){const currentId=current.dataset.osWindowId;const currentState=currentId&&windows.get(currentId);if(currentState){currentState.windowScroll=readScroll();currentState.minimized=true;current.remove();}}
 h.innerHTML='';h.appendChild(state.node);state.minimized=false;state.closed=false;activeId=id;addControls(state);writeScroll(state.windowScroll);lastDockSignature='';renderTaskbar(true);
}
async function toggleFullscreen(id,button){const state=windows.get(id);if(!state)return;const on=!state.node.classList.contains('os-fullscreen');state.node.classList.toggle('os-fullscreen',on);document.body.classList.toggle('os-fullscreen-open',on);button.textContent=on?'❐':'□';if(on&&!document.fullscreenElement){try{await document.documentElement.requestFullscreen();}catch{}}else if(!on&&document.fullscreenElement){try{await document.exitFullscreen();}catch{}}}
function exitFullscreen(state){if(!state)return;state.node.classList.remove('os-fullscreen');document.body.classList.remove('os-fullscreen-open');if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}

function loadProfile(){try{return JSON.parse(localStorage.getItem(profileKey())||'{}')||{};}catch{return {};}}
function saveProfile(profile){localStorage.setItem(profileKey(),JSON.stringify(profile));Promise.resolve(window.SulandraDesktopCloud?.save?.()).catch(()=>{});}
function desktopItems(){const p=loadProfile();return Array.isArray(p.desktopItems)?p.desktopItems:[];}
function saveDesktopItems(items){const p=loadProfile();p.desktopItems=items;saveProfile(p);renderDesktopIcons();}
function createFolder(parentId=null){const name=prompt('Folder name');if(!name?.trim())return;const items=desktopItems();items.push({id:'folder-'+crypto.randomUUID(),type:'folder',name:name.trim(),parentId,service:service(),createdAt:new Date().toISOString()});saveDesktopItems(items);}
function createNote(parentId=null){const name=prompt('File name','New Note');if(!name?.trim())return;const content=prompt('Enter note contents','')??'';const items=desktopItems();items.push({id:'note-'+crypto.randomUUID(),type:'note',name:name.trim(),content,parentId,service:service(),createdAt:new Date().toISOString()});saveDesktopItems(items);}
function uploadFile(parentId=null){const input=document.createElement('input');input.type='file';input.onchange=()=>{const file=input.files?.[0];if(!file)return;if(file.size>2_000_000){alert('Please choose a file smaller than 2 MB for the synced desktop.');return;}const reader=new FileReader();reader.onload=()=>{const items=desktopItems();items.push({id:'file-'+crypto.randomUUID(),type:'file',name:file.name,mime:file.type||'application/octet-stream',data:String(reader.result),parentId,service:service(),createdAt:new Date().toISOString()});saveDesktopItems(items);};reader.readAsDataURL(file);};input.click();}
function openItem(item){if(item.type==='folder')return openFolder(item);if(item.type==='note'){const updated=prompt(item.name,item.content||'');if(updated!==null){const items=desktopItems();const target=items.find(x=>x.id===item.id);if(target)target.content=updated;saveDesktopItems(items);}return;}if(item.type==='file'&&item.data){const a=document.createElement('a');a.href=item.data;a.download=item.name;a.click();}}
function openFolder(folder){const origin={service:service(),scroll:readScroll()};const h=host();if(!h)return;const node=document.createElement('section');node.className='os-folder-window';node.innerHTML=`<div class="os-folder-head"><h1>${esc(folder.name)}</h1><small>Synced department desktop folder</small></div><div class="os-folder-body"><div class="os-folder-actions"><button data-new-folder>New Folder</button><button data-new-note>New Note</button><button data-upload>Upload File</button></div><div class="os-file-grid"></div></div>`;const grid=node.querySelector('.os-file-grid');desktopItems().filter(x=>x.service===service()&&x.parentId===folder.id).forEach(item=>{const card=document.createElement('button');card.className='os-file-card';card.innerHTML=`<div style="font-size:34px">${item.type==='folder'?'📁':item.type==='note'?'📝':'📄'}</div><strong>${esc(item.name)}</strong>`;card.onclick=()=>openItem(item);grid.appendChild(card);});if(!grid.children.length)grid.innerHTML='<p>This folder is empty.</p>';node.querySelector('[data-new-folder]').onclick=()=>createFolder(folder.id);node.querySelector('[data-new-note]').onclick=()=>createNote(folder.id);node.querySelector('[data-upload]').onclick=()=>uploadFile(folder.id);h.innerHTML='';h.appendChild(node);registerWindow(node,folder.name,origin);}
function renderDesktopIcons(){const h=host();const shell=h?.querySelector('.sos-service-shell');if(!shell)return;shell.querySelector('.os-desktop-icons')?.remove();const items=desktopItems().filter(x=>x.service===service()&&!x.parentId);if(!items.length)return;const grid=document.createElement('div');grid.className='os-desktop-icons';items.forEach(item=>{const b=document.createElement('button');b.className='os-desktop-item';b.innerHTML=`<span class="icon">${item.type==='folder'?'📁':item.type==='note'?'📝':'📄'}</span><strong>${esc(item.name)}</strong>`;b.ondblclick=()=>openItem(item);grid.appendChild(b);});shell.appendChild(grid);}
function showContext(event){const h=host();if(!h?.contains(event.target)||event.target.closest('.sos-tool,.os-window-controls,.os-desktop-item,.os-folder-window'))return;event.preventDefault();contextMenu?.remove();contextMenu=document.createElement('div');contextMenu.id='osDesktopContext';contextMenu.style.left=Math.min(event.clientX,window.innerWidth-235)+'px';contextMenu.style.top=Math.min(event.clientY,window.innerHeight-180)+'px';contextMenu.innerHTML='<button data-folder>📁 New Folder</button><button data-note>📝 New Note</button><button data-upload>📄 Upload File</button>';document.body.appendChild(contextMenu);contextMenu.querySelector('[data-folder]').onclick=()=>{createFolder();contextMenu.remove();};contextMenu.querySelector('[data-note]').onclick=()=>{createNote();contextMenu.remove();};contextMenu.querySelector('[data-upload]').onclick=()=>{uploadFile();contextMenu.remove();};}

function init(){installStyles();document.addEventListener('click',captureFolderOpen,true);document.addEventListener('contextmenu',showContext);document.addEventListener('click',event=>{if(contextMenu&&!contextMenu.contains(event.target)){contextMenu.remove();contextMenu=null;}});watchDock();setTimeout(()=>{const node=folderNode();if(node)registerWindow(node,titleFor(node),{service:service(),scroll:0});renderDesktopIcons();},350);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.SulandraDesktopOS={version:'2026.08.04.2',windows,restore,minimize,close:closeWindow,createFolder,createNote,uploadFile,registerWindow};
})();