(() => {
  'use strict';

  const API_BASE = String(window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app').replace(/\/$/, '');
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const state = { loading: false, loaded: false, legalEntityId: '', code: '', data: null, sequence: 0 };
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  const currentEntity = () => window.SulandraCompanyContext?.current?.() || null;
  const text = (value) => String(value ?? '').trim();
  const validHex = (value) => /^#[0-9a-f]{6}$/i.test(text(value));

  function selectedCode() {
    return text(currentEntity()?.code || document.body?.dataset?.legalEntityCode || document.body?.dataset?.companyCode || '');
  }

  function selectedEntityId() {
    return text(currentEntity()?.id || document.body?.dataset?.legalEntityId || '');
  }

  async function loadPayload() {
    const authToken = token();
    const entityId = selectedEntityId();
    if (authToken && entityId) {
      const response = await fetch(`${API_BASE}/api/admin/company-settings`, {
        cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: `Bearer ${authToken}`, 'X-Legal-Entity-Id': entityId },
      });
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        const data = payload.data ?? payload;
        const settings = data.settings || {};
        const chronicles = settings.metadata?.companyChronicles || {};
        return {
          legalEntityId: data.legalEntityId || entityId,
          code: data.code || selectedCode(),
          displayName: data.displayName || settings.companyName || '',
          companyName: settings.companyName || data.displayName || '',
          companyEmail: settings.companyEmail || '',
          companyPhone: settings.companyPhone || '',
          website: settings.website || '',
          supportEmail: settings.supportEmail || '',
          supportPhone: settings.supportPhone || '',
          ...chronicles,
        };
      }
    }

    const params = new URLSearchParams();
    const code = selectedCode();
    if (code) params.set('code', code);
    params.set('host', location.host);
    const response = await fetch(`${API_BASE}/public/company-chronicles?${params.toString()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Company Chronicles request failed (${response.status}).`);
    const payload = await response.json().catch(() => ({}));
    return payload.data ?? payload;
  }

  function setText(selector, value) {
    if (!text(value)) return;
    document.querySelectorAll(selector).forEach((node) => { node.textContent = text(value); });
  }

  function setLink(selector, value, prefix = '') {
    if (!text(value)) return;
    document.querySelectorAll(selector).forEach((node) => {
      if ('href' in node) node.href = `${prefix}${text(value)}`;
      node.textContent = text(value);
    });
  }

  function applyLogo(url) {
    if (!text(url)) return;
    const candidates = [
      ...document.querySelectorAll('[data-company-logo]'),
      ...document.querySelectorAll('img[src*="mainlogo"], img[alt*="Sulandra Health Logo" i], img[alt="Sulandra Logo"]'),
    ];
    for (const node of new Set(candidates)) {
      if (node instanceof HTMLImageElement) node.src = text(url);
    }
  }

  function applyFavicon(url) {
    if (!text(url)) return;
    let link = document.querySelector('link[rel~="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = text(url);
  }

  function apply(data) {
    if (!data || typeof data !== 'object') return;
    state.data = { ...data };
    state.loaded = true;
    state.legalEntityId = text(data.legalEntityId);
    state.code = text(data.code);

    const companyName = text(data.companyName || data.displayName);
    if (companyName) {
      document.documentElement.dataset.companyName = companyName;
      setText('[data-company-name]', companyName);
      document.querySelectorAll('[data-company-name-attr]').forEach((node) => node.setAttribute(node.dataset.companyNameAttr, companyName));
      if (/Sulandra Health|Sulandra/i.test(document.title)) document.title = document.title.replace(/Sulandra Health|Sulandra/i, companyName);
    }

    if (state.code) document.documentElement.dataset.companyCode = state.code;
    if (validHex(data.primaryColor)) document.documentElement.style.setProperty('--primary', text(data.primaryColor));
    if (validHex(data.secondaryColor)) document.documentElement.style.setProperty('--secondary', text(data.secondaryColor));
    if (validHex(data.accentColor)) document.documentElement.style.setProperty('--accent', text(data.accentColor));
    if (validHex(data.primaryColor)) document.documentElement.style.setProperty('--brand-primary', text(data.primaryColor));
    if (validHex(data.secondaryColor)) document.documentElement.style.setProperty('--brand-secondary', text(data.secondaryColor));
    if (validHex(data.accentColor)) document.documentElement.style.setProperty('--brand-accent', text(data.accentColor));

    applyLogo(data.logoUrl);
    applyFavicon(data.faviconUrl);
    setText('[data-company-tagline]', data.brandTagline);
    setText('[data-company-email]', data.publicContactEmail || data.companyEmail || data.supportEmail);
    setText('[data-company-phone]', data.publicContactPhone || data.companyPhone || data.supportPhone);
    setLink('a[data-company-email-link]', data.publicContactEmail || data.companyEmail || data.supportEmail, 'mailto:');
    setLink('a[data-company-phone-link]', data.publicContactPhone || data.companyPhone || data.supportPhone, 'tel:');

    const theme = validHex(data.primaryColor) ? text(data.primaryColor) : '';
    if (theme) {
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
      }
      meta.content = theme;
    }

    window.dispatchEvent(new CustomEvent('sulandra:company-chronicles-applied', { detail: { ...state.data } }));
  }

  async function reload() {
    const sequence = ++state.sequence;
    if (state.loading) return;
    state.loading = true;
    try {
      const data = await loadPayload();
      if (sequence !== state.sequence) return;
      apply(data);
    } catch (error) {
      console.warn('[Company Chronicles]', error?.message || error);
    } finally {
      if (sequence === state.sequence) state.loading = false;
    }
  }

  window.SulandraCompanyChronicles = Object.freeze({ reload, apply, current: () => state.data ? { ...state.data } : null, state: () => ({ ...state, data: state.data ? { ...state.data } : null }) });
  window.addEventListener('sulandra:company-change', reload);
  window.addEventListener('sulandra:entity-context-changed', reload);
  window.addEventListener('sulandra:company-settings-updated', reload);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reload, { once: true });
  else reload();
})();
