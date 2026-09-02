/* SULANDRA_CODEBASE_V2
   Integrated code editor, workspace terminal layouts, preview/IDE dock, and deterministic file DNA.
   Production changes remain behind the normal Sulandra release path; inline writes target the isolated coding workspace. */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_V2__)return;
window.__SULANDRA_CODEBASE_V2__=true;

const REPO='sulandra-website';
const BRANCH='release/sulandra-1.0';
const MAX_FILE_BYTES=512*1024;
const STATE_KEY='sulandra:codebase:state-v2';
const LAYOUT_KEY='sulandra:codebase:layout-v2';
const FOLDER_KEY='sulandra:codebase:folders-v2';
const DRAFT_KEY='sulandra:codebase:drafts-v2';
const BINARY_EXT=new Set(['png','jpg','jpeg','gif','webp','ico','bmp','pdf','zip','gz','tgz','7z','rar','woff','woff2','ttf','otf','eot','mp3','wav','ogg','mp4','mov','avi','webm','exe','dll','so','dylib','class','jar','pyc','sqlite','db']);
const DENY_SEGMENTS=new Set(['.git','node_modules','.idea','.vscode-history','.terraform','.aws','.ssh']);
const DENY_EXACT=new Set(['.npmrc','.pypirc','.netrc','id_rsa','id_ed25519','credentials','credentials.json','secrets.json','service-account.json','service_account.json']);
const DENY_SUFFIX=['.pem','.key','.p12','.pfx','.jks','.keystore','.der','.crt.secret'];
const DNA_PALETTE=[
  {accent:'#67e8f9',soft:'rgba(103,232,249,.13)',weight:650,size:'11.20px'},
  {accent:'#a78bfa',soft:'rgba(167,139,250,.14)',weight:640,size:'11.05px'},
  {accent:'#86efac',soft:'rgba(134,239,172,.13)',weight:630,size:'11.28px'},
  {accent:'#f9a8d4',soft:'rgba(249,168,212,.13)',weight:645,size:'11.12px'},
  {accent:'#fde68a',soft:'rgba(253,230,138,.13)',weight:655,size:'11.24px'},
  {accent:'#fb923c',soft:'rgba(251,146,60,.13)',weight:635,size:'11.08px'},
  {accent:'#60a5fa',soft:'rgba(96,165,250,.13)',weight:650,size:'11.18px'},
  {accent:'#c4b5fd',soft:'rgba(196,181,253,.13)',weight:625,size:'11.30px'},
  {accent:'#5eead4',soft:'rgba(94,234,212,.13)',weight:640,size:'11.14px'},
  {accent:'#fda4af',soft:'rgba(253,164,175,.13)',weight:650,size:'11.22px'},
];
const KEYWORDS=new Set(('async await break case catch class const continue debugger default delete do else export extends finally for from function get if implements import in instanceof interface let new of package private protected public return set static super switch throw try typeof var void while with yield true false null undefined this enum type namespace declare readonly abstract override satisfies as keyof infer never unknown any string number boolean object symbol bigint constructor').split(/\s+/));

let shell=null,treeItems=[],treeRoot=null,activePath='',openTabs=[],openedFolders=new Set(),ownsFullscreen=false,currentCommitSha='';
let sourceAbort=null,currentContent='',currentFile=null,editMode=false,drafts={},dockMode='inspector',dockOpen=true,terminalOpen=false,terminalLayout=1;
let terminalHome=null,dockHomes=new Map(),termPaneHandlerInstalled=false;

