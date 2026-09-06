/* CODEBASE_EXPLORER_GLOBAL_BRIDGE_V1
 * Exposes Codebase's lexical workspace state to late-loaded Explorer runtimes
 * and gives dynamically rendered folder rows durable project-relative paths.
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

const folderName=row=>String(row?.lastElementChild?.textContent||'').replace(/^\s*📁\s*/u,'').trim();
const folderPath=row=>{
  if(!row)return '';
  const existing=String(row.dataset?.codebasePath||row.title||'').trim();
  if(existing)return existing;
  const group=row.parentElement?.classList?.contains('folder-group')&&row.parentElement.firstElementChild===row?row.parentElement:null;
  if(!group)return '';
  const parentGroup=group.parentElement?.closest?.('.folder-group')||null;
  const parentPath=parentGroup?folderPath(parentGroup.firstElementChild):'';
  const name=folderName(row);
  return [parentPath,name].filter(Boolean).join('/');
};
const labelFolderRows=()=>{
  const root=document.getElementById('dynamic-file-list');
  if(!root)return false;
  let changed=false;
  root.querySelectorAll('.folder-group').forEach(group=>{
    const row=group.firstElementChild;
    if(!row?.classList?.contains('file-item'))return;
    const path=folderPath(row);
    if(!path)return;
    if(row.dataset.codebasePath!==path){row.dataset.codebasePath=path;changed=true}
    if(row.title!==path){row.title=path;changed=true}
  });
  return changed;
};
const installFolderPathBridge=()=>{
  const root=document.getElementById('dynamic-file-list');
  if(!root)return false;
  labelFolderRows();
  if(root.dataset.codebaseFolderPathBridge==='true')return true;
  root.dataset.codebaseFolderPathBridge='true';
  const observer=new MutationObserver(()=>{
    if(!labelFolderRows())return;
    // Force one child-list pulse after path labels are present so any Explorer
    // runtime that observed the original render gets a second binding pass.
    const pulse=document.createComment('codebase-folder-paths-ready');
    root.appendChild(pulse);pulse.remove();
  });
  observer.observe(root,{childList:true,subtree:true});
  return true;
};
const waitForExplorerRoot=attempt=>{
  if(installFolderPathBridge())return;
  if(attempt<120)setTimeout(()=>waitForExplorerRoot(attempt+1),50);
};
waitForExplorerRoot(0);
})();
