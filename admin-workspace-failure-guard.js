(function(){
'use strict';
if(window.__sulandraWorkspaceFailureGuard)return;
window.__sulandraWorkspaceFailureGuard=true;
const SERVICE_KEY='sulandra:admin:active-service';
let pending=null;
let timer=0;
function service(){return localStorage.getItem(SERVICE_KEY)||'community';}
function host(){return document.getElementById('adminInternalWorkspace');}
function visible(element){if(!element||!element.isConnected)return false;const style=getComputedStyle(element);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;const rect=element.getBoundingClientRect();return rect.width>20&&rect.height>20;}
function workspaceHasUsableView(){const h=host();if(!h||!visible(h))return false;const children=[...h.children].filter(visible);if(!children.length)return false;return children.some(node=>{if(node.matches('.sos-record-state,.sos-service-shell,.sos-mounted-module,.module.active,.os-folder-window'))return true;const text=(node.innerText||'').trim();return text.length>30||Boolean(node.querySelector('table,form,[data-record-id],[data-employee-id],[data-client-id],button,input,select,textarea'));});}
function labelFromTask(button){return button?.dataset?.title||button?.getAttribute('aria-label')||button?.title||'Record';}
function originScroll(){const h=host();const box=h?.closest('.ec-center-scroll,.ec-center-viewport,[data-ec-center-scroll]')||h?.parentElement||document.scrollingElement;return box===document.scrollingElement?window.scrollY:Number(box?.scrollTop||0);}
function schedule(state,delay=1100){pending={service:state.service||service(),label:state.label||'Record',module:state.module||'',panel:state.panel||null,originScroll:Number(state.originScroll??originScroll())};clearTimeout(timer);timer=setTimeout(()=>{if(workspaceHasUsableView())return;const show=window.SulandraRecordEmptyState?.show;if(typeof show==='function')show(pending,'The requested workspace did not produce a visible record or usable screen. No data was changed.');},delay);}
document.addEventListener('click',event=>{const tool=event.target.closest('.sos-tool');if(tool){schedule({label:tool.dataset.sosLabel||tool.querySelector('h3')?.textContent?.trim()||'Record',module:tool.dataset.sosTarget||'',originScroll:originScroll()});return;}const task=event.target.closest('.os-task-icon');if(task){schedule({label:labelFromTask(task),originScroll:originScroll()},750);return;}const moduleButton=event.target.closest('[data-module]');if(moduleButton)schedule({label:(moduleButton.textContent||'Record').trim(),module:moduleButton.dataset.module||'',originScroll:originScroll()});},true);
window.addEventListener('sulandra:workspace-module-mounted',event=>{const detail=event.detail||{};schedule({service:detail.department||service(),label:detail.label||'Record',module:detail.module||'',panel:detail.panel||null,originScroll:originScroll()},1400);});
window.addEventListener('error',()=>{if(pending)schedule(pending,100);});
window.SulandraWorkspaceFailureGuard={schedule,check:workspaceHasUsableView};
})();