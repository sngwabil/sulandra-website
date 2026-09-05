/* CODEBASE_PROJECT_MANAGER_UI_V1
 * One durable /projects filesystem shared by Explorer, editor, terminals, GitHub
 * and Railway deployment controls. Standalone Codebase only.
 */
(()=>{
'use strict';
if(window.__CODEBASE_PROJECT_MANAGER_UI_V1__)return;
window.__CODEBASE_PROJECT_MANAGER_UI_V1__=true;

const gatewayBase=()=>String(RAILWAY_CONFIG.WSS_URL||'').replace(/^wss:/i,'https:').replace(/^ws:/i,'http:').replace(/\/$/,'');
const token=()=>String(RAILWAY_CONFIG.getToken?.()||'').trim();
const status=text=>{const node=document.getElementById('status-line-col');if(node)node.textContent=String(text||'')};
const headers=json=>{const h={Accept:'application/json'};const t=token();if(t)h.Authorization='Bearer '+t;if(json)h['Content-Type']='application/json';return h};
const api=async(path,options={})=>{
  const response=await fetch(gatewayBase()+'/codebase'+path,{...options,headers:{...headers(options.body!==undefined),...(options.headers||{})}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.error||`Codebase project service failed (${response.status})`);
  return payload;
};
const encode=value=>encodeURIComponent(String(value||''));
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const state={projects:[],activeProject:'',loading:false};
const STORAGE_KEY='sulandra:codebase:active-project:v1';

const projectPath=project=>'/projects/'+project;
const currentProject=()=>state.projects.find(item=>item.name===state.activeProject)||null;
const liveTerminalSockets=()=>openTabs
  .filter(tab=>tab.type==='terminal')
  .map(tab=>activeTerminals[tab.id]?.__sulandraWs)
  .filter(ws=>ws?.readyState===WebSocket.OPEN);
const moveLiveTerminals=project=>{
  const cwd=project?projectPath(project):'/projects';
  for(const ws of liveTerminalSockets()){
    try{ws.send('cd -- '+cwd+'\r')}catch{}
  }
};

const starterFor=path=>{
  const lower=String(path||'').toLowerCase();
  const name=String(path||'').split('/').pop()||'page';
  if(lower.endsWith('.html'))return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${name.replace(/\.html$/i,'')}</title>\n</head>\n<body>\n  <h1>${name.replace(/\.html$/i,'')}</h1>\n</body>\n</html>\n`;
  if(lower.endsWith('.css'))return `/* ${name} */\n`;
  if(lower.endsWith('.js')||lower.endsWith('.mjs'))return `// ${name}\n`;
  if(lower.endsWith('.ts'))return `// ${name}\n`;
  if(lower.endsWith('.py'))return `# ${name}\n\ndef main():\n    pass\n\nif __name__ == '__main__':\n    main()\n`;
  if(lower.endsWith('.md'))return `# ${name.replace(/\.md$/i,'')}\n`;
  return '';
};

const projectApi=(project,suffix='',options={})=>api('/projects/'+encode(project)+suffix,options);

const renderEmpty=message=>{
  const root=document.getElementById('dynamic-file-list');
  if(!root)return;
  root.innerHTML='';
  const box=document.createElement('div');
  box.style.cssText='padding:18px 14px;color:#8ea6b8;line-height:1.55;white-space:normal';
  box.textContent=message;
  root.appendChild(box);
};
const buildTree=(nodes,container,level=0)=>{
  for(const node of nodes||[]){
    if(node.type==='folder'||node.isDirectory){
      const group=document.createElement('div');group.className='folder-group collapsed';
      const row=document.createElement('div');row.className='file-item';row.style.paddingLeft=(16+level*14)+'px';
      const arrow=document.createElement('span');arrow.className='folder-arrow';arrow.style.color='#81c784';arrow.textContent='▼';
      const label=document.createElement('span');label.textContent='📁 '+node.name;
      row.append(arrow,label);row.onclick=()=>group.classList.toggle('collapsed');
      const contents=document.createElement('div');contents.className='folder-contents';
      buildTree(node.children||[],contents,level+1);group.append(row,contents);container.appendChild(group);
      continue;
    }
    const meta=getFileTypeMeta(node.name,'code');
    const row=document.createElement('div');row.className='file-item';row.style.paddingLeft=(16+level*14)+'px';row.title=node.id;
    const badge=document.createElement('span');badge.className='file-badge';badge.style.color=meta.color;badge.style.background=meta.bg;badge.textContent=meta.label;
    const label=document.createElement('span');label.textContent=node.name;
    row.append(badge,label);row.onclick=()=>void openProjectFile(node.id,node.name);
    row.oncontextmenu=event=>{event.preventDefault();void removeProjectPath(node.id,false)};
    container.appendChild(row);
  }
};

const refreshTree=async()=>{
  const root=document.getElementById('dynamic-file-list');
  if(!root)return;
  if(!state.activeProject){renderEmpty('No project is open. Create a project, clone one from GitHub, or choose a recent project above.');return}
  root.innerHTML='<div style="padding:16px;opacity:.55">Loading '+escapeHtml(state.activeProject)+'…</div>';
  try{
    const data=await projectApi(state.activeProject,'/tree');
    root.innerHTML='';buildTree(data.tree||[],root,0);
    if(!(data.tree||[]).length)renderEmpty('This project is empty. Use New File or New Folder to begin.');
  }catch(error){renderEmpty('Unable to load project: '+error.message)}
};

const refreshProjects=async({preserveSelection=true}={})=>{
  if(state.loading)return;state.loading=true;
  try{
    const data=await api('/projects');
    state.projects=Array.isArray(data.projects)?data.projects:[];
    const remembered=localStorage.getItem(STORAGE_KEY)||'';
    const serverActive=String(data.activeProject||'');
    let next=serverActive;
    if(!next&&preserveSelection&&state.projects.some(item=>item.name===remembered))next=remembered;
    state.activeProject=state.projects.some(item=>item.name===next)?next:'';
    if(state.activeProject)localStorage.setItem(STORAGE_KEY,state.activeProject);else localStorage.removeItem(STORAGE_KEY);
    renderProjectManager();
    await refreshTree();
    void refreshGitPanel();
    void refreshRailwayPanel();
  }catch(error){renderEmpty('Project manager unavailable: '+error.message);status('PROJECT MANAGER FAILED: '+error.message)}
  finally{state.loading=false}
};

const setActiveProject=async project=>{
  const requested=String(project||'');
  const data=await api('/active',{method:'POST',body:JSON.stringify({project:requested})});
  state.activeProject=String(data.activeProject||'');
  if(state.activeProject)localStorage.setItem(STORAGE_KEY,state.activeProject);else localStorage.removeItem(STORAGE_KEY);
  moveLiveTerminals(state.activeProject);
  renderProjectManager();await refreshTree();void refreshGitPanel();void refreshRailwayPanel();
  status(state.activeProject?'ACTIVE PROJECT: '+state.activeProject:'PROJECT DISCONNECTED — /projects remains available.');
};

const createProject=async()=>{
  const name=(prompt('New project name','my-project')||'').trim();if(!name)return;
  status('CREATING PROJECT: '+name+'…');
  const created=await api('/projects',{method:'POST',body:JSON.stringify({name,gitInit:true})});
  await refreshProjects({preserveSelection:false});await setActiveProject(created.name);
};
const cloneGithubProject=async()=>{
  const repository=(prompt('GitHub repository (owner/repository)','sngwabil/')||'').trim();if(!repository)return;
  const branch=(prompt('Branch (leave blank for repository default)','')||'').trim();
  status('CLONING '+repository+' into /projects…');
  try{
    const created=await api('/projects/clone',{method:'POST',body:JSON.stringify({repository,branch})});
    await refreshProjects({preserveSelection:false});await setActiveProject(created.name);status('CLONED: '+repository+' → '+projectPath(created.name));
  }catch(error){status('CLONE FAILED: '+error.message);alert('GitHub clone failed.\n\n'+error.message+'\n\nIf this is your first project, run sulandra-github-login once in Terminal 1 and retry.');}
};
const disconnectProject=async()=>{if(!state.activeProject)return;await setActiveProject('')};
const removeLocalProject=async()=>{
  if(!state.activeProject)return;
  const name=state.activeProject;
  if(!confirm(`Remove the local Codebase copy of "${name}"?\n\nThis does not delete the GitHub or Railway project.`))return;
  await api('/projects/'+encode(name),{method:'DELETE'});state.activeProject='';localStorage.removeItem(STORAGE_KEY);await refreshProjects({preserveSelection:false});status('REMOVED LOCAL PROJECT: '+name);
};

const createFile=async()=>{
  if(!state.activeProject)return alert('Open a project first.');
  const path=(prompt('New file path','index.html')||'').trim();if(!path)return;
  await projectApi(state.activeProject,'/file',{method:'POST',body:JSON.stringify({path,content:starterFor(path)})});
  await refreshTree();await openProjectFile(path,path.split('/').pop());status('CREATED: '+state.activeProject+'/'+path);
};
const createFolder=async()=>{
  if(!state.activeProject)return alert('Open a project first.');
  const path=(prompt('New folder path','src')||'').trim();if(!path)return;
  await projectApi(state.activeProject,'/folder',{method:'POST',body:JSON.stringify({path})});await refreshTree();status('CREATED FOLDER: '+state.activeProject+'/'+path);
};
const removeProjectPath=async(path,isDirectory=false)=>{
  if(!state.activeProject||!path)return;
  if(!confirm(`Remove ${path} from ${state.activeProject}?`))return;
  await projectApi(state.activeProject,'/file?path='+encode(path),{method:'DELETE'});await refreshTree();status('REMOVED: '+path);
};
const openProjectFile=async(path,name)=>{
  if(!state.activeProject)return;
  const id='project:'+state.activeProject+':'+path;
  const existing=openTabs.findIndex(tab=>tab.id===id);
  if(existing>=0){if(existing>0)openTabs.unshift(openTabs.splice(existing,1)[0]);renderWorkspace();return}
  try{
    const data=await projectApi(state.activeProject,'/file?path='+encode(path));
    const meta=getFileTypeMeta(name||path,'code');
    openTabs.unshift({id,name:name||path.split('/').pop(),type:'code',lang:meta.lang,color:meta.color,content:data.content,project:state.activeProject,relativePath:path});
    renderWorkspace();
  }catch(error){status('OPEN FAILED: '+error.message)}
};

const originalSave=window.saveActiveFile;
window.saveActiveFile=async()=>{
  const tab=openTabs[0];
  if(!tab?.project)return originalSave?.();
  const editor=activeEditors[tab.id];if(!editor)return;
  const content=editor.getValue();
  try{saveVersion(tab.id,content);await projectApi(tab.project,'/file',{method:'PUT',body:JSON.stringify({path:tab.relativePath,content})});tab.content=content;status('SAVED: '+tab.project+'/'+tab.relativePath)}
  catch(error){status('SAVE FAILED: '+error.message)}
};
window.openFallbackFile=()=>void createFile();
window.createWorkspaceFolder=()=>void createFolder();
window.fetchFileSystem=()=>refreshTree();

const originalCommit=window.commitToGitHub;
window.commitToGitHub=async()=>{
  if(!state.activeProject)return originalCommit?.();
  const input=document.getElementById('commit-msg-input');
  const message=(input?.value||prompt('Commit message')||'').trim();if(!message)return;
  status('COMMITTING '+state.activeProject+'…');
  try{
    const result=await projectApi(state.activeProject,'/git/commit',{method:'POST',body:JSON.stringify({message,push:true})});
    if(input)input.value='';
    if(!result.committed)status(result.message||'No changes to commit.');
    else if(result.pushed)status('COMMIT '+String(result.commit||'').slice(0,8)+' PUSHED to GitHub.');
    else status('COMMIT '+String(result.commit||'').slice(0,8)+' saved locally; push needs attention: '+String(result.pushError||'no upstream'));
    void refreshGitPanel();
  }catch(error){status('COMMIT FAILED: '+error.message)}
};
const gitAction=async action=>{
  if(!state.activeProject)return;
  status(action.toUpperCase()+' '+state.activeProject+'…');
  try{const result=await projectApi(state.activeProject,'/git/'+action,{method:'POST',body:'{}'});status(action.toUpperCase()+' COMPLETE: '+String(result.output||'').split('\n').slice(-2).join(' '));await refreshTree();void refreshGitPanel()}
  catch(error){status(action.toUpperCase()+' FAILED: '+error.message)}
};

const refreshGitPanel=async()=>{
  const root=document.getElementById('codebase-project-git-status');if(!root)return;
  if(!state.activeProject){root.textContent='Open a project to use source control.';return}
  try{
    const data=await projectApi(state.activeProject,'/git/status');
    root.innerHTML='<div style="color:#81c784;margin-bottom:6px">'+escapeHtml(data.branch||'Git repository')+'</div><pre style="white-space:pre-wrap;font-size:10px;margin:0;color:#a9bfd0">'+escapeHtml(data.status||'Working tree clean')+'</pre>';
  }catch(error){root.textContent=error.message}
};

const railwayStatus=async()=>{
  if(!state.activeProject)throw new Error('Open a project first.');
  return projectApi(state.activeProject,'/railway/status');
};
const refreshRailwayPanel=async()=>{
  const node=document.getElementById('codebase-railway-state');if(!node)return;
  if(!state.activeProject){node.textContent='Open a project first.';return}
  node.textContent='Checking Railway link…';
  try{
    const data=await railwayStatus();
    if(!data.linked){node.textContent='Not linked to a Railway project.';return}
    const s=data.status||{};node.textContent='Linked: '+(s.name||s.project?.name||s.project||'Railway project')+(s.environment?.name?' • '+s.environment.name:'');
  }catch(error){node.textContent='Railway status unavailable: '+error.message}
};
const deployNewRailway=async()=>{
  if(!state.activeProject)return alert('Open a project first.');
  const name=(prompt('New Railway project/service name',state.activeProject)||'').trim();if(!name)return;
  status('DEPLOYING '+state.activeProject+' TO NEW RAILWAY PROJECT…');
  try{const result=await projectApi(state.activeProject,'/railway/deploy',{method:'POST',body:JSON.stringify({mode:'new',name})});status('RAILWAY DEPLOY STARTED: '+String(result.output||'').split('\n').slice(-2).join(' '));void refreshRailwayPanel()}
  catch(error){status('RAILWAY DEPLOY FAILED: '+error.message);alert('Railway deploy failed.\n\n'+error.message+'\n\nIf this is your first deploy, run sulandra-railway-login once in Terminal 1 and retry.');}
};
const connectExistingRailway=async()=>{
  if(!state.activeProject)return alert('Open a project first.');
  const project=(prompt('Railway project ID or name','')||'').trim();if(!project)return;
  const environment=(prompt('Railway environment','production')||'').trim();
  const service=(prompt('Railway service ID/name (optional)','')||'').trim();
  status('LINKING '+state.activeProject+' TO RAILWAY…');
  try{
    await projectApi(state.activeProject,'/railway/link',{method:'POST',body:JSON.stringify({project,environment,service})});
    const result=await projectApi(state.activeProject,'/railway/deploy',{method:'POST',body:JSON.stringify({mode:'linked',environment,service})});
    status('RAILWAY DEPLOY STARTED: '+String(result.output||'').split('\n').slice(-2).join(' '));void refreshRailwayPanel();
  }catch(error){status('RAILWAY LINK/DEPLOY FAILED: '+error.message)}
};

const renderProjectManager=()=>{
  const host=document.getElementById('codebase-project-manager');if(!host)return;
  const options=['<option value="">Open project…</option>',...state.projects.map(project=>`<option value="${escapeHtml(project.name)}" ${project.name===state.activeProject?'selected':''}>${escapeHtml(project.name)}${project.gitBacked?' • Git':''}</option>`)].join('');
  const meta=currentProject();
  host.innerHTML=`<div style="display:flex;gap:6px;align-items:center"><select id="codebase-project-select" style="min-width:0;flex:1;background:#06131d;color:#d8e3ec;border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:6px;font-size:11px">${options}</select><button id="codebase-project-refresh" title="Refresh projects" style="background:transparent;color:#81c784;border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:5px 7px;cursor:pointer">↻</button></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px"><button class="btn-primary" id="codebase-new-project">＋ New</button><button class="btn-primary" id="codebase-clone-project">⌘ GitHub</button></div>${state.activeProject?`<div style="margin-top:7px;font-size:10px;color:#9dc7da;white-space:normal"><strong style="color:#fff">${escapeHtml(state.activeProject)}</strong><br>${meta?.remote?escapeHtml(meta.remote):'Local project'}${meta?.branch?' • '+escapeHtml(meta.branch):''}</div><div style="display:flex;gap:6px;margin-top:6px"><button id="codebase-disconnect-project" style="flex:1;background:transparent;border:1px solid rgba(255,255,255,.12);color:#c7d5df;border-radius:4px;padding:5px;cursor:pointer">Disconnect</button><button id="codebase-remove-project" style="flex:1;background:transparent;border:1px solid rgba(229,115,115,.3);color:#e57373;border-radius:4px;padding:5px;cursor:pointer">Remove Local</button></div>`:''}`;
  host.querySelector('#codebase-project-select')?.addEventListener('change',event=>{if(event.target.value)void setActiveProject(event.target.value)});
  host.querySelector('#codebase-project-refresh')?.addEventListener('click',()=>void refreshProjects());
  host.querySelector('#codebase-new-project')?.addEventListener('click',()=>void createProject());
  host.querySelector('#codebase-clone-project')?.addEventListener('click',()=>void cloneGithubProject());
  host.querySelector('#codebase-disconnect-project')?.addEventListener('click',()=>void disconnectProject());
  host.querySelector('#codebase-remove-project')?.addEventListener('click',()=>void removeLocalProject());
};

const installUi=()=>{
  const explorer=document.getElementById('sidebar-explorer');
  if(explorer&&!document.getElementById('codebase-project-manager')){
    const host=document.createElement('div');host.id='codebase-project-manager';host.style.cssText='padding:8px 12px 10px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.16)';explorer.insertBefore(host,explorer.firstChild);
  }
  const header=document.querySelector('#sidebar-left .sidebar-header');
  if(header){
    const icons=header.querySelectorAll('span[title="New File"],span[title="New Folder"]');
    if(icons[0]){icons[0].onclick=()=>void createFile();icons[0].title='New File in active project'}
    if(icons[1]){icons[1].onclick=()=>void createFolder();icons[1].title='New Folder in active project'}
  }
  const gitRoot=document.querySelector('#sidebar-git .mock-panel-content');
  if(gitRoot&&!document.getElementById('codebase-project-git-controls')){
    const controls=document.createElement('div');controls.id='codebase-project-git-controls';controls.innerHTML='<div id="codebase-project-git-status" style="margin:12px 0;padding:8px;background:rgba(0,0,0,.2);border-radius:5px;white-space:normal">Open a project to use source control.</div><div style="display:flex;gap:6px"><button class="btn-primary" id="codebase-git-pull">Pull</button><button class="btn-primary" id="codebase-git-push">Push</button></div>';
    gitRoot.appendChild(controls);controls.querySelector('#codebase-git-pull').onclick=()=>void gitAction('pull');controls.querySelector('#codebase-git-push').onclick=()=>void gitAction('push');
  }
  const ide=document.getElementById('view-ide');
  if(ide&&!document.getElementById('codebase-railway-controls')){
    const box=document.createElement('div');box.id='codebase-railway-controls';box.style.cssText='margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.1)';box.innerHTML='<div style="font-weight:700;color:#fff;margin-bottom:8px">Railway Deployment</div><div id="codebase-railway-state" style="font-size:10px;color:#9db1c1;margin-bottom:9px;line-height:1.4">Open a project first.</div><button class="btn-primary" id="codebase-railway-new" style="margin-bottom:7px">Deploy as New Railway Project</button><button class="btn-primary" id="codebase-railway-existing" style="background:rgba(120,101,193,.5)">Connect Existing + Deploy</button>';
    ide.appendChild(box);box.querySelector('#codebase-railway-new').onclick=()=>void deployNewRailway();box.querySelector('#codebase-railway-existing').onclick=()=>void connectExistingRailway();
  }
  renderProjectManager();
};

const init=async()=>{
  installUi();
  if(!token()){renderEmpty('Codebase authentication is required. Return to the Sulandra session and reopen Codebase.');return}
  await refreshProjects({preserveSelection:true});
};
setTimeout(()=>{void init()},0);

window.SulandraCodebaseProjects={refresh:refreshProjects,setActive:setActiveProject,create:createProject,clone:cloneGithubProject,deployNew:deployNewRailway,connectRailway:connectExistingRailway};
})();
