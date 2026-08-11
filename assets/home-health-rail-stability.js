(() => {
  'use strict';
  const CONTRACT = '20260810-home-health-rail-stability-2';
  const KEY = 'sulandra:home-health:active-rail';
  const RAILS = ['episodes','intakes','staff','schedule'];
  let restoring = false;

  function selectedRail() {
    try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
  }

  function remember(rail) {
    if (!rail || !RAILS.includes(rail)) return;
    try { sessionStorage.setItem(KEY, rail); } catch {}
  }

  function railVisible(rail) {
    const host = document.getElementById(`${rail}Rail`);
    return Boolean(host && !host.hidden);
  }

  function enforceRail(rail) {
    if (!RAILS.includes(rail)) return false;
    let found = false;
    document.querySelectorAll('[data-rail]').forEach((button) => {
      const active = button.dataset.rail === rail;
      button.classList.toggle('active', active);
      if (active) found = true;
    });
    RAILS.forEach((key) => {
      const host = document.getElementById(`${key}Rail`);
      if (host) host.hidden = key !== rail;
    });
    if (found) document.documentElement.dataset.homeHealthActiveRail = rail;
    return found && railVisible(rail);
  }

  function restore() {
    const rail = selectedRail();
    if (!rail || restoring) return;
    restoring = true;
    try {
      // DETERMINISTIC_HOME_HEALTH_RAIL_RESTORE: enforce the rendered rail state
      // directly first. Replaying a click alone is timing-dependent because the
      // Home Health page may not have attached its onclick handlers yet.
      enforceRail(rail);
      const button = document.querySelector(`[data-rail="${CSS.escape(rail)}"]`);
      if (button && !railVisible(rail)) button.click();
      enforceRail(rail);
    } finally { restoring = false; }
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
