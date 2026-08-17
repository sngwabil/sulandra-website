(() => {
  'use strict';

  // SPIRE_DARKROOM_FLOWSHEET_LABELS_V6
  // Visual-only repair for live Flowsheet label cells that repaint themselves
  // with inline light styles after the Dark Room theme has already loaded.
  const MARKER = 'SPIRE_DARKROOM_FLOWSHEET_LABELS_V6';
  const ROOT = document.documentElement;
  const originals = new WeakMap();
  const touched = new Set();
  let raf = 0;

  const PALETTE = Object.freeze({
    adl: '#0c2930',
    behavior: '#26162e',
    bowel: '#111a38',
    clinical: '#10291f',
    medication: '#2b151e',
    nutrition: '#202713',
    neuro: '#0b2138',
    isp: '#1e1835',
    default: '#0d1a2d',
  });

  const PROPS = [
    'background', 'background-color', 'background-image',
    'color', '-webkit-text-fill-color', 'border-color'
  ];

  function category(text) {
    const value = String(text || '').toLowerCase();
    if (/(bathing|shower|dressing|groom|oral care|toilet|adl|personal care)/.test(value)) return 'adl';
    if (/(behavior|mood|trigger|antecedent|de-escal|elopement|safety)/.test(value)) return 'behavior';
    if (/(bowel|elimination|stool|fluid intake|hydration|urinary|void)/.test(value)) return 'bowel';
    if (/(clinical monitoring|pain|skin|wound|temperature|pulse|blood pressure|spo2|glucose|vital)/.test(value)) return 'clinical';
    if (/(medication|emar|mar|dose|administration)/.test(value)) return 'medication';
    if (/(meal|nutrition|diet|dysphagia|swallow)/.test(value)) return 'nutrition';
    if (/(seizure|neuro|neurological)/.test(value)) return 'neuro';
    if (/(isp|goal|outcome|skill-building|skill building)/.test(value)) return 'isp';
    return 'default';
  }

  function capture(element) {
    if (originals.has(element)) return;
    const snapshot = {};
    for (const prop of PROPS) {
      snapshot[prop] = {
        value: element.style.getPropertyValue(prop),
        priority: element.style.getPropertyPriority(prop),
      };
    }
    originals.set(element, snapshot);
    touched.add(element);
  }

  function force(element, background, color = '#f2f5fb', border = '#33465f') {
    if (!(element instanceof HTMLElement)) return;
    capture(element);
    element.style.setProperty('background', background, 'important');
    element.style.setProperty('background-color', background, 'important');
    element.style.setProperty('background-image', 'none', 'important');
    element.style.setProperty('color', color, 'important');
    element.style.setProperty('-webkit-text-fill-color', color, 'important');
    element.style.setProperty('border-color', border, 'important');
    element.dataset.spireDarkroomFlowsheetLabelV6 = 'true';
  }

  function forceChildren(cell) {
    cell.querySelectorAll('div,span,p,strong,b,small').forEach(child => {
      if (!(child instanceof HTMLElement)) return;
      const isMuted = child.matches('small') || /description|detail|sub/i.test(child.className || '');
      force(child, 'transparent', isMuted ? '#b7c4d8' : '#f2f5fb', 'transparent');
    });
  }

  function ensureNurseSurfaceStyle() {
    let style = document.getElementById('spireDarkroomNurseFlowsheetSurfaceV6');
    if (style) return style;
    style = document.createElement('style');
    style.id = 'spireDarkroomNurseFlowsheetSurfaceV6';
    style.textContent = `
      html[data-spire-epic-theme="darkRoom"] #flowsheets-view[data-spire-darkroom-nurse-flowsheet="true"] #headerTimeRow > th:first-child,
      html[data-spire-epic-theme="darkRoom"] #flowsheets-view[data-spire-darkroom-nurse-flowsheet="true"] #headerDateRow > th:first-child{
        background:#10243b!important;background-color:#10243b!important;background-image:none!important;
        color:#f2f5fb!important;-webkit-text-fill-color:#f2f5fb!important;border-color:#33465f!important;
      }
      html[data-spire-epic-theme="darkRoom"] #flowsheets-view[data-spire-darkroom-nurse-flowsheet="true"] #flowsheetTbody tr.flow-section-row > td{
        background:#10291f!important;background-color:#10291f!important;background-image:none!important;
        color:#f2f5fb!important;-webkit-text-fill-color:#f2f5fb!important;border-color:#33465f!important;
      }
      html[data-spire-epic-theme="darkRoom"] #flowsheets-view[data-spire-darkroom-nurse-flowsheet="true"] #flowsheetTbody tr:not(.flow-section-row) > td:first-child,
      html[data-spire-epic-theme="darkRoom"] #flowsheets-view[data-spire-darkroom-nurse-flowsheet="true"] #flowsheetTbody tr:not(.flow-section-row) > th:first-child{
        background:#0d1a2d!important;background-color:#0d1a2d!important;background-image:none!important;
        color:#f2f5fb!important;-webkit-text-fill-color:#f2f5fb!important;border-color:#33465f!important;
      }
      html[data-spire-epic-theme="darkRoom"] #flowsheets-view[data-spire-darkroom-nurse-flowsheet="true"] #flowsheetTbody tr:not(.flow-section-row) > td:first-child b,
      html[data-spire-epic-theme="darkRoom"] #flowsheets-view[data-spire-darkroom-nurse-flowsheet="true"] #flowsheetTbody tr:not(.flow-section-row) > td:first-child strong{
        background:transparent!important;color:#f2f5fb!important;-webkit-text-fill-color:#f2f5fb!important;
      }
      html[data-spire-epic-theme="darkRoom"] #flowsheets-view[data-spire-darkroom-nurse-flowsheet="true"] #flowsheetTbody tr:not(.flow-section-row) > td:first-child div,
      html[data-spire-epic-theme="darkRoom"] #flowsheets-view[data-spire-darkroom-nurse-flowsheet="true"] #flowsheetTbody tr:not(.flow-section-row) > td:first-child small{
        background:transparent!important;color:#b7c4d8!important;-webkit-text-fill-color:#b7c4d8!important;
      }
    `;
    document.head.appendChild(style);
    return style;
  }

  function isNurseView(host) {
    const selectedRole = window.SpireFlowsheetRoleSelector?.getRole?.();
    if (selectedRole === 'nurse') return true;
    const header = host?.querySelector?.('#headerTimeRow > th:first-child')?.textContent || '';
    const label = host?.querySelector?.('#activeFlowsheetFilterName')?.textContent || '';
    return /^\s*Nurse Flowsheets\b/i.test(header) || /^\s*Nurse Flowsheets\b/i.test(label);
  }

  function restoreAll() {
    for (const element of Array.from(touched)) {
      const snapshot = originals.get(element);
      if (!snapshot) {
        touched.delete(element);
        continue;
      }
      for (const prop of PROPS) {
        const original = snapshot[prop];
        if (original?.value) element.style.setProperty(prop, original.value, original.priority || '');
        else element.style.removeProperty(prop);
      }
      delete element.dataset.spireDarkroomFlowsheetLabelV6;
      originals.delete(element);
      touched.delete(element);
    }
    document.getElementById('flowsheets-view')?.removeAttribute('data-spire-darkroom-nurse-flowsheet');
  }

  function normalize() {
    if (ROOT.dataset.spireEpicTheme !== 'darkRoom') {
      restoreAll();
      return;
    }

    const host = document.getElementById('flowsheets-view');
    if (!host) return;

    ensureNurseSurfaceStyle();
    host.dataset.spireDarkroomNurseFlowsheet = isNurseView(host) ? 'true' : 'false';

    const cells = new Set([
      ...host.querySelectorAll('#flowsheetTable thead tr > th:first-child'),
      ...host.querySelectorAll('#flowsheetTable tbody tr > td:first-child'),
      ...host.querySelectorAll('#flowsheetTable tbody tr > th:first-child'),
      ...host.querySelectorAll('.flowsheet-table tr > :first-child'),
      ...host.querySelectorAll('.flow-grid tr > :first-child'),
      ...host.querySelectorAll('.row-header,.sub-row-header,[data-row-label],[data-task-label]'),
    ]);

    for (const cell of cells) {
      if (!(cell instanceof HTMLElement)) continue;
      const key = category(cell.textContent);
      force(cell, PALETTE[key] || PALETTE.default);
      forceChildren(cell);
    }

    host.querySelectorAll('tbody tr').forEach(row => {
      if (!(row instanceof HTMLElement)) return;
      const key = category(row.textContent);
      const first = row.querySelector(':scope > td:first-child, :scope > th:first-child');
      if (first instanceof HTMLElement && key !== 'default') {
        force(first, PALETTE[key]);
        forceChildren(first);
      }
    });
  }

  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; normalize(); });
  }

  window.addEventListener('spire:theme-change', schedule);
  window.addEventListener('spire:company-change', schedule);
  document.addEventListener('click', () => requestAnimationFrame(() => requestAnimationFrame(schedule)), true);
  new MutationObserver(schedule).observe(ROOT, { attributes:true, attributeFilter:['data-spire-epic-theme'] });

  const start = () => {
    if (!document.body) return;
    new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['style','class'] });
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.SpireDarkRoomFlowsheetLabelsV6 = Object.freeze({ marker:MARKER, normalize:schedule, restore:restoreAll });
})();
