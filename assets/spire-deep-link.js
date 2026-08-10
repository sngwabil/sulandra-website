(() => {
  'use strict';

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
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    return null;
  }

  async function openRequestedChart() {
    const { patientId, tab } = request();
    if (!patientId) return;

    const census = await waitFor('[data-workspace="census"]');
    if (!census) return;
    census.click();

    const row = await waitFor(`[data-patient-id="${CSS.escape(patientId)}"]`);
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
