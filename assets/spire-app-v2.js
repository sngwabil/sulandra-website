(() => {
  'use strict';
  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const token = () => TOKEN_KEYS.map(k => sessionStorage.getItem(k) || localStorage.getItem(k)).find(Boolean) || '';
  const state = {
    patient: null,
    storyboard: null,
    activeWorkspace: 'home',
    activeChartTab: 'chart-review',
    chartCategory: 'all',
    patients: [],
    schedule: [],
    inbox: [],
  };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arr = value => Array.isArray(value) ? value : [];
  const fmtDate = value => value ? new Date(String(value)).toLocaleDateString() : '—';
  const fmtDateTime = value => value ? new Date(String(value)).toLocaleString() : '—';
  const nameOf = p => p?.name || p?.displayName || [p?.preferredName || p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Patient';

  async function api(path, options = {}) {
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data ?? payload;
  }

  const workspaces = [
    ['home','Home'],['schedule','Schedule'],['inbasket','In Basket'],['census','Patient Lists'],['search','Chart Search'],['tasks','My Tasks'],['orders','Orders'],['reports','Reports'],['tools','Tools'],
  ];
  const chartTabs = [
    ['chart-review','Chart Review'],['results-review','Results Review'],['notes','Notes'],['plan','Plan'],['medications','Medications'],['mar','MAR'],['orders','Orders'],['care-plan','Care Plan / ISP'],['assessments','Assessments'],['vitals','Vitals & Flowsheets'],['incidents','Incidents & Risk'],['authorizations','Authorizations'],['documents','Documents / Media'],['external','External Records'],['communications','Communications'],['wrap-up','Wrap-Up'],['timeline','Timeline'],
  ];
  const chartCategories = [
    ['all','All'],['encounters','Encounters'],['notes','Notes'],['labs','Labs'],['micro','Micro'],['pathology','Pathology'],['imaging','Imaging'],['medications','Medications'],['orders','Orders'],['documents','Documents'],['media','Media'],
  ];

  function installShell() {
    const app = $('spireApp');
    if (!app) return;
    app.innerHTML = `
      <header class="spire-topbar">
        <div class="spire-brand"><div class="spire-logo-mark">S</div><div><strong>Spire</strong><span>Sulandra Clinical Record</span></div></div>
        <nav class="spire-global-nav">${workspaces.map(([k,l]) => `<button data-workspace="${k}" class="${k === 'home' ? 'active' : ''}">${l}</button>`).join('')}</nav>
        <div class="spire-top-actions"><button id="spirePatientSearch">Find Patient</button><button id="spireBackToPlatform">Sulandra Health</button></div>
      </header>
      <section class="spire-patient-strip" id="spirePatientStrip" hidden></section>
      <main class="spire-shell">
        <aside class="spire-left-rail" id="spireLeftRail">
          <div class="rail-card"><h3>My Day</h3><div id="spireMiniSchedule">Loading schedule…</div></div>
          <div class="rail-card"><h3>In Basket</h3><div id="spireMiniInbox">Loading…</div></div>
          <div class="rail-card"><h3>Favorites</h3><button data-workspace="census">Patient Lists</button><button data-workspace="tools">SmartPhrases</button><button data-workspace="search">Find Chart</button></div>
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
    wireShell();
    renderHome();
    loadFoundation();
  }

  function wireShell() {
    document.addEventListener('click', e => {
      const workspace = e.target.closest('[data-workspace]');
      if (workspace) { activateWorkspace(workspace.dataset.workspace); return; }
      const patient = e.target.closest('[data-patient-id]');
      if (patient) { openPatient(patient.dataset.patientId); return; }
      const tab = e.target.closest('[data-chart-tab]');
      if (tab) { renderChartTab(tab.dataset.chartTab); return; }
      const category = e.target.closest('[data-chart-category]');
      if (category) { state.chartCategory = category.dataset.chartCategory; renderChartTab('chart-review'); return; }
    });
    $('spireBackToPlatform')?.addEventListener('click', () => location.href = '/employee-portal.html');
    $('spirePatientSearch')?.addEventListener('click', () => activateWorkspace('search'));
  }

  async function loadFoundation() {
    if (!token()) { location.href = '/employee-login.html?returnTo=/spire.html'; return; }
    try {
      const [patients,schedule,inbox] = await Promise.all([
        api('/api/spire/patients').catch(() => []),
        api('/api/spire/schedule').catch(() => []),
        api('/api/spire/inbasket').catch(() => []),
      ]);
      state.patients = arr(patients);
      state.schedule = arr(schedule);
      state.inbox = arr(inbox);
      renderMiniPanels();
      renderHome();
    } catch (error) { renderSystemError(error); }
  }

  function renderMiniPanels() {
    const schedule = $('spireMiniSchedule');
    if (schedule) schedule.innerHTML = state.schedule.length
      ? state.schedule.slice(0,6).map(x => `<button data-patient-id="${esc(x.patientId)}"><strong>${esc(x.time || '')}</strong> ${esc(x.patientName || 'Patient')}<span>${esc(x.status || '')}</span></button>`).join('')
      : '<span class="muted">No appointments today</span>';
    const inbox = $('spireMiniInbox');
    if (inbox) inbox.innerHTML = state.inbox.length
      ? state.inbox.slice(0,6).map(x => `<button ${x.patientId ? `data-patient-id="${esc(x.patientId)}"` : ''}><strong>${esc(x.category || 'Message')}</strong><span>${esc(x.title || '')}</span></button>`).join('')
      : '<span class="muted">No open items</span>';
  }

  function activateWorkspace(key) {
    state.activeWorkspace = key;
    document.querySelectorAll('.spire-global-nav button').forEach(b => b.classList.toggle('active', b.dataset.workspace === key));
    document.querySelectorAll('.spire-workspace').forEach(node => node.classList.remove('active'));
    if (key === 'home') { $('spireHomeWorkspace').classList.add('active'); renderHome(); return; }
    $('spireGenericWorkspace').classList.add('active');
    renderGenericWorkspace(key);
  }

  function renderHome() {
    const host = $('spireHomeWorkspace');
    if (!host) return;
    host.innerHTML = `
      <div class="workspace-title"><div><h1>Clinical Dashboard</h1><p>Schedule, chart access, In Basket and clinical work in one workspace.</p></div><button data-workspace="search">Open Chart</button></div>
      <div class="dashboard-grid">
        <article class="metric-card"><span>Today's Schedule</span><strong>${state.schedule.length}</strong><button data-workspace="schedule">View schedule</button></article>
        <article class="metric-card"><span>Open In Basket</span><strong>${state.inbox.filter(x => String(x.status || 'OPEN') !== 'DONE').length}</strong><button data-workspace="inbasket">Open inbox</button></article>
        <article class="metric-card"><span>Available Charts</span><strong>${state.patients.length}</strong><button data-workspace="census">Patient lists</button></article>
        <article class="metric-card"><span>Pre-Chart</span><strong>${state.schedule.filter(x => !['CHECKED_OUT','SIGNED'].includes(String(x.status || '').toUpperCase())).length}</strong><button data-workspace="schedule">Prepare charts</button></article>
      </div>
      <section class="panel"><h2>Today's Patients</h2><table><thead><tr><th>Time</th><th>Patient</th><th>Status</th><th>Type</th><th>Location</th></tr></thead><tbody>${state.schedule.length ? state.schedule.map(x => `<tr data-patient-id="${esc(x.patientId)}"><td>${esc(x.time || '')}</td><td><strong>${esc(x.patientName || 'Patient')}</strong></td><td>${esc(x.status || '')}</td><td>${esc(x.type || '')}</td><td>${esc(x.location || '')}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">No scheduled patients.</td></tr>'}</tbody></table></section>`;
  }

  function renderGenericWorkspace(key) {
    const host = $('spireGenericWorkspace');
    if (key === 'schedule') return renderSchedule(host);
    if (key === 'inbasket') return renderInbox(host);
    if (key === 'census' || key === 'search') return renderPatientList(host, key === 'search');
    if (key === 'tools') return renderTools(host);
    const titles = { tasks:'My Tasks', orders:'Orders', reports:'Reports' };
    host.innerHTML = `<div class="workspace-title"><div><h1>${esc(titles[key] || key)}</h1><p>Connected Spire workspace.</p></div></div><section class="panel"><p class="muted">This workspace is part of the Spire clinical architecture and will be expanded in its implementation phase.</p></section>`;
  }

  function renderSchedule(host) {
    host.innerHTML = `<div class="workspace-title"><div><h1>Schedule</h1><p>Select a patient to open the chart or pre-chart before the visit.</p></div></div><section class="panel"><table><thead><tr><th>Time</th><th>Status</th><th>Patient</th><th>Type</th><th>Provider</th><th>Location</th></tr></thead><tbody>${state.schedule.length ? state.schedule.map(x => `<tr data-patient-id="${esc(x.patientId)}"><td>${esc(x.time || '')}</td><td><span class="status-pill">${esc(x.status || '')}</span></td><td><strong>${esc(x.patientName || 'Patient')}</strong></td><td>${esc(x.type || '')}</td><td>${esc(x.provider || '')}</td><td>${esc(x.location || '')}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">No appointments.</td></tr>'}</tbody></table></section>`;
  }

  function renderInbox(host) {
    host.innerHTML = `<div class="workspace-title"><div><h1>In Basket</h1><p>Clinical messages, results, cosign requests, document review and tasks.</p></div></div><section class="panel"><table><thead><tr><th>Priority</th><th>Category</th><th>Patient</th><th>Subject</th><th>Status</th><th>Date</th></tr></thead><tbody>${state.inbox.length ? state.inbox.map(x => `<tr ${x.patientId ? `data-patient-id="${esc(x.patientId)}"` : ''}><td>${esc(x.priority || 'NORMAL')}</td><td>${esc(x.category || '')}</td><td>${esc(x.patientName || '')}</td><td>${esc(x.title || '')}</td><td>${esc(x.status || '')}</td><td>${esc(fmtDateTime(x.createdAt))}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">No in-basket items.</td></tr>'}</tbody></table></section>`;
  }

  function renderPatientList(host, search) {
    host.innerHTML = `<div class="workspace-title"><div><h1>${search ? 'Chart Search' : 'Patient Lists'}</h1><p>${search ? 'Search authorized charts by name, MRN, DOB or identifier.' : 'Assigned and authorized patient/client charts.'}</p></div></div>${search ? '<div class="patient-search"><input id="patientSearchInput" type="search" placeholder="Search name, MRN, DOB, identifier"><button id="patientSearchButton">Search</button></div>' : ''}<section class="panel"><table><thead><tr><th>Patient</th><th>MRN</th><th>DOB</th><th>Home/Program</th><th>Flags</th></tr></thead><tbody id="spirePatientRows">${renderPatientRows(state.patients)}</tbody></table></section>`;
    if (search) { $('patientSearchButton').onclick = filterPatients; $('patientSearchInput').oninput = filterPatients; }
  }

  function renderPatientRows(rows) {
    return rows.length ? rows.map(p => `<tr data-patient-id="${esc(p.id || p.patientId)}"><td><strong>${esc(nameOf(p))}</strong></td><td>${esc(p.medicalRecordNumber || p.mrn || '')}</td><td>${esc(fmtDate(p.dateOfBirth))}</td><td>${esc(p.homeName || p.programName || '')}</td><td>${arr(p.flags).map(f => `<span class="flag-chip ${esc(String(f.severity || '').toLowerCase())}">${esc(f.label || f)}</span>`).join(' ')}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">No authorized charts found.</td></tr>';
  }
  function filterPatients() {
    const q = String($('patientSearchInput')?.value || '').toLowerCase();
    $('spirePatientRows').innerHTML = renderPatientRows(state.patients.filter(p => JSON.stringify(p).toLowerCase().includes(q)));
  }

  function renderTools(host) {
    host.innerHTML = `<div class="workspace-title"><div><h1>Tools</h1><p>Personalize Spire and manage documentation accelerators.</p></div></div><div class="tool-grid"><button>SmartPhrase Manager<span>Create and share dot phrases</span></button><button>My SmartPhrases<span>Personal phrase library</span></button><button>SmartText<span>Reusable documentation blocks</span></button><button>Speed Buttons<span>Pin common note and AVS actions</span></button><button>Workspace Tabs<span>Reorder chart tabs</span></button><button>Saved Filters<span>Results and chart-review filters</span></button></div>`;
  }

  async function openPatient(id) {
    try {
      const [patient,storyboard] = await Promise.all([
        api(`/api/spire/patients/${encodeURIComponent(id)}`),
        api(`/api/spire/patients/${encodeURIComponent(id)}/storyboard`).catch(() => null),
      ]);
      state.patient = patient;
      state.storyboard = storyboard || patient;
      state.activeChartTab = 'chart-review';
      state.chartCategory = 'all';
      renderPatientStrip();
      renderChartWorkspace();
      history.replaceState(null, '', `#patient=${encodeURIComponent(id)}&tab=chart-review`);
    } catch (error) { renderSystemError(error); }
  }

  function renderPatientStrip() {
    const p = state.storyboard || state.patient || {};
    const strip = $('spirePatientStrip');
    strip.hidden = false;
    const allergies = arr(p.allergies);
    const flags = [...arr(p.flags), ...arr(p.riskAlerts)];
    const vitals = p.latestVitals || {};
    strip.innerHTML = `
      <div class="patient-avatar">${esc(nameOf(p).slice(0,1))}</div>
      <div class="patient-main"><strong>${esc(nameOf(p))}</strong><span>MRN ${esc(p.medicalRecordNumber || p.mrn || '—')} · DOB ${esc(fmtDate(p.dateOfBirth))} · ${esc(p.sexAtBirth || '')}</span><small>${esc(p.preferredLanguage ? `Language: ${p.preferredLanguage}` : '')}</small></div>
      <div class="patient-storyboard-facts">
        <div class="storyboard-cell danger"><span>Allergies</span><b>${allergies.length ? esc(allergies.map(a => a.substance).join(', ')) : 'None recorded'}</b></div>
        <div class="storyboard-cell"><span>Home / Program</span><b>${esc(p.homeName || '—')} · ${esc(p.programName || '—')}</b></div>
        <div class="storyboard-cell"><span>Latest Vitals</span><b>${vitals.systolic ? `BP ${esc(vitals.systolic)}/${esc(vitals.diastolic || '')}` : '—'}${vitals.pulse ? ` · HR ${esc(vitals.pulse)}` : ''}${vitals.spo2 ? ` · SpO₂ ${esc(vitals.spo2)}%` : ''}</b></div>
        <div class="storyboard-cell"><span>Open Work</span><b>${esc(p.openOrderCount || 0)} orders · ${esc(p.openTaskCount || 0)} tasks · ${esc(p.activeMedicationCount || 0)} meds</b></div>
      </div>
      <div class="patient-alert-row">${flags.length ? flags.slice(0,6).map(f => `<span class="flag-chip ${esc(String(f.severity || '').toLowerCase())}">${esc(f.label || f.title || f.type || 'Alert')}</span>`).join('') : '<span class="flag-chip clear">No active chart alerts</span>'}</div>`;
    renderClinicalContext();
  }

  function renderClinicalContext() {
    const p = state.storyboard || {};
    const context = $('spireContext');
    if (!context) return;
    const encounter = p.latestEncounter || {};
    const nextAppt = p.nextAppointment || {};
    context.innerHTML = `
      <div class="context-section"><strong>Active Diagnoses</strong>${arr(p.diagnoses).length ? arr(p.diagnoses).slice(0,6).map(d => `<span>${esc(d.display || d)}</span>`).join('') : '<span class="muted">None listed</span>'}</div>
      <div class="context-section"><strong>Active Problems</strong>${arr(p.problems).length ? arr(p.problems).slice(0,5).map(x => `<span>${esc(x.title || '')}</span>`).join('') : '<span class="muted">None listed</span>'}</div>
      <div class="context-section"><strong>Latest Encounter</strong><span>${esc(encounter.encounterType || '—')} · ${esc(encounter.status || '')}</span><small>${esc(fmtDateTime(encounter.startedAt))}</small></div>
      <div class="context-section"><strong>Next Appointment</strong><span>${esc(nextAppt.appointmentType || '—')} · ${esc(nextAppt.status || '')}</span><small>${esc(fmtDateTime(nextAppt.startsAt))}</small></div>
      <div class="context-section"><strong>Care Team</strong>${arr(p.careTeam).length ? arr(p.careTeam).slice(0,5).map(x => `<span>${esc(x.roleLabel || 'Care team')} · ${esc(x.userId || '')}</span>`).join('') : '<span class="muted">No active team listed</span>'}</div>`;
  }

  function renderChartWorkspace() {
    document.querySelectorAll('.spire-workspace').forEach(n => n.classList.remove('active'));
    const host = $('spireChartWorkspace');
    host.classList.add('active');
    host.innerHTML = `<div class="chart-tabs">${chartTabs.map(([k,l]) => `<button data-chart-tab="${k}" class="${k === state.activeChartTab ? 'active' : ''}">${l}</button>`).join('')}</div><div id="spireChartTabBody"></div>`;
    renderChartTab(state.activeChartTab);
  }

  async function renderChartTab(tab) {
    state.activeChartTab = tab;
    document.querySelectorAll('[data-chart-tab]').forEach(b => b.classList.toggle('active', b.dataset.chartTab === tab));
    const host = $('spireChartTabBody');
    if (!host || !state.patient) return;
    host.innerHTML = '<section class="panel"><p class="muted">Loading clinical chart…</p></section>';
    const id = state.patient.id || state.patient.patientId;
    history.replaceState(null, '', `#patient=${encodeURIComponent(id)}&tab=${encodeURIComponent(tab)}`);
    try {
      if (tab === 'chart-review') {
        const data = await api(`/api/spire/patients/${encodeURIComponent(id)}/chart-review-v2?category=${encodeURIComponent(state.chartCategory)}`);
        return renderChartReview(host, data);
      }
      if (tab === 'timeline') {
        const data = await api(`/api/spire/patients/${encodeURIComponent(id)}/timeline-v2`);
        return renderTimeline(host, data);
      }
      const data = await api(`/api/spire/patients/${encodeURIComponent(id)}/${tab}`).catch(() => null);
      if (tab === 'results-review') return renderResults(host, data);
      if (tab === 'notes') return renderNotes(host, data);
      host.innerHTML = `<section class="panel"><div class="workspace-title compact"><div><h2>${esc(chartTabs.find(x => x[0] === tab)?.[1] || tab)}</h2></div></div><pre class="json-foundation">${esc(JSON.stringify(data ?? {}, null, 2))}</pre></section>`;
    } catch (error) { host.innerHTML = `<section class="panel error">${esc(error.message)}</section>`; }
  }

  function renderChartReview(host, data) {
    const items = arr(data?.items || data);
    host.innerHTML = `<section class="panel chart-review-panel"><div class="workspace-title compact"><div><h2>Chart Review</h2><p>Chronological chart history. Filter by clinical record type without leaving the chart.</p></div><div class="chart-review-tools"><input id="chartReviewSearch" type="search" placeholder="Filter this view"><button id="chartReviewPrint">Print</button></div></div>
      <div class="subtabs chart-review-subtabs">${chartCategories.map(([k,l]) => `<button data-chart-category="${k}" class="${state.chartCategory === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="chart-review-summary"><span>${items.length} records</span><span>Category: ${esc(state.chartCategory === 'all' ? 'All chart history' : state.chartCategory)}</span></div>
      <table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Status</th><th>Author / Source</th></tr></thead><tbody id="chartReviewRows">${renderChartRows(items)}</tbody></table></section>`;
    $('chartReviewSearch').oninput = () => {
      const q = String($('chartReviewSearch').value || '').toLowerCase();
      $('chartReviewRows').innerHTML = renderChartRows(items.filter(item => JSON.stringify(item).toLowerCase().includes(q)));
    };
    $('chartReviewPrint').onclick = () => window.print();
  }

  function renderChartRows(items) {
    return items.length ? items.map(item => `<tr><td>${esc(fmtDateTime(item.date || item.createdAt))}</td><td><span class="record-type">${esc(item.type || '')}</span></td><td><strong>${esc(item.description || item.title || '')}</strong></td><td>${esc(item.status || '')}</td><td>${esc(item.author || item.provider || '')}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">No records in this chart-review category.</td></tr>';
  }

  function renderTimeline(host, data) {
    const items = arr(data?.items || data);
    const types = [...new Set(items.map(x => String(x.type || '')).filter(Boolean))];
    host.innerHTML = `<section class="panel"><div class="workspace-title compact"><div><h2>Patient Timeline</h2><p>One longitudinal view of appointments, encounters, documentation, results, medications, orders, incidents, care plans, documents and vitals.</p></div></div>
      <div class="timeline-toolbar"><select id="timelineType"><option value="">All event types</option>${types.map(t => `<option>${esc(t)}</option>`).join('')}</select><input id="timelineSearch" type="search" placeholder="Search timeline"></div>
      <div id="spireTimeline" class="spire-timeline">${renderTimelineItems(items)}</div></section>`;
    const apply = () => {
      const type = String($('timelineType').value || '');
      const q = String($('timelineSearch').value || '').toLowerCase();
      $('spireTimeline').innerHTML = renderTimelineItems(items.filter(x => (!type || x.type === type) && (!q || JSON.stringify(x).toLowerCase().includes(q))));
    };
    $('timelineType').onchange = apply;
    $('timelineSearch').oninput = apply;
  }

  function renderTimelineItems(items) {
    return items.length ? items.map(item => `<article class="timeline-event"><div class="timeline-marker"></div><div class="timeline-date">${esc(fmtDateTime(item.date))}</div><div class="timeline-card"><div><span class="record-type">${esc(item.type || 'Event')}</span><span class="status-pill">${esc(item.status || '')}</span></div><strong>${esc(item.title || item.type || 'Clinical event')}</strong><p>${esc(item.detail || '')}</p></div></article>`).join('') : '<p class="muted">No timeline events found.</p>';
  }

  function renderResults(host, data) {
    const items = arr(data?.items || data);
    host.innerHTML = `<section class="panel"><div class="workspace-title compact"><div><h2>Results Review</h2><p>Review newest or oldest results, choose a date range and prepare values for trending.</p></div></div><div class="results-toolbar"><input type="date"><input type="date"><select><option>Newest first</option><option>Oldest first</option></select><button>Trend Selected</button></div><table><thead><tr><th>Result</th><th>Value</th><th>Flag</th><th>Reference</th><th>Date</th></tr></thead><tbody>${items.length ? items.map(i => `<tr><td>${esc(i.name || i.testName || '')}</td><td>${esc(i.value || '')}</td><td>${esc(i.abnormalFlag || '')}</td><td>${esc(i.referenceRange || '')}</td><td>${esc(fmtDateTime(i.resultedAt))}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">No results yet.</td></tr>'}</tbody></table></section>`;
  }

  function renderNotes(host, data) {
    const notes = arr(data?.items || data);
    host.innerHTML = `<section class="notes-layout"><div class="panel"><div class="workspace-title compact"><div><h2>Notes</h2><p>Draft, SmartPhrase, sign and cosign clinical documentation.</p></div><button id="createSpireNote">Create Note</button></div><div class="speed-buttons"><button>.PROGRESS</button><button>.NURSING</button><button>.FOLLOWUP</button><button>.INCIDENT</button></div><textarea id="spireNoteEditor" placeholder="Type note here. Enter . to use a SmartPhrase."></textarea><div class="note-actions"><button>Save Draft</button><button>Route for Cosign</button><button class="primary">Sign Note</button></div></div><aside class="panel note-list"><h3>Recent Notes</h3>${notes.length ? notes.map(n => `<button><strong>${esc(n.noteType || 'Note')}</strong><span>${esc(n.author || '')} · ${esc(fmtDateTime(n.createdAt))}</span></button>`).join('') : '<p class="muted">No notes yet.</p>'}</aside></section>`;
  }

  function renderSystemError(error) {
    const host = $('spireHomeWorkspace');
    if (host) host.innerHTML = `<section class="panel error"><h2>Spire could not load</h2><p>${esc(error.message)}</p></section>`;
  }

  document.addEventListener('DOMContentLoaded', installShell);
  if (document.readyState !== 'loading') installShell();
})();
