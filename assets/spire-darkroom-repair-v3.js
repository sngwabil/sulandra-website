(() => {
  'use strict';

  // SPIRE_DARKROOM_REPAIR_V3
  // Supplemental low-light repair loaded after the canonical theme/runtime layers.
  // MAR is CSS-only here: no MAR DOM ownership, fetch, observer wake, or render path.
  const MARKER = 'SPIRE_DARKROOM_REPAIR_V3';
  const ROOT = document.documentElement;
  const STYLE_ID = 'spireDarkRoomRepairV3Style';
  const SUMMARY_TOUCH = 'spireDarkRoomRepairV3Touched';
  const SUMMARY_SURFACE = 'spire-darkroom-v3-summary-surface';
  let raf = 0;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.dataset.spireDarkroomRepair = MARKER;
    style.textContent = `
      /* Canonical hourly MAR: Dark Room palette only. Status/admin semantics remain owned by spire-mar-timeline.js. */
      :root[data-spire-epic-theme="darkRoom"] #mar-view,
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-v4,
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-scroll{
        background:#071426!important;color:#f2f5fb!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-commandbar,
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-filterbar,
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-legend{
        background:#101e36!important;border-color:#3a4a63!important;color:#dce7f3!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-command,
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-filter{
        background:#13233d!important;color:#edf4fb!important;border-color:#52627a!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-filter.active{
        color:#5ce7ff!important;border-bottom-color:#1fd2ff!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-time-header,
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-medication-header,
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-time-label{
        background:#13233d!important;color:#e1ebf5!important;border-color:#3a4a63!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-medication-row,
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-medication-summary,
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-row-meta{
        background:#0d1930!important;color:#e4edf7!important;border-color:#3a4a63!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-med-name{color:#6ee7f2!important}
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-med-details,
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-med-instructions{color:#cbd8e6!important}
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-mar-hour-cell.blank{
        background:#101e36!important;color:#e8eef6!important;border-color:#3a4a63!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-pcp-profile-row{
        background:#0d1930!important;border-color:#3a4a63!important;
      }
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-pcp-profile-copy>b{color:#aebbd0!important}
      :root[data-spire-epic-theme="darkRoom"] #mar-view .spire-pcp-profile-copy>span{color:#73cef5!important}

      /* Summary-specific hard stop for high-luminance headers that carry stronger legacy styles. */
      :root[data-spire-epic-theme="darkRoom"] body #summary-view :is(
        .epic-section-header,.summary-header,.snapshot-header,.clinical-snapshot-header,
        [class*="snapshot-header" i],[class*="snapshot-title" i]
      ),
      :root[data-spire-epic-theme="darkRoom"] body #summary-view .${SUMMARY_SURFACE}{
        background:#101e36!important;background-image:none!important;
        color:#f2f5fb!important;-webkit-text-fill-color:#f2f5fb!important;
        border-color:#3a4a63!important;opacity:1!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body #summary-view :is(
        .epic-section-header,.summary-header,.snapshot-header,.clinical-snapshot-header,
        [class*="snapshot-header" i],[class*="snapshot-title" i]
      ) :is(h1,h2,h3,h4,h5,h6,p,span,strong,b,small,label),
      :root[data-spire-epic-theme="darkRoom"] body #summary-view .${SUMMARY_SURFACE} :is(h1,h2,h3,h4,h5,h6,p,span,strong,b,small,label){
        color:#f2f5fb!important;-webkit-text-fill-color:#f2f5fb!important;opacity:1!important;
      }
      :root[data-spire-epic-theme="darkRoom"] body #summary-view .spire-pill:not(.critical):not(.danger):not(.success):not(.warning){
        background:#13233d!important;color:#e8f1fa!important;-webkit-text-fill-color:#e8f1fa!important;border-color:#52627a!important;
      }
    `;
    document.head.appendChild(style);
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

  function isBrightColor(value, minimumAlpha=0.3) {
    const rgb = parseRgb(value);
    return !!rgb && rgb.a >= minimumAlpha && luminance(rgb) >= 0.62;
  }

  function hasBrightBackground(style) {
    if (isBrightColor(style.backgroundColor)) return true;
    const image = String(style.backgroundImage || '');
    if (!image || image === 'none') return false;
    const colors = image.match(/rgba?\([^)]*\)/gi) || [];
    return colors.some(color => isBrightColor(color, 0.2));
  }

  function isSemantic(element) {
    const signature = `${element.id || ''} ${typeof element.className === 'string' ? element.className : ''}`.toLowerCase();
    return /(warning|warn|risk|safety|danger|critical|problem|success|complete|resolved|allerg)/.test(signature);
  }

  function rememberStyle(element) {
    if (element.dataset[SUMMARY_TOUCH] !== undefined) return;
    element.dataset[SUMMARY_TOUCH] = element.getAttribute('style') || '';
  }

  function repairSummary() {
    const summary = document.getElementById('summary-view');
    if (!summary) return;
    const candidates = [summary, ...summary.querySelectorAll('div,section,article,header,footer,table,thead,tbody,tr,td,th')];
    for (const element of candidates) {
      if (!(element instanceof HTMLElement) || isSemantic(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 18 || rect.width * rect.height < 1800) continue;
      const computed = getComputedStyle(element);
      if (computed.display === 'none' || computed.visibility === 'hidden' || !hasBrightBackground(computed)) continue;
      rememberStyle(element);
      element.classList.add(SUMMARY_SURFACE);
      element.style.setProperty('background', '#0d1930', 'important');
      element.style.setProperty('background-image', 'none', 'important');
      element.style.setProperty('color', '#f2f5fb', 'important');
      element.style.setProperty('-webkit-text-fill-color', '#f2f5fb', 'important');
      element.style.setProperty('border-color', '#3a4a63', 'important');
      element.style.setProperty('opacity', '1', 'important');
    }
  }

  function restoreSummary() {
    document.querySelectorAll('[data-spire-dark-room-repair-v3-touched]').forEach(element => {
      const original = element.dataset[SUMMARY_TOUCH] ?? '';
      if (original) element.setAttribute('style', original);
      else element.removeAttribute('style');
      element.classList.remove(SUMMARY_SURFACE);
      delete element.dataset[SUMMARY_TOUCH];
    });
  }

  function normalize() {
    ensureStyle();
    if (ROOT.dataset.spireEpicTheme === 'darkRoom') repairSummary();
    else restoreSummary();
  }

  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; normalize(); });
  }

  ensureStyle();
  window.addEventListener('spire:theme-change', schedule);
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('.chart-tab,.summary-sub-tab')) {
      requestAnimationFrame(() => requestAnimationFrame(schedule));
    }
  }, true);
  const observer = new MutationObserver(schedule);
  const start = () => {
    if (!document.body) return;
    observer.observe(document.body, { childList:true, subtree:true });
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.SpireDarkRoomRepairV3 = Object.freeze({ marker:MARKER, normalize:schedule });
})();
