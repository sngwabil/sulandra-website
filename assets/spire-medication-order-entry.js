(() => {
  'use strict';

  // SPIRE_MEDICATION_ORDER_CANONICAL_LOADER_V4
  // One owner, one toolbar. V2 owns the medication-order actions; this loader
  // keeps that exact toolbar attached when the Orders workspace rerenders.
  // The observer is deliberately scoped to #manage-orders-view only.
  if (window.__SPIRE_MEDICATION_ORDER_CANONICAL_LOADER_V4) return;
  window.__SPIRE_MEDICATION_ORDER_CANONICAL_LOADER_V4 = true;

  const V2_URL = '/assets/spire-medication-order-entry-v2.js?v=20260816-med-order-v2-canonical-2';
  const SAFETY_URL = '/assets/spire-mar-safety-verifier.js?v=20260815-mar-safety-v2-layer-1';
  let loading = false;
  let retainedToolbar = null;
  let observedOrdersView = null;
  let ordersObserver = null;
  let repairTimer = 0;

  function ordersView() {
    return document.getElementById('manage-orders-view');
  }

  function ordersTitle(view = ordersView()) {
    if (!view) return null;
    return [...view.querySelectorAll('h1,h2,h3,h4,strong,div,span')]
      .find((node) => String(node.textContent || '').trim() === 'Active Medication Orders') || null;
  }

  function canonicalToolbar() {
    return document.querySelector('[data-spire-med-order-actions]');
  }

  function rememberCanonicalToolbar() {
    const toolbar = canonicalToolbar();
    if (toolbar) retainedToolbar = toolbar;
    return toolbar;
  }

  function removeCompetingUi() {
    document.querySelectorAll('.spire-med-row-manage').forEach((button) => button.remove());
    document.querySelectorAll('[data-spire-add-medication-order]').forEach((button) => {
      if (!button.closest('[data-spire-med-order-actions]')) button.remove();
    });
    document.getElementById('spire-medication-row-controls-style')?.remove();

    const legacyModal = document.getElementById('spireMedicationOrderModal');
    if (legacyModal && !legacyModal.querySelector('.spire-med-card')) legacyModal.remove();

    // Do not remove #spireMedicationOrderEntryStyles when the toolbar is
    // temporarily detached. That style belongs to V2 and must survive a chart
    // repaint so the restored controls keep the correct Image-2 presentation.
  }

  function restoreRetainedToolbar() {
    if (canonicalToolbar()) return Boolean(rememberCanonicalToolbar());
    if (!retainedToolbar) return false;
    const view = ordersView();
    const title = ordersTitle(view);
    if (!view || !title || !view.classList.contains('active')) return false;
    title.insertAdjacentElement('afterend', retainedToolbar);
    return true;
  }

  function loadScriptOnce(id, src, onLoad) {
    const byId = document.getElementById(id);
    if (byId) {
      if (onLoad) window.setTimeout(onLoad, 0);
      return true;
    }
    const base = src.split('?')[0];
    const existing = [...document.scripts].find((script) => String(script.src || '').includes(base));
    if (existing) {
      if (onLoad) window.setTimeout(onLoad, 0);
      return true;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    if (onLoad) script.addEventListener('load', onLoad, { once: true });
    document.head.appendChild(script);
    return true;
  }

  function ordersPanelReady() {
    const view = ordersView();
    if (!view || !view.classList.contains('active')) return false;
    return Boolean(ordersTitle(view));
  }

  function observeOrdersWorkspace() {
    const view = ordersView();
    if (!view || observedOrdersView === view) return Boolean(view);
    ordersObserver?.disconnect();
    observedOrdersView = view;
    ordersObserver = new MutationObserver(() => {
      window.clearTimeout(repairTimer);
      repairTimer = window.setTimeout(() => {
        if (!view.isConnected) {
          observedOrdersView = null;
          ordersObserver?.disconnect();
          return;
        }
        const current = rememberCanonicalToolbar();
        if (!current && view.classList.contains('active')) {
          if (!restoreRetainedToolbar()) ensureCanonicalToolbar();
        }
      }, 0);
    });
    ordersObserver.observe(view, { childList: true, subtree: true });
    return true;
  }

  function afterV2Ready() {
    loading = false;
    removeCompetingUi();
    rememberCanonicalToolbar();
    observeOrdersWorkspace();
    if (!canonicalToolbar()) restoreRetainedToolbar();
    window.setTimeout(() => {
      removeCompetingUi();
      rememberCanonicalToolbar();
      if (!canonicalToolbar()) restoreRetainedToolbar();
    }, 120);
  }

  function ensureCanonicalToolbar() {
    observeOrdersWorkspace();
    if (!ordersPanelReady()) return false;
    removeCompetingUi();
    if (rememberCanonicalToolbar()) return true;
    if (restoreRetainedToolbar()) return true;
    if (loading) return false;
    loading = true;
    loadScriptOnce('spireMedicationOrderV2Canonical', V2_URL, afterV2Ready);
    loadScriptOnce('spireMarSafetyVerifierV2Canonical', SAFETY_URL);
    return true;
  }

  // Retire the per-row enhancer even if an older cached adaptive-tab runtime
  // requests its asset during this session.
  window.__SPIRE_MEDICATION_ROW_CONTROLS_V1 = true;
  removeCompetingUi();

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const ordersTab = event.target.closest('.chart-tab[data-view="manage-orders-view"]');
    if (!ordersTab) return;
    window.setTimeout(ensureCanonicalToolbar, 0);
    window.setTimeout(ensureCanonicalToolbar, 100);
    window.setTimeout(ensureCanonicalToolbar, 350);
  }, true);

  // Handle reloads/deep links where Orders is already active. These are bounded
  // retries; the only long-lived observer is scoped to the Orders workspace.
  const boot = () => {
    observeOrdersWorkspace();
    window.setTimeout(ensureCanonicalToolbar, 0);
    window.setTimeout(ensureCanonicalToolbar, 300);
    window.setTimeout(ensureCanonicalToolbar, 900);
    window.setTimeout(ensureCanonicalToolbar, 1800);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
