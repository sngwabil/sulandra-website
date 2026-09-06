/* CODEBASE_PUBLIC_GIT_CLONE_UI_V1
 * Own the Manage > GitHub clone action after the legacy project-manager runtime.
 * Public repositories clone without requiring GitHub CLI authentication; any
 * private-repository guidance is supplied by the backend only after anonymous
 * HTTPS and authenticated fallback attempts have both failed.
 */
(()=>{
'use strict';
if(window.__CODEBASE_PUBLIC_GIT_CLONE_UI_V1__)return;
window.__CODEBASE_PUBLIC_GIT_CLONE_UI_V1__=true;

const gatewayBase=()=>String(window.RAILWAY_CONFIG?.WSS_URL||'').replace(/^wss:/i,'https:').replace(/^ws:/i,'http:').replace(/\/$/,'');
const token=()=>String(window.RAILWAY_CONFIG?.getToken?.()||'').trim();
const status=text=>{const node=document.getElementById('status-line-col');if(node)node.textContent=String(text||'')};
const api=async(path,options={})=>{
  const headers={Accept:'application/json',...(options.body!==undefined?{'Content-Type':'application/json'}:{})};
  const auth=token();if(auth)headers.Authorization='Bearer '+auth;
  const response=await fetch(gatewayBase()+'/codebase'+path,{...options,headers:{...headers,...(options.headers||{})}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.error||`Codebase project service failed (${response.status})`);
  return payload;
};

const cloneGithubProject=async()=>{
  const repository=(prompt('GitHub repository (owner/repository)','sngwabil/')||'').trim();
  if(!repository)return;
  const branch=(prompt('Branch (leave blank for repository default)','')||'').trim();
  status('CLONING '+repository+' into /projects…');
  try{
    const created=await api('/projects/clone',{method:'POST',body:JSON.stringify({repository,branch})});
    if(window.SulandraCodebaseProjects?.refresh)await window.SulandraCodebaseProjects.refresh({preserveSelection:false});
    if(window.SulandraCodebaseProjects?.setActive&&created?.name)await window.SulandraCodebaseProjects.setActive(created.name);
    status('CLONED: '+repository+' → /projects/'+String(created?.name||repository.split('/').pop()||'project'));
  }catch(error){
    const message=String(error?.message||error||'Clone failed.');
    status('CLONE FAILED: '+message);
    alert('GitHub clone failed.\n\n'+message);
  }
};

// Capture before the legacy button's bubble listener so the repaired flow owns
// every click, including keyboard-generated clicks and touch/click synthesis.
document.addEventListener('click',event=>{
  const origin=event.target instanceof Element?event.target.closest('#codebase-clone-project'):null;
  if(!origin)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void cloneGithubProject();
},true);

if(window.SulandraCodebaseProjects)window.SulandraCodebaseProjects.clone=cloneGithubProject;
window.SulandraCodebasePublicGitClone={clone:cloneGithubProject};
})();
