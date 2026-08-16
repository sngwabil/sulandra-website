(() => {
  'use strict';

  // SPIRE_MEDICATION_ORDER_CANONICAL_LOADER_V2
  // The legacy V1 order UI and its document-wide cleanup observer are retired.
  // This compatibility asset now has one job: load the approved V2 medication
  // order workspace exactly once and leave its top Add Medication Order and
  // Manage Orders controls as the only medication-management entry points.
  if (window.__SPIRE_MEDICATION_ORDER_CANONICAL_LOADER_V2) return;
  window.__SPIRE_MEDICATION_ORDER_CANONICAL_LOADER_V2 = true;

  const V2_URL = '/assets/spire-medication-order-entry-v2.js?v=20260816-med-order-v2-canonical-1';
  const SAFETY_URL = '/assets/spire-mar-safety-verifier.js?v=20260815-mar-safety-v2-layer-1';

  function removeCompetingUi() {
    // Remove only legacy/row-level controls. Never remove the V2 toolbar.
    document.querySelectorAll('.spire-med-row-manage').forEach((button) => button.remove());
    document.querySelectorAll('[data-spire-add-medication-order]').forEach((button) => {
      if (!button.closest('[data-spire-med-order-actions]')) button.remove();
    });
    document.getElementById('spire-medication-row-controls-style')?.remove();

    const legacyModal = document.getElementById('spireMedicationOrderModal');
    if (legacyModal && !legacyModal.querySelector('.spire-med-card')) legacyModal.remove();

    const legacyStyle = document.getElementById('spireMedicationOrderEntryStyles');
    if (legacyStyle && !document.querySelector('[data-spire-med-order-actions]')) legacyStyle.remove();
  }

  function loadOnce(id, src, onLoad) {
    if (document.getElementById(id)) return;
    const existing = [...document.scripts].find((script) => String(script.src || '').includes(src.split('?')[0]));
    if (existing) {
      if (onLoad) window.setTimeout(onLoad, 0);
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    if (onLoad) script.addEventListener('load', onLoad, { once: true });
    document.head.appendChild(script);
  }

  removeCompetingUi();
  // Block the retired row-control enhancer even if an older cached adaptive-tab
  // runtime tries to request it during this page session.
  window.__SPIRE_MEDICATION_ROW_CONTROLS_V1 = true;

  loadOnce('spireMedicationOrderV2Canonical', V2_URL, () => {
    removeCompetingUi();
    window.setTimeout(removeCompetingUi, 150);
  });
  loadOnce('spireMarSafetyVerifierV2Canonical', SAFETY_URL);
})();
