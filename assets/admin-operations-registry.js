(() => {
  'use strict';

  const API_BASE = String(window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app').replace(/\/$/, '');
  const entity = () => window.SulandraCompanyContext?.current?.() || null;
  const normalizeRoute = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    try {
      const url = new URL(text, window.location.origin);
      return `${url.pathname}${url.hash || ''}`;
    } catch { return text; }
  };

  const registry = Object.freeze([
    { id:'chronicles.company', area:'Company Chronicles', label:'Company Chronicles', kind:'module', module:'settings', critical:true },
    { id:'chronicles.files', area:'Company Chronicles', label:'Company Files', kind:'route', href:'/company-documents.html' },

    { id:'clinical.intake', area:'Clinical Operations', label:'Client Intake', kind:'route', href:'/client-intake.html', critical:true },
    { id:'clinical.service-homes', area:'Clinical Operations', label:'Service Homes', kind:'module', module:'service-homes' },
    { id:'clinical.spire', area:'Clinical Operations', label:'SPIRE Clinical', kind:'route', href:'/spire-admin.html', critical:true },
    { id:'clinical.med-qualifications', area:'Clinical Operations', label:'Medication Qualifications', kind:'route', href:'/spire-medication-qualifications.html' },
    { id:'clinical.home-health', area:'Clinical Operations', label:'Home Health', kind:'route', href:'/home-health.html', companyCodes:['HOME_HEALTH'] },
    { id:'clinical.home-health-referrals', area:'Clinical Operations', label:'Home Health Referrals', kind:'route', href:'/home-health-referrals.html', companyCodes:['HOME_HEALTH'] },

    { id:'compliance.documents', area:'Compliance & Audit', label:'Compliance Documents', kind:'route', href:'/employee360.html#files' },
    { id:'compliance.audit', area:'Compliance & Audit', label:'Audit & Reports', kind:'route', href:'/employee360.html#audit', critical:true },
    { id:'compliance.security', area:'Compliance & Audit', label:'Security Audit', kind:'route', href:'/security-audit.html', critical:true },
    { id:'compliance.readiness', area:'Compliance & Audit', label:'Production Readiness', kind:'route', href:'/platform-readiness.html' },
    { id:'compliance.spire-training', area:'Compliance & Audit', label:'SPIRE Training', kind:'route', href:'/spire-training.html' },
    { id:'compliance.intranet', area:'Compliance & Audit', label:'Intranet Content', kind:'route', href:'/intranet-control.html' },

    { id:'workforce.employees', area:'Workforce & Dispatch', label:'Employees', kind:'module', module:'employees', critical:true },
    { id:'workforce.onboarding', area:'Workforce & Dispatch', label:'Onboarding', kind:'module', module:'onboarding' },
    { id:'workforce.workspace', area:'Workforce & Dispatch', label:'Workforce', kind:'route', href:'/workforce-admin.html' },
    { id:'workforce.scheduling', area:'Workforce & Dispatch', label:'Scheduling', kind:'route', href:'/scheduling.html', critical:true },
    { id:'workforce.nmt-dispatch', area:'Workforce & Dispatch', label:'NMT Dispatch', kind:'route', href:'/nmt-dispatch.html', companyCodes:['NMT'], critical:true },

    { id:'financial.evv', area:'Financial & Billing', label:'EVV Operations', kind:'route', href:'/spire-evv-test-console.html', critical:true },
    { id:'financial.nmt-orders', area:'Financial & Billing', label:'NMT Orders', kind:'route', href:'/nmt-orders.html', companyCodes:['NMT'] },
    { id:'financial.time-attendance', area:'Financial & Billing', label:'Time & Attendance', kind:'route', href:'/time-attendance.html#admin', critical:true },
    { id:'financial.payroll', area:'Financial & Billing', label:'Payroll', kind:'route', href:'/payroll.html', critical:true },
    { id:'financial.revenue-cycle', area:'Financial & Billing', label:'Revenue Cycle', kind:'route', href:'/revenue-cycle.html', critical:true },

    { id:'day.dispatch', area:'Day Operations', label:'Active Dispatch Tracking', kind:'route', href:'/nmt-dispatch.html', companyCodes:['NMT'] },
    { id:'day.ride-booking', area:'Day Operations', label:'Immediate Ride Booking', kind:'route', href:'/nmt-orders.html', companyCodes:['NMT'] },
    { id:'day.evv-exceptions', area:'Day Operations', label:'Pending EVV Exceptions', kind:'route', href:'/spire-evv-test-console.html' },
    { id:'day.quick-client', area:'Day Operations', label:'Quick Add Client', kind:'route', href:'/client-intake.html' },

    { id:'global.health', area:'Global Operations', label:'System Health', kind:'api', endpoint:'/health', critical:true },
    { id:'global.security', area:'Global Operations', label:'Security & Monitoring', kind:'route', href:'/security-audit.html', critical:true },
    { id:'global.search', area:'Global Operations', label:'Universal search', kind:'ui', control:'#sulandraUniversalSearch' },
    { id:'global.profile', area:'Global Operations', label:'Profile', kind:'route', href:'/admin-profile.html' },
  ].map((entry) => Object.freeze({ ...entry, companyCodes: entry.companyCodes ? Object.freeze([...entry.companyCodes]) : undefined })));

  const byId = new Map(registry.map((operation) => [operation.id, operation]));
  const byModule = new Map(registry.filter((operation) => operation.module).map((operation) => [operation.module, operation]));
  const routeCandidates = registry.filter((operation) => operation.href);
  const byLabel = new Map(registry.map((operation) => [operation.label.toLowerCase(), operation]));

  function allowed(operation, company = entity()) {
    if (!operation?.companyCodes?.length) return true;
    const code = String(company?.code || document.body?.dataset?.legalEntityCode || '').trim();
    return operation.companyCodes.includes(code);
  }

  function operationForControl(control) {
    if (!control) return null;
    const explicit = control.dataset?.operationId;
    if (explicit && byId.has(explicit)) return byId.get(explicit);
    if (control.id === 'sulandraSystemHealth') return byId.get('global.health') || null;
    if (control.id === 'sulandraUniversalSearch') return byId.get('global.search') || null;
    const module = control.dataset?.module;
    if (module && byModule.has(module)) return byModule.get(module);
    const rawRoute = control.dataset?.sulandraRoute || control.getAttribute?.('href') || '';
    const route = normalizeRoute(rawRoute);
    if (route && route !== '#') {
      const direct = routeCandidates.find((candidate) => normalizeRoute(candidate.href) === route);
      if (direct) {
        const label = String(control.textContent || '').trim().toLowerCase();
        const labelMatch = routeCandidates.find((candidate) => normalizeRoute(candidate.href) === route && label.includes(candidate.label.toLowerCase()));
        return labelMatch || direct;
      }
    }
    const text = String(control.textContent || '').trim().toLowerCase();
    for (const [label, operation] of byLabel) if (text === label || text.startsWith(label)) return operation;
    return null;
  }

  function annotate(control, operation) {
    if (!control || !operation) return;
    control.dataset.operationId = operation.id;
    control.dataset.operationArea = operation.area;
    control.dataset.operationKind = operation.kind;
    control.dataset.operationMapped = 'true';
    control.dataset.operationCritical = operation.critical ? 'true' : 'false';
    if (operation.companyCodes?.length) control.dataset.operationCompanyCodes = operation.companyCodes.join(',');
  }

  function mapRenderedControls() {
    const selectors = [
      '#sideModuleNav [data-module]', '#sideModuleNav [data-sulandra-route]',
      '#rightOperationsPanel a', '#rightOperationsPanel button',
      '#topModuleNav a', '#topModuleNav button', '#topModuleNav input',
    ].join(',');
    const controls = [...document.querySelectorAll(selectors)];
    const unresolved = [];
    for (const control of controls) {
      const operation = operationForControl(control);
      if (operation) annotate(control, operation);
      else {
        control.dataset.operationMapped = 'false';
        unresolved.push(control);
      }
    }
    document.documentElement.dataset.adminOperationsMapped = 'true';
    window.dispatchEvent(new CustomEvent('sulandra:admin-operations-mapped', { detail: { mapped: controls.length - unresolved.length, unresolved: unresolved.length } }));
    return { mapped: controls.length - unresolved.length, unresolved };
  }

  async function execute(id) {
    const operation = byId.get(String(id));
    if (!operation) throw new Error(`Unknown Sulandra Admin operation: ${id}`);
    if (!allowed(operation)) throw new Error(`${operation.label} is not available for the selected company.`);
    if (operation.kind === 'route') return window.location.assign(operation.href);
    if (operation.kind === 'module') {
      localStorage.setItem('sulandra:admin:active-module', operation.module);
      window.location.hash = operation.module;
      document.querySelector(`[data-module="${CSS.escape(operation.module)}"]`)?.click();
      return;
    }
    if (operation.kind === 'api') {
      const response = await fetch(`${API_BASE}${operation.endpoint}`, { credentials:'include', cache:'no-store' });
      if (!response.ok) throw new Error(`${operation.label} failed (${response.status})`);
      const contentType = String(response.headers.get('content-type') || '');
      return contentType.includes('json') ? response.json() : response.text();
    }
    if (operation.kind === 'ui') return document.querySelector(operation.control)?.focus();
  }

  function report() {
    const mapped = [...document.querySelectorAll('[data-operation-mapped="true"]')];
    const unresolved = [...document.querySelectorAll('[data-operation-mapped="false"]')];
    return {
      registryCount: registry.length,
      selectedCompanyCode: String(entity()?.code || document.body?.dataset?.legalEntityCode || ''),
      availableOperations: registry.filter((operation) => allowed(operation)).map((operation) => operation.id),
      mappedControlCount: mapped.length,
      unresolvedControls: unresolved.map((control) => ({ tag:control.tagName, text:String(control.textContent || '').trim().slice(0,120), route:control.dataset?.sulandraRoute || control.getAttribute?.('href') || '' })),
    };
  }

  window.SulandraAdminOperations = Object.freeze({ registry, resolve:(id) => byId.get(String(id)) || null, allowed, execute, mapRenderedControls, report });

  let queued = false;
  const scheduleMap = () => {
    if (queued) return;
    queued = true;
    window.setTimeout(() => { queued = false; mapRenderedControls(); }, 0);
  };
  const observer = new MutationObserver(scheduleMap);
  const start = () => {
    mapRenderedControls();
    for (const id of ['sideModuleNav','rightOperationsPanel','topModuleNav']) {
      const node = document.getElementById(id);
      if (node) observer.observe(node, { childList:true, subtree:true, attributes:true, attributeFilter:['href','data-module','data-sulandra-route'] });
    }
    window.addEventListener('sulandra:company-context-changed', scheduleMap);
    window.setTimeout(scheduleMap, 100);
    window.setTimeout(scheduleMap, 600);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
