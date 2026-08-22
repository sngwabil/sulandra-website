(() => {
  'use strict';

  const API_BASE = String(window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app').replace(/\/$/, '');
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const state = { entityId: '', loaded: false, saving: false, loading: false };
  const $ = (id) => document.getElementById(id);
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  const currentEntity = () => window.SulandraCompanyContext?.current?.() || null;
  const trim = (value) => String(value ?? '').trim();
  const nullable = (value) => trim(value) || null;
  const parseDomains = (value) => [...new Set(String(value || '').split(/[\n,]+/).map((item) => item.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '')).filter(Boolean))];

  function toast(title, message) {
    const root = $('toast');
    if (!root) return;
    if ($('toastTitle')) $('toastTitle').textContent = title;
    if ($('toastBody')) $('toastBody').textContent = message;
    root.classList.add('show');
    window.setTimeout(() => root.classList.remove('show'), 3500);
  }

  function ensureStyles() {
    if ($('adminCompanyChroniclesStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminCompanyChroniclesStyles';
    style.textContent = `
      #companyChroniclesPanel{margin-top:18px;border:1px solid #d7e5ed;border-radius:14px;background:linear-gradient(180deg,#fbfdff,#f7fbfd);padding:18px}
      #companyChroniclesPanel h3{margin:0 0 4px;color:var(--primary);font-size:18px}#companyChroniclesPanel .cc-sub{margin:0 0 14px;color:#61798a;font-size:12px}
      .company-chronicles-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.company-chronicles-field.wide{grid-column:1/-1}
      .company-chronicles-field label{display:block;margin-bottom:4px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:#536d80}
      .company-chronicles-field input,.company-chronicles-field textarea{width:100%;min-width:0;border:1px solid #c5d5df;border-radius:8px;background:#fff;padding:9px 10px;font:inherit;color:#223b4b}
      .company-chronicles-field textarea{min-height:76px;resize:vertical}.company-chronicles-field input[type=color]{height:42px;padding:4px}
      .company-chronicles-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}.company-chronicles-state{font-size:11px;font-weight:800;color:#688091}.company-chronicles-state.error{color:#9c332d}.company-chronicles-state.success{color:#17643a}
      @media(max-width:720px){.company-chronicles-grid{grid-template-columns:1fr}.company-chronicles-field.wide{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function field(id, label, type = 'text', wide = false, placeholder = '') {
    const wrap = document.createElement('div');
    wrap.className = `company-chronicles-field${wide ? ' wide' : ''}`;
    const labelNode = document.createElement('label');
    labelNode.htmlFor = id;
    labelNode.textContent = label;
    const input = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    if (type !== 'textarea') input.type = type;
    input.id = id;
    input.placeholder = placeholder;
    wrap.append(labelNode, input);
    return wrap;
  }

  function mount() {
    const module = $('module-settings');
    const form = module?.querySelector('form');
    if (!module || !form) return false;
    ensureStyles();
    const heading = module.querySelector('h1,h2');
    if (heading) heading.textContent = 'Company Chronicles';
    const sub = module.querySelector('.sub');
    if (sub) sub.textContent = 'Global company identity, contact, and white-label configuration for every Sulandra interface.';
    if ($('companyChroniclesPanel')) return true;

    const panel = document.createElement('section');
    panel.id = 'companyChroniclesPanel';
    panel.innerHTML = '<h3>Brand & Global Identity</h3><p class="cc-sub">These values are company-scoped and are consumed by the shared Sulandra branding runtime across published interfaces.</p>';
    const grid = document.createElement('div');
    grid.className = 'company-chronicles-grid';
    grid.append(
      field('ccLogoUrl', 'Primary Logo URL', 'url', true, 'https://… or /assets/…'),
      field('ccFaviconUrl', 'Favicon URL', 'url'),
      field('ccDocumentLogoUrl', 'Document Logo URL', 'url'),
      field('ccPrimaryColor', 'Primary Color', 'color'),
      field('ccSecondaryColor', 'Secondary Color', 'color'),
      field('ccAccentColor', 'Accent Color', 'color'),
      field('ccPublicEmail', 'Public Contact Email', 'email'),
      field('ccPublicPhone', 'Public Contact Phone', 'tel'),
      field('ccBrandTagline', 'Brand Tagline', 'text', true),
      field('ccDomains', 'Mapped Domains', 'textarea', true, 'One domain per line, e.g. www.example.com'),
    );
    panel.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'company-chronicles-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn-cta';
    save.id = 'companyChroniclesSave';
    save.textContent = 'Save Company Chronicles';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'btn btn-ghost';
    reload.id = 'companyChroniclesReload';
    reload.textContent = 'Reload Branding';
    const status = document.createElement('span');
    status.id = 'companyChroniclesState';
    status.className = 'company-chronicles-state';
    status.textContent = 'Waiting for selected company…';
    actions.append(save, reload, status);
    panel.appendChild(actions);

    const existingActions = $('adminCompanySettingsActions');
    if (existingActions?.parentElement === form) form.insertBefore(panel, existingActions);
    else form.appendChild(panel);

    save.addEventListener('click', saveChronicles);
    reload.addEventListener('click', loadChronicles);
    return true;
  }

  function setStatus(message, kind = '') {
    const node = $('companyChroniclesState');
    if (!node) return;
    node.textContent = message;
    node.classList.remove('error', 'success');
    if (kind) node.classList.add(kind);
  }

  function setBusy(value) {
    state.loading = value;
    for (const id of ['ccLogoUrl','ccFaviconUrl','ccDocumentLogoUrl','ccPrimaryColor','ccSecondaryColor','ccAccentColor','ccPublicEmail','ccPublicPhone','ccBrandTagline','ccDomains','companyChroniclesSave','companyChroniclesReload']) {
      if ($(id)) $(id).disabled = value;
    }
  }

  function write(values = {}) {
    const defaults = { primaryColor: '#004b8d', secondaryColor: '#0077c8', accentColor: '#d14124' };
    const data = { ...defaults, ...values };
    $('ccLogoUrl').value = data.logoUrl || '';
    $('ccFaviconUrl').value = data.faviconUrl || '';
    $('ccDocumentLogoUrl').value = data.documentLogoUrl || '';
    $('ccPrimaryColor').value = /^#[0-9a-f]{6}$/i.test(data.primaryColor || '') ? data.primaryColor : defaults.primaryColor;
    $('ccSecondaryColor').value = /^#[0-9a-f]{6}$/i.test(data.secondaryColor || '') ? data.secondaryColor : defaults.secondaryColor;
    $('ccAccentColor').value = /^#[0-9a-f]{6}$/i.test(data.accentColor || '') ? data.accentColor : defaults.accentColor;
    $('ccPublicEmail').value = data.publicContactEmail || '';
    $('ccPublicPhone').value = data.publicContactPhone || '';
    $('ccBrandTagline').value = data.brandTagline || '';
    $('ccDomains').value = Array.isArray(data.domains) ? data.domains.join('\n') : '';
  }

  function payload() {
    return {
      logoUrl: nullable($('ccLogoUrl')?.value),
      faviconUrl: nullable($('ccFaviconUrl')?.value),
      documentLogoUrl: nullable($('ccDocumentLogoUrl')?.value),
      primaryColor: trim($('ccPrimaryColor')?.value),
      secondaryColor: trim($('ccSecondaryColor')?.value),
      accentColor: trim($('ccAccentColor')?.value),
      publicContactEmail: nullable($('ccPublicEmail')?.value),
      publicContactPhone: nullable($('ccPublicPhone')?.value),
      brandTagline: nullable($('ccBrandTagline')?.value),
      domains: parseDomains($('ccDomains')?.value),
    };
  }

  async function request(init = {}) {
    const authToken = token();
    const entity = currentEntity();
    if (!authToken) throw new Error('Administrator sign-in is required.');
    if (!entity?.id) throw new Error('Select a company before managing Company Chronicles.');
    const response = await fetch(`${API_BASE}/api/admin/company-settings`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${authToken}`,
        'X-Legal-Entity-Id': entity.id,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || body.message || `Company Chronicles request failed (${response.status}).`);
    return body.data ?? body;
  }

  async function loadChronicles() {
    if (!mount()) return;
    const entity = currentEntity();
    if (!entity?.id) {
      write({});
      setStatus('Select an active company to load Company Chronicles.');
      return;
    }
    state.entityId = String(entity.id);
    setBusy(true);
    setStatus(`Loading ${entity.displayName || entity.code || 'company'} branding…`);
    try {
      const data = await request();
      write(data.settings?.metadata?.companyChronicles || {});
      state.loaded = true;
      setStatus('Company Chronicles loaded from PostgreSQL.', 'success');
    } catch (error) {
      state.loaded = false;
      setStatus(error.message || 'Unable to load Company Chronicles.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveChronicles() {
    if (state.saving) return;
    const entity = currentEntity();
    if (!entity?.id) return setStatus('Select a company before saving.', 'error');
    state.saving = true;
    setBusy(true);
    setStatus('Saving Company Chronicles…');
    try {
      const data = await request({ method: 'PATCH', body: JSON.stringify({ metadata: { companyChronicles: payload() } }) });
      write(data.settings?.metadata?.companyChronicles || payload());
      setStatus('Company Chronicles saved and applied.', 'success');
      toast('Company Chronicles saved', `${entity.displayName || entity.code || 'Selected company'} branding is now authoritative.`);
      window.dispatchEvent(new CustomEvent('sulandra:company-settings-updated', { detail: { legalEntityId: entity.id, settings: data.settings || {} } }));
      await window.SulandraCompanyChronicles?.reload?.();
    } catch (error) {
      setStatus(error.message || 'Company Chronicles were not saved.', 'error');
      toast('Company Chronicles not saved', error.message || 'Unable to save branding configuration.');
    } finally {
      state.saving = false;
      setBusy(false);
    }
  }

  async function initialize() {
    if (!mount()) return;
    try { await window.SulandraCompanyContext?.initialize?.(); } catch {}
    await loadChronicles();
  }

  window.SulandraAdminCompanyChronicles = Object.freeze({ reload: loadChronicles, save: saveChronicles, state: () => ({ ...state }) });
  window.addEventListener('sulandra:company-change', loadChronicles);
  window.addEventListener('sulandra:entity-context-changed', () => {
    if (String(currentEntity()?.id || '') !== state.entityId) loadChronicles();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
