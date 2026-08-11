(() => {
  'use strict';
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const api = (path, init = {}) => window.fetch(API + path, { cache: 'no-store', ...init, headers: { Accept: 'application/json', ...(init.headers || {}) } }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || payload.message || `Request failed (${response.status})`), { status: response.status });
    return payload.data ?? payload;
  });

  const style = document.createElement('style');
  style.textContent = `
    .spire-network-admin{width:min(1080px,100%);margin:18px auto 0;background:#fff;border:1px solid #d4e1ea;border-radius:22px;box-shadow:0 20px 60px rgba(15,55,85,.1);padding:28px;font-family:Segoe UI,Arial,sans-serif;color:#15324a}
    .spire-network-admin[hidden]{display:none!important}.spire-network-admin h2{margin:5px 0 8px;color:#0b4265;font-size:27px}.spire-network-admin p{color:#607483;line-height:1.55}.spire-network-admin__eyebrow{font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#0b75ad}.spire-network-admin__grid{display:grid;grid-template-columns:320px 1fr;gap:18px;margin-top:20px}.spire-network-admin__panel{border:1px solid #d8e4eb;border-radius:15px;padding:16px;background:#fbfdfe;min-width:0}.spire-network-admin__panel h3{margin:0 0 12px;color:#174b6d;font-size:17px}
    .spire-admin-input,.spire-admin-select{width:100%;min-height:42px;border:1px solid #bfd1dc;border-radius:10px;padding:0 11px;background:#fff;color:#173c55;font:700 13px Segoe UI,Arial,sans-serif}.spire-admin-employee-list{display:grid;gap:7px;max-height:430px;overflow:auto;margin-top:10px}.spire-admin-employee{border:1px solid #d8e3e9;background:#fff;border-radius:10px;padding:10px;text-align:left;cursor:pointer}.spire-admin-employee.active{border-color:#0b75ad;background:#edf8fc}.spire-admin-employee strong,.spire-admin-employee span{display:block}.spire-admin-employee span{font-size:11px;color:#718390;margin-top:3px}
    .spire-admin-home-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;max-height:430px;overflow:auto;padding-right:3px}.spire-admin-home{display:flex;gap:9px;align-items:flex-start;border:1px solid #d8e3e9;background:#fff;border-radius:10px;padding:11px}.spire-admin-home input{margin-top:3px}.spire-admin-home strong{display:block;font-size:13px;color:#174663}.spire-admin-home small{display:block;color:#6b7f8d;margin-top:3px;line-height:1.35}.spire-admin-actions{display:flex;gap:9px;align-items:center;margin-top:14px;flex-wrap:wrap}.spire-admin-save,.spire-admin-refresh{border:0;border-radius:10px;padding:10px 14px;font-weight:900;cursor:pointer}.spire-admin-save{background:#0b6ea8;color:#fff}.spire-admin-refresh{background:#eaf3f8;color:#195878}.spire-admin-status{font-size:12px;font-weight:800;color:#527084}.spire-admin-status.error{color:#9c3a2c}.spire-admin-status.ok{color:#2f7653}
    .spire-admin-audit{margin-top:18px}.spire-admin-audit-table{width:100%;border-collapse:collapse;font-size:12px}.spire-admin-audit-table th,.spire-admin-audit-table td{text-align:left;border-bottom:1px solid #e0e9ee;padding:9px 7px;vertical-align:top}.spire-admin-audit-table th{color:#47677c;background:#f4f8fa;position:sticky;top:0}.spire-admin-audit-wrap{max-height:390px;overflow:auto;border:1px solid #dbe6ec;border-radius:12px}.spire-admin-pill{display:inline-block;border-radius:999px;padding:3px 7px;font-weight:900;background:#eaf5fa;color:#176087}.spire-admin-pill.chart{background:#eef5eb;color:#426b35}
    @media(max-width:850px){.spire-network-admin__grid{grid-template-columns:1fr}.spire-admin-home-list{grid-template-columns:1fr}.spire-network-admin{padding:20px}}
  `;
  document.head.appendChild(style);

  const host = document.createElement('section');
  host.className = 'spire-network-admin';
  host.hidden = true;
  host.innerHTML = `
    <div class="spire-network-admin__eyebrow">Network Clinical Security</div>
    <h2>SPIRE Service-Home Access Control</h2>
    <p>Assign employees to the service homes they may open in SPIRE. A non-administrator sees only assigned homes, but once a home is opened the employee can access every active client chart in that home. SPIRE administrators automatically have access to every Sulandra Health service home and client chart.</p>
    <div class="spire-network-admin__grid">
      <div class="spire-network-admin__panel"><h3>Employees & Users</h3><input id="spireAdminEmployeeSearch" class="spire-admin-input" type="search" placeholder="Search employees…"><div id="spireAdminEmployees" class="spire-admin-employee-list"></div></div>
      <div class="spire-network-admin__panel"><h3 id="spireAdminHomeTitle">Select an employee</h3><input id="spireAdminHomeSearch" class="spire-admin-input" type="search" placeholder="Search service homes…"><div id="spireAdminHomes" class="spire-admin-home-list" style="margin-top:10px"></div><div class="spire-admin-actions"><button id="spireAdminSave" class="spire-admin-save" type="button" disabled>Save SPIRE Access</button><button id="spireAdminReload" class="spire-admin-refresh" type="button">Refresh</button><span id="spireAdminStatus" class="spire-admin-status"></span></div></div>
    </div>
    <div class="spire-network-admin__panel spire-admin-audit"><div class="spire-admin-actions" style="margin-top:0;justify-content:space-between"><h3 style="margin:0">Recent SPIRE Access Audit</h3><button id="spireAdminAuditReload" class="spire-admin-refresh" type="button">Refresh Audit</button></div><p style="font-size:12px;margin:6px 0 12px">Shows service-home access, chart access, the user, patient/home, company provenance and timestamp.</p><div class="spire-admin-audit-wrap"><table class="spire-admin-audit-table"><thead><tr><th>Time</th><th>Type</th><th>User</th><th>Accessed</th><th>Company</th><th>Action</th></tr></thead><tbody id="spireAdminAuditBody"><tr><td colspan="6">Loading…</td></tr></tbody></table></div></div>`;
  const main = document.querySelector('main');
  if (main) {
    main.style.display = 'block';
    main.appendChild(host);
  } else document.body.appendChild(host);

  const employeeSearch = host.querySelector('#spireAdminEmployeeSearch');
  const employeeList = host.querySelector('#spireAdminEmployees');
  const homeSearch = host.querySelector('#spireAdminHomeSearch');
  const homeList = host.querySelector('#spireAdminHomes');
  const homeTitle = host.querySelector('#spireAdminHomeTitle');
  const save = host.querySelector('#spireAdminSave');
  const reload = host.querySelector('#spireAdminReload');
  const status = host.querySelector('#spireAdminStatus');
  const auditReload = host.querySelector('#spireAdminAuditReload');
  const auditBody = host.querySelector('#spireAdminAuditBody');
  let employees = [];
  let homes = [];
  let selectedEmployee = null;
  let assigned = new Set();

  const setStatus = (text, kind = '') => {
    status.textContent = text || '';
    status.className = `spire-admin-status${kind ? ` ${kind}` : ''}`;
  };
  const employeeName = (employee) => employee.displayName || employee.email || employee.id;

  function renderEmployees() {
    const term = String(employeeSearch.value || '').toLowerCase().trim();
    employeeList.innerHTML = '';
    for (const employee of employees.filter((item) => !term || [employeeName(item), item.email, item.role].some((value) => String(value || '').toLowerCase().includes(term)))) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `spire-admin-employee${selectedEmployee?.id === employee.id ? ' active' : ''}`;
      const strong = document.createElement('strong'); strong.textContent = employeeName(employee);
      const meta = document.createElement('span'); meta.textContent = `${employee.role || 'Employee'} · ${employee.email || employee.id}`;
      button.append(strong, meta);
      button.addEventListener('click', () => selectEmployee(employee));
      employeeList.appendChild(button);
    }
  }

  function renderHomes() {
    const term = String(homeSearch.value || '').toLowerCase().trim();
    homeList.innerHTML = '';
    if (!selectedEmployee) {
      homeList.innerHTML = '<div style="color:#718493;font-size:13px">Choose an employee to manage service-home access.</div>';
      return;
    }
    const visible = homes.filter((home) => !term || [home.name, home.companyName, home.companyCode, home.address].some((value) => String(value || '').toLowerCase().includes(term)));
    for (const home of visible) {
      const label = document.createElement('label');
      label.className = 'spire-admin-home';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.value = home.id; checkbox.checked = assigned.has(String(home.id));
      checkbox.addEventListener('change', () => checkbox.checked ? assigned.add(String(home.id)) : assigned.delete(String(home.id)));
      const text = document.createElement('span');
      const strong = document.createElement('strong'); strong.textContent = home.name || 'Service Home';
      const small = document.createElement('small'); small.textContent = `${home.companyName || home.companyCode || 'Sulandra Health'} · ${Number(home.clientCount || 0)} clients · ${Number(home.employeeAccessCount || 0)} assigned users`;
      text.append(strong, small); label.append(checkbox, text); homeList.appendChild(label);
    }
  }

  async function selectEmployee(employee) {
    selectedEmployee = employee;
    assigned = new Set();
    homeTitle.textContent = `Service homes for ${employeeName(employee)}`;
    save.disabled = true;
    setStatus('Loading assignments…');
    renderEmployees(); renderHomes();
    try {
      const data = await api(`/api/admin/spire/network-access/assignments/${encodeURIComponent(employee.id)}`);
      assigned = new Set(Array.isArray(data.homeIds) ? data.homeIds.map(String) : []);
      save.disabled = false;
      setStatus(`${assigned.size} service home${assigned.size === 1 ? '' : 's'} assigned.`);
      renderHomes();
    } catch (error) { setStatus(error.message || 'Unable to load assignments.', 'error'); }
  }

  async function loadDirectory() {
    setStatus('Loading network access controls…');
    try {
      const [employeeData, homeData] = await Promise.all([
        api('/api/admin/spire/network-access/employees'),
        api('/api/admin/spire/network-access/homes'),
      ]);
      employees = Array.isArray(employeeData) ? employeeData : [];
      homes = Array.isArray(homeData) ? homeData : [];
      host.hidden = false;
      renderEmployees(); renderHomes();
      setStatus(`${homes.length} active Sulandra Health service homes available.`, 'ok');
    } catch (error) {
      if (error.status === 403) return;
      host.hidden = false;
      setStatus(error.message || 'Unable to load SPIRE administration controls.', 'error');
    }
  }

  async function saveAssignments() {
    if (!selectedEmployee) return;
    save.disabled = true;
    setStatus('Saving access…');
    try {
      await api('/api/admin/spire/network-access/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: selectedEmployee.id, homeIds: [...assigned] }),
      });
      setStatus('SPIRE service-home access saved and audited.', 'ok');
      await Promise.all([loadAudit(), reloadHomesOnly()]);
    } catch (error) { setStatus(error.message || 'Unable to save access.', 'error'); }
    finally { save.disabled = false; }
  }

  async function reloadHomesOnly() {
    homes = await api('/api/admin/spire/network-access/homes');
    if (!Array.isArray(homes)) homes = [];
    renderHomes();
  }

  async function loadAudit() {
    try {
      const events = await api('/api/admin/spire/network-access/audit?limit=150');
      auditBody.innerHTML = '';
      if (!Array.isArray(events) || !events.length) {
        auditBody.innerHTML = '<tr><td colspan="6">No SPIRE access events recorded yet.</td></tr>';
        return;
      }
      for (const event of events) {
        const row = document.createElement('tr');
        const when = document.createElement('td'); when.textContent = event.createdAt ? new Date(event.createdAt).toLocaleString() : '—';
        const type = document.createElement('td'); const pill = document.createElement('span'); pill.className = `spire-admin-pill${event.auditType === 'CHART' ? ' chart' : ''}`; pill.textContent = event.auditType === 'CHART' ? 'Chart' : 'Home'; type.appendChild(pill);
        const user = document.createElement('td'); user.textContent = event.actorEmail || event.actorUserId || 'System';
        const target = document.createElement('td'); target.textContent = event.auditType === 'CHART' ? (event.patientName || event.medicalRecordNumber || event.patientId || 'Patient chart') : (event.homeName || event.subjectUserId || 'Service home');
        const company = document.createElement('td'); company.textContent = event.companyName || 'Sulandra Health';
        const action = document.createElement('td'); action.textContent = String(event.action || '').replaceAll('_', ' ');
        row.append(when, type, user, target, company, action); auditBody.appendChild(row);
      }
    } catch (error) { auditBody.innerHTML = `<tr><td colspan="6"></td></tr>`; auditBody.querySelector('td').textContent = error.message || 'Unable to load audit.'; }
  }

  employeeSearch.addEventListener('input', renderEmployees);
  homeSearch.addEventListener('input', renderHomes);
  save.addEventListener('click', saveAssignments);
  reload.addEventListener('click', () => loadDirectory().catch(() => {}));
  auditReload.addEventListener('click', () => loadAudit().catch(() => {}));

  Promise.resolve(window.SulandraEntityContext?.ready).finally(() => {
    loadDirectory().then(() => { if (!host.hidden) loadAudit(); }).catch(() => {});
  });
})();
