(() => {
  'use strict';
  if (!/\/time-attendance(?:\.html|\/)?$/i.test(location.pathname)) return;

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const token = sessionStorage.getItem('sulandra:employee:access-token') || localStorage.getItem('sulandra:employee:access-token') || localStorage.getItem('sulandra_token') || localStorage.getItem('token') || localStorage.getItem('accessToken') || '';
  if (!token) return;

  const api = async (path, options = {}) => {
    const response = await fetch(API + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
    });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body.data ?? body;
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const isoDate = date => {
    const value = new Date(date);
    value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
    return value.toISOString().slice(0, 10);
  };
  const localTime = value => {
    const date = new Date(value);
    return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  };
  const displayTime = value => new Date(value).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }).replace(' ', '');

  let selectedLocation = '';
  let viewStart = new Date();
  let employees = [];
  let shifts = [];
  let locations = [];
  let context = null;
  viewStart.setDate(1);
  viewStart.setHours(0,0,0,0);

  function inject() {
    const admin = document.getElementById('admin');
    if (!admin || document.getElementById('locationSchedulerPanel')) return;
    document.getElementById('adminTab')?.removeAttribute('hidden');
    document.getElementById('adminActions')?.removeAttribute('hidden');

    const original = admin.innerHTML;
    const style = document.createElement('style');
    style.textContent = `
      #locationSchedulerPanel{font-size:12px}.scheduler-shell{border:1px solid #8ea4bd;background:#eaf0f7}.scheduler-head{display:flex;justify-content:space-between;align-items:center;background:#123f70;color:#fff;padding:10px 12px}.scheduler-head h2{margin:0;font-size:16px}.scheduler-tabs{display:flex;gap:4px}.scheduler-tabs button{padding:7px 12px;border:1px solid #7ea0c4;background:#e7eef7;color:#173b63;font-weight:800}.scheduler-tabs button.active{background:#fff;color:#0b4d84}.scheduler-toolbar{display:flex;flex-wrap:wrap;gap:7px;align-items:center;padding:9px;background:#d8e4f1;border-bottom:1px solid #9dafc3}.scheduler-toolbar button,.scheduler-toolbar select,.scheduler-toolbar input{padding:7px 9px;border:1px solid #8fa5bd;background:#fff}.scheduler-toolbar .primary{background:#1769aa;color:#fff;font-weight:800}.scheduler-status{padding:7px 10px;background:#fff8d8;border-bottom:1px solid #d5c278}.schedule-scroll{overflow:auto;max-height:68vh;background:#fff}.workforce-grid{border-collapse:separate;border-spacing:0;min-width:max-content;width:100%;font-size:11px}.workforce-grid th,.workforce-grid td{border-right:1px solid #a9b7c7;border-bottom:1px solid #a9b7c7;padding:4px;text-align:center;height:42px;min-width:66px}.workforce-grid thead th{position:sticky;top:0;z-index:5;background:#d7e4f2;font-weight:900}.workforce-grid .employee-col{position:sticky;left:0;z-index:4;min-width:190px;text-align:left;background:#e7eef6;font-weight:900}.workforce-grid thead .employee-col{z-index:7}.shift-cell{cursor:pointer;background:#fff}.shift-cell:hover{outline:2px solid #0b66b2;outline-offset:-2px}.shift-cell.has-shift{background:#d7ebff;color:#083f72;font-weight:800}.shift-cell.changed{background:#fff1b8}.shift-code{font-size:10px;line-height:1.15}.off{color:#9aa4af}.manager-note{padding:8px 10px;background:#edf6ff;border-bottom:1px solid #b8d2ea}.location-create{display:none;padding:10px;background:#fff;border-bottom:1px solid #a9b7c7}.location-create.open{display:grid;grid-template-columns:1fr 2fr 110px 110px 110px auto;gap:7px}.location-create input{padding:7px;border:1px solid #9dafc3}.shift-menu{position:fixed;z-index:99999;display:none;min-width:150px;padding:4px;background:#fff;border:1px solid #7890aa;box-shadow:0 8px 24px rgba(0,0,0,.22)}.shift-menu.open{display:block}.shift-menu button{display:block;width:100%;padding:9px 11px;border:0;background:#fff;text-align:left;cursor:pointer}.shift-menu button:hover{background:#e7f1fb}.shift-menu .delete{color:#a21f1f;font-weight:800}@media(max-width:900px){.location-create.open{grid-template-columns:1fr}.schedule-scroll{max-height:60vh}}
    `;
    document.head.appendChild(style);

    admin.innerHTML = `
      <section id="locationSchedulerPanel" class="scheduler-shell">
        <div class="scheduler-head"><div><h2>Time and Attendance · Staffing and Scheduling</h2><div>Administrator workforce schedule control</div></div><div class="scheduler-tabs"><button id="schedulerManageTab" class="active">Manage Schedules</button><button id="schedulerOverviewTab">Overview</button></div></div>
        <div id="schedulerManage">
          <div class="manager-note">Click an empty box to add a shift. Right-click an existing shift to edit or delete it.</div>
          <div class="scheduler-toolbar"><b>Service Location</b><select id="scheduleLocation"><option value="">Loading locations…</option></select><button id="continueLocation" class="primary">Open Schedule</button><button id="newLocationBtn">Add Service Location</button><button id="prevMonth">◀</button><strong id="scheduleMonthLabel"></strong><button id="nextMonth">▶</button><input id="employeeSearch" type="search" placeholder="Search employee"><button id="saveSchedule" class="primary">Save & Publish</button></div>
          <div id="locationCreate" class="location-create"><input id="newLocationName" placeholder="Location name"><input id="newLocationAddress" placeholder="Address"><input id="newLocationLat" placeholder="Latitude"><input id="newLocationLng" placeholder="Longitude"><input id="newLocationRadius" type="number" value="250" min="50" max="5000"><button id="saveLocationBtn" class="primary">Create</button></div>
          <div class="scheduler-toolbar"><button id="copySchedule">Copy Current Month</button><select id="copyMonths"><option value="1">Next month</option><option value="3">Next 3 months</option><option value="6">Next 6 months</option><option value="12">Next 12 months</option></select><button id="refreshGrid">Refresh</button><span>Times are saved in the local worksite time zone.</span></div>
          <div id="scheduleStatus" class="scheduler-status">Loading schedule…</div>
          <div class="schedule-scroll"><table id="locationScheduleGrid" class="workforce-grid"></table></div>
        </div>
        <div id="schedulerOverview" style="display:none">${original}</div>
      </section>
      <div id="shiftContextMenu" class="shift-menu"><button id="contextEditShift">Edit shift</button><button id="contextDeleteShift" class="delete">Delete shift</button></div>`;

    document.getElementById('schedulerManageTab').onclick = () => toggle(true);
    document.getElementById('schedulerOverviewTab').onclick = () => toggle(false);
    document.getElementById('continueLocation').onclick = () => { selectedLocation = document.getElementById('scheduleLocation').value; if (selectedLocation) loadGrid(); };
    document.getElementById('newLocationBtn').onclick = () => document.getElementById('locationCreate').classList.toggle('open');
    document.getElementById('saveLocationBtn').onclick = createLocation;
    document.getElementById('prevMonth').onclick = () => { viewStart.setMonth(viewStart.getMonth()-1); loadGrid(); };
    document.getElementById('nextMonth').onclick = () => { viewStart.setMonth(viewStart.getMonth()+1); loadGrid(); };
    document.getElementById('employeeSearch').oninput = renderGrid;
    document.getElementById('saveSchedule').onclick = saveChanges;
    document.getElementById('copySchedule').onclick = copyMonth;
    document.getElementById('refreshGrid').onclick = loadGrid;
    document.getElementById('contextEditShift').onclick = () => { const item = context; hideMenu(); if (item) editCell(item.cell); };
    document.getElementById('contextDeleteShift').onclick = () => { const item = context; hideMenu(); if (item) deleteShift(item.shift); };
    document.addEventListener('click', hideMenu);
    window.addEventListener('blur', hideMenu);
    window.addEventListener('scroll', hideMenu, true);

    loadLocations();
    toggle(true);
    if (location.hash === '#admin') {
      document.querySelectorAll('.view').forEach(node => node.classList.toggle('active', node.id === 'admin'));
      document.querySelectorAll('#tabs button[data-view]').forEach(node => node.classList.toggle('active', node.dataset.view === 'admin'));
    }
  }

  function toggle(manage) {
    document.getElementById('schedulerManage').style.display = manage ? 'block' : 'none';
    document.getElementById('schedulerOverview').style.display = manage ? 'none' : 'block';
    document.getElementById('schedulerManageTab').classList.toggle('active', manage);
    document.getElementById('schedulerOverviewTab').classList.toggle('active', !manage);
  }
  function hideMenu() { document.getElementById('shiftContextMenu')?.classList.remove('open'); context = null; }
  function showMenu(event, cell, shift) {
    event.preventDefault(); event.stopPropagation();
    context = { cell, shift };
    const menu = document.getElementById('shiftContextMenu');
    menu.style.left = `${Math.min(event.clientX, window.innerWidth-170)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight-100)}px`;
    menu.classList.add('open');
  }

  async function loadLocations() {
    try {
      locations = await api('/api/admin/time-attendance/locations');
      const select = document.getElementById('scheduleLocation');
      select.innerHTML = locations.map(item => `<option value="${item.id}">${esc(item.name)} — ${esc(item.address)}</option>`).join('') || '<option value="">No service locations</option>';
      const office = locations.find(item => String(item.name).toLowerCase() === 'office') || locations[0];
      if (office) { selectedLocation = office.id; select.value = office.id; await loadGrid(); }
    } catch (error) { document.getElementById('scheduleStatus').textContent = error.message; }
  }

  async function createLocation() {
    const name = document.getElementById('newLocationName').value.trim();
    const address = document.getElementById('newLocationAddress').value.trim();
    if (!name || !address) return alert('Enter the location name and address.');
    const latitudeText = document.getElementById('newLocationLat').value.trim();
    const longitudeText = document.getElementById('newLocationLng').value.trim();
    const body = { name, address, geofenceRadiusMeters: Number(document.getElementById('newLocationRadius').value) || 250 };
    if (latitudeText) body.latitude = Number(latitudeText);
    if (longitudeText) body.longitude = Number(longitudeText);
    try {
      const locationRow = await api('/api/admin/time-attendance/locations', { method:'POST', body:JSON.stringify(body) });
      document.getElementById('locationCreate').classList.remove('open');
      await loadLocations();
      selectedLocation = locationRow.id;
      document.getElementById('scheduleLocation').value = locationRow.id;
      await loadGrid();
    } catch (error) { document.getElementById('scheduleStatus').textContent = error.message; }
  }

  async function loadGrid() {
    if (!selectedLocation) return;
    const end = new Date(viewStart.getFullYear(), viewStart.getMonth()+1, 1);
    document.getElementById('scheduleStatus').textContent = 'Loading employee schedule…';
    try {
      const data = await api(`/api/admin/time-attendance/location-grid?locationId=${encodeURIComponent(selectedLocation)}&start=${isoDate(viewStart)}&end=${isoDate(end)}`);
      employees = data.employees || [];
      shifts = (data.shifts || []).map(item => ({ ...item }));
      document.getElementById('scheduleMonthLabel').textContent = viewStart.toLocaleDateString([], { month:'long', year:'numeric' });
      document.getElementById('scheduleStatus').textContent = `${data.location?.name || 'Location'} · ${employees.length} assigned employee${employees.length===1?'':'s'} · ${shifts.length} scheduled shift${shifts.length===1?'':'s'}`;
      renderGrid();
    } catch (error) { document.getElementById('scheduleStatus').textContent = error.message; }
  }

  function renderGrid() {
    const query = (document.getElementById('employeeSearch').value || '').toLowerCase();
    const staff = employees.filter(item => String(item.displayName || '').toLowerCase().includes(query));
    const days = new Date(viewStart.getFullYear(), viewStart.getMonth()+1, 0).getDate();
    let html = '<thead><tr><th class="employee-col">Employee</th>';
    for (let day=1; day<=days; day++) {
      const date = new Date(viewStart.getFullYear(), viewStart.getMonth(), day);
      html += `<th>${date.toLocaleDateString([], { weekday:'short' })}<br>${String(day).padStart(2,'0')}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (const employee of staff) {
      html += `<tr><th class="employee-col">${esc(employee.displayName || 'Employee')}</th>`;
      for (let day=1; day<=days; day++) {
        const dateKey = isoDate(new Date(viewStart.getFullYear(), viewStart.getMonth(), day));
        const shift = shifts.find(item => item.employeeId === employee.id && isoDate(new Date(item.startTime)) === dateKey);
        const text = shift ? `<div class="shift-code">${esc(shift.code || 'SHIFT')}<br>${displayTime(shift.startTime)}-${displayTime(shift.endTime)}</div>` : '<span class="off">OFF</span>';
        html += `<td class="shift-cell ${shift?'has-shift':''} ${shift?._changed?'changed':''}" data-employee="${employee.id}" data-date="${dateKey}" data-shift-id="${shift?.id || ''}">${text}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';
    const grid = document.getElementById('locationScheduleGrid');
    grid.innerHTML = html;
    grid.querySelectorAll('.shift-cell').forEach(cell => {
      const shift = shifts.find(item => item.id && item.id === cell.dataset.shiftId);
      cell.onclick = () => editCell(cell);
      cell.oncontextmenu = event => shift ? showMenu(event, cell, shift) : editCell(cell);
    });
  }

  function editCell(cell) {
    const employeeId = cell.dataset.employee;
    const date = cell.dataset.date;
    const current = shifts.find(item => item.employeeId === employeeId && isoDate(new Date(item.startTime)) === date);
    const suggested = current ? `${localTime(current.startTime)}-${localTime(current.endTime)}` : '07:00-19:00';
    const value = prompt('Enter shift as HH:MM-HH:MM. Type OFF to remove the shift.', suggested);
    if (value === null) return;
    if (value.trim().toUpperCase() === 'OFF') {
      if (current?.id) return deleteShift(current);
      if (current) shifts = shifts.filter(item => item !== current);
      renderGrid();
      return;
    }
    const match = value.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!match) return alert('Use HH:MM-HH:MM, for example 07:00-19:00');
    if (current) {
      current._date = date; current._start = match[1]; current._end = match[2]; current._changed = true;
    } else {
      shifts.push({ employeeId, startTime:`${date}T${match[1]}:00`, endTime:`${date}T${match[2]}:00`, code:'SHIFT', _date:date, _start:match[1], _end:match[2], _changed:true });
    }
    renderGrid();
  }

  async function deleteShift(shift) {
    if (!shift?.id) return;
    if (!confirm(`Delete the ${displayTime(shift.startTime)}-${displayTime(shift.endTime)} shift?`)) return;
    document.getElementById('scheduleStatus').textContent = 'Deleting shift…';
    try {
      await api(`/api/admin/time-attendance/shifts/${encodeURIComponent(shift.id)}`, { method:'DELETE' });
      document.getElementById('scheduleStatus').textContent = 'Shift deleted. The employee schedule has been updated.';
      await loadGrid();
    } catch (error) { document.getElementById('scheduleStatus').textContent = error.message; }
  }

  async function saveChanges() {
    const timezoneOffsetMinutes = new Date().getTimezoneOffset();
    const cells = shifts.filter(item => item._changed).map(item => ({
      employeeId:item.employeeId,
      date:item._date || isoDate(new Date(item.startTime)),
      startTime:item._start || localTime(item.startTime),
      endTime:item._end || localTime(item.endTime),
      timezoneOffsetMinutes,
      code:item.code || 'SHIFT',
      payCode:'REG'
    }));
    if (!cells.length) return document.getElementById('scheduleStatus').textContent = 'No new or changed shifts to save.';
    try {
      const result = await api('/api/admin/time-attendance/location-grid', { method:'POST', body:JSON.stringify({ locationId:selectedLocation, cells, publish:true }) });
      document.getElementById('scheduleStatus').textContent = `${result.saved} shift change${result.saved===1?'':'s'} saved and published in local worksite time.`;
      await loadGrid();
    } catch (error) { document.getElementById('scheduleStatus').textContent = error.message; }
  }

  async function copyMonth() {
    const months = Number(document.getElementById('copyMonths').value);
    const sourceEnd = new Date(viewStart.getFullYear(), viewStart.getMonth()+1, 1);
    const targetStart = new Date(sourceEnd);
    const weeks = Math.ceil((new Date(targetStart.getFullYear(), targetStart.getMonth()+months, 1) - targetStart) / 604800000);
    if (!confirm(`Copy the current schedule pattern into the next ${months} month(s)?`)) return;
    try {
      const result = await api('/api/admin/time-attendance/copy-schedule', { method:'POST', body:JSON.stringify({ locationId:selectedLocation, sourceStart:viewStart, sourceEnd, targetStart, weeks, publish:true }) });
      document.getElementById('scheduleStatus').textContent = `Copied ${result.copied} shifts into future months.`;
    } catch (error) { document.getElementById('scheduleStatus').textContent = error.message; }
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', inject) : inject();
})();