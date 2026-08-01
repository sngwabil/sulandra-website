(()=>{
'use strict';
const API_ROOT='https://sulandra-website-production.up.railway.app';
const TOKEN_KEY='sulandra:employee:access-token';
const byId=id=>document.getElementById(id);
let courses=[];

async function api(path,options={}){
  const response=await fetch(API_ROOT+path,{...options,cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+(sessionStorage.getItem(TOKEN_KEY)||''),...(options.headers||{})}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload.error||`Request failed (${response.status})`);
  return payload;
}
function safe(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function notify(message){const box=byId('toast');if(!box){alert(message);return;}box.textContent=message;box.style.display='block';clearTimeout(window.__educationToastTimer);window.__educationToastTimer=setTimeout(()=>box.style.display='none',4200);}
async function getActiveCourses(){const response=await fetch('/education-catalog.json',{cache:'no-store'});if(!response.ok)throw new Error('The education catalog could not be loaded.');const payload=await response.json();courses=(payload.courses||[]).filter(course=>course.active===true);return courses;}
function courseByCode(code){return courses.find(course=>course.code===code)||{};}
function selectedEmployeeIds(){return [...document.querySelectorAll('#employeeList input[type="checkbox"]:checked')].map(input=>String(input.value||'').trim()).filter(Boolean);}

async function connectBulkAssignment(){
  const button=byId('assignSelectedBtn');if(!button)return;
  button.onclick=async()=>{
    const employeeIds=selectedEmployeeIds();if(!employeeIds.length){notify('Select at least one employee.');return;}
    const packageCode=byId('packageSelect')?.value||'INITIAL';const customCourseCode=byId('customCourseSelect')?.value||'';
    if(packageCode==='CUSTOM'&&!customCourseCode){notify('Select a course.');return;}
    const originalText=button.textContent;button.disabled=true;button.textContent='Assigning education…';
    try{
      const active=await getActiveCourses();const selectedCourse=active.find(course=>course.code===customCourseCode);
      const courseCodes=packageCode==='CUSTOM'?[customCourseCode]:active.map(course=>course.code);
      if(!courseCodes.length)throw new Error('No active courses are available in this education package.');
      const result=await api('/api/admin/education/bulk-assign',{method:'POST',body:JSON.stringify({employeeIds,packageCode,courseCode:packageCode==='CUSTOM'?customCourseCode:null,courseCodes,courseTitle:selectedCourse?.title,dueDate:byId('bulkDueDate')?.value||null,reason:byId('bulkReason')?.value||'Required employee education'})});
      const assigned=result.data?.assignedCount??0,affected=result.data?.employeesAffected??employeeIds.length,skipped=result.data?.skippedCount??0;
      notify(`${assigned} course assignment(s) created for ${affected} employee(s)${skipped?`; ${skipped} existing assignment(s) skipped`:''}.`);
      if(typeof window.loadAssignments==='function')await window.loadAssignments();
    }catch(error){notify(error instanceof Error?error.message:'Education assignment failed.');}
    finally{button.disabled=false;button.textContent=originalText;}
  };
}

function ensureModal(){
  if(byId('educationCourseModal'))return;
  document.body.insertAdjacentHTML('beforeend',`<div class="edu-modal" id="educationCourseModal" role="dialog" aria-modal="true" aria-labelledby="educationCourseTitle"><div class="edu-dialog"><div class="edu-dialog-head"><div><small id="educationCourseCode"></small><h2 id="educationCourseTitle">Course details</h2></div><button class="edu-close" type="button" aria-label="Close">×</button></div><div class="edu-dialog-body" id="educationCourseBody"></div><div class="edu-dialog-foot"><button class="btn secondary edu-close" type="button">Close</button><button class="btn primary" id="educationCourseLaunch" type="button">Open course</button></div></div></div>`);
  document.querySelectorAll('.edu-close').forEach(button=>button.addEventListener('click',()=>byId('educationCourseModal').classList.remove('open')));
  byId('educationCourseModal').addEventListener('click',event=>{if(event.target===byId('educationCourseModal'))byId('educationCourseModal').classList.remove('open');});
}
function activityRows(course){
  const activities=course.activitySequence||[
    {name:'Course overview and objectives',type:'OVERVIEW'},
    {name:'Required learning content',type:'ELEARNING'},
    {name:'Knowledge validation',type:'POST TEST'},
    {name:'Completion certificate',type:'CERTIFICATE'}
  ];
  return activities.map((activity,index)=>`<div class="edu-activity"><div class="edu-activity-icon">${index+1}</div><div><strong>${safe(activity.name)}</strong><small>${safe(activity.type||'Learning activity')}</small></div><span class="course-state ${index?'locked':''}">${index?'Opens in sequence':'Ready'}</span></div>`).join('');
}
function openDetails(code,launchLabel='Open course'){
  const course=courseByCode(code);if(!course.code){window.openCourse?.(code);return;}
  ensureModal();byId('educationCourseCode').textContent=course.code;byId('educationCourseTitle').textContent=course.title;
  byId('educationCourseBody').innerHTML=`<div class="edu-course-summary"><p>${safe(course.description||'Complete the required learning activities in order. Your progress is saved to your employee education record.')}</p><div class="edu-facts"><span><b>${safe(course.estimatedMinutes||0)}</b> minutes</span><span><b>${safe(course.passingPercent||80)}%</b> passing requirement</span><span><b>${safe(course.certificateValidityMonths||12)}</b> month validity</span></div></div><h3 class="edu-section-title">Learning activities</h3><div>${activityRows(course)}</div>${course.scopeNotice?`<div class="edu-scope"><strong>Scope notice</strong><p>${safe(course.scopeNotice)}</p></div>`:''}`;
  const launch=byId('educationCourseLaunch');launch.textContent=launchLabel;launch.onclick=()=>window.openCourse?.(code);byId('educationCourseModal').classList.add('open');
}

function enhanceCatalog(){
  const host=byId('catalogList');if(!host||host.dataset.enhanced==='true'||!courses.length)return;
  host.dataset.enhanced='true';host.className='';
  host.innerHTML=`<div class="edu-toolbar"><input id="catalogSearch" type="search" placeholder="Search course title, code, or category"><select id="catalogCategory"><option value="">All categories</option>${[...new Set(courses.map(c=>c.category).filter(Boolean))].sort().map(category=>`<option>${safe(category)}</option>`).join('')}</select></div><p class="catalog-summary" id="catalogSummary"></p><div class="edu-card-grid" id="catalogCards"></div>`;
  const render=()=>{const query=byId('catalogSearch').value.trim().toLowerCase(),category=byId('catalogCategory').value;const filtered=courses.filter(course=>(!category||course.category===category)&&(!query||[course.code,course.title,course.category,course.description].join(' ').toLowerCase().includes(query)));byId('catalogSummary').textContent=`Showing ${filtered.length} of ${courses.length} approved courses`;byId('catalogCards').innerHTML=filtered.map(course=>`<article class="edu-card"><div class="edu-course-code">${safe(course.code)}</div><h3>${safe(course.title)}</h3><p>${safe(course.description||course.category||'Approved Sulandra Health employee education.')}</p><div class="edu-meta"><span>${safe(course.category||'Education')}</span><span>${safe(course.estimatedMinutes||0)} min</span><span>${safe(course.certificateValidityMonths||12)}-month certificate</span></div><div class="edu-actions"><button type="button" data-details="${safe(course.code)}">Details</button><button type="button" class="primary" data-launch="${safe(course.code)}">Open course</button></div></article>`).join('')||'<div class="empty">No courses match your search.</div>';document.querySelectorAll('[data-details]').forEach(button=>button.onclick=()=>openDetails(button.dataset.details));document.querySelectorAll('[data-launch]').forEach(button=>button.onclick=()=>window.openCourse?.(button.dataset.launch));};
  byId('catalogSearch').addEventListener('input',render);byId('catalogCategory').addEventListener('change',render);render();
}

function enhanceAssignments(){
  const host=byId('assignmentList');if(!host||host.dataset.processing==='true')return;host.dataset.processing='true';
  [...host.querySelectorAll('.task')].forEach(task=>{
    if(task.dataset.enhanced==='true')return;task.dataset.enhanced='true';const heading=task.querySelector('h3')?.textContent||'';const code=heading.split('—')[0].trim();const course=courseByCode(code);task.classList.add('edu-assignment');
    const content=task.firstElementChild;if(content&&course.code){content.insertAdjacentHTML('beforeend',`<div class="course-progress"><span style="width:${task.textContent.includes('IN PROGRESS')?45:8}%"></span></div><button type="button" class="edu-inline-details" data-assignment-details="${safe(code)}">View learning activities</button>`);}
    task.querySelector('[data-assignment-details]')?.addEventListener('click',()=>openDetails(code,task.textContent.includes('Resume')?'Resume course':'Start course'));
  });
  host.dataset.processing='false';
}

function enhanceCompleted(){
  const host=byId('historyList');if(!host||host.dataset.enhanced==='true')return;
  const table=host.querySelector('table');if(!table)return;host.dataset.enhanced='true';const rows=[...table.querySelectorAll('tr')].slice(1);
  host.innerHTML=`<div class="edu-completion-list">${rows.map(row=>{const cells=row.querySelectorAll('td'),courseText=cells[0]?.textContent||'',code=courseText.split('—')[0].trim(),completed=cells[1]?.textContent||'',expires=cells[3]?.textContent||'';return `<article class="edu-completion"><div><h3>${safe(courseText)}</h3><div class="edu-meta"><span>Completed ${safe(completed)}</span><span>Valid through ${safe(expires||'recorded expiration')}</span></div></div><div class="edu-actions"><button type="button" data-completion-details="${safe(code)}">Details</button><button type="button" class="certificate-btn" data-certificate="${safe(code)}">Certificate</button></div></article>`;}).join('')}</div>`;
  host.querySelectorAll('[data-completion-details]').forEach(button=>button.onclick=()=>openDetails(button.dataset.completionDetails,'Review course'));
  host.querySelectorAll('[data-certificate]').forEach(button=>button.onclick=()=>notify('Open the completed course record to view or print its certificate.'));
}

function enhanceConnections(){
  const panel=byId('connections');if(!panel||panel.dataset.enhanced==='true')return;panel.dataset.enhanced='true';
  panel.insertAdjacentHTML('beforeend',`<div class="edu-columns"><section class="edu-linkbox"><h3>Learning</h3><a href="#" data-open-tab="learning">Assigned courses</a><a href="#" data-open-tab="catalog">Course catalog</a><a href="#" data-open-tab="history">Completion history</a></section><section class="edu-linkbox"><h3>Employee Resources</h3><a href="/intranet.HTML">Inside Sulandra</a><a href="/education.html">Education information</a></section><section class="edu-linkbox"><h3>Support</h3><a href="#" data-open-tab="help">Education help</a><a href="#" data-open-tab="profile">My learning profile</a></section></div>`);
  panel.querySelectorAll('[data-open-tab]').forEach(link=>link.onclick=event=>{event.preventDefault();window.showTab?.(link.dataset.openTab);});
}

function watchPortal(){
  const observer=new MutationObserver(()=>{enhanceAssignments();enhanceCompleted();});
  ['assignmentList','historyList'].forEach(id=>{const node=byId(id);if(node)observer.observe(node,{childList:true,subtree:true});});
  enhanceAssignments();enhanceCompleted();
}
async function start(){
  try{await getActiveCourses();}catch(error){console.warn(error);}
  connectBulkAssignment();ensureModal();enhanceCatalog();enhanceConnections();watchPortal();
  const packageSelect=byId('packageSelect');if(packageSelect)packageSelect.addEventListener('change',()=>byId('customCourseField')?.classList.toggle('hidden',packageSelect.value!=='CUSTOM'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,80));else setTimeout(start,80);
})();
