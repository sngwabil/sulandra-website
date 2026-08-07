(()=>{
  'use strict';
  const routes={
    clock:'/time-attendance.html',timesheet:'/time-attendance.html',documents:'/policies.html',incident:'/health-safety.html',education:'/education-portal.html',help:'/support.html'
  };
  const buttonRoutes={btnClockIn:routes.clock,btnClockOut:routes.clock,btnBreak:routes.clock,btnSubmitTimesheet:routes.timesheet,btnSaveDraftTimesheet:routes.timesheet,btnSubmitIncident:routes.incident,btnSaveDraftIncident:routes.incident,btnSubmitDocs:routes.documents,btnLaunchTraining:routes.education,btnViewCertificates:routes.education,btnOpenHandbook:routes.documents};
  const buttonLabels={btnClockIn:'Open Clock In / Out',btnClockOut:'Open Time & Attendance',btnBreak:'Open Break Controls',btnSubmitTimesheet:'Open Timesheet',btnSaveDraftTimesheet:'Review Hours',btnSubmitIncident:'Open Incident Report',btnSaveDraftIncident:'Open Safety Center',btnSubmitDocs:'Open Document Center',btnLaunchTraining:'Open Education Portal',btnViewCertificates:'View Certificates',btnOpenHandbook:'Open Policies'};
  function replaceHint(section,text){const hint=section?.querySelector('h2 .hint');if(hint)hint.textContent=text;}
  function addLiveNotice(section,copy,href,label){if(!section||section.querySelector('.sulandra-live-notice'))return;const note=document.createElement('div');note.className='sulandra-live-notice';note.style.cssText='margin:10px 0 14px;padding:10px 12px;border:1px solid #cfe4fb;border-radius:8px;background:#eef6ff;color:#0a4f88;font-size:13px;line-height:1.45';note.innerHTML=`<strong>Connected to the live Sulandra platform.</strong> ${copy} <a href="${href}" style="font-weight:800;color:#004b8d">${label}</a>`;section.querySelector('h2')?.insertAdjacentElement('afterend',note);}
  function disableLegacyInputs(section){section?.querySelectorAll('input,select,textarea').forEach(control=>{control.disabled=true;control.setAttribute('aria-disabled','true');control.title='Use the connected live Sulandra module for this action.';});}
  function wire(){
    document.querySelectorAll('a[href="#timesheet"]').forEach(a=>a.href=routes.timesheet);
    document.querySelectorAll('a[href="#education"]').forEach(a=>a.href=routes.education);
    document.querySelectorAll('a[href="#documents"]').forEach(a=>a.href=routes.documents);
    document.querySelectorAll('a[href="#incident"]').forEach(a=>a.href=routes.incident);
    document.querySelectorAll('a[href="#help"]').forEach(a=>a.href=routes.help);
    document.querySelectorAll('a[href="#clock"]').forEach(a=>a.href=routes.clock);
    const clock=document.getElementById('clock'),timesheet=document.getElementById('timesheet'),documents=document.getElementById('documents'),incident=document.getElementById('incident'),education=document.getElementById('education');
    replaceHint(clock,'Live Time & Attendance');replaceHint(timesheet,'Live payroll-period timekeeping');replaceHint(documents,'Live secure document center');replaceHint(incident,'Live Health & Safety workflow');replaceHint(education,'Live learning system');
    addLiveNotice(clock,'GPS geofencing, schedules, blocked attempts and punch review are handled in Time & Attendance.',routes.clock,'Open Time & Attendance');
    addLiveNotice(timesheet,'Official worked hours, corrections and payroll-period signoff are managed in Time & Attendance.',routes.timesheet,'Open Timesheet');
    addLiveNotice(documents,'Use the secure document and policy center for uploads, acknowledgements and approved records.',routes.documents,'Open Documents');
    addLiveNotice(incident,'Safety incidents are submitted to the live Health, Safety & Wellness workflow.',routes.incident,'Open Incident Reporting');
    addLiveNotice(education,'Assignments, scores, renewals and certificates are managed in the Education Portal.',routes.education,'Open Education Portal');
    [clock,timesheet,documents,incident,education].forEach(disableLegacyInputs);
    Object.entries(buttonRoutes).forEach(([id,href])=>{const button=document.getElementById(id);if(!button)return;button.disabled=false;button.dataset.liveRoute=href;if(buttonLabels[id])button.textContent=buttonLabels[id];});
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-live-route]');if(!button)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();window.location.href=button.dataset.liveRoute;},true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
})();
