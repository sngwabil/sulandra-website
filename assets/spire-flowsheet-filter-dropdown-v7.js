(() => {
  'use strict';

  // SPIRE_FLOWSHEET_SET_SELECTOR_V10
  // Drives the native SPIRE Flowsheet renderer; it does not create a second charting grid.
  const MARKER = 'SPIRE_FLOWSHEET_SET_SELECTOR_V10';
  const MENU_ID = 'spireFlowsheetSetSelectorV10Menu';
  const TRIGGER_ID = 'spireFlowsheetSetSelectorV10Trigger';
  const STYLE_ID = 'spireFlowsheetSetSelectorV10Style';
  const HIDDEN_CLASS = 'spire-flowsheet-set-v10-hidden';
  const SET_KEY = 'spire:flowsheet:selected-set:v10';
  const CATEGORY_KEY = 'spire:flowsheet:selected-category:v10';
  const LEGACY_SET_KEY = 'spire:flowsheet:selected-set:v9';
  const LEGACY_CATEGORY_KEY = 'spire:flowsheet:selected-category:v9';

  const SETS = Object.freeze([
    ['dsp', 'DSP Daily Documentation', 'DSP, waiver and direct-care daily charting'],
    ['nurse', 'Nurse / Skilled Nursing', 'RN/LPN assessment, monitoring, treatments and follow-up'],
    ['all', 'All Clinical Documentation', 'Every backend-defined Flowsheet row available for this client'],
    ['vitals', 'Vitals & Clinical Monitoring', 'Vitals, pain and clinical surveillance'],
    ['respiratory', 'Respiratory / Oxygen', 'Lung sounds, oxygen and respiratory monitoring'],
    ['woundDevices', 'Wound / Skin / Lines & Devices', 'Skin, wounds, Foley, feeding tubes, IV/PICC and devices'],
    ['diabetes', 'Diabetes / Blood Glucose', 'Blood glucose and diabetes monitoring'],
    ['neuro', 'Neurologic / Seizure', 'Neurologic and seizure documentation'],
    ['io', 'Intake / Output & Elimination', 'Hydration, GI/GU, urine and bowel documentation'],
    ['medTreatment', 'Medication / Treatment', 'Medication reconciliation, treatments and effectiveness'],
    ['mobility', 'Mobility / Fall Risk', 'Mobility, transfers, positioning and fall risk'],
  ]);

  const FALLBACK_CATEGORIES = Object.freeze([
    ['all', 'Show All Tasks'],
    ['vitals', 'Vitals & Blood Glucose'],
    ['adls', 'ADLs & Personal Care Support'],
    ['meds', 'Medication Administration (eMAR)'],
    ['meals', 'Meal & Dysphagia Precautions'],
    ['seizure', 'Seizure & Neurological Check'],
    ['behavior', 'Behavioral & Elopement Support'],
    ['bowel', 'Bowel & Elimination Protocol'],
    ['community', 'Community Outings & Transport'],
    ['isp', 'ISP Goal Skill-Building'],
  ]);

  let currentSet = readSession(SET_KEY, readSession(LEGACY_SET_KEY, 'dsp'));
  let currentCategory = readSession(CATEGORY_KEY, readSession(LEGACY_CATEGORY_KEY, 'all'));
  let menu = null;
  let observer = null;
  let raf = 0;
  let filtering = false;

  function readSession(key, fallback) {
    try { return sessionStorage.getItem(key) || fallback; } catch (_) { return fallback; }
  }

  function writeSession(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_) {}
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function flowsheetHost() {
    return document.getElementById('flowsheets-view');
  }

  function setDefinition(id) {
    return SETS.find(([setId]) => setId === id) || SETS[0];
  }

  function setLabel(id) {
    return setDefinition(id)[1];
  }

  function tree() {
    return document.getElementById('flowsheetTreeMenu');
  }

  function categoryOptions() {
    const found = Array.from(tree()?.querySelectorAll('.tree-item[data-category]') || [])
      .map((item) => [String(item.dataset.category || '').trim(), String(item.textContent || '').trim()])
      .filter(([id, label]) => id && label);
    return found.length ? found : FALLBACK_CATEGORIES.map((item) => [...item]);
  }

  function categoryLabel(id) {
    return categoryOptions().find(([category]) => category === id)?.[1] || 'Show All Tasks';
  }

  function desiredLabel() {
    return currentSet === 'dsp'
      ? `${setLabel(currentSet)} - ${categoryLabel(currentCategory)}`
      : `${setLabel(currentSet)} - Show All`;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${HIDDEN_CLASS}{display:none!important}
      #flowsheets-view .filter-dropdown[data-spire-flowsheet-set-v10]{position:relative;cursor:pointer;user-select:none}
      #flowsheets-view .filter-dropdown[data-spire-flowsheet-set-v10]:focus-visible{outline:2px solid #38bdf8!important;outline-offset:2px}
      #flowsheets-view[data-spire-flowsheet-set]:not([data-spire-flowsheet-set="dsp"]) .flow-workspace{grid-template-columns:minmax(0,1fr)!important}
      #flowsheets-view[data-spire-flowsheet-set]:not([data-spire-flowsheet-set="dsp"]) .flow-groups{display:none!important}
      #${TRIGGER_ID}{display:inline-flex;align-items:center;gap:8px;max-width:min(520px,90%);margin:0 0 8px;padding:7px 10px;border:1px solid #7f9db9;border-radius:4px;background:#f7fbff;color:#173c55;font:700 12px/1.2 "Segoe UI",Arial,sans-serif}
      #${TRIGGER_ID} #activeFlowsheetFilterName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${MENU_ID}{position:absolute;z-index:12000;display:none;top:calc(100% + 4px);left:0;width:min(390px,calc(100vw - 24px));max-height:min(470px,70vh);overflow:auto;padding:5px;background:#f8fafc;color:#0f172a;border:1px solid #94a3b8;border-radius:5px;box-shadow:0 12px 30px rgba(15,23,42,.34);font:600 12px/1.22 "Segoe UI",Arial,sans-serif;overscroll-behavior:contain}
      #${MENU_ID}[data-open="true"]{display:block}
      #${MENU_ID} .spire-flow-menu-title{position:sticky;top:0;z-index:1;padding:6px 9px 4px;background:inherit;color:#475569;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      #${MENU_ID} .spire-flow-menu-divider{height:1px;background:#cbd5e1;margin:4px}
      #${MENU_ID} .spire-flow-option{display:grid;grid-template-columns:18px minmax(0,1fr);width:100%;gap:7px;border:0;border-radius:3px;background:transparent;color:inherit;padding:7px 9px;text-align:left;cursor:pointer;font:inherit}
      #${MENU_ID} .spire-flow-option:hover,#${MENU_ID} .spire-flow-option:focus-visible{background:#e2e8f0;outline:none}
      #${MENU_ID} .spire-flow-option[aria-selected="true"]{background:#dbeafe;color:#1e3a8a;box-shadow:inset 3px 0 0 #ec4899}
      #${MENU_ID} .spire-flow-check{width:15px;color:#0f766e;font-weight:900}
      #${MENU_ID} .spire-flow-option-label{display:block;font-weight:700}
      #${MENU_ID} .spire-flow-option-desc{display:block;margin-top:1px;color:#64748b;font-size:10px;font-weight:500;white-space:normal}
      :root[data-spire-epic-theme="darkRoom"] #${TRIGGER_ID},:root[data-spire-epic-theme="darkRoom"] #${MENU_ID}{background:#0b1729;color:#f3f6fb;border-color:#3d526d}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-option:hover,:root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-option:focus-visible{background:#142942}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-option[aria-selected="true"]{background:#26162e;color:#fff}
    `;
    document.head.appendChild(style);
  }

  function labelNode() {
    return document.getElementById('activeFlowsheetFilterName');
  }

  function ensureTrigger() {
    ensureStyle();
    let label = labelNode();
    let trigger = label?.closest('.filter-dropdown') || null;
    const host = flowsheetHost();

    if (!trigger && host && host.querySelector('.flow-workspace')) {
      trigger = document.createElement('div');
      trigger.id = TRIGGER_ID;
      trigger.className = 'filter-dropdown';
      trigger.innerHTML = '<span id="activeFlowsheetFilterName"></span><span aria-hidden="true">▼</span>';
      const workspace = host.querySelector('.flow-workspace');
      workspace.parentNode.insertBefore(trigger, workspace);
      label = labelNode();
    }

    if (!trigger) return null;
    trigger.removeAttribute('data-spire-filter-v7');
    trigger.removeAttribute('data-spire-flowsheet-set-v8');
    trigger.removeAttribute('data-spire-flowsheet-set-v9');
    trigger.dataset.spireFlowsheetSetV10 = MARKER;
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-haspopup', 'listbox');
    if (!trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');
    if (label) label.textContent = desiredLabel();
    return trigger;
  }

  function dropdown() {
    return labelNode()?.closest('.filter-dropdown') || ensureTrigger();
  }

  function menuHtml() {
    const sets = SETS.map(([id, label, description]) => `
      <button type="button" class="spire-flow-option spire-flow-set-option" role="option" data-set="${esc(id)}" aria-selected="${id === currentSet ? 'true' : 'false'}">
        <span class="spire-flow-check" aria-hidden="true">${id === currentSet ? '✓' : ''}</span>
        <span><span class="spire-flow-option-label">${esc(label)}</span><span class="spire-flow-option-desc">${esc(description)}</span></span>
      </button>`).join('');
    const categories = currentSet === 'dsp' ? `<div class="spire-flow-menu-divider"></div><div class="spire-flow-menu-title">DSP Task Filters</div>${categoryOptions().map(([id, label]) => `
      <button type="button" class="spire-flow-option spire-flow-category-option" role="option" data-category="${esc(id)}" aria-selected="${id === currentCategory ? 'true' : 'false'}">
        <span class="spire-flow-check" aria-hidden="true">${id === currentCategory ? '✓' : ''}</span><span class="spire-flow-option-label">${esc(label)}</span>
      </button>`).join('')}` : '';
    return `<div class="spire-flow-menu-title">Flowsheet Sets</div>${sets}${categories}`;
  }

  function ensureMenu() {
    const trigger = ensureTrigger();
    if (!trigger) return null;
    menu = trigger.querySelector(`#${MENU_ID}`);
    if (!menu) {
      menu = document.createElement('div');
      menu.id = MENU_ID;
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-label', 'Flowsheet set and task filter');
      trigger.appendChild(menu);
    }
    menu.innerHTML = menuHtml();
    return menu;
  }

  function openMenu() {
    const trigger = ensureTrigger();
    if (!trigger || !ensureMenu()) return;
    trigger.setAttribute('aria-expanded', 'true');
    menu.dataset.open = 'true';
    requestAnimationFrame(() => (menu.querySelector('[aria-selected="true"]') || menu.querySelector('.spire-flow-option'))?.focus({ preventScroll: true }));
  }

  function closeMenu({ focusTrigger = false } = {}) {
    const trigger = dropdown();
    trigger?.setAttribute('aria-expanded', 'false');
    if (menu) menu.dataset.open = 'false';
    if (focusTrigger) trigger?.focus({ preventScroll: true });
  }

  function syncTree() {
    tree()?.querySelectorAll('.tree-item[data-category]').forEach((item) => {
      const selected = currentSet === 'dsp' && item.dataset.category === currentCategory;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-current', selected ? 'true' : 'false');
    });
  }

  function classifyDsp(text) {
    const value = normalize(text);
    if (/(vital|blood glucose|glucose|temperature|pulse|blood pressure|spo2|oxygen saturation)/.test(value)) return 'vitals';
    if (/(bathing|shower|dressing|groom|oral care|toilet|\badl\b|personal care)/.test(value)) return 'adls';
    if (/(medication administration|\bemar\b|\bmar\b|scheduled meds|dose|prn medication|medication refusal)/.test(value)) return 'meds';
    if (/(meal|nutrition support|diet|dysphagia|swallow|liquid consistency|bite-sized|bite sized|pacing)/.test(value)) return 'meals';
    if (/(seizure|neuro|postictal|rescue med|midazolam)/.test(value)) return 'seizure';
    if (/(behavior|mood|trigger|antecedent|de-escal|elopement|wandering)/.test(value)) return 'behavior';
    if (/(bowel|elimination|stool|continence)/.test(value)) return 'bowel';
    if (/(community|outing|transport)/.test(value)) return 'community';
    if (/(\bisp\b|goal|outcome|skill-building|important to|important for)/.test(value)) return 'isp';
    return '';
  }

  function filterDspRows() {
    if (filtering || currentSet !== 'dsp') return;
    filtering = true;
    try {
      const host = flowsheetHost();
      if (!host) return;
      host.dataset.spireFlowsheetSet = currentSet;
      const rows = Array.from(host.querySelectorAll('#flowsheetTable tbody tr,.flow-grid tbody tr'));
      rows.forEach((row) => row.classList.remove(HIDDEN_CLASS));
      if (currentCategory === 'all') return;
      rows.forEach((row) => {
        const text = String(row.cells?.[0]?.textContent || row.textContent || '');
        row.classList.toggle(HIDDEN_CLASS, classifyDsp(text) !== currentCategory);
      });
    } finally {
      filtering = false;
    }
  }

  function announceSelection() {
    document.dispatchEvent(new CustomEvent('spire:flowsheet-set-change', {
      detail: { set: currentSet, setLabel: setLabel(currentSet), category: currentCategory, categoryLabel: categoryLabel(currentCategory) },
    }));
  }

  function applySelection({ setId = currentSet, category = currentCategory } = {}) {
    currentSet = SETS.some(([id]) => id === setId) ? setId : 'dsp';
    currentCategory = currentSet === 'dsp' && categoryOptions().some(([id]) => id === category) ? category : 'all';
    writeSession(SET_KEY, currentSet);
    writeSession(CATEGORY_KEY, currentCategory);
    writeSession(LEGACY_SET_KEY, currentSet);
    writeSession(LEGACY_CATEGORY_KEY, currentCategory);
    window.__spireFlowsheetSet = currentSet;
    window.__spireFlowsheetFilterCategory = currentCategory;
    closeMenu();
    syncTree();
    const label = labelNode();
    if (label) label.textContent = desiredLabel();
    announceSelection();
    requestAnimationFrame(() => {
      ensureTrigger();
      if (currentSet === 'dsp') filterDspRows();
    });
  }

  function enhance() {
    const trigger = ensureTrigger();
    if (!trigger) return;
    flowsheetHost()?.setAttribute('data-spire-flowsheet-set', currentSet);
    syncTree();
    const label = labelNode();
    if (label && label.textContent !== desiredLabel()) label.textContent = desiredLabel();
    if (currentSet === 'dsp') filterDspRows();
  }

  function scheduleEnhance() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; enhance(); });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const setOption = target.closest(`#${MENU_ID} .spire-flow-set-option`);
    if (setOption) {
      event.preventDefault();
      event.stopPropagation();
      applySelection({ setId: String(setOption.dataset.set || 'dsp'), category: 'all' });
      return;
    }
    const categoryOption = target.closest(`#${MENU_ID} .spire-flow-category-option`);
    if (categoryOption) {
      event.preventDefault();
      event.stopPropagation();
      applySelection({ setId: 'dsp', category: String(categoryOption.dataset.category || 'all') });
      return;
    }
    const trigger = dropdown();
    if (trigger && trigger.contains(target)) {
      if (target.closest(`#${MENU_ID}`)) return;
      event.preventDefault();
      event.stopPropagation();
      if (menu?.dataset.open === 'true') closeMenu(); else openMenu();
      return;
    }
    const treeItem = target.closest('#flowsheetTreeMenu .tree-item[data-category]');
    if (treeItem) {
      event.preventDefault();
      applySelection({ setId: 'dsp', category: String(treeItem.dataset.category || 'all') });
      return;
    }
    if (menu?.dataset.open === 'true' && !menu.contains(target)) closeMenu();
  }, true);

  document.addEventListener('keydown', (event) => {
    const trigger = dropdown();
    if (trigger && event.target === trigger && ['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      openMenu();
    } else if (menu?.dataset.open === 'true' && event.key === 'Escape') {
      event.preventDefault();
      closeMenu({ focusTrigger: true });
    }
  }, true);

  function start() {
    ensureStyle();
    scheduleEnhance();
    observer?.disconnect();
    observer = new MutationObserver((records) => {
      if (records.some((record) => record.type === 'childList' && (record.addedNodes.length || record.removedNodes.length))) scheduleEnhance();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  const api = Object.freeze({
    marker: MARKER,
    selectSet: (setId) => applySelection({ setId: String(setId || 'dsp'), category: 'all' }),
    selectDspCategory: (category) => applySelection({ setId: 'dsp', category: String(category || 'all') }),
    current: () => ({ set: currentSet, category: currentCategory }),
    refresh: () => applySelection({ setId: currentSet, category: currentCategory }),
    open: openMenu,
    close: closeMenu,
  });

  window.SpireFlowsheetSetSelectorV10 = api;
  window.SpireFlowsheetSetSelectorV9 = api;
  window.SpireFlowsheetSetSelectorV8 = api;
})();
