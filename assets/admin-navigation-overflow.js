(() => {
  'use strict';

  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const MORE_ID = 'adminTopNavigationMore';
  const MENU_ID = 'adminTopNavigationOverflowMenu';
  const STYLE_ID = 'adminTopNavigationOverflowStyles';
  let resizeObserver = null;
  let entityObserver = null;
  let layoutFrame = 0;

  const topNav = () => document.getElementById('topModuleNav');
  const moreItem = () => document.getElementById(MORE_ID);
  const menu = () => document.getElementById(MENU_ID);

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${MORE_ID}{flex:0 0 auto!important;position:relative!important}
      #${MORE_ID}[hidden]{display:none!important}
      #${MORE_ID} .admin-nav-more-toggle{display:inline-flex!important;align-items:center!important;gap:7px!important;min-height:42px!important;border:1px solid #b9cfe0!important;border-radius:10px!important;padding:9px 13px!important;background:#fff!important;color:#163f61!important;font:900 13px/1.1 'Segoe UI',Arial,sans-serif!important;white-space:nowrap!important;box-shadow:0 4px 12px rgba(8,58,103,.08)!important;cursor:pointer!important}
      #${MORE_ID} .admin-nav-more-toggle:hover,#${MORE_ID} .admin-nav-more-toggle[aria-expanded="true"]{border-color:#0780c8!important;background:#eef8ff!important;color:#075985!important}
      #${MORE_ID} .admin-nav-more-chevron{font-size:11px;transition:transform .16s ease}
      #${MORE_ID} .admin-nav-more-toggle[aria-expanded="true"] .admin-nav-more-chevron{transform:rotate(180deg)}
      #${MENU_ID}{position:fixed;z-index:30000;display:none;min-width:220px;max-width:min(340px,calc(100vw - 20px));max-height:min(70vh,520px);overflow:auto;padding:8px;border:1px solid #c9d9e6;border-radius:13px;background:#fff;box-shadow:0 18px 48px rgba(8,47,87,.24)}
      #${MENU_ID}.open{display:grid;gap:4px}
      #${MENU_ID} a,#${MENU_ID} button{width:100%!important;min-height:40px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;border:0!important;border-radius:9px!important;padding:9px 11px!important;background:#fff!important;color:#163f61!important;text-align:left!important;text-decoration:none!important;font:850 13px/1.25 'Segoe UI',Arial,sans-serif!important;white-space:normal!important;cursor:pointer!important}
      #${MENU_ID} a:hover,#${MENU_ID} button:hover,#${MENU_ID} .active{background:#eef8ff!important;color:#075985!important}
      #${MENU_ID} .sulandra-workspace-link::after{margin-left:auto!important}
      #topModuleNav > li[data-admin-overflow-hidden="true"]{display:none!important}
      @media(max-width:680px){#${MORE_ID} .admin-nav-more-toggle{min-height:40px!important;padding:8px 11px!important}}
    `;
    document.head.appendChild(style);
  }

  function ensureMenu() {
    let root = menu();
    if (root) return root;
    root = document.createElement('div');
    root.id = MENU_ID;
    root.setAttribute('role', 'menu');
    root.setAttribute('aria-label', 'More administrator navigation');
    document.body.appendChild(root);
    return root;
  }

  function ensureMoreItem() {
    const nav = topNav();
    if (!nav) return null;
    let item = moreItem();
    if (item && item.parentElement !== nav) item.remove();
    item = moreItem();
    if (!item) {
      item = document.createElement('li');
      item.id = MORE_ID;
      item.hidden = true;
      item.innerHTML = '<button class="admin-nav-more-toggle" type="button" aria-haspopup="menu" aria-expanded="false">More <span class="admin-nav-more-chevron" aria-hidden="true">▾</span></button>';
      nav.appendChild(item);
      item.querySelector('button').addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const root = ensureMenu();
        root.classList.contains('open') ? closeMenu() : openMenu();
      });
    }
    return item;
  }

  function companyEligible(item) {
    const code = item.dataset.companyModule || '';
    return !code || code === (document.body?.dataset?.legalEntityCode || '');
  }

  function realItems() {
    const nav = topNav();
    if (!nav) return [];
    return [...nav.children].filter((item) => item.id !== MORE_ID);
  }

  function restoreItems() {
    for (const item of realItems()) {
      item.removeAttribute('data-admin-overflow-hidden');
      item.hidden = !companyEligible(item);
    }
  }

  function cloneControl(item) {
    const source = item.querySelector(':scope > a,:scope > button') || item.firstElementChild;
    if (!source) return null;
    const clone = source.cloneNode(true);
    clone.removeAttribute('id');
    clone.removeAttribute('style');
    clone.setAttribute('role', 'menuitem');
    clone.classList.remove('admin-nav-more-toggle');
    return clone;
  }

  function rebuildMenu(hiddenItems) {
    const root = ensureMenu();
    root.replaceChildren();
    for (const item of hiddenItems) {
      const control = cloneControl(item);
      if (!control) continue;
      root.appendChild(control);
    }
    root.querySelectorAll('[data-module]').forEach((control) => {
      control.addEventListener('click', (event) => {
        event.preventDefault();
        const key = control.dataset.module;
        const original = realItems()
          .map((item) => item.querySelector(':scope > [data-module]'))
          .find((node) => node?.dataset?.module === key);
        closeMenu();
        if (original) original.click();
        else if (key) location.hash = key;
      });
    });
    root.querySelectorAll('a,[data-sulandra-route]').forEach((control) => {
      if (!control.dataset.module) control.addEventListener('click', closeMenu, { once:false });
    });
  }

  function positionMenu() {
    const item = moreItem();
    const root = menu();
    if (!item || !root || !root.classList.contains('open')) return;
    const rect = item.getBoundingClientRect();
    const margin = 10;
    const width = Math.min(340, Math.max(220, root.offsetWidth || 220));
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.right - width));
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(rect.bottom + 6)}px`;
  }

  function openMenu() {
    const item = moreItem();
    const root = menu();
    if (!item || item.hidden || !root?.children.length) return;
    root.classList.add('open');
    item.querySelector('button')?.setAttribute('aria-expanded', 'true');
    positionMenu();
  }

  function closeMenu() {
    menu()?.classList.remove('open');
    moreItem()?.querySelector('button')?.setAttribute('aria-expanded', 'false');
  }

  function layout() {
    layoutFrame = 0;
    const nav = topNav();
    if (!nav) return;
    const item = ensureMoreItem();
    if (!item) return;
    closeMenu();
    restoreItems();
    item.hidden = true;
    nav.scrollLeft = 0;

    if (nav.scrollWidth <= nav.clientWidth + 2) {
      rebuildMenu([]);
      return;
    }

    item.hidden = false;
    const candidates = realItems().filter((node) => !node.hidden);
    const hiddenItems = [];
    for (let index = candidates.length - 1; index >= 0 && nav.scrollWidth > nav.clientWidth + 2; index -= 1) {
      const candidate = candidates[index];
      candidate.dataset.adminOverflowHidden = 'true';
      hiddenItems.unshift(candidate);
    }
    rebuildMenu(hiddenItems);
    if (!hiddenItems.length) item.hidden = true;
  }

  function scheduleLayout() {
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(layout);
  }

  function bind() {
    installStyles();
    ensureMenu();
    ensureMoreItem();
    scheduleLayout();

    const nav = topNav();
    if (nav && 'ResizeObserver' in window) {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(scheduleLayout);
      resizeObserver.observe(nav);
    }
    if (document.body && 'MutationObserver' in window) {
      entityObserver?.disconnect();
      entityObserver = new MutationObserver(scheduleLayout);
      entityObserver.observe(document.body, { attributes:true, attributeFilter:['data-legal-entity-code'] });
    }

    window.addEventListener('resize', scheduleLayout, { passive:true });
    window.addEventListener('scroll', positionMenu, { passive:true, capture:true });
    window.addEventListener('sulandra:company-change', () => setTimeout(scheduleLayout, 0));
    document.addEventListener('click', (event) => {
      if (event.target.closest(`#${MORE_ID},#${MENU_ID}`)) return;
      closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
})();
