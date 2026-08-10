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

  const render = () => ready.then(() => { installSwitcher(); installPageDeepLinks(); loadEmployeeDirectoryEnhancer(); loadEmployeeWorkCrosslinks(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
})();
