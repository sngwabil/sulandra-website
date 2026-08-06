(() => {
  'use strict';
  if (!/\/employee-portal\.html$/i.test(location.pathname)) return;

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const token = () => sessionStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra_token')
    || localStorage.getItem('token')
    || localStorage.getItem('accessToken')
    || '';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const date = (value) => value ? new Date(value).toLocaleDateString() : '—';
  const bytes = (value) => {
    const number = Number(value || 0);
    if (number < 1024) return `${number} B`;
    if (number < 1024 * 1024) return `${(number / 1024).toFixed(1)} KB`;
    return `${(number / 1024 / 1024).toFixed(1)} MB`;
  };

  async function api(path, options = {}) {
    const auth = token();
    if (!auth) throw new Error('Sign in to the Employee Portal to view your approved employee file.');
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${auth}`, Accept: options.accept || 'application/json', ...(options.headers || {}) },
    });
    if (options.raw) {
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Request failed');
      return response;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body.data ?? body;
  }

  function addStyles() {
    if (document.getElementById('employeeSelfServiceStyles')) return;
    const style = document.createElement('style');
    style.id = 'employeeSelfServiceStyles';
    style.textContent = `
      #myEmployeeFile .self-file-summary{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:10px;margin:12px 0}
      #myEmployeeFile .self-file-stat{border:1px solid var(--border);border-radius:8px;padding:11px;background:#fbfdff}
      #myEmployeeFile .self-file-stat strong{display:block;color:var(--primary);font-size:18px}
      #myEmployeeFile .self-file-section{margin-top:16px}#myEmployeeFile .self-file-section h3{color:var(--primary);margin-bottom:8px}
      #myEmployeeFile .self-file-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:11px;border-top:1px solid var(--border)}
      #myEmployeeFile .self-file-row:first-child{border-top:0}#myEmployeeFile .self-file-list{border:1px solid var(--border);border-radius:9px;overflow:hidden;background:#fff}
      #myEmployeeFile .self-file-sub{font-size:12px;color:var(--muted);margin-top:3px}#myEmployeeFile .self-file-actions{display:flex;gap:7px;flex-wrap:wrap}
      #myEmployeeFile .self-file-alert{border:1px solid #cfe4fb;background:#eef6ff;color:#0a4f88;border-radius:8px;padding:10px 12px;margin:10px 0}
      @media(max-width:800px){#myEmployeeFile .self-file-summary{grid-template-columns:1fr}#myEmployeeFile .self-file-row{flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function installShell() {
    if (document.getElementById('myEmployeeFile')) return document.getElementById('myEmployeeFile');
    const grid = document.querySelector('main .grid');
    if (!grid) return null;
    const section = document.createElement('section');
    section.className = 'card';
    section.id = 'myEmployeeFile';
    section.style.gridColumn = '1 / -1';
    section.innerHTML = '<h2>My Employee File <span class="hint">Approved self-service records</span></h2><div class="self-file-alert">Only records that Human Resources has approved for employee self-service are shown here. Confidential management records remain restricted.</div><div id="myEmployeeFileContent">Loading your approved employee records…</div>';
    grid.appendChild(section);

    const nav = document.querySelector('.nav-links');
    if (nav && !nav.querySelector('[href="#myEmployeeFile"]')) {
      const item = document.createElement('li');
      item.innerHTML = '<a href="#myEmployeeFile">My Employee File</a>';
      nav.appendChild(item);
    }
    const quickActions = document.querySelector('.quick-actions');
    if (quickActions && !quickActions.querySelector('[href="#myEmployeeFile"]')) {
      const link = document.createElement('a');
      link.className = 'qa';
      link.href = '#myEmployeeFile';
      link.textContent = 'My Employee File';
      quickActions.appendChild(link);
    }
    return section;
  }

  async function downloadDocument(documentId, fileName) {
    try {
      const response = await api(`/api/employee/me/documents/${encodeURIComponent(documentId)}/download`, { raw: true, accept: '*/*' });
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName || 'employee-document';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
    } catch (error) { alert(error.message); }
  }

  function render(data) {
    const content = document.getElementById('myEmployeeFileContent');
    if (!content) return;
    const employee = data.employee || {};
    const documents = Array.isArray(data.documents) ? data.documents : [];
    const education = Array.isArray(data.education) ? data.education : [];
    content.innerHTML = `
      <div class="self-file-summary">
        <div class="self-file-stat"><span>Employee</span><strong>${esc(employee.displayName || employee.email || 'Employee')}</strong><span class="self-file-sub">${esc(employee.jobTitle || employee.role || '')}</span></div>
        <div class="self-file-stat"><span>Approved Documents</span><strong>${documents.length}</strong><span class="self-file-sub">Visible to you</span></div>
        <div class="self-file-stat"><span>Education Records</span><strong>${education.length}</strong><span class="self-file-sub">Assignments and completions</span></div>
      </div>
      <div class="self-file-section"><h3>My Profile</h3><div class="self-file-list">
        <div class="self-file-row"><span>Employee number</span><strong>${esc(employee.employeeNumber || '—')}</strong></div>
        <div class="self-file-row"><span>Department</span><strong>${esc(employee.department || '—')}</strong></div>
        <div class="self-file-row"><span>Employment status</span><strong>${esc(employee.employmentStatus || '—')}</strong></div>
        <div class="self-file-row"><span>Hire date</span><strong>${esc(date(employee.hireDate))}</strong></div>
        <div class="self-file-row"><span>Contact information</span><strong>${esc(employee.phone || employee.personalEmail || employee.email || '—')}</strong></div>
      </div></div>
      <div class="self-file-section"><h3>Approved Documents</h3><div class="self-file-list">${documents.length ? documents.map((documentRecord) => `<div class="self-file-row"><div><strong>${esc(documentRecord.title)}</strong><div class="self-file-sub">${esc(documentRecord.category)} · ${esc(documentRecord.fileName)} · ${esc(bytes(documentRecord.fileSizeBytes))}<br>Issued ${esc(date(documentRecord.issueDate))} · Expires ${esc(date(documentRecord.expirationDate))}</div></div><div class="self-file-actions"><button class="btn btn-secondary" data-self-document="${esc(documentRecord.id)}" data-file-name="${esc(documentRecord.fileName)}">Download</button></div></div>`).join('') : '<div class="self-file-row">No documents have been approved for employee self-service.</div>'}</div></div>
      <div class="self-file-section"><h3>Education and Training</h3><div class="self-file-list">${education.length ? education.map((assignment) => `<div class="self-file-row"><div><strong>${esc(assignment.title || assignment.courseCode)}</strong><div class="self-file-sub">${esc(assignment.courseCode || '')} · Due ${esc(date(assignment.dueDate))} · Completed ${esc(date(assignment.completedAt))} · Expires ${esc(date(assignment.expiresAt))}</div></div><span class="badge ${String(assignment.status).toUpperCase() === 'COMPLETED' ? 'green' : 'orange'}">${esc(assignment.status || 'ASSIGNED')}</span></div>`).join('') : '<div class="self-file-row">No education assignments are available.</div>'}</div></div>`;
    content.querySelectorAll('[data-self-document]').forEach((button) => {
      button.onclick = () => downloadDocument(button.dataset.selfDocument, button.dataset.fileName);
    });
  }

  async function load() {
    const shell = installShell();
    if (!shell) return;
    try { render(await api('/api/employee/me/360')); }
    catch (error) {
      const content = document.getElementById('myEmployeeFileContent');
      if (content) content.innerHTML = `<div class="self-file-alert" style="border-color:#e2b4aa;background:#fff0ed;color:#8c2b1d">${esc(error.message)}</div>`;
    }
  }

  addStyles();
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', load) : load();
})();
