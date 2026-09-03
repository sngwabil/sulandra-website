/* SULANDRA_CODEBASE_NATIVE_GRID_V3
 * Codebase owns its tab/grid UX. Engineering Workspace remains a sibling product;
 * only its isolated terminal session backend is reused.
 */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_NATIVE_GRID_V3__)return;
window.__SULANDRA_CODEBASE_NATIVE_GRID_V3__=true;
const KEY='sulandra:codebase:native-grid-v3';
const PALETTE=['#67e8f9','#a78bfa','#86efac','#f9a8d4','#fde68a','#fb923c','#60a5fa','#c4b5fd','#5eead4','#fda4af'];
let shell=null,gridCount=1,order=[],cache=new Map(),renderQueued=false,observer=null;
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const basename=p=>String(p||'').split('/').pop()||p;
const colorFor=id=>{let h=2166136261;for(const c of String(id)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return PALETTE[(h>>>0)%PALETTE.length]};
const soft=color=>`color-mix(in srgb,${color} 12%,transparent)`;
const fileId=path=>`file:${path}`,termId=id=>`terminal:${id}`;
const parseId=id=>{const i=String(id).indexOf(':');return {type:String(id).slice(0,i),value:String(id).slice(i+1)}};
const state=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({version:3,gridCount,order}))}catch{}};
function load(){const s=state();gridCount=[1,2,3,4].includes(Number(s.gridCount))?Number(s.gridCount):1;order=Array.isArray(s.order)?s.order.filter(x=>typeof x==='string').slice(0,40):[]}
function originalFileTabs(){return qa('#scbTabs .scb-tab[data-path]').map(n=>({id:fileId(n.dataset.path),path:n.dataset.path,node:n}))}
function terminalIds(){return qa('#itwsRtTabs [data-terminal-id]').map(n=>n.dataset.terminalId).filter(Boolean)}
function syncOrder(){
 const present=[...originalFileTabs().map(x=>x.id),...terminalIds().map(termId)];
 order=order.filter(id=>present.includes(id));for(const id of present)if(!order.includes(id))order.push(id);save();
}
function fileGlyph(path){const e=(path.split('.').pop()||'').toLowerCase();if(['js','mjs','cjs','jsx'].includes(e))return 'JS';if(['ts','tsx'].includes(e))return 'TS';if(['html','htm'].includes(e))return '<>';if(['css','scss'].includes(e))return '#';if(e==='json')return '{}';if(['yml','yaml'].includes(e))return 'Y';if(e==='md')return 'M';if(e==='sql')return 'DB';return '•'}
function currentPath(){return q('#scbTabs .scb-tab.active')?.dataset.path||''}
function activeTerminal(){return q('#itwsRtTabs [data-terminal-id].active')?.dataset.terminalId||''}
function currentId(){const p=currentPath();if(p)return fileId(p);const t=activeTerminal();return t?termId(t):''}
function sourceWrap(){return q('.scb-source-wrap')}
function originalFileTab(path){return q(`#scbTabs .scb-tab[data-path="${CSS.escape(path)}"]`)}
function terminalPane(id){return q(`.itws-xterm-pane[data-session-id="${CSS.escape(id)}"],#itwsXtermPane-${CSS.escape(id)}`)}
function clickOriginalFile(path){originalFileTab(path)?.querySelector('.scb-tab-open')?.click()}
function closeOriginalFile(path){originalFileTab(path)?.querySelector('.scb-tab-close')?.click()}
function clickTerminal(id){q(`#itwsRtTabs [data-terminal-id="${CSS.escape(id)}"]`)?.click()}
function closeTerminal(id){
 const tab=q(`#itwsRtTabs [data-terminal-id="${CSS.escape(id)}"]`);if(!tab)return;
 const close=tab.querySelector('.itws-rt-tab-close,.itws-terminal-tab-close,[data-close-terminal]');if(close)close.click();else tab.querySelector('button:last-child')?.click();
}
function highlight(text,path){
 const markup=/\.(html?|xml|svg)$/i.test(path);if(markup)return String(text).split(/(<\/?[A-Za-z][^>]*>|<!--[\s\S]*?-->)/g).map(t=>t.startsWith('<')?`<span class="${t.startsWith('<!--')?'com':'tag'}">${esc(t)}</span>`:esc(t)).join('');
 const words=new Set('async await break case catch class const continue default delete do else export extends finally for from function if import in instanceof let new of return static super switch throw try typeof var void while yield true false null undefined this interface type enum namespace readonly public private protected'.split(' '));
 const re=/(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b|[=+\-*\/%<>!&|?:]+)/g;let out='',i=0,m;
 while((m=re.exec(String(text)))){out+=esc(String(text).slice(i,m.index));const t=m[0];let c='';if(t.startsWith('//')||t.startsWith('/*')||t.startsWith('#'))c='com';else if(/^['"`]/.test(t))c='str';else if(/^\d/.test(t))c='num';else if(words.has(t))c='kw';else if(/^[=+\-*\/%<>!&|?:]+$/.test(t))c='op';else if(/^\w/.test(t)&&/^\s*\(/.test(String(text).slice(re.lastIndex)))c='fn';out+=c?`<span class="${c}">${esc(t)}</span>`:esc(t);i=m.index+t.length}
 return out+esc(String(text).slice(i));
}
async function fetchFile(path){
 if(cache.has(path))return cache.get(path);const p=fetch(`/api/it-solutions/codebase/file?path=${encodeURIComponent(path)}`,{credentials:'same-origin',headers:{Accept:'application/json'}}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||j.message||`Source request failed (${r.status})`);const d=j.data??j;return String(d.content??'')});cache.set(path,p);try{return await p}catch(e){cache.delete(path);throw e}
}
function ensureStructure(){
 shell=q('#sulandraCodebase');if(!shell)return false;const editor=q('.scb-editor',shell),oldTabs=q('#scbTabs',shell),toolbar=q('.scb-editor-toolbar',shell),stack=q('.scb-editor-stack',shell);if(!editor||!oldTabs||!toolbar||!stack)return false;
 if(!q('#scbNativeTabs',shell)){const tabs=document.createElement('div');tabs.id='scbNativeTabs';tabs.className='scb-native-tabs';oldTabs.before(tabs)}
 if(!q('#scbGridToolbar',shell)){const bar=document.createElement('div');bar.id='scbGridToolbar';bar.className='scb-grid-toolbar';bar.innerHTML='<span>Workspace layout</span><div class="scb-grid-buttons"><button data-grid="1" title="1 grid"><span class="scb-grid-icon"></span></button><button data-grid="2" title="2 grids"><span class="scb-grid-icon two"></span></button><button data-grid="3" title="3 grids"><span class="scb-grid-icon three"></span></button><button data-grid="4" title="4 grids"><span class="scb-grid-icon four"></span></button></div>';toolbar.before(bar);qa('[data-grid]',bar).forEach(b=>b.onclick=()=>{gridCount=Number(b.dataset.grid);save();render()})}
 if(!q('#scbNativeGrid',stack)){const grid=document.createElement('div');grid.id='scbNativeGrid';grid.className='scb-native-grid';stack.appendChild(grid)}
 return true;
}
function restoreLiveEditor(){const wrap=sourceWrap();const grid=q('#scbNativeGrid');if(wrap&&grid&&wrap.parentElement?.closest('.scb-native-pane'))grid.before(wrap)}
function stashEngineeringTerminal(){
 const real=q('#itwsRealTerminal');if(!real)return;real.classList.add('scb-native-terminal-stash');const deck=q('#scbTerminalMount');if(deck&&!deck.contains(real))deck.appendChild(real);
}
function activate(id){const x=parseId(id);if(x.type==='file')clickOriginalFile(x.value);else if(x.type==='terminal')clickTerminal(x.value);setTimeout(render,80)}
function closeId(id){const x=parseId(id);order=order.filter(v=>v!==id);save();if(x.type==='file')closeOriginalFile(x.value);else closeTerminal(x.value);setTimeout(()=>{syncOrder();render()},100)}
function installDrag(tab,id){
 tab.draggable=true;tab.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/scb-tab',id);tab.classList.add('dragging')});tab.addEventListener('dragend',()=>tab.classList.remove('dragging'));tab.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move'});tab.addEventListener('drop',e=>{e.preventDefault();const from=e.dataTransfer.getData('text/scb-tab');if(!from||from===id)return;const a=order.indexOf(from),b=order.indexOf(id);if(a<0||b<0)return;order.splice(a,1);order.splice(b,0,from);save();render()})
}
function renderTabs(){const host=q('#scbNativeTabs');if(!host)return;host.innerHTML='';const visible=new Set(order.slice(0,gridCount)),active=currentId();for(const id of order){const x=parseId(id),color=colorFor(id),button=document.createElement('div');button.className='scb-native-tab';button.style.setProperty('--tab-accent',color);button.style.setProperty('--tab-soft',soft(color));button.dataset.visible=String(visible.has(id));button.dataset.active=String(active===id);const title=x.type==='terminal'?`Terminal ${Math.max(1,terminalIds().indexOf(x.value)+1)}`:basename(x.value);button.innerHTML=`<span class="scb-native-glyph">${x.type==='terminal'?'›_':esc(fileGlyph(x.value))}</span><button class="scb-native-title" type="button" title="${esc(x.value)}">${esc(title)}</button><button class="scb-native-close" type="button" aria-label="Close ${esc(title)}">×</button>`;q('.scb-native-title',button).onclick=()=>activate(id);q('.scb-native-close',button).onclick=e=>{e.stopPropagation();closeId(id)};installDrag(button,id);host.appendChild(button)}}
async function renderFileSnapshot(body,path){body.innerHTML='<div class="scb-empty">Loading source…</div>';try{const text=await fetchFile(path);if(!body.isConnected)return;const pre=document.createElement('pre');pre.className='scb-native-snapshot';pre.innerHTML=highlight(text,path);body.replaceChildren(pre)}catch(e){body.innerHTML=`<div class="scb-empty scb-error">${esc(e?.message||'Source unavailable')}</div>`}}
function renderGrid(){
 const grid=q('#scbNativeGrid');if(!grid)return;restoreLiveEditor();grid.dataset.count=String(gridCount);grid.innerHTML='';const livePath=currentPath(),wrap=sourceWrap();
 for(let i=0;i<gridCount;i++){const id=order[i],pane=document.createElement('section');pane.className='scb-native-pane';if(!id){pane.dataset.empty='true';grid.appendChild(pane);continue}const x=parseId(id),color=colorFor(id);pane.style.setProperty('--pane-accent',color);const title=x.type==='terminal'?`Terminal ${Math.max(1,terminalIds().indexOf(x.value)+1)}`:basename(x.value);pane.innerHTML=`<div class="scb-native-pane-head"><span><b>${i+1}</b> · ${esc(title)}</span><span>${x.type==='terminal'?'isolated terminal':esc(x.value)}</span></div><div class="scb-native-pane-body"></div>`;const body=q('.scb-native-pane-body',pane);grid.appendChild(pane);
   if(x.type==='file'){if(x.value===livePath&&wrap){body.appendChild(wrap)}else void renderFileSnapshot(body,x.value)}else{const term=document.createElement('div');term.className='scb-native-terminal-body';body.appendChild(term);const tp=terminalPane(x.value);if(tp)term.appendChild(tp);else term.innerHTML='<div class="scb-empty">Starting terminal…</div>'}
 }
 requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('sulandra:workspace-layout-resized')));
}
function render(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;if(!ensureStructure())return;syncOrder();renderTabs();renderGrid();qa('[data-grid]',shell).forEach(b=>b.classList.toggle('active',Number(b.dataset.grid)===gridCount));stashEngineeringTerminal()})}
async function addTerminal(){
 const before=terminalIds();try{if(!before.length){await window.SulandraCodebase?.openTerminal?.({layout:1})}else{const add=q('#itwsRtNewTab');if(add)add.click();else await window.SulandraCodebase?.openTerminal?.({layout:1})}}catch{}
 const start=Date.now();while(Date.now()-start<5000){const ids=terminalIds();if(ids.length>before.length||(!before.length&&ids.length)){syncOrder();stashEngineeringTerminal();render();return}await new Promise(r=>setTimeout(r,80))}render()
}
function interceptTerminalButton(){const b=q('#scbOpenTerminal');if(!b||b.dataset.nativeGrid==='1')return;b.dataset.nativeGrid='1';b.title='Open a new Codebase terminal tab';b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();void addTerminal()},true)}
function watch(){observer?.disconnect();observer=new MutationObserver(m=>{if(m.some(x=>x.target?.id==='scbTabs'||x.target?.id==='itwsRtTabs'||x.target?.closest?.('#scbTabs,#itwsRtTabs')))render()});observer.observe(document.documentElement,{childList:true,subtree:true})}
function boot(){load();const tick=()=>{if(ensureStructure()){interceptTerminalButton();watch();render();return}setTimeout(tick,80)};tick()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.SulandraCodebaseNativeGrid={render,addTerminal,setGrid:n=>{gridCount=[1,2,3,4].includes(Number(n))?Number(n):1;save();render()},getOrder:()=>order.slice()};
})();
