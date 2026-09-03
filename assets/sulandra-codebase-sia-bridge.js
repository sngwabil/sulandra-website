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

/* SULANDRA_CODEBASE_IT_SOLUTIONS_HOST_V1
 * Sulandra IT owns the page. Codebase is a child tab/view and may enter native
 * fullscreen only when the user explicitly presses the Codebase Full Screen button.
 */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_IT_SOLUTIONS_HOST_V1__)return;
window.__SULANDRA_CODEBASE_IT_SOLUTIONS_HOST_V1__=true;

const TAB_ID='itSolutionsCodebaseTab';
const VIEW_ID='itSolutionsCodebaseView';
let hostObserver=null;
let tabsBound=false;
let apiOverridden=false;

const codebaseShell=()=>document.getElementById('sulandraCodebase');
const tabsHost=()=>document.querySelector('main.shell > .tabs')||document.querySelector('main .tabs')||document.querySelector('.tabs');
const mainHost=()=>document.querySelector('main.shell')||document.querySelector('main');
const codebaseTab=()=>document.getElementById(TAB_ID);
const codebaseView=()=>document.getElementById(VIEW_ID);

function installStyle(){
  if(document.getElementById('scbItSolutionsHostStyle'))return;
  const style=document.createElement('style');
  style.id='scbItSolutionsHostStyle';
  style.textContent=`
    #${VIEW_ID}.scb-codebase-view{margin-top:16px;padding:0;min-width:0}
    .scb-shell.scb-sulandra-it-embedded{position:relative!important;inset:auto!important;z-index:1!important;width:100%!important;height:calc(100vh - 220px)!important;min-height:680px!important;border:1px solid rgba(103,232,249,.16);border-radius:14px;overflow:hidden;box-shadow:0 18px 48px rgba(2,8,18,.18)}
    .scb-shell.scb-sulandra-it-embedded[hidden]{display:none!important}
    .scb-shell.scb-sulandra-it-embedded:fullscreen,.scb-shell.scb-sulandra-it-embedded:-webkit-full-screen{width:100vw!important;height:100vh!important;min-height:100vh!important;border-radius:0!important;border:0!important}
    #itwsSulandraCodebaseButton{display:none!important}
    @media(max-width:900px){.scb-shell.scb-sulandra-it-embedded{height:calc(100vh - 185px)!important;min-height:620px!important;border-radius:10px}}
  `;
  document.head.appendChild(style);
}

function ensureView(){
  let view=codebaseView();
  if(view)return view;
  const main=mainHost();
  if(!main)return null;
  view=document.createElement('section');
  view.id=VIEW_ID;
  view.className='view hidden scb-codebase-view';
  view.setAttribute('aria-label','Sulandra Codebase');
  main.appendChild(view);
  return view;
}

function ensureTab(){
  let tab=codebaseTab();
  if(tab)return tab;
  const tabs=tabsHost();
  if(!tabs)return null;
  tab=document.createElement('button');
  tab.id=TAB_ID;
  tab.type='button';
  tab.className='tab';
  tab.dataset.view=VIEW_ID;
  tab.textContent='Codebase';
  tab.title='Open Sulandra Codebase inside Sulandra IT';
  const agent=tabs.querySelector('.tab[data-view="agent"]');
  if(agent)agent.after(tab);else tabs.appendChild(tab);
  return tab;
}

function hideLegacyEntry(){
  const legacy=document.getElementById('itwsSulandraCodebaseButton');
  if(legacy){legacy.hidden=true;legacy.setAttribute('aria-hidden','true');legacy.tabIndex=-1}
}

