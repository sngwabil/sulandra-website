(() => {
  'use strict';

  const COMPACT_KEY = 'spire:compact-mode';
  const FIT_KEY = 'spire:fit-mode';
  const WORKSPACE_LOOP_GUARD = '20260811-spire-workspace-loop-guard-1';

  // spire-workspace-completion.js has a document-wide child-list observer whose
  // fallback pass reapplies chart-tab order with appendChild() for every existing
  // tab. Once .chart-tabs exists, those moves create the next child-list mutation,
  // which schedules another reorder indefinitely and can make Chromium unresponsive.
  // The module already has direct click/custom-event hooks for the workspaces it
  // owns, so disable only that unsafe fallback observer before the module loads.
  const NativeMutationObserver = window.MutationObserver;
  if (NativeMutationObserver && !window.__spireWorkspaceLoopGuard) {
    const blockedCreator = /(?:^|\/)spire-workspace-completion\.js(?:\?|:|$)/i;
    function GuardedMutationObserver(callback) {
      const stack = String(new Error().stack || '');
      if (blockedCreator.test(stack)) {
        document.documentElement.dataset.spireWorkspaceLoopGuard = WORKSPACE_LOOP_GUARD;
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
    window.__spireWorkspaceLoopGuard = WORKSPACE_LOOP_GUARD;
  }

  const setPressed = (button, value) => button?.setAttribute('aria-pressed', value ? 'true' : 'false');
  const applyCompact = (value) => {
    document.body.classList.toggle('spire-compact-mode', value);
    sessionStorage.setItem(COMPACT_KEY, value ? '1' : '0');
    setPressed(document.getElementById('spireCompactControl'), value);
  };
  const applyFit = (value) => {
    document.body.classList.toggle('spire-fit-mode', value);
    sessionStorage.setItem(FIT_KEY, value ? '1' : '0');
    setPressed(document.getElementById('spireFitControl'), value);
  };

  async function toggleFullscreen() {
    const button = document.getElementById('spireFullscreenControl');
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      } else {
        await document.exitFullscreen();
      }
    } catch {
      button?.setAttribute('title', 'Full screen is unavailable in this browser window');
    }
  }

  function syncFullscreenButton() {
    const button = document.getElementById('spireFullscreenControl');
    if (!button) return;
    const active = Boolean(document.fullscreenElement);
    button.textContent = active ? '🗗' : '⛶';
    button.setAttribute('aria-label', active ? 'Exit full screen' : 'Open SPIRE full screen');
    button.setAttribute('title', active ? 'Exit full screen' : 'Full screen');
    setPressed(button, active);
  }

  function fitToScreen() {
    applyCompact(false);
    applyFit(true);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.querySelector('.spire-main')?.scrollTo({ left: 0, behavior: 'smooth' });
  }

  function install() {
    const host = document.querySelector('.spire-top-actions');
    if (!host || document.getElementById('spireWindowControls')) return false;

    const controls = document.createElement('span');
    controls.id = 'spireWindowControls';
    controls.className = 'spire-window-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'SPIRE screen controls');
    controls.innerHTML = `
      <button type="button" id="spireCompactControl" class="spire-window-control" aria-label="Minimize side panels" title="Minimize side panels" aria-pressed="false">−</button>
      <button type="button" id="spireFitControl" class="spire-window-control" aria-label="Fit SPIRE to screen" title="Fit / restore to screen" aria-pressed="false">□</button>
      <button type="button" id="spireFullscreenControl" class="spire-window-control" aria-label="Open SPIRE full screen" title="Full screen" aria-pressed="false">⛶</button>`;

    host.prepend(controls);
    document.getElementById('spireCompactControl')?.addEventListener('click', () => {
      applyFit(false);
      applyCompact(!document.body.classList.contains('spire-compact-mode'));
    });
    document.getElementById('spireFitControl')?.addEventListener('click', fitToScreen);
    document.getElementById('spireFullscreenControl')?.addEventListener('click', toggleFullscreen);

    applyCompact(sessionStorage.getItem(COMPACT_KEY) === '1');
    applyFit(sessionStorage.getItem(FIT_KEY) !== '0');
    syncFullscreenButton();
    return true;
  }

  document.addEventListener('fullscreenchange', syncFullscreenButton);
  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
