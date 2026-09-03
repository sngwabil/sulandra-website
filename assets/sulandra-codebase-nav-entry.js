/* SULANDRA_CODEBASE_IT_VISIBLE_NAV_V5
 * Compatibility publication markers: SULANDRA_CODEBASE_TOP_LEVEL_NAV_V4,
 * SULANDRA_CODEBASE_TOP_LEVEL_NAV_V3, SULANDRA_CODEBASE_TOP_LEVEL_NAV_V2.
 * Compatibility contract: Sulandra IT owns the page.
 *
 * Sulandra IT owns the application shell. Codebase is a first-class Sulandra IT
 * view exposed directly in the visible Sulandra IT navigation immediately after
 * IT Agent. It is not cloned from any Engineering navigation surface.
 */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_IT_VISIBLE_NAV_V5__)return;
window.__SULANDRA_CODEBASE_IT_VISIBLE_NAV_V5__=true;
window.__SULANDRA_CODEBASE_TOP_LEVEL_NAV_V4__=true;
window.__SULANDRA_CODEBASE_TOP_LEVEL_NAV_V3__=true;
window.__SULANDRA_CODEBASE_TOP_LEVEL_NAV_V2__=true;

const COMPAT_ENTRY_ID='itwsSulandraCodebaseNav';
const VISIBLE_ENTRY_ID='itwsSulandraCodebaseVisibleNav';
const VIEW_ID='itwsSulandraCodebaseView';
const LEGACY_ID='itwsSulandraCodebaseButton';
const EDITOR_FILL_STYLE_ID='scbEditorFillGuard';
const HOST_STYLE_ID='scbItSolutionsTabHostStyle';
let apiOverridden=false;
let installQueued=false;

