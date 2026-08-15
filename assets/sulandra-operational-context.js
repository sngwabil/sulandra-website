(() => {
  'use strict';

  // SULANDRA_OPERATIONAL_COMPANY_CONTEXT_V2
  // Holding-company context is valid for governance. Service-delivery workspaces
  // always resolve to an active operating/provider company before loading data.
  const LAST_OPERATIONAL_KEY = 'sulandra:last-operational-legal-entity-id';
  const pathname = String(location.pathname || '').toLowerCase().replace(/\/+$/, '');
  const operationalPage = pathname.endsWith('/scheduling.html')
    || pathname.endsWith('/time-attendance.html')
    || pathname.endsWith('/client-intake.html')
    || pathname.endsWith('/workforce-admin.html')
    || pathname.endsWith('/spire-medication-qualifications.html')
    || pathname.endsWith('/spire/client-station.html')
    || pathname.endsWith('/spire/master.html')
    || pathname.includes('/home-health')
    || pathname.includes('/nmt-')
    || pathname.includes('/scls-');

  if (!operationalPage) return;

  const clean = (value) => String(value ?? '').trim();
  const upper = (value) => clean(value).toUpperCase();
  const stored = (key) => sessionStorage.getItem(key) || localStorage.getItem(key) || '';
  const save = (key, value) => {
    if (!value) return;
    sessionStorage.setItem(key, String(value));
    localStorage.setItem(key, String(value));
  };
  const isHolding = (entity) => upper(entity?.entityType) === 'HOLDING' || upper(entity?.code) === 'SULANDRA_HEALTH';
  const isUsableOperatingEntity = (entity) => entity
    && !isHolding(entity)
    && upper(entity.status) === 'ACTIVE'
    && entity.isProvider !== false;

  const desiredCode = (() => {
    if (pathname.includes('/home-health')) return 'HOME_HEALTH';
    if (pathname.includes('/nmt-')) return 'NMT';
    if (pathname.includes('/scls-') || pathname.endsWith('/spire-medication-qualifications.html')) return 'SCLS';
    return '';
  })();

  let switching = false;

  async function enforceOperationalCompany() {
    if (switching) return;
    const contextApi = window.SulandraEntityContext;
    if (!contextApi?.ready || typeof contextApi.get !== 'function') return;

    await contextApi.ready;
    const context = contextApi.get();
    const selected = context?.selectedEntity;
    if (!selected) return;

    const selectedMatchesRoute = desiredCode && upper(selected.code) === desiredCode && isUsableOperatingEntity(selected);
    if (selectedMatchesRoute || (!desiredCode && !isHolding(selected) && isUsableOperatingEntity(selected))) {
      save(LAST_OPERATIONAL_KEY, selected.id);
      return;
    }

    // A route-specific provider page always wins. Generic operational workspaces
    // keep the last operating company, then fall back to active SCLS.
    const entities = Array.isArray(context.entities) ? context.entities : [];
    const candidates = entities.filter(isUsableOperatingEntity);
    if (!candidates.length) {
      console.warn('[Sulandra Operational Context] No active operating company is available for this workspace.');
      return;
    }

    const remembered = stored(LAST_OPERATIONAL_KEY);
    const target = (desiredCode ? candidates.find((entity) => upper(entity.code) === desiredCode) : null)
      || candidates.find((entity) => String(entity.id) === remembered)
      || candidates.find((entity) => upper(entity.code) === 'SCLS')
      || candidates.find((entity) => String(entity.id) === String(context.primaryEntityId || ''))
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
