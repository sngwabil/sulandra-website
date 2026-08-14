(() => {
  'use strict';

  // SPIRE_CHART_PROFILE_IMAGES_V2
  // SPIRE_CHART_PROFILE_IMAGES_V3
  // patient-scoped chart database records
  // Patient-scoped client and PCP photos are stored in PostgreSQL and loaded
  // through authenticated chart endpoints. The client avatar in master.html is
  // an <img>, so durable photos must update its src directly rather than trying
  // to render a nested <img> inside it.

  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const MAX_INPUT_BYTES = 12 * 1024 * 1024;

  let currentPatient = '';
  let refreshTimer = 0;
  let observer = null;
  let refreshing = false;
  const state = {
    client: { objectUrl: '', sha256: '' },
    pcp: { objectUrl: '', sha256: '', providerName: '' },
  };

  const clean = (value) => String(value ?? '').trim();
  const providerKey = (value) => clean(value).toLowerCase().replace(/\s+/g, ' ');

  function token() {
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of TOKEN_KEYS) {
        const value = storage.getItem(key);
        if (value) return value;
      }
    }
    return '';
  }

  function patientId() {
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const query = new URLSearchParams(location.search);
    return hash.get('patient')
      || hash.get('patientId')
      || query.get('patient')
      || query.get('patientId')
      || sessionStorage.getItem('spire:patientId')
      || '';
  }

  function patientName() {
    const first = clean(document.querySelector('#displayNameFirst')?.textContent);
    const last = clean(document.querySelector('#displayNameLast')?.textContent);
    return [first, last].filter(Boolean).join(' ') || 'Client';
  }

  function pcpName() {
    return clean(document.querySelector('#displayPCP')?.textContent) || 'Primary Care Provider';
  }

  function pcpNameIsReady() {
    const value = pcpName();
    return Boolean(value)
      && !/^primary care provider$/i.test(value)
      && !/^—$/.test(value)
      && !/^\[.*\]$/.test(value)
      && !/^\[pcp\b/i.test(value);
  }

  function initials(value, fallback = '—') {
    const result = clean(value)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
    return result || fallback;
  }

  function initialsDataUrl(value, fallback = 'SS') {
    const label = initials(value, fallback).replace(/[<>&"']/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#dceef7"/><circle cx="64" cy="64" r="61" fill="none" stroke="#7eafc5" stroke-width="2"/><text x="64" y="73" text-anchor="middle" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="#176780">${label}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  async function apiJson(path, options = {}) {
    const body = options.body;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers = new Headers(options.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (body != null && !isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const accessToken = token();
    if (accessToken && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(/^https?:\/\//i.test(path) ? path : API_BASE + path, {
      ...options,
      headers,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || payload?.error || payload?.message || `Request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return payload?.data ?? payload;
  }

  async function fetchPhotoBlob(patient, kind, sha256) {
    const headers = new Headers({ Accept: 'image/*' });
    const accessToken = token();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const version = sha256 ? `?v=${encodeURIComponent(sha256)}` : '';
    const response = await fetch(`${API_BASE}/api/spire/patients/${encodeURIComponent(patient)}/profile-images/${encodeURIComponent(kind)}/content${version}`, {
      headers,
      cache: 'no-store',
    });
    if (!response.ok) {
      const error = new Error(`Unable to load chart photo (${response.status})`);
      error.status = response.status;
      throw error;
    }
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('The saved chart photo did not return image content.');
    return blob;
  }

  function revokeUrl(kind) {
    const slot = state[kind];
    if (slot.objectUrl) URL.revokeObjectURL(slot.objectUrl);
    slot.objectUrl = '';
    slot.sha256 = '';
    if (kind === 'pcp') slot.providerName = '';
  }

  function ensureStyles() {
    if (document.getElementById('spireChartProfileImageStyles')) return;
    const style = document.createElement('style');
    style.id = 'spireChartProfileImageStyles';
    style.textContent = `
      #avatarDisplay{border-radius:50%!important;overflow:hidden!important;aspect-ratio:1/1!important;width:54px!important;height:54px!important;min-width:54px!important;object-fit:cover!important;object-position:center!important;display:block!important;background:#dceef7!important;border:2px solid #fff!important;outline:1px solid #7eafc5!important;color:#176780!important;font-weight:900!important}
      #avatarDisplay[data-spire-durable-client-photo="1"]{object-fit:cover!important;object-position:center!important}
      .spire-chart-pcp-row{display:flex!important;align-items:center!important;gap:7px!important;margin:4px 0 5px!important;padding:5px!important;border:1px solid #bdd7e3!important;border-radius:4px!important;background:linear-gradient(135deg,#f8fdff,#eef8fc)!important}
      .spire-chart-pcp-photo{position:relative!important;width:42px!important;height:42px!important;min-width:42px!important;border-radius:50%!important;border:2px solid #fff!important;outline:1px solid #78a9c0!important;overflow:hidden!important;padding:0!important;background:#d9edf6!important;color:#156789!important;display:grid!important;place-items:center!important;cursor:pointer!important;font-size:10px!important;font-weight:900!important}
      .spire-chart-pcp-photo img{width:100%!important;height:100%!important;object-fit:cover!important;object-position:center!important;border-radius:50%!important;display:block!important}
      .spire-chart-pcp-photo i{position:absolute;right:-1px;bottom:-1px;width:15px;height:15px;border-radius:50%;display:grid;place-items:center;background:#0878b5;color:#fff;font-size:11px;font-style:normal;border:1px solid #fff}
      .spire-chart-pcp-copy{min-width:0;display:flex!important;flex-direction:column;line-height:1.15}
      .spire-chart-pcp-copy>b{font-size:9px!important;text-transform:uppercase!important;color:#59717e!important}
      .spire-chart-pcp-copy>span{margin-top:2px;font-size:10.5px!important;font-weight:900!important;color:#126ea1!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .spire-chart-pcp-copy>button{align-self:flex-start;margin-top:3px;padding:1px 5px;border:1px solid #91b4c5;background:#fff;color:#176c94;border-radius:2px;font-size:8.5px;font-weight:800;cursor:pointer}
      .spire-chart-photo-saving{opacity:.58!important;pointer-events:none!important}
      :root[data-spire-preset="darkClinicalSummary"] .spire-chart-pcp-row{background:#292c32!important;border-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] .spire-chart-pcp-copy>b{color:#aebcc4!important}
      :root[data-spire-preset="darkClinicalSummary"] .spire-chart-pcp-copy>span{color:#73cef5!important}
    `;
    document.head.appendChild(style);
  }

  function showMessage(message, type = 'info') {
    if (typeof window.showBanner === 'function') {
      window.showBanner(message, type);
      return;
    }
    const existing = document.getElementById('spireDataBanner');
    if (existing) {
      existing.textContent = message;
      existing.classList.add('show');
      window.setTimeout(() => existing.classList.remove('show'), 5500);
      return;
    }
    console.info('[SPIRE profile images]', message);
  }

  function renderClientPhoto(url, sha256) {
    const avatar = document.querySelector('#avatarDisplay');
    if (!avatar) return false;

    // master.html currently defines #avatarDisplay as an <img>. Older code treated
    // it like a div and inserted another <img> inside it; browsers ignore children
    // of an image element, which is why saves succeeded while the placeholder stayed.
    if (avatar instanceof HTMLImageElement) {
      if (!url) {
        avatar.removeAttribute('data-spire-durable-client-photo');
        avatar.removeAttribute('data-image-sha');
        avatar.src = initialsDataUrl(patientName(), 'SS');
        avatar.alt = `${patientName()} profile placeholder`;
        avatar.title = 'Client chart photo — click to upload';
        return true;
      }
      if (avatar.dataset.spireDurableClientPhoto === '1'
        && avatar.dataset.imageSha === String(sha256)
        && avatar.src === url) return true;
      avatar.src = url;
      avatar.dataset.spireDurableClientPhoto = '1';
      avatar.dataset.imageSha = String(sha256);
      avatar.alt = `${patientName()} profile photo`;
      avatar.title = 'Client chart photo — click to update';
      return true;
    }

    if (!url) {
      avatar.replaceChildren();
      avatar.textContent = initials(patientName(), 'SS');
      avatar.removeAttribute('data-image-sha');
      return true;
    }
    let image = avatar.querySelector('img[data-spire-durable-client-photo]');
    if (!image) {
      avatar.replaceChildren();
      image = document.createElement('img');
      image.dataset.spireDurableClientPhoto = '1';
      avatar.appendChild(image);
    }
    image.dataset.imageSha = String(sha256);
    image.src = url;
    image.alt = `${patientName()} profile photo`;
    avatar.title = 'Client chart photo — click to update';
    return true;
  }

  function removeLegacyPcpPhoto() {
    window.__SPIRE_DISABLE_LEGACY_PCP_PHOTO = true;
    document.querySelectorAll('[data-spire-pcp-photo]').forEach((node) => node.remove());
    const legacyKey = `spire:pcp-photo:${patientId() || 'unselected'}`;
    try { localStorage.removeItem(legacyKey); } catch (_) {}
  }

  function ensurePcpRow() {
    removeLegacyPcpPhoto();
    const group = document.querySelector('.sidebar-card.clinical .client-info-group');
    const pcpValue = document.querySelector('#displayPCP');
    if (!group || !pcpValue) return null;

    const originalLine = pcpValue.closest('div');
    if (originalLine) {
      originalLine.hidden = true;
      originalLine.dataset.spirePcpOriginalLine = '1';
    }

    const duplicates = Array.from(group.querySelectorAll('[data-spire-chart-pcp-photo]'));
    duplicates.slice(1).forEach((node) => node.remove());
    let row = duplicates[0] || null;
    if (!row) {
      row = document.createElement('div');
      row.className = 'spire-chart-pcp-row';
      row.dataset.spireChartPcpPhoto = '1';
      row.innerHTML = `<button type="button" class="spire-chart-pcp-photo" data-spire-pcp-photo-button title="Upload / change this client's PCP photo">
          <span data-spire-pcp-initials>PCP</span><i>+</i>
        </button>
        <div class="spire-chart-pcp-copy">
          <b>Primary Care Provider</b>
          <span data-spire-pcp-name></span>
          <button type="button" data-spire-pcp-photo-change>Upload Photo</button>
        </div>
        <input type="file" accept="image/jpeg,image/png,image/webp" data-spire-pcp-photo-input hidden>`;
      if (originalLine) group.insertBefore(row, originalLine);
      else group.prepend(row);

      const input = row.querySelector('[data-spire-pcp-photo-input]');
      const openPicker = (event) => {
        event?.preventDefault();
        if (!pcpNameIsReady()) {
          window.alert('Wait for this client’s PCP information to finish loading, then upload the PCP photo.');
          return;
        }
        input?.click();
      };
      row.querySelector('[data-spire-pcp-photo-button]')?.addEventListener('click', openPicker);
      row.querySelector('[data-spire-pcp-photo-change]')?.addEventListener('click', openPicker);
      input?.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        await savePhoto('pcp', file, row);
      });
    }

    const nextName = pcpName();
    const nameNode = row.querySelector('[data-spire-pcp-name]');
    if (nameNode && nameNode.textContent !== nextName) nameNode.textContent = nextName;
    const initialsNode = row.querySelector('[data-spire-pcp-initials]');
    if (initialsNode && initialsNode.textContent !== initials(nextName, 'PCP')) initialsNode.textContent = initials(nextName, 'PCP');
    return row;
  }

  function renderPcpPhoto(url, sha256) {
    const row = ensurePcpRow();
    if (!row) return false;
    const button = row.querySelector('[data-spire-pcp-photo-button]');
    if (!button) return false;
    const existing = button.querySelector('img[data-spire-durable-pcp-photo]');
    const initialsNode = button.querySelector('[data-spire-pcp-initials]');
    if (!url) {
      existing?.remove();
      if (initialsNode) initialsNode.hidden = false;
      return true;
    }
    let image = existing;
    if (!image) {
      image = document.createElement('img');
      image.dataset.spireDurablePcpPhoto = '1';
      button.insertBefore(image, button.firstChild);
    }
    image.dataset.imageSha = String(sha256);
    image.alt = `${pcpName()} photo`;
    image.src = url;
    if (initialsNode) initialsNode.hidden = true;
    return true;
  }

  function ensureClientPhotoInput() {
    let input = document.getElementById('spireClientDurablePhotoInput');
    if (!input) {
      input = document.createElement('input');
      input.id = 'spireClientDurablePhotoInput';
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.hidden = true;
      document.body.appendChild(input);
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        await savePhoto('client', file, document.querySelector('#avatarBox'));
      });
    }

    const box = document.querySelector('#avatarBox');
    if (box && box.dataset.spireDurablePhotoClick !== '1') {
      box.dataset.spireDurablePhotoClick = '1';
      box.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.click();
      }, true);
    }
    return input;
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return reject(new Error('Choose a JPG, PNG, or WebP image.'));
      if (file.size > MAX_INPUT_BYTES) return reject(new Error('Choose an image smaller than 12 MB.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to read that image.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Unable to open that image.'));
        image.onload = () => {
          const side = Math.min(image.naturalWidth, image.naturalHeight);
          const sx = Math.max(0, (image.naturalWidth - side) / 2);
          const sy = Math.max(0, (image.naturalHeight - side) / 2);
          const canvas = document.createElement('canvas');
          canvas.width = 512;
          canvas.height = 512;
          const context = canvas.getContext('2d');
          if (!context) return reject(new Error('Image processing is unavailable in this browser.'));
          context.drawImage(image, sx, sy, side, side, 0, 0, 512, 512);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        };
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  async function savePhoto(kind, file, busyNode) {
    const patient = patientId();
    if (!patient) return window.alert('Open a client chart before uploading a photo.');
    if (kind === 'pcp' && !pcpNameIsReady()) {
      return window.alert('Wait for this client’s PCP information to finish loading, then upload the PCP photo.');
    }

    let persisted = false;
    busyNode?.classList.add('spire-chart-photo-saving');
    try {
      const dataBase64 = await compressImage(file);
      const saved = await apiJson(`/api/spire/patients/${encodeURIComponent(patient)}/profile-images/${kind}`, {
        method: 'PUT',
        body: JSON.stringify({
          dataBase64,
          mimeType: 'image/jpeg',
          ...(kind === 'pcp' ? { providerName: pcpName() } : {}),
        }),
      });
      persisted = true;

      revokeUrl(kind);
      await loadKind(kind, patient, saved);
      showMessage(kind === 'client'
        ? 'Client photo saved and displayed on this client chart.'
        : 'PCP photo saved and displayed on this client chart.', 'success');
      scheduleRefresh(350);
    } catch (error) {
      const message = persisted
        ? 'The photo was saved to the chart, but SPIRE could not display it. Refresh the chart and try again.'
        : error?.status === 403
          ? 'Your role can view this chart but does not have permission to change clinical profile photos.'
          : (error?.message || 'The chart photo could not be saved.');
      window.alert(message);
    } finally {
      busyNode?.classList.remove('spire-chart-photo-saving');
    }
  }

  async function loadKind(kind, patient, metadata) {
    const slot = state[kind];
    if (!metadata?.sha256) {
      revokeUrl(kind);
      if (kind === 'pcp') renderPcpPhoto('', '');
      else renderClientPhoto('', '');
      return;
    }

    if (kind === 'pcp') {
      const currentProvider = pcpName();
      if (!pcpNameIsReady() || providerKey(metadata.providerName) !== providerKey(currentProvider)) {
        revokeUrl('pcp');
        renderPcpPhoto('', '');
        return;
      }
    }

    if (slot.sha256 === String(metadata.sha256) && slot.objectUrl) {
      if (kind === 'client') renderClientPhoto(slot.objectUrl, slot.sha256);
      else renderPcpPhoto(slot.objectUrl, slot.sha256);
      return;
    }

    const blob = await fetchPhotoBlob(patient, kind, metadata.sha256);
    revokeUrl(kind);
    slot.objectUrl = URL.createObjectURL(blob);
    slot.sha256 = String(metadata.sha256);
    if (kind === 'pcp') slot.providerName = clean(metadata.providerName);
    if (kind === 'client') renderClientPhoto(slot.objectUrl, slot.sha256);
    else renderPcpPhoto(slot.objectUrl, slot.sha256);
  }

  async function refresh(force = false) {
    if (refreshing) return;
    const patient = patientId();
    ensureStyles();
    ensureClientPhotoInput();
    ensurePcpRow();
    if (!patient) return;

    const patientChanged = currentPatient !== patient;
    if (patientChanged) {
      currentPatient = patient;
      revokeUrl('client');
      revokeUrl('pcp');
      removeLegacyPcpPhoto();
    }

    refreshing = true;
    try {
      const metadata = await apiJson(`/api/spire/patients/${encodeURIComponent(patient)}/profile-images`);
      await Promise.all([
        loadKind('client', patient, metadata?.client).catch((error) => console.warn('[SPIRE profile images] client photo load failed', error)),
        loadKind('pcp', patient, metadata?.pcp).catch((error) => console.warn('[SPIRE profile images] PCP photo load failed', error)),
      ]);
      if (force) {
        ensurePcpRow();
        ensureClientPhotoInput();
      }
    } catch (error) {
      console.warn('[SPIRE profile images] profile metadata load failed', error);
    } finally {
      refreshing = false;
    }
  }

  function scheduleRefresh(delay = 120) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => refresh(false), delay);
  }

  function observeSidebar() {
    const sidebar = document.querySelector('.client-sidebar');
    if (!sidebar || observer) return;
    observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === 'childList')) scheduleRefresh(180);
    });
    observer.observe(sidebar, { childList: true, subtree: true });
  }

  function install() {
    ensureStyles();
    ensureClientPhotoInput();
    ensurePcpRow();
    observeSidebar();
    refresh(true);
    window.addEventListener('hashchange', () => scheduleRefresh(220));
    window.addEventListener('popstate', () => scheduleRefresh(220));
    window.addEventListener('beforeunload', () => {
      revokeUrl('client');
      revokeUrl('pcp');
    });
    window.__SPIRE_CHART_PROFILE_IMAGES = Object.freeze({
      marker: 'SPIRE_CHART_PROFILE_IMAGES_V3',
      storage: 'patient-scoped PostgreSQL chart profile records',
      refresh: () => refresh(true),
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
