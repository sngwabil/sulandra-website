(() => {
  'use strict';

  // SPIRE_NOTE_COMPOSER_V2
  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const STYLE_ID = 'spireNoteComposerV2Style';
  const state = {
    patientId:'', catalog:null, identity:null, notes:[], identities:new Map(),
    selectedType:'', selectedTemplate:'', noteId:'', noteStatus:'', dirty:false,
    templateSnapshot:'', templateName:'', templateVersion:'', templateSource:'',
    pasteEvents:[], pastedCharacterCount:0, smartTextInserts:[], observerBusy:false,
  };

  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));
  const asArray = (value) => Array.isArray(value) ? value : [];
  const fmt = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '—';
  };

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
    if (token()) headers.set('Authorization', `Bearer ${token()}`);
    const response = await fetch(/^https?:\/\//i.test(path) ? path : API_BASE + path, { ...options, headers, cache:'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || payload?.error || payload?.message || `Request failed (${response.status})`);
    return payload?.data ?? payload;
  }

  function patientId() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return clean(hash.get('patient') || query.get('patientId') || sessionStorage.getItem('spire:patientId'));
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #notes-view[data-spire-note-composer-v2="1"]{padding:0!important;background:#edf3f7!important;overflow:hidden!important}
      #notes-view .snc-shell{height:100%;min-height:620px;display:grid;grid-template-columns:285px minmax(0,1fr);font-family:"Segoe UI",Arial,sans-serif;color:#19374c;background:#edf3f7}
      #notes-view .snc-left{border-right:1px solid #a9bdcc;background:#f4f8fb;display:flex;flex-direction:column;min-width:0}
      #notes-view .snc-left-head{padding:9px 10px;background:linear-gradient(#e7f1f8,#d6e6f1);border-bottom:1px solid #9fb6c7}
      #notes-view .snc-left-title{font-size:13px;font-weight:800;color:#123f61;display:flex;align-items:center;justify-content:space-between;gap:8px}
      #notes-view .snc-count{font-size:10px;padding:2px 6px;border:1px solid #93aec1;border-radius:10px;background:#fff;color:#48677d}
      #notes-view .snc-search{width:100%;box-sizing:border-box;margin-top:7px;border:1px solid #91a9bb;border-radius:3px;padding:5px 7px;font-size:11px;background:#fff}
      #notes-view .snc-note-list{flex:1;overflow:auto;padding:6px}
      #notes-view .snc-note-card{width:100%;text-align:left;border:1px solid #b5c5d2;border-radius:4px;background:#fff;margin-bottom:6px;padding:8px;cursor:pointer;color:#253f52}
      #notes-view .snc-note-card:hover,#notes-view .snc-note-card:focus{border-color:#2f739e;box-shadow:0 0 0 2px rgba(47,115,158,.12);outline:none}
      #notes-view .snc-note-card.active{border-color:#0b6094;background:#eaf5fc}
      #notes-view .snc-card-title{font-weight:800;font-size:11.5px;color:#173e5a;line-height:1.25}
      #notes-view .snc-card-meta{font-size:9.8px;color:#637889;margin-top:4px;line-height:1.35}
      #notes-view .snc-badge{display:inline-flex;align-items:center;border:1px solid #a8bbc9;border-radius:10px;padding:1px 6px;margin:3px 3px 0 0;background:#f7fafc;color:#506b7e;font-size:9px;font-weight:700}
      #notes-view .snc-badge.signed{background:#e2f3e7;border-color:#9bc8aa;color:#1b653a}
      #notes-view .snc-badge.draft{background:#fff4d9;border-color:#d4b56e;color:#7b5715}
      #notes-view .snc-badge.template{background:#e8f1ff;border-color:#9ab8db;color:#1c5685}
      #notes-view .snc-badge.paste{background:#fff0e6;border-color:#daa57e;color:#8a481b}
      #notes-view .snc-main{min-width:0;display:flex;flex-direction:column;overflow:hidden}
      #notes-view .snc-top{display:flex;align-items:center;gap:9px;padding:8px 12px;background:#eaf3fb;border-bottom:1px solid #a9bdcc}
      #notes-view .snc-avatar{width:34px;height:34px;border-radius:50%;background:#3e87dd;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;border:1px solid #b8d1ee}
      #notes-view .snc-user{font-weight:800;font-size:12px;color:#123f61}.snc-user-sub{font-size:10px;color:#6a7f8e;margin-top:2px}
      #notes-view .snc-top-actions{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}
      #notes-view .snc-btn{border:1px solid #7897ad;background:#eaf1f6;color:#173e59;border-radius:3px;padding:6px 9px;font-weight:700;font-size:10.5px;cursor:pointer}
      #notes-view .snc-btn:hover{background:#dceaf4}.snc-btn.primary{background:#075f99;color:#fff;border-color:#075f99}.snc-btn.sign{background:#166534;color:#fff;border-color:#166534}.snc-btn.warn{background:#fff5df;color:#80580e;border-color:#d0ae67}.snc-btn:disabled{opacity:.5;cursor:not-allowed}
      #notes-view .snc-compose{flex:1;overflow:auto;padding:10px 12px 16px;background:#f7f1df}
      #notes-view .snc-form-grid{display:grid;grid-template-columns:minmax(210px,.8fr) minmax(260px,1.2fr);gap:8px 10px;margin-bottom:8px}
      #notes-view .snc-field label{display:block;font-size:10px;font-weight:800;color:#3d5b70;margin-bottom:3px}
      #notes-view .snc-field select,#notes-view .snc-field input{width:100%;box-sizing:border-box;border:1px solid #879fb2;border-radius:3px;background:#fff;padding:6px 7px;font-size:11px;color:#19374c}
      #notes-view .snc-field select:disabled{background:#eef2f5;color:#8696a2}
      #notes-view .snc-template-hint{border:1px solid #adc0cf;background:#f6fbff;padding:6px 8px;border-radius:3px;font-size:10px;color:#506d80;margin-bottom:8px;min-height:16px}
      #notes-view .snc-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:7px;padding:6px;background:#e7edf1;border:1px solid #aebdc8;border-radius:3px}
      #notes-view .snc-toolbar select{min-width:190px;border:1px solid #8ca5b7;border-radius:3px;background:#fff;padding:5px;font-size:10px}
      #notes-view .snc-provenance{display:flex;gap:5px;flex-wrap:wrap;margin-left:auto}
      #notes-view .snc-editor{width:100%;min-height:390px;box-sizing:border-box;border:1px solid #7f9db9;border-radius:3px;background:#fff;padding:11px;font:12px/1.5 Consolas,"SFMono-Regular",monospace;color:#172b3b;resize:vertical}
      #notes-view .snc-status{margin-top:7px;padding:6px 8px;border:1px solid #c2ced7;background:#f8fafc;border-radius:3px;font-size:10px;color:#5b7080;min-height:15px}.snc-status.error{background:#fff0f0;border-color:#dca3a3;color:#9b1c1c}.snc-status.success{background:#ebf8ef;border-color:#a8d2b5;color:#17613a}
      #notes-view .snc-reader{flex:1;overflow:auto;padding:12px;background:#f7f1df}
      #notes-view .snc-reader-card{background:#fff;border:1px solid #aebdca;border-radius:4px;box-shadow:0 1px 3px rgba(15,23,42,.08);overflow:hidden}
      #notes-view .snc-reader-head{padding:10px 12px;background:#e6f0f7;border-bottom:1px solid #a8bac7}
      #notes-view .snc-reader-title{font-weight:800;font-size:14px;color:#123f61}.snc-reader-meta{font-size:10px;color:#607585;margin-top:4px}
      #notes-view .snc-tabs{display:flex;gap:0;border-bottom:1px solid #acbdc9;background:#f1f5f8;padding-left:8px}
      #notes-view .snc-tab{border:0;border-right:1px solid #c0ccd5;background:#e6edf2;color:#35566d;padding:7px 11px;font-size:10.5px;font-weight:800;cursor:pointer}.snc-tab.active{background:#fff;color:#075f99;border-top:2px solid #075f99}
      #notes-view .snc-reader-body{padding:12px;white-space:pre-wrap;font:11.5px/1.5 Consolas,"SFMono-Regular",monospace;min-height:250px;color:#263c4b}
      #notes-view .snc-audit-strip{padding:8px 12px;background:#f8fafc;border-top:1px solid #d2dce3;font-size:10px;color:#536a7a;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      #notes-view .snc-empty{padding:30px 18px;text-align:center;color:#63798a;font-size:11px}
      #notes-view .snc-section-heading{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#47657b;margin-bottom:6px}
      @media(max-width:900px){#notes-view .snc-shell{grid-template-columns:235px minmax(0,1fr)}#notes-view .snc-form-grid{grid-template-columns:1fr}#notes-view .snc-editor{min-height:330px}}
      @media(max-width:650px){#notes-view .snc-shell{grid-template-columns:1fr;grid-template-rows:180px minmax(0,1fr)}#notes-view .snc-left{border-right:0;border-bottom:1px solid #a9bdcc}.snc-note-list{display:flex;overflow:auto}.snc-note-card{min-width:210px;margin-right:6px}}
    `;
    document.head.appendChild(style);
  }

  function identityLabel(identity = {}) {
    const explicit = clean(identity.displayLabel);
    if (explicit) return explicit;
    const name = clean(identity.displayName || identity.name || identity.fullName || identity.email || 'Current user');
    const credentials = clean(identity.credentials || identity.credentialLabel);
    return credentials && !name.toUpperCase().endsWith(`, ${credentials.toUpperCase()}`) ? `${name}, ${credentials}` : name;
  }

  function initials(identity = {}) {
    const name = clean(identity.displayName || identity.name || identity.fullName || identity.email);
    return name.split(/\s+/).filter(Boolean).slice(0,2).map((part) => part[0]).join('').toUpperCase() || 'U';
  }

  async function hydrateIdentities() {
    const ids = [...new Set(state.notes.map((note) => clean(note.authorUserId || note.author)).filter(Boolean))];
    const missing = ids.filter((id) => !state.identities.has(id));
    if (!missing.length) return;
    try {
      const result = await api(`/api/spire/clinical-users?ids=${encodeURIComponent(missing.join(','))}`);
      const items = asArray(result?.items || result);
      items.forEach((item) => {
        const id = clean(item.id || item.userId);
        if (id) state.identities.set(id, item);
      });
    } catch {}
  }

  function authorLabel(note) {
    const id = clean(note?.authorUserId || note?.author);
    return state.identities.has(id) ? identityLabel(state.identities.get(id)) : id || 'Unknown author';
  }

  function provenanceAvailable(note) {
    const metadata = note?.compositionMetadata;
    return clean(metadata?.editorVersion) === 'SPIRE_NOTE_COMPOSER_V2' || clean(note?.templateSource) === 'SPIRE_NOTE_CATALOG' || clean(note?.templateSource) === 'SPIRE_SMARTTEXT';
  }

  function noteCard(note) {
    const signed = clean(note.status).toUpperCase() === 'SIGNED';
    const hasTemplate = Boolean(clean(note.templateName || note.templateId));
    const provenance = provenanceAvailable(note);
    return `<button type="button" class="snc-note-card${state.noteId === clean(note.id) ? ' active' : ''}" data-snc-note="${esc(note.id)}">
      <div class="snc-card-title">${esc(note.title || note.noteType || 'Clinical Note')}</div>
      <div class="snc-card-meta">${esc(fmt(note.signedAt || note.createdAt))}<br>${esc(authorLabel(note))}</div>
      <span class="snc-badge ${signed ? 'signed' : 'draft'}">${signed ? 'SIGNED' : 'DRAFT'}</span>
      ${hasTemplate ? `<span class="snc-badge template">Template</span>` : ''}
      ${provenance && note.pasteDetected ? `<span class="snc-badge paste">Paste observed</span>` : ''}
    </button>`;
  }

  function renderLeft(filter = '') {
    const host = document.querySelector('#notes-view .snc-note-list');
    if (!host) return;
    const needle = clean(filter).toLowerCase();
    const notes = state.notes.filter((note) => !needle || `${note.title || ''} ${note.noteType || ''} ${authorLabel(note)}`.toLowerCase().includes(needle));
    host.innerHTML = notes.length ? notes.map(noteCard).join('') : '<div class="snc-empty">No notes match this view.</div>';
    host.querySelectorAll('[data-snc-note]').forEach((button) => button.addEventListener('click', () => openReader(button.dataset.sncNote)));
    const countNode = document.querySelector('#notes-view .snc-count');
    if (countNode) countNode.textContent = `${state.notes.length}`;
  }

  function catalogTypes() { return asArray(state.catalog?.noteTypes); }
  function selectedType() { return catalogTypes().find((type) => clean(type.code) === state.selectedType) || null; }
  function selectedTemplate() { return asArray(selectedType()?.templates).find((item) => clean(item.id) === state.selectedTemplate) || null; }

  function resetComposition() {
    state.noteId = '';
    state.noteStatus = '';
    state.selectedType = '';
    state.selectedTemplate = '';
    state.templateSnapshot = '';
    state.templateName = '';
    state.templateVersion = '';
    state.templateSource = '';
    state.pasteEvents = [];
    state.pastedCharacterCount = 0;
    state.smartTextInserts = [];
    state.dirty = false;
  }

  function status(message = '', kind = '') {
    const node = document.querySelector('#notes-view .snc-status');
    if (!node) return;
    node.textContent = message;
    node.className = `snc-status${kind ? ` ${kind}` : ''}`;
  }

  function updateProvenanceBadges() {
    const host = document.querySelector('#notes-view .snc-provenance');
    if (!host) return;
    host.innerHTML = `${state.templateName ? `<span class="snc-badge template">Template: ${esc(state.templateName)}</span>` : '<span class="snc-badge">No primary template</span>'}
      ${state.pasteEvents.length ? `<span class="snc-badge paste">Paste observed: ${state.pasteEvents.length} event${state.pasteEvents.length === 1 ? '' : 's'} · ${state.pastedCharacterCount} chars</span>` : '<span class="snc-badge">No paste observed</span>'}`;
  }

  function populateTemplates() {
    const select = document.getElementById('sncTemplate');
    const type = selectedType();
    if (!select) return;
    const templates = asArray(type?.templates);
    select.disabled = !type;
    select.innerHTML = !type ? '<option value="">Select a note type first…</option>' : `<option value="">Select a template (${templates.length} available)…</option>${templates.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}`;
    select.value = state.selectedTemplate;
    const hint = document.querySelector('#notes-view .snc-template-hint');
    if (hint) hint.textContent = type ? `${type.label} · ${templates.length} organized template${templates.length === 1 ? '' : 's'} available. Choose one to populate the note, or use Blank Note.` : 'Select the note type first. SPIRE will then show only templates organized for that documentation type.';
  }

  function applyTemplate(templateId) {
    state.selectedTemplate = clean(templateId);
    const template = selectedTemplate();
    const textarea = document.getElementById('sncBody');
    if (!template || !textarea) return;
    if (state.dirty && clean(textarea.value) && textarea.value !== state.templateSnapshot && !window.confirm('Replace the current note text with this template?')) {
      state.selectedTemplate = '';
      const select = document.getElementById('sncTemplate'); if (select) select.value = '';
      return;
    }
    state.templateSnapshot = String(template.body || '');
    state.templateName = clean(template.name);
    state.templateVersion = clean(template.version || state.catalog?.catalogVersion || '2026.08.15');
    state.templateSource = 'SPIRE_NOTE_CATALOG';
    textarea.value = state.templateSnapshot;
    const title = document.getElementById('sncTitle');
    if (title && !clean(title.value)) title.value = state.templateName;
    state.dirty = true;
    updateProvenanceBadges();
    const hint = document.querySelector('#notes-view .snc-template-hint');
    if (hint) hint.textContent = `${template.name}: ${template.description || 'Structured documentation template.'} Replace each bracketed prompt with individualized documentation.`;
    textarea.focus();
  }

  function blankNote() {
    const textarea = document.getElementById('sncBody');
    if (state.dirty && clean(textarea?.value) && !window.confirm('Clear the current template/text and start a blank note?')) return;
    state.selectedTemplate = '';
    state.templateSnapshot = '';
    state.templateName = '';
    state.templateVersion = '';
    state.templateSource = '';
    if (textarea) textarea.value = '';
    const select = document.getElementById('sncTemplate'); if (select) select.value = '';
    state.dirty = true;
    updateProvenanceBadges();
    status('Blank note selected. The note type still organizes this document, but no primary template will be stored.');
    textarea?.focus();
  }

  function insertSmartText(id) {
    const item = asArray(state.catalog?.smartTexts).find((entry) => clean(entry.id) === clean(id));
    const textarea = document.getElementById('sncBody');
    if (!item || !textarea) return;
    const start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length;
    const end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : start;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const insertion = String(item.body || '');
    textarea.value = `${before}${before && !before.endsWith('\n') ? '\n' : ''}${insertion}${after && !after.startsWith('\n') ? '\n' : ''}${after}`;
    state.smartTextInserts.push({ id:clean(item.id), name:clean(item.name), insertedAt:new Date().toISOString() });
    state.dirty = true;
    updateProvenanceBadges();
    status(`Inserted SmartText ${item.name}. It will be recorded in composition provenance.`);
    textarea.focus();
  }

  function compositionPayload() {
    const body = String(document.getElementById('sncBody')?.value || '').trim();
    const title = clean(document.getElementById('sncTitle')?.value);
    return {
      noteType: state.selectedType || 'PROGRESS_NOTE',
      title: title || selectedType()?.label || state.templateName || 'Clinical Note',
      body,
      templateId: state.selectedTemplate || null,
      templateName: state.templateName || null,
      templateVersion: state.templateVersion || null,
      templateSource: state.templateSource || null,
      templateSnapshot: state.templateSnapshot || null,
      pasteDetected: state.pasteEvents.length > 0,
      pasteEventCount: state.pasteEvents.length,
      pastedCharacterCount: state.pastedCharacterCount,
      compositionMetadata: {
        editorVersion:'SPIRE_NOTE_COMPOSER_V2',
        catalogVersion:clean(state.catalog?.catalogVersion),
        primaryTemplateApplied:Boolean(state.templateName),
        templateAppliedAt:state.templateName ? (state.templateAppliedAt || new Date().toISOString()) : null,
        pasteEvents:state.pasteEvents,
        smartTextInserts:state.smartTextInserts,
        provenanceNotice:'Paste events represent paste actions observed inside the SPIRE note editor during this composition session.',
      },
    };
  }

  function unresolvedPromptCount(body) {
    return (String(body || '').match(/\[(?:Enter|Select|Document|Describe|Add|If applicable)[^\]]*\]/gi) || []).length;
  }

  async function save(signAfter = false) {
    const payload = compositionPayload();
    if (!clean(payload.body)) return status('Enter clinical documentation before saving.', 'error');
    if (!state.selectedType) return status('Select the note type before saving.', 'error');
    const unresolved = unresolvedPromptCount(payload.body);
    if (signAfter && unresolved && !window.confirm(`This note still contains ${unresolved} unresolved template prompt${unresolved === 1 ? '' : 's'}. Sign and file it anyway?`)) return;

    const buttons = [...document.querySelectorAll('#notes-view .snc-btn')];
    buttons.forEach((button) => { button.disabled = true; });
    status(signAfter ? 'Saving and signing note…' : 'Saving draft…');
    try {
      let id = state.noteId;
      if (!id) {
        const created = await api(`/api/spire/patients/${encodeURIComponent(state.patientId)}/note-composer/notes`, {
          method:'POST', body:JSON.stringify({ ...payload, sign:signAfter }),
        });
        id = clean(created?.id);
      } else {
        await api(`/api/spire/patients/${encodeURIComponent(state.patientId)}/note-composer/notes/${encodeURIComponent(id)}`, {
          method:'PUT', body:JSON.stringify(payload),
        });
        if (signAfter) {
          await api(`/api/spire/patients/${encodeURIComponent(state.patientId)}/note-composer/notes/${encodeURIComponent(id)}/sign`, { method:'POST', body:JSON.stringify({}) });
        }
      }
      if (!id) throw new Error('SPIRE did not return a note identifier');
      state.dirty = false;
      status(signAfter ? 'Note signed and filed with composition provenance.' : 'Draft saved with composition provenance.', 'success');
      await loadNotes();
      if (signAfter) openReader(id); else { state.noteId = id; renderLeft(); }
    } catch (error) {
      status(error?.message || 'Unable to save note.', 'error');
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function renderComposer() {
    const main = document.querySelector('#notes-view .snc-main');
    if (!main) return;
    const identity = state.identity || {};
    const smartTexts = asArray(state.catalog?.smartTexts);
    main.innerHTML = `<div class="snc-top">
      <div class="snc-avatar">${esc(initials(identity))}</div>
      <div><div class="snc-user">${esc(identityLabel(identity))}</div><div class="snc-user-sub">New clinical note · Type → Template → Individualize → File</div></div>
      <div class="snc-top-actions"><button type="button" class="snc-btn" id="sncBlank">Blank Note</button><button type="button" class="snc-btn primary" id="sncSave">Save Draft</button><button type="button" class="snc-btn sign" id="sncSign">Sign & File</button></div>
    </div>
    <div class="snc-compose">
      <div class="snc-form-grid">
        <div class="snc-field"><label for="sncType">1 · NOTE TYPE</label><select id="sncType"><option value="">Select note type…</option>${catalogTypes().map((type) => `<option value="${esc(type.code)}">${esc(type.category)} — ${esc(type.label)}</option>`).join('')}</select></div>
        <div class="snc-field"><label for="sncTemplate">2 · TEMPLATE</label><select id="sncTemplate" disabled><option value="">Select a note type first…</option></select></div>
        <div class="snc-field" style="grid-column:1/-1"><label for="sncTitle">NOTE SUBJECT / TITLE</label><input id="sncTitle" maxlength="250" placeholder="Note subject"></div>
      </div>
      <div class="snc-template-hint">Select the note type first. SPIRE will then show only templates organized for that documentation type.</div>
      <div class="snc-toolbar">
        <b style="font-size:10px;color:#3e5c70">SmartText:</b>
        <select id="sncSmartText" ${smartTexts.length ? '' : 'disabled'}><option value="">${smartTexts.length ? `Insert reusable SmartText (${smartTexts.length})…` : 'No personal/organization SmartText available'}</option>${smartTexts.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}${item.organizationWide ? ' · Organization' : ' · Personal'}</option>`).join('')}</select>
        <span style="font-size:9.5px;color:#627786">SmartText inserts are recorded separately from the primary note template.</span>
        <div class="snc-provenance"></div>
      </div>
      <textarea class="snc-editor" id="sncBody" spellcheck="true" placeholder="Select a template above or use Blank Note. Template prompts will populate here automatically."></textarea>
      <div class="snc-status">Choose a note type to begin.</div>
    </div>`;
    const type = document.getElementById('sncType');
    type.value = state.selectedType;
    type.addEventListener('change', () => {
      state.selectedType = clean(type.value);
      state.selectedTemplate = '';
      state.templateSnapshot = ''; state.templateName = ''; state.templateVersion = ''; state.templateSource = '';
      populateTemplates(); updateProvenanceBadges();
      if (state.selectedType) status(`${selectedType()?.label || 'Note type'} selected. Now choose an organized template or Blank Note.`);
    });
    document.getElementById('sncTemplate')?.addEventListener('change', (event) => applyTemplate(event.target.value));
    document.getElementById('sncSmartText')?.addEventListener('change', (event) => {
      const id = event.target.value; if (id) insertSmartText(id); event.target.value = '';
    });
    document.getElementById('sncBlank')?.addEventListener('click', blankNote);
    document.getElementById('sncSave')?.addEventListener('click', () => void save(false));
    document.getElementById('sncSign')?.addEventListener('click', () => void save(true));
    document.getElementById('sncBody')?.addEventListener('input', () => { state.dirty = true; });
    document.getElementById('sncTitle')?.addEventListener('input', () => { state.dirty = true; });
    document.getElementById('sncBody')?.addEventListener('paste', (event) => {
      const pastedText = event.clipboardData?.getData('text/plain') || '';
      state.pasteEvents.push({ observedAt:new Date().toISOString(), characterCount:pastedText.length });
      state.pastedCharacterCount += pastedText.length;
      state.dirty = true;
      setTimeout(updateProvenanceBadges, 0);
    });
    populateTemplates(); updateProvenanceBadges();
  }

  function readerBody(note, mode) {
    if (mode === 'template') return clean(note.templateSnapshot) || 'No primary template snapshot is stored for this note.';
    if (mode === 'authored') {
      if (!provenanceAvailable(note)) return 'Authored-only reconstruction is unavailable for this legacy note because composition provenance was not captured when it was filed.';
      return clean(note.authoredBody) || 'No text distinct from the stored primary template was identified.';
    }
    return clean(note.body) || 'No note text available.';
  }

  function openReader(noteId, mode = 'final') {
    const note = state.notes.find((item) => clean(item.id) === clean(noteId));
    if (!note) return;
    state.noteId = clean(note.id);
    state.noteStatus = clean(note.status);
    renderLeft(document.querySelector('#notes-view .snc-search')?.value || '');
    const main = document.querySelector('#notes-view .snc-main');
    if (!main) return;
    const signed = clean(note.status).toUpperCase() === 'SIGNED';
    const provenance = provenanceAvailable(note);
    const hasTemplate = Boolean(clean(note.templateName || note.templateId));
    const ownDraft = !signed && clean(note.authorUserId || note.author) === clean(state.identity?.id || state.identity?.userId);
    main.innerHTML = `<div class="snc-top">
      <div class="snc-avatar">${esc(initials(state.identities.get(clean(note.authorUserId || note.author)) || {}))}</div>
      <div><div class="snc-user">${esc(authorLabel(note))}</div><div class="snc-user-sub">${signed ? `Signed ${esc(fmt(note.signedAt))}` : `Draft · updated ${esc(fmt(note.updatedAt || note.createdAt))}`}</div></div>
      <div class="snc-top-actions"><button type="button" class="snc-btn" id="sncNewFromReader">New Note</button>${ownDraft ? '<button type="button" class="snc-btn primary" id="sncEditDraft">Edit Draft</button>' : ''}</div>
    </div>
    <div class="snc-reader"><div class="snc-reader-card">
      <div class="snc-reader-head"><div class="snc-reader-title">${esc(note.title || note.noteType || 'Clinical Note')}</div><div class="snc-reader-meta">${esc(note.noteType || 'Clinical note')} · ${esc(authorLabel(note))} · ${esc(fmt(note.signedAt || note.createdAt))}</div>
        <div><span class="snc-badge ${signed ? 'signed' : 'draft'}">${signed ? 'SIGNED' : 'DRAFT'}</span>${hasTemplate ? `<span class="snc-badge template">Template: ${esc(note.templateName || note.templateId)}</span>` : '<span class="snc-badge">No primary template</span>'}${provenance && note.pasteDetected ? `<span class="snc-badge paste">Paste observed: ${Number(note.pasteEventCount || 0)} event${Number(note.pasteEventCount || 0) === 1 ? '' : 's'} · ${Number(note.pastedCharacterCount || 0)} chars</span>` : provenance ? '<span class="snc-badge">No paste observed in SPIRE editor</span>' : '<span class="snc-badge">Legacy composition provenance unavailable</span>'}</div>
      </div>
      <div class="snc-tabs"><button type="button" class="snc-tab ${mode === 'final' ? 'active' : ''}" data-snc-mode="final">Final Filed Note</button><button type="button" class="snc-tab ${mode === 'authored' ? 'active' : ''}" data-snc-mode="authored">Authored Only</button><button type="button" class="snc-tab ${mode === 'template' ? 'active' : ''}" data-snc-mode="template">Template</button></div>
      <div class="snc-reader-body">${esc(readerBody(note, mode))}</div>
      <div class="snc-audit-strip"><b>Composition audit:</b>${provenance ? `<span>Template ${hasTemplate ? 'captured' : 'not used'}</span><span>·</span><span>${note.pasteDetected ? 'Paste action observed' : 'No paste action observed during captured SPIRE session'}</span><span>·</span><span>Version ${Number(note.currentVersion || 1)}</span>` : '<span>This note predates SPIRE Note Composer V2 provenance capture.</span>'}</div>
    </div></div>`;
    main.querySelectorAll('[data-snc-mode]').forEach((button) => button.addEventListener('click', () => openReader(note.id, button.dataset.sncMode)));
    document.getElementById('sncNewFromReader')?.addEventListener('click', newNote);
    document.getElementById('sncEditDraft')?.addEventListener('click', () => editDraft(note));
  }

  function editDraft(note) {
    resetComposition();
    state.noteId = clean(note.id);
    state.noteStatus = clean(note.status);
    state.selectedType = clean(note.noteType || 'PROGRESS_NOTE');
    state.selectedTemplate = clean(note.templateId);
    state.templateSnapshot = String(note.templateSnapshot || '');
    state.templateName = clean(note.templateName);
    state.templateVersion = clean(note.templateVersion);
    state.templateSource = clean(note.templateSource);
    const metadata = note.compositionMetadata && typeof note.compositionMetadata === 'object' ? note.compositionMetadata : {};
    state.pasteEvents = asArray(metadata.pasteEvents);
    state.pastedCharacterCount = Number(note.pastedCharacterCount || 0);
    state.smartTextInserts = asArray(metadata.smartTextInserts);
    renderComposer();
    const body = document.getElementById('sncBody'); if (body) body.value = String(note.body || '');
    const title = document.getElementById('sncTitle'); if (title) title.value = clean(note.title);
    const template = document.getElementById('sncTemplate'); if (template) template.value = state.selectedTemplate;
    state.dirty = false;
    updateProvenanceBadges();
    status('Editing draft. Saving creates a new immutable note version; signing files the latest version.');
  }

  function newNote() {
    if (state.dirty && !window.confirm('Discard unsaved note changes?')) return;
    resetComposition();
    renderLeft(document.querySelector('#notes-view .snc-search')?.value || '');
    renderComposer();
  }

  async function loadNotes() {
    if (!state.patientId) return;
    const result = await api(`/api/spire/patients/${encodeURIComponent(state.patientId)}/note-composer/notes`);
    state.notes = asArray(result?.items || result);
    await hydrateIdentities();
    renderLeft(document.querySelector('#notes-view .snc-search')?.value || '');
  }

  async function loadData() {
    const [catalog, identity] = await Promise.all([
      api('/api/spire/note-composer/catalog'),
      api('/api/spire/clinical-identity'),
    ]);
    state.catalog = catalog || { noteTypes:[], smartTexts:[] };
    state.identity = identity || {};
    const identityId = clean(identity?.id || identity?.userId); if (identityId) state.identities.set(identityId, identity);
    await loadNotes();
  }

  function shell() {
    return `<div class="snc-shell">
      <aside class="snc-left"><div class="snc-left-head"><div class="snc-left-title"><span>Clinical Notes</span><span class="snc-count">0</span></div><input class="snc-search" type="search" placeholder="Search notes, type, author…"></div><div class="snc-note-list"><div class="snc-empty">Loading clinical notes…</div></div></aside>
      <section class="snc-main"><div class="snc-empty">Loading note composer…</div></section>
    </div>`;
  }

  async function enhance(force = false) {
    const host = document.getElementById('notes-view');
    if (!host) return;
    const pid = patientId();
    if (!pid) return;
    const already = host.dataset.spireNoteComposerV2 === '1' && host.querySelector('.snc-shell');
    if (already && !force && state.patientId === pid) return;
    installStyle();
    state.patientId = pid;
    host.dataset.spireNoteComposerV2 = '1';
    host.innerHTML = shell();
    host.querySelector('.snc-search')?.addEventListener('input', (event) => renderLeft(event.target.value));
    try {
      await loadData();
      resetComposition();
      renderComposer();
    } catch (error) {
      const main = host.querySelector('.snc-main');
      if (main) main.innerHTML = `<div class="snc-empty"><b>Unable to load SPIRE Notes.</b><br>${esc(error?.message || 'Unknown error')}</div>`;
    }
  }

  let timer = 0;
  function queueEnhance(force = false) {
    clearTimeout(timer);
    timer = setTimeout(() => void enhance(force), 80);
  }

  const observer = new MutationObserver((mutations) => {
    const host = document.getElementById('notes-view');
    if (!host) return;
    if (host.dataset.spireNoteComposerV2 === '1' && host.querySelector('.snc-shell')) return;
    if (mutations.some((mutation) => mutation.target === host || host.contains(mutation.target))) queueEnhance(false);
  });

  const start = () => {
    observer.observe(document.body, { childList:true, subtree:true });
    queueEnhance(false);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
  window.addEventListener('hashchange', () => queueEnhance(true));
  window.addEventListener('popstate', () => queueEnhance(true));

  window.createNewNote = () => { void enhance(false).then(newNote); };
  window.SpireNoteComposerV2 = Object.freeze({ version:'20260815-note-composer-v2-1', refresh:() => queueEnhance(true), newNote });
})();
