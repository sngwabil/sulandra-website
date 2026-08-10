(() => {
  'use strict';

  const CONTRACT = '20260810-spire-shell-resilience-3';
  const APP_GENERATION = '20260810-business-uat-7';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let fallbackLoad = null;
  let recoveryRunning = false;
  let requestedPatientId = '';
  let requestedTab = '';

  function requestFromLocation() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return {
      patientId: query.get('patientId') || query.get('patient') || hash.get('patientId') || hash.get('patient') || '',
      tab: query.get('tab') || hash.get('tab') || '',
    };
  }

  function shellReady() {
    return Boolean(
      document.getElementById('spireApp') &&
      document.getElementById('spirePatientStrip') &&
      document.getElementById('spireChartWorkspace')
    );
  }

  function chartReady() {
    const strip = document.getElementById('spirePatientStrip');
    const chart = document.getElementById('spireChartWorkspace');
    return Boolean(strip && chart && !strip.hidden && chart.querySelector('[data-chart-tab]'));
  }

  function activateChart(patientId) {
    const strip = document.getElementById('spirePatientStrip');
    const chart = document.getElementById('spireChartWorkspace');
    if (!strip || !chart || strip.hidden || !chart.querySelector('[data-chart-tab]')) return false;
    document.querySelectorAll('.spire-workspace').forEach((node) => {
      if (node === chart) {
        if (!node.classList.contains('active')) node.classList.add('active');
      } else if (node.classList.contains('active')) {
        node.classList.remove('active');
      }
    });
    document.querySelectorAll('.spire-global-nav [data-workspace].active').forEach((node) => node.classList.remove('active'));
    if (patientId) {
      sessionStorage.setItem('spire:patientId', String(patientId));
      document.body.dataset.spireChartReady = 'true';
      document.body.dataset.spireChartPatientId = String(patientId);
    }
    document.body.dataset.spireShellResilience = CONTRACT;
    return chart.classList.contains('active');
  }

  async function loadFallbackApp({ allowRuntimeRepair = false } = {}) {
    // NON_DESTRUCTIVE_SHELL_RECOVERY: never reload the application while a
    // genuine shell/chart is present. A duplicate runtime can erase an open chart.
    if (typeof window.SpireOpenPatient === 'function' && !allowRuntimeRepair) return shellReady();
    if (allowRuntimeRepair && (shellReady() || chartReady())) return true;
    if (fallbackLoad) return fallbackLoad;
    fallbackLoad = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = `/assets/spire-app-v2.js?v=${APP_GENERATION}&shellRecovery=${CONTRACT}`;
      script.dataset.spireShellRecovery = CONTRACT;
      script.dataset.spireSafeRuntimeRepair = allowRuntimeRepair ? 'true' : 'false';
      script.async = false;
      script.onload = () => resolve(shellReady() && typeof window.SpireOpenPatient === 'function');
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
    return fallbackLoad;
  }

  async function ensureShell() {
    if (shellReady() && typeof window.SpireOpenPatient === 'function') return true;

    // Give the canonical synchronous application script and its normal
    // DOMContentLoaded handler time to initialize. Do not redispatch
    // DOMContentLoaded; doing so can invoke application initializers twice.
    const firstWait = Date.now();
    while (Date.now() - firstWait < 2500) {
      if (shellReady() && typeof window.SpireOpenPatient === 'function') return true;
      await sleep(60);
    }

    // SAFE_RUNTIME_REPAIR: if the canonical runtime exists but the shell itself
    // is genuinely absent, one guarded reload is safe because there is no chart
    // DOM to preserve. This repairs missed/erased shell initialization without
    // racing or rebuilding an already-open patient chart.
    if (typeof window.SpireOpenPatient === 'function') {
      const runtimeWait = Date.now();
      while (Date.now() - runtimeWait < 1800) {
        if (shellReady()) return true;
        await sleep(80);
      }
      if (!shellReady() && !chartReady()) {
        await loadFallbackApp({ allowRuntimeRepair: true });
        const repairWait = Date.now();
        while (Date.now() - repairWait < 3000) {
          if (shellReady() && typeof window.SpireOpenPatient === 'function') return true;
          await sleep(80);
        }
      }
      return shellReady();
    }

    await loadFallbackApp();
    const fallbackWait = Date.now();
    while (Date.now() - fallbackWait < 2500) {
      if (shellReady() && typeof window.SpireOpenPatient === 'function') return true;
      await sleep(80);
    }
    return false;
  }

  async function selectTab(tab) {
    if (!tab) return;
    const started = Date.now();
    while (Date.now() - started < 5000) {
      const button = document.querySelector(`[data-chart-tab="${CSS.escape(tab)}"]`);
      if (button) {
        activateChart(requestedPatientId);
        if (!button.classList.contains('active')) button.click();
        return;
      }
      await sleep(80);
    }
  }

  async function recover(patientId, tab = '') {
    patientId = String(patientId || requestedPatientId || '').trim();
    requestedPatientId = patientId || requestedPatientId;
    requestedTab = tab || requestedTab || '';

    if (recoveryRunning) {
      const wait = Date.now();
      while (Date.now() - wait < 7000) {
        if (activateChart(requestedPatientId)) {
          await selectTab(requestedTab);
          return true;
        }
        await sleep(100);
      }
      return false;
    }

    recoveryRunning = true;
    try {
      if (!(await ensureShell())) return false;
      if (!requestedPatientId) return true;

      if (!chartReady()) {
        try { await window.SpireOpenPatient(requestedPatientId); } catch (error) { console.error('[SPIRE shell resilience open]', error); }
      }

      const started = Date.now();
      while (Date.now() - started < 8000) {
        if (activateChart(requestedPatientId)) {
          await selectTab(requestedTab);
          return true;
        }
        await sleep(100);
      }
      return false;
    } finally {
      recoveryRunning = false;
    }
  }

  document.addEventListener('click', (event) => {
    const row = event.target.closest?.('[data-patient-id]');
    const patientId = row?.dataset?.patientId || '';
    if (!patientId) return;
    requestedPatientId = patientId;
    requestedTab = '';
    setTimeout(() => recover(patientId).catch(() => {}), 0);
  }, true);

  // PRESERVE_ACTIVE_PATIENT_CHART: if another workspace transition races with
  // a completed patient open, restore the visible chart rather than rebuilding
  // the shell or application runtime.
  const observer = new MutationObserver(() => {
    if (!requestedPatientId || !chartReady()) return;
    activateChart(requestedPatientId);
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden'],
  });

  async function start() {
    const request = requestFromLocation();
    requestedPatientId = request.patientId || requestedPatientId;
    requestedTab = request.tab || requestedTab;
    await recover(requestedPatientId, requestedTab);
  }

  window.SpireShellResilience = Object.freeze({ contract: CONTRACT, recover, ensureShell, activateChart });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start().catch(() => {}), { once: true });
  else start().catch(() => {});
})();
