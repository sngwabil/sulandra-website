(() => {
  'use strict';
  const CONTRACT='20260811-spire-workspace-observer-suppression-1';
  if(window.__spireWorkspaceObserverSuppression)return;
  const NativeMutationObserver=window.MutationObserver;
  if(!NativeMutationObserver)return;
  window.__spireWorkspaceObserverSuppression={contract:CONTRACT,native:NativeMutationObserver};
  window.MutationObserver=function SuppressedWorkspaceCompletionObserver(){
    document.documentElement.dataset.spireWorkspaceObserverSuppressed=CONTRACT;
    return {observe(){},disconnect(){},takeRecords(){return[];}};
  };
  window.MutationObserver.prototype=NativeMutationObserver.prototype;
})();
