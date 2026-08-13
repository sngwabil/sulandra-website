(() => {
  'use strict';

  const VERSION = '20260813-dsp-daily-grid-2';
  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const EXPECTED_TASK_ROWS = 30;

  // These definitions are row/task metadata only. Clinical values are NEVER
  // fabricated from this file; every displayed filed value comes from the
  // server-backed SpireFlowsheetEntry record or from a local unsaved draft.
  const flowsheetData = {
    vitals: [
      { header: 'Vitals & Health Monitoring' },
      { row: 'Temp (°F)', isNumeric: true },
      { row: 'Temp Source' },
      { row: 'Pulse (bpm)', isNumeric: true },
      { row: 'Resp (breaths/min)', isNumeric: true },
      { row: 'BP (mmHg)' },
      { row: 'Blood Glucose (mg/dL)', isNumeric: true },
    ],
    adls: [
      { header: 'ADLs & Personal Care Support' },
      { row: 'Bathing / Showering (Bathing Assistance)' },
      { row: 'Dressing Assistance' },
      { row: 'Grooming & Oral Care' },
      { row: 'Toileting Support' },
    ],
    meds: [
      { header: 'Medication Administration (eMAR)' },
      { row: 'Scheduled Meds Administered (AM)' },
      { row: 'Swallow & Prompt Supervision' },
      { row: 'PRN Medication Review' },
      { row: 'Medication Refusals / Omissions' },
    ],
    meals: [
      { header: 'Meal & Dysphagia Precautions' },
      { row: 'Diet Texture (Soft & Bite-Sized)' },
      { row: 'Liquid Consistency (Thin Liquids)' },
      { row: 'Upright Positioning (30 Min Post-Meal)' },
      { row: 'Pacing & Small Bites Supervision' },
    ],
    seizure: [
      { header: 'Seizure & Neurological Check' },
      { row: 'Seizure Observation' },
      { row: 'Postictal Recovery Status' },
      { row: 'Rescue Med Preparedness (Midazolam)' },
    ],
    behavior: [
      { header: 'Behavioral & Elopement Support' },
      { row: 'Emotional Baseline / Mood' },
      { row: 'Triggers / Antecedents Observed' },
      { row: 'De-escalation / Proactive Support Used' },
    ],
    bowel: [
      { header: 'Bowel & Elimination Protocol' },
      { row: 'Bowel Movement Recorded' },
      { row: 'Fluid Intake Encouragement' },
    ],
    community: [
      { header: 'Community Outings & Transport' },
      { row: 'Community Outing / Activity' },
      { row: 'Vehicle Seat Belt Secured' },
    ],
    isp: [
      { header: 'ISP Goal Skill-Building' },
      { row: 'Independent Task Prompting' },
      { row: 'Money Management Support' },
    ],
  };

  const taskOptionsMap = {
    'temp source': ['Oral', 'Tympanic', 'Axillary', 'Temporal', 'Refused'],
    'bathing / showering (bathing assistance)': ['Prompted', 'Independent', 'Partial Assist', 'Total Assist', 'Refused', 'Completed'],
    'dressing assistance': ['Independent', 'Prompting', 'Partial Assist', 'Total Assist', 'Refused', 'Completed'],
    'grooming & oral care': ['Prompted', 'Independent', 'Partial Assist', 'Total Assist', 'Refused', 'Completed'],
    'toileting support': ['Independent', 'Prompting', 'Partial Assist', 'Total Assist', 'Refused', 'Completed'],
    'scheduled meds administered (am)': ['Given (8:00 AM)', 'Given (5:00 PM)', 'Held', 'Refused', 'Omitted'],
    'swallow & prompt supervision': ['Completed', 'Supervised', 'Assisted', 'Refused'],
    'prn medication review': ['None', 'Acetaminophen given', 'Refused'],
    'medication refusals / omissions': ['None', 'Refused', 'Omitted'],
    'diet texture (soft & bite-sized)': ['Verified (Soft)', 'Modified', 'Refused'],
    'liquid consistency (thin liquids)': ['Verified (Thin)', 'Modified', 'Refused'],
    'upright positioning (30 min post-meal)': ['Maintained (30 min)', 'Not Maintained', 'Refused'],
    'pacing & small bites supervision': ['Completed', 'Supervised', 'Refused'],
    'seizure observation': ['None', 'Generalized Tonic-Clonic', 'Focal', 'Rescue Med Given', 'Refused'],
    'postictal recovery status': ['Baseline', 'Fatigued', 'Confused', 'Resting'],
    'rescue med preparedness (midazolam)': ['Ready', 'Administered', 'Not Required'],
    'emotional baseline / mood': ['Calm', 'Anxious', 'Agitated', 'Withdrawn', 'Cooperative'],
    'triggers / antecedents observed': ['None', 'Loud Noise', 'Routine Change', 'Rushed'],
    'de-escalation / proactive support used': ['Not Needed', 'Calm Reassurance', 'Quiet Space Offered', 'Redirected'],
    'bowel movement recorded': ['Yes (Normal)', 'Loose', 'Constipated', 'None', 'Refused'],
    'fluid intake encouragement': ['Encouraged', 'Offered & Consumed', 'Refused', 'Completed'],
    'community outing / activity': ['Completed', 'Rescheduled', 'Refused', 'N/A'],
    'vehicle seat belt secured': ['Secured', 'Refused', 'N/A'],
    'independent task prompting': ['Completed', 'Prompted', 'Assisted', 'Refused'],
    'money management support': ['Reviewed', 'Assisted', 'Refused', 'N/A'],
    'sleep log': ['Sleeping', 'Awake', 'Restless', 'Refused'],
  };

  const runtime = {
    patientId: '',
    data: null,
    columns: [],
    category: 'all',
    activeCell: null,
    loading: false,
    rendering: false,
    observer: null,
    companyObserver: null,
    saveTimers: new Map(),
    savePromises: new Map(),
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const token = () => TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';
  const isoMinute = (value) => {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    date.setSeconds(0, 0);
    return date.toISOString();
  };
  const fmtTime = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '');
  const fmtDate = (value) => new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

  function currentPatientId() {
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const query = new URLSearchParams(location.search);
    return hash.get('patient') || query.get('patientId') || sessionStorage.getItem('spire:patientId') || '';
  }

  function columnStorageKey() {
    return runtime.patientId ? `spire:flowsheet:columns:${runtime.patientId}` : '';
  }

  function draftStorageKey(rowId, recordedAt) {
    return runtime.patientId && rowId && recordedAt
      ? `spire:flowsheet:draft:${runtime.patientId}:${rowId}:${isoMinute(recordedAt)}`
      : '';
  }

  function readStoredColumns() {
    const key = columnStorageKey();
    if (!key) return [];
    try {
      const values = JSON.parse(sessionStorage.getItem(key) || '[]');
      return Array.isArray(values) ? values.map(isoMinute).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function storeColumns() {
    const key = columnStorageKey();
    if (!key) return;
    sessionStorage.setItem(key, JSON.stringify(runtime.columns));
  }

  function readDraft(rowId, recordedAt) {
    const key = draftStorageKey(rowId, recordedAt);
    if (!key) return null;
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  function writeDraft(cell) {
    const key = draftStorageKey(cell.dataset.rowId, cell.dataset.flowTime);
    if (!key) return;
    sessionStorage.setItem(key, JSON.stringify({
      text: cell.textContent.trim(),
      comment: cell.dataset.comment || '',
      updatedAt: new Date().toISOString(),
    }));
  }

  function clearDraft(rowId, recordedAt) {
    const key = draftStorageKey(rowId, recordedAt);
    if (key) sessionStorage.removeItem(key);
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (options.body != null && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token() && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token()}`);
    const response = await fetch(/^https?:\/\//i.test(path) ? path : API_BASE + path, { ...options, headers, cache: 'no-store' });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data ?? payload;
  }

  function getOptionsForRow(rowName) {
    const key = normalize(rowName);
    if (taskOptionsMap[key]) return taskOptionsMap[key];
    for (const optionKey of Object.keys(taskOptionsMap)) {
      if (key.includes(optionKey) || optionKey.includes(key)) return taskOptionsMap[optionKey];
    }
    return ['Independent', 'Prompting', 'Partial Assist', 'Total Assist', 'Refused', 'Completed', 'N/A'];
  }

  function rowByName(name) {
    const rows = Array.isArray(runtime.data?.rows) ? runtime.data.rows : [];
    const wanted = normalize(name);
    const aliases = {
      'temp (°f)': ['temp (°f)', 'temperature'],
      'pulse (bpm)': ['pulse (bpm)', 'pulse'],
      'resp (breaths/min)': ['resp (breaths/min)', 'respirations'],
      'blood glucose (mg/dl)': ['blood glucose (mg/dl)', 'blood glucose'],
      'bowel movement recorded': ['bowel movement recorded', 'bowel movement'],
    };
    const candidates = aliases[wanted] || [wanted];
    return rows.find((row) => candidates.includes(normalize(row.name))) || null;
  }

  function entryFor(rowId, recordedAt) {
    const targetMinute = isoMinute(recordedAt);
    return (Array.isArray(runtime.data?.entries) ? runtime.data.entries : []).find(
      (entry) => String(entry.rowId) === String(rowId) && isoMinute(entry.recordedAt) === targetMinute,
    ) || null;
  }

  function deriveColumns() {
    const entries = Array.isArray(runtime.data?.entries) ? runtime.data.entries : [];
    const serverColumns = [...new Set(entries.map((entry) => isoMinute(entry.recordedAt)).filter(Boolean))];
    const storedColumns = readStoredColumns();
    const values = [...new Set([...serverColumns, ...storedColumns])].sort();
    if (values.length) return values.slice(-12);
    const now = new Date();
    const columns = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      d.setMinutes(0, 0, 0);
      columns.push(isoMinute(d));
    }
    return columns;
  }

  function displayHomeName() {
    const patient = runtime.data?.patient || {};
    return patient.homeName || patient.locationName || $('#displayBed')?.textContent?.trim() || 'Client Residence';
  }

  function installStyle() {
    if ($('#spireDspFlowGridStyle')) return;
    const style = document.createElement('style');
    style.id = 'spireDspFlowGridStyle';
    style.textContent = `
      #flowsheets-view[data-spire-dsp-grid="true"]{height:100%;overflow:hidden!important;background:var(--workspace-card-bg,#fff)}
      #flowsheets-view[data-spire-dsp-grid="true"] .flowsheet-main-layout{height:calc(100% - 78px)}
      #flowsheets-view .chartable-cell[contenteditable="true"]{min-width:80px;outline:none;cursor:text;background:#fff}
      #flowsheets-view .chartable-cell[contenteditable="true"]:focus{outline:2px solid #2563eb!important;background:#eff6ff!important}
      #flowsheets-view .chartable-cell.is-draft{background:#fff7d6!important}
      #flowsheets-view .chartable-cell.is-saving{background:#fef3c7!important}
      #flowsheets-view .chartable-cell.is-saved{background:#e8f7ea!important}
      #flowsheets-view .chartable-cell.save-error{background:#fee2e2!important}
      #flowsheets-view .chartable-cell.is-readonly{background:#f8fafc;color:#64748b;cursor:not-allowed}
      #flowsheets-view .flow-config-note{padding:4px 8px;border-left:3px solid #2563eb;background:#eff6ff;color:#1e3a8a;font-weight:700}
      #spireFlowCellPopover{position:fixed;z-index:5000;width:295px;max-height:430px;overflow:auto;background:#fff;border:1px solid #94a3b8;border-radius:6px;box-shadow:0 10px 30px rgba(15,23,42,.28);display:none;color:#0f172a}
      #spireFlowCellPopover .flow-popover-header{background:#0f3c68;color:#fff;padding:7px 9px;font-weight:800;display:flex;justify-content:space-between;gap:8px}
      #spireFlowCellPopover .body{padding:8px}
      #spireFlowCellPopover .value-option-item{padding:6px 8px;margin:3px 0;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;background:#f8fafc;font-weight:600}
      #spireFlowCellPopover .value-option-item:hover{background:#dbeafe;border-color:#60a5fa}
      #spireFlowCellPopover .value-option-item.refused{background:#fff1f2;color:#9f1239;border-color:#fecdd3}
      #spireFlowCellPopover textarea{width:100%;min-height:62px;margin-top:7px;border:1px solid #94a3b8;border-radius:4px;padding:6px;font:inherit}
      #spireFlowCellPopover footer{display:flex;justify-content:flex-end;gap:6px;padding:7px 8px;border-top:1px solid #e2e8f0}
      #flowsheetTreeMenu input[type="text"]{font:inherit}
      .right-controls #sulandraCompanySwitcher{padding:4px 7px!important;border-radius:6px!important;box-shadow:none!important;max-width:250px!important}
      .right-controls #sulandraCompanySwitcher select{max-width:165px!important}
      @media(max-width:1050px){#flowsheets-view[data-spire-dsp-grid="true"] .flowsheet-main-layout{grid-template-columns:190px 1fr}}
    `;
    document.head.appendChild(style);
  }

  function shellMarkup() {
    return `
      <div class="flowsheet-sub-toolbar">
        <span>📁 File</span>
        <button class="toolbar-action-btn" id="addRowBtn" type="button">➕ Add Rows</button>
        <span>👤 LDA Avatar</span>
        <button class="toolbar-action-btn" id="addColBtn" type="button">📊 Add Col (Current Time)</button>
        <button class="toolbar-action-btn" id="insertColBtn" type="button">📋 Insert Col (Custom Date &amp; Time)</button>
        <span>💻 Device Data</span>
        <button class="toolbar-action-btn" id="lastFiledBtn" type="button">⏱️ Last Filed</button>
        <span>📄 Rag Doc</span>
        <span>⚙️ Macro Manager</span>
        <button class="toolbar-action-btn" id="goToDateBtn" type="button">📅 Go to Date</button>
        <span>📌 Responsible</span>
        <button class="toolbar-action-btn" id="refreshBtn" type="button">🔄 Refresh</button>
        <span data-flow-command="history" style="cursor:pointer">📈 Flowsheet History</span>
        <span data-flow-command="graph" style="cursor:pointer">📉 Graph</span>
      </div>
      <div class="flowsheet-filters">
        <div class="filter-dropdown"><span id="activeFlowsheetFilterName">DSP Daily Documentation - Show All Tasks</span><span>▼</span></div>
        <span><b>Click a writable box and type, or choose a task-specific option.</b></span>
        <span id="flowSaveStatus" class="flow-config-note" style="margin-left:auto">Connecting to server…</span>
      </div>
      <div class="flowsheet-main-layout">
        <div class="flowsheet-tree" id="flowsheetTreeMenu">
          <div style="margin-bottom:6px"><input id="flowsheetTaskSearch" type="text" placeholder="Search Task..." style="width:100%;border:1px solid #7f9db9;padding:3px"></div>
          <div class="tree-item selected" data-category="all"><span>Show All Tasks</span></div>
          <hr style="border:0;border-top:1px solid #ccc;margin:4px 0">
          <div class="tree-item" data-category="vitals"><span>Vitals &amp; Blood Glucose</span></div>
          <div class="tree-item" data-category="adls"><span>ADLs &amp; Personal Care Support</span></div>
          <div class="tree-item" data-category="meds"><span>Medication Administration (eMAR)</span></div>
          <div class="tree-item" data-category="meals"><span>Meal &amp; Dysphagia Precautions</span></div>
          <div class="tree-item" data-category="seizure"><span>Seizure &amp; Neurological Check</span></div>
          <div class="tree-item" data-category="behavior"><span>Behavioral &amp; Elopement Support</span></div>
          <div class="tree-item" data-category="bowel"><span>Bowel &amp; Elimination Protocol</span></div>
          <div class="tree-item" data-category="community"><span>Community Outings &amp; Transport</span></div>
          <div class="tree-item" data-category="isp"><span>ISP Goal Skill-Building</span></div>
        </div>
        <div class="flowsheet-grid-container" id="flowsheetGridContainer">
          <table class="flowsheet-table" id="flowsheetTable">
            <thead><tr id="headerTimeRow"></tr><tr id="headerDateRow"></tr></thead>
            <tbody id="flowsheetTbody"></tbody>
          </table>
        </div>
      </div>`;
  }

  function setStatus(message, type = 'info') {
    const node = $('#flowSaveStatus');
    if (!node) return;
    node.textContent = message;
    node.style.borderLeftColor = type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : type === 'warn' ? '#d97706' : '#2563eb';
    node.style.background = type === 'error' ? '#fef2f2' : type === 'success' ? '#f0fdf4' : type === 'warn' ? '#fffbeb' : '#eff6ff';
    node.style.color = type === 'error' ? '#991b1b' : type === 'success' ? '#166534' : type === 'warn' ? '#92400e' : '#1e3a8a';
  }

  function renderHeaders() {
    const timeRow = $('#headerTimeRow');
    const dateRow = $('#headerDateRow');
    if (!timeRow || !dateRow) return;
    const highlightIndex = runtime.columns.length - 1;
    timeRow.innerHTML = `<th style="width:280px;text-align:left">Residential HPC Flowsheet - ${esc(displayHomeName())}</th>` + runtime.columns.map((column, index) => `<th style="width:${index === highlightIndex ? 90 : 80}px" class="${index === highlightIndex ? 'highlight-col' : ''}" data-flow-time="${esc(column)}">${esc(fmtTime(column))}</th>`).join('') + '<th style="width:20px"></th>';
    const first = runtime.columns[0] || new Date();
    dateRow.innerHTML = `<th style="text-align:left;background:#fff"></th><th colspan="${Math.max(runtime.columns.length, 1)}" style="background:#eef4fc">${esc(fmtDate(first))} (Charting Window)</th><th></th>`;
  }

  function cellState(item, serverRow, column) {
    const entry = serverRow ? entryFor(serverRow.id, column) : null;
    const draft = !entry && serverRow ? readDraft(serverRow.id, column) : null;
    const text = entry
      ? String(entry.numericValue != null ? entry.numericValue : (entry.value ?? ''))
      : String(draft?.text ?? '');
    const comment = entry?.comment || draft?.comment || '';
    const canWrite = runtime.data?.viewer?.canWrite === true && Boolean(serverRow) && (!entry || entry.canEdit === true);
    return { entry, draft, text, comment, canWrite, isNumeric: item.isNumeric || String(serverRow?.dataType || '').toUpperCase() === 'NUMBER' };
  }

  function renderFlowsheet(category = 'all') {
    runtime.category = category || 'all';
    const tbody = $('#flowsheetTbody');
    const activeFilterName = $('#activeFlowsheetFilterName');
    if (!tbody) return;
    tbody.innerHTML = '';
    const selectedTree = $(`#flowsheetTreeMenu .tree-item[data-category="${CSS.escape(runtime.category)}"]`);
    $$('#flowsheetTreeMenu .tree-item').forEach((node) => node.classList.toggle('selected', node === selectedTree));
    if (activeFilterName) {
      const label = selectedTree?.querySelector('span')?.textContent || 'Show All Tasks';
      activeFilterName.textContent = `DSP Daily Documentation - ${label}`;
    }

    const categories = runtime.category === 'all' ? Object.keys(flowsheetData) : [runtime.category];
    for (const catKey of categories) {
      const group = flowsheetData[catKey];
      if (!group) continue;
      const headerTr = document.createElement('tr');
      headerTr.className = 'row-header';
      headerTr.dataset.flowCategory = catKey;
      headerTr.innerHTML = `<td>${esc(group[0].header)}</td>` + '<td class="chartable-cell"></td>'.repeat(runtime.columns.length) + '<td></td>';
      tbody.appendChild(headerTr);

      for (let i = 1; i < group.length; i += 1) {
        const item = group[i];
        const serverRow = rowByName(item.row);
        const tr = document.createElement('tr');
        tr.dataset.taskName = item.row;
        tr.dataset.flowCategory = catKey;
        let cellsHtml = `<td class="sub-row-header">${esc(item.row)}</td>`;
        runtime.columns.forEach((column, columnIndex) => {
          const state = cellState(item, serverRow, column);
          const highlight = columnIndex === runtime.columns.length - 1;
          const classes = [
            highlight ? 'highlight-col' : '',
            'chartable-cell',
            state.entry ? 'is-saved' : '',
            state.draft ? 'is-draft' : '',
            state.canWrite ? '' : 'is-readonly',
          ].filter(Boolean).join(' ');
          let title = 'Click or type to document this value. The value is saved to the audited chart.';
          if (!serverRow) title = 'This task row is not configured on the server yet. Refresh after the backend deployment completes.';
          else if (!runtime.data?.viewer?.canWrite) title = 'Your current SPIRE role is read-only.';
          else if (state.entry && state.entry.canEdit !== true) title = 'This filed value belongs to another author and is read-only.';
          cellsHtml += `<td class="${classes}" contenteditable="${state.canWrite ? 'true' : 'false'}" spellcheck="false" data-row="${esc(item.row)}" data-row-id="${esc(serverRow?.id || '')}" data-flow-time="${esc(column)}" data-entry-id="${esc(state.entry?.id || '')}" data-comment="${esc(state.comment)}" data-numeric="${String(state.isNumeric)}" data-data-type="${esc(serverRow?.dataType || (item.isNumeric ? 'NUMBER' : 'TEXT'))}" data-last-saved="${esc(state.entry ? state.text : '')}" title="${esc(title)}">${esc(state.text)}</td>`;
        });
        cellsHtml += '<td></td>';
        tr.innerHTML = cellsHtml;
        tbody.appendChild(tr);
      }
    }
    applyTaskSearch($('#flowsheetTaskSearch')?.value || '');
  }

  function renderShell() {
    const host = $('#flowsheets-view');
    if (!host) return null;
    runtime.rendering = true;
    host.dataset.spireDspGrid = 'true';
    host.style.padding = '0';
    host.innerHTML = shellMarkup();
    runtime.rendering = false;
    wireShellEvents(host);
    renderHeaders();
    renderFlowsheet(runtime.category);
    return host;
  }

  function applyTaskSearch(value) {
    const query = normalize(value);
    $$('#flowsheetTbody tr').forEach((row) => {
      if (row.classList.contains('row-header')) return;
      row.style.display = !query || normalize(row.dataset.taskName).includes(query) ? '' : 'none';
    });
    for (const header of $$('#flowsheetTbody tr.row-header')) {
      const category = header.dataset.flowCategory;
      const hasVisible = $$(`#flowsheetTbody tr[data-flow-category="${CSS.escape(category)}"]`).some((row) => !row.classList.contains('row-header') && row.style.display !== 'none');
      header.style.display = hasVisible ? '' : 'none';
    }
  }

  async function loadWorkspace({ preserveColumns = false } = {}) {
    if (runtime.loading) return;
    runtime.patientId = currentPatientId();
    if (!runtime.patientId) {
      const host = $('#flowsheets-view');
      if (host) host.innerHTML = '<div class="spire-error">Select a client first.</div>';
      return;
    }
    runtime.loading = true;
    try {
      setStatus('Loading live flowsheet…');
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      runtime.data = await api(`/api/spire/patients/${encodeURIComponent(runtime.patientId)}/flowsheet-workspace?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!preserveColumns || !runtime.columns.length) runtime.columns = deriveColumns();
      else runtime.columns = [...new Set([...runtime.columns, ...deriveColumns()])].sort().slice(-12);
      storeColumns();
      renderShell();
      const configured = Object.values(flowsheetData).flat().filter((item) => item.row && rowByName(item.row)).length;
      if (configured === EXPECTED_TASK_ROWS) {
        setStatus('Server-backed • audited • keyboard charting ready', 'success');
      } else {
        setStatus(`Server configuration incomplete • ${configured}/${EXPECTED_TASK_ROWS} task rows ready`, 'error');
      }
    } catch (error) {
      const host = $('#flowsheets-view');
      if (host) {
        host.dataset.spireDspGrid = 'true';
        host.innerHTML = `<div class="spire-error"><b>Unable to load the live flowsheet.</b><br>${esc(error.message)}<div style="margin-top:8px"><button type="button" class="toolbar-action-btn" id="flowRetryExternal">Retry</button></div></div>`;
        $('#flowRetryExternal')?.addEventListener('click', () => loadWorkspace());
      }
    } finally {
      runtime.loading = false;
    }
  }

  function addColumn(value) {
    const iso = isoMinute(value);
    if (!iso) return;
    runtime.columns = [...new Set([...runtime.columns, iso])].sort().slice(-12);
    storeColumns();
    renderHeaders();
    renderFlowsheet(runtime.category);
  }

  function goToDate() {
    const current = runtime.columns[0] ? new Date(runtime.columns[0]) : new Date();
    const answer = prompt('Go to date (YYYY-MM-DD)', `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`);
    if (!answer) return;
    const parsed = new Date(`${answer}T06:00:00`);
    if (Number.isNaN(parsed.getTime())) return alert('Enter a valid date in YYYY-MM-DD format.');
    runtime.columns = ['06:00', '14:00', '14:25', '14:28', '14:33', '14:38'].map((time) => isoMinute(new Date(`${answer}T${time}:00`)));
    storeColumns();
    renderHeaders();
    renderFlowsheet(runtime.category);
  }

  function insertCustomColumn() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const answer = prompt('Insert column date & time (YYYY-MM-DDTHH:MM)', local);
    if (!answer) return;
    const parsed = new Date(answer);
    if (Number.isNaN(parsed.getTime())) return alert('Enter a valid date and time.');
    addColumn(parsed);
  }

  function lastFiled() {
    const entries = Array.isArray(runtime.data?.entries) ? runtime.data.entries : [];
    const latest = entries.slice().sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))[0];
    if (!latest) return setStatus('No filed flowsheet values are in the current charting window.');
    addColumn(latest.recordedAt);
    requestAnimationFrame(() => {
      const cell = $(`[data-entry-id="${CSS.escape(String(latest.id))}"]`);
      cell?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      if (cell) cell.style.outline = '3px solid #7c3aed';
    });
  }

  function saveKey(cell) {
    return `${cell.dataset.rowId || ''}|${isoMinute(cell.dataset.flowTime)}`;
  }

  async function saveCell(cell, { force = false } = {}) {
    if (!(cell instanceof HTMLElement)) return false;
    const rowId = cell.dataset.rowId;
    const recordedAt = cell.dataset.flowTime;
    if (!rowId) {
      setStatus(`${cell.dataset.row || 'This task'} is not configured on the server yet.`, 'error');
      return false;
    }
    if (!recordedAt || runtime.data?.viewer?.canWrite !== true || cell.contentEditable !== 'true') return false;

    const key = saveKey(cell);
    if (runtime.savePromises.has(key)) {
      await runtime.savePromises.get(key);
      if (!force) return true;
    }

    const textValue = cell.textContent.trim();
    const comment = cell.dataset.comment || '';
    const lastSaved = cell.dataset.lastSaved || '';
    if (!force && textValue === lastSaved && !readDraft(rowId, recordedAt)) return true;
    if (!textValue && !comment) {
      clearDraft(rowId, recordedAt);
      cell.classList.remove('is-draft');
      return true;
    }

    const isNumber = String(cell.dataset.dataType || '').toUpperCase() === 'NUMBER';
    let numericValue = null;
    let value = textValue || null;
    if (isNumber) {
      numericValue = textValue === '' ? null : Number(textValue);
      if (numericValue != null && !Number.isFinite(numericValue)) {
        cell.classList.add('save-error');
        setStatus(`${cell.dataset.row}: enter a valid number.`, 'error');
        return false;
      }
      value = null;
    }

    writeDraft(cell);
    cell.classList.remove('save-error', 'is-saved');
    cell.classList.add('is-saving');
    setStatus(`Saving ${cell.dataset.row}…`);

    const promise = (async () => {
      try {
        const existingId = cell.dataset.entryId;
        const body = JSON.stringify({ rowId, recordedAt, value, numericValue, comment: comment || null });
        const saved = existingId
          ? await api(`/api/spire/patients/${encodeURIComponent(runtime.patientId)}/flowsheet-workspace/entries/${encodeURIComponent(existingId)}`, { method: 'PUT', body })
          : await api(`/api/spire/patients/${encodeURIComponent(runtime.patientId)}/flowsheet-workspace/entries`, { method: 'POST', body });

        cell.dataset.entryId = String(saved?.id || existingId || '');
        cell.dataset.lastSaved = textValue;
        cell.classList.remove('is-saving', 'is-draft', 'save-error');
        cell.classList.add('is-saved');
        clearDraft(rowId, recordedAt);

        if (saved) {
          const entries = Array.isArray(runtime.data.entries) ? runtime.data.entries : (runtime.data.entries = []);
          const index = entries.findIndex((entry) => String(entry.id) === String(saved.id));
          if (index >= 0) entries[index] = { ...entries[index], ...saved };
          else entries.push(saved);
        }
        storeColumns();
        setStatus(`${cell.dataset.row} filed to the audited chart.`, 'success');
        return true;
      } catch (error) {
        cell.classList.remove('is-saving');
        cell.classList.add('save-error', 'is-draft');
        writeDraft(cell);
        setStatus(`${cell.dataset.row}: ${error.message}. Draft retained in this browser.`, 'error');
        return false;
      } finally {
        runtime.savePromises.delete(key);
      }
    })();

    runtime.savePromises.set(key, promise);
    return promise;
  }

  function scheduleSave(cell) {
    if (!(cell instanceof HTMLElement) || cell.contentEditable !== 'true') return;
    writeDraft(cell);
    cell.classList.add('is-draft');
    cell.classList.remove('is-saved', 'save-error');
    setStatus(`${cell.dataset.row}: unsaved typing…`, 'warn');
    const key = saveKey(cell);
    clearTimeout(runtime.saveTimers.get(key));
    runtime.saveTimers.set(key, setTimeout(() => {
      runtime.saveTimers.delete(key);
      saveCell(cell, { force: true });
    }, 1200));
  }

  function ensurePopover() {
    let popover = $('#spireFlowCellPopover');
    if (popover) return popover;
    popover = document.createElement('section');
    popover.id = 'spireFlowCellPopover';
    // Deliberately not a semantic <header>: the global company switcher must
    // never treat a transient cell editor as the application header.
    popover.innerHTML = '<div class="flow-popover-header"><span id="spireFlowPopoverTitle">Selected Cell</span><button type="button" id="spireFlowPopoverClose" style="border:0;background:transparent;color:#fff;cursor:pointer">✖</button></div><div class="body"><div id="spireFlowPopoverOptions"></div><label style="display:block;margin-top:7px;font-weight:700">Comment<textarea id="spireFlowPopoverComment" placeholder="Optional chart comment"></textarea></label></div><footer><button type="button" class="toolbar-action-btn" id="spireFlowPopoverSave">Save</button></footer>';
    document.body.appendChild(popover);
    $('#spireFlowPopoverClose', popover).addEventListener('click', () => { popover.style.display = 'none'; });
    $('#spireFlowPopoverSave', popover).addEventListener('click', async () => {
      if (!runtime.activeCell) return;
      runtime.activeCell.dataset.comment = $('#spireFlowPopoverComment', popover)?.value || '';
      writeDraft(runtime.activeCell);
      await saveCell(runtime.activeCell, { force: true });
      popover.style.display = 'none';
    });
    return popover;
  }

  function optionNode(option, cell, closeAfter = false) {
    const div = document.createElement('div');
    div.className = option.toLowerCase().includes('refused') ? 'value-option-item refused' : 'value-option-item';
    div.textContent = option;
    div.addEventListener('click', async () => {
      if (!cell.dataset.rowId || cell.contentEditable !== 'true') {
        setStatus(`${cell.dataset.row || 'This task'} cannot be filed until its server row is ready.`, 'error');
        return;
      }
      cell.textContent = option;
      writeDraft(cell);
      cell.classList.add('is-draft');
      await saveCell(cell, { force: true });
      if (closeAfter) ensurePopover().style.display = 'none';
    });
    return div;
  }

  function populateValueSelector(rowName, isNumeric, cell) {
    const options = getOptionsForRow(rowName);
    const selectorHeaderTitle = $('#selectorHeaderTitle');
    const valueOptionsContainer = $('#valueOptionsContainer');
    if (selectorHeaderTitle) selectorHeaderTitle.textContent = rowName;
    if (valueOptionsContainer) {
      valueOptionsContainer.innerHTML = '';
      if (!cell.dataset.rowId) {
        valueOptionsContainer.innerHTML = '<div style="color:#991b1b;background:#fef2f2;border:1px solid #fecaca;padding:10px;border-radius:4px;font-weight:700">This row is waiting for server configuration. Refresh after deployment.</div>';
      } else if (cell.contentEditable !== 'true') {
        valueOptionsContainer.innerHTML = '<div style="color:#475569;background:#f8fafc;border:1px solid #cbd5e1;padding:10px;border-radius:4px;font-weight:700">This cell is read-only for the current user or filed author.</div>';
      } else if (isNumeric) {
        valueOptionsContainer.innerHTML = '<div style="color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;padding:10px;border-radius:4px;text-align:center;font-weight:600;font-size:11.5px">⌨️ Click the grid cell and type the value. It autosaves after you pause, on Enter, or when you leave the cell.</div>';
      } else {
        options.forEach((option) => valueOptionsContainer.appendChild(optionNode(option, cell)));
      }
    }

    const popover = ensurePopover();
    $('#spireFlowPopoverTitle', popover).textContent = rowName;
    const optionHost = $('#spireFlowPopoverOptions', popover);
    optionHost.innerHTML = '';
    if (!cell.dataset.rowId) {
      optionHost.innerHTML = '<div style="color:#991b1b;background:#fef2f2;border:1px solid #fecaca;padding:8px;border-radius:4px;font-weight:700">Server row not ready. This cell cannot be saved yet.</div>';
    } else if (cell.contentEditable !== 'true') {
      optionHost.innerHTML = '<div style="color:#475569;background:#f8fafc;border:1px solid #cbd5e1;padding:8px;border-radius:4px;font-weight:700">Read-only cell.</div>';
    } else if (isNumeric) {
      optionHost.innerHTML = '<div style="color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;padding:8px;border-radius:4px;text-align:center;font-weight:600">⌨️ Type directly in the selected grid cell. It autosaves.</div>';
    } else {
      options.forEach((option) => optionHost.appendChild(optionNode(option, cell, true)));
    }
    $('#spireFlowPopoverComment', popover).value = cell.dataset.comment || '';
    const rect = cell.getBoundingClientRect();
    popover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 310))}px`;
    popover.style.top = `${Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - 420))}px`;
    popover.style.display = 'block';
  }

  function selectCell(cell) {
    $$('#flowsheetTable .chartable-cell').forEach((candidate) => { candidate.style.outline = ''; });
    runtime.activeCell = cell;
    cell.style.outline = '2px solid #2563eb';
    populateValueSelector(cell.dataset.row || 'Selected Cell', cell.dataset.numeric === 'true', cell);
    if (cell.contentEditable === 'true') {
      requestAnimationFrame(() => {
        cell.focus({ preventScroll: true });
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(cell);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
    }
  }

  function wireShellEvents(host) {
    $('#flowsheetTreeMenu', host)?.addEventListener('click', (event) => {
      const treeItem = event.target.closest('.tree-item');
      if (!treeItem) return;
      renderFlowsheet(treeItem.getAttribute('data-category') || 'all');
    });
    $('#flowsheetTaskSearch', host)?.addEventListener('input', (event) => applyTaskSearch(event.target.value));
    $('#flowsheetTable', host)?.addEventListener('click', (event) => {
      const cell = event.target.closest('.chartable-cell[data-row]');
      if (cell) selectCell(cell);
    });
    $('#flowsheetTable', host)?.addEventListener('input', (event) => {
      const cell = event.target.closest('.chartable-cell[data-row]');
      if (cell) scheduleSave(cell);
    });
    $('#flowsheetTable', host)?.addEventListener('keydown', (event) => {
      const cell = event.target.closest('.chartable-cell[data-row]');
      if (!cell) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(runtime.saveTimers.get(saveKey(cell)));
        runtime.saveTimers.delete(saveKey(cell));
        saveCell(cell, { force: true }).then(() => cell.blur());
      } else if (event.key === 'Escape') {
        event.preventDefault();
        const entry = entryFor(cell.dataset.rowId, cell.dataset.flowTime);
        const draft = readDraft(cell.dataset.rowId, cell.dataset.flowTime);
        cell.textContent = entry ? String(entry.numericValue != null ? entry.numericValue : (entry.value ?? '')) : String(draft?.text ?? '');
        cell.blur();
      }
    });
    $('#flowsheetTable', host)?.addEventListener('focusout', (event) => {
      const cell = event.target.closest('.chartable-cell[data-row]');
      if (!cell || cell.contentEditable !== 'true') return;
      clearTimeout(runtime.saveTimers.get(saveKey(cell)));
      runtime.saveTimers.delete(saveKey(cell));
      saveCell(cell, { force: true });
    });
    $('#addRowBtn', host)?.addEventListener('click', async () => {
      setStatus('Synchronizing server task-row configuration…');
      await loadWorkspace({ preserveColumns: true });
    });
    $('#addColBtn', host)?.addEventListener('click', () => addColumn(new Date()));
    $('#insertColBtn', host)?.addEventListener('click', insertCustomColumn);
    $('#lastFiledBtn', host)?.addEventListener('click', lastFiled);
    $('#goToDateBtn', host)?.addEventListener('click', goToDate);
    $('#refreshBtn', host)?.addEventListener('click', () => loadWorkspace({ preserveColumns: true }));
    $('[data-flow-command="history"]', host)?.addEventListener('click', lastFiled);
    $('[data-flow-command="graph"]', host)?.addEventListener('click', () => setStatus('Use Results Review for longitudinal numeric trending.'));
  }

  function showFlowsheetView() {
    $$('.chart-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === 'flowsheets-view'));
    $$('.workspace-view').forEach((view) => view.classList.toggle('active', view.id === 'flowsheets-view'));
  }

  function interceptNavigation(event) {
    const target = event.target instanceof Element ? event.target : null;
    const flowsheetTab = target?.closest('.chart-tab[data-view="flowsheets-view"]');
    const quickAction = target?.closest('[data-right-action="flows"]');
    if (!flowsheetTab && !quickAction) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showFlowsheetView();
    loadWorkspace({ preserveColumns: runtime.patientId === currentPatientId() && runtime.columns.length > 0 });
  }

  function observeHost() {
    const host = $('#flowsheets-view');
    if (!host || runtime.observer) return;
    runtime.observer = new MutationObserver(() => {
      if (runtime.rendering || runtime.loading || !host.classList.contains('active')) return;
      if (!$('#flowsheetTbody', host)) queueMicrotask(() => loadWorkspace({ preserveColumns: true }));
    });
    runtime.observer.observe(host, { childList: true, subtree: true });
  }

  function placeCompanySwitcher() {
    const switcher = document.getElementById('sulandraCompanySwitcher');
    const host = document.querySelector('.right-controls');
    if (!switcher || !host || switcher.parentElement === host) return;
    host.prepend(switcher);
  }

  function observeCompanySwitcher() {
    placeCompanySwitcher();
    if (runtime.companyObserver || !document.body) return;
    runtime.companyObserver = new MutationObserver(() => placeCompanySwitcher());
    runtime.companyObserver.observe(document.body, { childList: true, subtree: true });
  }

  function install() {
    installStyle();
    ensurePopover();
    observeCompanySwitcher();
    document.addEventListener('click', interceptNavigation, true);
    observeHost();
    if ($('#flowsheets-view')?.classList.contains('active')) loadWorkspace();
    window.addEventListener('sulandra:entity-context-ready', placeCompanySwitcher);
    window.addEventListener('sulandra:entity-context-changed', () => {
      runtime.data = null;
      runtime.columns = [];
      runtime.patientId = currentPatientId();
      if ($('#flowsheets-view')?.classList.contains('active')) loadWorkspace();
    });
    window.SpireMasterFlowsheetGrid = Object.freeze({
      version: VERSION,
      refresh: () => loadWorkspace({ preserveColumns: true }),
      render: renderFlowsheet,
      getOptionsForRow,
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
