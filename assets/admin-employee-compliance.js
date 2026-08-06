(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const ROLES = ['ADMINISTRATOR','PROGRAM_MANAGER','HR_MANAGER','HOUSE_MANAGER','AUDITOR','DELEGATING_NURSE','RN','LPN','DSP','SCHEDULER','BILLING_SPECIALIST','ADMINISTRATIVE_ASSISTANT','CEO','DOO','DRIVER','GENERAL'];
  const TYPES = ['DOCUMENT','EDUCATION','ATTESTATION','MANUAL'];
  const SENSITIVITIES = ['GENERAL','HR_CONFIDENTIAL','MEDICAL','BACKGROUND','DISCIPLINARY','IDENTITY','COMPENSATION'];
  const state = { requirements: [], dashboard: null, reminders: [], runs: [], settings: null, activeEmployeeId: null, activeEmployeeCompliance: null, loading: false };

  const token = () => sessionStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra_token')
    || localStorage.getItem('token')
    || localStorage.getItem('accessToken')
    || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => value ? new Date(value).toLocaleDateString() : '—';
  const dateTime = value => value ? new Date(value).toLocaleString() : '—';
  const statusClass = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const arrayValue = value => Array.isArray(value) ? value : [];
  const csv = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  const numberCsv = value => [...new Set(csv(value).map(Number).filter(Number.isFinite).map(Math.trunc))];

  async function api(path, options = {}) {
    const auth = token();
    if (!auth) throw new Error('Your administrator session is unavailable. Sign in again.');
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
    if (document.getElementById('employeeComplianceStyles')) return;
    const style = document.createElement('style');
    style.id = 'employeeComplianceStyles';
    style.textContent = `
      .e360-compliance-center{display:none}.e360-compliance-center.open{display:block}.e360-compliance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:14px 0}.e360-compliance-metric{border:1px solid #cbd9e5;border-radius:9px;background:#fbfdff;padding:13px}.e360-compliance-metric strong{display:block;font-size:27px;color:#075493}.e360-compliance-metric.overdue strong{color:#a52c1b}.e360-compliance-metric.due strong{color:#846000}.e360-compliance-metric.good strong{color:#176b35}.e360-compliance-toolbar{display:grid;grid-template-columns:1fr 220px 220px auto;gap:9px;margin:12px 0}.e360-compliance-layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(360px,.8fr);gap:14px}.e360-compliance-card{border:1px solid #cbd7e1;border-radius:10px;background:#fff;overflow:hidden}.e360-compliance-card>header{background:#e9f1f8;padding:12px 14px;border-bottom:1px solid #c1d1df}.e360-compliance-card>header h3{margin:0;color:#075493}.e360-compliance-card-body{padding:14px}.e360-compliance-table-wrap{overflow:auto}.e360-compliance-table{width:100%;border-collapse:collapse;min-width:850px}.e360-compliance-table th{background:#e9f1f8;color:#123d63;text-align:left;padding:9px;border-bottom:1px solid #b8c9d8}.e360-compliance-table td{padding:9px;border-bottom:1px solid #e2e8ee;vertical-align:top}.e360-compliance-form-grid{display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:9px}.e360-compliance-form-grid .wide{grid-column:1/-1}.e360-compliance-note{border:1px solid #9cc6e5;background:#eef8ff;color:#123d63;border-radius:8px;padding:10px 12px;margin:10px 0}.e360-compliance-error{border-color:#e2b4aa;background:#fff0ed;color:#8c2b1d}.e360-compliance-actions{display:flex;gap:7px;flex-wrap:wrap}.e360-compliance-requirement{border:1px solid #d4dee7;border-radius:8px;padding:11px;margin-top:8px}.e360-compliance-requirement h4{margin:0;color:#173d5d}.e360-compliance-sub{font-size:12px;color:#637080;margin-top:4px}.e360-compliance-status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900;background:#e8eef5;color:#264762}.e360-compliance-status.overdue,.e360-compliance-status.missing{background:#fde1dc;color:#9e2415}.e360-compliance-status.duesoon,.e360-compliance-status.notstarted,.e360-compliance-status.inprogress{background:#fff0c4;color:#705100}.e360-compliance-status.compliant,.e360-compliance-status.exempt{background:#def4e5;color:#176b35}.e360-compliance-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.e360-compliance-tab{border:1px solid #b9c8d6;background:#fff;border-radius:6px;padding:8px 11px;color:#075493;font-weight:800;cursor:pointer}.e360-compliance-tab.active{background:#075493;color:#fff}.e360-compliance-view{display:none}.e360-compliance-view.active{display:block}.e360-compliance-run{border-top:1px solid #e2e8ee;padding:9px 0}.e360-compliance-reminder{border-top:1px solid #e2e8ee;padding:9px 0}.e360-compliance-employee-panel .e360-compliance-requirement{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.e360-compliance-employee-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.e360-pending-review{border:1px solid #d6a327;background:#fff7dc;border-radius:7px;padding:8px;margin-top:7px}
      @media(max-width:1050px){.e360-compliance-layout{grid-template-columns:1fr}.e360-compliance-toolbar{grid-template-columns:1fr 1fr}.e360-compliance-form-grid{grid-template-columns:1fr}.e360-compliance-form-grid .wide{grid-column:auto}}@media(max-width:700px){.e360-compliance-toolbar{grid-template-columns:1fr}.e360-compliance-employee-panel .e360-compliance-requirement{flex-direction:column}.e360-compliance-employee-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function installCenter() {
    const root = document.getElementById('employee360');
    const directory = document.getElementById('employeeDirectory');
    if (!root || !directory || document.getElementById('employeeComplianceCenter')) return;
    const actions = directory.querySelector('.e360-head .e360-actions');
    if (actions && !document.getElementById('openComplianceCenter')) {
      const button = document.createElement('button');
      button.className = 'e360-btn primary';
      button.id = 'openComplianceCenter';
      button.textContent = 'Compliance Center';
      actions.prepend(button);
      button.onclick = openCenter;
    }
    const center = document.createElement('section');
    center.id = 'employeeComplianceCenter';
    center.className = 'e360-compliance-center';
    center.innerHTML = `<div class="e360-head"><div><h2>Employee Compliance Center</h2><p>Role-based requirements, evidence reconciliation, due-date monitoring, automatic reminders, escalation, and audit history.</p></div><div class="e360-actions"><button class="e360-btn primary" id="runComplianceEngine">Run Compliance Engine</button><button class="e360-btn" id="refreshComplianceCenter">Refresh</button><button class="e360-btn" id="closeComplianceCenter">Back to Employees</button></div></div><div id="employeeComplianceMessage"></div><div id="employeeComplianceContent">Loading compliance center…</div>`;
    root.appendChild(center);
    center.querySelector('#closeComplianceCenter').onclick = closeCenter;
    center.querySelector('#refreshComplianceCenter').onclick = () => loadCenter(true);
    center.querySelector('#runComplianceEngine').onclick = runEngine;
  }

  function message(text, error = false) {
    const node = document.getElementById('employeeComplianceMessage');
    if (!node) return;
    node.className = text ? `e360-compliance-note ${error ? 'e360-compliance-error' : ''}` : '';
    node.textContent = text || '';
  }

  async function openCenter() {
    document.getElementById('employeeDirectory')?.classList.add('hidden');
    document.getElementById('employeeProfile')?.classList.remove('open');
    document.getElementById('employeeComplianceCenter')?.classList.add('open');
    await loadCenter();
  }

  function closeCenter() {
    document.getElementById('employeeComplianceCenter')?.classList.remove('open');
    document.getElementById('employeeDirectory')?.classList.remove('hidden');
  }

  async function loadCenter(force = false) {
    if (state.loading && !force) return;
    state.loading = true;
    message('Loading compliance requirements, assignments, reminders, and run history…');
    try {
      const [requirements, dashboard, reminders, runs, settings] = await Promise.all([
        api('/api/admin/compliance/requirements'),
        api('/api/admin/compliance/dashboard?limit=2000'),
        api('/api/admin/compliance/reminders?limit=250'),
        api('/api/admin/compliance/runs?limit=100'),
        api('/api/admin/compliance/settings')
      ]);
      state.requirements = requirements;
      state.dashboard = dashboard;
      state.reminders = reminders;
      state.runs = runs;
      state.settings = settings;
      renderCenter();
      message('');
    } catch (error) {
      message(error.message, true);
      const content = document.getElementById('employeeComplianceContent');
      if (content) content.innerHTML = `<div class="e360-compliance-note e360-compliance-error">${esc(error.message)}</div>`;
    } finally { state.loading = false; }
  }

  function summaryCards() {
    const s = state.dashboard?.summary || {};
    return `<div class="e360-compliance-grid">
      <div class="e360-compliance-metric"><span>Tracked Requirements</span><strong>${Number(s.total || 0)}</strong></div>
      <div class="e360-compliance-metric good"><span>Compliance Rate</span><strong>${Number(s.compliancePercent ?? 100)}%</strong></div>
      <div class="e360-compliance-metric overdue"><span>Overdue</span><strong>${Number(s.overdue || 0)}</strong></div>
      <div class="e360-compliance-metric due"><span>Due Soon</span><strong>${Number(s.dueSoon || 0)}</strong></div>
      <div class="e360-compliance-metric overdue"><span>Missing / Incomplete</span><strong>${Number(s.missing || 0)}</strong></div>
      <div class="e360-compliance-metric good"><span>Exempt</span><strong>${Number(s.exempt || 0)}</strong></div>
    </div>`;
  }

  function assignmentTable() {
    const rows = state.dashboard?.assignments || [];
    return `<div class="e360-compliance-toolbar"><input class="e360-input" id="complianceSearch" placeholder="Search employee or requirement"><select class="e360-select" id="complianceStatusFilter"><option value="">All statuses</option>${['OVERDUE','DUE_SOON','MISSING','NOT_STARTED','IN_PROGRESS','COMPLIANT','EXEMPT'].map(value => `<option>${value}</option>`).join('')}</select><select class="e360-select" id="complianceRequirementFilter"><option value="">All requirements</option>${state.requirements.filter(item => item.active).map(item => `<option value="${esc(item.id)}">${esc(item.code)} — ${esc(item.title)}</option>`).join('')}</select><button class="e360-btn" id="applyComplianceFilters">Apply</button></div><div class="e360-compliance-table-wrap"><table class="e360-compliance-table"><thead><tr><th>Employee</th><th>Requirement</th><th>Status</th><th>Due / Expires</th><th>Evidence</th><th>Actions</th></tr></thead><tbody>${rows.length ? rows.map(row => `<tr data-compliance-row="${esc(row.id)}" data-search="${esc(`${row.displayName} ${row.email} ${row.code} ${row.title}`.toLowerCase())}" data-status="${esc(row.status)}" data-requirement="${esc(row.requirementId)}"><td><strong>${esc(row.displayName)}</strong><div class="e360-compliance-sub">${esc(row.email || '')}<br>${esc(row.jobTitle || row.role || '')}${row.department ? ` · ${esc(row.department)}` : ''}</div></td><td><strong>${esc(row.title)}</strong><div class="e360-compliance-sub">${esc(row.code)} · ${esc(row.requirementType)}</div></td><td><span class="e360-compliance-status ${statusClass(row.status)}">${esc(row.status)}</span>${row.daysUntilDue != null ? `<div class="e360-compliance-sub">${row.daysUntilDue < 0 ? `${Math.abs(row.daysUntilDue)} days overdue` : `${row.daysUntilDue} days remaining`}</div>` : ''}</td><td>${date(row.dueDate || row.expiresAt)}<div class="e360-compliance-sub">Last evaluated ${dateTime(row.lastEvaluatedAt)}</div></td><td>${esc(row.evidenceSummary || 'No approved evidence')}</td><td><div class="e360-compliance-actions"><button class="e360-btn" data-remind="${esc(row.id)}">Send Reminder</button><button class="e360-btn" data-exempt="${esc(row.id)}">Exempt</button><button class="e360-btn" data-complete="${esc(row.id)}">Mark Complete</button></div></td></tr>`).join('') : '<tr><td colspan="6">No compliance assignments. Create a requirement and run the compliance engine.</td></tr>'}</tbody></table></div>`;
  }

  function requirementsView() {
    return `<div class="e360-compliance-layout"><div><div class="e360-compliance-card"><header><h3>Compliance Requirements</h3></header><div class="e360-compliance-card-body">${state.requirements.length ? state.requirements.map(item => `<div class="e360-compliance-requirement"><div style="display:flex;justify-content:space-between;gap:10px"><div><h4>${esc(item.code)} — ${esc(item.title)}</h4><div class="e360-compliance-sub">${esc(item.requirementType)} · ${item.requiredForAll ? 'All active employees' : 'Filtered workforce'} · Due ${Number(item.dueDaysAfterHire || 0)} days after hire${item.renewalDays ? ` · Renews every ${Number(item.renewalDays)} days` : ''}</div></div><span class="e360-compliance-status ${item.active ? 'compliant' : ''}">${item.active ? 'ACTIVE' : 'ARCHIVED'}</span></div><p>${esc(item.description || '')}</p><div class="e360-compliance-sub">Assignments: ${Number(item.assignmentCount || 0)} · Compliant: ${Number(item.compliantCount || 0)} · Overdue: ${Number(item.overdueCount || 0)}<br>Roles: ${esc(arrayValue(item.appliesToRoles).join(', ') || '—')} · Departments: ${esc(arrayValue(item.appliesToDepartments).join(', ') || '—')} · Locations: ${arrayValue(item.appliesToLocationIds).length}</div><div class="e360-compliance-actions" style="margin-top:8px"><button class="e360-btn" data-edit-requirement="${esc(item.id)}">Edit</button>${item.active ? `<button class="e360-btn danger" data-archive-requirement="${esc(item.id)}">Archive</button>` : ''}</div></div>`).join('') : '<div>No compliance requirements configured.</div>'}</div></div></div><div><div class="e360-compliance-card"><header><h3 id="requirementFormTitle">Create Requirement</h3></header><div class="e360-compliance-card-body">${requirementForm()}</div></div></div></div>`;
  }

  function requirementForm(item = {}) {
    const roles = arrayValue(item.appliesToRoles);
    return `<form id="complianceRequirementForm" data-id="${esc(item.id || '')}"><div class="e360-compliance-form-grid">
      <label>Requirement code<input class="e360-input" name="code" required value="${esc(item.code || '')}" placeholder="DSP-CPR"></label>
      <label>Type<select class="e360-select" name="requirementType">${TYPES.map(value => `<option ${item.requirementType===value?'selected':''}>${value}</option>`).join('')}</select></label>
      <label class="wide">Title<input class="e360-input" name="title" required value="${esc(item.title || '')}"></label>
      <label class="wide">Description<textarea class="e360-textarea" name="description">${esc(item.description || '')}</textarea></label>
      <label><span style="display:flex;gap:7px;align-items:center"><input type="checkbox" name="requiredForAll" ${item.requiredForAll?'checked':''}> Required for all matching employment statuses</span></label>
      <label>Employment statuses<input class="e360-input" name="employmentStatuses" value="${esc(arrayValue(item.employmentStatuses).join(',') || 'ACTIVE')}" placeholder="ACTIVE,LEAVE"></label>
      <label class="wide">Applicable system roles<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:6px">${ROLES.map(role => `<label style="font-weight:600;margin:0"><input type="checkbox" name="role" value="${role}" ${roles.includes(role)?'checked':''}> ${role.replaceAll('_',' ')}</label>`).join('')}</div></label>
      <label>Departments (comma separated)<input class="e360-input" name="appliesToDepartments" value="${esc(arrayValue(item.appliesToDepartments).join(','))}"></label>
      <label>Job titles contain<input class="e360-input" name="appliesToJobTitles" value="${esc(arrayValue(item.appliesToJobTitles).join(','))}"></label>
      <label class="wide">Service location IDs (comma separated)<input class="e360-input" name="appliesToLocationIds" value="${esc(arrayValue(item.appliesToLocationIds).join(','))}"></label>
      <label>Due days after hire<input class="e360-input" type="number" min="0" name="dueDaysAfterHire" value="${Number(item.dueDaysAfterHire ?? 30)}"></label>
      <label>Renewal interval days<input class="e360-input" type="number" min="1" name="renewalDays" value="${esc(item.renewalDays || '')}" placeholder="365"></label>
      <label>Warning window days<input class="e360-input" type="number" min="1" name="warningWindowDays" value="${Number(item.warningWindowDays ?? 60)}"></label>
      <label>Employee reminder days<input class="e360-input" name="reminderDays" value="${esc(arrayValue(item.reminderDays).join(',') || '60,30,14,7,1,0,-1,-7,-14,-30')}"></label>
      <label>Manager escalation days<input class="e360-input" name="managerEscalationDays" value="${esc(arrayValue(item.managerEscalationDays).join(',') || '-1,-7,-14,-30')}"></label>
      <label>HR escalation days<input class="e360-input" name="hrEscalationDays" value="${esc(arrayValue(item.hrEscalationDays).join(',') || '-7,-14,-30')}"></label>
      <label data-document-field>Document category<input class="e360-input" name="documentCategory" value="${esc(item.documentCategory || '')}"></label>
      <label data-document-field>Document title contains<input class="e360-input" name="documentTitleContains" value="${esc(item.documentTitleContains || '')}"></label>
      <label data-document-field>Document sensitivity<select class="e360-select" name="documentSensitivity">${SENSITIVITIES.map(value => `<option ${item.documentSensitivity===value?'selected':''}>${value}</option>`).join('')}</select></label>
      <label data-education-field>Course code<input class="e360-input" name="courseCode" value="${esc(item.courseCode || '')}"></label>
      <label data-education-field>Course title<input class="e360-input" name="courseTitle" value="${esc(item.courseTitle || '')}"></label>
      <label class="wide" data-attestation-field>Attestation statement<textarea class="e360-textarea" name="attestationText">${esc(item.attestationText || '')}</textarea></label>
      <label class="wide"><span style="display:flex;gap:12px;flex-wrap:wrap"><span><input type="checkbox" name="notifyEmployee" ${item.notifyEmployee!==false?'checked':''}> Notify employee</span><span><input type="checkbox" name="notifySupervisor" ${item.notifySupervisor!==false?'checked':''}> Supervisor escalation</span><span><input type="checkbox" name="notifyLocationManager" ${item.notifyLocationManager!==false?'checked':''}> Location-manager escalation</span><span><input type="checkbox" name="notifyHR" ${item.notifyHR!==false?'checked':''}> HR escalation</span><span><input type="checkbox" name="autoAssignEducation" ${item.autoAssignEducation!==false?'checked':''}> Auto-assign education</span><span><input type="checkbox" name="allowEmployeeUpload" ${item.allowEmployeeUpload!==false?'checked':''}> Employee upload</span><span><input type="checkbox" name="allowEmployeeAttestation" ${item.allowEmployeeAttestation!==false?'checked':''}> Employee attestation</span><span><input type="checkbox" name="active" ${item.active!==false?'checked':''}> Active</span></span></label>
    </div><div class="e360-form-actions"><button class="e360-btn primary" type="submit">${item.id ? 'Save Requirement' : 'Create Requirement'}</button><button class="e360-btn" type="button" id="resetRequirementForm">Clear</button></div></form>`;
  }

  function remindersView() {
    return `<div class="e360-compliance-card"><header><h3>Reminder Delivery Log</h3></header><div class="e360-compliance-card-body">${state.reminders.length ? state.reminders.map(item => `<div class="e360-compliance-reminder"><div style="display:flex;justify-content:space-between;gap:10px"><strong>${esc(item.title)} — ${esc(item.displayName)}</strong><span class="e360-compliance-status ${statusClass(item.status)}">${esc(item.status)}</span></div><div class="e360-compliance-sub">${esc(item.recipientType)} · ${esc(item.recipient)} · ${esc(item.stage)} · ${dateTime(item.sentAt || item.createdAt)} · Attempts ${Number(item.attempts || 0)}${item.errorMessage ? `<br>${esc(item.errorMessage)}` : ''}</div></div>`).join('') : 'No compliance reminders have been generated.'}</div></div>`;
  }

  function runsAndSettingsView() {
    const s = state.settings || {};
    return `<div class="e360-compliance-layout"><div class="e360-compliance-card"><header><h3>Engine Run History</h3></header><div class="e360-compliance-card-body">${state.runs.length ? state.runs.map(run => `<div class="e360-compliance-run"><div style="display:flex;justify-content:space-between"><strong>${esc(run.trigger)} RUN</strong><span class="e360-compliance-status ${statusClass(run.status)}">${esc(run.status)}</span></div><div class="e360-compliance-sub">Started ${dateTime(run.startedAt)} · Completed ${dateTime(run.completedAt)}${run.errorMessage ? `<br>${esc(run.errorMessage)}` : ''}</div><div class="e360-compliance-sub">${esc(JSON.stringify(run.metrics || {}))}</div></div>`).join('') : 'No engine runs recorded.'}</div></div><div class="e360-compliance-card"><header><h3>Automatic Reminder Settings</h3></header><div class="e360-compliance-card-body"><form id="complianceSettingsForm"><div class="e360-compliance-form-grid"><label><span><input type="checkbox" name="enabled" ${s.enabled!==false?'checked':''}> Automatic daily scans enabled</span></label><label>Daily scan hour (0–23)<input class="e360-input" type="number" min="0" max="23" name="scanHour" value="${Number(s.scanHour ?? 8)}"></label><label>Time zone<input class="e360-input" name="timezone" value="${esc(s.timezone || 'America/New_York')}"></label><label>Sender name<input class="e360-input" name="senderName" value="${esc(s.senderName || 'Sulandra Health Human Resources Department')}"></label><label class="wide">HR escalation recipients<input class="e360-input" name="hrRecipients" value="${esc(arrayValue(s.hrRecipients).join(','))}" placeholder="hr@sulandrahealth.com"></label><label class="wide">Employee Portal action link<input class="e360-input" type="url" name="portalUrl" value="${esc(s.portalUrl || '')}"></label></div><div class="e360-form-actions"><button class="e360-btn primary" type="submit">Save Reminder Settings</button></div></form><div class="e360-compliance-sub" style="margin-top:12px">Last scheduled date: ${date(s.lastScheduledRunDate)} · Last run: ${dateTime(s.lastRunAt)}</div></div></div></div>`;
  }

  function renderCenter() {
    const content = document.getElementById('employeeComplianceContent');
    if (!content) return;
    content.innerHTML = `${summaryCards()}<div class="e360-compliance-tabs"><button class="e360-compliance-tab active" data-compliance-view-button="dashboard">Dashboard</button><button class="e360-compliance-tab" data-compliance-view-button="requirements">Requirements</button><button class="e360-compliance-tab" data-compliance-view-button="reminders">Reminder Log</button><button class="e360-compliance-tab" data-compliance-view-button="runs">Runs & Settings</button></div><div class="e360-compliance-view active" data-compliance-view="dashboard">${assignmentTable()}</div><div class="e360-compliance-view" data-compliance-view="requirements">${requirementsView()}</div><div class="e360-compliance-view" data-compliance-view="reminders">${remindersView()}</div><div class="e360-compliance-view" data-compliance-view="runs">${runsAndSettingsView()}</div>`;
    wireCenter();
  }

  function wireCenter() {
    document.querySelectorAll('[data-compliance-view-button]').forEach(button => button.onclick = () => {
      document.querySelectorAll('[data-compliance-view-button]').forEach(item => item.classList.toggle('active', item === button));
      document.querySelectorAll('[data-compliance-view]').forEach(view => view.classList.toggle('active', view.dataset.complianceView === button.dataset.complianceViewButton));
    });
    document.getElementById('applyComplianceFilters')?.addEventListener('click', applyFilters);
    document.getElementById('complianceSearch')?.addEventListener('input', applyFilters);
    document.querySelectorAll('[data-remind]').forEach(button => button.onclick = () => remind(button.dataset.remind));
    document.querySelectorAll('[data-exempt]').forEach(button => button.onclick = () => override(button.dataset.exempt, 'EXEMPT'));
    document.querySelectorAll('[data-complete]').forEach(button => button.onclick = () => override(button.dataset.complete, 'MARK_COMPLETE'));
    document.querySelectorAll('[data-edit-requirement]').forEach(button => button.onclick = () => editRequirement(button.dataset.editRequirement));
    document.querySelectorAll('[data-archive-requirement]').forEach(button => button.onclick = () => archiveRequirement(button.dataset.archiveRequirement));
    wireRequirementForm();
    wireSettingsForm();
  }

  function applyFilters() {
    const q = String(document.getElementById('complianceSearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('complianceStatusFilter')?.value || '';
    const requirement = document.getElementById('complianceRequirementFilter')?.value || '';
    document.querySelectorAll('[data-compliance-row]').forEach(row => {
      const visible = (!q || row.dataset.search.includes(q)) && (!status || row.dataset.status === status) && (!requirement || row.dataset.requirement === requirement);
      row.hidden = !visible;
    });
  }

  function requirementPayload(form) {
    const data = new FormData(form);
    const nullableNumber = name => data.get(name) ? Number(data.get(name)) : null;
    return {
      code: data.get('code'), title: data.get('title'), description: data.get('description') || null,
      requirementType: data.get('requirementType'), documentCategory: data.get('documentCategory') || null,
      documentTitleContains: data.get('documentTitleContains') || null, documentSensitivity: data.get('documentSensitivity') || 'GENERAL',
      courseCode: data.get('courseCode') || null, courseTitle: data.get('courseTitle') || null, attestationText: data.get('attestationText') || null,
      requiredForAll: data.has('requiredForAll'), appliesToRoles: data.getAll('role'), appliesToDepartments: csv(data.get('appliesToDepartments')),
      appliesToJobTitles: csv(data.get('appliesToJobTitles')), appliesToLocationIds: csv(data.get('appliesToLocationIds')),
      employmentStatuses: csv(data.get('employmentStatuses')), dueDaysAfterHire: Number(data.get('dueDaysAfterHire') || 30), renewalDays: nullableNumber('renewalDays'),
      warningWindowDays: Number(data.get('warningWindowDays') || 60), reminderDays: numberCsv(data.get('reminderDays')),
      managerEscalationDays: numberCsv(data.get('managerEscalationDays')), hrEscalationDays: numberCsv(data.get('hrEscalationDays')),
      notifyEmployee: data.has('notifyEmployee'), notifySupervisor: data.has('notifySupervisor'), notifyLocationManager: data.has('notifyLocationManager'), notifyHR: data.has('notifyHR'),
      autoAssignEducation: data.has('autoAssignEducation'), allowEmployeeUpload: data.has('allowEmployeeUpload'), allowEmployeeAttestation: data.has('allowEmployeeAttestation'), active: data.has('active')
    };
  }

  function wireRequirementForm() {
    const form = document.getElementById('complianceRequirementForm');
    if (!form) return;
    const sync = () => {
      const type = form.elements.requirementType.value;
      form.querySelectorAll('[data-document-field]').forEach(node => node.hidden = type !== 'DOCUMENT');
      form.querySelectorAll('[data-education-field]').forEach(node => node.hidden = type !== 'EDUCATION');
      form.querySelectorAll('[data-attestation-field]').forEach(node => node.hidden = type !== 'ATTESTATION');
    };
    form.elements.requirementType.addEventListener('change', sync); sync();
    form.onsubmit = async event => {
      event.preventDefault();
      try {
        const id = form.dataset.id;
        await api(id ? `/api/admin/compliance/requirements/${encodeURIComponent(id)}` : '/api/admin/compliance/requirements', { method: id ? 'PUT' : 'POST', body: JSON.stringify(requirementPayload(form)) });
        message(id ? 'Compliance requirement updated.' : 'Compliance requirement created. Run the compliance engine to assign it.');
        await loadCenter(true);
        document.querySelector('[data-compliance-view-button="requirements"]')?.click();
      } catch (error) { message(error.message, true); }
    };
    document.getElementById('resetRequirementForm').onclick = () => {
      const body = form.closest('.e360-compliance-card-body');
      if (body) body.innerHTML = requirementForm();
      document.getElementById('requirementFormTitle').textContent = 'Create Requirement';
      wireRequirementForm();
    };
  }

  function editRequirement(id) {
    const item = state.requirements.find(value => value.id === id);
    const form = document.getElementById('complianceRequirementForm');
    const body = form?.closest('.e360-compliance-card-body');
    if (!item || !body) return;
    body.innerHTML = requirementForm(item);
    document.getElementById('requirementFormTitle').textContent = `Edit ${item.code}`;
    wireRequirementForm();
    body.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function archiveRequirement(id) {
    if (!confirm('Archive this compliance requirement? Existing history will be retained.')) return;
    try { await api(`/api/admin/compliance/requirements/${encodeURIComponent(id)}/archive`, {method:'POST'}); await loadCenter(true); document.querySelector('[data-compliance-view-button="requirements"]')?.click(); }
    catch (error) { message(error.message, true); }
  }

  function wireSettingsForm() {
    const form = document.getElementById('complianceSettingsForm');
    if (!form) return;
    form.onsubmit = async event => {
      event.preventDefault();
      const data = new FormData(form);
      try {
        await api('/api/admin/compliance/settings', {method:'PUT', body:JSON.stringify({enabled:data.has('enabled'),timezone:data.get('timezone'),scanHour:Number(data.get('scanHour')),hrRecipients:csv(data.get('hrRecipients')),portalUrl:data.get('portalUrl'),senderName:data.get('senderName')})});
        message('Automatic reminder settings saved.');
        await loadCenter(true);
        document.querySelector('[data-compliance-view-button="runs"]')?.click();
      } catch (error) { message(error.message, true); }
    };
  }

  async function runEngine() {
    if (!confirm('Run the compliance engine now? It will reconcile evidence, create applicable assignments, auto-assign required education, and send reminders due today.')) return;
    message('Running compliance reconciliation and reminder engine…');
    try {
      const result = await api('/api/admin/compliance/engine/run', {method:'POST',body:JSON.stringify({sendNotifications:true})});
      message(`Compliance engine completed. Evaluated ${Number(result.metrics?.evaluatedAssignments || 0)} assignments and sent ${Number(result.metrics?.remindersSent || 0)} reminders.`);
      await loadCenter(true);
    } catch (error) { message(error.message, true); }
  }

  async function remind(id) {
    try { const result = await api(`/api/admin/compliance/assignments/${encodeURIComponent(id)}/remind`, {method:'POST',body:'{}'}); alert(`${Number(result.sent || 0)} compliance reminder email(s) sent and logged.`); await loadCenter(true); }
    catch (error) { alert(error.message); }
  }

  async function override(id, action) {
    const reason = prompt(action === 'EXEMPT' ? 'Enter the documented exemption reason:' : 'Enter completion notes:');
    if (!reason) return;
    try { await api(`/api/admin/compliance/assignments/${encodeURIComponent(id)}`, {method:'PATCH',body:JSON.stringify({action,reason})}); await loadCenter(true); }
    catch (error) { alert(error.message); }
  }

  function captureEmployee(url, method, payload) {
    let pathname = '';
    try { pathname = new URL(url, location.href).pathname; } catch { pathname = String(url); }
    if (method === 'GET' && /^\/api\/admin\/employees\/[^/]+$/.test(pathname)) {
      const detail = payload?.data ?? payload;
      if (detail?.employee?.id) {
        state.activeEmployeeId = detail.employee.id;
        state.activeEmployeeCompliance = null;
        setTimeout(enhanceEmployeeProfile, 0);
      }
    }
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const request = args[0]; const options = args[1] || {};
    const method = String(options.method || (request instanceof Request ? request.method : 'GET')).toUpperCase();
    const url = request instanceof Request ? request.url : String(request);
    const response = await originalFetch(...args);
    if ((response.headers.get('content-type') || '').includes('application/json') && url.includes('/api/admin/employees')) response.clone().json().then(body => captureEmployee(url, method, body)).catch(() => undefined);
    return response;
  };

  async function enhanceEmployeeProfile() {
    const profile = document.getElementById('employeeProfile');
    if (!profile?.classList.contains('open') || !state.activeEmployeeId) return;
    let button = profile.querySelector('[data-tab-button="compliance"]');
    if (!button) {
      const tabs = profile.querySelector('.e360-tabs');
      if (!tabs) return;
      button = document.createElement('button'); button.className = 'e360-tab'; button.dataset.tabButton = 'compliance'; button.textContent = 'Compliance'; tabs.appendChild(button);
      const panel = document.createElement('section'); panel.className = 'e360-panel e360-compliance-employee-panel'; panel.dataset.tab = 'compliance'; panel.innerHTML = 'Loading compliance records…'; profile.appendChild(panel);
      button.onclick = async () => {
        profile.querySelectorAll('.e360-tab').forEach(tab => tab.classList.toggle('active', tab === button));
        profile.querySelectorAll('.e360-panel').forEach(panelNode => panelNode.classList.toggle('active', panelNode.dataset.tab === 'compliance'));
        await loadEmployeeCompliance();
      };
    }
  }

  async function loadEmployeeCompliance() {
    const panel = document.querySelector('#employeeProfile [data-tab="compliance"]');
    if (!panel || !state.activeEmployeeId) return;
    panel.innerHTML = 'Loading employee compliance…';
    try {
      state.activeEmployeeCompliance = await api(`/api/admin/compliance/employees/${encodeURIComponent(state.activeEmployeeId)}`);
      renderEmployeeCompliance(panel);
    } catch (error) { panel.innerHTML = `<div class="e360-compliance-note e360-compliance-error">${esc(error.message)}</div>`; }
  }

  function renderEmployeeCompliance(panel) {
    const data = state.activeEmployeeCompliance || {assignments:[],reminders:[]};
    panel.innerHTML = `<div class="e360-compliance-note"><strong>Automatic compliance monitoring:</strong> Employee 360 reconciles approved documents, completed education, attestations, exemptions, and renewal dates. Reminder and escalation events are logged below.</div><div class="e360-compliance-grid"><div class="e360-compliance-metric"><span>Total</span><strong>${data.assignments.length}</strong></div><div class="e360-compliance-metric overdue"><span>Overdue</span><strong>${data.assignments.filter(item=>item.status==='OVERDUE').length}</strong></div><div class="e360-compliance-metric due"><span>Due Soon</span><strong>${data.assignments.filter(item=>item.status==='DUE_SOON').length}</strong></div><div class="e360-compliance-metric good"><span>Compliant</span><strong>${data.assignments.filter(item=>item.status==='COMPLIANT'||item.status==='EXEMPT').length}</strong></div></div><div class="e360-section"><h3>Requirements</h3>${data.assignments.length ? data.assignments.map(item => `<div class="e360-compliance-requirement"><div><h4>${esc(item.code)} — ${esc(item.title)}</h4><div class="e360-compliance-sub">${esc(item.requirementType)} · Due ${date(item.dueDate)} · Completed ${date(item.completedAt)} · Expires ${date(item.expiresAt)}<br>${esc(item.evidenceSummary || 'No approved evidence')}</div><span class="e360-compliance-status ${statusClass(item.status)}">${esc(item.status)}</span>${item.status==='IN_PROGRESS'&&item.evidenceType==='DOCUMENT'&&item.evidenceId?'<div class="e360-pending-review">Employee-submitted document is awaiting HR review.</div>':''}</div><div class="e360-compliance-employee-actions"><button class="e360-btn" data-employee-remind="${esc(item.id)}">Send Reminder</button><button class="e360-btn" data-employee-exempt="${esc(item.id)}">Exempt</button><button class="e360-btn" data-employee-complete="${esc(item.id)}">Mark Complete</button><button class="e360-btn" data-employee-due="${esc(item.id)}">Change Due Date</button>${item.status==='EXEMPT'?`<button class="e360-btn" data-employee-clear="${esc(item.id)}">Clear Exemption</button>`:''}${item.status==='IN_PROGRESS'&&item.evidenceType==='DOCUMENT'&&item.evidenceId?`<button class="e360-btn primary" data-approve-document="${esc(item.evidenceId)}">Approve Document</button><button class="e360-btn danger" data-reject-document="${esc(item.evidenceId)}">Reject</button>`:''}</div></div>`).join('') : '<div class="e360-empty">No compliance assignments. Run the Compliance Engine after creating requirements.</div>'}</div><div class="e360-section"><h3>Reminder History</h3><div class="e360-list">${data.reminders.length ? data.reminders.map(item => `<div class="e360-row"><div><div class="e360-row-title">${esc(item.subject)}</div><div class="e360-sub">${esc(item.recipientType)} · ${esc(item.recipient)} · ${esc(item.stage)} · ${dateTime(item.sentAt || item.createdAt)}${item.errorMessage?` · ${esc(item.errorMessage)}`:''}</div></div><span class="e360-compliance-status ${statusClass(item.status)}">${esc(item.status)}</span></div>`).join('') : '<div class="e360-row">No compliance reminders recorded.</div>'}</div></div>`;
    panel.querySelectorAll('[data-employee-remind]').forEach(button => button.onclick = () => remindEmployee(button.dataset.employeeRemind));
    panel.querySelectorAll('[data-employee-exempt]').forEach(button => button.onclick = () => employeeOverride(button.dataset.employeeExempt,'EXEMPT'));
    panel.querySelectorAll('[data-employee-complete]').forEach(button => button.onclick = () => employeeOverride(button.dataset.employeeComplete,'MARK_COMPLETE'));
    panel.querySelectorAll('[data-employee-clear]').forEach(button => button.onclick = () => employeeOverride(button.dataset.employeeClear,'CLEAR_EXEMPTION'));
    panel.querySelectorAll('[data-employee-due]').forEach(button => button.onclick = () => changeDueDate(button.dataset.employeeDue));
    panel.querySelectorAll('[data-approve-document]').forEach(button => button.onclick = () => reviewDocument(button.dataset.approveDocument,'APPROVED'));
    panel.querySelectorAll('[data-reject-document]').forEach(button => button.onclick = () => reviewDocument(button.dataset.rejectDocument,'REJECTED'));
  }

  async function remindEmployee(id) { try { const result=await api(`/api/admin/compliance/assignments/${encodeURIComponent(id)}/remind`,{method:'POST',body:'{}'}); alert(`${result.sent} reminder email(s) sent.`); await loadEmployeeCompliance(); } catch(error){alert(error.message);} }
  async function employeeOverride(id, action) { const reason=action==='CLEAR_EXEMPTION'?'Exemption cleared':prompt(action==='EXEMPT'?'Enter exemption reason:':'Enter completion notes:'); if(!reason)return; try{await api(`/api/admin/compliance/assignments/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({action,reason})});await loadEmployeeCompliance();}catch(error){alert(error.message);} }
  async function changeDueDate(id) { const dueDate=prompt('Enter the new due date in YYYY-MM-DD format:'); if(!dueDate)return; const reason=prompt('Enter the reason for changing the due date:')||'Administrative due-date adjustment'; try{await api(`/api/admin/compliance/assignments/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({action:'CHANGE_DUE_DATE',dueDate,reason})});await loadEmployeeCompliance();}catch(error){alert(error.message);} }
  async function reviewDocument(id,status) { const notes=prompt(`${status==='APPROVED'?'Approval':'Rejection'} notes:`)||null; try{await api(`/api/admin/compliance/documents/${encodeURIComponent(id)}/review`,{method:'PATCH',body:JSON.stringify({status,notes})});alert(`Document ${status.toLowerCase()}. Run the compliance engine to refresh all statuses.`);await loadEmployeeCompliance();}catch(error){alert(error.message);} }

  addStyles();
  new MutationObserver(() => { installCenter(); enhanceEmployeeProfile(); }).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('load', () => { installCenter(); enhanceEmployeeProfile(); });
  document.addEventListener('click', () => setTimeout(enhanceEmployeeProfile,0), true);
})();
