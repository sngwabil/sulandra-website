(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const routes = {
    scheduling: '/time-attendance.html#schedule',
    time: '/time-attendance.html#admin',
    documents: '/employee360.html#files',
    reports: '/employee360.html#audit',
  };

  function wire() {
    for (const [key, target] of Object.entries(routes)) {
      document.querySelectorAll(`#topModuleNav [data-module="${key}"], #sideModuleNav [data-module="${key}"]`).forEach((node) => {
        node.dataset.sulandraRoute = target;
        node.setAttribute('aria-label', `Open ${String(node.textContent || key).trim()}`);
        if (node.tagName === 'A') node.setAttribute('href', target);
      });
    }

    document.querySelectorAll('a[href="spire-admin.html"],a[href="/spire-admin.html"]').forEach((node) => {
      node.setAttribute('href', '/spire-admin.html');
    });

    document.querySelectorAll('#sideModuleNav button').forEach((node) => {
      const onclick = node.getAttribute('onclick') || '';
      if (onclick.includes('spire-admin.html')) {
        node.removeAttribute('onclick');
        node.dataset.sulandraRoute = '/spire-admin.html';
      }
    });
  }

  wire();
  new MutationObserver(wire).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    const control = event.target.closest('[data-sulandra-route]');
    if (!control) return;
    const target = control.dataset.sulandraRoute;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(target);
  }, true);
})();
