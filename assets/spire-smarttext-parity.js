(() => {
  'use strict';

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const state = { data: null, timer: 0 };

  const token = () =>
    TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const exactText = (node) => String(node?.childNodes?.[0]?.textContent || node?.textContent || '').trim();

  async function api(path, options = {}) {
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data ?? payload;
  }

  function toast(message, error = false) {
    let node = document.getElementById('spireSmartTextToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'spireSmartTextToast';
      document.body.appendChild(node);
    }
    node.className = `spire-smarttext-toast${error ? ' error' : ''}`;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => { node.hidden = true; }, 3200);
  }

  async function load(force = false) {
    if (!state.data || force) state.data = await api('/api/spire/tools/smarttexts');
    return state.data;
  }

  async function openManager() {
    try {
      const data = await load(true);
      document.getElementById('spireSmartTextModal')?.remove();
      const host = document.createElement('div');
      host.id = 'spireSmartTextModal';
      host.className = 'spire-smarttext-modal';
      host.innerHTML = `
        <div class="spire-smarttext-dialog" role="dialog" aria-modal="true" aria-labelledby="spireSmartTextTitle">
          <header>
            <div><strong id="spireSmartTextTitle">SmartText Manager</strong><span>Reusable structured documentation blocks</span></div>
            <button type="button" data-close aria-label="Close">×</button>
          </header>
          <div class="spire-smarttext-layout">
            <section>
              <div class="spire-smarttext-list-head"><strong>Available SmartText</strong><input id="spireSmartTextSearch" type="search" placeholder="Search"></div>
              <div id="spireSmartTextList" class="spire-smarttext-list"></div>
            </section>
            <aside>
              <div class="spire-smarttext-editor-head"><strong id="spireSmartTextEditorTitle">Create SmartText</strong><button type="button" id="spireSmartTextNew">New</button></div>
              <input id="spireSmartTextId" type="hidden">
              <label>Name<input id="spireSmartTextName" maxlength="80" placeholder="FOLLOW UP PLAN"></label>
              <label>Body<textarea id="spireSmartTextBody" rows="16" placeholder="Reusable documentation text. Use *** for fields that should be completed."></textarea></label>
              ${data.canCreateOrganizationWide ? '<label class="check"><input id="spireSmartTextOrgWide" type="checkbox"> Make available organization-wide</label>' : ''}
              <div class="spire-smarttext-actions"><button class="primary" type="button" id="spireSmartTextSave">Create SmartText</button><button class="danger" type="button" id="spireSmartTextDelete" hidden>Deactivate</button></div>
            </aside>
          </div>
        </div>`;
      document.body.appendChild(host);
      host.addEventListener('click', (event) => {
        if (event.target === host || event.target.closest('[data-close]')) host.remove();
      });
      host.querySelector('#spireSmartTextSearch').addEventListener('input', renderList);
      host.querySelector('#spireSmartTextNew').addEventListener('click', resetEditor);
      host.querySelector('#spireSmartTextSave').addEventListener('click', saveCurrent);
      host.querySelector('#spireSmartTextDelete').addEventListener('click', deactivateCurrent);
      host.querySelector('#spireSmartTextList').addEventListener('click', (event) => {
        const edit = event.target.closest('[data-smarttext-edit]');
        if (edit) populateEditor(edit.dataset.smarttextEdit);
      });
      renderList();
      resetEditor();
    } catch (error) {
      toast(error.message || 'Unable to open SmartText Manager.', true);
    }
  }

  function renderList() {
    const host = document.getElementById('spireSmartTextModal');
    if (!host) return;
    const query = String(host.querySelector('#spireSmartTextSearch')?.value || '').trim().toLowerCase();
    const items = (state.data?.items || []).filter((item) =>
      !query || `${item.name || ''} ${item.body || ''}`.toLowerCase().includes(query));
    host.querySelector('#spireSmartTextList').innerHTML = items.length ? items.map((item) => `
      <article>
        <div><strong>${esc(item.name)}</strong><span>${item.organizationWide ? 'Organization' : 'Mine'}</span></div>
        <pre>${esc(item.body || '')}</pre>
        ${item.ownedByCurrentUser || (item.organizationWide && state.data?.canCreateOrganizationWide) ? `<button type="button" data-smarttext-edit="${esc(item.id)}">Edit</button>` : ''}
      </article>`).join('') : '<p class="muted">No SmartText entries found.</p>';
  }

  function resetEditor() {
    const host = document.getElementById('spireSmartTextModal');
    if (!host) return;
    host.querySelector('#spireSmartTextId').value = '';
    host.querySelector('#spireSmartTextName').value = '';
    host.querySelector('#spireSmartTextBody').value = '';
    if (host.querySelector('#spireSmartTextOrgWide')) host.querySelector('#spireSmartTextOrgWide').checked = false;
    host.querySelector('#spireSmartTextEditorTitle').textContent = 'Create SmartText';
    host.querySelector('#spireSmartTextSave').textContent = 'Create SmartText';
    host.querySelector('#spireSmartTextDelete').hidden = true;
  }

  function populateEditor(id) {
    const host = document.getElementById('spireSmartTextModal');
    const item = (state.data?.items || []).find((candidate) => String(candidate.id) === String(id));
    if (!host || !item) return;
    host.querySelector('#spireSmartTextId').value = item.id;
    host.querySelector('#spireSmartTextName').value = item.name || '';
    host.querySelector('#spireSmartTextBody').value = item.body || '';
    if (host.querySelector('#spireSmartTextOrgWide')) host.querySelector('#spireSmartTextOrgWide').checked = item.organizationWide === true;
    host.querySelector('#spireSmartTextEditorTitle').textContent = `Edit ${item.name}`;
    host.querySelector('#spireSmartTextSave').textContent = 'Save Changes';
    host.querySelector('#spireSmartTextDelete').hidden = false;
  }

  async function saveCurrent() {
    const host = document.getElementById('spireSmartTextModal');
    if (!host) return;
    const id = host.querySelector('#spireSmartTextId').value;
    const payload = {
      name: host.querySelector('#spireSmartTextName').value,
      body: host.querySelector('#spireSmartTextBody').value,
      organizationWide: host.querySelector('#spireSmartTextOrgWide')?.checked === true,
    };
    if (!payload.name.trim() || !payload.body.trim()) {
      toast('SmartText name and body are required.', true);
      return;
    }
    try {
      await api(id ? `/api/spire/tools/smarttexts/${encodeURIComponent(id)}` : '/api/spire/tools/smarttexts', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      state.data = await load(true);
      renderList();
      resetEditor();
      toast(id ? 'SmartText updated.' : 'SmartText created.');
    } catch (error) {
      toast(error.message || 'Unable to save SmartText.', true);
    }
  }

  async function deactivateCurrent() {
    const host = document.getElementById('spireSmartTextModal');
    const id = host?.querySelector('#spireSmartTextId')?.value || '';
    if (!id || !confirm('Deactivate this SmartText?')) return;
    try {
      await api(`/api/spire/tools/smarttexts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.data = await load(true);
      renderList();
      resetEditor();
      toast('SmartText deactivated.');
    } catch (error) {
      toast(error.message || 'Unable to deactivate SmartText.', true);
    }
  }

  async function enhanceNote() {
    const modal = document.getElementById('spireWorkflowModal');
    const area = modal?.querySelector('#swNoteBody');
    if (!area || modal.querySelector('[data-spire-smarttext-note-tools]')) return;
    try {
      const data = await load(true);
      const items = data.items || [];
      if (!items.length) return;
      const tools = document.createElement('div');
      tools.dataset.spireSmarttextNoteTools = 'true';
      tools.className = 'spire-smarttext-note-tools';
      tools.innerHTML = `
        <label>SmartText
          <select><option value="">Choose reusable text…</option>${items.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select>
        </label>
        <button type="button">Insert SmartText</button>`;
      area.before(tools);
      tools.querySelector('button').addEventListener('click', () => {
        const id = tools.querySelector('select').value;
        const item = items.find((candidate) => String(candidate.id) === String(id));
        if (!item) return;
        const start = area.selectionStart ?? area.value.length;
        const prefix = area.value && start > 0 && !/\n$/.test(area.value.slice(0, start)) ? '\n' : '';
        area.setRangeText(`${prefix}${item.body}\n`, start, area.selectionEnd ?? start, 'end');
        area.focus();
        area.dispatchEvent(new Event('input', { bubbles: true }));
      });
    } catch {}
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.tool-grid button');
    if (!button || exactText(button) !== 'SmartText') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openManager();
  }, true);

  function scheduleEnhance() {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => enhanceNote().catch(() => {}), 35);
  }
  new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('sulandra:entity-context-changed', () => { state.data = null; });
})();
