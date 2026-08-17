(() => {
  'use strict';

  // SPIRE_FLOWSHEET_FILTER_DROPDOWN_V7
  // Interaction-only repair for the legacy/persistent Flowsheet filter control.
  // It never loads chart data, owns MAR/Orders, or replaces the live Flowsheet renderer.
  const MARKER = 'SPIRE_FLOWSHEET_FILTER_DROPDOWN_V7';
  const MENU_ID = 'spireFlowsheetFilterDropdownV7Menu';
  const HIDDEN_CLASS = 'spire-flowsheet-filter-v7-hidden';
  const ROOT = document.documentElement;
  let currentCategory = 'all';
  let menu = null;
  let raf = 0;
  let observer = null;

  const FALLBACK_OPTIONS = Object.freeze([
    ['all', 'Show All Tasks'],
    ['vitals', 'Vitals & Blood Glucose'],
    ['adls', 'ADLs & Personal Care Support'],
    ['meds', 'Medication Administration (eMAR)'],
    ['meal', 'Meal & Dysphagia Precautions'],
    ['seizure', 'Seizure & Neurological Check'],
    ['behavior', 'Behavioral & Elopement Support'],
    ['bowel', 'Bowel & Elimination Protocol'],
    ['community', 'Community Outings & Transport'],
    ['isp', 'ISP Goal Skill-Building'],
  ]);

  function ensureStyle() {
    if (document.getElementById('spireFlowsheetFilterDropdownV7Style')) return;
    const style = document.createElement('style');
    style.id = 'spireFlowsheetFilterDropdownV7Style';
    style.textContent = `
      .spire-flowsheet-filter-v7-hidden{display:none!important}
      #flowsheets-view .filter-dropdown[data-spire-filter-v7]{cursor:pointer;user-select:none;position:relative}
      #flowsheets-view .filter-dropdown[data-spire-filter-v7]:focus-visible{outline:2px solid #38bdf8!important;outline-offset:2px}
      #flowsheets-view .filter-dropdown[data-spire-filter-v7][aria-expanded="true"]{box-shadow:0 0 0 2px rgba(56,189,248,.36)!important}
      #${MENU_ID}{position:fixed;z-index:12000;display:none;min-width:285px;max-width:min(420px,calc(100vw - 24px));padding:5px;background:#f8fafc;color:#0f172a;border:1px solid #94a3b8;border-radius:4px;box-shadow:0 14px 36px rgba(15,23,42,.34);font:600 12px/1.25 "Segoe UI",Arial,sans-serif}
      #${MENU_ID}[data-open="true"]{display:block}
      #${MENU_ID} .spire-flow-filter-option{display:flex;align-items:center;width:100%;gap:8px;border:0;border-radius:3px;background:transparent;color:inherit;padding:8px 10px;text-align:left;cursor:pointer;font:inherit}
      #${MENU_ID} .spire-flow-filter-option:hover,#${MENU_ID} .spire-flow-filter-option:focus-visible{background:#e2e8f0;outline:none}
      #${MENU_ID} .spire-flow-filter-option[aria-selected="true"]{background:#dbeafe;color:#1e3a8a;box-shadow:inset 3px 0 0 #ec4899}
      #${MENU_ID} .spire-flow-filter-check{width:15px;color:#0f766e;font-weight:900}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID}{background:#0b1729;color:#f3f6fb;border-color:#3d526d;box-shadow:0 18px 48px rgba(0,0,0,.68)}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-filter-option:hover,
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-filter-option:focus-visible{background:#142942}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-filter-option[aria-selected="true"]{background:#26162e;color:#fff;box-shadow:inset 3px 0 0 #ec4899}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-filter-check{color:#5eead4}
    `;
    document.head.appendChild(style);
  }

  function dropdown() {
    const label = document.getElementById('activeFlowsheetFilterName');
    return label?.closest('.filter-dropdown') || null;
  }

  function tree() {
    return document.getElementById('flowsheetTreeMenu');
  }

  function options() {
    const items = Array.from(tree()?.querySelectorAll('.tree-item[data-category]') || [])
      .map((item) => [String(item.dataset.category || '').trim(), String(item.textContent || '').trim()])
      .filter(([category, label]) => category && label);
    return items.length ? items : FALLBACK_OPTIONS.map((item) => [...item]);
  }

  function optionLabel(category) {
    return options().find(([id]) => id === category)?.[1] || 'Show All Tasks';
  }

  function classify(text) {
    const value = String(text || '').toLowerCase();
    if (/(vital|blood glucose|glucose|temperature|pulse|blood pressure|spo2|oxygen saturation|pain|skin|wound|clinical monitoring)/.test(value)) return 'vitals';
    if (/(bathing|shower|dressing|groom|oral care|toilet|adl|personal care)/.test(value)) return 'adls';
    if (/(medication|emar|\bmar\b|dose|administration|treatment|\bprn\b)/.test(value)) return 'meds';
    if (/(meal|nutrition|diet|dysphagia|swallow|liquid consistency|bite-sized|bite sized|positioning|pacing)/.test(value)) return 'meal';
    if (/(seizure|neuro|neurological|rescue med|midazolam)/.test(value)) return 'seizure';
    if (/(behavior|mood|trigger|antecedent|de-escal|elopement|wandering|safety)/.test(value)) return 'behavior';
    if (/(bowel|elimination|stool|urine|urinary|intake\s*\/\s*output|output|void)/.test(value)) return 'bowel';
    if (/(community|outing|transport)/.test(value)) return 'community';
    if (/(\bisp\b|goal|outcome|skill-building|skill building|important to|important for|money management|independent task prompting)/.test(value)) return 'isp';
    return '';
  }

  function looksLikeGroupHeader(row) {
    if (!(row instanceof HTMLTableRowElement)) return false;
    if (row.matches('.row-header,.group-row,[data-group],[data-category]')) return true;
    if (row.querySelector('.row-header,.group-row,[data-group],[data-category]')) return true;
    const cells = Array.from(row.cells || []);
    if (!cells.length) return false;
    if (cells.some((cell) => Number(cell.colSpan || 1) > 1)) return true;
    const first = cells[0];
    const text = String(first?.textContent || '').trim();
    const remainingText = cells.slice(1).some((cell) => String(cell.textContent || '').trim());
    return text.length > 0 && text.length < 80 && !remainingText && !row.querySelector('input,textarea,select,button');
  }

  function tableBodies() {
    const host = document.getElementById('flowsheets-view');
    if (!host) return [];
    return Array.from(host.querySelectorAll('#flowsheetTable tbody,.flowsheet-table tbody,.flow-grid tbody'));
  }

  function filterRows(category) {
    for (const body of tableBodies()) {
      let activeGroup = '';
      Array.from(body.rows || []).forEach((row) => {
        const text = String(row.textContent || '').trim();
        const ownCategory = classify(text);
        if (looksLikeGroupHeader(row) && ownCategory) activeGroup = ownCategory;
        const rowCategory = ownCategory || activeGroup;
        const show = category === 'all' || rowCategory === category;
        row.classList.toggle(HIDDEN_CLASS, !show);
      });
    }
  }

  function syncTree(category) {
    tree()?.querySelectorAll('.tree-item[data-category]').forEach((item) => {
      const selected = item.dataset.category === category;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-current', selected ? 'true' : 'false');
    });
  }

  function syncLabel(category) {
    const label = document.getElementById('activeFlowsheetFilterName');
    if (label) label.textContent = `DSP Daily Documentation - ${optionLabel(category)}`;
  }

  function syncMenu() {
    if (!menu) return;
    menu.querySelectorAll('.spire-flow-filter-option').forEach((button) => {
      const selected = button.dataset.category === currentCategory;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      const check = button.querySelector('.spire-flow-filter-check');
      if (check) check.textContent = selected ? '✓' : '';
    });
  }

  function applyFilter(category, { close = true } = {}) {
    const valid = options().some(([id]) => id === category) ? category : 'all';
    currentCategory = valid;
    window.__spireFlowsheetFilterCategory = valid;
    syncTree(valid);
    syncLabel(valid);
    filterRows(valid);
    syncMenu();
    if (close) closeMenu();
    document.dispatchEvent(new CustomEvent('spire:flowsheet-filter-change', { detail: { category: valid, label: optionLabel(valid) } }));
  }

  function ensureMenu() {
    ensureStyle();
    if (menu?.isConnected) return menu;
    menu = document.getElementById(MENU_ID);
    if (!menu) {
      menu = document.createElement('div');
      menu.id = MENU_ID;
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-label', 'Flowsheet task group');
      document.body.appendChild(menu);
    }
    const html = options().map(([category, label]) => `
      <button type="button" class="spire-flow-filter-option" role="option" data-category="${category}" aria-selected="${category === currentCategory ? 'true' : 'false'}">
        <span class="spire-flow-filter-check" aria-hidden="true">${category === currentCategory ? '✓' : ''}</span>
        <span>${label.replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}</span>
      </button>`).join('');
    if (menu.innerHTML !== html) menu.innerHTML = html;
    return menu;
  }

  function positionMenu() {
    const trigger = dropdown();
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(285, Math.min(rect.width, 420));
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    const menuHeight = Math.min(menu.scrollHeight || 360, window.innerHeight - 24);
    const below = rect.bottom + 5;
    const top = below + menuHeight <= window.innerHeight - 8 ? below : Math.max(8, rect.top - menuHeight - 5);
    menu.style.top = `${top}px`;
    menu.style.maxHeight = `${Math.max(120, window.innerHeight - top - 8)}px`;
    menu.style.overflowY = 'auto';
  }

  function openMenu() {
    const trigger = dropdown();
    if (!trigger) return;
    ensureMenu();
    trigger.setAttribute('aria-expanded', 'true');
    menu.dataset.open = 'true';
    syncMenu();
    positionMenu();
    requestAnimationFrame(() => menu?.querySelector(`[data-category="${CSS.escape(currentCategory)}"]`)?.focus({ preventScroll: true }));
  }

  function closeMenu({ focusTrigger = false } = {}) {
    const trigger = dropdown();
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (menu) menu.dataset.open = 'false';
    if (focusTrigger) trigger?.focus({ preventScroll: true });
  }

  function toggleMenu() {
    if (menu?.dataset.open === 'true') closeMenu();
    else openMenu();
  }

  function enhance() {
    const trigger = dropdown();
    if (!trigger) return;
    ensureStyle();
    trigger.dataset.spireFilterV7 = MARKER;
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-haspopup', 'listbox');
    if (!trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');
    const saved = String(window.__spireFlowsheetFilterCategory || currentCategory || 'all');
    if (saved !== currentCategory) currentCategory = saved;
    syncTree(currentCategory);
    syncLabel(currentCategory);
    filterRows(currentCategory);
  }

  function scheduleEnhance() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; enhance(); });
  }

  document.addEventListener('click', (event) => {
    const trigger = dropdown();
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (trigger && trigger.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu();
      return;
    }

    const option = target.closest(`#${MENU_ID} .spire-flow-filter-option`);
    if (option) {
      event.preventDefault();
      applyFilter(String(option.dataset.category || 'all'));
      return;
    }

    const treeItem = target.closest('#flowsheetTreeMenu .tree-item[data-category]');
    if (treeItem) {
      event.preventDefault();
      applyFilter(String(treeItem.dataset.category || 'all'));
      return;
    }

    if (menu?.dataset.open === 'true' && !menu.contains(target)) closeMenu();
  }, true);

  document.addEventListener('keydown', (event) => {
    const trigger = dropdown();
    if (trigger && event.target === trigger && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
      event.preventDefault();
      openMenu();
      return;
    }
    if (menu?.dataset.open === 'true' && event.key === 'Escape') {
      event.preventDefault();
      closeMenu({ focusTrigger: true });
      return;
    }
    if (menu?.dataset.open === 'true' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const buttons = Array.from(menu.querySelectorAll('.spire-flow-filter-option'));
      if (!buttons.length) return;
      event.preventDefault();
      const index = Math.max(0, buttons.indexOf(document.activeElement));
      const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
      buttons[next].focus({ preventScroll: true });
    }
  }, true);

  window.addEventListener('resize', () => { if (menu?.dataset.open === 'true') positionMenu(); });
  window.addEventListener('scroll', () => { if (menu?.dataset.open === 'true') positionMenu(); }, true);
  window.addEventListener('spire:theme-change', scheduleEnhance);

  function start() {
    ensureStyle();
    scheduleEnhance();
    if (observer) observer.disconnect();
    observer = new MutationObserver((records) => {
      if (records.some((record) => record.type === 'childList' && (record.addedNodes.length || record.removedNodes.length))) scheduleEnhance();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.SpireFlowsheetFilterDropdownV7 = Object.freeze({
    marker: MARKER,
    apply: (category) => applyFilter(String(category || 'all')),
    open: openMenu,
    close: closeMenu,
    refresh: scheduleEnhance,
  });
})();
