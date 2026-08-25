(() => {
  'use strict';

  if (!/\/admin-operations\.html$/i.test(window.location.pathname)) return;

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

  function mount() {
    ensureCanonicalSso();
    suppressOwnerOnlyRuntimes();
    ensureModuleHosts();
    document.documentElement.dataset.adminInformationArchitecture = 'company-operations-v1';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
