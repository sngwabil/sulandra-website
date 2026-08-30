/* IT_SOLUTIONS_SHARED_ENTERPRISE_SHELL_V1
   Presentation-only shared Administrator chrome for the Sulandra IT workspace.
   Adds the same platform/admin navigation hierarchy used by Scheduling without
   changing IT Agent actions, approvals, APIs, or authorization.
   V3 repair: IT Solutions is the full SIA environment, the floating Ask SIA
   launcher stays suppressed, Status Board and Action Center stay separate, and
   the left navigation now has a real open/collapse control with outside-click close. */
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

  function installLeftSidebarController(){
    if(window.__SULANDRA_IT_LEFT_SIDEBAR_CONTROLLER__)return true;
    const body=document.body;
    const sidebar=document.querySelector('.itws-sidebar');
    const layout=document.querySelector('.itws-layout');
    const closeButton=document.getElementById('itwsCloseSide');
    const openButton=document.getElementById('itwsMenu');
    if(!body||!sidebar||!layout||!closeButton||!openButton)return false;
    window.__SULANDRA_IT_LEFT_SIDEBAR_CONTROLLER__=true;

    if(!document.getElementById('itwsLeftSidebarRepairStyle')){
      const style=document.createElement('style');
      style.id='itwsLeftSidebarRepairStyle';
      style.textContent=`
        body.it-chatgpt-workspace #itwsCloseSide,
        body.it-chatgpt-workspace #itwsMenu{
          width:38px!important;height:38px!important;min-width:38px!important;min-height:38px!important;
          display:grid;place-items:center;border:1px solid #d9e1e7!important;border-radius:11px!important;
          background:#fff!important;color:#385065!important;box-shadow:0 2px 8px rgba(15,23,42,.07)!important;
          font-size:27px!important;font-weight:500!important;line-height:1!important;cursor:pointer!important;
          -webkit-tap-highlight-color:transparent!important;touch-action:manipulation!important;
        }
        body.it-chatgpt-workspace #itwsCloseSide:hover,
        body.it-chatgpt-workspace #itwsMenu:hover{background:#eef3f6!important;color:#0b5f9e!important}
        body.it-chatgpt-workspace #itwsCloseSide:focus-visible,
        body.it-chatgpt-workspace #itwsMenu:focus-visible{outline:3px solid rgba(22,133,209,.25)!important;outline-offset:2px!important}
        body.it-chatgpt-workspace .itws-sidebar-scrim{display:none!important}
        @media(min-width:821px){
          body.it-chatgpt-workspace.itws-left-sidebar-closed .itws-layout{grid-template-columns:minmax(0,1fr)!important}
          body.it-chatgpt-workspace.itws-left-sidebar-closed .itws-sidebar{display:none!important}
          body.it-chatgpt-workspace.itws-left-sidebar-closed #itwsMenu{display:grid!important;z-index:60!important}
          body.it-chatgpt-workspace.itws-left-sidebar-closed .agent-compose,
          body.it-chatgpt-workspace.itws-left-sidebar-closed #agentForm{
            left:50%!important;width:min(790px,calc(100vw - 56px))!important;
          }
        }
        @media(max-width:820px){
          body.it-chatgpt-workspace .itws-sidebar{z-index:2147483000!important}
          body.it-chatgpt-workspace #itwsMenu{display:grid!important;z-index:2147482980!important}
          body.it-chatgpt-workspace .itws-sidebar-scrim.open{
            display:block!important;position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;
            background:rgba(8,31,51,.28)!important;z-index:2147482990!important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    let scrim=document.querySelector('.itws-sidebar-scrim');
    if(!scrim){
      scrim=document.createElement('div');
      scrim.className='itws-sidebar-scrim';
      scrim.setAttribute('aria-hidden','true');
      document.body.appendChild(scrim);
    }

    const isCompact=()=>window.matchMedia('(max-width:820px)').matches;
    const isOpen=()=>isCompact()?sidebar.classList.contains('open'):!body.classList.contains('itws-left-sidebar-closed');
    const setOpen=(open,{focus=false}={})=>{
      const next=Boolean(open);
      if(isCompact()){
        body.classList.remove('itws-left-sidebar-closed');
        sidebar.classList.toggle('open',next);
        scrim.classList.toggle('open',next);
      }else{
        sidebar.classList.remove('open');
        scrim.classList.remove('open');
        body.classList.toggle('itws-left-sidebar-closed',!next);
      }
      closeButton.textContent='‹';
      closeButton.setAttribute('aria-label','Collapse navigation');
      closeButton.setAttribute('title','Collapse navigation');
      closeButton.setAttribute('aria-expanded',next?'true':'false');
      openButton.textContent=next?'‹':'›';
      openButton.setAttribute('aria-label',next?'Close navigation':'Open navigation');
      openButton.setAttribute('title',next?'Close navigation':'Open navigation');
      openButton.setAttribute('aria-expanded',next?'true':'false');
      sidebar.setAttribute('aria-hidden',next?'false':'true');
      if(focus){
        const target=next?closeButton:openButton;
        window.setTimeout(()=>target?.focus?.(),0);
      }
    };

    closeButton.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      setOpen(false,{focus:true});
    },true);
    openButton.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      setOpen(!isOpen(),{focus:true});
    },true);
    scrim.addEventListener('click',()=>setOpen(false,{focus:true}));

    document.addEventListener('click',event=>{
      if(!isOpen())return;
      const target=event.target instanceof Element?event.target:null;
      if(!target||sidebar.contains(target)||openButton.contains(target)||closeButton.contains(target))return;
      setOpen(false);
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&isOpen())setOpen(false,{focus:true});
    },true);

    let compact=isCompact();
    window.addEventListener('resize',()=>{
      const nextCompact=isCompact();
      if(nextCompact===compact)return;
      compact=nextCompact;
      setOpen(nextCompact?false:true);
    },{passive:true});

    setOpen(isCompact()?sidebar.classList.contains('open'):true);
    return true;
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
    installLeftSidebarController();
    const legacyBack=header.querySelector('a.btn[href*="admin.html"]');
    if(legacyBack)legacyBack.setAttribute('aria-hidden','true');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
