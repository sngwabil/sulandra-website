(() => {
  'use strict';
  if (!/\/employee360(?:\.html|\/)?$/i.test(location.pathname)) return;

  const valid = new Set(['overview','files','onboarding','assignments','time','communications','security','audit']);
  const requested = () => {
    const key = String(location.hash || '').replace(/^#/, '').toLowerCase();
    return valid.has(key) ? key : '';
  };

  function activateRequestedTab() {
    const key = requested();
    if (!key) return;
    const button = document.querySelector(`#tabs button[data-tab="${CSS.escape(key)}"]`);
    const section = document.getElementById(`tab-${key}`);
    if (!button || !section) return;
    document.querySelectorAll('#tabs button[data-tab]').forEach((node) => node.classList.toggle('active', node === button));
    document.querySelectorAll('.section').forEach((node) => node.classList.toggle('active', node === section));
  }

  document.addEventListener('click', (event) => {
    const employee = event.target.closest('.employee[data-id]');
    if (employee && requested()) setTimeout(activateRequestedTab, 0);
    const tab = event.target.closest('#tabs button[data-tab]');
    if (tab) history.replaceState(null, '', `${location.pathname}${location.search}#${tab.dataset.tab}`);
  });

  const observer = new MutationObserver(() => {
    const workspace = document.getElementById('workspace');
    if (workspace && !workspace.classList.contains('hidden')) activateRequestedTab();
  });
  observer.observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:['class'] });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activateRequestedTab, { once:true });
  else activateRequestedTab();
  window.addEventListener('hashchange', activateRequestedTab);
})();
