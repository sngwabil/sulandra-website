(() => {
  'use strict';

  // SPIRE_MEDICATION_ROW_CONTROLS_DISABLED_V2
  // Per-medication Manage buttons were a competing enhancement that fought the
  // canonical top-level Manage Orders workflow. Keep this asset as a harmless
  // compatibility shim because older adaptive-tab publications may still load it.
  if (window.__SPIRE_MEDICATION_ROW_CONTROLS_DISABLED_V2) return;
  window.__SPIRE_MEDICATION_ROW_CONTROLS_DISABLED_V2 = true;
  window.__SPIRE_MEDICATION_ROW_CONTROLS_V1 = true;

  function cleanup() {
    document.querySelectorAll('.spire-med-row-manage').forEach((button) => button.remove());
    document.getElementById('spire-medication-row-controls-style')?.remove();

    const modal = document.getElementById('spireMedicationManageModal');
    if (modal) {
      delete modal.dataset.spireFocusedOrder;
      modal.querySelector('.spire-med-focused-caption')?.remove();
      modal.querySelectorAll('[data-order-id]').forEach((row) => row.style.removeProperty('display'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanup, { once: true });
  } else {
    cleanup();
  }

  window.setTimeout(cleanup, 120);
  window.setTimeout(cleanup, 700);

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.chart-tab[data-view="manage-orders-view"]')) {
      window.setTimeout(cleanup, 0);
    }
  }, true);
})();
