(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? '' : value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function installStyles() {
    if ($('adminThreePanelConsolidationStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminThreePanelConsolidationStyles';
    style.textContent = `
      .ec-retired-workspace-sidebar{display:none!important;width:0!important;min-width:0!important;max-width:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}
      body.ec-panels-ready .layout,body.ec-panels-ready .admin-layout,body.ec-panels-ready .workspace-layout{grid-template-columns:minmax(0,1fr)!important}
      body.ec-panels-ready main,body.ec-panels-ready .main-content{min-width:0!important}
      .ec-side-rail{top:var(--ec-panel-top)!important;bottom:0!important;border-radius:0!important;max-width:calc(100vw - 42px)!important}
      .ec-side-rail.left{border-left:0!important}.ec-side-rail.right{border-right:0!important}
      .ec-rail-handle{display:none!important}
      .ec-fixed-rail-tab{position:fixed;top:var(--ec-panel-top);z-index:45250;height:48px;min-width:48px;border:0;background:linear-gradient(135deg,#0d3154,#075b9c);color:#fff;font-weight:900;cursor:pointer;box-shadow:0 10px 24px rgba(15,36,66,.2);display:flex;align-items:center;justify-content:center;gap:7px;padding:0 12px;transition:left .22s ease,right .22s ease,border-radius .22s ease;white-space:nowrap}
      .ec-fixed-rail-tab.left{left:var(--ec-left-w);border-radius:0 0 13px 0}.ec-fixed-rail-tab.right{right:var(--ec-right-w);border-radius:0 0 0 13px}
      body:not(.ec-left-open) .ec-fixed-rail-tab.left{left:0;border-radius:0 0 13px 0}
      body:not(.ec-right-open) .ec-fixed-rail-tab.right{right:0;border-radius:0 0 0 13px}
      .ec-fixed-rail-tab .ec-tab-label{font-size:12px}.ec-fixed-rail-tab .ec-tab-arrow{font-size:20px;line-height:1}
      .ec-original-tools-section{padding-bottom:5px;border-bottom:1px solid #d7e4ef;margin-bottom:16px}
      .ec-original-tools-section .ec-rail-section-title{display:flex;align-items:center;justify-content:space-between}
      @media(max-width:760px){.ec-fixed-rail-tab .ec-tab-label{display:none}.ec-fixed-rail-tab{min-width:44px;padding:0 10px}}
    `;
    document.head.appendChild(style);
  }

  function calculatePanelTop() {
    const nav = $('topModuleNav') || document.querySelector('nav[aria-label="Admin modules"]') || document.querySelector('header + nav');
    const fallback = document.querySelector('.top-nav,.module-nav,.admin-nav');
    const anchor = nav || fallback;
    const bottom = anchor ? Math.round(anchor.getBoundingClientRect().bottom) : 252;
    document.body.style.setProperty('--ec-panel-top', `${Math.max(0, bottom)}px`);
  }

  function retireOriginalOperationsPanel() {
    const sideNav = $('sideModuleNav');
    if (!sideNav || sideNav.dataset.ecRetired === 'true') return;
    sideNav.dataset.ecRetired = 'true';

    const railScroll = $('enterpriseOperationsRail')?.querySelector('.ec-rail-scroll');
    if (railScroll) {
      const existingLabels = new Set(Array.from(railScroll.querySelectorAll('.ec-rail-tool strong')).map(node => node.textContent.trim().toLowerCase()));
      const section = document.createElement('section');
      section.className = 'ec-rail-section ec-original-tools-section';
      section.innerHTML = '<h3 class="ec-rail-section-title"><span>Core Portal Navigation</span><span>Live</span></h3>';

      Array.from(sideNav.querySelectorAll('button,a')).forEach((original) => {
        const label = (original.childNodes[0]?.textContent || original.textContent || '').trim().replace(/\s+/g, ' ');
        if (!label || existingLabels.has(label.toLowerCase())) return;
        const detail = original.querySelector('small')?.textContent?.trim() || 'Open portal workspace';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ec-rail-tool';
        button.innerHTML = `<span class="icon">◈</span><span><strong>${esc(label)}</strong><span>${esc(detail)}</span></span>`;
        button.addEventListener('click', () => original.click());
        section.appendChild(button);
        existingLabels.add(label.toLowerCase());
      });

      if (section.querySelector('.ec-rail-tool')) railScroll.prepend(section);
    }

    const candidates = [
      sideNav.closest('aside'),
      sideNav.closest('.sidebar'),
      sideNav.closest('.side-panel'),
      sideNav.parentElement
    ].filter(Boolean);
    const container = candidates.find(node => node !== document.body && !node.classList.contains('main-content')) || sideNav;
    container.classList.add('ec-retired-workspace-sidebar');
  }

  function toggleRail(side) {
    const rail = side === 'left' ? $('enterpriseOperationsRail') : $('enterpriseLiveRail');
    if (!rail) return;
    const bodyClass = side === 'left' ? 'ec-left-open' : 'ec-right-open';
    const shouldOpen = rail.classList.contains('closed') || !document.body.classList.contains(bodyClass);
    rail.classList.toggle('closed', !shouldOpen);
    document.body.classList.toggle(bodyClass, shouldOpen);
    syncTabs();
  }

  function syncTabs() {
    const leftOpen = document.body.classList.contains('ec-left-open') && !$('enterpriseOperationsRail')?.classList.contains('closed');
    const rightOpen = document.body.classList.contains('ec-right-open') && !$('enterpriseLiveRail')?.classList.contains('closed');
    const left = $('ecOperationsFixedTab');
    const right = $('ecLiveFixedTab');
    if (left) {
      left.setAttribute('aria-expanded', String(leftOpen));
      left.querySelector('.ec-tab-arrow').textContent = leftOpen ? '‹' : '›';
      left.title = leftOpen ? 'Close Operations panel' : 'Open Operations panel';
    }
    if (right) {
      right.setAttribute('aria-expanded', String(rightOpen));
      right.querySelector('.ec-tab-arrow').textContent = rightOpen ? '›' : '‹';
      right.title = rightOpen ? 'Close Live Activity panel' : 'Open Live Activity panel';
    }
  }

  function installPermanentTabs() {
    if (!$('ecOperationsFixedTab')) {
      const left = document.createElement('button');
      left.id = 'ecOperationsFixedTab';
      left.type = 'button';
      left.className = 'ec-fixed-rail-tab left';
      left.innerHTML = '<span class="ec-tab-label">Operations</span><span class="ec-tab-arrow">‹</span>';
      left.addEventListener('click', () => toggleRail('left'));
      document.body.appendChild(left);
    }
    if (!$('ecLiveFixedTab')) {
      const right = document.createElement('button');
      right.id = 'ecLiveFixedTab';
      right.type = 'button';
      right.className = 'ec-fixed-rail-tab right';
      right.innerHTML = '<span class="ec-tab-arrow">›</span><span class="ec-tab-label">Live</span>';
      right.addEventListener('click', () => toggleRail('right'));
      document.body.appendChild(right);
    }
    syncTabs();
  }

  function replaceRailHeaderToggles() {
    const leftButton = $('enterpriseOperationsRail')?.querySelector('.ec-rail-toggle');
    const rightButton = $('enterpriseLiveRail')?.querySelector('.ec-rail-toggle');
    if (leftButton && leftButton.dataset.ecFixed !== 'true') {
      leftButton.dataset.ecFixed = 'true';
      leftButton.onclick = () => toggleRail('left');
    }
    if (rightButton && rightButton.dataset.ecFixed !== 'true') {
      rightButton.dataset.ecFixed = 'true';
      rightButton.onclick = () => toggleRail('right');
    }
  }

  function initialize() {
    installStyles();
    calculatePanelTop();
    retireOriginalOperationsPanel();
    installPermanentTabs();
    replaceRailHeaderToggles();

    window.addEventListener('resize', calculatePanelTop, { passive: true });
    window.addEventListener('scroll', calculatePanelTop, { passive: true });

    const observer = new MutationObserver(() => {
      retireOriginalOperationsPanel();
      replaceRailHeaderToggles();
      installPermanentTabs();
      calculatePanelTop();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function waitForPanels(attempt = 0) {
    if ($('enterpriseOperationsRail') && $('enterpriseLiveRail') && $('sideModuleNav')) {
      initialize();
      return;
    }
    if (attempt < 120) window.setTimeout(() => waitForPanels(attempt + 1), 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => waitForPanels(), { once: true });
  else waitForPanels();
})();
