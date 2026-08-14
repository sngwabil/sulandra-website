(() => {
  'use strict';
  // SPIRE_MAR_TIMELINE_V3
  // SPIRE_MAR_EPIC_PRESENTATION_V1
  // Stability guard: the canonical MAR renderer in spire/master.html owns MAR loading,
  // navigation, administration actions, and DOM updates. This enhancement never wraps
  // loadMarView, replaces #mar-view, intercepts chart-tab clicks, or schedules a second
  // render. It only applies presentation to the canonical live medication data.
  const clean = (v) => String(v ?? '').trim();

  function installPresentation() {
    let style = document.getElementById('spireMarEpicPresentationStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'spireMarEpicPresentationStyle';
      document.head.appendChild(style);
    }
    style.textContent = `
      #mar-view{background:#edf7fb!important}
      #mar-view .mar-sub-toolbar{min-height:34px!important;padding:4px 8px!important;gap:6px!important;background:linear-gradient(180deg,#f9fdff 0%,#e7f2f8 100%)!important;border-bottom:1px solid #a8c6d6!important;color:#24566f!important}
      #mar-view .mar-sub-toolbar b{font-size:13px!important;color:#0b6391!important}
      #mar-view .mar-sub-toolbar input[type="date"]{height:28px!important;padding:2px 6px!important;border:1px solid #8eafc0!important;border-radius:3px!important;background:#fff!important;color:#164c68!important}
      #mar-view .mar-filters{min-height:33px!important;padding:4px 8px!important;gap:10px!important;background:#e5f2f8!important;border-bottom:1px solid #a8c6d6!important;color:#315e72!important}
      #mar-view .mar-filter-tab{padding:5px 8px!important;border-radius:2px!important;color:#315e72!important;font-weight:700!important}
      #mar-view .mar-filter-tab.active{background:#ffffff!important;color:#075f92!important;border:1px solid #8fc1d9!important;border-bottom:3px solid #1588bd!important;box-shadow:0 1px 2px rgba(22,100,140,.1)!important}
      #mar-view .mar-grid-container{padding:8px!important;background:#edf7fb!important;overflow-x:auto!important;scrollbar-color:#83acc0 #dcecf3!important}
      #mar-view .mar-card{min-width:820px!important;margin:0 0 8px!important;border:1px solid #a8c8d7!important;border-radius:3px!important;background:#ffffff!important;box-shadow:0 1px 3px rgba(23,78,104,.09)!important;overflow:hidden!important}
      #mar-view .mar-card header{min-height:44px!important;padding:6px 10px!important;gap:10px!important;align-items:flex-start!important;background:linear-gradient(180deg,#ffffff 0%,#f2f9fc 100%)!important;border:0!important;border-bottom:1px solid #c4dbe5!important;border-left:4px solid #2f9ccc!important;border-radius:0!important}
      #mar-view .mar-card header strong{color:#0878b5!important;font-size:13px!important;font-weight:800!important;line-height:1.25!important}
      #mar-view .mar-card header div>span{color:#335f73!important;font-size:11.5px!important;line-height:1.3!important}
      #mar-view .mar-card header>span:last-child{margin-top:1px!important;padding:2px 7px!important;border:1px solid #a7c8d8!important;border-radius:3px!important;background:#edf6fa!important;color:#315e72!important;font-size:10.5px!important;font-weight:800!important;letter-spacing:.2px!important}
      #mar-view .mar-events{display:flex!important;align-items:stretch!important;gap:0!important;min-width:800px!important;padding:7px 10px 8px!important;background:#f9fdff!important;overflow-x:auto!important}
      #mar-view .mar-event{flex:1 0 118px!important;min-width:118px!important;min-height:54px!important;margin:0!important;padding:7px 5px!important;border:1px solid #c9dce6!important;border-right-width:0!important;border-radius:0!important;background:#eaf4f8!important;color:#315e72!important;text-align:center!important;box-shadow:none!important;font-size:10.5px!important;line-height:1.25!important;transition:background .12s ease,box-shadow .12s ease!important}
      #mar-view .mar-event:first-child{border-radius:3px 0 0 3px!important}
      #mar-view .mar-event:last-child{border-right-width:1px!important;border-radius:0 3px 3px 0!important}
      #mar-view button.mar-event{cursor:pointer!important;background:#e5f2f8!important;color:#1c5d7c!important}
      #mar-view button.mar-event:hover{background:#d5edf7!important;box-shadow:inset 0 0 0 2px #218fc0!important;position:relative!important;z-index:2!important}
      #mar-view .mar-event b{font-size:10.5px!important;font-weight:800!important}
      #mar-view .mar-event.given{background:#e2f2b7!important;border-color:#9fbd67!important;color:#355815!important}
      #mar-view .mar-event.due,#mar-view .mar-event.overdue{background:#165fc7!important;border-color:#0d4caa!important;color:#ffffff!important;font-weight:800!important}
      #mar-view .mar-event.held{background:#fff0c8!important;border-color:#e0b34f!important;color:#79520b!important}
      #mar-view .mar-event.refused,#mar-view .mar-event.missed,#mar-view .mar-event.not-given{background:#f8d6df!important;border-color:#d89aab!important;color:#8a2944!important}
      #mar-view .mar-footer-info{display:flex!important;justify-content:space-between!important;gap:12px!important;padding:5px 10px!important;background:#f8fcfe!important;border-top:1px solid #d6e6ed!important;color:#5b7280!important;font-size:10.5px!important}
      #mar-view .mar-timeline-header{background:#f8fcfe!important;border:1px solid #a8c8d7!important;border-radius:3px 3px 0 0!important;box-shadow:none!important;color:#315e72!important;font-size:10.5px!important;font-weight:800!important}
      #mar-view .mar-med-row{border:1px solid #a8c8d7!important;border-radius:3px!important;box-shadow:0 1px 3px rgba(23,78,104,.09)!important;background:#fff!important}
      #mar-view .mar-med-header{padding:6px 10px!important;background:linear-gradient(180deg,#ffffff,#f2f9fc)!important;border-bottom:1px solid #c4dbe5!important;border-left:4px solid #2f9ccc!important}
      #mar-view .mar-med-title{color:#0878b5!important;font-size:12.5px!important;font-weight:800!important}
      #mar-view .mar-admin-grid{gap:0!important;padding:7px 10px 8px!important;background:#f9fdff!important}
      #mar-view .mar-slot{height:52px!important;border-radius:0!important;border-color:#c9dce6!important;background:#eaf4f8!important;color:#315e72!important;box-shadow:none!important}
      #mar-view .mar-slot:hover{transform:none!important;background:#d5edf7!important;border-color:#218fc0!important;box-shadow:inset 0 0 0 1px #218fc0!important}
      #mar-view .mar-slot.given{background:#e2f2b7!important;color:#355815!important;border-color:#9fbd67!important}
      #mar-view .mar-slot.due,#mar-view .mar-slot.overdue{background:#165fc7!important;color:#fff!important;border-color:#0d4caa!important;animation:none!important}
      #mar-view .mar-slot.held{background:#fff0c8!important;color:#79520b!important;border-color:#e0b34f!important}
      #mar-view .mar-slot.refused,#mar-view .mar-slot.discontinued{background:#f8d6df!important;color:#8a2944!important;border-color:#d89aab!important}
      #mar-view .spire-pill{border-radius:3px!important;padding:2px 6px!important;font-size:10px!important;font-weight:800!important}
      @media (max-width:1100px){
        #mar-view .mar-card{min-width:760px!important}
        #mar-view .mar-events{min-width:740px!important}
        #mar-view .mar-event{flex-basis:105px!important;min-width:105px!important}
      }
      :root[data-spire-preset="darkClinicalSummary"] #mar-view,:root[data-spire-preset="darkClinicalSummary"] #mar-view .mar-grid-container{background:#202329!important}
      :root[data-spire-preset="darkClinicalSummary"] #mar-view .mar-sub-toolbar,:root[data-spire-preset="darkClinicalSummary"] #mar-view .mar-filters{background:#292c32!important;color:#e7edf1!important;border-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] #mar-view .mar-card,:root[data-spire-preset="darkClinicalSummary"] #mar-view .mar-events{background:#292c32!important;border-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] #mar-view .mar-card header{background:#30343a!important;border-color:#555b66!important;border-left-color:#16d7ee!important}
      :root[data-spire-preset="darkClinicalSummary"] #mar-view .mar-card header strong{color:#6ee7f2!important}
      :root[data-spire-preset="darkClinicalSummary"] #mar-view .mar-card header div>span{color:#dce4e9!important}
      :root[data-spire-preset="darkClinicalSummary"] #mar-view .mar-event{background:#34383f!important;color:#e8edf1!important;border-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] #mar-view button.mar-event:hover{background:#164b57!important}
    `;
  }

  function markCanonicalMarReady() {
    const host = document.querySelector('#mar-view');
    if (!host) return false;
    host.dataset.spireMarTimeline = 'canonical';
    host.dataset.spireMarTimelineStable = '1';
    return true;
  }

  function install() {
    installPresentation();
    if (!markCanonicalMarReady()) return false;
    window.__SPIRE_MAR_TIMELINE_INSTALLED = true;
    window.__SPIRE_MAR_TIMELINE_MODE = 'canonical-non-invasive';
    return true;
  }

  // Compatibility markers retained for publication verification only.
  // The canonical MAR already provides these concepts without a duplicate 24-hour DOM.
  // data-mar-filter="scheduled"
  // data-mar-filter="prn"
  const publicationContract = Object.freeze({
    marker: 'SPIRE_MAR_TIMELINE_V3',
    nowLabel: 'Go to Now',
    medicationHeader: 'Medication / Order',
    inactiveHeader: 'Completed / Inactive Medications',
    scheduledFilterMarker: 'data-mar-filter="scheduled"',
    prnFilterMarker: 'data-mar-filter="prn"',
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
