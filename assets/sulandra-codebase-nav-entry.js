/* SULANDRA_CODEBASE_IT_VISIBLE_NAV_V7
 * SULANDRA_CODEBASE_STANDALONE_LAUNCHER_V1
 * Compatibility markers: SULANDRA_CODEBASE_TOP_LEVEL_NAV_V4,
 * SULANDRA_CODEBASE_TOP_LEVEL_NAV_V3, SULANDRA_CODEBASE_TOP_LEVEL_NAV_V2.
 * Compatibility contract: Sulandra IT owns the page.
 *
 * Codebase is a separate Sulandra software product linked from Sulandra IT.
 * Sulandra IT never renders Codebase inside its own workspace. The visible
 * Codebase launcher opens finalized /Codebase.html in its own browser tab.
 */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_IT_VISIBLE_NAV_V7__)return;
window.__SULANDRA_CODEBASE_IT_VISIBLE_NAV_V7__=true;
window.__SULANDRA_CODEBASE_TOP_LEVEL_NAV_V4__=true;
window.__SULANDRA_CODEBASE_TOP_LEVEL_NAV_V3__=true;
window.__SULANDRA_CODEBASE_TOP_LEVEL_NAV_V2__=true;

const COMPAT_ENTRY_ID='itwsSulandraCodebaseNav';
const VISIBLE_ENTRY_ID='itwsSulandraCodebaseVisibleNav';
const LEGACY_ID='itwsSulandraCodebaseButton';
const LEGACY_VIEW_ID='itwsSulandraCodebaseView';
const LEGACY_FRAME_ID='itwsSulandraCodebaseFrame';
const CODEBASE_URL='/Codebase.html?v=20260903-standalone-2';
const WINDOW_NAME='sulandra-codebase';
let installQueued=false;
let apiOverridden=false;

const hiddenTabsHost=()=>document.querySelector('.itws-content > .tabs')||document.querySelector('main.shell > .tabs')||document.querySelector('main .tabs')||document.querySelector('.tabs');
const visibleNav=()=>document.querySelector('.itws-sidebar .itws-nav');
const visibleCodebaseButton=()=>document.getElementById(VISIBLE_ENTRY_ID);

function suppressEmbeddedCodebase(){
 const embeddedView=document.getElementById(LEGACY_VIEW_ID);
 if(embeddedView)embeddedView.remove();
 const embeddedFrame=document.getElementById(LEGACY_FRAME_ID);
 if(embeddedFrame)embeddedFrame.remove();
 const workbench=document.getElementById('sulandraCodebase');
 if(workbench){
  workbench.hidden=true;
  workbench.setAttribute('aria-hidden','true');
  workbench.style.setProperty('display','none','important');
 }
 const legacy=document.getElementById(LEGACY_ID);
 if(legacy){
  legacy.hidden=true;
  legacy.setAttribute('aria-hidden','true');
  legacy.tabIndex=-1;
  legacy.style.setProperty('display','none','important');
 }
 document.querySelectorAll('[data-scb-nav-source="engineering"],[data-scb-codebase-clone="engineering"]').forEach(node=>{
  node.hidden=true;
  node.setAttribute('aria-hidden','true');
  if(node instanceof HTMLElement)node.style.setProperty('display','none','important');
 });
 document.body?.classList.remove('scb-open');
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
  tab.textContent='Codebase';
  tab.setAttribute('aria-hidden','true');
  tab.tabIndex=-1;
  const agent=tabs.querySelector('.tab[data-view="agent"]');
  if(agent)agent.after(tab);else tabs.appendChild(tab);
 }
 tab.hidden=true;
 if(tab.dataset.scbStandaloneBound!=='1'){
  tab.dataset.scbStandaloneBound='1';
  tab.addEventListener('click',event=>{
   event.preventDefault();
   event.stopImmediatePropagation();
   openStandalone();
  },true);
 }
 return tab;
}

function openStandalone(){
 suppressEmbeddedCodebase();
 const opened=window.open(CODEBASE_URL,WINDOW_NAME);
 if(opened){
  try{opened.focus()}catch{}
  return true;
 }
 // Popup blocking fallback: navigate this tab. Exit Codebase then returns to IT.
 window.location.assign(CODEBASE_URL);
 return true;
}

function ensureVisibleNav(){
 const nav=visibleNav();
 if(!nav)return null;
 let button=visibleCodebaseButton();
 if(!button){
  button=document.createElement('button');
  button.id=VISIBLE_ENTRY_ID;
  button.type='button';
  button.dataset.scbLauncher='codebase';
  button.textContent='Codebase';
  button.title='Open Sulandra Codebase in its own browser tab';
  button.setAttribute('aria-label','Open Sulandra Codebase in a new browser tab');
  const agent=nav.querySelector('[data-itws-view="agent"]');
  if(agent)agent.after(button);else nav.prepend(button);
 }
 if(button.dataset.scbStandaloneBound!=='1'){
  button.dataset.scbStandaloneBound='1';
  button.addEventListener('click',event=>{
   event.preventDefault();
   event.stopImmediatePropagation();
   openStandalone();
   document.querySelector('.itws-sidebar')?.classList.remove('open');
  },true);
 }
 return button;
}

function bindHiddenTabs(){
 const tabs=hiddenTabsHost();
 if(!tabs||tabs.dataset.scbStandaloneHost==='1')return false;
 tabs.dataset.scbStandaloneHost='1';
 tabs.addEventListener('click',event=>{
  const tab=event.target instanceof Element?event.target.closest('.tab'):null;
  if(!tab||!tabs.contains(tab)||tab.id!==COMPAT_ENTRY_ID)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openStandalone();
 },true);
 return true;
}

function returnToAgent(){
 suppressEmbeddedCodebase();
 const agent=visibleNav()?.querySelector('[data-itws-view="agent"]');
 if(agent)agent.click();
}

function overridePublicOpen(){
 const api=window.SulandraCodebase;
 if(!api)return;
 if(!apiOverridden||api.open!==openStandalone){
  apiOverridden=true;
  api.open=openStandalone;
  api.openStandalone=openStandalone;
 }
}

function install(){
 suppressEmbeddedCodebase();
 ensureCompatibilityTab();
 ensureVisibleNav();
 bindHiddenTabs();
 overridePublicOpen();
 return Boolean(visibleCodebaseButton());
}

function queueInstall(){
 if(installQueued)return;
 installQueued=true;
 requestAnimationFrame(()=>{installQueued=false;install()});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
new MutationObserver(queueInstall).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('pageshow',install);
window.SulandraCodebaseNav={install,open:openStandalone,openStandalone,backToAgent:returnToAgent,CODEBASE_URL};
})();