(() => {
  'use strict';

  // SPIRE_USER_WORKSPACE_PREFERENCES_V4
  // Theme #21 is the exact Client Station visual system. Fullscreen is a separate
  // user preference and defaults to ON. Browsers require a user gesture before
  // entering fullscreen, so SPIRE arms the first interaction to enter fullscreen
  // automatically when that preference is enabled.
  const BASE_KEYS = Object.freeze({
    preset: 'spire:accessibility:preset',
    mode: 'spire:accessibility:mode',
    custom: 'spire:accessibility:custom-colors',
    cursor: 'spire:accessibility:cursor',
    fontSize: 'spire:accessibility:font-size',
    fullscreen: 'spire:accessibility:fullscreen'
  });
  const SESSION_KEY = 'sulandra:employee:session';

  const PRESETS = Object.freeze({
    classicRed: { title:'#0f172a', toolbar:'#990000', background:'#f0f4f8', card:'#ffffff', text:'#000000' },
    clinicalDark: { title:'#020617', toolbar:'#1e293b', background:'#0f172a', card:'#1e293b', text:'#f8fafc' },
    midnightSlate: { title:'#1e293b', toolbar:'#334155', background:'#475569', card:'#1e293b', text:'#f1f5f9' },
    emeraldHealth: { title:'#064e3b', toolbar:'#047857', background:'#ecfdf5', card:'#ffffff', text:'#064e3b' },
    oceanBlue: { title:'#1e40af', toolbar:'#2563eb', background:'#eff6ff', card:'#ffffff', text:'#1e3a8a' },
    warmSepia: { title:'#78350f', toolbar:'#b45309', background:'#fef3c7', card:'#fffbeb', text:'#451a03' },
    epicTeal: { title:'#0f766e', toolbar:'#115e59', background:'#f0fdfa', card:'#ffffff', text:'#134e4a' },
    monoHighContrast: { title:'#000000', toolbar:'#333333', background:'#ffffff', card:'#ffffff', text:'#000000' },
    colorblindSafe: { title:'#1d4ed8', toolbar:'#b45309', background:'#fef9c3', card:'#ffffff', text:'#1e293b' },
    vibrantLavender: { title:'#581c87', toolbar:'#7e22ce', background:'#f3e8ff', card:'#ffffff', text:'#3b0764' },
    crimsonNight: { title:'#450a0a', toolbar:'#7f1d1d', background:'#18181b', card:'#27272a', text:'#fafafa' },
    arcticFrost: { title:'#164e63', toolbar:'#0891b2', background:'#ecfeff', card:'#ffffff', text:'#164e63' },
    goldenSunrise: { title:'#713f12', toolbar:'#ca8a04', background:'#fefce8', card:'#ffffff', text:'#422006' },
    cyberpunkNeon: { title:'#111827', toolbar:'#6d28d9', background:'#030712', card:'#111827', text:'#e0f2fe' },
    retroVintage: { title:'#57534e', toolbar:'#78716c', background:'#f5f5dc', card:'#fffdf5', text:'#3f3f2f' },
    steelGray: { title:'#1f2937', toolbar:'#4b5563', background:'#e5e7eb', card:'#f9fafb', text:'#111827' },
    coralSunset: { title:'#9f1239', toolbar:'#ea580c', background:'#fff1f2', card:'#ffffff', text:'#881337' },
    mintFresh: { title:'#065f46', toolbar:'#0d9488', background:'#ecfdf5', card:'#ffffff', text:'#064e3b' },
    royalAmethyst: { title:'#4c1d95', toolbar:'#6d28d9', background:'#f5f3ff', card:'#ffffff', text:'#3b0764' },
    solarizedLight: { title:'#073642', toolbar:'#268bd2', background:'#fdf6e3', card:'#eee8d5', text:'#073642' },
    clientStation: {
      title:'#0f172a', toolbar:'#f4510b', background:'#eaf7fb', card:'#ffffff', text:'#173c50',
      cyan:'#5bd0e7', cyan2:'#dff8fc', ice:'#eaf7fb', panel:'#f8fdff', line:'#b7d3df', line2:'#d4e4eb',
      nav:'#082f49', nav2:'#0b4f73', purple:'#7c3db5'
    }
  });

  let navigating = false;
  let deliberateFullscreenExit = false;
  let fullscreenArmed = false;

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
    return String(user.id || user.userId || user.sub || user.email || user.username || 'anonymous').trim().toLowerCase();
  }

  function scopedKey(base) {
    const scope = userScope();
    return scope && scope !== 'anonymous' ? `${base}:user:${scope}` : base;
  }

  function getPreference(name) {
    const base = BASE_KEYS[name] || name;
    const scoped = scopedKey(base);
    try {
      const value = localStorage.getItem(scoped);
      if (value != null) return value;
      const legacy = localStorage.getItem(base);
      if (legacy != null && scoped !== base) localStorage.setItem(scoped, legacy);
      return legacy;
    } catch { return null; }
  }

  function setPreference(name, value) {
    const base = BASE_KEYS[name] || name;
    const scoped = scopedKey(base);
    try {
      localStorage.setItem(scoped, String(value));
      localStorage.setItem(base, String(value));
    } catch {}
  }

  function removePreference(name) {
    const base = BASE_KEYS[name] || name;
    try {
      localStorage.removeItem(scopedKey(base));
      localStorage.removeItem(base);
    } catch {}
  }

  function parseJson(value) { try { return value ? JSON.parse(value) : null; } catch { return null; } }

  function currentPalette() {
    if (getPreference('mode') === 'custom') {
      const custom = parseJson(getPreference('custom'));
      if (custom) return {
        title: custom.title || '#0f172a', toolbar: custom.toolbar || '#990000',
        background: custom.background || '#f0f4f8', card:'#ffffff', text: custom.text || '#000000'
      };
    }
    return PRESETS[getPreference('preset') || 'classicRed'] || PRESETS.classicRed;
  }

  function applyVisualPreferences() {
    const palette = currentPalette();
    const root = document.documentElement;
    const pairs = {
      '--title-bg': palette.title, '--toolbar-bg': palette.toolbar, '--main-bg': palette.background,
      '--workspace-card-bg': palette.card, '--text-color': palette.text,
      '--spire-title-bg': palette.title, '--spire-toolbar-bg': palette.toolbar,
      '--spire-page-bg': palette.background, '--spire-card-bg': palette.card, '--spire-text': palette.text
    };
    if (palette === PRESETS.clientStation || getPreference('preset') === 'clientStation') {
      Object.assign(pairs, {
        '--navy': palette.nav, '--navy2': palette.nav2, '--cyan': palette.cyan, '--cyan2': palette.cyan2,
        '--ice': palette.ice, '--panel': palette.panel, '--line': palette.line, '--line2': palette.line2,
        '--ink': palette.text, '--purple': palette.purple
      });
    }
    Object.entries(pairs).forEach(([key, value]) => value && root.style.setProperty(key, value));

    const fontSize = getPreference('fontSize') || '13px';
    if (['12px','13px','14px','16px'].includes(fontSize)) root.style.setProperty('--base-font-size', fontSize);

    const cursor = getPreference('cursor') || 'default';
    let style = document.getElementById('spireSharedCursorStyle');
    if (cursor === 'default') style?.remove();
    else if (['crosshair','help','pointer'].includes(cursor)) {
      if (!style) { style = document.createElement('style'); style.id = 'spireSharedCursorStyle'; document.head.appendChild(style); }
      style.textContent = `body, body * { cursor:${cursor} !important; }`;
    }
    root.dataset.spirePreset = getPreference('preset') || 'classicRed';
  }

  function setPreset(name) {
    const preset = PRESETS[name] ? name : 'classicRed';
    setPreference('preset', preset);
    setPreference('mode', 'preset');
    removePreference('custom');
    applyVisualPreferences();
    return preset;
  }

  function setCustomColors(values) {
    setPreference('custom', JSON.stringify(values || {}));
    setPreference('mode', 'custom');
    applyVisualPreferences();
  }

  function fullscreenDocument() {
    try {
      if (window.top && window.top !== window && window.top.document) return window.top.document;
    } catch {}
    return document;
  }

  function fullscreenPreferred() {
    const stored = getPreference('fullscreen');
    return stored == null ? true : stored !== '0';
  }

  function syncFullscreenButtons() {
    const targetDocument = fullscreenDocument();
    const active = Boolean(targetDocument.fullscreenElement);
    document.querySelectorAll('[data-spire-fullscreen-control],#spireFullscreenControl').forEach((button) => {
      button.textContent = active ? '🗗' : '⛶';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? 'Exit full screen' : 'Open S.P.I.R.E. full screen');
      button.setAttribute('title', active ? 'Exit full screen' : (fullscreenPreferred() ? 'Full screen preferred' : 'Open full screen'));
    });
  }

  async function requestFullscreen({ persist = true } = {}) {
    if (persist) setPreference('fullscreen', '1');
    const targetDocument = fullscreenDocument();
    if (targetDocument.fullscreenElement) { syncFullscreenButtons(); return true; }
    const element = targetDocument.documentElement;
    if (!element?.requestFullscreen) { syncFullscreenButtons(); return false; }
    try {
      await element.requestFullscreen({ navigationUI: 'hide' });
      syncFullscreenButtons();
      return true;
    } catch {
      syncFullscreenButtons();
      return false;
    }
  }

  async function exitFullscreen({ persist = true } = {}) {
    if (persist) setPreference('fullscreen', '0');
    deliberateFullscreenExit = true;
    const targetDocument = fullscreenDocument();
    if (targetDocument.fullscreenElement && targetDocument.exitFullscreen) {
      try { await targetDocument.exitFullscreen(); } catch {}
    }
    deliberateFullscreenExit = false;
    syncFullscreenButtons();
  }

  async function toggleFullscreenPreference() {
    const targetDocument = fullscreenDocument();
    if (targetDocument.fullscreenElement) return exitFullscreen({ persist: true });
    return requestFullscreen({ persist: true });
  }

  function armPreferredFullscreen() {
    if (fullscreenArmed || !fullscreenPreferred() || fullscreenDocument().fullscreenElement) return;
    fullscreenArmed = true;
    const attempt = () => {
      if (!fullscreenPreferred() || fullscreenDocument().fullscreenElement) return cleanup();
      requestFullscreen({ persist: false }).finally(cleanup);
    };
    const cleanup = () => {
      document.removeEventListener('pointerdown', attempt, true);
      document.removeEventListener('keydown', attempt, true);
      fullscreenArmed = false;
    };
    document.addEventListener('pointerdown', attempt, true);
    document.addEventListener('keydown', attempt, true);
  }

  function bindFullscreenControls() {
    document.querySelectorAll('[data-spire-fullscreen-control],#spireFullscreenControl').forEach((button) => {
      if (button.dataset.spireFullscreenBound === 'true') return;
      button.dataset.spireFullscreenBound = 'true';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFullscreenPreference().catch(() => {});
      });
    });
    syncFullscreenButtons();
  }

  function handleFullscreenChange() {
    const targetDocument = fullscreenDocument();
    if (!targetDocument.fullscreenElement && !navigating && !deliberateFullscreenExit && fullscreenPreferred()) {
      armPreferredFullscreen();
    }
    syncFullscreenButtons();
  }

  function applyAll() {
    applyVisualPreferences();
    bindFullscreenControls();
    armPreferredFullscreen();
  }

  window.SpireUserPreferences = Object.freeze({
    keys: BASE_KEYS, presets: PRESETS, userScope, getPreference, setPreference, removePreference,
    setPreset, setCustomColors, apply: applyAll, applyVisualPreferences, fullscreenPreferred,
    requestFullscreen, exitFullscreen, toggleFullscreenPreference, syncFullscreenButtons, armPreferredFullscreen,
    setFullscreenPreferred(value) { setPreference('fullscreen', value ? '1' : '0'); syncFullscreenButtons(); if (value) armPreferredFullscreen(); }
  });
  window.toggleSpireFullscreenPreference = toggleFullscreenPreference;

  try { fullscreenDocument().addEventListener('fullscreenchange', handleFullscreenChange); } catch {}
  window.addEventListener('beforeunload', () => { navigating = true; });
  window.addEventListener('storage', (event) => {
    if (Object.values(BASE_KEYS).some((base) => event.key === base || event.key?.startsWith(`${base}:user:`))) applyVisualPreferences();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyAll, { once: true });
  else applyAll();
})();
