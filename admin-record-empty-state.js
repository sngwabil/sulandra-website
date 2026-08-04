(function(){
'use strict';
if(window.__sulandraRecordEmptyState)return;
window.__sulandraRecordEmptyState=true;

const SERVICE_KEY='sulandra:admin:active-service';
let pending=null;

function service(){return localStorage.getItem(SERVICE_KEY)||'community';}
function host(){return document.getElementById('adminInternalWorkspace');}
function scrollBox(){const h=host();return h?.closest('.ec-center-scroll,.ec-center-viewport,[data-ec-center-scroll]')||h?.parentElement||document.scrollingElement;}
function scrollTop(){const box=scrollBox();return box===document.scrollingElement?window.scrollY:Number(box?.scrollTop||0);}
function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function departmentName(key){return key==='homehealth'?'Home Health Care':key==='nemt'?'Transportation':'Community Living';}

function installStyles(){
 if(document.getElementById('sulandraRecordEmptyStateStyles'))return;
 const style=document.createElement('style');
 style.id='sulandraRecordEmptyStateStyles';
 style.textContent=`
 .sos-record-state{position:relative;width:100%;min-height:560px;border:1px solid #d7e4ef;border-radius:22px;background:rgba(255,255,255,.97);box-shadow:0 18px 55px rgba(15,36,66,.14);overflow:hidden}
 .sos-record-state-head{padding:14px 110px 14px 24px;background:#0d3154;color:#e6f5ff;font-size:12px;font-weight:850}
 .sos-record-state-body{padding:34px;display:grid;gap:22px}
 .sos-record-state-message{max-width:820px}.sos-record-state-message .icon{width:58px;height:58px;display:grid;place-items:center;border-radius:18px;background:#edf5fb;color:#075b9c;font-size:27px;margin-bottom:16px}
 .sos-record-state-message h1{margin:0 0 9px;color:#102448;font-size:clamp(27px,4vw,42px)}.sos-record-state-message p{margin:0;color:#62738b;font-size:16px;line-height:1.65}
 .sos-record-placeholder{min-height:220px;border:2px dashed #b8cce0;border-radius:18px;background:linear-gradient(145deg,#f8fbfd,#eef5fa);padding:24px;display:grid;align-content:center;justify-items:center;text-align:center;color:#62738b}
 .sos-record-placeholder strong{display:block;color:#274967;font-size:17px;margin-bottom:6px}.sos-record-placeholder-grid{width:min(760px,100%);display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}.sos-record-placeholder-grid span{height:54px;border-radius:12px;background:rgba(255,255,255,.82);border:1px solid #d7e4ef}
 .sos-record-state-actions{display:flex;gap:10px;flex-wrap:wrap}.sos-record-state-actions button{border-radius:11px;padding:11px 16px;font-weight:850;cursor:pointer}.sos-record-retry{border:0;background:#075b9c;color:#fff}.sos-record-return{border:1px solid #9fc6e4;background:#fff;color:#075b9c}.sos-record-close{border:1px solid #f1b7b0;background:#fff5f3;color:#a82c1e}
 .sos-inline-empty{margin:22px 16px;padding:26px;border:2px dashed #b8cce0;border-radius:18px;background:#f7fbfe;text-align:center}.sos-inline-empty h3{margin:0 0 7px;color:#102448}.sos-inline-empty p{margin:0 auto 18px;max-width:680px;color:#62738b}.sos-inline-empty .sos-record-state-actions{justify-content:center}
 @media(max-width:720px){.sos-record-state-body{padding:20px}.sos-record-placeholder-grid{grid-template-columns:1fr}.sos-record-state-head{padding-right:90px}}
 `;
 document.head.appendChild(style);
}

function returnToDepartment(key,position){
 const router=window.SulandraDepartmentRouter;
 if(router?.renderDepartment){router.renderDepartment(key);setTimeout(()=>{const box=scrollBox();if(box===document.scrollingElement)window.scrollTo(0,position||0);else if(box)box.scrollTop=position||0;},100);return;}
 document.querySelector(`[data-service-nav="${key}"]`)?.click();
}

function retryPending(state){
 const router=window.SulandraDepartmentRouter;
 returnToDepartment(state.service,state.originScroll);
 setTimeout(()=>{
  const tool=[...document.querySelectorAll('.sos-tool')].find(item=>(item.dataset.sosLabel||item.querySelector('h3')?.textContent?.trim())===state.label);
  if(tool)tool.click();
  else if(router?.mountLiveModule&&state.module)router.mountLiveModule(state.service,state.label,state.module,state.panel||undefined);
 },180);
}

function makeActions(container,state,windowNode){
 const actions=document.createElement('div');actions.className='sos-record-state-actions';
 actions.innerHTML='<button type="button" class="sos-record-retry">Retry</button><button type="button" class="sos-record-return">Return to department</button><button type="button" class="sos-record-close">Close</button>';
 actions.querySelector('.sos-record-retry').onclick=()=>retryPending(state);
 actions.querySelector('.sos-record-return').onclick=()=>returnToDepartment(state.service,state.originScroll);
 actions.querySelector('.sos-record-close').onclick=()=>{
  const close=windowNode?.querySelector(':scope > .os-window-controls .os-close');
  if(close)close.click();else returnToDepartment(state.service,state.originScroll);
 };
 container.appendChild(actions);
}

function showFullState(state,reason){
 const h=host();if(!h)return;
 window.SulandraDepartmentRouter?.parkMountedModules?.();
 h.innerHTML='';
 const node=document.createElement('section');
 node.className='sos-record-state';
 node.dataset.recordState='empty';
 node.innerHTML=`<div class="sos-record-state-head">${esc(departmentName(state.service))} › ${esc(state.label)}</div><div class="sos-record-state-body"><div class="sos-record-state-message"><div class="icon">⌕</div><h1>${esc(state.label)} record not found</h1><p>${esc(reason||'No record is currently available in this workspace. When a record is created or assigned to this department, it will appear in the reserved area below.')}</p></div><div class="sos-record-placeholder"><strong>Records will appear here</strong><span>This space is reserved for ${esc(state.label.toLowerCase())} records, folders, forms, and related actions.</span><div class="sos-record-placeholder-grid"><span></span><span></span><span></span></div></div></div>`;
 h.appendChild(node);
 makeActions(node.querySelector('.sos-record-state-body'),state,node);
 const register=window.SulandraDesktopOS?.registerWindow;
 if(typeof register==='function')register(node,state.label,{service:state.service,scroll:state.originScroll});
}

function hasVisibleRecords(node){
 if(!node)return false;
 const visible=element=>element&&element.getClientRects().length>0;
 const rows=[...node.querySelectorAll('tbody tr,[data-record-id],[data-employee-id],[data-client-id],[data-application-id],.record-card,.employee-card,.client-card,.application-card')].filter(visible);
 if(rows.length)return true;
 const values=[...node.querySelectorAll('input:not([type="hidden"]),select,textarea,button:not(.os-window-controls button),a[href]')].filter(visible);
 const substantiveText=(node.innerText||'').replace(/Department:[^\n]*/g,'').trim();
 return values.length>2&&substantiveText.length>120;
}

function explicitFailure(node){
 const text=(node?.innerText||'').toLowerCase();
 return /failed to load|unable to load|not found|no records|no results|nothing found|network error|request failed/.test(text);
}

function addInlineEmpty(node,state,reason){
 if(!node||node.querySelector(':scope > .sos-inline-empty'))return;
 const panel=document.createElement('section');panel.className='sos-inline-empty';
 panel.innerHTML=`<h3>${esc(state.label)} record not found</h3><p>${esc(reason||'No records are currently available for this department. New records will appear in this area when they are created or assigned.')}</p><div class="sos-record-placeholder-grid" style="margin:16px auto 20px"><span></span><span></span><span></span></div>`;
 makeActions(panel,state,node);
 node.appendChild(panel);
}

function inspectMounted(detail){
 const node=detail.node;if(!node||!node.isConnected)return;
 const state={service:detail.department||service(),label:detail.label||'Record',module:detail.module,panel:detail.panel,originScroll:pending?.originScroll||0};
 let attempts=0;
 const check=()=>{
  attempts++;
  if(!node.isConnected)return;
  if(node.querySelector('[aria-busy="true"],.loading,.spinner,[data-loading="true"]')&&attempts<4){setTimeout(check,700);return;}
  if(explicitFailure(node)){addInlineEmpty(node,state,'The requested records could not be loaded or do not exist. This reserved area shows where they will appear once available.');return;}
  if(!hasVisibleRecords(node)&&attempts>=2)addInlineEmpty(node,state);
  else if(!hasVisibleRecords(node)&&attempts<2)setTimeout(check,900);
 };
 setTimeout(check,700);
}

function ensureClickResult(state,before){
 let attempts=0;
 const check=()=>{
  attempts++;
  const h=host();const current=h?.firstElementChild;
  const changed=current&&current!==before;
  if(changed)return;
  if(attempts<5){setTimeout(check,350);return;}
  showFullState(state,'The requested workspace did not return a record or usable view. No data was changed.');
 };
 setTimeout(check,250);
}

document.addEventListener('click',event=>{
 const tool=event.target.closest('.sos-tool');if(!tool)return;
 const state={service:service(),label:tool.dataset.sosLabel||tool.querySelector('h3')?.textContent?.trim()||'Record',module:tool.dataset.sosTarget||'',panel:null,originScroll:scrollTop()};
 pending=state;
 ensureClickResult(state,host()?.firstElementChild||null);
},true);

window.addEventListener('sulandra:workspace-module-mounted',event=>inspectMounted(event.detail||{}));
window.addEventListener('error',()=>{
 if(!pending)return;
 const h=host();if(h&&!h.querySelector('.sos-record-state,.sos-mounted-module'))showFullState(pending,'The requested workspace encountered an error before records could be displayed.');
});

installStyles();
window.SulandraRecordEmptyState={show:showFullState,inspect:inspectMounted};
})();