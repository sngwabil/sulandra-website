(() => {
  'use strict';

  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const DEPARTMENT_KEY = 'sulandra:selected-department-id';
  const originalFetch = window.fetch.bind(window);
  const state = { loaded: false, selectedEntityId: '', selectedDepartmentId: '', primaryEntityId: '', entities: [], enterpriseOwner: false };

  const token = () => TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';
  const stored = (key) => sessionStorage.getItem(key) || localStorage.getItem(key) || '';
  const save = (key, value) => {
    if (value) { sessionStorage.setItem(key, value); localStorage.setItem(key, value); }
    else { sessionStorage.removeItem(key); localStorage.removeItem(key); }
  };
  const apiUrl = (path) => /^https?:\/\//i.test(path) ? path : API + path;
  const requestUrl = (input) => typeof input === 'string' ? input : input instanceof URL ? input.href : String(input?.url || '');
  const isSulandraApi = (url) => url.startsWith(API + '/api/') || url.startsWith('/api/') || url.startsWith(`${location.origin}/api/`);
  const isContextRequest = (url) => /\/api\/entity-context(?:\?|$)/.test(url);

  function sharedWorkspacePath() {
    const pathname = location.pathname.toLowerCase();
    const pages = [
      '/spire-admin.html',
      '/spire-medication-qualifications.html',
      '/spire-training.html',
      '/company-documents.html',
      '/client-intake.html',
      '/home-health.html',
      '/home-health-visits.html',
      '/home-health-referrals.html',
      '/nmt-orders.html',
      '/nmt-dispatch.html',
      '/workforce-admin.html',
    ];
    return pages.some((suffix) => pathname.endsWith(suffix));
  }

  function compactWorkspaceHeaderPath() {
    const pathname = location.pathname.toLowerCase();
    const pages = [
      '/spire-admin.html',
      '/spire-medication-qualifications.html',
      '/spire-training.html',
      '/company-documents.html',
      '/client-intake.html',
      '/home-health.html',
      '/home-health-visits.html',
      '/home-health-referrals.html',
      '/nmt-orders.html',
      '/nmt-dispatch.html',
      '/workforce-admin.html',
      '/company-compliance.html',
      '/employee-ohio-screening.html',
      '/employee-ohio-screening-workspace.html',
      '/spire-evv-test-console.html',
      '/dodd-billing-rules.html',
      '/revenue-claim-exchange.html',
      '/revenue-cycle.html',
      '/enterprise-apps.html',
    ];
    return pages.some((suffix) => pathname.endsWith(suffix));
  }

  function installSignaturePlatformBar() {
    if (!sharedWorkspacePath() || document.getElementById('sulandraGlobalPlatformBar') || document.querySelector('nav.platform')) return;
    const style = document.createElement('style');
    style.id = 'sulandra-signature-platform-style';
    style.textContent = `
      #sulandraGlobalPlatformBar{background:#083a67;color:#fff;border-bottom:4px solid #d4a72c;display:flex;gap:10px;align-items:center;padding:12px 24px;overflow:auto;position:relative;z-index:90;font-family:"Segoe UI",Arial,sans-serif}
      #sulandraGlobalPlatformBar strong{font-size:18px;margin-right:auto;white-space:nowrap}
      #sulandraGlobalPlatformBar a{color:#fff;text-decoration:none;border:1px solid #ffffff55;padding:8px 13px;border-radius:999px;font-weight:800;white-space:nowrap}
      #sulandraGlobalPlatformBar a:hover,#sulandraGlobalPlatformBar a:focus-visible{background:#ffffff18;border-color:#ffffff88;outline:none}
      @media(max-width:900px){#sulandraGlobalPlatformBar{padding:10px 14px}#sulandraGlobalPlatformBar strong{font-size:16px}}
    `;
    document.head.appendChild(style);
    const nav = document.createElement('nav');
    nav.id = 'sulandraGlobalPlatformBar';
    nav.setAttribute('aria-label', 'Sulandra Health Platform');
    nav.innerHTML = '<strong>Sulandra Health Platform</strong><a href="/admin.html#dashboard">Admin Console</a><a href="/intranet.html">Intranet Portal</a><a href="/employee-portal.html">Employee Portal</a><a href="/employee360.html">Employee 360</a><a href="/education-portal.html">Education Portal</a><a href="/spire.html">Spire Clinical</a>';
    document.body.prepend(nav);
  }

  function installCompactWorkspaceHeader() {
    if (!compactWorkspaceHeaderPath() || document.getElementById('sulandra-compact-workspace-header')) return;
    const header = document.querySelector('header.top');
    if (!header) return;

    let logoLink = header.querySelector(':scope > a > img')?.parentElement || null;
    const directLogo = header.querySelector(':scope > img');
    if (!logoLink && directLogo) {
      logoLink = document.createElement('a');
      logoLink.href = '/admin.html#dashboard';
      logoLink.setAttribute('aria-label', 'Sulandra Health Admin');
      header.insertBefore(logoLink, directLogo);
      logoLink.appendChild(directLogo);
    }
    if (!logoLink || !logoLink.querySelector('img')) return;
    logoLink.classList.add('sulandra-workspace-logo');

    const style = document.createElement('style');
    style.id = 'sulandra-compact-workspace-header';
    style.textContent = `
      header.top,.top{min-height:80px!important;height:80px!important;padding:10px 20px!important;align-items:center!important;gap:14px!important;overflow:hidden!important;box-sizing:border-box!important}
      .sulandra-workspace-logo{display:flex!important;align-items:center!important;width:240px!important;height:60px!important;max-width:38vw!important;flex:0 0 240px!important;overflow:hidden!important;position:relative!important;text-decoration:none!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important}
      .sulandra-workspace-logo>img{width:180px!important;height:58px!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:left center!important;display:block!important;flex:none!important;transform:scale(3.25)!important;transform-origin:left center!important;clip-path:none!important;margin:0!important}
      header.top .spacer,.top .spacer{min-width:12px!important;flex:1 1 auto!important}
      header.top a:not(.sulandra-workspace-logo),.top a:not(.sulandra-workspace-logo){white-space:nowrap!important}
      #sulandraCompanySwitcher{flex:0 1 auto!important;margin:0!important;align-self:center!important}
      @media(max-width:900px){header.top,.top{padding:9px 14px!important;gap:10px!important}.sulandra-workspace-logo{width:205px!important;height:54px!important;max-width:34vw!important;flex-basis:205px!important}.sulandra-workspace-logo>img{width:155px!important;height:52px!important;transform:scale(3.25)!important}}
      @media(max-width:760px){header.top,.top{min-height:72px!important;height:auto!important;padding:8px 12px!important;flex-wrap:wrap!important;overflow:visible!important}.sulandra-workspace-logo{width:185px!important;height:50px!important;max-width:58vw!important;flex-basis:185px!important}.sulandra-workspace-logo>img{width:140px!important;height:48px!important;transform:scale(3.2)!important}#sulandraCompanySwitcher{order:4!important;width:100%!important;max-width:none!important}#sulandraCompanySwitcher select{max-width:calc(100vw - 120px)!important}}
    `;
    document.head.appendChild(style);
  }

  function installSpireMainTabIcons() {
    const pathname = location.pathname.toLowerCase().replace(/\/+$/, '');
    if (!pathname.endsWith('/spire/master.html') && !pathname.endsWith('/spire/master')) return;
    if (!document.getElementById('mainChartTabs') || document.getElementById('spire-main-tab-icons')) return;
    const style = document.createElement('style');
    style.id = 'spire-main-tab-icons';
    style.textContent = `
      #mainChartTabs .chart-tab[data-view="flowsheets-view"]::before{content:'▦';display:inline-block;margin-right:4px;color:#2f7f9f;font-size:14px;line-height:1;vertical-align:-1px}
      #mainChartTabs .chart-tab[data-view="mar-view"]::before{content:'+';display:inline-grid;place-items:center;width:14px;height:14px;margin-right:4px;border-radius:50%;background:#7d4db3;color:#fff;font-family:Arial,sans-serif;font-size:11px;font-weight:800;line-height:14px;vertical-align:-2px}
    `;
    document.head.appendChild(style);
  }
  installSignaturePlatformBar();
  installCompactWorkspaceHeader();
  installSpireMainTabIcons();

  async function loadContext() {
    const accessToken = token();
    if (!accessToken) { state.loaded = true; return state; }
    const response = await originalFetch(apiUrl('/api/entity-context'), {
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Unable to load company access (${response.status})`);
    const data = payload.data || payload;
    state.entities = Array.isArray(data.entities) ? data.entities : [];
    state.primaryEntityId = String(data.primaryEntityId || '');
    state.enterpriseOwner = data.enterpriseOwner === true;
    const allowed = new Set(state.entities.map((entity) => String(entity.id)));
    const savedEntity = stored(ENTITY_KEY);
    state.selectedEntityId = allowed.has(savedEntity) ? savedEntity : (allowed.has(state.primaryEntityId) ? state.primaryEntityId : String(state.entities[0]?.id || ''));
    save(ENTITY_KEY, state.selectedEntityId);

    const selected = state.entities.find((entity) => String(entity.id) === state.selectedEntityId);
    const departments = Array.isArray(selected?.departments) ? selected.departments : [];
    const departmentIds = new Set(departments.map((department) => String(department.id)));
    const savedDepartment = stored(DEPARTMENT_KEY);
    state.selectedDepartmentId = departmentIds.has(savedDepartment) ? savedDepartment : '';
    if (!state.selectedDepartmentId) save(DEPARTMENT_KEY, '');
    state.loaded = true;
    window.dispatchEvent(new CustomEvent('sulandra:entity-context-ready', { detail: snapshot() }));
    return state;
  }

  const ready = loadContext().catch((error) => {
    state.loaded = true;
    console.error('[Sulandra Entity Context]', error);
    window.dispatchEvent(new CustomEvent('sulandra:entity-context-error', { detail: { message: error.message } }));
    return state;
  });

  window.fetch = async (input, init = {}) => {
    const url = requestUrl(input);
    if (!isSulandraApi(url)) return originalFetch(input, init);
    if (!isContextRequest(url)) await ready;
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    const accessToken = token();
    if (accessToken && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${accessToken}`);
    if (!isContextRequest(url) && state.selectedEntityId) headers.set('x-legal-entity-id', state.selectedEntityId);
    if (!isContextRequest(url) && state.selectedDepartmentId) headers.set('x-department-id', state.selectedDepartmentId);
    return originalFetch(input, { ...init, headers });
  };

  function snapshot() {
    return Object.freeze({
      loaded: state.loaded,
      selectedEntityId: state.selectedEntityId,
      selectedDepartmentId: state.selectedDepartmentId,
      primaryEntityId: state.primaryEntityId,
      enterpriseOwner: state.enterpriseOwner,
      entities: state.entities.map((entity) => ({ ...entity })),
      selectedEntity: state.entities.find((entity) => String(entity.id) === state.selectedEntityId) || null,
    });
  }

  function setEntity(entityId) {
    const value = String(entityId || '');
    if (!state.entities.some((entity) => String(entity.id) === value)) throw new Error('That company is not available to this account');
    state.selectedEntityId = value;
    state.selectedDepartmentId = '';
    save(ENTITY_KEY, value);
    save(DEPARTMENT_KEY, '');
    window.dispatchEvent(new CustomEvent('sulandra:entity-context-changed', { detail: snapshot() }));
  }

  function setDepartment(departmentId) {
    const selected = state.entities.find((entity) => String(entity.id) === state.selectedEntityId);
    const departments = Array.isArray(selected?.departments) ? selected.departments : [];
    const value = String(departmentId || '');
    if (value && !departments.some((department) => String(department.id) === value)) throw new Error('That department does not belong to the selected company');
    state.selectedDepartmentId = value;
    save(DEPARTMENT_KEY, value);
    window.dispatchEvent(new CustomEvent('sulandra:entity-context-changed', { detail: snapshot() }));
  }

  window.SulandraEntityContext = Object.freeze({
    ready,
    get: snapshot,
    setEntity,
    setDepartment,
    reloadForEntity(entityId) { setEntity(entityId); location.reload(); },
  });

  function installSwitcher() {
    if (!token() || !state.entities.length || document.getElementById('sulandraCompanySwitcher')) return;
    const host = document.querySelector('.spire-top-actions') || document.querySelector('.header-tools') || document.querySelector('header .top') || document.querySelector('header') || document.body;
    const wrap = document.createElement('label');
    wrap.id = 'sulandraCompanySwitcher';
    wrap.setAttribute('aria-label', 'Selected Sulandra company');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid #c9d9e4;border-radius:10px;background:#fff;color:#31556e;font:700 12px/1.2 Segoe UI,Arial,sans-serif;max-width:min(360px,80vw);box-shadow:0 2px 7px rgba(15,55,85,.08)';
    const text = document.createElement('span'); text.textContent = 'Company';
    const select = document.createElement('select');
    select.style.cssText = 'max-width:250px;border:0;background:transparent;color:#0b4265;font:800 12px Segoe UI,Arial,sans-serif;outline:none;cursor:pointer';
    for (const entity of state.entities) {
      const option = document.createElement('option');
      option.value = String(entity.id);
      option.textContent = `${entity.displayName || entity.legalName || entity.code}${entity.status === 'PLANNED' ? ' — Pre-launch' : ''}`;
      option.selected = option.value === state.selectedEntityId;
      select.appendChild(option);
    }
    select.addEventListener('change', () => { setEntity(select.value); location.reload(); });
    wrap.append(text, select);
    if (host.classList?.contains('spire-top-actions')) host.prepend(wrap); else host.appendChild(wrap);
  }

  function installPageDeepLinks() {
    const pathname = location.pathname.toLowerCase();
    const hash = decodeURIComponent(location.hash.replace(/^#/, '')).trim();
    if (hash && !hash.includes('=')) {
      const tab = document.querySelector(`[data-tab="${CSS.escape(hash)}"]`);
      if (tab instanceof HTMLElement) tab.click();
    }
    if (pathname.endsWith('/client-intake.html') || pathname.endsWith('client-intake.html')) {
      const caseId = new URL(location.href).searchParams.get('caseId');
      if (!caseId) return;
      let attempts = 0;
      const openRequestedCase = () => {
        attempts += 1;
        const button = document.querySelector(`[data-case="${CSS.escape(caseId)}"]`);
        if (button instanceof HTMLElement) {
          button.click();
          return;
        }
        if (attempts < 80) window.setTimeout(openRequestedCase, 100);
      };
      openRequestedCase();
    }
  }

  function installClientIntakeDialogGuard() {
    const pathname = location.pathname.toLowerCase().replace(/\/+$/, '');
    if (!pathname.endsWith('/client-intake.html') || document.documentElement.dataset.sulandraClientIntakeDialogGuard === 'true') return;
    document.documentElement.dataset.sulandraClientIntakeDialogGuard = 'true';

    const style = document.createElement('style');
    style.id = 'sulandra-client-intake-hit-area-fix';
    style.textContent = `
      body .layout > .cases{position:relative!important;z-index:30!important;isolation:isolate!important;pointer-events:auto!important;min-width:0!important}
      body .layout > .sections,body .layout > .workspace{position:relative!important;z-index:1!important;min-width:0!important}
      #newIntake{position:relative!important;z-index:31!important;pointer-events:auto!important;touch-action:manipulation!important;user-select:none!important}
    `;
    document.head.appendChild(style);

    const openNewIntake = () => {
      const dialog = document.getElementById('newDialog');
      const form = document.getElementById('newForm');
      const error = document.getElementById('newError');
      if (!(dialog instanceof HTMLElement)) {
        console.error('[Client Intake] New Intake dialog is missing from the page.');
        return;
      }
      if (dialog.open) return;
      if (form instanceof HTMLFormElement) form.reset();
      if (error instanceof HTMLElement) error.classList.remove('show');
      try {
        if ('showModal' in dialog && typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      } catch (errorValue) {
        console.error('[Client Intake] Unable to open New Intake dialog.', errorValue);
        dialog.setAttribute('open', '');
      }
    };

    const pointInsideNewButton = (event) => {
      const button = document.getElementById('newIntake');
      if (!(button instanceof HTMLElement)) return false;
      const rect = button.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };

    document.addEventListener('pointerdown', (event) => {
      if (!pointInsideNewButton(event)) return;
      event.preventDefault();
      event.stopPropagation();
      openNewIntake();
    }, true);

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('#newIntake') : null;
      if (!target && !pointInsideNewButton(event)) return;
      event.preventDefault();
      event.stopPropagation();
      openNewIntake();
    }, true);
  }

  function loadEmployeeDirectoryEnhancer() {
    const pathname = location.pathname.toLowerCase();
    const eligible = ['spire-medication-qualifications.html','home-health.html','nmt-dispatch.html'].some((name) => pathname.endsWith(name));
    if (!eligible || document.querySelector('script[data-sulandra-employee-directory]')) return;
    const script = document.createElement('script');
    script.src = '/assets/employee-directory-enhancer.js?v=20260810-1';
    script.dataset.sulandraEmployeeDirectory = 'true';
    script.async = true;
    document.body.appendChild(script);
  }

  function loadEmployeeWorkCrosslinks() {
    const pathname = location.pathname.toLowerCase().replace(/\/+$/, '');
    const eligible = ['/my-work.html','/my-work','/notifications.html','/notifications'].some((suffix) => pathname.endsWith(suffix));
    if (!eligible || document.querySelector('script[data-sulandra-work-crosslinks]')) return;
    const script = document.createElement('script');
    script.src = '/assets/employee-work-crosslinks.js?v=20260810-work-center-1';
    script.dataset.sulandraWorkCrosslinks = 'true';
    script.async = true;
    document.body.appendChild(script);
  }

  function loadSpireMarEnhancer() {
    const pathname = location.pathname.toLowerCase().replace(/\/+$/, '');
    const eligible = pathname.endsWith('/spire/master.html') || pathname.endsWith('/spire/master') || pathname.endsWith('/spire.html');
    if (!eligible || document.querySelector('script[data-sulandra-spire-mar-enhancer]')) return;
    const script = document.createElement('script');
    script.src = '/assets/spire-mar-timeline.js?v=20260814-mar-v4';
    script.dataset.sulandraSpireMarEnhancer = 'true';
    script.async = false;
    document.body.appendChild(script);
  }

  const render = () => ready.then(() => { installSwitcher(); installPageDeepLinks(); installClientIntakeDialogGuard(); loadEmployeeDirectoryEnhancer(); loadEmployeeWorkCrosslinks(); loadSpireMarEnhancer(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
})();