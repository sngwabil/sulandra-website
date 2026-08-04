(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? '' : value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  let initialized = false;
  let resizeTimer = 0;

  function installStyles() {
    if ($('adminThreePanelConsolidationStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminThreePanelConsolidationStyles';
    style.textContent = `
      .ec-retired-workspace-sidebar{display:none!important;width:0!important;min-width:0!important;max-width:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}

      body.ec-panels-ready .grid,
      body.ec-panels-ready .layout,
      body.ec-panels-ready .admin-layout,
      body.ec-panels-ready .workspace-layout{
        display:grid!important;
        grid-template-columns:minmax(0,1fr)!important;
        width:100%!important;
        max-width:none!important;
      }
      body.ec-panels-ready .grid>main,
      body.ec-panels-ready .grid>.main-content,
      body.ec-panels-ready .grid>.modules,
      body.ec-panels-ready .grid>section:not(.ec-retired-workspace-sidebar){
        grid-column:1!important;
        width:100%!important;
        min-width:0!important;
        max-width:none!important;
      }
      body.ec-panels-ready .container{
        width:auto!important;
        max-width:none!important;
        padding-left:12px!important;
        padding-right:12px!important;
        transition:margin-left .22s ease,margin-right .22s ease!important;
      }
      body.ec-left-open .container{margin-left:calc(var(--ec-left-w) + 10px)!important}
      body:not(.ec-left-open) .container{margin-left:48px!important}
      body.ec-right-open .container{margin-right:calc(var(--ec-right-w) + 10px)!important}
      body:not(.ec-right-open) .container{margin-right:48px!important}
      body.ec-panels-ready main,
      body.ec-panels-ready .main-content,
      body.ec-panels-ready .module,
      body.ec-panels-ready .ec-command-center{
        width:100%!important;
        min-width:0!important;
        max-width:none!important;
      }
      body.ec-panels-ready .ec-command-center .ec-grid{
        grid-template-columns:repeat(auto-fit,minmax(240px,1fr))!important;
      }

      .ec-side-rail{top:var(--ec-panel-top)!important;bottom:0!important;border-radius:0!important;max-width:calc(100vw - 42px)!important}
      .ec-side-rail.left{border-left:0!important}.ec-side-rail.right{border-right:0!important}
      .ec-side-rail.right .ec-rail-head{flex-direction:row-reverse!important}
      .ec-side-rail.right .ec-rail-head>div{flex:1 1 auto;text-align:left}
      .ec-side-rail.right .ec-rail-toggle{margin-right:auto!important;margin-left:0!important}
      .ec-rail-handle,.ec-fixed-rail-tab{display:none!important}
      .ec-side-rail.left.closed{transform:translateX(calc(-100% + 42px))!important}
      .ec-side-rail.right.closed{transform:translateX(calc(100% - 42px))!important}
      .ec-side-rail.closed .ec-rail-head{padding-left:6px!important;padding-right:6px!important;justify-content:flex-end!important}
      .ec-side-rail.right.closed .ec-rail-head{flex-direction:row!important;justify-content:flex-start!important}
      .ec-side-rail.closed .ec-rail-head>div{display:none!important}
      .ec-side-rail.closed .ec-rail-toggle{display:grid!important;place-items:center!important;width:30px!important;height:38px!important;border-radius:9px!important;padding:0!important}
      .ec-side-rail:not(.closed) .ec-rail-toggle{flex:0 0 auto}
      .ec-original-tools-section{padding-bottom:5px;border-bottom:1px solid #d7e4ef;margin-bottom:16px}
      .ec-original-tools-section .ec-rail-section-title{display:flex;align-items:center;justify-content:space-between}

      @media(max-width:1280px){
        body.ec-left-open .container,body:not(.ec-left-open) .container{margin-left:12px!important}
        body.ec-right-open .container,body:not(.ec-right-open) .container{margin-right:12px!important}
      }
      @media(max-width:760px){
        body.ec-panels-ready .container{padding-left:8px!important;padding-right:8px!important;margin-left:0!important;margin-right:0!important}
      }
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
      const existingLabels = new Set(Array.from(railScroll.querySelectorAll('.ec-rail-tool strong')).map((node) => node.textContent.trim().toLowerCase()));
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

    const candidates = [sideNav.closest('aside'), sideNav.closest('.sidebar'), sideNav.closest('.side-panel'), sideNav.parentElement].filter(Boolean);
    const container = candidates.find((node) => node !== document.body && !node.classList.contains('main-content')) || sideNav;
    container.classList.add('ec-retired-workspace-sidebar');
  }

  function toggleRail(side) {
    const rail = side === 'left' ? $('enterpriseOperationsRail') : $('enterpriseLiveRail');
    if (!rail) return;
    const bodyClass = side === 'left' ? 'ec-left-open' : 'ec-right-open';
    const shouldOpen = rail.classList.contains('closed') || !document.body.classList.contains(bodyClass);
    rail.classList.toggle('closed', !shouldOpen);
    document.body.classList.toggle(bodyClass, shouldOpen);
    syncRailButtons();
  }

  function syncRailButtons() {
    const leftRail = $('enterpriseOperationsRail');
    const rightRail = $('enterpriseLiveRail');
    const leftButton = leftRail?.querySelector('.ec-rail-toggle');
    const rightButton = rightRail?.querySelector('.ec-rail-toggle');
    const leftOpen = Boolean(leftRail && !leftRail.classList.contains('closed') && document.body.classList.contains('ec-left-open'));
    const rightOpen = Boolean(rightRail && !rightRail.classList.contains('closed') && document.body.classList.contains('ec-right-open'));
    if (leftButton) {
      leftButton.textContent = leftOpen ? '‹' : '›';
      leftButton.setAttribute('aria-label', leftOpen ? 'Close Operations panel' : 'Open Operations panel');
      leftButton.setAttribute('aria-expanded', String(leftOpen));
    }
    if (rightButton) {
      rightButton.textContent = rightOpen ? '›' : '‹';
      rightButton.setAttribute('aria-label', rightOpen ? 'Close Live Activity panel' : 'Open Live Activity panel');
      rightButton.setAttribute('aria-expanded', String(rightOpen));
    }
  }

  function removeProtrudingTabs() {
    $('ecOperationsFixedTab')?.remove();
    $('ecLiveFixedTab')?.remove();
    document.querySelectorAll('.ec-fixed-rail-tab').forEach((node) => node.remove());
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
    syncRailButtons();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    installStyles();
    retireOriginalOperationsPanel();
    removeProtrudingTabs();
    replaceRailHeaderToggles();
    calculatePanelTop();

    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(calculatePanelTop, 120);
    }, { passive: true });

    window.setTimeout(() => {
      removeProtrudingTabs();
      replaceRailHeaderToggles();
      calculatePanelTop();
    }, 750);
  }

  function waitForPanels(attempt = 0) {
    if ($('enterpriseOperationsRail') && $('enterpriseLiveRail') && $('sideModuleNav')) {
      initialize();
      return;
    }
    if (attempt < 80) window.setTimeout(() => waitForPanels(attempt + 1), 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => waitForPanels(), { once: true });
  else waitForPanels();
})();
