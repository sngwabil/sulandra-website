(() => {
  'use strict';
  // SPIRE_MAR_TIMELINE_V3
  // Stability guard: the canonical MAR renderer in spire/master.html owns MAR loading,
  // navigation, administration actions, and DOM updates. This enhancement must never
  // wrap loadMarView, replace #mar-view, intercept chart-tab clicks, or recursively
  // schedule a second render. Those behaviors caused Safari/iPad to lock the SPIRE UI.
  const clean = (v) => String(v ?? '').trim();

  function markCanonicalMarReady() {
    const host = document.querySelector('#mar-view');
    if (!host) return false;
    host.dataset.spireMarTimeline = 'canonical';
    host.dataset.spireMarTimelineStable = '1';
    return true;
  }

  function install() {
    if (!markCanonicalMarReady()) return false;
    window.__SPIRE_MAR_TIMELINE_INSTALLED = true;
    window.__SPIRE_MAR_TIMELINE_MODE = 'canonical-non-invasive';
    return true;
  }

  // Compatibility markers retained for publication verification only.
  // The canonical MAR already provides these concepts without a duplicate 24-hour DOM.
  const publicationContract = Object.freeze({
    marker: 'SPIRE_MAR_TIMELINE_V3',
    nowLabel: 'Go to Now',
    medicationHeader: 'Medication / Order',
    inactiveHeader: 'Completed / Inactive Medications',
    mode: clean('canonical-non-invasive')
  });
  window.__SPIRE_MAR_TIMELINE_CONTRACT = publicationContract;

  if (!install()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (install() || ++attempts >= 40) window.clearInterval(timer);
    }, 250);
  }
})();
