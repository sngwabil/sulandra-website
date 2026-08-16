(() => {
  'use strict';
  // SPIRE_MEDICATION_ROW_CONTROLS_V2
  if (window.__SPIRE_MEDICATION_ROW_CONTROLS_V2) return;
  window.__SPIRE_MEDICATION_ROW_CONTROLS_V2 = true;

  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  const PATIENT_KEY = 'spire:patientId';
  const SESSION_KEY = 'sulandra:employee:session';
  const clean = (value) => String(value ?? '').trim();
  const norm = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const token = () => TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';
  const patientId = () => {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return clean(query.get('patientId') || hash.get('patient') || sessionStorage.getItem(PATIENT_KEY));
  };
  const homeId = () => clean(new URLSearchParams(location.search).get('spireHome') || sessionStorage.getItem(HOME_ID_KEY) || localStorage.getItem(HOME_ID_KEY));
  const companyId = () => clean(new URLSearchParams(location.search).get('company') || sessionStorage.getItem(HOME_ENTITY_KEY) || sessionStorage.getItem(ENTITY_KEY) || localStorage.getItem(ENTITY_KEY));

  function role() {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        const parsed = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
        const user = parsed?.user || parsed?.session || parsed;
        const value = clean(user?.role).toUpperCase();
        if (value) return value;
      } catch {}
    }
    return '';
  }

  const MANAGE_ROLES = new Set([
    'ADMINISTRATOR','PROGRAM_MANAGER','CEO','DOO','COO','DELEGATING_NURSE',
    'RN','REGISTERED_NURSE','LPN','LICENSED_PRACTICAL_NURSE'
  ]);
  const canManage = () => MANAGE_ROLES.has(role());

  let cache = { patientId: '', loadedAt: 0, orders: [] };
  let decorating = false;
  let decorateTimer = 0;
  let panelObserver = null;
  let observedPanel = null;
  let manageObserver = null;
  const CACHE_MS = 15000;

  function installStyles() {
    if (document.getElementById('spire-medication-row-controls-style')) return;
    const style = document.createElement('style');
    style.id = 'spire-medication-row-controls-style';
    style.textContent = `
      .spire-med-row-manage{margin-left:8px;border:1px solid #7fa8ba;background:#f8fcfe;color:#13526a;border-radius:3px;padding:2px 7px;font:800 10px/1.35 "Segoe UI",Arial,sans-serif;cursor:pointer;vertical-align:1px}
      .spire-med-row-manage:hover,.spire-med-row-manage:focus-visible{background:#e4f4fa;border-color:#3d879f;outline:none}
      .spire-med-row-manage:disabled{opacity:.5;cursor:not-allowed}
      .spire-med-row-managed{position:relative}
      #spireMedicationManageModal[data-spire-focused-order] .spire-med-list{padding-top:8px}
      #spireMedicationManageModal .spire-med-focused-caption{margin:10px 12px 0;padding:7px 9px;background:#edf8fc;border:1px solid #b5d7e4;border-radius:4px;color:#22566c;font-size:10px;font-weight:700}
    `;
    document.head.appendChild(style);
  }

  async function api(path) {
    const headers = new Headers({ Accept: 'application/json' });
    if (token()) headers.set('Authorization', `Bearer ${token()}`);
    if (companyId()) headers.set('x-legal-entity-id', companyId());
    if (homeId()) headers.set('x-spire-home-id', homeId());
    const response = await fetch(API + path, { headers, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data ?? payload;
  }

  function invalidateOrders() {
    cache = { patientId: '', loadedAt: 0, orders: [] };
  }

  async function ordersForPatient(force = false) {
    const id = patientId();
    if (!id) return [];
    const now = Date.now();
    if (!force && cache.patientId === id && now - cache.loadedAt < CACHE_MS) return cache.orders;
    const data = await api(`/api/spire/medication-orders-v2/clients/${encodeURIComponent(id)}`);
    const orders = Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : [];
    cache = { patientId: id, loadedAt: now, orders };
    return orders;
  }

  function medicationWorkspace() {
    return document.querySelector('#manage-orders-view');
  }

  function medicationPanel() {
    const workspace = medicationWorkspace();
    if (!workspace) return null;
    const heading = [...workspace.querySelectorAll('h1,h2,h3,h4,strong,div,span')]
      .find((node) => clean(node.textContent) === 'Active Medication Orders');
    if (!heading) return workspace;
    return heading.closest('.spire-kv-card,.summary-card,.card,.panel,section') || heading.parentElement || workspace;
  }

  function rowDetails(row) {
    const name = clean(row.querySelector('b,strong')?.textContent);
    const text = clean(row.textContent).replace(name, '').replace(/Manage\s*$/i, '').trim();
    return { name, text: norm(text) };
  }

  function matchRows(rows, orders) {
    const available = orders.filter((order) => ['ACTIVE','HELD'].includes(clean(order.status).toUpperCase()));
    const used = new Set();
    return rows.map((row) => {
      const details = rowDetails(row);
      let best = null;
      let bestScore = -1;
      available.forEach((order, index) => {
        if (used.has(index) || norm(order.name) !== norm(details.name)) return;
        let score = 10;
        for (const value of [order.dose, order.route, order.frequency]) {
          const normalized = norm(value);
          if (normalized && details.text.includes(normalized)) score += 3;
        }
        if (score > bestScore) { bestScore = score; best = { order, index }; }
      });
      if (best) used.add(best.index);
      return { row, order: best?.order || null };
    });
  }

  function applyManageFocus(modal) {
    const focusId = clean(modal?.dataset?.spireFocusedOrder);
    if (!modal || !focusId || modal.hidden) return;
    const rows = [...modal.querySelectorAll('[data-order-id]')];
    if (!rows.length) return;
    rows.forEach((row) => { row.style.display = clean(row.dataset.orderId) === focusId ? '' : 'none'; });
    const focused = rows.find((row) => clean(row.dataset.orderId) === focusId);
    const name = clean(focused?.querySelector('.spire-med-order-name')?.textContent) || 'selected medication';
    let caption = modal.querySelector('.spire-med-focused-caption');
    if (!caption) {
      caption = document.createElement('div');
      caption.className = 'spire-med-focused-caption';
      modal.querySelector('.spire-med-card>header')?.insertAdjacentElement('afterend', caption);
    }
    caption.textContent = `Managing this medication only: ${name}`;
  }

  function watchManageModal(modal) {
    manageObserver?.disconnect();
    manageObserver = new MutationObserver(() => applyManageFocus(modal));
    manageObserver.observe(modal, { childList: true, subtree: true });
    applyManageFocus(modal);
  }

  function openManageFor(orderId) {
    // Preserve the canonical medication manager as the authority. The row button
    // merely focuses that manager on one medication; the canonical trigger stays
    // visible as a fallback instead of being hidden by this helper.
    const generic = document.querySelector('[data-spire-manage-medication-orders]');
    if (!generic) {
      window.alert('Medication management is still loading. Try again in a moment.');
      return;
    }
    generic.click();
    const focus = () => {
      const modal = document.getElementById('spireMedicationManageModal');
      if (!modal) return false;
      modal.dataset.spireFocusedOrder = orderId;
      watchManageModal(modal);
      return true;
    };
    if (!focus()) {
      let tries = 0;
      const timer = window.setInterval(() => {
        tries += 1;
        if (focus() || tries > 20) window.clearInterval(timer);
      }, 60);
    }
  }

  function rowsInPanel(panel) {
    if (!panel) return [];
    return [...panel.querySelectorAll(':scope > p')].filter((row) => row.querySelector('b,strong'));
  }

  async function decorate(force = false) {
    if (decorating || !canManage()) return;
    const panel = medicationPanel();
    if (!panel) return;
    const rows = rowsInPanel(panel);
    if (!rows.length) return;
    decorating = true;
    try {
      installStyles();
      const orders = await ordersForPatient(force);
      for (const { row, order } of matchRows(rows, orders)) {
        row.classList.add('spire-med-row-managed');
        const existing = row.querySelector(':scope > .spire-med-row-manage');
        if (!order) { existing?.remove(); continue; }
        const button = existing || document.createElement('button');
        button.type = 'button';
        button.className = 'spire-med-row-manage';
        button.textContent = 'Manage';
        button.dataset.spireMedicationOrderId = clean(order.id);
        button.title = `Manage ${clean(order.name)}`;
        if (!existing) {
          const br = row.querySelector(':scope > br');
          if (br) row.insertBefore(button, br);
          else row.appendChild(button);
        }
        button.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          openManageFor(button.dataset.spireMedicationOrderId);
        };
      }
    } catch (error) {
      console.warn('[SPIRE medication row controls]', error);
    } finally {
      decorating = false;
    }
  }

  function scheduleDecorate(delay = 80, force = false) {
    window.clearTimeout(decorateTimer);
    decorateTimer = window.setTimeout(() => decorate(force), delay);
  }

  function ensurePanelObserver() {
    const panel = medicationPanel();
    if (!panel || panel === observedPanel) return;
    panelObserver?.disconnect();
    observedPanel = panel;
    panelObserver = new MutationObserver((mutations) => {
      if (decorating) return;
      if (mutations.some((mutation) => mutation.addedNodes.length || mutation.removedNodes.length)) {
        scheduleDecorate(100, false);
      }
    });
    panelObserver.observe(panel, { childList: true, subtree: true });
  }

  function activate(force = false) {
    ensurePanelObserver();
    scheduleDecorate(80, force);
  }

  document.addEventListener('click', (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const tab = element?.closest('.chart-tab[data-view="manage-orders-view"]');
    if (tab) window.setTimeout(() => activate(true), 0);
    if (element?.closest('#spireMedicationManageModal button,[data-spire-medication-save]')) {
      invalidateOrders();
      window.setTimeout(() => activate(true), 250);
    }
  }, true);

  for (const name of ['spire:client-changed','spire:patient-changed','sulandra:company-change']) {
    document.addEventListener(name, () => {
      invalidateOrders();
      observedPanel = null;
      panelObserver?.disconnect();
      window.setTimeout(() => activate(true), 0);
    });
  }
  window.addEventListener('popstate', () => { invalidateOrders(); window.setTimeout(() => activate(true), 0); });
  window.addEventListener('hashchange', () => { invalidateOrders(); window.setTimeout(() => activate(true), 0); });

  // Deliberately no document-wide MutationObserver. The prior implementation
  // watched document.documentElement and reacted to every chart mutation, which
  // could create a high-frequency decorate/fetch loop and freeze SPIRE.
  activate(true);
  window.setTimeout(() => activate(false), 500);
})();
