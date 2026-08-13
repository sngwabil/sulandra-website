(() => {
  'use strict';

  // SPIRE_MASTER_EXPLICIT_PATIENT_GATE_V1
  // The master page is chart-only. A patient and service home must have been
  // explicitly selected in /spire/portal.html before this page can start.
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const DEPARTMENT_KEY = 'sulandra:selected-department-id';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_NAME_KEY = 'spire:selected-service-home-name';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  const PATIENT_KEY = 'spire:patientId';

  const params = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const patientId = String(params.get('patientId') || hashParams.get('patient') || '').trim();
  const homeId = String(params.get('spireHome') || params.get('home') || '').trim();
  const companyId = String(params.get('company') || sessionStorage.getItem(HOME_ENTITY_KEY) || sessionStorage.getItem(ENTITY_KEY) || localStorage.getItem(ENTITY_KEY) || '').trim();

  if (companyId) {
    sessionStorage.setItem(ENTITY_KEY, companyId);
    localStorage.setItem(ENTITY_KEY, companyId);
    sessionStorage.removeItem(DEPARTMENT_KEY);
    localStorage.removeItem(DEPARTMENT_KEY);
  }
  if (homeId) sessionStorage.setItem(HOME_ID_KEY, homeId);
  if (patientId) sessionStorage.setItem(PATIENT_KEY, patientId);

  function portalUrl(step = 'companies') {
    const query = new URLSearchParams();
    if (step === 'homes' || step === 'clients') query.set('step', step);
    if (companyId) query.set('company', companyId);
    if (step === 'clients' && homeId) query.set('home', homeId);
    return `/spire/portal.html${query.toString() ? `?${query.toString()}` : ''}`;
  }

  if (!patientId || !homeId) {
    sessionStorage.removeItem(PATIENT_KEY);
    const step = companyId ? (homeId ? 'clients' : 'homes') : 'companies';
    location.replace(portalUrl(step));
    return;
  }

  const previousFetch = window.fetch.bind(window);
  const requestUrl = (input) => typeof input === 'string' ? input : input instanceof URL ? input.href : String(input?.url || '');
  const spireRequest = (url) => {
    try {
      const parsed = new URL(url, location.origin);
      return parsed.pathname.startsWith('/api/spire/');
    } catch {
      return false;
    }
  };

  // Home scope is attached to every SPIRE request. The existing entity-context
  // fetch wrapper remains underneath this wrapper and continues to attach the
  // selected company and bearer token.
  window.fetch = async (input, init = {}) => {
    const url = requestUrl(input);
    if (!spireRequest(url)) return previousFetch(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    headers.set('x-spire-home-id', homeId);
    return previousFetch(input, { ...init, headers });
  };

  function pendingDrafts() {
    try {
      return window.SpireMasterFlowsheetGrid?.hasPending?.() === true;
    } catch {
      return false;
    }
  }

  function confirmLeaveWithDrafts() {
    if (!pendingDrafts()) return true;
    return confirm('You have unfiled Flowsheet documentation. Leaving this chart will keep the drafts in this browser, but nothing has been filed to the clinical record yet. Continue?');
  }

  function go(step) {
    if (!confirmLeaveWithDrafts()) return;
    sessionStorage.removeItem(PATIENT_KEY);
    location.assign(portalUrl(step));
  }

  function installChartNavigation() {
    const toolbar = document.getElementById('spireToolbar');
    if (!toolbar || toolbar.dataset.portalNavigation === 'true') return;
    toolbar.dataset.portalNavigation = 'true';

    const buttons = [...toolbar.querySelectorAll('.tool-btn')];
    const homeButton = buttons.find((button) => /\bhome\b/i.test(button.textContent || ''));
    const clientListButton = buttons.find((button) => /client lists?/i.test(button.textContent || ''));
    const stationButton = buttons.find((button) => /client station/i.test(button.textContent || ''));

    if (homeButton) {
      homeButton.textContent = '🏥 SPIRE Portal';
      homeButton.dataset.spirePortalRoute = 'companies';
      homeButton.title = 'Return to SPIRE company selection';
    }
    if (clientListButton) {
      clientListButton.textContent = '👥 My Clients';
      clientListButton.dataset.spirePortalRoute = 'clients';
      clientListButton.title = 'Return to the client list for this service home';
    }
    if (stationButton) {
      stationButton.textContent = '🩺 Patient Station';
      stationButton.dataset.spirePortalRoute = 'clients';
      stationButton.title = 'Return to Patient Station for this service home';
    }

    if (!document.getElementById('spireHomesNavBtn')) {
      const homes = document.createElement('button');
      homes.type = 'button';
      homes.id = 'spireHomesNavBtn';
      homes.className = 'tool-btn';
      homes.textContent = '🏘️ Homes';
      homes.dataset.spirePortalRoute = 'homes';
      homes.title = 'Select a different service home';
      if (stationButton) stationButton.insertAdjacentElement('afterend', homes);
      else toolbar.prepend(homes);
    }

    const companyName = sessionStorage.getItem(HOME_ENTITY_KEY) || companyId;
    const selectedHomeName = sessionStorage.getItem(HOME_NAME_KEY) || '';
    const title = document.getElementById('topBarTimestampDisplay');
    if (title && selectedHomeName && !title.textContent.includes(selectedHomeName)) {
      title.title = `Selected service home: ${selectedHomeName}${companyName ? ` · Company ${companyName}` : ''}`;
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-spire-portal-route]') : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    go(target.dataset.spirePortalRoute || 'companies');
  }, true);

  window.addEventListener('beforeunload', (event) => {
    if (!pendingDrafts()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.SpirePortalNavigation = Object.freeze({
    patientId,
    homeId,
    companyId,
    portalUrl,
    goCompanies: () => go('companies'),
    goHomes: () => go('homes'),
    goClients: () => go('clients'),
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installChartNavigation, { once: true });
  else installChartNavigation();
})();
