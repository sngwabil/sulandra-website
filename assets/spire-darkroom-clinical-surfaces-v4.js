(() => {
  'use strict';

  // SPIRE_DARKROOM_CLINICAL_SURFACES_V4
  // Extends the selected Dark Room theme to dynamically rendered clinical surfaces:
  // all chart workspaces except MAR, live Flowsheets sticky cells, body-level dialogs,
  // and the standalone Client Station.
  const MARKER = 'SPIRE_DARKROOM_CLINICAL_SURFACES_V4';
  const ROOT = document.documentElement;
  const STYLE_ID = 'spireDarkRoomClinicalSurfacesV4Style';
  const AUTO_SURFACE = 'spire-darkroom-v4-surface';
  const AUTO_TEXT = 'spire-darkroom-v4-text';
  let raf = 0;

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.dataset.spireDarkroomClinicalSurfaces = MARKER;
    style.textContent = `
      /* Every clinical workspace except the canonical MAR renderer follows Dark Room. */
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view),
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(.epic-section-card,.epic-section-body,.spire-card,.spire-kv-card,.notes-container,.notes-sidebar-list,.notes-editor-pane,.note-card,.note-item-card,.order-card,.care-plan-card,.detail-card,.detail-panel,.panel,.card,.widget,.tile,.table-wrap,.table-container){
        background:var(--epic-card)!important;background-image:none!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(.epic-section-header,.card-header,.panel-header,.section-header,.widget-header,.detail-header,.spire-section-title){
        background:var(--epic-panel2)!important;background-image:none!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(input,select,textarea){
        background:#081427!important;color:var(--epic-text)!important;-webkit-text-fill-color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(input,textarea)::placeholder{color:var(--epic-muted)!important;opacity:1!important}

      /* Live Flowsheets: eliminate legacy white sticky/task cells and inline light surfaces. */
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view,
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-grid-container,.flowsheet-main-layout,.flow-workspace,.flow-grid,.flow-groups,.flowsheet-tree){
        background:var(--epic-bg)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-sub-toolbar,.flowsheet-filters){
        background:var(--epic-panel)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-table,.flow-grid) :is(table,thead,tbody,tr){
        background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-table,.flow-grid) th,
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-table,.flow-grid) th:first-child,
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-table,.flow-grid) thead tr th{
        background:var(--epic-panel2)!important;background-image:none!important;color:var(--epic-text)!important;-webkit-text-fill-color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-table,.flow-grid) td,
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-table,.flow-grid) td:first-child,
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.sub-row-header,.row-header,.chartable-cell,.flow-cell){
        background:var(--epic-card)!important;background-image:none!important;color:var(--epic-text)!important;-webkit-text-fill-color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.flowsheet-table,.flow-grid) :is(td,th) :is(b,strong,span,div,small,p){
        color:inherit!important;-webkit-text-fill-color:currentColor!important;opacity:1!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(.chartable-cell,.flow-cell):hover{
        background:var(--epic-active)!important;box-shadow:inset 0 0 0 1px var(--epic-accent2)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #flowsheets-view :is(input,select,textarea,.filter-dropdown){
        background:#081427!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }

      /* Body-level clinical dialogs, including Manage Medication Orders. */
      :root[data-spire-epic-theme="darkRoom"] body :is(.master-dialog,.modal-card,[role="dialog"]){
        background:var(--epic-card)!important;background-image:none!important;color:var(--epic-text)!important;border:1px solid var(--epic-line)!important;box-shadow:0 20px 60px rgba(0,0,0,.65)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body :is(.master-dialog,.modal-card,[role="dialog"]) :is(main,.modal-body,section,article,.panel,.card){
        background:var(--epic-card)!important;background-image:none!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body :is(.master-dialog,.modal-card,[role="dialog"]) :is(header,.modal-header){
        background:var(--epic-panel2)!important;background-image:none!important;color:var(--epic-text)!important;border-color:var(--epic-accent)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body :is(.master-dialog,.modal-card,[role="dialog"]) :is(footer,.modal-footer){
        background:var(--epic-panel)!important;background-image:none!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body :is(.master-dialog,.modal-card,[role="dialog"]) :is(h1,h2,h3,h4,h5,h6,p,span,strong,b,small,label,legend,dt,dd,li){
        color:var(--epic-text)!important;-webkit-text-fill-color:var(--epic-text)!important;opacity:1!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body :is(.master-dialog,.modal-card,[role="dialog"]) :is(input,select,textarea){
        background:#081427!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body .master-dialog-backdrop,
      :root[data-spire-epic-theme="darkRoom"] body .modal-overlay{
        background:rgba(2,7,16,.76)!important;
      }

      /* Standalone Client Station follows the same selected Dark Room preset. */
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station],
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] :is(.station,.workspace,.main,.list-rail,.rail-section,.available,.table-panel,.preview,.preview-body){
        background:var(--epic-bg)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .topbar{
        background:var(--epic-title)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] :is(.pagebar,.toolbar,.splitter,.preview-head,.notice-head){
        background:var(--epic-panel2)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] :is(.pagebar h1,.scope,.rail-title,.rail-toolbar,.tree-item,.home-item,.home-name,.preview-name,.preview-meta,.preview-placeholder,.facts,.facts b,.client-name,.client-sub){
        color:var(--epic-text)!important;-webkit-text-fill-color:var(--epic-text)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] :is(.home-meta,.client-sub,.preview-meta,.preview-placeholder,.notice-item small){
        color:var(--epic-muted)!important;-webkit-text-fill-color:var(--epic-muted)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .client-table th{
        background:var(--epic-panel2)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .client-table td{
        background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .client-row:hover td,
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .client-row.selected td,
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .tree-item.selected{
        background:var(--epic-active)!important;color:var(--epic-text)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] :is(.search,.notice-panel,.notice-item,.mini-cell,.preview-action){
        background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] :is(.notice-item:hover,.preview-action:hover,.tree-item:hover,.home-item:hover){
        background:var(--epic-active)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .mini-grid{
        background:var(--epic-line)!important;border-color:var(--epic-line)!important;
      }

      /* Runtime fallback for bright inline/dynamic surfaces missed by static selectors. */
      :root[data-spire-epic-theme="darkRoom"] .${AUTO_SURFACE}{
        background:var(--epic-card)!important;background-image:none!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .${AUTO_TEXT}{
        color:var(--epic-text)!important;-webkit-text-fill-color:var(--epic-text)!important;opacity:1!important;
      }
    `;
  }

  function parseRgb(value) {
    const match = String(value || '').match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d?(?:\.\d+)?))?\s*\)/i);
    if (!match) return null;
    return { r:Number(match[1]), g:Number(match[2]), b:Number(match[3]), a:match[4]===undefined?1:Number(match[4]) };
  }

  function luminance(rgb) {
    if (!rgb) return 0;
    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  }

  function brightBackground(style) {
    const base = parseRgb(style.backgroundColor);
    if (base && base.a >= .2 && luminance(base) >= .58) return true;
    const image = String(style.backgroundImage || '');
    if (!image || image === 'none') return false;
    return (image.match(/rgba?\([^)]*\)/gi) || []).some(value => {
      const rgb = parseRgb(value);
      return rgb && rgb.a >= .18 && luminance(rgb) >= .58;
    });
  }

  function darkText(style) {
    const rgb = parseRgb(style.color);
    return !!rgb && rgb.a >= .25 && luminance(rgb) <= .55;
  }

  function normalizeRoot(root) {
    if (!(root instanceof HTMLElement)) return;
    const candidates = [root, ...root.querySelectorAll('div,section,article,main,aside,header,footer,table,thead,tbody,tr,td,th')];
    for (const element of candidates) {
      if (!(element instanceof HTMLElement) || element.closest('#mar-view')) continue;
      if (element.matches('button,input,select,textarea,a,img,svg,canvas,video,iframe')) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width >= 48 && rect.height >= 18 && rect.width * rect.height >= 1200 && brightBackground(style)) {
        element.classList.add(AUTO_SURFACE);
      }
    }
    root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,strong,b,small,label,legend,dt,dd,li,td,th,div').forEach(element => {
      if (!(element instanceof HTMLElement) || element.closest('#mar-view')) return;
      if (!Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) return;
      if (darkText(getComputedStyle(element))) element.classList.add(AUTO_TEXT);
    });
  }

  function clearMarks() {
    document.querySelectorAll(`.${AUTO_SURFACE},.${AUTO_TEXT}`).forEach(element => element.classList.remove(AUTO_SURFACE, AUTO_TEXT));
  }

  function renameThemeUi() {
    const tab = document.getElementById('accessPresetsTab');
    const intro = tab?.querySelector('p');
    if (intro && /Epic-style clinical themes/i.test(intro.textContent || '')) {
      intro.textContent = 'Choose from the existing S.P.I.R.E. presets or the eight clinical themes below. Each choice is saved for the signed-in user.';
    }
    const heading = document.querySelector('#spireEpicThemeSuiteGroup .spire-epic-theme-heading b');
    if (heading && /Epic/i.test(heading.textContent || '')) heading.textContent = 'Available Themes — Clinical set';
  }

  function normalize() {
    ensureStyle();
    renameThemeUi();
    if (ROOT.dataset.spireEpicTheme !== 'darkRoom') {
      clearMarks();
      return;
    }
    document.querySelectorAll('.workspace-view:not(#mar-view)').forEach(normalizeRoot);
    const flowsheet = document.getElementById('flowsheets-view');
    if (flowsheet) normalizeRoot(flowsheet);
    const dialog = document.getElementById('masterDialogBackdrop');
    if (dialog) normalizeRoot(dialog);
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      if (getComputedStyle(modal).display !== 'none') normalizeRoot(modal);
    });
    const station = document.body?.matches('[data-spire-client-station]') ? document.querySelector('.station') : null;
    if (station) normalizeRoot(station);
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

  window.SpireDarkRoomClinicalSurfacesV4 = Object.freeze({ marker:MARKER, normalize:schedule });
})();
