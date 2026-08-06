(() => {
  const API_BASE = 'https://sulandra-website-production-5fc4.up.railway.app';
  const token = () => localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('adminToken') || '';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const request = async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data;
  };
  const fmt = (v) => v ? new Date(v).toLocaleString() : '—';
  const host = () => document.getElementById('module-employees');
  const state = { data: null };

  function render() {
    const root = host();
    if (!root) return;
    const d = state.data || { assignments: [], corrections: [], signoffs: [], communications: [], security: [], audit: [], metrics: {} };
    root.insertAdjacentHTML('beforeend', `
      <section id="employee360-enterprise-controls" style="margin-top:18px;border-top:1px solid #dbe4ee;padding-top:18px">
        <h2>Enterprise Controls</h2>
        <p class="sub">Service-home assignments, attendance corrections, payroll signoff, unified communications, account security, and tamper-linked auditing.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0">
          <div class="card"><strong>${Number(d.metrics?.blockedAssignments || 0)}</strong><br><small>Blocked assignments</small></div>
          <div class="card"><strong>${Number(d.metrics?.failedCommunications || 0)}</strong><br><small>Failed communications</small></div>
          <div class="card"><strong>${Number(d.metrics?.revocations || 0)}</strong><br><small>Session revocations</small></div>
          <div class="card"><strong>${Number(d.metrics?.deniedActions || 0)}</strong><br><small>Denied actions</small></div>
        </div>
        <details open><summary><strong>Create work assignment</strong></summary>
          <form id="e360-assignment-form" style="display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:10px 0">
            <input name="employeeId" placeholder="Employee ID" required><input name="locationId" placeholder="Location ID" required>
            <input name="clientId" placeholder="Client ID (optional)"><select name="assignmentType"><option>PRIMARY_LOCATION</option><option>SERVICE_HOME</option><option>CLIENT</option><option>PROGRAM</option></select>
            <input name="serviceTypes" placeholder="Service types, comma separated"><input name="reason" placeholder="Reason" required>
            <label><input type="checkbox" name="isHouseManager"> House Manager</label><button type="submit">Create assignment</button>
          </form>
        </details>
        <details><summary><strong>Correct time entry</strong></summary>
          <form id="e360-time-form" style="display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:10px 0">
            <input name="employeeId" placeholder="Employee ID" required><input name="timeEntryId" placeholder="Time entry ID" required>
            <input type="datetime-local" name="clockIn"><input type="datetime-local" name="clockOut">
            <select name="gpsExceptionStatus"><option>NONE</option><option>REVIEWED</option><option>APPROVED</option><option>DENIED</option></select><input name="reason" placeholder="Reason" required><button type="submit">Submit correction</button>
          </form>
        </details>
        <details><summary><strong>Payroll-period signoff</strong></summary>
          <form id="e360-signoff-form" style="display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:10px 0">
            <input name="employeeId" placeholder="Employee ID" required><input type="date" name="periodStart" required><input type="date" name="periodEnd" required>
            <select name="status"><option>PENDING</option><option>APPROVED</option><option>REJECTED</option></select><input name="reason" placeholder="Reason" required><button type="submit">Save signoff</button>
          </form>
        </details>
        <details><summary><strong>Add unified communication</strong></summary>
          <form id="e360-communication-form" style="display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:10px 0">
            <input name="employeeId" placeholder="Employee ID" required><select name="channel"><option>EMAIL</option><option>SMS</option><option>PORTAL</option><option>INTERNAL_NOTE</option><option>SYSTEM</option></select>
            <select name="category"><option>ONBOARDING</option><option>OFFER</option><option>SCHEDULING</option><option>TIME_OFF</option><option>TRAINING</option><option>COMPLIANCE</option><option>POLICY</option><option>CORRECTIVE_ACTION</option><option>SECURITY</option><option>GENERAL</option></select>
            <input name="subject" placeholder="Subject" required><textarea name="body" placeholder="Message or internal note" required></textarea><button type="submit">Add communication</button>
          </form>
        </details>
        <details><summary><strong>Account security action</strong></summary>
          <form id="e360-security-form" style="display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:10px 0">
            <input name="employeeId" placeholder="Employee ID" required><input name="sessionId" placeholder="Session ID or ALL" required>
            <select name="action"><option>REVOKE_ONE</option><option>REVOKE_ALL</option><option>DISABLE_PORTAL</option><option>ENABLE_PORTAL</option><option>REQUIRE_MFA</option><option>CLEAR_MFA</option></select>
            <input name="portal" placeholder="Portal (optional)"><input name="reason" placeholder="Reason" required><button type="submit">Apply security action</button>
          </form>
        </details>
        <details><summary><strong>Recent assignments</strong></summary><div style="overflow:auto"><table><thead><tr><th>Employee</th><th>Type</th><th>Location</th><th>Eligibility</th><th>Created</th></tr></thead><tbody>${d.assignments.slice(0,25).map(r=>`<tr><td>${esc(r.employeeId)}</td><td>${esc(r.assignmentType)}</td><td>${esc(r.locationId)}</td><td>${esc(r.eligibilityStatus)}</td><td>${esc(fmt(r.createdAt))}</td></tr>`).join('') || '<tr><td colspan="5">No assignments yet.</td></tr>'}</tbody></table></div></details>
        <details><summary><strong>Unified communication history</strong></summary><div style="overflow:auto"><table><thead><tr><th>Employee</th><th>Channel</th><th>Category</th><th>Status</th><th>Subject</th></tr></thead><tbody>${d.communications.slice(0,30).map(r=>`<tr><td>${esc(r.employeeId)}</td><td>${esc(r.channel)}</td><td>${esc(r.category)}</td><td>${esc(r.status)}</td><td>${esc(r.subject)}</td></tr>`).join('') || '<tr><td colspan="5">No communications yet.</td></tr>'}</tbody></table></div></details>
        <details><summary><strong>Security and audit history</strong></summary><div style="overflow:auto"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Decision</th><th>Reason</th></tr></thead><tbody>${d.audit.slice(0,30).map(r=>`<tr><td>${esc(fmt(r.createdAt))}</td><td>${esc(r.actorEmail || r.actorUserId)}</td><td>${esc(r.action)}</td><td>${esc(r.decision)}</td><td>${esc(r.reason)}</td></tr>`).join('') || '<tr><td colspan="5">No audit records yet.</td></tr>'}</tbody></table></div></details>
        <p id="e360-enterprise-status" class="sub"></p>
      </section>`);
    bind();
  }
  const status = (message, error = false) => { const el = document.getElementById('e360-enterprise-status'); if (el) { el.textContent = message; el.style.color = error ? '#b42318' : ''; } };
  const submit = (id, path, map) => document.getElementById(id)?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try { status('Saving…'); await request(path, { method: 'POST', body: JSON.stringify(map(form)) }); status('Saved successfully. Refreshing…'); setTimeout(() => location.reload(), 500); }
    catch (error) { status(error.message, true); }
  });
  function bind() {
    submit('e360-assignment-form', '/api/admin/employee360/work-assignments', f => ({ employeeId:f.get('employeeId'), locationId:f.get('locationId'), clientId:f.get('clientId')||null, assignmentType:f.get('assignmentType'), serviceTypes:String(f.get('serviceTypes')||'').split(',').map(v=>v.trim()).filter(Boolean), isHouseManager:f.get('isHouseManager')==='on', reason:f.get('reason') }));
    submit('e360-time-form', '/api/admin/employee360/time-corrections', f => ({ employeeId:f.get('employeeId'), timeEntryId:f.get('timeEntryId'), clockIn:f.get('clockIn')||null, clockOut:f.get('clockOut')||null, gpsExceptionStatus:f.get('gpsExceptionStatus'), reason:f.get('reason') }));
    submit('e360-signoff-form', '/api/admin/employee360/payroll-signoffs', f => ({ employeeId:f.get('employeeId'), periodStart:f.get('periodStart'), periodEnd:f.get('periodEnd'), status:f.get('status'), reason:f.get('reason') }));
    submit('e360-communication-form', '/api/admin/employee360/communications', f => ({ employeeId:f.get('employeeId'), channel:f.get('channel'), category:f.get('category'), subject:f.get('subject'), body:f.get('body'), status:f.get('channel')==='INTERNAL_NOTE'?'INTERNAL':'QUEUED', attachmentRefs:[] }));
    submit('e360-security-form', '/api/admin/employee360/security-actions', f => ({ employeeId:f.get('employeeId'), sessionId:f.get('sessionId'), action:f.get('action'), portal:f.get('portal')||null, reason:f.get('reason') }));
  }
  async function init() {
    if (!host() || document.getElementById('employee360-enterprise-controls')) return;
    try { state.data = await request('/api/admin/employee360/enterprise-gap-dashboard'); render(); }
    catch (error) { console.error(error); }
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
