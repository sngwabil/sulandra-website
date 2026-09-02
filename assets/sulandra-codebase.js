/* SULANDRA_CODEBASE_V1 */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_V1__)return;
window.__SULANDRA_CODEBASE_V1__=true;

const OWNER='sngwabil';
const REPO='sulandra-website';
const BRANCH='release/sulandra-1.0';
const API=`https://api.github.com/repos/${OWNER}/${REPO}`;
const MAX_FILE_BYTES=512*1024;
const STATE_KEY='sulandra:codebase:state-v1';
const LAYOUT_KEY='sulandra:codebase:layout-v1';
const FOLDER_KEY='sulandra:codebase:folders-v1';
const BINARY_EXT=new Set(['png','jpg','jpeg','gif','webp','ico','bmp','pdf','zip','gz','tgz','7z','rar','woff','woff2','ttf','otf','eot','mp3','wav','ogg','mp4','mov','avi','webm','exe','dll','so','dylib','class','jar','pyc','sqlite','db']);
const DENY_SEGMENTS=new Set(['.git','node_modules','.idea','.vscode-history','.terraform','.aws','.ssh']);
const DENY_EXACT=new Set(['.npmrc','.pypirc','.netrc','id_rsa','id_ed25519','credentials','credentials.json','secrets.json','service-account.json','service_account.json']);
const DENY_SUFFIX=['.pem','.key','.p12','.pfx','.jks','.keystore','.der','.crt.secret'];

let shell=null,treeItems=[],treeRoot=null,activePath='',openTabs=[],openedFolders=new Set(),ownsFullscreen=false,currentTreeSha='',currentCommitSha='';
let sourceAbort=null;

const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const basename=p=>String(p||'').split('/').pop()||p;
const ext=p=>{const b=basename(p);const i=b.lastIndexOf('.');return i>0?b.slice(i+1).toLowerCase():''};
const normalizePath=value=>{
 const raw=String(value||'').trim();
 if(!raw||raw.includes('\0')||raw.startsWith('/')||raw.startsWith('\\'))return null;
 const cleaned=raw.replace(/\\/g,'/').replace(/\/{2,}/g,'/').replace(/^\.\//,'');
 const parts=cleaned.split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'))return null;
 return parts.join('/');
};
const blockedPath=value=>{
 const p=normalizePath(value);if(!p)return true;
 const parts=p.toLowerCase().split('/'),name=parts.at(-1)||'';
 if(parts.some(x=>DENY_SEGMENTS.has(x)))return true;
 if(parts.some(x=>x==='.env'||x.startsWith('.env.')))return true;
 if(DENY_EXACT.has(name))return true;
 if(DENY_SUFFIX.some(s=>name.endsWith(s)))return true;
 if(name.includes('credential')||name.includes('secret-key')||name.includes('private-key'))return true;
 return false;
};
const binaryPath=p=>BINARY_EXT.has(ext(p));
const formatBytes=n=>{const v=Number(n)||0;if(v<1024)return `${v} B`;if(v<1024**2)return `${(v/1024).toFixed(1)} KB`;return `${(v/1024**2).toFixed(1)} MB`};
const apiFetch=async(url,{signal}={})=>{
 const response=await fetch(url,{headers:{Accept:'application/vnd.github+json'},signal});
 if(!response.ok){const rate=response.headers.get('x-ratelimit-remaining');throw new Error(response.status===403&&rate==='0'?'GitHub source-view rate limit reached. Use the real IDE until it resets.':`Source request failed (${response.status})`)}
 return response.json();
};
const readState=()=>{try{const s=JSON.parse(localStorage.getItem(STATE_KEY)||'{}');openTabs=Array.isArray(s.tabs)?s.tabs.filter(p=>normalizePath(p)&&!blockedPath(p)).slice(0,20):[];activePath=normalizePath(s.active)||'';if(activePath&&!openTabs.includes(activePath))openTabs.push(activePath)}catch{openTabs=[];activePath=''}};
const saveState=()=>{try{localStorage.setItem(STATE_KEY,JSON.stringify({version:1,tabs:openTabs,active:activePath}))}catch{}};
const readFolders=()=>{try{const v=JSON.parse(localStorage.getItem(FOLDER_KEY)||'[]');openedFolders=new Set(Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,500):[])}catch{openedFolders=new Set()}};
const saveFolders=()=>{try{localStorage.setItem(FOLDER_KEY,JSON.stringify([...openedFolders].slice(0,500)))}catch{}};
const setStatus=(text,tone='')=>{const n=qs('#scbStatus');if(n){n.textContent=text;n.dataset.tone=tone}};
const setInspector=(item,textState='Ready')=>{
 const path=qs('#scbInspectorPath'),kind=qs('#scbInspectorKind'),size=qs('#scbInspectorSize'),sha=qs('#scbInspectorSha'),state=qs('#scbInspectorState');
 if(path)path.textContent=item?.path||'—';if(kind)kind.textContent=item?.type||'—';if(size)size.textContent=item?.size!=null?formatBytes(item.size):'—';if(sha)sha.textContent=item?.sha?item.sha.slice(0,12):'—';if(state)state.textContent=textState;
};

