(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const state = {
    detail: null,
    detailEmployeeId: null,
    profiles: null,
    grants: null,
    events: null,
    enhancing: false,
    scheduled: false,
  };

  const token = () => sessionStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra_token')
    || localStorage.getItem('token')
    || localStorage.getItem('accessToken')
    || '';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const dateTime = (value) => value ? new Date(value).toLocaleString() : '—';

  async function api(path, options = {}) {
    const auth = token();
    if (!auth) throw new Error('Your administrator session is unavailable. Sign in again.');
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${auth}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body.data ?? body;
  }

  function addStyles() {
    if (document.getElementById('employee360PermissionStyles')) return;
    const style = document.createElement('style');
    style.id = 'employee360PermissionStyles';
    style.textContent = `
      .e360-access-banner{border:1px solid #9cc6e5;background:#eef8ff;border-radius:8px;padding:11px 12px;margin:0 0 14px;color:#123d63}
      .e360-access-banner strong{color:#075493}.e360-access-banner .profiles{font-size:12px;margin-top:5px;color:#4e6274}
      .e360-restricted{border:1px solid #e2b4aa;background:#fff0ed;border-radius:8px;padding:10px 12px;color:#8c2b1d;margin-bottom:12px}
      .e360-sensitive-badge{display:inline-flex;border-radius:999px;padding:3px 7px;font-size:11px;font-weight:900;margin:4px 4px 0 0;background:#e8eef5;color:#264762}
      .e360-sensitive-badge.medical{background:#e9e2ff;color:#523498}.e360-sensitive-badge.background{background:#fff0c4;color:#705100}
      .e360-sensitive-badge.disciplinary{background:#fde1dc;color:#9e2415}.e360-sensitive-badge.identity{background:#e0f0ff;color:#075493}
      .e360-sensitive-badge.compensation{background:#dff5e7;color:#176b35}.e360-sensitive-badge.hr_confidential{background:#f1e4f6;color:#6d2a75}
      .e360-grants{margin-top:18px;border:1px solid #b9cbd9;border-radius:10px;overflow:hidden}.e360-grants-head{background:#0d477d;color:#fff;padding:12px 14px}
      .e360-grants-head h3{margin:0;color:#fff}.e360-grants-body{padding:14px;background:#fbfdff}.e360-grant-grid{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:10px}
      .e360-grant-list{border:1px solid #d2dde6;border-radius:8px;overflow:hidden;margin-top:14px}.e360-grant-row{display:flex;justify-content:space-between;gap:12px;padding:11px;border-top:1px solid #e3e9ee;background:#fff}
      .e360-grant-row:first-child{border-top:0}.e360-grant-title{font-weight:900;color:#173d5d}.e360-grant-meta{font-size:12px;color:#637080;margin-top:3px}.e360-capability-summary{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
      .e360-capability-pill{font-size:11px;border-radius:999px;padding:3px 7px;background:#e8f3fb;color:#075493;font-weight:800}.e360-capability-pill.readonly{background:#f0f1f3;color:#4c5862}
      .e360-access-events{margin-top:16px}.e360-access-event{display:grid;grid-template-columns:110px 1fr auto;gap:10px;padding:9px 10px;border-top:1px solid #e2e8ee}.e360-access-event:first-child{border-top:0}
      .e360-access-decision{font-size:11px;font-weight:900;border-radius:999px;padding:3px 7px}.e360-access-decision.allow{background:#def4e5;color:#176b35}.e360-access-decision.deny{background:#fde1dc;color:#9e2415}
      @media(max-width:900px){.e360-grant-grid{grid-template-columns:1fr}.e360-grant-row{flex-direction:column}.e360-access-event{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function captureApiResponse(url, method, payload) {
    const pathname = (() => {
      try { return new URL(url, location.href).pathname; } catch { return String(url || ''); }
    })();
    if (method === 'GET' && /^\/api\/admin\/employees\/[^/]+$/.test(pathname)) {
      const detail = payload?.data ?? payload;
      if (detail?.employee?.id) {
        state.detail = detail;
        state.detailEmployeeId = detail.employee.id;
        state.grants = null;
        state.events = null;
        scheduleEnhance();
      }
    }
    if (method === 'GET' && pathname === '/api/admin/employees') scheduleEnhance();
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...argumentsList) => {
    const request = argumentsList[0];
    const options = argumentsList[1] || {};
    const method = String(options.method || (request instanceof Request ? request.method : 'GET')).toUpperCase();
    const url = request instanceof Request ? request.url : String(request);
    const response = await originalFetch(...argumentsList);
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json') && url.includes('/api/admin/employees')) {
      response.clone().json().then((payload) => captureApiResponse(url, method, payload)).catch(() => undefined);
    }
    return response;
  };

  function capabilities() {
    return state.detail?.permissions?.employee360?.capabilities || {};
  }

  function has(capability) {
    return capabilities()[capability] === true;
  }

  function currentProfileVisible() {
    return Boolean(document.querySelector('#employeeProfile.open'));
  }

  function fieldLabel(name) {
    const input = document.querySelector(`#employeeProfile [name="${CSS.escape(name)}"]`);
    return input?.closest('label') || input;
  }

  function hideNode(node, hidden = true) {
    if (!node) return;
    node.hidden = hidden;
    node.style.display = hidden ? 'none' : '';
  }

  function disableFields(names, disabled = true) {
    for (const name of names) {
      const field = document.querySelector(`#employeeProfile [name="${CSS.escape(name)}"]`);
      if (field) field.disabled = disabled;
    }
  }

  function permissionBanner() {
    const profile = document.querySelector('#employeeProfile');
    const head = profile?.querySelector('.e360-profile-head');
    if (!profile || !head || profile.querySelector('.e360-access-banner')) return;
    const labels = state.detail?.permissions?.employee360?.profileLabels || [];
    const writable = ['MANAGE_PROFILE', 'MANAGE_DOCUMENTS', 'MANAGE_ATTENDANCE', 'MANAGE_EDUCATION', 'MANAGE_ACCOUNT'].some(has);
    const banner = document.createElement('div');
    banner.className = 'e360-access-banner';
    banner.innerHTML = `<strong>${writable ? 'Scoped management access' : 'Read-only access'}</strong>
      <div>Your actions are limited by role, assigned service locations, employee-specific grants, and record sensitivity.</div>
      <div class="profiles">Effective policy: ${esc(labels.length ? labels.join(' · ') : 'No matching access policy')}</div>`;
    head.insertAdjacentElement('afterend', banner);
  }

  function enforceTabs() {
    const tabCapabilities = {
      overview: 'VIEW_PROFILE',
      documents: 'VIEW_DOCUMENTS',
      attendance: 'VIEW_ATTENDANCE',
      education: 'VIEW_EDUCATION',
      communications: 'VIEW_COMMUNICATIONS',
      access: 'VIEW_ACCOUNT',
      audit: 'VIEW_AUDIT',
    };
    for (const [tab, capability] of Object.entries(tabCapabilities)) {
      document.querySelectorAll(`#employeeProfile [data-tab-button="${tab}"],#employeeProfile [data-tab="${tab}"]`).forEach((node) => hideNode(node, !has(capability)));
    }
    const activeButton = document.querySelector('#employeeProfile .e360-tab.active');
    if (activeButton?.hidden) document.querySelector('#employeeProfile [data-tab-button="overview"]')?.click();
  }

  function enforceOverview() {
    const form = document.getElementById('employeeProfileForm');
    if (!form) return;
    const privateFields = ['personalEmail', 'phone', 'alternatePhone', 'streetAddress', 'city', 'state', 'zipCode', 'emergencyContactName', 'emergencyContactPhone'];
    const employmentFields = ['employmentStatus', 'hireDate', 'terminationDate', 'supervisorId'];
    const notes = form.querySelector('[name="notes"]')?.closest('label');

    for (const name of privateFields) hideNode(fieldLabel(name), !has('VIEW_PRIVATE_PROFILE'));
    hideNode(notes, !has('VIEW_HR_NOTES'));

    if (!has('MANAGE_PROFILE')) disableFields(['displayName', 'employeeNumber', 'jobTitle', 'department'], true);
    if (!has('MANAGE_PRIVATE_PROFILE')) disableFields(privateFields, true);
    if (!has('MANAGE_EMPLOYMENT')) disableFields(employmentFields, true);
    if (!has('VIEW_HR_NOTES')) disableFields(['notes'], true);

    const submit = form.querySelector('button[type="submit"]');
    const maySave = has('MANAGE_PROFILE') || has('MANAGE_PRIVATE_PROFILE') || has('MANAGE_EMPLOYMENT');
    hideNode(submit, !maySave);

    if (!maySave && !form.querySelector('.e360-restricted')) {
      const notice = document.createElement('div');
      notice.className = 'e360-restricted';
      notice.textContent = 'This employee folder is read-only for your current role and assignment scope.';
      form.prepend(notice);
    }
    hideNode(document.getElementById('printEmployeeFolder'), !has('EXPORT_EMPLOYEE_FOLDER'));
  }

  function enhanceDocuments() {
    const form = document.getElementById('documentUploadForm');
    if (!form) return;
    if (!has('MANAGE_DOCUMENTS')) hideNode(form, true);
    if (has('MANAGE_DOCUMENTS') && !form.querySelector('[name="sensitivity"]')) {
      const grid = form.querySelector('.e360-grid');
      const allowed = state.detail?.permissions?.employee360?.allowedDocumentSensitivities || ['GENERAL'];
      const label = document.createElement('label');
      label.innerHTML = `Confidentiality classification<select class="e360-select" name="sensitivity">${allowed.map((value) => `<option value="${esc(value)}">${esc(value.replaceAll('_', ' '))}</option>`).join('')}</select>`;
      grid?.appendChild(label);
      const visibility = document.createElement('label');
      visibility.innerHTML = '<span>Employee self-service visibility</span><span style="display:flex;align-items:center;gap:8px;padding-top:9px"><input type="checkbox" name="employeeVisible" value="true"> Employee may view this approved document</span>';
      grid?.appendChild(visibility);
    }

    const documents = state.detail?.documents || [];
    const rows = [...document.querySelectorAll('#employeeProfile [data-tab="documents"] .e360-list .e360-row')];
    rows.forEach((row, index) => {
      const documentRecord = documents[index];
      if (!documentRecord || row.querySelector('.e360-sensitive-badge')) return;
      const main = row.querySelector('.e360-row-main') || row.firstElementChild;
      const sensitivity = String(documentRecord.sensitivity || 'GENERAL');
      const badge = document.createElement('span');
      badge.className = `e360-sensitive-badge ${sensitivity.toLowerCase()}`;
      badge.textContent = sensitivity.replaceAll('_', ' ');
      main?.appendChild(badge);
      if (documentRecord.employeeVisible) {
        const visible = document.createElement('span');
        visible.className = 'e360-sensitive-badge';
        visible.textContent = 'EMPLOYEE VISIBLE';
        main?.appendChild(visible);
      }
      if (!has('MANAGE_DOCUMENTS')) {
        row.querySelectorAll('[data-edit-document],[data-archive-document]').forEach((button) => hideNode(button, true));
      }
    });
  }

  function enforceOperationalPanels() {
    hideNode(document.getElementById('openTimeAttendance'), !has('MANAGE_ATTENDANCE'));
    hideNode(document.getElementById('educationAssignForm'), !has('MANAGE_EDUCATION'));
    hideNode(document.getElementById('employeeEmailForm'), !has('SEND_COMMUNICATIONS'));

    const manageAccount = has('MANAGE_ACCOUNT');
    for (const id of ['unlockEmployee', 'resetEmployeePassword', 'resendEmployeeAccess', 'syncEmployeeIdentity']) hideNode(document.getElementById(id), !manageAccount);
    document.querySelectorAll('#employeeProfile [data-employment-status]').forEach((button) => hideNode(button, !has('MANAGE_EMPLOYMENT')));
  }

  function scopeLabel(grant) {
    if (grant.scopeType === 'LOCATION') return `Location: ${grant.locationName || grant.locationId || 'Unknown'}`;
    if (grant.scopeType === 'EMPLOYEE') return `Employee: ${grant.employeeName || grant.employeeId || 'Unknown'}`;
    return 'All employees in the organization';
  }

  async function loadGrantData() {
    if (!state.detailEmployeeId) return;
    if (!state.profiles) state.profiles = await api('/api/admin/employee360/access-profiles');
    state.grants = await api(`/api/admin/employee360/access-grants/${encodeURIComponent(state.detailEmployeeId)}`);
  }

  function renderGrantList(container) {
    const grants = state.grants?.grants || [];
    const effective = state.detail?.permissions?.employee360?.policies || [];
    container.innerHTML = `
      <div class="e360-capability-summary">${effective.map((policy) => `<span class="e360-capability-pill ${policy.source === 'ROLE' ? 'readonly' : ''}">${esc(policy.label)} · ${esc(policy.scopeType)}</span>`).join('') || '<span class="e360-capability-pill readonly">No effective Employee 360 policy</span>'}</div>
      <div class="e360-grant-list">${grants.length ? grants.map((grant) => `<div class="e360-grant-row">
        <div><div class="e360-grant-title">${esc(grant.profileLabel || grant.profile)}</div><div class="e360-grant-meta">${esc(scopeLabel(grant))} · ${grant.active ? 'Active' : 'Revoked'} · Created ${esc(dateTime(grant.createdAt))}${grant.expiresAt ? ` · Expires ${esc(dateTime(grant.expiresAt))}` : ''}</div><div class="e360-grant-meta">Reason: ${esc(grant.reason || '')}</div></div>
        ${grant.active && state.profiles?.actorIsOwner ? `<button class="e360-btn danger" data-revoke-grant="${esc(grant.id)}">Revoke</button>` : ''}
      </div>`).join('') : '<div class="e360-grant-row">No explicit access grants. Base access is determined by the employee’s system role and service-location assignments.</div>'}</div>`;
    container.querySelectorAll('[data-revoke-grant]').forEach((button) => {
      button.onclick = async () => {
        if (!confirm('Revoke this Employee 360 access grant?')) return;
        try {
          await api(`/api/admin/employee360/access-grants/${encodeURIComponent(button.dataset.revokeGrant)}`, { method: 'DELETE' });
          state.grants = await api(`/api/admin/employee360/access-grants/${encodeURIComponent(state.detailEmployeeId)}`);
          renderGrantList(container);
        } catch (error) { alert(error.message); }
      };
    });
  }

  function wireGrantForm(section) {
    const form = section.querySelector('#employee360GrantForm');
    const scope = form?.querySelector('[name="scopeType"]');
    const locationLabel = form?.querySelector('[data-scope-location]');
    const employeeLabel = form?.querySelector('[data-scope-employee]');
    const syncScope = () => {
      hideNode(locationLabel, scope?.value !== 'LOCATION');
      hideNode(employeeLabel, scope?.value !== 'EMPLOYEE');
    };
    scope?.addEventListener('change', syncScope);
    syncScope();
    if (form) form.onsubmit = async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      values.actorUserId = state.detailEmployeeId;
      if (values.scopeType !== 'LOCATION') values.locationId = null;
      if (values.scopeType !== 'EMPLOYEE') values.employeeId = null;
      values.expiresAt = values.expiresAt || null;
      try {
        await api('/api/admin/employee360/access-grants', { method: 'POST', body: JSON.stringify(values) });
        form.reset();
        state.grants = await api(`/api/admin/employee360/access-grants/${encodeURIComponent(state.detailEmployeeId)}`);
        renderGrantList(section.querySelector('[data-grant-list]'));
        alert('Employee 360 access grant created.');
      } catch (error) { alert(error.message); }
    };
  }

  async function enhanceAccessGrants() {
    const accessPanel = document.querySelector('#employeeProfile [data-tab="access"]');
    if (!accessPanel || accessPanel.querySelector('.e360-grants')) return;
    const actorIsOwner = Boolean(state.detail?.permissions?.actorIsOwner);
    const targetIsOwner = Boolean(state.detail?.employee?.isOwner);
    const section = document.createElement('section');
    section.className = 'e360-grants';
    section.innerHTML = `<div class="e360-grants-head"><h3>Employee 360 Permission Scope</h3></div><div class="e360-grants-body"><p>Role access is enforced by the backend and narrowed by service-location or employee-specific scope. Confidential record classes require separate authorization.</p><div data-grant-list>Loading access grants…</div></div>`;
    accessPanel.appendChild(section);
    try {
      await loadGrantData();
      const body = section.querySelector('.e360-grants-body');
      if (actorIsOwner && !targetIsOwner) {
        const profiles = state.profiles?.profiles || [];
        const locations = state.profiles?.locations || [];
        const employees = (state.profiles?.employees || []).filter((employee) => employee.id !== state.detailEmployeeId);
        body.insertAdjacentHTML('beforeend', `<form id="employee360GrantForm" style="margin-top:16px"><h4 style="color:#075493;margin:0 0 10px">Grant Functional Access</h4><div class="e360-grant-grid">
          <label>Access profile<select class="e360-select" name="profile" required>${profiles.map((profile) => `<option value="${esc(profile.key)}">${esc(profile.label)}</option>`).join('')}</select></label>
          <label>Scope<select class="e360-select" name="scopeType" required><option value="GLOBAL">All employees</option><option value="LOCATION">One service location</option><option value="EMPLOYEE">One employee</option></select></label>
          <label data-scope-location>Service location<select class="e360-select" name="locationId"><option value="">Select location</option>${locations.map((location) => `<option value="${esc(location.id)}">${esc(location.name)} — ${esc(location.address || '')}</option>`).join('')}</select></label>
          <label data-scope-employee>Specific employee<select class="e360-select" name="employeeId"><option value="">Select employee</option>${employees.map((employee) => `<option value="${esc(employee.id)}">${esc(employee.displayName)} — ${esc(employee.email || '')}</option>`).join('')}</select></label>
          <label>Expiration date (optional)<input class="e360-input" type="date" name="expiresAt"></label>
          <label>Business reason<input class="e360-input" name="reason" minlength="3" required placeholder="Why this access is required"></label>
        </div><div class="e360-form-actions"><button class="e360-btn primary" type="submit">Create Access Grant</button></div></form>`);
      }
      renderGrantList(section.querySelector('[data-grant-list]'));
      wireGrantForm(section);
    } catch (error) {
      section.querySelector('[data-grant-list]').innerHTML = `<div class="e360-restricted">${esc(error.message)}</div>`;
    }
  }

  async function enhanceAccessEvents() {
    const auditPanel = document.querySelector('#employeeProfile [data-tab="audit"]');
    if (!auditPanel || auditPanel.querySelector('.e360-access-events') || !has('VIEW_AUDIT') || !state.detailEmployeeId) return;
    const section = document.createElement('section');
    section.className = 'e360-access-events e360-section';
    section.innerHTML = '<h3>Authorization and Confidential-Record Access</h3><div class="e360-list" data-access-events>Loading authorization events…</div>';
    auditPanel.appendChild(section);
    try {
      state.events = await api(`/api/admin/employee360/access-events?employeeId=${encodeURIComponent(state.detailEmployeeId)}&limit=250`);
      const events = Array.isArray(state.events) ? state.events : [];
      section.querySelector('[data-access-events]').innerHTML = events.length ? events.map((event) => `<div class="e360-access-event"><span class="e360-access-decision ${String(event.decision).toLowerCase()}">${esc(event.decision)}</span><div><strong>${esc(event.action)} · ${esc(event.resourceType)}</strong><div class="e360-sub">${esc(event.actorName || event.actorUserId)} · ${esc(event.capability || 'No capability')} · ${esc(event.sensitivity || 'General')}<br>${esc(event.reason || '')}</div></div><span class="e360-sub">${esc(dateTime(event.createdAt))}</span></div>`).join('') : '<div class="e360-row">No Employee 360 authorization events recorded for this employee.</div>';
    } catch (error) {
      section.querySelector('[data-access-events]').innerHTML = `<div class="e360-row">${esc(error.message)}</div>`;
    }
  }

  async function enhance() {
    if (state.enhancing || !state.detail || !currentProfileVisible()) return;
    state.enhancing = true;
    try {
      addStyles();
      permissionBanner();
      enforceTabs();
      enforceOverview();
      enhanceDocuments();
      enforceOperationalPanels();
      await enhanceAccessGrants();
      await enhanceAccessEvents();
    } finally {
      state.enhancing = false;
    }
  }

  function scheduleEnhance() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(() => {
      state.scheduled = false;
      enhance().catch((error) => console.error('[employee360-permissions]', error));
    });
  }

  addStyles();
  new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', scheduleEnhance, true);
  window.addEventListener('load', scheduleEnhance);
})();
