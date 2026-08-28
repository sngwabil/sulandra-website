(() => {
  'use strict';

  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const LAUNCHER_ID = 'ownerITSolutionsLauncher';

  function addLauncher() {
    if (document.getElementById(LAUNCHER_ID)) return true;

    const operations = document.getElementById('ownerOperationsLauncher')
      || [...document.querySelectorAll('a,button')].find((node) => String(node.textContent || '').trim() === 'Operations');
    if (!operations?.parentElement) return false;

    const link = document.createElement('a');
    link.id = LAUNCHER_ID;
    link.href = '/it-solutions.html';
    link.className = operations.className || 'widget-btn';
    link.textContent = 'IT Solutions';
    link.setAttribute('aria-label', 'Open Sulandra IT Solutions');
    operations.insertAdjacentElement('afterend', link);
    return true;
  }

  const run = () => {
    addLauncher();
    window.setTimeout(addLauncher, 250);
    window.setTimeout(addLauncher, 750);
    window.setTimeout(addLauncher, 1500);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  const observer = new MutationObserver(() => addLauncher());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
