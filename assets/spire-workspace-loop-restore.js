(() => {
  'use strict';
  const guard=window.__spireWorkspaceObserverSuppression;
  if(!guard?.native)return;
  window.MutationObserver=guard.native;
  document.documentElement.dataset.spireWorkspaceObserverRestored=guard.contract||'true';
})();