const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const basename=p=>String(p||'').split('/').pop()||p;
const ext=p=>{const b=basename(p);const i=b.lastIndexOf('.');return i>0?b.slice(i+1).toLowerCase():''};
const dirname=p=>{const i=String(p||'').lastIndexOf('/');return i>0?p.slice(0,i):''};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const byteLength=value=>new TextEncoder().encode(String(value??'')).byteLength;
const shellQuote=value=>"'"+String(value).replace(/'/g,`'"'"'`)+"'";
const normalizePath=value=>{
 const raw=String(value||'').trim();
 if(!raw||raw.includes('\0')||raw.startsWith('/')||raw.startsWith('\\')||/^[A-Za-z]:[\\/]/.test(raw)||raw.includes('\\'))return null;
 const cleaned=raw.replace(/^\.\//,'');const parts=cleaned.split('/');
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
const fileDna=path=>{
 let h=2166136261;
 for(const c of String(path||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}
 return DNA_PALETTE[(h>>>0)%DNA_PALETTE.length];
};
const dnaStyle=path=>{const d=fileDna(path);return `--dna:${d.accent};--dna-soft:${d.soft};--dna-weight:${d.weight};--dna-size:${d.size}`};
const languageName=path=>{
 const x=ext(path);
 return ({js:'JavaScript',mjs:'JavaScript',cjs:'JavaScript',jsx:'JSX',ts:'TypeScript',tsx:'TSX',json:'JSON',css:'CSS',scss:'SCSS',html:'HTML',htm:'HTML',md:'Markdown',yml:'YAML',yaml:'YAML',sh:'Shell',bash:'Shell',sql:'SQL',py:'Python',prisma:'Prisma'})[x]||((basename(path)==='Dockerfile')?'Dockerfile':'Text');
};
const fileGlyph=path=>{
 const x=ext(path),b=basename(path).toLowerCase();
 if(['js','mjs','cjs','jsx'].includes(x))return 'JS';
 if(['ts','tsx'].includes(x))return 'TS';
 if(x==='json')return '{}';
 if(['css','scss'].includes(x))return '#';
 if(['html','htm'].includes(x))return '<>';
 if(['md','mdx'].includes(x))return 'M';
 if(['yml','yaml'].includes(x))return 'Y';
 if(['sh','bash'].includes(x))return '$';
 if(x==='sql')return 'DB';
 if(x==='prisma')return 'P';
 if(b==='dockerfile'||b.startsWith('dockerfile.'))return 'D';
 return '•';
};

const apiFetch=async(url,{signal}={})=>{
 const response=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'},signal});
 let payload={};try{payload=await response.json()}catch{}
 if(!response.ok){const message=payload?.error||payload?.message||`Source request failed (${response.status})`;throw new Error(message)}
 return payload?.data??payload;
};
const readState=()=>{try{const s=JSON.parse(localStorage.getItem(STATE_KEY)||'{}');openTabs=Array.isArray(s.tabs)?s.tabs.filter(p=>normalizePath(p)&&!blockedPath(p)).slice(0,24):[];activePath=normalizePath(s.active)||'';dockMode=['inspector','preview','ide'].includes(s.dockMode)?s.dockMode:'inspector';dockOpen=s.dockOpen!==false;terminalOpen=Boolean(s.terminalOpen);terminalLayout=[1,2,3,4].includes(Number(s.terminalLayout))?Number(s.terminalLayout):1;if(activePath&&!openTabs.includes(activePath))openTabs.push(activePath)}catch{openTabs=[];activePath='';dockMode='inspector';dockOpen=true;terminalOpen=false;terminalLayout=1}};
const saveState=()=>{try{localStorage.setItem(STATE_KEY,JSON.stringify({version:2,tabs:openTabs,active:activePath,dockMode,dockOpen,terminalOpen,terminalLayout}))}catch{}};
const readFolders=()=>{try{const v=JSON.parse(localStorage.getItem(FOLDER_KEY)||'[]');openedFolders=new Set(Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,500):[])}catch{openedFolders=new Set()}};
const saveFolders=()=>{try{localStorage.setItem(FOLDER_KEY,JSON.stringify([...openedFolders].slice(0,500)))}catch{}};
const readDrafts=()=>{try{const v=JSON.parse(localStorage.getItem(DRAFT_KEY)||'{}');drafts=v&&typeof v==='object'?v:{}}catch{drafts={}}};
const saveDrafts=()=>{try{const entries=Object.entries(drafts).sort((a,b)=>(b[1]?.updatedAt||0)-(a[1]?.updatedAt||0)).slice(0,12);localStorage.setItem(DRAFT_KEY,JSON.stringify(Object.fromEntries(entries)))}catch{}};
const setStatus=(text,tone='')=>{const n=qs('#scbStatus');if(n){n.textContent=text;n.dataset.tone=tone}};
const workspaceStateText=()=>{
 const ids=getTerminalIds();
 return ids.length?`Connected · ${ids.length} terminal${ids.length===1?'':'s'}`:'Starts on first edit/terminal action';
};
const updateInspectorRuntime=()=>{
 const git=qs('#scbInspectorGit'),editing=qs('#scbInspectorEditing'),execution=qs('#scbInspectorExecution'),workspace=qs('#scbInspectorWorkspace');
 if(git){const saved=Object.values(drafts).filter(d=>d?.saved).length,dirty=Object.values(drafts).filter(d=>d?.dirty).length;git.textContent=`workbench · ${dirty} draft${dirty===1?'':'s'} · ${saved} staged-ready`}
 if(editing)editing.textContent='Inline workspace editor + embedded Sulandra IDE';
 if(execution)execution.textContent=`Integrated terminal · ${terminalLayout}-pane layout`;
 if(workspace)workspace.textContent=workspaceStateText();
};
const setInspector=(item,textState='Ready')=>{
 const path=qs('#scbInspectorPath'),kind=qs('#scbInspectorKind'),size=qs('#scbInspectorSize'),sha=qs('#scbInspectorSha'),state=qs('#scbInspectorState'),lang=qs('#scbInspectorLang');
 if(path)path.textContent=item?.path||'—';if(kind)kind.textContent=item?.type||'—';if(size)size.textContent=item?.size!=null?formatBytes(item.size):'—';if(sha)sha.textContent=item?.sha?item.sha.slice(0,12):(item?.created?'NEW':'—');if(state)state.textContent=textState;if(lang)lang.textContent=item?.path?languageName(item.path):'—';
 updateInspectorRuntime();
};

function syntaxHtml(text,path){
 const raw=String(text??'');
 const x=ext(path),isMarkup=['html','htm','xml','svg'].includes(x),isMd=['md','mdx'].includes(x);
 if(isMarkup){
   const re=/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|&[A-Za-z0-9#]+;/g;let out='',i=0,m;
   while((m=re.exec(raw))){out+=esc(raw.slice(i,m.index));const token=m[0];out+=`<span class="${token.startsWith('<!--')?'tok-comment':'tok-tag'}">${esc(token)}</span>`;i=m.index+token.length}
   return out+esc(raw.slice(i));
 }
 if(isMd){
   const lines=raw.split('\n');
   return lines.map(line=>{
     if(/^\s*#{1,6}\s/.test(line))return `<span class="tok-heading">${esc(line)}</span>`;
     if(/^\s*```/.test(line))return `<span class="tok-keyword">${esc(line)}</span>`;
     return esc(line).replace(/(`[^`]+`)/g,'<span class="tok-string">$1</span>');
   }).join('\n');
 }
 const words=[...KEYWORDS].sort((a,b)=>b.length-a.length).join('|');
 const re=new RegExp(`(/\\*[\\s\\S]*?\\*/|//[^\\n]*|#[^\\n]*|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\\x60(?:\\\\.|[^\\x60\\\\])*\\x60|\\b(?:${words})\\b|\\b(?:0x[\\da-fA-F]+|\\d+(?:\\.\\d+)?)\\b)`,'g');
 let out='',i=0,m;
 while((m=re.exec(raw))){
   out+=esc(raw.slice(i,m.index));const token=m[0];let cls='tok-number';
   if(token.startsWith('//')||token.startsWith('/*')||(token.startsWith('#')&&!['css','scss'].includes(x)))cls='tok-comment';
   else if(token[0]==='"'||token[0]==="'"||token.charCodeAt(0)===96)cls='tok-string';
   else if(KEYWORDS.has(token))cls='tok-keyword';
   out+=`<span class="${cls}">${esc(token)}</span>`;i=m.index+token.length;
 }
 return out+esc(raw.slice(i));
}
function renderCodeView(content,path=activePath){
 const code=qs('#scbCode');if(!code)return;
 const lines=String(content??'').split('\n');
 code.innerHTML=lines.map((line,index)=>`<span class="scb-code-line"><span class="scb-line-no" aria-hidden="true">${index+1}</span><span class="scb-line-text">${syntaxHtml(line,path)||' '}</span></span>`).join('');
}
function setEditorMode(on,{focus=false}={}){
 editMode=Boolean(on);if(!shell)return;
 const view=qs('#scbSourceView'),editor=qs('#scbEditorInput'),edit=qs('#scbEdit'),save=qs('#scbSave');
 if(!activePath){editMode=false}
 shell.classList.toggle('scb-editing',editMode);
 if(view)view.hidden=editMode;if(editor){editor.hidden=!editMode;if(editMode)editor.value=currentContent}
 if(edit)edit.textContent=editMode?'View':'Edit';
 if(save)save.disabled=!activePath;
 if(editMode&&focus)setTimeout(()=>editor?.focus(),0);
}
function rememberDraft(path,content,patch={}){
 const previous=drafts[path]||{};
 drafts[path]={...previous,path,content:String(content??''),updatedAt:Date.now(),...patch};
 saveDrafts();return drafts[path];
}
function updateDirtyIndicator(){
 const draft=drafts[activePath],dirty=Boolean(draft?.dirty),saved=Boolean(draft?.saved);
 const indicator=qs('#scbDirty');if(indicator){indicator.hidden=!(dirty||saved);indicator.textContent=dirty?'UNSAVED':saved?'WORKSPACE':'';
 indicator.dataset.state=dirty?'dirty':saved?'saved':''}
 renderTabs();updateInspectorRuntime();
}
function currentEditorText(){const editor=qs('#scbEditorInput');return editMode&&editor?editor.value:currentContent}

function buildTree(items){
 const root={name:REPO,path:'',type:'tree',children:new Map()};
 for(const item of items){const parts=item.path.split('/');let node=root;for(let i=0;i<parts.length;i++){const name=parts[i],path=parts.slice(0,i+1).join('/'),last=i===parts.length-1;if(!node.children.has(name))node.children.set(name,last?{...item,name,path,children:item.type==='tree'?new Map():null}:{name,path,type:'tree',children:new Map()});node=node.children.get(name)}}
 return root;
}
const nodeSort=(a,b)=>a.type===b.type?a.name.localeCompare(b.name):a.type==='tree'?-1:1;
function renderExplorer(){
 const host=qs('#scbTree');if(!host||!treeRoot)return;const filter=String(qs('#scbFilter')?.value||'').trim().toLowerCase();host.innerHTML='';
 const matches=node=>!filter||node.path.toLowerCase().includes(filter)||(node.children&&[...node.children.values()].some(matches));
 const render=(node,depth=0)=>{for(const child of [...(node.children?.values()||[])].filter(matches).sort(nodeSort)){
   const row=document.createElement('button');row.type='button';row.className='scb-tree-row';row.style.cssText=`--depth:${depth};${dnaStyle(child.path)}`;row.dataset.path=child.path;row.dataset.type=child.type;if(child.path===activePath)row.classList.add('active');
   if(child.type==='tree'){const open=filter||openedFolders.has(child.path);row.setAttribute('aria-expanded',String(Boolean(open)));row.innerHTML=`<span class="scb-caret">${open?'▾':'▸'}</span><span class="scb-folder-icon">◆</span><span class="scb-name">${esc(child.name)}</span>`;row.onclick=()=>{openedFolders.has(child.path)?openedFolders.delete(child.path):openedFolders.add(child.path);saveFolders();renderExplorer()};host.appendChild(row);if(open)render(child,depth+1)}
   else{const draft=drafts[child.path];row.classList.toggle('dirty',Boolean(draft?.dirty));row.classList.toggle('saved',Boolean(draft?.saved));row.innerHTML=`<span class="scb-caret"></span><span class="scb-file-icon">${esc(fileGlyph(child.path))}</span><span class="scb-name">${esc(child.name)}</span>${draft?.created?'<span class="scb-tree-badge">NEW</span>':draft?.dirty?'<span class="scb-tree-dot" title="Unsaved draft">●</span>':draft?.saved?'<span class="scb-tree-dot saved" title="Saved to workspace">●</span>':''}`;row.onclick=()=>void openFile(child.path);host.appendChild(row)}
 }};render(treeRoot);if(!host.children.length)host.innerHTML='<div class="scb-empty">No visible source matches.</div>';
}
function renderTabs(){
 const host=qs('#scbTabs');if(!host)return;host.innerHTML='';
 for(const path of openTabs){
   const draft=drafts[path],tab=document.createElement('div');tab.className='scb-tab'+(path===activePath?' active':'')+(draft?.dirty?' dirty':draft?.saved?' saved':'');tab.dataset.path=path;tab.style.cssText=dnaStyle(path);
   tab.innerHTML=`<span class="scb-tab-glyph">${esc(fileGlyph(path))}</span><button type="button" class="scb-tab-open" title="${esc(path)}">${esc(basename(path))}</button>${draft?.dirty?'<span class="scb-tab-state">●</span>':draft?.saved?'<span class="scb-tab-state saved">●</span>':''}<button type="button" class="scb-tab-close" aria-label="Close ${esc(basename(path))}">×</button>`;
   qs('.scb-tab-open',tab).onclick=()=>void openFile(path,{preserveTabs:true});qs('.scb-tab-close',tab).onclick=e=>{e.stopPropagation();closeTab(path)};host.appendChild(tab)
 }
 if(!openTabs.length)host.innerHTML='<div class="scb-tab-placeholder">Open a file from Explorer</div>';
}
function closeTab(path){
 const i=openTabs.indexOf(path);if(i<0)return;openTabs.splice(i,1);
 if(activePath===path){activePath=openTabs[Math.min(i,openTabs.length-1)]||'';if(activePath)void openFile(activePath,{preserveTabs:true});else{currentContent='';currentFile=null;renderCodeView('Select a source file from Explorer.','');qs('#scbBreadcrumb').textContent='No file selected';setInspector(null,'No file open');setEditorMode(false)}}
 saveState();renderTabs();renderExplorer();
}
function displayLocalFile(item,draft,stateText){
 currentFile={...item,size:byteLength(draft.content),created:Boolean(draft.created)};currentContent=String(draft.content??'');qs('#scbBreadcrumb').textContent=item.path;renderCodeView(currentContent,item.path);setEditorMode(false);setInspector(currentFile,stateText);setStatus(`${item.path} · local ${draft.created?'new file':'workspace draft'} · ${formatBytes(byteLength(currentContent))}`,draft.dirty?'warn':'ok');updateDirtyIndicator();
}
async function openFile(path,{preserveTabs=false}={}){
 const safe=normalizePath(path);if(!safe||blockedPath(safe)){setStatus('Blocked by Codebase source policy','bad');return}
 const item=treeItems.find(x=>x.path===safe&&x.type==='blob');if(!item){setStatus('File is not in the current Codebase tree','bad');return}
 if(binaryPath(safe)){setInspector(item,'Binary file hidden');setStatus('Binary files are not displayed','warn');return}
 if(Number(item.size)>MAX_FILE_BYTES&&!drafts[safe]){setInspector(item,'File exceeds editor limit');setStatus(`Editor limit is ${formatBytes(MAX_FILE_BYTES)}`,'warn');return}
 activePath=safe;if(!openTabs.includes(safe))openTabs.push(safe);if(openTabs.length>24)openTabs=openTabs.slice(-24);saveState();renderTabs();renderExplorer();setInspector(item,'Loading source…');setStatus(`Loading ${safe}`);sourceAbort?.abort();sourceAbort=new AbortController();
 const draft=drafts[safe];if(draft&&(draft.created||typeof draft.content==='string')){displayLocalFile(item,draft,draft.dirty?'Local unsaved draft':draft.saved?'Saved in coding workspace':'Local draft');return}
 try{
   const file=await apiFetch(`/api/it-solutions/codebase/file?path=${encodeURIComponent(safe)}`,{signal:sourceAbort.signal});if(Number(file.size)>MAX_FILE_BYTES)throw new Error(`Editor limit is ${formatBytes(MAX_FILE_BYTES)}.`);
   if(activePath!==safe)return;currentContent=String(file.content??'');currentFile={...item,sha:file.sha||item.sha,size:file.size??item.size};qs('#scbBreadcrumb').textContent=safe;renderCodeView(currentContent,safe);setEditorMode(false);setInspector(currentFile,'Live editor · release source loaded');setStatus(`${safe} · ${formatBytes(file.size)} · ${languageName(safe)}`,'ok');updateDirtyIndicator();
 }catch(error){if(error?.name==='AbortError')return;if(activePath!==safe)return;currentContent='';renderCodeView(`Unable to display ${safe}\n\n${error?.message||error}`,safe);setInspector(item,'Source unavailable');setStatus(error?.message||'Source unavailable','bad')}
}
async function refreshTree(){
 setStatus('Refreshing release source…');const tree=qs('#scbTree');if(tree)tree.innerHTML='<div class="scb-empty">Loading repository tree…</div>';
 try{
   const snapshot=await apiFetch('/api/it-solutions/codebase/tree');currentCommitSha=snapshot?.commitSha||'';
   const fetched=(Array.isArray(snapshot?.entries)?snapshot.entries:[]).filter(item=>item?.path&&!blockedPath(item.path)&&(item.type==='tree'||item.type==='blob')&&!binaryPath(item.path));
   const synthetic=Object.values(drafts).filter(d=>d?.created&&normalizePath(d.path)&&!fetched.some(x=>x.path===d.path)).map(d=>({path:d.path,type:'blob',size:byteLength(d.content),sha:'',created:true}));
   treeItems=[...fetched,...synthetic];treeRoot=buildTree(treeItems);
   const meta=qs('#scbBranchMeta');if(meta)meta.textContent=`${BRANCH} · ${currentCommitSha.slice(0,8)}`;
   renderExplorer();setStatus(`${treeItems.length} safe source entries · ${currentCommitSha.slice(0,8)} · workspace editing enabled`,'ok');
   if(activePath&&treeItems.some(x=>x.path===activePath&&x.type==='blob'))void openFile(activePath,{preserveTabs:true});
 }catch(error){treeItems=[];treeRoot=null;if(tree)tree.innerHTML=`<div class="scb-empty scb-error">${esc(error?.message||'Repository tree unavailable')}</div>`;setStatus(error?.message||'Repository tree unavailable','bad')}
}

function startNewFile(){
 const bar=qs('#scbNewFileBar');if(!bar)return;bar.hidden=false;const input=qs('#scbNewFilePath');if(input){input.value='';setTimeout(()=>input.focus(),0)}
}
function cancelNewFile(){const bar=qs('#scbNewFileBar');if(bar)bar.hidden=true}
function createNewFile(){
 const input=qs('#scbNewFilePath'),safe=normalizePath(input?.value);
 if(!safe||blockedPath(safe)||binaryPath(safe)){setStatus('Choose a safe source path (secrets, .env, binaries, and private keys are blocked).','bad');return}
 if(treeItems.some(x=>x.path===safe)){setStatus(`${safe} already exists`,'warn');return}
 const item={path:safe,type:'blob',size:0,sha:'',created:true};treeItems.push(item);treeRoot=buildTree(treeItems);rememberDraft(safe,'',{created:true,dirty:true,saved:false,baseSha:''});openedFolders.add(dirname(safe));saveFolders();cancelNewFile();renderExplorer();void openFile(safe);setTimeout(()=>{setEditorMode(true,{focus:true});updateDirtyIndicator()},0);
}
function onEditorInput(){
 if(!activePath)return;currentContent=String(qs('#scbEditorInput')?.value??'');const bytes=byteLength(currentContent);rememberDraft(activePath,currentContent,{created:Boolean(drafts[activePath]?.created),baseSha:currentFile?.sha||drafts[activePath]?.baseSha||'',dirty:true,saved:false});if(currentFile)currentFile.size=bytes;setInspector(currentFile,'Editing workspace draft');setStatus(`${activePath} · ${formatBytes(bytes)} · unsaved draft`,'warn');updateDirtyIndicator();renderExplorer();
}

function bytesToBase64(value){
 const bytes=new TextEncoder().encode(String(value??''));let binary='';const chunk=0x8000;
 for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
 return btoa(binary);
}
function getTerminalIds(){return qsa('#itwsRtTabs [data-terminal-id]').map(n=>n.dataset.terminalId).filter(Boolean)}
function activeTerminalId(){return qs('#itwsRtTabs [data-terminal-id].active')?.dataset.terminalId||getTerminalIds()[0]||''}
async function waitFor(test,{timeout=5000,step=70}={}){
 const started=Date.now();while(Date.now()-started<timeout){const value=test();if(value)return value;await sleep(step)}return null;
}
function rememberHome(node,key='terminal'){
 if(!node)return null;if(key==='terminal'&&terminalHome)return terminalHome;if(dockHomes.has(node))return dockHomes.get(node);
 const home={node,parent:node.parentNode,next:node.nextSibling};
 if(key==='terminal')terminalHome=home;else dockHomes.set(node,home);return home;
}
function restoreHome(home){
 if(!home?.node||!home.parent)return;const {node,parent,next}=home;
 try{parent.insertBefore(node,next&&next.parentNode===parent?next:null)}catch{try{parent.appendChild(node)}catch{}}
}
async function ensureTerminalCount(count=1){
 try{
   const open=window.SulandraDockableWorkspace?.openTerminal;
   if(typeof open==='function')await Promise.resolve(open.call(window.SulandraDockableWorkspace));
   else window.SulandraDockableWorkspace?.show?.('terminal');
 }catch{}
 await waitFor(()=>document.getElementById('itwsRealTerminal'),{timeout:5000});
 let guard=0;
 while(getTerminalIds().length<count&&guard++<8){
   const add=qs('#itwsRtNewTab');if(!add){await sleep(120);continue}
   const before=getTerminalIds().length;add.click();await waitFor(()=>getTerminalIds().length>before,{timeout:4500,step:90});
 }
 return getTerminalIds().length>=count;
}
function rehomeTerminal(){
 const root=document.getElementById('itwsRealTerminal'),mount=qs('#scbTerminalMount');if(!root||!mount)return false;
 rememberHome(root,'terminal');if(root.parentNode!==mount)mount.appendChild(root);root.classList.add('scb-terminal-integrated');root.hidden=false;return true;
}
function restoreTerminal(){
 const root=terminalHome?.node;if(root)root.classList.remove('scb-terminal-integrated');restoreHome(terminalHome);terminalHome=null;
}
function visibleSessionIds(count=terminalLayout){
 const ids=getTerminalIds(),active=activeTerminalId();return [...new Set([active,...ids].filter(Boolean))].slice(0,count);
}
function installTerminalPaneActivation(host){
 if(termPaneHandlerInstalled||!host)return;termPaneHandlerInstalled=true;
 host.addEventListener('pointerdown',event=>{
   const pane=event.target instanceof Element?event.target.closest('.itws-xterm-pane.scb-split-visible'):null;if(!pane)return;
   const id=pane.dataset?.sessionId||pane.getAttribute('data-session-id')||pane.id?.replace(/^itwsXtermPane-/,'');
   if(!id)return;const tab=qsa('#itwsRtTabs [data-terminal-id]').find(n=>n.dataset.terminalId===id);tab?.click();
 },true);
}
function paneSessionId(pane){
 return pane?.dataset?.sessionId||pane?.getAttribute?.('data-session-id')||String(pane?.id||'').replace(/^itwsXtermPane-/,'');
}
async function fitVisibleTerminals(){
 const ids=visibleSessionIds(),before=activeTerminalId();
 for(const id of ids){const tab=qsa('#itwsRtTabs [data-terminal-id]').find(n=>n.dataset.terminalId===id);if(tab){tab.click();await sleep(55)}}
 const restore=qsa('#itwsRtTabs [data-terminal-id]').find(n=>n.dataset.terminalId===before);restore?.click();
}
function installTerminalDividers(host,count){
 qsa('.scb-term-divider',host).forEach(n=>n.remove());
 const drag=(axis,event)=>{
   event.preventDefault();const rect=host.getBoundingClientRect();const move=e=>{
     if(axis==='x'){const pct=Math.max(28,Math.min(72,((e.clientX-rect.left)/rect.width)*100));host.style.setProperty('--scb-term-col',`${pct}%`)}
     else{const pct=Math.max(28,Math.min(72,((e.clientY-rect.top)/rect.height)*100));host.style.setProperty('--scb-term-row',`${pct}%`)}
   };const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);void fitVisibleTerminals()};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 };
 if(count>=2){const v=document.createElement('div');v.className='scb-term-divider scb-term-divider-v';v.onpointerdown=e=>drag('x',e);host.appendChild(v)}
 if(count>=3){const h=document.createElement('div');h.className='scb-term-divider scb-term-divider-h';h.onpointerdown=e=>drag('y',e);host.appendChild(h)}
}
function applyTerminalLayout(count=terminalLayout){
 terminalLayout=[1,2,3,4].includes(Number(count))?Number(count):1;saveState();const host=qs('#itwsXtermHost');if(!host)return;
 const ids=visibleSessionIds(terminalLayout),panes=qsa('.itws-xterm-pane',host);host.dataset.scbLayout=String(terminalLayout);
 panes.forEach(pane=>{const id=paneSessionId(pane),index=ids.indexOf(id);pane.classList.toggle('scb-split-visible',index>=0);if(index>=0)pane.dataset.scbSlot=String(index+1);else delete pane.dataset.scbSlot});
 installTerminalPaneActivation(host);installTerminalDividers(host,terminalLayout);
 qsa('[data-terminal-layout]',shell).forEach(b=>b.classList.toggle('active',Number(b.dataset.terminalLayout)===terminalLayout));updateInspectorRuntime();
 void fitVisibleTerminals();
}
async function openIntegratedTerminal({layout=terminalLayout}={}){
 terminalOpen=true;terminalLayout=[1,2,3,4].includes(Number(layout))?Number(layout):terminalLayout;saveState();shell?.classList.add('scb-terminal-open');
 const ok=await ensureTerminalCount(terminalLayout);if(!ok){setStatus('Unable to start enough terminal sessions for this layout','bad');return false}
 if(!rehomeTerminal()){setStatus('Terminal runtime is not available in Codebase','bad');return false}
 applyTerminalLayout(terminalLayout);setStatus(`${terminalLayout} terminal pane${terminalLayout===1?'':'s'} active inside Codebase`,'ok');return true;
}
function closeIntegratedTerminal({restore=true}={}){
 terminalOpen=false;saveState();shell?.classList.remove('scb-terminal-open');if(restore)restoreTerminal();updateInspectorRuntime();
}
async function setTerminalLayout(count){await openIntegratedTerminal({layout:Number(count)})}
async function runWorkspaceCommand(command,{show=true}={}){
 if(show)await openIntegratedTerminal({layout:terminalLayout});else await ensureTerminalCount(1);
 const bridge=window.__SULANDRA_TERMINAL_REST_BRIDGE__,id=activeTerminalId();
 if(!bridge?.sendInput||!id)throw new Error('Integrated terminal bridge is not ready');
 await bridge.sendInput(id,String(command)+'\r');updateInspectorRuntime();return id;
}
async function saveCurrentToWorkspace(){
 if(!activePath)return;const content=currentEditorText(),bytes=byteLength(content);
 if(bytes>MAX_FILE_BYTES){setStatus(`Editor limit is ${formatBytes(MAX_FILE_BYTES)}`,'bad');return}
 currentContent=content;rememberDraft(activePath,content,{created:Boolean(drafts[activePath]?.created),baseSha:currentFile?.sha||drafts[activePath]?.baseSha||'',dirty:true,saved:false});
 const b64=bytesToBase64(content),dir=dirname(activePath);
 const write=`${dir?`mkdir -p -- ${shellQuote(dir)} && `:''}printf '%s' ${shellQuote(b64)} | base64 -d > ${shellQuote(activePath)} && printf '\\n[Codebase] saved ${activePath}\\n' && git status --short -- ${shellQuote(activePath)}`;
 try{
   const id=await runWorkspaceCommand(write,{show:true});rememberDraft(activePath,content,{created:Boolean(drafts[activePath]?.created),baseSha:currentFile?.sha||drafts[activePath]?.baseSha||'',dirty:false,saved:true,lastTerminal:id});
   if(currentFile)currentFile.size=bytes;renderCodeView(content,activePath);setEditorMode(false);setInspector(currentFile,'Saved to isolated coding workspace');setStatus(`${activePath} · save command accepted by Terminal ${Math.max(1,getTerminalIds().indexOf(id)+1)}`,'ok');updateDirtyIndicator();renderExplorer();
 }catch(error){setStatus(error?.message||'Unable to save to coding workspace','bad')}
}
function showCommitBar(){
 const bar=qs('#scbCommitBar');if(!bar)return;bar.hidden=false;const input=qs('#scbCommitMessage');if(input&&!input.value)input.value=activePath?`Codebase: update ${basename(activePath)}`:'Codebase workspace update';setTimeout(()=>input?.focus(),0);
}
function hideCommitBar(){const bar=qs('#scbCommitBar');if(bar)bar.hidden=true}
async function commitWorkspace(){
 const message=String(qs('#scbCommitMessage')?.value||'').trim();if(!message){setStatus('Enter a commit message','warn');return}
 const pendingDirty=Object.entries(drafts).filter(([,d])=>d?.dirty);if(pendingDirty.length){setStatus(`Save ${pendingDirty.length} unsaved draft${pendingDirty.length===1?'':'s'} before committing`,'warn');return}
 const paths=Object.entries(drafts).filter(([,d])=>d?.saved).map(([p])=>p).filter(p=>normalizePath(p)&&!blockedPath(p));
 if(!paths.length){setStatus('No workspace-saved Codebase changes to commit','warn');return}
 const cmd=`git add -- ${paths.map(shellQuote).join(' ')} && git commit -m ${shellQuote(message)} && printf '\\n[Codebase] commit complete\\n' && git status --short`;
 try{
   const id=await runWorkspaceCommand(cmd,{show:true});hideCommitBar();paths.forEach(p=>{if(drafts[p])drafts[p].commitPending=true});saveDrafts();setStatus(`Commit command sent for ${paths.length} file${paths.length===1?'':'s'} · monitor Terminal ${Math.max(1,getTerminalIds().indexOf(id)+1)}`,'ok');setInspector(currentFile,'Commit running in isolated coding workspace');
 }catch(error){setStatus(error?.message||'Unable to commit workspace changes','bad')}
}

function restoreDockPanels(){
 for(const [node,home] of [...dockHomes.entries()]){node.classList.remove('scb-embedded-workspace-panel');restoreHome(home);dockHomes.delete(node)}
 const mount=qs('#scbDockMount');if(mount)mount.innerHTML='';
}
async function embedWorkspacePanel(mode){
 const api=window.SulandraDockableWorkspace;if(!api)throw new Error('Sulandra workspace dock is not ready');
 const opener=mode==='ide'?api.openIde:api.openPreview;if(typeof opener!=='function')throw new Error(`${mode.toUpperCase()} workspace is unavailable`);
 await Promise.resolve(opener.call(api));const panel=await waitFor(()=>api.getPanel?.(mode),{timeout:6500,step:100});if(!panel)throw new Error(`${mode.toUpperCase()} panel did not initialize`);
 restoreDockPanels();rememberHome(panel,'dock');const mount=qs('#scbDockMount');mount?.appendChild(panel);panel.classList.add('scb-embedded-workspace-panel');panel.hidden=false;return panel;
}
function renderInspectorDock(){
 const mount=qs('#scbDockMount');if(!mount)return;restoreDockPanels();mount.innerHTML=`<div class="scb-inspector-body">
   <dl>
    <dt>Path</dt><dd id="scbInspectorPath">—</dd>
    <dt>Type</dt><dd id="scbInspectorKind">—</dd>
    <dt>Language</dt><dd id="scbInspectorLang">—</dd>
    <dt>Size</dt><dd id="scbInspectorSize">—</dd>
    <dt>Blob</dt><dd id="scbInspectorSha">—</dd>
    <dt>Mode</dt><dd id="scbInspectorState">No file open</dd>
    <dt>Workspace</dt><dd id="scbInspectorWorkspace">Starts on first edit/terminal action</dd>
    <dt>Git</dt><dd id="scbInspectorGit">workbench</dd>
    <dt>Editing</dt><dd id="scbInspectorEditing">Inline workspace editor + embedded Sulandra IDE</dd>
    <dt>Execution</dt><dd id="scbInspectorExecution">Integrated terminal</dd>
   </dl>
   <div class="scb-policy"><strong>Source policy</strong><p>Authentication and source restrictions stay enforced by the Sulandra API. Secrets, credentials, .env files, private keys, binaries, oversized files, .git, and node_modules remain excluded.</p></div>
 </div>`;setInspector(currentFile,currentFile?(drafts[activePath]?.dirty?'Editing workspace draft':drafts[activePath]?.saved?'Saved to isolated coding workspace':'Live editor · release source loaded'):'No file open');
}
async function activateDock(mode,{toggle=true}={}){
 if(!['inspector','preview','ide'].includes(mode))return;
 if(toggle&&dockOpen&&dockMode===mode){dockOpen=false;shell?.classList.add('scb-dock-closed');restoreDockPanels();qsa('.scb-dock-tab',shell).forEach(b=>b.classList.remove('active'));saveState();return}
 dockMode=mode;dockOpen=true;shell?.classList.remove('scb-dock-closed');qsa('.scb-dock-tab',shell).forEach(b=>b.classList.toggle('active',b.dataset.dock===mode));saveState();
 const label=qs('#scbDockLabel');if(label)label.textContent=mode.toUpperCase();
 try{if(mode==='inspector')renderInspectorDock();else{restoreDockPanels();const mount=qs('#scbDockMount');if(mount)mount.innerHTML='<div class="scb-empty scb-dock-loading">Opening workspace…</div>';await embedWorkspacePanel(mode);setStatus(`${mode.toUpperCase()} opened inside Codebase`,'ok')}}
 catch(error){renderInspectorDock();dockMode='inspector';qsa('.scb-dock-tab',shell).forEach(b=>b.classList.toggle('active',b.dataset.dock==='inspector'));setStatus(error?.message||`Unable to open ${mode}`,'bad')}
}

function loadLayout(){
 try{const v=JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}'),left=Number(v.left),right=Number(v.right),terminal=Number(v.terminal);if(left>=210&&left<=620)shell.style.setProperty('--scb-left',`${left}px`);if(right>=260&&right<=760)shell.style.setProperty('--scb-right',`${right}px`);if(terminal>=180&&terminal<=700)shell.style.setProperty('--scb-terminal-height',`${terminal}px`)}catch{}
}
function saveLayout(){
 try{localStorage.setItem(LAYOUT_KEY,JSON.stringify({version:2,left:parseFloat(getComputedStyle(shell).getPropertyValue('--scb-left'))||290,right:parseFloat(getComputedStyle(shell).getPropertyValue('--scb-right'))||340,terminal:parseFloat(getComputedStyle(shell).getPropertyValue('--scb-terminal-height'))||330}))}catch{}
}
function bindSplitters(){
 qsa('.scb-splitter',shell).forEach(split=>split.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;event.preventDefault();split.setPointerCapture?.(event.pointerId);const start=event.clientX,style=getComputedStyle(shell),left0=parseFloat(style.getPropertyValue('--scb-left'))||290,right0=parseFloat(style.getPropertyValue('--scb-right'))||340,side=split.dataset.side;
   const move=e=>{const dx=e.clientX-start;if(side==='left')shell.style.setProperty('--scb-left',`${Math.max(210,Math.min(620,left0+dx))}px`);else shell.style.setProperty('--scb-right',`${Math.max(260,Math.min(760,right0-dx))}px`)};
   const up=()=>{split.removeEventListener('pointermove',move);split.removeEventListener('pointerup',up);split.removeEventListener('pointercancel',up);saveLayout();void fitVisibleTerminals()};split.addEventListener('pointermove',move);split.addEventListener('pointerup',up);split.addEventListener('pointercancel',up)
 }));
 const h=qs('#scbTerminalResize');h?.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;event.preventDefault();const rect=qs('.scb-editor')?.getBoundingClientRect(),start=event.clientY,base=parseFloat(getComputedStyle(shell).getPropertyValue('--scb-terminal-height'))||330;
   const move=e=>{const max=Math.max(220,(rect?.height||800)-180),value=Math.max(180,Math.min(max,base+(start-e.clientY)));shell.style.setProperty('--scb-terminal-height',`${value}px`)};
   const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);saveLayout();void fitVisibleTerminals()};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)
 });
}

