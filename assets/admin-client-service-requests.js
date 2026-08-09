(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const token = () => sessionStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra_token')
    || localStorage.getItem('token')
    || localStorage.getItem('accessToken')
    || '';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const api = async (path, options = {}) => {
    await window.SulandraCompanyContext?.initialize?.().catch(() => undefined);
    const companyHeaders = window.SulandraCompanyContext?.headers?.() || {};
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token()}`,
        ...companyHeaders,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload.data ?? payload;
  };

  let requests = [];
  let employees = [];
  let homes = [];
  let selected = null;
  let workspace = null;
  let loadingSequence = 0;

  const statusLabels = {
    NEW: 'New', REVIEWING: 'Reviewing', CONTACTED: 'Contacted', INTAKE_STARTED: 'Intake Started',
    ACCEPTED: 'Accepted', DECLINED: 'Declined', CLOSED: 'Closed',
  };
  const modeLabels = {
    OPERATIONAL: 'Operational intake',
    PRELAUNCH_INTEREST: 'Prelaunch interest',
    ENTERPRISE_CONSULTATION: 'Enterprise consultation',
  };
  const serviceLabels = {
    HOMEMAKER_PERSONAL_CARE: 'Homemaker / Personal Care',
    SHARED_LIVING: 'Shared Living / Community Living',
    RESPITE: 'Respite',
    TRANSPORTATION: 'Transportation',
    NURSING: 'Nursing',
    HOME_HEALTH: 'Home Health',
    COMMUNITY_INTEGRATION: 'Community Integration',
    OTHER: 'Other',
  };

  function host() { return document.getElementById('onboarding-service-requests'); }
  function style() {
    if (document.getElementById('csrStyle')) return;
    const sheet = document.createElement('style');
    sheet.id = 'csrStyle';
    sheet.textContent = `
      #clientServiceRequests{font-family:inherit}.csr-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.csr-actions{display:flex;gap:8px;flex-wrap:wrap}.csr-btn{border:1px solid #0b6cad;background:#fff;color:#075493;border-radius:8px;padding:9px 12px;font-weight:900;cursor:pointer}.csr-btn.primary{background:#075985;color:#fff}.csr-btn:disabled{opacity:.5;cursor:not-allowed}.csr-banner{margin:14px 0 4px;padding:12px 14px;border:1px solid #b9d7eb;border-radius:10px;background:#eef8ff;color:#164e72}.csr-banner.prelaunch{border-color:#e4c978;background:#fff8df;color:#714f08}.csr-banner strong{display:block;margin-bottom:3px}.csr-metrics{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;margin:16px 0}.csr-metric{background:#f8fbfe;border:1px solid #dbe7f0;border-radius:11px;padding:13px}.csr-metric strong{display:block;font-size:24px;color:#075985}.csr-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.csr-toolbar select,.csr-toolbar input{border:1px solid #c9d7e3;border-radius:8px;padding:9px;min-width:170px}.csr-table-wrap{overflow:auto;margin-top:14px}.csr-table{width:100%;border-collapse:collapse;min-width:1120px}.csr-table th,.csr-table td{text-align:left;padding:10px;border-bottom:1px solid #e5edf3;font-size:13px}.csr-table th{background:#eef5fa;color:#476579;font-size:11px;text-transform:uppercase}.csr-pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#e0f2fe;color:#075985;font-weight:800;font-size:11px}.csr-pill.urgent,.csr-pill.prelaunch{background:#fee2e2;color:#991b1b}.csr-pill.consultation{background:#fef3c7;color:#854d0e}.csr-drawer{display:none;margin-top:16px;border:1px solid #cbd9e4;border-radius:12px;background:#fff;overflow:hidden}.csr-drawer.open{display:block}.csr-drawer-head{background:#0c4a6e;color:#fff;padding:13px 15px;display:flex;align-items:center;gap:10px}.csr-drawer-head strong{flex:1}.csr-body{padding:16px}.csr-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.csr-field{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px}.csr-field span{display:block;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:900}.csr-field strong{display:block;margin-top:4px}.csr-boundary{margin:12px 0;padding:11px 12px;border:1px solid #d8c070;border-radius:8px;background:#fff8db;color:#6f500b}.csr-boundary.operational{border-color:#9bd1b1;background:#eaf9f0;color:#155d36}.csr-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.csr-form label{font-size:12px;font-weight:900}.csr-form input,.csr-form select,.csr-form textarea{width:100%;border:1px solid #bccbd8;border-radius:8px;padding:9px;margin-top:4px}.csr-form textarea{min-height:100px;resize:vertical}.csr-full{grid-column:1/-1}.csr-empty{padding:28px;text-align:center;color:#64748b}@media(max-width:980px){.csr-metrics{grid-template-columns:repeat(2,1fr)}}@media(max-width:850px){.csr-grid,.csr-form{grid-template-columns:1fr 1fr}}@media(max-width:600px){.csr-metrics,.csr-grid,.csr-form{grid-template-columns:1fr}}`;
    document.head.appendChild(sheet);
  }
  function shell() {
    return `<section id="clientServiceRequests"><div class="csr-head"><div><h1 style="margin:0;color:#075985">Client Service Requests</h1><p class="sub">Company-owned consultations, referral interest, and capability-gated formal intake.</p></div><div class="csr-actions"><a class="csr-btn" href="/service-request.html" target="_blank" rel="noopener">Open Public Form</a><button class="csr-btn primary" id="csrRefresh">Refresh</button></div></div><div id="csrWorkspace"></div><div id="csrStatus" class="sub" style="margin-top:10px"></div><div id="csrMetrics" class="csr-metrics"></div><div class="csr-toolbar"><select id="csrFilter"><option value="">All statuses</option>${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select><input id="csrSearch" type="search" placeholder="Search client, requester, company, email"><button class="csr-btn" id="csrApply">Apply</button></div><div id="csrTable" class="csr-table-wrap"></div><section id="csrDrawer" class="csr-drawer"><div class="csr-drawer-head"><strong id="csrDrawerTitle">Service Request</strong><button class="csr-btn" id="csrClose">Close</button></div><div id="csrDrawerBody" class="csr-body"></div></section></section>`;
  }
  function showStatus(message, error = false) {
    const node = document.getElementById('csrStatus');
    if (!node) return;
    node.textContent = message || '';
    node.style.color = error ? '#b91c1c' : '#64748b';
  }
  function renderWorkspace() {
    const node = document.getElementById('csrWorkspace');
    if (!node) return;
    if (!workspace) { node.innerHTML = ''; return; }
    const operational = workspace.formalIntakeAvailable === true;
    node.innerHTML = `<div class="csr-banner ${operational ? '' : 'prelaunch'}"><strong>${esc(workspace.legalEntityName)} (${esc(workspace.legalEntityCode)})</strong>${operational ? 'Formal intake is enabled for this company. Every SPIRE handoff remains in this company boundary.' : `${esc(workspace.formalIntakeReadinessReason)} Requests here remain consultation or prelaunch interest and cannot be treated as accepted provider service.`}</div>`;
  }
  function metrics(values = {}) {
    const node = document.getElementById('csrMetrics');
    node.innerHTML = [
      ['Total', values.total || 0],
      ['New', values.new || 0],
      ['Urgent open', values.urgent || 0],
      ['Intake started', values.intakeStarted || 0],
      ['Prelaunch interest', values.prelaunchInterest || 0],
    ].map(([label, value]) => `<div class="csr-metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
  }
  function filtered() {
    const query = (document.getElementById('csrSearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('csrFilter')?.value || '';
    return requests.filter((request) => (!status || request.status === status) && (!query || [
      request.requestNumber, request.clientName, request.requesterName, request.requestedCompanyName,
      request.email, request.phone, request.county,
    ].some((value) => String(value || '').toLowerCase().includes(query))));
  }
  function modeClass(mode) {
    return mode === 'PRELAUNCH_INTEREST' ? 'prelaunch' : mode === 'ENTERPRISE_CONSULTATION' ? 'consultation' : '';
  }
  function render() {
    const rows = filtered();
    const node = document.getElementById('csrTable');
    if (!rows.length) { node.innerHTML = '<div class="csr-empty">No service requests match this company and view.</div>'; return; }
    node.innerHTML = `<table class="csr-table"><thead><tr><th>Request</th><th>Client</th><th>Requested company</th><th>Services</th><th>Mode</th><th>Urgency</th><th>Status</th><th>Received</th><th></th></tr></thead><tbody>${rows.map((request) => `<tr><td><strong>${esc(request.requestNumber)}</strong><br><span class="sub">${esc(request.requesterName)}</span></td><td><strong>${esc(request.clientName)}</strong><br><span class="sub">${esc([request.city, request.county].filter(Boolean).join(' · '))}</span></td><td>${esc(request.requestedCompanyName || request.requestedCompanyCode)}</td><td>${(Array.isArray(request.serviceTypes) ? request.serviceTypes : []).slice(0, 2).map((service) => esc(serviceLabels[service] || service)).join('<br>')}</td><td><span class="csr-pill ${modeClass(request.intakeMode)}">${esc(modeLabels[request.intakeMode] || request.intakeMode)}</span></td><td><span class="csr-pill ${request.urgency === 'URGENT' ? 'urgent' : ''}">${esc(request.urgency)}</span></td><td><span class="csr-pill">${esc(statusLabels[request.status] || request.status)}</span></td><td>${request.createdAt ? new Date(request.createdAt).toLocaleDateString() : ''}</td><td><button class="csr-btn" data-open="${esc(request.id)}">Manage</button></td></tr>`).join('')}</tbody></table>`;
    node.querySelectorAll('[data-open]').forEach((button) => { button.onclick = () => openRequest(button.dataset.open); });
  }
  function employeeOptions(value) {
    return `<option value="">Unassigned</option>${employees.map((employee) => `<option value="${esc(employee.id)}" ${employee.id === value ? 'selected' : ''}>${esc(employee.displayName || employee.email || employee.id)}</option>`).join('')}`;
  }
  function homeOptions(value) {
    return `<option value="">No service home selected</option>${homes.map((home) => `<option value="${esc(home.id)}" ${home.id === value ? 'selected' : ''}>${esc(home.name)}</option>`).join('')}`;
  }
  function serviceList(request) {
    return (Array.isArray(request.serviceTypes) ? request.serviceTypes : []).map((service) => serviceLabels[service] || service).join(', ');
  }
  function boundaryText(request) {
    if (request.intakeMode === 'OPERATIONAL') return 'This request belongs to an approved operational queue. Formal intake remains available only while the company readiness controls stay active.';
    if (request.intakeMode === 'PRELAUNCH_INTEREST') return `Held by ${request.ownerCompanyName}. Interest in ${request.requestedCompanyName} is recorded, but formal intake and service acceptance are blocked until provider approval and operating capabilities are explicitly active.`;
    return 'This is an enterprise consultation. It does not represent provider acceptance, service availability, licensure, payer enrollment, or authorization to bill.';
  }
  function statusOptions(request) {
    return Object.entries(statusLabels).map(([value, label]) => {
      const blocked = request.intakeMode !== 'OPERATIONAL' && ['INTAKE_STARTED', 'ACCEPTED'].includes(value);
      return `<option value="${value}" ${value === request.status ? 'selected' : ''} ${blocked ? 'disabled' : ''}>${label}${blocked ? ' — unavailable before approval' : ''}</option>`;
    }).join('');
  }
  function openRequest(id) {
    selected = requests.find((request) => request.id === id);
    if (!selected) return;
    const drawer = document.getElementById('csrDrawer');
    document.getElementById('csrDrawerTitle').textContent = `${selected.requestNumber} · ${selected.clientName}`;
    const canManage = workspace?.accessLevel === 'MANAGE';
    const canStart = canManage && selected.formalIntakeAvailable === true;
    const canRoute = canManage && workspace?.enterpriseOwner === true && selected.intakeMode === 'PRELAUNCH_INTEREST' && selected.requestedCompanyReady === true;
    document.getElementById('csrDrawerBody').innerHTML = `<div class="csr-boundary ${selected.intakeMode === 'OPERATIONAL' ? 'operational' : ''}"><strong>${esc(modeLabels[selected.intakeMode] || selected.intakeMode)}</strong><br>${esc(boundaryText(selected))}</div><div class="csr-grid"><div class="csr-field"><span>Owning company</span><strong>${esc(selected.ownerCompanyName)}</strong></div><div class="csr-field"><span>Requested company</span><strong>${esc(selected.requestedCompanyName)}</strong></div><div class="csr-field"><span>Requester</span><strong>${esc(selected.requesterName)} (${esc(selected.requesterRelationship)})</strong></div><div class="csr-field"><span>Contact</span><strong>${esc(selected.email)} · ${esc(selected.phone)}</strong></div><div class="csr-field"><span>Client</span><strong>${esc(selected.clientName)} ${selected.clientDateOfBirth ? `· DOB ${esc(selected.clientDateOfBirth)}` : ''}</strong></div><div class="csr-field"><span>Location</span><strong>${esc([selected.streetAddress, selected.city, selected.state, selected.zipCode, selected.county].filter(Boolean).join(', '))}</strong></div><div class="csr-field"><span>Services</span><strong>${esc(serviceList(selected))}</strong></div><div class="csr-field"><span>Funding / Start</span><strong>${esc(selected.fundingSource || 'Not specified')} ${selected.requestedStartDate ? `· ${esc(selected.requestedStartDate)}` : ''}</strong></div></div><div class="csr-field" style="margin-top:12px"><span>Request notes</span><strong style="white-space:pre-wrap">${esc(selected.notes || 'No additional notes')}</strong></div><div class="csr-form"><label>Status<select id="csrEditStatus" ${canManage ? '' : 'disabled'}>${statusOptions(selected)}</select></label><label>Assigned team member<select id="csrEditAssignee" ${canManage ? '' : 'disabled'}>${employeeOptions(selected.assignedToUserId)}</select></label><label>Service home<select id="csrEditHome" ${canManage ? '' : 'disabled'}>${homeOptions(selected.serviceHomeId)}</select></label><label>Next follow-up<input id="csrEditFollow" type="datetime-local" ${canManage ? '' : 'disabled'} value="${selected.nextFollowUpAt ? new Date(selected.nextFollowUpAt).toISOString().slice(0, 16) : ''}"></label><label class="csr-full">Internal notes<textarea id="csrEditNotes" ${canManage ? '' : 'disabled'}>${esc(selected.internalNotes || '')}</textarea></label><label class="csr-full">Disposition / decision reason<textarea id="csrEditReason" ${canManage ? '' : 'disabled'}>${esc(selected.dispositionReason || '')}</textarea></label></div><div class="csr-actions" style="margin-top:14px"><button class="csr-btn primary" id="csrSave" ${canManage ? '' : 'disabled'}>Save Review</button><button class="csr-btn" id="csrStartIntake" ${canStart ? '' : 'disabled'} title="${esc(canStart ? 'Create or open the company-scoped SPIRE intake import' : selected.requestedCompanyReadinessReason || 'Formal intake is unavailable')}">Start Formal Intake</button>${canRoute ? `<button class="csr-btn" id="csrRouteApproved">Route to approved ${esc(selected.requestedCompanyName)}</button>` : ''}<a class="csr-btn" href="mailto:${encodeURIComponent(selected.email)}">Email Requester</a><a class="csr-btn" href="tel:${esc(selected.phone)}">Call Requester</a></div>`;
    drawer.classList.add('open');
    document.getElementById('csrSave').onclick = saveReview;
    document.getElementById('csrStartIntake').onclick = startIntake;
    if (canRoute) document.getElementById('csrRouteApproved').onclick = routeApproved;
    drawer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function saveReview() {
    if (!selected) return;
    try {
      showStatus('Saving company-scoped review…');
      const body = {
        status: document.getElementById('csrEditStatus').value,
        assignedToUserId: document.getElementById('csrEditAssignee').value || null,
        serviceHomeId: document.getElementById('csrEditHome').value || null,
        nextFollowUpAt: document.getElementById('csrEditFollow').value || null,
        internalNotes: document.getElementById('csrEditNotes').value,
        dispositionReason: document.getElementById('csrEditReason').value,
      };
      await api(`/api/admin/client-service-requests/${selected.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
      showStatus('Service request updated inside the selected company.');
    } catch (error) { showStatus(error.message, true); }
  }
  async function startIntake() {
    if (!selected || selected.formalIntakeAvailable !== true) return;
    try {
      if (!confirm(`Start formal intake for ${selected.clientName} inside ${workspace.legalEntityName}?`)) return;
      showStatus('Starting company-scoped formal intake…');
      const result = await api(`/api/admin/client-service-requests/${selected.id}/start-intake`, { method: 'POST', body: '{}' });
      sessionStorage.setItem('sulandra:client-intake-draft', JSON.stringify(result.clientDraft || {}));
      await load();
      showStatus('Formal intake started. The request and SPIRE import share the same company boundary.');
    } catch (error) { showStatus(error.message, true); }
  }
  async function routeApproved() {
    if (!selected || !selected.requestedCompanyReady || !workspace?.enterpriseOwner) return;
    const reason = prompt(`Record why ${selected.requestedCompanyName} is now approved and ready for formal intake:`, 'Provider approval and operating capability verified');
    if (reason === null) return;
    try {
      showStatus(`Routing to ${selected.requestedCompanyName}…`);
      await api(`/api/admin/client-service-requests/${selected.id}/route-to-requested-company`, { method: 'POST', body: JSON.stringify({ reason }) });
      selected = null;
      await load();
      showStatus('The request moved to the approved provider queue with an immutable routing record.');
    } catch (error) { showStatus(error.message, true); }
  }
  async function load() {
    const sequence = ++loadingSequence;
    requests = [];
    employees = [];
    homes = [];
    workspace = null;
    metrics({});
    renderWorkspace();
    render();
    try {
      showStatus('Loading the selected company intake queue…');
      const data = await api('/api/admin/client-service-requests');
      if (sequence !== loadingSequence) return;
      requests = data.requests || [];
      employees = data.directories?.employees || [];
      homes = data.directories?.homes || [];
      workspace = data.workspace || null;
      metrics(data.metrics || {});
      renderWorkspace();
      render();
      if (selected) {
        selected = requests.find((request) => request.id === selected.id) || null;
        if (selected) openRequest(selected.id);
        else document.getElementById('csrDrawer').classList.remove('open');
      }
      showStatus(workspace ? `${workspace.legalEntityName} queue loaded.` : '');
    } catch (error) {
      if (sequence !== loadingSequence) return;
      document.getElementById('csrDrawer')?.classList.remove('open');
      showStatus(error.message, true);
    }
  }
  function install() {
    const target = host();
    if (!target || document.getElementById('clientServiceRequests')) return;
    style();
    target.innerHTML = shell();
    document.getElementById('csrRefresh').onclick = load;
    document.getElementById('csrApply').onclick = render;
    document.getElementById('csrSearch').oninput = render;
    document.getElementById('csrFilter').onchange = render;
    document.getElementById('csrClose').onclick = () => document.getElementById('csrDrawer').classList.remove('open');
    window.addEventListener('sulandra:company-change', () => { selected = null; load(); });
    load();
  }
  const retry = () => { install(); setTimeout(retry, 1200); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', retry, { once: true }) : retry();
})();
