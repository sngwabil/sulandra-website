(() => {
  'use strict';

  // SPIRE_MEDICATION_TOP_MANAGE_ONLY_V1
  const MARKER = 'SPIRE_MEDICATION_TOP_MANAGE_ONLY_V1';
  if (window.__SPIRE_MEDICATION_MANAGEMENT_POLICY === MARKER) return;
  window.__SPIRE_MEDICATION_MANAGEMENT_POLICY = MARKER;

  // Retire the per-medication Manage enhancer before the adaptive tab runtime
  // attempts to load it. The medication-order V2 runtime remains the sole owner
  // of the top-level Manage Orders control and its order-management modal.
  window.__SPIRE_MEDICATION_ROW_CONTROLS_V1 = true;

  function normalize() {
    document.querySelectorAll('.spire-med-row-manage').forEach((button) => button.remove());
    document.getElementById('spire-medication-row-controls-style')?.remove();

    document.querySelectorAll('[data-spire-manage-medication-orders]').forEach((button) => {
      button.hidden = false;
      button.style.removeProperty('display');
      button.removeAttribute('aria-hidden');
    });

    const modal = document.getElementById('spireMedicationManageModal');
    if (modal) {
      delete modal.dataset.spireFocusedOrder;
      modal.querySelector('.spire-med-focused-caption')?.remove();
      modal.querySelectorAll('[data-order-id]').forEach((row) => row.style.removeProperty('display'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalize, { once: true });
  } else {
    normalize();
  }

  // One-shot follow-ups cover late construction of the medication-order toolbar
  // without introducing another long-lived document-wide observer.
  window.setTimeout(normalize, 100);
  window.setTimeout(normalize, 600);

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.chart-tab[data-view="manage-orders-view"], .chart-tab[data-view="mar-view"]')) {
      window.setTimeout(normalize, 0);
    }
  }, true);
})();
