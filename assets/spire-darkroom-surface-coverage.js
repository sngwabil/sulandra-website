(() => {
  'use strict';

  // SPIRE_DARKROOM_SURFACE_COVERAGE_V1
  // SPIRE_DARKROOM_CONTRAST_V2
  // Dark Room must remain a genuinely low-light clinical workspace while
  // keeping every clinical label, narrative and data value readable.
  // MAR is intentionally excluded: its canonical hourly runtime owns its own
  // visual semantics and is not rewritten by this generic workspace layer.
  const MARKER = 'SPIRE_DARKROOM_CONTRAST_V2';
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
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
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

      :root[data-spire-epic-theme="darkRoom"] .workspace-view:not(#mar-view) :is(input,select,textarea),
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal :is(input,select,textarea){
        background:#081427!important;
        color:var(--epic-text)!important;
        border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) :is(input,textarea)::placeholder{
        color:var(--epic-muted)!important;
        opacity:.9!important;
      }

      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) :is(
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

      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) .${AUTO_SURFACE}{
        background:var(--epic-card)!important;
        background-image:none!important;
        color:var(--epic-text)!important;
        border-color:var(--epic-line)!important;
        box-shadow:none!important;
      }
      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) .${AUTO_SURFACE}.${SEMANTIC_WARN}{
        background:var(--epic-warn-tint)!important;
        border-color:var(--epic-warn)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) .${AUTO_SURFACE}.${SEMANTIC_DANGER}{
        background:var(--epic-danger-tint)!important;
        border-color:var(--epic-danger)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) .${AUTO_SURFACE}.${SEMANTIC_SUCCESS}{
        background:var(--epic-success-tint)!important;
        border-color:var(--epic-success)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) .${AUTO_TEXT}{
        color:var(--epic-text)!important;
        -webkit-text-fill-color:var(--epic-text)!important;
        opacity:1!important;
      }
      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) .${AUTO_MUTED}{
        color:var(--epic-muted)!important;
        -webkit-text-fill-color:var(--epic-muted)!important;
        opacity:1!important;
      }

      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) .${SEMANTIC_WARN} .${AUTO_TEXT}{color:#ffd28a!important;-webkit-text-fill-color:#ffd28a!important}
      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) .${SEMANTIC_DANGER} .${AUTO_TEXT}{color:#ffb3c0!important;-webkit-text-fill-color:#ffb3c0!important}
      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) .${SEMANTIC_SUCCESS} .${AUTO_TEXT}{color:#a8f3c2!important;-webkit-text-fill-color:#a8f3c2!important}

      /* Intake/H&P is rendered outside workspace-view, so theme it explicitly. */
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal .modal-card,
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal .modal-body,
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal .intake-shell,
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal .intake-start,
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal .intake-workspace,
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal .intake-main,
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal .intake-side,
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal .intake-nav{
        background:var(--epic-bg)!important;
        color:var(--epic-text)!important;
        border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal .modal-header{
        background:var(--epic-title)!important;
        color:var(--epic-text)!important;
        border-bottom:2px solid var(--epic-accent)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal :is(.intake-section,.intake-control,.intake-review-card,.intake-document-card){
        background:var(--epic-card)!important;
        color:var(--epic-text)!important;
        border-color:var(--epic-line)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal :is(.intake-start-grid label,.intake-control label,.intake-group-label,.spire-section-title h3,.spire-section-title p){
        color:var(--epic-text)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #hpAdmissionModal .intake-group-label{color:var(--epic-muted)!important}

      /* Preserve clinical meaning while using low-luminance Dark Room tints. */
      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) :is(.header-advisory,.warning,.warn,[class*="warning" i]){
        background:var(--epic-warn-tint)!important;
        color:var(--epic-warn)!important;
        border-color:var(--epic-warn)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) :is(.header-problems,.critical,.danger,[class*="danger" i]){
        background:var(--epic-danger-tint)!important;
        color:var(--epic-danger)!important;
        border-color:var(--epic-danger)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) :is(.success,.completed,[class*="success" i]){
        background:var(--epic-success-tint)!important;
        color:var(--epic-success)!important;
        border-color:var(--epic-success)!important;
      }
      :root[data-spire-epic-theme="darkRoom"] :is(.workspace-view:not(#mar-view),#hpAdmissionModal) :is(.notification-badge,.spire-pill,[class*="badge" i],[class*="status" i]){
        box-shadow:none!important;
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

  function isBrightSurface(style) {
    const rgb = parseRgb(style.backgroundColor);
    return !!rgb && rgb.a >= 0.25 && luminance(rgb) >= 0.58;
  }

  function isDarkText(style) {
    const rgb = parseRgb(style.color);
    return !!rgb && rgb.a >= 0.25 && luminance(rgb) <= 0.52;
  }

  function semanticClass(element) {
    const signature = `${element.id || ''} ${typeof element.className === 'string' ? element.className : ''}`.toLowerCase();
    if (/(warning|warn|risk|safety|advis|caution)/.test(signature)) return SEMANTIC_WARN;
    if (/(danger|critical|problem|allerg|contraind)/.test(signature)) return SEMANTIC_DANGER;
    if (/(success|complete|resolved|diet|nutrition)/.test(signature)) return SEMANTIC_SUCCESS;
    return '';
  }

  function isMar(element) {
    return !!element.closest?.('#mar-view');
  }

  function shouldIgnoreSurface(element) {
    if (!(element instanceof HTMLElement) || isMar(element)) return true;
    if (element.matches('button,input,select,textarea,a,img,svg,canvas,video,iframe')) return true;
    if (element.matches('.notification-badge,.spire-pill,[class*="badge" i],[class*="status" i],[role="status"],[role="alert"]')) return true;
    if (element.closest('.lda-avatar,.wound-avatar,.body-avatar,[class*="body-map" i],[class*="anatom" i]')) return true;
    return false;
  }

  function markText(root) {
    const textNodes = root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,strong,b,small,label,legend,dt,dd,li,td,th,pre,code,div');
    for (const element of textNodes) {
      if (!(element instanceof HTMLElement) || isMar(element)) continue;
      if (element.matches('a,button,input,select,textarea,.notification-badge,.spire-pill,[class*="badge" i],[class*="status" i],[role="status"],[role="alert"]')) continue;
      const hasDirectText = Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (!hasDirectText) continue;
      const style = getComputedStyle(element);
      if (!isDarkText(style)) continue;
      if (element.matches('.muted,.spire-muted,small,[class*="muted" i],[class*="subtitle" i],[class*="caption" i],[class*="meta" i]')) element.classList.add(AUTO_MUTED);
      else element.classList.add(AUTO_TEXT);
    }
  }

  function normalizeRoot(root) {
    if (!(root instanceof HTMLElement) || root.id === 'mar-view') return;
    const candidates = [root, ...root.querySelectorAll('div,section,article,main,aside,header,footer,fieldset,table,thead,tbody,tr,td,th')];
    for (const element of candidates) {
      if (shouldIgnoreSurface(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 48 || rect.height < 18 || rect.width * rect.height < 1600) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || !isBrightSurface(style)) continue;
      element.classList.add(AUTO_SURFACE);
      const semantic = semanticClass(element);
      if (semantic) element.classList.add(semantic);
    }
    // Critical V2 fix: normalize text across the entire dark workspace, not only
    // inside elements that were previously bright. This catches legacy navy,
    // teal and gray text already rendered on dark cards.
    markText(root);
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
    document.querySelectorAll('.workspace-view:not(#mar-view)').forEach(normalizeRoot);
    const intake = document.getElementById('hpAdmissionModal');
    if (intake) normalizeRoot(intake);
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
    if (event.target.closest?.('.chart-tab,.summary-sub-tab,[data-view],[data-workspace],#hpAdmissionModal')) {
      requestAnimationFrame(() => requestAnimationFrame(schedule));
    }
  }, true);

  const rootObserver = new MutationObserver(schedule);
  rootObserver.observe(ROOT, { attributes:true, attributeFilter:['data-spire-epic-theme'] });

  const contentObserver = new MutationObserver(schedule);
  const startContentObserver = () => {
    if (!document.body) return;
    contentObserver.observe(document.body, { childList:true, subtree:true });
    schedule();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startContentObserver, { once:true });
  else startContentObserver();

  window.SpireDarkRoomSurfaceCoverage = Object.freeze({ marker:MARKER, normalize:schedule });
})();
