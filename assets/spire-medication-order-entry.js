(() => {
  'use strict';
  // SPIRE_MEDICATION_ORDER_ENTRY_V1
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  const PATIENT_KEY = 'spire:patientId';
  const SESSION_KEY = 'sulandra:employee:session';
  const clean = v => String(v ?? '').trim();
  const token = () => TOKEN_KEYS.map(k => sessionStorage.getItem(k) || localStorage.getItem(k)).find(Boolean) || '';
  const patientId = () => {
    const q = new URLSearchParams(location.search);
    const h = new URLSearchParams(String(location.hash || '').replace(/^#/,''));
    return clean(q.get('patientId') || h.get('patient') || sessionStorage.getItem(PATIENT_KEY));
  };
  const homeId = () => clean(new URLSearchParams(location.search).get('spireHome') || sessionStorage.getItem(HOME_ID_KEY) || localStorage.getItem(HOME_ID_KEY));
  const companyId = () => clean(new URLSearchParams(location.search).get('company') || sessionStorage.getItem(HOME_ENTITY_KEY) || sessionStorage.getItem(ENTITY_KEY) || localStorage.getItem(ENTITY_KEY));
  function role(){ for(const s of [sessionStorage,localStorage]){try{const p=JSON.parse(s.getItem(SESSION_KEY)||'null');const u=p?.user||p?.session||p;const r=clean(u?.role).toUpperCase();if(r)return r;}catch{}} return ''; }
  function canOrder(){ return new Set(['ADMINISTRATOR','PROGRAM_MANAGER','CEO','COO','DELEGATING_NURSE','LPN','RN']).has(role()); }
  async function api(path, options={}){
    const headers = new Headers(options.headers || {});
    headers.set('Accept','application/json');
    if(options.body!=null && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
    if(token()) headers.set('Authorization',`Bearer ${token()}`);
    if(companyId()) headers.set('x-legal-entity-id',companyId());
    if(homeId()) headers.set('x-spire-home-id',homeId());
    const r = await fetch(API+path,{...options,headers,cache:'no-store'});
    const p = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(p.error || p.message || `Request failed (${r.status})`);
    return p.data ?? p;
  }
  function styles(){ if(document.getElementById('spireMedicationOrderEntryStyles')) return; const s=document.createElement('style'); s.id='spireMedicationOrderEntryStyles'; s.textContent=`
    .spire-add-med-order{border:1px solid #0b6e8f;background:#0b728f;color:white;border-radius:4px;padding:6px 10px;font-weight:800;cursor:pointer;margin:8px 0}.spire-add-med-order:disabled{opacity:.55;cursor:not-allowed}
    #spireMedicationOrderModal{position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,.52);display:grid;place-items:center;padding:18px}#spireMedicationOrderModal[hidden]{display:none!important}#spireMedicationOrderModal .mcard{width:min(760px,96vw);max-height:94vh;overflow:auto;background:#fff;border:1px solid #8fb3c2;border-radius:7px;box-shadow:0 18px 55px rgba(0,0,0,.3)}#spireMedicationOrderModal header{display:flex;align-items:center;padding:11px 13px;background:#e7f6fb;border-bottom:1px solid #b8d5df;color:#075b78;font-weight:900}#spireMedicationOrderModal header button{margin-left:auto;border:1px solid #9ab7c3;background:#fff;border-radius:4px;padding:3px 8px}#spireMedicationOrderModal form{padding:14px}#spireMedicationOrderModal .grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}#spireMedicationOrderModal label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:800;color:#34586a}#spireMedicationOrderModal input,#spireMedicationOrderModal select,#spireMedicationOrderModal textarea{border:1px solid #9fbcc8;border-radius:4px;padding:7px 8px;font:inherit;background:#fff}#spireMedicationOrderModal textarea{min-height:84px}.full{grid-column:1/-1}.mstatus{margin-top:10px;padding:8px 9px;border-radius:4px;background:#eef7fa;color:#4d6d7a}.mstatus.error{background:#fff1f2;color:#9f1239;border:1px solid #fecdd3}.mstatus.success{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0}.mactions{display:flex;justify-content:flex-end;gap:8px;padding-top:12px}.mbtn{border:1px solid #0b6e8f;background:#0b728f;color:#fff;border-radius:4px;padding:6px 10px;font-weight:800}.mbtn.secondary{background:#fff;color:#174d60;border-color:#93b8c5}@media(max-width:720px){#spireMedicationOrderModal .grid{grid-template-columns:1fr}.full{grid-column:auto}}
  `; document.head.appendChild(s); }
  function panel(){
    const nodes=[...document.querySelectorAll('h1,h2,h3,h4,strong,div,span')];
    const title=nodes.find(n=>clean(n.textContent)==='Active Medication Orders');
    if(!title) return null;
    return {title,panel:title.closest('.spire-kv-card,.summary-card,.card,.panel,section,div') || title.parentElement};
  }
  function open(){
    if(!patientId()){alert('Open a client chart first.');return;}
    styles(); let m=document.getElementById('spireMedicationOrderModal');
    if(!m){m=document.createElement('div');m.id='spireMedicationOrderModal';m.hidden=true;m.innerHTML=`<div class="mcard" role="dialog" aria-modal="true"><header>Add Medication Order<button type="button" data-close>✕</button></header><form id="spireMedicationOrderForm"><div class="grid"><label class="full">Medication name<input name="name" required maxlength="250" placeholder="e.g., Acetaminophen 325 mg tablet"></label><label>Dose<input name="dose" required maxlength="160" placeholder="e.g., 650 mg"></label><label>Route<select name="route" required><option value="">Select route</option><option>PO</option><option>SL</option><option>BUCCAL</option><option>TOPICAL</option><option>INHALATION</option><option>SUBCUTANEOUS</option><option>INTRAMUSCULAR</option><option>RECTAL</option><option>OTHER</option></select></label><label>Frequency<input name="frequency" required maxlength="160" placeholder="e.g., Twice daily"></label><label>Administration times<input name="dueTimes" required placeholder="08:00, 20:00"></label><label>Start date<input name="startDate" type="date" required></label><label>End date<input name="endDate" type="date"></label><label class="full">Instructions / parameters<textarea name="instructions" maxlength="4000" placeholder="Administration instructions, PRN indication, hold parameters, monitoring requirements..."></textarea></label></div><div class="mstatus" id="spireMedicationOrderStatus">Saving activates the order and automatically generates the MAR schedule.</div><div class="mactions"><button type="button" class="mbtn secondary" data-close>Cancel</button><button type="submit" class="mbtn" id="spireMedicationOrderSave">Save & Activate Order</button></div></form></div>`;document.body.appendChild(m);m.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>m.hidden=true));m.addEventListener('click',e=>{if(e.target===m)m.hidden=true;});m.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget, st=m.querySelector('#spireMedicationOrderStatus'), save=m.querySelector('#spireMedicationOrderSave'), d=new FormData(f);const times=clean(d.get('dueTimes')).split(',').map(clean).filter(Boolean);if(!times.length||times.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))){st.className='mstatus error';st.textContent='Use 24-hour administration times such as 08:00, 20:00.';return;}const start=clean(d.get('startDate')),end=clean(d.get('endDate'));if(end&&end<start){st.className='mstatus error';st.textContent='End date cannot be before start date.';return;}const body={clientId:patientId(),name:clean(d.get('name')),dose:clean(d.get('dose')),route:clean(d.get('route')),frequency:clean(d.get('frequency')),dueTimes:times,startDate:start,...(end?{endDate:end}:{}),...(clean(d.get('instructions'))?{instructions:clean(d.get('instructions'))}:{})};save.disabled=true;st.className='mstatus';st.textContent='Saving medication order and generating MAR schedule…';try{await api('/api/admin/spire/medication-orders',{method:'POST',body:JSON.stringify(body)});st.className='mstatus success';st.textContent='Medication order activated and MAR schedule generated.';setTimeout(()=>location.reload(),650);}catch(err){st.className='mstatus error';st.textContent=err?.message||'Unable to save medication order.';save.disabled=false;}});}
    const f=m.querySelector('form');f.reset();const now=new Date();const day=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);f.elements.startDate.value=day;m.querySelector('#spireMedicationOrderStatus').className='mstatus';m.querySelector('#spireMedicationOrderStatus').textContent='Saving activates the order and automatically generates the MAR schedule.';m.hidden=false;f.elements.name.focus();
  }
  function install(){const found=panel();if(!found||!found.panel)return false;if(found.panel.querySelector('[data-spire-add-medication-order]'))return true;styles();const b=document.createElement('button');b.type='button';b.className='spire-add-med-order';b.dataset.spireAddMedicationOrder='true';b.textContent='+ Add Medication Order';if(!canOrder()){b.disabled=true;b.title='Authorized nurse or administrator role required';}b.addEventListener('click',open);found.title.insertAdjacentElement('afterend',b);return true;}
  if(!install()){const o=new MutationObserver(()=>{if(install())o.disconnect();});o.observe(document.documentElement,{childList:true,subtree:true});}
})();
