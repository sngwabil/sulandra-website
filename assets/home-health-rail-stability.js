(() => {
  'use strict';
  const CONTRACT = '20260810-home-health-rail-stability-1';
  const KEY = 'sulandra:home-health:active-rail';
  let restoring = false;

  function selectedRail() {
    try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
  }

  function remember(rail) {
    if (!rail) return;
    try { sessionStorage.setItem(KEY, rail); } catch {}
  }

  function railVisible(rail) {
    const host = document.getElementById(`${rail}Rail`);
    return Boolean(host && !host.hidden);
  }

  function restore() {
    const rail = selectedRail();
    if (!rail || restoring || railVisible(rail)) return;
    const button = document.querySelector(`[data-rail="${CSS.escape(rail)}"]`);
    if (!button) return;
    restoring = true;
    try { button.click(); } finally { restoring = false; }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-rail]');
    if (!button?.dataset?.rail) return;
    remember(button.dataset.rail);
    setTimeout(restore, 0);
  }, true);

  const observer = new MutationObserver(() => restore());
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'] });

  window.addEventListener('load', restore, { once: true });
  window.addEventListener('sulandra:entity-context-changed', () => setTimeout(restore, 0));
  document.documentElement.dataset.homeHealthRailStability = CONTRACT;
  if (document.readyState !== 'loading') restore();
})();
