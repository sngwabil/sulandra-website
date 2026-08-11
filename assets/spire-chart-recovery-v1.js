(() => {
  'use strict';

  const CONTRACT = '20260810-spire-chart-recovery-1';

  function markReady(patientId = '') {
    return Boolean(window.SpirePatientOpenGuard?.activateChart?.(patientId));
  }

  async function recover(patientId, tab = '') {
    patientId = String(patientId || '').trim();
    if (!patientId) return false;
    return Boolean(await window.SpirePatientOpenGuard?.requestPatientOpen?.(patientId, tab));
  }

  // Legacy click and MutationObserver recovery are intentionally retired.
  // SpireChartRecovery remains as a compatibility facade for existing callers.
  window.SpireChartRecovery = Object.freeze({ contract: CONTRACT, recover, markReady });
})();
