/* CODEBASE_PREVIEW_ENVIRONMENTS_V1
 * CODEBASE_PREVIEW_ENVIRONMENTS_V2
 * Makes Codebase Preview environment-explicit: secure Local development preview
 * or the linked Railway Production service domain for the active project.
 */
(()=>{
'use strict';
if(window.__CODEBASE_PREVIEW_ENVIRONMENTS_V2__)return;
window.__CODEBASE_PREVIEW_ENVIRONMENTS_V1__=true;
window.__CODEBASE_PREVIEW_ENVIRONMENTS_V2__=true;

let mode='local';
let requestSerial=0;
let lastProject='';
let localOpenIntent=false;
const q=(selector,root=document)=>root.querySelector(selector);
const cfg=()=>{try{return typeof RAILWAY_CONFIG!=='undefined'?RAILWAY_CONFIG:null}catch{return null}};
const activeProject=()=>String(q('#codebase-project-select')?.value||'').trim();
const port=()=>String(q('#preview-port')?.value||'3000').trim()||'3000';
const gatewayBase=()=>String(cfg()?.WSS_URL||'').replace(/^wss:/i,'https:').replace(/^ws:/i,'http:').replace(/\/$/,'');
const authToken=()=>String(cfg()?.getToken?.()||'').trim();
const localTicketEndpoint=()=>String(cfg()?.PREVIEW_URL||'').trim().replace(/\/$/,'')+'/api/preview-ticket';
const productionEndpoint=project=>gatewayBase()+'/codebase/projects/'+encodeURIComponent(project)+'/railway/preview';
const status=text=>{const node=q('#status-line-col');if(node)node.textContent=String(text||'')};
const frame=()=>q('#railway-preview-iframe');
const terminalSessionId=()=>{
  try{
    const tabs=Array.isArray(openTabs)?openTabs:[];
    const tab=tabs.find(item=>item?.type==='terminal'&&item?.sessionId);
    return String(tab?.sessionId||window.__SULANDRA_CODEBASE_PREVIEW_SESSION__||'').trim();
  }catch{return String(window.__SULANDRA_CODEBASE_PREVIEW_SESSION__||'').trim()}
};
const safeHttpUrl=value=>{
  const raw=String(value||'').trim();
  if(!raw)return '';
  try{
    const url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);
    return /^https?:$/i.test(url.protocol)?url.toString():'';
  }catch{return ''}
};
const setFrameUrl=url=>{
  const iframe=frame();if(!iframe)return;
  iframe.removeAttribute('srcdoc');
  iframe.dataset.codebasePreviewState='live';
  if(iframe.src!==url)iframe.src=url;
};
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const showFrameMessage=message=>{
  const iframe=frame();if(!iframe)return;
  iframe.src='about:blank';
  iframe.dataset.codebasePreviewState='idle';
  iframe.srcdoc='<!doctype html><html><body style="margin:0;background:#071019;color:#b9cad7;font:13px system-ui;display:grid;place-items:center;height:100vh;text-align:center;padding:24px;box-sizing:border-box"><div>'+escapeHtml(message||'Preview unavailable')+'</div></body></html>';
};
const localPortState=value=>{
  const p=Number(value);
  if(!Number.isInteger(p)||p<1024||p>65535)return{ok:false,port:p,message:'Local Preview ports must be between 1024 and 65535.'};
  if([9000,13337].includes(p))return{ok:false,port:p,reserved:true,message:'Port '+p+' is reserved by Codebase internals. Use a development port such as 3000, 5173, 8080, or another free port.'};
  return{ok:true,port:p};
};

function installStyles(){
  if(q('#codebase-preview-environments-style'))return;
  const style=document.createElement('style');style.id='codebase-preview-environments-style';
  style.textContent=`
#codebase-preview-environments{position:absolute;z-index:7;top:50px;left:8px;right:8px;margin:0;padding:6px;border:1px solid rgba(255,255,255,.10);border-radius:7px;background:linear-gradient(180deg,rgba(8,14,22,.90),rgba(2,8,13,.84));backdrop-filter:blur(16px) saturate(145%);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 22px rgba(0,0,0,.24)}
#codebase-preview-switch{display:grid;grid-template-columns:minmax(0,.72fr) minmax(0,1.28fr);gap:3px;padding:3px;border:1px solid rgba(255,255,255,.10);border-radius:6px;background:rgba(0,0,0,.28)}
#codebase-preview-switch button{min-width:0;border:0;border-radius:4px;padding:6px 4px;background:transparent;color:#8195a5;font:700 9px system-ui;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#codebase-preview-switch button.active{background:rgba(255,255,255,.10);color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
#codebase-preview-env-meta{display:flex;align-items:center;gap:6px;margin-top:6px;min-width:0}
#codebase-preview-env-badge{flex:0 0 auto;padding:2px 5px;border-radius:999px;font:800 8px ui-monospace,monospace;letter-spacing:.5px}
#codebase-preview-env-badge.local{color:#8ff0a4;background:rgba(57,191,83,.13);border:1px solid rgba(80,220,105,.28)}
#codebase-preview-env-badge.production{color:#d7b7ff;background:rgba(150,90,230,.14);border:1px solid rgba(180,120,255,.30)}
#codebase-preview-env-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#b5c5d0;font-size:9px}
#codebase-preview-domain{display:none;margin-top:5px;font:9px ui-monospace,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#codebase-preview-domain a{color:#7dc4ff;text-decoration:none}
#codebase-preview-domain a:hover{text-decoration:underline}
`;
  document.head.appendChild(style);
}

function ensureUi(){
  const view=q('#view-preview');const iframe=frame();const portInput=q('#preview-port');
  if(!view||!iframe||!portInput)return false;
  installStyles();
  if(!q('#codebase-preview-environments',view)){
    const bar=document.createElement('div');bar.id='codebase-preview-environments';
    bar.innerHTML=`<div id="codebase-preview-switch" role="tablist" aria-label="Preview environment"><button type="button" data-codebase-preview-env="local" role="tab">Local</button><button type="button" data-codebase-preview-env="production" role="tab">Railway Production</button></div><div id="codebase-preview-env-meta"><span id="codebase-preview-env-badge" class="local">LOCAL</span><span id="codebase-preview-env-label">Development preview</span></div><div id="codebase-preview-domain"><a id="codebase-preview-domain-link" target="_blank" rel="noopener noreferrer"></a></div>`;
    view.appendChild(bar);
    q('[data-codebase-preview-env="local"]',bar)?.addEventListener('click',()=>showLocal(false));
    q('[data-codebase-preview-env="production"]',bar)?.addEventListener('click',()=>void showProduction());
  }
  const external=q('#codebase-preview-toolbar button[title="Open in new window"]')||view.querySelector('button[title="Open in new window"]');
  if(external)external.title='Open current preview in new window';
  return true;
}

function setLocalChromeVisible(visible){
  const toolbar=q('#codebase-preview-toolbar');
  if(!toolbar)return;
  const nodes=[q('.codebase-preview-label',toolbar),q('#preview-port',toolbar),q('#codebase-preview-open',toolbar)];
  for(const node of nodes)if(node)node.style.display=visible?'':'none';
}
function paintMode(next){
  mode=next;
  document.querySelectorAll('[data-codebase-preview-env]').forEach(button=>{
    const active=button.dataset.codebasePreviewEnv===mode;
    button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));
  });
  setLocalChromeVisible(mode==='local');
  const badge=q('#codebase-preview-env-badge');
  if(badge){badge.className=mode==='local'?'local':'production';badge.textContent=mode==='local'?'LOCAL':'RAILWAY PRODUCTION'}
}
function setMeta(label,domainUrl=''){
  const labelNode=q('#codebase-preview-env-label');if(labelNode)labelNode.textContent=label;
  const domain=q('#codebase-preview-domain'),link=q('#codebase-preview-domain-link');
  if(domain&&link){
    if(domainUrl){const url=safeHttpUrl(domainUrl);link.href=url;link.textContent=url.replace(/^https?:\/\//,'').replace(/\/$/,'');domain.style.display='block'}
    else{link.removeAttribute('href');link.textContent='';domain.style.display='none'}
  }
}
async function showLocal(open=false){
  if(!ensureUi())return;
  paintMode('local');
  const project=activeProject();const p=port();const state=localPortState(p);const serial=++requestSerial;
  setMeta((project?project+' • ':'')+'development server • port '+p);
  if(!state.ok){
    setMeta((project?project+' • ':'')+(state.reserved?'reserved local port ':'invalid local port ')+p);
    showFrameMessage(state.message);
    status('PREVIEW • LOCAL • '+(project||'workspace')+' • '+(state.reserved?'reserved port ':'invalid port ')+p);
    return;
  }
  if(!open){
    showFrameMessage('LOCAL preview ready on port '+p+'. Press Open to load the running application.');
    status('PREVIEW • LOCAL • '+(project||'workspace')+' • port '+p+' • ready');
    return;
  }
  const sessionId=terminalSessionId();
  if(!sessionId){showFrameMessage('LOCAL preview is waiting for an active Codebase terminal session. Open or refresh a terminal, then press Open again.');status('PREVIEW • LOCAL • no terminal session');return}
  const token=authToken();
  if(!token){showFrameMessage('LOCAL preview requires an active Sulandra session.');status('PREVIEW • LOCAL • authentication required');return}
  const endpoint=localTicketEndpoint();
  if(!/^https?:\/\//i.test(endpoint)){showFrameMessage('Local preview broker is unavailable.');status('PREVIEW • LOCAL • broker unavailable');return}
  setMeta((project?project+' • ':'')+'opening terminal '+sessionId.slice(0,12)+'… • port '+p);
  status('PREVIEW • LOCAL • '+(project||'workspace')+' • opening port '+p);
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({sessionId,port:state.port,surface:'codebase'})});
    const data=await response.json().catch(()=>({}));
    if(serial!==requestSerial||mode!=='local')return;
    if(!response.ok||!data?.url)throw new Error(data?.error||'Local preview ticket failed ('+response.status+')');
    const url=safeHttpUrl(data.url);
    if(!url)throw new Error('Local preview returned an invalid URL');
    setFrameUrl(url);
    setMeta((project?project+' • ':'')+'terminal '+sessionId.slice(0,12)+' • port '+p);
    status('PREVIEW • LOCAL • '+(project||'workspace')+' • port '+p+' • live');
  }catch(error){
    if(serial!==requestSerial||mode!=='local')return;
    setMeta((project?project+' • ':'')+'local preview unavailable • port '+p);
    showFrameMessage('LOCAL preview unavailable: '+(error?.message||error));
    status('PREVIEW • LOCAL FAILED • '+(error?.message||error));
  }
}
async function showProduction(){
  if(!ensureUi())return;
  paintMode('production');
  const project=activeProject();const serial=++requestSerial;
  if(!project){setMeta('Open a project to resolve Railway Production.');showFrameMessage('Open a project before using Railway Production Preview.');status('PREVIEW • RAILWAY PRODUCTION • no active project');return}
  const token=authToken();
  if(!token){setMeta(project+' • authentication required');showFrameMessage('Railway Production Preview requires an active Sulandra session.');status('PREVIEW • RAILWAY PRODUCTION • authentication required');return}
  setMeta(project+' • resolving linked production domain…');showFrameMessage('Resolving Railway Production for '+project+'…');
  try{
    const response=await fetch(productionEndpoint(project),{credentials:'same-origin',headers:{Accept:'application/json',Authorization:'Bearer '+token}});
    const data=await response.json().catch(()=>({}));
    if(serial!==requestSerial||mode!=='production')return;
    if(!response.ok)throw new Error(data?.error||'Production preview request failed ('+response.status+')');
    if(!data?.linked){setMeta(project+' • not linked to Railway');showFrameMessage('This project is not linked to a Railway service. Use IDE Config → Railway Deployment to connect it.');status('PREVIEW • RAILWAY PRODUCTION • '+project+' • not linked');return}
    const url=safeHttpUrl(data.productionUrl||data.url||'');
    const s=data.status||{};
    const service=String(s?.service?.name||s?.service||'').trim();
    const environment=String(s?.environment?.name||s?.environment||'production').trim()||'production';
    if(!url){setMeta(project+' • '+(service?service+' • ':'')+environment+' • no public domain');showFrameMessage('The linked Railway service has no public domain. Add a Railway domain, then refresh Production Preview.');status('PREVIEW • RAILWAY PRODUCTION • '+project+' • no public domain');return}
    setMeta(project+' • '+(service?service+' • ':'')+environment,url);setFrameUrl(url);
    status('PREVIEW • RAILWAY PRODUCTION • '+project+' • '+url.replace(/^https?:\/\//,'').replace(/\/$/,''));
  }catch(error){
    if(serial!==requestSerial||mode!=='production')return;
    setMeta(project+' • Railway Production unavailable');showFrameMessage('Railway Production preview unavailable: '+(error?.message||error));status('PREVIEW • RAILWAY PRODUCTION FAILED • '+(error?.message||error));
  }
}

const originalUpdatePreviewPort=window.updatePreviewPort;
window.updatePreviewPort=function(){
  if(mode==='local'){
    const open=localOpenIntent;localOpenIntent=false;
    return showLocal(open);
  }
  return originalUpdatePreviewPort?.apply(this,arguments);
};
document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  if(target?.closest?.('#codebase-preview-open,.codebase-preview-open')&&mode==='local')localOpenIntent=true;
},true);
document.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&event.target?.id==='preview-port'&&mode==='local'){
    event.preventDefault();localOpenIntent=true;void window.updatePreviewPort();
  }
},true);
document.addEventListener('change',event=>{
  if(event.target?.id==='codebase-project-select'){lastProject=activeProject();mode==='production'?void showProduction():void showLocal(false)}
},true);

const boot=attempt=>{
  if(ensureUi()){lastProject=activeProject();void showLocal(false);return}
  if(attempt<160)setTimeout(()=>boot(attempt+1),50);
};
boot(0);
setInterval(()=>{
  const project=activeProject();if(project===lastProject)return;lastProject=project;
  if(!q('#view-preview'))return;
  mode==='production'?void showProduction():void showLocal(false);
},1000);

window.SulandraCodebasePreview={local:()=>showLocal(false),openLocal:()=>showLocal(true),production:showProduction,getMode:()=>mode,refresh:()=>mode==='production'?showProduction():showLocal(false)};
})();