function buildTree(items){
 const root={name:REPO,path:'',type:'tree',children:new Map()};
 for(const item of items){
  const parts=item.path.split('/');let node=root;
  for(let i=0;i<parts.length;i++){
   const name=parts[i],path=parts.slice(0,i+1).join('/'),last=i===parts.length-1;
   if(!node.children.has(name))node.children.set(name,last?{...item,name,path,children:item.type==='tree'?new Map():null}:{name,path,type:'tree',children:new Map()});
   node=node.children.get(name);
  }
 }
 return root;
}
const nodeSort=(a,b)=>a.type===b.type?a.name.localeCompare(b.name):a.type==='tree'?-1:1;
function renderExplorer(){
 const host=qs('#scbTree');if(!host||!treeRoot)return;
 const filter=String(qs('#scbFilter')?.value||'').trim().toLowerCase();
 host.innerHTML='';
 const matches=node=>!filter||node.path.toLowerCase().includes(filter)||(node.children&&[...node.children.values()].some(matches));
 const render=(node,depth=0)=>{
  const children=[...(node.children?.values()||[])].filter(matches).sort(nodeSort);
  for(const child of children){
   const row=document.createElement('button');row.type='button';row.className='scb-tree-row';row.style.setProperty('--depth',String(depth));row.dataset.path=child.path;row.dataset.type=child.type;if(child.path===activePath)row.classList.add('active');
   if(child.type==='tree'){
    const open=filter||openedFolders.has(child.path);row.setAttribute('aria-expanded',String(Boolean(open)));row.innerHTML=`<span class="scb-caret">${open?'▾':'▸'}</span><span class="scb-icon">▰</span><span class="scb-name">${esc(child.name)}</span>`;
    row.onclick=()=>{openedFolders.has(child.path)?openedFolders.delete(child.path):openedFolders.add(child.path);saveFolders();renderExplorer()};host.appendChild(row);if(open)render(child,depth+1);
   }else{
    row.innerHTML=`<span class="scb-caret"></span><span class="scb-icon">·</span><span class="scb-name">${esc(child.name)}</span>`;row.onclick=()=>void openFile(child.path);host.appendChild(row);
   }
  }
 };
 render(treeRoot);
 if(!host.children.length)host.innerHTML='<div class="scb-empty">No visible source matches.</div>';
}
function renderTabs(){
 const host=qs('#scbTabs');if(!host)return;host.innerHTML='';
 for(const path of openTabs){
  const tab=document.createElement('div');tab.className='scb-tab'+(path===activePath?' active':'');tab.dataset.path=path;tab.innerHTML=`<button type="button" class="scb-tab-open" title="${esc(path)}">${esc(basename(path))}</button><button type="button" class="scb-tab-close" aria-label="Close ${esc(basename(path))}">×</button>`;
  qs('.scb-tab-open',tab).onclick=()=>void openFile(path,{preserveTabs:true});qs('.scb-tab-close',tab).onclick=e=>{e.stopPropagation();closeTab(path)};host.appendChild(tab);
 }
 if(!openTabs.length)host.innerHTML='<div class="scb-tab-placeholder">Open a file from Explorer</div>';
}
function closeTab(path){
 const i=openTabs.indexOf(path);if(i<0)return;openTabs.splice(i,1);
 if(activePath===path){activePath=openTabs[Math.min(i,openTabs.length-1)]||'';if(activePath)void openFile(activePath,{preserveTabs:true});else{const code=qs('#scbCode');if(code)code.textContent='Select a source file from Explorer.';setInspector(null,'No file open')}}
 saveState();renderTabs();
}
function decodeBase64(value){
 const binary=atob(String(value||'').replace(/\s/g,''));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);if(bytes.slice(0,8192).some(b=>b===0))throw new Error('Binary content is not displayed in Codebase.');return new TextDecoder('utf-8',{fatal:false}).decode(bytes);
}
async function openFile(path,{preserveTabs=false}={}){
 const safe=normalizePath(path);if(!safe||blockedPath(safe)){setStatus('Blocked by Codebase source policy','bad');return}
 const item=treeItems.find(x=>x.path===safe&&x.type==='blob');if(!item){setStatus('File is not in the current branch snapshot','bad');return}
 if(binaryPath(safe)){setInspector(item,'Binary file hidden');setStatus('Binary files are not displayed','warn');return}
 if(Number(item.size)>MAX_FILE_BYTES){setInspector(item,'File exceeds viewer limit');setStatus(`Viewer limit is ${formatBytes(MAX_FILE_BYTES)}`,'warn');return}
 activePath=safe;if(!preserveTabs&&!openTabs.includes(safe))openTabs.push(safe);else if(!openTabs.includes(safe))openTabs.push(safe);if(openTabs.length>20)openTabs=openTabs.slice(-20);saveState();renderTabs();renderExplorer();setInspector(item,'Loading source…');setStatus(`Loading ${safe}`);
 sourceAbort?.abort();sourceAbort=new AbortController();
 try{
  const blob=await apiFetch(`${API}/git/blobs/${encodeURIComponent(item.sha)}`,{signal:sourceAbort.signal});if(blob.encoding!=='base64')throw new Error('Unsupported GitHub blob encoding.');if(Number(blob.size)>MAX_FILE_BYTES)throw new Error(`Viewer limit is ${formatBytes(MAX_FILE_BYTES)}.`);const text=decodeBase64(blob.content);if(activePath!==safe)return;qs('#scbCode').textContent=text;qs('#scbBreadcrumb').textContent=safe;setInspector(item,'Read-only source snapshot');setStatus(`${safe} · ${formatBytes(blob.size)}`,'ok');
 }catch(error){if(error?.name==='AbortError')return;if(activePath!==safe)return;qs('#scbCode').textContent=`Unable to display ${safe}\n\n${error?.message||error}`;setInspector(item,'Source unavailable');setStatus(error?.message||'Source unavailable','bad')}
}
async function refreshTree(){
 setStatus('Refreshing release/sulandra-1.0…');qs('#scbTree').innerHTML='<div class="scb-empty">Loading repository tree…</div>';
 try{
  const branch=await apiFetch(`${API}/branches/${encodeURIComponent(BRANCH)}`);currentCommitSha=branch?.commit?.sha||'';currentTreeSha=branch?.commit?.commit?.tree?.sha||'';if(!currentTreeSha)throw new Error('Branch tree SHA is unavailable.');const tree=await apiFetch(`${API}/git/trees/${encodeURIComponent(currentTreeSha)}?recursive=1`);treeItems=(Array.isArray(tree.tree)?tree.tree:[]).filter(item=>item?.path&&!blockedPath(item.path)&&(item.type==='tree'||item.type==='blob')&&!binaryPath(item.path));treeRoot=buildTree(treeItems);qs('#scbBranchMeta').textContent=`${BRANCH} · ${currentCommitSha.slice(0,8)}`;renderExplorer();setStatus(`${treeItems.length} safe source entries · ${currentCommitSha.slice(0,8)}`,'ok');if(activePath&&treeItems.some(x=>x.path===activePath&&x.type==='blob'))void openFile(activePath,{preserveTabs:true});
 }catch(error){treeItems=[];treeRoot=null;qs('#scbTree').innerHTML=`<div class="scb-empty scb-error">${esc(error?.message||'Repository tree unavailable')}</div>`;setStatus(error?.message||'Repository tree unavailable','bad')}
}

