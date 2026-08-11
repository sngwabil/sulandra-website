(() => {
  'use strict';

  const CONTRACT = '20260811-spire-patient-open-guard-4';
  let activePatientId = '';
  let activeOpen = null;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Early quarantine remains for retired compatibility runtimes. The workspace-
  // completion observer is suppressed deterministically by the scripts bracketing
  // that module in spire.html, so normal SPIRE observers remain available.
  const NativeMutationObserver = window.MutationObserver;
  if (NativeMutationObserver && !window.__spireLegacyObserverQuarantine) {
    const unsafeObserverPattern = /spire-(?:canonical-bootstrap|shell-resilience|chart-ready|chart-recovery-v1)\.js/i;
    function GuardedMutationObserver(callback) {
      const stack = String(new Error().stack || '');
      if (unsafeObserverPattern.test(stack)) {
        document.documentElement.dataset.spireUnsafeObserverQuarantined = CONTRACT;
        return {
          observe() {},
          disconnect() {},
          takeRecords() { return []; },
        };
      }
      return new NativeMutationObserver(callback);
    }
    GuardedMutationObserver.prototype = NativeMutationObserver.prototype;
    window.MutationObserver = GuardedMutationObserver;
    window.__spireLegacyObserverQuarantine = CONTRACT;
  }

  const requestedFromLocation = () => {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return {
      patientId: query.get('patientId') || query.get('patient') || hash.get('patientId') || hash.get('patient') || '',
      tab: query.get('tab') || hash.get('tab') || '',
    };
  };

  function chartElementsReady() {
    const chart = document.getElementById('spireChartWorkspace');
    const strip = document.getElementById('spirePatientStrip');
    return Boolean(chart && strip && !strip.hidden && chart.querySelector('[data-chart-tab]'));
  }

  function chartOpenFor(patientId) {
    patientId = String(patientId || '').trim();
    if (!patientId || !chartElementsReady()) return false;
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const routedPatientId = hash.get('patient') || hash.get('patientId') || '';
    const storedPatientId = sessionStorage.getItem('spire:patientId') || document.body.dataset.spireChartPatientId || '';
    return routedPatientId === patientId || storedPatientId === patientId;
  }

  function activateChart(patientId) {
    patientId = String(patientId || '').trim();
    const chart = document.getElementById('spireChartWorkspace');
    const strip = document.getElementById('spirePatientStrip');
    if (!patientId || !chart || !strip || strip.hidden || !chart.querySelector('[data-chart-tab]')) return false;

    document.querySelectorAll('.spire-workspace').forEach((node) => {
      if (node === chart) {
        if (!node.classList.contains('active')) node.classList.add('active');
      } else if (node.classList.contains('active')) {
        node.classList.remove('active');
      }
    });
    document.querySelectorAll('.spire-global-nav [data-workspace].active').forEach((node) => node.classList.remove('active'));
    sessionStorage.setItem('spire:patientId', patientId);
    document.body.dataset.spireChartReady = 'true';
    document.body.dataset.spireChartPatientId = patientId;
    document.body.dataset.spirePatientOpenGuard = CONTRACT;
    return chart.classList.contains('active');
  }

  const setBusy = (patientId, busy) => {
    if (busy) document.body.dataset.spirePatientOpening = patientId;
    else if (document.body.dataset.spirePatientOpening === patientId) delete document.body.dataset.spirePatientOpening;
    document.querySelectorAll(`[data-patient-id="${CSS.escape(patientId)}"]`).forEach((row) => row.toggleAttribute('aria-busy', busy));
  };

  async function waitForNativeOpen(timeoutMs = 4000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (typeof window.SpireOpenPatient === 'function') return window.SpireOpenPatient;
      await sleep(40);
    }
    return null;
  }

  async function selectTab(tab, patientId) {
    tab = String(tab || '').trim();
    if (!tab) return true;
    const started = Date.now();
    while (Date.now() - started < 3000) {
      const button = document.querySelector(`[data-chart-tab="${CSS.escape(tab)}"]`);
      if (button) {
        activateChart(patientId);
        if (!button.classList.contains('active')) button.click();
        activateChart(patientId);
        return true;
      }
      await sleep(50);
    }
    return false;
  }

  async function runPatientOpen(patientId, tab = '') {
    const opener = await waitForNativeOpen();
    if (!opener) throw new Error('SPIRE patient chart opener is unavailable');

    await opener(patientId);

    const started = Date.now();
    while (Date.now() - started < 4000) {
      if (activateChart(patientId)) {
        await selectTab(tab, patientId);
        return true;
      }
      await sleep(50);
    }
    return false;
  }

  function requestPatientOpen(patientId, tab = '') {
    patientId = String(patientId || '').trim();
    tab = String(tab || '').trim();
    if (!patientId) return Promise.resolve(false);

    if (chartOpenFor(patientId)) {
      activateChart(patientId);
      return selectTab(tab, patientId).then(() => true);
    }

    if (activeOpen && activePatientId === patientId) {
      return activeOpen.then(async (result) => {
        if (result && tab) await selectTab(tab, patientId);
        return result;
      });
    }

    const begin = async () => {
      if (activeOpen) await activeOpen.catch(() => false);
      if (chartOpenFor(patientId)) {
        activateChart(patientId);
        await selectTab(tab, patientId);
        return true;
      }

      activePatientId = patientId;
      setBusy(patientId, true);
      const flight = runPatientOpen(patientId, tab)
        .catch((error) => {
          console.error('[SPIRE patient open guard]', error);
          return false;
        })
        .finally(() => {
          setBusy(patientId, false);
          if (activeOpen === flight) {
            activeOpen = null;
            activePatientId = '';
          }
        });
      activeOpen = flight;
      return flight;
    };

    return begin();
  }

  function ownPatientClick(event) {
    const row = event.target?.closest?.('[data-patient-id]');
    const patientId = String(row?.dataset?.patientId || '').trim();
    if (!patientId) return;

    // Row interaction has exactly one owner. Startup/deep-link opening remains in
    // the canonical app bootstrap, so the same patient is never opened twice.
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

  async function startFromLocation() {
    const request = requestedFromLocation();
    if (!request.patientId) return false;
    if (chartOpenFor(request.patientId)) {
      activateChart(request.patientId);
      await selectTab(request.tab, request.patientId);
      return true;
    }
    // Compatibility method only. Automatic startup is intentionally disabled so
    // the build-injected canonical deep-link bridge is the sole URL-open owner.
    return false;
  }

  document.addEventListener('click', ownPatientClick, true);
  document.addEventListener('dblclick', suppressPatientDoubleClick, true);
  window.SpirePatientOpenGuard = Object.freeze({
    contract: CONTRACT,
    requestPatientOpen,
    activateChart,
    chartOpenFor,
    startFromLocation,
  });
})();
