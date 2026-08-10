(() => {
  'use strict';

  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS=['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const token=()=>TOKEN_KEYS.map(key=>sessionStorage.getItem(key)||localStorage.getItem(key)).find(Boolean)||'';
  const state={assignees:null,notesByPatient:new Map(),busy:false};
  let timer=0;

  async function api(path){
    const response=await fetch(API+path,{cache:'no-store',headers:{Accept:'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{})}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||payload.message||`Request failed (${response.status})`);
    return payload.data??payload;
  }

  async function assignees(){
    if(Array.isArray(state.assignees))return state.assignees;
    state.assignees=await api('/api/spire/workspaces/task-assignees').catch(()=>[]);
    return Array.isArray(state.assignees)?state.assignees:[];
  }

  async function polishTaskAssignees(){
    const workspace=document.getElementById('spireGenericWorkspace');
    if(!workspace?.querySelector('[data-task-search]'))return;
    const people=await assignees();
    if(!people.length)return;
    const byId=new Map(people.map(person=>[String(person.id),person]));
    for(const row of workspace.querySelectorAll('.spwc-table tbody tr')){
      if(row.dataset.spwcAssigneePolished==='true')continue;
      const cells=row.cells;
      if(!cells||cells.length<7)continue;
      const cell=cells[5];
      const raw=String(cell.textContent||'').trim();
      const person=byId.get(raw);
      if(person){
        const name=person.displayName||person.email||person.id;
        const detail=[person.role,person.email&&person.email!==name?person.email:''].filter(Boolean).join(' · ');
        cell.innerHTML=`<strong>${escapeHtml(name)}</strong>${detail?`<div class="muted">${escapeHtml(detail)}</div>`:''}`;
      }else if(!raw||raw==='Unassigned'){
        cell.innerHTML='<span class="muted">Unassigned</span>';
      }
      row.dataset.spwcAssigneePolished='true';
    }
  }

  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const currentPatientId=()=>sessionStorage.getItem('spire:patientId')||new URLSearchParams(location.hash.replace(/^#/,'')).get('patient')||'';
  const selectedEntityId=()=>window.SulandraEntityContext?.get?.()?.selectedEntityId||sessionStorage.getItem('sulandra:selected-legal-entity-id')||localStorage.getItem('sulandra:selected-legal-entity-id')||'';

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
    banner.innerHTML=`<strong>Shared chart history · Read only in this company.</strong><br>This note originated in another Sulandra legal entity. Its clinical content remains visible to authorized staff, but editing and signing stay with the source company.`;
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
    }else{
      if(banner)banner.hidden=true;
    }
  }

  async function reconcile(){
    if(state.busy)return;
    state.busy=true;
    try{
      await polishTaskAssignees();
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
  window.addEventListener('sulandra:entity-context-changed',()=>{state.assignees=null;state.notesByPatient.clear();schedule()});
  window.addEventListener('focus',schedule);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
