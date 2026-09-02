/* SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V1 */
/* SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V2_SELF_HEAL */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V2_SELF_HEAL__)return;
window.__SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V1__=true;
window.__SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V2_SELF_HEAL__=true;

let homeParent=null;
let homeNext=null;
let rootObserver=null;
let repairPending=false;
let repairAttempts=0;
let repairTimer=0;

const shell=()=>document.getElementById('sulandraCodebase');
const sia=()=>document.getElementById('sia-copilot-root');
const launcher=()=>document.getElementById('siaxLauncher');

function rememberHome(root){
  if(homeParent||!root?.parentNode)return;
  homeParent=root.parentNode;
  homeNext=root.nextSibling;
}

function restore(root){
  if(!root||!homeParent||root.parentNode===homeParent)return;
  if(homeNext&&homeNext.parentNode===homeParent)homeParent.insertBefore(root,homeNext);
  else homeParent.appendChild(root);
  root.removeAttribute('data-codebase-fullscreen-home');
}

function sync(){
  const workbench=shell();
  const root=sia();
  if(!workbench||!root||!launcher())return;
  rememberHome(root);
  const fullscreen=document.fullscreenElement||document.webkitFullscreenElement||null;
  const codebaseFullscreen=Boolean(fullscreen&&(fullscreen===workbench||workbench.contains(fullscreen)));
  if(codebaseFullscreen){
    if(root.parentNode!==workbench)workbench.appendChild(root);
    root.setAttribute('data-codebase-fullscreen-home','true');
    return;
  }
  restore(root);
}

function watchRoot(){
  rootObserver?.disconnect();
  rootObserver=null;
  const root=sia();
  if(!root)return;
  rememberHome(root);
  rootObserver=new MutationObserver(()=>{
    if(!launcher())scheduleRepair();
  });
  rootObserver.observe(root,{childList:true,subtree:true});
}

function repairRuntime(){
  repairTimer=0;
  if(launcher()){
    watchRoot();
    sync();
    return;
  }
  if(repairPending||repairAttempts>=3||window.top!==window.self||/\/sia\.html$/i.test(location.pathname))return;
  repairPending=true;
  repairAttempts+=1;
  rootObserver?.disconnect();
  rootObserver=null;
  sia()?.remove();
  window.__SIA_GLOBAL_COPILOT_V1__=false;
  const script=document.createElement('script');
  script.src=`/assets/sia-copilot.js?v=20260827-sia-intelligence-router-1&codebaseRepair=${repairAttempts}`;
  script.async=false;
  script.dataset.codebaseSiaRepair=String(repairAttempts);
  script.onload=()=>{
    repairPending=false;
    if(launcher()){
      watchRoot();
      sync();
    }else scheduleRepair(80);
  };
  script.onerror=()=>{
    repairPending=false;
    scheduleRepair(160);
  };
  document.head.appendChild(script);
}

function scheduleRepair(delay=0){
  if(repairTimer||repairPending||launcher())return;
  repairTimer=window.setTimeout(repairRuntime,delay);
}

for(const eventName of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(eventName,()=>{
  if(!launcher())scheduleRepair();
  else sync();
});
window.addEventListener('pageshow',()=>{
  if(!launcher())scheduleRepair();
  else sync();
});

// Keep watching the global shell boundary because several legacy IT Solutions
// normalizers rebuild overlay regions. If the SIA root or launcher is removed,
// restore the canonical runtime instead of silently losing the copilot.
const documentObserver=new MutationObserver(()=>{
  if(launcher()){
    if(!rootObserver)watchRoot();
    sync();
    return;
  }
  if(window.__SIA_GLOBAL_COPILOT_V1__||document.readyState!=='loading')scheduleRepair(20);
});
documentObserver.observe(document.documentElement,{childList:true,subtree:false});

function boot(){
  if(launcher()){
    watchRoot();
    sync();
  }else scheduleRepair(20);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else queueMicrotask(boot);
})();
