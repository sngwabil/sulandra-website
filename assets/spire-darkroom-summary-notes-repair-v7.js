(() => {
  'use strict';

  // SPIRE_DARKROOM_GLOBAL_COVERAGE_V8
  // Visual-only final coverage for both Theme #22 (darkClinicalSummary) and the
  // Epic-suite Dark Room preset. This file owns no navigation, data, MAR,
  // Flowsheet, persistence, event, observer, or clinical behavior.
  const MARKER = 'SPIRE_DARKROOM_GLOBAL_COVERAGE_V8';
  const STYLE_ID = 'spireDarkRoomGlobalCoverageV8Style';
  if (document.getElementById(STYLE_ID)) return;

  const DARK_ROOT = ':root:is([data-spire-preset="darkClinicalSummary"],[data-spire-epic-theme="darkRoom"])';
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.dataset.spireDarkroomGlobalCoverage = MARKER;
  style.textContent = `
    /* Global chart surfaces. MAR remains owned by its canonical hourly renderer. */
    ${DARK_ROOT} body .workspace-view:not(#mar-view),
    ${DARK_ROOT} body .workspace-view:not(#mar-view) > :is(main,section,article,div),
    ${DARK_ROOT} body #summary-view,
    ${DARK_ROOT} body #notes-view,
    ${DARK_ROOT} body #manage-orders-view,
    ${DARK_ROOT} body #orders-view,
    ${DARK_ROOT} body #lda-view,
    ${DARK_ROOT} body #results-view,
    ${DARK_ROOT} body #synopsis-view,
    ${DARK_ROOT} body #clinical-view,
    ${DARK_ROOT} body #admission-view,
    ${DARK_ROOT} body #discharge-view{
      background:#071426!important;
      color:#edf4fb!important;
      border-color:#33465f!important;
    }

    /* Shared cards/panels produced by the chart and by late workspace renderers. */
    ${DARK_ROOT} body .workspace-view:not(#mar-view) :is(
      .epic-section-card,.epic-section-body,.spire-card,.spire-kv-card,.spire-card-grid,
      .summary-card,.summary-section,.snapshot-card,.snapshot-section,
      .clinical-card,.clinical-section,.problem-card,.problem-section,
      .risk-card,.safety-card,.advisory-card,.detail-card,.detail-panel,
      .note-card,.order-card,.care-plan-card,.timeline-card,.context-card,
      .panel,.card,.widget,.tile,.table-wrap,.table-container,
      .notes-container,.notes-sidebar-list,.notes-editor-pane,.note-author-banner,.note-item-card,
      [class*="note-template" i],[class*="template-panel" i],[class*="template-card" i],
      [class*="smarttext" i],[class*="note-composer" i],[class*="note-editor" i]
    ){
      background:#0d1930!important;
      background-image:none!important;
      color:#e8f0f8!important;
      border-color:#33465f!important;
      box-shadow:none!important;
    }

    ${DARK_ROOT} body .workspace-view:not(#mar-view) :is(
      .card-header,.panel-header,.section-header,.widget-header,.summary-header,
      .epic-section-header,.detail-header,.snapshot-header,.spire-section-title
    ){
      background:#101e36!important;
      background-image:none!important;
      color:#f4f7fb!important;
      border-color:#3a4a63!important;
    }

    /* Summary Overview V3 ships strong white !important surfaces; override them last. */
    ${DARK_ROOT} body #summary-view #overview-tab,
    ${DARK_ROOT} body #summary-view #overview-tab .epic-overview-container.spire-summary-overview-v3{
      background:#071426!important;
      color:#eef4fb!important;
    }
    ${DARK_ROOT} body #summary-view #overview-tab :is(
      .spire-summary-at-glance,.spire-summary-card,.epic-section-card,
      .spire-summary-fact,.spire-summary-mini-fact,.spire-summary-lda-body,
      .spire-summary-snapshot-item
    ){
      background:#0d1930!important;
      background-image:none!important;
      color:#e8f0f8!important;
      border-color:#33465f!important;
      box-shadow:none!important;
    }
    ${DARK_ROOT} body #summary-view #overview-tab :is(
      .spire-summary-at-glance-head,.spire-summary-card>.epic-section-header,.epic-section-header
    ){
      background:#101e36!important;
      background-image:none!important;
      color:#f4f7fb!important;
      border-color:#3a4a63!important;
    }
    ${DARK_ROOT} body #summary-view #overview-tab :is(
      .spire-summary-at-glance-title,.spire-summary-snapshot-value,.spire-summary-fact-value,
      .spire-summary-card .epic-section-body,.spire-summary-card .doc-table tbody td
    ){
      color:#e8f0f8!important;
      -webkit-text-fill-color:#e8f0f8!important;
    }
    ${DARK_ROOT} body #summary-view #overview-tab :is(
      .spire-summary-at-glance-sub,.spire-summary-snapshot-label,.spire-summary-fact-label
    ){
      color:#aebdd0!important;
      -webkit-text-fill-color:#aebdd0!important;
    }
    ${DARK_ROOT} body #summary-view #overview-tab .spire-summary-snapshot-grid,
    ${DARK_ROOT} body #summary-view #overview-tab .spire-summary-facts,
    ${DARK_ROOT} body #summary-view #overview-tab .spire-summary-mini-facts{
      background:#24364d!important;
    }
    ${DARK_ROOT} body #summary-view #overview-tab .spire-summary-snapshot-item[data-tone="danger"]{background:#2b151e!important;border-left-color:#dc526e!important}
    ${DARK_ROOT} body #summary-view #overview-tab .spire-summary-snapshot-item[data-tone="warning"]{background:#2b210f!important;border-left-color:#e49a2c!important}
    ${DARK_ROOT} body #summary-view #overview-tab .spire-summary-snapshot-item[data-tone="success"]{background:#10291f!important;border-left-color:#4ac38a!important}
    ${DARK_ROOT} body #summary-view #overview-tab .spire-summary-snapshot-item[data-tone="info"]{background:#0b2138!important;border-left-color:#4aa3df!important}
    ${DARK_ROOT} body #summary-view #overview-tab .spire-summary-safety .epic-section-body{background:#211a0d!important}
    ${DARK_ROOT} body #summary-view #overview-tab .spire-summary-safety .spire-summary-fact{background:#2b210f!important;border-color:#76571d!important;border-left-color:#e49a2c!important}
    ${DARK_ROOT} body #summary-view #overview-tab .spire-summary-safety .spire-summary-fact-label{color:#ffd28a!important;-webkit-text-fill-color:#ffd28a!important}
    ${DARK_ROOT} body #summary-view #overview-tab .spire-summary-safety .spire-summary-fact-value{color:#f1e7ce!important;-webkit-text-fill-color:#f1e7ce!important}
    ${DARK_ROOT} body #summary-view #overview-tab .spire-summary-problems>.epic-section-header{background:#2d131d!important;color:#ffb6c5!important;border-left-color:#dc526e!important}

    /* Notes composer/templates. */
    ${DARK_ROOT} body #notes-view,
    ${DARK_ROOT} body #notes-view .notes-container,
    ${DARK_ROOT} body #notes-view .notes-sidebar-list,
    ${DARK_ROOT} body #notes-view .notes-editor-pane{
      background:#071426!important;
      color:#edf4fb!important;
      border-color:#33465f!important;
    }
    ${DARK_ROOT} body #notes-view .notes-editor-pane > :is(div,section,article,fieldset,form),
    ${DARK_ROOT} body #notes-view :is(.note-author-banner,.note-item-card,.dialog-field){
      background:#0d1930!important;
      background-image:none!important;
      color:#e8f0f8!important;
      border-color:#33465f!important;
      box-shadow:none!important;
    }
    ${DARK_ROOT} body #notes-view .note-author-banner{background:#111a38!important;border-color:#3f4d7d!important}
    ${DARK_ROOT} body #notes-view .note-item-card{background:#0d1d32!important;border-color:#304862!important;color:#e8f0f8!important}
    ${DARK_ROOT} body #notes-view .note-item-card:nth-child(4n+2){background:#102820!important}
    ${DARK_ROOT} body #notes-view .note-item-card:nth-child(4n+3){background:#24172e!important}
    ${DARK_ROOT} body #notes-view .note-item-card:nth-child(4n){background:#111a38!important}

    /* Orders V6 live cards. */
    ${DARK_ROOT} body #manage-orders-view :is([data-spire-orders-live="true"],[data-spire-orders-loading="true"]),
    ${DARK_ROOT} body #manage-orders-view .spire-card-grid,
    ${DARK_ROOT} body #manage-orders-view .spire-kv-card,
    ${DARK_ROOT} body #orders-view .spire-card-grid,
    ${DARK_ROOT} body #orders-view .spire-kv-card{
      background:#0d1930!important;
      color:#e8f0f8!important;
      border-color:#33465f!important;
    }
    ${DARK_ROOT} body #manage-orders-view :is(h1,h2,h3,h4,h5,h6,b,strong,p,span),
    ${DARK_ROOT} body #orders-view :is(h1,h2,h3,h4,h5,h6,b,strong,p,span){
      color:inherit;
    }

    /* LDA/Wound V1 injects an entire light stylesheet at runtime. Darken the
       workspace chrome and panels, while preserving the anatomical SVG itself. */
    ${DARK_ROOT} body #lda-view,
    ${DARK_ROOT} body #lda-view .spire-lda-shell,
    ${DARK_ROOT} body #lda-view .spire-lda-layout,
    ${DARK_ROOT} body #lda-view .spire-lda-toolbar,
    ${DARK_ROOT} body #lda-view .spire-lda-list,
    ${DARK_ROOT} body #lda-view .spire-lda-avatar-pane,
    ${DARK_ROOT} body #lda-view .spire-lda-detail,
    ${DARK_ROOT} body #lda-view .spire-lda-detail-head,
    ${DARK_ROOT} body #lda-view .spire-lda-section,
    ${DARK_ROOT} body #lda-view .spire-lda-kv,
    ${DARK_ROOT} body #lda-view .spire-lda-card,
    ${DARK_ROOT} body #lda-view .spire-lda-body-card,
    ${DARK_ROOT} body #lda-view .spire-lda-legend span,
    ${DARK_ROOT} body #lda-view .spire-lda-dialog,
    ${DARK_ROOT} body #lda-view .spire-lda-dialog-body,
    ${DARK_ROOT} body #lda-view .spire-lda-dialog-foot,
    ${DARK_ROOT} body #lda-view .spire-lda-form-section,
    ${DARK_ROOT} body #lda-view .spire-lda-summary-body{
      background:#0d1930!important;
      background-image:none!important;
      color:#e8f0f8!important;
      border-color:#33465f!important;
      box-shadow:none!important;
    }
    ${DARK_ROOT} body #lda-view .spire-lda-toolbar,
    ${DARK_ROOT} body #lda-view .spire-lda-detail-head,
    ${DARK_ROOT} body #lda-view .spire-lda-section h4{
      background:#101e36!important;
      color:#dce8f4!important;
      border-color:#3a4a63!important;
    }
    ${DARK_ROOT} body #lda-view :is(
      .spire-lda-toolbar h3,.spire-lda-list-title,.spire-lda-card-name,.spire-lda-meta,
      .spire-lda-avatar-head,.spire-lda-avatar-hint,.spire-lda-detail-title,.spire-lda-detail-sub,
      .spire-lda-k,.spire-lda-v,.spire-lda-assessment-head,.spire-lda-assessment-body,
      .spire-lda-body-label,.spire-lda-summary-count
    ){
      color:#dce8f4!important;
      -webkit-text-fill-color:#dce8f4!important;
    }
    ${DARK_ROOT} body #lda-view .spire-lda-body-stage{
      background:transparent!important;
    }
    ${DARK_ROOT} body #lda-view .spire-lda-body-stage:hover{
      background:#101e36!important;
    }
    ${DARK_ROOT} body #lda-view .spire-lda-card:hover,
    ${DARK_ROOT} body #lda-view .spire-lda-card.active{
      background:#162b49!important;
      border-color:#53a9d5!important;
    }
    ${DARK_ROOT} body #lda-view .spire-lda-dialog-head{
      background:#111a38!important;
      color:#eef4fb!important;
      border-color:#3f4d7d!important;
    }

    /* Form controls and tables outside MAR. */
    ${DARK_ROOT} body .workspace-view:not(#mar-view) :is(input,select,textarea),
    ${DARK_ROOT} body #lda-view :is(input,select,textarea){
      background:#081427!important;
      color:#f2f5fb!important;
      -webkit-text-fill-color:#f2f5fb!important;
      border-color:#40536d!important;
      caret-color:#f2f5fb!important;
    }
    ${DARK_ROOT} body .workspace-view:not(#mar-view) :is(input,textarea)::placeholder{color:#91a3b8!important;opacity:1!important}
    ${DARK_ROOT} body .workspace-view:not(#mar-view) :is(table,tbody,tr,td){
      background:#0d1930!important;
      color:#e8f0f8!important;
      border-color:#33465f!important;
    }
    ${DARK_ROOT} body .workspace-view:not(#mar-view) :is(thead,th){
      background:#10213a!important;
      color:#dce8f4!important;
      border-color:#3a4a63!important;
    }

    /* Catch remaining legacy inline white surfaces without touching semantic
       alerts, status pills, buttons, or the anatomical drawing itself. */
    ${DARK_ROOT} body .workspace-view:not(#mar-view) :is(
      [style*="background:#fff" i],[style*="background: #fff" i],
      [style*="background:white" i],[style*="background: white" i],
      [style*="background:#ffffff" i],[style*="background: #ffffff" i],
      [style*="background-color:#fff" i],[style*="background-color: #fff" i],
      [style*="background-color:white" i],[style*="background-color: white" i],
      [style*="background-color:#ffffff" i],[style*="background-color: #ffffff" i]
    ):not(button):not(.notification-badge):not(.spire-pill):not(.spire-lda-pin):not(.spire-lda-body-stage){
      background:#0d1930!important;
      background-image:none!important;
      color:#e8f0f8!important;
      border-color:#33465f!important;
    }

    /* Restore clinical meaning after the generic dark pass. */
    ${DARK_ROOT} body .workspace-view:not(#mar-view) :is(.header-advisory,.warning,.warn,[class*="warning" i]){
      background:#2b210f!important;
      color:#ffd28a!important;
      border-color:#e49a2c!important;
    }
    ${DARK_ROOT} body .workspace-view:not(#mar-view) :is(.header-problems,.critical,.danger,[class*="danger" i]){
      background:#2d131d!important;
      color:#ffb6c5!important;
      border-color:#dc526e!important;
    }
    ${DARK_ROOT} body .workspace-view:not(#mar-view) :is(.success,.completed,[class*="success" i]){
      background:#10291f!important;
      color:#a8f3c2!important;
      border-color:#4ac38a!important;
    }

    ${DARK_ROOT} body .workspace-view:not(#mar-view) :is(h1,h2,h3,h4,h5,h6,label,strong,b){
      color:#edf4fb!important;
      -webkit-text-fill-color:#edf4fb!important;
    }
    ${DARK_ROOT} body .workspace-view:not(#mar-view) :is(.spire-muted,small,[class*="muted" i],[class*="meta" i],[class*="subtitle" i],[class*="caption" i]){
      color:#a9b8ca!important;
      -webkit-text-fill-color:#a9b8ca!important;
    }
  `;
  document.head.appendChild(style);

  window.SpireDarkRoomGlobalCoverageV8 = Object.freeze({
    marker: MARKER,
    theme22Selector: 'data-spire-preset="darkClinicalSummary"',
    epicDarkRoomSelector: 'data-spire-epic-theme="darkRoom"',
    visualOnly: true,
    marExcluded: true,
  });
})();
