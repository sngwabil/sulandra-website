(() => {
  'use strict';

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const state = {
    data: null,
    shareTargets: [],
    selectedPhraseId: '',
    renderTimer: 0,
  };

  const token = () =>
    TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]));

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
    if (!response.ok) {
      throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    }
    return payload.data ?? payload;
  }

  function toast(message, error = false) {
    let node = document.getElementById('spireSmartPhraseToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'spireSmartPhraseToast';
      document.body.appendChild(node);
    }
    node.className = `spire-smartphrase-toast${error ? ' error' : ''}`;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => { node.hidden = true; }, 3500);
  }

  async function loadManagerData(force = false) {
    if (!state.data || force) {
      state.data = await api('/api/spire/tools/smartphrases/manage');
    }
    return state.data;
  }

  async function loadShareTargets(force = false) {
    if (!state.shareTargets.length || force) {
      state.shareTargets = await api('/api/spire/tools/smartphrases/share-targets').catch(() => []);
    }
    return state.shareTargets;
  }

  function speedButtonIds() {
    return new Set((state.data?.speedButtons || []).map((button) => String(button.smartPhraseId || '')).filter(Boolean));
  }

  function phraseById(id) {
    return (state.data?.phrases || []).find((phrase) => String(phrase.id) === String(id)) || null;
  }

  async function openManager() {
    try {
      await Promise.all([loadManagerData(true), loadShareTargets(true)]);
      document.getElementById('spireSmartPhraseParityModal')?.remove();
      const host = document.createElement('div');
      host.id = 'spireSmartPhraseParityModal';
      host.className = 'spire-smartphrase-modal';
      host.innerHTML = `
        <div class="spire-smartphrase-dialog" role="dialog" aria-modal="true" aria-labelledby="spireSmartPhraseTitle">
          <header>
            <div>
              <strong id="spireSmartPhraseTitle">SmartPhrase Manager</strong>
              <span>Create, edit, share and personalize note speed buttons.</span>
            </div>
            <button type="button" data-close aria-label="Close">×</button>
          </header>
          <div class="spire-smartphrase-body">
            <section class="spire-smartphrase-library">
              <div class="spire-smartphrase-section-title">
                <div><strong>Available SmartPhrases</strong><span id="spireSmartPhraseCount"></span></div>
                <input id="spireSmartPhraseFilter" type="search" placeholder="Search phrases">
              </div>
              <div class="spire-smartphrase-speed-help">
                <b>Progress-note Speed Buttons</b>
                <span>Select up to 12 phrases. These buttons appear above the note editor.</span>
                <button type="button" id="spireSaveSpeedButtons">Save Speed Buttons</button>
              </div>
              <div id="spireSmartPhraseList" class="spire-smartphrase-list"></div>
            </section>
            <aside class="spire-smartphrase-editor">
              <div class="spire-smartphrase-editor-title">
                <strong id="spireSmartPhraseEditorHeading">Create SmartPhrase</strong>
                <button type="button" id="spireNewSmartPhrase">New</button>
              </div>
              <input type="hidden" id="spirePhraseId">
              <label>Name
                <div class="spire-smartphrase-name"><span>.</span><input id="spirePhraseName" maxlength="80" placeholder="FOLLOWUP"></div>
              </label>
              <label>Description<input id="spirePhraseDescription" maxlength="500"></label>
              <label>Body<textarea id="spirePhraseBody" rows="13" placeholder="Type the reusable note content here. Use *** for fields that F2 should jump to."></textarea></label>
              ${state.data?.canShareOrganizationWide ? '<label class="check"><input id="spirePhraseOrgWide" type="checkbox"> Share organization-wide</label>' : ''}
              <div class="spire-smartphrase-editor-actions">
                <button type="button" class="primary" id="spireSavePhrase">Create Phrase</button>
                <button type="button" class="danger" id="spireDeletePhrase" hidden>Deactivate</button>
              </div>
              <section id="spirePhraseSharing" class="spire-smartphrase-sharing" hidden>
                <strong>Share this SmartPhrase</strong>
                <p>Share only with active employees in the selected Sulandra company.</p>
                <div class="spire-smartphrase-share-row">
                  <select id="spirePhraseShareTarget"><option value="">Choose employee…</option></select>
                  <button type="button" id="spireSharePhrase">Share</button>
                </div>
                <div id="spirePhraseShares" class="spire-smartphrase-share-chips"></div>
              </section>
            </aside>
          </div>
        </div>`;
      document.body.appendChild(host);

      const close = () => host.remove();
      host.addEventListener('click', (event) => {
        if (event.target === host || event.target.closest('[data-close]')) close();
      });
      host.querySelector('#spireSmartPhraseFilter').addEventListener('input', renderPhraseList);
      host.querySelector('#spireNewSmartPhrase').addEventListener('click', resetEditor);
      host.querySelector('#spireSavePhrase').addEventListener('click', savePhrase);
      host.querySelector('#spireDeletePhrase').addEventListener('click', deletePhrase);
      host.querySelector('#spireSharePhrase').addEventListener('click', sharePhrase);
      host.querySelector('#spireSaveSpeedButtons').addEventListener('click', saveSpeedButtons);
      host.querySelector('#spireSmartPhraseList').addEventListener('click', (event) => {
        const edit = event.target.closest('[data-edit-phrase]');
        if (edit) populateEditor(edit.dataset.editPhrase);
        const share = event.target.closest('[data-share-phrase]');
        if (share) {
          populateEditor(share.dataset.sharePhrase);
          host.querySelector('#spirePhraseShareTarget')?.focus();
        }
      });
      host.querySelector('#spirePhraseShares').addEventListener('click', async (event) => {
        const remove = event.target.closest('[data-unshare-user]');
        if (!remove || !state.selectedPhraseId) return;
        try {
          await api(
            `/api/spire/tools/smartphrases/${encodeURIComponent(state.selectedPhraseId)}/share/${encodeURIComponent(remove.dataset.unshareUser)}`,
            { method: 'DELETE' },
          );
          await refreshManager();
          populateEditor(state.selectedPhraseId);
          toast('SmartPhrase share removed.');
        } catch (error) {
          toast(error.message || 'Unable to remove share.', true);
        }
      });
      renderPhraseList();
      resetEditor();
    } catch (error) {
      toast(error.message || 'Unable to open SmartPhrase Manager.', true);
    }
  }

  function renderPhraseList() {
    const host = document.getElementById('spireSmartPhraseParityModal');
    if (!host) return;
    const query = String(host.querySelector('#spireSmartPhraseFilter')?.value || '').trim().toLowerCase();
    const selected = speedButtonIds();
    const phrases = (state.data?.phrases || []).filter((phrase) => {
      if (!query) return true;
      return [phrase.name, phrase.description, phrase.body]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
    host.querySelector('#spireSmartPhraseCount').textContent = `${phrases.length} shown`;
    host.querySelector('#spireSmartPhraseList').innerHTML = phrases.length
      ? phrases.map((phrase) => {
        const shares = Array.isArray(phrase.shares) ? phrase.shares : [];
        const ownership = phrase.ownedByCurrentUser
          ? 'Mine'
          : phrase.sharedOrganizationWide
            ? 'Organization'
            : 'Shared with me';
        return `
          <article class="spire-smartphrase-card">
            <label class="spire-smartphrase-speed-check" title="Show as a progress-note speed button">
              <input type="checkbox" data-speed-phrase="${esc(phrase.id)}" ${selected.has(String(phrase.id)) ? 'checked' : ''}>
              <span>Speed</span>
            </label>
            <div class="spire-smartphrase-card-content">
              <div><strong>.${esc(phrase.name)}</strong><span class="spire-smartphrase-badge">${esc(ownership)}</span></div>
              <p>${esc(phrase.description || '')}</p>
              <pre>${esc(phrase.body || '')}</pre>
              ${shares.length ? `<small>Shared with ${shares.length} employee${shares.length === 1 ? '' : 's'}</small>` : ''}
            </div>
            <div class="spire-smartphrase-card-actions">
              ${phrase.ownedByCurrentUser || state.data?.canShareOrganizationWide ? `<button type="button" data-edit-phrase="${esc(phrase.id)}">Edit</button><button type="button" data-share-phrase="${esc(phrase.id)}">Share</button>` : ''}
            </div>
          </article>`;
      }).join('')
      : '<div class="spire-smartphrase-empty">No SmartPhrases match this search.</div>';

    host.querySelectorAll('[data-speed-phrase]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const checked = [...host.querySelectorAll('[data-speed-phrase]:checked')];
        if (checked.length > 12) {
          checkbox.checked = false;
          toast('Progress-note speed buttons are limited to 12.', true);
        }
      });
    });
  }

  function resetEditor() {
    const host = document.getElementById('spireSmartPhraseParityModal');
    if (!host) return;
    state.selectedPhraseId = '';
    host.querySelector('#spireSmartPhraseEditorHeading').textContent = 'Create SmartPhrase';
    host.querySelector('#spirePhraseId').value = '';
    host.querySelector('#spirePhraseName').value = '';
    host.querySelector('#spirePhraseDescription').value = '';
    host.querySelector('#spirePhraseBody').value = '';
    if (host.querySelector('#spirePhraseOrgWide')) host.querySelector('#spirePhraseOrgWide').checked = false;
    host.querySelector('#spireSavePhrase').textContent = 'Create Phrase';
    host.querySelector('#spireDeletePhrase').hidden = true;
    host.querySelector('#spirePhraseSharing').hidden = true;
  }

  function populateEditor(id) {
    const host = document.getElementById('spireSmartPhraseParityModal');
    const phrase = phraseById(id);
    if (!host || !phrase) return;
    const editable = phrase.ownedByCurrentUser || state.data?.canShareOrganizationWide;
    state.selectedPhraseId = String(phrase.id);
    host.querySelector('#spireSmartPhraseEditorHeading').textContent = `Edit .${phrase.name}`;
    host.querySelector('#spirePhraseId').value = phrase.id;
    host.querySelector('#spirePhraseName').value = phrase.name || '';
    host.querySelector('#spirePhraseDescription').value = phrase.description || '';
    host.querySelector('#spirePhraseBody').value = phrase.body || '';
    host.querySelector('#spirePhraseName').disabled = !editable;
    host.querySelector('#spirePhraseDescription').disabled = !editable;
    host.querySelector('#spirePhraseBody').disabled = !editable;
    if (host.querySelector('#spirePhraseOrgWide')) {
      host.querySelector('#spirePhraseOrgWide').checked = phrase.sharedOrganizationWide === true;
      host.querySelector('#spirePhraseOrgWide').disabled = !editable;
    }
    host.querySelector('#spireSavePhrase').hidden = !editable;
    host.querySelector('#spireSavePhrase').textContent = 'Save Changes';
    host.querySelector('#spireDeletePhrase').hidden = !editable;
    host.querySelector('#spirePhraseSharing').hidden = !editable;
    renderShareTargets(phrase);
  }

  function renderShareTargets(phrase) {
    const host = document.getElementById('spireSmartPhraseParityModal');
    if (!host) return;
    const shares = Array.isArray(phrase.shares) ? phrase.shares : [];
    const alreadyShared = new Set(shares.map((share) => String(share.userId)));
    const select = host.querySelector('#spirePhraseShareTarget');
    select.innerHTML = '<option value="">Choose employee…</option>'
      + state.shareTargets
        .filter((person) => !alreadyShared.has(String(person.userId)))
        .map((person) => `<option value="${esc(person.userId)}">${esc(person.email || person.userId)} · ${esc(person.jobTitle || person.role || '')}</option>`)
        .join('');
    host.querySelector('#spirePhraseShares').innerHTML = shares.length
      ? shares.map((share) => `
        <span>${esc(share.email || share.userId || 'Employee')}
          <button type="button" data-unshare-user="${esc(share.userId)}" aria-label="Remove share">×</button>
        </span>`).join('')
      : '<small>Not shared with individual employees.</small>';
  }

  async function savePhrase() {
    const host = document.getElementById('spireSmartPhraseParityModal');
    if (!host) return;
    const phraseId = host.querySelector('#spirePhraseId').value;
    const payload = {
      name: host.querySelector('#spirePhraseName').value,
      description: host.querySelector('#spirePhraseDescription').value,
      body: host.querySelector('#spirePhraseBody').value,
      sharedOrganizationWide: host.querySelector('#spirePhraseOrgWide')?.checked === true,
    };
    if (!payload.name.trim() || !payload.body.trim()) {
      toast('SmartPhrase name and body are required.', true);
      return;
    }
    try {
      if (phraseId) {
        await api(`/api/spire/tools/smartphrases/${encodeURIComponent(phraseId)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast('SmartPhrase updated.');
      } else {
        await api('/api/spire/tools/smartphrases', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast('SmartPhrase created.');
      }
      await refreshManager();
      if (phraseId) populateEditor(phraseId); else resetEditor();
    } catch (error) {
      toast(error.message || 'Unable to save SmartPhrase.', true);
    }
  }

  async function deletePhrase() {
    if (!state.selectedPhraseId) return;
    if (!confirm('Deactivate this SmartPhrase? It will also be removed from note speed buttons.')) return;
    try {
      await api(`/api/spire/tools/smartphrases/${encodeURIComponent(state.selectedPhraseId)}`, { method: 'DELETE' });
      toast('SmartPhrase deactivated.');
      await refreshManager();
      resetEditor();
    } catch (error) {
      toast(error.message || 'Unable to deactivate SmartPhrase.', true);
    }
  }

  async function sharePhrase() {
    const host = document.getElementById('spireSmartPhraseParityModal');
    const target = host?.querySelector('#spirePhraseShareTarget')?.value || '';
    if (!state.selectedPhraseId || !target) {
      toast('Choose an employee to share this SmartPhrase with.', true);
      return;
    }
    try {
      await api(`/api/spire/tools/smartphrases/${encodeURIComponent(state.selectedPhraseId)}/share`, {
        method: 'POST',
        body: JSON.stringify({ sharedWithUserId: target }),
      });
      await refreshManager();
      populateEditor(state.selectedPhraseId);
      toast('SmartPhrase shared.');
    } catch (error) {
      toast(error.message || 'Unable to share SmartPhrase.', true);
    }
  }

  async function saveSpeedButtons() {
    const host = document.getElementById('spireSmartPhraseParityModal');
    if (!host) return;
    const smartPhraseIds = [...host.querySelectorAll('[data-speed-phrase]:checked')]
      .map((checkbox) => checkbox.dataset.speedPhrase)
      .filter(Boolean)
      .slice(0, 12);
    try {
      await api('/api/spire/tools/smartphrases/speed-buttons', {
        method: 'PUT',
        body: JSON.stringify({ smartPhraseIds }),
      });
      await refreshManager();
      toast('Progress-note speed buttons saved.');
    } catch (error) {
      toast(error.message || 'Unable to save speed buttons.', true);
    }
  }

  async function refreshManager() {
    await loadManagerData(true);
    renderPhraseList();
  }

  async function applySpeedButtonsToNote() {
    const modal = document.getElementById('spireWorkflowModal');
    const area = modal?.querySelector('#swNoteBody');
    const row = modal?.querySelector('.spire-phrase-row');
    if (!area || !row || row.dataset.spireParitySpeedButtons === 'true') return;
    row.dataset.spireParitySpeedButtons = 'true';
    try {
      const data = await loadManagerData(true);
      const phraseMap = new Map((data.phrases || []).map((phrase) => [String(phrase.id), phrase]));
      const buttons = (data.speedButtons || [])
        .map((button) => ({ ...button, phrase: phraseMap.get(String(button.smartPhraseId)) }))
        .filter((button) => button.phrase);
      if (!buttons.length) {
        row.innerHTML = '<span>No personalized speed buttons. Type <b>.</b> for SmartPhrases or configure buttons in Tools.</span>';
        return;
      }
      row.innerHTML = buttons.map((button) => `
        <button type="button" class="spire-phrase-chip" data-parity-speed-phrase="${esc(button.smartPhraseId)}">.${esc(button.phrase.name)}</button>`).join('');
      row.querySelectorAll('[data-parity-speed-phrase]').forEach((button) => {
        button.addEventListener('click', () => {
          const phrase = phraseMap.get(String(button.dataset.paritySpeedPhrase));
          if (!phrase) return;
          const start = area.selectionStart ?? area.value.length;
          const prefix = area.value && start > 0 && !/\n$/.test(area.value.slice(0, start)) ? '\n' : '';
          area.setRangeText(`${prefix}${phrase.body}\n`, start, area.selectionEnd ?? start, 'end');
          area.focus();
          area.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
    } catch (error) {
      row.innerHTML = `<span>${esc(error.message || 'Unable to load note speed buttons.')}</span>`;
    }
  }

  function isSmartPhraseManagerButton(target) {
    const button = target?.closest?.('button');
    return Boolean(button && /SmartPhrase Manager/i.test(button.textContent || '') && button.closest('.tool-grid'));
  }

  document.addEventListener('click', (event) => {
    if (!isSmartPhraseManagerButton(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openManager();
  }, true);

  function scheduleEnhance() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(() => applySpeedButtonsToNote().catch(() => {}), 30);
  }

  new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('sulandra:entity-context-changed', () => {
    state.data = null;
    state.shareTargets = [];
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true });
  } else {
    scheduleEnhance();
  }
})();
