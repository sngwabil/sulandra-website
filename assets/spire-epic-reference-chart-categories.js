(() => {
  'use strict';

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const CATEGORIES = [
    ['ecg', 'ECG'],
    ['referrals', 'Referrals'],
    ['procedures', 'Procedures'],
    ['episodes', 'Episodes'],
    ['letters', 'Letters'],
  ];
  let timer = 0;
  let requestSequence = 0;

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

  const fmt = (value) => {
    if (!value) return '—';
    const date = new Date(String(value));
    return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
  };

  const patientId = () => {
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return sessionStorage.getItem('spire:patientId') || hash.get('patient') || hash.get('patientId') || '';
  };

  async function api(path) {
    const response = await fetch(API + path, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    }
    return payload.data ?? payload;
  }

  function activeChartReview() {
    return Boolean(
      document.querySelector('[data-chart-tab="chart-review"].active')
      && document.querySelector('#spireChartTabBody .spire-cr-main')
    );
  }

  function nativeResetButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.spireReferenceCategory = 'native';
    button.className = 'active';
    button.textContent = 'All Chart Review';
    button.addEventListener('click', () => {
      const tab = document.querySelector('[data-chart-tab="chart-review"]');
      if (!tab) return;
      requestSequence += 1;
      tab.click();
      setTimeout(install, 0);
    });
    return button;
  }

  function install() {
    if (!activeChartReview()) return;
    const main = document.querySelector('#spireChartTabBody .spire-cr-main');
    const toolbar = main?.querySelector('.spire-cr-toolbar');
    if (!main || !toolbar || main.querySelector('[data-spire-reference-category-bar]')) return;

    const bar = document.createElement('nav');
    bar.dataset.spireReferenceCategoryBar = 'true';
    bar.className = 'spire-reference-chart-categories';
    bar.setAttribute('aria-label', 'Additional chart review categories');
    bar.appendChild(nativeResetButton());

    for (const [category, label] of CATEGORIES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.spireReferenceCategory = category;
      button.textContent = label;
      button.addEventListener('click', () => loadCategory(category, label, bar, main));
      bar.appendChild(button);
    }

    toolbar.before(bar);
  }

  async function loadCategory(category, label, bar, main) {
    const id = patientId();
    if (!id) return;
    const sequence = ++requestSequence;
    bar.querySelectorAll('button').forEach((button) => {
      button.classList.toggle('active', button.dataset.spireReferenceCategory === category);
    });

    const itemsHost = main.querySelector('.spire-cr-items');
    const summary = main.querySelector('.spire-cr-summary');
    if (!itemsHost) return;
    itemsHost.innerHTML = `<div class="spire-cr-empty">Loading ${esc(label)} records…</div>`;

    try {
      const data = await api(
        `/api/spire/patients/${encodeURIComponent(id)}/reference-review/${encodeURIComponent(category)}`,
      );
      if (sequence !== requestSequence || !activeChartReview()) return;
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      itemsHost.innerHTML = items.length
        ? items.map((item) => card(item, label)).join('')
        : `<div class="spire-cr-empty">No ${esc(label.toLowerCase())} records are available for this chart.</div>`;
      if (summary) {
        summary.innerHTML = `
          <span><strong>${items.length}</strong> items</span>
          <span><strong>${esc(label)}</strong> category</span>
          <span>Selected from SPIRE longitudinal chart data</span>`;
      }
    } catch (error) {
      if (sequence !== requestSequence) return;
      itemsHost.innerHTML = `<div class="spire-cr-error">${esc(error.message || 'Unable to load this chart category.')}</div>`;
    }
  }

  function card(item, fallbackType) {
    const type = item.type || fallbackType;
    const description = item.description || item.title || 'Clinical item';
    const status = item.status || '—';
    const author = item.author || item.provider || '—';
    const abnormal = /critical|abnormal|high|low|positive|urgent/i.test(`${status} ${description}`);
    return `
      <article class="spire-cr-card ${abnormal ? 'abnormal' : ''}">
        <header>
          <div>
            <time>${esc(fmt(item.date || item.createdAt))}</time>
            <strong>${esc(type)}</strong>
            ${abnormal ? '<span class="spire-cr-flag">Review</span>' : ''}
          </div>
        </header>
        <h4>${esc(description)}</h4>
        <div class="spire-cr-meta">
          <span>Status: ${esc(status)}</span>
          <span>Author/Source: ${esc(author)}</span>
        </div>
      </article>`;
  }

  function scheduleInstall() {
    clearTimeout(timer);
    timer = setTimeout(install, 35);
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-chart-tab="chart-review"]')) {
      requestSequence += 1;
      setTimeout(scheduleInstall, 0);
    }
  });
  window.addEventListener('sulandra:entity-context-changed', () => {
    requestSequence += 1;
    scheduleInstall();
  });
  new MutationObserver(scheduleInstall).observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInstall, { once: true });
  } else {
    scheduleInstall();
  }
})();
