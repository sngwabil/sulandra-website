(() => {
  'use strict';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS=['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const COSIGN_ROLES=new Set(['RN','DELEGATING_NURSE']);
  const token=()=>TOKEN_KEYS.map(key=>sessionStorage.getItem(key)||localStorage.getItem(key)).find(Boolean)||'';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const state={cosigners:null,session:null,busy:false};
  let timer=0;

  async function api(path){
    const response=await fetch(API+path,{cache:'no-store',headers:{Accept:'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{})}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||payload.message||`Request failed (${response.status})`);
    return payload.data??payload;
  }
  async function session(){if(state.session)return state.session;state.session=await api('/api/session').catch(()=>({}));return state.session}
  async function cosigners(){if(Array.isArray(state.cosigners))return state.cosigners;state.cosigners=await api('/api/spire/workspaces/note-cosigners').catch(()=>[]);return Array.isArray(state.cosigners)?state.cosigners:[]}

  async function populateSelect(select){
    const people=await cosigners();
    const current=select.value;
    select.innerHTML='<option value="">No cosigner</option>'+people.map(person=>`<option value="${esc(person.id)}">${esc(person.displayName||person.email||person.id)} · ${esc(person.role||'')}</option>`).join('');
    if(current&&people.some(person=>String(person.id)===String(current)))select.value=current;
    select.dataset.spwcLicensedCosigners='true';
    const label=select.closest('label');
    if(label&&!label.querySelector('[data-spwc-cosigner-help]')){
      const help=document.createElement('span');
      help.dataset.spwcCosignerHelp='true';
      help.style.cssText='font-size:10px;font-weight:650;text-transform:none;color:#6a8290';
      help.textContent=people.length?'Eligible cosigners: RN / Delegating Nurse with active access to this company.':'No eligible RN or Delegating Nurse cosigner is currently available in this company.';
      select.after(help);
    }
  }

  async function reconcile(){
    if(state.busy)return;
    state.busy=true;
    try{
      const selects=[...document.querySelectorAll('#spwcNoteCosigner,#spwcSignCosigner')];
      for(const select of selects)if(select.dataset.spwcLicensedCosigners!=='true')await populateSelect(select);
      const s=await session();
      const role=String(s?.role||'').toUpperCase();
      if(!COSIGN_ROLES.has(role)){
        document.querySelectorAll('[data-note-cosign]').forEach(button=>{button.hidden=true;button.disabled=true;button.setAttribute('aria-hidden','true')});
      }
    }catch(error){
      console.error('[SPIRE note cosigner polish]',error);
    }finally{
      state.busy=false;
    }
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(reconcile,45)}
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('sulandra:entity-context-changed',()=>{state.cosigners=null;state.session=null;document.querySelectorAll('#spwcNoteCosigner,#spwcSignCosigner').forEach(select=>delete select.dataset.spwcLicensedCosigners);schedule()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
