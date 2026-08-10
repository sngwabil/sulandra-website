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

  async function fallbackOpenRequestedChart() {
    const { patientId, tab } = request();
    if (!patientId) return;

    // Native SPIRE deep-link handling runs after foundation data loads. This
    // fallback waits long enough for that path to finish and does nothing if
    // the chart is already open, preventing duplicate patient/storyboard calls.
    await sleep(2500);
    if (document.querySelector('[data-chart-tab]')) return;

    const census = await waitFor('[data-workspace="census"]');
    if (!census) return;
    const row = await waitForAuthorizedPatient(census, patientId);
    if (!row) return;
    row.click();

    if (tab) {
      const tabButton = await waitFor(`[data-chart-tab="${CSS.escape(tab)}"]`);
      if (tabButton) tabButton.click();
    }
  }

  window.addEventListener('DOMContentLoaded', () => fallbackOpenRequestedChart().catch(() => {}), { once: true });
  if (document.readyState !== 'loading') fallbackOpenRequestedChart().catch(() => {});
})();
