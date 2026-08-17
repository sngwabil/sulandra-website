(() => {
  'use strict';

  // SPIRE_DARKROOM_SUMMARY_NOTES_REPAIR_V7
  // Visual-only final-pass repair for Summary and Notes. No data, navigation,
  // MAR, Flowsheet, event, observer, or persistence ownership is allowed here.
  const MARKER = 'SPIRE_DARKROOM_SUMMARY_NOTES_REPAIR_V7';
  const STYLE_ID = 'spireDarkRoomSummaryNotesRepairV7Style';
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.dataset.spireDarkroomSummaryNotesRepair = MARKER;
  style.textContent = `
    :root[data-spire-epic-theme="darkRoom"] body #summary-view,
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab,
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .epic-overview-container.spire-summary-overview-v3{
      background:#071426!important;color:#eef4fb!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab :is(
      .spire-summary-at-glance,.spire-summary-card,.epic-section-card,
      .spire-summary-fact,.spire-summary-mini-fact,.spire-summary-lda-body
    ){
      background:#0d1930!important;background-image:none!important;
      color:#e8f0f8!important;border-color:#33465f!important;box-shadow:none!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab :is(
      .spire-summary-at-glance-head,.spire-summary-card>.epic-section-header,
      .epic-section-header
    ){
      background:#101e36!important;background-image:none!important;
      color:#f4f7fb!important;border-color:#3a4a63!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-snapshot-grid,
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-facts,
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-mini-facts{
      background:#24364d!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-snapshot-item{
      background:#0d1930!important;color:#edf4fb!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-snapshot-item[data-tone="danger"]{background:#2b151e!important;border-left-color:#dc526e!important}
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-snapshot-item[data-tone="warning"]{background:#2b210f!important;border-left-color:#e49a2c!important}
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-snapshot-item[data-tone="success"]{background:#10291f!important;border-left-color:#4ac38a!important}
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-snapshot-item[data-tone="info"]{background:#0b2138!important;border-left-color:#4aa3df!important}
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab :is(
      .spire-summary-at-glance-title,.spire-summary-snapshot-value,.spire-summary-fact-value,
      .spire-summary-card .epic-section-body,.spire-summary-card .doc-table tbody td
    ){
      color:#e8f0f8!important;-webkit-text-fill-color:#e8f0f8!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab :is(
      .spire-summary-at-glance-sub,.spire-summary-snapshot-label,.spire-summary-fact-label
    ){
      color:#aebdd0!important;-webkit-text-fill-color:#aebdd0!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-safety .epic-section-body{
      background:#211a0d!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-safety .spire-summary-fact{
      background:#2b210f!important;border-color:#76571d!important;border-left-color:#e49a2c!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-safety .spire-summary-fact-label{color:#ffd28a!important;-webkit-text-fill-color:#ffd28a!important}
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-safety .spire-summary-fact-value{color:#f1e7ce!important;-webkit-text-fill-color:#f1e7ce!important}
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-problems>.epic-section-header{background:#2d131d!important;color:#ffb6c5!important;border-left-color:#dc526e!important}
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-card .doc-table thead th{background:#10213a!important;color:#cfe0ee!important;border-color:#344a64!important}
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-card .doc-table tbody td,
    :root[data-spire-epic-theme="darkRoom"] body #summary-view #overview-tab .spire-summary-card .doc-table tbody tr:nth-child(even) td{
      background:#0d1930!important;color:#e2ecf5!important;border-color:#2f435d!important;
    }

    :root[data-spire-epic-theme="darkRoom"] body #notes-view,
    :root[data-spire-epic-theme="darkRoom"] body #notes-view .notes-container,
    :root[data-spire-epic-theme="darkRoom"] body #notes-view .notes-sidebar-list,
    :root[data-spire-epic-theme="darkRoom"] body #notes-view .notes-editor-pane{
      background:#071426!important;color:#edf4fb!important;border-color:#33465f!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #notes-view :is(
      .note-author-banner,.note-item-card,.dialog-field,
      [class*="note-template" i],[class*="template-panel" i],[class*="template-card" i],
      [class*="smarttext" i],[class*="note-composer" i],[class*="note-editor" i]
    ),
    :root[data-spire-epic-theme="darkRoom"] body #notes-view .notes-editor-pane > :is(div,section,article,fieldset,form){
      background:#0d1930!important;background-image:none!important;
      color:#e8f0f8!important;border-color:#33465f!important;box-shadow:none!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #notes-view .note-author-banner{
      background:#111a38!important;border-color:#3f4d7d!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #notes-view .note-item-card{
      background:#0d1d32!important;border-color:#304862!important;color:#e8f0f8!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #notes-view .note-item-card:nth-child(4n+2){background:#102820!important}
    :root[data-spire-epic-theme="darkRoom"] body #notes-view .note-item-card:nth-child(4n+3){background:#24172e!important}
    :root[data-spire-epic-theme="darkRoom"] body #notes-view .note-item-card:nth-child(4n){background:#111a38!important}
    :root[data-spire-epic-theme="darkRoom"] body #notes-view :is(input,select,textarea){
      background:#081427!important;color:#f2f5fb!important;-webkit-text-fill-color:#f2f5fb!important;
      border-color:#40536d!important;caret-color:#f2f5fb!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body #notes-view :is(input,textarea)::placeholder{color:#91a3b8!important;opacity:1!important}
    :root[data-spire-epic-theme="darkRoom"] body #notes-view :is(label,h1,h2,h3,h4,h5,h6,strong,b){color:#edf4fb!important;-webkit-text-fill-color:#edf4fb!important}
    :root[data-spire-epic-theme="darkRoom"] body #notes-view :is(.spire-muted,small,[class*="muted" i],[class*="meta" i],[class*="subtitle" i]){color:#a9b8ca!important;-webkit-text-fill-color:#a9b8ca!important}
    :root[data-spire-epic-theme="darkRoom"] body #notes-view :is(
      [style*="background:#fff" i],[style*="background: #fff" i],
      [style*="background:white" i],[style*="background: white" i],
      [style*="background:#ffffff" i],[style*="background: #ffffff" i],
      [style*="background:#f" i],[style*="background: #f" i]
    ):not(button):not(.note-author-avatar){
      background:#0d1930!important;background-image:none!important;color:#e8f0f8!important;border-color:#33465f!important;
    }
  `;
  document.head.appendChild(style);
})();
