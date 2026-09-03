/* SULANDRA_CODEBASE_NATIVE_GRID_V3
 * PROTOTYPE_V19_PARITY
 * PROTOTYPE_V19_NAVIGATION
 * Production presentation/runtime adapter for Sulandra Codebase.
 * Real repository, file, terminal, Preview and IDE backends remain owned by the
 * existing authenticated Sulandra Codebase runtime; this file owns presentation,
 * navigation, tab ordering, grid composition and resize behavior only.
 */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_NATIVE_GRID_V3__)return;
window.__SULANDRA_CODEBASE_NATIVE_GRID_V3__=true;

const KEY='sulandra:codebase:native-grid-v3';
const DRAFT_KEY='sulandra:codebase:drafts-v2';
const PALETTE=['#4fc3f7','#81c784','#ba68c8','#e57373','#ffb74d','#4dd0e1','#a78bfa','#f9a8d4'];
const MODES={one:{count:1},two:{count:2},vertical:{count:2},'stack-2-1':{count:3},'stack-1-2':{count:3},four:{count:4}};
const SIDEBAR_TITLES={explorer:'EXPLORER',search:'SEARCH',git:'SOURCE CONTROL',debug:'RUN AND DEBUG',ext:'EXTENSIONS'};
let shell=null,layoutMode='one',order=[],cache=new Map(),renderQueued=false,observer=null;
let sidebarMode='explorer',statusHeight=24,leftWidth=260,rightWidth=380,treeEntries=[];
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const basename=p=>String(p||'').split('/').pop()||p;
const fileId=path=>`file:${path}`,termId=id=>`terminal:${id}`;
const parseId=id=>{const i=String(id).indexOf(':');return {type:String(id).slice(0,i),value:String(id).slice(i+1)}};
const count=()=>MODES[layoutMode]?.count||1;
const state=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({version:19,layoutMode,gridCount:count(),order,sidebarMode,statusHeight,leftWidth,rightWidth}))}catch{}};
function load(){
 const s=state();
 if(MODES[s.layoutMode])layoutMode=s.layoutMode;else if(Number(s.gridCount)===2)layoutMode='two';else if(Number(s.gridCount)===3)layoutMode='stack-2-1';else if(Number(s.gridCount)===4)layoutMode='four';else layoutMode='one';
 order=Array.isArray(s.order)?s.order.filter(x=>typeof x==='string').slice(0,40):[];
 if(SIDEBAR_TITLES[s.sidebarMode])sidebarMode=s.sidebarMode;
 const sh=Number(s.statusHeight);if(sh>=3&&sh<=200)statusHeight=sh;
 const lw=Number(s.leftWidth);if(lw>=0&&lw<=620)leftWidth=lw;
 const rw=Number(s.rightWidth);if(rw>=0&&rw<=760)rightWidth=rw;
}
function originalFileTabs(){return qa('#scbTabs .scb-tab[data-path]').map(n=>({id:fileId(n.dataset.path),path:n.dataset.path,node:n}))}
function terminalIds(){return qa('#itwsRtTabs [data-terminal-id]').map(n=>n.dataset.terminalId).filter(Boolean)}
function syncOrder(){const present=[...originalFileTabs().map(x=>x.id),...terminalIds().map(termId)];order=order.filter(id=>present.includes(id));for(const id of present)if(!order.includes(id))order.push(id);save()}
function colorFor(id){const idx=order.indexOf(id);return PALETTE[(idx<0?0:idx)%PALETTE.length]}
function currentPath(){return q('#scbTabs .scb-tab.active')?.dataset.path||''}
function activeTerminal(){return q('#itwsRtTabs [data-terminal-id].active')?.dataset.terminalId||''}
function currentId(){const p=currentPath();if(p)return fileId(p);const t=activeTerminal();return t?termId(t):''}
function sourceWrap(){return q('.scb-source-wrap',shell)}
function originalFileTab(path){return q(`#scbTabs .scb-tab[data-path="${CSS.escape(path)}"]`)}
function terminalPane(id){return q(`.itws-xterm-pane[data-session-id="${CSS.escape(id)}"],#itwsXtermPane-${CSS.escape(id)}`)}
function clickOriginalFile(path){originalFileTab(path)?.querySelector('.scb-tab-open')?.click()}
function closeOriginalFile(path){originalFileTab(path)?.querySelector('.scb-tab-close')?.click()}
function clickTerminal(id){q(`#itwsRtTabs [data-terminal-id="${CSS.escape(id)}"]`)?.click()}
function closeTerminal(id){const tab=q(`#itwsRtTabs [data-terminal-id="${CSS.escape(id)}"]`);if(!tab)return;const close=tab.querySelector('.itws-rt-tab-close,.itws-terminal-tab-close,[data-close-terminal]');if(close)close.click();else tab.querySelector('button:last-child')?.click()}
function highlight(text,path){
 const raw=String(text??''),markup=/\.(html?|xml|svg)$/i.test(path);
 if(markup)return raw.split(/(<\/?[A-Za-z][^>]*>|<!--[\s\S]*?-->)/g).map(t=>t.startsWith('<')?`<span class="${t.startsWith('<!--')?'com':'tag'}">${esc(t)}</span>`:esc(t)).join('');
 const words=new Set('async await break case catch class const continue default delete do else export extends finally for from function if import in instanceof let new of return static super switch throw try typeof var void while yield true false null undefined this interface type enum namespace readonly public private protected'.split(' '));
 const re=/(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b|[=+\-*\/%<>!&|?:]+)/g;
 let out='',i=0,m;while((m=re.exec(raw))){out+=esc(raw.slice(i,m.index));const t=m[0];let c='';if(t.startsWith('//')||t.startsWith('/*')||t.startsWith('#'))c='com';else if(/^['"`]/.test(t))c='str';else if(/^\d/.test(t))c='num';else if(words.has(t))c='kw';else if(/^[=+\-*\/%<>!&|?:]+$/.test(t))c='op';else if(/^\w/.test(t)&&/^\s*\(/.test(raw.slice(re.lastIndex)))c='fn';out+=c?`<span class="${c}">${esc(t)}</span>`:esc(t);i=m.index+t.length}return out+esc(raw.slice(i))
}
async function fetchFile(path){if(cache.has(path))return cache.get(path);const p=fetch(`/api/it-solutions/codebase/file?path=${encodeURIComponent(path)}`,{credentials:'same-origin',headers:{Accept:'application/json'}}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||j.message||`Source request failed (${r.status})`);const d=j.data??j;return String(d.content??'')});cache.set(path,p);try{return await p}catch(e){cache.delete(path);throw e}}
async function refreshNavigationTree(){try{const r=await fetch('/api/it-solutions/codebase/tree',{credentials:'same-origin',headers:{Accept:'application/json'}});const j=await r.json().catch(()=>({}));if(!r.ok)return;const d=j.data??j;treeEntries=(Array.isArray(d?.entries)?d.entries:[]).filter(x=>x?.path&&x.type==='blob')}catch{}}
function layoutIcon(mode){return `<span class="scb-layout-icon ${mode}" aria-hidden="true"></span>`}
function navIcon(mode){
 if(mode==='explorer')return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3z"/><path d="M9 3v18"/></svg>';
 if(mode==='search')return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>';
 if(mode==='git')return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 9v12"/><path d="M15 18H9V6h6"/></svg>';
 if(mode==='debug')return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M8 6l8 4-8 4 8 4"/></svg>';
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/></svg>';
}
function setTopAction(id,html,title){const b=q(id,shell);if(!b)return;b.innerHTML=html;b.title=title}
function ensureBrand(){
 const strong=q('.scb-brand strong',shell);if(strong&&!strong.dataset.v19){strong.dataset.v19='1';strong.innerHTML='<span class="scb-brand-sulandra">Sulandra</span> <span class="scb-brand-codebase">Codebase</span>'}
 setTopAction('#scbRefresh','⟳ <span>Refresh</span>','Refresh repository source');
 setTopAction('#scbOpenIde','⌘ <span>IDE</span>','Open IDE inside Codebase');
 setTopAction('#scbOpenTerminal','>_ <span>Terminal</span>','Open a new Codebase terminal');
 setTopAction('#scbFullscreen','▤ <span>Full Screen</span>','Full Screen');
 setTopAction('#scbExit','✕ <span>Exit Codebase</span>','Exit Codebase');
}
function ensureSidebar(){
 const explorer=q('.scb-explorer',shell);if(!explorer)return;
 if(!q('#scbPrototypeSidebarHead',explorer)){
   const head=document.createElement('div');head.id='scbPrototypeSidebarHead';head.className='scb-prototype-sidebar-head';
   head.innerHTML=`<strong id="scbSidebarTitle">EXPLORER</strong><div class="scb-sidebar-icons">${['explorer','search','git','debug','ext'].map(mode=>`<button type="button" class="scb-sidebar-nav scb-sidebar-nav-${mode}" data-sidebar-mode="${mode}" title="${SIDEBAR_TITLES[mode]}">${navIcon(mode)}</button>`).join('')}<button type="button" id="scbNativeNewFile" class="scb-sidebar-new" title="New File">＋</button></div>`;
   explorer.prepend(head);qa('[data-sidebar-mode]',head).forEach(b=>b.onclick=()=>switchSidebar(b.dataset.sidebarMode));q('#scbNativeNewFile',head).onclick=()=>q('#scbNewFile',explorer)?.click();
 }
 if(!q('#scbSidebarViewExplorer',explorer)){
   const view=document.createElement('div');view.id='scbSidebarViewExplorer';view.className='scb-sidebar-view';
   for(const node of [q('#scbNewFileBar',explorer),q('.scb-search',explorer),q('#scbTree',explorer)])if(node)view.appendChild(node);
   explorer.appendChild(view);
 }
 if(!q('#scbSidebarViewSearch',explorer)){
   const view=document.createElement('div');view.id='scbSidebarViewSearch';view.className='scb-sidebar-view';
   view.innerHTML='<div class="scb-sidebar-filter"><input id="scbCodeSearch" type="search" autocomplete="off" placeholder="Search paths across codebase..."></div><div id="scbCodeSearchResults" class="scb-sidebar-results"><div class="scb-sidebar-empty">Search the live repository tree.</div></div>';
   explorer.appendChild(view);q('#scbCodeSearch',view).addEventListener('input',renderPathSearch);
 }
 if(!q('#scbSidebarViewGit',explorer)){
   const view=document.createElement('div');view.id='scbSidebarViewGit';view.className='scb-sidebar-view';explorer.appendChild(view);
 }
 if(!q('#scbSidebarViewDebug',explorer)){
   const view=document.createElement('div');view.id='scbSidebarViewDebug';view.className='scb-sidebar-view';
   view.innerHTML='<div class="scb-side-panel"><button type="button" id="scbDebugTerminal" class="scb-side-primary">▶ Open Terminal</button><div class="scb-side-section"><strong>WORKSPACE EXECUTION</strong><p>Run and debug repository commands in the real isolated Codebase terminal. No simulated variables or call stack are shown.</p></div></div>';
   explorer.appendChild(view);q('#scbDebugTerminal',view).onclick=()=>q('#scbOpenTerminal',shell)?.click();
 }
 if(!q('#scbSidebarViewExt',explorer)){
   const view=document.createElement('div');view.id='scbSidebarViewExt';view.className='scb-sidebar-view';view.innerHTML='<div class="scb-sidebar-filter"><input type="search" disabled placeholder="Search Extensions"></div><div class="scb-side-panel"><strong>EXTENSIONS</strong><p>No extension marketplace is connected to this production Codebase runtime. The panel intentionally shows no mock extensions.</p></div>';explorer.appendChild(view);
 }
 switchSidebar(sidebarMode,false);
}
function switchSidebar(mode,persist=true){
 if(!SIDEBAR_TITLES[mode])mode='explorer';sidebarMode=mode;if(persist)save();
 const title=q('#scbSidebarTitle',shell);if(title)title.textContent=SIDEBAR_TITLES[mode];
 qa('.scb-sidebar-nav',shell).forEach(b=>b.classList.toggle('active',b.dataset.sidebarMode===mode));
 qa('.scb-sidebar-view',shell).forEach(v=>v.classList.remove('active'));
 q(`#scbSidebarView${mode==='explorer'?'Explorer':mode==='search'?'Search':mode==='git'?'Git':mode==='debug'?'Debug':'Ext'}`,shell)?.classList.add('active');
 if(mode==='search'){void refreshNavigationTree();setTimeout(()=>q('#scbCodeSearch',shell)?.focus(),0)}
 if(mode==='git')renderSourceControl();
}
function renderPathSearch(){
 const input=q('#scbCodeSearch',shell),host=q('#scbCodeSearchResults',shell);if(!host)return;const needle=String(input?.value||'').trim().toLowerCase();
 if(!needle){host.innerHTML='<div class="scb-sidebar-empty">Search the live repository tree.</div>';return}
 const rows=treeEntries.filter(x=>x.path.toLowerCase().includes(needle)).slice(0,100);host.innerHTML='';
 for(const item of rows){const b=document.createElement('button');b.type='button';b.className='scb-search-result';b.innerHTML=`<strong>${esc(basename(item.path))}</strong><small>${esc(item.path)}</small>`;b.onclick=()=>activateRealPath(item.path);host.appendChild(b)}
 if(!rows.length)host.innerHTML='<div class="scb-sidebar-empty">No matching repository paths.</div>';
}
function activateRealPath(path){
 switchSidebar('explorer');const filter=q('#scbFilter',shell);if(!filter)return;filter.value=path;filter.dispatchEvent(new Event('input',{bubbles:true}));
 setTimeout(()=>{const row=q(`#scbTree .scb-tree-row[data-path="${CSS.escape(path)}"][data-type="blob"]`,shell);row?.click();filter.value='';filter.dispatchEvent(new Event('input',{bubbles:true}))},30);
}
function readDrafts(){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'{}');return d&&typeof d==='object'?d:{}}catch{return {}}}
function renderSourceControl(){
 const host=q('#scbSidebarViewGit',shell);if(!host)return;const drafts=readDrafts();const rows=Object.entries(drafts).filter(([,d])=>d?.dirty||d?.saved||d?.created).sort((a,b)=>(b[1]?.updatedAt||0)-(a[1]?.updatedAt||0));
 host.innerHTML='<div class="scb-side-panel"><button type="button" id="scbSourceCommit" class="scb-side-primary">Commit workspace</button><div class="scb-side-section"><strong>CHANGES</strong><div id="scbSourceChanges"></div></div></div>';
 q('#scbSourceCommit',host).onclick=()=>q('#scbCommit',shell)?.click();const changes=q('#scbSourceChanges',host);
 if(!rows.length){changes.innerHTML='<p>No workspace changes.</p>';return}
 for(const [path,d] of rows){const b=document.createElement('button');b.type='button';b.className='scb-source-change';b.innerHTML=`<span>${d?.dirty?'M':d?.created?'A':'S'}</span><div><strong>${esc(basename(path))}</strong><small>${esc(path)}</small></div>`;b.onclick=()=>activateRealPath(path);changes.appendChild(b)}
}
function ensureWorkspaceHeader(){
 const editor=q('.scb-editor',shell),oldTabs=q('#scbTabs',shell),toolbar=q('.scb-editor-toolbar',shell),stack=q('.scb-editor-stack',shell),actions=q('.scb-editor-actions',shell);if(!editor||!oldTabs||!toolbar||!stack||!actions)return false;
 let header=q('#scbNativeWorkspaceHeader',editor);if(!header){header=document.createElement('div');header.id='scbNativeWorkspaceHeader';header.className='scb-native-workspace-header';editor.insertBefore(header,editor.firstChild)}
 let tabs=q('#scbNativeTabs',header);if(!tabs){tabs=document.createElement('div');tabs.id='scbNativeTabs';tabs.className='scb-native-tabs';header.appendChild(tabs)}
 let controls=q('#scbNativeControls',header);if(!controls){controls=document.createElement('div');controls.id='scbNativeControls';controls.className='scb-native-controls';header.appendChild(controls)}
 if(actions.parentElement!==controls)controls.appendChild(actions);
 let grids=q('#scbGridControls',controls);if(!grids){grids=document.createElement('div');grids.id='scbGridControls';grids.className='scb-grid-controls';grids.innerHTML=[['one','1 Grid'],['two','Side by Side'],['vertical','Vertical Stack'],['stack-2-1','2 Top, 1 Bottom'],['stack-1-2','1 Top, 2 Bottom'],['four','4 Grids']].map(([mode,title])=>`<button type="button" data-grid-mode="${mode}" title="${title}">${layoutIcon(mode)}</button>`).join('');controls.appendChild(grids);qa('[data-grid-mode]',grids).forEach(b=>b.onclick=()=>{layoutMode=b.dataset.gridMode;save();render()})}
 if(!q('#scbNativeGrid',stack)){const grid=document.createElement('div');grid.id='scbNativeGrid';grid.className='scb-native-grid';stack.appendChild(grid)}
 return true;
}
function ensureStatusResize(){
 const footer=q('.scb-statusbar',shell);if(!footer)return;
 let r=q('#scbStatusResize',shell);if(!r){r=document.createElement('div');r.id='scbStatusResize';r.className='scb-status-resizer';footer.before(r);r.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();const startY=e.clientY,start=statusHeight;r.setPointerCapture?.(e.pointerId);r.classList.add('resizing');const move=ev=>{let next=start+(startY-ev.clientY);if(next<6)next=3;next=Math.max(3,Math.min(200,next));statusHeight=next;applySizes()};const up=()=>{r.classList.remove('resizing');r.removeEventListener('pointermove',move);r.removeEventListener('pointerup',up);r.removeEventListener('pointercancel',up);save()};r.addEventListener('pointermove',move);r.addEventListener('pointerup',up);r.addEventListener('pointercancel',up)})}
 applySizes();
}
function applySizes(){
 if(!shell)return;const maxRight=Math.max(0,Math.floor(window.innerWidth*.25));rightWidth=Math.min(rightWidth,760,maxRight||rightWidth);shell.style.setProperty('--scb-left',`${leftWidth}px`);shell.style.setProperty('--scb-right',`${rightWidth}px`);shell.style.setProperty('--scb-status-height',`${statusHeight}px`);shell.classList.toggle('scb-status-collapsed',statusHeight<15);shell.classList.toggle('scb-left-collapsed',leftWidth<40);shell.classList.toggle('scb-right-collapsed',rightWidth<40)
}
function bindOuterResizers(){
 for(const split of qa('.scb-splitter[data-side]',shell)){if(split.dataset.prototypeResize==='1')continue;split.dataset.prototypeResize='1';split.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();const side=split.dataset.side,startX=e.clientX,start=side==='left'?leftWidth:rightWidth;split.setPointerCapture?.(e.pointerId);split.classList.add('resizing');const move=ev=>{const dx=ev.clientX-startX;let next=side==='left'?start+dx:start-dx;if(next<40)next=0;const max=side==='left'?620:Math.min(760,Math.max(260,Math.floor(window.innerWidth*.25)));next=Math.max(0,Math.min(max,next));if(side==='left')leftWidth=next;else rightWidth=next;applySizes();window.dispatchEvent(new CustomEvent('sulandra:workspace-layout-resized'))};const up=()=>{split.classList.remove('resizing');split.removeEventListener('pointermove',move);split.removeEventListener('pointerup',up);split.removeEventListener('pointercancel',up);save()};split.addEventListener('pointermove',move);split.addEventListener('pointerup',up);split.addEventListener('pointercancel',up)},true)}
 const ide=q('#scbOpenIde',shell);if(ide&&!ide.dataset.prototypeReopen){ide.dataset.prototypeReopen='1';ide.addEventListener('click',()=>{if(rightWidth<40){rightWidth=Math.min(380,Math.max(260,Math.floor(window.innerWidth*.25)));applySizes();save()}},true)}
}
function ensureStructure(){
 shell=q('#sulandraCodebase');if(!shell)return false;shell.dataset.prototype='v19';ensureBrand();ensureSidebar();if(!ensureWorkspaceHeader())return false;ensureStatusResize();bindOuterResizers();applySizes();return true
}
function restoreLiveEditor(){const wrap=sourceWrap(),grid=q('#scbNativeGrid',shell);if(wrap&&grid&&wrap.parentElement?.closest('.scb-native-cell'))grid.before(wrap)}
function stashEngineeringTerminal(){const real=q('#itwsRealTerminal');if(!real)return;real.classList.add('scb-native-terminal-stash');const deck=q('#scbTerminalMount',shell);if(deck&&!deck.contains(real))deck.appendChild(real)}
function promoteIntoVisible(id){const n=count(),idx=order.indexOf(id);if(idx>=n){order.splice(idx,1);order.unshift(id);save()}}
function activate(id){promoteIntoVisible(id);const x=parseId(id);if(x.type==='file')clickOriginalFile(x.value);else if(x.type==='terminal')clickTerminal(x.value);setTimeout(render,80)}
function closeId(id){const x=parseId(id);order=order.filter(v=>v!==id);save();if(x.type==='file')closeOriginalFile(x.value);else closeTerminal(x.value);setTimeout(()=>{syncOrder();render()},100)}
function installDrag(tab,id){tab.draggable=true;tab.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/scb-tab',id);tab.classList.add('dragging')});tab.addEventListener('dragend',()=>tab.classList.remove('dragging'));tab.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move'});tab.addEventListener('drop',e=>{e.preventDefault();const from=e.dataTransfer.getData('text/scb-tab');if(!from||from===id)return;const a=order.indexOf(from),b=order.indexOf(id);if(a<0||b<0)return;const item=order.splice(a,1)[0];order.splice(b,0,item);save();render()})}
function renderTabs(){
 const host=q('#scbNativeTabs',shell);if(!host)return;host.innerHTML='';const visible=new Set(order.slice(0,count())),active=currentId();
 for(const id of order){const x=parseId(id),color=colorFor(id),tab=document.createElement('div');tab.className='scb-native-tab';tab.style.setProperty('--tab-accent',color);tab.dataset.visible=String(visible.has(id));tab.dataset.active=String(active===id);tab.dataset.kind=x.type;const title=x.type==='terminal'?`Terminal ${Math.max(1,terminalIds().indexOf(x.value)+1)}`:basename(x.value);tab.innerHTML=`<button class="scb-native-title" type="button" title="${esc(x.value)}">${esc(title)}</button><button class="scb-native-close" type="button" aria-label="Close ${esc(title)}">×</button>`;q('.scb-native-title',tab).onclick=()=>activate(id);q('.scb-native-close',tab).onclick=e=>{e.stopPropagation();closeId(id)};installDrag(tab,id);host.appendChild(tab)}
}
async function renderFileSnapshot(body,path){body.innerHTML='<div class="scb-empty">Loading source…</div>';try{const text=await fetchFile(path);if(!body.isConnected)return;const pre=document.createElement('pre');pre.className='scb-native-snapshot';pre.innerHTML=highlight(text,path);body.replaceChildren(pre)}catch(e){body.innerHTML=`<div class="scb-empty scb-error">${esc(e?.message||'Source unavailable')}</div>`}}
function addResizer(grid,kind){const resizer=document.createElement('div');resizer.className=`scb-grid-resizer ${kind}`;const propA=kind==='col'?'--col-1':'--row-1',propB=kind==='col'?'--col-2':'--row-2';resizer.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();resizer.setPointerCapture?.(e.pointerId);resizer.classList.add('resizing');const rect=grid.getBoundingClientRect();const move=ev=>{const raw=kind==='col'?((ev.clientX-rect.left)/rect.width)*100:((ev.clientY-rect.top)/rect.height)*100;const pct=Math.max(15,Math.min(85,raw));grid.style.setProperty(propA,`${pct}%`);grid.style.setProperty(propB,`${100-pct}%`);resizer.style[kind==='col'?'left':'top']=`${pct}%`;window.dispatchEvent(new CustomEvent('sulandra:workspace-layout-resized'))};const up=()=>{resizer.classList.remove('resizing');resizer.removeEventListener('pointermove',move);resizer.removeEventListener('pointerup',up);resizer.removeEventListener('pointercancel',up)};resizer.addEventListener('pointermove',move);resizer.addEventListener('pointerup',up);resizer.addEventListener('pointercancel',up)});grid.appendChild(resizer)}
function renderGrid(){
 const grid=q('#scbNativeGrid',shell);if(!grid)return;restoreLiveEditor();grid.dataset.mode=layoutMode;grid.style.setProperty('--col-1','1fr');grid.style.setProperty('--col-2','1fr');grid.style.setProperty('--row-1','1fr');grid.style.setProperty('--row-2','1fr');grid.innerHTML='';const livePath=currentPath(),wrap=sourceWrap(),n=count();
 for(let i=0;i<n;i++){const id=order[i],cell=document.createElement('section');cell.className='scb-native-cell';if(!id){cell.dataset.empty='true';cell.innerHTML=`<div class="scb-native-empty"><strong>＋</strong><span>Empty Grid ${i+1}</span></div>`;grid.appendChild(cell);continue}const x=parseId(id),color=colorFor(id);cell.style.setProperty('--pane-accent',color);cell.dataset.kind=x.type;const body=document.createElement('div');body.className='scb-native-cell-body';cell.appendChild(body);grid.appendChild(cell);if(x.type==='file'){if(x.value===livePath&&wrap)body.appendChild(wrap);else void renderFileSnapshot(body,x.value)}else{const term=document.createElement('div');term.className='scb-native-terminal-body';body.appendChild(term);const tp=terminalPane(x.value);if(tp)term.appendChild(tp);else term.innerHTML='<div class="scb-empty">Starting terminal…</div>'}}
 if(['two','stack-2-1','stack-1-2','four'].includes(layoutMode))addResizer(grid,'col');if(['vertical','stack-2-1','stack-1-2','four'].includes(layoutMode))addResizer(grid,'row');requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('sulandra:workspace-layout-resized')))
}
function render(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;if(!ensureStructure())return;syncOrder();renderTabs();renderGrid();qa('[data-grid-mode]',shell).forEach(b=>b.classList.toggle('active',b.dataset.gridMode===layoutMode));if(sidebarMode==='git')renderSourceControl();stashEngineeringTerminal()})}
async function addTerminal(){const before=terminalIds();try{if(!before.length)await window.SulandraCodebase?.openTerminal?.({layout:1});else{const add=q('#itwsRtNewTab');if(add)add.click();else await window.SulandraCodebase?.openTerminal?.({layout:1})}}catch{}const start=Date.now();while(Date.now()-start<5000){const ids=terminalIds();if(ids.length>before.length||(!before.length&&ids.length)){syncOrder();stashEngineeringTerminal();render();return}await new Promise(r=>setTimeout(r,80))}render()}
function interceptTerminalButton(){const b=q('#scbOpenTerminal',shell);if(!b||b.dataset.nativeGrid==='1')return;b.dataset.nativeGrid='1';b.title='Open a new Codebase terminal tab';b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();void addTerminal()},true)}
function watch(){observer?.disconnect();observer=new MutationObserver(m=>{if(m.some(x=>x.target?.id==='scbTabs'||x.target?.id==='itwsRtTabs'||x.target?.closest?.('#scbTabs,#itwsRtTabs')))render()});observer.observe(document.documentElement,{childList:true,subtree:true})}
function boot(){load();const tick=()=>{if(ensureStructure()){interceptTerminalButton();watch();void refreshNavigationTree();render();window.addEventListener('resize',()=>{applySizes();window.dispatchEvent(new CustomEvent('sulandra:workspace-layout-resized'))},{passive:true});return}setTimeout(tick,80)};tick()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.SulandraCodebaseNativeGrid={render,addTerminal,setGrid:mode=>{if(typeof mode==='number')layoutMode=mode===1?'one':mode===2?'two':mode===3?'stack-2-1':'four';else if(MODES[mode])layoutMode=mode;save();render()},getOrder:()=>order.slice(),getLayout:()=>layoutMode,switchSidebar};
})();
