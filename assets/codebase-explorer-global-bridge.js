/* CODEBASE_EXPLORER_GLOBAL_BRIDGE_V1
 * Exposes Codebase's lexical workspace state to late-loaded Explorer runtimes
 * without changing the existing editor/terminal implementation.
 */
(()=>{
'use strict';
if(window.__CODEBASE_EXPLORER_GLOBAL_BRIDGE_V1__)return;
window.__CODEBASE_EXPLORER_GLOBAL_BRIDGE_V1__=true;

const expose=(name,get,set)=>{
  try{
    const existing=Object.getOwnPropertyDescriptor(window,name);
    if(existing&&!existing.configurable)return;
    Object.defineProperty(window,name,{configurable:true,enumerable:false,get,set});
  }catch{}
};

try{expose('openTabs',()=>openTabs,value=>{openTabs=value})}catch{}
try{expose('activeEditors',()=>activeEditors,value=>{activeEditors=value})}catch{}
try{expose('activeTerminals',()=>activeTerminals,value=>{activeTerminals=value})}catch{}
try{
  if(typeof renderWorkspace==='function'){
    const existing=Object.getOwnPropertyDescriptor(window,'renderWorkspace');
    if(!existing||existing.configurable){
      Object.defineProperty(window,'renderWorkspace',{configurable:true,enumerable:false,get:()=>renderWorkspace});
    }
  }
}catch{}
})();
