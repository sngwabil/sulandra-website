(() => {
  'use strict';

  const STATIC_BASE = 'https://www.sulandrahealth.com';
  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  const token = localStorage.getItem('sulandra_token')
    || localStorage.getItem('token')
    || localStorage.getItem('accessToken')
    || sessionStorage.getItem('sulandra:employee:access-token')
    || '';
  const headers = {'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})};
  const adminRoles = new Set(['ADMINISTRATOR','PROGRAM_MANAGER','HR_MANAGER','SCHEDULER','CEO','COO']);

  const api = async (path, options = {}) => {
    const response = await fetch(API + path, {
      ...options,
      headers: {...headers, ...(options.headers || {})},
    });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(body.error || 'Request failed');
      error.code = body.code;
      error.data = body.data;
      throw error;
    }
    return body.data ?? body;
  };

  const labelOf = element => [
    element.textContent,
    element.getAttribute?.('aria-label'),
    element.getAttribute?.('title'),
    element.id,
    element.name,
  ].filter(Boolean).join(' ').toLowerCase();

  const readSession = () => {
    for (const key of ['sulandraSession','employeeSession','session','authSession']) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || sessionStorage.getItem(key) || 'null');
        if (value) return value;
      } catch {}
    }
    return {};
  };

  const session = readSession();
  const role = String(session?.user?.role || session?.role || '').toUpperCase();
  const isAdmin = adminRoles.has(role);
  const isAdminIntent = element => /(admin|manage|scheduler|scheduling|all employees)/i.test(labelOf(element));
  const targetFor = element => `${STATIC_BASE}/time-attendance.html${isAdminIntent(element) && isAdmin ? '#admin' : ''}`;

  // Repair every Time & Attendance entry point across the static frontend.
  if (page !== 'time-attendance.html') {
    const wire = () => document.querySelectorAll('a,button,[role="button"]').forEach(element => {
      const label = labelOf(element);
      if (element.id === 'employeeStaticScheduling') {
        const target = `${STATIC_BASE}/scheduling.html`;
        if (element.tagName === 'A') element.setAttribute('href', target);
        element.dataset.sulandraTimeAttendanceTarget = target;
        return;
      }
      if (!/(time\s*(and|&)\s*attendance|timecard|time card|timesheet|clock\s*in|clock\s*out)/i.test(label)) return;
      const target = targetFor(element);
      if (element.tagName === 'A') element.setAttribute('href', target);
      element.dataset.sulandraTimeAttendanceTarget = target;
    });
    wire();
    new MutationObserver(wire).observe(document.documentElement, {subtree:true, childList:true});
    document.addEventListener('click', event => {
      const element = event.target.closest('[data-sulandra-time-attendance-target]');
      if (!element) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(element.dataset.sulandraTimeAttendanceTarget);
    }, true);
    return;
  }

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;',
  })[character]);
  const localInputValue = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  const getGps = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location services are not available on this device. Enable location access or submit an Add Clock In/Out request.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        source: 'PORTAL_GPS',
      }),
      error => reject(new Error(error.code === 1
        ? 'Location permission is required to clock in or out. Enable location access in your browser settings or submit an Add Clock In/Out request.'
        : 'Your location could not be verified. Move to an area with a stronger GPS signal or submit an Add Clock In/Out request.')),
      {enableHighAccuracy:true, timeout:15000, maximumAge:15000},
    );
  });

  const ensureNotice = () => {
    let notice = document.getElementById('gpsClockNotice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'gpsClockNotice';
      notice.className = 'notice';
      notice.style.display = 'none';
      (document.querySelector('main.main') || document.querySelector('main') || document.body).prepend(notice);
    }
    return notice;
  };
  const showNotice = (message, type = 'warn') => {
    const notice = ensureNotice();
    notice.style.display = 'block';
    notice.style.background = type === 'ok' ? '#e4f5e9' : '#fff0df';
    notice.style.borderColor = type === 'ok' ? '#7fbd91' : '#e2a95f';
    notice.textContent = message;
  };

  const addManualPanel = () => {
    if (document.getElementById('manualPunchPanel')) return;
    const requests = document.getElementById('requests');
    if (!requests) return;
    const panel = document.createElement('section');
    panel.id = 'manualPunchPanel';
    panel.className = 'card';
    panel.innerHTML = `
      <h3>Add Clock In / Clock Out</h3>
      <p>Use this when GPS clocking is blocked, a punch was forgotten, or the requested time is outside the scheduled window. An administrator must approve it.</p>
      <div class="toolbar">
        <select id="manualPunchType"><option value="CLOCK_IN">Add Clock In</option><option value="CLOCK_OUT">Add Clock Out</option></select>
        <input id="manualPunchTime" type="datetime-local">
        <input id="manualPunchReason" type="text" placeholder="Explain why this punch must be added" style="min-width:300px">
        <button id="manualPunchSubmit">Submit for Review</button>
      </div>
      <div id="manualPunchStatus"></div>
      <table class="table"><thead><tr><th>Type</th><th>Requested Time</th><th>Status</th><th>Reason</th></tr></thead><tbody id="manualPunchRows"><tr><td colspan="4">Loading…</td></tr></tbody></table>`;
    requests.prepend(panel);
    document.getElementById('manualPunchTime').value = localInputValue(new Date());
    document.getElementById('manualPunchSubmit').onclick = async () => {
      const status = document.getElementById('manualPunchStatus');
      try {
        let gps = {};
        try { gps = await getGps(); } catch {}
        await api('/api/time-attendance/manual-punch-requests', {
          method:'POST',
          body:JSON.stringify({
            punchType:document.getElementById('manualPunchType').value,
            requestedAt:document.getElementById('manualPunchTime').value,
            reason:document.getElementById('manualPunchReason').value,
            ...gps,
          }),
        });
        status.textContent = 'Request submitted for administrator review.';
        document.getElementById('manualPunchReason').value = '';
        await loadManual();
      } catch (error) { status.textContent = error.message; }
    };
  };

  const loadManual = async () => {
    const body = document.getElementById('manualPunchRows');
    if (!body) return;
    try {
      const rows = await api('/api/time-attendance/manual-punch-requests');
      body.innerHTML = (rows || []).map(row => `<tr><td>${esc(row.punchType)}</td><td>${new Date(row.requestedAt).toLocaleString()}</td><td>${esc(row.status)}</td><td>${esc(row.reason)}</td></tr>`).join('') || '<tr><td colspan="4">No manual punch requests.</td></tr>';
    } catch (error) { body.innerHTML = `<tr><td colspan="4">${esc(error.message)}</td></tr>`; }
  };

  const replaceClockHandler = (id, endpoint, verb) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      button.disabled = true;
      showNotice('Verifying your assigned shift and GPS location…');
      try {
        const gps = await getGps();
        await api(endpoint, {method:'POST', body:JSON.stringify(gps)});
        showNotice(`${verb} successful. Your schedule and assigned work location were verified.`, 'ok');
        if (typeof window.loadClockStatus === 'function') await window.loadClockStatus();
        if (typeof window.loadTimecard === 'function') await window.loadTimecard();
      } catch (error) {
        showNotice(error.message);
        addManualPanel();
        if (typeof window.show === 'function') window.show('requests');
      } finally { button.disabled = false; }
    }, true);
  };

  const addAdminWorkspace = () => {
    const admin = document.getElementById('admin');
    if (!admin || document.getElementById('attendanceAdminWorkspace')) return;
    const workspace = document.createElement('section');
    workspace.id = 'attendanceAdminWorkspace';
    workspace.innerHTML = `
      <section class="card">
        <h2>Create and Assign Shift</h2>
        <div class="toolbar">
          <select id="shiftEmployee"><option value="">Open Shift</option></select>
          <select id="shiftTemplate"><option value="CUSTOM">Custom</option><option value="DAY12">7:00 AM–7:00 PM</option><option value="NIGHT12">7:00 PM–7:00 AM</option><option value="OFFICE">8:00 AM–5:00 PM</option></select>
          <input id="shiftStart" type="datetime-local">
          <input id="shiftEnd" type="datetime-local">
          <input id="shiftCode" value="REG" placeholder="Shift code">
          <input id="shiftDepartment" placeholder="Department">
          <input id="shiftLocation" placeholder="Work location/address" style="min-width:230px">
          <input id="shiftPayCode" value="REG" placeholder="Pay code">
          <input id="shiftRepeat" type="number" min="1" max="52" value="1" title="Repeat weeks">
        </div>
        <div class="toolbar">
          <input id="shiftLatitude" type="number" step="any" placeholder="Latitude">
          <input id="shiftLongitude" type="number" step="any" placeholder="Longitude">
          <input id="shiftRadius" type="number" min="50" max="5000" value="250" placeholder="Radius meters">
          <button id="shiftUseCurrent">Use Current Location</button>
          <button id="shiftCreate">Create Shift</button>
        </div>
        <div id="shiftCreateStatus"></div>
      </section>
      <section class="card">
        <h2>Schedule Filters</h2>
        <div class="toolbar"><input id="adminFilterStart" type="date"><input id="adminFilterEnd" type="date"><input id="adminFilterDepartment" placeholder="Department"><input id="adminFilterLocation" placeholder="Location"><button id="adminApplyFilters">Apply Filters</button></div>
      </section>
      <section class="card">
        <h2>Employee Requests</h2>
        <table class="table"><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody id="attendanceRequestAdminRows"><tr><td colspan="6">Loading…</td></tr></tbody></table>
      </section>
      <section class="card">
        <h2>GPS and Manual Punch Review</h2>
        <p>Review attempts made outside the assigned location or schedule, forgotten punches, and location-verification failures.</p>
        <button id="refreshManualAdmin">Refresh Review Queue</button>
        <table class="table"><thead><tr><th>Employee</th><th>Type</th><th>Requested</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody id="manualAdminRows"><tr><td colspan="6">Loading…</td></tr></tbody></table>
      </section>`;
    admin.insertBefore(workspace, admin.querySelector('h3'));

    const now = new Date();
    const start = new Date(now); start.setHours(7,0,0,0);
    const end = new Date(now); end.setHours(19,0,0,0);
    document.getElementById('shiftStart').value = localInputValue(start);
    document.getElementById('shiftEnd').value = localInputValue(end);
    document.getElementById('adminFilterStart').value = now.toISOString().slice(0,10);
    const filterEnd = new Date(now); filterEnd.setDate(filterEnd.getDate() + 35);
    document.getElementById('adminFilterEnd').value = filterEnd.toISOString().slice(0,10);

    document.getElementById('shiftTemplate').onchange = event => {
      const value = event.target.value;
      const date = new Date(document.getElementById('shiftStart').value || Date.now());
      const finish = new Date(date);
      if (value === 'DAY12') { date.setHours(7,0,0,0); finish.setHours(19,0,0,0); }
      if (value === 'NIGHT12') { date.setHours(19,0,0,0); finish.setDate(finish.getDate() + 1); finish.setHours(7,0,0,0); }
      if (value === 'OFFICE') { date.setHours(8,0,0,0); finish.setHours(17,0,0,0); }
      if (value !== 'CUSTOM') {
        document.getElementById('shiftStart').value = localInputValue(date);
        document.getElementById('shiftEnd').value = localInputValue(finish);
      }
    };

    document.getElementById('shiftUseCurrent').onclick = async () => {
      const status = document.getElementById('shiftCreateStatus');
      try {
        const gps = await getGps();
        document.getElementById('shiftLatitude').value = gps.latitude;
        document.getElementById('shiftLongitude').value = gps.longitude;
        status.textContent = 'Current GPS coordinates captured. Confirm the work location and radius.';
      } catch (error) { status.textContent = error.message; }
    };

    document.getElementById('shiftCreate').onclick = createShift;
    document.getElementById('adminApplyFilters').onclick = loadAdminSuite;
    document.getElementById('refreshManualAdmin').onclick = loadManualAdmin;
  };

  const loadEmployees = async () => {
    const select = document.getElementById('shiftEmployee');
    if (!select) return;
    const rows = await api('/api/admin/time-attendance/employees');
    select.innerHTML = '<option value="">Open Shift</option>' + (rows || []).map(row => `<option value="${esc(row.id)}">${esc(row.displayName)} · ${esc(String(row.role || '').replaceAll('_',' '))}</option>`).join('');
  };

  const createShift = async () => {
    const status = document.getElementById('shiftCreateStatus');
    try {
      const body = {
        employeeId:document.getElementById('shiftEmployee').value || null,
        startTime:document.getElementById('shiftStart').value,
        endTime:document.getElementById('shiftEnd').value,
        code:document.getElementById('shiftCode').value,
        department:document.getElementById('shiftDepartment').value,
        location:document.getElementById('shiftLocation').value,
        payCode:document.getElementById('shiftPayCode').value,
        repeatWeeks:Number(document.getElementById('shiftRepeat').value || 1),
      };
      const created = await api('/api/admin/time-attendance/shifts', {method:'POST', body:JSON.stringify(body)});
      const latitude = Number(document.getElementById('shiftLatitude').value);
      const longitude = Number(document.getElementById('shiftLongitude').value);
      const radius = Number(document.getElementById('shiftRadius').value || 250);
      const ids = created.ids || (created.id ? [created.id] : []);
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && ids.length) {
        await Promise.all(ids.map(id => api(`/api/admin/time-attendance/shifts/${id}/geofence`, {
          method:'PATCH',
          body:JSON.stringify({latitude, longitude, geofenceRadiusMeters:radius, location:body.location}),
        })));
      }
      status.textContent = `${created.count || ids.length || 1} shift(s) created${Number.isFinite(latitude) && Number.isFinite(longitude) ? ' with GPS work-area enforcement' : ''}.`;
      await loadAdminSuite();
    } catch (error) { status.textContent = error.message; }
  };

  const loadAttendanceRequests = async () => {
    const body = document.getElementById('attendanceRequestAdminRows');
    if (!body) return;
    try {
      const rows = await api('/api/admin/time-attendance/requests');
      body.innerHTML = (rows || []).map(row => `<tr><td>${esc(row.employeeName || row.employeeId)}</td><td>${esc(row.type)}</td><td>${new Date(row.startAt).toLocaleString()} – ${new Date(row.endAt).toLocaleString()}</td><td>${esc(row.reason)}</td><td>${esc(row.status)}</td><td>${row.status === 'PENDING' ? `<button data-request-review="APPROVED" data-id="${esc(row.id)}">Approve</button> <button data-request-review="DENIED" data-id="${esc(row.id)}">Deny</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">No requests.</td></tr>';
      body.querySelectorAll('[data-request-review]').forEach(button => button.onclick = async () => {
        const notes = prompt('Review notes (optional)') || '';
        await api(`/api/admin/time-attendance/requests/${button.dataset.id}`, {method:'PATCH', body:JSON.stringify({status:button.dataset.requestReview, reviewNotes:notes})});
        await loadAttendanceRequests();
      });
    } catch (error) { body.innerHTML = `<tr><td colspan="6">${esc(error.message)}</td></tr>`; }
  };

  const loadManualAdmin = async () => {
    const body = document.getElementById('manualAdminRows');
    if (!body) return;
    try {
      const rows = await api('/api/admin/time-attendance/manual-punch-requests');
      body.innerHTML = (rows || []).map(row => `<tr><td>${esc(row.employeeName || row.employeeId)}</td><td>${esc(row.punchType)}</td><td>${new Date(row.requestedAt).toLocaleString()}</td><td>${esc(row.reason)}</td><td>${esc(row.status)}</td><td>${row.status === 'PENDING' ? `<button data-manual-review="APPROVED" data-id="${esc(row.id)}">Approve</button> <button data-manual-review="DENIED" data-id="${esc(row.id)}">Deny</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">No requests.</td></tr>';
      body.querySelectorAll('[data-manual-review]').forEach(button => button.onclick = async () => {
        const notes = prompt('Review notes (optional)') || '';
        await api(`/api/admin/time-attendance/manual-punch-requests/${button.dataset.id}`, {method:'PATCH', body:JSON.stringify({status:button.dataset.manualReview, reviewNotes:notes})});
        await loadManualAdmin();
      });
    } catch (error) { body.innerHTML = `<tr><td colspan="6">${esc(error.message)}</td></tr>`; }
  };

  const loadAdminSuite = async () => {
    if (!isAdmin) return;
    const params = new URLSearchParams();
    const start = document.getElementById('adminFilterStart')?.value;
    const end = document.getElementById('adminFilterEnd')?.value;
    const department = document.getElementById('adminFilterDepartment')?.value;
    const locationValue = document.getElementById('adminFilterLocation')?.value;
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (department) params.set('department', department);
    if (locationValue) params.set('location', locationValue);
    try {
      const data = await api(`/api/admin/time-attendance/dashboard?${params.toString()}`);
      const rows = document.getElementById('adminScheduleRows');
      if (rows) {
        rows.innerHTML = (data.shifts || []).map(shift => `<tr><td>${esc(shift.employeeName || 'Open shift')}</td><td>${esc(String(shift.role || '').replaceAll('_',' '))}</td><td>${esc(shift.department)}</td><td><b>${esc(shift.code)}</b><br>${esc(shift.location)}<br><small>${shift.latitude == null ? 'GPS not configured' : `GPS radius ${esc(shift.geofenceRadiusMeters || 250)}m`}</small></td><td>${new Date(shift.startTime).toLocaleString()}<br>to ${new Date(shift.endTime).toLocaleString()}</td><td><button data-shift-gps="${esc(shift.id)}">GPS</button> <button data-shift-delete="${esc(shift.id)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="6">No shifts in this range.</td></tr>';
        rows.querySelectorAll('[data-shift-delete]').forEach(button => button.onclick = async () => {
          if (!confirm('Delete this shift?')) return;
          await api(`/api/admin/time-attendance/shifts/${button.dataset.shiftDelete}`, {method:'DELETE'});
          await loadAdminSuite();
        });
        rows.querySelectorAll('[data-shift-gps]').forEach(button => button.onclick = async () => {
          try {
            const gps = await getGps();
            const locationName = prompt('Work location name or address') || 'Assigned work location';
            const radius = Number(prompt('Allowed radius in meters', '250') || 250);
            await api(`/api/admin/time-attendance/shifts/${button.dataset.shiftGps}/geofence`, {method:'PATCH', body:JSON.stringify({location:locationName, latitude:gps.latitude, longitude:gps.longitude, geofenceRadiusMeters:radius})});
            await loadAdminSuite();
          } catch (error) { alert(error.message); }
        });
      }
      const map = {adminEmployees:'employeeCount', adminClocked:'clockedInCount', adminOpenShifts:'openShiftCount', adminPending:'pendingRequestCount'};
      Object.entries(map).forEach(([id,key]) => { const element = document.getElementById(id); if (element) element.textContent = data[key] || 0; });
      await Promise.all([loadAttendanceRequests(), loadManualAdmin()]);
    } catch (error) { showNotice(error.message); }
  };

  const init = async () => {
    addManualPanel();
    replaceClockHandler('clockInBtn', '/api/time-attendance/clock/geofenced-in', 'Clock in');
    replaceClockHandler('clockOutBtn', '/api/time-attendance/clock/geofenced-out', 'Clock out');
    await loadManual();
    if (isAdmin) {
      addAdminWorkspace();
      try { await loadEmployees(); } catch (error) { showNotice(error.message); }
      await loadAdminSuite();
      const existingLoad = document.getElementById('loadAdmin');
      if (existingLoad) existingLoad.addEventListener('click', loadAdminSuite);
      if (location.hash === '#admin') {
        const adminTab = document.getElementById('adminTab');
        if (adminTab && !adminTab.hidden) adminTab.click();
      }
    }
  };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();