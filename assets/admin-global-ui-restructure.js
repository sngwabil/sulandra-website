(() => {
  'use strict';
  // Admin IA v2 owns the stable top actions, searchable eight-folder shell and
  // company-aware tool visibility. Retain this runtime only for older shells.
  if (window.SulandraAdminRouteRegistry?.version === '2.0.0') return;

  const API_BASE = String(window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app').replace(/\/$/, '');
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const ACTIVE_MODULE_KEY = 'sulandra:admin:active-module';
  const state = { health: 'checking', searchOpen: false, selectedCode: '', mounted: false };
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const entity = () => window.SulandraCompanyContext?.current?.() || null;

  const FOLDERS = Object.freeze([
    {
      key: 'chronicles',
      label: 'Company Chronicles',
      description: 'Identity, branding & entity configuration',
      items: [
        { label: 'Company Chronicles', sub: 'Global Brand & Entity Configuration', kind: 'module', key: 'settings' },
        { label: 'Company Files', sub: 'Official company records', kind: 'route', href: '/company-documents.html' },
      ],
    },
    {
      key: 'clinical',
      label: 'Clinical Operations',
      description: 'Intake, patient records & clinical workflows',
      items: [
        { label: 'Client Intake', sub: 'Admission packet', kind: 'route', href: '/client-intake.html' },
        { label: 'Service Homes', sub: 'Clients & service locations', kind: 'module', key: 'service-homes' },
        { label: 'SPIRE Clinical', sub: 'Patient records & flowsheets', kind: 'route', href: '/spire-admin.html' },
        { label: 'Medication Qualifications', sub: 'Administration authority', kind: 'route', href: '/spire-medication-qualifications.html' },
        { label: 'Home Health', sub: 'Episodes & visits', kind: 'route', href: '/home-health.html', companyCodes: ['HOME_HEALTH'] },
        { label: 'Home Health Referrals', sub: 'Secure referral inbox', kind: 'route', href: '/home-health-referrals.html', companyCodes: ['HOME_HEALTH'] },
      ],
    },
    {
      key: 'compliance',
      label: 'Compliance & Audit',
      description: 'HIPAA, state standards, evidence & audit',
      items: [
        { label: 'Compliance Documents', sub: 'Employee & regulatory evidence', kind: 'route', href: '/employee360.html#files' },
        { label: 'Audit & Reports', sub: 'Audit history & reporting', kind: 'route', href: '/employee360.html#audit' },
        { label: 'Security Audit', sub: 'Security controls & findings', kind: 'route', href: '/security-audit.html' },
        { label: 'Production Readiness', sub: 'Compliance readiness matrix', kind: 'route', href: '/platform-readiness.html' },
        { label: 'SPIRE Training', sub: 'Practice charts & competency', kind: 'route', href: '/spire-training.html' },
        { label: 'Intranet Content', sub: 'Company publishing controls', kind: 'route', href: '/intranet-control.html' },
      ],
    },
    {
      key: 'workforce',
      label: 'Workforce & Dispatch',
      description: 'Employees, scheduling, driver eligibility & rides',
      items: [
        { label: 'Employees', sub: 'Employee 360', kind: 'module', key: 'employees' },
        { label: 'Onboarding', sub: 'Hiring & applicant workflow', kind: 'module', key: 'onboarding' },
        { label: 'Workforce', sub: 'Timesheets & personnel operations', kind: 'route', href: '/workforce-admin.html' },
        { label: 'Scheduling', sub: 'Assignments & shifts', kind: 'route', href: '/scheduling.html' },
        { label: 'NMT Dispatch', sub: 'Trips, drivers & live operations', kind: 'route', href: '/nmt-dispatch.html', companyCodes: ['NMT'] },
      ],
    },
    {
      key: 'financial',
      label: 'Financial & Billing',
      description: 'EVV, Medicaid, payroll & revenue controls',
      items: [
        { label: 'EVV Operations', sub: 'Visit validation & exception evidence', kind: 'route', href: '/spire-evv-test-console.html' },
        { label: 'NMT Orders', sub: 'Ride referrals & booking queue', kind: 'route', href: '/nmt-orders.html', companyCodes: ['NMT'] },
        { label: 'Time & Attendance', sub: 'Approval & payroll-period review', kind: 'route', href: '/time-attendance.html#admin' },
        { label: 'Payroll', sub: 'Payroll operations', kind: 'route', href: '/payroll.html' },
        { label: 'Revenue Cycle', sub: 'Billing & payment operations', kind: 'route', href: '/revenue-cycle.html' },
      ],
    },
  ]);

  const OPERATIONS = Object.freeze([
    { label: 'Active Dispatch Tracking', sub: 'Live NMT trips and driver operations', href: '/nmt-dispatch.html', companyCodes: ['NMT'], badge: 'LIVE' },
    { label: 'Immediate Ride Booking', sub: 'Create or review an NMT ride request', href: '/nmt-orders.html', companyCodes: ['NMT'], badge: 'BOOK' },
    { label: 'Pending EVV Exceptions', sub: 'Validate EVV readiness, rejections and retry evidence', href: '/spire-evv-test-console.html', badge: 'EVV' },
    { label: 'Quick Add Client', sub: 'Start a new client intake', href: '/client-intake.html', badge: 'ADD' },
  ]);

  const SEARCH_ITEMS = Object.freeze(FOLDERS.flatMap((folder) => folder.items.map((item) => ({ ...item, folder: folder.label }))));

  function activeModule() {
    return String(location.hash || '').replace(/^#/, '') || localStorage.getItem(ACTIVE_MODULE_KEY) || 'onboarding';
  }

  function allowed(item) {
    if (!item.companyCodes?.length) return true;
    const code = String(entity()?.code || document.body?.dataset?.legalEntityCode || '').trim();
    return item.companyCodes.includes(code);
  }

  function routeControl(item, extraClass = '') {
    const companyAttr = item.companyCodes?.length ? ` data-company-codes="${esc(item.companyCodes.join(','))}"` : '';
    if (item.kind === 'module') {
      const active = activeModule() === item.key ? ' active' : '';
      return `<button type="button" class="sulandra-folder-item${active} ${extraClass}" data-module="${esc(item.key)}"${companyAttr}><span><strong>${esc(item.label)}</strong><small>${esc(item.sub || '')}</small></span><span aria-hidden="true">›</span></button>`;
    }
    return `<button type="button" class="sulandra-folder-item admin-nav-route ${extraClass}" data-sulandra-route="${esc(item.href)}"${companyAttr}><span><strong>${esc(item.label)}</strong><small>${esc(item.sub || '')}</small></span><span aria-hidden="true">›</span></button>`;
  }

  function installStyles() {
    if (document.getElementById('adminGlobalUiRestructureStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminGlobalUiRestructureStyles';
    style.textContent = `
      #sideModuleNav.sulandra-core-folders{display:grid!important;gap:9px!important}
      .sulandra-core-folder{border:1px solid #d8e4ec;border-radius:12px;background:#fff;overflow:hidden;box-shadow:0 3px 12px rgba(20,61,86,.04)}
      .sulandra-core-folder>summary{list-style:none;cursor:pointer;padding:11px 12px;color:#173f5d;font-weight:950;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;background:linear-gradient(180deg,#fbfdff,#f5f9fc)}
      .sulandra-core-folder>summary::-webkit-details-marker{display:none}.sulandra-core-folder>summary::after{content:'+';font-size:16px;color:#5c7a8e}.sulandra-core-folder[open]>summary::after{content:'−'}
      .sulandra-folder-copy{min-width:0}.sulandra-folder-copy span{display:block;font-size:9px;font-weight:800;color:#8193a0;margin-top:2px;line-height:1.3}.sulandra-folder-body{padding:6px;display:grid;gap:5px;border-top:1px solid #e4ecf1}
      .sulandra-folder-item{width:100%;border:0;background:transparent;border-radius:8px;padding:8px 9px;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;color:#244b64;cursor:pointer}
      .sulandra-folder-item:hover,.sulandra-folder-item.active{background:#eaf5fb;color:#075985}.sulandra-folder-item strong{display:block;font-size:11px}.sulandra-folder-item small{display:block;font-size:9px;color:#7a8e9b;margin-top:2px;font-weight:700}.sulandra-folder-item[hidden]{display:none!important}
      #topModuleNav.sulandra-global-ops{display:flex!important;align-items:center;gap:8px;padding-top:7px;padding-bottom:7px;overflow:visible}
      #topModuleNav.sulandra-global-ops>li{display:flex;align-items:center;min-width:0}
      .sulandra-global-op{display:flex;align-items:center;gap:7px;border:1px solid #d5e2ea;border-radius:999px;background:#fff;padding:7px 10px!important;margin:0!important;font-size:11px!important;font-weight:900!important;color:#315a72!important;text-decoration:none;white-space:nowrap}
      .sulandra-global-op:hover{background:#f3f9fc!important;color:#075985!important}.sulandra-health-dot{width:8px;height:8px;border-radius:50%;background:#c48a25;box-shadow:0 0 0 3px rgba(196,138,37,.12)}.sulandra-health-dot.ok{background:#2f8a54;box-shadow:0 0 0 3px rgba(47,138,84,.12)}.sulandra-health-dot.bad{background:#b6473f;box-shadow:0 0 0 3px rgba(182,71,63,.12)}
      .sulandra-universal-search{position:relative;min-width:min(360px,35vw)}.sulandra-universal-search input{width:100%;height:34px;border:1px solid #ccdce6;border-radius:999px;padding:0 34px 0 12px;font:700 11px 'Segoe UI',Arial,sans-serif;color:#23485f;background:#fff}.sulandra-universal-search input:focus{outline:3px solid rgba(0,119,200,.13);border-color:#4f9bc5}.sulandra-search-results{position:absolute;z-index:4000;top:40px;left:0;right:0;background:#fff;border:1px solid #cddde7;border-radius:11px;box-shadow:0 18px 40px rgba(23,59,82,.18);padding:6px;display:none;max-height:350px;overflow:auto}.sulandra-search-results.show{display:grid;gap:4px}.sulandra-search-result{border:0;background:#fff;border-radius:8px;text-align:left;padding:8px 9px;cursor:pointer;color:#244b64}.sulandra-search-result:hover{background:#edf7fc}.sulandra-search-result strong{display:block;font-size:11px}.sulandra-search-result small{display:block;font-size:9px;color:#7b909e}
      #rightOperationsPanel.sulandra-day-ops{display:grid;gap:8px}.sulandra-day-op{display:flex;align-items:center;justify-content:space-between;gap:9px;border:1px solid #d7e4ec;border-radius:11px;background:#fff;padding:10px;text-decoration:none;color:#244b64}.sulandra-day-op:hover{border-color:#87bdd8;background:#f6fbfe}.sulandra-day-op strong{display:block;font-size:11px}.sulandra-day-op small{display:block;font-size:9px;color:#7b8f9c;margin-top:2px}.sulandra-op-badge{font-size:8px;font-weight:950;letter-spacing:.04em;padding:4px 6px;border-radius:999px;background:#e8f4fb;color:#075985}.sulandra-day-op[hidden]{display:none!important}
      .sulandra-drawer-heading{margin:0 0 2px!important;font-size:13px!important;color:#174a69!important}.sulandra-drawer-sub{margin:0 0 5px!important;font-size:10px!important;color:#728692!important}
      @media(max-width:980px){#topModuleNav.sulandra-global-ops{flex-wrap:wrap}.sulandra-universal-search{min-width:260px;flex:1}.sulandra-global-op{font-size:10px!important}}
      @media(max-width:640px){.sulandra-universal-search{min-width:100%;order:10}#topModuleNav.sulandra-global-ops{padding-left:10px;padding-right:10px}.sulandra-global-op{padding:6px 8px!important}}
    `;
    document.head.appendChild(style);
  }

  function renderLeftFolders() {
    const side = document.getElementById('sideModuleNav');
    if (!side) return false;
    const openFolder = FOLDERS.find((folder) => folder.items.some((item) => item.kind === 'module' && item.key === activeModule()))?.key || 'workforce';
    side.innerHTML = FOLDERS.map((folder) => `
      <details class="sulandra-core-folder" data-folder="${esc(folder.key)}" ${folder.key === openFolder || folder.key === 'chronicles' ? 'open' : ''}>
        <summary><span class="sulandra-folder-copy">${esc(folder.label)}<span>${esc(folder.description)}</span></span></summary>
        <div class="sulandra-folder-body">${folder.items.map((item) => routeControl(item)).join('')}</div>
      </details>`).join('');
    side.classList.add('sulandra-core-folders');
    side.dataset.canonicalNavigation = 'true';
    side.setAttribute('aria-label', 'Sulandra Admin core folders');
    applyCompanyVisibility();
    return true;
  }

  function renderTopBar() {
    const top = document.getElementById('topModuleNav');
    if (!top) return false;
    top.innerHTML = `
      <li><a class="sulandra-global-op" href="#" id="sulandraSystemHealth"><span class="sulandra-health-dot" id="sulandraHealthDot"></span><span id="sulandraHealthLabel">System Health</span></a></li>
      <li><a class="sulandra-global-op" href="/security-audit.html"><span aria-hidden="true">◉</span><span>Security & Monitoring</span></a></li>
      <li class="sulandra-universal-search"><label class="sr-only" for="sulandraUniversalSearch">Universal search</label><input id="sulandraUniversalSearch" type="search" autocomplete="off" placeholder="Search Sulandra operations…"><div id="sulandraSearchResults" class="sulandra-search-results" role="listbox"></div></li>
      <li><a class="sulandra-global-op" href="/admin-profile.html"><span aria-hidden="true">●</span><span>Profile</span></a></li>`;
    top.classList.add('sulandra-global-ops');
    top.dataset.canonicalNavigation = 'true';
    top.setAttribute('aria-label', 'Sulandra Admin global operations');
    const health = document.getElementById('sulandraSystemHealth');
    health?.addEventListener('click', (event) => { event.preventDefault(); checkHealth(); });
    const input = document.getElementById('sulandraUniversalSearch');
    input?.addEventListener('input', () => renderSearch(input.value));
    input?.addEventListener('focus', () => renderSearch(input.value));
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeSearch();
      if (event.key === 'Enter') {
        const first = document.querySelector('#sulandraSearchResults [data-search-href], #sulandraSearchResults [data-search-module]');
        first?.click();
      }
    });
    document.addEventListener('click', (event) => {
      if (!event.target?.closest?.('.sulandra-universal-search')) closeSearch();
    });
    return true;
  }

  function renderSearch(query) {
    const root = document.getElementById('sulandraSearchResults');
    if (!root) return;
    const q = String(query || '').trim().toLowerCase();
    const rows = SEARCH_ITEMS.filter(allowed).filter((item) => !q || [item.label, item.sub, item.folder].some((value) => String(value || '').toLowerCase().includes(q))).slice(0, 10);
    root.innerHTML = rows.length ? rows.map((item) => item.kind === 'module'
      ? `<button type="button" class="sulandra-search-result" data-search-module="${esc(item.key)}"><strong>${esc(item.label)}</strong><small>${esc(item.folder)} · ${esc(item.sub || '')}</small></button>`
      : `<button type="button" class="sulandra-search-result" data-search-href="${esc(item.href)}"><strong>${esc(item.label)}</strong><small>${esc(item.folder)} · ${esc(item.sub || '')}</small></button>`).join('')
      : '<div class="sulandra-search-result"><strong>No matching Sulandra operation</strong><small>Try another term.</small></div>';
    root.classList.add('show');
    root.querySelectorAll('[data-search-href]').forEach((node) => node.addEventListener('click', () => window.location.assign(node.dataset.searchHref)));
    root.querySelectorAll('[data-search-module]').forEach((node) => node.addEventListener('click', () => {
      const target = document.querySelector(`#sideModuleNav [data-module="${CSS.escape(node.dataset.searchModule)}"]`);
      closeSearch();
      target?.click();
    }));
  }

  function closeSearch() {
    document.getElementById('sulandraSearchResults')?.classList.remove('show');
  }

  function renderRightOperations() {
    const right = document.getElementById('rightOperationsPanel');
    if (!right) return false;
    right.innerHTML = `<h3 class="sulandra-drawer-heading">Day-to-Day Operations</h3><p class="sulandra-drawer-sub">Live actions requiring operational attention.</p>${OPERATIONS.map((item) => {
      const hidden = allowed(item) ? '' : ' hidden';
      const codes = item.companyCodes?.length ? ` data-company-codes="${esc(item.companyCodes.join(','))}"` : '';
      return `<a class="sulandra-day-op" href="${esc(item.href)}"${codes}${hidden}><span><strong>${esc(item.label)}</strong><small>${esc(item.sub)}</small></span><span class="sulandra-op-badge">${esc(item.badge)}</span></a>`;
    }).join('')}`;
    right.classList.add('sulandra-day-ops');
    right.dataset.canonicalNavigation = 'true';
    return true;
  }

  function applyCompanyVisibility() {
    const code = String(entity()?.code || document.body?.dataset?.legalEntityCode || '').trim();
    state.selectedCode = code;
    document.querySelectorAll('[data-company-codes]').forEach((node) => {
      const allowedCodes = String(node.dataset.companyCodes || '').split(',').map((value) => value.trim()).filter(Boolean);
      node.hidden = allowedCodes.length > 0 && !allowedCodes.includes(code);
    });
  }

  async function checkHealth() {
    const dot = document.getElementById('sulandraHealthDot');
    const label = document.getElementById('sulandraHealthLabel');
    if (label) label.textContent = 'Checking Health…';
    dot?.classList.remove('ok', 'bad');
    try {
      const response = await fetch(`${API_BASE}/health`, { cache: 'no-store', headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
      if (!response.ok) throw new Error(`Health ${response.status}`);
      state.health = 'ok';
      dot?.classList.add('ok');
      if (label) label.textContent = 'Systems Operational';
    } catch {
      state.health = 'bad';
      dot?.classList.add('bad');
      if (label) label.textContent = 'System Attention';
    }
  }

  function mount() {
    installStyles();
    const mounted = renderLeftFolders() && renderTopBar() && renderRightOperations();
    state.mounted = mounted;
    applyCompanyVisibility();
    checkHealth();
    return mounted;
  }

  function refresh() {
    if (!state.mounted) return mount();
    renderLeftFolders();
    renderRightOperations();
    applyCompanyVisibility();
    return true;
  }

  window.SulandraAdminGlobalUi = Object.freeze({ mount, refresh, checkHealth, state: () => ({ ...state }) });
  window.addEventListener('sulandra:company-change', refresh);
  window.addEventListener('sulandra:entity-context-changed', refresh);
  window.addEventListener('hashchange', () => window.setTimeout(refresh, 0));
  window.setInterval(checkHealth, 60000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.setTimeout(mount, 0), { once: true });
  else window.setTimeout(mount, 0);
})();