function loadLayout(){try{const v=JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}');const left=Number(v.left),right=Number(v.right);if(left>=220&&left<=650)shell.style.setProperty('--scb-left',`${left}px`);if(right>=220&&right<=620)shell.style.setProperty('--scb-right',`${right}px`)}catch{}}
function saveLayout(){try{localStorage.setItem(LAYOUT_KEY,JSON.stringify({version:1,left:parseFloat(getComputedStyle(shell).getPropertyValue('--scb-left'))||300,right:parseFloat(getComputedStyle(shell).getPropertyValue('--scb-right'))||300}))}catch{}}
function bindSplitters(){
 qsa('.scb-splitter',shell).forEach(split=>split.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();split.setPointerCapture?.(event.pointerId);const start=event.clientX;const style=getComputedStyle(shell),left0=parseFloat(style.getPropertyValue('--scb-left'))||300,right0=parseFloat(style.getPropertyValue('--scb-right'))||300;const side=split.dataset.side;const move=e=>{const dx=e.clientX-start;if(side==='left')shell.style.setProperty('--scb-left',`${Math.max(220,Math.min(650,left0+dx))}px`);else shell.style.setProperty('--scb-right',`${Math.max(220,Math.min(620,right0-dx))}px`)};const up=()=>{split.removeEventListener('pointermove',move);split.removeEventListener('pointerup',up);split.removeEventListener('pointercancel',up);saveLayout()};split.addEventListener('pointermove',move);split.addEventListener('pointerup',up);split.addEventListener('pointercancel',up)}));
}
function ensureShell(){
 if(shell)return shell;
 shell=document.createElement('section');shell.id='sulandraCodebase';shell.className='scb-shell';shell.hidden=true;shell.setAttribute('aria-label','Sulandra Codebase');shell.innerHTML=`
  <header class="scb-topbar"><div class="scb-brand"><span class="scb-mark">SC</span><div><strong>Sulandra Codebase</strong><small id="scbBranchMeta">${BRANCH}</small></div></div><div class="scb-top-actions"><button type="button" id="scbRefresh">Refresh</button><button type="button" id="scbOpenIde">Open IDE</button><button type="button" id="scbOpenTerminal">Terminal</button><button type="button" id="scbFullscreen">Enter Full Screen</button><button type="button" id="scbExit" class="danger">Exit Codebase</button></div></header>
  <div class="scb-workspace">
   <aside class="scb-explorer"><div class="scb-pane-head"><strong>Explorer</strong><span>safe source view</span></div><div class="scb-search"><input id="scbFilter" type="search" autocomplete="off" placeholder="Filter files (⌘/Ctrl+P)"></div><div id="scbTree" class="scb-tree"><div class="scb-empty">Open Codebase to load the repository.</div></div></aside>
   <div class="scb-splitter" data-side="left" role="separator" aria-label="Resize Explorer"></div>
   <main class="scb-editor"><div id="scbTabs" class="scb-tabs"><div class="scb-tab-placeholder">Open a file from Explorer</div></div><div class="scb-breadcrumb" id="scbBreadcrumb">No file selected</div><pre class="scb-source"><code id="scbCode">Select a source file from Explorer.</code></pre></main>
   <div class="scb-splitter" data-side="right" role="separator" aria-label="Resize Inspector"></div>
   <aside class="scb-inspector"><div class="scb-pane-head"><strong>Inspector</strong><span>truthful runtime state</span></div><dl><dt>Path</dt><dd id="scbInspectorPath">—</dd><dt>Type</dt><dd id="scbInspectorKind">—</dd><dt>Size</dt><dd id="scbInspectorSize">—</dd><dt>Blob</dt><dd id="scbInspectorSha">—</dd><dt>Mode</dt><dd id="scbInspectorState">No file open</dd><dt>Git status</dt><dd>Unavailable in browser source view</dd><dt>Editing</dt><dd>Uses the real Sulandra IDE</dd><dt>Execution</dt><dd>Uses the real Engineering Terminal</dd></dl><div class="scb-policy"><strong>Source policy</strong><p>Secrets, credential files, .env files, private keys, binaries, oversized files, .git, and node_modules are excluded from this surface.</p></div></aside>
  </div>
  <footer class="scb-statusbar"><span id="scbStatus">Ready</span><span>read-only explorer · real IDE/terminal delegated</span></footer>`;
 document.body.appendChild(shell);readState();readFolders();loadLayout();bindSplitters();renderTabs();
 qs('#scbRefresh').onclick=()=>void refreshTree();qs('#scbOpenIde').onclick=()=>{closeCodebase({keepFullscreen:true});window.SulandraDockableWorkspace?.openIde?.()};qs('#scbOpenTerminal').onclick=()=>{closeCodebase({keepFullscreen:true});window.SulandraDockableWorkspace?.show?.('terminal');document.getElementById('itwsRealTerminal')?.scrollIntoView?.({block:'nearest'})};qs('#scbFullscreen').onclick=()=>requestFullscreen();qs('#scbExit').onclick=()=>closeCodebase();qs('#scbFilter').addEventListener('input',renderExplorer);
 document.addEventListener('keydown',event=>{if(shell.hidden)return;if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='p'){event.preventDefault();qs('#scbFilter')?.focus()}else if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='w'&&activePath){event.preventDefault();closeTab(activePath)}});
 return shell;
}
function requestFullscreen(){
 if(document.fullscreenElement){updateFullscreenUi();return}
 ownsFullscreen=true;const p=document.documentElement.requestFullscreen?.();if(p?.catch)p.catch(()=>{ownsFullscreen=false;updateFullscreenUi()});
}
function updateFullscreenUi(){const b=qs('#scbFullscreen');if(!b)return;const on=Boolean(document.fullscreenElement);b.hidden=on;b.textContent='Enter Full Screen'}
function closeCodebase({keepFullscreen=false}={}){if(!shell)return;shell.hidden=true;document.body.classList.remove('scb-open');sourceAbort?.abort();if(!keepFullscreen&&ownsFullscreen&&document.fullscreenElement){const p=document.exitFullscreen?.();if(p?.catch)p.catch(()=>{})}if(!keepFullscreen)ownsFullscreen=false}
function openCodebaseFromGesture(){
 ensureShell();
 // Must stay synchronous in this direct click handler: browser fullscreen requires user activation.
 if(!document.fullscreenElement)requestFullscreen();
 shell.hidden=false;document.body.classList.add('scb-open');updateFullscreenUi();
 if(!treeItems.length)void refreshTree();else{renderExplorer();renderTabs();if(activePath)void openFile(activePath,{preserveTabs:true})}
}
function installEntry(){
 const ideButton=document.getElementById('itwsWorkspaceIdeButton');if(!ideButton?.parentElement)return false;if(document.getElementById('itwsSulandraCodebaseButton'))return true;const btn=document.createElement('button');btn.type='button';btn.id='itwsSulandraCodebaseButton';btn.className=ideButton.className||'itws-workspace-tool';btn.textContent='Codebase';btn.title='Open Sulandra Codebase';btn.onclick=openCodebaseFromGesture;ideButton.parentElement.appendChild(btn);ensureShell();return true;
}
function boot(){if(installEntry())return;const observer=new MutationObserver(()=>{if(installEntry())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),30000)}
document.addEventListener('fullscreenchange',()=>{updateFullscreenUi();if(!document.fullscreenElement)ownsFullscreen=false});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.SulandraCodebase={open:openCodebaseFromGesture,close:closeCodebase,refresh:refreshTree,isBlockedPath:blockedPath,normalizePath};
})();
