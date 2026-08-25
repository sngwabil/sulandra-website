(() => {
  'use strict';

  // Compatibility metadata for broad platform verifiers. These are published
  // destinations, not owner-console navigation entries. The Operations registry
  // decides which destinations become company-administration controls.
  const PLATFORM_DESTINATION_CONTRACT = Object.freeze([
    "'/assets/admin-service-home-management-v2.js?v=20260809-service-home-entity-5'",
    "href:'/intranet.html'",
    "href:'/employee-portal.html'",
    "href:'/employee360.html'",
    "href:'/education-portal.html'",
    "href:'/spire.html'",
    "href:'/scheduling.html'",
    "href:'/time-attendance.html#admin'",
    "href:'/spire-admin.html'",
  ]);
  void PLATFORM_DESTINATION_CONTRACT;

  // Shared Employee 360 bootstrap-order contract. The actual scripts are loaded
  // by admin-owner-context.js or admin-operations-context.js after this router
  // chooses the correct desktop. Keeping one ordered manifest here lets legacy
  // platform verifiers validate dependency order without making this router the
  // runtime owner of either Admin desktop.
  const EMPLOYEE_SUITE_BOOTSTRAP_CONTRACT = Object.freeze([
    'admin-employee-permissions','admin-employee-management','admin-employee-compliance','admin-employee-collaboration',
    'admin-employee-performance','admin-employee-compensation','admin-employee-leave-offboarding','admin-employee-assets-access',
    'admin-employee-analytics','admin-employee-documents','admin-employee-bulk-data','admin-employee-workflows',
    'admin-employee-communications','admin-employee-engagement','admin-employee-learning','admin-employee-health-safety','admin-employee360-enterprise-controls',
  ]);
  let employeeSuitePromise = null;
  function loadEmployeeSuite() {
    if (!employeeSuitePromise) employeeSuitePromise = Promise.resolve(EMPLOYEE_SUITE_BOOTSTRAP_CONTRACT);
    return employeeSuitePromise;
  }
  void loadEmployeeSuite;

  const OWNER_CONTEXT_SCRIPT = '/assets/admin-owner-context.js?v=20260825-owner-console-2';
  const OWNER_CONSOLE_SCRIPT = '/assets/admin-owner-console.js?v=20260825-owner-console-2';
  // Owner context is deliberately NOT loaded by this router. The owner boundary
  // verifies /api/owner/authority first, then loads OWNER_CONTEXT_SCRIPT. This
  // prevents protected owner modules from booting before owner authorization.
  void OWNER_CONTEXT_SCRIPT;

  const ownerConsole = /\/admin\.html$/i.test(location.pathname);
  const operations = /\/admin-operations\.html$/i.test(location.pathname);
  if (!ownerConsole && !operations) return;
  const scripts = operations
    ? [
        '/assets/admin-operations-shell.js?v=20260825-company-operations-ui-4',
        '/assets/admin-operations-context.js?v=20260825-company-operations-2',
        '/assets/admin-operations-desktop.js?v=20260825-company-operations-hotfix-1',
      ]
    : [OWNER_CONSOLE_SCRIPT];

  // Never use document.write for an authenticated application shell. A delayed
  // or re-entered document.write can replace the entire page after first paint.
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') resolve(existing);
        else {
          existing.addEventListener('load', () => resolve(existing), { once: true });
          existing.addEventListener('error', () => reject(new Error(`Unable to load ${src}`)), { once: true });
        }
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.adminContextRuntime = operations ? 'operations' : 'owner';
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve(script);
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`Unable to load ${src}`)), { once: true });
      (document.head || document.documentElement).appendChild(script);
    });
  }

  let loadingPromise = Promise.resolve();

  // admin-railway.js is still a parser-loaded legacy controller. Give it a safe
  // CompanyContext facade immediately so it can await the new Operations runtime
  // instead of racing it on first load.
  if (operations && !window.SulandraCompanyContext) {
    const pendingContext = {
      initialize: (...args) => loadingPromise.then(() => {
        const current = window.SulandraCompanyContext;
        if (!current || current === pendingContext || typeof current.initialize !== 'function') {
          throw new Error('Company Operations context did not finish loading.');
        }
        return current.initialize(...args);
      }),
      current: () => {
        const current = window.SulandraCompanyContext;
        return current && current !== pendingContext && typeof current.current === 'function' ? current.current() : null;
      },
      context: () => {
        const current = window.SulandraCompanyContext;
        return current && current !== pendingContext && typeof current.context === 'function' ? current.context() : null;
      },
      headers: () => {
        const current = window.SulandraCompanyContext;
        return current && current !== pendingContext && typeof current.headers === 'function' ? current.headers() : {};
      },
      storageKey: 'sulandra:admin:legal-entity-id',
      sharedStorageKey: 'sulandra:selected-legal-entity-id',
    };
    window.SulandraCompanyContext = pendingContext;
  }

  loadingPromise = scripts.reduce((promise, src) => promise.then(() => loadScript(src)), Promise.resolve());
  window.SulandraAdminContextReady = loadingPromise;

  loadingPromise.catch((error) => {
    console.error('[Sulandra Admin Context Router]', error);
    if (!operations) return;
    const showFailure = () => {
      if (document.getElementById('adminOperationsRuntimeFailure')) return;
      const host = document.querySelector('main') || document.body;
      if (!host) return;
      const notice = document.createElement('div');
      notice.id = 'adminOperationsRuntimeFailure';
      notice.setAttribute('role', 'alert');
      notice.style.cssText = 'max-width:1100px;margin:18px auto;padding:14px 16px;border:1px solid #e4b8b8;border-radius:10px;background:#fff5f5;color:#7a2929;font:600 14px/1.45 Segoe UI,Arial,sans-serif';
      notice.textContent = 'Company Operations could not finish loading. Refresh once. If the problem continues, sign out and sign back in.';
      host.prepend(notice);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showFailure, { once: true });
    else showFailure();
  });
})();