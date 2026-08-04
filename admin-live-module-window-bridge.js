(function(){
'use strict';
if(window.__sulandraLiveModuleWindowBridge)return;
window.__sulandraLiveModuleWindowBridge=true;
let pendingOrigin=null;
function service(){return localStorage.getItem('sulandra:admin:active-service')||'community'}
function host(){return document.getElementById('adminInternalWorkspace')}
function scrollBox(){const h=host();return h?.closest('.ec-center-scroll,.ec-center-viewport,[data-ec-center-scroll]')||h?.parentElement||document.scrollingElement}
function scrollTop(){const box=scrollBox();return box===document.scrollingElement?window.scrollY:Number(box?.scrollTop||0)}
function depot(){let node=document.getElementById('sosModuleDepot');if(!node){node=document.createElement('div');node.id='sosModuleDepot';node.hidden=true;document.body.appendChild(node)}return node}
document.addEventListener('click',event=>{
 const tool=event.target.closest('.sos-tool');
 if(tool)pendingOrigin={service:service(),scroll:scrollTop(),title:tool.dataset.sosLabel||tool.querySelector('h3')?.textContent?.trim()||'Workspace'};
 const close=event.target.closest('.os-close');
 if(close){const win=close.closest('.module.sos-mounted-module');if(win)setTimeout(()=>{if(!win.isConnected){win.classList.remove('active','sos-mounted-module','os-managed-window','os-fullscreen');win.querySelector(':scope > .os-window-controls')?.remove();depot().appendChild(win)}},0)}
},true);
window.addEventListener('sulandra:workspace-module-mounted',event=>{
 const detail=event.detail||{};const node=detail.node;if(!node)return;
 const origin=pendingOrigin||{service:detail.department||service(),scroll:0,title:detail.label||'Workspace'};
 const register=window.SulandraDesktopOS?.registerWindow;
 if(typeof register==='function')register(node,detail.label||origin.title,origin);
 pendingOrigin=null;
});
})();