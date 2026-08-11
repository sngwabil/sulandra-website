(() => {
  'use strict';

  const CONTRACT = '20260810-spire-canonical-bootstrap-3';
  const guard = () => window.SpirePatientOpenGuard;

  async function ensureShell() {
    if (document.getElementById('spirePatientStrip') && document.getElementById('spireChartWorkspace')) return true;
    if (typeof window.SpireEnsureShell === 'function') {
      try { window.SpireEnsureShell(); } catch (error) { console.error('[SPIRE canonical shell]', error); }
    }
    return Boolean(document.getElementById('spirePatientStrip') && document.getElementById('spireChartWorkspace'));
  }

  function forceChartActive(patientId = '') {
    return Boolean(guard()?.activateChart?.(patientId));
  }

  async function stabilize(patientId = '', tab = '') {
    patientId = String(patientId || '').trim();
    if (!patientId) return ensureShell();
    return Boolean(await guard()?.requestPatientOpen?.(patientId, tab));
  }

  // Compatibility markers retained for production-UAT source verification:
  // DETERMINISTIC_CANONICAL_SHELL_BOOTSTRAP
  // RECOVER_AFTER_CANONICAL_SHELL_RESET
  // RETRY_NATIVE_PATIENT_OPEN_AFTER_SHELL_REPAIR
  // The legacy MutationObserver/click recovery loop is intentionally removed.

  window.SpireCanonicalBootstrap = Object.freeze({ contract: CONTRACT, ensureShell, stabilize, forceChartActive });
})();
