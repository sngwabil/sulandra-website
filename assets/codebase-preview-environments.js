/* CODEBASE_PREVIEW_ENVIRONMENTS_V1
 * Makes Codebase Preview environment-explicit: Local development preview or
 * the linked Railway Production service domain for the active project.
 */
(()=>{
'use strict';
if(window.__CODEBASE_PREVIEW_ENVIRONMENTS_V1__)return;
window.__CODEBASE_PREVIEW_ENVIRONMENTS_V1__=true;

let mode='local';
let requestSerial=0;
let lastProject='';
const q=(selector,root=document)=>root.querySelector(selector);
const cfg=()=>{try{return typeof RAILWAY_CONFIG!=='undefined'?RAILWAY_CONFIG:null}catch{return null}};
const activeProject=()=>String(q('#codebase-project-select')?.value||'').trim();
const port=()=>String(q('#preview-port')?.value||'3000').trim()||'3000';
const gatewayBase=()=>String(cfg()?.WSS_URL||'').replace(/^wss:/i,'https:').replace(/^ws:/i,'http:').replace(/\/$/,'');
const authToken=()=>String(cfg()?.getToken?.()||'').trim();
const localPreviewUrl=()=>{
  const base=String(cfg()?.PREVIEW_URL||'').trim();
  if(!base)return '';
  const url=new URL(base,location.origin);
  url.searchParams.set('port',port());
  return url.toString();
};
const status=text=>{const node=q('#status-line-col');if(node)node.textContent=String(text||'')};
const frame=()=>q('#railway-preview-iframe');
const localControls=()=>q('#codebase-preview-local-controls')||q('#preview-port')?.parentElement||null;
const productionEndpoint=project=>gatewayBase()+'/codebase/projects/'+encodeURIComponent(project)+'/railway/preview';
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
  if(iframe.src!==url)iframe.src=url;
};
const showFrameMessage=message=>{
  const iframe=frame();if(!iframe)return;
  iframe.src='about:blank';
  iframe.srcdoc='<!doctype html><html><body style="margin:0;background:#071019;color:#b9cad7;font:13px system-ui;display:grid;place-items:center;height:100vh;text-align:center;padding:24px;box-sizing:border-box"><div>'+String(message||'Preview unavailable').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))+'</div></body></html>';
};

function installStyles(){
  if(q('#codebase-preview-environments-style'))return;
  const style=document.createElement('style');style.id='codebase-preview-environments-style';
  style.textContent=`
#codebase-preview-environments{margin:-4px 0 12px;padding:10px;border:1px solid rgba(255,255,255,.10);border-radius:7px;background:rgba(2,8,13,.56)}
#codebase-preview-switch{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;border:1px solid rgba(255,255,255,.10);border-radius:6px;background:rgba(0,0,0,.28)}
#codebase-preview-switch button{border:0;border-radius:4px;padding:7px 5px;background:transparent;color:#8195a5;font:700 10px system-ui;cursor:pointer;white-space:nowrap}
#codebase-preview-switch button.active{background:rgba(255,255,255,.10);color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
#codebase-preview-env-meta{display:flex;align-items:center;gap:7px;margin-top:9px;min-width:0}
#codebase-preview-env-badge{flex:0 0 auto;padding:2px 6px;border-radius:999px;font:800 9px ui-monospace,monospace;letter-spacing:.6px}
#codebase-preview-env-badge.local{color:#8ff0a4;background:rgba(57,191,83,.13);border:1px solid rgba(80,220,105,.28)}
#codebase-preview-env-badge.production{color:#d7b7ff;background:rgba(150,90,230,.14);border:1px solid rgba(180,120,255,.30)}
#codebase-preview-env-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#b5c5d0;font-size:10px}
#codebase-preview-domain{display:none;margin-top:7px;font:10px ui-monospace,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#codebase-preview-domain a{color:#7dc4ff;text-decoration:none}
#codebase-preview-domain a:hover{text-decoration:underline}
#codebase-preview-local-controls{margin-bottom:10px!important}
`;
  document.head.appendChild(style);
}

