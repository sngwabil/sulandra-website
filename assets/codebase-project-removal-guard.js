/* CODEBASE_PROJECT_REMOVAL_GUARD_V1
 * Safe standalone Codebase project removal: disconnect/move terminals first,
 * then remove the local project copy. This prevents terminal sessions from
 * keeping a working directory that is being deleted underneath them.
 */
(()=>{
'use strict';
if(window.__CODEBASE_PROJECT_REMOVAL_GUARD_V1__)return;
window.__CODEBASE_PROJECT_REMOVAL_GUARD_V1__=true;

const gatewayBase=()=>String(window.RAILWAY_CONFIG?.WSS_URL||'').replace(/^wss:/i,'https:').replace(/^ws:/i,'http:').replace(/\/$/,'');
const token=()=>String(window.RAILWAY_CONFIG?.getToken?.()||'').trim();
const status=text=>{const node=document.getElementById('status-line-col');if(node)node.textContent=String(text||'')};
const activeProjectName=()=>String(document.getElementById('codebase-project-select')?.value||'').trim();
const removeLocal=async name=>{
  const auth=token();
  const response=await fetch(gatewayBase()+'/codebase/projects/'+encodeURIComponent(name),{
    method:'DELETE',
    headers:{Accept:'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.error||`Codebase project removal failed (${response.status})`);
  return payload;
};

document.addEventListener('click',event=>{
  const button=event.target?.closest?.('#codebase-remove-project');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const name=activeProjectName();
  if(!name)return;
  if(!confirm(`Remove the local Codebase copy of "${name}"?\n\nThis does not delete the GitHub or Railway project.`))return;
  void (async()=>{
    button.disabled=true;
    status('DISCONNECTING '+name+' BEFORE REMOVAL…');
    try{
      await window.SulandraCodebaseProjects?.setActive?.('');
      status('REMOVING LOCAL PROJECT: '+name+'…');
      await removeLocal(name);
      localStorage.removeItem('sulandra:codebase:active-project:v1');
      await window.SulandraCodebaseProjects?.refresh?.({preserveSelection:false});
      status('REMOVED LOCAL PROJECT: '+name+' — terminals reset to /projects.');
    }catch(error){
      status('REMOVE FAILED: '+error.message);
      alert('Unable to remove the local project safely.\n\n'+error.message);
    }finally{button.disabled=false}
  })();
},true);
})();
