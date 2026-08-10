(() => {
  'use strict';
  const path=location.pathname.toLowerCase();
  const context=()=>window.SulandraEntityContext?.get?.()||{};
  const selectedCode=()=>context().selectedEntity?.code||'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function headerHost(){return document.querySelector('header .top')||document.querySelector('.top')||document.querySelector('.header-tools')||document.querySelector('header');}
  function addHeaderLink(id,label,href){if(document.getElementById(id))return;const host=headerHost();if(!host)return;const a=document.createElement('a');a.id=id;a.href=href;a.textContent=label;a.style.cssText='color:#075985;text-decoration:none;font-weight:900;white-space:nowrap';host.appendChild(a);}
  function addSpireAdminCard(id,label,href,description,className='work'){if(document.getElementById(id))return;const actions=document.querySelector('main .actions');if(!actions)return;const a=document.createElement('a');a.id=id;a.href=href;a.className=`btn ${className}`;a.innerHTML=`${esc(label)}<span>${esc(description)}</span>`;actions.appendChild(a);}
  function install(){
    const code=selectedCode();
    if(path.endsWith('/scls-residential.html')||path.endsWith('scls-residential.html')){addHeaderLink('sclsResidentialTaskBoardLink','Task Board','/scls-tasks.html');addHeaderLink('sclsResidentialComplianceLink','Compliance','/company-compliance.html');}
    if(path.endsWith('/scls-tasks.html')||path.endsWith('scls-tasks.html'))addHeaderLink('sclsTasksResidentialLink','Residential','/scls-residential.html');
    if(['home-health.html','home-health-referrals.html','home-health-visits.html'].some(name=>path.endsWith(name))){addHeaderLink('homeHealthSocGlobalLink','Start of Care','/home-health-start-of-care.html');addHeaderLink('homeHealthComplianceGlobalLink','Compliance','/company-compliance.html');}
    if(path.endsWith('home-health-start-of-care.html')){addHeaderLink('homeHealthSocOperationsLink','Operations','/home-health.html');addHeaderLink('homeHealthSocReferralLink','Referrals','/home-health-referrals.html');}
    if(['nmt-orders.html','nmt-dispatch.html','nmt-driver.html'].some(name=>path.endsWith(name)))addHeaderLink('nmtComplianceGlobalLink','Compliance','/company-compliance.html');
    if(['workforce.html','workforce-admin.html'].some(name=>path.endsWith(name)))addHeaderLink('workforceNotificationsGlobalLink','Notifications','/notifications.html');
    if(path.endsWith('company-documents.html'))addHeaderLink('companyDocumentsComplianceLink','Compliance','/company-compliance.html');
    if(path.endsWith('company-compliance.html'))addHeaderLink('companyComplianceDocumentsLink','Company Documents','/company-documents.html');
    if(path.endsWith('spire-admin.html')){
      addSpireAdminCard('openNotificationsExtended','Notifications','/notifications.html','Operational assignments, review work, urgent items and due work across the selected company.','notify');
      addSpireAdminCard('openComplianceExtended','Company Compliance','/company-compliance.html','Licenses, provider credentials, insurance, registrations, contracts, policies, fleet and renewals.','compliance');
      if(code==='SCLS')addSpireAdminCard('openSclsTasksExtended','SCLS Task Board','/scls-tasks.html','Create, assign, execute and audit resident and house work.','task');
      if(code==='HOME_HEALTH')addSpireAdminCard('openHomeHealthSocExtended','Home Health Start of Care','/home-health-start-of-care.html','Move accepted referrals with approved Client Intake into episode readiness and creation.','homehealth');
    }
  }
  if(window.SulandraEntityContext?.ready)window.SulandraEntityContext.ready.then(install);else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('sulandra:entity-context-changed',()=>setTimeout(install,0));
})();