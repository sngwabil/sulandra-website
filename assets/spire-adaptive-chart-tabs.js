(() => {
  'use strict';

  const MARKER = 'SPIRE_ADAPTIVE_CHART_TABS_V1';
  const BAR_ID = 'mainChartTabs';
  const MORE_ID = 'spireChartMoreTab';
  const MENU_ID = 'spireChartMoreMenu';
  const STORAGE_PREFIX = 'spire:chart-tab-usage:v1:';
  const PATH = location.pathname.toLowerCase().replace(/\/+$/, '');

  if (!PATH.endsWith('/spire/master.html') && !PATH.endsWith('/spire/master')) return;
  if (window.__SPIRE_ADAPTIVE_CHART_TABS === MARKER) return;
  window.__SPIRE_ADAPTIVE_CHART_TABS = MARKER;

  function sessionUserKey() {
    const raw = sessionStorage.getItem('sulandra:employee:session') || localStorage.getItem('sulandra:employee:session') || '';
    try {
      const parsed = JSON.parse(raw);
      return String(parsed?.user?.id || parsed?.userId || parsed?.id || parsed?.user?.email || parsed?.email || 'shared').replace(/[^a-z0-9@._-]/gi, '_');
    } catch {
      return 'shared';
    }
  }

  const storageKey = `${STORAGE_PREFIX}${sessionUserKey()}`;
  let usage = {};
  try { usage = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { usage = {}; }

  function saveUsage() {
    try { localStorage.setItem(storageKey, JSON.stringify(usage)); } catch {}
  }

  function tabView(tab) {
    return String(tab?.dataset?.view || '').trim();
  }

  function recordUsage(view) {
    if (!view) return;
    usage[view] = Math.min(99999, Number(usage[view] || 0) + 1);
    saveUsage();
  }

  function installStyles() {
    if (document.getElementById('spire-adaptive-chart-tabs-style')) return;
    const style = document.createElement('style');
    style.id = 'spire-adaptive-chart-tabs-style';
    style.textContent = `
      #${BAR_ID}{position:relative!important;display:flex!important;flex-wrap:nowrap!important;overflow:visible!important;min-width:0!important}
      #${BAR_ID}>.chart-tab{flex:0 0 auto}
      #${BAR_ID}>.chart-tab[style*="display: none"]{display:none!important}
      #${BAR_ID} .chart-tab[data-view="mar-view"]::before,
      #${MENU_ID} [data-view="mar-view"]::before{
        content:''!important;display:inline-block!important;width:17px!important;height:17px!important;margin-right:5px!important;
        background:transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Ccircle cx='10' cy='10' r='9' fill='%237650b7'/%3E%3Cg transform='rotate(-42 10 10)'%3E%3Crect x='6.4' y='4.1' width='7.2' height='11.8' rx='3.6' fill='%23fff'/%3E%3Cpath d='M6.5 10h7' stroke='%237650b7' stroke-width='1.35'/%3E%3C/g%3E%3C/svg%3E") center/17px 17px no-repeat!important;
        border:0!important;border-radius:0!important;font-size:0!important;line-height:1!important;vertical-align:-3px!important;
      }
      #${BAR_ID} .chart-tab[data-view="flowsheets-view"]::before,
      #${MENU_ID} [data-view="flowsheets-view"]::before{margin-right:5px!important}
      #${MORE_ID}{appearance:none;-webkit-appearance:none;font:inherit;color:inherit;border:0;border-left:1px solid #c4d1df;background:#eef4fb;cursor:pointer;white-space:nowrap;padding-left:11px!important;padding-right:11px!important;display:inline-flex!important;align-items:center;gap:5px}
      #${MORE_ID}:hover,#${MORE_ID}:focus-visible{background:#dbeafe!important;outline:none}
      #${MORE_ID} .spire-more-count{display:inline-grid;place-items:center;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:#d9e5f3;color:#294a66;font-size:10px;font-weight:800}
      #${MORE_ID} .spire-more-chevron{font-size:10px;transform:translateY(1px)}
      #${MENU_ID}{position:absolute;right:2px;top:calc(100% + 2px);z-index:6000;min-width:238px;max-width:min(340px,92vw);max-height:min(60vh,520px);overflow:auto;padding:5px;background:#fff;border:1px solid #7f9db9;border-radius:4px;box-shadow:0 8px 24px rgba(15,42,65,.24)}
      #${MENU_ID}[hidden]{display:none!important}
      #${MENU_ID} .spire-more-heading{padding:6px 9px 5px;color:#60758a;font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid #e2e8f0}
      #${MENU_ID} button{width:100%;display:flex;align-items:center;text-align:left;gap:2px;border:0;background:#fff;color:#173a52;padding:8px 10px;border-radius:3px;font:700 12px/1.2 "Segoe UI",Arial,sans-serif;cursor:pointer;white-space:nowrap}
      #${MENU_ID} button:hover,#${MENU_ID} button:focus-visible{background:#e8f2ff;outline:none}
      #${MENU_ID} button.active{background:#dbeafe;color:#174a78}
      #${MENU_ID} button[data-view="flowsheets-view"]::before{content:'▦';display:inline-block;color:#2f7f9f;font-size:14px;line-height:1}
      @media (pointer:coarse){#${MORE_ID}{min-height:36px}#${MENU_ID} button{min-height:40px;font-size:13px}}
    `;
    document.head.appendChild(style);
  }

  function init() {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return false;
    installStyles();

    const originalTabs = () => Array.from(bar.querySelectorAll(':scope > .chart-tab')).filter((tab) => tab.id !== MORE_ID);
    originalTabs().forEach((tab, index) => {
      if (!tab.dataset.spireBaseIndex) tab.dataset.spireBaseIndex = String(index);
      if (tab.dataset.spireUsageBound === '1') return;
      tab.dataset.spireUsageBound = '1';
      tab.addEventListener('click', (event) => {
        if (event.isTrusted) recordUsage(tabView(tab));
        window.setTimeout(scheduleLayout, 0);
      });
    });

    let more = document.getElementById(MORE_ID);
    if (!more) {
      more = document.createElement('button');
      more.type = 'button';
      more.id = MORE_ID;
      more.className = 'chart-tab';
      more.setAttribute('aria-haspopup', 'menu');
      more.setAttribute('aria-controls', MENU_ID);
      more.setAttribute('aria-expanded', 'false');
      more.innerHTML = '<span>More</span><span class="spire-more-count">0</span><span class="spire-more-chevron">▼</span>';
      bar.appendChild(more);
    }

    let menu = document.getElementById(MENU_ID);
    if (!menu) {
      menu = document.createElement('div');
      menu.id = MENU_ID;
      menu.setAttribute('role', 'menu');
      menu.hidden = true;
      bar.appendChild(menu);
    }

    function closeMenu() {
      menu.hidden = true;
      more.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
      if (!menu.querySelector('button')) return;
      menu.hidden = false;
      more.setAttribute('aria-expanded', 'true');
      menu.querySelector('button')?.focus({ preventScroll: true });
    }

    more.addEventListener('click', (event) => {
      event.stopPropagation();
      if (menu.hidden) openMenu(); else closeMenu();
    });

    document.addEventListener('click', (event) => {
      if (!bar.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { closeMenu(); more.focus({ preventScroll: true }); }
    });

    function score(tab, total) {
      const view = tabView(tab);
      const baseIndex = Number(tab.dataset.spireBaseIndex || 0);
      const base = Math.max(0, total - baseIndex);
      return (Number(usage[view] || 0) * 10) + base;
    }

    function rankedTabs() {
      const tabs = originalTabs();
      return tabs.slice().sort((a, b) => {
        const diff = score(b, tabs.length) - score(a, tabs.length);
        if (diff) return diff;
        return Number(a.dataset.spireBaseIndex || 0) - Number(b.dataset.spireBaseIndex || 0);
      });
    }

    function rebuildMenu(hiddenTabs) {
      menu.replaceChildren();
      if (!hiddenTabs.length) return;
      const heading = document.createElement('div');
      heading.className = 'spire-more-heading';
      heading.textContent = 'More Activities';
      menu.appendChild(heading);
      hiddenTabs.forEach((tab) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.view = tabView(tab);
        button.setAttribute('role', 'menuitem');
        button.textContent = String(tab.textContent || '').trim();
        if (tab.classList.contains('active')) button.classList.add('active');
        button.addEventListener('click', () => {
          recordUsage(tabView(tab));
          closeMenu();
          tab.click();
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
        const ranked = rankedTabs();
        if (!ranked.length || bar.clientWidth < 80) return;

        ranked.forEach((tab, index) => {
          tab.style.display = '';
          tab.style.order = String(index);
        });
        more.style.display = 'inline-flex';
        more.style.visibility = 'hidden';
        more.style.order = String(ranked.length + 1);
        menu.style.order = String(ranked.length + 2);

        const available = Math.max(0, bar.clientWidth - 4);
        const widths = new Map(ranked.map((tab) => [tab, Math.ceil(tab.getBoundingClientRect().width) + 1]));
        const allWidth = ranked.reduce((sum, tab) => sum + (widths.get(tab) || 0), 0);

        if (allWidth <= available) {
          ranked.forEach((tab, index) => { tab.style.display = ''; tab.style.order = String(index); });
          more.style.display = 'none';
          more.style.visibility = '';
          rebuildMenu([]);
          closeMenu();
          return;
        }

        const moreWidth = Math.max(68, Math.ceil(more.getBoundingClientRect().width));
        const budget = Math.max(40, available - moreWidth - 3);
        const visible = [];
        let used = 0;
        for (const tab of ranked) {
          const width = widths.get(tab) || 0;
          if (!visible.length || used + width <= budget) {
            visible.push(tab);
            used += width;
          }
        }

        const active = ranked.find((tab) => tab.classList.contains('active'));
        if (active && !visible.includes(active)) {
          const replaceIndex = visible.length - 1;
          if (replaceIndex >= 0) visible.splice(replaceIndex, 1, active);
          else visible.push(active);
        }

        const visibleSet = new Set(visible);
        const visibleRanked = ranked.filter((tab) => visibleSet.has(tab));
        const hiddenRanked = ranked.filter((tab) => !visibleSet.has(tab));

        ranked.forEach((tab) => { tab.style.display = visibleSet.has(tab) ? '' : 'none'; });
        visibleRanked.forEach((tab, index) => { tab.style.order = String(index); });
        more.style.order = String(visibleRanked.length);
        more.style.visibility = '';
        more.style.display = hiddenRanked.length ? 'inline-flex' : 'none';
        more.querySelector('.spire-more-count').textContent = String(hiddenRanked.length);
        rebuildMenu(hiddenRanked);
        if (!hiddenRanked.length) closeMenu();
      } finally {
        layingOut = false;
      }
    }

    function scheduleLayout() {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    }

    window.addEventListener('resize', scheduleLayout, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleLayout, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(scheduleLayout).observe(bar);
    new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === 'attributes' && mutation.attributeName === 'class')) scheduleLayout();
    }).observe(bar, { subtree: true, attributes: true, attributeFilter: ['class'] });

    scheduleLayout();
    window.setTimeout(scheduleLayout, 250);
    window.setTimeout(scheduleLayout, 900);
    return true;
  }

  if (!init()) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else window.setTimeout(init, 50);
  }
})();
