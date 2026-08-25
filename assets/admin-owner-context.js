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

  const NAVIGATION = Object.freeze({
    primary: Object.freeze([
      {key:'dashboard',label:'Dashboard',sub:'Overview',kind:'module'},
      {key:'service-homes',label:'Service Homes',sub:'Homes',kind:'module'},
      {key:'employees',label:'Employees',sub:'Employee 360',kind:'module'},
      {key:'scheduling',label:'Scheduling',sub:'Shifts',kind:'route',href:'/scheduling.html'},
      {key:'time',label:'Time & Attendance',sub:'Clock-ins',kind:'route',href:'/time-attendance.html#admin'},
      {key:'client-intake',label:'Client Intake',sub:'Admission Packet',kind:'route',href:'/client-intake.html'},
      {key:'home-health-referrals',label:'HH Referrals',sub:'Secure Referral Inbox',kind:'route',href:'/home-health-referrals.html',companyCodes:['HOME_HEALTH']},
      {key:'home-health',label:'Home Health',sub:'Episodes & Visits',kind:'route',href:'/home-health.html',companyCodes:['HOME_HEALTH']},
      {key:'nmt-orders',label:'NMT Orders',sub:'Facility Referrals',kind:'route',href:'/nmt-orders.html',companyCodes:['NMT']},
      {key:'nmt-dispatch',label:'NMT Dispatch',sub:'Trips & Drivers',kind:'route',href:'/nmt-dispatch.html',companyCodes:['NMT']},
      {key:'workforce',label:'Workforce',sub:'Timesheets & Documents',kind:'route',href:'/workforce-admin.html'},
      {key:'med-qualifications',label:'Med Qualifications',sub:'Administration Authority',kind:'route',href:'/spire-medication-qualifications.html'},
      {key:'company-files',label:'Company Files',sub:'Official Records',kind:'route',href:'/company-documents.html'},
      {key:'spire-training',label:'SPIRE Training',sub:'Practice Charts',kind:'route',href:'/spire-training.html'},
      {key:'documents',label:'Documents',sub:'Compliance',kind:'route',href:'/employee360.html#files'},
      {key:'reports',label:'Reports',sub:'Audit',kind:'route',href:'/employee360.html#audit'},
      {key:'spire',label:'SPIRE',sub:'Clinical Admin',kind:'route',href:'/spire-admin.html'},
      {key:'onboarding',label:'Onboarding',sub:'Hiring',kind:'module'},
      {key:'settings',label:'Settings',sub:'Company Settings',kind:'module'},
    ]),
    leftOnly: Object.freeze([
      {key:'intranet-content',label:'Manage Intranet Content',sub:'Publishing',kind:'route',href:'/intranet-control.html'},
    ]),
    portals: Object.freeze([
      {label:'Intranet Portal',sub:'Live company intranet',href:'/intranet.html'},
      {label:'Employee Portal',sub:'Employee-facing workspace',href:'/employee-portal.html'},
      {label:'Employee 360',sub:'Employee records, documents and management',href:'/employee360.html'},
      {label:'Education Portal',sub:'Training, courses and learning assignments',href:'/education-portal.html'},
      {label:'SPIRE Clinical',sub:'Clinical and client record application',href:'/spire.html'},
    ]),
    quickOperations: Object.freeze([
      {label:'Scheduling',sub:'Workforce schedules by service location',href:'/scheduling.html'},
      {label:'Time & Attendance',sub:'Clock-ins, corrections, GPS and payroll-period review',href:'/time-attendance.html#admin'},
    ]),
  });

  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const activeModule = () => String(location.hash || '').replace(/^#/, '') || localStorage.getItem(ACTIVE_MODULE_KEY) || 'onboarding';

  function navVisibilityAttributes(item) {
    const code = item.companyCodes?.[0] || '';
    return code ? ` data-company-module="${escapeHtml(code)}" hidden` : '';
  }
  function topMarkup(item) {
    const attrs = navVisibilityAttributes(item);
    if (item.kind === 'module') {
      const active = activeModule() === item.key ? ' class="active"' : '';
      return `<li${attrs}><a href="#${escapeHtml(item.key)}" data-module="${escapeHtml(item.key)}"${active}>${escapeHtml(item.label)}</a></li>`;
    }
    return `<li${attrs}><a class="admin-nav-route sulandra-workspace-link" href="${escapeHtml(item.href)}" data-sulandra-route="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`;
  }
  function sideMarkup(item) {
    const attrs = navVisibilityAttributes(item);
    if (item.kind === 'module') {
      const active = activeModule() === item.key ? ' active' : '';
      return `<button class="side-btn${active}" type="button" data-module="${escapeHtml(item.key)}"${attrs}>${escapeHtml(item.label)} <small>${escapeHtml(item.sub || '')}</small></button>`;
    }
    return `<button class="side-btn admin-nav-route" type="button" data-sulandra-route="${escapeHtml(item.href)}"${attrs}>${escapeHtml(item.label)} <small>${escapeHtml(item.sub || '')}</small></button>`;
  }

  function renderCanonicalNavigation() {
    const top = document.getElementById('topModuleNav');
    if (top && top.dataset.canonicalNavigation !== 'true') {
      top.innerHTML = NAVIGATION.primary.map(topMarkup).join('');
      top.dataset.canonicalNavigation = 'true';
      top.setAttribute('aria-label', 'Sulandra Admin primary navigation');
    }
    const side = document.getElementById('sideModuleNav');
    if (side && side.dataset.canonicalNavigation !== 'true') {
      side.innerHTML = [...NAVIGATION.leftOnly, ...NAVIGATION.primary].map(sideMarkup).join('');
      side.dataset.canonicalNavigation = 'true';
      side.setAttribute('aria-label', 'Sulandra Admin operations navigation');
    }
    updateCompanyModuleVisibility();
  }

  function renderRightDrawer() {
    const right = document.getElementById('rightOperationsPanel');
    if (!right) return false;
    let session = {};
    try { session = JSON.parse(sessionStorage.getItem('sulandra:employee:session') || localStorage.getItem('sulandra:employee:session') || 'null') || {}; } catch {}
    const links = items => items.map(item => `<a class="quick-action" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}<small>${escapeHtml(item.sub)}</small></a>`).join('');
    right.innerHTML = `<h3>Platform Portals</h3><p>${escapeHtml(session.displayName || session.fullName || session.email || 'Sulandra Health administrator')}</p>${links(NAVIGATION.portals)}<h3 style="margin-top:18px">Quick Operations</h3>${links(NAVIGATION.quickOperations)}`;
    right.dataset.canonicalNavigation = 'true';
    return true;
  }

  function updateCompanyModuleVisibility() {
    const code = selectedEntity?.code || document.body?.dataset?.legalEntityCode || '';
    document.querySelectorAll('[data-company-module]').forEach(node => {
      node.hidden = node.dataset.companyModule !== code;
    });
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
      ['/assets/admin-shell.js?v=20260810-canonical-admin-1','canonical-admin-shell'],
      ['/assets/sulandra-enterprise-owner.js?v=20260808-admin-profile-owner-v1','canonical-admin-owner'],
      ['/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v5','canonical-admin-live-dashboard'],
      ['/assets/admin-enterprise-apps-launcher.js?v=20260810-enterprise-apps-1','canonical-admin-enterprise-apps'],
      ['/assets/admin-company-settings.js?v=20260810-company-settings-backend-1','canonical-admin-company-settings'],
      ['/assets/admin-analog-clock.js?v=20260808-analog-wall-clock-v1','canonical-admin-analog-clock'],
      ['/assets/admin-service-home-management-v2.js?v=20260809-service-home-entity-5','canonical-admin-service-homes'],
      ['/assets/admin-dashboard-cleanup.js?v=20260808-dashboard-cleanup-v1','canonical-admin-dashboard-cleanup'],
      ['/assets/admin-achieved-archive-fix.js?v=20260808-achieved-archive-1','canonical-admin-achieved-archive'],
      ['/assets/admin-client-service-requests.js?v=20260809-company-intake-3','canonical-admin-client-service-requests'],
    ];
    shellPromise = assets.reduce((promise, [src, id]) => promise.then(() => loadScript(src, id)).then(() => {
      if (id === 'canonical-admin-live-dashboard') {
        renderRightDrawer();
        window.setTimeout(renderRightDrawer, 100);
        window.setTimeout(renderRightDrawer, 500);
      }
    }), Promise.resolve()).then(() => {
      renderRightDrawer();
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
      .sulandra-workspace-link{position:relative}.sulandra-workspace-link::after{content:'LIVE';margin-left:6px;padding:2px 5px;border-radius:999px;background:#e2f3fb;color:#075985;font-size:8px;font-weight:950;vertical-align:middle}
      @media(max-width:980px){.admin-company-context{order:10;width:100%;min-width:100%}.admin-company-select{font-size:12px}}@media(max-width:680px){.admin-company-context label{display:none}.admin-company-state{min-width:52px}}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    installStyles();
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

  window.SulandraAdminNavigation = Object.freeze({manifest:NAVIGATION,render:renderCanonicalNavigation,renderRightDrawer});
  window.SulandraCompanyContext = Object.freeze({
    initialize,
    current: () => selectedEntity,
    context: () => entityContext,
    headers: () => selectedEntity?.id ? {'X-Legal-Entity-Id':selectedEntity.id} : {},
    storageKey: SELECTED_ENTITY_KEY,
    sharedStorageKey: SHARED_SELECTED_ENTITY_KEY,
  });

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
