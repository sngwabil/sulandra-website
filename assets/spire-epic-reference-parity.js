(() => {
  'use strict';

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const PREF_KEY = 'spire:reference-parity-preferences:v1';
  const TAB_KEY = 'spire:chart-tab-layout:v1';
  const REFERENCE_CATEGORIES = [
    ['ecg', 'ECG'],
    ['referrals', 'Referrals'],
    ['procedures', 'Procedures'],
    ['episodes', 'Episodes'],
    ['letters', 'Letters'],
  ];
  const REFERENCE_TAB_ORDER = [
    'chart-review',
    'results-review',
    'wrap-up',
    'plan',
    'vitals',
    'external',
    'communications',
    'medications',
    'mar',
    'orders',
    'care-plan',
    'assessments',
    'incidents',
    'authorizations',
    'documents',
    'notes',
    'timeline',
  ];

  const state = {
    dashboardPromise: null,
    smartPhrases: null,
    schedulingContext: null,
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

  const arr = (value) => Array.isArray(value) ? value : [];

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

  function readPreferences() {
    try {
      return {
        density: 'compact',
        stickyPatient: true,
        pinnedProvider: '',
        ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}'),
      };
    } catch {
      return { density: 'compact', stickyPatient: true, pinnedProvider: '' };
    }
  }

  function writePreferences(patch) {
    const next = { ...readPreferences(), ...patch };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch {}
    applyPreferences(next);
    return next;
  }

  function applyPreferences(preferences = readPreferences()) {
    document.body.classList.toggle('spire-reference-comfortable', preferences.density === 'comfortable');
    document.body.classList.toggle('spire-reference-sticky-patient', preferences.stickyPatient !== false);
  }

  function patientId() {
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return sessionStorage.getItem('spire:patientId') || hash.get('patient') || hash.get('patientId') || '';
  }

  function fmtTime(value) {
    if (!value) return '—';
    const date = new Date(String(value));
    return Number.isNaN(date.valueOf())
      ? String(value)
      : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function fmtDateTime(value) {
    if (!value) return '—';
    const date = new Date(String(value));
    return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
  }

  function toast(message, error = false) {
    let node = document.getElementById('spireReferenceToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'spireReferenceToast';
      document.body.appendChild(node);
    }
    node.className = `spire-reference-toast${error ? ' error' : ''}`;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => { node.hidden = true; }, 3600);
  }

  function installSettingsButton() {
    const actions = document.querySelector('.spire-top-actions');
    if (!actions || document.getElementById('spireReferenceSettings')) return;
    const button = document.createElement('button');
    button.id = 'spireReferenceSettings';
    button.type = 'button';
    button.textContent = 'Workspace Settings';
    button.addEventListener('click', openSettings);
    actions.prepend(button);
  }

  function openSettings() {
    document.getElementById('spireReferenceSettingsModal')?.remove();
    const preferences = readPreferences();
    const host = document.createElement('div');
    host.id = 'spireReferenceSettingsModal';
    host.className = 'spire-reference-modal';
    host.innerHTML = `
      <div class="spire-reference-dialog" role="dialog" aria-modal="true" aria-labelledby="spireReferenceSettingsTitle">
        <header>
          <div>
            <strong id="spireReferenceSettingsTitle">SPIRE Workspace Settings</strong>
            <span>Dense clinical layout, chart navigation and personal workflow</span>
          </div>
          <button type="button" data-close aria-label="Close">×</button>
        </header>
        <div class="spire-reference-settings-grid">
          <label>
            Display density
            <select id="spireReferenceDensity">
              <option value="compact" ${preferences.density === 'compact' ? 'selected' : ''}>Compact clinical view</option>
              <option value="comfortable" ${preferences.density === 'comfortable' ? 'selected' : ''}>Comfortable</option>
            </select>
          </label>
          <label class="check">
            <input id="spireReferenceStickyPatient" type="checkbox" ${preferences.stickyPatient !== false ? 'checked' : ''}>
            Keep the patient identity / safety banner visible while charting
          </label>
          <section>
            <strong>Reference chart layout</strong>
            <p>Applies the proven sequence from the supplied training guide while preserving SPIRE-specific clinical modules.</p>
            <button type="button" id="spireApplyReferenceTabs">Apply reference tab order</button>
          </section>
          <section>
            <strong>Schedule provider pin</strong>
            <p>Your provider filter can stay pinned when you move between dates.</p>
            <button type="button" id="spireClearPinnedProvider">Clear pinned provider</button>
          </section>
        </div>
        <footer>
          <span>Rooming is represented by Vitals &amp; Flowsheets; outside-record workflows are represented by External Records and Documents / Media.</span>
          <button type="button" class="primary" id="spireReferenceSaveSettings">Save</button>
        </footer>
      </div>`;
    document.body.appendChild(host);

    const close = () => host.remove();
    host.addEventListener('click', (event) => {
      if (event.target === host || event.target.closest('[data-close]')) close();
    });
    host.querySelector('#spireReferenceSaveSettings').addEventListener('click', () => {
      writePreferences({
        density: host.querySelector('#spireReferenceDensity').value,
        stickyPatient: host.querySelector('#spireReferenceStickyPatient').checked,
      });
      close();
      toast('SPIRE workspace settings saved.');
    });
    host.querySelector('#spireClearPinnedProvider').addEventListener('click', () => {
      writePreferences({ pinnedProvider: '' });
      toast('Pinned provider cleared.');
      host.querySelector('#spireClearPinnedProvider').disabled = true;
    });
    host.querySelector('#spireApplyReferenceTabs').addEventListener('click', async () => {
      try {
        await applyReferenceTabOrder();
        toast('Reference chart tab order applied.');
      } catch (error) {
        toast(error.message || 'Unable to apply chart layout.', true);
      }
    });
  }

  async function applyReferenceTabOrder() {
    const bar = document.querySelector('.chart-tabs');
    const currentButtons = bar ? [...bar.querySelectorAll('[data-chart-tab]')] : [];
    const available = currentButtons.map((button) => button.dataset.chartTab);
    const order = [
      ...REFERENCE_TAB_ORDER.filter((key) => available.includes(key)),
      ...available.filter((key) => !REFERENCE_TAB_ORDER.includes(key)),
    ];
    const layout = { order, hidden: [] };

    try { localStorage.setItem(TAB_KEY, JSON.stringify(layout)); } catch {}
    if (window.SpireWorkspaceCompletion?.saveWorkspaceTabs) {
      await window.SpireWorkspaceCompletion.saveWorkspaceTabs(layout);
    }
    if (bar) {
      const byKey = new Map(currentButtons.map((button) => [button.dataset.chartTab, button]));
      order.forEach((key) => {
        if (byKey.get(key)) bar.appendChild(byKey.get(key));
      });
    }
    window.dispatchEvent(new CustomEvent('spire:workspace-preferences-updated', {
      detail: { workspaceTabs: layout },
    }));
  }

  async function loadDashboard() {
    if (!state.dashboardPromise) {
      state.dashboardPromise = Promise.all([
        api('/api/spire/schedule').catch(() => []),
        api('/api/spire/inbasket').catch(() => []),
      ]).then(([schedule, inbox]) => ({ schedule: arr(schedule), inbox: arr(inbox) }));
    }
    return state.dashboardPromise;
  }

  async function enhanceHome() {
    const host = document.getElementById('spireHomeWorkspace');
    if (!host?.classList.contains('active') || host.querySelector('[data-spire-reference-dashboard]')) return;
    const title = host.querySelector('.workspace-title');
    if (!title) return;

    const shell = document.createElement('section');
    shell.dataset.spireReferenceDashboard = 'true';
    shell.className = 'spire-reference-dashboard';
    shell.innerHTML = '<div class="spire-reference-loading">Loading clinical command center…</div>';
    title.after(shell);

    const { schedule, inbox } = await loadDashboard();
    const grouped = inbox.reduce((map, item) => {
      const key = String(item.category || 'Other');
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map());

    shell.innerHTML = `
      <article class="spire-reference-glance">
        <header><strong>Schedule Glance</strong><button type="button" data-workspace="schedule">Open Schedule</button></header>
        <div class="spire-reference-glance-list">
          ${schedule.length ? schedule.slice(0, 6).map((item) => `
            <button type="button" data-patient-id="${esc(item.patientId || '')}">
              <time>${esc(item.time || fmtTime(item.startsAt))}</time>
              <span><strong>${esc(item.patientName || 'Patient')}</strong><small>${esc(item.status || '')} · ${esc(item.type || '')}</small></span>
              <b>Pre-Chart</b>
            </button>`).join('') : '<p class="muted">No appointments today.</p>'}
        </div>
      </article>
      <article class="spire-reference-glance">
        <header><strong>In Basket Glance</strong><button type="button" data-workspace="inbasket">Open In Basket</button></header>
        <div class="spire-reference-inbox-counts">
          ${grouped.size ? [...grouped.entries()].slice(0, 6).map(([key, count]) =>
            `<button type="button" data-workspace="inbasket"><span>${esc(key)}</span><strong>${count}</strong></button>`
          ).join('') : '<p class="muted">No open items.</p>'}
        </div>
      </article>
      <article class="spire-reference-glance">
        <header><strong>Clinical Shortcuts</strong><button type="button" id="spireReferenceCustomize">Personalize</button></header>
        <div class="spire-reference-shortcuts">
          <button type="button" data-workspace="search">Find Patient / Chart</button>
          <button type="button" data-workspace="tools">SmartPhrases &amp; SmartText</button>
          <button type="button" data-workspace="tasks">My Tasks</button>
          <button type="button" data-workspace="orders">Orders</button>
        </div>
      </article>`;
    shell.querySelector('#spireReferenceCustomize')?.addEventListener('click', openSettings);
  }

  async function loadSchedulingContext() {
    if (!state.schedulingContext) {
      state.schedulingContext = api('/api/spire/scheduling/context').catch(() => ({ providers: [], resources: [] }));
    }
    return state.schedulingContext;
  }

  function monthGrid(selectedDate) {
    const selected = selectedDate ? new Date(`${selectedDate}T12:00:00`) : new Date();
    const first = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
    const last = new Date(selected.getFullYear(), selected.getMonth() + 1, 0, 12);
    const leading = first.getDay();
    const cells = [];
    for (let index = 0; index < leading; index += 1) cells.push('');
    for (let day = 1; day <= last.getDate(); day += 1) cells.push(day);
    while (cells.length % 7) cells.push('');
    return {
      label: first.toLocaleDateString([], { month: 'long', year: 'numeric' }),
      year: selected.getFullYear(),
      month: selected.getMonth(),
      selectedDay: selected.getDate(),
      cells,
    };
  }

  async function enhanceSchedule() {
    const host = document.getElementById('spireGenericWorkspace');
    const toolbar = host?.querySelector('.spire-sched-toolbar');
    if (!toolbar || host.querySelector('[data-spire-reference-schedule-tools]')) return;
    const dateInput = toolbar.querySelector('#spireSchedDate');
    if (!dateInput) return;
    const context = await loadSchedulingContext();
    const preferences = readPreferences();

    const tools = document.createElement('section');
    tools.dataset.spireReferenceScheduleTools = 'true';
    tools.className = 'spire-reference-schedule-tools';
    toolbar.after(tools);

    const render = () => {
      const grid = monthGrid(dateInput.value);
      tools.innerHTML = `
        <div class="spire-reference-calendar">
          <header>
            <button type="button" data-month="-1" aria-label="Previous month">‹</button>
            <strong>${esc(grid.label)}</strong>
            <button type="button" data-month="1" aria-label="Next month">›</button>
          </header>
          <div class="spire-reference-weekdays">${['S','M','T','W','T','F','S'].map((day) => `<span>${day}</span>`).join('')}</div>
          <div class="spire-reference-days">
            ${grid.cells.map((day) => day
              ? `<button type="button" data-day="${day}" class="${day === grid.selectedDay ? 'selected' : ''}">${day}</button>`
              : '<span></span>'
            ).join('')}
          </div>
        </div>
        <div class="spire-reference-provider">
          <label>Provider schedule
            <select id="spireReferenceProvider">
              <option value="">All providers</option>
              ${arr(context.providers).map((provider) => `<option value="${esc(provider)}" ${String(provider) === preferences.pinnedProvider ? 'selected' : ''}>${esc(provider)}</option>`).join('')}
            </select>
          </label>
          <button type="button" id="spireReferencePinProvider">${preferences.pinnedProvider ? 'Provider pinned' : 'Pin provider'}</button>
          <small>Pinning keeps this provider selected while you move across dates.</small>
        </div>`;
      applyProviderFilter(tools.querySelector('#spireReferenceProvider')?.value || '');
    };

    render();

    tools.addEventListener('click', (event) => {
      const dayButton = event.target.closest('[data-day]');
      if (dayButton) {
        const grid = monthGrid(dateInput.value);
        const date = new Date(grid.year, grid.month, Number(dayButton.dataset.day), 12);
        dateInput.value = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, '0'),
          String(date.getDate()).padStart(2, '0'),
        ].join('-');
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      const monthButton = event.target.closest('[data-month]');
      if (monthButton) {
        const current = dateInput.value ? new Date(`${dateInput.value}T12:00:00`) : new Date();
        current.setMonth(current.getMonth() + Number(monthButton.dataset.month));
        dateInput.value = [
          current.getFullYear(),
          String(current.getMonth() + 1).padStart(2, '0'),
          String(Math.min(current.getDate(), 28)).padStart(2, '0'),
        ].join('-');
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      if (event.target.closest('#spireReferencePinProvider')) {
        const provider = tools.querySelector('#spireReferenceProvider')?.value || '';
        writePreferences({ pinnedProvider: provider });
        toast(provider ? `Pinned provider ${provider}.` : 'Provider pin cleared.');
        render();
      }
    });

    tools.addEventListener('change', (event) => {
      if (event.target.matches('#spireReferenceProvider')) {
        applyProviderFilter(event.target.value);
      }
    });

    if (preferences.pinnedProvider) applyProviderFilter(preferences.pinnedProvider);
  }

  function applyProviderFilter(provider) {
    document.querySelectorAll('.spire-sched-card').forEach((card) => {
      const providerText = [...card.querySelectorAll('small')]
        .map((node) => node.textContent || '')
        .find((value) => value.includes('Provider:')) || '';
      card.hidden = Boolean(provider) && !providerText.includes(`Provider: ${provider}`);
    });
  }

  async function loadSmartPhrases() {
    if (Array.isArray(state.smartPhrases)) return state.smartPhrases;
    state.smartPhrases = arr(await api('/api/spire/tools/smartphrases').catch(() => []));
    return state.smartPhrases;
  }

  async function enhanceNoteEditor() {
    const area = document.getElementById('swNoteBody');
    if (!area || area.dataset.spireReferenceEnhanced === 'true') return;
    area.dataset.spireReferenceEnhanced = 'true';
    const phrases = await loadSmartPhrases();
    const toolbar = document.createElement('div');
    toolbar.className = 'spire-reference-note-tools';
    toolbar.innerHTML = `
      <button type="button" data-note-toggle>Hide editor</button>
      <button type="button" data-note-dictate>Dictate</button>
      <span>Type <b>.</b> for SmartPhrases · press <b>F2</b> to jump to the next *** field.</span>`;
    area.before(toolbar);

    const suggestion = document.createElement('div');
    suggestion.className = 'spire-reference-phrase-suggestions';
    suggestion.hidden = true;
    area.after(suggestion);

    let matches = [];
    let selected = 0;
    let recognition = null;

    const currentTrigger = () => {
      const caret = area.selectionStart ?? area.value.length;
      const prefix = area.value.slice(0, caret);
      const match = prefix.match(/(?:^|\s)\.([A-Za-z0-9_]*)$/);
      return match ? { query: match[1].toLowerCase(), start: caret - match[1].length - 1, end: caret } : null;
    };

    const updateSuggestions = () => {
      const trigger = currentTrigger();
      if (!trigger) {
        suggestion.hidden = true;
        matches = [];
        return;
      }
      matches = phrases
        .filter((phrase) => String(phrase.name || '').toLowerCase().startsWith(trigger.query))
        .slice(0, 8);
      selected = Math.min(selected, Math.max(0, matches.length - 1));
      suggestion.hidden = !matches.length;
      suggestion.innerHTML = matches.map((phrase, index) => `
        <button type="button" data-phrase-index="${index}" class="${index === selected ? 'selected' : ''}">
          <strong>.${esc(phrase.name)}</strong>
          <span>${esc(phrase.description || '')}</span>
        </button>`).join('');
    };

    const insertPhrase = (phrase) => {
      const trigger = currentTrigger();
      if (!trigger || !phrase) return;
      area.setRangeText(String(phrase.body || ''), trigger.start, trigger.end, 'end');
      suggestion.hidden = true;
      area.focus();
      area.dispatchEvent(new Event('input', { bubbles: true }));
    };

    area.addEventListener('input', updateSuggestions);
    area.addEventListener('click', updateSuggestions);
    area.addEventListener('keydown', (event) => {
      if (event.key === 'F2') {
        event.preventDefault();
        jumpToNextPlaceholder(area);
        return;
      }
      if (!suggestion.hidden && matches.length) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          selected = (selected + 1) % matches.length;
          updateSuggestions();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          selected = (selected - 1 + matches.length) % matches.length;
          updateSuggestions();
        } else if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          insertPhrase(matches[selected]);
        } else if (event.key === 'Escape') {
          suggestion.hidden = true;
        }
      }
    });

    suggestion.addEventListener('mousedown', (event) => {
      const button = event.target.closest('[data-phrase-index]');
      if (!button) return;
      event.preventDefault();
      insertPhrase(matches[Number(button.dataset.phraseIndex)]);
    });

    toolbar.querySelector('[data-note-toggle]').addEventListener('click', (event) => {
      const collapsed = area.classList.toggle('spire-reference-editor-hidden');
      suggestion.hidden = true;
      event.currentTarget.textContent = collapsed ? 'Show editor' : 'Hide editor';
      if (!collapsed) area.focus();
    });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const dictationButton = toolbar.querySelector('[data-note-dictate]');
    if (!SpeechRecognition) {
      dictationButton.disabled = true;
      dictationButton.title = 'Browser speech recognition is not available on this device.';
    } else {
      dictationButton.addEventListener('click', () => {
        if (recognition) {
          recognition.stop();
          return;
        }
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = document.documentElement.lang || 'en-US';
        recognition.onresult = (event) => {
          const transcript = [...event.results]
            .slice(event.resultIndex)
            .map((result) => result[0]?.transcript || '')
            .join(' ')
            .trim();
          if (!transcript) return;
          const start = area.selectionStart ?? area.value.length;
          const prefix = area.value && start > 0 && !/\s$/.test(area.value.slice(0, start)) ? ' ' : '';
          area.setRangeText(prefix + transcript, start, area.selectionEnd ?? start, 'end');
          area.dispatchEvent(new Event('input', { bubbles: true }));
        };
        recognition.onerror = (event) => {
          toast(`Dictation stopped: ${event.error || 'microphone error'}`, true);
        };
        recognition.onend = () => {
          recognition = null;
          dictationButton.classList.remove('active');
          dictationButton.textContent = 'Dictate';
        };
        recognition.start();
        dictationButton.classList.add('active');
        dictationButton.textContent = 'Stop Dictation';
      });
    }
  }

  function jumpToNextPlaceholder(area) {
    const value = area.value;
    const from = area.selectionEnd ?? 0;
    const markers = [];
    for (const regex of [/\*\*\*/g, /\[[^\]\n]{1,80}\]/g, /<[^>\n]{1,80}>/g]) {
      let match;
      while ((match = regex.exec(value))) markers.push({ start: match.index, end: match.index + match[0].length });
    }
    markers.sort((a, b) => a.start - b.start);
    const target = markers.find((marker) => marker.start >= from) || markers[0];
    if (!target) {
      toast('No remaining SmartPhrase fields were found.');
      return;
    }
    area.focus();
    area.setSelectionRange(target.start, target.end);
  }

  function enhanceChartReviewCategories() {
    const subtabs = document.querySelector('.chart-review-subtabs');
    if (!subtabs) return;
    for (const [key, label] of REFERENCE_CATEGORIES) {
      if (subtabs.querySelector(`[data-spire-reference-category="${key}"]`)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.spireReferenceCategory = key;
      button.textContent = label;
      button.addEventListener('click', () => renderReferenceCategory(key, label));
      subtabs.appendChild(button);
    }
  }

  async function renderReferenceCategory(category, label) {
    const id = patientId();
    if (!id) return;
    const body = document.getElementById('spireChartTabBody');
    if (!body) return;
    document.querySelectorAll('.chart-review-subtabs button').forEach((button) => button.classList.remove('active'));
    document.querySelector(`[data-spire-reference-category="${CSS.escape(category)}"]`)?.classList.add('active');

    const tbody = body.querySelector('#chartReviewRows');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';

    try {
      const data = await api(`/api/spire/patients/${encodeURIComponent(id)}/reference-review/${encodeURIComponent(category)}`);
      const items = arr(data.items || data);
      const rows = items.length ? items.map((item) => `
        <tr>
          <td>${esc(fmtDateTime(item.date || item.createdAt))}</td>
          <td><span class="record-type">${esc(item.type || label)}</span></td>
          <td><strong>${esc(item.description || item.title || '')}</strong></td>
          <td>${esc(item.status || '')}</td>
          <td>${esc(item.author || item.provider || '')}</td>
        </tr>`).join('') : `<tr><td colspan="5" class="muted">No ${esc(label.toLowerCase())} records are available for this chart.</td></tr>`;
      if (tbody) tbody.innerHTML = rows;
      body.querySelector('.chart-review-summary')?.replaceChildren(
        Object.assign(document.createElement('span'), { textContent: `${items.length} records` }),
        Object.assign(document.createElement('span'), { textContent: `Category: ${label}` }),
      );
    } catch (error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="muted">${esc(error.message)}</td></tr>`;
    }
  }

  async function enhanceWrapUpTab() {
    const active = document.querySelector('.chart-tabs [data-chart-tab="wrap-up"].active');
    const body = document.getElementById('spireChartTabBody');
    const id = patientId();
    if (!active || !body || !id) return;
    const key = `${id}:${sessionStorage.getItem('spire:encounterId') || ''}`;
    if (body.dataset.spireReferenceWrapUp === key || body.dataset.spireReferenceWrapUpLoading === key) return;
    body.dataset.spireReferenceWrapUpLoading = key;

    try {
      const [context, cosigners] = await Promise.all([
        api(`/api/spire/patients/${encodeURIComponent(id)}/wrap-up-context?encounterId=${encodeURIComponent(sessionStorage.getItem('spire:encounterId') || '')}`),
        api('/api/spire/workspaces/note-cosigners').catch(() => []),
      ]);
      if (!document.querySelector('.chart-tabs [data-chart-tab="wrap-up"].active')) return;
      body.dataset.spireReferenceWrapUp = key;
      delete body.dataset.spireReferenceWrapUpLoading;
      renderWrapUp(body, id, context, arr(cosigners));
    } catch (error) {
      delete body.dataset.spireReferenceWrapUpLoading;
      body.innerHTML = `<section class="panel error"><h2>Wrap-Up could not load</h2><p>${esc(error.message)}</p></section>`;
    }
  }

  function renderWrapUp(body, id, context, cosigners) {
    const encounter = context?.encounter || null;
    const summary = context?.avs?.summary && typeof context.avs.summary === 'object' ? context.avs.summary : {};
    const instructions = context?.patientInstructions?.[0]?.body || context?.followUp?.instructions || summary.instructions || '';
    const timeframe = context?.followUp?.timeframe || summary.followUpTimeframe || '';
    const modifiers = arr(context?.modifiers);
    const cosigner = context?.attendingCosignerUserId || '';
    const signed = String(encounter?.status || '').toUpperCase() === 'SIGNED';

    body.innerHTML = `
      <section class="spire-reference-wrap">
        <div class="workspace-title compact">
          <div>
            <h2>Wrap-Up / After Visit Summary</h2>
            <p>Complete follow-up, instructions, coding readiness, cosigner routing and encounter closure in one workspace.</p>
          </div>
          <span class="spire-reference-encounter-status ${signed ? 'signed' : 'open'}">${encounter ? esc(encounter.status || 'OPEN') : 'NO OPEN ENCOUNTER'}</span>
        </div>
        ${encounter ? `
          <div class="spire-reference-wrap-grid">
            <article class="panel">
              <h3>1. Follow-Up</h3>
              <label>Follow-up timeframe
                <input id="spireRefFollowUp" value="${esc(timeframe)}" placeholder="Example: 4 weeks">
              </label>
              <label>Patient instructions
                <textarea id="spireRefInstructions" rows="8" placeholder="Instructions that belong on the After Visit Summary">${esc(instructions)}</textarea>
              </label>
            </article>
            <article class="panel">
              <h3>2. Coding &amp; Cosigner</h3>
              <label>Level of service
                <input id="spireRefServiceLevel" value="${esc(encounter.serviceLevel || summary.serviceLevel || '')}" placeholder="Visit / service level">
              </label>
              <fieldset>
                <legend>Modifiers</legend>
                ${arr(context.allowedModifiers || ['GC', 'GE', 'GT']).map((modifier) => `
                  <label class="check"><input type="checkbox" data-spire-ref-modifier value="${esc(modifier)}" ${modifiers.includes(modifier) ? 'checked' : ''}> ${esc(modifier)}</label>`).join('')}
              </fieldset>
              <label>Attending / clinical cosigner
                <select id="spireRefCosigner">
                  <option value="">No encounter cosigner</option>
                  ${cosigners.map((person) => `<option value="${esc(person.id)}" ${String(person.id) === String(cosigner) ? 'selected' : ''}>${esc(person.displayName || person.email || person.id)} · ${esc(person.role || '')}</option>`).join('')}
                </select>
              </label>
              <small>Note-level cosignature remains independently tracked and immutable after signing.</small>
            </article>
            <article class="panel">
              <h3>3. After Visit Summary</h3>
              <div class="spire-reference-avs-preview">
                <strong>${esc(sessionStorage.getItem('spire:patientName') || 'Patient')}</strong>
                <span>Encounter: ${esc(encounter.encounterType || '')}</span>
                <span>Started: ${esc(fmtDateTime(encounter.startedAt))}</span>
                <span>Follow-up: <b id="spireRefAvsFollow">${esc(timeframe || 'Not entered')}</b></span>
                <p id="spireRefAvsInstructions">${esc(instructions || 'Patient instructions have not been entered.')}</p>
              </div>
              <label>Closing note / reason
                <input id="spireRefCloseReason" value="Encounter completed and signed">
              </label>
            </article>
            <article class="panel spire-reference-checklist">
              <h3>4. Sign &amp; Close</h3>
              <label class="check"><input type="checkbox" id="spireRefCheckInstructions"> Instructions and follow-up reviewed</label>
              <label class="check"><input type="checkbox" id="spireRefCheckOrders"> Orders / medication plan reviewed</label>
              <label class="check"><input type="checkbox" id="spireRefCheckCoding"> Service level, modifiers and cosigner reviewed</label>
              <button type="button" class="danger" id="spireRefSignEncounter" ${signed ? 'disabled' : ''}>${signed ? 'Encounter Signed' : 'Sign & Close Encounter'}</button>
              <small>Signing closes the encounter and creates an audit event plus a stored After Visit Summary.</small>
            </article>
          </div>` : `
          <section class="panel spire-reference-empty">
            <strong>No open encounter is available for Wrap-Up.</strong>
            <p>Start an encounter from the patient chart or Schedule before documenting visit closure.</p>
            <button type="button" data-spire-action="encounter">Start Encounter</button>
          </section>`}
      </section>`;

    if (!encounter || signed) return;
    const followInput = body.querySelector('#spireRefFollowUp');
    const instructionInput = body.querySelector('#spireRefInstructions');
    const updatePreview = () => {
      body.querySelector('#spireRefAvsFollow').textContent = followInput.value.trim() || 'Not entered';
      body.querySelector('#spireRefAvsInstructions').textContent = instructionInput.value.trim() || 'Patient instructions have not been entered.';
    };
    followInput.addEventListener('input', updatePreview);
    instructionInput.addEventListener('input', updatePreview);

    body.querySelector('#spireRefSignEncounter').addEventListener('click', async () => {
      const required = ['#spireRefCheckInstructions', '#spireRefCheckOrders', '#spireRefCheckCoding'];
      if (required.some((selector) => !body.querySelector(selector)?.checked)) {
        toast('Complete the Wrap-Up checklist before signing.', true);
        return;
      }
      if (!confirm('Sign and close this encounter? Signed encounter closure is audit logged.')) return;
      const button = body.querySelector('#spireRefSignEncounter');
      button.disabled = true;
      button.textContent = 'Signing…';
      try {
        await api(`/api/spire/patients/${encodeURIComponent(id)}/wrap-up-reference`, {
          method: 'POST',
          body: JSON.stringify({
            encounterId: encounter.id,
            serviceLevel: body.querySelector('#spireRefServiceLevel').value,
            followUpTimeframe: followInput.value,
            instructions: instructionInput.value,
            reason: body.querySelector('#spireRefCloseReason').value,
            attendingCosignerUserId: body.querySelector('#spireRefCosigner').value || null,
            modifiers: [...body.querySelectorAll('[data-spire-ref-modifier]:checked')].map((input) => input.value),
          }),
        });
        sessionStorage.removeItem('spire:encounterId');
        body.dataset.spireReferenceWrapUp = '';
        toast('Encounter signed, closed and After Visit Summary stored.');
        enhanceWrapUpTab();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Sign & Close Encounter';
        toast(error.message || 'Unable to close encounter.', true);
      }
    });
  }

  function applyEnhancements() {
    installSettingsButton();
    applyPreferences();
    enhanceHome().catch(() => {});
    enhanceSchedule().catch(() => {});
    enhanceNoteEditor().catch(() => {});
    enhanceChartReviewCategories();
    enhanceWrapUpTab().catch(() => {});
  }

  function scheduleEnhancements() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(applyEnhancements, 45);
  }

  window.addEventListener('sulandra:entity-context-changed', () => {
    state.dashboardPromise = null;
    state.smartPhrases = null;
    state.schedulingContext = null;
    scheduleEnhancements();
  });

  new MutationObserver(scheduleEnhancements).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden'],
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyEnhancements, { once: true });
  } else {
    applyEnhancements();
  }
})();
