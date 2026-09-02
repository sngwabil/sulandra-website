/* SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V1 */
/* SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V4_WORKSPACE_HOME */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V4_WORKSPACE_HOME__)return;
window.__SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V1__=true;
window.__SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V4_WORKSPACE_HOME__=true;

let rootObserver=null;
let documentObserver=null;
let repairPending=false;
let repairAttempts=0;
let repairTimer=0;
let lastMutationAt=Date.now();
const MAX_REPAIRS=10;

const shell=()=>document.getElementById('sulandraCodebase');
const sia=()=>document.getElementById('sia-copilot-root');
const launcher=()=>document.getElementById('siaxLauncher');
const workspaceHost=()=>document.querySelector('.itws-layout')||document.querySelector('.itws-content')||document.getElementById('agent')||document.body;

function sync(){
  const workbench=shell();
  const root=sia();
  if(!root||!launcher())return;
  const fullscreen=document.fullscreenElement||document.webkitFullscreenElement||null;
  const codebaseFullscreen=Boolean(workbench&&fullscreen&&(fullscreen===workbench||workbench.contains(fullscreen)));
  if(codebaseFullscreen){
    if(root.parentNode!==workbench)workbench.appendChild(root);
    root.setAttribute('data-codebase-fullscreen-home','true');
    return;
  }

  // IT Solutions intentionally removes floating legacy SIA controls that live
  // outside the engineering workspace. Keep the canonical global copilot inside
  // the real workspace in normal mode so that guard preserves it. When Codebase
  // enters native fullscreen, sync() moves the same root into the fullscreen
  // element because browsers render only descendants of the fullscreen subtree.
  const host=workspaceHost();
  if(host&&root.parentNode!==host)host.appendChild(root);
  root.removeAttribute('data-codebase-fullscreen-home');
}

function watchRoot(){
  rootObserver?.disconnect();
  rootObserver=null;
  const root=sia();
  if(!root)return;
  rootObserver=new MutationObserver(()=>{
    lastMutationAt=Date.now();
    if(!launcher())scheduleRepair(180);
  });
  rootObserver.observe(root,{childList:true,subtree:true});
}

function cleanupRepairScripts(){
  document.querySelectorAll('script[data-codebase-sia-repair]').forEach((node)=>node.remove());
}

function repairRuntime(){
  repairTimer=0;
  if(launcher()){
    repairAttempts=0;
    watchRoot();
    sync();
    return;
  }
  if(repairPending||repairAttempts>=MAX_REPAIRS||window.top!==window.self||/\/sia\.html$/i.test(location.pathname))return;

  const quietFor=Date.now()-lastMutationAt;
  if(quietFor<140){scheduleRepair(160-quietFor);return;}

  repairPending=true;
  repairAttempts+=1;
  rootObserver?.disconnect();
  rootObserver=null;
  sia()?.remove();
  window.__SIA_GLOBAL_COPILOT_V1__=false;
  cleanupRepairScripts();

  const script=document.createElement('script');
  script.src=`/assets/sia-copilot.js?v=20260827-sia-intelligence-router-1&codebaseRepair=${repairAttempts}`;
  script.async=false;
  script.dataset.codebaseSiaRepair=String(repairAttempts);
  script.onload=()=>{
    repairPending=false;
    if(launcher()){
      repairAttempts=0;
      sync();
      watchRoot();
    }else scheduleRepair(Math.min(1200,160*Math.max(1,repairAttempts)));
  };
  script.onerror=()=>{
    repairPending=false;
    scheduleRepair(Math.min(1600,240*Math.max(1,repairAttempts)));
  };
  (workspaceHost()||document.body).appendChild(script);
}

function scheduleRepair(delay=180){
  if(repairPending||launcher())return;
  if(repairTimer)window.clearTimeout(repairTimer);
  repairTimer=window.setTimeout(repairRuntime,Math.max(40,delay));
}

function observeDocument(){
  documentObserver?.disconnect();
  documentObserver=new MutationObserver((records)=>{
    const meaningful=records.some((record)=>{
      const nodes=[...record.addedNodes,...record.removedNodes];
      return nodes.some((node)=>{
        if(!(node instanceof Element))return true;
        return node.id!=='sia-copilot-root'&&!node.matches?.('script[data-codebase-sia-repair]');
      });
    });
    if(meaningful)lastMutationAt=Date.now();
    if(launcher()){
      if(!rootObserver)watchRoot();
      sync();
      return;
    }
    scheduleRepair(180);
  });
  documentObserver.observe(document.documentElement,{childList:true,subtree:true});
}

for(const eventName of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(eventName,()=>{
  if(!launcher())scheduleRepair(180);
  else sync();
});
window.addEventListener('pageshow',()=>{
  if(!launcher())scheduleRepair(180);
  else sync();
});

function boot(){
  // Run before older non-capture DOMContentLoaded normalizers. This relocates
  // the canonical SIA root into .itws-layout before their floating-SIA cleanup
  // executes, so the current copilot is preserved rather than mistaken for a
  // deprecated launcher.
  if(launcher())sync();
  observeDocument();
  if(launcher()){
    repairAttempts=0;
    watchRoot();
    sync();
  }else scheduleRepair(180);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true,capture:true});
else queueMicrotask(boot);
})();
