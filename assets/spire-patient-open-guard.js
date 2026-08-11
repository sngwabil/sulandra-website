(() => {
  'use strict';

  const CONTRACT = '20260811-spire-patient-open-guard-1';
  let activePatientId = '';
  let activeOpen = null;

  const chartOpenFor = (patientId) => {
    patientId = String(patientId || '').trim();
    if (!patientId) return false;
    const chart = document.getElementById('spireChartWorkspace');
    const strip = document.getElementById('spirePatientStrip');
    if (!chart || !strip || strip.hidden || !chart.classList.contains('active') || !chart.querySelector('[data-chart-tab]')) return false;
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const routedPatientId = hash.get('patient') || hash.get('patientId') || '';
    const storedPatientId = sessionStorage.getItem('spire:patientId') || document.body.dataset.spireChartPatientId || '';
    return routedPatientId === patientId || storedPatientId === patientId;
  };

  const setBusy = (patientId, busy) => {
    document.body.dataset.spirePatientOpenGuard = CONTRACT;
    if (busy) document.body.dataset.spirePatientOpening = patientId;
    else if (document.body.dataset.spirePatientOpening === patientId) delete document.body.dataset.spirePatientOpening;
    document.querySelectorAll(`[data-patient-id="${CSS.escape(patientId)}"]`).forEach((row) => {
      row.toggleAttribute('aria-busy', busy);
    });
  };

  async function waitForNativeOpen(timeoutMs = 3000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (typeof window.SpireOpenPatient === 'function') return window.SpireOpenPatient;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return null;
  }

  function requestPatientOpen(patientId) {
    patientId = String(patientId || '').trim();
    if (!patientId) return Promise.resolve(false);
    if (chartOpenFor(patientId)) return Promise.resolve(true);
    if (activeOpen && activePatientId === patientId) return activeOpen;

    activePatientId = patientId;
    setBusy(patientId, true);
    const flight = (async () => {
      const opener = await waitForNativeOpen();
      if (!opener) throw new Error('SPIRE patient chart opener is unavailable');
      await opener(patientId);
      if (window.SpireChartReady?.markChartReady) window.SpireChartReady.markChartReady(patientId);
      else if (window.SpireCanonicalBootstrap?.forceChartActive) window.SpireCanonicalBootstrap.forceChartActive(patientId);
      return chartOpenFor(patientId) || Boolean(document.getElementById('spireChartWorkspace')?.querySelector('[data-chart-tab]'));
    })().catch((error) => {
      console.error('[SPIRE patient open guard]', error);
      return false;
    }).finally(() => {
      setBusy(patientId, false);
      if (activeOpen === flight) {
        activeOpen = null;
        activePatientId = '';
      }
    });
    activeOpen = flight;
    return flight;
  }

  function ownPatientClick(event) {
    const row = event.target?.closest?.('[data-patient-id]');
    const patientId = String(row?.dataset?.patientId || '').trim();
    if (!patientId) return;

    // SINGLE_OWNER_PATIENT_CLICK: patient rows have one event owner. This prevents
    // the native shell, chart-ready, canonical bootstrap, deep-link recovery and
    // chart-recovery layers from all opening the same chart for one click.
    event.preventDefault();
    event.stopImmediatePropagation();
    requestPatientOpen(patientId).catch(() => {});
  }

  function suppressPatientDoubleClick(event) {
    const row = event.target?.closest?.('[data-patient-id]');
    if (!row) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  document.addEventListener('click', ownPatientClick, true);
  document.addEventListener('dblclick', suppressPatientDoubleClick, true);
  window.SpirePatientOpenGuard = Object.freeze({ contract: CONTRACT, requestPatientOpen, chartOpenFor });
})();
