(() => {
  'use strict';

  // SPIRE_CLIENT_PHOTO_DISPLAY_V1
  // Isolated patient-photo presentation only. This runtime intentionally does not
  // touch MAR/eMAR rendering, medication APIs, chart tab state, or MAR publication.

  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const photoCache = new Map();
  const pending = new Map();
  let chartPhotoUrl = '';
  let chartPhotoSha = '';
  let chartPatientId = '';
  let avatarObserver = null;
  let stationObserver = null;
  let previewObserver = null;

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
    return hash.get('patient')
      || hash.get('patientId')
      || query.get('patient')
      || query.get('patientId')
      || sessionStorage.getItem('spire:patientId')
      || '';
  }

  async function fetchJson(path) {
    const headers = new Headers({ Accept: 'application/json' });
    const accessToken = token();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(API_BASE + path, { headers, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.error || payload?.message || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload?.data ?? payload;
  }

  function blobDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to prepare the saved client photo for display.'));
      reader.onload = () => {
        const value = String(reader.result || '');
        if (!/^data:image\//i.test(value)) return reject(new Error('Saved client photo did not decode as image content.'));
        resolve(value);
      };
      reader.readAsDataURL(blob);
    });
  }

  async function fetchClientPhoto(patient) {
    const id = clean(patient);
    if (!id) return null;
    if (photoCache.has(id)) return photoCache.get(id);
    if (pending.has(id)) return pending.get(id);

    const request = (async () => {
      try {
        const metadata = await fetchJson(`/api/spire/patients/${encodeURIComponent(id)}/profile-images`);
        const client = metadata?.client;
        if (!client?.sha256) {
          photoCache.set(id, null);
          return null;
        }

        const headers = new Headers({ Accept: 'image/*' });
        const accessToken = token();
        if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
        const response = await fetch(`${API_BASE}/api/spire/patients/${encodeURIComponent(id)}/profile-images/client/content?v=${encodeURIComponent(client.sha256)}`, {
          headers,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Unable to load saved client photo (${response.status})`);
        const blob = await response.blob();
        if (!/^image\//i.test(blob.type)) throw new Error('Saved client photo endpoint did not return image content.');
        const dataUrl = await blobDataUrl(blob);
        const result = { dataUrl, sha256: String(client.sha256) };
        photoCache.set(id, result);
        return result;
      } catch (error) {
        console.warn('[SPIRE client photo display]', id, error);
        return null;
      } finally {
        pending.delete(id);
      }
    })();

    pending.set(id, request);
    return request;
  }

  function ensureStyles() {
    if (document.getElementById('spireClientPhotoDisplayStyles')) return;
    const style = document.createElement('style');
    style.id = 'spireClientPhotoDisplayStyles';
    style.textContent = `
      .client-photo[data-spire-client-photo="1"]{overflow:hidden!important;background:#d9e3e7!important}
      .client-photo[data-spire-client-photo="1"] img{width:100%!important;height:100%!important;display:block!important;object-fit:cover!important;object-position:center!important;border-radius:50%!important}
      .spire-client-preview-photo{width:32px;height:32px;min-width:32px;border-radius:50%;object-fit:cover;object-position:center;border:1px solid #8db6c5;background:#d9e3e7}
      #avatarDisplay[data-spire-client-photo-display="1"]{object-fit:cover!important;object-position:center!important;border-radius:50%!important;overflow:hidden!important}
      #avatarDisplay[data-spire-client-photo-display="1"] > img{width:100%!important;height:100%!important;display:block!important;object-fit:cover!important;object-position:center!important;border-radius:50%!important}
    `;
    document.head.appendChild(style);
  }

  function applyChartImage(dataUrl, sha256) {
    const avatar = document.querySelector('#avatarDisplay');
    if (!avatar || !dataUrl) return false;
    chartPhotoUrl = dataUrl;
    chartPhotoSha = String(sha256 || '');

    if (avatar instanceof HTMLImageElement) {
      avatar.dataset.spireClientPhotoDisplay = '1';
      avatar.dataset.spireClientPhotoSha = chartPhotoSha;
      avatar.alt = 'Client profile photo';
      if (avatar.src !== dataUrl) avatar.src = dataUrl;
      bindAvatarGuard(avatar);
      return true;
    }

    avatar.dataset.spireClientPhotoDisplay = '1';
    avatar.dataset.spireClientPhotoSha = chartPhotoSha;
    let image = avatar.querySelector('img[data-spire-client-photo-display="1"]');
    if (!image) {
      avatar.replaceChildren();
      image = document.createElement('img');
      image.dataset.spireClientPhotoDisplay = '1';
      image.alt = 'Client profile photo';
      avatar.appendChild(image);
    }
    if (image.src !== dataUrl) image.src = dataUrl;
    return true;
  }

  function bindAvatarGuard(avatar) {
    if (!(avatar instanceof HTMLImageElement)) return;
    avatarObserver?.disconnect();
    avatarObserver = new MutationObserver(() => {
      if (!chartPhotoUrl || !avatar.isConnected) return;
      if (avatar.src !== chartPhotoUrl) {
        avatar.dataset.spireClientPhotoDisplay = '1';
        avatar.dataset.spireClientPhotoSha = chartPhotoSha;
        avatar.src = chartPhotoUrl;
      }
    });
    avatarObserver.observe(avatar, { attributes: true, attributeFilter: ['src'] });
  }

  async function refreshChartPhoto(force = false) {
    const id = patientId();
    if (!id || !document.querySelector('#avatarDisplay')) return;
    if (force || id !== chartPatientId) {
      chartPatientId = id;
      photoCache.delete(id);
    }
    const photo = await fetchClientPhoto(id);
    if (photo?.dataUrl) applyChartImage(photo.dataUrl, photo.sha256);
  }

  function scheduleChartRefreshes() {
    [0, 350, 1000, 2500, 6000].forEach((delay, index) => {
      window.setTimeout(() => refreshChartPhoto(index === 0).catch(() => {}), delay);
    });
  }

  async function decorateStationRow(row) {
    if (!row || row.dataset.spireClientPhotoChecked === '1') return;
    const id = clean(row.dataset.clientId);
    if (!id) return;
    row.dataset.spireClientPhotoChecked = '1';
    const photo = await fetchClientPhoto(id);
    if (!photo?.dataUrl || !row.isConnected) return;
    const slot = row.querySelector('.client-photo');
    if (!slot) return;
    slot.dataset.spireClientPhoto = '1';
    slot.replaceChildren();
    const image = document.createElement('img');
    image.src = photo.dataUrl;
    image.alt = 'Client photo';
    slot.appendChild(image);
  }

  function decorateStationRows() {
    document.querySelectorAll('#stationClientBody .client-row[data-client-id]').forEach((row) => {
      decorateStationRow(row).catch(() => {});
    });
  }

  async function decoratePreview() {
    const host = document.querySelector('#clientPreview');
    const header = host?.querySelector('.preview-head');
    const id = clean(sessionStorage.getItem('spire:patientId'));
    if (!host || !header || !id) return;
    const photo = await fetchClientPhoto(id);
    if (!photo?.dataUrl || !header.isConnected) return;
    let image = header.querySelector('.spire-client-preview-photo');
    if (!image) {
      image = document.createElement('img');
      image.className = 'spire-client-preview-photo';
      image.alt = 'Client photo';
      header.insertBefore(image, header.firstChild);
    }
    if (image.src !== photo.dataUrl) image.src = photo.dataUrl;
  }

  function installStation() {
    const body = document.querySelector('#stationClientBody');
    if (!body) return false;
    decorateStationRows();
    stationObserver?.disconnect();
    stationObserver = new MutationObserver(() => decorateStationRows());
    stationObserver.observe(body, { childList: true, subtree: true });

    const preview = document.querySelector('#clientPreview');
    if (preview) {
      previewObserver?.disconnect();
      previewObserver = new MutationObserver(() => decoratePreview().catch(() => {}));
      previewObserver.observe(preview, { childList: true, subtree: false });
      decoratePreview().catch(() => {});
    }
    return true;
  }

  function install() {
    ensureStyles();
    installStation();
    scheduleChartRefreshes();
    window.addEventListener('hashchange', scheduleChartRefreshes);
    window.addEventListener('popstate', scheduleChartRefreshes);
    window.addEventListener('pageshow', () => {
      decorateStationRows();
      decoratePreview().catch(() => {});
      scheduleChartRefreshes();
    });
    window.__SPIRE_CLIENT_PHOTO_DISPLAY = Object.freeze({
      marker: 'SPIRE_CLIENT_PHOTO_DISPLAY_V1',
      refresh: () => {
        photoCache.clear();
        document.querySelectorAll('#stationClientBody .client-row').forEach((row) => delete row.dataset.spireClientPhotoChecked);
        decorateStationRows();
        decoratePreview().catch(() => {});
        refreshChartPhoto(true).catch(() => {});
      },
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
