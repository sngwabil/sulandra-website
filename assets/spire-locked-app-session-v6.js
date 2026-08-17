(() => {
  'use strict';

  // SPIRE_LOCKED_APP_SESSION_V6
  // Client Station is the single fullscreen owner for a Spire session. The user
  // enters browser fullscreen once from Client Station; patient charts and secure
  // chat then run inside that same top-level shell and do not expose a second
  // fullscreen/minimize control. Return to Portal is the intentional app exit.
  const MARKER = 'SPIRE_LOCKED_APP_SESSION_V6';
  const LOCK_KEY = 'spire:locked-app-session';
  const PORTAL_KEY = 'spire:return-to-portal-url';
  const ROOT = document.documentElement;
  const isClientStation = /\/spire\/client-station\.html$/i.test(location.pathname);
  const isShellChild = window.top !== window && /^\/spire\//i.test(location.pathname);

  function sameOriginUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.href);
      if (url.origin !== location.origin) return '';
      if (/^\/spire\//i.test(url.pathname)) return '';
      return url.pathname + url.search + url.hash;
    } catch { return ''; }
  }

  function capturePortal() {
    const params = new URLSearchParams(location.search);
    const explicit = sameOriginUrl(
      params.get('returnTo') || params.get('return') || params.get('portal') || params.get('from')
    );
    const referrer = sameOriginUrl(document.referrer);
    const stored = sameOriginUrl(sessionStorage.getItem(PORTAL_KEY));
    const destination = explicit || referrer || stored || '/employee-portal.html';
    sessionStorage.setItem(PORTAL_KEY, destination);
    return destination;
  }

  function installStyles() {
    if (document.getElementById('spireLockedAppSessionV6Style')) return;
    const style = document.createElement('style');
    style.id = 'spireLockedAppSessionV6Style';
    style.textContent = `
      html[data-spire-locked-app="true"],
      html[data-spire-locked-app="true"] body{
        width:100%!important;max-width:none!important;
        height:100dvh!important;min-height:100dvh!important;
        margin:0!important;padding:0!important;overflow:hidden!important;
      }
      html[data-spire-locked-app="true"] body[data-spire-client-station] .station,
      html[data-spire-locked-app="true"] body[data-spire-client-station] .workspace,
      html[data-spire-locked-app="true"] body[data-spire-client-station] .main{
        width:100%!important;max-width:none!important;min-width:0!important;
      }
      /* Only embedded Spire workspaces hide fullscreen controls. Client Station
         keeps the one fullscreen button that owns the whole app session. */
      html[data-spire-shell-child="true"] #spireFullscreenControl,
      html[data-spire-shell-child="true"] [data-spire-fullscreen-control],
      html[data-spire-shell-child="true"] #spireResumeFullscreen{
        display:none!important;visibility:hidden!important;pointer-events:none!important;
      }
      body[data-spire-client-station] .client-table tbody td:last-child,
      body[data-spire-client-station] .client-table tbody td:last-child .status-ok{
        color:#39d98a!important;-webkit-text-fill-color:#39d98a!important;font-weight:800!important;
      }
      body[data-spire-client-station] #spireReturnPortal{font-weight:800!important}
    `;
    document.head.appendChild(style);
  }

  // Kept as the single native-fullscreen entry point for the Client Station shell.
  function requestFullscreen() {
    return window.SpireUserPreferences?.requestFullscreen?.({ persist: true });
  }

  function markShellState() {
    installStyles();
    if (isClientStation && window.top === window) {
      capturePortal();
      sessionStorage.setItem(LOCK_KEY, 'true');
      ROOT.dataset.spireLockedApp = 'true';
      ROOT.dataset.spireShellHost = 'true';
      delete ROOT.dataset.spireShellChild;
      return;
    }
    if (isShellChild && sessionStorage.getItem(LOCK_KEY)) {
      ROOT.dataset.spireLockedApp = 'true';
      ROOT.dataset.spireShellChild = 'true';
      document.querySelectorAll('[data-spire-fullscreen-control],#spireFullscreenControl,#spireResumeFullscreen').forEach((node) => node.remove());
    }
  }

  function returnToPortal() {
    const destination = sameOriginUrl(sessionStorage.getItem(PORTAL_KEY)) || '/employee-portal.html';
    sessionStorage.removeItem(LOCK_KEY);
    delete ROOT.dataset.spireLockedApp;
    delete ROOT.dataset.spireShellHost;
    const leave = () => location.assign(destination);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {}).finally(leave);
    } else {
      leave();
    }
  }

  function installReturnButton() {
    if (!isClientStation || window.top !== window || document.getElementById('spireReturnPortal')) return;
    const refresh = document.getElementById('topRefresh');
    if (!refresh) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'top-link';
    button.id = 'spireReturnPortal';
    button.textContent = '↩ Return to Portal';
    button.title = 'Return to the portal that opened Spire';
    button.setAttribute('aria-label', 'Return to Portal');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      returnToPortal();
    });
    refresh.insertAdjacentElement('afterend', button);
  }

  function initialize() {
    markShellState();
    if (isClientStation && window.top === window) installReturnButton();
  }

  window.addEventListener('pageshow', initialize);
  window.addEventListener('resize', () => {
    if (sessionStorage.getItem(LOCK_KEY)) markShellState();
  });
  window.visualViewport?.addEventListener('resize', () => {
    if (sessionStorage.getItem(LOCK_KEY)) markShellState();
  });

  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('#stationLogout')) {
      sessionStorage.removeItem(LOCK_KEY);
    }
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();

  window.SpireLockedAppSessionV6 = Object.freeze({ marker: MARKER, requestFullscreen, returnToPortal });
})();
