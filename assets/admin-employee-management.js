(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const STATIC = 'https://www.sulandrahealth.com';
  const ROLE_OPTIONS = [
    ['ADMINISTRATOR','Administrator'],['PROGRAM_MANAGER','Program Manager'],['HR_MANAGER','Human Resources Manager'],
    ['HOUSE_MANAGER','House Manager'],['SCHEDULER','Scheduler'],['AUDITOR','Auditor'],['BILLING_SPECIALIST','Billing Specialist'],
    ['ADMINISTRATIVE_ASSISTANT','Administrative Assistant'],['DELEGATING_NURSE','Delegating Nurse'],['RN','Registered Nurse'],
    ['LPN','Licensed Practical Nurse'],['DSP','Direct Support Professional'],['DRIVER','Driver'],['GENERAL','General Employee'],
    ['CEO','Chief Executive Officer'],['DOO','Chief Operating Officer']
  ];
  const DOCUMENT_CATEGORIES = ['License','Certification','Education','Training','Background Check','Health/Medical','Employment','Policy Acknowledgment','Performance','Corrective Action','Identification','Other'];

  const token = () => sessionStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra_token')
    || localStorage.getItem('token')
    || localStorage.getItem('accessToken')
    || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => value ? new Date(value).toLocaleDateString() : '—';
  const dateTime = value => value ? new Date(value).toLocaleString() : '—';
  const bytes = value => {
    const n = Number(value || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };
  const roleLabel = value => ROLE_OPTIONS.find(([key]) => key === value)?.[1] || String(value || '').replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase());
  const statusClass = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');

  async function api(path, options = {}) {
    const auth = token();
    if (!auth) throw new Error('Your admin session is unavailable. Sign in again.');
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: options.accept || 'application/json',
        Authorization: `Bearer ${auth}`,
        ...(options.body && !(options.body instanceof FormData) ? {'Content-Type':'application/json'} : {}),
        ...(options.headers || {})
      }
    });
    if (options.raw) {
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Request failed');
      return response;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body.data ?? body;
  }

  let employees = [];
  let detail = null;
  let activeTab = 'overview';
  let installing = false;
  let installScheduled = false;

  function findHost() {
    const heading = [...document.querySelectorAll('h1,h2,h3')]
      .find(node => node.textContent.trim() === 'Employees' && node.getClientRects().length > 0);
    if (!heading) return null;
    return heading.closest('.card,section,article,[data-module-panel],main>div,main') || heading.parentElement;
  }

  function addStyles() {
    if (document.getElementById('employee360Styles')) return;
    const style = document.createElement('style');
    style.id = 'employee360Styles';
    style.textContent = `
      #employee360{font-family:inherit;color:#1e2936}.e360-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px}.e360-head h2{margin:0;color:#075493;font-size:28px}.e360-head p{margin:5px 0 0;color:#5a6570}.e360-actions{display:flex;gap:8px;flex-wrap:wrap}.e360-btn{border:1px solid #0b69aa;background:#fff;color:#075493;border-radius:6px;padding:9px 13px;font-weight:800;cursor:pointer}.e360-btn:hover{filter:brightness(.97)}.e360-btn.primary{background:#0784c6;color:#fff}.e360-btn.danger{background:#c9432d;border-color:#c9432d;color:#fff}.e360-btn.warn{background:#fff1ca;border-color:#d6a327;color:#6a4b00}.e360-btn:disabled{opacity:.5;cursor:not-allowed}.e360-status{display:none;margin:10px 0;padding:10px 12px;border:1px solid #e0c15b;background:#fff6d8;border-radius:6px}.e360-status.show{display:block}.e360-toolbar{display:grid;grid-template-columns:minmax(240px,1fr) auto auto;gap:10px;margin-bottom:14px}.e360-input,.e360-select,.e360-textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #b9c8d6;border-radius:6px;background:#fff}.e360-textarea{min-height:100px;resize:vertical}.e360-table-wrap{overflow:auto;border:1px solid #ccd8e4;border-radius:10px;background:#fff}.e360-table{width:100%;border-collapse:collapse;min-width:960px}.e360-table th{background:#e9f1f8;color:#123d63;text-align:left;padding:11px;border-bottom:1px solid #b8c9d8;position:sticky;top:0}.e360-table td{padding:11px;border-bottom:1px solid #e1e8ee;vertical-align:top}.e360-table tr[data-employee]{cursor:pointer}.e360-table tr[data-employee]:hover{background:#f4f9fd}.e360-name{font-weight:900;color:#075493}.e360-sub{font-size:12px;color:#697581;margin-top:3px}.e360-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:800;background:#e8f3fb;color:#075493;margin:2px}.e360-badge.expired{background:#fde1dc;color:#9e2415}.e360-badge.expiring{background:#fff0c4;color:#705100}.e360-badge.active,.e360-badge.sent,.e360-badge.completed{background:#def4e5;color:#176b35}.e360-badge.suspended,.e360-badge.failed,.e360-badge.terminated{background:#fde1dc;color:#9e2415}.e360-badge.leave,.e360-badge.pending,.e360-badge.assigned,.e360-badge.inprogress{background:#fff0c4;color:#705100}.e360-empty{text-align:center;padding:44px;border:2px dashed #bdd6e8;border-radius:12px;background:#f7fbfe}.e360-profile{display:none}.e360-profile.open{display:block}.e360-directory.hidden{display:none}.e360-profile-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;background:#0d477d;color:#fff;padding:18px;border-radius:10px 10px 0 0}.e360-profile-head h2{margin:0}.e360-profile-head p{margin:4px 0 0;opacity:.9}.e360-tabs{display:flex;gap:0;overflow:auto;background:#e7f0f8;border:1px solid #b8c9d8;border-top:0}.e360-tab{border:0;border-right:1px solid #b8c9d8;background:transparent;padding:11px 14px;font-weight:800;color:#17496f;cursor:pointer;white-space:nowrap}.e360-tab.active{background:#fff;color:#075493}.e360-panel{display:none;border:1px solid #cbd7e1;border-top:0;background:#fff;padding:18px;border-radius:0 0 10px 10px}.e360-panel.active{display:block}.e360-grid{display:grid;grid-template-columns:repeat(2,minmax(240px,1fr));gap:12px}.e360-grid.three{grid-template-columns:repeat(3,minmax(180px,1fr))}.e360-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:16px}.e360-card{border:1px solid #d2dde6;border-radius:9px;padding:13px;background:#fbfdff}.e360-card h4{margin:0 0 7px;color:#075493}.e360-card strong.metric{font-size:25px;color:#0a5792}.e360-section{margin-top:18px}.e360-section h3{margin:0 0 10px;color:#075493}.e360-list{border:1px solid #d2dde6;border-radius:8px;overflow:hidden}.e360-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:11px 12px;border-top:1px solid #e2e8ee}.e360-row:first-child{border-top:0}.e360-row-main{min-width:0}.e360-row-title{font-weight:900;color:#173d5d}.e360-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.e360-form-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.e360-alert{border:1px solid #e0c15b;background:#fff7dc;border-radius:8px;padding:12px;margin-bottom:12px}.e360-alert.danger{border-color:#d77a69;background:#fde7e3}.e360-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.e360-print-only{display:none}@media(max-width:900px){.e360-head,.e360-profile-head{flex-direction:column}.e360-toolbar,.e360-grid,.e360-grid.three{grid-template-columns:1fr}.e360-row{flex-direction:column}.e360-row-actions{justify-content:flex-start}}@media print{body *{visibility:hidden!important}#employee360,#employee360 *{visibility:visible!important}#employee360{position:absolute;left:0;top:0;width:100%}.e360-directory,.e360-actions,.e360-tabs,.e360-btn,.e360-form-actions{display:none!important}.e360-panel{display:block!important;border:0}.e360-print-only{display:block}.e360-profile-head{background:#fff!important;color:#000!important;border-bottom:2px solid #000}.e360-panel:not([data-tab="overview"]):not([data-tab="documents"]):not([data-tab="education"]):not([data-tab="attendance"]){display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function shell() {
    return `<section id="employee360">
      <div class="e360-directory" id="employeeDirectory">
        <div class="e360-head"><div><h2>Employees</h2><p>Enterprise employee folders, compliance documents, education, attendance, communications, and account administration.</p></div><div class="e360-actions"><button class="e360-btn" id="refreshEmployees">Refresh</button><button class="e360-btn" id="openOnboarding">Open Onboarding</button></div></div>
        <div id="employeeStatus" class="e360-status"></div>
        <div class="e360-toolbar"><input class="e360-input" id="employeeSearch" placeholder="Search name, email, role, department, title, or employee number"><select class="e360-select" id="employeeStatusFilter"><option value="">All employment statuses</option><option>ACTIVE</option><option>LEAVE</option><option>SUSPENDED</option><option>TERMINATED</option></select><select class="e360-select" id="employeeAlertFilter"><option value="">All compliance states</option><option value="expired">Expired documents</option><option value="expiring">Expiring within 60 days</option><option value="locked">Locked accounts</option></select></div>
        <div id="employeeList"></div>
      </div>
      <div class="e360-profile" id="employeeProfile"></div>
    </section>`;
  }

  function setStatus(message, error = false) {
    const node = document.getElementById('employeeStatus');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('show', Boolean(message));
    node.style.background = error ? '#fde6e2' : '#fff6d8';
    node.style.borderColor = error ? '#d87866' : '#e0c15b';
  }

  async function install() {
    if (installing || document.getElementById('employee360')) return;
    const host = findHost();
    if (!host) return;
    installing = true;
    try {
      addStyles();
      host.innerHTML = shell();
      document.getElementById('refreshEmployees').onclick = loadEmployees;
      document.getElementById('openOnboarding').onclick = () => {
        const tab = [...document.querySelectorAll('[data-module],a,button')].find(node => /onboarding/i.test(node.textContent || ''));
        if (tab) tab.click();
      };
      document.getElementById('employeeSearch').addEventListener('input', renderEmployees);
      document.getElementById('employeeStatusFilter').addEventListener('change', renderEmployees);
      document.getElementById('employeeAlertFilter').addEventListener('change', renderEmployees);
      await loadEmployees();
    } finally { installing = false; }
  }

  async function loadEmployees() {
    try {
      setStatus('Loading employee directory…');
      employees = await api('/api/admin/employees');
      renderEmployees();
      setStatus('');
    } catch (error) {
      setStatus(error.message, true);
      document.getElementById('employeeList').innerHTML = `<div class="e360-empty"><h3>Employee directory unavailable</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  function renderEmployees() {
    const box = document.getElementById('employeeList');
    if (!box) return;
    const q = String(document.getElementById('employeeSearch')?.value || '').trim().toLowerCase();
    const employmentStatus = document.getElementById('employeeStatusFilter')?.value || '';
    const alert = document.getElementById('employeeAlertFilter')?.value || '';
    const rows = employees.filter(employee => {
      const matchesText = !q || [employee.displayName,employee.email,employee.role,employee.department,employee.jobTitle,employee.employeeNumber].some(value => String(value || '').toLowerCase().includes(q));
      const matchesStatus = !employmentStatus || employee.employmentStatus === employmentStatus;
      const matchesAlert = !alert
        || (alert === 'expired' && Number(employee.expiredDocumentCount) > 0)
        || (alert === 'expiring' && Number(employee.expiringDocumentCount) > 0)
        || (alert === 'locked' && employee.lockedUntil && new Date(employee.lockedUntil).getTime() > Date.now());
      return matchesText && matchesStatus && matchesAlert;
    });
    if (!rows.length) {
      box.innerHTML = '<div class="e360-empty"><h3>No employees match these filters</h3><p>Employees appear here after their user account is created through onboarding.</p></div>';
      return;
    }
    box.innerHTML = `<div class="e360-table-wrap"><table class="e360-table"><thead><tr><th>Employee</th><th>Position</th><th>Status</th><th>Portal Access</th><th>Documents</th><th>Compliance Alerts</th><th>Last Sign-in</th></tr></thead><tbody>${rows.map(employee => {
      const locked = employee.lockedUntil && new Date(employee.lockedUntil).getTime() > Date.now();
      return `<tr data-employee="${esc(employee.id)}"><td><div class="e360-name">${esc(employee.displayName)}</div><div class="e360-sub">${esc(employee.email || '')}${employee.isOwner ? ' · Enterprise Owner' : ''}</div></td><td>${esc(employee.jobTitle || roleLabel(employee.role))}<div class="e360-sub">${esc(employee.department || 'Department not assigned')}</div></td><td><span class="e360-badge ${statusClass(employee.employmentStatus)}">${esc(employee.employmentStatus || 'ACTIVE')}</span></td><td><span class="e360-badge ${locked ? 'failed' : employee.username ? 'active' : 'pending'}">${locked ? 'LOCKED' : employee.username ? 'READY' : 'NOT PROVISIONED'}</span>${employee.mustChangePassword ? '<span class="e360-badge pending">PASSWORD CHANGE REQUIRED</span>' : ''}</td><td>${Number(employee.documentCount || 0)}</td><td>${Number(employee.expiredDocumentCount) ? `<span class="e360-badge expired">${Number(employee.expiredDocumentCount)} expired</span>` : ''}${Number(employee.expiringDocumentCount) ? `<span class="e360-badge expiring">${Number(employee.expiringDocumentCount)} expiring</span>` : '<span class="e360-badge active">Clear</span>'}</td><td>${dateTime(employee.lastSignedInAt)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-employee]').forEach(row => row.onclick = () => openEmployee(row.dataset.employee));
  }

  async function openEmployee(id) {
    try {
      setStatus('Opening employee folder…');
      detail = await api(`/api/admin/employees/${encodeURIComponent(id)}`);
      activeTab = 'overview';
      renderProfile();
      document.getElementById('employeeDirectory').classList.add('hidden');
      document.getElementById('employeeProfile').classList.add('open');
      setStatus('');
      scrollTo({top:0,behavior:'smooth'});
    } catch (error) { setStatus(error.message, true); }
  }

  function backToDirectory() {
    detail = null;
    document.getElementById('employeeProfile').classList.remove('open');
    document.getElementById('employeeDirectory').classList.remove('hidden');
    loadEmployees();
  }

  function alertBadge(document) {
    const days = document.daysUntilExpiration;
    if (days == null) return '<span class="e360-badge">No expiration</span>';
    if (Number(days) < 0) return `<span class="e360-badge expired">Expired ${Math.abs(Number(days))} days ago</span>`;
    if (Number(days) <= 60) return `<span class="e360-badge expiring">Expires in ${Number(days)} days</span>`;
    return `<span class="e360-badge active">Valid ${Number(days)} days</span>`;
  }

  function renderProfile() {
    if (!detail) return;
    const e = detail.employee;
    const p = detail.permissions || {};
    const d = detail.diagnostics || {};
    const profile = document.getElementById('employeeProfile');
    profile.innerHTML = `<div class="e360-profile-head"><div><h2>${esc(e.displayName)}</h2><p>${esc(e.jobTitle || roleLabel(e.role))}${e.department ? ` · ${esc(e.department)}` : ''}${e.isOwner ? ' · Enterprise Owner' : ''}</p><p class="e360-mono">${esc(e.email || '')}</p></div><div class="e360-actions"><button class="e360-btn" id="printEmployeeFolder">Print / Save Folder as PDF</button><button class="e360-btn" id="backEmployees">Back to Employees</button></div></div>
      <nav class="e360-tabs">${[['overview','Overview'],['documents','Documents & Compliance'],['attendance','Time & Attendance'],['education','Education'],['communications','Emails & Communications'],['access','Account & Access'],['audit','Audit History']].map(([id,label]) => `<button class="e360-tab ${activeTab===id?'active':''}" data-tab-button="${id}">${label}</button>`).join('')}</nav>
      ${overviewPanel(e,d,p)}${documentsPanel()}${attendancePanel()}${educationPanel()}${communicationsPanel()}${accessPanel(e,d,p)}${auditPanel()}`;
    profile.querySelectorAll('[data-tab-button]').forEach(button => button.onclick = () => { activeTab = button.dataset.tabButton; renderProfile(); });
    document.getElementById('backEmployees').onclick = backToDirectory;
    document.getElementById('printEmployeeFolder').onclick = printFolder;
    wireOverview();
    wireDocuments();
    wireAttendance();
    wireEducation();
    wireCommunications();
    wireAccess();
  }

  function panel(id, content) { return `<section class="e360-panel ${activeTab===id?'active':''}" data-tab="${id}">${content}</section>`; }

  function overviewPanel(e,d,p) {
    return panel('overview', `<div class="e360-print-only"><h1>Sulandra Health Employee Folder</h1><p>Generated ${dateTime(new Date())}</p></div>
      <div class="e360-card-grid"><div class="e360-card"><h4>Employment</h4><strong class="metric">${esc(e.employmentStatus || 'ACTIVE')}</strong><div class="e360-sub">Hire date: ${date(e.hireDate)}</div></div><div class="e360-card"><h4>Documents</h4><strong class="metric">${detail.documents.length}</strong><div class="e360-sub">${d.expiredDocumentCount || 0} expired · ${d.expiringDocumentCount || 0} expiring</div></div><div class="e360-card"><h4>Education</h4><strong class="metric">${d.assignedEducationCount || 0}</strong><div class="e360-sub">${d.overdueEducationCount || 0} overdue</div></div><div class="e360-card"><h4>Upcoming Shifts</h4><strong class="metric">${d.upcomingShiftCount || 0}</strong><div class="e360-sub">${d.assignedHomeCount || 0} assigned locations</div></div></div>
      ${e.isOwner ? '<div class="e360-alert"><strong>Enterprise owner protection:</strong> This account cannot be deleted, suspended, demoted, reset, or managed by another administrator.</div>' : ''}
      <form id="employeeProfileForm"><div class="e360-grid"><label>Full legal/display name<input class="e360-input" name="displayName" value="${esc(e.displayName)}" required></label><label>Employee number<input class="e360-input" name="employeeNumber" value="${esc(e.employeeNumber || '')}"></label><label>Job title<input class="e360-input" name="jobTitle" value="${esc(e.jobTitle || '')}"></label><label>Department<input class="e360-input" name="department" value="${esc(e.department || '')}"></label><label>Work email<input class="e360-input" value="${esc(e.email || '')}" disabled></label><label>Personal email<input class="e360-input" type="email" name="personalEmail" value="${esc(e.personalEmail || '')}"></label><label>Phone<input class="e360-input" name="phone" value="${esc(e.phone || '')}"></label><label>Alternate phone<input class="e360-input" name="alternatePhone" value="${esc(e.alternatePhone || '')}"></label><label>Employment status<select class="e360-select" name="employmentStatus" ${e.isOwner?'disabled':''}>${['ACTIVE','LEAVE','SUSPENDED','TERMINATED'].map(value => `<option ${e.employmentStatus===value?'selected':''}>${value}</option>`).join('')}</select></label><label>Hire date<input class="e360-input" type="date" name="hireDate" value="${e.hireDate ? String(e.hireDate).slice(0,10) : ''}"></label><label>Termination date<input class="e360-input" type="date" name="terminationDate" value="${e.terminationDate ? String(e.terminationDate).slice(0,10) : ''}"></label><label>Supervisor user ID<input class="e360-input" name="supervisorId" value="${esc(e.supervisorId || '')}"></label><label>Street address<input class="e360-input" name="streetAddress" value="${esc(e.streetAddress || '')}"></label><label>City<input class="e360-input" name="city" value="${esc(e.city || '')}"></label><label>State<input class="e360-input" name="state" value="${esc(e.state || '')}"></label><label>ZIP code<input class="e360-input" name="zipCode" value="${esc(e.zipCode || '')}"></label><label>Emergency contact name<input class="e360-input" name="emergencyContactName" value="${esc(e.emergencyContactName || '')}"></label><label>Emergency contact phone<input class="e360-input" name="emergencyContactPhone" value="${esc(e.emergencyContactPhone || '')}"></label></div><label style="display:block;margin-top:12px">HR / management notes<textarea class="e360-textarea" name="notes">${esc(e.notes || '')}</textarea></label><div class="e360-form-actions"><button class="e360-btn primary" type="submit">Save Employee Profile</button>${p.canChangeRole ? `<select class="e360-select" id="employeeRole" style="max-width:300px">${ROLE_OPTIONS.map(([key,label]) => `<option value="${key}" ${e.role===key?'selected':''}>${label}</option>`).join('')}</select><button class="e360-btn warn" type="button" id="changeEmployeeRole">Change System Role</button>` : ''}</div></form>
      <div class="e360-section"><h3>Service Homes and Locations</h3><div class="e360-list">${detail.homes.length ? detail.homes.map(home => `<div class="e360-row"><div><div class="e360-row-title">${esc(home.name)}</div><div class="e360-sub">${esc(home.address || '')}</div></div><span class="e360-badge ${home.isManager?'active':''}">${home.isManager?'Home Manager':'Assigned Employee'}</span></div>`).join('') : '<div class="e360-row">No service homes assigned.</div>'}</div></div>`);
  }

  function documentsPanel() {
    return panel('documents', `<div class="e360-alert"><strong>Compliance timer:</strong> Expired documents are red. Documents expiring within 60 days are amber.</div><form id="documentUploadForm"><div class="e360-grid three"><label>Category<select class="e360-select" name="category">${DOCUMENT_CATEGORIES.map(value => `<option>${value}</option>`).join('')}</select></label><label>Document title<input class="e360-input" name="title" required></label><label>File<input class="e360-input" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt" required></label><label>Issue date<input class="e360-input" name="issueDate" type="date"></label><label>Expiration date<input class="e360-input" name="expirationDate" type="date"></label><label>Notes<input class="e360-input" name="notes"></label></div><div class="e360-form-actions"><button class="e360-btn primary" type="submit">Upload to Employee Folder</button><button class="e360-btn" type="button" id="printCompliance">Print Compliance Summary / Save as PDF</button></div></form><div class="e360-section"><h3>Employee Documents</h3><div class="e360-list">${detail.documents.length ? detail.documents.map(document => `<div class="e360-row"><div class="e360-row-main"><div class="e360-row-title">${esc(document.title)}</div><div class="e360-sub">${esc(document.category)} · ${esc(document.fileName)} · ${bytes(document.fileSizeBytes)} · Uploaded ${date(document.createdAt)}</div><div>${alertBadge(document)}</div></div><div class="e360-row-actions"><button class="e360-btn" data-download-document="${document.id}">Download Original</button><button class="e360-btn" data-edit-document="${document.id}">Edit Dates</button><button class="e360-btn danger" data-archive-document="${document.id}">Archive</button></div></div>`).join('') : '<div class="e360-row">No documents uploaded.</div>'}</div></div>`);
  }

  function attendancePanel() {
    return panel('attendance', `<div class="e360-form-actions"><button class="e360-btn primary" id="openTimeAttendance">Open Time & Attendance Scheduler</button></div><div class="e360-section"><h3>Scheduled Shifts</h3><div class="e360-list">${detail.shifts.length ? detail.shifts.map(shift => `<div class="e360-row"><div><div class="e360-row-title">${dateTime(shift.startTime)} – ${dateTime(shift.endTime)}</div><div class="e360-sub">${esc(shift.location || 'Location not set')} · ${esc(shift.code || 'SHIFT')} · ${esc(shift.payCode || 'REG')}</div></div><span class="e360-badge ${statusClass(shift.status)}">${esc(shift.status)}</span></div>`).join('') : '<div class="e360-row">No scheduled shifts.</div>'}</div></div><div class="e360-section"><h3>Recent Time Card</h3><div class="e360-list">${detail.timecards.length ? detail.timecards.map(entry => `<div class="e360-row"><div><div class="e360-row-title">${dateTime(entry.clockIn)} – ${dateTime(entry.clockOut)}</div><div class="e360-sub">${Number(entry.hours || 0).toFixed(2)} hours · ${esc(entry.source || '')}</div></div><span class="e360-badge ${statusClass(entry.status)}">${esc(entry.status)}</span></div>`).join('') : '<div class="e360-row">No time card entries.</div>'}</div></div><div class="e360-section"><h3>Time Off and Schedule Requests</h3><div class="e360-list">${detail.requests.length ? detail.requests.map(request => `<div class="e360-row"><div><div class="e360-row-title">${esc(request.type)} · ${date(request.startAt)} to ${date(request.endAt)}</div><div class="e360-sub">${esc(request.reason || '')}</div></div><span class="e360-badge ${statusClass(request.status)}">${esc(request.status)}</span></div>`).join('') : '<div class="e360-row">No requests.</div>'}</div></div>`);
  }

  function educationPanel() {
    return panel('education', `<form id="educationAssignForm"><div class="e360-grid three"><label>Course code<input class="e360-input" name="courseCode" placeholder="SH-CAP-101" required></label><label>Course title<input class="e360-input" name="title" required></label><label>Due date<input class="e360-input" name="dueDate" type="date"></label></div><label style="display:block;margin-top:12px">Reason<input class="e360-input" name="reason" value="Required employee education"></label><div class="e360-form-actions"><button class="e360-btn primary" type="submit">Assign Education</button><button class="e360-btn" type="button" id="openEducationPortal">Open Education Portal</button></div></form><div class="e360-section"><h3>Assignments and Completions</h3><div class="e360-list">${detail.education.length ? detail.education.map(item => `<div class="e360-row"><div><div class="e360-row-title">${esc(item.title || item.courseCode)}</div><div class="e360-sub">${esc(item.courseCode)} · Assigned ${date(item.assignedAt)} · Due ${date(item.dueDate)} · Completed ${date(item.completedAt)} · Expires ${date(item.expiresAt)}</div></div><span class="e360-badge ${statusClass(item.status)}">${esc(item.status)}</span></div>`).join('') : '<div class="e360-row">No education assignments.</div>'}</div></div>`);
  }

  function communicationsPanel() {
    return panel('communications', `<form id="employeeEmailForm"><div class="e360-grid"><label>Subject<input class="e360-input" name="subject" required></label><label>Recipient<input class="e360-input" value="${esc(detail.employee.email || '')}" disabled></label></div><label style="display:block;margin-top:12px">Message<textarea class="e360-textarea" name="body" required></textarea></label><div class="e360-form-actions"><button class="e360-btn primary" type="submit">Send and Log Email</button></div></form><div class="e360-section"><h3>Email History</h3><div class="e360-list">${detail.communications.length ? detail.communications.map(message => `<div class="e360-row"><div><div class="e360-row-title">${esc(message.subject)}</div><div class="e360-sub">${esc(message.kind)} · ${esc(message.recipient)} · ${dateTime(message.sentAt || message.createdAt)}${message.errorMessage ? ` · ${esc(message.errorMessage)}` : ''}</div><div style="margin-top:6px;white-space:pre-wrap">${esc(message.body)}</div></div><div class="e360-row-actions"><span class="e360-badge ${statusClass(message.status)}">${esc(message.status)}</span><button class="e360-btn" data-resend-email="${message.id}">Resend</button></div></div>`).join('') : '<div class="e360-row">No emails sent from Employee 360.</div>'}</div></div>`);
  }

  function accessPanel(e,d,p) {
    const locked = d.lockedUntil && new Date(d.lockedUntil).getTime() > Date.now();
    return panel('access', `${e.isOwner ? '<div class="e360-alert"><strong>Protected owner account.</strong> Password reset, suspension, termination, role changes, and access revocation are intentionally unavailable here.</div>' : ''}<div class="e360-card-grid"><div class="e360-card"><h4>Portal Credential</h4><strong class="metric">${d.portalCredentialExists?'READY':'MISSING'}</strong><div class="e360-sub">Username: ${esc(d.username || 'Not provisioned')}</div></div><div class="e360-card"><h4>Login Health</h4><strong class="metric">${locked?'LOCKED':'OK'}</strong><div class="e360-sub">Failed attempts: ${Number(d.failedLoginAttempts || 0)}</div></div><div class="e360-card"><h4>Last Sign-in</h4><strong>${dateTime(d.lastSignedInAt)}</strong></div><div class="e360-card"><h4>Password</h4><strong>${d.mustChangePassword?'Change required':'Current'}</strong></div></div><div class="e360-section"><h3>Account Troubleshooting</h3><div class="e360-form-actions"><button class="e360-btn" id="syncEmployeeIdentity">Sync Name Across Portals</button><button class="e360-btn" id="refreshEmployeeHealth">Run Account Health Check</button><button class="e360-btn" id="unlockEmployee" ${p.canResetAccess?'':'disabled'}>Unlock Account</button><button class="e360-btn warn" id="resetEmployeePassword" ${p.canResetAccess?'':'disabled'}>Force Password Reset</button><button class="e360-btn primary" id="resendEmployeeAccess" ${p.canResetAccess?'':'disabled'}>Resend Portal Access Email</button></div></div><div class="e360-section"><h3>Employment Access</h3><div class="e360-form-actions">${['ACTIVE','LEAVE','SUSPENDED','TERMINATED'].map(value => `<button class="e360-btn ${value==='ACTIVE'?'primary':value==='TERMINATED'?'danger':'warn'}" data-employment-status="${value}" ${e.isOwner?'disabled':''}>Set ${value}</button>`).join('')}</div></div><div class="e360-section"><h3>System Integration Diagnostics</h3><div class="e360-list">${Object.entries(d).map(([key,value]) => `<div class="e360-row"><strong>${esc(key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()))}</strong><span>${esc(value == null ? '—' : String(value))}</span></div>`).join('')}</div></div>`);
  }

  function auditPanel() {
    return panel('audit', `<div class="e360-section"><h3>Employee Management Audit Trail</h3><div class="e360-list">${detail.actions.length ? detail.actions.map(action => `<div class="e360-row"><div><div class="e360-row-title">${esc(action.action.replaceAll('_',' '))}</div><div class="e360-sub">${dateTime(action.createdAt)} · Actor ${esc(action.actorId)}</div><pre style="white-space:pre-wrap;margin:6px 0 0;font-size:12px">${esc(JSON.stringify(action.details || {}, null, 2))}</pre></div></div>`).join('') : '<div class="e360-row">No employee-management actions recorded.</div>'}</div></div>`);
  }

  function formObject(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    for (const key of ['hireDate','terminationDate','dueDate','issueDate','expirationDate']) if (!data[key]) data[key] = null;
    return data;
  }

  function wireOverview() {
    const form = document.getElementById('employeeProfileForm');
    if (form) form.onsubmit = async event => {
      event.preventDefault();
      const body = formObject(form);
      if (detail.employee.isOwner) body.employmentStatus = 'ACTIVE';
      try { await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/profile`, {method:'PATCH',body:JSON.stringify(body)}); await reloadDetail('Employee profile saved.'); }
      catch (error) { alert(error.message); }
    };
    const roleButton = document.getElementById('changeEmployeeRole');
    if (roleButton) roleButton.onclick = async () => {
      if (!confirm('Change this employee’s system role and permissions?')) return;
      try { await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/role`, {method:'PATCH',body:JSON.stringify({role:document.getElementById('employeeRole').value})}); await reloadDetail('System role updated.'); }
      catch (error) { alert(error.message); }
    };
  }

  function wireDocuments() {
    const form = document.getElementById('documentUploadForm');
    if (form) form.onsubmit = async event => {
      event.preventDefault();
      const values = formObject(form);
      const file = form.elements.file.files[0];
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) return alert('Files are limited to 15 MB.');
      try {
        values.fileName = file.name;
        values.mimeType = file.type || 'application/octet-stream';
        values.contentBase64 = await readFileBase64(file);
        delete values.file;
        await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/documents`, {method:'POST',body:JSON.stringify(values)});
        await reloadDetail('Document uploaded.');
      } catch (error) { alert(error.message); }
    };
    document.getElementById('printCompliance')?.addEventListener('click', printFolder);
    document.querySelectorAll('[data-download-document]').forEach(button => button.onclick = () => downloadDocument(button.dataset.downloadDocument));
    document.querySelectorAll('[data-archive-document]').forEach(button => button.onclick = async () => {
      if (!confirm('Archive this document?')) return;
      try { await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/documents/${encodeURIComponent(button.dataset.archiveDocument)}`, {method:'DELETE'}); await reloadDetail('Document archived.'); }
      catch (error) { alert(error.message); }
    });
    document.querySelectorAll('[data-edit-document]').forEach(button => button.onclick = async () => {
      const documentRecord = detail.documents.find(item => item.id === button.dataset.editDocument);
      const issueDate = prompt('Issue date (YYYY-MM-DD). Leave blank for none.', documentRecord.issueDate ? String(documentRecord.issueDate).slice(0,10) : '');
      if (issueDate === null) return;
      const expirationDate = prompt('Expiration date (YYYY-MM-DD). Leave blank for none.', documentRecord.expirationDate ? String(documentRecord.expirationDate).slice(0,10) : '');
      if (expirationDate === null) return;
      try { await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/documents/${encodeURIComponent(documentRecord.id)}`, {method:'PATCH',body:JSON.stringify({issueDate:issueDate||null,expirationDate:expirationDate||null})}); await reloadDetail('Document dates updated.'); }
      catch (error) { alert(error.message); }
    });
  }

  function wireAttendance() {
    document.getElementById('openTimeAttendance')?.addEventListener('click', () => {
      localStorage.setItem('sulandra:selected-employee-id', detail.employee.id);
      location.href = `${STATIC}/time-attendance.html#admin`;
    });
  }

  function wireEducation() {
    const form = document.getElementById('educationAssignForm');
    if (form) form.onsubmit = async event => {
      event.preventDefault();
      try { await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/education`, {method:'POST',body:JSON.stringify(formObject(form))}); await reloadDetail('Education assigned.'); }
      catch (error) { alert(error.message); }
    };
    document.getElementById('openEducationPortal')?.addEventListener('click', () => location.href = `${STATIC}/education-portal.html`);
  }

  function wireCommunications() {
    const form = document.getElementById('employeeEmailForm');
    if (form) form.onsubmit = async event => {
      event.preventDefault();
      try { await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/email`, {method:'POST',body:JSON.stringify(formObject(form))}); form.reset(); await reloadDetail('Email sent and logged.'); }
      catch (error) { alert(error.message); }
    };
    document.querySelectorAll('[data-resend-email]').forEach(button => button.onclick = async () => {
      if (!confirm('Resend this email to the employee?')) return;
      try { await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/communications/${encodeURIComponent(button.dataset.resendEmail)}/resend`, {method:'POST'}); await reloadDetail('Email resent and logged.'); }
      catch (error) { alert(error.message); }
    });
  }

  function wireAccess() {
    document.getElementById('syncEmployeeIdentity')?.addEventListener('click', async () => {
      try { await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/access/sync`, {method:'POST'}); await reloadDetail('Identity synchronized across portals.'); }
      catch (error) { alert(error.message); }
    });
    document.getElementById('refreshEmployeeHealth')?.addEventListener('click', () => reloadDetail('Account health check completed.'));
    document.getElementById('unlockEmployee')?.addEventListener('click', async () => {
      try { await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/access/unlock`, {method:'POST'}); await reloadDetail('Employee account unlocked.'); }
      catch (error) { alert(error.message); }
    });
    document.getElementById('resetEmployeePassword')?.addEventListener('click', async () => {
      const sendEmail = confirm('Select OK to email the temporary password. Select Cancel to generate it without sending an email.');
      try {
        const result = await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/access/reset`, {method:'POST',body:JSON.stringify({sendEmail})});
        alert(`Temporary password: ${result.temporaryPassword}\nUsername: ${result.username}\n\nThis password is shown only now.`);
        await reloadDetail('Password reset completed.');
      } catch (error) { alert(error.message); }
    });
    document.getElementById('resendEmployeeAccess')?.addEventListener('click', async () => {
      if (!confirm('Generate a new temporary password and send a fresh portal-access email?')) return;
      try { const result = await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/access/resend`, {method:'POST'}); alert(`Access email sent. Temporary password: ${result.temporaryPassword}`); await reloadDetail('Portal access email resent.'); }
      catch (error) { alert(error.message); }
    });
    document.querySelectorAll('[data-employment-status]').forEach(button => button.onclick = async () => {
      const status = button.dataset.employmentStatus;
      if (!confirm(`Set this employee’s status to ${status}?`)) return;
      try { await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/status`, {method:'PATCH',body:JSON.stringify({status})}); await reloadDetail(`Employment status changed to ${status}.`); }
      catch (error) { alert(error.message); }
    });
  }

  async function reloadDetail(message = '') {
    const id = detail.employee.id;
    detail = await api(`/api/admin/employees/${encodeURIComponent(id)}`);
    renderProfile();
    if (message) alert(message);
  }

  function readFileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',').pop());
      reader.onerror = () => reject(reader.error || new Error('File could not be read'));
      reader.readAsDataURL(file);
    });
  }

  async function downloadDocument(documentId) {
    try {
      const response = await api(`/api/admin/employees/${encodeURIComponent(detail.employee.id)}/documents/${encodeURIComponent(documentId)}/download`, {raw:true,accept:'*/*'});
      const blob = await response.blob();
      const docMeta = detail.documents.find(item => item.id === documentId);
      const link = window.document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = docMeta?.fileName || 'employee-document';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) { alert(error.message); }
  }

  function printFolder() {
    if (!detail) return;
    const employee = detail.employee;
    const win = window.open('', '_blank');
    if (!win) return alert('Allow pop-ups to print the employee folder.');
    const documents = detail.documents.map(item => `<tr><td>${esc(item.category)}</td><td>${esc(item.title)}</td><td>${date(item.issueDate)}</td><td>${date(item.expirationDate)}</td><td>${item.daysUntilExpiration == null ? 'No expiration' : Number(item.daysUntilExpiration) < 0 ? 'Expired' : `${item.daysUntilExpiration} days remaining`}</td></tr>`).join('');
    const education = detail.education.map(item => `<tr><td>${esc(item.courseCode)}</td><td>${esc(item.title)}</td><td>${esc(item.status)}</td><td>${date(item.dueDate)}</td><td>${date(item.completedAt)}</td><td>${date(item.expiresAt)}</td></tr>`).join('');
    const shifts = detail.shifts.slice(0,40).map(item => `<tr><td>${dateTime(item.startTime)}</td><td>${dateTime(item.endTime)}</td><td>${esc(item.location || '')}</td><td>${esc(item.status || '')}</td></tr>`).join('');
    win.document.write(`<!doctype html><html><head><title>${esc(employee.displayName)} Employee Folder</title><style>body{font-family:Arial,sans-serif;color:#172533;margin:32px}h1,h2{color:#075493}table{width:100%;border-collapse:collapse;margin:12px 0 28px}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#eaf2f8}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px}.small{font-size:12px;color:#666}@media print{button{display:none}}</style></head><body><h1>Sulandra Health Employee Folder</h1><p class="small">Generated ${dateTime(new Date())}</p><h2>${esc(employee.displayName)}</h2><div class="meta"><div><b>Email:</b> ${esc(employee.email || '')}</div><div><b>Role:</b> ${esc(roleLabel(employee.role))}</div><div><b>Job title:</b> ${esc(employee.jobTitle || '')}</div><div><b>Department:</b> ${esc(employee.department || '')}</div><div><b>Employee number:</b> ${esc(employee.employeeNumber || '')}</div><div><b>Status:</b> ${esc(employee.employmentStatus || '')}</div><div><b>Hire date:</b> ${date(employee.hireDate)}</div><div><b>Phone:</b> ${esc(employee.phone || '')}</div></div><h2>Documents and Compliance</h2><table><thead><tr><th>Category</th><th>Document</th><th>Issued</th><th>Expires</th><th>Status</th></tr></thead><tbody>${documents || '<tr><td colspan="5">No documents</td></tr>'}</tbody></table><h2>Education</h2><table><thead><tr><th>Code</th><th>Course</th><th>Status</th><th>Due</th><th>Completed</th><th>Expires</th></tr></thead><tbody>${education || '<tr><td colspan="6">No education records</td></tr>'}</tbody></table><h2>Recent and Upcoming Schedule</h2><table><thead><tr><th>Start</th><th>End</th><th>Location</th><th>Status</th></tr></thead><tbody>${shifts || '<tr><td colspan="4">No shifts</td></tr>'}</tbody></table><h2>HR Notes</h2><p style="white-space:pre-wrap">${esc(employee.notes || '')}</p><button onclick="window.print()">Print / Save as PDF</button><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
    win.document.close();
  }

  function scheduleInstall() {
    if (installScheduled) return;
    installScheduled = true;
    requestAnimationFrame(() => { installScheduled = false; install().catch(error => console.error('[employee360]', error)); });
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', scheduleInstall) : scheduleInstall();
  new MutationObserver(scheduleInstall).observe(document.body, {childList:true,subtree:true});
})();
