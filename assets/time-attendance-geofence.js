(() => {
  'use strict';
  const STATIC_BASE='https://www.sulandrahealth.com';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const page=(location.pathname.split('/').pop()||'').toLowerCase();
  const token=localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||sessionStorage.getItem('sulandra:employee:access-token')||'';
  const headers={'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})};
  const api=async(path,options={})=>{const r=await fetch(API+path,{...options,headers:{...headers,...(options.headers||{})}});let body={};try{body=await r.json()}catch{}if(!r.ok){const e=new Error(body.error||'Request failed');e.code=body.code;e.data=body.data;throw e}return body.data??body};
  const labelOf=el=>[el.textContent,el.getAttribute?.('aria-label'),el.getAttribute?.('title'),el.id,el.name].filter(Boolean).join(' ').toLowerCase();
  const isAdminIntent=el=>/(admin|manage|scheduler|scheduling|all employees)/i.test(labelOf(el));
  const targetFor=el=>`${STATIC_BASE}/time-attendance.html${isAdminIntent(el)?'#admin':''}`;

  // Explicitly repair Time & Attendance controls in admin and employee portals.
  if(page!=='time-attendance.html'){
    const wire=()=>document.querySelectorAll('a,button,[role="button"]').forEach(el=>{
      const label=labelOf(el);
      if(!/(time\s*(and|&)\s*attendance|timecard|time card|timesheet|clock\s*in|clock\s*out|scheduler|scheduling)/i.test(label))return;
      const target=targetFor(el);
      if(el.tagName==='A')el.setAttribute('href',target);
      el.dataset.sulandraTimeAttendanceTarget=target;
    });
    wire();new MutationObserver(wire).observe(document.documentElement,{subtree:true,childList:true});
    document.addEventListener('click',event=>{const el=event.target.closest('[data-sulandra-time-attendance-target]');if(!el)return;event.preventDefault();event.stopImmediatePropagation();location.assign(el.dataset.sulandraTimeAttendanceTarget)},true);
    return;
  }

  const getGps=()=>new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error('Location services are not available on this device. Enable location access or submit an Add Clock In/Out request.'));
    navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracyMeters:p.coords.accuracy,source:'PORTAL_GPS'}),e=>reject(new Error(e.code===1?'Location permission is required to clock in or out. Enable location access in your browser settings or submit an Add Clock In/Out request.':'Your location could not be verified. Move to an area with a stronger GPS signal or submit an Add Clock In/Out request.')),{enableHighAccuracy:true,timeout:15000,maximumAge:15000});
  });
  const ensureNotice=()=>{let n=document.getElementById('gpsClockNotice');if(!n){n=document.createElement('div');n.id='gpsClockNotice';n.className='notice';n.style.display='none';const main=document.querySelector('main.main')||document.querySelector('main')||document.body;main.prepend(n)}return n};
  const showNotice=(message,type='warn')=>{const n=ensureNotice();n.style.display='block';n.style.background=type==='ok'?'#e4f5e9':'#fff0df';n.style.borderColor=type==='ok'?'#7fbd91':'#e2a95f';n.textContent=message};
  const addManualPanel=()=>{
    if(document.getElementById('manualPunchPanel'))return;
    const requests=document.getElementById('requests');if(!requests)return;
    const panel=document.createElement('section');panel.id='manualPunchPanel';panel.className='card';panel.innerHTML=`<h3>Add Clock In / Clock Out</h3><p>Use this only when regular GPS clocking is blocked, you forgot to punch, or you are outside your scheduled time. The request is sent to an administrator for review.</p><div class="toolbar"><select id="manualPunchType"><option value="CLOCK_IN">Add Clock In</option><option value="CLOCK_OUT">Add Clock Out</option></select><input id="manualPunchTime" type="datetime-local"><input id="manualPunchReason" type="text" placeholder="Explain why the punch must be added" style="min-width:280px"><button id="manualPunchSubmit">Submit for Review</button></div><div id="manualPunchStatus"></div><table class="table"><thead><tr><th>Type</th><th>Requested Time</th><th>Status</th><th>Reason</th></tr></thead><tbody id="manualPunchRows"><tr><td colspan="4">Loading…</td></tr></tbody></table>`;
    requests.prepend(panel);
    document.getElementById('manualPunchTime').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    document.getElementById('manualPunchSubmit').onclick=async()=>{const status=document.getElementById('manualPunchStatus');try{let gps={};try{gps=await getGps()}catch{}const body={punchType:document.getElementById('manualPunchType').value,requestedAt:document.getElementById('manualPunchTime').value,reason:document.getElementById('manualPunchReason').value,...gps};await api('/api/time-attendance/manual-punch-requests',{method:'POST',body:JSON.stringify(body)});status.textContent='Request submitted for administrator review.';document.getElementById('manualPunchReason').value='';loadManual()}catch(e){status.textContent=e.message}};
  };
  const loadManual=async()=>{const body=document.getElementById('manualPunchRows');if(!body)return;try{const rows=await api('/api/time-attendance/manual-punch-requests');body.innerHTML=(rows||[]).map(r=>`<tr><td>${r.punchType}</td><td>${new Date(r.requestedAt).toLocaleString()}</td><td>${r.status}</td><td>${r.reason}</td></tr>`).join('')||'<tr><td colspan="4">No manual punch requests.</td></tr>'}catch(e){body.innerHTML=`<tr><td colspan="4">${e.message}</td></tr>`}};

  const replaceClockHandler=(id,endpoint,verb)=>{const button=document.getElementById(id);if(!button)return;button.addEventListener('click',async event=>{event.preventDefault();event.stopImmediatePropagation();button.disabled=true;showNotice('Verifying your schedule and GPS location…');try{const gps=await getGps();const result=await api(endpoint,{method:'POST',body:JSON.stringify(gps)});showNotice(`${verb} successful. Your schedule and work location were verified.`,'ok');if(typeof window.loadClockStatus==='function')await window.loadClockStatus();if(typeof window.loadTimecard==='function')await window.loadTimecard()}catch(e){showNotice(e.message);addManualPanel();const req=document.getElementById('requests');if(req&&typeof window.show==='function')window.show('requests')}finally{button.disabled=false}},true)};

  const addAdminReview=()=>{
    const admin=document.getElementById('admin');if(!admin||document.getElementById('manualPunchAdminPanel'))return;
    const panel=document.createElement('section');panel.id='manualPunchAdminPanel';panel.innerHTML=`<h3>GPS and Manual Punch Review</h3><p>Review punches submitted because an employee was outside the assigned geofence, outside schedule hours, forgot to punch, or had a location-verification problem.</p><button id="refreshManualAdmin">Refresh Review Queue</button><table class="table"><thead><tr><th>Employee</th><th>Type</th><th>Requested</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody id="manualAdminRows"><tr><td colspan="6">Loading…</td></tr></tbody></table><h3>Set Shift GPS Work Area</h3><div class="toolbar"><input id="geoShiftId" placeholder="Shift ID"><input id="geoLocation" placeholder="Work location name/address"><input id="geoRadius" type="number" min="50" max="5000" value="250" placeholder="Radius meters"><input id="geoLatitude" type="number" step="any" placeholder="Latitude"><input id="geoLongitude" type="number" step="any" placeholder="Longitude"><button id="geoUseCurrent">Use Current Location</button><button id="geoSave">Save GPS Work Area</button></div><div id="geoStatus"></div>`;
    admin.append(panel);
    const load=async()=>{const body=document.getElementById('manualAdminRows');try{const rows=await api('/api/admin/time-attendance/manual-punch-requests');body.innerHTML=(rows||[]).map(r=>`<tr><td>${r.employeeName||r.employeeId}</td><td>${r.punchType}</td><td>${new Date(r.requestedAt).toLocaleString()}</td><td>${r.reason}</td><td>${r.status}</td><td>${r.status==='PENDING'?`<button data-review="APPROVED" data-id="${r.id}">Approve</button> <button data-review="DENIED" data-id="${r.id}">Deny</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6">No requests.</td></tr>';body.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{const notes=prompt('Review notes (optional)')||'';await api(`/api/admin/time-attendance/manual-punch-requests/${b.dataset.id}`,{method:'PATCH',body:JSON.stringify({status:b.dataset.review,reviewNotes:notes})});load()})}catch(e){body.innerHTML=`<tr><td colspan="6">${e.message}</td></tr>`}};
    document.getElementById('refreshManualAdmin').onclick=load;
    document.getElementById('geoUseCurrent').onclick=async()=>{try{const gps=await getGps();document.getElementById('geoLatitude').value=gps.latitude;document.getElementById('geoLongitude').value=gps.longitude;document.getElementById('geoStatus').textContent='Current location captured. Confirm the work location name and radius, then save.'}catch(e){document.getElementById('geoStatus').textContent=e.message}};
    document.getElementById('geoSave').onclick=async()=>{const status=document.getElementById('geoStatus');try{await api(`/api/admin/time-attendance/shifts/${document.getElementById('geoShiftId').value}/geofence`,{method:'PATCH',body:JSON.stringify({location:document.getElementById('geoLocation').value,geofenceRadiusMeters:Number(document.getElementById('geoRadius').value),latitude:Number(document.getElementById('geoLatitude').value),longitude:Number(document.getElementById('geoLongitude').value)})});status.textContent='GPS work area saved for this shift.'}catch(e){status.textContent=e.message}};
    load();
  };

  const init=()=>{addManualPanel();replaceClockHandler('clockInBtn','/api/time-attendance/clock/geofenced-in','Clock in');replaceClockHandler('clockOutBtn','/api/time-attendance/clock/geofenced-out','Clock out');addAdminReview();loadManual();if(location.hash==='#admin'){const adminTab=document.getElementById('adminTab');if(adminTab&&!adminTab.hidden)adminTab.click()}};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