function wireShell(workbench){
  if(!workbench||workbench.dataset.itSolutionsHost==='1')return;
  workbench.dataset.itSolutionsHost='1';
  workbench.classList.add('scb-sulandra-it-embedded');
  const full=workbench.querySelector('#scbFullscreen');
  if(full)full.addEventListener('click',event=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    if(document.fullscreenElement||document.webkitFullscreenElement)return;
    const request=workbench.requestFullscreen||workbench.webkitRequestFullscreen;
    const promise=request?.call(workbench);
    if(promise?.catch)promise.catch(()=>{});
  },true);
  const exit=workbench.querySelector('#scbExit');
  if(exit){
    exit.textContent='Back to IT';
    exit.addEventListener('click',event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      activateExistingView('agent');
    },true);
  }
}

function moveShellIntoView(){
  const workbench=codebaseShell(),view=ensureView();
  if(!workbench||!view)return false;
  wireShell(workbench);
  if(workbench.parentElement!==view)view.appendChild(workbench);
  hideLegacyEntry();
  return true;
}

function hideCodebase(){
  const workbench=codebaseShell();
  if(workbench)workbench.hidden=true;
  document.body.classList.remove('scb-open');
}

function selectTabAndView(tab,view){
  const tabs=tabsHost();
  if(tabs)tabs.querySelectorAll('.tab').forEach(node=>node.classList.toggle('active',node===tab));
  const main=mainHost();
  if(main)main.querySelectorAll(':scope > .view').forEach(node=>node.classList.toggle('hidden',node!==view));
}

function openCodebase(){
  const tab=ensureTab(),view=ensureView();
  if(!tab||!view)return false;
  moveShellIntoView();
  selectTabAndView(tab,view);
  const workbench=codebaseShell();
  if(!workbench)return false;
  workbench.hidden=false;
  document.body.classList.remove('scb-open');
  window.SulandraCodebase?.refresh?.();
  window.SulandraCodebaseNativeGrid?.render?.();
  window.dispatchEvent(new CustomEvent('sulandra:workspace-layout-resized'));
  return true;
}

function activateExistingView(viewId){
  const tabs=tabsHost();
  const tab=tabs?.querySelector(`.tab[data-view="${CSS.escape(viewId)}"]`);
  const view=document.getElementById(viewId);
  hideCodebase();
  if(tab&&view){
    selectTabAndView(tab,view);
    return true;
  }
  return false;
}

function bindTabs(){
  const tabs=tabsHost();
  if(!tabs||tabsBound)return false;
  tabsBound=true;
  tabs.addEventListener('click',event=>{
    const tab=event.target instanceof Element?event.target.closest('.tab'):null;
    if(!tab||!tabs.contains(tab))return;
    if(tab.id===TAB_ID||tab.dataset.view===VIEW_ID){
      event.preventDefault();
      event.stopImmediatePropagation();
      openCodebase();
      return;
    }
    hideCodebase();
  },true);
  return true;
}

function overridePublicApi(){
  if(apiOverridden||!window.SulandraCodebase)return;
  apiOverridden=true;
  const api=window.SulandraCodebase;
  api.open=openCodebase;
  api.openInsideIt=openCodebase;
  api.closeToIt=()=>activateExistingView('agent');
}

function enforceHostBoundary(){
  installStyle();
  ensureTab();
  ensureView();
  bindTabs();
  moveShellIntoView();
  overridePublicApi();
  hideLegacyEntry();

  const tab=codebaseTab(),view=codebaseView(),workbench=codebaseShell();
  const codebaseSelected=Boolean(tab?.classList.contains('active')&&!view?.classList.contains('hidden'));
  if(workbench&&!codebaseSelected){
    workbench.hidden=true;
    document.body.classList.remove('scb-open');
  }
}

function bootHost(){
  enforceHostBoundary();
  hostObserver?.disconnect();
  hostObserver=new MutationObserver(()=>enforceHostBoundary());
  hostObserver.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pageshow',enforceHostBoundary);
  document.addEventListener('fullscreenchange',()=>{
    if(!document.fullscreenElement)enforceHostBoundary();
  });
  document.addEventListener('webkitfullscreenchange',()=>{
    if(!document.webkitFullscreenElement)enforceHostBoundary();
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootHost,{once:true});
else queueMicrotask(bootHost);
})();
