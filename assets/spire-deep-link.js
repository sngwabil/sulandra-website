(() => {
  'use strict';

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function request() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const patientId = query.get('patientId') || query.get('patient') || hash.get('patient') || hash.get('patientId') || '';
    const tab = query.get('tab') || hash.get('tab') || '';
    return { patientId, tab };
  }

  async function waitFor(selector, timeoutMs = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const node = document.querySelector(selector);
      if (node) return node;
      await sleep(100);
    }
    return null;
  }

  async function waitForAuthorizedPatient(census, patientId, timeoutMs = 12000) {
    const selector = `[data-patient-id="${CSS.escape(patientId)}"]`;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      census.click();
      const row = document.querySelector(selector);
      if (row) return row;
      await sleep(150);
    }
    return null;
  }

  async function openRequestedTab(tab) {
    if (!tab) return;
    const tabButton = await waitFor(`[data-chart-tab="${CSS.escape(tab)}"]`);
    if (tabButton) tabButton.click();
  }

  async function directOpenRequestedChart() {
    const { patientId, tab } = request();
    if (!patientId) return false;

    const started = Date.now();
    while (Date.now() - started < 12000) {
      const shellReady = document.querySelector('#spireChartWorkspace') && document.querySelector('#spirePatientStrip');
      if (shellReady && typeof window.SpireOpenPatient === 'function') {
        await window.SpireOpenPatient(patientId);
        await openRequestedTab(tab);
        return true;
      }
      await sleep(80);
    }
    return false;
  }

  async function fallbackOpenRequestedChart() {
    const { patientId, tab } = request();
    if (!patientId) return;

    // BUSINESS_UAT_DIRECT_CHART_OPEN: wait for the installed SPIRE shell, then
    // call SPIRE's native chart opener. The visible census-row route remains a
    // compatibility fallback if the native opener is unavailable.
    if (await directOpenRequestedChart()) return;

    const census = await waitFor('[data-workspace="census"]');
    if (!census) return;
    const row = await waitForAuthorizedPatient(census, patientId);
    if (!row) return;
    row.click();
    await openRequestedTab(tab);
  }

  function recoverVisiblePatientClick(event) {
    const row = event.target?.closest?.('[data-patient-id]');
    const patientId = row?.dataset?.patientId || '';
    if (!patientId) return;
    setTimeout(async () => {
      const strip = document.querySelector('#spirePatientStrip');
      const chart = document.querySelector('#spireChartWorkspace');
      const chartReady = strip && !strip.hidden && chart?.classList.contains('active');
      if (chartReady || typeof window.SpireOpenPatient !== 'function') return;
      // BUSINESS_UAT_PATIENT_CLICK_RECOVERY: if another enhancement races the
      // core row handler, recover by invoking the same native chart opener.
      await window.SpireOpenPatient(patientId).catch(() => {});
    }, 180);
  }

  document.addEventListener('click', recoverVisiblePatientClick, true);
  window.addEventListener('DOMContentLoaded', () => fallbackOpenRequestedChart().catch(() => {}), { once: true });
  if (document.readyState !== 'loading') fallbackOpenRequestedChart().catch(() => {});
})();
