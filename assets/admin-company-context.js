(() => {
  'use strict';

  const API_BASE = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const SELECTED_ENTITY_KEY = 'sulandra:admin:legal-entity-id';
  const SHARED_SELECTED_ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  let entityContext = null;
  let selectedEntity = null;
  let requestPromise = null;

  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function installStyles() {
    if (document.getElementById('adminCompanyContextStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminCompanyContextStyles';
    style.textContent = `
      .admin-company-context{display:flex;align-items:center;gap:8px;min-width:min(340px,30vw);padding:6px 8px 6px 12px;border:1px solid #cbdbea;border-radius:10px;background:#f7fbff;color:#17324d}
      .admin-company-context label{font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;color:#526b82;white-space:nowrap}
      .admin-company-select{min-width:0;flex:1;height:36px;border:1px solid #a9bfd3;border-radius:7px;background:#fff;color:#12385a;padding:0 34px 0 10px;font:800 13px/1.2 'Segoe UI',Arial,sans-serif;cursor:pointer}
      .admin-company-select:focus{outline:3px solid rgba(0,119,200,.18);border-color:#0077c8}
      .admin-company-state{display:inline-flex;align-items:center;justify-content:center;min-width:58px;border-radius:999px;padding:5px 7px;font-size:9px;font-weight:950;letter-spacing:.05em;color:#17603a;background:#dff7e9;border:1px solid #a7e2bf}
      .admin-company-state[data-status="PLANNED"]{color:#80560a;background:#fff5d7;border-color:#ead28a}
      .admin-company-state[data-status="ERROR"]{color:#8f1d1d;background:#fee8e8;border-color:#f4b2b2}
      .sulandra-workspace-link{position:relative}.sulandra-workspace-link::after{content:'NEW';margin-left:6px;padding:2px 5px;border-radius:999px;background:#e2f3fb;color:#075985;font-size:8px;font-weight:950;vertical-align:middle}
      @media(max-width:980px){.admin-company-context{order:10;width:100%;min-width:100%}.admin-company-select{font-size:12px}}
      @media(max-width:680px){.admin-company-context label{display:none}.admin-company-state{min-width:52px}}
    `;
    document.head.appendChild(style);
  }

  function installWorkspaceLinks() {
    const top = document.getElementById('topModuleNav');
    if (top && !document.getElementById('adminCompanyFilesTopLink')) {
      const intakeItem = document.createElement('li');
      intakeItem.id = 'adminClientIntakeTopLink';
      intakeItem.innerHTML = '<a class="sulandra-workspace-link" href="/client-intake.html">Client Intake</a>';
      const filesItem = document.createElement('li');
      filesItem.id = 'adminCompanyFilesTopLink';
      filesItem.innerHTML = '<a class="sulandra-workspace-link" href="/company-documents.html">Company Files</a>';
      const trainingItem = document.createElement('li');
      trainingItem.id = 'adminSpireTrainingTopLink';
      trainingItem.innerHTML = '<a class="sulandra-workspace-link" href="/spire-training.html">SPIRE Training</a>';
      const adminSpireItem = Array.from(top.children).find((item) => /Admin Spire/i.test(item.textContent || ''));
      if (adminSpireItem) {
        top.insertBefore(intakeItem, adminSpireItem);
        top.insertBefore(filesItem, adminSpireItem);
        top.insertBefore(trainingItem, adminSpireItem);
      } else top.append(intakeItem, filesItem, trainingItem);
    }

    const side = document.getElementById('sideModuleNav');
    if (side && !document.getElementById('adminCompanyFilesSideLink')) {
      const intakeButton = document.createElement('button');
      intakeButton.id = 'adminClientIntakeSideLink';
      intakeButton.className = 'side-btn';
      intakeButton.type = 'button';
      intakeButton.innerHTML = 'Client Intake <small>Admission Packet</small>';
      intakeButton.addEventListener('click', () => { window.location.href = '/client-intake.html'; });
      const filesButton = document.createElement('button');
      filesButton.id = 'adminCompanyFilesSideLink';
      filesButton.className = 'side-btn';
      filesButton.type = 'button';
      filesButton.innerHTML = 'Company Files <small>Official Records</small>';
      filesButton.addEventListener('click', () => { window.location.href = '/company-documents.html'; });
      const trainingButton = document.createElement('button');
      trainingButton.id = 'adminSpireTrainingSideLink';
      trainingButton.className = 'side-btn';
      trainingButton.type = 'button';
      trainingButton.innerHTML = 'SPIRE Training <small>Practice Charts</small>';
      trainingButton.addEventListener('click', () => { window.location.href = '/spire-training.html'; });
      const adminSpireButton = Array.from(side.children).find((node) => /Admin Spire/i.test(node.textContent || ''));
      if (adminSpireButton) {
        side.insertBefore(intakeButton, adminSpireButton);
        side.insertBefore(filesButton, adminSpireButton);
        side.insertBefore(trainingButton, adminSpireButton);
      } else side.append(intakeButton, filesButton, trainingButton);
    }
  }

  function mount() {
    installStyles();
    installWorkspaceLinks();
    let host = document.getElementById('adminCompanyContext');
    if (host) return host;
    const tools = document.querySelector('.header-tools');
    if (!tools) return null;
    host = document.createElement('div');
    host.id = 'adminCompanyContext';
    host.className = 'admin-company-context';
    host.innerHTML = `
      <label for="adminCompanySelect">Company</label>
      <select id="adminCompanySelect" class="admin-company-select" aria-label="Company to manage" disabled>
        <option>Loading companies…</option>
      </select>
      <span id="adminCompanyState" class="admin-company-state" data-status="PLANNED">LOADING</span>`;
    tools.prepend(host);
    host.querySelector('select')?.addEventListener('change', (event) => selectEntity(event.target.value, true));
    return host;
  }

  function accessibleEntities() {
    return Array.isArray(entityContext?.entities) ? entityContext.entities : [];
  }

  function preferredEntity() {
    const entities = accessibleEntities();
    const savedId = localStorage.getItem(SELECTED_ENTITY_KEY)
      || sessionStorage.getItem(SHARED_SELECTED_ENTITY_KEY)
      || localStorage.getItem(SHARED_SELECTED_ENTITY_KEY);
    return entities.find((entity) => entity.id === savedId && entity.status === 'ACTIVE')
      || entities.find((entity) => entity.id === entityContext?.primaryEntityId && entity.status === 'ACTIVE')
      || entities.find((entity) => entity.code === 'SCLS' && entity.status === 'ACTIVE')
      || entities.find((entity) => entity.status === 'ACTIVE')
      || null;
  }

  function publishSelection(previousEntity, notify) {
    const status = selectedEntity?.status || 'ERROR';
    const operationsStatus = selectedEntity?.metadata?.serviceOperationsStatus || status;
    const licensingStatus = selectedEntity?.metadata?.licensingStatus || 'UNKNOWN';
    const state = document.getElementById('adminCompanyState');
    if (state) {
      state.dataset.status = status;
      state.textContent = status;
      state.title = status === 'ACTIVE'
        ? `Company workspace active • Operations: ${operationsStatus} • Licensing: ${licensingStatus}`
        : 'This company is planned and cannot be managed until it is legally and operationally activated.';
    }
    if (selectedEntity) {
      localStorage.setItem(SELECTED_ENTITY_KEY, selectedEntity.id);
      localStorage.setItem(SHARED_SELECTED_ENTITY_KEY, selectedEntity.id);
      sessionStorage.setItem(SHARED_SELECTED_ENTITY_KEY, selectedEntity.id);
      document.body.dataset.legalEntityId = selectedEntity.id;
      document.body.dataset.legalEntityCode = selectedEntity.code;
    } else {
      localStorage.removeItem(SELECTED_ENTITY_KEY);
      localStorage.removeItem(SHARED_SELECTED_ENTITY_KEY);
      sessionStorage.removeItem(SHARED_SELECTED_ENTITY_KEY);
      delete document.body.dataset.legalEntityId;
      delete document.body.dataset.legalEntityCode;
    }
    if (notify && previousEntity?.id !== selectedEntity?.id) {
      const detail = { previousEntity, entity: selectedEntity };
      window.dispatchEvent(new CustomEvent('sulandra:company-change', { detail }));
      window.dispatchEvent(new CustomEvent('sulandra:entity-context-changed', { detail: {
        previousEntity,
        selectedEntity,
        selectedEntityId: selectedEntity?.id || '',
      } }));
    }
  }

  function selectEntity(entityId, notify = false) {
    const previousEntity = selectedEntity;
    const candidate = accessibleEntities().find((entity) => entity.id === entityId);
    selectedEntity = candidate?.status === 'ACTIVE' ? candidate : preferredEntity();
    const select = document.getElementById('adminCompanySelect');
    if (select && selectedEntity) select.value = selectedEntity.id;
    publishSelection(previousEntity, notify);
    return selectedEntity;
  }

  function render() {
    mount();
    installWorkspaceLinks();
    const select = document.getElementById('adminCompanySelect');
    if (!select) return;
    const entities = accessibleEntities();
    if (!entities.length) {
      select.innerHTML = '<option>No authorized companies</option>';
      select.disabled = true;
      selectedEntity = null;
      publishSelection(null, false);
      return;
    }
    select.innerHTML = entities.map((entity) => {
      const active = entity.status === 'ACTIVE';
      const suffix = active ? '' : ` — ${escapeHtml(entity.status)}`;
      return `<option value="${escapeHtml(entity.id)}" ${active ? '' : 'disabled'}>${escapeHtml(entity.code)} — ${escapeHtml(entity.displayName)}${suffix}</option>`;
    }).join('');
    const activeEntityCount = entities.filter((entity) => entity.status === 'ACTIVE').length;
    select.disabled = false;
    selectEntity(preferredEntity()?.id || '', false);
    select.title = activeEntityCount < 2
      ? 'SCLS is the only active company.'
      : 'Select a company. Pre-launch companies allow recruiting and training while unapproved operating modules remain blocked.';
  }

  async function loadContext() {
    const authToken = token();
    if (!authToken) throw new Error('Administrator sign-in is required');
    const response = await fetch(`${API_BASE}/api/entity-context`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${authToken}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Company context failed (${response.status})`);
    return payload.data;
  }

  async function initialize(providedContext) {
    mount();
    if (providedContext?.entities) {
      entityContext = providedContext;
      render();
      return entityContext;
    }
    if (entityContext) return entityContext;
    if (!requestPromise) requestPromise = loadContext()
      .then((context) => { entityContext = context; render(); return context; })
      .catch((error) => {
        const select = document.getElementById('adminCompanySelect');
        const state = document.getElementById('adminCompanyState');
        if (select) { select.innerHTML = '<option>Company context unavailable</option>'; select.disabled = true; }
        if (state) { state.dataset.status = 'ERROR'; state.textContent = 'ERROR'; state.title = error.message; }
        throw error;
      })
      .finally(() => { requestPromise = null; });
    return requestPromise;
  }

  window.SulandraCompanyContext = Object.freeze({
    initialize,
    current: () => selectedEntity,
    context: () => entityContext,
    headers: () => selectedEntity?.id ? { 'X-Legal-Entity-Id': selectedEntity.id } : {},
    storageKey: SELECTED_ENTITY_KEY,
    sharedStorageKey: SHARED_SELECTED_ENTITY_KEY,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initialize().catch(() => undefined), { once: true });
  } else initialize().catch(() => undefined);
})();
