(() => {
  'use strict';

  // SPIRE_FLOWSHEET_FROZEN_PANE_V1
  // Keep task/category context visible while only the time/value columns scroll horizontally.
  const STYLE_ID = 'spireFlowsheetFrozenPaneStyle';

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #flowsheets-view[data-user-master-flowsheet="true"] .flowsheet-main-layout{
        display:grid!important;
        grid-template-columns:245px minmax(0,1fr)!important;
        overflow:hidden!important;
        min-width:0!important;
      }
      #flowsheets-view[data-user-master-flowsheet="true"] .flowsheet-tree{
        position:relative!important;
        z-index:20!important;
        min-width:0!important;
        overflow-x:hidden!important;
        overflow-y:auto!important;
        background:#f7faff!important;
        box-shadow:1px 0 0 #c8d5e3!important;
      }
      #flowsheets-view[data-user-master-flowsheet="true"] .flowsheet-grid-container{
        position:relative!important;
        min-width:0!important;
        overflow-x:auto!important;
        overflow-y:auto!important;
        overscroll-behavior-x:contain!important;
      }
      #flowsheets-view[data-user-master-flowsheet="true"] .flowsheet-table{
        position:relative!important;
      }
      #flowsheets-view[data-user-master-flowsheet="true"] .flowsheet-table th:first-child,
      #flowsheets-view[data-user-master-flowsheet="true"] .flowsheet-table tbody tr:not(.flow-section-row) td:first-child{
        position:sticky!important;
        left:0!important;
        z-index:6!important;
        width:280px!important;
        min-width:280px!important;
        max-width:280px!important;
        background:#fff!important;
        box-shadow:2px 0 0 #c8d5e3!important;
      }
      #flowsheets-view[data-user-master-flowsheet="true"] .flowsheet-table thead th:first-child{
        z-index:10!important;
        background:#eef4fc!important;
      }
      #flowsheets-view[data-user-master-flowsheet="true"] #headerDateRow th:first-child{
        background:#fff!important;
      }
      #flowsheets-view[data-user-master-flowsheet="true"] .flow-section-row .flow-section-label{
        position:sticky!important;
        left:0!important;
        z-index:8!important;
        width:280px!important;
        min-width:280px!important;
        max-width:280px!important;
        background:#e6eef8!important;
        color:#003366!important;
        box-shadow:2px 0 0 #b9c9da!important;
        white-space:nowrap!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
      }
      #flowsheets-view[data-user-master-flowsheet="true"] .flow-section-row .flow-section-scroll-fill{
        position:relative!important;
        z-index:1!important;
        background:#e6eef8!important;
        padding:0!important;
      }
    `;
    document.head.appendChild(style);
  }

  function splitSectionRow(row) {
    if (!(row instanceof HTMLTableRowElement)) return;
    if (row.dataset.frozenPaneSplit === 'true') return;
    const first = row.cells[0];
    if (!first) return;

    if (first.classList.contains('flow-section-label')) {
      row.dataset.frozenPaneSplit = 'true';
      return;
    }

    const span = Number(first.getAttribute('colspan') || first.colSpan || 1);
    const label = String(first.textContent || '').trim();
    first.removeAttribute('colspan');
    first.classList.add('flow-section-label');
    first.textContent = label;

    if (span > 1) {
      const fill = document.createElement('td');
      fill.className = 'flow-section-scroll-fill';
      fill.colSpan = Math.max(1, span - 1);
      fill.setAttribute('aria-hidden', 'true');
      row.appendChild(fill);
    }
    row.dataset.frozenPaneSplit = 'true';
  }

  function normalizeFrozenPane() {
    const host = document.getElementById('flowsheets-view');
    if (!host) return false;
    const grid = host.querySelector('#flowsheetGridContainer');
    const table = host.querySelector('#flowsheetTable');
    if (!grid || !table) return false;

    installStyle();
    host.dataset.frozenPane = 'true';
    table.querySelectorAll('tr.flow-section-row').forEach(splitSectionRow);
    return true;
  }

  let tbodyObserver = null;
  function observeGrid() {
    if (!normalizeFrozenPane()) return false;
    const tbody = document.getElementById('flowsheetTbody');
    if (!tbody) return true;
    if (tbodyObserver) tbodyObserver.disconnect();
    tbodyObserver = new MutationObserver(() => normalizeFrozenPane());
    tbodyObserver.observe(tbody, { childList: true, subtree: false });
    return true;
  }

  function install() {
    if (observeGrid()) return;
    const observer = new MutationObserver(() => {
      if (observeGrid()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
