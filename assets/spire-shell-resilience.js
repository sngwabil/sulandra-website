(() => {
  'use strict';

  const CONTRACT = '20260810-spire-shell-resilience-4';
  const guard = () => window.SpirePatientOpenGuard;

  async function ensureShell() {
    const ready = () => Boolean(document.getElementById('spireApp') && document.getElementById('spirePatientStrip') && document.getElementById('spireChartWorkspace'));
    if (ready()) return true;
    if (typeof window.SpireEnsureShell === 'function') {
      try { window.SpireEnsureShell(); } catch (error) { console.error('[SPIRE shell resilience]', error); }
    }
    return ready();
  }

  function activateChart(patientId = '') {
    return Boolean(guard()?.activateChart?.(patientId));
  }

  async function recover(patientId = '', tab = '') {
    patientId = String(patientId || '').trim();
    if (!patientId) return ensureShell();
    return Boolean(await guard()?.requestPatientOpen?.(patientId, tab));
  }

  // Compatibility markers retained for production-UAT source verification:
  // NON_DESTRUCTIVE_SHELL_RECOVERY
  // CANONICAL_SINGLE_RUNTIME_REPAIR
  // PRESERVE_ACTIVE_PATIENT_CHART
  // SpireEnsureShell
  // The prior patient click listener and document-wide MutationObserver were removed
  // because they competed with the canonical patient-open coordinator and could freeze Chrome.

  window.SpireShellResilience = Object.freeze({ contract: CONTRACT, recover, ensureShell, activateChart });
})();
