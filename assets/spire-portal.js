(() => {
  'use strict';

  // SPIRE_PORTAL_WORKFLOW_V1
  // Login -> explicit company -> explicit service home -> Patient Station -> explicit chart open.
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const DEPARTMENT_KEY = 'sulandra:selected-department-id';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_NAME_KEY = 'spire:selected-service-home-name';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  const PATIENT_KEY = 'spire:patientId';

  const state = {
    user: null,
    companies: [],
    company: null,
    homes: [],
    home: null,
    patients: [],
    selectedPatient: null,
    requestedPatientId: '',
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const token = () => TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';
  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const initials = (value) => clean(value).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'SH';
  const apiUrl = (path) => /^https?:\/\//i.test(path) ? path : API + path;
  const fmtDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US');
  };

  function saveStorage(key, value) {
    const normalized = clean(value);
    if (normalized) {
      sessionStorage.setItem(key, normalized);
      localStorage.setItem(key, normalized);
    } else {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
  }

  function clearHomeScope() {
    sessionStorage.removeItem(HOME_ID_KEY);
    sessionStorage.removeItem(HOME_NAME_KEY);
    sessionStorage.removeItem(HOME_ENTITY_KEY);
    sessionStorage.removeItem(PATIENT_KEY);
    state.home = null;
    state.homes = [];
    state.patients = [];
    state.selectedPatient = null;
  }

  function clearPatientScope() {
    sessionStorage.removeItem(PATIENT_KEY);
    state.selectedPatient = null;
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body != null && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const accessToken = token();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    if (options.entityId) headers.set('x-legal-entity-id', String(options.entityId));
    if (options.homeId) headers.set('x-spire-home-id', String(options.homeId));
    const response = await fetch(apiUrl(path), { ...options, headers, cache: 'no-store' });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || payload.message || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload.data ?? payload;
  }

  function returnToLogin() {
    const returnTo = location.pathname + location.search + location.hash;
    location.replace(`/employee-login.html?return=${encodeURIComponent(returnTo)}`);
  }

  async function loadSession() {
    let lastError;
    for (const endpoint of ['/api/auth/me', '/api/session', '/api/auth/session']) {
      try {
        const data = await api(endpoint);
        const user = data?.user || data?.session || data;
        if (user && (user.id || user.userId || user.email)) return user;
      } catch (error) {
        lastError = error;
        if (error.status === 401) break;
      }
    }
    throw lastError || new Error('Unable to verify your Sulandra Health session.');
  }

  function setMessage(message = '', type = '') {
    const node = $('#portalMessage');
    if (!node) return;
    node.textContent = message;
    node.className = `message${message ? ' show' : ''}${type ? ` ${type}` : ''}`;
  }

  function setIdentity() {
    const user = state.user || {};
    const name = user.displayName || user.name || user.fullName || user.email || 'Sulandra Health User';
    const role = user.jobTitle || user.role || user.credentials || user.email || 'Authorized clinical user';
    $('#portalUserName').textContent = name;
    $('#portalUserRole').textContent = role;
    $('#portalAvatar').textContent = initials(name);
  }

  function setStep(step) {
    const order = ['company', 'home', 'patient'];
    const activeIndex = Math.max(0, order.indexOf(step));
    order.forEach((key, index) => {
      const node = key === 'company' ? $('#stepCompany') : key === 'home' ? $('#stepHome') : $('#stepPatient');
      node.classList.toggle('active', index === activeIndex);
      node.classList.toggle('done', index < activeIndex);
    });
    $('#companyPanel').hidden = step !== 'company';
    $('#homePanel').hidden = step !== 'home';
    $('#patientPanel').hidden = step !== 'patient';
    $('#navCompanies').classList.toggle('primary', step === 'company');
    $('#navHomes').classList.toggle('primary', step === 'home');
    $('#navClients').classList.toggle('primary', step === 'patient');
    $('#navHomes').disabled = !state.company;
    $('#navClients').disabled = !state.company || !state.home;
    updateScopeChip();
  }

  function updateScopeChip() {
    const parts = [];
    if (state.company) parts.push(state.company.displayName || state.company.legalName || state.company.code);
    if (state.home) parts.push(state.home.name || 'Service Home');
    $('#scopeChip').textContent = parts.length ? parts.join(' · ') : 'No clinical scope selected';
  }

  function enabledModules(company) {
    const metadata = company?.metadata && typeof company.metadata === 'object' ? company.metadata : {};
    return Array.isArray(metadata.enabledModules) ? metadata.enabledModules.map(String) : [];
  }

  function companyCanUseSpire(company) {
    const modules = enabledModules(company);
    if (company?.code === 'SCLS' && modules.length === 0) return true;
    return modules.includes('SPIRE');
  }

  function companyAvailable(company) {
    return String(company?.status || '').toUpperCase() === 'ACTIVE' && companyCanUseSpire(company);
  }

  async function loadCompanies() {
    const data = await api('/api/entity-context');
    state.companies = Array.isArray(data?.entities) ? data.entities : [];
    renderCompanies();
    return data;
  }

  function companySubtitle(company) {
    const employments = Array.isArray(company.employments) ? company.employments : [];
    const active = employments.find((row) => String(row.status || '').toUpperCase() !== 'TERMINATED') || employments[0];
    const job = active?.jobTitle || active?.departmentName || '';
    const status = company.status || 'UNKNOWN';
    const modules = enabledModules(company);
    return [job, `Status: ${status}`, modules.length ? `${modules.length} enabled module${modules.length === 1 ? '' : 's'}` : 'Enterprise access'].filter(Boolean).join(' · ');
  }

  function renderCompanies() {
    const grid = $('#companyGrid');
    const term = clean($('#companySearch')?.value).toLowerCase();
    const companies = state.companies.filter((company) => !term || [company.displayName, company.legalName, company.code, companySubtitle(company)].some((value) => clean(value).toLowerCase().includes(term)));
    if (!companies.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No Sulandra companies assigned to this account match your search.</div>';
      return;
    }
    grid.innerHTML = companies.map((company) => {
      const available = companyAvailable(company);
      const reason = String(company.status || '').toUpperCase() !== 'ACTIVE' ? 'Company is not active for clinical use.' : !companyCanUseSpire(company) ? 'SPIRE is not enabled for this company.' : 'Open this company in SPIRE.';
      return `<article class="choice-card ${available ? '' : 'disabled'}" data-company-card="${esc(company.id)}">
        <span class="choice-code">${esc(company.code || 'COMPANY')}</span>
        <div class="choice-title">${esc(company.displayName || company.legalName || company.code || 'Sulandra Company')}</div>
        <div class="choice-meta">${esc(companySubtitle(company))}<br>${esc(reason)}</div>
        <button type="button" data-select-company="${esc(company.id)}" ${available ? '' : 'disabled'}>Select Company</button>
      </article>`;
    }).join('');
    $$('[data-select-company]', grid).forEach((button) => button.addEventListener('click', () => selectCompany(button.dataset.selectCompany)));
  }

  async function selectCompany(companyId, { advance = true } = {}) {
    const company = state.companies.find((row) => String(row.id) === String(companyId));
    if (!company || !companyAvailable(company)) throw new Error('That company is not available for SPIRE clinical access.');
    state.company = company;
    saveStorage(ENTITY_KEY, company.id);
    saveStorage(DEPARTMENT_KEY, '');
    clearHomeScope();
    setMessage('');
    await loadHomes();
    if (advance) setStep('home');
    return company;
  }

  function homeAddress(home) {
    return [home.streetAddress || home.address, home.city, home.state, home.zipCode].filter(Boolean).join(', ');
  }

  async function loadHomes() {
    if (!state.company) return;
    $('#homeGrid').innerHTML = '<div class="loading" style="grid-column:1/-1">Loading authorized service homes…</div>';
    const data = await api('/api/spire/network/service-homes', { entityId: state.company.id });
    const allHomes = Array.isArray(data?.homes) ? data.homes : [];
    state.homes = allHomes.filter((home) => String(home.legalEntityId || '') === String(state.company.id));
    renderHomes();
  }

  function renderHomes() {
    const grid = $('#homeGrid');
    const term = clean($('#homeSearch')?.value).toLowerCase();
    const homes = state.homes.filter((home) => !term || [home.name, home.companyName, home.companyCode, homeAddress(home)].some((value) => clean(value).toLowerCase().includes(term)));
    if (!homes.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${state.homes.length ? 'No service homes match your search.' : 'No service homes in this company are assigned to your SPIRE account.'}</div>`;
      return;
    }
    grid.innerHTML = homes.map((home) => `<article class="choice-card" data-home-card="${esc(home.id)}">
      <span class="choice-code">${home.favorite ? '★ FAVORITE' : esc(home.companyCode || state.company?.code || 'HOME')}</span>
      <div class="choice-title">${esc(home.name || 'Service Home')}</div>
      <div class="choice-meta">${esc(homeAddress(home) || 'Address maintained by administration')}<br>${Number(home.clientCount || 0)} active client${Number(home.clientCount || 0) === 1 ? '' : 's'}</div>
      <button type="button" data-select-home="${esc(home.id)}">Access Home</button>
    </article>`).join('');
    $$('[data-select-home]', grid).forEach((button) => button.addEventListener('click', () => accessHome(button.dataset.selectHome).catch((error) => setMessage(error.message, 'error'))));
  }

  async function accessHome(homeId, { advance = true } = {}) {
    if (!state.company) throw new Error('Select a company first.');
    const home = state.homes.find((row) => String(row.id) === String(homeId));
    if (!home) throw new Error('That service home is not available in the selected company.');
    setMessage(`Verifying access to ${home.name || 'service home'}…`);
    const data = await api(`/api/spire/network/service-homes/${encodeURIComponent(home.id)}/access`, {
      method: 'POST',
      body: JSON.stringify({}),
      entityId: state.company.id,
      homeId: home.id,
    });
    state.home = data?.home || home;
    state.patients = Array.isArray(data?.patients) ? data.patients : [];
    clearPatientScope();
    sessionStorage.setItem(HOME_ID_KEY, String(state.home.id));
    sessionStorage.setItem(HOME_NAME_KEY, String(state.home.name || 'Service Home'));
    sessionStorage.setItem(HOME_ENTITY_KEY, String(state.home.legalEntityId || state.company.id));
    setMessage(`${state.home.name || 'Service home'} access verified. Select a client in Patient Station.`, 'success');
    renderPatientStation();
    if (advance) setStep('patient');
    return state.home;
  }

  function patientName(patient) {
    return patient.name || patient.displayName || [patient.preferredName || patient.firstName, patient.lastName].filter(Boolean).join(' ') || 'Client';
  }

  function renderPatientStation() {
    $('#stationHomeName').textContent = state.home?.name || 'Selected Service Home';
    $('#stationHomeMeta').textContent = [state.company?.displayName || state.company?.legalName || state.company?.code, homeAddress(state.home || {}), `${state.patients.length} active client${state.patients.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
    renderPatients();
  }

  function renderPatients() {
    const body = $('#patientTableBody');
    const term = clean($('#patientSearch')?.value).toLowerCase();
    const patients = state.patients.filter((patient) => !term || [patientName(patient), patient.medicalRecordNumber, patient.dateOfBirth, patient.homeName, patient.programName].some((value) => clean(value).toLowerCase().includes(term)));
    if (!patients.length) {
      body.innerHTML = `<tr><td colspan="6"><div class="empty" style="margin:8px">${state.patients.length ? 'No clients match your search.' : 'No active clients are assigned to this service home.'}</div></td></tr>`;
      setSelectedPatient(null);
      return;
    }
    body.innerHTML = patients.map((patient) => {
      const id = patient.patientId || patient.id;
      const flags = Array.isArray(patient.flags) ? patient.flags : [];
      const requested = state.requestedPatientId && String(id) === String(state.requestedPatientId);
      const selected = state.selectedPatient && String(state.selectedPatient.patientId || state.selectedPatient.id) === String(id);
      return `<tr class="patient-row${selected ? ' selected' : ''}${requested ? ' requested' : ''}" tabindex="0" data-patient-id="${esc(id)}" aria-label="${esc(patientName(patient))}. Double-click to open chart.">
        <td><span class="patient-name">${esc(patientName(patient))}</span></td>
        <td class="mrn">${esc(patient.medicalRecordNumber || '—')}</td>
        <td>${esc(fmtDate(patient.dateOfBirth))}</td>
        <td>${esc(patient.homeName || state.home?.name || '—')}</td>
        <td>${esc(patient.programName || '—')}</td>
        <td>${flags.length ? flags.map((flag) => `<span class="flag">${esc(flag.label || flag.severity || 'Alert')}</span>`).join('') : '—'}</td>
      </tr>`;
    }).join('');
    $$('.patient-row', body).forEach((row) => {
      row.addEventListener('click', () => setSelectedPatientById(row.dataset.patientId));
      row.addEventListener('dblclick', () => {
        setSelectedPatientById(row.dataset.patientId);
        openSelectedChart();
      });
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          setSelectedPatientById(row.dataset.patientId);
        }
      });
    });
    if (state.requestedPatientId && !state.selectedPatient) {
      const requested = state.patients.find((patient) => String(patient.patientId || patient.id) === String(state.requestedPatientId));
      if (requested) {
        setSelectedPatient(requested);
        setMessage('The requested client is highlighted. Double-click the client or use Open Selected Chart; SPIRE will not open the chart automatically.', 'success');
      }
    }
  }

  function setSelectedPatientById(patientId) {
    const patient = state.patients.find((row) => String(row.patientId || row.id) === String(patientId)) || null;
    setSelectedPatient(patient);
  }

  function setSelectedPatient(patient) {
    state.selectedPatient = patient;
    const id = patient ? String(patient.patientId || patient.id) : '';
    $$('.patient-row').forEach((row) => row.classList.toggle('selected', Boolean(id) && row.dataset.patientId === id));
    $('#openSelectedChart').disabled = !patient;
    $('#selectedClientLabel').textContent = patient ? `${patientName(patient)} selected. Double-click the row or choose Open Selected Chart.` : 'No client selected.';
  }

  function openSelectedChart() {
    const patient = state.selectedPatient;
    if (!patient || !state.company || !state.home) return;
    const patientId = String(patient.patientId || patient.id || '');
    if (!patientId) return;
    sessionStorage.setItem(PATIENT_KEY, patientId);
    const query = new URLSearchParams({
      patientId,
      spireHome: String(state.home.id),
      company: String(state.company.id),
    });
    location.assign(`/spire/master.html?${query.toString()}`);
  }

  function requestedScope() {
    const params = new URLSearchParams(location.search);
    return {
      step: clean(params.get('step')).toLowerCase(),
      companyId: clean(params.get('company')),
      homeId: clean(params.get('home') || params.get('spireHome')),
      patientId: clean(params.get('patientId')),
    };
  }

  async function restoreRequestedStep() {
    const requested = requestedScope();
    state.requestedPatientId = requested.patientId;
    if ((requested.step === 'homes' || requested.step === 'clients') && requested.companyId) {
      const company = state.companies.find((row) => String(row.id) === requested.companyId);
      if (company && companyAvailable(company)) {
        await selectCompany(company.id, { advance: false });
        if (requested.step === 'homes') {
          setStep('home');
          return;
        }
        if (requested.homeId) {
          const home = state.homes.find((row) => String(row.id) === requested.homeId);
          if (home) {
            await accessHome(home.id, { advance: false });
            setStep('patient');
            return;
          }
        }
        setStep('home');
        return;
      }
    }
    setStep('company');
  }

  function wireNavigation() {
    $('#companySearch').addEventListener('input', renderCompanies);
    $('#homeSearch').addEventListener('input', renderHomes);
    $('#patientSearch').addEventListener('input', renderPatients);
    $('#openSelectedChart').addEventListener('click', openSelectedChart);
    $('#navCompanies').addEventListener('click', () => {
      clearHomeScope();
      state.company = null;
      saveStorage(ENTITY_KEY, '');
      saveStorage(DEPARTMENT_KEY, '');
      setMessage('Select the Sulandra company you are working under.');
      setStep('company');
    });
    $('#navHomes').addEventListener('click', () => {
      if (!state.company) return;
      clearPatientScope();
      state.home = null;
      sessionStorage.removeItem(HOME_ID_KEY);
      sessionStorage.removeItem(HOME_NAME_KEY);
      sessionStorage.removeItem(HOME_ENTITY_KEY);
      setMessage('Select a service home for this company.');
      setStep('home');
      renderHomes();
    });
    $('#navClients').addEventListener('click', async () => {
      if (!state.company || !state.home) return;
      try {
        await accessHome(state.home.id, { advance: false });
        setStep('patient');
      } catch (error) {
        setMessage(error.message, 'error');
      }
    });
    $('#portalLogout').addEventListener('click', () => {
      TOKEN_KEYS.forEach((key) => { sessionStorage.removeItem(key); localStorage.removeItem(key); });
      clearHomeScope();
      location.assign('/employee-login.html');
    });
  }

  async function bootstrap() {
    wireNavigation();
    sessionStorage.removeItem(PATIENT_KEY);
    if (!token()) {
      returnToLogin();
      return;
    }
    try {
      state.user = await loadSession();
      setIdentity();
      await loadCompanies();
      await restoreRequestedStep();
      if (!state.companies.length) setMessage('No Sulandra company access is assigned to this account.', 'error');
    } catch (error) {
      if (error.status === 401) {
        returnToLogin();
        return;
      }
      setMessage(error.message || 'SPIRE Clinical Access could not start.', 'error');
      $('#companyGrid').innerHTML = '<div class="empty" style="grid-column:1/-1">Unable to load SPIRE access. Refresh or contact Sulandra Health administration.</div>';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
