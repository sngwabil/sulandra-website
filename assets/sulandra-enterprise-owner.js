(() => {
  'use strict';
  const OWNER_EMAIL = 'admin@sulandrahealth.com';
  const OWNER_NAME = 'Sulpitius Ndeh Gwabil';
  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const token = sessionStorage.getItem('sulandra:employee:access-token') || localStorage.getItem('sulandra:employee:access-token') || localStorage.getItem('sulandra_token') || localStorage.getItem('token') || localStorage.getItem('accessToken') || '';
  const sessionKeys = ['sulandra:employee:session','sulandraSession','employeeSession','session','authSession'];
  const stores = [sessionStorage, localStorage];
  const readSession = () => {
    for (const store of stores) for (const key of sessionKeys) {
      try { const value = JSON.parse(store.getItem(key) || 'null'); if (value) return value; } catch {}
    }
    return {};
  };
  const session = readSession();
  const email = String(session.email || session.user?.email || session.employee?.email || '').toLowerCase();
  if (email !== OWNER_EMAIL) return;

  window.SULANDRA_ENTERPRISE_OWNER = Object.freeze({ email: OWNER_EMAIL, displayName: OWNER_NAME, clearance: 'ENTERPRISE_OWNER' });

  const applyIdentity = () => {
    const selectors = ['#employeeName','#userLabel','#currentUserName','#adminEmail','.current-user','.user-name','[data-current-user]'];
    for (const selector of selectors) document.querySelectorAll(selector).forEach((node) => {
      const text = String(node.textContent || '').trim();
      if (!text || text.includes('@') || /administrator|employee portal/i.test(text)) node.textContent = OWNER_NAME;
    });
    document.querySelectorAll('th,td,span,div,strong').forEach((node) => {
      if (node.children.length) return;
      if (String(node.textContent || '').trim().toLowerCase() === OWNER_EMAIL) node.textContent = OWNER_NAME;
    });
  };

  const api = async (path, options = {}) => {
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Request failed');
    return payload.data ?? payload;
  };

  const roles = ['ADMINISTRATOR','PROGRAM_MANAGER','AUDITOR','DSP','DELEGATING_NURSE','LPN','RN','HOUSE_MANAGER','HR_MANAGER','SCHEDULER','BILLING_SPECIALIST','ADMINISTRATIVE_ASSISTANT','CEO','DOO','DRIVER','GENERAL'];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function installOwnerConsole() {
    if (document.getElementById('sulandraOwnerConsoleButton')) return;
    const style = document.createElement('style');
    style.textContent = '#sulandraOwnerConsoleButton{position:fixed;right:18px;bottom:18px;z-index:99998;border:0;border-radius:999px;background:#7a4b00;color:#fff;padding:11px 16px;font-weight:800;box-shadow:0 8px 24px #0003;cursor:pointer}#sulandraOwnerConsole{position:fixed;inset:5vh 4vw;z-index:99999;background:#fff;border:3px solid #7a4b00;box-shadow:0 20px 60px #0008;display:none;overflow:auto;padding:18px;color:#14243a}#sulandraOwnerConsole.open{display:block}#sulandraOwnerConsole table{width:100%;border-collapse:collapse}#sulandraOwnerConsole th,#sulandraOwnerConsole td{border:1px solid #b9c4d1;padding:9px;text-align:left}#sulandraOwnerConsole th{background:#e7eef6}#sulandraOwnerConsole .owner-lock{font-weight:800;color:#7a4b00}';
    document.head.appendChild(style);
    const button = document.createElement('button');
    button.id = 'sulandraOwnerConsoleButton';
    button.textContent = 'Enterprise Owner';
    const panel = document.createElement('section');
    panel.id = 'sulandraOwnerConsole';
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><h2 style="margin:0">Enterprise Owner Control</h2><p>${OWNER_NAME} · Highest system-wide clearance</p></div><button id="closeOwnerConsole">Close</button></div><div id="ownerConsoleStatus">Loading employees…</div><table><thead><tr><th>Employee</th><th>Account</th><th>Role / Management Assignment</th><th>Protection</th></tr></thead><tbody id="ownerEmployeeRows"></tbody></table>`;
    document.body.append(button, panel);
    button.onclick = async () => { panel.classList.add('open'); await loadEmployees(); };
    panel.querySelector('#closeOwnerConsole').onclick = () => panel.classList.remove('open');
  }

  async function loadEmployees() {
    const status = document.getElementById('ownerConsoleStatus');
    const body = document.getElementById('ownerEmployeeRows');
    try {
      const employees = await api('/api/owner/employees');
      body.innerHTML = employees.map((employee) => employee.isOwner
        ? `<tr><td><strong>${esc(OWNER_NAME)}</strong></td><td>${esc(employee.email)}</td><td>Enterprise Owner</td><td class="owner-lock">Immutable · No user can manage this account</td></tr>`
        : `<tr><td>${esc(employee.displayName)}</td><td>${esc(employee.email)}</td><td><select data-owner-role="${esc(employee.id)}">${roles.map((role) => `<option value="${role}" ${role === employee.role ? 'selected' : ''}>${role.replaceAll('_',' ')}</option>`).join('')}</select></td><td>Managed by Enterprise Owner</td></tr>`).join('');
      body.querySelectorAll('[data-owner-role]').forEach((select) => select.onchange = async () => {
        select.disabled = true;
        try {
          await api(`/api/owner/employees/${encodeURIComponent(select.dataset.ownerRole)}/role`, { method: 'PATCH', body: JSON.stringify({ role: select.value }) });
          status.textContent = 'Role assignment saved.';
        } catch (error) { status.textContent = error.message; await loadEmployees(); }
        finally { select.disabled = false; }
      });
      status.textContent = `${employees.length} employee account${employees.length === 1 ? '' : 's'} available. Only ${OWNER_NAME} can assign system roles from this console.`;
    } catch (error) { status.textContent = error.message; }
  }

  applyIdentity();
  document.addEventListener('DOMContentLoaded', () => { applyIdentity(); installOwnerConsole(); });
  if (document.readyState !== 'loading') installOwnerConsole();
  let attempts = 0;
  const timer = setInterval(() => { applyIdentity(); if (++attempts >= 10) clearInterval(timer); }, 500);
})();
