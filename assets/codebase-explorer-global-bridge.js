/* CODEBASE_EXPLORER_GLOBAL_BRIDGE_V1
 * Exposes Codebase's lexical workspace state to late-loaded Explorer runtimes
 * and gives dynamically rendered Explorer rows durable project-relative paths.
 * CODEBASE_EXPLORER_FILTER_V2 keeps filtering accurate across rerenders/input replacement.
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

const rowName=row=>String(row?.lastElementChild?.textContent||'').replace(/^\s*📁\s*/u,'').trim();
const folderPath=row=>{
  if(!row)return '';
  const group=row.parentElement?.classList?.contains('folder-group')&&row.parentElement.firstElementChild===row?row.parentElement:null;
  if(!group)return '';
  const parentGroup=group.parentElement?.closest?.('.folder-group')||null;
  const parentPath=parentGroup?folderPath(parentGroup.firstElementChild):'';
  const name=rowName(row);
  return [parentPath,name].filter(Boolean).join('/');
};
const filePath=row=>{
  if(!row)return '';
  const parentGroup=row.parentElement?.closest?.('.folder-group')||null;
  const parentPath=parentGroup?folderPath(parentGroup.firstElementChild):'';
  const name=rowName(row);
  return [parentPath,name].filter(Boolean).join('/');
};
const labelExplorerRows=()=>{
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
  root.querySelectorAll('.file-item').forEach(row=>{
    const isFolderRow=row.parentElement?.classList?.contains('folder-group')&&row.parentElement.firstElementChild===row;
    if(isFolderRow)return;
    const path=filePath(row);
    if(!path)return;
    if(row.dataset.codebasePath!==path){row.dataset.codebasePath=path;changed=true}
    // Project file rows can arrive with absolute or stale titles from older runtimes.
    // Normalize them to the active project's relative path so a project-name query
    // cannot accidentally match every file in the tree.
    if(row.title!==path){row.title=path;changed=true}
  });
  return changed;
};

const explorerFilterInput=()=>document.querySelector('#sidebar-explorer input[placeholder*="Filter files"], #sidebar-explorer .sidebar-filter input');
const normalizeSearch=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase();
const searchTerms=value=>normalizeSearch(value).split(/\s+/).filter(Boolean);
const filterHaystack=row=>normalizeSearch([rowName(row),row?.dataset?.codebasePath||''].filter(Boolean).join(' '));
const rowMatches=(row,terms)=>!terms.length||terms.every(term=>filterHaystack(row).includes(term));
const rememberCollapsed=group=>{
  if(!group||group.dataset.codebaseFilterCollapsed!==undefined)return;
  group.dataset.codebaseFilterCollapsed=group.classList.contains('collapsed')?'1':'0';
};
const restoreCollapsed=group=>{
  if(!group||group.dataset.codebaseFilterCollapsed===undefined)return;
  group.classList.toggle('collapsed',group.dataset.codebaseFilterCollapsed==='1');
  delete group.dataset.codebaseFilterCollapsed;
};
const setFilterVisible=(node,visible)=>{
  if(!node)return;
  node.hidden=!visible;
  if(visible)node.style.removeProperty('display');
  else node.style.setProperty('display','none','important');
};
const applyExplorerFilter=()=>{
  const root=document.getElementById('dynamic-file-list');
  const input=explorerFilterInput();
  if(!root||!input)return 0;
  labelExplorerRows();
  const query=normalizeSearch(input.value);
  const terms=searchTerms(query);
  root.dataset.codebaseExplorerFilter=query;
  let matches=0;

  const visit=node=>{
    if(!(node instanceof HTMLElement))return false;
    if(node.classList.contains('folder-group')){
      const row=node.firstElementChild;
      const contents=Array.from(node.children).find(child=>child.classList?.contains('folder-contents'))||null;
      if(!terms.length){
        setFilterVisible(node,true);
        restoreCollapsed(node);
        for(const child of Array.from(contents?.children||[]))visit(child);
        return true;
      }
      rememberCollapsed(node);
      const selfMatch=rowMatches(row,terms);
      if(selfMatch)matches+=1;
      let descendantMatch=false;
      for(const child of Array.from(contents?.children||[])){
        if(visit(child))descendantMatch=true;
      }
      const visible=selfMatch||descendantMatch;
      setFilterVisible(node,visible);
      if(visible)node.classList.remove('collapsed');
      return visible;
    }
    if(node.classList.contains('file-item')){
      const visible=rowMatches(node,terms);
      setFilterVisible(node,visible);
      if(terms.length&&visible)matches+=1;
      return visible;
    }
    return false;
  };

  for(const child of Array.from(root.children))visit(child);
  input.setAttribute('aria-label','Filter project files and folders');
  input.dataset.codebaseFilterMatches=String(matches);
  return matches;
};
const isExplorerFilterInput=target=>target instanceof HTMLInputElement&&target===explorerFilterInput();
const installExplorerFilter=()=>{
  const input=explorerFilterInput();
  if(!input)return false;
  input.dataset.codebaseExplorerFilterBound='delegated-v2';
  applyExplorerFilter();
  return true;
};
if(!window.__CODEBASE_EXPLORER_FILTER_EVENTS_V2__){
  window.__CODEBASE_EXPLORER_FILTER_EVENTS_V2__=true;
  document.addEventListener('input',event=>{if(isExplorerFilterInput(event.target))applyExplorerFilter()},true);
  document.addEventListener('search',event=>{if(isExplorerFilterInput(event.target))applyExplorerFilter()},true);
  document.addEventListener('keydown',event=>{
    if(isExplorerFilterInput(event.target)&&event.key==='Escape'){
      event.preventDefault();
      event.target.value='';
      applyExplorerFilter();
      event.target.focus();
      return;
    }
    if(!(event.metaKey||event.ctrlKey)||String(event.key).toLowerCase()!=='p')return;
    const input=explorerFilterInput();
    if(!input)return;
    event.preventDefault();
    try{window.switchSidebar?.('explorer')}catch{}
    input.focus();
    input.select();
  },true);
}
window.SulandraCodebaseExplorerFilter={
  apply:applyExplorerFilter,
  focus:()=>explorerFilterInput()?.focus(),
  matches:(query,name,path='')=>{
    const terms=searchTerms(query);
    const haystack=normalizeSearch([name,path].filter(Boolean).join(' '));
    return !terms.length||terms.every(term=>haystack.includes(term));
  }
};

const installFolderPathBridge=()=>{
  const root=document.getElementById('dynamic-file-list');
  if(!root)return false;
  labelExplorerRows();
  installExplorerFilter();
  if(root.dataset.codebaseFolderPathBridge==='true')return true;
  root.dataset.codebaseFolderPathBridge='true';
  const observer=new MutationObserver(()=>{
    const changed=labelExplorerRows();
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
