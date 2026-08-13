(() => {
  'use strict';

  // SPIRE_PORTAL_PATIENT_STATION_HANDOFF_V1
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  let navigating = false;

  function currentContext() {
    const params = new URLSearchParams(location.search);
    return {
      step: String(params.get('step') || '').toLowerCase(),
      companyId: String(params.get('company') || sessionStorage.getItem(HOME_ENTITY_KEY) || sessionStorage.getItem(ENTITY_KEY) || localStorage.getItem(ENTITY_KEY) || '').trim(),
      homeId: String(params.get('home') || params.get('spireHome') || sessionStorage.getItem(HOME_ID_KEY) || '').trim(),
    };
  }

  function stationUrl(companyId, homeId) {
    const query = new URLSearchParams({ company: companyId, spireHome: homeId });
    return `/spire/patient-station.html?${query}`;
  }

  function goIfReady() {
    if (navigating) return true;
    const context = currentContext();
    if (!context.companyId || !context.homeId) return false;

    const patientPanel = document.getElementById('patientPanel');
    const explicitClientStep = context.step === 'clients' || context.step === 'patient' || context.step === 'patients';
    const portalAdvancedToPatients = patientPanel && patientPanel.hidden === false;
    if (!explicitClientStep && !portalAdvancedToPatients) return false;

    navigating = true;
    location.replace(stationUrl(context.companyId, context.homeId));
    return true;
  }

  if (goIfReady()) return;

  const observer = new MutationObserver(() => {
    if (goIfReady()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });

  document.addEventListener('click', () => {
    requestAnimationFrame(() => goIfReady());
  }, false);
})();
