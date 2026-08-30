/* IT_SOLUTIONS_SHARED_ENTERPRISE_SHELL_V1
   Presentation-only shared Administrator chrome for the Sulandra IT workspace.
   Adds the same platform/admin navigation hierarchy used by Scheduling without
   changing IT Agent actions, approvals, APIs, or authorization. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_ENTERPRISE_SHELL__)return;
  window.__SULANDRA_IT_ENTERPRISE_SHELL__=true;

  const platformLinks=[
    ['Admin Console','/admin.html#dashboard'],
    ['Intranet Portal','/intranet.html'],
    ['Employee Portal','/employee-portal.html'],
    ['Employee 360','/employee360.html'],
    ['Education Portal','/education-portal.html'],
    ['Spire Clinical','/spire.html'],
  ];
  const adminLinks=[
    ['Dashboard','/admin.html#dashboard'],
    ['Service Homes','/admin.html#service-homes'],
    ['Employees','/admin.html#employees'],
    ['Scheduling','/scheduling.html'],
    ['Time & Attendance','/time-attendance.html#admin'],
    ['Documents','/employee360.html#files'],
    ['Reports','/employee360.html#audit'],
    ['Admin Spire','/spire-admin.html'],
    ['Onboarding','/admin.html#onboarding'],
    ['Settings','/admin.html#settings'],
    ['IT Solutions','/it-solutions.html'],
  ];

  const link=(label,href,active=false)=>{
    const a=document.createElement('a');
    a.textContent=label;
    a.href=href;
    if(active){a.className='active';a.setAttribute('aria-current','page')}
    return a;
  };

  function install(){
    const body=document.body;
    const header=document.querySelector('body > header');
    const shell=document.querySelector('body > main.shell');
    if(!body||!header||!shell)return;
    if(!body.classList.contains('it-chatgpt-workspace')){
      window.setTimeout(install,60);
      return;
    }

    if(!document.getElementById('itwsEnterprisePlatformBar')){
      const nav=document.createElement('nav');
      nav.id='itwsEnterprisePlatformBar';
      nav.className='itws-enterprise-platform';
      nav.setAttribute('aria-label','Sulandra Health Platform');
      const brand=document.createElement('strong');
      brand.textContent='Sulandra Health Platform';
      nav.appendChild(brand);
      for(const [label,href] of platformLinks)nav.appendChild(link(label,href));
      body.insertBefore(nav,header);
    }

    if(!document.getElementById('itwsEnterpriseAdminTabs')){
      const nav=document.createElement('nav');
      nav.id='itwsEnterpriseAdminTabs';
      nav.className='itws-enterprise-admin-tabs';
      nav.setAttribute('aria-label','Administrator navigation');
      for(const [label,href] of adminLinks)nav.appendChild(link(label,href,label==='IT Solutions'));
      header.insertAdjacentElement('afterend',nav);
    }

    body.classList.add('itws-enterprise-shell');
    const legacyBack=header.querySelector('a.btn[href*="admin.html"]');
    if(legacyBack)legacyBack.setAttribute('aria-hidden','true');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
