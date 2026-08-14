(() => {
  'use strict';

  // SPIRE_CHART_PROFILE_IMAGES_V1
  // Client and PCP photos are stored as patient-scoped clinical documents in the
  // existing secure S.P.I.R.E. object store. Nothing in this module uses a shared
  // template photo or browser localStorage for clinical profile images.

  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const CLIENT_CATEGORY = 'SPIRE_CLIENT_PROFILE_PHOTO';
  const PCP_CATEGORY = 'SPIRE_PCP_PROFILE_PHOTO';
  const CLIENT_TITLE = 'Client Profile Photo';
  const PCP_TITLE_PREFIX = 'Primary Care Provider Photo';
  const MAX_INPUT_BYTES = 12 * 1024 * 1024;

  let currentPatient = '';
  let clientObjectUrl = '';
  let pcpObjectUrl = '';
  let clientDocumentId = '';
  let pcpDocumentId = '';
  let refreshTimer = 0;
  let observer = null;
  let refreshing = false;

  const clean = (value) => String(value ?? '').trim();

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
    return hash.get('patient') || query.get('patientId') || sessionStorage.getItem('spire:patientId') || '';
  }

  function patientName() {
    const first = clean(document.querySelector('#displayNameFirst')?.textContent);
    const last = clean(document.querySelector('#displayNameLast')?.textContent);
    return [first, last].filter(Boolean).join(' ') || 'Client';
  }

  function pcpName() {
    return clean(document.querySelector('#displayPCP')?.textContent) || 'Primary Care Provider';
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

  async function fetchPhotoBlob(patient, documentId) {
    const headers = new Headers({ Accept: 'image/*' });
    const accessToken = token();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(`${API_BASE}/api/spire/patients/${encodeURIComponent(patient)}/documents/${encodeURIComponent(documentId)}/content`, {
      headers,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Unable to load chart photo (${response.status})`);
    return response.blob();
  }

  async function listPhotoDocuments(patient, category) {
    const data = await apiJson(`/api/spire/patients/${encodeURIComponent(patient)}/documents?category=${encodeURIComponent(category)}`);
    return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  }

  function pcpDocumentTitle() {
    return `${PCP_TITLE_PREFIX} — ${pcpName()}`.slice(0, 250);
  }

  function chooseDocument(documents, kind) {
    if (kind === 'client') {
      return documents.find((document) => clean(document.title) === CLIENT_TITLE) || null;
    }
    const exactTitle = pcpDocumentTitle();
    return documents.find((document) => clean(document.title) === exactTitle) || null;
  }

  function revokeUrl(kind) {
    const value = kind === 'client' ? clientObjectUrl : pcpObjectUrl;
    if (value) URL.revokeObjectURL(value);
    if (kind === 'client') {
      clientObjectUrl = '';
      clientDocumentId = '';
    } else {
      pcpObjectUrl = '';
      pcpDocumentId = '';
    }
  }

  function ensureStyles() {
    if (document.getElementById('spireChartProfileImageStyles')) return;
    const style = document.createElement('style');
    style.id = 'spireChartProfileImageStyles';
    style.textContent = `
      #avatarDisplay{border-radius:50%!important;overflow:hidden!important;aspect-ratio:1/1!important;width:54px!important;height:54px!important;min-width:54px!important;background:#dceef7!important;border:2px solid #fff!important;outline:1px solid #7eafc5!important;color:#176780!important;font-weight:900!important}
      #avatarDisplay>img{width:100%!important;height:100%!important;object-fit:cover!important;border-radius:50%!important;display:block!important}
      .spire-chart-pcp-row{display:flex!important;align-items:center!important;gap:7px!important;margin:4px 0 5px!important;padding:5px!important;border:1px solid #bdd7e3!important;border-radius:4px!important;background:linear-gradient(135deg,#f8fdff,#eef8fc)!important}
      .spire-chart-pcp-photo{position:relative!important;width:42px!important;height:42px!important;min-width:42px!important;border-radius:50%!important;border:2px solid #fff!important;outline:1px solid #78a9c0!important;overflow:hidden!important;padding:0!important;background:#d9edf6!important;color:#156789!important;display:grid!important;place-items:center!important;cursor:pointer!important;font-size:10px!important;font-weight:900!important}
      .spire-chart-pcp-photo img{width:100%!important;height:100%!important;object-fit:cover!important;border-radius:50%!important;display:block!important}
      .spire-chart-pcp-photo i{position:absolute;right:-1px;bottom:-1px;width:15px;height:15px;border-radius:50%;display:grid;place-items:center;background:#0878b5;color:#fff;font-size:11px;font-style:normal;border:1px solid #fff}
      .spire-chart-pcp-copy{min-width:0;display:flex;flex-direction:column;line-height:1.15}
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

  function renderClientPhoto(url, documentId) {
    const avatar = document.querySelector('#avatarDisplay');
    if (!avatar) return;
    if (!url) {
      const durable = avatar.querySelector('img[data-spire-durable-client-photo]');
      if (durable) avatar.textContent = initials(patientName(), 'SS');
      return;
    }
    const existing = avatar.querySelector('img[data-spire-durable-client-photo]');
    if (existing && existing.dataset.documentId === documentId && existing.src === url) return;
    avatar.innerHTML = `<img data-spire-durable-client-photo data-document-id="${String(documentId).replace(/["<>]/g, '')}" src="${url}" alt="${patientName().replace(/["<>]/g, '')} profile photo">`;
    avatar.title = 'Client chart photo — click to update';
  }

  function removeLegacyPcpPhoto() {
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

    let row = group.querySelector('[data-spire-chart-pcp-photo]');
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

  function renderPcpPhoto(url, documentId) {
    const row = ensurePcpRow();
    if (!row) return;
    const button = row.querySelector('[data-spire-pcp-photo-button]');
    if (!button) return;
    const existing = button.querySelector('img[data-spire-durable-pcp-photo]');
    const initialsNode = button.querySelector('[data-spire-pcp-initials]');
    if (!url) {
      existing?.remove();
      if (initialsNode) initialsNode.hidden = false;
      return;
    }
    if (!existing || existing.dataset.documentId !== documentId || existing.src !== url) {
      existing?.remove();
      const image = document.createElement('img');
      image.dataset.spireDurablePcpPhoto = '1';
      image.dataset.documentId = documentId;
      image.alt = `${pcpName()} photo`;
      image.src = url;
      button.insertBefore(image, button.firstChild);
    }
    if (initialsNode) initialsNode.hidden = true;
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
      if (!file.type.startsWith('image/')) return reject(new Error('Choose a JPG, PNG, or WebP image.'));
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
    busyNode?.classList.add('spire-chart-photo-saving');
    try {
      const dataBase64 = await compressImage(file);
      const category = kind === 'client' ? CLIENT_CATEGORY : PCP_CATEGORY;
      const title = kind === 'client' ? CLIENT_TITLE : pcpDocumentTitle();
      const documents = await listPhotoDocuments(patient, category);
      const existing = chooseDocument(documents, kind);
      if (existing?.id) {
        await apiJson(`/api/spire/patients/${encodeURIComponent(patient)}/documents/${encodeURIComponent(existing.id)}/versions`, {
          method: 'POST',
          body: JSON.stringify({
            dataBase64,
            mimeType: 'image/jpeg',
            changeReason: kind === 'client' ? 'Updated client chart profile photo' : `Updated PCP photo for ${pcpName()}`,
          }),
        });
      } else {
        await apiJson(`/api/spire/patients/${encodeURIComponent(patient)}/documents`, {
          method: 'POST',
          body: JSON.stringify({
            title,
            category,
            mimeType: 'image/jpeg',
            dataBase64,
            description: kind === 'client'
              ? 'Current S.P.I.R.E. client chart profile photograph.'
              : `Primary care provider photograph for this client chart: ${pcpName()}.`,
            sensitivity: 'CLINICAL',
            source: 'SPIRE_CHART_PROFILE',
          }),
        });
      }
      showMessage(kind === 'client'
        ? 'Client photo saved securely to this client chart.'
        : 'PCP photo saved securely to this client chart.', 'success');
      await refresh(true);
    } catch (error) {
      const message = error?.status === 403
        ? 'Your role can view this chart but does not have permission to change clinical profile photos.'
        : (error?.message || 'The chart photo could not be saved.');
      window.alert(message);
    } finally {
      busyNode?.classList.remove('spire-chart-photo-saving');
    }
  }

  async function loadKind(kind, patient) {
    const category = kind === 'client' ? CLIENT_CATEGORY : PCP_CATEGORY;
    const documents = await listPhotoDocuments(patient, category);
    const document = chooseDocument(documents, kind);
    if (!document?.id) {
      revokeUrl(kind);
      if (kind === 'pcp') renderPcpPhoto('', '');
      else renderClientPhoto('', '');
      return;
    }

    const currentId = kind === 'client' ? clientDocumentId : pcpDocumentId;
    const currentUrl = kind === 'client' ? clientObjectUrl : pcpObjectUrl;
    if (currentId === String(document.id) && currentUrl) {
      if (kind === 'client') renderClientPhoto(currentUrl, currentId);
      else renderPcpPhoto(currentUrl, currentId);
      return;
    }

    const blob = await fetchPhotoBlob(patient, document.id);
    revokeUrl(kind);
    const url = URL.createObjectURL(blob);
    if (kind === 'client') {
      clientObjectUrl = url;
      clientDocumentId = String(document.id);
      renderClientPhoto(url, clientDocumentId);
    } else {
      pcpObjectUrl = url;
      pcpDocumentId = String(document.id);
      renderPcpPhoto(url, pcpDocumentId);
    }
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
      await Promise.all([
        loadKind('client', patient).catch((error) => console.warn('[SPIRE profile images] client photo load failed', error)),
        loadKind('pcp', patient).catch((error) => console.warn('[SPIRE profile images] PCP photo load failed', error)),
      ]);
      if (force) {
        ensurePcpRow();
        ensureClientPhotoInput();
      }
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
    window.addEventListener('beforeunload', () => {
      revokeUrl('client');
      revokeUrl('pcp');
    });
    window.__SPIRE_CHART_PROFILE_IMAGES = Object.freeze({
      marker: 'SPIRE_CHART_PROFILE_IMAGES_V1',
      storage: 'patient-scoped secure clinical documents',
      clientCategory: CLIENT_CATEGORY,
      pcpCategory: PCP_CATEGORY,
      refresh: () => refresh(true),
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
