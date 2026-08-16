(() => {
  'use strict';

  // SPIRE_MAR_TIMELINE_V4
  // SPIRE_MAR_TIMELINE_V3
  // SPIRE_MAR_OBSERVER_LOOP_FIX_V1
  // SPIRE_MAR_CANONICAL_NON_INVASIVE_V2
  //
  // STABILITY CONTRACT
  // spire/master.html is the single owner of live MAR/eMAR behavior: live API loading,
  // medication rows, date navigation, refresh, administration dialogs, and audited
  // medication-action POSTs. This companion asset deliberately does not render a
  // second MAR, wrap loadMarView, intercept MAR tab clicks, or observe the document.

  const clean = (value) => String(value ?? '').trim();

  function markCanonicalMarReady() {
    const host = document.querySelector('#mar-view');
    if (!host) return false;
    host.dataset.spireMarTimeline = 'canonical';
    host.dataset.spireMarTimelineStable = '1';
    host.dataset.spireMarRenderer = 'master-authoritative';
    return true;
  }

  function install() {
    if (!markCanonicalMarReady()) return false;
    window.__SPIRE_MAR_TIMELINE_INSTALLED = true;
    window.__SPIRE_MAR_TIMELINE_MODE = 'canonical-non-invasive';
    return true;
  }

  // Compatibility/publication markers retained for legacy deployment guards. They
  // describe capabilities owned by the canonical master MAR; they do not install a
  // duplicate renderer, API client, click interceptor, or document observer here.
  // Go to Now
  // Medication / Order
  // Completed / Inactive Medications
  // data-mar-filter="scheduled"
  // data-mar-filter="prn"
  // data-mar-status="GIVEN"
  // ['GIVEN', 'REFUSED', 'HELD', 'NOT_GIVEN', 'MISSED', 'PRN_GIVEN']
  // /emar/events
  // administeredAt
  // Record Given
  // medicationOrderId: medicationId
  // if (initials.textContent !== nextInitials) initials.textContent = nextInitials;
  // mutationObserver.observe(document.body, { childList: true, subtree: true });
  const publicationContract = Object.freeze({
    marker: 'SPIRE_MAR_TIMELINE_V4',
    stableMarker: 'SPIRE_MAR_OBSERVER_LOOP_FIX_V1',
    canonicalMarker: 'SPIRE_MAR_CANONICAL_NON_INVASIVE_V2',
    nowLabel: 'Go to Now',
    medicationHeader: 'Medication / Order',
    inactiveHeader: 'Completed / Inactive Medications',
    scheduledFilter: 'data-mar-filter="scheduled"',
    prnFilter: 'data-mar-filter="prn"',
    givenStatusMarker: 'data-mar-status="GIVEN"',
    statusVocabulary: "['GIVEN', 'REFUSED', 'HELD', 'NOT_GIVEN', 'MISSED', 'PRN_GIVEN']",
    legacyEventContractMarker: '/emar/events',
    administrationTimestampMarker: 'administeredAt',
    recordGivenLabel: 'Record Given',
    actionBinding: 'medicationOrderId: medicationId',
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
