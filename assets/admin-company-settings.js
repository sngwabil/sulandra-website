(() => {
  'use strict';

  const API_BASE = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const LEGACY_SETTINGS_KEY = 'sulandra:admin:company-settings';
  const FIELD_IDS = [
    'settingCompanyName', 'settingCompanyAddress', 'settingCompanyPhone', 'settingCompanyEmail',
    'settingSenderName', 'settingUnmonitoredNotice', 'settingEmploymentDisclaimer', 'settingTimezone',
    'settingSupportEmail', 'settingSupportPhone', 'settingWebsite',
  ];
  const state = {
    entityId: '', entityCode: '', entityName: '', loaded: false, dirty: false,
    saving: false, loading: false, requestSequence: 0, updatedAt: null, updatedById: null,
  };

  const $ = (id) => document.getElementById(id);
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  const currentEntity = () => window.SulandraCompanyContext?.current?.() || null;
  const trim = (value) => String(value ?? '').trim();
  const nullable = (value) => trim(value) || null;

  // Retire the old workstation-specific settings cache. Company settings now live in PostgreSQL.
  try { localStorage.removeItem(LEGACY_SETTINGS_KEY); } catch {}

  function toast(title, message) {
    const root = $('toast');
    if (!root) return;
    if ($('toastTitle')) $('toastTitle').textContent = title;
    if ($('toastBody')) $('toastBody').textContent = message;
    root.classList.add('show');
    window.setTimeout(() => root.classList.remove('show'), 4000);
  }

  async function request(path, init = {}) {
    const authToken = token();
    if (!authToken) throw new Error('Administrator sign-in is required.');
    const entityId = String(currentEntity()?.id || state.entityId || '');
    if (!entityId) throw new Error('Select a Sulandra company before managing settings.');
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${authToken}`,
        'X-Legal-Entity-Id': entityId,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || payload.message || `Company settings request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return payload.data ?? payload;
  }

  function installStyles() {
    if ($('adminCompanySettingsBackendStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminCompanySettingsBackendStyles';
    style.textContent = `
      #module-settings .company-settings-source{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;margin:14px 0 18px;padding:13px 14px;border:1px solid #b8d5e6;border-radius:12px;background:linear-gradient(135deg,#f5fbff,#eef8fc);color:#315a73}
      #module-settings .company-settings-source strong{display:block;color:#0b4d75;font-size:13px}.company-settings-source small{display:block;margin-top:2px;color:#668092;font-size:11px}.company-settings-source .source-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 9px;background:#e6f7ed;border:1px solid #b6e1c6;color:#17643a;font-size:9px;font-weight:950;letter-spacing:.05em;text-transform:uppercase}.company-settings-source .source-pill::before{content:'●';font-size:8px}
      #module-settings .company-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.company-settings-grid .wide{grid-column:1/-1}.company-settings-field label{display:block;font-size:11px;font-weight:900;color:#536d80;margin-bottom:4px;text-transform:uppercase;letter-spacing:.03em}.company-settings-field input,.company-settings-field select,.company-settings-field textarea{width:100%;min-width:0;padding:9px 10px;border:1px solid #c5d5df;border-radius:7px;background:#fff;color:#223b4b;font:inherit}.company-settings-field textarea{min-height:74px;resize:vertical}.company-settings-field input:focus,.company-settings-field select:focus,.company-settings-field textarea:focus{outline:3px solid rgba(0,119,200,.13);border-color:#0077c8}.company-settings-field input:disabled,.company-settings-field select:disabled,.company-settings-field textarea:disabled{background:#f1f5f7;color:#7b8c96;cursor:not-allowed}
      #module-settings .company-settings-operations{border:1px solid #d7e5ed;padding:18px;border-radius:12px;background:#fbfdfe}.company-settings-operations h3{color:var(--primary);margin-bottom:5px}.company-settings-operations p{margin-bottom:12px}.company-settings-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:2px}.company-settings-actions button{min-height:42px}.company-settings-save-state{font-size:11px;font-weight:800;color:#67808f}.company-settings-save-state.dirty{color:#8a5c00}.company-settings-save-state.error{color:#9c332d}.company-settings-save-state.success{color:#17643a}.company-settings-audit-note{padding:10px 12px;border-radius:9px;background:#f8fbfd;border:1px solid #dbe7ed;color:#597281;font-size:11px}.company-settings-audit-note strong{color:#254f68}
      @media(max-width:700px){#module-settings .company-settings-source{grid-template-columns:1fr}.company-settings-source .source-pill{justify-self:start}#module-settings .company-settings-grid{grid-template-columns:1fr}.company-settings-grid .wide{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function fieldContainer(id, label, type = 'text', options = null, wide = false) {
    const wrap = document.createElement('div');
    wrap.className = `company-settings-field${wide ? ' wide' : ''}`;
    const labelNode = document.createElement('label');
    labelNode.htmlFor = id;
    labelNode.textContent = label;
    let control;
    if (options) {
      control = document.createElement('select');
      for (const [value, text] of options) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        control.appendChild(option);
      }
    } else {
      control = document.createElement('input');
      control.type = type;
    }
    control.id = id;
    wrap.append(labelNode, control);
    return wrap;
  }

  function ensureUi() {
    installStyles();
    const module = $('module-settings');
    const form = module?.querySelector('form');
    if (!module || !form) return false;
    form.id = 'adminCompanySettingsForm';
    form.style.maxWidth = '820px';

    if (!$('adminCompanySettingsBackendStatus')) {
      const status = document.createElement('div');
      status.id = 'adminCompanySettingsBackendStatus';
      status.className = 'company-settings-source';
      status.innerHTML = '<div><strong id="adminCompanySettingsEntity">Loading selected company…</strong><small id="adminCompanySettingsUpdated">Settings are loading from the Sulandra backend.</small></div><span class="source-pill">Authoritative backend</span>';
      module.querySelector('.sub')?.after(status);
    }

    const disclaimer = module.querySelector('textarea');
    if (disclaimer && !disclaimer.id) disclaimer.id = 'settingEmploymentDisclaimer';
    if ($('settingCompanyName')) { $('settingCompanyName').required = true; $('settingCompanyName').autocomplete = 'organization'; }
    if ($('settingCompanyEmail')) { $('settingCompanyEmail').type = 'email'; $('settingCompanyEmail').autocomplete = 'email'; }
    if ($('settingCompanyPhone')) { $('settingCompanyPhone').type = 'tel'; $('settingCompanyPhone').autocomplete = 'tel'; }
    if ($('settingCompanyAddress')) $('settingCompanyAddress').autocomplete = 'street-address';

    let saveButton = $('adminCompanySettingsSave');
    if (!saveButton) {
      saveButton = Array.from(form.querySelectorAll('button')).find((button) => /save settings/i.test(button.textContent || '')) || null;
      if (saveButton) saveButton.id = 'adminCompanySettingsSave';
    }
    if (saveButton) {
      saveButton.type = 'submit';
      saveButton.removeAttribute('onclick');
      saveButton.textContent = 'Save Company Settings';
    }

    if (!$('adminCompanySettingsOperations')) {
      const operations = document.createElement('section');
      operations.id = 'adminCompanySettingsOperations';
      operations.className = 'company-settings-operations';
      operations.innerHTML = '<h3>Operations, Support & Web Identity</h3><p class="sub">Company-specific operational settings used by supported Sulandra workflows and administrative communications.</p>';
      const grid = document.createElement('div');
      grid.className = 'company-settings-grid';
      grid.append(
        fieldContainer('settingTimezone', 'Company Time Zone', 'text', [
          ['America/New_York', 'Eastern — America/New_York'], ['America/Chicago', 'Central — America/Chicago'],
          ['America/Denver', 'Mountain — America/Denver'], ['America/Phoenix', 'Arizona — America/Phoenix'],
          ['America/Los_Angeles', 'Pacific — America/Los_Angeles'], ['America/Anchorage', 'Alaska — America/Anchorage'],
          ['Pacific/Honolulu', 'Hawaii — Pacific/Honolulu'], ['UTC', 'UTC'],
        ]),
        fieldContainer('settingSupportEmail', 'Support Email', 'email'),
        fieldContainer('settingSupportPhone', 'Support Phone', 'tel'),
        fieldContainer('settingWebsite', 'Company Website', 'url', null, true),
      );
      operations.appendChild(grid);
      if (saveButton?.parentNode === form) form.insertBefore(operations, saveButton);
      else form.appendChild(operations);
    }

    if (!$('adminCompanySettingsActions')) {
      const actions = document.createElement('div');
      actions.id = 'adminCompanySettingsActions';
      actions.className = 'company-settings-actions';
      const reload = document.createElement('button');
      reload.id = 'adminCompanySettingsReload';
      reload.type = 'button';
      reload.className = 'btn btn-ghost';
      reload.textContent = 'Reload from Server';
      const stateNode = document.createElement('span');
      stateNode.id = 'adminCompanySettingsSaveState';
      stateNode.className = 'company-settings-save-state';
      stateNode.textContent = 'Waiting for company settings…';
      if (saveButton?.parentNode === form) form.insertBefore(actions, saveButton);
      else form.appendChild(actions);
      if (saveButton) actions.appendChild(saveButton);
      actions.append(reload, stateNode);
      const note = document.createElement('div');
      note.className = 'company-settings-audit-note';
      note.innerHTML = '<strong>Company-scoped and audited.</strong> Saving writes to the selected Legal Entity in PostgreSQL and records an administrative audit event. Browser localStorage is not used as the settings database.';
      actions.after(note);
    }

    form.querySelectorAll('input,select,textarea').forEach((control) => {
      if (control.dataset.companySettingsBound) return;
      control.dataset.companySettingsBound = 'true';
      const markDirty = () => {
        if (!state.loaded || state.loading || state.saving) return;
        state.dirty = true;
        setSaveState('Unsaved changes', 'dirty');
      };
      control.addEventListener('input', markDirty);
      control.addEventListener('change', markDirty);
    });

    if (!form.dataset.companySettingsSubmitBound) {
      form.dataset.companySettingsSubmitBound = 'true';
      form.addEventListener('submit', (event) => { event.preventDefault(); saveSettings(); });
    }
    const reload = $('adminCompanySettingsReload');
    if (reload && !reload.dataset.bound) {
      reload.dataset.bound = 'true';
      reload.addEventListener('click', () => {
        if (state.dirty && !window.confirm('Discard your unsaved changes and reload this company from the server?')) return;
        loadSettings('manual reload');
      });
    }
    return true;
  }

  function setSaveState(message, kind = '') {
    const node = $('adminCompanySettingsSaveState');
    if (!node) return;
    node.textContent = message;
    node.classList.remove('dirty', 'error', 'success');
    if (kind) node.classList.add(kind);
  }

  function setBusy(busy, message) {
    for (const id of FIELD_IDS) if ($(id)) $(id).disabled = busy;
    if ($('adminCompanySettingsSave')) $('adminCompanySettingsSave').disabled = busy;
    if ($('adminCompanySettingsReload')) $('adminCompanySettingsReload').disabled = busy;
    if (message) setSaveState(message);
  }

  function clearForm() {
    for (const id of FIELD_IDS) {
      const control = $(id);
      if (control) control.value = id === 'settingTimezone' ? 'America/New_York' : '';
    }
    document.querySelectorAll('.hr-tag-preview').forEach((node) => { node.textContent = 'Human Resources'; });
  }

  function renderSource(data) {
    if ($('adminCompanySettingsEntity')) $('adminCompanySettingsEntity').textContent = `${data.code || state.entityCode || 'Company'} — ${data.displayName || state.entityName || 'Selected company'}`;
    const updatedAt = data.settings?.updatedAt || state.updatedAt;
    if ($('adminCompanySettingsUpdated')) {
      if (updatedAt) {
        const date = new Date(updatedAt);
        $('adminCompanySettingsUpdated').textContent = `Loaded from PostgreSQL · Last saved ${Number.isNaN(date.getTime()) ? updatedAt : date.toLocaleString()}`;
      } else {
        $('adminCompanySettingsUpdated').textContent = 'Loaded from PostgreSQL · No prior administrative save recorded for this company.';
      }
    }
  }

  function writeForm(settings = {}) {
    const values = {
      settingCompanyName: settings.companyName ?? '', settingCompanyAddress: settings.companyAddress ?? '',
      settingCompanyPhone: settings.companyPhone ?? '', settingCompanyEmail: settings.companyEmail ?? '',
      settingSenderName: settings.senderName ?? '', settingUnmonitoredNotice: settings.unmonitoredNotice ?? '',
      settingEmploymentDisclaimer: settings.employmentDisclaimer ?? '', settingTimezone: settings.timezone || 'America/New_York',
      settingSupportEmail: settings.supportEmail ?? '', settingSupportPhone: settings.supportPhone ?? '', settingWebsite: settings.website ?? '',
    };
    Object.entries(values).forEach(([id, value]) => { if ($(id)) $(id).value = String(value ?? ''); });
    document.querySelectorAll('.hr-tag-preview').forEach((node) => { node.textContent = trim(settings.senderName) || 'Human Resources'; });
  }

  function payloadFromForm() {
    return {
      companyName: trim($('settingCompanyName')?.value),
      companyAddress: nullable($('settingCompanyAddress')?.value),
      companyPhone: nullable($('settingCompanyPhone')?.value),
      companyEmail: nullable($('settingCompanyEmail')?.value),
      senderName: nullable($('settingSenderName')?.value),
      unmonitoredNotice: nullable($('settingUnmonitoredNotice')?.value),
      employmentDisclaimer: nullable($('settingEmploymentDisclaimer')?.value),
      timezone: nullable($('settingTimezone')?.value),
      supportEmail: nullable($('settingSupportEmail')?.value),
      supportPhone: nullable($('settingSupportPhone')?.value),
      website: nullable($('settingWebsite')?.value),
    };
  }

  function validateForm() {
    if (!$('adminCompanySettingsForm')) throw new Error('Company Settings form is unavailable.');
    if (!trim($('settingCompanyName')?.value)) {
      $('settingCompanyName')?.focus();
      throw new Error('Company name is required.');
    }
    for (const control of [$('settingCompanyEmail'), $('settingSupportEmail'), $('settingWebsite')]) {
      if (control?.value && !control.checkValidity()) {
        control.reportValidity();
        throw new Error('Correct the highlighted company setting before saving.');
      }
    }
  }

  async function loadSettings(reason = 'initial load') {
    if (!ensureUi()) return;
    const entity = currentEntity();
    if (!entity?.id) {
      clearForm();
      setBusy(true, 'Select an active Sulandra company to load settings.');
      return;
    }
    const requestedEntityId = String(entity.id);
    const sequence = ++state.requestSequence;
    state.loading = true;
    state.loaded = false;
    state.dirty = false;
    state.entityId = requestedEntityId;
    state.entityCode = String(entity.code || '');
    state.entityName = String(entity.displayName || entity.legalName || '');
    clearForm();
    setBusy(true, `Loading ${state.entityName || 'company'} settings…`);
    try {
      const data = await request('/api/admin/company-settings');
      if (sequence !== state.requestSequence || requestedEntityId !== String(currentEntity()?.id || '')) return;
      state.updatedAt = data.settings?.updatedAt || null;
      state.updatedById = data.settings?.updatedById || null;
      writeForm(data.settings || {});
      renderSource(data);
      state.loaded = true;
      state.dirty = false;
      setBusy(false);
      setSaveState(`Server settings loaded${reason === 'company changed' ? ' for the selected company' : ''}.`, 'success');
      document.body.dataset.companySettingsSource = 'backend';
      document.body.dataset.companySettingsEntityId = requestedEntityId;
    } catch (error) {
      if (sequence !== state.requestSequence) return;
      clearForm();
      setBusy(true);
      setSaveState(error.message || 'Company settings could not be loaded.', 'error');
      toast('Company settings unavailable', error.message || 'Unable to load settings from the backend.');
      delete document.body.dataset.companySettingsSource;
    } finally {
      if (sequence === state.requestSequence) state.loading = false;
    }
  }

  async function saveSettings() {
    if (state.saving || state.loading) return;
    try {
      validateForm();
      const entity = currentEntity();
      if (!entity?.id || String(entity.id) !== state.entityId) {
        await loadSettings('company changed');
        throw new Error('The selected company changed. Review its settings before saving.');
      }
      state.saving = true;
      setBusy(true, 'Saving to PostgreSQL…');
      const data = await request('/api/admin/company-settings', { method: 'PATCH', body: JSON.stringify(payloadFromForm()) });
      const settings = data.settings || {};
      state.updatedAt = settings.updatedAt || new Date().toISOString();
      state.updatedById = settings.updatedById || null;
      writeForm(settings);
      renderSource({ code: state.entityCode, displayName: state.entityName, settings });
      state.dirty = false;
      state.loaded = true;
      setBusy(false);
      setSaveState('Saved to the selected company and audit log.', 'success');
      toast('Company settings saved', `${state.entityName || 'The selected company'} settings were saved to the Sulandra backend.`);
      window.dispatchEvent(new CustomEvent('sulandra:company-settings-updated', { detail: { legalEntityId: state.entityId, settings } }));
    } catch (error) {
      if (state.saving) setBusy(false);
      setSaveState(error.message || 'Settings were not saved.', 'error');
      toast('Company settings not saved', error.message || 'Unable to save settings.');
    } finally {
      state.saving = false;
    }
  }

  function installUnsavedCompanySwitchGuard() {
    if (document.documentElement.dataset.companySettingsSwitchGuard === 'true') return;
    document.documentElement.dataset.companySettingsSwitchGuard = 'true';
    document.addEventListener('change', (event) => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement) || select.id !== 'adminCompanySelect') return;
      if (!state.dirty || !state.entityId || select.value === state.entityId) return;
      if (window.confirm('You have unsaved Company Settings changes. Switch companies and discard those changes?')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      select.value = state.entityId;
    }, true);
  }

  function scheduleReload(reason) {
    window.clearTimeout(scheduleReload.timer);
    scheduleReload.timer = window.setTimeout(() => loadSettings(reason), 30);
  }

  async function initialize() {
    if (!ensureUi()) return;
    installUnsavedCompanySwitchGuard();
    window.saveCompanySettings = saveSettings;
    window.SulandraCompanySettings = Object.freeze({ reload: () => loadSettings('manual reload'), save: saveSettings, state: () => ({ ...state }) });
    try { await window.SulandraCompanyContext?.initialize?.(); } catch {}
    await loadSettings('initial load');
  }

  window.addEventListener('sulandra:company-change', () => scheduleReload('company changed'));
  window.addEventListener('sulandra:entity-context-changed', () => {
    const id = String(currentEntity()?.id || '');
    if (id && id !== state.entityId) scheduleReload('company changed');
  });
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
