/* SULANDRA_CODEBASE_TOP_LEVEL_NAV_V4
 * Compatibility publication marker: SULANDRA_CODEBASE_TOP_LEVEL_NAV_V3
 * Compatibility publication marker: SULANDRA_CODEBASE_TOP_LEVEL_NAV_V2
 * Compatibility publication marker: SULANDRA_CODEBASE_TOP_LEVEL_NAV_V1
 *
 * Sulandra IT owns the page. Codebase is a first-class Sulandra IT tab/view,
 * never a cloned Engineering Terminal navigation item and never the default
 * Sulandra IT surface. Engineering Workspace remains a sibling tool.
 */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_TOP_LEVEL_NAV_V4__)return;
window.__SULANDRA_CODEBASE_TOP_LEVEL_NAV_V4__=true;
window.__SULANDRA_CODEBASE_TOP_LEVEL_NAV_V3__=true;
window.__SULANDRA_CODEBASE_TOP_LEVEL_NAV_V2__=true;

const ENTRY_ID='itwsSulandraCodebaseNav';
const VIEW_ID='itwsSulandraCodebaseView';
const LEGACY_ID='itwsSulandraCodebaseButton';
const EDITOR_FILL_STYLE_ID='scbEditorFillGuard';
const HOST_STYLE_ID='scbItSolutionsTabHostStyle';
let observer=null;
let apiOverridden=false;

const tabsHost=()=>document.querySelector('main.shell > .tabs')||document.querySelector('main .tabs')||document.querySelector('.tabs');
const mainHost=()=>document.querySelector('main.shell')||document.querySelector('main');
const codebaseShell=()=>document.getElementById('sulandraCodebase');
const codebaseTab=()=>document.getElementById(ENTRY_ID);
const codebaseView=()=>document.getElementById(VIEW_ID);

function installEditorFillGuard(){
 if(document.getElementById(EDITOR_FILL_STYLE_ID))return;
 const style=document.createElement('style');
 style.id=EDITOR_FILL_STYLE_ID;
 style.textContent=`
.scb-shell[data-prototype="v19"] .scb-native-tabs{grid-row:1!important}
.scb-shell[data-prototype="v19"] .scb-editor-toolbar{grid-row:2!important}
.scb-shell[data-prototype="v19"] .scb-commit-bar{grid-row:3!important}
.scb-shell[data-prototype="v19"] .scb-editor-stack{grid-row:4!important;height:auto!important;align-self:stretch!important;min-height:0!important}
`;
 document.head.appendChild(style);
}

function installHostStyle(){
 if(document.getElementById(HOST_STYLE_ID))return;
 const style=document.createElement('style');
 style.id=HOST_STYLE_ID;
 style.textContent=`
#${VIEW_ID}.scb-codebase-view{margin-top:16px;padding:0;min-width:0}
.scb-shell.scb-sulandra-it-embedded{position:relative!important;inset:auto!important;z-index:1!important;width:100%!important;height:calc(100vh - 220px)!important;min-height:680px!important;border:1px solid rgba(103,232,249,.16);border-radius:14px;overflow:hidden;box-shadow:0 18px 48px rgba(2,8,18,.18)}
.scb-shell.scb-sulandra-it-embedded[hidden]{display:none!important}
.scb-shell.scb-sulandra-it-embedded:fullscreen,.scb-shell.scb-sulandra-it-embedded:-webkit-full-screen{width:100vw!important;height:100vh!important;min-height:100vh!important;border-radius:0!important;border:0!important}
#${LEGACY_ID}{display:none!important}
@media(max-width:900px){.scb-shell.scb-sulandra-it-embedded{height:calc(100vh - 185px)!important;min-height:620px!important;border-radius:10px}}
`;
 document.head.appendChild(style);
}

function suppressLegacy(){
 const legacy=document.getElementById(LEGACY_ID);
 if(!legacy)return false;
 legacy.hidden=true;
 legacy.setAttribute('aria-hidden','true');
 legacy.setAttribute('tabindex','-1');
 legacy.style.setProperty('display','none','important');
 return true;
}

