(() => {
  'use strict';

  // SPIRE_MASTER_FLOWSHEET_AUTHORITY_V1
  // SPIRE_FLOWSHEET_FILE_WORKFLOW_V1
  // SPIRE_FLOWSHEET_TRANSACTIONAL_FILE_V2
  // SPIRE_USER_MASTER_FLOWSHEET_LAYOUT_V1
  // SPIRE_FLOWSHEET_INLINE_ENTRY_V3
  // Preserve the user's authoritative master flowsheet DOM/layout. This runtime
  // supplies live data and behavior only. Cells remain directly editable; any
  // configured or task-derived choices are optional suggestions, never a gate.

  const VERSION = '20260813-inline-suggestions-1';
  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const MIN_VISIBLE_COLUMNS = 6;
  const MAX_VISIBLE_COLUMNS = 10;

  const CATEGORY_DEFS = Object.freeze({
    all: { label: 'Show All Tasks', test: () => true },
    vitals: { label: 'Vitals & Blood Glucose', test: (row) => /vital|glucose|clinical monitoring|pain|respiratory|skin|wound|mobility|position/i.test(`${row.groupName || ''} ${row.name || ''}`) },
    adls: { label: 'ADLs & Personal Care Support', test: (row) => /adl|personal care|daily living|bath|dress|groom|toilet/i.test(`${row.groupName || ''} ${row.name || ''}`) },
    meds: { label: 'Medication Administration (eMAR)', test: (row) => /medication|emar|medicine|treatment|prn|swallow/i.test(`${row.groupName || ''} ${row.name || ''}`) },
    meals: { label: 'Meal & Dysphagia Precautions', test: (row) => /meal|dysphagia|diet|liquid|bite|pacing|upright|nutrition/i.test(`${row.groupName || ''} ${row.name || ''}`) },
    seizure: { label: 'Seizure & Neurological Check', test: (row) => /seizure|neuro|postictal|midazolam/i.test(`${row.groupName || ''} ${row.name || ''}`) },
    behavior: { label: 'Behavioral & Elopement Support', test: (row) => /behavior|elopement|mood|trigger|de-escalation|safety|sleep|wake/i.test(`${row.groupName || ''} ${row.name || ''}`) },
    bowel: { label: 'Bowel & Elimination Protocol', test: (row) => /bowel|elimination|toilet|fluid intake|intake \/ output/i.test(`${row.groupName || ''} ${row.name || ''}`) },
    community: { label: 'Community Outings & Transport', test: (row) => /community|outing|transport|vehicle|seat belt/i.test(`${row.groupName || ''} ${row.name || ''}`) },
    isp: { label: 'ISP Goal Skill-Building', test: (row) => /isp|goal|skill|money management|independent task|outcome|progress/i.test(`${row.groupName || ''} ${row.name || ''}`) },
  });

  const runtime = {
    patientId: '',
    homeId: '',
    data: null,
    actor: null,
    columns: [],
    category: 'all',
    search: '',
    drafts: new Map(),
    selectedCell: null,
    loading: false,
    filing: false,
    wired: false,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const token = () => TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';

  function isoMinute(value) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    date.setSeconds(0, 0);
    return date.toISOString();
  }

  function fmtTime(value) {
    return new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '');
  }

  function fmtDate(value) {
    return new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
  }

  function currentPatientId() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return clean(query.get('patientId') || hash.get('patient'));
  }

  function currentHomeId() {
    const query = new URLSearchParams(location.search);
    return clean(query.get('spireHome') || query.get('home') || sessionStorage.getItem(HOME_ID_KEY));
  }

  function draftStoreKey() {
    return runtime.patientId ? `spire:flowsheet:staged:v2:${runtime.homeId || 'home'}:${runtime.patientId}` : '';
  }

  function columnStoreKey() {
    return runtime.patientId ? `spire:flowsheet:columns:user-master:${runtime.homeId || 'home'}:${runtime.patientId}` : '';
  }

  function cellKey(rowId, recordedAt) {
    return `${String(rowId || '')}|${isoMinute(recordedAt)}`;
  }

  function loadDraftStore() {
    runtime.drafts.clear();
    const key = draftStoreKey();
    if (!key) return;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(key) || '{}');
      if (!parsed || typeof parsed !== 'object') return;
      for (const [keyName, value] of Object.entries(parsed)) {
        if (value && typeof value === 'object') runtime.drafts.set(keyName, value);
      }
    } catch {
      sessionStorage.removeItem(key);
    }
  }

  function saveDraftStore() {
    const key = draftStoreKey();
    if (!key) return;
    if (!runtime.drafts.size) return sessionStorage.removeItem(key);
    sessionStorage.setItem(key, JSON.stringify(Object.fromEntries(runtime.drafts)));
  }

  function readStoredColumns() {
    const key = columnStoreKey();
    if (!key) return [];
    try {
      const values = JSON.parse(sessionStorage.getItem(key) || '[]');
      return Array.isArray(values) ? values.map(isoMinute).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function saveColumns() {
    const key = columnStoreKey();
    if (key) sessionStorage.setItem(key, JSON.stringify(runtime.columns));
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (options.body != null && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token() && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token()}`);
    if (runtime.homeId && path.startsWith('/api/spire/')) headers.set('x-spire-home-id', runtime.homeId);
    const response = await fetch(/^https?:\/\//i.test(path) ? path : API_BASE + path, { ...options, headers, cache: 'no-store' });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || payload.message || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload.data ?? payload;
  }

  async function loadActor() {
    if (runtime.actor) return runtime.actor;
    for (const endpoint of ['/api/auth/me', '/api/session', '/api/auth/session']) {
      try {
        const value = await api(endpoint);
        const actor = value?.user || value?.session || value;
        if (actor && (actor.id || actor.userId || actor.email)) {
          runtime.actor = actor;
          return actor;
        }
      } catch {}
    }
    return null;
  }

  function actorName() {
    const actor = runtime.actor || {};
    return actor.displayName || actor.name || actor.fullName || actor.email || 'Current user';
  }

  function rowOptions(row) {
    const raw = row?.options;
    if (Array.isArray(raw)) {
      return raw.map((item) => typeof item === 'object' && item ? clean(item.label || item.value) : clean(item)).filter(Boolean);
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((item) => typeof item === 'object' && item ? clean(item.label || item.value) : clean(item)).filter(Boolean) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function isNumericRow(row) {
    return String(row?.dataType || row?.valueType || '').toUpperCase() === 'NUMBER';
  }

  function suggestionsForRow(row) {
    const configured = rowOptions(row);
    if (configured.length) return configured;
    if (isNumericRow(row)) return [];

    const context = `${row?.name || ''} ${row?.groupName || ''} ${row?.description || ''}`.toLowerCase();
    if (/community participation/.test(context)) return ['Completed', 'Partially Completed', 'Declined', 'Not Completed', 'Not Applicable'];
    if (/community outing|outing \/ activity|activity status/.test(context)) return ['Completed', 'Partially Completed', 'Declined', 'Canceled', 'Not Applicable'];
    if (/vehicle.*seat belt|seat belt.*secured/.test(context)) return ['Secured', 'Prompted / Then Secured', 'Refused', 'Not Applicable'];
    if (/bath|dress|groom|toilet|personal care|adl/.test(context)) return ['Independent', 'Prompting', 'Partial Assist', 'Total Assist', 'Refused'];
    if (/swallow|dysphagia|meal|diet|bite|pacing|upright/.test(context)) return ['Independent', 'Prompting', 'Supervised', 'Partial Assist', 'Refused', 'Not Applicable'];
    if (/bowel movement/.test(context)) return ['Yes', 'No', 'Not Applicable'];
    if (/sleep|wake/.test(context)) return ['Sleeping', 'Awake', 'Out of Bed', 'Not Observed'];
    if (/seizure|neurolog/.test(context)) return ['No Seizure Activity Observed', 'Seizure Activity Observed', 'Post-Ictal Monitoring', 'Rescue Protocol Initiated'];
    if (/behavior|elopement|mood|trigger|de-escalation/.test(context)) return ['Baseline / No Concern', 'Prompting / Redirection', 'Intervention Provided', 'Follow-Up Required', 'Not Applicable'];
    if (/isp|goal|skill|outcome|progress/.test(context)) return ['Independent', 'Verbal Prompting', 'Partial Assistance', 'Full Assistance', 'Declined'];
    if (/medication|emar|treatment|prn/.test(context)) return ['Completed', 'Refused', 'Held', 'Not Due', 'Not Applicable'];
    if (/completed|completion|status|participation|activity|task|support/.test(context)) return ['Completed', 'Partially Completed', 'Declined', 'Not Completed', 'Not Applicable'];
    return [];
  }

  function entryFor(rowId, recordedAt) {
    const minute = isoMinute(recordedAt);
    const matches = (Array.isArray(runtime.data?.entries) ? runtime.data.entries : []).filter(
      (entry) => String(entry.rowId) === String(rowId) && isoMinute(entry.recordedAt) === minute,
    );
    return matches[matches.length - 1] || null;
  }

  function isAmended(entry) {
    if (!entry) return false;
    if (entry.amended === true) return true;
    if (!entry.createdAt || !entry.updatedAt) return false;
    const created = new Date(entry.createdAt).getTime();
    const updated = new Date(entry.updatedAt).getTime();
    return Number.isFinite(created) && Number.isFinite(updated) && updated > created;
  }

  function entryValue(entry, row) {
    if (!entry) return '';
    return isNumericRow(row) ? String(entry.numericValue ?? '') : String(entry.value ?? '');
  }

  function displayedValue(row, recordedAt) {
    const draft = runtime.drafts.get(cellKey(row.id, recordedAt));
    if (draft) return String(draft.value ?? '');
    return entryValue(entryFor(row.id, recordedAt), row);
  }

  function displayedComment(row, recordedAt) {
    const draft = runtime.drafts.get(cellKey(row.id, recordedAt));
    if (draft) return String(draft.comment || '');
    return String(entryFor(row.id, recordedAt)?.comment || '');
  }

  function rowMatchesCategory(row) {
    const definition = CATEGORY_DEFS[runtime.category] || CATEGORY_DEFS.all;
    return definition.test(row);
  }

  function visibleRows() {
    const term = runtime.search.toLowerCase();
    return (Array.isArray(runtime.data?.rows) ? runtime.data.rows : []).filter((row) => {
      if (!rowMatchesCategory(row)) return false;
      if (!term) return true;
      return [row.name, row.groupName, row.description, row.unit].some((value) => clean(value).toLowerCase().includes(term));
    });
  }

  function ensureColumns() {
    const source = [
      ...readStoredColumns(),
      ...(Array.isArray(runtime.data?.entries) ? runtime.data.entries.map((entry) => isoMinute(entry.recordedAt)) : []),
      ...[...runtime.drafts.values()].map((draft) => isoMinute(draft.recordedAt)),
    ].filter(Boolean);
    const values = [...new Set(source)].sort();
    const now = new Date();
    now.setMinutes(0, 0, 0);
    let step = 0;
    while (values.length < MIN_VISIBLE_COLUMNS) {
      const candidate = isoMinute(new Date(now.getTime() - step * 60 * 60 * 1000));
      if (!values.includes(candidate)) values.push(candidate);
      step += 1;
    }
    runtime.columns = [...new Set(values)].sort().slice(-MAX_VISIBLE_COLUMNS);
    saveColumns();
  }

  function installCompatibilityStyle() {
    let style = $('#spireUserMasterFlowsheetStyle');
    if (style) return;
    style = document.createElement('style');
    style.id = 'spireUserMasterFlowsheetStyle';
    style.textContent = `
      /* SPIRE_USER_MASTER_FLOWSHEET_LAYOUT_V1 + SPIRE_FLOWSHEET_INLINE_ENTRY_V3 */
      #flowsheets-view[data-user-master-flowsheet="true"]{overflow:hidden!important}
      #flowsheets-view .flowsheet-main-layout{height:calc(100% - 76px)!important;min-height:0!important}
      #flowsheets-view .flowsheet-grid-container{min-width:0!important}
      #flowsheets-view .flowsheet-table{width:max-content!important;min-width:100%!important;table-layout:auto!important}
      #flowsheets-view .flowsheet-table th:not(:first-child),#flowsheets-view .flowsheet-table td:not(:first-child){width:80px!important;min-width:80px!important;max-width:110px!important}
      #flowsheets-view .flowsheet-table th:first-child,#flowsheets-view .flowsheet-table td:first-child{width:280px!important;min-width:280px!important;max-width:280px!important}
      #flowsheets-view .chartable-cell{vertical-align:middle!important;text-align:center!important;white-space:normal!important;overflow:visible!important;padding:0!important;position:relative!important}
      #flowsheets-view .chartable-cell.is-draft{background:#fff7cc!important;box-shadow:inset 0 0 0 2px #d9a521!important}
      #flowsheets-view .chartable-cell.is-draft-amendment{background:#fff0f0!important;color:#a01421!important;box-shadow:inset 0 0 0 2px #c62032!important}
      #flowsheets-view .chartable-cell.filed-amendment{background:#fff4f4!important;color:#b01828!important;font-weight:700!important}
      #flowsheets-view .chartable-cell.locked{background:#f8fafc!important;color:#64748b!important;cursor:not-allowed!important;padding:4px 5px!important}
      #flowsheets-view .flow-section-row td{background:#e6eef8!important;color:#003366!important;font-weight:800!important;height:24px!important;padding:3px 8px!important}
      #flowsheets-view .flow-cell-editor{display:block;width:100%;height:100%;min-height:28px;border:0!important;outline:0;background:transparent;color:inherit;text-align:center;padding:4px 5px;font:11.5px/1.15 "Segoe UI",Arial,sans-serif}
      #flowsheets-view .flow-cell-editor:focus{background:#eef6ff!important;box-shadow:inset 0 0 0 2px #2563eb!important}
      #flowsheets-view .flow-cell-editor[type="number"]{-moz-appearance:textfield}
      #flowsheets-view .flow-cell-editor[type="number"]::-webkit-outer-spin-button,#flowsheets-view .flow-cell-editor[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
      #flowsheets-view .flow-readonly-value{font-size:11.5px;line-height:1.15;padding:4px 5px}
      #flowsheets-view .flow-comment-mark{position:absolute;right:2px;top:1px;font-size:8px;pointer-events:none}
      #flowsheets-view .flow-amend-mark{position:absolute;left:2px;top:1px;font-size:8px;color:#b01828;font-weight:900;pointer-events:none}
      #flowsheets-view #flowFileBtn{margin-left:0}
      #flowsheets-view #flowFileBtn.has-drafts{background:#dff2e5;border-color:#2d7a4f;color:#14532d}
      #flowsheets-view #flowFileBtn:disabled{opacity:.55;cursor:not-allowed}
      #flowsheets-view .flow-inline-status{margin-left:auto;font-size:10.5px;color:#4b6475;font-weight:700;white-space:nowrap}
      #flowsheets-view .flow-inline-status.error{color:#a11220}.flow-inline-status.success{color:#166534}.flow-inline-status.warn{color:#8a5a0a}
      #spireFlowCellPopover{position:fixed;z-index:7000;width:270px;max-height:360px;overflow:auto;background:#fff;border:1px solid #7f9db9;border-radius:4px;box-shadow:0 8px 26px rgba(15,23,42,.28);display:none;color:#172b3b;font:12px "Segoe UI",Arial,sans-serif}
      #spireFlowCellPopover .pop-head{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#004080;color:#fff;padding:6px 8px;font-weight:700}
      #spireFlowCellPopover .pop-head button{border:0;background:transparent;color:#fff;cursor:pointer;font-weight:800}
      #spireFlowCellPopover .pop-body{padding:7px 8px}.pop-options{margin-bottom:6px}.pop-option{display:block;width:100%;text-align:left;border:1px solid #b6c8d8;background:#f7fbff;color:#163d60;border-radius:3px;padding:5px 7px;margin:3px 0;cursor:pointer;font-weight:600}.pop-option:hover{background:#dbeafe;border-color:#7aa8c7}.pop-option.refused{color:#991b1b;background:#fff1f2}
      #spireFlowCellPopover label{display:block;font-size:10.5px;font-weight:700;color:#334155;margin-top:6px}#spireFlowCellPopover textarea{width:100%;border:1px solid #7f9db9;border-radius:3px;padding:5px;font:inherit;margin-top:3px;min-height:56px;resize:vertical}
      #spireFlowCellPopover .pop-note{font-size:10px;color:#607789;line-height:1.35;margin:5px 0}.pop-footer{display:flex;justify-content:flex-end;gap:6px;border-top:1px solid #dce5ec;padding:6px 8px;background:#f7fafc}.pop-footer button{border:1px solid #7f9db9;background:#e4edf7;border-radius:3px;padding:4px 8px;cursor:pointer;font-weight:600}.pop-footer .primary{background:#004080;color:#fff}
    `;
    document.head.appendChild(style);
  }

  function ensurePopover() {
    let popover = $('#spireFlowCellPopover');
    if (popover) return popover;
    popover = document.createElement('section');
    popover.id = 'spireFlowCellPopover';
    popover.innerHTML = `
      <div class="pop-head"><span id="flowPopTitle">Suggestions</span><button type="button" id="flowPopClose">✖</button></div>
      <div class="pop-body">
        <div class="pop-note" id="flowPopNote">Suggestions only. You can always type directly in the box.</div>
        <div class="pop-options" id="flowPopOptions"></div>
        <label>Comment<textarea id="flowPopComment" placeholder="Optional comment for this box"></textarea></label>
      </div>
      <div class="pop-footer"><button type="button" id="flowPopCancel">Close</button><button type="button" class="primary" id="flowPopSaveComment">Save Comment to Box</button></div>`;
    document.body.appendChild(popover);
    $('#flowPopClose', popover).addEventListener('click', closePopover);
    $('#flowPopCancel', popover).addEventListener('click', closePopover);
    $('#flowPopSaveComment', popover).addEventListener('click', savePopoverToBox);
    document.addEventListener('pointerdown', (event) => {
      if (popover.style.display !== 'block') return;
      const target = event.target instanceof Node ? event.target : null;
      if (target && (popover.contains(target) || runtime.selectedCell?.contains(target))) return;
      closePopover();
    }, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && popover.style.display === 'block') closePopover();
    });
    window.addEventListener('resize', closePopover);
    return popover;
  }

  function closePopover() {
    const popover = $('#spireFlowCellPopover');
    if (popover) popover.style.display = 'none';
    runtime.selectedCell = null;
  }

  function selectedRow() {
    const cell = runtime.selectedCell;
    if (!cell) return null;
    return (Array.isArray(runtime.data?.rows) ? runtime.data.rows : []).find((row) => String(row.id) === String(cell.dataset.rowId)) || null;
  }

  function stageDraft(row, recordedAt, value, comment, existing = entryFor(row.id, recordedAt)) {
    if (runtime.data?.viewer?.canWrite !== true) {
      setStatus('Your SPIRE role is read-only.', 'error');
      return false;
    }
    if (existing && existing.canEdit === false) {
      setStatus('This filed value belongs to another user and is locked.', 'error');
      return false;
    }
    const cleanedValue = clean(value);
    const cleanedComment = clean(comment);
    const originalValue = clean(entryValue(existing, row));
    const originalComment = clean(existing?.comment);
    const key = cellKey(row.id, recordedAt);
    if ((existing && cleanedValue === originalValue && cleanedComment === originalComment) || (!existing && !cleanedValue && !cleanedComment)) {
      runtime.drafts.delete(key);
      saveDraftStore();
      updateFileButton();
      return false;
    }
    runtime.drafts.set(key, {
      rowId: String(row.id),
      rowName: String(row.name || ''),
      dataType: String(row.dataType || row.valueType || 'TEXT'),
      recordedAt: isoMinute(recordedAt),
      value: cleanedValue,
      comment: cleanedComment,
      entryId: existing?.id ? String(existing.id) : '',
      amendment: Boolean(existing),
      stagedAt: new Date().toISOString(),
    });
    saveDraftStore();
    updateFileButton();
    return true;
  }

  function validateDraft(draft, row) {
    const type = String(row?.dataType || row?.valueType || draft.dataType || 'TEXT').toUpperCase();
    const value = clean(draft.value);
    if (type === 'NUMBER' && value && !Number.isFinite(Number(value))) throw new Error(`${row.name}: enter a valid number.`);
    if (String(row?.name || '') === 'BP (mmHg)' && value) {
      const match = value.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
      if (!match || Number(match[1]) <= Number(match[2])) throw new Error('BP (mmHg): use a valid systolic/diastolic value, for example 120/80.');
    }
    if (!value && !clean(draft.comment)) throw new Error(`${row?.name || 'Flowsheet row'} has no value or comment.`);
  }

  function positionPopoverBesideCell(cell, popover) {
    const gap = 8;
    const margin = 8;
    const rect = cell.getBoundingClientRect();
    popover.style.visibility = 'hidden';
    popover.style.display = 'block';
    const width = Math.min(popover.offsetWidth || 270, innerWidth - margin * 2);
    const height = Math.min(popover.offsetHeight || 300, innerHeight - margin * 2);

    let left;
    let top = Math.max(margin, Math.min(rect.top, innerHeight - height - margin));
    if (rect.right + gap + width <= innerWidth - margin) {
      left = rect.right + gap;
    } else if (rect.left - gap - width >= margin) {
      left = rect.left - gap - width;
    } else {
      left = Math.max(margin, Math.min(rect.left, innerWidth - width - margin));
      if (rect.bottom + gap + height <= innerHeight - margin) top = rect.bottom + gap;
      else top = Math.max(margin, rect.top - gap - height);
    }
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.visibility = 'visible';
  }

  function openSuggestionsForCell(cell) {
    const row = (Array.isArray(runtime.data?.rows) ? runtime.data.rows : []).find((item) => String(item.id) === String(cell.dataset.rowId));
    if (!row) return closePopover();
    const recordedAt = cell.dataset.flowTime;
    const existing = entryFor(row.id, recordedAt);
    const readonly = runtime.data?.viewer?.canWrite !== true || (existing && existing.canEdit === false);

    // Numeric cells are always typed directly in the grid. Never cover them with a selector.
    if (isNumericRow(row) || readonly) return closePopover();

    const suggestions = suggestionsForRow(row);
    if (!suggestions.length) return closePopover();

    closePopover();
    runtime.selectedCell = cell;
    const popover = ensurePopover();
    $('#flowPopTitle', popover).textContent = `${row.name || 'Flowsheet'} · ${fmtTime(recordedAt)}`;
    $('#flowPopComment', popover).value = displayedComment(row, recordedAt);
    $('#flowPopComment', popover).disabled = false;
    $('#flowPopSaveComment', popover).disabled = false;
    $('#flowPopNote', popover).textContent = 'Suggestions only — choose one or keep typing your own value directly in the selected box. Nothing is filed until File is pressed.';

    const optionHost = $('#flowPopOptions', popover);
    optionHost.innerHTML = '';
    for (const suggestion of suggestions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `pop-option${/refused|declined|not completed|held|canceled/i.test(suggestion) ? ' refused' : ''}`;
      button.textContent = suggestion;
      button.addEventListener('click', () => {
        const editor = $('.flow-cell-editor', cell);
        if (editor) editor.value = suggestion;
        stageDraft(row, recordedAt, suggestion, displayedComment(row, recordedAt), existing);
        closePopover();
        renderGrid();
        setStatus(`${row.name}: ${suggestion} placed in the box — not filed yet.`, 'warn');
      });
      optionHost.appendChild(button);
    }
    positionPopoverBesideCell(cell, popover);
  }

  function savePopoverToBox() {
    const cell = runtime.selectedCell;
    const row = selectedRow();
    if (!cell || !row) return closePopover();
    const recordedAt = cell.dataset.flowTime;
    const existing = entryFor(row.id, recordedAt);
    if (existing && existing.canEdit === false) return closePopover();
    const editor = $('.flow-cell-editor', cell);
    const value = editor ? editor.value : displayedValue(row, recordedAt);
    const comment = $('#flowPopComment')?.value;
    stageDraft(row, recordedAt, value, comment, existing);
    closePopover();
    renderGrid();
    setStatus('Comment/value placed in the box — still unfiled.', 'warn');
  }

  function rowCellHtml(row, recordedAt, latestColumn) {
    const entry = entryFor(row.id, recordedAt);
    const draft = runtime.drafts.get(cellKey(row.id, recordedAt));
    const value = draft ? String(draft.value || '') : entryValue(entry, row);
    const comment = draft ? String(draft.comment || '') : String(entry?.comment || '');
    const readonly = runtime.data?.viewer?.canWrite !== true || (entry && entry.canEdit === false);
    const classes = ['chartable-cell'];
    if (isoMinute(recordedAt) === isoMinute(latestColumn)) classes.push('highlight-col');
    if (readonly) classes.push('locked');
    if (draft) classes.push(draft.amendment ? 'is-draft-amendment' : 'is-draft');
    else if (isAmended(entry)) classes.push('filed-amendment');
    if (comment) classes.push('has-comment');
    const author = entry?.recordedByDisplayName || entry?.recordedById || '';
    const status = draft ? (draft.amendment ? 'Unfiled amendment' : 'Unfiled') : entry ? (isAmended(entry) ? 'Filed amendment' : 'Filed') : 'Empty';
    const title = [status, author ? `by ${author}` : '', entry?.createdAt ? `documented ${new Date(entry.createdAt).toLocaleString()}` : '', comment ? `Comment: ${comment}` : ''].filter(Boolean).join(' · ');
    const editor = readonly
      ? `<div class="flow-readonly-value">${esc(value)}</div>`
      : `<input class="flow-cell-editor" data-flow-editor type="${isNumericRow(row) ? 'number' : 'text'}" step="any" autocomplete="off" value="${esc(value)}" aria-label="${esc(row.name || 'Flowsheet value')} at ${esc(fmtTime(recordedAt))}">`;
    return `<td class="${classes.join(' ')}" data-flow-cell data-row-id="${esc(row.id)}" data-flow-time="${esc(recordedAt)}" title="${esc(title)}">${editor}${comment ? '<span class="flow-comment-mark">💬</span>' : ''}${(!draft && isAmended(entry)) || draft?.amendment ? '<span class="flow-amend-mark">▲</span>' : ''}</td>`;
  }

  function wireGridCells(tbody) {
    $$('[data-flow-cell]', tbody).forEach((cell) => {
      const row = (Array.isArray(runtime.data?.rows) ? runtime.data.rows : []).find((item) => String(item.id) === String(cell.dataset.rowId));
      const editor = $('.flow-cell-editor', cell);
      if (!row || !editor) return;
      const recordedAt = cell.dataset.flowTime;
      const existing = entryFor(row.id, recordedAt);

      editor.addEventListener('input', () => {
        const currentComment = displayedComment(row, recordedAt);
        stageDraft(row, recordedAt, editor.value, currentComment, existing);
        cell.classList.toggle('is-draft', !existing && runtime.drafts.has(cellKey(row.id, recordedAt)));
        cell.classList.toggle('is-draft-amendment', Boolean(existing) && runtime.drafts.has(cellKey(row.id, recordedAt)));
        setStatus(`${row.name}: value staged in the box — not filed yet.`, 'warn');
      });
      editor.addEventListener('focus', () => openSuggestionsForCell(cell));
      editor.addEventListener('click', () => {
        if (!isNumericRow(row) && runtime.selectedCell !== cell) openSuggestionsForCell(cell);
      });
      editor.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closePopover();
      });
      cell.addEventListener('click', (event) => {
        if (event.target !== editor) editor.focus({ preventScroll: true });
      });
    });
  }

  function renderHeaders() {
    const timeRow = $('#headerTimeRow');
    const dateRow = $('#headerDateRow');
    if (!timeRow || !dateRow) return;
    timeRow.innerHTML = `<th style="width:280px;text-align:left">Residential HPC Flowsheet</th>${runtime.columns.map((column, index) => `<th style="width:80px" class="${index === runtime.columns.length - 1 ? 'highlight-col' : ''}" data-flow-header-time="${esc(column)}">${esc(fmtTime(column))}</th>`).join('')}<th style="width:20px"></th>`;
    dateRow.innerHTML = `<th style="text-align:left;background:#fff"></th>${runtime.columns.map((column) => `<th style="background:#eef4fc">${esc(fmtDate(column))}</th>`).join('')}<th></th>`;
  }

  function renderGrid() {
    const tbody = $('#flowsheetTbody');
    if (!tbody || !runtime.data) return;
    closePopover();
    renderHeaders();
    const rows = visibleRows();
    const body = [];
    let group = '';
    for (const row of rows) {
      const nextGroup = String(row.groupName || 'Other');
      if (nextGroup !== group) {
        body.push(`<tr class="flow-section-row"><td colspan="${runtime.columns.length + 2}">${esc(nextGroup)}</td></tr>`);
        group = nextGroup;
      }
      body.push(`<tr><td class="sub-row-header"><b>${esc(row.name || 'Flowsheet Row')}</b>${row.unit ? ` <span style="color:#64748b;font-size:10px">(${esc(row.unit)})</span>` : ''}${row.description ? `<div style="color:#64748b;font-size:9px;font-weight:400;margin-top:1px">${esc(row.description)}</div>` : ''}</td>${runtime.columns.map((column) => rowCellHtml(row, column, runtime.columns[runtime.columns.length - 1])).join('')}<td></td></tr>`);
    }
    tbody.innerHTML = body.length ? body.join('') : `<tr><td colspan="${runtime.columns.length + 2}" style="padding:24px;text-align:center;color:#64748b">No configured flowsheet rows match this category/search.</td></tr>`;
    wireGridCells(tbody);
    updateFileButton();
  }

  function setStatus(message, type = '') {
    const status = $('#flowInlineStatus');
    if (!status) return;
    status.textContent = message || '';
    status.className = `flow-inline-status${type ? ` ${type}` : ''}`;
  }

  function updateFileButton() {
    const button = $('#flowFileBtn');
    const pending = $('#flowPendingCount');
    const count = runtime.drafts.size;
    if (button) {
      button.textContent = count ? `📁 File (${count})` : '📁 File';
      button.disabled = runtime.filing || count === 0 || runtime.data?.viewer?.canWrite !== true;
      button.classList.toggle('has-drafts', count > 0);
    }
    if (pending) pending.textContent = count ? `${count} unfiled` : 'No unfiled changes';
  }

  function restoreAuthoritativeToolbar() {
    const host = $('#flowsheets-view');
    if (!host) return;
    let toolbar = $('.flowsheet-sub-toolbar', host);
    let filters = $('.flowsheet-filters', host);
    let layout = $('.flowsheet-main-layout', host);
    let tree = $('#flowsheetTreeMenu', host);
    let grid = $('#flowsheetGridContainer', host);
    let table = $('#flowsheetTable', host);
    let tbody = $('#flowsheetTbody', host);

    if (!toolbar || !filters || !layout || !tree || !grid || !table || !tbody) {
      host.innerHTML = `
        <div class="flowsheet-sub-toolbar"></div>
        <div class="flowsheet-filters"><div class="filter-dropdown"><span id="activeFlowsheetFilterName">DSP Daily Documentation - Show All Tasks</span><span>▼</span></div><span><b>Type directly in any writable box.</b> Suggestions are optional and nothing is filed until File is pressed.</span></div>
        <div class="flowsheet-main-layout"><div class="flowsheet-tree" id="flowsheetTreeMenu"></div><div class="flowsheet-grid-container" id="flowsheetGridContainer"><table class="flowsheet-table" id="flowsheetTable"><thead><tr id="headerTimeRow"></tr><tr id="headerDateRow"></tr></thead><tbody id="flowsheetTbody"></tbody></table></div></div>`;
      toolbar = $('.flowsheet-sub-toolbar', host);
      filters = $('.flowsheet-filters', host);
      tree = $('#flowsheetTreeMenu', host);
    }

    toolbar.innerHTML = `
      <button class="toolbar-action-btn" type="button" id="flowFileBtn">📁 File</button>
      <button class="toolbar-action-btn" type="button" id="addRowBtn">➕ Add Rows</button>
      <span>👤 LDA Avatar</span>
      <button class="toolbar-action-btn" type="button" id="addColBtn">📊 Add Col (Current Time)</button>
      <button class="toolbar-action-btn" type="button" id="insertColBtn">📋 Insert Col (Custom Date & Time)</button>
      <span>💻 Device Data</span>
      <button class="toolbar-action-btn" type="button" id="lastFiledBtn">⏱️ Last Filed</button>
      <span>📄 Rag Doc</span>
      <span>⚙️ Macro Manager</span>
      <button class="toolbar-action-btn" type="button" id="goToDateBtn">📅 Go to Date</button>
      <span>📌 Responsible</span>
      <button class="toolbar-action-btn" type="button" id="refreshBtn">🔄 Refresh</button>
      <span>📈 Flowsheet History</span>
      <span>📉 Graph</span>
      <span class="flow-inline-status" id="flowInlineStatus"></span>
      <span class="flow-inline-status" id="flowPendingCount"></span>`;

    tree.innerHTML = `<div style="margin-bottom:6px"><input type="text" id="flowTaskSearch" placeholder="Search Task..." style="width:100%;border:1px solid #7f9db9;padding:3px"></div><div class="tree-item ${runtime.category === 'all' ? 'selected' : ''}" data-category="all"><span>Show All Tasks</span></div><hr style="border:0;border-top:1px solid #ccc;margin:4px 0">${Object.entries(CATEGORY_DEFS).filter(([key]) => key !== 'all').map(([key, value]) => `<div class="tree-item ${runtime.category === key ? 'selected' : ''}" data-category="${key}"><span>${esc(value.label)}</span></div>`).join('')}`;

    const search = $('#flowTaskSearch', tree);
    search.value = runtime.search;
    search.addEventListener('input', (event) => { runtime.search = event.target.value || ''; renderGrid(); });
    $$('[data-category]', tree).forEach((item) => item.addEventListener('click', () => {
      runtime.category = item.dataset.category || 'all';
      $$('[data-category]', tree).forEach((node) => node.classList.toggle('selected', node === item));
      const active = $('#activeFlowsheetFilterName');
      if (active) active.textContent = `DSP Daily Documentation - ${CATEGORY_DEFS[runtime.category]?.label || 'Show All Tasks'}`;
      renderGrid();
    }));

    $('#flowFileBtn', toolbar)?.addEventListener('click', filePending);
    $('#addRowBtn', toolbar)?.addEventListener('click', () => {
      runtime.category = 'all';
      runtime.search = '';
      restoreAuthoritativeToolbar();
      renderGrid();
      $('#flowTaskSearch')?.focus();
      setStatus('All configured rows are shown. Search or choose a category to narrow the grid.');
    });
    $('#addColBtn', toolbar)?.addEventListener('click', () => addColumn(new Date()));
    $('#insertColBtn', toolbar)?.addEventListener('click', insertCustomTime);
    $('#lastFiledBtn', toolbar)?.addEventListener('click', goToLastFiled);
    $('#goToDateBtn', toolbar)?.addEventListener('click', goToDate);
    $('#refreshBtn', toolbar)?.addEventListener('click', () => loadWorkspace({ preserveColumns: true }));

    const active = $('#activeFlowsheetFilterName');
    if (active) active.textContent = `DSP Daily Documentation - ${CATEGORY_DEFS[runtime.category]?.label || 'Show All Tasks'}`;
    host.dataset.userMasterFlowsheet = 'true';
    updateFileButton();
  }

  function addColumn(value) {
    const column = isoMinute(value);
    if (!column) return;
    runtime.columns = [...new Set([...runtime.columns, column])].sort().slice(-MAX_VISIBLE_COLUMNS);
    saveColumns();
    renderGrid();
    setStatus(`Added ${fmtTime(column)} column.`, 'success');
  }

  function insertCustomTime() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    const suggestion = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const answer = prompt('Insert observation date and time (YYYY-MM-DDTHH:MM)', suggestion);
    if (!answer) return;
    const parsed = new Date(answer);
    if (Number.isNaN(parsed.getTime())) return alert('Enter a valid date and time.');
    addColumn(parsed);
  }

  function goToDate() {
    const answer = prompt('Go to date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
    if (!answer) return;
    const base = new Date(`${answer}T06:00:00`);
    if (Number.isNaN(base.getTime())) return alert('Enter a valid date.');
    runtime.columns = Array.from({ length: MIN_VISIBLE_COLUMNS }, (_, index) => isoMinute(new Date(base.getTime() + index * 3 * 60 * 60 * 1000)));
    saveColumns();
    renderGrid();
    setStatus(`Showing ${answer}.`, 'success');
  }

  function goToLastFiled() {
    const entries = Array.isArray(runtime.data?.entries) ? runtime.data.entries : [];
    const latest = entries.slice().sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))[0];
    if (!latest) return setStatus('No filed values in the current flowsheet window.', 'warn');
    addColumn(latest.recordedAt);
    requestAnimationFrame(() => {
      const selector = `[data-row-id="${CSS.escape(String(latest.rowId))}"][data-flow-time="${CSS.escape(isoMinute(latest.recordedAt))}"]`;
      $(selector)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    });
  }

  async function filePending() {
    if (runtime.filing || !runtime.drafts.size) return;
    const rows = Array.isArray(runtime.data?.rows) ? runtime.data.rows : [];
    const drafts = [...runtime.drafts.values()];
    try {
      for (const draft of drafts) {
        const row = rows.find((item) => String(item.id) === String(draft.rowId));
        if (!row) throw new Error(`${draft.rowName || 'A flowsheet row'} is no longer configured.`);
        validateDraft(draft, row);
      }
    } catch (error) {
      return setStatus(error.message, 'error');
    }

    runtime.filing = true;
    closePopover();
    updateFileButton();
    setStatus(`Filing ${drafts.length} staged change${drafts.length === 1 ? '' : 's'} as ${actorName()}…`, 'warn');
    try {
      const entries = drafts.map((draft) => {
        const row = rows.find((item) => String(item.id) === String(draft.rowId));
        const type = String(row?.dataType || row?.valueType || draft.dataType || 'TEXT').toUpperCase();
        return {
          entryId: draft.entryId || null,
          rowId: draft.rowId,
          recordedAt: isoMinute(draft.recordedAt),
          comment: clean(draft.comment) || null,
          value: type === 'NUMBER' ? null : clean(draft.value) || null,
          numericValue: type === 'NUMBER' && clean(draft.value) !== '' ? Number(draft.value) : null,
        };
      });
      const result = await api(`/api/spire/patients/${encodeURIComponent(runtime.patientId)}/flowsheet-workspace/file`, {
        method: 'POST',
        body: JSON.stringify({ entries }),
      });
      runtime.drafts.clear();
      saveDraftStore();
      runtime.filing = false;
      await loadWorkspace({ preserveColumns: true, preserveStatus: true });
      setStatus(`${result?.count ?? entries.length} change${(result?.count ?? entries.length) === 1 ? '' : 's'} filed together · ${actorName()}.`, 'success');
    } catch (error) {
      runtime.filing = false;
      updateFileButton();
      setStatus(`Nothing was filed: ${error.message}. Your staged boxes are still here.`, 'error');
    }
  }

  async function loadWorkspace({ preserveColumns = false, preserveStatus = false } = {}) {
    if (runtime.loading) return;
    runtime.patientId = currentPatientId();
    runtime.homeId = currentHomeId();
    const host = $('#flowsheets-view');
    if (!host) return;
    if (!runtime.patientId || !runtime.homeId) {
      host.innerHTML = '<div class="spire-error">Open this chart from SPIRE Patient Station before using Flowsheets.</div>';
      return;
    }
    runtime.loading = true;
    try {
      await loadActor();
      loadDraftStore();
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const to = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      runtime.data = await api(`/api/spire/patients/${encodeURIComponent(runtime.patientId)}/flowsheet-workspace?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!Array.isArray(runtime.data?.rows) || !runtime.data.rows.length) throw new Error('No active flowsheet rows are configured for this organization.');
      if (!preserveColumns || !runtime.columns.length) ensureColumns();
      restoreAuthoritativeToolbar();
      renderGrid();
      if (!preserveStatus) setStatus(runtime.drafts.size ? 'Unfiled boxes restored. Press File when finished.' : `Ready · File as ${actorName()}.`, runtime.drafts.size ? 'warn' : '');
    } catch (error) {
      restoreAuthoritativeToolbar();
      const tbody = $('#flowsheetTbody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="${runtime.columns.length + 2 || 8}" style="padding:20px;color:#991b1b"><b>Unable to load flowsheet.</b><br>${esc(error.message)}</td></tr>`;
      setStatus(error.message, 'error');
    } finally {
      runtime.loading = false;
    }
  }

  function install() {
    installCompatibilityStyle();
    ensurePopover();
    runtime.patientId = currentPatientId();
    runtime.homeId = currentHomeId();
    loadDraftStore();
    restoreAuthoritativeToolbar();
    runtime.wired = true;
    if ($('#flowsheets-view')?.classList.contains('active')) loadWorkspace();
    window.SpireMasterFlowsheetGrid = Object.freeze({
      version: VERSION,
      refresh: () => loadWorkspace({ preserveColumns: runtime.columns.length > 0 }),
      filePending,
      hasPending: () => runtime.drafts.size > 0,
      pendingCount: () => runtime.drafts.size,
      getState: () => ({ patientId: runtime.patientId, homeId: runtime.homeId, pending: runtime.drafts.size, category: runtime.category, columns: [...runtime.columns] }),
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();