function ensureShell(){
 if(shell)return shell;
 shell=document.createElement('section');shell.id='sulandraCodebase';shell.className='scb-shell';shell.hidden=true;shell.setAttribute('aria-label','Sulandra Codebase');
 shell.innerHTML=`
  <header class="scb-topbar">
   <div class="scb-brand"><span class="scb-mark">SC</span><div><strong>Sulandra Codebase</strong><small id="scbBranchMeta">${BRANCH}</small></div></div>
   <div class="scb-top-actions">
    <button type="button" id="scbRefresh" title="Refresh repository source">↻ <span>Refresh</span></button>
    <button type="button" id="scbOpenIde" title="Open IDE inside Codebase">⌘ <span>IDE</span></button>
    <button type="button" id="scbOpenTerminal" title="Toggle integrated terminal">⌁ <span>Terminal</span></button>
    <button type="button" id="scbFullscreen"><span>Full Screen</span></button>
    <button type="button" id="scbExit" class="danger">Exit Codebase</button>
   </div>
  </header>
  <div class="scb-workspace">
   <aside class="scb-explorer">
    <div class="scb-pane-head"><div><strong>EXPLORER</strong><span>workspace-aware source</span></div><button id="scbNewFile" class="scb-icon-button" type="button" title="Create new file">＋</button></div>
    <div id="scbNewFileBar" class="scb-new-file" hidden><input id="scbNewFilePath" autocomplete="off" spellcheck="false" placeholder="src/new-file.ts"><div><button id="scbCreateFile" type="button">Create</button><button id="scbCancelFile" type="button">Cancel</button></div></div>
    <div class="scb-search"><span>⌕</span><input id="scbFilter" type="search" autocomplete="off" placeholder="Filter files (⌘/Ctrl+P)"></div>
    <div id="scbTree" class="scb-tree"><div class="scb-empty">Open Codebase to load the repository.</div></div>
   </aside>
   <div class="scb-splitter" data-side="left" role="separator" aria-label="Resize Explorer"></div>
   <main class="scb-editor">
    <div id="scbTabs" class="scb-tabs"><div class="scb-tab-placeholder">Open a file from Explorer</div></div>
    <div class="scb-editor-toolbar">
     <div class="scb-breadcrumb-wrap"><span class="scb-breadcrumb" id="scbBreadcrumb">No file selected</span><span id="scbDirty" class="scb-dirty" hidden></span></div>
     <div class="scb-editor-actions"><button id="scbEdit" type="button" disabled>Edit</button><button id="scbSave" type="button" disabled>Save</button><button id="scbCommit" type="button">Commit</button></div>
    </div>
    <div id="scbCommitBar" class="scb-commit-bar" hidden><span>Commit message</span><input id="scbCommitMessage" autocomplete="off" maxlength="180"><button id="scbCommitNow" type="button">Commit workspace</button><button id="scbCommitCancel" type="button">×</button></div>
    <div class="scb-editor-stack">
     <div class="scb-source-wrap">
      <pre class="scb-source" id="scbSourceView"><code id="scbCode">Select a source file from Explorer.</code></pre>
      <textarea id="scbEditorInput" class="scb-editor-input" autocomplete="off" autocapitalize="off" spellcheck="false" hidden></textarea>
     </div>
     <div id="scbTerminalResize" class="scb-terminal-resize" role="separator" aria-label="Resize integrated terminal"><span></span></div>
     <section class="scb-terminal-deck" aria-label="Integrated terminals">
      <div class="scb-terminal-head"><div><strong>TERMINAL</strong><span>isolated coding workspace · live sessions</span></div>
       <div class="scb-layout-tools" aria-label="Terminal layouts">
        <button type="button" data-terminal-layout="1" title="One terminal"><span class="layout-one"></span></button>
        <button type="button" data-terminal-layout="2" title="Split into 2"><span class="layout-two"></span></button>
        <button type="button" data-terminal-layout="3" title="Split into 3"><span class="layout-three"></span></button>
        <button type="button" data-terminal-layout="4" title="Split into 4"><span class="layout-four"></span></button>
        <button type="button" id="scbCloseTerminal" title="Close terminal deck">×</button>
       </div>
      </div>
      <div id="scbTerminalMount" class="scb-terminal-mount"><div class="scb-empty">Terminal starts here — never leaves Codebase.</div></div>
     </section>
    </div>
   </main>
   <div class="scb-splitter scb-right-splitter" data-side="right" role="separator" aria-label="Resize side dock"></div>
   <aside class="scb-right-dock">
    <div class="scb-dock-tabs"><button type="button" class="scb-dock-tab active" data-dock="inspector">INSPECTOR</button><button type="button" class="scb-dock-tab" data-dock="preview">PREVIEW</button><button type="button" class="scb-dock-tab" data-dock="ide">IDE</button></div>
    <div class="scb-dock-subhead"><span id="scbDockLabel">INSPECTOR</span><small>click active tab again to close</small></div>
    <div id="scbDockMount" class="scb-dock-mount"></div>
   </aside>
  </div>
  <footer class="scb-statusbar"><span id="scbStatus">Ready</span><span><b>LIVE WORKSPACE</b> · inline edit · integrated IDE/preview · 1–4 terminals</span></footer>`;
 document.body.appendChild(shell);readState();readFolders();readDrafts();loadLayout();bindSplitters();renderTabs();renderInspectorDock();
 qs('#scbRefresh').onclick=()=>void refreshTree();
 qs('#scbOpenIde').onclick=()=>void activateDock('ide',{toggle:false});
 qs('#scbOpenTerminal').onclick=()=>{terminalOpen?closeIntegratedTerminal():void openIntegratedTerminal()};
 qs('#scbFullscreen').onclick=()=>requestFullscreen();
 qs('#scbExit').onclick=()=>closeCodebase();
 qs('#scbFilter').addEventListener('input',renderExplorer);
 qs('#scbNewFile').onclick=startNewFile;qs('#scbCancelFile').onclick=cancelNewFile;qs('#scbCreateFile').onclick=createNewFile;qs('#scbNewFilePath').addEventListener('keydown',e=>{if(e.key==='Enter')createNewFile();else if(e.key==='Escape')cancelNewFile()});
 qs('#scbEdit').onclick=()=>{if(!activePath)return;if(editMode){currentContent=currentEditorText();renderCodeView(currentContent,activePath);setEditorMode(false)}else setEditorMode(true,{focus:true})};
 qs('#scbSave').onclick=()=>void saveCurrentToWorkspace();qs('#scbEditorInput').addEventListener('input',onEditorInput);
 qs('#scbCommit').onclick=showCommitBar;qs('#scbCommitCancel').onclick=hideCommitBar;qs('#scbCommitNow').onclick=()=>void commitWorkspace();qs('#scbCommitMessage').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void commitWorkspace()}else if(e.key==='Escape')hideCommitBar()});
 qs('#scbCloseTerminal').onclick=()=>closeIntegratedTerminal();qsa('[data-terminal-layout]',shell).forEach(b=>b.onclick=()=>void setTerminalLayout(Number(b.dataset.terminalLayout)));
 qsa('.scb-dock-tab',shell).forEach(b=>b.onclick=()=>void activateDock(b.dataset.dock));
 document.addEventListener('keydown',event=>{
   if(shell.hidden)return;
   if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='p'){event.preventDefault();qs('#scbFilter')?.focus()}
   else if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void saveCurrentToWorkspace()}
   else if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='w'&&activePath){event.preventDefault();closeTab(activePath)}
   else if((event.metaKey||event.ctrlKey)&&event.key==='`'){event.preventDefault();terminalOpen?closeIntegratedTerminal():void openIntegratedTerminal()}
 });
 return shell;
}
function requestFullscreen(){if(document.fullscreenElement){updateFullscreenUi();return}ownsFullscreen=true;const p=document.documentElement.requestFullscreen?.();if(p?.catch)p.catch(()=>{ownsFullscreen=false;updateFullscreenUi()})}
function updateFullscreenUi(){const b=qs('#scbFullscreen');if(!b)return;const on=Boolean(document.fullscreenElement);b.hidden=on;b.textContent='Full Screen'}
function closeCodebase({keepFullscreen=false}={}){
 if(!shell)return;shell.hidden=true;document.body.classList.remove('scb-open');sourceAbort?.abort();restoreDockPanels();restoreTerminal();shell.classList.remove('scb-terminal-open');
 if(!keepFullscreen&&ownsFullscreen&&document.fullscreenElement){const p=document.exitFullscreen?.();if(p?.catch)p.catch(()=>{})}if(!keepFullscreen)ownsFullscreen=false;
}
function openCodebaseFromGesture(){
 ensureShell();if(!document.fullscreenElement)requestFullscreen();shell.hidden=false;document.body.classList.add('scb-open');updateFullscreenUi();
 shell.classList.toggle('scb-dock-closed',!dockOpen);qsa('.scb-dock-tab',shell).forEach(b=>b.classList.toggle('active',dockOpen&&b.dataset.dock===dockMode));
 if(dockOpen)void activateDock(dockMode,{toggle:false});
 if(!treeItems.length)void refreshTree();else{renderExplorer();renderTabs();if(activePath)void openFile(activePath,{preserveTabs:true})}
 if(terminalOpen)void openIntegratedTerminal({layout:terminalLayout});
}
function installEntry(){
 const ideButton=document.getElementById('itwsWorkspaceIdeButton');if(!ideButton?.parentElement)return false;if(document.getElementById('itwsSulandraCodebaseButton'))return true;
 const btn=document.createElement('button');btn.type='button';btn.id='itwsSulandraCodebaseButton';btn.className=ideButton.className||'itws-workspace-tool';btn.textContent='Codebase';btn.title='Open Sulandra Codebase';btn.onclick=openCodebaseFromGesture;ideButton.parentElement.appendChild(btn);ensureShell();return true;
}
function boot(){if(installEntry())return;const observer=new MutationObserver(()=>{if(installEntry())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),30000)}
document.addEventListener('fullscreenchange',()=>{updateFullscreenUi();if(!document.fullscreenElement)ownsFullscreen=false});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.SulandraCodebase={open:openCodebaseFromGesture,close:closeCodebase,refresh:refreshTree,isBlockedPath:blockedPath,normalizePath,openTerminal:openIntegratedTerminal,openDock:mode=>activateDock(mode,{toggle:false})};
})();
