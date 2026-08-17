(() => {
  'use strict';

  // SPIRE_FLOWSHEET_ROLE_SELECTOR_V1
  // Adds the missing role/template selector to the user's authoritative master
  // flowsheet without replacing its server-backed grid, staged File workflow,
  // audit behavior, or inline entry controls.

  const VERSION = '20260817-role-selector-4';
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
      #spireFlowsheetRoleMenu{position:fixed;left:0;top:0;z-index:12000;display:none;min-width:275px;max-width:min(360px,calc(100vw - 16px));background:#fff;border:1px solid #7f9db9;border-radius:4px;box-shadow:0 10px 30px rgba(15,23,42,.38);padding:4px;color:#172b3b}
      #spireFlowsheetRoleMenu.open{display:block}
      #spireFlowsheetRoleMenu button{display:block;width:100%;border:0;background:#fff;text-align:left;padding:8px 10px;border-radius:3px;cursor:pointer;font:600 12px/1.25 "Segoe UI",Arial,sans-serif;color:#163d60}
      #spireFlowsheetRoleMenu button:hover,#spireFlowsheetRoleMenu button:focus{background:#dbeafe;outline:none}
      #spireFlowsheetRoleMenu button[aria-checked="true"]{background:#cfe8ff;color:#003b67;font-weight:800}
      #spireFlowsheetRoleMenu button small{display:block;margin-top:2px;color:#607789;font-weight:500}
      html[data-spire-epic-theme="darkRoom"] #spireFlowsheetRoleMenu{background:#101e36!important;border-color:#3a4a63!important;color:#f2f5fb!important;box-shadow:0 12px 34px rgba(0,0,0,.7)!important}
      html[data-spire-epic-theme="darkRoom"] #spireFlowsheetRoleMenu button{background:#101e36!important;color:#f2f5fb!important;border-color:#3a4a63!important}
      html[data-spire-epic-theme="darkRoom"] #spireFlowsheetRoleMenu button:hover,
      html[data-spire-epic-theme="darkRoom"] #spireFlowsheetRoleMenu button:focus{background:#162b49!important;color:#f2f5fb!important}
      html[data-spire-epic-theme="darkRoom"] #spireFlowsheetRoleMenu button[aria-checked="true"]{background:#173654!important;color:#53ddff!important;box-shadow:inset 3px 0 0 #ff4fc4!important}
      html[data-spire-epic-theme="darkRoom"] #spireFlowsheetRoleMenu button small{color:#aebbd0!important}
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

  function positionMenu() {
    const menu = $('#spireFlowsheetRoleMenu');
    const dropdown = $('#activeFlowsheetFilterName')?.closest('.filter-dropdown');
    if (!menu || !dropdown || !menu.classList.contains('open')) return;

    const rect = dropdown.getBoundingClientRect();
    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const margin = 8;
    const width = Math.min(Math.max(275, Math.ceil(rect.width)), Math.max(275, viewportWidth - margin * 2));
    menu.style.width = `${width}px`;

    const height = menu.offsetHeight || 150;
    let left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
    let top = rect.bottom + 4;
    if (top + height > viewportHeight - margin && rect.top - height - 4 >= margin) {
      top = rect.top - height - 4;
    }
    top = Math.max(margin, Math.min(top, viewportHeight - height - margin));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
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
    if (open) {
      positionMenu();
      menu.querySelector(`[data-flow-role="${activeRole}"]`)?.focus();
    }
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

    let menu = $('#spireFlowsheetRoleMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'spireFlowsheetRoleMenu';
      menu.setAttribute('role', 'menu');
      document.body.appendChild(menu);
    } else if (menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }

    if (menu.dataset.spireRoleSelectorWired !== 'true') {
      menu.dataset.spireRoleSelectorWired = 'true';
      menu.innerHTML = menuHtml();
      menu.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-flow-role]') : null;
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        selectRole(button.dataset.flowRole || 'dsp');
      });
    }
    return dropdown;
  }

  function isNurseGroup(groupName) {
    return String(groupName || '').trim().toLowerCase() === 'nurse flowsheets';
  }

  function forceHidden(node, hidden) {
    if (!(node instanceof HTMLElement)) return;
    if (hidden) node.style.setProperty('display', 'none', 'important');
    else node.style.removeProperty('display');
  }

  function ensureUnfilteredBaseForNurse() {
    if (activeRole !== 'nurse') return false;
    const tree = $('#flowsheetTreeMenu');
    const all = $('[data-category="all"]', tree || document);
    const selected = $('[data-category].selected', tree || document);
    if (!all || selected === all) return false;

    // The authoritative grid owns category filtering. A DSP category left active
    // (for example Behavioral & Elopement Support) can reduce the Nurse view to
    // only the nursing rows whose text happens to match that DSP filter. Always
    // return the base grid to Show All Tasks before applying the Nurse role scope.
    all.click();
    window.setTimeout(scheduleApply, 0);
    return true;
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
      forceHidden(row, !groupVisible);
    }

    const header = $('#headerTimeRow th:first-child');
    if (header && header.textContent !== roleLabel()) header.textContent = roleLabel();
  }

  function applyTreeScope() {
    const tree = $('#flowsheetTreeMenu');
    if (!tree) return;
    const nurseOnly = activeRole === 'nurse';
    $$('[data-category]', tree).forEach((item) => {
      const keepVisible = !nurseOnly || item.dataset.category === 'all';
      forceHidden(item, !keepVisible);
    });
    $$('hr', tree).forEach((separator) => forceHidden(separator, nurseOnly));

    let note = $('#spireRoleScopeNote', tree);
    if (nurseOnly) {
      if (!note) {
        note = document.createElement('div');
        note.id = 'spireRoleScopeNote';
        tree.appendChild(note);
      }
      const message = 'Nurse view: RN / LPN flowsheet rows only. DSP task categories are hidden; use Search Task to find a nursing item.';
      if (note.textContent !== message) note.textContent = message;
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
    if (ensureUnfilteredBaseForNurse()) return;
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

    // Nurse and All Clinical are role-level views, so they must never inherit a
    // narrower DSP task category from the previous screen state.
    if (activeRole !== 'dsp') {
      const all = $('#flowsheetTreeMenu [data-category="all"]');
      all?.click();
    }
    scheduleApply();
    window.setTimeout(scheduleApply, 0);
  }

  function install() {
    document.addEventListener('click', (event) => {
      const dropdown = $('#activeFlowsheetFilterName')?.closest('.filter-dropdown');
      const menu = $('#spireFlowsheetRoleMenu');
      const target = event.target instanceof Node ? event.target : null;
      if (dropdown && target && !dropdown.contains(target) && !menu?.contains(target)) closeMenu();
    }, true);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
    window.addEventListener('resize', () => {
      if ($('#spireFlowsheetRoleMenu')?.classList.contains('open')) positionMenu();
    }, { passive: true });
    window.addEventListener('scroll', () => {
      if ($('#spireFlowsheetRoleMenu')?.classList.contains('open')) positionMenu();
    }, true);

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
