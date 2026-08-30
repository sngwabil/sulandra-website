(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const routes = {
    scheduling: '/scheduling.html',
    time: '/time-attendance.html#attendanceSheet',
    documents: '/employee360.html#files',
    reports: '/employee360.html#audit',
  };

  const redirectLegacySchedulingHash = () => {
    if (String(location.hash || '').toLowerCase() === '#scheduling') {
      window.location.replace('/scheduling.html');
      return true;
    }
    return false;
  };

  function wire() {
    for (const [key, target] of Object.entries(routes)) {
      document.querySelectorAll(`#topModuleNav [data-module="${key}"], #sideModuleNav [data-module="${key}"]`).forEach((node) => {
        node.dataset.sulandraRoute = target;
        node.setAttribute('aria-label', `Open ${String(node.textContent || key).trim()}`);
        node.removeAttribute('onclick');
        if (node.tagName === 'A') node.setAttribute('href', target);
      });
    }

    document.querySelectorAll('a[href="#scheduling"],a[href="/admin.html#scheduling"],a[href="admin.html#scheduling"]').forEach((node) => {
      node.setAttribute('href', '/scheduling.html');
      node.dataset.sulandraRoute = '/scheduling.html';
      node.removeAttribute('onclick');
    });

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

  if (redirectLegacySchedulingHash()) return;
  wire();
  new MutationObserver(wire).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', redirectLegacySchedulingHash);

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