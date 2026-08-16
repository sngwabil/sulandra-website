(() => {
  'use strict';

  // SPIRE_GLOBAL_CHART_SEARCH_V2
  // Extends the authoritative master search so clinical context already loaded in
  // the active chart (allergies, diagnoses, precautions, baseline parameters,
  // providers, etc.) is searchable before falling back to the legacy
  // client/chart-review search.

  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const originalSearch = typeof window.handleChartSearch === 'function' ? window.handleChartSearch.bind(window) : null;
  const dropdown = () => document.getElementById('chartSearchResultsDropdown');
  const clean = (value) => String(value ?? '').trim();
  const asArray = (value) => Array.isArray(value) ? value : [];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  let requestSequence = 0;
  let cache = { patientId: '', loadedAt: 0, data: null, promise: null };

  function token() {
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of TOKEN_KEYS) {
        const value = storage.getItem(key);
        if (value) return value;
      }
    }
    return '';
  }

  async function api(path) {
    const headers = new Headers({ Accept: 'application/json' });
    const bearer = token();
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
    const response = await fetch(/^https?:\/\//i.test(path) ? path : API_BASE + path, { headers, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || payload?.error || payload?.message || `Request failed (${response.status})`);
    return payload?.data ?? payload;
  }

  function currentPatientId() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return clean(query.get('patientId') || hash.get('patient') || sessionStorage.getItem('spire:patientId'));
  }

  function includesQuery(value, query) {
    if (value == null) return false;
    if (typeof value === 'object') {
      try { return JSON.stringify(value).toLowerCase().includes(query); }
      catch { return false; }
    }
    return clean(value).toLowerCase().includes(query);
  }

  function readableKey(value) {
    return clean(value)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function installStyle() {
    if (document.getElementById('spireGlobalChartSearchStyle')) return;
    const style = document.createElement('style');
    style.id = 'spireGlobalChartSearchStyle';
    style.textContent = `
      #chartSearchResultsDropdown .spire-global-search-badge{display:inline-block;margin-right:5px;padding:1px 5px;border:1px solid #9cb8cd;border-radius:9px;background:#edf6fc;color:#174f78;font-size:9px;font-weight:800;vertical-align:1px}
      #chartSearchResultsDropdown .spire-global-search-detail{color:#5b7083;font-size:10px;margin-top:2px;white-space:normal}
      #chartSearchResultsDropdown .spire-global-search-message{cursor:default;color:#526678;background:#f8fbfd}
      .spire-global-search-hit{outline:3px solid #e5a800!important;outline-offset:2px!important;background:#fff4b8!important;transition:background .2s ease,outline-color .2s ease}
    `;
    document.head.appendChild(style);
  }

  function sidebarSection(label) {
    return [...document.querySelectorAll('.right-sidebar .sidebar-section')].find((section) => {
      const header = section.querySelector('.sidebar-section-header');
      return clean(header?.textContent).toLowerCase().includes(clean(label).toLowerCase());
    }) || null;
  }

  function resolveTarget(result) {
    if (result.target?.startsWith('sidebar:')) return sidebarSection(result.target.slice('sidebar:'.length));
    if (result.target) return document.querySelector(result.target);
    return null;
  }

  function clearHighlights() {
    document.querySelectorAll('.spire-global-search-hit').forEach((node) => node.classList.remove('spire-global-search-hit'));
  }

  function flashResult(result, query) {
    clearHighlights();
    const nodes = [];
    const preferred = resolveTarget(result);
    if (preferred) nodes.push(preferred);

    // Also illuminate the duplicate sidebar presentation when the same clinical
    // fact is intentionally shown in both left and right chart rails.
    if (result.kind === 'allergy') {
      const left = document.getElementById('displayAllergies');
      const right = sidebarSection('Clinical Context');
      if (left) nodes.push(left);
      if (right) nodes.push(right);
    }

    const unique = [...new Set(nodes)].filter(Boolean);
    unique.forEach((node) => node.classList.add('spire-global-search-hit'));
    const first = unique.find((node) => clean(node.textContent).toLowerCase().includes(query)) || unique[0];
    first?.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    window.setTimeout(clearHighlights, 4200);
  }

  function resultKey(result) {
    return `${result.kind}|${result.target || ''}|${clean(result.label).toLowerCase()}`;
  }

  function dedupe(results) {
    const seen = new Set();
    return results.filter((result) => {
      const key = resultKey(result);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function visibleClinicalMatches(query) {
    const definitions = [
      ['allergy', '#displayAllergies', 'Allergies', 'Current chart · Clinical Context'],
      ['provider', '#displayPCP', 'Primary Care Provider', 'Current chart · Care Team'],
      ['isolation', '#displayIsolation', 'Isolation / Precautions', 'Current chart · Clinical Context'],
      ['code', '#displayCode', 'Code Status', 'Current chart · Demographics'],
      ['alert', '#displayPrecautions', 'Safety / Precautions', 'Current chart · Safety & Alerts'],
      ['diet', '#displayDiet', 'Dietary Risk', 'Current chart · Safety & Alerts'],
      ['payer', '#displayPayer', 'Payer / Waiver', 'Current chart · Funding'],
      ['guardian', '#displayGuardian', 'Guardian', 'Current chart · Demographics'],
      ['vital', '#displayHtWt', 'Height / Weight', 'Current chart · Baseline'],
      ['vital', '#displayBMI', 'BMI', 'Current chart · Baseline'],
      ['diagnosis', '#sumProblemListTbody', 'Problem List / Diagnoses', 'Current chart · Summary'],
      ['provider', '#sumTeamTbody', 'Treatment Team', 'Current chart · Summary'],
    ];
    const matches = [];
    for (const [kind, selector, label, sub] of definitions) {
      const node = document.querySelector(selector);
      const text = clean(node?.textContent);
      if (!text || !text.toLowerCase().includes(query)) continue;
      matches.push({ kind, label: `${label}: ${text}`, sub, target: selector });
    }
    for (const label of ['Clinical Context', 'Baseline / Parameters']) {
      const section = sidebarSection(label);
      const text = clean(section?.querySelector('.sidebar-section-body')?.textContent);
      if (!text || !text.toLowerCase().includes(query)) continue;
      matches.push({ kind: label === 'Clinical Context' ? 'clinical' : 'vital', label, sub: text, target: `sidebar:${label}` });
    }
    return matches;
  }

  function structuredStoryboardMatches(storyboard, query) {
    const s = storyboard || {};
    const results = [];

    for (const allergy of asArray(s.allergies)) {
      if (!includesQuery(allergy, query)) continue;
      const name = clean(allergy?.substance || allergy?.name || allergy?.description || 'Allergy');
      const reaction = clean(allergy?.reaction || allergy?.reactionType || allergy?.severity || '');
      results.push({ kind: 'allergy', label: `Allergy: ${name}`, sub: reaction ? `Reaction / severity: ${reaction}` : 'Current chart · Clinical Context', target: '#displayAllergies' });
    }

    for (const diagnosis of asArray(s.diagnoses)) {
      if (!includesQuery(diagnosis, query)) continue;
      const name = clean(diagnosis?.name || diagnosis?.description || diagnosis?.code || 'Diagnosis');
      const details = [diagnosis?.code, diagnosis?.status].map(clean).filter((value) => value && value !== name).join(' · ');
      results.push({ kind: 'diagnosis', label: `Diagnosis: ${name}`, sub: details || 'Current chart · Clinical Context', target: 'sidebar:Clinical Context' });
    }

    for (const alert of asArray(s.riskAlerts)) {
      if (!includesQuery(alert, query)) continue;
      const label = clean(alert?.label || alert?.message || alert?.type || 'Safety alert');
      results.push({ kind: 'alert', label: `Safety / Alert: ${label}`, sub: clean(alert?.message || alert?.description || 'Current chart · Safety & Alerts'), target: '#displayPrecautions' });
    }

    for (const member of asArray(s.careTeam)) {
      if (!includesQuery(member, query)) continue;
      const name = clean(member?.displayName || member?.name || member?.fullName || 'Care team member');
      const role = clean(member?.role || member?.specialty || member?.title || 'Care Team');
      results.push({ kind: 'provider', label: `${role}: ${name}`, sub: 'Current chart · Treatment Team', target: '#displayPCP' });
    }

    const vitals = s.latestVitals && typeof s.latestVitals === 'object' ? s.latestVitals : {};
    for (const [key, value] of Object.entries(vitals)) {
      if (!includesQuery(`${key} ${value}`, query)) continue;
      results.push({ kind: 'vital', label: `${readableKey(key)}: ${clean(value)}`, sub: 'Current chart · Latest Vitals / Baseline', target: 'sidebar:Baseline / Parameters' });
    }

    if (includesQuery(s.codeStatus, query)) {
      results.push({ kind: 'code', label: `Code Status: ${clean(s.codeStatus)}`, sub: 'Current chart · Demographics', target: '#displayCode' });
    }

    const appointment = s.nextAppointment;
    if (appointment && includesQuery(appointment, query)) {
      const label = clean(appointment?.title || appointment?.description || 'Upcoming Appointment');
      const when = clean(appointment?.startAt || appointment?.scheduledAt || appointment?.date || '');
      results.push({ kind: 'appointment', label: `Appointment: ${label}`, sub: when || 'Current chart · Timeline', target: 'sidebar:Upcoming Appointment' });
    }

    const medications = [
      ...asArray(s.medications),
      ...asArray(s.activeMedications),
    ];
    for (const medication of medications) {
      if (!includesQuery(medication, query)) continue;
      const name = clean(medication?.name || medication?.medicationName || medication?.display || medication?.description || 'Medication');
      const dose = clean(medication?.dose || medication?.doseText || medication?.sig || '');
      results.push({ kind: 'medication', label: `Medication: ${name}`, sub: dose || 'Current chart · MAR / Orders', view: 'mar-view' });
    }

    return results;
  }

  async function storyboardFor(patientId) {
    const now = Date.now();
    if (cache.patientId === patientId && cache.data && now - cache.loadedAt < 20000) return cache.data;
    if (cache.patientId === patientId && cache.promise) return cache.promise;
    cache = {
      patientId,
      loadedAt: 0,
      data: null,
      promise: api(`/api/spire/patients/${encodeURIComponent(patientId)}/storyboard`)
        .then((data) => {
          cache.data = data || {};
          cache.loadedAt = Date.now();
          cache.promise = null;
          return cache.data;
        })
        .catch((error) => {
          cache.promise = null;
          throw error;
        }),
    };
    return cache.promise;
  }

  function activateView(viewId) {
    if (!viewId) return;
    const tab = document.querySelector(`#mainChartTabs .chart-tab[data-view="${viewId}"]`);
    tab?.click();
  }

  function renderResults(results, query) {
    const drop = dropdown();
    if (!drop) return;
    const limited = results.slice(0, 20);
    drop.innerHTML = limited.map((result, index) => `
      <div class="search-result-item" data-spire-global-search-index="${index}">
        <span class="spire-global-search-badge">${esc(readableKey(result.kind || 'chart'))}</span><b>${esc(result.label || 'Chart result')}</b>
        <div class="spire-global-search-detail">${esc(result.sub || '')}</div>
      </div>`).join('');
    drop.style.display = 'block';
    drop.querySelectorAll('[data-spire-global-search-index]').forEach((node) => {
      node.addEventListener('click', () => {
        const result = limited[Number(node.dataset.spireGlobalSearchIndex)];
        drop.style.display = 'none';
        activateView(result?.view);
        window.setTimeout(() => flashResult(result || {}, query), result?.view ? 240 : 20);
      });
    });
  }

  async function enhancedChartSearch(rawQuery) {
    const query = clean(rawQuery).toLowerCase();
    const drop = dropdown();
    const sequence = ++requestSequence;
    clearHighlights();

    if (query.length < 2) {
      if (originalSearch) return originalSearch(rawQuery);
      if (drop) { drop.style.display = 'none'; drop.innerHTML = ''; }
      return;
    }

    const visible = visibleClinicalMatches(query);
    if (visible.length) renderResults(dedupe(visible), query);

    const patientId = currentPatientId();
    if (!patientId) return originalSearch ? originalSearch(rawQuery) : undefined;

    try {
      const storyboard = await storyboardFor(patientId);
      if (sequence !== requestSequence) return;
      const structured = structuredStoryboardMatches(storyboard, query);
      const combined = dedupe([...structured, ...visible]);
      if (combined.length) {
        renderResults(combined, query);
        return;
      }
    } catch {
      if (sequence !== requestSequence) return;
      if (visible.length) return;
    }

    if (sequence !== requestSequence) return;
    if (originalSearch) return originalSearch(rawQuery);
    if (drop) {
      drop.innerHTML = '<div class="search-result-item spire-global-search-message">No matching authorized chart/client results.</div>';
      drop.style.display = 'block';
    }
  }

  installStyle();
  window.handleChartSearch = enhancedChartSearch;
  window.SpireGlobalChartSearch = Object.freeze({
    version: '20260816-chart-search-1',
    search: enhancedChartSearch,
    invalidate: () => { cache = { patientId: '', loadedAt: 0, data: null, promise: null }; },
  });
})();
