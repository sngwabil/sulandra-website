(() => {
  'use strict';

  // SPIRE_DARKROOM_CHROMATIC_DEPTH_V5
  // Visual-only Dark Room refinement: keeps the workstation low-light while
  // using restrained deep hues to separate clinical areas and reduce monotony.
  // It never owns navigation, data loading, chart persistence, MAR, or writes.
  const MARKER = 'SPIRE_DARKROOM_CHROMATIC_DEPTH_V5';
  const ROOT = document.documentElement;
  const STYLE_ID = 'spireDarkRoomChromaticDepthV5Style';
  const GROUP_CLASSES = [
    'spire-v5-adl','spire-v5-behavior','spire-v5-bowel','spire-v5-clinical',
    'spire-v5-medication','spire-v5-nutrition','spire-v5-neuro','spire-v5-isp'
  ];
  let raf = 0;

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.dataset.spireDarkroomChromaticDepth = MARKER;
    style.textContent = `
      :root[data-spire-epic-theme="darkRoom"]{
        --spire-v5-midnight:#07111f;
        --spire-v5-slate:#0d1a2d;
        --spire-v5-indigo:#111a38;
        --spire-v5-blue:#0b2138;
        --spire-v5-teal:#0c2930;
        --spire-v5-emerald:#10291f;
        --spire-v5-plum:#26162e;
        --spire-v5-burgundy:#2b151e;
        --spire-v5-amber:#2b210f;
        --spire-v5-olive:#202713;
        --spire-v5-cyan-line:#24536a;
        --spire-v5-plum-line:#60335f;
        --spire-v5-emerald-line:#285840;
      }

      /* Overall chart chrome: richer dark layers rather than one flat navy. */
      :root[data-spire-epic-theme="darkRoom"] .spire-title-bar{
        background:linear-gradient(90deg,#050b15 0%,#0b1527 55%,#11162a 100%)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .spire-toolbar{
        background:linear-gradient(90deg,#0b172a 0%,#10233a 55%,#111a35 100%)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .chart-tabs{
        background:#0c182c!important;
        border-bottom-color:#2a3b56!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .chart-tab:hover{
        background:#142642!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .chart-tab.active{
        background:#21152e!important;
        color:#fff!important;
        border-color:#633662!important;
        box-shadow:inset 0 -3px 0 var(--epic-accent)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .client-sidebar{
        background:linear-gradient(180deg,#0a1728 0%,#0a1424 100%)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .sidebar-card.demographics{background:#0c2036!important;border-left-color:#2f85b9!important}
      :root[data-spire-epic-theme="darkRoom"] .sidebar-card.clinical{background:#0d2728!important;border-left-color:#2d9a86!important}
      :root[data-spire-epic-theme="darkRoom"] .sidebar-card.alerts{background:#2a1e0d!important;border-left-color:#d4871c!important}
      :root[data-spire-epic-theme="darkRoom"] .sidebar-card.financial{background:#24172e!important;border-left-color:#9a5ec2!important}

      /* Summary/clinical section headers retain meaning with low-luminance hues. */
      :root[data-spire-epic-theme="darkRoom"] .header-agents{background:#0d2634!important;border-left-color:#30a4c5!important;color:#d9f7ff!important}
      :root[data-spire-epic-theme="darkRoom"] .header-team{background:#102b24!important;border-left-color:#4ac38a!important;color:#d8f9e7!important}
      :root[data-spire-epic-theme="darkRoom"] .header-emergency{background:#111d3a!important;border-left-color:#678be8!important;color:#e4ebff!important}
      :root[data-spire-epic-theme="darkRoom"] .header-history{background:#281832!important;border-left-color:#bb65c8!important;color:#fae7ff!important}
      :root[data-spire-epic-theme="darkRoom"] .header-diet{background:#1c2815!important;border-left-color:#71b45a!important;color:#e8f7df!important}
      :root[data-spire-epic-theme="darkRoom"] .header-advisory{background:#2d210e!important;color:#ffd28a!important;border-left-color:#e49a2c!important}
      :root[data-spire-epic-theme="darkRoom"] .header-problems{background:#2d131d!important;color:#ffb6c5!important;border-left-color:#dc526e!important}

      /* Flowsheets: force the remaining light label/sticky surfaces dark first. */
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(
        .flowsheet-table td:first-child,.flowsheet-table th:first-child,
        .flow-grid td:first-child,.flow-grid th:first-child,
        .row-header,.sub-row-header,[data-row-label]
      ){
        background:#0d1a2d!important;
        background-image:none!important;
        color:#f2f5fb!important;
        -webkit-text-fill-color:#f2f5fb!important;
        border-color:#33465f!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(
        [style*="background:#fff" i],[style*="background: #fff" i],
        [style*="background:white" i],[style*="background: white" i],
        [style*="background:#ffffff" i],[style*="background: #ffffff" i]
      ){
        background:#0d1a2d!important;
        background-image:none!important;
        color:#f2f5fb!important;
        -webkit-text-fill-color:#f2f5fb!important;
        border-color:#33465f!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view .flowsheet-sub-toolbar{background:#0d1c31!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view .flowsheet-filters{background:#121a35!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-tree,.flow-groups){background:#09172a!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.tree-item,.flow-groups button):hover{background:#122942!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.tree-item.selected,.flow-groups button.active){background:#24172e!important;box-shadow:inset 0 -3px 0 var(--epic-accent)!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-table,.flow-grid) thead th{background:#10213a!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-table,.flow-grid) tbody tr:nth-child(even) td:not(:first-child){background:#0b1729!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-table,.flow-grid) tbody tr:nth-child(odd) td:not(:first-child){background:#0c1a2d!important}

      /* Semantic flowsheet groups and label cells. */
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view .spire-v5-adl{background:#0c2930!important;border-color:#285b65!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view .spire-v5-behavior{background:#26162e!important;border-color:#60335f!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view .spire-v5-bowel{background:#111a38!important;border-color:#3a477a!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view .spire-v5-clinical{background:#10291f!important;border-color:#285840!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view .spire-v5-medication{background:#2b151e!important;border-color:#6e3343!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view .spire-v5-nutrition{background:#202713!important;border-color:#4e6331!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view .spire-v5-neuro{background:#0b2138!important;border-color:#2c5d87!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view .spire-v5-isp{background:#1e1835!important;border-color:#574887!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view tr.spire-v5-adl > :is(td,th){background:#0c2930!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view tr.spire-v5-behavior > :is(td,th){background:#26162e!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view tr.spire-v5-bowel > :is(td,th){background:#111a38!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view tr.spire-v5-clinical > :is(td,th){background:#10291f!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view tr.spire-v5-medication > :is(td,th){background:#2b151e!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view tr.spire-v5-nutrition > :is(td,th){background:#202713!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view tr.spire-v5-neuro > :is(td,th){background:#0b2138!important}
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view tr.spire-v5-isp > :is(td,th){background:#1e1835!important}

      /* Notes: dark cards get subtle alternating identities without reducing readability. */
      :root[data-spire-epic-theme="darkRoom"] #notes-view .notes-sidebar-list{background:#09172a!important;border-color:#31455f!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .notes-editor-pane{background:#0a1628!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .note-author-banner{background:#16203a!important;border-color:#3b5172!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .note-item-card{background:#0d1d32!important;border-color:#304862!important;border-left:4px solid #2a8cab!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .note-item-card:nth-child(4n+2){background:#102820!important;border-left-color:#3eaa78!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .note-item-card:nth-child(4n+3){background:#24172e!important;border-left-color:#a15caf!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .note-item-card:nth-child(4n){background:#111a38!important;border-left-color:#6375cd!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .note-item-card:hover{background:#142b43!important;border-color:#40b7d6!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view :is(pre,code){color:#e7edf8!important}

      /* Orders/dialogs: deep plum title with alternating dark clinical cards. */
      :root[data-spire-epic-theme="darkRoom"] body .master-dialog > header,
      :root[data-spire-epic-theme="darkRoom"] body [role="dialog"] > header{
        background:linear-gradient(90deg,#24162e,#14233a)!important;
        border-bottom:2px solid #9c4d9f!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body .master-dialog > main{background:#091528!important}
      :root[data-spire-epic-theme="darkRoom"] body .master-dialog > main > :is(section,article,div):not(.dialog-field){border-color:#344a64!important}
      :root[data-spire-epic-theme="darkRoom"] body .master-dialog > main > :is(section,article):nth-of-type(odd){background:#0d2230!important}
      :root[data-spire-epic-theme="darkRoom"] body .master-dialog > main > :is(section,article):nth-of-type(even){background:#171a35!important}

      /* Standalone Client Station: layered dark navigation and table treatment. */
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .topbar{background:linear-gradient(90deg,#050b15,#0c182b 65%,#11172b)!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .pagebar{background:#102039!important;border-bottom-color:#314c69!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .list-rail{background:#081528!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .available{background:#0a1c2b!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .toolbar{background:#111a35!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .table-panel{background:#071426!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .client-table th{background:#10213a!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .client-table tbody tr:nth-child(odd) td{background:#0b192c!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .client-table tbody tr:nth-child(even) td{background:#0d1d30!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .client-row:hover td{background:#102d3b!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .client-row.selected td{background:#17203d!important;box-shadow:inset 0 -2px 0 var(--epic-accent)!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .tree-item.selected{background:#24172e!important;box-shadow:inset 0 -3px 0 var(--epic-accent)!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .home-item.current{background:#0d2930!important}
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .preview-head{background:#0d2634!important}
    `;
  }

  function clinicalClass(text) {
    const value = String(text || '').toLowerCase();
    if (/(bathing|shower|dressing|groom|oral care|toilet|adl|personal care)/.test(value)) return 'spire-v5-adl';
    if (/(behavior|mood|trigger|antecedent|de-escal|elopement|safety)/.test(value)) return 'spire-v5-behavior';
    if (/(bowel|elimination|stool|fluid intake|hydration|urinary|void)/.test(value)) return 'spire-v5-bowel';
    if (/(clinical monitoring|pain|skin|wound|temperature|pulse|blood pressure|spo2|glucose|vital)/.test(value)) return 'spire-v5-clinical';
    if (/(medication|emar|mar|dose|administration)/.test(value)) return 'spire-v5-medication';
    if (/(meal|nutrition|diet|dysphagia|swallow)/.test(value)) return 'spire-v5-nutrition';
    if (/(seizure|neuro|neurological)/.test(value)) return 'spire-v5-neuro';
    if (/(isp|goal|outcome|skill-building|skill building)/.test(value)) return 'spire-v5-isp';
    return '';
  }

  function markFlowsheet() {
    const host = document.getElementById('flowsheets-view');
    if (!host) return;
    host.querySelectorAll('tr').forEach(row => {
      row.classList.remove(...GROUP_CLASSES);
      const cls = clinicalClass(row.textContent);
      if (cls && row.textContent.trim().length < 180) row.classList.add(cls);
    });
    host.querySelectorAll('td:first-child,th:first-child,.row-header,.sub-row-header,[data-row-label]').forEach(cell => {
      if (!(cell instanceof HTMLElement)) return;
      cell.classList.remove(...GROUP_CLASSES);
      const cls = clinicalClass(cell.textContent);
      if (cls) cell.classList.add(cls);
    });
  }

  function normalize() {
    ensureStyle();
    if (ROOT.dataset.spireEpicTheme !== 'darkRoom') return;
    markFlowsheet();
  }

  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; normalize(); });
  }

  ensureStyle();
  window.addEventListener('spire:theme-change', schedule);
  window.addEventListener('spire:company-change', schedule);
  document.addEventListener('click', () => requestAnimationFrame(() => requestAnimationFrame(schedule)), true);
  new MutationObserver(schedule).observe(ROOT, { attributes:true, attributeFilter:['data-spire-epic-theme'] });
  const start = () => {
    if (!document.body) return;
    new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true });
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.SpireDarkRoomChromaticDepthV5 = Object.freeze({ marker:MARKER, normalize:schedule });
})();
