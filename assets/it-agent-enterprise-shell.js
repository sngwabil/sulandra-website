/* IT_SOLUTIONS_SHARED_ENTERPRISE_SHELL_V1
   Presentation-only shared Administrator chrome for the Sulandra IT workspace.
   Adds the same platform/admin navigation hierarchy used by Scheduling without
   changing IT Agent actions, approvals, APIs, or authorization.
   V2 repair: IT Solutions is the full SIA environment, so the global floating
   Ask SIA launcher is suppressed; Status Board close/overlay/Escape controls
   are hardened without changing the separate Action Center. */
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
  const OPEN_KEY='sulandra:it-agent:status-board-open';
  const launcherSelectors=[
    '[data-sia-launcher]',
    '[data-sia-floating-launcher]',
    '#siaLauncher',
    '#sia-launcher',
    '.sia-launcher',
    '.sia-floating-launcher',
    '.floating-sia-launcher',
    '.ask-sia-launcher',
  ];

  const link=(label,href,active=false)=>{
    const a=document.createElement('a');
    a.textContent=label;
    a.href=href;
    if(active){a.className='active';a.setAttribute('aria-current','page')}
    return a;
  };

  const isInsideRealWorkspace=node=>Boolean(node?.closest?.('#agent,.itws-layout,.itws-content,main.shell'));
  const askSiaLabel=node=>{
    if(!(node instanceof Element))return false;
    const text=[node.getAttribute('aria-label'),node.getAttribute('title'),node.textContent].filter(Boolean).join(' ').replace(/\s+/g,' ').trim().toLowerCase();
    return text.includes('ask sia');
  };
  const fixedHost=node=>{
    let current=node instanceof Element?node:null;
    while(current&&current!==document.body){
      try{if(getComputedStyle(current).position==='fixed')return current}catch{}
      current=current.parentElement;
    }
    return null;
  };
  const removeFloatingSiaFrom=root=>{
    if(!(root instanceof Element||root instanceof Document))return;
    for(const selector of launcherSelectors){
      root.querySelectorAll?.(selector).forEach(node=>{
        if(!isInsideRealWorkspace(node))node.remove();
      });
      if(root instanceof Element&&root.matches?.(selector)&&!isInsideRealWorkspace(root))root.remove();
    }
    const candidates=[];
    if(root instanceof Element)candidates.push(root);
    root.querySelectorAll?.('button,a,[role="button"],[aria-label],[title]').forEach(node=>candidates.push(node));
    candidates.forEach(node=>{
      if(!askSiaLabel(node)||isInsideRealWorkspace(node))return;
      const host=fixedHost(node);
      if(host&&!isInsideRealWorkspace(host))host.remove();
    });
  };

  function installFloatingSiaGuard(){
    const body=document.body;
    if(!body)return;
    body.dataset.siaExpandedEnvironment='true';
    removeFloatingSiaFrom(document);
    if(window.__SULANDRA_IT_FLOATING_SIA_GUARD__)return;
    window.__SULANDRA_IT_FLOATING_SIA_GUARD__=true;
    const observer=new MutationObserver(records=>{
      for(const record of records){
        record.addedNodes.forEach(node=>{if(node instanceof Element)removeFloatingSiaFrom(node)});
      }
    });
    observer.observe(body,{childList:true,subtree:true});
  }

  function forceCloseStatusBoard(){
    const drawer=document.querySelector('.itws-status-board-drawer');
    const backdrop=document.querySelector('.itws-drawer-backdrop');
    const toggle=document.getElementById('itwsActivity');
    drawer?.classList.remove('itws-open');
    backdrop?.classList.remove('open');
    document.body?.classList.remove('itws-status-board-open');
    if(toggle){
      toggle.setAttribute('aria-expanded','false');
      toggle.setAttribute('aria-label','Open status board');
    }
    try{sessionStorage.setItem(OPEN_KEY,'0')}catch{}
  }

  function installDrawerCloseGuard(){
    if(window.__SULANDRA_IT_DRAWER_CLOSE_GUARD__)return;
    window.__SULANDRA_IT_DRAWER_CLOSE_GUARD__=true;
    document.addEventListener('click',event=>{
      const target=event.target instanceof Element?event.target:null;
      if(!target)return;
      const close=target.closest('.itws-status-board-close');
      const backdrop=target.closest('.itws-drawer-backdrop');
      if(!close&&!backdrop)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      forceCloseStatusBoard();
    },true);
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||!document.body?.classList.contains('itws-status-board-open'))return;
      event.preventDefault();
      event.stopPropagation();
      forceCloseStatusBoard();
    },true);
  }

  function install(){
    const body=document.body;
    const header=document.querySelector('body > header');
    const shell=document.querySelector('body > main.shell');
    if(!body||!header||!shell)return;
    installFloatingSiaGuard();
    installDrawerCloseGuard();
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
