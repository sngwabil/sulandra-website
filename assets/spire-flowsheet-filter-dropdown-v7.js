(() => {
  'use strict';

  // SPIRE_FLOWSHEET_SET_SELECTOR_V8
  // One interaction-only selector over the existing live Flowsheet grid.
  // It does not fetch chart data, own MAR/Orders, or create a second Flowsheet renderer.
  const MARKER = 'SPIRE_FLOWSHEET_SET_SELECTOR_V8';
  const MENU_ID = 'spireFlowsheetSetSelectorV8Menu';
  const HIDDEN_CLASS = 'spire-flowsheet-set-v8-hidden';
  const SET_KEY = 'spire:flowsheet:selected-set:v8';
  const CATEGORY_KEY = 'spire:flowsheet:selected-category:v8';
  let currentSet = readSession(SET_KEY, 'dsp');
  let currentCategory = readSession(CATEGORY_KEY, 'all');
  let menu = null;
  let raf = 0;
  let observer = null;

  const SETS = Object.freeze([
    ['dsp', 'DSP Daily Documentation', 'DSP, waiver and direct-care daily charting'],
    ['nurse', 'Nurse / Skilled Nursing', 'RN/LPN skilled assessment, intervention and follow-up'],
    ['all', 'All Clinical Documentation', 'Every available Flowsheet row for this client'],
    ['vitals', 'Vitals & Clinical Monitoring', 'Vitals, pain, clinical surveillance and change monitoring'],
    ['respiratory', 'Respiratory / Oxygen', 'Respiratory status, lung sounds, oxygen and breathing support'],
    ['woundDevices', 'Wound / Skin / Lines & Devices', 'Skin, wounds, Foley, feeding tubes, IV/PICC and device checks'],
    ['diabetes', 'Diabetes / Blood Glucose', 'Glucose values, diabetes observations and insulin-related monitoring'],
    ['neuro', 'Neurologic / Seizure', 'Neurologic status, seizure observation and recovery'],
    ['io', 'Intake / Output & Elimination', 'Hydration, urine, bowel, GI and GU documentation'],
    ['medTreatment', 'Medication / Treatment', 'Medication reconciliation, treatment and PRN effectiveness'],
    ['mobility', 'Mobility / Fall Risk', 'Mobility, transfers, positioning and fall-risk documentation'],
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

  const DSP_GROUPS = new Set([
    'vitals & blood glucose',
    'adls & personal care support',
    'medication administration (emar)',
    'meal & dysphagia precautions',
    'seizure & neurological check',
    'behavioral & elopement support',
    'bowel & elimination protocol',
    'community outings & transport',
    'isp goal skill-building',
    'isp outcomes / progress',
    'sleep / wake',
    'daily living',
    'community / isp',
    'behavior / safety',
  ]);

  const NURSE_FOUNDATION_GROUPS = new Set([
    'nurse flowsheets',
    'vitals',
    'intake / output',
    'clinical monitoring',
    'medication / treatment',
  ]);

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

  function setDefinition(id) {
    return SETS.find(([setId]) => setId === id) || SETS[0];
  }

  function setLabel(id) {
    return setDefinition(id)[1];
  }

  function dropdown() {
    const label = document.getElementById('activeFlowsheetFilterName');
    return label?.closest('.filter-dropdown') || null;
  }

  function tree() {
    return document.getElementById('flowsheetTreeMenu');
  }

  function categoryOptions() {
    const items = Array.from(tree()?.querySelectorAll('.tree-item[data-category]') || [])
      .map((item) => [String(item.dataset.category || '').trim(), String(item.textContent || '').trim()])
      .filter(([category, label]) => category && label);
    return items.length ? items : FALLBACK_CATEGORIES.map((item) => [...item]);
  }

  function categoryLabel(category) {
    return categoryOptions().find(([id]) => id === category)?.[1] || 'Show All Tasks';
  }

  function classifyCategory(text) {
    const value = normalize(text);
    if (/(vital|blood glucose|glucose|temperature|pulse|blood pressure|spo2|oxygen saturation)/.test(value)) return 'vitals';
    if (/(bathing|shower|dressing|groom|oral care|toilet|\badl\b|personal care)/.test(value)) return 'adls';
    if (/(medication administration|\bemar\b|\bmar\b|scheduled meds|dose|prn medication|medication refusal)/.test(value)) return 'meds';
    if (/(meal|nutrition support|diet|dysphagia|swallow|liquid consistency|bite-sized|bite sized|pacing)/.test(value)) return 'meals';
    if (/(seizure|neuro|neurological|postictal|rescue med|midazolam)/.test(value)) return 'seizure';
    if (/(behavior|mood|trigger|antecedent|de-escal|elopement|wandering)/.test(value)) return 'behavior';
    if (/(bowel|elimination|stool|continence|fluid intake encouragement)/.test(value)) return 'bowel';
    if (/(community|outing|transport)/.test(value)) return 'community';
    if (/(\bisp\b|goal|outcome|skill-building|skill building|important to|important for|money management|independent task prompting)/.test(value)) return 'isp';
    return '';
  }

  function matchesSpecialty(setId, groupName, rowText) {
    const text = normalize(`${groupName} ${rowText}`);
    switch (setId) {
      case 'vitals':
        return /(vital|temperature|pulse|respirations|blood pressure|spo2|oxygen saturation|weight|pain score|pain location|clinical monitoring|general appearance|level of consciousness|orientation|visit \/ patient status)/.test(text);
      case 'respiratory':
        return /(respiratory|lung sound|oxygen therapy|oxygen flow|spo2|oxygen saturation|breath|cough|sputum|trach)/.test(text);
      case 'woundDevices':
        return /(skin|wound|incision|pressure|catheter|foley|urinary catheter|feeding tube|enteral|iv \/ picc|infusion|vascular access|line|device check)/.test(text);
      case 'diabetes':
        return /(blood glucose|diabetes|insulin|hypogly|hypergly)/.test(text);
      case 'neuro':
        return /(seizure|neurolog|postictal|orientation|level of consciousness|confus|rescue med|midazolam)/.test(text);
      case 'io':
        return /(intake \/ output|urine|urinary|bowel|stool|gi \/ abdominal|gu \/ urinary|hydration|fluid intake|continence|ostomy|constipation|diarrhea)/.test(text);
      case 'medTreatment':
        return /(medication|treatment|\bprn\b|reconciliation|adherence|drug|dose|emar|pharmacy)/.test(text);
      case 'mobility':
        return /(mobility|transfer|reposition|position \/ reposition|fall risk|assistive device|bedbound)/.test(text);
      default:
        return false;
    }
  }

  function matchesSet(setId, groupName, rowText) {
    const group = normalize(groupName);
    if (setId === 'all') return true;
    if (setId === 'dsp') return DSP_GROUPS.has(group);
    if (setId === 'nurse') return NURSE_FOUNDATION_GROUPS.has(group);
    return matchesSpecialty(setId, groupName, rowText);
  }

  function looksLikeGroupHeader(row) {
    if (!(row instanceof HTMLTableRowElement)) return false;
    if (row.matches('.row-header,.group-row,[data-group]')) return true;
    if (row.querySelector('.row-header,.group-row,[data-group]')) return true;
    const cells = Array.from(row.cells || []);
    if (!cells.length) return false;
    if (cells.some((cell) => Number(cell.colSpan || 1) > 1)) return true;
    const first = cells[0];
    const text = String(first?.textContent || '').trim();
    const remainingText = cells.slice(1).some((cell) => String(cell.textContent || '').trim());
    return text.length > 0 && text.length < 100 && !remainingText && !row.querySelector('input,textarea,select,button');
  }

  function rowName(row) {
    const firstCell = row?.cells?.[0];
    return String(firstCell?.textContent || row?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function tableBodies() {
    const host = document.getElementById('flowsheets-view');
    if (!host) return [];
    return Array.from(host.querySelectorAll('#flowsheetTable tbody,.flowsheet-table tbody,.flow-grid tbody,table tbody'))
      .filter((body, index, all) => all.indexOf(body) === index);
  }

  function segments(body) {
    const result = [];
    let current = { header: null, group: '', rows: [] };
    const push = () => {
      if (current.header || current.rows.length) result.push(current);
    };
    Array.from(body.rows || []).forEach((row) => {
      if (looksLikeGroupHeader(row)) {
        push();
        current = { header: row, group: rowName(row), rows: [] };
      } else {
        current.rows.push(row);
      }
    });
    push();
    return result;
  }

  function rowMatches(group, row) {
    const text = rowName(row);
    if (!matchesSet(currentSet, group, text)) return false;
    if (currentCategory === 'all' || currentSet !== 'dsp') return true;
    return classifyCategory(text) === currentCategory || classifyCategory(group) === currentCategory;
  }

  function filterRows() {
    for (const body of tableBodies()) {
      for (const segment of segments(body)) {
        const visibleChildren = segment.rows.filter((row) => rowMatches(segment.group, row));
        segment.rows.forEach((row) => row.classList.toggle(HIDDEN_CLASS, !visibleChildren.includes(row)));
        if (segment.header) {
          const groupOnlyMatch = !segment.rows.length && matchesSet(currentSet, segment.group, segment.group);
          segment.header.classList.toggle(HIDDEN_CLASS, !(visibleChildren.length || groupOnlyMatch));
        }
      }
    }
  }

  function syncTree() {
    tree()?.querySelectorAll('.tree-item[data-category]').forEach((item) => {
      const selected = currentSet === 'dsp' && item.dataset.category === currentCategory;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-current', selected ? 'true' : 'false');
      item.setAttribute('title', currentSet === 'dsp' ? 'Filter DSP Daily Documentation' : 'Selecting this switches to DSP Daily Documentation');
    });
  }

  function syncLabel() {
    const label = document.getElementById('activeFlowsheetFilterName');
    if (!label) return;
    const suffix = currentSet === 'dsp' ? categoryLabel(currentCategory) : 'Show All';
    label.textContent = `${setLabel(currentSet)} - ${suffix}`;
  }

  function ensureStyle() {
    if (document.getElementById('spireFlowsheetSetSelectorV8Style')) return;
    const style = document.createElement('style');
    style.id = 'spireFlowsheetSetSelectorV8Style';
    style.textContent = `
      .${HIDDEN_CLASS}{display:none!important}
      #flowsheets-view .filter-dropdown[data-spire-flowsheet-set-v8]{cursor:pointer;user-select:none;position:relative}
      #flowsheets-view .filter-dropdown[data-spire-flowsheet-set-v8]:focus-visible{outline:2px solid #38bdf8!important;outline-offset:2px}
      #flowsheets-view .filter-dropdown[data-spire-flowsheet-set-v8][aria-expanded="true"]{box-shadow:0 0 0 2px rgba(56,189,248,.36)!important}
      #${MENU_ID}{position:fixed;z-index:12000;display:none;min-width:350px;max-width:min(470px,calc(100vw - 24px));padding:6px;background:#f8fafc;color:#0f172a;border:1px solid #94a3b8;border-radius:5px;box-shadow:0 14px 36px rgba(15,23,42,.34);font:600 12px/1.25 "Segoe UI",Arial,sans-serif}
      #${MENU_ID}[data-open="true"]{display:block}
      #${MENU_ID} .spire-flow-menu-title{padding:7px 10px 5px;color:#475569;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      #${MENU_ID} .spire-flow-menu-divider{height:1px;background:#cbd5e1;margin:5px 4px}
      #${MENU_ID} .spire-flow-option{display:grid;grid-template-columns:18px minmax(0,1fr);width:100%;gap:8px;border:0;border-radius:3px;background:transparent;color:inherit;padding:8px 10px;text-align:left;cursor:pointer;font:inherit}
      #${MENU_ID} .spire-flow-option:hover,#${MENU_ID} .spire-flow-option:focus-visible{background:#e2e8f0;outline:none}
      #${MENU_ID} .spire-flow-option[aria-selected="true"]{background:#dbeafe;color:#1e3a8a;box-shadow:inset 3px 0 0 #ec4899}
      #${MENU_ID} .spire-flow-check{width:15px;color:#0f766e;font-weight:900}
      #${MENU_ID} .spire-flow-option-copy{min-width:0}
      #${MENU_ID} .spire-flow-option-label{display:block;font-weight:700}
      #${MENU_ID} .spire-flow-option-desc{display:block;margin-top:2px;color:#64748b;font-size:10px;font-weight:500;white-space:normal}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID}{background:#0b1729;color:#f3f6fb;border-color:#3d526d;box-shadow:0 18px 48px rgba(0,0,0,.68)}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-menu-title{color:#a8b8cc}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-menu-divider{background:#31445c}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-option:hover,
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-option:focus-visible{background:#142942}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-option[aria-selected="true"]{background:#26162e;color:#fff;box-shadow:inset 3px 0 0 #ec4899}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-check{color:#5eead4}
      :root[data-spire-epic-theme="darkRoom"] #${MENU_ID} .spire-flow-option-desc{color:#a8b8cc}
    `;
    document.head.appendChild(style);
  }

  function menuHtml() {
    const setButtons = SETS.map(([id, label, description]) => `
      <button type="button" class="spire-flow-option spire-flow-set-option" role="option" data-set="${esc(id)}" aria-selected="${id === currentSet ? 'true' : 'false'}">
        <span class="spire-flow-check" aria-hidden="true">${id === currentSet ? '✓' : ''}</span>
        <span class="spire-flow-option-copy"><span class="spire-flow-option-label">${esc(label)}</span><span class="spire-flow-option-desc">${esc(description)}</span></span>
      </button>`).join('');
    const categoryButtons = categoryOptions().map(([id, label]) => `
      <button type="button" class="spire-flow-option spire-flow-category-option" role="option" data-category="${esc(id)}" aria-selected="${currentSet === 'dsp' && id === currentCategory ? 'true' : 'false'}">
        <span class="spire-flow-check" aria-hidden="true">${currentSet === 'dsp' && id === currentCategory ? '✓' : ''}</span>
        <span class="spire-flow-option-copy"><span class="spire-flow-option-label">${esc(label)}</span></span>
      </button>`).join('');
    return `<div class="spire-flow-menu-title">Flowsheet Sets</div>${setButtons}<div class="spire-flow-menu-divider"></div><div class="spire-flow-menu-title">DSP Task Filters</div>${categoryButtons}`;
  }

  function ensureMenu() {
    ensureStyle();
    if (!menu?.isConnected) {
      menu = document.getElementById(MENU_ID);
      if (!menu) {
        menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.setAttribute('role', 'listbox');
        menu.setAttribute('aria-label', 'Flowsheet set and task filter');
        document.body.appendChild(menu);
      }
    }
    const html = menuHtml();
    if (menu.innerHTML !== html) menu.innerHTML = html;
    return menu;
  }

  function syncMenu() {
    if (!menu) return;
    menu.querySelectorAll('.spire-flow-set-option').forEach((button) => {
      const selected = button.dataset.set === currentSet;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      const check = button.querySelector('.spire-flow-check');
      if (check) check.textContent = selected ? '✓' : '';
    });
    menu.querySelectorAll('.spire-flow-category-option').forEach((button) => {
      const selected = currentSet === 'dsp' && button.dataset.category === currentCategory;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      const check = button.querySelector('.spire-flow-check');
      if (check) check.textContent = selected ? '✓' : '';
    });
  }

  function applySelection({ setId = currentSet, category = currentCategory, close = true } = {}) {
    const validSet = SETS.some(([id]) => id === setId) ? setId : 'dsp';
    const validCategory = categoryOptions().some(([id]) => id === category) ? category : 'all';
    currentSet = validSet;
    currentCategory = currentSet === 'dsp' ? validCategory : 'all';
    writeSession(SET_KEY, currentSet);
    writeSession(CATEGORY_KEY, currentCategory);
    window.__spireFlowsheetSet = currentSet;
    window.__spireFlowsheetFilterCategory = currentCategory;
    syncTree();
    syncLabel();
    filterRows();
    syncMenu();
    if (close) closeMenu();
    document.dispatchEvent(new CustomEvent('spire:flowsheet-set-change', {
      detail: { set: currentSet, setLabel: setLabel(currentSet), category: currentCategory, categoryLabel: categoryLabel(currentCategory) },
    }));
  }

  function positionMenu() {
    const trigger = dropdown();
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(350, Math.min(Math.max(rect.width, 350), 470));
    menu.style.width = `${Math.min(width, window.innerWidth - 16)}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(width, window.innerWidth - 16) - 8))}px`;
    menu.style.maxHeight = `${Math.max(180, window.innerHeight - 24)}px`;
    menu.style.overflowY = 'auto';
    const menuHeight = Math.min(menu.scrollHeight || 520, window.innerHeight - 24);
    const below = rect.bottom + 5;
    const top = below + menuHeight <= window.innerHeight - 8 ? below : Math.max(8, rect.top - menuHeight - 5);
    menu.style.top = `${top}px`;
    menu.style.maxHeight = `${Math.max(180, window.innerHeight - top - 8)}px`;
  }

  function openMenu() {
    const trigger = dropdown();
    if (!trigger) return;
    ensureMenu();
    trigger.setAttribute('aria-expanded', 'true');
    menu.dataset.open = 'true';
    syncMenu();
    positionMenu();
    requestAnimationFrame(() => {
      const selected = Array.from(menu.querySelectorAll('.spire-flow-set-option')).find((button) => button.dataset.set === currentSet);
      (selected || menu.querySelector('.spire-flow-option'))?.focus({ preventScroll: true });
    });
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
    trigger.removeAttribute('data-spire-filter-v7');
    trigger.dataset.spireFlowsheetSetV8 = MARKER;
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-haspopup', 'listbox');
    if (!trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');
    syncTree();
    syncLabel();
    filterRows();
  }

  function scheduleEnhance() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; enhance(); });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const trigger = dropdown();

    if (trigger && trigger.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu();
      return;
    }

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
      const buttons = Array.from(menu.querySelectorAll('.spire-flow-option'));
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

  window.SpireFlowsheetSetSelectorV8 = Object.freeze({
    marker: MARKER,
    selectSet: (setId) => applySelection({ setId: String(setId || 'dsp'), category: 'all' }),
    selectDspCategory: (category) => applySelection({ setId: 'dsp', category: String(category || 'all') }),
    current: () => ({ set: currentSet, category: currentCategory }),
    refresh: () => applySelection({ close: false }),
    open: openMenu,
    close: closeMenu,
  });
})();
