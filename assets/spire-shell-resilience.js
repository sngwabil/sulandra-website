(() => {
  'use strict';

  const CONTRACT = '20260810-spire-shell-resilience-1';
  const APP_GENERATION = '20260810-business-uat-7';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let fallbackLoad = null;
  let recoveryRunning = false;

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
      if (node === chart) node.classList.add('active');
      else node.classList.remove('active');
    });
    if (patientId) {
      sessionStorage.setItem('spire:patientId', String(patientId));
      document.body.dataset.spireChartReady = 'true';
      document.body.dataset.spireChartPatientId = String(patientId);
    }
    document.body.dataset.spireShellResilience = CONTRACT;
    return true;
  }

  async function loadFallbackApp() {
    if (typeof window.SpireOpenPatient === 'function' && shellReady()) return true;
    if (fallbackLoad) return fallbackLoad;
    fallbackLoad = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = `/assets/spire-app-v2.js?v=${APP_GENERATION}&shellRecovery=${CONTRACT}`;
      script.dataset.spireShellRecovery = CONTRACT;
      script.async = false;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
    return fallbackLoad;
  }

  async function ensureShell() {
    if (shellReady() && typeof window.SpireOpenPatient === 'function') return true;

    // Give the canonical synchronous application script and DOMContentLoaded handler
    // a short opportunity to initialize before attempting a cache-busting recovery load.
    const firstWait = Date.now();
    while (Date.now() - firstWait < 900) {
      if (shellReady() && typeof window.SpireOpenPatient === 'function') return true;
      await sleep(60);
    }

    if (typeof window.SpireOpenPatient === 'function' && !shellReady()) {
      // Re-fire initialization for a script that loaded successfully but missed its
      // original DOMContentLoaded boundary. The canonical installer is idempotent
      // because it replaces only the #spireApp shell.
      document.dispatchEvent(new Event('DOMContentLoaded'));
      const retryWait = Date.now();
      while (Date.now() - retryWait < 900) {
        if (shellReady()) return true;
        await sleep(60);
      }
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
        if (!button.classList.contains('active')) button.click();
        return;
      }
      await sleep(80);
    }
  }

  async function recover(patientId, tab = '') {
    patientId = String(patientId || '').trim();
    if (recoveryRunning) {
      const wait = Date.now();
      while (Date.now() - wait < 7000) {
        if (activateChart(patientId)) {
          await selectTab(tab);
          return true;
        }
        await sleep(100);
      }
      return false;
    }

    recoveryRunning = true;
    try {
      if (!(await ensureShell())) return false;
      if (!patientId) return true;

      if (!chartReady()) {
        try { await window.SpireOpenPatient(patientId); } catch (error) { console.error('[SPIRE shell resilience open]', error); }
      }

      const started = Date.now();
      while (Date.now() - started < 8000) {
        if (activateChart(patientId)) {
          await selectTab(tab);
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
    setTimeout(() => recover(patientId).catch(() => {}), 0);
  }, true);

  async function start() {
    const request = requestFromLocation();
    await recover(request.patientId, request.tab);
  }

  window.SpireShellResilience = Object.freeze({ contract: CONTRACT, recover, ensureShell, activateChart });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start().catch(() => {}), { once: true });
  else start().catch(() => {});
})();
