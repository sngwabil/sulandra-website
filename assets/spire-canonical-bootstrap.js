(() => {
  'use strict';

  const CONTRACT = '20260810-spire-canonical-bootstrap-3';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let activeRun = null;
  let requestedPatientId = '';
  let requestedTab = '';
  let recoveryTimer = 0;

  function requestFromLocation() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return {
      patientId: query.get('patientId') || query.get('patient') || hash.get('patientId') || hash.get('patient') || '',
      tab: query.get('tab') || hash.get('tab') || '',
    };
  }

  function shellPresent() {
    return Boolean(
      document.getElementById('spireApp') &&
      document.getElementById('spirePatientStrip') &&
      document.getElementById('spireChartWorkspace')
    );
  }

  function chartPresent() {
    const strip = document.getElementById('spirePatientStrip');
    const chart = document.getElementById('spireChartWorkspace');
    return Boolean(strip && chart && !strip.hidden && chart.querySelector('[data-chart-tab]'));
  }

  function forceChartActive(patientId = '') {
    const strip = document.getElementById('spirePatientStrip');
    const chart = document.getElementById('spireChartWorkspace');
    if (!strip || !chart || strip.hidden || !chart.querySelector('[data-chart-tab]')) return false;
    document.querySelectorAll('.spire-workspace').forEach((node) => {
      if (node === chart) node.classList.add('active');
      else node.classList.remove('active');
    });
    document.querySelectorAll('.spire-global-nav [data-workspace].active').forEach((node) => node.classList.remove('active'));
    if (patientId) {
      sessionStorage.setItem('spire:patientId', String(patientId));
      document.body.dataset.spireChartPatientId = String(patientId);
    }
    document.body.dataset.spireChartReady = 'true';
    document.body.dataset.spireCanonicalBootstrap = CONTRACT;
    return chart.classList.contains('active');
  }

  async function ensureShell() {
    if (shellPresent()) return true;
    if (typeof window.SpireEnsureShell === 'function') {
      try { window.SpireEnsureShell(); } catch (error) { console.error('[SPIRE canonical bootstrap shell]', error); }
    }
    const started = Date.now();
    while (Date.now() - started < 5000) {
      if (shellPresent()) return true;
      if (typeof window.SpireEnsureShell === 'function') {
        try { window.SpireEnsureShell(); } catch {}
      }
      await sleep(50);
    }
    return shellPresent();
  }

  async function selectTab(tab, patientId) {
    if (!tab) return true;
    const started = Date.now();
    while (Date.now() - started < 5000) {
      const button = document.querySelector(`[data-chart-tab="${CSS.escape(tab)}"]`);
      if (button) {
        forceChartActive(patientId);
        if (!button.classList.contains('active')) button.click();
        forceChartActive(patientId);
        return true;
      }
      await sleep(60);
    }
    return false;
  }

  async function nativeOpenUntilRendered(patientId) {
    // RETRY_NATIVE_PATIENT_OPEN_AFTER_SHELL_REPAIR: openPatient intentionally
    // catches its own render errors. If the shell is replaced while its API
    // requests are in flight, retry the same canonical patient open after the
    // repaired shell exists instead of treating the swallowed attempt as done.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!(await ensureShell())) continue;
      if (chartPresent()) return true;
      if (typeof window.SpireOpenPatient !== 'function') {
        await sleep(100);
        continue;
      }
      try { await window.SpireOpenPatient(patientId); }
      catch (error) { console.error('[SPIRE canonical bootstrap patient]', error); }
      const probeStarted = Date.now();
      while (Date.now() - probeStarted < 1600) {
        if (forceChartActive(patientId)) return true;
        if (!shellPresent()) break;
        await sleep(80);
      }
    }
    return forceChartActive(patientId);
  }

  async function stabilize(patientId = '', tab = '') {
    patientId = String(patientId || requestedPatientId || '').trim();
    requestedPatientId = patientId || requestedPatientId;
    requestedTab = tab || requestedTab || '';

    if (activeRun) {
      await activeRun.catch(() => false);
      if (forceChartActive(requestedPatientId)) {
        await selectTab(requestedTab, requestedPatientId);
        return true;
      }
    }

    activeRun = (async () => {
      if (!(await ensureShell())) return false;
      if (!requestedPatientId) return true;
      if (!(await nativeOpenUntilRendered(requestedPatientId))) return false;
      forceChartActive(requestedPatientId);
      await selectTab(requestedTab, requestedPatientId);
      forceChartActive(requestedPatientId);
      return true;
    })();

    try { return await activeRun; }
    finally { activeRun = null; }
  }

  function scheduleRecovery() {
    if (!requestedPatientId) return;
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(() => {
      if (chartPresent()) {
        forceChartActive(requestedPatientId);
        return;
      }
      // RECOVER_AFTER_CANONICAL_SHELL_RESET
      stabilize(requestedPatientId, requestedTab).catch(() => {});
    }, 90);
  }

  // DETERMINISTIC_CANONICAL_SHELL_BOOTSTRAP
  if (typeof window.SpireEnsureShell === 'function') {
    try { window.SpireEnsureShell(); } catch {}
  }

  document.addEventListener('click', (event) => {
    const row = event.target.closest?.('[data-patient-id]');
    const patientId = row?.dataset?.patientId || '';
    if (!patientId) return;
    requestedPatientId = patientId;
    requestedTab = '';
    setTimeout(() => stabilize(patientId).catch(() => {}), 0);
  }, true);

  const observer = new MutationObserver(() => {
    if (!requestedPatientId) return;
    if (chartPresent()) {
      forceChartActive(requestedPatientId);
      return;
    }
    scheduleRecovery();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });

  async function start() {
    await ensureShell();
    const request = requestFromLocation();
    requestedPatientId = request.patientId || requestedPatientId;
    requestedTab = request.tab || requestedTab;
    if (requestedPatientId) await stabilize(requestedPatientId, requestedTab);
  }

  window.SpireCanonicalBootstrap = Object.freeze({ contract: CONTRACT, ensureShell, stabilize, forceChartActive });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start().catch(() => {}), { once: true });
  else start().catch(() => {});
})();
