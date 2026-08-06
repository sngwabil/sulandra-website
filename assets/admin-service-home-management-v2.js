(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const states = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
  const token = () => sessionStorage.getItem('sulandra:employee:access-token') || localStorage.getItem('sulandra:employee:access-token') || localStorage.getItem('sulandra_token') || localStorage.getItem('token') || localStorage.getItem('accessToken') || '';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = async (path, options = {}) => {
    const t = token();
    if (!t) throw new Error('Admin session unavailable. Sign in again.');
    const response = await fetch(API + path, { ...options, cache:'no-store', headers:{ Accept:'application/json', Authorization:`Bearer ${t}`, ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body.data ?? body;
  };

  let homes = [], employees = [], clients = [], current = null, installing = false;

  function host() {
    const heading = [...document.querySelectorAll('h1,h2,h3')].find(n => n.textContent.trim() === 'Service Homes' && n.getClientRects().length);
    return heading?.closest('.card,section,article,[data-module-panel],main>div,main') || null;
  }

  function installStyle() {
    if (document.getElementById('shmV2Style')) return;
    const style = document.createElement('style');
    style.id = 'shmV2Style';
    style.textContent = `#serviceHomeManager{font-family:inherit}.sh-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.sh-actions{display:flex;gap:8px;flex-wrap:wrap}.sh-btn{padding:10px 14px;border:1px solid #0b6cad;border-radius:6px;background:#fff;color:#075493;font-weight:800;cursor:pointer}.sh-btn.primary{background:#087fc2;color:#fff}.sh-btn.danger{background:#c9432b;color:#fff;border-color:#c9432b}.sh-status{display:none;margin:12px 0;padding:10px;border:1px solid #d5bd68;background:#fff7d8;border-radius:6px}.sh-status.show{display:block}.sh-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:16px}.sh-card{background:#fff;border:1px solid #ccd8e4;border-radius:10px;padding:15px}.sh-card h3{margin:0;color:#075493}.sh-pills{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.sh-pill{background:#e9f4fb;border-radius:999px;padding:5px 8px;font-size:12px;font-weight:700}.sh-editor{display:none;margin-top:16px;border:1px solid #b8c9d8;border-radius:10px;overflow:hidden}.sh-editor.open{display:block}.sh-editor-head{display:flex;justify-content:space-between;align-items:center;background:#0d477d;color:#fff;padding:13px 15px}.sh-body{padding:15px}.sh-form{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px}.sh-form label{font-weight:700}.sh-form input,.sh-form select{width:100%;padding:10px;margin-top:5px;border:1px solid #b8c7d6;border-radius:6px}.sh-address{grid-column:1/-1;display:grid;grid-template-columns:2fr 1.2fr .7fr .8fr;gap:10px}.sh-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.sh-list{border:1px solid #d4dfe8;border-radius:8px;overflow:hidden}.sh-list h4{margin:0;padding:10px;background:#edf4fa;color:#075493}.sh-row{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:9px 10px;border-top:1px solid #e3e9ef}.sh-assign{display:grid;grid-template-columns:1fr auto auto;gap:7px;padding:10px;border-top:1px solid #e3e9ef}.sh-assign select{min-width:0;padding:8px}@media(max-width:850px){.sh-form,.sh-address,.sh-cols{grid-template-columns:1fr}.sh-assign{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  function html() {
    return `<section id="serviceHomeManager"><div class="sh-head"><div><h2 style="margin:0;color:#075493">Service Homes</h2><p>Create and manage homes, addresses, GPS, employees, clients, and schedules.</p></div><div class="sh-actions"><button class="sh-btn" id="shRefresh">Refresh</button><button class="sh-btn primary" id="shCreate">Create Service Home</button></div></div><div id="shStatus" class="sh-status"></div><div id="shCards" class="sh-grid"></div><section id="shEditor" class="sh-editor"><div class="sh-editor-head"><strong id="shTitle">Service Home</strong><button class="sh-btn" id="shClose">Close</button></div><div class="sh-body"><div class="sh-form"><label>Home name<input id="shName"></label><label>Clock-in radius in meters<input id="shRadius" type="number" min="50" max="5000" value="250"></label><div class="sh-address"><label>Street address<input id="shStreet"></label><label>City<input id="shCity"></label><label>State<select id="shState"><option value="">Select</option>${states.map(s=>`<option>${s}</option>`).join('')}</select></label><label>ZIP code<input id="shZip" maxlength="10"></label></div><label>Latitude<input id="shLat" readonly></label><label>Longitude<input id="shLng" readonly></label></div><div class="sh-actions" style="margin-top:12px"><button class="sh-btn" id="shFindGps">Find GPS from Address</button><button class="sh-btn" id="shCurrentGps">Use Current GPS</button><button class="sh-btn primary" id="shSave">Save Home Everywhere</button><button class="sh-btn danger" id="shDelete">Deactivate Home</button></div><div class="sh-cols"><div class="sh-list"><h4>Employees and Home Managers</h4><div id="shEmployees"></div><div class="sh-assign"><select id="shEmployeePick"></select><label><input id="shManager" type="checkbox"> Home Manager</label><button class="sh-btn primary" id="shAssignEmployee">Assign</button></div></div><div class="sh-list"><h4>Clients Assigned to This Home</h4><div id="shClients"></div><div class="sh-assign"><select id="shClientPick"></select><span></span><button class="sh-btn primary" id="shAssignClient">Assign</button></div></div></div></div></section></section>`;
  }

  function status(message, error = false) {
    const el = document.getElementById('shStatus');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('show', Boolean(message));
    el.style.background = error ? '#fde4df' : '#fff7d8';
  }

  async function install() {
    if (installing || document.getElementById('serviceHomeManager')) return;
    const target = host();
    if (!target) return;
    installing = true;
    try {
      installStyle(); target.innerHTML = html();
      shRefresh.onclick = load; shCreate.onclick = () => edit(); shClose.onclick = close;
      shSave.onclick = save; shDelete.onclick = deactivate; shFindGps.onclick = geocode;
      shCurrentGps.onclick = currentGps; shAssignEmployee.onclick = assignEmployee; shAssignClient.onclick = assignClient;
      await load();
    } finally { installing = false; }
  }

  async function load() {
    try {
      status('Loading service homes…');
      [homes, employees, clients] = await Promise.all([api('/api/admin/service-homes'), api('/api/admin/service-homes/directory/employees').catch(()=>[]), api('/api/admin/service-homes/directory/clients').catch(()=>[])]);
      render(); status('');
    } catch (e) { status(e.message, true); }
  }

  function render() {
    shCards.innerHTML = homes.length ? homes.map(h => `<article class="sh-card"><h3>${esc(h.name)}</h3><div>${esc(h.address)}</div><div class="sh-pills"><span class="sh-pill">${h.employeeCount||0} employees</span><span class="sh-pill">${h.clientCount||0} clients</span><span class="sh-pill">${h.geofenceRadiusMeters||250} m radius</span></div><div class="sh-actions"><button class="sh-btn primary" data-edit="${h.id}">Manage Home</button><button class="sh-btn" data-schedule="${h.id}">Open Schedule</button></div></article>`).join('') : '<div class="sh-card"><h3>No service homes yet</h3><button class="sh-btn primary" id="shEmptyCreate">Create Service Home</button></div>';
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(homes.find(h => h.id === b.dataset.edit)));
    document.querySelectorAll('[data-schedule]').forEach(b => b.onclick = () => { localStorage.setItem('sulandra:selected-service-home', b.dataset.schedule); location.href='/time-attendance.html#admin'; });
    if (window.shEmptyCreate) shEmptyCreate.onclick = () => edit();
  }

  function parseAddress(home) {
    return { street:home?.streetAddress || home?.address || '', city:home?.city || '', state:home?.state || '', zip:home?.zipCode || '' };
  }

  async function edit(home = null) {
    current = home; const a = parseAddress(home);
    shEditor.classList.add('open'); shTitle.textContent = home ? `Manage ${home.name}` : 'Create Service Home';
    shName.value = home?.name || ''; shStreet.value = a.street; shCity.value = a.city; shState.value = a.state; shZip.value = a.zip;
    shLat.value = home?.latitude ?? ''; shLng.value = home?.longitude ?? ''; shRadius.value = home?.geofenceRadiusMeters || 250; shDelete.style.display = home ? '' : 'none';
    shEmployeePick.innerHTML = '<option value="">Select employee</option>' + employees.map(e=>`<option value="${e.id}">${esc(e.displayName||e.email)}</option>`).join('');
    shClientPick.innerHTML = '<option value="">Select client</option>' + clients.map(c=>`<option value="${c.id}">${esc(c.displayName||c.name||c.id)}</option>`).join('');
    if (home) await assignments(); else showAssignments({employees:[],clients:[]});
    shEditor.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function close() { shEditor.classList.remove('open'); current = null; }
  function address() { return { streetAddress:shStreet.value.trim(), city:shCity.value.trim(), state:shState.value, zipCode:shZip.value.trim() }; }
  function valid(a) { return a.streetAddress && a.city && a.state && /^\d{5}(?:-\d{4})?$/.test(a.zipCode); }

  async function geocode() {
    const a = address(); if (!valid(a)) return status('Enter street, city, state, and a valid ZIP code.', true);
    try { status('Finding GPS coordinates from the address…'); const r = await api('/api/admin/service-homes/geocode',{method:'POST',body:JSON.stringify(a)}); shLat.value=Number(r.latitude).toFixed(7); shLng.value=Number(r.longitude).toFixed(7); status(`GPS found: ${r.matchedAddress}`); } catch(e){ status(e.message,true); }
  }

  function currentGps() {
    if (!navigator.geolocation) return status('GPS is unavailable.', true);
    navigator.geolocation.getCurrentPosition(p=>{shLat.value=p.coords.latitude.toFixed(7);shLng.value=p.coords.longitude.toFixed(7);status('Current GPS added.');},e=>status(e.message,true),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  }

  async function save() {
    const a=address(); if(!shName.value.trim() || !valid(a)) return status('Complete the home name and address.',true);
    if(!shLat.value || !shLng.value) return status('Find GPS from Address or use Current GPS first.',true);
    const body={name:shName.value.trim(),...a,latitude:Number(shLat.value),longitude:Number(shLng.value),geofenceRadiusMeters:Number(shRadius.value)||250};
    try { status('Saving home everywhere…'); current = current ? await api(`/api/admin/service-homes/${current.id}`,{method:'PATCH',body:JSON.stringify(body)}) : await api('/api/admin/service-homes',{method:'POST',body:JSON.stringify(body)}); await load(); await edit(homes.find(h=>h.id===current.id)||current); status('Service home saved everywhere.'); } catch(e){status(e.message,true);}
  }

  async function deactivate(){if(!current||!confirm(`Deactivate ${current.name}?`))return;try{await api(`/api/admin/service-homes/${current.id}`,{method:'DELETE'});close();await load();}catch(e){status(e.message,true);}}
  async function assignments(){try{showAssignments(await api(`/api/admin/service-homes/${current.id}/assignments`));}catch(e){status(e.message,true);}}
  function showAssignments(data){shEmployees.innerHTML=(data.employees||[]).map(e=>`<div class="sh-row"><div><strong>${esc(e.displayName||e.email)}</strong><small>${e.isManager?'Home Manager':'Employee'}</small></div><button class="sh-btn danger" data-re="${e.id}">Remove</button></div>`).join('')||'<div class="sh-row">No employees assigned.</div>';shClients.innerHTML=(data.clients||[]).map(c=>`<div class="sh-row"><strong>${esc(c.displayName||c.name||c.id)}</strong><button class="sh-btn danger" data-rc="${c.id}">Remove</button></div>`).join('')||'<div class="sh-row">No clients assigned.</div>';document.querySelectorAll('[data-re]').forEach(b=>b.onclick=()=>removeEmployee(b.dataset.re));document.querySelectorAll('[data-rc]').forEach(b=>b.onclick=()=>removeClient(b.dataset.rc));}
  async function assignEmployee(){if(!current||!shEmployeePick.value)return;try{await api(`/api/admin/service-homes/${current.id}/employees`,{method:'POST',body:JSON.stringify({employeeId:shEmployeePick.value,isManager:shManager.checked})});await assignments();await load();}catch(e){status(e.message,true);}}
  async function removeEmployee(id){if(!confirm('Remove this employee from the home?'))return;try{await api(`/api/admin/service-homes/${current.id}/employees/${id}`,{method:'DELETE'});await assignments();await load();}catch(e){status(e.message,true);}}
  async function assignClient(){if(!current||!shClientPick.value)return;try{await api(`/api/admin/service-homes/${current.id}/clients`,{method:'POST',body:JSON.stringify({clientId:shClientPick.value})});await assignments();await load();}catch(e){status(e.message,true);}}
  async function removeClient(id){if(!confirm('Remove this client from the home?'))return;try{await api(`/api/admin/service-homes/${current.id}/clients/${id}`,{method:'DELETE'});await assignments();await load();}catch(e){status(e.message,true);}}

  const retry = () => { install(); setTimeout(retry, 1000); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', retry, {once:true}) : retry();
})();