function ensureUi(){
  const view=q('#view-preview');const iframe=frame();const portInput=q('#preview-port');
  if(!view||!iframe||!portInput)return false;
  installStyles();
  const controls=portInput.parentElement;
  if(controls&&!controls.id){controls.id='codebase-preview-local-controls';const label=controls.querySelector('span');if(label)label.textContent='Local Port'}
  if(!q('#codebase-preview-environments',view)){
    const bar=document.createElement('div');bar.id='codebase-preview-environments';
    bar.innerHTML=`<div id="codebase-preview-switch" role="tablist" aria-label="Preview environment"><button type="button" data-codebase-preview-env="local" role="tab">Local</button><button type="button" data-codebase-preview-env="production" role="tab">Railway Production</button></div><div id="codebase-preview-env-meta"><span id="codebase-preview-env-badge" class="local">LOCAL</span><span id="codebase-preview-env-label">Development preview</span></div><div id="codebase-preview-domain"><a id="codebase-preview-domain-link" target="_blank" rel="noopener noreferrer"></a></div>`;
    const header=view.firstElementChild;header?.insertAdjacentElement('afterend',bar);
    q('[data-codebase-preview-env="local"]',bar)?.addEventListener('click',()=>showLocal());
    q('[data-codebase-preview-env="production"]',bar)?.addEventListener('click',()=>void showProduction());
  }
  const external=view.firstElementChild?.querySelector('button[title="Open in new window"]');
  if(external)external.title='Open current preview in new window';
  return true;
}

function paintMode(next){
  mode=next;
  document.querySelectorAll('[data-codebase-preview-env]').forEach(button=>{
    const active=button.dataset.codebasePreviewEnv===mode;
    button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));
  });
  const controls=localControls();if(controls)controls.style.display=mode==='local'?'flex':'none';
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
function showLocal(){
  if(!ensureUi())return;
  requestSerial+=1;paintMode('local');
  const project=activeProject();const p=port();const url=localPreviewUrl();
  setMeta((project?project+' • ':'')+'development server • port '+p);
  if(url)setFrameUrl(url);else showFrameMessage('Local preview service is unavailable.');
  status('PREVIEW • LOCAL • '+(project||'workspace')+' • port '+p);
}
async function showProduction(){
  if(!ensureUi())return;
  paintMode('production');
  const project=activeProject();const serial=++requestSerial;
  if(!project){setMeta('Open a project to resolve Railway Production.');showFrameMessage('Open a project before using Railway Production Preview.');status('PREVIEW • RAILWAY PRODUCTION • no active project');return}
  setMeta(project+' • resolving linked production domain…');showFrameMessage('Resolving Railway Production for '+project+'…');
  try{
    const response=await fetch(productionEndpoint(project),{credentials:'same-origin',headers:{Accept:'application/json',Authorization:'Bearer '+authToken()}});
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
    setMeta(project+' • Railway Production unavailable');showFrameMessage('Railway Production preview unavailable: '+error.message);status('PREVIEW • RAILWAY PRODUCTION FAILED • '+error.message);
  }
}

const originalUpdatePreviewPort=window.updatePreviewPort;
window.updatePreviewPort=function(){
  if(mode==='local')return showLocal();
  return originalUpdatePreviewPort?.apply(this,arguments);
};
document.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&event.target?.id==='preview-port'&&mode==='local'){event.preventDefault();showLocal()}
},true);
document.addEventListener('change',event=>{
  if(event.target?.id==='codebase-project-select'){lastProject=activeProject();mode==='production'?void showProduction():showLocal()}
},true);

const boot=attempt=>{
  if(ensureUi()){lastProject=activeProject();showLocal();return}
  if(attempt<160)setTimeout(()=>boot(attempt+1),50);
};
boot(0);
setInterval(()=>{
  const project=activeProject();if(project===lastProject)return;lastProject=project;
  if(!q('#view-preview'))return;
  mode==='production'?void showProduction():showLocal();
},1000);

window.SulandraCodebasePreview={local:showLocal,production:showProduction,getMode:()=>mode,refresh:()=>mode==='production'?showProduction():showLocal()};
})();
