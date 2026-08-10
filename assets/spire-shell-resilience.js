(() => {
  'use strict';

  const CONTRACT = '20260810-spire-shell-resilience-4';
  const APP_GENERATION = '20260810-business-uat-8';
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

  async function loadFallbackApp() {
    // NON_DESTRUCTIVE_SHELL_RECOVERY: a fallback application script is allowed
    // only when the canonical application runtime never loaded at all.
    if (typeof window.SpireOpenPatient === 'function' || typeof window.SpireEnsureShell === 'function') return shellReady();
    if (fallbackLoad) return fallbackLoad;
    fallbackLoad = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = `/assets/spire-app-v2.js?v=${APP_GENERATION}&shellRecovery=${CONTRACT}`;
      script.dataset.spireShellRecovery = CONTRACT;
      script.async = false;
      script.onload = () => resolve(shellReady() && typeof window.SpireOpenPatient === 'function');
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
    return fallbackLoad;
  }

  async function ensureShell() {
    if (shellReady() && typeof window.SpireOpenPatient === 'function') return true;

    const firstWait = Date.now();
    while (Date.now() - firstWait < 2500) {
      if (shellReady() && typeof window.SpireOpenPatient === 'function') return true;
      await sleep(60);
    }

    // CANONICAL_SINGLE_RUNTIME_REPAIR: when the runtime exists but its shell is
    // genuinely absent, invoke that exact runtime's exported installShell hook.
    // Never load a second app runtime into the same page.
    if (typeof window.SpireEnsureShell === 'function') {
      const runtimeWait = Date.now();
      while (Date.now() - runtimeWait < 1200) {
        if (shellReady()) return true;
        await sleep(80);
      }
      if (!shellReady() && !chartReady()) {
        try { window.SpireEnsureShell(); } catch (error) { console.error('[SPIRE canonical shell repair]', error); }
        const repairWait = Date.now();
        while (Date.now() - repairWait < 3500) {
          if (shellReady() && typeof window.SpireOpenPatient === 'function') return true;
          await sleep(80);
        }
      }
      return shellReady();
    }

    if (typeof window.SpireOpenPatient === 'function') return shellReady();

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
  // a completed patient open, restore the visible chart without rebuilding it.
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
