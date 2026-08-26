(()=>{
  'use strict';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';
  const state={employees:[],visibleEmployees:[],selected:null,armedId:null,gap:null,files:[],searchTimer:null};
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]));
  const normalize=value=>String(value??'').toLowerCase().replaceAll('_',' ').replace(/\s+/g,' ').trim();
  const date=value=>value?new Date(value).toLocaleString():'—';
  const selectedEmployeeId=()=>state.selected?.id||state.selected?.userId||'';
  const selectedEntityId=()=>state.selected?.legalEntityId||'';
  const humanEmployeeNumber=row=>/^SH\d+$/i.test(String(row?.employeeNumber||'').trim())?String(row.employeeNumber).trim().toUpperCase():'Pending assignment';
  const headers=(json=true,entityId='')=>({...(json?{'content-type':'application/json'}:{}),authorization:`Bearer ${token()}`,...(entityId?{'x-legal-entity-id':entityId}:{})});

  async function api(path,options={}){
    const entityId=options.entityId??selectedEntityId();
    const request={...options};
    delete request.entityId;
    const response=await fetch(`${API}${path}`,{...request,cache:'no-store',headers:{...headers(request.body!==undefined,entityId),...(request.headers||{})}});
    const type=response.headers.get('content-type')||'';
    const payload=type.includes('json')?await response.json():await response.arrayBuffer();
    if(!response.ok)throw new Error(payload?.error||`Request failed (${response.status})`);
    return payload;
  }
  function notice(message,error=false){
    const node=$('notice');
    if(!node)return;
    node.textContent=message;
    node.classList.remove('hidden');
    node.style.background=error?'#ffe9ec':'#eaf7ef';
    node.style.borderColor=error?'#e8a9b2':'#9bd0ad';
    clearTimeout(notice.timer);
    notice.timer=setTimeout(()=>node.classList.add('hidden'),7000);
  }
  function employeeName(row){return row.displayName||row.fullName||row.name||[row.firstName,row.middleName,row.lastName].filter(Boolean).join(' ')||row.email||'Employee'}
  function employeeStatus(row){return row.employmentStatus||row.status||'ACTIVE'}
  function employeeSearchText(row){return normalize([
    employeeName(row),row.email,row.username,row.role,row.jobTitle,row.department,row.team,row.location,row.locationName,
    employeeStatus(row),row.employeeNumber,row.phone,row.mobilePhone,row.managerName,row.supervisorName
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
    }).sort((a,b)=>{
      const aNum=Number(String(a.employeeNumber||'').replace(/\D/g,''))||Number.MAX_SAFE_INTEGER;
      const bNum=Number(String(b.employeeNumber||'').replace(/\D/g,''))||Number.MAX_SAFE_INTEGER;
      return aNum-bNum||employeeName(a).localeCompare(employeeName(b));
    });
  }
  function rowId(row){return row.id||row.userId||row.employeeId||''}
  function renderDirectory(){
    state.visibleEmployees=filteredEmployees();
    $('searchResultCount').textContent=`${state.visibleEmployees.length} of ${state.employees.length}`;
    $('employees').innerHTML=state.visibleEmployees.map(row=>{
      const id=rowId(row),active=selectedEmployeeId()===id,armed=state.armedId===id,status=employeeStatus(row),number=humanEmployeeNumber(row);
      return `<button type="button" class="employee ${active?'active':''} ${armed?'armed':''}" data-id="${esc(id)}" aria-label="${esc(employeeName(row))}. Double click to open employee record."><span class="employee-name"><strong>${esc(employeeName(row))}</strong><span class="tag ${normalize(status)==='active'?'active':''}">${esc(String(status).replaceAll('_',' '))}</span></span><div class="employee-sub">${esc(row.jobTitle||String(row.role||'Employee').replaceAll('_',' '))}${row.department?` • ${esc(row.department)}`:''}</div><span class="employee-tags"><span class="tag">${esc(number)}</span>${row.email?`<span class="tag">${esc(row.email)}</span>`:''}</span>${armed&&!active?'<div class="open-hint">Double-click to open this employee</div>':''}</button>`;
    }).join('')||'<div style="padding:22px 16px"><strong>No matching employees</strong><p style="color:#66788a;margin:6px 0 0;font-size:13px">Try a name, email, role, department, status or SH employee number.</p></div>';
    document.querySelectorAll('.employee').forEach(button=>{
      button.addEventListener('click',()=>{state.armedId=button.dataset.id;renderDirectory()});
      button.addEventListener('dblclick',event=>{event.preventDefault();openEmployee(button.dataset.id)});
      button.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();openEmployee(button.dataset.id)}});
    });
  }
  function runSearch(){renderDirectory()}
  function clearSearch(){
    $('employeeSearch').value='';
    $('employeeStatusFilter').value='';
    $('employeeDepartmentFilter').value='';
    state.armedId=null;
    renderDirectory();
    $('employeeSearch').focus();
  }
  function rowsTable(rows,columns){if(!rows.length)return '<p style="color:#66788a">No records.</p>';return `<div class="table-wrap"><table class="table"><thead><tr>${columns.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${columns.map(c=>`<td>${c.render?c.render(row):esc(row[c.key]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
  function selectedRows(name){const id=selectedEmployeeId();return (state.gap?.[name]||[]).filter(row=>row.employeeId===id||row.userId===id)}

  function switchTab(tab){
    const safe=['overview','management','files','onboarding','assignments','time','communications','security','audit'];
    if(!safe.includes(tab))tab='overview';
    const button=document.querySelector(`#tabs button[data-tab="${CSS.escape(tab)}"]`);
    if(!button)return;
    document.querySelectorAll('#tabs button[data-tab]').forEach(node=>node.classList.toggle('active',node===button));
    document.querySelectorAll('.section[id^="tab-"]').forEach(node=>node.classList.toggle('active',node.id===`tab-${tab}`));
  }

  async function reconcileEmployeeNumbers(){
    try{
      const response=await api('/api/admin/employee-numbers/reconcile',{method:'POST',body:'{}',entityId:''});
      return Number(response?.data?.changed||0);
    }catch(error){
      console.warn('Employee number reconciliation is not available yet:',error.message);
      return 0;
    }
  }
  async function fetchEmployees(){
    const response=await api('/api/admin/employees',{entityId:''});
    return response.data?.employees||response.data||[];
  }
  async function load(){
    if(!token()){location.href='/employee-login.html?returnTo='+encodeURIComponent('/employee360.html');return}
    try{
      const [session,initialEmployees,gap]=await Promise.all([api('/api/session',{entityId:''}),fetchEmployees(),api('/api/admin/employee360/enterprise-gap-dashboard',{entityId:''})]);
      const profile=session.data||session;
      state.employees=initialEmployees;
      state.gap=gap.data||{};
      $('identity').textContent=`${profile.displayName||profile.email||''} • ${String(profile.role||'').replaceAll('_',' ')}`;
      $('mEmployees').textContent=state.employees.length;
      $('mBlocked').textContent=state.gap.metrics?.blockedAssignments??0;
      $('mFailed').textContent=state.gap.metrics?.failedCommunications??0;
      $('mFiles').textContent='—';
      populateSearchFilters();
      renderDirectory();
      const changed=await reconcileEmployeeNumbers();
      if(changed>0){
        state.employees=await fetchEmployees();
        $('mEmployees').textContent=state.employees.length;
        populateSearchFilters();
        renderDirectory();
      }
      // Employee 360 intentionally opens with no employee record selected.
    }catch(error){notice(error.message,true)}
  }

  async function openEmployee(id){
    state.selected=state.employees.find(row=>rowId(row)===id||row.userId===id||row.employeeId===id);
    if(!state.selected)return;
    state.armedId=id;
    $('empty').classList.add('hidden');
    $('workspace').classList.remove('hidden');
    $('employeeName').textContent=employeeName(state.selected);
    const number=humanEmployeeNumber(state.selected);
    $('employeeMeta').innerHTML=[`<span class="employee-number">Employee # ${esc(number)}</span>`,esc(state.selected.jobTitle||String(state.selected.role||'Employee').replaceAll('_',' ')),esc(state.selected.department||''),esc(state.selected.email||'')].filter(Boolean).join(' • ');
    $('managementEmployeeNumber').textContent=number;
    $('managementStatus').value=employeeStatus(state.selected);
    const badge=$('employeeStatusBadge'),status=employeeStatus(state.selected);
    badge.textContent=String(status).replaceAll('_',' ');
    badge.style.background=normalize(status)==='active'?'#e8f5ed':'#fff3dc';
    badge.style.color=normalize(status)==='active'?'#207449':'#8a5a13';
    renderDirectory();
    const hash=location.hash.replace(/^#/,'');
    switchTab(['files','audit','management'].includes(hash)?hash:'overview');
    await refreshEmployee();
  }

  async function refreshEmployee(){
    if(!state.selected)return;
    try{
      const files=await api(`/api/admin/employee360/secure-files?employeeId=${encodeURIComponent(selectedEmployeeId())}`);
      state.files=files.data||[];
      $('mFiles').textContent=state.files.length;
      renderEmployee();
    }catch(error){notice(error.message,true)}
  }
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
      ['Employee number',humanEmployeeNumber(state.selected)],['Employment status',employeeStatus(state.selected)],
      ['Role / title',state.selected.jobTitle||String(state.selected.role||'Employee').replaceAll('_',' ')],['Department',state.selected.department||'—'],
      ['Hire date',state.selected.hireDate?new Date(state.selected.hireDate).toLocaleDateString():'—'],['Primary location',assignments.find(r=>r.assignmentType==='PRIMARY_LOCATION')?.locationId||'—'],
      ['Operational attention',attention?`${attention} item${attention===1?'':'s'} need review`:'No immediate exceptions'],['Secure files',state.files.length]
    ].map(([label,value])=>`<div class="card overview-card"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    $('filesTable').innerHTML=rowsTable(state.files,[{label:'File',render:r=>`<strong>${esc(r.fileName)}</strong><br><span style="color:#66788a">${esc(r.category)} • v${esc(r.version)}</span>`},{label:'Security',render:r=>`<span class="status">${esc(r.encryption)}</span><br>${esc(r.malwareStatus)}`},{label:'Retention',render:r=>`${date(r.retentionUntil)}${r.legalHold?'<br><span class="danger">Legal hold</span>':''}`},{label:'Actions',render:r=>`<button data-download="${esc(r.id)}">Download</button>`}]);
    document.querySelectorAll('[data-download]').forEach(button=>button.addEventListener('click',()=>downloadFile(button.dataset.download)));
    $('assignmentsTable').innerHTML=rowsTable(assignments,[{label:'Type',key:'assignmentType'},{label:'Location',key:'locationId'},{label:'Client',key:'clientId'},{label:'Eligibility',render:r=>`<span class="status ${r.eligibilityStatus==='ELIGIBLE'?'ok':'danger'}">${esc(r.eligibilityStatus)}</span>`},{label:'Dates',render:r=>`${date(r.startsAt)} – ${date(r.endsAt)}`}]);
    $('timeTable').innerHTML='<h3>Time corrections</h3>'+rowsTable(corrections,[{label:'Entry',key:'timeEntryId'},{label:'Clock in',render:r=>date(r.clockIn)},{label:'Clock out',render:r=>date(r.clockOut)},{label:'GPS',key:'gpsExceptionStatus'},{label:'Reason',key:'reason'}])+'<h3>Payroll-period signoffs</h3>'+rowsTable(signoffs,[{label:'Period',render:r=>`${date(r.periodStart)} – ${date(r.periodEnd)}`},{label:'Status',key:'status'},{label:'Reason',key:'reason'}]);
    $('communicationsTable').innerHTML=rowsTable(communications,[{label:'When',render:r=>date(r.createdAt)},{label:'Channel',key:'channel'},{label:'Category',key:'category'},{label:'Subject',key:'subject'},{label:'Status',key:'status'}]);
    $('securityTable').innerHTML=rowsTable(security,[{label:'When',render:r=>date(r.createdAt)},{label:'Action',key:'action'},{label:'Portal',key:'portal'},{label:'Reason',key:'reason'},{label:'IP',key:'ipAddress'}]);
    $('auditTable').innerHTML=rowsTable(audit,[{label:'When',render:r=>date(r.createdAt)},{label:'Actor',render:r=>`${esc(r.actorEmail||'System user')}<br><span style="color:#66788a">${esc(r.actorRole||'')}</span>`},{label:'Action',key:'action'},{label:'Decision',key:'decision'},{label:'Reason',key:'reason'}]);
  }

  async function refreshDirectoryKeepSelection(){
    const selectedId=selectedEmployeeId();
    state.employees=await fetchEmployees();
    populateSearchFilters();
    state.selected=selectedId?state.employees.find(row=>rowId(row)===selectedId||row.userId===selectedId)||state.selected:state.selected;
    renderDirectory();
    if(state.selected){
      $('managementStatus').value=employeeStatus(state.selected);
      $('managementEmployeeNumber').textContent=humanEmployeeNumber(state.selected);
      const badge=$('employeeStatusBadge');
      badge.textContent=String(employeeStatus(state.selected)).replaceAll('_',' ');
    }
  }
  async function managementAction(path,{method='POST',body,success='Employee record updated.'}={}){
    if(!state.selected)return notice('Double-click an employee first.',true);
    try{
      await api(path,{method,body:body===undefined?undefined:JSON.stringify(body)});
      notice(success);
      await refreshDirectoryKeepSelection();
      renderEmployee();
    }catch(error){notice(error.message,true)}
  }
  async function saveEmploymentStatus(){
    const status=$('managementStatus').value;
    if(status==='TERMINATED'&&!confirm('Terminate this employee record? This changes the employment status to TERMINATED.'))return;
    await managementAction(`/api/admin/employees/${encodeURIComponent(selectedEmployeeId())}/status`,{method:'PATCH',body:{status},success:`Employment status updated to ${status}.`});
  }
  async function resetAccess(){await managementAction(`/api/admin/employees/${encodeURIComponent(selectedEmployeeId())}/access/reset`,{body:{sendEmail:true},success:'Password reset instructions were issued and emailed.'})}
  async function resendAccess(){await managementAction(`/api/admin/employees/${encodeURIComponent(selectedEmployeeId())}/access/resend`,{body:{},success:'Employee portal access was resent.'})}
  async function unlockAccess(){await managementAction(`/api/admin/employees/${encodeURIComponent(selectedEmployeeId())}/access/unlock`,{body:{},success:'Employee account was unlocked.'})}
  async function syncIdentity(){await managementAction(`/api/admin/employees/${encodeURIComponent(selectedEmployeeId())}/access/sync`,{body:{},success:'Employee identity was synchronized.'})}
  async function assignEducation(){
    const courseCode=$('educationCourseCode').value.trim(),title=$('educationTitle').value.trim(),dueDate=$('educationDueDate').value,reason=$('educationReason').value.trim();
    if(!courseCode||!title)return notice('Enter a course code and course title.',true);
    await managementAction(`/api/admin/employees/${encodeURIComponent(selectedEmployeeId())}/education`,{body:{courseCode,title,dueDate:dueDate||null,reason:reason||'Assigned from Employee 360'},success:'Learning assignment created.'});
    $('educationCourseCode').value='';$('educationTitle').value='';$('educationDueDate').value='';$('educationReason').value='';
  }
  async function sendEmployeeEmail(){
    const subject=$('employeeEmailSubject').value.trim(),body=$('employeeEmailBody').value.trim();
    if(!subject||!body)return notice('Enter both a subject and message.',true);
    await managementAction(`/api/admin/employees/${encodeURIComponent(selectedEmployeeId())}/email`,{body:{subject,body},success:'Employee communication sent and logged.'});
    $('employeeEmailSubject').value='';$('employeeEmailBody').value='';
  }

  async function uploadFile(){
    if(!state.selected)return notice('Double-click an employee first.',true);
    const file=$('secureFile').files[0];
    if(!file)return notice('Choose a file first.',true);
    if(file.size>25_000_000)return notice('File exceeds the 25 MB limit.',true);
    const reason=$('fileReason').value.trim();
    if(reason.length<3)return notice('Enter a reason for the upload.',true);
    const reader=new FileReader();
    reader.onload=async()=>{try{const base64=String(reader.result).split(',')[1];await api('/api/admin/employee360/secure-files',{method:'POST',body:JSON.stringify({employeeId:selectedEmployeeId(),category:$('fileCategory').value,sensitivity:$('fileSensitivity').value,fileName:file.name,mimeType:file.type||'application/octet-stream',fileDataBase64:base64,reason})});notice('File scanned, encrypted and stored.');$('secureFile').value='';$('fileReason').value='';await refreshEmployee()}catch(error){notice(error.message,true)}};
    reader.readAsDataURL(file);
  }
  async function convertApplicant(){
    if(!state.selected)return notice('Double-click an employee first.',true);
    try{const applicationId=$('applicationId').value.trim(),reason=$('onboardingReason').value.trim();if(!applicationId||reason.length<3)throw new Error('Enter the application ID and conversion reason.');const result=await api('/api/admin/employee360/onboarding/convert',{method:'POST',body:JSON.stringify({applicationId,employeeId:selectedEmployeeId(),reason})});$('onboardingResult').innerHTML=`<div class="notice">Linked applicant ${esc(applicationId)}. Imported ${esc(result.data.historyCount)} status events, ${esc(result.data.interviewCount)} interviews and ${esc(result.data.messageCount)} messages.</div>`;notice('Applicant folder linked to Employee 360.')}catch(error){notice(error.message,true)}
  }
  async function downloadFile(id){
    try{const response=await fetch(`${API}/api/admin/employee360/secure-files/${encodeURIComponent(id)}/download`,{headers:headers(false,selectedEntityId())});if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||`Download failed (${response.status})`)}const blob=await response.blob();const disposition=response.headers.get('content-disposition')||'';const match=disposition.match(/filename="([^"]+)"/);const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=match?.[1]||'employee-document';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}catch(error){notice(error.message,true)}
  }

  $('employeeSearch').addEventListener('input',()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(renderDirectory,90)});
  $('employeeSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();runSearch()}else if(event.key==='Escape'){event.preventDefault();clearSearch()}});
  $('employeeSearchButton').addEventListener('click',runSearch);
  $('employeeSearchClear').addEventListener('click',clearSearch);
  $('employeeStatusFilter').addEventListener('change',renderDirectory);
  $('employeeDepartmentFilter').addEventListener('change',renderDirectory);
  $('uploadFile').addEventListener('click',uploadFile);
  $('convertApplicant').addEventListener('click',convertApplicant);
  $('saveEmploymentStatus').addEventListener('click',saveEmploymentStatus);
  $('resetAccess').addEventListener('click',resetAccess);
  $('resendAccess').addEventListener('click',resendAccess);
  $('unlockAccess').addEventListener('click',unlockAccess);
  $('syncIdentity').addEventListener('click',syncIdentity);
  $('assignEducation').addEventListener('click',assignEducation);
  $('sendEmployeeEmail').addEventListener('click',sendEmployeeEmail);
  $('logout').addEventListener('click',()=>{sessionStorage.removeItem('sulandra:employee:access-token');localStorage.removeItem('sulandra:employee:access-token');location.href='/employee-login.html'});
  $('tabs').addEventListener('click',event=>{const button=event.target.closest('button[data-tab]');if(button)switchTab(button.dataset.tab)});
  document.querySelectorAll('[data-open-tab]').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.openTab)));
  load();
})();
