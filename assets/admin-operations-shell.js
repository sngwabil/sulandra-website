(() => {
  'use strict';

  if (!/\/admin-operations\.html$/i.test(window.location.pathname)) return;

  const OPERATIONS_SIDEBAR_KEY = 'sulandra:operations:sidebar-open';
  const OWNER_ONLY_RUNTIME_IDS = Object.freeze([
    'canonical-admin-shell',
    'canonical-admin-owner',
    'canonical-admin-live-dashboard',
    'canonical-admin-analog-clock',
    'canonical-admin-dashboard-cleanup',
  ]);
  const FOLDER_LANDINGS = Object.freeze({
    'company-management': '/company-documents.html',
    'people-hr': '/employee360.html',
    'clients-spire': '/spire-admin.html',
    'billing-revenue': '/revenue-cycle.html',
    'compliance-quality': '/company-compliance.html',
    'communications-learning': '/intranet-control.html',
    'system-administration': '/admin-users.html',
  });
  const NEW_TAB_SELECTOR = [
    '#topModuleNav a', '#topModuleNav button',
    '#sideModuleNav a', '#sideModuleNav button',
    '.ops-folder-card', '.ops-hero-actions a', '.ops-quick-link', '.lifecycle-stage-card a.btn',
  ].join(',');

  function ensureCanonicalSso() {
    if (window.SulandraSSO || document.querySelector('script[data-canonical-admin-sso]')) return;
    const script = document.createElement('script');
    script.src = '/assets/sulandra-sso-session.js?v=20260806-sso-1';
    script.dataset.canonicalAdminSso = 'true';
    script.async = false;
    document.head.appendChild(script);
  }

  function suppressOwnerOnlyRuntimes() {
    for (const id of OWNER_ONLY_RUNTIME_IDS) {
      if (document.getElementById(id)) continue;
      const sentinel = document.createElement('script');
      sentinel.id = id;
      sentinel.type = 'application/json';
      sentinel.dataset.operationsSuppressedOwnerRuntime = 'true';
      sentinel.textContent = '{}';
      document.head.appendChild(sentinel);
    }
  }

  function ensureModuleHosts() {
    if (document.getElementById('module-employees')) return;
    const onboarding = document.getElementById('module-onboarding');
    if (!onboarding?.parentElement) return;
    const employee = document.createElement('section');
    employee.id = 'module-employees';
    employee.className = 'card module';
    employee.setAttribute('aria-label', 'Employee 360 company workspace');
    employee.innerHTML = '<h1>Employee 360</h1><p class="sub">Loading the selected company employee directory, permissions, compliance, workforce, documents, learning, payroll, benefits, leave, safety, analytics and audit tools…</p>';
    onboarding.parentElement.insertBefore(employee, onboarding);
  }

  function installSidebarToggle() {
    if (document.getElementById('operationsSidebarToggle')) return;
    const sidebar = document.querySelector('.sidebar');
    const grid = document.querySelector('.grid');
    if (!sidebar || !grid) return;

    let styles = document.getElementById('operationsSidebarToggleStyles');
    if (!styles) {
      styles = document.createElement('style');
      styles.id = 'operationsSidebarToggleStyles';
      styles.textContent = `
        .operations-sidebar-toggle{position:fixed;z-index:1900;top:52%;transform:translateY(-50%);width:30px;height:44px;border:0;border-radius:0 10px 10px 0;background:#0b5c9b;color:#fff;box-shadow:0 5px 16px rgba(0,75,141,.25);display:grid;place-items:center;padding:0;cursor:pointer;font:900 20px/1 "Segoe UI",Arial,sans-serif;transition:left .2s ease,background .15s ease}
        .operations-sidebar-toggle:hover{background:#074b80}.operations-sidebar-toggle span{transition:transform .2s ease}
        body.operations-sidebar-collapsed .grid{grid-template-columns:minmax(0,1fr)!important;gap:0!important}
        body.operations-sidebar-collapsed .sidebar{display:none!important;width:0!important;min-width:0!important;max-width:0!important;overflow:hidden!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}
        @media(max-width:980px){.operations-sidebar-toggle{top:auto;bottom:22px;transform:none}}
      `;
      document.head.appendChild(styles);
    }

    const toggle = document.createElement('button');
    toggle.id = 'operationsSidebarToggle';
    toggle.className = 'operations-sidebar-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', sidebar.id || 'sideModuleNav');
    toggle.setAttribute('aria-label', 'Toggle Operations folders');
    toggle.innerHTML = '<span aria-hidden="true">‹</span>';
    document.body.appendChild(toggle);

    const syncPosition = (open) => {
      if (!open) {
        toggle.style.left = '0px';
        return;
      }
      requestAnimationFrame(() => {
        const rect = sidebar.getBoundingClientRect();
        toggle.style.left = `${Math.max(0, Math.round(rect.right) - 2)}px`;
      });
    };

    const apply = (open, persist = true) => {
      document.body.classList.toggle('operations-sidebar-collapsed', !open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('span').textContent = open ? '‹' : '›';
      toggle.title = open ? 'Close Operations folders' : 'Open Operations folders';
      if (persist) localStorage.setItem(OPERATIONS_SIDEBAR_KEY, String(open));
      syncPosition(open);
    };

    toggle.addEventListener('click', () => apply(document.body.classList.contains('operations-sidebar-collapsed')));
    window.addEventListener('resize', () => syncPosition(!document.body.classList.contains('operations-sidebar-collapsed')));
    const saved = localStorage.getItem(OPERATIONS_SIDEBAR_KEY);
    apply(saved === null ? true : saved === 'true', false);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  }

  function moduleRoute(key) {
    if (key === 'employees') return '/employee360.html';
    return `/admin-operations.html#${encodeURIComponent(key || 'dashboard')}`;
  }

  function serviceOperationsLanding() {
    const code = String(window.SulandraCompanyContext?.current?.()?.code || document.body?.dataset?.legalEntityCode || '').toUpperCase();
    if (code === 'HOME_HEALTH') return '/home-health-referral-inbox.html';
    if (code === 'NMT') return '/nmt-dispatch.html';
    if (code === 'SCLS') return '/scls-residential.html';
    return '/admin-operations.html#service-homes';
  }

  function folderLanding(key) {
    return key === 'service-operations' ? serviceOperationsLanding() : (FOLDER_LANDINGS[key] || '/admin-operations.html#dashboard');
  }

  function folderIcon(key) {
    const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
    const icons = {
      'company-management': '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h2m2 0h2M9 14h2m2 0h2M10 21v-3h4v3"/>',
      'people-hr': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      'clients-spire': '<path d="M12 21s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.4-7 10-7 10Z"/><path d="M9 12h6M12 9v6"/>',
      'service-operations': '<path d="M9 5h6M9 3v4M15 3v4M5 7h14v14H5z"/><path d="M8 11h8M8 15h5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
      'billing-revenue': '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h5M8 15h3M16 15c-1.1 0-2 .6-2 1.4s.9 1.4 2 1.4 2 .6 2 1.4"/>',
      'compliance-quality': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
      'communications-learning': '<path d="M3 11v2h4l7 4V7l-7 4H3Z"/><path d="M14 9c2 0 4-2 4-4v14c0-2-2-4-4-4M5 15l1 5h3l-1-5"/>',
      'system-administration': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1a1.7 1.7 0 0 0-1.4-1.65 1.7 1.7 0 0 0-1.55.46l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.75 8.2a1.7 1.7 0 0 0-.46-1.55l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.8 4.75a1.7 1.7 0 0 0 1.55-.46l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.08.38.3.73.6 1 .3.26.68.4 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7 1.6Z"/>',
    };
    return `<svg ${common}>${icons[key] || icons['system-administration']}</svg>`;
  }

  function installOperationsUiStyles() {
    if (document.getElementById('operationsUiUpgradeStyles')) return;
    const styles = document.createElement('style');
    styles.id = 'operationsUiUpgradeStyles';
    styles.textContent = `
      .ops-folder-card{display:block!important;text-decoration:none!important;color:inherit!important;min-height:168px!important;padding:18px!important}
      .ops-folder-icon{display:grid!important;place-items:center!important;width:46px!important;height:46px!important;border-radius:12px!important;font-size:0!important}
      .ops-folder-icon svg{width:27px!important;height:27px!important;display:block!important}
      .ops-folder-card h3{font-size:17px!important;line-height:1.3!important;margin:12px 0 5px!important;font-weight:900!important}
      .ops-folder-card p{font-size:13px!important;line-height:1.5!important;min-height:39px!important}
      .ops-folder-card .ops-folder-action{font-size:12.5px!important;line-height:1.35!important;margin-top:12px!important;font-weight:900!important}
      .ops-section-head h2{font-size:22px!important;line-height:1.25!important}.ops-section-head p{font-size:12.5px!important;line-height:1.45!important}
      .ops-quick-link{font-size:13.5px!important;line-height:1.35!important}.ops-quick-link small{font-size:11.5px!important;line-height:1.4!important}
      #sideModuleNav .admin-nav-folder summary{font-size:14px!important;line-height:1.3!important}
      #sideModuleNav .admin-folder-link{font-size:13.5px!important;line-height:1.35!important;padding:10px 11px!important}
      #sideModuleNav .admin-folder-link small{font-size:10.5px!important;line-height:1.35!important}
      #topModuleNav a,#topModuleNav button{font-size:13px!important;line-height:1.3!important}
      html.operations-independent-scroll,body.operations-independent-scroll{overflow:hidden!important}
      html.operations-independent-scroll .grid{min-height:0!important;align-items:stretch!important}
      html.operations-independent-scroll .sidebar{position:relative!important;top:auto!important;max-height:none!important;height:100%!important;overflow-y:auto!important;overscroll-behavior:contain;scrollbar-gutter:stable}
      html.operations-independent-scroll .grid>section{height:100%!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable}
      @media(max-width:980px){html.operations-independent-scroll,body.operations-independent-scroll{overflow:auto!important}html.operations-independent-scroll .grid{height:auto!important}html.operations-independent-scroll .sidebar,html.operations-independent-scroll .grid>section{height:auto!important;overflow:visible!important}}
    `;
    document.head.appendChild(styles);
  }

  function copyTabSession(child) {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (!key) continue;
      const value = sessionStorage.getItem(key);
      if (value !== null) child.sessionStorage.setItem(key, value);
    }
  }

  function openNewTab(href) {
    if (!href) return false;
    let destination;
    try { destination = new URL(href, window.location.href); }
    catch { return false; }

    if (destination.origin !== window.location.origin) {
      return Boolean(window.open(destination.href, '_blank', 'noopener,noreferrer'));
    }

    const child = window.open('about:blank', '_blank');
    if (!child) return false;
    try {
      copyTabSession(child);
      child.opener = null;
      child.location.replace(destination.href);
      return true;
    } catch (error) {
      try { child.location.replace(destination.href); }
      catch { try { child.close(); } catch {} }
      console.error('[Sulandra Operations] Unable to hand off the tab-scoped session.', error);
      return false;
    }
  }

  function controlHref(control) {
    if (!control) return '';
    if (control.dataset?.module) return moduleRoute(control.dataset.module);
    return control.dataset?.sulandraRoute || control.getAttribute?.('href') || '';
  }

  function installNewTabGuard() {
    if (document.documentElement.dataset.operationsNewTabGuard === 'true') return;
    document.documentElement.dataset.operationsNewTabGuard = 'true';
    window.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const control = event.target?.closest?.(NEW_TAB_SELECTOR);
      if (!control || control.hasAttribute?.('download')) return;
      const href = controlHref(control);
      if (!href || href === '#') return;
      let destination;
      try { destination = new URL(href, window.location.href); }
      catch { return; }
      if (!/^https?:$/.test(destination.protocol) || destination.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!openNewTab(destination.href)) {
        window.alert('Your browser blocked the new workspace tab. Allow pop-ups for sulandrahealth.com and try again.');
      }
    }, true);
  }

  function upgradeModuleButtons() {
    document.querySelectorAll('#topModuleNav button[data-module],#sideModuleNav button[data-module]').forEach((button) => {
      const key = button.dataset.module;
      const link = document.createElement('a');
      [...button.attributes].forEach((attr) => {
        if (attr.name !== 'type' && attr.name !== 'data-module') link.setAttribute(attr.name, attr.value);
      });
      link.href = moduleRoute(key);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.dataset.operationsModuleRoute = key || 'dashboard';
      link.innerHTML = button.innerHTML;
      button.replaceWith(link);
    });
  }

  function upgradeRouteLinks() {
    document.querySelectorAll('#topModuleNav a[data-sulandra-route],#sideModuleNav a[data-sulandra-route]').forEach((link) => {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.removeAttribute('data-sulandra-route');
      link.dataset.operationsRoute = 'new-tab';
    });
    document.querySelectorAll('.ops-hero-actions a,.ops-quick-link,.lifecycle-stage-card a.btn').forEach((link) => {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
  }

  function upgradeFolderCards() {
    document.querySelectorAll('.ops-folder-card[data-open-ops-folder]').forEach((card) => {
      const key = card.dataset.openOpsFolder;
      const title = card.querySelector('h3')?.textContent?.trim() || 'Operations workspace';
      const copy = card.querySelector('p')?.textContent?.trim() || '';
      const link = document.createElement('a');
      link.className = card.className;
      link.href = folderLanding(key);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.dataset.opsFolderRoute = key || '';
      link.setAttribute('aria-label', `Open ${title} in a new tab`);
      link.innerHTML = `<span class="ops-folder-icon">${folderIcon(key)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p><span class="ops-folder-action">Open workspace ↗</span>`;
      card.replaceWith(link);
    });
  }

  function normalizeOperationsControls() {
    upgradeModuleButtons();
    upgradeRouteLinks();
    upgradeFolderCards();
  }

  function installIndependentWorkspaceScroll() {
    if (document.documentElement.dataset.operationsIndependentScroll === 'true') return;
    document.documentElement.dataset.operationsIndependentScroll = 'true';
    const grid = document.querySelector('.grid');
    const sidebar = document.querySelector('.sidebar');
    const workspace = grid?.querySelector(':scope > section');
    if (!grid || !sidebar || !workspace) return;

    let queued = false;
    const apply = () => {
      queued = false;
      if (window.innerWidth <= 980) {
        document.documentElement.classList.remove('operations-independent-scroll');
        document.body.classList.remove('operations-independent-scroll');
        grid.style.removeProperty('height');
        return;
      }
      const top = Math.max(0, grid.getBoundingClientRect().top);
      const height = Math.max(320, Math.floor(window.innerHeight - top - 10));
      grid.style.height = `${height}px`;
      document.documentElement.classList.add('operations-independent-scroll');
      document.body.classList.add('operations-independent-scroll');
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('sulandra:company-change', schedule);
    apply();
  }

  function observeOperationsControls() {
    if (document.documentElement.dataset.operationsUiObserver === 'true') return;
    document.documentElement.dataset.operationsUiObserver = 'true';
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        normalizeOperationsControls();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('sulandra:company-change', () => requestAnimationFrame(normalizeOperationsControls));
  }

  function mount() {
    ensureCanonicalSso();
    suppressOwnerOnlyRuntimes();
    ensureModuleHosts();
    installSidebarToggle();
    installOperationsUiStyles();
    installNewTabGuard();
    normalizeOperationsControls();
    installIndependentWorkspaceScroll();
    observeOperationsControls();
    document.documentElement.dataset.adminInformationArchitecture = 'company-operations-v1';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();