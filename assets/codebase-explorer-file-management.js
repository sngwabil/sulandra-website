/* CODEBASE_EXPLORER_FILE_MANAGEMENT_V1
 * Rich Explorer file/folder management: right-click actions, searchable move
 * picker, rename/delete/duplicate, and drag/drop between project folders.
 */
(()=>{
'use strict';
if(window.__CODEBASE_EXPLORER_FILE_MANAGEMENT_V1__)return;
window.__CODEBASE_EXPLORER_FILE_MANAGEMENT_V1__=true;

const config=()=>typeof RAILWAY_CONFIG!=='undefined'?RAILWAY_CONFIG:(window.RAILWAY_CONFIG||{});
const gatewayBase=()=>String(config().WSS_URL||'').replace(/^wss:/i,'https:').replace(/^ws:/i,'http:').replace(/\/$/,'');
const token=()=>String(config().getToken?.()||'').trim();
const headers=json=>{const h={Accept:'application/json'};const t=token();if(t)h.Authorization='Bearer '+t;if(json)h['Content-Type']='application/json';return h};
const api=async(path,options={})=>{
  const response=await fetch(gatewayBase()+'/codebase'+path,{...options,headers:{...headers(options.body!==undefined),...(options.headers||{})}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.error||`Codebase Explorer request failed (${response.status})`);
  return payload;
};
const enc=value=>encodeURIComponent(String(value||''));
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const basename=value=>String(value||'').split('/').filter(Boolean).pop()||'';
const dirname=value=>{const parts=String(value||'').split('/').filter(Boolean);parts.pop();return parts.join('/')};
const joinPath=(base,name)=>[String(base||'').replace(/^\/+|\/+$/g,''),String(name||'').replace(/^\/+|\/+$/g,'')].filter(Boolean).join('/');
const isSameOrChild=(parent,candidate)=>candidate===parent||String(candidate||'').startsWith(String(parent||'')+'/');
const status=text=>{const node=document.getElementById('status-line-col');if(node)node.textContent=String(text||'')};
const state={activeProject:'',tree:[],dragged:null,refreshing:false};

const projectApi=(suffix='',options={})=>{
  if(!state.activeProject)throw new Error('Open a project first.');
  return api('/projects/'+enc(state.activeProject)+suffix,options);
};
const starterFor=path=>{
  const lower=String(path||'').toLowerCase();
  const name=basename(path)||'page';
  if(lower.endsWith('.html'))return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${name.replace(/\.html$/i,'')}</title>\n</head>\n<body>\n  <h1>${name.replace(/\.html$/i,'')}</h1>\n</body>\n</html>\n`;
  if(lower.endsWith('.css'))return `/* ${name} */\n`;
  if(lower.endsWith('.js')||lower.endsWith('.mjs'))return `// ${name}\n`;
  if(lower.endsWith('.ts'))return `// ${name}\n`;
  if(lower.endsWith('.py'))return `# ${name}\n\ndef main():\n    pass\n\nif __name__ == '__main__':\n    main()\n`;
  if(lower.endsWith('.md'))return `# ${name.replace(/\.md$/i,'')}\n`;
  return '';
};

const refreshState=async()=>{
  if(state.refreshing)return;
  state.refreshing=true;
  try{
    const projects=await api('/projects');
    state.activeProject=String(projects.activeProject||'');
    if(!state.activeProject){state.tree=[];return}
    const tree=await projectApi('/tree');
    state.tree=Array.isArray(tree.tree)?tree.tree:[];
  }catch(error){status('EXPLORER MANAGEMENT: '+error.message)}
  finally{state.refreshing=false}
};
const refreshExplorer=async()=>{
  try{await window.fetchFileSystem?.()}catch{}
  await refreshState();
  setTimeout(bindRows,0);
};
const collectFolders=(nodes,out=[])=>{
  for(const node of nodes||[]){
    if(node.type==='folder'||node.isDirectory){out.push({path:node.id,name:node.name});collectFolders(node.children||[],out)}
  }
  return out;
};
const rowInfo=row=>{
  const path=String(row?.title||row?.dataset?.codebasePath||'').trim();
  const group=row?.parentElement?.classList?.contains('folder-group')&&row.parentElement.firstElementChild===row?row.parentElement:null;
  return {row,path,isDirectory:Boolean(group),group};
};

const closeContextMenu=()=>document.getElementById('codebase-explorer-context-menu')?.remove();
const closeFolderPicker=()=>document.getElementById('codebase-folder-picker')?.remove();
const closeMenus=()=>{closeContextMenu();closeFolderPicker()};

const migrateOpenTabs=(source,target,isDirectory)=>{
  if(!Array.isArray(window.openTabs))return;
  let changed=false;
  for(const tab of window.openTabs){
    if(tab?.type!=='code'||tab.project!==state.activeProject||!tab.relativePath)continue;
    if(isDirectory?!isSameOrChild(source,tab.relativePath):tab.relativePath!==source)continue;
    const next=isDirectory?target+tab.relativePath.slice(source.length):target;
    const oldId=tab.id;
    const newId='project:'+state.activeProject+':'+next;
    tab.relativePath=next;tab.name=basename(next);tab.id=newId;
    if(window.activeEditors?.[oldId]&&!window.activeEditors?.[newId]){
      window.activeEditors[newId]=window.activeEditors[oldId];
      delete window.activeEditors[oldId];
    }
    changed=true;
  }
  if(changed)window.renderWorkspace?.();
};
const closeTabsForPath=(path,isDirectory)=>{
  if(!Array.isArray(window.openTabs))return;
  let changed=false;
  for(let index=window.openTabs.length-1;index>=0;index--){
    const tab=window.openTabs[index];
    if(tab?.type!=='code'||tab.project!==state.activeProject||!tab.relativePath)continue;
    if(isDirectory?!isSameOrChild(path,tab.relativePath):tab.relativePath!==path)continue;
    try{delete window.activeEditors?.[tab.id]}catch{}
    window.openTabs.splice(index,1);changed=true;
  }
  if(changed)window.renderWorkspace?.();
};

const movePath=async(source,target,{copy=false,isDirectory=false}={})=>{
  if(!state.activeProject)await refreshState();
  if(!state.activeProject)return alert('Open a project first.');
  if(!source||!target)return;
  if(source===target){status('Already in that folder: '+source);return}
  status((copy?'COPYING ':'MOVING ')+source+'…');
  try{
    const result=await projectApi('/move',{method:'POST',body:JSON.stringify({source,target,copy})});
    const finalPath=String(result.path||target);
    if(!copy)migrateOpenTabs(source,finalPath,isDirectory);
    await refreshExplorer();
    status((copy?'COPIED: ':'MOVED: ')+source+' → '+finalPath);
  }catch(error){status((copy?'COPY FAILED: ':'MOVE FAILED: ')+error.message);alert((copy?'Copy':'Move')+' failed.\n\n'+error.message)}
};
const renamePath=async(path,isDirectory)=>{
  const current=basename(path);
  const name=(prompt(isDirectory?'Rename folder':'Rename file',current)||'').trim();
  if(!name||name===current)return;
  if(name.includes('/')||name.includes('\\'))return alert('Enter a name only. Use Move to Folder to change folders.');
  await movePath(path,joinPath(dirname(path),name),{isDirectory});
};
const duplicateName=name=>{const dot=name.lastIndexOf('.');return dot>0?name.slice(0,dot)+' copy'+name.slice(dot):name+' copy'};
const duplicatePath=async(path,isDirectory)=>{
  const name=(prompt(isDirectory?'Duplicate folder as':'Duplicate file as',duplicateName(basename(path)))||'').trim();
  if(!name)return;
  if(name.includes('/')||name.includes('\\'))return alert('Enter a name only.');
  await movePath(path,joinPath(dirname(path),name),{copy:true,isDirectory});
};
const deletePath=async(path,isDirectory)=>{
  if(!state.activeProject)await refreshState();
  if(!state.activeProject)return alert('Open a project first.');
  const label=isDirectory?'folder':'file';
  if(!confirm(`Delete ${label} "${path}"?${isDirectory?'\n\nEverything inside this folder will also be deleted.':''}`))return;
  try{
    await projectApi('/file?path='+enc(path),{method:'DELETE'});
    closeTabsForPath(path,isDirectory);
    await refreshExplorer();status('DELETED: '+path);
  }catch(error){status('DELETE FAILED: '+error.message);alert('Delete failed.\n\n'+error.message)}
};
const copyPath=async path=>{
  const value='/projects/'+state.activeProject+'/'+path;
  try{await navigator.clipboard.writeText(value);status('COPIED PATH: '+value)}catch{prompt('Copy path',value)}
};
const createFile=async(base='')=>{
  if(!state.activeProject)await refreshState();
  if(!state.activeProject)return alert('Open a project first.');
  const suggested=joinPath(base,'index.html');
  let path=(prompt(base?'New file in '+base:'New file path',suggested)||'').trim();if(!path)return;
  if(base&&!path.includes('/'))path=joinPath(base,path);
  try{
    await projectApi('/file',{method:'POST',body:JSON.stringify({path,content:starterFor(path)})});
    await refreshExplorer();status('CREATED: '+path);
  }catch(error){status('CREATE FILE FAILED: '+error.message);alert('Create file failed.\n\n'+error.message)}
};
const createFolder=async(base='')=>{
  if(!state.activeProject)await refreshState();
  if(!state.activeProject)return alert('Open a project first.');
  const suggested=joinPath(base,'new-folder');
  let path=(prompt(base?'New folder in '+base:'New folder path',suggested)||'').trim();if(!path)return;
  if(base&&!path.includes('/'))path=joinPath(base,path);
  try{
    await projectApi('/folder',{method:'POST',body:JSON.stringify({path})});
    await refreshExplorer();status('CREATED FOLDER: '+path);
  }catch(error){status('CREATE FOLDER FAILED: '+error.message);alert('Create folder failed.\n\n'+error.message)}
};

const showFolderPicker=async(source,isDirectory)=>{
  closeMenus();
  await refreshState();
  if(!state.activeProject)return alert('Open a project first.');
  const overlay=document.createElement('div');overlay.id='codebase-folder-picker';
  overlay.style.cssText='position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:18px';
  const panel=document.createElement('div');panel.style.cssText='width:min(540px,92vw);max-height:min(700px,84vh);display:flex;flex-direction:column;background:#07131d;border:1px solid rgba(77,208,225,.42);border-radius:9px;box-shadow:0 18px 60px rgba(0,0,0,.58);overflow:hidden;color:#d8e3ec';
  panel.innerHTML=`<div style="padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.09)"><div style="font-weight:700;color:#fff">Move ${esc(basename(source))} to folder</div><div style="font-size:10px;color:#8ea6b8;margin-top:3px">All folders in ${esc(state.activeProject)} are available below.</div></div><div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.07)"><input id="codebase-folder-search" autocomplete="off" placeholder="Search folders…" style="width:100%;box-sizing:border-box;background:#020a10;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:9px 10px;outline:none"></div><div id="codebase-folder-results" style="overflow:auto;padding:8px"></div><div style="display:flex;justify-content:flex-end;padding:9px 12px;border-top:1px solid rgba(255,255,255,.07)"><button id="codebase-folder-cancel" style="background:transparent;color:#c7d5df;border:1px solid rgba(255,255,255,.14);border-radius:5px;padding:7px 12px;cursor:pointer">Cancel</button></div>`;
  overlay.appendChild(panel);document.body.appendChild(overlay);
  const input=panel.querySelector('#codebase-folder-search');
  const results=panel.querySelector('#codebase-folder-results');
  const sourceParent=dirname(source);
  const folders=[{path:'',name:'Project root'},...collectFolders(state.tree,[])].filter(folder=>!isDirectory||(folder.path!==source&&!isSameOrChild(source,folder.path)));
  const close=()=>{overlay.remove();document.removeEventListener('keydown',keydown,true)};
  const keydown=event=>{if(event.key==='Escape')close()};
  const render=()=>{
    const query=String(input.value||'').trim().toLowerCase();
    const matches=folders.filter(folder=>!query||folder.path.toLowerCase().includes(query)||folder.name.toLowerCase().includes(query));
    results.innerHTML='';
    if(!matches.length){results.innerHTML='<div style="padding:18px;color:#8ea6b8;text-align:center">No matching folders</div>';return}
    for(const folder of matches){
      const button=document.createElement('button');button.type='button';
      button.style.cssText='width:100%;display:flex;align-items:center;gap:9px;text-align:left;background:transparent;color:#d8e3ec;border:0;border-radius:5px;padding:9px 10px;cursor:pointer';
      button.onmouseenter=()=>button.style.background='rgba(77,208,225,.10)';button.onmouseleave=()=>button.style.background='transparent';
      const current=folder.path===sourceParent;
      button.innerHTML='<span>📁</span><span style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(folder.path||'Project root')+'</span>'+(current?'<span style="font-size:9px;color:#81c784">CURRENT</span>':'');
      button.onclick=()=>{const target=joinPath(folder.path,basename(source));close();void movePath(source,target,{isDirectory})};
      results.appendChild(button);
    }
  };
  input.addEventListener('input',render);panel.querySelector('#codebase-folder-cancel').onclick=close;
  overlay.addEventListener('mousedown',event=>{if(event.target===overlay)close()});document.addEventListener('keydown',keydown,true);
  render();setTimeout(()=>input.focus(),0);
};

const contextItem=(label,handler,{danger=false}={})=>{
  const button=document.createElement('button');button.type='button';button.textContent=label;
  button.style.cssText=`display:block;width:100%;text-align:left;border:0;background:transparent;color:${danger?'#ff8a80':'#d8e3ec'};padding:8px 12px;font:inherit;font-size:11px;cursor:pointer;white-space:nowrap`;
  button.onmouseenter=()=>button.style.background='rgba(77,208,225,.12)';button.onmouseleave=()=>button.style.background='transparent';
  button.onclick=event=>{event.preventDefault();event.stopPropagation();closeContextMenu();handler()};
  return button;
};
const separator=()=>{const line=document.createElement('div');line.style.cssText='height:1px;background:rgba(255,255,255,.08);margin:4px 0';return line};
const showContextMenu=(event,info)=>{
  if(!info.path)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();closeMenus();
  const menu=document.createElement('div');menu.id='codebase-explorer-context-menu';
  menu.style.cssText='position:fixed;z-index:2147483647;min-width:220px;background:#07131d;border:1px solid rgba(255,255,255,.14);border-radius:7px;padding:5px;box-shadow:0 14px 38px rgba(0,0,0,.5);font-family:inherit;color:#d8e3ec';
  if(info.isDirectory)menu.append(contextItem(info.group?.classList.contains('collapsed')?'Expand Folder':'Collapse Folder',()=>info.group?.classList.toggle('collapsed')));
  else menu.append(contextItem('Open',()=>info.row.click()));
  menu.append(contextItem(info.isDirectory?'Rename Folder…':'Rename…',()=>void renamePath(info.path,info.isDirectory)));
  menu.append(contextItem('Move to Folder…',()=>void showFolderPicker(info.path,info.isDirectory)));
  menu.append(contextItem(info.isDirectory?'Duplicate Folder…':'Duplicate…',()=>void duplicatePath(info.path,info.isDirectory)));
  menu.append(contextItem('Copy Path',()=>void copyPath(info.path)));
  menu.append(separator());
  const base=info.isDirectory?info.path:dirname(info.path);
  menu.append(contextItem(info.isDirectory?'New File Here…':'New File in This Folder…',()=>void createFile(base)));
  menu.append(contextItem(info.isDirectory?'New Folder Here…':'New Folder in This Folder…',()=>void createFolder(base)));
  menu.append(contextItem('Refresh Explorer',()=>void refreshExplorer()));
  menu.append(separator());
  menu.append(contextItem(info.isDirectory?'Delete Folder…':'Delete…',()=>void deletePath(info.path,info.isDirectory),{danger:true}));
  document.body.appendChild(menu);
  const rect=menu.getBoundingClientRect();
  menu.style.left=Math.max(6,Math.min(event.clientX,window.innerWidth-rect.width-6))+'px';
  menu.style.top=Math.max(6,Math.min(event.clientY,window.innerHeight-rect.height-6))+'px';
};

const clearDropStyle=row=>{row.dataset.codebaseDropActive='false';row.style.outline='';row.style.background=''};
const bindRow=row=>{
  if(!row||row.dataset.codebaseFileManagerBound==='true')return;
  const info=rowInfo(row);if(!info.path)return;
  row.dataset.codebaseFileManagerBound='true';row.dataset.codebasePath=info.path;row.dataset.codebaseDirectory=info.isDirectory?'true':'false';row.draggable=true;row.tabIndex=row.tabIndex<0?0:row.tabIndex;
  row.addEventListener('dragstart',event=>{
    const fresh=rowInfo(row);state.dragged={path:fresh.path,isDirectory:fresh.isDirectory};row.style.opacity='.55';
    try{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',fresh.path)}catch{}
  });
  row.addEventListener('dragend',()=>{state.dragged=null;row.style.opacity='';document.querySelectorAll('[data-codebase-drop-active="true"]').forEach(clearDropStyle)});
  row.addEventListener('keydown',event=>{if((event.shiftKey&&event.key==='F10')||event.key==='ContextMenu'){showContextMenu(event,rowInfo(row))}});
  if(info.isDirectory){
    const accept=event=>{
      const dragged=state.dragged;if(!dragged)return;
      const fresh=rowInfo(row);
      if(dragged.path===fresh.path||(dragged.isDirectory&&isSameOrChild(dragged.path,fresh.path)))return;
      event.preventDefault();event.stopPropagation();try{event.dataTransfer.dropEffect='move'}catch{}
      row.dataset.codebaseDropActive='true';row.style.outline='1px solid #4dd0e1';row.style.background='rgba(77,208,225,.12)';
    };
    row.addEventListener('dragenter',accept);row.addEventListener('dragover',accept);
    row.addEventListener('dragleave',event=>{if(!row.contains(event.relatedTarget))clearDropStyle(row)});
    row.addEventListener('drop',event=>{
      const dragged=state.dragged;clearDropStyle(row);if(!dragged)return;
      const fresh=rowInfo(row);event.preventDefault();event.stopPropagation();
      if(dragged.path===fresh.path||(dragged.isDirectory&&isSameOrChild(dragged.path,fresh.path)))return;
      fresh.group?.classList.remove('collapsed');state.dragged=null;
      void movePath(dragged.path,joinPath(fresh.path,basename(dragged.path)),{isDirectory:dragged.isDirectory});
    });
  }
};
const bindRootDrop=()=>{
  const root=document.getElementById('dynamic-file-list');if(!root||root.dataset.codebaseRootDropBound==='true')return;
  root.dataset.codebaseRootDropBound='true';
  root.addEventListener('dragover',event=>{if(!state.dragged||event.target?.closest?.('.file-item'))return;event.preventDefault();try{event.dataTransfer.dropEffect='move'}catch{}});
  root.addEventListener('drop',event=>{
    if(!state.dragged||event.target?.closest?.('.file-item'))return;
    event.preventDefault();const dragged=state.dragged;state.dragged=null;
    void movePath(dragged.path,basename(dragged.path),{isDirectory:dragged.isDirectory});
  });
};
function bindRows(){document.querySelectorAll('#dynamic-file-list .file-item').forEach(bindRow);bindRootDrop()}

const install=()=>{
  document.addEventListener('contextmenu',event=>{
    const row=event.target?.closest?.('#dynamic-file-list .file-item');if(!row)return;
    showContextMenu(event,rowInfo(row));
  },true);
  document.addEventListener('mousedown',event=>{const menu=document.getElementById('codebase-explorer-context-menu');if(menu&&!menu.contains(event.target))menu.remove()},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenus()},true);
  window.addEventListener('blur',closeContextMenu);window.addEventListener('resize',closeContextMenu);
  const observer=new MutationObserver(()=>bindRows());
  const root=document.getElementById('dynamic-file-list');if(root)observer.observe(root,{childList:true,subtree:true});
  bindRows();void refreshState();
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
window.SulandraCodebaseExplorerFiles={refresh:refreshExplorer,move:movePath,rename:renamePath,duplicate:duplicatePath,remove:deletePath,moveToFolder:showFolderPicker};
})();
