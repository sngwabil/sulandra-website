(() => {
  'use strict';

  // SPIRE_NOTE_TEMPLATE_WORKFLOW_V1
  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const MODAL_ID = 'spireNoteTemplateWorkflow';
  const STYLE_ID = 'spireNoteTemplateWorkflowStyle';
  let catalog = [];
  let selectedType = null;
  let selectedTemplate = null;
  let busy = false;

  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function token() {
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of TOKEN_KEYS) {
        const value = storage.getItem(key);
        if (value) return value;
      }
    }
    return '';
  }

  async function api(path, options = {}) {
    if (typeof window.api === 'function') return window.api(path, options);
    const headers = new Headers(options.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (options.body != null && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token() && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token()}`);
    const response = await fetch(/^https?:\/\//i.test(path) ? path : API_BASE + path, {
      ...options, headers, cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || payload?.error || payload?.message || `Request failed (${response.status})`);
    return payload?.data ?? payload;
  }

  function patientId() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return clean(query.get('patientId') || hash.get('patient') || sessionStorage.getItem('spire:patientId'));
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${MODAL_ID}{position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,.58);display:none;align-items:center;justify-content:center;padding:20px;font-family:"Segoe UI",Arial,sans-serif;color:#172b3b}
      #${MODAL_ID}.open{display:flex}
      #${MODAL_ID} .snw-card{width:min(940px,96vw);height:min(760px,92vh);background:#fff;border:1px solid #537a9a;border-radius:6px;box-shadow:0 18px 60px rgba(15,23,42,.38);display:flex;flex-direction:column;overflow:hidden}
      #${MODAL_ID} .snw-head{display:flex;align-items:center;gap:10px;background:#0b4f7d;color:#fff;padding:10px 14px;font-weight:800}
      #${MODAL_ID} .snw-head-title{font-size:16px} #${MODAL_ID} .snw-head-sub{font-size:11px;font-weight:500;opacity:.9}
      #${MODAL_ID} .snw-close{margin-left:auto;border:1px solid rgba(255,255,255,.6);background:transparent;color:#fff;border-radius:3px;padding:4px 8px;cursor:pointer}
      #${MODAL_ID} .snw-body{flex:1;min-height:0;overflow:auto;padding:14px;background:#eef4f8}
      #${MODAL_ID} .snw-step{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#45647d;margin-bottom:8px}
      #${MODAL_ID} .snw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      #${MODAL_ID} .snw-choice{border:1px solid #9bb3c7;background:#fff;border-radius:5px;padding:11px;text-align:left;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.05)}
      #${MODAL_ID} .snw-choice:hover,#${MODAL_ID} .snw-choice:focus{border-color:#0b6ca8;box-shadow:0 0 0 2px rgba(11,108,168,.14)}
      #${MODAL_ID} .snw-choice b{display:block;color:#123f61;font-size:13px;margin-bottom:3px} #${MODAL_ID} .snw-choice span{font-size:11px;color:#5c7080;line-height:1.35}
      #${MODAL_ID} .snw-category{font-size:10px!important;font-weight:800;color:#0b6ca8!important;text-transform:uppercase;letter-spacing:.03em}
      #${MODAL_ID} .snw-editor{display:grid;grid-template-rows:auto 1fr;gap:9px;height:100%}
      #${MODAL_ID} .snw-editor input,#${MODAL_ID} .snw-editor textarea{width:100%;border:1px solid #7f9db9;border-radius:3px;background:#fff;color:#172b3b;font:12px/1.45 "Segoe UI",Arial,sans-serif;padding:8px;box-sizing:border-box}
      #${MODAL_ID} .snw-editor textarea{min-height:440px;resize:vertical;font-family:Consolas,"SFMono-Regular",monospace}
      #${MODAL_ID} .snw-label{display:block;font-size:11px;font-weight:800;color:#294d66;margin-bottom:4px}
      #${MODAL_ID} .snw-foot{display:flex;align-items:center;gap:8px;padding:9px 12px;background:#f8fafc;border-top:1px solid #c7d4df}
      #${MODAL_ID} .snw-status{font-size:11px;font-weight:700;color:#526b7c;flex:1} #${MODAL_ID} .snw-status.error{color:#a11220} #${MODAL_ID} .snw-status.success{color:#166534}
      #${MODAL_ID} .snw-btn{border:1px solid #6f8da6;background:#e7eff6;color:#173d59;border-radius:3px;padding:6px 11px;font-weight:700;cursor:pointer} #${MODAL_ID} .snw-btn.primary{background:#075f99;color:#fff;border-color:#075f99} #${MODAL_ID} .snw-btn.sign{background:#146b3a;color:#fff;border-color:#146b3a} #${MODAL_ID} .snw-btn:disabled{opacity:.5;cursor:not-allowed}
      #${MODAL_ID} .snw-empty{padding:24px;border:1px dashed #9bb3c7;background:#fff;color:#5c7080;text-align:center}
      @media(max-width:720px){#${MODAL_ID}{padding:6px}#${MODAL_ID} .snw-grid{grid-template-columns:1fr}#${MODAL_ID} .snw-editor textarea{min-height:340px}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    installStyle();
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'New clinical note');
    modal.innerHTML = `
      <section class="snw-card">
        <header class="snw-head"><div><div class="snw-head-title">New Clinical Note</div><div class="snw-head-sub" id="snwBreadcrumb">Choose a note type, then a template</div></div><button class="snw-close" type="button" data-snw-close>Close</button></header>
        <main class="snw-body" id="snwBody"></main>
        <footer class="snw-foot"><button class="snw-btn" type="button" id="snwBack" hidden>Back</button><span class="snw-status" id="snwStatus"></span><button class="snw-btn primary" type="button" id="snwSave" hidden>Save Draft</button><button class="snw-btn sign" type="button" id="snwSign" hidden>Sign & Close</button></footer>
      </section>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-snw-close]')?.addEventListener('click', close);
    modal.addEventListener('pointerdown', (event) => { if (event.target === modal && !busy) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('open') && !busy) close(); });
    modal.querySelector('#snwBack')?.addEventListener('click', goBack);
    modal.querySelector('#snwSave')?.addEventListener('click', () => persist(false));
    modal.querySelector('#snwSign')?.addEventListener('click', () => persist(true));
    return modal;
  }

  function status(message = '', type = '') {
    const node = document.querySelector(`#${MODAL_ID} #snwStatus`);
    if (!node) return;
    node.textContent = message;
    node.className = `snw-status${type ? ` ${type}` : ''}`;
  }

  function setActions({ back = false, save = false, sign = false } = {}) {
    const modal = ensureModal();
    const backButton = modal.querySelector('#snwBack');
    const saveButton = modal.querySelector('#snwSave');
    const signButton = modal.querySelector('#snwSign');
    if (backButton) backButton.hidden = !back;
    if (saveButton) saveButton.hidden = !save;
    if (signButton) signButton.hidden = !sign;
  }

  function setBreadcrumb(text) {
    const node = document.querySelector(`#${MODAL_ID} #snwBreadcrumb`);
    if (node) node.textContent = text;
  }

  function renderTypes() {
    selectedType = null;
    selectedTemplate = null;
    setActions();
    setBreadcrumb('Step 1 of 3 · Choose note type');
    status('Templates are selected after the note type.');
    const body = document.querySelector(`#${MODAL_ID} #snwBody`);
    if (!body) return;
    if (!catalog.length) {
      body.innerHTML = '<div class="snw-empty"><b>No note types are available.</b><br>Refresh the chart or contact the SPIRE administrator.</div>';
      return;
    }
    body.innerHTML = `<div class="snw-step">1 · Note Type</div><div class="snw-grid">${catalog.map((type, index) => `
      <button type="button" class="snw-choice" data-snw-type="${index}"><span class="snw-category">${esc(type.category || 'Clinical')}</span><b>${esc(type.label || type.code)}</b><span>${esc((type.templates || []).length)} template${(type.templates || []).length === 1 ? '' : 's'} available</span></button>`).join('')}</div>`;
    body.querySelectorAll('[data-snw-type]').forEach((button) => button.addEventListener('click', () => {
      selectedType = catalog[Number(button.dataset.snwType)] || null;
      renderTemplates();
    }));
  }

  function renderTemplates() {
    if (!selectedType) return renderTypes();
    selectedTemplate = null;
    setActions({ back: true });
    setBreadcrumb(`Step 2 of 3 · ${selectedType.label || selectedType.code} · Choose template`);
    status('Choose a structured template or start a blank note.');
    const body = document.querySelector(`#${MODAL_ID} #snwBody`);
    if (!body) return;
    const templates = Array.isArray(selectedType.templates) ? selectedType.templates : [];
    body.innerHTML = `<div class="snw-step">2 · Note Template</div><div class="snw-grid">
      ${templates.map((item, index) => `<button type="button" class="snw-choice" data-snw-template="${index}"><b>${esc(item.name || 'Template')}</b><span>${esc(item.description || 'Structured note template')}</span></button>`).join('')}
      <button type="button" class="snw-choice" data-snw-blank><b>Blank ${esc(selectedType.label || 'Note')}</b><span>Start without prewritten headings.</span></button>
    </div>`;
    body.querySelectorAll('[data-snw-template]').forEach((button) => button.addEventListener('click', () => {
      selectedTemplate = templates[Number(button.dataset.snwTemplate)] || null;
      renderEditor();
    }));
    body.querySelector('[data-snw-blank]')?.addEventListener('click', () => {
      selectedTemplate = { id: 'blank', name: selectedType.label || 'Clinical Note', body: '' };
      renderEditor();
    });
  }

  function renderEditor() {
    if (!selectedType || !selectedTemplate) return renderTemplates();
    setActions({ back: true, save: true, sign: true });
    setBreadcrumb(`Step 3 of 3 · ${selectedType.label || selectedType.code} · ${selectedTemplate.name || 'Template'}`);
    status('Review and individualize the note before saving or signing.');
    const body = document.querySelector(`#${MODAL_ID} #snwBody`);
    if (!body) return;
    const title = selectedTemplate.name || selectedType.label || 'Clinical Note';
    body.innerHTML = `<div class="snw-step">3 · Document</div><div class="snw-editor">
      <div><label class="snw-label" for="snwTitle">Note Title</label><input id="snwTitle" maxlength="250" value="${esc(title)}"></div>
      <div><label class="snw-label" for="snwText">Note Body</label><textarea id="snwText" maxlength="100000" spellcheck="true">${esc(selectedTemplate.body || '')}</textarea></div>
    </div>`;
    body.querySelector('#snwText')?.focus();
  }

  function goBack() {
    if (busy) return;
    if (selectedTemplate) {
      selectedTemplate = null;
      return renderTemplates();
    }
    if (selectedType) return renderTypes();
  }

  function setBusy(value) {
    busy = value;
    document.querySelectorAll(`#${MODAL_ID} button`).forEach((button) => { button.disabled = value; });
  }

  async function refreshNotes() {
    try {
      if (typeof window.loadNotesView === 'function') await window.loadNotesView();
    } catch {}
  }

  async function persist(signAfterSave) {
    if (busy || !selectedType) return;
    const pid = patientId();
    if (!pid) return status('Open a patient chart before creating a note.', 'error');
    const title = clean(document.querySelector(`#${MODAL_ID} #snwTitle`)?.value);
    const body = clean(document.querySelector(`#${MODAL_ID} #snwText`)?.value);
    if (!body) return status('Enter clinical documentation before saving.', 'error');

    setBusy(true);
    status(signAfterSave ? 'Saving draft and signing…' : 'Saving draft…');
    let noteId = '';
    try {
      const created = await api(`/api/spire/patients/${encodeURIComponent(pid)}/notes`, {
        method: 'POST',
        body: JSON.stringify({ noteType: selectedType.code || 'PROGRESS_NOTE', title: title || selectedType.label || null, body }),
      });
      noteId = clean(created?.id || created?.noteId);
      if (!noteId) throw new Error('SPIRE did not return the new note identifier');
      if (signAfterSave) {
        try {
          await api(`/api/spire/patients/${encodeURIComponent(pid)}/notes/${encodeURIComponent(noteId)}/sign`, {
            method: 'POST', body: JSON.stringify({}),
          });
        } catch (signError) {
          throw new Error(`Draft saved, but signing did not complete: ${signError.message}`);
        }
      }
      status(signAfterSave ? 'Note signed.' : 'Draft saved.', 'success');
      await refreshNotes();
      setTimeout(close, 250);
    } catch (error) {
      status(error?.message || 'Unable to save note.', 'error');
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  function close() {
    if (busy) return;
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.classList.remove('open');
    selectedType = null;
    selectedTemplate = null;
    status('');
  }

  async function open() {
    const pid = patientId();
    if (!pid) {
      alert('Open a patient chart before creating a note.');
      return;
    }
    const modal = ensureModal();
    modal.classList.add('open');
    setActions();
    setBreadcrumb('Loading note types and templates…');
    status('Loading server-backed note templates…');
    const body = modal.querySelector('#snwBody');
    if (body) body.innerHTML = '<div class="snw-empty">Loading note types and templates…</div>';
    try {
      const data = await api('/api/spire/note-types');
      catalog = Array.isArray(data?.noteTypes) ? data.noteTypes : Array.isArray(data?.items) ? data.items : [];
      renderTypes();
    } catch (error) {
      catalog = [];
      if (body) body.innerHTML = `<div class="snw-empty"><b>Note templates could not be loaded.</b><br>${esc(error?.message || 'Unknown error')}</div>`;
      setBreadcrumb('Note template service unavailable');
      status('Unable to load note templates.', 'error');
    }
  }

  window.createNewNote = open;
  window.SpireNoteWorkflow = Object.freeze({ version: '20260815-note-template-workflow-1', open, close });
})();
