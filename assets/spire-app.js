(() => {
  'use strict';
  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const token = () => TOKEN_KEYS.map(k => sessionStorage.getItem(k) || localStorage.getItem(k)).find(Boolean) || '';
  const state = { patient:null, activeWorkspace:'home', patients:[], schedule:[], inbox:[], prefs:null };
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(path, options={}) {
    const response = await fetch(API + path, {
      ...options,
      cache:'no-store',
      headers:{ Accept:'application/json', ...(token()?{Authorization:`Bearer ${token()}`}:{}) , ...(options.body?{'Content-Type':'application/json'}:{}), ...(options.headers||{}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data ?? payload;
  }
  const workspaces = [
    ['home','Home'],['schedule','Schedule'],['inbasket','In Basket'],['census','Patient Lists'],['search','Chart Search'],['tasks','My Tasks'],['orders','Orders'],['reports','Reports'],['tools','Tools']
  ];
  const chartTabs = [
    ['chart-review','Chart Review'],['results-review','Results Review'],['notes','Notes'],['plan','Plan'],['medications','Medications'],['mar','MAR'],['orders','Orders'],['care-plan','Care Plan / ISP'],['assessments','Assessments'],['vitals','Vitals & Flowsheets'],['incidents','Incidents & Risk'],['authorizations','Authorizations'],['documents','Documents / Media'],['external','External Records'],['communications','Communications'],['wrap-up','Wrap-Up'],['timeline','Timeline']
  ];
  function installShell(){
    const app = $('spireApp'); if(!app) return;
    app.innerHTML = `
      <header class="spire-topbar">
        <div class="spire-brand"><div class="spire-logo-mark">S</div><div><strong>Spire</strong><span>Sulandra Clinical Record</span></div></div>
        <nav class="spire-global-nav">${workspaces.map(([k,l])=>`<button data-workspace="${k}" class="${k==='home'?'active':''}">${l}</button>`).join('')}</nav>
        <div class="spire-top-actions"><button id="spirePatientSearch">Find Patient</button><button id="spireBackToPlatform">Sulandra Health</button></div>
      </header>
      <section class="spire-patient-strip" id="spirePatientStrip" hidden></section>
      <main class="spire-shell">
        <aside class="spire-left-rail" id="spireLeftRail">
          <div class="rail-card"><h3>My Day</h3><div id="spireMiniSchedule">Loading schedule…</div></div>
          <div class="rail-card"><h3>In Basket</h3><div id="spireMiniInbox">Loading…</div></div>
          <div class="rail-card"><h3>Favorites</h3><button data-workspace="census">Patient Lists</button><button data-workspace="notes">My Notes</button><button data-workspace="tools">SmartPhrases</button></div>
        </aside>
        <section class="spire-main">
          <div id="spireHomeWorkspace" class="spire-workspace active"></div>
          <div id="spireGenericWorkspace" class="spire-workspace"></div>
          <div id="spireChartWorkspace" class="spire-workspace"></div>
        </section>
        <aside class="spire-right-rail" id="spireRightRail">
          <div class="rail-card"><h3>Clinical Context</h3><div id="spireContext">Open a patient chart to see clinical context.</div></div>
          <div class="rail-card"><h3>Quick Actions</h3><button id="quickNote">+ Note</button><button id="quickOrder">+ Order</button><button id="quickTask">+ Task</button><button id="quickVitals">+ Vitals</button></div>
        </aside>
      </main>`;
    wireShell(); renderHome(); loadFoundation();
  }
  function wireShell(){
    document.addEventListener('click', (e)=>{
      const w = e.target.closest('[data-workspace]'); if(w){ activateWorkspace(w.dataset.workspace); return; }
      const p = e.target.closest('[data-patient-id]'); if(p){ openPatient(p.dataset.patientId); return; }
      const tab = e.target.closest('[data-chart-tab]'); if(tab){ renderChartTab(tab.dataset.chartTab); return; }
    });
    $('spireBackToPlatform')?.addEventListener('click',()=>location.href='/employee-portal.html');
    $('spirePatientSearch')?.addEventListener('click',()=>activateWorkspace('search'));
  }
  async function loadFoundation(){
    if(!token()){ location.href='/employee-login.html?returnTo=/spire.html'; return; }
    try{
      const [patients,schedule,inbox] = await Promise.all([
        api('/api/spire/patients').catch(()=>[]),
        api('/api/spire/schedule').catch(()=>[]),
        api('/api/spire/inbasket').catch(()=>[]),
      ]);
      state.patients = Array.isArray(patients)?patients:[];
      state.schedule = Array.isArray(schedule)?schedule:[];
      state.inbox = Array.isArray(inbox)?inbox:[];
      renderMiniPanels(); renderHome();
    }catch(err){ renderSystemError(err); }
  }
  function renderMiniPanels(){
    const s=$('spireMiniSchedule'); if(s) s.innerHTML = state.schedule.length ? state.schedule.slice(0,5).map(x=>`<button data-patient-id="${esc(x.patientId)}"><strong>${esc(x.time||'')}</strong> ${esc(x.patientName||'Patient')}</button>`).join('') : '<span class="muted">No appointments today</span>';
    const i=$('spireMiniInbox'); if(i) i.innerHTML = state.inbox.length ? state.inbox.slice(0,5).map(x=>`<button><strong>${esc(x.category||'Message')}</strong><span>${esc(x.title||'')}</span></button>`).join('') : '<span class="muted">No open items</span>';
  }
  function activateWorkspace(key){
    state.activeWorkspace = key;
    document.querySelectorAll('.spire-global-nav button').forEach(b=>b.classList.toggle('active',b.dataset.workspace===key));
    document.querySelectorAll('.spire-workspace').forEach(n=>n.classList.remove('active'));
    if(key==='home'){ $('spireHomeWorkspace').classList.add('active'); renderHome(); return; }
    $('spireGenericWorkspace').classList.add('active'); renderGenericWorkspace(key);
  }
  function renderHome(){
    const host=$('spireHomeWorkspace'); if(!host) return;
    host.innerHTML=`<div class="workspace-title"><div><h1>Clinical Dashboard</h1><p>Your Spire clinical workspace.</p></div><button data-workspace="search">Open Chart</button></div>
      <div class="dashboard-grid">
        <article class="metric-card"><span>Today's Schedule</span><strong>${state.schedule.length}</strong><button data-workspace="schedule">View schedule</button></article>
        <article class="metric-card"><span>Open In Basket</span><strong>${state.inbox.filter(x=>String(x.status||'OPEN')!=='DONE').length}</strong><button data-workspace="inbasket">Open inbox</button></article>
        <article class="metric-card"><span>Available Charts</span><strong>${state.patients.length}</strong><button data-workspace="census">Patient lists</button></article>
        <article class="metric-card"><span>Tasks Due</span><strong>—</strong><button data-workspace="tasks">My tasks</button></article>
      </div>
      <section class="panel"><h2>Today's Patients</h2><table><thead><tr><th>Time</th><th>Patient</th><th>Status</th><th>Type</th><th>Location</th></tr></thead><tbody>${state.schedule.length?state.schedule.map(x=>`<tr data-patient-id="${esc(x.patientId)}"><td>${esc(x.time||'')}</td><td><strong>${esc(x.patientName||'Patient')}</strong></td><td>${esc(x.status||'')}</td><td>${esc(x.type||'')}</td><td>${esc(x.location||'')}</td></tr>`).join(''):'<tr><td colspan="5" class="muted">No scheduled patients.</td></tr>'}</tbody></table></section>`;
  }
  function renderGenericWorkspace(key){
    const host=$('spireGenericWorkspace');
    const titles={schedule:'Schedule',inbasket:'In Basket',census:'Patient Lists',search:'Chart Search',tasks:'My Tasks',orders:'Orders',reports:'Reports',tools:'Tools'};
    if(key==='schedule') return renderSchedule(host);
    if(key==='inbasket') return renderInbox(host);
    if(key==='census'||key==='search') return renderPatientList(host,key==='search');
    if(key==='tools') return renderTools(host);
    host.innerHTML=`<div class="workspace-title"><div><h1>${esc(titles[key]||key)}</h1><p>Spire ${esc(titles[key]||key)} workspace foundation.</p></div></div><section class="panel"><p class="muted">This workspace is connected to the Spire architecture and ready for its clinical workflow implementation.</p></section>`;
  }
  function renderSchedule(host){ host.innerHTML=`<div class="workspace-title"><div><h1>Schedule</h1><p>Open patient encounters and pre-chart from your assigned schedule.</p></div></div><section class="panel"><table><thead><tr><th>Time</th><th>Status</th><th>Patient</th><th>Type</th><th>Provider</th><th>Location</th></tr></thead><tbody>${state.schedule.length?state.schedule.map(x=>`<tr data-patient-id="${esc(x.patientId)}"><td>${esc(x.time||'')}</td><td>${esc(x.status||'')}</td><td><strong>${esc(x.patientName||'Patient')}</strong></td><td>${esc(x.type||'')}</td><td>${esc(x.provider||'')}</td><td>${esc(x.location||'')}</td></tr>`).join(''):'<tr><td colspan="6" class="muted">No appointments.</td></tr>'}</tbody></table></section>`; }
  function renderInbox(host){ host.innerHTML=`<div class="workspace-title"><div><h1>In Basket</h1><p>Clinical messages, results, cosign requests, document review and tasks.</p></div></div><section class="panel"><table><thead><tr><th>Priority</th><th>Category</th><th>Patient</th><th>Subject</th><th>Status</th><th>Date</th></tr></thead><tbody>${state.inbox.length?state.inbox.map(x=>`<tr ${x.patientId?`data-patient-id="${esc(x.patientId)}"`:''}><td>${esc(x.priority||'NORMAL')}</td><td>${esc(x.category||'')}</td><td>${esc(x.patientName||'')}</td><td>${esc(x.title||'')}</td><td>${esc(x.status||'')}</td><td>${esc(x.createdAt?new Date(x.createdAt).toLocaleString():'')}</td></tr>`).join(''):'<tr><td colspan="6" class="muted">No in-basket items.</td></tr>'}</tbody></table></section>`; }
  function renderPatientList(host, search){ host.innerHTML=`<div class="workspace-title"><div><h1>${search?'Chart Search':'Patient Lists'}</h1><p>${search?'Search authorized charts by name, MRN, DOB or identifier.':'Assigned and authorized patient/client charts.'}</p></div></div>${search?'<div class="patient-search"><input id="patientSearchInput" type="search" placeholder="Search name, MRN, DOB, identifier"><button id="patientSearchButton">Search</button></div>':''}<section class="panel"><table><thead><tr><th>Patient</th><th>MRN</th><th>DOB</th><th>Home/Program</th><th>Flags</th></tr></thead><tbody id="spirePatientRows">${renderPatientRows(state.patients)}</tbody></table></section>`; if(search){$('patientSearchButton').onclick=()=>filterPatients();$('patientSearchInput').oninput=()=>filterPatients();} }
  function renderPatientRows(rows){ return rows.length?rows.map(p=>`<tr data-patient-id="${esc(p.id||p.patientId)}"><td><strong>${esc(p.name||p.displayName||[p.firstName,p.lastName].filter(Boolean).join(' '))}</strong></td><td>${esc(p.medicalRecordNumber||p.mrn||'')}</td><td>${esc(p.dateOfBirth?new Date(p.dateOfBirth).toLocaleDateString():'')}</td><td>${esc(p.homeName||p.programName||'')}</td><td>${esc((p.flags||[]).map?.(f=>f.label||f).join(', ')||'')}</td></tr>`).join(''):'<tr><td colspan="5" class="muted">No authorized charts found.</td></tr>'; }
  function filterPatients(){ const q=String($('patientSearchInput')?.value||'').toLowerCase(); $('spirePatientRows').innerHTML=renderPatientRows(state.patients.filter(p=>JSON.stringify(p).toLowerCase().includes(q))); }
  function renderTools(host){ host.innerHTML=`<div class="workspace-title"><div><h1>Tools</h1><p>Personalize Spire and manage clinical documentation accelerators.</p></div></div><div class="tool-grid"><button>SmartPhrase Manager<span>Create and share dot phrases</span></button><button>My SmartPhrases<span>Personal phrase library</span></button><button>SmartText<span>Reusable documentation blocks</span></button><button>Speed Buttons<span>Pin common note and AVS actions</span></button><button>Workspace Tabs<span>Reorder chart tabs</span></button><button>Saved Filters<span>Results and chart review filters</span></button></div>`; }
  async function openPatient(id){
    try{ state.patient = await api(`/api/spire/patients/${encodeURIComponent(id)}`); renderPatientStrip(); renderChartWorkspace(); }
    catch(err){ renderSystemError(err); }
  }
  function renderPatientStrip(){
    const p=state.patient||{}; const strip=$('spirePatientStrip'); strip.hidden=false;
    strip.innerHTML=`<div class="patient-avatar">${esc((p.name||p.displayName||'P').slice(0,1))}</div><div class="patient-main"><strong>${esc(p.name||p.displayName||'Patient')}</strong><span>MRN ${esc(p.medicalRecordNumber||p.mrn||'—')} · DOB ${esc(p.dateOfBirth?new Date(p.dateOfBirth).toLocaleDateString():'—')}</span></div><div class="patient-facts"><span>Allergies <b>${esc((p.allergies||[]).map?.(a=>a.substance||a).join(', ')||'None recorded')}</b></span><span>Home <b>${esc(p.homeName||'—')}</b></span><span>Primary Program <b>${esc(p.programName||'—')}</b></span></div>`;
    $('spireContext').innerHTML=`<strong>${esc(p.name||p.displayName||'Patient')}</strong><div>${esc((p.diagnoses||[]).map?.(d=>d.display||d).join(', ')||'No active diagnoses listed')}</div>`;
  }
  function renderChartWorkspace(){ document.querySelectorAll('.spire-workspace').forEach(n=>n.classList.remove('active')); const host=$('spireChartWorkspace'); host.classList.add('active'); host.innerHTML=`<div class="chart-tabs">${chartTabs.map(([k,l],i)=>`<button data-chart-tab="${k}" class="${i===0?'active':''}">${l}</button>`).join('')}</div><div id="spireChartTabBody"></div>`; renderChartTab('chart-review'); }
  async function renderChartTab(tab){
    document.querySelectorAll('[data-chart-tab]').forEach(b=>b.classList.toggle('active',b.dataset.chartTab===tab));
    const host=$('spireChartTabBody'); if(!host||!state.patient)return; host.innerHTML='<section class="panel"><p class="muted">Loading clinical chart…</p></section>';
    try{
      const id=state.patient.id||state.patient.patientId;
      const data=await api(`/api/spire/patients/${encodeURIComponent(id)}/${tab}`).catch(()=>null);
      if(tab==='chart-review') return renderChartReview(host,data);
      if(tab==='results-review') return renderResults(host,data);
      if(tab==='notes') return renderNotes(host,data);
      host.innerHTML=`<section class="panel"><div class="workspace-title compact"><div><h2>${esc(chartTabs.find(x=>x[0]===tab)?.[1]||tab)}</h2></div></div><pre class="json-foundation">${esc(JSON.stringify(data??{},null,2))}</pre></section>`;
    }catch(err){ host.innerHTML=`<section class="panel error">${esc(err.message)}</section>`; }
  }
  function renderChartReview(host,data){ const items=Array.isArray(data?.items)?data.items:Array.isArray(data)?data:[]; host.innerHTML=`<section class="panel"><div class="workspace-title compact"><div><h2>Chart Review</h2><p>Chronological encounters, notes, labs, microbiology, imaging, medications, orders and documents.</p></div></div><div class="subtabs"><button class="active">Encounters</button><button>Notes</button><button>Labs</button><button>Micro</button><button>Pathology</button><button>Imaging</button><button>Medications</button><button>Orders</button><button>Media</button></div><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Status</th><th>Author/Provider</th></tr></thead><tbody>${items.length?items.map(i=>`<tr><td>${esc(i.date||i.createdAt||'')}</td><td>${esc(i.type||'')}</td><td>${esc(i.description||i.title||'')}</td><td>${esc(i.status||'')}</td><td>${esc(i.author||i.provider||'')}</td></tr>`).join(''):'<tr><td colspan="5" class="muted">No chart history yet.</td></tr>'}</tbody></table></section>`; }
  function renderResults(host,data){ const items=Array.isArray(data?.items)?data.items:Array.isArray(data)?data:[]; host.innerHTML=`<section class="panel"><div class="workspace-title compact"><div><h2>Results Review</h2><p>Review newest or oldest results, select date ranges and trend specific values.</p></div></div><div class="results-toolbar"><input type="date"><input type="date"><select><option>Newest first</option><option>Oldest first</option></select><button>Trend Selected</button></div><table><thead><tr><th>Result</th><th>Value</th><th>Flag</th><th>Reference</th><th>Date</th></tr></thead><tbody>${items.length?items.map(i=>`<tr><td>${esc(i.name||i.testName||'')}</td><td>${esc(i.value||'')}</td><td>${esc(i.abnormalFlag||'')}</td><td>${esc(i.referenceRange||'')}</td><td>${esc(i.resultedAt||'')}</td></tr>`).join(''):'<tr><td colspan="5" class="muted">No results yet.</td></tr>'}</tbody></table></section>`; }
  function renderNotes(host,data){ const notes=Array.isArray(data?.items)?data.items:Array.isArray(data)?data:[]; host.innerHTML=`<section class="notes-layout"><div class="panel"><div class="workspace-title compact"><div><h2>Notes</h2><p>Draft, SmartPhrase, sign and cosign clinical documentation.</p></div><button id="createSpireNote">Create Note</button></div><div class="speed-buttons"><button>.PROGRESS</button><button>.NURSING</button><button>.FOLLOWUP</button><button>.INCIDENT</button></div><textarea id="spireNoteEditor" placeholder="Type note here. Enter . to use a SmartPhrase."></textarea><div class="note-actions"><button>Save Draft</button><button>Route for Cosign</button><button class="primary">Sign Note</button></div></div><aside class="panel note-list"><h3>Recent Notes</h3>${notes.length?notes.map(n=>`<button><strong>${esc(n.noteType||'Note')}</strong><span>${esc(n.author||'')} · ${esc(n.createdAt||'')}</span></button>`).join(''):'<p class="muted">No notes yet.</p>'}</aside></section>`; }
  function renderSystemError(err){ const host=$('spireHomeWorkspace'); if(host) host.innerHTML=`<section class="panel error"><h2>Spire could not load</h2><p>${esc(err.message)}</p></section>`; }
  document.addEventListener('DOMContentLoaded',installShell);
  if(document.readyState!=='loading') installShell();
})();
