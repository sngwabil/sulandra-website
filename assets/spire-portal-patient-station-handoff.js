(() => {
  'use strict';

  // SPIRE_PORTAL_CLIENT_STATION_HANDOFF_V2
  // Compatibility only: /spire.html now enters Client Station directly. If an
  // old bookmark or workflow still reaches the portal and selects a home, hand
  // off to the same canonical Client Station instead of the retired station.
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  let navigating = false;

  function currentContext() {
    const params = new URLSearchParams(location.search);
    return {
      step: String(params.get('step') || '').toLowerCase(),
      companyId: String(params.get('company') || sessionStorage.getItem(HOME_ENTITY_KEY) || localStorage.getItem(HOME_ENTITY_KEY) || sessionStorage.getItem(ENTITY_KEY) || localStorage.getItem(ENTITY_KEY) || '').trim(),
      homeId: String(params.get('home') || params.get('spireHome') || sessionStorage.getItem(HOME_ID_KEY) || localStorage.getItem(HOME_ID_KEY) || '').trim(),
    };
  }

  function stationUrl(companyId, homeId) {
    const query = new URLSearchParams({ company: companyId, spireHome: homeId });
    return `/spire/client-station.html?${query}`;
  }

  function goIfReady() {
    if (navigating) return true;
    const context = currentContext();
    if (!context.companyId || !context.homeId) return false;

    const clientPanel = document.getElementById('patientPanel'); // legacy portal DOM id
    const explicitClientStep = context.step === 'clients' || context.step === 'client' || context.step === 'patient' || context.step === 'patients';
    const portalAdvancedToClients = clientPanel && clientPanel.hidden === false;
    if (!explicitClientStep && !portalAdvancedToClients) return false;

    sessionStorage.setItem(HOME_ID_KEY, context.homeId);
    localStorage.setItem(HOME_ID_KEY, context.homeId);
    sessionStorage.setItem(HOME_ENTITY_KEY, context.companyId);
    localStorage.setItem(HOME_ENTITY_KEY, context.companyId);
    navigating = true;
    location.replace(stationUrl(context.companyId, context.homeId));
    return true;
  }

  if (goIfReady()) return;

  const observer = new MutationObserver(() => {
    if (goIfReady()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });

  document.addEventListener('click', () => requestAnimationFrame(goIfReady), false);
})();
