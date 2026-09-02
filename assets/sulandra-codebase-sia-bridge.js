/* SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V1 */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V1__)return;
window.__SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V1__=true;

let homeParent=null;
let homeNext=null;

const shell=()=>document.getElementById('sulandraCodebase');
const sia=()=>document.getElementById('sia-copilot-root');

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
  if(!workbench||!root)return;
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

for(const eventName of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(eventName,sync);
window.addEventListener('pageshow',sync);

// Ask SIA is injected as a global publication layer after the Codebase runtime.
// Observe only until both roots exist, then keep the bridge event-driven.
const observer=new MutationObserver(()=>{
  if(!shell()||!sia())return;
  sync();
  observer.disconnect();
});
observer.observe(document.documentElement,{childList:true,subtree:true});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});
else queueMicrotask(sync);
})();
