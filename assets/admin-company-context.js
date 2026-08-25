(() => {
  'use strict';

  const operations = /\/admin-operations\.html$/i.test(window.location.pathname);
  const scripts = operations
    ? [
        '/assets/admin-operations-context.js?v=20260825-company-operations-1',
        '/assets/admin-operations-desktop.js?v=20260825-company-operations-1',
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
