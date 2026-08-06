(() => {
  const API_BASE = 'https://sulandra-website-production-5fc4.up.railway.app';
  const token = () => localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('employeeToken') || '';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (v) => v ? new Date(v).toLocaleString() : '—';
  const request = async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data;
  };
  const findHost = () => document.querySelector('#employee-dashboard, #portal-main, main, .dashboard-main, .content') || document.body;
  async function init() {
    if (document.getElementById('employee360-enterprise-self-service')) return;
    try {
      const data = await request('/api/employee/me/enterprise360');
      const assignments = data.assignments || [];
      const communications = data.communications || [];
      const security = data.security || [];
      findHost().insertAdjacentHTML('beforeend', `
        <section id="employee360-enterprise-self-service" class="card" style="margin-top:18px">
          <h2>My Assignments, Communications & Security</h2>
          <p class="sub">Your approved service-home and client assignments, communication timeline, and account-security history.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:14px 0">
            <div class="card"><strong>${assignments.length}</strong><br><small>Assignments</small></div>
            <div class="card"><strong>${communications.length}</strong><br><small>Communications</small></div>
            <div class="card"><strong>${security.length}</strong><br><small>Security events</small></div>
          </div>
          <details open><summary><strong>My work assignments</strong></summary><div style="overflow:auto"><table><thead><tr><th>Type</th><th>Location</th><th>Client</th><th>Status</th><th>Effective</th></tr></thead><tbody>${assignments.map(r=>`<tr><td>${esc(r.assignmentType)}</td><td>${esc(r.locationId)}</td><td>${esc(r.clientId || '—')}</td><td>${esc(r.eligibilityStatus)}</td><td>${esc(fmt(r.startsAt || r.createdAt))}</td></tr>`).join('') || '<tr><td colspan="5">No assignments are currently listed.</td></tr>'}</tbody></table></div></details>
          <details><summary><strong>My communication timeline</strong></summary><div style="overflow:auto"><table><thead><tr><th>Date</th><th>Channel</th><th>Category</th><th>Status</th><th>Subject</th></tr></thead><tbody>${communications.map(r=>`<tr><td>${esc(fmt(r.createdAt))}</td><td>${esc(r.channel)}</td><td>${esc(r.category)}</td><td>${esc(r.status)}</td><td>${esc(r.subject)}</td></tr>`).join('') || '<tr><td colspan="5">No communications are currently listed.</td></tr>'}</tbody></table></div></details>
          <details><summary><strong>Account-security history</strong></summary><div style="overflow:auto"><table><thead><tr><th>Date</th><th>Action</th><th>Portal</th><th>Reason</th></tr></thead><tbody>${security.map(r=>`<tr><td>${esc(fmt(r.createdAt))}</td><td>${esc(r.action)}</td><td>${esc(r.portal || '—')}</td><td>${esc(r.reason)}</td></tr>`).join('') || '<tr><td colspan="4">No security events are currently listed.</td></tr>'}</tbody></table></div></details>
        </section>`);
    } catch (error) {
      console.error('Employee 360 enterprise self-service failed to load', error);
    }
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