function removeOldClonedEntry(){
 const current=document.getElementById(ENTRY_ID);
 if(!current)return;
 const tabs=tabsHost();
 if(tabs?.contains(current)&&current.classList.contains('tab'))return;
 current.remove();
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
 removeOldClonedEntry();
 let tab=codebaseTab();
 if(tab)return tab;
 const tabs=tabsHost();
 if(!tabs)return null;
 tab=document.createElement('button');
 tab.id=ENTRY_ID;
 tab.type='button';
 tab.className='tab';
 tab.dataset.view=VIEW_ID;
 tab.textContent='Codebase';
 tab.title='Open Sulandra Codebase inside Sulandra IT';
 tab.setAttribute('aria-label','Codebase');
 const agent=tabs.querySelector('.tab[data-view="agent"]');
 if(agent)agent.after(tab);else tabs.appendChild(tab);
 return tab;
}

function wireShell(workbench){
 if(!workbench)return;
 workbench.classList.add('scb-sulandra-it-embedded');
 if(workbench.dataset.itSolutionsHost==='1')return;
 workbench.dataset.itSolutionsHost='1';
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
   const agent=tabsHost()?.querySelector('.tab[data-view="agent"]');
   if(agent)agent.click();else hideCodebase();
  },true);
 }
}

function moveShellIntoView(){
 const workbench=codebaseShell(),view=ensureView();
 if(!workbench||!view)return false;
 wireShell(workbench);
 if(workbench.parentElement!==view)view.appendChild(workbench);
 suppressLegacy();
 return true;
}

function hideCodebase(){
 const workbench=codebaseShell();
 if(workbench)workbench.hidden=true;
 document.body.classList.remove('scb-open');
}

function selectCodebaseView(){
 const tab=ensureTab(),view=ensureView(),tabs=tabsHost(),main=mainHost();
 if(!tab||!view||!tabs||!main)return false;
 tabs.querySelectorAll('.tab').forEach(node=>node.classList.toggle('active',node===tab));
 main.querySelectorAll(':scope > .view').forEach(node=>node.classList.toggle('hidden',node!==view));
 return true;
}

function openInsideIt(){
 installEditorFillGuard();
 installHostStyle();
 ensureTab();
 ensureView();
 moveShellIntoView();
 if(!selectCodebaseView())return false;
 const workbench=codebaseShell();
 if(!workbench)return false;
 workbench.hidden=false;
 document.body.classList.remove('scb-open');
 window.SulandraCodebase?.refresh?.();
 window.SulandraCodebaseNativeGrid?.render?.();
 window.dispatchEvent(new CustomEvent('sulandra:workspace-layout-resized'));
 return true;
}

function bindTabHost(){
 const tabs=tabsHost();
 if(!tabs||tabs.dataset.scbCodebaseHost==='1')return false;
 tabs.dataset.scbCodebaseHost='1';
 tabs.addEventListener('click',event=>{
  const tab=event.target instanceof Element?event.target.closest('.tab'):null;
  if(!tab||!tabs.contains(tab))return;
  if(tab.id===ENTRY_ID||tab.dataset.view===VIEW_ID){
   event.preventDefault();
   event.stopImmediatePropagation();
   openInsideIt();
   return;
  }
  hideCodebase();
 },true);
 return true;
}

function overridePublicOpen(){
 const api=window.SulandraCodebase;
 if(!api||apiOverridden)return;
 apiOverridden=true;
 api.open=openInsideIt;
 api.openInsideIt=openInsideIt;
}

function enforceDefaultHost(){
 const workbench=codebaseShell(),tab=codebaseTab(),view=codebaseView();
 if(!workbench)return;
 moveShellIntoView();
 const selected=Boolean(tab?.classList.contains('active')&&!view?.classList.contains('hidden'));
 if(!selected)hideCodebase();
}

function install(){
 installEditorFillGuard();
 installHostStyle();
 suppressLegacy();
 ensureView();
 ensureTab();
 bindTabHost();
 moveShellIntoView();
 overridePublicOpen();
 enforceDefaultHost();
 return Boolean(codebaseTab()&&codebaseView());
}

function finishWhenReady(){
 const installed=install();
 suppressLegacy();
 return installed;
}

installEditorFillGuard();
installHostStyle();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',finishWhenReady,{once:true});else finishWhenReady();
observer=new MutationObserver(()=>finishWhenReady());
observer.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(()=>{suppressLegacy();enforceDefaultHost();},30000);
window.addEventListener('pageshow',()=>{finishWhenReady();enforceDefaultHost()});
window.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)enforceDefaultHost()});
window.addEventListener('webkitfullscreenchange',()=>{if(!document.webkitFullscreenElement)enforceDefaultHost()});
window.SulandraCodebaseNav={install:finishWhenReady,open:openInsideIt};
})();
