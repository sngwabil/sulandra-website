(() => {
  'use strict';

  // SPIRE_MASTER_EXPLICIT_CLIENT_GATE_V2
  // The chart is opened only after an explicit client selection in Client Station.
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const DEPARTMENT_KEY = 'sulandra:selected-department-id';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_NAME_KEY = 'spire:selected-service-home-name';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  const CLIENT_KEY = 'spire:patientId'; // Existing chart/backend contract.

  const params = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const clientId = String(params.get('patientId') || hashParams.get('patient') || '').trim();
  const homeId = String(params.get('spireHome') || params.get('home') || sessionStorage.getItem(HOME_ID_KEY) || localStorage.getItem(HOME_ID_KEY) || '').trim();
  const companyId = String(params.get('company') || sessionStorage.getItem(HOME_ENTITY_KEY) || localStorage.getItem(HOME_ENTITY_KEY) || sessionStorage.getItem(ENTITY_KEY) || localStorage.getItem(ENTITY_KEY) || '').trim();

  if (companyId) {
    sessionStorage.setItem(ENTITY_KEY, companyId);
    localStorage.setItem(ENTITY_KEY, companyId);
    sessionStorage.removeItem(DEPARTMENT_KEY);
    localStorage.removeItem(DEPARTMENT_KEY);
  }
  if (homeId) {
    sessionStorage.setItem(HOME_ID_KEY, homeId);
    localStorage.setItem(HOME_ID_KEY, homeId);
  }
  if (clientId) sessionStorage.setItem(CLIENT_KEY, clientId);

  function clientStationUrl() {
    const query = new URLSearchParams();
    if (companyId) query.set('company', companyId);
    if (homeId) query.set('spireHome', homeId);
    return `/spire/client-station.html${query.toString() ? `?${query}` : ''}`;
  }

  if (!clientId || !homeId) {
    sessionStorage.removeItem(CLIENT_KEY);
    location.replace(clientStationUrl());
    return;
  }

  const previousFetch = window.fetch.bind(window);
  const requestUrl = (input) => typeof input === 'string' ? input : input instanceof URL ? input.href : String(input?.url || '');
  const spireRequest = (url) => {
    try { return new URL(url, location.origin).pathname.startsWith('/api/spire/'); }
    catch { return false; }
  };

  // Every chart API request retains the selected service-home scope.
  window.fetch = async (input, init = {}) => {
    const url = requestUrl(input);
    if (!spireRequest(url)) return previousFetch(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    headers.set('x-spire-home-id', homeId);
    return previousFetch(input, { ...init, headers });
  };

  function pendingDrafts() {
    try { return window.SpireMasterFlowsheetGrid?.hasPending?.() === true; }
    catch { return false; }
  }

  function confirmLeaveWithDrafts() {
    if (!pendingDrafts()) return true;
    return confirm('You have unfiled Flowsheet documentation. Leaving this chart will keep the drafts in this browser, but nothing has been filed to the clinical record yet. Continue?');
  }

  function goClientStation() {
    if (!confirmLeaveWithDrafts()) return;
    sessionStorage.removeItem(CLIENT_KEY);
    location.assign(clientStationUrl());
  }

  function installChartNavigation() {
    const toolbar = document.getElementById('spireToolbar');
    if (!toolbar || toolbar.dataset.clientStationNavigation === 'true') return;
    toolbar.dataset.clientStationNavigation = 'true';

    const buttons = [...toolbar.querySelectorAll('.tool-btn')];
    const homeButton = buttons.find((button) => /\bhome\b/i.test(button.textContent || ''));
    const clientListButton = buttons.find((button) => /client lists?/i.test(button.textContent || ''));
    const stationButton = buttons.find((button) => /patient station|client station/i.test(button.textContent || ''));

    if (homeButton) {
      homeButton.textContent = '🏠 Client Station';
      homeButton.dataset.spireClientStation = 'true';
      homeButton.title = 'Return to Client Station';
    }
    if (clientListButton) {
      clientListButton.textContent = '👥 My Clients';
      clientListButton.dataset.spireClientStation = 'true';
      clientListButton.title = 'Return to the client list for this service home';
    }
    if (stationButton) {
      stationButton.textContent = '👥 Client Station';
      stationButton.dataset.spireClientStation = 'true';
      stationButton.title = 'Return to Client Station';
    }

    if (!document.getElementById('spireHomesNavBtn')) {
      const homes = document.createElement('button');
      homes.type = 'button';
      homes.id = 'spireHomesNavBtn';
      homes.className = 'tool-btn';
      homes.textContent = '🏘️ Homes';
      homes.dataset.spireClientStation = 'true';
      homes.title = 'Switch service homes in Client Station';
      if (stationButton) stationButton.insertAdjacentElement('afterend', homes);
      else toolbar.prepend(homes);
    }

    const selectedHomeName = sessionStorage.getItem(HOME_NAME_KEY) || localStorage.getItem(HOME_NAME_KEY) || '';
    const title = document.getElementById('topBarTimestampDisplay');
    if (title && selectedHomeName && !title.textContent.includes(selectedHomeName)) title.title = `Selected service home: ${selectedHomeName}`;
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-spire-client-station]') : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    goClientStation();
  }, true);

  window.addEventListener('beforeunload', (event) => {
    if (!pendingDrafts()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.SpirePortalNavigation = Object.freeze({
    patientId: clientId,
    clientId,
    homeId,
    companyId,
    clientStationUrl,
    goClients: goClientStation,
    goHomes: goClientStation,
    goCompanies: goClientStation,
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installChartNavigation, { once: true });
  else installChartNavigation();
})();
