(() => {
  'use strict';

  // SPIRE_DARKROOM_SURFACE_COVERAGE_V1
  // Dark Room must remain a genuinely low-light clinical workspace even when
  // individual tabs render their own light cards after the base theme loads.
  // MAR is intentionally excluded: its canonical hourly runtime owns its own
  // visual semantics and must never be rewritten by generic workspace logic.
  const MARKER = 'SPIRE_DARKROOM_SURFACE_COVERAGE_V1';
  const ROOT = document.documentElement;
  const STYLE_ID = 'spireDarkRoomSurfaceCoverageStyle';
  const AUTO_SURFACE = 'spire-darkroom-auto-surface';
  const AUTO_TEXT = 'spire-darkroom-auto-text';
  const AUTO_MUTED = 'spire-darkroom-auto-muted';
  const SEMANTIC_WARN = 'spire-darkroom-semantic-warn';
  const SEMANTIC_DANGER = 'spire-darkroom-semantic-danger';
  const SEMANTIC_SUCCESS = 'spire-darkroom-semantic-success';
  let raf = 0;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.dataset.spireDarkroomCoverage = MARKER;
    style.textContent = `
      :root[data-spire-epic-theme="darkRoom"] body,
      :root[data-spire-epic-theme="darkRoom"] .workspace,
      :root[data-spire-epic-theme="darkRoom"] .workspace-main,
      :root[data-spire-epic-theme="darkRoom"] .main-content,
      :root[data-spire-epic-theme="darkRoom"] .center-workspace,
      :root[data-spire-epic-theme="darkRoom"] .center-content,
      :root[data-spire-epic-theme="darkRoom"] .patient-workspace,
      :root[data-spire-epic-theme="darkRoom"] .master-workspace,
      :root[data-spire-epic-theme="darkRoom"] .epic-overview-container,
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view){
        background:var(--epic-bg)!important;
        color:var(--epic-text)!important;
      }

      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(
        .spire-card,.epic-section-card,.epic-section-body,.summary-card,.summary-section,
        .overview-card,.overview-section,.snapshot-card,.snapshot-section,.clinical-card,
        .clinical-section,.problem-card,.problem-section,.risk-card,.safety-card,.advisory-card,
        .detail-card,.detail-panel,.note-card,.order-card,.care-plan-card,.timeline-card,
        .quick-card,.context-card,.modal-card,.master-dialog,.panel,.card,.widget,.tile,
        .table-wrap,.table-container
      ){
        background:var(--epic-card)!important;
        color:var(--epic-text)!important;
        border-color:var(--epic-line)!important;
        box-shadow:none!important;
      }

      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(
        .card-header,.panel-header,.section-header,.widget-header,.summary-header,
        .epic-section-header,.detail-header,.snapshot-header
      ){
        background:var(--epic-panel)!important;
        color:var(--epic-text)!important;
        border-color:var(--epic-line)!important;
      }

      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) table,
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) tbody,
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) tr,
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) td{
        background:var(--epic-card)!important;
        color:var(--epic-text)!important;
        border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) thead,
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) th{
        background:var(--epic-panel2)!important;
        color:var(--epic-text)!important;
        border-color:var(--epic-line)!important;
      }

      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(input,select,textarea){
        background:#081427!important;
        color:var(--epic-text)!important;
        border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(input,textarea)::placeholder{
        color:var(--epic-muted)!important;
        opacity:.88!important;
      }

      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(
        [style*="background:#fff" i],[style*="background: #fff" i],
        [style*="background:white" i],[style*="background: white" i],
        [style*="background:#ffffff" i],[style*="background: #ffffff" i],
        [style*="background-color:#fff" i],[style*="background-color: #fff" i],
        [style*="background-color:white" i],[style*="background-color: white" i],
        [style*="background-color:#ffffff" i],[style*="background-color: #ffffff" i]
      ){
        background:var(--epic-card)!important;
        color:var(--epic-text)!important;
        border-color:var(--epic-line)!important;
      }

      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) .${AUTO_SURFACE}{
        background:var(--epic-card)!important;
        background-image:none!important;
        color:var(--epic-text)!important;
        border-color:var(--epic-line)!important;
        box-shadow:none!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) .${AUTO_SURFACE}.${SEMANTIC_WARN}{
        background:var(--epic-warn-tint)!important;
        border-color:var(--epic-warn)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) .${AUTO_SURFACE}.${SEMANTIC_DANGER}{
        background:var(--epic-danger-tint)!important;
        border-color:var(--epic-danger)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) .${AUTO_SURFACE}.${SEMANTIC_SUCCESS}{
        background:var(--epic-success-tint)!important;
        border-color:var(--epic-success)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) .${AUTO_TEXT}{color:var(--epic-text)!important}
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) .${AUTO_MUTED}{color:var(--epic-muted)!important}

      /* Preserve clinical meaning while still using low-luminance Dark Room tints. */
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(.header-advisory,.warning,.warn,[class*="warning" i]){
        background:var(--epic-warn-tint)!important;
        color:var(--epic-warn)!important;
        border-color:var(--epic-warn)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(.header-problems,.critical,.danger,[class*="danger" i]){
        background:var(--epic-danger-tint)!important;
        color:var(--epic-danger)!important;
        border-color:var(--epic-danger)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(.success,.completed,[class*="success" i]){
        background:var(--epic-success-tint)!important;
        color:var(--epic-success)!important;
        border-color:var(--epic-success)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(.notification-badge,.spire-pill,[class*="badge" i],[class*="status" i]){
        box-shadow:none!important;
      }
    `;
    document.head.appendChild(style);
  }

  function parseRgb(value) {
    const match = String(value || '').match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d?(?:\.\d+)?))?\s*\)/i);
    if (!match) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] === undefined ? 1 : Number(match[4]),
    };
  }

  function luminance(rgb) {
    if (!rgb) return 0;
    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  }

  function isBrightSurface(style) {
    const rgb = parseRgb(style.backgroundColor);
    if (!rgb || rgb.a < 0.25) return false;
    return luminance(rgb) >= 0.72;
  }

  function isDarkText(style) {
    const rgb = parseRgb(style.color);
    if (!rgb || rgb.a < 0.25) return false;
    return luminance(rgb) <= 0.48;
  }

  function semanticClass(element) {
    const signature = `${element.id || ''} ${typeof element.className === 'string' ? element.className : ''}`.toLowerCase();
    if (/(warning|warn|risk|safety|advis|caution)/.test(signature)) return SEMANTIC_WARN;
    if (/(danger|critical|problem|allerg|contraind)/.test(signature)) return SEMANTIC_DANGER;
    if (/(success|complete|resolved|diet|nutrition)/.test(signature)) return SEMANTIC_SUCCESS;
    return '';
  }

  function shouldIgnoreSurface(element) {
    if (!(element instanceof HTMLElement)) return true;
    if (element.closest('#mar-view')) return true;
    if (element.matches('button,input,select,textarea,a,img,svg,canvas,video,iframe')) return true;
    if (element.matches('.notification-badge,.spire-pill,[class*="badge" i],[class*="status" i],[role="status"],[role="alert"]')) return true;
    return false;
  }

  function markText(surface) {
    const textNodes = surface.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,strong,b,small,label,legend,dt,dd,li,td,th');
    for (const element of textNodes) {
      if (!(element instanceof HTMLElement)) continue;
      if (element.closest('#mar-view')) continue;
      if (element.matches('a,button,.notification-badge,.spire-pill,[class*="badge" i],[class*="status" i],[role="status"],[role="alert"]')) continue;
      const hasDirectText = Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (!hasDirectText) continue;
      const style = getComputedStyle(element);
      if (!isDarkText(style)) continue;
      if (element.matches('.muted,.spire-muted,small,[class*="muted" i],[class*="subtitle" i],[class*="caption" i]')) element.classList.add(AUTO_MUTED);
      else element.classList.add(AUTO_TEXT);
    }
  }

  function normalizeView(view) {
    if (!(view instanceof HTMLElement) || view.id === 'mar-view') return;
    const candidates = [view, ...view.querySelectorAll('div,section,article,main,aside,header,footer,fieldset,table,thead,tbody,tr,td,th')];
    for (const element of candidates) {
      if (shouldIgnoreSurface(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 32 || rect.width * rect.height < 6000) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || !isBrightSurface(style)) continue;
      element.classList.add(AUTO_SURFACE);
      const semantic = semanticClass(element);
      if (semantic) element.classList.add(semantic);
      markText(element);
    }
  }

  function clearMarks() {
    document.querySelectorAll(`.${AUTO_SURFACE},.${AUTO_TEXT},.${AUTO_MUTED},.${SEMANTIC_WARN},.${SEMANTIC_DANGER},.${SEMANTIC_SUCCESS}`).forEach(element => {
      element.classList.remove(AUTO_SURFACE, AUTO_TEXT, AUTO_MUTED, SEMANTIC_WARN, SEMANTIC_DANGER, SEMANTIC_SUCCESS);
    });
  }

  function normalize() {
    ensureStyle();
    if (ROOT.dataset.spireEpicTheme !== 'darkRoom') {
      clearMarks();
      return;
    }
    document.querySelectorAll('.workspace-view').forEach(normalizeView);
  }

  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      normalize();
    });
  }

  ensureStyle();
  window.addEventListener('spire:theme-change', schedule);
  window.addEventListener('spire:company-change', schedule);
  document.addEventListener('click', event => {
    if (event.target.closest?.('.chart-tab,.summary-sub-tab,[data-view],[data-workspace]')) {
      requestAnimationFrame(() => requestAnimationFrame(schedule));
    }
  }, true);

  const rootObserver = new MutationObserver(schedule);
  rootObserver.observe(ROOT, { attributes: true, attributeFilter: ['data-spire-epic-theme'] });

  const contentObserver = new MutationObserver(schedule);
  const startContentObserver = () => {
    if (!document.body) return;
    contentObserver.observe(document.body, { childList: true, subtree: true });
    schedule();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startContentObserver, { once: true });
  else startContentObserver();

  window.SpireDarkRoomSurfaceCoverage = Object.freeze({ marker: MARKER, normalize: schedule });
})();
