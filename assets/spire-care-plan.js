(() => {
  'use strict';

  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const keys=['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const token=()=>keys.map(k=>sessionStorage.getItem(k)||localStorage.getItem(k)).find(Boolean)||'';
  const patientId=()=>sessionStorage.getItem('spire:patientId')||new URLSearchParams(location.hash.replace(/^#/,'')).get('patient')||'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const arr=v=>Array.isArray(v)?v:[];

  async function api(path,options={}){
    const r=await fetch(API+path,{
      ...options,
      cache:'no-store',
      headers:{
        Accept:'application/json',
        ...(token()?{Authorization:`Bearer ${token()}`}:{ }),
        ...(options.body?{'Content-Type':'application/json'}:{ }),
        ...(options.headers||{}),
      },
    });
    const p=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(p.error||p.message||`Request failed (${r.status})`);
    return p.data??p;
  }

  function toast(text,error=false){
    let el=document.getElementById('spireCareToast');
    if(!el){el=document.createElement('div');el.id='spireCareToast';document.body.appendChild(el);}
    el.className='spire-care-toast'+(error?' error':'');
    el.textContent=text;
    el.hidden=false;
    clearTimeout(el._t);
    el._t=setTimeout(()=>{el.hidden=true;},3000);
  }

  function modal(title,body){
    const host=document.createElement('div');
    host.className='spire-care-modal';
    host.innerHTML=`<div class="spire-care-dialog"><header><strong>${esc(title)}</strong><button data-close>×</button></header><div class="spire-care-body">${body}</div></div>`;
    host.onclick=e=>{if(e.target===host||e.target.closest('[data-close]'))host.remove();};
    document.body.appendChild(host);
    return host;
  }

  function activePlanHtml(d,p){
    const goals=arr(d.goals);
    const risks=arr(d.risks);
    const signatures=arr(d.signatures);
    const interventions=arr(d.interventions);
    const assessments=arr(d.assessments);
    const services=arr(d.services);

    const goalRows=goals.length?goals.map(g=>{
      const progress=Math.max(0,Math.min(100,Number(g.progressPercent||0)));
      return `<article class="spire-goal"><div><strong>${esc(g.title)}</strong><span>${esc(g.desiredOutcome||'')}</span></div><div class="goal-progress"><i style="width:${progress}%"></i></div><small>${esc(progress)}% · Review ${esc(g.reviewDate||'—')}</small><button data-goal-progress="${esc(g.id)}">Document Progress</button></article>`;
    }).join(''):'<p class="empty">No goals documented.</p>';

    const interventionRows=interventions.length?interventions.map(i=>`<article><strong>${esc(i.title)}</strong><p>${esc(i.instructions)}</p><small>${esc(i.frequency||'')} ${esc(i.responsibleRole||'')}</small></article>`).join(''):'<p class="empty">No interventions documented.</p>';
    const assessmentRows=assessments.length?assessments.map(a=>`<article><strong>${esc(a.templateTitle||'Assessment')}</strong><span>${esc(a.category||'')} · ${esc(a.status||'')}</span><small>${esc(a.completedAt?new Date(a.completedAt).toLocaleDateString():'')}</small></article>`).join(''):'<p class="empty">No structured assessments completed.</p>';
    const serviceRows=services.length?services.map(s=>`<article><strong>${esc(s.serviceName||s.serviceCode||'Service')}</strong><span>${esc(s.approvedServiceType||'')}</span><small>${esc(s.authorizedUnits??'')} units · ${esc(s.startsAt||'')} – ${esc(s.endsAt||'')}</small></article>`).join(''):'<p class="empty">No care-plan service links.</p>';
    const signatureRows=signatures.length?signatures.map(s=>`<article><strong>${esc(s.signerName)}</strong><span>${esc(s.signerRole)}</span><small>${esc(s.signedAt?new Date(s.signedAt).toLocaleString():'')}</small></article>`).join(''):'<p class="empty">No signatures yet.</p>';

    return `<div class="spire-care-summary"><article><span>Status</span><strong>${esc(p.status||'DRAFT')}</strong></article><article><span>Effective</span><strong>${esc(p.effectiveDate||'—')}</strong></article><article><span>Annual Review</span><strong>${esc(p.annualReviewDate||'—')}</strong></article><article><span>Goals</span><strong>${goals.length}</strong></article><article><span>Risks</span><strong>${risks.length}</strong></article><article><span>Signatures</span><strong>${signatures.length}</strong></article></div>
      <div class="spire-care-grid"><section><h3>Person-Centered Profile</h3><dl><dt>Important To</dt><dd>${esc(p.importantTo||'—')}</dd><dt>Important For</dt><dd>${esc(p.importantFor||'—')}</dd><dt>Communication</dt><dd>${esc(p.communicationPlan||'—')}</dd><dt>Transportation</dt><dd>${esc(p.transportationPlan||'—')}</dd><dt>Meal Plan</dt><dd>${esc(p.mealPlan||'—')}</dd></dl></section><section><h3>Safety & Support Plans</h3><dl><dt>Behavior Support</dt><dd>${esc(p.behaviorSupportPlan||'—')}</dd><dt>Emergency</dt><dd>${esc(p.emergencyPlan||'—')}</dd><dt>Rights Modifications</dt><dd>${esc(p.rightsModifications||'—')}</dd><dt>Restrictive Measures</dt><dd>${esc(p.restrictiveMeasures||'—')}</dd><dt>Nursing Delegation</dt><dd>${esc(p.nursingDelegationInstructions||'—')}</dd></dl></section></div>
      <section class="spire-care-panel"><header><h3>Goals & Outcomes</h3><button data-care-goal>+ Goal</button></header>${goalRows}</section>
      <section class="spire-care-panel"><header><h3>Interventions / Staff Instructions</h3><button data-care-intervention>+ Intervention</button></header>${interventionRows}</section>
      <section class="spire-care-panel"><h3>Assessments</h3>${assessmentRows}</section>
      <section class="spire-care-panel"><h3>Service Authorizations / Supports</h3>${serviceRows}</section>
      <section class="spire-care-panel"><h3>Signatures</h3>${signatureRows}</section>`;
  }

  async function render(){
    const id=patientId();
    const body=document.getElementById('spireChartTabBody');
    if(!id||!body)return;
    body.innerHTML='<div class="spire-care-loading">Loading Care Plan / ISP…</div>';
    try{
      const d=await api(`/api/spire/patients/${encodeURIComponent(id)}/care-plan/overview`);
      const p=d.current;
      const actions=`<button data-care-new>${p?'New Version':'Create ISP'}</button>${p?'<button data-care-sign>Sign Plan</button>':''}`;
      const content=p?activePlanHtml(d,p):`<div class="spire-care-empty"><h3>No active ISP</h3><p>Create the patient&#39;s first person-centered Care Plan / ISP.</p><button data-care-new>Create ISP</button></div>`;
      body.innerHTML=`<div class="spire-care-head"><div><h2>Care Plan / ISP</h2><p>Person-centered supports, goals, risks, service links, assessments and signatures.</p></div><div>${actions}</div></div>${content}`;
    }catch(e){
      body.innerHTML=`<div class="spire-care-error">${esc(e.message)}</div>`;
    }
  }

  function createPlan(){
    const h=modal('Create Care Plan / ISP',`<label>Title<input id="cpTitle" value="Individual Service Plan"></label><div class="two"><label>Effective Date<input id="cpEffective" type="date"></label><label>Annual Review Date<input id="cpReview" type="date"></label></div><label>Person-Centered Summary<textarea id="cpSummary"></textarea></label><label>Important To<textarea id="cpImportantTo"></textarea></label><label>Important For<textarea id="cpImportantFor"></textarea></label><label>Communication Plan<textarea id="cpCommunication"></textarea></label><label>Transportation Plan<textarea id="cpTransportation"></textarea></label><label>Meal Plan<textarea id="cpMeal"></textarea></label><label>Behavior Support Plan<textarea id="cpBehavior"></textarea></label><label>Emergency Plan<textarea id="cpEmergency"></textarea></label><label>Rights Modifications<textarea id="cpRights"></textarea></label><label>Restrictive Measures<textarea id="cpRestrictions"></textarea></label><label>Nursing Delegation Instructions<textarea id="cpNursing"></textarea></label><button class="primary" id="cpSave">Create Plan</button>`);
    h.querySelector('#cpSave').onclick=async()=>{
      try{
        await api(`/api/spire/patients/${encodeURIComponent(patientId())}/care-plans`,{method:'POST',body:JSON.stringify({title:h.querySelector('#cpTitle').value,effectiveDate:h.querySelector('#cpEffective').value||null,annualReviewDate:h.querySelector('#cpReview').value||null,personCenteredSummary:h.querySelector('#cpSummary').value,importantTo:h.querySelector('#cpImportantTo').value,importantFor:h.querySelector('#cpImportantFor').value,communicationPlan:h.querySelector('#cpCommunication').value,transportationPlan:h.querySelector('#cpTransportation').value,mealPlan:h.querySelector('#cpMeal').value,behaviorSupportPlan:h.querySelector('#cpBehavior').value,emergencyPlan:h.querySelector('#cpEmergency').value,rightsModifications:h.querySelector('#cpRights').value,restrictiveMeasures:h.querySelector('#cpRestrictions').value,nursingDelegationInstructions:h.querySelector('#cpNursing').value})});
        h.remove();toast('Care Plan / ISP created.');render();
      }catch(e){toast(e.message,true);}
    };
  }

  async function current(){return api(`/api/spire/patients/${encodeURIComponent(patientId())}/care-plan/overview`);}

  async function addGoal(){
    const d=await current(),p=d.current;if(!p)return createPlan();
    const h=modal('Add ISP Goal',`<label>Goal Title<input id="gTitle"></label><label>Baseline<textarea id="gBaseline"></textarea></label><label>Desired Outcome<textarea id="gOutcome"></textarea></label><div class="two"><label>Frequency<input id="gFrequency"></label><label>Responsible Discipline<input id="gRole"></label></div><div class="two"><label>Due Date<input id="gDue" type="date"></label><label>Review Date<input id="gReview" type="date"></label></div><button class="primary" id="gSave">Add Goal</button>`);
    h.querySelector('#gSave').onclick=async()=>{try{await api(`/api/spire/patients/${encodeURIComponent(patientId())}/care-plans/${encodeURIComponent(p.id)}/goals`,{method:'POST',body:JSON.stringify({title:h.querySelector('#gTitle').value,baseline:h.querySelector('#gBaseline').value,desiredOutcome:h.querySelector('#gOutcome').value,frequency:h.querySelector('#gFrequency').value,responsibleDiscipline:h.querySelector('#gRole').value,dueDate:h.querySelector('#gDue').value||null,reviewDate:h.querySelector('#gReview').value||null})});h.remove();toast('Goal added.');render();}catch(e){toast(e.message,true);}};
  }

  async function addIntervention(){
    const d=await current(),p=d.current;if(!p)return createPlan();
    const h=modal('Add Staff Intervention',`<label>Title<input id="iTitle"></label><label>Instructions<textarea id="iInstructions" rows="7"></textarea></label><div class="two"><label>Frequency<input id="iFrequency"></label><label>Responsible Role<input id="iRole"></label></div><label>Service Type<input id="iService"></label><button class="primary" id="iSave">Add Intervention</button>`);
    h.querySelector('#iSave').onclick=async()=>{try{await api(`/api/spire/patients/${encodeURIComponent(patientId())}/care-plans/${encodeURIComponent(p.id)}/interventions`,{method:'POST',body:JSON.stringify({title:h.querySelector('#iTitle').value,instructions:h.querySelector('#iInstructions').value,frequency:h.querySelector('#iFrequency').value,responsibleRole:h.querySelector('#iRole').value,serviceType:h.querySelector('#iService').value})});h.remove();toast('Intervention added.');render();}catch(e){toast(e.message,true);}};
  }

  async function progress(goalId){
    const d=await current(),p=d.current;if(!p)return;
    const h=modal('Document Goal Progress',`<label>Progress %<input id="gpPercent" type="number" min="0" max="100"></label><label>Narrative<textarea id="gpNarrative" rows="6"></textarea></label><button class="primary" id="gpSave">Save Progress</button>`);
    h.querySelector('#gpSave').onclick=async()=>{try{await api(`/api/spire/patients/${encodeURIComponent(patientId())}/care-plans/${encodeURIComponent(p.id)}/progress`,{method:'POST',body:JSON.stringify({goalId,progressPercent:Number(h.querySelector('#gpPercent').value||0),narrative:h.querySelector('#gpNarrative').value})});h.remove();toast('Goal progress documented.');render();}catch(e){toast(e.message,true);}};
  }

  async function sign(){
    const d=await current(),p=d.current;if(!p)return;
    const h=modal('Sign Care Plan / ISP',`<label>Signer Role<select id="sRole"><option>CLIENT</option><option>GUARDIAN</option><option>SSA</option><option>RN</option><option>DSP</option><option>ADMINISTRATOR</option></select></label><label>Signer Name<input id="sName"></label><label>Attestation<textarea id="sAttest">I attest that I reviewed and agree with this plan as documented.</textarea></label><button class="primary" id="sSave">Sign Electronically</button>`);
    h.querySelector('#sSave').onclick=async()=>{try{await api(`/api/spire/patients/${encodeURIComponent(patientId())}/care-plans/${encodeURIComponent(p.id)}/signatures`,{method:'POST',body:JSON.stringify({signerRole:h.querySelector('#sRole').value,signerName:h.querySelector('#sName').value,attestation:h.querySelector('#sAttest').value})});h.remove();toast('Plan signed.');render();}catch(e){toast(e.message,true);}};
  }

  document.addEventListener('click',e=>{
    const tab=e.target.closest('[data-chart-tab]');
    if(tab?.dataset.chartTab==='care-plan')setTimeout(render,0);
    if(e.target.closest('[data-care-new]'))createPlan();
    if(e.target.closest('[data-care-goal]'))addGoal();
    if(e.target.closest('[data-care-intervention]'))addIntervention();
    if(e.target.closest('[data-care-sign]'))sign();
    const gp=e.target.closest('[data-goal-progress]');
    if(gp)progress(gp.dataset.goalProgress);
  });

  window.SpireCarePlan={render};
})();