const hiddenTabsHost=()=>document.querySelector('.itws-content > .tabs')||document.querySelector('main.shell > .tabs')||document.querySelector('main .tabs')||document.querySelector('.tabs');
const mainHost=()=>document.querySelector('main.shell')||document.querySelector('main');
const contentHost=()=>document.querySelector('.itws-content')||mainHost();
const visibleNav=()=>document.querySelector('.itws-sidebar .itws-nav');
const codebaseShell=()=>document.getElementById('sulandraCodebase');
const codebaseView=()=>document.getElementById(VIEW_ID);
const visibleCodebaseButton=()=>document.getElementById(VISIBLE_ENTRY_ID);

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
#${VIEW_ID}.scb-codebase-view{margin:0!important;padding:0!important;min-width:0!important;min-height:0!important;width:100%!important;height:100%!important;overflow:hidden!important}
body.it-chatgpt-workspace .itws-content>#${VIEW_ID}.scb-codebase-view{height:100%!important;max-height:100%!important}
.scb-shell.scb-sulandra-it-embedded{position:relative!important;inset:auto!important;z-index:1!important;width:100%!important;height:100%!important;min-height:0!important;border:0!important;border-radius:0!important;overflow:hidden!important;box-shadow:none!important}
.scb-shell.scb-sulandra-it-embedded[hidden]{display:none!important}
.scb-shell.scb-sulandra-it-embedded:fullscreen,.scb-shell.scb-sulandra-it-embedded:-webkit-full-screen{width:100vw!important;height:100vh!important;min-height:100vh!important;border-radius:0!important;border:0!important}
#${LEGACY_ID}{display:none!important}
#${COMPAT_ENTRY_ID}{display:none!important}
`;
 document.head.appendChild(style);
}

function suppressLegacy(){
 const legacy=document.getElementById(LEGACY_ID);
 if(legacy){
  legacy.hidden=true;
  legacy.setAttribute('aria-hidden','true');
  legacy.setAttribute('tabindex','-1');
  legacy.style.setProperty('display','none','important');
 }
 document.querySelectorAll('[data-scb-nav-source="engineering"],[data-scb-codebase-clone="engineering"]').forEach(node=>node.remove());
}

function ensureView(){
 let view=codebaseView();
 const host=contentHost();
 if(!host)return null;
 if(!view){
  view=document.createElement('section');
  view.id=VIEW_ID;
  view.className='view hidden scb-codebase-view';
  view.setAttribute('aria-label','Sulandra Codebase');
  host.appendChild(view);
 }else if(view.parentElement!==host){
  host.appendChild(view);
 }
 return view;
}

function ensureCompatibilityTab(){
 const tabs=hiddenTabsHost();
 if(!tabs)return null;
 let tab=document.getElementById(COMPAT_ENTRY_ID);
 if(!tab){
  tab=document.createElement('button');
  tab.id=COMPAT_ENTRY_ID;
  tab.type='button';
  tab.className='tab';
  tab.dataset.view=VIEW_ID;
  tab.textContent='Codebase';
  tab.setAttribute('aria-hidden','true');
  tab.tabIndex=-1;
  const agent=tabs.querySelector('.tab[data-view="agent"]');
  if(agent)agent.after(tab);else tabs.appendChild(tab);
 }
 tab.hidden=true;
 return tab;
}

function setVisibleNav(view){
 const nav=visibleNav();
 if(!nav)return;
 nav.querySelectorAll('[data-itws-view]').forEach(btn=>{
  const selected=view==='codebase'?btn.id===VISIBLE_ENTRY_ID:btn.dataset.itwsView===view;
  btn.classList.toggle('active',selected);
  if(selected)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');
 });
}

function ensureVisibleNav(){
 const nav=visibleNav();
 if(!nav)return null;
 let button=visibleCodebaseButton();
 if(!button){
  button=document.createElement('button');
  button.id=VISIBLE_ENTRY_ID;
  button.type='button';
  button.dataset.itwsView='codebase';
  button.textContent='Codebase';
  button.title='Open Sulandra Codebase';
  button.setAttribute('aria-label','Codebase');
  const agent=nav.querySelector('[data-itws-view="agent"]');
  if(agent)agent.after(button);else nav.prepend(button);
 }
 if(button.dataset.scbBound!=='1'){
  button.dataset.scbBound='1';
  button.addEventListener('click',event=>{
   event.preventDefault();
   event.stopImmediatePropagation();
   openInsideIt();
   document.querySelector('.itws-sidebar')?.classList.remove('open');
  },true);
 }
 if(nav.dataset.scbVisibleNavBound!=='1'){
  nav.dataset.scbVisibleNavBound='1';
  nav.addEventListener('click',event=>{
   const target=event.target instanceof Element?event.target.closest('[data-itws-view]'):null;
   if(!target||!nav.contains(target)||target.id===VISIBLE_ENTRY_ID)return;
   hideCodebase();
  },true);
 }
 return button;
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
   returnToAgent();
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
 const view=codebaseView();
 if(workbench)workbench.hidden=true;
 if(view)view.classList.add('hidden');
 document.body?.classList.remove('scb-open');
}

function activateOnlyView(view){
 const host=contentHost();
 if(!host)return;
 [...host.children].forEach(node=>{
  if(node instanceof HTMLElement&&node.classList.contains('view'))node.classList.toggle('hidden',node!==view);
 });
}

function selectCodebaseView(){
 const view=ensureView();
 const button=ensureVisibleNav();
 if(!view||!button)return false;
 const tabs=hiddenTabsHost();
 if(tabs)tabs.querySelectorAll('.tab').forEach(node=>node.classList.toggle('active',node.id===COMPAT_ENTRY_ID));
 activateOnlyView(view);
 setVisibleNav('codebase');
 return true;
}

function openInsideIt(){
 installEditorFillGuard();
 installHostStyle();
 ensureCompatibilityTab();
 ensureVisibleNav();
 if(!moveShellIntoView())return false;
 if(!selectCodebaseView())return false;
 const workbench=codebaseShell();
 if(!workbench)return false;
 workbench.hidden=false;
 document.body?.classList.remove('scb-open');
 window.SulandraCodebase?.refresh?.();
 window.SulandraCodebaseNativeGrid?.render?.();
 window.dispatchEvent(new CustomEvent('sulandra:workspace-layout-resized'));
 return true;
}

function returnToAgent(){
 hideCodebase();
 const visibleAgent=visibleNav()?.querySelector('[data-itws-view="agent"]');
 if(visibleAgent){
  visibleAgent.click();
  setVisibleNav('agent');
  return;
 }
 const hiddenAgent=hiddenTabsHost()?.querySelector('.tab[data-view="agent"]');
 hiddenAgent?.click();
 const agent=document.getElementById('agent');
 if(agent){activateOnlyView(agent);agent.classList.remove('hidden')}
}

function bindHiddenTabs(){
 const tabs=hiddenTabsHost();
 if(!tabs||tabs.dataset.scbCodebaseHost==='1')return false;
 tabs.dataset.scbCodebaseHost='1';
 tabs.addEventListener('click',event=>{
  const tab=event.target instanceof Element?event.target.closest('.tab'):null;
  if(!tab||!tabs.contains(tab))return;
  if(tab.id===COMPAT_ENTRY_ID||tab.dataset.view===VIEW_ID){
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
 if(!api)return;
 if(!apiOverridden||api.open!==openInsideIt){
  apiOverridden=true;
  api.open=openInsideIt;
  api.openInsideIt=openInsideIt;
 }
}

function enforceDefaultHost(){
 const workbench=codebaseShell();
 if(!workbench)return;
 moveShellIntoView();
 const selected=Boolean(visibleCodebaseButton()?.classList.contains('active')&&!codebaseView()?.classList.contains('hidden'));
 if(!selected)hideCodebase();
}

function install(){
 installEditorFillGuard();
 installHostStyle();
 suppressLegacy();
 ensureView();
 ensureCompatibilityTab();
 ensureVisibleNav();
 bindHiddenTabs();
 moveShellIntoView();
 overridePublicOpen();
 enforceDefaultHost();
 return Boolean(visibleCodebaseButton()&&codebaseView());
}

function queueInstall(){
 if(installQueued)return;
 installQueued=true;
 requestAnimationFrame(()=>{installQueued=false;install()});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
new MutationObserver(queueInstall).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('pageshow',()=>{install();enforceDefaultHost()});
window.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)enforceDefaultHost()});
window.addEventListener('webkitfullscreenchange',()=>{if(!document.webkitFullscreenElement)enforceDefaultHost()});
window.SulandraCodebaseNav={install,open:openInsideIt,backToAgent:returnToAgent};
})();
