(() => {
  'use strict';

  // SPIRE_MASTER_FLOWSHEET_AUTHORITY_V1
  // SPIRE_FLOWSHEET_FILE_WORKFLOW_V1
  // Clinical charting is staged locally. No POST/PUT occurs until the user
  // deliberately presses File. Filed amendments remain visibly red.
  const VERSION = '20260813-file-on-command-1';
  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const HOME_ID_KEY = 'spire:selected-service-home-id';

  const runtime = {
    patientId: '',
    homeId: '',
    data: null,
    actor: null,
    columns: [],
    group: 'all',
    search: '',
    drafts: new Map(),
    activeCell: null,
    loading: false,
    filing: false,
    rendering: false,
    observer: null,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const token = () => TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';
  const isoMinute = (value) => {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    date.setSeconds(0, 0);
    return date.toISOString();
  };
  const fmtDate = (value) => new Date(value).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  const fmtTime = (value) => new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

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
    return runtime.patientId ? `spire:flowsheet:staged:v1:${runtime.homeId || 'home'}:${runtime.patientId}` : '';
  }

  function columnStoreKey() {
    return runtime.patientId ? `spire:flowsheet:columns:v4:${runtime.homeId || 'home'}:${runtime.patientId}` : '';
  }

  function cellKey(rowId, recordedAt) {
    return `${String(rowId || '')}|${isoMinute(recordedAt)}`;
  }

  function loadDraftStore() {
    runtime.drafts.clear();
    const key = draftStoreKey();
    if (!key) return;
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || '{}');
      if (!value || typeof value !== 'object') return;
      for (const [draftKey, draft] of Object.entries(value)) {
        if (draft && typeof draft === 'object') runtime.drafts.set(draftKey, draft);
      }
    } catch {
      sessionStorage.removeItem(key);
    }
  }

  function saveDraftStore() {
    const key = draftStoreKey();
    if (!key) return;
    if (!runtime.drafts.size) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(Object.fromEntries(runtime.drafts)));
  }

  function readColumns() {
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
    return actor.displayName || actor.name || actor.fullName || actor.email || runtime.data?.viewer?.userId || 'Current user';
  }

  function rowOptions(row) {
    if (Array.isArray(row?.options)) return row.options.map((item) => typeof item === 'object' ? clean(item.label || item.value) : clean(item)).filter(Boolean);
    if (typeof row?.options === 'string') {
      try {
        const parsed = JSON.parse(row.options);
        return Array.isArray(parsed) ? parsed.map(clean).filter(Boolean) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function entryFor(rowId, recordedAt) {
    const target = isoMinute(recordedAt);
    const matches = (Array.isArray(runtime.data?.entries) ? runtime.data.entries : []).filter(
      (entry) => String(entry.rowId) === String(rowId) && isoMinute(entry.recordedAt) === target,
    );
    return matches[matches.length - 1] || null;
  }

  function amendedEntry(entry) {
    if (!entry?.createdAt || !entry?.updatedAt) return false;
    const created = new Date(entry.createdAt).getTime();
    const updated = new Date(entry.updatedAt).getTime();
    return Number.isFinite(created) && Number.isFinite(updated) && updated - created > 1000;
  }

  function valueOf(entry, row) {
    if (!entry) return '';
    return String(String(row?.dataType || '').toUpperCase() === 'NUMBER' ? (entry.numericValue ?? '') : (entry.value ?? ''));
  }

  function draftValue(draft) {
    return String(draft?.value ?? '');
  }

  function filedBy(entry) {
    if (!entry) return '';
    if (entry.recordedByDisplayName) return String(entry.recordedByDisplayName);
    if (String(entry.recordedById || '') === String(runtime.data?.viewer?.userId || '')) return actorName();
    return String(entry.recordedById || 'Filed user');
  }

  function deriveColumns() {
    const server = (Array.isArray(runtime.data?.entries) ? runtime.data.entries : []).map((entry) => isoMinute(entry.recordedAt)).filter(Boolean);
    const drafts = [...runtime.drafts.values()].map((draft) => isoMinute(draft.recordedAt)).filter(Boolean);
    const stored = readColumns();
    const values = [...new Set([...server, ...drafts, ...stored])].sort();
    if (values.length) return values.slice(-12);
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return Array.from({ length: 6 }, (_, index) => isoMinute(new Date(now.getTime() - (5 - index) * 60 * 60 * 1000)));
  }

  function setStatus(message, type = 'info') {
    const node = $('#spireFlowStatus');
    if (!node) return;
    node.textContent = message || '';
    node.dataset.type = type;
  }

  function draftCount() {
    return runtime.drafts.size;
  }

  function updateFileButton() {
    const button = $('#flowFileBtn');
    if (!button) return;
    const count = draftCount();
    button.textContent = count ? `📁 File (${count})` : '📁 File';
    button.disabled = runtime.filing || count === 0 || runtime.data?.viewer?.canWrite !== true;
    button.classList.toggle('has-drafts', count > 0);
    const pending = $('#flowPendingCount');
    if (pending) pending.textContent = count ? `${count} unfiled change${count === 1 ? '' : 's'}` : 'No unfiled changes';
  }

  function installStyle() {
    if ($('#spireDspFlowGridStyle')) return;
    const style = document.createElement('style');
    style.id = 'spireDspFlowGridStyle';
    style.textContent = `
      #flowsheets-view[data-spire-dsp-grid="true"]{height:100%;overflow:hidden!important;background:#fff;padding:0!important}
      #flowsheets-view .flow-file-toolbar{min-height:43px;display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:6px 9px;border-bottom:1px solid #b9c9d8;background:#eef4fa}
      #flowsheets-view .flow-file-btn{border:1px solid #456f91;border-radius:4px;background:#0d4f82;color:#fff;padding:6px 13px;font-weight:900;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.1)}
      #flowsheets-view .flow-file-btn.has-drafts{background:#166534;border-color:#14532d}.flow-file-btn:disabled{opacity:.52;cursor:not-allowed}
      #flowsheets-view .flow-tool{border:1px solid #8ba5b9;border-radius:4px;background:#f8fbfd;color:#173c58;padding:5px 8px;font-weight:700;cursor:pointer}.flow-tool:hover{background:#e0eef8}
      #flowsheets-view .flow-user{margin-left:auto;border:1px solid #c6d6e1;background:#fff;border-radius:999px;padding:5px 9px;font-size:10.5px;font-weight:800;color:#426078}
      #flowsheets-view .flow-file-notice{display:flex;align-items:center;gap:10px;min-height:36px;padding:6px 10px;background:#fff8e6;border-bottom:1px solid #ead39d;color:#77500b;font-size:11px}.flow-file-notice b{color:#5e3e08}.flow-file-notice .pending{margin-left:auto;font-weight:900;white-space:nowrap}
      #flowsheets-view #spireFlowStatus[data-type="success"]{color:#166534}#flowsheets-view #spireFlowStatus[data-type="error"]{color:#991b1b}#flowsheets-view #spireFlowStatus[data-type="warn"]{color:#92400e}
      #flowsheets-view .flow-layout{display:grid;grid-template-columns:235px minmax(0,1fr);height:calc(100% - 79px);min-height:420px;overflow:hidden}
      #flowsheets-view .flow-tree{border-right:1px solid #c8d5df;background:#f7fafc;padding:8px;overflow:auto}.flow-tree input{width:100%;border:1px solid #9eb3c2;border-radius:4px;padding:6px 7px;margin-bottom:7px;font-size:11px}.flow-group-btn{width:100%;border:0;border-radius:4px;background:transparent;color:#163f75;padding:7px 8px;text-align:left;cursor:pointer;font-size:11.5px}.flow-group-btn:hover,.flow-group-btn.active{background:#dceafa;font-weight:800;color:#0d3f74}
      #flowsheets-view .flow-grid-wrap{overflow:auto;background:#fff}.flow-table{border-collapse:collapse;min-width:1000px;width:max-content;min-height:100%}.flow-table th,.flow-table td{border:1px solid #d0dbe4}.flow-table th{position:sticky;top:0;z-index:10;background:#eaf1f8;color:#06355f;min-width:126px;padding:6px 7px;text-align:center;font-size:11px}.flow-table th:first-child{left:0;z-index:12;min-width:290px;text-align:left}.flow-table td:first-child{position:sticky;left:0;z-index:6;background:#f7fafc;min-width:290px;max-width:290px;padding:6px 8px}.flow-group-row td{background:#dfeaf5!important;color:#083c68;font-weight:900;padding:6px 8px;position:static!important}.flow-group-row td:first-child{position:sticky!important;left:0!important;z-index:7}.flow-row-name{font-size:11.5px;font-weight:700;color:#203f55}.flow-row-help{font-size:9.5px;color:#718594;margin-top:2px}.flow-cell{min-width:126px;height:43px;background:#fff;vertical-align:top;position:relative;cursor:pointer;padding:3px 5px}.flow-cell:hover{background:#f3f8fc}.flow-cell.readonly{background:#f7f8fa;color:#6b7d89;cursor:not-allowed}.flow-cell.pending-new{background:#fff4c7!important;box-shadow:inset 0 0 0 2px #d8a925}.flow-cell.pending-amendment{background:#fee2e2!important;color:#991b1b;box-shadow:inset 0 0 0 2px #dc2626}.flow-cell.filed-amendment{background:#fff0f0!important;color:#a11220}.flow-cell .flow-value{min-height:21px;outline:none;padding:2px 3px;font-size:11.5px;white-space:pre-wrap;overflow-wrap:anywhere}.flow-cell .flow-value[contenteditable="true"]{cursor:text}.flow-cell .flow-value[contenteditable="true"]:focus{outline:2px solid #2563eb;background:#fff;border-radius:2px}.flow-cell .flow-meta{font-size:8.5px;color:#708391;line-height:1.2;padding:1px 3px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.flow-cell.pending-amendment .flow-meta,.flow-cell.filed-amendment .flow-meta{color:#b91c1c;font-weight:900}.flow-cell.has-comment:after{content:'💬';position:absolute;right:2px;top:1px;font-size:8px}.flow-select-value{width:100%;min-height:27px;border:0;background:transparent;text-align:left;color:inherit;font-weight:inherit;cursor:pointer;padding:2px 3px}
      #spireFlowCellPopover{position:fixed;z-index:6000;width:310px;max-height:440px;overflow:auto;display:none;background:#fff;border:1px solid #8ba5b9;border-radius:7px;box-shadow:0 12px 34px rgba(15,23,42,.28);color:#172b3b}.flow-pop-head{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#0c456f;color:#fff;padding:8px 9px;font-weight:900}.flow-pop-head button{border:0;background:transparent;color:#fff;cursor:pointer}.flow-pop-body{padding:9px}.flow-option{display:block;width:100%;border:1px solid #cbd8e2;border-radius:4px;background:#f8fbfd;padding:6px 8px;margin:4px 0;text-align:left;cursor:pointer;font-weight:700;color:#16456a}.flow-option:hover{background:#dfeffc;border-color:#6ca3c4}.flow-option.refused{background:#fff1f2;color:#9f1239;border-color:#fecdd3}.flow-pop-body textarea{width:100%;min-height:70px;border:1px solid #9fb4c3;border-radius:4px;padding:6px;font:inherit;resize:vertical}.flow-pop-note{font-size:10px;color:#637b8b;line-height:1.4;margin:6px 0}.flow-pop-footer{display:flex;justify-content:flex-end;gap:6px;padding:7px 9px;border-top:1px solid #e0e8ed;background:#f7fafc}.flow-pop-footer button{border:1px solid #879eae;border-radius:4px;background:#fff;padding:5px 8px;font-weight:800;cursor:pointer}.flow-pop-footer .primary{background:#0d628f;border-color:#0d628f;color:#fff}
      @media(max-width:850px){#flowsheets-view .flow-layout{grid-template-columns:190px minmax(0,1fr)}#flowsheets-view .flow-user{margin-left:0}.flow-table th:first-child,.flow-table td:first-child{min-width:235px;max-width:235px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePopover() {
    let popover = $('#spireFlowCellPopover');
    if (popover) return popover;
    popover = document.createElement('section');
    popover.id = 'spireFlowCellPopover';
    popover.innerHTML = '<div class="flow-pop-head"><span id="flowPopTitle">Flowsheet Cell</span><button type="button" id="flowPopClose">✖</button></div><div class="flow-pop-body"><div id="flowPopOptions"></div><div class="flow-pop-note" id="flowPopInstruction"></div><label style="display:block;font-size:10.5px;font-weight:900">Comment<textarea id="flowPopComment" placeholder="Optional context/comment"></textarea></label></div><div class="flow-pop-footer"><button type="button" id="flowPopCancel">Close</button><button type="button" class="primary" id="flowPopSaveComment">Save Comment to Box</button></div>';
    document.body.appendChild(popover);
    $('#flowPopClose', popover).addEventListener('click', hidePopover);
    $('#flowPopCancel', popover).addEventListener('click', hidePopover);
    $('#flowPopSaveComment', popover).addEventListener('click', () => {
      const cell = runtime.activeCell;
      if (!cell) return hidePopover();
      const row = rowForCell(cell);
      if (!row) return hidePopover();
      const entry = entryFor(row.id, cell.dataset.flowTime);
      if (entry && entry.canEdit === false) return hidePopover();
      const currentValue = displayedValue(row, cell.dataset.flowTime);
      stageDraft(row, cell.dataset.flowTime, currentValue, $('#flowPopComment', popover).value, entry);
      hidePopover();
      renderGridOnly();
      setStatus('Comment staged in the box. Press File when all charting is complete.', 'warn');
    });
    document.addEventListener('pointerdown', (event) => {
      if (popover.style.display !== 'block') return;
      const target = event.target instanceof Node ? event.target : null;
      if (target && (popover.contains(target) || runtime.activeCell?.contains(target))) return;
      hidePopover();
    }, true);
    return popover;
  }

  function hidePopover() {
    const popover = $('#spireFlowCellPopover');
    if (popover) popover.style.display = 'none';
    runtime.activeCell = null;
  }

  function rowForCell(cell) {
    return (Array.isArray(runtime.data?.rows) ? runtime.data.rows : []).find((row) => String(row.id) === String(cell?.dataset.rowId)) || null;
  }

  function displayedValue(row, recordedAt) {
    const key = cellKey(row.id, recordedAt);
    const draft = runtime.drafts.get(key);
    if (draft) return draftValue(draft);
    return valueOf(entryFor(row.id, recordedAt), row);
  }

  function displayedComment(row, recordedAt) {
    const key = cellKey(row.id, recordedAt);
    const draft = runtime.drafts.get(key);
    if (draft) return String(draft.comment || '');
    return String(entryFor(row.id, recordedAt)?.comment || '');
  }

  function stageDraft(row, recordedAt, rawValue, rawComment, existingEntry = entryFor(row.id, recordedAt)) {
    if (runtime.data?.viewer?.canWrite !== true) return false;
    if (existingEntry && existingEntry.canEdit === false) {
      setStatus('This filed entry belongs to another user and is read-only.', 'error');
      return false;
    }
    const value = String(rawValue ?? '').trim();
    const comment = String(rawComment ?? '').trim();
    const originalValue = valueOf(existingEntry, row).trim();
    const originalComment = String(existingEntry?.comment || '').trim();
    const key = cellKey(row.id, recordedAt);
    if ((existingEntry && value === originalValue && comment === originalComment) || (!existingEntry && !value && !comment)) {
      runtime.drafts.delete(key);
      saveDraftStore();
      updateFileButton();
      return false;
    }
    runtime.drafts.set(key, {
      rowId: String(row.id),
      rowName: String(row.name || ''),
      dataType: String(row.dataType || 'TEXT'),
      recordedAt: isoMinute(recordedAt),
      value,
      comment,
      entryId: existingEntry?.id ? String(existingEntry.id) : '',
      amendment: Boolean(existingEntry),
      stagedAt: new Date().toISOString(),
    });
    saveDraftStore();
    updateFileButton();
    return true;
  }

  function validateDraft(draft, row) {
    const type = String(row?.dataType || draft.dataType || 'TEXT').toUpperCase();
    const value = String(draft.value || '').trim();
    if (type === 'NUMBER' && value !== '' && !Number.isFinite(Number(value))) throw new Error(`${row.name}: enter a valid number.`);
    if (type === 'SELECT' && value) {
      const options = rowOptions(row);
      if (options.length && !options.includes(value)) throw new Error(`${row.name}: choose one of the configured options.`);
    }
    if (String(row?.name || '') === 'BP (mmHg)' && value && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(value)) throw new Error('BP (mmHg): use systolic/diastolic, for example 120/80.');
    if (!value && !String(draft.comment || '').trim()) throw new Error(`${row?.name || 'Flowsheet row'} has no value or comment.`);
  }

  function openCell(cell) {
    const row = rowForCell(cell);
    if (!row) return;
    const entry = entryFor(row.id, cell.dataset.flowTime);
    runtime.activeCell = cell;
    const popover = ensurePopover();
    $('#flowPopTitle', popover).textContent = `${row.name || 'Flowsheet'} · ${fmtTime(cell.dataset.flowTime)}`;
    const optionHost = $('#flowPopOptions', popover);
    optionHost.innerHTML = '';
    const options = rowOptions(row);
    const readonly = runtime.data?.viewer?.canWrite !== true || (entry && entry.canEdit === false);
    if (readonly) {
      optionHost.innerHTML = '<div class="flow-pop-note" style="color:#8a2630;font-weight:900">This filed cell is read-only for the current user.</div>';
    } else if (options.length) {
      options.forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `flow-option${/refused|omitted|not maintained/i.test(option) ? ' refused' : ''}`;
        button.textContent = option;
        button.addEventListener('click', () => {
          stageDraft(row, cell.dataset.flowTime, option, displayedComment(row, cell.dataset.flowTime), entry);
          hidePopover();
          renderGridOnly();
          setStatus(`${row.name}: ${option} staged. Continue charting, then press File.`, 'warn');
        });
        optionHost.appendChild(button);
      });
    }
    const type = String(row.dataType || 'TEXT').toUpperCase();
    $('#flowPopInstruction', popover).textContent = readonly
      ? `Filed by ${filedBy(entry)}. Only the original documenting user may amend this entry.`
      : options.length
        ? 'Choose an option. The selector closes immediately and the value remains unfiled until you press File.'
        : type === 'NUMBER'
          ? 'Type the numeric value directly in the grid cell. Comments can be staged here. Nothing is filed until you press File.'
          : 'Type directly in the grid cell. Comments can be staged here. Nothing is filed until you press File.';
    $('#flowPopComment', popover).value = displayedComment(row, cell.dataset.flowTime);
    $('#flowPopComment', popover).disabled = readonly;
    $('#flowPopSaveComment', popover).disabled = readonly;
    const rect = cell.getBoundingClientRect();
    popover.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 322))}px`;
    popover.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - 450))}px`;
    popover.style.display = 'block';
    if (!options.length && !readonly) {
      const editor = $('.flow-value[contenteditable="true"]', cell);
      requestAnimationFrame(() => editor?.focus({ preventScroll: true }));
    }
  }

  function cellHtml(row, recordedAt) {
    const entry = entryFor(row.id, recordedAt);
    const key = cellKey(row.id, recordedAt);
    const draft = runtime.drafts.get(key);
    const value = draft ? draftValue(draft) : valueOf(entry, row);
    const comment = draft ? String(draft.comment || '') : String(entry?.comment || '');
    const readonly = runtime.data?.viewer?.canWrite !== true || (entry && entry.canEdit === false);
    const amendment = draft?.amendment === true || (!draft && amendedEntry(entry));
    const classes = ['flow-cell'];
    if (readonly) classes.push('readonly');
    if (draft) classes.push(draft.amendment ? 'pending-amendment' : 'pending-new');
    else if (amendment) classes.push('filed-amendment');
    if (comment) classes.push('has-comment');
    const options = rowOptions(row);
    const meta = draft
      ? draft.amendment ? 'UNFILED AMENDMENT · will file as you' : 'UNFILED · will file as you'
      : entry ? `${amendment ? 'AMENDED · ' : ''}Filed by ${filedBy(entry)}` : '';
    const valueControl = options.length
      ? `<button type="button" class="flow-select-value" ${readonly ? 'disabled' : ''}>${esc(value || '')}</button>`
      : `<div class="flow-value" contenteditable="${readonly ? 'false' : 'true'}" spellcheck="false">${esc(value || '')}</div>`;
    return `<td class="${classes.join(' ')}" data-flow-cell data-row-id="${esc(row.id)}" data-flow-time="${esc(recordedAt)}" title="${esc(comment || (entry ? `Filed ${entry.createdAt || ''}` : 'Unfiled cell'))}">${valueControl}<div class="flow-meta">${esc(meta)}</div></td>`;
  }

  function visibleRows() {
    const rows = Array.isArray(runtime.data?.rows) ? runtime.data.rows : [];
    const term = runtime.search.toLowerCase();
    return rows.filter((row) => {
      const groupMatch = runtime.group === 'all' || String(row.groupName || 'Other') === runtime.group;
      const searchMatch = !term || [row.name, row.groupName, row.description, row.unit].some((value) => clean(value).toLowerCase().includes(term));
      return groupMatch && searchMatch;
    });
  }

  function groupNames() {
    const rows = Array.isArray(runtime.data?.rows) ? runtime.data.rows : [];
    return [...new Set(rows.map((row) => String(row.groupName || 'Other')))].sort((a, b) => a.localeCompare(b));
  }

  function renderGridOnly() {
    const wrap = $('#flowGridWrap');
    if (!wrap || !runtime.data) return;
    const rows = visibleRows();
    let previousGroup = '';
    const body = [];
    for (const row of rows) {
      const group = String(row.groupName || 'Other');
      if (runtime.group === 'all' && group !== previousGroup) {
        body.push(`<tr class="flow-group-row"><td colspan="${runtime.columns.length + 1}">${esc(group)}</td></tr>`);
        previousGroup = group;
      }
      body.push(`<tr><td><div class="flow-row-name">${esc(row.name || 'Flowsheet Row')}${row.unit ? ` <span style="font-weight:500;color:#64748b">(${esc(row.unit)})</span>` : ''}</div>${row.description ? `<div class="flow-row-help">${esc(row.description)}</div>` : ''}</td>${runtime.columns.map((column) => cellHtml(row, column)).join('')}</tr>`);
    }
    wrap.innerHTML = `<table class="flow-table" id="flowsheetTable"><thead><tr><th>DSP Daily Documentation</th>${runtime.columns.map((column) => `<th>${esc(fmtDate(column))}<br><b>${esc(fmtTime(column))}</b></th>`).join('')}</tr></thead><tbody id="flowsheetTbody">${body.length ? body.join('') : `<tr><td colspan="${runtime.columns.length + 1}" style="padding:24px;text-align:center">No flowsheet rows match this view.</td></tr>`}</tbody></table>`;
    wireGridEvents(wrap);
    updateFileButton();
  }

  function renderShell() {
    const host = $('#flowsheets-view');
    if (!host || !runtime.data) return;
    runtime.rendering = true;
    host.dataset.spireDspGrid = 'true';
    const groups = groupNames();
    host.innerHTML = `
      <div class="flow-file-toolbar">
        <button type="button" class="flow-file-btn" id="flowFileBtn">📁 File</button>
        <button type="button" class="flow-tool" id="flowAddNow">➕ Add Col (Current Time)</button>
        <button type="button" class="flow-tool" id="flowInsertTime">📋 Insert Col</button>
        <button type="button" class="flow-tool" id="flowEarlier">◀ Earlier</button>
        <button type="button" class="flow-tool" id="flowLater">Later ▶</button>
        <button type="button" class="flow-tool" id="flowLastFiled">⏱ Last Filed</button>
        <button type="button" class="flow-tool" id="flowRefresh">↻ Refresh</button>
        <span class="flow-user">File as ${esc(actorName())}</span>
      </div>
      <div class="flow-file-notice"><span><b>Draft-first charting:</b> values and comments stay unfiled in this browser until you press <b>File</b>. Filed amendments are shown in red.</span><span id="spireFlowStatus"></span><span class="pending" id="flowPendingCount"></span></div>
      <div class="flow-layout">
        <aside class="flow-tree"><input type="search" id="flowTaskSearch" placeholder="Search task…"><button type="button" class="flow-group-btn ${runtime.group === 'all' ? 'active' : ''}" data-flow-group="all">Show All Tasks</button>${groups.map((group) => `<button type="button" class="flow-group-btn ${runtime.group === group ? 'active' : ''}" data-flow-group="${esc(group)}">${esc(group)}</button>`).join('')}</aside>
        <div class="flow-grid-wrap" id="flowGridWrap"></div>
      </div>`;
    $('#flowTaskSearch', host).value = runtime.search;
    wireShellEvents(host);
    renderGridOnly();
    setStatus(draftCount() ? 'Unfiled documentation restored. Review it and press File when ready.' : 'Ready. Charting will remain unfiled until you press File.', draftCount() ? 'warn' : 'info');
    runtime.rendering = false;
  }

  function wireGridEvents(wrap) {
    wrap.addEventListener('click', (event) => {
      const cell = event.target instanceof Element ? event.target.closest('[data-flow-cell]') : null;
      if (cell) openCell(cell);
    });
    wrap.addEventListener('input', (event) => {
      const editor = event.target instanceof Element ? event.target.closest('.flow-value[contenteditable="true"]') : null;
      if (!editor) return;
      const cell = editor.closest('[data-flow-cell]');
      const row = rowForCell(cell);
      if (!row) return;
      stageDraft(row, cell.dataset.flowTime, editor.textContent, displayedComment(row, cell.dataset.flowTime), entryFor(row.id, cell.dataset.flowTime));
      cell.classList.toggle('pending-amendment', runtime.drafts.get(cellKey(row.id, cell.dataset.flowTime))?.amendment === true);
      cell.classList.toggle('pending-new', runtime.drafts.has(cellKey(row.id, cell.dataset.flowTime)) && !runtime.drafts.get(cellKey(row.id, cell.dataset.flowTime))?.amendment);
      $('.flow-meta', cell).textContent = runtime.drafts.has(cellKey(row.id, cell.dataset.flowTime)) ? (runtime.drafts.get(cellKey(row.id, cell.dataset.flowTime)).amendment ? 'UNFILED AMENDMENT · will file as you' : 'UNFILED · will file as you') : '';
      setStatus('Value staged in the grid. Continue charting, then press File.', 'warn');
    });
    wrap.addEventListener('keydown', (event) => {
      const editor = event.target instanceof Element ? event.target.closest('.flow-value[contenteditable="true"]') : null;
      if (!editor) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        editor.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        renderGridOnly();
        hidePopover();
      }
    });
  }

  function addColumn(value) {
    const column = isoMinute(value);
    if (!column) return;
    runtime.columns = [...new Set([...runtime.columns, column])].sort().slice(-12);
    saveColumns();
    renderGridOnly();
  }

  function shiftColumns(hours) {
    runtime.columns = runtime.columns.map((column) => isoMinute(new Date(new Date(column).getTime() + hours * 60 * 60 * 1000))).filter(Boolean);
    saveColumns();
    renderGridOnly();
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

  function lastFiled() {
    const entries = Array.isArray(runtime.data?.entries) ? runtime.data.entries : [];
    const latest = entries.slice().sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))[0];
    if (!latest) return setStatus('No filed flowsheet entries are in the current charting window.', 'warn');
    addColumn(latest.recordedAt);
    requestAnimationFrame(() => {
      const cell = $(`[data-row-id="${CSS.escape(String(latest.rowId))}"][data-flow-time="${CSS.escape(isoMinute(latest.recordedAt))}"]`);
      cell?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    });
  }

  async function filePending() {
    if (runtime.filing || !runtime.drafts.size) return;
    if (runtime.data?.viewer?.canWrite !== true) return setStatus('Your SPIRE role is read-only.', 'error');
    const rows = Array.isArray(runtime.data?.rows) ? runtime.data.rows : [];
    const drafts = [...runtime.drafts.entries()];
    try {
      for (const [, draft] of drafts) {
        const row = rows.find((candidate) => String(candidate.id) === String(draft.rowId));
        if (!row) throw new Error(`${draft.rowName || 'A flowsheet row'} is no longer configured on the server.`);
        validateDraft(draft, row);
      }
    } catch (error) {
      setStatus(error.message, 'error');
      return;
    }

    runtime.filing = true;
    updateFileButton();
    hidePopover();
    setStatus(`Filing ${drafts.length} change${drafts.length === 1 ? '' : 's'} as ${actorName()}…`, 'warn');
    let filed = 0;
    let failed = null;
    for (const [key, draft] of drafts) {
      const row = rows.find((candidate) => String(candidate.id) === String(draft.rowId));
      const type = String(row?.dataType || draft.dataType || 'TEXT').toUpperCase();
      const body = {
        rowId: draft.rowId,
        recordedAt: isoMinute(draft.recordedAt),
        comment: clean(draft.comment) || null,
        value: type === 'NUMBER' ? null : clean(draft.value) || null,
        numericValue: type === 'NUMBER' && clean(draft.value) !== '' ? Number(draft.value) : null,
      };
      try {
        if (draft.entryId) {
          await api(`/api/spire/patients/${encodeURIComponent(runtime.patientId)}/flowsheet-workspace/entries/${encodeURIComponent(draft.entryId)}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          await api(`/api/spire/patients/${encodeURIComponent(runtime.patientId)}/flowsheet-workspace/entries`, { method: 'POST', body: JSON.stringify(body) });
        }
        runtime.drafts.delete(key);
        saveDraftStore();
        filed += 1;
      } catch (error) {
        failed = error;
        break;
      }
    }
    runtime.filing = false;
    updateFileButton();
    try {
      await loadWorkspace({ preserveColumns: true, preserveMessage: true });
    } catch {}
    if (failed) {
      setStatus(`${filed} change${filed === 1 ? '' : 's'} filed; filing stopped: ${failed.message}. Remaining drafts are still unfiled.`, 'error');
    } else {
      setStatus(`${filed} change${filed === 1 ? '' : 's'} filed to the audited chart as ${actorName()}.`, 'success');
    }
  }

  function wireShellEvents(host) {
    $('#flowFileBtn', host).addEventListener('click', filePending);
    $('#flowAddNow', host).addEventListener('click', () => addColumn(new Date()));
    $('#flowInsertTime', host).addEventListener('click', insertCustomTime);
    $('#flowEarlier', host).addEventListener('click', () => shiftColumns(-4));
    $('#flowLater', host).addEventListener('click', () => shiftColumns(4));
    $('#flowLastFiled', host).addEventListener('click', lastFiled);
    $('#flowRefresh', host).addEventListener('click', () => loadWorkspace({ preserveColumns: true }));
    $('#flowTaskSearch', host).addEventListener('input', (event) => { runtime.search = event.target.value || ''; renderGridOnly(); });
    $$('[data-flow-group]', host).forEach((button) => button.addEventListener('click', () => {
      runtime.group = button.dataset.flowGroup || 'all';
      $$('.flow-group-btn', host).forEach((candidate) => candidate.classList.toggle('active', candidate === button));
      renderGridOnly();
    }));
  }

  async function loadWorkspace({ preserveColumns = false, preserveMessage = false } = {}) {
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
    if (!preserveMessage) host.innerHTML = '<div class="spire-empty">Loading DSP Daily Documentation…</div>';
    try {
      await loadActor();
      loadDraftStore();
      const from = new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString();
      const to = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      runtime.data = await api(`/api/spire/patients/${encodeURIComponent(runtime.patientId)}/flowsheet-workspace?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!Array.isArray(runtime.data?.rows) || !runtime.data.rows.length) throw new Error('No active flowsheet rows are configured for this organization.');
      if (!preserveColumns || !runtime.columns.length) runtime.columns = deriveColumns();
      if (!runtime.columns.length) addColumn(new Date());
      saveColumns();
      renderShell();
    } catch (error) {
      host.dataset.spireDspGrid = 'true';
      host.innerHTML = `<div class="spire-error"><b>Unable to load DSP Daily Documentation.</b><br>${esc(error.message)}<div style="margin-top:8px"><button type="button" class="toolbar-action-btn" id="flowRetryExternal">Retry</button></div></div>`;
      $('#flowRetryExternal')?.addEventListener('click', () => loadWorkspace());
    } finally {
      runtime.loading = false;
    }
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
      if (!host.dataset.spireDspGrid || !$('#flowFileBtn', host)) queueMicrotask(() => loadWorkspace({ preserveColumns: true }));
    });
    runtime.observer.observe(host, { childList: true, subtree: false });
  }

  function install() {
    installStyle();
    ensurePopover();
    runtime.patientId = currentPatientId();
    runtime.homeId = currentHomeId();
    loadDraftStore();
    document.addEventListener('click', interceptNavigation, true);
    observeHost();
    if ($('#flowsheets-view')?.classList.contains('active')) loadWorkspace();
    window.addEventListener('sulandra:entity-context-changed', () => {
      runtime.data = null;
      runtime.columns = [];
      runtime.drafts.clear();
      if ($('#flowsheets-view')?.classList.contains('active')) loadWorkspace();
    });
    window.SpireMasterFlowsheetGrid = Object.freeze({
      version: VERSION,
      refresh: () => loadWorkspace({ preserveColumns: true }),
      filePending,
      hasPending: () => runtime.drafts.size > 0,
      pendingCount: () => runtime.drafts.size,
      getState: () => ({ patientId: runtime.patientId, homeId: runtime.homeId, pending: runtime.drafts.size }),
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
