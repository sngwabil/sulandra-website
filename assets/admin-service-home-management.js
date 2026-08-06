(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const readToken = () => sessionStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra_token')
    || localStorage.getItem('token')
    || localStorage.getItem('accessToken')
    || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let homes = [];
  let employees = [];
  let clients = [];
  let selectedHome = null;
  let installing = false;

  async function api(path, options = {}) {
    const token = readToken();
    if (!token) throw new Error('Your admin session is not available. Sign in again through the Admin Console.');
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(options.body ? {'Content-Type':'application/json'} : {}),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body.data ?? body;
  }

  function findServiceHomesHost() {
    const headings = [...document.querySelectorAll('h1,h2,h3')];
    const heading = headings.find(node => node.textContent.trim() === 'Service Homes' && node.getClientRects().length > 0);
    if (!heading) return null;
    return heading.closest('.card,section,article,[data-module-panel],main>div,main') || heading.parentElement;
  }

  function installStyles() {
    if (document.getElementById('serviceHomeManagerStyles')) return;
    const style = document.createElement('style');
    style.id = 'serviceHomeManagerStyles';
    style.textContent = `
      #serviceHomeManager{font-family:inherit}.shm-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.shm-head h2{margin:0;color:#075493;font-size:26px}.shm-head p{margin:5px 0 0;color:#536271}.shm-actions{display:flex;gap:8px;flex-wrap:wrap}.shm-btn{border:1px solid #0c69ad;background:#fff;color:#075493;border-radius:6px;padding:10px 14px;font-weight:800;cursor:pointer}.shm-btn.primary{background:#087fc2;color:#fff}.shm-btn.danger{background:#c93e27;color:#fff;border-color:#c93e27}.shm-status{display:none;margin:12px 0;padding:10px 12px;border:1px solid #e6cb70;border-radius:6px;background:#fff6d9}.shm-status.show{display:block}.shm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.shm-card{border:1px solid #ccd8e4;border-radius:12px;background:#fff;padding:16px;box-shadow:0 5px 16px rgba(15,53,86,.08)}.shm-card h3{margin:0 0 6px;color:#075493;font-size:20px}.shm-address{color:#55606c;min-height:38px}.shm-meta{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.shm-pill{background:#e8f3fb;color:#075493;border-radius:999px;padding:5px 9px;font-weight:700;font-size:12px}.shm-empty{border:2px dashed #bed6e8;border-radius:14px;padding:44px 20px;text-align:center;background:#f7fbfe}.shm-panel{display:none;margin-top:18px;border:1px solid #c7d5e2;border-radius:12px;background:#fff;overflow:hidden}.shm-panel.open{display:block}.shm-panel-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#0d477d;color:#fff}.shm-panel-body{padding:16px}.shm-form{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px}.shm-form label{font-weight:700;color:#263748}.shm-form input,.shm-form select{width:100%;margin-top:5px;padding:10px;border:1px solid #b8c7d6;border-radius:6px}.shm-span-2{grid-column:1/-1}.shm-columns{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}.shm-list{border:1px solid #d3dee8;border-radius:8px;overflow:hidden}.shm-list h4{margin:0;padding:11px 12px;background:#edf4fa;color:#075493}.shm-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid #e2e8ef}.shm-row small{display:block;color:#6a7480}.shm-select-row{display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:12px;border-top:1px solid #e2e8ef}.shm-select-row select{min-width:0;padding:8px;border:1px solid #b8c7d6;border-radius:6px}@media(max-width:850px){.shm-form,.shm-columns{grid-template-columns:1fr}.shm-span-2{grid-column:auto}.shm-select-row{grid-template-columns:1fr}.shm-head{flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function markup() {
    return `<section id="serviceHomeManager">
      <div class="shm-head"><div><h2>Service Homes</h2><p>Create and manage service homes, GPS locations, employees, Home Managers, clients, and schedules from one shared record.</p></div><div class="shm-actions"><button class="shm-btn" id="refreshHomes">Refresh</button><button class="shm-btn primary" id="createHome">Create Service Home</button></div></div>
      <div id="homeStatus" class="shm-status"></div>
      <div id="homeCards" class="shm-grid"><div class="shm-empty">Loading service homes…</div></div>
      <section id="homeEditor" class="shm-panel">
        <div class="shm-panel-head"><strong id="homeEditorTitle">Service Home</strong><button class="shm-btn" id="closeHomeEditor">Close</button></div>
        <div class="shm-panel-body">
          <div class="shm-form"><label>Home name<input id="homeName" maxlength="160"></label><label>Clock-in radius in meters<input id="homeRadius" type="number" min="50" max="5000" value="250"></label><label class="shm-span-2">Street address<input id="homeAddress" maxlength="300"></label><label>Latitude<input id="homeLatitude" type="number" step="any"></label><label>Longitude<input id="homeLongitude" type="number" step="any"></label></div>
          <div class="shm-actions" style="margin-top:14px"><button class="shm-btn" id="useHomeGps">Use Current GPS</button><button class="shm-btn primary" id="saveHome">Save Home Everywhere</button><button class="shm-btn danger" id="deleteHome">Deactivate Home</button></div>
          <div class="shm-columns">
            <div class="shm-list"><h4>Employees and Home Managers</h4><div id="assignedEmployees"></div><div class="shm-select-row"><select id="employeePicker"></select><label style="display:flex;align-items:center;gap:5px"><input id="managerFlag" type="checkbox"> Home Manager</label><button class="shm-btn primary" id="assignEmployee">Assign</button></div></div>
            <div class="shm-list"><h4>Clients Assigned to This Home</h4><div id="assignedClients"></div><div class="shm-select-row"><select id="clientPicker"></select><span></span><button class="shm-btn primary" id="assignClient">Assign</button></div></div>
          </div>
        </div>
      </section>
    </section>`;
  }

  function setStatus(message, isError = false) {
    const node = document.getElementById('homeStatus');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('show', Boolean(message));
    node.style.background = isError ? '#fde3df' : '#fff6d9';
    node.style.borderColor = isError ? '#d96a5a' : '#e6cb70';
  }

  async function install() {
    if (installing || document.getElementById('serviceHomeManager')) return;
    const host = findServiceHomesHost();
    if (!host) return;
    installing = true;
    try {
      installStyles();
      host.innerHTML = markup();
      document.getElementById('refreshHomes').onclick = loadAll;
      document.getElementById('createHome').onclick = () => openEditor();
      document.getElementById('closeHomeEditor').onclick = closeEditor;
      document.getElementById('saveHome').onclick = saveHome;
      document.getElementById('deleteHome').onclick = deactivateHome;
      document.getElementById('useHomeGps').onclick = useGps;
      document.getElementById('assignEmployee').onclick = assignEmployee;
      document.getElementById('assignClient').onclick = assignClient;
      await loadAll();
    } finally { installing = false; }
  }

  async function loadAll() {
    try {
      setStatus('Loading service homes…');
      [homes, employees, clients] = await Promise.all([
        api('/api/admin/service-homes'),
        api('/api/admin/service-homes/directory/employees').catch(() => []),
        api('/api/admin/service-homes/directory/clients').catch(() => [])
      ]);
      renderHomes();
      setStatus('');
    } catch (error) { setStatus(error.message, true); }
  }

  function renderHomes() {
    const box = document.getElementById('homeCards');
    if (!box) return;
    if (!homes.length) {
      box.innerHTML = '<div class="shm-empty"><h3>No service homes yet</h3><p>Create your first home and assign employees and clients.</p><button class="shm-btn primary" id="emptyCreateHome">Create Service Home</button></div>';
      document.getElementById('emptyCreateHome').onclick = () => openEditor();
      return;
    }
    box.innerHTML = homes.map(home => `<article class="shm-card"><h3>${esc(home.name)}</h3><div class="shm-address">${esc(home.address)}</div><div class="shm-meta"><span class="shm-pill">${Number(home.employeeCount || 0)} employees</span><span class="shm-pill">${Number(home.clientCount || 0)} clients</span><span class="shm-pill">${Number(home.geofenceRadiusMeters || 250)} m clocking radius</span></div><div class="shm-actions"><button class="shm-btn primary" data-home-edit="${home.id}">Manage Home</button><button class="shm-btn" data-home-schedule="${home.id}">Open Schedule</button></div></article>`).join('');
    box.querySelectorAll('[data-home-edit]').forEach(button => button.onclick = () => openEditor(homes.find(home => home.id === button.dataset.homeEdit)));
    box.querySelectorAll('[data-home-schedule]').forEach(button => button.onclick = () => { localStorage.setItem('sulandra:selected-service-home', button.dataset.homeSchedule); location.href = '/time-attendance.html#admin'; });
  }

  function populatePickers() {
    document.getElementById('employeePicker').innerHTML = '<option value="">Select employee</option>' + employees.map(employee => `<option value="${employee.id}">${esc(employee.displayName || employee.email || 'Employee')}</option>`).join('');
    document.getElementById('clientPicker').innerHTML = '<option value="">Select client</option>' + clients.map(client => `<option value="${client.id}">${esc(client.displayName || client.name || client.id)}</option>`).join('');
  }

  async function openEditor(home = null) {
    selectedHome = home || null;
    document.getElementById('homeEditor').classList.add('open');
    document.getElementById('homeEditorTitle').textContent = home ? `Manage ${home.name}` : 'Create Service Home';
    document.getElementById('homeName').value = home?.name || '';
    document.getElementById('homeAddress').value = home?.address || '';
    document.getElementById('homeLatitude').value = home?.latitude ?? '';
    document.getElementById('homeLongitude').value = home?.longitude ?? '';
    document.getElementById('homeRadius').value = home?.geofenceRadiusMeters || 250;
    document.getElementById('deleteHome').style.display = home ? 'inline-block' : 'none';
    populatePickers();
    if (home) await loadAssignments(); else renderAssignments({employees:[], clients:[]});
    document.getElementById('homeEditor').scrollIntoView({behavior:'smooth', block:'start'});
  }

  function closeEditor() { document.getElementById('homeEditor').classList.remove('open'); selectedHome = null; }
  function payload() {
    const latitude = document.getElementById('homeLatitude').value;
    const longitude = document.getElementById('homeLongitude').value;
    return { name:document.getElementById('homeName').value.trim(), address:document.getElementById('homeAddress').value.trim(), geofenceRadiusMeters:Number(document.getElementById('homeRadius').value) || 250, ...(latitude !== '' ? {latitude:Number(latitude)} : {}), ...(longitude !== '' ? {longitude:Number(longitude)} : {}) };
  }

  async function saveHome() {
    const body = payload();
    if (!body.name || !body.address) return setStatus('Enter the home name and address.', true);
    try {
      setStatus('Saving service home everywhere…');
      selectedHome = selectedHome
        ? await api(`/api/admin/service-homes/${encodeURIComponent(selectedHome.id)}`, {method:'PATCH', body:JSON.stringify(body)})
        : await api('/api/admin/service-homes', {method:'POST', body:JSON.stringify(body)});
      await loadAll();
      await openEditor(homes.find(home => home.id === selectedHome.id) || selectedHome);
      setStatus('Service home saved across scheduling, GPS clocking, employees, and clients.');
    } catch (error) { setStatus(error.message, true); }
  }

  async function deactivateHome() {
    if (!selectedHome || !confirm(`Deactivate ${selectedHome.name}?`)) return;
    try { await api(`/api/admin/service-homes/${encodeURIComponent(selectedHome.id)}`, {method:'DELETE'}); closeEditor(); await loadAll(); setStatus('Service home deactivated.'); }
    catch (error) { setStatus(error.message, true); }
  }

  async function loadAssignments() {
    try { renderAssignments(await api(`/api/admin/service-homes/${encodeURIComponent(selectedHome.id)}/assignments`)); }
    catch (error) { setStatus(error.message, true); }
  }

  function renderAssignments(data) {
    const employeeBox = document.getElementById('assignedEmployees');
    const clientBox = document.getElementById('assignedClients');
    employeeBox.innerHTML = (data.employees || []).map(employee => `<div class="shm-row"><div><strong>${esc(employee.displayName || employee.email || 'Employee')}</strong><small>${employee.isManager ? 'Home Manager' : 'Employee'}</small></div><button class="shm-btn danger" data-remove-employee="${employee.id}">Remove</button></div>`).join('') || '<div class="shm-row">No employees assigned.</div>';
    clientBox.innerHTML = (data.clients || []).map(client => `<div class="shm-row"><strong>${esc(client.displayName || client.name || client.id)}</strong><button class="shm-btn danger" data-remove-client="${client.id}">Remove</button></div>`).join('') || '<div class="shm-row">No clients assigned.</div>';
    employeeBox.querySelectorAll('[data-remove-employee]').forEach(button => button.onclick = () => removeEmployee(button.dataset.removeEmployee));
    clientBox.querySelectorAll('[data-remove-client]').forEach(button => button.onclick = () => removeClient(button.dataset.removeClient));
  }

  async function assignEmployee() {
    if (!selectedHome) return setStatus('Save the home before assigning employees.', true);
    const employeeId = document.getElementById('employeePicker').value;
    if (!employeeId) return;
    try { await api(`/api/admin/service-homes/${encodeURIComponent(selectedHome.id)}/employees`, {method:'POST', body:JSON.stringify({employeeId, isManager:document.getElementById('managerFlag').checked})}); await loadAssignments(); await loadAll(); }
    catch (error) { setStatus(error.message, true); }
  }
  async function removeEmployee(employeeId) {
    if (!selectedHome || !confirm('Remove this employee from the home?')) return;
    try { await api(`/api/admin/service-homes/${encodeURIComponent(selectedHome.id)}/employees/${encodeURIComponent(employeeId)}`, {method:'DELETE'}); await loadAssignments(); await loadAll(); }
    catch (error) { setStatus(error.message, true); }
  }
  async function assignClient() {
    if (!selectedHome) return setStatus('Save the home before assigning clients.', true);
    const clientId = document.getElementById('clientPicker').value;
    if (!clientId) return;
    try { await api(`/api/admin/service-homes/${encodeURIComponent(selectedHome.id)}/clients`, {method:'POST', body:JSON.stringify({clientId})}); await loadAssignments(); await loadAll(); }
    catch (error) { setStatus(error.message, true); }
  }
  async function removeClient(clientId) {
    if (!selectedHome || !confirm('Remove this client from the home?')) return;
    try { await api(`/api/admin/service-homes/${encodeURIComponent(selectedHome.id)}/clients/${encodeURIComponent(clientId)}`, {method:'DELETE'}); await loadAssignments(); await loadAll(); }
    catch (error) { setStatus(error.message, true); }
  }

  function useGps() {
    if (!navigator.geolocation) return setStatus('GPS is not supported by this browser.', true);
    setStatus('Reading current GPS location…');
    navigator.geolocation.getCurrentPosition(position => {
      document.getElementById('homeLatitude').value = position.coords.latitude.toFixed(7);
      document.getElementById('homeLongitude').value = position.coords.longitude.toFixed(7);
      setStatus('Current GPS location added. Save the home to apply it.');
    }, error => setStatus(error.message, true), {enableHighAccuracy:true, timeout:15000, maximumAge:0});
  }

  const attemptInstall = () => { install().catch(error => console.error('Service Homes workspace failed:', error)); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', attemptInstall) : attemptInstall();
  new MutationObserver(attemptInstall).observe(document.documentElement, {childList:true, subtree:true});
  setInterval(attemptInstall, 1000);
})();