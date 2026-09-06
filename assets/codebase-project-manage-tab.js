/* CODEBASE_PROJECT_MANAGE_TAB_V1
 * Dedicated Codebase Manage tab. Keeps Explorer focused on files while project
 * lifecycle controls and the complete project list live under Manage.
 */
(()=>{
'use strict';
if(window.__CODEBASE_PROJECT_MANAGE_TAB_V1__)return;
window.__CODEBASE_PROJECT_MANAGE_TAB_V1__=true;

const config=()=>typeof RAILWAY_CONFIG!=='undefined'?RAILWAY_CONFIG:(window.RAILWAY_CONFIG||{});
const gatewayBase=()=>String(config().WSS_URL||'').replace(/^wss:/i,'https:').replace(/^ws:/i,'http:').replace(/\/$/,'');
const token=()=>String(config().getToken?.()||'').trim();
const headers=()=>{const auth=token();return {Accept:'application/json',...(auth?{Authorization:'Bearer '+auth}:{})}};
const api=async path=>{
  const response=await fetch(gatewayBase()+'/codebase'+path,{headers:headers()});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.error||`Codebase project service failed (${response.status})`);
  return payload;
};
const status=text=>{const node=document.getElementById('status-line-col');if(node)node.textContent=String(text||'')};
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

let renderTimer=0;
const setSidebarTitle=title=>{
  const header=document.getElementById('sidebar-title-text');
  if(!header)return;
  const textNode=[...header.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&String(node.nodeValue||'').trim());
  if(textNode)textNode.nodeValue='\n        '+title+'\n        ';
  else header.prepend(document.createTextNode(title));
};

const openManage=()=>{
  document.querySelectorAll('.sidebar-view').forEach(view=>view.classList.remove('active'));
  document.querySelectorAll('.act-icon').forEach(icon=>icon.classList.remove('active'));
  document.getElementById('sidebar-manage')?.classList.add('active');
  document.querySelector('.act-icon.icon-manage')?.classList.add('active');
  setSidebarTitle('MANAGE');
  void renderProjects();
};

const ensureManageIcon=()=>{
  if(document.querySelector('.act-icon.icon-manage'))return;
  const db=document.querySelector('.sidebar-toolbox .act-icon.icon-db');
  if(!db?.parentElement)return;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','act-icon icon-manage');
  svg.setAttribute('title','Manage Projects');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor');
  svg.setAttribute('stroke-width','2');
  svg.style.color='#4dd0e1';
  svg.innerHTML='<path d="M3 7h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M3 7V5a2 2 0 0 1 2-2h5l2 2"/><path d="M8 14h8M12 10v8"/>';
  svg.addEventListener('click',openManage);
  db.insertAdjacentElement('afterend',svg);
};

const ensureManageView=()=>{
  let view=document.getElementById('sidebar-manage');
  if(!view){
    view=document.createElement('div');
    view.id='sidebar-manage';
    view.className='sidebar-view';
    view.innerHTML='<div class="sidebar-filter"><span style="font-size:10px;opacity:.8">PROJECTS & FOLDERS</span></div><div id="codebase-manage-body" style="padding-bottom:18px"><div id="codebase-manage-projects" style="padding:0 12px"></div></div>';
    const db=document.getElementById('sidebar-db');
    if(db?.parentElement)db.insertAdjacentElement('afterend',view);
    else document.querySelector('.sidebar-view-container')?.appendChild(view);
  }
  const manager=document.getElementById('codebase-project-manager');
  const body=view.querySelector('#codebase-manage-body');
  if(manager&&body&&manager.parentElement!==body){
    manager.style.borderBottom='1px solid rgba(255,255,255,.08)';
    manager.style.background='rgba(0,0,0,.12)';
    manager.style.padding='10px 12px 12px';
    body.insertBefore(manager,body.firstChild);
    const observer=new MutationObserver(()=>scheduleRender(120));
    observer.observe(manager,{childList:true,subtree:true});
  }
  return view;
};

const renderProjects=async()=>{
  const root=document.getElementById('codebase-manage-projects');
  if(!root)return;
  root.innerHTML='<div style="padding:12px 2px;color:#8ea6b8;font-size:11px">Loading projects…</div>';
  try{
    const data=await api('/projects');
    const projects=Array.isArray(data.projects)?data.projects:[];
    const active=String(data.activeProject||'');
    if(!projects.length){
      root.innerHTML='<div style="padding:12px 2px;color:#8ea6b8;line-height:1.5;font-size:11px">No projects yet. Use New or GitHub above to create one. Projects created here stay under your durable Codebase project storage.</div>';
      return;
    }
    root.innerHTML='<div style="font-size:10px;font-weight:700;letter-spacing:.7px;color:#9dc7da;margin:10px 0 8px">ALL PROJECTS</div>';
    for(const project of projects){
      const card=document.createElement('div');
      card.style.cssText='border:1px solid rgba(255,255,255,.09);background:rgba(4,12,18,.55);border-radius:6px;padding:9px;margin-bottom:7px;white-space:normal';
      const remote=project.remote?esc(project.remote):'Local project';
      const branch=project.branch?' • '+esc(project.branch):'';
      card.innerHTML='<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong style="color:#fff;font-size:11px;min-width:0;overflow:hidden;text-overflow:ellipsis">'+esc(project.name)+'</strong>'+(project.name===active?'<span style="font-size:9px;color:#81c784;border:1px solid rgba(129,199,132,.3);border-radius:999px;padding:2px 5px">ACTIVE</span>':'')+'</div><div style="font-size:9px;color:#8ea6b8;margin:5px 0 8px;overflow:hidden;text-overflow:ellipsis">'+remote+branch+'</div>';
      const button=document.createElement('button');
      button.className='btn-primary';
      button.style.cssText='padding:5px 8px;font-size:10px';
      button.textContent=project.name===active?'Open':'Open / Switch';
      button.addEventListener('click',()=>void (async()=>{
        button.disabled=true;
        try{
          await window.SulandraCodebaseProjects?.setActive?.(project.name);
          status('ACTIVE PROJECT: '+project.name);
          await renderProjects();
        }catch(error){status('PROJECT SWITCH FAILED: '+error.message)}
        finally{button.disabled=false}
      })());
      card.appendChild(button);
      root.appendChild(card);
    }
  }catch(error){
    root.innerHTML='<div style="padding:12px 2px;color:#e57373;font-size:11px;line-height:1.45">Unable to load projects: '+esc(error.message)+'</div>';
  }
};

const scheduleRender=(delay=250)=>{
  clearTimeout(renderTimer);
  renderTimer=setTimeout(()=>void renderProjects(),delay);
};

const install=()=>{
  ensureManageIcon();
  const view=ensureManageView();
  if(!view)return;
  view.addEventListener('click',event=>{
    if(event.target?.closest?.('#codebase-new-project,#codebase-clone-project,#codebase-project-refresh,#codebase-disconnect-project,#codebase-remove-project')){
      scheduleRender(500);
      setTimeout(()=>scheduleRender(0),1400);
    }
  });
  void renderProjects();
  window.SulandraCodebaseManage={open:openManage,refresh:renderProjects};
};

const waitForProjectManager=attempt=>{
  if(document.getElementById('codebase-project-manager')&&window.SulandraCodebaseProjects){install();return}
  if(attempt>=80)return;
  setTimeout(()=>waitForProjectManager(attempt+1),50);
};
waitForProjectManager(0);
})();
