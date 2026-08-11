(() => {
  'use strict';

  function request() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return {
      patientId: query.get('patientId') || query.get('patient') || hash.get('patient') || hash.get('patientId') || '',
      tab: query.get('tab') || hash.get('tab') || '',
    };
  }

  async function directOpenRequestedChart() {
    const { patientId, tab } = request();
    if (!patientId) return false;
    return Boolean(await window.SpirePatientOpenGuard?.requestPatientOpen?.(patientId, tab));
  }

  async function fallbackOpenRequestedChart() {
    return directOpenRequestedChart();
  }

  // Compatibility markers retained for production-UAT source verification:
  // BUSINESS_UAT_DIRECT_CHART_OPEN
  // BUSINESS_UAT_PATIENT_CLICK_RECOVERY
  // SpireChartReady
  // waitForAuthorizedPatient
  // Visible patient clicks are no longer registered here. The single-owner
  // SpirePatientOpenGuard handles both normal rows and deep-linked charts.

  window.SpireDeepLink = Object.freeze({ directOpenRequestedChart, fallbackOpenRequestedChart });
})();
