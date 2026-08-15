(() => {
  'use strict';

  // SULANDRA_OPERATIONAL_COMPANY_CONTEXT_V1
  // Governance may default to the Sulandra Health holding company, but service-
  // delivery workspaces must operate inside a real operating company.
  const LAST_OPERATIONAL_KEY = 'sulandra:last-operational-legal-entity-id';
  const pathname = String(location.pathname || '').toLowerCase().replace(/\/+$/, '');
  const operationalPage = pathname.endsWith('/scheduling.html')
    || pathname.endsWith('/spire/client-station.html')
    || pathname.endsWith('/spire/master.html');

  if (!operationalPage) return;

  const clean = (value) => String(value ?? '').trim();
  const upper = (value) => clean(value).toUpperCase();
  const stored = (key) => sessionStorage.getItem(key) || localStorage.getItem(key) || '';
  const save = (key, value) => {
    if (!value) return;
    sessionStorage.setItem(key, String(value));
    localStorage.setItem(key, String(value));
  };
  const isHolding = (entity) => upper(entity?.entityType) === 'HOLDING';
  const isUsableOperatingEntity = (entity) => entity
    && !isHolding(entity)
    && upper(entity.status) !== 'INACTIVE';

  let switching = false;

  async function enforceOperationalCompany() {
    if (switching) return;
    const contextApi = window.SulandraEntityContext;
    if (!contextApi?.ready || typeof contextApi.get !== 'function') return;

    await contextApi.ready;
    const context = contextApi.get();
    const selected = context?.selectedEntity;
    if (!selected) return;

    if (!isHolding(selected)) {
      if (isUsableOperatingEntity(selected)) save(LAST_OPERATIONAL_KEY, selected.id);
      return;
    }

    const entities = Array.isArray(context.entities) ? context.entities : [];
    const candidates = entities.filter(isUsableOperatingEntity);
    if (!candidates.length) {
      console.warn('[Sulandra Operational Context] No operating company is available for this workspace.');
      return;
    }

    const remembered = stored(LAST_OPERATIONAL_KEY);
    const target = candidates.find((entity) => String(entity.id) === remembered)
      || candidates.find((entity) => upper(entity.code) === 'SCLS' && upper(entity.status) === 'ACTIVE')
      || candidates.find((entity) => String(entity.id) === String(context.primaryEntityId || '') && upper(entity.status) === 'ACTIVE')
      || candidates.find((entity) => upper(entity.status) === 'ACTIVE' && entity.isProvider === true)
      || candidates.find((entity) => upper(entity.status) === 'ACTIVE')
      || candidates[0];

    if (!target || String(target.id) === String(selected.id)) return;

    switching = true;
    save(LAST_OPERATIONAL_KEY, target.id);
    try {
      contextApi.reloadForEntity(target.id);
    } catch (error) {
      switching = false;
      console.error('[Sulandra Operational Context] Unable to switch to operating company.', error);
    }
  }

  window.addEventListener('sulandra:entity-context-changed', () => {
    enforceOperationalCompany().catch((error) => console.error('[Sulandra Operational Context]', error));
  });

  const start = () => enforceOperationalCompany().catch((error) => console.error('[Sulandra Operational Context]', error));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
