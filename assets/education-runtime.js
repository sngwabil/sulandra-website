(() => {
  'use strict';

  const API_BASE = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const SESSION_KEY = 'sulandra:employee:session';
  const ENTITY_KEY = 'sulandra:education:legal-entity-id';
  let context = null;
  let selectedEntity = null;
  let contextPromise = null;

  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  const storedEntityId = () => localStorage.getItem(ENTITY_KEY) || '';
  const activeEntities = () => (Array.isArray(context?.entities) ? context.entities : [])
    .filter((entity) => entity?.status === 'ACTIVE');

  function requestHeaders(extra = {}, includeEntity = true) {
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token()}`,
      ...extra,
    };
    if (includeEntity) {
      const entityId = selectedEntity?.id || storedEntityId();
      if (entityId) headers['X-Legal-Entity-Id'] = entityId;
    }
    return headers;
  }

  async function request(path, init = {}, options = {}) {
    const hasBody = init.body !== undefined && init.body !== null;
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: 'no-store',
      headers: requestHeaders({
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      }, options.includeEntity !== false),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function chooseEntity(preferredId = '') {
    const entities = activeEntities();
    return entities.find((entity) => entity.id === preferredId)
      || entities.find((entity) => entity.id === context?.primaryEntityId)
      || entities.find((entity) => entity.code === 'SCLS')
      || entities[0]
      || null;
  }

  function selectEntity(entityId) {
    const entity = chooseEntity(entityId);
    selectedEntity = entity;
    if (entity) localStorage.setItem(ENTITY_KEY, entity.id);
    else localStorage.removeItem(ENTITY_KEY);
    return entity;
  }

  async function loadContext(force = false) {
    if (context && !force) return context;
    if (!contextPromise) contextPromise = request('/api/entity-context', {}, { includeEntity: false })
      .then((payload) => {
        context = payload.data || { entities: [] };
        selectEntity(storedEntityId());
        return context;
      })
      .finally(() => { contextPromise = null; });
    return contextPromise;
  }

  async function mountSelector(select, onChange) {
    await loadContext();
    const entities = activeEntities();
    select.innerHTML = entities.length
      ? entities.map((entity) => `<option value="${escapeHtml(entity.id)}">${escapeHtml(entity.code)} — ${escapeHtml(entity.displayName)}</option>`).join('')
      : '<option value="">No active company employment</option>';
    select.disabled = entities.length < 2;
    if (selectedEntity) select.value = selectedEntity.id;
    select.addEventListener('change', async () => {
      selectEntity(select.value);
      if (onChange) await onChange(selectedEntity);
    });
    return selectedEntity;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    location.replace('/employee-login.html');
  }

  window.SulandraEducationRuntime = Object.freeze({
    apiBase: API_BASE,
    token,
    request,
    loadContext,
    mountSelector,
    selectEntity,
    currentEntity: () => selectedEntity,
    entities: activeEntities,
    entityHeaders: () => selectedEntity?.id ? { 'X-Legal-Entity-Id': selectedEntity.id } : {},
    entityStorageKey: ENTITY_KEY,
    escapeHtml,
    logout,
  });
})();
