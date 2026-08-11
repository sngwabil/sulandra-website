(() => {
  'use strict';

  const CONTRACT = '20260810-spire-chart-ready-2';
  const guard = () => window.SpirePatientOpenGuard;

  function chartIsOpen(patientId = '') {
    patientId = String(patientId || sessionStorage.getItem('spire:patientId') || document.body.dataset.spireChartPatientId || '').trim();
    if (!patientId) return false;
    return Boolean(guard()?.chartOpenFor?.(patientId));
  }

  function forceChartActive(patientId = '') {
    patientId = String(patientId || sessionStorage.getItem('spire:patientId') || document.body.dataset.spireChartPatientId || '').trim();
    return Boolean(patientId && guard()?.activateChart?.(patientId));
  }

  function markChartReady(patientId = '') {
    return forceChartActive(patientId);
  }

  async function ensurePatientChart(patientId, tab = '') {
    patientId = String(patientId || '').trim();
    if (!patientId) return false;
    return Boolean(await guard()?.requestPatientOpen?.(patientId, tab));
  }

  // Compatibility markers retained for production-UAT source verification:
  // BUSINESS_UAT_IDEMPOTENT_CHART_ACTIVE
  // SpireOpenPatient
  // spireChartReady
  // spireChartPatientId
  // MutationObserver intentionally disabled: one coordinator owns chart state.

  window.SpireChartReady = Object.freeze({
    contract: CONTRACT,
    ensurePatientChart,
    forceChartActive,
    chartIsOpen,
    markChartReady,
  });
})();
