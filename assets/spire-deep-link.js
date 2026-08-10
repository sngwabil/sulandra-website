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
      if (typeof window.SpireOpenPatient === 'function') {
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

    // BUSINESS_UAT_DIRECT_CHART_OPEN: call SPIRE's native chart opener first.
    // This removes the timing dependency on rendering the census list before a
    // deep link can open a patient chart. The visible census-row route remains
    // as a fallback for compatibility if the native opener is unavailable.
    if (await directOpenRequestedChart()) return;

    const census = await waitFor('[data-workspace="census"]');
    if (!census) return;
    const row = await waitForAuthorizedPatient(census, patientId);
    if (!row) return;
    row.click();
    await openRequestedTab(tab);
  }

  window.addEventListener('DOMContentLoaded', () => fallbackOpenRequestedChart().catch(() => {}), { once: true });
  if (document.readyState !== 'loading') fallbackOpenRequestedChart().catch(() => {});
})();
