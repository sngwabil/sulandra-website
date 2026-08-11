(() => {
  'use strict';

  const CONTRACT = '20260811-spire-workspace-loop-guard-1';
  const NativeMutationObserver = window.MutationObserver;
  if (!NativeMutationObserver || window.__spireWorkspaceLoopGuard) return;

  // spire-workspace-completion.js historically observes every child-list change,
  // then reapplies the saved chart-tab layout by appendChild()-ing every existing
  // chart tab. Moving those existing children creates new child-list mutations,
  // which schedules the same layout pass again indefinitely once a chart opens.
  // The module already has direct click/event hooks for the workspaces it owns, so
  // its document-wide fallback observer is unnecessary and unsafe. Block only that
  // observer; every other SPIRE MutationObserver continues to use the native API.
  const blockedCreator = /(?:^|\/)spire-workspace-completion\.js(?:\?|:|$)/i;

  function GuardedMutationObserver(callback) {
    const stack = String(new Error().stack || '');
    if (blockedCreator.test(stack)) {
      document.documentElement.dataset.spireWorkspaceLoopGuard = CONTRACT;
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
  window.__spireWorkspaceLoopGuard = CONTRACT;
})();
