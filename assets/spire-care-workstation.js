(() => {
  'use strict';
  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const token = () => TOKEN_KEYS.map(k => sessionStorage.getItem(k) || localStorage.getItem(k)).find(Boolean) || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arr = value => Array.isArray(value) ? value : [];
  const fmt = value => value ? new Date(String(value)).toLocaleString() : '—';
  const fmtDate = value => value ? new Date(String(value)).toLocaleDateString() : '—';
  const state = { patientId:'', context:null, catalog:[], flowsheet:null, sleep:[], tab:'overview', admin:false, photoUrl:'' };

  async function api(path, options = {}) {
    const response = await fetch(API + path, {
      ...options,
      cache:'no-store',
      headers:{ Accept:'application/json', ...(token()?{Authorization:`Bearer ${token()}`}:{ }), ...(options.body?{'Content-Type':'application/json'}:{}), ...(options.headers||{}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data ?? payload;
  }

  async function apiBlob(path) {
    const response = await fetch(API + path, { cache:'no-store', headers:{ ...(token()?{Authorization:`Bearer ${token()}`}:{}) } });
    if (!response.ok) return null;
    return response.blob();
  }

  function patientFromHash() {
    const raw = location.hash.replace(/^#/, '');
    const params = new URLSearchParams(raw);
    return params.get('patient') || '';
  }

  function nameOf(patient) {
    return [patient?.preferredName || patient?.firstName, patient?.middleName, patient?.lastName].filter(Boolean).join(' ') || patient?.displayName || 'Patient';
  }

  function toast(message, error=false) {
    document.querySelector('.cw-toast')?.remove();
    const node = document.createElement('div'); node.className = `cw-toast${error?' error':''}`; node.textContent = message;
    document.body.append(node); setTimeout(() => node.remove(), 3600);
  }

  function nowLocalInput() {
    const d = new Date(Date.now() - new Date().getTimezoneOffset()*60000);
    return d.toISOString().slice(0,16);
  }

  function install() {
    if (document.getElementById('spireCareWorkspace')) return;
    const launch = document.createElement('button');
    launch.id='spireCareLaunch'; launch.type='button'; launch.textContent='S.P.I.R.E. Care Workstation'; launch.addEventListener('click', open);
    document.body.append(launch);
    const workspace = document.createElement('section');
    workspace.id='spireCareWorkspace'; workspace.setAttribute('aria-label','S.P.I.R.E. Care Workstation');
    workspace.innerHTML=`
      <header class="cw-top">
        <div class="cw-brand"><div class="cw-mark">S</div><div><strong>S.P.I.R.E.</strong><span>Sulandra Integrated Patient Record & Experience</span></div></div>
        <div class="cw-top-search"><input id="cwQuickSearch" type="search" placeholder="Search this patient workspace"></div>
        <div class="cw-top-actions"><button id="cwAdminMode" type="button" hidden>✎ Admin Edit</button><button id="cwRefresh" type="button">↻ Refresh</button><button id="cwClose" type="button">Return to S.P.I.R.E.</button></div>
      </header>
      <div class="cw-body"><aside class="cw-patient-rail" id="cwPatientRail"></aside><main class="cw-main"><nav class="cw-tabs" id="cwTabs"></nav><div id="cwPages"></div></main></div>`;
    document.body.append(workspace);
    document.getElementById('cwClose').onclick=close;
    document.getElementById('cwRefresh').onclick=()=>load(true);
    document.getElementById('cwAdminMode').onclick=toggleAdmin;
    document.getElementById('cwQuickSearch').oninput=event=>filterVisible(String(event.target.value||''));
    window.addEventListener('hashchange', syncPatient);
    window.addEventListener('popstate', syncPatient);
    document.addEventListener('click', event => { if (event.target.closest('[data-patient-id]')) setTimeout(syncPatient, 700); }, true);
    syncPatient();
  }

  function syncPatient() {
    const id=patientFromHash(); state.patientId=id;
    document.body.classList.toggle('spire-care-has-patient', Boolean(id));
    if (!id && document.getElementById('spireCareWorkspace')?.classList.contains('active')) close();
  }

  async function open() {
    syncPatient();
    if (!state.patientId) return toast('Open a patient chart first.', true);
    document.getElementById('spireCareWorkspace').classList.add('active');
    document.body.style.overflow='hidden';
    await load(false);
  }

  function close() {
    document.getElementById('spireCareWorkspace')?.classList.remove('active','cw-admin');
    document.body.style.overflow=''; state.admin=false;
  }

  async function load(force) {
    if (!state.patientId) return;
    const pages=document.getElementById('cwPages');
    if (pages && (!state.context || force)) pages.innerHTML='<div class="cw-card"><strong>Loading care workstation…</strong></div>';
    try {
      const [context,catalog,flowsheet,sleep] = await Promise.all([
        api(`/api/spire/care-workstation/patients/${encodeURIComponent(state.patientId)}`),
        api('/api/spire/care-workstation/catalog'),
        api(`/api/spire/patients/${encodeURIComponent(state.patientId)}/flowsheets`).catch(()=>({rows:[],entries:[]})),
        api(`/api/spire/care-workstation/patients/${encodeURIComponent(state.patientId)}/sleep-wake`).catch(()=>[]),
      ]);
      state.context=context; state.catalog=arr(catalog); state.flowsheet=flowsheet||{rows:[],entries:[]}; state.sleep=arr(sleep);
      const adminButton=document.getElementById('cwAdminMode');
      if (adminButton) adminButton.hidden=!context.permissions?.adminEdit;
      render(); loadPhoto();
    } catch (error) { pages.innerHTML=`<div class="cw-card"><h2>Care workstation could not load</h2><p>${esc(error.message)}</p></div>`; }
  }

  async function loadPhoto() {
    if (state.photoUrl) { URL.revokeObjectURL(state.photoUrl); state.photoUrl=''; }
    const blob=await apiBlob(`/api/spire/care-workstation/patients/${encodeURIComponent(state.patientId)}/photo`).catch(()=>null);
    if (blob) { state.photoUrl=URL.createObjectURL(blob); const img=document.getElementById('cwPatientPhoto'); if(img){img.src=state.photoUrl;img.hidden=false;document.querySelector('.cw-photo-fallback')?.setAttribute('hidden','hidden');} }
  }

  function toggleAdmin() {
    state.admin=!state.admin;
    const workspace=document.getElementById('spireCareWorkspace'); workspace.classList.toggle('cw-admin',state.admin);
    const button=document.getElementById('cwAdminMode'); button.classList.toggle('cw-admin-active',state.admin); button.textContent=state.admin?'✎ Admin Edit ON':'✎ Admin Edit';
    renderRail(); renderPage();
  }

  const tabs=[['overview','Overview'],['isp','ISP & Outcomes'],['daily','Daily Support'],['sleep','Sleep / Wake'],['clinical','Clinical'],['meds','Medications'],['documents','Documents'],['compliance','Audit Readiness']];
  function render() { renderRail(); renderTabs(); renderPage(); }
  function renderTabs() {
    const host=document.getElementById('cwTabs'); host.innerHTML=tabs.map(([key,label])=>`<button type="button" data-cw-tab="${key}" class="${state.tab===key?'active':''}">${label}</button>`).join('');
    host.querySelectorAll('[data-cw-tab]').forEach(button=>button.onclick=()=>{state.tab=button.dataset.cwTab;renderTabs();renderPage();});
  }

  function profileValue(...keys) {
    const p=state.context?.intakeProfile||{}; for(const key of keys){const value=p[key];if(value!=null&&value!=='')return value;}return '';
  }

  function renderRail() {
    const c=state.context||{},p=c.patient||{},profile=c.intakeProfile||{};
    const alerts=[profile.allergies||p.allergies, profile.riskSummary, profile.safetyConcerns].filter(Boolean).join(' • ');
    const source=c.intakeAdmissionSummary;
    document.getElementById('cwPatientRail').innerHTML=`
      <div class="cw-photo-wrap"><img id="cwPatientPhoto" alt="Patient" hidden><div class="cw-photo-fallback">${esc((p.firstName||'P').slice(0,1)+(p.lastName||'').slice(0,1))}</div><button class="cw-btn cw-photo-edit" id="cwPhotoEdit" type="button">✎ Photo</button></div>
      <div class="cw-name">${esc(nameOf(p))}</div>
      <div class="cw-sub">MRN ${esc(p.medicalRecordNumber||'—')} · DOB ${esc(fmtDate(p.dateOfBirth))}<br>${esc(profileValue('preferredPronouns','pronouns')||'')}</div>
      ${alerts?`<div class="cw-alert"><strong>Safety / clinical alerts</strong><br>${esc(alerts)}</div>`:''}
      <div class="cw-rail-block"><h4>Demographics</h4>
        <div class="cw-rail-row"><span>Preferred name</span><b>${esc(p.preferredName||'—')}</b></div>
        <div class="cw-rail-row"><span>Language</span><b>${esc(p.preferredLanguage||profile.preferredLanguage||'—')}</b></div>
        <div class="cw-rail-row"><span>Phone</span><b>${esc(profile.phone||profile.primaryPhone||'—')}</b></div>
        <div class="cw-rail-row"><span>Medicaid / ID</span><b>${esc(profile.medicaidNumber||profile.stateId||'—')}</b></div>
      </div>
      <div class="cw-rail-block"><h4>Care contacts</h4>
        <div class="cw-rail-row"><span>Guardian</span><b>${esc(profile.guardianName||'—')}</b></div>
        <div class="cw-rail-row"><span>PCP</span><b>${esc(profile.primaryCareProvider||profile.pcpName||'—')}</b></div>
        <div class="cw-rail-row"><span>Pharmacy</span><b>${esc(profile.pharmacy||'—')}</b></div>
      </div>
      ${source?`<div class="cw-intake-source"><strong>✓ Intake connected</strong><br>Admission information was promoted from Client Intake into the live S.P.I.R.E. chart.<br><small>${esc(fmt(source.createdAt))}</small></div>`:''}`;
    const photoButton=document.getElementById('cwPhotoEdit'); if(photoButton) photoButton.onclick=choosePhoto;
    if(state.photoUrl){const img=document.getElementById('cwPatientPhoto');img.src=state.photoUrl;img.hidden=false;document.querySelector('.cw-photo-fallback')?.setAttribute('hidden','hidden');}
  }

  function renderPage() {
    const host=document.getElementById('cwPages');
    const renderers={overview:renderOverview,isp:renderIsp,daily:renderDaily,sleep:renderSleep,clinical:renderClinical,meds:renderMeds,documents:renderDocuments,compliance:renderCompliance};
    host.innerHTML=`<section class="cw-page active" data-cw-page="${state.tab}">${renderers[state.tab]?.()||''}</section>`;
    wirePage();
  }

  function readiness() {
    const values=Object.values(state.context?.auditReadiness||{}); return values.length?Math.round(values.filter(Boolean).length/values.length*100):0;
  }

  function renderOverview() {
    const c=state.context||{},goals=arr(c.goals),mods=arr(c.clinicalModules),sleep=arr(state.sleep),ready=readiness();
    const avg=goals.length?Math.round(goals.reduce((sum,g)=>sum+Number(g.progressPercent||0),0)/goals.length):0;
    const latest=sleep.slice(-24),awake=latest.filter(x=>String(x.value||'').toUpperCase()!=='SLEEPING').length;
    return `<div class="cw-hero"><div><h1>Care Workstation</h1><p>One patient-centered home health and waiver workspace, connected to Client Intake and the active ISP.</p></div><div class="cw-status-cluster"><span class="cw-pill ok">Live intake connection</span><span class="cw-pill">${goals.length} ISP outcomes</span><span class="cw-pill">${mods.length} clinical modules</span></div></div>
      <div class="cw-grid cw-grid-3">
        <article class="cw-card"><div class="cw-kpi"><div><span>ISP average progress</span><strong>${avg}%</strong></div></div><div class="cw-progress"><i style="width:${Math.min(100,avg)}%"></i></div></article>
        <article class="cw-card"><div class="cw-kpi"><div><span>Enabled clinical care</span><strong>${mods.length}</strong></div><span>patient-specific modules</span></div></article>
        <article class="cw-card"><div class="cw-kpi"><div><span>Overnight awake observations</span><strong>${awake}</strong></div><span>recent documented observations</span></div></article>
      </div>
      <div class="cw-grid cw-grid-2" style="margin-top:13px">
        <article class="cw-card"><h2>ISP outcomes at a glance</h2>${goals.length?goals.slice(0,6).map(g=>`<div style="margin:9px 0"><div class="cw-kpi"><span>${esc(g.title)}</span><b>${esc(g.progressPercent||0)}%</b></div><div class="cw-progress"><i style="width:${Math.min(100,Number(g.progressPercent||0))}%"></i></div></div>`).join(''):'<div class="cw-empty">No active ISP outcomes are available yet.</div>'}</article>
        <article class="cw-card"><div style="display:flex;align-items:center;gap:18px"><div class="cw-readiness" style="--cw-ready:${ready}%"><b>${ready}%</b></div><div><h2>Audit readiness</h2><p class="cw-note">Quick evidence indicator for the current chart. This is readiness support, not a guarantee of regulatory compliance.</p><button class="cw-btn secondary" data-jump="compliance">Review evidence</button></div></div></article>
      </div>`;
  }

  function renderIsp() {
    const c=state.context||{},goals=arr(c.goals),progress=arr(c.goalProgress),plans=arr(c.carePlans);
    return `<div class="cw-hero"><div><h1>ISP & Outcomes</h1><p>Every active ISP outcome is a documentation target. Staff can record progress directly against the outcome.</p></div><div class="cw-status-cluster"><span class="cw-pill">${plans.length} plan record${plans.length===1?'':'s'}</span><span class="cw-pill ok">${goals.length} active outcomes</span></div></div>
      <div class="cw-grid cw-grid-2"><section class="cw-card"><h2>Active outcomes</h2>${goals.length?goals.map(g=>`<article class="cw-goal"><div class="cw-goal-head"><div><h3>${esc(g.title)}</h3><div class="cw-goal-meta">${esc(g.frequency||'Frequency per ISP')} · ${esc(g.responsibleDiscipline||'Assigned staff')}</div></div><strong>${esc(g.progressPercent||0)}%</strong></div><div class="cw-progress"><i style="width:${Math.min(100,Number(g.progressPercent||0))}%"></i></div><p>${esc(g.desiredOutcome||g.baseline||'')}</p><button class="cw-btn secondary" data-goal-open="${esc(g.id)}">Document progress</button><div class="cw-inline-form" id="cwGoalForm-${esc(g.id)}"><div class="cw-form-grid"><div class="cw-field"><label>Progress %</label><input type="number" min="0" max="100" data-goal-percent="${esc(g.id)}" value="${esc(g.progressPercent||0)}"></div><div class="cw-field"><label>Event time</label><input type="datetime-local" data-goal-time="${esc(g.id)}" value="${nowLocalInput()}"></div></div><div class="cw-field"><label>What happened / progress made</label><textarea data-goal-note="${esc(g.id)}" placeholder="Objective, person-centered progress documentation"></textarea></div><div class="cw-field"><label>Late-entry reason (required when event time is more than 5 minutes in the past)</label><input data-goal-late="${esc(g.id)}" placeholder="Reason for documenting after the event"></div><button class="cw-btn" data-goal-save="${esc(g.id)}">Sign progress entry</button></div></article>`).join(''):'<div class="cw-empty">No active ISP goals were returned. Approved Client Intake can seed the draft care plan, and authorized clinical staff can complete the plan.</div>'}</section>
      <section class="cw-card"><h2>Recent outcome documentation</h2><div class="cw-table-wrap"><table class="cw-table"><thead><tr><th>Event time</th><th>Outcome</th><th>Progress</th><th>Documentation</th></tr></thead><tbody>${progress.length?progress.map(x=>`<tr><td>${esc(fmt(x.recordedAt))}<br><small>${esc(x.entryMode||'CURRENT')}</small></td><td>${esc(x.goalTitle||'ISP goal')}</td><td>${x.progressPercent==null?'—':esc(x.progressPercent)+'%'}</td><td>${esc(x.narrative||'')}<br><small>Documented ${esc(fmt(x.documentedAt||x.recordedAt))}</small></td></tr>`).join(''):'<tr><td colspan="4" class="cw-empty">No progress entries yet.</td></tr>'}</tbody></table></div></section></div>`;
  }

  function flowsheetRows(){ return arr(state.flowsheet?.rows || state.flowsheet?.data?.rows); }
  function flowsheetEntries(){ return arr(state.flowsheet?.entries || state.flowsheet?.data?.entries); }
  function renderDaily() {
    const rows=flowsheetRows(),entries=flowsheetEntries();
    return `<div class="cw-hero"><div><h1>Daily Support & Flowsheets</h1><p>Time-stamped care documentation with current-time or past-time columns. Past entries require a reason and signed entries are corrected by amendment.</p></div></div>
      <div class="cw-grid cw-grid-2"><section class="cw-card"><h2>Add flowsheet observation</h2><div class="cw-form"><div class="cw-field"><label>Flowsheet item</label><select id="cwFlowRow"><option value="">Select item</option>${rows.map(r=>`<option value="${esc(r.id)}">${esc(r.groupName||'General')} — ${esc(r.name)}</option>`).join('')}</select></div><div class="cw-form-grid"><div class="cw-field"><label>Value</label><input id="cwFlowValue" placeholder="Observation / value"></div><div class="cw-field"><label>Numeric value</label><input id="cwFlowNumeric" type="number" step="any" placeholder="Optional"></div><div class="cw-field"><label>Clinical event time</label><input id="cwFlowTime" type="datetime-local" value="${nowLocalInput()}"></div><div class="cw-field"><label>Late-entry reason</label><input id="cwFlowLate" placeholder="Required for past-time column"></div></div><div class="cw-field"><label>Comment</label><textarea id="cwFlowComment" placeholder="Optional supporting note"></textarea></div><button class="cw-btn" id="cwFlowSave">Sign flowsheet entry</button></div></section>
      <section class="cw-card"><h2>Recent flowsheet documentation</h2><div class="cw-table-wrap"><table class="cw-table"><thead><tr><th>Event</th><th>Item</th><th>Value</th><th>Documented</th></tr></thead><tbody>${entries.length?entries.slice(0,50).map(e=>`<tr><td>${esc(fmt(e.recordedAt))}</td><td>${esc(e.rowName||e.name||'Flowsheet')}</td><td>${esc(e.value??e.numericValue??'—')}<br><small>${esc(e.comment||'')}</small></td><td>${esc(fmt(e.documentedAt||e.createdAt||e.recordedAt))}${e.entryMode==='PAST'?'<br><small>Late entry</small>':''}</td></tr>`).join(''):'<tr><td colspan="4" class="cw-empty">No flowsheet observations in the selected period.</td></tr>'}</tbody></table></div></section></div>`;
  }

  function scheduleSlots(schedule) {
    if(!schedule) return [];
    const [sh,sm]=String(schedule.startLocalTime||'22:00').split(':').map(Number),[eh,em]=String(schedule.endLocalTime||'06:00').split(':').map(Number),freq=Number(schedule.frequencyMinutes||60);
    let start=sh*60+sm,end=eh*60+em;if(end<=start)end+=1440;const out=[];for(let m=start;m<=end&&out.length<60;m+=freq)out.push(`${String(Math.floor((m%1440)/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`);return out;
  }
  function renderSleep() {
    const schedule=state.context?.sleepWakeSchedule,slots=scheduleSlots(schedule),sleep=arr(state.sleep);
    const sleeping=sleep.filter(x=>x.value==='SLEEPING').length,awake=sleep.length-sleeping;
    return `<div class="cw-hero"><div><h1>Sleep / Wake</h1><p>ISP-driven overnight checks with selectable frequency, exact clinical event time, automatic documentation time and note support for unusual awake periods.</p></div><div class="cw-status-cluster"><span class="cw-pill">${sleeping} sleeping</span><span class="cw-pill warn">${awake} awake / activity</span></div></div>
      <div class="cw-grid cw-grid-2"><section class="cw-card"><h2>Observation schedule <button class="cw-btn secondary cw-admin-pencil" id="cwSleepEdit">✎ Edit</button></h2>${schedule?`<div class="cw-kpi"><div><span>Observation window</span><strong style="font-size:20px">${esc(schedule.startLocalTime)}–${esc(schedule.endLocalTime)}</strong></div><span>Every ${esc(schedule.frequencyMinutes)} min</span></div><div class="cw-sleep-grid">${slots.map(s=>`<div class="cw-time-slot"><strong>${esc(s)}</strong><span class="cw-note">scheduled check</span></div>`).join('')}</div><p class="cw-note">${esc(schedule.instructions||'Follow the individual ISP and health/safety instructions.')}</p>`:'<div class="cw-empty">No sleep/wake schedule has been configured. Authorized staff can configure it from Admin Edit Mode.</div>'}<div id="cwSleepScheduleForm" class="cw-inline-form"><div class="cw-form-grid"><div class="cw-field"><label>Start</label><input id="cwSleepStart" type="time" value="${esc(schedule?.startLocalTime||'22:00')}"></div><div class="cw-field"><label>End</label><input id="cwSleepEnd" type="time" value="${esc(schedule?.endLocalTime||'06:00')}"></div><div class="cw-field"><label>Frequency</label><select id="cwSleepFrequency"><option value="15">Every 15 min</option><option value="30">Every 30 min</option><option value="60" selected>Every hour</option><option value="120">Every 2 hours</option></select></div></div><div class="cw-field"><label>Instructions</label><textarea id="cwSleepInstructions">${esc(schedule?.instructions||'')}</textarea></div><button class="cw-btn" id="cwSleepScheduleSave">Save schedule</button></div></section>
      <section class="cw-card"><h2>Document observation</h2><div class="cw-form"><div class="cw-form-grid"><div class="cw-field"><label>Status / activity</label><select id="cwSleepStatus"><option value="SLEEPING">Sleeping</option><option value="AWAKE">Awake</option><option value="BATHROOM">Up to use restroom</option><option value="SNACK">Up for snack</option><option value="OUT_OF_BED">Out of bed</option><option value="OTHER">Other</option></select></div><div class="cw-field"><label>Observed at</label><input id="cwSleepTime" type="datetime-local" value="${nowLocalInput()}"></div></div><div class="cw-field"><label>Note</label><textarea id="cwSleepNote" placeholder="Example: Awake at 02:15, requested a snack, returned to bed at 02:25."></textarea></div><div class="cw-field"><label>Late-entry reason</label><input id="cwSleepLate" placeholder="Required if charting a past observation"></div><button class="cw-btn" id="cwSleepSave">Sign observation</button></div></section></div>
      <section class="cw-card" style="margin-top:13px"><h2>Sleep / wake timeline</h2><div class="cw-table-wrap"><table class="cw-table"><thead><tr><th>Observed</th><th>Status</th><th>Note</th><th>Documented</th></tr></thead><tbody>${sleep.length?sleep.map(x=>`<tr><td>${esc(fmt(x.recordedAt))}</td><td><span class="cw-sleep-status"><i class="cw-dot ${esc(String(x.value||'').toLowerCase())}"></i>${esc(String(x.value||'').replaceAll('_',' '))}</span></td><td>${esc(x.comment||'')}</td><td>${esc(fmt(x.documentedAt||x.recordedAt))}${x.entryMode==='PAST'?`<br><small>Late: ${esc(x.lateEntryReason||'')}</small>`:''}</td></tr>`).join(''):'<tr><td colspan="4" class="cw-empty">No observations documented in the last 24 hours.</td></tr>'}</tbody></table></div></section>`;
  }

  function groupCatalog() { return state.catalog.reduce((map,item)=>{(map[item.category]??=[]).push(item);return map;},{}); }
  function renderClinical() {
    const enabled=new Set(arr(state.context?.clinicalModules).map(x=>x.moduleKey)),groups=groupCatalog(),canConfigure=state.context?.permissions?.nursingCatalog;
    return `<div class="cw-hero"><div><h1>Clinical</h1><p>Activate only the skilled nursing tools this patient needs. The catalog covers home-health nursing, waiver nursing, delegation and treatment workflows.</p></div><div class="cw-status-cluster"><span class="cw-pill ok">${enabled.size} enabled</span>${canConfigure?'<span class="cw-pill">Nurse catalog access</span>':''}</div></div>
      <section class="cw-card"><h2>Patient clinical catalog</h2><p class="cw-note">Enabled modules become part of this patient’s clinical workstation. Nurses can add or remove modules as needs change; administrators can edit catalog labels and configuration in Admin Edit Mode.</p><div class="cw-catalog">${Object.entries(groups).map(([category,items])=>`<div class="cw-category">${esc(category)}</div>${items.map(item=>`<label class="cw-module"><input type="checkbox" data-module-key="${esc(item.moduleKey)}" ${enabled.has(item.moduleKey)?'checked':''} ${canConfigure?'':'disabled'}><div><strong>${esc(item.title)} <button type="button" class="cw-btn secondary cw-admin-pencil" data-catalog-edit="${esc(item.moduleKey)}">✎</button></strong><span>${esc(item.description||'')}</span></div></label>`).join('')}`).join('')}</div></section>`;
  }

  function renderMeds() {
    return `<div class="cw-hero"><div><h1>Medications & Treatments</h1><p>Medication reconciliation, active orders, eMAR/TAR and PRN effectiveness remain connected to the existing protected S.P.I.R.E. medication workflows.</p></div></div><div class="cw-grid cw-grid-3"><article class="cw-card"><h2>Medication reconciliation</h2><p>Client Intake medication data is promoted for clinical verification without inventing missing order details.</p><button class="cw-btn secondary" data-close-and-tab="medications">Open Medications</button></article><article class="cw-card"><h2>eMAR / TAR</h2><p>Scheduled medication and treatment administration with staff identity and timestamps.</p><button class="cw-btn secondary" data-close-and-tab="mar">Open MAR</button></article><article class="cw-card"><h2>PRN effectiveness</h2><p>Use the patient clinical catalog to activate PRN-effectiveness monitoring when applicable.</p><button class="cw-btn secondary" data-jump="clinical">Clinical catalog</button></article></div>`;
  }

  function renderDocuments() {
    const source=state.context?.intakeAdmissionSummary;
    return `<div class="cw-hero"><div><h1>Documents & Intake Provenance</h1><p>Clinical documents remain in the patient chart while the approved Client Intake remains the source record for promoted admission information.</p></div></div><div class="cw-grid cw-grid-2"><article class="cw-card"><h2>Client Intake → S.P.I.R.E.</h2>${source?`<span class="cw-pill ok">Connected</span><p class="cw-note">${esc(source.title||'Client Intake Admission Summary')} · ${esc(fmt(source.createdAt))}</p><div class="cw-source-box">${esc(source.body||'Admission source is linked to this chart.')}</div>`:'<div class="cw-empty">No intake admission summary was returned for this patient.</div>'}</article><article class="cw-card"><h2>Clinical documents</h2><p>Orders, Plan of Care/485, nursing records, external records and supporting documents use the existing S.P.I.R.E. document workspace.</p><button class="cw-btn secondary" data-close-and-tab="documents">Open chart Documents</button></article></div>`;
  }

  function renderCompliance() {
    const r=state.context?.auditReadiness||{},ready=readiness();
    const items=[
      [r.currentIsp,'Service Planning','Current ISP / plan and associated outcomes'],
      [r.assessments,'Assessments','Assessments supporting the service plan and clinical needs'],
      [r.activeMedicationOrders,'Medication Administration','Current medication orders when medications are administered'],
      [r.clinicalNotes,'Service Delivery & Nursing','Clinical/progress notes and service-delivery evidence'],
      [r.clinicalDocuments,'Clinical Documents','Plan of Care/485, orders, treatment records and supporting evidence as applicable'],
      [r.incidentHistory,'UI / MUI History','Incident history when applicable; absence of an incident is not itself a deficiency'],
    ];
    return `<div class="cw-hero"><div><h1>DODD / Home Health Audit Readiness</h1><p>Patient-level evidence center aligned to the records reviewers commonly request. Applicability depends on services, waiver, setting and the individual plan.</p></div><div class="cw-readiness" style="--cw-ready:${ready}%"><b>${ready}%</b></div></div><div class="cw-grid cw-grid-2"><section class="cw-card"><h2>Patient record readiness</h2>${items.map(([ok,title,detail])=>`<div class="cw-compliance-row"><div class="cw-check ${ok?'':'pending'}">${ok?'✓':'!'}</div><div><strong>${esc(title)}</strong><small>${esc(detail)}</small></div><span class="cw-pill ${ok?'ok':'warn'}">${ok?'Evidence found':'Review'}</span></div>`).join('')}</section><section class="cw-card"><h2>Broader agency review areas</h2><p class="cw-note">Agency compliance review may also require records beyond this patient chart.</p>${['Delegated nursing assessments, statement of delegation, individual-specific training, supervision, written task instructions and return demonstration','Behavior support / restrictive-measure records, notifications and staff training when applicable','Personal funds ledgers, receipts and independent reconciliation when the agency assists with funds','MAR/TAR and service-delivery documentation tied to ISP services and outcomes','UI/MUI reports, follow-up, investigations, monthly UI review and annual MUI analysis','Personnel qualifications, background/exclusion checks, training and staff roster','Transportation inspections/records when applicable','Physical-environment, emergency/fire, remote-support and assistive-technology records when applicable'].map(x=>`<div class="cw-compliance-row"><div class="cw-check">•</div><div><strong>${esc(x)}</strong></div></div>`).join('')}</section></div>`;
  }

  function wirePage() {
    document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.jump;renderTabs();renderPage();});
    document.querySelectorAll('[data-goal-open]').forEach(b=>b.onclick=()=>document.getElementById(`cwGoalForm-${b.dataset.goalOpen}`)?.classList.toggle('open'));
    document.querySelectorAll('[data-goal-save]').forEach(b=>b.onclick=()=>saveGoal(b.dataset.goalSave));
    document.getElementById('cwFlowSave')?.addEventListener('click',saveFlow);
    document.getElementById('cwSleepSave')?.addEventListener('click',saveSleep);
    document.getElementById('cwSleepEdit')?.addEventListener('click',()=>document.getElementById('cwSleepScheduleForm')?.classList.toggle('open'));
    document.getElementById('cwSleepScheduleSave')?.addEventListener('click',saveSleepSchedule);
    const frequency=document.getElementById('cwSleepFrequency');if(frequency&&state.context?.sleepWakeSchedule)frequency.value=String(state.context.sleepWakeSchedule.frequencyMinutes||60);
    document.querySelectorAll('[data-module-key]').forEach(input=>input.onchange=()=>toggleModule(input.dataset.moduleKey,input.checked));
    document.querySelectorAll('[data-catalog-edit]').forEach(button=>button.onclick=()=>editCatalog(button.dataset.catalogEdit));
    document.querySelectorAll('[data-close-and-tab]').forEach(button=>button.onclick=()=>{const tab=button.dataset.closeAndTab;close();setTimeout(()=>document.querySelector(`[data-chart-tab="${CSS.escape(tab)}"]`)?.click(),50);});
  }

  async function saveGoal(id) {
    try{await api(`/api/spire/care-workstation/patients/${encodeURIComponent(state.patientId)}/goal-progress`,{method:'POST',body:JSON.stringify({goalId:id,progressPercent:document.querySelector(`[data-goal-percent="${CSS.escape(id)}"]`)?.value,narrative:document.querySelector(`[data-goal-note="${CSS.escape(id)}"]`)?.value,recordedAt:document.querySelector(`[data-goal-time="${CSS.escape(id)}"]`)?.value,lateEntryReason:document.querySelector(`[data-goal-late="${CSS.escape(id)}"]`)?.value})});toast('ISP progress signed and saved.');await load(false);}catch(e){toast(e.message,true);}
  }
  async function saveFlow() {
    try{await api(`/api/spire/care-workstation/patients/${encodeURIComponent(state.patientId)}/flowsheet-entry`,{method:'POST',body:JSON.stringify({rowId:document.getElementById('cwFlowRow').value,value:document.getElementById('cwFlowValue').value,numericValue:document.getElementById('cwFlowNumeric').value,recordedAt:document.getElementById('cwFlowTime').value,lateEntryReason:document.getElementById('cwFlowLate').value,comment:document.getElementById('cwFlowComment').value})});toast('Flowsheet entry signed with timestamps.');await load(false);}catch(e){toast(e.message,true);}
  }
  async function saveSleep() {
    try{await api(`/api/spire/care-workstation/patients/${encodeURIComponent(state.patientId)}/sleep-wake`,{method:'POST',body:JSON.stringify({status:document.getElementById('cwSleepStatus').value,recordedAt:document.getElementById('cwSleepTime').value,note:document.getElementById('cwSleepNote').value,lateEntryReason:document.getElementById('cwSleepLate').value})});toast('Sleep / wake observation signed.');await load(false);}catch(e){toast(e.message,true);}
  }
  async function saveSleepSchedule() {
    try{await api(`/api/spire/care-workstation/patients/${encodeURIComponent(state.patientId)}/sleep-wake/schedule`,{method:'PUT',body:JSON.stringify({startLocalTime:document.getElementById('cwSleepStart').value,endLocalTime:document.getElementById('cwSleepEnd').value,frequencyMinutes:Number(document.getElementById('cwSleepFrequency').value),instructions:document.getElementById('cwSleepInstructions').value})});toast('Sleep / wake schedule updated.');await load(false);}catch(e){toast(e.message,true);}
  }
  async function toggleModule(key,enabled) {
    try{await api(`/api/spire/care-workstation/patients/${encodeURIComponent(state.patientId)}/modules/${encodeURIComponent(key)}`,{method:'PUT',body:JSON.stringify({enabled})});toast(`${key.replaceAll('_',' ')} ${enabled?'enabled':'removed'} for this patient.`);await load(false);}catch(e){toast(e.message,true);renderPage();}
  }
  async function editCatalog(key) {
    if(!state.admin)return;const item=state.catalog.find(x=>x.moduleKey===key);if(!item)return;
    const title=prompt('Catalog title',item.title);if(title==null)return;const description=prompt('Catalog description',item.description||'');if(description==null)return;
    try{await api(`/api/spire/care-workstation/catalog/${encodeURIComponent(key)}`,{method:'PUT',body:JSON.stringify({title,category:item.category,description,configuration:item.configuration||{},active:true})});toast('Clinical catalog updated live.');await load(false);}catch(e){toast(e.message,true);}
  }

  function choosePhoto() {
    if(!state.admin)return;const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;if(file.size>5*1024*1024)return toast('Patient photo must be 5 MB or smaller.',true);const data=await fileToBase64(file);try{await api(`/api/spire/care-workstation/patients/${encodeURIComponent(state.patientId)}/photo`,{method:'PUT',body:JSON.stringify({mimeType:file.type,base64:data})});toast('Patient photo updated.');await loadPhoto();renderRail();}catch(e){toast(e.message,true);}};input.click();
  }
  function fileToBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');reader.onerror=reject;reader.readAsDataURL(file);});}
  function filterVisible(q){document.querySelectorAll('#cwPages .cw-card,#cwPages .cw-goal,#cwPages .cw-module,#cwPages tr').forEach(node=>{node.style.display=!q||node.textContent.toLowerCase().includes(q.toLowerCase())?'':'none';});}

  document.addEventListener('DOMContentLoaded',install,{once:true});
  if(document.readyState!=='loading')install();
})();
