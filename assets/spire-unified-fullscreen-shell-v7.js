(() => {
  'use strict';

  // SPIRE_UNIFIED_FULLSCREEN_SHELL_V7
  // Client Station remains the single top-level Spire document. Chart and Secure
  // Chat routes open inside this shell so native browser fullscreen is preserved
  // across patient navigation instead of feeling like separate websites.
  const MARKER = 'SPIRE_UNIFIED_FULLSCREEN_SHELL_V7';
  if (window.SpireClientStationShell?.marker === MARKER) return;

  const CLIENT_KEY = 'spire:patientId';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const FRAME_ID = 'spireFullscreenRouteFrame';
  const isStation = /\/spire\/client-station\.html$/i.test(location.pathname) && window.top === window;
  if (!isStation) return;

  const clean = (value) => String(value ?? '').trim();
  const stored = (key) => clean(sessionStorage.getItem(key) || localStorage.getItem(key));

  function currentContext(patientId) {
    const params = new URLSearchParams(location.search);
    const home = clean(params.get('spireHome') || params.get('home') || stored(HOME_ID_KEY));
    const company = clean(params.get('company') || stored(HOME_ENTITY_KEY) || stored(ENTITY_KEY));
    const query = new URLSearchParams();
    if (patientId) query.set('patientId', patientId);
    if (home) query.set('spireHome', home);
    if (company) query.set('company', company);
    return query;
  }

  function selectedClientId(target) {
    const row = target instanceof Element ? target.closest('.client-row[data-client-id]') : null;
    return clean(row?.dataset?.clientId || document.querySelector('.client-row.selected[data-client-id]')?.dataset?.clientId || sessionStorage.getItem(CLIENT_KEY));
  }

  function closeSpireWorkspace() {
    const frame = document.getElementById(FRAME_ID);
    if (frame) frame.remove();
    document.documentElement.removeAttribute('data-spire-workspace-open');
    window.SpireUserPreferences?.syncFullscreenButtons?.();
  }

  function fullscreenHost() {
    const active = document.fullscreenElement;
    return active && active.contains(document.body) ? active : document.body;
  }

  function wireChild(frame) {
    try {
      const childWindow = frame.contentWindow;
      const childDocument = frame.contentDocument;
      if (!childWindow || !childDocument) return;

      const childPath = childWindow.location.pathname || '';
      if (/\/spire\/client-station\.html$/i.test(childPath)) {
        closeSpireWorkspace();
        return;
      }

      childDocument.documentElement.dataset.spireShellChild = 'true';
      childDocument.addEventListener('click', (event) => {
        const control = event.target instanceof Element ? event.target.closest('a,button,[role="button"]') : null;
        if (!control) return;
        const href = control instanceof HTMLAnchorElement ? control.getAttribute('href') || '' : '';
        const label = clean(control.textContent).toLowerCase();
        if (/\/spire\/client-station\.html/i.test(href) || label === 'client station' || label.includes('client station')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeSpireWorkspace();
        }
      }, true);
    } catch {
      // Same-origin is expected; a transient navigation state should not break shell ownership.
    }
  }

  function getSpireWorkspaceFrame() {
    let frame = document.getElementById(FRAME_ID);
    if (frame) return frame;

    frame = document.createElement('iframe');
    frame.id = FRAME_ID;
    frame.name = 'spireWorkspaceFrame';
    frame.title = 'Spire clinical workspace';
    frame.allowFullscreen = true;
    frame.setAttribute('allow', 'fullscreen');
    frame.setAttribute('referrerpolicy', 'same-origin');
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;margin:0;padding:0;background:#081427;z-index:2147483000';
    frame.addEventListener('load', () => wireChild(frame));
    fullscreenHost().appendChild(frame);
    document.documentElement.dataset.spireWorkspaceOpen = 'true';
    return frame;
  }

  function route(kind, patientId) {
    const id = clean(patientId);
    if (!id) return false;
    sessionStorage.setItem(CLIENT_KEY, id);
    const query = currentContext(id);
    const frame = getSpireWorkspaceFrame();
    frame.src = kind === 'chat' ? `/spire/secure-chat.html?${query}` : `/spire/master.html?${query}`;
    return true;
  }

  function classifyInteraction(event) {
    if (!(event.target instanceof Element)) return null;
    const target = event.target;
    const row = target.closest('.client-row[data-client-id]');

    if (event.type === 'dblclick' && row) return { kind: 'chart', patientId: clean(row.dataset.clientId) };
    if (event.type === 'keydown' && event.key === 'Enter' && row) return { kind: 'chart', patientId: clean(row.dataset.clientId) };
    if (event.type !== 'click') return null;

    const chartControl = target.closest('#openSelected,[data-preview-open]');
    if (chartControl) return { kind: 'chart', patientId: selectedClientId(target) };

    const chatControl = target.closest('#openSecureChat,#writeHandoff,#topSecureChat,[data-preview-chat]');
    if (chatControl) return { kind: 'chat', patientId: selectedClientId(target) };

    return null;
  }

  function interceptNavigation(event) {
    const routeInfo = classifyInteraction(event);
    if (!routeInfo?.patientId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    route(routeInfo.kind, routeInfo.patientId);
  }

  document.addEventListener('dblclick', interceptNavigation, true);
  document.addEventListener('click', interceptNavigation, true);
  document.addEventListener('keydown', interceptNavigation, true);

  document.addEventListener('fullscreenchange', () => {
    const frame = document.getElementById(FRAME_ID);
    if (!frame) return;
    const host = fullscreenHost();
    if (frame.parentElement !== host) host.appendChild(frame);
  });

  window.SpireClientStationShell = Object.freeze({
    marker: MARKER,
    openChart: (patientId) => route('chart', patientId),
    openChat: (patientId) => route('chat', patientId),
    close: closeSpireWorkspace,
    active: () => Boolean(document.getElementById(FRAME_ID))
  });
})();
