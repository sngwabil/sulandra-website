(()=>{
  'use strict';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';
  const state={employees:[],visibleEmployees:[],selected:null,gap:null,files:[],searchTimer:null};
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const date=value=>value?new Date(value).toLocaleString():'—';
  const headers=(json=true)=>({...json?{'content-type':'application/json'}:{},authorization:`Bearer ${token()}`});
  const normalize=value=>String(value??'').toLowerCase().replaceAll('_',' ').replace(/\s+/g,' ').trim();
  const selectedEmployeeId=()=>state.selected?.id||state.selected?.userId||'';
  async function api(path,options={}){const response=await fetch(`${API}${path}`,{...options,headers:{...headers(options.body!==undefined),...(options.headers||{})}});const type=response.headers.get('content-type')||'';const payload=type.includes('json')?await response.json():await response.arrayBuffer();if(!response.ok)throw new Error(payload?.error||`Request failed (${response.status})`);return payload}
  function notice(message,error=false){const node=$('notice');node.textContent=message;node.classList.remove('hidden');node.style.background=error?'#ffe9ec':'#eaf7ef';node.style.borderColor=error?'#e8a9b2':'#9bd0ad';setTimeout(()=>node.classList.add('hidden'),7000)}
  function employeeName(row){return row.displayName||row.fullName||row.name||[row.firstName,row.middleName,row.lastName].filter(Boolean).join(' ')||row.email||row.id||row.userId}
  function employeeStatus(row){return row.employmentStatus||row.status||'ACTIVE'}
  function employeeSearchText(row){return normalize([
    employeeName(row),row.email,row.username,row.role,row.jobTitle,row.department,row.team,row.location,row.locationName,
    employeeStatus(row),row.id,row.userId,row.employeeId,row.phone,row.mobilePhone,row.managerName,row.supervisorName
  ].filter(Boolean).join(' '))}
  function populateSearchFilters(){
    const statuses=[...new Set(state.employees.map(employeeStatus).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
    const departments=[...new Set(state.employees.map(row=>row.department).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
    $('employeeStatusFilter').innerHTML='<option value="">All statuses</option>'+statuses.map(value=>`<option value="${esc(value)}">${esc(String(value).replaceAll('_',' '))}</option>`).join('');
    $('employeeDepartmentFilter').innerHTML='<option value="">All departments</option>'+departments.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
  }
  function filteredEmployees(){
    const query=normalize($('employeeSearch').value);
    const tokens=query.split(' ').filter(Boolean);
    const status=normalize($('employeeStatusFilter').value);
    const department=normalize($('employeeDepartmentFilter').value);
    return state.employees.filter(row=>{
      const haystack=employeeSearchText(row);
      if(tokens.length&&!tokens.every(part=>haystack.includes(part)))return false;
      if(status&&normalize(employeeStatus(row))!==status)return false;
      if(department&&normalize(row.department)!==department)return false;
      return true;
    }).sort((a,b)=>employeeName(a).localeCompare(employeeName(b)));
  }
  function renderDirectory(){
    state.visibleEmployees=filteredEmployees();
    const total=state.employees.length;
    $('searchResultCount').textContent=`${state.visibleEmployees.length} of ${total}`;
    $('employees').innerHTML=state.visibleEmployees.map(row=>{
      const id=row.id||row.userId||row.employeeId;
      const active=selectedEmployeeId()===id;
      const status=employeeStatus(row);
      return `<button class="employee ${active?'active':''}" data-id="${esc(id)}"><span class="employee-name"><strong>${esc(employeeName(row))}</strong><span class="tag ${normalize(status)==='active'?'active':''}">${esc(String(status).replaceAll('_',' '))}</span></span><span class="muted">${esc(row.jobTitle||String(row.role||'Employee').replaceAll('_',' '))}${row.department?` • ${esc(row.department)}`:''}</span><span class="employee-tags">${row.email?`<span class="tag">${esc(row.email)}</span>`:''}${row.employeeId?`<span class="tag">ID ${esc(row.employeeId)}</span>`:''}</span></button>`;
    }).join('')||'<div style="padding:22px 16px"><strong>No matching employees</strong><p class="muted" style="margin:6px 0 0">Try a name, email, role, department, status or employee ID.</p></div>';
    document.querySelectorAll('.employee').forEach(button=>button.addEventListener('click',()=>selectEmployee(button.dataset.id)));
  }
  function runSearch(openFirst=false){
    renderDirectory();
    if(openFirst&&state.visibleEmployees.length){
      const row=state.visibleEmployees[0];
      selectEmployee(row.id||row.userId||row.employeeId);
    }
  }
  function clearSearch(){
    $('employeeSearch').value='';
    $('employeeStatusFilter').value='';
    $('employeeDepartmentFilter').value='';
    renderDirectory();
    $('employeeSearch').focus();
  }
  function rowsTable(rows,columns){if(!rows.length)return '<p class="muted">No records.</p>';return `<div class="table-wrap"><table class="table"><thead><tr>${columns.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${columns.map(c=>`<td>${c.render?c.render(row):esc(row[c.key]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
  function selectedRows(name){const id=selectedEmployeeId();return (state.gap?.[name]||[]).filter(row=>row.employeeId===id||row.userId===id)}
  function switchTab(tab){
    const button=document.querySelector(`#tabs button[data-tab="${CSS.escape(tab)}"]`);
    if(!button)return;
    document.querySelectorAll('.tabs button').forEach(node=>node.classList.toggle('active',node===button));
    document.querySelectorAll('.section').forEach(node=>node.classList.toggle('active',node.id===`tab-${tab}`));
    button.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  async function load(){
    if(!token()){location.href='/admin-login.html?returnTo='+encodeURIComponent('/employee360.html');return}
    try{
      const [session,employees,gap]=await Promise.all([api('/api/session'),api('/api/admin/employees'),api('/api/admin/employee360/enterprise-gap-dashboard')]);
      const profile=session.data||session;
      state.employees=employees.data?.employees||employees.data||[];
      state.gap=gap.data||{};
      $('identity').textContent=`${profile.displayName||profile.email||''} • ${String(profile.role||'').replaceAll('_',' ')}`;
      $('mEmployees').textContent=state.employees.length;
      $('mBlocked').textContent=state.gap.metrics?.blockedAssignments??0;
      $('mFailed').textContent=state.gap.metrics?.failedCommunications??0;
      $('mFiles').textContent='—';
      populateSearchFilters();
      renderDirectory();
      if(state.employees.length===1){const only=state.employees[0];await selectEmployee(only.id||only.userId||only.employeeId)}
    }catch(error){notice(error.message,true)}
  }
  async function selectEmployee(id){
    state.selected=state.employees.find(row=>row.id===id||row.userId===id||row.employeeId===id);
    if(!state.selected)return;
    $('empty').classList.add('hidden');
    $('workspace').classList.remove('hidden');
    $('employeeName').textContent=employeeName(state.selected);
    $('employeeMeta').textContent=[state.selected.jobTitle||String(state.selected.role||'Employee').replaceAll('_',' '),state.selected.department,state.selected.email,selectedEmployeeId()?`ID ${selectedEmployeeId()}`:'' ].filter(Boolean).join(' • ');
    const status=employeeStatus(state.selected);
    const badge=$('employeeStatusBadge');
    badge.textContent=String(status).replaceAll('_',' ');
    badge.style.background=normalize(status)==='active'?'#e8f5ed':'#fff3dc';
    badge.style.color=normalize(status)==='active'?'#207449':'#8a5a13';
    renderDirectory();
    await refreshEmployee();
  }
  async function refreshEmployee(){try{const files=await api(`/api/admin/employee360/secure-files?employeeId=${encodeURIComponent(selectedEmployeeId())}`);state.files=files.data||[];$('mFiles').textContent=state.files.length;renderEmployee()}catch(error){notice(error.message,true)}}
  function renderEmployee(){
    const employeeId=selectedEmployeeId();
    const assignments=selectedRows('assignments'),corrections=selectedRows('corrections'),signoffs=selectedRows('signoffs'),communications=selectedRows('communications'),security=selectedRows('security'),audit=(state.gap.audit||[]).filter(row=>row.employeeId===employeeId||row.userId===employeeId);
    const blocked=assignments.filter(row=>row.eligibilityStatus&&String(row.eligibilityStatus).toUpperCase()!=='ELIGIBLE').length;
    const failedComms=communications.filter(row=>['FAILED','FAIL','ERROR','BOUNCED','UNDELIVERED'].includes(String(row.status||'').toUpperCase())).length;
    $('pulseAssignments').textContent=blocked?`${assignments.length} • ${blocked} blocked`:String(assignments.length);
    $('pulseFiles').textContent=String(state.files.length);
    $('pulseCommunications').textContent=failedComms?`${communications.length} • ${failedComms} failed`:String(communications.length);
    $('pulseSecurity').textContent=String(security.length+audit.length);
    const attention=blocked+failedComms;
    $('overviewGrid').innerHTML=[
      ['Employment status',employeeStatus(state.selected)],['Role / title',state.selected.jobTitle||String(state.selected.role||'Employee').replaceAll('_',' ')],
      ['Department',state.selected.department||'—'],['Primary location',assignments.find(r=>r.assignmentType==='PRIMARY_LOCATION')?.locationId||'—'],
      ['Operational attention',attention?`${attention} item${attention===1?'':'s'} need review`:'No immediate exceptions'],['Secure files',state.files.length],
      ['Communications',communications.length],['Security + audit events',security.length+audit.length]
    ].map(([label,value])=>`<div class="card overview-card"><span class="muted">${esc(label)}</span><strong style="display:block;margin-top:7px">${esc(value)}</strong></div>`).join('');
    $('filesTable').innerHTML=rowsTable(state.files,[{label:'File',render:r=>`<strong>${esc(r.fileName)}</strong><br><span class="muted">${esc(r.category)} • v${esc(r.version)}</span>`},{label:'Security',render:r=>`<span class="status">${esc(r.encryption)}</span><br>${esc(r.malwareStatus)}`},{label:'Retention',render:r=>`${date(r.retentionUntil)}${r.legalHold?'<br><span class="danger">Legal hold</span>':''}`},{label:'Actions',render:r=>`<button data-download="${esc(r.id)}">Download</button>`}]);
    document.querySelectorAll('[data-download]').forEach(button=>button.addEventListener('click',()=>downloadFile(button.dataset.download)));
    $('assignmentsTable').innerHTML=rowsTable(assignments,[{label:'Type',key:'assignmentType'},{label:'Location',key:'locationId'},{label:'Client',key:'clientId'},{label:'Eligibility',render:r=>`<span class="status ${r.eligibilityStatus==='ELIGIBLE'?'ok':'danger'}">${esc(r.eligibilityStatus)}</span>`},{label:'Dates',render:r=>`${date(r.startsAt)} – ${date(r.endsAt)}`}]);
    $('timeTable').innerHTML='<h3>Time corrections</h3>'+rowsTable(corrections,[{label:'Entry',key:'timeEntryId'},{label:'Clock in',render:r=>date(r.clockIn)},{label:'Clock out',render:r=>date(r.clockOut)},{label:'GPS',key:'gpsExceptionStatus'},{label:'Reason',key:'reason'}])+'<h3>Payroll-period signoffs</h3>'+rowsTable(signoffs,[{label:'Period',render:r=>`${date(r.periodStart)} – ${date(r.periodEnd)}`},{label:'Status',key:'status'},{label:'Reason',key:'reason'}]);
    $('communicationsTable').innerHTML=rowsTable(communications,[{label:'When',render:r=>date(r.createdAt)},{label:'Channel',key:'channel'},{label:'Category',key:'category'},{label:'Subject',key:'subject'},{label:'Status',key:'status'}]);
    $('securityTable').innerHTML=rowsTable(security,[{label:'When',render:r=>date(r.createdAt)},{label:'Action',key:'action'},{label:'Portal',key:'portal'},{label:'Reason',key:'reason'},{label:'IP',key:'ipAddress'}]);
    $('auditTable').innerHTML=rowsTable(audit,[{label:'When',render:r=>date(r.createdAt)},{label:'Actor',render:r=>`${esc(r.actorEmail||r.actorUserId)}<br><span class="muted">${esc(r.actorRole)}</span>`},{label:'Action',key:'action'},{label:'Decision',key:'decision'},{label:'Reason',key:'reason'}]);
  }
  async function uploadFile(){const file=$('secureFile').files[0];if(!file)return notice('Choose a file first.',true);if(file.size>25_000_000)return notice('File exceeds the 25 MB limit.',true);const reason=$('fileReason').value.trim();if(reason.length<3)return notice('Enter a reason for the upload.',true);const reader=new FileReader();reader.onload=async()=>{try{const base64=String(reader.result).split(',')[1];await api('/api/admin/employee360/secure-files',{method:'POST',body:JSON.stringify({employeeId:selectedEmployeeId(),category:$('fileCategory').value,sensitivity:$('fileSensitivity').value,fileName:file.name,mimeType:file.type||'application/octet-stream',fileDataBase64:base64,reason})});notice('File scanned, encrypted and stored.');$('secureFile').value='';$('fileReason').value='';await refreshEmployee()}catch(error){notice(error.message,true)}};reader.readAsDataURL(file)}
  async function convertApplicant(){try{const applicationId=$('applicationId').value.trim(),reason=$('onboardingReason').value.trim();if(!applicationId||reason.length<3)throw new Error('Enter the application ID and conversion reason.');const result=await api('/api/admin/employee360/onboarding/convert',{method:'POST',body:JSON.stringify({applicationId,employeeId:selectedEmployeeId(),reason})});$('onboardingResult').innerHTML=`<div class="notice">Linked applicant ${esc(applicationId)}. Imported ${esc(result.data.historyCount)} status events, ${esc(result.data.interviewCount)} interviews and ${esc(result.data.messageCount)} messages.</div>`;notice('Applicant folder linked to Employee 360.')}catch(error){notice(error.message,true)}}
  async function downloadFile(id){try{const response=await fetch(`${API}/api/admin/employee360/secure-files/${encodeURIComponent(id)}/download`,{headers:headers(false)});if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||`Download failed (${response.status})`)}const blob=await response.blob();const disposition=response.headers.get('content-disposition')||'';const match=disposition.match(/filename="([^"]+)"/);const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=match?.[1]||'employee-document';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}catch(error){notice(error.message,true)}}
  $('employeeSearch').addEventListener('input',()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(renderDirectory,90)});
  $('employeeSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();runSearch(true)}else if(event.key==='Escape'){event.preventDefault();clearSearch()}});
  $('employeeSearchButton').addEventListener('click',()=>runSearch(true));
  $('employeeSearchClear').addEventListener('click',clearSearch);
  $('employeeStatusFilter').addEventListener('change',renderDirectory);
  $('employeeDepartmentFilter').addEventListener('change',renderDirectory);
  $('uploadFile').addEventListener('click',uploadFile);
  $('convertApplicant').addEventListener('click',convertApplicant);
  $('logout').addEventListener('click',()=>{sessionStorage.removeItem('sulandra:employee:access-token');localStorage.removeItem('sulandra:employee:access-token');location.href='/admin-login.html'});
  $('tabs').addEventListener('click',event=>{const button=event.target.closest('button[data-tab]');if(button)switchTab(button.dataset.tab)});
  document.querySelectorAll('[data-open-tab]').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.openTab)));
  load();
})();
