(() => {
  'use strict';

  if (!/\/admin-operations\.html$/i.test(window.location.pathname)) return;

  const OPERATIONS_SIDEBAR_KEY = 'sulandra:operations:sidebar-open';
  const OWNER_ONLY_RUNTIME_IDS = Object.freeze([
    'canonical-admin-shell',
    'canonical-admin-owner',
    'canonical-admin-live-dashboard',
    'canonical-admin-analog-clock',
    'canonical-admin-dashboard-cleanup',
  ]);

  function ensureCanonicalSso() {
    if (window.SulandraSSO || document.querySelector('script[data-canonical-admin-sso]')) return;
    const script = document.createElement('script');
    script.src = '/assets/sulandra-sso-session.js?v=20260806-sso-1';
    script.dataset.canonicalAdminSso = 'true';
    script.async = false;
    document.head.appendChild(script);
  }

  function suppressOwnerOnlyRuntimes() {
    for (const id of OWNER_ONLY_RUNTIME_IDS) {
      if (document.getElementById(id)) continue;
      const sentinel = document.createElement('script');
      sentinel.id = id;
      sentinel.type = 'application/json';
      sentinel.dataset.operationsSuppressedOwnerRuntime = 'true';
      sentinel.textContent = '{}';
      document.head.appendChild(sentinel);
    }
  }

  function ensureModuleHosts() {
    if (document.getElementById('module-employees')) return;
    const onboarding = document.getElementById('module-onboarding');
    if (!onboarding?.parentElement) return;
    const employee = document.createElement('section');
    employee.id = 'module-employees';
    employee.className = 'card module';
    employee.setAttribute('aria-label', 'Employee 360 company workspace');
    employee.innerHTML = '<h1>Employee 360</h1><p class="sub">Loading the selected company employee directory, permissions, compliance, workforce, documents, learning, payroll, benefits, leave, safety, analytics and audit tools…</p>';
    onboarding.parentElement.insertBefore(employee, onboarding);
  }

  function installSidebarToggle() {
    if (document.getElementById('operationsSidebarToggle')) return;
    const sidebar = document.querySelector('.sidebar');
    const grid = document.querySelector('.grid');
    if (!sidebar || !grid) return;

    let styles = document.getElementById('operationsSidebarToggleStyles');
    if (!styles) {
      styles = document.createElement('style');
      styles.id = 'operationsSidebarToggleStyles';
      styles.textContent = `
        .operations-sidebar-toggle{position:fixed;z-index:1900;top:52%;transform:translateY(-50%);width:30px;height:44px;border:0;border-radius:0 10px 10px 0;background:#0b5c9b;color:#fff;box-shadow:0 5px 16px rgba(0,75,141,.25);display:grid;place-items:center;padding:0;cursor:pointer;font:900 20px/1 "Segoe UI",Arial,sans-serif;transition:left .2s ease,background .15s ease}
        .operations-sidebar-toggle:hover{background:#074b80}.operations-sidebar-toggle span{transition:transform .2s ease}
        body.operations-sidebar-collapsed .grid{grid-template-columns:minmax(0,1fr)!important;gap:0!important}
        body.operations-sidebar-collapsed .sidebar{display:none!important;width:0!important;min-width:0!important;max-width:0!important;overflow:hidden!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}
        @media(max-width:980px){.operations-sidebar-toggle{top:auto;bottom:22px;transform:none}}
      `;
      document.head.appendChild(styles);
    }

    const toggle = document.createElement('button');
    toggle.id = 'operationsSidebarToggle';
    toggle.className = 'operations-sidebar-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', sidebar.id || 'sideModuleNav');
    toggle.setAttribute('aria-label', 'Toggle Operations folders');
    toggle.innerHTML = '<span aria-hidden="true">‹</span>';
    document.body.appendChild(toggle);

    const syncPosition = (open) => {
      if (!open) {
        toggle.style.left = '0px';
        return;
      }
      requestAnimationFrame(() => {
        const rect = sidebar.getBoundingClientRect();
        toggle.style.left = `${Math.max(0, Math.round(rect.right) - 2)}px`;
      });
    };

    const apply = (open, persist = true) => {
      document.body.classList.toggle('operations-sidebar-collapsed', !open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('span').textContent = open ? '‹' : '›';
      toggle.title = open ? 'Close Operations folders' : 'Open Operations folders';
      if (persist) localStorage.setItem(OPERATIONS_SIDEBAR_KEY, String(open));
      syncPosition(open);
    };

    toggle.addEventListener('click', () => apply(document.body.classList.contains('operations-sidebar-collapsed')));
    window.addEventListener('resize', () => syncPosition(!document.body.classList.contains('operations-sidebar-collapsed')));
    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('[data-open-ops-folder]')) apply(true);
    }, true);

    const saved = localStorage.getItem(OPERATIONS_SIDEBAR_KEY);
    apply(saved === null ? true : saved === 'true', false);
  }

  function mount() {
    ensureCanonicalSso();
    suppressOwnerOnlyRuntimes();
    ensureModuleHosts();
    installSidebarToggle();
    document.documentElement.dataset.adminInformationArchitecture = 'company-operations-v1';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();