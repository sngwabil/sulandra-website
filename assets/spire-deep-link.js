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

  async function waitFor(selector, timeoutMs = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const node = document.querySelector(selector);
      if (node) return node;
      await sleep(80);
    }
    return null;
  }

  async function waitForAuthorizedPatient(census, patientId, timeoutMs = 15000) {
    const selector = `[data-patient-id="${CSS.escape(patientId)}"]`;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      census.click();
      const row = document.querySelector(selector);
      if (row) return row;
      await sleep(120);
    }
    return null;
  }

  async function openRequestedChart() {
    const { patientId, tab } = request();
    if (!patientId) return;

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

  window.addEventListener('DOMContentLoaded', () => openRequestedChart().catch(() => {}), { once: true });
  if (document.readyState !== 'loading') openRequestedChart().catch(() => {});
})();
