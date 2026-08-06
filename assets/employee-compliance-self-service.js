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
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => value ? new Date(value).toLocaleDateString() : '—';
  const statusClass = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  async function api(path, options = {}) {
    const auth = token();
    if (!auth) throw new Error('Sign in to view your compliance requirements.');
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${auth}`, ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body.data ?? body;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('The selected file could not be read.'));
      reader.readAsDataURL(file);
    });
  }

  function addStyles() {
    if (document.getElementById('employeeComplianceSelfStyles')) return;
    const style = document.createElement('style');
    style.id = 'employeeComplianceSelfStyles';
    style.textContent = `
      #myCompliance{grid-column:1/-1}.self-compliance-summary{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:10px;margin:12px 0}.self-compliance-stat{border:1px solid var(--border);border-radius:8px;padding:11px;background:#fbfdff}.self-compliance-stat strong{display:block;color:var(--primary);font-size:24px}.self-compliance-list{border:1px solid var(--border);border-radius:9px;overflow:hidden}.self-compliance-item{padding:13px;border-top:1px solid var(--border);background:#fff}.self-compliance-item:first-child{border-top:0}.self-compliance-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.self-compliance-status{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;background:#eef2f6;color:#38536b}.self-compliance-status.overdue,.self-compliance-status.missing{background:#fde1dc;color:#9e2415}.self-compliance-status.duesoon,.self-compliance-status.notstarted,.self-compliance-status.inprogress{background:#fff0c4;color:#705100}.self-compliance-status.compliant,.self-compliance-status.exempt{background:#def4e5;color:#176b35}.self-compliance-sub{font-size:12px;color:var(--muted);margin-top:4px}.self-compliance-action{margin-top:10px;padding:11px;border:1px solid #cfe4fb;background:#f5faff;border-radius:8px}.self-compliance-action label{margin-top:7px}.self-compliance-alert{border:1px solid #cfe4fb;background:#eef6ff;color:#0a4f88;border-radius:8px;padding:10px 12px;margin:10px 0}.self-compliance-alert.danger{border-color:#e2b4aa;background:#fff0ed;color:#8c2b1d}.self-compliance-progress{height:10px;background:#e8eef3;border-radius:999px;overflow:hidden;margin-top:8px}.self-compliance-progress span{display:block;height:100%;background:var(--secondary)}
      @media(max-width:800px){.self-compliance-summary{grid-template-columns:1fr 1fr}.self-compliance-head{flex-direction:column}}@media(max-width:500px){.self-compliance-summary{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (document.getElementById('myCompliance')) return document.getElementById('myCompliance');
    const grid = document.querySelector('main .grid');
    if (!grid) return null;
    const section = document.createElement('section');
    section.className = 'card';
    section.id = 'myCompliance';
    section.innerHTML = '<h2>My Compliance <span class="hint">Required documents, education, attestations, and renewal dates</span></h2><div class="self-compliance-alert">Employee 360 automatically tracks your approved records and sends reminders before requirements expire or become overdue.</div><div id="myComplianceContent">Loading your compliance requirements…</div>';
    const employeeFile = document.getElementById('myEmployeeFile');
    if (employeeFile) employeeFile.insertAdjacentElement('beforebegin', section); else grid.appendChild(section);
    const nav = document.querySelector('.nav-links');
    if (nav && !nav.querySelector('[href="#myCompliance"]')) {
      const item = document.createElement('li'); item.innerHTML = '<a href="#myCompliance">My Compliance</a>'; nav.appendChild(item);
    }
    const quick = document.querySelector('.quick-actions');
    if (quick && !quick.querySelector('[href="#myCompliance"]')) {
      const link = document.createElement('a'); link.className='qa'; link.href='#myCompliance'; link.textContent='My Compliance'; quick.prepend(link);
    }
    return section;
  }

  function actionMarkup(item) {
    if (item.status === 'COMPLIANT' || item.status === 'EXEMPT') return '';
    if (item.requirementType === 'EDUCATION') return `<div class="self-compliance-action"><strong>Required action:</strong> Complete the assigned course in the Sulandra Health Learning Center.<div class="btn-row"><a class="btn btn-primary" href="${esc(item.educationUrl || 'education-portal.html')}">Open Learning Center</a></div></div>`;
    if (item.requirementType === 'DOCUMENT' && item.allowEmployeeUpload) return `<div class="self-compliance-action"><strong>Submit or renew your ${esc(item.documentCategory || 'required document')}</strong><form data-compliance-upload="${esc(item.id)}"><label>Choose file<input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt" required></label><div class="row"><label>Issue date<input type="date" name="issueDate"></label><label>Expiration date<input type="date" name="expirationDate"></label></div><label>Notes<input type="text" name="notes" placeholder="Optional note for Human Resources"></label><div class="btn-row"><button class="btn btn-primary" type="submit">Submit for HR Review</button></div></form></div>`;
    if (item.requirementType === 'ATTESTATION' && item.allowEmployeeAttestation) return `<div class="self-compliance-action"><strong>Electronic attestation required</strong><p style="margin-top:7px">${esc(item.attestationText || item.description || '')}</p><form data-compliance-attest="${esc(item.id)}"><label>Type your full legal name<input name="typedName" required minlength="2"></label><label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" name="accepted" required style="width:auto;margin-top:4px"> I have read, understand, and attest that this statement is accurate.</label><div class="btn-row"><button class="btn btn-primary" type="submit">Sign and Attest</button></div></form></div>`;
    return '<div class="self-compliance-action"><strong>Required action:</strong> Contact the Sulandra Health Human Resources Department to complete or correct this requirement.</div>';
  }

  function render(data) {
    const content = document.getElementById('myComplianceContent');
    if (!content) return;
    const summary = data.summary || {};
    const assignments = Array.isArray(data.assignments) ? data.assignments : [];
    const completed = Number(summary.compliant || 0);
    const total = Number(summary.total || 0);
    const percent = total ? Math.round(completed / total * 100) : 100;
    content.innerHTML = `<div class="self-compliance-summary"><div class="self-compliance-stat"><span>Total Requirements</span><strong>${total}</strong></div><div class="self-compliance-stat"><span>Compliant</span><strong>${completed}</strong></div><div class="self-compliance-stat"><span>Due Soon</span><strong>${Number(summary.dueSoon || 0)}</strong></div><div class="self-compliance-stat"><span>Overdue / Action Required</span><strong>${Number(summary.overdue || 0)} / ${Number(summary.actionRequired || 0)}</strong></div></div><div class="self-compliance-progress"><span style="width:${Math.max(0,Math.min(100,percent))}%"></span></div><p class="hint" style="margin-top:6px">${percent}% currently compliant based on approved Employee 360 evidence.</p><div class="self-compliance-list" style="margin-top:14px">${assignments.length ? assignments.map(item => `<article class="self-compliance-item"><div class="self-compliance-head"><div><strong>${esc(item.title)}</strong><div class="self-compliance-sub">${esc(item.code)} · ${esc(item.requirementType)} · Due ${date(item.dueDate)} · Completed ${date(item.completedAt)} · Expires ${date(item.expiresAt)}</div></div><span class="self-compliance-status ${statusClass(item.status)}">${esc(item.status)}</span></div>${item.description ? `<p style="margin-top:8px">${esc(item.description)}</p>` : ''}<div class="self-compliance-sub">${esc(item.evidenceSummary || 'No approved evidence is currently connected to this requirement.')}${item.daysUntilDue != null ? `<br>${item.daysUntilDue < 0 ? `${Math.abs(item.daysUntilDue)} day(s) overdue` : `${item.daysUntilDue} day(s) remaining`}` : ''}</div>${actionMarkup(item)}</article>`).join('') : '<article class="self-compliance-item">No active compliance requirements are assigned to you.</article>'}</div>`;
    content.querySelectorAll('[data-compliance-upload]').forEach(form => form.onsubmit = submitUpload);
    content.querySelectorAll('[data-compliance-attest]').forEach(form => form.onsubmit = submitAttestation);
  }

  async function submitUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.file.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { alert('Employee documents are limited to 15 MB each.'); return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Uploading…';
    try {
      await api(`/api/employee/me/compliance/${encodeURIComponent(form.dataset.complianceUpload)}/upload`, {method:'POST',body:JSON.stringify({fileName:file.name,mimeType:file.type||'application/octet-stream',contentBase64:await fileToDataUrl(file),issueDate:form.elements.issueDate.value||null,expirationDate:form.elements.expirationDate.value||null,notes:form.elements.notes.value||'Submitted by employee for compliance review'})});
      alert('Your document was securely submitted to Employee 360 and is awaiting Human Resources review.');
      await load();
    } catch (error) { alert(error.message); }
    finally { button.disabled=false; button.textContent='Submit for HR Review'; }
  }

  async function submitAttestation(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled=true; button.textContent='Recording…';
    try {
      await api(`/api/employee/me/compliance/${encodeURIComponent(form.dataset.complianceAttest)}/attest`, {method:'POST',body:JSON.stringify({typedName:form.elements.typedName.value,accepted:true})});
      alert('Your electronic attestation was recorded in Employee 360.');
      await load();
    } catch (error) { alert(error.message); }
    finally { button.disabled=false; button.textContent='Sign and Attest'; }
  }

  async function load() {
    if (!install()) return;
    try { render(await api('/api/employee/me/compliance')); }
    catch (error) {
      const content = document.getElementById('myComplianceContent');
      if (content) content.innerHTML = `<div class="self-compliance-alert danger">${esc(error.message)}</div>`;
    }
  }

  addStyles();
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', load) : load();
})();
