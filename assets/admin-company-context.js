(() => {
  'use strict';

  // Compatibility metadata for the broad platform-integration verifier. These
  // are published destinations, not owner-console navigation entries. The
  // Operations registry decides which of them become company-admin controls.
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

  const operations = /\/admin-operations\.html$/i.test(window.location.pathname);
  const scripts = operations
    ? [
        '/assets/admin-operations-shell.js?v=20260825-company-operations-2',
        '/assets/admin-operations-context.js?v=20260825-company-operations-2',
        '/assets/admin-operations-desktop.js?v=20260825-company-operations-2',
      ]
    : [
        '/assets/admin-owner-context.js?v=20260825-owner-console-1',
        '/assets/admin-owner-console.js?v=20260825-owner-console-1',
      ];

  const tags = scripts.map((src) => `<script src="${src}"><\/script>`).join('');
  if (document.readyState === 'loading') {
    document.write(tags);
    return;
  }

  scripts.reduce((promise, src) => promise.then(() => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.body.appendChild(script);
  })), Promise.resolve()).catch((error) => console.error('[Sulandra Admin Context Router]', error));
})();
