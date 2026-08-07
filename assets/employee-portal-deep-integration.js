(()=>{
  'use strict';
  const destinations={clock:'/time-attendance.html',timesheet:'/time-attendance.html',documents:'/policies.html',incident:'/health-safety.html',education:'/education-portal.html',help:'/support.html'};
  const card=(title,description,href,button)=>`<h2>${title}<span class="hint">Live Sulandra system</span></h2><p style="margin:8px 0 14px;color:#566;line-height:1.6">${description}</p><div class="btn-row"><a class="btn btn-primary" href="${href}" style="text-decoration:none">${button}</a></div>`;
  function replaceSection(id,html){const section=document.getElementById(id);if(section)section.innerHTML=html;}
  function integrate(){
    replaceSection('clock',card('Clock In / Clock Out','Use the live Time & Attendance platform for GPS-validated clocking, assigned-location checks, blocked-attempt guidance, and attendance history.',destinations.clock,'Open Time & Attendance'));
    replaceSection('timesheet',card('Timesheets & Worked Hours','Review scheduled versus worked hours, attendance records, corrections, exceptions, and payroll-period time information in the live Time & Attendance platform.',destinations.timesheet,'Open Timesheets'));
    replaceSection('documents',card('Employee Documents & Policies','Open your live document workspace for assigned policies, acknowledgements, signatures, approved records, and Employee 360 document actions.',destinations.documents,'Open Documents'));
    replaceSection('incident',card('Health, Safety & Incident Reporting','Report injuries, exposures, near misses, vehicle events, harassment, safety concerns, and other incidents through the live Health & Safety workflow.',destinations.incident,'Open Incident Reporting'));
    const education=document.getElementById('education');if(education){education.querySelectorAll('button').forEach(button=>{button.onclick=event=>{event.preventDefault();location.href=destinations.education;};});education.querySelectorAll('.hint').forEach(node=>node.textContent='Live Learning Center');}
    const help=document.getElementById('help');if(help){help.querySelectorAll('button,a[href="#"]').forEach(control=>{control.onclick=event=>{event.preventDefault();location.href=destinations.help;};});}
    document.querySelectorAll('.quick-actions a').forEach(link=>{const text=link.textContent.trim().toLowerCase();if(text.includes('clock'))link.href=destinations.clock;else if(text.includes('timesheet'))link.href=destinations.timesheet;else if(text.includes('training'))link.href=destinations.education;else if(text.includes('document'))link.href=destinations.documents;});
    document.querySelectorAll('.nav-links a').forEach(link=>{const text=link.textContent.trim().toLowerCase();if(text.includes('timesheet'))link.href=destinations.timesheet;else if(text.includes('education'))link.href=destinations.education;else if(text.includes('documents'))link.href=destinations.documents;else if(text.includes('incident'))link.href=destinations.incident;else if(text.includes('help'))link.href=destinations.help;});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',integrate,{once:true});else integrate();
})();
