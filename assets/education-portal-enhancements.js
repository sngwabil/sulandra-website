(()=>{
'use strict';
const API_ROOT='https://sulandra-website-production.up.railway.app';
const TOKEN_KEY='sulandra:employee:access-token';
const byId=id=>document.getElementById(id);

async function api(path,options={}){
  const response=await fetch(API_ROOT+path,{
    ...options,
    cache:'no-store',
    headers:{
      Accept:'application/json',
      'Content-Type':'application/json',
      Authorization:'Bearer '+(sessionStorage.getItem(TOKEN_KEY)||''),
      ...(options.headers||{})
    }
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload.error||`Request failed (${response.status})`);
  return payload;
}

function notify(message){
  const box=byId('toast');
  if(!box){ alert(message); return; }
  box.textContent=message;
  box.style.display='block';
  clearTimeout(window.__educationToastTimer);
  window.__educationToastTimer=setTimeout(()=>box.style.display='none',4200);
}

async function getActiveCourses(){
  const response=await fetch('/education-catalog.json',{cache:'no-store'});
  if(!response.ok) throw new Error('The education catalog could not be loaded.');
  const payload=await response.json();
  return (payload.courses||[]).filter(course=>course.active===true);
}

function selectedEmployeeIds(){
  return [...document.querySelectorAll('#employeeList input[type="checkbox"]:checked')]
    .map(input=>String(input.value||'').trim())
    .filter(Boolean);
}

async function connectBulkAssignment(){
  const button=byId('assignSelectedBtn');
  if(!button) return;

  button.onclick=async()=>{
    const employeeIds=selectedEmployeeIds();
    if(!employeeIds.length){ notify('Select at least one employee.'); return; }

    const packageCode=byId('packageSelect')?.value||'INITIAL';
    const customCourseCode=byId('customCourseSelect')?.value||'';
    if(packageCode==='CUSTOM'&&!customCourseCode){ notify('Select a course.'); return; }

    const originalText=button.textContent;
    button.disabled=true;
    button.textContent='Assigning education…';

    try{
      const courses=await getActiveCourses();
      const selectedCourse=courses.find(course=>course.code===customCourseCode);
      const courseCodes=packageCode==='CUSTOM'
        ? [customCourseCode]
        : courses.map(course=>course.code);

      if(!courseCodes.length) throw new Error('No active courses are available in this education package.');

      const result=await api('/api/admin/education/bulk-assign',{
        method:'POST',
        body:JSON.stringify({
          employeeIds,
          packageCode,
          courseCode:packageCode==='CUSTOM'?customCourseCode:null,
          courseCodes,
          courseTitle:selectedCourse?.title,
          dueDate:byId('bulkDueDate')?.value||null,
          reason:byId('bulkReason')?.value||'Required employee education'
        })
      });

      const assigned=result.data?.assignedCount??0;
      const affected=result.data?.employeesAffected??employeeIds.length;
      const skipped=result.data?.skippedCount??0;
      notify(`${assigned} course assignment(s) created for ${affected} employee(s)${skipped?`; ${skipped} existing assignment(s) skipped`:''}.`);

      if(typeof window.loadAssignments==='function') await window.loadAssignments();
    }catch(error){
      notify(error instanceof Error?error.message:'Education assignment failed.');
    }finally{
      button.disabled=false;
      button.textContent=originalText;
    }
  };
}

function start(){
  connectBulkAssignment();
  const packageSelect=byId('packageSelect');
  if(packageSelect){
    packageSelect.addEventListener('change',()=>{
      byId('customCourseField')?.classList.toggle('hidden',packageSelect.value!=='CUSTOM');
    });
  }
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(start,50));
else setTimeout(start,50);
})();
