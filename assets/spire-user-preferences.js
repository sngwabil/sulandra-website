(() => {
  'use strict';

  // SPIRE_USER_WORKSPACE_PREFERENCES_V1
  // Shared by the chart, Client Station and Secure Chat. These keys intentionally
  // match the existing master accessibility suite so every SPIRE surface inherits
  // the same saved look-and-feel.
  const KEYS = Object.freeze({
    preset: 'spire:accessibility:preset',
    mode: 'spire:accessibility:mode',
    custom: 'spire:accessibility:custom-colors',
    cursor: 'spire:accessibility:cursor',
    fontSize: 'spire:accessibility:font-size',
    fullscreen: 'spire:accessibility:fullscreen'
  });

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
    solarizedLight: { title:'#073642', toolbar:'#268bd2', background:'#fdf6e3', card:'#eee8d5', text:'#073642' }
  });

  const get = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const set = (key, value) => { try { localStorage.setItem(key, String(value)); } catch {} };
  const parseJson = (value) => { try { return value ? JSON.parse(value) : null; } catch { return null; } };

  function currentPalette() {
    const mode = get(KEYS.mode);
    if (mode === 'custom') {
      const custom = parseJson(get(KEYS.custom));
      if (custom) return {
        title: custom.title || '#0f172a', toolbar: custom.toolbar || '#990000',
        background: custom.background || '#f0f4f8', card:'#ffffff', text: custom.text || '#000000'
      };
    }
    return PRESETS[get(KEYS.preset) || 'classicRed'] || PRESETS.classicRed;
  }

  function applyVisualPreferences() {
    const palette = currentPalette();
    const root = document.documentElement;
    root.style.setProperty('--title-bg', palette.title);
    root.style.setProperty('--toolbar-bg', palette.toolbar);
    root.style.setProperty('--main-bg', palette.background);
    root.style.setProperty('--workspace-card-bg', palette.card);
    root.style.setProperty('--text-color', palette.text);
    root.style.setProperty('--spire-title-bg', palette.title);
    root.style.setProperty('--spire-toolbar-bg', palette.toolbar);
    root.style.setProperty('--spire-page-bg', palette.background);
    root.style.setProperty('--spire-card-bg', palette.card);
    root.style.setProperty('--spire-text', palette.text);

    const fontSize = get(KEYS.fontSize) || '13px';
    if (['12px','13px','14px','16px'].includes(fontSize)) root.style.setProperty('--base-font-size', fontSize);

    const cursor = get(KEYS.cursor) || 'default';
    let style = document.getElementById('spireSharedCursorStyle');
    if (cursor === 'default') style?.remove();
    else if (['crosshair','help','pointer'].includes(cursor)) {
      if (!style) { style = document.createElement('style'); style.id = 'spireSharedCursorStyle'; document.head.appendChild(style); }
      style.textContent = `body, body * { cursor:${cursor} !important; }`;
    }
    document.documentElement.dataset.spirePreset = get(KEYS.preset) || 'classicRed';
  }

  function fullscreenPreferred() {
    const stored = get(KEYS.fullscreen);
    // Full-screen workstation is the SPIRE default; the user may explicitly turn it off.
    return stored == null ? true : stored !== '0';
  }

  function syncFullscreenButtons() {
    const active = Boolean(document.fullscreenElement);
    document.querySelectorAll('[data-spire-fullscreen-control],#spireFullscreenControl').forEach((button) => {
      button.textContent = active ? '🗗' : '⛶';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? 'Exit full screen' : 'Open SPIRE full screen');
      button.setAttribute('title', active ? 'Exit full screen' : (fullscreenPreferred() ? 'Full screen preferred' : 'Open full screen'));
    });
  }

  async function requestFullscreen({ persist = true } = {}) {
    if (persist) set(KEYS.fullscreen, '1');
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) { syncFullscreenButtons(); return Boolean(document.fullscreenElement); }
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      syncFullscreenButtons();
      return true;
    } catch {
      syncFullscreenButtons();
      return false;
    }
  }

  async function exitFullscreen({ persist = true } = {}) {
    if (persist) set(KEYS.fullscreen, '0');
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch {}
    }
    syncFullscreenButtons();
  }

  async function toggleFullscreenPreference() {
    if (document.fullscreenElement) return exitFullscreen({ persist: true });
    return requestFullscreen({ persist: true });
  }

  function armPreferredFullscreen() {
    if (!fullscreenPreferred() || document.fullscreenElement) return;
    // Browsers do not permit a page to silently enter native fullscreen after a
    // reload/navigation. Try once, then use the user's very next gesture to honor
    // the saved preference without a popup or a second click.
    requestFullscreen({ persist: false }).catch(() => {});
    const reenter = () => {
      if (fullscreenPreferred() && !document.fullscreenElement) requestFullscreen({ persist: false }).catch(() => {});
      document.removeEventListener('pointerdown', reenter, true);
      document.removeEventListener('keydown', reenter, true);
    };
    document.addEventListener('pointerdown', reenter, true);
    document.addEventListener('keydown', reenter, true);
  }

  function bindFullscreenControls() {
    document.querySelectorAll('[data-spire-fullscreen-control],#spireFullscreenControl').forEach((button) => {
      if (button.dataset.spireFullscreenBound === 'true') return;
      button.dataset.spireFullscreenBound = 'true';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        toggleFullscreenPreference().catch(() => {});
      });
    });
    syncFullscreenButtons();
  }

  function applyAll() {
    applyVisualPreferences();
    bindFullscreenControls();
    armPreferredFullscreen();
  }

  window.SpireUserPreferences = Object.freeze({
    keys: KEYS,
    presets: PRESETS,
    apply: applyAll,
    applyVisualPreferences,
    fullscreenPreferred,
    requestFullscreen,
    exitFullscreen,
    toggleFullscreenPreference,
    syncFullscreenButtons,
    setFullscreenPreferred(value) { set(KEYS.fullscreen, value ? '1' : '0'); syncFullscreenButtons(); },
  });
  window.toggleSpireFullscreenPreference = toggleFullscreenPreference;

  document.addEventListener('fullscreenchange', syncFullscreenButtons);
  window.addEventListener('storage', (event) => {
    if (Object.values(KEYS).includes(event.key)) applyVisualPreferences();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyAll, { once: true });
  else applyAll();
})();
