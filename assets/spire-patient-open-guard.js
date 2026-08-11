(() => {
  'use strict';

  const CONTRACT = '20260811-spire-patient-open-guard-5';
  let activePatientId = '';
  let activeOpen = null;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Retired compatibility observers are blocked outright. Every other observer
  // is wrapped with a per-observer runaway breaker: normal mutation observers are
  // unaffected, but a callback that retriggers itself more than 40 times inside
  // 500 ms is disconnected before it can lock the Chromium renderer. The creator
  // stack is recorded on <html> so regression tests can identify the exact module.
  const NativeMutationObserver = window.MutationObserver;
  if (NativeMutationObserver && !window.__spireObserverSafetyInstalled) {
    const retiredObserverPattern = /spire-(?:canonical-bootstrap|shell-resilience|chart-ready|chart-recovery-v1)\.js/i;
    let observerSequence = 0;
    function GuardedMutationObserver(callback) {
      const createdStack = String(new Error().stack || '');
      const observerId = ++observerSequence;
      if (retiredObserverPattern.test(createdStack)) {
        document.documentElement.dataset.spireUnsafeObserverQuarantined = CONTRACT;
        return {
          observe() {},
          disconnect() {},
          takeRecords() { return []; },
        };
      }

      let nativeObserver;
      let windowStarted = performance.now();
      let callbackCount = 0;
      let tripped = false;
      const wrapped = (records, observer) => {
        if (tripped) return;
        const now = performance.now();
        if (now - windowStarted > 500) {
          windowStarted = now;
          callbackCount = 0;
        }
        callbackCount += 1;
        if (callbackCount > 40) {
          tripped = true;
          try { nativeObserver?.disconnect(); } catch {}
          const source = createdStack.split('\n').find((line) => /\/assets\/spire-[^\s)]+\.js/i.test(line)) || createdStack.split('\n')[1] || 'unknown';
          document.documentElement.dataset.spireObserverCircuitBreaker = `${observerId}:${source.trim()}`.slice(0, 500);
          console.error('[SPIRE observer circuit breaker] disconnected runaway observer', { observerId, source, createdStack });
          return;
        }
        return callback(records, observer);
      };
      nativeObserver = new NativeMutationObserver(wrapped);
      return nativeObserver;
    }
    GuardedMutationObserver.prototype = NativeMutationObserver.prototype;
    window.MutationObserver = GuardedMutationObserver;
    window.__spireObserverSafetyInstalled = CONTRACT;
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
