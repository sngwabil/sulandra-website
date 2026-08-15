(() => {
  'use strict';

  const MARKER = 'SULANDRA_ADMIN_ADAPTIVE_NAV_V1';
  const BAR_ID = 'topModuleNav';
  const MORE_ITEM_ID = 'adminPrimaryMoreItem';
  const MORE_BUTTON_ID = 'adminPrimaryMoreButton';
  const MENU_ID = 'adminPrimaryMoreMenu';
  if (!/\/admin\.html$/i.test(location.pathname)) return;
  if (window.__SULANDRA_ADMIN_ADAPTIVE_NAV === MARKER) return;
  window.__SULANDRA_ADMIN_ADAPTIVE_NAV = MARKER;

  function installStyles() {
    if (document.getElementById('adminAdaptiveNavigationStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminAdaptiveNavigationStyles';
    style.textContent = `
      #${BAR_ID}{position:relative!important;display:flex!important;flex-wrap:nowrap!important;overflow:visible!important;min-width:0!important}
      #${BAR_ID}>li{flex:0 0 auto}
      #${MORE_ITEM_ID}{position:relative;flex:0 0 auto;margin-left:auto}
      #${MORE_BUTTON_ID}{display:flex;align-items:center;gap:6px;border:0;background:#fff;color:#17324d;padding:15px 16px;margin:6px 0;border-radius:6px;font:800 15px/1.2 'Segoe UI',Arial,sans-serif;cursor:pointer;white-space:nowrap}
      #${MORE_BUTTON_ID}:hover,#${MORE_BUTTON_ID}:focus-visible{color:#004b8d;background:#eef6ff;outline:none}
      #${MORE_BUTTON_ID}[aria-expanded="true"]{color:#004b8d;background:#eef6ff;border:1px solid #cfe4fb}
      #${MORE_BUTTON_ID} .admin-more-count{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#dcecf9;color:#174f79;font-size:10px;font-weight:950}
      #${MENU_ID}{position:absolute;right:0;top:calc(100% - 4px);z-index:2400;min-width:245px;max-width:min(360px,92vw);max-height:min(65vh,560px);overflow:auto;padding:6px;background:#fff;border:1px solid #b9cad9;border-radius:9px;box-shadow:0 16px 38px rgba(15,40,65,.22)}
      #${MENU_ID}[hidden]{display:none!important}
      #${MENU_ID} .admin-more-heading{padding:6px 9px 7px;color:#667b8c;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid #e3ebf2}
      #${MENU_ID} button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;border:0;background:#fff;color:#17324d;padding:9px 10px;border-radius:6px;text-align:left;font:800 13px/1.2 'Segoe UI',Arial,sans-serif;cursor:pointer}
      #${MENU_ID} button:hover,#${MENU_ID} button:focus-visible{background:#eef6ff;color:#004b8d;outline:none}
      #${MENU_ID} button.active{background:#e7f2fd;color:#004b8d}
      #${MENU_ID} button small{display:block;color:#718497;font-size:10px;font-weight:700;margin-top:2px}
      @media(max-width:680px){#${MORE_BUTTON_ID}{padding:12px 11px;font-size:13px}#${MENU_ID}{right:-4px;min-width:min(300px,90vw)}}
    `;
    document.head.appendChild(style);
  }

  function init() {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return false;
    installStyles();

    let moreItem = document.getElementById(MORE_ITEM_ID);
    if (!moreItem) {
      moreItem = document.createElement('li');
      moreItem.id = MORE_ITEM_ID;
      moreItem.innerHTML = `<button id="${MORE_BUTTON_ID}" type="button" aria-haspopup="menu" aria-controls="${MENU_ID}" aria-expanded="false"><span>More</span><span class="admin-more-count">0</span><span aria-hidden="true">▼</span></button><div id="${MENU_ID}" role="menu" hidden></div>`;
      bar.appendChild(moreItem);
    }
    const moreButton = document.getElementById(MORE_BUTTON_ID);
    const menu = document.getElementById(MENU_ID);
    if (!moreButton || !menu) return false;

    const sourceItems = () => Array.from(bar.children).filter((node) => node.tagName === 'LI' && node.id !== MORE_ITEM_ID);
    const closeMenu = () => { menu.hidden = true; moreButton.setAttribute('aria-expanded', 'false'); };
    const openMenu = () => {
      if (!menu.querySelector('button')) return;
      menu.hidden = false;
      moreButton.setAttribute('aria-expanded', 'true');
      menu.querySelector('button')?.focus({preventScroll:true});
    };

    moreButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (menu.hidden) openMenu(); else closeMenu();
    });
    document.addEventListener('click', (event) => { if (!moreItem.contains(event.target)) closeMenu(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });

    function rebuildMenu(hiddenItems) {
      menu.replaceChildren();
      if (!hiddenItems.length) return;
      const heading = document.createElement('div');
      heading.className = 'admin-more-heading';
      heading.textContent = 'More Admin Activities';
      menu.appendChild(heading);
      hiddenItems.forEach((item) => {
        const link = item.querySelector('a');
        if (!link) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        if (link.classList.contains('active')) button.classList.add('active');
        const navKey = link.dataset.module || link.dataset.sulandraRoute || link.getAttribute('href') || '';
        const manifest = window.SulandraAdminNavigation?.manifest?.primary || [];
        const meta = manifest.find((entry) => entry.key === link.dataset.module || entry.href === link.dataset.sulandraRoute || entry.href === link.getAttribute('href'));
        button.innerHTML = `<span>${link.textContent?.replace(/LIVE\s*$/,'').trim() || 'Activity'}${meta?.sub ? `<small>${meta.sub}</small>` : ''}</span><span aria-hidden="true">›</span>`;
        button.dataset.adminNavTarget = navKey;
        button.addEventListener('click', () => {
          closeMenu();
          link.click();
          window.setTimeout(scheduleLayout, 0);
        });
        menu.appendChild(button);
      });
    }

    let frame = 0;
    let layingOut = false;
    function layout() {
      frame = 0;
      if (layingOut || !bar.isConnected) return;
      layingOut = true;
      try {
        const all = sourceItems();
        all.forEach((item) => {
          item.dataset.adminOverflowHidden = 'false';
          item.style.display = '';
        });
        const eligible = all.filter((item) => !item.hidden);
        if (!eligible.length || bar.clientWidth < 100) {
          moreItem.style.display = 'none';
          rebuildMenu([]);
          return;
        }

        moreItem.style.display = '';
        moreItem.style.visibility = 'hidden';
        const available = Math.max(0, bar.clientWidth - 4);
        const moreWidth = Math.max(82, Math.ceil(moreItem.getBoundingClientRect().width));
        const widths = new Map(eligible.map((item) => [item, Math.ceil(item.getBoundingClientRect().width)]));
        const total = eligible.reduce((sum, item) => sum + (widths.get(item) || 0), 0);
        if (total <= available) {
          moreItem.style.display = 'none';
          moreItem.style.visibility = '';
          rebuildMenu([]);
          closeMenu();
          return;
        }

        const budget = Math.max(60, available - moreWidth - 4);
        const visible = [];
        let used = 0;
        for (const item of eligible) {
          const width = widths.get(item) || 0;
          if (!visible.length || used + width <= budget) {
            visible.push(item);
            used += width;
          }
        }
        const visibleSet = new Set(visible);
        const hiddenItems = eligible.filter((item) => !visibleSet.has(item));
        eligible.forEach((item) => {
          const overflowHidden = !visibleSet.has(item);
          item.dataset.adminOverflowHidden = String(overflowHidden);
          item.style.display = overflowHidden ? 'none' : '';
        });
        moreItem.style.visibility = '';
        moreItem.style.display = hiddenItems.length ? '' : 'none';
        moreButton.querySelector('.admin-more-count').textContent = String(hiddenItems.length);
        rebuildMenu(hiddenItems);
        if (!hiddenItems.length) closeMenu();
      } finally {
        layingOut = false;
      }
    }

    function scheduleLayout() {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    }

    window.addEventListener('resize', scheduleLayout, {passive:true});
    window.addEventListener('sulandra:company-change', () => window.setTimeout(scheduleLayout, 0));
    window.visualViewport?.addEventListener('resize', scheduleLayout, {passive:true});
    if ('ResizeObserver' in window) new ResizeObserver(scheduleLayout).observe(bar);
    new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === 'attributes' && ['hidden','class'].includes(mutation.attributeName))) scheduleLayout();
    }).observe(bar, {subtree:true, attributes:true, attributeFilter:['hidden','class']});

    scheduleLayout();
    window.setTimeout(scheduleLayout, 150);
    window.setTimeout(scheduleLayout, 700);
    return true;
  }

  if (!init()) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
    else window.setTimeout(init, 60);
  }
})();
