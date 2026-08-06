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
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const date = value => value ? new Date(value).toLocaleDateString() : '—';
  const dateTime = value => value ? new Date(value).toLocaleString() : '—';
  const label = value => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  const statusClass = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  let dashboard = null;
  let workflows = null;
  let activeTab = 'dashboard';
  let selectedEmployeeId = null;
  let selectedRequestId = null;
  let workflowDraft = null;
  let installScheduled = false;

  async function api(path, options = {}) {
    const auth = token();
    if (!auth) throw new Error('Your admin session is unavailable. Sign in again.');
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${auth}`,
        ...(options.body ? {'Content-Type':'application/json'} : {}),
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body.data ?? body;
  }

  function addStyles() {
    if (document.getElementById('employeeCollaborationAdminStyles')) return;
    const style = document.createElement('style');
    style.id = 'employeeCollaborationAdminStyles';
    style.textContent = `
      #employeeTeamHubOverlay{position:fixed;inset:0;background:rgba(7,25,42,.72);z-index:10070;display:none;padding:18px;overflow:auto;color:#243447;font-family:inherit}#employeeTeamHubOverlay.open{display:block}
      .ech-shell{width:min(1500px,100%);margin:0 auto;background:#f5f8fb;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.35);overflow:hidden;min-height:calc(100vh - 36px)}
      .ech-head{background:linear-gradient(135deg,#083f72,#087fb9);color:#fff;padding:18px 22px;display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.ech-head h2{margin:0;color:#fff;font-size:28px}.ech-head p{margin:5px 0 0;opacity:.92}.ech-actions{display:flex;gap:8px;flex-wrap:wrap}
      .ech-btn{border:1px solid #0b69aa;background:#fff;color:#075493;border-radius:7px;padding:9px 13px;font-weight:800;cursor:pointer;font-size:14px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.ech-btn:hover{filter:brightness(.97)}.ech-btn.primary{background:#0784c6;color:#fff}.ech-btn.danger{background:#c9432d;border-color:#c9432d;color:#fff}.ech-btn.warn{background:#fff1c8;border-color:#d2a31b;color:#6d4d00}.ech-btn:disabled{opacity:.5;cursor:not-allowed}
      .ech-tabs{display:flex;overflow:auto;background:#dfeaf3;border-bottom:1px solid #b8cad9;scrollbar-width:none}.ech-tabs::-webkit-scrollbar{display:none}.ech-tab{border:0;border-right:1px solid #b8cad9;background:transparent;color:#16486f;padding:12px 15px;font-weight:900;cursor:pointer;white-space:nowrap}.ech-tab.active{background:#fff;color:#075493}
      .ech-status{display:none;margin:14px 18px 0;padding:10px 12px;border:1px solid #e0c15b;background:#fff6d8;border-radius:7px}.ech-status.show{display:block}.ech-status.error{background:#fde6e2;border-color:#d87866;color:#8f2519}.ech-body{padding:18px}.ech-panel{display:none}.ech-panel.active{display:block}
      .ech-metrics{display:grid;grid-template-columns:repeat(6,minmax(145px,1fr));gap:11px;margin-bottom:16px}.ech-card{background:#fff;border:1px solid #d1dde7;border-radius:9px;padding:13px}.ech-card h3,.ech-card h4{margin:0 0 7px;color:#075493}.ech-metric{font-size:27px;font-weight:900;color:#0a5792}.ech-sub{font-size:12px;color:#687785;margin-top:4px}.ech-grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:13px}.ech-grid.three{grid-template-columns:repeat(3,minmax(210px,1fr))}
      .ech-section{margin-top:18px}.ech-section h3{margin:0 0 10px;color:#075493}.ech-list{background:#fff;border:1px solid #d1dde7;border-radius:9px;overflow:hidden}.ech-row{display:flex;justify-content:space-between;gap:13px;align-items:flex-start;padding:12px;border-top:1px solid #e1e8ee}.ech-row:first-child{border-top:0}.ech-row-main{min-width:0}.ech-title{font-weight:900;color:#163f60}.ech-row-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.ech-badge{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:900;background:#e8f3fb;color:#075493;margin:2px}.ech-badge.approved,.ech-badge.completed,.ech-badge.active,.ech-badge.compliant,.ech-badge.read{background:#def4e5;color:#176b35}.ech-badge.rejected,.ech-badge.overdue,.ech-badge.failed,.ech-badge.cancelled,.ech-badge.terminated{background:#fde1dc;color:#9e2415}.ech-badge.inreview,.ech-badge.submitted,.ech-badge.pending,.ech-badge.duesoon,.ech-badge.unread,.ech-badge.high,.ech-badge.urgent{background:#fff0c4;color:#705100}
      .ech-input,.ech-select,.ech-textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #b9c8d6;border-radius:7px;background:#fff;font:inherit}.ech-textarea{min-height:100px;resize:vertical}.ech-form label{display:block;font-size:13px;font-weight:800;color:#34495e}.ech-form-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.ech-empty{text-align:center;padding:34px;border:2px dashed #bdd6e8;border-radius:10px;background:#f7fbfe}.ech-alert{border:1px solid #e0c15b;background:#fff7dc;border-radius:8px;padding:12px;margin-bottom:12px}.ech-alert.danger{border-color:#d77a69;background:#fde7e3}
      .ech-table-wrap{overflow:auto;background:#fff;border:1px solid #ccd8e4;border-radius:9px}.ech-table{width:100%;border-collapse:collapse;min-width:1050px}.ech-table th{background:#e8f1f8;color:#123d63;text-align:left;padding:10px;border-bottom:1px solid #b8c9d8;position:sticky;top:0}.ech-table td{padding:10px;border-bottom:1px solid #e1e8ee;vertical-align:top}.ech-table tr[data-team-employee]{cursor:pointer}.ech-table tr[data-team-employee]:hover{background:#f4f9fd}
      .ech-modal{position:fixed;inset:0;background:rgba(13,31,49,.68);z-index:10090;display:none;align-items:flex-start;justify-content:center;padding:18px;overflow:auto}.ech-modal.open{display:flex}.ech-dialog{width:min(980px,100%);background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;margin:auto}.ech-dialog.wide{width:min(1250px,100%)}.ech-dialog-head{background:#0d477d;color:#fff;padding:16px 19px;display:flex;justify-content:space-between;gap:12px;align-items:center}.ech-dialog-head h3{margin:0;color:#fff}.ech-dialog-body{padding:18px;max-height:78vh;overflow:auto}.ech-close{border:0;background:#fff;color:#075493;border-radius:6px;padding:8px 12px;font-weight:900;cursor:pointer}
      .ech-step-editor{display:grid;grid-template-columns:70px 1fr 120px 1fr auto;gap:8px;align-items:end;padding:10px;border:1px solid #d3dfe8;border-radius:8px;margin-top:8px}.ech-recognition{background:linear-gradient(135deg,#fff9df,#fff);border-color:#e4c864}.ech-confidential{border-left:5px solid #9b3a2a}.ech-profile-collaboration{margin-left:6px}
      @media(max-width:1100px){.ech-metrics{grid-template-columns:repeat(3,1fr)}.ech-grid,.ech-grid.three{grid-template-columns:1fr 1fr}.ech-step-editor{grid-template-columns:70px 1fr 120px}.ech-step-editor>*:nth-child(4),.ech-step-editor>*:nth-child(5){grid-column:auto}}
      @media(max-width:760px){#employeeTeamHubOverlay{padding:0}.ech-shell{border-radius:0;min-height:100vh}.ech-head{flex-direction:column;padding:16px}.ech-head h2{font-size:24px}.ech-body{padding:12px}.ech-metrics,.ech-grid,.ech-grid.three{grid-template-columns:1fr}.ech-row{flex-direction:column}.ech-row-actions{width:100%;justify-content:flex-start}.ech-row-actions .ech-btn,.ech-actions .ech-btn,.ech-form-actions .ech-btn{flex:1}.ech-step-editor{grid-template-columns:1fr}.ech-modal{padding:6px}.ech-dialog{border-radius:8px}.ech-dialog-body{max-height:none}}
    `;
    document.head.appendChild(style);
  }

  function overlayShell() {
    return `<div id="employeeTeamHubOverlay"><div class="ech-shell"><div class="ech-head"><div><h2>Employee 360 Team Hub</h2><p>Manager collaboration, employee requests, configurable approvals, feedback, recognition, team risk signals, and workplace notifications.</p></div><div class="ech-actions"><button class="ech-btn" id="echRefresh">Refresh</button><button class="ech-btn" id="echClose">Close Team Hub</button></div></div><div class="ech-tabs">${[['dashboard','Team Dashboard'],['approvals','My Approvals'],['requests','All Requests'],['team','Team Directory'],['recognition','Recognition'],['workflows','Approval Workflows'],['notifications','Notifications']].map(([id,name]) => `<button class="ech-tab ${activeTab===id?'active':''}" data-ech-tab="${id}">${name}</button>`).join('')}</div><div id="echStatus" class="ech-status"></div><div class="ech-body" id="echBody"></div></div></div>
      <div class="ech-modal" id="echModal"><div class="ech-dialog wide" id="echDialog"><div class="ech-dialog-head"><h3 id="echModalTitle">Employee 360</h3><button class="ech-close" id="echModalClose">Close</button></div><div class="ech-dialog-body" id="echModalBody"></div></div></div>`;
  }

  function setStatus(message, error = false) {
    const box = document.getElementById('echStatus');
    if (!box) return;
    box.textContent = message;
    box.classList.toggle('show', Boolean(message));
    box.classList.toggle('error', error);
  }

  function openModal(title, body, wide = true) {
    document.getElementById('echModalTitle').textContent = title;
    document.getElementById('echModalBody').innerHTML = body;
    document.getElementById('echDialog').classList.toggle('wide', wide);
    document.getElementById('echModal').classList.add('open');
  }

  function closeModal() {
    document.getElementById('echModal')?.classList.remove('open');
    selectedRequestId = null;
  }

  function installOverlay() {
    if (document.getElementById('employeeTeamHubOverlay')) return;
    addStyles();
    document.body.insertAdjacentHTML('beforeend', overlayShell());
    document.getElementById('echClose').onclick = closeHub;
    document.getElementById('echRefresh').onclick = loadDashboard;
    document.getElementById('echModalClose').onclick = closeModal;
    document.getElementById('echModal').addEventListener('click', event => { if (event.target.id === 'echModal') closeModal(); });
    document.querySelectorAll('[data-ech-tab]').forEach(button => button.onclick = () => { activeTab = button.dataset.echTab; render(); });
  }

  function installButtons() {
    const employee360 = document.getElementById('employee360');
    if (!employee360) return;
    const actions = employee360.querySelector('.e360-head .e360-actions');
    if (actions && !document.getElementById('openEmployeeTeamHub')) {
      const button = document.createElement('button');
      button.id = 'openEmployeeTeamHub';
      button.className = 'e360-btn primary';
      button.type = 'button';
      button.textContent = 'Team Hub';
      button.onclick = openHub;
      actions.prepend(button);
    }
    const profileActions = employee360.querySelector('.e360-profile-head .e360-actions');
    if (profileActions && selectedEmployeeId && !document.getElementById('openProfileCollaboration')) {
      const button = document.createElement('button');
      button.id = 'openProfileCollaboration';
      button.className = 'e360-btn ech-profile-collaboration';
      button.type = 'button';
      button.textContent = 'Collaboration';
      button.onclick = () => openEmployee(selectedEmployeeId);
      profileActions.prepend(button);
    }
  }

  async function openHub() {
    installOverlay();
    document.getElementById('employeeTeamHubOverlay').classList.add('open');
    history.replaceState(null, '', `${location.pathname}${location.search}#employeeTeamHub`);
    await loadDashboard();
  }

  function closeHub() {
    document.getElementById('employeeTeamHubOverlay')?.classList.remove('open');
    if (location.hash === '#employeeTeamHub') history.replaceState(null, '', `${location.pathname}${location.search}`);
  }

  async function loadDashboard() {
    try {
      setStatus('Loading Team Hub…');
      dashboard = await api('/api/admin/employee-collaboration/dashboard');
      if (activeTab === 'workflows') await loadWorkflows(false);
      render();
      setStatus('');
    } catch (error) {
      setStatus(error.message, true);
      document.getElementById('echBody').innerHTML = `<div class="ech-empty"><h3>Team Hub is unavailable</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  function render() {
    if (!dashboard) return;
    document.querySelectorAll('[data-ech-tab]').forEach(button => button.classList.toggle('active', button.dataset.echTab === activeTab));
    const panels = {dashboard:dashboardPanel,approvals:approvalsPanel,requests:requestsPanel,team:teamPanel,recognition:recognitionPanel,workflows:workflowsPanel,notifications:notificationsPanel};
    document.getElementById('echBody').innerHTML = `<section class="ech-panel active">${panels[activeTab]()}</section>`;
    wirePanel();
  }

  function metricCard(title, value, subtitle) {
    return `<div class="ech-card"><h4>${esc(title)}</h4><div class="ech-metric">${Number(value || 0)}</div><div class="ech-sub">${esc(subtitle)}</div></div>`;
  }

  function dashboardPanel() {
    const m = dashboard.metrics || {};
    const approvals = dashboard.pendingApprovals.slice(0,8);
    const requests = dashboard.recentRequests.filter(item => ['SUBMITTED','IN_REVIEW'].includes(item.status)).slice(0,8);
    const followUps = dashboard.followUps.slice(0,8);
    return `<div class="ech-metrics">${metricCard('Employees in Scope',m.teamCount,'Based on your role and assigned locations')}${metricCard('Pending Approvals',m.pendingApprovalCount,'Approval steps requiring review')}${metricCard('Open Requests',m.openRequestCount,'Submitted or in review')}${metricCard('Compliance Overdue',m.overdueComplianceCount,'Overdue requirements across your team')}${metricCard('Training Overdue',m.overdueEducationCount,'Past-due education assignments')}${metricCard('Documents at Risk',m.expiringDocumentCount,'Expired or expiring within 60 days')}</div>
      <div class="ech-grid"><div><div class="ech-section" style="margin-top:0"><h3>Priority Approvals</h3>${approvals.length ? `<div class="ech-list">${approvals.map(approvalRow).join('')}</div>` : '<div class="ech-empty">No approval steps require attention.</div>'}</div></div><div><div class="ech-section" style="margin-top:0"><h3>Open Employee Requests</h3>${requests.length ? `<div class="ech-list">${requests.map(requestRow).join('')}</div>` : '<div class="ech-empty">No open employee requests.</div>'}</div></div></div>
      ${followUps.length ? `<div class="ech-section"><h3>Manager Follow-ups Due Within 30 Days</h3><div class="ech-list">${followUps.map(item => `<div class="ech-row"><div><div class="ech-title">${esc(item.employeeName)} — ${esc(item.subject)}</div><div class="ech-sub">${label(item.kind)} · Follow-up ${date(item.followUpDate)} · ${label(item.visibility)}</div></div><button class="ech-btn" data-open-employee="${esc(item.employeeId)}">Open Employee</button></div>`).join('')}</div></div>` : ''}`;
  }

  function approvalRow(item) {
    return `<div class="ech-row"><div class="ech-row-main"><div class="ech-title">${esc(item.employeeName)} — ${esc(item.title)}</div><div class="ech-sub">${label(item.requestType)} · ${label(item.priority)} priority · Submitted ${dateTime(item.createdAt)} · ${esc(item.label || label(item.approverType))}</div></div><div class="ech-row-actions"><button class="ech-btn" data-view-request="${esc(item.requestId)}">Review</button>${dashboard.permissions.canApprove && !dashboard.permissions.readOnly ? `<button class="ech-btn primary" data-quick-approve="${esc(item.requestId)}">Approve</button><button class="ech-btn danger" data-quick-reject="${esc(item.requestId)}">Reject</button>` : ''}</div></div>`;
  }

  function requestRow(item) {
    return `<div class="ech-row"><div class="ech-row-main"><div class="ech-title">${esc(item.employeeName || item.employeeId)} — ${esc(item.title)}</div><div class="ech-sub">${label(item.requestType)} · ${label(item.priority)} · ${dateTime(item.submittedAt || item.createdAt)}</div><div><span class="ech-badge ${statusClass(item.status)}">${label(item.status)}</span></div></div><div class="ech-row-actions"><button class="ech-btn" data-view-request="${esc(item.id || item.requestId)}">View Workflow</button><button class="ech-btn" data-open-employee="${esc(item.employeeId)}">Employee</button></div></div>`;
  }

  function approvalsPanel() {
    return dashboard.pendingApprovals.length ? `<div class="ech-alert"><strong>Approval responsibility:</strong> Decisions are recorded with the approver, timestamp, notes, workflow sequence, notifications, and audit event.</div><div class="ech-list">${dashboard.pendingApprovals.map(approvalRow).join('')}</div>` : '<div class="ech-empty"><h3>No pending approvals</h3><p>Approval steps assigned to you or available to your authorized global role will appear here.</p></div>';
  }

  function requestsPanel() {
    return `<div class="ech-grid three" style="margin-bottom:13px"><label>Search<input class="ech-input" id="echRequestSearch" placeholder="Employee, title, type, or status"></label><label>Status<select class="ech-select" id="echRequestStatus"><option value="">All statuses</option>${['SUBMITTED','IN_REVIEW','APPROVED','REJECTED','CANCELLED','COMPLETED'].map(value => `<option>${value}</option>`).join('')}</select></label><label>Request type<select class="ech-select" id="echRequestType"><option value="">All request types</option>${['PROFILE_CHANGE','TIME_OFF','SCHEDULE_CHANGE','DOCUMENT_CORRECTION','TRAINING_SUPPORT','HR_SUPPORT','GENERAL_REQUEST'].map(value => `<option>${value}</option>`).join('')}</select></label></div><div id="echRequestList"></div>`;
  }

  function renderRequestList() {
    const box = document.getElementById('echRequestList');
    if (!box) return;
    const q = String(document.getElementById('echRequestSearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('echRequestStatus')?.value || '';
    const type = document.getElementById('echRequestType')?.value || '';
    const rows = dashboard.recentRequests.filter(item => (!q || [item.employeeName,item.title,item.description,item.requestType,item.status].some(value => String(value || '').toLowerCase().includes(q))) && (!status || item.status===status) && (!type || item.requestType===type));
    box.innerHTML = rows.length ? `<div class="ech-list">${rows.map(requestRow).join('')}</div>` : '<div class="ech-empty">No requests match these filters.</div>';
    box.querySelectorAll('[data-view-request]').forEach(button => button.onclick = () => viewRequest(button.dataset.viewRequest));
    box.querySelectorAll('[data-open-employee]').forEach(button => button.onclick = () => openEmployee(button.dataset.openEmployee));
  }

  function teamPanel() {
    return `<div class="ech-grid" style="margin-bottom:13px"><label>Search team<input class="ech-input" id="echTeamSearch" placeholder="Name, email, role, title, or department"></label><label>Risk filter<select class="ech-select" id="echTeamRisk"><option value="">All employees</option><option value="requests">Open requests</option><option value="compliance">Overdue compliance</option><option value="education">Overdue education</option><option value="documents">Expired or expiring documents</option></select></label></div><div id="echTeamList"></div>`;
  }

  function renderTeamList() {
    const box = document.getElementById('echTeamList');
    if (!box) return;
    const q = String(document.getElementById('echTeamSearch')?.value || '').trim().toLowerCase();
    const risk = document.getElementById('echTeamRisk')?.value || '';
    const rows = dashboard.team.filter(item => {
      const text = !q || [item.displayName,item.email,item.role,item.jobTitle,item.department].some(value => String(value || '').toLowerCase().includes(q));
      const signal = !risk || (risk==='requests'&&Number(item.openRequestCount)>0) || (risk==='compliance'&&Number(item.overdueComplianceCount)>0) || (risk==='education'&&Number(item.overdueEducationCount)>0) || (risk==='documents'&&(Number(item.expiredDocumentCount)>0||Number(item.expiringDocumentCount)>0));
      return text && signal;
    });
    if (!rows.length) { box.innerHTML = '<div class="ech-empty">No employees match these filters.</div>'; return; }
    box.innerHTML = `<div class="ech-table-wrap"><table class="ech-table"><thead><tr><th>Employee</th><th>Position</th><th>Status</th><th>Open Requests</th><th>Compliance</th><th>Education</th><th>Documents</th><th>Upcoming Shifts</th></tr></thead><tbody>${rows.map(item => `<tr data-team-employee="${esc(item.id)}"><td><div class="ech-title">${esc(item.displayName)}</div><div class="ech-sub">${esc(item.email || '')}</div></td><td>${esc(item.jobTitle || label(item.role))}<div class="ech-sub">${esc(item.department || 'No department')}</div></td><td><span class="ech-badge ${statusClass(item.employmentStatus)}">${label(item.employmentStatus)}</span></td><td>${Number(item.openRequestCount||0)}</td><td><span class="ech-badge ${Number(item.overdueComplianceCount)>0?'overdue':'active'}">${Number(item.overdueComplianceCount||0)} overdue</span><span class="ech-badge ${Number(item.dueSoonComplianceCount)>0?'duesoon':''}">${Number(item.dueSoonComplianceCount||0)} due soon</span></td><td><span class="ech-badge ${Number(item.overdueEducationCount)>0?'overdue':'active'}">${Number(item.overdueEducationCount||0)} overdue</span></td><td><span class="ech-badge ${Number(item.expiredDocumentCount)>0?'overdue':'active'}">${Number(item.expiredDocumentCount||0)} expired</span><span class="ech-badge ${Number(item.expiringDocumentCount)>0?'duesoon':''}">${Number(item.expiringDocumentCount||0)} expiring</span></td><td>${Number(item.upcomingShiftCount||0)}</td></tr>`).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-team-employee]').forEach(row => row.onclick = () => openEmployee(row.dataset.teamEmployee));
  }

  function recognitionPanel() {
    const items = dashboard.recentRecognition;
    return `<div class="ech-actions" style="margin-bottom:13px"><button class="ech-btn primary" id="echRecognizeEmployee">Recognize Employee</button></div>${items.length ? `<div class="ech-grid three">${items.map(item => `<div class="ech-card ech-recognition"><h3>${esc(item.title)}</h3><div><span class="ech-badge active">${label(item.category)}</span>${Number(item.points||0)?`<span class="ech-badge">${Number(item.points)} points</span>`:''}</div><p style="white-space:pre-wrap">${esc(item.message)}</p><div class="ech-sub">${esc(item.employeeName)} · ${date(item.awardDate)} · ${label(item.visibility)}</div><div class="ech-form-actions"><button class="ech-btn" data-open-employee="${esc(item.employeeId)}">Open Employee</button></div></div>`).join('')}</div>` : '<div class="ech-empty">No employee recognition has been recorded.</div>'}`;
  }

  function workflowCard(item) {
    return `<div class="ech-card"><h3>${esc(item.name)}</h3><div class="ech-sub">${label(item.requestType)} · ${item.enabled?'Enabled':'Disabled'} · ${item.employeeCanSubmit?'Employee self-service':'Management only'}</div><p>${esc(item.description || '')}</p><div>${(item.steps||[]).map(step => `<span class="ech-badge">${step.sequence}. ${esc(step.label || label(step.approverType))} (${label(step.approvalMode)})</span>`).join('')}</div>${workflows?.permissions?.canManageWorkflows ? `<div class="ech-form-actions"><button class="ech-btn" data-edit-workflow="${esc(item.requestType)}">Edit Workflow</button></div>` : ''}</div>`;
  }

  function workflowsPanel() {
    if (!workflows) return '<div class="ech-empty">Loading approval workflows…</div>';
    return `${workflows.permissions.canManageWorkflows && !workflows.permissions.readOnly ? '<div class="ech-actions" style="margin-bottom:13px"><button class="ech-btn warn" id="echResetWorkflows">Restore Default Workflows</button></div>' : '<div class="ech-alert"><strong>Read-only workflow view:</strong> Only the Enterprise Owner, Human Resources, or an Administrator may change approval chains.</div>'}<div class="ech-grid">${workflows.workflows.map(workflowCard).join('')}</div>`;
  }

  function notificationRow(item) {
    return `<div class="ech-row"><div class="ech-row-main"><div class="ech-title">${esc(item.title)}</div><div class="ech-sub">${label(item.notificationType)} · ${dateTime(item.createdAt)} · Email ${label(item.emailStatus)}</div><div style="margin-top:6px;white-space:pre-wrap">${esc(item.message)}</div></div><div class="ech-row-actions"><span class="ech-badge ${statusClass(item.status)}">${label(item.status)}</span>${item.status==='UNREAD'?`<button class="ech-btn" data-read-notification="${esc(item.id)}">Mark Read</button>`:''}</div></div>`;
  }

  function notificationsPanel() {
    return `<div class="ech-actions" style="margin-bottom:13px"><button class="ech-btn" id="echReadAll">Mark All Read</button></div>${dashboard.notifications.length ? `<div class="ech-list">${dashboard.notifications.map(notificationRow).join('')}</div>` : '<div class="ech-empty">No manager notifications.</div>'}`;
  }

  function wirePanel() {
    document.querySelectorAll('[data-view-request]').forEach(button => button.onclick = () => viewRequest(button.dataset.viewRequest));
    document.querySelectorAll('[data-quick-approve]').forEach(button => button.onclick = () => quickDecision(button.dataset.quickApprove,'APPROVE'));
    document.querySelectorAll('[data-quick-reject]').forEach(button => button.onclick = () => quickDecision(button.dataset.quickReject,'REJECT'));
    document.querySelectorAll('[data-open-employee]').forEach(button => button.onclick = () => openEmployee(button.dataset.openEmployee));
    document.querySelectorAll('[data-edit-workflow]').forEach(button => button.onclick = () => editWorkflow(button.dataset.editWorkflow));
    document.querySelectorAll('[data-read-notification]').forEach(button => button.onclick = () => readNotification(button.dataset.readNotification));
    if (activeTab==='requests') {
      ['echRequestSearch','echRequestStatus','echRequestType'].forEach(id => document.getElementById(id)?.addEventListener(id==='echRequestSearch'?'input':'change', renderRequestList));
      renderRequestList();
    }
    if (activeTab==='team') {
      document.getElementById('echTeamSearch')?.addEventListener('input', renderTeamList);
      document.getElementById('echTeamRisk')?.addEventListener('change', renderTeamList);
      renderTeamList();
    }
    document.getElementById('echRecognizeEmployee')?.addEventListener('click', () => showRecognitionForm());
    document.getElementById('echResetWorkflows')?.addEventListener('click', resetWorkflows);
    document.getElementById('echReadAll')?.addEventListener('click', markAllRead);
    if (activeTab==='workflows' && !workflows) loadWorkflows();
  }

  async function loadWorkflows(renderAfter = true) {
    try {
      workflows = await api('/api/admin/employee-collaboration/workflows');
      if (renderAfter && activeTab==='workflows') render();
    } catch (error) { setStatus(error.message, true); }
  }

  async function viewRequest(id) {
    try {
      selectedRequestId = id;
      const data = await api(`/api/admin/employee-collaboration/requests/${encodeURIComponent(id)}`);
      const r = data.request;
      openModal(`${data.employee.displayName}: ${r.title}`, `<div class="ech-grid three"><div class="ech-card"><h4>Status</h4><span class="ech-badge ${statusClass(r.status)}">${label(r.status)}</span></div><div class="ech-card"><h4>Request Type</h4><strong>${label(r.requestType)}</strong></div><div class="ech-card"><h4>Priority</h4><span class="ech-badge ${statusClass(r.priority)}">${label(r.priority)}</span></div></div><div class="ech-section"><h3>Employee Request</h3><div class="ech-card"><p style="white-space:pre-wrap">${esc(r.description)}</p><div class="ech-sub">Submitted ${dateTime(r.submittedAt)}</div><details style="margin-top:8px"><summary>Structured request data</summary><pre style="white-space:pre-wrap;overflow:auto">${esc(JSON.stringify(r.payload || {},null,2))}</pre></details></div></div><div class="ech-section"><h3>Approval Chain</h3><div class="ech-list">${data.approvals.map(step => `<div class="ech-row"><div><div class="ech-title">Sequence ${step.sequence}: ${esc(step.label || label(step.approverType))}</div><div class="ech-sub">${esc(step.approverName || 'No approver')} · ${label(step.approvalMode)} approval${step.decisionNotes?` · ${esc(step.decisionNotes)}`:''}</div></div><span class="ech-badge ${statusClass(step.status)}">${label(step.status)}</span></div>`).join('') || '<div class="ech-row">No approval steps.</div>'}</div></div><div class="ech-section"><h3>Comments</h3><div class="ech-list">${data.comments.map(comment => `<div class="ech-row ${comment.visibility==='HR_CONFIDENTIAL'?'ech-confidential':''}"><div><div class="ech-title">${esc(comment.authorName || 'Employee 360')}</div><div class="ech-sub">${label(comment.visibility)} · ${dateTime(comment.createdAt)}</div><div style="margin-top:6px;white-space:pre-wrap">${esc(comment.body)}</div></div></div>`).join('') || '<div class="ech-row">No comments.</div>'}</div>${!dashboard.permissions.readOnly ? `<form id="echRequestCommentForm" class="ech-form" style="margin-top:12px"><div class="ech-grid"><label>Comment visibility<select class="ech-select" name="visibility"><option>EMPLOYEE_VISIBLE</option><option>MANAGEMENT_ONLY</option>${dashboard.permissions.canViewHrConfidential?'<option>HR_CONFIDENTIAL</option>':''}</select></label><label>Comment<textarea class="ech-textarea" name="body" required></textarea></label></div><div class="ech-form-actions"><button class="ech-btn primary" type="submit">Add Comment</button></div></form>`:''}</div><div class="ech-section"><h3>Audit Timeline</h3><div class="ech-list">${data.events.map(event => `<div class="ech-row"><div><div class="ech-title">${label(event.eventType)}</div><div class="ech-sub">${dateTime(event.createdAt)}</div></div></div>`).join('')}</div></div>${dashboard.permissions.canApprove&&!dashboard.permissions.readOnly&&['SUBMITTED','IN_REVIEW'].includes(r.status)?`<div class="ech-section"><h3>Decision</h3><form id="echDecisionForm" class="ech-form"><label>Decision notes<textarea class="ech-textarea" name="notes" placeholder="Document the reason for approval or rejection"></textarea></label><div class="ech-form-actions"><button class="ech-btn primary" type="button" data-modal-decision="APPROVE">Approve</button><button class="ech-btn danger" type="button" data-modal-decision="REJECT">Reject</button></div></form></div>`:''}`);
      document.getElementById('echRequestCommentForm')?.addEventListener('submit', addManagerComment);
      document.querySelectorAll('[data-modal-decision]').forEach(button => button.onclick = () => decision(id,button.dataset.modalDecision,String(new FormData(document.getElementById('echDecisionForm')).get('notes')||'')));
    } catch (error) { setStatus(error.message, true); }
  }

  async function quickDecision(id, decisionValue) {
    const notes = prompt(`${decisionValue==='APPROVE'?'Approval':'Rejection'} notes:`, decisionValue==='APPROVE'?'Approved after manager review.':'Please document the reason for rejection.');
    if (notes === null) return;
    await decision(id,decisionValue,notes);
  }

  async function decision(id, decisionValue, notes) {
    if (!confirm(`${decisionValue==='APPROVE'?'Approve':'Reject'} this employee request? This action is audited.`)) return;
    try {
      await api(`/api/admin/employee-collaboration/requests/${encodeURIComponent(id)}/decision`, {method:'POST',body:JSON.stringify({decision:decisionValue,notes})});
      closeModal();
      await loadDashboard();
      setStatus(`Request ${decisionValue==='APPROVE'?'approved':'rejected'} successfully.`);
    } catch (error) { setStatus(error.message, true); }
  }

  async function addManagerComment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api(`/api/admin/employee-collaboration/requests/${encodeURIComponent(selectedRequestId)}/comments`, {method:'POST',body:JSON.stringify({visibility:String(data.get('visibility')),body:String(data.get('body')||'').trim()})});
      await viewRequest(selectedRequestId);
      await loadDashboard();
    } catch (error) { alert(error.message); }
  }

  async function openEmployee(id) {
    selectedEmployeeId = id;
    try {
      const data = await api(`/api/admin/employees/${encodeURIComponent(id)}/collaboration`);
      const p = data.permissions;
      openModal(`${data.employee.displayName} — Collaboration`, `<div class="ech-grid three"><div class="ech-card"><h4>Open Requests</h4><div class="ech-metric">${data.requests.filter(item=>['SUBMITTED','IN_REVIEW'].includes(item.status)).length}</div></div><div class="ech-card"><h4>Feedback Records</h4><div class="ech-metric">${data.feedback.length}</div></div><div class="ech-card"><h4>Recognition</h4><div class="ech-metric">${data.recognition.length}</div></div></div>${p.canAddFeedback&&!p.readOnly?`<div class="ech-section"><h3>Manager Feedback, Check-in, Coaching or Goal</h3><form id="echFeedbackForm" class="ech-form"><div class="ech-grid three"><label>Type<select class="ech-select" name="kind">${['CHECK_IN','FEEDBACK','COACHING','GOAL','DEVELOPMENT_NOTE','PERFORMANCE_NOTE'].map(value=>`<option>${value}</option>`).join('')}</select></label><label>Visibility<select class="ech-select" name="visibility"><option>EMPLOYEE_VISIBLE</option><option>MANAGEMENT_ONLY</option>${p.canViewHrConfidential?'<option>HR_CONFIDENTIAL</option>':''}</select></label><label>Follow-up date<input class="ech-input" type="date" name="followUpDate"></label></div><label style="display:block;margin-top:10px">Subject<input class="ech-input" name="subject" required></label><label style="display:block;margin-top:10px">Feedback or notes<textarea class="ech-textarea" name="body" required></textarea></label><label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" name="requiresAcknowledgment" style="width:auto"> Employee acknowledgment required</label><div class="ech-form-actions"><button class="ech-btn primary" type="submit">Save Feedback</button></div></form></div>`:''}${p.canRecognize&&!p.readOnly?`<div class="ech-section"><h3>Recognize This Employee</h3><button class="ech-btn primary" id="echRecognizeThisEmployee">Create Recognition</button></div>`:''}<div class="ech-section"><h3>Employee Requests</h3><div class="ech-list">${data.requests.map(requestRow).join('')||'<div class="ech-row">No requests.</div>'}</div></div><div class="ech-section"><h3>Feedback and Check-ins</h3><div class="ech-list">${data.feedback.map(item=>`<div class="ech-row ${item.visibility==='HR_CONFIDENTIAL'?'ech-confidential':''}"><div><div class="ech-title">${esc(item.subject)}</div><div class="ech-sub">${label(item.kind)} · ${label(item.visibility)} · By ${esc(item.authorName||'Manager')} · ${dateTime(item.createdAt)}${item.followUpDate?` · Follow-up ${date(item.followUpDate)}`:''}</div><div style="margin-top:6px;white-space:pre-wrap">${esc(item.body)}</div>${item.requiresAcknowledgment?`<div class="ech-sub">${item.acknowledgedAt?`Acknowledged ${dateTime(item.acknowledgedAt)}`:'Employee acknowledgment pending'}</div>`:''}</div>${!p.readOnly?`<button class="ech-btn danger" data-archive-feedback="${esc(item.id)}">Archive</button>`:''}</div>`).join('')||'<div class="ech-row">No feedback records.</div>'}</div></div><div class="ech-section"><h3>Recognition History</h3><div class="ech-grid">${data.recognition.map(item=>`<div class="ech-card ech-recognition"><h3>${esc(item.title)}</h3><div><span class="ech-badge active">${label(item.category)}</span>${Number(item.points||0)?`<span class="ech-badge">${Number(item.points)} points</span>`:''}</div><p style="white-space:pre-wrap">${esc(item.message)}</p><div class="ech-sub">${date(item.awardDate)} · ${label(item.visibility)} · By ${esc(item.nominatorName||'Manager')}</div>${!p.readOnly?`<div class="ech-form-actions"><button class="ech-btn danger" data-archive-recognition="${esc(item.id)}">Archive</button></div>`:''}</div>`).join('')||'<div class="ech-empty">No recognition records.</div>'}</div></div>`);
      document.getElementById('echFeedbackForm')?.addEventListener('submit', event => submitFeedback(event,id));
      document.getElementById('echRecognizeThisEmployee')?.addEventListener('click', () => showRecognitionForm(id));
      document.querySelectorAll('[data-view-request]').forEach(button => button.onclick = () => viewRequest(button.dataset.viewRequest));
      document.querySelectorAll('[data-archive-feedback]').forEach(button => button.onclick = () => archiveFeedback(id,button.dataset.archiveFeedback));
      document.querySelectorAll('[data-archive-recognition]').forEach(button => button.onclick = () => archiveRecognition(id,button.dataset.archiveRecognition));
    } catch (error) { setStatus(error.message, true); }
  }

  async function submitFeedback(event,id) {
    event.preventDefault();
    const form=event.currentTarget,data=new FormData(form);
    try {
      await api(`/api/admin/employees/${encodeURIComponent(id)}/feedback`,{method:'POST',body:JSON.stringify({kind:String(data.get('kind')),subject:String(data.get('subject')||'').trim(),body:String(data.get('body')||'').trim(),visibility:String(data.get('visibility')),requiresAcknowledgment:data.get('requiresAcknowledgment')==='on',followUpDate:data.get('followUpDate')||null})});
      await openEmployee(id); await loadDashboard();
    } catch(error){alert(error.message)}
  }

  function showRecognitionForm(preselected='') {
    const team=dashboard.team;
    if(!team.length)return setStatus('No employees are available in your management scope.',true);
    const selected=team.some(item=>item.id===preselected)?preselected:team[0].id;
    openModal('Create Employee Recognition',`<form id="echRecognitionForm" class="ech-form"><div class="ech-grid three"><label>Employee<select class="ech-select" name="employeeId">${team.map(item=>`<option value="${esc(item.id)}" ${item.id===selected?'selected':''}>${esc(item.displayName)}</option>`).join('')}</select></label><label>Category<select class="ech-select" name="category">${['VALUES','TEAMWORK','EXCELLENCE','SAFETY','COMPASSION','LEADERSHIP','RELIABILITY','MILESTONE','OTHER'].map(value=>`<option>${value}</option>`).join('')}</select></label><label>Visibility<select class="ech-select" name="visibility"><option>EMPLOYEE_ONLY</option><option>TEAM_VISIBLE</option><option>ORGANIZATION_VISIBLE</option><option>MANAGEMENT_ONLY</option></select></label><label>Recognition points<input class="ech-input" type="number" name="points" min="0" max="10000" value="0"></label><label>Award date<input class="ech-input" type="date" name="awardDate" value="${new Date().toISOString().slice(0,10)}"></label><label>Title<input class="ech-input" name="title" required></label></div><label style="display:block;margin-top:10px">Recognition message<textarea class="ech-textarea" name="message" required></textarea></label><div class="ech-form-actions"><button class="ech-btn primary" type="submit">Record and Notify</button></div></form>`,false);
    document.getElementById('echRecognitionForm').onsubmit=submitRecognition;
  }

  async function submitRecognition(event){event.preventDefault();const data=new FormData(event.currentTarget),id=String(data.get('employeeId'));try{await api(`/api/admin/employees/${encodeURIComponent(id)}/recognition`,{method:'POST',body:JSON.stringify({category:String(data.get('category')),title:String(data.get('title')||'').trim(),message:String(data.get('message')||'').trim(),visibility:String(data.get('visibility')),points:Number(data.get('points')||0),awardDate:String(data.get('awardDate'))})});closeModal();await loadDashboard();setStatus('Employee recognition was recorded and the employee was notified when permitted by visibility.')}catch(error){alert(error.message)}}

  async function archiveFeedback(employeeId,feedbackId){if(!confirm('Archive this feedback record? It remains in the audit trail but is removed from active views.'))return;try{await api(`/api/admin/employees/${encodeURIComponent(employeeId)}/feedback/${encodeURIComponent(feedbackId)}/archive`,{method:'PATCH'});await openEmployee(employeeId);await loadDashboard()}catch(error){alert(error.message)}}
  async function archiveRecognition(employeeId,recognitionId){if(!confirm('Archive this recognition record?'))return;try{await api(`/api/admin/employees/${encodeURIComponent(employeeId)}/recognition/${encodeURIComponent(recognitionId)}/archive`,{method:'PATCH'});await openEmployee(employeeId);await loadDashboard()}catch(error){alert(error.message)}}

  function editWorkflow(type) {
    const item=workflows.workflows.find(row=>row.requestType===type);if(!item)return;
    workflowDraft=JSON.parse(JSON.stringify(item));
    openModal(`Edit Workflow: ${item.name}`,workflowEditor(),true);
    wireWorkflowEditor();
  }

  function workflowEditor(){const item=workflowDraft;return `<form id="echWorkflowForm" class="ech-form"><div class="ech-grid"><label>Workflow name<input class="ech-input" name="name" value="${esc(item.name)}" required></label><label>Request type<input class="ech-input" value="${esc(label(item.requestType))}" disabled></label></div><label style="display:block;margin-top:10px">Description<textarea class="ech-textarea" name="description">${esc(item.description||'')}</textarea></label><div class="ech-grid" style="margin-top:10px"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="enabled" style="width:auto" ${item.enabled?'checked':''}> Workflow enabled</label><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="employeeCanSubmit" style="width:auto" ${item.employeeCanSubmit?'checked':''}> Employee can submit</label></div><div class="ech-section"><h3>Approval Steps</h3><div class="ech-alert">Steps run in sequence. ANY means one eligible approver completes the step. ALL means every resolved approver must approve.</div><div id="echWorkflowSteps">${item.steps.map(stepEditor).join('')}</div><div class="ech-form-actions"><button class="ech-btn" type="button" id="echAddWorkflowStep">Add Step</button></div></div><div class="ech-form-actions"><button class="ech-btn primary" type="submit">Save Approval Workflow</button></div></form>`}
  function stepEditor(step,index){return `<div class="ech-step-editor" data-workflow-step="${index}"><label>Sequence<input class="ech-input" type="number" min="1" max="20" data-step-field="sequence" value="${Number(step.sequence)}"></label><label>Approver<select class="ech-select" data-step-field="approverType">${['SUPERVISOR','LOCATION_MANAGER','HR','ADMINISTRATOR','OWNER','SPECIFIC_USER'].map(value=>`<option ${step.approverType===value?'selected':''}>${value}</option>`).join('')}</select></label><label>Mode<select class="ech-select" data-step-field="approvalMode"><option ${step.approvalMode==='ANY'?'selected':''}>ANY</option><option ${step.approvalMode==='ALL'?'selected':''}>ALL</option></select></label><label>Label / specific user ID<input class="ech-input" data-step-field="label" value="${esc(step.label||'')}" placeholder="Step label"><input class="ech-input" style="margin-top:5px" data-step-field="userId" value="${esc(step.userId||'')}" placeholder="User ID only for SPECIFIC_USER"></label><button class="ech-btn danger" type="button" data-remove-step="${index}">Remove</button></div>`}
  function syncWorkflowDraft(){workflowDraft.steps=[...document.querySelectorAll('[data-workflow-step]')].map(node=>({sequence:Number(node.querySelector('[data-step-field="sequence"]').value),approverType:node.querySelector('[data-step-field="approverType"]').value,approvalMode:node.querySelector('[data-step-field="approvalMode"]').value,label:node.querySelector('[data-step-field="label"]').value.trim()||null,userId:node.querySelector('[data-step-field="userId"]').value.trim()||null}));}
  function wireWorkflowEditor(){document.getElementById('echAddWorkflowStep').onclick=()=>{syncWorkflowDraft();const next=Math.max(0,...workflowDraft.steps.map(step=>Number(step.sequence)))+1;workflowDraft.steps.push({sequence:next,approverType:'SUPERVISOR',approvalMode:'ANY',label:'',userId:null});document.getElementById('echWorkflowSteps').innerHTML=workflowDraft.steps.map(stepEditor).join('');wireWorkflowStepButtons()};wireWorkflowStepButtons();document.getElementById('echWorkflowForm').onsubmit=saveWorkflow}
  function wireWorkflowStepButtons(){document.querySelectorAll('[data-remove-step]').forEach(button=>button.onclick=()=>{syncWorkflowDraft();workflowDraft.steps.splice(Number(button.dataset.removeStep),1);document.getElementById('echWorkflowSteps').innerHTML=workflowDraft.steps.map(stepEditor).join('');wireWorkflowStepButtons()})}
  async function saveWorkflow(event){event.preventDefault();syncWorkflowDraft();const data=new FormData(event.currentTarget);try{await api(`/api/admin/employee-collaboration/workflows/${encodeURIComponent(workflowDraft.requestType)}`,{method:'PUT',body:JSON.stringify({name:String(data.get('name')||'').trim(),description:String(data.get('description')||'').trim()||null,enabled:data.get('enabled')==='on',employeeCanSubmit:data.get('employeeCanSubmit')==='on',steps:workflowDraft.steps})});closeModal();await loadWorkflows(false);render();setStatus('Approval workflow saved. New requests will use the updated chain; existing requests retain their original approval steps.')}catch(error){alert(error.message)}}
  async function resetWorkflows(){if(!confirm('Restore all Employee 360 request workflows to the Sulandra default approval chains?'))return;try{await api('/api/admin/employee-collaboration/workflows/reset-defaults',{method:'POST'});await loadWorkflows(false);render();setStatus('Default approval workflows restored.')}catch(error){setStatus(error.message,true)}}

  async function readNotification(id){try{await api(`/api/employee/me/collaboration/notifications/${encodeURIComponent(id)}/read`,{method:'PATCH'});await loadDashboard()}catch(error){setStatus(error.message,true)}}
  async function markAllRead(){try{await api('/api/employee/me/collaboration/notifications/read-all',{method:'POST'});await loadDashboard();setStatus('All manager notifications were marked as read.')}catch(error){setStatus(error.message,true)}}

  function scheduleInstall(){if(installScheduled)return;installScheduled=true;requestAnimationFrame(()=>{installScheduled=false;installOverlay();installButtons();if(location.hash==='#employeeTeamHub'&&!document.getElementById('employeeTeamHubOverlay').classList.contains('open'))openHub()})}
  document.addEventListener('click',event=>{const row=event.target.closest('tr[data-employee]');if(row)selectedEmployeeId=row.dataset.employee;},true);
  const observer=new MutationObserver(scheduleInstall);observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleInstall,{once:true});else scheduleInstall();
})();
