(() => {
  'use strict';

  // SPIRE_GLOBAL_CHART_SEARCH_V3
  // Search is chart-wide: visible clinical context, live MAR, canonical eMAR,
  // storyboard data, then the original authorized client/chart-review fallback.
  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const originalSearch = typeof window.handleChartSearch === 'function' ? window.handleChartSearch.bind(window) : null;
  const dropdown = () => document.getElementById('chartSearchResultsDropdown');
  const clean = (value) => String(value ?? '').trim();
  const asArray = (value) => Array.isArray(value) ? value : [];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  let requestSequence = 0;
  let storyboardCache = { patientId: '', loadedAt: 0, data: null, promise: null };
  let emarCache = { key: '', loadedAt: 0, data: null, promise: null };

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

  function selectedMarDate() {
    const input = document.getElementById('marDatePicker');
    if (input?.value) return input.value;
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
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

  function matchingMarRow(needle) {
    const query = clean(needle).toLowerCase();
    if (!query) return null;
    return [...document.querySelectorAll('#mar-view .spire-mar-grid-row,#mar-view .spire-mar-medication-row,#mar-view .mar-med-row')]
      .find((node) => clean(node.textContent).toLowerCase().includes(query)) || null;
  }

  function flashResult(result, query) {
    clearHighlights();
    const nodes = [];
    const preferred = resolveTarget(result);
    if (preferred) nodes.push(preferred);
    if (result.kind === 'allergy') {
      const left = document.getElementById('displayAllergies');
      const right = sidebarSection('Clinical Context');
      if (left) nodes.push(left);
      if (right) nodes.push(right);
    }
    if (result.kind === 'medication') {
      const row = matchingMarRow(result.medicationNeedle || query);
      if (row) nodes.push(row);
    }
    const unique = [...new Set(nodes)].filter(Boolean);
    unique.forEach((node) => node.classList.add('spire-global-search-hit'));
    const first = unique.find((node) => clean(node.textContent).toLowerCase().includes(query)) || unique[0];
    first?.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    window.setTimeout(clearHighlights, 4200);
  }

  function resultKey(result) {
    return `${result.kind}|${clean(result.label).toLowerCase()}`;
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
      if (text && text.toLowerCase().includes(query)) matches.push({ kind, label: `${label}: ${text}`, sub, target: selector });
    }
    for (const label of ['Clinical Context', 'Baseline / Parameters']) {
      const section = sidebarSection(label);
      const text = clean(section?.querySelector('.sidebar-section-body')?.textContent);
      if (text && text.toLowerCase().includes(query)) matches.push({ kind: label === 'Clinical Context' ? 'clinical' : 'vital', label, sub: text, target: `sidebar:${label}` });
    }
    return matches;
  }

  function visibleMarMatches(query) {
    const rows = [...document.querySelectorAll('#mar-view .spire-mar-grid-row,#mar-view .spire-mar-medication-row,#mar-view .mar-med-row')];
    const results = [];
    for (const row of rows) {
      const text = clean(row.textContent);
      if (!text || !text.toLowerCase().includes(query)) continue;
      const nameNode = row.querySelector('.spire-mar-grid-med-name,.spire-mar-med-name,.mar-med-name');
      const name = clean(nameNode?.textContent) || text.split(/\n|ACTIVE|SCHEDULED/i)[0].trim() || 'Medication';
      results.push({ kind: 'medication', label: `Medication: ${name}`, sub: 'Current MAR / eMAR · visible medication', view: 'mar-view', medicationNeedle: name });
    }
    return results;
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
      if (includesQuery(`${key} ${value}`, query)) results.push({ kind: 'vital', label: `${readableKey(key)}: ${clean(value)}`, sub: 'Current chart · Latest Vitals / Baseline', target: 'sidebar:Baseline / Parameters' });
    }
    if (includesQuery(s.codeStatus, query)) results.push({ kind: 'code', label: `Code Status: ${clean(s.codeStatus)}`, sub: 'Current chart · Demographics', target: '#displayCode' });
    const appointment = s.nextAppointment;
    if (appointment && includesQuery(appointment, query)) {
      const label = clean(appointment?.title || appointment?.description || 'Upcoming Appointment');
      const when = clean(appointment?.startAt || appointment?.scheduledAt || appointment?.date || '');
      results.push({ kind: 'appointment', label: `Appointment: ${label}`, sub: when || 'Current chart · Timeline', target: 'sidebar:Upcoming Appointment' });
    }
    for (const medication of [...asArray(s.medications), ...asArray(s.activeMedications)]) {
      if (!includesQuery(medication, query)) continue;
      const name = clean(medication?.name || medication?.medicationName || medication?.display || medication?.description || 'Medication');
      const dose = clean(medication?.dose || medication?.doseText || medication?.sig || '');
      results.push({ kind: 'medication', label: `Medication: ${name}`, sub: dose || 'Current chart · MAR / Orders', view: 'mar-view', medicationNeedle: name });
    }
    return results;
  }

  function emarMatches(emar, query) {
    const medications = asArray(emar?.medications || emar?.items || emar);
    const results = [];
    for (const medication of medications) {
      if (!includesQuery(medication, query)) continue;
      const name = clean(medication?.medicationName || medication?.name || medication?.display || medication?.description || 'Medication');
      const details = [medication?.dose, medication?.route, medication?.frequency].map(clean).filter(Boolean).join(' · ');
      results.push({ kind: 'medication', label: `Medication: ${name}`, sub: details || 'Canonical MAR / eMAR medication order', view: 'mar-view', medicationNeedle: name });
    }
    return results;
  }

  async function storyboardFor(patientId) {
    const now = Date.now();
    if (storyboardCache.patientId === patientId && storyboardCache.data && now - storyboardCache.loadedAt < 20000) return storyboardCache.data;
    if (storyboardCache.patientId === patientId && storyboardCache.promise) return storyboardCache.promise;
    storyboardCache = { patientId, loadedAt: 0, data: null, promise: null };
    storyboardCache.promise = api(`/api/spire/patients/${encodeURIComponent(patientId)}/storyboard`).then((data) => {
      storyboardCache.data = data || {};
      storyboardCache.loadedAt = Date.now();
      storyboardCache.promise = null;
      return storyboardCache.data;
    }).catch((error) => { storyboardCache.promise = null; throw error; });
    return storyboardCache.promise;
  }

  async function emarFor(patientId, date) {
    const key = `${patientId}|${date}`;
    const now = Date.now();
    if (emarCache.key === key && emarCache.data && now - emarCache.loadedAt < 10000) return emarCache.data;
    if (emarCache.key === key && emarCache.promise) return emarCache.promise;
    emarCache = { key, loadedAt: 0, data: null, promise: null };
    emarCache.promise = api(`/api/spire/patients/${encodeURIComponent(patientId)}/emar?date=${encodeURIComponent(date)}`).then((data) => {
      emarCache.data = data || {};
      emarCache.loadedAt = Date.now();
      emarCache.promise = null;
      return emarCache.data;
    }).catch((error) => { emarCache.promise = null; throw error; });
    return emarCache.promise;
  }

  function activateView(viewId) {
    if (!viewId) return;
    document.querySelector(`#mainChartTabs .chart-tab[data-view="${viewId}"]`)?.click();
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
    drop.querySelectorAll('[data-spire-global-search-index]').forEach((node) => node.addEventListener('click', () => {
      const result = limited[Number(node.dataset.spireGlobalSearchIndex)];
      drop.style.display = 'none';
      activateView(result?.view);
      window.setTimeout(() => flashResult(result || {}, query), result?.view ? 500 : 20);
    }));
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

    const visible = dedupe([...visibleMarMatches(query), ...visibleClinicalMatches(query)]);
    if (visible.length) renderResults(visible, query);
    const patientId = currentPatientId();
    if (!patientId) return visible.length ? undefined : (originalSearch ? originalSearch(rawQuery) : undefined);

    let gathered = [...visible];
    const [storyResult, emarResult] = await Promise.allSettled([
      storyboardFor(patientId),
      emarFor(patientId, selectedMarDate()),
    ]);
    if (sequence !== requestSequence) return;
    if (storyResult.status === 'fulfilled') gathered.push(...structuredStoryboardMatches(storyResult.value, query));
    if (emarResult.status === 'fulfilled') gathered.push(...emarMatches(emarResult.value, query));
    gathered = dedupe(gathered);
    if (gathered.length) {
      renderResults(gathered, query);
      return;
    }

    if (originalSearch) return originalSearch(rawQuery);
    if (drop) {
      drop.innerHTML = '<div class="search-result-item spire-global-search-message">No matching authorized chart/client results.</div>';
      drop.style.display = 'block';
    }
  }

  installStyle();
  window.handleChartSearch = enhancedChartSearch;
  window.SpireGlobalChartSearch = Object.freeze({
    version: '20260816-chart-search-2',
    search: enhancedChartSearch,
    invalidate: () => {
      storyboardCache = { patientId: '', loadedAt: 0, data: null, promise: null };
      emarCache = { key: '', loadedAt: 0, data: null, promise: null };
    },
  });
})();