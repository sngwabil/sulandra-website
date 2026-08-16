(() => {
  'use strict';

  // SPIRE_MAR_MOUSE_NAV_V1
  if (window.__SPIRE_MAR_MOUSE_NAV_V1) return;
  window.__SPIRE_MAR_MOUSE_NAV_V1 = true;

  const HOUR_SCROLL_FRACTION = 0.66;
  let observer = null;
  let pan = null;

  function ensureStyles() {
    if (document.getElementById('spireMarMouseNavigationStyles')) return;
    const style = document.createElement('style');
    style.id = 'spireMarMouseNavigationStyles';
    style.textContent = `
      #mar-view .spire-mar-overdue-queue{min-width:0!important;max-width:100%!important;overflow:hidden!important}
      #mar-view .spire-mar-overdue-head{min-height:28px!important;padding:4px 9px!important}
      #mar-view .spire-mar-overdue-head>span:not(.spacer){display:none!important}
      #mar-view .spire-mar-overdue-list{
        display:grid!important;
        grid-template-columns:repeat(auto-fit,minmax(190px,1fr))!important;
        gap:6px!important;
        width:100%!important;
        min-width:0!important;
        max-width:100%!important;
        max-height:240px!important;
        overflow-y:auto!important;
        overflow-x:hidden!important;
        overscroll-behavior:contain!important;
        scrollbar-gutter:stable!important;
        padding:6px 9px!important;
      }
      #mar-view .spire-mar-overdue-item{min-width:0!important;max-width:none!important;width:auto!important}
      #mar-view [data-mar-scroll]{scrollbar-width:auto!important;overscroll-behavior:contain!important}
      #mar-view [data-mar-scroll]::-webkit-scrollbar{height:12px;width:12px}
      #mar-view [data-mar-scroll]::-webkit-scrollbar-thumb{border-radius:8px}
      #mar-view .spire-mar-time-header{cursor:grab}
      #mar-view .spire-mar-time-header.spire-mar-panning{cursor:grabbing}
      #mar-view .spire-mar-hour-nav{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto}
      #mar-view .spire-mar-hour-nav .spire-mar-command{width:28px;padding:3px 5px;font-size:13px;line-height:1}
      @media(max-width:1100px){
        #mar-view .spire-mar-overdue-list{grid-template-columns:repeat(auto-fit,minmax(175px,1fr))!important;max-height:300px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function compactOverdueHeader(host) {
    const head = host.querySelector('.spire-mar-overdue-head');
    if (!head) return;
    const strong = head.querySelector('strong');
    if (strong) {
      const match = String(strong.textContent || '').match(/\d+/);
      strong.textContent = match ? `Prior-day overdue: ${match[0]}` : 'Prior-day overdue';
    }
    head.querySelectorAll('span:not(.spacer)').forEach((node) => node.remove());
  }

  function ensureHourNavigation(host) {
    const actions = host.querySelector('.spire-mar-filter-actions');
    if (!actions || actions.querySelector('[data-spire-mar-hour-nav]')) return;
    const nav = document.createElement('span');
    nav.className = 'spire-mar-hour-nav';
    nav.dataset.spireMarHourNav = '1';
    nav.innerHTML = `
      <button type="button" class="spire-mar-command" data-spire-mar-hour-scroll="-1" title="Earlier hours" aria-label="Scroll MAR to earlier hours">◀</button>
      <button type="button" class="spire-mar-command" data-spire-mar-hour-scroll="1" title="Later hours" aria-label="Scroll MAR to later hours">▶</button>
    `;
    const date = actions.querySelector('.spire-mar-date');
    if (date) actions.insertBefore(nav, date);
    else actions.appendChild(nav);
  }

  function decorate(host) {
    if (!host || !host.isConnected) return;
    ensureStyles();
    compactOverdueHeader(host);
    ensureHourNavigation(host);
  }

  function horizontalStep(scroll) {
    return Math.max(260, Math.round(scroll.clientWidth * HOUR_SCROLL_FRACTION));
  }

  function onClick(host, event) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-spire-mar-hour-scroll]');
    if (!button) return;
    const scroll = host.querySelector('[data-mar-scroll]');
    if (!scroll) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = Number(button.dataset.spireMarHourScroll || 0);
    scroll.scrollBy({ left: direction * horizontalStep(scroll), behavior: 'smooth' });
  }

  function onWheel(host, event) {
    if (!(event.target instanceof Element)) return;

    const overdue = event.target.closest('.spire-mar-overdue-list');
    if (overdue) {
      const verticalOverflow = overdue.scrollHeight > overdue.clientHeight + 2;
      const horizontalOverflow = overdue.scrollWidth > overdue.clientWidth + 2;
      if (horizontalOverflow && !verticalOverflow) {
        overdue.scrollLeft += event.deltaX || event.deltaY;
        event.preventDefault();
      }
      return;
    }

    const scroll = event.target.closest('[data-mar-scroll]');
    if (!scroll || !host.contains(scroll)) return;
    if (scroll.scrollWidth <= scroll.clientWidth + 2) return;

    const verticalOverflow = scroll.scrollHeight > scroll.clientHeight + 2;
    const trackpadHorizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const useHorizontal = event.shiftKey || trackpadHorizontal || !verticalOverflow;
    if (!useHorizontal) return;

    const delta = trackpadHorizontal ? event.deltaX : event.deltaY;
    if (!delta) return;
    scroll.scrollLeft += delta;
    event.preventDefault();
  }

  function startPan(host, event) {
    if (!(event.target instanceof Element) || event.button !== 0) return;
    const header = event.target.closest('.spire-mar-time-header');
    const scroll = event.target.closest('[data-mar-scroll]');
    if (!header || !scroll || !host.contains(scroll)) return;
    pan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startLeft: scroll.scrollLeft,
      scroll,
      header,
    };
    header.classList.add('spire-mar-panning');
    header.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function movePan(event) {
    if (!pan || event.pointerId !== pan.pointerId) return;
    pan.scroll.scrollLeft = pan.startLeft - (event.clientX - pan.startX);
    event.preventDefault();
  }

  function endPan(event) {
    if (!pan || (event.pointerId != null && event.pointerId !== pan.pointerId)) return;
    pan.header.classList.remove('spire-mar-panning');
    try { pan.header.releasePointerCapture?.(pan.pointerId); } catch {}
    pan = null;
  }

  function bind(host) {
    if (!host || host.dataset.spireMarMouseNavigation === '1') return;
    host.dataset.spireMarMouseNavigation = '1';
    ensureStyles();
    decorate(host);

    host.addEventListener('click', (event) => onClick(host, event), true);
    host.addEventListener('wheel', (event) => onWheel(host, event), { passive: false });
    host.addEventListener('pointerdown', (event) => startPan(host, event));
    host.addEventListener('pointermove', movePan);
    host.addEventListener('pointerup', endPan);
    host.addEventListener('pointercancel', endPan);

    observer = new MutationObserver(() => decorate(host));
    observer.observe(host, { childList: true, subtree: true });
  }

  function install() {
    const host = document.getElementById('mar-view');
    if (!host) return false;
    bind(host);
    return true;
  }

  window.__SPIRE_MAR_MOUSE_NAV_CONTRACT = Object.freeze({
    marker: 'SPIRE_MAR_MOUSE_NAV_V1',
    overdueGridVerticalScroll: true,
    compactOverdueHeader: true,
    mouseWheelHorizontalWhenNeeded: true,
    shiftWheelHorizontal: true,
    trackpadHorizontal: true,
    headerDragPan: true,
    hourArrowControls: true,
    scopedObserver: '#mar-view',
    wholeDocumentObserver: false,
  });

  if (!install()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 40) window.clearInterval(timer);
    }, 250);
  }
})();