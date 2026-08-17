(() => {
  'use strict';

  // SPIRE_USER_PROFILE_PHOTO_V3
  // Isolated signed-in user profile-photo bridge for Spire profile, Client Station,
  // top navigation, and current-user clinical note author surfaces.
  // Intentionally event-driven/CSS-driven: no MutationObserver and no clinical workspace ownership.

  const LEGACY_PROFILE_KEY = 'spireUserProfile';
  const PHOTO_KEY = 'spire:user-profile-photo';
  const SESSION_KEY = 'sulandra:employee:session';
  const INPUT_ID = 'userAvatarUpload';
  const PREVIEW_ID = 'modalUserAvatarPreview';
  const STYLE_ID = 'spireUserProfilePhotoStyle';
  const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
  const MAX_EDGE = 512;

  function readSession() {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        const value = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
        if (value && typeof value === 'object') return value;
      } catch {}
    }
    return {};
  }

  function userScope() {
    const session = readSession();
    const user = session.user || session.session || session;
    return String(user.id || user.userId || user.sub || user.email || user.username || 'anonymous')
      .trim()
      .toLowerCase();
  }

  function scopedPhotoKey() {
    const scope = userScope();
    return scope && scope !== 'anonymous' ? `${PHOTO_KEY}:user:${scope}` : PHOTO_KEY;
  }

  function readLegacyProfile() {
    try {
      const value = JSON.parse(localStorage.getItem(LEGACY_PROFILE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function savedPhoto() {
    try {
      const scoped = localStorage.getItem(scopedPhotoKey());
      if (scoped) return scoped;
      const shared = localStorage.getItem(PHOTO_KEY);
      if (shared) return shared;
    } catch {}
    return String(readLegacyProfile().avatar || '');
  }

  function persistPhoto(dataUrl) {
    if (!dataUrl) return false;
    try {
      localStorage.setItem(scopedPhotoKey(), dataUrl);
      localStorage.setItem(PHOTO_KEY, dataUrl);
      const profile = readLegacyProfile();
      localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify({ ...profile, avatar: dataUrl }));
      return true;
    } catch (error) {
      console.error('Spire profile photo could not be saved locally.', error);
      return false;
    }
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html[data-spire-user-photo-ready="true"] #modalUserAvatarPreview,
      html[data-spire-user-photo-ready="true"] #topUserAvatarDisplay,
      html[data-spire-user-photo-ready="true"] #stationAvatar,
      html[data-spire-user-photo-ready="true"] #activeAuthorAvatar,
      html[data-spire-user-photo-ready="true"] .notes-editor-pane .note-author-banner > .note-author-avatar,
      html[data-spire-user-photo-ready="true"] #accessibilityModal .note-author-banner > .note-author-avatar,
      html[data-spire-user-photo-ready="true"] #notes-view[data-spire-note-composer-v2="1"] .snc-top:has(#sncBlank) > .snc-avatar {
        background-image:var(--spire-user-profile-photo)!important;
        background-size:cover!important;
        background-position:center!important;
        background-repeat:no-repeat!important;
        color:transparent!important;
        -webkit-text-fill-color:transparent!important;
        text-shadow:none!important;
        font-size:0!important;
        line-height:0!important;
        overflow:hidden!important;
      }
      html[data-spire-user-photo-ready="true"] #modalUserAvatarPreview::before,
      html[data-spire-user-photo-ready="true"] #modalUserAvatarPreview::after,
      html[data-spire-user-photo-ready="true"] #topUserAvatarDisplay::before,
      html[data-spire-user-photo-ready="true"] #topUserAvatarDisplay::after,
      html[data-spire-user-photo-ready="true"] #stationAvatar::before,
      html[data-spire-user-photo-ready="true"] #stationAvatar::after,
      html[data-spire-user-photo-ready="true"] #activeAuthorAvatar::before,
      html[data-spire-user-photo-ready="true"] #activeAuthorAvatar::after,
      html[data-spire-user-photo-ready="true"] .notes-editor-pane .note-author-banner > .note-author-avatar::before,
      html[data-spire-user-photo-ready="true"] .notes-editor-pane .note-author-banner > .note-author-avatar::after,
      html[data-spire-user-photo-ready="true"] #accessibilityModal .note-author-banner > .note-author-avatar::before,
      html[data-spire-user-photo-ready="true"] #accessibilityModal .note-author-banner > .note-author-avatar::after,
      html[data-spire-user-photo-ready="true"] #notes-view[data-spire-note-composer-v2="1"] .snc-top:has(#sncBlank) > .snc-avatar::before,
      html[data-spire-user-photo-ready="true"] #notes-view[data-spire-note-composer-v2="1"] .snc-top:has(#sncBlank) > .snc-avatar::after {
        content:none!important;
      }
    `;
    document.head.appendChild(style);
  }

  function activatePhotoCss(dataUrl) {
    if (!dataUrl) return;
    installStyles();
    document.documentElement.style.setProperty('--spire-user-profile-photo', `url(${JSON.stringify(dataUrl)})`);
    document.documentElement.dataset.spireUserPhotoReady = 'true';
  }

  function paintPhoto(element, dataUrl) {
    if (!element || !dataUrl) return;
    element.style.backgroundImage = `url(${JSON.stringify(dataUrl)})`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
    element.style.backgroundRepeat = 'no-repeat';
    element.textContent = '';
    element.dataset.spireCurrentUserPhoto = 'true';
    element.setAttribute('aria-label', 'Signed-in user profile photo');
  }

  function currentUserAvatarElements() {
    return Array.from(document.querySelectorAll([
      `#${PREVIEW_ID}`,
      '#topUserAvatarDisplay',
      '#stationAvatar',
      '#activeAuthorAvatar',
      '.notes-editor-pane .note-author-banner > .note-author-avatar',
      '#accessibilityModal .note-author-banner > .note-author-avatar',
    ].join(',')));
  }

  function restorePhoto() {
    const photo = savedPhoto();
    if (!photo) return false;
    activatePhotoCss(photo);
    currentUserAvatarElements().forEach(element => paintPhoto(element, photo));
    return true;
  }

  function showMessage(message, tone = 'info') {
    const preview = document.getElementById(PREVIEW_ID);
    const host = preview?.parentElement?.parentElement || preview?.parentElement;
    if (!host) return;
    let node = document.getElementById('spireUserPhotoStatus');
    if (!node) {
      node = document.createElement('div');
      node.id = 'spireUserPhotoStatus';
      node.style.cssText = 'margin-top:8px;font-size:11px;font-weight:700;line-height:1.35;';
      host.appendChild(node);
    }
    node.style.color = tone === 'error' ? '#b91c1c' : tone === 'success' ? '#15803d' : '#475569';
    node.textContent = message;
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => node?.remove(), 5500);
  }

  function normalizeSpireBranding(root = document.getElementById('accessibilityModal')) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.nodeValue?.includes('S.P.I.R.E.')) {
        node.nodeValue = node.nodeValue.replaceAll('S.P.I.R.E.', 'Spire');
      }
    }
  }

  function ensureInput() {
    if (!document.getElementById('accessibilityModal')) return null;
    let input = document.getElementById(INPUT_ID);
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = INPUT_ID;
      input.hidden = true;
      input.setAttribute('aria-hidden', 'true');
      document.body.appendChild(input);
    }
    input.type = 'file';
    input.accept = 'image/jpeg,image/png';
    return input;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('The selected image could not be read.'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The selected file is not a readable image.'));
      image.src = dataUrl;
    });
  }

  async function optimizePhoto(file) {
    if (!file) throw new Error('No image was selected.');
    if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Please select a JPG or PNG image.');
    if (file.size > MAX_SOURCE_BYTES) throw new Error('Please select an image smaller than 12 MB.');

    const source = await fileToDataUrl(file);
    const image = await loadImage(source);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return source;
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.88);
  }

  async function handleSelection(event) {
    const input = event.currentTarget || event.target;
    const file = input?.files?.[0];
    if (!file) return;
    showMessage('Processing profile photo…');
    try {
      const dataUrl = await optimizePhoto(file);
      activatePhotoCss(dataUrl);
      paintPhoto(document.getElementById(PREVIEW_ID), dataUrl);
      if (!persistPhoto(dataUrl)) throw new Error('The photo could not be saved in this browser.');

      try { window.loadUserProfile?.(); } catch {}
      restorePhoto();
      window.dispatchEvent(new CustomEvent('spire:user-profile-photo-change', {
        detail: { userScope: userScope(), source: 'profile-upload' }
      }));
      showMessage('Profile photo saved and synced across this Spire workspace.', 'success');
    } catch (error) {
      console.error('Spire profile photo upload failed.', error);
      showMessage(error?.message || 'Unable to save the selected profile photo.', 'error');
    } finally {
      if (input) input.value = '';
    }
  }

  function bindInput() {
    const input = ensureInput();
    if (!input || input.dataset.spireUserPhotoBound === 'true') return input;
    input.dataset.spireUserPhotoBound = 'true';
    input.addEventListener('change', handleSelection);
    return input;
  }

  function refreshProfileUi() {
    bindInput();
    normalizeSpireBranding();
    restorePhoto();
  }

  function scheduleRestore() {
    for (const delay of [0, 120, 400, 1000, 2200]) {
      setTimeout(() => restorePhoto(), delay);
    }
  }

  function init() {
    installStyles();
    restorePhoto();
    bindInput();
    normalizeSpireBranding();
    scheduleRestore();

    document.getElementById('tabProfileBtn')?.addEventListener('click', () => setTimeout(refreshProfileUi, 0));
    document.getElementById('tabPresetBtn')?.addEventListener('click', () => setTimeout(() => normalizeSpireBranding(), 0));
    document.querySelectorAll('.user-profile-trigger,[data-user-profile-trigger]').forEach(button => {
      button.addEventListener('click', () => scheduleRestore());
    });

    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.chart-tab,.summary-sub-tab,#topStation,#openSelected,#openSecureChat,.user-profile-trigger,[data-user-profile-trigger]')) return;
      scheduleRestore();
    });

    window.addEventListener('pageshow', scheduleRestore);
    window.addEventListener('spire:user-profile-photo-change', () => restorePhoto());
    window.addEventListener('storage', event => {
      if (event.key === scopedPhotoKey() || event.key === PHOTO_KEY || event.key === LEGACY_PROFILE_KEY) restorePhoto();
    });
  }

  window.SpireUserProfilePhoto = Object.freeze({
    init,
    restore: restorePhoto,
    bindInput,
    normalizeSpireBranding,
    savedPhoto,
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
