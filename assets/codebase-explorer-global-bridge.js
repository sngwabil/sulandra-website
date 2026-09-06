/* CODEBASE_EXPLORER_GLOBAL_BRIDGE_V1
 * Exposes Codebase's lexical workspace state to late-loaded Explorer runtimes
 * and gives dynamically rendered folder rows durable project-relative paths.
 * CODEBASE_EXPLORER_FILTER_V1 keeps the Explorer filter wired across rerenders.
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

const explorerFilterInput=()=>document.querySelector('#sidebar-explorer .sidebar-filter input');
const filterHaystack=row=>[
  row?.textContent||'',
  row?.title||'',
  row?.dataset?.codebasePath||''
].join(' ').toLocaleLowerCase();
const rememberCollapsed=group=>{
  if(!group||group.dataset.codebaseFilterCollapsed!==undefined)return;
  group.dataset.codebaseFilterCollapsed=group.classList.contains('collapsed')?'1':'0';
};
const restoreCollapsed=group=>{
  if(!group||group.dataset.codebaseFilterCollapsed===undefined)return;
  group.classList.toggle('collapsed',group.dataset.codebaseFilterCollapsed==='1');
  delete group.dataset.codebaseFilterCollapsed;
};
const applyExplorerFilter=()=>{
  const root=document.getElementById('dynamic-file-list');
  const input=explorerFilterInput();
  if(!root||!input)return 0;
  const query=String(input.value||'').trim().toLocaleLowerCase();
  root.dataset.codebaseExplorerFilter=query;
  let matches=0;

  const visit=node=>{
    if(!(node instanceof HTMLElement))return false;
    if(node.classList.contains('folder-group')){
      const row=node.firstElementChild;
      const contents=Array.from(node.children).find(child=>child.classList?.contains('folder-contents'))||null;
      if(!query){
        node.hidden=false;
        restoreCollapsed(node);
        for(const child of Array.from(contents?.children||[]))visit(child);
        return true;
      }
      rememberCollapsed(node);
      const selfMatch=filterHaystack(row).includes(query);
      if(selfMatch)matches+=1;
      let descendantMatch=false;
      for(const child of Array.from(contents?.children||[])){
        if(visit(child))descendantMatch=true;
      }
      const visible=selfMatch||descendantMatch;
      node.hidden=!visible;
      if(visible)node.classList.remove('collapsed');
      return visible;
    }
    if(node.classList.contains('file-item')){
      const visible=!query||filterHaystack(node).includes(query);
      node.hidden=!visible;
      if(query&&visible)matches+=1;
      return visible;
    }
    return false;
  };

  for(const child of Array.from(root.children))visit(child);
  input.setAttribute('aria-label','Filter project files and folders');
  input.dataset.codebaseFilterMatches=String(matches);
  return matches;
};
const installExplorerFilter=()=>{
  const input=explorerFilterInput();
  if(!input)return false;
  if(input.dataset.codebaseExplorerFilterBound==='true'){
    applyExplorerFilter();
    return true;
  }
  input.dataset.codebaseExplorerFilterBound='true';
  input.addEventListener('input',applyExplorerFilter);
  input.addEventListener('search',applyExplorerFilter);
  input.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    event.preventDefault();
    input.value='';
    applyExplorerFilter();
    input.focus();
  });
  applyExplorerFilter();
  return true;
};
if(!window.__CODEBASE_EXPLORER_FILTER_SHORTCUT_V1__){
  window.__CODEBASE_EXPLORER_FILTER_SHORTCUT_V1__=true;
  document.addEventListener('keydown',event=>{
    if(!(event.metaKey||event.ctrlKey)||String(event.key).toLowerCase()!=='p')return;
    const input=explorerFilterInput();
    if(!input)return;
    event.preventDefault();
    try{window.switchSidebar?.('explorer')}catch{}
    input.focus();
    input.select();
  },true);
}
window.SulandraCodebaseExplorerFilter={apply:applyExplorerFilter,focus:()=>explorerFilterInput()?.focus()};

const installFolderPathBridge=()=>{
  const root=document.getElementById('dynamic-file-list');
  if(!root)return false;
  labelFolderRows();
  installExplorerFilter();
  if(root.dataset.codebaseFolderPathBridge==='true')return true;
  root.dataset.codebaseFolderPathBridge='true';
  const observer=new MutationObserver(()=>{
    const changed=labelFolderRows();
    installExplorerFilter();
    applyExplorerFilter();
    if(!changed)return;
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
