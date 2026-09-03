/* SULANDRA_CODEBASE_TOP_LEVEL_NAV_V2
 * Compatibility publication marker: SULANDRA_CODEBASE_TOP_LEVEL_NAV_V1
 * Codebase is a sibling IT Solutions product, never a child of Engineering Terminal.
 * The legacy Engineering-footer launcher may still be created by the older Codebase
 * bootstrap, but it is hidden in place instead of removed so MutationObservers cannot
 * create/remove it forever and freeze the protected-session page.
 */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_TOP_LEVEL_NAV_V2__)return;
window.__SULANDRA_CODEBASE_TOP_LEVEL_NAV_V2__=true;

const ENTRY_ID='itwsSulandraCodebaseNav';
const LEGACY_ID='itwsSulandraCodebaseButton';
const labelOf=node=>String(node?.textContent||'').trim().replace(/\s+/g,' ');
const clickableSelector='button,a,[role="button"],[data-view],[data-route],[data-target]';
let observer=null;

function suppressLegacy(){
 const legacy=document.getElementById(LEGACY_ID);
 if(!legacy)return false;
 legacy.hidden=true;
 legacy.setAttribute('aria-hidden','true');
 legacy.setAttribute('tabindex','-1');
 legacy.style.setProperty('display','none','important');
 return true;
}

function engineeringEntry(){
 const candidates=[...document.querySelectorAll(clickableSelector)];
 return candidates.find(node=>{
   const label=labelOf(node);
   return label==='Engineering Terminal' ||
     node.matches?.('[data-view="engineering-terminal"],[data-route="engineering-terminal"],[data-target="engineering-terminal"]');
 })||null;
}

function entryHost(engineering){
 if(!engineering)return null;
 const row=engineering.closest('li,.nav-item,.sidebar-item,.it-nav-item,.itws-nav-item');
 return row||engineering;
}

function makeEntry(engineering){
 const source=entryHost(engineering);
 if(!source?.parentElement)return null;
 const clone=source.cloneNode(true);
 clone.id=ENTRY_ID;
 clone.removeAttribute?.('data-view');
 clone.removeAttribute?.('data-route');
 clone.removeAttribute?.('data-target');
 clone.querySelectorAll?.('[id]').forEach(n=>n.removeAttribute('id'));
 const action=clone.matches?.(clickableSelector)?clone:clone.querySelector?.(clickableSelector);
 if(!action)return null;
 action.id=ENTRY_ID+'Action';
 action.removeAttribute('href');
 action.removeAttribute('data-view');
 action.removeAttribute('data-route');
 action.removeAttribute('data-target');
 action.setAttribute('title','Open Sulandra Codebase');
 action.setAttribute('aria-label','Codebase');
 const textNodes=[...action.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE);
 if(textNodes.length){
   textNodes.forEach((n,i)=>{n.textContent=i===0?' Codebase':''});
 }else{
   const label=action.querySelector('span,strong,.label,.title');
   if(label)label.textContent='Codebase';else action.textContent='Codebase';
 }
 action.addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   if(typeof window.SulandraCodebase?.open==='function')window.SulandraCodebase.open();
 });
 source.insertAdjacentElement('afterend',clone);
 return clone;
}

function install(){
 suppressLegacy();
 if(document.getElementById(ENTRY_ID))return true;
 const engineering=engineeringEntry();
 if(!engineering)return false;
 return Boolean(makeEntry(engineering));
}

function finishWhenReady(){
 const installed=install();
 suppressLegacy();
 if(installed&&observer){observer.disconnect();observer=null;}
 return installed;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',finishWhenReady,{once:true});else finishWhenReady();
if(!document.getElementById(ENTRY_ID)){
 observer=new MutationObserver(()=>finishWhenReady());
 observer.observe(document.documentElement,{childList:true,subtree:true});
 setTimeout(()=>{observer?.disconnect();observer=null;suppressLegacy();},30000);
}
window.addEventListener('pageshow',()=>{finishWhenReady();suppressLegacy();});
window.SulandraCodebaseNav={install:finishWhenReady};
})();