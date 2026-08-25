(() => {
  'use strict';

  const API_BASE = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const SELECTED_ENTITY_KEY = 'sulandra:admin:legal-entity-id';
  const SHARED_SELECTED_ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const ACTIVE_MODULE_KEY = 'sulandra:admin:active-module';
  let entityContext = null;
  let selectedEntity = null;
  let requestPromise = null;
  let shellPromise = null;
  let employeeSuitePromise = null;

  // One authoritative Admin information-architecture registry.
  // Public/token/role landing pages intentionally stay outside these folders.
  const NAVIGATION = Object.freeze({
    topActions: Object.freeze([
      {key:'dashboard',label:'Dashboard',kind:'module',aliases:['home','command center']},
      {key:'my-work',label:'My Work',kind:'route',href:'/my-work.html',aliases:['tasks','work queue']},
      {key:'notifications',label:'Notifications',kind:'route',href:'/notifications.html',aliases:['alerts','inbox']},
      {key:'profile',label:'Profile',kind:'route',href:'/admin-profile.html',aliases:['account','enterprise owner profile']},
    ]),
    folders: Object.freeze([
      {
        key:'company-management', label:'Company Management',
        items:Object.freeze([
          {key:'settings',label:'Company Profile & Settings',sub:'Identity, address and preferences',kind:'module'},
          {key:'service-homes',label:'Service Homes',sub:'Homes and service locations',kind:'module'},
          {key:'company-files',label:'Official Company Documents',sub:'Central company records',kind:'route',href:'/company-documents.html'},
          {key:'licenses-contracts',label:'Licenses, Insurance & Contracts',sub:'Regulatory and business evidence',kind:'route',href:'/company-documents.html',aliases:['licenses','insurance','contracts']},
        ]),
      },
      {
        key:'people-hr', label:'People & HR',
        items:Object.freeze([
          {key:'onboarding',label:'Hiring & Onboarding',sub:'Employee lifecycle',kind:'module'},
          {key:'employees',label:'Employee 360',sub:'Employee records and management',kind:'module'},
          {key:'employee-directory',label:'Employee Directory',sub:'People directory',kind:'route',href:'/employee-directory.html'},
          {key:'scheduling',label:'Scheduling',sub:'Shifts and coverage',kind:'route',href:'/scheduling.html'},
          {key:'time',label:'Time & Attendance',sub:'Clock-ins and corrections',kind:'route',href:'/time-attendance.html#admin'},
          {key:'payroll',label:'Payroll & Benefits',sub:'Payroll administration and benefits',kind:'route',href:'/payroll.html',aliases:['benefits','compensation']},
          {key:'learning',label:'Learning & Training',sub:'Education and assignments',kind:'route',href:'/education-portal.html'},
        ]),
      },
      {
        key:'clients-spire', label:'Clients & SPIRE',
        items:Object.freeze([
          {key:'client-intake',label:'Client Intake',sub:'Admission packet and referrals',kind:'route',href:'/client-intake.html'},
          {key:'spire-admin',label:'SPIRE Administration',sub:'Clinical administration',kind:'route',href:'/spire-admin.html'},
          {key:'spire-live',label:'Live SPIRE',sub:'Authorized client charts',kind:'route',href:'/spire.html'},
          {key:'med-qualifications',label:'Medication Qualifications',sub:'Medication administration authority',kind:'route',href:'/spire-medication-qualifications.html'},
          {key:'admission-history',label:'Admission History',sub:'SPIRE admission audit',kind:'route',href:'/spire-admission-history.html'},
          {key:'incident-compliance',label:'Incident Compliance',sub:'Incident follow-up and audit',kind:'route',href:'/spire-incident-compliance.html'},
          {key:'spire-training',label:'SPIRE Training',sub:'Practice charts and sandbox',kind:'route',href:'/spire-training.html'},
        ]),
      },
      {
        key:'service-operations', label:'Service Operations',
        items:Object.freeze([
          {key:'scls-residential',label:'SCLS Residential Operations',sub:'Homes and residential operations',kind:'route',href:'/scls-residential.html',companyCodes:['SCLS']},
          {key:'scls-tasks',label:'SCLS Task Board',sub:'Residential task operations',kind:'route',href:'/scls-tasks.html',companyCodes:['SCLS']},
          {key:'home-health-referrals',label:'Home Health Referral Inbox',sub:'Referral intake queue',kind:'route',href:'/home-health-referral-inbox.html',companyCodes:['HOME_HEALTH']},
          {key:'home-health-soc',label:'Home Health Start of Care',sub:'SOC workflow',kind:'route',href:'/home-health-start-of-care.html',companyCodes:['HOME_HEALTH']},
          {key:'home-health-visits',label:'Home Health Visits',sub:'Visit operations',kind:'route',href:'/home-health-visits.html',companyCodes:['HOME_HEALTH']},
          {key:'home-health-sources',label:'Home Health Referral Sources',sub:'Referral-source management',kind:'route',href:'/home-health-sources.html',companyCodes:['HOME_HEALTH']},
          {key:'nmt-facilities',label:'NMT Facilities',sub:'Facility relationships',kind:'route',href:'/nmt-facilities.html',companyCodes:['NMT']},
          {key:'nmt-invitations',label:'NMT Facility Invitations',sub:'Facility onboarding',kind:'route',href:'/nmt-facility-invitations.html',companyCodes:['NMT']},
          {key:'nmt-orders',label:'NMT Order Inbox',sub:'Transportation orders',kind:'route',href:'/nmt-order-inbox.html',companyCodes:['NMT']},
          {key:'nmt-dispatch',label:'NMT Dispatch',sub:'Trips and drivers',kind:'route',href:'/nmt-dispatch.html',companyCodes:['NMT']},
        ]),
      },
      {
        key:'billing-revenue', label:'Billing & Revenue',
        items:Object.freeze([
          {key:'revenue-cycle',label:'Revenue Cycle',sub:'Billing workflow and holds',kind:'route',href:'/revenue-cycle.html'},
          {key:'claim-exchange',label:'Revenue Claim Exchange',sub:'Claims exchange controls',kind:'route',href:'/revenue-claim-exchange.html'},
          {key:'dodd-billing',label:'DODD Billing Rules',sub:'Ohio waiver billing rules',kind:'route',href:'/dodd-billing-rules.html',companyCodes:['SCLS']},
          {key:'eligibility-payer',label:'Eligibility & Payer Integrations',sub:'270/271, payer and connectivity status',kind:'route',href:'/spire-admin.html',aliases:['270','271','payer','HETS','eligibility']},
        ]),
      },
      {
        key:'compliance-quality', label:'Compliance & Quality',
        items:Object.freeze([
          {key:'platform-readiness',label:'Platform Readiness',sub:'Readiness gates and blockers',kind:'route',href:'/platform-readiness.html'},
          {key:'company-compliance',label:'Company Compliance',sub:'Company compliance workspace',kind:'route',href:'/company-compliance.html'},
          {key:'compliance-evidence',label:'Compliance Evidence',sub:'Evidence and certification records',kind:'route',href:'/compliance-evidence.html'},
          {key:'ohio-screening',label:'Ohio Employee Screening',sub:'Screening workspace',kind:'route',href:'/employee-ohio-screening-workspace.html'},
          {key:'evv-monitoring',label:'EVV Monitoring & Test Console',sub:'EVV operations and certification testing',kind:'route',href:'/spire-evv-test-console.html'},
          {key:'data-quality',label:'Data Quality',sub:'Data-quality findings',kind:'route',href:'/data-quality.html'},
          {key:'security-audit',label:'Security Audit',sub:'Security and audit review',kind:'route',href:'/security-audit.html'},
          {key:'reports',label:'Reports',sub:'Audit and reporting',kind:'route',href:'/employee360.html#audit'},
        ]),
      },
      {
        key:'communications-learning', label:'Communications & Learning',
        items:Object.freeze([
          {key:'intranet-control',label:'Intranet Control',sub:'Publish and manage intranet content',kind:'route',href:'/intranet-control.html'},
          {key:'announcements-news',label:'Announcements & News',sub:'Internal communications',kind:'route',href:'/news.html'},
          {key:'policies',label:'Policies',sub:'Policy library',kind:'route',href:'/policies.html'},
          {key:'education',label:'Education',sub:'Courses and learning resources',kind:'route',href:'/education-portal.html'},
          {key:'service-requests',label:'Service Requests',sub:'Client requests and operational intake',kind:'module'},
          {key:'support',label:'Support',sub:'Service requests and help',kind:'route',href:'/support.html'},
        ]),
      },
      {
        key:'system-administration', label:'System Administration',
        items:Object.freeze([
          {key:'admin-users',label:'Admin Users',sub:'Administrator accounts',kind:'route',href:'/admin-users.html'},
          {key:'role-workspaces',label:'Roles, Permissions & Workspaces',sub:'Role-based access',kind:'route',href:'/role-workspaces.html'},
          {key:'owner-profile',label:'Enterprise-owner Profile',sub:'Owner account and profile',kind:'route',href:'/admin-profile.html'},
          {key:'integration-status',label:'Integrations & Certification Status',sub:'External connectivity and certification',kind:'route',href:'/platform-readiness.html',aliases:['CMS','Sandata','fax','drug database','certification']},
          {key:'audit-logs',label:'Audit Logs',sub:'Security and operational audit trail',kind:'route',href:'/security-audit.html'},
        ]),
      },
    ]),
    onboardingLifecycle:Object.freeze([
      {key:'overview',label:'Overview'},
      {key:'openings',label:'Job Openings'},
      {key:'applicants',label:'Applicants'},
      {key:'screening',label:'Screening'},
      {key:'interviews',label:'Interviews'},
      {key:'offers',label:'Offers'},
      {key:'pre-employment',label:'Pre-employment'},
      {key:'new-hire-paperwork',label:'New-hire Paperwork'},
      {key:'orientation',label:'Orientation'},
      {key:'employee-activation',label:'Employee Activation'},
      {key:'archived',label:'Archive'},
    ]),
    contextual:Object.freeze([
      '/careers.html','/applicant-portal.html','/offer-acceptance.html','/patient-portal.html',
      '/service-request.html','/course-player.html','/employee-portal.html'
    ]),
    aliases:Object.freeze({
      '/home-health-referrals.html':'/home-health-referral-inbox.html',
      '/home-health-referral.html':'/home-health-referral-inbox.html',
      '/nmt-orders.html':'/nmt-order-inbox.html',
      '/transportation.html':'/nmt-dispatch.html',
      '/spire-demo.html':'/spire-training.html',
      '/intranet.HTML':'/intranet.html',
    }),
  });

  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const activeModule = () => String(location.hash || '').replace(/^#/, '') || localStorage.getItem(ACTIVE_MODULE_KEY) || 'dashboard';

  const allFolderItems = () => NAVIGATION.folders.flatMap(folder => folder.items.map(item => ({...item,folderKey:folder.key,folderLabel:folder.label})));

  function companyAttrs(item) {
    return item.companyCodes?.length ? ` data-company-modules="${escapeHtml(item.companyCodes.join(','))}" hidden` : '';
  }
  function searchText(item) {
    return [item.label,item.sub,...(item.aliases || [])].filter(Boolean).join(' ').toLowerCase();
  }
  function topMarkup(item) {
    if (item.kind === 'module') {
      const active = activeModule() === item.key ? ' class="active"' : '';
      return `<li><button type="button" data-module="${escapeHtml(item.key)}"${active}>${escapeHtml(item.label)}</button></li>`;
    }
    return `<li><a class="admin-nav-route" href="${escapeHtml(item.href)}" data-sulandra-route="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`;
  }
  function sideItemMarkup(item) {
    const attrs = companyAttrs(item);
    const active = item.kind === 'module' && activeModule() === item.key ? ' active' : '';
    const common = `class="admin-folder-link${active}" data-nav-search="${escapeHtml(searchText(item))}"${attrs}`;
    if (item.kind === 'module') {
      return `<button type="button" ${common} data-module="${escapeHtml(item.key)}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.sub || '')}</small></button>`;
    }
    return `<a ${common} href="${escapeHtml(item.href)}" data-sulandra-route="${escapeHtml(item.href)}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.sub || '')}</small></a>`;
  }
  function folderMarkup(folder) {
    const containsActive = folder.items.some(item => item.kind === 'module' && item.key === activeModule());
    return `<details class="admin-nav-folder"${containsActive ? ' open' : ''} data-admin-folder="${escapeHtml(folder.key)}"><summary><span>${escapeHtml(folder.label)}</span><small>${folder.items.length}</small></summary><div class="admin-folder-items">${folder.items.map(sideItemMarkup).join('')}</div></details>`;
  }

  function renderCanonicalNavigation() {
    const top = document.getElementById('topModuleNav');
    if (top) {
      top.innerHTML = `<li class="admin-global-search"><label class="sr-only" for="adminGlobalToolSearch">Search Admin tools</label><input id="adminGlobalToolSearch" type="search" autocomplete="off" placeholder="Search tools…" aria-label="Search Admin tools"></li>${NAVIGATION.topActions.map(topMarkup).join('')}`;
      top.dataset.canonicalNavigation = 'true';
      top.setAttribute('aria-label', 'Sulandra Admin top actions');
    }
    const side = document.getElementById('sideModuleNav');
    if (side) {
      side.innerHTML = NAVIGATION.folders.map(folderMarkup).join('');
      side.dataset.canonicalNavigation = 'true';
      side.setAttribute('aria-label', 'Sulandra Admin folders');
    }
    updateCompanyModuleVisibility();
    bindGlobalSearch();
  }

  function bindGlobalSearch() {
    const input = document.getElementById('adminGlobalToolSearch');
    if (!input || input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';
    const apply = () => {
      const query = input.value.trim().toLowerCase();
      document.querySelectorAll('#sideModuleNav [data-nav-search]').forEach(node => {
        const companyHidden = node.dataset.companyUnavailable === 'true';
        node.hidden = companyHidden || Boolean(query && !String(node.dataset.navSearch || '').includes(query));
      });
      document.querySelectorAll('#sideModuleNav .admin-nav-folder').forEach(folder => {
        const visible = [...folder.querySelectorAll('[data-nav-search]')].some(node => !node.hidden);
        folder.hidden = !visible;
        if (query && visible) folder.open = true;
      });
    };
    input.addEventListener('input', apply);
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') { input.value = ''; apply(); input.blur(); return; }
      if (event.key !== 'Enter') return;
      const target = [...document.querySelectorAll('#sideModuleNav [data-nav-search]')].find(node => !node.hidden);
      target?.click();
    });
  }

  function renderRightDrawer() {
    document.getElementById('rightOperationsPanel')?.remove();
    document.querySelectorAll('.edge-drawer,.edge-toggle').forEach(node => node.remove());
    return false;
  }

  function updateCompanyModuleVisibility() {
    const code = selectedEntity?.code || document.body?.dataset?.legalEntityCode || '';
    document.querySelectorAll('[data-company-modules]').forEach(node => {
      const allowed = String(node.dataset.companyModules || '').split(',').filter(Boolean);
      const unavailable = Boolean(allowed.length && !allowed.includes(code));
      node.dataset.companyUnavailable = unavailable ? 'true' : 'false';
      node.hidden = unavailable;
    });
    document.getElementById('adminGlobalToolSearch')?.dispatchEvent(new Event('input'));
  }

  function workflowPanel(key, title, description, status, extraAction = '') {
    let panel = document.getElementById(`onboarding-${key}`);
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'onboarding-panel';
    panel.id = `onboarding-${key}`;
    const queue = status ? `<button class="btn btn-primary" type="button" data-lifecycle-status="${escapeHtml(status)}">Open matching applicants</button>` : '';
    panel.innerHTML = `<section class="card lifecycle-stage-card"><div class="lifecycle-stage-kicker">Hiring & Onboarding</div><h1>${escapeHtml(title)}</h1><p class="sub">${escapeHtml(description)}</p><div class="opening-actions">${queue}${extraAction}</div></section>`;
    return panel;
  }

  function activateApplicantStatus(status) {
    const filter = document.getElementById('statusFilter');
    if (filter && status) {
      filter.value = status;
      filter.dispatchEvent(new Event('change', {bubbles:true}));
    }
    const applicantTab = document.querySelector('[data-onboarding-panel="applicants"]');
    applicantTab?.click();
    document.getElementById('onboarding-applicants')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function normalizeOnboardingLifecycle() {
    const module = document.getElementById('module-onboarding');
    const tabs = module?.querySelector('.onboarding-tabs');
    if (!module || !tabs || module.dataset.lifecycleIa === 'true') return;
    module.dataset.lifecycleIa = 'true';

    const hero = module.querySelector('.onboarding-hero');
    if (hero) {
      const h1 = hero.querySelector('h1');
      const p = hero.querySelector('p');
      if (h1) h1.textContent = 'Hiring & Onboarding';
      if (p) p.textContent = 'Manage the employee lifecycle in order—from job opening through screening, offer, pre-employment, orientation, activation and archive.';
    }

    const servicePanel = document.getElementById('onboarding-service-requests');
    const settings = document.getElementById('module-settings');
    if (servicePanel && !document.getElementById('module-service-requests')) {
      const serviceModule = document.createElement('section');
      serviceModule.id = 'module-service-requests';
      serviceModule.className = 'module';
      serviceModule.setAttribute('aria-label','Service Requests workspace');
      servicePanel.classList.remove('onboarding-panel','active');
      serviceModule.appendChild(servicePanel);
      settings?.parentElement?.insertBefore(serviceModule, settings);
    }

    let overview = document.getElementById('onboarding-overview');
    if (!overview) {
      overview = document.createElement('div');
      overview.id = 'onboarding-overview';
      overview.className = 'onboarding-panel active';
      overview.innerHTML = `<section class="card"><div class="lifecycle-stage-kicker">Employee lifecycle</div><h1>Onboarding Overview</h1><p class="sub">Use the stages below in order. Existing applicant folders, job-opening tools, interview scheduling and archive remain connected to the same live hiring data.</p><div class="lifecycle-overview-grid">${NAVIGATION.onboardingLifecycle.slice(1,-1).map((stage,index)=>`<button type="button" data-onboarding-jump="${escapeHtml(stage.key)}"><strong>${index+1}</strong><span>${escapeHtml(stage.label)}</span></button>`).join('')}</div></section>`;
    }

    const screening = workflowPanel('screening','Screening','Track background checks, Ohio screening requirements and candidate documentation before employment.','DOCUMENTS_NEEDED','<a class="btn btn-secondary" href="/employee-ohio-screening-workspace.html">Open Ohio Screening Workspace</a>');
    const interviews = workflowPanel('interviews','Interviews','Review candidates who are ready for interview and use the existing scheduling workflow from their applicant folder.','INTERVIEW');
    const offers = workflowPanel('offers','Offers','Manage candidates whose interview is complete and who are ready for formal offer processing.','OFFER_PENDING');
    const preEmployment = workflowPanel('pre-employment','Pre-employment','Complete required checks, credentials and employment prerequisites before activation.','OFFER_PENDING','<a class="btn btn-secondary" href="/employee-ohio-screening-workspace.html">Open Screening Workspace</a>');
    const paperwork = workflowPanel('new-hire-paperwork','New-hire Paperwork','Complete employee forms, required documents and company records before orientation.','HIRED','<a class="btn btn-secondary" href="/employee360.html#files">Open Employee Documents</a>');
    const orientation = workflowPanel('orientation','Orientation','Assign orientation, education and required training before the employee begins independent work.','HIRED','<a class="btn btn-secondary" href="/education-portal.html">Open Learning & Training</a>');
    const activation = workflowPanel('employee-activation','Employee Activation','Confirm employee records, role access, scheduling readiness and required compliance before activation.','HIRED','<a class="btn btn-secondary" href="/employee360.html">Open Employee 360</a>');

    const panels = {
      overview,
      openings:document.getElementById('onboarding-openings'),
      applicants:document.getElementById('onboarding-applicants'),
      screening,
      interviews,
      offers,
      'pre-employment':preEmployment,
      'new-hire-paperwork':paperwork,
      orientation,
      'employee-activation':activation,
      archived:document.getElementById('onboarding-archived'),
    };
    Object.values(panels).forEach(panel => panel?.classList.remove('active'));
    overview.classList.add('active');

    tabs.innerHTML = NAVIGATION.onboardingLifecycle.map((stage,index) => `<button class="onboarding-tab${index === 0 ? ' active' : ''}" type="button" data-onboarding-panel="${escapeHtml(stage.key)}">${escapeHtml(stage.label)}</button>`).join('');
    let anchor = tabs;
    NAVIGATION.onboardingLifecycle.forEach(stage => {
      const panel = panels[stage.key];
      if (!panel) return;
      anchor.after(panel);
      anchor = panel;
    });

    module.querySelectorAll('[data-lifecycle-status]').forEach(button => button.addEventListener('click', () => activateApplicantStatus(button.dataset.lifecycleStatus)));
    module.querySelectorAll('[data-onboarding-jump]').forEach(button => button.addEventListener('click', () => {
      module.querySelector(`[data-onboarding-panel="${button.dataset.onboardingJump}"]`)?.click();
    }));
  }

  function installInformationArchitectureStyles() {
    let style = document.getElementById('adminInformationArchitectureStyles');
    if (style) style.remove();
    style = document.createElement('style');
    style.id = 'adminInformationArchitectureStyles';
    style.textContent = `
      body .taskbar-toggle,body .taskbar-scrim,body .edge-toggle,body .edge-drawer,#adminTopNavigationMore,#adminTopNavigationOverflowMenu{display:none!important}
      body .grid{display:grid!important;grid-template-columns:minmax(250px,290px) minmax(0,1fr)!important;gap:16px!important;align-items:start!important}
      body .sidebar{display:block!important;position:sticky!important;top:132px!important;max-height:calc(100vh - 150px)!important;overflow:auto!important;padding:12px!important}
      #sideModuleNav{display:grid!important;gap:8px!important}
      .admin-nav-folder{border:1px solid #d7e3ec;border-radius:12px;background:#fff;overflow:hidden}
      .admin-nav-folder[hidden]{display:none!important}.admin-nav-folder summary{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 13px;cursor:pointer;color:#123f63;font-weight:900;font-size:13px;list-style:none;background:#f7fbfe}.admin-nav-folder summary::-webkit-details-marker{display:none}.admin-nav-folder summary small{min-width:24px;text-align:center;border-radius:999px;background:#e6f2f9;color:#35637e;padding:3px 6px;font-size:9px}
      .admin-folder-items{display:grid;gap:3px;padding:6px}.admin-folder-link{display:flex!important;flex-direction:column;align-items:flex-start!important;gap:2px;width:100%;border:0;border-radius:9px;padding:9px 10px;background:#fff;color:#184d6b;text-decoration:none;text-align:left;cursor:pointer;font:800 12px/1.25 "Segoe UI",Arial,sans-serif}.admin-folder-link small{font-size:9px;font-weight:650;color:#748795}.admin-folder-link:hover,.admin-folder-link.active{background:#eaf6fd;color:#075985}.admin-folder-link[hidden]{display:none!important}
      #topModuleNav{display:flex!important;align-items:center!important;gap:6px!important;overflow:visible!important}#topModuleNav>li{flex:0 0 auto!important}#topModuleNav .admin-global-search{flex:1 1 280px!important;min-width:180px!important}#adminGlobalToolSearch{width:100%;height:40px;border:1px solid #c6d8e5;border-radius:10px;padding:0 12px;background:#fff;color:#153f60;font-weight:700}#topModuleNav a,#topModuleNav button{display:inline-flex;align-items:center;min-height:40px;border:1px solid transparent;border-radius:9px;padding:8px 10px;background:transparent;color:#174a69;text-decoration:none;font-weight:900;font-size:12px;cursor:pointer}#topModuleNav a:hover,#topModuleNav button:hover,#topModuleNav .active{background:#eef8ff;border-color:#c9e2ef;color:#075985}
      .header-tools #adminEmailPill,.header-tools #livePill,.header-tools #refreshBtn,.header-tools #exportBtn{display:none!important}
      .lifecycle-stage-kicker{text-transform:uppercase;letter-spacing:.1em;font-size:10px;font-weight:950;color:#0a75ad;margin-bottom:6px}.lifecycle-overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:16px}.lifecycle-overview-grid button{display:flex;align-items:center;gap:9px;border:1px solid #d5e4ed;border-radius:11px;background:#f9fcfe;color:#194c69;padding:11px;text-align:left;font-weight:850;cursor:pointer}.lifecycle-overview-grid button strong{display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:#0b75ad;color:#fff;font-size:11px}.lifecycle-overview-grid button:hover{border-color:#90c7df;background:#eef8fd}.lifecycle-stage-card{min-height:220px}
      #module-service-requests>.onboarding-panel{display:block!important}
      @media(max-width:980px){body .grid{grid-template-columns:1fr!important}.sidebar{position:static!important;max-height:none!important}.lifecycle-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#topModuleNav{flex-wrap:wrap!important}.admin-global-search{order:10;flex-basis:100%!important}}
      @media(max-width:620px){.lifecycle-overview-grid{grid-template-columns:1fr}.admin-company-context{width:100%!important;min-width:100%!important}}
    `;
    document.head.appendChild(style);
    renderRightDrawer();
    document.querySelectorAll('.taskbar-toggle,.taskbar-scrim').forEach(node => node.remove());
  }

  function installRouteDelegation() {
    if (document.documentElement.dataset.adminCanonicalRouteDelegation === 'true') return;
    document.documentElement.dataset.adminCanonicalRouteDelegation = 'true';
    window.addEventListener('click', event => {
      const control = event.target?.closest?.('[data-sulandra-route]');
      if (!control) return;
      const target = control.dataset.sulandraRoute;
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(target);
    }, true);
    document.addEventListener('click', event => {
      const moduleControl = event.target?.closest?.('[data-module="employees"]');
      if (moduleControl) window.setTimeout(() => loadEmployeeSuite().catch(error => console.error('[Admin Employee 360]', error)), 0);
    });
  }

  function ensureStylesheet(href, id) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
  function loadScript(src, id) {
    const existing = document.getElementById(id) || document.querySelector(`script[src^="${src.split('?')[0]}"]`);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = false;
      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`Unable to load ${src}`));
      document.body.appendChild(script);
    });
  }

  function loadEmployeeSuite() {
    if (employeeSuitePromise) return employeeSuitePromise;
    const version = '20260806-employee360-enterprise-controls-1';
    const assets = [
      'admin-employee-permissions','admin-employee-management','admin-employee-compliance','admin-employee-collaboration',
      'admin-employee-performance','admin-employee-compensation','admin-employee-leave-offboarding','admin-employee-assets-access',
      'admin-employee-analytics','admin-employee-documents','admin-employee-bulk-data','admin-employee-workflows',
      'admin-employee-communications','admin-employee-engagement','admin-employee-learning','admin-employee-health-safety','admin-employee360-enterprise-controls',
    ];
    employeeSuitePromise = assets.reduce((promise, name) => promise.then(() => loadScript(`/assets/${name}.js?v=${version}`, `canonical-${name}`)), Promise.resolve());
    return employeeSuitePromise;
  }

  function loadCanonicalShell() {
    if (shellPromise) return shellPromise;
    ensureStylesheet('/assets/admin-shell.css?v=20260810-canonical-admin-1', 'canonicalAdminShellStyles');
    const assets = [
      ['/assets/admin-shell.js?v=20260825-admin-ia-1','canonical-admin-shell'],
      ['/assets/sulandra-enterprise-owner.js?v=20260808-admin-profile-owner-v1','canonical-admin-owner'],
      ['/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v5','canonical-admin-live-dashboard'],
      ['/assets/admin-company-settings.js?v=20260810-company-settings-backend-1','canonical-admin-company-settings'],
      ['/assets/admin-analog-clock.js?v=20260808-analog-wall-clock-v1','canonical-admin-analog-clock'],
      ['/assets/admin-service-home-management-v2.js?v=20260809-service-home-entity-5','canonical-admin-service-homes'],
      ['/assets/admin-dashboard-cleanup.js?v=20260808-dashboard-cleanup-v1','canonical-admin-dashboard-cleanup'],
      ['/assets/admin-achieved-archive-fix.js?v=20260808-achieved-archive-1','canonical-admin-achieved-archive'],
      ['/assets/admin-client-service-requests.js?v=20260809-company-intake-3','canonical-admin-client-service-requests'],
    ];
    shellPromise = assets.reduce((promise, [src, id]) => promise.then(() => loadScript(src, id)), Promise.resolve()).then(() => {
      installInformationArchitectureStyles();
      renderCanonicalNavigation();
      normalizeOnboardingLifecycle();
      const desired = activeModule();
      if (desired === 'employees') return loadEmployeeSuite();
      return undefined;
    });
    return shellPromise;
  }

  function installStyles() {
    if (document.getElementById('adminCompanyContextStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminCompanyContextStyles';
    style.textContent = `
      .admin-company-context{display:flex;align-items:center;gap:8px;min-width:min(340px,30vw);padding:6px 8px 6px 12px;border:1px solid #cbdbea;border-radius:10px;background:#f7fbff;color:#17324d}
      .admin-company-context label{font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;color:#526b82;white-space:nowrap}
      .admin-company-select{min-width:0;flex:1;height:36px;border:1px solid #a9bfd3;border-radius:7px;background:#fff;color:#12385a;padding:0 34px 0 10px;font:800 13px/1.2 'Segoe UI',Arial,sans-serif;cursor:pointer}
      .admin-company-select:focus{outline:3px solid rgba(0,119,200,.18);border-color:#0077c8}
      .admin-company-state{display:inline-flex;align-items:center;justify-content:center;min-width:58px;border-radius:999px;padding:5px 7px;font-size:9px;font-weight:950;letter-spacing:.05em;color:#17603a;background:#dff7e9;border:1px solid #a7e2bf}
      .admin-company-state[data-status="PLANNED"]{color:#80560a;background:#fff5d7;border-color:#ead28a}.admin-company-state[data-status="ERROR"]{color:#8f1d1d;background:#fee8e8;border-color:#f4b2b2}
      @media(max-width:980px){.admin-company-context{order:10;width:100%;min-width:100%}.admin-company-select{font-size:12px}}@media(max-width:680px){.admin-company-context label{display:none}.admin-company-state{min-width:52px}}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    installStyles();
    normalizeOnboardingLifecycle();
    renderCanonicalNavigation();
    let host = document.getElementById('adminCompanyContext');
    if (host) return host;
    const tools = document.querySelector('.header-tools');
    if (!tools) return null;
    host = document.createElement('div');
    host.id = 'adminCompanyContext';
    host.className = 'admin-company-context';
    host.innerHTML = `<label for="adminCompanySelect">Company</label><select id="adminCompanySelect" class="admin-company-select" aria-label="Company to manage" disabled><option>Loading companies…</option></select><span id="adminCompanyState" class="admin-company-state" data-status="PLANNED">LOADING</span>`;
    tools.prepend(host);
    host.querySelector('select')?.addEventListener('change', event => selectEntity(event.target.value, true));
    return host;
  }

  const accessibleEntities = () => Array.isArray(entityContext?.entities) ? entityContext.entities : [];
  function preferredEntity() {
    const entities = accessibleEntities();
    const savedId = localStorage.getItem(SELECTED_ENTITY_KEY) || sessionStorage.getItem(SHARED_SELECTED_ENTITY_KEY) || localStorage.getItem(SHARED_SELECTED_ENTITY_KEY);
    return entities.find(entity => entity.id === savedId && entity.status === 'ACTIVE')
      || entities.find(entity => entity.id === entityContext?.primaryEntityId && entity.status === 'ACTIVE')
      || entities.find(entity => entity.code === 'SCLS' && entity.status === 'ACTIVE')
      || entities.find(entity => entity.status === 'ACTIVE') || null;
  }

  function publishSelection(previousEntity, notify) {
    const status = selectedEntity?.status || 'ERROR';
    const operationsStatus = selectedEntity?.metadata?.serviceOperationsStatus || status;
    const licensingStatus = selectedEntity?.metadata?.licensingStatus || 'UNKNOWN';
    const stateNode = document.getElementById('adminCompanyState');
    if (stateNode) {
      stateNode.dataset.status = status;
      stateNode.textContent = status;
      stateNode.title = status === 'ACTIVE'
        ? `Company workspace active • Operations: ${operationsStatus} • Licensing: ${licensingStatus}`
        : 'This company is planned and cannot be managed until it is legally and operationally activated.';
    }
    if (selectedEntity) {
      localStorage.setItem(SELECTED_ENTITY_KEY, selectedEntity.id);
      localStorage.setItem(SHARED_SELECTED_ENTITY_KEY, selectedEntity.id);
      sessionStorage.setItem(SHARED_SELECTED_ENTITY_KEY, selectedEntity.id);
      document.body.dataset.legalEntityId = selectedEntity.id;
      document.body.dataset.legalEntityCode = selectedEntity.code;
    } else {
      localStorage.removeItem(SELECTED_ENTITY_KEY);
      localStorage.removeItem(SHARED_SELECTED_ENTITY_KEY);
      sessionStorage.removeItem(SHARED_SELECTED_ENTITY_KEY);
      delete document.body.dataset.legalEntityId;
      delete document.body.dataset.legalEntityCode;
    }
    updateCompanyModuleVisibility();
    if (notify && previousEntity?.id !== selectedEntity?.id) {
      const detail = {previousEntity, entity:selectedEntity};
      window.dispatchEvent(new CustomEvent('sulandra:company-change', {detail}));
      window.dispatchEvent(new CustomEvent('sulandra:entity-context-changed', {detail:{previousEntity,selectedEntity,selectedEntityId:selectedEntity?.id || ''}}));
    }
  }

  function selectEntity(entityId, notify = false) {
    const previousEntity = selectedEntity;
    const candidate = accessibleEntities().find(entity => entity.id === entityId);
    selectedEntity = candidate?.status === 'ACTIVE' ? candidate : preferredEntity();
    const select = document.getElementById('adminCompanySelect');
    if (select && selectedEntity) select.value = selectedEntity.id;
    publishSelection(previousEntity, notify);
    return selectedEntity;
  }

  function render() {
    mount();
    const select = document.getElementById('adminCompanySelect');
    if (!select) return;
    const entities = accessibleEntities();
    if (!entities.length) {
      select.innerHTML = '<option>No authorized companies</option>';
      select.disabled = true;
      selectedEntity = null;
      publishSelection(null, false);
      return;
    }
    select.innerHTML = entities.map(entity => {
      const active = entity.status === 'ACTIVE';
      return `<option value="${escapeHtml(entity.id)}" ${active ? '' : 'disabled'}>${escapeHtml(entity.code)} — ${escapeHtml(entity.displayName)}${active ? '' : ` — ${escapeHtml(entity.status)}`}</option>`;
    }).join('');
    const activeEntityCount = entities.filter(entity => entity.status === 'ACTIVE').length;
    select.disabled = false;
    selectEntity(preferredEntity()?.id || '', false);
    select.title = activeEntityCount < 2 ? 'SCLS is the only active company.' : 'Select a company. Company-specific operating modules follow this selection.';
  }

  async function loadContext() {
    const authToken = token();
    if (!authToken) throw new Error('Administrator sign-in is required');
    const response = await fetch(`${API_BASE}/api/entity-context`, {cache:'no-store',headers:{Accept:'application/json',Authorization:`Bearer ${authToken}`}});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Company context failed (${response.status})`);
    return payload.data;
  }

  async function initialize(providedContext) {
    mount();
    if (providedContext?.entities) { entityContext = providedContext; render(); return entityContext; }
    if (entityContext) return entityContext;
    if (!requestPromise) requestPromise = loadContext()
      .then(context => { entityContext = context; render(); return context; })
      .catch(error => {
        const select = document.getElementById('adminCompanySelect');
        const stateNode = document.getElementById('adminCompanyState');
        if (select) { select.innerHTML = '<option>Company context unavailable</option>'; select.disabled = true; }
        if (stateNode) { stateNode.dataset.status = 'ERROR'; stateNode.textContent = 'ERROR'; stateNode.title = error.message; }
        throw error;
      }).finally(() => { requestPromise = null; });
    return requestPromise;
  }

  function loadEnterpriseCompletionRuntime() {
    if (document.querySelector('script[data-sulandra-enterprise-completion]')) return;
    const script = document.createElement('script');
    script.src = '/admin-enterprise-completion.js?v=20260810-full-completion-2';
    script.dataset.sulandraEnterpriseCompletion = 'true';
    script.async = false;
    script.onerror = () => console.error('Sulandra enterprise admin completion runtime failed to load.');
    document.body.appendChild(script);
  }

  window.SulandraAdminNavigation = Object.freeze({
    manifest:NAVIGATION,
    render:renderCanonicalNavigation,
    renderRightDrawer,
    find:query => {
      const value = String(query || '').toLowerCase();
      return allFolderItems().filter(item => searchText(item).includes(value));
    },
  });
  window.SulandraCompanyContext = Object.freeze({
    initialize,
    current: () => selectedEntity,
    context: () => entityContext,
    headers: () => selectedEntity?.id ? {'X-Legal-Entity-Id':selectedEntity.id} : {},
    storageKey: SELECTED_ENTITY_KEY,
    sharedStorageKey: SHARED_SELECTED_ENTITY_KEY,
  });

  normalizeOnboardingLifecycle();
  renderCanonicalNavigation();
  installRouteDelegation();

  const start = () => {
    initialize().catch(() => undefined);
    loadCanonicalShell().catch(error => console.error('[Canonical Admin Shell]', error));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
  if (document.readyState === 'complete') loadEnterpriseCompletionRuntime();
  else window.addEventListener('load', loadEnterpriseCompletionRuntime, {once:true});
})();
