(() => {
  'use strict';

  // SPIRE_FLOWSHEET_ROLE_SELECTOR_V1
  // Adds the missing role/template selector to the user's authoritative master
  // flowsheet without replacing its server-backed grid, staged File workflow,
  // audit behavior, or inline entry controls.

  const VERSION = '20260815-role-selector-1';
  const ROLE_KEY = 'spire:flowsheet:selected-role';
  const ROLE_DEFS = Object.freeze({
    dsp: { label: 'DSP Daily Documentation' },
    nurse: { label: 'Nurse Flowsheets' },
    all: { label: 'All Clinical Flowsheets' },
  });

  let activeRole = ROLE_DEFS[sessionStorage.getItem(ROLE_KEY)] ? sessionStorage.getItem(ROLE_KEY) : 'dsp';
  let applyQueued = false;
  let observer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const roleLabel = () => ROLE_DEFS[activeRole]?.label || ROLE_DEFS.dsp.label;

  function activeCategoryLabel() {
    const selected = $('#flowsheetTreeMenu [data-category].selected span');
    return selected?.textContent?.trim() || 'Show All Tasks';
  }

  function ensureStyle() {
    if ($('#spireFlowsheetRoleSelectorStyle')) return;
    const style = document.createElement('style');
    style.id = 'spireFlowsheetRoleSelectorStyle';
    style.textContent = `
      #flowsheets-view .filter-dropdown[data-spire-role-selector="true"]{position:relative;cursor:pointer;user-select:none;min-width:240px;padding-right:24px}
      #flowsheets-view .filter-dropdown[data-spire-role-selector="true"]:focus{outline:2px solid #2563eb;outline-offset:1px}
      #spireFlowsheetRoleMenu{position:absolute;left:0;top:calc(100% + 3px);z-index:7200;display:none;min-width:275px;background:#fff;border:1px solid #7f9db9;border-radius:4px;box-shadow:0 8px 24px rgba(15,23,42,.28);padding:4px;color:#172b3b}
      #spireFlowsheetRoleMenu.open{display:block}
      #spireFlowsheetRoleMenu button{display:block;width:100%;border:0;background:#fff;text-align:left;padding:8px 10px;border-radius:3px;cursor:pointer;font:600 12px/1.25 "Segoe UI",Arial,sans-serif;color:#163d60}
      #spireFlowsheetRoleMenu button:hover,#spireFlowsheetRoleMenu button:focus{background:#dbeafe;outline:none}
      #spireFlowsheetRoleMenu button[aria-checked="true"]{background:#cfe8ff;color:#003b67;font-weight:800}
      #spireFlowsheetRoleMenu button small{display:block;margin-top:2px;color:#607789;font-weight:500}
      #spireRoleScopeNote{margin:5px 0 2px;padding:6px 7px;border:1px solid #b6c8d8;background:#eef6ff;color:#234d6d;font-size:10.5px;line-height:1.3}
    `;
    document.head.appendChild(style);
  }

  function menuHtml() {
    const descriptions = {
      dsp: 'Daily DSP / waiver support documentation',
      nurse: 'RN / LPN skilled nursing documentation',
      all: 'View every configured clinical flowsheet row',
    };
    return Object.entries(ROLE_DEFS).map(([key, value]) => `
      <button type="button" role="menuitemradio" data-flow-role="${key}" aria-checked="${key === activeRole ? 'true' : 'false'}">
        ${value.label}<small>${descriptions[key]}</small>
      </button>`).join('');
  }

  function closeMenu() {
    const menu = $('#spireFlowsheetRoleMenu');
    if (menu) menu.classList.remove('open');
    const dropdown = $('#activeFlowsheetFilterName')?.closest('.filter-dropdown');
    dropdown?.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu(force) {
    const menu = $('#spireFlowsheetRoleMenu');
    const dropdown = $('#activeFlowsheetFilterName')?.closest('.filter-dropdown');
    if (!menu || !dropdown) return;
    const open = typeof force === 'boolean' ? force : !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    dropdown.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) menu.querySelector(`[data-flow-role="${activeRole}"]`)?.focus();
  }

  function ensureDropdown() {
    const active = $('#activeFlowsheetFilterName');
    const dropdown = active?.closest('.filter-dropdown');
    if (!active || !dropdown) return null;
    ensureStyle();
    if (dropdown.dataset.spireRoleSelector !== 'true') {
      dropdown.dataset.spireRoleSelector = 'true';
      dropdown.setAttribute('role', 'button');
      dropdown.setAttribute('tabindex', '0');
      dropdown.setAttribute('aria-haspopup', 'menu');
      dropdown.setAttribute('aria-expanded', 'false');
      dropdown.setAttribute('aria-label', 'Choose flowsheet role or template');
      dropdown.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('#spireFlowsheetRoleMenu')) return;
        event.preventDefault();
        event.stopPropagation();
        toggleMenu();
      });
      dropdown.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
          event.preventDefault();
          toggleMenu(true);
        } else if (event.key === 'Escape') {
          closeMenu();
        }
      });
    }
    let menu = $('#spireFlowsheetRoleMenu', dropdown);
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'spireFlowsheetRoleMenu';
      menu.setAttribute('role', 'menu');
      dropdown.appendChild(menu);
    }
    menu.innerHTML = menuHtml();
    $$('[data-flow-role]', menu).forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectRole(button.dataset.flowRole || 'dsp');
    }));
    return dropdown;
  }

  function isNurseGroup(groupName) {
    return String(groupName || '').trim().toLowerCase() === 'nurse flowsheets';
  }

  function applyGridScope() {
    const tbody = $('#flowsheetTbody');
    if (!tbody) return;
    let groupName = '';
    let groupVisible = activeRole === 'all';
    for (const row of [...tbody.children]) {
      if (!(row instanceof HTMLTableRowElement)) continue;
      if (row.classList.contains('flow-section-row')) {
        groupName = row.textContent?.trim() || '';
        groupVisible = activeRole === 'all' || (activeRole === 'nurse' ? isNurseGroup(groupName) : !isNurseGroup(groupName));
      }
      row.hidden = !groupVisible;
    }

    const header = $('#headerTimeRow th:first-child');
    if (header && header.textContent !== roleLabel()) header.textContent = roleLabel();
  }

  function applyTreeScope() {
    const tree = $('#flowsheetTreeMenu');
    if (!tree) return;
    const nurseOnly = activeRole === 'nurse';
    $$('[data-category]', tree).forEach((item) => {
      item.hidden = nurseOnly && item.dataset.category !== 'all';
    });
    $$('hr', tree).forEach((separator) => { separator.hidden = nurseOnly; });

    let note = $('#spireRoleScopeNote', tree);
    if (nurseOnly) {
      if (!note) {
        note = document.createElement('div');
        note.id = 'spireRoleScopeNote';
        tree.appendChild(note);
      }
      note.textContent = 'Nurse view: all RN / LPN flowsheet rows are shown. Use Search Task to find a nursing item.';
    } else {
      note?.remove();
    }
  }

  function syncLabel() {
    const active = $('#activeFlowsheetFilterName');
    if (!active) return;
    const category = activeRole === 'nurse' ? 'Show All Tasks' : activeCategoryLabel();
    const expected = `${roleLabel()} - ${category}`;
    if (active.textContent !== expected) active.textContent = expected;
    const menu = $('#spireFlowsheetRoleMenu');
    $$('[data-flow-role]', menu || document).forEach((button) => button.setAttribute('aria-checked', button.dataset.flowRole === activeRole ? 'true' : 'false'));
  }

  function applyRoleView() {
    ensureDropdown();
    applyTreeScope();
    applyGridScope();
    syncLabel();
  }

  function scheduleApply() {
    if (applyQueued) return;
    applyQueued = true;
    requestAnimationFrame(() => {
      applyQueued = false;
      applyRoleView();
    });
  }

  function selectRole(nextRole) {
    const role = ROLE_DEFS[nextRole] ? nextRole : 'dsp';
    if (role !== activeRole && window.SpireMasterFlowsheetGrid?.hasPending?.() === true) {
      const proceed = confirm('You have unfiled Flowsheet documentation. Switching the role view will keep those boxes staged and they will still be included when you press File. Continue?');
      if (!proceed) return closeMenu();
    }
    activeRole = role;
    sessionStorage.setItem(ROLE_KEY, activeRole);
    closeMenu();

    // The authoritative grid owns category state. Reset it through its existing
    // control rather than reaching into or replacing the filing runtime.
    const all = $('#flowsheetTreeMenu [data-category="all"]');
    if (all && !all.classList.contains('selected')) all.click();
    scheduleApply();
    window.setTimeout(scheduleApply, 0);
  }

  function install() {
    document.addEventListener('click', (event) => {
      const dropdown = $('#activeFlowsheetFilterName')?.closest('.filter-dropdown');
      if (dropdown && event.target instanceof Node && !dropdown.contains(event.target)) closeMenu();
    }, true);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });

    observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });
    applyRoleView();

    window.SpireFlowsheetRoleSelector = Object.freeze({
      version: VERSION,
      getRole: () => activeRole,
      selectRole,
      refresh: scheduleApply,
      roles: Object.keys(ROLE_DEFS),
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();