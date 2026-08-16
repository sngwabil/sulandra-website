(() => {
  'use strict';

  // SPIRE_DURABLE_TAB_ROUTER_V1
  // A clinical chart tab must remain directly operable even when presentation
  // runtimes re-label, wrap, or re-order the tab strip. Capture the intent at
  // document level and route it through the canonical activateView function.
  const MARKER = 'SPIRE_DURABLE_TAB_ROUTER_V1';
  if (window.__spireDurableTabRouterInstalled) return;
  window.__spireDurableTabRouterInstalled = true;
  document.documentElement.dataset.spireDurableTabRouter = MARKER;

  const STYLE_ID = 'spire-durable-tab-router-style';

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #mainChartTabs{position:relative!important;z-index:30!important;pointer-events:auto!important;isolation:isolate}
      #mainChartTabs .chart-tab[data-view]{position:relative;pointer-events:auto!important;cursor:pointer!important;user-select:none;touch-action:manipulation}
      #mainChartTabs .chart-tab[data-view]:focus-visible{outline:2px solid #0b78a3;outline-offset:-2px}
    `;
    document.head.appendChild(style);
  }

  function chartTabFromEvent(event) {
    const source = event.target instanceof Element ? event.target : null;
    const tab = source?.closest?.('.chart-tab[data-view]');
    if (!(tab instanceof HTMLElement)) return null;
    const viewId = String(tab.dataset.view || '').trim();
    const view = viewId ? document.getElementById(viewId) : null;
    if (!(view instanceof HTMLElement) || !view.classList.contains('workspace-view')) return null;
    return { tab, viewId };
  }

  function normalizeTabs() {
    document.querySelectorAll('.chart-tab[data-view]').forEach((tab) => {
      const viewId = String(tab.dataset.view || '').trim();
      if (!viewId || !document.getElementById(viewId)) return;
      tab.setAttribute('role', 'tab');
      tab.tabIndex = tab.classList.contains('active') ? 0 : -1;
      tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
      tab.setAttribute('aria-controls', viewId);
    });
  }

  function reflectSelection(viewId) {
    document.querySelectorAll('.chart-tab[data-view]').forEach((tab) => {
      const selected = String(tab.dataset.view || '') === viewId;
      tab.classList.toggle('active', selected);
      tab.tabIndex = selected ? 0 : -1;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  async function activate(viewId) {
    const target = document.getElementById(viewId);
    if (!(target instanceof HTMLElement)) return;
    sessionStorage.setItem('spire:active-view', viewId);
    reflectSelection(viewId);

    if (typeof window.activateView !== 'function') {
      console.error('[Spire Navigation] Canonical chart view router is unavailable.', { viewId });
      return;
    }

    try {
      await Promise.resolve(window.activateView(viewId));
      reflectSelection(viewId);
    } catch (error) {
      console.error('[Spire Navigation] Unable to activate chart view.', error);
      const banner = document.getElementById('spireDataBanner');
      if (banner instanceof HTMLElement) {
        banner.className = 'spire-data-banner show error';
        banner.textContent = error?.message || 'Unable to open this chart workspace.';
      }
    }
  }

  document.addEventListener('click', (event) => {
    const match = chartTabFromEvent(event);
    if (!match) return;
    // The legacy listener lives on #mainChartTabs. Handling the event here in
    // capture phase prevents duplicate loaders and makes tab routing resilient
    // to runtime wrappers/re-ordering.
    event.preventDefault();
    event.stopPropagation();
    void activate(match.viewId);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const match = chartTabFromEvent(event);
    if (!match) return;
    event.preventDefault();
    event.stopPropagation();
    void activate(match.viewId);
  }, true);

  installStyles();
  normalizeTabs();

  const tabHost = document.getElementById('mainChartTabs');
  if (tabHost) {
    const observer = new MutationObserver(() => normalizeTabs());
    observer.observe(tabHost, { childList: true, subtree: true });
  }

  window.SpireDurableNavigation = Object.freeze({
    marker: MARKER,
    activateView: activate,
  });
})();
