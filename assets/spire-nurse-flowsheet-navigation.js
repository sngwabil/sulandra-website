(() => {
  'use strict';

  // SPIRE_NURSE_FLOWSHEET_NAVIGATION_V1
  // Restores a role-specific nursing task list and constrains the long flowsheet
  // grid to the visible viewport so the task tree and chart values can scroll.

  const VERSION = '20260815-nurse-navigation-1';
  const TASK_KEY = 'spire:flowsheet:nurse-task';
  const TASKS = Object.freeze({
    all: { label: 'Show All Nursing Tasks', test: () => true },
    assessment: { label: 'Visit & General Assessment', test: (text) => /skilled visit type|visit \/ patient status|general appearance|level of consciousness|orientation/i.test(text) },
    pain_neuro: { label: 'Pain & Neurological', test: (text) => /pain score|pain location|neurolog/i.test(text) },
    respiratory: { label: 'Respiratory & Oxygen', test: (text) => /respiratory|lung sounds|oxygen therapy|oxygen flow/i.test(text) },
    cardiac: { label: 'Cardiac & Circulation', test: (text) => /cardiac|circulatory|edema|capillary refill/i.test(text) },
    gi_gu: { label: 'GI / GU / Nutrition', test: (text) => /gi \/ abdominal|bowel status|gu \/ urinary|nutrition \/ appetite|hydration status/i.test(text) },
    skin_wound: { label: 'Skin & Wound', test: (text) => /skin integrity|wound \/ incision/i.test(text) },
    diabetes_meds: { label: 'Diabetes & Medications', test: (text) => /blood glucose|diabetes \/ insulin|medication reconciliation|medication changes|medication teaching/i.test(text) },
    devices: { label: 'Catheters, Tubes & Infusions', test: (text) => /foley|urinary catheter|feeding tube|enteral|iv \/ picc|infusion/i.test(text) },
    mobility_safety: { label: 'Mobility, Fall Risk & Safety', test: (text) => /mobility \/ fall risk|safety \/ home environment/i.test(text) },
    interventions: { label: 'Skilled Interventions & Response', test: (text) => /skilled nursing intervention|response to intervention/i.test(text) },
    education_coordination: { label: 'Education & Care Coordination', test: (text) => /patient \/ caregiver education|provider \/ physician notification|new \/ changed orders/i.test(text) },
    escalation_plan: { label: 'Change of Condition & Care Plan', test: (text) => /change of condition|care plan \/ goal progress|next visit focus|rn \/ lpn narrative/i.test(text) },
  });

  let activeTask = TASKS[sessionStorage.getItem(TASK_KEY)] ? sessionStorage.getItem(TASK_KEY) : 'all';
  let applyQueued = false;

  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
  const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
  const role = () => window.SpireFlowsheetRoleSelector?.getRole?.() || 'dsp';

  function ensureStyle() {
    if ($('#spireNurseFlowsheetNavigationStyle')) return;
    const style = document.createElement('style');
    style.id = 'spireNurseFlowsheetNavigationStyle';
    style.textContent = `
      #spireNurseTaskMenu{display:none;margin-top:4px;padding-bottom:8px}
      #spireNurseTaskMenu.active{display:block}
      #spireNurseTaskMenu .nurse-task-heading{padding:5px 7px 4px;color:#31546d;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
      #spireNurseTaskMenu button{display:block;width:100%;border:0;background:transparent;text-align:left;padding:6px 9px;color:#244c70;font:500 12px/1.2 "Segoe UI",Arial,sans-serif;cursor:pointer;border-radius:2px}
      #spireNurseTaskMenu button:hover,#spireNurseTaskMenu button:focus{background:#e3f1ff;outline:none}
      #spireNurseTaskMenu button.selected{background:#a8dcf5;color:#083f66;font-weight:800}
      #flowsheets-view[data-user-master-flowsheet="true"] .flowsheet-main-layout{min-height:280px!important}
      #flowsheets-view[data-user-master-flowsheet="true"] .flowsheet-tree,
      #flowsheets-view[data-user-master-flowsheet="true"] .flowsheet-grid-container{min-height:0!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch!important}
      #flowsheets-view[data-user-master-flowsheet="true"] .flowsheet-grid-container{overflow-y:auto!important;touch-action:pan-x pan-y!important}
    `;
    document.head.appendChild(style);
  }

  function forceHidden(node, hidden) {
    if (!(node instanceof HTMLElement)) return;
    if (hidden) node.style.setProperty('display', 'none', 'important');
    else node.style.removeProperty('display');
  }

  function ensureNurseMenu() {
    const tree = $('#flowsheetTreeMenu');
    if (!tree) return null;
    let menu = $('#spireNurseTaskMenu', tree);
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'spireNurseTaskMenu';
      menu.innerHTML = `<div class="nurse-task-heading">Nursing Task List</div>${Object.entries(TASKS).map(([key, def]) => `<button type="button" data-nurse-task="${key}">${def.label}</button>`).join('')}`;
      menu.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-nurse-task]') : null;
        if (!button) return;
        event.preventDefault();
        activeTask = TASKS[button.dataset.nurseTask] ? button.dataset.nurseTask : 'all';
        sessionStorage.setItem(TASK_KEY, activeTask);
        applyNurseTaskFilter();
        syncTaskMenu();
        syncDropdownLabel();
      });
      tree.appendChild(menu);
    }
    return menu;
  }

  function ensureUnderlyingAllTasks() {
    if (role() !== 'nurse') return;
    const tree = $('#flowsheetTreeMenu');
    const baseAll = $('[data-category="all"]', tree);
    const selected = $('[data-category].selected', tree);
    if (baseAll && selected !== baseAll) {
      baseAll.click();
      window.setTimeout(scheduleApply, 0);
    }
  }

  function syncTaskMenu() {
    const tree = $('#flowsheetTreeMenu');
    const nurse = role() === 'nurse';
    const menu = ensureNurseMenu();
    if (!tree || !menu) return;

    // The generic tree is DSP-oriented. Keep the search field, but replace the
    // DSP categories with a nursing task list while Nurse Flowsheets is active.
    $$('[data-category]', tree).forEach((item) => forceHidden(item, nurse));
    $$(':scope > hr', tree).forEach((line) => forceHidden(line, nurse));
    const oldNote = $('#spireRoleScopeNote', tree);
    if (oldNote) forceHidden(oldNote, nurse);

    menu.classList.toggle('active', nurse);
    $$('[data-nurse-task]', menu).forEach((button) => button.classList.toggle('selected', button.dataset.nurseTask === activeTask));
  }

  function nurseRowText(row) {
    return String(row?.querySelector?.('td:first-child')?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function applyNurseTaskFilter() {
    if (role() !== 'nurse') return;
    const tbody = $('#flowsheetTbody');
    if (!tbody) return;
    const def = TASKS[activeTask] || TASKS.all;
    let nurseSection = null;
    let insideNurse = false;
    let visibleCount = 0;

    for (const row of [...tbody.children]) {
      if (!(row instanceof HTMLTableRowElement)) continue;
      if (row.classList.contains('flow-section-row')) {
        const group = String(row.textContent || '').trim().toLowerCase();
        insideNurse = group === 'nurse flowsheets';
        if (insideNurse) nurseSection = row;
        continue;
      }
      if (!insideNurse) continue;
      const visible = def.test(nurseRowText(row));
      forceHidden(row, !visible);
      if (visible) visibleCount += 1;
    }
    if (nurseSection) forceHidden(nurseSection, visibleCount === 0);
  }

  function syncDropdownLabel() {
    if (role() !== 'nurse') return;
    const label = $('#activeFlowsheetFilterName');
    if (!label) return;
    const expected = `Nurse Flowsheets - ${(TASKS[activeTask] || TASKS.all).label}`;
    if (label.textContent !== expected) label.textContent = expected;
  }

  function resizeScrollableWorkspace() {
    const host = $('#flowsheets-view');
    const layout = $('.flowsheet-main-layout', host);
    const tree = $('.flowsheet-tree', host);
    const grid = $('.flowsheet-grid-container', host);
    if (!layout || !tree || !grid) return;

    const viewportHeight = Math.max(320, Math.floor(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 720));
    const top = Math.max(0, Math.floor(layout.getBoundingClientRect().top));
    const available = Math.max(280, viewportHeight - top - 8);

    layout.style.setProperty('height', `${available}px`, 'important');
    layout.style.setProperty('max-height', `${available}px`, 'important');
    layout.style.setProperty('min-height', `${Math.min(available, 280)}px`, 'important');
    for (const pane of [tree, grid]) {
      pane.style.setProperty('height', '100%', 'important');
      pane.style.setProperty('max-height', '100%', 'important');
      pane.style.setProperty('min-height', '0', 'important');
      pane.style.setProperty('overflow-y', 'auto', 'important');
    }
  }

  function apply() {
    ensureStyle();
    ensureNurseMenu();
    ensureUnderlyingAllTasks();
    syncTaskMenu();
    applyNurseTaskFilter();
    syncDropdownLabel();
    resizeScrollableWorkspace();
  }

  function scheduleApply() {
    if (applyQueued) return;
    applyQueued = true;
    requestAnimationFrame(() => {
      applyQueued = false;
      apply();
    });
  }

  function install() {
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleApply, { passive: true });
    window.addEventListener('orientationchange', () => window.setTimeout(scheduleApply, 120), { passive: true });
    window.visualViewport?.addEventListener?.('resize', scheduleApply, { passive: true });
    apply();

    window.SpireNurseFlowsheetNavigation = Object.freeze({
      version: VERSION,
      getTask: () => activeTask,
      setTask: (task) => {
        activeTask = TASKS[task] ? task : 'all';
        sessionStorage.setItem(TASK_KEY, activeTask);
        scheduleApply();
      },
      refresh: scheduleApply,
      tasks: Object.keys(TASKS),
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
