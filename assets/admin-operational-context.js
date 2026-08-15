(() => {
  'use strict';

  // SULANDRA_ADMIN_OPERATIONAL_COMPANY_CONTEXT_V1
  // Corporate/holding-company context is valid for governance, but provider-only
  // Admin modules must execute inside the operating company that owns the data.
  const SCLS_CODE = 'SCLS';
  const OPERATIONAL_MODULES = new Set(['service-homes']);
  let switching = false;

  const clean = (value) => String(value ?? '').trim();
  const upper = (value) => clean(value).toUpperCase();
  const activeModule = () => String(location.hash || '').replace(/^#/, '') || 'dashboard';
  const isHolding = (entity) => upper(entity?.entityType) === 'HOLDING' || upper(entity?.code) === 'SULANDRA_HEALTH';
  const isActiveProvider = (entity) => entity && upper(entity.status) === 'ACTIVE' && !isHolding(entity) && entity.isProvider !== false;

  function remember(entityId, api) {
    if (!entityId) return;
    const adminKey = api?.storageKey || 'sulandra:admin:legal-entity-id';
    const sharedKey = api?.sharedStorageKey || 'sulandra:selected-legal-entity-id';
    localStorage.setItem(adminKey, entityId);
    localStorage.setItem(sharedKey, entityId);
    sessionStorage.setItem(sharedKey, entityId);
    localStorage.setItem('sulandra:last-operational-legal-entity-id', entityId);
    sessionStorage.setItem('sulandra:last-operational-legal-entity-id', entityId);
  }

  async function enforce() {
    if (switching || !OPERATIONAL_MODULES.has(activeModule())) return;
    const api = window.SulandraCompanyContext;
    if (!api?.initialize || !api?.current || !api?.context) return;

    await api.initialize();
    const current = api.current();
    if (current && !isHolding(current)) return;

    const entities = Array.isArray(api.context()?.entities) ? api.context().entities : [];
    const target = entities.find((entity) => upper(entity.code) === SCLS_CODE && isActiveProvider(entity))
      || entities.find(isActiveProvider);
    if (!target) {
      console.warn('[Sulandra Admin Operational Context] No active provider company is available for this module.');
      return;
    }

    switching = true;
    remember(String(target.id), api);
    location.reload();
  }

  const run = () => enforce().catch((error) => console.error('[Sulandra Admin Operational Context]', error));
  window.addEventListener('hashchange', run);
  window.addEventListener('sulandra:company-change', run);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
