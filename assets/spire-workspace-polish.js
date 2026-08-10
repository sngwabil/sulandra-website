(() => {
  'use strict';

  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS=['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const DELEGATE_ROLES=new Set(['ADMINISTRATOR','PROGRAM_MANAGER','DELEGATING_NURSE','RN','CEO','DOO']);
  const token=()=>TOKEN_KEYS.map(key=>sessionStorage.getItem(key)||localStorage.getItem(key)).find(Boolean)||'';
  const state={assignees:null,session:null,tasks:null,tasksLoadedAt:0,notesByPatient:new Map(),busy:false};
  let timer=0;

  async function api(path,options={}){
    const response=await fetch(API+path,{...options,cache:'no-store',headers:{Accept:'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{}) ,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||payload.message||`Request failed (${response.status})`);
    return payload.data??payload;
  }

  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fmt=value=>value?new Date(String(value)).toLocaleString():'—';
  const clean=value=>String(value??'').trim();
  const currentPatientId=()=>sessionStorage.getItem('spire:patientId')||new URLSearchParams(location.hash.replace(/^#/,'')).get('patient')||'';
  const selectedEntityId=()=>window.SulandraEntityContext?.get?.()?.selectedEntityId||sessionStorage.getItem('sulandra:selected-legal-entity-id')||localStorage.getItem('sulandra:selected-legal-entity-id')||'';

  async function session(){
    if(state.session)return state.session;
    state.session=await api('/api/session').catch(()=>({}));
    return state.session;
  }
  function canDelegate(s){
    const role=String(s?.role||'').toUpperCase();
    const email=String(s?.email||'').trim().toLowerCase();
    return Boolean(s?.enterpriseOwner)||email==='admin@sulandrahealth.com'||DELEGATE_ROLES.has(role);
  }
  async function assignees(force=false){
    if(Array.isArray(state.assignees)&&!force)return state.assignees;
    state.assignees=await api('/api/spire/workspaces/task-assignees').catch(()=>[]);
    return Array.isArray(state.assignees)?state.assignees:[];
  }
  async function taskData(force=false){
    if(!force&&state.tasks&&Date.now()-state.tasksLoadedAt<10000)return state.tasks;
    state.tasks=await api('/api/spire/workspaces/tasks').catch(()=>({items:[]}));
    state.tasksLoadedAt=Date.now();
    return state.tasks;
  }
  function invalidateTasks(){state.tasks=null;state.tasksLoadedAt=0;}
  function personName(id,people){
    const person=people.find(item=>String(item.id)===String(id));
    return person?.displayName||person?.email||id||'Unassigned';
  }

  function dialog(title,body,footer=''){
    document.getElementById('spwcPolishDialog')?.remove();
    const host=document.createElement('div');
    host.id='spwcPolishDialog';
    host.className='spwc-modal';
    host.innerHTML=`<div class="spwc-dialog" role="dialog" aria-modal="true"><header><h2>${escapeHtml(title)}</h2><button type="button" data-polish-close aria-label="Close">×</button></header><div class="spwc-dialog-body">${body}</div><footer>${footer}<button type="button" class="spwc-secondary" data-polish-close>Close</button></footer></div>`;
    document.body.appendChild(host);
    host.addEventListener('click',event=>{if(event.target===host||event.target.closest('[data-polish-close]'))host.remove()});
    return host;
  }

  async function polishTaskWorkspace(){
    const workspace=document.getElementById('spireGenericWorkspace');
    if(!workspace?.querySelector('[data-task-search]'))return;
    const [people,s,taskPayload]=await Promise.all([assignees(),session(),taskData()]);
    const byId=new Map((Array.isArray(taskPayload?.items)?taskPayload.items:[]).map(task=>[String(task.id),task]));
    const canManage=canDelegate(s);
    for(const row of workspace.querySelectorAll('.spwc-table tbody tr')){
      const actionButton=row.querySelector('[data-task-action][data-id]');
      const taskId=actionButton?.dataset.id;
      const task=taskId?byId.get(String(taskId)):null;
      if(!task)continue;
      row.dataset.spwcTaskId=String(taskId);
      row.dataset.spwcTaskStatus=String(task.status||'');
      const cells=row.cells;
      if(cells&&cells.length>=7){
        const cell=cells[5];
        if(cell.dataset.spwcAssigneePolished!=='true'){
          const name=personName(task.assignedUserId,people);
          const person=people.find(item=>String(item.id)===String(task.assignedUserId));
          const detail=person?[person.role,person.email&&person.email!==name?person.email:''].filter(Boolean).join(' · '):'';
          cell.innerHTML=task.assignedUserId?`<strong>${escapeHtml(name)}</strong>${detail?`<div class="muted">${escapeHtml(detail)}</div>`:''}`:'<span class="muted">Unassigned</span>';
          cell.dataset.spwcAssigneePolished='true';
        }
        const actions=cells[6].querySelector('.spwc-actions')||cells[6];
        if(!actions.querySelector(`[data-polish-task-details="${CSS.escape(String(taskId))}"]`)){
          const details=document.createElement('button');details.type='button';details.dataset.polishTaskDetails=String(taskId);details.textContent='Details';actions.appendChild(details);
        }
        const open=['OPEN','IN_PROGRESS'].includes(String(task.status));
        const closed=['COMPLETED','CANCELLED'].includes(String(task.status));
        if(canManage&&open&&!actions.querySelector(`[data-polish-task-reassign="${CSS.escape(String(taskId))}"]`)){
          const assign=document.createElement('button');assign.type='button';assign.dataset.polishTaskReassign=String(taskId);assign.textContent='Reassign';actions.appendChild(assign);
        }
        if(canManage&&closed&&!actions.querySelector(`[data-polish-task-reopen="${CSS.escape(String(taskId))}"]`)){
          const reopen=document.createElement('button');reopen.type='button';reopen.dataset.polishTaskReopen=String(taskId);reopen.textContent='Reopen';actions.appendChild(reopen);
        }
      }
    }
  }

  async function openTaskDetails(taskId){
    const [payload,people]=await Promise.all([taskData(true),assignees()]);
    const task=(Array.isArray(payload?.items)?payload.items:[]).find(item=>String(item.id)===String(taskId));
    if(!task)return;
    const events=Array.isArray(task.events)?task.events:[];
    const patient=task.patientName||task.homeName||'General work item';
    dialog('Task Details',`<div class="spwc-plan-grid"><section class="spwc-plan-card"><h3>${escapeHtml(task.title||'Task')}</h3><div class="spwc-list"><article><strong>Status</strong><span>${escapeHtml(task.status||'')} · ${escapeHtml(task.priority||'ROUTINE')}</span></article><article><strong>Patient / Location</strong><span>${escapeHtml(patient)}${task.medicalRecordNumber?` · ${escapeHtml(task.medicalRecordNumber)}`:''}</span></article><article><strong>Assigned Employee</strong><span>${escapeHtml(personName(task.assignedUserId,people))}</span></article><article><strong>Due</strong><span>${escapeHtml(fmt(task.dueAt))}</span></article><article><strong>Task Type</strong><span>${escapeHtml(task.taskType||'')}</span></article></div></section><section class="spwc-plan-card"><h3>Instructions</h3><div class="spwc-note-preview" style="min-height:120px">${escapeHtml(task.instructions||'No additional instructions.')}</div></section><section class="spwc-plan-card wide"><h3>Task History & Comments</h3><div class="spwc-list">${events.length?events.map(event=>`<article><strong>${escapeHtml(event.eventType||'EVENT')} ${event.fromStatus&&event.toStatus?`· ${escapeHtml(event.fromStatus)} → ${escapeHtml(event.toStatus)}`:''}</strong><span>${escapeHtml(fmt(event.createdAt))} · ${escapeHtml(personName(event.actorUserId,people))}${event.comment?`<br>${escapeHtml(event.comment)}`:''}</span></article>`).join(''):'<article><span>No task events have been recorded.</span></article>'}</div></section></div>`);
  }

  async function openReassign(taskId){
    const people=await assignees(true);
    if(!people.length){alert('No eligible employees are available in this company.');return}
    const host=dialog('Reassign Task',`<div class="spwc-form-grid"><label class="wide">Employee<select id="spwcPolishAssignee">${people.map(person=>`<option value="${escapeHtml(person.id)}">${escapeHtml(person.displayName||person.email||person.id)} · ${escapeHtml(person.role||'')}</option>`).join('')}</select></label><label class="wide">Assignment Note<textarea id="spwcPolishAssignComment" placeholder="Optional handoff or reassignment note"></textarea></label></div>`,`<button type="button" class="spwc-primary" id="spwcPolishAssignSave">Reassign Task</button>`);
    host.querySelector('#spwcPolishAssignSave').onclick=async()=>{
      const assignedUserId=host.querySelector('#spwcPolishAssignee').value;
      const comment=host.querySelector('#spwcPolishAssignComment').value.trim()||null;
      try{
        await api(`/api/spire/workspaces/tasks/${encodeURIComponent(taskId)}/action`,{method:'POST',body:JSON.stringify({action:'ASSIGN',assignedUserId,comment})});
        host.remove();invalidateTasks();state.assignees=null;window.SpireWorkspaceCompletion?.renderCurrent?.(true);
      }catch(error){alert(error.message)}
    };
  }

  async function reopenTask(taskId){
    const comment=prompt('Reason or follow-up note for reopening this task:')?.trim()||null;
    if(!confirm('Reopen this completed/cancelled task and return it to Open status?'))return;
    try{
      await api(`/api/spire/workspaces/tasks/${encodeURIComponent(taskId)}/action`,{method:'POST',body:JSON.stringify({action:'REOPEN',comment})});
      invalidateTasks();window.SpireWorkspaceCompletion?.renderCurrent?.(true);
    }catch(error){alert(error.message)}
  }

  async function noteData(patientId){
    const cached=state.notesByPatient.get(patientId);
    if(cached&&Date.now()-cached.loadedAt<15000)return cached.data;
    const data=await api(`/api/spire/patients/${encodeURIComponent(patientId)}/notes-workspace`);
    state.notesByPatient.set(patientId,{loadedAt:Date.now(),data});
    return data;
  }

  function ensureSharedBanner(container,note){
    let banner=container.querySelector('[data-spwc-shared-note-banner]');
    if(!banner){
      banner=document.createElement('div');
      banner.dataset.spwcSharedNoteBanner='true';
      banner.style.cssText='margin:10px 0;padding:10px 12px;border:1px solid #c7d9e4;border-radius:9px;background:#f2f8fb;color:#315d73;font-size:11px;font-weight:750';
      const preview=container.querySelector('.spwc-note-preview');
      if(preview)preview.before(banner);else container.prepend(banner);
    }
    banner.innerHTML='<strong>Shared chart history · Read only in this company.</strong><br>This note originated in another Sulandra legal entity. Its clinical content remains visible to authorized staff, but editing and signing stay with the source company.';
    banner.hidden=false;
    container.dataset.sharedLegalEntityId=String(note.legalEntityId||'');
  }

  async function polishSharedNote(){
    const body=document.getElementById('spireChartTabBody');
    if(!body?.querySelector('.spwc-note-layout'))return;
    const active=body.querySelector('.spwc-note-item.active[data-note-id]');
    const noteId=active?.dataset.noteId;
    const patientId=currentPatientId();
    if(!noteId||!patientId)return;
    const data=await noteData(patientId).catch(()=>null);
    const note=Array.isArray(data?.items)?data.items.find(item=>String(item.id)===String(noteId)):null;
    if(!note)return;
    const selected=String(data.selectedLegalEntityId||selectedEntityId()||'');
    const source=String(note.legalEntityId||'');
    const shared=Boolean(selected&&source&&selected!==source);
    const panel=body.querySelector('.spwc-note-layout > section.panel');
    if(!panel)return;
    const banner=panel.querySelector('[data-spwc-shared-note-banner]');
    if(shared){
      panel.querySelectorAll('[data-note-edit],[data-note-sign]').forEach(button=>{button.hidden=true;button.disabled=true;button.setAttribute('aria-hidden','true')});
      ensureSharedBanner(panel,note);
    }else if(banner){
      banner.hidden=true;
    }
  }

  document.addEventListener('click',event=>{
    const details=event.target.closest('[data-polish-task-details]');
    if(details){event.preventDefault();event.stopPropagation();openTaskDetails(details.dataset.polishTaskDetails);return}
    const reassign=event.target.closest('[data-polish-task-reassign]');
    if(reassign){event.preventDefault();event.stopPropagation();openReassign(reassign.dataset.polishTaskReassign);return}
    const reopen=event.target.closest('[data-polish-task-reopen]');
    if(reopen){event.preventDefault();event.stopPropagation();reopenTask(reopen.dataset.polishTaskReopen);}
  },true);

  async function reconcile(){
    if(state.busy)return;
    state.busy=true;
    try{
      await polishTaskWorkspace();
      await polishSharedNote();
    }catch(error){
      console.error('[SPIRE workspace polish]',error);
    }finally{
      state.busy=false;
    }
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(reconcile,90)}
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  window.addEventListener('spire:workspace-preferences-updated',schedule);
  window.addEventListener('sulandra:entity-context-changed',()=>{state.assignees=null;state.session=null;state.notesByPatient.clear();invalidateTasks();schedule()});
  window.addEventListener('focus',schedule);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
